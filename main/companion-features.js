/**
 * Companion Features (Main Process)
 * Low-resource, event-driven features replacing SystemSense.
 * - Pet Care & Mood
 * - Smart Clipboard Buddy
 * - Focus Streaks & Gentle Breaks
 * - Daily Check-in
 * - Quick Capture
 * - Micro-Break Breathing
 * - Extras: water/stretch nudges, daily summary, mood-aware tips, quick tricks
 */

const { clipboard } = require('electron');
const store = require('./secure-store');
const bubble = require('./bubble-window');
const aiService = require('./ai-service');

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const now = () => Date.now();

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

class CompanionFeatures {
  constructor() {
    this.petWindowRef = null;
    this.panelWindowRef = null;
    this.timers = { mood: null, clipboard: null, checkin: null, nudge: null };
    this.lastClipboardText = '';
    this.lastClipboardSeenAt = 0;
    this.lastNudgeAt = 0;
    this.breathingActive = false;
    this.started = false;
  }

  setWindows(petWindow, panelWindow) {
    this.petWindowRef = petWindow;
    this.panelWindowRef = panelWindow;
  }

  start() {
    this.stop();
    this.started = true;
    this.ensureState();
    this.applyMoodDecay();
    this.maybeDailyCheckin();
    // Slow intervals: mood decay/check every 10 min, clipboard every 6s, checkin/nudges every 15 min.
    this.timers.mood = setInterval(() => this.safe(() => this.applyMoodDecay()), 10 * 60 * 1000);
    this.timers.clipboard = setInterval(() => this.safe(() => this.checkClipboard()), 6000);
    this.timers.checkin = setInterval(() => this.safe(() => this.maybeDailyCheckin()), 15 * 60 * 1000);
    this.timers.nudge = setInterval(() => this.safe(() => this.maybeWellnessNudge()), 15 * 60 * 1000);
  }

  stop() {
    this.started = false;
    Object.keys(this.timers).forEach(k => { if (this.timers[k]) clearInterval(this.timers[k]); this.timers[k] = null; });
  }

  safe(fn) { try { fn(); } catch (e) { console.error('[Companion] error', e); } }

  emit(channel, data) {
    try { if (this.petWindowRef && !this.petWindowRef.isDestroyed()) this.petWindowRef.webContents.send(channel, data); } catch (_) {}
    try { if (this.panelWindowRef && !this.panelWindowRef.isDestroyed()) this.panelWindowRef.webContents.send(channel, data); } catch (_) {}
  }

  // -------------------- State --------------------
  ensureState() {
    const defaults = {
      mood: { happiness: 72, energy: 72, focus: 68, updatedAt: now() },
      care: { lastFedAt: 0, lastPlayedAt: 0, lastPettedAt: 0, totalPets: 0, totalFeeds: 0, totalPlays: 0 },
      streaks: { current: 0, best: 0, lastFocusDate: '', todayFocusSessions: 0, todayFocusMinutes: 0 },
      checkin: { lastDate: '', lastMood: '', history: [] },
      captures: [],
      clipboard: { enabled: true, lastActionAt: 0 },
      breathing: { lastAt: 0 },
      nudges: { lastWaterAt: 0, lastStretchAt: 0 },
    };
    const cur = store.get('companion') || {};
    const merged = {
      ...defaults, ...cur,
      mood: { ...defaults.mood, ...(cur.mood || {}) },
      care: { ...defaults.care, ...(cur.care || {}) },
      streaks: { ...defaults.streaks, ...(cur.streaks || {}) },
      checkin: { ...defaults.checkin, ...(cur.checkin || {}) },
      clipboard: { ...defaults.clipboard, ...(cur.clipboard || {}) },
      breathing: { ...defaults.breathing, ...(cur.breathing || {}) },
      nudges: { ...defaults.nudges, ...(cur.nudges || {}) },
      captures: Array.isArray(cur.captures) ? cur.captures : [],
    };
    store.set('companion', merged);
    return merged;
  }

  getState() { return this.ensureState(); }
  saveState(next) { store.set('companion', next); this.emit('companion:updated', this.getPublicState()); }

