/**
 * Desktop Pet — Main Process Background Scheduler
 * Evaluates stored reminders, periodic hydration / posture breaks, and pomodoro completions every second.
 * Supports repeat (every-hour, daily) and snooze.
 * 100% independent of panel window: works with panel closed, asleep, and on app restart.
 */

const path = require('path');
const fs = require('fs');
const { powerMonitor } = require('electron');
const store = require('./secure-store');
const bubble = require('./bubble-window');

class Scheduler {
  constructor() {
    this.timer = null;
    this.lastCheckedMinute = '';
    this.waterCounterMinutes = 0;
    this.stretchCounterMinutes = 0;
    this.setupPowerEvents();
  }

  setupPowerEvents() {
    try {
      if (powerMonitor) {
        powerMonitor.on('resume', () => {
          setTimeout(() => this.checkMissedReminders(), 2000);
        });
      }
    } catch (e) {}
  }

  start() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.tick();
    }, 1000);

    // Initial check for missed reminders after startup
    setTimeout(() => this.checkMissedReminders(), 1500);

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
    const currentTimeStr = `${hours}:${minutes}`;

    if (currentTimeStr !== this.lastCheckedMinute) {
      this.lastCheckedMinute = currentTimeStr;
      this.evaluateReminders(currentTimeStr, now);

      // Hydration & posture health intervals
      this.waterCounterMinutes++;
      this.stretchCounterMinutes++;

      // Every 45 minutes: water reminder
      if (this.waterCounterMinutes >= 45) {
        this.waterCounterMinutes = 0;
        const userName = (store.get('settings.general.userName') || '').trim();
        const text = userName ? `Time to drink some water, ${userName}! Stay refreshed and focused!` : `Time to drink some water! Stay refreshed and focused, friend!`;
        bubble.show({
          badge: 'HYDRATION CHECK',
          text,
          sound: 'chirp',
          category: 'reminders',
          emotion: 'happy'
        });
      }

      // Every 90 minutes: stretch reminder
      if (this.stretchCounterMinutes >= 90) {
        this.stretchCounterMinutes = 0;
        const userName = (store.get('settings.general.userName') || '').trim();
        const text = userName ? `Stand up and stretch, ${userName}! Roll your shoulders and look away from the screen.` : `Stand up, roll your shoulders, and stretch your spine!`;
        bubble.show({
          badge: 'POSTURE BREAK',
          text,
          sound: 'chirp',
          category: 'reminders',
          emotion: 'thinking'
        });
      }
    }
  }

  triggerReminder(rem, isMissed = false) {
    const userName = (store.get('settings.general.userName') || '').trim();
    const title = rem.title || 'Scheduled Reminder';
    const text = isMissed
      ? (userName ? `${userName}, you missed reminder: ${title}!` : `Missed reminder: ${title}!`)
      : (userName ? `Hey ${userName}, time for: ${title}!` : `Time for: ${title}!`);

    // Pet reacts: surprised + bounce + solid speech bubble
    bubble.show({
      badge: isMissed ? 'MISSED REMINDER' : 'REMINDER',
      text,
      sound: 'alarm',
      category: 'reminders',
      emotion: isMissed ? 'worried' : 'surprised',
      bounce: true,
      duration: 7000,
      critical: true
    });
  }

  evaluateReminders(currentTimeStr, dateObj) {
    const reminders = store.get('reminders') || [];
    let updated = false;
    const todayDateStr = dateObj.toDateString();
    const currentHours = String(dateObj.getHours()).padStart(2, '0');
    const currentMins = String(dateObj.getMinutes()).padStart(2, '0');

    for (const rem of reminders) {
      if (!rem.enabled) continue;

      let isDue = false;

      if (rem.repeat === 'every-hour') {
        const targetMin = (rem.time || '00:00').split(':')[1];
        const hourTriggerKey = `${todayDateStr}-${currentHours}`;
        if (currentMins === targetMin && rem.lastTriggered !== hourTriggerKey) {
          isDue = true;
          rem.lastTriggered = hourTriggerKey;
          updated = true;
        }
      } else if (rem.repeat === 'daily') {
        if (rem.time === currentTimeStr && rem.lastTriggered !== todayDateStr) {
          isDue = true;
          rem.lastTriggered = todayDateStr;
          updated = true;
        }
      } else {
        // Repeat: 'once'
        if (rem.time === currentTimeStr && rem.lastTriggered !== todayDateStr) {
          isDue = true;
          rem.lastTriggered = todayDateStr;
          rem.enabled = false;
          updated = true;
        }
      }

      if (isDue) {
        this.triggerReminder(rem, false);
      }
    }

    if (updated) {
      store.set('reminders', reminders);
    }
  }

  checkMissedReminders() {
    const reminders = store.get('reminders') || [];
    let updated = false;
    const now = new Date();
    const todayDateStr = now.toDateString();
    const currentHours = now.getHours();
    const currentMins = now.getMinutes();
    const currentTotalMins = currentHours * 60 + currentMins;

    for (const rem of reminders) {
      if (!rem.enabled) continue;

      const [rHours, rMins] = (rem.time || '00:00').split(':').map(Number);
      const remTotalMins = (rHours || 0) * 60 + (rMins || 0);

      if (rem.repeat === 'once') {
        if (rem.lastTriggered !== todayDateStr && remTotalMins < currentTotalMins) {
          this.triggerReminder(rem, true);
          rem.enabled = false;
          rem.lastTriggered = todayDateStr;
          updated = true;
        }
      } else if (rem.repeat === 'daily') {
        if (rem.lastTriggered !== todayDateStr && remTotalMins < currentTotalMins) {
          this.triggerReminder(rem, true);
          rem.lastTriggered = todayDateStr;
          updated = true;
        }
      }
    }

    if (updated) {
      store.set('reminders', reminders);
    }
  }

  setWindows(petWin, panelWin) {
    this.petWindowRef = petWin;
    this.panelWindowRef = panelWin;
  }

  snoozeReminder(reminderId, minutes) {
    const reminders = store.get('reminders') || [];
    const rem = reminders.find(r => r.id === reminderId || String(r.id) === String(reminderId));
    if (!rem) return null;

    const snoozeMins = Number(minutes) || store.get('settings.behavior.snoozeMinutes') || 5;
    const now = new Date();
    const todayDateStr = now.toDateString();

    const [rh, rm] = (rem.time || '00:00').split(':').map(Number);
    const remMinutes = (rh || 0) * 60 + (rm || 0);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Already fired if: disabled (for 'once' reminders), or already triggered today, or scheduled time <= current time
    const isAlreadyFired = !rem.enabled ||
      (rem.lastTriggered && String(rem.lastTriggered).includes(todayDateStr)) ||
      (remMinutes <= currentMinutes);

    let newHoursStr, newMinsStr;

    if (isAlreadyFired) {
      // Already fired: dismiss active bubble & re-arm snoozeMins from NOW
      bubble.hide();
      const targetDate = new Date(now.getTime() + snoozeMins * 60000);
      newHoursStr = String(targetDate.getHours()).padStart(2, '0');
      newMinsStr = String(targetDate.getMinutes()).padStart(2, '0');
    } else {
      // Not yet due: postpone by snoozeMins from current scheduled time
      const totalMins = (remMinutes + snoozeMins) % 1440;
      newHoursStr = String(Math.floor(totalMins / 60)).padStart(2, '0');
      newMinsStr = String(totalMins % 60).padStart(2, '0');
    }

    rem.time = `${newHoursStr}:${newMinsStr}`;
    rem.enabled = true;
    rem.lastTriggered = null;

    store.set('reminders', reminders);

    if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
      this.panelWindowRef.webContents.send('reminders:changed', reminders);
    }

    if (!isAlreadyFired) {
      bubble.show({
        badge: 'SNOOZED',
        text: `Reminder snoozed for ${snoozeMins} min (${rem.time}).`,
        sound: 'tap',
        category: 'reminders',
        emotion: 'wink',
        duration: 3500
      });
    }

    return rem;
  }

  reschedule(reminderId) {
    const reminders = store.get('reminders') || [];
    const rem = reminders.find(r => r.id === reminderId || String(r.id) === String(reminderId));
    if (!rem) return;

    rem.enabled = true;
    rem.lastTriggered = null;
    store.set('reminders', reminders);
  }
}

module.exports = new Scheduler();
