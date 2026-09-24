# E1 synthetic desktop fixture

These scripts are a bounded Windows-only probe for the E1 transparent-overlay check. They use PowerShell 5.1, WinForms, and Win32 APIs already present on Windows; they do not install dependencies, inspect other applications' content, use DOM/CDP pointer input, or connect to a service. Limited window class/geometry/ownership metadata is checked to refuse input or capture when an unrelated window overlaps the controlled test surface.

## Start the synthetic underlay

Create a caller-owned scratch directory first, then run from the repository root:

```powershell
powershell.exe -NoProfile -File .\experiments\e1\scripts\desktop-fixture.ps1 `
  -StatePath C:\path\to\scratch\e1-fixture-state.json `
  -Mode light
```

`StatePath` is required and has no public-path default. The script prints one readiness JSON object containing the process id, window handle, work-area bounds, and exact title, then keeps the fixture open. The visible surface is synthetic and says `Synthetic desktop test background — not EVA`.

The default fixture is a normal, activated, borderless work-area-sized window. Keys `L`, `D`, and `B` select light, dark, and busy-neutral modes. `Escape` closes it. `-TopMost` is available only when preparing a controlled backdrop; do not use it for the overlay probe unless it is disabled before probing.

## Send bounded OS input

Use the process id and state path from the readiness/state file. Coordinates are physical screen coordinates and must be inside the fixture client area:

```powershell
powershell.exe -NoProfile -File .\experiments\e1\scripts\desktop-probe.ps1 `
  -FixtureProcessId 12345 `
  -StatePath C:\path\to\scratch\e1-fixture-state.json `
  -Action Click -X 900 -Y 500
```

A bounded drag uses twelve intermediate points:

```powershell
powershell.exe -NoProfile -File .\experiments\e1\scripts\desktop-probe.ps1 `
  -FixtureProcessId 12345 `
  -StatePath C:\path\to\scratch\e1-fixture-state.json `
  -Action Drag -StartX 700 -StartY 450 -EndX 1100 -EndY 650
```

Before `SendInput`, the probe checks the supplied process id, exact `MainWindowTitle`, HWND ownership/visibility, DPI-aware client bounds, and every endpoint. It also checks that the visible hit target belongs to the fixture or the explicitly supplied E1 process. Drags use twelve bounded 16 ms-spaced steps so pointer capture can be established. A failed ownership/bounds check sends no further movement; a held button is released in cleanup.

Pass `-E1ProcessId <pid>` when interacting with or capturing the overlay. Its executable path is validated against this experiment's debug binary.

Useful optional controls are narrowly scoped:

- `-BringFixtureToFront` raises only the validated fixture without forcing foreground activation.
- `-PrepareFixture` briefly raises that owned backdrop, activates it through a real click at its safe corner, and restores it to a normal non-topmost window before tests. That preparation click is reported separately and is not evidence of overlay pass-through.
- `-FixtureMode light|dark|busy-neutral` sends only the corresponding owned-fixture mode key and waits for its state acknowledgement.
- `-Action Capture` performs no test mouse gesture; use it for guarded captures or mode changes. Add `-PrepareFixture` explicitly if preparation is required.
- `-RaiseE1ProcessId <pid>` raises all visible top-level windows for a process only when its image path ends in `experiments\e1\src-tauri\target\debug\eva-e1.exe`.
- `-DisableFixtureTopMost` changes only the validated fixture HWND from topmost to normal before a probe.
- `-EscapeFixture` posts Escape directly to the validated fixture HWND and performs no mouse operation.
- `-TracePath <scratch-file>` writes one bounded JSON operation record.

The probe does not capture by default. Add `-ScreenshotPath C:\path\to\scratch\e1-overlay.png` only when the caller explicitly wants a PNG of the fixture's exact primary work-area rectangle. Before and after capture, it rejects visible, non-cloaked, unrelated windows above the fixture. It does not read those windows' content or titles. Keep outputs in caller-provided scratch for review before copying to repository evidence.

`record-native.ps1` applies that guard to every frame, records actual capture timestamps, and encodes with an already-installed FFmpeg. It emits readiness only after its first guarded frame is saved. `record-native-demo.mjs` starts it and drives one bounded exercise without separate tool-focus changes during recording. Capture cadence is not renderer performance; the benchmark runs separately with recording off.

The fixture state contains mode, work-area/client bounds, process id, HWND, MouseDown and Click counts, last client/screen point, key count, and no unbounded event history.
