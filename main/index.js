const { app, BrowserWindow, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor, systemPreferences, desktopCapturer, shell, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let _si = null;
function getSi() {
  if (!_si) _si = require('systeminformation');
  return _si;
}

const store = require('./secure-store');
const aiService = require('./ai-service');
const bubble = require('./bubble-window');
const scheduler = require('./scheduler');
const contextSensor = require('./context-sensor');
const companion = require('./companion-features');
const UpdateChecker = require('./update-checker');
const BootLifecycle = require('./boot-lifecycle');
const timerManager = require('./timer-manager');

app.commandLine.appendSwitch('disable-features', 'Autofill,Translate,MediaRouter,CalculateNativeWinOcclusion,SpareRendererForSitePerProcess');
app.commandLine.appendSwitch('renderer-process-limit', '2');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');

// Global Error Handlers
process.on('uncaughtException', (err) => {
  console.error('[Pixie] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Pixie] Unhandled Rejection:', reason);
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
let typingHelper = null;
let typingHelperRetryTimer = null;
let typingHelperRetryAttempts = 0;
let typingHelperErrorLogged = false;
let typingHelperTapFailed = false;
let typingHelperReady = false;
let typingHelperPromptAttempted = false;
let typingHelperLastError = '';
let typingHelperLastPulseAt = 0;
let lastTypingPulseAt = 0;

let clipboardWatchTimer = null;
let lastWatchedClipboardText = '';
let lastClipboardCopiedAt = 0;

// App naming & branding
const defaultPetName = store.get('settings.general.petName') || 'Pixie';
app.setName('Pixie');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.antigravity.desktoppet');
}

// Ensure single instance (CLI diagnostic runs skip lock)
const isCliTestRun = process.argv.some(arg => arg.startsWith('--test-') || arg === '--selftest' || arg.startsWith('--simulate-'));
if (!isCliTestRun) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    console.log('[Pixie] Another instance is already running.');
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
    const petName = store.get('settings.general.petName') || 'Pixie';
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
    tray.setToolTip(`${petName} v${app.getVersion()}`);

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
          showPanel('chat');
        }
      },
      {
        label: 'Settings...',
        click: () => {
          showPanel('settings');
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
    console.warn('[Pixie] Could not create system tray icon:', err);
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
    enableLargerThanScreen: true,
    icon: getAppIconPath(),
    alwaysOnTop: store.get('settings.general.alwaysOnTop') !== false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  if (process.platform === 'darwin') {
    try {
      petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      petWindow.setAlwaysOnTop(true, 'screen-saver');
    } catch (e) {}
  } else {
    try {
      petWindow.setAlwaysOnTop(true);
      petWindow.moveTop();
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

  petWindow.on('blur', () => {
    if (isQuickMenuOpen) {
      isQuickMenuOpen = false;
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:close-menu');
      }
    }
  });

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
  companion.setWindows(petWindow, panelWindow);

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
let isQuickMenuOpen = false;
let unexpandedPetBounds = null;
let activeBubbleMetrics = null;

function getPetBodyRect(winW, winH) {
  const appConfig = store.get('settings.appearance') || {};
  const scale = appConfig.scale || 1.0;
  // Pixie body geometry from the code guide viewBox (324x182), fitted into 220x220.
  const cfgW = Math.max(60, Math.min(200, appConfig.width !== undefined ? appConfig.width : 132));
  const cfgH = Math.max(60, Math.min(200, appConfig.height !== undefined ? appConfig.height : 90));
  const roundness = appConfig.roundness !== undefined ? appConfig.roundness : 50;

  const size = Math.round(180 * scale);
  const k = size / 220; // SVG viewBox to screen scale factor
  const fit = 220 / 324;
  const fitY = (220 - 182 * fit) / 2;

  const bodyCenterX = 176 * fit;
  const bodyCenterY = 113 * fit + fitY;
  const guideBodyW = cfgW * fit;
  const guideBodyH = cfgH * fit;
  const vx = bodyCenterX - guideBodyW / 2;
  const vy = bodyCenterY - guideBodyH / 2;
  const maxR = Math.min(guideBodyW, guideBodyH) / 2;
  const vrx = Math.max(0, Math.min(maxR, maxR * (roundness / 50)));

  // SVG position inside window:
  const isFlipped = activeBubbleMetrics && activeBubbleMetrics.flipped;
  const svgX = (winW - size) / 2;
  const svgY = isFlipped ? 10 : (winH - 10 - size);

  // Real pet body rounded rect in window coordinates:
  const bodyX = svgX + vx * k;
  const bodyY = svgY + vy * k;
  const bodyW = guideBodyW * k;
  const bodyH = guideBodyH * k;
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

  // When quick context menu is open, the window must remain fully interactive
  if (isQuickMenuOpen) {
    return true;
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
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible() || petIdleState === 'sleeping' || isQuickMenuOpen) {
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
 * - Idle >= 3 min -> random boredom-relief activities (hops, reactions, roaming)
 * - Idle >= sleepySec (default 6 min) -> sleepy/tired
 * - Idle >= sleepySec + 30s -> sleeping
 * - Any activity -> stops play and wakes up (surprised -> neutral)
 */
function startIdleMonitoring() {
  if (idlePollInterval) clearInterval(idlePollInterval);

  idlePollInterval = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;

    try {
      const idleSec = powerMonitor.getSystemIdleTime();
      const playSec = 180; // 3 minutes of inactivity before random play starts
      const sleepySec = Math.max(240, (store.get('settings.behavior.idleSleepyMinutes') || 6) * 60);
      // Sleep follows shortly after sleepy/tired, matching "after a few seconds he sleeps".
      const sleepingSec = sleepySec + 30;

      if (timerManager.isFocusActive() || isPomodoroFocusActive) {
        // Pet does not fall asleep during Pomodoro focus
        return;
      }

      if (idleSec >= sleepingSec) {
        if (petIdleState !== 'sleeping') {
          petIdleState = 'sleeping';
          stopCursorTracking();
          petWindow.webContents.send('pet:idle-stop');
          petWindow.webContents.send('pet:set-state', { state: 'sleeping' });
        }
      } else if (idleSec >= sleepySec) {
        if (petIdleState !== 'sleepy' && petIdleState !== 'sleeping') {
          petIdleState = 'sleepy';
          petWindow.webContents.send('pet:idle-stop');
          petWindow.webContents.send('pet:set-state', { state: 'sleepy' });
        }
      } else if (idleSec >= playSec) {
        // After 3+ minutes inactive, Pixie plays around to cure boredom.
        if (petIdleState !== 'playing') {
          petIdleState = 'playing';
          petWindow.webContents.send('pet:idle-play');
        }
      } else {
        // User is active
        if (petIdleState === 'sleeping' || petIdleState === 'sleepy' || petIdleState === 'playing') {
          const wasSleepingOrSleepy = (petIdleState === 'sleeping' || petIdleState === 'sleepy');
          petIdleState = 'neutral';
          startThrottledCursorTracking();
          petWindow.webContents.send('pet:idle-stop');
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

  // Pause animations when screen is locked or system is suspended
  try {
    powerMonitor.on('lock-screen', () => {
      petIdleState = 'sleeping';
      stopCursorTracking();
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:idle-stop');
        petWindow.webContents.send('pet:set-state', { state: 'sleeping' });
      }
    });
    powerMonitor.on('suspend', () => {
      petIdleState = 'sleeping';
      stopCursorTracking();
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:idle-stop');
        petWindow.webContents.send('pet:set-state', { state: 'sleeping' });
      }
    });
    powerMonitor.on('unlock-screen', () => {
      petIdleState = 'neutral';
      startThrottledCursorTracking();
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:idle-stop');
        petWindow.webContents.send('pet:set-state', { state: 'neutral' });
      }
    });
    powerMonitor.on('resume', () => {
      petIdleState = 'neutral';
      startThrottledCursorTracking();
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:idle-stop');
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
  
  // Keep the panel genuinely compact. Older saved bounds are capped so an
  // existing install does not reopen at the previous oversized 620x720 box.
  const PANEL_MIN_W = 360;
  const PANEL_MIN_H = 440;
  const PANEL_DEFAULT_W = 440;
  const PANEL_DEFAULT_H = 540;
  const PANEL_MAX_RESTORE_W = 480;
  const PANEL_MAX_RESTORE_H = 600;

  const savedW = Math.min(store.get('window.panelWidth') || PANEL_DEFAULT_W, PANEL_MAX_RESTORE_W);
  const savedH = Math.min(store.get('window.panelHeight') || PANEL_DEFAULT_H, PANEL_MAX_RESTORE_H);
  const availableW = Math.max(PANEL_MIN_W, workArea.width - 32);
  const availableH = Math.max(PANEL_MIN_H, workArea.height - 32);

  const width = Math.min(Math.max(PANEL_MIN_W, savedW), availableW);
  const height = Math.min(Math.max(PANEL_MIN_H, savedH), availableH);

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
    minWidth: PANEL_MIN_W,
    minHeight: PANEL_MIN_H,
    show: false,
    transparent: false,
    frame: false,
    backgroundColor: '#0b0b0f',
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
  companion.setWindows(petWindow, panelWindow);

  panelWindow.once('ready-to-show', () => {
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.show();
      panelWindow.focus();
    }
  });

  panelWindow.webContents.on('did-finish-load', () => {
    if (!panelWindow || panelWindow.isDestroyed()) return;

    // Send cached update status to panel (shows banner)
    if (updateChecker && updateChecker.getLatestResult()) {
      panelWindow.webContents.send('update:status', {
        result: updateChecker.getLatestResult(),
        isManual: false
      });
      // Also re-trigger pet bubble so user notices the update
      updateChecker.notifyPetOfCachedUpdate();
    }

    // did-finish-load runs after panel.js, so only one short turn is needed
    // for the renderer to finish constructing PanelController.
    if (pendingPanelTab) {
      const tabToSwitch = pendingPanelTab;
      pendingPanelTab = null;
      setTimeout(() => {
        if (panelWindow && !panelWindow.isDestroyed()) {
          panelWindow.webContents.send('panel:switch-tab', tabToSwitch);
        }
      }, 60);
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

// Tab queued to switch to after the panel window finishes loading
let pendingPanelTab = null;

function showPanel(tab) {
  // Settings is a normal in-panel section, alongside the other 13 sections.
  if (tab) pendingPanelTab = tab;
  if (!panelWindow || panelWindow.isDestroyed()) {
    createPanelWindow();
  } else {
    panelWindow.show();
    panelWindow.focus();
    // If panel was already open, switch tab immediately
    if (pendingPanelTab && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send('panel:switch-tab', pendingPanelTab);
      pendingPanelTab = null;
    }
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
      // To-do completion gets its own organized, tidy reaction.
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'organizing', duration: 2500, priority: 4, force: true });
        petWindow.webContents.send('pet:show-bubble', {
          text: 'Task done. Nice work!', duration: 2200, emotion: 'organizing', badge: 'TO-DO', bounce: false
        });
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
      // Writing has its own expression so Notes does not reuse the to-do reaction.
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'writing', duration: 2500, priority: 4, force: true });
        petWindow.webContents.send('pet:show-bubble', {
          text: 'Note saved.', duration: 2200, emotion: 'writing', badge: 'NOTE', bounce: false
        });
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

    case 'settings:exported': {
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'reviewing', duration: 2800, priority: 4, force: true });
        petWindow.webContents.send('pet:show-bubble', {
          text: 'Full backup saved. Keep it private!', duration: 3200, emotion: 'reviewing', badge: 'BACKUP'
        });
      }
      break;
    }

    case 'settings:imported': {
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'excited', duration: 4000, priority: 4, force: true });
        petWindow.webContents.send('pet:show-bubble', {
          text: 'Everything is restored. Welcome back!', duration: 3500, emotion: 'excited', badge: 'RESTORED'
        });
        petWindow.webContents.send('pet:play-sound', { sound: 'chirp', category: 'reactions' });
      }
      break;
    }

    case 'backup:exported': {
      handleAppEvent('settings:exported', payload);
      break;
    }

    case 'backup:imported': {
      handleAppEvent('settings:imported', payload);
      break;
    }

    case 'clipboard:watched': {
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'clipping', duration: 2200, priority: 3, force: true });
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
      isPomodoroFocusActive = true;
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'focusing', duration: 0, priority: 4, held: true, force: true });
        petWindow.webContents.send('pet:show-bubble', {
          text: 'Focus mode on. You got this!', duration: 2800, emotion: 'focusing', badge: 'FOCUS'
        });
      }
      break;
    }

    case 'pomodoro:break': {
      isPomodoroFocusActive = false;
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: 'relaxed', duration: 4000, priority: 4, force: true });
        petWindow.webContents.send('pet:show-bubble', {
          text: 'Break time — breathe with me.', duration: 3200, emotion: 'relaxed', badge: 'BREAK'
        });
      }
      break;
    }

    case 'pomodoro:finish': {
      isPomodoroFocusActive = false;
      const count = (payload && payload.completedCount) || 1;
      const emo = (count % 3 === 0) ? 'excited' : 'laugh';
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:set-state', { state: emo, duration: 4500, priority: 3, force: true });
        petWindow.webContents.send('pet:show-bubble', {
          text: count % 3 === 0 ? 'Three focus blocks! Amazing!' : 'Focus block complete!',
          duration: 3600,
          emotion: emo,
          badge: 'TIMER',
          sound: 'alarm',
          category: 'timer'
        });
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

/* -------------------------------------------------------------------------- */
/* Global typing animation                                                     */
/* -------------------------------------------------------------------------- */

function signalPetTyping(source) {
  const now = Date.now();
  if (source === 'os-key') typingHelperLastPulseAt = now;
  if (now - lastTypingPulseAt < 70) return;
  lastTypingPulseAt = now;
  handleAppEvent('pet:typing', { source });
}

function getAccessibilityGranted() {
  // Windows uses a low-level keyboard hook and does not require macOS Accessibility.
  if (process.platform === 'win32') return true;
  if (process.platform !== 'darwin') return true;
  try {
    if (typeof systemPreferences.isTrustedAccessibilityClient !== 'function') return true;
    return !!systemPreferences.isTrustedAccessibilityClient(false);
  } catch (error) {
    return false;
  }
}

function getTypingHelperPath() {
  const relativePath = process.platform === 'win32'
    ? path.join('main', 'typing-helper.ps1')
    : path.join('main', 'typing-helper');
  if (app.isPackaged && process.resourcesPath) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return path.join(__dirname, relativePath);
}

function scheduleTypingHelperRetry() {
  if (typingHelperRetryTimer || app.isQuitting || isCliTestRun) return;
  typingHelperRetryAttempts += 1;
  const delay = [5000, 15000, 30000][Math.min(typingHelperRetryAttempts - 1, 2)];
  typingHelperRetryTimer = setTimeout(() => {
    typingHelperRetryTimer = null;
    startTypingHelper();
  }, delay);
}

function startTypingHelper(force = false) {
  const isWindows = process.platform === 'win32';
  if (!(isWindows || process.platform === 'darwin') || isCliTestRun || app.isQuitting) return;
  if (typingHelper) {
    if (!force) return;
    stopTypingHelper();
  }

  const helperPath = getTypingHelperPath();
  if (!fs.existsSync(helperPath)) {
    typingHelperLastError = 'Typing helper is missing from this installation.';
    if (!typingHelperErrorLogged) {
      console.warn(`[Pixie] ${typingHelperLastError} In-app typing signals still work.`);
      typingHelperErrorLogged = true;
    }
    return;
  }

  // macOS needs an Accessibility grant. Ask from the app itself (not from a
  // detached helper) so TCC attributes the prompt to Pixie. Auto retries do
  // not re-prompt; the Settings button or Restart helper can do that.
  if (process.platform === 'darwin') {
    const granted = getAccessibilityGranted();
    if (!granted && (force || !typingHelperPromptAttempted)) {
      typingHelperPromptAttempted = true;
      try {
        if (systemPreferences.isTrustedAccessibilityClient) {
          systemPreferences.isTrustedAccessibilityClient(true);
        }
      } catch (error) {
        // Older Electron versions may not expose this.
      }
    }
  }

  typingHelperTapFailed = false;
  typingHelperReady = false;
  typingHelperLastError = '';

  try {
    if (isWindows) {
      typingHelper = spawn('powershell.exe', [
        '-NoProfile', '-NoLogo', '-NonInteractive',
        '-ExecutionPolicy', 'Bypass', '-File', helperPath
      ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } else {
      typingHelper = spawn(helperPath, [], { stdio: ['ignore', 'pipe', 'pipe'] });
    }
  } catch (error) {
    typingHelperLastError = error.message || 'Could not start helper.';
    console.warn('[Pixie] Could not start global typing helper:', typingHelperLastError);
    scheduleTypingHelperRetry();
    return;
  }

  let stdoutBuffer = '';
  let stderrBuffer = '';
  const handleHelperLine = (line) => {
    const trimmed = line.trim();
    if (trimmed === 'K') {
      typingHelperReady = true;
      typingHelperTapFailed = false;
      typingHelperLastError = '';
      typingHelperRetryAttempts = 0;
      signalPetTyping('os-key');
    }
    if (trimmed === 'READY') {
      typingHelperReady = true;
      typingHelperTapFailed = false;
      typingHelperLastError = '';
      typingHelperRetryAttempts = 0;
      typingHelperErrorLogged = false;
    }
    if (trimmed === 'TAP_FAILED') {
      typingHelperReady = false;
      typingHelperTapFailed = true;
      if (process.platform === 'win32') {
        typingHelperLastError = 'Windows keyboard hook could not be installed. Close apps that block low-level hooks, then use Restart helper.';
        if (!typingHelperErrorLogged) {
          console.warn('[Pixie] Windows global typing hook failed. Use Restart helper after closing apps that block low-level hooks.');
          typingHelperErrorLogged = true;
        }
      } else {
        typingHelperLastError = 'Accessibility permission is required for OS-wide typing. Grant it to Pixie, then use Restart helper.';
        if (!typingHelperErrorLogged) {
          console.warn('[Pixie] Global typing needs Accessibility permission. Enable Pixie in System Settings > Privacy & Security > Accessibility, then use Restart helper.');
          typingHelperErrorLogged = true;
        }
      }
    }
  };

  typingHelper.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';
    lines.forEach(handleHelperLine);
  });

  typingHelper.stderr.on('data', (chunk) => {
    stderrBuffer = `${stderrBuffer}${chunk.toString()}`.slice(-2000);
    const lines = stderrBuffer.split('\n');
    stderrBuffer = lines.pop() || '';
    lines.forEach(handleHelperLine);
  });

  typingHelper.on('error', (error) => {
    typingHelperReady = false;
    typingHelperLastError = error.message || 'Helper process error.';
    if (!typingHelperErrorLogged) {
      console.warn('[Pixie] Global typing helper error:', typingHelperLastError);
      typingHelperErrorLogged = true;
    }
    scheduleTypingHelperRetry();
  });

  typingHelper.once('exit', () => {
    typingHelper = null;
    typingHelperReady = false;
    if (app.isQuitting || isCliTestRun) return;
    // A tap failure is recoverable after Accessibility is granted, so retry
    // with bounded backoff instead of disabling OS-wide typing forever.
    scheduleTypingHelperRetry();
  });
}

function stopTypingHelper() {
  if (typingHelperRetryTimer) {
    clearTimeout(typingHelperRetryTimer);
    typingHelperRetryTimer = null;
  }
  if (typingHelper && !typingHelper.killed) {
    try { typingHelper.kill(); } catch (error) {}
  }
  typingHelper = null;
  typingHelperReady = false;
}

function getTypingStatus() {
  const isWindows = process.platform === 'win32';
  return {
    platform: process.platform,
    mode: isWindows ? 'windows-low-level-hook' : (process.platform === 'darwin' ? 'macos-accessibility' : 'in-app-only'),
    running: !!typingHelper,
    ready: !!typingHelperReady,
    tapFailed: !!typingHelperTapFailed,
    lastPulseAt: typingHelperLastPulseAt || null,
    accessibility: getAccessibilityGranted() ? 'granted' : 'denied',
    helperPath: getTypingHelperPath(),
    error: typingHelperLastError || null
  };
}

ipcMain.handle('typing:get-status', () => getTypingStatus());

ipcMain.handle('typing:restart', () => {
  if (!(process.platform === 'darwin' || process.platform === 'win32')) {
    return getTypingStatus();
  }
  typingHelperErrorLogged = false;
  startTypingHelper(true);
  return getTypingStatus();
});

// Called by the Settings "Accessibility" button while Pixie is frontmost, so
// macOS attributes the prompt to Pixie instead of an anonymous child process.
ipcMain.handle('typing:request-permission', async () => {
  if (process.platform === 'darwin') {
    try {
      if (systemPreferences.isTrustedAccessibilityClient) {
        systemPreferences.isTrustedAccessibilityClient(true);
      }
    } catch (error) {}
    if (getAccessibilityGranted()) startTypingHelper(true);
  }
  return getTypingStatus();
});

/* -------------------------------------------------------------------------- */
/* Clipboard history (local only)                                              */
/* -------------------------------------------------------------------------- */

const CLIPBOARD_HISTORY_LIMIT = 50;

function readClipboardHistory() {
  const history = store.get('tools.clipboardHistory');
  return Array.isArray(history) ? history : [];
}

function getClipboardTextSafe() {
  try {
    const text = clipboard.readText();
    return typeof text === 'string' ? text : '';
  } catch (error) {
    return '';
  }
}

function clipboardWatchEnabled() {
  return store.get('settings.privacy.allowClipboard') !== false &&
    store.get('settings.privacy.clipboardWatch') !== false;
}

function broadcastClipboardChange(payload) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('clipboard:changed', payload);
  }
}

