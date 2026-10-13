# Seed 33 component construction

Status: **candidate 3 ready for owner review; 257 tests, 144 focused browser checks and the corrected recording-harness retest passed.** Recordings are linked below. Finished/post-build captures remain unchanged. New loading and Step 1 acceptance remain pending.

## Current implementation evidence

- **[Watch the revised loading — stepped 30 fps](implementation/after/candidate-3-motion/after/webgl2-stepped-30fps-build-idle.mp4)** — 12-second construction then preserved approach/exit; actual browser screenshots at fixed virtual time, not a speed benchmark.
- [Realtime recording](implementation/after/candidate-3-motion/after/webgl2-realtime-build-idle.mp4) — includes an initial page-load blank and may drop/duplicate frames.
- [Matched before/after loading](implementation/compare-loading.png) at 25% and 50%, same viewport/DPR/clock.
- [WebGL2 construction stages](implementation/after/candidate-3/webgl2-construction-stages.png) and [Canvas2D stages](implementation/after/candidate-3/canvas2d-construction-stages.png).
- [Focused browser checks](implementation/after/candidate-3/checks.json), [endpoint/seam pixel comparisons](implementation/after/candidate-3/pixel-comparisons.json), [tested 74-file source manifest](implementation/source-manifest.json).

The earlier `candidate-1` images are rejected evidence, not the current recommendation. `candidate-2` precedes the corrected overlay stacking order; use `candidate-3` for retest.

## Owner feedback and scope

The owner reviewed the prior recordings and stated: **"the visuals are what I am asking. However, the loading animation is not what I am asking."** Requested construction: each component abstractly builds into the scene; blackwall-like wireframe strands appear individually; overlays move; the person constructs from skeleton to flesh to clothes, rather than simple transitions.

Preserve the finished Seed-33 appearance and existing post-build approach/exit from [the previous candidate](../w4-20261008-seed33-fidelity-r1/REVIEW.md). Approval of that visual aspect is not acceptance of the rejected loading behavior or overall Step 1. Source: `e43c7ae` plus the prior tested 65-file working tree, SHA-256 `7e641072fd2b5fdac727d898191bd6b7635c686ab2e088fd70b1c8d53cb656ba`.

The owner explicitly authorized a larger workflow with 4+ agents for this redesign, superseding the normal three-worker ceiling for this task only. This does not waive one-writer ownership, isolated parallel worktrees, cost confirmations or acceptance gates.

## Fresh Weave references

- [Contact sheet](references/contact-sheet.png): the two fresh references plus the existing endpoint, explicitly labeled.
- [Early anchors](references/images/img-01-early-anchors.png) — selected start reference.
- [Component assembly](references/images/img-02-component-assembly.png) — selected selectively for object/figure staging, not architectural timing.

- Early-construction image: Nano Banana 2.1, direct model `fal-ai/nano-banana-2/edit`, seed 33, 2K, 16:9, High thinking, web search off. Run `1df53b5c-f56b-42f6-8d21-0f3e5c6daa70`; **5 credits explicitly approved**, completed and inspected.
- Mid-construction image: same model/settings, seed 133. Run `058fe631-533b-4c0c-8e3e-d6fadbb59b81`; **5 credits explicitly approved**, completed and inspected.
- Construction motion attempt 1: Kling First & Last Frame, `O1 Pro`, 10 seconds, cfg 0.65, early generated image as start and original img-13 as end. Run `eff15207-ed4f-4b1a-a35c-343fd503281b`; **109 credits explicitly approved**, submitted once. **Failed with no output:** `String should have at most 2500 characters (prompt)`. The discovery contract exposed no prompt-length limit.
- Corrected motion attempt: same model/frame/settings, shortened prompt measured at **2,144 characters**. Run `547e9e99-8ec3-4a4f-9833-31316b2c2cba`; **109 additional credits explicitly approved** after disclosing the failure and unverified refund. Completed: 1928×1072, 24 fps, 242 frames, 10.083 seconds. [Video](references/videos/vid-02-component-construction.mp4), [2 fps sheet](references/videos/vid-02-sheet-2fps.png), [figure detail sheet](references/videos/vid-02-figure-sheet-2fps.png), [sample timings](references/videos/vid-02-sampling.json).

