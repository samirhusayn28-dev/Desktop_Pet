/**
 * Desktop Pet — Precision Timer & Pomodoro Tab Controller (Item T1)
 *
 * Fully integrated with main-process precision TimerEngine.
 * Handles:
 * - Real-time sync with main process (survives panel closing and reopen)
 * - Custom steppers for Pomodoro focus, short & long break, sessions, and auto-start toggle
 * - Custom steppers for standalone short break and long break
 * - Custom steppers for Countdown hours, minutes, seconds (no native pickers)
 * - Quick preset chips (5, 10, 15, 25, 45, 60m) and optional label
 * - Stopwatch start, pause, resume, reset, and laps table
 * - Reset-to-default icons on every input and "Reset section" buttons
 * - Dynamic circular SVG progress ring and digits formatting
 */

function getTimerIpc() {
  if (typeof window !== 'undefined' && window.panelController && window.panelController.ipcRenderer) {
    return window.panelController.ipcRenderer;
  }
  if (typeof require !== 'undefined') {
    try {
      return require('electron').ipcRenderer;
    } catch (e) {}
  }
  return null;
}

class TimerTab {
  constructor() {
    this.displayEl = document.getElementById('timer-time-display');
    this.sublabelEl = document.getElementById('timer-sublabel');
    this.toggleBtn = document.getElementById('btn-timer-toggle');
    this.lapBtn = document.getElementById('btn-timer-lap');
    this.resetBtn = document.getElementById('btn-timer-reset');
    this.pomodoroCountEl = document.getElementById('pomodoro-count');
    this.petStatusEl = document.getElementById('timer-pet-status');
    this.ringProgress = document.getElementById('timer-ring-progress');

    // Custom configuration card containers
    this.cards = {
      pomodoro: document.getElementById('timer-config-pomodoro'),
      'short-break': document.getElementById('timer-config-short-break'),
      'long-break': document.getElementById('timer-config-long-break'),
      countdown: document.getElementById('timer-config-countdown'),
      stopwatch: document.getElementById('timer-config-stopwatch')
    };

    // Runtime state
    this.mode = 'pomodoro';
    this.status = 'idle';
    this.isBreak = false;
    this.remainingSeconds = 25 * 60;
    this.totalSeconds = 25 * 60;
    this.completedSessions = 0;
    this.laps = [];
    this.settings = null;

    this.init();
  }

  async init() {
    this.setupEvents();
    this.setupIPC();
    await this.fetchState();
  }

  setupIPC() {
    const ipc = getTimerIpc();
    if (!ipc) return;

    ipc.on('timer:tick', (event, data) => {
      if (!data) return;
      this.remainingSeconds = data.remainingSeconds;
      this.totalSeconds = data.totalSeconds;
      this.status = data.status;
      this.mode = data.mode;
      this.updateDisplay();
    });

    ipc.on('timer:state-update', (event, state) => {
      if (state) this.applyState(state);
    });
  }

  async fetchState() {
    const ipc = getTimerIpc();
    if (!ipc) return;
    try {
      const state = await ipc.invoke('timer:get-state');
      if (state) this.applyState(state);
    } catch (e) {
      console.warn('[TimerTab] Failed to fetch state:', e);
    }
  }

