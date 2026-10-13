// Matrix-style box-overlay occupancy (w4-20261008-seed33-matrix-r1).
//
// Pure, deterministic helper that replaces the old whole-box rotate/scale/travel assembly
// (seed33Construction.ts `emitTile`) with local, stepped bitfield occupancy sampled from each tile's
// own source crop. Main keeps owning the existing per-tile timing window, moving-tile counter and the
// `showTiles` visibility switch; it calls this once per region per frame with that window's already
// -computed local progress and the host's unmodified time. This module never touches strokes/discs,
// never invents new box groups or palette colours, and only returns `ConstructionPatch` ('texture')
// commands sampled from the tile's real atlas crop.
//
// Reference packet (inspected before writing this file):
// week4/docs/design/revisions/w4-20261008-seed33-matrix-r1/REVIEW.md, IMPLEMENTATION_CONTRACT.md,
// references/images/img-01-matrix-materials.png, references/videos/vid-01-sheet-4fps.png and
// vid-01-boxes-4fps.png, implementation/before/current/webgl2-seed33-build-052pct.png. Selected cues:
// readable local bitcell/subcell occupancy, short stepped slice offsets and brief replicated edge
// echoes within the box's own bounds; rejected the reference's whole-group drift and pose drift.
import type { ConstructionPatch, ConstructionPoint, ConstructionTextureVertex } from './constructionTypes.ts';
import type { PhotoTileRegion } from './types.ts';
import { hash01 } from './rng.ts';

/** Hard per-call cap, including every ghost/echo patch. Matches the frozen contract constant. */
export const MAX_MATRIX_TILE_PATCHES = 64;

/** Fixed local subdivision: 16 subcells per box keeps the worst case (16 active + 16 ghost quads,
 * 2 triangles each) exactly at the 64-patch cap without relying on a global truncation. */
const GRID_COLS = 4;
const GRID_ROWS = 4;
const CELL_COUNT = GRID_COLS * GRID_ROWS;

/** Quantized hold length: the asynchronous subcell/scanline/ghost pattern is stable inside one hold
 * and only changes once the host clock crosses into the next one (roughly 300ms, per the contract's
 * readable-cadence requirement). No per-frame random noise and no wall-clock reads: `timeMs` is the
 * caller-supplied host time, not Date.now(). */
const HOLD_MS = 300;

/** Destination jitter/ghost offset bound: ~6 CSS px at a 1080-px-high 16:9 (1920x1080) frame,
 * expressed in the same normalised 0..1 frame units as every other construction command. */
const MAX_OFFSET_X = 6 / 1920;
const MAX_OFFSET_Y = 6 / 1080;

/** Per-cell activation thresholds are spread across this fraction of local progress, leaving the
 * remainder of the window fully settled before the exact-completion branch takes over at >=1. */
const ACTIVATION_SPAN = 0.85;

/** How close (in local progress) an inactive cell must be to its own activation threshold before it
 * is eligible for a brief, low-alpha replicated echo. */
const GHOST_BAND = 0.18;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function isFiniteQuad(value: unknown): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

/** Small FNV-1a style string hash so each region id decorrelates its own cell pattern from others
 * that happen to share an index, without depending on object identity or insertion order. */
function stringHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

interface ClipCell {
  destX0: number;
  destY0: number;
  destX1: number;
  destY1: number;
  uvX0: number;
  uvY0: number;
  uvX1: number;
  uvY1: number;
}

interface ClipTemplate {
  cells: readonly ClipCell[];
  fullDest: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint];
  fullUv: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint];
}

/** Bounded cache of immutable per-region clipping geometry (destination/UV cell rectangles). Keyed on
 * the region's own stable identity/geometry, never on time, so it holds no unbounded time-keyed state. */
const TEMPLATE_CACHE_LIMIT = 48;
const TEMPLATE_CACHE = new Map<string, ClipTemplate | null>();

