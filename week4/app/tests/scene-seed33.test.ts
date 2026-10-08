import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPACITY, DEFAULT_ARRIVAL, buildArrivalScene, rigsOf } from '../src/scene/arrival.ts';
import { SIZE_GAIN } from '../src/scene/author.ts';
import {
  BELT_DIM,
  BRIGHT_WEIGHT,
  DEFAULT_SEED33,
  DOT_PITCH_PX,
  GROUND,
  HALO_ALPHA,
  HALO_SIZE,
  HEAD_LIGHT,
  PORCELAIN_PITCH_PX,
  REGION_ORDER,
  SEED33_SKY,
  SEED33_SKY_POLYGON,
  TABLE_OUTER_RAYS_FROM,
  TABLE_RIM_PX,
  THREAD_CLASSES,
  THREAD_HALO_ALPHA,
  THREAD_HALO_SIZE,
  WALKER_FADE_OUT_S,
  WALKER_GAP_S,
  WOMAN_APPROACH,
  WOMAN_DWELL_S,
  authorSeed33,
  buildSeed33Scene,
  coatHalfWidth,
  haloCountOf,
  insideWalkerSilhouette,
  seed33RigsOf,
  setReducedMotion,
  walkerIntroOf,
  walkerSilhouette,
  womanIntro,
} from '../src/scene/seed33.ts';
import type { WalkerKind } from '../src/scene/seed33.ts';
import { TILE_COUNT_MAX, TILE_COUNT_MIN, stepTiles } from '../src/scene/tiles.ts';
import { createLife, rigsOfFrame, stepLife, walkerPose } from '../src/scene/life.ts';
import { ASPECT } from '../src/scene/arrival.ts';
import { isParisTone } from '../src/scene/palette.ts';
import { BIRTH_RAMP_MS } from '../src/scene/types.ts';
import { isStableId } from '../../core/ids.ts';

const regionBase = (id: string) => id.split('/')[0] ?? id;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? NaN;
};
/** Largest core bead: the bright thread class and the table's rim ring reach 4.2 px before the writer's +8 % jitter and SIZE_GAIN (a hair of Float32 slack). */
const MAX_CORE_PX = 4.2 * 1.08 * SIZE_GAIN * (1 + 1e-5);
const isNearHalo = (a: number) => a >= HALO_ALPHA[0] - 1e-6 && a <= HALO_ALPHA[1] + 1e-6;
const isThreadHalo = (a: number) => Math.abs(a - THREAD_HALO_ALPHA) < 1e-6;
const isHaloAlpha = (a: number) => isNearHalo(a) || isThreadHalo(a);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
/** Element-wise equality of two long lanes, reporting the first mismatch (a deepEqual diff of 60k numbers would exhaust memory). */
function assertSameLane(actual: ArrayLike<number>, expected: ArrayLike<number>, label: string): void {
  assert.equal(actual.length, expected.length, `${label}: length`);
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) assert.fail(`${label}: differs at ${i} (${actual[i]} vs ${expected[i]})`);
  }
}

test('seed-33 scene is deterministic and stays under capacity at density 1.25', () => {
  const a = buildSeed33Scene(DEFAULT_SEED33);
  const b = buildSeed33Scene(DEFAULT_SEED33);
  assert.equal(a.store.count, b.store.count);
  assert.deepEqual(a.regions, b.regions);
  for (const key of ['x', 'y', 'a', 'size', 'phase', 'motion', 'birthMs'] as const) {
    assert.deepEqual(Array.from(a.store[key].subarray(0, a.store.count)), Array.from(b.store[key].subarray(0, b.store.count)), key);
  }
  assert.deepEqual(a.tiles, b.tiles);
  const high = buildSeed33Scene({ ...DEFAULT_SEED33, density: 1.25 });
  assert.ok(high.store.count <= CAPACITY && high.store.count > a.store.count, `count ${high.store.count}`);
  assert.ok(a.store.count > 30_000, `the scene is not empty (${a.store.count})`);
  assert.ok(haloCountOf(a) > 10_000 && haloCountOf(high) > haloCountOf(a), `halo beads ${haloCountOf(a)} / ${haloCountOf(high)}`);
  assert.throws(() => authorSeed33(DEFAULT_SEED33, 5_000), RangeError);
});