Sum of individually approved submission quotes: **228 Weave credits** (not Figma AI credits), including the failed attempt. **Net billing/refund unverified:** both video start responses reported the same 3618.8 remaining balance, without an explicit refund receipt. No further reruns authorized. The old reference-reuse exception is not being extended to this pass.

### Image inspection

The early image has an almost empty umber field, a bright dotted figure rig, incomplete furniture arcs and roofline anchors. Some tiles are already solid; implementation should begin them as component fragments rather than infer that static panels satisfy moving overlays.

The middle image gives useful cup/ashtray ribs, an exposed figure scaffold alongside partial body/clothing, and architectural strands. Most architecture is already complete: use this image selectively for component materials/staging, not as sufficient proof of architecture assembly or an exact 55% timeline. Do not change the approved final look to match incidental differences in these new studies.

## Motion inspection and selected guidance

Main inspected both timestamped 2 fps sheets (0–10 s) and the full-resolution early/middle stills. This is temporal-sample inspection, not real-time human playback. The video shows furniture contours growing before surface fill, asynchronous panel completion/translation, and a sparse figure-anchor state resolving into clothing. **Limitations:** architecture fills too rapidly around 1–2 s; no clear independent body-volume stage; coat pieces float in around 3.5 s; invented broad curved trails sweep beside the figure; late framing shifts slightly. Do not replicate those artifacts or call this an exact successful animation reference.

Selection is component-specific: use the video's first second for contour-before-surface timing and later tile movement; use the still's scaffold/volume/rib cues for explicit native stage geometry. Reject the wide decorative arcs, whole-facade filling and compressed figure stage timing. Extend local phases over the existing 12-second fixture. A reference guides authored implementation rather than overriding the owner's stronger request. No video playback or video pixels enter runtime. This combined fresh packet supplies image/material/temporal guidance; the native result must still pass the anti-fade criteria and owner review.

## Current before-state

[Capture checks](implementation/before/checks.json) passed on Windows Chrome 154 at 1920×1080 DPR1 (hardware-reported RTX5080 WebGL2, still browser-only). [25% build](implementation/before/after/webgl2-seed33-build-025pct.png), [50% build](implementation/before/after/webgl2-seed33-build-050pct.png), [approved finished composition](implementation/before/after/webgl2-seed33-build-100pct.png), [post-build +5 s](implementation/before/after/webgl2-seed33-complete-plus-5s.png). Command: `EVA_CAPTURE_DIR=<revision>/implementation/before EVA_CAPTURE_PORT=1466 EVA_CAPTURE_REALTIME=0 EVA_CAPTURE_STEPPED=0 npm --prefix week4 run app:capture` (environment set with PowerShell). Prior unchanged recordings remain in r1; no duplicate before movie was recorded. The capture's owned Vite listener was stopped after successful checks.

## Workflow and integration decisions

A read-only Terra integration-point audit and a four-agent design workflow completed: Sonnet choreography, Sol geometric representation, Opus verification, and Opus cross-proposal synthesis. Native project routes were used, no generic Ruflo inference worker. Proposed checks are not executed evidence.

Main adopts genuine construction geometry, not re-timed photo alpha:

- Individually timed architectural paths with leading bead tips, staggered growth and open gaps between unfinished parts.
- Chair/table/cup/ashtray contours, ribs and local surfaces assembled independently.
- Existing manifest tile groups gain deterministic build-only geometric motion and settle to their exact source rectangles; existing post-build drift remains unchanged.
- Figure: an abstract joint/line scaffold; opaque stylized body volumes growing from that scaffold; independent garment seams/ribbons resolving to the approved clothed figure. No simple full-matte fade relabeled as a stage.
- Retain 12 seconds as the default fixture build; the 10-second generated study informs relative choreography, not a new runtime duration mandate.
- At completion use the existing exact composite and unchanged approach/exit, not a new final scene. Construction must remain legible when endpoint plates are hidden during a diagnostic capture.
- Reduced motion: stable completed scene without travelling tips, assembly travel, gait or shimmer; preserve host/life clocks. No global crossfade as an accessibility substitute. This is a main-selected implementation default, not an owner acceptance claim.

Corrections to specialist assumptions: new source-guided geometry is necessary and within the requested construction change; existing raster layers alone cannot express it. Tiles continue their existing drift after construction rather than becoming permanently static. Anatomy/gore restrictions are prompt choices for abstract representation, not words attributed to the owner. Only the fresh-reference cost/inspection gate is outstanding; no extra approval is needed for routine in-scope implementation decisions.

## Implementation ownership

[Shared implementation contract](IMPLEMENTATION_CONTRACT.md) fixes the common draw-plan API before the writers begin. Main inspected the reference packet and authored `scene/constructionTypes.ts` only. Four isolated native writers now own non-overlapping modules: construction planner/geometry and scene tests; WebGL2 and its helper; Canvas2D and its helper; independent contract tests and browser capture driver. A local 65-file snapshot supplies the exact dirty baseline instead of assuming a worktree contains uncommitted changes. The main-owned type file is a frozen additional input.

Workflow run: `wf_bba524d0-8ed`. Main owns source integration, packet/provenance, before/after comparison and final checks. No new extractor/runtime images are needed for the initial implementation: source-guided path/mesh data is authored in the pure construction module, using the existing unchanged texture assets for local material panels and final composition. No commits, checkout switching or overlapping file ownership. Independent final review follows a stable integrated candidate.

## Verification contract (not run)

- Mid-build captures must show partial physical components, multiple independently advancing strand heads, moving tile bounds and distinguishable scaffold/body/clothing stages. A global threshold wipe or opacity ramp fails even if the endpoint looks right.
- Deterministic pure scene clock; pause, manual step, reduced toggle, tile toggle, backend switch and resize keep continuity. Zero-length build starts at the approved endpoint.
- Compare both backends at matched 1920×1080 DPR1, endpoint at build completion and post-build +5 seconds against the old candidate.
- Capture the build at finer phase intervals, realtime and stepped recordings, reduced mode, fallback and narrow layout. Measure construction-active versus settled timing without claiming native WebView2 evidence.
- Run workspace checks and bounded resource/geometry validation; retain failed candidates and all prior media.

## Candidate 1 — rejected by main, correction in progress

The four isolated writers returned their owned modules. Main integrated only the allowlisted outputs after verifying the 65-file dirty baseline was unchanged; [integration record](implementation/candidate-1-integration.json). The workflow-created worktrees were based on older commit `8227623`, not the requested checkout revision; the explicit app snapshot preserved the intended app source, but the worktrees lacked committed Week4 core/tooling context. No whole worktree or branch was merged. Main's actual workspace has that context and supplies integration checks.

[Rejected stage sheet](implementation/after/candidate-1/rejected-stage-sheet.png), [52% screenshot](implementation/after/candidate-1/webgl2-seed33-build-052pct.png), [browser checks](implementation/after/candidate-1/checks.json), [endpoint comparison and captured source hashes](implementation/after/candidate-1/integration-review.json).

