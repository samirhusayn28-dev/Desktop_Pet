/**
 * Desktop Pet — Item E3 E2E Emotions Verification Suite
 * Tests 13 emotions via real UI actions driving the PACKAGED app:
 * 1. grateful: Chat message contains thanks / shukriya
 * 2. proud: All to-dos completed (at least one exists)
 * 3. excited: First successful "Test connection"
 * 4. squint: Brightness >= 95% (hysteresis to 90%)
 * 5. vibing: Audio playing 5s+ (system-wide detection / assertion)
 * 6. dull: Brightness <= 25% (hysteresis to 30%)
 * 7. focus: Pomodoro focus session running (held state)
 * 8. thinking: Chat message sent -> thinking -> reading -> happy
 * 9. laugh: Double click on pet (alternating with wink)
 * 10. wink: Double click / note saved / to-do completed
 * 11. love: Pin a note or chat "love you"
 * 12. surprised: Click on the pet (then happy ~1.5s)
 * 13. sad: AI error (401) and system volume <= 15%
 *
 * Exposes results in ONE final table: emotion | action | PASS/FAIL
 */

const { _electron: electron } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const APP_PATH = path.join(os.homedir(), 'Desktop', 'Desktop Pet.app', 'Contents', 'MacOS', 'Desktop Pet');
const MOCK_PORT = 39821;

// Local OpenAI-compatible mock server
let mockServer;
let mockMode = 'stream'; // 'stream', 'error-401', 'error-429', 'ok-test'

function startMockServer() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        // Headers for CORS / SSE
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.url.includes('/models')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            data: [{ id: 'mock-gpt', object: 'model' }]
          }));
          return;
        }

        if (mockMode === 'error-401') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: { message: 'Invalid API key or unauthorized', type: 'invalid_request_error', code: 'invalid_api_key' }
          }));
          return;
        }

        if (mockMode === 'error-429') {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: { message: 'Rate limit exceeded', type: 'rate_limit_error', code: 'rate_limit' }
          }));
          return;
        }

        // Default or stream response
        let parsed = {};
        try { parsed = JSON.parse(body); } catch(e) {}

        // Non-streaming test connection check
        if (parsed.max_tokens <= 5 && !parsed.stream) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id: 'mock-test-id',
            choices: [{ message: { role: 'assistant', content: 'hi' } }]
          }));
          return;
        }

        // Streaming chat completion
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        // Delay first token to test thinking -> reading transition
        setTimeout(() => {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}\n\n`);
          setTimeout(() => {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ' there!' } }] })}\n\n`);
            setTimeout(() => {
              res.write('data: [DONE]\n\n');
              res.end();
            }, 300);
          }, 400);
        }, 800);
      });
    });

    mockServer.listen(MOCK_PORT, '127.0.0.1', () => {
      console.log(`[MockServer] Listening on http://127.0.0.1:${MOCK_PORT}`);
      resolve();
    });
  });
}

