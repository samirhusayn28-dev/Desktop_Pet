/**
 * Desktop Pet — Desktop & Browser Context Sensor
 * Gathers active application, window title, and browser URL/tab with strict privacy redaction.
 * Uses lightweight JXA on macOS to reliably inspect active tab title and URL.
 */

const { exec } = require('child_process');
const { desktopCapturer } = require('electron') || {};
const store = require('./secure-store');

class ContextSensor {
  constructor() {
    this.cachedContext = null;
    this.lastQueryTime = 0;
  }

  /**
   * Evaluates if active window or URL matches privacy blocklist
   */
  isBlocked(appName, windowTitle, url = '') {
    const blocklist = store.get('settings.privacy.blocklist') || [];
    const textToCheck = `${appName} ${windowTitle} ${url}`.toLowerCase();

    for (const term of blocklist) {
      if (term && textToCheck.includes(term.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Retrieves active window and browser tab info
   */
  async getActiveContext() {
    const isEnabled = store.get('settings.privacy.contextAwareness');
    if (isEnabled === false) {
      return null;
    }

    if (process.platform === 'darwin') {
      return new Promise((resolve) => {
        const jxaScript = `
          function run() {
            var se = Application("System Events");
            var procs = se.applicationProcesses.whose({ backgroundOnly: false })();
            var frontApp = "";
            var winTitle = "";
            var curUrl = "";
            var tabTitle = "";

            // 1. Check frontmost application
            for (var i = 0; i < procs.length; i++) {
              var p = procs[i];
              if (p.frontmost()) {
                frontApp = p.name();
                try {
                  var wins = p.windows();
                  if (wins.length > 0) winTitle = wins[0].name();
                } catch(e) {}
                break;
              }
            }

            // 2. If front app is Desktop Pet or Electron, find the user's active browser or editor
            if (frontApp === "Electron" || frontApp === "Desktop Pet" || frontApp === "DesktopPet" || !frontApp) {
              for (var i = 0; i < procs.length; i++) {
                var n = procs[i].name();
                if (["Brave Browser", "Google Chrome", "Safari", "Arc", "Microsoft Edge", "Visual Studio Code", "Cursor", "Xcode", "Terminal"].indexOf(n) !== -1) {
                  frontApp = n;
                  try {
                    var wins = procs[i].windows();
                    if (wins.length > 0) winTitle = wins[0].name();
                  } catch(e) {}
                  break;
                }
              }
            }

            // 3. Inspect browser tab if applicable
            var browserList = ["Brave Browser", "Google Chrome", "Chromium", "Arc", "Microsoft Edge"];
            if (browserList.indexOf(frontApp) !== -1) {
              try {
                var b = Application(frontApp);
                if (b.windows.length > 0 && b.windows[0].activeTab) {
                  curUrl = b.windows[0].activeTab.url();
                  tabTitle = b.windows[0].activeTab.title();
                }
              } catch(e) {}
            } else if (frontApp === "Safari") {
              try {
                var s = Application("Safari");
                if (s.documents.length > 0) {
                  curUrl = s.documents[0].url();
                  tabTitle = s.documents[0].name();
                }
              } catch(e) {}
            }

            return JSON.stringify({
              appName: frontApp || "Desktop",
              windowTitle: tabTitle || winTitle || "",
              url: curUrl || ""
            });
          }
        `;

        exec(`osascript -l JavaScript -e '${jxaScript.replace(/'/g, "'\\''")}' 2>/dev/null`, (err, stdout) => {
          if (err || !stdout) {
            return resolve({ appName: 'Desktop', windowTitle: '', url: '', isBlocked: false });
          }

          let data = { appName: 'Desktop', windowTitle: '', url: '' };
          try {
            data = JSON.parse(stdout.trim());
          } catch (e) {
            data = { appName: 'Desktop', windowTitle: stdout.trim(), url: '' };
          }

          const blocked = this.isBlocked(data.appName, data.windowTitle, data.url);

          if (blocked) {
            return resolve({
              appName: data.appName,
              windowTitle: '[Private / Redacted for Privacy]',
              url: '',
              isBlocked: true
            });
          }

          resolve({
            appName: data.appName || 'Active Window',
            windowTitle: data.windowTitle || '',
            url: data.url || '',
            isBlocked: false
          });
        });
      });
    }

    return {
      appName: 'Active App',
      windowTitle: '',
      url: '',
      isBlocked: false
    };
  }

  /**
   * Captures screen thumbnail for vision models when requested and allowed
   */
  async captureActiveScreen() {
    const isAllowed = store.get('settings.privacy.allowScreenshots');
    if (!isAllowed || !desktopCapturer) return null;

    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 }
      });

      if (sources && sources.length > 0) {
        return sources[0].thumbnail.toDataURL(); // Base64 PNG
      }
    } catch (e) {
      console.warn('[ContextSensor] Screen capture skipped:', e.message);
    }
    return null;
  }
}

module.exports = new ContextSensor();
