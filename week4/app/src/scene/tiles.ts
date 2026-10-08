// Tiles for the seed-33 look: hard-edged rectangles (flat Paris swatches, ordered-dither cells, dot
// grids, scanline rasters, a few transparent) floating over the façades, the chair, the table's far
// edge and the cup/saucer, some with a 1-px hairline dropping from their bottom edge. Authoring is
// deterministic from the seed; tile life (slow pattern swaps, at most two per second in the whole
// frame during the build and one per second after it, nearest regions calming first after the build)
// is deterministic from the seed and the life clock. Life mutates Tile state in place; identity (id,
// region, index) never changes. Round 2 (IMPLEMENTATION_BRIEF §8.6): 16–18 tiles, base interval
// 12–30 s per tile. Round 3 (§9 D, G, B): swap nudges are measured from the authored home position
// (never more than 1 % of the frame from it, however many swaps), a zero-length build gives every tile a
// birth of −BIRTH_RAMP_MS so a paused frame at t = 0 is already complete, and the tile state carries a
// `hold` flag the scene's `setReducedMotion` flips so a reduced-motion toggle stops or resumes swapping
// without rebuilding or resetting anything.
import { PALETTE as P } from './palette.ts';
import { hash01, mulberry32 } from './rng.ts';
import { hexToRgb } from './store.ts';
import { BIRTH_RAMP_MS } from './types.ts';
import type { RegionSpec, Rgb, SceneFrame, Tile, TilePattern } from './types.ts';

/** Café-crème light tone (warm, low saturation) used for dither/dotgrid/scanline cells and hairlines. */
export const CAFE_CREME: Rgb = hexToRgb('#f0dbb8');

export const TILE_COUNT_MIN = 16;
export const TILE_COUNT_MAX = 18;
/** Flat swatch tones: terracotta, cream, honey, sage, zinc, saucer blush (all Paris tokens). */
export const FLAT_TONES: readonly Rgb[] = [P.awningRed, P.paper, P.rattanLit, P.shutterGreen, P.zinc, P.saucer];
/** Light tones for the raster patterns on the dark ground. */
export const LIGHT_TONES: readonly Rgb[] = [P.paper, CAFE_CREME];
export const PATTERNS: readonly TilePattern[] = ['flat', 'dither', 'dotgrid', 'scanline', 'transparent'];
export const PATTERN_SHARE: Readonly<Record<TilePattern, number>> = { flat: 0.35, dither: 0.3, dotgrid: 0.15, scanline: 0.1, transparent: 0.1 };

export const TILE_MIN_W = 0.03;
export const TILE_MAX_W = 0.09;
export const TILE_MIN_ASPECT = 0.6;
export const TILE_MAX_ASPECT = 1.6;
/** Tiles are born inside the first fifth of the build. */
export const TILE_BIRTH_FRACTION = 0.2;

export interface TileZone {
  key: string;
  /** Region the zone's tiles float over (its depth order drives settling). */
  region: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Relative share of the tile count. */
  share: number;
}

/** Placement zones measured from the seed-33 still (frame units). */
export const TILE_ZONES: readonly TileZone[] = [
  { key: 'facade-left', region: 'layer:facade/left', x0: 0.03, y0: 0.03, x1: 0.25, y1: 0.44, share: 5 },
  { key: 'facade-right', region: 'layer:facade/right', x0: 0.7, y0: 0.06, x1: 0.98, y1: 0.46, share: 6 },
  { key: 'chair', region: 'obj:neighbour-chair', x0: 0.13, y0: 0.52, x1: 0.27, y1: 0.78, share: 2 },
  { key: 'table', region: 'obj:table', x0: 0.21, y0: 0.72, x1: 0.62, y1: 0.93, share: 5 },
  { key: 'cup', region: 'obj:cup', x0: 0.63, y0: 0.76, x1: 0.93, y1: 0.95, share: 2 },
];

/** Largest-remainder split of `n` into integer quotas proportional to `weights`. */
export function quotas(n: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (n * w) / total);
  const out = exact.map((e) => Math.floor(e));
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left--;
  }
  return out;
}

/** Authored home position of every tile this module authored; swap nudges are measured from it (§9 D). */
const TILE_HOME = new WeakMap<Tile, { x: number; y: number }>();
/** The authored home of a tile, or its current position for a tile authored elsewhere (tests, fixtures). */
export const tileHomeOf = (tile: Tile): { x: number; y: number } => TILE_HOME.get(tile) ?? { x: tile.x, y: tile.y };

