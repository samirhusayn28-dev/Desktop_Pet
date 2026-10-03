/**
 * Desktop Pet — SystemSense Module (Main Process)
 * Monitors hardware, system telemetry, and desktop environment (macOS & Windows)
 * to trigger contextual event-driven reactions in the pet.
 */

const { exec } = require('child_process');
const si = require('systeminformation');
const store = require('./secure-store');
const bubble = require('./bubble-window');

class SystemSense {
  constructor() {
    this.pollTimer = null;
    this.petWindowRef = null;
    this.lastReactions = {}; // eventType -> timestamp (for debouncing)
    this.debounceCooldownMs = 180000; // 3 minutes cooldown per reaction type

    // Baseline tracker
    this.state = {
      isOnline: true,
      batteryCharging: null,
      batteryPercent: null,
      isMusicPlaying: false,
      currentTrack: '',
      isMuted: false,
      volumeLevel: 50,
      brightnessLevel: 50,
      isHighLoad: false,
      isLateNightNudged: false
    };
  }

  setPetWindow(win) {
    this.petWindowRef = win;
  }

  start() {
    if (this.pollTimer) clearInterval(this.pollTimer);

    // Initial check after 2 seconds, then every 4 seconds
    setTimeout(() => this.checkAllSensors(), 2000);
    this.pollTimer = setInterval(() => {
      this.checkAllSensors();
    }, 4000);

    console.log('[SystemSense] Multi-sensor desktop environment awareness active');
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  canReact(eventType) {
    const isEnabled = store.get(`settings.reactions.${eventType}`);
    if (isEnabled === false) return false;

    const now = Date.now();
    const last = this.lastReactions[eventType] || 0;
    if (now - last < this.debounceCooldownMs) return false;

    this.lastReactions[eventType] = now;
    return true;
  }

  sendPetEmotion(state, duration = 3500) {
    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      this.petWindowRef.webContents.send('pet:set-state', { state, duration });
    }
  }

  async checkAllSensors() {
    try {
      await Promise.all([
        this.checkBattery(),
        this.checkVolume(),
        this.checkMedia(),
        this.checkSystemLoad(),
        this.checkLateNight()
      ]);
    } catch (e) {
      // Never crash on sensor errors
    }
  }

  // --- BATTERY SENSOR ---
  async checkBattery() {
    if (!store.get('settings.reactions.battery')) return;

    try {
      const b = await si.battery();
      if (!b.hasBattery) return;

      const pct = b.percent || 100;
      const isCharging = b.isCharging;

      // 1. Just plugged in -> energized / charging
      if (this.state.batteryCharging === false && isCharging === true) {
        this.state.batteryCharging = true;
        if (this.canReact('battery')) {
          this.sendPetEmotion('charging', 4000);
          bubble.show({
            badge: 'CHARGER CONNECTED',
            text: 'Plugged in! Energized and charging up!',
            sound: 'happy',
            emotion: 'charging'
          });
        }
      }
      // 2. Just unplugged -> small surprised
      else if (this.state.batteryCharging === true && isCharging === false) {
        this.state.batteryCharging = false;
        if (this.canReact('battery')) {
          this.sendPetEmotion('surprised', 2000);
        }
      }
      this.state.batteryCharging = isCharging;

      // 3. Low Battery warning
      if (!isCharging) {
        if (pct <= 10 && (this.state.batteryPercent === null || this.state.batteryPercent > 10)) {
          if (this.canReact('battery')) {
            this.sendPetEmotion('low-battery', 5000);
            bubble.show({
              badge: 'CRITICAL BATTERY',
              text: `Battery is at ${pct}%! Please connect your power adapter!`,
              sound: 'tap',
              emotion: 'low-battery'
            });
          }
        } else if (pct <= 20 && (this.state.batteryPercent === null || this.state.batteryPercent > 20)) {
          if (this.canReact('battery')) {
            this.sendPetEmotion('low-battery', 4500);
            bubble.show({
              badge: 'LOW BATTERY',
              text: `Battery is down to ${pct}%. Grab your charger soon!`,
              sound: 'tap',
              emotion: 'low-battery'
            });
          }
        }
      }
      this.state.batteryPercent = pct;
    } catch (e) {}
  }

