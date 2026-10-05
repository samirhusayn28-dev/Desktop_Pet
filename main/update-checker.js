/**
 * Desktop Pet — GitHub Release Update Checker
 *
 * - Repository: samirhusayn28-dev/Desktop_Pet
 * - Auto-check schedule: 15s after boot → 2min → 30min → then every 1hr
 * - Retry on transient network failure (up to 3 attempts, 30s apart)
 * - On panel open with cached update: pet re-shows bubble so user can't miss it
 * - Manual trigger via "Check now" in Settings tab always bypasses skip/cooldown
 * - Platform-specific download asset: macOS (.dmg) / Windows (.exe)
 * - Truthful status: offline/failure shows "Couldn't check" (never false "up to date")
 */

const electron = require('electron');
const store = require('./secure-store');

const GITHUB_REPO = 'samirhusayn28-dev/Desktop_Pet';

// Boot check schedule (ms after start)
const BOOT_SCHEDULE = [15_000, 2 * 60_000, 30 * 60_000];
// Recurring interval after boot schedule is exhausted (ms)
const PERIODIC_INTERVAL = 60 * 60_000; // every 1 hour
// Retry delays on transient failure (ms)
const RETRY_DELAYS = [30_000, 60_000, 120_000];

class UpdateChecker {
  constructor(relayToPetFn, getPanelWindowFn) {
    this.relayToPet = relayToPetFn;
    this.getPanelWindow = getPanelWindowFn;
    this.timers = [];
    this.periodicTimer = null;
    this.latestResult = null;
    this.retryCount = 0;
    this.checking = false;
    this.setupPowerEvents();
  }

  setupPowerEvents() {
    try {
      if (electron.powerMonitor) {
        electron.powerMonitor.on('resume', () => {
          // Check 5s after waking in case the network is re-connecting
          this._scheduleOnce(5000, () => this.check(false));
        });
      }
    } catch (e) {}
  }

  start() {
    this._clearAll();

    // Progressive boot schedule: 15s → 2min → 30min
    BOOT_SCHEDULE.forEach((delay, i) => {
      const t = setTimeout(async () => {
        const result = await this.check(false);
        // If first boot check succeeds with an update, stop the remaining boot checks
        if (result && result.status === 'update_available' && i === 0) {
          // Cancel later boot checks (2min, 30min) — already found update
          this.timers.slice(1).forEach(clearTimeout);
        }
      }, delay);
      this.timers.push(t);
    });

    // Recurring periodic check every 1 hour after all boot checks
    this.periodicTimer = setTimeout(() => {
      this._startPeriodic();
    }, BOOT_SCHEDULE[BOOT_SCHEDULE.length - 1] + 1000);
    this.timers.push(this.periodicTimer);

    console.log('[UpdateChecker] Auto-update checker started (15s / 2min / 30min / 1hr schedule)');
  }

  _startPeriodic() {
    if (this._periodicInterval) clearInterval(this._periodicInterval);
    this._periodicInterval = setInterval(() => {
      this.check(false);
    }, PERIODIC_INTERVAL);
  }

  _scheduleOnce(delayMs, fn) {
    const t = setTimeout(fn, delayMs);
    this.timers.push(t);
    return t;
  }

  _clearAll() {
    this.timers.forEach(t => { try { clearTimeout(t); } catch (e) {} });
    this.timers = [];
    if (this._periodicInterval) {
      clearInterval(this._periodicInterval);
      this._periodicInterval = null;
    }
  }

  stop() {
    this._clearAll();
  }

  getLatestResult() {
    return this.latestResult;
  }

  /**
   * Called by index.js when the panel window opens with a cached update available.
   * Re-shows the pet bubble so the user cannot miss there is an update waiting.
   */
  notifyPetOfCachedUpdate() {
    if (!this.latestResult || this.latestResult.status !== 'update_available') return;
    const { latestVersion } = this.latestResult;
    const skippedVersion = store.get('settings.general.skippedVersion');
    if (skippedVersion === latestVersion) return;

    if (this.relayToPet) {
      this.relayToPet('pet:show-bubble', {
        badge: 'UPDATE AVAILABLE',
        text: `New version v${latestVersion} is ready! Open Settings to download.`,
        duration: 10000,
        sound: 'chirp',
        category: 'reactions',
        emotion: 'excited'
      });
    }
  }