test('regions follow the far → near order with the stable IDs and contiguous slot ranges', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  assert.deepEqual(frame.regions.map((r) => r.id), [...REGION_ORDER]);
  let cursor = 0;
  for (const r of frame.regions) {
    assert.ok(isStableId(regionBase(r.id)), `${r.id} base is not a stable id`);
    assert.equal(r.start, cursor, `${r.id} starts at ${r.start}, expected ${cursor}`);
    assert.ok(r.end > r.start, `${r.id} is empty`);
    cursor = r.end;
  }
  assert.equal(cursor, frame.store.count);
  const firstNear = frame.regions.findIndex((r) => r.band === 'near');
  assert.ok(frame.regions.slice(firstNear).every((r) => r.band === 'near'), 'near regions are drawn last');
  const near = frame.regions.filter((r) => r.band === 'near').map((r) => r.depth);
  const far = frame.regions.filter((r) => r.band === 'far' || r.band === 'facade').map((r) => r.depth);
  assert.ok(Math.min(...near) > Math.max(...far));
  assert.deepEqual(frame.regions.filter((r) => r.dynamic).map((r) => r.id), ['actors:passersby/third', 'actors:passersby/man', 'actors:passersby/woman', 'fx:smoke', 'fx:steam']);
  assert.equal(frame.paper, GROUND);
  assert.deepEqual(frame.sky, SEED33_SKY);
  assert.deepEqual(frame.sky?.polygon, SEED33_SKY_POLYGON, 'the Sky carries the wedge polygon for the renderers to clip to');
  assert.ok((frame.sky?.polygon?.length ?? 0) >= 3 && frame.sky!.polygon!.every(([x, y]) => x >= -0.03 && x <= 1.03 && y >= -0.03 && y <= 1.03));
  assert.equal(frame.build.durationMs, DEFAULT_SEED33.buildMs);
  assert.ok(frame.tiles.length >= TILE_COUNT_MIN && frame.tiles.length <= TILE_COUNT_MAX && TILE_COUNT_MAX === 18, `tile count ${frame.tiles.length}`);
});

test('every bead is finite, inside the frame margin, Paris-toned, and sized like a bead or its halo', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const s = frame.store;
  let large = 0, haloLike = 0;
  for (let k = 0; k < s.count; k++) {
    const x = s.x[k] ?? NaN, y = s.y[k] ?? NaN;
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && x > -0.03 && x < 1.03 && y > -0.03 && y < 1.03, `particle ${k} at ${x},${y}`);
    const a = s.a[k] ?? -1;
    assert.ok(a >= 0 && a <= 1, `alpha ${a} at ${k}`);
    const size = s.size[k] ?? 0;
    // Core beads stay at bead size; a near halo is HALO_SIZE × its bead at HALO_ALPHA, a thread halo THREAD_HALO_SIZE × at THREAD_HALO_ALPHA.
    assert.ok(size >= 0.5 && size <= MAX_CORE_PX * HALO_SIZE + 1e-6, `size ${size} at ${k}`);
    if (size > MAX_CORE_PX) {
      large++;
      assert.ok(isHaloAlpha(a), `a large bead must be a dim halo (size ${size}, alpha ${a} at ${k})`);
      if (isThreadHalo(a)) assert.ok(size <= MAX_CORE_PX * THREAD_HALO_SIZE + 1e-6, `a thread halo is at most ${THREAD_HALO_SIZE}× a bead (size ${size} at ${k})`);
    }
    if (isHaloAlpha(a) && size > 6) haloLike++;
    assert.ok(isParisTone([s.r[k] ?? 0, s.g[k] ?? 0, s.b[k] ?? 0]), `particle ${k} is off-palette`);
    assert.ok((s.phase[k] ?? -1) >= 0 && (s.phase[k] ?? 2) < 1);
  }
  assert.ok(large <= haloCountOf(frame) && haloLike >= haloCountOf(frame) * 0.95, `large ${large}, halo-like ${haloLike}, halos ${haloCountOf(frame)}`);
  assert.ok(isParisTone(GROUND) && isParisTone(SEED33_SKY.top) && isParisTone(SEED33_SKY.horizon));
  for (const t of frame.tiles) assert.ok(isParisTone(t.colour), `${t.id} is off-palette`);
});

