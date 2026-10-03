/**
 * Desktop Pet — Timer & Pomodoro Tab Controller
 * Pomodoro focus session syncs with pet's 'working' state
 */

class TimerTab {
  constructor() {
    this.displayEl = document.getElementById('timer-time-display');
    this.sublabelEl = document.getElementById('timer-sublabel');
    this.progressRingEl = document.getElementById('timer-progress-ring');
    this.toggleBtn = document.getElementById('btn-timer-toggle');
    this.resetBtn = document.getElementById('btn-timer-reset');
    this.pomodoroCountEl = document.getElementById('pomodoro-count');
    this.petStatusEl = document.getElementById('timer-pet-status');

    this.mode = 'pomodoro'; // 'pomodoro' | 'countdown' | 'stopwatch'
    this.isBreak = false;
    this.isRunning = false;
    this.totalSeconds = 25 * 60;
    this.remainingSeconds = 25 * 60;
    this.timerInterval = null;
    this.completedSessions = 0;

    // Circumference of r=72 circle is 2 * PI * 72 ~= 452.39
    this.ringCircumference = 452.39;

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
      });
    });

    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.resetBtn.addEventListener('click', () => this.reset());
  }

  switchMode(mode) {
    this.pause();
    this.mode = mode;
    if (mode === 'pomodoro') {
      this.isBreak = false;
      this.totalSeconds = 25 * 60;
      this.remainingSeconds = 25 * 60;
      this.sublabelEl.textContent = 'Focus Session';
      this.toggleBtn.textContent = 'Start Focus';
    } else if (mode === 'countdown') {
      this.totalSeconds = 10 * 60;
      this.remainingSeconds = 10 * 60;
      this.sublabelEl.textContent = 'Countdown';
      this.toggleBtn.textContent = 'Start Timer';
    } else if (mode === 'stopwatch') {
      this.remainingSeconds = 0;
      this.sublabelEl.textContent = 'Stopwatch';
      this.toggleBtn.textContent = 'Start';
    }
    this.updateDisplay();
  }

  toggle() {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.toggleBtn.textContent = 'Pause';

    if (this.mode === 'pomodoro' && !this.isBreak) {
      // Put pet into 'focus' state with determined eyes
      window.panelController.notifyPet('pet:set-state', { state: 'focus' });
      window.panelController.notifyPet('pet:show-bubble', { text: "Focus mode ON! Happy coding!", duration: 3500 });
      this.petStatusEl.textContent = 'Focused';
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
    this.toggleBtn.textContent = this.mode === 'pomodoro' ? (this.isBreak ? 'Resume Break' : 'Resume Focus') : 'Resume';
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.mode === 'pomodoro' && !this.isBreak) {
      window.panelController.notifyPet('pet:set-state', { state: 'neutral' });
      this.petStatusEl.textContent = 'Normal';
    }
  }

  reset() {
    this.pause();
    if (this.mode === 'pomodoro') {
      this.isBreak = false;
      this.totalSeconds = 25 * 60;
      this.remainingSeconds = 25 * 60;
      this.sublabelEl.textContent = 'Focus Session';
      this.toggleBtn.textContent = 'Start Focus';
    } else if (this.mode === 'countdown') {
      this.totalSeconds = 10 * 60;
      this.remainingSeconds = 10 * 60;
      this.toggleBtn.textContent = 'Start Timer';
    } else if (this.mode === 'stopwatch') {
      this.remainingSeconds = 0;
      this.toggleBtn.textContent = 'Start';
    }
    this.updateDisplay();
  }

  handleFinish() {
    this.pause();
    if (window.soundEffects) window.soundEffects.playAlarm();

    if (this.mode === 'pomodoro') {
      if (!this.isBreak) {
        this.completedSessions++;
        this.pomodoroCountEl.textContent = this.completedSessions;
        this.isBreak = true;
        this.totalSeconds = 5 * 60;
        this.remainingSeconds = 5 * 60;
        this.sublabelEl.textContent = 'Break Time';
        this.toggleBtn.textContent = 'Start Break';

        // Pet celebrates with laugh!
        window.panelController.notifyPet('pet:set-state', { state: 'laugh', duration: 5000 });
        window.panelController.notifyPet('pet:show-bubble', { text: "Focus block done! Take a 5 min break", duration: 5000 });
      } else {
        this.isBreak = false;
        this.totalSeconds = 25 * 60;
        this.remainingSeconds = 25 * 60;
        this.sublabelEl.textContent = 'Focus Session';
        this.toggleBtn.textContent = 'Start Focus';

        window.panelController.notifyPet('pet:set-state', { state: 'happy', duration: 3500 });
        window.panelController.notifyPet('pet:show-bubble', { text: "Break is over! Ready for the next sprint?", duration: 4000 });
      }
    } else {
      window.panelController.notifyPet('pet:set-state', { state: 'laugh', duration: 4000 });
      window.panelController.notifyPet('pet:show-bubble', { text: "Timer finished!", duration: 4000 });
    }
  }

  updateDisplay() {
    const mins = Math.floor(Math.abs(this.remainingSeconds) / 60);
    const secs = Math.abs(this.remainingSeconds) % 60;
    this.displayEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Ring progress calculation
    if (this.mode === 'stopwatch') {
      this.progressRingEl.style.strokeDashoffset = 0;
    } else {
      const fraction = this.remainingSeconds / this.totalSeconds;
      const offset = this.ringCircumference * (1 - fraction);
      this.progressRingEl.style.strokeDashoffset = offset;
    }
  }
}

window.TimerTab = TimerTab;
