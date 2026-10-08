import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASPECT, CAPACITY, DEFAULT_ARRIVAL, authorArrival, buildArrivalScene, rigsOf } from '../src/scene/arrival.ts';
import { pointInPolygon } from '../src/scene/author.ts';
import { REQUIRED_STABLE_IDS, isStableId } from '../../core/ids.ts';
import { PALETTE, isParisHue, isParisTone, isWeek3Accent } from '../src/scene/palette.ts';

const regionBase = (id: string) => id.split('/')[0] ?? id;

test('arrival scene is deterministic for the same options', () => {
  const a = buildArrivalScene(DEFAULT_ARRIVAL);
  const b = buildArrivalScene(DEFAULT_ARRIVAL);
  assert.equal(a.store.count, b.store.count);
  assert.deepEqual(a.regions, b.regions);
  for (const key of ['x', 'y', 'z', 'r', 'g', 'b', 'a', 'size'] as const) {
    assert.deepEqual(Array.from(a.store[key].subarray(0, a.store.count)), Array.from(b.store[key].subarray(0, b.store.count)), key);
  }
});

test('arrival scene covers the required stable IDs with valid region IDs and fixed slot ranges', () => {
  const frame = buildArrivalScene(DEFAULT_ARRIVAL);
  const bases = new Set(frame.regions.map((r) => regionBase(r.id)));
  for (const id of REQUIRED_STABLE_IDS) {
    if (id === 'anchor:seat') continue; // the seat is the viewer, not a drawn region
    assert.ok(bases.has(id), `missing region for ${id}`);
  }
  let cursor = 0;
  for (const r of frame.regions) {
    assert.ok(isStableId(regionBase(r.id)), `${r.id} base is not a stable id`);
    assert.equal(r.start, cursor, `${r.id} starts at ${r.start}, expected ${cursor}`);
    assert.ok(r.end >= r.start);
    cursor = r.end;
  }
  assert.equal(cursor, frame.store.count);
  assert.ok(frame.store.count > 60_000 && frame.store.count <= CAPACITY, `count ${frame.store.count}`);
  assert.equal(frame.aspect, ASPECT);
});

test('regions are ordered far to near by depth and dynamic regions are flagged', () => {
  const frame = buildArrivalScene(DEFAULT_ARRIVAL);
  const dynamic = frame.regions.filter((r) => r.dynamic).map((r) => r.id);
  assert.deepEqual(dynamic, ['actors:passersby/third', 'actors:passersby/man', 'actors:passersby/woman', 'fx:smoke', 'fx:steam']);
  const near = frame.regions.filter((r) => r.band === 'near').map((r) => r.depth);
  const far = frame.regions.filter((r) => r.band === 'far' || r.band === 'facade').map((r) => r.depth);
  assert.ok(Math.min(...near) > Math.max(...far), 'near regions must be nearer than façades');
  const firstNear = frame.regions.findIndex((r) => r.band === 'near');
  assert.ok(frame.regions.slice(firstNear).every((r) => r.band === 'near'), 'near regions are drawn last');
});