function buildClipTemplate(region: PhotoTileRegion, atlasSizePx: readonly [number, number]): ClipTemplate | null {
  if (region == null || typeof region.id !== 'string' || region.id.length === 0) return null;
  if (!isFiniteQuad(region.rectNorm) || !isFiniteQuad(region.sourceBoxPx)) return null;
  const [x, y, width, height] = region.rectNorm;
  const [sx0, sy0, sx1, sy1] = region.sourceBoxPx;
  const [atlasWidth, atlasHeight] = atlasSizePx;
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return null;
  if (!(Number.isFinite(atlasWidth) && Number.isFinite(atlasHeight) && atlasWidth > 0 && atlasHeight > 0)) return null;
  if (!(sx1 > sx0 && sy1 > sy0 && sx0 >= 0 && sy0 >= 0 && sx1 <= atlasWidth && sy1 <= atlasHeight)) return null;

  const cells: ClipCell[] = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const destX0 = x + (width * col) / GRID_COLS;
      const destX1 = x + (width * (col + 1)) / GRID_COLS;
      const destY0 = y + (height * row) / GRID_ROWS;
      const destY1 = y + (height * (row + 1)) / GRID_ROWS;
      const srcX0 = sx0 + ((sx1 - sx0) * col) / GRID_COLS;
      const srcX1 = sx0 + ((sx1 - sx0) * (col + 1)) / GRID_COLS;
      const srcY0 = sy0 + ((sy1 - sy0) * row) / GRID_ROWS;
      const srcY1 = sy0 + ((sy1 - sy0) * (row + 1)) / GRID_ROWS;
      cells.push({
        destX0,
        destY0,
        destX1,
        destY1,
        uvX0: srcX0 / atlasWidth,
        uvY0: srcY0 / atlasHeight,
        uvX1: srcX1 / atlasWidth,
        uvY1: srcY1 / atlasHeight,
      });
    }
  }

  const fullDest: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  const fullUv: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint] = [
    [sx0 / atlasWidth, sy0 / atlasHeight],
    [sx1 / atlasWidth, sy0 / atlasHeight],
    [sx1 / atlasWidth, sy1 / atlasHeight],
    [sx0 / atlasWidth, sy1 / atlasHeight],
  ];

  return { cells, fullDest, fullUv };
}

function cachedTemplate(region: PhotoTileRegion, atlasSizePx: readonly [number, number]): ClipTemplate | null {
  const rectKey = isFiniteQuad(region?.rectNorm) ? region.rectNorm.join(',') : 'invalid';
  const sourceKey = isFiniteQuad(region?.sourceBoxPx) ? region.sourceBoxPx.join(',') : 'invalid';
  const key = `${region?.id ?? ''}|${atlasSizePx[0]}x${atlasSizePx[1]}|${rectKey}|${sourceKey}`;
  if (TEMPLATE_CACHE.has(key)) return TEMPLATE_CACHE.get(key)!;
  const built = buildClipTemplate(region, atlasSizePx);
  if (TEMPLATE_CACHE.size >= TEMPLATE_CACHE_LIMIT) {
    const oldest = TEMPLATE_CACHE.keys().next().value;
    if (oldest !== undefined) TEMPLATE_CACHE.delete(oldest);
  }
  TEMPLATE_CACHE.set(key, built);
  return built;
}

function vertex(x: number, y: number, u: number, v: number): ConstructionTextureVertex {
  return { x: clamp01(x), y: clamp01(y), u: clamp01(u), v: clamp01(v) };
}

function pushQuad(
  output: ConstructionPatch[],
  idBase: string,
  alpha: number,
  destX0: number,
  destY0: number,
  destX1: number,
  destY1: number,
  uvX0: number,
  uvY0: number,
  uvX1: number,
  uvY1: number,
): void {
  const v00 = vertex(destX0, destY0, uvX0, uvY0);
  const v10 = vertex(destX1, destY0, uvX1, uvY0);
  const v11 = vertex(destX1, destY1, uvX1, uvY1);
  const v01 = vertex(destX0, destY1, uvX0, uvY1);
  output.push({ kind: 'texture', id: `${idBase}:a`, component: 'tiles', alpha, texture: 'tiles', vertices: [v00, v10, v11] });
  output.push({ kind: 'texture', id: `${idBase}:b`, component: 'tiles', alpha, texture: 'tiles', vertices: [v00, v11, v01] });
}