  getPublicState() {
    const s = this.getState();
    return {
      mood: s.mood,
      care: s.care,
      streaks: s.streaks,
      checkin: { lastDate: s.checkin.lastDate, lastMood: s.checkin.lastMood, history: (s.checkin.history || []).slice(-7) },
      captures: (s.captures || []).slice(0, 20),
      breathingActive: this.breathingActive,
      summary: this.getDailySummary(),
    };
  }

  // -------------------- Pet Care & Mood --------------------
  applyMoodDecay() {
    const s = this.getState();
    const t = now();
    const elapsedMin = Math.max(0, (t - (s.mood.updatedAt || t)) / 60000);
    if (elapsedMin < 5) return; // only update every 5+ minutes
    const steps = elapsedMin / 10; // gentle decay per 10 min
    s.mood.happiness = clamp(Math.round(s.mood.happiness - steps * 1.2), 0, 100);
    s.mood.energy = clamp(Math.round(s.mood.energy - steps * 1.0), 0, 100);
    s.mood.focus = clamp(Math.round(s.mood.focus - steps * 0.8), 0, 100);
    s.mood.updatedAt = t;
    this.saveState(s);
  }

  adjustMood(delta = {}, reason = '') {
    const s = this.getState();
    s.mood.happiness = clamp(Math.round((s.mood.happiness ?? 70) + (delta.happiness || 0)), 0, 100);
    s.mood.energy = clamp(Math.round((s.mood.energy ?? 70) + (delta.energy || 0)), 0, 100);
    s.mood.focus = clamp(Math.round((s.mood.focus ?? 70) + (delta.focus || 0)), 0, 100);
    s.mood.updatedAt = now();
    this.saveState(s);
    if (reason) this.emit('companion:mood-reason', { reason, mood: s.mood });
    return s.mood;
  }

  careAction(action) {
    const a = String(action || '').toLowerCase();
    const s = this.getState();
    const t = now();
    if (a === 'pet') {
      s.care.lastPettedAt = t; s.care.totalPets = (s.care.totalPets || 0) + 1;
      this.saveState(s); this.adjustMood({ happiness: 8, focus: 2, energy: 1 });
      bubble.show({ badge: 'PET CARE', text: 'Aww, thank you! That made me happy.', sound: 'happy', emotion: 'happy', duration: 2500, category: 'reactions' });
      this.emitPetEmotion('happy', 3000);
    } else if (a === 'feed') {
      s.care.lastFedAt = t; s.care.totalFeeds = (s.care.totalFeeds || 0) + 1;
      this.saveState(s); this.adjustMood({ happiness: 6, energy: 10 });
      bubble.show({ badge: 'PET CARE', text: 'Yum! Feeling energized!', sound: 'happy', emotion: 'happy', duration: 2500, category: 'reactions' });
      this.emitPetEmotion('happy', 3000);
    } else if (a === 'play') {
      s.care.lastPlayedAt = t; s.care.totalPlays = (s.care.totalPlays || 0) + 1;
      this.saveState(s); this.adjustMood({ happiness: 10, energy: -4, focus: 3 });
      bubble.show({ badge: 'PET CARE', text: 'That was fun! Let\'s keep the good vibes going.', sound: 'happy', emotion: 'surprised', duration: 2800, category: 'reactions' });
      this.emitPetEmotion('surprised', 2500);
    } else if (a === 'rest') {
      this.saveState(s); this.adjustMood({ energy: 12, focus: 4, happiness: 2 });
      bubble.show({ badge: 'PET CARE', text: 'A little rest helps a lot.', sound: 'tap', emotion: 'relieved', duration: 2500, category: 'reactions' });
      this.emitPetEmotion('relieved', 2500);
    } else {
      return { success: false, error: 'Unknown action' };
    }
    return { success: true, action: a, state: this.getPublicState() };
  }

  emitPetEmotion(state, duration = 2500) {
    try { if (this.petWindowRef && !this.petWindowRef.isDestroyed()) this.petWindowRef.webContents.send('pet:set-state', { state, duration, priority: 2, force: true }); } catch (_) {}
  }

