# Matrix material contract

Fresh-reference gate is fulfilled for this bounded pass: inspect REVIEW.md, provenance, actual image and both video sheets before editing. Do not alter any approved strand emitter or its data. Main captured 22 ordered stroke/disc hashes before changes; those must remain identical.

## Ownership and integration

- Material writer: **new** `src/scene/matrixMaterials.ts` only.
- Box writer: **new** `src/scene/matrixTiles.ts` only.
- Independent test writer: **new** `tests/matrix-materials.test.ts`, `tests/matrix-tiles.test.ts`, `tests/matrix-strands.test.ts` only.
- Independent reviewer: read-only cross-module review once the three outputs exist.
- Main: integration calls in `seed33Construction.ts`, necessary updates to obsolete material-specific test assertions, evidence and final verification. Main does not change the approved strand/rig/seam generators, windows, widths, colours, alpha or order. Renderer helpers/types/assets/host remain unchanged unless a concrete integration blocker is established.

Use actual SDK-assigned isolated worktrees, not named old worktrees. The current 74-file baseline tar is input data, not the worktree branch's Git baseline. Never merge a whole worktree. No install/commit/push or new generation.

## Frozen helper APIs

Import existing types from `./constructionTypes.ts` and `./types.ts`; no new dependency or shared types edit.

Material module exports:

```ts
export const MAX_MATRIX_MATERIAL_PATCHES = 128;
export const MAX_MATRIX_SOLID_TRIANGLES = 4;
export function matrixMaterialPatches(input: {
  patch: ConstructionPatch;
  localProgress: number;
  timeMs: number;
  seed: number;
}): readonly ConstructionPatch[];
export function matrixSolidCommands(input: {
  solid: ConstructionSolid;
  localProgress: number;
  timeMs: number;
  seed: number;
}): readonly ConstructionSolid[];
```

`patch` is the **full final source triangle**, not the old smoothly growing triangle. Main supplies local progress from that material triangle's existing timing window and the host's unmodified time. Return sparse ordered-dither/scanline/pixel-island occupancy **inside that triangle**, sampled from its own source UVs; do not move its whole silhouette or merely substitute opacity. At progress <=0 return empty; at >=1 return exactly `[patch]`, with no lingering corruption/extra geometry. Preserve parent id/component prefixes, append deterministic safe `:bit-...` suffixes to derived primitives. Keep source UV interpolation correct when clipping cells to a triangle.

`solid` is the existing growing body-volume triangle and alpha/colour. Change only local fill occupancy/short scanline interruption, not the rig/volume path. At progress>=1 return `[solid]`; no more than four derived solids. Do not emit strokes or discs. At most 128 material patches and four body triangles per input, including extras. Coarsen bounded subdivisions if needed **before emission**, never truncate a completed region into holes.

Box module exports:

```ts
export const MAX_MATRIX_TILE_PATCHES = 64;
export function matrixTilePatches(input: {
  region: PhotoTileRegion;
  atlasSizePx: readonly [number, number];
  index: number;
  localProgress: number;
  timeMs: number;
  seed: number;
}): readonly ConstructionPatch[];
```

Main preserves the existing tile timing window/counter and tile visibility switch. Replace large smooth rotation/travel with **local stepped** internal subcell/scanline occupancy, small displaced strips, temporary replicated edge ghosts and bit-pattern changes. Destination offsets are bounded to at most ~6 CSS px at a 1080px-high 16:9 frame (x<=6/1920, y<=6/1080), clipped to the frame. Do not move/rotate a whole box or add new object positions. Source UVs remain within that tile's actual atlas crop. At progress<=0 return empty; at>=1 return exactly two triangles spanning the original rect and UV crop at alpha1. IDs retain `tile:<region.id>:` so both backends report truthful shown counts. No more than64 patches including ghosts. Ghost alpha may be small/local, not a whole-image fade.

## Pattern and resource rules

- Warm source palette only; use source pixels/current solid colour. No green code rain, text, new photographs or generated pixels in runtime.
- Structured local ordered-dither and raster groups, not uniform whole-frame grid popping or random static over everything. Smaller subcells/interrupted scanline edges provide the matrix texture; vary masks asynchronously per component.
- Quantized deterministic changes with readable holds (roughly300ms cadence for jitter/internal glitch patterns); no wall-clock timers, per-frame random, global flashing or repeated brightness inversion. Material occupancy progresses to full coverage and source identity.
- Same (input,time,seed) must yield identical results. At a fixed localProgress, nearby times inside a quantized hold produce identical commands; advancing to a later hold must produce some visible local pattern/offset changes during the active interval.
- Return only texture/solid commands: approved stroke/disc arrays must be untouched. Preserve input objects and data identity; no hidden global mutation or unbounded time-key cache. Cache immutable clipping templates only, bounded to a small documented limit.
- Validate finite/bounded input sufficiently to avoid loops/NaNs; gracefully return empty for degenerate source geometry. Keep output destinations/UVs within valid frame/source bounds. The integration's full plan cap remains12000; do not exceed per-helper caps or rely on global truncation.
- Exact full source triangles at local1 preserve the prior near-endpoint/full-frame coverage. No altered final palette, post-build approach/drift, reduced-motion hold or scene-clock semantics.

## Independent tests

Test helper outputs against hand-authored nondegenerate texture/solid triangles and real manifest-like tile crops: finite/count bounds, no mutation, deterministic hold/change behavior, local UV containment, partial coverage/bit occupancy rather than smooth whole-patch scaling, and exact completion. Include invalid/degenerate input. Do not test only IDs/counters or copy implementation formulae.

`matrix-strands.test.ts` embeds the actual baseline sample hashes from `implementation/baseline-strands.json` (no machine-specific path in the runnable test). It rebuilds the runtime-shaped manifest from `public/assets/seed33/manifest.json`, samples the integrated planner and compares the ordered stroke/disc JSON hash/count for both seeds/times. Hashes are immutable owner-approved baseline evidence, never regenerated to accommodate an unintended strand change.

Old tests asserting continuous per-triangle area growth or a <2000 whole-plan count describe the superseded material mechanism. Main may replace those assertions with genuine stepped occupancy/bounded-budget checks, but must retain endpoint coverage, bounds, figure stage, controls and all strand fingerprints. No silent test weakening.

Main runs the integrated suite and matched before/after browser captures, examines active box/color detail and records a 12-second loading clip plus existing approach. Passing pure tests does not establish the requested aesthetic; source geometry/strands stay fixed while only material expression changes.
