import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Quaternion, Vector3, type WebGLRenderer } from 'three';
import { loadRecordedRoomCloud } from '../src/astral/room-source.ts';
import { baseRoom, coveredByEarlierFrame, depthNormal, isFlyingPixel, loadPosedFrames, unprojectPixel, validatePosedManifest, type DepthFrame, type PosedCamera } from '../src/astral/posed-frames.ts';

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

test('a slot is validated: no repeated id, no clear volume with a side of nothing or less, its point inside, directions along an axis', () => {
  const holds = { thing: 'sky-cube', discrepancy: null, pose: 'rests', factor: 1, copies: 1 };
  const slot = { id: 'sky', surface: 'air', anchor: false, point: [1, 1, -5], normal: [0, 1, 0], facing: [0, 0, 1], holds };
  const hero = { name: 'sky cube', min: [0, 1, -6], max: [2, 3, -4], slot };
  const room = { mood: 'quiet', kind: 'office', era: 1990, deviation: 25, ambiguity: 70 };
  const m = (heroes: unknown[], declared: unknown = room) => ({ ...manifest(), heroes, room: declared });
  const other = { ...hero, name: 'other', slot: { ...slot, id: 'other', surface: 'wall', facing: [-1, 0, 0], holds: null } };
  const good = validatePosedManifest(m([hero, other, { name: 'pool', min: [5, 0, 0], max: [6, 1, 1] }]));
  assert.deepEqual(baseRoom(good), { ...room, slots: [
    { id: 'sky', surface: 'air', anchor: false, clear: [2, 2, 2], holds },
    { id: 'other', surface: 'wall', anchor: false, clear: [2, 2, 2], holds: null },
  ], places: 0 });
  // The room has as many places for a repeated thing's copies as the manifest lists.
  assert.equal(baseRoom(validatePosedManifest({ ...m([hero]), places: [{ min: [3, 0, 0], max: [4, 1, 1], slot: { ...other.slot, point: [3.5, 0, 0.5] } }] }))!.places, 1);
  // A thing facing along x has the box's z side as its width and its x side as its depth.
  assert.deepEqual(baseRoom(validatePosedManifest(m([{ ...other, max: [3, 3, -4], slot: { ...other.slot, point: [1, 2, -5] } }])))!.slots[0].clear, [2, 2, 3]);
  assert.equal(baseRoom(validatePosedManifest({ ...manifest(), heroes: [hero] })), null);

  assert.throws(() => validatePosedManifest(m([hero, { ...other, slot: { ...other.slot, id: 'sky' } }])), /Invalid/, 'a repeated slot id');
  for (const max of [[2, 1, -4], [2, 0.5, -4], [0, 3, -4]]) assert.throws(() => validatePosedManifest(m([{ ...hero, max }])), /Invalid/, `clear volume to ${max}`);
  for (const change of [
    { id: 'Sky' }, { id: '' }, { id: 7 }, { surface: 'shelf' }, { anchor: 'no' }, { point: [1, 0.9, -5] }, { point: [1, 1] }, { point: [1, NaN, -5] },
    { normal: [0, 0.7, 0.7] }, { normal: [0, 0, 0] }, { normal: [1, 1, 0] }, { facing: [0, 1, 0] }, { facing: [0, 0, 2] }, { facing: 'north' },
    { holds: undefined }, { holds: 'sky-cube' }, { holds: { ...holds, thing: '../x' } }, { holds: { ...holds, pose: 'floats' } }, { holds: { ...holds, discrepancy: 'absence' } },
    { holds: { ...holds, factor: 4 } }, { holds: { ...holds, copies: 0 } },
  ]) assert.throws(() => validatePosedManifest(m([{ ...hero, slot: { ...slot, ...change } }])), /Invalid/, JSON.stringify(change));
  assert.throws(() => validatePosedManifest(m([{ ...hero, slot: null }])), /Invalid/);
  // What the recording declares wrong is accepted: an absence, a wrong size.
  for (const declared of [{ ...holds, thing: null, discrepancy: 'absence' }, { ...holds, discrepancy: 'scale', factor: 4 }, { ...holds, pose: 'sunk', discrepancy: 'displacement' }]) {
    assert.deepEqual(baseRoom(validatePosedManifest(m([{ ...hero, slot: { ...slot, holds: declared } }])))!.slots[0].holds, declared);
  }
  for (const change of [{ mood: 'calm' }, { kind: 'library' }, { era: 1990.5 }, { era: 990 }, { deviation: 101 }, { deviation: '25' }, { ambiguity: -1 }, { ambiguity: undefined }]) {
    assert.throws(() => validatePosedManifest(m([hero], { ...room, ...change })), /Invalid/, JSON.stringify(change));
  }
  assert.throws(() => validatePosedManifest(m([hero], null)), /Invalid/);
});

test('a place for a copy is a clear volume with a slot that holds nothing, an id no slot has, and a known pose', () => {
  const slot = { id: 'water', surface: 'floor', anchor: false, point: [1, 0, 1], normal: [0, 1, 0], facing: [0, 0, 1], holds: null };
  const place = { min: [0, 0, 0], max: [2, 1, 2], slot };
  const hero = { name: 'sky cube', min: [0, 1, -6], max: [2, 3, -4], slot: { ...slot, id: 'sky', point: [1, 1, -5] } };
  const m = (places: unknown) => ({ ...manifest(), heroes: [hero], places });
  const good = validatePosedManifest(m([place, { ...place, pose: 'sunk', slot: { ...slot, id: 'shelf' } }]));
  assert.deepEqual(good.places!.map(each => [each.slot.id, each.pose]), [['water', undefined], ['shelf', 'sunk']]);
  for (const bad of ['water', [null], [{ ...place, slot: undefined }], [{ min: [0, 0, 0], max: [2, 1, 2] }], [{ ...place, max: [2, 0, 2] }], [{ ...place, pose: 'floats' }],
    [{ ...place, slot: { ...slot, id: 'sky' } }], [place, place], [{ ...place, slot: { ...slot, point: [3, 0, 1] } }], [{ ...place, slot: { ...slot, anchor: true } }],
    [{ ...place, slot: { ...slot, holds: { thing: 'globe', discrepancy: null, pose: 'rests', factor: 1, copies: 1 } } }], Array.from({ length: 17 }, (_, i) => ({ ...place, slot: { ...slot, id: `p${i}` } }))]) {
    assert.throws(() => validatePosedManifest(m(bad)), /Invalid/, JSON.stringify(bad).slice(0, 120));
  }
  // The library's own: five places, none in a hero's box, the water's below the floor's level and sunk.
  const library = validatePosedManifest(JSON.parse(readFileSync(new URL('../public/fixtures/library/manifest.json', import.meta.url), 'utf8')));
  assert.deepEqual(library.places!.map(each => [each.slot.id, each.slot.surface, each.pose ?? 'rests']),
    [['shelf-right', 'wall', 'rests'], ['water', 'floor', 'sunk'], ['carpet-left', 'floor', 'rests'], ['carpet-back', 'floor', 'rests'], ['shelf-left', 'wall', 'rests']]);
  for (const each of library.places!) for (const box of library.heroes!) {
    if (each.slot.id === 'water') continue;   // the pool's own box holds the water
    assert.ok([0, 1, 2].some(axis => each.max[axis] <= box.min[axis] || each.min[axis] >= box.max[axis]), `${each.slot.id} is in the box of ${box.name}`);
  }
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
