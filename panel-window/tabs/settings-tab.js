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
  theme: 'default'
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
    this.reactionScreenUnlock = document.getElementById('reaction-screenunlock');
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

    // First-Run Modal
    this.firstRunModal = document.getElementById('first-run-modal');
    this.firstRunPetAvatar = document.getElementById('first-run-pet-avatar');
    this.btnStartCompanion = document.getElementById('btn-start-companion');
    this.onboardingPetName = document.getElementById('onboarding-pet-name');
    this.onboardingProvider = document.getElementById('onboarding-provider');
    this.onboardingApiKey = document.getElementById('onboarding-api-key');

    this.init();
  }

  init() {
    this.loadSettings();
    this.setupEvents();
    this.updateAppearanceUI();
    this.renderLivePreview();
    this.checkFirstRun();
  }

  loadSettings() {
    if (!window.panelController) return;
    const store = window.panelController.store;

    // 1. General
    const petName = store.get('settings.general.petName') || 'Bolt';
    if (this.petNameInput) this.petNameInput.value = petName;
    const userName = store.get('settings.general.userName') || '';
    if (this.userNameInput) this.userNameInput.value = userName;
    if (this.alwaysOnTopToggle) this.alwaysOnTopToggle.checked = store.get('settings.general.alwaysOnTop') !== false;
    if (this.rememberPosToggle) this.rememberPosToggle.checked = store.get('settings.general.rememberPosition') !== false;
    if (this.launchLoginToggle) this.launchLoginToggle.checked = store.get('settings.general.launchAtLogin') === true;

    // 2. Behavior
    const idleSleepy = store.get('settings.behavior.idleSleepyMinutes') ?? 2;
    const idleSleeping = store.get('settings.behavior.idleSleepingMinutes') ?? 5;
    const bubbleDuration = store.get('settings.behavior.bubbleDuration') ?? 5;
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
    if (this.reactionScreenUnlock) this.reactionScreenUnlock.checked = store.get('settings.reactions.screenUnlock') !== false;
    if (this.reactionHighload) this.reactionHighload.checked = store.get('settings.reactions.highLoad') !== false;
    if (this.reactionLatenight) this.reactionLatenight.checked = store.get('settings.reactions.lateNight') !== false;

    // Diagnostics & Resource Budget
    this.renderSensorStatus();
    this.refreshPermissions();
    this.updateLiveAppMetrics();

    // 4. Appearance
    const savedApp = store.get('settings.appearance') || {};
    this.appearance = Object.assign({}, DEFAULT_PET_APPEARANCE, savedApp);

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
      { el: this.reactionScreenUnlock, key: 'screenUnlock' },
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

    // First-Run Onboarding Modal Button
    if (this.btnStartCompanion) {
      this.btnStartCompanion.addEventListener('click', async () => {
        const name = this.onboardingPetName ? (this.onboardingPetName.value.trim() || 'Bolt') : 'Bolt';
        const provider = this.onboardingProvider ? this.onboardingProvider.value : 'gemini';
        const key = this.onboardingApiKey ? this.onboardingApiKey.value.trim() : '';

        const store = window.panelController.store;
        store.set('settings.general.petName', name);
        store.set('settings.ai.activeProvider', provider);
        store.set('onboarding.completed', true);

        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('pet:update-name', name);
          if (key) {
            await window.panelController.ipcRenderer.invoke('ai:save-key', { provider, key });
          }
        }

        window.panelController.applyPetName(name);
        if (this.petNameInput) this.petNameInput.value = name;
        if (this.providerSelect) this.providerSelect.value = provider;
        this.updateHeaderBadge(provider);

        if (this.firstRunModal) {
          this.firstRunModal.classList.add('hidden');
        }

        // Welcome greeting from pet
        if (window.panelController.ipcRenderer) {
          window.panelController.ipcRenderer.send('pet:set-state', { state: 'happy', duration: 4000 });
          window.panelController.ipcRenderer.send('pet:show-bubble', {
            badge: 'HELLO',
            text: `Hi! I'm ${name}, your desktop pair programming companion! Ready to code!`,
            duration: 6000,
            sound: 'chirp',
            emotion: 'happy'
          });
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
}

window.SettingsTab = SettingsTab;
