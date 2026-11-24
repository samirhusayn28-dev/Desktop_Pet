/**
 * Desktop Pet — Unified Sound Manager (Item SND1)
 *
 * Behavior:
 * - Master setting `soundsEnabled` is ON by default (main/secure-store.js: true, volume 60).
 * - The master switch is AUTHORITATIVE. When it is OFF, ZERO audio elements (and no
 *   AudioContext) are created and no bundled file is loaded for *any* category —
 *   reminders, timer and reactions included. No external processes are used on
 *   macOS or Windows (no afplay, no PowerShell, no shell beeps).
 * - Deliberate exception: category 'test' (the Settings "Test sound" button) may still
 *   preview a sound while the master is OFF, so users can verify their speakers before
 *   enabling audio. It is never used by reminders, timer, reactions or bubbles.
 * - Sub-toggles (`soundReminders`, `soundTimer`, `soundReactions`) mute only their own
 *   category. DND mutes every category except the explicit 'test' preview.
 * - Volume is clamped to 0-100; 0 mutes. Audio elements are created lazily on the first
 *   permitted play and released shortly after playback.
 * - A new play stops the previous one. Re-triggering the same sound + category within
 *   200 ms is debounced (so one event cannot double-fire); manual tests that play
 *   sounds sequentially are unaffected.
 */

