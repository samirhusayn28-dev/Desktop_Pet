/**
 * Desktop Pet — Reminders Tab Controller
 * Sets reminders with repeat options, triggers pet speech bubbles & audio alerts
 */

class RemindersTab {
  constructor() {
    this.listContainer = document.getElementById('reminders-list');
    this.textInput = document.getElementById('reminder-text-input');
    this.timeInput = document.getElementById('reminder-time-input');
    this.repeatSelect = document.getElementById('reminder-repeat-select');
    this.saveBtn = document.getElementById('btn-save-reminder');

    this.reminders = [];
    this.checkInterval = null;

    this.init();
  }

  init() {
    // Set default time to next hour
    const now = new Date();
    now.setHours(now.getHours() + 1);
    this.timeInput.value = `${now.getHours().toString().padStart(2, '0')}:00`;

    this.loadReminders();
    this.setupEvents();
    this.startChecker();
  }

  loadReminders() {
    if (!window.panelController) return;
    this.reminders = window.panelController.store.get('reminders') || [
      { id: '1', title: 'Drink water', time: '15:00', repeat: 'every-hour', enabled: true },
      { id: '2', title: 'Stand up & stretch', time: '16:00', repeat: 'daily', enabled: true }
    ];
    this.render();
  }

  saveReminders() {
    if (!window.panelController) return;
    window.panelController.store.set('reminders', this.reminders);
  }

  setupEvents() {
    this.saveBtn.addEventListener('click', () => this.addReminder());
  }

  addReminder() {
    const text = this.textInput.value.trim();
    const time = this.timeInput.value;
    const repeat = this.repeatSelect.value;

    if (!text || !time) return;

    this.reminders.push({
      id: Date.now().toString(),
      title: text,
      time: time,
      repeat: repeat,
      enabled: true,
      lastTriggered: null
    });

    this.textInput.value = '';
    this.saveReminders();
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();
  }

  toggleEnabled(id) {
    const item = this.reminders.find(r => r.id === id);
    if (item) {
      item.enabled = !item.enabled;
      this.saveReminders();
      this.render();
    }
  }

  deleteReminder(id) {
    this.reminders = this.reminders.filter(r => r.id !== id);
    this.saveReminders();
    this.render();
  }

  startChecker() {
    this.checkInterval = setInterval(() => {
      this.checkDueReminders();
    }, 20000); // Check every 20 seconds
  }

  checkDueReminders() {
    const now = new Date();
    const currentHours = now.getHours().toString().padStart(2, '0');
    const currentMins = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMins}`;
    const todayDateStr = now.toDateString();

    this.reminders.forEach(r => {
      if (!r.enabled) return;

      let isDue = false;
      if (r.repeat === 'every-hour') {
        const targetMin = r.time.split(':')[1];
        if (currentMins === targetMin && r.lastTriggered !== `${todayDateStr}-${currentHours}`) {
          isDue = true;
          r.lastTriggered = `${todayDateStr}-${currentHours}`;
        }
      } else {
        if (r.time === currentTimeStr && r.lastTriggered !== todayDateStr) {
          isDue = true;
          r.lastTriggered = todayDateStr;
          if (r.repeat === 'once') {
            r.enabled = false;
          }
        }
      }

      if (isDue) {
        this.triggerAlert(r);
      }
    });

    this.saveReminders();
  }

  triggerAlert(reminder) {
    if (window.soundEffects) window.soundEffects.playAlarm();
    // Pet pops out with speech bubble
    window.panelController.notifyPet('pet:set-state', { state: 'happy', duration: 6000 });
    window.panelController.notifyPet('pet:show-bubble', { 
      text: `Reminder: ${reminder.title}!`, 
      duration: 7000 
    });
  }

  render() {
    this.listContainer.innerHTML = '';
    this.reminders.forEach(r => {
      const item = document.createElement('div');
      item.className = 'reminder-item';
      item.innerHTML = `
        <div class="reminder-info">
          <div class="reminder-title">${r.title}</div>
          <div class="reminder-meta">${r.time} • ${r.repeat}</div>
        </div>
        <div class="reminder-item-actions">
          <input type="checkbox" class="todo-checkbox" ${r.enabled ? 'checked' : ''} title="Toggle active">
          <button class="todo-delete-btn" title="Delete"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      item.querySelector('.todo-checkbox').addEventListener('change', () => {
        this.toggleEnabled(r.id);
      });

      item.querySelector('.todo-delete-btn').addEventListener('click', () => {
        this.deleteReminder(r.id);
      });

      this.listContainer.appendChild(item);
    });

    if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
      window.panelController.refreshIcons();
    }
  }
}

window.RemindersTab = RemindersTab;
