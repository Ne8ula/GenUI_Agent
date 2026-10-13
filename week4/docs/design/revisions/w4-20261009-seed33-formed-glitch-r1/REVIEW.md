# Seed 33 formed glitches

Status: **corrected formed-overlay implementation and resumed recording complete; ready for owner retest.** Owner acceptance remains pending.

## Watch the result

- **[Post-formation glitches — 10-second excerpt](implementation/after/motion-resume-1/after/webgl2-formed-overlays-10s.mp4)**: original fixed-time recording from scene time 12–22 seconds, re-encoded without changing timing.
- [Full 22-second build and continued glitches](implementation/after/motion-resume-1/after/webgl2-stepped-30fps-build-idle.mp4), [real-time browser screencast](implementation/after/motion-resume-1/after/webgl2-realtime-build-idle.mp4), [completed recording checks](implementation/after/motion-resume-1/checks.json).
- [Box-detail temporal samples](implementation/after/motion-resume-1/after/formed-boxes-12-17s-4fps.png): 12.00–16.75 seconds, row-major at 0.25-second intervals. Main inspected the actual samples and observed recurring localized edge tears/strip substitutions separated by restored box states; no full-speed playback claim.

The owner explicitly requested resumption. The new recording completed at `2026-10-09T15:50:39.986Z`: **661/661 frames**, 22.033 seconds at 30 fps, both host/life clocks exactly 22000ms, no page errors or failures. Source remained the same 81-file tested candidate. This manual-clock clip demonstrates intended motion, not native performance. The real-time screencast is 20.6 seconds for about 22.31 seconds of host wall time and may drop/duplicate frames; use the stepped clip for complete choreography. Browser-only evidence; no new application edits, generation, commit or phase advancement occurred during this resume.

## Earlier recording interruption (resolved by authorized resume)

The combined construction/capture command was stopped by Claude Code's critical-system-memory protection while the session was idle. This is not evidence of a renderer memory leak or command failure. The earlier [construction/control capture](implementation/after/construction-fixed/checks.json) completed successfully (`ok: true`, no failures, finished `2026-10-09T05:10:52.943Z`). The later `implementation/after/motion-fixed/` recording has no completed `checks.json`; any existing media there is unverified/possibly partial, not the final candidate recording. No automatic restart was attempted. Resume only on an explicit owner request and use a new immutable capture directory.

The 274 passing tests, matched formed-state pixel checks and source manifest remained valid during the interruption. Motion evidence was blocked until the owner's explicit resume; the successful new run is linked above. The earlier incomplete directory is retained unchanged. Owner acceptance is still pending.

## Integrated candidate and checks

- [Corrected before/after comparison](implementation/compare-formed-fixed-glitch.png), [44-frame pixel comparison report](implementation/after/formed-fixed/pixel-comparisons.json), [browser capture report](implementation/after/formed-fixed/checks.json).
- [81-file integrated source manifest](implementation/source-manifest.json): SHA-256 `d0522e05712ae22078da7cc55d989323c3c94120f951610077eab260df2e3648`, based on `e43c7ae` plus the preserved dirty baseline.
- Superseded first candidate retained: [comparison](implementation/compare-formed-glitch.png), [pixel report](implementation/after/formed/pixel-comparisons.json), [source manifest](implementation/candidate-1-source-manifest.json). Its bounds/control checks passed, but its half-strip branch repainted unchanged source pixels and did not produce the intended swap.

`formedTileGlitchPatches` supplies one shared deterministic overlay plan to the construction callsite and both settled renderers. Individual tiles have a 280ms burst followed by a 1300ms rest, staggered by tile ID/index/seed. Roughly 35% of local 4×4 subcells participate in a burst: displaced source-cell echoes (at most six design pixels), or opposite-half source raster swaps. This is additive source-textured corruption, not actual deletion of the underlying tile or a new procedural material system. The existing gentle anchor drift continues; reduced motion and hidden tiles do not draw the extra plan. Zero-build still bypasses construction; already-formed boxes remain eligible for the new effect unless reduced/hidden.

The native `eva-ui-designer` (configured `sonnet`) inspected the fresh packet before editing its isolated worktree. Main verified its owned source hashes against the dirty baseline, reviewed exact diffs, and copied only four source files and its focused test. A native read-only `eva-reviewer` (configured `opus`) confirmed the half-strip no-op; main fixed its UV mapping and added a regression. The regression first failed with `tile:mapping-fixture:glitch-1:a at 12300ms only repaints its unchanged base pixels`, then passed after the correction. No old tests were weakened or rewritten. These are native Agent invocations; exact provider model routes were not independently verified from transport logs. Main harness identifies `claude-gpt-6-astra[1m]`.

Executed on the integrated corrected source:

