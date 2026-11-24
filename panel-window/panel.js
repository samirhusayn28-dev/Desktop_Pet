/**
 * Pixie Panel — sectioned lightweight panel.
 * Each section is a normal tab. Tool code is loaded only when a non-chat tab
 * is opened first, so the chat screen stays fast and no watchers are added.
 */

const { ipcRenderer } = typeof require !== 'undefined' ? require('electron') : { ipcRenderer: null };

if (!window.app && ipcRenderer) {
  window.app = {
    emit: (type, payload) => ipcRenderer.send('app:emit', { type, payload }),
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    once: (channel, listener) => ipcRenderer.once(channel, listener),
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
  };
}

const storeModule = typeof require !== 'undefined' ? require('../main/store') : null;

const PANEL_TABS = [
  'chat', 'flow', 'focus', 'reminders', 'todo', 'notes', 'calc', 'convert',
  'context', 'clipboard', 'colors', 'markdown', 'snippets', 'settings'
];

// Drives the stage breadcrumb, title and description. Kept here so the
// structural header stays in sync with whatever section is active.
const SECTION_META = {
  chat:      { no: '01', group: 'CONVERSATION', label: 'CHAT',       title: 'Conversation',      subtitle: 'Talk to Pixie. Context is attached only when you send.' },
  flow:      { no: '02', group: 'CONVERSATION', label: 'FLOW',       title: 'AI Flow',           subtitle: 'Stop, retry, edit or branch the current conversation.' },
  focus:     { no: '03', group: 'DAILY TOOLS',  label: 'FOCUS',      title: 'Focus Timer',       subtitle: 'Pomodoro cycles with one local countdown. No extra process.' },
  reminders: { no: '04', group: 'DAILY TOOLS',  label: 'REMINDERS',  title: 'Reminders',         subtitle: 'Set local alarms with repeat, snooze, popup and sound.' },
  todo:      { no: '05', group: 'DAILY TOOLS',  label: 'TO-DO',      title: 'To-Do',             subtitle: 'A small local checklist, capped at 60 items.' },
  notes:     { no: '06', group: 'DAILY TOOLS',  label: 'NOTES',      title: 'Notes',             subtitle: 'Several local notes with titles, pinning and autosave.' },
  calc:      { no: '07', group: 'DAILY TOOLS',  label: 'CALC',       title: 'Calculator',        subtitle: 'Scientific expressions evaluated locally. No eval() is used.' },
  convert:   { no: '08', group: 'DAILY TOOLS',  label: 'CONVERT',    title: 'Unit Converter',    subtitle: 'Convert length, weight and temperature instantly.' },
  context:   { no: '09', group: 'UTILITIES',    label: 'PRIVACY',    title: 'Context & Privacy', subtitle: 'Per-message context only. Nothing runs in the background.' },
  clipboard: { no: '10', group: 'UTILITIES',    label: 'CLIP',       title: 'Clipboard',         subtitle: 'A local history of what you copy. Nothing is sent until you choose an action.' },
  colors:    { no: '11', group: 'UTILITIES',    label: 'COLORS',     title: 'Color Studio',      subtitle: 'Pick, convert and contrast-check a panel accent color.' },
  markdown:  { no: '12', group: 'UTILITIES',    label: 'MD',         title: 'Markdown',          subtitle: 'Preview markdown locally, then insert it into chat.' },
  snippets:  { no: '13', group: 'UTILITIES',    label: 'SNIPS',      title: 'Saved Prompts',     subtitle: 'Reusable local prompts, capped at 30 entries.' },
  settings:  { no: '14', group: 'PREFERENCES',  label: 'SETTINGS',   title: 'Pixie Settings',    subtitle: 'Customize Pixie, behavior, AI and privacy inside the panel.' }
};