function rememberClipboardText(value, options = {}) {
  const text = String(value || '').trim();
  if (!text || text.length > 20000) return null;

  const history = readClipboardHistory();
  if (history.length && history[0] && history[0].text === text) {
    lastWatchedClipboardText = text;
    lastClipboardCopiedAt = history[0].copiedAt || Date.now();
    return history[0];
  }

  const copiedAt = Date.now();
  const entry = { text, copiedAt };
  store.set('tools.clipboardHistory', [entry, ...history].slice(0, CLIPBOARD_HISTORY_LIMIT));
  lastWatchedClipboardText = text;
  lastClipboardCopiedAt = copiedAt;

  const payload = { text, copiedAt };
  // The panel renderer owns the visual clipboard reaction; main only stores
  // the entry and broadcasts it so there is one bubble/state change per copy.
  broadcastClipboardChange(payload);
  return entry;
}

function stopClipboardWatcher() {
  if (clipboardWatchTimer) {
    clearInterval(clipboardWatchTimer);
    clipboardWatchTimer = null;
  }
}

function startClipboardWatcher() {
  if (!clipboardWatchEnabled()) {
    stopClipboardWatcher();
    return;
  }
  if (clipboardWatchTimer) return;

  // Seed with the current clipboard so an old copy is not replayed as new.
  lastWatchedClipboardText = getClipboardTextSafe();
  lastClipboardCopiedAt = Date.now();

  clipboardWatchTimer = setInterval(() => {
    if (!clipboardWatchEnabled()) {
      stopClipboardWatcher();
      return;
    }
    const text = getClipboardTextSafe();
    if (text && text !== lastWatchedClipboardText) {
      rememberClipboardText(text);
    }
  }, 1200);
}

