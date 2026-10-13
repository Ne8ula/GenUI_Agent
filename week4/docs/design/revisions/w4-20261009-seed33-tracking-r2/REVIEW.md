# Seed-33 corruption and tracking R2

**Status: candidate 2 integrated and technically verified; ready for owner visual retest. Owner acceptance: pending.**

## Watch candidate 2

- [Full scene — 11 seconds AFTER formation](implementation/after/candidate-2/webgl2-post-formation-stepped-11s.mp4)
- [Close-up — the same 11 seconds](implementation/after/candidate-2/webgl2-post-formation-closeup-11s.mp4)
- [Actual real-time browser recording](implementation/after/candidate-2/realtime/7704855c26666a45d1e79bb3ff6b5d7b.webm)
- [Matched before / after at 17 seconds](implementation/after/candidate-2/before-after-17000.jpg)
- [Full-scene temporal samples](implementation/after/candidate-2/motion-full-samples.jpg) / [close-up samples](implementation/after/candidate-2/motion-closeup-samples.jpg)
- [Capture checks](implementation/after/candidate-2/checks.json) / [pixel comparisons](implementation/after/candidate-2/pixel-analysis.json) / [77-file candidate manifest](implementation/after/candidate-2-source-manifest.json)

The MP4s contain 166 actual browser screenshots at 15fps, host/life clock 12000→23000ms, independently decoded in full. They show intended fixed-time motion, not real-time performance. The separate real-time recording covers 12.024 wall seconds (host 12308.5→24329.9ms). Main inspected matching full-size stills and temporal samples, **not full-speed playback**. Detached MP4 capture reported an unknown process exit after completion; its complete report says `ok:true`, all31 checks pass, and complete media were verified independently.

## Fresh references

- [Contact sheet](references/contact-sheet.png)
- [Image 01 — selected for localized raster/outline geometry only](references/images/img-01-corruption-tracking.png)
- [Video 01 — rejected: weak, almost static tracking, insufficient raster corruption](references/videos/vid-01-text-only-rejected.mp4)
- [Video 01 temporal samples](references/videos/vid-01-temporal-samples.jpg)
- [Video 01 100ms detail samples](references/videos/vid-01-detail-samples.jpg)
- [Video 02 — selected only for persistent local raster/edge treatment](references/videos/vid-02-image-conditioned.mp4)
- [Video 02 temporal samples](references/videos/vid-02-temporal-samples.jpg) / [100ms detail samples](references/videos/vid-02-detail-samples.jpg)
- [Provenance](provenance.json)

## Scope and owner direction

2026-10-09, Week 4 Seed-33 post-formation overlays only. Source: `e43c7aedb2690c8b9edc3e2446f1d1f584897a5d` plus the existing dirty tree. The preceding formed-glitch candidate is **rejected**, not an accepted baseline. Preserve the strand construction, loading outside the overlays, composition, figure approach/exit, clocks, pause, tile visibility and both Canvas2D/WebGL2 paths. No commits, phase advancement or inferred acceptance.

Owner selected localized saturated RGB/channel separation (keep the base scene warm), and attachment to person/cup/furniture/architecture features as well as accent groups. Geometry and motion must run live in code; neither reference movie is a runtime asset. The current underlying scene is reference-textured with live construction geometry, not a fully procedural particle reconstruction.

## Primary-source inspection

