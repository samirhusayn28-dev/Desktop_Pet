/**
 * Pixie Panel — compact in-panel Settings section.
 * No extra window. Settings are saved immediately and Pixie reacts to changes.
 */

(function () {
  const IS_WINDOWS = typeof process !== 'undefined' && process.platform === 'win32';

  const APPEARANCE_DEFAULTS = {
    scale: 1,
    width: 136,
    height: 120,
    roundness: 36,
    eyeSize: 1,
    eyeSpacing: 44,
    mouthWidth: 14,
    depth: 80,
    bodyColor: '#111111',
    accentColor: '#007aff',
    mouthColor: '#111111'
  };

  const PROVIDER_DEFAULTS = {
    gemini: 'gemini-2.0-flash-lite',
    groq: 'llama-3.3-70b-versatile',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-20241022',
    qwen: 'qwen-turbo',
    deepseek: 'deepseek-chat',
    openrouter: 'anthropic/claude-3.5-sonnet',
    ollama: 'llama3',
    custom: 'default'
  };

  const PROVIDERS = [
    ['gemini', 'Gemini'],
    ['groq', 'Groq'],
    ['openai', 'OpenAI'],
    ['anthropic', 'Claude'],
    ['qwen', 'Qwen'],
    ['deepseek', 'DeepSeek'],
    ['openrouter', 'OpenRouter'],
    ['ollama', 'Ollama'],
    ['custom', 'Custom']
  ];

  const ACCENTS = ['#007aff', '#38BDF8', '#10B981', '#A855F7', '#F43F5E'];

  class PanelSettingsTab {
    constructor(panel) {
      this.panel = panel;
      this.store = panel.store;
      this.ipc = panel.ipcRenderer;
      this.root = document.getElementById('tool-pane-settings');
      this.bound = false;
      this.pendingImport = null;
      this.appearance = Object.assign({}, APPEARANCE_DEFAULTS, this.store.get('settings.appearance') || {});

      this.render();
      this.bind();
      this.refresh();
    }

    get(path, fallback) {
      const value = this.store.get(path);
      return value === undefined || value === null ? fallback : value;
    }

    set(path, value) {
      this.store.set(path, value);
    }

    escape(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    toggle(id, label, checked, hint = '') {
      return `
        <label class="settings-toggle" for="${id}">
          <span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>
          <span class="tool-switch"><input type="checkbox" id="${id}" data-toggle="${id}" ${checked ? 'checked' : ''}><span></span></span>
        </label>
      `;
    }

    range(id, label, key, min, max, step, value, suffix = '') {
      return `
        <label class="settings-range" for="${id}">
          <span>${label}<b data-value-for="${key}">${this.formatAppearance(key, value)}${suffix}</b></span>
          <input type="range" id="${id}" data-appearance="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
        </label>
      `;
    }

    formatAppearance(key, value) {
      if (key === 'scale' || key === 'eyeSize') return `${Number(value).toFixed(2)}x`;
      if (key === 'roundness' || key === 'depth') return `${value}%`;
      return String(value);
    }

    render() {
      if (!this.root || this.root.dataset.built === 'true') return;
      this.root.dataset.built = 'true';

      const provider = this.get('settings.ai.activeProvider', 'gemini');
      const providerOptions = PROVIDERS.map(([value, label]) =>
        `<option value="${value}" ${value === provider ? 'selected' : ''}>${label}</option>`
      ).join('');
      const accents = ACCENTS.map((color) =>
        `<button type="button" class="settings-accent" data-accent="${color}" style="--swatch:${color}" title="${color}" aria-label="Use ${color}"></button>`
      ).join('');

      this.root.innerHTML = `
        <section class="tool-section settings-card">
          <div class="tool-section-title">Identity</div>
          <div class="settings-grid">
            <label><span>Your name</span><input class="tool-input" id="set-user-name" maxlength="30" placeholder="Your name"></label>
            <label><span>Pet name</span><input class="tool-input" id="set-pet-name" maxlength="24" placeholder="Pixie"></label>
          </div>
        </section>

        <section class="tool-section settings-card">
          <div class="tool-section-title">Pet shape</div>
          <div class="settings-ranges">
            ${this.range('set-scale', 'Size', 'scale', 0.6, 1.5, 0.05, this.appearance.scale)}
            ${this.range('set-width', 'Width', 'width', 70, 190, 2, this.appearance.width)}
            ${this.range('set-height', 'Height', 'height', 70, 180, 2, this.appearance.height)}
            ${this.range('set-roundness', 'Roundness', 'roundness', 0, 50, 1, this.appearance.roundness)}
            ${this.range('set-depth', '3D depth', 'depth', 0, 100, 5, this.appearance.depth)}
            ${this.range('set-eye-size', 'Eye size', 'eyeSize', 0.6, 1.5, 0.05, this.appearance.eyeSize)}
          </div>
          <label class="settings-color" for="set-body-color">
            <span>Body color</span>
            <input type="color" id="set-body-color" data-appearance-color="bodyColor" value="${this.escape(this.appearance.bodyColor)}">
          </label>
        </section>

        <section class="tool-section settings-card">
          <div class="tool-section-title">Panel &amp; behavior</div>
          <label class="settings-color" for="set-accent-color">
            <span>Accent</span>
            <span class="settings-accents">${accents}<input type="color" id="set-accent-color" data-appearance-color="accentColor" value="${this.escape(this.appearance.accentColor)}" aria-label="Custom accent color"></span>
          </label>
          <div class="tool-section-note">Solid matte surface. No transparency or blur.</div>
          ${this.toggle('set-sounds', 'Sounds', this.get('settings.behavior.soundsEnabled', true) !== false, 'Reminders, timers and reactions')}
          ${this.toggle('set-always-on-top', 'Always on top', this.get('settings.general.alwaysOnTop', true) !== false)}
          ${this.toggle('set-launch-login', 'Launch at login', this.get('settings.general.launchAtLogin', false) === true)}
          ${this.toggle('set-auto-update', 'Auto update check', this.get('settings.general.autoUpdateCheck', true) !== false)}
        </section>

        <section class="tool-section settings-card">
          <div class="tool-section-title">AI assistant</div>
          <div class="settings-grid">
            <label><span>Provider</span><select class="tool-select" id="set-provider">${providerOptions}</select></label>
            <label><span>Model</span><select class="tool-select" id="set-model"></select></label>
          </div>
          <label class="settings-password" for="set-api-key">
            <span>API key</span>
            <span class="settings-password-row">
              <input class="tool-input" id="set-api-key" type="password" placeholder="Stored in OS keychain" autocomplete="off">
              <button type="button" class="tool-chip" id="set-toggle-key">Show</button>
              <button type="button" class="tool-chip" id="set-refresh-models">Models</button>
            </span>
          </label>
          <div class="settings-actions">
            <button type="button" class="tool-btn primary" id="set-save-ai">Save AI</button>
            <button type="button" class="tool-btn" id="set-test-ai">Test</button>
          </div>
          <div class="settings-status" id="set-ai-status" aria-live="polite"></div>
        </section>

        <section class="tool-section settings-card">
          <div class="tool-section-title">Privacy</div>
          ${this.toggle('set-context', 'Desktop context', this.get('settings.privacy.context', true) !== false, 'Attached only when you send')}
          ${this.toggle('set-clipboard', 'Clipboard actions', this.get('settings.privacy.allowClipboard', true) !== false)}
          ${this.toggle('set-screenshot', 'Screenshot context', this.get('settings.privacy.allowScreenshot', false) === true)}
          ${this.toggle('set-redact', 'Redact secrets', this.get('settings.privacy.redactSecrets', true) !== false)}
          <label class="settings-field" for="set-never-send"><span>Never send</span><input class="tool-input" id="set-never-send" placeholder="prod-db, internal-token" value="${this.escape(this.get('settings.privacy.neverSend', ''))}"></label>
        </section>

        <section class="tool-section settings-card">
          <div class="tool-section-title">Typing everywhere</div>
          <div class="settings-status" id="set-typing-status" aria-live="polite">Checking…</div>
          <div class="settings-actions">
            <button type="button" class="tool-btn" id="set-typing-restart">Restart helper</button>
            <button type="button" class="tool-btn" id="set-typing-permissions">${IS_WINDOWS ? 'Windows settings' : 'Accessibility'}</button>
            ${IS_WINDOWS ? '' : '<button type="button" class="tool-btn" id="set-typing-input-monitoring">Input Monitoring</button>'}
          </div>
          <div class="tool-section-note">In-panel typing always works. For typing in other apps on macOS: open <b>System Settings → Privacy &amp; Security → Accessibility</b>, enable <b>Pixie</b>, then click <b>Restart helper</b>. If Pixie is not listed, click <b>Accessibility</b> here first. On newer macOS, also enable Pixie in <b>Input Monitoring</b> if needed.</div>
        </section>

        <section class="tool-section settings-card">
          <div class="tool-section-title">Backup &amp; about</div>
          <div class="settings-actions">
            <button type="button" class="tool-btn primary" id="set-export">Full export</button>
            <button type="button" class="tool-btn" id="set-import">Full import</button>
            <button type="button" class="tool-btn" id="set-update">Check updates</button>
            <button type="button" class="tool-btn" id="set-github">GitHub</button>
          </div>
          <div class="settings-status" id="set-data-status" aria-live="polite">Backups include settings, notes, tasks, history and API keys. Keep the file private.</div>
          <div class="settings-status" id="set-update-status" aria-live="polite"></div>
          <div class="settings-version" id="set-version">Pixie</div>
        </section>
      `;
    }

    bind() {
      if (this.bound || !this.root) return;
      this.bound = true;

      this.root.addEventListener('input', (event) => {
        const el = event.target;
        if (!el || !el.dataset) return;
        if (el.dataset.appearance !== undefined) this.handleAppearanceInput(el);
        if (el.dataset.appearanceColor !== undefined) this.handleAppearanceColor(el);
      });

      this.root.addEventListener('change', (event) => {
        const el = event.target;
        if (!el || !el.dataset) return;
        if (el.dataset.appearance !== undefined) {
          this.panel.reactToPanelAction('settings:saved', { message: 'Pixie shape updated.' });
          return;
        }
        if (el.dataset.appearanceColor !== undefined) {
          this.applyAccentIfNeeded(el.dataset.appearanceColor);
          this.panel.reactToPanelAction('color:applied', { message: 'Color updated.' });
          return;
        }
        if (el.dataset.toggle !== undefined) {
          this.handleToggle(el);
          return;
        }
        if (el.id === 'set-provider') this.handleProviderChange(el.value);
        if (el.id === 'set-model') {
          this.set(`settings.ai.models.${this.currentProvider()}`, el.value);
        }
        if (el.id === 'set-never-send') {
          this.set('settings.privacy.neverSend', el.value.trim());
        }
        if (el.id === 'set-user-name') {
          const name = el.value.trim();
          this.set('settings.general.userName', name);
          if (this.ipc) this.ipc.send('settings:user-name-changed', name);
          this.panel.reactToPanelAction('settings:saved', { message: 'Name saved.' });
        }
        if (el.id === 'set-pet-name') {
          const name = el.value.trim() || 'Pixie';
          this.set('settings.general.petName', name);
          this.panel.applyPetName(name);
          if (this.ipc) this.ipc.send('pet:update-name', name);
          this.panel.reactToPanelAction('settings:saved', { message: 'Pixie has a new name.' });
        }
      });

      this.root.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('button') : null;
        if (!btn) return;

        if (btn.dataset.accent) {
          const color = btn.dataset.accent;
          const input = this.root.querySelector('#set-accent-color');
          if (input) input.value = color;
          this.setAppearanceValue('accentColor', color);
          this.applyAccentIfNeeded('accentColor');
          this.panel.reactToPanelAction('color:applied');
          return;
        }

        if (btn.id === 'set-update-download') {
          const url = btn.dataset.url || '';
          if (url && this.ipc) this.ipc.send('update:open-download', url);
          return;
        }

        switch (btn.id) {
          case 'set-toggle-key': {
            const key = this.root.querySelector('#set-api-key');
            if (key) key.type = key.type === 'password' ? 'text' : 'password';
            btn.textContent = key && key.type === 'password' ? 'Show' : 'Hide';
            break;
          }
          case 'set-refresh-models':
            this.fetchModels(true);
            break;
          case 'set-save-ai':
            this.saveAi();
            break;
          case 'set-test-ai':
            this.testAi();
            break;
          case 'set-export':
            this.exportData();
            break;
          case 'set-import':
            this.importData();
            break;
          case 'set-update':
            if (this.ipc) this.ipc.send('update:check-now');
            this.setStatus('set-update-status', 'Checking for updates...', 'info');
            this.panel.reactToPanelAction('settings:saved', { message: 'Checking updates.' });
            break;
          case 'set-typing-restart':
            this.restartTypingHelper();
            break;
          case 'set-typing-permissions':
            if (IS_WINDOWS) {
              if (this.ipc) this.ipc.send('system:open-permission-settings', 'privacy');
            } else if (this.ipc && typeof this.ipc.invoke === 'function') {
              this.setStatus('set-typing-status', 'Requesting Accessibility from Pixie…', 'info');
              this.ipc.invoke('typing:request-permission').then((status) => {
                if (!status || status.accessibility !== 'granted') {
                  if (this.ipc) this.ipc.send('system:open-permission-settings', 'accessibility');
                  this.setStatus('set-typing-status', 'Grant Pixie in Accessibility, then click Restart helper.', 'info');
                  return;
                }
                return this.refreshTypingStatus();
              }).catch(() => {
                if (this.ipc) this.ipc.send('system:open-permission-settings', 'accessibility');
                this.refreshTypingStatus();
              });
            }
            break;
          case 'set-typing-input-monitoring':
            if (this.ipc) this.ipc.send('system:open-permission-settings', 'inputMonitoring');
            break;
          case 'set-github':
            if (this.ipc) this.ipc.send('system:open-settings-pane', 'about');
            break;
        }
      });

      if (this.ipc && !this._updateStatusBound) {
        this._updateStatusBound = true;
        this.ipc.on('update:status', (_event, payload) => {
          this.handleUpdateStatus(payload || {});
        });
      }
    }

    currentProvider() {
      const el = this.root && this.root.querySelector('#set-provider');
      return (el && el.value) || this.get('settings.ai.activeProvider', 'gemini');
    }

    handleAppearanceInput(el) {
      const key = el.dataset.appearance;
      const value = el.type === 'range' ? Number(el.value) : el.value;
      this.setAppearanceValue(key, value);

      const label = this.root.querySelector(`[data-value-for="${key}"]`);
      if (label) label.textContent = this.formatAppearance(key, value);

      this.panel.renderHeaderPetFace();
      if (this.ipc) this.ipc.send('pet:update-appearance', this.appearance);
    }

    setAppearanceValue(key, value) {
      this.appearance[key] = value;
      this.set('settings.appearance', this.appearance);
      if (key === 'accentColor') {
        this.appearance.primaryColor = value;
        this.appearance.primaryGlow = value;
        this.set('settings.appearance.primaryColor', value);
        this.set('settings.appearance.primaryGlow', value);
      }
    }

    handleAppearanceColor(el) {
      const key = el.dataset.appearanceColor;
      this.setAppearanceValue(key, el.value);
      this.panel.renderHeaderPetFace();
      if (this.ipc) this.ipc.send('pet:update-appearance', this.appearance);
    }

    applyAccentIfNeeded(key) {
      if (key !== 'accentColor') return;
      const color = this.appearance.accentColor || '#007aff';
      if (window.ThemeManager && typeof window.ThemeManager.applyAccentColor === 'function') {
        window.ThemeManager.applyAccentColor(document, color);
      }
      if (this.ipc) this.ipc.send('pet:update-accent', color);
      this.panel.applyInitialTheme();
    }

    handleToggle(el) {
      const id = el.dataset.toggle;
      const checked = !!el.checked;

      switch (id) {
        case 'set-sounds':
          this.set('settings.behavior.soundsEnabled', checked);
          if (this.ipc) this.ipc.send('settings:sound-changed', { soundsEnabled: checked });
          break;
        case 'set-always-on-top':
          this.set('settings.general.alwaysOnTop', checked);
          if (this.ipc) this.ipc.send('window:set-always-on-top', checked);
          break;
        case 'set-launch-login':
          this.set('settings.general.launchAtLogin', checked);
          if (this.ipc) this.ipc.send('window:set-launch-login', checked);
          break;
        case 'set-auto-update':
          this.set('settings.general.autoUpdateCheck', checked);
          break;
        case 'set-context':
          this.set('settings.privacy.context', checked);
          this.set('settings.privacy.contextAwareness', checked);
          this.panel.refreshStatusFooter();
          this.panel.reactToPanelAction('privacy:updated');
          break;
        case 'set-clipboard':
          this.set('settings.privacy.allowClipboard', checked);
          this.panel.reactToPanelAction('privacy:updated');
          break;
        case 'set-screenshot':
          this.set('settings.privacy.allowScreenshot', checked);
          this.set('settings.privacy.allowScreenshots', checked);
          this.panel.reactToPanelAction('privacy:updated');
          break;
        case 'set-redact':
          this.set('settings.privacy.redactSecrets', checked);
          this.panel.reactToPanelAction('privacy:updated');
          break;
      }
    }

    async handleProviderChange(provider) {
      this.set('settings.ai.activeProvider', provider);
      this.panel.applyInitialTheme();
      this.updateModelsForProvider(provider);
      await this.loadApiKey(provider);
      await this.fetchModels(false);
    }

    updateModelsForProvider(provider, selectedModel = null) {
      const select = this.root && this.root.querySelector('#set-model');
      if (!select) return;
      const saved = selectedModel || this.get(`settings.ai.models.${provider}`, PROVIDER_DEFAULTS[provider] || 'default');
      const options = Array.from(new Set([saved, PROVIDER_DEFAULTS[provider] || 'default'])).filter(Boolean);
      select.innerHTML = options.map((model) => `<option value="${this.escape(model)}">${this.escape(model)}</option>`).join('');
    }

    async loadApiKey(provider) {
      const input = this.root && this.root.querySelector('#set-api-key');
      if (!input) return;
      let key = '';
      try {
        if (this.ipc && typeof this.ipc.invoke === 'function') {
          key = await this.ipc.invoke('ai:get-key', provider) || '';
        }
      } catch (error) {
        key = this.get(`settings.ai.apiKeys.${provider}`, '');
      }
      input.value = key || '';
    }

    async fetchModels(manual) {
      const provider = this.currentProvider();
      const keyInput = this.root && this.root.querySelector('#set-api-key');
      const apiKey = keyInput ? keyInput.value.trim() : '';
      if (!apiKey && !['ollama', 'custom'].includes(provider)) {
        if (manual) this.setStatus('set-ai-status', 'Add an API key first.', 'error');
        return;
      }
      try {
        const res = this.ipc ? await this.ipc.invoke('ai:fetch-models', { provider, apiKey }) : null;
        if (res && res.success && Array.isArray(res.models) && res.models.length) {
          const select = this.root.querySelector('#set-model');
          const saved = this.get(`settings.ai.models.${provider}`, PROVIDER_DEFAULTS[provider] || 'default');
          select.innerHTML = res.models.map((model) =>
            `<option value="${this.escape(model)}" ${model === saved ? 'selected' : ''}>${this.escape(model)}</option>`
          ).join('');
          if (manual) this.setStatus('set-ai-status', `${res.models.length} models loaded.`, 'pass');
        } else if (manual) {
          this.setStatus('set-ai-status', (res && res.error) || 'No models returned.', 'error');
        }
      } catch (error) {
        if (manual) this.setStatus('set-ai-status', error.message || 'Model refresh failed.', 'error');
      }
    }

    async saveAi() {
      const provider = this.currentProvider();
      const modelEl = this.root.querySelector('#set-model');
      const keyEl = this.root.querySelector('#set-api-key');
      const model = (modelEl && modelEl.value) || PROVIDER_DEFAULTS[provider] || 'default';
      const key = (keyEl && keyEl.value.trim()) || '';

      this.set('settings.ai.activeProvider', provider);
      this.set(`settings.ai.models.${provider}`, model);

      try {
        if (key && this.ipc) await this.ipc.invoke('ai:save-key', { provider, key });
        if (key) {
          this.set(`settings.ai.apiKeys.${provider}`, key);
          this.set(`settings.ai.keys.${provider}`, key);
        }
        this.setStatus('set-ai-status', 'AI settings saved.', 'pass');
        this.panel.reactToPanelAction('settings:saved', { message: 'AI settings saved.' });
      } catch (error) {
        this.setStatus('set-ai-status', error.message || 'Could not save AI settings.', 'error');
      }
    }

    async testAi() {
      const provider = this.currentProvider();
      const modelEl = this.root.querySelector('#set-model');
      const keyEl = this.root.querySelector('#set-api-key');
      const model = (modelEl && modelEl.value) || PROVIDER_DEFAULTS[provider] || 'default';
      const apiKey = (keyEl && keyEl.value.trim()) || '';

      this.setStatus('set-ai-status', 'Testing connection...', 'info');
      try {
        const res = this.ipc ? await this.ipc.invoke('ai:test-connection', { provider, apiKey, model }) : null;
        if (res && res.success) {
          this.setStatus('set-ai-status', 'Connected.', 'pass');
          this.panel.notifyPet('ai:test-connection-success');
        } else {
          this.setStatus('set-ai-status', (res && res.error) || 'Connection failed.', 'error');
        }
      } catch (error) {
        this.setStatus('set-ai-status', error.message || 'Connection failed.', 'error');
      }
    }

    async refreshTypingStatus() {
      if (!this.ipc || typeof this.ipc.invoke !== 'function') return;
      try {
        const status = await this.ipc.invoke('typing:get-status');
        if (!status) return;
        const windowsHook = status.platform === 'win32';

        let label;
        let state = 'info';
        if (status.accessibility === 'denied' && !windowsHook) {
          label = 'Accessibility not granted. Go to System Settings → Privacy & Security → Accessibility, enable Pixie, then click Restart helper.';
          state = 'error';
        } else if (status.error) {
          label = status.error;
          state = 'error';
        } else if (!status.running) {
          label = 'Helper is not running. Click Restart helper. In-panel typing still works.';
          state = 'error';
        } else if (!status.ready) {
          label = 'Helper is starting…';
        } else if (windowsHook) {
          label = 'Ready — Windows keyboard hook is active.';
          state = 'pass';
        } else {
          label = 'Ready — Pixie can animate while you type in any app.';
          state = 'pass';
        }

        if (status.lastPulseAt) {
          label += ` Last OS key: ${new Date(status.lastPulseAt).toLocaleTimeString()}.`;
        }
        this.setStatus('set-typing-status', label, state);
      } catch (error) {
        this.setStatus('set-typing-status', 'Status unavailable.', 'info');
      }
    }

    async restartTypingHelper() {
      if (!this.ipc || typeof this.ipc.invoke !== 'function') return;
      this.setStatus('set-typing-status', 'Restarting helper…', 'info');
      try {
        await this.ipc.invoke('typing:restart');
      } catch (error) {}
      await this.refreshTypingStatus();
    }

    async exportData() {
      try {
        const res = this.ipc ? await this.ipc.invoke('data:export') : null;
        if (!res || res.canceled) return;
        const counts = res.counts || {};
        const summary = counts.notes !== undefined
          ? `Backup saved: ${counts.notes} notes, ${counts.todos || 0} tasks, ${counts.reminders || 0} reminders.`
          : 'Full backup saved.';
        this.setStatus('set-data-status', res.success ? summary : (res.error || 'Export failed.'), res.success ? 'pass' : 'error');
        if (res.success) this.panel.notifyPet('settings:exported');
      } catch (error) {
        this.setStatus('set-data-status', error.message || 'Export failed.', 'error');
      }
    }

    async importData() {
      try {
        const res = this.ipc ? await this.ipc.invoke('data:select-import-file') : null;
        if (!res || res.canceled) return;
        if (res.error) {
          this.setStatus('set-data-status', res.error, 'error');
          return;
        }
        const applied = this.ipc
          ? await this.ipc.invoke('data:apply-import', { data: res.data, notesStrategy: 'replace' })
          : null;
        if (applied && applied.success) {
          this.setStatus('set-data-status', `Full restore complete. Safety copy: ${applied.backupFile || 'saved'}`, 'pass');
          this.panel.notifyPet('settings:imported');
          await this.refresh();
        } else {
          this.setStatus('set-data-status', (applied && applied.error) || 'Import failed.', 'error');
        }
      } catch (error) {
        this.setStatus('set-data-status', error.message || 'Import failed.', 'error');
      }
    }

    setStatus(id, text, kind) {
      const el = this.root && this.root.querySelector(`#${id}`);
      if (!el) return;
      el.textContent = text;
      el.dataset.kind = kind || 'info';
    }

    handleUpdateStatus({ result, isManual } = {}) {
      const el = this.root && this.root.querySelector('#set-update-status');
      if (!el || !result) return;
      const status = result.status;
      if (status === 'up_to_date') {
        el.dataset.kind = 'pass';
        el.textContent = isManual ? `Pixie is up to date (v${result.currentVersion || ''}).` : '';
        return;
      }
      if (status === 'update_available') {
        const latest = this.escape(result.latestVersion || '');
        const current = this.escape(result.currentVersion || '');
        const url = this.escape(result.downloadUrl || result.releaseUrl || '');
        el.dataset.kind = 'info';
        el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;">`
          + `<div>Update available: v${latest}${current ? ` (current v${current})` : ''}</div>`
          + `<div style="display:flex;gap:8px;flex-wrap:wrap;">`
          + `<button type="button" class="tool-btn primary" id="set-update-download" data-url="${url}">Download update</button>`
          + `</div></div>`;
        return;
      }
      if (status === 'error') {
        el.dataset.kind = isManual ? 'error' : 'info';
        el.textContent = isManual ? (result.error || "Couldn't check for updates.") : '';
        return;
      }
      if (status === 'no_releases') {
        el.dataset.kind = 'info';
        el.textContent = isManual ? 'No published releases found yet.' : '';
        return;
      }
      el.textContent = '';
      el.dataset.kind = 'info';
    }

    onTabActivated() {
      this.refresh();
    }

    async refresh() {
      if (!this.root) return;

      this.appearance = Object.assign({}, APPEARANCE_DEFAULTS, this.store.get('settings.appearance') || {});
      const accent = this.appearance.accentColor || '#007aff';

      const nameInput = this.root.querySelector('#set-pet-name');
      if (nameInput) nameInput.value = this.get('settings.general.petName', 'Pixie');
      const userInput = this.root.querySelector('#set-user-name');
      if (userInput) userInput.value = this.get('settings.general.userName', '');

      Object.keys(APPEARANCE_DEFAULTS).forEach((key) => {
        const el = this.root.querySelector(`[data-appearance="${key}"], [data-appearance-color="${key}"]`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!this.appearance[key];
        else el.value = this.appearance[key];
        const label = this.root.querySelector(`[data-value-for="${key}"]`);
        if (label) label.textContent = this.formatAppearance(key, this.appearance[key]);
      });

      const provider = this.get('settings.ai.activeProvider', 'gemini');
      const providerEl = this.root.querySelector('#set-provider');
      if (providerEl) providerEl.value = provider;
      this.updateModelsForProvider(provider);
      await this.loadApiKey(provider);

      const accentEl = this.root.querySelector('#set-accent-color');
      if (accentEl) accentEl.value = accent;
      this.root.querySelectorAll('[data-accent]').forEach((btn) => {
        btn.classList.toggle('active', String(btn.dataset.accent).toLowerCase() === String(accent).toLowerCase());
      });

      await this.refreshTypingStatus();

      if (!this.root.dataset.versionLoaded) {
        this.root.dataset.versionLoaded = 'true';
        try {
          const version = this.ipc && this.ipc.invoke ? await this.ipc.invoke('app:get-version') : '';
          const versionEl = this.root.querySelector('#set-version');
          if (versionEl) versionEl.textContent = version ? `Pixie v${version}` : 'Pixie';
        } catch (error) {
          // Version display is non-essential.
        }
      }
    }
  }

  window.PanelSettingsTab = PanelSettingsTab;
})();
