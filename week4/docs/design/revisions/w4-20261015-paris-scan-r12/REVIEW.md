# Paris scan study

Status: **QHD browser candidate ready for owner comparison; visual acceptance pending.**

**[Open scan demo](http://127.0.0.1:1440/?scene=paris-scan)** · [Production preview](http://127.0.0.1:1452/?scene=paris-scan) · [Current original-color capture](implementation/colour-refinement/after/composite-qhd.png) · [Color-only before/after](implementation/colour-refinement/comparison.png)

[Current checks](implementation/colour-refinement/after/checks.json) · [Current source binding](implementation/colour-refinement/source-manifest.json) · [Current recording](implementation/colour-refinement/after/scan-local-scatter.webm). Earlier cyan candidate captures and checks remain below as history.

[Before: R11 at QHD](implementation/before/hybrid-qhd.png) · [After: material views](implementation/after/production-03/material-contact-sheet.png) · [Production checks](implementation/after/production-03/checks.json)

Launch: `npm --prefix week4 run app:dev`, then `?scene=paris-scan`. Production: `npm --prefix week4/app run build`, then `npm --prefix week4/app run preview -- --port 1452`. R11 remains available on the development server at `?scene=paris-hybrid`.

[Scan vocabulary](references/images/owner-scan-reference.png) · [Approved 3392×1720 Paris master](references/images/upscale-c074e96b/paris-3392x1720.png) · [Reference contact sheet](references/contact-sheet.png) · [Prior static hybrid checkpoint](../w4-20261015-paris-hybrid-r11/REVIEW.md)

## Owner color-only refinement — 2026-10-15

Owner: “Keep this visual demo for now. However, change the color to be the color of the original paris frame. So keep everything composed like this, only change the particle colors to best fit the reference image.” This retains the current composition provisionally, not phase acceptance. Continue the same R12 scan proof using its already inspected and explicitly reusable original Paris master; no new design or motion is introduced. Replace only per-sample RGB with the corresponding source RGB (sRGB converted to linear for the shader). Keep positions, size, family, random seed, angle, density, camera and shader/motion code identical. Preserve the prior cyan data and generator with the new QHD before capture under `implementation/colour-refinement/before/`. Verification completed: all **109,593 RGB triplets** match their original-frame sample pixels after sRGB→linear conversion. Every non-RGB byte is identical to the cyan candidate; renderer, shader, host and CSS hashes are unchanged. Only the generator's RGB assignment and regenerated binary/checksum manifest changed. [Byte-level check](implementation/colour-refinement/rgb-only-verification.json) and [source-color check](implementation/colour-refinement/source-palette-verification.json). Four focused asset tests, production build and all 20 production browser checks passed; main inspected the QHD result against the original Paris frame. Warm stone/olive/brown materials, cream clothing, amber lamps and the original magenta/blue accents replace the cyan override. Source-shadow colors make dark regions dimmer; no brightness boost or geometry changes were added. Main Astra performed this small known edit inline; no new worker, generation/spend, full-suite rerun, commit or phase acceptance.

## Recovered owner direction — 2026-10-15

Source: interrupted local FOUR_LAYER_IMPLEMENTATION conversation, recovered before edits at HEAD `565b5ad6c4b62cf903cf903288941ce8f95850ff` plus existing uncommitted work. The owner requested QHD output and: “upscale, but actually remove drawn details and replace it with the ML visualizations like gaussian splatting and SLAM / LiDAR Point Cloud Mapping and GPU effects like point scattering, ordered dithering and edge and geometry reconstruction.”

The owner selected scan-inspired GPU first, with actual 3D reconstruction to be considered if this proof is not satisfactory. They noted the eventual goal is procedurally generated 3D reconstruction with AI input. That future goal is not a claim about this proof. They explicitly selected **Reuse references (Recommended)**: reuse the supplied scan image and existing Paris references, generate only the approved upscale, no additional style/motion generation. This pass-specific exception supersedes the old R8 procedural-only brief; R11 already records permission for image-derived GPU rendering and Three.js first. Preserve R11 and all Rust fixtures.

## Actual generation and inspection

One Topaz Image Upscale run, model `fal-ai/topaz/upscale/image`, Weave model ID `f016f288-2cc1-4e87-874a-bb6d6ce92b93`, prediction `c074e96b-1962-4372-9899-6b0547eef72e`. Exact quote **19 Weave workspace credits** separately approved with structured **Approve**; submitted once, completed and downloaded before the API interruption. Settings: High Fidelity V2, 4×, PNG, no crop, face enhancement off, denoise/sharpen/compression repair zero, all subjects. No resubmission or new spend during recovery.

Main actually inspected both local images in the resumed session. Paris master retains the two façades, four figures, furniture, sign, black gaps and source-baked accents. Upscaling preserves composition but does not recover verified detail; text is still synthetic. Scan reference favors fine cyan/white edge-dense samples and sparse interiors on a dark field, with perspective-consistent architectural seams and disconnected fragments, not solid pictures covered by noise.

## Bounded implementation contract

- Add an explicit `paris-scan` fixture at QHD (2560×1440), preserving aspect ratio and the static `paris-hybrid` comparison.
- Prepare bounded image-derived point/splat/edge data from the approved high-resolution master; approximate surface depth is authored, not measured. No raster scene plane in the scan render.
- Replace most filled surfaces with actual GPU primitives: sparse anchored samples, Gaussian-shaped point sprites, ordered dither islands and selective edge/structural fragments. Preserve object silhouettes and black gaps; reduce source color to restrained accents.
- Small controllable local scatter only; stop/reduced-motion are static. Do not invent walking, hidden geometry, a full construction story, native desktop behavior or runtime AI.
- Clearly label single-image, scan-inspired rendering. This is not trained 3D Gaussian splatting, SLAM, LiDAR or genuine reconstructed unseen geometry.
- Main owns new scan files, the additive route and R12 evidence. Read-only native researcher audits existing integration; no parallel writer shares files.

## Checks and evidence

Passed: app typecheck, **216 app tests**, WASM prebuild and Vite production build. After the final lifecycle correction, focused **9 scan/hybrid tests**, typecheck and build passed again. **20 final production browser assertions** passed: QHD framebuffer, one geometry/draw and zero textures, five distinct representations, deterministic return/seek/reset, density, Escape, reduced motion (local and system), keyboard selection, narrow layout, resize, context-loss cleanup/retry, missing data and unavailable WebGL2. No scene-image/video/external request in the normal scan run. Separate **11 R11 regression checks** passed with the original 0.2969/255 mean RGB difference unchanged. Rust tests/core tests/native WebView2 were not run; this pass changes no Rust source.

Actual sample allocation: **109,593 records / 4,383,720 bytes**, one interleaved GPU buffer, one draw, zero image textures. 23,961 points, 4,424 Gaussian sprites, 4,081 ordered-dither marks, 77,127 edge fragments. QHD DPR1 output; framebuffers cap at 3840×2160. Final 90-frame CPU-submit sample: median **0.10ms**, p95 **0.20ms**; this excludes GPU completion and is not an FPS claim. [Final source hashes](implementation/source-manifest.json).

Main inspected actual before/after images, the four isolated material captures and [temporal samples](implementation/after/production-03/temporal-samples.png), not full-speed video playback. The recorded clip is **2560×1440, 25fps container, 6.48s** of actual browser output, including startup and six seconds of requested local scatter; capture FPS is not a renderer performance result. Exact command: `node week4/app/scripts/capture-scan.mjs <new-empty-output-directory> http://127.0.0.1:1452`.

### Corrections and retained failures

- Initial typecheck exposed unchecked indexed-access/Three uniform typing; corrected before successful checks.
- First capture tool hit an occupied shared browser profile; actual evidence used a separate fresh Chrome instance instead. The initial scratch capture script had a Windows ESM URL error, corrected before the before-capture.
- `candidate-01` is the dimmer first shader pass. `candidate-02` captures the brighter version and retains a failed immediate reduced-media assertion; awaiting the actual media-change event fixed that harness race.
- `production-01` retained the genuine missing-packaging failure. The existing `copyPublicDir:false` excluded public data; an exact two-file data allowlist fixed production without copying historical images.
- `production-02` passed 19 assertions. An independent review then identified delayed cleanup on context loss; the final fix immediately disposes and removes the fixture handle. `production-03` passes all 20 assertions. Its clean composite is byte-identical to production-02.
- Reviewer’s possible vertical-crop concern did not reproduce: actual max |y| is **0.504717**, below the source ratio **0.507075**. Validation now enforces that aspect-normalized bound too.

## Fidelity, limits and next owner test

The composition and all four silhouettes remain recognizable with large black gaps. Filled painted surfaces are replaced with real GPU marks; the image is not loaded at runtime. **Edges dominate the composite; isolated splat/dither/point fields are much fainter.** This is a first scan-style proof, not a claim of exact reference fidelity. Source text, baked brackets and texture edges still influence samples. No hidden geometry, independent articulated people, measured depth, parallax, learned Gaussian model or complete four-phase construction is supplied. The shallow authored z values are not exposed as a reconstructed navigable world. No new providers, camera, microphone, desktop effects or native hardware exercise.

Owner retest: open the scan route at QHD; compare Composite and Edges against the scan reference and R11; inspect the sparse material modes, adjust density, optionally Animate samples, press Escape, Reset and Less motion. Decide whether this scan language is worth keeping or whether the next step should evaluate actual 3D reconstruction. **Acceptance remains pending.** No new credit spend, commits or publishing.

## Changed files and execution provenance

- New `app/src/scan/{ScanApp.tsx,data.ts,renderer.ts,scan.css}`; additive `App.tsx` route; exact data-asset build allowlist in `vite.config.ts`.
- New `app/scripts/{stage-scan-assets.py,capture-scan.mjs}`, `app/tests/scan-data.test.ts`, `app/public/assets/paris-scan-r12/{scene.json,points.bin}`.
- R12 references/provenance/evidence; one new design-index row and acceptance-record continuation. Pre-existing dirty Rust, hybrid, source-window and policy files preserved.
- Main implementation/integration: harness-configured Astra (`claude-gpt-6-astra[1m]`) using file tools, Node/TypeScript, Python/Pillow, Three.js/WebGL2 and isolated Playwright/Chrome. Native `eva-researcher` configured Terra, read-only audit; native `eva-reviewer` configured Opus, its harness reported `claude-opus-4-8[1m]`, static review only. Independent Gateway transport metadata was not correlated in this recovery. The reviewer ran no tests and did not accept the visuals. Ruflo `hooks_route` was advisory only.
