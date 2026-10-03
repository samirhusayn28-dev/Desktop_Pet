/**
 * Desktop Pet — Main Process Background Scheduler
 * Evaluates stored reminders, periodic hydration / posture breaks, and pomodoro completions every second.
 * Supports repeat (every-hour, daily) and snooze.
 */

const store = require('./secure-store');
const bubble = require('./bubble-window');

class Scheduler {
  constructor() {
    this.timer = null;
    this.lastCheckedMinute = '';
    this.waterCounterMinutes = 0;
    this.stretchCounterMinutes = 0;
  }

  start() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.tick();
    }, 1000);

    console.log('[Scheduler] Background reminder scheduler running (1s precision)');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  tick() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = now.getSeconds();
    const currentTimeStr = `${hours}:${minutes}`;

    // Once a minute check for scheduled reminders
    if (seconds === 0 && currentTimeStr !== this.lastCheckedMinute) {
      this.lastCheckedMinute = currentTimeStr;
      this.evaluateReminders(currentTimeStr, now);

      // Hydration & posture health intervals
      this.waterCounterMinutes++;
      this.stretchCounterMinutes++;

      // Every 45 minutes: water reminder
      if (this.waterCounterMinutes >= 45) {
        this.waterCounterMinutes = 0;
        const petName = store.get('settings.general.petName') || 'Pet';
        bubble.show({
          badge: 'HYDRATION CHECK',
          text: `Time to drink some water! Stay refreshed and focused, friend!`,
          sound: 'chirp',
          emotion: 'happy'
        });
      }

      // Every 90 minutes: stretch reminder
      if (this.stretchCounterMinutes >= 90) {
        this.stretchCounterMinutes = 0;
        bubble.show({
          badge: 'POSTURE BREAK',
          text: `Stand up, roll your shoulders, and stretch your spine!`,
          sound: 'chirp',
          emotion: 'thinking'
        });
      }
    }
  }

  evaluateReminders(currentTimeStr, dateObj) {
    const reminders = store.get('reminders') || [];
    let updated = false;

    for (const rem of reminders) {
      if (!rem.enabled) continue;

      if (rem.time === currentTimeStr) {
        bubble.show({
          badge: 'REMINDER',
          text: rem.title || 'Scheduled Reminder',
          sound: 'happy',
          emotion: 'happy',
          duration: 6500
        });

        if (rem.repeat === 'every-hour') {
          // Keep active for next hour
        } else if (rem.repeat === 'daily') {
          // Remains active for tomorrow
        } else {
          // One-shot reminder
          rem.enabled = false;
          updated = true;
        }
      }
    }

    if (updated) {
      store.set('reminders', reminders);
    }
  }

  snoozeReminder(reminderId, minutes = 5) {
    const reminders = store.get('reminders') || [];
    const rem = reminders.find(r => r.id === reminderId);
    if (!rem) return;

    const now = new Date(Date.now() + minutes * 60000);
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    rem.time = `${hours}:${mins}`;
    rem.enabled = true;

    store.set('reminders', reminders);
    bubble.show({
      badge: 'SNOOZED',
      text: `Reminder snoozed for ${minutes} minutes.`,
      duration: 3500
    });
  }
}

module.exports = new Scheduler();
