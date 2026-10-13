// Seed-33 post-formation feature-tracking overlay (w4-20261009-seed33-tracking-r2).
//
// Reference packet (inspected before writing this file): week4/docs/design/revisions/
// w4-20261009-seed33-tracking-r2/REVIEW.md + provenance.json, references/images/img-01-corruption-
// tracking.png, references/videos/vid-02-image-conditioned.mp4 (+ its temporal/100ms detail sheets),
// references/primary/gif-all-frames.jpg and video-detail-{3,15,29}.jpg (original primary references),
// implementation/before/matching/webgl2-formed-17000.png and canvas2d-formed-17000.png. Owner selection:
// localized saturated RGB/channel separation over the warm scene, attached to the figure plus cup/
// chair/table, window/lamp/architecture and the real tile-chip accent swatches; original GIF/video stay
// primary for horizontal-tear/raster-breakup shape and for mixed-size crossed-box/connector topology and
// cadence; the fresh Weave image/video are used only for the localized raster/RGB-edge integration look,
// never for their invented cafe/subject/layout, their too-stable tracking or their source-image drift.
//
// This module REPLACES the prior per-tile `formedTileGlitchPatches` burst (scene/matrixTiles.ts) as the
// settled/post-formation overlay called by the renderers once the global construction build has
// completed (render/canvas2d.ts, render/webgl2.ts). `matrixTiles.ts` and `scene/seed33Construction.ts`
// are intentionally left unchanged: the old cell-burst keeps animating a tile for the remainder of the
// construction build the instant that ONE tile individually settles (seed33Construction.ts's own
// `emitTile`), which is still "existing loading" per the owner's bounded scope, not the post-global-
// formation look this pass replaces.
//
// Every geometric mark here is AUTHORED, deterministic data (same seed/time inputs -> byte-identical
// output; nearby `timeMs` inside one local hold window is identical; no `Date.now()`/`Math.random()`
// anywhere). "Tracking" is a visual vocabulary, never real computer-vision measurement: the cup/chair/
// table/lamp anchors below reuse the SAME real highlight points already authored in seed33Photo.ts's
// SHIMMER_SPOTS (duplicated here as plain numbers, not an import, since that constant is private to that
// module and this pass does not edit it); the architecture/window anchors are hand-identified from
// visually inspecting the actual rendered scene (implementation/before/matching/webgl2-formed-17000.png),
// not measured. Raster tears sample the SAME already-loaded background/foreground/figure/tiles bitmaps
// the settled renderers already draw (never a new asset, never a reference movie played back); the accent
// cluster's "tracking" always rides the manifest's own real tile regions, never an invented position.
//
// Determinism/bounds contract (mirrors matrixTiles.ts's existing modules):
//  - Pure function of its inputs; no module-level mutable time-keyed state.
//  - `reducedMotion` freezes every local cycle to one fixed representative snapshot (REDUCED_
//    REPRESENTATIVE_MS below) instead of reading `timeMs` at all, so the composition never changes while
//    reduced motion is on -- not a slower animation, a genuinely static plan. The figure anchors still
//    follow whatever (already-reduced, "home") pose the caller passes in.
//  - The figure clusters are omitted entirely once the caller's supplied pose reports `offFrame`, so nothing
//    is left pinned to her former location after she exits.
//  - Output is capped at MAX_POSTFORMATION_COMMANDS; every coordinate is clamped into [0, 1] (frame-
//    normalised) or [0, 1] (UV) before being pushed.
import type { ConstructionCommand, ConstructionTexture, ConstructionTextureVertex } from './constructionTypes.ts';
import type { PhotoTileRegion, Rgb } from './types.ts';
import { hash01 } from './rng.ts';
import { PALETTE } from './palette.ts';
import { ASPECT, FIGURE_MESH_ROWS, walkSwayOffsets } from './seed33Photo.ts';
import type { PhotoPose } from './seed33Photo.ts';

export const MAX_POSTFORMATION_COMMANDS = 320;

/** Fixed snapshot used for every local cycle while reduced motion is on: a representative mid-cycle
 * instant, not a read of any clock. Chosen only so the static composition looks "mid-activity" rather
 * than lining every cluster up at its own cycle-zero boundary; its exact value carries no other meaning. */
