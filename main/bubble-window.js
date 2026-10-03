/**
 * Desktop Pet — Speech Bubble Dispatcher (Embedded inside Pet Window)
 * Zero extra BrowserWindow processes: bubbles are rendered inside the pet's
 * own transparent window with pure glassmorphic styling, auto-dismiss, and queueing.
 */

const { ipcMain } = require('electron') || {};
const store = require('./secure-store');

class BubbleWindowManager {
  constructor() {
    this.queue = [];
    this.isShowing = false;
    this.petWindowRef = null;
    this.accentColor = store.get('settings.appearance.accentColor') || '#FF7A2F';
    this.currentTimeout = null;

    this.setupIPC();
  }

  setPetWindow(petWin) {
    this.petWindowRef = petWin;
  }

  setupIPC() {
    if (!ipcMain) return;

    ipcMain.on('bubble:dismissed', () => {
      this.isShowing = false;
      setTimeout(() => this.processQueue(), 250);
    });

    ipcMain.on('pet:update-accent', (e, color) => {
      this.accentColor = color;
    });
  }

  syncPosition() {
    // Embedded bubble automatically syncs with pet inside pet.html
  }

  /**
   * Enqueue a message to show in the embedded speech bubble
   * @param {Object} item { text, badge, duration, sound, emotion }
   */
  show(item) {
    if (!item || !item.text) return;

    const dnd = store.get('settings.behavior.dnd');
    if (dnd && !item.critical) {
      console.log('[Bubble] Suppressed by DND mode:', item.text);
      return;
    }

    this.queue.push(item);
    if (!this.isShowing) {
      this.processQueue();
    }
  }

  processQueue() {
    if (this.queue.length === 0) {
      this.isShowing = false;
      return;
    }

    if (!this.petWindowRef || this.petWindowRef.isDestroyed()) {
      this.isShowing = false;
      return;
    }

    this.isShowing = true;
    const item = this.queue.shift();

    const defaultDuration = (store.get('settings.behavior.bubbleDuration') || 5) * 1000;
    const duration = item.duration || defaultDuration;

    // Send directly to embedded bubble inside pet window
    this.petWindowRef.webContents.send('pet:show-bubble', {
      text: item.text,
      badge: item.badge || '',
      duration,
      sound: item.sound || 'chirp',
      emotion: item.emotion || 'happy'
    });

    if (this.currentTimeout) clearTimeout(this.currentTimeout);
    this.currentTimeout = setTimeout(() => {
      this.isShowing = false;
      this.processQueue();
    }, duration + 300);
  }

  hide() {
    this.queue = [];
    this.isShowing = false;
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      this.petWindowRef.webContents.send('pet:hide-bubble');
    }
  }
}

module.exports = new BubbleWindowManager();
