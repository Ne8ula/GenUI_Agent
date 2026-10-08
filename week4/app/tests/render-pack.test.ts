import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/scene/store.ts';
import { BIRTH_RAMP_MS } from '../src/scene/types.ts';
import {
  BYTES_PER_PARTICLE,
  FLOATS_PER_PARTICLE,
  OFFSET_BIRTH,
  OFFSET_COLOR,
  OFFSET_MOTION,
  OFFSET_PHASE,
  OFFSET_POS,
  OFFSET_SEED,
  OFFSET_SIZE,
  birthRamp,
  canvas2dRadius,
  canvas2dStride,
  clampPointSize,
  deviceDiameter,
  grainHash,
  grainLuminance,
  grainNoise,
  grainRgb,
  grainTile,
  packParticles,
  particleAlpha,
  particleShape,
  shimmerFactor,
  smoothstep,
  stridedCount,
} from '../src/render/pack.ts';
import { CANVAS2D_BUDGET, GRAIN_AMPLITUDE, GRAIN_WARMTH, MAX_SQUASH, MIN_ALPHA, SHIMMER_BASE, SHIMMER_DEPTH, SOFT_EDGE } from '../src/render/paper.ts';

function sampleStore(n: number) {
  const s = createStore(n + 4);
  for (let i = 0; i < n; i++) {
    const k = s.count++;
    s.x[k] = i / n;
    s.y[k] = 1 - i / n;
    s.z[k] = -i;
    s.r[k] = 0.1 * (i % 7);
    s.g[k] = 0.5;
    s.b[k] = 0.9;
    s.a[k] = i % 5 === 0 ? 0 : 0.8; // every fifth slot is invisible
    s.size[k] = 2 + (i % 3);
    s.phase[k] = (i * 0.37) % 1;
    s.motion[k] = i % 2 === 0 ? 0 : 0.25;
    s.birthMs[k] = i * 100;
  }
  return s;
}

test('layout: eleven floats per particle, 44-byte stride, lanes in order pos, size, seed, colour, phase, motion, birth', () => {
  assert.equal(FLOATS_PER_PARTICLE, 11);
  assert.equal(BYTES_PER_PARTICLE, 44);
  assert.deepEqual([OFFSET_POS, OFFSET_SIZE, OFFSET_SEED, OFFSET_COLOR, OFFSET_PHASE, OFFSET_MOTION, OFFSET_BIRTH], [0, 8, 12, 16, 32, 36, 40]);
  assert.equal(OFFSET_BIRTH + 4, BYTES_PER_PARTICLE);
});

test('packParticles keeps slot order, skips invisible slots, carries the slot as seed and is deterministic', () => {
  const store = sampleStore(20);
  const out = new Float32Array(store.capacity * FLOATS_PER_PARTICLE);
  const packed = packParticles(store, out);
  assert.equal(packed, 16); // 20 slots minus slots 0, 5, 10, 15
  // First packed particle is slot 1 (slot 0 is invisible).
  assert.equal(out[3], 1);
  assert.ok(Math.abs(out[0]! - 1 / 20) < 1e-6);
  assert.ok(Math.abs(out[7]! - 0.8) < 1e-6);
  // New lanes travel with the particle: slot 1 has phase 0.37, motion 0.25, birth 100 ms.
  assert.ok(Math.abs(out[8]! - 0.37) < 1e-6);
  assert.ok(Math.abs(out[9]! - 0.25) < 1e-6);
  assert.equal(out[10], 100);
  // Second packed particle is slot 2: static (motion 0) and born at 200 ms; the stored alpha is packed unramped.
  assert.equal(out[FLOATS_PER_PARTICLE + 3], 2);
  assert.equal(out[FLOATS_PER_PARTICLE + 9], 0);
  assert.equal(out[FLOATS_PER_PARTICLE + 10], 200);
  assert.ok(Math.abs(out[FLOATS_PER_PARTICLE + 7]! - 0.8) < 1e-6);
  // Seeds ascend strictly: order is preserved.
  for (let p = 1; p < packed; p++) assert.ok(out[p * FLOATS_PER_PARTICLE + 3]! > out[(p - 1) * FLOATS_PER_PARTICLE + 3]!);
  const again = new Float32Array(out.length);
  assert.equal(packParticles(store, again), packed);
  assert.deepEqual(Array.from(again.subarray(0, packed * FLOATS_PER_PARTICLE)), Array.from(out.subarray(0, packed * FLOATS_PER_PARTICLE)));
});

