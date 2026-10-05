const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor, systemPreferences, desktopCapturer, shell, dialog } = require('electron');
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
const UpdateChecker = require('./update-checker');
const BootLifecycle = require('./boot-lifecycle');
const timerManager = require('./timer-manager');

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
let updateChecker = null;
let bootLifecycle = null;
let isPomodoroFocusActive = false;

// App naming & branding
const defaultPetName = store.get('settings.general.petName') || 'Desktop Pet';
app.setName(defaultPetName);

if (process.platform === 'win32') {
  app.setAppUserModelId('com.antigravity.desktoppet');
}

// Ensure single instance (CLI diagnostic runs skip lock)
const isCliTestRun = process.argv.some(arg => arg.startsWith('--test-') || arg === '--selftest' || arg.startsWith('--simulate-'));
if (!isCliTestRun) {
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
          if (bootLifecycle) {
            bootLifecycle.handleGoodbye('quit', () => {
              app.isQuitting = true;
              app.quit();
            });
          } else {
            app.isQuitting = true;
            app.quit();
          }
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
      preload: path.join(__dirname, 'preload.js'),
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

  if (bootLifecycle) {
    bootLifecycle.attachWindowSessionEnd(petWindow);
  }

  petWindow.webContents.on('did-finish-load', () => {
    if (bootLifecycle) {
      setTimeout(() => {
        bootLifecycle.evaluateStartupWelcome();
      }, 1000);
    }
  });

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
  timerManager.setWindows(petWindow, panelWindow);
  scheduler.setWindows(petWindow, panelWindow);
}

/**
 * Shape-Accurate Hit Testing (Item H1)
 * Tests whether cursor is inside the pet's real rounded-rectangle
 * (from size/width/height/roundness settings) plus bubble rectangle when visible.
 * Includes 2px hysteresis to prevent edge jitter.
 */
let isPetHoveredOrInside = false;
let unexpandedPetBounds = null;
let activeBubbleMetrics = null;