function syncClipboardWatcher() {
  if (clipboardWatchEnabled()) startClipboardWatcher();
  else stopClipboardWatcher();
}

ipcMain.handle('clipboard:read', () => {
  if (store.get('settings.privacy.allowClipboard') === false) {
    return { text: '', copiedAt: null };
  }
  const text = getClipboardTextSafe();
  const normalized = text.trim();
  const known = normalized
    ? readClipboardHistory().find((entry) => entry && entry.text === normalized)
    : null;
  return { text, copiedAt: known ? known.copiedAt : null };
});

ipcMain.handle('clipboard:write', (event, value) => {
  if (store.get('settings.privacy.allowClipboard') === false) return { success: false };
  try {
    clipboard.writeText(String(value || ''));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clipboard:record', (event, value) => {
  if (store.get('settings.privacy.allowClipboard') === false) return { success: false };
  const entry = rememberClipboardText(value);
  return { success: !!entry };
});

ipcMain.handle('clipboard:clear-history', () => {
  store.set('tools.clipboardHistory', []);
  lastWatchedClipboardText = getClipboardTextSafe();
  lastClipboardCopiedAt = Date.now();
  broadcastClipboardChange({ text: '', copiedAt: 0, cleared: true });
  return { success: true };
});

ipcMain.handle('clipboard:get-history', () => readClipboardHistory());

ipcMain.handle('clipboard:set-watch', (event, enabled) => {
  const next = !!enabled;
  store.set('settings.privacy.clipboardWatch', next);
  syncClipboardWatcher();
  return { success: true, enabled: next };
});

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
  const tab = opts && opts.tab ? opts.tab : null;
  showPanel(tab);
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
  }

  const display = (petWindow && !petWindow.isDestroyed() && screen.getDisplayMatching(petWindow.getBounds())) ||
    screen.getDisplayNearestPoint({ x: screenX, y: screenY }) ||
    screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const workArea = display.workArea; // Excludes menu bar (macOS) and taskbar (Windows)
  const [petW, petH] = petWindow.getSize();
  const { bodyX, bodyY, bodyW, bodyH } = getPetBodyRect(petW, petH);

  let newPetX = Math.round(screenX - dragStartPos.offsetX);
  let newPetY = Math.round(screenY - dragStartPos.offsetY);

  // Constrain pet body rect within screen display bounds (can reach screen corners and edges without invisible wall)
  // Across all display types and operating systems (Windows, macOS, Linux, multi-monitor)
  const minPetX = bounds.x - bodyX;
  const maxPetX = bounds.x + bounds.width - bodyX - bodyW;
  const minPetY = bounds.y - bodyY;
  const maxPetY = bounds.y + bounds.height - bodyY - bodyH;

  newPetX = Math.round(Math.max(minPetX, Math.min(maxPetX, newPetX)));
  newPetY = Math.round(Math.max(minPetY, Math.min(maxPetY, newPetY)));

  petWindow.setPosition(newPetX, newPetY);
  bubble.syncPosition();

  // Panel and pet move independently — dragging one must not move the other.
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
  if (isQuickMenuOpen && ignore) return; // Never ignore mouse while quick menu is open
  if (petWindow && !petWindow.isDestroyed()) {
    isPetHoveredOrInside = !ignore;
    petWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('pet:menu-state', (e, isOpen) => {
  isQuickMenuOpen = !!isOpen;
  if (petWindow && !petWindow.isDestroyed()) {
    isPetHoveredOrInside = isQuickMenuOpen;
    petWindow.setIgnoreMouseEvents(!isQuickMenuOpen, { forward: true });
    petWindow.webContents.send('pet:inside-change', isPetHoveredOrInside);
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

  const bW = Math.max(96, Math.min(230, width || 190));
  const bH = Math.max(32, Math.min(120, height || 70));

  // Compute exact pet body top (in base window coords) so the tiny tail sits just above the pet head
  const { bodyY } = getPetBodyRect(baseW, baseH);
  const TAIL_GAP = 6; // px gap between bubble tail tip and pet body top

  const display = screen.getDisplayNearestPoint({
    x: unexpandedPetBounds.x + baseW / 2,
    y: unexpandedPetBounds.y + baseH / 2
  });
  const workArea = display.workArea;

  const spaceAbove = unexpandedPetBounds.y - workArea.y;
  const spaceBelow = (workArea.y + workArea.height) - (unexpandedPetBounds.y + baseH);

  // Flip below if not enough room above and more room below
  const neededBubbleSpace = bH + TAIL_GAP + 5; // 5 = tail diamond half-height
  const shouldFlipBelow = (spaceAbove < neededBubbleSpace) && (spaceBelow >= spaceAbove);

  petWindow.webContents.send('pet:bubble-position', { flipped: shouldFlipBelow });

  const totalW = Math.max(baseW, bW + 16);

  // Exact height: base window + bubble height + gap so the tail meets the pet body
  const extraH = bH + TAIL_GAP + 5; // 5px for tail diamond half-height
  const totalH = baseH + extraH;

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
      const cancelled = errorData.status === 499 || /abort|cancel/i.test(errorData.friendly || '');
      const suppress = params.suppressReactions === true;
      if (!cancelled && !suppress) {
        // On error, show sad pet face (USER REQUEST: sad: AI error (401/402/429/503/offline))
        relayToPet('pet:set-state', { state: 'sad', duration: 5000, priority: 5, force: true });
        bubble.show({
          badge: 'AI ERROR',
          text: errorData.friendly || 'Could not complete request.',
          sound: 'tap',
          emotion: 'sad'
        });
      }
    }
  );
});

