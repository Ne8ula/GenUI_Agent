# Seed 33 matrix materials

Status: **matrix candidate 2 ready for owner retest; tests, matched browser captures and motion recording completed.** Recovery on 2026-10-09 confirmed all 79 captured source/assets files unchanged. Approved strands and checked settled frames are unchanged. Owner acceptance remains pending.

## Current candidate

- **[Watch the matrix loading sequence](implementation/after/candidate-2-motion/after/webgl2-stepped-30fps-build-idle.mp4)** — 22.03 seconds, all 661 fixed-time frames; intended 30 fps choreography, not a real-time performance measurement.
- [Real-time browser recording](implementation/after/candidate-2-motion/after/webgl2-realtime-build-idle.mp4) — 20.2-second screencast; duplicated/dropped frames are possible. [Recording checks](implementation/after/candidate-2-motion/checks.json), [4 fps temporal sheet](implementation/after/candidate-2-motion/after/webgl2-stepped-30fps-build-idle-frames-4fps.png).
- [Matched material/overlay comparison](implementation/compare-matrix.png).
- [WebGL2 stage sheet](implementation/after/candidate-2/webgl2-construction-stages.png), [Canvas2D stage sheet](implementation/after/candidate-2/canvas2d-construction-stages.png).
- [Browser checks](implementation/after/candidate-2/checks.json), [endpoint comparisons](implementation/after/candidate-2/pixel-comparisons.json), [integration/cache verification](implementation/after/candidate-2/integration-checks.json), [79-file source manifest](implementation/source-manifest.json).

The matrix helper/test/review workflow completed. Main integrated five owned new files and changed only the material/box call sites in the existing planner, plus the material-specific test expectations. No strand generator, path, colour, width, timing, retirement, renderer, host or runtime asset was changed by this pass.

## Review entry points

- [Fresh material/box reference](references/images/img-01-matrix-materials.png), [contact sheet](references/contact-sheet.png).
- [Motion study](references/videos/vid-01-matrix-materials.mp4), [4 fps scene sheet](references/videos/vid-01-sheet-4fps.png), [box-detail sheet](references/videos/vid-01-boxes-4fps.png).
- [Actual before-state](implementation/before/current/webgl2-seed33-build-052pct.png), [before capture checks](implementation/before/current/checks.json), [22 approved-strand fingerprints](implementation/baseline-strands.json).

Main inspected the full-resolution image and both timestamped sheets, plus the actual current before capture. Selected image cues: little pixel islands/holes, patterned box subcells, fragmented borders and short scanline scratches within the existing warm colors. Selected motion cues: asynchronous internal pattern substitutions, brief horizontal scanline stretches and local reassembly. **Rejected/limited:** the movie moves some entire box groups farther than desired and keeps much of the scene color already complete; the generated image also changes the figure pose slightly. Do not copy those changes or claim exact prompt fidelity. Preserve actual approved strand commands and the existing figure/scene; translate the selected material/box cues into native bounded geometry. Temporal sampling is not real-time human playback.

## Owner feedback and bounded scope

Owner: **"The strands are good, no fixes needed. However, the coloring and the box overlays need to be fixed. Both of them should feel more glitchy and matrix-y."**

Preserve the approved strand geometry, timing, brightness, width and retirement behavior from [construction candidate 3](../w4-20261008-seed33-construction-r1/REVIEW.md). Scope is the loading material/color fill and box-overlay assembly, not a palette redesign or new final scene. Keep the existing warm palette, settled source composite, post-build approach/exit, controls and reduced-motion hold. This interpretation was stated in the main session; no phase acceptance is inferred from approval of one aspect.

Baseline: `e43c7ae` + local working tree, [74-file manifest](../w4-20261008-seed33-construction-r1/implementation/retest-source-manifest.json), SHA-256 `16c8d8c037a2e8a098a35fe0b3b97e9b661462d719ff2e76681b9f1174334cdb`.

## Fresh references and spending

