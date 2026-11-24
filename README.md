# Pixie — Black Matte AI Desktop Companion

Pixie is a lightweight, expressive desktop companion built with **Electron + Node.js**. It floats above your desktop as a code-driven SVG pet, with a compact solid-black panel for chat, daily tools, privacy controls, and settings.

Designed & developed by **Samir Husayn** ([samirhusayn28-dev](https://github.com/samirhusayn28-dev)).

---

## Highlights

- **Battery-friendly black matte UI**: the panel, pet bubble, quick menu, standalone bubble, and welcome screen use solid `#000000` / `#08080a` / `#161618` surfaces with a blue accent. There is no blur, glass, transparency slider, or light-theme override.
- **Cross-platform by design**: macOS and Windows x64 share the same panel sections, reactions, sounds, reminders, notes, clipboard history, backup/import, typing animation, and privacy rules.
- **Code-driven Pixie pet**: no image assets and no glasses. Eyes and mouth are SVG shapes; the mouth is `#111111`. Multiple emotions and distinct reactions fire for each of the 14 panel sections.
- **Playful when idle**: after a short pause Pixie starts short, bounded activities — clamped hops, hand waves, clapping, vibing, and eye/mouth antics — instead of sitting in a bored pose.
- **Typing everywhere**: Pixie reacts while you type in other apps. macOS uses an Accessibility event tap; Windows uses a local low-level keyboard hook with a real message pump that emits only a typing pulse and never reads the pressed key. Settings shows helper readiness and any failure reason.
- **AI chat with multiple providers**: Gemini, Groq, OpenAI, Anthropic, Qwen, DeepSeek, OpenRouter, Ollama, and custom OpenAI-compatible endpoints, streamed through the Electron main process.
- **Daily tools**: to-do list, Pomodoro Focus with reminders, multiple notes with pinning and autosave, eval-free scientific calculator, unit converter, color studio, markdown preview, saved prompts, and clipboard history.
- **Audible reminders and reactions**: sounds are on by default. Reminders live in their own section, fire even when the panel is closed, and show a native popup plus speech bubble and alarm sound, with repeat, snooze, and notification click-through to Reminders.
- **Local privacy controls**: desktop context is attached only when you send a message. macOS may provide browser tab title/URL; Windows provides foreground app name and window title only. Both use the same blocklist and redaction rules.

---

## Panel sections

The in-panel navigation has 14 sections:

`Chat`, `Flow`, `Focus`, `Reminders`, `To-Do`, `Notes`, `Calc`, `Convert`, `Privacy`, `Clipboard`, `Colors`, `Markdown`, `Saved Prompts`, and `Settings`.

**Reminders** is a dedicated section with its own composer and list. Clicking a reminder notification opens it directly.

---

## Backup, restore, and privacy

- API keys are encrypted at rest with Electron `safeStorage` (macOS Keychain / Windows DPAPI).
- A **full backup** uses `format: "pixie-full-backup"`, `version: 2`, and stores the whole app snapshot plus decrypted `secrets.apiKeys` so a full restore can restore everything. Keep backup files private.
- Legacy `version: 1` backups remain importable.
- A safety backup is written before an import is applied.
- Notes are stored as `tools.notes` with `{ id, title, content, pinned, updatedAt }`; clipboard history is capped at 50 items in `tools.clipboardHistory` and is gated by privacy settings.

---

## Run locally

### Prerequisites

- Node.js 18+
- macOS or Windows 10/11

```bash
npm install
npm start
```

### Self-test

```bash
npm run test:selftest
```

---

## Build installers

```bash
npm run build:mac   # dist/Pixie-<version>-mac-x64.dmg and .zip
npm run build:win   # dist/Pixie-<version>-win-x64.exe
npm run build:all   # both platforms in one command
```

Current release: **1.2.1**.

The macOS and Windows helper scripts are unpacked into `app.asar.unpacked/main/` so the typing and context helpers are available at runtime.

---

## First launch and permissions

These builds are **unsigned and not notarized**.

### macOS

1. Open the `.dmg` and drag `Pixie.app` to `/Applications`.
2. Control-click `Pixie.app` and choose **Open** if Gatekeeper warns.
3. Grant **Accessibility** permission to Pixie when prompted so OS-wide typing animation works. If Settings reports a helper failure, use **Accessibility** then **Restart helper**; auto retries will also resume after permission is granted.
4. Screen Recording and Automation are optional and only needed for screenshot context and browser tab details.

### Windows

1. Run `Pixie-1.2.1-win-x64.exe`.
2. If SmartScreen appears, choose **More info → Run anyway**.
3. The Windows keyboard hook does not need Accessibility permission. Settings deep links open the relevant Windows Settings pages.

---

## License and fonts

- Code: MIT License. Created by [Samir Husayn](https://github.com/samirhusayn28-dev).
- Nunito, Fredoka, JetBrains Mono, and Lucide Icons retain their respective open-source licenses.
