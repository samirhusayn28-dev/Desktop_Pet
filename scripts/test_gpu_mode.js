const { app, BrowserWindow } = require('electron');
const path = require('path');

const testHw = process.argv.includes('--disable-gpu');
if (testHw) {
  app.disableHardwareAcceleration();
  console.log('[Mode] Hardware Acceleration DISABLED');
} else {
  console.log('[Mode] Hardware Acceleration ENABLED');
}

app.commandLine.appendSwitch('disable-features', 'Autofill,Translate,MediaRouter');

const { ipcMain } = require('electron');
ipcMain.on('pet:get-appearance', (e) => {
  e.returnValue = { scale: 1.0, width: 136, height: 120 };
});

app.whenReady().then(async () => {
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

  await win.loadFile(path.join(__dirname, '..', 'pet-window', 'pet.html'));
  await new Promise(r => setTimeout(r, 2000));

  const metrics = app.getAppMetrics();
  let totalWorkingSetKB = 0;
  for (const m of metrics) {
    totalWorkingSetKB += m.memory?.workingSetSize || 0;
    console.log(`  Type: ${m.type.padEnd(10)} PID: ${m.pid}  WorkingSet: ${Math.round((m.memory?.workingSetSize||0)/1024)}MB  CPU: ${m.cpu?.percentCPUUsage||0}%`);
  }
  console.log(`TOTAL App Memory: ${Math.round(totalWorkingSetKB / 1024)} MB`);

  win.destroy();
  app.quit();
});
