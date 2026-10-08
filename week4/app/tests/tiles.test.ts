import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SEED33, buildSeed33Scene } from '../src/scene/seed33.ts';
import {
  MAX_SWAPS_PER_SECOND,
  MAX_SWAPS_PER_SECOND_BUILD,
  PATTERNS,
  PATTERN_SHARE,
  REDUCED_SWAP_CUTOFF_MS,
  SWAP_INTERVAL_MAX_MS,
  SWAP_INTERVAL_MIN_MS,
  SWAP_NUDGE,
  TILE_COUNT_MAX,
  TILE_COUNT_MIN,
  TILE_MAX_ASPECT,
  TILE_MAX_W,
  TILE_MIN_ASPECT,
  TILE_MIN_W,
  TILE_ZONES,
  authorTiles,
  createTileState,
  intervalScale,
  quotas,
  setTilesHold,
  stepTiles,
  swapCapAt,
  swapIntervalMs,
  tileHomeOf,
  tileStateOf,
} from '../src/scene/tiles.ts';
import { isParisTone } from '../src/scene/palette.ts';
import { BIRTH_RAMP_MS } from '../src/scene/types.ts';
import type { SceneFrame, Tile } from '../src/scene/types.ts';

/** The evidence seed (33) and the arrival default (7): every authoring and cadence rule is checked at both (§9 E). */
const SEEDS = [33, 7];

const snapshot = (tiles: Tile[]) => tiles.map((t) => `${t.pattern}|${t.colour.join(',')}|${t.x.toFixed(5)}|${t.y.toFixed(5)}|${t.cellPx}`);

/** Runs tile life for `seconds` at a fixed dt and returns the life times at which any tile changed. */
function swapTimes(frame: SceneFrame, seconds: number, reducedMotion: boolean, dtMs = 16.7): number[] {
  const state = createTileState(frame, frame.seed);
  let prev = snapshot(frame.tiles);
  let t = 0;
  const times: number[] = [];
  for (let i = 0; i * dtMs < seconds * 1000; i++) {
    t += dtMs;
    stepTiles(state, frame, dtMs, t, { reducedMotion });
    const next = snapshot(frame.tiles);
    next.forEach((v, j) => {
      if (v !== prev[j]) times.push(t);
    });
    prev = next;
  }
  return times;
}

/** Asserts the one-second cap at every swap: two during the build, one after it. */
function assertCaps(times: number[], build: number): number {
  let afterBuild = 0;
  for (let i = 0; i < times.length; i++) {
    const t0 = times[i] as number;
    const inWindow = times.filter((t) => t >= t0 && t <= t0 + 1000).length;
    const cap = t0 < build ? MAX_SWAPS_PER_SECOND_BUILD : MAX_SWAPS_PER_SECOND;
    assert.ok(inWindow <= cap, `${inWindow} swaps within a second of ${t0} (cap ${cap})`);
    if (t0 >= build) afterBuild++;
  }
  return afterBuild;
}