// Each section has its own short personality beat so switching around the
// panel never produces the exact same pet reaction twice.
const SECTION_REACTIONS = {
  chat:      { state: 'curious',     text: 'Ready to chat.',          badge: 'CHAT',      emotion: 'curious' },
  flow:      { state: 'generating',  text: "Let's refine the flow.",  badge: 'FLOW',      emotion: 'generating' },
  focus:     { state: 'focusing',    text: 'Time to focus.',          badge: 'FOCUS',     emotion: 'focusing' },
  reminders: { state: 'excited',     text: 'I will keep time for you.', badge: 'REMINDERS', emotion: 'excited' },
  todo:      { state: 'organizing',  text: 'Lets get organized.',     badge: 'TO-DO',     emotion: 'organizing' },
  notes:     { state: 'writing',     text: 'What are we writing?',    badge: 'NOTES',     emotion: 'writing' },
  calc:      { state: 'calculating', text: 'Numbers ready.',          badge: 'CALC',      emotion: 'calculating' },
  convert:   { state: 'converting',  text: 'Lets convert something.', badge: 'CONVERT',   emotion: 'converting' },
  context:   { state: 'guarding',    text: 'Your privacy, guarded.',  badge: 'PRIVACY',   emotion: 'guarding' },
  clipboard: { state: 'clipping',    text: 'Watching your copies.',   badge: 'CLIPBOARD', emotion: 'clipping' },
  colors:    { state: 'styling',     text: 'Pick a pretty color.',    badge: 'COLORS',    emotion: 'styling' },
  markdown:  { state: 'creating',    text: 'Lets make something.',    badge: 'MARKDOWN',  emotion: 'creating' },
  snippets:  { state: 'reviewing',   text: 'Prompts at the ready.',   badge: 'SNIPPETS',  emotion: 'reviewing' },
  settings:  { state: 'configuring', text: 'Make me your own.',       badge: 'SETTINGS',  emotion: 'configuring' }
};

// Browser fallback store if running in a plain browser.
class LocalStorageStoreFallback {
  constructor() {
    this.key = 'desktop_pet_store_data';
  }

  get(path) {
    const raw = localStorage.getItem(this.key);
    const data = raw ? JSON.parse(raw) : {};
    const keys = String(path || '').split('.');
    let cur = data;
    for (const key of keys) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[key];
    }
    return cur;
  }

  set(path, value) {
    const raw = localStorage.getItem(this.key);
    const data = raw ? JSON.parse(raw) : {};
    const keys = String(path || '').split('.');
    let cur = data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]]) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
    localStorage.setItem(this.key, JSON.stringify(data));
  }
}

class PanelController {
  constructor() {
    window.panelController = this;
    this.ipcRenderer = ipcRenderer;
    this.store = storeModule || new LocalStorageStoreFallback();

    this.petRenderer = new PetRenderer();
    this.headerPetFaceEl = document.getElementById('header-pet-face');
    this.currentEmotion = 'happy';
    this.eyeOffset = { x: 0, y: 0 };
    this.activeTabId = 'chat';
    this.chatTab = null;
    this.tools = null;
    this.toolsPromise = null;
    this.settingsTab = null;
    this.settingsPromise = null;
    this.focusStatus = 'Focus: idle';

    this.init();
  }

  init() {
    this.applyGlassmorphismSettings();
    this.applyPetName();
    this.setupWindowButtons();
    this.setupGuide();
    this.setupTabs();
    this.updateStageHeader('chat');
    this.applyInitialTheme();
    this.renderHeaderPetFace();
    this.setupCursorTracking();
    this.setupIPC();

    if (window.ChatTab) {
      this.chatTab = new window.ChatTab();
    }

    this.refreshIcons();
    this.refreshStatusFooter();
    this.ready = true;
  }

  refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
    }
  }

  getSetting(path, fallback) {
    const value = this.store.get(path);
    return value === undefined || value === null ? fallback : value;
  }

  setSetting(path, value) {
    this.store.set(path, value);
    this.refreshStatusFooter();
  }

  setFooterStatus(id, text) {
    if (id === 'focus') this.focusStatus = text;
    const el = document.getElementById(`status-${id}`);
    if (el) el.textContent = text;
  }

  setHeaderStatus(text, busy = false) {
    const status = document.getElementById('hs');
    if (!status) return;
    status.classList.toggle('busy', !!busy);
    const label = status.querySelector('span');
    if (label) label.textContent = text;
  }

  refreshStatusFooter() {
    const provider = this.getSetting('settings.ai.activeProvider', 'gemini');
    const model = this.getSetting(`settings.ai.models.${provider}`, 'default');
    const modelEl = document.getElementById('status-model');
    if (modelEl) {
      modelEl.textContent = `${provider} · ${String(model).slice(0, 24)}`;
    }

    const contextEl = document.getElementById('status-context');
    if (contextEl) {
      contextEl.textContent = this.getSetting('settings.privacy.context', true) ? 'Context on' : 'Context off';
    }

    const focusEl = document.getElementById('status-focus');
    if (focusEl) {
      focusEl.textContent = this.focusStatus;
    }

    const metaEl = document.getElementById('status-meta');
    if (metaEl) {
      metaEl.textContent = this.chatTab ? `${this.chatTab.messages.length} msgs` : '0 msgs';
    }
  }

  applyGlassmorphismSettings() {
    // Kept as a compatibility name for older scripts. Pixie 1.2.0 is solid
    // matte only: no transparency, no blur, no glass layers.
    document.documentElement.style.setProperty('--panel-transparency', '1');
    document.documentElement.style.setProperty('--panel-alpha', '1');
    document.documentElement.style.setProperty('--panel-blur', '0px');
    document.documentElement.style.setProperty('--blur', '0px');
  }

  applyPetName(name) {
    const finalName = name || this.store.get('settings.general.petName') || 'Pixie';
    const brandTitle = document.getElementById('panel-title-text');
    if (brandTitle) brandTitle.textContent = finalName;

    const chatTitle = document.getElementById('chat-assistant-name');
    if (chatTitle) chatTitle.textContent = `${finalName} Assistant`;
  }

  applyInitialTheme() {
    const accent = this.store.get('settings.appearance.accentColor') || '#007aff';
    if (window.ThemeManager && typeof window.ThemeManager.applyAccentColor === 'function') {
      window.ThemeManager.applyAccentColor(document, accent);
    }

    const activeProvider = this.store.get('settings.ai.activeProvider') || 'gemini';
    const providerNames = {
      gemini: 'GEMINI',
      groq: 'GROQ',
      openai: 'OPENAI',
      anthropic: 'CLAUDE',
      deepseek: 'DEEPSEEK',
      openrouter: 'OPENROUTER',
      qwen: 'QWEN',
      ollama: 'OLLAMA',
      custom: 'CUSTOM'
    };
    const badgeEl = document.getElementById('header-provider-badge');
    if (badgeEl) {
      badgeEl.textContent = providerNames[activeProvider] || String(activeProvider).toUpperCase();
    }
  }

  renderHeaderPetFace() {
    if (!this.headerPetFaceEl) return;
    const appearance = this.store.get('settings.appearance') || {};
    this.petRenderer.updateConfig(appearance);
    this.headerPetFaceEl.innerHTML = this.petRenderer.render(this.currentEmotion, {
      size: 56,
      eyeOffset: this.eyeOffset,
      idPrefix: 'hdr-pet-face'
    });
  }

  setupCursorTracking() {
    window.addEventListener('mousemove', (event) => {
      if (!this.headerPetFaceEl) return;
      const rect = this.headerPetFaceEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (event.clientX - cx) / 250;
      const dy = (event.clientY - cy) / 250;
      this.updateHeaderEyes(
        Math.max(-1, Math.min(1, dx)),
        Math.max(-1, Math.min(1, dy))
      );
    });

    if (!this.ipcRenderer) return;

    this.ipcRenderer.on('panel:cursor-pos', (event, { normX, normY } = {}) => {
      this.updateHeaderEyes(
        Number.isFinite(normX) ? normX : 0,
        Number.isFinite(normY) ? normY : 0
      );
    });

    this.ipcRenderer.on('panel:pet-emotion', (event, emotion) => {
      this.currentEmotion = emotion || 'happy';
      this.renderHeaderPetFace();
    });

    this.ipcRenderer.on('panel:update-name', (event, name) => {
      this.applyPetName(name);
    });

    this.ipcRenderer.on('update:status', (_event, payload) => {
      this.lastUpdateStatus = payload || null;
      if (this.settingsTab && typeof this.settingsTab.handleUpdateStatus === 'function') {
        this.settingsTab.handleUpdateStatus(this.lastUpdateStatus);
      }
    });
  }

  updateHeaderEyes(normX, normY) {
    this.eyeOffset = { x: normX * 4, y: normY * 4 };
    this.renderHeaderPetFace();
  }

  setupWindowButtons() {
    const minBtn = document.getElementById('btn-win-min');
    const closeBtn = document.getElementById('btn-win-close');
    const settingsBtn = document.getElementById('btn-settings');

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.activateTab('settings');
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    if (minBtn) {
      minBtn.addEventListener('click', () => {
        if (this.ipcRenderer) this.ipcRenderer.send('panel:minimize');
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (this.ipcRenderer) this.ipcRenderer.send('panel:close');
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }
  }

  setupGuide() {
    const overlay = document.getElementById('guide-overlay');
    const openBtn = document.getElementById('btn-guide');
    const closeBtn = document.getElementById('btn-guide-close');
    if (!overlay) return;

    const close = () => { overlay.hidden = true; };
    const open = () => { overlay.hidden = false; };

    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !overlay.hidden) close();
    });
  }

  setupTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activateTab(btn.dataset.tab);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });

    const clipChip = document.getElementById('btn-clipboard-chip');
    if (clipChip) clipChip.addEventListener('click', () => this.activateTab('clipboard'));

    const snippetChip = document.getElementById('btn-snippet-chip');
    if (snippetChip) snippetChip.addEventListener('click', () => this.activateTab('snippets'));
  }

  loadLightweightTools() {
    if (this.tools) return Promise.resolve(this.tools);
    if (this.toolsPromise) return this.toolsPromise;

    this.toolsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'lightweight-tools.js';
      script.onload = () => {
        if (!window.LightweightTools) {
          this.toolsPromise = null;
          reject(new Error('LightweightTools failed to initialize'));
          return;
        }
        this.tools = new window.LightweightTools(this);
        resolve(this.tools);
      };
      script.onerror = () => {
        this.toolsPromise = null;
        reject(new Error('Could not load lightweight-tools.js'));
      };
      document.head.appendChild(script);
    });

    return this.toolsPromise;
  }

  loadSettingsTab() {
    if (this.settingsTab) return Promise.resolve(this.settingsTab);
    if (this.settingsPromise) return this.settingsPromise;

    this.settingsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'tabs/panel-settings-tab.js';
      script.onload = () => {
        if (!window.PanelSettingsTab) {
          this.settingsPromise = null;
          reject(new Error('PanelSettingsTab failed to initialize'));
          return;
        }
        this.settingsTab = new window.PanelSettingsTab(this);
        resolve(this.settingsTab);
      };
      script.onerror = () => {
        this.settingsPromise = null;
        reject(new Error('Could not load panel-settings-tab.js'));
      };
      document.head.appendChild(script);
    });

    return this.settingsPromise;
  }

  async activateTab(tabId) {
    const target = PANEL_TABS.includes(tabId) ? tabId : 'chat';

    // Fire the pet beat before any lazy script work. A section click should
    // feel instant even when this is the first time the tool bundle is loaded.
    if (this.ready && target !== this.lastReactedTab) {
      this.lastReactedTab = target;
      this.reactToPanelAction(`section:${target}`, SECTION_REACTIONS[target]);
    }

    // Switch the visible tab immediately so the click feels instant.
    this.switchTab(target);

    try {
      if (target === 'settings') {
        await this.loadSettingsTab();
      } else if (target !== 'chat') {
        await this.loadLightweightTools();
      }
    } catch (error) {
      console.error(`[Panel] ${target} section failed to load:`, error);
      this.switchTab('chat');
      return;
    }

    if (this.tools && typeof this.tools.onTabActivated === 'function' && target !== 'settings') {
      this.tools.onTabActivated(target);
    }
    if (this.settingsTab && typeof this.settingsTab.onTabActivated === 'function' && target === 'settings') {
      this.settingsTab.onTabActivated();
      if (this.lastUpdateStatus && typeof this.settingsTab.handleUpdateStatus === 'function') {
        this.settingsTab.handleUpdateStatus(this.lastUpdateStatus);
      }
    }
  }

  updateStageHeader(tabId) {
    const meta = SECTION_META[tabId] || SECTION_META.chat;
    const crumb = document.getElementById('stage-crumb');
    const current = document.getElementById('stage-current');
    const title = document.getElementById('stage-title');
    const subtitle = document.getElementById('stage-subtitle');
    const shell = document.getElementById('panel-shell');

    if (crumb) crumb.textContent = `${meta.no} / ${meta.group}`;
    if (current) current.textContent = meta.label;
    if (title) title.textContent = meta.title;
    if (subtitle) subtitle.textContent = '';
    if (shell) shell.dataset.section = tabId;
  }

  switchTab(tabId) {
    const target = PANEL_TABS.includes(tabId) ? tabId : 'chat';
    this.activeTabId = target;

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === target);
    });

    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `pane-${target}`);
    });

    this.updateStageHeader(target);
    const view = document.getElementById('view');
    if (view) {
      view.classList.toggle('flush', target === 'chat');
      view.scrollTop = 0;
    }
    this.refreshIcons();
    this.refreshStatusFooter();
    return this.activeTabId;
  }

  notifyPet(channel, data) {
    if (window.app && typeof window.app.emit === 'function') {
      window.app.emit(channel, data);
    } else if (this.ipcRenderer) {
      this.ipcRenderer.send('app:emit', { type: channel, payload: data });
    }
  }

  /**
   * One lightweight reaction hook for completed panel actions.
   * Pixie changes expression and shows a tiny bubble so every section feels alive.
   */
  reactToPanelAction(action, data = {}) {
    const reactions = {
      'flow:retried':    { state: 'reviewing',   text: 'Trying that again.',       badge: 'FLOW',      emotion: 'reviewing', sound: 'tap' },
      'flow:stopped':    { state: 'guarding',    text: 'Generation stopped.',      badge: 'FLOW',      emotion: 'guarding' },
      'todo:added':      { state: 'organizing',  text: 'Added to your list.',      badge: 'TO-DO',     emotion: 'organizing', sound: 'tap' },
      'todo:completed':  { state: 'proud',       text: 'Task done. Nice work!',    badge: 'TO-DO',     emotion: 'proud', sound: 'happy' },
      'todo:all-completed':{ state:'proud',      text: 'Every task is done!',      badge: 'TO-DO',     emotion: 'proud', sound: 'happy' },
      'note:saved':      { state: 'writing',     text: 'Note saved.',              badge: 'NOTE',      emotion: 'writing', sound: 'tap' },
      'note:pinned':     { state: 'love',        text: 'Pinned with love.',        badge: 'FAVORITE',  emotion: 'love', sound: 'happy' },
      'snippet:saved':   { state: 'reviewing',   text: 'Prompt saved.',            badge: 'SNIPPETS',  emotion: 'reviewing', sound: 'tap' },
      'color:applied':   { state: 'styling',     text: 'Fresh accent. I like it.', badge: 'COLORS',    emotion: 'styling', sound: 'tap' },
      'focus:started':   { state: 'focusing',    text: 'Focus mode on.',           badge: 'FOCUS',     emotion: 'focusing', held: true },
      'focus:stopped':   { state: 'relaxed',     text: 'Focus paused.',            badge: 'FOCUS',     emotion: 'relaxed' },
      'focus:completed': { state: 'laugh',       text: 'Focus block complete!',    badge: 'FOCUS',     emotion: 'laugh', sound: 'happy' },
      'clipboard:copied': { state: 'clipping',   text: 'Copied.',                  badge: 'CLIPBOARD', emotion: 'clipping', sound: 'tap' },
      'clipboard:read':   { state: 'clipping',   text: 'Clipboard ready.',         badge: 'CLIPBOARD', emotion: 'clipping', sound: 'tap' },
      'clipboard:watched':{ state: 'clipping',   text: 'I saved that copy.',       badge: 'CLIPBOARD', emotion: 'clipping' },
      'clipboard:inserted':{ state: 'creating',  text: 'Sent to chat.',            badge: 'CLIPBOARD', emotion: 'creating' },
      'calc:result':     { state: 'calculating', text: 'Answer ready.',            badge: 'CALC',      emotion: 'calculating', sound: 'tap' },
      'convert:swapped': { state: 'converting',  text: 'Units swapped.',           badge: 'CONVERT',   emotion: 'converting', sound: 'tap' },
      'convert:result':  { state: 'converting',  text: 'Converted.',               badge: 'CONVERT',   emotion: 'converting', sound: 'tap' },
      'markdown:inserted':{ state: 'creating',   text: 'Inserted into chat.',      badge: 'MARKDOWN',  emotion: 'creating' },
      'privacy:updated': { state: 'guarding',    text: 'Privacy updated.',         badge: 'PRIVACY',   emotion: 'guarding' },
      'settings:saved':  { state: 'configuring', text: 'Settings saved.',          badge: 'SETTINGS',  emotion: 'configuring', sound: 'tap' },
      'settings:opened': { state: 'configuring', text: 'Settings are right here.', badge: 'SETTINGS',  emotion: 'configuring' },
      'reminder:saved':  { state: 'excited',     text: 'Reminder set.',            badge: 'REMINDER',  emotion: 'excited', sound: 'chirp' },
      'reminder:added':  { state: 'excited',     text: 'Reminder set.',            badge: 'REMINDER',  emotion: 'excited', sound: 'chirp' },
      'reminder:updated':{ state: 'configuring', text: 'Reminder updated.',        badge: 'REMINDER',  emotion: 'configuring', sound: 'tap' },
      'reminder:removed':{ state: 'reviewing',   text: 'Reminder removed.',        badge: 'REMINDER',  emotion: 'reviewing', sound: 'tap' },
      'reminder:snoozed':{ state: 'wink',        text: 'Snoozed it for you.',      badge: 'REMINDER',  emotion: 'wink' }
    };

    const base = reactions[action] || { state: 'happy', text: 'Done!', badge: 'PIXIE', emotion: 'happy' };
    const reaction = data && (data.state || data.text || data.badge || data.emotion)
      ? Object.assign({}, base, data)
      : base;
    const text = typeof data.message === 'string' && data.message.trim()
      ? data.message.trim().slice(0, 90)
      : reaction.text;

    this.notifyPet('pet:set-state', {
      state: reaction.state,
      duration: reaction.held ? 0 : 2600,
      priority: 4,
      force: true,
      held: !!reaction.held
    });

    if (reaction.sound && window.soundEffects && typeof window.soundEffects.play === 'function') {
      window.soundEffects.play(reaction.sound, 'reactions');
    }

    const bubbleData = {
      badge: reaction.badge,
      text,
      duration: 2600,
      emotion: reaction.emotion,
      bounce: false,
      force: true
    };

    // Use the main bubble queue when available so rapid actions never overlap.
    if (window.app && typeof window.app.send === 'function') {
      window.app.send('pet:show-bubble', bubbleData);
    } else {
      this.notifyPet('pet:show-bubble', bubbleData);
    }
  }

  setupIPC() {
    if (!this.ipcRenderer) return;

    // Main-process tab requests now include the in-panel settings section.
    this.ipcRenderer.on('panel:switch-tab', (event, tabId) => {
      this.activateTab(tabId);
    });

    this.ipcRenderer.on('panel:update-accent', (event, color) => {
      if (window.ThemeManager && typeof window.ThemeManager.applyAccentColor === 'function') {
        window.ThemeManager.applyAccentColor(document, color);
      }
    });

    this.ipcRenderer.on('panel:reload-settings', () => {
      this.applyGlassmorphismSettings();
      this.applyPetName();
      this.applyInitialTheme();
      this.renderHeaderPetFace();
      if (this.chatTab && typeof this.chatTab.updateModelInfo === 'function') {
        this.chatTab.updateModelInfo();
      }
      if (this.tools && typeof this.tools.refresh === 'function') {
        this.tools.refresh();
      }
      if (this.settingsTab && typeof this.settingsTab.refresh === 'function') {
        this.settingsTab.refresh();
      }
      this.refreshStatusFooter();
    });

    this.ipcRenderer.on('panel:data-imported', () => {
      if (this.chatTab && typeof this.chatTab.updateModelInfo === 'function') {
        this.chatTab.updateModelInfo();
      }
      if (this.tools && typeof this.tools.refresh === 'function') {
        this.tools.refresh();
      }
      if (this.settingsTab && typeof this.settingsTab.refresh === 'function') {
        this.settingsTab.refresh();
      }
      this.refreshStatusFooter();
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.panelController = new PanelController();
});
