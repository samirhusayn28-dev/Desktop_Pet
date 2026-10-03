/**
 * Desktop Pet — Dedicated Glass Speech Bubble Window Controller
 * Runs a transparent, frameless, non-focusable always-on-top window at 'screen-saver' level
 * with a robust message queue and auto-following pet positioning.
 */

const { BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const store = require('./secure-store');

class BubbleWindowManager {
  constructor() {
    this.window = null;
    this.queue = [];
    this.isShowing = false;
    this.petWindowRef = null;
    this.accentColor = store.get('settings.appearance.accentColor') || '#FF7A2F';

    this.setupIPC();
  }

  setPetWindow(petWin) {
    this.petWindowRef = petWin;
  }

  createWindow() {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      width: 340,
      height: 180,
      show: false,
      transparent: true,
      frame: false,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    if (process.platform === 'darwin') {
      try {
        this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        this.window.setAlwaysOnTop(true, 'screen-saver');
      } catch (e) {}
    } else {
      this.window.setAlwaysOnTop(true, 'screen-saver');
    }

    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.loadFile(path.join(__dirname, '..', 'bubble-window', 'bubble.html'));

    this.window.on('closed', () => {
      this.window = null;
    });
  }

  setupIPC() {
    ipcMain.on('bubble:set-ignore-mouse', (e, ignore) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.setIgnoreMouseEvents(ignore, { forward: true });
      }
    });

    ipcMain.on('bubble:dismissed', () => {
      this.isShowing = false;
      if (this.window && !this.window.isDestroyed()) {
        this.window.hide();
      }
      // Process next message in queue
      setTimeout(() => this.processQueue(), 250);
    });

    ipcMain.on('pet:update-accent', (e, color) => {
      this.accentColor = color;
    });
  }

  syncPosition() {
    if (!this.petWindowRef || this.petWindowRef.isDestroyed() || !this.window || this.window.isDestroyed()) return;

    try {
      const [petX, petY] = this.petWindowRef.getPosition();
      const [petW, petH] = this.petWindowRef.getSize();
      const [bubbleW, bubbleH] = this.window.getSize();

      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

      // Position bubble centered horizontally over the pet, slightly above it
      let targetX = Math.round(petX + (petW - bubbleW) / 2);
      let targetY = Math.round(petY - bubbleH + 18);

      // Boundary safety
      if (targetX < 10) targetX = 10;
      if (targetX + bubbleW > screenW - 10) targetX = screenW - bubbleW - 10;

      // If too close to top of screen, flip below pet
      if (targetY < 20) {
        targetY = Math.round(petY + petH - 12);
      }

      this.window.setPosition(targetX, targetY);
    } catch (e) {}
  }

  /**
   * Enqueue a message to show in the speech bubble
   * @param {Object} item { text, badge, duration, sound, emotion }
   */
  show(item) {
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

    this.isShowing = true;
    const item = this.queue.shift();

    if (!this.window || this.window.isDestroyed()) {
      this.createWindow();
    }

    this.syncPosition();

    // Trigger pet reaction (surprised -> happy)
    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      const emo = item.emotion || 'happy';
      this.petWindowRef.webContents.send('pet:set-state', { state: 'surprised', duration: 400 });
      setTimeout(() => {
        if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
          this.petWindowRef.webContents.send('pet:set-state', { state: emo, duration: 3500 });
        }
      }, 350);

      // Play sound if enabled
      const soundEnabled = store.get('settings.behavior.sounds') !== false;
      if (soundEnabled) {
        this.petWindowRef.webContents.send('pet:play-sound', item.sound || 'chirp');
      }
    }

    const defaultDuration = (store.get('settings.behavior.bubbleDuration') || 5) * 1000;
    const duration = item.duration || defaultDuration;

    this.window.showInactive();
    this.window.webContents.send('bubble:display', {
      text: item.text,
      badge: item.badge || null,
      duration,
      accentColor: this.accentColor
    });
  }

  hide() {
    this.queue = [];
    this.isShowing = false;
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('bubble:hide');
    }
  }
}

module.exports = new BubbleWindowManager();