  // -------------------- Focus Streaks & Breaks --------------------
  onFocusSessionComplete(payload = {}) {
    const s = this.getState();
    const minutes = Math.max(1, Math.round(Number(payload.minutes) || 25));
    const day = todayKey();
    if (s.streaks.lastFocusDate !== day) {
      const yesterday = todayKey(Date.now() - DAY_MS);
      s.streaks.current = (s.streaks.lastFocusDate === yesterday) ? (s.streaks.current || 0) + 1 : 1;
      s.streaks.lastFocusDate = day;
      s.streaks.todayFocusSessions = 0;
      s.streaks.todayFocusMinutes = 0;
    }
    s.streaks.todayFocusSessions = (s.streaks.todayFocusSessions || 0) + 1;
    s.streaks.todayFocusMinutes = (s.streaks.todayFocusMinutes || 0) + minutes;
    s.streaks.best = Math.max(s.streaks.best || 0, s.streaks.current || 0);
    this.saveState(s);
    this.adjustMood({ focus: 8, happiness: 4, energy: -2 });
    if (store.get('settings.companion.breakReminders') !== false) {
      bubble.show({ badge: 'FOCUS STREAK', text: `Nice focus session! Streak: ${s.streaks.current} day(s). Time for a short break?`, sound: 'happy', emotion: 'happy', duration: 4500, category: 'reminders' });
    }
    this.emit('companion:focus-complete', { streaks: s.streaks });
  }

  getDailySummary() {
    const s = this.getState();
    const day = todayKey();
    if (s.streaks.lastFocusDate !== day) {
      return { date: day, focusSessions: 0, focusMinutes: 0, streak: s.streaks.current || 0, checkin: s.checkin.lastDate === day ? s.checkin.lastMood : '' };
    }
    return { date: day, focusSessions: s.streaks.todayFocusSessions || 0, focusMinutes: s.streaks.todayFocusMinutes || 0, streak: s.streaks.current || 0, checkin: s.checkin.lastDate === day ? s.checkin.lastMood : '' };
  }

  // -------------------- Daily Check-in --------------------
  maybeDailyCheckin() {
    if (store.get('settings.companion.dailyCheckin') === false) return;
    const s = this.getState();
    const day = todayKey();
    if (s.checkin.lastDate === day) return;
    // only prompt during reasonable hours and not too frequently
    const hour = new Date().getHours();
    if (hour < 8 || hour > 22) return;
    if (now() - (s.checkin.lastPromptAt || 0) < 6 * 60 * 60 * 1000) return;
    s.checkin.lastPromptAt = now();
    this.saveState(s);
    bubble.show({ badge: 'DAILY CHECK-IN', text: 'How are you feeling today? Open the panel to check in.', sound: 'chirp', emotion: 'neutral', duration: 6000, category: 'reminders' });
    this.emit('companion:checkin-due', { date: day });
  }

  submitCheckin(mood) {
    const allowed = ['great', 'okay', 'tired', 'stressed'];
    const m = String(mood || '').toLowerCase();
    if (!allowed.includes(m)) return { success: false, error: 'Invalid mood' };
    const s = this.getState();
    const day = todayKey();
    s.checkin.lastDate = day;
    s.checkin.lastMood = m;
    s.checkin.history = Array.isArray(s.checkin.history) ? s.checkin.history : [];
    s.checkin.history.push({ date: day, mood: m, at: now() });
    if (s.checkin.history.length > 30) s.checkin.history = s.checkin.history.slice(-30);
    this.saveState(s);
    const reactions = {
      great: { delta: { happiness: 8, energy: 4 }, msg: 'Love that! Let\'s keep the momentum.', emo: 'happy' },
      okay: { delta: { happiness: 3, focus: 2 }, msg: 'Steady is good. I\'m here with you.', emo: 'neutral' },
      tired: { delta: { energy: 6, happiness: 2 }, msg: 'Thanks for sharing. Maybe a short break would help.', emo: 'sleepy' },
      stressed: { delta: { happiness: 4, focus: 2 }, msg: 'I hear you. One small step at a time.', emo: 'relieved' },
    };
    const r = reactions[m];
    this.adjustMood(r.delta);
    bubble.show({ badge: 'CHECK-IN SAVED', text: r.msg, sound: 'happy', emotion: r.emo, duration: 3500, category: 'reactions' });
    this.emitPetEmotion(r.emo, 3000);
    return { success: true, mood: m, state: this.getPublicState() };
  }

