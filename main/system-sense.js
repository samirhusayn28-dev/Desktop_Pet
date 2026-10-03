/**
 * Desktop Pet — SystemSense Module (Main Process)
 * Monitors hardware, system telemetry, and desktop environment (macOS & Windows)
 * to trigger contextual event-driven reactions in the pet.
 * 
 * Sensors:
 * - Volume (max/high/low/mute) via combined osascript
 * - Brightness (dim/normal/max) via ioreg AppleBacklightDisplay
 * - Battery (low <20%, critical <10%, plugged in, unplugged, full) via pmset/si
 * - Music/Media (Spotify/Apple Music) via JXA
 * - Internet connect/disconnect via DNS lookup
 * - Headphones via system_profiler SPAudioDataType
 * - Screen Unlock / Resume ("Welcome back!") via powerMonitor
 * - CPU/RAM very high via si.currentLoad
 * - Late night (midnight - 5 AM)
 */

const { exec } = require('child_process');
const dns = require('dns');
const os = require('os');
const { powerMonitor } = require('electron');
const store = require('./secure-store');
const bubble = require('./bubble-window');

class SystemSense {
  constructor() {
    this.pollTimer = null;
    this.petWindowRef = null;
    this.lastReactions = {}; // eventType -> timestamp (for rate limiting)
    this.debounceCooldownMs = 180000; // 3 minutes cooldown per reaction type
    this.isSleeping = false;
    this.isScreenLocked = false;
    this.isSuspended = false;
    this.recentChangeDetected = false;
    this.userName = '';
    this.lastHeadphonesCheck = 0;

    // Baseline tracker
    this.state = {
      isOnline: true,
      hasCheckedOnline: false,
      batteryCharging: null,
      batteryPercent: null,
      isMusicPlaying: false,
      currentTrack: '',
      isMuted: null,
      volumeLevel: null,
      brightnessLevel: null,
      brightnessAvailable: true,
      headphonesConnected: null,
      isHighLoad: false,
      isLateNightNudged: false
    };

    this.setupPowerEvents();
  }

  setPetWindow(win) {
    this.petWindowRef = win;
  }

  setUserName(name) {
    this.userName = (name || '').trim();
  }

  getUserName() {
    return (this.userName || store.get('settings.general.userName') || '').trim();
  }

  setSleeping(sleeping) {
    this.isSleeping = !!sleeping;
  }

  setupPowerEvents() {
    try {
      if (powerMonitor) {
        powerMonitor.on('lock-screen', () => {
          this.isScreenLocked = true;
        });
        powerMonitor.on('unlock-screen', () => {
          this.isScreenLocked = false;
          this.handleScreenUnlock();
        });
        powerMonitor.on('suspend', () => {
          this.isSuspended = true;
        });
        powerMonitor.on('resume', () => {
          this.isSuspended = false;
          this.handleScreenUnlock();
        });
      }
    } catch (e) {
      console.warn('[SystemSense] PowerMonitor hook error:', e.message);
    }
  }

  handleScreenUnlock() {
    const isEnabled = store.get('settings.reactions.screenUnlock') !== false;
    if (!isEnabled) return;

    if (this.canReact('screenUnlock', 120000)) {
      this.sendPetEmotion('happy', 4000);
      const name = this.getUserName();
      bubble.show({
        badge: 'WELCOME BACK',
        text: name ? `Welcome back, ${name}! Ready when you are.` : 'Welcome back! Ready when you are.',
        sound: 'happy',
        emotion: 'happy'
      });
    }
  }

  start() {
    this.stop();

    // Initial check after 1.5 seconds
    this.pollTimer = setTimeout(() => this.runAdaptiveCheck(), 1500);
    console.log('[SystemSense] Active with adaptive energy-efficient scheduler');
  }

  async runAdaptiveCheck() {
    if (this.isScreenLocked || this.isSuspended) {
      // Screen is locked or system is suspended - sleep interval (20s)
      this.pollTimer = setTimeout(() => this.runAdaptiveCheck(), 20000);
      return;
    }

    try {
      await this.checkAllSensors();
    } catch (e) {
      console.warn('[SystemSense] checkAllSensors error:', e);
    }

    // Adaptive interval: 3s if recent change detected, 15s if pet is sleeping, 6s when stable
    let nextDelay = 6000;
    if (this.isSleeping) {
      nextDelay = 15000;
    } else if (this.recentChangeDetected) {
      nextDelay = 3000;
      this.recentChangeDetected = false;
    }

    this.pollTimer = setTimeout(() => this.runAdaptiveCheck(), nextDelay);
  }

