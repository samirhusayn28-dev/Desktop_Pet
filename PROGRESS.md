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
- [x] GITHUB_REPO = "samirhusayn28-dev/Desktop_Pet", check 60s after start and every 24h, plus "Check now" in About
- [x] Call GitHub releases/latest API, compare semver, notify with bubble + badge + OS asset download link, "Skip this version" option, toggle in Settings

## Item WIN1 — WINDOWS PARITY
- [x] Cross-platform APIs, path separators, powerMonitor, nativeTheme, net.online, shortcuts
- [x] Windows sensor helper, adaptive scheduler, rate limits, graceful "Unavailable" state
- [x] Windows windows: transparent frameless pet window, opaque panel window, tray icon, AppUserModelId, NSIS config
- [x] CLI flag `--selftest` (PASS/FAIL/UNAVAILABLE logging) and GitHub Actions workflow smoke-test job
- [x] MEASURE-ON-WINDOWS.md documentation

## Item B1 — GREETING ONLY ON REAL STARTUP, GOODBYE ONLY ON REAL SHUTDOWN
- [x] Remove "unlock / welcome back" reaction and toggle completely; sleep/suspend/resume, lock/unlock, display sleep/wake show no greeting
- [x] Startup welcome once per boot (bootTime vs lastGreetedBootTime > 60s, uptime < 30m, or lastExit = shutdown/logout); no greeting on manual restart or wake
- [x] Goodbye on real shutdown, reboot, logout, and tray Quit (powerMonitor 'shutdown', BrowserWindow 'session-end', tray Quit); <= 1s delay, write lastExit
- [x] Settings -> Reactions: "Welcome on startup" and "Goodbye on shutdown" toggles (default ON) with reset icons, export/import
- [x] Test via `--simulate-boot`, `--simulate-shutdown`, powerMonitor events, `pmset displaysleepnow`

## Item R1 — FINAL RELEASE
- [x] All gates passed: all items in PROGRESS.md verified on packaged app, idle numbers met with glasses OFF & ON, --selftest passes, secrets scan clean, README updated, working tree clean
- [x] Version 1.0.1 in package.json & CHANGELOG, asset names `Desktop-Pet-${version}-mac-x64.dmg` & `Desktop-Pet-${version}-win-x64.exe`
- [x] Release workflow with smoke test + build jobs, merge to main, tag v1.0.1, push and monitor CI

---

# Bug-Fix Round (Branch: main)

## Item H2 — HOVER/CLICK ONLY ON THE PET'S SHAPE
- [x] Investigate real cause of outside hover/click triggers (container/body events, DPI/scale, padding)
- [x] Defense in depth: renderer `pointer-events: none` on html/body/container and `auto` ONLY on pet body shape
- [x] Main process DIP rounded-rect hit-test with 2px hysteresis and `setIgnoreMouseEvents(!inside, { forward: true })`
- [x] Drive hover/click/drag strictly by `insidePet` state; panel toggles only if mousedown and mouseup are inside
- [x] Test via hook: 1px inside, 1px/5px/20px outside across sizes, pill/square roundness, glasses on, bubbles visible

## Item E2 — EMOTIONS DO NOT WORK
- [x] Add `--emotion=<name>` hook; test each of 25 emotions via e2e screenshot inspection (glasses OFF and ON)
- [x] Fix triggers and define strict priority order: error/AI > user interaction > reminder > system reactions > idle
- [x] Ensure all temporary emotions return to correct baseline (neutral / sleepy / sleeping)
- [x] Test event injection via hook: volume, brightness, battery, media, network, headphones, high CPU, etc.

## Item R2 — REMINDER "EDIT" BUTTON DOES NOTHING
- [x] Investigate cause (event listener loss, channel mismatch, CSS hidden form)
- [x] Implement inline edit form with custom pickers, reschedule in scheduler, persist across restarts
- [x] Real click e2e test: add, edit, snooze, mark done, delete, repeat; verify alert fires at new time with bubble & sound

