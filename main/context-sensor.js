/**
 * Desktop Pet — Desktop & Browser Context Sensor
 * Gathers active application, window title, and browser URL/tab with strict privacy redaction.
 * macOS uses lightweight JXA; Windows uses a local foreground-window helper.
 * Both paths share the same blocklist and redaction rules.
 */

const { exec, execFile } = require('child_process');
const { app } = require('electron') || {};
const { desktopCapturer } = require('electron') || {};
const path = require('path');
const fs = require('fs');
const store = require('./secure-store');

function getWindowsHelperPath() {
  const relativePath = path.join('main', 'context-helper.ps1');
  if (app && app.isPackaged && process.resourcesPath) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', relativePath);
    if (fs.existsSync(unpacked)) return unpacked;
  }
  return path.join(__dirname, 'context-helper.ps1');
}

class ContextSensor {
  constructor() {
    this.cachedContext = null;
    this.lastQueryTime = 0;
  }

  /**
   * Evaluates if active window or URL matches privacy blocklist.
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

  applyPrivacy(data) {
    const safe = {
      appName: data.appName || 'Active Window',
      windowTitle: data.windowTitle || '',
      url: data.url || '',
      isBlocked: false
    };

    if (this.isBlocked(safe.appName, safe.windowTitle, safe.url)) {
      return {
        appName: safe.appName,
        windowTitle: '[Private / Redacted for Privacy]',
        url: '',
        isBlocked: true
      };
    }
    return safe;
  }

  parseContextOutput(stdout) {
    const text = String(stdout || '').trim().replace(/^\uFEFF/, '');
    if (!text) throw new Error('Empty context response');
    try {
      const data = JSON.parse(text);
      return this.applyPrivacy(data);
    } catch (e) {
      return this.applyPrivacy({ appName: 'Desktop', windowTitle: text, url: '' });
    }
  }

  getWindowsContext() {
    return new Promise((resolve) => {
      const helperPath = getWindowsHelperPath();
      if (!fs.existsSync(helperPath)) {
        resolve({ appName: 'Desktop', windowTitle: '', url: '', isBlocked: false });
        return;
      }

      execFile('powershell.exe', [
        '-NoProfile', '-NoLogo', '-NonInteractive',
        '-ExecutionPolicy', 'Bypass', '-File', helperPath
      ], { timeout: 3000, windowsHide: true, maxBuffer: 256 * 1024 }, (err, stdout) => {
        if (err || !stdout) {
          resolve({ appName: 'Desktop', windowTitle: '', url: '', isBlocked: false });
          return;
        }
        try {
          resolve(this.parseContextOutput(stdout));
        } catch (error) {
          resolve({ appName: 'Desktop', windowTitle: '', url: '', isBlocked: false });
        }
      });
    });
  }

  getMacContext() {
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

          // 2. If front app is Pixie or Electron, find the user's active browser or editor
          if (frontApp === "Electron" || frontApp === "Pixie" || frontApp === "Desktop Pet" || frontApp === "DesktopPet" || !frontApp) {
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
          resolve({ appName: 'Desktop', windowTitle: '', url: '', isBlocked: false });
          return;
        }
        try {
          resolve(this.parseContextOutput(stdout));
        } catch (error) {
          resolve({ appName: 'Desktop', windowTitle: '', url: '', isBlocked: false });
        }
      });
    });
  }

  /**
   * Retrieves active window and browser tab info.
   */
  async getActiveContext() {
    const isEnabled = store.get('settings.privacy.contextAwareness');
    if (isEnabled === false) {
      return null;
    }

    if (process.platform === 'darwin') return await this.getMacContext();
    if (process.platform === 'win32') return await this.getWindowsContext();

    return { appName: 'Active App', windowTitle: '', url: '', isBlocked: false };
  }

  /**
   * Captures screen thumbnail for vision models when requested and allowed.
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