  // --- VOLUME SENSOR ---
  async checkVolume() {
    if (!store.get('settings.reactions.volume')) return;

    if (process.platform === 'darwin') {
      exec(`osascript -e "output volume of (get volume settings)" -e "output muted of (get volume settings)" 2>/dev/null`, (err, stdout) => {
        if (err || !stdout) return;
        const lines = stdout.trim().split('\n');
        const vol = parseInt(lines[0], 10);
        const muted = lines[1]?.trim() === 'true';

        // Muted trigger
        if (muted && !this.state.isMuted) {
          this.state.isMuted = true;
          if (this.canReact('volume')) {
            this.sendPetEmotion('neutral', 3000);
            bubble.show({
              badge: 'MUTED',
              text: 'Shh... Volume muted.',
              emotion: 'neutral'
            });
          }
        } else if (!muted && this.state.isMuted) {
          this.state.isMuted = false;
          if (this.canReact('volume')) {
            this.sendPetEmotion('relieved', 2500);
          }
        }

        // High / Max volume trigger
        if (!muted && !isNaN(vol)) {
          if (vol >= 95 && this.state.volumeLevel < 95) {
            if (this.canReact('volume')) {
              this.sendPetEmotion('irritated', 4000);
              bubble.show({
                badge: 'MAX VOLUME',
                text: 'Whoa, too loud! Protecting my little ears!',
                emotion: 'irritated'
              });
            }
          } else if (vol <= 10 && this.state.volumeLevel > 10) {
            if (this.canReact('volume')) {
              this.sendPetEmotion('relieved', 2500);
            }
          }
          this.state.volumeLevel = vol;
        }
      });
    }
  }

  // --- MEDIA / MUSIC SENSOR ---
  async checkMedia() {
    if (!store.get('settings.reactions.media')) return;

    if (process.platform === 'darwin') {
      // Query Spotify or Apple Music state
      const script = `
        set trackInfo to ""
        try
          if application "Spotify" is running then
            tell application "Spotify"
              if player state is playing then
                set trackInfo to "Spotify: " & name of current track & " - " & artist of current track
              end if
            end tell
          end if
        end try
        if trackInfo is "" then
          try
            if application "Music" is running then
              tell application "Music"
                if player state is playing then
                  set trackInfo to "Music: " & name of current track & " - " & artist of current track
                end if
              end tell
            end if
          end try
        end if
        return trackInfo
      `;

      exec(`osascript -e '${script.replace(/'/g, "'\\''")}' 2>/dev/null`, (err, stdout) => {
        const info = (stdout || '').trim();
        const isPlaying = info.length > 0;

        if (isPlaying && !this.state.isMusicPlaying) {
          this.state.isMusicPlaying = true;
          this.state.currentTrack = info;

          this.sendPetEmotion('vibing', 6000);
          if (this.canReact('media')) {
            bubble.show({
              badge: 'VIBING TO MUSIC ♪',
              text: `Grooving to ${info.replace(/^(Spotify|Music):\s*/, '')}!`,
              sound: 'happy',
              emotion: 'vibing'
            });
          }
        } else if (!isPlaying && this.state.isMusicPlaying) {
          this.state.isMusicPlaying = false;
          this.state.currentTrack = '';
          this.sendPetEmotion('relieved', 2500);
        }
      });
    }
  }

  // --- SYSTEM LOAD SENSOR ---
  async checkSystemLoad() {
    if (!store.get('settings.reactions.highLoad')) return;

    try {
      const load = await si.currentLoad();
      const cpu = Math.round(load.currentLoad || 0);

      if (cpu >= 85) {
        if (!this.state.isHighLoad && this.canReact('highLoad')) {
          this.state.isHighLoad = true;
          this.sendPetEmotion('stressed', 5000);
          bubble.show({
            badge: 'HEAVY CPU LOAD',
            text: `CPU is working hard (${cpu}%)! Sweating a bit!`,
            emotion: 'stressed'
          });
        }
      } else if (cpu < 50 && this.state.isHighLoad) {
        this.state.isHighLoad = false;
        this.sendPetEmotion('relieved', 3000);
      }
    } catch (e) {}
  }

  // --- LATE NIGHT SENSOR ---
  async checkLateNight() {
    if (!store.get('settings.reactions.lateNight')) return;

    const hour = new Date().getHours();
    // Midnight to 5 AM
    if (hour >= 0 && hour < 5) {
      if (!this.state.isLateNightNudged && this.canReact('lateNight')) {
        this.state.isLateNightNudged = true;
        this.sendPetEmotion('sleepy', 5000);
        bubble.show({
          badge: 'LATE NIGHT CODER',
          text: `It's past midnight! Don't forget to get some good sleep tonight!`,
          emotion: 'sleepy',
          sound: 'chirp'
        });
      }
    } else {
      this.state.isLateNightNudged = false;
    }
  }
}

module.exports = new SystemSense();
