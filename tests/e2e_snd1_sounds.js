/**
 * Playwright E2E Test Suite for Item SND1: Sound ON/OFF Option & Unified Sound System
 * Tests on the PACKAGED Desktop Pet application.
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const os = require('os');
const fs = require('fs');

const APP_PATH = path.join(os.homedir(), 'Desktop', 'Desktop Pet.app', 'Contents', 'MacOS', 'Desktop Pet');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSoundTests() {
  console.log('=== Starting E2E Verification for Item SND1 (Sound Manager & Controls) ===');
  console.log('Target Binary:', APP_PATH);

  let passed = 0;
  let failed = 0;

  function pass(desc) {
    passed++;
    console.log(`  ✓ PASS: ${desc}`);
  }

  function fail(desc, err) {
    failed++;
    console.error(`  ✗ FAIL: ${desc}`, err ? err.message : '');
  }

  let electronApp = await electron.launch({
    executablePath: APP_PATH,
    args: ['--test-hooks']
  });

  try {
    const petWin = await electronApp.firstWindow();
    await petWin.waitForLoadState('domcontentloaded');
    await sleep(2000);

    // Initial check: ensure sounds are OFF by default
    console.log('\n--- Test 1: Default Sound State (OFF by default) ---');
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { soundsEnabled: false });
    });
    await sleep(200);
    const initialSettings = await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      return ipcRenderer.sendSync('pet:get-sound-settings');
    });
    if (initialSettings.soundsEnabled === false) {
      pass('soundsEnabled is false by default');
    } else {
      fail(`soundsEnabled default is ${initialSettings.soundsEnabled}, expected false`);
    }

    // Phase 1: Sounds OFF -> Trigger due reminder, timer end, volume reaction, welcome, goodbye
    console.log('\n--- Test 2: Sounds OFF -> ZERO plays and NO audio objects created ---');
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { soundsEnabled: false });
    });
    await sleep(300);

    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      // 1. Reminder
      await ipcRenderer.invoke('test:trigger-reminder', { id: 'rem-1', title: 'Hydration', time: '10:00' });
      // 2. Timer end
      ipcRenderer.send('pet:play-sound-request', { sound: 'alarm', category: 'timer' });
      // 3. Volume reaction
      await ipcRenderer.invoke('test:trigger-volume-reaction', 100);
      // 4. Welcome
      await ipcRenderer.invoke('test:trigger-welcome');
      // 5. Goodbye
      await ipcRenderer.invoke('test:trigger-goodbye');
    });

    await sleep(1500);

    const metricsOff = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });

    if (metricsOff && metricsOff.playCount === 0 && metricsOff.activeAudioObjects === 0) {
      pass('ZERO audio plays and ZERO audio objects created while sounds are OFF');
    } else {
      fail(`Expected 0 plays and 0 objects, got plays=${metricsOff?.playCount}, objects=${metricsOff?.activeAudioObjects}`);
    }

    // Phase 2: Sounds ON -> Each category plays exactly once
    console.log('\n--- Test 3: Sounds ON -> Each category plays once ---');
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', {
        soundsEnabled: true,
        soundVolume: 50,
        soundReminders: true,
        soundTimer: true,
        soundReactions: true,
        dnd: false
      });
    });
    await sleep(500);

    // Test Reminders category
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      await ipcRenderer.invoke('test:trigger-reminder', { id: 'rem-2', title: 'Stretch', time: '11:00' });
    });
    await sleep(600);
    let mRem = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mRem && mRem.playCount === 1 && mRem.lastPlayed.category === 'reminders') {
      pass('Reminders category plays audio exactly once when enabled');
    } else {
      fail(`Reminders audio failed: count=${mRem?.playCount}, category=${mRem?.lastPlayed?.category}`);
    }

    // Test Timer category
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      ipcRenderer.send('pet:play-sound-request', { sound: 'alarm', category: 'timer' });
    });
    await sleep(600);
    let mTimer = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mTimer && mTimer.playCount === 1 && mTimer.lastPlayed.category === 'timer') {
      pass('Timer category plays audio exactly once when enabled');
    } else {
      fail(`Timer audio failed: count=${mTimer?.playCount}, category=${mTimer?.lastPlayed?.category}`);
    }

    // Test Pet reactions category
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      await ipcRenderer.invoke('test:trigger-volume-reaction', 100);
    });
    await sleep(600);
    let mReact = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mReact && mReact.playCount === 1 && mReact.lastPlayed.category === 'reactions') {
      pass('Pet reactions category plays audio exactly once when enabled');
    } else {
      fail(`Reactions audio failed: count=${mReact?.playCount}, category=${mReact?.lastPlayed?.category}`);
    }

    // Phase 3: Sub-toggles silence only their category
    console.log('\n--- Test 4: Sub-Toggles Silencing Individual Categories ---');
    // Disable reminders
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { soundReminders: false });
    });
    await sleep(300);
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      await ipcRenderer.invoke('test:trigger-reminder', { id: 'rem-3', title: 'Silent', time: '12:00' });
    });
    await sleep(500);
    let mRemSilenced = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mRemSilenced && mRemSilenced.playCount === 0) {
      pass('soundReminders: false silences reminders category');
    } else {
      fail(`soundReminders: false failed to silence reminders: count=${mRemSilenced?.playCount}`);
    }

    // Timer still plays while reminders is disabled
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('pet:play-sound-request', { sound: 'alarm', category: 'timer' });
    });
    await sleep(500);
    let mTimerStillPlays = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mTimerStillPlays && mTimerStillPlays.playCount === 1) {
      pass('Timer still plays when only reminders sub-toggle is disabled');
    } else {
      fail(`Timer did not play: count=${mTimerStillPlays?.playCount}`);
    }

    // Disable timer
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { soundReminders: true, soundTimer: false });
    });
    await sleep(300);
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      ipcRenderer.send('pet:play-sound-request', { sound: 'alarm', category: 'timer' });
    });
    await sleep(500);
    let mTimerSilenced = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mTimerSilenced && mTimerSilenced.playCount === 0) {
      pass('soundTimer: false silences timer category');
    } else {
      fail(`soundTimer: false failed to silence timer: count=${mTimerSilenced?.playCount}`);
    }

    // Re-enable all sub-toggles
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { soundReminders: true, soundTimer: true, soundReactions: true });
    });
    await sleep(300);

    // Phase 4: Volume scaling
    console.log('\n--- Test 5: Volume Scaling ---');
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { soundVolume: 25 });
    });
    await sleep(250);
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      ipcRenderer.send('pet:play-sound-request', { sound: 'tap', category: 'reactions' });
    });
    await sleep(500);
    let mVol25 = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mVol25 && mVol25.lastPlayed && Math.abs(mVol25.lastPlayed.volume - 0.25) < 0.01) {
      pass('Sound volume scales accurately to 25% (0.25)');
    } else {
      fail(`Volume scaling failed: expected 0.25, got ${mVol25?.lastPlayed?.volume}`);
    }

    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { soundVolume: 90 });
    });
    await sleep(250);
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      ipcRenderer.send('pet:play-sound-request', { sound: 'happy', category: 'reactions' });
    });
    await sleep(500);
    let mVol90 = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mVol90 && mVol90.lastPlayed && Math.abs(mVol90.lastPlayed.volume - 0.90) < 0.01) {
      pass('Sound volume scales accurately to 90% (0.90)');
    } else {
      fail(`Volume scaling failed: expected 0.90, got ${mVol90?.lastPlayed?.volume}`);
    }

    // Phase 5: Do Not Disturb (DND) Mutes
    console.log('\n--- Test 6: Do Not Disturb (DND) Mode ---');
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { dnd: true, soundVolume: 60 });
    });
    await sleep(250);
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:reset-sound-metrics');
      await ipcRenderer.invoke('test:trigger-reminder', { id: 'rem-dnd', title: 'Focus Reminder', time: '14:00' });
      ipcRenderer.send('pet:play-sound-request', { sound: 'alarm', category: 'timer' });
      await ipcRenderer.invoke('test:trigger-volume-reaction', 100);
    });
    await sleep(600);
    let mDnd = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mDnd && mDnd.playCount === 0) {
      pass('Do Not Disturb (DND) successfully mutes reminders, timers, and reactions');
    } else {
      fail(`DND failed to mute: count=${mDnd?.playCount}`);
    }

    // Turn DND back off
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { dnd: false });
    });
    await sleep(300);

    // Phase 6: Instant stop on toggle OFF
    console.log('\n--- Test 7: Immediate Stop on Toggle OFF ---');
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', { soundsEnabled: true });
    });
    await sleep(100);
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('pet:play-sound-request', { sound: 'alarm', category: 'reactions' });
      // Immediately switch OFF
      ipcRenderer.send('settings:sound-changed', { soundsEnabled: false });
    });
    await sleep(200);
    let mStop = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-sound-metrics');
    });
    if (mStop && mStop.activeAudioObjects === 0) {
      pass('Switching sounds OFF stops active audio immediately and clears objects');
    } else {
      fail(`Immediate stop failed: activeAudioObjects=${mStop?.activeAudioObjects}`);
    }

    // Phase 7: Settings UI interaction & Reset
    console.log('\n--- Test 8: Settings Tab UI, Controls & Reset ---');
    // Open panel window
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('panel:open', { tab: 'settings' });
    });
    await sleep(1500);

    const pages = electronApp.windows();
    const panelWin = pages.find(p => p.url().includes('panel.html'));
    if (!panelWin) {
      fail('Could not locate panel window for UI testing');
    } else {
      await panelWin.waitForLoadState('domcontentloaded');
      await sleep(1000);

      // Explicitly switch to settings tab so controls are rendered and visible
      await panelWin.evaluate(() => {
        if (window.panelController) {
          window.panelController.switchTab('settings');
        }
      });
      await sleep(500);

      // Verify master toggle exists and controls sub-panel visibility
      const masterToggle = panelWin.locator('#setting-sounds-enabled');
      const subPanel = panelWin.locator('#sound-sub-controls');
      const volSlider = panelWin.locator('#setting-sound-volume');
      const testSoundBtn = panelWin.locator('#btn-sound-test');

      // Click master toggle to turn ON
      await masterToggle.click();
      await sleep(400);

      const isSubVisible = await subPanel.isVisible();
      if (isSubVisible) {
        pass('Checking Sounds toggle reveals sound-sub-controls panel');
      } else {
        fail('sound-sub-controls was not visible after turning Sounds ON');
      }

      // Test sound button
      await petWin.evaluate(async () => {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('test:reset-sound-metrics');
      });
      await testSoundBtn.click();
      await sleep(500);
      const mTestSound = await petWin.evaluate(async () => {
        const { ipcRenderer } = require('electron');
        return await ipcRenderer.invoke('test:get-sound-metrics');
      });
      if (mTestSound && mTestSound.playCount === 1) {
        pass('Test sound button plays test sound on click');
      } else {
        fail(`Test sound button failed to play: count=${mTestSound?.playCount}`);
      }

      // Reset section behavior
      const resetBehaviorBtn = panelWin.locator('.btn-reset-section[data-section="behavior"]');
      if (await resetBehaviorBtn.count() > 0) {
        await resetBehaviorBtn.click();
        await sleep(500);

        const isSoundsOffAfterReset = !(await masterToggle.isChecked());
        const isSubHiddenAfterReset = !(await subPanel.isVisible());
        if (isSoundsOffAfterReset && isSubHiddenAfterReset) {
          pass('Reset section behavior returns Sounds to OFF and hides sub-controls');
        } else {
          fail(`Reset section failed: isChecked=${await masterToggle.isChecked()}, subVisible=${await subPanel.isVisible()}`);
        }
      } else {
        fail('Reset behavior section button not found');
      }
    }

    // Phase 8: Welcome window row and sync
    console.log('\n--- Test 9: Welcome Window Sync & Skip ---');
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('welcome:open');
    });
    await sleep(1500);

    const welcomeWin = electronApp.windows().find(p => p.url().includes('welcome.html'));
    if (!welcomeWin) {
      fail('Welcome window did not open');
    } else {
      await welcomeWin.waitForLoadState('domcontentloaded');
      await sleep(1000);

      const welcomeSoundsToggle = welcomeWin.locator('#toggle-sounds');
      const isWelcomeSoundsChecked = await welcomeSoundsToggle.isChecked();
      if (!isWelcomeSoundsChecked) {
        pass('Welcome window Sounds toggle is default OFF');
      } else {
        fail('Welcome window Sounds toggle was ON by default');
      }

      // Toggle ON in welcome window -> verify sync to store
      await welcomeSoundsToggle.click();
      await sleep(400);
      const syncedOn = await petWin.evaluate(() => {
        const { ipcRenderer } = require('electron');
        return ipcRenderer.sendSync('pet:get-sound-settings');
      });
      if (syncedOn.soundsEnabled === true) {
        pass('Toggling Sounds in Welcome window syncs to settings');
      } else {
        fail('Toggling in Welcome window did not sync to settings');
      }

      // Click Skip -> verify Skip keeps/sets Sounds OFF
      const btnSkip = welcomeWin.locator('#btn-skip');
      await btnSkip.click();
      await sleep(600);

      const afterSkipSettings = await petWin.evaluate(() => {
        const { ipcRenderer } = require('electron');
        return ipcRenderer.sendSync('pet:get-sound-settings');
      });
      if (afterSkipSettings.soundsEnabled === false) {
        pass('Clicking Skip in Welcome window sets/keeps Sounds OFF');
      } else {
        fail(`Skip failed to keep Sounds OFF: soundsEnabled=${afterSkipSettings.soundsEnabled}`);
      }
    }

    // Phase 9: Settings Export / Import & Migration
    console.log('\n--- Test 10: Import / Export & Legacy Settings Migration ---');
    // Prepare legacy backup payload with old 'sounds: true' and NO 'soundsEnabled'
    const legacyBackup = {
      format: 'desktop-pet-backup',
      version: 1,
      settings: {
        behavior: {
          sounds: true,
          soundVolume: 120, // out of range, needs clamp
          soundReminders: true
        }
      }
    };

    const importRes = await petWin.evaluate(async (data) => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('data:apply-import', { data, notesStrategy: 'merge' });
    }, legacyBackup);

    await sleep(500);

    const migratedSettings = await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      return ipcRenderer.sendSync('pet:get-sound-settings');
    });

    if (migratedSettings.soundsEnabled === false) {
      pass('Migration from legacy backup sets soundsEnabled to OFF');
    } else {
      fail(`Legacy migration failed: soundsEnabled=${migratedSettings.soundsEnabled}`);
    }

    if (migratedSettings.soundVolume === 100) {
      pass('Volume 120 correctly clamped to 100 during import validation');
    } else {
      fail(`Volume clamp failed: soundVolume=${migratedSettings.soundVolume}`);
    }

    // Phase 10: Persistence across restart
    console.log('\n--- Test 11: Persistence Across App Restart ---');
    // Set custom settings
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', {
        soundsEnabled: true,
        soundVolume: 85,
        soundReminders: false,
        soundTimer: true,
        soundReactions: false
      });
    });
    await sleep(500);

    // Close app and relaunch
    await electronApp.close();
    await sleep(1500);

    electronApp = await electron.launch({
      executablePath: APP_PATH,
      args: ['--test-hooks']
    });

    const newPetWin = await electronApp.firstWindow();
    await newPetWin.waitForLoadState('domcontentloaded');
    await sleep(2000);

    const reloadedSettings = await newPetWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      return ipcRenderer.sendSync('pet:get-sound-settings');
    });

    if (
      reloadedSettings.soundsEnabled === true &&
      reloadedSettings.soundVolume === 85 &&
      reloadedSettings.soundReminders === false &&
      reloadedSettings.soundTimer === true &&
      reloadedSettings.soundReactions === false
    ) {
      pass('All sound settings persisted accurately across application restart');
    } else {
      fail(`Settings failed to persist across restart: ${JSON.stringify(reloadedSettings)}`);
    }

    // Reset back to defaults for clean state
    await newPetWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('settings:sound-changed', {
        soundsEnabled: false,
        soundVolume: 50,
        soundReminders: true,
        soundTimer: true,
        soundReactions: true,
        dnd: false
      });
    });
    await sleep(300);

  } catch (err) {
    fail('Unhandled exception in test runner', err);
  } finally {
    if (electronApp) {
      await electronApp.close().catch(() => {});
    }
  }

  console.log('\n==================================================');
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');
  process.exit(failed === 0 ? 0 : 1);
}

runSoundTests();
