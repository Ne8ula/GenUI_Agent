// The seed-33 look (w4-20261008-paris-c-hybrid/references/images/img-13-bwa3c-seed33.png) authored
// procedurally: every form is beads of light on an umber-black ground, under a pale pink-cream sky.
// Composition geometry is the P1 layout measured in arrival.ts (imported where exported, otherwise
// duplicated with a note); no reference pixel is read at runtime. Regions are written far → near with
// the same stable IDs as the arrival scene so renderers draw in store order; dynamic regions record
// rigs for life.ts through `seed33RigsOf`, the same WeakMap pattern arrival.ts uses privately.
// Round 2 (IMPLEMENTATION_BRIEF §8): façade thread classes with courses, the radial table, dot-fills,
// the dithered woman, calmer tiles, glowing lanterns, the sky wedge.
// Round 3 (§9 and §10): warm luminous near objects with a halo bead under every bright bead (cup, saucer,
// ashtray, table rim, woman, lantern glass, chair hoop); the table as distinct radial lines of light at a
// 0.9° pitch; a dense cupWhite cup with an empty coffee surface and a double-arc handle; a new coat
// silhouette for the dot-grid people (flared coat, lapel V, belt, head oval with hair, neck gap, legs and
// boots); fewer façade courses; the woman's walk phased to the build through an intro (approach, dwell,
// fade, then the ordinary cycle); zero-length builds born one ramp early; and `setReducedMotion`, which
// flips the `motion` lane in place from a privately kept authored copy and holds the tile life.
// Round 4 (§11): one continuous organic silhouette for the dot-grid people (sloped shoulders, a smooth
// coat flare, no neck stalk, a bob widening at the jaw, legs tapering into boots, every grid cell present
// and the shading carried by alpha and colour); near-object halos ×4 at alpha 0.16–0.22 and a ×3 halo at
// 0.10 under the bright thread class; a second, half-pitch-offset ray set over the outer part of the table
// so the burst thickens toward the 4.2 px rim ring; cup and saucer dot-fills at 2.6 px and alpha 1.0;
// façade courses reduced to the cornice and the string course, the bright thread class weighted ×1.15
// and the mid class at 0.3–0.55.
import { ASPECT, CAPACITY } from './arrival.ts';
import type { EmitterRig, Rigs, WalkerFacing, WalkerRig } from './arrival.ts';
import { SIZE_GAIN, beginRegion, createWriter, ellipseArc, ellipsePoint, emit, endRegion, lerpRgb, pointInPolygon, smoothstep } from './author.ts';
import type { Pt, Writer } from './author.ts';
import { PALETTE as P } from './palette.ts';
import { hash01 } from './rng.ts';
import { createStore, hexToRgb } from './store.ts';
import { BIRTH_RAMP_MS } from './types.ts';
import type { Band, Rgb, SceneFrame, Sky } from './types.ts';
import { CAFE_CREME, authorTiles, setTilesHold, tileStateOf } from './tiles.ts';

export interface Seed33Options {
  /** Deterministic authoring seed. */
  seed: number;
  /** Particle density multiplier, clamped to 0.25..1.25 by the writer. */
  density: number;
  /** Construction length in host-clock ms; 0 = everything born one ramp before t = 0 (complete at 0). */
  buildMs: number;
  /** Reduced motion: every shimmer `motion` is 0 (life handles tiles and walkers). Toggle later with setReducedMotion. */
  reducedMotion: boolean;
}

export const DEFAULT_SEED33: Seed33Options = { seed: 33, density: 1, buildMs: 12_000, reducedMotion: false };

/** Warm umber-black ground (frame.paper for this look). */
export const GROUND: Rgb = hexToRgb('#1a1210');
export const SKY_TOP: Rgb = hexToRgb('#f2d9cb');
export const SKY_HORIZON: Rgb = hexToRgb('#f7e8d8');
/** Where the sky meets the far mansard roof ridge (frame y). */
export const SKY_HORIZON_Y = 0.23;
/**
 * The sky's true silhouette between the two roof slopes and the mansard ridge (frame coordinates). The
 * scene's Sky carries it as `polygon` so the renderers clip the gradient to this wedge and the upper
 * building masses stay ground-dark, as the reference shows; authoring does not depend on it.
 */
export const SEED33_SKY_POLYGON: readonly Pt[] = [[0.395, -0.02], [0.675, -0.02], [0.665, 0.1], [0.64, 0.17], [0.585, 0.2], [0.6, 0.225], [0.47, 0.225], [0.46, 0.33]];
export const SEED33_SKY: Sky = { top: SKY_TOP, horizon: SKY_HORIZON, horizonY: SKY_HORIZON_Y, polygon: SEED33_SKY_POLYGON };

const RIGS = new WeakMap<SceneFrame, Rigs>();
/** Rigs of a seed-33 frame (life.ts checks arrival's registry first, then this one). */
export const seed33RigsOf = (frame: SceneFrame): Rigs | undefined => RIGS.get(frame);

/** The authored (non-reduced) `motion` lane of every seed-33 frame, kept privately so a toggle can restore it. */
const MOTION_AUTHORED = new WeakMap<SceneFrame, Float32Array>();

/**
 * Reduced-motion toggle without a rebuild (§9 B, scene side): sets every particle's `motion` to 0, or back
 * to its authored value, in place, and holds or resumes the frame's tile life. Nothing else changes: slots,
 * births, positions, the life clocks and the tile schedule all stay where they are. Safe to call repeatedly.
 * A frame authored elsewhere (the arrival scene) has its current lane taken as the authored one on first use.
 */
export function setReducedMotion(frame: SceneFrame, reduced: boolean): void {
  const s = frame.store;
  let authored = MOTION_AUTHORED.get(frame);
  if (!authored || authored.length < s.count) {
    authored = s.motion.slice(0, s.count);
    MOTION_AUTHORED.set(frame, authored);
  }
  if (reduced) s.motion.fill(0, 0, s.count);
  else s.motion.set(authored.subarray(0, s.count), 0);
  const tiles = tileStateOf(frame);
  if (tiles) setTilesHold(tiles, reduced);
}

/** Birth windows as fractions of buildMs: nearest first, far mansard last (brief §3). */
export const BUILD_WINDOWS = {
  'obj:table': [0, 0.15],
  'obj:cup': [0, 0.15],
  'obj:saucer': [0, 0.15],
  'fx:steam': [0.1, 0.15],
  'obj:ashtray': [0.08, 0.2],
  'obj:cigarette': [0.08, 0.2],
  'fx:smoke': [0.15, 0.2],
  'obj:neighbour-chair': [0.12, 0.28],
  'actors:passersby/woman': [0.25, 0.4],
  'obj:lamp-post': [0.35, 0.5],
  'obj:lamp-post/far': [0.35, 0.5],
  'actors:passersby/man': [0.35, 0.5],
  'actors:passersby/third': [0.35, 0.5],
  'layer:facade/left': [0.45, 0.7],
  'obj:awning': [0.45, 0.7],
  'layer:facade/right': [0.55, 0.8],
  'layer:facade/mansard': [0.8, 1],
  'layer:far': [0.8, 1],
} as const satisfies Record<string, readonly [number, number]>;
export type Seed33RegionId = keyof typeof BUILD_WINDOWS;

/** Region write order, far → near (the arrival scene's order; renderers draw in store order). */
export const REGION_ORDER: readonly Seed33RegionId[] = [
  'layer:far', 'layer:facade/mansard', 'layer:facade/right', 'layer:facade/left', 'obj:awning', 'obj:lamp-post/far',
  'actors:passersby/third', 'actors:passersby/man', 'obj:lamp-post', 'actors:passersby/woman', 'obj:neighbour-chair',
  'obj:table', 'obj:ashtray', 'obj:cigarette', 'fx:smoke', 'obj:saucer', 'obj:cup', 'fx:steam',
];

// Pixel units at a 1080-px-tall frame (frame width is 1080 · ASPECT).
const PX_Y = 1 / 1080;
const PX_X = 1 / (1080 * ASPECT);
/** Default bead pitch along a path: 3 px. */
const BEAD_PITCH = 3 * PX_Y;
const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Samples outside the authored frame margin are never stored (same rule as author.ts). */
const inFrame = (x: number, y: number) => x > -0.03 && x < 1.03 && y > -0.03 && y < 1.03;

/** Near-object halo bead under a bright bead: same position and colour, HALO_SIZE × the size, alpha HALO_ALPHA (§11.2). */
export const HALO_SIZE = 4;
export const HALO_ALPHA: readonly [number, number] = [0.16, 0.22];
/** The bright façade thread class gets a smaller, fainter halo (§11.2). */
export const THREAD_HALO_SIZE = 3;
export const THREAD_HALO_ALPHA = 0.1;
/** Beads dimmer than this get no halo: the glow belongs to the bright beads. */
export const HALO_MIN_ALPHA = 0.5;
/** Which halo, if any, the next beads get. */
export type HaloKind = 'none' | 'near' | 'thread';

const LIMESTONE_WARM = lerpRgb(P.limestoneLit, CAFE_CREME, 0.5);
/** Warm cream for the table rays (café crème toward cupWhite), never the marble greys. */
const TABLE_CREAM = lerpRgb(CAFE_CREME, P.cupWhite, 0.45);
/** lampIron is too dark for a dark ground; the lamp silhouette uses a lampStipple/limestone mix (hand-back notes this). */
const LAMP_LINE = lerpRgb(P.lampStipple, P.limestoneShade, 0.55);

interface Ctx {
  w: Writer;
  buildMs: number;
  /** Current region's birth window in host ms. */
  t0: number;
  t1: number;
  /** Per-region bead counter for stable hashes. */
  n: number;
  /** While not 'none', every bead bright enough gets a halo bead under it (near-object or thread size/alpha). */
  halo: HaloKind;
  /** Halo beads written so far (diagnostics). */
  halos: number;
}

function open(c: Ctx, id: Seed33RegionId, band: Band, depth: number, dynamic = false): number {
  const [f0, f1] = BUILD_WINDOWS[id];
  c.t0 = c.buildMs * f0;
  c.t1 = c.buildMs * f1;
  c.n = 0;
  return beginRegion(c.w, id, band, depth, dynamic);
}