const REDUCED_REPRESENTATIVE_MS = 1800;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Small FNV-1a style string hash, independently authored here (matrixTiles.ts's own copy is private to
 * that file and this pass does not edit it). */
function stringHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function isFiniteQuad(value: unknown): value is readonly [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function vtx(x: number, y: number, u: number, v: number): ConstructionTextureVertex {
  return { x: clamp01(x), y: clamp01(y), u: clamp01(u), v: clamp01(v) };
}

function pushQuad(
  output: ConstructionCommand[],
  idBase: string,
  alpha: number,
  dx0: number,
  dy0: number,
  dx1: number,
  dy1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  texture: ConstructionTexture,
): void {
  const v00 = vtx(dx0, dy0, u0, v0);
  const v10 = vtx(dx1, dy0, u1, v0);
  const v11 = vtx(dx1, dy1, u1, v1);
  const v01 = vtx(dx0, dy1, u0, v1);
  output.push({ kind: 'texture', id: `${idBase}:a`, component: 'tracking-tear', alpha, texture, vertices: [v00, v10, v11] });
  output.push({ kind: 'texture', id: `${idBase}:b`, component: 'tracking-tear', alpha, texture, vertices: [v00, v11, v01] });
}

/** Local chromatic-separation accent pairs (saturated cyan/red or magenta/green). Owner-selected palette
 * exception for THIS damage-indicator overlay only (2026-10-09): the base scene's existing Paris-hue rule
 * (scene/palette.ts, enforced on the particle/tile systems) is about the ambient courtyard look, not this
 * authored "digital corruption" vocabulary the reference images/video explicitly show in saturated
 * cyan/magenta/red/green at damaged edges. PALETTE.sepiaInk/PALETTE.paper (already Paris-approved tokens)
 * supply the "bone/dark hairline" box outlines so only the edge accents use the new saturated pairs. */
const CYAN: Rgb = [0.15, 0.82, 0.88];
const RED: Rgb = [0.92, 0.2, 0.24];
const MAGENTA: Rgb = [0.9, 0.18, 0.72];
const GREEN: Rgb = [0.26, 0.86, 0.42];
const DARK_HAIRLINE: Rgb = PALETTE.sepiaInk;
const BONE_HAIRLINE: Rgb = PALETTE.paper;

/** Deterministic discrete local cycle: a per-group hold length and phase, both derived from `groupSalt`,
 * so holds vary per cluster and never line up (staggered, never a shared global rest/flash). Returns only
 * the cycle index -- callers derive their own per-cycle choices from (groupSalt, cycleIndex). */
function cyclePick(effTimeMs: number, groupSalt: number, holdMinMs: number, holdMaxMs: number, tag: number): number {
  const holdMs = holdMinMs + hash01(groupSalt, (tag ^ 0x1001) >>> 0) * (holdMaxMs - holdMinMs);
  const phaseMs = hash01(groupSalt, (tag ^ 0x2002) >>> 0) * holdMs;
  const shifted = effTimeMs + phaseMs;
  return Math.floor(shifted / holdMs) >>> 0;
}

interface BoxCenter {
  cx: number;
  cy: number;
}

/** One rectangular tracking mark (plus optional diagonal cross / split sibling) anchored near (cx, cy).
 * Widely varying size/aspect, occasional diagonal X, occasional second (split) box: all re-rolled only at
 * this cluster's own cycle boundary (`cycleIndex`), i.e. a discontinuous reacquisition, never a tween. */
function emitTrackingBox(output: ConstructionCommand[], idBase: string, cx: number, cy: number, salt: number, cycleIndex: number): BoxCenter {
  const w = 0.02 + hash01(salt, (0xb001 ^ cycleIndex) >>> 0) * 0.095;
  const aspectBias = hash01(salt, (0xb002 ^ cycleIndex) >>> 0);
  const h = 0.011 + aspectBias * aspectBias * 0.058;
  const jx = (hash01(salt, (0xb003 ^ cycleIndex) >>> 0) * 2 - 1) * 0.045;
  const jy = (hash01(salt, (0xb004 ^ cycleIndex) >>> 0) * 2 - 1) * 0.03;
  const bcx = cx + jx;
  const bcy = cy + jy;
  const x0 = clamp01(bcx - w / 2);
  const x1 = clamp01(bcx + w / 2);
  const y0 = clamp01(bcy - h / 2);
  const y1 = clamp01(bcy + h / 2);
  const dark = hash01(salt, (0xb005 ^ cycleIndex) >>> 0) < 0.55;
  const colour = dark ? DARK_HAIRLINE : BONE_HAIRLINE;
  const alpha = dark ? 0.8 : 0.58;
  output.push({ kind: 'stroke', id: `${idBase}:box`, component: 'tracking-box', alpha, widthPx: 1.15, colour, points: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]] });

  if (hash01(salt, (0xb006 ^ cycleIndex) >>> 0) < 0.4) {
    output.push({ kind: 'stroke', id: `${idBase}:cross-a`, component: 'tracking-box', alpha: alpha * 0.85, widthPx: 1, colour, points: [[x0, y0], [x1, y1]] });
    output.push({ kind: 'stroke', id: `${idBase}:cross-b`, component: 'tracking-box', alpha: alpha * 0.85, widthPx: 1, colour, points: [[x1, y0], [x0, y1]] });
  }

  if (hash01(salt, (0xb007 ^ cycleIndex) >>> 0) < 0.3) {
    const w2 = w * (0.35 + hash01(salt, (0xb008 ^ cycleIndex) >>> 0) * 0.35);
    const h2 = h * (0.5 + hash01(salt, (0xb009 ^ cycleIndex) >>> 0) * 0.5);
    const jx2 = jx + (hash01(salt, (0xb00a ^ cycleIndex) >>> 0) * 2 - 1) * 0.05;
    const jy2 = jy + (hash01(salt, (0xb00b ^ cycleIndex) >>> 0) * 2 - 1) * 0.035;
    const sx0 = clamp01(cx + jx2 - w2 / 2);
    const sx1 = clamp01(cx + jx2 + w2 / 2);
    const sy0 = clamp01(cy + jy2 - h2 / 2);
    const sy1 = clamp01(cy + jy2 + h2 / 2);
    output.push({ kind: 'stroke', id: `${idBase}:box2`, component: 'tracking-box', alpha: alpha * 0.8, widthPx: 1, colour, points: [[sx0, sy0], [sx1, sy0], [sx1, sy1], [sx0, sy1], [sx0, sy0]] });
  }

  return { cx: bcx, cy: bcy };
}

