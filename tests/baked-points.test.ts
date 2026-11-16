import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeBakedPoints, encodeBakedPoints, loadBakedPoints, MAX_BAKED_BYTES } from '../src/astral/baked-points.ts';
import { validatePosedManifest, type PosedManifest } from '../src/astral/posed-frames.ts';
import { loadRecordedRoomCloud } from '../src/astral/room-source.ts';
import type { PointCloud } from '../src/astral/types.ts';

const manifest = (): PosedManifest => ({ points: 'points.bin', splats: 'room.spz', frames: [{ image: 'a.jpg', depth: 'a.exr', confidence: 'a.png', source: 'picture', camera: { intrinsics: { width: 8, height: 8, fx: 10, fy: 10, cx: 4, cy: 4 }, extrinsics: { coordinateSystem: 'rub', position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] } } }], heroes: [{ name: 'wall', min: [-1, -1, -3], max: [1, 1, -1] }], water: { center: [2, 0, 0], radius: [1, 1], depth: 1 } });
const cloud = (): PointCloud => ({ count: 2, positions: new Float32Array([0, 0, -2, .007, 0, -2]), colors: new Float32Array([.1, .4, .8, .9, .3, .2]), normals: new Float32Array([0, 0, 1, .6, 0, .8]), ordered: true, lit: true, spacing: .01 });
const signal = () => new AbortController().signal;

test('bake roundtrip preserves float32 positions, bounded colour/normal error and manifest metadata', async () => {
  const input = cloud(), m = manifest(), bytes = await encodeBakedPoints(input, signal());
  assert.equal(bytes.byteLength, 32 + input.count * 18);
  const decoded = await decodeBakedPoints(bytes, m, signal());
  assert.deepEqual(decoded.positions, input.positions);
  for (let i = 0; i < input.colors.length; i++) assert.ok(Math.abs(decoded.colors[i] - input.colors[i]) <= 1 / 255);
  for (let i = 0; i < input.normals!.length; i++) assert.ok(Math.abs(decoded.normals![i] - input.normals![i]) < .01);
  assert.equal(decoded.heroes![0].count, 2); assert.deepEqual(decoded.water, m.water); assert.equal(decoded.ordered, true); assert.equal(decoded.lit, true);
  assert.deepEqual(decoded.arrival, { position: [0, 1.6, 0], lookAt: [0, 1.6, -6] });
  assert.equal(validatePosedManifest(m).points, 'points.bin');
  for (const points of ['', '../points.bin', 'https://bad.test/points.bin']) assert.throws(() => validatePosedManifest({ ...m, points }), /Invalid/);
});

test('bake rejects corrupt headers, counts, flags, truncated/trailing payloads and invalid geometry', async () => {
  const bytes = await encodeBakedPoints(cloud(), signal());
  for (const [offset, value] of [[0, 0], [4, 2], [8, 0], [8, 4_000_001], [12, 7], [20, 16], [24, 99], [28, 1]]) {
    const bad = bytes.slice(0); new DataView(bad).setUint32(offset, value, true);
    await assert.rejects(decodeBakedPoints(bad, manifest(), signal()), /Invalid/);
  }
  for (const value of [NaN, Infinity, 0, -1, 2]) { const bad = bytes.slice(0); new DataView(bad).setFloat32(16, value, true); await assert.rejects(decodeBakedPoints(bad, manifest(), signal()), /Invalid/); }
  for (const bad of [bytes.slice(0, 10), bytes.slice(0, -1), new Uint8Array(bytes.byteLength + 1).map((_, i) => new Uint8Array(bytes)[i] ?? 0).buffer]) await assert.rejects(decodeBakedPoints(bad, manifest(), signal()));
  const badPosition = bytes.slice(0); new DataView(badPosition).setFloat32(32, NaN, true); await assert.rejects(decodeBakedPoints(badPosition, manifest(), signal()), /coordinates/);
  const badNormal = bytes.slice(0); new Uint8Array(badNormal).fill(0, 32 + 2 * 15); await assert.rejects(decodeBakedPoints(badNormal, manifest(), signal()), /normal/);
});

test('stream loader handles split headers, validates transfer sizes and recorded routing prefers the bake', async t => {
  const bytes = new Uint8Array(await encodeBakedPoints(cloud(), signal()));
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(manifest()));
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 7)); controller.enqueue(bytes.slice(7, 29)); controller.enqueue(bytes.slice(29)); controller.close(); } }));
  });
  const result = await loadRecordedRoomCloud(null!, signal());
  assert.equal(result.splats, '/fixtures/library/room.spz'); assert.equal(result.count, 2);
  assert.deepEqual(urls, ['/fixtures/library/manifest.json', '/fixtures/library/points.bin']);
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes, { headers: { 'content-length': String(MAX_BAKED_BYTES + 1) } }));
  await assert.rejects(loadBakedPoints('/', manifest(), signal()), /too large/);
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes, { headers: { 'content-length': '33' } }));
  await assert.rejects(loadBakedPoints('/', manifest(), signal()), /transfer length/);
});

test('invalid bake falls through to source; pre-abort never fetches', async t => {
  const urls: string[] = [], m = manifest(); delete m.splats;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    if (url.endsWith('manifest.json')) return new Response(JSON.stringify(m));
    if (url.endsWith('points.bin')) return new Response('broken');
    throw new Error('RGBD fallback reached');
  });
  t.mock.method(console, 'warn', () => {});
  await assert.rejects(loadRecordedRoomCloud(null!, signal())); // Node has no browser image decoder; the fetch below proves fallback routing.
  assert.ok(urls.some(url => url.endsWith('a.exr')));
  const before = urls.length, abort = new AbortController(); abort.abort();
  await assert.rejects(loadBakedPoints('/', m, abort.signal), { name: 'AbortError' }); assert.equal(urls.length, before);
});