  compareSemver(v1, v2) {
    const parse = (v) => (v || '').toString().replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const p1 = parse(v1);
    const p2 = parse(v2);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const n1 = p1[i] || 0;
      const n2 = p2[i] || 0;
      if (n1 > n2) return 1;
      if (n1 < n2) return -1;
    }
    return 0;
  }

  pickAssetForCurrentPlatform(assets) {
    if (!Array.isArray(assets) || assets.length === 0) return null;
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';

    if (isMac) {
      const macAsset = assets.find(a => a.name && (a.name.endsWith('-mac-x64.dmg') || a.name.endsWith('.dmg')));
      return macAsset ? macAsset.browser_download_url : null;
    } else if (isWin) {
      const winAsset = assets.find(a => a.name && (a.name.endsWith('-win-x64.exe') || a.name.endsWith('.exe')));
      return winAsset ? winAsset.browser_download_url : null;
    }
    return null;
  }

  getCurrentVersion() {
    try {
      if (electron.app && electron.app.isPackaged) {
        return electron.app.getVersion();
      }
      const pkgPath = require('path').join(__dirname, '..', 'package.json');
      if (require('fs').existsSync(pkgPath)) {
        const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf8'));
        if (pkg.version) return pkg.version;
      }
      return electron.app ? electron.app.getVersion() : '1.0.0';
    } catch (e) {
      return '1.0.0';
    }
  }

  async check(isManual = false) {
    // Respect user opt-out only for automatic checks
    if (!isManual && store.get('settings.general.autoUpdateCheck') === false) {
      return { status: 'disabled' };
    }

    // Prevent concurrent checks
    if (this.checking && !isManual) return this.latestResult;
    this.checking = true;

    const currentVersion = this.getCurrentVersion();
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

    const result = await new Promise((resolve) => {
      let settled = false;
      const finish = (res) => {
        if (settled) return;
        settled = true;
        resolve(res);
      };

      try {
        const request = electron.net.request({
          url,
          method: 'GET',
          headers: {
            'User-Agent': `Desktop-Pet/${currentVersion}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        let responseData = '';

        request.on('response', (response) => {
          if (response.statusCode === 404) {
            return finish({ status: 'no_releases', currentVersion });
          }
          if (response.statusCode === 403 || response.statusCode === 429) {
            // Rate limited — treat as transient error so retry fires
            return finish({ status: 'error', error: 'GitHub API rate limited.', transient: true, currentVersion });
          }
          if (response.statusCode !== 200) {
            return finish({ status: 'error', error: `GitHub API returned HTTP ${response.statusCode}`, currentVersion });
          }

          response.on('data', (chunk) => { responseData += chunk.toString('utf8'); });

          response.on('end', () => {
            try {
              const release = JSON.parse(responseData);
              const latestTag = release.tag_name || '';
              const latestVersion = latestTag.replace(/^v/, '');
              const isNewer = this.compareSemver(latestVersion, currentVersion) > 0;
              const skippedVersion = store.get('settings.general.skippedVersion');
              const isSkipped = (skippedVersion === latestVersion);

              if (isNewer) {
                const downloadUrl = this.pickAssetForCurrentPlatform(release.assets) || release.html_url;
                return finish({
                  status: 'update_available',
                  currentVersion,
                  latestVersion,
                  releaseName: release.name || latestTag,
                  releaseNotes: release.body || '',
                  downloadUrl,
                  releaseUrl: release.html_url,
                  isSkipped
                });
              } else {
                return finish({ status: 'up_to_date', currentVersion, latestVersion });
              }
            } catch (parseErr) {
              return finish({ status: 'error', error: 'Could not parse GitHub release information.', currentVersion });
            }
          });
        });

        request.on('error', () => {
          finish({ status: 'error', error: "Couldn't check for updates. Check your internet connection.", offline: true, transient: true, currentVersion });
        });

        request.end();
      } catch (err) {
        finish({ status: 'error', error: "Couldn't check for updates.", offline: true, transient: true, currentVersion });
      }
    });

    this.checking = false;
    this.latestResult = result;

    // --- Notify panel ---
    this._notifyPanel(result, isManual);

    // --- Notify pet and OS ---
    if (result.status === 'update_available') {
      const { latestVersion, isSkipped } = result;
      const showNotifications = !isSkipped || isManual;

      if (showNotifications) {
        // Pet speech bubble
        if (this.relayToPet) {
          this.relayToPet('pet:show-bubble', {
            badge: 'UPDATE AVAILABLE',
            text: `New version v${latestVersion} is ready! Open Settings to download.`,
            duration: 10000,
            sound: 'chirp',
            category: 'reactions',
            emotion: 'excited'
          });
        }

        // Native OS desktop notification
        try {
          if (electron.Notification && electron.Notification.isSupported()) {
            const notif = new electron.Notification({
              title: 'Pixie Desktop Pet — Update Available',
              body: `Version v${latestVersion} is available on GitHub. Click to open Settings.`,
              silent: false
            });
            notif.on('click', () => {
              const panelWindow = this.getPanelWindow ? this.getPanelWindow() : null;
              if (panelWindow && !panelWindow.isDestroyed()) {
                panelWindow.show();
                panelWindow.focus();
                panelWindow.webContents.send('panel:switch-tab', 'settings');
              } else if (result.downloadUrl) {
                electron.shell.openExternal(result.downloadUrl);
              }
            });
            notif.show();
          }
        } catch (e) {}

        this.retryCount = 0; // Reset retry counter on success
      }
    } else if (result.status === 'error' && result.transient && !isManual) {
      // Retry on transient network failure
      const delay = RETRY_DELAYS[this.retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      this.retryCount = Math.min(this.retryCount + 1, RETRY_DELAYS.length - 1);
      console.warn(`[UpdateChecker] Transient error — retrying in ${delay / 1000}s`);
      this._scheduleOnce(delay, () => this.check(false));
    } else {
      this.retryCount = 0;
    }

    return result;
  }

  _notifyPanel(result, isManual) {
    try {
      const panelWindow = this.getPanelWindow ? this.getPanelWindow() : null;
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('update:status', { result, isManual });
      }
    } catch (e) {}
  }
}

module.exports = UpdateChecker;
