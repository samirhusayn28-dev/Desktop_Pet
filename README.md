# Desktop Pet — Minimal AI Pair Programmer Companion 🤍⚡

A lightweight, expressive desktop companion built with **Electron + Node.js + Solid Dark Material UI**. Floats seamlessly on your desktop as an embossed, tactile face-bot companion with live hardware awareness, intelligent IDE/browser context detection, universal multi-provider AI chat, to-do lists, focus timer, notes, system telemetry, and round glasses.

Designed & Developed by **Samir Husayn** ([samirhusayn28-dev](https://github.com/samirhusayn28-dev)).

---

## ✨ Features & Architecture

### 1. Minimalist Vector Face-Bot Companion
- **Pure Floating Character**: Zero window frames or border clippings. Floats transparently on your desktop at `screen-saver` window level.
- **Accurate Shape Hit-Testing**: Clicks outside the pet contour pass directly through to background apps with transparent mouse event forwarding.
- **Micro-Physics Dragging & Clicking**: Mouse clicks (< 4px) toggle the assistant panel; movements $\ge$ 4px drag the companion smoothly across monitors with display boundary clamping.
- **Throttled Eye Tracking (30 FPS)**: Global cursor tracking polled in the main process with a 1.5px movement threshold to conserve CPU.
- **Round Frame Glasses**: Customizable SVG glasses overlay centered on eyes with eye-tracking clamped within lenses.
- **25 Expressive Vector Emotions**: Shape-only eye/mouth morphs with static SVG overlays (transform/opacity only, zero GPU waste). Includes happy, sad, wink, love, thinking, surprised, cool, focus, annoyed, dizzy, blush, excited, scared, bored, proud, worried, grateful, goodbye, and more.
- **Idle Detection & Power-Saving**: Transitions to sleepy at 2 min and sleeping at 5 min with all animation loops paused. Wake from sleep/lock is completely silent with no unwanted popups.
- **Startup Welcome & Shutdown Goodbye**: Greets once per real system boot/login with a time-of-day aware message ("Good morning, <name>!"); shows a brief (< 1s) goodbye wave on shutdown, logout, or tray Quit.

### 2. Multi-Provider AI Engine (Electron Main Process)
- **Zero CORS / CSP Failures**: All AI requests execute directly from the Node.js Main process with streaming chunks piped over IPC.
- **Supported Providers**:
  - **Google Gemini**: Dynamic `v1beta` model discovery (e.g. `gemini-2.0-flash-lite`, `gemini-1.5-flash`).
  - **Groq Cloud**: Ultra-fast OpenAI-compatible endpoints (`llama-3.3-70b-versatile`).
  - **OpenAI**: ChatGPT / GPT-4o / GPT-4o Mini with dynamic models.
  - **Anthropic Claude**: Messages API streaming (`claude-3-5-sonnet`, `claude-3-5-haiku`).
  - **DeepSeek / Qwen / OpenRouter**: Native OpenAI-compatible streaming endpoints.
  - **Ollama**: Local, private, zero-data-leak LLMs via `/api/chat`.
- **System Prompt & Language Adaptation**: Honors user name and pet name, mirrors the user's conversational language (including Roman Urdu/Hinglish).
- **Thinking Filter**: Automatically extracts and filters `<think>` reasoning tags for clean chat bubbles.
- **"Test Connection" Button**: Real-time probe in Settings with clear PASS / FAIL status and friendly troubleshooting explanations.

### 3. Productivity Tools & Solid Material Panel
- **Solid Dark Material UI**: Opaque dark background (#111113) without CPU/GPU-draining blurs or backdrop filters.
- **To-Do List**: Quick task management with add, toggle, and delete.
- **Pomodoro Focus Timer**: Circular SVG countdown ring with work/break presets and chime reminders.
- **Scratchpad Notes**: Local notes with instant search and New note creation.
- **Scheduled Reminders**: Aligned grid form with sound effects, speech bubbles, snooze, and repeat options.
- **Hardware Telemetry**: Real process metrics (CPU %, RAM, Battery, Volume) without fake or randomized data.
- **Data Export & Import**: Complete backup of settings, notes, to-dos, and reminders in versioned JSON with deep security scrubbing (API keys excluded) and pre-import safety backups.
- **Central Reset System**: Individual reset icons on every control, per-section resets, and full reset to defaults without touching user notes or API keys.

### 4. SystemSense: Dynamic Environment Awareness
- **Screen Brightness**: Low brightness -> dim expression; max brightness -> squint eyes.
- **Audio Volume**: Max volume -> irritated; muted -> quiet "shh" expression; normal -> relieved.
- **Battery & Power**: Low-battery alerts; plugged-in celebration.
- **Headphones Detection**: Focus expression when headphones are connected.
- **High CPU / RAM**: Stressed expression with sweat drop when load > 85%.

### 5. Automated GitHub Update Checker
- Checks for releases from `samirhusayn28-dev/Desktop_Pet` 60s after startup and every 24h, plus manual "Check now" in Settings -> About.
- Semver comparator notifies via speech bubble and status badge when an update is available.
- Directly links to the platform-specific installer (`.dmg` for macOS Intel, `.exe` for Windows).
- Offline-safe: Displays "Couldn't check" when offline, never false "Up to date".

---

## 🔒 Security & Privacy

- **OS Secure Storage**: API keys are encrypted via Electron `safeStorage` (macOS Keychain / Windows DPAPI). Keys are never committed to git or stored in plain text.
- **Data Scrubbing**: Exporting data strips all sensitive credentials and secrets automatically.
- **Zero Background Telemetry**: System context is read only when relevant events fire, never logged or transmitted remotely.

---

## 💻 Installation & Running Locally

### Prerequisites
- Node.js 18+ or 20+
- macOS (Intel or Apple Silicon) or Windows 10/11

### 1. Clone & Install
```bash
git clone https://github.com/samirhusayn28-dev/Desktop_Pet.git
cd Desktop_Pet
npm install
```

### 2. Start Application (Dev Mode)
```bash
npm start
```

### 3. Diagnostic Self-Test
Verify all local subsystems (store, vector renderer, audio assets, sensors, update checker):
```bash
npm run test:selftest
```

---

## 📦 Building Releases

### macOS Intel DMG (`x64`)
```bash
npx electron-builder --mac --x64
```
Produces `dist/Desktop-Pet-1.0.1-mac-x64.dmg`.

### Windows x64 NSIS Installer (`.exe`)
```bash
npx electron-builder --win --x64
```
Produces `dist/Desktop-Pet-1.0.1-win-x64.exe`.

---

## 🛡️ Unsigned App Warnings & Permissions

Desktop Pet is an independent open-source project and is not signed with an expensive Apple Developer ID or Microsoft Authenticode certificate. Follow these quick steps on first launch:

### macOS First Launch
1. Open the `.dmg` and drag `Desktop Pet.app` to `/Applications`.
2. Right-click (or Control-click) `Desktop Pet.app` in `/Applications` and select **Open**.
3. In the confirmation dialog, click **Open**.
*(Alternatively, run `xattr -cr "/Applications/Desktop Pet.app"` in Terminal).*

### Windows First Launch (SmartScreen)
1. Run `Desktop-Pet-1.0.1-win-x64.exe`.
2. When Windows SmartScreen appears ("Windows protected your PC"), click **More info**.
3. Click **Run anyway**.

### macOS System Permissions (Settings -> Permissions)
- **Accessibility**: Needed to read frontmost app title for pair-programming context.
- **Screen Recording**: Optional; needed only if "Allow Screen Capture for Vision Queries" is enabled.
- **Automation**: Needed to read the active browser tab URL (Safari, Chrome, Brave).

---

## 📄 License
MIT License. Created by [Samir Husayn](https://github.com/samirhusayn28-dev).
