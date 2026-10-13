# Seed 33 fidelity rebuild

Status: **integrated browser candidate; technical checks passed; exact VB2 motion fidelity remains incomplete. Owner acceptance pending.**

## Start here

- [Selected still → before → after](implementation/compare/complete-before-after.png)
- [Detail comparison](implementation/compare/detail-before-after.png)
- [VB2-aligned motion comparison](implementation/compare/motion-aligned.png)
- [Stepped 30 fps build + idle recording](implementation/after/webgl2-stepped-30fps-build-idle.mp4) — actual browser screenshots at fixed virtual time, not a realtime performance measurement.
- [Realtime recording](implementation/after/webgl2-realtime-build-idle.mp4) — Playwright screencast; its initial blank/loading frame and dropped/duplicated frames are recording limitations, not an authored flash.
- [Final capture checks](implementation/checks.json), [clock/control/resize/keyframe checks](implementation/aligned-after/checks.json).

The still's architecture, object detail, material, palette and tile composition now use the approved source pixels rather than simplified substitute shapes. The live motion is **not an exact recreation of VB2**: walking is a deformed 2D matte, tiles drift rather than reproduce the video's full pattern/arrangement changes, and far walkers are static. Do not mark this candidate accepted or fully faithful based only on a similar still.

Source: `e43c7ae` on `week4`. This is a bounded replacement of the existing browser seed-33 visual pass, not desktop integration, head tracking, a 60-second product arrival or acceptance of another phase. Preserve all earlier runs.

## Selected references and explicit owner decisions

- [Seed-33 still (img-13, selected)](../w4-20261008-paris-c-hybrid/references/images/img-13-bwa3c-seed33.png).
- [VB2 (selected)](../w4-20261008-paris-c-hybrid/references/videos/vid-02-vb2-seed33-only.mp4), [3 fps sheet](../w4-20261008-paris-c-hybrid/references/videos/vid-02-sheet-3fps.png), [12 fps sheet, first 2 seconds](../w4-20261008-paris-c-hybrid/references/videos/vid-02-sheet-12fps-first2s.png).
- [Original contact sheet](../w4-20261008-paris-c-hybrid/references/contact-sheet.png) and [original provenance](../w4-20261008-paris-c-hybrid/provenance.json). These remain in place; no duplicate generation or exported asset copies for evidence.
- [Rejected run-4 comparison](../w4-20261008-paris-c-hybrid/implementation/run-4/compare/compare-complete.png), [detail comparison](../w4-20261008-paris-c-hybrid/implementation/run-4/compare/compare-details.png), [motion comparison](../w4-20261008-paris-c-hybrid/implementation/run-4/compare/compare-motion.png).

Owner decisions in this local session, 2026-10-08:

1. Requested reimplementation to achieve seed 33 and the approved video, not a loosely similar abstraction.
2. Explicitly selected **Reuse approved packet** in response to the question waiving fresh Weave generation for this bounded fidelity rebuild only. No new generation or credit spend is authorized or performed here. This is an owner exception to the normal fresh-reference prerequisite, not a claim that an old packet is fresh.
3. Explicitly selected **Reference-derived assets**: seed-33-derived textures, masks and depth layers may be combined with live geometry/shaders and animation. This supersedes the no-reference-pixels-at-runtime restriction for this pass only. It does not authorize prerecorded whole-frame video playback, new photographic plates, external image downloads or runtime generation.
4. Explicitly selected **Continue past the viewer** after VB2's approximately five-second approach. No hard reset, teleport or repeating walk-back loop.

## Actual inspection before edits

Main session viewed img-13, contact sheet, VB2 keys 1/3/5 and both temporal sheets, run-4 complete/detail/motion/still comparisons and the complete-plus-5s capture. Temporal sample inspection, **not real-time video playback**. Native read-only researcher inspected renderer source and constraints separately, not media.

Run 4 loses structural information: façades/awning/windows become uniform hanging threads; the figure is an undifferentiated flat coat silhouette instead of shaded clothing/pose in crisp dot light; cup/chair/table proportions and materials differ; fine dither/flat colour tile clusters become scattered coarse checkerboards. VB2's figure approaches strongly and the tiles change composition; run 4's motion samples do not reproduce those changes. The earlier review's claim that these are only tuning issues is not adopted.

## Bounded implementation contract

- Preserve the approved still's composition, warm umber shadows, pale peach sky, architectural detail, perspective, object silhouettes, crisp bead/dither texture and selective glow. No restyling or new palette.
- Use reference-derived local assets to preserve information instead of guessing it from primitive shapes. Derived layers must be documented and their extraction reproducible. Keep original media untouched. No runtime network or video decoder is a substitute for live rendering.
- At a defined settled reference time, compare the actual rendered frame to img-13 at matching framing. Preserve near-object positions, roofline, figure placement and tile clusters. A full-frame image under a token animation is not sufficient: the figure and authored tile regions must be independently animated and controllable.
- Match VB2's approximately five-second approach: changing pose, increasing projected size, slight screen-right progression, independently living tile clusters and restrained bead shimmer. Then extend the figure's trajectory past the viewer without a fade/reset substitute. Clearly disclose any remaining approximation of pose, depth or occluded surfaces.
- Retain current 12-second fixture build, stable deterministic seed/clock, pause, restart, reduced motion, tiles toggle, backend switching, resize handling and existing arrival look. Reduced motion must not replay or jump clocks. No camera/microphone/provider/desktop calls.
- First target is 1920×1080, DPR 1 browser capture to match run 4, with resize/reduced-motion/focus checks. Do not claim full 3D, head-coupled parallax, Windows shell or measured GPU performance from this fixture.
- Ownership: UI worker owns `week4/app/` implementation/assets/tests, isolated worktree. Main owns this revision packet, phase index update, integration and final evidence. No writes to unrelated untracked owner files or Week 1–3.