test('packParticles honours the alpha threshold and refuses an undersized buffer', () => {
  const store = createStore(3);
  store.count = 3;
  store.a[0] = MIN_ALPHA; // not above threshold → skipped
  store.a[1] = MIN_ALPHA + 1e-4;
  store.a[2] = Number.NaN; // never drawn
  const out = new Float32Array(3 * FLOATS_PER_PARTICLE);
  assert.equal(packParticles(store, out), 1);
  assert.equal(out[3], 1);
  assert.throws(() => packParticles(store, new Float32Array(FLOATS_PER_PARTICLE)), RangeError);
});

test('deviceDiameter scales by frame height / 1080 with a 1 px floor; clampPointSize honours the range', () => {
  assert.equal(deviceDiameter(3, 1080), 3);
  assert.equal(deviceDiameter(3, 540), 1.5);
  assert.equal(deviceDiameter(3, 100), 1);
  assert.equal(deviceDiameter(0, 1080), 1);
  assert.equal(deviceDiameter(Number.NaN, 1080), 1);
  assert.equal(clampPointSize(0.5, [1, 1023]), 1);
  assert.equal(clampPointSize(5000, [1, 1023]), 1023);
  assert.equal(clampPointSize(12, [1, 1023]), 12);
});

test('canvas2dRadius matches the soft-disc coverage: r·(1 − SOFT_EDGE/2)', () => {
  assert.equal(SOFT_EDGE, 0.25);
  assert.ok(Math.abs(canvas2dRadius(10) - 4.375) < 1e-12);
  assert.ok(Math.abs(canvas2dRadius(1.6) - 0.7) < 1e-12);
});

test('canvas2dStride never exceeds the budget and is 1 within it', () => {
  assert.equal(CANVAS2D_BUDGET, 80_000);
  assert.equal(canvas2dStride(24_000), 1);
  assert.equal(canvas2dStride(80_000), 1);
  assert.equal(canvas2dStride(80_001), 2);
  assert.equal(canvas2dStride(160_000), 2);
  assert.equal(canvas2dStride(160_001), 3);
  assert.equal(canvas2dStride(262_144), 4);
  for (let count = 1; count <= 262_144; count += 997) {
    const stride = canvas2dStride(count);
    assert.ok(stride >= 1);
    assert.ok(stridedCount(count, stride) <= CANVAS2D_BUDGET, `count ${count} stride ${stride}`);
    if (stride > 1) assert.ok(stridedCount(count, stride - 1) > CANVAS2D_BUDGET, `stride ${stride} is minimal for ${count}`);
  }
  assert.equal(stridedCount(0, 1), 0);
  assert.equal(stridedCount(7, 2), 4);
});

test('particleShape is bounded, deterministic and varies between slots', () => {
  const a = particleShape(42);
  const b = particleShape(42);
  const c = particleShape(43);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (let i = 0; i < 2000; i++) {
    const s = particleShape(i);
    assert.ok(s.squash >= 1 - MAX_SQUASH - 1e-12 && s.squash <= 1);
    assert.ok(s.angle >= 0 && s.angle < 2 * Math.PI);
  }
});

test('grain hash/noise are deterministic, bounded and not constant', () => {
  assert.equal(grainHash(10, 20, 7), grainHash(10, 20, 7));
  assert.notEqual(grainHash(10, 20, 7), grainHash(11, 20, 7));
  assert.notEqual(grainHash(10, 20, 7), grainHash(10, 20, 8));
  let min = 1;
  let max = 0;
  let sum = 0;
  const N = 64;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const n = grainNoise(x, y);
      assert.ok(n >= 0 && n < 1);
      const l = grainLuminance(n);
      assert.ok(l >= 1 - GRAIN_AMPLITUDE - 1e-12 && l <= 1 + GRAIN_AMPLITUDE + 1e-12);
      min = Math.min(min, n);
      max = Math.max(max, n);
      sum += n;
    }
  }
  assert.ok(max - min > 0.5, 'noise spans a useful range');
  assert.ok(Math.abs(sum / (N * N) - 0.5) < 0.03, 'noise is centred');
});