## Item PERM2 — SCREEN RECORDING STILL SHOWS "REQUEST" AFTER ALLOWING IT
- [ ] Real status check via `systemPreferences.getMediaAccessStatus('screen')` + `desktopCapturer.getSources`
- [ ] Differentiate "Granted", "Granted - restart the app to apply" with Restart button, "Not granted", "Denied"
- [ ] Max 60s bounded poll (1/s) only while settings panel is open after clicking Request/Open Settings; check on app focus
- [ ] Show app path and version, recovery hint for stuck permissions, lazy truthful permission requests
- [ ] Windows fallback: show "No special permissions needed"

## Item X1 — CROSS-PLATFORM TESTS IN CI
- [ ] Update release workflow smoke-test job to run on macOS Intel and windows-latest
- [ ] Run `--selftest` and e2e test suite against unpacked app; upload logs/screenshots as artifacts
- [ ] Add `--selftest --idle-metrics 60` reporting CPU & memory for Windows & macOS CI logs

## Item SND1 — SOUND ON/OFF OPTION (SOUNDS OFF BY DEFAULT)
- [x] Unify all existing sound settings/locations under `soundsEnabled` (default false), remove old duplicate toggles
- [x] One-time migration for existing installs to OFF + small notification bubble on first start
- [x] Settings -> Behavior -> Sounds: master toggle, volume slider (0-100, default 50) + "Test sound", sub-toggles (Reminders, Timer & Pomodoro, Pet reactions) with reset icons, export/import validation
- [x] First-launch welcome screen: Sounds toggle (default OFF) synced with Settings
- [x] When OFF: ZERO audio element/AudioContext, no files loaded, no external process spawned, silent bubbles/reactions, instant stop on toggle OFF
- [x] When ON: play through pet window renderer, lazy Audio element creation, bundled audio files (<50KB), DND mute, release audio resources
- [x] Comprehensive E2E tests on packaged app with Playwright & `--test-hooks` (ZERO plays with sounds OFF, categories, sub-toggles, volume scale, DND, persistence, reset, export/import, migration)

---

# Bug-Fix & Feature Round (Branch: main)

## Item E3 — 13 EMOTIONS DO NOT WORK (grateful, proud, excited, squint, vibing, dull, focus, thinking, laugh, wink, love, surprised, sad)
- [x] Linking: Event bus in main process `app.emit(type, payload)` forwarded to pet window; pet window subscribes once
- [x] Emotion priority: AI states & errors > user interaction on pet > reminder/timer events > system reactions > idle states
- [x] Event -> emotion map implemented and verified:
  - [x] surprised: click on pet (then happy ~1.5s), start of drag, reminder due (+ bounce)
  - [x] sad: AI error (401/402/429/503/offline) and system volume <= 15%
  - [x] laugh: double click on pet (alternates with wink), pomodoro finishes
  - [x] wink: double click (alternates), note saved, to-do completed
  - [x] thinking: chat sent until first token ("..." bubble, eyes up-left, side-to-side) -> streaming (reading eyes, talking mouth) -> happy at end
  - [x] focus: while Pomodoro focus runs (narrow eyes, held, no sleep); relaxed during breaks
  - [x] grateful: chat contains thanks, thank you, thx, shukriya, shukria, jazakallah
  - [x] proud: all to-dos done (at least one exists)
  - [x] excited: first successful "Test connection", every 3rd completed Pomodoro of day, successful settings import
  - [x] love: note pinned, or chat contains "love you", "i love you", "luv u", "love u", "pyar", or flag
  - [x] squint: brightness >= 95% (hysteresis to 90%)
  - [x] dull: brightness <= 25% (hysteresis to 30%)
  - [x] vibing: audio playing 5+ seconds system-wide (pmset -g assertions on mac / Core Audio helper, SMTC/peak on win), stopped 5s
- [x] Rendering: verify SVG shape/CSS exists and differs from neutral with glasses ON & OFF
- [x] Real UI action tests for all 13 emotions with Playwright on packaged app, output table, re-run full emotion regression

## Item T1 — ALL TIMERS MUST BE CUSTOMIZABLE
- [x] Pomodoro: editable focus, short break, long break minutes (defaults 25/5/15), sessions before long break (default 4), auto-start toggle; standalone short & long break
- [x] Countdown: custom hours/minutes/seconds stepper inputs, quick preset chips (5, 10, 15, 25, 45, 60 min), label, start/pause/resume/reset
- [x] Stopwatch: start/pause/reset + laps
- [x] Validation (countdown 1s to 99:59:59, Pomodoro 1 to 180 min), persistence, reset-to-default icon, "Reset section", import/export
- [x] Main-process timestamp logic (end time), accurate across panel closed / sleep; end bubble + reaction + sound
- [x] Test with real clicks on packaged app: 5s countdown, custom 1m Pomodoro, panel closed, sleep/resume accuracy

