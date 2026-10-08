// The authored arrival frame (P1) as particle targets, measured from the selected reference
// w4-20261005-paris-p1-converge/img-01 on a 10%/2% grid (see the step-1 REVIEW). Everything is
// native authoring in the Paris palette; no reference pixels are read at runtime. Regions are
// written far → near so renderers can draw in store order. Dynamic regions (walkers, steam,
// smoke) also record a rig for life.ts through `rigsOf`.
import { PALETTE as P } from './palette.ts';
import { createStore } from './store.ts';
import type { Rgb, SceneFrame } from './types.ts';
import {
  beginRegion,
  createWriter,
  ellipseArc,
  ellipsePoint,
  endRegion,
  fillEllipse,
  fillPolygon,
  ink,
  lerpRgb,
  quadColumn,
  rect,
  smoothstep,
  strokePolyline,
} from './author.ts';
import type { Pt, Writer } from './author.ts';

export type WalkerFacing = 'away' | 'toward';

export interface ArrivalOptions {
  /** Deterministic authoring seed. */
  seed: number;
  /** Particle density multiplier, clamped to 0.25..1.25; 1 is the authored default. */
  density: number;
  /** Facing of the near walker (the woman in the camel trench). The brief prefers 'away'; P1 shows 'toward'. */
  nearWalkerFacing: WalkerFacing;
}

export const DEFAULT_ARRIVAL: ArrivalOptions = { seed: 7, density: 1, nearWalkerFacing: 'away' };
export const ASPECT = 16 / 9;
export const CAPACITY = 262_144;

// Measured composition constants (frame units).
export const HORIZON_Y = 0.545;
/** Walker height as a function of foot height on the pavement (fitted to the woman and the far man). */
export const walkerHeightAt = (feetY: number): number => 1.46 * (feetY - 0.478);

export type Limb = 0 | 1 | 2 | 3 | 4; // body, left leg, right leg, head, shadow

export interface WalkerRig {
  id: string;
  start: number;
  end: number;
  homeFeet: Pt;
  homeHeight: number;
  facing: WalkerFacing;
  /** Normalised offsets from the feet: nx isotropic (× height / aspect), ny in heights (negative = up). */
  nx: Float32Array;
  ny: Float32Array;
  limb: Uint8Array;
  baseA: Float32Array;
  baseSize: Float32Array;
  /** Stroll parameters: foot height travels from startY to endY over travelS seconds, then fades and respawns. */
  startY: number;
  endY: number;
  travelS: number;
  stepHz: number;
  phase0S: number;
}

export interface EmitterRig {
  id: 'fx:steam' | 'fx:smoke';
  start: number;
  end: number;
  origin: Pt;
}

export interface Rigs {
  walkers: WalkerRig[];
  emitters: EmitterRig[];
}

const RIGS = new WeakMap<SceneFrame, Rigs>();
export const rigsOf = (frame: SceneFrame): Rigs | undefined => RIGS.get(frame);

// ---------------------------------------------------------------------------

export function buildArrivalScene(opts: ArrivalOptions = DEFAULT_ARRIVAL): SceneFrame {
  return authorArrival(opts, CAPACITY);
}

/** Authoring with an explicit capacity (tests use a small one to exercise the overflow path). */
export function authorArrival(opts: ArrivalOptions, capacity: number): SceneFrame {
  const store = createStore(capacity);
  const w = createWriter(store, ASPECT, opts.density, opts.seed);
  const rigs: Rigs = { walkers: [], emitters: [] };

  skyLines(w);
  mansard(w);
  rightFacade(w);
  leftFacade(w);
  awning(w);
  farLamp(w);
  rigs.walkers.push(walker(w, 'actors:passersby/third', [0.476, 0.606], 0.19, 'away', 'far'));
  rigs.walkers.push(walker(w, 'actors:passersby/man', [0.528, 0.616], 0.205, 'away', 'man'));
  nearLamp(w);
  rigs.walkers.push(walker(w, 'actors:passersby/woman', [0.366, 0.745], 0.39, opts.nearWalkerFacing, 'woman'));
  chair(w);
  table(w);
  rigs.emitters.push(...ashtray(w));
  rigs.emitters.push(...cupAndSaucer(w));

  if (w.overflow > 0) throw new RangeError(`arrival scene overflowed its particle capacity by ${w.overflow}`);
  const frame: SceneFrame = { store, regions: w.regions, aspect: ASPECT, paper: P.paper, seed: opts.seed, sky: null, tiles: [], build: { durationMs: 0 } };
  RIGS.set(frame, rigs);
  return frame;
}

// ---------------------------------------------------------------------------
// Far field: faint pencil perspective lines in the paper sky.

function skyLines(w: Writer): void {
  beginRegion(w, 'layer:far', 'far', -40);
  const lines: Pt[][] = [
    [[0.395, 0.0], [0.46, 0.33]],
    [[0.30, 0.0], [0.455, 0.265]],
    [[0.62, 0.0], [0.59, 0.19]],
    [[0.70, 0.0], [0.60, 0.22]],
  ];
  for (const l of lines) ink(w, l, P.pencilFaint, 0.3, 1.6, false, 0.0014);
  endRegion(w);
}

// ---------------------------------------------------------------------------
// The zinc mansard block that closes the street.