test('halos sit under the bright beads: near objects ×HALO_SIZE at HALO_ALPHA, the bright thread class ×THREAD_HALO_SIZE at THREAD_HALO_ALPHA; same position, colour and shimmer phase', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const s = frame.store;
  assert.equal(HALO_SIZE, 4);
  assert.deepEqual(HALO_ALPHA, [0.16, 0.22]);
  assert.equal(THREAD_HALO_SIZE, 3);
  assert.equal(THREAD_HALO_ALPHA, 0.1);
  const nearHaloed = ['obj:cup', 'obj:saucer', 'obj:ashtray', 'obj:table', 'actors:passersby/woman', 'obj:lamp-post', 'obj:neighbour-chair'];
  const threadHaloed = ['layer:facade/left', 'layer:facade/right', 'layer:facade/mansard'];
  const unhaloed = ['layer:far', 'obj:awning', 'actors:passersby/man', 'actors:passersby/third'];
  const checkPairs = (id: string, factor: number, alphaOk: (a: number) => boolean, minPairs: number) => {
    const r = frame.regions.find((r) => r.id === id)!;
    let pairs = 0;
    for (let k = r.start + 1; k < r.end; k++) {
      const h = k - 1;
      if ((s.size[h] ?? 0) <= MAX_CORE_PX) continue;
      pairs++;
      assert.ok(alphaOk(s.a[h] ?? 0), `${id} halo ${h} alpha ${s.a[h]}`);
      assert.equal(s.x[h], s.x[k], `${id} halo ${h} shares x`);
      assert.equal(s.y[h], s.y[k], `${id} halo ${h} shares y`);
      assert.ok(Math.abs((s.size[h] ?? 0) - factor * (s.size[k] ?? 0)) < 1e-3, `${id} halo ${h} is ${factor}× its bead`);
      assert.ok(s.r[h] === s.r[k] && s.g[h] === s.g[k] && s.b[h] === s.b[k], `${id} halo ${h} shares the colour`);
      assert.equal(s.phase[h], s.phase[k], `${id} halo ${h} breathes with its bead`);
      assert.equal(s.birthMs[h], s.birthMs[k]);
      assert.ok((s.a[k] ?? 0) >= 0.5, `${id} halo ${h} sits under a bright bead (alpha ${s.a[k]})`);
    }
    assert.ok(pairs > minPairs, `${id} has ${pairs} halo pairs`);
  };
  for (const id of nearHaloed) checkPairs(id, HALO_SIZE, isNearHalo, 50);
  for (const id of threadHaloed) checkPairs(id, THREAD_HALO_SIZE, isThreadHalo, id.endsWith('mansard') ? 20 : 200);
  for (const id of unhaloed) {
    const r = frame.regions.find((r) => r.id === id)!;
    for (let k = r.start; k < r.end; k++) assert.ok((s.size[k] ?? 0) <= MAX_CORE_PX + 1e-6, `${id} has a halo-sized bead at ${k}`);
  }
  // Near objects are warm: no grey-leaning bead in the cup, saucer or table (red ≥ blue, and not far from cupWhite/café crème).
  for (const id of ['obj:cup', 'obj:saucer', 'obj:table']) {
    const r = frame.regions.find((r) => r.id === id)!;
    for (let k = r.start; k < r.end; k += 7) assert.ok((s.r[k] ?? 0) >= (s.b[k] ?? 0), `${id} bead ${k} leans cool`);
  }
});

test('table (§11.3): the half-pitch-offset outer ray set thickens the burst toward the rim; the rim ring is 4.2 px', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const s = frame.store;
  const r = frame.regions.find((r) => r.id === 'obj:table')!;
  assert.equal(TABLE_OUTER_RAYS_FROM, 0.55);
  assert.equal(TABLE_RIM_PX, 4.2);
  // Rays diverge from the focal point, so with one set a strip across them holds fewer beads the farther it is
  // from the focus (count ∝ 1 / distance: 0.36 / 0.51 ≈ 0.7 here); the second set over the outer part turns
  // the near-rim strip denser than the mid-radius strip instead. Both strips avoid the rim rings and the objects.
  let nearRim = 0, mid = 0, maxCore = 0;
  for (let k = r.start; k < r.end; k++) {
    const size = s.size[k] ?? 0;
    if (size > MAX_CORE_PX) continue;
    maxCore = Math.max(maxCore, size);
    const x = s.x[k] ?? 0, y = s.y[k] ?? 0;
    if (x < 0.42 || x > 0.58) continue;
    if (y >= 0.78 && y <= 0.805) nearRim++;
    else if (y >= 0.93 && y <= 0.955) mid++;
  }
  assert.ok(mid > 200 && nearRim / mid >= 1.1, `near-rim strip ${nearRim} vs mid strip ${mid}`);
  assert.ok(maxCore >= TABLE_RIM_PX * 0.92 * SIZE_GAIN && maxCore <= MAX_CORE_PX, `largest table core bead ${maxCore}`);
});

test('cup and saucer (§11.4): porcelain dot-fills at a 2.6 px pitch and alpha 1.0; the coffee ellipse stays dark', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const s = frame.store;
  assert.equal(PORCELAIN_PITCH_PX, 2.6);
  const fillSize = 3.4 * SIZE_GAIN; // dot-fill beads carry no size jitter
  const expectedGap = (PORCELAIN_PITCH_PX / 1080) / ASPECT;
  for (const id of ['obj:cup', 'obj:saucer']) {
    const r = frame.regions.find((r) => r.id === id)!;
    let cores = 0, full = 0, inCoffee = 0;
    const rows = new Map<number, number[]>();
    for (let k = r.start; k < r.end; k++) {
      const size = s.size[k] ?? 0, a = s.a[k] ?? 0;
      if (size > MAX_CORE_PX) continue;
      cores++;
      if (a >= 0.999) full++;
      if (Math.abs(size - fillSize) > 1e-4 || a < 0.999) continue;
      const key = Math.round((s.y[k] ?? 0) * 1e6);
      (rows.get(key) ?? rows.set(key, []).get(key)!).push(s.x[k] ?? 0);
      // The coffee surface: nothing of the fill inside the rim ellipse (a 0.85 margin keeps the inner rim ring out of the question).
      const u = ((s.x[k] ?? 0) - 0.7) / (0.052 * 0.85), v = ((s.y[k] ?? 0) - 0.768) / (0.014 * 0.85);
      if (id === 'obj:cup' && u * u + v * v < 1) inCoffee++;
    }
    assert.ok(full / cores >= 0.6, `${id}: ${full} of ${cores} core beads at alpha 1`);
    let minGap = 1;
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) minGap = Math.min(minGap, (xs[i] ?? 0) - (xs[i - 1] ?? 0));
    }
    assert.ok(rows.size > 20 && Math.abs(minGap - expectedGap) < 1e-6, `${id}: fill pitch ${minGap} vs ${expectedGap} over ${rows.size} rows`);
    assert.equal(inCoffee, 0, `${id}: fill dots inside the coffee ellipse`);
  }
});