const overlap = (a: Tile, b: { x: number; y: number; w: number; h: number }): number => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.max(1e-9, Math.min(a.w * a.h, b.w * b.h));
};

/**
 * Authors 16–18 tiles deterministically from the seed. Patterns follow PATTERN_SHARE exactly (largest
 * remainder), zones follow TILE_ZONES shares, and each tile's `region` is the index of the region it
 * floats over (0 when the frame lacks that region).
 */
export function authorTiles(seed: number, regions: readonly RegionSpec[], buildMs: number, aspect: number): Tile[] {
  const rng = mulberry32((Math.trunc(seed) ^ 0x7a1e5) >>> 0);
  const n = TILE_COUNT_MIN + Math.floor(rng() * (TILE_COUNT_MAX - TILE_COUNT_MIN + 1)); // 16..18
  // Pattern list with the exact quota, shuffled (Fisher–Yates) so zones mix patterns.
  const patternQuota = quotas(n, PATTERNS.map((p) => PATTERN_SHARE[p]));
  const patterns: TilePattern[] = [];
  PATTERNS.forEach((p, i) => {
    for (let k = 0; k < (patternQuota[i] ?? 0); k++) patterns.push(p);
  });
  for (let i = patterns.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = patterns[i] as TilePattern;
    patterns[i] = patterns[j] as TilePattern;
    patterns[j] = t;
  }
  const zoneQuota = quotas(n, TILE_ZONES.map((z) => z.share));
  const tiles: Tile[] = [];
  const build = Math.max(0, buildMs);
  let p = 0;
  TILE_ZONES.forEach((zone, zi) => {
    const region = Math.max(0, regions.findIndex((r) => r.id === zone.region));
    const placed: Tile[] = [];
    for (let j = 0; j < (zoneQuota[zi] ?? 0); j++) {
      const pattern = patterns[p++] ?? 'flat';
      let best: { x: number; y: number; w: number; h: number } | null = null;
      let bestOverlap = Infinity;
      for (let tries = 0; tries < 8; tries++) {
        const w = Math.min(TILE_MIN_W + rng() * (TILE_MAX_W - TILE_MIN_W), zone.x1 - zone.x0);
        const ar = TILE_MIN_ASPECT + rng() * (TILE_MAX_ASPECT - TILE_MIN_ASPECT);
        const h = Math.min((w * aspect) / ar, zone.y1 - zone.y0);
        const cand = { x: zone.x0 + rng() * (zone.x1 - zone.x0 - w), y: zone.y0 + rng() * (zone.y1 - zone.y0 - h), w, h };
        const worst = placed.reduce((m, t) => Math.max(m, overlap(t, cand)), 0);
        if (worst < bestOverlap) {
          bestOverlap = worst;
          best = cand;
        }
        if (worst < 0.2) break;
      }
      const rect = best ?? { x: zone.x0, y: zone.y0, w: TILE_MIN_W, h: TILE_MIN_W * aspect };
      const colour = pattern === 'flat' ? (FLAT_TONES[Math.floor(rng() * FLAT_TONES.length)] as Rgb) : (LIGHT_TONES[Math.floor(rng() * LIGHT_TONES.length)] as Rgb);
      const withHairline = hash01(tiles.length, 0x4a11) < 0.5;
      const alpha = 0.75 + rng() * 0.2;
      const cellPx = 4 + Math.floor(rng() * 5);
      const hairline = withHairline ? 0.02 + rng() * 0.16 : 0;
      // The birth draw is taken whatever the build length, so the layout is the same for every buildMs; a
      // zero-length build is born one ramp early and is therefore complete at t = 0 (§9 G).
      const birthDraw = rng();
      const tile: Tile = {
        id: `tile:${zone.key}/${String(j).padStart(2, '0')}`,
        region,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        pattern,
        colour,
        alpha,
        cellPx,
        hairline,
        birthMs: build <= 0 ? -BIRTH_RAMP_MS : build * (0.02 + (TILE_BIRTH_FRACTION - 0.02) * birthDraw),
      };
      TILE_HOME.set(tile, { x: rect.x, y: rect.y });
      placed.push(tile);
      tiles.push(tile);
    }
  });
  return tiles;
}

// ---------------------------------------------------------------------------
// Tile life.