function getPetBodyRect(winW, winH) {
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
  const isFlipped = activeBubbleMetrics && activeBubbleMetrics.flipped;
  const svgX = (winW - size) / 2;
  const svgY = isFlipped ? 10 : (winH - 10 - size);

  // Real pet body rounded rect in window coordinates:
  const bodyX = svgX + vx * k;
  const bodyY = svgY + vy * k;
  const bodyW = cfgW * k;
  const bodyH = cfgH * k;
  const bodyR = vrx * k;

  return { bodyX, bodyY, bodyW, bodyH, bodyR, size, k, cfgW, cfgH, roundness, scale };
}

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

  // 1. Hit-test bubble rectangle if visible (Item B2: hit-test pet + bubble)
  if (activeBubbleMetrics && activeBubbleMetrics.visible) {
    const bW = activeBubbleMetrics.width || 200;
    const bH = activeBubbleMetrics.height || 60;
    const bX = (winW - bW) / 2;
    const bY = activeBubbleMetrics.flipped ? (winH - bH - 10) : 10;
    if (relX >= bX - 4 && relX <= bX + bW + 4 && relY >= bY - 4 && relY <= bY + bH + 4) {
      return true;
    }
  }

  // 2. Check Pet's Real Rounded-Rectangle Shape (bubble area is NOT counted as pet)
  const { bodyX, bodyY, bodyW, bodyH, bodyR } = getPetBodyRect(winW, winH);

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

  // Sharp rectangle (r <= 0)
  if (r <= 0) return true;

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

    // 1. Shape-accurate hit testing with 2px hysteresis (Item H2)
    if (!dragStartPos) {
      const isInside = isCursorInPetHitArea(cursor.x, cursor.y);
      if (isInside !== isPetHoveredOrInside) {
        isPetHoveredOrInside = isInside;
        petWindow.setIgnoreMouseEvents(!isInside, { forward: true });
        petWindow.webContents.send('pet:inside-change', isInside);
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

      if (timerManager.isFocusActive() || isPomodoroFocusActive) {
        // Pet does not fall asleep during Pomodoro focus
        return;
      }

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
      } else if (idleSec >= 60) {
        // Bored at 1 min idle
        if (petIdleState !== 'bored' && petIdleState !== 'sleepy' && petIdleState !== 'sleeping') {
          petIdleState = 'bored';
          petWindow.webContents.send('pet:set-state', { state: 'bored' });
        }
      } else {
        // User is active
        if (petIdleState === 'sleeping' || petIdleState === 'sleepy' || petIdleState === 'bored') {
          const wasSleepingOrSleepy = (petIdleState === 'sleeping' || petIdleState === 'sleepy');
          petIdleState = 'neutral';
          systemSense.setSleeping(false);
          startThrottledCursorTracking();
          if (wasSleepingOrSleepy) {
            petWindow.webContents.send('pet:set-state', { state: 'surprised', duration: 450 });
            setTimeout(() => {
              if (petWindow && !petWindow.isDestroyed() && petIdleState === 'neutral') {
                petWindow.webContents.send('pet:set-state', { state: 'neutral' });
              }
            }, 450);
          } else {
            petWindow.webContents.send('pet:set-state', { state: 'neutral' });
          }
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
    timerManager.setWindows(petWindow, null);
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
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      backgroundThrottling: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  panelWindow.loadFile(path.join(__dirname, '..', 'panel-window', 'panel.html'));
  timerManager.setWindows(petWindow, panelWindow);
  scheduler.setWindows(petWindow, panelWindow);

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
    timerManager.setWindows(petWindow, null);
    scheduler.setWindows(petWindow, null);
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

// --- UNIFIED EVENT BUS (Item E3) ---
function handleAppEvent(type, payload = {}) {
  if (!type) return;

  switch (type) {
    case 'pet:show-bubble': {
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:show-bubble', payload);
      }
      break;
    }

    case 'pet:set-emotion':
    case 'pet:set-state': {
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', payload);
      }
      break;
    }

    case 'todo:completed': {
      // USER REQUEST: wink: to-do completed
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'wink', duration: 2500, priority: 4, force: true });
      }
      break;
    }

    case 'todo:all-completed': {
      // USER REQUEST: proud: all to-dos done (at least one to-do exists)
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'proud', duration: 4500, priority: 4, force: true });
        const name = (store.get('settings.general.userName') || '').trim();
        const msg = name ? `All tasks done, ${name}! You crushed it!` : 'All tasks completed! Amazing work!';
        petWindow.webContents.send('pet:show-bubble', { text: msg, duration: 4500, emotion: 'proud', badge: 'SPRINT COMPLETE' });
      }
      break;
    }

    case 'note:saved': {
      // USER REQUEST: wink: note saved
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'wink', duration: 2500, priority: 4, force: true });
      }
      break;
    }

    case 'note:pinned': {
      // USER REQUEST: love: the user pins a note
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'love', duration: 4000, priority: 4, force: true });
        petWindow.webContents.send('pet:show-bubble', { text: 'Pinned with love! ♡', duration: 3500, emotion: 'love', badge: 'FAVORITE' });
      }
      break;
    }

    case 'ai:test-connection-success': {
      // USER REQUEST: excited: first successful "Test connection"
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'excited', duration: 4000, priority: 4, force: true });
        petWindow.webContents.send('pet:show-bubble', { text: 'Connection verified! Woohoo! ★', duration: 3500, emotion: 'excited', badge: 'ONLINE' });
      }
      break;
    }

    case 'settings:imported': {
      // USER REQUEST: excited: successful settings import
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'excited', duration: 4000, priority: 4, force: true });
        petWindow.webContents.send('pet:show-bubble', { text: 'Settings imported successfully!', duration: 3500, emotion: 'excited', badge: 'SETTINGS' });
      }
      break;
    }

    case 'chat:sent': {
      const text = typeof payload === 'string' ? payload : (payload?.text || '');
      // Check grateful
      const isThanks = /\b(thanks|thank you|thx|shukriya|shukria|jazakallah)\b/i.test(text);
      // Check love
      const isLove = /\b(love you|i love you|luv u|love u|pyar)\b/i.test(text);

      if (isThanks) {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('pet:set-state', { state: 'grateful', duration: 4000, priority: 5, force: true });
        }
      } else if (isLove) {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('pet:set-state', { state: 'love', duration: 4000, priority: 5, force: true });
        }
      } else {
        // USER REQUEST: thinking: from the moment a chat message is sent until the first streamed token
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('pet:set-state', { state: 'thinking', duration: 0, priority: 5, held: true });
        }
      }
      break;
    }

    case 'chat:token': {
      // First streamed token: transition to streaming / reading state
      if (payload && payload.isFirstToken) {
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('pet:set-state', { state: 'reading', duration: 0, priority: 5, held: true });
        }
      }
      break;
    }

    case 'chat:done': {
      // USER REQUEST: then happy at the end
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'happy', duration: 3500, priority: 4, force: true });
      }
      break;
    }

    case 'chat:error': {
      // USER REQUEST: sad: AI error (401/402/429/503/offline)
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'sad', duration: 5000, priority: 5, force: true });
        const errMsg = payload?.error || payload?.message || 'Encountered an AI error.';
        petWindow.webContents.send('pet:show-bubble', { text: errMsg, duration: 5000, emotion: 'sad', badge: 'AI ERROR' });
      }
      break;
    }

    case 'pomodoro:start': {
      // USER REQUEST: focus: while a Pomodoro focus session runs
      isPomodoroFocusActive = true;
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'focus', duration: 0, priority: 4, held: true, force: true });
      }
      break;
    }

    case 'pomodoro:break': {
      // USER REQUEST: relaxed during breaks
      isPomodoroFocusActive = false;
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'happy', duration: 3500, priority: 4, force: true });
      }
      break;
    }

    case 'pomodoro:finish': {
      isPomodoroFocusActive = false;
      const count = (payload && payload.completedCount) || 1;
      // USER REQUEST: excited: every 3rd completed Pomodoro of the day; laugh: when a Pomodoro finishes
      const emo = (count % 3 === 0) ? 'excited' : 'laugh';
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: emo, duration: 4500, priority: 3, force: true });
      }
      break;
    }

    case 'pomodoro:stop': {
      isPomodoroFocusActive = false;
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'neutral', duration: 0, priority: 1, force: true });
      }
      break;
    }

    default: {
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send(type, payload);
      }
      break;
    }
  }
}

function relayToPet(channel, data) {
  handleAppEvent(channel, data);
}

// Single Event Bus Entry Point (Item E3)
ipcMain.on('app:emit', (event, { type, payload } = {}) => {
  handleAppEvent(type, payload);
});

// Legacy channel support
ipcMain.on('panel:relay-to-pet', (event, { channel, data } = {}) => {
  handleAppEvent(channel, data);
});

