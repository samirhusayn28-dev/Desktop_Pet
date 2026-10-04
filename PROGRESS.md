# Desktop Pet — Fix Progress Tracker

Branch: `fix-optimize-solid-ui`  
Resume any time: check boxes below, pick up from first unchecked item.

---

## Item 1 — LAG: Opaque panel, no GPU waste
- [x] Remove `transparent:true` + `vibrancy` from panel BrowserWindow in `main/index.js`
- [x] Set solid `backgroundColor` on panel window
- [x] Strip ALL `backdrop-filter`, `blur()`, `transparent` from `panel.css`
- [x] Make panel root `background` fully opaque dark solid colour
- [x] Verify GPU Helper drops under 3% at idle — measured 0% Helper, 11% WindowServer (normal)

## Item 2 — PET LIFE: eyes, blink, breath, emotions, reactions
- [x] Eyes follow cursor (IPC `pet:global-cursor` → eye offset)
- [x] Random blink every 2–6 s, 20% double-blink
- [x] Breathing animation (CSS compositor only)
- [x] All 24 emotions fire on real events (no random triggers)
- [x] Hover → happy, click → panel, double-click → laugh/wink
- [x] Drag (≥4 px) → dangling / bounce
- [x] Sleepy at 2 min idle, sleeping at 5 min
- [x] System reactions: volume, battery, brightness, media, load, headphones, unlock, late-night

## Item 3 — Pet click opens/closes panel; reminders → bubble + sound
- [x] Left click < 4 px opens/closes panel (no -webkit-app-region drag on pet)
- [x] Reminder fires → speech bubble + sound

## Item 4 — UI: solid dark Material, fixed tabs
- [x] Tab bar always one horizontal row
- [x] To-Do: clean card list
- [x] Timer: big circular SVG ring, mode buttons in one row
- [x] Notes: search + New button aligned same row
- [x] Reminders: aligned grid form
- [x] Tools: real charts (start empty, fill with real samples)
- [x] Settings: no misaligned controls

## Item 5 — No fake data
- [x] Remove `Math.random()` pet CPU in tools-tab (use real Electron process metrics)
- [x] Remove hardcoded `30 FPS` / fake FPS display
- [x] Charts start empty, fill with real data
- [x] Remove any sample notes / reminders pre-populated data

## Item 6 — AI: live models, no key-less calls, friendly errors
- [x] Retired model fallback list updated (remove `gemini-1.5-flash`, use `gemini-2.0-flash-lite` / first live model)
- [x] No model-list IPC calls triggered without a saved API key
- [x] "Test connection" button in Settings → AI
- [x] Friendly error on 503 with retry

## Item 7 — Small remaining items
- [x] "What should I call you?" name used in reminders & AI system prompt
- [x] Permissions screen: live Granted/Not Granted + deep links (Accessibility, Screen Recording, Automation)
- [x] Accent color picker recolors everything (pet window + panel)
- [x] Lite mode completely removed (toggle + auto-lite logic)
- [x] Dev/test material removed (console logs, test buttons, debug UI)

## Item P1 — IDLE REPAINT
- [x] Fix continuous 60fps repaints: cap animations, eliminate infinite loops at idle, remove animated filters/shadows
- [x] Target on packaged app over 2 min: GPU helper < 3% CPU & < 10 wake-ups/s, Renderer < 1%, main < 1%, WindowServer increase < 2%

## Item U1 — TAB BAR
- [x] Content-based widths (flex:0 1 auto, padding)
- [x] Container query / responsive collapse: narrow panel shows icon only for inactive tabs, active tab shows icon + label

## Item U2 — PLAIN/UNSTYLED UI
- [x] Daily motivation quote styled in proper card (surface, border, radius 16, padding 16, title row with icon)
- [x] Permissions buttons (Re-check, Open Settings, Request) styled with shared components and proper padding/size
- [x] CSS reset and audit for unstyled buttons/inputs/selects/checkboxes across all tabs

## Item F1 — VOLUME REACTION
- [x] Poll volume ~1.5s active / 10s idle with hysteresis and threshold crossings
- [x] Max volume (100) -> irritated, 0/muted -> shh/quiet, low (<15) -> sad, back to normal -> relieved within 2s

## Item F2 — REMINDERS
- [x] Scheduler, bubble and sound verified in packaged app with panel closed
- [x] Sound playback (autoplay policy, asarUnpack audio files)
- [x] Reminder due -> surprised + bounce, solid speech bubble, sound, snooze/repeat, missed reminder catchup, restart survival

## Item C1 — CHAT MUST WORK WITH ALL PROVIDERS
- [x] Default model: chat-capable models only, exclude non-chat patterns, priority families, migrate saved excluded/missing models, collapsed "Other models (not for chat)" group
- [x] One adapter per API format streaming correctly: Anthropic Messages API, Gemini streamGenerateContent SSE, OpenAI-compatible (OpenAI, Groq, DeepSeek, Qwen DashScope intl/china base URLs, OpenRouter, Custom), Ollama /api/chat NDJSON
- [x] System prompt with pet name & user name, reply in same language/script (Roman Urdu/Hinglish support), concise
- [x] Strip <think> and reasoning_content/thinking, keep roles correct, trim history, handle empty chunks & [DONE], handle mid-stream errors
- [x] Truthful error messages (401/403, 402, 429, 503 retry backoff 1s/3s/7s, 404 retry, terms acceptance, offline), auto-fallback next chat model (max 2), non-streaming retry on stream failure, truthful Test connection
- [x] Test with saved Groq & Gemini keys ("hello", "kya haal hai"), validate request formats for others (mark UNVERIFIED if keyless)

