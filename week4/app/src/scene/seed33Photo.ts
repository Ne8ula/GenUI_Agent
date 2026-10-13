// Current walk-away-r3 uses the retained rear-figure derivative and live articulation in
// walkAwayFigure.ts. The approach/drift helpers below remain historical compatibility APIs;
// the settled renderers no longer call them. Environment and tile source images stay unchanged.
// The seed-33 fidelity rebuild's figure approach and photo-layer scene (w4-20261008-seed33-fidelity-r1).
// Bounded, owner-authorized exception to the project's normal no-reference-pixels-at-runtime rule for
// THIS pass only (AskUserQuestion, 2026-10-08 session): a reference-derived background/figure/foreground
// plate (main-owned extraction script; public/assets/seed33/manifest.json) carries the structural
// fidelity (architecture, objects, the woman's shaded coat/hair/pose, the real tile-chip pixels); this
// module supplies the live geometry/animation the owner required on top of it — the figure's approach
// and continuation, a walk-cycle mesh deform, and the real tile chips' small bounded drift. No video
// frame or frame atlas is read at runtime; VB2 was used only as an approximate visual guide to the
// approach's shape (see the manifest's vb2Measurement), not decoded here.
//
// Candidate-2 correction (2026-10-08, reviewer-driven): removed this module's own authorTiles-driven
// procedural tile patterns entirely (they were stacking synthetic dither/checkerboard swatches over the
// SAME real colour chips already visible in the source photo, at approximate hand-authored zones that
// did not line up with the chips' real positions — the "doubled tiles" defect). The 28 real chip
// rectangles (id/rect/sourceBoxPx/group) now come from the manifest at runtime and are drawn as
// independent textured quads by the renderer (render/photoAssets.ts + webgl2.ts/canvas2d.ts), never as
// procedural patterns; tiles.ts/authorTiles is untouched and still used by the arrival look's tests.
import { createStore, hexToRgb } from './store.ts';
import { createWriter, emit, beginRegion, endRegion } from './author.ts';
import { PALETTE as P } from './palette.ts';
import { hash01 } from './rng.ts';
import type { Pt } from './author.ts';
import type { PhotoLayer, RegionSpec, Rgb, SceneFrame } from './types.ts';

export const ASPECT = 16 / 9;

/** Warm umber-black ground (frame.paper): the letterbox colour outside the photo's frame rect. */
export const GROUND: Rgb = hexToRgb('#1a1210');

export const ASSET_BASE = '/assets/seed33';
export const PHOTO_LAYER: PhotoLayer = {
  backgroundSrc: `${ASSET_BASE}/background.png`,
  figureSrc: `${ASSET_BASE}/figure-away.png`,
  foregroundSrc: `${ASSET_BASE}/foreground.png`,
  settledForegroundSrc: `${ASSET_BASE}/foreground-away.png`,
  tilesSrc: `${ASSET_BASE}/tiles.png`,
  manifestSrc: `${ASSET_BASE}/manifest-walk-away-v2.json`,
};

// ---------------------------------------------------------------------------
// The approach curve (candidate-2 correction, 2026-10-08). Two changes from the first pass, both from
// the reviewer's findings:
//
// 1. "No extra home offset": the t = 0 (build-complete) placement is now whatever `home` the caller
//    passes in — in practice the renderer reads it straight from manifest.figure.cropBoxInBackgroundFrac
//    (the figure's ACTUAL traced crop box), not a separately-authored constant that could drift from it.
//    The VB2-inspected samples below are kept ONLY as an approximate visual guide to the SHAPE of the
//    approach (how fast she grows, how far right/up she drifts per unit of growth) — manifest.json calls
//    them "direct visual reference guides only, no automated tracking measurement", and this file does
//    not call them "measured" either.
// 2. The exit is no longer a hard `heightMul >= 4` clamp (the reviewer proved that cull removed a huge,
//    centrally-visible figure at ~8.25s — confirmed by inspecting the main revision's
//    implementation/candidate-1/motion/idle-10000.png and idle-18000.png, which show an empty street
//    where she should still be enormous and on-screen). The figure is now culled only once its actual
//    transformed bounding box no longer intersects the visible frame at all (figureBoundsNorm /
//    isFullyOffFrame below); a late numerical-safety time cap (near the growth curve's own asymptote)
//    is a backstop only, and its value is chosen generously past where the bounds math already predicts
//    a real exit (see scene-seed33.test.ts for the non-tautological check at both sides of that boundary).

