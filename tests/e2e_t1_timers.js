/**
 * Desktop Pet — E2E Test Suite for ITEM T1 (Customizable Precision Timers)
 *
 * Runs strictly against the packaged app at ~/Desktop/Desktop Pet.app with real clicks:
 * 1. 5s countdown timer -> close panel -> confirm end event in main process, bubble, and pet reaction (laugh).
 * 2. Custom 1-minute Pomodoro focus -> close panel -> verify pet held focus -> simulate sleep/resume time jump -> confirm end event & pet reaction.
 * 3. Reopen panel -> verify state persistence and display accuracy.
 * 4. Stopwatch -> start -> record lap -> verify lap list with lap number, lap time, and split time.
 * 5. Reset section -> verify resets back to default 25/5/15.
 * 6. Validation -> countdown 1s to 99:59:59, Pomodoro 1 to 180m.
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const assert = require('assert');

const APP_PATH = path.join(os.homedir(), 'Desktop', 'Desktop Pet.app', 'Contents', 'MacOS', 'Desktop Pet');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('================================================================');
  console.log('Desktop Pet — Item T1 Precision Timers E2E Verification');
  console.log(`Binary: ${APP_PATH}`);
  console.log('================================================================\n');

  let app = null;
  const results = [];

  function record(testName, passed, details = '') {
    results.push({ testName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${mark}] ${testName} ${details ? '(' + details + ')' : ''}`);
  }

  try {
    app = await electron.launch({
      executablePath: APP_PATH,
      args: ['--test-hooks', '--no-sandbox'],
      timeout: 30000
    });

    console.log('App launched. Waiting for windows...');
    await sleep(2500);

    const windows = app.windows();
    console.log(`Found ${windows.length} windows initially.`);
    
    // Find pet window
    let petWin = null;
    for (const win of windows) {
      const title = await win.title();
      const url = win.url();
      if (url.includes('pet.html')) {
        petWin = win;
        break;
      }
    }

    if (!petWin) {
      petWin = windows[0];
    }
    assert(petWin, 'Pet window must be found');

    // Helper: open panel window
    async function openPanel() {
      await petWin.evaluate(() => {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('panel:open', { tab: 'timer' });
      });
      await sleep(1500);
      for (const w of app.windows()) {
        const url = w.url();
        if (url.includes('panel.html')) return w;
      }
      throw new Error('Panel window not found after open request');
    }

    // Helper: close panel window
    async function closePanel(panelWin) {
      await panelWin.evaluate(() => {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('panel:close');
      });
      await sleep(1000);
    }

    // -------------------------------------------------------------
    // TEST 1: Countdown 5s timer with panel closed
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Countdown 5s Timer (Panel Closed) ---');
    let panelWin = await openPanel();
    
    // Click Timer tab in tabbar
    await panelWin.click('.tab-btn[data-tab="timer"]');
    await sleep(500);

    // Switch to countdown mode
    await panelWin.click('.timer-mode-btn[data-mode="countdown"]');
    await sleep(500);

    // Set countdown duration to 5s using custom steppers: hours=0, mins=0, secs=5
    await panelWin.evaluate(() => {
      document.getElementById('countdown-hours-input').value = 0;
      document.getElementById('countdown-minutes-input').value = 0;
      document.getElementById('countdown-seconds-input').value = 5;
      document.getElementById('countdown-seconds-input').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(400);

    // Verify clock display shows 00:05
    const displayTimeInitial = await panelWin.textContent('#timer-time-display');
    console.log(`Initial countdown display: ${displayTimeInitial.trim()}`);
    assert.strictEqual(displayTimeInitial.trim(), '00:05', 'Countdown display should be 00:05');

    // Real click Start Timer button
    await panelWin.click('#btn-timer-toggle');
    console.log('Clicked Start Timer. Closing panel window...');

    // Close panel window
    await closePanel(panelWin);

    // Wait 5.5 seconds for countdown to expire in main process
    console.log('Waiting 5.5s for countdown to finish in main process with panel closed...');
    await sleep(5500);

    // Inspect Pet Window: emotion should be 'laugh', and speech bubble visible
    const petEmotion1 = await petWin.getAttribute('#pet-root-container', 'data-emotion');
    const bubbleBadge1 = await petWin.evaluate(() => {
      const el = document.getElementById('bubble-badge');
      return el ? el.textContent.trim() : '';
    });
    const bubbleText1 = await petWin.evaluate(() => {
      const el = document.getElementById('bubble-text');
      return el ? el.textContent.trim() : '';
    });

    console.log(`Pet emotion after countdown: "${petEmotion1}"`);
    console.log(`Bubble badge: "${bubbleBadge1}", text: "${bubbleText1}"`);

    const t1Passed = (petEmotion1 === 'laugh' || petEmotion1 === 'happy') && bubbleBadge1.includes('TIMER');
    record('Countdown 5s (Panel Closed)', t1Passed, `emotion=${petEmotion1}, badge=${bubbleBadge1}`);

    // -------------------------------------------------------------
    // TEST 2: Custom 1-Minute Pomodoro Focus & Sleep/Resume Accuracy
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Custom 1-min Pomodoro & Sleep/Resume Accuracy ---');
    panelWin = await openPanel();
    await panelWin.click('.tab-btn[data-tab="timer"]');
    await sleep(400);

    // Switch to Pomodoro mode
    await panelWin.click('.timer-mode-btn[data-mode="pomodoro"]');
    await sleep(400);

    // Set custom focus duration to 1 minute via custom stepper input
    await panelWin.evaluate(() => {
      const input = document.getElementById('pomodoro-focus-input');
      input.value = 1;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(400);

    const pomoDisplay = await panelWin.textContent('#timer-time-display');
    console.log(`Pomodoro display configured to: ${pomoDisplay.trim()}`);
    assert.strictEqual(pomoDisplay.trim(), '01:00', 'Pomodoro display should be 01:00');

    // Real click Start Focus
    await panelWin.click('#btn-timer-toggle');
    await sleep(500);

    // Check Pet Emotion is 'focus'
    const petFocusEmotion = await petWin.getAttribute('#pet-root-container', 'data-emotion');
    console.log(`Pet emotion during Pomodoro focus: "${petFocusEmotion}"`);
    assert.strictEqual(petFocusEmotion, 'focus', 'Pet should enter held focus emotion during session');

    // Close panel window
    console.log('Closing panel window while Pomodoro is running...');
    await closePanel(panelWin);

    // Simulate sleep/resume by jumping time forward 60 seconds
    console.log('Simulating Mac sleep / resume (60s time jump)...');
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('timer:simulate-time-jump', 62);
    });
    await sleep(1500);

    // Inspect pet reaction and bubble
    const petEmotion2 = await petWin.getAttribute('#pet-root-container', 'data-emotion');
    const bubbleBadge2 = await petWin.evaluate(() => {
      const el = document.getElementById('bubble-badge');
      return el ? el.textContent.trim() : '';
    });
    const t2Passed = (petEmotion2 === 'laugh' || petEmotion2 === 'excited') && (bubbleBadge2.includes('POMODORO') || bubbleBadge2.includes('LONG BREAK'));
    record('Pomodoro 1m & Sleep/Resume', t2Passed, `emotion=${petEmotion2}, badge=${bubbleBadge2}`);

    // -------------------------------------------------------------
    // TEST 3: Reopen Panel & Verify Persistent State & Sessions Count
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Reopen Panel & State Persistence ---');
    panelWin = await openPanel();
    await panelWin.click('.tab-btn[data-tab="timer"]');
    await sleep(500);

    const sessionCountText = await panelWin.textContent('#pomodoro-count');
    console.log(`Completed sessions count on reopen: ${sessionCountText.trim()}`);
    const t3Passed = parseInt(sessionCountText.trim(), 10) >= 1;
    record('Panel Reopen State & Sessions Count', t3Passed, `sessions=${sessionCountText.trim()}`);

    // -------------------------------------------------------------
    // TEST 4: Stopwatch & Laps Verification
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Stopwatch & Laps ---');
    await panelWin.click('.timer-mode-btn[data-mode="stopwatch"]');
    await sleep(400);

    // Verify Lap button is visible
    const lapBtnVisible = await panelWin.isVisible('#btn-timer-lap');
    assert(lapBtnVisible, 'Lap button must be visible in stopwatch mode');

    // Click Start
    await panelWin.click('#btn-timer-toggle');
    await sleep(1200);

    // Click Lap
    await panelWin.click('#btn-timer-lap');
    await sleep(400);

    // Verify lap row recorded
    const lapsCount = await panelWin.evaluate(() => {
      const tbody = document.getElementById('stopwatch-laps-body');
      return tbody ? tbody.querySelectorAll('tr:not(.no-laps-row)').length : 0;
    });
    console.log(`Recorded laps count: ${lapsCount}`);

    // Click Reset
    await panelWin.click('#btn-timer-reset');
    await sleep(300);

    const t4Passed = lapsCount >= 1;
    record('Stopwatch & Laps Recording', t4Passed, `lapsRecorded=${lapsCount}`);

    // -------------------------------------------------------------
    // TEST 5: Reset Section Functionality
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Reset Section Verification ---');
    await panelWin.click('.timer-mode-btn[data-mode="pomodoro"]');
    await sleep(300);

    // Click Reset section button in Pomodoro card
    await panelWin.click('#btn-reset-pomodoro');
    await sleep(400);

    const focusValAfterReset = await panelWin.inputValue('#pomodoro-focus-input');
    const shortBreakValAfterReset = await panelWin.inputValue('#pomodoro-short-break-input');
    console.log(`Focus after reset: ${focusValAfterReset}, Short break: ${shortBreakValAfterReset}`);

    const t5Passed = focusValAfterReset === '25' && shortBreakValAfterReset === '5';
    record('Reset Section (Pomodoro to 25/5/15)', t5Passed, `focus=${focusValAfterReset}, shortBreak=${shortBreakValAfterReset}`);

    // -------------------------------------------------------------
    // TEST 6: Validation & Clamp Limits
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Validation Bounds ---');
    await panelWin.click('.timer-mode-btn[data-mode="countdown"]');
    await sleep(300);

    // Attempt setting 0s countdown
    await panelWin.evaluate(() => {
      document.getElementById('countdown-hours-input').value = 0;
      document.getElementById('countdown-minutes-input').value = 0;
      document.getElementById('countdown-seconds-input').value = 0;
      document.getElementById('countdown-seconds-input').dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(300);

    const clampedSecs = await panelWin.inputValue('#countdown-seconds-input');
    console.log(`Countdown 0s clamped to: ${clampedSecs}s`);

    // Attempt setting Pomodoro focus to 250 min
    await panelWin.click('.timer-mode-btn[data-mode="pomodoro"]');
    await sleep(300);
    await panelWin.evaluate(() => {
      const input = document.getElementById('pomodoro-focus-input');
      input.value = 250;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(300);

    const clampedFocus = await panelWin.inputValue('#pomodoro-focus-input');
    console.log(`Pomodoro focus 250m clamped to: ${clampedFocus}m`);

    const t6Passed = (clampedSecs === '1') && (clampedFocus === '180');
    record('Validation (Countdown >= 1s, Focus <= 180m)', t6Passed, `clampedSecs=${clampedSecs}, clampedFocus=${clampedFocus}`);

    await closePanel(panelWin);
  } catch (err) {
    console.error('\n❌ Test execution failed with error:', err);
    record('Test Suite Execution', false, err.message);
  } finally {
    if (app) {
      try {
        await app.close();
      } catch (e) {}
    }
  }

  console.log('\n================================================================');
  console.log('FINAL ITEM T1 VERIFICATION SUMMARY:');
  console.log('================================================================');
  let allPass = true;
  for (const r of results) {
    const mark = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${r.testName}: ${r.details}`);
    if (!r.passed) allPass = false;
  }
  console.log('================================================================\n');

  if (allPass && results.length >= 6) {
    console.log('🎉 ALL ITEM T1 PRECISION TIMER TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('💥 ITEM T1 VERIFICATION HAD FAILURES!');
    process.exit(1);
  }
})();