function mansard(w: Writer): void {
  beginRegion(w, 'layer:facade/mansard', 'facade', -14);
  // Chimneys first (behind the roof ridge), then roof, then wall.
  for (const [x0, x1] of [[0.49, 0.501], [0.535, 0.549]] as const) {
    fillPolygon(w, rect(x0, 0.183, x1, 0.232), { colour: P.limestoneShade, coverage: 0.9, size: 2.8 });
    ink(w, rect(x0, 0.183, x1, 0.232), P.inkSoft, 0.55, 1.5, true);
  }
  const roof: Pt[] = [[0.47, 0.225], [0.60, 0.225], [0.612, 0.305], [0.455, 0.305]];
  fillPolygon(w, roof, {
    colour: (_x, _y, u, v) => lerpRgb(P.zincLight, P.zinc, 0.35 + 0.5 * v + 0.2 * u),
    coverage: 0.92,
    size: 2.9,
  });
  ink(w, roof, P.sepiaInk, 0.6, 1.6, true);
  // Dormers on the roof.
  for (const cx of [0.49, 0.515, 0.551]) {
    const d = rect(cx - 0.007, 0.243, cx + 0.007, 0.29);
    fillPolygon(w, d, { colour: P.mullion, coverage: 0.95, size: 2.6 });
    fillPolygon(w, rect(cx - 0.004, 0.252, cx + 0.004, 0.285), { colour: P.shutterShade, coverage: 0.9, size: 2.4 });
    ink(w, d, P.inkSoft, 0.6, 1.4, true);
  }
  // Wall.
  const wall: Pt[] = [[0.458, 0.305], [0.61, 0.305], [0.61, 0.50], [0.458, 0.50]];
  fillPolygon(w, wall, { colour: (_x, _y, u) => lerpRgb(P.limestoneLit, P.limestoneShade, 0.25 + 0.4 * u), coverage: 0.62, size: 3.0 });
  ink(w, [[0.458, 0.305], [0.458, 0.50], [0.61, 0.50], [0.61, 0.305]], P.inkSoft, 0.5, 1.5);
  // Two rows of shuttered windows.
  for (const [y0, y1] of [[0.335, 0.39], [0.42, 0.476]] as const) {
    for (const cx of [0.48, 0.513, 0.575]) {
      const glass = rect(cx - 0.0055, y0, cx + 0.0055, y1);
      fillPolygon(w, glass, { colour: P.paneLight, coverage: 0.9, size: 2.4 });
      fillPolygon(w, rect(cx - 0.0125, y0, cx - 0.0055, y1), { colour: P.shutterGreen, coverage: 0.95, size: 2.4 });
      fillPolygon(w, rect(cx + 0.0055, y0, cx + 0.0125, y1), { colour: P.shutterGreen, coverage: 0.95, size: 2.4 });
      ink(w, rect(cx - 0.0125, y0, cx + 0.0125, y1), P.inkSoft, 0.5, 1.4, true);
    }
  }
  ink(w, [[0.455, 0.505], [0.612, 0.505]], P.inkSoft, 0.5, 1.5);
  endRegion(w);
}

// ---------------------------------------------------------------------------
// Right façade (in shade), receding to the left.

const R_TOP: [Pt, Pt] = [[0.585, 0.29], [1.0, 0.19]]; // string course between floors
const R_BASE: [Pt, Pt] = [[0.585, 0.555], [1.0, 0.725]];
const lineY = (l: [Pt, Pt], x: number): number => l[0][1] + ((l[1][1] - l[0][1]) * (x - l[0][0])) / (l[1][0] - l[0][0]);
const rightDepth = (x: number): number => -12 + 9.5 * Math.min(Math.max((x - 0.585) / 0.415, 0), 1);

function shutterLeaf(w: Writer, x0: number, y0: number, x1: number, y1: number, shade = 0): void {
  const leaf = rect(x0, y0, x1, y1);
  fillPolygon(w, leaf, { colour: lerpRgb(P.shutterGreen, P.shutterShade, shade * 0.6), coverage: 0.95, size: 3.2, spacing: 0.0034, tone: 0.025 });
  // Louvres: short dark dashes.
  const pitch = 0.011;
  const inset = (x1 - x0) * 0.18;
  for (let y = y0 + pitch; y < y1 - pitch * 0.5; y += pitch) {
    strokePolyline(w, [[x0 + inset, y + 0.0015], [x1 - inset, y - 0.0015]], 0.0022, { colour: P.shutterLouvre, alpha: 0.85, size: 2.0, spacing: 0.0024, tone: 0.02 });
  }
  ink(w, leaf, P.inkSoft, 0.55, 1.5, true);
}

function windowGlass(w: Writer, x0: number, y0: number, x1: number, y1: number, light = 0.35): void {
  const g = rect(x0, y0, x1, y1);
  fillPolygon(w, g, {
    colour: (_x, _y, _u, v) => lerpRgb(P.paneLight, P.windowPane, smoothstep(0.05, 0.6, v) * (1 - light * 0.3)),
    coverage: 0.9,
    size: 2.8,
  });
  const mx = (x0 + x1) / 2;
  strokePolyline(w, [[mx, y0], [mx, y1]], 0.0018, { colour: P.mullion, alpha: 0.9, size: 1.8, spacing: 0.002 });
  for (const f of [0.33, 0.62]) {
    const y = y0 + (y1 - y0) * f;
    strokePolyline(w, [[x0, y], [x1, y]], 0.0018, { colour: P.mullion, alpha: 0.9, size: 1.8, spacing: 0.002 });
  }
  ink(w, g, P.sepiaInk, 0.6, 1.6, true);
}

function balconyRail(w: Writer, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(3, Math.round(((x1 - x0) * ASPECT) / 0.012));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    strokePolyline(w, [[x, y0], [x, y1]], 0.0016, { colour: P.balconyIron, alpha: 0.8, size: 1.6, spacing: 0.002 });
  }
  strokePolyline(w, [[x0, y0], [x1, y0]], 0.0022, { colour: P.balconyIron, alpha: 0.9, size: 1.8, spacing: 0.002 });
  strokePolyline(w, [[x0, y1], [x1, y1]], 0.0022, { colour: P.balconyIron, alpha: 0.9, size: 1.8, spacing: 0.002 });
  // A few scroll curls: small arcs between bars.
  const h = y1 - y0;
  for (let i = 0; i + 1 < n; i += 2) {
    const cx = x0 + ((x1 - x0) * (i + 1)) / n;
    const arc = ellipseArc(cx, y0 + h * 0.5, 0.004, h * 0.22, 0, Math.PI * 1.6, 10, 0, ASPECT);
    strokePolyline(w, arc, 0.0014, { colour: P.balconyIron, alpha: 0.75, size: 1.5, spacing: 0.002 });
  }
}

