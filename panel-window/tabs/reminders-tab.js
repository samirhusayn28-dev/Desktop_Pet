/**
 * Desktop Pet — Reminders Tab Controller
 * Sets reminders with repeat options (Once, Daily, Every Hour), snooze, inline editing,
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
    this.editingId = null;
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

    // Robust Event Delegation on listContainer — click events are never lost
    if (this.listContainer) {
      this.listContainer.addEventListener('click', (e) => {
        // Edit button
        const editBtn = e.target.closest('.reminder-edit-btn');
        if (editBtn) {
          const id = editBtn.dataset.id;
          if (id) this.startEditing(id);
          return;
        }

        // Save Edit button
        const saveEditBtn = e.target.closest('.reminder-edit-save-btn');
        if (saveEditBtn) {
          const id = saveEditBtn.dataset.id;
          if (id) this.saveEditing(id);
          return;
        }

        // Cancel Edit button
        const cancelEditBtn = e.target.closest('.reminder-edit-cancel-btn');
        if (cancelEditBtn) {
          this.cancelEditing();
          return;
        }

        // Snooze button
        const snoozeBtn = e.target.closest('.reminder-snooze-btn');
        if (snoozeBtn) {
          const id = snoozeBtn.dataset.id;
          const snoozeMinutes = (window.panelController?.store?.get('settings.behavior.snoozeMinutes')) || 5;
          if (id) this.snoozeReminder(id, snoozeMinutes);
          return;
        }

        // Delete button
        const deleteBtn = e.target.closest('.reminder-delete-btn') || e.target.closest('.todo-delete-btn');
        if (deleteBtn) {
          const id = deleteBtn.dataset.id;
          if (id) this.deleteReminder(id);
          return;
        }
      });

      this.listContainer.addEventListener('change', (e) => {
        const checkbox = e.target.closest('.todo-checkbox') || e.target.closest('.reminder-checkbox');
        if (checkbox && checkbox.dataset.id) {
          this.toggleEnabled(checkbox.dataset.id);
        }
      });

      this.listContainer.addEventListener('keydown', (e) => {
        if (this.editingId) {
          if (e.key === 'Enter' && (e.target.classList.contains('reminder-edit-title') || e.target.classList.contains('reminder-edit-time'))) {
            e.preventDefault();
            this.saveEditing(this.editingId);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            this.cancelEditing();
          }
        }
      });
    }

    if (window.panelController?.ipcRenderer) {
      window.panelController.ipcRenderer.on('reminders:changed', (e, updatedReminders) => {
        if (Array.isArray(updatedReminders) && !this.editingId) {
          this.reminders = updatedReminders;
          this.render();
        }
      });
    }
  }

  addReminder() {
    if (!this.textInput || !this.timeInput) return;
    const text = this.textInput.value.trim();
    const time = this.timeInput.value;
    const repeat = this.repeatSelect ? this.repeatSelect.value : 'once';

    if (!text || !time) return;

    const newReminder = {
      id: Date.now().toString(),
      title: text,
      time: time,
      repeat: repeat,
      enabled: true,
      lastTriggered: null
    };

    this.reminders.push(newReminder);
    this.textInput.value = '';
    this.saveReminders();
    this.render();

    if (window.soundEffects) window.soundEffects.playTap();
    if (window.panelController?.ipcRenderer) {
      window.panelController.ipcRenderer.send('reminders:updated');
    }
  }

  startEditing(id) {
    this.editingId = id;
    this.render();

    // Auto-focus and select the title input in the newly rendered inline edit form
    setTimeout(() => {
      const titleInput = this.listContainer.querySelector(`.reminder-edit-title[data-id="${id}"]`);
      if (titleInput) {
        titleInput.focus();
        titleInput.select();
      }
    }, 50);

    if (window.soundEffects) window.soundEffects.playTap();
  }

  saveEditing(id) {
    const item = this.reminders.find(r => r.id === id);
    if (!item) {
      this.editingId = null;
      this.render();
      return;
    }

    const titleInput = this.listContainer.querySelector(`.reminder-edit-title[data-id="${id}"]`);
    const timeInput = this.listContainer.querySelector(`.reminder-edit-time[data-id="${id}"]`);
    const repeatSelect = this.listContainer.querySelector(`.reminder-edit-repeat[data-id="${id}"]`);

    const newTitle = titleInput ? titleInput.value.trim() : '';
    const newTime = timeInput ? timeInput.value.trim() : '';
    const newRepeat = repeatSelect ? repeatSelect.value : 'once';

    if (!newTitle || !newTime) return;

    item.title = newTitle;
    item.time = newTime;
    item.repeat = newRepeat;
    item.enabled = true; // Editing re-enables the reminder
    item.lastTriggered = null; // Reschedule for next match

    this.editingId = null;
    this.saveReminders();
    this.render();

    if (window.soundEffects) window.soundEffects.playTap();

    if (window.panelController?.ipcRenderer) {
      window.panelController.ipcRenderer.send('reminders:reschedule', id);
      window.panelController.ipcRenderer.send('reminders:updated');
    }
  }

  cancelEditing() {
    this.editingId = null;
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();
  }

  toggleEnabled(id) {
    const item = this.reminders.find(r => r.id === id);
    if (item) {
      item.enabled = !item.enabled;
      if (item.enabled) {
        item.lastTriggered = null; // reset triggered flag if user re-enables
      }
      this.saveReminders();
      this.render();
      if (window.soundEffects) window.soundEffects.playTap();

      if (window.panelController?.ipcRenderer) {
        window.panelController.ipcRenderer.send('reminders:updated');
      }
    }
  }

  snoozeReminder(id, minutes) {
    const snoozeMinutes = minutes || (window.panelController?.store?.get('settings.behavior.snoozeMinutes')) || 5;

    if (window.panelController?.ipcRenderer) {
      window.panelController.ipcRenderer.send('reminders:snooze', { id, minutes: snoozeMinutes });
    }

    const item = this.reminders.find(r => r.id === id || String(r.id) === String(id));
    if (item) {
      const now = new Date();
      const todayDateStr = now.toDateString();
      const [rh, rm] = (item.time || '00:00').split(':').map(Number);
      const remMinutes = (rh || 0) * 60 + (rm || 0);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const isAlreadyFired = !item.enabled ||
        (item.lastTriggered && String(item.lastTriggered).includes(todayDateStr)) ||
        (remMinutes <= currentMinutes);

      let newH, newM;
      if (isAlreadyFired) {
        const targetDate = new Date(now.getTime() + snoozeMinutes * 60000);
        newH = String(targetDate.getHours()).padStart(2, '0');
        newM = String(targetDate.getMinutes()).padStart(2, '0');
      } else {
        const totalMins = (remMinutes + snoozeMinutes) % 1440;
        newH = String(Math.floor(totalMins / 60)).padStart(2, '0');
        newM = String(totalMins % 60).padStart(2, '0');
      }

      item.time = `${newH}:${newM}`;
      item.enabled = true;
      item.lastTriggered = null;

      this.saveReminders();
      this.render();

      if (window.soundEffects) window.soundEffects.playTap();

      if (!isAlreadyFired) {
        window.panelController.notifyPet('pet:show-bubble', {
          badge: 'SNOOZED',
          text: `Snoozed "${item.title}" for ${snoozeMinutes} min (${item.time})`,
          duration: 3500,
          emotion: 'wink'
        });
      }
    }
  }

  updateSnoozeButtons(snoozeMinutes) {
    const mins = parseInt(snoozeMinutes, 10) || 5;
    if (!this.listContainer) return;
    const buttons = this.listContainer.querySelectorAll('.reminder-snooze-btn');
    buttons.forEach(btn => {
      btn.title = `Snooze ${mins} minutes`;
      const span = btn.querySelector('span');
      if (span) span.textContent = `+${mins}m`;
    });
  }

  deleteReminder(id) {
    this.reminders = this.reminders.filter(r => r.id !== id);
    if (this.editingId === id) this.editingId = null;
    this.saveReminders();
    this.render();
    if (window.soundEffects) window.soundEffects.playTap();

    if (window.panelController?.ipcRenderer) {
      window.panelController.ipcRenderer.send('reminders:updated');
    }
  }

  startChecker() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.checkInterval = setInterval(() => {
      // Do not interrupt user while actively editing inline!
      if (this.editingId) return;

      const latest = window.panelController?.store?.get('reminders') || [];
      if (JSON.stringify(latest) !== JSON.stringify(this.reminders)) {
        this.reminders = latest;
        this.render();
      }
    }, 4000);
  }

  render() {
    if (!this.listContainer) return;
    this.listContainer.innerHTML = '';

    if (this.reminders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tab-empty-state';
      empty.innerHTML = `
        <div class="empty-pet-face-wrap">
          <svg class="empty-pet-face-svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="4" y="6" width="40" height="36" rx="14" fill="var(--accent-soft)" stroke="var(--accent-border)" stroke-width="1.5"/>
            <circle cx="17" cy="22" r="3" fill="var(--accent)"/>
            <circle cx="31" cy="22" r="3" fill="var(--accent)"/>
            <path d="M20 28 Q24 32 28 28" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" fill="none"/>
          </svg>
        </div>
        <span class="empty-title">No reminders set</span>
        <span class="empty-subtitle">Create a reminder above to stay on track!</span>
      `;
      this.listContainer.appendChild(empty);
      if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
        window.panelController.refreshIcons();
      }
      return;
    }

    const snoozeMins = (window.panelController?.store?.get('settings.behavior.snoozeMinutes')) || 5;

    const renderCard = (r) => {
      const item = document.createElement('div');
      const isEditing = this.editingId === r.id;

      if (isEditing) {
        item.className = 'reminder-item editing';
        item.dataset.id = r.id;
        item.innerHTML = `
          <div class="reminder-edit-form">
            <input type="text" class="terminal-input reminder-edit-title" data-id="${r.id}" value="${r.title.replace(/"/g, '&quot;')}" placeholder="Reminder title">
            <div class="reminder-edit-inputs-row">
              <input type="time" class="terminal-input mono reminder-edit-time" data-id="${r.id}" value="${r.time}">
              <select class="terminal-select reminder-edit-repeat" data-id="${r.id}">
                <option value="once" ${r.repeat === 'once' ? 'selected' : ''}>Once</option>
                <option value="daily" ${r.repeat === 'daily' ? 'selected' : ''}>Daily</option>
                <option value="every-hour" ${r.repeat === 'every-hour' ? 'selected' : ''}>Every Hour</option>
              </select>
            </div>
            <div class="reminder-edit-actions-row">
              <button class="reminder-edit-cancel-btn" data-id="${r.id}" title="Cancel editing">
                <i data-lucide="x"></i>
                <span>Cancel</span>
              </button>
              <button class="reminder-edit-save-btn" data-id="${r.id}" title="Save reminder">
                <i data-lucide="check"></i>
                <span>Save</span>
              </button>
            </div>
          </div>
        `;
      } else {
        item.className = `reminder-item ${r.enabled ? 'active' : 'disabled'}`;
        item.dataset.id = r.id;
        item.innerHTML = `
          <div class="reminder-left">
            <div class="reminder-bell-icon">
              <i data-lucide="${r.enabled ? 'bell' : 'check'}"></i>
            </div>
            <div class="reminder-info">
              <div class="reminder-title">${r.title}</div>
              <div class="reminder-meta">
                <span class="reminder-time-badge mono"><i data-lucide="clock"></i> ${r.time}</span>
                <span class="reminder-repeat-badge">${r.repeat}</span>
              </div>
            </div>
          </div>
          <div class="reminder-item-actions">
            <button class="reminder-snooze-btn" data-id="${r.id}" title="Snooze ${snoozeMins} minutes">
              <i data-lucide="alarm-clock"></i>
              <span>+${snoozeMins}m</span>
            </button>
            <button class="reminder-edit-btn" data-id="${r.id}" title="Edit reminder">
              <i data-lucide="edit-3"></i>
            </button>
            <input type="checkbox" class="todo-checkbox reminder-checkbox" data-id="${r.id}" ${r.enabled ? 'checked' : ''} title="Toggle active">
            <button class="todo-delete-btn reminder-delete-btn" data-id="${r.id}" title="Delete reminder"><i data-lucide="trash-2"></i></button>
          </div>
        `;
      }
      return item;
    };

    const upcoming = this.reminders.filter(r => r.enabled);
    const done = this.reminders.filter(r => !r.enabled);

    if (upcoming.length > 0) {
      const upHeader = document.createElement('div');
      upHeader.className = 'reminders-group-heading';
      upHeader.innerHTML = `<i data-lucide="calendar"></i><span>Upcoming</span><span class="group-count-pill">${upcoming.length}</span>`;
      this.listContainer.appendChild(upHeader);
      upcoming.forEach(r => this.listContainer.appendChild(renderCard(r)));
    }

    if (done.length > 0) {
      const doneHeader = document.createElement('div');
      doneHeader.className = 'reminders-group-heading done';
      doneHeader.innerHTML = `<i data-lucide="check-check"></i><span>Done</span><span class="group-count-pill">${done.length}</span>`;
      this.listContainer.appendChild(doneHeader);
      done.forEach(r => this.listContainer.appendChild(renderCard(r)));
    }

    if (window.panelController && typeof window.panelController.refreshIcons === 'function') {
      window.panelController.refreshIcons();
    }
  }
}

window.RemindersTab = RemindersTab;