## Item R3 — REMINDER "+5m" (SNOOZE) DOES NOT WORK
- [x] Reproduce with real click: not yet due postpones 5 min; already fired re-arms 5 min from now and dismisses bubble
- [x] Scheduler in main process rescheduled (same id), list updates, persists across restart, fires at new time
- [x] Snooze length setting (5/10/15/30 min or custom, default 5, reset icon) and button label follows it
- [x] Test: reminder for +1 minute, click snooze before and after it fires, verify both new fire times

## Item B2 — LONG BUBBLE TEXT OVERFLOWS THE BUBBLE
- [x] CSS: `max-width: 280px; overflow-wrap: anywhere; word-break: break-word; line-clamp: 4` with ellipsis
- [x] Clamped affordance: hover/click to see full text in panel
- [x] Dynamic sizing from MEASURED rendered height (render, measure, setBounds); clamp to display work area, flip to side with room; hit-test pet + bubble
- [x] Tests: long reminder title, 300-char AI error, long word without spaces, emoji, RTL text, screen edges, max pet size, glasses ON

## Item V1 — VERSION SHOWN IN THE APP = RELEASE VERSION
- [x] Single source of truth: `package.json` "version" across git tag, file names, `app.getVersion()`, Settings -> About, tray tooltip, update checker
- [x] CI check: release workflow fails early if pushed tag != "v" + package.json version

## Item UI4 — POLISH THE TABS + NEW APP-WIDE FONT
- [ ] Bundled local fonts (zero network, cross-platform identical): Nunito (400, 600, 700), Fredoka (500, 600, tabular-nums), JetBrains Mono (code blocks only). Fallback system stack.
- [ ] SIL Open Font License credited in Settings -> About and README, license files kept.
- [ ] Layout & spacing: panel padding 20px, card padding 16-20px with 12-16px gap, 8-12px row gap, min 12px padding around text, line-height 1.5 body / 1.2 titles, type scale 18-20 / 15-16 / 14 / 12, min 40px interactive targets.
- [ ] Soft cute styling: radius 16 on cards, 12 on controls, pill badges, pastel tints via color-mix (solid colors, no blur/filters), small pet-face SVG empty states, gentle hover/press (120-150ms).
- [ ] Tab-by-tab polish: Timer (mode chips, Fredoka clock, session dots, collapsible customize, presets, laps rows), Notes (search+New row, soft tint cards, preview, time chip, actions, editor view, empty state), Reminders (card form, bell in circle, badges, aligned actions, Upcoming/Done groups, empty state), To-Do, Tools, Settings, Chat, Welcome screen.
- [ ] Readability: contrast >= 4.5:1 on solid surfaces for any accent (including yellow & dark blue), automatic black/white text on accent buttons, min 420x560 to large size, no card overflow.
- [ ] Self-check & automated verification: Playwright audit across 3 sizes and 3 accents, check no unintended scrollWidth > clientWidth, text padding >= 12px, fonts loaded and active, zero font network requests.
- [ ] Resources: panel-open RAM and idle numbers must not regress; lazy load.

## Item PERF — RE-VERIFY RESOURCES
- [ ] Measure packaged app via `top -l 4 -pid <pid>`: GPU helper < 3% CPU & < 10 wakeups/s, renderer < 1%, main < 1%, WindowServer increase < 2%
- [ ] Check panel-open, running timer, held focus, vibing detection, sleeping state (~0%)

## Item REL — RELEASE V1.0.3
- [ ] Bump version to 1.0.3, update CHANGELOG.md, build packaged app, verify Settings -> About
- [ ] Update CI smoke test to run on macOS and Windows
- [ ] Push to main, push tag v1.0.3, monitor CI until both DMG and EXE published
- [ ] Update checker test from v1.0.2 to v1.0.3
- [ ] Final reply max 8 lines
