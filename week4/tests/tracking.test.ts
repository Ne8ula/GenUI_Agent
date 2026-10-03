import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_IPD_M, HeadTracker, OneEuro, calibrate, estimateEye, toScreenEye } from '../core/tracking.ts';
import type { CameraModel, EyeObservation } from '../core/tracking.ts';
import type { Vec3 } from '../core/projection.ts';

const cam: CameraModel = { imageWidthPx: 1280, imageHeightPx: 720, horizontalFovDeg: 70, offset: [0, 0.18, 0], mirrored: true, assumedIpdM: DEFAULT_IPD_M };
const focal = 640 / Math.tan((35 * Math.PI) / 180);

// Synthetic forward model: where would eyes at camera-frame position (x, y, z) appear?
function synth(x: number, y: number, z: number): EyeObservation {
  const camX = cam.mirrored ? -x : x;
  const u = (camX * focal) / z + 640;
  const v = (-(y - 0.18) * focal) / z + 360;
  const half = (DEFAULT_IPD_M / 2) * (focal / z);
  return { leftEye: [(u - half) / 1280, v / 720], rightEye: [(u + half) / 1280, v / 720] };
}
const neutral: Vec3 = [0, 0.03, 0.6];

function calibration() {
  const samples = Array.from({ length: 20 }, (_, i) => estimateEye(synth(0.001 * (i % 3), 0.03, 0.6), cam));
  const r = calibrate(samples, neutral);
  assert.ok(r.ok);
  return r.calibration;
}

test('pose estimate recovers synthetic position, including the mirrored sign', () => {
  const e = estimateEye(synth(0.05, 0.02, 0.65), cam);
  assert.ok(e);
  assert.ok(Math.abs(e[0] - 0.05) < 1e-9 && Math.abs(e[1] - 0.02) < 1e-9 && Math.abs(e[2] - 0.65) < 1e-9);
  const right = estimateEye(synth(0.1, 0.03, 0.6), cam);
  assert.ok(right && right[0] > 0, 'moving to the viewer\'s right is +x on screen');
});

test('degenerate observations are rejected', () => {
  assert.equal(estimateEye({ leftEye: [0.5, 0.5], rightEye: [0.5, 0.5] }, cam), null);
  assert.equal(estimateEye({ leftEye: [Number.NaN, 0.5], rightEye: [0.6, 0.5] }, cam), null);
  assert.equal(estimateEye({ leftEye: [9, 0.5], rightEye: [0.6, 0.5] }, cam), null);
  assert.equal(estimateEye(synth(0, 0, 0.6), { ...cam, horizontalFovDeg: 0 }), null);
});

test('calibration needs enough stable samples and a sane design neutral', () => {
  assert.equal(calibrate([estimateEye(synth(0, 0, 0.6), cam)], neutral).ok, false);
  const jittery = Array.from({ length: 20 }, (_, i) => estimateEye(synth(i % 2 ? 0.08 : -0.08, 0.03, 0.6), cam));
  assert.deepEqual(calibrate(jittery, neutral), { ok: false, reason: 'unstable' });
  assert.deepEqual(calibrate(Array(20).fill(null), neutral), { ok: false, reason: 'too_few_samples' });
  assert.deepEqual(calibrate(Array(20).fill([0, 0, 0.6]), [0, 0, 0]), { ok: false, reason: 'invalid' });
});

test('head box clamps movement relative to neutral', () => {
  const cal = calibration();
  const far = toScreenEye([1, -1, 3], cal);
  assert.ok(Math.abs(far[0] - (neutral[0] + 0.12)) < 1e-9);
  assert.ok(Math.abs(far[1] - (neutral[1] - 0.08)) < 1e-9);
  assert.ok(Math.abs(far[2] - (neutral[2] + 0.12)) < 1e-9);
});

test('One-Euro smoothing reduces jitter, converges, and ignores duplicate timestamps', () => {
  const f = new OneEuro(1, 0.3, 1);
  const out: number[] = [];
  for (let i = 0; i < 120; i++) out.push(f.filter(0.05 + (i % 2 ? 0.004 : -0.004), i * 33));
  const tail = out.slice(-20);
  assert.ok(Math.max(...tail) - Math.min(...tail) < 0.004, 'smoothed jitter is below raw jitter');
  const g = new OneEuro();
  g.filter(0, 0);
  const a = g.filter(1, 100);
  assert.equal(g.filter(5, 100), a);
  assert.equal(g.filter(5, 50), a);
  let v = 0;
  for (let i = 2; i < 200; i++) v = g.filter(1, i * 50);
  assert.ok(Math.abs(v - 1) < 1e-3);
});

test('tracking loss holds, eases to neutral over ~0.8 s, then resumes without a jump', () => {
  const cal = calibration();
  const tr = new HeadTracker(cal);
  let t = 0;
  let pose: Vec3 = neutral;
  for (; t < 1000; t += 33) pose = tr.update(estimateEye(synth(0.1, 0.03, 0.6), cam), t);
  assert.equal(tr.status, 'tracking');
  assert.ok(pose[0] > 0.08);
  const leaned = pose;
  // Short dropout: pose is held.
  assert.deepEqual(tr.update(null, t + 100), leaned);
  // Longer loss: eases toward neutral, monotonically, finishing within ~0.8 s.
  let prevX = leaned[0];
  let maxStep = 0;
  for (let k = t + 250; k <= t + 1200; k += 16) {
    const p = tr.update(null, k);
    assert.ok(p[0] <= prevX + 1e-12);
    maxStep = Math.max(maxStep, prevX - p[0]);
    prevX = p[0];
  }
  assert.equal(tr.status, 'neutral');
  assert.ok(Math.abs(prevX - neutral[0]) < 1e-9);
  assert.ok(maxStep < 0.01, `ease step ${maxStep} m per frame`);
  // Resume far from neutral: no single-frame jump.
  let last = tr.update(null, t + 1300);
  let worst = 0;
  for (let k = t + 1316; k < t + 2000; k += 16) {
    const p = tr.update(estimateEye(synth(-0.1, 0.03, 0.6), cam), k);
    worst = Math.max(worst, Math.abs(p[0] - last[0]));
    last = p;
    for (const c of p) assert.ok(Number.isFinite(c));
  }
  assert.ok(worst < 0.03, `resume step ${worst}`);
  assert.equal(tr.status, 'tracking');
  assert.ok(last[0] < -0.08);
});

test('non-finite poses are treated as loss, never propagated', () => {
  const tr = new HeadTracker(calibration());
  for (let k = 0; k < 2000; k += 16) {
    const p = tr.update([Number.NaN, 0, Infinity], k);
    assert.ok(p.every(Number.isFinite));
  }
});
