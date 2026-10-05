/**
 * Desktop Pet — Main Process Precision Timer Engine (Item T1)
 *
 * Implements timestamp-based end-time countdowns and Pomodoro focus tracking.
 * Immune to panel destruction, window close, and macOS sleep/resume.
 * Supports:
 * - Pomodoro: editable focus, short & long break minutes (1-180m), sessions before long break, auto-start toggle
 * - Standalone short-break and long-break modes
 * - Countdown: custom hours/minutes/seconds stepper inputs, quick preset chips, optional label
 * - Stopwatch: start, pause, resume, reset, and laps
 * - Validation (1s to 99:59:59 for countdown, 1-180m for Pomodoro)
 * - Restarts persistence and settings export/import integration
 * - Bubble notifications, sounds, and pet emotional reactions on completion
 */

const { ipcMain, powerMonitor } = require('electron');
const store = require('./secure-store');
const bubble = require('./bubble-window');

class TimerManager {
  constructor() {
    this.petWindowRef = null;
    this.panelWindowRef = null;
    this.timerInterval = null;

    // Load persisted settings or default
    this.loadSettings();

    // Runtime state
    this.mode = 'pomodoro'; // 'pomodoro' | 'short-break' | 'long-break' | 'countdown' | 'stopwatch'
    this.status = 'idle';   // 'idle' | 'running' | 'paused'
    this.isBreak = false;
    this.completedSessions = store.get('timers.completedSessions') || 0;
    this.totalSeconds = this.settings.pomodoro.focusMinutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.endTime = null;
    this.startTime = null;
    this.pauseRemaining = null;
    this.label = '';
    this.laps = [];
    this.lastLapTimestamp = 0;

    this.setupPowerMonitor();
    this.setupIPC();
  }

  loadSettings() {
    const defaultSettings = {
      pomodoro: {
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        sessionsBeforeLongBreak: 4,
        autoStartNext: false
      },
      countdown: {
        hours: 0,
        minutes: 5,
        seconds: 0,
        label: ''
      }
    };

    const saved = store.get('settings.timers') || {};
    this.settings = {
      pomodoro: {
        focusMinutes: this.clamp(saved.pomodoro?.focusMinutes ?? defaultSettings.pomodoro.focusMinutes, 1, 180),
        shortBreakMinutes: this.clamp(saved.pomodoro?.shortBreakMinutes ?? defaultSettings.pomodoro.shortBreakMinutes, 1, 180),
        longBreakMinutes: this.clamp(saved.pomodoro?.longBreakMinutes ?? defaultSettings.pomodoro.longBreakMinutes, 1, 180),
        sessionsBeforeLongBreak: this.clamp(saved.pomodoro?.sessionsBeforeLongBreak ?? defaultSettings.pomodoro.sessionsBeforeLongBreak, 1, 20),
        autoStartNext: Boolean(saved.pomodoro?.autoStartNext ?? defaultSettings.pomodoro.autoStartNext)
      },
      countdown: {
        hours: this.clamp(saved.countdown?.hours ?? defaultSettings.countdown.hours, 0, 99),
        minutes: this.clamp(saved.countdown?.minutes ?? defaultSettings.countdown.minutes, 0, 59),
        seconds: this.clamp(saved.countdown?.seconds ?? defaultSettings.countdown.seconds, 0, 59),
        label: (saved.countdown?.label || defaultSettings.countdown.label).slice(0, 50)
      }
    };

    // Save normalized settings
    store.set('settings.timers', this.settings);
  }

  clamp(val, min, max) {
    const num = parseInt(val, 10);
    if (isNaN(num)) return min;
    return Math.min(Math.max(min, num), max);
  }

  setWindows(petWin, panelWin) {
    this.petWindowRef = petWin;
    this.panelWindowRef = panelWin;
  }

  setupPowerMonitor() {
    if (powerMonitor) {
      powerMonitor.on('resume', () => {
        if (this.status === 'running' && this.endTime) {
          const now = Date.now();
          if (now >= this.endTime) {
            // Timer expired while asleep
            this.handleFinish();
          } else {
            this.remainingSeconds = Math.max(0, Math.ceil((this.endTime - now) / 1000));
            this.broadcastState();
          }
        }
      });
    }
  }

