/**
 * Desktop Pet — Unified Application Preload & Event Bus Bridge
 * Exposes window.app with emit, on, once, send, invoke
 */
const { ipcRenderer } = require('electron');

const appApi = {
  emit: (type, payload) => {
    try {
      ipcRenderer.send('app:emit', { type, payload });
    } catch (e) {
      console.error('[app.emit] Error:', e);
    }
  },
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
  },
  once: (channel, listener) => {
    ipcRenderer.once(channel, listener);
  },
  removeListener: (channel, listener) => {
    ipcRenderer.removeListener(channel, listener);
  },
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  }
};

window.app = appApi;

// In-app fallback for global typing animation: every Pixie window reports key
// presses through the shared event bus. The macOS helper covers other apps.
const TYPING_IGNORE_KEYS = new Set([
  'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
]);
let lastTypingEmit = 0;
window.addEventListener('keydown', (event) => {
  if (!event || TYPING_IGNORE_KEYS.has(event.key)) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const now = Date.now();
  if (now - lastTypingEmit < 80) return;
  lastTypingEmit = now;
  appApi.emit('pet:typing', { source: 'app-window' });
}, true);
