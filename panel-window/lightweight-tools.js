/**
 * Pixie Panel — lightweight tools as top-level section panes.
 *
 * Design rules:
 * - Loaded only the first time a non-chat section is opened.
 * - No extra windows, no file indexing, no screen watchers. The optional
 *   clipboard history listener is gated by the privacy settings.
 * - Daily-life tools are local and UI-only. The only timer is the Pomodoro
 *   countdown, which runs only while a countdown is active.
 */

const COUCOU_POMODORO_MODES = {
  focus: { label: 'Focus', minutes: 25, seconds: 25 * 60 },
  short: { label: 'Short break', minutes: 5, seconds: 5 * 60 },
  long: { label: 'Long break', minutes: 15, seconds: 15 * 60 }
};

const COUCOU_CONVERTER_UNITS = {
  length: [
    { key: 'mm', label: 'Millimeter', factor: 0.001 },
    { key: 'cm', label: 'Centimeter', factor: 0.01 },
    { key: 'm', label: 'Meter', factor: 1 },
    { key: 'km', label: 'Kilometer', factor: 1000 },
    { key: 'in', label: 'Inch', factor: 0.0254 },
    { key: 'ft', label: 'Foot', factor: 0.3048 },
    { key: 'mi', label: 'Mile', factor: 1609.344 }
  ],
  weight: [
    { key: 'mg', label: 'Milligram', factor: 0.000001 },
    { key: 'g', label: 'Gram', factor: 0.001 },
    { key: 'kg', label: 'Kilogram', factor: 1 },
    { key: 'oz', label: 'Ounce', factor: 0.0283495 },
    { key: 'lb', label: 'Pound', factor: 0.453592 }
  ],
  temperature: [
    { key: 'C', label: 'Celsius' },
    { key: 'F', label: 'Fahrenheit' },
    { key: 'K', label: 'Kelvin' }
  ]
};