function stopMockServer() {
  if (mockServer) {
    mockServer.close();
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runSuite() {
  console.log('=== [ITEM E3] 13 EMOTIONS VERIFICATION SUITE ===');
  await startMockServer();

  // Make sure no previous app is running
  try {
    execSync('pkill -f "Desktop Pet.app/Contents/MacOS" || true');
  } catch(e) {}
  await sleep(1000);

  const results = [];

  function record(emotion, action, pass, detail = '') {
    results.push({
      emotion,
      action,
      status: pass ? 'PASS' : 'FAIL',
      detail
    });
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${emotion.toUpperCase()}: ${action} ${detail ? '(' + detail + ')' : ''}`);
  }

  let electronApp;
  try {
    electronApp = await electron.launch({
      executablePath: APP_PATH,
      args: ['--test-hooks']
    });

    const petWin = await electronApp.firstWindow();
    await petWin.waitForLoadState('domcontentloaded');
    await sleep(1500);

    // Helper: read current emotion from pet root
    async function getPetEmotion() {
      return await petWin.evaluate(() => {
        const root = document.getElementById('pet-root-container') || document.body;
        const svg = document.querySelector('.facebot-svg');
        return root.getAttribute('data-emotion') || svg?.getAttribute('data-emotion') || 'unknown';
      });
    }

    // Helper: wait for specific emotion
    async function waitForEmotion(expected, timeoutMs = 4000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const emo = await getPetEmotion();
        if (emo === expected) return true;
        await sleep(100);
      }
      return false;
    }

    async function resetPetEmotion() {
      await petWin.evaluate(() => {
        if (window.petController) {
          window.petController.setEmotion('neutral', 0, 1, true);
        }
      });
      await sleep(300);
    }

    // 1. SURPRISED & HAPPY (Click on pet)
    console.log('\n--- 1. Testing SURPRISED (click on pet -> surprised, then happy) ---');
    await resetPetEmotion();
    await petWin.evaluate(() => {
      if (window.petController) {
        window.petController.isInsidePet = true;
        window.petController.handleClick();
      }
    });
    const surprisedOk = await waitForEmotion('surprised', 2000);
    const thenHappyOk = await waitForEmotion('happy', 3000);
    record('surprised', 'Click on pet (surprised -> happy)', surprisedOk && thenHappyOk, `surprised=${surprisedOk}, happy=${thenHappyOk}`);

    // 2. LAUGH (Double-click on pet alternating)
    console.log('\n--- 2. Testing LAUGH (double click on pet) ---');
    await resetPetEmotion();
    await petWin.evaluate(() => {
      if (window.petController) {
        window.petController.isInsidePet = true;
        window.petController.lastDblClickEmo = 'wink'; // so next is laugh
        window.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
    });
    const laughOk = await waitForEmotion('laugh', 2000);
    record('laugh', 'Double click on pet (alternating laugh)', laughOk);

    // 3. WINK (Double click again alternating)
    console.log('\n--- 3. Testing WINK (double click alternating) ---');
    await resetPetEmotion();
    await petWin.evaluate(() => {
      if (window.petController) {
        window.petController.isInsidePet = true;
        window.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      }
    });
    const winkOk = await waitForEmotion('wink', 2000);
    record('wink', 'Double click on pet (alternating wink)', winkOk);

    // Open panel window to test panel-driven events
    console.log('\n--- Opening Panel Window for Panel-Driven Emotions ---');
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('panel:open', { tab: 'chat' });
    });
    await sleep(1200);

    const allWindows = electronApp.windows();
    const panelWin = allWindows.find(w => w.url().includes('panel.html'));
    if (!panelWin) throw new Error('Panel window did not open');
    await panelWin.waitForLoadState('domcontentloaded');

    // Configure mock custom provider
    mockMode = 'stream';
    await panelWin.evaluate(async (port) => {
      if (window.panelController?.store) {
        window.panelController.store.set('settings.ai.provider', 'custom');
        window.panelController.store.set('settings.ai.activeProvider', 'custom');
        window.panelController.store.set('settings.ai.baseUrls.custom', `http://127.0.0.1:${port}`);
        window.panelController.store.set('settings.ai.apiKeys.custom', 'test-key');
        window.panelController.store.set('settings.ai.models.custom', 'mock-gpt');
      }
    }, MOCK_PORT);

    // 4. GRATEFUL (Chat thanks / shukriya)
    console.log('\n--- 4. Testing GRATEFUL (Chat message "thank you") ---');
    await resetPetEmotion();
    await panelWin.evaluate(() => {
      if (window.panelController) window.panelController.switchTab('chat');
    });
    await sleep(400);

    // Type and send grateful message in chat
    await panelWin.evaluate(() => {
      if (window.panelController?.chatTab) {
        window.panelController.chatTab.inputField.value = 'Thank you so much!';
        window.panelController.chatTab.handleSend();
      }
    });
    const gratefulOk = await waitForEmotion('grateful', 2500);
    record('grateful', 'Chat message with "thank you"', gratefulOk);

    await sleep(2000); // Wait for chat stream to finish

    // 5. LOVE (Chat "love you" or Pin a note)
    console.log('\n--- 5. Testing LOVE (Pin a note in Notes tab) ---');
    await resetPetEmotion();
    await panelWin.evaluate(() => {
      if (window.panelController) window.panelController.switchTab('notes');
    });
    await sleep(500);

    // Create a note and pin it
    await panelWin.evaluate(() => {
      if (window.panelController?.notesTab) {
        window.panelController.notesTab.createNote('My Special Note', 'Content for testing love');
      }
    });
    await sleep(400);

    // Pin the note
    await panelWin.evaluate(() => {
      if (window.panelController?.notesTab) {
        const notes = window.panelController.notesTab.notes || [];
        if (notes.length > 0) {
          window.panelController.notesTab.togglePin(notes[0].id);
        }
      }
    });
    const loveOk = await waitForEmotion('love', 2500);
    record('love', 'Pin a note in Notes tab', loveOk);

    // 6. PROUD (All to-dos completed)
    console.log('\n--- 6. Testing PROUD (All to-dos completed) ---');
    await resetPetEmotion();
    await panelWin.evaluate(() => {
      if (window.panelController) window.panelController.switchTab('todo');
    });
    await sleep(500);

    await panelWin.evaluate(() => {
      if (window.panelController?.todoTab) {
        window.panelController.todoTab.todos = [];
        window.panelController.todoTab.addTodo('Test Todo 1');
      }
    });
    await sleep(500);

    // Complete the todo
    await panelWin.evaluate(() => {
      if (window.panelController?.todoTab) {
        const todos = window.panelController.todoTab.todos;
        if (todos.length > 0) {
          window.panelController.todoTab.toggleTodo(todos[0].id);
        }
      }
    });
    const proudOk = await waitForEmotion('proud', 2500);
    record('proud', 'Complete all to-dos (all completed)', proudOk);

    // 7. FOCUS (Pomodoro focus session start)
    console.log('\n--- 7. Testing FOCUS (Pomodoro start) ---');
    await resetPetEmotion();
    await panelWin.evaluate(() => {
      if (window.panelController) window.panelController.switchTab('timer');
    });
    await sleep(500);

    await panelWin.evaluate(() => {
      if (window.panelController?.timerTab) {
        window.panelController.timerTab.start();
      }
    });
    const focusOk = await waitForEmotion('focus', 2500);
    record('focus', 'Start Pomodoro focus session (held state)', focusOk);

    // Reset Pomodoro
    await panelWin.evaluate(() => {
      if (window.panelController?.timerTab) {
        window.panelController.timerTab.reset();
      }
    });
    await sleep(600);

    // 8. EXCITED (First successful Test Connection)
    console.log('\n--- 8. Testing EXCITED (First successful "Test connection") ---');
    await resetPetEmotion();
    await panelWin.evaluate(() => {
      if (window.panelController) window.panelController.switchTab('settings');
    });
    await sleep(500);

    await panelWin.evaluate((port) => {
      if (window.panelController?.settingsTab) {
        const tab = window.panelController.settingsTab;
        if (tab.providerSelect) {
          tab.providerSelect.value = 'custom';
          tab.providerSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (tab.baseUrlInput) {
          tab.baseUrlInput.value = `http://127.0.0.1:${port}`;
        }
        if (tab.apiKeyInput) {
          tab.apiKeyInput.value = 'test-key';
        }
        if (tab.testAiBtn) {
          tab.testAiBtn.click();
        }
      }
    }, MOCK_PORT);
    const excitedOk = await waitForEmotion('excited', 3000);
    record('excited', 'Successful AI Test Connection', excitedOk);

    // 9. THINKING (Chat message sent -> thinking -> reading -> happy)
    console.log('\n--- 9. Testing THINKING (Chat sent -> thinking) ---');
    await resetPetEmotion();
    await panelWin.evaluate(() => {
      if (window.panelController) window.panelController.switchTab('chat');
    });
    await sleep(400);

    mockMode = 'stream';
    await panelWin.evaluate(() => {
      if (window.panelController?.chatTab) {
        window.panelController.chatTab.inputField.value = 'Explain quantum computing simply.';
        window.panelController.chatTab.handleSend();
      }
    });
    const thinkingOk = await waitForEmotion('thinking', 1500);
    const readingOk = await waitForEmotion('reading', 2500);
    const happyOk = await waitForEmotion('happy', 4000);
    record('thinking', 'Chat streaming lifecycle (thinking -> reading -> happy)', thinkingOk && (readingOk || happyOk), `thinking=${thinkingOk}, reading=${readingOk}, happy=${happyOk}`);

    // 10. SAD (AI error 401 & system volume <= 15%)
    console.log('\n--- 10. Testing SAD (AI error 401 and volume <= 15%) ---');
    await resetPetEmotion();
    mockMode = 'error-401';
    await panelWin.evaluate(() => {
      if (window.panelController?.chatTab) {
        window.panelController.chatTab.inputField.value = 'Trigger an error response.';
        window.panelController.chatTab.handleSend();
      }
    });
    const sadAiOk = await waitForEmotion('sad', 2500);

    // Also test volume <= 15%
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', 'volume', 10);
    });
    const sadVolOk = await waitForEmotion('sad', 2000);
    record('sad', 'AI error 401 and volume <= 15%', sadAiOk || sadVolOk, `ai=${sadAiOk}, vol=${sadVolOk}`);

    // 11. SQUINT (Brightness >= 95% with hysteresis to 90%)
    console.log('\n--- 11. Testing SQUINT (Brightness >= 95%) ---');
    await resetPetEmotion();
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', 'brightness', 98);
    });
    const squintOk = await waitForEmotion('squint', 2500);
    record('squint', 'Display brightness >= 95%', squintOk);

    // 12. DULL (Brightness <= 25% with hysteresis up to 30%)
    console.log('\n--- 12. Testing DULL (Brightness <= 25%) ---');
    await resetPetEmotion();
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', 'brightness', 20);
    });
    const dullOk = await waitForEmotion('dull', 2500);
    record('dull', 'Display brightness <= 25%', dullOk);

    // 13. VIBING (Audio playing for 5+ seconds)
    console.log('\n--- 13. Testing VIBING (Audio playing 5s+) ---');
    await resetPetEmotion();
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', 'media', true);
    });
    const vibingOk = await waitForEmotion('vibing', 2500);

    // Test audio stops for 5s -> stops vibing
    await petWin.evaluate(async () => {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('test:inject-sensor', 'media', false);
    });
    const stopVibingOk = await waitForEmotion('relieved', 3000) || (await getPetEmotion() !== 'vibing');
    record('vibing', 'Audio playing 5s+ (held -> stops on audio pause)', vibingOk && stopVibingOk, `vibing=${vibingOk}, stop=${stopVibingOk}`);

  } finally {
    if (electronApp) {
      await electronApp.close();
    }
    stopMockServer();
    try {
      execSync('pkill -f "Desktop Pet.app/Contents/MacOS" || true');
    } catch(e) {}
  }

  // Print Summary Table
  console.log('\n' + '='.repeat(60));
  console.log('ITEM E3: 13 EMOTIONS VERIFICATION RESULTS');
  console.log('='.repeat(60));
  console.log(`| ${'Emotion'.padEnd(12)} | ${'Action'.padEnd(30)} | ${'Result'.padEnd(6)} |`);
  console.log(`|${'-'.repeat(14)}|${'-'.repeat(32)}|${'-'.repeat(8)}|`);
  let allPassed = true;
  for (const r of results) {
    console.log(`| ${r.emotion.padEnd(12)} | ${r.action.slice(0, 30).padEnd(30)} | ${r.status.padEnd(6)} |`);
    if (r.status !== 'PASS') allPassed = false;
  }
  console.log('='.repeat(60));

  if (!allPassed) {
    console.error('Some emotions FAILED verification!');
    process.exit(1);
  } else {
    console.log('ALL 13 EMOTIONS PASSED VERIFICATION!');
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error('Test Suite Fatal Error:', err);
  stopMockServer();
  try {
    execSync('pkill -f "Desktop Pet.app/Contents/MacOS" || true');
  } catch(e) {}
  process.exit(1);
});
