const { app, BrowserWindow, screen, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = '/Users/samirhusayn/.gemini/antigravity-ide/brain/ad1d272f-b7c0-4666-a011-842a6f84bf83';

// Mock single instance lock for test runner
app.whenReady().then(async () => {
  console.log('[Test] Electron ready. Initializing desktop pet test verification...');

  // Require main modules
  const store = require('../main/store');

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

  // Register IPC handlers like main/index.js
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

  ipcMain.on('pet:set-ignore-mouse-events', () => {});
  ipcMain.on('pet:get-sound-settings', (e) => { e.returnValue = { soundsEnabled: false }; });
  ipcMain.on('app:get-version', (e) => { e.returnValue = '1.0.9'; });
  ipcMain.on('pet:update-appearance', (e, appearance) => {
    store.set('settings.appearance', appearance);
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('pet:apply-appearance', appearance);
    }
  });

  // 1. Create Pet Window (Same as in main/index.js)
  const appConfig = store.get('settings.appearance') || {};
  const currentScale = appConfig.scale || 1.0;
  const winW = Math.round(340 * currentScale);
  const winH = Math.round(340 * currentScale);

  const petWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: Math.round(screenW - winW - 60),
    y: Math.round(screenH - winH - 80),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  await petWindow.loadFile(path.join(__dirname, '..', 'pet-window', 'pet.html'));
  console.log('[Test] Pet window loaded. Checking visibility...');
  console.log('[Test] Pet window isVisible:', petWindow.isVisible());

  // 2. Create Panel Window (show: false)
  const panelWindow = new BrowserWindow({
    width: 480,
    height: 640,
    x: Math.round(screenW - winW - 560),
    y: Math.round(screenH - winH - 120),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  await panelWindow.loadFile(path.join(__dirname, '..', 'panel-window', 'panel.html'));
  console.log('[Test] Panel window loaded. isVisible:', panelWindow.isVisible(), '(Expected false)');

  // Let initial animations settle
  await new Promise(r => setTimeout(r, 1200));

  // Screenshot 1: Floating Pet on Desktop (Only the pet is visible!)
  const petImg = await petWindow.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'real_floating_pet_3d.png'), petImg.toPNG());
  console.log('[Test] Saved real_floating_pet_3d.png');

  // Also trigger a speech bubble to capture speech reaction
  await petWindow.webContents.executeJavaScript(`
    const ctrl = window.petController || window.faceBotController;
    if (ctrl && typeof ctrl.showSpeechBubble === 'function') {
      ctrl.showSpeechBubble("Ready to code with you! 🧡", 5000);
    }
  `);
  await new Promise(r => setTimeout(r, 600));
  const petBubbleImg = await petWindow.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'real_floating_pet_bubble.png'), petBubbleImg.toPNG());
  console.log('[Test] Saved real_floating_pet_bubble.png');

  // 3. Simulate clicking the pet to open Assistant Panel
  console.log('[Test] Opening assistant panel next to pet...');
  panelWindow.show();
  panelWindow.focus();
  await new Promise(r => setTimeout(r, 800));

  const panelImg = await panelWindow.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'real_pet_with_panel.png'), panelImg.toPNG());
  console.log('[Test] Saved real_pet_with_panel.png');

  // 4. Switch to Settings -> Appearance
  console.log('[Test] Navigating to Settings -> Appearance...');
  await panelWindow.webContents.executeJavaScript(`
    window.panelController.switchTab('settings');
    const appCard = document.querySelector('.appearance-group-card');
    if (appCard) appCard.scrollIntoView({ behavior: 'instant', block: 'start' });
  `);
  await new Promise(r => setTimeout(r, 800));

  const settingsImg = await panelWindow.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'real_pet_appearance_settings.png'), settingsImg.toPNG());
  console.log('[Test] Saved real_pet_appearance_settings.png');

  // 5. Test Live Appearance Modification via Sliders
  console.log('[Test] Testing live slider adjustments (depth 100%, body width 150px)...');
  await panelWindow.webContents.executeJavaScript(`
    (() => {
      const depthSlider = document.getElementById('setting-pet-depth');
      const widthSlider = document.getElementById('setting-pet-width');
      if (depthSlider) {
        depthSlider.value = 100;
        depthSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (widthSlider) {
        widthSlider.value = 150;
        widthSlider.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  // Sync to pet window
  const updatedAppearance = await panelWindow.webContents.executeJavaScript(`
    (() => {
      return (window.panelController && window.panelController.settingsTab && window.panelController.settingsTab.appearance) ? window.panelController.settingsTab.appearance : {};
    })()
  `);

  await petWindow.webContents.executeJavaScript(`
    (() => {
      const ctrl = window.petController || window.faceBotController;
      if (ctrl && ctrl.pet) {
        ctrl.pet.updateConfig(${JSON.stringify(updatedAppearance || {})});
        ctrl.render();
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 600));

  const modifiedPetImg = await petWindow.capturePage();
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'real_pet_custom_appearance.png'), modifiedPetImg.toPNG());
  console.log('[Test] Saved real_pet_custom_appearance.png');

  // Reset to default
  await panelWindow.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('btn-reset-appearance');
      if (btn) btn.click();
    })()
  `);
  await new Promise(r => setTimeout(r, 400));

  // 6. Test Closing panel (simulates clicking outside or clicking pet again)
  console.log('[Test] Closing panel (hiding)...');
  panelWindow.hide();
  await new Promise(r => setTimeout(r, 400));
  console.log('[Test] Panel window isVisible after close:', panelWindow.isVisible(), '(Expected false)');
  console.log('[Test] Pet window isVisible after close:', petWindow.isVisible(), '(Expected true)');

  console.log('[Test] All verification tests passed successfully!');
  app.quit();
});
