# E1 transparent response

Revision `e1-20260924-01` · E1 · **owner acceptance pending**. Base HEAD `23e0450ebe497fdfcebf04cc77eb424b7bbffefa` plus uncommitted E1 implementation, evidence, and scoped documentation. No commit or publication was performed. The archived Week 1 remains unchanged.

## Review this candidate

- [18-second native demo](native/native-demo.mp4) · [full 35-second capture](native/native-demo-full.mp4) · [recording contact sheet](native/recording-contact.png)
- [Packaged native app on a light background](native/packaged-noon-light.png)
- [Eye and pinned comparison](native/eye-comparison.png) · [plain answer](native/plain-answer.png) · [after dismissal](native/dismissed.png)
- [Measured renderer comparison](MEASUREMENTS.md) · [final checks](checks/final-checks.json) · [exact source/build hashes](SOURCE_MANIFEST.json)

The short video trims only the empty tail; action timing is unchanged. The large labeled background panels are the separate test application, **not EVA's design or a wallpaper inside EVA**. The older `native/earlier-eye-*.png` files preserve light/dark/busy checks before the final eye-framing refinement; the recording and packaged screenshot show the final framing.

## Direction and lineage

The owner's successive refinements make composition primary, move it onto the actual desktop with genuine transparency and OS input pass-through, and require the actual Week 1 eye. See [the refinement](../e1-20260923-02/REFINEMENT.md), [DESIGN.md](../../../../DESIGN.md), and the [pending review](../../acceptance/e1.md).

Prior candidates remain preserved:

- [Original still concepts](../e1-20260917-01/authoring/brief.md): authoring references, not executable/native evidence.
- [Boxed before-state](../e1-20260923-01/README.md): browser and actual Tauri/WebView2 stills before the spatial refinement.
- `e1-20260923-02/browser-checks-01`: failed plain-answer disclosure attempt, retained rather than overwritten.
- `e1-20260923-02/browser-checks-02` and `browser-checks-03`: passing supplementary browser runs, retained separately.

No expressive E1 baseline is accepted. Reusing the accepted Week 1 eye does not accept this materially different composition.

## Implemented presentation

- Two transparent, undecorated Tauri/WebView2 windows occupy the display work area. The material window is permanently click-through. Rust clips the interaction window to a bounded union of actual local reading/control rectangles; CSS pointer rules alone are not the native mechanism.
- Independently positioned time/temperature anchors support actual pointer selection, dragging and pinning, with keyboard equivalents. Comparison preserves the existing positions. A small local EVA affordance reveals controls and full facts; there is no permanent full-window background or enclosing stage.
- Part-and-relate and Withdraw-and-reanchor use the same authored vocabulary and exact fixture. Rendering is on demand and bounded; explicit Stop freezes pending expression. Plain answer removes field, relationship line, and eye effects while retaining facts and scope.
- The actual procedural `week1/apps/desktop/src/SignalEye.tsx` eye is adapted in `experiments/e1/src/ui/eye/`: square pupil, red ordered dithering, and transparent silhouette/framing. Its global pointer/audio inputs and perpetual idle loop are removed. It follows explicit selected-anchor geometry through a bounded cue and remains noninteractive.
- Host-owned native messages are label/session/sequence bound and structurally closed. They expose only this app's geometry, scenes, status and dismissal; no desktop-content inspection, arbitrary OS target, shell, network connector or permission from model output.

## Fixture and conditions

`W-NYC-01` r1, seed `W-NYC-01-r1-seed-20261014`; invented New York City weather, America/New_York, 2026-10-14 as-of 08:00. Score schema `e1.response-score-proposal/1`; fixture schema `e1.weather-fixture/1`. The complete, missing-cloud and unavailable-location paths keep exact values, units, context and missingness. No live weather, runtime model, speech, ComfyUI or participant data is used.

Desktop evidence uses a **separate synthetic WinForms application underneath EVA**, clearly labeled as context, not a wallpaper drawn by EVA. Screen capture is restricted to its work-area rectangle and guarded before and after every frame against overlapping unrelated windows. Only reviewed captures are copied into the repository.

Observed primary setup: Windows 11, 2560×1440 display / **2560×1392 usable client area**, native DPI 96 / DPR 1. The taskbar's 48 pixels remain outside the overlay. WebView2 UA identifies Edge/Chromium 153.0.0.0. Additional dimensions/measurements are reported only where actually run. No macOS or native 150% scaling claim is made.

## Actual checks

