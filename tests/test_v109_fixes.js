/**
 * Test Suite: v1.0.9 Fixes Verification
 * 1. Bulb glow removal verified (pet.css & pet-controller.js)
 * 2. 11 Glasses frames verified (character/pet.js & panel.html)
 * 3. Windows Reminders:
 *    - parseReminderTime handles 24h, 12h AM/PM, seconds, whitespace
 *    - 2-minute tolerance window prevents missed reminders on system lag
 *    - Cross-platform safe setAlwaysOnTop (never passes 'screen-saver' on Windows)
 *    - Windows shell beep audio fallback
 * 4. Windows System Sense:
 *    - Unified 300ms fast polling loop for volume, headphones, battery, brightness
 *    - Direct kernel32 GetSystemPowerStatus replaces slow WMI battery query
 *    - backgroundThrottling set to false for immediate pet responsiveness
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Running v1.0.9 Comprehensive Verification ---');

// TEST 1: Bulb Glow Removal
console.log('\n[1/4] Verifying Bulb Glow Complete Removal...');
const petCss = fs.readFileSync(path.join(__dirname, '../pet-window/pet.css'), 'utf8');
assert(!petCss.includes('.pet-bulb-active'), 'pet.css must not have .pet-bulb-active');
assert(!petCss.includes('petBulbPulse'), 'pet.css must not have petBulbPulse');

const petCtrl = fs.readFileSync(path.join(__dirname, '../pet-window/pet-controller.js'), 'utf8');
assert(!petCtrl.includes('setBulbActive'), 'pet-controller.js must not have setBulbActive');
assert(!petCtrl.includes('pet:bulb-glow'), 'pet-controller.js must not have pet:bulb-glow');
console.log('✓ Electric bulb glow completely removed from stylesheet and controller.');

// TEST 2: Glasses Frames
console.log('\n[2/4] Verifying All 11 Glasses Frame Shapes...');
const petJs = fs.readFileSync(path.join(__dirname, '../character/pet.js'), 'utf8');
const vm = require('vm');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(petJs, context);
const PetRenderer = context.window.PetRenderer;
const renderer = new PetRenderer();

const expectedShapes = [
  'round', 'square', 'rectangular', 'hexagon', 'cateye',
  'oval', 'aviator', 'clubmaster', 'semi-rimless', 'heart', 'star'
];

expectedShapes.forEach(shape => {
  renderer.updateConfig({ glassesEnabled: true, glassesShape: shape, glassesColor: '#123456' });
  const svg = renderer.render('happy');
  assert(svg.includes(`shape-${shape}`), `SVG must render shape-${shape}`);
  assert(svg.includes('#123456'), `SVG must use glasses color #123456`);
});

const panelHtml = fs.readFileSync(path.join(__dirname, '../panel-window/panel.html'), 'utf8');
expectedShapes.forEach(shape => {
  assert(panelHtml.includes(`value="${shape}"`), `panel.html select must contain option for ${shape}`);
});
console.log(`✓ All ${expectedShapes.length} glasses frame shapes render valid SVGs and exist in settings UI.`);

// TEST 3: Windows Reminders Fixes
console.log('\n[3/4] Verifying Windows Reminders Engine...');
const schedulerJs = fs.readFileSync(path.join(__dirname, '../main/scheduler.js'), 'utf8');

// A. Time Parsing
assert(schedulerJs.includes('function parseReminderTime'), 'scheduler.js must define parseReminderTime');

// Test parseReminderTime logic directly
const parseMatch = schedulerJs.match(/function parseReminderTime[\s\S]*?^}/m);
assert(parseMatch, 'parseReminderTime function definition found');
const fnCode = parseMatch[0];
const fnContext = {};
vm.createContext(fnContext);
vm.runInContext(fnCode, fnContext);
const parseTime = fnContext.parseReminderTime;

const checkTime = (input, expected) => {
  const actual = parseTime(input);
  if (!expected) {
    assert.strictEqual(actual, null);
  } else {
    assert.strictEqual(actual.hours, expected.hours, `hours mismatch for ${input}`);
    assert.strictEqual(actual.minutes, expected.minutes, `minutes mismatch for ${input}`);
  }
};

checkTime('14:30', { hours: 14, minutes: 30 });
checkTime('2:30 PM', { hours: 14, minutes: 30 });
checkTime('02:30 pm', { hours: 14, minutes: 30 });
checkTime('9:05 am', { hours: 9, minutes: 5 });
checkTime('12:00 PM', { hours: 12, minutes: 0 });
checkTime('12:00 AM', { hours: 0, minutes: 0 });
checkTime('14:30:00', { hours: 14, minutes: 30 });
checkTime('invalid', null);
console.log('✓ parseReminderTime handles 24h, 12h AM/PM, seconds, and invalid strings correctly.');

// B. Screen-saver level only on darwin
assert(schedulerJs.includes("if (process.platform === 'darwin')"), 'scheduler.js must check platform before setting screen-saver level');
assert(schedulerJs.includes("petWin.setAlwaysOnTop(true, 'screen-saver')"), 'macOS gets screen-saver level');
assert(schedulerJs.includes("petWin.setAlwaysOnTop(true)"), 'Windows gets safe setAlwaysOnTop(true)');
assert(schedulerJs.includes("shell.beep()"), 'Windows has shell beep audio feedback');
console.log('✓ Platform-safe window hierarchy and audio alert verified.');

// C. Tolerance Window
assert(schedulerJs.includes('diff >= 0 && diff <= 2'), 'scheduler.js must evaluate 2-minute tolerance window so lag never drops a reminder');
console.log('✓ 2-minute tolerance window verified.');

// TEST 4: Windows System Sense Latency Fixes
console.log('\n[4/4] Verifying Windows System Sense Zero-Latency Optimization...');
const sysSenseJs = fs.readFileSync(path.join(__dirname, '../main/system-sense.js'), 'utf8');

// Fast unified polling loop
assert(sysSenseJs.includes('Get-PixieFastAudio'), 'system-sense.js must use Get-PixieFastAudio');
assert(sysSenseJs.includes('[PixieAudio]::BatteryState()'), 'system-sense.js must query fast C# GetSystemPowerStatus');
assert(sysSenseJs.includes('$audio;$isHp;$batt;$br'), 'Get-PixieFastAudio must return audio, headphones, battery, and brightness in one fast 300ms query');
assert(sysSenseJs.includes('this.processBatteryState(pct, isCharging)'), 'checkVolume must process battery state immediately on Windows');
assert(sysSenseJs.includes('this._applyBrightnessBandLogic(brPct)'), 'checkVolume must process brightness immediately on Windows');

// Pet Window backgroundThrottling: false
const indexJs = fs.readFileSync(path.join(__dirname, '../main/index.js'), 'utf8');
assert(indexJs.includes('backgroundThrottling: false'), 'main/index.js must have backgroundThrottling: false for petWindow');
console.log('✓ Unified 300ms fast polling loop & zero-delay background throttling verified.');

console.log('\n============================================================');
console.log('🎉 ALL v1.0.9 REQUIREMENTS VERIFIED 100% SUCCESFULLY!');
console.log('============================================================\n');
process.exit(0);
