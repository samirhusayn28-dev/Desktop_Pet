/**
 * Verification Test: Pet Glasses Shapes/Colors, Eyes/Mouth Colors, and Bulb Glow
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Verify PetRenderer
const petJs = fs.readFileSync(path.join(__dirname, '../character/pet.js'), 'utf8');
const vm = require('vm');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(petJs, context);
const PetRenderer = context.window.PetRenderer;

assert(PetRenderer, 'PetRenderer should be defined');
const renderer = new PetRenderer();

// Test shapes
const shapes = ['round', 'square', 'cateye', 'oval', 'aviator'];
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

// 2. Verify pet.css has pet-bulb-active rules
const petCss = fs.readFileSync(path.join(__dirname, '../pet-window/pet.css'), 'utf8');
assert(petCss.includes('.pet-bulb-active'), 'pet.css must contain .pet-bulb-active selector');
assert(petCss.includes('petBulbPulse'), 'pet.css must contain petBulbPulse keyframe animation');

// 3. Verify pet-controller.js has setBulbActive
const petControllerJs = fs.readFileSync(path.join(__dirname, '../pet-window/pet-controller.js'), 'utf8');
assert(petControllerJs.includes('setBulbActive(true)'), 'pet-controller must call setBulbActive(true) on bubble show / menu open');
assert(petControllerJs.includes('setBulbActive(false)'), 'pet-controller must call setBulbActive(false) on bubble hide / menu close');

// 4. Verify panel.html has controls
const panelHtml = fs.readFileSync(path.join(__dirname, '../panel-window/panel.html'), 'utf8');
assert(panelHtml.includes('id="setting-pet-glasses-shape"'), 'panel.html must have glasses shape select');
assert(panelHtml.includes('id="setting-pet-glasses-color"'), 'panel.html must have glasses color input');
assert(panelHtml.includes('id="setting-pet-eyescolor"'), 'panel.html must have eyes color input');
assert(panelHtml.includes('id="setting-pet-mouthcolor"'), 'panel.html must have mouth color input');

// 5. Verify settings-tab.js handles the inputs
const settingsTabJs = fs.readFileSync(path.join(__dirname, '../panel-window/tabs/settings-tab.js'), 'utf8');
assert(settingsTabJs.includes('this.glassesShapeSelect'), 'settings-tab.js must reference glassesShapeSelect');
assert(settingsTabJs.includes('this.glassesColorInput'), 'settings-tab.js must reference glassesColorInput');
assert(settingsTabJs.includes('this.eyesColorInput'), 'settings-tab.js must reference eyesColorInput');
assert(settingsTabJs.includes('this.mouthColorInput'), 'settings-tab.js must reference mouthColorInput');

console.log('✅ ALL CUSTOMIZATION AND BULB GLOW CHECKS PASSED PERFECTLY!');
process.exit(0);
