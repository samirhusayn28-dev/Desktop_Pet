/**
 * Desktop Pet — GitHub Release Update Checker (Item U3)
 * 
 * - Repository: samirhusayn28-dev/Desktop_Pet
 * - Checks automatically 60s after boot and every 24 hours
 * - Manual trigger via "Check now" in About tab
 * - Picks platform-specific assets: macOS Intel (.dmg) / Windows (.exe)
 * - Truthful status: offline/failure shows "Couldn't check" (never false "up to date")
 * - Pet speech bubble + panel notification + "Skip this version"
 */

const electron = require('electron');
const store = require('./secure-store');

const GITHUB_REPO = 'samirhusayn28-dev/Desktop_Pet';

class UpdateChecker {
  constructor(relayToPetFn, getPanelWindowFn) {
    this.relayToPet = relayToPetFn;
    this.getPanelWindow = getPanelWindowFn;
    this.initialCheckTimer = null;
    this.periodicCheckTimer = null;
    this.latestResult = null;
    this.setupPowerEvents();
  }

  setupPowerEvents() {
    try {
      if (electron.powerMonitor) {
        electron.powerMonitor.on('resume', () => {
          setTimeout(() => this.check(false), 5000);
        });
      }
    } catch (e) {}
  }

  start() {
    // Automatic check promptly after boot (8 seconds)
    this.initialCheckTimer = setTimeout(() => {
      this.check(false);
    }, 8000);

    // Periodic background auto-check every 4 hours
    this.periodicCheckTimer = setInterval(() => {
      this.check(false);
    }, 4 * 60 * 60 * 1000);
  }

  stop() {
    if (this.initialCheckTimer) {
      clearTimeout(this.initialCheckTimer);
      this.initialCheckTimer = null;
    }
    if (this.periodicCheckTimer) {
      clearInterval(this.periodicCheckTimer);
      this.periodicCheckTimer = null;
    }
  }

  getLatestResult() {
    return this.latestResult;
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
    if (!isManual && store.get('settings.general.autoUpdateCheck') === false) {
      return { status: 'disabled' };
    }

    const currentVersion = this.getCurrentVersion();
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        this.latestResult = result;
        this.notifyPanel(result, isManual);
        resolve(result);
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
            return finish({
              status: 'no_releases',
              message: 'No published releases found for this repository.',
              currentVersion
            });
          }

          if (response.statusCode !== 200) {
            return finish({
              status: 'error',
              error: `GitHub API returned HTTP ${response.statusCode}`,
              currentVersion
            });
          }

          response.on('data', (chunk) => {
            responseData += chunk.toString('utf8');
          });

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
                const res = {
                  status: 'update_available',
                  currentVersion,
                  latestVersion,
                  releaseName: release.name || latestTag,
                  releaseNotes: release.body || '',
                  downloadUrl,
                  releaseUrl: release.html_url,
                  isSkipped
                };

                // Show speech bubble only if not skipped or if user explicitly checked
                if ((!isSkipped || isManual) && this.relayToPet) {
                  this.relayToPet('pet:show-bubble', {
                    badge: 'UPDATE AVAILABLE',
                    text: `Update available! v${latestVersion}`,
                    duration: 8000,
                    sound: 'chirp',
                    category: 'reactions',
                    emotion: 'excited'
                  });
                }

                // Native OS Desktop Notification
                if (!isSkipped || isManual) {
                  try {
                    if (electron.Notification && electron.Notification.isSupported()) {
                      const notif = new electron.Notification({
                        title: 'Pixie Desktop Pet — Update Available',
                        body: `Version v${latestVersion} is available on GitHub! Click to update.`,
                        silent: false
                      });
                      notif.on('click', () => {
                        const panelWindow = this.getPanelWindow ? this.getPanelWindow() : null;
                        if (panelWindow && !panelWindow.isDestroyed()) {
                          panelWindow.show();
                          panelWindow.focus();
                          panelWindow.webContents.send('panel:switch-tab', 'settings');
                        } else if (downloadUrl) {
                          electron.shell.openExternal(downloadUrl);
                        }
                      });
                      notif.show();
                    }
                  } catch (e) {}
                }

                return finish(res);
              } else {
                return finish({
                  status: 'up_to_date',
                  currentVersion,
                  latestVersion
                });
              }
            } catch (parseErr) {
              return finish({
                status: 'error',
                error: 'Could not parse GitHub release information.',
                currentVersion
              });
            }
          });
        });

        request.on('error', (err) => {
          return finish({
            status: 'error',
            error: "Couldn't check for updates. Check your internet connection.",
            offline: true,
            currentVersion
          });
        });

        request.end();
      } catch (err) {
        return finish({
          status: 'error',
          error: "Couldn't check for updates. Check your internet connection.",
          offline: true,
          currentVersion
        });
      }
    });
  }

  notifyPanel(result, isManual) {
    try {
      const panelWindow = this.getPanelWindow ? this.getPanelWindow() : null;
      if (panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.webContents.send('update:status', { result, isManual });
      }
    } catch (e) {}
  }
}

module.exports = UpdateChecker;
