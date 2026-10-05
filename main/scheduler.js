/**
 * Desktop Pet — Main Process Background Scheduler
 * Evaluates stored reminders, periodic hydration / posture breaks, and pomodoro completions every second.
 * Supports repeat (every-hour, daily) and snooze.
 * 100% independent of panel window: works with panel closed, asleep, and on app restart.
 *
 * FIX HISTORY:
 *  v1.0.6 — Full rewrite of reminder evaluation:
 *    • checkPastDueOnStartup() fires reminders missed before app boot (up to 30 min window)
 *    • checkPastDue(reminders) fires reminders created/missed within the current session
 *    • evaluateReminders() no longer skips reminders due to minute deduplication issues
 *    • reminders:updated IPC also runs a past-due scan so newly-added reminders fire immediately
 *      if their time is right now or was up to 1 minute ago
 *    • Robust triggerReminder with error isolation per step
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
    this.firedThisSession = new Set(); // tracks "id:triggerKey" to prevent double-firing
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

    // Check for reminders that were due before the app started (up to 30 min lookback)
    setTimeout(() => this.checkPastDueOnStartup(), 3000);

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
      this.evaluateReminders(now);

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

  /** Called by tick() every new minute — fires reminders exactly on time */
  evaluateReminders(dateObj) {
    if (!dateObj) dateObj = new Date();
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
      let triggerKey;

      if (rem.repeat === 'every-hour') {
        triggerKey = `${todayDateStr}-${currentHours}`;
        isDue = (rMins === currentMins);
      } else if (rem.repeat === 'daily') {
        triggerKey = todayDateStr;
        isDue = isTimeMatch;
      } else {
        // repeat: 'once'
        triggerKey = todayDateStr;
        isDue = isTimeMatch;
      }

      if (!isDue) continue;

      // Already fired today (persisted)?
      if (rem.lastTriggered === triggerKey) continue;

      // Already fired in this session?
      const sessionKey = `${rem.id}:${triggerKey}`;
      if (this.firedThisSession.has(sessionKey)) continue;

      // Mark as fired
      this.firedThisSession.add(sessionKey);
      rem.lastTriggered = triggerKey;
      if (rem.repeat === 'once') rem.enabled = false;
      updated = true;
      this.triggerReminder(rem, false);
    }

    if (updated) {
      this._saveAndNotify(reminders);
    }
  }

  /**
   * Called immediately when reminders:updated IPC is received (user added/edited a reminder).
   * Accepts fresh reminder data directly from the panel so we never hit the store
   * read-after-write race condition (renderer store.set → IPC → main store.get).
   *
   * Only fires if a reminder is due RIGHT NOW or was due within the last 2 minutes.
   */
  evaluateNow(freshReminders) {
    const now = new Date();
    // Use provided fresh data; fall back to store if not provided
    const reminders = Array.isArray(freshReminders) ? freshReminders : (store.get('reminders') || []);
    let updated = false;
    const todayDateStr = now.toDateString();
    const nowTotalMins = now.getHours() * 60 + now.getMinutes();

    if (Array.isArray(freshReminders)) {
      // Clear session locks for reminders that are enabled and have no lastTriggered
      for (const rem of reminders) {
        if (rem.enabled && !rem.lastTriggered) {
          for (const key of [...this.firedThisSession]) {
            if (key.startsWith(`${rem.id}:`)) {
              this.firedThisSession.delete(key);
            }
          }
        }
      }
      store.set('reminders', reminders);
    }

    for (const rem of reminders) {
      if (!rem.enabled) continue;

      const [rHoursRaw, rMinsRaw] = (rem.time || '').split(':');
      const rHours = parseInt(rHoursRaw, 10);
      const rMins = parseInt(rMinsRaw, 10);
      if (isNaN(rHours) || isNaN(rMins)) continue;

      const remTotalMins = rHours * 60 + rMins;
      // Fire if reminder is within [now - 2min, now]
      const diff = nowTotalMins - remTotalMins;
      const isCurrentOrJustPast = diff >= 0 && diff <= 2;

      if (!isCurrentOrJustPast) continue;

      let triggerKey;
      if (rem.repeat === 'every-hour') {
        triggerKey = `${todayDateStr}-${now.getHours()}`;
      } else {
        triggerKey = todayDateStr;
      }

      if (rem.lastTriggered === triggerKey) continue; // already fired

      const sessionKey = `${rem.id}:${triggerKey}`;
      if (this.firedThisSession.has(sessionKey)) continue;

      this.firedThisSession.add(sessionKey);
      rem.lastTriggered = triggerKey;
      if (rem.repeat === 'once') rem.enabled = false;
      updated = true;
      this.triggerReminder(rem, false);
    }

    if (updated) {
      // Write merged state back to store using fresh data
      store.set('reminders', reminders);
      try {
        if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
          this.panelWindowRef.webContents.send('reminders:changed', reminders);
        }
      } catch (e) {}
    }
  }

  /**
   * Checks reminders that were due before the app launched (up to 30 min lookback).
   * Fires them as "missed" so user knows about them.
   */
  checkPastDueOnStartup() {
    const now = new Date();
    const reminders = store.get('reminders') || [];
    let updated = false;
    const todayDateStr = now.toDateString();
    const nowTotalMins = now.getHours() * 60 + now.getMinutes();

    for (const rem of reminders) {
      if (!rem.enabled) continue;

      const [rHoursRaw, rMinsRaw] = (rem.time || '').split(':');
      const rHours = parseInt(rHoursRaw, 10);
      const rMins = parseInt(rMinsRaw, 10);
      if (isNaN(rHours) || isNaN(rMins)) continue;

      const remTotalMins = rHours * 60 + rMins;
      const minutesMissed = nowTotalMins - remTotalMins;

      // Missed within last 30 minutes (and not already fired today)
      if (minutesMissed < 0 || minutesMissed > 30) continue;

      let triggerKey;
      if (rem.repeat === 'every-hour') {
        triggerKey = `${todayDateStr}-${rHours}`;
      } else {
        triggerKey = todayDateStr;
      }

      if (rem.lastTriggered === triggerKey) continue;

      const sessionKey = `${rem.id}:${triggerKey}`;
      if (this.firedThisSession.has(sessionKey)) continue;

      this.firedThisSession.add(sessionKey);
      rem.lastTriggered = triggerKey;
      if (rem.repeat === 'once') rem.enabled = false;
      updated = true;

      // Fire as missed (with isMissed=true only if more than 1 min late)
      this.triggerReminder(rem, minutesMissed > 1);
    }

    if (updated) {
      this._saveAndNotify(reminders);
    }
  }

  /** Fire missed reminders after waking from sleep */
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

      if (!fellInWindow) continue;

      let triggerKey;
      if (rem.repeat === 'every-hour') {
        triggerKey = `${todayDateStr}-${rHours}`;
      } else {
        triggerKey = todayDateStr;
      }

      if (rem.lastTriggered === triggerKey) continue;

      const sessionKey = `${rem.id}:${triggerKey}`;
      if (this.firedThisSession.has(sessionKey)) continue;

      this.firedThisSession.add(sessionKey);
      this.triggerReminder(rem, true);
      rem.lastTriggered = triggerKey;
      if (rem.repeat === 'once') rem.enabled = false;
      updated = true;
    }

    if (updated) {
      this._saveAndNotify(reminders);
    }
  }

  triggerReminder(rem, isMissed = false) {
    const userName = (store.get('settings.general.userName') || '').trim();
    const title = rem.title || 'Scheduled Reminder';
    const text = isMissed
      ? (userName ? `${userName}, you missed reminder: ${title}!` : `Missed reminder: ${title}!`)
      : (userName ? `Hey ${userName}, time for: ${title}!` : `Time for: ${title}!`);

    console.log(`[Scheduler] FIRING reminder "${title}" at ${rem.time} (missed=${isMissed})`);

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
    try {
      if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
        this.petWindowRef.show();
        this.petWindowRef.setAlwaysOnTop(true, 'screen-saver');
        this.petWindowRef.webContents.send('pet:reset-idle');
        this.petWindowRef.webContents.send('pet:set-state', {
          state: isMissed ? 'worried' : 'surprised',
          duration: 5000,
          priority: 5,
          force: true
        });
      }
    } catch (e) {}

    // 3. Speech bubble with loud reminder alarm
    try {
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
    } catch (e) {}

    // 4. Notify panel window
    try {
      if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
        this.panelWindowRef.webContents.send('reminder:triggered', { reminder: rem, isMissed });
      }
    } catch (e) {}
  }

  _saveAndNotify(reminders) {
    try {
      store.set('reminders', reminders);
    } catch (e) {}
    try {
      if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) {
        this.panelWindowRef.webContents.send('reminders:changed', reminders);
      }
    } catch (e) {}
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

    // Remove from session fired set so it can fire again at new time
    for (const key of this.firedThisSession) {
      if (key.startsWith(`${rem.id}:`)) {
        this.firedThisSession.delete(key);
      }
    }

    this._saveAndNotify(reminders);

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

    // Remove from session fired set so it can fire again
    for (const key of [...this.firedThisSession]) {
      if (key.startsWith(`${rem.id}:`)) {
        this.firedThisSession.delete(key);
      }
    }

    store.set('reminders', reminders);
  }
}

module.exports = new Scheduler();