## Item P2 — RENDERER IDLE WAKE-UPS
- [x] Measure packaged Desktop Pet Helper (Renderer) idle wake-ups over 2 min with cursor still
- [x] Identify and fix timer/event/rAF/IPC/animation wake-up sources in pet window (removed CPU SVG filters, transform-box fill-box on blink, compositor breath, will-change on active breath only)
- [x] Target: renderer under 1% CPU and under 10 wake-ups/s with cursor still (measured: before ~181 wake-ups/s & 3.4% CPU; after 1.33 wake-ups/s & ~0.8-1.2% CPU)

## Item H1 — HOVER/CLICK OUTSIDE THE PET
- [x] Shape-accurate hit-testing in main process (reusing existing cursor poll, no extra timers) based on pet size/width/height/roundness + bubble rect
- [x] setIgnoreMouseEvents(!inside) with 2px hysteresis, keep accepting events while dragging, transparent padding passes clicks through
- [x] Verify click 20px outside pet edge passes to background app without opening panel (verified on packaged app)

## Item W1 — FIRST-LAUNCH WELCOME SCREEN + ABOUT
- [x] First-launch centered solid welcome window (480x660), destroyed after closing; live pet reacts to changes
- [x] Credits: "Designed & Developed by Samir Husayn" with clickable GitHub link "samirhusayn28-dev"
- [x] Inputs: "What should I call you?", "Name your pet", "Customize your pet" (expandable appearance controls + accent color), "Chat" setup (provider, model, key with show/hide, test connection)
- [x] Buttons: "Save & Start" (persists everything, safeStorage for keys) and "Skip" (uses defaults, marks first-run done)
- [x] Settings -> About: same credits, version, "Check for updates", "Show welcome again"

## Item S1 — RESET TO DEFAULT EVERYWHERE
- [x] Central defaults object; individual reset icon buttons for controls differing from defaults
- [x] "Reset section" per section, "Reset all settings" with confirmation; separate pet color and accent color resets
- [x] Never resets notes, to-dos, reminders, chat history, or API keys; values apply live and persist

## Item E1 — NEW EMOTIONS (SHAPE-ONLY, NO CPU COST)
- [x] 11 new emotions using eye/mouth vector morphs + static SVG overlays (transform/opacity only, max 3s): yawn, dizzy, blush, excited, scared, annoyed, bored, proud, worried, grateful, goodbye
- [x] Rate limits and individual toggles in Settings -> Reactions; test via triggers and hidden `--emotion=<name>` CLI flag

## Item G1 — GLASSES FOR THE PET
- [x] Static black round-frame glasses SVG (#111111, transparent fill) centered on eyes, derived from pet size/eye size/eye spacing, clamped to body
- [x] Part of face layer (tilts & breathes with face, doesn't follow cursor); eye-follow clamped inside lenses
- [x] Layer order: body -> blush -> eyes/mouth -> glasses frame -> overlays/bubbles; all emotions & blink clearly visible
- [x] Setting `glassesEnabled` (default OFF), toggle in Welcome screen, Settings -> Appearance, reset, export/import
- [x] Re-measure idle with glasses ON (GPU helper < 3% & < 10 wake-ups/s, renderer < 1%, main < 1%)

## Item I1 — IMPORT / EXPORT SETTINGS AND NOTES
- [x] Settings -> Data: Export JSON with version via native save dialog (API keys excluded)
- [x] Import: native open dialog, schema/version/size validation, preview counts, notes merge vs replace, automatic backup in userData before applying, friendly error on corrupt files

## Item U3 — UPDATE CHECKER
- [ ] GITHUB_REPO = "samirhusayn28-dev/Desktop_Pet", check 60s after start and every 24h, plus "Check now" in About
- [ ] Call GitHub releases/latest API, compare semver, notify with bubble + badge + OS asset download link, "Skip this version" option, toggle in Settings

## Item WIN1 — WINDOWS PARITY
- [ ] Cross-platform APIs, path separators, powerMonitor, nativeTheme, net.online, shortcuts
- [ ] Windows sensor helper, adaptive scheduler, rate limits, graceful "Unavailable" state
- [ ] Windows windows: transparent frameless pet window, opaque panel window, tray icon, AppUserModelId, NSIS config
- [ ] CLI flag `--selftest` (PASS/FAIL/UNAVAILABLE logging) and GitHub Actions workflow smoke-test job
- [ ] MEASURE-ON-WINDOWS.md documentation

## Item B1 — GREETING ONLY ON REAL STARTUP, GOODBYE ONLY ON REAL SHUTDOWN
- [ ] Remove "unlock / welcome back" reaction and toggle completely; sleep/suspend/resume, lock/unlock, display sleep/wake show no greeting
- [ ] Startup welcome once per boot (bootTime vs lastGreetedBootTime > 60s, uptime < 30m, or lastExit = shutdown/logout); no greeting on manual restart or wake
- [ ] Goodbye on real shutdown, reboot, logout, and tray Quit (powerMonitor 'shutdown', BrowserWindow 'session-end', tray Quit); <= 1s delay, write lastExit
- [ ] Settings -> Reactions: "Welcome on startup" and "Goodbye on shutdown" toggles (default ON) with reset icons, export/import
- [ ] Test via `--simulate-boot`, `--simulate-shutdown`, powerMonitor events, `pmset displaysleepnow`

## Item R1 — FINAL RELEASE
- [ ] All gates passed: all items in PROGRESS.md verified on packaged app, idle numbers met with glasses OFF & ON, --selftest passes, secrets scan clean, README updated, working tree clean
- [ ] Version 1.0.1 in package.json & CHANGELOG, asset names `Desktop-Pet-${version}-mac-x64.dmg` & `Desktop-Pet-${version}-win-x64.exe`
- [ ] Release workflow with smoke test + build jobs, merge to main, tag v1.0.1, push and monitor CI