test('façades (§11.5): the bright thread class is weighted ×1.15 and the mid class sits at 0.3–0.55', () => {
  assert.equal(BRIGHT_WEIGHT, 1.15);
  assert.deepEqual(THREAD_CLASSES.mid.alpha, [0.3, 0.55]);
  assert.deepEqual(THREAD_CLASSES.bright.alpha, [0.9, 1.0]);
});

test('construction is nearest-first: cup < chair < woman < left façade < mansard by median birth; threads draw on from the bottom; zero builds are born one ramp early', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const s = frame.store;
  const birthsOf = (id: string) => {
    const r = frame.regions.find((r) => r.id === id);
    assert.ok(r, id);
    return Array.from(s.birthMs.subarray(r.start, r.end));
  };
  const cup = median(birthsOf('obj:cup')), chair = median(birthsOf('obj:neighbour-chair')), woman = median(birthsOf('actors:passersby/woman'));
  const left = median(birthsOf('layer:facade/left')), mansard = median(birthsOf('layer:facade/mansard'));
  assert.ok(cup < chair && chair < woman && woman < left && left < mansard, `${cup} ${chair} ${woman} ${left} ${mansard}`);
  for (let k = 0; k < s.count; k++) assert.ok((s.birthMs[k] ?? -1) >= 0 && (s.birthMs[k] ?? Infinity) <= DEFAULT_SEED33.buildMs);
  // Within the left façade, higher beads (smaller y) are born later than lower beads on average.
  const r = frame.regions.find((r) => r.id === 'layer:facade/left')!;
  let lowSum = 0, lowN = 0, highSum = 0, highN = 0;
  for (let k = r.start; k < r.end; k++) {
    if ((s.y[k] ?? 0) > 0.55) { lowSum += s.birthMs[k] ?? 0; lowN++; } else if ((s.y[k] ?? 1) < 0.15) { highSum += s.birthMs[k] ?? 0; highN++; }
  }
  assert.ok(lowN > 100 && highN > 100 && lowSum / lowN < highSum / highN, 'beads draw on from the bottom');
  for (const t of frame.tiles) assert.ok(t.birthMs <= DEFAULT_SEED33.buildMs * 0.2, `${t.id} born late`);
  // A zero-length build: everything (beads, emitter slots, tiles) is born at −BIRTH_RAMP_MS, so a paused frame at t = 0 is complete (§9 G).
  const instant = buildSeed33Scene({ ...DEFAULT_SEED33, buildMs: 0 });
  for (let k = 0; k < instant.store.count; k++) assert.equal(instant.store.birthMs[k], -BIRTH_RAMP_MS);
  for (const t of instant.tiles) assert.equal(t.birthMs, -BIRTH_RAMP_MS);
  assert.equal(instant.build.durationMs, 0);
  assert.equal(instant.store.count, frame.store.count, 'the build length changes births only');
  assert.deepEqual(instant.tiles.map((t) => [t.id, t.x, t.y, t.pattern]), frame.tiles.map((t) => [t.id, t.x, t.y, t.pattern]), 'the tile layout does not depend on the build length');
});

test('shimmer: threads and objects have motion, people none; reduced motion zeroes every motion', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const s = frame.store;
  for (const r of frame.regions) {
    let moving = 0;
    for (let k = r.start; k < r.end; k++) {
      const m = s.motion[k] ?? 0;
      assert.ok(m >= 0 && m <= 0.4, `${r.id} motion ${m}`);
      if (m > 0) moving++;
    }
    if (r.dynamic) assert.equal(moving, 0, `${r.id} must be moved by life, not shimmer`);
    else assert.equal(moving, r.end - r.start, `${r.id} should shimmer`);
  }
  const reduced = buildSeed33Scene({ ...DEFAULT_SEED33, reducedMotion: true });
  for (let k = 0; k < reduced.store.count; k++) assert.equal(reduced.store.motion[k], 0);
  assert.equal(reduced.store.count, frame.store.count, 'reduced motion changes motion only, not geometry');
});

