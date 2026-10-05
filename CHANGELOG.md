# Changelog

All notable changes to Pixie are documented in this file.

## [1.0.7] - 2026-10-05 — **Auto-Update Detection Reliability Fix**

### Fixed
- **Update Not Detected Automatically** — Complete rewrite of `update-checker.js`:
  - **Aggressive boot schedule**: Checks at **15 seconds → 2 minutes → 30 minutes** after launch instead of a single 8-second check that was easy to miss or fail.
  - **Pet re-reacts on panel open**: When the panel opens and a pending update is already cached, Pixie now **re-shows the speech bubble** ("New version v1.x.x is ready! Open Settings to download.") — so the user cannot miss it just because they opened the panel after the initial notification.
  - **Retry on transient network failure**: If the GitHub API is unavailable or rate-limited at boot, the checker automatically retries after 30s, 60s, and 120s instead of silently giving up for 4 hours.
  - **Hourly periodic check** (was: every 4 hours) — ensures long-running sessions always catch updates within an hour.
  - **Concurrent check guard**: Prevents stacked auto-checks from overlapping if the previous one is still in flight.

## [1.0.6] - 2026-10-05 — **Reminder Scheduler Deep Fix**

### Fixed
- **Reminders Still Not Triggering** — Complete rewrite of `scheduler.js` evaluation engine:
  - **`checkPastDueOnStartup()`**: On every app launch, scans all enabled reminders and fires any that were due within the last 30 minutes (as "missed" alerts), so reminders are never silently lost if the app was closed at their scheduled time.
  - **`evaluateNow()`**: Called immediately whenever the user adds or edits a reminder via the panel. Checks if the reminder time is right now or up to 2 minutes in the past and fires it immediately — so setting a reminder for "now" always works.
  - **`firedThisSession` deduplication Set**: Prevents any reminder from double-firing in the same app session regardless of how many times `evaluateNow`, `evaluateReminders`, or `checkPastDueOnStartup` are called.
  - **Snooze/Reschedule properly clears session state**: After snooze or edit, the reminder's session entry is removed so it can fire again at its new time.
  - **Comprehensive error isolation**: Each trigger step (native notification, pet window, bubble, panel IPC) is independently try-caught so a failure in one never blocks the others.
  - **Debug logging**: Console now logs `[Scheduler] FIRING reminder "..." at HH:MM` so reminder activity is traceable in the app's developer console.

## [1.0.5] - 2026-10-05 — **Instant System Sense, Reminders Fix & Auto Update Detection**

### Fixed
- **Reminders Not Triggering**:
  - Replaced strict string time matching with numeric hour and minute evaluation (`rHours === currentHours && rMins === currentMins`), making reminder scheduling 100% immune to padding, extra seconds, or timezone/string format variations.
  - Eliminated flawed startup missed-reminder check that was falsely disabling upcoming reminders on application boot or window reload.
  - Added native OS desktop notifications (`Notification` API) so scheduled reminder alerts display immediately in Windows Action Center and macOS Notification Center even when other windows or games are in full screen.
  - Wakes pet and brings pet window to the foreground with speech bubble and alarm alert when any reminder is due.
  - Synchronizes reminder state changes (`reminders:changed` IPC) immediately across the background scheduler and the panel UI.
  - Configured reminder audio alerts to sound whenever `soundReminders` is enabled, even if ambient pet chirps are muted.

- **Windows System Sense Lag & Huge Delay**:
  - Decoupled fast Core Audio tracking from slow WMI queries: introduced ultra-fast `Get-PixieFastAudio` routine executing in <2ms directly via C# Core Audio COM and registry friendly-name inspection.
  - Implemented sequence-tagged correlation ID protocol (`PX_RES:<id>:<result>`) preventing any PowerShell response desynchronization or command queue stalls.
  - Reduced volume polling interval from 1.5s/10s down to 400ms (active) and 1200ms (idle), delivering instantaneous reactions to volume changes, mute/unmute, headphone connect/disconnect, and music playback.

### Added
- **Automatic GitHub Update Detection**:
  - Background auto-update check runs 8 seconds after application boot and periodically every 4 hours, as well as on system resume from sleep.
  - When a new GitHub release is detected, Pixie automatically displays a gentle notification banner in the panel window, an update indicator badge on the Settings button, a pet speech bubble, and a native OS desktop notification with a direct download button.
  - Retains manual "Check for Updates" button with live status feedback.

## [1.0.4] - 2026-10-05 — **Windows System Functions & Hardware Parity Update**