test('authoring: 16–18 tiles, exact pattern quotas, zones, sizes, aspects, cells, hairlines, alphas, regions, Paris colours (seeds 33 and 7)', () => {
  assert.equal(TILE_COUNT_MIN, 16);
  assert.equal(TILE_COUNT_MAX, 18);
  for (const seed of SEEDS) {
    const frame = buildSeed33Scene({ ...DEFAULT_SEED33, seed });
    const tiles = frame.tiles;
    assert.ok(tiles.length >= TILE_COUNT_MIN && tiles.length <= TILE_COUNT_MAX, `seed ${seed}: count ${tiles.length}`);
    const expected = quotas(tiles.length, PATTERNS.map((p) => PATTERN_SHARE[p]));
    PATTERNS.forEach((p, i) => assert.equal(tiles.filter((t) => t.pattern === p).length, expected[i], `seed ${seed}: pattern ${p}`));
    assert.ok((expected[0] ?? 0) > (expected[2] ?? 0) && (expected[1] ?? 0) > (expected[3] ?? 0), 'flat and dither dominate');
    const zoneQuota = quotas(tiles.length, TILE_ZONES.map((z) => z.share));
    TILE_ZONES.forEach((z, i) => assert.equal(tiles.filter((t) => t.id.startsWith(`tile:${z.key}/`)).length, zoneQuota[i], `seed ${seed}: zone ${z.key}`));
    const ids = new Set<string>();
    let hairlines = 0;
    for (const t of tiles) {
      assert.ok(!ids.has(t.id), `duplicate ${t.id}`);
      ids.add(t.id);
      assert.ok(t.w >= TILE_MIN_W - 1e-9 && t.w <= TILE_MAX_W + 1e-9, `${t.id} width ${t.w}`);
      const aspect = (t.w * frame.aspect) / t.h;
      assert.ok(aspect >= TILE_MIN_ASPECT - 1e-6 && aspect <= TILE_MAX_ASPECT + 0.4, `${t.id} aspect ${aspect}`); // clamped heights may widen it slightly
      assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= 1 && t.y + t.h <= 1, `${t.id} outside the frame`);
      const zone = TILE_ZONES.find((z) => t.id.startsWith(`tile:${z.key}/`))!;
      assert.ok(t.x >= zone.x0 - 1e-9 && t.y >= zone.y0 - 1e-9 && t.x + t.w <= zone.x1 + 1e-9 && t.y + t.h <= zone.y1 + 1e-9, `${t.id} outside its zone`);
      assert.ok(Number.isInteger(t.cellPx) && t.cellPx >= 4 && t.cellPx <= 8, `${t.id} cell ${t.cellPx}`);
      assert.ok(t.alpha >= 0.75 && t.alpha <= 0.95, `${t.id} alpha ${t.alpha}`);
      assert.ok(t.hairline === 0 || (t.hairline >= 0.02 && t.hairline <= 0.18), `${t.id} hairline ${t.hairline}`);
      if (t.hairline > 0) hairlines++;
      assert.ok(isParisTone(t.colour), `${t.id} colour`);
      const region = frame.regions[t.region];
      assert.ok(region && zone.region === region.id, `${t.id} floats over ${region?.id}`);
      assert.ok(t.birthMs >= 0 && t.birthMs <= frame.build.durationMs * 0.2);
      assert.deepEqual(tileHomeOf(t), { x: t.x, y: t.y }, `${t.id} home is its authored position`);
    }
    assert.ok(hairlines >= tiles.length * 0.3 && hairlines <= tiles.length * 0.7, `seed ${seed}: about half carry a hairline (${hairlines}/${tiles.length})`);
    assert.deepEqual(authorTiles(seed, frame.regions, 12_000, frame.aspect), tiles, 'deterministic from the seed');
    assert.notDeepEqual(authorTiles(seed + 1, frame.regions, 12_000, frame.aspect), tiles, 'another seed differs');
    // A zero-length build keeps the layout and is born one ramp early (§9 G).
    const instant = authorTiles(seed, frame.regions, 0, frame.aspect);
    assert.deepEqual(instant.map((t) => ({ ...t, birthMs: 0 })), tiles.map((t) => ({ ...t, birthMs: 0 })));
    for (const t of instant) assert.equal(t.birthMs, -BIRTH_RAMP_MS);
  }
  for (const seed of [1, 2, 34, 99, 1234]) {
    const n = authorTiles(seed, buildSeed33Scene(DEFAULT_SEED33).regions, 12_000, 16 / 9).length;
    assert.ok(n >= TILE_COUNT_MIN && n <= TILE_COUNT_MAX, `seed ${seed} authored ${n} tiles`);
  }
  assert.deepEqual(quotas(20, [0.35, 0.3, 0.15, 0.1, 0.1]), [7, 6, 3, 2, 2]);
  assert.deepEqual(quotas(18, [0.35, 0.3, 0.15, 0.1, 0.1]), [6, 5, 3, 2, 2]);
  assert.deepEqual(quotas(17, TILE_ZONES.map((z) => z.share)), [4, 5, 2, 4, 2]);
});

