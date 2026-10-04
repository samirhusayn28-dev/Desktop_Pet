/**
 * Desktop Pet — Clean 6-Section Settings Tab Controller
 * General, Behavior, Reactions, Appearance (0.30 alpha, 24px blur), AI Provider with Test Connection, Privacy
 * Plus Clean First-Run Onboarding Modal
 */

const DEFAULT_PET_APPEARANCE = {
  scale: 1.0,           // 50% - 300%
  width: 136,           // 60 - 200 px base
  height: 120,          // 60 - 200 px base
  roundness: 36,        // 0 - 50%
  eyeSize: 1.0,         // 0.5x - 2.0x
  eyeSpacing: 44,       // 20 - 70 px
  mouthWidth: 14,       // 6 - 28 px
  depth: 80,            // 0 - 100 (3D intensity)
  bodyColor: '#FFFFFF', // Hex
  glassesEnabled: false,
  theme: 'default'
};

const CENTRAL_DEFAULTS = {
  general: {
    petName: 'Pixel',
    userName: 'Samir',
    alwaysOnTop: true,
    rememberPosition: true,
    launchAtLogin: false,
    autoUpdateCheck: true
  },
  behavior: {
    idleSleepyMinutes: 2,
    idleSleepingMinutes: 5,
    bubbleDuration: 5,
    sounds: true,
    dnd: false
  },
  reactions: {
    brightness: true,
    volume: true,
    battery: true,
    media: true,
    network: true,
    headphones: true,
    welcomeStartup: true,
    goodbyeShutdown: true,
    highLoad: true,
    lateNight: true
  },
  appearance: {
    scale: 1.0,
    width: 136,
    height: 120,
    roundness: 36,
    eyeSize: 1.0,
    eyeSpacing: 44,
    mouthWidth: 14,
    depth: 80,
    bodyColor: '#FFFFFF',
    accentColor: '#FF7A2F',
    glassesEnabled: false
  },
  ai: {
    activeProvider: 'gemini',
    baseUrl: ''
  },
  privacy: {
    contextAwareness: true,
    allowScreenshots: false,
    blocklist: '1password, bitwarden, lastpass, keychain, bank, chase, wellsfargo, paypal, login, signin, incognito, private browsing'
  }
};

const DEFAULT_ACCENT_COLOR = '#FF7A2F';
const DEFAULT_PANEL_TRANSPARENCY = 0.30;
const DEFAULT_PANEL_BLUR = 24;

class SettingsTab {
  constructor() {
    this.previewRenderer = new PetRenderer();
    this.appearance = Object.assign({}, DEFAULT_PET_APPEARANCE);

    // 1. General Settings
    this.petNameInput = document.getElementById('setting-pet-name');
    this.userNameInput = document.getElementById('setting-user-name');
    this.alwaysOnTopToggle = document.getElementById('setting-always-on-top');
    this.rememberPosToggle = document.getElementById('setting-remember-pos');
    this.launchLoginToggle = document.getElementById('setting-launch-login');
    this.autoUpdateToggle = document.getElementById('setting-auto-update');

    // 2. Behavior Settings
    this.idleSleepySlider = document.getElementById('setting-idle-sleepy');
    this.dispIdleSleepy = document.getElementById('disp-idle-sleepy');
    this.idleSleepingSlider = document.getElementById('setting-idle-sleeping');
    this.dispIdleSleeping = document.getElementById('disp-idle-sleeping');
    this.bubbleDurationSlider = document.getElementById('setting-bubble-duration');
    this.dispBubbleDuration = document.getElementById('disp-bubble-duration');
    this.soundsToggle = document.getElementById('setting-sounds');
    this.dndToggle = document.getElementById('setting-dnd');

    // 3. Reactions Settings
    this.reactionBrightness = document.getElementById('reaction-brightness');
    this.reactionVolume = document.getElementById('reaction-volume');
    this.reactionBattery = document.getElementById('reaction-battery');
    this.reactionMedia = document.getElementById('reaction-media');
    this.reactionNetwork = document.getElementById('reaction-network');
    this.reactionHeadphones = document.getElementById('reaction-headphones');
    this.reactionWelcomeStartup = document.getElementById('reaction-welcome-startup');
    this.reactionGoodbyeShutdown = document.getElementById('reaction-goodbye-shutdown');
    this.reactionHighload = document.getElementById('reaction-highload');
    this.reactionLatenight = document.getElementById('reaction-latenight');

    this.btnRefreshSensors = document.getElementById('btn-refresh-sensors');
    this.btnOpenAccessibility = document.getElementById('btn-open-accessibility');
    this.sensorStatusList = document.getElementById('sensor-status-list');

    // 3.5. System Permissions (Requirement 4)
    this.btnRecheckPermissions = document.getElementById('btn-recheck-permissions');
    this.permDevNotice = document.getElementById('perm-dev-notice');
    this.badgePermAccessibility = document.getElementById('badge-perm-accessibility');
    this.badgePermScreen = document.getElementById('badge-perm-screen');
    this.badgePermAutomation = document.getElementById('badge-perm-automation');
    this.btnOpenPermAccessibility = document.getElementById('btn-open-perm-accessibility');
    this.btnRequestPermAccessibility = document.getElementById('btn-request-perm-accessibility');
    this.btnOpenPermScreen = document.getElementById('btn-open-perm-screen');
    this.btnRequestPermScreen = document.getElementById('btn-request-perm-screen');
    this.btnOpenPermAutomation = document.getElementById('btn-open-perm-automation');
    this.btnRequestPermAutomation = document.getElementById('btn-request-perm-automation');

    // 3.6. Performance & Resource Budget (Always On)
    this.dispLiveRam = document.getElementById('disp-live-ram');
    this.dispLiveCpu = document.getElementById('disp-live-cpu');
    this.dispLiveBudget = document.getElementById('disp-live-budget');

    // 4. Appearance Controls
    this.previewContainer = document.getElementById('settings-pet-preview');
    this.resetAppearanceBtn = document.getElementById('btn-reset-appearance');
    this.glassesToggle = document.getElementById('setting-pet-glasses');
    this.btnResetAll = document.getElementById('btn-reset-all-settings');

    this.accentColorInput = document.getElementById('setting-accent-color');
    this.dispAccentColor = document.getElementById('disp-accent-color');
    this.btnAccentDefault = document.getElementById('btn-accent-default');
    this.accentSwatches = document.querySelectorAll('.accent-swatches .swatch-btn');

    this.scaleSlider = document.getElementById('setting-pet-scale');
    this.dispScale = document.getElementById('disp-pet-scale');
    this.widthSlider = document.getElementById('setting-pet-width');
    this.dispWidth = document.getElementById('disp-pet-width');
    this.heightSlider = document.getElementById('setting-pet-height');
    this.dispHeight = document.getElementById('disp-pet-height');
    this.roundnessSlider = document.getElementById('setting-pet-roundness');
    this.dispRoundness = document.getElementById('disp-pet-roundness');
    this.eyeSizeSlider = document.getElementById('setting-pet-eyesize');
    this.dispEyeSize = document.getElementById('disp-pet-eyesize');
    this.eyeSpacingSlider = document.getElementById('setting-pet-eyespacing');
    this.dispEyeSpacing = document.getElementById('disp-pet-eyespacing');
    this.mouthWidthSlider = document.getElementById('setting-pet-mouthwidth');
    this.dispMouthWidth = document.getElementById('disp-pet-mouthwidth');
    this.depthSlider = document.getElementById('setting-pet-depth');
    this.dispDepth = document.getElementById('disp-pet-depth');
    this.bodyColorInput = document.getElementById('setting-pet-bodycolor');
    this.dispBodyColor = document.getElementById('disp-pet-bodycolor');
    this.btnPureWhite = document.getElementById('btn-bodycolor-white');

    // 5. AI Providers
    this.providerSelect = document.getElementById('setting-ai-provider');
    this.apiKeyInput = document.getElementById('setting-ai-key');
    this.modelSelect = document.getElementById('setting-ai-model');
    this.refreshModelsBtn = document.getElementById('btn-refresh-models');
    this.modelStatusHint = document.getElementById('model-status-hint');
    this.baseUrlInput = document.getElementById('setting-ai-baseurl');
    this.saveAiBtn = document.getElementById('btn-save-ai-settings');
    this.testAiBtn = document.getElementById('btn-test-ai-connection');
    this.testFeedbackBox = document.getElementById('test-feedback-box');
    this.feedbackBadge = document.getElementById('feedback-badge');
    this.feedbackText = document.getElementById('feedback-text');
    this.apiKeyRow = document.getElementById('setting-apikey-row');

    // 6. Privacy
    this.privacyContext = document.getElementById('privacy-context');
    this.privacyScreenshots = document.getElementById('privacy-screenshots');
    this.privacyBlocklist = document.getElementById('privacy-blocklist');

    // 6.5 Data Management (Item I1)
    this.btnExportData = document.getElementById('btn-export-data');
    this.btnImportData = document.getElementById('btn-import-data');
    this.importPreviewBox = document.getElementById('import-preview-box');
    this.importCountsSummary = document.getElementById('import-counts-summary');
    this.importNotesStrategyWrap = document.getElementById('import-notes-strategy-wrap');
    this.btnCancelImport = document.getElementById('btn-cancel-import');
    this.btnConfirmImport = document.getElementById('btn-confirm-import');
    this.dataStatusMsg = document.getElementById('data-status-msg');
    this.pendingImportData = null;

    // 7. About (Item W1)
    this.aboutGithubBtn = document.getElementById('btn-about-github');
    this.aboutVersionDisplay = document.getElementById('about-version-display');
    this.aboutCheckUpdatesBtn = document.getElementById('btn-about-check-updates');
    this.aboutShowWelcomeBtn = document.getElementById('btn-about-show-welcome');
    this.aboutUpdateStatus = document.getElementById('about-update-status');

    this.init();
  }