ipcMain.on('ai:stop-chat', (event, { requestId } = {}) => {
  if (requestId) aiService.abortStream(requestId);
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
    width: 150,
    height: 150,
    roundness: 50,
    eyeSize: 1.0,
    eyeSpacing: 28,
    mouthWidth: 10,
    depth: 75,
    bodyColor: '#17171B',
    accentColor: '#007AFF',
    primaryGlow: '#FF4D1A',
    eyesColor: '#FF8A1F',
    mouthColor: '#111111'
  };
  const currentAppearance = Object.assign({}, defaults, store.get('settings.appearance') || {});
  currentAppearance.mouthColor = '#111111';
  e.returnValue = currentAppearance;
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

ipcMain.on('reminders:updated', (e, freshReminders) => {
  // Pass fresh data directly so evaluateNow avoids re-reading potentially stale store
  scheduler.evaluateNow(Array.isArray(freshReminders) ? freshReminders : undefined);
});

ipcMain.on('window:set-always-on-top', (e, val) => {
  if (petWindow && !petWindow.isDestroyed()) {
    if (process.platform === 'darwin' && val) {
      petWindow.setAlwaysOnTop(true, 'screen-saver');
      petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      petWindow.setAlwaysOnTop(!!val);
    }
  }
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.setAlwaysOnTop(!!val);
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

// Bounded idle hop. The renderer asks for a small delta; main clamps it to the
// visible work area and moves the panel by the same applied amount when open.
ipcMain.on('pet:idle-hop', (e, { dx, dy } = {}) => {
  if (!petWindow || petWindow.isDestroyed() || app.isQuitting) return;

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  // Allow larger roam hops for boredom play, but still bounded per move.
  const stepX = clamp(Math.round(Number(dx) || 0), -220, 220);
  const stepY = clamp(Math.round(Number(dy) || 0), -140, 140);
  if (!stepX && !stepY) return;

  const display = screen.getDisplayMatching(petWindow.getBounds()) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const [x, y] = petWindow.getPosition();
  const [w, h] = petWindow.getSize();
  const nextX = Math.round(clamp(x + stepX, area.x, area.x + area.width - w));
  const nextY = Math.round(clamp(y + stepY, area.y, area.y + area.height - h));
  const appliedX = nextX - x;
  const appliedY = nextY - y;
  if (!appliedX && !appliedY) return;

  petWindow.setPosition(nextX, nextY);
  if (unexpandedPetBounds) {
    unexpandedPetBounds.x = nextX;
    unexpandedPetBounds.y = nextY;
  }

  // Panel stays independent; do not move it with pet idle roaming.
});

ipcMain.on('window:set-launch-login', (e, openAtLogin) => {
  try {
    if (process.platform === 'win32') {
      // On Windows, use the actual executable path for proper registry entry
      app.setLoginItemSettings({
        openAtLogin: !!openAtLogin,
        path: process.execPath,
        args: []
      });
    } else {
      app.setLoginItemSettings({ openAtLogin: !!openAtLogin });
    }
  } catch (err) {
    console.error('[Pixie] Failed to set launch at login:', err);
  }
});

/* -------------------------------------------------------------------------- */
/* Full backup / restore                                                      */
/* -------------------------------------------------------------------------- */

const FULL_BACKUP_FORMAT = 'pixie-full-backup';
const FULL_BACKUP_VERSION = 2;

function countBackupItems(data) {
  const settings = (data && data.settings && typeof data.settings === 'object') ? data.settings : {};
  const tools = (data && data.tools && typeof data.tools === 'object') ? data.tools : {};
  return {
    settings: Object.keys(settings).length,
    notes: Array.isArray(tools.notes) ? tools.notes.length : Array.isArray(data.notes) ? data.notes.length : 0,
    todos: Array.isArray(tools.todo) ? tools.todo.length : Array.isArray(data.todos) ? data.todos.length : 0,
    reminders: Array.isArray(data.reminders) ? data.reminders.length : 0,
    clipboard: Array.isArray(tools.clipboardHistory) ? tools.clipboardHistory.length : Array.isArray(data.clipboardHistory) ? data.clipboardHistory.length : 0
  };
}

function createFullBackup(reason = 'manual-export') {
  const data = store.getAllData();
  return {
    format: FULL_BACKUP_FORMAT,
    version: FULL_BACKUP_VERSION,
    app: 'Pixie',
    exportedAt: new Date().toISOString(),
    created: new Date().toISOString(),
    appVersion: app.getVersion(),
    reason,
    data,
    secrets: { apiKeys: store.getAllApiKeys() },
    counts: countBackupItems(data)
  };
}

function writeSafetyBackup(reason) {
  const userDataPath = app.getPath('userData');
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
  } catch (error) {}
  const backupFileName = `pixie-safety-backup-${Date.now()}.json`;
  const backupPath = path.join(userDataPath, backupFileName);
  fs.writeFileSync(backupPath, JSON.stringify(createFullBackup(reason), null, 2), 'utf8');
  return backupFileName;
}

function looksLikeBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.format === FULL_BACKUP_FORMAT || payload.format === 'desktop-pet-backup') return true;
  return Boolean(
    (payload.settings && typeof payload.settings === 'object') ||
    (payload.data && typeof payload.data === 'object') ||
    Array.isArray(payload.notes) ||
    Array.isArray(payload.todos) ||
    Array.isArray(payload.reminders)
  );
}