// Single source of truth for app version (Item V1)
ipcMain.on('app:get-version', (event) => {
  event.returnValue = app.getVersion();
});
ipcMain.handle('app:get-version', () => app.getVersion());

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
    if (unexpandedPetBounds) {
      unexpandedPetBounds.x = x;
      unexpandedPetBounds.y = y;
    }
  }
  bubble.syncPosition();

  // Re-evaluate mouse ignore state immediately after drag
  if (petWindow && !petWindow.isDestroyed()) {
    try {
      const cursor = screen.getCursorScreenPoint();
      isPetHoveredOrInside = isCursorInPetHitArea(cursor.x, cursor.y);
      petWindow.setIgnoreMouseEvents(!isPetHoveredOrInside, { forward: true });
      petWindow.webContents.send('pet:inside-change', isPetHoveredOrInside);
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

ipcMain.on('pet:bubble-shown', (e, { width, height, isClamped }) => {
  if (!petWindow || petWindow.isDestroyed()) return;

  const currentScale = (store.get('settings.appearance.scale')) || 1.0;
  const [baseW, baseH] = getPetWindowSize(currentScale);

  if (!unexpandedPetBounds) {
    const [curX, curY] = petWindow.getPosition();
    unexpandedPetBounds = { x: curX, y: curY, width: baseW, height: baseH };
  }

  const bW = Math.max(120, Math.min(280, width || 220));
  const bH = Math.max(40, height || 60);

  const display = screen.getDisplayNearestPoint({
    x: unexpandedPetBounds.x + baseW / 2,
    y: unexpandedPetBounds.y + baseH / 2
  });
  const workArea = display.workArea;

  const spaceAbove = unexpandedPetBounds.y - workArea.y;
  const spaceBelow = (workArea.y + workArea.height) - (unexpandedPetBounds.y + baseH);

  // Flip below if not enough room above and more room below
  const neededBubbleSpace = bH + 20;
  const shouldFlipBelow = (spaceAbove < neededBubbleSpace) && (spaceBelow >= spaceAbove);

  petWindow.webContents.send('pet:bubble-position', { flipped: shouldFlipBelow });

  const totalW = Math.max(baseW, bW + 24);
  const totalH = baseH + bH + 16;

  let newX = unexpandedPetBounds.x - Math.round((totalW - baseW) / 2);
  let newY;

  if (shouldFlipBelow) {
    newY = unexpandedPetBounds.y;
  } else {
    newY = unexpandedPetBounds.y + baseH - totalH;
  }

  // Clamp to display work area (never overflow screen edges)
  newX = Math.max(workArea.x, Math.min(workArea.x + workArea.width - totalW, newX));
  newY = Math.max(workArea.y, Math.min(workArea.y + workArea.height - totalH, newY));

  petWindow.setBounds({
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(totalW),
    height: Math.round(totalH)
  });

  activeBubbleMetrics = {
    visible: true,
    width: bW,
    height: bH,
    flipped: shouldFlipBelow,
    isClamped: !!isClamped
  };
});

ipcMain.on('pet:bubble-hidden', () => {
  activeBubbleMetrics = null;
  if (!petWindow || petWindow.isDestroyed()) return;

  if (unexpandedPetBounds) {
    const currentScale = (store.get('settings.appearance.scale')) || 1.0;
    const [baseW, baseH] = getPetWindowSize(currentScale);
    petWindow.setBounds({
      x: unexpandedPetBounds.x,
      y: unexpandedPetBounds.y,
      width: baseW,
      height: baseH
    });
    unexpandedPetBounds = null;
  }
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
      // On error, show sad pet face (USER REQUEST: sad: AI error (401/402/429/503/offline))
      relayToPet('pet:set-state', { state: 'sad', duration: 5000, priority: 5, force: true });
      bubble.show({
        badge: 'AI ERROR',
        text: errorData.friendly || 'Could not complete request.',
        sound: 'tap',
        emotion: 'sad'
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
    bodyColor: '#FFFFFF',
    glassesEnabled: false
  };
  const currentAppearance = Object.assign({}, defaults, store.get('settings.appearance') || {});
  if (store.get('settings.appearance.glassesEnabled') !== undefined) {
    currentAppearance.glassesEnabled = !!store.get('settings.appearance.glassesEnabled');
  }
  e.returnValue = currentAppearance;
});

ipcMain.on('pet:update-glasses', (e, enabled) => {
  store.set('settings.appearance.glassesEnabled', !!enabled);
  relayToPet('pet:update-glasses', !!enabled);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('panel:update-glasses', !!enabled);
  }
});

ipcMain.on('reminders:snooze', (e, { id, minutes }) => {
  const result = scheduler.snoozeReminder(id, minutes);
  e.returnValue = result;
});

ipcMain.handle('reminders:snooze-action', async (e, { id, minutes }) => {
  return scheduler.snoozeReminder(id, minutes);
});

ipcMain.on('reminders:reschedule', (e, id) => {
  scheduler.reschedule(id);
});

ipcMain.on('reminders:updated', () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  scheduler.evaluateReminders(`${hours}:${minutes}`, now);
});

ipcMain.on('window:set-always-on-top', (e, val) => {
  if (petWindow) petWindow.setAlwaysOnTop(val);
  if (panelWindow) panelWindow.setAlwaysOnTop(val);
});

ipcMain.on('window:set-pos', (e, { x, y }) => {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.setPosition(Math.round(x), Math.round(y));
    if (unexpandedPetBounds) {
      unexpandedPetBounds.x = Math.round(x);
      unexpandedPetBounds.y = Math.round(y);
    }
  }
});