  // -------------------- Quick Capture --------------------
  addCapture({ type = 'note', text = '', dueAt = null } = {}) {
    const cleanText = String(text || '').trim().slice(0, 500);
    if (!cleanText) return { success: false, error: 'Empty text' };
    const allowed = ['note', 'todo', 'reminder'];
    const t = allowed.includes(String(type).toLowerCase()) ? String(type).toLowerCase() : 'note';
    const s = this.getState();
    const item = { id: `cap_${now()}_${Math.random().toString(36).slice(2, 7)}`, type: t, text: cleanText, createdAt: now(), done: false, dueAt: dueAt || null };
    s.captures = Array.isArray(s.captures) ? s.captures : [];
    s.captures.unshift(item);
    if (s.captures.length > 50) s.captures = s.captures.slice(0, 50);
    this.saveState(s);
    bubble.show({ badge: 'CAPTURED', text: t === 'todo' ? 'To-do saved!' : t === 'reminder' ? 'Reminder note saved!' : 'Note saved!', sound: 'tap', emotion: 'happy', duration: 2200, category: 'reactions' });
    this.emitPetEmotion('happy', 1800);
    return { success: true, item, state: this.getPublicState() };
  }

  toggleCapture(id) {
    const s = this.getState();
    const item = (s.captures || []).find(c => c.id === id);
    if (!item) return { success: false, error: 'Not found' };
    item.done = !item.done;
    this.saveState(s);
    return { success: true, item, state: this.getPublicState() };
  }

  deleteCapture(id) {
    const s = this.getState();
    const before = s.captures.length;
    s.captures = (s.captures || []).filter(c => c.id !== id);
    if (s.captures.length === before) return { success: false, error: 'Not found' };
    this.saveState(s);
    return { success: true, state: this.getPublicState() };
  }

  clearCompletedCaptures() {
    const s = this.getState();
    s.captures = (s.captures || []).filter(c => !c.done);
    this.saveState(s);
    return { success: true, state: this.getPublicState() };
  }

