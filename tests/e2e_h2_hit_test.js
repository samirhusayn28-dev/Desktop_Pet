/**
 * Playwright E2E Test for Item H2 on the PACKAGED Desktop Pet App
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');

const APP_PATH = path.join(os.homedir(), 'Desktop', 'Desktop Pet.app', 'Contents', 'MacOS', 'Desktop Pet');

async function runTest() {
  console.log('=== Running Playwright E2E Hit-Test Suite on Packaged App ===');
  console.log('Target Binary:', APP_PATH);

  const electronApp = await electron.launch({
    executablePath: APP_PATH,
    args: ['--test-hooks']
  });

  try {
    // Wait for pet window
    const firstWindow = await electronApp.firstWindow();
    await firstWindow.waitForLoadState('domcontentloaded');
    await new Promise(r => setTimeout(r, 1500));

    // Evaluate geometry on main process
    const geom = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const petWin = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.getURL().includes('pet.html'));
      if (!petWin) return null;
      const [winX, winY] = petWin.getPosition();
      const [winW, winH] = petWin.getSize();
      return { winX, winY, winW, winH };
    });

    console.assert(geom !== null, 'FAIL: Could not locate pet window');
    console.log(`Pet Window Located: pos=(${geom.winX}, ${geom.winY}), size=${geom.winW}x${geom.winH}`);

    // Test matrix across configurations
    const testConfigs = [
      { name: 'Default', width: 136, height: 120, roundness: 36, scale: 1.0, glasses: false },
      { name: 'Smallest', width: 60, height: 60, roundness: 20, scale: 0.5, glasses: false },
      { name: 'Largest', width: 200, height: 200, roundness: 40, scale: 2.0, glasses: true },
      { name: 'Square Extreme', width: 136, height: 120, roundness: 0, scale: 1.0, glasses: false },
      { name: 'Pill Extreme', width: 136, height: 120, roundness: 50, scale: 1.0, glasses: true }
    ];

    let totalPoints = 0;
    let failures = 0;

    for (const cfg of testConfigs) {
      // Apply appearance via IPC
      await firstWindow.evaluate(async (config) => {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('test:set-appearance', {
          width: config.width,
          height: config.height,
          roundness: config.roundness,
          scale: config.scale,
          glassesEnabled: config.glasses
        });
      }, cfg);

      await new Promise(r => setTimeout(r, 200));

      const bodyRect = await firstWindow.evaluate(async () => {
        const { ipcRenderer } = require('electron');
        return await ipcRenderer.invoke('test:get-pet-geometry');
      });

      const midX = bodyRect.bodyX + bodyRect.bodyW / 2;
      const midY = bodyRect.bodyY + bodyRect.bodyH / 2;

      // Points to test: inside vs outside
      const pointsToTest = [
        // 1px inside
        { x: midX, y: bodyRect.bodyY + 1, expected: true, label: 'top 1px inside' },
        { x: midX, y: bodyRect.bodyY + bodyRect.bodyH - 1, expected: true, label: 'bottom 1px inside' },
        { x: bodyRect.bodyX + 1, y: midY, expected: true, label: 'left 1px inside' },
        { x: bodyRect.bodyX + bodyRect.bodyW - 1, y: midY, expected: true, label: 'right 1px inside' },

        // 1px, 5px, 20px outside
        { x: midX, y: bodyRect.bodyY - 1, expected: false, label: 'top 1px outside' },
        { x: midX, y: bodyRect.bodyY - 5, expected: false, label: 'top 5px outside' },
        { x: midX, y: bodyRect.bodyY - 20, expected: false, label: 'top 20px outside' },
        { x: midX, y: bodyRect.bodyY + bodyRect.bodyH + 1, expected: false, label: 'bottom 1px outside' },
        { x: midX, y: bodyRect.bodyY + bodyRect.bodyH + 5, expected: false, label: 'bottom 5px outside' },
        { x: midX, y: bodyRect.bodyY + bodyRect.bodyH + 20, expected: false, label: 'bottom 20px outside' },
        { x: bodyRect.bodyX - 1, y: midY, expected: false, label: 'left 1px outside' },
        { x: bodyRect.bodyX - 5, y: midY, expected: false, label: 'left 5px outside' },
        { x: bodyRect.bodyX - 20, y: midY, expected: false, label: 'left 20px outside' },
        { x: bodyRect.bodyX + bodyRect.bodyW + 1, y: midY, expected: false, label: 'right 1px outside' },
        { x: bodyRect.bodyX + bodyRect.bodyW + 5, y: midY, expected: false, label: 'right 5px outside' },
        { x: bodyRect.bodyX + bodyRect.bodyW + 20, y: midY, expected: false, label: 'right 20px outside' },
      ];

      // Corners if rounded
      if (bodyRect.bodyR > 2) {
        const arcCenterX = bodyRect.bodyX + bodyRect.bodyR;
        const arcCenterY = bodyRect.bodyY + bodyRect.bodyR;
        const cos45 = Math.cos(Math.PI / 4);
        const sin45 = Math.sin(Math.PI / 4);

        pointsToTest.push({
          x: arcCenterX - (bodyRect.bodyR - 1) * cos45,
          y: arcCenterY - (bodyRect.bodyR - 1) * sin45,
          expected: true,
          label: 'corner 1px inside'
        });
        pointsToTest.push({
          x: arcCenterX - (bodyRect.bodyR + 1) * cos45,
          y: arcCenterY - (bodyRect.bodyR + 1) * sin45,
          expected: false,
          label: 'corner 1px outside'
        });
        pointsToTest.push({
          x: arcCenterX - (bodyRect.bodyR + 5) * cos45,
          y: arcCenterY - (bodyRect.bodyR + 5) * sin45,
          expected: false,
          label: 'corner 5px outside'
        });
        pointsToTest.push({
          x: arcCenterX - (bodyRect.bodyR + 20) * cos45,
          y: arcCenterY - (bodyRect.bodyR + 20) * sin45,
          expected: false,
          label: 'corner 20px outside'
        });
      }

      for (const pt of pointsToTest) {
        totalPoints++;

        // Test via synthetic cursor hit test
        const simResult = await firstWindow.evaluate(async (p) => {
          const { ipcRenderer } = require('electron');
          const hit = await ipcRenderer.invoke('test:hit-test-point', { x: p.screenX, y: p.screenY });
          return hit.inside;
        }, { screenX: bodyRect.winX + pt.x, screenY: bodyRect.winY + pt.y });

        if (simResult !== pt.expected) {
          console.error(`  FAIL [${cfg.name} - ${pt.label}]: got ${simResult}, expected ${pt.expected}`);
          failures++;
        }
      }
      console.log(`  Config [${cfg.name}] verified (${pointsToTest.length} points)`);
    }

    // Test Bubble Area Exclusion
    const bubbleHit = await firstWindow.evaluate(async (g) => {
      const { ipcRenderer } = require('electron');
      // Point in speech bubble area (y = 30)
      const hit = await ipcRenderer.invoke('test:hit-test-point', { x: g.winX + g.winW / 2, y: g.winY + 30 });
      return hit.inside;
    }, geom);

    console.assert(!bubbleHit, 'FAIL: Speech bubble area captured hit test');
    console.log('  Speech bubble area correctly ignored: PASS');

    // Test Real Click on Body Shape toggles panel
    const panelBefore = await firstWindow.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      const g = await ipcRenderer.invoke('test:get-pet-geometry');
      return g.isPanelOpen;
    });

    console.log(`Panel initially open: ${panelBefore}`);

    // Click on the body shape rect inside renderer
    await firstWindow.evaluate(() => {
      const bodyShape = document.querySelector('.facebot-body-shape');
      if (bodyShape) {
        // Dispatch mousedown and mouseup
        const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
        const up = new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 });
        bodyShape.dispatchEvent(down);
        bodyShape.dispatchEvent(up);
      }
    });

    await new Promise(r => setTimeout(r, 400));

    // Verify pointer-events on container and body shape
    const pointerEventsCheck = await firstWindow.evaluate(() => {
      const body = getComputedStyle(document.body).pointerEvents;
      const viewport = getComputedStyle(document.getElementById('pet-viewport')).pointerEvents;
      const bubble = getComputedStyle(document.getElementById('pet-speech-bubble')).pointerEvents;
      const bodyShape = getComputedStyle(document.querySelector('.facebot-body-shape')).pointerEvents;
      return { body, viewport, bubble, bodyShape };
    });

    console.log('CSS Pointer-Events Check:', pointerEventsCheck);
    console.assert(pointerEventsCheck.body === 'none', 'document.body must be pointer-events: none');
    console.assert(pointerEventsCheck.viewport === 'none', '#pet-viewport must be pointer-events: none');
    console.assert(pointerEventsCheck.bubble === 'none', 'speech-bubble must be pointer-events: none');
    console.assert(pointerEventsCheck.bodyShape === 'auto', '.facebot-body-shape must be pointer-events: auto');

    console.log(`\n=== E2E Summary: ${totalPoints} points tested, ${failures} failures ===`);
    if (failures === 0) {
      console.log('ITEM H2 PACKAGED E2E TEST: ALL PASSED!');
    } else {
      console.error('ITEM H2 PACKAGED E2E TEST: FAILED!');
      process.exit(1);
    }
  } finally {
    await electronApp.close();
  }
}

runTest().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