(function () {
  class LightweightTools {
    constructor(panelController) {
      this.panel = panelController;
      this.chatTab = panelController.chatTab;
      this.built = false;
      this.bound = false;
      this.els = {};
      this.pomodoroTimer = null;
      this.pomodoro = null;
      this.calcExpression = '0';
      this.calcLastResult = '0';
      this.calcAngle = 'deg';
      this.calcMemory = 0;

      this.notesSaveTimer = null;
      this.notesDirty = false;
      this.clipboardListenerBound = null;
      // Seed from saved history so a broadcast for an already-stored copy is
      // treated as a refresh, not a duplicate reaction.
      this.lastWatchedText = null;
      this.syncClipboardBaseline();

      this.panes = {
        flow: document.getElementById('tool-pane-flow'),
        focus: document.getElementById('tool-pane-focus'),
        reminders: document.getElementById('tool-pane-reminders'),
        todo: document.getElementById('tool-pane-todo'),
        notes: document.getElementById('tool-pane-notes'),
        calc: document.getElementById('tool-pane-calc'),
        convert: document.getElementById('tool-pane-convert'),
        context: document.getElementById('tool-pane-context'),
        clipboard: document.getElementById('tool-pane-clipboard'),
        colors: document.getElementById('tool-pane-colors'),
        markdown: document.getElementById('tool-pane-markdown'),
        snippets: document.getElementById('tool-pane-snippets')
      };
    }

    getSetting(path, fallback) {
      return this.panel.getSetting(path, fallback);
    }

    setSetting(path, value) {
      this.panel.setSetting(path, value);
    }

    react(action, data) {
      if (this.panel && typeof this.panel.reactToPanelAction === 'function') {
        this.panel.reactToPanelAction(action, data);
      }
    }

    escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    makeId() {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    formatRelativeTime(timestamp) {
      const time = Number(timestamp);
      if (!Number.isFinite(time) || time <= 0) return '';
      const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
      if (seconds < 60) return 'Just now';
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
      const date = new Date(time);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    invokeApp(channel, ...args) {
      if (!window.app || typeof window.app.invoke !== 'function') return Promise.resolve(null);
      try {
        return Promise.resolve(window.app.invoke(channel, ...args));
      } catch (error) {
        return Promise.resolve(null);
      }
    }

    toggleRow(id, path, label, description, fallback) {
      const checked = !!this.getSetting(path, fallback);
      const detail = description ? `<small>${description}</small>` : '';
      return `
        <div class="tool-row">
          <div class="tool-label">${label}${detail}</div>
          <label class="tool-switch" title="${label}">
            <input type="checkbox" id="${id}" data-setting="${path}" ${checked ? 'checked' : ''}>
            <span></span>
          </label>
        </div>
      `;
    }

    render() {
      if (this.built) return;

      if (this.panes.flow) {
        this.panes.flow.innerHTML = `
          <section class="tool-section">
            <div class="tool-btn-row" style="margin-top:0;">
              <button class="tool-btn primary" id="tool-flow-regen">Regenerate last answer</button>
              <button class="tool-btn" id="tool-flow-stop">Stop generation</button>
              <button class="tool-btn" id="tool-flow-clear-input">Clear input</button>
            </div>
          </section>
        `;
      }

      if (this.panes.focus) {
        const durations = this.getPomodoroDurations();
        this.panes.focus.innerHTML = `
          <section class="tool-section">
            <div class="focus-display">
              <div class="focus-time" id="tool-focus-time">25:00</div>
              <div class="focus-mode" id="tool-focus-mode">Focus</div>
              <div class="focus-progress"><span id="tool-focus-progress"></span></div>
              <div class="focus-cycle" id="tool-focus-cycle">0 focus blocks done</div>
            </div>

            <div class="tool-btn-row">
              <button class="tool-chip active" data-focus-mode="focus">${durations.focus}m Focus</button>
              <button class="tool-chip" data-focus-mode="short">${durations.short}m Break</button>
              <button class="tool-chip" data-focus-mode="long">${durations.long}m Break</button>
            </div>

            <div class="tool-row focus-duration-row">
              <div class="tool-label">Custom time</div>
              <div class="duration-inputs">
                <label>Focus <input class="tool-input" type="number" min="1" max="180" value="${durations.focus}" data-focus-duration="focus" aria-label="Focus minutes"></label>
                <label>Short <input class="tool-input" type="number" min="1" max="180" value="${durations.short}" data-focus-duration="short" aria-label="Short break minutes"></label>
                <label>Long <input class="tool-input" type="number" min="1" max="180" value="${durations.long}" data-focus-duration="long" aria-label="Long break minutes"></label>
              </div>
            </div>

            <div class="tool-btn-row">
              <button class="tool-btn primary" id="tool-focus-start">Start</button>
              <button class="tool-btn" id="tool-focus-reset">Reset</button>
            </div>

            <div class="tool-section-note" id="tool-focus-note"></div>
          </section>
        `;
      }

      if (this.panes.reminders) {
        this.panes.reminders.innerHTML = `
          <section class="tool-section" id="tool-reminders-section">
            <div class="tool-section-title">Reminders</div>
            <div class="tool-btn-row" style="margin-top:0;flex-wrap:nowrap;">
              <input class="tool-input" id="tool-reminder-title" type="text" placeholder="Remind me to..." aria-label="Reminder title">
              <input class="tool-input" id="tool-reminder-time" type="time" aria-label="Reminder time">
            </div>
            <div class="tool-btn-row">
              <select class="tool-input" id="tool-reminder-repeat" aria-label="Reminder repeat">
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="every-hour">Every hour</option>
              </select>
              <button class="tool-btn primary" id="tool-reminder-add">Set reminder</button>
            </div>
            <div class="todo-list" id="tool-reminder-list"></div>
            <div class="tool-section-note">Reminders pop up and ring with the alarm sound even when Pixie is closed.</div>
          </section>
        `;
      }

      if (this.panes.todo) {
        this.panes.todo.innerHTML = `
          <section class="tool-section">
            <div class="tool-btn-row" style="margin-top:0;flex-wrap:nowrap;">
              <input class="tool-input" id="tool-todo-input" type="text" placeholder="Add a task...">
              <button class="tool-btn primary" id="tool-todo-add">Add</button>
            </div>
            <div class="todo-list" id="tool-todo-list"></div>
            <div class="tool-btn-row">
              <button class="tool-btn" id="tool-todo-clear-done">Clear completed</button>
            </div>
          </section>
        `;
      }

      if (this.panes.notes) {
        this.panes.notes.innerHTML = `
          <section class="tool-section">
            <div class="tool-btn-row" style="margin-top:0;">
              <button class="tool-btn primary" id="tool-notes-new">New note</button>
              <button class="tool-btn" id="tool-notes-pin">Pin</button>
              <button class="tool-btn" id="tool-notes-delete">Delete</button>
            </div>
            <div class="note-list" id="tool-notes-list"></div>
            <div class="note-editor">
              <input class="tool-input" id="tool-notes-title" type="text" maxlength="80"
                placeholder="Note title" spellcheck="false" aria-label="Note title">
              <textarea class="tool-textarea" id="tool-notes-text"
                placeholder="Jot something down..." aria-label="Note content"></textarea>
            </div>
            <div class="notes-meta" id="tool-notes-meta">0 characters · 0 words</div>
            <div class="tool-section-note" id="tool-notes-saved">Autosaves as you type.</div>
          </section>
        `;
      }

      if (this.panes.calc) {
        this.panes.calc.innerHTML = `
          <section class="tool-section">
            <div class="calc-display">
              <div class="calc-expression" id="tool-calc-expression">0</div>
              <div class="calc-result" id="tool-calc-result">0</div>
            </div>

            <div class="calc-mode-row">
              <button class="tool-chip active" data-calc-angle="deg">DEG</button>
              <button class="tool-chip" data-calc-angle="rad">RAD</button>
              <span class="calc-memory" id="tool-calc-memory">M 0</span>
              <button class="tool-chip" id="tool-calc-copy">Copy</button>
            </div>

            <div class="calc-keypad">
              <button class="calc-key fn" data-calc="clear">C</button>
              <button class="calc-key fn" data-calc="back">⌫</button>
              <button class="calc-key fn" data-calc="(">(</button>
              <button class="calc-key fn" data-calc=")">)</button>
              <button class="calc-key fn" data-calc="%">%</button>

              <button class="calc-key fn" data-calc="sin(">sin</button>
              <button class="calc-key fn" data-calc="cos(">cos</button>
              <button class="calc-key fn" data-calc="tan(">tan</button>
              <button class="calc-key fn" data-calc="log(">log</button>
              <button class="calc-key fn" data-calc="ln(">ln</button>

              <button class="calc-key fn" data-calc="asin(">sin⁻¹</button>
              <button class="calc-key fn" data-calc="acos(">cos⁻¹</button>
              <button class="calc-key fn" data-calc="atan(">tan⁻¹</button>
              <button class="calc-key fn" data-calc="sqrt(">√</button>
              <button class="calc-key fn" data-calc="π">π</button>

              <button class="calc-key fn" data-calc="square">x²</button>
              <button class="calc-key fn" data-calc="^">xʸ</button>
              <button class="calc-key fn" data-calc="inv(">1/x</button>
              <button class="calc-key fn" data-calc="!">!</button>
              <button class="calc-key fn" data-calc="e">e</button>

              <button class="calc-key" data-calc="7">7</button>
              <button class="calc-key" data-calc="8">8</button>
              <button class="calc-key" data-calc="9">9</button>
              <button class="calc-key op" data-calc="/">÷</button>
              <button class="calc-key fn" data-calc="sign">Neg</button>

              <button class="calc-key" data-calc="4">4</button>
              <button class="calc-key" data-calc="5">5</button>
              <button class="calc-key" data-calc="6">6</button>
              <button class="calc-key op" data-calc="*">×</button>
              <button class="calc-key fn" data-calc="ans">Ans</button>

              <button class="calc-key" data-calc="1">1</button>
              <button class="calc-key" data-calc="2">2</button>
              <button class="calc-key" data-calc="3">3</button>
              <button class="calc-key op" data-calc="-">−</button>
              <button class="calc-key fn" data-calc="exp(">eˣ</button>

              <button class="calc-key wide" data-calc="0">0</button>
              <button class="calc-key" data-calc=".">.</button>
              <button class="calc-key op" data-calc="+">+</button>
              <button class="calc-key eq" data-calc="equals">=</button>
            </div>

            <div class="calc-memory-row">
              <button class="tool-chip" data-calc-memory="mc">MC</button>
              <button class="tool-chip" data-calc-memory="mr">MR</button>
              <button class="tool-chip" data-calc-memory="mp">M+</button>
              <button class="tool-chip" data-calc-memory="mm">M−</button>
            </div>

            <div class="calc-history-head">
              <span>History</span>
              <button class="tool-chip" id="tool-calc-clear-history">Clear</button>
            </div>
            <div class="calc-history" id="tool-calc-history"></div>
          </section>
        `;
      }

      if (this.panes.convert) {
        this.panes.convert.innerHTML = `
          <section class="tool-section">
            <div class="convert-grid">
              <div class="convert-field">
                <label for="tool-convert-type">Type</label>
                <select class="tool-select" id="tool-convert-type">
                  <option value="length">Length</option>
                  <option value="weight">Weight</option>
                  <option value="temperature">Temperature</option>
                </select>
              </div>
              <div class="convert-field">
                <label for="tool-convert-from">From</label>
                <select class="tool-select" id="tool-convert-from"></select>
              </div>
              <div class="convert-field">
                <label for="tool-convert-to">To</label>
                <select class="tool-select" id="tool-convert-to"></select>
              </div>
            </div>

            <div class="tool-btn-row" style="margin-top:8px;flex-wrap:nowrap;">
              <input class="tool-input" id="tool-convert-value" type="number" step="any" value="1">
              <button class="tool-btn" id="tool-convert-swap">Swap</button>
            </div>

            <div class="convert-result" id="tool-convert-result">1 m<small>1 m</small></div>
          </section>
        `;
      }

      if (this.panes.context) {
        const neverSend = this.getSetting('settings.privacy.neverSend', '');
        this.panes.context.innerHTML = `
          <section class="tool-section">
            ${this.toggleRow(
              'tool-privacy-context',
              'settings.privacy.context',
              'Attach desktop context',
              '',
              true
            )}
            ${this.toggleRow(
              'tool-privacy-clipboard',
              'settings.privacy.allowClipboard',
              'Allow clipboard actions',
              '',
              true
            )}
            ${this.toggleRow(
              'tool-privacy-screenshot',
              'settings.privacy.allowScreenshot',
              'Allow screenshot context',
              '',
              false
            )}
            ${this.toggleRow(
              'tool-privacy-redact',
              'settings.privacy.redactSecrets',
              'Redact secrets before sending',
              '',
              true
            )}

            <div class="tool-row" style="display:block;">
              <div class="tool-label" style="margin-bottom:6px;">Never send</div>
              <input class="tool-input" id="tool-never-send" type="text"
                placeholder="prod-db, internal-token"
                value="${this.escapeHtml(neverSend)}">
            </div>
          </section>
        `;
      }

      if (this.panes.clipboard) {
        this.panes.clipboard.innerHTML = `
          <section class="tool-section">
            <div class="tool-btn-row" style="margin-top:0;">
              <button class="tool-btn primary" id="tool-clip-read">Read clipboard</button>
              <button class="tool-btn" id="tool-clip-clear">Clear</button>
            </div>

            <textarea class="tool-textarea" id="tool-clip-text"
              placeholder="Clipboard content appears here after you read it or save a copy."
              style="margin-top:2px;"></textarea>

            <div class="tool-btn-row">
              <button class="tool-chip" data-clip-action="explain">Explain</button>
              <button class="tool-chip" data-clip-action="debug">Debug</button>
              <button class="tool-chip" data-clip-action="format">Format</button>
              <button class="tool-chip" data-clip-action="summarize">Summarize</button>
              <button class="tool-chip" data-clip-action="test">Write tests</button>
            </div>

            <div class="tool-btn-row">
              <button class="tool-btn" id="tool-clip-insert">Insert raw into chat</button>
            </div>

            <div class="tool-section-note" id="tool-clip-note"></div>

            ${this.toggleRow(
              'tool-clipboard-watch',
              'settings.privacy.clipboardWatch',
              'Watch clipboard',
              'Save new copies locally. Never sent to AI automatically.',
              true
            )}

            <div class="clip-history-head">
              <span>History <small id="tool-clip-history-count"></small></span>
              <button class="tool-chip" id="tool-clip-history-clear">Clear history</button>
            </div>
            <div class="clip-history" id="tool-clip-history"></div>
          </section>
        `;
      }

      if (this.panes.colors) {
        this.panes.colors.innerHTML = `
          <section class="tool-section">
            <div class="color-preview-row">
              <label class="color-swatch" title="Pick a color">
                <input type="color" id="tool-color-picker" value="#007aff">
              </label>
              <div class="color-readouts">
                <span>HEX <strong id="tool-color-hex-label">#007aff</strong></span>
                <span>RGB <strong id="tool-color-rgb">255, 122, 47</strong></span>
                <span>HSL <strong id="tool-color-hsl">19, 100%, 59%</strong></span>
                <span>NAME <strong id="tool-color-name">Orange</strong></span>
              </div>
            </div>

            <input class="tool-input" id="tool-color-hex" type="text"
              value="#007aff" maxlength="7" placeholder="#007aff" spellcheck="false">

            <div class="contrast-result" id="tool-contrast">Contrast vs panel: —</div>

            <div class="tool-btn-row">
              <button class="tool-btn" id="tool-eyedropper" title="Pick a color from the screen">
                <i data-lucide="pipette"></i> Eyedropper
              </button>
              <button class="tool-btn primary" id="tool-color-apply">Apply as accent</button>
            </div>

            <div class="tool-btn-row" id="tool-palette"></div>
          </section>
        `;
      }

      if (this.panes.markdown) {
        this.panes.markdown.innerHTML = `
          <section class="tool-section">
            <textarea class="tool-textarea" id="tool-md-input"
              placeholder="# Heading&#10;&#10;Write **markdown** here..."></textarea>
            <div class="md-preview" id="tool-md-preview">
              <span class="tool-empty">Preview appears as you type.</span>
            </div>

            <div class="tool-btn-row">
              <button class="tool-btn primary" id="tool-md-insert">Insert into chat</button>
              <button class="tool-btn" id="tool-md-copy">Copy markdown</button>
            </div>
          </section>
        `;
      }

      if (this.panes.snippets) {
        this.panes.snippets.innerHTML = `
          <section class="tool-section">
            <input class="tool-input" id="tool-snippet-name" type="text" placeholder="Prompt name">
            <textarea class="tool-textarea" id="tool-snippet-body"
              placeholder="Explain {{code}} and suggest a fix." style="margin-top:6px;"></textarea>

            <div class="tool-btn-row">
              <button class="tool-btn primary" id="tool-snippet-add">Save prompt</button>
            </div>

            <div class="snippet-list" id="tool-snippet-list"></div>
          </section>
        `;
      }

      this.built = true;
      this.cacheElements();
      this.bind();
      this.refresh();
    }

    cacheElements() {
      const byId = (id) => document.getElementById(id);
      this.els = {
        neverSend: byId('tool-never-send'),
        clipRead: byId('tool-clip-read'),
        clipClear: byId('tool-clip-clear'),
        clipText: byId('tool-clip-text'),
        clipNote: byId('tool-clip-note'),
        clipInsert: byId('tool-clip-insert'),
        clipHistory: byId('tool-clip-history'),
        clipHistoryCount: byId('tool-clip-history-count'),
        clipHistoryClear: byId('tool-clip-history-clear'),
        clipWatch: byId('tool-clipboard-watch'),
        colorPicker: byId('tool-color-picker'),
        colorHex: byId('tool-color-hex'),
        colorHexLabel: byId('tool-color-hex-label'),
        colorRgb: byId('tool-color-rgb'),
        colorHsl: byId('tool-color-hsl'),
        colorName: byId('tool-color-name'),
        contrast: byId('tool-contrast'),
        eyedropper: byId('tool-eyedropper'),
        colorApply: byId('tool-color-apply'),
        palette: byId('tool-palette'),
        mdInput: byId('tool-md-input'),
        mdPreview: byId('tool-md-preview'),
        mdInsert: byId('tool-md-insert'),
        mdCopy: byId('tool-md-copy'),
        snippetName: byId('tool-snippet-name'),
        snippetBody: byId('tool-snippet-body'),
        snippetAdd: byId('tool-snippet-add'),
        snippetList: byId('tool-snippet-list'),

        focusTime: byId('tool-focus-time'),
        focusMode: byId('tool-focus-mode'),
        focusProgress: byId('tool-focus-progress'),
        focusCycle: byId('tool-focus-cycle'),
        focusStart: byId('tool-focus-start'),
        focusReset: byId('tool-focus-reset'),
        focusNote: byId('tool-focus-note'),

        reminderTitle: byId('tool-reminder-title'),
        reminderTime: byId('tool-reminder-time'),
        reminderRepeat: byId('tool-reminder-repeat'),
        reminderAdd: byId('tool-reminder-add'),
        reminderList: byId('tool-reminder-list'),

        todoInput: byId('tool-todo-input'),
        todoAdd: byId('tool-todo-add'),
        todoList: byId('tool-todo-list'),
        todoClearDone: byId('tool-todo-clear-done'),

        notesList: byId('tool-notes-list'),
        notesTitle: byId('tool-notes-title'),
        notesText: byId('tool-notes-text'),
        notesMeta: byId('tool-notes-meta'),
        notesSaved: byId('tool-notes-saved'),
        notesNew: byId('tool-notes-new'),
        notesPin: byId('tool-notes-pin'),
        notesDelete: byId('tool-notes-delete'),

        calcExpression: byId('tool-calc-expression'),
        calcResult: byId('tool-calc-result'),
        calcMemory: byId('tool-calc-memory'),
        calcHistory: byId('tool-calc-history'),
        calcCopy: byId('tool-calc-copy'),
        calcClearHistory: byId('tool-calc-clear-history'),

        convertType: byId('tool-convert-type'),
        convertFrom: byId('tool-convert-from'),
        convertTo: byId('tool-convert-to'),
        convertValue: byId('tool-convert-value'),
        convertSwap: byId('tool-convert-swap'),
        convertResult: byId('tool-convert-result')
      };
    }

    bind() {
      if (this.bound) return;

      document.addEventListener('change', (event) => {
        const input = event.target;
        if (!input || !input.dataset) return;

        if (input.dataset.focusDuration) {
          this.setPomodoroDuration(input.dataset.focusDuration, input.value);
          return;
        }

        if (input.dataset.reminderToggle !== undefined) {
          this.toggleReminder(input.dataset.reminderToggle, input.checked);
          return;
        }

        if (input.dataset.setting) {
          this.setSetting(input.dataset.setting, input.type === 'checkbox' ? input.checked : input.value);
          if (input.dataset.setting === 'settings.privacy.context' && this.chatTab &&
              typeof this.chatTab.updateContextBanner === 'function') {
            this.chatTab.updateContextBanner();
          }
          if (input.dataset.setting.startsWith('settings.privacy.')) {
            this.react('privacy:updated');
            this.updateClipboardNote();
          }
          if (input.id === 'tool-clipboard-watch' && typeof input.checked === 'boolean') {
            this.invokeApp('clipboard:set-watch', input.checked).catch(() => {});
          }
          return;
        }

        if (input.id === 'tool-never-send') {
          this.setSetting('settings.privacy.neverSend', input.value.trim());
          return;
        }

        if (input.id === 'tool-color-hex') {
          this.updateColor(input.value);
          return;
        }

        if (input.dataset.todoToggle !== undefined) {
          this.toggleTodo(Number(input.dataset.todoToggle));
          return;
        }

        if (input.id === 'tool-notes-title' || input.id === 'tool-notes-text') {
          this.flushNotesSave();
          return;
        }

        if (input.id === 'tool-convert-type') {
          this.populateConverterUnits();
          this.convertUnit(true);
          return;
        }

        if (input.id === 'tool-convert-from' || input.id === 'tool-convert-to') {
          this.convertUnit(true);
          return;
        }

        if (input.id === 'tool-convert-value') {
          this.convertUnit(true);
        }
      });

      document.addEventListener('input', (event) => {
        const input = event.target;
        if (!input || !input.id) return;

        if (input.id === 'tool-color-picker') {
          this.updateColor(input.value);
        } else if (input.id === 'tool-md-input') {
          this.updateMarkdownPreview();
        } else if (input.id === 'tool-clip-text') {
          this.updateClipboardNote();
        } else if (input.id === 'tool-notes-title' || input.id === 'tool-notes-text') {
          this.notesDirty = true;
          this.updateNotesMeta();
          this.scheduleNotesSave();
        } else if (input.id === 'tool-convert-value') {
          this.convertUnit();
        }
      });

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!target || !target.closest) return;
        const btn = target.closest('button');
        if (!btn) return;

        if (btn.id === 'tool-flow-regen') {
          if (this.chatTab && typeof this.chatTab.regenerateLast === 'function') {
            this.chatTab.regenerateLast();
            this.panel.switchTab('chat');
            this.react('flow:retried');
          }
          return;
        }
        if (btn.id === 'tool-flow-stop') {
          if (this.chatTab && typeof this.chatTab.stopGeneration === 'function') {
            this.chatTab.stopGeneration();
            this.react('flow:stopped');
          }
          return;
        }
        if (btn.id === 'tool-flow-clear-input') {
          if (this.chatTab && typeof this.chatTab.insertIntoInput === 'function') {
            this.chatTab.insertIntoInput('');
          }
          return;
        }

        if (btn.dataset.focusMode) {
          this.setPomodoroMode(btn.dataset.focusMode);
          return;
        }
        if (btn.id === 'tool-focus-start') {
          this.togglePomodoro();
          return;
        }
        if (btn.id === 'tool-focus-reset') {
          this.resetPomodoro();
          return;
        }

        if (btn.id === 'tool-reminder-add') {
          this.addReminder();
          return;
        }
        if (btn.dataset.reminderDelete !== undefined) {
          this.deleteReminder(btn.dataset.reminderDelete);
          return;
        }
        if (btn.dataset.reminderSnooze !== undefined) {
          this.snoozeReminder(btn.dataset.reminderSnooze);
          return;
        }

        if (btn.id === 'tool-todo-add') {
          this.addTodo();
          return;
        }
        if (btn.dataset.todoDelete !== undefined) {
          this.deleteTodo(Number(btn.dataset.todoDelete));
          return;
        }
        if (btn.id === 'tool-todo-clear-done') {
          this.clearDoneTodos();
          return;
        }

        if (btn.id === 'tool-notes-new') {
          this.createNote();
          return;
        }
        if (btn.id === 'tool-notes-pin') {
          this.toggleNotePin();
          return;
        }
        if (btn.id === 'tool-notes-delete') {
          this.deleteNote();
          return;
        }
        if (btn.dataset.noteId) {
          this.selectNote(btn.dataset.noteId);
          return;
        }

        if (btn.dataset.calc !== undefined) {
          event.preventDefault();
          this.handleCalcKey(btn.dataset.calc);
          return;
        }
        if (btn.dataset.calcAngle) {
          this.setCalcAngle(btn.dataset.calcAngle);
          return;
        }
        if (btn.dataset.calcMemory) {
          this.handleCalcMemory(btn.dataset.calcMemory);
          return;
        }
        if (btn.dataset.calcHistory !== undefined) {
          const item = this.getCalcHistory()[Number(btn.dataset.calcHistory)];
          if (item) {
            this.calcExpression = item.expression;
            this.updateCalcDisplay();
          }
          return;
        }
        if (btn.id === 'tool-calc-copy') {
          const value = this.els.calcResult ? this.els.calcResult.textContent : '';
          if (navigator.clipboard && value && value !== '—') {
            navigator.clipboard.writeText(value).then(() => {
              btn.textContent = 'Copied';
              this.react('clipboard:copied', { message: `Copied ${value}` });
              window.setTimeout(() => {
                if (btn.isConnected) btn.textContent = 'Copy';
              }, 1200);
            });
          }
          return;
        }
        if (btn.id === 'tool-calc-clear-history') {
          this.setSetting('tools.calcHistory', []);
          this.renderCalcHistory();
          return;
        }

        if (btn.id === 'tool-convert-swap') {
          this.swapConverterUnits();
          return;
        }

        if (btn.id === 'tool-clip-read') {
          this.readClipboard();
          return;
        }
        if (btn.id === 'tool-clip-clear') {
          if (this.els.clipText) this.els.clipText.value = '';
          this.updateClipboardNote();
          return;
        }
        if (btn.id === 'tool-clip-history-clear') {
          this.clearClipboardHistory();
          return;
        }
        if (btn.dataset.clipLoad !== undefined) {
          const item = this.getClipboardHistory()[Number(btn.dataset.clipLoad)];
          if (item && this.els.clipText) {
            this.els.clipText.value = item.text;
            this.updateClipboardNote();
          }
          return;
        }
        if (btn.dataset.clipCopy !== undefined) {
          const item = this.getClipboardHistory()[Number(btn.dataset.clipCopy)];
          if (item) this.copyClipboardText(item.text, btn);
          return;
        }
        if (btn.dataset.clipInsert !== undefined) {
          const item = this.getClipboardHistory()[Number(btn.dataset.clipInsert)];
          if (item && item.text.trim()) {
            this.sendToChat(item.text, false);
            this.react('clipboard:inserted');
          }
          return;
        }
        if (btn.id === 'tool-clip-insert') {
          const text = this.els.clipText ? this.els.clipText.value : '';
          if (text.trim()) {
            this.sendToChat(text, false);
            this.react('clipboard:inserted');
          }
          return;
        }
        if (btn.dataset.clipAction) {
          this.clipboardAction(btn.dataset.clipAction);
          return;
        }

        if (btn.id === 'tool-eyedropper') return this.pickScreenColor();
        if (btn.id === 'tool-color-apply') {
          const hex = this.normalizeHex(this.els.colorHex.value) || '#007aff';
          this.setSetting('settings.appearance.accentColor', hex);
          if (window.ThemeManager && typeof window.ThemeManager.applyAccentColor === 'function') {
            window.ThemeManager.applyAccentColor(document, hex);
          }
          btn.textContent = 'Applied ✓';
          this.react('color:applied', { message: `Accent ${hex}` });
          window.setTimeout(() => {
            if (btn.isConnected) btn.textContent = 'Apply as accent';
          }, 1200);
          return;
        }
        if (btn.dataset.shade) {
          this.updateColor(btn.dataset.shade);
          this.react('color:applied', { message: `Shade ${btn.dataset.shade}` });
          return;
        }

        if (btn.id === 'tool-md-insert') {
          const text = this.els.mdInput ? this.els.mdInput.value : '';
          if (text.trim()) {
            this.sendToChat(text, false);
            this.react('markdown:inserted');
          }
          return;
        }
        if (btn.id === 'tool-md-copy') {
          const text = this.els.mdInput ? this.els.mdInput.value : '';
          if (navigator.clipboard && text) {
            navigator.clipboard.writeText(text).then(() => {
              btn.textContent = 'Copied ✓';
              this.react('clipboard:copied');
              window.setTimeout(() => {
                if (btn.isConnected) btn.textContent = 'Copy markdown';
              }, 1200);
            });
          }
          return;
        }

        if (btn.id === 'tool-snippet-add') {
          this.addSnippet();
          return;
        }
        if (btn.dataset.snippetUse !== undefined) {
          const item = this.getSnippets()[Number(btn.dataset.snippetUse)];
          if (item) {
            this.sendToChat(item.body, true);
            this.react('clipboard:inserted', { message: `Prompt “${item.name}” inserted.` });
          }
          return;
        }
        if (btn.dataset.snippetDelete !== undefined) {
          const next = this.getSnippets().filter((_, i) => i !== Number(btn.dataset.snippetDelete));
          this.setSetting('savedPrompts', next);
          this.renderSnippets();
          this.react('settings:saved', { message: 'Prompt removed.' });
        }
      });

      document.addEventListener('keydown', (event) => {
        if (this.built && (event.target && event.target.id === 'tool-reminder-title' ||
            event.target && event.target.id === 'tool-reminder-time') && event.key === 'Enter') {
          event.preventDefault();
          this.addReminder();
          return;
        }
        if (!this.built || !this.panel || this.panel.activeTabId !== 'calc') return;
        const tag = event.target && event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const key = event.key;
        if (/^[0-9+\-*/().^!%]$/.test(key)) {
          event.preventDefault();
          this.appendCalcToken(key);
        } else if (key === 'Enter' || key === '=') {
          event.preventDefault();
          this.handleCalcKey('equals');
        } else if (key === 'Backspace') {
          event.preventDefault();
          this.handleCalcKey('back');
        } else if (key === 'Escape') {
          event.preventDefault();
          this.handleCalcKey('clear');
        } else if (key.toLowerCase() === 'p') {
          event.preventDefault();
          this.appendCalcToken('π');
        } else if (key.toLowerCase() === 'e') {
          event.preventDefault();
          this.appendCalcToken('e');
        }
      });

      this.ensureClipboardListeners();
      this.ensureReminderListeners();
      this.bound = true;
    }

    ensureReminderListeners() {
      if (this.reminderListenersBound) return;
      if (!window.app || typeof window.app.on !== 'function') return;
      const changed = (_event, list) => {
        if (Array.isArray(list) && !this.reminderEditing) this.renderReminders();
      };
      const triggered = () => this.renderReminders();
      try {
        window.app.on('reminders:changed', changed);
        window.app.on('reminder:triggered', triggered);
        window.app.on('panel:data-imported', triggered);
        this.reminderListenersBound = { changed, triggered };
      } catch (error) {
        // Bridge unavailable — local list still works.
      }
    }

    ensureClipboardListeners() {
      if (this.clipboardListenerBound) return;
      if (!window.app || typeof window.app.on !== 'function') return;

      const changedListener = (event, payload) => this.onClipboardChanged(event, payload);
      const importedListener = () => {
        this.syncClipboardBaseline();
        this.refreshClipboardFromStore();
      };
      try {
        window.app.on('clipboard:changed', changedListener);
        window.app.on('panel:data-imported', importedListener);
        this.clipboardListenerBound = { changedListener, importedListener };
      } catch (error) {
        // Bridge unavailable — manual actions and local storage still work.
      }
    }

    onTabActivated(tabId) {
      this.render();
      this.ensureClipboardListeners();
      if (tabId !== 'notes') this.flushNotesSave();

      if (tabId === 'focus') {
        this.normalizePomodoro();
        this.updatePomodoroUI();
      } else if (tabId === 'reminders') {
        if (this.els.reminderTime && !this.els.reminderTime.value) {
          this.els.reminderTime.value = this.defaultReminderTime();
        }
        this.renderReminders();
      } else if (tabId === 'calc') {
        this.updateCalcDisplay();
        this.renderCalcHistory();
      } else if (tabId === 'convert') {
        this.populateConverterUnits();
        this.convertUnit();
      } else if (tabId === 'notes') {
        this.renderNotes();
      } else if (tabId === 'clipboard') {
        this.refreshClipboardFromStore();
      }

      const focusMap = {
        flow: null,
        focus: null,
        reminders: this.els.reminderTitle,
        todo: this.els.todoInput,
        notes: this.els.notesText,
        calc: null,
        convert: this.els.convertValue,
        context: this.els.neverSend,
        clipboard: this.els.clipText,
        colors: this.els.colorHex,
        markdown: this.els.mdInput,
        snippets: this.els.snippetName
      };

      const target = focusMap[tabId];
      if (target && typeof target.focus === 'function') {
        window.setTimeout(() => target.focus(), 0);
      }
    }

    refresh() {
      if (!this.built) return;

      this.ensureClipboardListeners();

      document.querySelectorAll('[data-setting]').forEach((input) => {
        const value = this.getSetting(input.dataset.setting, input.type === 'checkbox' ? false : '');
        if (input.type === 'checkbox') input.checked = !!value;
        else input.value = value == null ? '' : value;
      });

      if (this.els.neverSend) {
        this.els.neverSend.value = this.getSetting('settings.privacy.neverSend', '');
      }

      this.normalizePomodoro();
      this.updatePomodoroUI();
      this.renderTodos();
      this.renderReminders();

      this.flushNotesSave();
      this.renderNotes();

      this.calcAngle = this.getSetting('tools.calc.angle', 'deg') === 'rad' ? 'rad' : 'deg';
      const savedMemory = Number(this.getSetting('tools.calc.memory', 0));
      this.calcMemory = Number.isFinite(savedMemory) ? savedMemory : 0;
      this.updateCalcDisplay();
      this.renderCalcHistory();
      this.populateConverterUnits();
      this.convertUnit();

      this.updateColor(this.getSetting('settings.appearance.accentColor', '#007aff'));
      this.updateMarkdownPreview();
      if (this.els.clipWatch) {
        this.els.clipWatch.checked = this.getSetting('settings.privacy.clipboardWatch', true) !== false;
      }
      this.refreshClipboardFromStore();
      this.renderSnippets();

      if (this.chatTab && typeof this.chatTab.refreshFlowButtons === 'function') {
        this.chatTab.refreshFlowButtons();
      }

      this.refreshIcons();
    }

    refreshIcons() {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ attrs: { 'stroke-width': 1.7 } });
      }
    }

    formatTime(totalSeconds) {
      const seconds = Math.max(0, Math.floor(totalSeconds || 0));
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    formatNumber(value) {
      if (!Number.isFinite(value)) return '—';
      const abs = Math.abs(value);
      if (abs >= 1e6 || (abs > 0 && abs < 1e-4)) return value.toExponential(3);
      return parseFloat(value.toFixed(4)).toString();
    }

    getPomodoroDurations() {
      const saved = this.getSetting('tools.pomodoroDurations', {}) || {};
      const read = (mode) => {
        const fallback = COUCOU_POMODORO_MODES[mode].minutes;
        const value = Number(saved[mode]);
        if (!Number.isFinite(value)) return fallback;
        return Math.max(1, Math.min(180, Math.round(value)));
      };
      return {
        focus: read('focus'),
        short: read('short'),
        long: read('long')
      };
    }

    getPomodoroSeconds(mode) {
      const durations = this.getPomodoroDurations();
      return (durations[mode] || COUCOU_POMODORO_MODES[mode].minutes) * 60;
    }

    setPomodoroDuration(mode, value) {
      if (!COUCOU_POMODORO_MODES[mode]) return;
      const minutes = Math.max(1, Math.min(180, Math.round(Number(value) || 0)));
      const durations = this.getPomodoroDurations();
      durations[mode] = minutes;
      this.setSetting('tools.pomodoroDurations', durations);

      const input = document.querySelector(`[data-focus-duration="${mode}"]`);
      if (input) input.value = String(minutes);

      if (this.pomodoro && this.pomodoro.mode === mode && !this.pomodoro.running) {
        this.pomodoro.remaining = minutes * 60;
        this.setSetting('tools.pomodoro', this.pomodoro);
      }
      this.updatePomodoroUI();
    }

    normalizePomodoro() {
      const defaults = {
        mode: 'focus',
        remaining: this.getPomodoroSeconds('focus'),
        running: false,
        endAt: null,
        completed: 0
      };
      const saved = this.getSetting('tools.pomodoro', null);
      const state = (saved && typeof saved === 'object') ? { ...defaults, ...saved } : { ...defaults };

      if (!COUCOU_POMODORO_MODES[state.mode]) state.mode = 'focus';
      const duration = this.getPomodoroSeconds(state.mode);

      if (state.running && state.endAt) {
        const left = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
        if (left <= 0) {
          this.completePomodoro(state);
        } else {
          state.remaining = left;
        }
      } else {
        state.running = false;
        state.endAt = null;
        if (!Number.isFinite(state.remaining) || state.remaining <= 0 || state.remaining > duration) {
          state.remaining = duration;
        }
      }

      this.pomodoro = state;
      if (state.running) this.startPomodoroTimer();
      return state;
    }

    completePomodoro(state) {
      const wasFocus = state.mode === 'focus';
      state.completed = (state.completed || 0) + (wasFocus ? 1 : 0);
      state.mode = wasFocus ? 'short' : 'focus';
      state.remaining = this.getPomodoroSeconds(state.mode);
      state.running = false;
      state.endAt = null;
      this.stopPomodoroTimer();
      this.setSetting('tools.pomodoro', state);
      if (this.els.focusNote) {
        this.els.focusNote.textContent = wasFocus
          ? 'Focus complete — short break next.'
          : 'Break complete — focus next.';
      }
      this.react('focus:completed', {
        message: wasFocus ? 'Focus block complete. Break time!' : 'Break complete. Ready to focus?'
      });
    }

    startPomodoroTimer() {
      if (this.pomodoroTimer) return;
      this.pomodoroTimer = window.setInterval(() => this.tickPomodoro(), 1000);
    }

    stopPomodoroTimer() {
      if (!this.pomodoroTimer) return;
      window.clearInterval(this.pomodoroTimer);
      this.pomodoroTimer = null;
    }

    tickPomodoro() {
      const state = this.pomodoro;
      if (!state || !state.running) {
        this.stopPomodoroTimer();
        return;
      }

      state.remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
      if (state.remaining <= 0) {
        this.completePomodoro(state);
      }
      this.updatePomodoroUI();
    }

    togglePomodoro() {
      const state = this.normalizePomodoro();
      const wasRunning = state.running;
      if (state.running) {
        state.remaining = Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
        state.running = false;
        state.endAt = null;
        this.stopPomodoroTimer();
      } else {
        const duration = this.getPomodoroSeconds(state.mode);
        if (!Number.isFinite(state.remaining) || state.remaining <= 0 || state.remaining > duration) {
          state.remaining = duration;
        }
        state.endAt = Date.now() + state.remaining * 1000;
        state.running = true;
        this.startPomodoroTimer();
      }
      this.setSetting('tools.pomodoro', state);
      this.updatePomodoroUI();
      this.react(wasRunning ? 'focus:stopped' : 'focus:started');
    }

    setPomodoroMode(mode) {
      if (!COUCOU_POMODORO_MODES[mode]) return;
      this.stopPomodoroTimer();
      const completed = this.pomodoro ? (this.pomodoro.completed || 0) : 0;
      this.pomodoro = {
        mode,
        remaining: this.getPomodoroSeconds(mode),
        running: false,
        endAt: null,
        completed
      };
      this.setSetting('tools.pomodoro', this.pomodoro);
      this.updatePomodoroUI();
    }

    resetPomodoro() {
      if (!this.pomodoro) this.normalizePomodoro();
      this.stopPomodoroTimer();
      this.pomodoro.remaining = this.getPomodoroSeconds(this.pomodoro.mode);
      this.pomodoro.running = false;
      this.pomodoro.endAt = null;
      this.setSetting('tools.pomodoro', this.pomodoro);
      this.updatePomodoroUI();
      this.react('focus:stopped', { message: 'Timer reset.' });
    }

    updatePomodoroUI() {
      if (!this.els.focusTime || !this.pomodoro) return;
      const state = this.pomodoro;
      const mode = COUCOU_POMODORO_MODES[state.mode];
      const total = this.getPomodoroSeconds(state.mode);
      const percent = Math.max(0, Math.min(100, Math.round((1 - state.remaining / total) * 100)));
      const durations = this.getPomodoroDurations();

      this.els.focusTime.textContent = this.formatTime(state.remaining);
      if (this.els.focusMode) this.els.focusMode.textContent = mode.label;
      if (this.els.focusCycle) {
        this.els.focusCycle.textContent = `${state.completed || 0} focus blocks done`;
      }
      if (this.els.focusProgress) this.els.focusProgress.style.width = `${percent}%`;
      if (this.els.focusStart) this.els.focusStart.textContent = state.running ? 'Pause' : 'Start';

      const chipNames = { focus: 'Focus', short: 'Break', long: 'Long break' };
      document.querySelectorAll('[data-focus-mode]').forEach((btn) => {
        const chipMode = btn.dataset.focusMode;
        btn.classList.toggle('active', chipMode === state.mode);
        if (durations[chipMode]) btn.textContent = `${durations[chipMode]}m ${chipNames[chipMode]}`;
      });
      document.querySelectorAll('[data-focus-duration]').forEach((input) => {
        const inputMode = input.dataset.focusDuration;
        if (durations[inputMode] && document.activeElement !== input) {
          input.value = String(durations[inputMode]);
        }
      });

      this.panel.setFooterStatus(
        'focus',
        state.running ? `Focus ${this.formatTime(state.remaining)}` : 'Focus: idle'
      );
    }

    getTodos() {
      const list = this.getSetting('tools.todo', []);
      return Array.isArray(list) ? list.slice(0, 60) : [];
    }

    getReminders() {
      const list = this.panel && this.panel.store ? this.panel.store.get('reminders') : [];
      return Array.isArray(list) ? list : [];
    }

    saveReminders(list) {
      const safe = Array.isArray(list) ? list.slice(0, 50) : [];
      if (this.panel && this.panel.store) this.panel.store.set('reminders', safe);
      if (window.app && typeof window.app.send === 'function') {
        window.app.send('reminders:updated', safe);
      }
      this.renderReminders();
    }

    defaultReminderTime() {
      const next = new Date(Date.now() + 60 * 60 * 1000);
      return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
    }

    addReminder() {
      const title = (this.els.reminderTitle && this.els.reminderTitle.value || '').trim();
      if (!title) return;
      const time = (this.els.reminderTime && this.els.reminderTime.value) || this.defaultReminderTime();
      const repeat = (this.els.reminderRepeat && this.els.reminderRepeat.value) || 'once';
      const list = this.getReminders();
      list.push({
        id: this.makeId(),
        title: title.slice(0, 120),
        time,
        repeat,
        enabled: true,
        lastTriggered: null,
        createdAt: Date.now()
      });
      this.saveReminders(list);
      if (this.els.reminderTitle) this.els.reminderTitle.value = '';
      if (this.els.reminderTime) this.els.reminderTime.value = '';
      this.react('reminder:added', { message: `Reminder set for ${time}.` });
    }

    toggleReminder(id, enabled) {
      const list = this.getReminders();
      const item = list.find((entry) => String(entry.id) === String(id));
      if (!item) return;
      item.enabled = !!enabled;
      this.saveReminders(list);
      this.react('reminder:updated', { message: item.enabled ? 'Reminder on.' : 'Reminder muted.' });
    }

    deleteReminder(id) {
      const list = this.getReminders().filter((entry) => String(entry.id) !== String(id));
      this.saveReminders(list);
      this.react('reminder:removed', { message: 'Reminder removed.' });
    }

    snoozeReminder(id) {
      this.invokeApp('reminders:snooze-action', { id, minutes: 5 }).catch(() => {});
      this.react('reminder:snoozed', { message: 'Snoozed for 5 minutes.' });
    }

    renderReminders() {
      if (!this.els.reminderList) return;
      const list = this.getReminders();
      if (list.length === 0) {
        this.els.reminderList.innerHTML = '<div class="tool-empty">No reminders yet.</div>';
        return;
      }

      const repeatLabels = { once: 'Once', daily: 'Daily', 'every-hour': 'Hourly' };
      this.els.reminderList.innerHTML = list.map((item) => `
        <div class="todo-item ${item.enabled === false ? 'done' : ''}">
          <input type="checkbox" data-reminder-toggle="${this.escapeHtml(item.id)}" ${item.enabled === false ? '' : 'checked'} aria-label="Enable reminder">
          <span class="todo-text">${this.escapeHtml(item.title)} <span class="tool-label">${this.escapeHtml(item.time || '')} · ${this.escapeHtml(repeatLabels[item.repeat] || 'Once')}</span></span>
          <button class="todo-delete" data-reminder-snooze="${this.escapeHtml(item.id)}" title="Snooze 5 minutes">+</button>
          <button class="todo-delete" data-reminder-delete="${this.escapeHtml(item.id)}" title="Delete reminder">×</button>
        </div>
      `).join('');
    }

    renderTodos() {
      if (!this.els.todoList) return;
      const list = this.getTodos();

      if (list.length === 0) {
        this.els.todoList.innerHTML = '<div class="tool-empty">No tasks yet.</div>';
        return;
      }

      this.els.todoList.innerHTML = list.map((item, index) => `
        <div class="todo-item ${item.done ? 'done' : ''}">
          <input type="checkbox" data-todo-toggle="${index}" ${item.done ? 'checked' : ''}>
          <span class="todo-text">${this.escapeHtml(item.text)}</span>
          <button class="todo-delete" data-todo-delete="${index}" title="Delete task">×</button>
        </div>
      `).join('');
    }

    addTodo() {
      const raw = this.els.todoInput ? this.els.todoInput.value.trim() : '';
      if (!raw) return;
      const list = this.getTodos();
      list.unshift({ text: raw.slice(0, 200), done: false, createdAt: Date.now() });
      this.setSetting('tools.todo', list.slice(0, 60));
      if (this.els.todoInput) this.els.todoInput.value = '';
      this.renderTodos();
      this.react('todo:added', { message: `Added “${raw.slice(0, 48)}”` });
    }

    toggleTodo(index) {
      const list = this.getTodos();
      if (!list[index]) return;
      list[index].done = !list[index].done;
      this.setSetting('tools.todo', list);
      this.renderTodos();
      if (list[index].done && list.every((item) => item.done)) {
        this.react('todo:all-completed');
      } else {
        this.react(list[index].done ? 'todo:completed' : 'todo:added', {
          message: list[index].done ? 'Task done. Nice work!' : 'Task reopened.'
        });
      }
    }

    deleteTodo(index) {
      const list = this.getTodos().filter((_, i) => i !== index);
      this.setSetting('tools.todo', list);
      this.renderTodos();
    }

    clearDoneTodos() {
      const list = this.getTodos().filter((item) => !item.done);
      this.setSetting('tools.todo', list);
      this.renderTodos();
    }

    getNotes() {
      const raw = this.getSetting('tools.notes', null);
      let notes = null;
      let needsWrite = false;

      if (Array.isArray(raw)) {
        notes = raw.map((item) => {
          const source = item && typeof item === 'object' ? item : {};
          const updated = Number(source.updatedAt);
          return {
            id: typeof source.id === 'string' && source.id ? source.id : this.makeId(),
            title: typeof source.title === 'string' ? source.title.slice(0, 80) : 'Untitled note',
            content: typeof source.content === 'string' ? source.content.slice(0, 8000) : '',
            pinned: !!source.pinned,
            updatedAt: Number.isFinite(updated) && updated > 0 ? updated : Date.now()
          };
        });
      } else if (typeof raw === 'string') {
        // Legacy single scratchpad: migrate without losing a single character.
        notes = [{
          id: this.makeId(),
          title: 'Quick note',
          content: raw.slice(0, 8000),
          pinned: false,
          updatedAt: Date.now()
        }];
        needsWrite = true;
      }

      if (!notes || notes.length === 0) {
        notes = [{
          id: this.makeId(),
          title: 'Quick note',
          content: '',
          pinned: false,
          updatedAt: Date.now()
        }];
        needsWrite = true;
      }

      if (needsWrite) {
        this.setSetting('tools.notes', notes);
        this.setSetting('tools.activeNoteId', notes[0].id);
      }

      notes.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
      return notes.slice(0, 100);
    }

    getActiveNote(notes) {
      const list = notes || this.getNotes();
      const id = this.getSetting('tools.activeNoteId', null);
      return list.find((note) => note.id === id) || list[0] || null;
    }

    persistNotes(notes, activeId) {
      this.setSetting('tools.notes', (notes || []).slice(0, 100));
      if (activeId) this.setSetting('tools.activeNoteId', activeId);
    }

    renderNotes(forceEditor = false) {
      const notes = this.getNotes();
      const active = this.getActiveNote(notes);

      if (this.els.notesTitle && (forceEditor || document.activeElement !== this.els.notesTitle)) {
        this.els.notesTitle.value = active ? active.title : '';
      }
      if (this.els.notesText && (forceEditor || document.activeElement !== this.els.notesText)) {
        this.els.notesText.value = active ? active.content : '';
      }
      if (this.els.notesPin) {
        this.els.notesPin.textContent = active && active.pinned ? 'Unpin' : 'Pin';
      }
      this.renderNotesList(notes, active);
      this.updateNotesMeta();
      this.updateNotesStatus(active);
    }

    renderNotesList(notes, active) {
      if (!this.els.notesList) return;
      this.els.notesList.innerHTML = notes.map((note) => `
        <button class="note-list-item ${active && note.id === active.id ? 'active' : ''} ${note.pinned ? 'pinned' : ''}"
          data-note-id="${this.escapeHtml(note.id)}" title="${this.escapeHtml(note.title)}">
          <span class="note-list-title">${note.pinned ? '<span class="note-pin-mark" aria-hidden="true">★</span>' : ''}${this.escapeHtml(note.title || 'Untitled note')}</span>
          <small>${this.escapeHtml(this.formatRelativeTime(note.updatedAt))}</small>
        </button>
      `).join('');
    }

    updateNotesStatus(note) {
      if (!this.els.notesSaved) return;
      const time = note && note.updatedAt ? ` · edited ${this.formatRelativeTime(note.updatedAt)}` : '';
      this.els.notesSaved.textContent = `Autosaves as you type${time}.`;
    }

    updateNotesMeta() {
      if (!this.els.notesMeta || !this.els.notesText) return;
      const text = this.els.notesText.value || '';
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      this.els.notesMeta.textContent = `${text.length} characters · ${words} words`;
    }

    scheduleNotesSave() {
      if (this.notesSaveTimer) window.clearTimeout(this.notesSaveTimer);
      this.notesSaveTimer = window.setTimeout(() => {
        this.notesSaveTimer = null;
        this.flushNotesSave();
      }, 350);
    }

    flushNotesSave() {
      if (this.notesSaveTimer) {
        window.clearTimeout(this.notesSaveTimer);
        this.notesSaveTimer = null;
      }
      if (!this.notesDirty) return;
      this.notesDirty = false;

      const notes = this.getNotes();
      const active = this.getActiveNote(notes);
      if (!active) return;
      if (this.els.notesTitle) {
        active.title = (this.els.notesTitle.value || '').trim().slice(0, 80) || 'Untitled note';
      }
      if (this.els.notesText) active.content = (this.els.notesText.value || '').slice(0, 8000);
      active.updatedAt = Date.now();
      this.persistNotes(notes, active.id);
      this.updateNotesMeta();
      this.updateNotesStatus(active);
      this.renderNotesList(notes, active);
      this.react('note:saved', { id: active.id, title: active.title });
    }

    createNote() {
      this.flushNotesSave();
      const notes = this.getNotes();
      const note = {
        id: this.makeId(),
        title: 'New note',
        content: '',
        pinned: false,
        updatedAt: Date.now()
      };
      notes.unshift(note);
      this.persistNotes(notes, note.id);
      this.renderNotes(true);
      if (this.els.notesTitle) {
        window.setTimeout(() => {
          if (this.els.notesTitle && this.els.notesTitle.isConnected) {
            this.els.notesTitle.focus();
            this.els.notesTitle.select();
          }
        }, 0);
      }
    }

    selectNote(id) {
      if (!id) return;
      this.flushNotesSave();
      const notes = this.getNotes();
      if (!notes.some((note) => note.id === id)) return;
      this.setSetting('tools.activeNoteId', id);
      this.renderNotes(true);
    }

    toggleNotePin() {
      this.flushNotesSave();
      const notes = this.getNotes();
      const active = this.getActiveNote(notes);
      if (!active) return;
      active.pinned = !active.pinned;
      active.updatedAt = Date.now();
      this.persistNotes(notes, active.id);
      this.renderNotes();
      this.react('note:pinned', { id: active.id, pinned: active.pinned });
    }

    deleteNote() {
      this.flushNotesSave();
      const notes = this.getNotes();
      const active = this.getActiveNote(notes);
      if (!active) return;
      const remaining = notes.filter((note) => note.id !== active.id);
      if (remaining.length === 0) {
        remaining.push({
          id: this.makeId(),
          title: 'Quick note',
          content: '',
          pinned: false,
          updatedAt: Date.now()
        });
      }
      this.persistNotes(remaining, remaining[0].id);
      this.renderNotes(true);
    }

    getCalcHistory() {
      const list = this.getSetting('tools.calcHistory', []);
      return Array.isArray(list) ? list.slice(0, 10) : [];
    }

    renderCalcHistory() {
      if (!this.els.calcHistory) return;
      const list = this.getCalcHistory();
      if (list.length === 0) {
        this.els.calcHistory.innerHTML = '<div class="tool-empty">No calculations yet.</div>';
        return;
      }

      this.els.calcHistory.innerHTML = list.map((item, index) => `
        <button class="calc-history-item" data-calc-history="${index}" title="Load expression">
          <span>${this.escapeHtml(item.expression)}</span>
          <strong>= ${this.escapeHtml(item.result)}</strong>
        </button>
      `).join('');
    }

    setCalcAngle(angle) {
      this.calcAngle = angle === 'rad' ? 'rad' : 'deg';
      this.setSetting('tools.calc.angle', this.calcAngle);
      this.updateCalcDisplay();
    }

    limitCalcExpression(expr) {
      return String(expr || '').slice(0, 120) || '0';
    }

    appendCalcToken(token) {
      if (token === 'sign') return this.toggleCalcSign();
      if (token === 'square') return this.appendCalcSquare();
      if (token === 'ans') {
        const ans = this.calcLastResult || '0';
        token = Number(ans) < 0 ? `(${ans})` : ans;
      }

      let expr = (this.calcExpression === '0') ? '' : this.calcExpression;
      const functions = '(?:sin|cos|tan|asin|acos|atan|sqrt|log|ln|abs|exp|inv)';
      // Digits and '.' must append directly; only functions, parentheses and
      // constants need implicit multiplication after a completed value.
      const startsOperand = new RegExp(`^[(πe]|${functions}\\(`).test(token);
      const endsValue = /[0-9)πe!%]$/.test(expr);

      // Postfix operators need a value before them.
      if ((token === '%' || token === '!') && (!expr || /[+\-*/^(]$/.test(expr))) return;

      // xʸ needs a left operand.
      if (token === '^' && (!expr || /[+\-*/^(]$/.test(expr))) expr += '0';

      if (expr && startsOperand && endsValue) expr += '*';
      expr += token;
      this.calcExpression = this.limitCalcExpression(expr);
      this.updateCalcDisplay();
    }

    appendCalcSquare() {
      let expr = this.calcExpression === '0' ? '' : this.calcExpression;
      if (!expr) expr = '0';

      const opens = (expr.match(/\(/g) || []).length;
      const closes = (expr.match(/\)/g) || []).length;
      if (/[+\-*/^(]$/.test(expr)) {
        expr += '0';
      } else if (opens > closes) {
        expr += '0' + ')'.repeat(opens - closes);
      }
      this.calcExpression = this.limitCalcExpression(`${expr}^2`);
      this.updateCalcDisplay();
    }

    toggleCalcSign() {
      let expr = this.calcExpression === '0' ? '' : this.calcExpression;
      const match = expr.match(/(-?)(π|e|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/);
      if (match) {
        const start = expr.length - match[0].length;
        const value = match[1] === '-' ? match[2] : `-${match[2]}`;
        expr = expr.slice(0, start) + value;
      } else if (expr) {
        expr = `-(${expr})`;
      } else {
        expr = '-0';
      }
      this.calcExpression = this.limitCalcExpression(expr);
      this.updateCalcDisplay();
    }

    handleCalcKey(key) {
      if (key === 'clear') {
        this.calcExpression = '0';
        this.updateCalcDisplay();
        return;
      }
      if (key === 'back') {
        this.calcExpression = this.calcExpression.slice(0, -1) || '0';
        this.updateCalcDisplay();
        return;
      }
      if (key === 'equals') {
        try {
          const value = this.evaluateCalcExpression(this.calcExpression);
          const result = this.formatCalcResult(value);
          if (result === '—') return;
          const history = this.getCalcHistory();
          history.unshift({ expression: this.calcExpression, result, createdAt: Date.now() });
          this.setSetting('tools.calcHistory', history.slice(0, 10));
          this.calcLastResult = result;
          this.calcExpression = result;
          this.updateCalcDisplay();
          this.renderCalcHistory();
          this.react('calc:result', { message: `Answer: ${result}` });
        } catch (error) {
          if (this.els.calcResult) this.els.calcResult.textContent = '—';
        }
        return;
      }
      this.appendCalcToken(key);
    }

    getCalcCurrentValue() {
      try {
        return this.evaluateCalcExpression(this.calcExpression);
      } catch (error) {
        const fallback = parseFloat(this.calcLastResult);
        return Number.isFinite(fallback) ? fallback : 0;
      }
    }

    handleCalcMemory(action) {
      const value = this.getCalcCurrentValue();
      if (action === 'mc') {
        this.calcMemory = 0;
      } else if (action === 'mr') {
        const stored = this.formatCalcResult(this.calcMemory);
        this.appendCalcToken(Number(stored) < 0 ? `(${stored})` : stored);
        return;
      } else if (action === 'mp') {
        this.calcMemory += value;
      } else if (action === 'mm') {
        this.calcMemory -= value;
      }
      this.setSetting('tools.calc.memory', this.calcMemory);
      this.updateCalcDisplay();
    }

    updateCalcDisplay() {
      if (!this.els.calcExpression) return;
      this.els.calcExpression.textContent = this.calcExpression || '0';

      let preview = '—';
      try {
        preview = this.formatCalcResult(this.evaluateCalcExpression(this.calcExpression));
      } catch (error) {
        // Incomplete expression — preview stays unset.
      }
      if (this.els.calcResult) this.els.calcResult.textContent = preview;

      document.querySelectorAll('[data-calc-angle]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.calcAngle === this.calcAngle);
      });

      if (this.els.calcMemory) {
        this.els.calcMemory.textContent = `M ${this.formatCalcResult(this.calcMemory)}`;
      }
    }

    formatCalcResult(value) {
      if (!Number.isFinite(value)) return '—';
      if (Math.abs(value) < 1e-12) return '0';
      if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
      return parseFloat(value.toPrecision(12)).toString();
    }

    evaluateCalcExpression(expression) {
      const tokens = this.tokenizeCalc(expression);
      const rpn = this.toRpnCalc(tokens);
      return this.evalRpnCalc(rpn);
    }

    tokenizeCalc(expression) {
      const tokens = [];
      const functions = ['asin', 'acos', 'atan', 'sin', 'cos', 'tan', 'sqrt', 'log', 'ln', 'abs', 'exp', 'floor', 'ceil', 'round', 'inv'];
      const text = String(expression || '');
      let i = 0;

      while (i < text.length) {
        const ch = text[i];
        if (/\s/.test(ch)) {
          i++;
          continue;
        }

        if (/[0-9.]/.test(ch)) {
          const match = text.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
          if (!match) throw new Error('Invalid number');
          const value = parseFloat(match[0]);
          if (!Number.isFinite(value)) throw new Error('Invalid number');
          tokens.push({ type: 'num', value });
          i += match[0].length;
          continue;
        }

        if (/[A-Za-zπ]/.test(ch)) {
          let j = i + 1;
          while (j < text.length && /[A-Za-zπ]/.test(text[j])) j++;
          const raw = text.slice(i, j);
          const name = raw === 'π' ? 'π' : raw.toLowerCase();
          if (name === 'π' || name === 'e') {
            tokens.push({ type: 'const', value: name });
          } else if (functions.includes(name)) {
            tokens.push({ type: 'func', value: name });
          } else {
            throw new Error(`Unknown name: ${raw}`);
          }
          i = j;
          continue;
        }

        if (ch === '+' || ch === '-') {
          const prev = tokens[tokens.length - 1];
          const unary = !prev || prev.type === 'op' || (prev.type === 'paren' && prev.value === '(');
          const powerUnary = unary && !!prev && prev.type === 'op' && prev.value === '^';
          tokens.push({ type: 'op', value: unary ? (ch === '-' ? 'u-' : 'u+') : ch, powerUnary });
          i++;
          continue;
        }

        if ('*/^!%'.includes(ch)) {
          tokens.push({ type: 'op', value: ch });
          i++;
          continue;
        }

        if (ch === '(' || ch === ')') {
          tokens.push({ type: 'paren', value: ch });
          i++;
          continue;
        }

        throw new Error(`Invalid character: ${ch}`);
      }

      return tokens;
    }

    toRpnCalc(tokens) {
      const precedence = {
        '+': 1, '-': 1, '*': 2, '/': 2,
        'u-': 2.5, 'u+': 2.5,
        '^': 3,
        '!': 6
      };
      const rightAssoc = { '^': true, 'u-': true, 'u+': true };
      const functions = { sin: 5, cos: 5, tan: 5, asin: 5, acos: 5, atan: 5, sqrt: 5, log: 5, ln: 5, abs: 5, exp: 5, floor: 5, ceil: 5, round: 5, inv: 5 };
      const output = [];
      const ops = [];
      let expectOperand = true;

      for (const token of tokens) {
        if (token.type === 'num' || token.type === 'const') {
          output.push(token);
          expectOperand = false;
        } else if (token.type === 'func') {
          ops.push({ type: 'func', value: token.value, prec: functions[token.value] });
          expectOperand = true;
        } else if (token.type === 'op' && (token.value === '!' || token.value === '%')) {
          if (expectOperand) throw new Error('Misplaced postfix operator');
          output.push(token);
        } else if (token.type === 'op') {
          const isUnary = token.value === 'u-' || token.value === 'u+';
          if (expectOperand && !isUnary) throw new Error('Misplaced operator');
          const curPrec = precedence[token.value];
          const right = !!rightAssoc[token.value];
          while (ops.length) {
            const top = ops[ops.length - 1];
            const topPrec = top.type === 'func' ? top.prec : precedence[top.value];
            if (
              top.type === 'paren' ||
              (top.powerUnary && token.value === '^') ||
              (token.powerUnary && top.value === '^')
            ) break;
            if (right ? topPrec <= curPrec : topPrec < curPrec) break;
            output.push(ops.pop());
          }
          ops.push(token);
          expectOperand = true;
        } else if (token.type === 'paren' && token.value === '(') {
          ops.push(token);
          expectOperand = true;
        } else if (token.type === 'paren' && token.value === ')') {
          if (expectOperand) throw new Error('Empty parentheses');
          while (ops.length && !(ops[ops.length - 1].type === 'paren' && ops[ops.length - 1].value === '(')) {
            output.push(ops.pop());
          }
          if (!ops.length) throw new Error('Unmatched parenthesis');
          ops.pop();
          if (ops.length && ops[ops.length - 1].type === 'func') output.push(ops.pop());
          expectOperand = false;
        }
      }

      if (expectOperand) throw new Error('Incomplete expression');
      while (ops.length) {
        const top = ops.pop();
        if (top.type === 'paren') throw new Error('Unmatched parenthesis');
        output.push(top);
      }

      return output;
    }

    evalRpnCalc(rpn) {
      const stack = [];
      for (const token of rpn) {
        if (token.type === 'num') {
          stack.push(token.value);
        } else if (token.type === 'const') {
          stack.push(token.value === 'π' ? Math.PI : Math.E);
        } else if (token.type === 'func') {
          if (stack.length < 1) throw new Error('Missing argument');
          stack.push(this.applyCalcFunction(token.value, stack.pop()));
        } else if (token.type === 'op') {
          if (token.value === '!') {
            if (stack.length < 1) throw new Error('Missing argument');
            stack.push(this.factorialCalc(stack.pop()));
          } else if (token.value === '%') {
            if (stack.length < 1) throw new Error('Missing argument');
            stack.push(stack.pop() / 100);
          } else if (token.value === 'u-') {
            if (stack.length < 1) throw new Error('Missing argument');
            stack.push(-stack.pop());
          } else if (token.value === 'u+') {
            if (stack.length < 1) throw new Error('Missing argument');
          } else {
            if (stack.length < 2) throw new Error('Missing argument');
            const b = stack.pop();
            const a = stack.pop();
            let result;
            if (token.value === '+') result = a + b;
            else if (token.value === '-') result = a - b;
            else if (token.value === '*') result = a * b;
            else if (token.value === '/') {
              if (b === 0) throw new Error('Division by zero');
              result = a / b;
            } else if (token.value === '^') result = Math.pow(a, b);
            else throw new Error('Unknown operator');
            if (!Number.isFinite(result)) throw new Error('Invalid result');
            stack.push(result);
          }
        }
      }
      if (stack.length !== 1) throw new Error('Invalid expression');
      return stack[0];
    }

    factorialCalc(value) {
      if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error('Factorial out of range');
      let result = 1;
      for (let i = 2; i <= value; i++) result *= i;
      return result;
    }

    applyCalcFunction(name, value) {
      const deg = this.calcAngle === 'deg';
      const toRad = (v) => deg ? v * Math.PI / 180 : v;
      const fromRad = (v) => deg ? v * 180 / Math.PI : v;
      let result;

      switch (name) {
        case 'sin': result = Math.sin(toRad(value)); break;
        case 'cos': result = Math.cos(toRad(value)); break;
        case 'tan': result = Math.tan(toRad(value)); break;
        case 'asin': result = fromRad(Math.asin(value)); break;
        case 'acos': result = fromRad(Math.acos(value)); break;
        case 'atan': result = fromRad(Math.atan(value)); break;
        case 'sqrt':
          if (value < 0) throw new Error('Negative square root');
          result = Math.sqrt(value);
          break;
        case 'log':
          if (value <= 0) throw new Error('Invalid logarithm');
          result = Math.log10(value);
          break;
        case 'ln':
          if (value <= 0) throw new Error('Invalid logarithm');
          result = Math.log(value);
          break;
        case 'inv':
          if (value === 0) throw new Error('Division by zero');
          result = 1 / value;
          break;
        case 'abs': result = Math.abs(value); break;
        case 'exp': result = Math.exp(value); break;
        case 'floor': result = Math.floor(value); break;
        case 'ceil': result = Math.ceil(value); break;
        case 'round': result = Math.round(value); break;
        default: throw new Error('Unknown function');
      }

      if (!Number.isFinite(result)) throw new Error('Invalid result');
      return result;
    }

    populateConverterUnits() {
      if (!this.els.convertType || !this.els.convertFrom || !this.els.convertTo) return;
      const type = this.els.convertType.value || 'length';
      const units = COUCOU_CONVERTER_UNITS[type] || COUCOU_CONVERTER_UNITS.length;
      const options = units.map((unit) => `<option value="${unit.key}">${unit.label}</option>`).join('');

      const from = this.els.convertFrom.value || units[0].key;
      const to = this.els.convertTo.value || (units[1] || units[0]).key;

      this.els.convertFrom.innerHTML = options;
      this.els.convertTo.innerHTML = options;
      this.els.convertFrom.value = units.some((u) => u.key === from) ? from : units[0].key;
      this.els.convertTo.value = units.some((u) => u.key === to) ? to : (units[1] || units[0]).key;
    }

    swapConverterUnits() {
      if (!this.els.convertFrom || !this.els.convertTo) return;
      const from = this.els.convertFrom.value;
      this.els.convertFrom.value = this.els.convertTo.value;
      this.els.convertTo.value = from;
      this.convertUnit();
      this.react('convert:swapped');
    }

    convertUnit(shouldReact = false) {
      if (!this.els.convertResult || !this.els.convertFrom || !this.els.convertTo) return;
      const type = this.els.convertType ? this.els.convertType.value : 'length';
      const from = this.els.convertFrom.value;
      const to = this.els.convertTo.value;
      const value = parseFloat(this.els.convertValue ? this.els.convertValue.value : '0');

      if (!Number.isFinite(value)) {
        this.els.convertResult.innerHTML = `—<small>Enter a number</small>`;
        return;
      }

      let result = value;
      if (type === 'temperature') {
        const toCelsius = (v, unit) => unit === 'C' ? v : unit === 'F' ? (v - 32) * 5 / 9 : v - 273.15;
        const fromCelsius = (v, unit) => unit === 'C' ? v : unit === 'F' ? v * 9 / 5 + 32 : v + 273.15;
        result = fromCelsius(toCelsius(value, from), to);
      } else {
        const units = COUCOU_CONVERTER_UNITS[type] || [];
        const fromUnit = units.find((u) => u.key === from);
        const toUnit = units.find((u) => u.key === to);
        if (fromUnit && toUnit) result = value * fromUnit.factor / toUnit.factor;
      }

      this.els.convertResult.innerHTML = `${this.formatNumber(result)} ${to}<small>${this.formatNumber(value)} ${from}</small>`;
      if (shouldReact) {
        this.react('convert:result', { message: `${this.formatNumber(result)} ${to}` });
      }
    }

    isClipboardWatchAllowed() {
      return this.getSetting('settings.privacy.allowClipboard', true) !== false &&
        this.getSetting('settings.privacy.clipboardWatch', true) !== false;
    }

    getClipboardHistory() {
      const list = this.getSetting('tools.clipboardHistory', []);
      if (!Array.isArray(list)) return [];
      return list.map((item) => {
        const source = item && typeof item === 'object' ? item : {};
        const copiedAt = Number(source.copiedAt);
        return {
          text: typeof source.text === 'string' ? source.text.slice(0, 8000) : '',
          copiedAt: Number.isFinite(copiedAt) && copiedAt > 0 ? copiedAt : Date.now()
        };
      }).filter((item) => item.text.trim()).slice(0, 50);
    }

    syncClipboardBaseline() {
      const history = this.getClipboardHistory();
      this.lastWatchedText = history.length ? history[0].text : '';
    }

    normalizeClipboardPayload(payload) {
      if (!payload) return null;
      if (typeof payload === 'string') {
        return { text: payload, copiedAt: Date.now() };
      }
      if (typeof payload !== 'object') return null;
      const text = typeof payload.text === 'string' ? payload.text : '';
      const copiedAt = Number(payload.copiedAt);
      return {
        text,
        copiedAt: Number.isFinite(copiedAt) && copiedAt > 0 ? copiedAt : Date.now()
      };
    }

    refreshClipboardFromStore() {
      this.renderClipboardHistory();
      this.updateClipboardNote();
    }

    renderClipboardHistory() {
      if (!this.els.clipHistory) return;
      const list = this.getClipboardHistory();
      if (this.els.clipHistoryCount) {
        this.els.clipHistoryCount.textContent = list.length ? `(${list.length}/50)` : '';
      }
      if (list.length === 0) {
        this.els.clipHistory.innerHTML = '<div class="tool-empty">No saved copies yet.</div>';
        return;
      }

      this.els.clipHistory.innerHTML = list.map((item, index) => {
        const preview = item.text.replace(/\s+/g, ' ').trim().slice(0, 110);
        return `
          <div class="clip-history-item">
            <div class="clip-history-line">
              <button class="clip-history-text" data-clip-load="${index}" title="Load into preview">${this.escapeHtml(preview)}</button>
              <time>${this.escapeHtml(this.formatRelativeTime(item.copiedAt))}</time>
            </div>
            <div class="clip-history-actions">
              <button class="tool-chip" data-clip-copy="${index}" title="Copy this text back">Copy</button>
              <button class="tool-chip" data-clip-insert="${index}" title="Insert into chat">Insert</button>
            </div>
          </div>
        `;
      }).join('');
    }

    updateClipboardNote() {
      if (!this.els.clipNote) return;
      const allowed = this.getSetting('settings.privacy.allowClipboard', true) !== false;
      const text = this.els.clipText ? this.els.clipText.value : '';
      const hasText = text.trim().length > 0;
      const size = this.getClipboardHistory().length;
      const watching = this.isClipboardWatchAllowed() ? 'Watching is on.' : 'Watching is off.';

      if (!allowed) {
        this.els.clipNote.textContent = 'Clipboard actions are disabled in Privacy.';
      } else if (hasText) {
        this.els.clipNote.textContent = `${text.length} characters ready.${size ? ` ${size} saved cop${size === 1 ? 'y' : 'ies'}.` : ''}`;
      } else if (size) {
        this.els.clipNote.textContent = `${size} saved cop${size === 1 ? 'y' : 'ies'}. Click one to load it.`;
      } else {
        this.els.clipNote.textContent = watching;
      }
    }

    pushClipboardHistory(text, copiedAt) {
      const clean = String(text || '').trim().slice(0, 8000);
      this.lastWatchedText = clean;
      if (!clean.trim()) return false;

      const item = this.normalizeClipboardPayload({ text: clean, copiedAt });
      const history = this.getClipboardHistory();
      const duplicate = history.length > 0 && history[0].text === clean;
      if (!duplicate) {
        this.setSetting('tools.clipboardHistory', [item, ...history].slice(0, 50));
      }
      this.refreshClipboardFromStore();
      return !duplicate;
    }

    onClipboardChanged(event, payload) {
      const data = this.normalizeClipboardPayload(
        payload || (event && typeof event === 'object' && event.text ? event : null)
      );
      if (!data || !data.text.trim()) return;
      if (!this.isClipboardWatchAllowed()) return;

      if (this.lastWatchedText === null) this.syncClipboardBaseline();
      if (data.text === this.lastWatchedText) {
        // Initial sync or repeated event for text we already handled.
        this.refreshClipboardFromStore();
        return;
      }

      this.pushClipboardHistory(data.text, data.copiedAt);
      this.react('clipboard:watched', { message: 'New clipboard copy saved.' });
    }

    async clearClipboardHistory() {
      const result = await this.invokeApp('clipboard:clear-history');
      if (!result || result.success !== true) {
        this.setSetting('tools.clipboardHistory', []);
      }
      this.syncClipboardBaseline();
      this.refreshClipboardFromStore();
    }

    async copyClipboardText(text, button) {
      if (!text) return;
      if (this.getSetting('settings.privacy.allowClipboard', true) === false) {
        this.updateClipboardNote();
        return;
      }

      let copied = false;
      const result = await this.invokeApp('clipboard:write', text);
      copied = !!result && result.success === true;
      if (!copied && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (error) {
          copied = false;
        }
      }
      if (!copied) {
        if (this.els.clipNote) this.els.clipNote.textContent = 'Copy blocked. Select the text manually.';
        return;
      }

      if (button) {
        const original = button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => {
          if (button.isConnected) button.textContent = original;
        }, 1000);
      }
      this.react('clipboard:copied');
    }

    updateMarkdownPreview() {
      if (!this.els.mdPreview || !this.els.mdInput) return;
      const raw = this.els.mdInput.value || '';
      this.els.mdPreview.innerHTML = raw.trim()
        ? (this.chatTab && typeof this.chatTab.formatMarkdown === 'function'
            ? this.chatTab.formatMarkdown(raw)
            : this.escapeHtml(raw))
        : '<span class="tool-empty">Preview appears as you type.</span>';
    }

    async readClipboard() {
      if (this.getSetting('settings.privacy.allowClipboard', true) === false) {
        this.updateClipboardNote();
        return;
      }

      let data = null;
      const result = await this.invokeApp('clipboard:read');
      if (result && (typeof result === 'object' || typeof result === 'string')) {
        data = this.normalizeClipboardPayload(result);
      }

      if (!data || !data.text.trim()) {
        // Safe browser fallback when the bridge is absent or has no access.
        try {
          if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
            const fallback = await navigator.clipboard.readText();
            if (typeof fallback === 'string' && fallback.trim()) {
              data = { text: fallback, copiedAt: Date.now() };
            }
          }
        } catch (error) {
          // Read blocked — reported below.
        }
      }

      if (!data || !data.text.trim()) {
        if (this.els.clipNote) {
          this.els.clipNote.textContent = 'Clipboard read blocked. Paste manually.';
        }
        return;
      }

      const text = data.text.slice(0, 8000);
      if (this.els.clipText) this.els.clipText.value = text;
      this.pushClipboardHistory(text, data.copiedAt);
      // Main records this read and notifies other panel windows.
      this.invokeApp('clipboard:record', text).catch(() => {});
      this.updateClipboardNote();
      this.react('clipboard:read');
    }

    clipboardAction(action) {
      const raw = this.els.clipText ? this.els.clipText.value.trim() : '';
      if (!raw) return;

      const prompts = {
        explain: 'Explain this code/text clearly, then list the key points:\n\n',
        debug: 'Find the likely bug(s) and suggest a concrete fix for:\n\n',
        format: 'Format and clean up this code/text. Return only the cleaned result:\n\n',
        summarize: 'Summarize this in 5 concise bullet points:\n\n',
        test: 'Write focused unit tests for this code:\n\n'
      };

      this.sendToChat(`${prompts[action] || ''}${raw}`, true);
      this.react('clipboard:inserted');
    }

    sendToChat(text, redact) {
      if (!text || !text.trim()) return;
      let finalText = text;
      if (redact && this.chatTab && typeof this.chatTab.redactText === 'function') {
        finalText = this.chatTab.redactText(finalText);
      }
      if (this.chatTab && typeof this.chatTab.insertIntoInput === 'function') {
        this.chatTab.insertIntoInput(finalText);
      }
      this.panel.switchTab('chat');
      if (this.chatTab && typeof this.chatTab.focusInput === 'function') {
        this.chatTab.focusInput();
      }
    }

    normalizeHex(value) {
      let hex = String(value || '').trim().replace(/^#/, '');
      if (/^[0-9a-f]{3}$/i.test(hex)) {
        hex = hex.split('').map((c) => c + c).join('');
      }
      if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
      return `#${hex.toUpperCase()}`;
    }

    hexToRgb(hex) {
      const clean = this.normalizeHex(hex) || '#007aff';
      return {
        r: parseInt(clean.slice(1, 3), 16),
        g: parseInt(clean.slice(3, 5), 16),
        b: parseInt(clean.slice(5, 7), 16)
      };
    }

    rgbToHsl({ r, g, b }) {
      const rr = r / 255;
      const gg = g / 255;
      const bb = b / 255;
      const max = Math.max(rr, gg, bb);
      const min = Math.min(rr, gg, bb);
      const delta = max - min;
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;

      if (delta !== 0) {
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
        if (max === rr) h = ((gg - bb) / delta + (gg < bb ? 6 : 0));
        else if (max === gg) h = (bb - rr) / delta + 2;
        else h = (rr - gg) / delta + 4;
        h /= 6;
      }

      return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    colorName(rgb) {
      const { r, g, b } = rgb;
      if (r > 220 && g > 220 && b > 220) return 'White';
      if (r < 45 && g < 45 && b < 45) return 'Black';
      if (r > 180 && g < 110 && b < 100) return 'Red';
      if (r > 180 && g > 100 && b < 100) return 'Orange';
      if (r > 180 && g > 170 && b < 120) return 'Yellow';
      if (g > 150 && r < 140) return 'Green';
      if (b > 170 && r < 140) return 'Blue';
      if (r > 150 && b > 150 && g < 130) return 'Purple';
      if (r > 170 && g > 140 && b > 140) return 'Pink';
      return 'Custom';
    }

    luminance(rgb) {
      const channel = (v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
    }

    contrastRatio(rgb) {
      const bg = this.luminance({ r: 20, g: 20, b: 24 });
      const fg = this.luminance(rgb);
      const light = Math.max(bg, fg);
      const dark = Math.min(bg, fg);
      return (light + 0.05) / (dark + 0.05);
    }

    updateColor(value) {
      const hex = this.normalizeHex(value) || '#007aff';
      const rgb = this.hexToRgb(hex);
      const hsl = this.rgbToHsl(rgb);

      if (this.els.colorPicker) this.els.colorPicker.value = hex;
      if (this.els.colorHex) this.els.colorHex.value = hex;
      if (this.els.colorHexLabel) this.els.colorHexLabel.textContent = hex;
      if (this.els.colorRgb) this.els.colorRgb.textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
      if (this.els.colorHsl) this.els.colorHsl.textContent = `${hsl.h}, ${hsl.s}%, ${hsl.l}%`;
      if (this.els.colorName) this.els.colorName.textContent = this.colorName(rgb);

      if (this.els.contrast) {
        const ratio = this.contrastRatio(rgb);
        this.els.contrast.className = 'contrast-result';
        if (ratio >= 4.5) {
          this.els.contrast.classList.add('good');
          this.els.contrast.textContent = `Contrast vs panel: ${ratio.toFixed(2)}:1 · AA pass`;
        } else if (ratio >= 3) {
          this.els.contrast.classList.add('warn');
          this.els.contrast.textContent = `Contrast vs panel: ${ratio.toFixed(2)}:1 · large text only`;
        } else {
          this.els.contrast.classList.add('bad');
          this.els.contrast.textContent = `Contrast vs panel: ${ratio.toFixed(2)}:1 · low`;
        }
      }

      if (this.els.palette) {
        const shades = [0.55, 0.75, 1, 1.25, 1.5];
        this.els.palette.innerHTML = shades.map((factor) => {
          const c = {
            r: Math.max(0, Math.min(255, Math.round(rgb.r * factor))),
            g: Math.max(0, Math.min(255, Math.round(rgb.g * factor))),
            b: Math.max(0, Math.min(255, Math.round(rgb.b * factor)))
          };
          const shadeHex = `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
          return `<button class="tool-chip" data-shade="${shadeHex}" style="border-color:${shadeHex};color:${shadeHex};">${shadeHex}</button>`;
        }).join('');
      }
    }

    async pickScreenColor() {
      if (typeof window.EyeDropper !== 'function') {
        if (this.els.eyedropper) this.els.eyedropper.textContent = 'Eyedropper not supported';
        return;
      }
      try {
        const result = await new window.EyeDropper().open();
        this.updateColor(result.sRGBHex);
      } catch (error) {
        // User cancelled — no action needed.
      }
    }

    getSnippets() {
      const list = this.getSetting('savedPrompts', []);
      return Array.isArray(list) ? list.slice(0, 30) : [];
    }

    addSnippet() {
      const name = (this.els.snippetName && this.els.snippetName.value || '').trim();
      const body = (this.els.snippetBody && this.els.snippetBody.value || '').trim();
      if (!name || !body) return;

      const list = this.getSnippets();
      list.unshift({ name: name.slice(0, 60), body: body.slice(0, 2000), createdAt: Date.now() });
      this.setSetting('savedPrompts', list.slice(0, 30));

      if (this.els.snippetName) this.els.snippetName.value = '';
      if (this.els.snippetBody) this.els.snippetBody.value = '';
      this.renderSnippets();
      this.react('snippet:saved', { message: `Saved “${name.slice(0, 40)}”` });
    }

    renderSnippets() {
      if (!this.els.snippetList) return;
      const list = this.getSnippets();

      if (list.length === 0) {
        this.els.snippetList.innerHTML = '<div class="tool-empty">No saved prompts yet.</div>';
        return;
      }

      this.els.snippetList.innerHTML = list.map((item, index) => `
        <div class="snippet-item">
          <div class="snippet-item-head">
            <span class="snippet-name">${this.escapeHtml(item.name)}</span>
            <span class="snippet-actions">
              <button data-snippet-use="${index}" title="Insert into chat">Use</button>
              <button data-snippet-delete="${index}" title="Delete">×</button>
            </span>
          </div>
          <div class="snippet-body">${this.escapeHtml(item.body)}</div>
        </div>
      `).join('');
    }
  }

  window.LightweightTools = LightweightTools;
})();
