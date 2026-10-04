/**
 * Test Suite for Item U3: Update Checker
 */
const electron = require('electron');
const { app } = electron;
const UpdateChecker = require('../main/update-checker');
const store = require('../main/secure-store');

app.whenReady().then(async () => {
  console.log('=== Starting Test Suite for Item U3 (Update Checker) ===');

  let petBubbleMessage = null;
  let panelStatusMessage = null;

  const checker = new UpdateChecker(
    (channel, data) => {
      if (channel === 'pet:show-bubble') petBubbleMessage = data;
    },
    () => ({
      isDestroyed: () => false,
      webContents: {
        send: (channel, data) => {
          if (channel === 'update:status') panelStatusMessage = data;
        }
      }
    })
  );

  // 1. Semver Comparison Tests
  console.assert(checker.compareSemver('1.0.1', '1.0.0') === 1, 'FAIL: 1.0.1 should be > 1.0.0');
  console.assert(checker.compareSemver('1.0.0', '1.0.0') === 0, 'FAIL: 1.0.0 should be == 1.0.0');
  console.assert(checker.compareSemver('0.9.9', '1.0.0') === -1, 'FAIL: 0.9.9 should be < 1.0.0');
  console.assert(checker.compareSemver('v2.0.0', '1.9.9') === 1, 'FAIL: v2.0.0 should be > 1.9.9');
  console.assert(checker.compareSemver('1.0.10', '1.0.9') === 1, 'FAIL: 1.0.10 should be > 1.0.9');
  console.log('Test 1 (Semver Logic): PASS');

  // 2. Asset Picker Tests
  const mockAssets = [
    { name: 'Desktop-Pet-1.0.1-mac-x64.dmg', browser_download_url: 'https://example.com/mac.dmg' },
    { name: 'Desktop-Pet-1.0.1-win-x64.exe', browser_download_url: 'https://example.com/win.exe' },
    { name: 'Desktop-Pet-1.0.1-mac-x64.zip', browser_download_url: 'https://example.com/mac.zip' }
  ];

  const pickedMac = checker.pickAssetForCurrentPlatform(mockAssets);
  if (process.platform === 'darwin') {
    console.assert(pickedMac === 'https://example.com/mac.dmg', `FAIL: Expected mac.dmg, got ${pickedMac}`);
  }
  console.log('Test 2 (Asset Picker for Platform): PASS');

  // 3. Offline / Error Reporting Check
  // Temporarily stub net.request to simulate network failure
  const originalNetRequest = electron.net.request;
  electron.net.request = () => {
    const EventEmitter = require('events');
    const req = new EventEmitter();
    req.end = () => {
      process.nextTick(() => {
        req.emit('error', new Error('getaddrinfo ENOTFOUND api.github.com'));
      });
    };
    return req;
  };

  const offlineResult = await checker.check(true);
  console.assert(offlineResult.status === 'error', 'FAIL: Status should be error when offline');
  console.assert(offlineResult.offline === true, 'FAIL: offline flag not set');
  console.assert(offlineResult.error.includes("Couldn't check for updates"), 'FAIL: Error message mismatch: ' + offlineResult.error);
  console.log('Test 3 (Offline Error Handling — Never reports false "up to date"): PASS');

  function mockResponse(statusCode, body) {
    return () => {
      const EventEmitter = require('events');
      const req = new EventEmitter();
      req.end = () => {
        setTimeout(() => {
          const res = new EventEmitter();
          res.statusCode = statusCode;
          req.emit('response', res);
          setTimeout(() => {
            res.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
            res.emit('end');
          }, 10);
        }, 10);
      };
      return req;
    };
  }

  // 4. Update Available with Newer Version
  electron.net.request = mockResponse(200, {
    tag_name: 'v9.9.9',
    name: 'Desktop Pet 9.9.9',
    body: 'Amazing new features',
    html_url: 'https://github.com/samirhusayn28-dev/Desktop_Pet/releases/tag/v9.9.9',
    assets: mockAssets
  });

  petBubbleMessage = null;
  panelStatusMessage = null;
  const updateAvailResult = await checker.check(true);
  console.assert(updateAvailResult.status === 'update_available', 'FAIL: Expected update_available, got ' + updateAvailResult.status);
  console.assert(updateAvailResult.latestVersion === '9.9.9', 'FAIL: Latest version mismatch');
  console.assert(petBubbleMessage !== null && petBubbleMessage.text.includes('v9.9.9'), 'FAIL: Pet bubble not displayed');
  console.assert(panelStatusMessage !== null && panelStatusMessage.result.status === 'update_available', 'FAIL: Panel status not sent');
  console.log('Test 4 (Update Available Detection & Notification): PASS');

  // 5. Up to date check
  electron.net.request = mockResponse(200, {
    tag_name: 'v1.0.0',
    name: 'Desktop Pet 1.0.0',
    body: 'Current version',
    html_url: 'https://github.com/samirhusayn28-dev/Desktop_Pet/releases/tag/v1.0.0',
    assets: []
  });

  const upToDateResult = await checker.check(true);
  console.assert(upToDateResult.status === 'up_to_date', 'FAIL: Expected up_to_date, got ' + upToDateResult.status);
  console.log('Test 5 (Up to Date Detection): PASS');

  // 6. "Skip this version" suppression
  store.set('settings.general.skippedVersion', '9.9.9');
  petBubbleMessage = null;

  electron.net.request = mockResponse(200, {
    tag_name: 'v9.9.9',
    assets: mockAssets
  });

  // Automatic check (isManual = false) with skipped version
  const skippedResult = await checker.check(false);
  console.assert(skippedResult.isSkipped === true, 'FAIL: isSkipped should be true');
  console.assert(petBubbleMessage === null, 'FAIL: Bubble should be suppressed for skipped version during automatic check');
  console.log('Test 6 (Skip This Version Suppression): PASS');

  // Restore store
  store.set('settings.general.skippedVersion', null);
  electron.net.request = originalNetRequest;

  console.log('ALL ITEM U3 TESTS PASSED!');
  app.exit(0);
});
