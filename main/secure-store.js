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
      themeMigrationVersion: 2,
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
          idleSleepyMinutes: 6,
          idleSleepingMinutes: 8,
          soundsEnabled: true,
          soundVolume: 60,
          soundReminders: true,
          soundTimer: true,
          soundReactions: true,
          dnd: false,
          bubbleDuration: 5
        },
        reactions: {
          welcomeStartup: true,
          goodbyeShutdown: true
        },
        companion: {
          dailyCheckin: true,
          clipboardBuddy: true,
          breakReminders: true,
          wellnessNudges: true,
          breathingEnabled: true
        },
        appearance: {
          scale: 1.0,
          width: 150,
          height: 150,
          roundness: 50,
          eyeSize: 1.0,
          eyeSpacing: 28,
          mouthWidth: 10,
          depth: 75,
          bodyColor: '#17171B',
          accentColor: '#007AFF',
          eyesColor: '#FF8A1F',
          mouthColor: '#111111',
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
          allowClipboard: true,
          clipboardWatch: true,
          allowScreenshots: false,
          neverSend: '',
          redactSecrets: true,
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
      chatHistory: []
    };

    this.lastLoadedMtime = 0;
    this.data = this.loadData();
  }

  normalizeThemeData(data = this.data, force = false) {
    const target = data || this.data;
    if (!target || !target.settings) return;
    const current = String(target.settings?.appearance?.accentColor || '').toLowerCase();
    const legacyAccents = ['#e8a84a', '#ff7a1a', '#ff7a2f'];
    const version = Number(target.themeMigrationVersion || 0);
    if (force || version < 2) {
      if (legacyAccents.includes(current) && target.settings.appearance) {
        target.settings.appearance.accentColor = '#007AFF';
      }
      target.themeMigrationVersion = 2;
      if (target === this.data) this.saveData();
    }
  }

  loadData() {
    try {
      if (fs.existsSync(this.filePath)) {
        const stats = fs.statSync(this.filePath);
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(fileContent);
        this.lastLoadedMtime = stats.mtimeMs;
        const data = this.deepMerge(this.defaults, parsed);
        this.normalizeThemeData(data, false);
        return data;
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

  // Whole-store snapshot support for full backup/restore.
  getAllData() {
    this.reloadIfChanged();
    return JSON.parse(JSON.stringify(this.data));
  }

  replaceAllData(data) {
    const incoming = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
    const next = this.deepMerge(this.defaults, JSON.parse(JSON.stringify(incoming)));
    this.normalizeThemeData(next, true);
    this.data = next;
    this.saveData();
    return this.getAllData();
  }

  getProviderNames() {
    const models = this.get('settings.ai.models') || {};
    return Object.keys(models || {});
  }

  getAllProviderNames() {
    const providers = new Set(this.getProviderNames());
    try {
      if (fs.existsSync(this.secureKeysPath)) {
        Object.keys(JSON.parse(fs.readFileSync(this.secureKeysPath, 'utf8')) || {})
          .forEach((provider) => providers.add(provider));
      }
    } catch (e) {}
    for (const path of ['settings.ai.apiKeys', 'settings.ai.keys']) {
      const stored = this.get(path) || {};
      Object.keys(stored || {}).forEach((provider) => providers.add(provider));
    }
    return Array.from(providers).filter(Boolean);
  }

  getAllApiKeys() {
    const keys = {};
    for (const provider of this.getAllProviderNames()) {
      const value = this.getApiKey(provider);
      if (value) keys[provider] = value;
    }
    return keys;
  }

  // Secure API Key Storage using safeStorage
  getApiKey(provider) {
    // A plaintext fallback is written beside every stored key. Prefer it so a
    // locked or unavailable OS keychain never blocks ordinary reads (including
    // safety-backup creation during import).
    const plain = this.get(`settings.ai.apiKeys.${provider}`) || this.get(`settings.ai.keys.${provider}`);
    if (typeof plain === 'string' && plain) return plain;

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
    return '';
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

  /**
   * Full-backup restore path: clear every previously encrypted credential
   * without touching the OS keychain, then write the restored plain values.
   * Only providers with a real key are encrypted later by the caller, so a
   * locked keychain can never hang an import that has no keys to restore.
   */
  restoreApiKeys(apiKeys = {}) {
    const keys = (apiKeys && typeof apiKeys === 'object' && !Array.isArray(apiKeys)) ? apiKeys : {};
    try {
      fs.mkdirSync(path.dirname(this.secureKeysPath), { recursive: true });
      fs.writeFileSync(this.secureKeysPath, '{}', 'utf8');
    } catch (e) {
      console.warn('[SecureStore] Failed to clear stored credentials:', e.message);
    }

    const providers = new Set([...this.getAllProviderNames(), ...Object.keys(keys)]);
    for (const provider of providers) {
      const key = typeof keys[provider] === 'string' ? keys[provider] : String(keys[provider] || '');
      this.set(`settings.ai.apiKeys.${provider}`, key);
      this.set(`settings.ai.keys.${provider}`, key);
    }
    return true;
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
