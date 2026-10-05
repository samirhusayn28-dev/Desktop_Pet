/**
 * Verification Test: Pet Glasses Shapes/Colors, Eyes/Mouth Colors, and Bulb Glow Removal
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Verify PetRenderer with all 11 glasses shapes
const petJs = fs.readFileSync(path.join(__dirname, '../character/pet.js'), 'utf8');
const vm = require('vm');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(petJs, context);
const PetRenderer = context.window.PetRenderer;

assert(PetRenderer, 'PetRenderer should be defined');
const renderer = new PetRenderer();

// Test all 11 shapes
const shapes = [
  'round', 'square', 'rectangular', 'hexagon', 'cateye',
  'oval', 'aviator', 'clubmaster', 'semi-rimless', 'heart', 'star'
];

shapes.forEach(shape => {
  renderer.updateConfig({ glassesEnabled: true, glassesShape: shape, glassesColor: '#FF0055' });
  const svg = renderer.render('happy');
  assert(svg.includes(`shape-${shape}`), `SVG should include shape-${shape}`);
  assert(svg.includes('#FF0055'), `SVG should include custom glasses color #FF0055 for ${shape}`);
});

// Test eyes color and mouth color separation
renderer.updateConfig({ eyesColor: '#00AAFF', mouthColor: '#FF2200' });
const svgColors = renderer.render('happy');
assert(svgColors.includes('#00AAFF'), 'SVG should render custom eyesColor');
assert(svgColors.includes('#FF2200'), 'SVG should render custom mouthColor');

// 2. Verify pet.css DOES NOT have electric bulb glow rules (user requested removal)
const petCss = fs.readFileSync(path.join(__dirname, '../pet-window/pet.css'), 'utf8');
assert(!petCss.includes('.pet-bulb-active'), 'pet.css must NOT contain .pet-bulb-active (bulb glow removed)');
assert(!petCss.includes('petBulbPulse'), 'pet.css must NOT contain petBulbPulse (bulb glow removed)');

// 3. Verify pet-controller.js DOES NOT have setBulbActive
const petControllerJs = fs.readFileSync(path.join(__dirname, '../pet-window/pet-controller.js'), 'utf8');
assert(!petControllerJs.includes('setBulbActive'), 'pet-controller must NOT contain setBulbActive (bulb glow removed)');
assert(!petControllerJs.includes('pet:bulb-glow'), 'pet-controller must NOT contain pet:bulb-glow handler');

// 4. Verify panel.html has all shape options
const panelHtml = fs.readFileSync(path.join(__dirname, '../panel-window/panel.html'), 'utf8');
assert(panelHtml.includes('id="setting-pet-glasses-shape"'), 'panel.html must have glasses shape select');
shapes.forEach(shape => {
  assert(panelHtml.includes(`value="${shape}"`), `panel.html select must contain option for ${shape}`);
});
assert(panelHtml.includes('id="setting-pet-glasses-color"'), 'panel.html must have glasses color input');
assert(panelHtml.includes('id="setting-pet-eyescolor"'), 'panel.html must have eyes color input');
assert(panelHtml.includes('id="setting-pet-mouthcolor"'), 'panel.html must have mouth color input');

// 5. Verify settings-tab.js handles the inputs
const settingsTabJs = fs.readFileSync(path.join(__dirname, '../panel-window/tabs/settings-tab.js'), 'utf8');
assert(settingsTabJs.includes('this.glassesShapeSelect'), 'settings-tab.js must reference glassesShapeSelect');
assert(settingsTabJs.includes('this.glassesColorInput'), 'settings-tab.js must reference glassesColorInput');
assert(settingsTabJs.includes('this.eyesColorInput'), 'settings-tab.js must reference eyesColorInput');
assert(settingsTabJs.includes('this.mouthColorInput'), 'settings-tab.js must reference mouthColorInput');

console.log('✅ ALL 11 GLASSES SHAPES AND BULB GLOW REMOVAL CHECKS PASSED PERFECTLY!');
process.exit(0);