/** One VB2-inspected sample (manifest.json vb2Measurement.approachSamples): an approximate visual guide
 * to the approach's shape, explicitly NOT a measurement. All five are used (piecewise between them, then
 * a smooth continuation past the last one), not just the first/last. */
export interface ApproachGuideSample {
  tMs: number;
  centerX: number;
  headTopY: number;
  height: number;
}
export const APPROACH_GUIDE_SAMPLES: readonly ApproachGuideSample[] = [
  { tMs: 0, centerX: 0.3646, headTopY: 0.3558, height: 0.3933 },
  { tMs: 1250, centerX: 0.371, headTopY: 0.345, height: 0.421 },
  { tMs: 2500, centerX: 0.383, headTopY: 0.323, height: 0.463 },
  { tMs: 3750, centerX: 0.407, headTopY: 0.281, height: 0.54 },
  { tMs: 4960, centerX: 0.461, headTopY: 0.215, height: 0.721 },
];
export const APPROACH_SPAN_S = 4.96;
/** Gait frequency (cycles/s); reuses the bead rig's own measured stepHz for continuity with prior work. */
export const STEP_HZ = 1.35;

const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

interface GuideRow {
  tMs: number;
  heightRatio: number;
  centerXDelta: number;
  headTopYDelta: number;
}
/** The guide samples re-expressed relative to their own first sample (ratio for height, delta for position), so they can be added on top of whatever real `home` the caller supplies instead of replacing it. */
const GUIDE_TABLE: readonly GuideRow[] = (() => {
  const base = APPROACH_GUIDE_SAMPLES[0]!;
  return APPROACH_GUIDE_SAMPLES.map((s) => ({
    tMs: s.tMs,
    heightRatio: s.height / base.height,
    centerXDelta: s.centerX - base.centerX,
    headTopYDelta: s.headTopY - base.headTopY,
  }));
})();

function interpGuide(tMs: number): GuideRow {
  const table = GUIDE_TABLE;
  const first = table[0]!;
  if (tMs <= first.tMs) return first;
  for (let i = 1; i < table.length; i++) {
    const row = table[i]!;
    if (tMs <= row.tMs) {
      const prev = table[i - 1]!;
      const f = (tMs - prev.tMs) / (row.tMs - prev.tMs);
      return {
        tMs,
        heightRatio: lerp(prev.heightRatio, row.heightRatio, f),
        centerXDelta: lerp(prev.centerXDelta, row.centerXDelta, f),
        headTopYDelta: lerp(prev.headTopYDelta, row.headTopYDelta, f),
      };
    }
  }
  return table[table.length - 1]!;
}

/** Smooth continuation past the last guide sample, fit through its last two points so the acceleration
 * the five samples already show keeps going (not flattening to a constant rate) — required for a genuine
 * eventual exit rather than an ever-growing figure that never leaves (see module comment above). */
const LAST = GUIDE_TABLE[GUIDE_TABLE.length - 1]!;
const PREV = GUIDE_TABLE[GUIDE_TABLE.length - 2]!;
function solveHyperbolic(t3: number, r3: number, t4: number, r4: number): { a: number; vanish: number } {
  const vanish = (r3 * t3 - r4 * t4) / (r3 - r4);
  return { a: r4 * (1 - t4 / vanish), vanish };
}
const HEIGHT_FIT = solveHyperbolic(PREV.tMs / 1000, PREV.heightRatio, LAST.tMs / 1000, LAST.heightRatio);
/** Numerical-safety cap, generous past where the bounds math already predicts a real exit (tested). */
const SAFE_T_S = HEIGHT_FIT.vanish * 0.999;

