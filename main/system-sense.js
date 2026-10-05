/**
 * Desktop Pet — SystemSense Module (Main Process)
 * Monitors hardware, system telemetry, and desktop environment (macOS & Windows)
 * to trigger contextual event-driven reactions in the pet.
 * 
 * Sensors:
 * - Volume (max/high/low/mute) via combined osascript
 * - Brightness (dim/normal/max) via ioreg AppleBacklightDisplay
 * - Battery (low <20%, critical <10%, plugged in, unplugged, full) via pmset/si
 * - Music/Media (Spotify/Apple Music) via JXA
 * - Internet connect/disconnect via DNS lookup
 * - Headphones via system_profiler SPAudioDataType
 * - Screen Unlock / Resume ("Welcome back!") via powerMonitor
 * - CPU/RAM very high via si.currentLoad
 * - Late night (midnight - 5 AM)
 */

const { exec, execFile, spawn } = require('child_process');
const dns = require('dns');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { app, powerMonitor } = require('electron');
const store = require('./secure-store');
const bubble = require('./bubble-window');

// ---------------------------------------------------------------------------
// Windows: Persistent PowerShell process for low-overhead audio polling.
// We spawn powershell.exe ONCE, compile C# types once, then query volume/
// device name via stdin/stdout — no per-poll process-spawn overhead.
// ---------------------------------------------------------------------------
const WIN_PS_AUDIO_INIT = `
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
    int r0(); int r1(); int r2(); int r3();
    int SetMasterVolumeLevelScalar(float f, Guid g);
    int r5();
    int GetMasterVolumeLevelScalar(out float f);
    int r7(); int r8(); int r9(); int r10();
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool b, Guid g);
    int GetMute(out bool b);
}

[Guid("C02216F6-0388-4E45-9275-14B0440F4BD1"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation {
    int GetPeakValue(out float pfPeak);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
    int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object target);
    int OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string str);
    int GetState(out int pdwState);
}

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
    int r0();
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ep);
}

[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
class MMDeviceEnumeratorCOM {}

public class PixieAudio {
    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEM_POWER_STATUS {
        public byte ACLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public int BatteryLifeTime;
        public int BatteryFullLifeTime;
    }

    [DllImport("kernel32.dll")]
    public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS sps);

    public static string BatteryState() {
        try {
            SYSTEM_POWER_STATUS sps;
            if (GetSystemPowerStatus(out sps)) {
                int pct = (int)sps.BatteryLifePercent;
                bool chg = (sps.ACLineStatus == 1);
                if (pct <= 100) return pct + "," + (chg ? "true" : "false");
            }
        } catch {}
        return "NA";
    }

    static IMMDevice GetDevice() {
        var e = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCOM());
        IMMDevice dev;
        e.GetDefaultAudioEndpoint(0, 1, out dev);
        return dev;
    }

    public static string AudioState() {
        int vol = 50;
        bool mute = false;
        float peak = 0f;
        string devId = "";
        try {
            var dev = GetDevice();
            if (dev != null) {
                try {
                    object o;
                    var aevGuid = typeof(IAudioEndpointVolume).GUID;
                    dev.Activate(ref aevGuid, 23, IntPtr.Zero, out o);
                    var aev = (IAudioEndpointVolume)o;
                    float v = 0f;
                    aev.GetMasterVolumeLevelScalar(out v);
                    aev.GetMute(out mute);
                    vol = (int)Math.Round(v * 100);
                } catch {}

                try {
                    object o2;
                    var amiGuid = typeof(IAudioMeterInformation).GUID;
                    dev.Activate(ref amiGuid, 23, IntPtr.Zero, out o2);
                    var ami = (IAudioMeterInformation)o2;
                    ami.GetPeakValue(out peak);
                } catch {}

                try {
                    dev.GetId(out devId);
                } catch {}
            }
        } catch {}
        return vol + "," + (mute ? "true" : "false") + "," + ((int)Math.Round(peak * 1000)) + "," + (devId ?? "");
    }
}
'@ -ErrorAction SilentlyContinue 2>$null

$script:lastDevId = ""
$script:lastIsHp = "false"

function Get-PixieFastAudio {
    $audio = [PixieAudio]::AudioState()
    $isHp = "false"
    try {
        $parts = $audio.Split(',')
        $devId = if ($parts.Length -ge 4) { $parts[3] } else { "" }
        if ($devId -and $devId -eq $script:lastDevId) {
            $isHp = $script:lastIsHp
        } elseif ($devId) {
            $script:lastDevId = $devId
            $reg = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\Render\$devId\Properties"
            $p = Get-ItemProperty -Path $reg -ErrorAction SilentlyContinue
            if ($p) {
                $desc = "" + $p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2' + " " + $p.'{b3f8fa53-0004-438e-9002-d4c46f370a0f},6'
                if ($desc -match 'headphone|headset|earphone|airpod|bud|earbud|airpods|beats|bose|sony|jbl|wh-|wf-|sennheiser|plantronics|razer|hyperx|steelseries|wireless stereo|bluetooth audio') {
                    $isHp = "true"
                }
            }
            $script:lastIsHp = $isHp
        }
    } catch {}
    return "$audio;$isHp"
}

function Get-PixieBrightness {
    try {
        $b = (Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue).CurrentBrightness
        if ($b -ne $null) { return "$b" }
    } catch {
        try {
            $b = (Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightness -ErrorAction SilentlyContinue).CurrentBrightness
            if ($b -ne $null) { return "$b" }
        } catch {}
    }
    return "NA"
}

function Get-PixieAll {
    $audio = [PixieAudio]::AudioState()
    $isHp = "false"
    try {
        $parts = $audio.Split(',')
        $devId = if ($parts.Length -ge 4) { $parts[3] } else { "" }
        if ($devId) {
            $reg = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\Render\\$devId\\Properties"
            $p = Get-ItemProperty -Path $reg -ErrorAction SilentlyContinue
            if ($p) {
                $desc = "" + $p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2' + " " + $p.'{b3f8fa53-0004-438e-9002-d4c46f370a0f},6'
                if ($desc -match 'headphone|headset|earphone|airpod|bud|earbud|airpods|beats|bose|sony|jbl|wh-|wf-|sennheiser|plantronics|razer|hyperx|steelseries|wireless stereo|bluetooth audio') {
                    $isHp = "true"
                }
            }
        }
    } catch {}

    $br = Get-PixieBrightness

    $batt = "NA"
    try {
        $b = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue
        if ($b) {
            $chg = ($b.BatteryStatus -eq 2 -or $b.BatteryStatus -eq 4 -or $b.BatteryStatus -eq 6)
            $batt = "$($b.EstimatedChargeRemaining),$chg"
        }
    } catch {
        try {
            $b = Get-WmiObject -Class Win32_Battery -ErrorAction SilentlyContinue
            if ($b) {
                $chg = ($b.BatteryStatus -eq 2 -or $b.BatteryStatus -eq 4 -or $b.BatteryStatus -eq 6)
                $batt = "$($b.EstimatedChargeRemaining),$chg"
            }
        } catch {}
    }

    return "$audio;$isHp;$br;$batt"
}

Write-Output "PIXIE_READY"
`;