export interface MatrixTilePatchesInput {
  region: PhotoTileRegion;
  atlasSizePx: readonly [number, number];
  index: number;
  localProgress: number;
  timeMs: number;
  seed: number;
}

/**
 * Local, stepped bitfield occupancy for one box-overlay region, sampled from its own source crop.
 *
 * - `localProgress <= 0` (or non-finite): returns `[]` — nothing has assembled yet.
 * - `0 < localProgress < 1`: returns up to `MAX_MATRIX_TILE_PATCHES` texture patches covering a
 *   deterministic subset of a 4x4 subcell grid (asynchronous activation, occasional small stepped
 *   offsets bounded to ~6 CSS px, one scanline-style half-strip per hold, and sparse low-alpha
 *   replicated edge echoes for cells about to activate). Source UVs always stay inside the region's
 *   real atlas crop; only destination position gets the small bounded offset.
 * - `localProgress >= 1`: returns exactly two triangles spanning the original rect/UV crop at alpha 1,
 *   bit-identical in shape to the prior fully-assembled tile — no residual corruption or extra geometry.
 *
 * Pure and side-effect free beyond the bounded, non-time-keyed clip-template cache above. Same
 * (region, atlasSizePx, index, localProgress, timeMs, seed) always yields the same output; nearby
 * `timeMs` values inside one ~300ms hold always yield identical output.
 */