  init() {
    this.loadSettings();
    this.setupEvents();
    this.setupResetSystem();
    this.updateAppearanceUI();
    this.renderLivePreview();
    this.checkFirstRun();
  }

  loadSettings() {
    if (!window.panelController) return;
    const store = window.panelController.store;

    // 1. General
    const petName = store.get('settings.general.petName') || CENTRAL_DEFAULTS.general.petName;
    if (this.petNameInput) this.petNameInput.value = petName;
    const userName = store.get('settings.general.userName') || CENTRAL_DEFAULTS.general.userName;
    if (this.userNameInput) this.userNameInput.value = userName;
    if (this.alwaysOnTopToggle) this.alwaysOnTopToggle.checked = store.get('settings.general.alwaysOnTop') !== false;
    if (this.rememberPosToggle) this.rememberPosToggle.checked = store.get('settings.general.rememberPosition') !== false;
    if (this.launchLoginToggle) this.launchLoginToggle.checked = store.get('settings.general.launchAtLogin') === true;
    if (this.autoUpdateToggle) this.autoUpdateToggle.checked = store.get('settings.general.autoUpdateCheck') !== false;

    // 2. Behavior
    const idleSleepy = store.get('settings.behavior.idleSleepyMinutes') ?? CENTRAL_DEFAULTS.behavior.idleSleepyMinutes;
    const idleSleeping = store.get('settings.behavior.idleSleepingMinutes') ?? CENTRAL_DEFAULTS.behavior.idleSleepingMinutes;
    const bubbleDuration = store.get('settings.behavior.bubbleDuration') ?? CENTRAL_DEFAULTS.behavior.bubbleDuration;
    const sounds = store.get('settings.behavior.sounds') !== false;
    const dnd = store.get('settings.behavior.dnd') === true;

    if (this.idleSleepySlider) {
      this.idleSleepySlider.value = idleSleepy;
      if (this.dispIdleSleepy) this.dispIdleSleepy.textContent = `${idleSleepy} min`;
    }
    if (this.idleSleepingSlider) {
      this.idleSleepingSlider.value = idleSleeping;
      if (this.dispIdleSleeping) this.dispIdleSleeping.textContent = `${idleSleeping} min`;
    }
    if (this.bubbleDurationSlider) {
      this.bubbleDurationSlider.value = bubbleDuration;
      if (this.dispBubbleDuration) this.dispBubbleDuration.textContent = `${bubbleDuration} sec`;
    }
    if (this.soundsToggle) this.soundsToggle.checked = sounds;
    if (this.dndToggle) this.dndToggle.checked = dnd;

    // 3. Reactions
    if (this.reactionBrightness) this.reactionBrightness.checked = store.get('settings.reactions.brightness') !== false;
    if (this.reactionVolume) this.reactionVolume.checked = store.get('settings.reactions.volume') !== false;
    if (this.reactionBattery) this.reactionBattery.checked = store.get('settings.reactions.battery') !== false;
    if (this.reactionMedia) this.reactionMedia.checked = store.get('settings.reactions.media') !== false;
    if (this.reactionNetwork) this.reactionNetwork.checked = store.get('settings.reactions.network') !== false;
    if (this.reactionHeadphones) this.reactionHeadphones.checked = store.get('settings.reactions.headphones') !== false;
    if (this.reactionWelcomeStartup) this.reactionWelcomeStartup.checked = store.get('settings.reactions.welcomeStartup') !== false;
    if (this.reactionGoodbyeShutdown) this.reactionGoodbyeShutdown.checked = store.get('settings.reactions.goodbyeShutdown') !== false;
    if (this.reactionHighload) this.reactionHighload.checked = store.get('settings.reactions.highLoad') !== false;
    if (this.reactionLatenight) this.reactionLatenight.checked = store.get('settings.reactions.lateNight') !== false;

    // Diagnostics & Resource Budget
    this.renderSensorStatus();
    this.refreshPermissions();
    this.updateLiveAppMetrics();

    // 4. Appearance
    const savedApp = store.get('settings.appearance') || {};
    this.appearance = Object.assign({}, DEFAULT_PET_APPEARANCE, savedApp);
    if (this.glassesToggle) {
      this.glassesToggle.checked = !!this.appearance.glassesEnabled;
    }

    const savedAccent = store.get('settings.appearance.accentColor') || DEFAULT_ACCENT_COLOR;
    this.setAccentColor(savedAccent, false);


    // 5. AI Provider
    const activeProvider = store.get('settings.ai.activeProvider') || 'gemini';
    if (this.providerSelect) {
      this.providerSelect.value = activeProvider;
      this.updateProviderFormFields(activeProvider);
      this.updateHeaderBadge(activeProvider);
      this.loadModelsForProvider(activeProvider, { silent: true });
    }

    // 6. Privacy
    if (this.privacyContext) this.privacyContext.checked = store.get('settings.privacy.contextAwareness') !== false;
    if (this.privacyScreenshots) this.privacyScreenshots.checked = store.get('settings.privacy.allowScreenshots') === true;
    if (this.privacyBlocklist) {
      const blocklist = store.get('settings.privacy.blocklist') || ['1password', 'bitwarden', 'lastpass', 'bank', 'login', 'incognito', 'private'];
      this.privacyBlocklist.value = Array.isArray(blocklist) ? blocklist.join(', ') : blocklist;
    }

    // 7. About (Item W1)
    if (this.aboutVersionDisplay) {
      try {
        const { app } = typeof require !== 'undefined' ? require('electron') : {};
        const v = app ? app.getVersion() : '1.0.0';
        this.aboutVersionDisplay.textContent = `v${v}`;
      } catch (e) {
        this.aboutVersionDisplay.textContent = 'v1.0.0';
      }
    }
  }

  checkFirstRun() {
    if (!window.panelController) return;
    const store = window.panelController.store;
    const completed = store.get('onboarding.completed');

    if (!completed && this.firstRunModal) {
      this.firstRunModal.classList.remove('hidden');
      if (this.firstRunPetAvatar) {
        this.firstRunPetAvatar.innerHTML = this.previewRenderer.render('happy', {
          size: 72,
          idPrefix: 'onboarding-avatar'
        });
      }
    }
  }