- [Original GIF](../../../../../week3/pivot_references/0268915e2cc8124b9d5b9c99545f8736.gif): 540×511, 19 frames, each 60ms; total 1.14 seconds. All 19 frames inspected in a temporal sheet, with a native-size 540ms detail. Long horizontal image-row stretching, repeated offset fragments/contours, broken silhouettes, saturated channel separation; corruption present in every frame. Do not copy its rapid full chromatic turnover as a safety requirement.
- [Original video](../../../../../week3/pivot_references/From%20Klickpin.com-%20Minimal%20small%20business%20branding%20ideas%20that%20help%20you%20create%20a%20polished%20look%20with%20very%20simple%20and%20affordable%20details%20for%20women%20wh.mp4): 720×720, 30fps, 45 seconds. Inspected overview samples every two seconds, 100ms sequences at 3.0–4.1s, 15.0–16.1s and 29.0–30.1s, and native-size 3.3s frame. Mixed-size tracking rectangles, X diagonals, sparse connecting hairlines, clusters reconfiguring around features. Density varies from sparse holds to dense reacquisition. Video also morphs subjects; do not copy that into this bounded overlay pass.
- Inspection limitation: sampled-frame analysis, **not full-speed playback**. Extraction used local Pillow/OpenCV; original media unchanged.

## Current-versus-target findings

Current `matrixTiles.ts` overlays are additive source-texture cells/half-strip substitutions restricted to tile regions: 4×4 grid, up to six-pixel offset, 280ms burst / 1300ms rest. No dedicated feature-tracking network of crossed rectangles and rewiring connectors. Existing recorded close-ups were inspected; they remain visually solid swatches with minor offsets.

Replacement intent: shared deterministic feature-bound overlay plan combining source-sampled horizontal tears, displaced fragments, contour repetitions and local RGB edges with irregular mixed-size crossed tracking rectangles and sparse connectors. Independently staggered, held/reacquired local events must remain visible indefinitely after formation, rather than globally settling. Do not make arbitrary full-screen random noise. Reduced motion gets a fixed representative composition; no changing geometry, opacity or sampled regions over time.

## Fresh Weave inspection and selection

Both runs used direct official Figma Weave model calls, separately quoted and explicitly approved via structured questions. Image: 5 credits. First video: 90 credits. Initial batch spend: **95 Weave credits**. No inherited allowance; the corrective run below was separately approved. No local reference upload occurred; inputs were task-specific text briefs based on actual local inspection.

Image 01 (2752×1536) visibly supplies pronounced horizontal fragments around a figure, isolated RGB contour splits, varied thin tracking rectangles/Xs and a useful furniture detail cluster. **Select those geometry/material aspects only.** Its cafe composition, person, decorative wall panels and collage layout are invented; none replaces the Seed-33 scene. Whole-scene tracking is somewhat sparse relative to the original video.

Video 01 (1280×720, 24fps, 241 frames, 10.042s) was inspected at 500ms intervals across the duration and at 100ms from 4.0–5.1s. It produced a different cafe/person with faint outlines and little visible corruption. **Rejected for motion guidance.** Generation completion is not fidelity. Do not implement its static/weak result.

The corrective image-conditioned 10s Kling video was separately approved at 90 credits and completed as `a5f2eba0-9461-4a83-9928-bc750ad40d57`. It reuses Image 01's output, with no local-media upload. Total charged spend: **185 credits**. Inspected 500ms samples across 10.042s, 100ms samples from 4.0–5.1s, and native-size 6.0s. **Select only the persistent local horizontal smearing and RGB edge treatment.** Its tracking boxes are too stable and its source-image drift is unwanted; reject those aspects. This is not a successful recreation of both original references. Original GIF/video remain primary for tearing and cluster topology/cadence. No additional generation allowance.

## Bounded implementation handoff

