/**
 * Desktop Pet — Reminders Tab Controller
 * Sets reminders with repeat options (Once, Daily, Every Hour), snooze, editing,
 * persistent store, audio alerts, and natural user-name speech bubbles.
 */

class RemindersTab {
  constructor() {
    this.listContainer = document.getElementById('reminders-list') || document.getElementById('reminders-items-list');
    this.textInput = document.getElementById('reminder-text-input') || document.getElementById('reminder-title-input');
    this.timeInput = document.getElementById('reminder-time-input');
    this.repeatSelect = document.getElementById('reminder-repeat-select');
    this.saveBtn = document.getElementById('btn-save-reminder') || document.getElementById('btn-add-reminder');

    this.reminders = [];
    this.checkInterval = null;

    this.init();
  }

  init() {
    // Set default time to next hour
    const now = new Date();
    now.setHours(now.getHours() + 1);
    if (this.timeInput) {
      this.timeInput.value = `${now.getHours().toString().padStart(2, '0')}:00`;
    }

    this.loadReminders();
    this.setupEvents();
    this.startChecker();
  }

  loadReminders() {
    if (!window.panelController) return;
    this.reminders = window.panelController.store.get('reminders') || [];
    this.render();
  }

  saveReminders() {
    if (!window.panelController) return;
    window.panelController.store.set('reminders', this.reminders);
  }

  setupEvents() {
    if (this.saveBtn) {
      this.saveBtn.addEventListener('click', () => this.addReminder());
    }
    if (this.textInput) {
      this.textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.addReminder();
      });
    }
  }

  addReminder() {
    if (!this.textInput || !this.timeInput) return;
    const text = this.textInput.value.trim();
    const time = this.timeInput.value;
    const repeat = this.repeatSelect ? this.repeatSelect.value : 'once';

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
      if (window.soundEffects) window.soundEffects.playTap();
    }
  }

  snoozeReminder(id, minutes = 5) {
    const item = this.reminders.find(r => r.id === id);
    if (item) {
      const now = new Date();
      now.setMinutes(now.getMinutes() + minutes);
      const hours = now.getHours().toString().padStart(2, '0');
      const mins = now.getMinutes().toString().padStart(2, '0');
      item.time = `${hours}:${mins}`;
      item.enabled = true;
      item.lastTriggered = null;
      this.saveReminders();
      this.render();
      if (window.soundEffects) window.soundEffects.playTap();
      window.panelController.notifyPet('pet:show-bubble', {
        badge: 'SNOOZED',
        text: `Snoozed "${item.title}" for ${minutes} mins (${item.time})`,
        duration: 3500,
        emotion: 'wink'
      });
    }
  }

  editReminder(id) {
    const item = this.reminders.find(r => r.id === id);
    if (!item) return;

    const newTitle = prompt('Edit reminder title:', item.title);
    if (newTitle !== null && newTitle.trim()) {
      item.title = newTitle.trim();
      const newTime = prompt('Edit reminder time (HH:MM):', item.time);
      if (newTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(newTime.trim())) {
        item.time = newTime.trim();
      }
      this.saveReminders();
      this.render();
    }
  }

  deleteReminder(id) {
    this.reminders = this.reminders.filter(r => r.id !== id);
    this.saveReminders();
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();
  }

  startChecker() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      this.checkDueReminders();
    }, 15000); // Check every 15 seconds
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
        const targetMin = (r.time || '00:00').split(':')[1];
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
    // Pet pops out with natural speech bubble addressing user by name
    const name = (window.panelController.store.get('settings.general.userName') || '').trim();
    const alertText = name ? `Hey ${name}, time for: ${reminder.title}!` : `Time for: ${reminder.title}!`;

    window.panelController.notifyPet('pet:set-state', { state: 'happy', duration: 7000 });
    window.panelController.notifyPet('pet:show-bubble', {
      badge: 'REMINDER',
      text: alertText,
      duration: 8000,
      sound: 'alarm',
      emotion: 'happy'
    });
  }

  render() {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = '';

    if (this.reminders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tab-empty-state';
      empty.innerHTML = `
        <i data-lucide="bell-off"></i>
        <span class="empty-title">No reminders set</span>
        <span class="empty-subtitle">Create a reminder above to stay on track!</span>
      `;
      this.listContainer.appendChild(empty);
      if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
        window.panelController.refreshIcons();
      }
      return;
    }

    this.reminders.forEach(r => {
      const item = document.createElement('div');
      item.className = `reminder-item ${r.enabled ? 'active' : 'disabled'}`;
      item.innerHTML = `
        <div class="reminder-info">
          <div class="reminder-title">${r.title}</div>
          <div class="reminder-meta">
            <span class="reminder-time-badge mono"><i data-lucide="clock"></i> ${r.time}</span>
            <span class="reminder-repeat-badge">${r.repeat}</span>
          </div>
        </div>
        <div class="reminder-item-actions">
          <button class="reminder-snooze-btn" title="Snooze 5 minutes">
            <i data-lucide="alarm-clock"></i>
            <span>+5m</span>
          </button>
          <button class="reminder-edit-btn" title="Edit reminder">
            <i data-lucide="edit-3"></i>
          </button>
          <input type="checkbox" class="todo-checkbox" ${r.enabled ? 'checked' : ''} title="Toggle active">
          <button class="todo-delete-btn" title="Delete reminder"><i data-lucide="trash-2"></i></button>
        </div>
      `;

      item.querySelector('.todo-checkbox').addEventListener('change', () => {
        this.toggleEnabled(r.id);
      });

      item.querySelector('.reminder-snooze-btn').addEventListener('click', () => {
        this.snoozeReminder(r.id, 5);
      });

      item.querySelector('.reminder-edit-btn').addEventListener('click', () => {
        this.editReminder(r.id);
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