test('life: swaps happen, at most two per second during the build and one per second after it, byte-identical for the same seed and dt sequence (seeds 33 and 7)', () => {
  assert.equal(MAX_SWAPS_PER_SECOND, 1);
  assert.equal(MAX_SWAPS_PER_SECOND_BUILD, 2);
  for (const seed of SEEDS) {
    const frame = buildSeed33Scene({ ...DEFAULT_SEED33, seed });
    const build = frame.build.durationMs;
    assert.equal(swapCapAt(build, build - 1), 2);
    assert.equal(swapCapAt(build, build), 1);
    assert.equal(swapCapAt(0, 0), 1);
    const times = swapTimes(frame, 60, false);
    assert.ok(times.length > 10, `seed ${seed}: swaps in 60 s: ${times.length}`);
    assert.ok(times.length < 60, `seed ${seed}: calm: ${times.length} swaps in 60 s`);
    const afterBuild = assertCaps(times, build);
    assert.ok(afterBuild > 3, `seed ${seed}: swaps after the build: ${afterBuild}`);
    // Swaps are instant: a tile changes pattern (or colour/position) between consecutive steps, nothing else moves.
    const a = buildSeed33Scene({ ...DEFAULT_SEED33, seed }), b = buildSeed33Scene({ ...DEFAULT_SEED33, seed });
    const sa = createTileState(a, a.seed), sb = createTileState(b, b.seed);
    const dts = [16.7, 16.7, 33.4, 16.7, 50, 16.7, 100, 16.7, 16.7, 8];
    let ta = 0, tb = 0;
    for (let i = 0; i < 2400; i++) {
      const dt = dts[i % dts.length] as number;
      ta += dt;
      tb += dt;
      stepTiles(sa, a, dt, ta, { reducedMotion: false });
      stepTiles(sb, b, dt, tb, { reducedMotion: false });
    }
    assert.deepEqual(a.tiles, b.tiles);
    assert.deepEqual(Array.from(sa.next), Array.from(sb.next));
    assert.deepEqual(Array.from(sa.swaps), Array.from(sb.swaps));
    assert.equal(sa.total, sb.total);
    // Identity never changes: ids, regions, sizes and hairlines are untouched by swaps; nudges stay within 1 % of home.
    const fresh = buildSeed33Scene({ ...DEFAULT_SEED33, seed });
    a.tiles.forEach((t, i) => {
      const f = fresh.tiles[i]!;
      assert.equal(t.id, f.id);
      assert.equal(t.region, f.region);
      assert.equal(t.w, f.w);
      assert.equal(t.h, f.h);
      assert.equal(t.hairline, f.hairline);
      assert.ok(Math.abs(t.x - f.x) <= SWAP_NUDGE + 1e-9 && Math.abs(t.y - f.y) <= SWAP_NUDGE + 1e-9, `${t.id} drifted`);
      assert.ok(isParisTone(t.colour));
    });
  }
});

test('life: nudges are measured from the authored home, so a tile never drifts more than 1 % of the frame however many times it swaps (§9 D)', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const home = frame.tiles.map((t) => tileHomeOf(t));
  const state = createTileState(frame, frame.seed);
  assert.equal(tileStateOf(frame), state, 'the frame knows its tile state');
  assert.deepEqual(Array.from(state.homeX), home.map((h) => h.x));
  assert.deepEqual(Array.from(state.homeY), home.map((h) => h.y));
  let t = 0;
  let maxOffset = 0;
  for (let i = 0; i < 24_000; i++) {
    t += 50; // 20 minutes of life
    stepTiles(state, frame, 50, t, { reducedMotion: false });
    frame.tiles.forEach((tile, j) => {
      maxOffset = Math.max(maxOffset, Math.abs(tile.x - home[j]!.x), Math.abs(tile.y - home[j]!.y));
    });
  }
  assert.ok(state.total > 100, `swaps in 20 min: ${state.total}`);
  assert.ok(Math.max(...Array.from(state.swaps)) >= 5, 'tiles have swapped many times each');
  assert.ok(maxOffset <= SWAP_NUDGE + 1e-9, `largest offset from home ${maxOffset}`);
  assert.ok(maxOffset > SWAP_NUDGE * 0.5, 'nudges do happen');
});

