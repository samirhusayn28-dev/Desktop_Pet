/**
 * Precision Resource Benchmark for Desktop Pet
 * Measures real RSS memory and CPU usage across processes (Main, Renderer, GPU)
 * using macOS native ps and process.getAppMetrics()
 */

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');
const { execSync } = require('child_process');

const store = require('../main/secure-store');
const systemSense = require('../main/system-sense');
const bubble = require('../main/bubble-window');

// Disable unused features for maximum lightness
app.commandLine.appendSwitch('disable-features', 'Autofill,Translate,MediaRouter');

let petWin = null;
let panelWin = null;

function getSystemProcessRSS(pids) {
  try {
    const pidStr = pids.join(',');
    const out = execSync(`ps -o rss= -p ${pidStr} 2>/dev/null`).toString();
    const lines = out.trim().split('\n').filter(Boolean);
    let totalKb = 0;
    for (const l of lines) {
      totalKb += parseInt(l.trim(), 10) || 0;
    }
    return Math.round(totalKb / 1024); // Return MB
  } catch (e) {
    return 0;
  }
}

app.whenReady().then(async () => {
  console.log('--- STARTING PRECISION RESOURCE BENCHMARK ---');

  // 1. Create Pet Window ONLY (Panel CLOSED)
  petWin = new BrowserWindow({
    width: 280,
    height: 280,
    x: 900,
    y: 500,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      backgroundThrottling: true
    }
  });

  bubble.setPetWindow(petWin);
  systemSense.setPetWindow(petWin);

  ipcMain.on('pet:get-appearance', (e) => {
    e.returnValue = store.get('settings.appearance') || { scale: 1.0, width: 136, height: 120 };
  });

  await petWin.loadFile(path.join(__dirname, '..', 'pet-window', 'pet.html'));
  
  // Wait 3 seconds for initial Chromium startup spikes and garbage collection to settle
  console.log('Settling idle pet window (3s)...');
  await new Promise(r => setTimeout(r, 3000));

  const pidsIdle = app.getAppMetrics().map(m => m.pid);
  const realRssIdleMB = getSystemProcessRSS(pidsIdle);

  // Sample CPU over 2 seconds
  const cpuSamples = [];
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 500));
    const metrics = app.getAppMetrics();
    let totalCpu = 0;
    for (const m of metrics) {
      if (m.cpu?.percentCPUUsage) totalCpu += m.cpu.percentCPUUsage;
    }
    cpuSamples.push(totalCpu);
  }
  const avgCpuIdle = cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length;

  console.log(`[Pet Only Idle] Total App RAM (Activity Monitor RSS): ${realRssIdleMB} MB`);
  console.log(`[Pet Only Idle] CPU Usage: ${avgCpuIdle.toFixed(2)}%`);

  // 2. Pet Sleeping CPU test
  petWin.webContents.send('pet:set-state', { state: 'sleeping' });
  await new Promise(r => setTimeout(r, 2000));

  const sleepCpuSamples = [];
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 500));
    const metrics = app.getAppMetrics();
    let totalCpu = 0;
    for (const m of metrics) {
      if (m.cpu?.percentCPUUsage) totalCpu += m.cpu.percentCPUUsage;
    }
    sleepCpuSamples.push(totalCpu);
  }
  const avgCpuSleep = sleepCpuSamples.reduce((a, b) => a + b, 0) / sleepCpuSamples.length;
  console.log(`[Pet Sleeping] CPU Usage: ${avgCpuSleep.toFixed(2)}%`);

  // 3. Open Panel Window
  console.log('\nOpening Panel Window...');
  panelWin = new BrowserWindow({
    width: 520,
    height: 680,
    x: 360,
    y: 200,
    minWidth: 420,
    minHeight: 560,
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      backgroundThrottling: true
    }
  });

  await panelWin.loadFile(path.join(__dirname, '..', 'panel-window', 'panel.html'));
  await new Promise(r => setTimeout(r, 3000));

  const pidsPanelOpen = app.getAppMetrics().map(m => m.pid);
  const realRssPanelOpenMB = getSystemProcessRSS(pidsPanelOpen);
  console.log(`[Panel Open] Total App RAM (Activity Monitor RSS): ${realRssPanelOpenMB} MB`);

  // 4. Destroy Panel Window (Close)
  console.log('\nClosing (Destroying) Panel Window...');
  panelWin.destroy();
  panelWin = null;
  await new Promise(r => setTimeout(r, 2500));

  const pidsPanelClosed = app.getAppMetrics().map(m => m.pid);
  const realRssPanelClosedMB = getSystemProcessRSS(pidsPanelClosed);
  console.log(`[Panel Closed / Destroyed] Total App RAM returned to: ${realRssPanelClosedMB} MB`);

  petWin.destroy();
  app.quit();
});