let _winPsProc = null;
let _winPsBuffer = '';
let _winPsSeq = 0;
const _winPsPending = new Map();
let _winPsReady = false;
const _onWinPsReadyCallbacks = [];

function onWinPsReady(cb) {
  if (_winPsReady) {
    try { cb(); } catch (e) {}
  } else {
    _onWinPsReadyCallbacks.push(cb);
  }
}

function ensureWinPs() {
  if (_winPsProc && !_winPsProc.killed) return;
  try {
    _winPsProc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    _winPsProc.stdout.on('data', (chunk) => {
      _winPsBuffer += chunk.toString();
      const lines = _winPsBuffer.split('\n');
      _winPsBuffer = lines.pop();
      for (const raw of lines) {
        const line = raw.replace(/\r/g, '').trim();
        if (!line) continue;
        if (line === 'PIXIE_READY') {
          _winPsReady = true;
          while (_onWinPsReadyCallbacks.length) {
            const cb = _onWinPsReadyCallbacks.shift();
            try { cb(); } catch (e) {}
          }
          continue;
        }
        const match = line.match(/^PX_RES:(\d+):(.*)$/);
        if (match) {
          const id = parseInt(match[1], 10);
          const res = match[2];
          const cb = _winPsPending.get(id);
          if (cb) {
            _winPsPending.delete(id);
            cb(res);
          }
        }
      }
    });
    _winPsProc.on('exit', () => { _winPsProc = null; _winPsReady = false; _winPsPending.clear(); });
    _winPsProc.on('error', () => { _winPsProc = null; _winPsReady = false; _winPsPending.clear(); });

    // Write initialiser — compiles C# once
    _winPsProc.stdin.write(WIN_PS_AUDIO_INIT + '\n');
  } catch (e) {
    _winPsProc = null;
  }
}

function winPsQuery(cmd, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!_winPsReady || !_winPsProc || _winPsProc.killed) {
      return resolve(null);
    }
    const qId = ++_winPsSeq;
    const timer = setTimeout(() => {
      _winPsPending.delete(qId);
      resolve(null);
    }, timeoutMs);
    _winPsPending.set(qId, (line) => {
      clearTimeout(timer);
      resolve(line);
    });
    try {
      _winPsProc.stdin.write(`Write-Output "PX_RES:${qId}:$(${cmd})"\n`);
    } catch {
      _winPsPending.delete(qId);
      clearTimeout(timer);
      resolve(null);
    }
  });
}

// Debug volume logging flag (set to true during testing, false in production)
const DEBUG_VOLUME_LOG = false;

class SystemSense {
  constructor() {
    this.pollTimer = null;
    this.petWindowRef = null;
    this.lastReactions = {}; // eventType -> timestamp (for rate limiting)
    this.debounceCooldownMs = 180000; // 3 minutes cooldown per reaction type
    this.isSleeping = false;
    this.isScreenLocked = false;
    this.isSuspended = false;
    this.recentChangeDetected = false;
    this.userName = '';
    this.lastHeadphonesCheck = 0;
    this.volumeTimer = null;
    this.isCheckingVolume = false;
    this.currentVolumeBand = null;
    this.lastVolumeReactionTime = 0;

    // Baseline tracker
    this.state = {
      isOnline: true,
      hasCheckedOnline: false,
      batteryCharging: null,
      batteryPercent: null,
      isMusicPlaying: false,
      currentTrack: '',
      isMuted: null,
      volumeLevel: null,
      brightnessLevel: null,
      brightnessAvailable: true,
      headphonesConnected: null,
      isHighLoad: false,
      isLateNightNudged: false
    };

    this.currentBrightnessBand = null;
    this.audioStartTime = null;
    this.audioStoppedTime = null;

    this.setupPowerEvents();
  }

  setPetWindow(win) {
    this.petWindowRef = win;
  }

  setUserName(name) {
    this.userName = (name || '').trim();
  }

  getUserName() {
    return (this.userName || store.get('settings.general.userName') || '').trim();
  }

  setSleeping(sleeping) {
    this.isSleeping = !!sleeping;
  }

  setupPowerEvents() {
    try {
      if (powerMonitor) {
        powerMonitor.on('lock-screen', () => {
          this.isScreenLocked = true;
        });
        powerMonitor.on('unlock-screen', () => {
          this.isScreenLocked = false;
          this.handleWakeEvent();
        });
        powerMonitor.on('suspend', () => {
          this.isSuspended = true;
        });
        powerMonitor.on('resume', () => {
          this.isSuspended = false;
          this.handleWakeEvent();
        });
        try {
          powerMonitor.on('display-sleep', () => {
            this.isScreenLocked = true;
          });
          powerMonitor.on('display-wake', () => {
            this.isScreenLocked = false;
            this.handleWakeEvent();
          });
        } catch (e) {}

        // Instant charger connect / disconnect reactions on both macOS and Windows
        try {
          powerMonitor.on('on-ac', () => {
            this.processBatteryState(this.state.batteryPercent !== null ? this.state.batteryPercent : 100, true);
          });
          powerMonitor.on('on-battery', () => {
            this.processBatteryState(this.state.batteryPercent !== null ? this.state.batteryPercent : 80, false);
          });
        } catch (e) {}
      }
    } catch (e) {
      console.warn('[SystemSense] PowerMonitor hook error:', e.message);
    }
  }