/** Birth time for progress f inside the open region's window; a zero-length build is born one ramp early (§9 G). */
const birthAt = (c: Ctx, f: number) => (c.buildMs <= 0 ? -BIRTH_RAMP_MS : c.t0 + (c.t1 - c.t0) * clamp01(f));
/** The authored shimmer; reduced motion is applied to the whole lane at the end (and by setReducedMotion). */
const setMotion = (c: Ctx, cps: number) => {
  c.w.motion = Math.max(0, cps);
};

/** One bead: size in px at 1080 (SIZE_GAIN applied as author.ts does), f = birth progress inside the region window. */
function bead(c: Ctx, x: number, y: number, rgb: Rgb, a: number, size: number, f: number, depth?: number): void {
  if (!inFrame(x, y) || a <= 0.002) return;
  const w = c.w;
  w.birthMs = birthAt(c, f);
  const z = depth ?? w.current?.depth ?? 0;
  const alpha = clamp01(a);
  c.n++;
  let h = -1;
  if (c.halo !== 'none' && alpha >= HALO_MIN_ALPHA) {
    const near = c.halo === 'near';
    const haloA = near ? lerp(HALO_ALPHA[0], HALO_ALPHA[1], alpha) : THREAD_HALO_ALPHA;
    h = emit(w, x, y, z, rgb, haloA, size * (near ? HALO_SIZE : THREAD_HALO_SIZE) * SIZE_GAIN);
    if (h >= 0) c.halos++;
  }
  const k = emit(w, x, y, z, rgb, alpha, size * SIZE_GAIN);
  if (h >= 0 && k >= 0) w.store.phase[h] = w.store.phase[k] ?? 0; // the halo breathes with its bead
}

interface PathStyle {
  colour: Rgb | ((s: number) => Rgb);
  alpha: number | ((s: number) => number);
  size: number;
  /** Size multiplier along the path (default 1): the table's outer-third bloom uses it. */
  sizeAt?: (s: number) => number;
  /** Bead pitch in frame-height units at density 1 (default 3 px). */
  pitch?: number;
  motion: number;
  /** Birth progress for a bead at path fraction s (default: along the path). */
  birth?: (s: number) => number;
  depth?: (x: number, y: number) => number;
  /** Per-bead alpha sparkle amount (default 0.15). */
  sparkle?: number;
}

/** Beads along a polyline at an isotropic pitch; s runs 0..1 along the path. */
function beadPath(c: Ctx, pts: readonly Pt[], st: PathStyle): void {
  const w = c.w;
  const pitch = (st.pitch ?? BEAD_PITCH) / Math.sqrt(w.density);
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1] as Pt;
    const [bx, by] = pts[i] as Pt;
    const l = Math.hypot((bx - ax) * ASPECT, by - ay);
    lens.push(l);
    total += l;
  }
  if (total <= 0) return;
  setMotion(c, st.motion);
  const sparkle = st.sparkle ?? 0.15;
  let walked = 0;
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1] as Pt;
    const [bx, by] = pts[i] as Pt;
    const l = lens[i - 1] as number;
    if (l <= 0) continue;
    let d = carry;
    for (; d < l; d += pitch) {
      const s = (walked + d) / total;
      const x = ax + ((bx - ax) * d) / l;
      const y = ay + ((by - ay) * d) / l;
      const a = (typeof st.alpha === 'number' ? st.alpha : st.alpha(s)) * (1 - sparkle * w.rng());
      const rgb = typeof st.colour === 'function' ? st.colour(s) : st.colour;
      const size = st.size * (st.sizeAt ? st.sizeAt(s) : 1) * (0.92 + 0.16 * w.rng());
      bead(c, x, y, rgb, a, size, st.birth ? st.birth(s) : s, st.depth ? st.depth(x, y) : undefined);
    }
    carry = d - l;
    walked += l;
  }
}

type Rect = readonly [number, number, number, number]; // x0, y0, x1, y1
const inRects = (x: number, y: number, rects: readonly Rect[]): boolean => rects.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
const rectPath = ([x0, y0, x1, y1]: Rect): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

/** 4×4 Bayer matrix, thresholds (v + 0.5) / 16. */
export const BAYER4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const bayerAt = (row: number, col: number): number => ((BAYER4[row & 3]?.[col & 3] ?? 0) + 0.5) / 16;

// ---------------------------------------------------------------------------
// Façades: sparse vertical beaded light-threads suggesting a dark building mass (no fills), in three
// brightness classes so a few threads are luminous and most are nearly invisible; threads at window
// jambs, corners and the awning ends are promoted to the bright class, which is weighted ×1.15 (clamped
// to 1) and carries a ×3 halo at alpha 0.10 (§11.2, §11.5). Horizontal courses are only the cornice and
// the string course (§11.5): the reference has almost none.

/** Thread brightness classes: share of threads, alpha range, bead size range (px at 1080). */
export const THREAD_CLASSES = {
  bright: { share: 0.25, alpha: [0.9, 1.0], size: [3.6, 4.2] },
  mid: { share: 0.45, alpha: [0.3, 0.55], size: [2.4, 3.0] },
  faint: { share: 0.3, alpha: [0.06, 0.15], size: [2.2, 2.8] },
} as const satisfies Record<string, { share: number; alpha: readonly [number, number]; size: readonly [number, number] }>;
type ThreadClass = keyof typeof THREAD_CLASSES;
/** Alpha weight of the bright class before the clamp to 1 (§11.5). */
export const BRIGHT_WEIGHT = 1.15;
/** Threads keep this fraction of their alpha inside a window opening (the glass stays dark). */
export const OPENING_DIM = 0.15;
/** Thread pitch in px at 1080 for the near end and the far end of a receding façade. */
export const THREAD_PITCH_PX: readonly [number, number] = [26, 18];

interface FacadeSpec {
  xFrom: number;
  xTo: number;
  topY: (x: number) => number;
  baseY: (x: number) => number;
  /** 0 at the near end of the façade, 1 at the far end (threads get finer with distance). */
  far: (x: number) => number;
  /** Window openings (glass): threads are dimmer across them. */
  openings: readonly Rect[];
  /** Frame x of architectural edges (window jambs, corners, awning ends): the thread nearest each is bright. */
  edges: readonly number[];
  /** Extra brightness 0..1+ (the lit left cornice). */
  lit: (x: number, y: number) => number;
  colour: (x: number, y: number, k: number) => Rgb;
  /** Overall alpha multiplier for the mid and faint classes (the shaded right façade is dimmer). */
  gain: number;
  /** Alpha multiplier for the bright class (1 on the near façades; the far mansard stays dimmer). */
  brightGain: number;
  /** Thread pitch in px at 1080: [near, far]. */
  pitchPx: readonly [number, number];
  /** Bead pitch along a thread in px: [min, max]. */
  beadPx: readonly [number, number];
  /** Bead size multiplier on the class sizes (the far mansard is finer). */
  sizeScale: number;
  depth: (x: number) => number;
  salt: number;
}

function facadeThreads(c: Ctx, f: FacadeSpec): void {
  const w = c.w;
  const dens = Math.sqrt(w.density);
  let x = f.xFrom;
  let i = 0;
  while (x < f.xTo) {
    const far = clamp01(f.far(x));
    const pitchPx = lerp(f.pitchPx[0], f.pitchPx[1], far) * (0.85 + 0.3 * hash01(i, f.salt + 1));
    const pitchX = (pitchPx * PX_X) / dens;
    // Class: the thread nearest an architectural edge is bright; otherwise 17 % bright, 50 % mid, 33 % faint
    // (with the promoted threads this lands near the 25 / 45 / 30 split).
    const u = hash01(i, f.salt);
    const atEdge = f.edges.some((e) => Math.abs(x - e) < pitchX * 0.55);
    const cls: ThreadClass = atEdge || u < 0.17 ? 'bright' : u < 0.67 ? 'mid' : 'faint';
    const spec = THREAD_CLASSES[cls];
    const h = hash01(i, f.salt + 7);
    const aT = lerp(spec.alpha[0], spec.alpha[1], h) * (cls === 'bright' ? f.brightGain * BRIGHT_WEIGHT : f.gain);
    c.halo = cls === 'bright' ? 'thread' : 'none';
    const size = lerp(spec.size[0], spec.size[1], hash01(i, f.salt + 3)) * f.sizeScale;
    const beadPitch = (lerp(f.beadPx[0], f.beadPx[1], hash01(i, f.salt + 2)) * PX_Y) / dens;
    setMotion(c, 0.12 + 0.28 * hash01(i, f.salt + 4));
    const s0 = 0.5 * hash01(i, f.salt + 5); // this thread's own sub-window inside the region's
    const top = f.topY(x);
    const base = f.baseY(x);
    const span = Math.max(base - top, 1e-6);
    const k = hash01(i, f.salt + 6);
    for (let y = base; y > top; y -= beadPitch) {
      const v = (y - top) / span; // 1 at the base, 0 at the top
      const a = aT * (inRects(x, y, f.openings) ? OPENING_DIM : 1) * (1 + f.lit(x, y)) * (0.88 + 0.12 * w.rng());
      bead(c, x, y, f.colour(x, y, k), Math.min(a, 1), size, s0 + 0.5 * (1 - v), f.depth(x));
    }
    x += pitchX;
    i++;
  }
  c.halo = 'none';
}

/** A beaded horizontal course (cornice or string course): beads 4 px apart. */
function course(c: Ctx, a: Pt, b: Pt, colour: Rgb, alpha: number, depth: (x: number) => number, size = 2.8, birth = 0.6): void {
  beadPath(c, [a, b], { colour, alpha, size, pitch: 4 * PX_Y, motion: 0.15, depth: (x) => depth(x), birth: () => birth, sparkle: 0.1 });
}

// ---------------------------------------------------------------------------
// Far skyline: the chimney outlines against the sky (arrival.ts numbers).

