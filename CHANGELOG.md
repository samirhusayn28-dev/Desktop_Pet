# Changelog

All notable changes to Desktop Pet are documented in this file.

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