  stop() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  canReact(eventType, customCooldown = null) {
    const isEnabled = store.get(`settings.reactions.${eventType}`);
    if (isEnabled === false) return false;

    const now = Date.now();
    const last = this.lastReactions[eventType] || 0;
    const cooldown = customCooldown || this.debounceCooldownMs;

    if (now - last < cooldown) return false;

    this.lastReactions[eventType] = now;
    return true;
  }

  sendPetEmotion(state, duration = 3500) {
    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      this.petWindowRef.webContents.send('pet:set-state', { state, duration });
    }
  }

  async checkAllSensors() {
    if (this.isSleeping) return; // Completely pause polling when pet is sleeping
    try {
      await Promise.allSettled([
        this.checkVolume(),
        this.checkBrightness(),
        this.checkBattery(),
        this.checkMedia(),
        this.checkNetwork(),
        this.checkHeadphones(),
        this.checkSystemLoad(),
        this.checkLateNight()
      ]);
    } catch (e) {
      // Sensor errors must never crash the main process
    }
  }

  // --- 1. VOLUME SENSOR ---
  checkVolume() {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') return resolve();

      // Combined osascript: fetches volume and mute in a single string
      exec(`osascript -e 'set o to (get volume settings)' -e '(output volume of o as string) & "," & (output muted of o as string)' 2>/dev/null`, (err, stdout) => {
        if (err || !stdout) return resolve();

        const parts = stdout.trim().split(',');
        const vol = parseInt(parts[0], 10);
        const muted = (parts[1] || '').trim() === 'true';

        if (isNaN(vol)) return resolve();

        // Initial assignment
        if (this.state.volumeLevel === null) {
          this.state.volumeLevel = vol;
          this.state.isMuted = muted;
          return resolve();
        }

        // Mute toggle detection
        if (muted !== this.state.isMuted) {
          this.state.isMuted = muted;
          if (muted && this.canReact('volume', 30000)) {
            this.sendPetEmotion('neutral', 3000);
            bubble.show({
              badge: 'AUDIO MUTED',
              text: 'Shh... Volume muted.',
              sound: 'tap',
              emotion: 'neutral'
            });
          } else if (!muted && this.canReact('volume', 30000)) {
            this.sendPetEmotion('happy', 2500);
          }
        }

        // Volume level transitions
        if (!muted) {
          if (vol >= 95 && this.state.volumeLevel < 95) {
            if (this.canReact('volume', 45000)) {
              this.sendPetEmotion('irritated', 4000);
              const name = this.getUserName();
              bubble.show({
                badge: 'MAX VOLUME',
                text: name ? `Whoa ${name}, too loud! Protecting my little ears!` : 'Whoa, too loud! Protecting my little ears!',
                sound: 'tap',
                emotion: 'irritated'
              });
            }
          } else if (vol <= 10 && this.state.volumeLevel > 10) {
            if (this.canReact('volume', 45000)) {
              this.sendPetEmotion('relieved', 2500);
              bubble.show({
                badge: 'WHISPER QUIET',
                text: 'Nice and quiet volume.',
                emotion: 'relieved'
              });
            }
          }
        }

        this.state.volumeLevel = vol;
        resolve();
      });
    });
  }

  // --- 2. BRIGHTNESS SENSOR ---
  checkBrightness() {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') {
        this.state.brightnessAvailable = false;
        return resolve();
      }

      // Read AppleBacklightDisplay on macOS
      exec(`ioreg -c AppleBacklightDisplay | grep -E "brightness" 2>/dev/null`, (err, stdout) => {
        if (err || !stdout || !stdout.includes('brightness')) {
          this.state.brightnessAvailable = false;
          return resolve();
        }

        this.state.brightnessAvailable = true;
        // Parse: "brightness"={"max"=1024,"min"=0,"value"=703}
        const match = stdout.match(/"brightness"=\{"max"=(\d+),"min"=(\d+),"value"=(\d+)\}/);
        if (!match) return resolve();

        const max = parseInt(match[1], 10) || 1024;
        const val = parseInt(match[3], 10) || 0;
        const pct = Math.round((val / max) * 100);

        if (this.state.brightnessLevel === null) {
          this.state.brightnessLevel = pct;
          return resolve();
        }

        const prev = this.state.brightnessLevel;
        this.state.brightnessLevel = pct;

        if (pct >= 95 && prev < 95) {
          if (this.canReact('brightness', 60000)) {
            this.sendPetEmotion('squint', 3500);
            bubble.show({
              badge: 'MAX BRIGHTNESS',
              text: 'So bright! Sunglasses recommended!',
              emotion: 'squint'
            });
          }
        } else if (pct <= 15 && prev > 15) {
          if (this.canReact('brightness', 60000)) {
            this.sendPetEmotion('sleepy', 3500);
            bubble.show({
              badge: 'DIM SCREEN',
              text: 'Getting cozy in the dark...',
              emotion: 'sleepy'
            });
          }
        }

        resolve();
      });
    });
  }

  // --- 3. BATTERY SENSOR ---
  checkBattery() {
    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        exec(`pmset -g batt 2>/dev/null`, (err, stdout) => {
          if (err || !stdout || !stdout.includes('InternalBattery')) {
            return resolve();
          }

          const match = stdout.match(/(\d+)%;\s*([^;]+);/);
          if (!match) return resolve();

          const pct = parseInt(match[1], 10);
          const stateStr = match[2].trim().toLowerCase();
          const isCharging = stateStr.includes('charging') || stateStr.includes('ac power');

          this.processBatteryState(pct, isCharging);
          resolve();
        });
      } else {
        si.battery().then(b => {
          if (b && b.hasBattery) {
            this.processBatteryState(b.percent || 100, b.isCharging);
          }
          resolve();
        }).catch(() => resolve());
      }
    });
  }

  processBatteryState(pct, isCharging) {
    if (this.state.batteryCharging === null) {
      this.state.batteryCharging = isCharging;
      this.state.batteryPercent = pct;
      return;
    }

    // Plugged in
    if (!this.state.batteryCharging && isCharging) {
      this.state.batteryCharging = true;
      if (this.canReact('battery', 30000)) {
        this.sendPetEmotion('charging', 4000);
        bubble.show({
          badge: 'CHARGER CONNECTED',
          text: 'Plugged in! Energized and charging up!',
          sound: 'happy',
          emotion: 'charging'
        });
      }
    }
    // Unplugged
    else if (this.state.batteryCharging && !isCharging) {
      this.state.batteryCharging = false;
      if (this.canReact('battery', 30000)) {
        this.sendPetEmotion('surprised', 2500);
        bubble.show({
          badge: 'ON BATTERY',
          text: `Running on battery power (${pct}%).`,
          sound: 'tap',
          emotion: 'surprised'
        });
      }
    }

    // Low / Critical battery
    const name = this.getUserName();
    if (!isCharging) {
      if (pct <= 10 && (this.state.batteryPercent === null || this.state.batteryPercent > 10)) {
        if (this.canReact('battery', 120000)) {
          this.sendPetEmotion('low-battery', 5000);
          bubble.show({
            badge: 'CRITICAL BATTERY',
            text: name ? `Hey ${name}, battery is down to ${pct}%! Please plug in soon!` : `Battery is down to ${pct}%! Please plug in soon!`,
            sound: 'tap',
            emotion: 'low-battery'
          });
        }
      } else if (pct <= 20 && (this.state.batteryPercent === null || this.state.batteryPercent > 20)) {
        if (this.canReact('battery', 180000)) {
          this.sendPetEmotion('low-battery', 4500);
          bubble.show({
            badge: 'LOW BATTERY',
            text: name ? `${name}, battery at ${pct}%. Grab your charger when you can!` : `Battery at ${pct}%. Grab your charger when you can!`,
            sound: 'tap',
            emotion: 'low-battery'
          });
        }
      }
    } else if (pct === 100 && this.state.batteryPercent < 100) {
      if (this.canReact('battery', 180000)) {
        this.sendPetEmotion('happy', 3500);
        bubble.show({
          badge: 'BATTERY FULL',
          text: name ? `All powered up, ${name}! 100% ready!` : 'Battery fully charged! 100% ready!',
          sound: 'happy',
          emotion: 'happy'
        });
      }
    }

    this.state.batteryPercent = pct;
  }

  // --- 4. MEDIA / MUSIC SENSOR (JXA for Spotify / Apple Music) ---
  checkMedia() {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') return resolve();

      const jxa = `
        function run() {
          var track = "";
          try {
            var spotify = Application("Spotify");
            if (spotify.running() && spotify.playerState() === "playing") {
              var t = spotify.currentTrack;
              track = "Spotify: " + t.name() + " - " + t.artist();
            }
          } catch(e) {}
          if (!track) {
            try {
              var music = Application("Music");
              if (music.running() && music.playerState() === "playing") {
                var t = music.currentTrack;
                track = "Music: " + t.name() + " - " + t.artist();
              }
            } catch(e) {}
          }
          return track;
        }
      `;

      exec(`osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}' 2>/dev/null`, (err, stdout) => {
        const info = (stdout || '').trim();
        const isPlaying = info.length > 0;

        if (isPlaying && !this.state.isMusicPlaying) {
          this.state.isMusicPlaying = true;
          this.state.currentTrack = info;

          this.sendPetEmotion('vibing', 6000);
          if (this.canReact('media', 90000)) {
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
        }

        resolve();
      });
    });
  }

  // --- 5. NETWORK / INTERNET SENSOR ---
  checkNetwork() {
    return new Promise((resolve) => {
      dns.lookup('1.1.1.1', (err) => {
        const online = !err;

        if (!this.state.hasCheckedOnline) {
          this.state.isOnline = online;
          this.state.hasCheckedOnline = true;
          return resolve();
        }

        if (!online && this.state.isOnline) {
          this.state.isOnline = false;
          if (this.canReact('network', 60000)) {
            this.sendPetEmotion('irritated', 4000);
            bubble.show({
              badge: 'OFFLINE',
              text: 'Internet disconnected. Working in offline mode.',
              sound: 'tap',
              emotion: 'irritated'
            });
          }
        } else if (online && !this.state.isOnline) {
          this.state.isOnline = true;
          if (this.canReact('network', 60000)) {
            this.sendPetEmotion('happy', 3500);
            bubble.show({
              badge: 'CONNECTED',
              text: 'Internet reconnected! Back online.',
              sound: 'happy',
              emotion: 'happy'
            });
          }
        }

        resolve();
      });
    });
  }

  // --- 6. HEADPHONES SENSOR ---
  checkHeadphones(force = false) {
    return new Promise((resolve) => {
      if (process.platform !== 'darwin') return resolve();

      const now = Date.now();
      // Throttle heavy system_profiler to once every 45s unless forced (e.g. on volume change or initial run)
      if (!force && this.state.headphonesConnected !== null && (now - this.lastHeadphonesCheck < 45000)) {
        return resolve();
      }
      this.lastHeadphonesCheck = now;

      exec(`system_profiler SPAudioDataType 2>/dev/null`, (err, stdout) => {
        if (err || !stdout) return resolve();

        // Check if Default Output Device contains Headphones, AirPods, or Headset
        const isHeadphones = /Default Output Device: Yes[\s\S]*?(Output Source: (Headphones|AirPods|Bluetooth)|Transport: (Bluetooth))/i.test(stdout) ||
                             /(AirPods|Headphones|EarPods|Buds)/i.test(stdout.split('Default Output Device: Yes')[0] || '');

        if (this.state.headphonesConnected === null) {
          this.state.headphonesConnected = isHeadphones;
          return resolve();
        }

        if (isHeadphones && !this.state.headphonesConnected) {
          this.state.headphonesConnected = true;
          if (this.canReact('headphones', 60000)) {
            this.sendPetEmotion('focus', 4000);
            const name = this.getUserName();
            bubble.show({
              badge: 'HEADPHONES DETECTED',
              text: name ? `Headphones on, ${name}. Focus mode engaged!` : 'Headphones connected. Focus mode engaged!',
              sound: 'chirp',
              emotion: 'focus'
            });
          }
        } else if (!isHeadphones && this.state.headphonesConnected) {
          this.state.headphonesConnected = false;
        }

        resolve();
      });
    });
  }

  calculateRealSystemCpu() {
    const cpus = os.cpus();
    if (!this.prevCpuTimes || this.prevCpuTimes.length !== cpus.length) {
      this.prevCpuTimes = cpus.map(c => Object.assign({}, c.times));
      return 0;
    }

    let totalDiff = 0;
    let idleDiff = 0;

    for (let i = 0; i < cpus.length; i++) {
      const prev = this.prevCpuTimes[i];
      const curr = cpus[i].times;
      const user = curr.user - prev.user;
      const nice = curr.nice - prev.nice;
      const sys = curr.sys - prev.sys;
      const idle = curr.idle - prev.idle;
      const irq = curr.irq - prev.irq;

      totalDiff += (user + nice + sys + idle + irq);
      idleDiff += idle;
    }

    this.prevCpuTimes = cpus.map(c => Object.assign({}, c.times));

    if (totalDiff <= 0) return 0;
    const busyFraction = (totalDiff - idleDiff) / totalDiff;
    return Math.min(100, Math.max(0, Math.round(busyFraction * 100)));
  }

  // --- 7. SYSTEM LOAD SENSOR ---
  async checkSystemLoad() {
    if (!store.get('settings.reactions.highLoad')) return;

    try {
      const now = Date.now();
      const elapsed = now - (this.lastCpuCheckTime || now);
      this.lastCpuCheckTime = now;

      const cpu = this.calculateRealSystemCpu();

      // Only trigger if system load stays above ~90% for 30+ seconds
      if (cpu >= 90) {
        this.highLoadDurationMs = (this.highLoadDurationMs || 0) + elapsed;
        if (this.highLoadDurationMs >= 30000) {
          if (!this.state.isHighLoad && this.canReact('highLoad', 180000)) {
            this.state.isHighLoad = true;
            this.sendPetEmotion('stressed', 5000);
            const name = this.getUserName();
            bubble.show({
              badge: 'HEAVY LOAD',
              text: name ? `Whoa ${name}, sustained heavy load detected (${cpu}%)!` : `Sustained high load detected (${cpu}%)!`,
              sound: 'tap',
              emotion: 'stressed'
            });
          }
        }
      } else {
        this.highLoadDurationMs = 0;
        if (cpu < 60 && this.state.isHighLoad) {
          this.state.isHighLoad = false;
          this.sendPetEmotion('relieved', 3000);
        }
      }
    } catch (e) {}
  }

  // --- 8. LATE NIGHT SENSOR ---
  async checkLateNight() {
    if (!store.get('settings.reactions.lateNight')) return;

    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) {
      if (!this.state.isLateNightNudged && this.canReact('lateNight', 3600000)) { // 1 hr cooldown
        this.state.isLateNightNudged = true;
        this.sendPetEmotion('sleepy', 5000);
        const name = this.getUserName();
        bubble.show({
          badge: 'LATE NIGHT CODER',
          text: name ? `Burning the midnight oil, ${name}? Don't forget to get some good sleep!` : "It's past midnight! Don't forget to get some good sleep tonight!",
          emotion: 'sleepy',
          sound: 'chirp'
        });
      }
    } else {
      this.state.isLateNightNudged = false;
    }
  }

  // --- SENSOR STATUS FOR SETTINGS -> REACTIONS ---
  async getSensorStatus() {
    const status = [];

    // Volume
    status.push({
      id: 'volume',
      name: 'Audio Volume',
      status: this.state.volumeLevel !== null ? 'Working' : 'Checking...',
      detail: this.state.volumeLevel !== null ? `${this.state.volumeLevel}% (${this.state.isMuted ? 'Muted' : 'Unmuted'})` : 'Active'
    });

    // Brightness
    status.push({
      id: 'brightness',
      name: 'Screen Brightness',
      status: this.state.brightnessAvailable ? (this.state.brightnessLevel !== null ? 'Working' : 'Checking...') : 'Unavailable on this device',
      detail: this.state.brightnessAvailable && this.state.brightnessLevel !== null ? `${this.state.brightnessLevel}%` : 'Desktop/External Display'
    });

    // Battery
    status.push({
      id: 'battery',
      name: 'Battery & Power',
      status: this.state.batteryPercent !== null ? 'Working' : 'Checking...',
      detail: this.state.batteryPercent !== null ? `${this.state.batteryPercent}% (${this.state.batteryCharging ? 'Charging' : 'On Battery'})` : 'AC Power'
    });

    // Media
    status.push({
      id: 'media',
      name: 'Music & Media (Spotify / Apple Music)',
      status: 'Working',
      detail: this.state.isMusicPlaying ? this.state.currentTrack : 'Idle / Not playing'
    });

    // Network
    status.push({
      id: 'network',
      name: 'Internet Connection',
      status: 'Working',
      detail: this.state.isOnline ? 'Connected' : 'Offline'
    });

    // Headphones
    status.push({
      id: 'headphones',
      name: 'Headphones / Audio Jack',
      status: 'Working',
      detail: this.state.headphonesConnected ? 'Headphones Connected' : 'Speakers Active'
    });

    // Screen Unlock
    status.push({
      id: 'screenUnlock',
      name: 'Screen Unlock / Resume',
      status: 'Working',
      detail: 'Listening for system wake/unlock'
    });

    // System Load
    status.push({
      id: 'highLoad',
      name: 'CPU & RAM Telemetry',
      status: 'Working',
      detail: this.state.isHighLoad ? 'High Load (>85%)' : 'Normal Load'
    });

    return status;
  }
}

module.exports = new SystemSense();