function rightFacade(w: Writer): void {
  beginRegion(w, 'layer:facade/right', 'facade', -7);
  // Far-right zinc roof slice at the top of the lower block.
  const zincSlice: Pt[] = [[0.585, 0.20], [0.585, 0.07], [0.615, 0.02], [0.665, 0.02], [0.665, 0.10], [0.64, 0.17]];
  fillPolygon(w, zincSlice, { colour: (_x, _y, u, v) => lerpRgb(lerpRgb(P.zincLight, P.paper, 0.4), P.zinc, 0.25 * u + 0.35 * v), coverage: 0.3, size: 2.8, depth: -11 });
  ink(w, [[0.585, 0.20], [0.64, 0.17], [0.665, 0.10]], P.inkSoft, 0.5, 1.5);
  // Wall.
  const wall: Pt[] = [[0.585, 0.20], [0.64, 0.17], [0.665, 0.10], [0.675, -0.02], [1.0, -0.02], [1.0, 0.725], [0.585, 0.555]];
  fillPolygon(w, wall, {
    colour: (x, y) => {
      const t = Math.min(Math.max((x - 0.585) / 0.415, 0), 1) * 0.55 + Math.min(Math.max((y - 0.2) / 0.5, 0), 1) * 0.45;
      return lerpRgb(P.limestoneLit, P.limestoneCool, 0.2 + 0.7 * t);
    },
    coverage: (x, y) => 0.68 + 0.25 * Math.min(Math.max((x - 0.585) / 0.415, 0), 1) * Math.min(Math.max((y - 0.1) / 0.5, 0), 1),
    size: 4.6,
    spacing: 0.0042,
    alpha: 0.92,
    tone: 0.018,
    depth: (x) => rightDepth(x),
  });
  // String course and plinth.
  const sc: Pt[] = [R_TOP[0], R_TOP[1], [1.0, R_TOP[1][1] + 0.014], [0.585, R_TOP[0][1] + 0.014]];
  fillPolygon(w, sc, { colour: P.limestoneCool, coverage: 0.9, size: 2.8, depth: (x) => rightDepth(x) });
  ink(w, [R_TOP[0], R_TOP[1]], P.inkSoft, 0.6, 1.5);
  ink(w, [sc[3] as Pt, sc[2] as Pt], P.inkSoft, 0.45, 1.4);
  const plinth: Pt[] = [[0.585, R_BASE[0][1] - 0.035], [1.0, R_BASE[1][1] - 0.035], R_BASE[1], R_BASE[0]];
  fillPolygon(w, plinth, { colour: P.plinth, coverage: 0.85, size: 2.9, depth: (x) => rightDepth(x) });
  ink(w, [R_BASE[0], R_BASE[1]], P.sepiaInk, 0.65, 1.6);
  ink(w, [plinth[0] as Pt, plinth[1] as Pt], P.inkSoft, 0.4, 1.4);
  // Far ground-floor and upper-floor slits (receding).
  const slits: [number, number, number, number, number, number][] = [
    // x0, x1, upper y0, upper y1, lower y0, lower y1
    [0.612, 0.622, 0.17, 0.33, 0.40, 0.52],
    [0.636, 0.65, 0.14, 0.31, 0.395, 0.53],
    [0.66, 0.675, 0.12, 0.30, 0.39, 0.55],
    [0.69, 0.708, 0.09, 0.275, 0.38, 0.565],
    [0.733, 0.75, 0.045, 0.25, 0.37, 0.59],
  ];
  for (const [x0, x1, uy0, uy1, ly0, ly1] of slits) {
    for (const [y0, y1] of [[uy0, uy1], [ly0, ly1]] as const) {
      fillPolygon(w, rect(x0, y0, x1, y1), { colour: (_x, _y, _u, v) => lerpRgb(P.paneLight, P.windowPane, 0.3 + 0.5 * v), coverage: 0.9, size: 2.6 });
      fillPolygon(w, rect(x1, y0 + 0.004, x1 + (x1 - x0) * 0.35, y1), { colour: lerpRgb(P.paneLight, P.shutterShade, 0.5), coverage: 0.8, size: 2.5 });
      ink(w, rect(x0, y0, x1, y1), P.inkSoft, 0.5, 1.4, true);
    }
  }
  // Upper balcony at the far-right top.
  balconyRail(w, 0.79, 0.04, 0.832, 0.10);
  // Near ground-floor windows, far to near.
  windowGlass(w, 0.784, 0.33, 0.831, 0.57, 0.2);
  shutterLeaf(w, 0.762, 0.32, 0.784, 0.60, 0.15);
  shutterLeaf(w, 0.831, 0.32, 0.853, 0.60, 0.1);
  balconyRail(w, 0.776, 0.535, 0.84, 0.61);
  windowGlass(w, 0.882, 0.30, 0.918, 0.60, 0.15);
  shutterLeaf(w, 0.853, 0.27, 0.882, 0.66, 0.1);
  shutterLeaf(w, 0.918, 0.27, 0.951, 0.66, 0.05);
  balconyRail(w, 0.866, 0.57, 0.93, 0.65);
  shutterLeaf(w, 0.957, 0.24, 0.992, 0.68, 0.0);
  windowGlass(w, 0.992, 0.27, 1.0, 0.64, 0.1);
  endRegion(w);
}

// ---------------------------------------------------------------------------
// Left façade (lit), receding to the right, with the shop awning.

const L_BASE: [Pt, Pt] = [[0.0, 0.795], [0.46, 0.565]];
const leftDepth = (x: number): number => -2.5 - 9.5 * Math.min(Math.max(x / 0.46, 0), 1);