function farSkyline(c: Ctx): void {
  open(c, 'layer:far', 'far', -40);
  const col = lerpRgb(P.limestoneShade, P.pencilFaint, 0.5);
  for (const [x0, x1] of [[0.49, 0.501], [0.535, 0.549]] as const) {
    beadPath(c, [[x0, 0.232], [x0, 0.183], [x1, 0.183], [x1, 0.232]], { colour: col, alpha: 0.4, size: 2.2, motion: 0.12 });
  }
  beadPath(c, [[0.47, 0.225], [0.6, 0.225]], { colour: col, alpha: 0.3, size: 2.2, motion: 0.12 });
  endRegion(c.w);
}

// ---------------------------------------------------------------------------
// The zinc mansard block that closes the street: finer threads, a bright ridge, dormer outlines.

const MANSARD_ROWS: readonly (readonly [number, number])[] = [[0.335, 0.39], [0.42, 0.476]];
const MANSARD_WINDOWS: Rect[] = [];
for (const [y0, y1] of MANSARD_ROWS) for (const cx of [0.48, 0.513, 0.575]) MANSARD_WINDOWS.push([cx - 0.0125, y0, cx + 0.0125, y1]);
const MANSARD_DORMERS: Rect[] = [0.49, 0.515, 0.551].map((cx) => [cx - 0.007, 0.243, cx + 0.007, 0.29] as const);
const MANSARD_OPENINGS: Rect[] = [...MANSARD_WINDOWS, ...MANSARD_DORMERS];
/** Only the block's outer window jambs promote threads: the far mansard must stay dimmer than the near façades. */
const MANSARD_EDGES: readonly number[] = [0.48 - 0.0125, 0.575 + 0.0125];

function mansard(c: Ctx): void {
  open(c, 'layer:facade/mansard', 'facade', -14);
  const d = () => -14;
  facadeThreads(c, {
    xFrom: 0.458,
    xTo: 0.61,
    topY: (x) => (x < 0.47 ? 0.305 - (0.08 * (x - 0.455)) / 0.015 : x > 0.6 ? 0.225 + (0.08 * (x - 0.6)) / 0.012 : 0.225),
    baseY: () => 0.5,
    far: () => 1,
    openings: MANSARD_OPENINGS,
    edges: MANSARD_EDGES,
    lit: () => 0,
    colour: (_x, y, k) => lerpRgb(P.limestoneShade, y < 0.305 ? P.zincLight : LIMESTONE_WARM, 0.3 + 0.4 * k),
    gain: 0.6,
    brightGain: 0.8,
    pitchPx: [THREAD_PITCH_PX[1], THREAD_PITCH_PX[1]],
    beadPx: [3, 3.4],
    sizeScale: 0.85,
    depth: d,
    salt: 3301,
  });
  // Bright ridge (the cornice), the roof-slope edges, the eave as the string course and the dormer
  // outlines; no lintel courses (§11.5).
  const ridge = lerpRgb(P.zincLight, LIMESTONE_WARM, 0.5);
  beadPath(c, [[0.47, 0.225], [0.6, 0.225]], { colour: ridge, alpha: 0.95, size: 3.4, motion: 0.12, birth: () => 0.9, sparkle: 0.1, depth: () => -14 });
  beadPath(c, [[0.47, 0.225], [0.455, 0.305]], { colour: ridge, alpha: 0.7, size: 2.8, motion: 0.12, birth: () => 0.85, depth: () => -14 });
  beadPath(c, [[0.6, 0.225], [0.612, 0.305]], { colour: ridge, alpha: 0.7, size: 2.8, motion: 0.12, birth: () => 0.85, depth: () => -14 });
  course(c, [0.455, 0.305], [0.612, 0.305], LIMESTONE_WARM, 0.7, d, 3.0, 0.8);
  for (const r of MANSARD_DORMERS) beadPath(c, rectPath(r), { colour: ridge, alpha: 0.75, size: 2.6, motion: 0.12, birth: () => 0.85, depth: () => -14 });
  endRegion(c.w);
}

// ---------------------------------------------------------------------------
// Right façade (in shade), receding to the left. Lines duplicated from arrival.ts R_TOP/R_BASE.

const R_TOP: [Pt, Pt] = [[0.585, 0.29], [1.0, 0.19]];
const R_BASE: [Pt, Pt] = [[0.585, 0.555], [1.0, 0.725]];
const lineY = (l: [Pt, Pt], x: number): number => l[0][1] + ((l[1][1] - l[0][1]) * (x - l[0][0])) / (l[1][0] - l[0][0]);
const rightDepth = (x: number): number => -12 + 9.5 * clamp01((x - 0.585) / 0.415);
const RIGHT_OPENINGS: Rect[] = [
  [0.784, 0.33, 0.831, 0.57], [0.882, 0.3, 0.918, 0.6], [0.992, 0.27, 1.0, 0.64],
  [0.612, 0.17, 0.622, 0.33], [0.612, 0.4, 0.622, 0.52], [0.636, 0.14, 0.65, 0.31], [0.636, 0.395, 0.65, 0.53],
  [0.66, 0.12, 0.675, 0.3], [0.66, 0.39, 0.675, 0.55], [0.69, 0.09, 0.708, 0.275], [0.69, 0.38, 0.708, 0.565],
  [0.733, 0.045, 0.75, 0.25], [0.733, 0.37, 0.75, 0.59],
];
/** Jambs of the three main windows, the near corner and the roof break. */
const RIGHT_EDGES: readonly number[] = [0.585, 0.64, 0.784, 0.831, 0.882, 0.918, 0.992];
/** The roofline against the sky (the sky polygon's right edge). */
const RIGHT_ROOFLINE: Pt[] = [[0.585, 0.2], [0.64, 0.17], [0.665, 0.1], [0.675, -0.02]];
const rightTopY = (x: number): number =>
  x < 0.64 ? 0.2 - (0.03 * (x - 0.585)) / 0.055 : x < 0.665 ? 0.17 - (0.07 * (x - 0.64)) / 0.025 : x < 0.675 ? 0.1 - (0.12 * (x - 0.665)) / 0.01 : -0.02;

function rightFacade(c: Ctx): void {
  open(c, 'layer:facade/right', 'facade', -7);
  facadeThreads(c, {
    xFrom: 0.586,
    xTo: 1.02,
    topY: rightTopY,
    baseY: (x) => lineY(R_BASE, x),
    far: (x) => 1 - clamp01((x - 0.585) / 0.415),
    openings: RIGHT_OPENINGS,
    edges: RIGHT_EDGES,
    lit: (x, y) => 0.35 * smoothstep(0.75, 1.0, x) * smoothstep(0.45, 0.1, y),
    colour: (x, _y, k) => lerpRgb(P.limestoneShade, LIMESTONE_WARM, 0.2 + 0.5 * k + 0.3 * clamp01((x - 0.585) / 0.415)),
    gain: 0.75,
    brightGain: 1,
    pitchPx: THREAD_PITCH_PX,
    beadPx: [3, 4],
    sizeScale: 1,
    depth: rightDepth,
    salt: 7701,
  });
  // Cornice along the roofline and the string course between floors only (§11.5).
  beadPath(c, RIGHT_ROOFLINE, { colour: LIMESTONE_WARM, alpha: 0.8, size: 3.0, pitch: 4 * PX_Y, motion: 0.15, depth: (x) => rightDepth(x), birth: () => 0.7, sparkle: 0.1 });
  course(c, R_TOP[0], R_TOP[1], LIMESTONE_WARM, 0.6, rightDepth, 3.0, 0.6);
  endRegion(c.w);
}

// ---------------------------------------------------------------------------
// Left façade (lit), receding to the right, with the shop awning. Lines from arrival.ts L_BASE.

const L_BASE: [Pt, Pt] = [[0.0, 0.795], [0.46, 0.565]];
const leftDepth = (x: number): number => -2.5 - 9.5 * clamp01(x / 0.46);
const LEFT_OPENINGS: Rect[] = [
  [0.047, 0.13, 0.1, 0.6], [0.205, 0.26, 0.255, 0.57],
  [0.298, 0.3, 0.322, 0.56], [0.352, 0.335, 0.368, 0.55], [0.393, 0.36, 0.405, 0.55], [0.424, 0.385, 0.432, 0.545],
  [0.405, 0.06, 0.412, 0.22], [0.425, 0.1, 0.431, 0.24], [0.443, 0.13, 0.448, 0.26],
];
/** Jambs of the two main windows, the awning ends and the building's top corner. */
const LEFT_EDGES: readonly number[] = [0.047, 0.1, 0.165, 0.205, 0.255, 0.395, 0.435];
/** The string course below the sills (converging toward the vanishing point). */
const LEFT_STRING: [Pt, Pt] = [[-0.02, 0.617], [0.46, 0.527]];
const leftTopY = (x: number): number => (x <= 0.395 ? -0.02 : -0.02 + (0.35 * (x - 0.395)) / 0.065);

function leftFacade(c: Ctx): void {
  open(c, 'layer:facade/left', 'facade', -6);
  facadeThreads(c, {
    xFrom: -0.02,
    xTo: 0.46,
    topY: leftTopY,
    baseY: (x) => lineY(L_BASE, x),
    far: (x) => clamp01(x / 0.46),
    // The lit cornice: brightest in the upper-left, fading down the wall and toward the far end.
    lit: (x, y) => 0.7 * smoothstep(0.5, 0.02, y) * smoothstep(0.42, 0.05, x),
    openings: LEFT_OPENINGS,
    edges: LEFT_EDGES,
    colour: (_x, y, k) => lerpRgb(P.limestoneLit, LIMESTONE_WARM, 0.3 + 0.5 * k + 0.2 * smoothstep(0.1, 0.6, y)),
    gain: 1,
    brightGain: 1,
    pitchPx: THREAD_PITCH_PX,
    beadPx: [3, 4],
    sizeScale: 1,
    depth: leftDepth,
    salt: 4401,
  });
  // The lit top corner (the cornice against the sky) and the string course only (§11.5).
  course(c, [0.395, -0.02], [0.46, 0.33], LIMESTONE_WARM, 0.8, leftDepth, 3.2, 0.65);
  course(c, LEFT_STRING[0], LEFT_STRING[1], P.limestoneShade, 0.5, leftDepth, 2.8, 0.6);
  endRegion(c.w);
}