test('setReducedMotion flips the motion lane in place from the authored copy and holds the tile life, resetting nothing', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const s = frame.store;
  const authored = s.motion.slice(0, s.count);
  const LANES = ['x', 'y', 'a', 'size', 'phase', 'birthMs'] as const;
  const snapshot = () => LANES.map((key) => s[key].slice(0, s.count));
  const life = createLife(frame);
  for (let i = 0; i < 300; i++) stepLife(life, frame, 16.7, { reducedMotion: false }); // ~5 s in
  const before = snapshot();
  const tiles = life.tiles!;
  const next = Array.from(tiles.next), swaps = Array.from(tiles.swaps), total = tiles.total, clock = life.clockMs, walk = life.walkMs;
  const tileSnap = JSON.stringify(frame.tiles);
  setReducedMotion(frame, true);
  for (let k = 0; k < s.count; k++) if (s.motion[k] !== 0) assert.fail(`motion ${s.motion[k]} at ${k} after reducing`);
  snapshot().forEach((lane, i) => assertSameLane(lane, before[i]!, `${LANES[i]} after the toggle`));
  assert.equal(s.count, frame.regions[frame.regions.length - 1]!.end);
  assert.equal(tiles.hold, true, 'the tile state is told to hold');
  assert.deepEqual([Array.from(tiles.next), Array.from(tiles.swaps), tiles.total, life.clockMs, life.walkMs, JSON.stringify(frame.tiles)], [next, swaps, total, clock, walk, tileSnap], 'nothing was reset');
  // Held: no swap in the next minute even though schedules come due.
  for (let i = 0; i < 3600; i++) stepLife(life, frame, 16.7, { reducedMotion: false });
  assert.equal(tiles.total, total, 'no swaps while held');
  setReducedMotion(frame, false);
  assertSameLane(s.motion.subarray(0, s.count), authored, 'the authored shimmer is restored exactly');
  assert.equal(tiles.hold, false);
  for (let i = 0; i < 1800; i++) stepLife(life, frame, 16.7, { reducedMotion: false });
  assert.ok(tiles.total > total, 'swapping resumes after the hold');
  // Idempotent, and a scene authored reduced can be released to the same authored lane as a normal build.
  setReducedMotion(frame, false);
  assertSameLane(s.motion.subarray(0, s.count), authored, 'idempotent');
  const reduced = buildSeed33Scene({ ...DEFAULT_SEED33, reducedMotion: true });
  setReducedMotion(reduced, false);
  assertSameLane(reduced.store.motion.subarray(0, reduced.store.count), authored, 'a reduced build releases to the authored lane');
  // The arrival scene (no authored copy, no shimmer, no tiles) is safe to toggle either way.
  const arrival = buildArrivalScene(DEFAULT_ARRIVAL);
  setReducedMotion(arrival, true);
  setReducedMotion(arrival, false);
  for (let k = 0; k < arrival.store.count; k += 101) assert.equal(arrival.store.motion[k], 0);
});

