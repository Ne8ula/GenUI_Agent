# Week 4 Windows smoke test: future steps, none run

**Status: not run.** These are reproducible steps for the owner's Windows demo machine *after* the gated work exists: P1/P2 Weave packets, the renderer and desktop spike (W4-3), and native adapters. Today, Week 4 has only non-visual cores with mocks (see [CLOUD_REPORT.md](CLOUD_REPORT.md)). Ubuntu builds, mocks, unit tests and browser captures cannot satisfy any step below.

Use only **synthetic demo windows**, for example an empty Notepad file and an empty folder, listed in the local untracked allowlist. Never record real application content, titles or personal desktop images. Keep logs to counts, outcomes and timings.

## 0. Preconditions to record

- Revision/commit and build command; Windows version, GPU and driver, monitor count, resolution, scale (DPI) per monitor.
- Current wallpaper type for the demo monitor (static, slideshow, Spotlight, solid colour) and the global position mode. Record them on paper, **not** in the repository.
- Camera model, microphone, and the STT/TTS route with its new finite budget approval (Week 3's allowance is not inherited).
- Confirm the Week 4 private journal directory is empty before the run.

## 1. Consent and degraded modes

1. Launch Week 4. Confirm the consent screen lists microphone, camera and desktop staging, with **counts only** ("N approved windows on this monitor", "this monitor's wallpaper").
2. Decline each item in turn on separate runs. Confirm a labelled degraded mode each time: no camera means "head tracking off" with no mouse orbit; windows declined means windows left in place; wallpaper declined means a foreground-only scene.

## 2. Live speech and interruption

1. Say the opening request. Expect EVA's promise line, played from a reviewed take.
2. Interrupt EVA mid-line. EVA's voice should stop and construction should continue.
3. Say "Take me to Tokyo". Expect the honest line, with no change and no generation claim.
4. Say "What year is it?". Expect the framing line.

## 3. Construction minute, GPU and transparency

1. Watch the full minute. Note any phase that drags or stalls, and confirm there are no progress or loading cues.
2. Record frame-time and pose-to-frame distributions with generation idle (targets in planning §10 are proposals, not results).
3. WebView2 transparency: at arrival, hide the foreground (debug toggle) and capture the screen. Confirm the **wallpaper** is what shows behind, not an opaque renderer.

## 4. Head-coupled parallax and seams

1. Calibrate at the demo pose and enter the physical screen width.
2. Move through the full head-box corners (about ±12 cm lateral, ±8 cm vertical, ±12 cm depth). The cup should stay steady (zero parallax), while the street and façade shift.
3. Look for visible seams between the static wallpaper far field and the GPU foreground at every corner. Capture any seam.
4. Cover the camera for 2 s. The view should ease to neutral in about 0.8 s, then resume without a jump.

## 5. Wallpaper and window round trip

1. Complete the minute and confirm the approved windows moved to edge slots and the demo monitor's wallpaper changed **during phase D, under the veil**.
2. Ask for rain, then evening, then undo. The wallpaper should follow each variant, and the cup, table and ashtray stay put.
3. Say "Take me back". Expect a ~5 s deconstruction, then windows return to their exact placement and show state, and the wallpaper and global settings are restored.
4. Repeat, but press **Esc** mid-construction. Restoration should be immediate, with no speech prerequisite (target within 3 s, to be measured).

## 6. User-overridden state

1. During the experience, move one staged window yourself. On return it must stay where you put it, with a plain notice.
2. During the experience, change the wallpaper yourself. On return it must not be overwritten.
3. Close one staged window during the experience. Restoration must report it gone and must not act on a recycled handle.

## 7. Crash and watchdog

1. Force-kill the app mid-move (Task Manager). The watchdog restores under the same conditional rules.
2. Kill both app and watchdog, then relaunch. The leftover journal triggers recovery once, and running it again is a no-op.
3. Use the global restore hotkey and the tray item while the renderer is hung.
4. Lock the session (Win+L) mid-experience. Effects should pause and resume or restore without racing.

## 8. Multi-monitor and DPI

1. With two monitors at different scales, stage on one. The other monitor's windows and wallpaper must be untouched.
2. Change the DPI scale or unplug the second monitor during the experience, then return. Record the restoration outcome honestly, including any unresolved entries.
3. Confirm that slideshow, Spotlight, span or a solid-colour background selects "wallpaper skipped".

## 9. Reduced motion and owner questions

1. Run once with reduced motion. Expect a ~15 s arrival, parallax off by default, and windows moved under the veil.
2. Answer the emotional questions in [DESIGN_PROMPT.md §14](DESIGN_PROMPT.md#14-feedback-questions).

## 10. After the run

- The journal directory is empty after verified restoration. Any retained entries are disclosed.
- Record results in `docs/design/acceptance/w4-paris-arrival.md`, with status pending until the owner decides on that exact tested revision.