/** One source-sampled horizontal tear: a thin stretched ribbon from a small real pixel slice, an
 * occasional thicker displaced fragment, a fainter repeated echo, and two thin saturated-channel edge
 * slivers (chromatic separation confined to the damaged edges, never a full-rect tint). */
function emitTear(
  output: ConstructionCommand[],
  idBase: string,
  texture: ConstructionTexture,
  destCx: number,
  destCy: number,
  srcU0: number,
  srcV0: number,
  srcU1: number,
  srcV1: number,
  salt: number,
  cycleIndex: number,
): void {
  const stretchW = 0.05 + hash01(salt, (0xd001 ^ cycleIndex) >>> 0) * 0.09;
  const thin = 0.006 + hash01(salt, (0xd002 ^ cycleIndex) >>> 0) * 0.01;
  const shiftX = (hash01(salt, (0xd003 ^ cycleIndex) >>> 0) * 2 - 1) * 0.03;
  const shiftY = (hash01(salt, (0xd004 ^ cycleIndex) >>> 0) * 2 - 1) * 0.012;
  const dx0 = clamp01(destCx + shiftX - stretchW / 2);
  const dx1 = clamp01(destCx + shiftX + stretchW / 2);
  const dy0 = clamp01(destCy + shiftY - thin / 2);
  const dy1 = clamp01(destCy + shiftY + thin / 2);
  pushQuad(output, `${idBase}:tear`, 0.88, dx0, dy0, dx1, dy1, srcU0, srcV0, srcU1, srcV1, texture);

  if (hash01(salt, (0xd005 ^ cycleIndex) >>> 0) < 0.3) {
    const tw = stretchW * (0.4 + hash01(salt, (0xd006 ^ cycleIndex) >>> 0) * 0.3);
    const th = thin * (2.2 + hash01(salt, (0xd007 ^ cycleIndex) >>> 0) * 1.6);
    const fx0 = clamp01(destCx - tw / 2 + shiftX * 0.6);
    const fx1 = clamp01(fx0 + tw);
    const fy0 = clamp01(destCy - th / 2 + shiftY * 0.6);
    const fy1 = clamp01(fy0 + th);
    pushQuad(output, `${idBase}:fragment`, 0.8, fx0, fy0, fx1, fy1, srcU0, srcV0, srcU1, srcV1, texture);
  }

  pushQuad(output, `${idBase}:echo`, 0.32, clamp01(dx0 + 0.009), clamp01(dy0 + 0.004), clamp01(dx1 + 0.009), clamp01(dy1 + 0.004), srcU0, srcV0, srcU1, srcV1, texture);

  const useCyanRed = hash01(salt, (0xd008 ^ cycleIndex) >>> 0) < 0.5;
  const colA = useCyanRed ? CYAN : MAGENTA;
  const colB = useCyanRed ? RED : GREEN;
  output.push({ kind: 'stroke', id: `${idBase}:chroma-a`, component: 'tracking-chroma', alpha: 0.42, widthPx: 1.1, colour: colA, points: [[dx0, dy0], [dx1, dy0]] });
  output.push({ kind: 'stroke', id: `${idBase}:chroma-b`, component: 'tracking-chroma', alpha: 0.42, widthPx: 1.1, colour: colB, points: [[dx0, dy1], [dx1, dy1]] });
}

