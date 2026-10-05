/**
 * Desktop Pet — E2E Test Suite for ITEM R3 (Reminder Snooze Fix & Configurable Length)
 *
 * Runs strictly against the packaged app at ~/Desktop/Desktop Pet.app with real clicks:
 * 1. Reminder not yet due -> click snooze (+5m) -> postpones by 5 min from scheduled time.
 * 2. Reminder fired -> alert bubble appears -> click snooze (+5m) -> dismisses bubble and re-arms 5 min from now.
 * 3. Settings -> change snooze length to 15m -> button label follows (+15m) -> clicking advances by 15 min.
 * 4. Settings -> click reset icon -> reverts to 5m default and button label follows (+5m).
 * 5. Persistence across app restart -> verifies rescheduled reminder survives.
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const assert = require('assert');

const APP_PATH = path.join(os.homedir(), 'Desktop', 'Desktop Pet.app', 'Contents', 'MacOS', 'Desktop Pet');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('================================================================');
  console.log('Desktop Pet — Item R3 Reminder Snooze E2E Verification');
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
    let petWin = null;
    for (const win of windows) {
      const url = win.url();
      if (url.includes('pet.html')) {
        petWin = win;
        break;
      }
    }
    if (!petWin) petWin = windows[0];
    assert(petWin, 'Pet window must be found');

    // Helper: open panel
    async function openPanel(tab = 'reminders') {
      await petWin.evaluate((t) => {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('panel:open', { tab: t });
      }, tab);
      await sleep(1500);
      for (const w of app.windows()) {
        if (w.url().includes('panel.html')) return w;
      }
      throw new Error('Panel window not found after open request');
    }

    let panelWin = await openPanel('reminders');
    await panelWin.click('.tab-btn[data-tab="reminders"]');
    await sleep(400);

    // Clean reminders state for clean testing
    await panelWin.evaluate(() => {
      window.panelController.store.set('reminders', []);
      window.panelController.store.set('settings.behavior.snoozeMinutes', 5);
      if (window.panelController.remindersTab) {
        window.panelController.remindersTab.reminders = [];
        window.panelController.remindersTab.render();
      }
    });
    await sleep(300);

    // -------------------------------------------------------------
    // TEST 1: Reminder Not Yet Due -> Postpones by 5 min
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Reminder Not Yet Due Postpones by 5m ---');
    const now1 = new Date();
    // Schedule 20 minutes in the future (guaranteed not due)
    const futureDate = new Date(now1.getTime() + 20 * 60000);
    const fH = String(futureDate.getHours()).padStart(2, '0');
    const fM = String(futureDate.getMinutes()).padStart(2, '0');
    const scheduledTime = `${fH}:${fM}`;

    // Expected postponed time (+5m)
    const postDate = new Date(futureDate.getTime() + 5 * 60000);
    const pH = String(postDate.getHours()).padStart(2, '0');
    const pM = String(postDate.getMinutes()).padStart(2, '0');
    const expectedPostponedTime = `${pH}:${pM}`;

    await panelWin.fill('#reminder-text-input', 'Upcoming Sprint Standup');
    await panelWin.fill('#reminder-time-input', scheduledTime);
    await panelWin.selectOption('#reminder-repeat-select', 'once');
    await panelWin.click('#btn-save-reminder');
    await sleep(400);

    const initialBadge = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    console.log(`Initial scheduled time badge: "${initialBadge}"`);
    assert(initialBadge.includes(scheduledTime), `Should display scheduled time ${scheduledTime}`);

    // Real click Snooze (+5m)
    await panelWin.click('.reminder-snooze-btn');
    await sleep(400);

    const snoozedBadge = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    console.log(`Time badge after snooze: "${snoozedBadge}" (expected ${expectedPostponedTime})`);

    const t1Passed = snoozedBadge.includes(expectedPostponedTime);
    record('Not Yet Due Postpones (+5m)', t1Passed, `scheduled=${scheduledTime}, newTime=${snoozedBadge}`);

    // -------------------------------------------------------------
    // TEST 2: Reminder Fired -> Re-arms from now and Dismisses Bubble
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Fired Reminder Re-arms from Now & Dismisses Bubble ---');
    // Set reminder time to current HH:MM so it triggers
    const currDate = new Date();
    const curH = String(currDate.getHours()).padStart(2, '0');
    const curM = String(currDate.getMinutes()).padStart(2, '0');
    const curTime = `${curH}:${curM}`;

    await panelWin.click('.reminder-edit-btn');
    await sleep(200);
    await panelWin.fill('.reminder-edit-title', 'Active Fired Alert');
    await panelWin.fill('.reminder-edit-time', curTime);
    await panelWin.selectOption('.reminder-edit-repeat', 'once');
    await panelWin.click('.reminder-edit-save-btn');
    await sleep(300);

    // Trigger evaluation in scheduler
    await panelWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('reminders:updated');
    });
    await sleep(700);

    // Verify speech bubble is visible in Pet window
    const bubbleBeforeSnooze = await petWin.evaluate(() => {
      const b = document.getElementById('pet-speech-bubble');
      const badge = document.getElementById('bubble-badge');
      const text = document.getElementById('bubble-text');
      const visible = b && b.style.display !== 'none' && !b.classList.contains('fade-out');
      return {
        visible,
        badge: badge ? badge.textContent : '',
        text: text ? text.textContent : ''
      };
    });
    console.log(`Speech bubble before snooze: visible=${bubbleBeforeSnooze.visible}, badge="${bubbleBeforeSnooze.badge}", text="${bubbleBeforeSnooze.text}"`);
    assert(bubbleBeforeSnooze.visible, 'Speech bubble must be visible when reminder fires');

    // Expected re-arm time from now (+5m)
    const rearmDate = new Date(Date.now() + 5 * 60000);
    const rearmH = String(rearmDate.getHours()).padStart(2, '0');
    const rearmM = String(rearmDate.getMinutes()).padStart(2, '0');
    const expectedRearmTime = `${rearmH}:${rearmM}`;

    // Real click Snooze button on the fired reminder
    await panelWin.click('.reminder-snooze-btn');
    await sleep(500);

    // Verify speech bubble is dismissed (hidden)
    const bubbleAfterSnooze = await petWin.evaluate(() => {
      const b = document.getElementById('pet-speech-bubble');
      return !b || b.style.display === 'none' || b.classList.contains('fade-out');
    });
    console.log(`Speech bubble dismissed after snooze: ${bubbleAfterSnooze}`);

    // Verify reminder row is re-armed
    const rearmedBadge = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    const isItemActive = await panelWin.$eval('.reminder-item', el => el.classList.contains('active'));
    console.log(`Reminder badge after re-arm: "${rearmedBadge}", active=${isItemActive}`);

    const t2Passed = bubbleAfterSnooze && rearmedBadge.includes(expectedRearmTime) && isItemActive;
    record('Already Fired Re-arms & Dismisses Bubble', t2Passed, `dismissed=${bubbleAfterSnooze}, newTime=${rearmedBadge}`);

    // -------------------------------------------------------------
    // TEST 3: Configurable Snooze Length & Button Label Follows
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Snooze Length Setting & Button Label Sync ---');
    // Navigate to Settings tab
    await panelWin.click('#btn-header-settings');
    await sleep(400);

    // Change snooze length to 15 minutes
    await panelWin.selectOption('#setting-snooze-duration', '15');
    await sleep(300);

    const dispSnoozeText = await panelWin.textContent('#disp-snooze-duration');
    console.log(`Settings displayed snooze duration: "${dispSnoozeText.trim()}"`);

    // Return to Reminders tab
    await panelWin.click('.tab-btn[data-tab="reminders"]');
    await sleep(400);

    // Check button label is now +15m
    const snoozeBtnText = await panelWin.$eval('.reminder-snooze-btn span', el => el.textContent.trim());
    const snoozeBtnTitle = await panelWin.$eval('.reminder-snooze-btn', el => el.getAttribute('title'));
    console.log(`Snooze button label: "${snoozeBtnText}", title: "${snoozeBtnTitle}"`);

    const t3LabelPassed = (snoozeBtnText === '+15m') && snoozeBtnTitle.includes('15');

    // Click snooze and verify advances by 15 minutes
    const beforeTime = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    const [bH, bM] = beforeTime.replace(/[^\d:]/g, '').split(':').map(Number);
    const exp15Mins = (bH * 60 + bM + 15) % 1440;
    const exp15Time = `${String(Math.floor(exp15Mins / 60)).padStart(2, '0')}:${String(exp15Mins % 60).padStart(2, '0')}`;

    await panelWin.click('.reminder-snooze-btn');
    await sleep(400);

    const after15Badge = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    console.log(`Reminder time after +15m snooze: "${after15Badge}" (expected ${exp15Time})`);

    const t3Passed = t3LabelPassed && after15Badge.includes(exp15Time);
    record('Snooze Length Setting (15m) & Button Sync', t3Passed, `btnText=${snoozeBtnText}, newTime=${after15Badge}`);

    // -------------------------------------------------------------
    // TEST 4: Reset Snooze Length Setting via Reset Icon
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Reset Snooze Setting via Reset Icon ---');
    await panelWin.click('#btn-header-settings');
    await sleep(300);

    // Click reset icon next to snooze setting
    await panelWin.click('#reset-snooze-duration');
    await sleep(300);

    const resetDispText = await panelWin.textContent('#disp-snooze-duration');
    const resetSelectVal = await panelWin.inputValue('#setting-snooze-duration');
    console.log(`After reset: display="${resetDispText.trim()}", selectVal="${resetSelectVal}"`);

    await panelWin.click('.tab-btn[data-tab="reminders"]');
    await sleep(300);

    const revertedBtnText = await panelWin.$eval('.reminder-snooze-btn span', el => el.textContent.trim());
    console.log(`Reverted button label: "${revertedBtnText}"`);

    const t4Passed = (resetSelectVal === '5') && (revertedBtnText === '+5m');
    record('Reset Snooze Setting to Default (5m)', t4Passed, `selectVal=${resetSelectVal}, btnText=${revertedBtnText}`);

    // -------------------------------------------------------------
    // TEST 5: Persistence Across App Restart
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Persistence Across App Restart ---');
    const storedRemindersBefore = await panelWin.evaluate(() => {
      return window.panelController.store.get('reminders') || [];
    });
    assert(storedRemindersBefore.length >= 1, 'At least 1 reminder must be in store');
    const targetRem = storedRemindersBefore[0];

    // Close app
    await app.close();
    await sleep(1500);

    // Launch app again
    app = await electron.launch({
      executablePath: APP_PATH,
      args: ['--test-hooks', '--no-sandbox'],
      timeout: 30000
    });
    await sleep(2000);

    petWin = app.windows().find(w => w.url().includes('pet.html')) || app.windows()[0];
    panelWin = await openPanel('reminders');
    await panelWin.click('.tab-btn[data-tab="reminders"]');
    await sleep(500);

    const persistedBadge = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    console.log(`Persisted reminder time after restart: "${persistedBadge}" (original: "${targetRem.time}")`);

    const t5Passed = persistedBadge.includes(targetRem.time);
    record('Rescheduled Reminder Persists Across Restart', t5Passed, `time=${persistedBadge}`);

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
  console.log('FINAL ITEM R3 VERIFICATION SUMMARY:');
  console.log('================================================================');
  let allPass = true;
  for (const r of results) {
    const mark = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${r.testName}: ${r.details}`);
    if (!r.passed) allPass = false;
  }
  console.log('================================================================\n');

  if (allPass && results.length >= 5) {
    console.log('🎉 ALL ITEM R3 REMINDER SNOOZE TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('💥 ITEM R3 VERIFICATION HAD FAILURES!');
    process.exit(1);
  }
})();