// Awning fabric edges (arrival.ts AWNING_TOP / AWNING_BOTTOM).
const AWNING_TOP: Pt[] = [[0.165, 0.02], [0.218, 0.026], [0.29, 0.052], [0.364, 0.11], [0.418, 0.215], [0.435, 0.3]];
const AWNING_BOTTOM: Pt[] = [[0.165, 0.02], [0.175, 0.045], [0.218, 0.078], [0.29, 0.17], [0.364, 0.26], [0.418, 0.306], [0.435, 0.3]];

function awning(c: Ctx): void {
  open(c, 'obj:awning', 'facade', -5);
  const d = (x: number) => leftDepth(x);
  beadPath(c, AWNING_TOP, { colour: lerpRgb(P.awningRed, LIMESTONE_WARM, 0.5), alpha: 0.8, size: 2.8, motion: 0.15, depth: d });
  beadPath(c, AWNING_TOP.map(([x, y]) => [x, y + 0.008] as Pt), { colour: P.awningRed, alpha: 0.45, size: 2.4, motion: 0.15, depth: d });
  beadPath(c, AWNING_BOTTOM.slice(1), { colour: P.awningRed, alpha: 0.6, size: 2.6, motion: 0.15, depth: d });
  beadPath(c, [[0.325, 0.095], [0.336, 0.205]], { colour: P.awningShade, alpha: 0.6, size: 2.4, motion: 0.15, depth: d });
  beadPath(c, [[0.417, 0.215], [0.428, 0.302]], { colour: P.awningShade, alpha: 0.6, size: 2.4, motion: 0.15, depth: d });
  // Sparse fabric seams from the roller to the hem.
  for (let i = 1; i <= 6; i++) {
    const f = i / 7;
    const top = AWNING_TOP[Math.min(AWNING_TOP.length - 1, Math.round(f * (AWNING_TOP.length - 1)))] as Pt;
    const bottom = AWNING_BOTTOM[Math.min(AWNING_BOTTOM.length - 1, Math.round(f * (AWNING_BOTTOM.length - 1)))] as Pt;
    beadPath(c, [top, bottom], { colour: P.awningShade, alpha: 0.3 + 0.1 * hash01(i, 9), size: 2.2, motion: 0.2, depth: d, pitch: 4 * PX_Y });
  }
  endRegion(c.w);
}

// ---------------------------------------------------------------------------
// Lamp posts: thin beaded silhouettes (proportions from arrival.ts lampBody) with a dense bright warm
// bead cluster filling the lantern, each glass bead on a halo, so the lamps glow (brief §8.7, §10.1).

/** Lantern glass dot pitch in px at 1080. */
export const LAMP_GLASS_PITCH_PX = 3;

function lampBody(c: Ctx, baseX: number, baseY: number, h: number, s: number, gain: number): void {
  const yAt = (f: number) => baseY - h * f;
  const line = (pts: readonly Pt[], alpha: number, size = 2.6) => beadPath(c, pts, { colour: LAMP_LINE, alpha: alpha * gain, size, motion: 0.1, birth: (q) => 0.1 + 0.8 * q });
  const ring = (y: number, rx: number, ry: number, alpha: number) => line(ellipseArc(baseX, y, rx, ry, 0, Math.PI * 2, 24, 0, ASPECT), alpha, 2.4);
  // Foot, base steps and shaft edges.
  ring(baseY, 0.02 * s, 0.006 * s, 0.7);
  line([[baseX - 0.0195 * s, baseY], [baseX - 0.0135 * s, yAt(0.06)], [baseX - 0.0095 * s, yAt(0.16)], [baseX - 0.0075 * s, yAt(0.16)], [baseX - 0.0045 * s, yAt(0.71)]], 0.85);
  line([[baseX + 0.0195 * s, baseY], [baseX + 0.0135 * s, yAt(0.06)], [baseX + 0.0095 * s, yAt(0.16)], [baseX + 0.0075 * s, yAt(0.16)], [baseX + 0.0045 * s, yAt(0.71)]], 0.7);
  for (const f of [0.14, 0.24]) ring(yAt(f), 0.012 * s, 0.004 * s, 0.6);
  // Lantern box, cap and finial.
  const lantern: Pt[] = [[baseX - 0.018 * s, yAt(0.73)], [baseX + 0.018 * s, yAt(0.73)], [baseX + 0.014 * s, yAt(0.87)], [baseX - 0.014 * s, yAt(0.87)], [baseX - 0.018 * s, yAt(0.73)]];
  line(lantern, 0.9);
  line([[baseX - 0.021 * s, yAt(0.87)], [baseX - 0.006 * s, yAt(0.93)], [baseX + 0.006 * s, yAt(0.93)], [baseX + 0.021 * s, yAt(0.87)]], 0.8);
  line([[baseX, yAt(0.93)], [baseX, yAt(1.0)]], 0.8);
  // The glass: a dense bright warm bead cluster filling the lantern, brightest at its centre, haloed.
  setMotion(c, 0.18);
  const pitch = (LAMP_GLASS_PITCH_PX * PX_Y) / Math.sqrt(c.w.density);
  const cyG = yAt(0.8);
  const glass = lerpRgb(P.lampGlass, P.limestoneLit, 0.6);
  c.halo = 'near';
  for (let y = yAt(0.73) - pitch * 0.5; y > yAt(0.87); y -= pitch) {
    for (let x = baseX - 0.018 * s; x <= baseX + 0.018 * s; x += pitch / ASPECT) {
      if (!pointInPolygon(x, y, lantern)) continue;
      const r = Math.hypot((x - baseX) / (0.018 * s), (y - cyG) / (0.07 * h));
      const L = 1 - 0.45 * clamp01(r * r);
      bead(c, x, y, lerpRgb(glass, P.cupWhite, 0.5 * L), gain * (0.85 + 0.15 * L) * (0.94 + 0.06 * c.w.rng()), 3.2, 0.55 + 0.35 * c.w.rng());
    }
  }
  c.halo = 'none';
}

function nearLamp(c: Ctx): void {
  open(c, 'obj:lamp-post', 'pavement', -3.2);
  lampBody(c, 0.5755, 0.625, 0.46, 1, 1);
  endRegion(c.w);
}

function farLamp(c: Ctx): void {
  open(c, 'obj:lamp-post/far', 'facade', -8);
  lampBody(c, 0.5445, 0.452, 0.157, 0.4, 0.75);
  endRegion(c.w);
}

// ---------------------------------------------------------------------------
// People: one continuous organic silhouette per walker, filled with an ordered dot grid of light at a
// 4 px pitch (normalised units: origin at the feet, ny negative upward, nx isotropic in heights). Round 4
// (brief §11.1): a slightly sloped shoulder line, a coat that flares smoothly from the shoulders to the
// hem (no belt gap, no vertical seam: the belt is a one-dot-row dimming only), a rounded head oval that
// sits on the shoulders (no neck stalk) under a soft hair mass widening at the jaw, two legs tapering
// into boots. Every grid cell inside the silhouette is present; the body light is brightest at the chest
// and falls toward the hem and the edges, so the core is alpha 0.95–1.0 and the shading is carried by
// alpha and colour, never by holes in the grid. No features in the head. The far walkers use the same
// construction at their size with slightly wider shoulders and a short hair cap (no widening). Rigged
// exactly like arrival.ts for life.ts.

export type WalkerKind = 'woman' | 'man' | 'far';
/** Dot pitch in px at 1080. */
export const DOT_PITCH_PX = 4;
/** Light of the head oval: uniform (no features), as bright as the chest core. */
export const HEAD_LIGHT = 1;
/** Alpha at body light 0 and 1: the chest core (light ≈ 0.9–1) lands in 0.95–1.0, the hem corners near 0.75. */
export const BODY_ALPHA: readonly [number, number] = [0.55, 1.0];
/** The belt: the one grid row nearest the belt line keeps this fraction of its alpha (a dimming, never a gap). */
export const BELT_DIM = 0.7;
/**
 * The woman's approach (walker rig startY/endY/travelS): her feet travel from startY to endY over
 * travelS seconds, so with arrival.ts `walkerHeightAt` she grows 0.244 → 0.397 frame heights, about
 * 1.63× over 8 s, close to the clip's 1.6× (VB2).
 */
export const WOMAN_APPROACH = { startY: 0.645, endY: 0.75, travelS: 8 } as const;

// Walker cycle constants shared by authoring (the intro) and life.ts (the cycle).
/** A walker fades in over this long after (re)spawning … */
export const WALKER_FADE_IN_S = 1.4;
/** … fades out over this long before the end of its travel … */
export const WALKER_FADE_OUT_S = 1.8;
/** … and stays away this long between one travel and the next. */
export const WALKER_GAP_S = 2.5;
/** After the build is complete (or her approach ends, whichever is later) the woman stands this long before her first fade (§9 A). */
export const WOMAN_DWELL_S = 8;

/**
 * An intro phased to the build (the seed-33 woman): one approach starting at `startS` over `travelS`,
 * a stand of `holdS` at the near position, then the fade and the ordinary cycle (see life.ts walkerPose).
 */
export interface WalkerIntro {
  startS: number;
  travelS: number;
  holdS: number;
}
const INTROS = new WeakMap<WalkerRig, WalkerIntro>();
/** The intro of a rig, if its scene gave it one (arrival rigs have none). */
export const walkerIntroOf = (rig: WalkerRig): WalkerIntro | undefined => INTROS.get(rig);

/**
 * The woman's intro for a build of `buildMs`: she starts walking one fade-in before her birth window opens
 * (so she is already whole when her beads are born), approaches for WOMAN_APPROACH.travelS, and stands from
 * her arrival until WOMAN_DWELL_S after the later of the build's end and that arrival (a 12 s build: start
 * 1.6 s, arrive 9.6 s, stand to 20 s, fade to 21.8 s, gap, then the ordinary cycle).
 */