function leftFacade(w: Writer): void {
  beginRegion(w, 'layer:facade/left', 'facade', -6);
  const wall: Pt[] = [[-0.01, -0.02], [0.395, -0.02], [0.46, 0.33], [0.46, 0.565], [-0.01, 0.80]];
  fillPolygon(w, wall, {
    colour: (x, y) => {
      // Shade under the awning and toward the far end.
      const underAwning = x > 0.16 && x < 0.45 && y > awningBottomAt(x) && y < awningBottomAt(x) + 0.14 ? smoothstep(0.14, 0.0, y - awningBottomAt(x)) : 0;
      const far = Math.min(Math.max((x - 0.2) / 0.26, 0), 1);
      return lerpRgb(P.limestoneLit, P.limestoneShade, 0.15 + 0.5 * underAwning + 0.25 * far);
    },
    coverage: (x, y) => 0.62 + 0.3 * (x > 0.16 && x < 0.45 && y > awningBottomAt(x) && y < awningBottomAt(x) + 0.14 ? smoothstep(0.14, 0.0, y - awningBottomAt(x)) : 0),
    size: 4.6,
    spacing: 0.0042,
    alpha: 0.92,
    tone: 0.018,
    depth: (x) => leftDepth(x),
  });
  // Pencil stipple shading on the upper-left wall, as in P1.
  fillPolygon(w, [[0.02, 0.0], [0.33, 0.0], [0.13, 0.16], [0.02, 0.13]], { colour: P.graphite, alpha: 0.25, coverage: 0.3, size: 2.2, spacing: 0.0035 });
  // Top edge of the block and the base.
  ink(w, [[0.395, -0.02], [0.46, 0.33]], P.inkSoft, 0.55, 1.6);
  const plinth: Pt[] = [[-0.01, L_BASE[0][1] - 0.035], [0.46, L_BASE[1][1] - 0.035], L_BASE[1], L_BASE[0]];
  fillPolygon(w, plinth, { colour: P.plinth, coverage: 0.85, size: 2.9, depth: (x) => leftDepth(x) });
  ink(w, [L_BASE[0], L_BASE[1]], P.sepiaInk, 0.65, 1.6);
  ink(w, [plinth[0] as Pt, plinth[1] as Pt], P.inkSoft, 0.4, 1.4);
  // Near window (left leaf hidden by the frame edge).
  windowGlass(w, 0.047, 0.13, 0.10, 0.60, 0.4);
  shutterLeaf(w, 0.105, 0.15, 0.138, 0.63, 0.0);
  balconyRail(w, 0.05, 0.53, 0.10, 0.60);
  // Second window with balcony.
  shutterLeaf(w, 0.178, 0.26, 0.205, 0.59, 0.05);
  windowGlass(w, 0.205, 0.26, 0.255, 0.57, 0.35);
  shutterLeaf(w, 0.258, 0.265, 0.287, 0.60, 0.1);
  balconyRail(w, 0.20, 0.52, 0.26, 0.60);
  // Receding slits toward the far end (mostly behind the woman).
  const slits: [number, number, number, number][] = [
    [0.298, 0.322, 0.30, 0.56],
    [0.352, 0.368, 0.335, 0.55],
    [0.393, 0.405, 0.36, 0.55],
    [0.424, 0.432, 0.385, 0.545],
  ];
  for (const [x0, x1, y0, y1] of slits) {
    const sw = (x1 - x0) * 0.35;
    fillPolygon(w, rect(x0, y0, x0 + sw, y1), { colour: lerpRgb(P.paneLight, P.shutterShade, 0.5), coverage: 0.8, size: 2.5 });
    fillPolygon(w, rect(x0 + sw, y0, x1, y1), { colour: (_x, _y, _u, v) => lerpRgb(P.paneLight, P.windowPane, 0.3 + 0.5 * v), coverage: 0.9, size: 2.6 });
    ink(w, rect(x0, y0, x1, y1), P.inkSoft, 0.5, 1.4, true);
    balconyRail(w, x0, y1 - (y1 - y0) * 0.22, x1, y1);
  }
  // Upper-floor slits near the far end, above the awning.
  for (const [x0, x1, y0, y1] of [[0.405, 0.412, 0.06, 0.22], [0.425, 0.431, 0.10, 0.24], [0.443, 0.448, 0.13, 0.26]] as const) {
    fillPolygon(w, rect(x0, y0, x1, y1), { colour: P.windowPane, coverage: 0.8, size: 2.4 });
    ink(w, rect(x0, y0, x1, y1), P.inkSoft, 0.45, 1.3, true);
  }
  endRegion(w);
}

// Awning fabric: top (attachment) and bottom (front hem) edges, measured.
const AWNING_TOP: Pt[] = [[0.165, 0.02], [0.218, 0.026], [0.29, 0.052], [0.364, 0.11], [0.418, 0.215], [0.435, 0.30]];
const AWNING_BOTTOM: Pt[] = [[0.165, 0.02], [0.175, 0.045], [0.218, 0.078], [0.29, 0.17], [0.364, 0.26], [0.418, 0.306], [0.435, 0.30]];
function awningBottomAt(x: number): number {
  for (let i = 1; i < AWNING_BOTTOM.length; i++) {
    const [ax, ay] = AWNING_BOTTOM[i - 1] as Pt;
    const [bx, by] = AWNING_BOTTOM[i] as Pt;
    if (x >= ax && x <= bx) return ay + ((by - ay) * (x - ax)) / Math.max(bx - ax, 1e-6);
  }
  return x < 0.165 ? 0.02 : 0.30;
}

function awning(w: Writer): void {
  beginRegion(w, 'obj:awning', 'facade', -5);
  const poly: Pt[] = [...AWNING_TOP, ...[...AWNING_BOTTOM].reverse()];
  fillPolygon(w, poly, {
    colour: (x, y) => {
      const u = Math.min(Math.max((x - 0.165) / 0.27, 0), 1);
      const top = AWNING_TOP.find((p, i) => (AWNING_TOP[i + 1] ?? p)[0] >= x) ?? AWNING_TOP[0] as Pt;
      const span = Math.max(awningBottomAt(x) - top[1], 1e-3);
      const v = Math.min(Math.max((y - top[1]) / span, 0), 1);
      return lerpRgb(P.awningRed, P.awningShade, 0.15 + 0.5 * u * u + 0.45 * v * v);
    },
    coverage: 0.96,
    size: 3.2,
    tone: 0.03,
    depth: (x) => leftDepth(x),
  });
  // Roller along the attachment line, front bar along the hem, two arms.
  strokePolyline(w, AWNING_TOP.slice(0, 4), 0.011, { colour: (_x, _y, _u, v) => lerpRgb(P.awningShade, P.awningRed, 0.6 - 0.6 * Math.abs(v - 0.3)), alpha: 1, size: 2.6, spacing: 0.0025 });
  ink(w, AWNING_TOP, P.sepiaInk, 0.6, 1.6);
  strokePolyline(w, AWNING_BOTTOM.slice(1), 0.0028, { colour: P.sepiaInk, alpha: 0.75, size: 1.8, spacing: 0.002 });
  strokePolyline(w, [[0.325, 0.095], [0.336, 0.205]], 0.0025, { colour: P.inkSoft, alpha: 0.8, size: 1.8, spacing: 0.002 });
  strokePolyline(w, [[0.417, 0.215], [0.428, 0.302]], 0.0022, { colour: P.inkSoft, alpha: 0.8, size: 1.7, spacing: 0.002 });
  endRegion(w);
}

// ---------------------------------------------------------------------------
// Lamp posts.

