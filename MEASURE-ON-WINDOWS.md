# Measuring Performance on Windows (Desktop Pet)

This document describes how to run Desktop Pet on Windows, measure idle resource consumption and wake-ups, and understand the verification boundaries between macOS and Windows.

---

## 1. Running Desktop Pet on Windows

### Installation
1. Download `Desktop-Pet-<version>-win-x64.exe` from the GitHub Release.
2. Run the installer:
   > **Note on Windows SmartScreen**: Because Desktop Pet is an open-source, community-distributed application without a paid Microsoft EV Code Signing certificate, Windows SmartScreen may show an alert on first launch.
   > Click **"More info"** and then select **"Run anyway"**.
3. Desktop Pet will install to your local user directory (per-user NSIS install, no admin privileges required) and create a Desktop shortcut and Start Menu shortcut.

### Diagnostic Mode (`--selftest`)
To run the automated verification suite on Windows from PowerShell or Command Prompt:
```cmd
"C:\Users\<User>\AppData\Local\Programs\Desktop Pet\Desktop Pet.exe" --selftest
```
Output will report:
- `secure-store`: PASS (DPAPI / safeStorage verification)
- `pet-renderer`: PASS (Vector geometry & 25 emotions)
- `audio-assets`: PASS
- `system-sensors`: PASS / UNAVAILABLE (Graceful fallback)
- `context-sensor`: PASS / UNAVAILABLE (Graceful fallback)
- `update-checker`: PASS (Semver math & platform asset picker)
- `OVERALL`: PASS (Exit code 0)

---

## 2. Resource Budgets at Idle

When the pet is sitting idle on your desktop and the cursor is not moving:
- **Desktop Pet Helper (GPU)**: `< 3% CPU`, low cycle delta
- **Desktop Pet Helper (Renderer)**: `< 1% CPU`, `< 10 wake-ups/sec`
- **Desktop Pet (Main Process)**: `< 1% CPU`
- **Memory**: `< 150 MB` total combined across processes

---

## 3. How to Measure Idle Consumption on Windows

### Method A: Sysinternals Process Explorer (Recommended)
1. Download and run **Process Explorer** (Sysinternals / Microsoft Learn).
2. Locate the process tree under `Desktop Pet.exe`.
3. You will see:
   - `Desktop Pet.exe` (Main process)
   - `Desktop Pet.exe` with `--type=gpu-process` (GPU helper)
   - `Desktop Pet.exe` with `--type=renderer` (Pet and panel renderer)
4. Right-click columns -> Select Columns:
   - Check **CPU**, **CPU History**, **Cycle Delta**, and **Context Switch Delta**.
5. Leave the mouse still for 30 seconds and observe:
   - GPU process CPU should remain below 3%.
   - Renderer process CPU should remain below 1%.
   - Main process should be ~0%.

### Method B: Windows Performance Monitor (`perfmon`)
1. Press `Win + R`, type `perfmon.exe`, and press Enter.
2. Click **Performance Monitor** under Monitoring Tools.
3. Click the green `+` (Add counter):
   - Counter: **Process** -> `% Processor Time`
   - Instances: Select all instances of `Desktop Pet`.
4. Add another counter:
   - Counter: **Thread** -> `Context Switches/sec` for `Desktop Pet` instances.
5. Monitor average values over 2 minutes with mouse stationary.

### Method C: PowerShell CLI
Open PowerShell and run:
```powershell
while ($true) {
    Get-Process "Desktop Pet" | Select-Object Id, ProcessName, CPU, WorkingSet64 | Format-Table -AutoSize
    Start-Sleep -Seconds 2
}
```

---

## 4. Verification Status (macOS vs Windows)

| Feature / Subsystem | macOS Intel / Apple Silicon | Windows x64 |
| :--- | :--- | :--- |
| **Packaging & Executable** | Verified on macOS | Verified via CI build artifact |
| **Idle Budgets (CPU/Wake-ups)** | Verified live via `top` (GPU <1%, Renderer <1%) | Verified via CI smoke test; **UNVERIFIED on physical Windows machine** |
| **Vector Pet SVG & Animations** | Verified | Verified in Chromium / CI |
| **All 25 Emotions & Blinking** | Verified | Verified in Chromium / CI |
| **Round Glasses Overlay** | Verified | Verified in Chromium / CI |
| **Data Import / Export** | Verified | Verified via Node/Electron file system APIs |
| **Update Checker (Asset Picker)** | Verified (macOS Intel `.dmg`) | Verified (Windows `.exe` picker logic in CI) |
| **System Sensors (Volume/Battery)** | Verified live | Graceful "Unavailable" state verified in `--selftest` |
| **Screen Lock / Unlock Greeting** | Verified (Removed completely) | Verified in code |
| **Real Shutdown Goodbye** | Verified | Uses `session-end` BrowserWindow event; **UNVERIFIED on real Windows shutdown** |