/** Maps a (u, v) point in the figure sprite's own local space to its current on-screen frame-normalised
 * destination, reusing the exact same centre/width/per-row-sway transform render/canvas2d.ts and
 * render/webgl2.ts already apply to the base figure draw (seed33Photo.ts's pose/walkSwayOffsets), so a
 * tear anchored on her shoulder/torso tracks her approach, sway and eventual exit instead of drifting. */
function figureDestPoint(pose: PhotoPose, nativeAspect: number, reducedMotion: boolean, u: number, v: number): BoxCenter {
  const heightFrac = pose.heightFrac;
  const widthFrac = heightFrac * (nativeAspect / ASPECT);
  const rows = FIGURE_MESH_ROWS;
  const sway = walkSwayOffsets(pose.legPhase, rows, reducedMotion);
  const rowIndex = Math.min(rows - 1, Math.max(0, Math.round(v * (rows - 1))));
  const swayFrac = ((sway[rowIndex] ?? 0) * heightFrac) / ASPECT;
  const cx = pose.centerX + swayFrac;
  return { cx: cx - widthFrac / 2 + u * widthFrac, cy: pose.headTopY + v * heightFrac };
}

/** Fixed, hand-identified real-feature anchors (cup rim / chair / table ends reuse seed33Photo.ts's
 * SHIMMER_SPOTS highlight points; the lamp reuses its lamp-glass point; the two facade/window points are
 * visually identified from implementation/before/matching/webgl2-formed-17000.png, not measured). */
interface FurnitureAnchor {
  id: string;
  texture: ConstructionTexture;
  cx: number;
  cy: number;
}
const FURNITURE_ANCHORS: readonly FurnitureAnchor[] = [
  { id: 'cup', texture: 'foreground', cx: 0.7, cy: 0.768 },
  { id: 'table-left', texture: 'foreground', cx: 0.12, cy: 0.79 },
  { id: 'table-right', texture: 'foreground', cx: 0.88, cy: 0.79 },
  { id: 'chair', texture: 'foreground', cx: 0.185, cy: 0.56 },
  { id: 'lamp', texture: 'background', cx: 0.5755, cy: 0.5 },
  { id: 'facade-left', texture: 'background', cx: 0.07, cy: 0.32 },
  { id: 'facade-right', texture: 'background', cx: 0.93, cy: 0.3 },
];

const FIGURE_SPOTS: readonly { id: string; u: number; v: number; eu: number; ev: number }[] = [
  { id: 'figure-shoulder', u: 0.5, v: 0.15, eu: 0.09, ev: 0.03 },
  { id: 'figure-torso', u: 0.5, v: 0.35, eu: 0.1, ev: 0.045 },
];