function heightRatioAt(tS: number): number {
  const tMs = tS * 1000;
  if (tMs <= LAST.tMs) return interpGuide(tMs).heightRatio;
  const safeT = Math.min(tS, SAFE_T_S);
  return HEIGHT_FIT.a / (1 - safeT / HEIGHT_FIT.vanish);
}

/** centreX/headTopY deltas past the last guide sample scale proportionally with the (unbounded) height
 * ratio, not with elapsed time — required so the sprite's width (which scales with height) cannot grow
 * faster than its lateral position forever, which would make it fill the frame on both sides without
 * ever fully exiting (see the module comment and scene-seed33.test.ts). */
function deltaAt(tS: number): { centerXDelta: number; headTopYDelta: number } {
  const tMs = tS * 1000;
  if (tMs <= LAST.tMs) {
    const row = interpGuide(tMs);
    return { centerXDelta: row.centerXDelta, headTopYDelta: row.headTopYDelta };
  }
  const scale = heightRatioAt(tS) / LAST.heightRatio;
  return { centerXDelta: LAST.centerXDelta * scale, headTopYDelta: LAST.headTopYDelta * scale };
}

// ---------------------------------------------------------------------------
// The "12 s nearest-first fixture build" for the photo layer. The background photo already has the
// café furniture baked into the lower rows of its own pixels (see background.png), so a single
// bottom-to-top soft wipe keyed to frame y reveals near content before far content, standing in for
// the former per-object birth times; the figure (mid-depth: after the near objects, before the
// façades, matching their old relative order) gets its own short fade window inside the same build.
// Both complete at buildMs and, matching every other authored region, are already complete at t = 0
// for a zero-length build. Reduced motion does not gate these: like the former birth ramps, construction
// is a one-time reveal, not a repeating or togglable motion the "disable approach/tile flashes"
// requirement is about.

/** Soft edge half-width (frame-height units) of the background/foreground reveal wipe. */
export const BUILD_REVEAL_BAND = 0.12;

/** Bottom-to-top reveal threshold (frame y): pixels with y > this are revealed; y < this stay hidden. */
export function buildRevealY(buildMs: number, timeMs: number): number {
  if (!(buildMs > 0)) return -BUILD_REVEAL_BAND;
  const progress = Math.min(1, Math.max(0, timeMs / buildMs));
  return 1 + BUILD_REVEAL_BAND - progress * (1 + 2 * BUILD_REVEAL_BAND);
}

/** The figure's fade-in window as a fraction of buildMs (she is mid-depth in the former build order). */
export const FIGURE_BUILD_FADE: readonly [number, number] = [0.2, 0.4];

/** The figure's own build-phase alpha (1 once the build completes or for a zero-length build). */
export function figureBuildAlpha(buildMs: number, timeMs: number): number {
  if (!(buildMs > 0)) return 1;
  return smoothstep(buildMs * FIGURE_BUILD_FADE[0], buildMs * FIGURE_BUILD_FADE[1], timeMs);
}

export interface PhotoHome {
  /** Frame-fraction x of the sprite's horizontal centre at t = 0 (manifest.figure.cropBoxInBackgroundFrac). */
  centerX: number;
  /** Frame-fraction y of the sprite's top edge at t = 0. */
  topY: number;
  /** Frame-fraction height of the sprite at t = 0. */
  heightFrac: number;
}
/** Fallback home (and the value scene-seed33.test.ts exercises) when a real manifest crop box is not supplied: the still-reference numbers recorded in public/assets/seed33/manifest.json figure.cropBoxInBackgroundFrac at the time this was written. The renderer always passes the live-fetched value; this is not re-asserted as current truth. */
export const DEFAULT_HOME: PhotoHome = { centerX: 0.362869, topY: 0.348958, heightFrac: 0.405599 };
/** Fallback native aspect (width / height) of the figure sprite; the renderer always reads the decoded bitmap's own size instead. */
export const DEFAULT_NATIVE_ASPECT = 228 / 623;

