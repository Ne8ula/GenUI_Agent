// Seed-33 post-formation feature-tracking overlay (w4-20261009-seed33-tracking-r2).
// Walk-away-r3 refinement: colored bodies now fragment around fixed anchors; their former
// whole-tile drift is retired. The inspected tracking grammar otherwise remains unchanged.
//
// Reference packet (inspected before writing/revising this file): week4/docs/design/revisions/
// w4-20261009-seed33-tracking-r2/REVIEW.md + provenance.json, references/images/img-01-corruption-
// tracking.png, references/videos/vid-02-image-conditioned.mp4 (+ temporal/100ms detail sheets),
// references/primary/gif-all-frames.jpg and video-detail-{3,15,29}.jpg (original primary references),
// implementation/before/matching/webgl2-formed-17000.png. Owner selection: localized saturated-RGB/
// channel separation over the warm scene, attached to the figure plus cup/chair/table, window/lamp/
// architecture and the real tile-chip accent swatches; original GIF/video stay primary for horizontal-
// tear shape and for mixed-size crossed-box/connector topology and cadence; the fresh Weave image/video
// guide only the localized raster/RGB-edge integration look, never their invented cafe/subject/layout,
// too-stable tracking or source-image drift.
//
// Revision (candidate inspection, same pass): (1) chromatic accents are now real offset single/dual-
// channel texture fragments of the actual sampled pixels (ConstructionPatch.channel, applied in
// render/constructionCanvas.ts via an SVG feColorMatrix filter and render/constructionWebgl.ts via a
// per-batch shader tint uniform; alpha is untouched by either), not flat coloured strokes. (2) each
// active feature now layers several independently-cycling thin source rows (disjoint: each can drop out
// on its own short hold) instead of one smooth stretched band. (3) tracking marks form genuine local
// clusters: most features stay sparse (1-2 marks, the original slower 1.6-3.2s hold) but a few, chosen
// per outer cluster-cycle, go "dense" (3-7 members, each independently acquiring/holding/dropping out on
// a short 150-650ms hold) -- never a global flash. Connectors only ever link spatially nearby features
// (or a dense cluster's own members), never frame-spanning. Accent anchors now add the SAME tile drift
// the base renderer already applies (seed33Photo.ts tileDriftOffset), via the caller-supplied
// `msAfterBuild`, so a drifted overlay mark never separates from its real drifted tile.
//
// This module REPLACES the prior per-tile `formedTileGlitchPatches` burst (scene/matrixTiles.ts) as the
// settled/post-formation overlay called by the renderers once the global construction build has
// completed (render/canvas2d.ts, render/webgl2.ts). `matrixTiles.ts` and `scene/seed33Construction.ts`
// are intentionally untouched: the old cell-burst keeps animating a tile for the rest of the construction
// build the instant that ONE tile individually settles (seed33Construction.ts's own `emitTile`), which is
// still "existing loading" per the owner's bounded scope, not the post-global-formation look this pass
// replaces.
//
// Every mark is AUTHORED, deterministic data (same seed/time inputs -> byte-identical output; nearby
// `timeMs` inside one local hold window is identical; no `Date.now()`/`Math.random()` anywhere).
// "Tracking" is a visual vocabulary, never real computer-vision measurement: the cup/chair/table/lamp
// anchors reuse the SAME real highlight points already authored in seed33Photo.ts's private
// `SHIMMER_SPOTS` (duplicated as plain numbers, since that constant isn't exported and this pass does not
// edit that file); the facade/"window" anchors are hand-identified from visually inspecting the actual
// rendered scene, not measured. Raster rows sample the SAME already-loaded background/foreground/figure/
// tiles bitmaps the settled renderers already draw (never a new asset, never a reference movie played
// back); the accent cluster always rides the manifest's own real tile regions.
//
// Determinism/bounds contract (mirrors matrixTiles.ts):
//  - Pure function of its inputs; no module-level mutable time-keyed state.
//  - `reducedMotion` freezes every local cycle to one fixed representative snapshot (REDUCED_
//    REPRESENTATIVE_MS) instead of reading `timeMs`, so the composition never changes -- a genuinely
//    static plan, not a slower animation. Figure anchors still follow the caller's (already-reduced) pose.
//  - Figure clusters are omitted once the caller's pose reports `offFrame`: nothing stays pinned to a
//    former position after the figure exits.
//  - Output is capped at MAX_POSTFORMATION_COMMANDS; every coordinate/UV is clamped into [0, 1].
import type { ConstructionChannel, ConstructionCommand, ConstructionTexture, ConstructionTextureVertex } from './constructionTypes.ts';
import type { PhotoTileRegion, Rgb } from './types.ts';
import { hash01 } from './rng.ts';
import { PALETTE } from './palette.ts';
import { ASPECT, FIGURE_MESH_ROWS, walkSwayOffsets } from './seed33Photo.ts';
import type { PhotoPose } from './seed33Photo.ts';