test('life: nearest regions calm first after the build; intervals are halved during it', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const build = frame.build.durationMs;
  assert.equal(intervalScale(build, 1, build - 1), 0.5);
  assert.equal(intervalScale(build, 0, build - 1), 0.5);
  assert.equal(intervalScale(build, 1, build), 1);
  assert.ok(Math.abs(intervalScale(build, 1, build + 10_000) - 4) < 1e-9, 'the nearest region is fully settled 10 s after the build');
  assert.ok(intervalScale(build, 0, build + 10_000) < 2.1, 'the farthest region is still lively then');
  assert.ok(Math.abs(intervalScale(build, 0, build + 30_000) - 4) < 1e-9);
  const state = createTileState(frame, frame.seed);
  const cupTile = frame.tiles.findIndex((t) => t.id.startsWith('tile:cup/'));
  const farTile = frame.tiles.findIndex((t) => t.id.startsWith('tile:facade-right/'));
  assert.ok(cupTile >= 0 && farTile >= 0);
  const at = (i: number, t: number) => swapIntervalMs(state, frame, i, t) / swapIntervalMs(state, frame, i, 0);
  assert.ok(at(cupTile, build + 10_000) > at(farTile, build + 10_000), 'the cup tile has grown calmer than the façade tile');
  assert.equal(SWAP_INTERVAL_MIN_MS, 12_000);
  assert.equal(SWAP_INTERVAL_MAX_MS, 30_000);
  for (let i = 0; i < frame.tiles.length; i++) {
    const base = swapIntervalMs(state, frame, i, build);
    assert.ok(base >= SWAP_INTERVAL_MIN_MS && base <= SWAP_INTERVAL_MAX_MS, `base interval ${base}`);
    assert.ok(Math.abs(swapIntervalMs(state, frame, i, build - 1) - base * 0.5) < 1e-6, 'halved during the build');
  }
});

test('life: reduced motion allows no swap after the first second (seeds 33 and 7); a zero build keeps the one-per-second cap', () => {
  for (const seed of SEEDS) {
    const frame = buildSeed33Scene({ ...DEFAULT_SEED33, seed });
    const times = swapTimes(frame, 40, true);
    assert.ok(times.every((t) => t <= REDUCED_SWAP_CUTOFF_MS), `seed ${seed}: late swaps under reduced motion: ${times.filter((t) => t > REDUCED_SWAP_CUTOFF_MS).length}`);
    // A scene built instantly (buildMs 0) is past its build from t = 0: the one-per-second cap applies throughout, and it still swaps.
    const instant = buildSeed33Scene({ ...DEFAULT_SEED33, seed, buildMs: 0 });
    const normal = swapTimes(instant, 30, false);
    assert.ok(normal.length > 3, `seed ${seed}: instant scene swaps in 30 s: ${normal.length}`);
    for (const t0 of normal) assert.ok(normal.filter((t) => t >= t0 && t <= t0 + 1000).length <= MAX_SWAPS_PER_SECOND, `more than one swap within a second of ${t0}`);
  }
});

test('life: a hold stops swapping without resetting the schedule and resumes where it stands (the reduced-motion toggle)', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const state = createTileState(frame, frame.seed);
  let t = 0;
  const step = () => {
    t += 16.7;
    stepTiles(state, frame, 16.7, t, { reducedMotion: false });
  };
  for (let i = 0; i < 600; i++) step(); // 10 s, during the build
  const total = state.total;
  const next = Array.from(state.next), swaps = Array.from(state.swaps), tiles = JSON.stringify(frame.tiles);
  setTilesHold(state, true);
  assert.deepEqual([Array.from(state.next), Array.from(state.swaps), state.total, JSON.stringify(frame.tiles)], [next, swaps, total, tiles], 'the hold itself changes nothing');
  for (let i = 0; i < 3600; i++) step(); // a further minute
  assert.equal(state.total, total, 'no swap while held');
  assert.equal(JSON.stringify(frame.tiles), tiles);
  setTilesHold(state, false);
  const resumedAt = t;
  const times: number[] = [];
  for (let i = 0; i < 1800; i++) {
    const before = state.total;
    step();
    if (state.total > before) times.push(t);
  }
  assert.ok(times.length > 3, `swaps after resuming: ${times.length}`);
  for (const t0 of times) assert.ok(times.filter((x) => x >= t0 && x <= t0 + 1000).length <= MAX_SWAPS_PER_SECOND, `cap kept after resuming at ${t0}`);
  assert.ok((times[0] ?? Infinity) - resumedAt < 2000, 'resumes promptly');
  // The hold and opts.reducedMotion are equivalent: either stops swapping.
  const other = buildSeed33Scene(DEFAULT_SEED33);
  const os = createTileState(other, other.seed);
  let ot = 0;
  for (let i = 0; i < 3600; i++) {
    ot += 16.7;
    stepTiles(os, other, 16.7, ot, { reducedMotion: ot > 1000 });
  }
  assert.ok(os.total <= 2, `opts.reducedMotion stops swapping too (${os.total})`);
});
