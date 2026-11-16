import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { loadObjectPoints, loadShelf, replaceHero } from '../src/astral/object-points.ts';
import type { PointCloud } from '../src/astral/types.ts';
import { chairFixture } from './fixtures/prop-glb.ts';

const signal = () => new AbortController().signal;
const shelfDir = new URL('../public/fixtures/objects/', import.meta.url);
function serve(t: TestContext, respond: (url: string) => Response) {
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => respond(String(url)));
  return t.mock.method(console, 'info', () => {});
}

test('the recorded shelf lists six distinct objects whose GLB files exist, and says it is a recording', async t => {
  const info = serve(t, url => {
    assert.equal(url, '/fixtures/objects/manifest.json');
    return new Response(readFileSync(new URL('manifest.json', shelfDir)));
  });
  const shelf = await loadShelf(signal());
  assert.equal(shelf.length, 6);
  assert.equal(new Set(shelf.map(item => item.id)).size, 6);
  for (const item of shelf) {
    assert.match(item.glb, /^\/fixtures\/objects\/[a-z0-9-]+\.glb$/);
    assert.ok(item.name.trim());
    const file = new URL(item.glb.slice('/fixtures/objects/'.length), shelfDir);
    assert.ok(existsSync(file), `${item.glb} is missing`);
    const bytes = readFileSync(file);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(8), bytes.length);
  }
  assert.match(String(info.mock.calls[0].arguments[0]), /recording, not live generation/);
});

test('a shelf manifest with a path, a repeated id or no objects is refused', async t => {
  const entry = { id: 'a', name: 'A', glb: 'a.glb' };
  for (const objects of [[], [{ ...entry, glb: '../a.glb' }], [{ ...entry, glb: 'https://example.com/a.glb' }], [entry, entry], [{ ...entry, name: '' }], [{ id: 'a', glb: 'a.glb' }], 'a']) {
    serve(t, () => new Response(JSON.stringify({ objects })));
    await assert.rejects(loadShelf(signal()), /Invalid object shelf manifest/);
  }
  serve(t, () => new Response('', { status: 404 }));
  await assert.rejects(loadShelf(signal()), /HTTP 404/);
});

test('an object is scaled evenly to fit the box, centred, standing on its floor, and denser when asked', async t => {
  // The chair model spans 0.6 x 1.0 x 0.6 m; the box is the library's statue-head hero.
  const box = { min: [-3.678, 0.019, -10.37] as [number, number, number], max: [-1.941, 1.082, -9.09] as [number, number, number] };
  serve(t, () => new Response(chairFixture({ textured: false }).bytes));
  const cloud = await loadObjectPoints('/object.glb', box, signal());
  assert.ok(cloud.count > 1000 && cloud.normals && cloud.ordered);
  assert.equal(cloud.positions.length, cloud.count * 3);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cloud.count * 3; i++) {
    min[i % 3] = Math.min(min[i % 3], cloud.positions[i]); max[i % 3] = Math.max(max[i % 3], cloud.positions[i]);
    if (i % 3 === 0) assert.ok(Math.abs(Math.hypot(cloud.normals[i], cloud.normals[i + 1], cloud.normals[i + 2]) - 1) < 1e-4);
  }
  for (let axis = 0; axis < 3; axis++) assert.ok(min[axis] >= box.min[axis] && max[axis] <= box.max[axis], `axis ${axis} leaves the box`);
  // Height is the limiting side: it fills the box (1 mm clear), the base rests on the box's floor.
  assert.ok(Math.abs(min[1] - (box.min[1] + 0.001)) < 1e-4);
  assert.ok(Math.abs(max[1] - (box.max[1] - 0.001)) < 1e-4);
  for (const axis of [0, 2]) {
    assert.ok(Math.abs((min[axis] + max[axis]) / 2 - (box.min[axis] + box.max[axis]) / 2) < 1e-4, `axis ${axis} is not centred`);
    assert.ok(Math.abs((max[axis] - min[axis]) / (max[1] - min[1]) - 0.6) < 1e-3, `axis ${axis} lost its proportion`);
  }
  const coarse = await loadObjectPoints('/object.glb', box, signal(), 1);
  assert.ok(Math.abs(cloud.spacing! * 2 - coarse.spacing!) < 1e-9);
  assert.ok(cloud.count / coarse.count > 3.6 && cloud.count / coarse.count < 4.4, `density 2 gave ${cloud.count / coarse.count} times the points`);
  await assert.rejects(loadObjectPoints('/object.glb', { min: [0, 0, 0], max: [1, 0, 1] }, signal()), /Invalid box/);
});

test('replaceHero swaps the points in one hero box for the object and carries the rest of the room over', () => {
  const room: PointCloud = {
    count: 6,
    //           hero 0      outside     hero 1      hero 0        outside     outside
    positions: Float32Array.from([0.5, 0.5, 0.5, 5, 5, 5, 2.5, 0.5, 0.5, 0.1, 0.9, 0.2, -1, 0, 0, 1.5, 0.5, 0.5]),
    colors: Float32Array.from({ length: 18 }, (_, i) => Math.floor(i / 3) / 10),
    normals: Float32Array.from({ length: 18 }, (_, i) => i % 3 === 1 ? 1 : 0),
    spacing: 0.02, lit: true, ordered: true, splats: '/room.spz', pictured: true,
    lights: { ceiling: [[0, 3, 0]], lamps: [] }, water: { center: [9, 0, 9], radius: [1, 1], depth: 1 },
    arrival: { position: [0, 1, 4], lookAt: [0, 1, 0] },
    heroes: [{ name: 'first', min: [0, 0, 0], max: [1, 1, 1], count: 2 }, { name: 'second', min: [2, 0, 0], max: [3, 1, 1], count: 1 }],
  };
  const object: PointCloud = {
    count: 3, positions: Float32Array.from([0.2, 0.2, 0.2, 0.4, 0.4, 0.4, 0.6, 0.6, 0.6]),
    colors: new Float32Array(9).fill(0.9), normals: Float32Array.from([1, 0, 0, 1, 0, 0, 1, 0, 0]), spacing: 0.005, ordered: true,
  };
  const before = structuredClone(room);
  const result = replaceHero(room, 0, object);
  assert.deepEqual(room, before);
  assert.equal(result.count, 7);
  assert.deepEqual([...result.positions], [...Float32Array.from([5, 5, 5, 2.5, 0.5, 0.5, -1, 0, 0, 1.5, 0.5, 0.5]), ...object.positions]);
  assert.deepEqual([...result.colors].filter((_, i) => i % 3 === 0), [...Float32Array.from([0.1, 0.2, 0.4, 0.5, 0.9, 0.9, 0.9])]);
  assert.deepEqual([...result.normals!].slice(0, 3), [0, 1, 0]);
  assert.deepEqual([...result.normals!].slice(12), [...object.normals!]);
  assert.deepEqual(result.heroes, [{ ...room.heroes![0], count: 3 }, room.heroes![1]]);
  for (const key of ['spacing', 'lit', 'ordered', 'splats', 'pictured', 'lights', 'water', 'arrival'] as const) assert.equal(result[key], room[key]);
  // Replacing the other hero removes one point and counts only the object's points that land in that box (none).
  const other = replaceHero(room, 1, object);
  assert.equal(other.count, 8);
  assert.deepEqual(other.heroes!.map(hero => hero.count), [2, 0]);
  assert.throws(() => replaceHero(room, 2, object), RangeError);
  assert.throws(() => replaceHero({ ...room, heroes: undefined }, 0, object), RangeError);
  assert.throws(() => replaceHero(room, 0, { ...object, normals: undefined }), /normals/);
});