/** Generous defensive cap: layered rows + a few dense clusters typically total well under this. */
export const MAX_POSTFORMATION_COMMANDS = 600;

/** Fixed snapshot used for every local cycle while reduced motion is on: a representative mid-cycle
 * instant, not a clock read. Its exact value carries no other meaning. */
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

/** One texture command, with or without a channel tag (exactOptionalPropertyTypes: omit, never `undefined`). */
function texCmd(id: string, alpha: number, texture: ConstructionTexture, channel: ConstructionChannel | undefined, vertices: readonly [ConstructionTextureVertex, ConstructionTextureVertex, ConstructionTextureVertex]): ConstructionCommand {
  return channel
    ? { kind: 'texture', id, component: 'tracking-tear', alpha, texture, channel, vertices }
    : { kind: 'texture', id, component: 'tracking-tear', alpha, texture, vertices };
}

function pushQuad(
  output: ConstructionCommand[],
  idBase: string,
  alpha: number,
  dx0: number, dy0: number, dx1: number, dy1: number,
  u0: number, v0: number, u1: number, v1: number,
  texture: ConstructionTexture,
  channel?: ConstructionChannel,
): void {
  const v00 = vtx(dx0, dy0, u0, v0);
  const v10 = vtx(dx1, dy0, u1, v0);
  const v11 = vtx(dx1, dy1, u1, v1);
  const v01 = vtx(dx0, dy1, u0, v1);
  output.push(texCmd(`${idBase}:a`, alpha, texture, channel, [v00, v10, v11]));
  output.push(texCmd(`${idBase}:b`, alpha, texture, channel, [v00, v11, v01]));
}

/** Local chromatic-separation channel pairs (real single/dual-channel fragments, see constructionTypes.ts
 * `ConstructionChannel`). Owner-selected exception for this damage-indicator overlay only (2026-10-09):
 * the base scene's Paris-hue rule (scene/palette.ts) governs the particle/tile systems' ambient colour,
 * not this authored corruption vocabulary. PALETTE.sepiaInk/PALETTE.paper (already Paris-approved) supply
 * the bone/dark hairline box outlines; only the channel fragments isolate saturated real pixels. */
const DARK_HAIRLINE: Rgb = PALETTE.sepiaInk;
const BONE_HAIRLINE: Rgb = PALETTE.paper;

/** Deterministic discrete local cycle: a per-group hold length and phase, both derived from `groupSalt`,
 * so holds vary per cluster/row/member and never line up (staggered, never a shared global rest/flash).
 * Returns only the cycle index -- callers derive their own per-cycle choices from (groupSalt, cycleIndex). */
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

/** One rectangular tracking mark (plus an occasional diagonal X), re-rolled only at its own cycle
 * boundary (a discontinuous reacquisition, never a tween). Member-level primitive of emitFeatureCluster. */
function emitTrackingBox(output: ConstructionCommand[], idBase: string, cx: number, cy: number, salt: number, cycleIndex: number): BoxCenter {
  const w = 0.018 + hash01(salt, (0xb001 ^ cycleIndex) >>> 0) * 0.1;
  const aspectBias = hash01(salt, (0xb002 ^ cycleIndex) >>> 0);
  const h = 0.01 + aspectBias * aspectBias * 0.06;
  const jx = (hash01(salt, (0xb003 ^ cycleIndex) >>> 0) * 2 - 1) * 0.05;
  const jy = (hash01(salt, (0xb004 ^ cycleIndex) >>> 0) * 2 - 1) * 0.035;
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
  return { cx: bcx, cy: bcy };
}

const BOX_CLUSTER_HOLD_MIN_MS = 1600;
const BOX_CLUSTER_HOLD_MAX_MS = 3200;
/** Member-level refresh while a cluster is "dense": short acquisition/hold/dropout, informed by the
 * original video's 100ms-sampled reconfiguration pace. */