  applyState(state) {
    this.mode = state.mode || 'pomodoro';
    this.status = state.status || 'idle';
    this.isBreak = !!state.isBreak;
    this.remainingSeconds = state.remainingSeconds !== undefined ? state.remainingSeconds : 25 * 60;
    this.totalSeconds = state.totalSeconds !== undefined ? state.totalSeconds : 25 * 60;
    this.completedSessions = state.completedSessions || 0;
    this.laps = state.laps || [];
    this.settings = state.settings || {};

    // 1. Update Mode Pill UI
    document.querySelectorAll('.timer-mode-btn').forEach(btn => {
      if (btn.dataset.mode === this.mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 2. Show corresponding custom configuration card
    Object.entries(this.cards).forEach(([m, card]) => {
      if (!card) return;
      if (m === this.mode) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });

    // 3. Lap button visibility (only for stopwatch)
    if (this.lapBtn) {
      if (this.mode === 'stopwatch') {
        this.lapBtn.classList.remove('hidden');
      } else {
        this.lapBtn.classList.add('hidden');
      }
    }

    // 4. Update Sublabel
    if (this.sublabelEl) {
      if (this.mode === 'pomodoro') {
        this.sublabelEl.textContent = this.isBreak ? 'POMODORO BREAK' : 'FOCUS SESSION';
      } else if (this.mode === 'short-break') {
        this.sublabelEl.textContent = 'SHORT BREAK';
      } else if (this.mode === 'long-break') {
        this.sublabelEl.textContent = 'LONG BREAK';
      } else if (this.mode === 'countdown') {
        this.sublabelEl.textContent = state.label ? state.label.toUpperCase() : 'COUNTDOWN';
      } else if (this.mode === 'stopwatch') {
        this.sublabelEl.textContent = 'STOPWATCH';
      }
    }

    // 5. Update Toggle Button Text & Icon
    this.updateToggleBtn();

    // 6. Update Sessions Count
    if (this.pomodoroCountEl) {
      this.pomodoroCountEl.textContent = this.completedSessions;
    }

    // 7. Populate Inputs from Settings
    this.syncInputsFromSettings();

    // 8. Render Laps
    this.renderLaps();

    // 9. Update Clock Display & SVG Ring
    this.updateDisplay();

    // 10. Refresh Lucide Icons
    if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
      window.panelController.refreshIcons();
    }
  }

  syncInputsFromSettings() {
    if (!this.settings) return;

    const p = this.settings.pomodoro || {};
    const c = this.settings.countdown || {};

    const focusInput = document.getElementById('pomodoro-focus-input');
    if (focusInput && p.focusMinutes !== undefined) focusInput.value = p.focusMinutes;

    const shortBreakInput = document.getElementById('pomodoro-short-break-input');
    if (shortBreakInput && p.shortBreakMinutes !== undefined) shortBreakInput.value = p.shortBreakMinutes;

    const standaloneShort = document.getElementById('standalone-short-break-input');
    if (standaloneShort && p.shortBreakMinutes !== undefined) standaloneShort.value = p.shortBreakMinutes;

    const longBreakInput = document.getElementById('pomodoro-long-break-input');
    if (longBreakInput && p.longBreakMinutes !== undefined) longBreakInput.value = p.longBreakMinutes;

    const standaloneLong = document.getElementById('standalone-long-break-input');
    if (standaloneLong && p.longBreakMinutes !== undefined) standaloneLong.value = p.longBreakMinutes;

    const sessionsInput = document.getElementById('pomodoro-sessions-input');
    if (sessionsInput && p.sessionsBeforeLongBreak !== undefined) sessionsInput.value = p.sessionsBeforeLongBreak;

    const autoStartToggle = document.getElementById('pomodoro-autostart-toggle');
    if (autoStartToggle && p.autoStartNext !== undefined) autoStartToggle.checked = !!p.autoStartNext;

    const cHours = document.getElementById('countdown-hours-input');
    if (cHours && c.hours !== undefined) cHours.value = c.hours;

    const cMins = document.getElementById('countdown-minutes-input');
    if (cMins && c.minutes !== undefined) cMins.value = c.minutes;

    const cSecs = document.getElementById('countdown-seconds-input');
    if (cSecs && c.seconds !== undefined) cSecs.value = c.seconds;

    const cLabel = document.getElementById('countdown-label-input');
    if (cLabel && c.label !== undefined) cLabel.value = c.label;
  }

  updateToggleBtn() {
    if (!this.toggleBtn) return;
    const textSpan = this.toggleBtn.querySelector('span') || this.toggleBtn;
    const icon = this.toggleBtn.querySelector('i');

    if (this.status === 'running') {
      textSpan.textContent = 'Pause';
      if (icon) icon.setAttribute('data-lucide', 'pause');
    } else if (this.status === 'paused') {
      if (this.mode === 'pomodoro') {
        textSpan.textContent = this.isBreak ? 'Resume Break' : 'Resume Focus';
      } else {
        textSpan.textContent = 'Resume';
      }
      if (icon) icon.setAttribute('data-lucide', 'play');
    } else {
      // idle
      if (this.mode === 'pomodoro') {
        textSpan.textContent = this.isBreak ? 'Start Break' : 'Start Focus';
      } else if (this.mode === 'short-break' || this.mode === 'long-break') {
        textSpan.textContent = 'Start Break';
      } else if (this.mode === 'countdown') {
        textSpan.textContent = 'Start Timer';
      } else {
        textSpan.textContent = 'Start';
      }
      if (icon) icon.setAttribute('data-lucide', 'play');
    }
  }

  setupEvents() {
    // Mode switcher buttons
    document.querySelectorAll('.timer-mode-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.mode;
        if (!mode) return;
        const ipc = getTimerIpc();
        if (ipc) {
          const res = await ipc.invoke('timer:switch-mode', mode);
          if (res && res.state) this.applyState(res.state);
        }
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });

    // Toggle button (Start / Pause / Resume)
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', async () => {
        const ipc = getTimerIpc();
        if (!ipc) return;
        if (this.status === 'running') {
          await ipc.invoke('timer:pause');
        } else if (this.status === 'paused') {
          await ipc.invoke('timer:resume');
        } else {
          await ipc.invoke('timer:start');
        }
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    // Reset button
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', async () => {
        const ipc = getTimerIpc();
        if (ipc) {
          const res = await ipc.invoke('timer:reset');
          if (res && res.state) this.applyState(res.state);
        }
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    // Lap button
    if (this.lapBtn) {
      this.lapBtn.addEventListener('click', async () => {
        const ipc = getTimerIpc();
        if (ipc) {
          await ipc.invoke('timer:lap');
        }
        if (window.soundEffects) window.soundEffects.playTap();
      });
    }

    // Steppers buttons [-] and [+]
    document.querySelectorAll('.timer-step-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action; // 'dec' | 'inc'
        const target = btn.dataset.target;
        this.handleStepperClick(target, action);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });

    // Direct input change listeners
    const numericInputs = [
      'pomodoro-focus-input',
      'pomodoro-short-break-input',
      'standalone-short-break-input',
      'pomodoro-long-break-input',
      'standalone-long-break-input',
      'pomodoro-sessions-input',
      'countdown-hours-input',
      'countdown-minutes-input',
      'countdown-seconds-input'
    ];

    numericInputs.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', () => this.handleDirectInputChange(el));
      el.addEventListener('blur', () => this.handleDirectInputChange(el));
    });

    // Preset chips
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const mins = parseInt(chip.dataset.mins, 10) || 5;
        const hInput = document.getElementById('countdown-hours-input');
        const mInput = document.getElementById('countdown-minutes-input');
        const sInput = document.getElementById('countdown-seconds-input');
        if (hInput) hInput.value = 0;
        if (mInput) mInput.value = mins;
        if (sInput) sInput.value = 0;
        this.saveCurrentSettings();
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });

    // Auto-start toggle
    const autostartToggle = document.getElementById('pomodoro-autostart-toggle');
    if (autostartToggle) {
      autostartToggle.addEventListener('change', () => this.saveCurrentSettings());
    }

    // Countdown label
    const labelInput = document.getElementById('countdown-label-input');
    if (labelInput) {
      labelInput.addEventListener('change', () => this.saveCurrentSettings());
      labelInput.addEventListener('blur', () => this.saveCurrentSettings());
    }

    // Reset control buttons
    document.querySelectorAll('.timer-custom-card .btn-ctrl-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const ctrl = btn.dataset.ctrl;
        this.resetControl(ctrl);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });

    // Reset section buttons
    document.querySelectorAll('.timer-custom-card .btn-reset-section').forEach(btn => {
      btn.addEventListener('click', () => {
        const sec = btn.dataset.section;
        this.resetSection(sec);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });
  }

  handleStepperClick(target, action) {
    let inputId = null;
    let min = 1, max = 180, step = 1;

    switch (target) {
      case 'pomodoro-focus':
        inputId = 'pomodoro-focus-input';
        min = 1; max = 180;
        break;
      case 'pomodoro-short-break':
        inputId = 'pomodoro-short-break-input';
        min = 1; max = 180;
        break;
      case 'standalone-short-break':
        inputId = 'standalone-short-break-input';
        min = 1; max = 180;
        break;
      case 'pomodoro-long-break':
        inputId = 'pomodoro-long-break-input';
        min = 1; max = 180;
        break;
      case 'standalone-long-break':
        inputId = 'standalone-long-break-input';
        min = 1; max = 180;
        break;
      case 'pomodoro-sessions':
        inputId = 'pomodoro-sessions-input';
        min = 1; max = 20;
        break;
      case 'countdown-hours':
        inputId = 'countdown-hours-input';
        min = 0; max = 99;
        break;
      case 'countdown-minutes':
        inputId = 'countdown-minutes-input';
        min = 0; max = 59;
        break;
      case 'countdown-seconds':
        inputId = 'countdown-seconds-input';
        min = 0; max = 59;
        break;
    }

    if (!inputId) return;
    const input = document.getElementById(inputId);
    if (!input) return;

    let val = parseInt(input.value, 10);
    if (isNaN(val)) val = min;

    if (action === 'inc') {
      val = Math.min(max, val + step);
    } else {
      val = Math.max(min, val - step);
    }

    input.value = val;
    this.saveCurrentSettings();
  }

  handleDirectInputChange(input) {
    const min = parseInt(input.min, 10) || 0;
    const max = parseInt(input.max, 10) || 180;
    let val = parseInt(input.value, 10);
    if (isNaN(val) || val < min) val = min;
    if (val > max) val = max;
    input.value = val;
    this.saveCurrentSettings();
  }

  resetControl(ctrl) {
    switch (ctrl) {
      case 'pomodoro-focus': {
        const el = document.getElementById('pomodoro-focus-input');
        if (el) el.value = 25;
        break;
      }
      case 'pomodoro-short-break':
      case 'standalone-short-break': {
        const e1 = document.getElementById('pomodoro-short-break-input');
        const e2 = document.getElementById('standalone-short-break-input');
        if (e1) e1.value = 5;
        if (e2) e2.value = 5;
        break;
      }
      case 'pomodoro-long-break':
      case 'standalone-long-break': {
        const e1 = document.getElementById('pomodoro-long-break-input');
        const e2 = document.getElementById('standalone-long-break-input');
        if (e1) e1.value = 15;
        if (e2) e2.value = 15;
        break;
      }
      case 'pomodoro-sessions': {
        const el = document.getElementById('pomodoro-sessions-input');
        if (el) el.value = 4;
        break;
      }
      case 'pomodoro-autostart': {
        const el = document.getElementById('pomodoro-autostart-toggle');
        if (el) el.checked = false;
        break;
      }
      case 'countdown-duration': {
        const h = document.getElementById('countdown-hours-input');
        const m = document.getElementById('countdown-minutes-input');
        const s = document.getElementById('countdown-seconds-input');
        if (h) h.value = 0;
        if (m) m.value = 5;
        if (s) s.value = 0;
        break;
      }
      case 'countdown-label': {
        const l = document.getElementById('countdown-label-input');
        if (l) l.value = '';
        break;
      }
    }
    this.saveCurrentSettings();
  }

  resetSection(section) {
    if (section === 'pomodoro') {
      const f = document.getElementById('pomodoro-focus-input');
      const sb = document.getElementById('pomodoro-short-break-input');
      const lb = document.getElementById('pomodoro-long-break-input');
      const s = document.getElementById('pomodoro-sessions-input');
      const a = document.getElementById('pomodoro-autostart-toggle');
      if (f) f.value = 25;
      if (sb) sb.value = 5;
      if (lb) lb.value = 15;
      if (s) s.value = 4;
      if (a) a.checked = false;
    } else if (section === 'short-break') {
      const sb = document.getElementById('standalone-short-break-input');
      if (sb) sb.value = 5;
    } else if (section === 'long-break') {
      const lb = document.getElementById('standalone-long-break-input');
      if (lb) lb.value = 15;
    } else if (section === 'countdown') {
      const h = document.getElementById('countdown-hours-input');
      const m = document.getElementById('countdown-minutes-input');
      const s = document.getElementById('countdown-seconds-input');
      const l = document.getElementById('countdown-label-input');
      if (h) h.value = 0;
      if (m) m.value = 5;
      if (s) s.value = 0;
      if (l) l.value = '';
    }
    this.saveCurrentSettings();
  }

  async saveCurrentSettings() {
    const ipc = getTimerIpc();
    if (!ipc) return;

    const focusVal = parseInt(document.getElementById('pomodoro-focus-input')?.value, 10) || 25;
    const shortBreakVal = parseInt(document.getElementById('pomodoro-short-break-input')?.value || document.getElementById('standalone-short-break-input')?.value, 10) || 5;
    const longBreakVal = parseInt(document.getElementById('pomodoro-long-break-input')?.value || document.getElementById('standalone-long-break-input')?.value, 10) || 15;
    const sessionsVal = parseInt(document.getElementById('pomodoro-sessions-input')?.value, 10) || 4;
    const autoStartVal = !!document.getElementById('pomodoro-autostart-toggle')?.checked;

    let hVal = parseInt(document.getElementById('countdown-hours-input')?.value, 10) || 0;
    let mVal = parseInt(document.getElementById('countdown-minutes-input')?.value, 10) || 0;
    let sVal = parseInt(document.getElementById('countdown-seconds-input')?.value, 10) || 0;
    const labelVal = document.getElementById('countdown-label-input')?.value || '';

    // Validation: Total seconds must be between 1s and 359999s (99h 59m 59s)
    const totalCountdownSec = (hVal * 3600) + (mVal * 60) + sVal;
    if (totalCountdownSec <= 0) {
      sVal = 1;
      const sInput = document.getElementById('countdown-seconds-input');
      if (sInput) sInput.value = 1;
    }

    const payload = {
      pomodoro: {
        focusMinutes: Math.min(180, Math.max(1, focusVal)),
        shortBreakMinutes: Math.min(180, Math.max(1, shortBreakVal)),
        longBreakMinutes: Math.min(180, Math.max(1, longBreakVal)),
        sessionsBeforeLongBreak: Math.min(20, Math.max(1, sessionsVal)),
        autoStartNext: autoStartVal
      },
      countdown: {
        hours: Math.min(99, Math.max(0, hVal)),
        minutes: Math.min(59, Math.max(0, mVal)),
        seconds: Math.min(59, Math.max(0, sVal)),
        label: String(labelVal).slice(0, 50)
      }
    };

    try {
      const res = await ipc.invoke('timer:update-settings', payload);
      if (res && res.settings) {
        this.settings = res.settings;
      }
    } catch (err) {
      console.error('[TimerTab] Error saving settings:', err);
    }
  }

  renderLaps() {
    const tbody = document.getElementById('stopwatch-laps-body');
    if (!tbody) return;

    if (!this.laps || this.laps.length === 0) {
      tbody.innerHTML = '<tr class="no-laps-row"><td colspan="3">No laps recorded yet. Press "Lap" while running.</td></tr>';
      return;
    }

    let rowsHtml = '';
    this.laps.forEach(lap => {
      rowsHtml += `
        <tr>
          <td class="mono" style="font-weight: 600;">#${lap.lapNumber}</td>
          <td class="mono">${lap.lapTime}</td>
          <td class="mono" style="opacity: 0.85;">${lap.splitTime}</td>
        </tr>
      `;
    });
    tbody.innerHTML = rowsHtml;
  }

  updateDisplay() {
    if (!this.displayEl) return;

    const s = Math.max(0, this.remainingSeconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;

    if (hrs > 0) {
      this.displayEl.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
      this.displayEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // Circular ring progress (r=88, CIRC=553)
    if (this.ringProgress) {
      const CIRC = 553;
      let frac = 0;
      if (this.mode === 'stopwatch') {
        frac = Math.min(1, (this.remainingSeconds % 3600) / 60);
      } else if (this.totalSeconds > 0) {
        frac = Math.max(0, this.remainingSeconds / this.totalSeconds);
      }
      this.ringProgress.style.strokeDashoffset = (CIRC * (1 - frac)).toFixed(2);
    }
  }
}

window.TimerTab = TimerTab;
