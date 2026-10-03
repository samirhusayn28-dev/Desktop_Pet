/**
 * Script to generate high-resolution macOS icons for Desktop Pet
 * Creates:
 *  - assets/icon.png (1024x1024)
 *  - assets/tray-icon.png (22x22 template)
 *  - assets/tray-icon@2x.png (44x44 template)
 *  - assets/icon.icns (macOS icon bundle using iconutil)
 */

const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      offscreen: true
    }
  });

  const iconSvg = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1024px;
        height: 1024px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-container {
        width: 1024px;
        height: 1024px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      /* macOS Squircle Background */
      .squircle {
        position: absolute;
        width: 860px;
        height: 860px;
        border-radius: 195px;
        background: linear-gradient(150deg, #1C1E2A 0%, #111219 50%, #0A0A0F 100%);
        box-shadow: 
          0 40px 100px rgba(0, 0, 0, 0.7),
          inset 0 2px 4px rgba(255, 255, 255, 0.2),
          inset 0 -2px 4px rgba(0, 0, 0, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      /* Subtle orange rim glow */
      .squircle-glow {
        position: absolute;
        width: 860px;
        height: 860px;
        border-radius: 195px;
        box-shadow: 0 0 90px rgba(255, 122, 47, 0.18);
        pointer-events: none;
      }
      /* White 3D Clay Face-Bot Body */
      .pet-face {
        position: relative;
        z-index: 10;
        width: 540px;
        height: 480px;
        border-radius: 140px;
        background: linear-gradient(145deg, #FFFFFF 0%, #F4F4F8 45%, #E2E3EB 100%);
        box-shadow: 
          0 24px 60px rgba(0, 0, 0, 0.45),
          0 6px 16px rgba(0, 0, 0, 0.25),
          inset 0 3px 6px rgba(255, 255, 255, 0.9),
          inset 0 -8px 16px rgba(180, 185, 205, 0.45);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 28px;
      }
      /* Solid Black Dot Eyes */
      .eyes-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 160px;
        margin-top: 10px;
      }
      .dot-eye {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: #111218;
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
      }
      /* Minimal Line Mouth */
      .mouth-line {
        width: 48px;
        height: 7px;
        border-radius: 999px;
        background: #111218;
      }
      /* Subtle Orange Companion Accent Dot */
      .pet-accent-dot {
        position: absolute;
        bottom: 40px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #FF7A2F;
        box-shadow: 0 0 16px #FF7A2F;
      }
    </style>
  </head>
  <body>
    <div class="icon-container">
      <div class="squircle-glow"></div>
      <div class="squircle"></div>
      <div class="pet-face">
        <div class="eyes-row">
          <div class="dot-eye"></div>
          <div class="dot-eye"></div>
        </div>
        <div class="mouth-line"></div>
        <div class="pet-accent-dot"></div>
      </div>
    </div>
  </body>
  </html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(iconSvg)}`);
  await new Promise(r => setTimeout(r, 600));

  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  const assetsDir = path.join(__dirname, '..', 'assets');
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  const iconPngPath = path.join(assetsDir, 'icon.png');
  fs.writeFileSync(iconPngPath, image.toPNG());
  fs.writeFileSync(path.join(buildDir, 'icon.png'), image.toPNG());
  console.log('✓ Generated 1024x1024 assets/icon.png');

  // Generate macOS .iconset and .icns
  const iconsetDir = path.join(assetsDir, 'icon.iconset');
  if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true });

  const iconSizes = [
    { size: 16, name: 'icon_16x16.png' },
    { size: 32, name: 'icon_16x16@2x.png' },
    { size: 32, name: 'icon_32x32.png' },
    { size: 64, name: 'icon_32x32@2x.png' },
    { size: 128, name: 'icon_128x128.png' },
    { size: 256, name: 'icon_128x128@2x.png' },
    { size: 256, name: 'icon_256x256.png' },
    { size: 512, name: 'icon_256x256@2x.png' },
    { size: 512, name: 'icon_512x512.png' },
    { size: 1024, name: 'icon_512x512@2x.png' }
  ];

  for (const s of iconSizes) {
    const resized = image.resize({ width: s.size, height: s.size, quality: 'best' });
    fs.writeFileSync(path.join(iconsetDir, s.name), resized.toPNG());
  }

  try {
    const icnsPath = path.join(assetsDir, 'icon.icns');
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`);
    fs.copyFileSync(icnsPath, path.join(buildDir, 'icon.icns'));
    console.log('✓ Generated macOS assets/icon.icns');
  } catch (err) {
    console.warn('iconutil error:', err);
  }

  // Generate Menu Bar Tray Template Icons (monochrome black/alpha for macOS menu bar)
  const trayWin = new BrowserWindow({
    width: 44,
    height: 44,
    show: false,
    transparent: true,
    frame: false
  });

  const traySvg = `
  <!DOCTYPE html>
  <html>
  <body style="margin:0; padding:0; background:transparent; display:flex; align-items:center; justify-content:center; width:44px; height:44px;">
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="4" width="32" height="28" rx="8" stroke="black" stroke-width="2.5" fill="none" />
      <circle cx="12" cy="17" r="2.2" fill="black" />
      <circle cx="24" cy="17" r="2.2" fill="black" />
      <line x1="15" y1="23" x2="21" y2="23" stroke="black" stroke-width="2" stroke-linecap="round" />
    </svg>
  </body>
  </html>
  `;
  await trayWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(traySvg)}`);
  await new Promise(r => setTimeout(r, 300));
  const trayImage = await trayWin.webContents.capturePage({ x: 0, y: 0, width: 44, height: 44 });
  fs.writeFileSync(path.join(assetsDir, 'tray-icon@2x.png'), trayImage.toPNG());
  const tray1x = trayImage.resize({ width: 22, height: 22 });
  fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), tray1x.toPNG());
  console.log('✓ Generated monochrome assets/tray-icon.png and tray-icon@2x.png');

  win.close();
  trayWin.close();
  app.quit();
});