export interface PhotoPose {
  /** Frame-fraction x of the sprite's horizontal centre. */
  centerX: number;
  /** Frame-fraction y of the sprite's top edge. */
  headTopY: number;
  /** Frame-fraction height of the sprite (already includes `home.heightFrac`; not a multiple to re-apply). */
  heightFrac: number;
  /** True once the sprite's own transformed bounds no longer intersect the visible frame at all (figureBoundsNorm / isFullyOffFrame) — never set from height or elapsed time alone. Renderers may skip drawing her once true. */
  offFrame: boolean;
  /** Gait phase (radians) for the walk-cycle mesh deform; 0 and frozen under reduced motion. */
  legPhase: number;
}

export interface FigureBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The figure sprite's bounding box in frame-normalised coordinates (can extend outside 0..1) for a pose and the sprite's native aspect (width / height). */
export function figureBoundsNorm(pose: Pick<PhotoPose, 'centerX' | 'headTopY' | 'heightFrac'> & { legPhase?: number }, nativeAspect: number): FigureBounds {
  const widthFrac = pose.heightFrac * (nativeAspect / ASPECT);
  const sway = walkSwayOffsets(pose.legPhase ?? 0);
  const leftSway = Math.min(...sway) * pose.heightFrac / ASPECT;
  const rightSway = Math.max(...sway) * pose.heightFrac / ASPECT;
  return {
    left: pose.centerX - widthFrac / 2 + leftSway,
    right: pose.centerX + widthFrac / 2 + rightSway,
    top: pose.headTopY,
    bottom: pose.headTopY + pose.heightFrac,
  };
}

/** True only when the box has no intersection at all with the visible [0,1]x[0,1] frame — not "large" or "past some height". */
export function isFullyOffFrame(b: FigureBounds): boolean {
  return b.right <= 0 || b.left >= 1 || b.bottom <= 0 || b.top >= 1;
}

/**
 * The figure's pose at `tMsAfterBuild` (host-clock ms since the build completed; negative or during the
 * build clamps to 0, the still pose). Reduced motion holds exactly at `home` (the owner's explicit
 * requirement: approach disabled, she stays visible at the reference pose) without touching the clock
 * that computed it — call this every draw with the live reducedMotion flag; nothing here mutates frame
 * state, so pausing/resuming or toggling reduced motion needs no rebuild or replay. `home` and
 * `nativeAspect` should come from the runtime-fetched manifest and the decoded figure bitmap respectively
 * (DEFAULT_HOME/DEFAULT_NATIVE_ASPECT are fallbacks for tests and for a draw before either has loaded).
 */
export function photoApproachPose(tMsAfterBuild: number, reducedMotion: boolean, home: PhotoHome = DEFAULT_HOME, nativeAspect: number = DEFAULT_NATIVE_ASPECT): PhotoPose {
  if (reducedMotion) return { centerX: home.centerX, headTopY: home.topY, heightFrac: home.heightFrac, offFrame: false, legPhase: 0 };
  const tS = Math.max(0, tMsAfterBuild) / 1000;
  const heightRatio = heightRatioAt(tS);
  const { centerXDelta, headTopYDelta } = deltaAt(tS);
  const pose = {
    centerX: home.centerX + centerXDelta,
    headTopY: home.topY + headTopYDelta,
    heightFrac: home.heightFrac * heightRatio,
  };
  // Do not wrap the phase: the non-integer foot harmonic would jump at every wrap.
  const legPhase = 2 * Math.PI * STEP_HZ * Math.min(tS, SAFE_T_S);
  const offFrame = isFullyOffFrame(figureBoundsNorm({ ...pose, legPhase }, nativeAspect));
  return { ...pose, offFrame, legPhase };
}

