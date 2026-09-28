/**
 * Pure, DOM-free descriptor generators for the "digital material" vocabulary
 * requested after owner rejection of the first two renders (revision
 * w3-20260927-02 follow-up): a richly colored discrete pixel/cell matrix
 * inside the sculptural eye, a dense field of varying-size tracking boxes
 * with X/corner-tick marks and sparse connecting lines, and horizontal
 * data-smear ribbons during processing.
 *
 * This module only produces plain descriptor arrays (angles, fractions,
 * color keys) -- render.ts converts them to pixels and draws them. That
 * keeps the placement/seeding math testable without a canvas, and keeps
 * render.ts the single place that knows about actual pixel geometry and the
 * light direction.
 *
 * Determinism: every generator is a pure function of its inputs. Seeds come
 * from `frame.fragmentSeed` (stable per composition, never a live-changing
 * spring value -- see runtime.ts) so the field of cells/boxes doesn't
 * reshuffle every frame; only continuous, already-evaluated time offsets
 * (e.g. `buildSmearBands`'s `timeSec` parameter) may vary frame to frame.
 */

import { hashSeed, mulberry32, type Rng } from "./rng";
import type { PaletteWeights } from "./palette";

const TAU = Math.PI * 2;

export type DigitalColorKey = "magenta" | "cyan" | "lime" | "blue" | "pearl";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function colorWeights(pw: PaletteWeights): Record<DigitalColorKey, number> {
  const pearl = Math.max(0, pw.pearl);
  const magenta = Math.max(0, pw.lavender * 0.7 + pw.coral * 0.3);
  const cyan = Math.max(0, pw.ice * 0.6);
  const blue = Math.max(0, pw.ice * 0.4);
  const lime = Math.max(0, pw.coral * 0.7);
  const total = pearl + magenta + cyan + blue + lime;
  if (!(total > 0)) return { pearl: 0.2, magenta: 0.2, cyan: 0.2, blue: 0.2, lime: 0.2 };
  return { pearl: pearl / total, magenta: magenta / total, cyan: cyan / total, blue: blue / total, lime: lime / total };
}

function pickColor(rng: Rng, weights: Record<DigitalColorKey, number>): DigitalColorKey {
  const roll = rng();
  let acc = 0;
  const order: DigitalColorKey[] = ["pearl", "magenta", "cyan", "blue", "lime"];
  for (const key of order) {
    acc += weights[key];
    if (roll <= acc) return key;
  }
  return "pearl";
}

export interface MatrixCell {
  /** Angle around the eye's center. */
  theta: number;
  /** 0..1, position between the core hole and the rim margin (never the exact center or exact rim). */
  radiusFrac: number;
  /** Half-width of the cell, in radians of angular span. */
  angularHalfSpan: number;
  /** Half-height of the cell, as a fraction of the matrix band's own radial extent. */
  radialHalfSpan: number;
  colorKey: DigitalColorKey;
  /** 0..1 baseline brightness variation (before render-time directional lighting). */
  brightness: number;
}

export interface BuildMatrixCellsOptions {
  seed: number;
  maxCells: number;
  paletteWeights: PaletteWeights;
  /** Fraction of the matrix boundary left as a plain dark core/pupil hole. */
  coreHoleFrac?: number;
  /** Fraction of the matrix boundary left as a plain margin just inside the rim. */
  rimMarginFrac?: number;
  ringCount?: number;
  baseSlicesPerRing?: number;
}

/**
 * A dense polar grid of discrete cells filling the annulus between
 * `coreHoleFrac` (so the center stays a clean dark pupil) and
 * `1 - rimMarginFrac` (so there's a quiet rim before the boundary), with
 * more cells per ring further out so cell area stays roughly even. Bounded
 * to `maxCells` both by construction (tuned ring/slice counts) and by an
 * explicit guard, so a caller-supplied `maxCells` is always a hard ceiling.
 */
export function buildMatrixCells(opts: BuildMatrixCellsOptions): MatrixCell[] {
  const coreHoleFrac = opts.coreHoleFrac ?? 0.3;
  const rimMarginFrac = opts.rimMarginFrac ?? 0.06;
  const ringCount = Math.max(1, opts.ringCount ?? 26);
  const baseSlices = Math.max(1, opts.baseSlicesPerRing ?? 100);
  const usable = Math.max(0.02, 1 - coreHoleFrac - rimMarginFrac);

  const rng = mulberry32(hashSeed(opts.seed, "matrix"));
  const weights = colorWeights(opts.paletteWeights);
  const cells: MatrixCell[] = [];

  for (let ring = 0; ring < ringCount && cells.length < opts.maxCells; ring++) {
    const ringFrac = ringCount > 1 ? ring / (ringCount - 1) : 0;
    const radiusFrac = coreHoleFrac + ringFrac * usable;
    const slices = clamp(Math.round(baseSlices * (0.35 + radiusFrac)), 6, 200);
    const radialHalfSpan = (usable / ringCount) * 0.42;
    for (let s = 0; s < slices && cells.length < opts.maxCells; s++) {
      const jitter = (rng() - 0.5) * (TAU / slices) * 0.25;
      const theta = (s / slices) * TAU + jitter;
      const radialJitter = (rng() - 0.5) * (usable / ringCount) * 0.3;
      cells.push({
        theta,
        radiusFrac: clamp(radiusFrac + radialJitter, coreHoleFrac, 1 - rimMarginFrac),
        angularHalfSpan: (TAU / slices) * 0.42,
        radialHalfSpan,
        colorKey: pickColor(rng, weights),
        brightness: 0.5 + rng() * 0.5,
      });
    }
  }
  return cells;
}