  setupIPC() {
    ipcMain.handle('timer:get-state', () => this.getState());

    ipcMain.handle('timer:start', (e, opts) => {
      return this.start(opts);
    });

    ipcMain.handle('timer:pause', () => {
      return this.pause();
    });

    ipcMain.handle('timer:resume', () => {
      return this.resume();
    });

    ipcMain.handle('timer:reset', () => {
      return this.reset();
    });

    ipcMain.handle('timer:switch-mode', (e, mode) => {
      return this.switchMode(mode);
    });

    ipcMain.handle('timer:lap', () => {
      return this.addLap();
    });

    ipcMain.handle('timer:update-settings', (e, newSettings) => {
      return this.updateSettings(newSettings);
    });

    ipcMain.handle('timer:reset-settings', () => {
      return this.resetSettingsToDefault();
    });

    ipcMain.handle('timer:simulate-time-jump', (e, forwardSeconds) => {
      return this.simulateTimeJump(forwardSeconds);
    });
  }

  getState() {
    return {
      mode: this.mode,
      status: this.status,
      isBreak: this.isBreak,
      totalSeconds: this.totalSeconds,
      remainingSeconds: this.remainingSeconds,
      endTime: this.endTime,
      startTime: this.startTime,
      completedSessions: this.completedSessions,
      label: this.label,
      laps: this.laps,
      settings: this.settings
    };
  }