- `npm --prefix week4 run check`: **103/103 core + 171/171 app tests**, both typechecks and Vite build passed; frozen strand fingerprints remain covered.
- Additional formed-state capture: **44/44 fixed fixture checks**, no errors, both backends sampled from 12–18 seconds plus reduced/hidden states. All **38 normal frames** show pixel differences within the allowed overlay areas. **Zero pixels outside the union of tile bounds expanded by 24 screenshot pixels changed.** Reduced and hidden-tile captures are **pixel-identical** to before. That padding allows existing drift and bounded glitches; it is not an exact per-frame silhouette.
- Main inspected the corrected matched screenshot and enlarged box crop. The effect is localized raster/cell tearing, deliberately much less expansive than the generated reference's enlarged groups. Intensity and cadence require owner judgement; screenshot differences alone do not establish successful motion.

Source changed by this pass: `app/src/scene/matrixTiles.ts`, the tile callsite in `seed33Construction.ts`, tile paths in `app/src/render/{canvas2d,webgl2}.ts`, new `app/tests/{formed-tile-glitch,formed-glitch-mapping}.test.ts`. No host/App, runtime assets, geometry elsewhere, dependencies, camera/native integration or figure trajectory changed. Evidence drivers are under this revision's `implementation/`, not runtime source.

## Selected references and inspection

- [Image](references/images/img-01-formed-glitch.png), [contact sheet](references/contact-sheet.png): selected fragmented patterned subcells, missing bit islands and short raster-edge offsets. Reject its enlargement of some overlay groups; preserve runtime anchors and original bounds.
- [Motion study](references/videos/vid-01-formed-glitch.mp4), [4 fps scene sheet](references/videos/vid-01-sheet-4fps.png), [4 fps upper-right detail sheet](references/videos/vid-01-boxes-4fps.png): selected alternating stable/burst/recovered phases and local pattern changes. The output stretches and slides whole box strips too far and is smoother than requested; do not reproduce that broad movement. Combine its readable pulse/rest timing with the still's sharper fragment vocabulary, in native deterministic overlay geometry.
- [Actual before-state at +5s](implementation/before/current/webgl2-seed33-complete-plus-5s.png), [before checks](implementation/before/current/checks.json): 25 captures / 144 checks passed, both backends and controls.

Main inspected the actual image contact sheet, full-scene motion samples, upper-right detail samples and actual before screenshot before any edits. The 1928×1072, 24 fps reference contains 122 frames (5.083 seconds). Sheets are row-major at 0.25-second intervals; trailing empty cells are not video frames. This is temporal-sample inspection, not full-speed human playback. Selected cues are component-specific guidance, not a claim of perfect generated compliance or owner acceptance.

## Scope and owner request

Owner: "Make the glitch overlay after its formed, to be more glitchy. Also right now, it feels like the image itself is not recreated by the actual RAM, and instead is just using the reference image. Is that correct?"

Main disclosed that the settled scene uses reference-derived background, figure, foreground and tile textures; actual geometric construction and live deformation do not make it a fully procedural recreation. This pass changes only formed-overlay behavior, not the scene's image-based architecture. The owner explicitly approved the separately quoted 5-credit image and 55-credit motion reference (60 Weave credits total).

Baseline: `e43c7aedb2690c8b9edc3e2446f1d1f584897a5d` plus the current dirty tree; previous candidate [matrix-r1](../w4-20261008-seed33-matrix-r1/REVIEW.md), captured source manifest `1c6dc382dbb79cd690e2414ab7f7aae8491fdfda9e4c86e397cc139de4268c65`. Approved aspect: strands. No accepted phase baseline.

## Intended bounded change

After an individual box forms, retain recurring asynchronous local glitch bursts: subcell pattern substitution, short raster offsets, sparse bit gaps and brief edge echoes, with readable rests. Continue after the global build ends. Preserve all other scene content, strand commands, source assets, palette, figure approach/exit, fixture clocks and controls. Reduced motion and hidden tiles suppress the new effect immediately. No fullscreen flashes, camera movement, green code rain or large displaced panels.

New ongoing glitches supersede the prior matrix pass's deliberately static completed-box appearance only. This does not authorize a fully procedural scene rebuild or other phase work.

## Reference runs

- Image: Nano Banana 2.1, Weave model `bebebed5-50c1-4701-98b3-86929db21585`, prediction `e49996b0-a2ae-46fb-8637-33d967d4d8d0`, quoted/approved/submitted once for 5 credits.
- Video: Kling First & Last Frame / O1 Pro, Weave model `85caf705-a459-48dd-96cd-953a04b4c08e`, prediction `b741f075-78ff-47cd-8185-76d3a0a46cb6`, quoted/approved/submitted once for 55 credits.

Both outputs completed and were inspected as above. No extra generation or runtime media adoption is authorized. Native UI writer owns only the overlay helper, its loading/settled renderer call sites and focused tests; main owns evidence/captures/integration. Every writer must inspect these outputs before editing. Baseline source assets and all non-overlay geometry remain frozen.
