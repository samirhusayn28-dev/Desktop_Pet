/**
 * Desktop Pet — Unified Sound Manager (Item SND1)
 *
 * Requirements:
 * - Master setting `soundsEnabled` (default false).
 * - When sounds are OFF: ZERO audio element, ZERO AudioContext, no files loaded, no external process spawned.
 * - Switching sounds OFF stops anything playing immediately.
 * - When ON: plays through pet window's renderer, lazy Audio element creation on first use,
 *   bundled files under 50 KB, autoplayPolicy 'no-user-gesture-required',
 *   respects volume (0-100) and sub-toggles (reminders, timer, reactions),
 *   mutes while Do Not Disturb is active, releases audio resources shortly after playback.
 * - Same code path on macOS and Windows (no afplay, no PowerShell).
 */

(function() {
const { ipcRenderer } = typeof require !== 'undefined' ? require('electron') : { ipcRenderer: null };
const storeModule = typeof require !== 'undefined' ? (function() {
  try { return require('../main/store'); } catch(e) { return null; }
})() : null;

class SoundManager {
  constructor() {
    this.currentAudio = null;
    this.cleanupTimer = null;
    this.isPetWindow = typeof window !== 'undefined' && window.location.href.includes('pet.html');

    // Cached settings (updated via store or IPC)
    this.settings = {
      soundsEnabled: false,
      soundVolume: 50,
      soundReminders: true,
      soundTimer: true,
      soundReactions: true,
      dnd: false
    };

    this.init();
  }

  init() {
    this.loadSettings();

    if (ipcRenderer) {
      ipcRenderer.on('pet:update-sound-settings', (event, newSettings) => {
        this.updateSettings(newSettings);
      });

      ipcRenderer.on('pet:stop-sound', () => {
        this.stopAll();
      });

      if (this.isPetWindow) {
        ipcRenderer.on('pet:play-sound', (event, { sound, category }) => {
          this.play(sound, category);
        });
      }
    }
  }

  loadSettings() {
    try {
      if (ipcRenderer) {
        const remote = ipcRenderer.sendSync('pet:get-sound-settings');
        if (remote) {
          Object.assign(this.settings, remote);
        }
      } else if (storeModule) {
        this.settings.soundsEnabled = storeModule.get('settings.behavior.soundsEnabled') === true;
        this.settings.soundVolume = storeModule.get('settings.behavior.soundVolume') ?? 50;
        this.settings.soundReminders = storeModule.get('settings.behavior.soundReminders') !== false;
        this.settings.soundTimer = storeModule.get('settings.behavior.soundTimer') !== false;
        this.settings.soundReactions = storeModule.get('settings.behavior.soundReactions') !== false;
        this.settings.dnd = storeModule.get('settings.behavior.dnd') === true;
      }
    } catch (e) {}
  }

  updateSettings(newSettings) {
    if (!newSettings || typeof newSettings !== 'object') return;
    const wasEnabled = this.settings.soundsEnabled;
    Object.assign(this.settings, newSettings);

    // If sounds was switched OFF, stop anything playing immediately!
    if (wasEnabled && !this.settings.soundsEnabled) {
      this.stopAll();
    }
  }

  setEnabled(val) {
    const boolVal = !!val;
    this.settings.soundsEnabled = boolVal;
    if (storeModule) {
      storeModule.set('settings.behavior.soundsEnabled', boolVal);
    }
    if (!boolVal) {
      this.stopAll();
    }
    if (ipcRenderer) {
      ipcRenderer.send('settings:sound-changed', { soundsEnabled: boolVal });
    }
  }

  stopAll() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
        if (typeof this.currentAudio.remove === 'function') {
          this.currentAudio.remove();
        }
      } catch (e) {}
      this.currentAudio = null;
    }
    if (typeof window !== 'undefined' && window.__soundTestHooks) {
      window.__soundTestHooks.activeAudioObjects = 0;
    }
  }

  /**
   * Main play method
   * @param {string} soundName - 'chirp', 'happy', 'alarm', 'tap'
   * @param {string} category - 'reminders', 'timer', 'reactions', 'test'
   */
  play(soundName, category = 'reactions') {
    // 1. If not running in pet window, delegate to pet window renderer
    if (!this.isPetWindow) {
      if (ipcRenderer) {
        ipcRenderer.send('pet:play-sound-request', { sound: soundName, category });
      }
      return false;
    }

    // Always ensure latest settings before evaluating
    this.loadSettings();

    // 2. Strict Check: If sounds are OFF, DO NOTHING!
    // No audio element or AudioContext is created, no audio file is loaded, no external process spawned.
    // (Test sound button in settings passes category: 'test' which tests audio when pressed)
    if (!this.settings.soundsEnabled && category !== 'test') {
      return false;
    }

    // 3. Do Not Disturb check: mute while DND is active (except explicit test button)
    if (this.settings.dnd && category !== 'test') {
      return false;
    }

    // 4. Sub-toggles check
    if (category === 'reminders' && !this.settings.soundReminders) return false;
    if (category === 'timer' && !this.settings.soundTimer) return false;
    if (category === 'reactions' && !this.settings.soundReactions) return false;

    // 5. Volume check
    const volNum = Number(this.settings.soundVolume);
    const volume = (isNaN(volNum) ? 50 : Math.max(0, Math.min(100, volNum))) / 100;
    if (volume <= 0) return false;

    // 6. Stop any currently playing audio before starting new one
    this.stopAll();

    // 7. Resolve small bundled audio file (<50 KB)
    const validSounds = ['alarm', 'chirp', 'happy', 'tap'];
    const sName = validSounds.includes(soundName) ? soundName : 'chirp';
    const soundUrl = new URL(`../audio/${sName}.wav`, window.location.href).href;

    try {
      // Lazily create Audio element on first use
      const audio = new Audio(soundUrl);
      audio.volume = volume;
      this.currentAudio = audio;

      if (window.__soundTestHooks) {
        window.__soundTestHooks.activeAudioObjects++;
        window.__soundTestHooks.playCount++;
        window.__soundTestHooks.lastPlayed = { sound: sName, category, volume };
        window.__soundTestHooks.history.push({ sound: sName, category, volume, time: Date.now() });
      }

      const cleanup = () => {
        if (this.cleanupTimer) {
          clearTimeout(this.cleanupTimer);
          this.cleanupTimer = null;
        }
        audio.onended = null;
        audio.onerror = null;
        try {
          audio.pause();
          audio.src = '';
          if (typeof audio.remove === 'function') audio.remove();
        } catch (e) {}
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
        if (window.__soundTestHooks && window.__soundTestHooks.activeAudioObjects > 0) {
          window.__soundTestHooks.activeAudioObjects--;
        }
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;

      // Release audio resources shortly after playback (max 4s safety cleanup)
      this.cleanupTimer = setTimeout(cleanup, 4000);

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          cleanup();
        });
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  playChirp(category = 'reactions') {
    return this.play('chirp', category);
  }

  playHappy(category = 'reactions') {
    return this.play('happy', category);
  }

  playAlarm(category = 'reminders') {
    return this.play('alarm', category);
  }

  playTap(category = 'reactions') {
    return this.play('tap', category);
  }
}

// Global test hooks setup
if (typeof window !== 'undefined') {
  if (!window.__soundTestHooks) {
    window.__soundTestHooks = {
      playCount: 0,
      activeAudioObjects: 0,
      lastPlayed: null,
      history: [],
      getPlayCount() { return this.playCount; },
      getActiveAudioObjectsCount() { return this.activeAudioObjects; },
      reset() {
        this.playCount = 0;
        this.activeAudioObjects = 0;
        this.lastPlayed = null;
        this.history = [];
      }
    };
  }
}

const soundManagerInstance = new SoundManager();

if (typeof window !== 'undefined') {
  window.soundEffects = soundManagerInstance;
  window.soundManager = soundManagerInstance;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = soundManagerInstance;
}
})();