// ---------------------------------------------------------------------------
// Walk-cycle mesh deform (candidate-2: "actual leg/coat gait deformation not global sideways sway only,
// if feasible"): a thin vertical strip of rows from the sprite's top (shoulders, no sway) to its bottom
// (feet). Still a single mesh column (a multi-column, per-limb skeletal mesh would be a renderer
// redesign, out of this bounded pass's scope) but no longer one uniform sine: the coat/hip band gets the
// primary stride sway, and the boot band ADDS a second, faster, smaller harmonic approximating alternate
// foot placement (heel strike roughly twice per stride) riding on top of the hip sway rather than moving
// in lockstep with it — closer to a front-facing gait than a single rigid pendulum, while honestly still
// a 2D cutout: it does not separate or occlude the two legs from each other.
export const FIGURE_MESH_ROWS = 14;
/** Sway starts at this fraction down the sprite (roughly the hip) and ramps to 1 at the feet. */
export const SWAY_START_FRACTION = 0.46;
/** The boot/foot harmonic only applies below this fraction (below the knee, roughly). */
export const FOOT_START_FRACTION = 0.82;
/** Peak sideways sway, as a fraction of the sprite's own height. */
export const SWAY_AMPLITUDE = 0.03;
/** Peak additional foot-harmonic sway, smaller and faster than the hip sway. */
export const FOOT_AMPLITUDE = 0.012;
export const FOOT_HARMONIC = 2.15; // not an exact integer multiple, so it reads as a gait, not a buzz

/** Row weight 0..1: 0 above SWAY_START_FRACTION, ramping linearly to 1 at the bottom row. */
export function swayWeight(rowFraction: number): number {
  return Math.max(0, Math.min(1, (rowFraction - SWAY_START_FRACTION) / (1 - SWAY_START_FRACTION)));
}

/** Foot-harmonic weight 0..1: 0 above FOOT_START_FRACTION, ramping linearly to 1 at the bottom row. */
export function footWeight(rowFraction: number): number {
  return Math.max(0, Math.min(1, (rowFraction - FOOT_START_FRACTION) / (1 - FOOT_START_FRACTION)));
}

