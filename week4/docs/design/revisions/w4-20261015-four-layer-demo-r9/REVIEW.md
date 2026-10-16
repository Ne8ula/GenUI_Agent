# Four-layer Paris demo

Status: runnable visual demo; owner acceptance pending. Source `565b5ad`. Accepted baseline: none.

**Open:** http://127.0.0.1:1440/?scene=paris-r8 · **Settled preview:** http://127.0.0.1:1440/?scene=paris-r8&t=30000

Launch: `npm --prefix week4 run app:dev`. Use Replay, Layer, Pause/Resume, Jump to idle, or Escape.

[Actual real-time recording](implementation/after/runtime-01/four-layers-and-idle.webm) · [Settled capture](implementation/after/runtime-01/frame-30000.png) · [Checks](implementation/after/runtime-01/checks.json)

## Selected reference packet

[Current R8 brief](../w4-20261015-paris-chatgpt-r8/FOUR_LAYER_IMPLEMENTATION_PROMPT.md), [owner-selected composition](../w4-20261015-paris-chatgpt-r8/references/images/owner-video-selection/img-06-owner-selected.png), and its four stage stills inspected locally before edits. Run-01 temporal sheet and Seedance run-03 quarter-second people sheet inspected: anchored architecture, slowly changing glyph coverage, four figures, connected foreground hands. Temporal-sample inspection, not continuous playback. R8 records actual generation, costs and temporary route waiver; no new generation/spend.

Main owns Rust procedural composition, materials and integration. Scope: additive four-layer visual demo and idle only. Owner's subsequent time-priority instruction defers expanded features and exhaustive verification. Preserve Seed-33.

Implementation interpretation: sparse entity-bound detection → monochrome surface islands → local traveling marks → warm fragmented material surfaces with blue/magenta accents. Author 0/7/14/21/30-second boundaries; selected videos do not demonstrate construction timing. Geometry/materials are authored without source pixel sampling. Foreground pair takes bounded steps, then rests; explicit replay rather than a forced walk loop.

## Before

[Seed-33 before, 1672×941, DPR 1](implementation/before/seed33-1672x941.png), actual Chromium/WebGL2 capture. No runnable prior four-layer fixture exists.

## Verification

Passed: 21 Rust renderer tests, 207 app tests, integrated TypeScript check, WASM build, Vite production build, and 14 browser capture assertions. Eleven exact-time frames cover 0/3.5/7/10.5/14/17.5/21/25.5/30/34/39 seconds. Real-time recording runs past 41 seconds; Escape stops it. Reduced-motion canvas pixels remain identical across time; scene-image/video/revision requests were blocked and none were attempted. Main also exercised layer selection at 17.5 seconds and repeated Replay, including replay from an already-zero start value. No page errors in the capture run.

Inspected actual [detection](implementation/after/runtime-01/frame-03500.png), [flow](implementation/after/runtime-01/frame-17500.png), [settled](implementation/after/runtime-01/frame-30000.png) and [idle](implementation/after/runtime-01/frame-34000.png) captures. Composition is recognizable but deliberately described as a **stylized relief demo**, not a close photoreal match. Figures are mannequin-like; naturalistic gait, cloth physics and fine material fidelity remain incomplete. Motion is three short steps then rest, not a seamless walk loop. The optional illustrative detail panes were omitted. Legacy diagnostic counters still describe particles/tiles, not the new shader-cell coverage; do not interpret those as R8 occupancy measurements.

The first mesh exceeded the unchanged vertex budget; leaf tessellation was reduced and tests passed. An initial shader reserved-word compile error was corrected and the actual browser shader passed. `debug-settled-01.png` is the preserved legacy-scene diagnostic; `debug-rust-direct-02.png` is a direct Rust smoke render before host integration. Only `runtime-01/` is the final integrated host evidence.

Changed source: `renderer/src/paris.rs`, `gpu.rs`, `materials.rs`, `lib.rs`; `app/src/RustApp.tsx`, `host/{RustStage,FixtureControls}.tsx`, `host/params.ts`; `app/tests/host-params.test.ts`; `app/scripts/capture-paris.mjs`. This review/provenance and phase index also changed. Existing dirty planning/reference changes were preserved.

Main: harness Astra, Rust author/integrator. Native Terra-configured read-only researcher audited the host. Native Sonnet-configured UI worker supplied isolated host changes; main corrected repeated replay and integrated layer checkpoints. Independent backend-route metadata was not correlated. Worker worktree was created from an unrelated base, so only the five reviewed file diffs against `565b5ad` were integrated, never the worktree branch/index wholesale.

Deferred under the owner's time-priority instruction: exhaustive accessibility/failure/resize testing, full workspace `check`/broker suite, native WebView2 and broader flow. No performance distribution benchmark claimed. Retest: Replay → inspect four Layer checkpoints → Jump to idle → watch the pair step → Escape. Owner acceptance remains pending. No commit or publication.