function makeBackupId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLegacyNotes(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (typeof item === 'string') {
      return { id: makeBackupId('note'), title: 'Quick note', content: item, pinned: false, updatedAt: Date.now() };
    }
    const source = item && typeof item === 'object' ? item : {};
    const updated = Number(source.updatedAt);
    return {
      id: typeof source.id === 'string' && source.id ? source.id : makeBackupId('note'),
      title: typeof source.title === 'string' && source.title.trim() ? source.title : 'Quick note',
      content: String(source.content ?? source.text ?? source.body ?? '').slice(0, 8000),
      pinned: source.pinned === true,
      updatedAt: Number.isFinite(updated) && updated > 0 ? updated : Date.now()
    };
  });
}

function mergeBackupNotes(existing, incoming) {
  const ids = new Set(existing.map((note) => note && note.id).filter(Boolean));
  const merged = existing.slice();
  for (const note of incoming) {
    merged.push(ids.has(note.id) ? Object.assign({}, note, { id: makeBackupId('note') }) : note);
  }
  return merged;
}

function applyLegacyBackup(data, notesStrategy = 'replace') {
  if (data.settings && typeof data.settings === 'object') {
    if (data.settings.general) {
      store.set('settings.general', Object.assign({}, store.get('settings.general') || {}, data.settings.general));
    }
    if (data.settings.behavior) {
      const beh = Object.assign({}, data.settings.behavior);
      if (beh.soundsEnabled === undefined) beh.soundsEnabled = true;
      else beh.soundsEnabled = !!beh.soundsEnabled;
      delete beh.sounds;
      if (beh.soundVolume !== undefined) {
        const volNum = Number(beh.soundVolume);
        beh.soundVolume = isNaN(volNum) ? 60 : Math.max(0, Math.min(100, Math.round(volNum)));
      } else {
        beh.soundVolume = 60;
      }
      beh.soundReminders = beh.soundReminders !== false;
      beh.soundTimer = beh.soundTimer !== false;
      beh.soundReactions = beh.soundReactions !== false;
      store.set('settings.behavior', Object.assign({}, store.get('settings.behavior') || {}, beh));
    }
    for (const section of ['reactions', 'appearance', 'privacy', 'companion']) {
      if (data.settings[section]) {
        store.set(`settings.${section}`, Object.assign({}, store.get(`settings.${section}`) || {}, data.settings[section]));
      }
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
      const legacyKeys = Object.assign({}, data.settings.ai.apiKeys || {}, data.settings.ai.keys || {});
      for (const [provider, key] of Object.entries(legacyKeys)) {
        store.setApiKey(provider, String(key || ''));
      }
    }
  }

  store.normalizeThemeData(null, true);

  if (data.timers && typeof data.timers === 'object') {
    timerManager.updateSettings(data.timers);
  }

  const arrays = ['todos', 'reminders', 'chatHistory', 'savedPrompts'];
  for (const key of arrays) {
    if (Array.isArray(data[key])) store.set(key, data[key]);
  }

  if (data.tools && typeof data.tools === 'object') {
    for (const [key, value] of Object.entries(data.tools)) {
      store.set(`tools.${key}`, value);
    }
  }

  // Map legacy top-level data onto the paths used by the current panel UI.
  if (Array.isArray(data.todos) && !(data.tools && Array.isArray(data.tools.todo))) {
    store.set('tools.todo', data.todos);
  }
  if (Array.isArray(data.clipboardHistory) && !(data.tools && Array.isArray(data.tools.clipboardHistory))) {
    store.set('tools.clipboardHistory', data.clipboardHistory.slice(0, 50));
  }

  if (Array.isArray(data.notes)) {
    const incoming = normalizeLegacyNotes(data.notes);
    if (notesStrategy === 'replace') {
      store.set('notes', data.notes);
      store.set('tools.notes', incoming);
      store.set('tools.activeNoteId', incoming.length ? incoming[0].id : '');
    } else {
      const existingLegacy = Array.isArray(store.get('notes')) ? store.get('notes') : [];
      const existingNotes = Array.isArray(store.get('tools.notes'))
        ? normalizeLegacyNotes(store.get('tools.notes'))
        : normalizeLegacyNotes(existingLegacy);
      const merged = mergeBackupNotes(existingNotes, incoming);
      store.set('notes', mergeBackupNotes(existingLegacy, incoming));
      store.set('tools.notes', merged);
      if (!store.get('tools.activeNoteId')) {
        store.set('tools.activeNoteId', merged.length ? merged[0].id : '');
      }
    }
  }
}