/** Per-row sideways offsets (fraction of sprite height) for one mesh column at the given gait phase. */
export function walkSwayOffsets(legPhase: number, rows: number = FIGURE_MESH_ROWS, reducedMotion = false): Float32Array {
  const out = new Float32Array(rows);
  const scale = reducedMotion ? 0.4 : 1;
  const hip = Math.sin(legPhase) * scale * SWAY_AMPLITUDE;
  const foot = Math.sin(legPhase * FOOT_HARMONIC) * scale * FOOT_AMPLITUDE;
  for (let i = 0; i < rows; i++) {
    const rowFraction = rows <= 1 ? 1 : i / (rows - 1);
    out[i] = hip * swayWeight(rowFraction) + foot * footWeight(rowFraction);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Region metadata for tiles.ts (it only reads id/band/depth/dynamic and the array's length/order for
// "nearness"; it never reads particles). No beads are authored for these regions in this scene: the
// architecture, lamps, far walkers and café furniture are the reference photo, not per-object beads.
export const REGION_ORDER = [
  'layer:far', 'layer:facade/mansard', 'layer:facade/right', 'layer:facade/left', 'obj:awning',
  'obj:lamp-post/far', 'obj:lamp-post', 'actors:passersby/woman', 'obj:neighbour-chair', 'obj:table',
  'obj:ashtray', 'obj:saucer', 'obj:cup',
] as const;
const REGION_BAND: Record<(typeof REGION_ORDER)[number], RegionSpec['band']> = {
  'layer:far': 'far',
  'layer:facade/mansard': 'facade',
  'layer:facade/right': 'facade',
  'layer:facade/left': 'facade',
  'obj:awning': 'facade',
  'obj:lamp-post/far': 'facade',
  'obj:lamp-post': 'pavement',
  'actors:passersby/woman': 'pavement',
  'obj:neighbour-chair': 'near',
  'obj:table': 'near',
  'obj:ashtray': 'near',
  'obj:saucer': 'near',
  'obj:cup': 'near',
};
const REGION_DEPTH: Record<(typeof REGION_ORDER)[number], number> = {
  'layer:far': -40,
  'layer:facade/mansard': -14,
  'layer:facade/right': -7,
  'layer:facade/left': -6,
  'obj:awning': -5,
  'obj:lamp-post/far': -8,
  'obj:lamp-post': -3.2,
  'actors:passersby/woman': -2.2,
  'obj:neighbour-chair': -0.12,
  'obj:table': -0.05,
  'obj:ashtray': -0.08,
  'obj:saucer': 0,
  'obj:cup': 0,
};

// ---------------------------------------------------------------------------
// A small, genuinely alive shimmer-bead accent over the photo's own brightest highlights (the lamp
// lantern, the cup/table rim and the chair hoop), reusing the existing, already-tested particle
// pipeline unchanged (pack.ts / webgl2.ts PARTICLE_VERT/FRAG / canvas2d.ts). "Modest localized shimmer",
// not a redesign: a few dozen beads, not the previous thousands-strong procedural façade/figure/object
// construction this revision replaces for structural fidelity.
const SHIMMER_SPOTS: ReadonlyArray<{ region: (typeof REGION_ORDER)[number]; pts: readonly Pt[]; rgb: Rgb; size: number }> = [
  { region: 'obj:lamp-post', pts: [[0.5755, 0.5]], rgb: P.lampGlass, size: 3.2 },
  { region: 'obj:cup', pts: [[0.7, 0.768]], rgb: P.cupWhite, size: 3.6 },
  { region: 'obj:table', pts: [[0.12, 0.79], [0.88, 0.79]], rgb: P.cupWhite, size: 3.4 },
  { region: 'obj:neighbour-chair', pts: [[0.185, 0.56]], rgb: P.rattanLit, size: 3.2 },
];
const SHIMMER_RING = 10;
const SHIMMER_RADIUS = 0.014;

export interface Seed33PhotoOptions {
  seed: number;
  buildMs: number;
  reducedMotion: boolean;
  /**
   * Kept for API compatibility with the bead scene's options (host/scenes.ts, the density fixture
   * control): architecture and the figure are now a fixed reference image, so density no longer changes
   * particle counts there. It still scales the small shimmer-accent bead ring, clamped like before.
   */
  density?: number;
}
export const DEFAULT_SEED33_PHOTO: Seed33PhotoOptions = { seed: 33, buildMs: 12_000, reducedMotion: false, density: 1 };

export function buildSeed33PhotoScene(opts: Seed33PhotoOptions = DEFAULT_SEED33_PHOTO): SceneFrame {
  const density = Math.min(Math.max(Number.isFinite(opts.density) ? (opts.density as number) : 1, 0.25), 1.25);
  const ring = Math.max(4, Math.round(SHIMMER_RING * density));
  const shimmerCount = SHIMMER_SPOTS.reduce((n, spot) => n + spot.pts.length * ring, 0);
  const store = createStore(Math.max(shimmerCount, 1));
  const w = createWriter(store, ASPECT, density, opts.seed);
  const buildMs = Number.isFinite(opts.buildMs) ? Math.max(0, opts.buildMs) : 0;

  const regions: RegionSpec[] = REGION_ORDER.map((id) => {
    beginRegion(w, id, REGION_BAND[id], REGION_DEPTH[id], id === 'actors:passersby/woman');
    if (id === 'obj:lamp-post' || id === 'obj:cup' || id === 'obj:table' || id === 'obj:neighbour-chair') {
      const spot = SHIMMER_SPOTS.find((s) => s.region === id);
      if (spot) {
        for (const [cx, cy] of spot.pts) {
          for (let i = 0; i < ring; i++) {
            const a = (2 * Math.PI * i) / ring;
            w.motion = 0.1 + 0.15 * ((i % 3) / 2);
            w.birthMs = 0;
            emit(w, cx + Math.cos(a) * SHIMMER_RADIUS, cy + Math.sin(a) * SHIMMER_RADIUS * ASPECT * 0.3, 0, spot.rgb, 0.85, spot.size);
          }
        }
      }
    }
    return endRegion(w);
  });

  if (w.overflow > 0) throw new RangeError(`seed-33 photo scene overflowed its particle capacity by ${w.overflow}`);

  return {
    store,
    regions,
    aspect: ASPECT,
    paper: GROUND,
    seed: opts.seed,
    sky: null, // the sky is the photo's own pixels; no procedural gradient is layered under it
    tiles: [], // the old authorTiles patterns are gone; the real tile-chip atlas is drawn by the renderer from the manifest
    build: { durationMs: buildMs },
    photo: PHOTO_LAYER,
  };
}

// ---------------------------------------------------------------------------
// Real tile-chip life (candidate-2): a small, bounded positional drift per chip, deterministic from the
// seed and the chip's own index so neighbours never move in lockstep, starting only after the build
// completes (zero before/at it — idle0 reconstructs the manifest's rect exactly, matching the
// asset-inspection composite) and held at zero under reduced motion ("reduced holds source arrangement").
// This is drift, not the old system's discrete pattern swap: the chip is always its own real source
// pixels: only its small on-screen position moves, so there is nothing to "swap" that would misrepresent
// which real photo pixels are shown.
export const TILE_DRIFT_AMPLITUDE = 0.006;
export const TILE_DRIFT_ONSET_MS = 1500;

export interface TileOffset {
  dx: number;
  dy: number;
}

export function tileDriftOffset(tileIndex: number, seed: number, msAfterBuild: number, reducedMotion: boolean): TileOffset {
  if (reducedMotion || !(msAfterBuild > 0)) return { dx: 0, dy: 0 };
  const onset = smoothstep(0, TILE_DRIFT_ONSET_MS, msAfterBuild);
  const t = msAfterBuild / 1000;
  const periodX = 9 + (tileIndex % 5);
  const periodY = 11 + ((tileIndex * 3) % 7);
  const phaseX = hash01(tileIndex, (seed ^ 0x7a1e) >>> 0) * 2 * Math.PI;
  const phaseY = hash01(tileIndex, (seed ^ 0x5bd1) >>> 0) * 2 * Math.PI;
  return {
    dx: Math.sin((2 * Math.PI * t) / periodX + phaseX) * TILE_DRIFT_AMPLITUDE * onset,
    dy: Math.cos((2 * Math.PI * t) / periodY + phaseY) * TILE_DRIFT_AMPLITUDE * 0.6 * onset,
  };
}

/** The authored (non-reduced) `motion` lane of every seed-33-photo frame, kept privately so a toggle can restore it. */
const MOTION_AUTHORED = new WeakMap<SceneFrame, Float32Array>();

/** Switches shimmer on/off in place, exactly like the bead scene's setReducedMotion (no rebuild, no
 * replay, no clock change). The real tile chips' drift and the figure's own approach are controlled
 * separately, purely from the live reducedMotion flag passed to tileDriftOffset/photoApproachPose each
 * the live reducedMotion flag passed to photoApproachPose each draw — it needs no stored toggle here. */
export function setSeed33PhotoReducedMotion(frame: SceneFrame, reduced: boolean): void {
  const s = frame.store;
  let authored = MOTION_AUTHORED.get(frame);
  if (!authored || authored.length < s.count) {
    authored = s.motion.slice(0, s.count);
    MOTION_AUTHORED.set(frame, authored);
  }
  if (reduced) s.motion.fill(0, 0, s.count);
  else s.motion.set(authored.subarray(0, s.count), 0);
}
