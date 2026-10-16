# Paris hybrid baseline

Status: **static GPU baseline ready for owner comparison; acceptance pending.**

**[Open GPU/source comparison](http://127.0.0.1:1440/?scene=paris-hybrid)** · [Clean capture view](http://127.0.0.1:1440/?scene=paris-hybrid&capture=1)

[Actual GPU capture](implementation/after/runtime-02/gpu-1696x860.png) · [Supplied source](references/selected-clean-plate.png) · [Ten actual cutouts](references/contact-sheet.png) · [Executed checks](implementation/after/runtime-02/checks.json)

Launch from repository root: `npm --prefix week4 run app:dev`. The old routes remain available; this new route is explicitly `?scene=paris-hybrid`.

## Current owner authority — 2026-10-15

After rejecting the R9/R10 procedural approximation, the owner supplied `Paris_GPU_Pipeline_Guide.pdf`, `Paris_Fragment_ThreeJS_Prototype`, and `Paris_Fragment_Pipeline_Images (1)`. Main read all nine PDF pages and inspected the actual clean plate, cutout atlas, relative-depth/exploded illustrations and fragment previews; native Terra-configured research inspected the prototype's six source/preparation/test files without execution.

Owner explicitly selected: **Allow hybrid** source-image textures and image-derived GPU particles (replacing the earlier texture-free restriction); **Small parallax**; **Subtle idle only** rather than walking; **Paris first**; and **Three.js first** rather than mandatory Rust renderer ownership. The owner then said “Start the implementation based on this.” These decisions govern this corrective Paris proof only. Rust application/security responsibilities and other phase gates remain unchanged. The earlier explicit reuse-reference exception continues for this corrective effort; these supplied assets are its selected current inputs. No new generation/spend is authorized or performed.

First checkpoint: match the supplied artwork at rest using its aligned layers, with **no new particles, breakup, parallax, idle animation, loading choreography or broader interactions** before owner review. The source already contains dots, colored accents and a sign bracket; those are baked pixels, not newly implemented effects.

## Reference and implementation boundary

- Source: user-supplied prototype's `public/assets/paris-clean.png`, 848×430. No invented high-resolution detail, unseen geometry or archival attribution.
- Ten supplied RGBA plates: backdrop, café, bookshop, pavement, two rear figures, street sign, patio, two foreground figures. Native Three.js/WebGL2 draws them in manifest order at the same aligned coordinates.
- Paris-specific identifiers, files, approximate depth ranks and dimensions live in one JSON manifest, not renderer code.
- No downloaded executable/package scripts are run. Only reviewed PNG assets are copied; new host/renderer code is authored in the project. Three.js is pinned through the project's npm registry installation with scripts disabled; downloaded `node_modules` is not used.
- Existing Rust scenes and rejected captures remain preserved.

[Actual R10 before-state, 1696×860/DPR1](implementation/before/rejected-r10-1696x860.png). The old procedural scene is not a visual baseline for approval.

## Verification

Passed: TypeScript check, Vite production build, five manifest tests, and eleven browser assertions. The GPU view draws **ten meshes / twenty triangles** and does not load the flattened master, a video, or Rust WASM. The master is loaded only when explicitly comparing Original source (or by the pixel-comparison test).

Native 848×430 framebuffer versus supplied master: **mean absolute RGB-channel error 0.297/255**, content-only mean 0.169/255, **98.91% of pixels within two levels in every channel**. Maximum channel difference 38 at a small number of edges; the supplied feathered masks/near-black threshold are not exactly lossless. This measures pixel agreement, not artistic quality or owner acceptance.

Actual controls exercised: isolate a cutout (one draw), switch to Original source, Escape back to all ten GPU layers, narrow 390px viewport, context loss, Retry, missing layer and WebGL2 unavailable. Failures report explicitly without substituting the master image. `runtime-01/` preserves an initial capture-script timeout on the select's accessible label; an explicit label corrected it and `runtime-02/` passed. Full workspace/Rust regression tests and native WebView2 were not run for this additive renderer. No animation recording is needed/claimed for this static checkpoint.

Main inspected the final GPU and control captures against the supplied master. The composition now preserves the source's actual visual detail. Source resolution, coarse masks, baked effects, and missing hidden surfaces remain limitations. In particular, isolated rear-figure mattes are incomplete, so **do not animate them independently yet**. No attempt was made to fabricate hidden background or call existing pixel dots live particles.

## Implementation and provenance

- New renderer/host/validation: `app/src/hybrid/{renderer.ts,manifest.ts,HybridApp.tsx,hybrid.css}`.
- Additive route: `app/src/App.tsx`; pinned Three.js/types dependencies and workspace lockfile.
- Eleven byte-identical supplied PNGs and `scene.json`: `app/public/assets/paris-hybrid-r11/`; [asset hashes](references/asset-provenance.json).
- Reproducible staging/capture: `app/scripts/{stage-hybrid-assets.py,capture-hybrid.mjs}`; focused `app/tests/hybrid-manifest.test.ts`.
- Main harness identifies Astra; native `eva-reviewer` was Opus-configured, harness reported Opus 4.8, and found no blocking defect in the stable manifest/renderer. Independent provider-route metadata was not correlated. Review is not visual acceptance. [Full provenance](provenance.json).

**Next owner test:** toggle GPU layers ↔ Original source at the link above and judge composition/material fidelity. Effects, construction, source-window choreography, small parallax and subtle idle wait for that baseline decision. No commits, publishing or new generation occurred.
