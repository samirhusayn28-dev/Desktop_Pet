/**
 * Desktop Pet — Welcome Screen Logic (Item W1 + G1)
 * Live preview on the real pet, safeStorage for keys, zero fake data.
 */

const { ipcRenderer, shell } = require('electron');

class WelcomeController {
  constructor() {
    this.appearance = {
      scale: 1.0,
      width: 136,
      height: 120,
      roundness: 36,
      depth: 80,
      eyeSize: 1.0,
      eyeSpacing: 44,
      mouthWidth: 14,
      bodyColor: '#FFFFFF',
      accentColor: '#FF7A2F',
      glassesEnabled: false
    };

    this.providerDefaults = {
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

    this.init();
  }

  async init() {
    this.bindElements();
    this.setupEvents();
    await this.loadInitialValues();
  }

  bindElements() {
    this.linkGithub = document.getElementById('link-github');
    this.inputUserName = document.getElementById('input-user-name');
    this.inputPetName = document.getElementById('input-pet-name');
    this.toggleGlasses = document.getElementById('toggle-glasses');

    // Appearance Sliders
    this.inputScale = document.getElementById('input-scale');
    this.valScale = document.getElementById('val-scale');
    this.inputWidth = document.getElementById('input-width');
    this.valWidth = document.getElementById('val-width');
    this.inputHeight = document.getElementById('input-height');
    this.valHeight = document.getElementById('val-height');
    this.inputRoundness = document.getElementById('input-roundness');
    this.valRoundness = document.getElementById('val-roundness');
    this.inputDepth = document.getElementById('input-depth');
    this.valDepth = document.getElementById('val-depth');
    this.inputEyeSize = document.getElementById('input-eyesize');
    this.valEyeSize = document.getElementById('val-eyesize');
    this.inputEyeSpacing = document.getElementById('input-eyespacing');
    this.valEyeSpacing = document.getElementById('val-eyespacing');
    this.inputMouthWidth = document.getElementById('input-mouthwidth');
    this.valMouthWidth = document.getElementById('val-mouthwidth');

    // Colors
    this.inputBodyColor = document.getElementById('input-body-color');
    this.dispBodyColor = document.getElementById('disp-body-color');
    this.btnBodyWhite = document.getElementById('btn-body-white');
    this.inputAccentColor = document.getElementById('input-accent-color');
    this.dispAccentColor = document.getElementById('disp-accent-color');
    this.accentDots = document.querySelectorAll('.accent-dot');

    // AI
    this.selectProvider = document.getElementById('select-ai-provider');
    this.inputApiKey = document.getElementById('input-api-key');
    this.btnToggleKey = document.getElementById('btn-toggle-key');
    this.selectModel = document.getElementById('select-ai-model');
    this.btnTestConn = document.getElementById('btn-test-conn');
    this.testResultBadge = document.getElementById('test-result-badge');

    // Action Buttons
    this.btnSaveStart = document.getElementById('btn-save-start');
    this.btnSkip = document.getElementById('btn-skip');
  }

  async loadInitialValues() {
    try {
      const initData = await ipcRenderer.invoke('welcome:get-init-data');
      if (initData) {
        if (initData.userName) this.inputUserName.value = initData.userName;
        if (initData.petName) this.inputPetName.value = initData.petName;
        if (initData.appearance) {
          Object.assign(this.appearance, initData.appearance);
          this.applyAppearanceToInputs();
        }
        if (initData.glassesEnabled !== undefined) {
          this.appearance.glassesEnabled = !!initData.glassesEnabled;
          this.toggleGlasses.checked = this.appearance.glassesEnabled;
        }
        if (initData.aiProvider) {
          this.selectProvider.value = initData.aiProvider;
          this.updateModelsForProvider(initData.aiProvider, initData.aiModel);
        }
      }
    } catch (e) {
      this.updateModelsForProvider('gemini');
    }
  }

  applyAppearanceToInputs() {
    if (this.inputScale) {
      this.inputScale.value = this.appearance.scale;
      this.valScale.textContent = `${Math.round(this.appearance.scale * 100)}%`;
    }
    if (this.inputWidth) {
      this.inputWidth.value = this.appearance.width;
      this.valWidth.textContent = this.appearance.width;
    }
    if (this.inputHeight) {
      this.inputHeight.value = this.appearance.height;
      this.valHeight.textContent = this.appearance.height;
    }
    if (this.inputRoundness) {
      this.inputRoundness.value = this.appearance.roundness;
      this.valRoundness.textContent = `${this.appearance.roundness}%`;
    }
    if (this.inputDepth) {
      this.inputDepth.value = this.appearance.depth;
      this.valDepth.textContent = `${this.appearance.depth}%`;
    }
    if (this.inputEyeSize) {
      this.inputEyeSize.value = this.appearance.eyeSize;
      this.valEyeSize.textContent = `${Number(this.appearance.eyeSize).toFixed(1)}x`;
    }
    if (this.inputEyeSpacing) {
      this.inputEyeSpacing.value = this.appearance.eyeSpacing;
      this.valEyeSpacing.textContent = this.appearance.eyeSpacing;
    }
    if (this.inputMouthWidth) {
      this.inputMouthWidth.value = this.appearance.mouthWidth;
      this.valMouthWidth.textContent = this.appearance.mouthWidth;
    }
    if (this.inputBodyColor) {
      this.inputBodyColor.value = this.appearance.bodyColor;
      this.dispBodyColor.value = this.appearance.bodyColor.toUpperCase();
    }
    if (this.inputAccentColor) {
      this.inputAccentColor.value = this.appearance.accentColor;
      this.dispAccentColor.value = this.appearance.accentColor.toUpperCase();
    }
  }

  setupEvents() {
    // 1. Samir Husayn GitHub link
    this.linkGithub?.addEventListener('click', (e) => {
      e.preventDefault();
      shell.openExternal('https://github.com/samirhusayn28-dev');
    });

    // 2. Glasses toggle live preview (G1)
    this.toggleGlasses?.addEventListener('change', () => {
      this.appearance.glassesEnabled = this.toggleGlasses.checked;
      ipcRenderer.send('pet:update-glasses', this.appearance.glassesEnabled);
    });

    // 3. Sliders live preview
    const bindSlider = (inputEl, valEl, key, isPercent = false, suffix = '') => {
      inputEl?.addEventListener('input', () => {
        const val = parseFloat(inputEl.value);
        this.appearance[key] = val;
        if (valEl) valEl.textContent = isPercent ? `${Math.round(val * (key === 'scale' ? 100 : 1))}%` : `${val}${suffix}`;
        this.broadcastAppearance();
      });
    };

    bindSlider(this.inputScale, this.valScale, 'scale', true);
    bindSlider(this.inputWidth, this.valWidth, 'width');
    bindSlider(this.inputHeight, this.valHeight, 'height');
    bindSlider(this.inputRoundness, this.valRoundness, 'roundness', true);
    bindSlider(this.inputDepth, this.valDepth, 'depth', true);
    bindSlider(this.inputEyeSize, this.valEyeSize, 'eyeSize', false, 'x');
    bindSlider(this.inputEyeSpacing, this.valEyeSpacing, 'eyeSpacing');
    bindSlider(this.inputMouthWidth, this.valMouthWidth, 'mouthWidth');

    // 4. Color Pickers live preview
    this.inputBodyColor?.addEventListener('input', () => {
      this.appearance.bodyColor = this.inputBodyColor.value;
      this.dispBodyColor.value = this.inputBodyColor.value.toUpperCase();
      this.broadcastAppearance();
    });

    this.btnBodyWhite?.addEventListener('click', () => {
      this.appearance.bodyColor = '#FFFFFF';
      this.inputBodyColor.value = '#FFFFFF';
      this.dispBodyColor.value = '#FFFFFF';
      this.broadcastAppearance();
    });

    this.inputAccentColor?.addEventListener('input', () => {
      const col = this.inputAccentColor.value;
      this.appearance.accentColor = col;
      this.dispAccentColor.value = col.toUpperCase();
      this.broadcastAccent(col);
    });

    this.accentDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const col = dot.getAttribute('data-color');
        this.accentDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        this.appearance.accentColor = col;
        this.inputAccentColor.value = col;
        this.dispAccentColor.value = col.toUpperCase();
        this.broadcastAccent(col);
      });
    });

    // 5. Password Show / Hide
    this.btnToggleKey?.addEventListener('click', () => {
      const isPass = this.inputApiKey.type === 'password';
      this.inputApiKey.type = isPass ? 'text' : 'password';
    });

    // 6. Provider selection
    this.selectProvider?.addEventListener('change', () => {
      const prov = this.selectProvider.value;
      this.updateModelsForProvider(prov);
      this.fetchModelsIfKeyPresent();
    });

    this.inputApiKey?.addEventListener('blur', () => {
      this.fetchModelsIfKeyPresent();
    });

    // 7. Test connection
    this.btnTestConn?.addEventListener('click', () => this.testConnection());

    // 8. Save & Start
    this.btnSaveStart?.addEventListener('click', () => this.finish(true));

    // 9. Skip
    this.btnSkip?.addEventListener('click', () => this.finish(false));
  }

  broadcastAppearance() {
    ipcRenderer.send('pet:update-appearance', this.appearance);
  }

  broadcastAccent(col) {
    document.documentElement.style.setProperty('--accent', col);
    ipcRenderer.send('pet:update-accent', col);
  }

  updateModelsForProvider(provider, selectedModel = null) {
    const defaultModel = selectedModel || this.providerDefaults[provider] || 'default';
    this.selectModel.innerHTML = `<option value="${defaultModel}">${defaultModel}</option>`;
  }

  async fetchModelsIfKeyPresent() {
    const provider = this.selectProvider.value;
    const apiKey = this.inputApiKey.value.trim();
    if (!apiKey) return;

    try {
      const res = await ipcRenderer.invoke('ai:fetch-models', { provider, apiKey });
      if (res && res.success && Array.isArray(res.models) && res.models.length > 0) {
        this.selectModel.innerHTML = '';
        res.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          if (m === this.providerDefaults[provider]) opt.selected = true;
          this.selectModel.appendChild(opt);
        });
      }
    } catch (e) {}
  }

  async testConnection() {
    const provider = this.selectProvider.value;
    const apiKey = this.inputApiKey.value.trim();
    const model = this.selectModel.value;

    this.testResultBadge.className = 'test-badge';
    this.testResultBadge.textContent = 'Testing...';
    this.testResultBadge.classList.remove('hidden');

    try {
      const res = await ipcRenderer.invoke('ai:test-connection', { provider, apiKey, model });
      if (res && res.success) {
        this.testResultBadge.className = 'test-badge pass';
        this.testResultBadge.textContent = '200 OK — Connected!';
      } else {
        this.testResultBadge.className = 'test-badge fail';
        this.testResultBadge.textContent = res?.error || 'Connection Failed';
      }
    } catch (err) {
      this.testResultBadge.className = 'test-badge fail';
      this.testResultBadge.textContent = err?.message || 'Error';
    }
  }

  finish(save) {
    if (!save) {
      ipcRenderer.send('welcome:finish', { save: false });
      return;
    }

    const userName = (this.inputUserName?.value || '').trim();
    const petName = (this.inputPetName?.value || 'Bolt').trim();
    const glassesEnabled = !!this.toggleGlasses?.checked;
    const aiProvider = this.selectProvider?.value || 'gemini';
    const aiModel = this.selectModel?.value || this.providerDefaults[aiProvider];
    const apiKey = (this.inputApiKey?.value || '').trim();

    ipcRenderer.send('welcome:finish', {
      save: true,
      userName,
      petName,
      glassesEnabled,
      appearance: this.appearance,
      accentColor: this.appearance.accentColor,
      aiProvider,
      aiModel,
      apiKey
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new WelcomeController();
});