export function womanIntro(buildMs: number): WalkerIntro {
  const [f0] = BUILD_WINDOWS['actors:passersby/woman'];
  const startS = (Math.max(0, buildMs) / 1000) * f0 - WALKER_FADE_IN_S;
  const travelS = WOMAN_APPROACH.travelS;
  const arriveS = startS + travelS;
  const holdS = Math.max(Math.max(0, buildMs) / 1000, arriveS) + WOMAN_DWELL_S - arriveS;
  return { startS, travelS, holdS };
}

/** A walker's silhouette in normalised units (origin at the feet, ny negative upward, nx isotropic in heights). */
export interface WalkerSilhouette {
  /** Half-width at the shoulder point, where the sloped shoulder line turns into the coat's side. */
  shoulder: number;
  /** Half-width at the hem: the widest point of the figure. */
  hem: number;
  /** Half-width of the coat's top at the neck. */
  collar: number;
  /** ny of the coat's top at the neck: above the head's bottom, so the head sits on the shoulders with no neck stalk. */
  collarNy: number;
  shoulderNy: number;
  /** Where the body light peaks. */
  chestNy: number;
  hemNy: number;
  /** The belt line: the one grid row nearest it is dimmed. */
  beltNy: number;
  /** Legs below this are boots. */
  bootNy: number;
  /** One continuous coat outline: sloped shoulders, a smooth flare, a gently sagging hem. */
  body: Pt[];
  /** Each leg with its boot as one tapering polygon. */
  legL: Pt[];
  legR: Pt[];
  /** Head oval, about 11 % of the height tall. */
  head: { cx: number; cy: number; rx: number; ry: number };
  /** Hair mass: the woman's bob, widening at the jaw with locks over the shoulders; the men's short cap. */
  hair: Pt[];
}

/** The numbers coatHalfWidth needs (the silhouette's profile, usable before its polygons exist). */
export type CoatProfile = Pick<WalkerSilhouette, 'shoulder' | 'hem' | 'collar' | 'collarNy' | 'shoulderNy' | 'hemNy'>;

/** The shoulder line falls as t^SHOULDER_EASE from the collar: flat at the neck, steep where it rounds into the side. */
const SHOULDER_EASE = 2.2;
/** The flare eases in so the coat hangs straight below the shoulders and widens toward the hem. */
const FLARE_EASE = 1.15;
/** A barely-there waist halfway down the coat, as a share of the flare (0.01 heights on the woman); the half-width still grows monotonically. */
const WAIST_SHARE = 0.2;
/** The hem sags this much (heights) at its centre. */
const HEM_SAG = 0.012;

/**
 * Half-width of the coat at height ny: along the shoulder line it widens from the collar to the shoulder
 * point (the inverse of the t^SHOULDER_EASE fall, so the line is flat at the neck and rounds into the
 * side); below the shoulder point it flares smoothly to the hem with a barely-there waist. One function
 * serves the polygon, the light field and the tests.
 */
export function coatHalfWidth(s: CoatProfile, ny: number): number {
  if (ny < s.shoulderNy) return lerp(s.collar, s.shoulder, clamp01((ny - s.collarNy) / (s.shoulderNy - s.collarNy)) ** (1 / SHOULDER_EASE));
  const u = clamp01((ny - s.shoulderNy) / (s.hemNy - s.shoulderNy));
  return lerp(s.shoulder, s.hem, u ** FLARE_EASE) - WAIST_SHARE * (s.hem - s.shoulder) * Math.sin(Math.PI * u) ** 2;
}

/** The round-4 silhouette set: the same organic construction for every walker (the facing changes nothing here). */
export function walkerSilhouette(kind: WalkerKind, _facing: WalkerFacing): WalkerSilhouette {
  const woman = kind === 'woman';
  // Measured against the reference figure: shoulders about 0.29 heights wide (the men a little wider), the
  // hem about 0.39, the coat from the shoulder point (0.85) to the hem at 0.25 (60 % of the height), the
  // head 0.112 tall under a bob that reaches 0.15 wide at the jaw and lies over the shoulders.
  const profile: CoatProfile = { shoulder: woman ? 0.145 : 0.16, hem: woman ? 0.195 : 0.185, collar: 0.06, collarNy: -0.895, shoulderNy: -0.85, hemNy: -0.25 };
  const { shoulder, hem, collar, collarNy, shoulderNy, hemNy } = profile;
  const chestNy = -0.7, beltNy = -0.56, bootNy = -0.09;
  const left: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    // The shoulder line, collar → shoulder point: flat at the neck, falling and rounding into the side.
    const ny = collarNy + (shoulderNy - collarNy) * (i / 8) ** SHOULDER_EASE;
    left.push([-coatHalfWidth(profile, ny), ny]);
  }
  for (let i = 1; i <= 14; i++) {
    // The side, flaring to the hem.
    const ny = shoulderNy + (hemNy - shoulderNy) * (i / 14);
    left.push([-coatHalfWidth(profile, ny), ny]);
  }
  const hemPts: Pt[] = [];
  for (let i = 1; i < 8; i++) {
    // The hem sags gently at the centre.
    const nx = -hem + (2 * hem * i) / 8;
    hemPts.push([nx, hemNy + HEM_SAG * (1 - (nx / hem) ** 2)]);
  }
  const right = left.map(([nx, ny]) => [-nx, ny] as Pt).reverse();
  const body: Pt[] = [...left, ...hemPts, ...right];
  // A leg with its boot: the outer edge down from under the hem to the foot, the inner edge back up; the
  // thigh tapers to the ankle and the boot is a touch wider than the ankle.
  const leg = (sgn: 1 | -1): Pt[] => {
    const outer: Pt[] = [[0.104, hemNy - 0.012], [0.095, -0.17], [0.086, bootNy], [0.09, -0.05], [0.092, 0]];
    const inner: Pt[] = [[0.024, 0], [0.026, -0.05], [0.03, bootNy], [0.021, -0.17], [0.012, hemNy - 0.012]];
    return [...outer, ...inner].map(([nx, ny]) => [sgn * nx, ny] as Pt);
  };
  const head = { cx: 0, cy: woman ? -0.945 : -0.94, rx: woman ? 0.046 : 0.044, ry: 0.056 };
  const hair: Pt[] = woman
    ? // A bob: a soft cap over the crown, widening down the sides to the jaw, locks ending over the shoulders,
      // open under the chin (the notch) so the coat's collar shows there.
      [[0, -1.034], [0.028, -1.03], [0.05, -1.015], [0.063, -0.99], [0.07, -0.955], [0.074, -0.915], [0.076, -0.88], [0.072, -0.858], [0.06, -0.848], [0.042, -0.87], [0, -0.9], [-0.042, -0.87], [-0.06, -0.848], [-0.072, -0.858], [-0.076, -0.88], [-0.074, -0.915], [-0.07, -0.955], [-0.063, -0.99], [-0.05, -1.015], [-0.028, -1.03]]
    : // A short cap over the crown and the back of the head, no widening.
      [[0, -1.012], [0.03, -1.006], [0.048, -0.99], [0.055, -0.965], [0.054, -0.94], [0.045, -0.93], [0.03, -0.95], [0, -0.958], [-0.03, -0.95], [-0.045, -0.93], [-0.054, -0.94], [-0.055, -0.965], [-0.048, -0.99], [-0.03, -1.006]];
  return { shoulder, hem, collar, collarNy, shoulderNy, chestNy, hemNy, beltNy, bootNy, body, legL: leg(-1), legR: leg(1), head, hair };
}

const inHead = (s: WalkerSilhouette, nx: number, ny: number): boolean => ((nx - s.head.cx) / s.head.rx) ** 2 + ((ny - s.head.cy) / s.head.ry) ** 2 <= 1;

/** True when the normalised point lies inside any of the silhouette's parts. */
export function insideWalkerSilhouette(s: WalkerSilhouette, nx: number, ny: number): boolean {
  return inHead(s, nx, ny) || pointInPolygon(nx, ny, s.hair) || pointInPolygon(nx, ny, s.body) || pointInPolygon(nx, ny, s.legL) || pointInPolygon(nx, ny, s.legR);
}

/** Body light 0..1 inside the coat: brightest at the chest, falling toward the hem and the edges (§11.1). */
export function bodyLight(s: WalkerSilhouette, nx: number, ny: number): number {
  const edge = clamp01(Math.abs(nx) / Math.max(coatHalfWidth(s, ny), 1e-3));
  const lateral = 1 - 0.38 * smoothstep(0.4, 1, edge);
  const down = 1 - 0.32 * smoothstep(s.chestNy, s.hemNy, ny);
  const up = 1 - 0.12 * smoothstep(s.chestNy - 0.06, s.collarNy, ny);
  return lateral * down * up;
}