export function matrixTilePatches(input: MatrixTilePatchesInput): readonly ConstructionPatch[] {
  const region = input?.region;
  if (region == null || typeof region.id !== 'string' || region.id.length === 0) return [];

  const localProgress = Number.isFinite(input.localProgress) ? input.localProgress : Number.NaN;
  if (!Number.isFinite(localProgress) || localProgress <= 0) return [];

  const atlasSizePx: readonly [number, number] = Array.isArray(input.atlasSizePx) && input.atlasSizePx.length === 2
    ? input.atlasSizePx
    : [1, 1];
  const template = cachedTemplate(region, atlasSizePx);
  if (template === null) return [];

  const idBase = `tile:${region.id}`;

  if (localProgress >= 1) {
    const [d0, d1, d2, d3] = template.fullDest;
    const [u0, u1, u2, u3] = template.fullUv;
    return [
      {
        kind: 'texture',
        id: `${idBase}:triangle-a`,
        component: 'tiles',
        alpha: 1,
        texture: 'tiles',
        vertices: [vertex(d0[0], d0[1], u0[0], u0[1]), vertex(d1[0], d1[1], u1[0], u1[1]), vertex(d2[0], d2[1], u2[0], u2[1])],
      },
      {
        kind: 'texture',
        id: `${idBase}:triangle-b`,
        component: 'tiles',
        alpha: 1,
        texture: 'tiles',
        vertices: [vertex(d0[0], d0[1], u0[0], u0[1]), vertex(d2[0], d2[1], u2[0], u2[1]), vertex(d3[0], d3[1], u3[0], u3[1])],
      },
    ];
  }

  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed) >>> 0 : 0;
  const index = Number.isFinite(input.index) ? Math.trunc(input.index) >>> 0 : 0;
  const timeMs = Number.isFinite(input.timeMs) && input.timeMs >= 0 ? input.timeMs : 0;
  const holdIndex = Math.floor(timeMs / HOLD_MS) >>> 0;
  const regionSalt = (seed ^ stringHash(region.id) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;

  const scanlineCell = Math.floor(hash01(regionSalt, (0xd5500000 ^ holdIndex) >>> 0) * CELL_COUNT);

  const output: ConstructionPatch[] = [];
  for (let cellIndex = 0; cellIndex < CELL_COUNT && output.length < MAX_MATRIX_TILE_PATCHES; cellIndex += 1) {
    const cell = template.cells[cellIndex]!;
    const threshold = hash01(cellIndex, (regionSalt ^ 0x0a110000) >>> 0) * ACTIVATION_SPAN;

    if (localProgress >= threshold) {
      const jitterRoll = hash01(cellIndex, (regionSalt ^ 0x0b220000 ^ holdIndex) >>> 0);
      let destX0 = cell.destX0;
      let destY0 = cell.destY0;
      let destX1 = cell.destX1;
      let destY1 = cell.destY1;
      if (jitterRoll < 0.35) {
        const dxRoll = hash01(cellIndex, (regionSalt ^ 0x0c330000 ^ holdIndex) >>> 0);
        const dyRoll = hash01(cellIndex, (regionSalt ^ 0x0c440000 ^ holdIndex) >>> 0);
        const dx = (dxRoll * 2 - 1) * MAX_OFFSET_X;
        const dy = (dyRoll * 2 - 1) * MAX_OFFSET_Y;
        destX0 += dx;
        destX1 += dx;
        destY0 += dy;
        destY1 += dy;
      }

      if (cellIndex === scanlineCell) {
        // One short, legible scanline interruption per hold: show only the top or bottom half-strip
        // of this cell's own crop, alternating with the hold index (bounded, quantized, not a fade).
        const topHalf = (holdIndex % 2) === 0;
        const midY = (destY0 + destY1) / 2;
        const midV = (cell.uvY0 + cell.uvY1) / 2;
        if (topHalf) {
          pushQuad(output, `${idBase}:cell-${cellIndex}`, 1, destX0, destY0, destX1, midY, cell.uvX0, cell.uvY0, cell.uvX1, midV);
        } else {
          pushQuad(output, `${idBase}:cell-${cellIndex}`, 1, destX0, midY, destX1, destY1, cell.uvX0, midV, cell.uvX1, cell.uvY1);
        }
      } else {
        pushQuad(output, `${idBase}:cell-${cellIndex}`, 1, destX0, destY0, destX1, destY1, cell.uvX0, cell.uvY0, cell.uvX1, cell.uvY1);
      }
      continue;
    }

    // Inactive cell: a brief, low-alpha replicated echo only when close to its own activation moment.
    if (threshold - localProgress >= GHOST_BAND) continue;
    const ghostRoll = hash01(cellIndex, (regionSalt ^ 0x0e660000 ^ holdIndex) >>> 0);
    if (ghostRoll >= 0.25) continue;
    const dxRoll = hash01(cellIndex, (regionSalt ^ 0x0e770000 ^ holdIndex) >>> 0);
    const dyRoll = hash01(cellIndex, (regionSalt ^ 0x0e880000 ^ holdIndex) >>> 0);
    const dx = (dxRoll * 2 - 1) * MAX_OFFSET_X;
    const dy = (dyRoll * 2 - 1) * MAX_OFFSET_Y;
    pushQuad(
      output,
      `${idBase}:cell-${cellIndex}-ghost`,
      0.35,
      cell.destX0 + dx,
      cell.destY0 + dy,
      cell.destX1 + dx,
      cell.destY1 + dy,
      cell.uvX0,
      cell.uvY0,
      cell.uvX1,
      cell.uvY1,
    );
  }

  return output.length > MAX_MATRIX_TILE_PATCHES ? output.slice(0, MAX_MATRIX_TILE_PATCHES) : output;
}

