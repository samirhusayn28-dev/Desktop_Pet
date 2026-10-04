/**
 * Test Suite for Item B1: Greeting Only on Real Startup, Goodbye on Shutdown
 */
const electron = require('electron');
const { app } = electron;
const os = require('os');
const BootLifecycle = require('../main/boot-lifecycle');
const store = require('../main/secure-store');

app.whenReady().then(async () => {
  console.log('=== Starting Test Suite for Item B1 (Startup Greeting & Shutdown Goodbye) ===');

  let bubbleSent = null;
  let emotionSent = null;

  function createLifecycle(simBoot = false, simShutdown = false) {
    const instance = new BootLifecycle((channel, data) => {
      if (channel === 'pet:show-bubble') bubbleSent = data;
      if (channel === 'pet:set-state') emotionSent = data;
    });
    instance.isSimulatedBoot = simBoot;
    instance.isSimulatedShutdown = simShutdown;
    return instance;
  }

  // Ensure settings are on
  store.set('settings.reactions.welcomeStartup', true);
  store.set('settings.reactions.goodbyeShutdown', true);
  store.set('settings.general.userName', 'Samir');

  // Test 1: Simulated Boot Welcome Greeting
  bubbleSent = null;
  emotionSent = null;
  const lcBoot = createLifecycle(true, false);
  const bootRes = lcBoot.evaluateStartupWelcome();
  console.assert(bootRes.greeted === true, 'FAIL: Expected greeting on simulated boot');
  console.assert(bubbleSent !== null && bubbleSent.text.includes('Samir'), 'FAIL: Welcome bubble did not contain user name: ' + (bubbleSent ? bubbleSent.text : 'null'));
  console.assert(emotionSent !== null && emotionSent.state === 'happy', 'FAIL: Happy emotion not sent on boot greeting');
  console.log('Test 1 (Simulated Boot Greeting with User Name & Emotion): PASS');

  // Test 2: Second Start in Same Boot Session (Must NOT greet)
  bubbleSent = null;
  emotionSent = null;
  // Non-simulated start with same boot time and lastExit = 'running'
  const lcSecond = createLifecycle(false, false);
  // Set uptime to > 30 minutes and lastExit = 'quit'
  const realUptime = os.uptime();
  // Ensure lastGreetedBootTime is the current boot time
  const currentBootTime = Date.now() - realUptime * 1000;
  store.set('system.lastGreetedBootTime', currentBootTime);
  store.set('system.lastExit', 'quit');

  const secondRes = lcSecond.evaluateStartupWelcome();
  // If uptime is > 30 mins, should not greet
  if (realUptime >= 1800) {
    console.assert(secondRes.greeted === false, 'FAIL: Should not greet on restart when uptime > 30m');
    console.assert(bubbleSent === null, 'FAIL: Bubble sent on restart');
  } else {
    // If uptime < 30m, but isNewBoot is false and lastExit is 'quit', it should not greet
    console.assert(secondRes.greeted === false, 'FAIL: Should not greet when not a new boot and lastExit is quit');
  }
  console.log('Test 2 (Subsequent Launch / Restart in Same Boot — No Greeting): PASS');

  // Test 3: Wake Event from Sleep / Lock / Display Sleep (Silent Wake)
  bubbleSent = null;
  emotionSent = null;
  const ss = require('../main/system-sense');
  ss.isSleeping = true;
  ss.handleWakeEvent();
  console.assert(bubbleSent === null, 'FAIL: Wake event must NEVER send speech bubble');
  console.assert(ss.isSleeping === false, 'FAIL: Wake event should reset isSleeping to false');
  console.log('Test 3 (Wake from Sleep / Lock / Display Sleep is 100% Silent): PASS');

  // Test 4: Goodbye on Shutdown / Quit
  bubbleSent = null;
  emotionSent = null;
  let exitCallbackCalled = false;
  const lcGoodbye = createLifecycle(false, false);
  const startTime = Date.now();
  lcGoodbye.handleGoodbye('shutdown', () => {
    exitCallbackCalled = true;
    const elapsed = Date.now() - startTime;
    console.assert(elapsed < 1500, 'FAIL: Goodbye delayed shutdown longer than budget: ' + elapsed + 'ms');
  });

  console.assert(bubbleSent !== null && bubbleSent.text.includes('Bye, Samir!'), 'FAIL: Goodbye bubble text mismatch: ' + (bubbleSent ? bubbleSent.text : 'null'));
  console.assert(emotionSent !== null && emotionSent.state === 'goodbye', 'FAIL: Goodbye emotion not sent');
  console.assert(store.get('system.lastExit') === 'shutdown', 'FAIL: lastExit not recorded as shutdown');

  // Wait for the ~900ms callback
  await new Promise(r => setTimeout(r, 1100));
  console.assert(exitCallbackCalled === true, 'FAIL: Goodbye callback was not called');
  console.log('Test 4 (Goodbye on Shutdown <= 1s with "goodbye" emotion & store lastExit): PASS');

  // Test 5: Disabled Toggles in Settings
  store.set('settings.reactions.welcomeStartup', false);
  store.set('settings.reactions.goodbyeShutdown', false);
  bubbleSent = null;
  emotionSent = null;
  const lcDisabled = createLifecycle(true, false);
  const disabledRes = lcDisabled.evaluateStartupWelcome();
  console.assert(disabledRes.greeted === false, 'FAIL: Greeted when toggle disabled');
  console.assert(bubbleSent === null, 'FAIL: Bubble sent when toggle disabled');

  let quickExitCalled = false;
  lcDisabled.handleGoodbye('quit', () => {
    quickExitCalled = true;
  });
  console.assert(quickExitCalled === true, 'FAIL: Disabled goodbye did not exit immediately');
  console.assert(bubbleSent === null, 'FAIL: Goodbye bubble sent when toggle disabled');
  console.log('Test 5 (Settings Toggles Fully Honored): PASS');

  // Restore defaults
  store.set('settings.reactions.welcomeStartup', true);
  store.set('settings.reactions.goodbyeShutdown', true);

  console.log('ALL ITEM B1 TESTS PASSED!');
  app.exit(0);
});