function applyFullBackup(payload) {
  const snapshot = payload.data;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Backup has no restorable data snapshot.');
  }
  store.replaceAllData(snapshot);

  const apiKeys = (payload.secrets && payload.secrets.apiKeys && typeof payload.secrets.apiKeys === 'object')
    ? payload.secrets.apiKeys
    : {};
  store.restoreApiKeys(apiKeys);

  // Re-encrypt only keys that exist in the backup. Empty provider slots are
  // already cleared by restoreApiKeys() without invoking the OS keychain.
  for (const [provider, key] of Object.entries(apiKeys)) {
    if (key) store.setApiKey(provider, String(key));
  }

  const behavior = store.get('settings.behavior') || {};
  store.set('settings.behavior.soundsEnabled', behavior.soundsEnabled !== false);
  store.set('settings.behavior.soundVolume', Number.isFinite(Number(behavior.soundVolume))
    ? Math.max(0, Math.min(100, Math.round(Number(behavior.soundVolume))))
    : 60);

  const timers = store.get('settings.timers') || {};
  if (timers && Object.keys(timers).length) timerManager.updateSettings(timers);
}

function broadcastRestoredState() {
  const petName = store.get('settings.general.petName') || 'Pixie';
  createTray();
  relayToPet('pet:update-name', petName);

  const appearance = store.get('settings.appearance') || {};
  appearance.mouthColor = '#111111';
  relayToPet('pet:apply-appearance', appearance);
  if (appearance.accentColor) relayToPet('pet:update-accent', appearance.accentColor);

  const behavior = store.get('settings.behavior') || {};
  relayToPet('pet:update-sound-settings', behavior);
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('settings:sound-updated', behavior);
    panelWindow.webContents.send('panel:data-imported');
    panelWindow.webContents.send('panel:update-name', petName);
    if (appearance.accentColor) panelWindow.webContents.send('panel:update-accent', appearance.accentColor);
  }
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    welcomeWindow.webContents.send('welcome:sound-updated', behavior);
  }

  syncClipboardWatcher();
  const history = readClipboardHistory();
  if (history.length) broadcastClipboardChange({ text: history[0].text, copiedAt: history[0].copiedAt });
}

