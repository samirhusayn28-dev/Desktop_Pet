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
 *  v1.0.7 — Dedupe / reliability pass:
 *    • One shared "due info" helper for minute checks (correct for every-hour reminders)
 *    • lastTriggered + firedThisSession are always checked BEFORE firing, and marked BEFORE
 *      triggering, so one reminder cannot alarm twice in the same minute/session
 *    • reminders:updated no longer blindly clears session locks or overwrites persisted firing
 *      state with a stale "null" from the panel (a common duplicate-alarm race)
 *    • Reminder alarm is delivered ONLY through bubble.show({ sound:'alarm', category:'reminders',
 *      critical:true, force:true }) — no shell/beep/afplay/PowerShell side channel, so the
 *      unified sound manager (and its master switch) stays authoritative. Critical bubbles
 *      bypass DND visibility suppression; the sound field is never stripped.
 */

const path = require('path');
const fs = require('fs');
const { powerMonitor, Notification } = require('electron');
const store = require('./secure-store');
const bubble = require('./bubble-window');

function parseReminderTime(timeStr) {
  if (!timeStr) return null;
  const s = String(timeStr).trim();
  const match = s.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?\s*(am|pm)?$/i);
  if (!match) {
    const parts = s.split(':');
    let h = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return { hours: h, minutes: m };
  }
  let h = parseInt(match[1], 10);
  let m = parseInt(match[2], 10);
  const ampm = match[3] ? match[3].toLowerCase() : null;
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return { hours: h, minutes: m };
}

function sameId(a, b) {
  return a !== undefined && a !== null && b !== undefined && b !== null && (a === b || String(a) === String(b));
}

/**
 * Single source of truth for "is this reminder due right now?".
 * `maxLateMinutes` is 2 for live ticks (lag tolerance) and 30 for startup catch-up.
 * For 'every-hour' the due minute is rem.time's minute, in EVERY hour — using the
 * raw hours:minutes value here was a frequent missed-fire bug.
 */