const ANCHOR_SOURCE_HALF_WIDTH = 0.014;
const ANCHOR_SOURCE_HALF_HEIGHT = 0.009;

const BOX_HOLD_MIN_MS = 1600;
const BOX_HOLD_MAX_MS = 3200;
const TEAR_HOLD_MIN_MS = 700;
const TEAR_HOLD_MAX_MS = 1400;
const ACCENT_HOLD_MIN_MS = 1800;
const ACCENT_HOLD_MAX_MS = 3400;
const CONNECTOR_HOLD_MIN_MS = 1800;
const CONNECTOR_HOLD_MAX_MS = 3400;

export interface PostFormationFigureInput {
  pose: PhotoPose;
  nativeAspect: number;
}

export interface PostFormationOverlayInput {
  /** Host-clock ms (view.timeMs). Never read from Date.now() internally. */
  timeMs: number;
  seed: number;
  reducedMotion: boolean;
  /** The manifest's real tile-chip regions (accent-group attachment); may be empty. */
  tileRegions: readonly PhotoTileRegion[];
  atlasSizePx: readonly [number, number];
  /** The figure's current pose/aspect, or `null` before her assets/pose are available. Omitted (or
   * `pose.offFrame`) entirely suppresses the figure clusters for this call. */
  figure: PostFormationFigureInput | null;
}

interface LiveCluster {
  id: string;
  texture: ConstructionTexture;
  destCx: number;
  destCy: number;
  srcU0: number;
  srcV0: number;
  srcU1: number;
  srcV1: number;
  salt: number;
}

/**
 * Bounded, deterministic post-formation feature-tracking overlay for the whole settled Seed-33 scene:
 * one combined pass of authored tracking-box/cross/connector marks and source-sampled raster tears with
 * local saturated-RGB edge accents, attached to the figure (while on frame), cup/chair/table, lamp/
 * facade "windows", and a rotating subset of the real tile-chip accents. Returns `readonly
 * ConstructionCommand[]`, drawable through the SAME shared construction consumer (render/
 * constructionCanvas.ts, render/constructionWebgl.ts) matrixTiles.ts's commands already use, so both
 * backends render identically from one plan. Callers gate this behind their own existing showTiles/hidden
 * switch exactly like formedTileGlitchPatches's callers already do (this helper has no such switch of its
 * own): simply do not call it to get a byte-identical, overlay-free frame.
 */