function lampBody(w: Writer, baseX: number, baseY: number, h: number, scale: number): void {
  // Proportions from the near lamp: base at (0.5755, 0.625), shaft to 0.30, lantern 0.21–0.30, finial 0.165.
  const s = scale;
  const yAt = (f: number) => baseY - h * f; // f = fraction of the full height
  const colour = (_x: number, _y: number, u: number) => lerpRgb(P.lampStipple, P.lampIron, 0.25 + 0.75 * smoothstep(0.1, 0.8, u));
  // Foot and base.
  fillEllipse(w, baseX, baseY, 0.02 * s, 0.006 * s, { colour, coverage: 0.95, size: 2.8 });
  fillPolygon(w, [[baseX - 0.0195 * s, baseY], [baseX + 0.0195 * s, baseY], [baseX + 0.0135 * s, yAt(0.06)], [baseX - 0.0135 * s, yAt(0.06)]], { colour, coverage: 0.95, size: 2.9 });
  fillPolygon(w, [[baseX - 0.0135 * s, yAt(0.06)], [baseX + 0.0135 * s, yAt(0.06)], [baseX + 0.0095 * s, yAt(0.16)], [baseX - 0.0095 * s, yAt(0.16)]], { colour, coverage: 0.95, size: 2.8 });
  // Shaft with two rings.
  fillPolygon(w, [[baseX - 0.0075 * s, yAt(0.16)], [baseX + 0.0075 * s, yAt(0.16)], [baseX + 0.0045 * s, yAt(0.71)], [baseX - 0.0045 * s, yAt(0.71)]], { colour, coverage: 0.97, size: 2.7 });
  for (const f of [0.14, 0.24]) fillEllipse(w, baseX, yAt(f), 0.012 * s, 0.004 * s, { colour, coverage: 0.95, size: 2.6 });
  // Lantern: body, cap, finial.
  const lantern: Pt[] = [[baseX - 0.014 * s, yAt(0.87)], [baseX + 0.014 * s, yAt(0.87)], [baseX + 0.018 * s, yAt(0.73)], [baseX - 0.018 * s, yAt(0.73)]];
  fillPolygon(w, lantern, { colour: (_x, _y, u) => lerpRgb(P.lampGlass, P.lampStipple, 0.2 + 0.4 * Math.abs(u - 0.5) * 2), coverage: 0.85, size: 2.7 });
  ink(w, lantern, P.lampIron, 0.8, 1.7, true, 0.002 * s + 0.0008);
  strokePolyline(w, [[baseX, yAt(0.87)], [baseX, yAt(0.73)]], 0.0016, { colour: P.lampIron, alpha: 0.7, size: 1.5, spacing: 0.002 });
  const cap: Pt[] = [[baseX - 0.021 * s, yAt(0.87)], [baseX + 0.021 * s, yAt(0.87)], [baseX + 0.006 * s, yAt(0.93)], [baseX - 0.006 * s, yAt(0.93)]];
  fillPolygon(w, cap, { colour, coverage: 0.97, size: 2.7 });
  strokePolyline(w, [[baseX, yAt(0.93)], [baseX, yAt(1.0)]], 0.0028 * s + 0.0008, { colour: P.lampIron, alpha: 0.95, size: 2.0, spacing: 0.002 });
  fillEllipse(w, baseX, yAt(1.0), 0.004 * s, 0.006 * s, { colour, coverage: 1, size: 2.4 });
  // Ink along the lit edge of the shaft.
  ink(w, [[baseX - 0.0075 * s, yAt(0.16)], [baseX - 0.0045 * s, yAt(0.71)]], P.lampIron, 0.6, 1.5);
}

function nearLamp(w: Writer): void {
  beginRegion(w, 'obj:lamp-post', 'pavement', -3.2);
  // Ground shadow first.
  fillEllipse(w, 0.60, 0.632, 0.03, 0.006, { colour: P.shadowMauve, alpha: 0.35, coverage: 0.5, size: 2.6 });
  lampBody(w, 0.5755, 0.625, 0.46, 1);
  endRegion(w);
}

function farLamp(w: Writer): void {
  beginRegion(w, 'obj:lamp-post/far', 'facade', -8);
  lampBody(w, 0.5445, 0.452, 0.157, 0.4);
  endRegion(w);
}

// ---------------------------------------------------------------------------
// Walkers: a figure authored in normalised space (origin at the feet, ny negative upward,
// nx isotropic in heights), emitted at a given foot position and height, and rigged for life.

type WalkerKind = 'woman' | 'man' | 'far';