test('people (§11.1) are one continuous organic dot figure each: nothing above the head line, every grid cell present, the head on the shoulders, a flared coat, legs into boots', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const rigs = seed33RigsOf(frame);
  assert.ok(rigs && rigs.walkers.length === 3 && rigs.emitters.length === 2);
  assert.equal(rigsOf(frame), undefined, 'arrival registry does not know this frame');
  assert.equal(rigsOfFrame(frame), rigs);
  const s = frame.store;
  const kindOf = (id: string): WalkerKind => (id.endsWith('/woman') ? 'woman' : id.endsWith('/man') ? 'man' : 'far');
  const womanSil = walkerSilhouette('woman', 'toward');
  for (const rig of rigs.walkers) {
    const headTop = rig.homeFeet[1] - 1.035 * rig.homeHeight;
    const sil = walkerSilhouette(kindOf(rig.id), rig.facing);
    const pitch = DOT_PITCH_PX / 1080 / rig.homeHeight; // grid pitch in heights (density 1)
    let minY = 1, maxY = 0, head = 0, outside = 0, legs = 0, maxNx = 0;
    const rows = new Map<number, number>();
    for (let k = rig.start; k < rig.end; k++) {
      minY = Math.min(minY, s.y[k] ?? 1);
      maxY = Math.max(maxY, s.y[k] ?? 0);
      const i = k - rig.start;
      if (rig.limb[i] === 3) head++;
      if (rig.limb[i] === 1 || rig.limb[i] === 2) legs++;
      // Every dot of the grid lies inside the silhouette polygons (a hair's tolerance for Float32 round-trip).
      const nx = rig.nx[i] ?? 0, ny = rig.ny[i] ?? 0;
      maxNx = Math.max(maxNx, Math.abs(nx));
      if (!insideWalkerSilhouette(sil, nx, ny) && !insideWalkerSilhouette(sil, nx * 0.999, ny * 0.999)) outside++;
      const row = Math.round(-ny / pitch);
      rows.set(row, (rows.get(row) ?? 0) + 1);
    }
    assert.ok(minY >= headTop, `${rig.id} has beads above the head line (${minY} < ${headTop})`);
    assert.ok(maxY <= rig.homeFeet[1] + 0.001, `${rig.id} has beads below the feet`);
    assert.equal(outside, 0, `${rig.id} has ${outside} dots outside its silhouette`);
    assert.ok(head > 5, `${rig.id} head is present`);
    assert.ok(legs > 10, `${rig.id} has legs (${legs} dots)`);
    assert.ok(rig.end - rig.start > 150, `${rig.id} has ${rig.end - rig.start} dots`);
    assert.ok(maxNx <= sil.hem + 0.001 && maxNx > sil.shoulder, `${rig.id} is widest at the flared hem (${maxNx}), wider than its shoulders (${sil.shoulder})`);
    assert.ok(Math.abs(sil.head.ry * 2 - 0.11) < 0.005 && Math.abs(sil.hemNy - sil.shoulderNy - 0.6) < 0.03, 'head about 11 % of the height, coat about 60 %');
    // No gap row anywhere from the crown to the feet: the figure is one continuous grid (no neck stalk, no belt gap).
    const rowIdx = [...rows.keys()].sort((a, b) => a - b);
    for (let r = rowIdx[0] ?? 0; r <= (rowIdx[rowIdx.length - 1] ?? 0); r++) assert.ok(rows.has(r), `${rig.id} has an empty grid row at ${r} (ny ${(-r * pitch).toFixed(3)})`);
    // The coat flares monotonically from the shoulder point to the hem.
    for (let ny = sil.shoulderNy; ny < sil.hemNy; ny += 0.01) assert.ok(coatHalfWidth(sil, ny + 0.01) >= coatHalfWidth(sil, ny), `${rig.id} coat narrows at ${ny}`);
    if (kindOf(rig.id) !== 'woman') {
      assert.ok(sil.shoulder > womanSil.shoulder, 'the men are a little wider at the shoulders');
      assert.ok(Math.max(...sil.hair.map(([x]) => Math.abs(x))) <= sil.head.rx + 0.015, 'the men wear a short cap: no hair widening');
    }
  }
  // The woman: her dot grid at a 4 px pitch, the body light and the halos.
  const woman = rigs.walkers.find((r) => r.id === 'actors:passersby/woman')!;
  const sil = womanSil;
  const pitch = DOT_PITCH_PX / 1080 / woman.homeHeight;
  const beltRow = Math.round(-sil.beltNy / pitch);
  type Dot = { nx: number; ny: number; a: number; limb: number };
  const rows = new Map<number, Dot[]>();
  const headA = new Set<number>();
  let halos = 0, cores = 0, minCore = 1, minOffBelt = 1, minChest = 1, maxA = 0;
  for (let i = 0; i < woman.end - woman.start; i++) {
    const a = woman.baseA[i] ?? 0, limb = woman.limb[i] ?? 0, nx = woman.nx[i] ?? 0, ny = woman.ny[i] ?? 0;
    maxA = Math.max(maxA, a);
    if ((woman.baseSize[i] ?? 0) > MAX_CORE_PX) {
      halos++;
      assert.ok(isNearHalo(a), `woman halo ${i} alpha ${a}`);
      assert.ok(limb === 0 || limb === 3, 'halos sit under the coat and the head only');
      continue;
    }
    cores++;
    minCore = Math.min(minCore, a);
    const row = Math.round(-ny / pitch);
    if (row !== beltRow) minOffBelt = Math.min(minOffBelt, a);
    if (limb === 0 && Math.abs(nx) < 0.4 * coatHalfWidth(sil, ny) && ny >= -0.8 && ny <= -0.62) minChest = Math.min(minChest, a);
    if (limb === 3) headA.add(Math.round(a * 100));
    (rows.get(row) ?? rows.set(row, []).get(row)!).push({ nx, ny, a, limb });
  }
  assert.ok(headA.size <= 2, `head and hair alpha is uniform (${[...headA].join(',')})`);
  assert.ok(HEAD_LIGHT > 0.8 && [...rows.values()].flat().filter((d) => d.limb === 3).length >= 90, 'the head is a dense cluster');
  assert.ok(minChest >= 0.95 && maxA <= 1, `the chest core is alpha 0.95–1.0 (${minChest}..${maxA})`);
  assert.ok(minOffBelt >= 0.7 && minCore >= 0.5, `the body light falls toward the hem and the edges but never goes dark (${minOffBelt}, belt row ${minCore})`);
  assert.ok(halos > cores * 0.5 && halos < cores, `halo under the coat and head dots (${halos} halos, ${cores} dots)`);
  // Across the torso no interior gap wider than one pitch: every grid row from the hem up to the shoulder point
  // is a full run of cells inside 85 % of the coat's half-width whatever their limb (no seam; above the shoulder
  // point the hair locks lie over the coat, so the scan stops there), and no row is missing (no belt gap).
  let torsoRows = 0, maxGap = 0;
  for (let r = Math.round(-sil.hemNy / pitch) + 1; r <= Math.floor(-sil.shoulderNy / pitch); r++) {
    const ny = -r * pitch;
    const hw = coatHalfWidth(sil, ny);
    const xs = (rows.get(r) ?? []).filter((d) => Math.abs(d.nx) <= 0.85 * hw).map((d) => d.nx).sort((a, b) => a - b);
    assert.ok(xs.length >= 2, `torso row ${r} (ny ${ny.toFixed(3)}) is empty`);
    for (let i = 1; i < xs.length; i++) maxGap = Math.max(maxGap, (xs[i] ?? 0) - (xs[i - 1] ?? 0));
    torsoRows++;
  }
  assert.ok(torsoRows > 50 && maxGap <= pitch * 1.01, `widest interior gap across the torso ${maxGap / pitch} pitches over ${torsoRows} rows`);
  // The belt is a one-row dimming: that row keeps BELT_DIM of its neighbours' alpha and every cell of it is present.
  const beltA = mean((rows.get(beltRow) ?? []).filter((d) => d.limb === 0).map((d) => d.a));
  const besideA = mean([...(rows.get(beltRow - 1) ?? []), ...(rows.get(beltRow + 1) ?? [])].filter((d) => d.limb === 0).map((d) => d.a));
  assert.ok(Math.abs(beltA / besideA - BELT_DIM) < 0.05, `belt row alpha ratio ${beltA / besideA}`);
  // No neck stalk: every row from the shoulder point up to the head's centre has a dot at the centre column.
  for (let r = Math.round(-sil.shoulderNy / pitch); r <= Math.round(-sil.head.cy / pitch); r++) {
    assert.ok((rows.get(r) ?? []).some((d) => Math.abs(d.nx) < pitch), `the centre column is empty at row ${r} (ny ${(-r * pitch).toFixed(3)}): a neck gap`);
  }
  // The bounding box is wider at the hem than at the shoulders.
  const widthNear = (ny0: number) => Math.max(0, ...[...rows.entries()].filter(([r]) => Math.abs(-r * pitch - ny0) <= pitch).flatMap(([, dots]) => dots.map((d) => Math.abs(d.nx))));
  const shoulderW = widthNear(sil.shoulderNy), hemW = widthNear(sil.hemNy - pitch);
  assert.ok(hemW > shoulderW * 1.2, `hem half-width ${hemW} vs shoulder half-width ${shoulderW}`);
  // Legs taper into boots: the legs are narrower at the ankle than under the hem, and the boots are darker (dimmer) than the legs.
  const legDots = [...rows.values()].flat().filter((d) => d.limb === 1);
  const legSpan = (ny0: number) => { const xs = legDots.filter((d) => Math.abs(d.ny - ny0) <= pitch).map((d) => d.nx); return Math.max(...xs) - Math.min(...xs); };
  assert.ok(legSpan(sil.hemNy + 0.02) > legSpan(sil.bootNy - 0.02), 'each leg tapers toward the ankle');
  assert.ok(mean(legDots.filter((d) => d.ny > sil.bootNy).map((d) => d.a)) < mean(legDots.filter((d) => d.ny < sil.bootNy - 0.02).map((d) => d.a)), 'boots are darker than the legs');
  assert.equal(woman.homeHeight, 0.39);
  assert.equal(woman.homeFeet[1], 0.745);
  assert.equal(woman.facing, 'toward');
  assert.deepEqual([woman.startY, woman.endY, woman.travelS], [WOMAN_APPROACH.startY, WOMAN_APPROACH.endY, WOMAN_APPROACH.travelS]);
  assert.equal(woman.travelS, 8);
  // Her intro approach grows her about 1.6× (clip VB2) …
  const intro = walkerIntroOf(woman)!;
  const growth = walkerPose(woman, intro.startS + intro.travelS, false).height / walkerPose(woman, intro.startS + 0.01, false).height;
  assert.ok(growth >= 1.5 && growth <= 1.75, `growth ${growth}`);
  // … and so does every ordinary cycle after it.
  const cycle0 = intro.startS + intro.travelS + intro.holdS + WALKER_FADE_OUT_S + WALKER_GAP_S;
  const regular = walkerPose(woman, cycle0 + woman.travelS - 0.01, false).height / walkerPose(woman, cycle0 + 0.01, false).height;
  assert.ok(regular >= 1.5 && regular <= 1.75, `regular growth ${regular}`);
  assert.ok(walkerPose(woman, cycle0 + 4, false).feetY > walkerPose(woman, cycle0 + 1, false).feetY, 'the woman approaches');
  // The far walkers have no intro and keep the ordinary cycle.
  for (const r of rigs.walkers) if (r !== woman) assert.equal(walkerIntroOf(r), undefined);
});

