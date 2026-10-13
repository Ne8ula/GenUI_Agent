# Construction implementation contract

Main inspected fresh images and both motion sheets in REVIEW.md before authoring the shared type module. These references guide this pass only. Their limitations are mandatory reading; do not reproduce the video's compressed stages or sweeping decorative curves. Owner's settled-visual approval is not full phase acceptance.

## Shared interface (main-owned, frozen for initial worker pass)

`week4/app/src/scene/constructionTypes.ts` defines an ordered `ConstructionPlan` of strokes, discs, solid triangles and source-textured triangles in normalized frame coordinates. Width/radius are CSS pixels at a 1080px-high frame. UVs are normalized top-left-origin texture coordinates. Alpha is local only; no global scene opacity is permitted as the assembly mechanism. Geometry is data, no shader/code supplied at runtime.

Scene worker exports **`buildSeed33Construction(input: ConstructionInput): ConstructionPlan`** from `scene/seed33Construction.ts`. No public runtime fetch or new manifest fields are needed: author compact semantic paths/meshes in this module, guided by the inspected image geometry, with deterministic bounded subdivision. Existing source assets stay unchanged. This avoids an unnecessary second extraction pipeline for the initial candidate; it does not excuse arbitrary geometry unrelated to the references.

- `active` is false for `buildMs <= 0`, `timeMs >= buildMs`, or reduced motion. Complete/inactive plans contain no drawing commands. Reduced motion renders the complete held source scene immediately without changing host time.
- Ordinary build progress is clamped `timeMs / buildMs`. At zero, empty dark field or a few starting anchor dots, never the complete scene at low opacity.
- `figureStage`: absent → scaffold → volume → garment → complete, with distinct observable windows inside the default 12s build. Suggested windows: scaffold .22–.44, volume .44–.64, garment .64–.94. Timings may overlap other components but not collapse the three figure states into a fade.
- Draw commands have stable semantic IDs/components. Use prefixes such as `architecture:`, `table:`, `chair:`, `cup:`, `ashtray:`, `figure:scaffold:`, `figure:volume:`, `figure:garment:`, `tile:<manifest-id>:`. Painter ordering belongs to the planner and is preserved by both backends.
- Architectural and object strokes grow along individual paths with bead tips, varied start times/directions and curved furniture contours. Source-textured surfaces may unfold in local semantic patches only after their scaffolds form. No full-frame rectangular grid or horizontal sweep.
- Body volume is actual expanding solid geometry around an articulated abstract rig. Garment is separate textured panel geometry assembling over it. Do not use a low-alpha full figure matte as either intermediate state.
- `texture` patches reference background/foreground/figure/tiles from the already loaded existing assets. Figure UVs reference its tight matte; all other textures use their own normalized UVs. Tile source UVs derive from manifest sourceBoxPx/atlas size, never fixed crop counts.
- Local patch transforms converge to the exact source composite; at complete, skip the construction path and use the existing original render path unchanged. Source UV alpha already masks source geometry. No blank/pop at 99%→100%; nearly-complete patches must already cover the intended final surfaces.
- Tiles have real translation/scale/rotation during assembly and meet their original rects by progress1; showTiles=false removes all tile construction commands. Existing post-build `tileDriftOffset` is preserved.
- Keep bounds/counts finite, deterministic and within the exported command cap; prefer substantially fewer than 12,000 commands. No time-based RNG, per-frame image analysis, canvas screenshots as textures, external assets, new packages, or network generation.

## Writer ownership

Each writer uses an isolated worktree initialized from the exact uncommitted baseline snapshot. Copy the main-owned constructionTypes.ts as an input, never edit it without main reconciliation.

1. Core/choreography: new `src/scene/seed33Construction.ts`, `tests/scene-construction.test.ts` only.
2. WebGL2: `src/render/webgl2.ts`, optional new `src/render/constructionWebgl.ts`, optional `tests/webgl-construction.test.ts` only.
3. Canvas2D: `src/render/canvas2d.ts`, optional new `src/render/constructionCanvas.ts`, optional `tests/canvas-construction.test.ts` only.
4. Verification driver: new `scripts/capture-construction.mjs`, `tests/construction-contract.test.ts` only. Test the shared contract rather than a chosen visual implementation.

Main owns type contract, reference/evidence/acceptance docs, source integration and any cross-file reconciliation. No worker edits assets, App.tsx, host clocks, package/lock/config files, old capture scripts, other tests or another writer's files. No commits or branch switches in the shared checkout.

## Backend integration

Load existing assets and manifest normally, retaining truthful loading/error statistics. During active construction call the common planner, draw its commands inside the authored frame, and do **not** also render old photo wipe/figure alpha/shimmer passes. Preserve source-alpha semantics and texture lifecycle/context restoration.

When inactive use the existing complete/post-build photo path. For reduced motion inside the build interval, calculate photo reveal/figure alpha as complete while retaining original time for all host/scene clocks; existing reduced-motion pose holds remain in force. Keep original post-build figure approach, gait/cull, foreground occlusion, and tile drift untouched. Both backend helpers consume identical coordinates/painter order. Transparent texture triangles must not sample a bounding box as if it were opaque.

## Checks

Tests: deterministic same-input plans, non-uniform growing strands/tips, distinct figure stage geometry, moving tile coordinates, noTiles, count/bounds, zero-length/complete/reduced bypass. Structural assertions alone do not establish beauty.

New capture driver: use installed Playwright/Vite, strict owned port, immutable output directory, correct Windows process cleanup. Capture progress0/.10/.25/.40/.52/.67/.80/.92/1 and complete+5s in both backends, reduced mid-build, narrow state, and controls/clock continuity. Accept command-line app/output/port inputs; record actual errors/checks and dimensions. Optional realtime/stepped clips may reuse the existing capture script later, not invent recording evidence. Main inspects resulting media and compares endpoint pixels to the new before captures before requesting owner review.