- One 2K Nano Banana 2.1 image, seed 233, high thinking, 16:9, web search off. Direct model `fal-ai/nano-banana-2/edit`, Weave model ID `bebebed5-50c1-4701-98b3-86929db21585`. Prediction `fa9d8a40-2296-4c39-8974-20efbee59225`. Quoted **5 Weave credits**, explicitly approved, submitted once.
- One 5-second Kling First & Last Frame / O1 Pro study, cfg 0.65, original Seed-33 still as both endpoints. Weave model ID `85caf705-a459-48dd-96cd-953a04b4c08e`, model ID exposed as `kling`. Prediction `a63af3d6-5bcd-4238-8d32-ec7f6ecd71c0`. Quoted **55 Weave credits**, explicitly approved, submitted once.
- New pass total **60 Weave credits**, not Figma AI credits. No automatic reruns or inherited budget. Both runs completed; the image is 2752×1536 and the video is 122 frames at 24 fps (5.083 seconds). Actual outputs were inspected as described above.

The five-second reference studies digital breakup/reassembly in place; it does not change the runtime's 12-second default loading duration or authorize persistent post-build glitching.

## Reference questions

- Can color fill resolve through ordered-dither occupancy, interrupted scanlines and source-colored pixel clusters rather than broad smooth triangular wedges?
- Can existing box groups show readable internal bit-cell changes, small slice offsets, short edge ghosts and stepped reassembly rather than large smooth rotation/translation?
- Can these effects remain localized and asynchronous, without full-screen flashing, a palette swap, random static everywhere, or obscuring the approved strands?

## Planned acceptance constraints

These are requirements, not executed checks:

- Strand stroke/disc commands remain identical to the baseline for fixed seeds/times. Do not tune or regenerate the approved paths while changing color fill.
- Keep figure scaffold/body/garment stage ordering and the original endpoint; change material expression, not the accepted geometry or approach.
- Deterministic clock-driven, bounded glitch states with readable hold intervals; no per-frame random noise, new runtime network or generated-code execution.
- Final/zero-build/reduced state uses the same settled source path. Pause, manual time, backend/tile/reduced toggles and resize remain coherent.
- New before/after captures and recordings compare the same 1920×1080 DPR1 fixture. Check command/resource bounds and both backends; do not mistake a passing counter for visual fidelity.
- Preserve all earlier candidates and the current working tree; no commits, pushes, external publication or phase advancement.

## Actual implementation and verification

Material color now resolves through clipped ordered-dither cells, broken local raster occupancy and one small fringe substitution per 300ms hold. Body fills use small local triangle-cell occupancy. Boxes stay near their original bounds: subcells activate asynchronously, strips take bounded six-pixel offsets, and occasional low-alpha edge echoes precede activation. Whole-box rotation/fly-in is removed. Full completion returns the original source triangles/rectangles; no persistent post-build glitching was introduced.

Four-role workflow `wf_37de78d1-aaf`: native Sol material helper, Sonnet box helper, Sol independent tests, Opus read-only cross-module review. Each writer inspected this fresh packet and used its SDK-allocated worktree/current 74-file source snapshot. Main owns integration and captures. Only the new helpers/tests were copied, not whole worktrees or their older Git bases.

The independent review found two real guard omissions: zero-area source UV triangles and source crops outside the atlas. Main fixed the production guards and retained the independent negative tests. The first full suite then exposed three obsolete expectations (smooth triangle growth, rotating/scaling whole tiles, and the old <2000 plan count). Main replaced them with sparse source-registered occupancy, small-offset subcell checks and the existing strict <12000 cap/no-truncation gate. Endpoint coverage, figure stages, coordinates, controls and immutable strand fingerprints remained required.

Executed checks:

- `npm --prefix week4 run check`: **passed**, core **103/103**, app **163/163**, both TypeScript checks and Vite build.
- New independent helper/strand suite: **9/9 passed**. All **22** ordered stroke/disc hashes and counts match the pre-edit baseline, including positions, width, colour, alpha, tip data and command order.
- Matched browser fixture: **25 captures, 144 checks passed**, both backends, no page errors; exact clocks, tile-count parity, toggles, reduced motion and 390×844 resize remain valid.
- WebGL2 complete, WebGL2 +5s and Canvas2D +5s remain **pixel-identical** to the before captures. The inherited 99.9%→100% sampling/shimmer delta is unchanged (mean absolute channel difference 0.0329 WebGL2 / 0.3156 Canvas2D, scale 0–255).
- Tested source: `e43c7ae` plus local changes, **79-file SHA-256 `1c6dc382dbb79cd690e2414ab7f7aae8491fdfda9e4c86e397cc139de4268c65`**.

