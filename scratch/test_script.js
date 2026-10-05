
const { app, BrowserWindow, screen } = require("electron");
const fs = require("fs");
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 230,
    height: 230,
    transparent: true,
    frame: false,
    hasShadow: false,
    show: false
  });
  win.setPosition(100, -80);
  const pos = win.getPosition();
  const bounds = win.getBounds();
  fs.writeFileSync("scratch/test_pos.json", JSON.stringify({ pos, bounds }));
  app.exit(0);
});
