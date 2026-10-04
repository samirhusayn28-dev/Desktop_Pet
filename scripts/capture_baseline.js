/**
 * Desktop Pet — Baseline Capture & Inventory (Requirement 0: Strict No-Regression Rule)
 * Captures screenshots of every emotion, state, animation, and records system configuration baseline.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const BASELINE_DIR = path.join(__dirname, '..', 'screenshots', 'baseline');
if (!fs.existsSync(BASELINE_DIR)) fs.mkdirSync(BASELINE_DIR, { recursive: true });

const store = require('../main/secure-store');

const EMOTIONS = [
  'neutral',
  'happy',
  'sad',
  'surprised',
  'sleepy',
  'sleeping',
  'angry',
  'love',
  'wink',
  'laugh',
  'thinking',
  'focus',
  'dull',
  'dim',
  'irritated',
  'low-battery',
  'charging',
  'energized',
  'vibing',
  'music',
  'stressed',
  'confused',
  'relieved',
  'squint'
];

const ANIMATIONS = [
  'blinking',
  'dangling',
  'bounce-drop',
  'sleep-z-drift',
  'vibing-notes',
  'thought-dots'
];

const SYSTEM_REACTIONS = [
  'volume',
  'brightness',
  'battery',
  'media',
  'network',
  'headphones',
  'screenUnlock',
  'highLoad',
  'lateNight'
];

const TABS = [
  'chat',
  'todo',
  'timer',
  'notes',
  'reminders',
  'tools',
  'settings'
];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

app.whenReady().then(async () => {
  console.log('--- CAPTURING BASELINE INVENTORY & SCREENSHOTS ---');

  const win = new BrowserWindow({
    width: 280,
    height: 280,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  ipcMain.on('pet:get-appearance', (e) => {
    e.returnValue = store.get('settings.appearance') || { scale: 1.0, width: 136, height: 120 };
  });

  await win.loadFile(path.join(__dirname, '..', 'pet-window', 'pet.html'));
  await sleep(1000);

  // Capture every emotion
  for (const emotion of EMOTIONS) {
    await win.webContents.executeJavaScript(`
      if (window.petController) {
        window.petController.setEmotion('${emotion}');
      }
    `);
    await sleep(250);
    const img = await win.capturePage();
    fs.writeFileSync(path.join(BASELINE_DIR, `emotion_${emotion}.png`), img.toPNG());
    console.log(`[Baseline] Captured emotion: ${emotion}`);
  }

  // Record complete baseline metadata
  const baselineInventory = {
    capturedAt: new Date().toISOString(),
    petEmotions: EMOTIONS,
    petAnimations: ANIMATIONS,
    systemReactions: SYSTEM_REACTIONS,
    tabs: TABS,
    idleSleepyMinutes: store.get('settings.behavior.idleSleepyMinutes') || 2,
    idleSleepingMinutes: store.get('settings.behavior.idleSleepingMinutes') || 5,
    cursorTrackingMaxHz: 30,
    bubbleDurationMs: store.get('settings.behavior.bubbleDuration') || 5000,
    defaultPetName: store.get('settings.general.petName') || 'Bolt'
  };

  fs.writeFileSync(
    path.join(BASELINE_DIR, 'baseline_inventory.json'),
    JSON.stringify(baselineInventory, null, 2)
  );

  console.log('--- BASELINE CAPTURE COMPLETED SUCCESSFULLY ---');
  win.destroy();
  app.quit();
});
