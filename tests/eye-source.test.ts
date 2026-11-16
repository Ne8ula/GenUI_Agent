import assert from 'node:assert/strict';
import test from 'node:test';
import { createFits, TEAR_SLOTS, type Mood } from '../src/astral/eye-fits.ts';
import { rasterizeWeek1Eye } from '../src/astral/eye-source.ts';

const W = 160, H = 80;
const pose = { time: 1, energy: 0.3, gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0, quiet: true };
const at = (data: Uint8ClampedArray, x: number, y: number) => {
  const i = (Math.round(y) * W + Math.round(x)) * 4;
  return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! };
};

test('masks mode: the aperture and the iris ring around a dark square pupil, for the particle eye', () => {
  const { data, landmarks } = rasterizeWeek1Eye(W, H, { ...pose, masks: true });
  const centre = landmarks[10]!, rim = landmarks[11]!, corner = landmarks[15]!;
  const radius = Math.hypot(rim.x - centre.x, rim.y - centre.y);
  const pupil = at(data, centre.x, centre.y);
  assert.equal(pupil.g, 255, 'the pupil is inside the open aperture');
  assert.equal(pupil.b, 0, 'the pupil is not part of the iris ring');
  assert.ok(pupil.r < 40, 'the pupil is dark');
  // between the square pupil's corner and the iris rim, straight out to the side
  const ring = at(data, centre.x + (Math.abs(corner.x - centre.x) + radius) / 2, centre.y);
  assert.ok(ring.b > 200, 'the iris ring is marked');
  assert.equal(at(data, 2, 2).g, 0, 'the far corner is skin, not aperture');
});

test('closed lids: no aperture and no iris anywhere', () => {
  const { data } = rasterizeWeek1Eye(W, H, { ...pose, closure: 1, masks: true });
  let open = 0;
  for (let i = 0; i < W * H; i++) open = Math.max(open, data[i * 4 + 1]!, data[i * 4 + 2]!);
  assert.ok(open < 40, `aperture or iris still showing: ${open}`);
});

test('default mode is the unchanged Week 1 picture: dithered phosphor, never masks', () => {
  const { data } = rasterizeWeek1Eye(W, H, pose);
  for (let i = 0; i < W * H; i++) {
    const r = data[i * 4]!, g = data[i * 4 + 1]!;
    // phosphor red with green at about 0.23 of it, on a near-black background
    assert.ok(g <= Math.round(r * 0.23) + 4, `pixel ${i} is not the phosphor colour`);
  }
});

// The fit scheduler (eye-fits.ts): the convulsions of the torn eye.

// A seeded generator, so a failure can be replayed.
const seeded = (seed: number) => () => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32);
const idle: Mood = { gap: 2.6, length: 0.8, power: 0.85, rest: 0.14, tears: true };
const thinking: Mood = { gap: 0.45, length: 1.6, power: 1, rest: 0.42, tears: true };
const listening: Mood = { gap: Infinity, length: 0, power: 0, rest: 0.05, tears: false };

function run(mood: Mood, seconds: number, seed = 7) {
  const fits = createFits(seeded(seed));
  fits.setMood(mood, 0);
  const onsets: number[] = [];
  let calm = true, maxTears = 0, maxShift = 0, minLevel = 1, maxLevel = 0;
  for (let frame = 0, time = 0; time < seconds; frame++, time = frame / 60) {
    fits.update(time, 1 / 60);
    minLevel = Math.min(minLevel, fits.level);
    maxLevel = Math.max(maxLevel, fits.level);
    if (calm && fits.level > 0.5) onsets.push(time);
    calm = fits.level < 0.25;
    maxTears = Math.max(maxTears, fits.tears.length);
    for (const tear of fits.tears) maxShift = Math.max(maxShift, Math.abs(tear.dx), Math.abs(tear.dy), Math.abs(tear.angle));
    for (const value of fits.jolt) assert.ok(Number.isFinite(value));
  }
  return { fits, onsets, maxTears, maxShift, minLevel, maxLevel };
}

test('fits come in bursts and lulls that never settle into a rhythm', () => {
  const { onsets, minLevel, maxLevel } = run(idle, 240);
  assert.ok(onsets.length > 20, `too few fits: ${onsets.length}`);
  const gaps = onsets.slice(1).map((t, i) => t - onsets[i]!);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const spread = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length) / mean;
  assert.ok(spread > 0.5, `the lulls are too regular: spread ${spread.toFixed(2)}`);
  assert.ok(minLevel >= 0 && maxLevel <= 1, 'level stays within 0..1');
  assert.ok(maxLevel > 0.6 && minLevel < 0.2, 'it both rages and rests');
});

test('the wildest phase stays bounded: never more pieces than the shader takes, never thrown off the quad', () => {
  const { maxTears, maxShift } = run(thinking, 120, 3);
  assert.ok(maxTears > 2, 'pieces tear');
  assert.ok(maxTears <= TEAR_SLOTS, `${maxTears} pieces`);
  // the quad the eye is drawn on reaches 2.2 eye widths either side of the centre
  assert.ok(maxShift > 0.6 && maxShift < 2.2, `a piece flew ${maxShift.toFixed(2)} eye widths`);
});

test('listening never tears and stays quiet; switching to it lets every torn piece go', () => {
  assert.equal(run(listening, 60).maxTears, 0);
  assert.ok(run(listening, 60).maxLevel <= 0.05);
  const { fits } = run(thinking, 5, 11);
  fits.setMood(listening, 5);
  for (let frame = 1; frame <= 60; frame++) fits.update(5 + frame / 60, 1 / 60);
  assert.equal(fits.tears.length, 0, 'pieces still torn a second after the microphone went live');
  assert.ok(fits.level <= 0.05, `level ${fits.level}`);
});