A cache adjustment retained up to96 immutable clipping templates instead of24, avoiding churn across the scene's59 source triangles. A narrowly scoped Node24 frozen-67% planner sample (120 iterations after10 warmups) measured median **4.391→0.794ms**, p95 **7.776→1.538ms**. This is not a browser/native performance benchmark. All24 scene PNGs were byte-identical before/after this cache-only adjustment; the narrow fixture contains live timing text and was excluded from that identity comparison. Browser captures still show higher active-fill cost than the old material: candidate2 sampled draw times include WebGL2 13.2ms at67% and Canvas2D 8.1ms at80%; these are isolated draw samples, not frame-time distributions or guaranteed FPS.

Changed source: new `src/scene/{matrixMaterials,matrixTiles}.ts`, material/box call sites in `seed33Construction.ts`, new `tests/matrix-{materials,tiles,strands}.test.ts`, and updated material expectations in `scene-construction.test.ts`. Existing renderer helpers/types/host/assets and strand generators were preserved.

## Recovery verification — 2026-10-09

The prior session completed recording at `2026-10-09T03:42:10.028Z` before the API interruption. Its retained report is `ok: true`, with no failures or page errors. Recovery did not regenerate references, alter the UI, or rerun/overwrite the captures.

- Fresh `npm --prefix week4/app run check`: **163/163 tests**, typecheck and Vite build passed. Core tests were not rerun in recovery; the 103/103 result above belongs to the original integrated check.
- Recomputed SHA-256 for every entry in the captured 79-file source manifest: **no differences**. The candidate and recordings therefore still describe the current app source/assets.
- Inspected a bounded-size derivative of the retained 4 fps temporal sheet and the matched 40/52/67/80% before/after comparison. Visible changes include checker/dither color islands, local fragmented box cells and source-aligned material assembly; the strand field stays legible. Samples show the settled scene followed by the retained approach/exit. This is temporal-sample inspection, **not full-speed playback or owner acceptance**; small/local glitch cadence still needs the owner's video review.
- Recording clock checks reached exactly 22000 ms in both manual clocks, with 661/661 intended frames. The real-time run's life/wall ratio was 1.001, but its screencast is only 20.2 seconds for about 22.18 seconds of host wall time; prefer the stepped clip for complete choreography. Do not treat transcoded screencast FPS as a smoothness guarantee.
- Recovery provenance: main harness identifies `claude-gpt-6-astra[1m]`; native `eva-researcher`, configured `claude-gpt-5.6-terra[1m]`, audited handoff/status records with Read/Glob. Independent transport identity was not verified. Main used local Node/Python/Pillow, Read/Edit and npm checks; Ruflo routing was advisory.

Documentation-only reconciliation: this REVIEW, `provenance.json`, the Week 4 design index and acceptance record. No runtime changes, new spending, commit, push or phase advancement.

## Owner retest

Watch the matrix loading sequence linked at the top, or run `npm --prefix week4 run app:dev` and open `http://127.0.0.1:1440/?fixture=1&look=seed33&seed=33&build=12000`. Judge the color-resolution texture and box internals, not a new strand design. Check pause/reduced motion and the unchanged settled frame.

Limits: fixed-camera2D/source-textured assembly; material bit cells can read as a visible checker/dither pattern, and the owner must judge the strength/cadence. Canvas2D retains its thin clipped-triangle seam/antialiasing differences. No native WebView2, camera, head tracking, voice, commit, push, public publishing or phase advancement. **Material/overlay acceptance and Step1 remain pending.**

## Implementation gate

The four-plus-agent workflow authorization remains scoped to this ongoing redesign. Independent writers need non-overlapping modules and their actual SDK-allocated worktrees, initialized from the current dirty baseline. They must inspect this pass's actual image/video outputs before edits. Missing usable outputs blocks UI work. Main coordinates references, contracts, integration and evidence; tests and independent review follow the integrated candidate.
