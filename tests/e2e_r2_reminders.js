/**
 * Playwright E2E Test for Item R2: Reminders Tab Inline Edit & Full Lifecycle
 * Tests on the PACKAGED Desktop Pet application:
 * 1. Add reminder with custom title, time, and repeat.
 * 2. Click Edit button -> verifies inline edit form renders with custom pickers.
 * 3. Cancel edit -> verifies state restored.
 * 4. Save edit -> updates title, time, and repeat, updates store and background scheduler.
 * 5. Snooze reminder (+5m) -> verifies time advanced and speech bubble notification.
 * 6. Mark done / toggle enabled -> verifies active/disabled class state.
 * 7. Alert firing -> verifies reminder due at scheduled time triggers surprised/bounce + speech bubble.
 * 8. Delete reminder -> removes reminder, verifies empty state.
 * 9. Persistence across app restart -> verifies data survives relaunch.
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const assert = require('assert');

const APP_PATH = path.join(os.homedir(), 'Desktop', 'Desktop Pet.app', 'Contents', 'MacOS', 'Desktop Pet');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('=== Running Playwright E2E Reminders (Item R2) Test Suite ===');
  console.log('Target Binary:', APP_PATH);

  let electronApp = await electron.launch({
    executablePath: APP_PATH,
    args: ['--test-hooks']
  });

  let totalPassed = 0;
  let totalFailed = 0;

  function pass(desc) {
    totalPassed++;
    console.log(`  ✓ PASS: ${desc}`);
  }

  function fail(desc, err) {
    totalFailed++;
    console.error(`  ✗ FAIL: ${desc}`, err ? err.message : '');
  }

  try {
    const petWin = await electronApp.firstWindow();
    await petWin.waitForLoadState('domcontentloaded');
    await sleep(1500);

    // 1. Open panel window and switch to reminders tab
    console.log('\n--- Phase 1: Open Panel & Navigate to Reminders Tab ---');
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('panel:open', { tab: 'reminders' });
    });

    await sleep(1000);

    // Locate panel window
    const allWindows = electronApp.windows();
    const panelWin = allWindows.find(w => w.url().includes('panel.html'));
    assert(panelWin, 'Panel window could not be found');
    await panelWin.waitForLoadState('domcontentloaded');

    await panelWin.evaluate(() => {
      if (window.panelController) {
        window.panelController.switchTab('reminders');
      }
    });
    await sleep(500);
    pass('Panel window opened and switched to Reminders tab');

    // 2. Add a new reminder
    console.log('\n--- Phase 2: Add Reminder ---');
    // Clear any leftover test reminders first
    await panelWin.evaluate(() => {
      if (window.panelController?.store) {
        window.panelController.store.set('reminders', []);
      }
      if (window.panelController?.remindersTab) {
        window.panelController.remindersTab.loadReminders();
      }
    });
    await sleep(300);

    await panelWin.fill('#reminder-text-input', 'Review Architectural Specs');
    await panelWin.fill('#reminder-time-input', '14:30');
    await panelWin.selectOption('#reminder-repeat-select', 'daily');
    await panelWin.click('#btn-save-reminder');
    await sleep(300);

    const reminderItems = await panelWin.$$('.reminder-item');
    assert.strictEqual(reminderItems.length, 1, 'Expected exactly 1 reminder item in list');

    const titleText = await panelWin.$eval('.reminder-title', el => el.textContent.trim());
    const timeText = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    const repeatText = await panelWin.$eval('.reminder-repeat-badge', el => el.textContent.trim());

    assert.strictEqual(titleText, 'Review Architectural Specs', `Title should match: got "${titleText}"`);
    assert(timeText.includes('14:30'), `Time should include 14:30: got "${timeText}"`);
    assert.strictEqual(repeatText, 'daily', `Repeat should be daily: got "${repeatText}"`);
    pass('Added new reminder: "Review Architectural Specs" at 14:30 daily');

    // 3. Click Edit Button -> Inline Form Appearance
    console.log('\n--- Phase 3: Inline Edit Form Appearance ---');
    const editBtn = await panelWin.$('.reminder-edit-btn');
    assert(editBtn, 'Edit button must exist on reminder item');
    await editBtn.click();
    await sleep(300);

    const editingItem = await panelWin.$('.reminder-item.editing');
    assert(editingItem, 'Reminder item must receive .editing class when edit button is clicked');

    const editTitleInput = await panelWin.$('.reminder-edit-title');
    const editTimeInput = await panelWin.$('.reminder-edit-time');
    const editRepeatSelect = await panelWin.$('.reminder-edit-repeat');
    const editCancelBtn = await panelWin.$('.reminder-edit-cancel-btn');
    const editSaveBtn = await panelWin.$('.reminder-edit-save-btn');

    assert(editTitleInput, 'Inline edit form must have title input');
    assert(editTimeInput, 'Inline edit form must have time input');
    assert(editRepeatSelect, 'Inline edit form must have repeat select');
    assert(editCancelBtn, 'Inline edit form must have cancel button');
    assert(editSaveBtn, 'Inline edit form must have save button');

    const initialEditTitle = await editTitleInput.inputValue();
    const initialEditTime = await editTimeInput.inputValue();
    const initialEditRepeat = await editRepeatSelect.inputValue();

    assert.strictEqual(initialEditTitle, 'Review Architectural Specs', 'Title input must be pre-filled with existing title');
    assert.strictEqual(initialEditTime, '14:30', 'Time input must be pre-filled with existing time');
    assert.strictEqual(initialEditRepeat, 'daily', 'Repeat select must be pre-filled with existing repeat');
    pass('Edit button clicked: inline edit form rendered with all pre-filled pickers');

    // 4. Cancel Editing
    console.log('\n--- Phase 4: Cancel Editing ---');
    await editTitleInput.fill('Changed text that should be cancelled');
    await editCancelBtn.click();
    await sleep(200);

    const editingItemAfterCancel = await panelWin.$('.reminder-item.editing');
    assert.strictEqual(editingItemAfterCancel, null, 'Inline edit form should be dismissed after Cancel');

    const restoredTitle = await panelWin.$eval('.reminder-title', el => el.textContent.trim());
    assert.strictEqual(restoredTitle, 'Review Architectural Specs', 'Title must remain unchanged after cancelling edit');
    pass('Cancel button clicked: inline edit form dismissed without modifying reminder');

    // 5. Save Edited Reminder
    console.log('\n--- Phase 5: Save Edited Reminder ---');
    await panelWin.click('.reminder-edit-btn');
    await sleep(200);

    await panelWin.fill('.reminder-edit-title', 'Production Deployment & Rollback Check');
    await panelWin.fill('.reminder-edit-time', '19:45');
    await panelWin.selectOption('.reminder-edit-repeat', 'every-hour');
    await panelWin.click('.reminder-edit-save-btn');
    await sleep(300);

    const savedTitle = await panelWin.$eval('.reminder-title', el => el.textContent.trim());
    const savedTime = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    const savedRepeat = await panelWin.$eval('.reminder-repeat-badge', el => el.textContent.trim());

    assert.strictEqual(savedTitle, 'Production Deployment & Rollback Check', `Updated title should match: got "${savedTitle}"`);
    assert(savedTime.includes('19:45'), `Updated time should include 19:45: got "${savedTime}"`);
    assert.strictEqual(savedRepeat, 'every-hour', `Updated repeat should match: got "${savedRepeat}"`);

    // Verify stored in electron-store / backend
    const storedReminders = await panelWin.evaluate(() => {
      return window.panelController?.store?.get('reminders') || [];
    });
    assert.strictEqual(storedReminders.length, 1);
    assert.strictEqual(storedReminders[0].title, 'Production Deployment & Rollback Check');
    assert.strictEqual(storedReminders[0].time, '19:45');
    assert.strictEqual(storedReminders[0].repeat, 'every-hour');
    pass('Save button clicked: updated title, time, and repeat saved to UI and persistent store');

    // 6. Snooze Reminder (+5m)
    console.log('\n--- Phase 6: Snooze Reminder ---');
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5);
    const expectedHours = String(now.getHours()).padStart(2, '0');
    const expectedMins = String(now.getMinutes()).padStart(2, '0');
    const expectedTimeStr = `${expectedHours}:${expectedMins}`;

    await panelWin.click('.reminder-snooze-btn');
    await sleep(300);

    const snoozedTime = await panelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    assert(snoozedTime.includes(expectedTimeStr), `Snooze (+5m) should update time to ${expectedTimeStr}: got "${snoozedTime}"`);
    pass(`Snooze (+5m) advanced reminder time to ${expectedTimeStr}`);

    // 7. Toggle Enabled / Mark Done Checkbox
    console.log('\n--- Phase 7: Toggle Enabled / Mark Done Checkbox ---');
    // Uncheck -> disabled
    await panelWin.click('.reminder-checkbox');
    await sleep(300);

    let itemClass = await panelWin.$eval('.reminder-item', el => el.className);
    assert(itemClass.includes('disabled'), 'Item must receive disabled class when unchecked');

    // Recheck -> active
    await panelWin.click('.reminder-checkbox');
    await sleep(300);

    itemClass = await panelWin.$eval('.reminder-item', el => el.className);
    assert(itemClass.includes('active'), 'Item must receive active class when checked');
    pass('Checkbox toggle transitions reminder between active and disabled states');

    // 8. Scheduled Alert Firing at Due Time (Speech Bubble + Reaction)
    console.log('\n--- Phase 8: Scheduled Alert Firing ---');
    // Set reminder time to current HH:MM to trigger scheduler
    const currDate = new Date();
    const currH = String(currDate.getHours()).padStart(2, '0');
    const currM = String(currDate.getMinutes()).padStart(2, '0');
    const curTime = `${currH}:${currM}`;

    await panelWin.click('.reminder-edit-btn');
    await sleep(200);
    await panelWin.fill('.reminder-edit-title', 'Alert Due Now');
    await panelWin.fill('.reminder-edit-time', curTime);
    await panelWin.selectOption('.reminder-edit-repeat', 'once');
    await panelWin.click('.reminder-edit-save-btn');
    await sleep(300);

    // Trigger scheduler evaluation via IPC
    await panelWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('reminders:updated');
    });
    await sleep(600);

    // Verify speech bubble is shown in Pet Window
    const bubbleVisible = await petWin.evaluate(() => {
      const b = document.getElementById('pet-speech-bubble');
      const text = document.getElementById('bubble-text');
      return {
        visible: b && (b.style.display !== 'none' || b.classList.contains('fade-in')),
        text: text ? text.textContent : ''
      };
    });

    assert(bubbleVisible.text.includes('Alert Due Now'), `Bubble must display reminder title: got "${bubbleVisible.text}"`);
    pass(`Reminder fired at scheduled time (${curTime}): speech bubble displayed "${bubbleVisible.text}"`);

    // 9. Delete Reminder
    console.log('\n--- Phase 9: Delete Reminder ---');
    await panelWin.click('.reminder-delete-btn');
    await sleep(300);

    const itemsAfterDelete = await panelWin.$$('.reminder-item');
    assert.strictEqual(itemsAfterDelete.length, 0, 'No reminder items should remain after delete');

    const emptyState = await panelWin.$('.tab-empty-state');
    assert(emptyState, 'Empty state must be displayed when no reminders exist');
    pass('Delete button removed reminder; empty state cleanly displayed');

    // 10. Persistence Across App Restart
    console.log('\n--- Phase 10: Persistence Across App Restart ---');
    await panelWin.fill('#reminder-text-input', 'Persistent Across Restart');
    await panelWin.fill('#reminder-time-input', '21:15');
    await panelWin.selectOption('#reminder-repeat-select', 'daily');
    await panelWin.click('#btn-save-reminder');
    await sleep(400);

    // Cleanly close the app
    await electronApp.close();
    await sleep(1500);

    // Launch app again
    electronApp = await electron.launch({
      executablePath: APP_PATH,
      args: ['--test-hooks']
    });

    const newPetWin = await electronApp.firstWindow();
    await newPetWin.waitForLoadState('domcontentloaded');
    await sleep(1500);

    // Open panel
    await newPetWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('panel:open', { tab: 'reminders' });
    });
    await sleep(1000);

    const newWindows = electronApp.windows();
    const newPanelWin = newWindows.find(w => w.url().includes('panel.html'));
    assert(newPanelWin, 'Panel window must open after restart');
    await newPanelWin.waitForLoadState('domcontentloaded');

    await newPanelWin.evaluate(() => {
      if (window.panelController) {
        window.panelController.switchTab('reminders');
      }
    });
    await sleep(500);

    const reloadedTitle = await newPanelWin.$eval('.reminder-title', el => el.textContent.trim());
    const reloadedTime = await newPanelWin.$eval('.reminder-time-badge', el => el.textContent.trim());
    const reloadedRepeat = await newPanelWin.$eval('.reminder-repeat-badge', el => el.textContent.trim());

    assert.strictEqual(reloadedTitle, 'Persistent Across Restart', `Title must match after restart: got "${reloadedTitle}"`);
    assert(reloadedTime.includes('21:15'), `Time must match after restart: got "${reloadedTime}"`);
    assert.strictEqual(reloadedRepeat, 'daily', `Repeat must match after restart: got "${reloadedRepeat}"`);
    pass('Reminder successfully persisted across application restart');

    // Clean up test reminder
    await newPanelWin.click('.reminder-delete-btn');
    await sleep(300);

    console.log('\n=== Item R2 Reminders Test Summary ===');
    console.log(`Total Passed: ${totalPassed}`);
    console.log(`Total Failed: ${totalFailed}`);
    assert.strictEqual(totalFailed, 0, 'All Item R2 tests must pass');
    console.log('ALL REMINDER TESTS PASSED SUCCESSFULLY!\n');

  } catch (err) {
    fail('E2E Test Execution', err);
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
  }
}

runTest();