test('the woman is whole and visible from her birth window through t = 20 s, then cycles (§9 A)', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const woman = seed33RigsOf(frame)!.walkers.find((r) => r.id === 'actors:passersby/woman')!;
  assert.deepEqual(walkerIntroOf(woman), womanIntro(12_000));
  const intro = womanIntro(12_000);
  assert.ok(Math.abs(intro.startS + intro.travelS + intro.holdS - (12 + WOMAN_DWELL_S)) < 1e-9, 'she stands until dwell seconds after the build completes');
  for (const t of [12, 17]) assert.ok(walkerPose(woman, t, false).fade > 0.8, `visible at t = ${t} s (fade ${walkerPose(woman, t, false).fade})`);
  // Whole: fade is 1 before her first bead is born (3 s) and stays 1 to 20 s; her feet reach the home position and stay.
  const births = Array.from(frame.store.birthMs.subarray(woman.start, woman.end));
  const firstBirth = Math.min(...births) / 1000;
  assert.ok(firstBirth >= 3 && walkerPose(woman, firstBirth, false).fade > 0.99, `whole at her first birth (${firstBirth} s)`);
  for (let t = firstBirth; t <= 20; t += 0.25) {
    const p = walkerPose(woman, t, false);
    assert.ok(p.fade > 0.99, `fade ${p.fade} at ${t}`);
    assert.ok(p.feetY >= WOMAN_APPROACH.startY - 1e-9 && p.feetY <= WOMAN_APPROACH.endY + 1e-9);
  }
  assert.ok(Math.abs(walkerPose(woman, 17, false).feetY - WOMAN_APPROACH.endY) < 1e-9 && walkerPose(woman, 17, false).stride === 0, 'standing at the near position at 17 s');
  assert.equal(walkerPose(woman, 5, false).stride, 1, 'walking during the approach');
  // Then the ordinary cycle: she fades, is away for the gap, comes back and keeps cycling.
  let gone = false, back = false;
  for (let t = 20; t < 60; t += 0.25) {
    const f = walkerPose(woman, t, false).fade;
    if (f === 0) gone = true;
    if (gone && f > 0.95) back = true;
  }
  assert.ok(gone && back, 'cycles after the dwell');
  // Through life: at 12 s and 17 s of life her beads carry their authored alpha.
  const life = createLife(frame);
  const maxAlphaAt = (seconds: number) => {
    while (life.clockMs < seconds * 1000 - 1e-6) stepLife(life, frame, 50, { reducedMotion: false });
    let m = 0;
    for (let k = woman.start; k < woman.end; k++) m = Math.max(m, frame.store.a[k] ?? 0);
    return m;
  };
  assert.ok(maxAlphaAt(12) > 0.95 && maxAlphaAt(17) > 0.95, 'life keeps her visible at 12 s and 17 s');
  // A zero-length build: visible at t = 5 s, mid-approach.
  const instant = buildSeed33Scene({ ...DEFAULT_SEED33, buildMs: 0 });
  const w0 = seed33RigsOf(instant)!.walkers.find((r) => r.id === 'actors:passersby/woman')!;
  assert.deepEqual(walkerIntroOf(w0), womanIntro(0));
  assert.ok(walkerPose(w0, 5, false).fade > 0.8, `visible at t = 5 s with buildMs 0 (fade ${walkerPose(w0, 5, false).fade})`);
  assert.ok(walkerPose(w0, 0, false).fade > 0.8, 'already walking at t = 0 when the scene is complete at 0');
  // The far walkers are present through the complete + 5 s still too.
  for (const id of ['actors:passersby/man', 'actors:passersby/third']) {
    const rig = seed33RigsOf(frame)!.walkers.find((r) => r.id === id)!;
    for (const t of [6, 12, 17, 20]) assert.ok(walkerPose(rig, t, false).fade > 0.8, `${id} visible at ${t} s`);
  }
});