// ---------------------------------------------------------------------------
// Post-formation glitch overlay (w4-20261009-seed33-formed-glitch-r1).
//
// Reference packet (inspected before writing this): week4/docs/design/revisions/
// w4-20261009-seed33-formed-glitch-r1/REVIEW.md + provenance.json, references/contact-sheet.png,
// references/videos/vid-01-sheet-4fps.png and vid-01-boxes-4fps.png, implementation/before/current/
// webgl2-seed33-complete-plus-5s.png. Selected cues: fragment/subcell pattern changes and short
// raster/edge-duplicate offsets, with a readable pulse/rest cadence; rejected the reference's enlarged
// overlay groups and smooth whole-box drift.
//
// This is additive, overlay-only output for a box that has ALREADY reached its settled rest shape
// (matrixTilePatches at localProgress>=1, or the settled renderers' own direct atlas-crop draw). It never
// returns the box's base geometry itself: callers already draw (or have already drawn) the plain rest
// crop — seed33Construction.ts's emitTile via matrixTilePatches(localProgress=1) during the build, and
// the settled Canvas2D/WebGL2 backends via their existing direct bitmap/texture-quad draw once the build
// completes — and only need to additionally paint these sparse, bounded glitch cells on top during a
// burst. The SAME function, called with the SAME (region, index, seed) and the current clock, is reused
// unchanged by both call sites, so a box's glitch cadence stays continuous across the loading-to-settled
// handoff (seed33Construction.ts ONLY overlay callsite; render/canvas2d.ts and render/webgl2.ts ONLY
// their own tile paths).
//
// Cadence: a fixed, per-tile-staggered rest/burst cycle — a >=1s fully-settled rest (nothing returned;
// the caller's own already-drawn rest pixels read through untouched) followed by one ~280ms readable
// burst (within the 200-350ms requirement) in which a bounded, sparse (~35%) subset of the box's own 4x4
// subcells show either a short bounded duplicate-edge offset or a half-strip scanline swap of THEIR OWN
// real source pixels — never another tile's, never a fabricated pattern. Each tile's own phase offset is
// hashed from its own region id/index/seed, so boxes never burst in lockstep (asynchronous, per the
// selected reference). No per-frame randomness: the burst's chosen cells/modes are quantized to the whole
// burst window (derived from `timeMs` only through the bounded cycle/phase arithmetic below), so the same
// (region, atlasSizePx, index, timeMs, seed) always yields the same output and nearby `timeMs` values
// inside one window yield identical output.
export const MAX_FORMED_GLITCH_PATCHES = 32;

/** Minimum readable rest between bursts (>=1s requirement). */
const FORMED_REST_MS = 1300;
/** Burst hold length (200-350ms requirement). */
const FORMED_BURST_MS = 280;
const FORMED_CYCLE_MS = FORMED_REST_MS + FORMED_BURST_MS;
/** Fraction of the 16 subcells that glitch during one burst: sparse/localized, not a whole-box flash. */
const FORMED_GLITCH_FRACTION = 0.35;

export interface FormedTileGlitchInput {
  region: PhotoTileRegion;
  atlasSizePx: readonly [number, number];
  index: number;
  timeMs: number;
  seed: number;
  /**
   * Normalised-frame destination offset already applied to this box's own current rest position (e.g.
   * the settled renderers' existing `tileDriftOffset`), so the overlay always lands exactly on the box's
   * already-drawn pixels instead of a separately drifting duplicate. Defaults to no offset, matching the
   * construction-build call site, which never drifts before the build completes.
   */
  anchorOffset?: { dx: number; dy: number };
}

/**
 * Bounded, deterministic post-formation glitch overlay for one already-formed box-overlay region. Returns
 * `[]` outside a burst window (including for invalid/missing geometry); during a burst, returns up to
 * `MAX_FORMED_GLITCH_PATCHES` texture patches covering only the glitching subcells. Callers must gate this
 * behind their own existing reduced-motion/hidden-tile suppression exactly like matrixTilePatches's own
 * callers already do — this helper has no such switch of its own, so a caller that must never show the
 * effect (reduced motion, a hidden tile) simply does not call it, leaving output byte-identical to before
 * this pass.
 */