function walker(w: Writer, id: string, feet: Pt, height: number, facing: WalkerFacing, kind: WalkerKind): WalkerRig {
  const start = w.store.count;
  beginRegion(w, id, 'pavement', -(feet[1] < 0.63 ? 6 : 2.2), true);
  const [fx, fy] = feet;
  const X = (nx: number) => fx + (nx * height) / ASPECT;
  const Y = (ny: number) => fy + ny * height;
  const poly = (pts: readonly Pt[]): Pt[] => pts.map(([nx, ny]) => [X(nx), Y(ny)] as Pt);
  const lit = kind === 'woman' ? P.camelLit : kind === 'man' ? P.walkerTanLit : P.walkerFar;
  const shade = kind === 'woman' ? P.camelShade : kind === 'man' ? P.walkerTan : P.walkerFarShade;
  const alpha = kind === 'far' ? 0.82 : 1;
  const sizeF = kind === 'woman' ? 3.0 : 2.5;
  const coatShade = (_x: number, _y: number, u: number) => lerpRgb(lit, shade, 0.1 + 0.9 * smoothstep(0.15, 0.8, u));
  const hemNy = kind === 'woman' ? -0.23 : kind === 'man' ? -0.42 : -0.3;

  // Shadow on the pavement (falls to the left).
  w.tag = 4;
  fillEllipse(w, X(-0.22), Y(0.025), (0.21 * height) / ASPECT, 0.035 * height, { colour: P.shadowMauve, alpha: 0.32 * alpha, coverage: 0.5, size: 2.6 });
  // Legs.
  w.tag = 1;
  fillPolygon(w, poly([[-0.075, hemNy], [-0.015, hemNy], [-0.02, 0.0], [-0.07, 0.0]]), { colour: kind === 'woman' ? P.stocking : P.trousers, alpha, coverage: 0.95, size: sizeF });
  w.tag = 2;
  fillPolygon(w, poly([[0.015, hemNy], [0.075, hemNy], [0.07, 0.0], [0.02, 0.0]]), { colour: kind === 'woman' ? P.stocking : P.trousers, alpha, coverage: 0.95, size: sizeF });
  if (kind === 'woman') {
    w.tag = 1;
    fillPolygon(w, poly([[-0.08, -0.07], [-0.01, -0.07], [-0.015, 0.0], [-0.085, 0.0]]), { colour: P.boots, alpha, coverage: 0.95, size: sizeF });
    w.tag = 2;
    fillPolygon(w, poly([[0.01, -0.07], [0.08, -0.07], [0.085, 0.0], [0.015, 0.0]]), { colour: P.boots, alpha, coverage: 0.95, size: sizeF });
  }
  // Body: coat or jacket.
  w.tag = 0;
  const shoulder = kind === 'woman' ? 0.185 : 0.19;
  const waist = kind === 'woman' ? 0.125 : 0.16;
  const hem = kind === 'woman' ? 0.165 : 0.17;
  const body: Pt[] = [[-shoulder, -0.86], [shoulder, -0.86], [waist + 0.01, -0.62], [hem, hemNy], [-hem, hemNy], [-waist - 0.01, -0.62]];
  fillPolygon(w, poly(body), { colour: coatShade, alpha, coverage: 0.98, size: sizeF + 0.2, tone: 0.04 });
  ink(w, poly(body), P.sepiaInk, 0.35 * alpha, 1.4, true);
  if (kind === 'woman') {
    // Belt and, when facing us, lapels and a face; when turned away, the belt's knot at the back.
    fillPolygon(w, poly([[-waist - 0.01, -0.635], [waist + 0.01, -0.635], [waist + 0.012, -0.595], [-waist - 0.012, -0.595]]), { colour: P.camelShade, alpha, coverage: 0.95, size: 2.6 });
    if (facing === 'toward') {
      // Lapels: a pale V down to the belt, edged in ink.
      fillPolygon(w, poly([[-0.1, -0.86], [0.0, -0.86], [-0.012, -0.66]]), { colour: lerpRgb(P.camelLit, P.cupWhite, 0.35), alpha, coverage: 0.97, size: 2.8 });
      fillPolygon(w, poly([[0.0, -0.86], [0.1, -0.86], [0.012, -0.66]]), { colour: lerpRgb(P.camelLit, P.cupWhite, 0.15), alpha, coverage: 0.97, size: 2.8 });
      strokePolyline(w, poly([[-0.08, -0.85], [-0.012, -0.67], [0.08, -0.85]]), 0.0024, { colour: P.sepiaInk, alpha: 0.6, size: 1.6, spacing: 0.002 });
    } else {
      fillPolygon(w, poly([[-0.03, -0.615], [0.03, -0.615], [0.02, -0.52], [-0.02, -0.52]]), { colour: P.camelShade, alpha, coverage: 0.95, size: 2.5 });
    }
  }
  if (kind === 'man') {
    // Folder under the right arm.
    fillPolygon(w, poly([[0.13, -0.52], [0.21, -0.52], [0.21, -0.36], [0.13, -0.36]]), { colour: P.folderWhite, alpha, coverage: 0.95, size: 2.4 });
    ink(w, poly([[0.13, -0.52], [0.21, -0.52], [0.21, -0.36], [0.13, -0.36]]), P.inkSoft, 0.5, 1.3, true);
  }
  // Head.
  w.tag = 3;
  const headR = kind === 'woman' ? 0.065 : 0.06;
  fillEllipse(w, X(0), Y(-0.955), (headR * height) / ASPECT, headR * 1.15 * height, { colour: (_x, _y, u) => lerpRgb(kind === 'woman' ? lerpRgb(P.hair, P.camelLit, 0.25) : lerpRgb(shade, P.hair, 0.4), P.hair, 0.3 + 0.6 * u), alpha, coverage: 0.97, size: sizeF });
  if (kind === 'woman' && facing === 'toward') {
    // Face: skin in the lower front of the head, hair framing it.
    fillEllipse(w, X(0.004), Y(-0.925), (0.042 * height) / ASPECT, 0.046 * height, { colour: P.skin, alpha, coverage: 0.98, size: 2.8, tone: 0.02 });
  }
  w.tag = 0;
  const region = endRegion(w);
  const end = w.store.count;
  const n = end - start;
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
    startY: fy,
    endY: kind === 'woman' ? (facing === 'away' ? 0.61 : 0.80) : fy - 0.045,
    travelS: kind === 'woman' ? (facing === 'away' ? 34 : 14) : 36,
    stepHz: kind === 'woman' ? 1.35 : 1.5,
    phase0S: kind === 'woman' ? 1.6 : kind === 'man' ? 9 : 21,
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
  return rig;
}

// ---------------------------------------------------------------------------
// Rattan chair: a tilted oval hoop with a diamond lattice, cut by the left edge.

const CHAIR = { cx: 0.11, cy: 0.75, rx: 0.09, ry: 0.29, rot: -0.42 };

function chair(w: Writer): void {
  beginRegion(w, 'obj:neighbour-chair', 'near', -0.12);
  const { cx, cy, rx, ry, rot } = CHAIR;
  const hoopW = 0.014;
  // Lattice inside the inner oval: two families of straight strips in the ellipse's local frame.
  const A = ry - hoopW * 0.9; // long semi-axis (isotropic)
  const B = rx * ASPECT - hoopW * 0.9; // short semi-axis (isotropic)
  const toFrame = (lx: number, ly: number): Pt => {
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    return [cx + (lx * cosR - ly * sinR) / ASPECT, cy + lx * sinR + ly * cosR];
  };
  const clipLine = (phi: number, c: number): [Pt, Pt] | null => {
    // Line: lx cosφ + ly sinφ = c, inside (lx/B)^2 + (ly/A)^2 <= 1. Parametrise along the line direction.
    const dx = -Math.sin(phi), dy = Math.cos(phi);
    const px = c * Math.cos(phi), py = c * Math.sin(phi);
    const qa = (dx * dx) / (B * B) + (dy * dy) / (A * A);
    const qb = 2 * ((px * dx) / (B * B) + (py * dy) / (A * A));
    const qc = (px * px) / (B * B) + (py * py) / (A * A) - 1;
    const disc = qb * qb - 4 * qa * qc;
    if (disc <= 0) return null;
    const r = Math.sqrt(disc);
    const t0 = (-qb - r) / (2 * qa), t1 = (-qb + r) / (2 * qa);
    return [toFrame(px + dx * t0, py + dy * t0), toFrame(px + dx * t1, py + dy * t1)];
  };
  for (const phi of [0.72, -0.72]) {
    for (let c = -0.42; c <= 0.42; c += 0.052) {
      const seg = clipLine(phi, c);
      if (!seg) continue;
      strokePolyline(w, seg, 0.0052, { colour: (_x, _y, _u, v) => lerpRgb(P.rattanLit, P.rattan, 0.3 + 0.6 * Math.abs(v - 0.35)), alpha: 1, size: 2.9, spacing: 0.003, tone: 0.05 });
      // Shadow edge below each strip.
      const off = clipLine(phi, c + 0.0045);
      if (off) strokePolyline(w, off, 0.0014, { colour: P.rattanShade, alpha: 0.6, size: 1.6, spacing: 0.003 });
    }
  }
  // The hoop: visible arc from the top-left (frame edge) round the right side to where the table hides it.
  const arcPts = ellipseArc(cx, cy, rx, ry, -Math.PI * 1.08, Math.PI * 0.43, 120, rot, ASPECT).filter(([x]) => x >= -0.02);
  strokePolyline(w, arcPts, hoopW, { colour: (_x, _y, _u, v) => lerpRgb(P.rattanLit, P.rattan, 0.2 + 0.8 * v), alpha: 1, size: 3.0, spacing: 0.0028, tone: 0.045 });
  const outer = ellipseArc(cx, cy, rx + hoopW / 2 / ASPECT, ry + hoopW / 2, -Math.PI * 1.08, Math.PI * 0.43, 120, rot, ASPECT).filter(([x]) => x >= -0.02);
  const inner = ellipseArc(cx, cy, rx - hoopW / 2 / ASPECT, ry - hoopW / 2, -Math.PI * 1.08, Math.PI * 0.43, 120, rot, ASPECT).filter(([x]) => x >= -0.02);
  ink(w, outer, P.rattanShade, 0.8, 1.7);
  ink(w, inner, P.rattanShade, 0.6, 1.5);
  endRegion(w);
}