(function() {
const { ipcRenderer } = typeof require !== 'undefined' ? require('electron') : { ipcRenderer: null };
const storeModule = typeof require !== 'undefined' ? (function() {
  try { return require('../main/store'); } catch(e) { return null; }
})() : null;

const DEBOUNCE_MS = 200;

class SoundManager {
  constructor() {
    this.currentAudio = null;
    this.cleanupTimer = null;
    this.lastPlays = new Map(); // key: "category|sound" -> timestamp (ms)
    this.isPetWindow = typeof window !== 'undefined' && window.location.href.includes('pet.html');

    // Cached settings (updated via store or IPC). Sounds default ON.
    this.settings = {
      soundsEnabled: true,
      soundVolume: 60,
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
        if (remote && typeof remote === 'object') {
          // Missing/undefined means "no override" — keep the default ON.
          if (remote.soundsEnabled !== undefined) {
            this.settings.soundsEnabled = remote.soundsEnabled === true;
          }
          if (remote.soundVolume !== undefined) {
            const n = Number(remote.soundVolume);
            this.settings.soundVolume = isNaN(n) ? 60 : Math.max(0, Math.min(100, n));
          }
          if (remote.soundReminders !== undefined) this.settings.soundReminders = remote.soundReminders !== false;
          if (remote.soundTimer !== undefined) this.settings.soundTimer = remote.soundTimer !== false;
          if (remote.soundReactions !== undefined) this.settings.soundReactions = remote.soundReactions !== false;
          if (remote.dnd !== undefined) this.settings.dnd = remote.dnd === true;
        }
      } else if (storeModule) {
        this.settings.soundsEnabled = storeModule.get('settings.behavior.soundsEnabled') !== false;
        const n = Number(storeModule.get('settings.behavior.soundVolume'));
        this.settings.soundVolume = isNaN(n) ? 60 : Math.max(0, Math.min(100, n));
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

    const n = Number(this.settings.soundVolume);
    this.settings.soundVolume = isNaN(n) ? 60 : Math.max(0, Math.min(100, n));

    // Master OFF must immediately silence everything, including a queued/playing alarm.
    if (!this.settings.soundsEnabled) {
      this.stopAll();
      this.clearDebounce();
    } else if (!wasEnabled) {
      this.clearDebounce();
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
      this.clearDebounce();
    }
    if (ipcRenderer) {
      ipcRenderer.send('settings:sound-changed', { soundsEnabled: boolVal });
    }
  }

  clearDebounce() {
    this.lastPlays.clear();
  }

  /** Detach handlers and release the media element without touching a newer element. */
  releaseAudio(audio) {
    if (!audio || audio.__pixieReleased) return;
    audio.__pixieReleased = true;
    audio.onended = null;
    audio.onerror = null;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      if (typeof audio.remove === 'function') audio.remove();
    } catch (e) {}
  }

  stopAll() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.currentAudio) {
      const audio = this.currentAudio;
      this.currentAudio = null; // clear before releasing so async handlers cannot hit a new element
      this.releaseAudio(audio);
    }
    if (typeof window !== 'undefined' && window.__soundTestHooks) {
      window.__soundTestHooks.activeAudioObjects = 0;
    }
  }

  /**
   * Main play method.
   * @param {string} soundName - 'chirp', 'happy', 'alarm', 'tap'
   * @param {string} category - 'reminders', 'timer', 'reactions', 'test'
   */
  play(soundName, category = 'reactions') {
    // Always evaluate the master before any work — even before delegating via IPC.
    this.loadSettings();
    const isTest = category === 'test'; // documented preview exception only
    if (!this.settings.soundsEnabled && !isTest) return false;

    // 1. If not running in pet window, delegate to the pet window renderer.
    if (!this.isPetWindow) {
      if (ipcRenderer) {
        ipcRenderer.send('pet:play-sound-request', { sound: soundName, category });
      }
      return false;
    }

    // 2. DND mutes all categories (the settings preview is the sole exception).
    if (this.settings.dnd && !isTest) return false;

    // 3. Sub-toggles silence only their own category.
    if (category === 'reminders' && !this.settings.soundReminders) return false;
    if (category === 'timer' && !this.settings.soundTimer) return false;
    if (category === 'reactions' && !this.settings.soundReactions) return false;

    // 4. Volume (0-100); 0 is mute.
    const volNum = Number(this.settings.soundVolume);
    const volume = (isNaN(volNum) ? 60 : Math.max(0, Math.min(100, volNum))) / 100;
    if (volume <= 0) return false;

    // 5. Validate sound and debounce identical sound+category bursts.
    const validSounds = ['alarm', 'chirp', 'happy', 'tap'];
    const sName = validSounds.includes(soundName) ? soundName : 'chirp';
    const now = Date.now();
    const debounceKey = `${category}|${sName}`;
    const lastPlayedAt = this.lastPlays.get(debounceKey);
    if (lastPlayedAt !== undefined && now - lastPlayedAt < DEBOUNCE_MS) return false;
    this.lastPlays.set(debounceKey, now);

    // 6. One sound at a time: a new play stops whatever is currently playing.
    this.stopAll();

    // 7. Resolve small bundled audio file (<50 KB).
    let soundUrl;
    try {
      if (typeof require !== 'undefined') {
        const pathModule = require('path');
        const localPath = pathModule.resolve(__dirname, '..', 'audio', `${sName}.wav`);
        soundUrl = 'file://' + localPath.replace(/\\/g, '/');
      } else {
        soundUrl = new URL(`../audio/${sName}.wav`, window.location.href).href;
      }
    } catch (_) {
      soundUrl = new URL(`../audio/${sName}.wav`, window.location.href).href;
    }

    try {
      // Lazily create Audio element on first permitted use.
      const audio = new Audio(soundUrl);
      audio.volume = volume;
      this.currentAudio = audio;

      if (window.__soundTestHooks) {
        window.__soundTestHooks.activeAudioObjects++;
        window.__soundTestHooks.playCount++;
        window.__soundTestHooks.lastPlayed = { sound: sName, category, volume };
        window.__soundTestHooks.history.push({ sound: sName, category, volume, time: now });
      }

      const cleanup = () => {
        if (this.cleanupTimer) {
          clearTimeout(this.cleanupTimer);
          this.cleanupTimer = null;
        }
        if (audio.__pixieReleased) return;
        this.releaseAudio(audio);
        // Only the element that is still current owns the counters.
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          if (window.__soundTestHooks && window.__soundTestHooks.activeAudioObjects > 0) {
            window.__soundTestHooks.activeAudioObjects--;
          }
        }
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;

      // Release audio resources shortly after playback (4s safety net).
      this.cleanupTimer = setTimeout(cleanup, 4000);

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => cleanup());
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
        if (typeof soundManagerInstance !== 'undefined' && soundManagerInstance.clearDebounce) {
          soundManagerInstance.clearDebounce();
        }
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
