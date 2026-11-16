import assert from 'node:assert/strict';
import test from 'node:test';
import { INSPECT, INSPECT_NONE, boxDistance, nextInspect, rayBox, type Box, type InspectState, type Vec3 } from '../src/astral/inspect.ts';

const A: Box = { min: [-1, 0, -6], max: [1, 1, -5] };     // straight ahead, 5 m
const B: Box = { min: [4, 0, -6], max: [5, 1, -5] };      // off to the right
const FAR: Box = { min: [-1, 0, -20], max: [1, 1, -19] }; // ahead, beyond reach
const O: Vec3 = [0, 0.5, 0], AHEAD: Vec3 = [0, 0, -1];
const toward = (to: Vec3): Vec3 => { const d = [to[0] - O[0], to[1] - O[1], to[2] - O[2]], l = Math.hypot(...d); return [d[0]! / l, d[1]! / l, d[2]! / l]; };
const run = (frames: [Vec3, Vec3, number][], boxes = [A, B, FAR]) => frames.reduce<InspectState[]>((out, [p, d, t]) => [...out, nextInspect(out.at(-1) ?? INSPECT_NONE, boxes, p, d, t)], []);

test('ray and box: entry distance, inside is 0, a miss is null', () => {
  assert.equal(rayBox(O, AHEAD, A), 5);
  assert.equal(rayBox([0, 0.5, -5.5], AHEAD, A), 0);
  assert.equal(rayBox(O, [0, 0, 1], A), null);
  assert.equal(rayBox(O, [1, 0, 0], A), null);
  assert.equal(rayBox([0, 2, 0], AHEAD, A), null);   // parallel to the slab, outside it
  assert.equal(boxDistance([0, 0.5, -4], A), 1);
  assert.equal(boxDistance([0, 0.5, -5.5], A), 0);
});

test('looking steadily takes the hero only after the dwell; beyond reach never', () => {
  const s = run([[O, AHEAD, 0], [O, AHEAD, 0.2], [O, AHEAD, 0.39], [O, AHEAD, 0.41]]);
  assert.deepEqual(s.map(x => x.hero), [-1, -1, -1, 0]);
  const far = run([[O, AHEAD, 0], [O, AHEAD, 1]], [FAR]);
  assert.equal(far.at(-1)!.hero, -1);
});

test('coming within reach of a box answers at once, even looking away', () => {
  const s = run([[[0, 0.5, -5 + INSPECT.near / 2], [0, 0, 1], 0]]);
  assert.equal(s[0]!.hero, 0);
});

test('kept while it qualifies, released 0.8 s after it stops; a glance elsewhere does not flicker', () => {
  const s = run([
    [O, AHEAD, 0], [O, AHEAD, 0.5],                 // taken
    [O, toward([4.5, 0.5, -5.5]), 0.6],             // glance at B: A no longer qualifies, the clock starts
    [O, AHEAD, 0.7],                                // back on A before the release: kept, clock reset
    [O, toward([4.5, 0.5, -5.5]), 0.8], [O, toward([4.5, 0.5, -5.5]), 1.2], [O, toward([4.5, 0.5, -5.5]), 1.59],
    [O, toward([4.5, 0.5, -5.5]), 1.61],            // 0.81 s on B: A is let go, and B, dwelt on long enough, takes over
  ]);
  assert.deepEqual(s.map(x => x.hero), [-1, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(s[3]!.lostAt, null);
});

test('looking at nothing releases to none', () => {
  const s = run([[O, AHEAD, 0], [O, AHEAD, 0.5], [O, [0, 1, 0], 0.6], [O, [0, 1, 0], 1.5]]);
  assert.deepEqual(s.map(x => x.hero), [-1, 0, 0, -1]);
});
