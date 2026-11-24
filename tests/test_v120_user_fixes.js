/**
 * Test Suite: v1.2.0 user-reported fixes
 * 1. Dedicated Reminders section and notification routing
 * 2. Immediate panel reactions
 * 3. Bounded random idle activities
 * 4. OS-wide typing helper repair and status reporting
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

console.log('--- Running v1.2.0 user-fix verification ---');

// 1. Reminders section
console.log('\n[1/4] Verifying dedicated Reminders section...');
const panelHtml = read('panel-window/panel.html');
assert(panelHtml.includes('data-tab="reminders"'), 'panel.html must have a Reminders nav item');
assert(panelHtml.includes('id="pane-reminders"'), 'panel.html must have a Reminders pane');
assert(panelHtml.includes('<span>Reminders</span>'), 'Reminders nav label must be visible');

const panelJs = read('panel-window/panel.js');
assert(/'focus', 'reminders', 'todo'/.test(panelJs), 'PANEL_TABS must place Reminders after Focus');
assert(panelJs.includes('reminders: { no:'), 'SECTION_META must describe Reminders');
assert(panelJs.includes("reminders: { state: 'excited'"), 'Reminders needs its own section reaction');

const toolsJs = read('panel-window/lightweight-tools.js');
assert(toolsJs.includes('reminders: document.getElementById(\'tool-pane-reminders\')'), 'tools must bind the Reminders pane');
assert(toolsJs.includes("if (this.panes.reminders)"), 'Reminders form must live in its own pane');
assert(toolsJs.includes("tabId === 'reminders'"), 'Reminders tab activation must render the list');

const schedulerJs = read('main/scheduler.js');
assert(schedulerJs.includes("webContents.send('panel:switch-tab', 'reminders')"), 'reminder notifications must open Reminders');
console.log('✓ Reminders is a visible standalone section with matching notification routing.');

// 2. Reaction speed
console.log('\n[2/4] Verifying immediate panel reactions...');
const bubbleJs = read('main/bubble-window.js');
const hiddenIndex = bubbleJs.indexOf("ipcMain.on('pet:bubble-hidden'");
assert(hiddenIndex !== -1, 'bubble-hidden handler must exist');
assert(bubbleJs.slice(hiddenIndex, hiddenIndex + 400).includes('this.processQueue()'), 'bubble-hidden must advance the queue');

const reactionBlock = panelJs.slice(panelJs.indexOf('const bubbleData = {'), panelJs.indexOf('// Use the main bubble queue'));
assert(reactionBlock.includes('force: true'), 'panel reaction bubbles must force to the front');
const activateIndex = panelJs.indexOf('async activateTab(');
const reactionIndex = panelJs.indexOf('this.reactToPanelAction(', activateIndex);
const loadIndex = panelJs.indexOf('await this.loadLightweightTools();', activateIndex);
assert(reactionIndex !== -1 && loadIndex !== -1 && reactionIndex < loadIndex, 'section reaction must fire before lazy tool loading');

const petControllerJs = read('pet-window/pet-controller.js');
assert(petControllerJs.includes('react(emotion, duration = 0, force = false)'), 'react must accept forced reactions');
assert(petControllerJs.includes('this.coucou.react(newEmotion, durationMs, force)'), 'setEmotion must forward force');
console.log('✓ Panel reactions are emitted early, forced, and no longer wait on a stalled bubble queue.');

// 3. Idle activities
console.log('\n[3/4] Verifying bounded random idle activities...');
for (const method of ['onIdleSignal', 'runIdleActivity', 'idleHop', 'vibe', 'facePlay', 'scheduleIdleActivity']) {
  assert(petControllerJs.includes(`${method}(`), `pet-controller must implement ${method}`);
}
assert(!petControllerJs.includes('randomEmotionInterval'), 'do not reintroduce the removed random emotion interval');
assert(petControllerJs.includes("ipcRenderer.send('pet:idle-hop'"), 'idle hop must use the bounded IPC path');
assert(petControllerJs.includes("ipcRenderer.on('pet:idle-play'"), 'pet window must listen for system idle play');
assert(petControllerJs.includes("ipcRenderer.on('pet:idle-stop'"), 'pet window must stop idle play on activity');

const mainJs = read('main/index.js');
assert(mainJs.includes("ipcMain.on('pet:idle-hop'"), 'main must own clamped idle hops');
const hopBlock = mainJs.slice(mainJs.indexOf("ipcMain.on('pet:idle-hop'"), mainJs.indexOf("ipcMain.on('window:set-launch-login'"));
assert(/clamp\(Math\.round\(Number\(dx\) \|\| 0\), -\d+, \d+\)/.test(hopBlock), 'idle hop X delta must be bounded');
assert(/clamp\(Math\.round\(Number\(dy\) \|\| 0\), -\d+, \d+\)/.test(hopBlock), 'idle hop Y delta must be bounded');
assert(hopBlock.includes('area.x + area.width - w'), 'idle hops must be clamped to the work area');
assert(mainJs.includes("send('pet:idle-play')"), 'main must signal playtime on system idle');
assert(mainJs.includes('playSec = 60') || mainJs.includes('playSec=60'), 'boredom play should start after ~1 minute idle');
console.log('✓ Idle play is random, bounded, and clamped on screen.');

// 4. OS-wide typing
console.log('\n[4/4] Verifying OS-wide typing repair...');
const statusBlock = mainJs.slice(mainJs.indexOf('function getTypingStatus()'), mainJs.indexOf("ipcMain.handle('typing:get-status'"));
for (const field of ['ready:', 'tapFailed:', 'lastPulseAt:', 'error:']) {
  assert(statusBlock.includes(field), `typing status must expose ${field}`);
}
assert(mainJs.includes('function scheduleTypingHelperRetry()'), 'macOS tap failures need bounded retry');
assert(!mainJs.includes('if (typingHelperTapFailed || !getAccessibilityGranted()) return;'), 'tap failure must not disable retries');
assert(mainJs.includes("ipcMain.handle('typing:request-permission'"), 'Settings must request Accessibility from Pixie');

const settingsJs = read('panel-window/tabs/panel-settings-tab.js');
assert(settingsJs.includes('status.error'), 'Settings must surface helper errors');
assert(settingsJs.includes("invoke('typing:request-permission')"), 'Accessibility button must request permission');
assert(settingsJs.includes('status.lastPulseAt'), 'Settings should show recent OS key activity');

const ps1 = read('main/typing-helper.ps1');
assert(ps1.includes('GetMessageW'), 'Windows hook needs a real message pump');
assert(ps1.includes('RunMessageLoop'), 'Windows helper must pump messages');
assert(ps1.includes('BlockingCollection<string>'), 'pulses must be queued outside the hook callback');
assert(!ps1.includes("[Console]::Out.WriteLine('K')"), 'never write to stdout inside the low-level hook callback');
console.log('✓ Typing helpers retry, report status, request permission, and pump Windows messages.');

console.log('\nALL v1.2.0 USER-FIX CHECKS PASSED');