## Evidence and checks

The existing capture tool writes an `after/` child even for a before capture; its original output layout is retained beneath `implementation/before/`. This is a new local pre-edit capture, not a relabeling of the historical run-4 evidence.

- [Before complete + 5 s](implementation/before/after/webgl2-seed33-complete-plus-5s.png), [before build complete](implementation/before/after/webgl2-seed33-build-100pct.png), [before reduced motion](implementation/before/after/webgl2-seed33-reduced-complete-plus-5s.png), [before keyboard focus](implementation/before/after/fixture-controls-focus.png), [capture checks](implementation/before/checks.json).
- Before capture passed (`ok: true`, no page errors), 1920×1080 DPR1, seed33, 12s build. Main visually inspected the resulting complete+5s capture and confirmed the structural mismatch. Clips intentionally not recorded for this before run; the original run-4 clips remain linked above.
- Environment actually reported: Windows 11, Chrome 154.0.8037.97, ANGLE/NVIDIA GeForce RTX 5080/D3D11. Still **browser-only**, not WebView2, native shell, head tracking or pose-to-frame validation.
- Baseline `npm --prefix week4 run check`: passed core 103/103 and app 119/119, both typechecks and app build. These are pre-change checks, not validation of the new implementation.
- [Runtime asset authorization and terms note](RUNTIME_ASSETS.md). Original input rights not independently cleared; no public release authorized.

## Candidate 1 — not integrated

The first UI-worker candidate was captured from its isolated worktree with the main session's `capture-extra.mjs`. [Checks](implementation/candidate-1/motion/checks.json) passed, including clock/pause/tile counter/reduced/backend/resize checks. Main nevertheless **rejected it for integration** after inspecting the [idle +4.96 s capture](implementation/candidate-1/motion/idle-4960.png) and [idle +18 s capture](implementation/candidate-1/motion/idle-18000.png): a large shredded residual figure remained in the background; the moving figure carried facade pixels; rejected coarse checkerboards were drawn on top of still-baked source tiles. Passing counter/state tests did not prove the pixels were correct.

The independent native reviewer also identified premature figure culling while its bounds were still central, WebGL2 reveal blending diverging from Canvas2D, an unspecified image-alpha decode contract, permanently cached load errors, and circular motion test expectations. These are corrective work in this same bounded pass, not optional owner acceptance choices.

## Corrected asset handoff

Main took exclusive ownership of `week4/app/scripts/extract-seed33-assets.py` and the runtime asset directory. The UI worker retains renderer/scene/test ownership in its worktree. Main traced the figure silhouette against **img-13 itself**, not against the rejected procedural figure, separated 28 actual source tile regions, removed them from the static layers, and reconstructed hidden strips using neighbouring source texture. The figure and tile atlas are now independent source-pixel layers; no video pixels or new generation.

[Source-layer diagnostic](implementation/asset-inspection/source-layer-composite-not-app.png) and [asset checks](implementation/asset-inspection/checks.json): all four runtime hashes/dimensions, 28 normalized tile bounds and unchanged source hash passed. **This diagnostic is CPU compositing of assets, not an application screenshot or motion evidence.** Main inspected the corrected alpha matte and composite. The facade behind the figure and regions hidden by tiles remain approximate texture reconstructions; seams can be visible when uncovered. Do not call them recovered 3D geometry or a pixel-perfect VB2 recreation.

## Integrated candidate and crash recovery

Candidate 2 replaced the residual figure and procedural checkerboards with the corrected source matte and 28-region tile atlas. Main integrated it, then fixed the build-reveal endpoints/atlas reveal, repeated GL error-detail appending and figure exit bounds including mesh sway. The interrupted session finished the recordings and comparison sheets but stopped before completing the provenance and tested-source manifest. This recovery does **not** restart the pass, spend credits or change application code/assets.

The historical [integration manifest](implementation/integration.json) predates those main-session fixes. Its four differing files are accounted for in the [recovery integrity record](implementation/resume-verification/integrity.json); it is not silently relabeled as the final source. The recovery's [65-file source manifest](implementation/source-manifest.json) binds the newly retested working tree at `e43c7ae` + local changes, SHA-256 `7e641072fd2b5fdac727d898191bd6b7635c686ab2e088fd70b1c8d53cb656ba`. The old recordings lacked a contemporaneous full source manifest; this hash is not retroactive proof of their source.

