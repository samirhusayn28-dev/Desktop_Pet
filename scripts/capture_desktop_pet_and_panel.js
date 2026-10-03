/**
 * Capture Desktop Pet and Glassmorphic Panel Side-by-Side
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = '/Users/samirhusayn/.gemini/antigravity-ide/brain/ad1d272f-b7c0-4666-a011-842a6f84bf83';

app.whenReady().then(async () => {
  const stageWin = new BrowserWindow({
    width: 1080,
    height: 760,
    show: false,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  await stageWin.loadFile(path.join(__dirname, '..', 'stage_preview.html'));

  setTimeout(async () => {
    try {
      const img = await stageWin.webContents.capturePage();
      const outPath = path.join(ARTIFACTS_DIR, 'glassmorphic_desktop_pet_showcase.png');
      fs.writeFileSync(outPath, img.toPNG());
      console.log('CAPTURED_SHOWCASE:', outPath);
      app.quit();
    } catch (e) {
      console.error(e);
      app.quit();
    }
  }, 1400);
});