- Typecheck initially failed on missing discriminant narrowing in the independent tests; main corrected the tests without relaxing their intended behavior.
- Main typecheck now passes. Renderer-focused tests pass; the independent garment-stage test **fails** because the first planner has no seam/ribbon strokes alongside its textured panels. That requirement stays in force.
- Actual browser driver: **23 captures and 124 checks passed**, but main rejects the visual candidate. Large central/background coverage holes, misregistered generic object outlines over completed source pixels, coarse block body volumes and popping rectangular source cells do not satisfy the brief.
- The checked endpoints are preserved: WebGL2 build-complete, WebGL2 +5s, and Canvas2D +5s are **pixel-identical** to the new before captures. This validates preservation, not the intervening construction.
- Independent Opus source review found incorrect Canvas2D shown-tile counts during construction and a one-point stroke-cap mismatch. Main fixed both, added regression coverage, and added matched-backend tile-count checks plus a 99.9% endpoint-seam capture for the next driver run.
- Main reassigned the two core-planner files to an `eva-implementer` / Sol corrective worker. The initial assignment pointed at the old workflow worktree, but the SDK authorized a new isolated root; its Write was blocked before mutation. Main corrected ownership to that allocated worktree and supplied the same snapshot/planner as inputs. No denied target was retried or permissions bypassed. This is a disclosed role reassignment for concrete contract failures, not a routing fallback. The same inspected fresh packet covers the correction. No additional generation/spend.

## Corrected candidate 3

The successful corrective worker used its newly allocated worktree, not the cleaned-up blocked root. It changed only `seed33Construction.ts` and its focused test file. Main verified the two returned hashes before integration, retained the rejected source, and ran the actual workspace checks. The new planner has hundreds of independently grown architecture/furniture paths, curved object ribs, an articulated figure rig, expanding rounded solid body geometry, garment seam paths with source-textured panels, and translating/rotating/scaling source tiles. Material triangles grow spatially with source UVs, rather than alpha-fading the whole image. Reduced motion bypasses the construction to the held finished view without moving either clock.

Candidate 2 passed structural tests but actual 99.9% captures exposed an integration error: the earlier handoff prescribed tiles before foreground, whereas both existing settled renderers draw **background → figure → foreground → overlay tiles**. Foreground therefore covered the table chips until the endpoint. Main corrected the planner and both affected test expectations; the independent reviewer confirmed that mismatch and found no further planner correctness blocker. It is a correction to main's contract, not an owner direction change.

### Actual checks

- `npm --prefix week4 run check`: **passed**, core **103/103**, app **154/154**, both TypeScript checks and production build. The intervening run failed the outdated painter-order assertion; that failure is not reported as a pass.
- `node week4/app/scripts/capture-construction.mjs <absolute app> <new output> 1469`: **passed**, **25 captures, 144 checks**, both backends, exact phase clocks, tile-count parity, pause/manual stepping, reduced-motion/backend/tile continuity and 390×844 resize. Zero page errors. 1920×1080 DPR1 for the matched scene captures.
- WebGL2 complete, WebGL2 +5s and Canvas2D +5s are **pixel-identical** to the pre-edit approved-look captures. The construction-to-complete comparison is not pixel-identical: mean absolute channel difference at 99.9%→100% is **0.0329/255 WebGL2** and **0.3156/255 Canvas2D**, reduced from 3.694/3.934 before the overlay-order fix. Sampling/shimmer and Canvas2D clipped-triangle seams remain; do not describe that boundary as mathematically seamless.
- Tested working-tree SHA-256: `78157b4866ebc4e2bc841c7ebdf4c2e69b30a1e3d749127c11403f87623be110`; base `e43c7ae` plus local changes. The manifest covers 74 app source/test/script/asset/manifests, not private environment files or generated build output.
- Main inspected both candidate-3 stage sheets against the fresh reference packet. Review is temporal sampling, not a claim of human realtime playback. Video evidence is finalized separately below.

### Recording and harness retest

Both actual browser clips were produced: stepped **661/661 frames**, 30 fps, 22.033 s, ffmpeg exit 0; realtime screencast 20.067 s with a measured 22.319 s page-clock interval (dropped/duplicated capture frames and initial blankness are disclosed). Main inspected both 4 fps frame sheets; no realtime human playback claim. Prefer the stepped recording to judge intended choreography.