// ---------------------------------------------------------------------------
// Marble table: an ellipse whose near edge lies below the frame.

const TABLE = { cx: 0.5, cy: 1.04, rx: 0.53, ry: 0.275 };

function table(w: Writer): void {
  beginRegion(w, 'obj:table', 'near', -0.05);
  const { cx, cy, rx, ry } = TABLE;
  fillEllipse(w, cx, cy, rx, ry, {
    colour: (_x, y) => lerpRgb(P.marble, P.marbleShade, smoothstep(0.95, 1.05, y) * 0.4),
    coverage: 1,
    size: 6.4,
    spacing: 0.0044,
    tone: 0.012,
    depth: (_x, y) => 0.2 - (1.0 - y) * 1.6,
  });
  // Veins: deterministic gentle random walks inside the ellipse.
  for (let v = 0; v < 9; v++) {
    const t0 = Math.PI * 1.05 + w.rng() * Math.PI * 0.9;
    const r0 = 0.3 + w.rng() * 0.6;
    let [x, y] = ellipsePoint(cx, cy, rx * r0, ry * r0, t0, 0, ASPECT);
    let ang = w.rng() * Math.PI * 2;
    const pts: Pt[] = [[x, y]];
    for (let i = 0; i < 5; i++) {
      ang += (w.rng() - 0.5) * 1.4;
      x += (Math.cos(ang) * 0.045) / ASPECT;
      y += Math.sin(ang) * 0.03;
      const d = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
      if (d > 0.92 || y > 1.0) break;
      pts.push([x, y]);
    }
    if (pts.length > 1) strokePolyline(w, pts, 0.0024, { colour: P.marbleVein, alpha: 0.5, size: 1.8, spacing: 0.0022, tone: 0.03 });
  }
  // Edge: a darker band along the rim, then an ink line.
  const rim = ellipseArc(cx, cy, rx, ry, Math.PI * 1.02, Math.PI * 1.98, 140, 0, ASPECT).filter(([, y]) => y <= 1.01);
  strokePolyline(w, rim, 0.012, { colour: (_x, _y, _u, v) => lerpRgb(P.marble, P.marbleShade, 0.2 + 0.5 * v), alpha: 1, size: 3.2, spacing: 0.003, tone: 0.012 });
  ink(w, rim, P.tableRim, 0.7, 1.8, false, 0.002);
  // Soft shadows of the saucer and ashtray on the marble.
  fillEllipse(w, 0.72, 0.945, 0.10, 0.03, { colour: P.shadowMauve, alpha: 0.22, coverage: 0.45, size: 2.6 });
  fillEllipse(w, 0.345, 0.955, 0.08, 0.025, { colour: P.shadowMauve, alpha: 0.22, coverage: 0.45, size: 2.6 });
  endRegion(w);
}

// ---------------------------------------------------------------------------
// Glass ashtray with an unbranded cigarette; a smoke emitter rigged for life.

function ashtray(w: Writer): EmitterRig[] {
  beginRegion(w, 'obj:ashtray', 'near', -0.08);
  const cx = 0.335, rimY = 0.86, baseY = 0.928, rx = 0.066, rimRy = 0.022, baseRx = 0.062, baseRy = 0.02;
  // Translucent wall: the front half between rim and base.
  const front = [...ellipseArc(cx, rimY, rx, rimRy, 0, Math.PI, 40, 0, ASPECT), ...ellipseArc(cx, baseY, baseRx, baseRy, Math.PI, 0, 40, 0, ASPECT)];
  fillPolygon(w, front, { colour: (_x, _y, u) => lerpRgb(P.glassLight, P.glassShade, 0.35 + 0.5 * smoothstep(0.2, 0.9, u)), alpha: 0.5, coverage: 0.55, size: 2.8 });
  // Interior: ash and the glass floor.
  fillEllipse(w, cx, rimY + 0.012, rx * 0.72, rimRy * 0.7, { colour: P.ash, alpha: 0.7, coverage: 0.7, size: 2.8 });
  fillEllipse(w, cx, rimY, rx * 0.95, rimRy * 0.9, { colour: P.glass, alpha: 0.3, coverage: 0.4, size: 2.6 });
  // Rim highlight and base line.
  strokePolyline(w, ellipseArc(cx, rimY, rx, rimRy, 0, Math.PI * 2, 90, 0, ASPECT), 0.004, { colour: P.glassLight, alpha: 0.95, size: 2.6, spacing: 0.0022 });
  ink(w, ellipseArc(cx, rimY, rx, rimRy, 0, Math.PI * 2, 90, 0, ASPECT), P.glassShade, 0.7, 1.6, false, 0.0016);
  ink(w, ellipseArc(cx, baseY, baseRx, baseRy, 0, Math.PI, 50, 0, ASPECT), P.glassShade, 0.6, 1.6, false, 0.0016);
  // Vertical highlights on the wall.
  strokePolyline(w, [[cx - rx * 0.78, rimY + 0.012], [cx - baseRx * 0.78, baseY - 0.004]], 0.0045, { colour: P.glassLight, alpha: 0.9, size: 2.6, spacing: 0.0022 });
  strokePolyline(w, [[cx + rx * 0.7, rimY + 0.014], [cx + baseRx * 0.7, baseY - 0.004]], 0.003, { colour: P.glassShade, alpha: 0.5, size: 2.2, spacing: 0.0022 });
  endRegion(w);

  beginRegion(w, 'obj:cigarette', 'near', -0.08);
  const tip: Pt = [0.318, 0.906];
  const end: Pt = [0.405, 0.846];
  const at = (f: number): Pt => [tip[0] + (end[0] - tip[0]) * f, tip[1] + (end[1] - tip[1]) * f];
  strokePolyline(w, [at(0.08), at(0.72)], 0.0075, { colour: (_x, _y, _u, v) => lerpRgb(P.cigPaper, P.cupShade, 0.5 * smoothstep(0.55, 1, v)), alpha: 1, size: 2.6, spacing: 0.0022, tone: 0.02 });
  strokePolyline(w, [at(0.72), at(1.0)], 0.0075, { colour: (_x, _y, _u, v) => lerpRgb(P.cigFilter, P.camelShade, 0.4 * smoothstep(0.55, 1, v)), alpha: 1, size: 2.6, spacing: 0.0022, tone: 0.03 });
  strokePolyline(w, [at(0.0), at(0.08)], 0.0065, { colour: P.ash, alpha: 1, size: 2.4, spacing: 0.0022 });
  fillEllipse(w, tip[0] + 0.002, tip[1], 0.0035, 0.0028, { colour: P.ember, alpha: 1, coverage: 1, size: 2.4 });
  ink(w, [at(0.05), at(1.0)].map(([x, y]) => [x, y + 0.0035] as Pt), P.inkSoft, 0.55, 1.4);
  endRegion(w);

  // Smoke slots (invisible until life moves them).
  const smokeStart = w.store.count;
  beginRegion(w, 'fx:smoke', 'near', -0.08, true);
  emitterSlots(w, [0.317, 0.902], 240, P.smoke);
  endRegion(w);
  return [{ id: 'fx:smoke', start: smokeStart, end: w.store.count, origin: [0.317, 0.902] }];
}