  handleWakeEvent() {
    // Item B1: Silent wake from sleep/suspend/resume/lock/unlock/display sleep.
    // NEVER show any greeting or bubble. Silently reset idle timers and return to neutral if sleeping.
    if (this.isSleeping) {
      this.isSleeping = false;
      this.sendPetEmotion('neutral', 0);
    }
    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      this.petWindowRef.webContents.send('pet:reset-idle');
    }
  }

  start() {
    this.stop();

    // On Windows: warm up the persistent PowerShell process immediately
    // so volume is available from first poll (PS compilation takes ~1-2s)
    if (process.platform === 'win32') {
      ensureWinPs();
      onWinPsReady(() => {
        this.checkVolume();
      });
    }

    this.startVolumeWatcher();

    // Initial check after 1.5 seconds for other sensors
    this.pollTimer = setTimeout(() => this.runAdaptiveCheck(), 1500);
    console.log('[SystemSense] Active with adaptive energy-efficient scheduler and dedicated volume watcher');
  }

  pauseBackgroundPolling(durationMs = 8000) {
    this.isPaused = true;
    if (this.unpauseTimer) clearTimeout(this.unpauseTimer);
    this.unpauseTimer = setTimeout(() => {
      this.isPaused = false;
      this.unpauseTimer = null;
    }, durationMs);
  }

  resumeBackgroundPolling() {
    this.isPaused = false;
    this.currentVolumeBand = null;
    if (this.unpauseTimer) {
      clearTimeout(this.unpauseTimer);
      this.unpauseTimer = null;
    }
    this.startVolumeWatcher();
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.runAdaptiveCheck();
  }

  async runAdaptiveCheck() {
    if (this.isPaused) {
      this.pollTimer = setTimeout(() => this.runAdaptiveCheck(), 4000);
      return;
    }

    if (this.isScreenLocked || this.isSuspended) {
      // Screen is locked or system is suspended - sleep interval (20s)
      this.pollTimer = setTimeout(() => this.runAdaptiveCheck(), 20000);
      return;
    }

    try {
      await this.checkAllSensors();
    } catch (e) {
      console.warn('[SystemSense] checkAllSensors error:', e);
    }

    // Adaptive interval: 3s if recent change detected, 15s if pet is sleeping, 6s when stable
    let nextDelay = 6000;
    if (this.isSleeping) {
      nextDelay = 15000;
    } else if (this.recentChangeDetected) {
      nextDelay = 3000;
      this.recentChangeDetected = false;
    }

    this.pollTimer = setTimeout(() => this.runAdaptiveCheck(), nextDelay);
  }

  stop() {
    this.stopVolumeWatcher();
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  canReact(eventType, customCooldown = null) {
    const isEnabled = store.get(`settings.reactions.${eventType}`);
    if (isEnabled === false) return false;

    const now = Date.now();
    const last = this.lastReactions[eventType] || 0;
    const cooldown = customCooldown || this.debounceCooldownMs;

    if (now - last < cooldown) return false;

    this.lastReactions[eventType] = now;
    return true;
  }

  sendPetEmotion(state, duration = 3500, priority = 2, force = true, held = false) {
    if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
      this.petWindowRef.webContents.send('pet:set-state', { state, duration, priority, force, held });
    }
  }

  async checkAllSensors() {
    if (this.isSleeping) return; // Completely pause polling when pet is sleeping
    try {
      await Promise.allSettled([
        this.checkBrightness(),
        this.checkBattery(),
        this.checkMedia(),
        this.checkNetwork(),
        this.checkHeadphones(),
        this.checkSystemLoad(),
        this.checkLateNight()
      ]);
    } catch (e) {
      // Sensor errors must never crash the main process
    }
  }

  // --- 1. DEDICATED VOLUME SENSOR & WATCHER ---
  startVolumeWatcher() {
    this.stopVolumeWatcher();

    const scheduleNext = () => {
      let idle = 0;
      try {
        if (powerMonitor) idle = powerMonitor.getSystemIdleTime();
      } catch (e) {}

      // Poll 300ms while active (<30s idle) or in test mode, 800ms otherwise (instant reactions, near zero CPU)
      const isTestMode = process.argv.includes('--test-hooks');
      const delay = (isTestMode || (idle < 30 && !this.isSleeping && !this.isScreenLocked && !this.isSuspended)) ? 300 : 800;

      this.volumeTimer = setTimeout(async () => {
        if (this.isCheckingVolume) return;
        this.isCheckingVolume = true;
        try {
          await this.checkVolume();
        } catch (err) {
          // ignore
        } finally {
          this.isCheckingVolume = false;
          scheduleNext();
        }
      }, delay);
    };

    // First check promptly on startup
    this.volumeTimer = setTimeout(async () => {
      this.isCheckingVolume = true;
      try {
        await this.checkVolume();
      } catch (err) {
      } finally {
        this.isCheckingVolume = false;
        scheduleNext();
      }
    }, 400);
  }

  stopVolumeWatcher() {
    if (this.volumeTimer) {
      clearTimeout(this.volumeTimer);
      this.volumeTimer = null;
    }
  }

  checkVolume() {
    return new Promise((resolve) => {
      if (this.isPaused) return resolve();

      // ── Windows branch ──────────────────────────────────────────────────
      if (process.platform === 'win32') {
        ensureWinPs();
        if (!_winPsReady) return resolve();
        // Ultra-fast C# CoreAudio query (<2ms execution, no slow WMI)
        winPsQuery('Get-PixieFastAudio', 1500).then((result) => {
          if (!result) return resolve();
          // Format: vol,mute,peak,devId;isHp
          const sections = result.split(';');
          const audioParts = (sections[0] || '').split(',');
          const vol = parseInt(audioParts[0], 10);
          const muted = (audioParts[1] || '').trim() === 'true';
          const peak = parseInt(audioParts[2], 10) || 0;
          this.lastAudioPeak = peak;

          if (!isNaN(vol)) {
            this._applyVolumeBandLogic(vol, muted);
          }

          // Real-time headphone detection from Core Audio (<1ms registry friendly name)
          if (sections.length > 1) {
            const isHp = sections[1].trim() === 'true';
            this._applyHeadphoneState(isHp);
          }

          // Real-time audio activity detection (peak > 5 means audio is actively outputting)
          const isAudioActive = peak >= 5;
          this.processAudioPlayingState(isAudioActive).catch(() => {});

          resolve();
        }).catch(() => resolve());
        return;
      }

      // ── macOS branch ─────────────────────────────────────────────────────
      if (process.platform !== 'darwin') return resolve();

      // Combined osascript: fetches volume and mute in a single string
      exec(`osascript -e 'set o to (get volume settings)' -e '(output volume of o as string) & "," & (output muted of o as string)' 2>/dev/null`, (err, stdout) => {
        if (err || !stdout) return resolve();

        const parts = stdout.trim().split(',');
        const vol = parseInt(parts[0], 10);
        const muted = (parts[1] || '').trim() === 'true';

        if (isNaN(vol)) return resolve();

        this.state.volumeLevel = vol;
        this.state.isMuted = muted;
        this._applyVolumeBandLogic(vol, muted);
        resolve();
      });
    });
  }

  // Shared volume-band logic (macOS + Windows)
  _applyVolumeBandLogic(vol, muted) {
    const isMuteOrZero = muted || vol === 0;
    let newBand;

    if (this.currentVolumeBand === null) {
      if (isMuteOrZero) newBand = 'MUTED';
      else if (vol >= 98) newBand = 'MAX';
      else if (vol <= 15) newBand = 'LOW';
      else newBand = 'NORMAL';
      this.currentVolumeBand = newBand;
      this.state.volumeLevel = vol;
      this.state.isMuted = muted;
      return;
    }

    if (isMuteOrZero) {
      newBand = 'MUTED';
    } else if (this.currentVolumeBand === 'MAX') {
      newBand = vol < 92 ? (vol <= 15 ? 'LOW' : 'NORMAL') : 'MAX';
    } else if (this.currentVolumeBand === 'LOW') {
      newBand = vol >= 98 ? 'MAX' : (vol >= 20 ? 'NORMAL' : 'LOW');
    } else if (this.currentVolumeBand === 'MUTED') {
      newBand = vol >= 98 ? 'MAX' : (vol <= 15 ? 'LOW' : 'NORMAL');
    } else {
      newBand = vol >= 98 ? 'MAX' : (vol <= 15 ? 'LOW' : 'NORMAL');
    }

    const isEnabled = store.get('settings.reactions.volume') !== false;
    if (newBand !== this.currentVolumeBand) {
      const prevBand = this.currentVolumeBand;
      this.currentVolumeBand = newBand;
      if (isEnabled && !this.isSleeping) {
        const name = this.getUserName();
        if (newBand === 'MAX') {
          this.sendPetEmotion('irritated', 4000);
          bubble.show({ badge: 'MAX VOLUME', text: name ? `Whoa ${name}, too loud! Protecting my little ears!` : 'Whoa, too loud! Protecting my little ears!', sound: 'tap', emotion: 'irritated', duration: 3000 });
        } else if (newBand === 'MUTED') {
          this.sendPetEmotion('dim', 3500);
          bubble.show({ badge: 'SHH...', text: 'Whisper quiet mode.', sound: 'tap', emotion: 'dim', duration: 3000 });
        } else if (newBand === 'LOW') {
          this.sendPetEmotion('sad', 3500);
          bubble.show({ badge: 'LOW VOLUME', text: 'Can barely hear anything down here...', sound: 'tap', emotion: 'sad', duration: 3000 });
        } else if (newBand === 'NORMAL') {
          this.sendPetEmotion('relieved', 3000);
          bubble.show({ badge: 'VOLUME OK', text: 'Ah, that is much better.', sound: 'happy', emotion: 'relieved', duration: 2500 });
        }
      }
    }
    this.state.volumeLevel = vol;
    this.state.isMuted = muted;
  }

  // --- 2. BRIGHTNESS SENSOR ---
  checkBrightness() {
    return new Promise((resolve) => {
      // ── Windows branch ──────────────────────────────────────────────────
      if (process.platform === 'win32') {
        if (_winPsReady) {
          winPsQuery('Get-PixieBrightness', 1500).then((res) => {
            if (res && res !== 'NA') {
              const pct = parseInt(res.trim(), 10);
              if (!isNaN(pct)) {
                this.state.brightnessAvailable = true;
                this.state.brightnessLevel = pct;
                this._applyBrightnessBandLogic(pct);
                return resolve();
              }
            }
            this.state.brightnessAvailable = false;
            resolve();
          }).catch(() => {
            this.state.brightnessAvailable = false;
            resolve();
          });
          return;
        }
        return resolve();
      }

      // ── Not macOS or Windows — skip ──────────────────────────────────────
      if (process.platform !== 'darwin') {
        this.state.brightnessAvailable = false;
        return resolve();
      }

      // ── macOS branch ─────────────────────────────────────────────────────
      // Read AppleBacklightDisplay on macOS
      exec(`ioreg -c AppleBacklightDisplay | grep -E "brightness" 2>/dev/null`, (err, stdout) => {
        if (err || !stdout || !stdout.includes('brightness')) {
          this.state.brightnessAvailable = false;
          return resolve();
        }

        this.state.brightnessAvailable = true;
        // Parse: "brightness"={"max"=1024,"min"=0,"value"=703}
        const match = stdout.match(/"brightness"=\{"max"=(\d+),"min"=(\d+),"value"=(\d+)\}/);
        if (!match) return resolve();

        const max = parseInt(match[1], 10) || 1024;
        const val = parseInt(match[3], 10) || 0;
        const pct = Math.round((val / max) * 100);

        this.state.brightnessLevel = pct;
        this._applyBrightnessBandLogic(pct);
        resolve();
      });
    });
  }

  // Shared brightness-band logic (macOS + Windows)
  _applyBrightnessBandLogic(pct) {
    let newBand = this.currentBrightnessBand;
    if (pct >= 95) {
      newBand = 'HIGH';
    } else if (pct <= 25) {
      newBand = 'LOW';
    } else if (this.currentBrightnessBand === 'HIGH' && pct < 90) {
      newBand = 'NORMAL';
    } else if (this.currentBrightnessBand === 'LOW' && pct > 30) {
      newBand = 'NORMAL';
    } else if (!this.currentBrightnessBand) {
      newBand = (pct >= 90) ? 'HIGH' : ((pct <= 30) ? 'LOW' : 'NORMAL');
    }
    if (newBand !== this.currentBrightnessBand) {
      const oldBand = this.currentBrightnessBand;
      this.currentBrightnessBand = newBand;
      if (newBand === 'HIGH') {
        this.sendPetEmotion('squint', 4000);
        bubble.show({ badge: 'MAX BRIGHTNESS', text: 'So bright! Sunglasses recommended!', emotion: 'squint' });
      } else if (newBand === 'LOW') {
        this.sendPetEmotion('dull', 4000);
        bubble.show({ badge: 'DIM SCREEN', text: 'Screen is dim and cozy...', emotion: 'dull' });
      } else if (oldBand) {
        this.sendPetEmotion('relieved', 2000);
      }
    }
  }

  // --- 3. BATTERY SENSOR ---
  checkBattery() {
    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        exec(`pmset -g batt 2>/dev/null`, (err, stdout) => {
          if (err || !stdout || !stdout.includes('InternalBattery')) {
            return resolve();
          }

          const match = stdout.match(/(\d+)%;\s*([^;]+);/);
          if (!match) return resolve();

          const pct = parseInt(match[1], 10);
          const stateStr = match[2].trim().toLowerCase();
          const isCharging = stateStr.includes('charging') || stateStr.includes('ac power');

          this.processBatteryState(pct, isCharging);
          resolve();
        });
      } else if (process.platform === 'win32') {
        if (_winPsReady) {
          winPsQuery('[PixieAudio]::BatteryState()', 1200).then((res) => {
            if (res && res !== 'NA' && res.includes(',')) {
              const [pctStr, chgStr] = res.trim().split(',');
              const pct = parseInt(pctStr, 10);
              const isCharging = chgStr.toLowerCase() === 'true';
              if (!isNaN(pct)) {
                this.processBatteryState(pct, isCharging);
                return resolve();
              }
            }
            this._fallbackBattery(resolve);
          }).catch(() => this._fallbackBattery(resolve));
        } else {
          this._fallbackBattery(resolve);
        }
      } else {
        this._fallbackBattery(resolve);
      }
    });
  }

  _fallbackBattery(resolve) {
    try {
      const si = require('systeminformation');
      si.battery().then(b => {
        if (b && b.hasBattery) {
          this.processBatteryState(b.percent || 100, b.isCharging);
        }
        resolve();
      }).catch(() => resolve());
    } catch { resolve(); }
  }

  processBatteryState(pct, isCharging) {
    if (this.state.batteryCharging === null) {
      this.state.batteryCharging = isCharging;
      this.state.batteryPercent = pct;
      return;
    }

    // Plugged in
    if (!this.state.batteryCharging && isCharging) {
      this.state.batteryCharging = true;
      if (this.canReact('battery', 30000)) {
        this.sendPetEmotion('charging', 4000);
        bubble.show({
          badge: 'CHARGER CONNECTED',
          text: 'Plugged in! Energized and charging up!',
          sound: 'happy',
          emotion: 'charging'
        });
      }
    }
    // Unplugged
    else if (this.state.batteryCharging && !isCharging) {
      this.state.batteryCharging = false;
      if (this.canReact('battery', 30000)) {
        this.sendPetEmotion('surprised', 2500);
        bubble.show({
          badge: 'ON BATTERY',
          text: `Running on battery power (${pct}%).`,
          sound: 'tap',
          emotion: 'surprised'
        });
      }
    }

    // Low / Critical battery
    const name = this.getUserName();
    if (!isCharging) {
      if (pct <= 10 && (this.state.batteryPercent === null || this.state.batteryPercent > 10)) {
        if (this.canReact('battery', 120000)) {
          this.sendPetEmotion('low-battery', 5000);
          bubble.show({
            badge: 'CRITICAL BATTERY',
            text: name ? `Hey ${name}, battery is down to ${pct}%! Please plug in soon!` : `Battery is down to ${pct}%! Please plug in soon!`,
            sound: 'tap',
            emotion: 'low-battery'
          });
        }
      } else if (pct <= 20 && (this.state.batteryPercent === null || this.state.batteryPercent > 20)) {
        if (this.canReact('battery', 180000)) {
          this.sendPetEmotion('low-battery', 4500);
          bubble.show({
            badge: 'LOW BATTERY',
            text: name ? `${name}, battery at ${pct}%. Grab your charger when you can!` : `Battery at ${pct}%. Grab your charger when you can!`,
            sound: 'tap',
            emotion: 'low-battery'
          });
        }
      }
    } else if (pct === 100 && this.state.batteryPercent < 100) {
      if (this.canReact('battery', 180000)) {
        this.sendPetEmotion('happy', 3500);
        bubble.show({
          badge: 'BATTERY FULL',
          text: name ? `All powered up, ${name}! 100% ready!` : 'Battery fully charged! 100% ready!',
          sound: 'happy',
          emotion: 'happy'
        });
      }
    }

    this.state.batteryPercent = pct;
  }

  // --- 4. MEDIA / MUSIC SENSOR (JXA for Spotify / Apple Music) ---
  checkMedia() {
    return new Promise((resolve) => {
      const enabled = store.get('settings.reactions.media') !== false;
      if (!enabled) return resolve();

      if (process.platform === 'darwin') {
        // macOS: system-wide audio assertion in pmset -g assertions
        exec('pmset -g assertions 2>/dev/null', (err, stdout) => {
          let isAudioActive = false;
          if (!err && stdout) {
            isAudioActive = /coreaudiod|AppleHDAEngineOutput|audio-out|com\.apple\.audio/i.test(stdout);
          }
          this.processAudioPlayingState(isAudioActive).then(resolve).catch(() => resolve());
        });
      } else if (process.platform === 'win32') {
        this.checkWindowsAudioState().then((isAudioActive) => {
          this.processAudioPlayingState(isAudioActive).then(resolve).catch(() => resolve());
        }).catch(() => resolve());
      } else {
        resolve();
      }
    });
  }

  // Windows: detect if any media/audio process is actively playing audio.
  // Strategy: check for known media player processes + browser processes
  async checkWindowsAudioState() {
    if (typeof this.lastAudioPeak === 'number') {
      return this.lastAudioPeak >= 5;
    }
    return false;
  }

  getJxaTrackTitle() {
    return new Promise((resolve) => {
      const jxa = `
        function run() {
          var track = "";
          try {
            var spotify = Application("Spotify");
            if (spotify.running() && spotify.playerState() === "playing") {
              var t = spotify.currentTrack;
              track = "Spotify: " + t.name() + " - " + t.artist();
            }
          } catch(e) {}
          if (!track) {
            try {
              var music = Application("Music");
              if (music.running() && music.playerState() === "playing") {
                var t = music.currentTrack;
                track = "Music: " + t.name() + " - " + t.artist();
              }
            } catch(e) {}
          }
          return track;
        }
      `;
      exec(`osascript -l JavaScript -e '${jxa.replace(/'/g, "'\\''")}' 2>/dev/null`, (err, stdout) => {
        resolve((stdout || '').trim());
      });
    });
  }

  async processAudioPlayingState(isAudioActive) {
    const now = Date.now();
    if (isAudioActive) {
      this.audioStoppedTime = null;
      if (!this.audioStartTime) {
        this.audioStartTime = now;
      }
      const playingDuration = now - this.audioStartTime;
      // USER REQUEST: audio is playing on the system for 5+ seconds
      if (playingDuration >= 5000 && !this.state.isMusicPlaying) {
        this.state.isMusicPlaying = true;
        let trackTitle = '';
        if (process.platform === 'darwin') {
          try {
            trackTitle = await this.getJxaTrackTitle();
          } catch (e) {}
        }
        this.state.currentTrack = trackTitle;
        this.sendPetEmotion('vibing', 0, 2, true, true); // held state while vibing
        const text = trackTitle
          ? `Grooving to ${trackTitle.replace(/^(Spotify|Music):\s*/, '')}! ♪`
          : 'Grooving to the beats! ♪';
        bubble.show({
          badge: 'VIBING TO MUSIC ♪',
          text,
          sound: 'happy',
          category: 'reactions',
          emotion: 'vibing'
        });
      }
    } else {
      this.audioStartTime = null;
      if (this.state.isMusicPlaying) {
        if (!this.audioStoppedTime) {
          this.audioStoppedTime = now;
        }
        // USER REQUEST: Stop vibing when audio stops for 5 s
        if (now - this.audioStoppedTime >= 5000) {
          this.state.isMusicPlaying = false;
          this.audioStoppedTime = null;
          this.state.currentTrack = '';
          this.sendPetEmotion('relieved', 2000, 2, true, false);
        }
      }
    }
  }

  // --- 5. NETWORK / INTERNET SENSOR ---
  checkNetwork() {
    return new Promise((resolve) => {
      dns.lookup('cloudflare.com', (err) => {
        const online = !err;

        if (!this.state.hasCheckedOnline) {
          this.state.isOnline = online;
          this.state.hasCheckedOnline = true;
          return resolve();
        }

        if (!online && this.state.isOnline) {
          // Double check with google.com before declaring offline to avoid transient DNS glitch
          dns.lookup('google.com', (err2) => {
            if (!err2) return resolve();
            this.state.isOnline = false;
            if (this.canReact('network', 60000)) {
              this.sendPetEmotion('irritated', 4000);
              bubble.show({
                badge: 'OFFLINE',
                text: 'Internet disconnected. Working in offline mode.',
                sound: 'tap',
                emotion: 'irritated'
              });
            }
            resolve();
          });
          return;
        } else if (online && !this.state.isOnline) {
          this.state.isOnline = true;
          if (this.canReact('network', 60000)) {
            this.sendPetEmotion('happy', 3500);
            bubble.show({
              badge: 'CONNECTED',
              text: 'Internet reconnected! Back online.',
              sound: 'happy',
              emotion: 'happy'
            });
          }
        }

        resolve();
      });
    });
  }

  // --- 6. HEADPHONES SENSOR ---
  checkHeadphones(force = false) {
    return new Promise((resolve) => {
      const now = Date.now();
      const throttleMs = process.platform === 'win32' ? 5000 : 45000;
      if (!force && this.state.headphonesConnected !== null && (now - this.lastHeadphonesCheck < throttleMs)) {
        return resolve();
      }
      this.lastHeadphonesCheck = now;

      // ── Windows branch ──────────────────────────────────────────────────
      if (process.platform === 'win32') {
        if (_winPsReady) {
          winPsQuery('Get-PixieFastAudio', 1500).then((res) => {
            if (res && res.includes(';')) {
              const isHp = res.split(';')[1].trim() === 'true';
              this._applyHeadphoneState(isHp);
            }
            resolve();
          }).catch(() => resolve());
          return;
        }
        return resolve();
      }

      // ── macOS branch ─────────────────────────────────────────────────────
      if (process.platform !== 'darwin') return resolve();

      exec(`system_profiler SPAudioDataType 2>/dev/null`, (err, stdout) => {
        if (err || !stdout) return resolve();
        const isHeadphones = /Default Output Device: Yes[\s\S]*?(Output Source: (Headphones|AirPods|Bluetooth)|Transport: (Bluetooth))/i.test(stdout) ||
                             /(AirPods|Headphones|EarPods|Buds)/i.test(stdout.split('Default Output Device: Yes')[0] || '');
        this._applyHeadphoneState(isHeadphones);
        resolve();
      });
    });
  }

  _applyHeadphoneState(isHeadphones) {
    if (this.state.headphonesConnected === null) {
      this.state.headphonesConnected = isHeadphones;
      return;
    }
    if (isHeadphones && !this.state.headphonesConnected) {
      this.state.headphonesConnected = true;
      if (this.canReact('headphones', 60000)) {
        this.sendPetEmotion('focus', 4000);
        const name = this.getUserName();
        bubble.show({
          badge: 'HEADPHONES DETECTED',
          text: name ? `Headphones on, ${name}. Focus mode engaged!` : 'Headphones connected. Focus mode engaged!',
          sound: 'chirp',
          emotion: 'focus'
        });
      }
    } else if (!isHeadphones && this.state.headphonesConnected) {
      this.state.headphonesConnected = false;
      if (this.canReact('headphones', 60000)) {
        this.sendPetEmotion('neutral', 2500);
        bubble.show({
          badge: 'HEADPHONES DISCONNECTED',
          text: 'Headphones disconnected. Back to room audio!',
          sound: 'tap',
          emotion: 'neutral'
        });
      }
    }
  }

  calculateRealSystemCpu() {
    const cpus = os.cpus();
    if (!this.prevCpuTimes || this.prevCpuTimes.length !== cpus.length) {
      this.prevCpuTimes = cpus.map(c => Object.assign({}, c.times));
      return 0;
    }

    let totalDiff = 0;
    let idleDiff = 0;

    for (let i = 0; i < cpus.length; i++) {
      const prev = this.prevCpuTimes[i];
      const curr = cpus[i].times;
      const user = curr.user - prev.user;
      const nice = curr.nice - prev.nice;
      const sys = curr.sys - prev.sys;
      const idle = curr.idle - prev.idle;
      const irq = curr.irq - prev.irq;

      totalDiff += (user + nice + sys + idle + irq);
      idleDiff += idle;
    }

    this.prevCpuTimes = cpus.map(c => Object.assign({}, c.times));

    if (totalDiff <= 0) return 0;
    const busyFraction = (totalDiff - idleDiff) / totalDiff;
    return Math.min(100, Math.max(0, Math.round(busyFraction * 100)));
  }

  // --- 7. SYSTEM LOAD SENSOR ---
  async checkSystemLoad() {
    if (!store.get('settings.reactions.highLoad')) return;

    try {
      const now = Date.now();
      const elapsed = now - (this.lastCpuCheckTime || now);
      this.lastCpuCheckTime = now;

      const cpu = this.calculateRealSystemCpu();

      // Only trigger if system load stays above ~90% for 30+ seconds
      if (cpu >= 90) {
        this.highLoadDurationMs = (this.highLoadDurationMs || 0) + elapsed;
        if (this.highLoadDurationMs >= 30000) {
          if (!this.state.isHighLoad && this.canReact('highLoad', 180000)) {
            this.state.isHighLoad = true;
            this.sendPetEmotion('stressed', 5000);
            const name = this.getUserName();
            bubble.show({
              badge: 'HEAVY LOAD',
              text: name ? `Whoa ${name}, sustained heavy load detected (${cpu}%)!` : `Sustained high load detected (${cpu}%)!`,
              sound: 'tap',
              emotion: 'stressed'
            });
          }
        }
      } else {
        this.highLoadDurationMs = 0;
        if (cpu < 60 && this.state.isHighLoad) {
          this.state.isHighLoad = false;
          this.sendPetEmotion('relieved', 3000);
        }
      }
    } catch (e) {}
  }

  // --- 8. LATE NIGHT SENSOR ---
  async checkLateNight() {
    if (!store.get('settings.reactions.lateNight')) return;

    const hour = new Date().getHours();
    if (hour >= 0 && hour < 5) {
      if (!this.state.isLateNightNudged && this.canReact('lateNight', 3600000)) { // 1 hr cooldown
        this.state.isLateNightNudged = true;
        this.sendPetEmotion('sleepy', 5000);
        const name = this.getUserName();
        bubble.show({
          badge: 'LATE NIGHT CODER',
          text: name ? `Burning the midnight oil, ${name}? Don't forget to get some good sleep!` : "It's past midnight! Don't forget to get some good sleep tonight!",
          emotion: 'sleepy',
          sound: 'chirp'
        });
      }
    } else {
      this.state.isLateNightNudged = false;
    }
  }

  // --- SENSOR STATUS FOR SETTINGS -> REACTIONS ---
  async getSensorStatus() {
    const status = [];

    // Volume
    status.push({
      id: 'volume',
      name: 'Audio Volume',
      status: this.state.volumeLevel !== null ? 'Working' : 'Checking...',
      detail: this.state.volumeLevel !== null ? `${this.state.volumeLevel}% (${this.state.isMuted ? 'Muted' : 'Unmuted'})` : 'Active'
    });

    // Brightness
    status.push({
      id: 'brightness',
      name: 'Screen Brightness',
      status: this.state.brightnessAvailable ? (this.state.brightnessLevel !== null ? 'Working' : 'Checking...') : 'Unavailable on this device',
      detail: this.state.brightnessAvailable && this.state.brightnessLevel !== null ? `${this.state.brightnessLevel}%` : 'Desktop/External Display'
    });

    // Battery
    status.push({
      id: 'battery',
      name: 'Battery & Power',
      status: this.state.batteryPercent !== null ? 'Working' : 'Checking...',
      detail: this.state.batteryPercent !== null ? `${this.state.batteryPercent}% (${this.state.batteryCharging ? 'Charging' : 'On Battery'})` : 'AC Power'
    });

    // Media
    status.push({
      id: 'media',
      name: 'Music & Media (Spotify / Apple Music)',
      status: 'Working',
      detail: this.state.isMusicPlaying ? this.state.currentTrack : 'Idle / Not playing'
    });

    // Network
    status.push({
      id: 'network',
      name: 'Internet Connection',
      status: 'Working',
      detail: this.state.isOnline ? 'Connected' : 'Offline'
    });

    // Headphones
    status.push({
      id: 'headphones',
      name: 'Headphones / Audio Jack',
      status: 'Working',
      detail: this.state.headphonesConnected ? 'Headphones Connected' : 'Speakers Active'
    });

    // Startup & Shutdown Lifecycle (Item B1)
    status.push({
      id: 'bootLifecycle',
      name: 'Startup & Shutdown Lifecycle',
      status: 'Working',
      detail: 'Greeting on real boot, goodbye on shutdown'
    });

    // System Load
    status.push({
      id: 'highLoad',
      name: 'CPU & RAM Telemetry',
      status: 'Working',
      detail: this.state.isHighLoad ? 'High Load (>85%)' : 'Normal Load'
    });

    return status;
  }

  // --- SYNTHETIC SENSOR INJECTION FOR AUTOMATED TESTING ---
  async injectSensorReading(type, value) {
    bubble.hide();
    this.pauseBackgroundPolling(8000);
    switch (type) {
      case 'volume': {
        const vol = typeof value === 'object' ? value.level : Number(value);
        const muted = typeof value === 'object' ? Boolean(value.muted) : false;
        this.state.volumeLevel = vol;
        this.state.isMuted = muted;

        const isMuteOrZero = muted || vol === 0;
        let newBand = 'NORMAL';
        if (isMuteOrZero) newBand = 'MUTED';
        else if (vol >= 98) newBand = 'MAX';
        else if (vol <= 15) newBand = 'LOW';
        else newBand = 'NORMAL';

        this.currentVolumeBand = newBand;

        if (newBand === 'MAX') {
          this.sendPetEmotion('irritated', 4000);
          bubble.show({ badge: 'MAX VOLUME', text: 'Whoa, too loud! Protecting my little ears!', sound: 'tap', emotion: 'irritated', duration: 3000 });
        } else if (newBand === 'MUTED') {
          this.sendPetEmotion('dim', 3500);
          bubble.show({ badge: 'SHH...', text: 'Whisper quiet mode.', sound: 'tap', emotion: 'dim', duration: 3000 });
        } else if (newBand === 'LOW') {
          this.sendPetEmotion('sad', 3500);
          bubble.show({ badge: 'LOW VOLUME', text: 'Can barely hear anything down here...', sound: 'tap', emotion: 'sad', duration: 3000 });
        } else if (newBand === 'NORMAL') {
          this.sendPetEmotion('relieved', 3000);
          bubble.show({ badge: 'VOLUME OK', text: 'Ah, that is much better.', sound: 'happy', emotion: 'relieved', duration: 2500 });
        }
        return { success: true, band: newBand, emotion: newBand === 'MAX' ? 'irritated' : (newBand === 'MUTED' ? 'dim' : (newBand === 'LOW' ? 'sad' : 'relieved')) };
      }

      case 'brightness': {
        const pct = Number(value);
        this.state.brightnessLevel = pct;
        let emotion = 'neutral';
        if (pct >= 95) {
          emotion = 'squint';
          this.currentBrightnessBand = 'HIGH';
          this.sendPetEmotion('squint', 4000);
          bubble.show({ badge: 'MAX BRIGHTNESS', text: 'So bright! Sunglasses recommended!', emotion: 'squint' });
        } else if (pct <= 25) {
          emotion = 'dull';
          this.currentBrightnessBand = 'LOW';
          this.sendPetEmotion('dull', 4000);
          bubble.show({ badge: 'DIM SCREEN', text: 'Screen is dim and cozy...', emotion: 'dull' });
        } else if (this.currentBrightnessBand === 'HIGH' && pct >= 90) {
          emotion = 'squint';
        } else if (this.currentBrightnessBand === 'LOW' && pct <= 30) {
          emotion = 'dull';
        } else {
          this.currentBrightnessBand = 'NORMAL';
          this.sendPetEmotion('neutral', 0);
        }
        return { success: true, brightness: pct, emotion };
      }

      case 'media': {
        const isPlaying = Boolean(value);
        if (isPlaying) {
          this.audioStartTime = Date.now() - 5200; // simulate 5+ seconds active
          await this.processAudioPlayingState(true);
        } else {
          this.audioStoppedTime = Date.now() - 5200; // simulate 5+ seconds stopped
          await this.processAudioPlayingState(false);
        }
        return { success: true, isPlaying: this.state.isMusicPlaying, emotion: this.state.isMusicPlaying ? 'vibing' : 'relieved' };
      }

      case 'battery': {
        const pct = typeof value === 'object' ? value.percent : Number(value);
        const isCharging = typeof value === 'object' ? Boolean(value.charging) : (pct === 100);
        this.lastReactions['battery'] = 0;
        this.state.batteryPercent = pct;
        this.state.batteryCharging = isCharging;
        let emotion = 'happy';
        if (pct === 100 && isCharging) {
          emotion = 'happy';
          this.sendPetEmotion('happy', 3500);
          bubble.show({ badge: 'BATTERY FULL', text: 'Battery fully charged! 100% ready!', sound: 'happy', emotion: 'happy' });
        } else if (isCharging) {
          emotion = 'charging';
          this.sendPetEmotion('charging', 4000);
          bubble.show({ badge: 'CHARGER CONNECTED', text: 'Plugged in! Energized and charging up!', sound: 'happy', emotion: 'charging' });
        } else if (pct <= 20) {
          emotion = 'low-battery';
          this.sendPetEmotion('low-battery', 4500);
          bubble.show({ badge: 'LOW BATTERY', text: `Battery at ${pct}%. Grab your charger when you can!`, sound: 'tap', emotion: 'low-battery' });
        } else {
          emotion = 'surprised';
          this.sendPetEmotion('surprised', 2500);
          bubble.show({ badge: 'ON BATTERY', text: `Running on battery power (${pct}%).`, sound: 'tap', emotion: 'surprised' });
        }
        return { success: true, percent: pct, charging: isCharging, emotion };
      }

      case 'media': {
        const isPlaying = typeof value === 'object' ? Boolean(value.isPlaying) : Boolean(value);
        const title = (typeof value === 'object' && value.title) ? value.title : 'Vibing Music';
        let emotion = 'relieved';
        if (isPlaying) {
          this.state.isMusicPlaying = true;
          this.state.currentTrack = title;
          emotion = 'vibing';
          this.sendPetEmotion('vibing', 6000);
          bubble.show({ badge: 'VIBING TO MUSIC ♪', text: `Grooving to ${title}!`, sound: 'happy', emotion: 'vibing' });
        } else {
          if (this.state.isMusicPlaying) {
            emotion = 'relieved';
            this.sendPetEmotion('relieved', 3000);
          }
          this.state.isMusicPlaying = false;
          this.state.currentTrack = '';
        }
        return { success: true, isPlaying, emotion };
      }

      case 'network': {
        const online = Boolean(value);
        this.state.hasCheckedOnline = true;
        let emotion = online ? 'happy' : 'irritated';
        if (!online) {
          this.state.isOnline = false;
          this.sendPetEmotion('irritated', 4000);
          bubble.show({ badge: 'OFFLINE', text: 'Internet disconnected. Working in offline mode.', sound: 'tap', emotion: 'irritated' });
        } else {
          this.state.isOnline = true;
          this.sendPetEmotion('happy', 3500);
          bubble.show({ badge: 'CONNECTED', text: 'Internet reconnected! Back online.', sound: 'happy', emotion: 'happy' });
        }
        return { success: true, online, emotion };
      }

      case 'headphones': {
        const connected = Boolean(value);
        this.state.headphonesConnected = connected;
        let emotion = connected ? 'focus' : 'relieved';
        if (connected) {
          this.sendPetEmotion('focus', 4000);
          bubble.show({ badge: 'HEADPHONES DETECTED', text: 'Headphones on. Focus mode engaged!', sound: 'chirp', emotion: 'focus' });
        } else {
          this.sendPetEmotion('relieved', 3000);
        }
        return { success: true, connected, emotion };
      }

      case 'cpu': {
        const cpu = Number(value);
        let emotion = 'relieved';
        if (cpu >= 90) {
          this.state.isHighLoad = true;
          emotion = 'stressed';
          this.sendPetEmotion('stressed', 5000);
          bubble.show({ badge: 'HEAVY LOAD', text: `Sustained high load detected (${cpu}%)!`, sound: 'tap', emotion: 'stressed' });
        } else {
          if (this.state.isHighLoad) {
            this.state.isHighLoad = false;
            emotion = 'relieved';
            this.sendPetEmotion('relieved', 3000);
          }
        }
        return { success: true, cpu, emotion };
      }

      case 'idle': {
        const seconds = Number(value);
        let emotion = 'neutral';
        if (this.petWindowRef && !this.petWindowRef.isDestroyed()) {
          if (seconds >= 300) {
            emotion = 'sleeping';
            this.setSleeping(true);
            this.petWindowRef.webContents.send('pet:set-state', { state: 'sleeping' });
          } else if (seconds >= 120) {
            emotion = 'sleepy';
            this.petWindowRef.webContents.send('pet:set-state', { state: 'sleepy' });
          } else if (seconds >= 60) {
            emotion = 'bored';
            this.petWindowRef.webContents.send('pet:set-state', { state: 'bored', duration: 3000, priority: 2 });
          } else {
            emotion = 'neutral';
            this.setSleeping(false);
            this.petWindowRef.webContents.send('pet:set-state', { state: 'neutral' });
          }
        }
        return { success: true, idleSec: seconds, emotion };
      }

      default:
        return { success: false, error: 'Unknown sensor type: ' + type };
    }
  }
}

module.exports = new SystemSense();