export function buildPostFormationOverlay(input: PostFormationOverlayInput): readonly ConstructionCommand[] {
  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed) >>> 0 : 0;
  const reducedMotion = !!input.reducedMotion;
  const rawTimeMs = Number.isFinite(input.timeMs) && input.timeMs >= 0 ? input.timeMs : 0;
  const effTimeMs = reducedMotion ? REDUCED_REPRESENTATIVE_MS : rawTimeMs;

  const clusters: LiveCluster[] = [];

  for (let i = 0; i < FURNITURE_ANCHORS.length; i += 1) {
    const a = FURNITURE_ANCHORS[i]!;
    clusters.push({
      id: a.id,
      texture: a.texture,
      destCx: a.cx,
      destCy: a.cy,
      srcU0: clamp01(a.cx - ANCHOR_SOURCE_HALF_WIDTH),
      srcV0: clamp01(a.cy - ANCHOR_SOURCE_HALF_HEIGHT),
      srcU1: clamp01(a.cx + ANCHOR_SOURCE_HALF_WIDTH),
      srcV1: clamp01(a.cy + ANCHOR_SOURCE_HALF_HEIGHT),
      salt: (seed ^ stringHash(a.id) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0,
    });
  }

  const figure = input.figure;
  if (figure != null && !figure.pose.offFrame) {
    const { pose, nativeAspect } = figure;
    for (let i = 0; i < FIGURE_SPOTS.length; i += 1) {
      const spot = FIGURE_SPOTS[i]!;
      const dest = figureDestPoint(pose, nativeAspect, reducedMotion, spot.u, spot.v);
      clusters.push({
        id: spot.id,
        texture: 'figure',
        destCx: dest.cx,
        destCy: dest.cy,
        srcU0: clamp01(spot.u - spot.eu),
        srcV0: clamp01(spot.v - spot.ev),
        srcU1: clamp01(spot.u + spot.eu),
        srcV1: clamp01(spot.v + spot.ev),
        salt: (seed ^ stringHash(spot.id) ^ Math.imul(i + 101, 0x9e3779b1)) >>> 0,
      });
    }
  }

  const regions = input.tileRegions;
  const [atlasW, atlasH] = input.atlasSizePx;
  if (regions.length > 0 && atlasW > 0 && atlasH > 0) {
    const accentSalt = (seed ^ stringHash('accent')) >>> 0;
    const accentCycle = cyclePick(effTimeMs, accentSalt, ACCENT_HOLD_MIN_MS, ACCENT_HOLD_MAX_MS, 0xa1a1);
    const count = Math.min(regions.length, hash01(accentSalt, (0xacce1 ^ accentCycle) >>> 0) < 0.5 ? 3 : 5);
    const startIndex = Math.floor(hash01(accentSalt, (0xacce2 ^ accentCycle) >>> 0) * regions.length);
    for (let k = 0; k < count; k += 1) {
      const region = regions[(startIndex + k) % regions.length]!;
      if (!isFiniteQuad(region.rectNorm) || !isFiniteQuad(region.sourceBoxPx)) continue;
      const [rx, ry, rw, rh] = region.rectNorm;
      const [sx0, sy0, sx1, sy1] = region.sourceBoxPx;
      clusters.push({
        id: `accent-${region.id}`,
        texture: 'tiles',
        destCx: rx + rw / 2,
        destCy: ry + rh / 2,
        srcU0: clamp01(sx0 / atlasW),
        srcV0: clamp01(sy0 / atlasH),
        srcU1: clamp01(sx1 / atlasW),
        srcV1: clamp01(sy1 / atlasH),
        salt: (seed ^ stringHash(region.id) ^ Math.imul(k + 500, 0x9e3779b1)) >>> 0,
      });
    }
  }

  if (clusters.length === 0) return [];

  const output: ConstructionCommand[] = [];
  const centers: BoxCenter[] = new Array(clusters.length);

  for (let i = 0; i < clusters.length; i += 1) {
    const c = clusters[i]!;
    const boxCycle = cyclePick(effTimeMs, c.salt, BOX_HOLD_MIN_MS, BOX_HOLD_MAX_MS, 0x30c1);
    centers[i] = emitTrackingBox(output, `track:${c.id}`, c.destCx, c.destCy, c.salt, boxCycle);
    const tearCycle = cyclePick(effTimeMs, c.salt, TEAR_HOLD_MIN_MS, TEAR_HOLD_MAX_MS, 0x7ea2);
    emitTear(output, `tear:${c.id}`, c.texture, c.destCx, c.destCy, c.srcU0, c.srcV0, c.srcU1, c.srcV1, c.salt, tearCycle);
  }

  for (let i = 0; i < clusters.length; i += 1) {
    const a = clusters[i]!;
    const b = clusters[(i + 1) % clusters.length]!;
    if (a === b) continue;
    const pairSalt = (a.salt ^ b.salt) >>> 0;
    const pairCycle = cyclePick(effTimeMs, pairSalt, CONNECTOR_HOLD_MIN_MS, CONNECTOR_HOLD_MAX_MS, 0xc0ec);
    if (hash01(pairSalt, (0xc0de ^ pairCycle) >>> 0) >= 0.35) continue;
    const ca = centers[i]!;
    const cb = centers[(i + 1) % clusters.length]!;
    const dark = hash01(pairSalt, (0xc0e1 ^ pairCycle) >>> 0) < 0.5;
    output.push({
      kind: 'stroke',
      id: `connector:${a.id}-${b.id}`,
      component: 'tracking-connector',
      alpha: dark ? 0.4 : 0.3,
      widthPx: 0.8,
      colour: dark ? DARK_HAIRLINE : BONE_HAIRLINE,
      points: [[ca.cx, ca.cy], [cb.cx, cb.cy]],
    });
  }

  return output.length > MAX_POSTFORMATION_COMMANDS ? output.slice(0, MAX_POSTFORMATION_COMMANDS) : output;
}