  // -------------------- Clipboard Buddy --------------------
  checkClipboard() {
    if (store.get('settings.companion.clipboardBuddy') === false) return;
    // Skip when DND or panel not in active use? No, clipboard buddy should be useful but unobtrusive.
    let text = '';
    try { text = String(clipboard.readText() || ''); } catch (_) { return; }
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 12 || trimmed.length > 4000) return;
    if (trimmed === this.lastClipboardText) return;
    this.lastClipboardText = trimmed;
    const t = now();
    if (t - this.lastClipboardSeenAt < 15000) { this.lastClipboardSeenAt = t; return; } // debounce bursts
    this.lastClipboardSeenAt = t;
    // Don't spam: at most once per 90s
    const s = this.getState();
    if (t - (s.clipboard.lastActionAt || 0) < 90000) return;
    s.clipboard.lastActionAt = t;
    s.clipboard.lastPreview = trimmed.slice(0, 120);
    this.saveState(s);
    this.emit('companion:clipboard', { preview: trimmed.slice(0, 160), length: trimmed.length });
    bubble.show({ badge: 'CLIPBOARD BUDDY', text: 'Copied something? I can summarize, explain, or save it.', sound: 'tap', emotion: 'neutral', duration: 5000, category: 'reactions' });
  }

  async clipboardAction(action) {
    const text = String(clipboard.readText() || '').trim().slice(0, 4000);
    if (!text) return { success: false, error: 'Clipboard is empty' };
    const a = String(action || '').toLowerCase();
    if (a === 'save') {
      return this.addCapture({ type: 'note', text: `Clipboard: ${text.slice(0, 300)}` });
    }
    if (a === 'summarize' || a === 'explain') {
      if (!aiService.hasKey()) {
        this.addCapture({ type: 'note', text: `Clipboard: ${text.slice(0, 300)}` });
        return { success: true, fallback: 'saved', message: 'No AI key configured; saved to captures instead.' };
      }
      const prompt = a === 'summarize'
        ? `Summarize this clearly in 2-4 short bullet points:\n\n${text}`
        : `Explain this clearly and briefly:\n\n${text}`;
      const res = await aiService.ask(prompt, { maxTokens: 220, temperature: 0.2 });
      const out = (res && res.success) ? String(res.content || '').trim() : '';
      if (!out) {
        this.addCapture({ type: 'note', text: `Clipboard: ${text.slice(0, 300)}` });
        return { success: true, fallback: 'saved', message: 'AI unavailable; saved to captures instead.' };
      }
      bubble.show({ badge: a === 'summarize' ? 'SUMMARY' : 'EXPLANATION', text: out.slice(0, 220), sound: 'happy', emotion: 'focus', duration: 8000, category: 'reactions' });
      this.emitPetEmotion('focus', 2500);
      return { success: true, action: a, output: out };
    }
    return { success: false, error: 'Unknown action' };
  }

  // -------------------- Micro-Break Breathing --------------------
  startBreathing(seconds = 45) {
    const dur = clamp(Math.round(Number(seconds) || 45), 20, 120);
    this.breathingActive = true;
    this.emit('companion:breathing', { active: true, seconds: dur });
    this.emitPetEmotion('relieved', dur * 1000);
    bubble.show({ badge: 'BREATHE', text: `Micro-break: breathe with me for ${dur}s.`, sound: 'tap', emotion: 'relieved', duration: 5000, category: 'reminders' });
    setTimeout(() => {
      this.breathingActive = false;
      const s = this.getState(); s.breathing.lastAt = now(); this.saveState(s);
      this.adjustMood({ energy: 5, focus: 4, happiness: 3 });
      this.emit('companion:breathing', { active: false, seconds: dur });
      bubble.show({ badge: 'NICE RESET', text: 'Great job. Ready to continue!', sound: 'happy', emotion: 'happy', duration: 3000, category: 'reactions' });
    }, dur * 1000);
    return { success: true, seconds: dur };
  }

  // -------------------- Wellness Nudges & Extras --------------------
  maybeWellnessNudge() {
    if (store.get('settings.companion.wellnessNudges') === false) return;
    const t = now();
    if (t - this.lastNudgeAt < 45 * 60 * 1000) return;
    const hour = new Date().getHours();
    if (hour < 9 || hour > 21) return;
    const s = this.getState();
    // alternate water/stretch nudges
    const waterDue = t - (s.nudges.lastWaterAt || 0) > 90 * 60 * 1000;
    const stretchDue = t - (s.nudges.lastStretchAt || 0) > 120 * 60 * 1000;
    if (!waterDue && !stretchDue) return;
    this.lastNudgeAt = t;
    if (waterDue) {
      s.nudges.lastWaterAt = t; this.saveState(s);
      bubble.show({ badge: 'WELLNESS', text: 'Quick reminder: sip some water 💧', sound: 'tap', emotion: 'neutral', duration: 4500, category: 'reminders' });
    } else {
      s.nudges.lastStretchAt = t; this.saveState(s);
      bubble.show({ badge: 'WELLNESS', text: 'Time for a quick stretch. Your future self will thank you.', sound: 'tap', emotion: 'neutral', duration: 4500, category: 'reminders' });
    }
  }

  getQuickTrick(trick) {
    const t = String(trick || 'wave').toLowerCase();
    const map = {
      wave: { emotion: 'happy', text: 'Hi there! 👋' },
      dance: { emotion: 'surprised', text: 'Tiny dance break!' },
      focus: { emotion: 'focus', text: 'Locked in. Let\'s do this.' },
      cheer: { emotion: 'happy', text: 'You\'ve got this!' },
    };
    const v = map[t] || map.wave;
    this.emitPetEmotion(v.emotion, 2500);
    bubble.show({ badge: 'PET TRICK', text: v.text, sound: 'happy', emotion: v.emotion, duration: 2500, category: 'reactions' });
    this.adjustMood({ happiness: 2 });
    return { success: true, trick: t };
  }
}

module.exports = new CompanionFeatures();
