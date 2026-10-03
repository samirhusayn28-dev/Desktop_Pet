/**
 * Desktop Pet — Timer & Pomodoro Tab Controller
 * Pomodoro focus session syncs with pet's 'focus' state
 * Supports: Pomodoro (25m), Short Break (5m), Long Break (15m), Countdown, Stopwatch
 * Natural user-name speech bubbles and pet emotional reactions
 */

class TimerTab {
  constructor() {
    this.displayEl = document.getElementById('timer-time-display') || document.getElementById('timer-display-digits');
    this.sublabelEl = document.getElementById('timer-sublabel') || document.getElementById('timer-state-label');
    this.toggleBtn = document.getElementById('btn-timer-toggle') || document.getElementById('btn-timer-start');
    this.resetBtn = document.getElementById('btn-timer-reset');
    this.pomodoroCountEl = document.getElementById('pomodoro-count');
    this.petStatusEl = document.getElementById('timer-pet-status');

    this.mode = 'pomodoro'; // 'pomodoro' | 'short-break' | 'long-break' | 'countdown' | 'stopwatch'
    this.isBreak = false;
    this.isRunning = false;
    this.totalSeconds = 25 * 60;
    this.remainingSeconds = 25 * 60;
    this.timerInterval = null;
    this.completedSessions = 0;

    this.init();
  }

  init() {
    this.setupEvents();
    this.updateDisplay();
  }

