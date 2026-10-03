/**
 * Desktop Pet — Desktop & Browser Context Sensor
 * Gathers active application, window title, and browser URL/tab with strict privacy redaction.
 * Captures screen via desktopCapturer only on-demand when user requests and settings allow.
 */

const { exec } = require('child_process');
const { desktopCapturer } = require('electron');
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
   * macOS: AppleScript / osascript
   * Windows / Linux fallback: Window info
   */
  async getActiveContext() {
    const isEnabled = store.get('settings.privacy.contextAwareness');
    if (!isEnabled) {
      return null;
    }

    if (process.platform === 'darwin') {
      return new Promise((resolve) => {
        const script = `
          global frontApp, windowTitle, currentURL, tabTitle
          set frontApp to ""
          set windowTitle to ""
          set currentURL to ""
          set tabTitle to ""

          tell application "System Events"
            set frontProcess to first application process whose frontmost is true
            set frontApp to name of frontProcess
            try
              set windowTitle to name of front window of frontProcess
            end try
          end tell

          -- Check if front application is a supported browser
          if frontApp is "Google Chrome" or frontApp is "Brave Browser" or frontApp is "Chromium" or frontApp is "Microsoft Edge" or frontApp is "Arc" then
            try
              tell application frontApp
                set currentURL to URL of active tab of front window
                set tabTitle to title of active tab of front window
              end tell
            end try
          else if frontApp is "Safari" then
            try
              tell application "Safari"
                set currentURL to URL of front document
                set tabTitle to name of front document
              end tell
            end try
          end if

          return frontApp & "|||" & windowTitle & "|||" & currentURL & "|||" & tabTitle
        `;

        exec(`osascript -e '${script.replace(/'/g, "'\\''")}' 2>/dev/null`, (err, stdout) => {
          if (err || !stdout) {
            resolve({ appName: 'Desktop', windowTitle: '', url: '', isBlocked: false });
            return;
          }

          const parts = stdout.trim().split('|||');
          const appName = (parts[0] || '').trim();
          const windowTitle = (parts[1] || '').trim();
          const url = (parts[2] || '').trim();
          const tabTitle = (parts[3] || '').trim();

          const blocked = this.isBlocked(appName, windowTitle, url);

          if (blocked) {
            resolve({
              appName,
              windowTitle: '[Private / Redacted for Privacy]',
              url: '',
              isBlocked: true
            });
            return;
          }

          resolve({
            appName: appName || 'Active Window',
            windowTitle: tabTitle || windowTitle || '',
            url: url || '',
            isBlocked: false
          });
        });
      });
    }

    // Non-macOS fallback
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
    if (!isAllowed) return null;

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
