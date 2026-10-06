/**
 * Desktop Pet — Secure Storage Module
 * Uses Electron's safeStorage API (macOS Keychain, Windows DPAPI) for sensitive data (API keys)
 * and persisted JSON for general application preferences.
 */

const fs = require('fs');
const path = require('path');
const electron = require('electron');

function getCanonicalUserDataPath() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Desktop Pet');
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Desktop Pet');
  } else {
    const configDir = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    return path.join(configDir, 'Desktop Pet');
  }
}

class SecureStore {
  constructor() {
    this.userDataPath = getCanonicalUserDataPath();
    try {
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && typeof app.setPath === 'function') {
        try {
          app.setPath('userData', this.userDataPath);
        } catch (e) {}
      }
    } catch (e) {}

    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
    } catch (e) {}

    this.filePath = path.join(this.userDataPath, 'desktop-pet-data.json');
    this.secureKeysPath = path.join(this.userDataPath, 'secure-credentials.json');

    this.defaults = {
      isFirstRun: true,
      window: {
        petX: 200,
        petY: 200,
        panelX: 250,
        panelY: 250
      },
      settings: {
        general: {
          petName: 'Pixie',
          userName: 'Samir',
          launchAtLogin: false,
          alwaysOnTop: true,
          rememberPosition: true,
          showPet: true,
          autoUpdateCheck: true
        },
        behavior: {
          idleSleepyMinutes: 2,
          idleSleepingMinutes: 5,
          soundsEnabled: false,
          soundVolume: 50,
          soundReminders: true,
          soundTimer: true,
          soundReactions: true,
          dnd: false,
          bubbleDuration: 5
        },
        reactions: {
          brightness: true,
          volume: true,
          battery: true,
          media: true,
          highLoad: true,
          network: true,
          lateNight: true,
          welcomeStartup: true,
          goodbyeShutdown: true
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
          glassesEnabled: false,
          glassesShape: 'round',
          glassesColor: '#181820',
          eyesColor: '#181820',
          mouthColor: '#181820',
          panelTransparency: 0.30,
          panelBlur: 24,
          theme: 'default'
        },
        ai: {
          activeProvider: 'gemini',
          models: {
            gemini: 'gemini-2.0-flash-lite',
            groq: 'llama-3.3-70b-versatile',
            openai: 'gpt-4o-mini',
            anthropic: 'claude-3-5-sonnet-20241022',
            qwen: 'qwen-turbo',
            deepseek: 'deepseek-chat',
            openrouter: 'meta-llama/llama-3.3-70b-instruct',
            ollama: 'llama3:latest',
            custom: 'default'
          },
          baseUrls: {
            groq: 'https://api.groq.com/openai/v1',
            openai: 'https://api.openai.com/v1',
            gemini: 'https://generativelanguage.googleapis.com',
            anthropic: 'https://api.anthropic.com/v1',
            ollama: 'http://localhost:11434',
            custom: 'https://api.openai.com/v1'
          }
        },
        privacy: {
          contextAwareness: true,
          allowScreenshots: false,
          blocklist: [
            '1password',
            'bitwarden',
            'lastpass',
            'keychain',
            'bank',
            'chase',
            'wellsfargo',
            'paypal',
            'login',
            'signin',
            'incognito',
            'private browsing'
          ]
        }
      },
      todos: [],
      notes: [],
      reminders: [],
      clipboardHistory: [],
      chatHistory: [
        { role: 'assistant', content: "Hello! I'm your desktop coding companion. Ask me anything, or let me know what you're working on!", timestamp: Date.now() }
      ]
    };

    this.lastLoadedMtime = 0;
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.filePath)) {
        const stats = fs.statSync(this.filePath);
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(fileContent);
        this.lastLoadedMtime = stats.mtimeMs;
        return this.deepMerge(this.defaults, parsed);
      }
    } catch (err) {
      console.warn('Failed to load store, using defaults:', err);
    }
    return JSON.parse(JSON.stringify(this.defaults));
  }

  reloadIfChanged() {
    try {
      if (fs.existsSync(this.filePath)) {
        const stats = fs.statSync(this.filePath);
        if (!this.lastLoadedMtime || stats.mtimeMs > this.lastLoadedMtime) {
          const fileContent = fs.readFileSync(this.filePath, 'utf8');
          const parsed = JSON.parse(fileContent);
          this.data = this.deepMerge(this.defaults, parsed);
          this.lastLoadedMtime = stats.mtimeMs;
        }
      }
    } catch (e) {}
  }

  saveData() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
      try {
        const stats = fs.statSync(this.filePath);
        this.lastLoadedMtime = stats.mtimeMs;
      } catch (e) {}
    } catch (err) {
      console.error('Failed to save store:', err);
    }
  }

  get(keyPath) {
    this.reloadIfChanged();
    const keys = keyPath.split('.');
    let current = this.data;
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  }

  set(keyPath, value) {
    this.reloadIfChanged();
    const keys = keyPath.split('.');
    let current = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    current[keys[keys.length - 1]] = value;
    this.saveData();
  }

  // Secure API Key Storage using safeStorage
  getApiKey(provider) {
    try {
      if (fs.existsSync(this.secureKeysPath)) {
        const creds = JSON.parse(fs.readFileSync(this.secureKeysPath, 'utf8'));
        const encryptedBase64 = creds[provider];
        if (encryptedBase64) {
          const { safeStorage } = electron;
          if (safeStorage && safeStorage.isEncryptionAvailable()) {
            const buffer = Buffer.from(encryptedBase64, 'base64');
            const decrypted = safeStorage.decryptString(buffer);
            if (decrypted) return decrypted;
          } else {
            const decoded = Buffer.from(encryptedBase64, 'base64').toString('utf8');
            if (decoded) return decoded;
          }
        }
      }
    } catch (e) {
      console.warn(`[SecureStore] Failed to decrypt key for ${provider}:`, e.message);
    }
    // Fallback to store settings
    return this.get(`settings.ai.apiKeys.${provider}`) || this.get(`settings.ai.keys.${provider}`) || '';
  }

  setApiKey(provider, plainKey) {
    try {
      let creds = {};
      if (fs.existsSync(this.secureKeysPath)) {
        try {
          creds = JSON.parse(fs.readFileSync(this.secureKeysPath, 'utf8'));
        } catch (e) {}
      }

      if (!plainKey) {
        delete creds[provider];
        this.set(`settings.ai.apiKeys.${provider}`, '');
        this.set(`settings.ai.keys.${provider}`, '');
      } else {
        const { safeStorage } = electron;
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          const encBuffer = safeStorage.encryptString(plainKey);
          creds[provider] = encBuffer.toString('base64');
        } else {
          // Fallback simple base64 encode
          creds[provider] = Buffer.from(plainKey, 'utf8').toString('base64');
        }
        this.set(`settings.ai.apiKeys.${provider}`, plainKey);
        this.set(`settings.ai.keys.${provider}`, plainKey);
      }

      fs.writeFileSync(this.secureKeysPath, JSON.stringify(creds, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error(`[SecureStore] Failed to encrypt key for ${provider}:`, e);
      if (plainKey) {
        this.set(`settings.ai.apiKeys.${provider}`, plainKey);
        this.set(`settings.ai.keys.${provider}`, plainKey);
      }
      return false;
    }
  }

  hasApiKey(provider) {
    const key = this.getApiKey(provider);
    return Boolean(key && key.trim().length > 0);
  }

  deepMerge(target, source) {
    const output = Object.assign({}, target);
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }
}

module.exports = new SecureStore();