The [original recording report](implementation/after/candidate-3-motion/checks.json) has **`ok:false`**: four stale assertions required shimmer particles during the construction interval, which now intentionally uses lines/triangles and suppresses those particles. The video encoder, clock checks and page-error checks succeeded. Main did not relabel that report. `capture-s33.mjs` now explicitly asserts zero shimmer while construction is active and positive settled shimmer afterward, and records that expectation per still. It also spawns Vite through Node directly, avoiding the Windows cmd wrapper that had left listeners running. [Actual harness retest](implementation/after/capture-harness-retest/checks.json): **passed**, no failures or page errors, process exited cleanly; movies were not redundantly re-recorded because runtime source was unchanged.

Only that capture script changed after recording. [Retest source manifest](implementation/retest-source-manifest.json), SHA-256 `16c8d8c037a2e8a098a35fe0b3b97e9b661462d719ff2e76681b9f1174334cdb`, verifies every other recorded source/test/asset byte unchanged from the movie manifest. The unit/build checks above apply to unchanged runtime/tests; the revised driver additionally passed Node syntax and the actual retest.

Recorded browser timing (not native/GPU-performance certification): first 300 WebGL2 build frame intervals median **6.9 ms**, p95 **7.0 ms**, CPU draw median **0.9 ms**, p95 **2.2 ms**. This samples the early build, not a distribution over every construction phase. Realtime page life/wall ratio **1.001** over 2,911 drawn frames; stepped capture time is not renderer speed. Full raw values remain in the recording report.

### Decisions and limitations for owner review

- This is a **fixed-camera 2D construction candidate**, not reconstructed 3D anatomy, a physical cloth simulation or depth-aware architecture. The body stage uses stylized rounded geometry; garment/material resolution uses source-textured triangle meshes. The angular material assembly and timing need the owner's visual judgement.
- Hundreds of fine paths and moving tips replace the single bottom-up reveal; image alpha is not the construction mechanism. Small local retirement fades only remove completed scaffold guides.
- The existing source layers, finished appearance and subsequent approach/exit were kept. Original repaired background surfaces and 2D approach limitations remain unchanged.
- Canvas2D shares the staged geometry but has different fine-stroke antialiasing and possible thin triangle-edge seams. Do not claim pixel parity throughout construction.
- Browser-only Chrome/Windows evidence; no native WebView2, camera, head tracking, voice, desktop effects or phase advancement. No commit/push/publication. Third-party source-input rights remain as documented in the prior packet.

### Execution provenance and changed modules

Observed session-filtered Gateway routes: Codex `gpt-6-astra` (main), `gpt-5.6-terra` (research), `gpt-5.6-sol` (implementation/correction); Anthropic `claude-sonnet-5` (UI writers), `claude-opus-4-8` (independent reviews). These are observed model routes, not the latest-family names assumed from aliases. Native Agent/Workflow executed the workers; Ruflo only supplied advisory routing. Source checks used Node/TypeScript/Vite; captures used local Playwright/Chrome and Python image comparisons.

This pass changed `src/scene/{constructionTypes,seed33Construction}.ts`, `src/render/{webgl2,canvas2d,constructionWebgl,constructionCanvas}.ts`, four construction test files and `scripts/{capture-construction,capture-s33}.mjs`, plus this packet/index/acceptance record. Pre-existing App/host/source-asset changes were preserved, not attributed to this pass.

## Owner decision

Finished visual aspect approved in conversation; loading changes requested. Fresh images/video are reference candidates, not implementation evidence or owner acceptance. Step 1 remains pending.

For the local fixture: `npm --prefix week4 run app:dev`, then `http://127.0.0.1:1440/?fixture=1&look=seed33&seed=33&build=12000`. Watch the 12-second build and then the preserved approach, test pause/reduced motion/tiles, and judge whether the strand, body and garment staging meets the requested loading behavior. A decision on the new loading must refer to this candidate/hash; prior finished-look approval does not accept it.