function dotWalker(c: Ctx, id: Seed33RegionId, feet: Pt, height: number, facing: WalkerFacing, kind: WalkerKind, phase0S: number): WalkerRig {
  const w = c.w;
  const start = w.store.count;
  open(c, id, 'pavement', -(feet[1] < 0.63 ? 6 : 2.2), true);
  const [fx, fy] = feet;
  const X = (nx: number) => fx + (nx * height) / ASPECT;
  const Y = (ny: number) => fy + ny * height;
  const sil = walkerSilhouette(kind, facing);
  const woman = kind === 'woman';
  const toward = facing === 'toward';
  const lit = woman ? lerpRgb(P.camelLit, P.cupWhite, 0.45) : lerpRgb(P.walkerTanLit, P.limestoneShade, 0.3);
  const shade = woman ? P.camelShade : kind === 'man' ? P.walkerTan : P.walkerFarShade;
  const legTone = woman ? lerpRgb(P.camelShade, P.camelLit, 0.6) : lerpRgb(P.trousers, P.walkerTanLit, 0.55);
  const bootTone = woman ? lerpRgb(P.boots, P.camelShade, 0.5) : lerpRgb(P.boots, P.trousers, 0.5);
  // A featureless face toward us; the back of the head (hair over the lit tone) when walking away.
  const headTone = toward ? lit : lerpRgb(P.hair, lit, 0.35);
  const gain = woman ? 1 : kind === 'man' ? 0.62 : 0.55;
  const size = woman ? 3.3 : 2.6;
  const pitch = (DOT_PITCH_PX * PX_Y) / height / Math.sqrt(w.density); // in heights, isotropic
  // Lapels (toward only) read by colour alone: a V from the collar closing at the chest, no change of presence or alpha.
  const inLapel = (nx: number, ny: number): boolean => toward && ny < -0.62 && Math.abs(nx) < sil.collar * clamp01((ny + 0.62) / (sil.collarNy + 0.62));
  setMotion(c, 0);
  const top = Math.min(sil.head.cy - sil.head.ry, ...sil.hair.map(([, ny]) => ny));
  const widest = Math.max(sil.hem, 0.1) + pitch;
  for (let ny = 0; ny > top - pitch; ny -= pitch) {
    for (let nx = -widest; nx <= widest; nx += pitch) {
      let limb = -1;
      let L = 0;
      let colour: Rgb = lit;
      let halo: HaloKind = 'none';
      let dim = 1;
      if (inHead(sil, nx, ny)) {
        limb = 3;
        L = HEAD_LIGHT; // uniform: no features
        colour = headTone;
        halo = woman ? 'near' : 'none';
      } else if (pointInPolygon(nx, ny, sil.hair)) {
        limb = 3;
        L = 1;
        colour = P.hair;
      } else if (pointInPolygon(nx, ny, sil.body)) {
        limb = 0;
        halo = woman ? 'near' : 'none';
        L = bodyLight(sil, nx, ny);
        colour = lerpRgb(shade, lit, L);
        if (inLapel(nx, ny)) colour = lerpRgb(colour, P.cupWhite, 0.3);
        if (Math.abs(ny - sil.beltNy) < pitch * 0.5) {
          // The belt: this one row dims and darkens; every cell stays present.
          dim = BELT_DIM;
          colour = lerpRgb(colour, shade, 0.35);
        }
      } else if (pointInPolygon(nx, ny, sil.legL) || pointInPolygon(nx, ny, sil.legR)) {
        limb = pointInPolygon(nx, ny, sil.legL) ? 1 : 2;
        const boot = ny > sil.bootNy;
        L = boot ? 0.45 : 0.62;
        colour = boot ? bootTone : legTone;
      }
      if (limb < 0) continue;
      w.tag = limb;
      c.halo = halo;
      bead(c, X(nx), Y(ny), colour, gain * lerp(BODY_ALPHA[0], BODY_ALPHA[1], L) * dim, size, -ny / 1.05);
    }
  }
  c.halo = 'none';
  w.tag = 0;
  const region = endRegion(w);
  const end = w.store.count;
  const n = end - start;
  const approaching = woman && toward;
  const rig: WalkerRig = {
    id: region.id,
    start,
    end,
    homeFeet: feet,
    homeHeight: height,
    facing,
    nx: new Float32Array(n),
    ny: new Float32Array(n),
    limb: new Uint8Array(n),
    baseA: new Float32Array(n),
    baseSize: new Float32Array(n),
    startY: approaching ? WOMAN_APPROACH.startY : fy,
    endY: woman ? (approaching ? WOMAN_APPROACH.endY : 0.61) : fy - 0.045,
    travelS: woman ? (approaching ? WOMAN_APPROACH.travelS : 34) : 36,
    stepHz: woman ? 1.35 : 1.5,
    phase0S,
  };
  const s = w.store;
  for (let k = start; k < end; k++) {
    const i = k - start;
    rig.nx[i] = (((s.x[k] ?? 0) - fx) * ASPECT) / height;
    rig.ny[i] = ((s.y[k] ?? 0) - fy) / height;
    rig.limb[i] = w.tags[k] ?? 0;
    rig.baseA[i] = s.a[k] ?? 0;
    rig.baseSize[i] = s.size[k] ?? 1;
  }
  if (approaching) INTROS.set(rig, womanIntro(c.buildMs));
  return rig;
}

// ---------------------------------------------------------------------------
// Rattan chair: hoop as a honey double bright line on halos, diamond lattice as beaded lines (arrival.ts CHAIR).

const CHAIR = { cx: 0.11, cy: 0.75, rx: 0.09, ry: 0.29, rot: -0.42 };

function chair(c: Ctx): void {
  open(c, 'obj:neighbour-chair', 'near', -0.12);
  const { cx, cy, rx, ry, rot } = CHAIR;
  const hoopW = 0.014;
  const A = ry - hoopW * 0.9;
  const B = rx * ASPECT - hoopW * 0.9;
  const toFrame = (lx: number, ly: number): Pt => {
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    return [cx + (lx * cosR - ly * sinR) / ASPECT, cy + lx * sinR + ly * cosR];
  };
  const clipLine = (phi: number, k: number): [Pt, Pt] | null => {
    const dx = -Math.sin(phi), dy = Math.cos(phi);
    const px = k * Math.cos(phi), py = k * Math.sin(phi);
    const qa = (dx * dx) / (B * B) + (dy * dy) / (A * A);
    const qb = 2 * ((px * dx) / (B * B) + (py * dy) / (A * A));
    const qc = (px * px) / (B * B) + (py * py) / (A * A) - 1;
    const disc = qb * qb - 4 * qa * qc;
    if (disc <= 0) return null;
    const r = Math.sqrt(disc);
    return [toFrame(px + dx * ((-qb - r) / (2 * qa)), py + dy * ((-qb - r) / (2 * qa))), toFrame(px + dx * ((-qb + r) / (2 * qa)), py + dy * ((-qb + r) / (2 * qa)))];
  };
  let i = 0;
  for (const phi of [0.72, -0.72]) {
    for (let k = -0.42; k <= 0.42; k += 0.052, i++) {
      const seg = clipLine(phi, k);
      if (!seg) continue;
      beadPath(c, seg, { colour: lerpRgb(P.rattan, P.rattanLit, 0.3 + 0.4 * hash01(i, 55)), alpha: 0.55 + 0.25 * hash01(i, 56), size: 2.6, motion: 0.1, birth: (s) => 0.2 + 0.6 * s });
    }
  }
  // The hoop: a double bright honey line, each bead on a halo (§10.6).
  const arc = (r: number) => ellipseArc(cx, cy, rx + r / ASPECT, ry + r, -Math.PI * 1.08, Math.PI * 0.43, 140, rot, ASPECT).filter(([x]) => x >= -0.02);
  c.halo = 'near';
  beadPath(c, arc(hoopW / 2), { colour: P.rattanLit, alpha: 1, size: 3.6, motion: 0.12, birth: (s) => 0.1 + 0.8 * s, sparkle: 0.08 });
  beadPath(c, arc(-hoopW / 2), { colour: lerpRgb(P.rattanLit, P.rattan, 0.3), alpha: 0.95, size: 3.4, motion: 0.12, birth: (s) => 0.1 + 0.8 * s, sparkle: 0.08 });
  c.halo = 'none';
  endRegion(c.w);
}

// ---------------------------------------------------------------------------
// Marble table: distinct radial lines of light from a focal point below the frame to the rim ellipse
// (arrival.ts TABLE geometry), dark gaps between them, alpha 0.15 at the frame bottom → 1.0 at the rim,
// beads 3.0 px (3.8 px in the outer third); a second ray set offset by half a pitch covers only the outer
// part (from s = TABLE_OUTER_RAYS_FROM) so the burst thickens toward the rim without filling the centre;
// the rim a bright thick triple ring, 4.2 px outermost, on halos (brief §10.2, §11.3).

const TABLE = { cx: 0.5, cy: 1.04, rx: 0.53, ry: 0.275 };
export const TABLE_FOCAL: Pt = [0.5, 1.3];
/** Angular pitch between rays, degrees. */
export const TABLE_RAY_PITCH_DEG = 0.9;
/** Bead size gain reached in the outer third of each ray (3.0 → 3.8 px). */
export const TABLE_BLOOM = 3.8 / 3.0 - 1;
/** The half-pitch-offset second ray set starts at this fraction of the ray (margin = 0, rim = 1). */
export const TABLE_OUTER_RAYS_FROM = 0.55;
/** Outermost rim ring bead size in px at 1080 (§11.3). */
export const TABLE_RIM_PX = 4.2;
const SAUCER = { cx: 0.7, cy: 0.89, rx: 0.094, ry: 0.045 };
const ASHTRAY = { cx: 0.335, rimY: 0.86, baseY: 0.928, rx: 0.066, rimRy: 0.022, baseRx: 0.062, baseRy: 0.02 };
const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
/** Table beads are dimmer where objects stand on the marble. */
const underObject = (x: number, y: number): number => (inEllipse(x, y, SAUCER.cx, SAUCER.cy, SAUCER.rx, SAUCER.ry) || inEllipse(x, y, ASHTRAY.cx, ASHTRAY.baseY - 0.03, ASHTRAY.rx, 0.05) ? 0.3 : 1);