test('grainRgb and grainTile stay within paper ± (amplitude + warmth) and are deterministic', () => {
  const paper = [0.957, 0.937, 0.898] as const;
  const lo = 1 - GRAIN_AMPLITUDE - GRAIN_WARMTH;
  const hi = 1 + GRAIN_AMPLITUDE + GRAIN_WARMTH;
  const dark = grainRgb(paper, 0);
  const light = grainRgb(paper, 1);
  assert.ok(dark[0] < light[0] && dark[1] < light[1] && dark[2] < light[2]);
  // Darker grain is warmer: red/blue ratio rises as n falls.
  assert.ok(dark[0] / dark[2] > light[0] / light[2]);
  const size = 64;
  const tile = grainTile(size, paper);
  assert.equal(tile.length, size * size * 4);
  assert.deepEqual(Array.from(tile.subarray(0, 64)), Array.from(grainTile(size, paper).subarray(0, 64)));
  let sumLum = 0;
  for (let i = 0; i < tile.length; i += 4) {
    assert.equal(tile[i + 3], 255);
    for (let c = 0; c < 3; c++) {
      const v = tile[i + c]! / 255;
      assert.ok(v >= paper[c]! * lo - 1 / 255 && v <= Math.min(1, paper[c]! * hi) + 1 / 255, `channel ${c} = ${v}`);
    }
    sumLum += (tile[i]! + tile[i + 1]! + tile[i + 2]!) / (3 * 255);
  }
  const paperLum = (paper[0] + paper[1] + paper[2]) / 3;
  assert.ok(Math.abs(sumLum / (size * size) - paperLum) < 0.004, 'grain averages back to the paper colour');
  assert.throws(() => grainTile(0, paper), RangeError);
});

test('smoothstep and birthRamp: 0 before birth, 1 after BIRTH_RAMP_MS, monotonic and smooth in between', () => {
  assert.equal(BIRTH_RAMP_MS, 400);
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(birthRamp(1000, 999), 0);
  assert.equal(birthRamp(1000, 1000), 0);
  assert.equal(birthRamp(1000, 1400), 1);
  assert.equal(birthRamp(1000, 5000), 1);
  assert.ok(Math.abs(birthRamp(1000, 1200) - 0.5) < 1e-12);
  let prev = 0;
  for (let t = 1000; t <= 1400; t += 10) {
    const v = birthRamp(1000, t);
    assert.ok(v >= prev && v >= 0 && v <= 1, `t=${t}`);
    prev = v;
  }
  // Birth at 0 with the clock at 0: invisible at the first instant, visible by 400 ms.
  assert.equal(birthRamp(0, 0), 0);
  assert.equal(birthRamp(0, 400), 1);
});

test('shimmerFactor: 1 for static particles, bounded 0.55..1 otherwise, periodic in motion and offset by phase', () => {
  assert.equal(SHIMMER_BASE, 0.55);
  assert.equal(SHIMMER_DEPTH, 0.45);
  assert.equal(shimmerFactor(0, 0.3, 12.5), 1);
  assert.equal(shimmerFactor(-1, 0.3, 12.5), 1);
  assert.equal(shimmerFactor(Number.NaN, 0.3, 12.5), 1);
  let min = 2;
  let max = -1;
  for (let t = 0; t < 10; t += 0.01) {
    const f = shimmerFactor(0.3, 0.2, t);
    assert.ok(f >= SHIMMER_BASE - 1e-12 && f <= 1 + 1e-12);
    min = Math.min(min, f);
    max = Math.max(max, f);
  }
  assert.ok(min < 0.56 && max > 0.99, 'the shimmer reaches both ends of its range');
  // Phase 0.25 at t=0 is the sine peak (factor 1); one full period later the same.
  assert.ok(Math.abs(shimmerFactor(0.5, 0.25, 0) - 1) < 1e-12);
  assert.ok(Math.abs(shimmerFactor(0.5, 0.25, 2) - 1) < 1e-9);
  // Neighbours with different phases do not pulse together.
  assert.notEqual(shimmerFactor(0.5, 0.1, 1), shimmerFactor(0.5, 0.6, 1));
  // The same inputs give the same factor: time-driven, never wall-clock-driven.
  assert.equal(shimmerFactor(0.17, 0.42, 3.3), shimmerFactor(0.17, 0.42, 3.3));
});

test('particleAlpha = stored alpha × birth ramp × shimmer, clamped at 1', () => {
  assert.equal(particleAlpha(0.8, 0, 0, 1000, 500), 0);
  assert.ok(Math.abs(particleAlpha(0.8, 0, 0, 1000, 1400) - 0.8) < 1e-12);
  assert.ok(Math.abs(particleAlpha(0.8, 0, 0, 1000, 1200) - 0.4) < 1e-12);
  assert.ok(Math.abs(particleAlpha(0.8, 0.5, 0.25, 0, 2000) - 0.8) < 1e-9); // shimmer peak at t = 2 s
  assert.ok(Math.abs(particleAlpha(0.8, 0.5, 0.75, 0, 2000) - 0.8 * 0.55) < 1e-9); // shimmer trough
  assert.ok(Math.abs(particleAlpha(3, 0, 0, 0, 5000) - 1) < 1e-12);
});
