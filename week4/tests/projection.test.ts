import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coupledEye, frustumMatrix, offAxisFrustum, projectPoint, screenFromWidth } from '../core/projection.ts';
import type { Vec3 } from '../core/projection.ts';

const screen = screenFromWidth(0.597, 2560, 1440); // synthetic 27" 16:9 panel
const centre: Vec3 = [0, 0, 0.6];
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test('screen calibration derives height from aspect and rejects implausible input', () => {
  close(screen.heightM, (0.597 * 1440) / 2560);
  for (const args of [[0, 1920, 1080], [3, 1920, 1080], [0.5, 0, 1080], [Number.NaN, 1920, 1080]] as const) {
    assert.throws(() => screenFromWidth(args[0], args[1], args[2]));
  }
});

test('frustum is symmetric with the eye centred', () => {
  const f = offAxisFrustum(centre, screen, 0.1, 100);
  close(f.left, -f.right);
  close(f.bottom, -f.top);
  const m = frustumMatrix(f);
  close(m[8] ?? 1, 0);
  close(m[9] ?? 1, 0);
});

test('asymmetry follows the head: moving right shifts the window left relative to the eye', () => {
  const f = offAxisFrustum([0.1, 0.05, 0.6], screen, 0.1, 100);
  assert.ok(Math.abs(f.left) > Math.abs(f.right), 'more screen lies to the eye\'s left');
  assert.ok(Math.abs(f.bottom) > Math.abs(f.top), 'more screen lies below the eye');
  const m = frustumMatrix(f);
  assert.ok((m[8] ?? 0) < 0 && (m[9] ?? 0) < 0);
});

test('points on the screen plane have zero parallax for any eye position', () => {
  const p: Vec3 = [0.06, -0.1, 0]; // the cup anchor
  for (const eye of [centre, [0.12, 0.08, 0.5], [-0.12, -0.08, 0.72]] as Vec3[]) {
    const r = projectPoint(eye, screen, p);
    close(r.screen[0], p[0], 1e-9);
    close(r.screen[1], p[1], 1e-9);
  }
});

test('far points move with the head and near points against it', () => {
  const far: Vec3 = [0, 0, -9];
  const near: Vec3 = [0, -0.05, 0.15];
  const a = projectPoint(centre, screen, far);
  const b = projectPoint([0.1, 0, 0.6], screen, far);
  assert.ok(b.screen[0] > a.screen[0]);
  const c = projectPoint(centre, screen, near);
  const d = projectPoint([0.1, 0, 0.6], screen, near);
  assert.ok(d.screen[0] < c.screen[0]);
  // Expected far shift: ex * d / (ez + d)
  close(b.screen[0] - a.screen[0], (0.1 * 9) / (0.6 + 9), 1e-9);
});

test('occlusion: along one eye ray, the nearer point has smaller depth and the same screen position', () => {
  const eye: Vec3 = [0.05, 0.02, 0.6];
  const dir: Vec3 = [-0.02, -0.03, -1];
  const at = (t: number): Vec3 => [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
  const n = projectPoint(eye, screen, at(0.7));
  const f = projectPoint(eye, screen, at(9));
  close(n.ndc[0], f.ndc[0], 1e-9);
  close(n.ndc[1], f.ndc[1], 1e-9);
  assert.ok(n.ndc[2] < f.ndc[2]);
});

test('all outputs are finite across the full head box', () => {
  for (const x of [-0.12, 0, 0.12]) for (const y of [-0.08, 0, 0.08]) for (const z of [0.48, 0.6, 0.72]) {
    const f = offAxisFrustum([x, y, z], screen, 0.05, 200);
    for (const v of frustumMatrix(f)) assert.ok(Number.isFinite(v));
    for (const p of [[0, 0, 0], [0.3, 0.17, -40], [-0.33, -0.12, -0.12]] as Vec3[]) {
      const r = projectPoint([x, y, z], screen, p);
      assert.ok(r.ndc.every(Number.isFinite));
    }
  }
});

test('degenerate inputs are rejected', () => {
  assert.throws(() => offAxisFrustum([0, 0, 0], screen, 0.1, 10));
  assert.throws(() => offAxisFrustum([0, 0, -0.5], screen, 0.1, 10));
  assert.throws(() => offAxisFrustum([Number.NaN, 0, 0.6], screen, 0.1, 10));
  assert.throws(() => offAxisFrustum(centre, screen, 0, 10));
  assert.throws(() => offAxisFrustum(centre, screen, 10, 1));
  assert.throws(() => offAxisFrustum(centre, { widthM: 0, heightM: 0.3 }, 0.1, 10));
  // A point behind the eye is not visible rather than producing a mirrored image.
  assert.equal(projectPoint(centre, screen, [0, 0, 1.2]).visible, false);
});

test('coupling gain interpolates and clamps', () => {
  const t: Vec3 = [0.1, 0.05, 0.7];
  assert.deepEqual(coupledEye(centre, t, 0), centre);
  assert.deepEqual(coupledEye(centre, t, 1), t);
  assert.deepEqual(coupledEye(centre, t, 7), t);
  assert.deepEqual(coupledEye(centre, t, Number.NaN), centre);
  const half = coupledEye(centre, t, 0.5);
  close(half[0], 0.05);
});
