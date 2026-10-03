const fs = require('fs');
const path = require('path');
const electron = require('electron');

class Store {
  constructor() {
    try {
      const app = electron.app || (electron.remote && electron.remote.app);
      if (app && typeof app.getPath === 'function') {
        this.userDataPath = app.getPath('userData');
      }
    } catch (e) {}

    if (!this.userDataPath) {
      const home = process.env.HOME || process.env.USERPROFILE || '.';
      this.userDataPath = path.join(home, 'Library', 'Application Support', 'desktop-pet');
    }

    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
    } catch (e) {}

    this.filePath = path.join(this.userDataPath, 'desktop-pet-data.json');
    this.defaults = {
      window: {
        petX: 200,
        petY: 200,
        panelX: 250,
        panelY: 250
      },
      settings: {
        general: {
          petName: 'Pet',
          launchAtLogin: false,
          alwaysOnTop: true,
          rememberPosition: true,
          showPet: true
        },
        behavior: {
          animationFrequency: 'normal', // 'calm' | 'normal' | 'hyper'
          wandering: true,
          sounds: true
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
          panelTransparency: 0.50,
          panelBlur: 32,
          theme: 'default'
        },
        ai: {
          activeProvider: 'anthropic', // default provider
          apiKeys: {},
          models: {
            anthropic: 'claude-3-5-sonnet-20241022',
            openai: 'gpt-4o',
            gemini: 'gemini-1.5-pro',
            qwen: 'qwen-turbo',
            deepseek: 'deepseek-chat',
            groq: 'llama-3.3-70b-versatile',
            openrouter: 'anthropic/claude-3.5-sonnet',
            ollama: 'llama3:latest',
            custom: 'default'
          },
          baseUrls: {
            ollama: 'http://localhost:11434',
            custom: 'https://api.openai.com/v1'
          }
        }
      },
      todos: [
        { id: '1', text: 'Read docs', done: true },
        { id: '2', text: 'Write code', done: true },
        { id: '3', text: 'Test and debug', done: false },
        { id: '4', text: 'Build application', done: false },
        { id: '5', text: 'Take a break', done: false }
      ],
      notes: [
        { id: '1', title: 'Ideas', content: 'Explore vector embeddings and local LLMs with Ollama.\nAdd cute keyboard animations!', pinned: true, updatedAt: new Date().toISOString() },
        { id: '2', title: 'Desktop Pet Shortcut', content: 'Click pet to toggle main assistant.\nRight click for fast menu.', pinned: false, updatedAt: new Date().toISOString() }
      ],
      reminders: [
        { id: '1', title: 'Drink water', time: '15:00', repeat: 'every-hour', enabled: true },
        { id: '2', title: 'Stand up & stretch', time: '16:00', repeat: 'daily', enabled: true }
      ],
      chatHistory: [
        { role: 'assistant', content: "Hey! What are we working on today?\nI'm your little coding companion — ask me anything, manage your tasks, or focus with Pomodoro!", timestamp: Date.now() }
      ]
    };

    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(fileContent);
        return this.deepMerge(this.defaults, parsed);
      }
    } catch (err) {
      console.warn('Failed to load store, using defaults:', err);
    }
    return JSON.parse(JSON.stringify(this.defaults));
  }

  saveData() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save store:', err);
    }
  }

  get(keyPath) {
    const keys = keyPath.split('.');
    let current = this.data;
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }
    return current;
  }

  set(keyPath, value) {
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

module.exports = new Store();
