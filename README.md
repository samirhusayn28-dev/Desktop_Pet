# Desktop Pet — Minimal Glassmorphic AI Pair Programmer Companion 🤍⚡

A lightweight, expressive desktop companion built with **Electron + Node.js Main Process + Vanilla CSS Glassmorphism**. Floats seamlessly on your desktop as an embossed, tactile white face-bot companion with live system awareness, intelligent IDE/browser context detection, and multi-provider AI pair programming.

---

## ✨ Features & Architecture

### 1. Minimalist 3D Face-Bot Companion
- **Pure Floating Character**: Zero window frames, solid boxes, or border clippings. Floats transparently on your desktop at `screen-saver` level.
- **Micro-Physics Dragging & Clicking**: Mouse movements under 4px toggle the assistant panel; movements over 4px drag the companion smoothly across monitors with screen boundary constraints.
- **Throttled Eye Tracking (30 FPS)**: Global cursor tracking polled in the main process with a 1.5px movement threshold to conserve CPU. Eyes tilt and follow the cursor across multiple displays.
- **Event-Driven Expressions**: Zero random emotion switching. Pet state is strictly event-driven:
  - **Idle Detection**: Uses OS `powerMonitor.getSystemIdleTime` (2 min -> `sleepy`, 5 min -> `sleeping` with power-save paused loops). Moving the cursor or pressing any key immediately awakens the pet (`surprised` -> `neutral`).
  - **Context Expressions**: Focuses when in code editors (`focus`), vibes to music (`vibing`), stresses on heavy system load (`stressed`), squints on max brightness (`squint`), reacts to audio level changes.

### 2. Multi-Provider AI Engine (Electron Main Process)
- **Zero CORS / CSP Failures**: All AI requests execute directly from the Node.js Main process with streaming chunks piped over IPC.
- **Supported Providers**:
  - **Google Gemini**: Dynamic `v1beta` model discovery (no hardcoded models, automatically auto-selects active Flash models).
  - **Groq Cloud**: OpenAI-compatible ultra-fast endpoints (`llama-3.3-70b-versatile`).
  - **OpenAI**: ChatGPT / GPT-4o / GPT-4o Mini with dynamic models.
  - **Anthropic Claude**: Claude 3.5 Sonnet & Haiku.
  - **Ollama**: Local, private, zero-data-leak LLMs.
- **"Test Connection" Button**: Real-time probe button in Settings with clear **PASS / FAIL** status and short human-friendly explanations.
- **Smart Error Mapping**:
  - `401 / 403` -> "Invalid API key. Please check your credentials in Settings."
  - `402 / No credits` -> "No credits on this account. Please check your billing or plan balance."
  - `429` -> "Rate limit reached. Please try again in a minute."
  - `503` -> Auto-retry with backoff (1s / 3s / 7s).
  - `404` -> Auto-refreshes dynamic model list and retries once.
  - Offline / Network -> "No internet connection or provider endpoint unreachable."
- **Automatic Fallback**: If streaming fails, automatically retries once without streaming.

### 3. SystemSense: Dynamic Laptop & Environment Awareness
The companion reacts to your computer's real-time hardware status:
- **Screen Brightness**: Low brightness -> dull/dim look; max brightness -> squint eyes.
- **Audio Volume**: Max volume -> irritated/annoyed face with "too loud!" bubble; muted -> quiet face with "shh" bubble.
- **Battery & Power**: < 20% -> low-battery droopy eyes + reminder; < 10% -> worried warning; plugged in -> energized happy celebration.
- **Media Playback**: Detects active Spotify, Apple Music, and browser playback; enters vibe mode with a rhythmic head-bob and floating music notes, displaying the song title.
- **High CPU / RAM**: Shows stressed expression with a sweat drop when system load exceeds 85%.
- **Late Night Coding**: Gently nudges you to rest if active past midnight.

### 4. Desktop & Browser Context Awareness
- **Active App & Window Awareness**: Companion detects current active foreground application, window title, and active browser tab (Safari, Chrome, Brave, Arc, Edge, Firefox).
- **Context Bar**: Displays active context in the chat header (e.g. `Context: Brave — Google AI Studio`).
- **Vision Screen Capture**: On-demand screen capture via `desktopCapturer` when asking "what is on my screen" or visual debugging questions.
- **Strict Privacy**: Context is gathered **only** at the moment you click Send. Never monitored or stored in background.
- **Built-in Blocklist**: Sensitive windows (password managers, banking sites, incognito windows) are redacted automatically.

### 5. Dedicated Screen-Saver Speech Bubble Window
- Separate transparent, frameless, click-through overlay window positioned over the pet.
- Runs at `setAlwaysOnTop(true, 'screen-saver')` with `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
- Sequential message queue prevents overlapping notifications.
- Auto-dismisses, pauses on mouse hover, and plays subtle robot audio chimes.

### 6. Clean 6-Section Glassmorphic Settings
- **General**: Pet name, Launch at Login, Always on Top, Remember Position.
- **Behavior**: Idle sleepy minutes, Idle sleeping minutes, Bubble duration, Notification sounds, Do Not Disturb (DND).
- **Reactions**: Individual toggles for Brightness, Volume, Battery, Music/Media, High Load, and Late Night.
- **Appearance**: Live 3D preview stage, single accent color picker with swatches, scale, width, height, roundness, eye size, eye spacing, depth, body color, **Panel Transparency (default 30%)**, and **Panel Blur (default 24px)**.
- **AI Provider**: Active provider, API key, model discovery, custom base URL, "Test Connection" button with PASS/FAIL feedback.
- **Privacy**: Desktop context awareness toggle, Vision screenshot toggle, Blocklist editor.

---

## 🔒 Security & Privacy

- **OS Secure Storage**: All API keys are encrypted using Electron's native `safeStorage` (macOS Keychain / Windows DPAPI). Keys are never committed to git or stored in plain text.
- **Zero Telemetry / Zero Leakage**: Context and screenshots are never sent anywhere except to the specific AI provider selected by the user.

---

## 🛠️ Installation & Running Locally

### Prerequisites
- Node.js 18+ or 20+
- macOS (Intel or Apple Silicon) or Windows 10/11

### 1. Clone & Install
```bash
git clone https://github.com/samirhusayn28-dev/Desktop_Pet.git
cd Desktop_Pet
npm install
```

### 2. Start Application
```bash
npm start
```

---

## 📦 Building Releases

### macOS Intel DMG (`x64`)
```bash
npm run build:mac
```
Produces an installer DMG in `dist/Desktop Pet-1.0.0.dmg`.

### Windows x64 NSIS Installer (`.exe`)
```bash
npm run build:win
```
Produces `dist/Desktop Pet Setup 1.0.0.exe`.

---

## 🛡️ macOS Permissions & Unsigned App Warnings

Because Desktop Pet is an open-source companion not distributed through the Mac App Store:

1. **First Launch (Unsigned App Notice)**:
   - On macOS, right-click `Desktop Pet.app` in `/Applications` and select **Open**, then click **Open** in the dialog.
   - Alternatively: run `xattr -cr "/Applications/Desktop Pet.app"`.

2. **System Permissions (Optional for Context Awareness)**:
   - **Accessibility**: Needed to read the frontmost application title.
   - **Automation (AppleScript)**: Needed to read current browser URL in Safari/Chrome.
   - **Screen Recording**: Needed only if "Allow Screen Capture for Vision Queries" is enabled in Settings -> Privacy.

---

## 📄 License
MIT License. Crafted with precision for pair programming excellence.
