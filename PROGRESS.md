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
- [ ] Remove any sample notes / reminders pre-populated data

## Item 6 — AI: live models, no key-less calls, friendly errors
- [x] Retired model fallback list updated (remove `gemini-1.5-flash`, use `gemini-2.0-flash-lite` / first live model)
- [x] No model-list IPC calls triggered without a saved API key
- [ ] "Test connection" button in Settings → AI
- [ ] Friendly error on 503 with retry

## Item 7 — Small remaining items
- [x] "What should I call you?" name used in reminders & AI system prompt
- [x] Permissions screen: live Granted/Not Granted + deep links (Accessibility, Screen Recording, Automation)
- [x] Accent color picker recolors everything (pet window + panel)
- [x] Lite mode completely removed (toggle + auto-lite logic)
- [x] Dev/test material removed (console logs, test buttons, debug UI)