- Reference priority: original GIF for horizontal stretching, repeated contours and raster breakup; original video for mixed-scale crossed boxes, feature attachment, connectors and changing topology. Fresh image for localized warm-scene/RGB integration and geometry; fresh Video 02 only for persistent local raster treatment, not its slow/static tracking or image drift.
- Keep the current source-textured scene and approved loading/strands untouched. Start the replacement system at global formation; do not rebuild the whole scene. Track existing figure transform and hide its feature marks when it leaves, rather than pinning a ghost to its old location.
- Shared pure deterministic plan, using the supplied host clock/seed for both backends. No wall-clock/random mutable history, model calls, external assets or movie playback in the renderer. Replace the rejected post-formation cell jitter; do not just add larger offsets to it.
- Construct rectangles with wide aspect/size distribution, some crossed, sparse connections and independently changing membership. Use feature-local holds/reacquisition rather than synchronized all-screen flicker. The original 60ms GIF frames inform abrupt local changes, not a requirement for global chromatic flashing; keep most of the scene readable and stable.
- Source-sample thin long horizontal ribbons plus occasional larger fragments and repeated edge traces. Tint/separate local RGB channels only; do not blanket-fill neon rectangles. Both Canvas2D and WebGL2 must visibly implement the same system.
- Existing tile visibility control hides the new accent/feature overlay system as well. Pause freezes it. Reduced motion uses a fixed representative overlay composition independent of time (not merely a slower animation).
- Planned worker ownership: new shared post-formation helper and focused tests; necessary `canvas2d.ts`, `webgl2.ts`, shared render command/consumer seams. Do not change host clocks, App controls, approved strand generation or public textures without escalation. Main owns evidence, capture tooling, integration and final verification.
- Before-state: [17s WebGL2](implementation/before/matching/webgl2-formed-17000.png), [Canvas2D](implementation/before/matching/canvas2d-formed-17000.png), [construction/control report](implementation/before/construction/checks.json), [matching report](implementation/before/matching/checks.json), [92-file source manifest](implementation/before/source-manifest.json). Actual browser runs passed 144 construction/control checks with 25 captures and 16 exact clock/backend captures. No performance or aesthetic-fidelity claim follows.

## Execution and ownership

Main session: `claude-gpt-6-astra[1m]`; local tools inspected source media. Native `eva-researcher` (`claude-gpt-5.6-terra[1m]`) performed a read-only audit using Read/Glob/Grep. Native `eva-ui-designer` (`sonnet`) owns implementation in an isolated worktree based on the frozen dirty-source snapshot. Gateway route metadata for this session confirms Codex `gpt-6-astra`, Codex `gpt-5.6-terra` and Anthropic `claude-sonnet-5`; no `CLAUDE_CODE_SUBAGENT_MODEL` override was present. Route metadata establishes transport/model routing, not visual quality. Ruflo `hooks_route` was advisory only.

## Implementation and verification

Development started in the isolated UI worktree. **Attempt 1 was rejected by main before integration for unmet brief requirements**, despite worker-reported 185 passing app tests/typecheck/build: actual 17s full-scene capture and source showed flat colored edge strokes rather than channel-filtered source imagery, isolated smooth bands rather than layered broken scanlines/contour echoes, and 1.6–3.2s box holds with only 1–2 boxes per feature rather than changing clusters. Correction requested within this same bounded pass/reference packet; no new generation. Preserve attempt-1 source/captures, add real source-channel filtering, layered raster/edge fragments, feature-local cluster acquisition and correct accent-drift attachment. No visual-completion claim.

### Integration and checks

Candidate 2 implements source-channel-filtered raster fragments (Canvas SVG color matrices / WebGL texture tint), disjoint independently refreshed rows and echoes, mixed-size local box/X clusters with acquisition/dropout, nearby connectors and drift/figure-pose attachment. The new plan is live code. No generated reference bitmap/movie was adopted as a new runtime asset. Existing reference-textured background/foreground/figure/tile assets remain unchanged.

**Changed source/test files (seven):** `week4/app/src/scene/postFormationOverlay.ts` (new), `scene/constructionTypes.ts`, `render/constructionCanvas.ts`, `render/constructionWebgl.ts`, `render/canvas2d.ts`, `render/webgl2.ts`, and `tests/postformation-overlay.test.ts` (new). Paths after the first are relative to `week4/app/src/`, except tests, relative to `week4/app/`. Main additionally changed the phase index/acceptance notes and this new evidence folder. Existing dirty source changes were preserved with pre-copy hash guards; [integration checks](implementation/integration-checks.json) match all77 recorded candidate source/assets, with only five pre-existing files changed and two new source/test files. `matrixTiles.ts`, `seed33Construction.ts`, core and public textures are unchanged from before.

