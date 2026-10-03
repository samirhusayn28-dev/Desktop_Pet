/**
 * Desktop Pet — Main Panel Assistant Controller
 * Manages tab switching, window actions, real-time glassmorphism,
 * live header pet avatar with cursor tracking, pet name sync, and Lucide icons.
 */

const { ipcRenderer } = typeof require !== 'undefined' ? require('electron') : { ipcRenderer: null };
const storeModule = typeof require !== 'undefined' ? require('../main/store') : null;

// Browser fallback store if running in plain browser
class LocalStorageStoreFallback {
  constructor() {
    this.key = 'desktop_pet_store_data';
  }
  get(path) {
    const raw = localStorage.getItem(this.key);
    const data = raw ? JSON.parse(raw) : {};
    const keys = path.split('.');
    let cur = data;
    for (const k of keys) {
      if (cur === undefined || cur === null) return undefined;
      cur = cur[k];
    }
    return cur;
  }
  set(path, val) {
    const raw = localStorage.getItem(this.key);
    const data = raw ? JSON.parse(raw) : {};
    const keys = path.split('.');
    let cur = data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]]) cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = val;
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
    this.tabs = {};

    this.init();
  }

  init() {
    this.applyGlassmorphismSettings();
    this.applyPetName();
    this.setupWindowButtons();
    this.setupTabs();
    this.initTabControllers();
    this.applyInitialTheme();
    this.renderHeaderPetFace();
    this.setupCursorTracking();
    this.setupIPC();
    this.refreshIcons();
  }

  refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({
        attrs: {
          'stroke-width': 1.75
        }
      });
    }
  }

  applyGlassmorphismSettings() {
    const transparency = this.store.get('settings.appearance.panelTransparency') ?? 0.30;
    const blur = this.store.get('settings.appearance.panelBlur') ?? 24;
    document.documentElement.style.setProperty('--panel-transparency', transparency);
    document.documentElement.style.setProperty('--panel-alpha', transparency);
    document.documentElement.style.setProperty('--panel-blur', `${blur}px`);
    document.documentElement.style.setProperty('--blur', `${blur}px`);
  }

  applyPetName(name) {
    const finalName = name || this.store.get('settings.general.petName') || 'Pet';
    const brandTitle = document.getElementById('header-brand-title');
    if (brandTitle) brandTitle.textContent = finalName;
    const chatTitle = document.getElementById('chat-header-title');
    if (chatTitle) chatTitle.textContent = `${finalName} Assistant`;
  }

  renderHeaderPetFace() {
    if (!this.headerPetFaceEl) return;
    const appearance = this.store.get('settings.appearance') || {};
    this.petRenderer.updateConfig(appearance);

    // Mini 28px face avatar with dynamic eye tracking offset
    this.headerPetFaceEl.innerHTML = this.petRenderer.render(this.currentEmotion, {
      size: 28,
      eyeOffset: this.eyeOffset,
      idPrefix: 'hdr-pet-face'
    });
  }

  setupCursorTracking() {
    // 1. Mouse movement within the panel window
    window.addEventListener('mousemove', (e) => {
      if (!this.headerPetFaceEl) return;
      const rect = this.headerPetFaceEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / 250;
      const dy = (e.clientY - cy) / 250;
      this.updateHeaderEyes(Math.max(-1, Math.min(1, dx)), Math.max(-1, Math.min(1, dy)));
    });

    // 2. Global cursor from IPC
    if (this.ipcRenderer) {
      this.ipcRenderer.on('panel:cursor-pos', (event, { normX, normY }) => {
        this.updateHeaderEyes(normX, normY);
      });

      this.ipcRenderer.on('panel:pet-emotion', (event, emotion) => {
        this.currentEmotion = emotion || 'happy';
        this.renderHeaderPetFace();
      });

      this.ipcRenderer.on('panel:update-name', (event, name) => {
        this.applyPetName(name);
      });
    }
  }

  updateHeaderEyes(normX, normY) {
    this.eyeOffset = { x: normX * 4, y: normY * 4 };
    this.renderHeaderPetFace();
  }

  setupWindowButtons() {
    const minBtn = document.getElementById('btn-minimize-panel');
    const closeBtn = document.getElementById('btn-close-panel');
    const settingsBtn = document.getElementById('btn-header-settings');

    if (minBtn) {
      minBtn.addEventListener('click', () => {
        if (this.ipcRenderer) this.ipcRenderer.send('panel:minimize');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (this.ipcRenderer) this.ipcRenderer.send('panel:close');
      });
    }

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        if (this.activeTabId === 'settings') {
          this.switchTab('chat');
        } else {
          this.switchTab('settings');
        }
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    const modelInfoBtn = document.getElementById('chat-model-info');
    if (modelInfoBtn) {
      modelInfoBtn.addEventListener('click', () => {
        this.switchTab('settings');
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }
  }

  setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        this.switchTab(tabId);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });
  }

  switchTab(tabId) {
    this.activeTabId = tabId;

    // Start/stop system stats polling on Tools tab
    if (this.toolsTab) {
      if (tabId === 'tools') {
        this.toolsTab.startPolling();
      } else {
        this.toolsTab.stopPolling();
      }
    }

    // Update Tab Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    const settingsBtn = document.getElementById('btn-header-settings');
    if (settingsBtn) {
      settingsBtn.classList.toggle('active', tabId === 'settings');
    }

    // Update Panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `pane-${tabId}`);
    });

    this.refreshIcons();
  }

  initTabControllers() {
    if (window.ChatTab) this.chatTab = new window.ChatTab();
    if (window.TodoTab) this.todoTab = new window.TodoTab();
    if (window.TimerTab) this.timerTab = new window.TimerTab();
    if (window.NotesTab) this.notesTab = new window.NotesTab();
    if (window.RemindersTab) this.remindersTab = new window.RemindersTab();
    if (window.ToolsTab) this.toolsTab = new window.ToolsTab();
    if (window.SettingsTab) this.settingsTab = new window.SettingsTab();
  }

  applyInitialTheme() {
    const accent = this.store.get('settings.appearance.accentColor') || '#FF7A2F';
    if (window.ThemeManager && window.ThemeManager.applyAccentColor) {
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
      badgeEl.textContent = providerNames[activeProvider] || activeProvider.toUpperCase();
    }
  }

  notifyPet(channel, data) {
    if (this.ipcRenderer) {
      this.ipcRenderer.send('panel:relay-to-pet', { channel, data });
    }
  }

  setupIPC() {
    if (!this.ipcRenderer) return;

    this.ipcRenderer.on('panel:switch-tab', (event, tabId) => {
      this.switchTab(tabId);
    });

    this.ipcRenderer.on('panel:update-accent', (event, color) => {
      if (window.ThemeManager && window.ThemeManager.applyAccentColor) {
        window.ThemeManager.applyAccentColor(document, color);
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.panelController = new PanelController();
});
