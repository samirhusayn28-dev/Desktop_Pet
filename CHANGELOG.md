## [1.2.1] - 2026-11-24 — **Idle Play, Panel Independence & Update UI**

### Fixes & Improvements
- **Dedicated Reminders**: Reminders is a visible panel section; reminder notifications route to Reminders.
- **Instant panel reactions**: Section/action reactions fire before lazy load; forced bubbles clear stale queued reactions to prevent previous-section popups.
- **Idle boredom play**: After ~3 minutes inactivity Pixie does random roaming/hops/reactions (look around, stretch, vibe, ball play, etc.); after long inactivity becomes sleepy/tired, then sleeps shortly after.
- **Pet/panel independence**: Dragging the pet no longer moves the panel; idle hop movement does not move the panel. Idle hops are bounded and clamped to the work area.
- **Smoother sounds**: Replaced bundled WAVs with softer generated sine/bell tones while keeping master/category/DND sound rules.
- **Update trigger/UI**: Settings shows update status and a Download Update button when GitHub has a newer release; manual check and cached status are handled.
- **Installer naming**: Release artifacts renamed to `Pixie-${version}-mac-x64.*` / `Pixie-${version}-win-x64.*`.

## [1.2.0] - 2026-11-24 — **Black Matte UI & Full macOS/Windows Parity**

- **Battery-friendly theme**: Panel, pet bubble, quick menu, and welcome surface now use solid black matte colors with blue accent highlights. No blur, glass, or light-theme override remains. Removed the legacy Panel alpha and Panel blur controls from Settings.
- **Windows parity**:
  - Added a local Windows low-level keyboard hook for OS-wide typing animation, matching macOS behavior.
  - The Windows hook now runs on a real Win32 message pump and emits pulses from a background writer instead of writing to the console inside the hook callback.
  - Added a Windows foreground-window context helper with the same privacy redaction rules as macOS.
  - Windows Settings deep links now open the relevant OS Settings pages.
- **Reminders**: Reminders now have their own dedicated in-panel section. Due reminders show a native popup, speech bubble, and alarm sound; notification clicks open Reminders on both platforms.
- **Panel reactions**: Section and action reactions now fire before lazy tab loading, bubble messages are forced to the front, and a stalled bubble queue advances immediately. Typing and idle poses no longer hide forced panel reactions.
- **Idle play**: Inactive time now triggers short random activities (clamped hops, waves, claps, vibing, ball play, and eye/mouth antics) instead of a static bored pose, using one chained timer and no extra RAF or visual filters.
- **Typing everywhere**: macOS now retries recoverable tap failures with bounded backoff, requests Accessibility from the frontmost Pixie Settings button, and shows helper readiness, errors, and the last OS key in Settings.
- **Packaging**: Added dedicated build scripts for unsigned macOS and Windows x64 installers with all helper scripts unpacked for runtime use.

## [1.1.3] - 2026-04-21 — **Companion & Wellness (SystemSense Replaced)**

- **Removed SystemSense**: Removed legacy hardware/system-sense polling, diagnostics, and sensor reaction wiring.
- **Added Companion Features**: Pet Care & Mood, Smart Clipboard Buddy, Focus Streaks & Gentle Breaks, Daily Check-in, Quick Capture, Micro-Break Breathing, wellness nudges, quick tricks, and daily summary.
- **Performance**: New features are event-driven/slow-interval and designed to stay low-resource for always-on desktop use.

# Changelog

All notable changes to Pixie are documented in this file.

## [1.1.2] - 2026-10-14 — **SystemSense Accuracy & False-Positive Elimination (macOS & Windows)**

### Fixed
- **Battery AC / Charger Flip-Flop**: Resolved battery state misdetection on macOS where `Now drawing from 'AC Power'` and `AC attached; not charging` caused the pet to falsely cycle between "On Battery" and "Charger Connected".
- **Headphone False Positives & Latency**:
  - macOS: Fixed issue where paired/inactive Bluetooth audio devices caused perpetual false headphone detections. Reduced check throttle from 45 seconds to 3 seconds for instant and responsive headphone detection.
  - Windows: Added `PKEY_AudioEndpoint_FormFactor` inspection and excluded `Speakers/Headphones` driver descriptions from triggering false headphone reactions.