const DENSE_MEMBER_HOLD_MIN_MS = 150;
const DENSE_MEMBER_HOLD_MAX_MS = 650;
/** Fraction of outer cluster-cycles that go dense for a given feature: "a few selected features", not all. */
const DENSE_CHANCE = 0.32;
/** Member dropout while dense: a brief local absence (acquisition/dropout), not every member always shown. */
const DENSE_DROPOUT_CHANCE = 0.22;

/** A small mixed-size local network (3-7 members) at a feature the outer cycle selected as "dense" this
 * hold, or a sparse 1-2 member mark otherwise (the prior, slower baseline). Intra-cluster hairlines
 * connect dense members to their own first member (nearby by construction, never frame-spanning). */
function emitFeatureCluster(output: ConstructionCommand[], idBase: string, cx: number, cy: number, salt: number, effTimeMs: number): readonly BoxCenter[] {
  const clusterCycle = cyclePick(effTimeMs, salt, BOX_CLUSTER_HOLD_MIN_MS, BOX_CLUSTER_HOLD_MAX_MS, 0x3c01);
  const dense = hash01(salt, (0x3c02 ^ clusterCycle) >>> 0) < DENSE_CHANCE;
  const memberCount = dense
    ? 3 + Math.floor(hash01(salt, (0x3c03 ^ clusterCycle) >>> 0) * 5)
    : 1 + (hash01(salt, (0x3c04 ^ clusterCycle) >>> 0) < 0.3 ? 1 : 0);

  const centers: BoxCenter[] = [];
  for (let m = 0; m < memberCount; m += 1) {
    const memberSalt = (salt ^ Math.imul(m + 1, 0x27d4eb2f)) >>> 0;
    const holdMin = dense ? DENSE_MEMBER_HOLD_MIN_MS : BOX_CLUSTER_HOLD_MIN_MS;
    const holdMax = dense ? DENSE_MEMBER_HOLD_MAX_MS : BOX_CLUSTER_HOLD_MAX_MS;
    const memberCycle = cyclePick(effTimeMs, memberSalt, holdMin, holdMax, 0x3c10 ^ m);
    if (dense && hash01(memberSalt, (0x3c20 ^ memberCycle) >>> 0) < DENSE_DROPOUT_CHANCE) continue;
    centers.push(emitTrackingBox(output, `${idBase}:m${m}`, cx, cy, memberSalt, memberCycle));
  }

  if (dense && centers.length > 1) {
    const hub = centers[0]!;
    for (let i = 1; i < centers.length; i += 1) {
      const member = centers[i]!;
      const linkSalt = (salt ^ Math.imul(i + 900, 0x165667b1)) >>> 0;
      if (hash01(linkSalt, (0x3c30 ^ clusterCycle) >>> 0) >= 0.5) continue;
      output.push({ kind: 'stroke', id: `${idBase}:link-${i}`, component: 'tracking-connector', alpha: 0.32, widthPx: 0.8, colour: DARK_HAIRLINE, points: [[hub.cx, hub.cy], [member.cx, member.cy]] });
    }
  }
  return centers;
}

const TEAR_ROW_HOLD_MIN_MS = 90;
const TEAR_ROW_HOLD_MAX_MS = 240;
const TEAR_ROWS_MIN = 3;
const TEAR_ROWS_MAX = 6;
/** Chance a disjoint row drops out on its own hold (never all rows present at once). */
const ROW_DROPOUT_CHANCE = 0.3;

/** Several independently-cycling thin source rows around a feature: disjoint (each can be briefly
 * absent), own staggered source/destination offsets, an occasional repeated real-image edge echo, and a
 * real offset single/dual-channel fragment pair (the chromatic-separation accent) on about half of them.
 * Replaces one smooth stretched band with the reference's layered, broken raster silhouette. */