function getDueInfo(rem, now, maxLateMinutes) {
  if (!rem || rem.enabled === false) return null;
  const parsed = parseReminderTime(rem.time);
  if (!parsed) return null;

  const dayKey = now.toDateString();
  if (rem.repeat === 'every-hour') {
    const late = ((now.getMinutes() - parsed.minutes) % 60 + 60) % 60;
    if (late > maxLateMinutes) return null;
    return {
      dayKey,
      hour: now.getHours(),
      minutesLate: late,
      triggerKey: `${dayKey}-${now.getHours()}`
    };
  }

  const dueMins = parsed.hours * 60 + parsed.minutes;
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const late = nowMins - dueMins;
  if (late < 0 || late > maxLateMinutes) return null;
  return { dayKey, minutesLate: late, triggerKey: dayKey };
}

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
          // Force a fresh minute evaluation after wake, then scan the sleep window.
          this.lastCheckedMinute = '';
          setTimeout(() => this.checkSleepMissedReminders(sleptFrom), 2000);
        });
      }
    } catch (e) {}
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    this.lastCheckedMinute = '';

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

  /** Trigger key is unique per reminder occurrence (per hour for hourly repeats). */
  sessionKeyFor(rem, triggerKey) {
    return `${rem.id}:${triggerKey}`;
  }

  /** True when this exact occurrence was already fired in this session or persisted. */
  isAlreadyFired(rem, info) {
    if (!info) return true;
    if (rem.lastTriggered === info.triggerKey) return true;
    if (this.firedThisSession.has(this.sessionKeyFor(rem, info.triggerKey))) return true;

    // Legacy lastTriggered values (boolean/timestamp/day string) must not cause a
    // second alarm for the same occurrence after an app upgrade/restart — but they
    // also must not block the NEXT hourly occurrence on the same day.
    const lt = rem.lastTriggered;
    if (!lt) return false;
    const parsedDate = (typeof lt === 'number' || typeof lt === 'string') ? new Date(lt) : null;
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      if (parsedDate.toDateString() !== info.dayKey) return false;
      if (rem.repeat === 'every-hour') {
        return info.hour !== undefined && parsedDate.getHours() === info.hour;
      }
      return true;
    }
    if (typeof lt === 'string' && lt === info.dayKey && rem.repeat !== 'every-hour') return true;
    return lt === true; // legacy boolean true: treat as already fired today
  }

  /** Mark BEFORE triggering so no IPC/notification path can re-enter and double-fire. */
  markFired(rem, info) {
    this.firedThisSession.add(this.sessionKeyFor(rem, info.triggerKey));
    rem.lastTriggered = info.triggerKey;
    if (rem.repeat === 'once') rem.enabled = false;
  }

  clearSessionLocks(reminderId) {
    for (const key of [...this.firedThisSession]) {
      if (key.startsWith(`${reminderId}:`)) {
        this.firedThisSession.delete(key);
      }
    }
  }

  /** Called by tick() every new minute — fires reminders exactly on time. */
  evaluateReminders(dateObj) {
    const now = dateObj || new Date();
    const reminders = store.get('reminders') || [];
    let updated = false;

    for (const rem of reminders) {
      const info = getDueInfo(rem, now, 2);
      if (!info || this.isAlreadyFired(rem, info)) continue;

      this.markFired(rem, info);
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
   * We merge firing state from the store instead of clearing session locks: clearing
   * locks for anything with `lastTriggered: null` could re-fire a reminder that tick()
   * had just fired. Explicit re-arm paths (reschedule / snooze) clear their own locks.
   */
  evaluateNow(freshReminders) {
    const now = new Date();
    const stored = store.get('reminders') || [];
    let reminders;

    if (Array.isArray(freshReminders)) {
      reminders = freshReminders.map(fresh => {
        if (!fresh) return fresh;
        const old = stored.find(r => sameId(r && r.id, fresh.id));
        if (!old) return fresh;

        const merged = Object.assign({}, fresh);
        // A plain re-save from the panel may carry a stale null. Keep the persisted
        // firing state unless the user actually changed the schedule or re-enabled it.
        const scheduleChanged = fresh.time !== old.time || fresh.repeat !== old.repeat ||
          (!!fresh.enabled && !old.enabled);
        if (!merged.lastTriggered && old.lastTriggered && !scheduleChanged) {
          merged.lastTriggered = old.lastTriggered;
        }
        return merged;
      });
      store.set('reminders', reminders);
    } else {
      reminders = stored;
    }

    let updated = false;
    for (const rem of reminders) {
      const info = getDueInfo(rem, now, 2);
      if (!info || this.isAlreadyFired(rem, info)) continue;

      this.markFired(rem, info);
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

    for (const rem of reminders) {
      const info = getDueInfo(rem, now, 30);
      if (!info || this.isAlreadyFired(rem, info)) continue;

      this.markFired(rem, info);
      updated = true;
      // Fire as missed (with isMissed=true only if more than 1 min late)
      this.triggerReminder(rem, info.minutesLate > 1);
    }

    if (updated) {
      this._saveAndNotify(reminders);
    }
  }

  /** Fire missed reminders after waking from sleep (at most one alarm per reminder). */
  checkSleepMissedReminders(sleptFromTimestamp) {
    if (!sleptFromTimestamp) return;
    const now = new Date();
    const sleepDurationMs = now.getTime() - sleptFromTimestamp;
    // Only evaluate if slept at least 1 min and less than 24 hours
    if (sleepDurationMs < 60000 || sleepDurationMs > 86400000) return;

    const reminders = store.get('reminders') || [];
    let updated = false;
    const sleepDate = new Date(sleptFromTimestamp);

    for (const rem of reminders) {
      if (!rem || rem.enabled === false) continue;
      const parsed = parseReminderTime(rem.time);
      if (!parsed) continue;

      // Build the most recent scheduled occurrence inside the sleep window.
      let occurrence = null;
      if (rem.repeat === 'every-hour') {
        const candidate = new Date(sleepDate);
        candidate.setMinutes(parsed.minutes, 0, 0);
        if (candidate.getTime() < sleptFromTimestamp) candidate.setHours(candidate.getHours() + 1);
        const cursor = new Date(candidate);
        while (cursor.getTime() <= now.getTime()) {
          occurrence = new Date(cursor.getTime());
          cursor.setHours(cursor.getHours() + 1); // DST-safe hourly stepping
        }
      } else {
        // Daily / once: check both the sleep day and the wake day (midnight crossing).
        for (const day of [sleepDate, now]) {
          const candidate = new Date(day);
          candidate.setHours(parsed.hours, parsed.minutes, 0, 0);
          if (candidate.getTime() >= sleptFromTimestamp && candidate.getTime() <= now.getTime()) {
            occurrence = candidate;
          }
        }
      }
      if (!occurrence) continue;

      const dayKey = occurrence.toDateString();
      const info = {
        dayKey,
        hour: occurrence.getHours(),
        triggerKey: rem.repeat === 'every-hour' ? `${dayKey}-${occurrence.getHours()}` : dayKey,
        minutesLate: Math.max(1, Math.round((now.getTime() - occurrence.getTime()) / 60000))
      };
      if (this.isAlreadyFired(rem, info)) continue;

      this.markFired(rem, info);
      this.triggerReminder(rem, true);
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

    // 2. Bring pet to top & wake if sleeping (cross-platform safe: 'screen-saver' level is macOS only!)
    try {
      const petWin = this.petWindowRef || bubble.petWindowRef;
      if (petWin && !petWin.isDestroyed()) {
        petWin.show();
        if (process.platform === 'darwin') {
          petWin.setAlwaysOnTop(true, 'screen-saver');
        } else {
          petWin.setAlwaysOnTop(true);
          try { petWin.moveTop(); } catch (_) {}
        }
        petWin.webContents.send('pet:reset-idle');
        petWin.webContents.send('pet:set-state', {
          state: isMissed ? 'worried' : 'surprised',
          duration: 5000,
          priority: 5,
          force: true
        });
      }
    } catch (e) {
      console.warn('[Scheduler] Wake pet error:', e.message);
    }

    // 3. Speech bubble with loud reminder alarm. This is the ONLY audible alarm path:
    //    bubble -> pet renderer -> sound manager, which owns master/DND/sub-toggles.
    //    `critical` makes the bubble bypass DND visibility suppression; never strip
    //    `sound` here, and never substitute a shell/OS beep (that would bypass the
    //    master switch and add an extra process/path on Windows).
    try {
      bubble.show({
        badge: isMissed ? 'MISSED REMINDER' : 'REMINDER',
        text,
        sound: 'alarm',
        category: 'reminders',
        emotion: isMissed ? 'worried' : 'surprised',
        bounce: true,
        duration: 8000,
        critical: true,
        force: true
      });
    } catch (e) {
      console.warn('[Scheduler] Bubble show error:', e.message);
    }

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
    const rem = reminders.find(r => sameId(r.id, reminderId));
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
    this.clearSessionLocks(rem.id);

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
    const rem = reminders.find(r => sameId(r.id, reminderId));
    if (!rem) return;

    rem.enabled = true;
    rem.lastTriggered = null;

    // Remove from session fired set so it can fire again
    this.clearSessionLocks(rem.id);

    store.set('reminders', reminders);
  }
}

module.exports = new Scheduler();