  setAccentColor(colorHex, broadcast = true) {
    const hex = colorHex || DEFAULT_ACCENT_COLOR;
    if (this.accentColorInput) this.accentColorInput.value = hex;
    if (this.dispAccentColor) this.dispAccentColor.value = hex.toUpperCase();

    this.accentSwatches.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color.toUpperCase() === hex.toUpperCase());
    });

    if (window.ThemeManager && window.ThemeManager.applyAccentColor) {
      window.ThemeManager.applyAccentColor(document, hex);
    }

    if (broadcast && window.panelController && window.panelController.store) {
      window.panelController.store.set('settings.appearance.accentColor', hex);
      if (window.panelController.ipcRenderer) {
        window.panelController.ipcRenderer.send('pet:update-accent', hex);
      }
    }

    this.appearance.primaryColor = hex;
    this.appearance.primaryGlow = hex;
    this.renderLivePreview();
  }

  updateHeaderBadge(providerId) {
    const badgeEl = document.getElementById('header-provider-badge');
    if (!badgeEl) return;
    badgeEl.textContent = (providerId || 'GEMINI').toUpperCase();
  }

  async updateProviderFormFields(providerId) {
    const store = window.panelController.store;
    let key = '';

    // Attempt to load from secure store first
    if (window.panelController.ipcRenderer) {
      try {
        key = await window.panelController.ipcRenderer.invoke('ai:get-key', providerId);
      } catch {
        key = store.get(`settings.ai.apiKeys.${providerId}`) || '';
      }
    } else {
      key = store.get(`settings.ai.apiKeys.${providerId}`) || '';
    }

    const defaultUrls = {
      groq: 'https://api.groq.com/openai/v1',
      openai: 'https://api.openai.com/v1',
      gemini: 'https://generativelanguage.googleapis.com',
      anthropic: 'https://api.anthropic.com/v1',
      ollama: 'http://localhost:11434',
      qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      deepseek: 'https://api.deepseek.com/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      custom: 'https://api.openai.com/v1'
    };

    const baseUrl = store.get(`settings.ai.baseUrls.${providerId}`) || defaultUrls[providerId] || '';

    if (this.apiKeyInput) this.apiKeyInput.value = key || '';
    if (this.baseUrlInput) this.baseUrlInput.value = baseUrl || '';

    if (this.apiKeyRow) {
      this.apiKeyRow.style.opacity = (providerId === 'ollama') ? '0.4' : '1';
    }
  }

  isNonChatModel(id) {
    if (!id) return true;
    const s = String(id).toLowerCase();
    const excludePatterns = [
      'tts', 'orpheus', 'whisper', 'speech', 'audio', 'transcribe',
      'realtime', 'guard', 'safeguard', 'moderation', 'embed', 'rerank',
      'allam', 'arabic', 'saudi', 'image', 'dall-e', 'imagen', 'veo',
      'bilingual', 'clip', 'vision-preview', 'vl-', 'embedding', 'distil-whisper',
      'text-embedding', 'deepseek-vl', 'qwen-vl', 'ocr'
    ];
    return excludePatterns.some(pattern => s.includes(pattern));
  }

  getPriorityDefaultModel(providerId, models = []) {
    const modelIds = models.map(m => (typeof m === 'string' ? m : m.id));
    const eligible = modelIds.filter(id => !this.isNonChatModel(id));

    if (providerId === 'groq') {
      const match =
        eligible.find(id => /llama-3\.[1-9]-.*versatile/i.test(id)) ||
        eligible.find(id => /llama-3\.[1-9]-.*instant/i.test(id)) ||
        eligible.find(id => /llama-3.*versatile/i.test(id)) ||
        eligible.find(id => /llama-3.*instant/i.test(id)) ||
        eligible.find(id => /gpt-oss/i.test(id)) ||
        eligible.find(id => /qwen/i.test(id)) ||
        eligible.find(id => /kimi/i.test(id)) ||
        eligible.find(id => /llama/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'llama-3.3-70b-versatile';
    }

    if (providerId === 'openai') {
      const match =
        eligible.find(id => /^gpt-4o-mini/i.test(id)) ||
        eligible.find(id => /mini/i.test(id)) ||
        eligible.find(id => /^gpt-4o/i.test(id)) ||
        eligible.find(id => /^gpt-4/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'gpt-4o-mini';
    }

    if (providerId === 'gemini') {
      const match =
        eligible.find(id => /gemini-2\.5-flash/i.test(id)) ||
        eligible.find(id => /gemini-2\.0-flash/i.test(id)) ||
        eligible.find(id => /gemini-2\.0-flash-lite/i.test(id)) ||
        eligible.find(id => /gemini-1\.5-flash/i.test(id)) ||
        eligible.find(id => /flash/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'gemini-2.0-flash-lite';
    }

    if (providerId === 'deepseek') {
      const match = eligible.find(id => /deepseek-chat/i.test(id)) || eligible.find(id => /chat/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'deepseek-chat';
    }

    if (providerId === 'qwen') {
      const match =
        eligible.find(id => /qwen-plus/i.test(id)) ||
        eligible.find(id => /qwen-turbo/i.test(id)) ||
        eligible.find(id => /qwen-max/i.test(id)) ||
        eligible.find(id => /qwen/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'qwen-plus';
    }

    if (providerId === 'openrouter') {
      const match =
        eligible.find(id => /llama-3\.[1-9]/i.test(id)) ||
        eligible.find(id => /claude-3-5/i.test(id)) ||
        eligible.find(id => /gpt-4o/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'meta-llama/llama-3.3-70b-instruct';
    }

    if (providerId === 'anthropic') {
      const match = eligible.find(id => /claude-3-5-sonnet/i.test(id)) || eligible.find(id => /claude-3-5-haiku/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'claude-3-5-sonnet-20241022';
    }

    if (providerId === 'ollama') {
      const match = eligible.find(id => /llama3/i.test(id)) || eligible.find(id => /mistral/i.test(id));
      if (match) return match;
      if (eligible.length > 0) return eligible[0];
      return 'llama3:latest';
    }

    if (eligible.length > 0) return eligible[0];
    return modelIds[0] || 'default';
  }

  async loadModelsForProvider(providerId, options = {}) {
    if (!this.modelSelect) return;
    const store = window.panelController.store;
    const apiKey = this.apiKeyInput ? this.apiKeyInput.value.trim() : '';
    const savedKey = store.getApiKey ? store.getApiKey(providerId) : (store.get(`settings.ai.keys.${providerId}`) || '');
    const effectiveKey = apiKey || savedKey || '';
    const baseUrl = this.baseUrlInput ? this.baseUrlInput.value.trim() : '';

    // Don't call model API without a key — avoids repeated 'API key required' errors
    if (!effectiveKey && providerId !== 'ollama') {
      if (this.modelStatusHint) {
        this.modelStatusHint.textContent = 'Enter an API key above to load available models.';
        this.modelStatusHint.className = 'model-status-hint info';
      }
      return;
    }

    if (this.refreshModelsBtn) {
      this.refreshModelsBtn.classList.add('loading');
      this.refreshModelsBtn.disabled = true;
    }
    if (this.modelStatusHint) {
      this.modelStatusHint.textContent = 'Discovering active models...';
      this.modelStatusHint.className = 'model-status-hint info';
    }

    try {
      let models = [];
      if (window.panelController.ipcRenderer) {
        models = await window.panelController.ipcRenderer.invoke('ai:fetch-models', { provider: providerId, apiKey, baseUrl });
      }

      this.modelSelect.innerHTML = '';
      if (Array.isArray(models) && models.length > 0) {
        const chatModels = models.filter(m => !this.isNonChatModel(m.id));
        const otherModels = models.filter(m => this.isNonChatModel(m.id));

        if (chatModels.length > 0) {
          const chatGroup = document.createElement('optgroup');
          chatGroup.label = 'Chat Models';
          chatModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name || m.id;
            chatGroup.appendChild(opt);
          });
          this.modelSelect.appendChild(chatGroup);
        }

        if (otherModels.length > 0) {
          const otherGroup = document.createElement('optgroup');
          otherGroup.label = 'Other models (not for chat)';
          otherModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = `${m.name || m.id} (not for chat)`;
            otherGroup.appendChild(opt);
          });
          this.modelSelect.appendChild(otherGroup);
        }

        const savedModel = store.get(`settings.ai.models.${providerId}`);
        const isExcluded = !savedModel || this.isNonChatModel(savedModel);
        const existsInChat = chatModels.some(m => m.id === savedModel);

        if (isExcluded || !existsInChat) {
          const def = this.getPriorityDefaultModel(providerId, chatModels.length > 0 ? chatModels : models);
          this.modelSelect.value = def;
          store.set(`settings.ai.models.${providerId}`, def);
          if (this.modelStatusHint) {
            this.modelStatusHint.textContent = `Migrated model from ${savedModel || 'none'} to ${def} (chat-optimized).`;
            this.modelStatusHint.className = 'model-status-hint info';
          }
        } else {
          this.modelSelect.value = savedModel;
          if (this.modelStatusHint) {
            this.modelStatusHint.textContent = `${chatModels.length} chat models active. Selected: ${savedModel}`;
            this.modelStatusHint.className = 'model-status-hint success';
          }
        }
      } else {
        const _fbMap = { gemini: 'gemini-2.0-flash-lite', groq: 'llama-3.3-70b-versatile', openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-20241022', deepseek: 'deepseek-chat', qwen: 'qwen-plus' };
        const fallback = _fbMap[providerId] || 'default';
        this.modelSelect.innerHTML = `<option value="${fallback}">${fallback}</option>`;
        if (this.modelStatusHint) {
          this.modelStatusHint.textContent = 'Using default model profile.';
          this.modelStatusHint.className = 'model-status-hint warn';
        }
      }
    } catch (err) {
      if (this.modelStatusHint) {
        this.modelStatusHint.textContent = 'Could not fetch remote models; using default list.';
        this.modelStatusHint.className = 'model-status-hint warn';
      }
    } finally {
      if (this.refreshModelsBtn) {
        this.refreshModelsBtn.classList.remove('loading');
        this.refreshModelsBtn.disabled = false;
      }
      if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
        window.panelController.refreshIcons();
      }
    }
  }

  updateAppearanceUI() {
    const a = this.appearance;
    if (this.scaleSlider) this.scaleSlider.value = a.scale;
    if (this.dispScale) this.dispScale.textContent = `${Math.round(a.scale * 100)}%`;
    if (this.widthSlider) this.widthSlider.value = a.width;
    if (this.dispWidth) this.dispWidth.textContent = `${Math.round(a.width)} px`;
    if (this.heightSlider) this.heightSlider.value = a.height;
    if (this.dispHeight) this.dispHeight.textContent = `${Math.round(a.height)} px`;
    if (this.roundnessSlider) this.roundnessSlider.value = a.roundness;
    if (this.dispRoundness) this.dispRoundness.textContent = `${Math.round(a.roundness)}%`;
    if (this.eyeSizeSlider) this.eyeSizeSlider.value = a.eyeSize;
    if (this.dispEyeSize) this.dispEyeSize.textContent = `${parseFloat(a.eyeSize).toFixed(1)}x`;
    if (this.eyeSpacingSlider) this.eyeSpacingSlider.value = a.eyeSpacing;
    if (this.dispEyeSpacing) this.dispEyeSpacing.textContent = `${Math.round(a.eyeSpacing)} px`;
    if (this.mouthWidthSlider) this.mouthWidthSlider.value = a.mouthWidth;
    if (this.dispMouthWidth) this.dispMouthWidth.textContent = `${Math.round(a.mouthWidth)} px`;
    if (this.depthSlider) this.depthSlider.value = a.depth;
    if (this.dispDepth) this.dispDepth.textContent = `${Math.round(a.depth)}%`;
    if (this.bodyColorInput) this.bodyColorInput.value = a.bodyColor || '#FFFFFF';
    if (this.dispBodyColor) this.dispBodyColor.value = (a.bodyColor || '#FFFFFF').toUpperCase();
    if (this.glassesToggle) this.glassesToggle.checked = !!a.glassesEnabled;
  }

  renderLivePreview() {
    if (!this.previewContainer) return;
    this.previewRenderer.updateConfig(this.appearance);
    this.previewContainer.innerHTML = this.previewRenderer.render('happy', {
      size: 130,
      idPrefix: 'settings-preview-svg'
    });
  }

  broadcastAppearance() {
    this.renderLivePreview();
    if (window.panelController && window.panelController.store) {
      window.panelController.store.set('settings.appearance', this.appearance);
    }
    if (window.panelController && window.panelController.ipcRenderer) {
      window.panelController.ipcRenderer.send('pet:update-appearance', this.appearance);
    }
    if (window.panelController && window.panelController.chatTab) {
      window.panelController.chatTab.renderMiniAvatar();
    }
  }

  setupEvents() {
    // 1. General Events
    if (this.petNameInput) {
      this.petNameInput.addEventListener('input', (e) => {
        const name = e.target.value.trim().slice(0, 20) || 'Bolt';
        window.panelController.store.set('settings.general.petName', name);
        window.panelController.applyPetName(name);
        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('pet:update-name', name);
        }
      });
    }

    if (this.userNameInput) {
      this.userNameInput.addEventListener('input', (e) => {
        const name = e.target.value.trim().slice(0, 20);
        window.panelController.store.set('settings.general.userName', name);
        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('settings:user-name-changed', name);
        }
      });
    }

    if (this.alwaysOnTopToggle) {
      this.alwaysOnTopToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        window.panelController.store.set('settings.general.alwaysOnTop', val);
        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('window:set-always-on-top', val);
        }
      });
    }

    if (this.rememberPosToggle) {
      this.rememberPosToggle.addEventListener('change', (e) => {
        window.panelController.store.set('settings.general.rememberPosition', e.target.checked);
      });
    }

    if (this.launchLoginToggle) {
      this.launchLoginToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        window.panelController.store.set('settings.general.launchAtLogin', val);
        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('window:set-launch-login', val);
        }
      });
    }

    // 2. Behavior Events
    if (this.idleSleepySlider) {
      this.idleSleepySlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.dispIdleSleepy) this.dispIdleSleepy.textContent = `${val} min`;
        window.panelController.store.set('settings.behavior.idleSleepyMinutes', val);
        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('behavior:update', { idleSleepyMinutes: val });
        }
      });
    }

    if (this.idleSleepingSlider) {
      this.idleSleepingSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.dispIdleSleeping) this.dispIdleSleeping.textContent = `${val} min`;
        window.panelController.store.set('settings.behavior.idleSleepingMinutes', val);
        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('behavior:update', { idleSleepingMinutes: val });
        }
      });
    }

    if (this.bubbleDurationSlider) {
      this.bubbleDurationSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.dispBubbleDuration) this.dispBubbleDuration.textContent = `${val} sec`;
        window.panelController.store.set('settings.behavior.bubbleDuration', val);
      });
    }

    if (this.soundsToggle) {
      this.soundsToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        window.panelController.store.set('settings.behavior.sounds', val);
        if (window.soundEffects) window.soundEffects.setEnabled(val);
      });
    }

    if (this.dndToggle) {
      this.dndToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        window.panelController.store.set('settings.behavior.dnd', val);
        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('behavior:dnd-toggle', val);
        }
      });
    }

    // 3. Reactions Events
    const reactionToggles = [
      { el: this.reactionBrightness, key: 'brightness' },
      { el: this.reactionVolume, key: 'volume' },
      { el: this.reactionBattery, key: 'battery' },
      { el: this.reactionMedia, key: 'media' },
      { el: this.reactionNetwork, key: 'network' },
      { el: this.reactionHeadphones, key: 'headphones' },
      { el: this.reactionWelcomeStartup, key: 'welcomeStartup' },
      { el: this.reactionGoodbyeShutdown, key: 'goodbyeShutdown' },
      { el: this.reactionHighload, key: 'highLoad' },
      { el: this.reactionLatenight, key: 'lateNight' }
    ];

    reactionToggles.forEach(({ el, key }) => {
      if (el) {
        el.addEventListener('change', (e) => {
          const val = e.target.checked;
          window.panelController.store.set(`settings.reactions.${key}`, val);
          if (window.panelController.ipcRenderer) {
            window.panelController.ipcRenderer.send('settings:reactions-updated', { [key]: val });
          }
          if (window.soundEffects) window.soundEffects.playTap();
        });
      }
    });

    // Sensor Status Buttons
    if (this.btnRefreshSensors) {
      this.btnRefreshSensors.addEventListener('click', () => {
        this.renderSensorStatus();
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    if (this.btnOpenAccessibility) {
      this.btnOpenAccessibility.addEventListener('click', () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('system:open-settings-pane', 'accessibility');
        }
      });
    }

    // 3.5. System Permissions Events (Requirement 4)
    if (this.btnRecheckPermissions) {
      this.btnRecheckPermissions.addEventListener('click', () => {
        this.refreshPermissions();
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    window.addEventListener('focus', () => this.refreshPermissions());

    if (this.btnOpenPermAccessibility) {
      this.btnOpenPermAccessibility.addEventListener('click', () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('system:open-permission-settings', 'accessibility');
        }
      });
    }

    if (this.btnRequestPermAccessibility) {
      this.btnRequestPermAccessibility.addEventListener('click', async () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          await window.panelController.ipcRenderer.invoke('system:request-permission', 'accessibility');
          this.refreshPermissions();
        }
      });
    }

    if (this.btnOpenPermScreen) {
      this.btnOpenPermScreen.addEventListener('click', () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('system:open-permission-settings', 'screen');
        }
      });
    }

    if (this.btnRequestPermScreen) {
      this.btnRequestPermScreen.addEventListener('click', async () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          await window.panelController.ipcRenderer.invoke('system:request-permission', 'screen');
          this.refreshPermissions();
        }
      });
    }

    if (this.btnOpenPermAutomation) {
      this.btnOpenPermAutomation.addEventListener('click', () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('system:open-permission-settings', 'automation');
        }
      });
    }

    if (this.btnRequestPermAutomation) {
      this.btnRequestPermAutomation.addEventListener('click', async () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          await window.panelController.ipcRenderer.invoke('system:request-permission', 'automation');
          this.refreshPermissions();
        }
      });
    }

    // 4. Appearance Events

    if (this.accentColorInput) {
      const applyInput = (val) => {
        if (val) this.setAccentColor(val);
      };
      this.accentColorInput.addEventListener('input', (e) => applyInput(e.target.value));
      this.accentColorInput.addEventListener('change', (e) => applyInput(e.target.value));
    }

    if (this.dispAccentColor) {
      const handleTextInput = (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith('#') && /^[0-9A-Fa-f]{6}$/.test(val)) {
          val = '#' + val;
        }
        if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
          this.setAccentColor(val);
        }
      };
      this.dispAccentColor.addEventListener('input', handleTextInput);
      this.dispAccentColor.addEventListener('change', (e) => {
        handleTextInput(e);
        if (!/^#[0-9A-Fa-f]{6}$/.test(e.target.value.trim())) {
          this.dispAccentColor.value = (this.appearance.primaryColor || DEFAULT_ACCENT_COLOR).toUpperCase();
        }
      });
    }

    this.accentSwatches.forEach(btn => {
      btn.addEventListener('click', () => {
        this.setAccentColor(btn.dataset.color);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });

    if (this.btnAccentDefault) {
      this.btnAccentDefault.addEventListener('click', () => {
        this.setAccentColor(DEFAULT_ACCENT_COLOR);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    // Appearance Sliders
    const sliders = [
      { el: this.scaleSlider, prop: 'scale', isFloat: true, disp: this.dispScale, suffix: '%' },
      { el: this.widthSlider, prop: 'width', isFloat: false, disp: this.dispWidth, suffix: ' px' },
      { el: this.heightSlider, prop: 'height', isFloat: false, disp: this.dispHeight, suffix: ' px' },
      { el: this.roundnessSlider, prop: 'roundness', isFloat: false, disp: this.dispRoundness, suffix: '%' },
      { el: this.eyeSizeSlider, prop: 'eyeSize', isFloat: true, disp: this.dispEyeSize, suffix: 'x' },
      { el: this.eyeSpacingSlider, prop: 'eyeSpacing', isFloat: false, disp: this.dispEyeSpacing, suffix: ' px' },
      { el: this.mouthWidthSlider, prop: 'mouthWidth', isFloat: false, disp: this.dispMouthWidth, suffix: ' px' },
      { el: this.depthSlider, prop: 'depth', isFloat: false, disp: this.dispDepth, suffix: '%' }
    ];

    sliders.forEach(({ el, prop, isFloat, disp, suffix }) => {
      if (el) {
        el.addEventListener('input', (e) => {
          const val = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
          this.appearance[prop] = val;
          if (disp) disp.textContent = isFloat && suffix === '%' ? `${Math.round(val * 100)}%` : `${val}${suffix}`;
          this.broadcastAppearance();
        });
      }
    });

    if (this.bodyColorInput) {
      this.bodyColorInput.addEventListener('input', (e) => {
        const col = e.target.value;
        this.appearance.bodyColor = col;
        if (this.dispBodyColor) this.dispBodyColor.value = col.toUpperCase();
        this.broadcastAppearance();
      });
    }

    if (this.btnPureWhite) {
      this.btnPureWhite.addEventListener('click', () => {
        this.appearance.bodyColor = '#FFFFFF';
        if (this.bodyColorInput) this.bodyColorInput.value = '#FFFFFF';
        if (this.dispBodyColor) this.dispBodyColor.value = '#FFFFFF';
        this.broadcastAppearance();
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    if (this.glassesToggle) {
      this.glassesToggle.addEventListener('change', (e) => {
        const val = e.target.checked;
        this.appearance.glassesEnabled = val;
        this.broadcastAppearance();
        if (window.panelController && window.panelController.store) {
          window.panelController.store.set('settings.appearance.glassesEnabled', val);
        }
      });
    }

    if (this.resetAppearanceBtn) {
      this.resetAppearanceBtn.addEventListener('click', () => {
        this.appearance = Object.assign({}, DEFAULT_PET_APPEARANCE);
        this.updateAppearanceUI();
        this.broadcastAppearance();
        this.setAccentColor(DEFAULT_ACCENT_COLOR);

        if (this.panelTransparencySlider) this.panelTransparencySlider.value = 30;
        if (this.dispPanelTransparency) this.dispPanelTransparency.textContent = '30%';
        window.panelController.store.set('settings.appearance.panelTransparency', DEFAULT_PANEL_TRANSPARENCY);
        document.documentElement.style.setProperty('--panel-transparency', DEFAULT_PANEL_TRANSPARENCY);
        document.documentElement.style.setProperty('--panel-alpha', DEFAULT_PANEL_TRANSPARENCY);

        if (this.panelBlurSlider) this.panelBlurSlider.value = DEFAULT_PANEL_BLUR;
        if (this.dispPanelBlur) this.dispPanelBlur.textContent = `${DEFAULT_PANEL_BLUR} px`;
        window.panelController.store.set('settings.appearance.panelBlur', DEFAULT_PANEL_BLUR);
        document.documentElement.style.setProperty('--panel-blur', `${DEFAULT_PANEL_BLUR}px`);
        document.documentElement.style.setProperty('--blur', `${DEFAULT_PANEL_BLUR}px`);

        if (window.soundEffects) window.soundEffects.playChirp();
      });
    }

    // 5. AI Provider Events
    if (this.providerSelect) {
      this.providerSelect.addEventListener('change', async (e) => {
        const newProvider = e.target.value;
        await this.updateProviderFormFields(newProvider);
        this.updateHeaderBadge(newProvider);
        window.panelController.store.set('settings.ai.activeProvider', newProvider);
        await this.loadModelsForProvider(newProvider);

        if (this.testFeedbackBox) this.testFeedbackBox.classList.add('hidden');
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', (e) => {
        const providerId = this.providerSelect.value;
        window.panelController.store.set(`settings.ai.models.${providerId}`, e.target.value);
        if (window.panelController.chatTab) {
          window.panelController.chatTab.updateModelInfo();
        }
      });
    }

    if (this.refreshModelsBtn) {
      this.refreshModelsBtn.addEventListener('click', async () => {
        const providerId = this.providerSelect.value;
        await this.loadModelsForProvider(providerId);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    if (this.saveAiBtn) {
      this.saveAiBtn.addEventListener('click', async () => {
        const providerId = this.providerSelect.value;
        const key = this.apiKeyInput ? this.apiKeyInput.value.trim() : '';
        const model = this.modelSelect ? this.modelSelect.value : '';
        const baseUrl = this.baseUrlInput ? this.baseUrlInput.value.trim() : '';
        const store = window.panelController.store;

        if (window.panelController.ipcRenderer) {
          await window.panelController.ipcRenderer.invoke('ai:save-key', { provider: providerId, key });
        }
        store.set(`settings.ai.models.${providerId}`, model);
        store.set(`settings.ai.baseUrls.${providerId}`, baseUrl);

        this.saveAiBtn.innerHTML = '<i data-lucide="check"></i><span>Saved!</span>';
        if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
          window.panelController.refreshIcons();
        }
        setTimeout(() => {
          this.saveAiBtn.innerHTML = '<i data-lucide="check"></i><span>Save Configuration</span>';
          if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
            window.panelController.refreshIcons();
          }
        }, 2000);

        await this.loadModelsForProvider(providerId);
        if (window.soundEffects) window.soundEffects.playChirp();
      });
    }

    // AI Provider: "Test Connection" Button with PASS/FAIL
    if (this.testAiBtn) {
      this.testAiBtn.addEventListener('click', async () => {
        const providerId = this.providerSelect.value;
        const apiKey = this.apiKeyInput ? this.apiKeyInput.value.trim() : '';
        const model = this.modelSelect ? this.modelSelect.value : '';
        const baseUrl = this.baseUrlInput ? this.baseUrlInput.value.trim() : '';

        this.testAiBtn.disabled = true;
        this.testAiBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Testing...</span>';
        if (this.testFeedbackBox) this.testFeedbackBox.classList.add('hidden');

        try {
          let res = { success: false, friendly: 'IPC unreachable' };
          if (window.panelController.ipcRenderer) {
            res = await window.panelController.ipcRenderer.invoke('ai:test-connection', {
              provider: providerId,
              apiKey,
              model,
              baseUrl
            });
          }

          if (this.testFeedbackBox && this.feedbackBadge && this.feedbackText) {
            this.testFeedbackBox.classList.remove('hidden');
            if (res.success) {
              this.feedbackBadge.className = 'feedback-badge pass';
              this.feedbackBadge.textContent = 'PASS';
              this.feedbackText.textContent = res.friendly || 'Connection verified successfully!';
              if (window.soundEffects) window.soundEffects.playHappy();
            } else {
              this.feedbackBadge.className = 'feedback-badge fail';
              this.feedbackBadge.textContent = 'FAIL';
              this.feedbackText.textContent = res.friendly || 'Connection test failed. Check settings.';
              if (window.soundEffects) window.soundEffects.playTap();
            }
          }
        } catch (err) {
          if (this.testFeedbackBox && this.feedbackBadge && this.feedbackText) {
            this.testFeedbackBox.classList.remove('hidden');
            this.feedbackBadge.className = 'feedback-badge fail';
            this.feedbackBadge.textContent = 'FAIL';
            this.feedbackText.textContent = err.message || 'Network or configuration error';
          }
        } finally {
          this.testAiBtn.disabled = false;
          this.testAiBtn.innerHTML = '<i data-lucide="activity"></i><span>Test Connection</span>';
          if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
            window.panelController.refreshIcons();
          }
        }
      });
    }

    // 6. Privacy Events
    if (this.privacyContext) {
      this.privacyContext.addEventListener('change', (e) => {
        window.panelController.store.set('settings.privacy.contextAwareness', e.target.checked);
      });
    }

    if (this.privacyScreenshots) {
      this.privacyScreenshots.addEventListener('change', (e) => {
        window.panelController.store.set('settings.privacy.allowScreenshots', e.target.checked);
      });
    }

    if (this.privacyBlocklist) {
      this.privacyBlocklist.addEventListener('change', (e) => {
        const words = e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        window.panelController.store.set('settings.privacy.blocklist', words);
      });
    }

    // 6.5 Data Management Events (Item I1)
    if (this.btnExportData) {
      this.btnExportData.addEventListener('click', async () => {
        this.showDataStatus('Preparing export...', 'info');
        try {
          const res = await window.panelController.ipcRenderer.invoke('data:export');
          if (res.canceled) {
            this.hideDataStatus();
            return;
          }
          if (res.success) {
            this.showDataStatus(`Exported ${res.counts.notes} notes, ${res.counts.todos} to-dos, ${res.counts.reminders} reminders successfully!`, 'success');
            if (window.soundEffects) window.soundEffects.playHappy();
          } else {
            this.showDataStatus(res.error || 'Failed to export data.', 'error');
          }
        } catch (err) {
          this.showDataStatus(err.message || 'Error exporting data.', 'error');
        }
      });
    }

    if (this.btnImportData) {
      this.btnImportData.addEventListener('click', async () => {
        this.hideDataStatus();
        try {
          const res = await window.panelController.ipcRenderer.invoke('data:select-import-file');
          if (res.canceled) return;
          if (res.error) {
            this.showDataStatus(res.error, 'error');
            if (window.soundEffects) window.soundEffects.playTap();
            return;
          }
          if (res.success && res.data) {
            this.pendingImportData = res.data;
            const c = res.preview.counts;
            const fileName = res.filePath ? res.filePath.split(/[\\/]/).pop() : 'backup.json';
            this.importCountsSummary.innerHTML = `<strong>File:</strong> ${fileName}<br>` +
              `<strong>Contents:</strong> ${c.settings} settings categories, ${c.notes} notes, ${c.todos} to-dos, ${c.reminders} reminders.`;
            if (c.notes > 0) {
              this.importNotesStrategyWrap.style.display = 'block';
            } else {
              this.importNotesStrategyWrap.style.display = 'none';
            }
            this.importPreviewBox.style.display = 'block';
            if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
              window.panelController.refreshIcons();
            }
          }
        } catch (err) {
          this.showDataStatus(err.message || 'Error reading import file.', 'error');
        }
      });
    }

    if (this.btnCancelImport) {
      this.btnCancelImport.addEventListener('click', () => {
        this.pendingImportData = null;
        this.importPreviewBox.style.display = 'none';
      });
    }

    if (this.btnConfirmImport) {
      this.btnConfirmImport.addEventListener('click', async () => {
        if (!this.pendingImportData) return;
        const selectedRadio = document.querySelector('input[name="notes-import-strategy"]:checked');
        const notesStrategy = selectedRadio ? selectedRadio.value : 'merge';
        this.btnConfirmImport.disabled = true;
        this.btnConfirmImport.textContent = 'Importing...';
        try {
          const res = await window.panelController.ipcRenderer.invoke('data:apply-import', {
            data: this.pendingImportData,
            notesStrategy
          });
          if (res.success) {
            this.importPreviewBox.style.display = 'none';
            this.pendingImportData = null;
            this.showDataStatus(`Import completed! Created safety backup in userData.`, 'success');
            if (window.soundEffects) window.soundEffects.playHappy();
          } else {
            this.showDataStatus(res.error || 'Failed to apply import.', 'error');
          }
        } catch (err) {
          this.showDataStatus(err.message || 'Error applying imported data.', 'error');
        } finally {
          this.btnConfirmImport.disabled = false;
          this.btnConfirmImport.textContent = 'Confirm & Apply';
        }
      });
    }

    // 7. About Section Buttons (Item W1)
    if (this.aboutGithubBtn) {
      this.aboutGithubBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try {
          const { shell } = require('electron');
          shell.openExternal('https://github.com/samirhusayn28-dev');
        } catch (err) {}
      });
    }

    if (this.aboutShowWelcomeBtn) {
      this.aboutShowWelcomeBtn.addEventListener('click', () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('welcome:open');
        }
      });
    }

    if (this.aboutCheckUpdatesBtn) {
      this.aboutCheckUpdatesBtn.addEventListener('click', () => {
        if (window.panelController && window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('update:check-now');
        }
        if (this.aboutUpdateStatus) {
          this.aboutUpdateStatus.classList.remove('hidden');
          this.aboutUpdateStatus.style.display = 'block';
          this.aboutUpdateStatus.innerHTML = '<span style="opacity:0.8;">Checking for updates...</span>';
        }
      });
    }

    if (this.autoUpdateToggle) {
      this.autoUpdateToggle.addEventListener('change', (e) => {
        window.panelController.store.set('settings.general.autoUpdateCheck', e.target.checked);
      });
    }

    if (window.panelController && window.panelController.ipcRenderer) {
      window.panelController.ipcRenderer.on('update:status', (event, { result, isManual }) => {
        if (!this.aboutUpdateStatus) return;
        this.aboutUpdateStatus.classList.remove('hidden');
        this.aboutUpdateStatus.style.display = 'block';

        if (result.status === 'up_to_date') {
          if (isManual) {
            this.aboutUpdateStatus.innerHTML = `<span style="color:#10B981;">✓ Desktop Pet is up to date (v${result.currentVersion}).</span>`;
          }
        } else if (result.status === 'update_available') {
          this.aboutUpdateStatus.innerHTML = `
            <div style="background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 8px; padding: 10px; margin-top: 6px;">
              <div style="font-weight: 600; color: #38BDF8; margin-bottom: 2px;">Update Available: v${result.latestVersion}</div>
              <div style="font-size: 11px; opacity: 0.85; margin-bottom: 8px;">A new release is available on GitHub.</div>
              <div style="display: flex; gap: 8px;">
                <button type="button" class="theme-btn-primary" id="btn-update-download" style="padding: 4px 10px; font-size: 11px;">Download Update</button>
                <button type="button" class="theme-btn-secondary" id="btn-update-skip" style="padding: 4px 10px; font-size: 11px;">Skip this version</button>
              </div>
            </div>
          `;
          const dlBtn = document.getElementById('btn-update-download');
          const skipBtn = document.getElementById('btn-update-skip');
          if (dlBtn) {
            dlBtn.addEventListener('click', () => {
              window.panelController.ipcRenderer.send('update:open-download', result.downloadUrl || result.releaseUrl);
            });
          }
          if (skipBtn) {
            skipBtn.addEventListener('click', () => {
              window.panelController.ipcRenderer.send('update:skip-version', result.latestVersion);
              this.aboutUpdateStatus.innerHTML = `<span style="opacity:0.7;">Skipped v${result.latestVersion}.</span>`;
            });
          }
        } else if (result.status === 'error') {
          this.aboutUpdateStatus.innerHTML = `<span style="color:#EF4444;">${result.error || "Couldn't check for updates. Check your internet connection."}</span>`;
        } else if (result.status === 'no_releases') {
          this.aboutUpdateStatus.innerHTML = `<span style="opacity:0.8;">No published releases found yet.</span>`;
        }
      });
    }
  }

  async renderSensorStatus() {
    if (!this.sensorStatusList) return;
    try {
      let list = [];
      if (window.panelController && window.panelController.ipcRenderer) {
        list = await window.panelController.ipcRenderer.invoke('system:get-sensor-status');
      }
      if (!Array.isArray(list) || list.length === 0) return;

      this.sensorStatusList.innerHTML = list.map(s => {
        const isWorking = s.status === 'Working';
        const badgeClass = isWorking ? 'status-pill-ok' : (s.status.includes('Unavailable') ? 'status-pill-muted' : 'status-pill-warn');
        return `
          <div class="sensor-status-row">
            <div class="sensor-meta">
              <span class="sensor-name">${s.name}</span>
              <span class="sensor-detail">${s.detail || ''}</span>
            </div>
            <span class="status-pill ${badgeClass}">${s.status}</span>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.warn('[SettingsTab] Could not render sensor status:', e);
    }
  }

  async refreshPermissions() {
    if (!window.panelController || !window.panelController.ipcRenderer) return;
    try {
      const perms = await window.panelController.ipcRenderer.invoke('system:get-permissions-status');
      if (!perms) return;

      if (this.permDevNotice) {
        this.permDevNotice.style.display = perms.isDev ? 'flex' : 'none';
      }

      this.updatePermBadge(this.badgePermAccessibility, perms.accessibility);
      this.updatePermBadge(this.badgePermScreen, perms.screenRecording);
      this.updatePermBadge(this.badgePermAutomation, perms.automation);
    } catch (e) {
      console.warn('[SettingsTab] Could not refresh permissions:', e);
    }
  }

  updatePermBadge(el, status) {
    if (!el) return;
    const isGranted = status === 'granted';
    el.textContent = isGranted ? 'Granted' : 'Not granted';
    el.className = `perm-badge ${isGranted ? 'granted' : 'denied'}`;
  }

  async updateLiveAppMetrics() {
    try {
      if (window.panelController && window.panelController.ipcRenderer) {
        const metrics = await window.panelController.ipcRenderer.invoke('system:get-app-metrics');
        if (metrics) {
          if (this.dispLiveRam) this.dispLiveRam.textContent = `${metrics.totalRamMB} MB`;
          if (this.dispLiveCpu) this.dispLiveCpu.textContent = `${metrics.totalCpu}%`;
          if (this.dispLiveBudget) {
            const isGood = metrics.totalRamMB < 220;
            this.dispLiveBudget.textContent = isGood ? 'PASS (<220MB)' : `${metrics.totalRamMB} MB`;
            this.dispLiveBudget.className = isGood ? 'usage-val highlight pass' : 'usage-val highlight warn';
          }
        }
      }
    } catch (e) {
      console.warn('[SettingsTab] Could not update live app metrics:', e);
    }
  }

  /* =========================================================================
   * ITEM S1 — RESET TO DEFAULT EVERYWHERE
   * ========================================================================= */
  setupResetSystem() {
    this.resettableControls = [
      // 1. General
      { id: 'setting-pet-name', section: 'general', key: 'settings.general.petName', type: 'text', defaultVal: CENTRAL_DEFAULTS.general.petName },
      { id: 'setting-user-name', section: 'general', key: 'settings.general.userName', type: 'text', defaultVal: CENTRAL_DEFAULTS.general.userName },
      { id: 'setting-always-on-top', section: 'general', key: 'settings.general.alwaysOnTop', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.general.alwaysOnTop },
      { id: 'setting-remember-pos', section: 'general', key: 'settings.general.rememberPosition', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.general.rememberPosition },
      { id: 'setting-launch-login', section: 'general', key: 'settings.general.launchAtLogin', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.general.launchAtLogin },
      { id: 'setting-auto-update', section: 'general', key: 'settings.general.autoUpdateCheck', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.general.autoUpdateCheck },

      // 2. Behavior
      { id: 'setting-idle-sleepy', section: 'behavior', key: 'settings.behavior.idleSleepyMinutes', type: 'slider', defaultVal: CENTRAL_DEFAULTS.behavior.idleSleepyMinutes, dispId: 'disp-idle-sleepy', suffix: ' min' },
      { id: 'setting-idle-sleeping', section: 'behavior', key: 'settings.behavior.idleSleepingMinutes', type: 'slider', defaultVal: CENTRAL_DEFAULTS.behavior.idleSleepingMinutes, dispId: 'disp-idle-sleeping', suffix: ' min' },
      { id: 'setting-bubble-duration', section: 'behavior', key: 'settings.behavior.bubbleDuration', type: 'slider', defaultVal: CENTRAL_DEFAULTS.behavior.bubbleDuration, dispId: 'disp-bubble-duration', suffix: ' sec' },
      { id: 'setting-sounds', section: 'behavior', key: 'settings.behavior.sounds', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.behavior.sounds },
      { id: 'setting-dnd', section: 'behavior', key: 'settings.behavior.dnd', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.behavior.dnd },

      // 3. Reactions
      { id: 'reaction-brightness', section: 'reactions', key: 'settings.reactions.brightness', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.brightness },
      { id: 'reaction-volume', section: 'reactions', key: 'settings.reactions.volume', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.volume },
      { id: 'reaction-battery', section: 'reactions', key: 'settings.reactions.battery', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.battery },
      { id: 'reaction-media', section: 'reactions', key: 'settings.reactions.media', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.media },
      { id: 'reaction-network', section: 'reactions', key: 'settings.reactions.network', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.network },
      { id: 'reaction-headphones', section: 'reactions', key: 'settings.reactions.headphones', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.headphones },
      { id: 'reaction-welcome-startup', section: 'reactions', key: 'settings.reactions.welcomeStartup', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.welcomeStartup },
      { id: 'reaction-goodbye-shutdown', section: 'reactions', key: 'settings.reactions.goodbyeShutdown', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.goodbyeShutdown },
      { id: 'reaction-highload', section: 'reactions', key: 'settings.reactions.highLoad', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.highLoad },
      { id: 'reaction-latenight', section: 'reactions', key: 'settings.reactions.lateNight', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.reactions.lateNight },

      // 4. Appearance
      { id: 'setting-pet-scale', section: 'appearance', prop: 'scale', type: 'slider', defaultVal: CENTRAL_DEFAULTS.appearance.scale, isFloat: true, dispId: 'disp-pet-scale', suffix: '%' },
      { id: 'setting-pet-width', section: 'appearance', prop: 'width', type: 'slider', defaultVal: CENTRAL_DEFAULTS.appearance.width, dispId: 'disp-pet-width', suffix: ' px' },
      { id: 'setting-pet-height', section: 'appearance', prop: 'height', type: 'slider', defaultVal: CENTRAL_DEFAULTS.appearance.height, dispId: 'disp-pet-height', suffix: ' px' },
      { id: 'setting-pet-roundness', section: 'appearance', prop: 'roundness', type: 'slider', defaultVal: CENTRAL_DEFAULTS.appearance.roundness, dispId: 'disp-pet-roundness', suffix: '%' },
      { id: 'setting-pet-eyesize', section: 'appearance', prop: 'eyeSize', type: 'slider', defaultVal: CENTRAL_DEFAULTS.appearance.eyeSize, isFloat: true, dispId: 'disp-pet-eyesize', suffix: 'x' },
      { id: 'setting-pet-eyespacing', section: 'appearance', prop: 'eyeSpacing', type: 'slider', defaultVal: CENTRAL_DEFAULTS.appearance.eyeSpacing, dispId: 'disp-pet-eyespacing', suffix: ' px' },
      { id: 'setting-pet-mouthwidth', section: 'appearance', prop: 'mouthWidth', type: 'slider', defaultVal: CENTRAL_DEFAULTS.appearance.mouthWidth, dispId: 'disp-pet-mouthwidth', suffix: ' px' },
      { id: 'setting-pet-depth', section: 'appearance', prop: 'depth', type: 'slider', defaultVal: CENTRAL_DEFAULTS.appearance.depth, dispId: 'disp-pet-depth', suffix: '%' },
      { id: 'setting-accent-color', section: 'appearance', prop: 'accentColor', type: 'accentColor', defaultVal: CENTRAL_DEFAULTS.appearance.accentColor },
      { id: 'setting-pet-bodycolor', section: 'appearance', prop: 'bodyColor', type: 'bodyColor', defaultVal: CENTRAL_DEFAULTS.appearance.bodyColor },
      { id: 'setting-pet-glasses', section: 'appearance', prop: 'glassesEnabled', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.appearance.glassesEnabled },

      // 5. AI Configuration (Provider and Custom Base URL only; API Keys are NEVER reset)
      { id: 'setting-ai-provider', section: 'ai', key: 'settings.ai.activeProvider', type: 'select', defaultVal: CENTRAL_DEFAULTS.ai.activeProvider },
      { id: 'setting-ai-baseurl', section: 'ai', key: 'baseUrl', type: 'baseUrl', defaultVal: CENTRAL_DEFAULTS.ai.baseUrl },

      // 6. Privacy
      { id: 'privacy-context', section: 'privacy', key: 'settings.privacy.contextAwareness', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.privacy.contextAwareness },
      { id: 'privacy-screenshots', section: 'privacy', key: 'settings.privacy.allowScreenshots', type: 'checkbox', defaultVal: CENTRAL_DEFAULTS.privacy.allowScreenshots },
      { id: 'privacy-blocklist', section: 'privacy', key: 'settings.privacy.blocklist', type: 'blocklist', defaultVal: CENTRAL_DEFAULTS.privacy.blocklist }
    ];

    // Ensure reset buttons exist for all resettable controls
    this.resettableControls.forEach(ctrl => {
      const el = document.getElementById(ctrl.id);
      if (!el) return;

      let btn = document.querySelector(`.btn-ctrl-reset[data-ctrl="${ctrl.id}"]`);
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-ctrl-reset hidden';
        btn.dataset.ctrl = ctrl.id;
        btn.title = 'Reset to default';
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

        if (ctrl.dispId) {
          const disp = document.getElementById(ctrl.dispId);
          if (disp && disp.parentNode) {
            disp.parentNode.insertBefore(btn, disp.nextSibling);
          }
        } else if (el.classList.contains('toggle-checkbox')) {
          el.parentNode.insertBefore(btn, el);
        } else if (ctrl.type === 'accentColor') {
          const target = document.getElementById('btn-accent-default');
          if (target && target.parentNode) {
            target.parentNode.insertBefore(btn, target.nextSibling);
          }
        } else if (ctrl.type === 'bodyColor') {
          const target = document.getElementById('btn-bodycolor-white');
          if (target && target.parentNode) {
            target.parentNode.insertBefore(btn, target.nextSibling);
          }
        } else {
          const label = el.parentNode ? el.parentNode.querySelector('label') : null;
          if (label) {
            label.style.display = 'inline-flex';
            label.style.alignItems = 'center';
            label.appendChild(btn);
          } else if (el.parentNode) {
            el.parentNode.insertBefore(btn, el);
          }
        }
      }

      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.resetControl(ctrl);
      };
    });

    // Wire Section Reset Buttons
    document.querySelectorAll('.btn-reset-section').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const section = btn.dataset.section;
        if (section) this.resetSection(section);
      };
    });

    // Wire Reset All Settings Button
    if (this.btnResetAll) {
      this.btnResetAll.onclick = (e) => {
        e.preventDefault();
        const msg = "Are you sure you want to reset all preferences to default? This will not delete your notes, to-dos, reminders, chat history, or API keys.";
        if (window.confirm(msg)) {
          this.resetAllSettings();
        }
      };
    }

    // Dynamic visibility updater
    const pane = document.getElementById('pane-settings');
    if (pane) {
      pane.addEventListener('input', () => this.updateAllResetButtons());
      pane.addEventListener('change', () => this.updateAllResetButtons());
    }

    this.updateAllResetButtons();
  }

  resetControl(ctrl) {
    const el = document.getElementById(ctrl.id);
    if (!el) return;
    const store = window.panelController ? window.panelController.store : null;

    if (ctrl.type === 'text') {
      el.value = ctrl.defaultVal;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (store && ctrl.key) store.set(ctrl.key, ctrl.defaultVal);
    } else if (ctrl.type === 'checkbox') {
      el.checked = !!ctrl.defaultVal;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (ctrl.prop) {
        this.appearance[ctrl.prop] = !!ctrl.defaultVal;
        this.broadcastAppearance();
      }
      if (store && ctrl.key) store.set(ctrl.key, !!ctrl.defaultVal);
    } else if (ctrl.type === 'slider') {
      el.value = ctrl.defaultVal;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (ctrl.prop) {
        this.appearance[ctrl.prop] = ctrl.defaultVal;
        this.broadcastAppearance();
      }
      if (store && ctrl.key) store.set(ctrl.key, ctrl.defaultVal);
      if (ctrl.dispId) {
        const disp = document.getElementById(ctrl.dispId);
        if (disp) disp.textContent = ctrl.isFloat && ctrl.suffix === '%' ? `${Math.round(ctrl.defaultVal * 100)}%` : `${ctrl.defaultVal}${ctrl.suffix || ''}`;
      }
    } else if (ctrl.type === 'accentColor') {
      this.setAccentColor(ctrl.defaultVal, true);
    } else if (ctrl.type === 'bodyColor') {
      this.appearance.bodyColor = ctrl.defaultVal;
      if (this.bodyColorInput) this.bodyColorInput.value = ctrl.defaultVal;
      if (this.dispBodyColor) this.dispBodyColor.value = ctrl.defaultVal.toUpperCase();
      this.broadcastAppearance();
    } else if (ctrl.type === 'select') {
      el.value = ctrl.defaultVal;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (store && ctrl.key) store.set(ctrl.key, ctrl.defaultVal);
    } else if (ctrl.type === 'baseUrl') {
      const providerId = this.providerSelect ? this.providerSelect.value : 'gemini';
      el.value = '';
      if (store) store.set(`settings.ai.baseUrls.${providerId}`, '');
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (ctrl.type === 'blocklist') {
      const defaultStr = '1password, bitwarden, lastpass, keychain, bank, chase, wellsfargo, paypal, login, signin, incognito, private browsing';
      el.value = defaultStr;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (store && ctrl.key) {
        store.set(ctrl.key, defaultStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
      }
    }

    if (window.soundEffects) window.soundEffects.playTap();
    this.updateAllResetButtons();
  }

  updateAllResetButtons() {
    if (!this.resettableControls) return;
    this.resettableControls.forEach(ctrl => {
      const el = document.getElementById(ctrl.id);
      const btn = document.querySelector(`.btn-ctrl-reset[data-ctrl="${ctrl.id}"]`);
      if (!el || !btn) return;

      let isDiff = false;
      if (ctrl.type === 'text') {
        isDiff = (el.value.trim() !== String(ctrl.defaultVal).trim());
      } else if (ctrl.type === 'checkbox') {
        isDiff = (el.checked !== !!ctrl.defaultVal);
      } else if (ctrl.type === 'slider') {
        const cur = ctrl.isFloat ? parseFloat(el.value) : parseInt(el.value, 10);
        isDiff = (cur !== ctrl.defaultVal);
      } else if (ctrl.type === 'accentColor') {
        const cur = (this.appearance.primaryColor || el.value || '').toUpperCase();
        isDiff = (cur !== ctrl.defaultVal.toUpperCase());
      } else if (ctrl.type === 'bodyColor') {
        const cur = (this.appearance.bodyColor || el.value || '').toUpperCase();
        isDiff = (cur !== ctrl.defaultVal.toUpperCase());
      } else if (ctrl.type === 'select') {
        isDiff = (el.value !== ctrl.defaultVal);
      } else if (ctrl.type === 'baseUrl') {
        isDiff = (el.value.trim() !== '');
      } else if (ctrl.type === 'blocklist') {
        const defaultStr = '1password, bitwarden, lastpass, keychain, bank, chase, wellsfargo, paypal, login, signin, incognito, private browsing';
        isDiff = (el.value.trim().toLowerCase() !== defaultStr.toLowerCase());
      }

      if (isDiff) {
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
    });
  }

  resetSection(sectionName) {
    if (!this.resettableControls) return;

    if (sectionName === 'appearance') {
      this.appearance = Object.assign({}, DEFAULT_PET_APPEARANCE);
      this.updateAppearanceUI();
      this.broadcastAppearance();
      this.setAccentColor(DEFAULT_ACCENT_COLOR);
    } else {
      this.resettableControls.filter(c => c.section === sectionName).forEach(ctrl => {
        this.resetControl(ctrl);
      });
    }

    if (window.soundEffects) window.soundEffects.playChirp();
    this.updateAllResetButtons();
  }

  resetAllSettings() {
    ['general', 'behavior', 'reactions', 'appearance', 'ai', 'privacy'].forEach(sec => {
      this.resetSection(sec);
    });
    if (window.soundEffects) window.soundEffects.playChirp();
    this.updateAllResetButtons();
  }

  showDataStatus(msg, type = 'info') {
    if (!this.dataStatusMsg) return;
    this.dataStatusMsg.textContent = msg;
    this.dataStatusMsg.style.display = 'block';
    if (type === 'success') {
      this.dataStatusMsg.style.background = 'rgba(16, 185, 129, 0.15)';
      this.dataStatusMsg.style.border = '1px solid rgba(16, 185, 129, 0.35)';
      this.dataStatusMsg.style.color = '#10B981';
    } else if (type === 'error') {
      this.dataStatusMsg.style.background = 'rgba(239, 68, 68, 0.15)';
      this.dataStatusMsg.style.border = '1px solid rgba(239, 68, 68, 0.35)';
      this.dataStatusMsg.style.color = '#EF4444';
    } else {
      this.dataStatusMsg.style.background = 'rgba(56, 189, 248, 0.15)';
      this.dataStatusMsg.style.border = '1px solid rgba(56, 189, 248, 0.35)';
      this.dataStatusMsg.style.color = '#38BDF8';
    }
  }

  hideDataStatus() {
    if (this.dataStatusMsg) {
      this.dataStatusMsg.style.display = 'none';
    }
  }
}

window.SettingsTab = SettingsTab;