function emitLayeredRows(
  output: ConstructionCommand[],
  idBase: string,
  texture: ConstructionTexture,
  destCx: number,
  destCy: number,
  srcU0: number, srcV0: number, srcU1: number, srcV1: number,
  salt: number,
  effTimeMs: number,
): void {
  const rowCount = TEAR_ROWS_MIN + Math.floor(hash01(salt, 0xe001) * (TEAR_ROWS_MAX - TEAR_ROWS_MIN + 1));
  const srcVSpan = Math.max(0.002, srcV1 - srcV0);

  for (let r = 0; r < rowCount; r += 1) {
    const rowSalt = (salt ^ Math.imul(r + 7, 0x2545f491)) >>> 0;
    const rowCycle = cyclePick(effTimeMs, rowSalt, TEAR_ROW_HOLD_MIN_MS, TEAR_ROW_HOLD_MAX_MS, 0x9a00 ^ r);
    if (hash01(rowSalt, (0x9a10 ^ rowCycle) >>> 0) < ROW_DROPOUT_CHANCE) continue;

    const rowDestDy = destCy + (hash01(rowSalt, (0x9a20 ^ rowCycle) >>> 0) * 2 - 1) * 0.024;
    const rowSrcV0 = clamp01(srcV0 + hash01(rowSalt, (0x9a30 ^ rowCycle) >>> 0) * srcVSpan * 0.7);
    const rowSrcV1 = clamp01(rowSrcV0 + 0.0015 + hash01(rowSalt, (0x9a40 ^ rowCycle) >>> 0) * 0.003);
    const thickerRoll = hash01(rowSalt, (0x9a45 ^ rowCycle) >>> 0);
    const stretchW = 0.03 + hash01(rowSalt, (0x9a50 ^ rowCycle) >>> 0) * 0.075 * (thickerRoll < 0.15 ? 1.6 : 1);
    const shiftX = (hash01(rowSalt, (0x9a60 ^ rowCycle) >>> 0) * 2 - 1) * 0.038;
    const thin = (0.0035 + hash01(rowSalt, (0x9a70 ^ rowCycle) >>> 0) * 0.0055) * (thickerRoll < 0.15 ? 2.4 : 1);
    const dx0 = clamp01(destCx + shiftX - stretchW / 2);
    const dx1 = clamp01(dx0 + stretchW);
    const dy0 = clamp01(rowDestDy - thin / 2);
    const dy1 = clamp01(dy0 + thin);
    pushQuad(output, `${idBase}:row${r}`, 0.78, dx0, dy0, dx1, dy1, srcU0, rowSrcV0, srcU1, rowSrcV1, texture);

    // Repeated real-image edge/contour echo: a smaller, clipped, displaced repeat of this same row.
    if (hash01(rowSalt, (0x9a80 ^ rowCycle) >>> 0) < 0.4) {
      const ew = stretchW * (0.3 + hash01(rowSalt, (0x9a90 ^ rowCycle) >>> 0) * 0.35);
      const ex0 = clamp01(dx0 + (hash01(rowSalt, (0x9aa0 ^ rowCycle) >>> 0) * 2 - 1) * 0.022);
      pushQuad(output, `${idBase}:row${r}:echo`, 0.3, ex0, dy0, clamp01(ex0 + ew), dy1, srcU0, rowSrcV0, srcU1, rowSrcV1, texture);
    }

    // Offset real single/dual-channel fragment pair: the actual sampled pixels, each copy isolated to
    // one or two channels and shifted a couple of px apart -- the chromatic-separation accent.
    if (hash01(rowSalt, (0x9ab0 ^ rowCycle) >>> 0) < 0.5) {
      const useCyanRed = hash01(rowSalt, (0x9ac0 ^ rowCycle) >>> 0) < 0.5;
      const chA: ConstructionChannel = useCyanRed ? 'cyan' : 'magenta';
      const chB: ConstructionChannel = useCyanRed ? 'r' : 'g';
      const fringe = 0.0028;
      pushQuad(output, `${idBase}:row${r}:ch-a`, 0.5, clamp01(dx0 - fringe), dy0, clamp01(dx1 - fringe), dy1, srcU0, rowSrcV0, srcU1, rowSrcV1, texture, chA);
      pushQuad(output, `${idBase}:row${r}:ch-b`, 0.5, clamp01(dx0 + fringe), dy0, clamp01(dx1 + fringe), dy1, srcU0, rowSrcV0, srcU1, rowSrcV1, texture, chB);
    }
  }
}

/** Maps a (u, v) point in the figure sprite's own local space to its current on-screen frame-normalised
 * destination, reusing the exact same centre/width/per-row-sway transform render/canvas2d.ts and
 * render/webgl2.ts already apply to the base figure draw (seed33Photo.ts's pose/walkSwayOffsets), so a
 * row anchored on a shoulder/torso point tracks the figure's approach, sway and eventual exit. */
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
 * visually identified from the actual rendered scene, not measured). */
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
const ACCENT_HOLD_MIN_MS = 1800;
const ACCENT_HOLD_MAX_MS = 3400;
/** Connector distance gate: a fraction of the frame diagonal, so links only ever join nearby features
 * (favoring e.g. cup<->table-right) and never span the whole scene. */