function emitterSlots(w: Writer, origin: Pt, n: number, colour: Rgb): void {
  const count = Math.round(n * Math.min(Math.max(w.density, 0.5), 1.25));
  for (let i = 0; i < count; i++) {
    const k = w.store.count;
    if (k >= w.store.capacity) {
      w.overflow++;
      continue;
    }
    w.store.count++;
    w.store.x[k] = origin[0];
    w.store.y[k] = origin[1];
    w.store.z[k] = w.current?.depth ?? 0;
    w.store.r[k] = colour[0];
    w.store.g[k] = colour[1];
    w.store.b[k] = colour[2];
    w.store.a[k] = 0;
    w.store.size[k] = 2;
    w.store.region[k] = w.current?.index ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Espresso cup on its saucer; a steam emitter rigged for life.

function cupAndSaucer(w: Writer): EmitterRig[] {
  beginRegion(w, 'obj:saucer', 'near', 0);
  const scx = 0.70, scy = 0.89, srx = 0.094, sry = 0.045;
  fillEllipse(w, scx, scy, srx, sry, {
    colour: (_x, _y, u, v) => lerpRgb(P.saucer, P.saucerShade, 0.9 * Math.pow(Math.max(0, 1 - Math.hypot((u - 0.5) * 2, (v - 0.5) * 2)), 1.4)),
    coverage: 0.96,
    size: 3.2,
    tone: 0.015,
  });
  ink(w, ellipseArc(scx, scy, srx, sry, 0, Math.PI * 2, 100, 0, ASPECT), P.cupDeepShade, 0.7, 1.7, false, 0.0018);
  ink(w, ellipseArc(scx, scy - 0.004, srx * 0.62, sry * 0.6, 0, Math.PI * 2, 70, 0, ASPECT), P.cupDeepShade, 0.4, 1.4);
  endRegion(w);

  beginRegion(w, 'obj:cup', 'near', 0);
  const cx = 0.70, rimY = 0.768, rimRx = 0.052, rimRy = 0.014;
  // Body.
  // Outline runs left rim → front rim → right rim, then right base → front base → left base: a simple loop.
  const body: Pt[] = [...ellipseArc(cx, rimY, rimRx, rimRy, Math.PI, 0, 30, 0, ASPECT), ...ellipseArc(cx, 0.853, 0.038, 0.011, 0, Math.PI, 30, 0, ASPECT)];
  fillPolygon(w, body, {
    colour: (_x, _y, u, v) => lerpRgb(lerpRgb(P.cupWhite, P.cupShade, Math.pow(u, 1.3)), P.cupDeepShade, Math.max(smoothstep(0.75, 1, v) * 0.6, smoothstep(0.78, 1, u) * 0.7)),
    coverage: 0.98,
    size: 3.2,
    tone: 0.015,
  });
  // Inside wall visible above the coffee, then the coffee surface.
  fillEllipse(w, cx, rimY, rimRx * 0.94, rimRy * 0.9, { colour: (_x, _y, _u, v) => lerpRgb(P.cupDeepShade, P.cupShade, v * 0.6), coverage: 0.97, size: 2.8, tone: 0.015 });
  fillEllipse(w, cx, rimY + 0.004, rimRx * 0.84, rimRy * 0.72, { colour: (_x, _y, _u, v) => lerpRgb(lerpRgb(P.coffeeDark, P.coffeeLit, smoothstep(0.0, 0.35, v)), P.coffee, smoothstep(0.55, 1.0, v) * 0.6), coverage: 0.98, size: 2.9, tone: 0.025 });
  // Handle.
  const handle: Pt[] = [[0.749, 0.783], [0.771, 0.778], [0.787, 0.794], [0.786, 0.816], [0.77, 0.831], [0.752, 0.829]];
  strokePolyline(w, handle, 0.011, { colour: (_x, _y, u) => lerpRgb(P.cupWhite, P.cupShade, 0.3 + 0.6 * u), alpha: 1, size: 2.8, spacing: 0.0026, tone: 0.02 });
  ink(w, handle, P.cupDeepShade, 0.55, 1.5);
  // Rim and body ink.
  ink(w, ellipseArc(cx, rimY, rimRx, rimRy, 0, Math.PI * 2, 80, 0, ASPECT), P.cupDeepShade, 0.85, 1.8);
  ink(w, [[cx - rimRx, rimY], [cx - 0.038, 0.853]], P.cupDeepShade, 0.5, 1.5);
  ink(w, [[cx + rimRx, rimY], [cx + 0.038, 0.853]], P.cupDeepShade, 0.6, 1.5);
  endRegion(w);

  const steamStart = w.store.count;
  beginRegion(w, 'fx:steam', 'near', 0, true);
  emitterSlots(w, [0.70, 0.762], 170, P.steam);
  endRegion(w);
  return [{ id: 'fx:steam', start: steamStart, end: w.store.count, origin: [0.70, 0.762] }];
}
