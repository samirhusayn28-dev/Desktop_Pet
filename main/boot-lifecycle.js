/**
 * Desktop Pet — Boot & Shutdown Lifecycle Module (Item B1)
 * 
 * - Startup greeting: once per real boot (within 30m of boot, or after real shutdown/logout)
 * - Wake from sleep/lock/display-sleep: SILENT (never greets or shows bubbles)
 * - Goodbye: on real shutdown, restart, logout, or tray Quit (duration <= 1s)
 * - Hidden CLI flags: --simulate-boot, --simulate-shutdown
 */

const os = require('os');
const { app, powerMonitor } = require('electron');
const store = require('./secure-store');

class BootLifecycle {
  constructor(relayToPetFn) {
    this.relayToPet = relayToPetFn;
    this.isSimulatedBoot = process.argv.includes('--simulate-boot');
    this.isSimulatedShutdown = process.argv.includes('--simulate-shutdown');
    this.hasGreetedThisSession = false;
    this.isQuitting = false;

    this.setupHooks();
  }

  setupHooks() {
    try {
      if (powerMonitor) {
        // Fires on macOS/Linux shutdown and Windows shutdown
        powerMonitor.on('shutdown', () => {
          console.log('[BootLifecycle] powerMonitor shutdown event');
          this.handleGoodbye('shutdown');
        });
      }
    } catch (e) {
      console.warn('[BootLifecycle] powerMonitor hook error:', e.message);
    }

    if (this.isSimulatedShutdown) {
      setTimeout(() => {
        console.log('[BootLifecycle] Executing simulated shutdown goodbye...');
        this.handleGoodbye('shutdown', () => {
          console.log('[BootLifecycle] Simulated shutdown complete.');
          app.exit(0);
        });
      }, 500);
    }
  }

  attachWindowSessionEnd(win) {
    if (!win) return;
    try {
      // Windows session-end event (fires on user logoff / shutdown)
      win.on('session-end', () => {
        console.log('[BootLifecycle] session-end event (Windows)');
        // Mark store before we lose time
        store.set('system.lastExit', 'shutdown');
        this.handleGoodbye('shutdown');
      });
    } catch (e) {}
  }

  getTimeOfDayGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Good night';
  }

  evaluateStartupWelcome() {
    const isEnabled = store.get('settings.reactions.welcomeStartup') !== false;
    if (!isEnabled) {
      return { greeted: false, reason: 'disabled_in_settings' };
    }

    const bootTime = Date.now() - os.uptime() * 1000;
    const lastGreetedBootTime = store.get('system.lastGreetedBootTime') || 0;
    const lastExit = store.get('system.lastExit') || 'quit';

    const isNewBoot = Math.abs(bootTime - lastGreetedBootTime) > 60000;
    const isFreshBoot = os.uptime() < 30 * 60; // under 30 minutes
    const wasShutdownOrLogout = (lastExit === 'shutdown' || lastExit === 'logout');

    const shouldGreet = this.isSimulatedBoot || ((isNewBoot && isFreshBoot) || wasShutdownOrLogout);

    if (shouldGreet && !this.hasGreetedThisSession) {
      this.hasGreetedThisSession = true;
      store.set('system.lastGreetedBootTime', bootTime);
      store.set('system.lastExit', 'running');

      const timeGreeting = this.getTimeOfDayGreeting();
      const userName = (store.get('settings.general.userName') || '').trim();
      const text = userName ? `${timeGreeting}, ${userName}!` : `${timeGreeting}!`;

      console.log(`[BootLifecycle] Startup welcome greeting triggered: text="${text}", simulated=${this.isSimulatedBoot}`);
      if (this.relayToPet) {
        this.relayToPet('pet:show-bubble', { text, duration: 4000, sound: 'happy', category: 'reactions' });
        this.relayToPet('pet:set-state', { state: 'happy', duration: 4000 });
      }

      return {
        greeted: true,
        text,
        bootTime,
        isNewBoot,
        isFreshBoot,
        wasShutdownOrLogout,
        isSimulatedBoot: this.isSimulatedBoot
      };
    }

    console.log(`[BootLifecycle] Startup greeting skipped: not_eligible (uptime=${os.uptime()}s, lastExit=${lastExit})`);
    return {
      greeted: false,
      reason: 'not_eligible',
      bootTime,
      lastGreetedBootTime,
      uptime: os.uptime(),
      lastExit
    };
  }

  handleGoodbye(exitType = 'shutdown', callback = null) {
    if (this.isQuitting) return;
    this.isQuitting = true;

    // Record exit reason before exiting
    store.set('system.lastExit', exitType);

    const isEnabled = store.get('settings.reactions.goodbyeShutdown') !== false;
    console.log(`[BootLifecycle] Goodbye triggered: exitType=${exitType}, enabled=${isEnabled}`);
    if (!isEnabled) {
      if (typeof callback === 'function') callback();
      else app.exit(0);
      return;
    }

    const userName = (store.get('settings.general.userName') || '').trim();
    const text = userName ? `Bye, ${userName}!` : 'Bye!';

    if (this.relayToPet) {
      this.relayToPet('pet:show-bubble', { text, duration: 1200, sound: 'chirp', category: 'reactions' });
      this.relayToPet('pet:set-state', { state: 'goodbye', duration: 1200 });
    }

    // Delay shutdown by ~600ms (<1s) to show goodbye animation
    setTimeout(() => {
      if (typeof callback === 'function') callback();
      else app.exit(0);
    }, 600);
  }
}

module.exports = BootLifecycle;