export interface TrackingBoxDescriptor {
  theta: number;
  /** 0..1, position relative to the current live silhouette radius at `theta` (never beyond the contour). */
  radiusFrac: number;
  /** Fraction of min(viewport width, height). */
  size: number;
  opacity: number;
  hasX: boolean;
  hasCornerTicks: boolean;
  /** Index of another box in the same returned array to draw a sparse connecting line to, or null. */
  connectToIndex: number | null;
}

export interface BuildTrackingBoxesOptions {
  seed: number;
  /** Angles of the runtime-owned "real" anchors (frame.boxes); rendered as the primary, highest-opacity boxes. */
  anchorAngles: number[];
  /** Desired total box count, already derived by the caller from actual turn-state activity. */
  targetCount: number;
  maxCount: number;
}

/**
 * A dense field of tracking boxes: the runtime's own state-driven anchors
 * first (primary, on-contour), then seeded companion boxes scattered across
 * interior feature points and the contour, with occasional X marks, corner
 * ticks, and sparse connecting lines between a handful of boxes -- matching
 * the reference vocabulary (week3 revision w3-20260927-02 follow-up).
 * `targetCount <= 0` returns an empty array (no boxes), so an emptied
 * `frame.boxes` -- e.g. after End -- still results in no rendered boxes.
 */
export function buildTrackingBoxes(opts: BuildTrackingBoxesOptions): TrackingBoxDescriptor[] {
  const count = Math.max(0, Math.min(opts.maxCount, Math.round(opts.targetCount)));
  if (count <= 0) return [];

  const rng = mulberry32(hashSeed(opts.seed, "boxes"));
  const boxes: TrackingBoxDescriptor[] = [];

  for (let i = 0; i < opts.anchorAngles.length && boxes.length < count; i++) {
    boxes.push({
      theta: opts.anchorAngles[i],
      radiusFrac: 1,
      size: 0.04 + rng() * 0.02,
      opacity: 0.85,
      hasX: rng() > 0.5,
      hasCornerTicks: rng() > 0.5,
      connectToIndex: null,
    });
  }

  while (boxes.length < count) {
    const theta = rng() * TAU;
    const radiusFrac = 0.3 + rng() * 0.7; // interior feature points through the contour, never beyond it
    const roll = rng();
    boxes.push({
      theta,
      radiusFrac,
      size: 0.015 + rng() * 0.025,
      opacity: 0.25 + rng() * 0.45,
      hasX: roll < 0.4,
      hasCornerTicks: roll >= 0.4 && roll < 0.8,
      connectToIndex: null,
    });
  }

  const maxConnections = Math.floor(boxes.length / 4);
  for (let i = 0; i < maxConnections; i++) {
    const from = Math.floor(rng() * boxes.length);
    let to = Math.floor(rng() * boxes.length);
    if (to === from) to = (to + 1) % boxes.length;
    boxes[from].connectToIndex = to;
  }

  return boxes;
}

export interface LandmarkPoint {
  x: number;
  y: number;
}

export interface LandmarkBoxDescriptor {
  /** Pixel-space position (same space as the supplied landmarks -- render.ts applies the shared warp before calling this). */
  x: number;
  y: number;
  /** Fraction of min(viewport width, height). */
  size: number;
  opacity: number;
  hasX: boolean;
  hasCornerTicks: boolean;
  connectToIndex: number | null;
}

export interface BuildTrackingBoxesFromLandmarksOptions {
  seed: number;
  /** Actual feature landmarks (already warped into final pixel space by the caller), e.g. from rasterizeWeek1Eye. */
  landmarks: LandmarkPoint[];
  targetCount: number;
  maxCount: number;
}

/**
 * The same dense, varying-size, X/corner-tick, sparsely-connected tracking-
 * box field as `buildTrackingBoxes`, but attached to *actual* feature
 * landmarks (owner clarification, 2026-09-27: "apply SAME geometric warp to
 * raster vertices/pixel strips and actual feature landmarks so boxes attach
 * to eye") rather than an abstract silhouette angle. Every real landmark
 * becomes a primary, highest-opacity box; if more boxes are requested than
 * there are landmarks, companions are placed at seeded points *between*
 * pairs of real landmarks, so the whole field still visibly relates to the
 * eye's actual features rather than floating independently.
 * `targetCount <= 0` or an empty `landmarks` array returns no boxes.
 */