test('life moves the seed-33 walkers and steps its tiles while leaving the arrival scene unchanged', () => {
  const frame = buildSeed33Scene(DEFAULT_SEED33);
  const life = createLife(frame);
  assert.ok(life.rigs && life.tiles, 'rigs and tile state found');
  const woman = life.rigs!.walkers.find((r) => r.id === 'actors:passersby/woman')!;
  const y0 = frame.store.y[woman.start] ?? 0;
  const tilesBefore = JSON.stringify(frame.tiles);
  for (let i = 0; i < 1200; i++) stepLife(life, frame, 16.7, { reducedMotion: false });
  assert.notEqual(frame.store.y[woman.start], y0, 'the woman moved');
  assert.notEqual(JSON.stringify(frame.tiles), tilesBefore, 'tiles swapped within 20 s');
  assert.ok(life.tiles!.total > 0);
  stepTiles(life.tiles!, frame, 16.7, life.clockMs + 16.7, { reducedMotion: false }); // the tile life is callable on its own
  const arrival = buildArrivalScene(DEFAULT_ARRIVAL);
  const arrivalLife = createLife(arrival);
  assert.equal(arrivalLife.tiles, null);
  assert.ok(arrivalLife.rigs && arrivalLife.rigs.walkers.length === 3);
});
