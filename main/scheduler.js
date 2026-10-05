/**
 * Desktop Pet — Main Process Background Scheduler
 * Evaluates stored reminders, periodic hydration / posture breaks, and pomodoro completions every second.
 * Supports repeat (every-hour, daily) and snooze.
 * 100% independent of panel window: works with panel closed, asleep, and on app restart.
 */

const path = require('path');
const fs = require('fs');
const { powerMonitor, Notification } = require('electron');
const store = require('./secure-store');
const bubble = require('./bubble-window');

class Scheduler {
  constructor() {
    this.timer = null;
    this.lastCheckedMinute = '';
    this.waterCounterMinutes = 0;
    this.stretchCounterMinutes = 0;
    this.suspendTime = null;
    this.petWindowRef = null;
    this.panelWindowRef = null;
    this.setupPowerEvents();
  }

  setupPowerEvents() {
    try {
      if (powerMonitor) {
        powerMonitor.on('suspend', () => {
          this.suspendTime = Date.now();
        });
        powerMonitor.on('resume', () => {
          const sleptFrom = this.suspendTime;
          this.suspendTime = null;
          setTimeout(() => this.checkSleepMissedReminders(sleptFrom), 2000);
        });
      }
    } catch (e) {}
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

    // 1. Native OS Desktop Notification (pops up even when full screen in other apps)
    try {
      if (Notification && Notification.isSupported()) {
        const notif = new Notification({
          title: isMissed ? 'Missed Reminder — Pixie' : 'Reminder — Pixie',
          body: text,
          silent: false
        });
        notif.on('click', () => {
          if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
            this.panelWindowRef.show();
            this.panelWindowRef.focus();
            this.panelWindowRef.webContents.send('panel:switch-tab', 'reminders');
          }
        });
        notif.show();
      }
    } catch (e) {
      console.warn('[Scheduler] Native notification error:', e.message);
    }

    // 2. Bring pet to top & wake if sleeping
    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      try {
        this.petWindowRef.show();
        this.petWindowRef.setAlwaysOnTop(true, 'screen-saver');
        this.petWindowRef.webContents.send('pet:reset-idle');
        this.petWindowRef.webContents.send('pet:set-state', {
          state: isMissed ? 'worried' : 'surprised',
          duration: 5000,
          priority: 5,
          force: true
        });
      } catch (e) {}
    }

    // 3. Speech bubble with loud reminder alarm
    bubble.show({
      badge: isMissed ? 'MISSED REMINDER' : 'REMINDER',
      text,
      sound: 'alarm',
      category: 'reminders',
      emotion: isMissed ? 'worried' : 'surprised',
      bounce: true,
      duration: 8000,
      critical: true
    });

    // 4. Notify panel window
    if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
      try {
        this.panelWindowRef.webContents.send('reminder:triggered', { reminder: rem, isMissed });
      } catch (e) {}
    }
  }

  evaluateReminders(currentTimeStr, dateObj) {
    const reminders = store.get('reminders') || [];
    let updated = false;
    const todayDateStr = dateObj.toDateString();
    const currentHours = dateObj.getHours();
    const currentMins = dateObj.getMinutes();

    for (const rem of reminders) {
      if (!rem.enabled) continue;

      const [rHoursRaw, rMinsRaw] = (rem.time || '').split(':');
      const rHours = parseInt(rHoursRaw, 10);
      const rMins = parseInt(rMinsRaw, 10);
      if (isNaN(rHours) || isNaN(rMins)) continue;

      const isTimeMatch = (rHours === currentHours && rMins === currentMins);
      let isDue = false;

      if (rem.repeat === 'every-hour') {
        const hourTriggerKey = `${todayDateStr}-${currentHours}`;
        if (rMins === currentMins && rem.lastTriggered !== hourTriggerKey) {
          isDue = true;
          rem.lastTriggered = hourTriggerKey;
          updated = true;
        }
      } else if (rem.repeat === 'daily') {
        if (isTimeMatch && rem.lastTriggered !== todayDateStr) {
          isDue = true;
          rem.lastTriggered = todayDateStr;
          updated = true;
        }
      } else {
        // Repeat: 'once'
        if (isTimeMatch && rem.lastTriggered !== todayDateStr) {
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
      if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
        try {
          this.panelWindowRef.webContents.send('reminders:changed', reminders);
        } catch (e) {}
      }
    }
  }

  checkSleepMissedReminders(sleptFromTimestamp) {
    if (!sleptFromTimestamp) return;
    const now = new Date();
    const sleepDurationMs = now.getTime() - sleptFromTimestamp;
    // Only evaluate if slept at least 1 min and less than 24 hours
    if (sleepDurationMs < 60000 || sleepDurationMs > 86400000) return;

    const reminders = store.get('reminders') || [];
    let updated = false;
    const todayDateStr = now.toDateString();

    const sleepDate = new Date(sleptFromTimestamp);
    const startMins = sleepDate.getHours() * 60 + sleepDate.getMinutes();
    const endMins = now.getHours() * 60 + now.getMinutes();

    for (const rem of reminders) {
      if (!rem.enabled) continue;

      const [rHoursRaw, rMinsRaw] = (rem.time || '').split(':');
      const rHours = parseInt(rHoursRaw, 10);
      const rMins = parseInt(rMinsRaw, 10);
      if (isNaN(rHours) || isNaN(rMins)) continue;

      const remTotalMins = rHours * 60 + rMins;

      // Check if scheduled time fell within the sleep duration
      const fellInWindow = (startMins <= endMins)
        ? (remTotalMins >= startMins && remTotalMins <= endMins)
        : (remTotalMins >= startMins || remTotalMins <= endMins); // crossed midnight

      if (fellInWindow && rem.lastTriggered !== todayDateStr) {
        this.triggerReminder(rem, true);
        rem.lastTriggered = todayDateStr;
        if (rem.repeat === 'once') {
          rem.enabled = false;
        }
        updated = true;
      }
    }

    if (updated) {
      store.set('reminders', reminders);
      if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
        try {
          this.panelWindowRef.webContents.send('reminders:changed', reminders);
        } catch (e) {}
      }
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
