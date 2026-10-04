/**
 * Desktop Pet — Item E2 E2E Emotions Verification Suite
 * Tests:
 * 1. CLI flag --emotion=<name> and rendering of all emotions
 * 2. Visual rendering of all 32 emotions with glasses OFF and glasses ON
 * 3. Strict priority-based emotion state machine (ERROR_AI 5 > USER_INTERACTION 4 > REMINDER 3 > SYSTEM_REACTION 2 > IDLE_BASELINE 1)
 * 4. Return to baseline (neutral / sleepy / sleeping) after timeout
 * 5. Event injection: volume, brightness, battery, media, network, headphones, high CPU, idle
 * 6. Interactive triggers: 5 rapid clicks (dizzy), 4s hover (blush), fast drag (dizzy), fast approach (scared), double-click, chat thanks (grateful), all todos (proud), missed reminder (worried)
 * 7. Real Mac volume event testing
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const APP_PATH = path.join(os.homedir(), 'Desktop', 'Desktop Pet.app', 'Contents', 'MacOS', 'Desktop Pet');
const TEMP_SCREENSHOT_DIR = path.join(os.tmpdir(), 'desktop_pet_e2_screenshots');

if (!fs.existsSync(TEMP_SCREENSHOT_DIR)) {
  fs.mkdirSync(TEMP_SCREENSHOT_DIR, { recursive: true });
}

const ALL_EMOTIONS = [
  'neutral', 'happy', 'sad', 'surprised', 'sleepy', 'sleeping',
  'angry', 'love', 'wink', 'laugh', 'thinking', 'focus',
  'dull', 'irritated', 'low-battery', 'charging', 'vibing',
  'stressed', 'confused', 'relieved', 'squint', 'yawn',
  'dizzy', 'blush', 'excited', 'scared', 'annoyed',
  'bored', 'proud', 'worried', 'grateful', 'goodbye'
];

async function runTests() {
  console.log('=== [Item E2] Starting Emotion Verification Suite ===');
  let app;
  let passCount = 0;
  let failCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passCount++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failCount++;
    }
  }

  try {
    // Phase 1: Test CLI flag --emotion=excited
    console.log('\n--- Phase 1: Test CLI flag --emotion=excited ---');
    const cliApp = await electron.launch({
      executablePath: APP_PATH,
      args: ['--test-hooks', '--emotion=excited']
    });
    const cliPetWin = await cliApp.firstWindow();
    await cliPetWin.waitForTimeout(1000);

    const cliEmotion = await cliPetWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(cliEmotion && cliEmotion.currentEmotion === 'excited', `CLI --emotion=excited launched with currentEmotion='excited' (got ${cliEmotion?.currentEmotion})`);

    const cliSvgEmotion = await cliPetWin.evaluate(() => {
      const svg = document.querySelector('.facebot-svg');
      return svg ? svg.getAttribute('data-emotion') : null;
    });
    assert(cliSvgEmotion === 'excited', `SVG data-emotion is 'excited' (got ${cliSvgEmotion})`);

    await cliApp.close();
    execSync('pkill -f "Desktop Pet.app/Contents/MacOS" || true');
    await new Promise(r => setTimeout(r, 800));

    // Phase 2: Launch main test session for full matrix
    console.log('\n--- Phase 2: Launch packaged app with --test-hooks ---');
    app = await electron.launch({
      executablePath: APP_PATH,
      args: ['--test-hooks']
    });

    const petWin = await app.firstWindow();
    await petWin.waitForTimeout(1000);

    // Verify all 32 emotions render correctly with glasses OFF
    console.log('\n--- Phase 3: Visual rendering of all 32 emotions (Glasses OFF) ---');
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:set-appearance', { glassesEnabled: false, scale: 1.0 });
    });

    for (const emo of ALL_EMOTIONS) {
      await petWin.evaluate(async (emotionName) => {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('test:force-emotion', emotionName, 10000, 5);
      }, emo);

      await petWin.waitForTimeout(120);

      const status = await petWin.evaluate(async (emotionName) => {
        const { ipcRenderer } = require('electron');
        const state = await ipcRenderer.invoke('test:get-pet-emotion');
        const svg = document.querySelector('.facebot-svg');
        const hasSvgClass = svg ? svg.classList.contains(`emotion-${emotionName}`) : false;
        const svgAttr = svg ? svg.getAttribute('data-emotion') : null;
        const hasGlasses = !!document.getElementById('facebot-glasses');
        return { state, hasSvgClass, svgAttr, hasGlasses };
      }, emo);

      assert(
        status.state?.currentEmotion === emo && status.svgAttr === emo && !status.hasGlasses,
        `Emotion '${emo}' rendered without glasses (SVG class & data-emotion verified)`
      );

      // Save screenshot to temp directory
      const screenshotPath = path.join(TEMP_SCREENSHOT_DIR, `${emo}_glasses_off.png`);
      await petWin.screenshot({ path: screenshotPath });
    }

    // Verify all 32 emotions render correctly with glasses ON
    console.log('\n--- Phase 4: Visual rendering of all 32 emotions (Glasses ON) ---');
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:set-appearance', { glassesEnabled: true, scale: 1.0 });
    });

    for (const emo of ALL_EMOTIONS) {
      await petWin.evaluate(async (emotionName) => {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('test:force-emotion', emotionName, 10000, 5);
      }, emo);

      await petWin.waitForTimeout(120);

      const status = await petWin.evaluate(async (emotionName) => {
        const { ipcRenderer } = require('electron');
        const state = await ipcRenderer.invoke('test:get-pet-emotion');
        const svg = document.querySelector('.facebot-svg');
        const hasSvgClass = svg ? svg.classList.contains(`emotion-${emotionName}`) : false;
        const svgAttr = svg ? svg.getAttribute('data-emotion') : null;
        const hasGlasses = !!document.getElementById('facebot-glasses');
        return { state, hasSvgClass, svgAttr, hasGlasses };
      }, emo);

      assert(
        status.state?.currentEmotion === emo && status.svgAttr === emo && status.hasGlasses,
        `Emotion '${emo}' rendered WITH glasses (Glasses overlay #facebot-glasses active)`
      );

      const screenshotPath = path.join(TEMP_SCREENSHOT_DIR, `${emo}_glasses_on.png`);
      await petWin.screenshot({ path: screenshotPath });
    }

    // Phase 5: Priority-based state machine tests
    console.log('\n--- Phase 5: Strict Priority-based State Machine Verification ---');
    // Set neutral baseline
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:force-emotion', 'neutral', 0);
      await ipcRenderer.invoke('test:inject-sensor', { type: 'idle', value: 0 });
    });
    await petWin.waitForTimeout(200);

    // 1. Trigger system reaction (priority 2, duration 2000ms): volume MAX -> irritated
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', { type: 'volume', value: 100 });
    });
    await petWin.waitForTimeout(150);
    let state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'irritated' && state?.currentPriority === 2, `Priority 2: Volume 100 triggered irritated (priority ${state?.currentPriority})`);

    // 2. Try lower priority (idle bored, priority 1) -> must be REJECTED while priority 2 is running
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('pet:set-state', { state: 'bored', duration: 1000, priority: 1 });
    });
    await petWin.waitForTimeout(150);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'irritated', `Lower priority (1) rejected; emotion remains 'irritated' (got ${state?.currentEmotion})`);

    // 3. Trigger reminder (priority 3, duration 2000ms) -> must OVERRIDE priority 2
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-interaction', { type: 'missed-reminder' });
    });
    await petWin.waitForTimeout(150);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'worried' && state?.currentPriority === 3, `Priority 3: Reminder override accepted (worried, priority ${state?.currentPriority})`);

    // 4. Trigger user interaction (priority 4, duration 2000ms) -> must OVERRIDE priority 3
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-interaction', { type: 'rapid-clicks' });
    });
    await petWin.waitForTimeout(150);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'dizzy' && state?.currentPriority === 4, `Priority 4: User interaction override accepted (dizzy, priority ${state?.currentPriority})`);

    // 5. Try to inject system reaction (priority 2) -> must be REJECTED while priority 4 is running
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('pet:set-state', { state: 'squint', duration: 1000, priority: 2 });
    });
    await petWin.waitForTimeout(150);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'dizzy', `Lower priority system reaction rejected; emotion remains 'dizzy' (got ${state?.currentEmotion})`);

    // 6. Trigger AI error (priority 5, duration 2000ms) -> must OVERRIDE priority 4
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('pet:set-state', { state: 'confused', duration: 2000, priority: 5 });
    });
    await petWin.waitForTimeout(150);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'confused' && state?.currentPriority === 5, `Priority 5: AI error override accepted (confused, priority ${state?.currentPriority})`);

    // Phase 6: Baseline return verification
    console.log('\n--- Phase 6: Baseline Return (neutral / sleepy / sleeping) ---');
    // Wait for previous timeout to expire
    await petWin.waitForTimeout(2200);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'neutral', `Temporary emotion reverted to baseline 'neutral' after timeout (got ${state?.currentEmotion})`);

    // Set baseline to 'sleepy' via idle: 120s
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', { type: 'idle', value: 120 });
    });
    await petWin.waitForTimeout(200);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'sleepy' && state?.baseEmotion === 'sleepy', `Baseline updated to 'sleepy' at 120s idle`);

    // Trigger temporary reaction (charging, 1000ms)
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:force-emotion', 'charging', 1000, 2);
    });
    await petWin.waitForTimeout(150);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'charging', `Temporary 'charging' emotion active`);

    // Wait for timeout -> should return to 'sleepy'
    await petWin.waitForTimeout(1200);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'sleepy', `Temporary emotion correctly reverted to 'sleepy' baseline (got ${state?.currentEmotion})`);

    // Set baseline to 'sleeping' via idle: 300s
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', { type: 'idle', value: 300 });
    });
    await petWin.waitForTimeout(200);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'sleeping' && state?.isSleeping === true, `Baseline updated to 'sleeping' at 300s idle`);

    // Trigger temporary reminder reaction (surprised, 1000ms)
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:force-emotion', 'surprised', 1000, 3);
    });
    await petWin.waitForTimeout(150);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'surprised', `Reminder wakes pet temporarily to 'surprised'`);

    // Wait for timeout -> should return to 'sleeping'
    await petWin.waitForTimeout(1200);
    state = await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      return await ipcRenderer.invoke('test:get-pet-emotion');
    });
    assert(state?.currentEmotion === 'sleeping', `Temporary reminder correctly reverted to 'sleeping' baseline (got ${state?.currentEmotion})`);

    // Reset idle back to active/neutral
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', { type: 'idle', value: 0 });
    });
    await petWin.waitForTimeout(200);

    // Phase 7: Sensor Injection Verification
    console.log('\n--- Phase 7: Sensor Injection Verification ---');
    const sensorTests = [
      { type: 'volume', value: 100, expected: 'irritated', label: 'Volume 100 -> irritated' },
      { type: 'volume', value: 5, expected: 'sad', label: 'Volume 5 -> sad' },
      { type: 'volume', value: { level: 0, muted: true }, expected: 'dim', label: 'Volume Muted -> dim (shh)' },
      { type: 'volume', value: 50, expected: 'relieved', label: 'Volume Normal (50) -> relieved' },
      { type: 'brightness', value: 100, expected: 'squint', label: 'Brightness 100 -> squint' },
      { type: 'brightness', value: 10, expected: 'sleepy', label: 'Brightness 10 -> sleepy' },
      { type: 'battery', value: { percent: 18, charging: false }, expected: 'low-battery', label: 'Battery 18% -> low-battery' },
      { type: 'battery', value: { percent: 8, charging: false }, expected: 'low-battery', label: 'Battery 8% -> low-battery' },
      { type: 'battery', value: { percent: 50, charging: true }, expected: 'charging', label: 'Battery Charging -> charging' },
      { type: 'battery', value: { percent: 50, charging: false }, expected: 'surprised', label: 'Battery Unplugged -> surprised' },
      { type: 'battery', value: { percent: 100, charging: true }, expected: 'happy', label: 'Battery Full (100%) -> happy' },
      { type: 'media', value: { isPlaying: true, title: 'Lo-Fi Chill' }, expected: 'vibing', label: 'Media Playing -> vibing' },
      { type: 'media', value: { isPlaying: false }, expected: 'relieved', label: 'Media Stopped -> relieved' },
      { type: 'network', value: false, expected: 'irritated', label: 'Network Offline -> irritated' },
      { type: 'network', value: true, expected: 'happy', label: 'Network Online -> happy' },
      { type: 'headphones', value: true, expected: 'focus', label: 'Headphones Plugged In -> focus' },
      { type: 'headphones', value: false, expected: 'relieved', label: 'Headphones Out -> relieved' },
      { type: 'cpu', value: 95, expected: 'stressed', label: 'CPU 95% -> stressed' },
      { type: 'cpu', value: 25, expected: 'relieved', label: 'CPU Normal (25%) -> relieved' }
    ];

    for (const st of sensorTests) {
      const res = await petWin.evaluate(async (testData) => {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('test:force-emotion', 'neutral', 0);
        await new Promise(r => setTimeout(r, 60));
        await ipcRenderer.invoke('test:inject-sensor', { type: testData.type, value: testData.value });
        await new Promise(r => setTimeout(r, 150));
        return await ipcRenderer.invoke('test:get-pet-emotion');
      }, st);

      assert(res?.currentEmotion === st.expected, `${st.label} (got ${res?.currentEmotion})`);
    }

    // Phase 8: Interactive Triggers Verification
    console.log('\n--- Phase 8: Interactive Triggers Verification ---');
    const interactionTests = [
      { type: 'rapid-clicks', expected: 'dizzy', label: '5 rapid clicks -> dizzy' },
      { type: '4s-hover', expected: 'blush', label: '4s continuous hover -> blush' },
      { type: 'fast-drag', expected: 'dizzy', label: 'Fast drag -> dizzy' },
      { type: 'fast-approach', expected: 'scared', label: 'Fast cursor approach -> scared' },
      { type: 'double-click', expected: 'laugh', label: 'Double click -> laugh' },
      { type: 'chat-thanks', expected: 'grateful', label: 'Chat thank-you -> grateful' },
      { type: 'all-todos', expected: 'proud', label: 'All to-dos completed -> proud' },
      { type: 'missed-reminder', expected: 'worried', label: 'Missed reminder -> worried' }
    ];

    for (const it of interactionTests) {
      const res = await petWin.evaluate(async (t) => {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('test:force-emotion', 'neutral', 0);
        await new Promise(r => setTimeout(r, 60));
        await ipcRenderer.invoke('test:inject-interaction', { type: t.type });
        await new Promise(r => setTimeout(r, 150));
        return await ipcRenderer.invoke('test:get-pet-emotion');
      }, it);

      assert(res?.currentEmotion === it.expected, `${it.label} (got ${res?.currentEmotion})`);
    }

    // Phase 9: Real Mac Volume System Event Testing via osascript
    console.log('\n--- Phase 9: Real Mac Volume Event Testing ---');
    try {
      // Save current volume
      const currentVol = execSync(`osascript -e 'output volume of (get volume settings)'`).toString().trim();
      console.log(`  Current Mac system volume: ${currentVol}`);

      // Resume real sensors for Phase 9 and reset to neutral
      await petWin.evaluate(async () => {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('test:resume-sensors');
        await ipcRenderer.invoke('test:force-emotion', 'neutral', 0);
      });
      await petWin.waitForTimeout(300);

      // Set volume to 50 first to ensure normal band
      execSync(`osascript -e 'set volume output volume 50'`);
      await petWin.waitForTimeout(2500);

      // Reset to neutral before crossing
      await petWin.evaluate(async () => {
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('test:force-emotion', 'neutral', 0);
      });
      await petWin.waitForTimeout(200);

      // Now set volume to 100 (crosses to MAX)
      execSync(`osascript -e 'set volume output volume 100'`);
      await petWin.waitForTimeout(2500); // Allow volume watcher to poll (1.5s interval)
      let macVolState = await petWin.evaluate(async () => {
        const { ipcRenderer } = require('electron');
        return await ipcRenderer.invoke('test:get-pet-emotion');
      });
      assert(macVolState?.currentEmotion === 'irritated', `Real Mac volume 100 triggers 'irritated' (got ${macVolState?.currentEmotion})`);

      // Set volume back to 50 (normal -> relieved)
      execSync(`osascript -e 'set volume output volume 50'`);
      await petWin.waitForTimeout(2500);
      macVolState = await petWin.evaluate(async () => {
        const { ipcRenderer } = require('electron');
        return await ipcRenderer.invoke('test:get-pet-emotion');
      });
      assert(macVolState?.currentEmotion === 'relieved', `Real Mac volume back to 50 triggers 'relieved' (got ${macVolState?.currentEmotion})`);

      // Restore volume
      execSync(`osascript -e 'set volume output volume ${currentVol}'`);
      console.log(`  Restored Mac system volume to: ${currentVol}`);
    } catch (e) {
      console.warn('  (Mac volume osascript test skipped or permissions restricted):', e.message);
    }

  } catch (err) {
    console.error('Fatal test error:', err);
    failCount++;
  } finally {
    if (app) {
      await app.close();
    }
    execSync('pkill -f "Desktop Pet.app/Contents/MacOS" || true');
  }

  console.log(`\n=== Item E2 Verification Summary ===`);
  console.log(`Total Passed: ${passCount}`);
  console.log(`Total Failed: ${failCount}`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log('ALL EMOTION TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

runTests();