### Actual verification

- Recovery `npm --prefix week4 run check`: **passed**, core 103/103, app 132/132, both TypeScript checks and Vite production build. No Rust/native check was rerun for this frontend recovery.
- Original final [capture manifest](implementation/checks.json): passed, no page errors/failures; WebGL2/Canvas2D, reduced motion, focus, tiles, look switching, and retained realtime/stepped recordings. Port 1453 was occupied; the [failed startup](implementation/startup-port-1453-failed.json) was retained and the successful capture used 1457.
- Fresh [recovery browser checks](implementation/resume-verification/checks.json): **20/20 passed**, actual Chrome browser at 1920×1080 DPR1, plus 390×844 resize. Tested approach/exit times, pause, tiles off/on, reduced-motion clock continuity, backend switching, narrow overflow and manual stepping; no page/resource errors. Command: `node capture-extra.mjs <absolute week4/app> <new output folder> 1465`, run from this revision folder. The capture driver and application were unchanged.
- All four runtime asset hashes/dimensions and the original selected still hash match their manifest; 28 tile regions remain. See [integrity record](implementation/resume-verification/integrity.json).
- Native `eva-reviewer` completed the final read-only correctness review: no concrete blocker found. It ran no tests or media inspection; the executed browser evidence is main's. Non-blocking notes: keep the current full-frame tile-atlas invariant if assets are repacked; Canvas2D's overlapping-band approximation may show fade seams (not visually verified by the reviewer); reduced motion still permits the one-time build wipe/fade; terminal asset errors require page reload/cache reset after the bounded retry; some source comments still say 26 rather than 28 tile crops. These are disclosed, not silently changed in this recovery.
- Documentation checks: 64 local links resolve, provenance JSON parses, the 65-file tested source remains unchanged, and `git diff --check` passes (line-ending warnings only).
- Original and fresh captures are retained separately. Recovery examples: [approach +4.96 s](implementation/resume-verification/idle-4960.png), [past-viewer +10 s](implementation/resume-verification/idle-10000.png), [narrow fixture](implementation/resume-verification/narrow-fixture.png).

### Inspection and remaining fidelity blockers

Main inspected the before/after still comparison, VB2-aligned comparison, both final 4 fps recording sheets, and fresh browser approach/exit/narrow captures. This is **temporal sampling, not a claim of human realtime playback**. The figure approaches and leaves the frame without the old background ghost. Architecture, cup/chair/table detail and original tile patterns are preserved much better than run 4.

Still unresolved:

- The figure is a deforming 2D cutout, not independently articulated/occluding limbs or a 3D walker. Pose and gait do not exactly reproduce VB2.
- Tiles drift as source-textured regions rather than reproducing VB2's pattern and arrangement changes. Far walkers remain static; strand flow is not reconstructed independently.
- Reconstructed facade strips and tile-vacated patches are visible during motion. They are not recovered unseen geometry.
- Construction is a 12-second nearest-first reveal, not the former per-particle construction or full-minute product timeline.
- Browser-only Windows Chrome evidence. Native WebView2, real head tracking, desktop effects, camera and voice remain untested/outside this pass. The realtime screencast may contain startup blankness and duplicated/dropped frames; the stepped movie is not a performance measurement.
- Original third-party input rights remain uncleared for public release. No commit, push or external publication occurred.

### Execution provenance

The recovery main is Astra (`claude-gpt-6-astra[1m]`); native `eva-researcher` performed the read-only checkpoint audit, and native `eva-reviewer` was assigned the stable final source review. Session-filtered local Gateway metadata records Codex `gpt-6-astra` / `gpt-5.6-terra` and Anthropic `claude-opus-4-8` routes. These are observed transport records, distinct from the configured worker names. Tools: native Agent, Read/Glob/Grep, PowerShell/Python, existing Node/Playwright/Chrome driver; Ruflo `hooks_route` was advisory only.

Historical UI writer inspection was recovered from actual successful Read calls: packet REVIEW at 17:27:48Z, img-13 at 17:28:13Z, VB2 keys and both sheets at 17:28:19–30Z, remaining keys at 17:31:35–36Z, all before its first Write at 17:39:33Z on 2026-10-08. This closes the missing written handoff record without inventing new inspection or realtime playback. The original native UI worker was configured `sonnet`; its exact historical transport is not independently established here.

## Owner retest and decision

Run `npm --prefix week4 run app:dev`, then open `http://127.0.0.1:1440/?fixture=1&look=seed33&seed=33&build=12000`.

1. Observe the 12-second build and approximately five-second approach; continue until the figure exits to the right. Compare with the selected still/VB2 and the linked motion sheet.
2. Pause/resume; toggle tiles and reduced motion; switch WebGL2/Canvas2D. Check that clocks do not restart and controls remain usable on a narrow window.
3. Review the explicit fidelity gaps above. This is a technically passing candidate, **not fulfillment of exact VB2 recreation**. Record the owner's requested changes or decision against the source hash above before advancing any step.

No new owner acceptance is implied by selected references, recovery, automated tests, screenshots or another agent's review. **Step 1 remains pending.**