function table(c: Ctx): void {
  open(c, 'obj:table', 'near', -0.05);
  const { cx, cy, rx, ry } = TABLE;
  const [fxp, fyp] = TABLE_FOCAL;
  const depth = (_x: number, y: number) => 0.2 - (1.0 - y) * 1.6;
  const step = (TABLE_RAY_PITCH_DEG * Math.PI) / 180;
  /** Rays are stored from the frame margin up to the rim; s = 0 at the margin, 1 at the rim. */
  const yEnter = 1.03;
  const alphaAt = (s: number) => 0.15 + 0.85 * s ** 1.4;
  const sizeAt = (s: number) => 1 + TABLE_BLOOM * smoothstep(0.62, 0.72, s);
  const birthAtS = (s: number) => 0.15 + 0.75 * s;
  /** One ray at angle th (isotropic, from straight up), stored from s0 of its full margin → rim length to the rim. */
  const ray = (th: number, s0: number, k: number): void => {
    const dx = Math.sin(th) / ASPECT, dy = -Math.cos(th);
    if (dy >= -1e-6) return;
    const a = dx / rx, b = dy / ry, y0 = (fyp - cy) / ry;
    const qa = a * a + b * b, qb = 2 * y0 * b, qc = y0 * y0 - 1;
    const disc = qb * qb - 4 * qa * qc;
    if (disc <= 0) return;
    const t = (-qb + Math.sqrt(disc)) / (2 * qa); // the focal point lies inside the ellipse: one forward hit
    const rim: Pt = [fxp + dx * t, fyp + dy * t];
    if (rim[1] > yEnter) return;
    const tEnter = (yEnter - fyp) / dy;
    const enter: Pt = [fxp + dx * tEnter, fyp + dy * tEnter];
    const from: Pt = [lerp(enter[0], rim[0], s0), lerp(enter[1], rim[1], s0)];
    const S = (q: number) => s0 + (1 - s0) * q; // path fraction → fraction of the full ray
    beadPath(c, [from, rim], {
      colour: lerpRgb(TABLE_CREAM, P.cupWhite, 0.2 + 0.5 * k),
      alpha: (q) => alphaAt(S(q)),
      size: 3.0,
      sizeAt: (q) => sizeAt(S(q)),
      motion: 0.08 + 0.1 * k,
      birth: (q) => birthAtS(S(q)),
      depth: (x, y) => depth(x, y),
      sparkle: 0.2,
    });
  };
  let i = 0;
  for (let th = -Math.PI * 0.5; th <= Math.PI * 0.5 + 1e-9; th += step, i++) {
    ray(th, 0, hash01(i, 77));
    // The outer set, offset by half a pitch, from TABLE_OUTER_RAYS_FROM to the rim (§11.3).
    ray(th + step / 2, TABLE_OUTER_RAYS_FROM, hash01(i, 78));
  }
  // Dim the rays under the saucer and ashtray: rewrite alpha of the beads just written there.
  const s = c.w.store;
  const region = c.w.regions[c.w.regions.length - 1];
  if (region) for (let k = region.start; k < s.count; k++) s.a[k] = (s.a[k] ?? 0) * underObject(s.x[k] ?? 0, s.y[k] ?? 0);
  // The rim: a bright thick triple beaded ellipse along the visible arc (4.2 px outermost), each bead on a halo.
  const rimArc = (r: number) => ellipseArc(cx, cy, rx - r / ASPECT, ry - r, Math.PI * 1.02, Math.PI * 1.98, 260, 0, ASPECT).filter(([, y]) => y <= yEnter);
  c.halo = 'near';
  beadPath(c, rimArc(0), { colour: P.cupWhite, alpha: 1, size: TABLE_RIM_PX, motion: 0.1, birth: (q) => 0.7 + 0.3 * q, depth: (x, y) => depth(x, y), sparkle: 0.06 });
  beadPath(c, rimArc(0.0045), { colour: lerpRgb(P.cupWhite, CAFE_CREME, 0.3), alpha: 0.95, size: 3.9, motion: 0.1, birth: (q) => 0.7 + 0.3 * q, depth: (x, y) => depth(x, y), sparkle: 0.08 });
  beadPath(c, rimArc(0.009), { colour: TABLE_CREAM, alpha: 0.9, size: 3.6, motion: 0.1, birth: (q) => 0.7 + 0.3 * q, depth: (x, y) => depth(x, y), sparkle: 0.1 });
  c.halo = 'none';
  endRegion(c.w);
}

// ---------------------------------------------------------------------------
// Dot-fill: an ordered dot grid inside a mask, presence by the 4×4 Bayer threshold against a shading
// field (bright on the lit side, dim on the far side), so the cup, saucer and ashtray read as luminous
// beaded solids under their contour rings (brief §8.4; §10.3 makes them dense: 3 px pitch, alpha 0.9–1).

/** Dot-fill pitch in px at 1080 (the glass ashtray). */
export const DOT_FILL_PITCH_PX = 3;
/** Porcelain dot-fill pitch for the cup and the saucer, at alpha 1.0 (§11.4). */
export const PORCELAIN_PITCH_PX = 2.6;

interface DotFillSpec {
  /** Bounding box of the grid (frame units). */
  box: Rect;
  inside: (x: number, y: number) => boolean;
  /** Shading field 0..1: Bayer presence and brightness. */
  light: (x: number, y: number) => number;
  colour: (L: number) => Rgb;
  size: number;
  motion: number;
  /** Birth progress inside the region window for a dot at (x, y). */
  birth: (x: number, y: number) => number;
  /** Alpha at L = 0 and L = 1 (default 0.9 → 1). */
  alpha?: readonly [number, number];
  /** Dot pitch in px at 1080 (default DOT_FILL_PITCH_PX). */
  pitchPx?: number;
  depth?: (x: number, y: number) => number;
}

function dotFill(c: Ctx, f: DotFillSpec): void {
  const w = c.w;
  const pitchY = ((f.pitchPx ?? DOT_FILL_PITCH_PX) * PX_Y) / Math.sqrt(w.density);
  const pitchX = pitchY / ASPECT;
  const [a0, a1] = f.alpha ?? [0.9, 1];
  const [x0, y0, x1, y1] = f.box;
  setMotion(c, f.motion);
  let row = 0;
  for (let y = y0 + pitchY * 0.5; y < y1; y += pitchY, row++) {
    let col = 0;
    for (let x = x0 + pitchX * 0.5; x < x1; x += pitchX, col++) {
      if (!f.inside(x, y)) continue;
      const L = clamp01(f.light(x, y));
      if (L <= bayerAt(row, col)) continue;
      bead(c, x, y, f.colour(L), lerp(a0, a1, L), f.size, f.birth(x, y), f.depth?.(x, y));
    }
  }
}

// ---------------------------------------------------------------------------
// Glass ashtray with an unbranded cigarette, then the smoke emitter slots.

function emitterSlots(c: Ctx, origin: Pt, n: number, colour: Rgb): void {
  const w = c.w;
  const count = Math.round(n * Math.min(Math.max(w.density, 0.5), 1.25));
  setMotion(c, 0);
  w.birthMs = birthAt(c, 0);
  for (let i = 0; i < count; i++) {
    if (w.store.count >= w.store.capacity) {
      w.overflow++;
      continue;
    }
    emit(w, origin[0], origin[1], w.current?.depth ?? 0, colour, 0, 2);
  }
}

function ashtray(c: Ctx): EmitterRig[] {
  open(c, 'obj:ashtray', 'near', -0.08);
  const { cx, rimY, baseY, rx, rimRy, baseRx, baseRy } = ASHTRAY;
  // A bright glass ring object (§10.3): the front wall between rim and base as a dense glassLight dot-fill
  // on halos, lit from the left; the ash well inside the rim dim and unhaloed; bright contour rings.
  const wall: Pt[] = [...ellipseArc(cx, rimY, rx, rimRy, 0, Math.PI, 40, 0, ASPECT), ...ellipseArc(cx, baseY, baseRx, baseRy, Math.PI, 0, 40, 0, ASPECT)];
  const across = (x: number) => clamp01((x - (cx - rx)) / (2 * rx));
  c.halo = 'near';
  dotFill(c, {
    box: [cx - rx, rimY, cx + rx, baseY + baseRy],
    inside: (x, y) => pointInPolygon(x, y, wall),
    // Glass, not porcelain: the wall thins toward the shaded side so the rings and hatch lines read through it.
    light: (x) => 0.35 + 0.5 * (1 - across(x)) ** 1.3,
    colour: (L) => lerpRgb(P.glass, P.glassLight, 0.4 + 0.6 * L),
    size: 3.4,
    motion: 0.12,
    birth: (_x, y) => 0.25 + 0.3 * (1 - clamp01((y - rimY) / (baseY - rimY))),
    alpha: [0.8, 1],
  });
  c.halo = 'none';
  dotFill(c, {
    box: [cx - rx, rimY - rimRy, cx + rx, rimY + rimRy],
    inside: (x, y) => inEllipse(x, y, cx, rimY, rx * 0.95, rimRy * 0.9),
    light: (x) => 0.3 + 0.3 * (1 - across(x)),
    colour: (L) => lerpRgb(P.ash, P.glass, L),
    size: 2.8,
    motion: 0.12,
    birth: () => 0.5,
    alpha: [0.35, 0.5],
    pitchPx: 4,
  });
  const ring = (y: number, ex: number, ey: number, t0: number, t1: number, colour: Rgb, alpha: number, size: number) =>
    beadPath(c, ellipseArc(cx, y, ex, ey, t0, t1, 90, 0, ASPECT), { colour, alpha, size, motion: 0.12, birth: (s) => 0.2 + 0.6 * s, sparkle: 0.08 });
  // Rim (a bright double ring), the base (front half), wall hatch lines on the front half, all on halos.
  c.halo = 'near';
  ring(rimY, rx, rimRy, 0, Math.PI * 2, P.glassLight, 1, 3.8);
  ring(rimY + 0.004, rx * 0.93, rimRy * 0.85, 0, Math.PI * 2, P.glassLight, 0.9, 3.4);
  ring(baseY, baseRx, baseRy, 0, Math.PI, P.glassLight, 0.95, 3.6);
  for (let i = 0; i <= 7; i++) {
    const t = (Math.PI * i) / 7;
    const a = ellipsePoint(cx, rimY, rx, rimRy, t, 0, ASPECT), b = ellipsePoint(cx, baseY, baseRx, baseRy, t, 0, ASPECT);
    beadPath(c, [a, b], { colour: P.glassLight, alpha: 0.7 + 0.3 * Math.sin(t), size: 3.2, motion: 0.12, birth: (s) => 0.3 + 0.5 * s, pitch: 3.5 * PX_Y });
  }
  // The notch where the cigarette rests on the rim.
  beadPath(c, [[0.389, 0.857], [0.397, 0.867], [0.405, 0.857]], { colour: P.glassLight, alpha: 1, size: 3.4, motion: 0.12 });
  c.halo = 'none';
  endRegion(c.w);

  open(c, 'obj:cigarette', 'near', -0.08);
  const tip: Pt = [0.318, 0.906];
  const end: Pt = [0.405, 0.846];
  const at = (f: number, off = 0): Pt => {
    const x = tip[0] + (end[0] - tip[0]) * f, y = tip[1] + (end[1] - tip[1]) * f;
    const nx = -(end[1] - tip[1]), ny = (end[0] - tip[0]) * ASPECT;
    const l = Math.hypot(nx, ny);
    return [x + (nx / l) * off / ASPECT, y + (ny / l) * off];
  };
  for (const off of [-0.003, 0.003]) {
    beadPath(c, [at(0.08, off), at(0.72, off)], { colour: P.cigPaper, alpha: 0.95, size: 3.0, motion: 0.08 });
    beadPath(c, [at(0.72, off), at(1.0, off)], { colour: P.cigFilter, alpha: 0.9, size: 3.0, motion: 0.08 });
  }
  beadPath(c, [at(0.0), at(0.08)], { colour: P.ash, alpha: 0.8, size: 2.6, motion: 0.08 });
  setMotion(c, 0.2);
  for (const [ox, oy] of [[0, 0], [0.0015, -0.001], [0.0012, 0.0012]] as const) bead(c, tip[0] + 0.002 + ox, tip[1] + oy, P.ember, 1, 3.4, 1);
  endRegion(c.w);

  const smokeStart = c.w.store.count;
  open(c, 'fx:smoke', 'near', -0.08, true);
  emitterSlots(c, [0.317, 0.902], 240, P.smoke);
  endRegion(c.w);
  return [{ id: 'fx:smoke', start: smokeStart, end: c.w.store.count, origin: [0.317, 0.902] }];
}