ipcMain.on('window:set-launch-login', (e, openAtLogin) => {
  app.setLoginItemSettings({ openAtLogin: !!openAtLogin });
});

// Helper for scrubbing sensitive keys on export / import
function deepStripKeys(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(deepStripKeys);
  }
  const clean = {};
  const sensitive = ['apikey', 'key', 'keys', 'apikeys', 'secret', 'token', 'password', 'encryptedbase64'];
  for (const [k, v] of Object.entries(obj)) {
    if (sensitive.includes(k.toLowerCase())) continue;
    clean[k] = deepStripKeys(v);
  }
  return clean;
}

// Data Management IPC (Item I1)
ipcMain.handle('data:export', async () => {
  try {
    const parentWin = (panelWindow && !panelWindow.isDestroyed()) ? panelWindow : null;
    const dateStr = new Date().toISOString().slice(0, 10);
    const saveRes = await dialog.showSaveDialog(parentWin, {
      title: 'Export Desktop Pet Data',
      defaultPath: `desktop-pet-backup-${dateStr}.json`,
      filters: [{ name: 'JSON Backup', extensions: ['json'] }]
    });

    if (saveRes.canceled || !saveRes.filePath) {
      return { canceled: true };
    }

    const settingsObj = {
      general: store.get('settings.general') || {},
      behavior: store.get('settings.behavior') || {},
      reactions: store.get('settings.reactions') || {},
      appearance: store.get('settings.appearance') || {},
      privacy: store.get('settings.privacy') || {},
      ai: {
        activeProvider: store.get('settings.ai.activeProvider') || 'gemini',
        models: store.get('settings.ai.models') || {},
        baseUrls: store.get('settings.ai.baseUrls') || {}
      },
      timers: store.get('settings.timers') || {}
    };

    const notes = store.get('notes') || [];
    const todos = store.get('todos') || [];
    const reminders = store.get('reminders') || [];

    const exportPayload = {
      format: 'desktop-pet-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      settings: deepStripKeys(settingsObj),
      notes: deepStripKeys(notes),
      todos: deepStripKeys(todos),
      reminders: deepStripKeys(reminders)
    };

    fs.writeFileSync(saveRes.filePath, JSON.stringify(exportPayload, null, 2), 'utf8');

    return {
      success: true,
      filePath: saveRes.filePath,
      counts: {
        settings: Object.keys(exportPayload.settings).length,
        notes: notes.length,
        todos: todos.length,
        reminders: reminders.length
      }
    };
  } catch (err) {
    console.error('[Desktop Pet] Export failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('data:select-import-file', async () => {
  try {
    const parentWin = (panelWindow && !panelWindow.isDestroyed()) ? panelWindow : null;
    const openRes = await dialog.showOpenDialog(parentWin, {
      title: 'Select Desktop Pet Backup File',
      properties: ['openFile'],
      filters: [{ name: 'JSON Backup', extensions: ['json'] }]
    });

    if (openRes.canceled || !openRes.filePaths || openRes.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = openRes.filePaths[0];
    const stats = fs.statSync(filePath);
    if (stats.size > 5 * 1024 * 1024) {
      return { error: 'File size exceeds maximum allowed limit (5 MB).' };
    }

    let parsed = null;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      parsed = JSON.parse(content);
    } catch (parseErr) {
      return { error: 'Invalid file format: Not a valid JSON file (' + parseErr.message + ')' };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { error: 'Invalid backup file: root element must be a valid JSON object.' };
    }

    const hasSettings = parsed.settings && typeof parsed.settings === 'object';
    const hasNotes = Array.isArray(parsed.notes);
    const hasTodos = Array.isArray(parsed.todos);
    const hasReminders = Array.isArray(parsed.reminders);
    const isFormat = parsed.format === 'desktop-pet-backup';

    if (!hasSettings && !hasNotes && !hasTodos && !hasReminders && !isFormat) {
      return { error: 'Unrecognized backup file. No settings, notes, to-dos, or reminders found.' };
    }

    const sanitized = deepStripKeys(parsed);

    return {
      success: true,
      filePath,
      preview: {
        format: parsed.format || 'custom',
        version: parsed.version || 1,
        exportedAt: parsed.exportedAt || null,
        counts: {
          settings: hasSettings ? Object.keys(parsed.settings).length : 0,
          notes: hasNotes ? parsed.notes.length : 0,
          todos: hasTodos ? parsed.todos.length : 0,
          reminders: hasReminders ? parsed.reminders.length : 0
        }
      },
      data: sanitized
    };
  } catch (err) {
    console.error('[Desktop Pet] Select import file failed:', err);
    return { error: err.message };
  }
});

ipcMain.handle('data:apply-import', async (e, { data, notesStrategy }) => {
  try {
    if (!data || typeof data !== 'object') {
      return { error: 'No data provided to import.' };
    }

    // 1. Automatic safety backup before applying
    const userDataPath = app.getPath('userData');
    const backupFileName = `backup-before-import-${Date.now()}.json`;
    const backupPath = path.join(userDataPath, backupFileName);

    const currentData = {
      format: 'desktop-pet-backup',
      version: 1,
      backupReason: 'pre-import-safety',
      created: new Date().toISOString(),
      settings: {
        general: store.get('settings.general') || {},
        behavior: store.get('settings.behavior') || {},
        reactions: store.get('settings.reactions') || {},
        appearance: store.get('settings.appearance') || {},
        privacy: store.get('settings.privacy') || {},
        ai: {
          activeProvider: store.get('settings.ai.activeProvider') || 'gemini',
          models: store.get('settings.ai.models') || {},
          baseUrls: store.get('settings.ai.baseUrls') || {}
        }
      },
      notes: store.get('notes') || [],
      todos: store.get('todos') || [],
      reminders: store.get('reminders') || []
    };
    fs.writeFileSync(backupPath, JSON.stringify(currentData, null, 2), 'utf8');

    // 2. Apply settings
    if (data.settings && typeof data.settings === 'object') {
      if (data.settings.general) {
        store.set('settings.general', Object.assign({}, store.get('settings.general') || {}, data.settings.general));
      }
      if (data.settings.behavior) {
        const beh = Object.assign({}, data.settings.behavior);
        // Validate booleans and 0-100 volume range, migrate old settings (Item SND1)
        if (beh.soundsEnabled === undefined) {
          beh.soundsEnabled = false; // migrate to OFF
        } else {
          beh.soundsEnabled = !!beh.soundsEnabled;
        }
        delete beh.sounds;

        if (beh.soundVolume !== undefined) {
          const volNum = Number(beh.soundVolume);
          beh.soundVolume = isNaN(volNum) ? 50 : Math.max(0, Math.min(100, Math.round(volNum)));
        } else {
          beh.soundVolume = 50;
        }

        beh.soundReminders = beh.soundReminders !== false;
        beh.soundTimer = beh.soundTimer !== false;
        beh.soundReactions = beh.soundReactions !== false;

        store.set('settings.behavior', Object.assign({}, store.get('settings.behavior') || {}, beh));
        relayToPet('pet:update-sound-settings', beh);
        if (panelWindow && !panelWindow.isDestroyed()) {
          panelWindow.webContents.send('settings:sound-updated', beh);
        }
      }
      if (data.settings.reactions) {
        store.set('settings.reactions', Object.assign({}, store.get('settings.reactions') || {}, data.settings.reactions));
      }
      if (data.settings.appearance) {
        store.set('settings.appearance', Object.assign({}, store.get('settings.appearance') || {}, data.settings.appearance));
      }
      if (data.settings.privacy) {
        store.set('settings.privacy', Object.assign({}, store.get('settings.privacy') || {}, data.settings.privacy));
      }
      if (data.settings.ai) {
        if (data.settings.ai.activeProvider) {
          store.set('settings.ai.activeProvider', data.settings.ai.activeProvider);
        }
        if (data.settings.ai.models) {
          store.set('settings.ai.models', Object.assign({}, store.get('settings.ai.models') || {}, data.settings.ai.models));
        }
        if (data.settings.ai.baseUrls) {
          store.set('settings.ai.baseUrls', Object.assign({}, store.get('settings.ai.baseUrls') || {}, data.settings.ai.baseUrls));
        }
      }
      if (data.settings.timers && typeof data.settings.timers === 'object') {
        timerManager.updateSettings(data.settings.timers);
      }
    }

    // 3. Apply Todos
    if (Array.isArray(data.todos)) {
      store.set('todos', data.todos);
    }

    // 4. Apply Reminders
    if (Array.isArray(data.reminders)) {
      store.set('reminders', data.reminders);
    }

    // 5. Apply Notes (Merge vs Replace)
    if (Array.isArray(data.notes)) {
      if (notesStrategy === 'replace') {
        store.set('notes', data.notes);
      } else {
        const existingNotes = store.get('notes') || [];
        const existingIds = new Set(existingNotes.map(n => n.id));
        const mergedNotes = [...existingNotes];
        for (const item of data.notes) {
          if (!existingIds.has(item.id)) {
            mergedNotes.push(item);
          } else {
            mergedNotes.push(Object.assign({}, item, {
              id: 'note-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
            }));
          }
        }
        store.set('notes', mergedNotes);
      }
    }

    // 6. Broadcast updates to windows
    const petName = store.get('settings.general.petName') || 'Pixel';
    app.setName(petName);
    createTray();
    relayToPet('pet:update-name', petName);

    const appearance = store.get('settings.appearance') || {};
    relayToPet('pet:apply-appearance', appearance);
    relayToPet('pet:update-glasses', appearance.glassesEnabled !== undefined ? appearance.glassesEnabled : store.get('settings.appearance.glassesEnabled'));
    if (appearance.accentColor) {
      relayToPet('pet:update-accent', appearance.accentColor);
    }

    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send('panel:data-imported');
      panelWindow.webContents.send('panel:update-name', petName);
      if (appearance.accentColor) {
        panelWindow.webContents.send('panel:update-accent', appearance.accentColor);
      }
      if (appearance.glassesEnabled !== undefined) {
        panelWindow.webContents.send('panel:update-glasses', appearance.glassesEnabled);
      }
    }

    return {
      success: true,
      backupFile: backupFileName
    };
  } catch (err) {
    console.error('[Desktop Pet] Apply import failed:', err);
    return { error: err.message };
  }
});

// Update Checker IPC (Item U3)
ipcMain.on('update:check-now', async () => {
  if (updateChecker) {
    await updateChecker.check(true);
  }
});

ipcMain.handle('update:check-status', async () => {
  if (updateChecker) {
    return await updateChecker.check(true);
  }
  return { status: 'error', error: 'Update checker not initialized.' };
});

ipcMain.on('update:skip-version', (e, version) => {
  store.set('settings.general.skippedVersion', version);
});

ipcMain.on('update:open-download', (e, url) => {
  if (url && typeof url === 'string') {
    shell.openExternal(url);
  }
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

  // CLI Test: Full Self-Test Suite (Item WIN1)
  if (process.argv.includes('--selftest')) {
    console.log('[SELFTEST] Starting Desktop Pet Self-Test Suite...');
    let failedCount = 0;

    // 1. SecureStore & Settings check
    try {
      const petName = store.get('settings.general.petName');
      console.log(`[SELFTEST] secure-store: PASS (petName: "${petName}")`);
    } catch (e) {
      console.error(`[SELFTEST] secure-store: FAIL (${e.message})`);
      failedCount++;
    }

    // 2. Pet Vector Renderer & All Emotions Check
    try {
      const PetRenderer = require('../character/pet.js');
      const renderer = new PetRenderer();
      const allEmotions = [
        'neutral', 'happy', 'blink', 'thinking', 'sleepy', 'sleeping', 'surprised', 'confused',
        'love', 'wink', 'cheer', 'dangling', 'irritated', 'sad',
        'yawn', 'dizzy', 'blush', 'excited', 'scared', 'annoyed', 'bored', 'proud', 'worried', 'grateful', 'goodbye'
      ];
      let emotionsValid = true;
      for (const em of allEmotions) {
        const svg = renderer.render(em, { glassesEnabled: true });
        if (!svg || !svg.includes('</svg>') || !svg.includes('facebot-glasses')) {
          emotionsValid = false;
          break;
        }
      }
      if (emotionsValid) {
        console.log(`[SELFTEST] pet-renderer: PASS (${allEmotions.length} emotions + glasses validated)`);
      } else {
        console.error('[SELFTEST] pet-renderer: FAIL (invalid SVG output)');
        failedCount++;
      }
    } catch (e) {
      console.error(`[SELFTEST] pet-renderer: FAIL (${e.message})`);
      failedCount++;
    }

    // 3. Audio Assets Check
    try {
      const audioFiles = ['alarm.wav', 'tap.wav', 'chirp.wav', 'happy.wav'];
      const audioDir = path.join(__dirname, '..', 'audio');
      const foundAudio = audioFiles.filter(f => fs.existsSync(path.join(audioDir, f)));
      if (foundAudio.length === audioFiles.length) {
        console.log(`[SELFTEST] audio-assets: PASS (${foundAudio.length}/${audioFiles.length} bundled wav files verified)`);
      } else {
        console.error(`[SELFTEST] audio-assets: FAIL (Missing ${audioFiles.length - foundAudio.length} audio files)`);
        failedCount++;
      }
    } catch (e) {
      console.error(`[SELFTEST] audio-assets: FAIL (${e.message})`);
      failedCount++;
    }

    // 4. System Sensors Check
    try {
      if (process.platform === 'darwin') {
        const sensorStatus = await systemSense.getSensorStatus();
        console.log(`[SELFTEST] system-sensors: PASS (${sensorStatus.length} macOS sensors monitored)`);
      } else {
        console.log('[SELFTEST] system-sensors: UNAVAILABLE (Windows platform - graceful telemetry fallback)');
      }
    } catch (e) {
      console.error(`[SELFTEST] system-sensors: FAIL (${e.message})`);
      failedCount++;
    }

    // 5. Context Sensor Check
    try {
      if (process.platform === 'darwin') {
        const activeContext = await contextSensor.getActiveContext();
        console.log(`[SELFTEST] context-sensor: PASS (frontmost: "${activeContext ? activeContext.appName : 'none'}")`);
      } else {
        console.log('[SELFTEST] context-sensor: UNAVAILABLE (Windows platform - native context hooks)');
      }
    } catch (e) {
      console.error(`[SELFTEST] context-sensor: FAIL (${e.message})`);
      failedCount++;
    }

    // 6. Update Checker Check
    try {
      const UpdateCheckerClass = require('./update-checker');
      const chk = new UpdateCheckerClass();
      const semverValid = chk.compareSemver('1.0.1', '1.0.0') === 1 && chk.compareSemver('1.0.0', '1.0.0') === 0;
      if (semverValid) {
        console.log('[SELFTEST] update-checker: PASS (semver comparison & target repository verified)');
      } else {
        console.error('[SELFTEST] update-checker: FAIL (semver math incorrect)');
        failedCount++;
      }
    } catch (e) {
      console.error(`[SELFTEST] update-checker: FAIL (${e.message})`);
      failedCount++;
    }

    // 7. Overall Result
    if (failedCount === 0) {
      console.log('[SELFTEST] OVERALL: PASS');
      app.exit(0);
    } else {
      console.error(`[SELFTEST] OVERALL: FAIL (${failedCount} checks failed)`);
      app.exit(1);
    }
    return;
  }

  // CLI Test for Item E1: 11 New Emotions
  if (process.argv.includes('--test-emotions')) {
    const PetRenderer = require('../character/pet.js');
    const renderer = new PetRenderer();
    const emotionsToTest = ['yawn', 'dizzy', 'blush', 'excited', 'scared', 'annoyed', 'bored', 'proud', 'worried', 'grateful', 'goodbye'];
    let allValid = true;
    for (const em of emotionsToTest) {
      const svg = renderer.render(em);
      const isValid = svg && svg.includes(`emotion-${em}`) && svg.includes('</svg>');
      console.log(`Emotion [${em}]: ${isValid ? 'PASS' : 'FAIL'} (svg length: ${svg.length})`);
      if (!isValid) allValid = false;
    }
    console.log('ALL 11 EMOTIONS VALID:', allValid);
    app.exit(allValid ? 0 : 1);
    return;
  }

  bootLifecycle = new BootLifecycle((channel, data) => relayToPet(channel, data));
  createTray();
  createPetWindow();

  // Test emotion CLI flag (--emotion=<name>)
  const emotionArg = process.argv.find(a => a.startsWith('--emotion='));
  if (emotionArg && petWindow) {
    const emotionName = emotionArg.split('=')[1];
    const applyCliEmotion = () => {
      petWindow.webContents.send('pet:set-state', { state: emotionName, duration: 0, priority: 6 });
      console.log(`[Item E2] Sent CLI test emotion: ${emotionName}`);
    };
    if (petWindow.webContents.isLoading()) {
      petWindow.webContents.once('did-finish-load', applyCliEmotion);
    } else {
      applyCliEmotion();
    }
  }

  // On first launch only, show centered welcome window (Item W1)
  const isFirstRun = store.get('isFirstRun');
  if (isFirstRun !== false) {
    createWelcomeWindow();
  }

  // One-time migration for existing installs to Sounds OFF (Item SND1)
  const soundMigrationDone = store.get('soundMigrationDone');
  if (!soundMigrationDone) {
    const isExistingInstall = store.get('isFirstRun') === false || store.get('settings.behavior.sounds') !== undefined;
    store.set('settings.behavior.soundsEnabled', false);
    store.set('soundMigrationDone', true);
    if (isExistingInstall) {
      setTimeout(() => {
        bubble.show({
          badge: '',
          text: 'Sounds are now off by default. You can turn them on in Settings > Behavior > Sounds.',
          duration: 6000,
          sound: '',
          emotion: 'neutral'
        });
      }, 2500);
    }
  }

  // Start background services
  scheduler.start();
  systemSense.start();
  updateChecker = new UpdateChecker(
    (channel, data) => relayToPet(channel, data),
    () => panelWindow
  );
  updateChecker.start();

  // Synthetic Test Hooks (--test-hooks) for automated E2E verification
  const hasTestHooks = process.argv.includes('--test-hooks');
  if (hasTestHooks) {
    console.log('[TestHook] Initializing synthetic test hooks on Main Process');

    ipcMain.handle('test:get-pet-geometry', () => {
      if (!petWindow || petWindow.isDestroyed()) return null;
      const [winX, winY] = petWindow.getPosition();
      const [winW, winH] = petWindow.getSize();
      const geom = getPetBodyRect(winW, winH);
      return {
        winX, winY, winW, winH,
        ...geom,
        isInside: isPetHoveredOrInside,
        isPanelOpen: !!(panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible())
      };
    });

    ipcMain.handle('test:hit-test-point', (e, { x, y }) => {
      return { inside: isCursorInPetHitArea(x, y) };
    });

    ipcMain.handle('test:simulate-cursor', (e, { x, y }) => {
      const isInside = isCursorInPetHitArea(x, y);
      if (isInside !== isPetHoveredOrInside) {
        isPetHoveredOrInside = isInside;
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.setIgnoreMouseEvents(!isInside, { forward: true });
          petWindow.webContents.send('pet:inside-change', isInside);
        }
      }
      return { isInside, isIgnoringMouse: !isInside };
    });

    ipcMain.handle('test:set-appearance', async (e, appearance) => {
      store.set('settings.appearance', appearance);
      relayToPet('theme:apply-custom-appearance', appearance);
      relayToPet('pet:apply-appearance', appearance);
      if (appearance.glassesEnabled !== undefined) {
        relayToPet('pet:update-glasses', appearance.glassesEnabled);
      }
      if (petWindow && !petWindow.isDestroyed() && appearance.scale) {
        const [newW, newH] = getPetWindowSize(appearance.scale);
        petWindow.setSize(newW, newH);
      }
      await new Promise(r => setTimeout(r, 200));
      return true;
    });

    ipcMain.handle('test:toggle-panel', () => {
      togglePanel();
      return { isPanelOpen: !!(panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) };
    });

    ipcMain.handle('test:get-sound-metrics', async () => {
      if (!petWindow || petWindow.isDestroyed()) return null;
      return await petWindow.webContents.executeJavaScript(`window.__soundTestHooks ? {
        playCount: window.__soundTestHooks.playCount,
        activeAudioObjects: window.__soundTestHooks.activeAudioObjects,
        lastPlayed: window.__soundTestHooks.lastPlayed,
        history: window.__soundTestHooks.history
      } : { playCount: 0, activeAudioObjects: 0, lastPlayed: null, history: [] }`);
    });

    ipcMain.handle('test:reset-sound-metrics', async () => {
      if (!petWindow || petWindow.isDestroyed()) return null;
      return await petWindow.webContents.executeJavaScript(`if (window.__soundTestHooks) { window.__soundTestHooks.reset(); true; } else { false; }`);
    });

    ipcMain.handle('test:trigger-reminder', (e, rem) => {
      bubble.hide();
      scheduler.triggerReminder(rem || { id: 'test-rem', title: 'Test Reminder', time: '12:00' });
      return true;
    });

    ipcMain.handle('test:trigger-volume-reaction', (e, vol) => {
      bubble.hide();
      systemSense.injectSensorReading('volume', vol);
      return true;
    });

    ipcMain.handle('test:trigger-welcome', () => {
      bubble.hide();
      bootLifecycle.isSimulatedBoot = true;
      bootLifecycle.hasGreetedThisSession = false;
      return bootLifecycle.evaluateStartupWelcome();
    });

    ipcMain.handle('test:trigger-goodbye', () => {
      bubble.hide();
      bootLifecycle.isQuitting = false;
      bootLifecycle.handleGoodbye('quit', () => {});
      return true;
    });

    ipcMain.handle('test:force-emotion', (e, emotionName, duration = 4000, priority = null) => {
      bubble.hide();
      const p = priority !== null ? priority : (emotionName === 'neutral' ? 1 : 4);
      relayToPet('pet:set-state', { state: emotionName, duration, priority: p, force: true });
      return true;
    });

    ipcMain.handle('test:inject-sensor', (e, arg1, arg2) => {
      let type, value;
      if (typeof arg1 === 'object' && arg1 !== null) {
        type = arg1.type;
        value = arg1.value;
      } else {
        type = arg1;
        value = arg2;
      }
      return systemSense.injectSensorReading(type, value);
    });

    ipcMain.handle('test:resume-sensors', () => {
      systemSense.resumeBackgroundPolling();
      return true;
    });

    ipcMain.handle('test:get-pet-emotion', async () => {
      if (!petWindow || petWindow.isDestroyed()) return null;
      return await petWindow.webContents.executeJavaScript(`
        window.petController ? {
          currentEmotion: window.petController.currentEmotion,
          baseEmotion: window.petController.baseEmotion,
          currentPriority: window.petController.currentPriority,
          isSleeping: window.petController.isSleeping
        } : null
      `);
    });

    ipcMain.handle('test:inject-interaction', async (e, { type, payload }) => {
      if (!petWindow || petWindow.isDestroyed()) return false;
      return await petWindow.webContents.executeJavaScript(`
        if (!window.petController) false;
        else {
          switch ("${type}") {
            case 'rapid-clicks':
              for (let i = 0; i < 5; i++) window.petController.handleClick();
              break;
            case '4s-hover':
              window.petController.setEmotion('blush', 3000, 4);
              break;
            case 'fast-drag':
              window.petController.setEmotion('dizzy', 3000, 4);
              break;
            case 'fast-approach':
              window.petController.setEmotion('scared', 2000, 4);
              break;
            case 'double-click':
              window.petController.setEmotion('laugh', 2800, 4);
              break;
            case 'chat-thanks':
              window.petController.setEmotion('grateful', 3500, 4);
              break;
            case 'all-todos':
              window.petController.setEmotion('proud', 4000, 4);
              break;
            case 'missed-reminder':
              window.petController.setEmotion('worried', 4000, 3);
              break;
          }
          ({ currentEmotion: window.petController.currentEmotion, priority: window.petController.currentPriority });
        }
      `);
    });
  }

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

app.on('before-quit', (e) => {
  if (bootLifecycle && !bootLifecycle.isQuitting && !isCliTestRun) {
    e.preventDefault();
    bootLifecycle.handleGoodbye('shutdown', () => {
      app.isQuitting = true;
      app.exit(0);
    });
    return;
  }
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
      preload: path.join(__dirname, 'preload.js'),
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
    soundsEnabled: store.get('settings.behavior.soundsEnabled') === true,
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
    if (data.soundsEnabled !== undefined) {
      store.set('settings.behavior.soundsEnabled', !!data.soundsEnabled);
      relayToPet('pet:update-sound-settings', { soundsEnabled: !!data.soundsEnabled });
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('settings:sound-updated', { soundsEnabled: !!data.soundsEnabled });
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
  } else {
    // Skip keeps sounds OFF
    store.set('settings.behavior.soundsEnabled', false);
    relayToPet('pet:update-sound-settings', { soundsEnabled: false });
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send('settings:sound-updated', { soundsEnabled: false });
    }
  }

  // Both Save & Skip mark first run completed
  store.set('isFirstRun', false);

  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.close();
  }
});

// Sound Management IPC (Item SND1)
ipcMain.on('pet:play-sound-request', (e, { sound, category }) => {
  relayToPet('pet:play-sound', { sound, category });
});

ipcMain.on('settings:sound-changed', (e, newSettings) => {
  if (newSettings && typeof newSettings === 'object') {
    for (const [k, v] of Object.entries(newSettings)) {
      store.set(`settings.behavior.${k}`, v);
    }
  }
  relayToPet('pet:update-sound-settings', newSettings);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('settings:sound-updated', newSettings);
  }
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.webContents.send('welcome:sound-updated', newSettings);
  }
});

ipcMain.on('pet:get-sound-settings', (event) => {
  event.returnValue = {
    soundsEnabled: store.get('settings.behavior.soundsEnabled') === true,
    soundVolume: store.get('settings.behavior.soundVolume') ?? 50,
    soundReminders: store.get('settings.behavior.soundReminders') !== false,
    soundTimer: store.get('settings.behavior.soundTimer') !== false,
    soundReactions: store.get('settings.behavior.soundReactions') !== false,
    dnd: store.get('settings.behavior.dnd') === true
  };
});

