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
