const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor, systemPreferences, desktopCapturer, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let _si = null;
function getSi() {
  if (!_si) _si = require('systeminformation');
  return _si;
}

const store = require('./secure-store');
const aiService = require('./ai-service');
const bubble = require('./bubble-window');
const scheduler = require('./scheduler');
const systemSense = require('./system-sense');
const contextSensor = require('./context-sensor');

app.commandLine.appendSwitch('disable-features', 'Autofill,Translate,MediaRouter,CalculateNativeWinOcclusion,SpareRendererForSitePerProcess');
app.commandLine.appendSwitch('renderer-process-limit', '2');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');

// Global Error Handlers
process.on('uncaughtException', (err) => {
  console.error('[Desktop Pet] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Desktop Pet] Unhandled Rejection:', reason);
});

let petWindow = null;
let panelWindow = null;
let tray = null;
let dragStartPos = null;
let panelDragOffset = null;
let cursorPollInterval = null;
let idlePollInterval = null;
let lastCursorPos = { x: 0, y: 0 };
let lastPanelBlurTime = 0;
let petIdleState = 'neutral';

// App naming & branding
const defaultPetName = store.get('settings.general.petName') || 'Desktop Pet';
app.setName(defaultPetName);

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Desktop Pet] Another instance is already running.');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.show();
    }
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.show();
      panelWindow.focus();
    }
  });
}