  setupEvents() {
    document.querySelectorAll('.timer-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchMode(btn.dataset.mode);
        if (window.soundEffects) window.soundEffects.playTap();
      });
    });

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => this.reset());
    }
  }

  switchMode(mode) {
    this.pause();
    this.mode = mode;
    if (mode === 'pomodoro') {
      this.isBreak = false;
      this.totalSeconds = 25 * 60;
      this.remainingSeconds = 25 * 60;
      if (this.sublabelEl) this.sublabelEl.textContent = 'FOCUS SESSION';
      this.setToggleText('Start Focus');
    } else if (mode === 'short-break') {
      this.isBreak = true;
      this.totalSeconds = 5 * 60;
      this.remainingSeconds = 5 * 60;
      if (this.sublabelEl) this.sublabelEl.textContent = 'SHORT BREAK';
      this.setToggleText('Start Break');
    } else if (mode === 'long-break') {
      this.isBreak = true;
      this.totalSeconds = 15 * 60;
      this.remainingSeconds = 15 * 60;
      if (this.sublabelEl) this.sublabelEl.textContent = 'LONG BREAK';
      this.setToggleText('Start Break');
    } else if (mode === 'countdown') {
      this.totalSeconds = 10 * 60;
      this.remainingSeconds = 10 * 60;
      if (this.sublabelEl) this.sublabelEl.textContent = 'COUNTDOWN';
      this.setToggleText('Start Timer');
    } else if (mode === 'stopwatch') {
      this.remainingSeconds = 0;
      this.totalSeconds = 0;
      if (this.sublabelEl) this.sublabelEl.textContent = 'STOPWATCH';
      this.setToggleText('Start');
    }
    this.updateDisplay();
  }

  setToggleText(text) {
    if (!this.toggleBtn) return;
    const span = this.toggleBtn.querySelector('span') || this.toggleBtn;
    span.textContent = text;
    const icon = this.toggleBtn.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', this.isRunning ? 'pause' : 'play');
      if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
        window.panelController.refreshIcons();
      }
    }
  }

  toggle() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
    if (window.soundEffects) window.soundEffects.playTap();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.setToggleText('Pause');

    const name = (window.panelController && window.panelController.store ? window.panelController.store.get('settings.general.userName') : '') || '';

    if (this.mode === 'pomodoro' && !this.isBreak) {
      window.panelController.notifyPet('pet:set-state', { state: 'focus' });
      const focusMsg = name ? `Focus mode ON, ${name}! Happy coding!` : 'Focus mode ON! Happy coding!';
      window.panelController.notifyPet('pet:show-bubble', { text: focusMsg, duration: 3500, emotion: 'focus', badge: 'FOCUS' });
    }

    this.timerInterval = setInterval(() => {
      if (this.mode === 'stopwatch') {
        this.remainingSeconds++;
      } else {
        this.remainingSeconds--;
        if (this.remainingSeconds <= 0) {
          this.handleFinish();
        }
      }
      this.updateDisplay();
    }, 1000);
  }

  pause() {
    this.isRunning = false;
    const resumeLabel = this.mode === 'pomodoro' ? (this.isBreak ? 'Resume Break' : 'Resume Focus') : 'Resume';
    this.setToggleText(resumeLabel);
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.mode === 'pomodoro' && !this.isBreak) {
      window.panelController.notifyPet('pet:set-state', { state: 'neutral' });
    }
  }

  reset() {
    this.pause();
    if (this.mode === 'pomodoro') {
      this.isBreak = false;
      this.totalSeconds = 25 * 60;
      this.remainingSeconds = 25 * 60;
      this.setToggleText('Start Focus');
      if (this.sublabelEl) this.sublabelEl.textContent = 'FOCUS SESSION';
    } else if (this.mode === 'short-break') {
      this.totalSeconds = 5 * 60;
      this.remainingSeconds = 5 * 60;
      this.setToggleText('Start Break');
      if (this.sublabelEl) this.sublabelEl.textContent = 'SHORT BREAK';
    } else if (this.mode === 'long-break') {
      this.totalSeconds = 15 * 60;
      this.remainingSeconds = 15 * 60;
      this.setToggleText('Start Break');
      if (this.sublabelEl) this.sublabelEl.textContent = 'LONG BREAK';
    } else if (this.mode === 'countdown') {
      this.totalSeconds = 10 * 60;
      this.remainingSeconds = 10 * 60;
      this.setToggleText('Start Timer');
      if (this.sublabelEl) this.sublabelEl.textContent = 'COUNTDOWN';
    } else if (this.mode === 'stopwatch') {
      this.remainingSeconds = 0;
      this.setToggleText('Start');
      if (this.sublabelEl) this.sublabelEl.textContent = 'STOPWATCH';
    }
    this.updateDisplay();
    if (window.soundEffects) window.soundEffects.playTap();
  }

  handleFinish() {
    this.pause();
    if (window.soundEffects) window.soundEffects.playAlarm();

    const name = (window.panelController && window.panelController.store ? window.panelController.store.get('settings.general.userName') : '') || '';

    if (this.mode === 'pomodoro') {
      if (!this.isBreak) {
        this.completedSessions++;
        if (this.pomodoroCountEl) this.pomodoroCountEl.textContent = this.completedSessions;
        this.isBreak = true;
        this.totalSeconds = 5 * 60;
        this.remainingSeconds = 5 * 60;
        if (this.sublabelEl) this.sublabelEl.textContent = 'SHORT BREAK';
        this.setToggleText('Start Break');

        // Pet celebrates with laugh!
        window.panelController.notifyPet('pet:set-state', { state: 'laugh', duration: 5000 });
        const breakMsg = name ? `Great focus session, ${name}! Time for a 5-min break.` : 'Focus block done! Take a 5-min break.';
        window.panelController.notifyPet('pet:show-bubble', { badge: 'POMODORO COMPLETE', text: breakMsg, duration: 6000, sound: 'alarm', emotion: 'laugh' });
      } else {
        this.isBreak = false;
        this.totalSeconds = 25 * 60;
        this.remainingSeconds = 25 * 60;
        if (this.sublabelEl) this.sublabelEl.textContent = 'FOCUS SESSION';
        this.setToggleText('Start Focus');

        window.panelController.notifyPet('pet:set-state', { state: 'happy', duration: 3500 });
        const resumeMsg = name ? `Break is over, ${name}! Ready for the next sprint?` : 'Break is over! Ready for the next sprint?';
        window.panelController.notifyPet('pet:show-bubble', { badge: 'BREAK FINISHED', text: resumeMsg, duration: 5000, sound: 'chirp', emotion: 'happy' });
      }
    } else {
      window.panelController.notifyPet('pet:set-state', { state: 'laugh', duration: 4000 });
      const finishMsg = name ? `Timer finished, ${name}!` : 'Timer finished!';
      window.panelController.notifyPet('pet:show-bubble', { badge: 'TIMER DONE', text: finishMsg, duration: 5000, sound: 'alarm', emotion: 'laugh' });
    }
  }

  updateDisplay() {
    if (!this.displayEl) return;
    const mins = Math.floor(Math.abs(this.remainingSeconds) / 60);
    const secs = Math.abs(this.remainingSeconds) % 60;
    this.displayEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

window.TimerTab = TimerTab;