| Check | Result / interpretation |
| --- | --- |
| Frontend type checks and unit tests | Final TypeScript/freshness checks passed; **49/49 tests** passed, including standalone-validator rejection checks |
| Earlier supplementary browser exercise | 26 checks passed, zero uncaught page errors; not native input proof |
| Native physical pointer routing | Passed: request, anchor selection, drag, pin, comparison; empty, decorative field and eye clicks reached the separate underlying process |
| Geometry continuity | Passed: actual native comparison retained the exact pinned afternoon position |
| Native eye lifecycle | Passed: real WebGL shader rather than SVG fallback, alpha context, bounded settling, explicit selection cue, Stop, reduced motion, plain removal/recreation |
| Native renderer failure | Passed: actual WebGL context loss fell back to Canvas2D; facts remained available |
| Native recorded exercise | Passed: movement/pinning/comparison, underlying-app click-through, focused Stop/Less motion/Plain controls, physical Dismiss, late-patch rejection and post-dismiss underlying input |
| Recording | Successful guarded native composite: 420 frames over approximately 35.01 seconds, nominal capture cadence 12 fps, no audio. Capture cadence is not renderer performance |
| Rust checks | Final tests **5/5**, format and clippy with warnings denied passed; packaged debug binary build passed |
| Packaged strict-CSP smoke | Passed **9 checks**, zero console/CSP errors: bundled native main/material, eye, fonts, alpha, absent dev harness/Inspector, missing-cloud and unavailable-location paths |
| Archive preservation | No Week 1 modifications |

Pointer actions use Win32 `SendInput`, not DOM click simulation. Keyboard shortcut checks use CDP targeted at the actually focused native WebView; this is distinct from a physical keyboard measurement. Frame distributions and input-feedback proxies belong in the separate measurement results, not inferred from the recording or deterministic controller trace.

## Failures and corrections preserved

- The recovered fixture schema initially failed Ajv strict compilation; nine measurement subschemas needed explicit object types.
- The first native build lacked a Windows icon; the unchanged archived standard Tauri scaffold icon supplies that resource, not an accepted EVA logo.
- A native launch was blocked by Application Control 4551. The owner reported disabling Smart App Control and requested continuation. No assistant security-setting change, signing purchase, or executable upload occurred. The same development build subsequently launched; it remains unsigned.
- The first browser plain-answer check failed because nested disclosure events could re-close the controls container. The event boundary and disclosure focus handling were corrected and retested.
- Review found opaque WebGL allocation, renderer quantization differences, benchmark cancellation/bounds gaps and edge reachability issues; those were corrected before the native exercise.
- The first recording helper failed to load a fully qualified drawing type. The native exercise itself passed; no video frames were saved. The corrected helper passed a short capture/encode check and the full recording.
- A subsequent recording attempt timed out on animation-frame-based readiness polling of a native window that was already ready. Interval polling passed on retest.
- A stress-load readiness attempt exposed a completion report that could be lost when renderer settings superseded it. Later settles may now report completion again, and status ordering is strictly increasing even within a coarse clock tick. Failed measurement output is retained; successful reruns are distinguished.

- The packaged frontend initially failed strict CSP because Ajv compiled schemas dynamically. Both validators now compile at build time into deterministic static modules; runtime semantic/authority checks remain intact, freshness is checked, and CSP was not weakened. The rebuilt native app passed its actual packaged smoke. The first physical packaged request probe was also moved after final font/layout readiness to avoid clicking a fallback-font box.

## Provenance and limitations

Observed Gateway routes: Astra/Terra/Sol/Luna through Codex; Sonnet 5 and Opus 4.8 through Anthropic. Native project Agent calls performed the work; advisory Ruflo routing was not evidence of execution. Sonnet supplied UI/eye modules, Sol the native bridge/region layer, Luna the initial fixture/probe, Terra source recovery, and Opus independent read-only reviews. Astra integrated the missing UI/native wiring, fixed findings, and ran verification.

The final validator worker subsequently received a weekly-quota HTTP 429 after its file handoff. Those files had already been integrated and independently passed the main session's 49 tests, build, and packaged native smoke. No worker retry or permission/routing change was used to finish verification.

The eye is owner-authorized reuse of local authored code; no external image or invented source-code license is introduced. Fonts include their OFL licenses and provenance in `experiments/e1/public/fonts/SOURCES.md`. No additional Higgsfield job was submitted; the prior three-still allowance was already reported used.

Native input uses bounded rectangular hit regions around actual local surfaces, not pixel-by-pixel alpha hit testing. Multi-monitor relocation, taskbar configuration changes, native 150% scaling and macOS remain unverified. The bundled production frontend's strict CSP was exercised successfully; timing measurements remain specifically development-frontend results. Captures and steady-state measurements precede the final build-time-validator-only change, which does not alter the eye/field drawing path; the packaged screenshot and final smoke identify the final build. The deterministic controller's `monotonicMs = sequence × 10` is synthetic event ordering, never latency evidence. No claim of model-generated co-design, perceived empathy or participant results is made.

## Owner decision

Use [the runnable experiment instructions](../../../../experiments/e1/README.md). Exercise the revised eye-inclusive candidate, then give accept / revise / reject for this revision. **Decision/date: pending.** No S1/S2 or later phase advances automatically.
