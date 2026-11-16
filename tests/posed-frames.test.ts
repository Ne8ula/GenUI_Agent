import assert from 'node:assert/strict';
import test from 'node:test';
import { Quaternion, Vector3, type WebGLRenderer } from 'three';
import { loadRecordedRoomCloud } from '../src/astral/room-source.ts';
import { coveredByEarlierFrame, depthNormal, isFlyingPixel, loadPosedFrames, unprojectPixel, validatePosedManifest, type DepthFrame, type PosedCamera } from '../src/astral/posed-frames.ts';

const camera = (): PosedCamera => ({ intrinsics: { width: 9, height: 7, fx: 100, fy: 100, cx: 4, cy: 3 }, extrinsics: { coordinateSystem: 'rub', position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] } });
const plane = (): DepthFrame => ({ camera: camera(), depth: new Float32Array(63).fill(4), confidence: new Uint8ClampedArray(63 * 4).fill(255) });
const manifest = () => ({ frames: [{ image: 'frame.jpg', depth: 'frame.exr', confidence: 'confidence.png', source: 'picture', camera: camera() }] });

test('RUB pixel unprojection uses forward-axis depth, XYZW camera-to-world rotation and translation', () => {
  const c = camera();
  c.extrinsics.position = [1, 2, 3];
  c.extrinsics.quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2).toArray();
  const p = unprojectPixel(c, 6, 4, 10);
  assert.ok(p.distanceTo(new Vector3(-9, 1.9, 2.8)) < 1e-12);
});

test('depth-grid normals face the camera, including one-sided image boundaries and a rotated plane', () => {
  const frame = plane();
  for (const [x, y] of [[4, 3], [0, 0], [8, 6]]) assert.ok(depthNormal(frame, x, y)!.distanceTo(new Vector3(0, 0, 1)) < 1e-12);
  frame.camera.extrinsics.quaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 4).toArray();
  assert.ok(depthNormal(frame, 4, 3)!.distanceTo(new Vector3(0, -Math.SQRT1_2, Math.SQRT1_2)) < 1e-12);
  frame.depth.fill(NaN);
  assert.equal(depthNormal(frame, 4, 3), null);
});

test('a clean depth step retains both surfaces and sane normals; intermediate flying pixels are rejected', () => {
  const frame = plane();
  for (let y = 0; y < 7; y++) for (let x = 4; x < 9; x++) frame.depth[y * 9 + x] = 8;
  for (const x of [3, 4]) {
    assert.equal(isFlyingPixel(frame, x, 3), false);
    assert.ok(depthNormal(frame, x, 3)!.distanceTo(new Vector3(0, 0, 1)) < 1e-12);
  }
  for (let y = 0; y < 7; y++) frame.depth[y * 9 + 4] = 6;
  assert.equal(isFlyingPixel(frame, 4, 3), true);
  assert.equal(isFlyingPixel(frame, 3, 3), false);
  assert.equal(isFlyingPixel(frame, 5, 3), false);
  frame.confidence.fill(0);
  assert.equal(depthNormal(frame, 3, 3), null);
});

test('a steep perspective plane is not a flying edge: inverse depth continues linearly', () => {
  const frame = plane();
  for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) frame.depth[y * 9 + x] = 1 / (0.25 + 0.012 * (x - 4));
  for (let x = 2; x <= 6; x++) {
    assert.equal(isFlyingPixel(frame, x, 3), false);
    const normal = depthNormal(frame, x, 3);
    assert.ok(normal && Math.abs(normal.length() - 1) < 1e-6);
  }
});

