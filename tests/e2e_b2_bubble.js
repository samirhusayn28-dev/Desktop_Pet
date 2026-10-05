/**
 * Desktop Pet — E2E Test Suite for ITEM B2 (Speech Bubble Text Overflow & Dynamic Sizing)
 *
 * Runs strictly against the packaged app at ~/Desktop/Desktop Pet.app:
 * 1. Long reminder title (150 chars) -> bubble width <= 280px, clamped to 4 lines.
 * 2. 300-char AI error -> line clamp active, clicking bubble opens panel & dismisses bubble.
 * 3. Long word without spaces -> breaks cleanly, width <= 280px.
 * 4. Emoji -> rendered cleanly without overflow.
 * 5. RTL text (Arabic/Urdu) -> rendered cleanly without overflow.
 * 6. Screen edges -> near top flips below, clamped to work area.
 * 7. Max pet size (scale 3.0) with glasses ON.
 * 8. Hit-test pet + bubble -> bubble area is interactive.
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
  console.log('Desktop Pet — Item B2 Speech Bubble Overflow & Sizing E2E');
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
      if (win.url().includes('pet.html')) {
        petWin = win;
        break;
      }
    }
    if (!petWin) petWin = windows[0];
    assert(petWin, 'Pet window must be found');

    // Helper: show bubble via IPC and measure in pet window
    async function triggerBubbleAndMeasure(payload) {
      await petWin.evaluate((data) => {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('pet:show-bubble', Object.assign({ force: true }, data));
      }, payload);
      await sleep(500);

      return await petWin.evaluate(() => {
        const b = document.getElementById('pet-speech-bubble');
        const textEl = document.getElementById('bubble-text');
        const badgeEl = document.getElementById('bubble-badge');
        if (!b) return null;
        const rect = b.getBoundingClientRect();
        const textRect = textEl ? textEl.getBoundingClientRect() : null;
        const isClamped = textEl ? (textEl.scrollHeight > textEl.clientHeight + 1) : false;
        const isFlipped = b.classList.contains('flipped-below');

        return {
          display: b.style.display,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          textWidth: textRect ? Math.round(textRect.width) : 0,
          textHeight: textRect ? Math.round(textRect.height) : 0,
          isClamped,
          isFlipped,
          title: b.getAttribute('title') || '',
          badgeText: badgeEl ? badgeEl.textContent : '',
          bubbleText: textEl ? textEl.textContent : ''
        };
      });
    }

    // -------------------------------------------------------------
    // TEST 1: Long Reminder Title (150 chars)
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Long Reminder Title (150 chars) ---');
    const longReminder = 'Don’t forget to review the entire microservices deployment architectural specification and database migration script with the engineering team before release!';
    const m1 = await triggerBubbleAndMeasure({
      badge: 'REMINDER',
      text: longReminder,
      duration: 10000
    });

    console.log(`Measured bubble: width=${m1.width}px, height=${m1.height}px, clamped=${m1.isClamped}`);
    const t1Passed = m1.width <= 280 && m1.width >= 150 && m1.isClamped;
    record('Long Reminder Title (width <= 280px & clamped)', t1Passed, `w=${m1.width}, h=${m1.height}, clamped=${m1.isClamped}`);

    // -------------------------------------------------------------
    // TEST 2: 300-char AI Error & Click Affordance Opens Panel
    // -------------------------------------------------------------
    console.log('\n--- Test 2: 300-char AI Error & Click to View in Panel ---');
    const longAiError = 'Model gemini-2.0-flash-lite experienced an upstream rate limiting error 429: quota exceeded for quota group default in organization engineering-core. Please check your billing dashboard, verify API key credentials in Settings, or configure an alternative AI provider like OpenAI or Ollama.';
    const m2 = await triggerBubbleAndMeasure({
      badge: 'AI ERROR',
      text: longAiError,
      category: 'chat',
      duration: 10000
    });

    console.log(`Measured AI error bubble: width=${m2.width}px, clamped=${m2.isClamped}, title="${m2.title}"`);
    assert(m2.width <= 280, 'Bubble width must not exceed 280px');
    assert(m2.isClamped, '300-char text must be clamped to 4 lines');
    assert(m2.title.includes('panel'), 'Clamped bubble should have affordance title');

    // Click the bubble: should open panel and dismiss bubble
    console.log('Clicking speech bubble to verify click affordance...');
    await petWin.click('#pet-speech-bubble');
    await sleep(1500);

    // Verify bubble is dismissed
    const bubbleDismissed = await petWin.evaluate(() => {
      const b = document.getElementById('pet-speech-bubble');
      return !b || b.style.display === 'none' || b.classList.contains('fade-out');
    });
    console.log(`Bubble dismissed after click: ${bubbleDismissed}`);

    // Verify panel window opened
    const panelWinFound = app.windows().some(w => w.url().includes('panel.html'));
    console.log(`Panel window opened: ${panelWinFound}`);

    const t2Passed = (m2.width <= 280) && m2.isClamped && bubbleDismissed && panelWinFound;
    record('300-char AI Error & Click to Open Panel', t2Passed, `width=${m2.width}, dismissed=${bubbleDismissed}, panelOpened=${panelWinFound}`);

    // Close panel
    for (const w of app.windows()) {
      if (w.url().includes('panel.html')) {
        await w.evaluate(() => {
          const { ipcRenderer } = require('electron');
          ipcRenderer.send('panel:close');
        });
        await sleep(800);
      }
    }

    // -------------------------------------------------------------
    // TEST 3: Long Unbroken Word Without Spaces
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Long Unbroken Word Without Spaces ---');
    const longWord = 'PneumonoultramicroscopicsilicovolcanoconiosisSupercalifragilisticexpialidociousAntidisestablishmentarianism';
    const m3 = await triggerBubbleAndMeasure({
      badge: 'WARNING',
      text: longWord,
      duration: 10000
    });

    console.log(`Measured unbroken word bubble: width=${m3.width}px, textWidth=${m3.textWidth}px`);
    const t3Passed = m3.width <= 280;
    record('Long Word Without Spaces (overflow-wrap <= 280px)', t3Passed, `w=${m3.width}px`);

    // -------------------------------------------------------------
    // TEST 4: Emoji Rendering
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Emoji Text Rendering ---');
    const emojiText = '🚀🔥🎉✨🐱🐶❤️🥳🌟 Coding session on fire! All unit and E2E tests passing with flying colors! 🏆';
    const m4 = await triggerBubbleAndMeasure({
      badge: 'CELEBRATE',
      text: emojiText,
      duration: 10000
    });

    console.log(`Measured emoji bubble: width=${m4.width}px, height=${m4.height}px`);
    const t4Passed = m4.width <= 280 && m4.width >= 100;
    record('Emoji Text Rendering', t4Passed, `w=${m4.width}px, h=${m4.height}px`);

    // -------------------------------------------------------------
    // TEST 5: RTL Text (Arabic / Urdu)
    // -------------------------------------------------------------
    console.log('\n--- Test 5: RTL Text Rendering ---');
    const rtlText = 'مرحبا بك! هذا تذكير مهم جدا للاستراحة وشرب الماء والتركيز على المهمة القادمة.';
    const m5 = await triggerBubbleAndMeasure({
      badge: 'REMINDER',
      text: rtlText,
      duration: 10000
    });

    console.log(`Measured RTL bubble: width=${m5.width}px, height=${m5.height}px`);
    const t5Passed = m5.width <= 280 && m5.width >= 100;
    record('RTL Text Rendering', t5Passed, `w=${m5.width}px, h=${m5.height}px`);

    // -------------------------------------------------------------
    // TEST 6: Screen Edges & Flipping to Side With Room
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Screen Edges & Work Area Flipping ---');
    // Move pet near the top screen edge (y = 20)
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('window:set-pos', { x: 400, y: 20 });
    });
    await sleep(600);

    const m6Top = await triggerBubbleAndMeasure({
      badge: 'SCREEN TOP',
      text: 'Pet is near the top edge of screen, so bubble should flip below!',
      duration: 10000
    });

    console.log(`Top edge bubble: isFlipped=${m6Top.isFlipped}, width=${m6Top.width}px`);
    const t6Passed = m6Top.isFlipped === true;
    record('Screen Top Edge (Flips Below Pet)', t6Passed, `isFlipped=${m6Top.isFlipped}`);

    // Move pet back to safe position
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('window:set-pos', { x: 500, y: 400 });
    });
    await sleep(600);

    // -------------------------------------------------------------
    // TEST 7: Max Pet Size (Scale 3.0) with Glasses ON
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Max Pet Size (Scale 3.0) with Glasses ON ---');
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('pet:update-glasses', true);
      ipcRenderer.send('pet:apply-appearance', { scale: 3.0, glassesEnabled: true });
    });
    await sleep(700);

    const m7 = await triggerBubbleAndMeasure({
      badge: 'BIG PET',
      text: 'Even at 3x scale with stylish glasses, the speech bubble fits comfortably!',
      duration: 10000
    });

    console.log(`Max scale bubble: width=${m7.width}px, height=${m7.height}px`);
    const t7Passed = m7.width <= 280;
    record('Max Scale 3.0 & Glasses ON', t7Passed, `w=${m7.width}px, h=${m7.height}px`);

    // Restore standard scale
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('pet:update-glasses', false);
      ipcRenderer.send('pet:apply-appearance', { scale: 1.0, glassesEnabled: false });
    });
    await sleep(600);

    // -------------------------------------------------------------
    // TEST 8: Hit-Testing Pet + Bubble Area
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Hit-Testing Pet + Bubble Area ---');
    await triggerBubbleAndMeasure({
      badge: 'HIT TEST',
      text: 'Interactive bubble hit-test verification.',
      duration: 10000
    });

    // Check pointer-events on bubble element
    const pointerEvents = await petWin.evaluate(() => {
      const b = document.getElementById('pet-speech-bubble');
      return b ? window.getComputedStyle(b).pointerEvents : '';
    });
    console.log(`Bubble computed pointer-events: "${pointerEvents}"`);

    const t8Passed = pointerEvents === 'auto';
    record('Bubble Hit-Test (pointer-events: auto)', t8Passed, `style=${pointerEvents}`);

    // Dismiss bubble cleanly
    await petWin.evaluate(() => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('pet:hide-bubble');
    });
    await sleep(400);

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
  console.log('FINAL ITEM B2 VERIFICATION SUMMARY:');
  console.log('================================================================');
  let allPass = true;
  for (const r of results) {
    const mark = r.passed ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${r.testName}: ${r.details}`);
    if (!r.passed) allPass = false;
  }
  console.log('================================================================\n');

  if (allPass && results.length >= 8) {
    console.log('🎉 ALL ITEM B2 SPEECH BUBBLE OVERFLOW TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('💥 ITEM B2 VERIFICATION HAD FAILURES!');
    process.exit(1);
  }
})();