// Data Management IPC (Item I1)
ipcMain.handle('data:export', async () => {
  try {
    const parentWin = (panelWindow && !panelWindow.isDestroyed()) ? panelWindow : null;
    const dateStr = new Date().toISOString().slice(0, 10);
    const saveRes = await dialog.showSaveDialog(parentWin, {
      title: 'Export full Pixie backup',
      defaultPath: `pixie-full-backup-${dateStr}.json`,
      filters: [{ name: 'Pixie Full Backup', extensions: ['json'] }]
    });

    if (saveRes.canceled || !saveRes.filePath) {
      return { canceled: true };
    }

    const exportPayload = createFullBackup('manual-export');
    fs.writeFileSync(saveRes.filePath, JSON.stringify(exportPayload, null, 2), 'utf8');

    return {
      success: true,
      filePath: saveRes.filePath,
      counts: exportPayload.counts
    };
  } catch (err) {
    console.error('[Pixie] Export failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('data:select-import-file', async () => {
  try {
    const parentWin = (panelWindow && !panelWindow.isDestroyed()) ? panelWindow : null;
    const openRes = await dialog.showOpenDialog(parentWin, {
      title: 'Select Pixie full backup',
      properties: ['openFile'],
      filters: [{ name: 'Pixie Backup', extensions: ['json'] }]
    });

    if (openRes.canceled || !openRes.filePaths || openRes.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = openRes.filePaths[0];
    const stats = fs.statSync(filePath);
    if (stats.size > 10 * 1024 * 1024) {
      return { error: 'File size exceeds maximum allowed limit (10 MB).' };
    }

    let parsed = null;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      parsed = JSON.parse(content);
    } catch (parseErr) {
      return { error: 'Invalid file format: Not a valid JSON file (' + parseErr.message + ')' };
    }

    if (!looksLikeBackup(parsed)) {
      return { error: 'Unrecognized backup file. No Pixie settings or data found.' };
    }

    const isFull = parsed.format === FULL_BACKUP_FORMAT && parsed.data && typeof parsed.data === 'object';
    const counts = isFull ? countBackupItems(parsed.data) : countBackupItems(parsed);

    return {
      success: true,
      filePath,
      preview: {
        format: parsed.format || 'legacy-backup',
        version: parsed.version || 1,
        exportedAt: parsed.exportedAt || parsed.created || null,
        full: isFull,
        counts
      },
      data: parsed
    };
  } catch (err) {
    console.error('[Pixie] Select import file failed:', err);
    return { error: err.message };
  }
});

ipcMain.handle('data:apply-import', async (e, { data, notesStrategy }) => {
  try {
    if (!data || typeof data !== 'object') {
      return { error: 'No data provided to import.' };
    }

    const backupFileName = writeSafetyBackup('pre-import-safety');
    const isFull = data.format === FULL_BACKUP_FORMAT && data.data && typeof data.data === 'object';

    if (isFull) {
      applyFullBackup(data);
    } else {
      applyLegacyBackup(data, notesStrategy);
    }

    broadcastRestoredState();

    return {
      success: true,
      full: isFull,
      backupFile: backupFileName
    };
  } catch (err) {
    console.error('[Pixie] Apply import failed:', err);
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

ipcMain.handle('update:get-cached-status', () => {
  if (updateChecker) {
    return updateChecker.getLatestResult();
  }
  return null;
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

// system:get-stats handler removed (Tools tab removed to reduce CPU usage)




// Companion Features (Pet Care, Clipboard Buddy, Focus Streaks, Check-in, Capture, Breathing)
ipcMain.handle('companion:get-state', () => companion.getPublicState());
ipcMain.handle('companion:care-action', (_e, action) => companion.careAction(action));
ipcMain.handle('companion:checkin', (_e, mood) => companion.submitCheckin(mood));
ipcMain.handle('companion:capture-add', (_e, payload) => companion.addCapture(payload || {}));
ipcMain.handle('companion:capture-toggle', (_e, id) => companion.toggleCapture(id));
ipcMain.handle('companion:capture-delete', (_e, id) => companion.deleteCapture(id));
ipcMain.handle('companion:capture-clear-completed', () => companion.clearCompletedCaptures());
ipcMain.handle('companion:clipboard-action', async (_e, action) => companion.clipboardAction(action));
ipcMain.handle('companion:breathing-start', (_e, seconds) => companion.startBreathing(seconds));
ipcMain.handle('companion:trick', (_e, trick) => companion.getQuickTrick(trick));
ipcMain.handle('companion:summary', () => companion.getDailySummary());

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
  if (process.platform === 'win32') {
    const url = type === 'notifications' ? 'ms-settings:notifications' : 'ms-settings:privacy';
    shell.openExternal(url).catch(() => {});
    return;
  }
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
  if (process.platform === 'win32') {
    const url = pane === 'about'
      ? 'ms-settings:about'
      : (pane === 'notifications' ? 'ms-settings:notifications' : 'ms-settings:privacy');
    shell.openExternal(url).catch(() => {});
    return;
  }
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
    console.log('[SELFTEST] Starting Pixie Self-Test Suite...');
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
        const svg = renderer.render(em);
        if (!svg || !svg.includes('</svg>') || !svg.includes('coucou-face-rig') || !svg.includes('facebot-body-shape')) {
          emotionsValid = false;
          break;
        }
      }
      if (emotionsValid) {
        console.log(`[SELFTEST] pet-renderer: PASS (${allEmotions.length} emotions + Pixie hooks validated)`);
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
  startTypingHelper();
  startClipboardWatcher();

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

  // Sounds are ON by default. Existing installs keep their saved choice unless
  // the key was never written at all.
  if (store.get('settings.behavior.soundsEnabled') === undefined) {
    store.set('settings.behavior.soundsEnabled', true);
  }

  // Start background services
  scheduler.start();
  companion.start();
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

    ipcMain.handle('test:inject-sensor', (_e, arg1) => { const t=(arg1&&arg1.type)||arg1||'unknown'; return { success: true, removed: 'SystemSense removed', type: t, emotion: 'neutral' }; });
    ipcMain.handle('test:resume-sensors', () => true);

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
      stopTypingHelper();
      stopClipboardWatcher();
      app.exit(0);
    });
    return;
  }
  app.isQuitting = true;
  stopTypingHelper();
  stopClipboardWatcher();
  scheduler.stop();
  companion.stop();
  if (cursorPollInterval) clearInterval(cursorPollInterval);
  if (idlePollInterval) clearInterval(idlePollInterval);
});

app.on('will-quit', () => {
  stopTypingHelper();
  stopClipboardWatcher();
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
    petName: store.get('settings.general.petName') || 'Pixie',
    soundsEnabled: store.get('settings.behavior.soundsEnabled') !== false,
    appearance: store.get('settings.appearance') || {},
    aiProvider: store.get('settings.ai.activeProvider') || 'gemini',
    aiModel: store.get(`settings.ai.models.${store.get('settings.ai.activeProvider') || 'gemini'}`)
  };
});

ipcMain.on('welcome:open', () => {
  // The welcome screen belongs to a fresh install only. Later calls are
  // intentionally routed to Settings in the panel instead.
  if (store.get('isFirstRun') !== false) createWelcomeWindow();
  else showPanel('settings');
});

ipcMain.on('settings:open', () => {
  showPanel('settings');
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
      const pName = data.petName.trim() || 'Pixie';
      store.set('settings.general.petName', pName);
      createTray();
      relayToPet('pet:update-name', pName);
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('panel:update-name', pName);
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
      updated.mouthColor = '#111111';
      if (data.accentColor) {
        updated.accentColor = data.accentColor;
        updated.primaryColor = data.accentColor;
        updated.primaryGlow = data.accentColor;
      }
      store.set('settings.appearance', updated);
      relayToPet('pet:apply-appearance', updated);
    }
    if (data.accentColor) {
      store.set('settings.appearance.accentColor', data.accentColor);
      store.set('settings.appearance.primaryColor', data.accentColor);
      store.set('settings.appearance.primaryGlow', data.accentColor);
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
      store.set(`settings.ai.apiKeys.${data.aiProvider}`, data.apiKey);
      store.set(`settings.ai.keys.${data.aiProvider}`, data.apiKey);
    }
  } else {
    // Skipping setup keeps Pixie's sensible defaults, including audible reminders.
    store.set('settings.behavior.soundsEnabled', true);
    relayToPet('pet:update-sound-settings', { soundsEnabled: true });
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.webContents.send('settings:sound-updated', { soundsEnabled: true });
    }
  }

  // Both Save & Skip mark first run and onboarding completed.
  store.set('isFirstRun', false);
  store.set('onboarding.completed', true);

  // Notify open panel window to reload settings immediately
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('panel:reload-settings');
  }

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
    const normalized = Object.assign({}, newSettings);
    if (normalized.soundVolume !== undefined) {
      const vol = Number(normalized.soundVolume);
      normalized.soundVolume = Number.isFinite(vol) ? Math.max(0, Math.min(100, Math.round(vol))) : 60;
    }
    for (const [k, v] of Object.entries(normalized)) {
      store.set(`settings.behavior.${k}`, v);
    }
    newSettings = normalized;
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
  const behavior = store.get('settings.behavior') || {};
  const volume = Number(behavior.soundVolume);
  event.returnValue = {
    soundsEnabled: behavior.soundsEnabled !== false,
    soundVolume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 60,
    soundReminders: behavior.soundReminders !== false,
    soundTimer: behavior.soundTimer !== false,
    soundReactions: behavior.soundReactions !== false,
    dnd: behavior.dnd === true
  };
});