const NEARBY_CONNECTOR_DISTANCE = 0.3;
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
  /** Retained caller timing field; the r3 body fragments use it, but tracking anchors no longer drift. */
  msAfterBuild: number;
  /** The figure's current pose/aspect, or `null` before its assets/pose are available. Omitted (or
   * `pose.offFrame`) entirely suppresses the figure clusters for this call. */
  figure: PostFormationFigureInput | null;
}

interface LiveFeature {
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
 * Bounded, deterministic post-formation feature-tracking overlay for the whole settled Seed-33 scene: a
 * combined pass of local tracking-cluster marks (sparse at most features, a genuine mixed-size 3-7-member
 * network at a few selected ones) and layered, disjoint source-sampled rows with real offset single/
 * dual-channel fragment accents, attached to the figure (while on frame), cup/chair/table, lamp/facade
 * "windows", and a rotating, drift-matched subset of the real tile-chip accents. Returns `readonly
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

  const features: LiveFeature[] = [];

  for (let i = 0; i < FURNITURE_ANCHORS.length; i += 1) {
    const a = FURNITURE_ANCHORS[i]!;
    features.push({
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
      features.push({
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
      const regionIndex = (startIndex + k) % regions.length;
      const region = regions[regionIndex]!;
      if (!isFiniteQuad(region.rectNorm) || !isFiniteQuad(region.sourceBoxPx)) continue;
      const [rx, ry, rw, rh] = region.rectNorm;
      const [sx0, sy0, sx1, sy1] = region.sourceBoxPx;
      // Walk-away-r3 fragments around fixed tile anchors; whole-chip drift is retired.
      const drift = { dx: 0, dy: 0 };
      features.push({
        id: `accent-${region.id}`,
        texture: 'tiles',
        destCx: rx + rw / 2 + drift.dx,
        destCy: ry + rh / 2 + drift.dy,
        srcU0: clamp01(sx0 / atlasW),
        srcV0: clamp01(sy0 / atlasH),
        srcU1: clamp01(sx1 / atlasW),
        srcV1: clamp01(sy1 / atlasH),
        salt: (seed ^ stringHash(region.id) ^ Math.imul(k + 500, 0x9e3779b1)) >>> 0,
      });
    }
  }

  if (features.length === 0) return [];

  const output: ConstructionCommand[] = [];

  for (const f of features) {
    emitFeatureCluster(output, `track:${f.id}`, f.destCx, f.destCy, f.salt, effTimeMs);
    emitLayeredRows(output, `tear:${f.id}`, f.texture, f.destCx, f.destCy, f.srcU0, f.srcV0, f.srcU1, f.srcV1, f.salt, effTimeMs);
  }

  // Inter-feature connectors: nearby anchors only (never frame-spanning). O(n^2) over a small, bounded
  // feature list (furniture + figure + a handful of accents), so no spatial index is needed.
  for (let i = 0; i < features.length; i += 1) {
    for (let j = i + 1; j < features.length; j += 1) {
      const a = features[i]!;
      const b = features[j]!;
      const distance = Math.hypot(a.destCx - b.destCx, a.destCy - b.destCy);
      if (distance > NEARBY_CONNECTOR_DISTANCE) continue;
      const pairSalt = (a.salt ^ b.salt) >>> 0;
      const pairCycle = cyclePick(effTimeMs, pairSalt, CONNECTOR_HOLD_MIN_MS, CONNECTOR_HOLD_MAX_MS, 0xc0ec);
      if (hash01(pairSalt, (0xc0de ^ pairCycle) >>> 0) >= 0.35) continue;
      const dark = hash01(pairSalt, (0xc0e1 ^ pairCycle) >>> 0) < 0.5;
      output.push({
        kind: 'stroke',
        id: `connector:${a.id}-${b.id}`,
        component: 'tracking-connector',
        alpha: dark ? 0.4 : 0.3,
        widthPx: 0.8,
        colour: dark ? DARK_HAIRLINE : BONE_HAIRLINE,
        points: [[a.destCx, a.destCy], [b.destCx, b.destCy]],
      });
    }
  }

  return output.length > MAX_POSTFORMATION_COMMANDS ? output.slice(0, MAX_POSTFORMATION_COMMANDS) : output;
}