export function buildTrackingBoxesFromLandmarks(opts: BuildTrackingBoxesFromLandmarksOptions): LandmarkBoxDescriptor[] {
  const count = Math.max(0, Math.min(opts.maxCount, Math.round(opts.targetCount)));
  if (count <= 0 || opts.landmarks.length === 0) return [];

  const rng = mulberry32(hashSeed(opts.seed, "landmark-boxes"));
  const boxes: LandmarkBoxDescriptor[] = [];

  for (let i = 0; i < opts.landmarks.length && boxes.length < count; i++) {
    boxes.push({
      x: opts.landmarks[i].x,
      y: opts.landmarks[i].y,
      size: 0.04 + rng() * 0.02,
      opacity: 0.85,
      hasX: rng() > 0.5,
      hasCornerTicks: rng() > 0.5,
      connectToIndex: null,
    });
  }

  while (boxes.length < count && opts.landmarks.length > 0) {
    const a = opts.landmarks[Math.floor(rng() * opts.landmarks.length)];
    const b = opts.landmarks[Math.floor(rng() * opts.landmarks.length)];
    const t = rng();
    const jitter = 0.06;
    const roll = rng();
    boxes.push({
      x: a.x + (b.x - a.x) * t + (rng() - 0.5) * jitter * Math.abs(a.x - b.x || 1),
      y: a.y + (b.y - a.y) * t + (rng() - 0.5) * jitter * Math.abs(a.y - b.y || 1),
      size: 0.015 + rng() * 0.025,
      opacity: 0.25 + rng() * 0.45,
      hasX: roll < 0.4,
      hasCornerTicks: roll >= 0.4 && roll < 0.8,
      connectToIndex: null,
    });
  }

  const maxConnections = Math.floor(boxes.length / 4);
  for (let i = 0; i < maxConnections; i++) {
    const from = Math.floor(rng() * boxes.length);
    let to = Math.floor(rng() * boxes.length);
    if (to === from) to = (to + 1) % boxes.length;
    boxes[from].connectToIndex = to;
  }

  return boxes;
}

export interface SmearBandDropout {
  /** 0..1, position along the band's own horizontal span. */
  startFrac: number;
  /** 0..1, width of the gap along the band's own span. */
  widthFrac: number;
}

export interface SmearBand {
  /** -1..1ish, vertical position as a fraction of the eye's own vertical extent (can exceed 1 slightly). */
  yFrac: number;
  /** Fraction of min(viewport width, height). */
  heightFrac: number;
  colorKey: DigitalColorKey;
  /** Continuous horizontal displacement (already evaluated at the caller's timeSec), fraction of min dimension. */
  horizontalShiftFrac: number;
  /** Half-width the band spans outward from center, fraction of min dimension -- intentionally beyond the eye's own radius. */
  extendFrac: number;
  dropouts: SmearBandDropout[];
  channelSeparated: boolean;
}

export interface BuildSmearBandsOptions {
  seed: number;
  /** 0..1, current fragmentation amount (only non-zero while actually processing -- see runtime.ts). */
  fragmentation: number;
  maxBands: number;
  /** Seconds; drives continuous drift. Must come from `frame.timeSec` so it freezes correctly under reduced motion/inactive. */
  timeSec: number;
}

const SMEAR_COLOR_ORDER: DigitalColorKey[] = ["magenta", "cyan", "lime", "blue"];

/**
 * Multi-row horizontal data-smear bands extending outward from the eye,
 * bounded by `maxBands` and scaled by `fragmentation` (only processing ever
 * produces them -- runtime.ts already zeroes fragmentation everywhere else,
 * including instantly on interrupt/End). Band identity (position, color,
 * dropouts) is seeded once per composition; only the horizontal displacement
 * is a continuous function of `timeSec`, so nothing reshuffles frame to
 * frame (the flicker bug from revision w3-20260927-01).
 */
export function buildSmearBands(opts: BuildSmearBandsOptions): SmearBand[] {
  if (opts.fragmentation <= 0.01) return [];
  const count = clamp(Math.round(opts.maxBands * opts.fragmentation), 1, opts.maxBands);
  const rng = mulberry32(hashSeed(opts.seed, "smear"));
  const bands: SmearBand[] = [];
  for (let i = 0; i < count; i++) {
    const yFrac = (rng() - 0.5) * 1.7;
    const heightFrac = 0.008 + rng() * 0.03;
    const colorKey = SMEAR_COLOR_ORDER[Math.floor(rng() * SMEAR_COLOR_ORDER.length)];
    const driftSpeed = 0.05 + rng() * 0.2;
    const driftPhase = rng() * TAU;
    const driftAmp = 0.05 + rng() * 0.14;
    const extendFrac = 0.35 + rng() * 0.45;
    const dropoutCount = 1 + Math.floor(rng() * 3);
    const dropouts: SmearBandDropout[] = Array.from({ length: dropoutCount }, () => ({
      startFrac: rng(),
      widthFrac: 0.04 + rng() * 0.12,
    }));
    bands.push({
      yFrac,
      heightFrac,
      colorKey,
      horizontalShiftFrac: Math.sin(opts.timeSec * driftSpeed + driftPhase) * driftAmp,
      extendFrac,
      dropouts,
      channelSeparated: rng() > 0.6,
    });
  }
  return bands;
}