test('earlier-frame coverage suppresses the same surface, not new depths, uncovered pixels or off-screen geometry', () => {
  const first = plane(), second = plane();
  second.camera.extrinsics.position[0] = 0.04;
  assert.equal(coveredByEarlierFrame(unprojectPixel(second.camera, 3, 3, 4), first), true);
  assert.equal(coveredByEarlierFrame(unprojectPixel(second.camera, 3, 3, 6), first), false);
  assert.equal(coveredByEarlierFrame(new Vector3(0, 1.6, 4), first), false);
  assert.equal(coveredByEarlierFrame(new Vector3(10, 1.6, -4), first), false);
  first.kept = new Uint8Array(63);
  assert.equal(coveredByEarlierFrame(unprojectPixel(second.camera, 3, 3, 4), first), false);
  first.kept[3 * 9 + 4] = 1;
  assert.equal(coveredByEarlierFrame(unprojectPixel(second.camera, 3, 3, 4), first), true);
  first.depth[3 * 9 + 4] = NaN;
  assert.equal(coveredByEarlierFrame(unprojectPixel(second.camera, 3, 3, 4), first), false);
});

test('manifest boundary accepts 1..16 frames and rejects paths, invalid cameras and oversized grids', () => {
  assert.equal(validatePosedManifest(manifest()).frames.length, 1);
  assert.equal(validatePosedManifest({ frames: Array.from({ length: 16 }, () => manifest().frames[0]) }).frames.length, 16);
  for (const count of [0, 17]) assert.throws(() => validatePosedManifest({ frames: Array.from({ length: count }, () => manifest().frames[0]) }), /Invalid/);
  for (const name of ['../frame.jpg', 'folder/frame.jpg', 'folder\\frame.jpg', 'https:evil.jpg']) {
    const m = manifest(); m.frames[0].image = name; assert.throws(() => validatePosedManifest(m), /Invalid/);
  }
  for (const value of [NaN, Infinity, 0, -1]) {
    const m = manifest(); m.frames[0].camera.intrinsics.fx = value; assert.throws(() => validatePosedManifest(m), /Invalid/);
  }
  const m = manifest(); m.frames[0].camera.intrinsics.width = 8192;
  assert.throws(() => validatePosedManifest(m), /Invalid/);
  m.frames[0].camera = camera(); m.frames[0].camera.extrinsics.quaternion = [0, 0, 0, 0];
  assert.throws(() => validatePosedManifest(m), /Invalid/);
});

test('hero boxes and optional splat filenames are validated without accepting executable markup or paths', () => {
  const hero = { name: 'sky cube', min: [0, 1, -6], max: [2, 3, -4] };
  const m = { ...manifest(), heroes: [hero], splats: 'room.spz' };
  assert.equal(validatePosedManifest(m).heroes?.[0], hero);
  assert.equal(validatePosedManifest(m).splats, 'room.spz');
  assert.equal(validatePosedManifest(manifest()).splats, undefined);
  for (const name of ['', '<script>', 'x'.repeat(65), 'line\nbreak']) assert.throws(() => validatePosedManifest({ ...m, heroes: [{ ...hero, name }] }), /Invalid/);
  for (const min of [[0, NaN, -6], [0, 3, -6], [0, 1]]) assert.throws(() => validatePosedManifest({ ...m, heroes: [{ ...hero, min }] }), /Invalid/);
  assert.throws(() => validatePosedManifest({ ...m, heroes: Array(17).fill(hero) }), /Invalid/);
  for (const splats of ['../room.spz', 'https://example.com/a.spz', '/room.spz', 'a\\b.spz']) assert.throws(() => validatePosedManifest({ ...m, splats }), /Invalid/);
});

test('recorded source defaults to library; the explicit surreal query selects the original fixture', async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => { urls.push(url); return new Response('{}'); });
  await assert.rejects(loadRecordedRoomCloud(null as unknown as WebGLRenderer, new AbortController().signal), /Invalid posed-frame manifest/);
  assert.equal(urls[0], '/fixtures/library/manifest.json');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '?room=surreal' } });
  try {
    await assert.rejects(loadRecordedRoomCloud(null as unknown as WebGLRenderer, new AbortController().signal));
    assert.equal(urls[1], '/fixtures/surreal-library/manifest.json');
  } finally {
    if (original) Object.defineProperty(globalThis, 'location', original);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});

test('pre-abort does not begin decoding or fetching', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(loadPosedFrames('/fixtures/library/', manifest(), abort.signal), { name: 'AbortError' });
});