  broadcastState() {
    const state = this.getState();
    if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
      this.panelWindowRef.webContents.send('timer:state-update', state);
    }
  }

  updateSettings(newSettings) {
    if (!newSettings || typeof newSettings !== 'object') return { success: false };

    if (newSettings.pomodoro) {
      const p = newSettings.pomodoro;
      if (p.focusMinutes !== undefined) this.settings.pomodoro.focusMinutes = this.clamp(p.focusMinutes, 1, 180);
      if (p.shortBreakMinutes !== undefined) this.settings.pomodoro.shortBreakMinutes = this.clamp(p.shortBreakMinutes, 1, 180);
      if (p.longBreakMinutes !== undefined) this.settings.pomodoro.longBreakMinutes = this.clamp(p.longBreakMinutes, 1, 180);
      if (p.sessionsBeforeLongBreak !== undefined) this.settings.pomodoro.sessionsBeforeLongBreak = this.clamp(p.sessionsBeforeLongBreak, 1, 20);
      if (p.autoStartNext !== undefined) this.settings.pomodoro.autoStartNext = Boolean(p.autoStartNext);
    }

    if (newSettings.countdown) {
      const c = newSettings.countdown;
      if (c.hours !== undefined) this.settings.countdown.hours = this.clamp(c.hours, 0, 99);
      if (c.minutes !== undefined) this.settings.countdown.minutes = this.clamp(c.minutes, 0, 59);
      if (c.seconds !== undefined) this.settings.countdown.seconds = this.clamp(c.seconds, 0, 59);
      if (c.label !== undefined) this.settings.countdown.label = String(c.label).slice(0, 50);
    }

    store.set('settings.timers', this.settings);

    // If timer is idle, refresh the display duration for the active mode
    if (this.status === 'idle') {
      this.recalculateTotalSeconds();
      this.remainingSeconds = this.totalSeconds;
    }

    this.broadcastState();
    return { success: true, settings: this.settings };
  }

  resetSettingsToDefault() {
    this.settings = {
      pomodoro: {
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        sessionsBeforeLongBreak: 4,
        autoStartNext: false
      },
      countdown: {
        hours: 0,
        minutes: 5,
        seconds: 0,
        label: ''
      }
    };
    store.set('settings.timers', this.settings);

    if (this.status === 'idle') {
      this.recalculateTotalSeconds();
      this.remainingSeconds = this.totalSeconds;
    }

    this.broadcastState();
    return { success: true, settings: this.settings };
  }

  recalculateTotalSeconds() {
    if (this.mode === 'pomodoro') {
      this.totalSeconds = (this.isBreak ? this.settings.pomodoro.shortBreakMinutes : this.settings.pomodoro.focusMinutes) * 60;
    } else if (this.mode === 'short-break') {
      this.totalSeconds = this.settings.pomodoro.shortBreakMinutes * 60;
    } else if (this.mode === 'long-break') {
      this.totalSeconds = this.settings.pomodoro.longBreakMinutes * 60;
    } else if (this.mode === 'countdown') {
      const h = this.settings.countdown.hours || 0;
      const m = this.settings.countdown.minutes || 0;
      const s = this.settings.countdown.seconds || 0;
      const computed = (h * 3600) + (m * 60) + s;
      this.totalSeconds = Math.max(1, Math.min(359999, computed));
    } else if (this.mode === 'stopwatch') {
      this.totalSeconds = 0;
    }
  }

  switchMode(newMode) {
    const validModes = ['pomodoro', 'short-break', 'long-break', 'countdown', 'stopwatch'];
    if (!validModes.includes(newMode)) return { success: false };

    this.pause();
    this.mode = newMode;
    this.isBreak = (newMode === 'short-break' || newMode === 'long-break');
    this.recalculateTotalSeconds();
    this.remainingSeconds = this.totalSeconds;
    this.status = 'idle';
    this.endTime = null;
    this.startTime = null;
    this.laps = [];

    this.broadcastState();
    return { success: true, state: this.getState() };
  }

  start(opts = {}) {
    if (this.status === 'running') return { success: true };

    if (opts.mode && opts.mode !== this.mode) {
      this.switchMode(opts.mode);
    }

    if (opts.durationSeconds) {
      this.totalSeconds = Math.max(1, opts.durationSeconds);
      this.remainingSeconds = this.totalSeconds;
    }

    if (opts.label !== undefined) {
      this.label = String(opts.label);
    }

    this.status = 'running';
    this.startTime = Date.now();

    if (this.mode === 'stopwatch') {
      this.lastLapTimestamp = this.startTime;
    } else {
      this.endTime = Date.now() + (this.remainingSeconds * 1000);
    }

    // Trigger focus state on pet if Pomodoro focus, or relaxed if break
    if (this.mode === 'pomodoro' && !this.isBreak) {
      if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
        this.petWindowRef.webContents.send('pet:set-state', { state: 'focus', duration: 0, priority: 4, held: true, force: true });
        const name = (store.get('settings.general.userName') || '').trim();
        const text = name ? `Focus mode ON, ${name}! Let's build something great!` : 'Focus mode ON! Happy coding!';
        bubble.show({ text, duration: 3500, emotion: 'focus', badge: 'FOCUS' });
      }
    } else if (this.isBreak || this.mode === 'short-break' || this.mode === 'long-break') {
      if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
        this.petWindowRef.webContents.send('pet:set-state', { state: 'relaxed', duration: 0, priority: 4, held: true, force: true });
      }
    }

    this.startTicker();
    this.broadcastState();
    return { success: true, state: this.getState() };
  }

  pause() {
    if (this.status !== 'running') return { success: false };

    this.status = 'paused';
    if (this.mode === 'stopwatch') {
      const now = Date.now();
      this.remainingSeconds += Math.floor((now - this.startTime) / 1000);
    } else if (this.endTime) {
      this.remainingSeconds = Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
    }
    this.endTime = null;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Release held state if in pomodoro or break
    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      this.petWindowRef.webContents.send('pet:set-state', { state: 'neutral', force: true });
    }

    this.broadcastState();
    return { success: true, state: this.getState() };
  }

  resume() {
    if (this.status !== 'paused') return { success: false };

    this.status = 'running';
    this.startTime = Date.now();
    if (this.mode !== 'stopwatch') {
      this.endTime = Date.now() + (this.remainingSeconds * 1000);
    }

    if (this.mode === 'pomodoro' && !this.isBreak) {
      if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
        this.petWindowRef.webContents.send('pet:set-state', { state: 'focus', duration: 0, priority: 4, held: true, force: true });
      }
    } else if (this.isBreak || this.mode === 'short-break' || this.mode === 'long-break') {
      if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
        this.petWindowRef.webContents.send('pet:set-state', { state: 'relaxed', duration: 0, priority: 4, held: true, force: true });
      }
    }

    this.startTicker();
    this.broadcastState();
    return { success: true, state: this.getState() };
  }

  reset() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    this.status = 'idle';
    this.endTime = null;
    this.startTime = null;
    this.recalculateTotalSeconds();
    this.remainingSeconds = this.totalSeconds;
    this.laps = [];

    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      this.petWindowRef.webContents.send('pet:set-state', { state: 'neutral', force: true });
    }

    this.broadcastState();
    return { success: true, state: this.getState() };
  }

  isFocusActive() {
    return this.status === 'running' && this.mode === 'pomodoro' && !this.isBreak;
  }

  simulateTimeJump(forwardSeconds = 60) {
    if (this.status === 'running' && this.endTime) {
      const shiftMs = forwardSeconds * 1000;
      this.endTime -= shiftMs;
      if (this.startTime) this.startTime -= shiftMs;
      const now = Date.now();
      if (now >= this.endTime) {
        this.handleFinish();
      } else {
        this.remainingSeconds = Math.max(0, Math.ceil((this.endTime - now) / 1000));
        this.broadcastState();
      }
    }
    return { success: true, state: this.getState() };
  }

  addLap() {
    if (this.mode !== 'stopwatch' || this.status !== 'running') return { success: false };

    const now = Date.now();
    const splitTime = this.formatTime(this.remainingSeconds + Math.floor((now - this.startTime) / 1000));
    const lapDuration = Math.floor((now - this.lastLapTimestamp) / 1000);
    this.lastLapTimestamp = now;

    const lapObj = {
      lapNumber: this.laps.length + 1,
      lapTime: this.formatTime(lapDuration),
      splitTime
    };

    this.laps.unshift(lapObj);
    this.broadcastState();
    return { success: true, laps: this.laps };
  }

  startTicker() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      if (this.status !== 'running') return;

      if (this.mode === 'stopwatch') {
        const now = Date.now();
        const elapsed = Math.floor((now - this.startTime) / 1000);
        this.broadcastTick(this.remainingSeconds + elapsed);
      } else {
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((this.endTime - now) / 1000));
        this.remainingSeconds = diff;
        this.broadcastTick(diff);

        if (diff <= 0) {
          this.handleFinish();
        }
      }
    }, 1000);
  }

  broadcastTick(seconds) {
    if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
      this.panelWindowRef.webContents.send('timer:tick', {
        remainingSeconds: seconds,
        totalSeconds: this.totalSeconds,
        status: this.status,
        mode: this.mode
      });
    }
  }

  handleFinish() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    const userName = (store.get('settings.general.userName') || '').trim();

    if (this.mode === 'pomodoro') {
      if (!this.isBreak) {
        // Focus finished -> Break starts
        this.completedSessions++;
        store.set('timers.completedSessions', this.completedSessions);

        const isThird = (this.completedSessions % 3 === 0);
        const emotion = isThird ? 'excited' : 'laugh';

        if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
          this.petWindowRef.webContents.send('pet:set-state', { state: emotion, duration: 5000, priority: 4, force: true });
        }

        const isLongBreakDue = (this.completedSessions % this.settings.pomodoro.sessionsBeforeLongBreak === 0);
        const nextBreakMin = isLongBreakDue ? this.settings.pomodoro.longBreakMinutes : this.settings.pomodoro.shortBreakMinutes;
        const breakName = isLongBreakDue ? 'Long Break' : 'Short Break';

        const text = isThird
          ? `3 Pomodoros done, ${userName || 'champ'}! You're on fire! Time for a ${nextBreakMin}m ${breakName}!`
          : `Great focus session, ${userName || 'friend'}! Time for a ${nextBreakMin}m ${breakName}.`;

        bubble.show({
          badge: isLongBreakDue ? 'LONG BREAK DUE' : 'POMODORO COMPLETE',
          text,
          duration: 6000,
          sound: 'alarm',
          emotion,
          force: true
        });

        // Switch to break phase
        this.isBreak = true;
        this.totalSeconds = nextBreakMin * 60;
        this.remainingSeconds = this.totalSeconds;

        if (this.settings.pomodoro.autoStartNext) {
          this.start();
        } else {
          this.status = 'idle';
          this.endTime = null;
        }
      } else {
        // Break finished -> Next focus session ready
        this.isBreak = false;
        this.totalSeconds = this.settings.pomodoro.focusMinutes * 60;
        this.remainingSeconds = this.totalSeconds;

        if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
          this.petWindowRef.webContents.send('pet:set-state', { state: 'happy', duration: 4000, priority: 4, force: true });
        }

        const text = userName
          ? `Break is over, ${userName}! Ready for another focus sprint?`
          : 'Break is over! Ready for another focus sprint?';

        bubble.show({
          badge: 'BREAK FINISHED',
          text,
          duration: 5000,
          sound: 'chirp',
          emotion: 'happy',
          force: true
        });

        if (this.settings.pomodoro.autoStartNext) {
          this.start();
        } else {
          this.status = 'idle';
          this.endTime = null;
        }
      }
    } else if (this.mode === 'short-break' || this.mode === 'long-break') {
      if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
        this.petWindowRef.webContents.send('pet:set-state', { state: 'happy', duration: 4000, priority: 4, force: true });
      }

      bubble.show({
        badge: 'BREAK COMPLETE',
        text: 'Break time is over! Ready when you are.',
        duration: 5000,
        sound: 'chirp',
        emotion: 'happy',
        force: true
      });
      this.status = 'idle';
      this.recalculateTotalSeconds();
      this.remainingSeconds = this.totalSeconds;
    } else if (this.mode === 'countdown') {
      if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
        this.petWindowRef.webContents.send('pet:set-state', { state: 'laugh', duration: 4000, priority: 4, force: true });
      }

      const text = this.label
        ? `"${this.label}" countdown finished!`
        : 'Countdown timer completed!';

      bubble.show({
        badge: 'TIMER FINISHED',
        text,
        duration: 6000,
        sound: 'alarm',
        emotion: 'laugh',
        force: true
      });

      this.status = 'idle';
      this.recalculateTotalSeconds();
      this.remainingSeconds = this.totalSeconds;
    }

    this.broadcastState();
  }

  formatTime(totalSec) {
    const s = Math.max(0, totalSec);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

module.exports = new TimerManager();