export function formedTileGlitchPatches(input: FormedTileGlitchInput): readonly ConstructionPatch[] {
  const region = input?.region;
  if (region == null || typeof region.id !== 'string' || region.id.length === 0) return [];

  const atlasSizePx: readonly [number, number] = Array.isArray(input.atlasSizePx) && input.atlasSizePx.length === 2
    ? input.atlasSizePx
    : [1, 1];
  const template = cachedTemplate(region, atlasSizePx);
  if (template === null) return [];

  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed) >>> 0 : 0;
  const index = Number.isFinite(input.index) ? Math.trunc(input.index) >>> 0 : 0;
  const timeMs = Number.isFinite(input.timeMs) && input.timeMs >= 0 ? input.timeMs : 0;
  const anchorDx = Number.isFinite(input.anchorOffset?.dx) ? (input.anchorOffset as { dx: number }).dx : 0;
  const anchorDy = Number.isFinite(input.anchorOffset?.dy) ? (input.anchorOffset as { dy: number }).dy : 0;
  const regionSalt = (seed ^ stringHash(region.id) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;

  const phaseOffsetMs = hash01(regionSalt, 0xf1a5e000) * FORMED_CYCLE_MS;
  const shiftedMs = timeMs + phaseOffsetMs;
  const cyclePos = shiftedMs % FORMED_CYCLE_MS;
  if (!(cyclePos < FORMED_BURST_MS)) return [];
  const cycleIndex = Math.floor(shiftedMs / FORMED_CYCLE_MS) >>> 0;

  const idBase = `tile:${region.id}`;
  const output: ConstructionPatch[] = [];
  for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
    const glitchRoll = hash01(cellIndex, (regionSalt ^ 0x0faceaa ^ cycleIndex) >>> 0);
    if (glitchRoll >= FORMED_GLITCH_FRACTION) continue;

    const cell = template.cells[cellIndex]!;
    const destX0 = cell.destX0 + anchorDx;
    const destY0 = cell.destY0 + anchorDy;
    const destX1 = cell.destX1 + anchorDx;
    const destY1 = cell.destY1 + anchorDy;
    const modeRoll = hash01(cellIndex, (regionSalt ^ 0x0d00de ^ cycleIndex) >>> 0);
    if (modeRoll < 0.5) {
      // Short bounded duplicate-edge offset of the cell's own real crop (source UV unchanged).
      const dxRoll = hash01(cellIndex, (regionSalt ^ 0x0c330000 ^ cycleIndex) >>> 0);
      const dyRoll = hash01(cellIndex, (regionSalt ^ 0x0c440000 ^ cycleIndex) >>> 0);
      const dx = (dxRoll * 2 - 1) * MAX_OFFSET_X;
      const dy = (dyRoll * 2 - 1) * MAX_OFFSET_Y;
      pushQuad(output, `${idBase}:glitch-${cellIndex}`, 1, destX0 + dx, destY0 + dy, destX1 + dx, destY1 + dy, cell.uvX0, cell.uvY0, cell.uvX1, cell.uvY1);
    } else {
      // Sample the opposite source half into this strip. Repainting the matching source half would
      // be invisible over the already-drawn base tile, even though it emitted valid geometry.
      const topHalf = (cycleIndex % 2) === 0;
      const midY = (destY0 + destY1) / 2;
      const midV = (cell.uvY0 + cell.uvY1) / 2;
      if (topHalf) {
        pushQuad(output, `${idBase}:glitch-${cellIndex}`, 1, destX0, destY0, destX1, midY, cell.uvX0, midV, cell.uvX1, cell.uvY1);
      } else {
        pushQuad(output, `${idBase}:glitch-${cellIndex}`, 1, destX0, midY, destX1, destY1, cell.uvX0, cell.uvY0, cell.uvX1, midV);
      }
    }
    if (output.length >= MAX_FORMED_GLITCH_PATCHES) break;
  }

  return output.length > MAX_FORMED_GLITCH_PATCHES ? output.slice(0, MAX_FORMED_GLITCH_PATCHES) : output;
}