Actual final checks:
- `npm --prefix week4/app run check`: app typecheck, **191/191 tests**, production build passed in both the isolated candidate and integrated checkout. Core tests were not rerun (core unchanged); historical core103 is not new evidence.
- [31 matching capture checks](implementation/after/candidate-2/checks.json): both backends, exact clocks, pause freezes pixels, reduced-motion pixels identical at17s/22s, tiles-off and 6s loading pixels unchanged from before.
- [18 pre-completion loading comparisons](implementation/after/candidate-2/pixel-analysis.json): both backends at0–99.9% match before pixel-for-pixel. Cross-backend images are close, **not pixel-identical**; baseline differences remain.
- [Final integrated construction/control retest](implementation/after/integrated-retest/checks.json): **144/144 checks, 25 captures passed**, including pause, reduced-motion/backend/tile continuity, narrow viewport and manual clocks, no page/console/request/resource errors. [Integrated 17s pixels](implementation/integrated-pixel-retest.json) exactly match the recorded candidate in both backends.
- The earlier [worktree retest](implementation/after/construction/checks.json) remains failed for two resource checks: font requests through the shared `node_modules` junction returned403/ERR_ABORTED outside Vite's filesystem allowlist. All captures/control checks completed. Running from the integrated checkout resolved it without changing permissions or Vite configuration; the failed record is retained.
- Recordings: full-scene and close-up MP4s decoded166/166 frames (11.067s, fixed15fps); real-time WebM also retained. These are Windows browser captures, not native Tauri/WebView2 evidence. Environment: Windows11 build26200, Node24.14.0, Playwright1.56.1, Vite7.3.7, Chrome154.0.8037.97; reported renderer ANGLE/NVIDIA RTX5080/D3D11, viewport1920×1080/DPR1. Native performance/stability remains untested.

### Independent review and limits

Native `eva-reviewer` (configured `opus`, host-resolved `claude-opus-4-8[1m]`, Read/Grep; no independent route-log check for that worker) reviewed the stable seven-file candidate. Confirmed channel alpha handling, Canvas state restoration, WebGL tint batching, deterministic/static reduced path, build gating and drift/pose attachment; no blocking correctness finding.

Remaining engineering concerns: Canvas channel filters have a potential cost on other hardware/browsers (the captured paused fixtures reported0.9–2.4ms draw submission, not a GPU completion benchmark). The defensive600-command cap can theoretically truncate a quad or lower-priority connectors; an actual [78,900-case authored-region sweep](implementation/cap-probe.json), seeds0–99 over12–120s with a stationary figure, reached at most412 commands and did not reproduce truncation. Neither static review nor this sweep proves all possible seeds/times. Reduced mode shows a static settled composition even during the normal build window, and Tiles off hides feature marks too; both are deliberate control contracts.

### Remaining visual differences and owner retest

The result is **more localized, sparser and less saturated than the original GIF**. It distorts horizontal bands and fragment echoes, not the entire figure into a continually broken raster silhouette. The tracking network uses authored anchors, not live computer vision; some sparse groups hold longer than the original video's dense clusters. It preserves the readable Seed-33 scene instead of copying the reference video's subject morphing. These are visible differences, not a claim of exact aesthetic fidelity.

The first candidate was rejected by main and remains under `implementation/after/attempt-1-rejected/` with source and captures. No owner decision is inferred from any test, reference selection or this integration.

Run from the repository root: `npm --prefix week4/app run dev`. Open `http://127.0.0.1:1440/?fixture=1&look=seed33&seed=33&build=12000&t=12000&backend=webgl2` to start at formation. Watch at least11s, then pause, hide/show Tiles, toggle Reduced motion and switch to Canvas2D. Compare the full-scene/close-up clips above against both original references. **Owner decision on this revision and all phase acceptance remain pending.** No commit, push, shared branch switch or phase advancement.