### Fixed
- **Windows System Reactions Parity**: Pet now reacts on Windows exactly as it does on macOS to all system functions and hardware events:
  - **Volume & Mute**: Real-time Windows Core Audio endpoint tracking (`IAudioEndpointVolume` COM integration via persistent background helper) detecting MAX volume, LOW volume, MUTE/SHH, and NORMAL volume without polling lag.
  - **Screen Brightness**: WMI and CIM monitor brightness detection (`WmiMonitorBrightness`) reacting to MAX brightness and DIM screen settings.
  - **Headphone Connect & Disconnect**: Real-time detection of headphones, headsets, AirPods, and Bluetooth earbuds plugging in (focus mode engaged) and unplugging (restoring room audio).
  - **Charger Plugged In & Unplugged**: Instant hardware-level `on-ac` and `on-battery` power monitoring so pet immediately celebrates when plugged in and alerts when on battery.
  - **System Audio Vibing**: Hardware peak meter audio detection (`IAudioMeterInformation`) enabling the pet to groove and vibe when music or media is actively playing through Windows audio.
  - **Network Online & Offline**: Domain DNS verification alerting when Wi-Fi disconnects and celebrating when reconnected.

## [1.0.3] - 2026-10-05 — **"Pixie" Release**

### Changed
- **App renamed to Pixie** — product name updated to "Pixie" across macOS (.dmg) and Windows (.exe) installers
- **Default pet name is now Pixie** — fresh installs greet users with the name "Pixie" pre-filled in the welcome screen

### Fixed
- **Bubble too far from pet (all scales)** — speech bubble tail now anchors exactly 8px above the pet's head using precise body geometry; the old ~91px gap is eliminated
- **Bubble updates on resize/flip** — bubble re-anchors correctly when the pet's appearance scale changes or the bubble flips below the pet
- **Top-edge dragging (macOS & Windows)** — pet window uses `enableLargerThanScreen: true` + full display `bounds` clamping so the pet can reach the very top pixel of every display on both platforms


## [1.0.2] - 2026-10-05

### Added
- **Sounds on/off option, off by default**: Unified master sound toggle under `soundsEnabled` (off by default) controlling all reminders, timer/pomodoro alarms, and pet reactions. Includes volume slider (0-100), test sound button, category sub-toggles, Do Not Disturb muting, Welcome screen sync, and automatic one-time settings migration.

## [1.0.1] - 2026-10-04

### Added
- **Round Frame Glasses**: Customizable black round frame SVG glasses overlay with clamped eye follow inside lenses.
- **11 New Vector Emotions**: Shape-only eye/mouth vector morphs (yawn, dizzy, blush, excited, scared, annoyed, bored, proud, worried, grateful, goodbye) bringing total emotions to 25.
- **Boot & Shutdown Lifecycle**: Warm greeting once per real system boot/login; graceful ~1s goodbye wave on system shutdown, logout, or tray Quit; silent wake on sleep/lock.
- **Data Export & Import**: Native file dialogs for JSON export/import with schema/version validation, notes merge/replace, security scrubbing (API keys excluded), and automatic safety backups in userData.
- **Central Reset System**: Per-control reset buttons, per-section resets, and full settings reset to defaults without touching user notes or API keys.
- **First-Launch Welcome Screen**: Centered 480x660 window for initial user onboarding, pet naming, live customization, and AI credentials.
- **Automated Update Checker**: Background checks against `samirhusayn28-dev/Desktop_Pet` releases with OS-specific asset resolution (macOS Intel `.dmg`, Windows `.exe`) and offline error protection.
- **Windows Cross-Platform Parity**: Full Windows support with `AppUserModelId`, NSIS installer, adaptive sensor fallbacks, and `--selftest` CLI suite.

### Changed
- **Solid Material Panel**: Replaced transparent/vibrancy panel and blurred backdrop filters with an opaque dark Material surface (#111113) for dramatically lower idle CPU and GPU usage.
- **Idle Optimization**: Eliminated repaints and CPU SVG filters; achieved idle budgets under 3% GPU Helper, under 1% Renderer, and under 1% Main process.
- **Hit-Testing**: Shape-accurate hit testing with hysteresis allowing clicks outside the pet silhouette to pass transparently to underlying apps.
- **Universal Chat**: Robust multi-provider streaming for Gemini v1beta, Groq, OpenAI, Claude Messages API, DeepSeek, Qwen, and Ollama with `<think>` tag filtering and truthful error reporting.

---

## [1.0.0] - 2026-10-03

### Initial Release
- Floating vector companion on desktop.
- Eye cursor tracking and blink animations.
- System hardware awareness (battery, volume, brightness, media).
- Basic AI chat integration and productivity tools (To-Do, Timer, Notes, Reminders).
