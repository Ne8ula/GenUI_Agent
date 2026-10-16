# Living Paris

Status: **browser candidate ready for owner retest; owner acceptance pending.**

**[Open living Paris](http://127.0.0.1:1440/?scene=paris-arrival)** · [Eye before/after](implementation/after/production-02/eye-comparison.png) · [Actual 12-second idle recording](implementation/after/production-02/living-paris-realtime.webm) · [Refined eye construction recording](implementation/arrival-regression/eye-to-paris-realtime.webm)

Launch: `npm --prefix week4 run app:dev`, then `?scene=paris-arrival`. Submit the prefilled question or use Skip to Paris. The `?scene=paris-scan` route remains the intentionally static comparison.

[Selected shape board](references/images/af011534/eye-and-paris.png) · [Selected idle study](references/videos/66b5d15b/idle-motion.mp4) · [Temporal samples](references/videos/66b5d15b/temporal-samples.png) · [Native-size surface samples](references/videos/66b5d15b/surface-detail.png) · [Contact sheet](references/contact-sheet.png)

[Before eye](implementation/before/eye-qhd.png) · [Before Paris](implementation/before/paris-qhd.png)

## Scope and references

Owner: “Can the scene be constantly moving after it is settled. Also can you make the eye a bit more formless rather than just a rectangle.” Continue the R13 arrival and R12 original-color scan. Keep camera, architecture, people silhouettes, sample anchors and original color data; no walking people, new composition, microphone, runtime provider or native desktop effects.

The owner separately approved **8 credits** for one GPT Image 2.5 Sunburst/high shape board, prediction `af011534-bafc-413c-9830-0d3a38c85601`, and **82 credits** for one silent five-second Kling 3 Pro idle-motion study, prediction `66b5d15b-2661-44bf-a64c-00e29ac22489`. Both completed once. Total 90 Weave workspace credits; no retry allowance. Exact actual submitted inputs are in `runs.json`; these are direct-model calls through the official Figma Weave connection. Existing synthetic eye and Paris frames are conditioning inputs, not new-reference substitutes.

Main inspected the actual new board: the eye is a red irregular cloud centered on its iris/square pupil, with broken lid arcs and thinning detached points, rather than a skin rectangle. Select that boundary/coverage vocabulary; retain the canonical eye equations beneath it. The board modifies Paris details/figure arrangement: exclude those changes and preserve current data.

Main inspected quarter-second video samples plus native-size surface crops. Macro geometry stays nearly fixed; local surface texture varies subtly. The effect is very restrained at overview scale; use it for quiet continuous surface life, not as proof of measured trajectories, seam-free loops or naturalistic people. No walking/camera motion is implemented. Full-speed playback was not inspected. Runtime amplitudes and timing will be authored and checked in actual captures, not asserted as measurements from the generated clip.

## Bounded implementation contract

- Remove most surrounding eye tissue using anatomy-aware, irregular point selection around iris/lid arcs and a soft sparse halo. Preserve its red palette and black square pupil; do not replace it with an orb. No new eye-idle choreography is needed for this shape refinement.
- Give the completed arrival a separate idle clock. Local particle drift and slight coverage variation continue after 30 seconds without resetting construction, changing source colors or moving whole objects. Keep defining edges/people regions protected and excursions small.
- Pause/Escape freezes both clocks; Resume continues; Return to eye resets both. Less motion gives the exact static representative scene. Deterministic capture can set construction and idle times independently.
- Maintain the original `paris-scan` static comparison route, all resource bounds and failure behavior. Reuse buffers; avoid indefinite per-frame React updates by throttling only displayed clock values, not GPU motion.
- Preserve matching QHD before/after and actual motion recordings; test continuity past the prior 60-second clamp, pause/resume/reset, reduced motion, deterministic seek and exact source-frame preservation at idle zero.

Design: keep the current stage, fonts and controls. Change the eye's visual boundary, not its surrounding interface; enable the existing Pause/Resume control after completion. Main owns the bounded arrival/shader/test edits. No phase acceptance or commit follows these checks.

## Implementation and executed verification

- Eye selection now follows the canonical iris/lid anatomy with sparse irregular falloff instead of retaining the surrounding rectangular tissue. It has **4,810 samples**, down from 19,232, and preserves an explicit dark square pupil. Canonical source equations remain untouched; filtering is an intentional new rendition. Fewer eye particles seed the first construction stage, but the 30-second construction schedule and all 109,593 Paris destination samples remain.
- The arrival continues automatically in a separate `idleSeconds` clock after construction reaches 30s. The shader applies bounded surface-local drift and mild coverage variation to a minority of points. Most edges and explicit figure regions stay fixed. Its authored harmonic phase repeats without restarting construction; it does not stop at the old 60s cap.
- Pause/Escape freezes construction and idle clocks exactly. Resume does not rewind; Return resets both. Less motion immediately provides the exact static source scene and disables Resume. Hidden frames do not advance or render; React publishes construction clock text at at most 10Hz and does not continually rerender during settled life.
- Fixture API: `window.__evaArrival.seek(constructionSeconds, idleSeconds)` pauses at that deterministic pair. Idle time is ignored before construction completion and under reduced motion.

**Passed:** full app typecheck, **226 app tests**, WASM prebuild and production build; **23 living-scene browser checks** plus **22 arrival regression checks**. These include automatic continuous idle, pause/resume, times61/120/121, deterministic phase wrapping, fixed figure-region pixels, original-frame equality at idle zero, reset, reduced motion (local/OS), resize, resource bounds, context-loss retry and no runtime image/video/external fetch. [Living checks](implementation/after/production-02/checks.json) · [Arrival checks](implementation/arrival-regression/checks.json) · [Current source hashes](implementation/final-source-manifest.json).

Actual QHD frame comparison at idle15s versus idle0 changes **132,685 of 3,686,400 pixels** (about3.6%); this verifies restrained visual activity, not FPS or reconstruction quality. [Pixel measurements](implementation/after/production-02/pixel-variation.json). Both tested foreground and rear-figure regions remain pixel-identical. Source positions/colors are unchanged in the asset binary. Typed vertex-array payload is **5,472,872 bytes**, not total GPU/process memory. At most three geometries/draws during construction, one draw in settled life, zero image textures.

Main inspected the actual eye before/after, idle frames and [recorded temporal samples](implementation/after/production-02/temporal-samples.png); full-speed motion judgement remains for the owner. A separate full construction recording covers the smaller eye handoff. No native/WebView2 or measured GPU-FPS claim. Rust/core suites were not rerun; their source is unchanged.

### Retained corrections and limits

The first focused eye test found four source highlight samples inside the intended black pupil; the new selector explicitly preserves the inner square hole. The first browser attempt failed compilation because GLSL reserves `active`; the new variable was renamed and shader diagnostics now include the actual compiler log. `candidate-01` retains that failed capture report. A capture-script parenthesis error and a scratch PowerShell quoting error were corrected before successful browser verification. `candidate-02` and production pass all checks.

Motion is deliberately subtle, not walking people or moving architecture. The eye is sparser than the generated board; exact reference recreation is not claimed. This remains an authored image-derived 2.5D scene, not genuine reconstruction, trained 3DGS, LiDAR or SLAM. No new voice, camera, desktop effects or runtime generation.

Changed implementation: `arrival/{samples.ts,timeline.ts,construction.ts,ArrivalApp.tsx}`, optional idle transport in `scan/renderer.ts`, new `tests/living-paris.test.ts` and `scripts/capture-living-paris.mjs`, plus the updated arrival regression driver. Seven before-source files were preserved with before captures. Main harness-configured Astra used file tools, Node/TypeScript, Three.js/WebGL2, Playwright/Chrome, Python/Pillow and FFmpeg. Native Opus-configured reviewer (runtime-reported `claude-opus-4-8[1m]`, not independently correlated with provider logs) found a GLSL portability defect: `pow` with a negative sine base is undefined on some drivers. Main replaced it with explicit multiplication and reran 14 focused tests, the build and all23 living-scene checks with a fresh recording. Fixed-time eye/idle0/idle5/idle15 captures are pixel-identical before/after that correction on the tested browser. The earlier shader and evidence are retained under production-01; production-02 and the final source manifest are current. Review was static only, not aesthetic acceptance or cross-driver testing. Remaining nonblocking notes concern hypothetical very-long JS-clock precision and the previously guarded fixed-pack target permutation.

Owner retest: refresh the arrival page, inspect the loose eye, then submit or skip and watch the scene beyond settlement. Pause with Escape, resume, and enable Less motion. **Visual acceptance remains pending.** No commits, publication or phase advancement.