- **Random Media/Music Vibing**: Eliminated false positives caused by static macOS audio drivers and ambient Windows audio noise (`peak >= 35` threshold). Added 60s cooldown to media alerts.
- **Volume & Brightness Rate-Limiting**: Added debounced cooldowns (25s on volume, 30s on brightness) preventing rapid slider movement from triggering stacked speech bubbles.
- **Settings Sub-Event Mapping**: Mapped `battery_*`, `headphones_*`, and `network_*` events to parent settings so disabling reactions in Settings is strictly respected.

## [1.1.1] - 2026-10-07 — **Chat Provider Fix & Live Dynamic AI Personality**

### Fixed
- **AI Chat `baseUrl` ReferenceError**: Fixed `ReferenceError: baseUrl is not defined` in `chat-tab.js` when dispatching chat queries to AI providers (Groq, OpenAI, Gemini, etc.).

### Added
- **Remote Dynamic Personality (`personality.json`)**: Pet fetches its creator identity and behavior prompt directly from GitHub with an in-memory 10-minute cache and offline fallback.
- **Creator Identity**: Configured Samir Husayn as Pixie's creator.

## [1.1.0] - 2026-10-06 — **Data Persistence, Path Unification & Welcome Onboarding**
- Unified storage path via `getCanonicalUserDataPath()` in `secure-store.js`.
- Fixed welcome screen to persist all fields (appearance, AI, pet name, sounds).
- Added `panel:reload-settings` IPC event for immediate sync post-onboarding.
- Replaced tools tab with functional clipboard tab.
- Enabled `onboarding.completed` flag to prevent modal re-appearing.

## [1.0.9] - 2026-10-06 — **Removal of Bulb Glow, Windows Reminders & Zero-Latency System Sense**

### Removed
- **Electric Bulb Glow Effect Removed**: Completely removed `.pet-bulb-active` CSS drop-shadow/pulse animations and `setBulbActive` controller routines as requested.
- **Glasses Overlay Removed**: The pet no longer renders any glasses frame; face rendering is a code-driven SVG rig with a black (#111111) mouth.

### Fixed
- **Windows Reminders Not Working**:
  - Fixed Windows `setAlwaysOnTop` crash: `'screen-saver'` window level is macOS-exclusive; on Windows, safe `setAlwaysOnTop(true)` and `moveTop()` are used to prevent `TypeError` from terminating the reminder trigger sequence.
  - Added robust `parseReminderTime()` supporting 24-hour, 12-hour AM/PM (`2:30 PM`), seconds (`14:30:00`), and whitespace.
  - Added 2-minute tolerance window in `evaluateReminders` preventing system lag from dropping scheduled reminders.
  - Added native Windows `shell.beep()` audio fallback and normalized cross-platform audio path resolution.
  - Added `reminder:triggered` IPC handler in panel reminders tab for live synchronization.
- **Windows System Sense Latency**:
  - Eliminated sensor lag by unifying audio, headphones, battery, and brightness into a high-frequency 300ms query (`Get-PixieFastAudio`).
  - Switched Windows battery detection to direct kernel32 `GetSystemPowerStatus` via C#, eliminating slow WMI queries.
  - Disabled `backgroundThrottling` on `petWindow` to prevent Chromium from delaying background event loops and pet reactions when other apps are active.

## [1.0.8] - 2026-10-05 — **Customization and Color Pickers**
- Added eyes color picker and mouth color picker.

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
- **Sounds on/off option**: Unified master sound toggle under `soundsEnabled` controlling all reminders, timer/pomodoro alarms, and pet reactions. Sounds now default ON at volume 60. Includes volume slider (0-100), test sound button, category sub-toggles, Do Not Disturb muting, Welcome screen sync, and automatic one-time settings migration.

## [1.0.1] - 2026-10-04

### Added
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