/** Global cap after the build: never more than one swap in any one second across the whole frame … */
export const MAX_SWAPS_PER_SECOND = 1;
/** … and never more than two while the scene is still constructing. */
export const MAX_SWAPS_PER_SECOND_BUILD = 2;
/** The global cap in force at life time t. */
export const swapCapAt = (buildMs: number, timeMs: number): number => (timeMs < buildMs ? MAX_SWAPS_PER_SECOND_BUILD : MAX_SWAPS_PER_SECOND);
export const SWAP_INTERVAL_MIN_MS = 12_000;
export const SWAP_INTERVAL_MAX_MS = 30_000;
/** Intervals are halved while the scene is still constructing. */
export const BUILD_INTERVAL_SCALE = 0.5;
/** After the build, settle rises 0 → 1 over this long for the nearest region … */
export const SETTLE_NEAR_MS = 10_000;
/** … and over this long for the farthest. */
export const SETTLE_FAR_MS = 30_000;
/** Settled tiles swap (1 + SETTLE_GAIN · settle) times less often. */
export const SETTLE_GAIN = 3;
/** Under reduced motion no tile swaps after this life time. */
export const REDUCED_SWAP_CUTOFF_MS = 1000;
/** Largest position offset from a tile's authored home, in frame units (1 % of the frame), however many swaps (§9 D). */
export const SWAP_NUDGE = 0.01;

export interface TileState {
  seed: number;
  buildMs: number;
  /** Life-clock time (ms) at or after which each tile may next swap. */
  next: Float64Array;
  /** Swap counter per tile; drives its deterministic hash stream. */
  swaps: Uint32Array;
  /** The two most recent swap times in the whole frame, older first (the global cap). */
  recent: [number, number];
  /** Per-region nearness 0 (farthest) .. 1 (nearest) from region order (regions are authored far → near). */
  nearness: Float32Array;
  /** Authored home position per tile; every nudge is measured from it. */
  homeX: Float64Array;
  homeY: Float64Array;
  /**
   * Hold: no swaps while true (the reduced-motion rule, applied from the scene's `setReducedMotion` so a toggle
   * needs no rebuild). Clearing it resumes swapping where the schedule stands; nothing is reset.
   */
  hold: boolean;
  /** Total swaps so far (diagnostics and tests). */
  total: number;
}

/** The tile state life created for a frame (the most recent one); `setReducedMotion` reaches it through this. */
const TILE_STATES = new WeakMap<SceneFrame, TileState>();
export const tileStateOf = (frame: SceneFrame): TileState | undefined => TILE_STATES.get(frame);

/** Stops (hold = true) or resumes (hold = false) swapping without touching schedules, counters or positions. */
export function setTilesHold(state: TileState, hold: boolean): void {
  state.hold = hold;
}

const rnd = (state: TileState, i: number, k: number, salt: number): number => hash01((i * 7919 + k * 104729 + salt * 31) | 0, (state.seed ^ 0x5bd1) | 0);

/** Interval multiplier at life time t for a tile over a region of the given nearness: 0.5 during the build, 1 → 4 as it settles after it. */
export function intervalScale(buildMs: number, nearness: number, timeMs: number): number {
  if (timeMs < buildMs) return BUILD_INTERVAL_SCALE;
  const settleMs = SETTLE_NEAR_MS + (SETTLE_FAR_MS - SETTLE_NEAR_MS) * (1 - Math.min(Math.max(nearness, 0), 1));
  const settle = Math.min(Math.max((timeMs - buildMs) / settleMs, 0), 1);
  return 1 + SETTLE_GAIN * settle;
}

export function swapIntervalMs(state: TileState, frame: SceneFrame, i: number, timeMs: number): number {
  const base = SWAP_INTERVAL_MIN_MS + (SWAP_INTERVAL_MAX_MS - SWAP_INTERVAL_MIN_MS) * rnd(state, i, state.swaps[i] ?? 0, 1);
  const region = frame.tiles[i]?.region ?? 0;
  return base * intervalScale(state.buildMs, state.nearness[region] ?? 1, timeMs);
}