function getAppIconPath() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function createTray() {
  try {
    const petName = store.get('settings.general.petName') || 'Pet';
    const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
    let icon = null;
    if (fs.existsSync(iconPath)) {
      icon = nativeImage.createFromPath(iconPath);
      if (process.platform === 'darwin') {
        icon.setTemplateImage(true);
      }
    } else {
      icon = nativeImage.createEmpty();
    }

    if (!tray) {
      tray = new Tray(icon);
    } else {
      tray.setImage(icon);
    }
    tray.setToolTip(`${petName} — Desktop Pet`);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Show/Hide ${petName}`,
        click: () => {
          if (!petWindow) return;
          if (petWindow.isVisible()) petWindow.hide();
          else petWindow.show();
        }
      },
      {
        label: 'Open Chat & Assistant',
        click: () => {
          showPanel();
          if (panelWindow) panelWindow.webContents.send('panel:switch-tab', 'chat');
        }
      },
      {
        label: 'Settings...',
        click: () => {
          showPanel();
          if (panelWindow) panelWindow.webContents.send('panel:switch-tab', 'settings');
        }
      },
      { type: 'separator' },
      {
        label: `Quit ${petName}`,
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      togglePanel();
    });
  } catch (err) {
    console.warn('[Desktop Pet] Could not create system tray icon:', err);
  }
}

function getPetWindowSize(scale = 1.0) {
  const s = Math.max(0.5, Math.min(3.0, scale));
  const w = Math.round(230 * s);
  const h = Math.round(230 * s);
  return [w, h];
}

function createPetWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  const appConfig = store.get('settings.appearance') || {};
  const currentScale = appConfig.scale || 1.0;
  const [winW, winH] = getPetWindowSize(currentScale);

  const rememberPos = store.get('settings.general.rememberPosition') !== false;
  let posX = store.get('window.petX');
  let posY = store.get('window.petY');

  if (!rememberPos || posX === undefined || posY === undefined) {
    posX = Math.round(screenW - winW - 50);
    posY = Math.round(screenH - winH - 80);
  }

  petWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: posX,
    y: posY,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    icon: getAppIconPath(),
    alwaysOnTop: store.get('settings.general.alwaysOnTop') !== false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  if (process.platform === 'darwin') {
    try {
      petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      petWindow.setAlwaysOnTop(true, 'screen-saver');
    } catch (e) {}
  }

  petWindow.loadFile(path.join(__dirname, '..', 'pet-window', 'pet.html'));

  // Default to ignoring mouse events so transparent padding lets clicks pass straight through
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  isPetHoveredOrInside = false;

  petWindow.on('moved', () => {
    if (petWindow && store.get('settings.general.rememberPosition') !== false) {
      const [x, y] = petWindow.getPosition();
      store.set('window.petX', x);
      store.set('window.petY', y);
    }
    bubble.syncPosition();
  });

  // Link components to pet window
  bubble.setPetWindow(petWindow);
  systemSense.setPetWindow(petWindow);

  // Start throttled cursor tracking & idle detection
  startThrottledCursorTracking();
  startIdleMonitoring();
}

/**
 * Shape-Accurate Hit Testing (Item H1)
 * Tests whether cursor is inside the pet's real rounded-rectangle
 * (from size/width/height/roundness settings) plus bubble rectangle when visible.
 * Includes 2px hysteresis to prevent edge jitter.
 */
let isPetHoveredOrInside = false;

function isCursorInPetHitArea(screenX, screenY) {
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) {
    return false;
  }

  // Always keep accepting mouse events while user is dragging
  if (dragStartPos) {
    return true;
  }

  const [winX, winY] = petWindow.getPosition();
  const [winW, winH] = petWindow.getSize();

  // Quick bounds reject outside pet window
  if (screenX < winX || screenX > winX + winW || screenY < winY || screenY > winY + winH) {
    return false;
  }

  const relX = screenX - winX;
  const relY = screenY - winY;

  // 1. Check Speech Bubble (if visible)
  if (bubble && bubble.isShowing) {
    const bubbleMaxW = 270;
    const bubbleW = Math.min(bubbleMaxW, winW - 20);
    const bubbleX = (winW - bubbleW) / 2;
    const bubbleY = 10;
    const bubbleH = 75;
    const bPad = isPetHoveredOrInside ? 2 : 0;
    if (relX >= bubbleX - bPad && relX <= bubbleX + bubbleW + bPad &&
        relY >= bubbleY - bPad && relY <= bubbleY + bubbleH + bPad) {
      return true;
    }
  }

  // 2. Check Pet's Real Rounded-Rectangle Shape
  const appConfig = store.get('settings.appearance') || {};
  const scale = appConfig.scale || 1.0;
  const cfgW = Math.max(60, Math.min(200, appConfig.width !== undefined ? appConfig.width : 136));
  const cfgH = Math.max(60, Math.min(200, appConfig.height !== undefined ? appConfig.height : 120));
  const roundness = appConfig.roundness !== undefined ? appConfig.roundness : 36;

  const size = Math.round(180 * scale);
  const k = size / 220; // SVG viewBox to screen scale factor

  const cx = 110;
  const cy = 110;
  const vx = cx - cfgW / 2;
  const vy = cy - cfgH / 2;
  const maxR = Math.min(cfgW, cfgH) / 2;
  const vrx = Math.max(0, Math.min(maxR, maxR * (roundness / 50)));

  // SVG position inside window:
  // .pet-app-container: flex column, align-items: center, justify-content: flex-end, padding-bottom: 10px
  const svgX = (winW - size) / 2;
  const svgY = winH - 10 - size;

  // Real pet body rounded rect in window coordinates:
  const bodyX = svgX + vx * k;
  const bodyY = svgY + vy * k;
  const bodyW = cfgW * k;
  const bodyH = cfgH * k;
  const bodyR = vrx * k;

  // 2px hysteresis: if already inside, expand test area by 2px to prevent flicker at boundary
  const pad = isPetHoveredOrInside ? 2 : 0;

  const minX = bodyX - pad;
  const maxX = bodyX + bodyW + pad;
  const minY = bodyY - pad;
  const maxY = bodyY + bodyH + pad;
  const r = bodyR + pad;

  // Check outer bounding box
  if (relX < minX || relX > maxX || relY < minY || relY > maxY) {
    return false;
  }

  // Check 4 rounded corners
  if (relX < minX + r && relY < minY + r) {
    return Math.hypot(relX - (minX + r), relY - (minY + r)) <= r;
  }
  if (relX > maxX - r && relY < minY + r) {
    return Math.hypot(relX - (maxX - r), relY - (minY + r)) <= r;
  }
  if (relX < minX + r && relY > maxY - r) {
    return Math.hypot(relX - (minX + r), relY - (maxY - r)) <= r;
  }
  if (relX > maxX - r && relY > maxY - r) {
    return Math.hypot(relX - (maxX - r), relY - (maxY - r)) <= r;
  }

  // Inside straight cross / body interior
  return true;
}

/**
 * Adaptive Cursor Tracking (Max 30 Hz / 33ms only while moving)
 * - Shape-accurate hit testing with 2px hysteresis for transparent mouse pass-through
 * - Checks delta: only sends IPC if cursor moved by > 1.5px
 * - Automatically throttles down to 300ms when cursor is still (0% idle CPU)
 * - Immediately stops completely when pet is sleeping
 */
let stillCount = 0;

function pollCursorTick() {
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible() || petIdleState === 'sleeping') {
    return;
  }

  try {
    const cursor = screen.getCursorScreenPoint();

    // 1. Shape-accurate hit testing with 2px hysteresis (Item H1)
    if (!dragStartPos) {
      const isInside = isCursorInPetHitArea(cursor.x, cursor.y);
      if (isInside !== isPetHoveredOrInside) {
        isPetHoveredOrInside = isInside;
        petWindow.setIgnoreMouseEvents(!isInside, { forward: true });
      }
    }

    const dist = Math.hypot(cursor.x - lastCursorPos.x, cursor.y - lastCursorPos.y);
    if (dist < 1.5) {
      stillCount++;
      // If still for > 6 ticks (~200ms), drop to slow 300ms polling to eliminate CPU
      if (stillCount === 7 && cursorPollInterval) {
        clearInterval(cursorPollInterval);
        cursorPollInterval = setInterval(pollCursorTick, 300);
      }
      return;
    }

    // Cursor is moving!
    lastCursorPos = { x: cursor.x, y: cursor.y };
    if (stillCount >= 7) {
      // Restore fast 33ms polling
      clearInterval(cursorPollInterval);
      cursorPollInterval = setInterval(pollCursorTick, 33);
    }
    stillCount = 0;

    const [winX, winY] = petWindow.getPosition();
    const [winW, winH] = petWindow.getSize();

    const petCenterX = winX + winW / 2;
    const petCenterY = winY + winH / 2;

    const maxDistance = 500;
    const diffX = cursor.x - petCenterX;
    const diffY = cursor.y - petCenterY;

    const normX = Math.max(-1, Math.min(1, diffX / maxDistance));
    const normY = Math.max(-1, Math.min(1, diffY / maxDistance));

    petWindow.webContents.send('pet:global-cursor', { normX, normY });
  } catch (e) {}
}

function startThrottledCursorTracking() {
  if (cursorPollInterval) clearInterval(cursorPollInterval);
  stillCount = 0;
  cursorPollInterval = setInterval(pollCursorTick, 33);
}

function stopCursorTracking() {
  if (cursorPollInterval) {
    clearInterval(cursorPollInterval);
    cursorPollInterval = null;
  }
}

/**
 * Event-Driven Idle Monitoring using Electron powerMonitor.getSystemIdleTime
 * Triggers:
 * - Idle >= 2 min -> sleepy
 * - Idle >= 5 min -> sleeping
 * - Any activity -> wakes up (surprised -> neutral)
 */
function startIdleMonitoring() {
  if (idlePollInterval) clearInterval(idlePollInterval);

  idlePollInterval = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;

    try {
      const idleSec = powerMonitor.getSystemIdleTime();
      const sleepySec = (store.get('settings.behavior.idleSleepyMinutes') || 2) * 60;
      const sleepingSec = (store.get('settings.behavior.idleSleepingMinutes') || 5) * 60;

      if (idleSec >= sleepingSec) {
        if (petIdleState !== 'sleeping') {
          petIdleState = 'sleeping';
          systemSense.setSleeping(true);
          stopCursorTracking();
          petWindow.webContents.send('pet:set-state', { state: 'sleeping' });
        }
      } else if (idleSec >= sleepySec) {
        if (petIdleState !== 'sleepy' && petIdleState !== 'sleeping') {
          petIdleState = 'sleepy';
          petWindow.webContents.send('pet:set-state', { state: 'sleepy' });
        }
      } else {
        // User is active
        if (petIdleState === 'sleeping' || petIdleState === 'sleepy') {
          petIdleState = 'neutral';
          systemSense.setSleeping(false);
          startThrottledCursorTracking();
          petWindow.webContents.send('pet:set-state', { state: 'surprised', duration: 450 });
          setTimeout(() => {
            if (petWindow && !petWindow.isDestroyed() && petIdleState === 'neutral') {
              petWindow.webContents.send('pet:set-state', { state: 'neutral' });
            }
          }, 450);
        }
      }
    } catch (e) {}
  }, 3000);

  // Pause animations & sensors when screen is locked or system is suspended
  try {
    powerMonitor.on('lock-screen', () => {
      petIdleState = 'sleeping';
      systemSense.setSleeping(true);
      stopCursorTracking();
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'sleeping' });
      }
    });
    powerMonitor.on('suspend', () => {
      petIdleState = 'sleeping';
      systemSense.setSleeping(true);
      stopCursorTracking();
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'sleeping' });
      }
    });
    powerMonitor.on('unlock-screen', () => {
      petIdleState = 'neutral';
      systemSense.setSleeping(false);
      startThrottledCursorTracking();
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'neutral' });
      }
    });
    powerMonitor.on('resume', () => {
      petIdleState = 'neutral';
      systemSense.setSleeping(false);
      startThrottledCursorTracking();
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'neutral' });
      }
    });
  } catch (e) {}
}

function closePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    try {
      const [w, h] = panelWindow.getSize();
      store.set('window.panelWidth', w);
      store.set('window.panelHeight', h);
    } catch (e) {}
    panelWindow.destroy();
    panelWindow = null;
  }
}

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea; // { x, y, width, height }
  
  const savedW = store.get('window.panelWidth') || 520;
  const savedH = store.get('window.panelHeight') || 680;

  const width = Math.min(Math.max(420, savedW), workArea.width - 32);
  const height = Math.min(Math.max(560, savedH), workArea.height - 32);

  // Position adjacent to pet, strictly clamped within workArea
  let targetX = Math.round(workArea.x + (workArea.width - width) / 2);
  let targetY = Math.round(workArea.y + (workArea.height - height) / 2);

  if (petWindow && !petWindow.isDestroyed()) {
    const [petX, petY] = petWindow.getPosition();
    const [petW, petH] = petWindow.getSize();

    targetX = petX - width - 16;
    if (targetX < workArea.x + 16) {
      targetX = petX + petW + 16;
    }
    if (targetX + width > workArea.x + workArea.width - 16) {
      targetX = Math.max(workArea.x + 16, workArea.x + workArea.width - width - 16);
    }

    targetY = Math.round(petY - (height - petH) / 2);
    if (targetY < workArea.y + 10) targetY = workArea.y + 10;
    if (targetY + height > workArea.y + workArea.height - 16) {
      targetY = Math.max(workArea.y + 10, workArea.y + workArea.height - height - 16);
    }
  }

  panelWindow = new BrowserWindow({
    width,
    height,
    x: targetX,
    y: targetY,
    minWidth: 420,
    minHeight: 560,
    show: false,
    transparent: false,
    frame: false,
    backgroundColor: '#141418',
    hasShadow: true,
    roundedCorners: true,
    resizable: true,
    skipTaskbar: false,
    icon: getAppIconPath(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  panelWindow.loadFile(path.join(__dirname, '..', 'panel-window', 'panel.html'));

  panelWindow.once('ready-to-show', () => {
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.show();
      panelWindow.focus();
    }
  });

  panelWindow.on('blur', () => {
    lastPanelBlurTime = Date.now();
  });

  panelWindow.on('closed', () => {
    panelWindow = null;
  });
}

function showPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) {
    createPanelWindow();
  } else {
    panelWindow.show();
    panelWindow.focus();
  }
}

function togglePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    closePanel();
  } else {
    showPanel();
  }
}

function relayToPet(channel, data) {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send(channel, data);
  }
}

// --- IPC COMMUNICATIONS ---

// Pet click & Panel toggle
ipcMain.on('pet:clicked', () => {
  if (Date.now() - lastPanelBlurTime < 250) return;
  togglePanel();
});

ipcMain.on('panel:toggle', () => {
  togglePanel();
});

ipcMain.on('panel:open', (e, opts) => {
  showPanel();
  if (opts && opts.tab && panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('panel:switch-tab', opts.tab);
  }
});

ipcMain.on('panel:close', () => {
  closePanel();
});

ipcMain.on('panel:minimize', () => {
  closePanel();
});

ipcMain.on('pet:hide', () => {
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide();
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
  bubble.hide();
});

// Dragging: Moves pet AND follows panel when dragged
ipcMain.on('pet:drag-move', (e, { screenX, screenY }) => {
  if (!petWindow || petWindow.isDestroyed()) return;

  if (!dragStartPos) {
    const [winX, winY] = petWindow.getPosition();
    dragStartPos = {
      offsetX: screenX - winX,
      offsetY: screenY - winY
    };

    if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
      const [panX, panY] = panelWindow.getPosition();
      panelDragOffset = {
        diffX: panX - winX,
        diffY: panY - winY
      };
    } else {
      panelDragOffset = null;
    }
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
  const [petW, petH] = petWindow.getSize();

  let newPetX = Math.round(screenX - dragStartPos.offsetX);
  let newPetY = Math.round(screenY - dragStartPos.offsetY);

  // Constrain pet within screen
  newPetX = Math.max(10, Math.min(screenW - petW - 10, newPetX));
  newPetY = Math.max(20, Math.min(screenH - petH - 20, newPetY));

  petWindow.setPosition(newPetX, newPetY);
  bubble.syncPosition();

  // Follow panel if open
  if (panelDragOffset && panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) {
    const [panW, panH] = panelWindow.getSize();
    let newPanX = newPetX + panelDragOffset.diffX;
    let newPanY = newPetY + panelDragOffset.diffY;

    newPanX = Math.max(10, Math.min(screenW - panW - 10, newPanX));
    newPanY = Math.max(30, Math.min(screenH - panH - 30, newPanY));

    panelWindow.setPosition(newPanX, newPanY);
  }
});

ipcMain.on('pet:drag-end', () => {
  dragStartPos = null;
  panelDragOffset = null;
  if (petWindow && !petWindow.isDestroyed() && store.get('settings.general.rememberPosition') !== false) {
    const [x, y] = petWindow.getPosition();
    store.set('window.petX', x);
    store.set('window.petY', y);
  }
  bubble.syncPosition();

  // Re-evaluate mouse ignore state immediately after drag
  if (petWindow && !petWindow.isDestroyed()) {
    try {
      const cursor = screen.getCursorScreenPoint();
      isPetHoveredOrInside = isCursorInPetHitArea(cursor.x, cursor.y);
      petWindow.setIgnoreMouseEvents(!isPetHoveredOrInside, { forward: true });
    } catch (e) {}
  }
});

ipcMain.on('pet:set-ignore-mouse-events', (e, ignore) => {
  if (dragStartPos) return; // Keep accepting events while dragging
  if (petWindow && !petWindow.isDestroyed()) {
    isPetHoveredOrInside = !ignore;
    petWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// Speech Bubbles & Notifications
ipcMain.on('pet:show-bubble', (e, data) => {
  bubble.show(data);
});

ipcMain.on('pet:hide-bubble', () => {
  bubble.hide();
});

ipcMain.on('pet:set-state', (e, data) => {
  relayToPet('pet:set-state', data);
});

// AI Provider IPC Endpoints (Run in Node Main Process)
ipcMain.handle('ai:test-connection', async (e, { provider, apiKey, model, baseUrl }) => {
  return await aiService.testConnection(provider, apiKey, model, baseUrl);
});

ipcMain.handle('ai:fetch-models', async (e, { provider, apiKey, baseUrl }) => {
  return await aiService.fetchModels(provider, apiKey, baseUrl);
});

ipcMain.on('ai:start-chat', async (event, params) => {
  const requestId = params.requestId || String(Date.now());

  await aiService.streamChat(
    requestId,
    params,
    (chunk) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`ai:chunk:${requestId}`, chunk);
      }
    },
    (fullResponse) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`ai:done:${requestId}`, fullResponse);
      }
    },
    (errorData) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`ai:error:${requestId}`, errorData);
      }
      // On error, show confused pet face
      relayToPet('pet:set-state', { state: 'confused', duration: 4000 });
      bubble.show({
        badge: 'AI NOTICE',
        text: errorData.friendly || 'Could not complete request.',
        sound: 'tap',
        emotion: 'confused'
      });
    }
  );
});

// Secure API Key Management
ipcMain.handle('ai:get-key', (e, provider) => {
  return store.getApiKey(provider);
});

ipcMain.handle('ai:save-key', (e, { provider, key }) => {
  return store.setApiKey(provider, key);
});

ipcMain.handle('ai:has-key', (e, provider) => {
  return store.hasApiKey(provider);
});

// Desktop & Browser Context Detection
ipcMain.handle('context:get-active', async () => {
  return await contextSensor.getActiveContext();
});

ipcMain.handle('context:capture-screen', async () => {
  return await contextSensor.captureActiveScreen();
});

// Appearance & State Persistence
ipcMain.on('pet:update-appearance', (e, appearance) => {
  store.set('settings.appearance', appearance);
  relayToPet('pet:apply-appearance', appearance);

  if (petWindow && !petWindow.isDestroyed() && appearance.scale) {
    const [newW, newH] = getPetWindowSize(appearance.scale);
    const [currW, currH] = petWindow.getSize();
    if (newW !== currW || newH !== currH) {
      petWindow.setSize(newW, newH);
    }
  }
});

ipcMain.on('pet:update-name', (e, name) => {
  store.set('settings.general.petName', name);
  app.setName(name);
  createTray();
  relayToPet('pet:update-name', name);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('panel:update-name', name);
  }
});

ipcMain.on('pet:update-accent', (e, color) => {
  store.set('settings.appearance.accentColor', color);
  relayToPet('pet:update-accent', color);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('panel:update-accent', color);
  }
});

ipcMain.on('pet:get-appearance', (e) => {
  const defaults = {
    scale: 1.0,
    width: 136,
    height: 120,
    roundness: 36,
    eyeSize: 1.0,
    eyeSpacing: 44,
    mouthWidth: 14,
    depth: 80,
    bodyColor: '#FFFFFF'
  };
  e.returnValue = Object.assign(defaults, store.get('settings.appearance') || {});
});

ipcMain.on('reminders:snooze', (e, { id, minutes }) => {
  scheduler.snoozeReminder(id, minutes);
});

ipcMain.on('window:set-always-on-top', (e, val) => {
  if (petWindow) petWindow.setAlwaysOnTop(val);
  if (panelWindow) panelWindow.setAlwaysOnTop(val);
});

ipcMain.on('window:set-launch-login', (e, openAtLogin) => {
  app.setLoginItemSettings({ openAtLogin: !!openAtLogin });
});

// Behavior & Reactions IPC
ipcMain.on('behavior:update', (e, updates) => {
  if (updates.idleSleepyMinutes !== undefined) {
    store.set('settings.behavior.idleSleepyMinutes', updates.idleSleepyMinutes);
  }
  if (updates.idleSleepingMinutes !== undefined) {
    store.set('settings.behavior.idleSleepingMinutes', updates.idleSleepingMinutes);
  }
  startIdleMonitoring();
});

ipcMain.on('behavior:dnd-toggle', (e, val) => {
  store.set('settings.behavior.dnd', val);
});

ipcMain.on('settings:reactions-updated', (e, updates) => {
  if (updates && typeof updates === 'object') {
    Object.keys(updates).forEach(key => {
      store.set(`settings.reactions.${key}`, updates[key]);
    });
  }
});

// Full System Monitoring Handler for Tools Tab
let cachedStaticInfo = null;
let lastProcessList = [];
let lastProcessFetchTime = 0;
let lastFsSize = [];
let lastFsFetchTime = 0;

ipcMain.handle('system:get-stats', async () => {
  try {
    const now = Date.now();

    const _s = getSi();
    if (!cachedStaticInfo) {
      const [cpu, osInfo, graphics] = await Promise.all([
        _s.cpu().catch(() => ({})),
        _s.osInfo().catch(() => ({})),
        _s.graphics().catch(() => null)
      ]);
      cachedStaticInfo = {
        cpuModel: `${cpu.manufacturer || ''} ${cpu.brand || 'Processor'}`.trim(),
        cpuSpeed: cpu.speed || 0,
        osDistro: osInfo.distro || (process.platform === 'darwin' ? 'macOS' : process.platform),
        osRelease: osInfo.release || '',
        gpuModel: graphics?.controllers?.[0]?.model || 'Integrated GPU',
        gpuVram: graphics?.controllers?.[0]?.vram || null
      };
    }

    if (now - lastProcessFetchTime > 3000) {
      _s.processes().then(p => {
        lastProcessList = (p.list || [])
          .sort((a, b) => (b.cpu + b.mem) - (a.cpu + a.mem))
          .slice(0, 5)
          .map(proc => ({
            pid: proc.pid,
            name: proc.name,
            cpu: parseFloat((proc.cpu || 0).toFixed(1)),
            mem: parseFloat((proc.mem || 0).toFixed(1))
          }));
        lastProcessFetchTime = Date.now();
      }).catch(() => {});
    }

    if (now - lastFsFetchTime > 5000) {
      _s.fsSize().then(disks => {
        lastFsSize = (disks || [])
          .filter(d => d.size > 0 && (d.mount === '/' || d.mount.startsWith('/Volumes/')))
          .map(d => ({
            fs: d.fs,
            mount: d.mount,
            usedGb: (d.used / (1024 ** 3)).toFixed(1),
            totalGb: (d.size / (1024 ** 3)).toFixed(1),
            percent: Math.round(d.use)
          }));
        lastFsFetchTime = Date.now();
      }).catch(() => {});
    }

    const [load, mem, netStats, battery] = await Promise.all([
      _s.currentLoad().catch(() => ({ currentLoad: 0, cpus: [] })),
      _s.mem().catch(() => ({ total: 1, used: 0, swapused: 0, swaptotal: 0 })),
      _s.networkStats().catch(() => []),
      _s.battery().catch(() => ({ hasBattery: false, percent: 100, isCharging: true }))
    ]);

    let time = { uptime: 0 };
    try {
      time = _s.time();
    } catch (e) {}

    const cores = (load.cpus || []).map((c, idx) => ({
      core: idx + 1,
      load: Math.round(c.load || 0)
    }));

    let temp = null;
    try {
      const t = await _s.cpuTemperature();
      if (t && t.main > 0) temp = Math.round(t.main);
    } catch (e) {}

    let rxKb = 0;
    let txKb = 0;
    if (Array.isArray(netStats)) {
      for (const n of netStats) {
        if (n.rx_sec) rxKb += n.rx_sec / 1024;
        if (n.tx_sec) txKb += n.tx_sec / 1024;
      }
    }

    const memUsage = process.memoryUsage();
    const petRamMb = Math.round(memUsage.rss / (1024 * 1024));

    return {
      cpu: {
        model: cachedStaticInfo.cpuModel,
        totalLoad: Math.round(load.currentLoad || 0),
        cores,
        temp
      },
      ram: {
        totalGb: (mem.total / (1024 ** 3)).toFixed(1),
        usedGb: (mem.used / (1024 ** 3)).toFixed(1),
        percent: Math.round((mem.used / (mem.total || 1)) * 100),
        swapUsedGb: (mem.swapused / (1024 ** 3)).toFixed(1),
        swapTotalGb: (mem.swaptotal / (1024 ** 3)).toFixed(1)
      },
      gpu: {
        model: cachedStaticInfo.gpuModel,
        vram: cachedStaticInfo.gpuVram
      },
      disks: lastFsSize,
      network: {
        rxKb: Math.round(rxKb),
        txKb: Math.round(txKb)
      },
      battery: {
        hasBattery: battery.hasBattery,
        percent: battery.percent,
        isCharging: battery.isCharging
      },
      os: {
        distro: cachedStaticInfo.osDistro,
        uptimeSeconds: Math.round(time?.uptime || 0)
      },
      topProcesses: lastProcessList,
      petUsage: (() => {
        try {
          const metrics = app.getAppMetrics();
          let totalRamBytes = 0;
          let totalCpu = 0;
          for (const m of metrics) {
            if (m.memory && m.memory.workingSetSize) totalRamBytes += m.memory.workingSetSize * 1024;
            if (m.cpu && m.cpu.percentCPUUsage) totalCpu += m.cpu.percentCPUUsage;
          }
          return {
            ramMb: Math.round((totalRamBytes > 0 ? totalRamBytes : process.memoryUsage().rss) / (1024 * 1024)),
            cpuPercent: Math.round(totalCpu * 10) / 10,
            processCount: metrics.length
          };
        } catch (e) {
          return { ramMb: Math.round(process.memoryUsage().rss / (1024 * 1024)), cpuPercent: 0, processCount: 0 };
        }
      })()
    };
  } catch (err) {
    console.warn('[Desktop Pet] System stats error:', err);
    return null;
  }
});

// Sensor Status & Settings Pane
ipcMain.handle('system:get-sensor-status', async () => {
  return await systemSense.getSensorStatus();
});

// System Permissions Diagnostics & Actions (Requirement 4)
async function checkSystemPermissions() {
  if (process.platform !== 'darwin') {
    return {
      platform: process.platform,
      isDev: !app.isPackaged,
      accessibility: 'granted',
      screenRecording: 'granted',
      automation: 'granted'
    };
  }

  // 1. Accessibility
  let accessibility = 'denied';
  try {
    accessibility = systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied';
  } catch (e) {
    accessibility = 'denied';
  }

  // 2. Screen Recording
  let screenRecording = 'denied';
  try {
    const status = systemPreferences.getMediaAccessStatus('screen');
    screenRecording = status === 'granted' ? 'granted' : 'denied';
  } catch (e) {
    screenRecording = 'denied';
  }

  // 3. Automation (Apple Events)
  let automation = 'denied';
  try {
    const { execSync } = require('child_process');
    execSync(`osascript -e 'tell application "System Events" to get name of current user'`, { timeout: 1200, stdio: 'pipe' });
    automation = 'granted';
  } catch (e) {
    automation = 'denied';
  }

  return {
    platform: 'darwin',
    isDev: !app.isPackaged,
    accessibility,
    screenRecording,
    automation
  };
}

ipcMain.handle('system:get-permissions-status', async () => {
  return await checkSystemPermissions();
});

ipcMain.handle('system:request-permission', async (event, type) => {
  if (process.platform !== 'darwin') return await checkSystemPermissions();

  if (type === 'accessibility') {
    try {
      systemPreferences.isTrustedAccessibilityClient(true);
    } catch (e) {}
  } else if (type === 'screen' || type === 'screenRecording') {
    try {
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } });
    } catch (e) {}
  } else if (type === 'automation') {
    try {
      const { exec } = require('child_process');
      exec(`osascript -e 'tell application "System Events" to get name of current user'`);
    } catch (e) {}
  }

  return await checkSystemPermissions();
});

ipcMain.on('system:open-permission-settings', (event, type) => {
  if (process.platform !== 'darwin') return;
  let url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
  if (type === 'screen' || type === 'screenRecording') {
    url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
  } else if (type === 'automation') {
    url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation';
  } else if (type === 'notifications') {
    url = 'x-apple.systempreferences:com.apple.preference.notifications';
  }
  shell.openExternal(url).catch(() => {});
});

ipcMain.on('system:open-settings-pane', (event, pane) => {
  if (process.platform === 'darwin') {
    let url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
    if (pane === 'screen' || pane === 'screenRecording') {
      url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    } else if (pane === 'automation') {
      url = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation';
    } else if (pane === 'notifications') {
      url = 'x-apple.systempreferences:com.apple.preference.notifications';
    }
    shell.openExternal(url).catch(() => {});
  }
});

// User Name Setting Handler (Requirement 5)
ipcMain.on('settings:user-name-changed', (event, name) => {
  store.set('settings.general.userName', name);
  systemSense.setUserName(name);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('settings:user-name-updated', name);
  }
});

// Real-time Process Resource Metrics (RAM & CPU)
ipcMain.handle('system:get-app-metrics', async () => {
  try {
    const metrics = app.getAppMetrics();
    let totalRamBytes = 0;
    let totalCpu = 0;

    for (const m of metrics) {
      if (m.memory && m.memory.workingSetSize) {
        totalRamBytes += m.memory.workingSetSize * 1024;
      }
      if (m.cpu && m.cpu.percentCPUUsage) {
        totalCpu += m.cpu.percentCPUUsage;
      }
    }

    const memUsage = process.memoryUsage();
    const finalRamMB = Math.round((totalRamBytes > 0 ? totalRamBytes : memUsage.rss) / (1024 * 1024));

    return {
      totalRamMB: finalRamMB,
      totalCpu: Math.round(totalCpu * 10) / 10,
      processCount: metrics.length
    };
  } catch (e) {
    const memUsage = process.memoryUsage();
    return {
      totalRamMB: Math.round(memUsage.rss / (1024 * 1024)),
      totalCpu: 0.5,
      processCount: 1
    };
  }
});

// App Lifecycle
app.whenReady().then(async () => {
  if (process.argv.includes('--test-chat')) {
    console.log('=== RUNNING PACKAGED CLI CHAT TEST ===');
    const groqKey = store.getApiKey('groq');
    console.log('Groq key exists:', Boolean(groqKey), groqKey ? `(length: ${groqKey.length})` : '');
    const geminiKey = store.getApiKey('gemini');
    console.log('Gemini key exists:', Boolean(geminiKey));

    if (groqKey) {
      console.log('\n--- 1. Testing "hello" with Groq ---');
      await aiService.streamChat('cli_test_1', {
        provider: 'groq',
        messages: [{ role: 'user', content: 'hello' }]
      }, (chunk) => process.stdout.write(chunk), (done) => {
        console.log('\n[DONE hello]:', done);
      }, (err) => {
        console.error('\n[ERR hello]:', err);
      });

      console.log('\n--- 2. Testing "kya haal hai" with Groq ---');
      await aiService.streamChat('cli_test_2', {
        provider: 'groq',
        messages: [{ role: 'user', content: 'kya haal hai' }]
      }, (chunk) => process.stdout.write(chunk), (done) => {
        console.log('\n[DONE kya haal hai]:', done);
      }, (err) => {
        console.error('\n[ERR kya haal hai]:', err);
      });

      console.log('\n--- 3. Testing connection on Groq ---');
      const testRes = await aiService.testConnection('groq', groqKey);
      console.log('Groq test connection result:', testRes);
    }
    app.exit(0);
    return;
  }

  createTray();
  createPetWindow();

  // On first launch only, show centered welcome window (Item W1)
  const isFirstRun = store.get('isFirstRun');
  if (isFirstRun !== false) {
    createWelcomeWindow();
  }

  // Start background services
  scheduler.start();
  systemSense.start();

  // Hide dock icon on macOS (Menu-bar only desktop pet assistant)
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.hide();
    } catch (e) {}
  }

  app.on('activate', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  scheduler.stop();
  systemSense.stop();
  if (cursorPollInterval) clearInterval(cursorPollInterval);
  if (idlePollInterval) clearInterval(idlePollInterval);
});

/**
 * Centered Welcome Screen Window (Item W1)
 * 480x660 solid centered window, destroyed after closing, live pet customization
 */
let welcomeWindow = null;

function createWelcomeWindow() {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.focus();
    return;
  }

  welcomeWindow = new BrowserWindow({
    width: 480,
    height: 660,
    center: true,
    resizable: false,
    frame: false,
    backgroundColor: '#111113',
    hasShadow: true,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: false,
    icon: getAppIconPath(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false
    }
  });

  welcomeWindow.loadFile(path.join(__dirname, '..', 'welcome-window', 'welcome.html'));

  welcomeWindow.once('ready-to-show', () => {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) {
      welcomeWindow.show();
    }
  });

  welcomeWindow.on('closed', () => {
    welcomeWindow = null;
  });
}

// Welcome Window IPC Handlers
ipcMain.handle('welcome:get-init-data', () => {
  return {
    userName: store.get('settings.general.userName') || '',
    petName: store.get('settings.general.petName') || 'Bolt',
    glassesEnabled: store.get('settings.appearance.glassesEnabled') || false,
    appearance: store.get('settings.appearance') || {},
    aiProvider: store.get('settings.ai.activeProvider') || 'gemini',
    aiModel: store.get(`settings.ai.models.${store.get('settings.ai.activeProvider') || 'gemini'}`)
  };
});

ipcMain.on('welcome:open', () => {
  createWelcomeWindow();
});

ipcMain.on('welcome:close', () => {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.close();
  }
});

ipcMain.on('welcome:finish', (e, data) => {
  if (data && data.save) {
    if (data.userName !== undefined) {
      store.set('settings.general.userName', data.userName.trim());
    }
    if (data.petName !== undefined) {
      const pName = data.petName.trim() || 'Bolt';
      store.set('settings.general.petName', pName);
      app.setName(pName);
      createTray();
      relayToPet('pet:update-name', pName);
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('panel:update-name', pName);
      }
    }
    if (data.glassesEnabled !== undefined) {
      store.set('settings.appearance.glassesEnabled', !!data.glassesEnabled);
      relayToPet('pet:update-glasses', !!data.glassesEnabled);
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('panel:update-glasses', !!data.glassesEnabled);
      }
    }
    if (data.appearance) {
      const current = store.get('settings.appearance') || {};
      const updated = Object.assign({}, current, data.appearance);
      store.set('settings.appearance', updated);
      relayToPet('pet:apply-appearance', updated);
    }
    if (data.accentColor) {
      store.set('settings.appearance.accentColor', data.accentColor);
      relayToPet('pet:update-accent', data.accentColor);
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('panel:update-accent', data.accentColor);
      }
    }
    if (data.aiProvider) {
      store.set('settings.ai.activeProvider', data.aiProvider);
    }
    if (data.aiModel && data.aiProvider) {
      store.set(`settings.ai.models.${data.aiProvider}`, data.aiModel);
    }
    if (data.apiKey && data.aiProvider) {
      store.setApiKey(data.aiProvider, data.apiKey);
    }
  }

  // Both Save & Skip mark first run completed
  store.set('isFirstRun', false);

  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.close();
  }
});