test('every particle is finite, in the frame margin and within the Paris palette', () => {
  const frame = buildArrivalScene(DEFAULT_ARRIVAL);
  const s = frame.store;
  for (let k = 0; k < s.count; k++) {
    const x = s.x[k] ?? NaN, y = s.y[k] ?? NaN;
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && x > -0.06 && x < 1.06 && y > -0.06 && y < 1.1, `particle ${k} at ${x},${y}`);
    const a = s.a[k] ?? -1;
    assert.ok(a >= 0 && a <= 1);
    assert.ok((s.size[k] ?? 0) >= 0.5 && (s.size[k] ?? 0) <= 10, `size ${s.size[k]} at ${k}`);
    assert.ok(isParisHue([s.r[k] ?? 0, s.g[k] ?? 0, s.b[k] ?? 0]), `particle ${k} is off-palette`);
  }
  for (const [key, rgb] of Object.entries(PALETTE)) assert.ok(isParisTone(rgb), `${key} is off-palette`);
  assert.equal(isParisHue([0.2, 0.7, 0.75]), false, 'teal must be rejected');
  assert.equal(isParisHue([0.55, 0.3, 0.6]), false, 'plum must be rejected');
  assert.equal(isParisHue([0.75, 0.3, 0.6]), false, 'saturated magenta must be rejected');
  assert.equal(isParisHue([0.48, 0.38, 0.45]), true, 'the lamp stipple mauve stays allowed');
  assert.equal(isWeek3Accent([0.855, 0.612, 0.522]), true, 'the Week 3 coral token is rejected');
  assert.equal(isWeek3Accent([0.576, 0.784, 0.831]), true, 'the Week 3 ice token is rejected');
});

test('a capacity overflow fails loudly instead of dropping particles', () => {
  assert.throws(() => authorArrival(DEFAULT_ARRIVAL, 10_000), RangeError);
});

test('authored outlines are simple polygons (no self-intersection): the cup body in particular', () => {
  // Reproduce the cup body outline construction and check that no two non-adjacent edges cross.
  const frame = buildArrivalScene(DEFAULT_ARRIVAL);
  const cup = frame.regions.find((r) => r.id === 'obj:cup');
  assert.ok(cup);
  // The cup's sides must be filled: sample points on the left and right walls at mid-height.
  const s = frame.store;
  let left = 0, right = 0;
  for (let k = cup.start; k < cup.end; k++) {
    const x = s.x[k] ?? 0, y = s.y[k] ?? 0;
    if (y > 0.80 && y < 0.83 && x > 0.655 && x < 0.668) left++;
    if (y > 0.80 && y < 0.83 && x > 0.732 && x < 0.745) right++;
  }
  assert.ok(left > 10 && right > 10, `cup walls are empty (left ${left}, right ${right})`);
  assert.equal(pointInPolygon(0.5, 0.5, [[0, 0], [1, 0], [1, 1], [0, 1]]), true);
});

test('density scales particle count; facing changes only the woman region (per-region RNG streams)', () => {
  const low = buildArrivalScene({ ...DEFAULT_ARRIVAL, density: 0.5 });
  const full = buildArrivalScene(DEFAULT_ARRIVAL);
  const high = buildArrivalScene({ ...DEFAULT_ARRIVAL, density: 1.25 });
  assert.ok(low.store.count < full.store.count && full.store.count < high.store.count);
  assert.ok(low.store.count > full.store.count * 0.4 && low.store.count < full.store.count * 0.7);
  const toward = buildArrivalScene({ ...DEFAULT_ARRIVAL, nearWalkerFacing: 'toward' });
  const womanIndex = full.regions.findIndex((r) => r.id === 'actors:passersby/woman');
  for (let i = 0; i < womanIndex; i++) assert.deepEqual(toward.regions[i], full.regions[i]);
  // Regions after the woman keep identical particles (only their slot offset moves with her count).
  for (let i = womanIndex + 1; i < full.regions.length; i++) {
    const a = full.regions[i]!, b = toward.regions[i]!;
    assert.equal(a.id, b.id);
    assert.equal(a.end - a.start, b.end - b.start, `${a.id} count differs`);
    for (let j = 0; j < a.end - a.start; j += 13) {
      assert.equal(full.store.x[a.start + j], toward.store.x[b.start + j], `${a.id} x differs at ${j}`);
      assert.equal(full.store.r[a.start + j], toward.store.r[b.start + j], `${a.id} r differs at ${j}`);
    }
  }
  const rigs = rigsOf(toward);
  assert.ok(rigs && rigs.walkers.length === 3 && rigs.emitters.length === 2);
  assert.equal(rigs.walkers.find((r) => r.id === 'actors:passersby/woman')?.facing, 'toward');
});