export function createTileState(frame: SceneFrame, seed: number): TileState {
  const n = frame.tiles.length;
  const nearness = new Float32Array(Math.max(1, frame.regions.length));
  const last = Math.max(1, frame.regions.length - 1);
  for (let r = 0; r < frame.regions.length; r++) nearness[r] = frame.regions.length === 1 ? 1 : r / last;
  const state: TileState = {
    seed: Math.trunc(seed) | 0,
    buildMs: Math.max(0, frame.build.durationMs),
    next: new Float64Array(n),
    swaps: new Uint32Array(n),
    recent: [-Infinity, -Infinity],
    nearness,
    homeX: new Float64Array(n),
    homeY: new Float64Array(n),
    hold: false,
    total: 0,
  };
  for (let i = 0; i < n; i++) {
    const tile = frame.tiles[i];
    const home = tile ? tileHomeOf(tile) : { x: 0, y: 0 };
    state.homeX[i] = home.x;
    state.homeY[i] = home.y;
    state.next[i] = (tile?.birthMs ?? 0) + swapIntervalMs(state, frame, i, 0);
  }
  TILE_STATES.set(frame, state);
  return state;
}

function swapTile(state: TileState, tile: Tile, i: number): void {
  const k = state.swaps[i] ?? 0;
  // New pattern: weighted by PATTERN_SHARE, never the current one.
  const candidates = PATTERNS.filter((p) => p !== tile.pattern);
  const total = candidates.reduce((a, p) => a + PATTERN_SHARE[p], 0);
  let r = rnd(state, i, k, 2) * total;
  let pattern: TilePattern = candidates[candidates.length - 1] ?? 'flat';
  for (const p of candidates) {
    r -= PATTERN_SHARE[p];
    if (r <= 0) {
      pattern = p;
      break;
    }
  }
  tile.pattern = pattern;
  if (pattern === 'flat') {
    const others = FLAT_TONES.filter((c) => c !== tile.colour);
    tile.colour = others[Math.floor(rnd(state, i, k, 3) * others.length)] ?? P.paper;
  } else {
    tile.colour = LIGHT_TONES[Math.floor(rnd(state, i, k, 3) * LIGHT_TONES.length)] ?? CAFE_CREME;
  }
  tile.cellPx = 4 + Math.floor(rnd(state, i, k, 4) * 5);
  // Nudge from the authored home, never from the current position: the offset is bounded forever (§9 D).
  const hx = state.homeX[i] ?? tile.x, hy = state.homeY[i] ?? tile.y;
  tile.x = Math.min(Math.max(hx + (rnd(state, i, k, 5) - 0.5) * 2 * SWAP_NUDGE, 0), 1 - tile.w);
  tile.y = Math.min(Math.max(hy + (rnd(state, i, k, 6) - 0.5) * 2 * SWAP_NUDGE, 0), 1 - tile.h);
  state.swaps[i] = k + 1;
  state.total++;
}

/**
 * Advances tile life to `timeMs` (the life clock). Swaps are instant and hard-edged; each tile has its
 * own next-swap time; never more than MAX_SWAPS_PER_SECOND_BUILD swaps in any one second across the
 * frame during the build and never more than MAX_SWAPS_PER_SECOND after it; under reduced motion
 * (`opts.reducedMotion` or the state's `hold`) nothing swaps after the first second. Pure in (seed, time):
 * the same seed and the same dt sequence give byte-identical tile state.
 */
export function stepTiles(state: TileState, frame: SceneFrame, dtMs: number, timeMs: number, opts: { reducedMotion: boolean }): void {
  if (!(dtMs >= 0) || !Number.isFinite(timeMs)) return;
  const tiles = frame.tiles;
  const n = Math.min(tiles.length, state.next.length);
  const t = timeMs;
  const held = opts.reducedMotion || state.hold;
  for (let i = 0; i < n; i++) {
    if (t < (state.next[i] ?? Infinity)) continue;
    const tile = tiles[i];
    if (!tile) continue;
    if (held && t > REDUCED_SWAP_CUTOFF_MS) continue; // holds; resumes (schedule untouched) once the hold is lifted
    // The global cap: with a cap of two the older of the two most recent swaps must be over a second old,
    // with a cap of one the most recent one must be.
    const last = swapCapAt(state.buildMs, t) >= 2 ? state.recent[0] : state.recent[1];
    if (t - last <= 1000) {
      // The cap is spent for this second: retry a little later (deterministic jitter).
      state.next[i] = t + 120 + 240 * rnd(state, i, state.swaps[i] ?? 0, 7);
      continue;
    }
    swapTile(state, tile, i);
    state.recent = [state.recent[1], t];
    state.next[i] = t + swapIntervalMs(state, frame, i, t);
  }
}