// ---------------------------------------------------------------------------
// Espresso cup on its saucer (§10.3, §11.4): solid luminous porcelain, cupWhite dot-fills at a 2.6 px
// pitch and alpha 1.0 (bead 3.4) on halos, the coffee surface empty (dark) inside a bright rim, the handle
// a double bright arc; then the steam emitter slots.

function cupAndSaucer(c: Ctx): EmitterRig[] {
  open(c, 'obj:saucer', 'near', 0);
  const { cx: scx, cy: scy, rx: srx, ry: sry } = SAUCER;
  c.halo = 'near';
  // Saucer surface: brighter toward the rim and the lit (left) side, a touch dimmer at the centre under the cup.
  dotFill(c, {
    box: [scx - srx, scy - sry, scx + srx, scy + sry],
    inside: (x, y) => inEllipse(x, y, scx, scy, srx, sry),
    light: (x, y) => {
      const u = (x - scx) / srx, v = (y - scy) / sry;
      const r = clamp01(Math.hypot(u, v));
      return 0.6 + 0.4 * r ** 1.3 * (0.85 + 0.15 * (0.5 - 0.5 * u));
    },
    colour: (L) => lerpRgb(CAFE_CREME, P.saucer, 0.4 + 0.6 * L),
    size: 3.4,
    motion: 0.1,
    birth: (_x, y) => 0.05 + 0.3 * (1 - clamp01((y - (scy - sry)) / (2 * sry))),
    alpha: [1, 1],
    pitchPx: PORCELAIN_PITCH_PX,
  });
  const rings: [number, Rgb, number, number][] = [[1, P.cupWhite, 1, 3.8], [0.93, P.saucer, 0.9, 3.2], [0.75, lerpRgb(P.saucer, CAFE_CREME, 0.4), 0.85, 3.0], [0.62, P.saucer, 0.9, 3.2], [0.45, lerpRgb(P.saucer, CAFE_CREME, 0.4), 0.85, 3.0]];
  rings.forEach(([f, colour, alpha, size], i) => beadPath(c, ellipseArc(scx, scy - 0.004 * (1 - f), srx * f, sry * f, 0, Math.PI * 2, 120, 0, ASPECT), { colour, alpha, size, motion: 0.1, birth: () => 0.1 + 0.12 * i, sparkle: 0.08 }));
  c.halo = 'none';
  endRegion(c.w);

  open(c, 'obj:cup', 'near', 0);
  const cx = 0.7, rimY = 0.768, rimRx = 0.052, rimRy = 0.014, baseY = 0.853, baseRx = 0.038, baseRy = 0.011;
  c.halo = 'near';
  // Body fill: the front half between rim and base (arrival.ts body loop), lit from the left, dense and white.
  const body: Pt[] = [...ellipseArc(cx, rimY, rimRx, rimRy, Math.PI, 0, 30, 0, ASPECT), ...ellipseArc(cx, baseY, baseRx, baseRy, 0, Math.PI, 30, 0, ASPECT)];
  dotFill(c, {
    box: [cx - rimRx, rimY, cx + rimRx, baseY + baseRy],
    inside: (x, y) => pointInPolygon(x, y, body),
    light: (x, y) => {
      const u = clamp01((x - (cx - rimRx)) / (2 * rimRx));
      const v = clamp01((y - rimY) / (baseY - rimY));
      return 0.6 + 0.4 * (1 - u) ** 1.4 * (1 - 0.15 * v);
    },
    colour: (L) => lerpRgb(CAFE_CREME, P.cupWhite, 0.5 + 0.5 * L),
    size: 3.4,
    motion: 0.12,
    birth: (_x, y) => 0.08 + 0.3 * (1 - clamp01((y - rimY) / (baseY - rimY))),
    alpha: [1, 1],
    pitchPx: PORCELAIN_PITCH_PX,
  });
  const ring = (y: number, ex: number, ey: number, t0: number, t1: number, colour: Rgb, alpha: number, size: number, f0: number) =>
    beadPath(c, ellipseArc(cx, y, ex, ey, t0, t1, 100, 0, ASPECT), { colour, alpha, size, motion: 0.1, birth: () => f0, sparkle: 0.06 });
  // The rim: bright and thick (outer and inner edge); the coffee surface inside it stays dark.
  ring(rimY, rimRx, rimRy, 0, Math.PI * 2, P.cupWhite, 1, 3.8, 0.5);
  ring(rimY + 0.001, rimRx * 0.92, rimRy * 0.86, 0, Math.PI * 2, lerpRgb(P.cupWhite, CAFE_CREME, 0.3), 0.9, 3.2, 0.55);
  ring(baseY, baseRx, baseRy, 0, Math.PI, P.cupWhite, 0.95, 3.4, 0.05);
  // Handle: a double bright arc.
  const handle: Pt[] = [[0.749, 0.783], [0.771, 0.778], [0.787, 0.794], [0.786, 0.816], [0.77, 0.831], [0.752, 0.829]];
  beadPath(c, handle, { colour: P.cupWhite, alpha: 1, size: 3.6, motion: 0.1, birth: () => 0.5, sparkle: 0.06 });
  beadPath(c, handle.map(([x, y]) => [x + 0.004 / ASPECT * 1.2, y + 0.005] as Pt), { colour: lerpRgb(P.cupWhite, CAFE_CREME, 0.3), alpha: 0.95, size: 3.4, motion: 0.1, birth: () => 0.55, sparkle: 0.06 });
  c.halo = 'none';
  endRegion(c.w);

  const steamStart = c.w.store.count;
  open(c, 'fx:steam', 'near', 0, true);
  emitterSlots(c, [0.7, 0.762], 170, P.steam);
  endRegion(c.w);
  return [{ id: 'fx:steam', start: steamStart, end: c.w.store.count, origin: [0.7, 0.762] }];
}

// ---------------------------------------------------------------------------

export function buildSeed33Scene(opts: Seed33Options = DEFAULT_SEED33): SceneFrame {
  return authorSeed33(opts, CAPACITY);
}

/** Halo beads of a seed-33 frame (diagnostics for the hand-back and tests). */
const HALO_COUNTS = new WeakMap<SceneFrame, number>();
export const haloCountOf = (frame: SceneFrame): number => HALO_COUNTS.get(frame) ?? 0;

/** Authoring with an explicit capacity (tests use a small one to exercise the overflow path). */
export function authorSeed33(opts: Seed33Options, capacity: number): SceneFrame {
  const store = createStore(capacity);
  const w = createWriter(store, ASPECT, opts.density, opts.seed);
  const buildMs = Number.isFinite(opts.buildMs) ? Math.max(0, opts.buildMs) : 0;
  const c: Ctx = { w, buildMs, t0: 0, t1: 0, n: 0, halo: 'none', halos: 0 };
  const rigs: Rigs = { walkers: [], emitters: [] };

  farSkyline(c);
  mansard(c);
  rightFacade(c);
  leftFacade(c);
  awning(c);
  farLamp(c);
  // The far walkers' cycle phases keep both present through the complete + 5 s still (t = 17 s of a 12 s build).
  rigs.walkers.push(dotWalker(c, 'actors:passersby/third', [0.476, 0.606], 0.19, 'away', 'far', 5));
  rigs.walkers.push(dotWalker(c, 'actors:passersby/man', [0.528, 0.616], 0.205, 'away', 'man', 9));
  nearLamp(c);
  rigs.walkers.push(dotWalker(c, 'actors:passersby/woman', [0.366, 0.745], 0.39, 'toward', 'woman', 1.6));
  chair(c);
  table(c);
  rigs.emitters.push(...ashtray(c));
  rigs.emitters.push(...cupAndSaucer(c));

  if (w.overflow > 0) throw new RangeError(`seed-33 scene overflowed its particle capacity by ${w.overflow}`);
  const frame: SceneFrame = {
    store,
    regions: w.regions,
    aspect: ASPECT,
    paper: GROUND,
    seed: opts.seed,
    sky: { ...SEED33_SKY },
    tiles: authorTiles(opts.seed, w.regions, buildMs, ASPECT),
    build: { durationMs: buildMs },
  };
  RIGS.set(frame, rigs);
  HALO_COUNTS.set(frame, c.halos);
  // The authored shimmer lane is kept privately; reduced motion zeroes the live lane (setReducedMotion restores it).
  MOTION_AUTHORED.set(frame, store.motion.slice(0, store.count));
  if (opts.reducedMotion) store.motion.fill(0, 0, store.count);
  return frame;
}
