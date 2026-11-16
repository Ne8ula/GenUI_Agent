import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import {
  Box3, BoxGeometry, Color, Group, Matrix3, Mesh, MeshStandardMaterial, MirroredRepeatWrapping,
  PlaneGeometry, Points, RepeatWrapping, SRGBColorSpace, Texture, Vector3, type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ORDERED_ALONG_ROW_SPACING, ORDERED_ROW_SPACING, sampleSurfacePointCloud } from '../src/astral/surface-sampler.ts';
import { loadRecordedRoomCloud } from '../src/astral/room-source.ts';

const signal = () => new AbortController().signal;
const box = (size: [number, number, number], position: [number, number, number], color = 0x809060) => {
  const mesh = new Mesh(new BoxGeometry(...size), new MeshStandardMaterial({ color }));
  mesh.position.set(...position);
  return mesh;
};
const dispose = (root: Group) => root.traverse(object => {
  if (object instanceof Mesh) { object.geometry.dispose(); for (const m of [object.material].flat()) m.dispose(); }
});

test('ordered interior density, outward unit normals, clipped shell and capped spacing', async t => {
  const root = new Group();
  root.add(
    box([4.4, 0.2, 5.4], [0, -0.1, 0.5]), box([4.4, 0.2, 5.4], [0, 3.1, 0.5]),
    box([0.2, 3, 5.4], [-2.1, 1.5, 0.5]), box([0.2, 3, 5.4], [2.1, 1.5, 0.5]),
    box([4, 3, 0.2], [0, 1.5, -2.1]), box([4, 3, 0.2], [0, 1.5, 3.1]),
    box([10, 10, 10], [20, 0, 0]),
  );
  const hidden = box([1, 1, 1], [0, 1, 1]); hidden.visible = false; root.add(hidden);
  root.add(new Points());
  t.after(() => dispose(root));
  const cloud = await sampleSurfacePointCloud(root, new Box3(new Vector3(-2, 0, -2), new Vector3(2, 3, 3)), signal(), { maxPoints: 47_000 });
  assert.ok(cloud.count <= 47_000 && cloud.count > 45_000);
  assert.equal(cloud.ordered, true);
  assert.ok(cloud.spacing! >= Math.sqrt(94 / 47_000) - 1e-8);
  const sides = [0, 0, 0, 0, 0, 0], quadrants = [0, 0, 0, 0];
  const p = new Vector3(), n = new Vector3();
  for (let i = 0; i < cloud.count; i++) {
    p.fromArray(cloud.positions, i * 3); n.fromArray(cloud.normals!, i * 3);
    assert.ok(p.x >= -2 && p.x <= 2 && p.y >= 0 && p.y <= 3 && p.z >= -2 && p.z <= 3);
    assert.ok(Math.abs(n.length() - 1) < 1e-6);
    const face = n.x > 0.5 ? 0 : n.x < -0.5 ? 1 : n.y > 0.5 ? 2 : n.y < -0.5 ? 3 : n.z > 0.5 ? 4 : 5;
    assert.ok(Math.abs(p.getComponent(Math.floor(face / 2)) - [-2, 2, 0, 3, -2, 3][face]) < 1e-6, 'no points on outer faces or helpers');
    sides[face]++;
    const expected = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][face];
    assert.ok(n.distanceTo(new Vector3(...expected)) < 1e-6);
    if (face === 2) quadrants[(p.x > 0 ? 1 : 0) + (p.z > 0.5 ? 2 : 0)]++;
    assert.ok(Math.abs(cloud.colors[i * 3] - 0x80 / 255) < 1e-5, 'not shaded or dimmed');
  }
  for (const [i, area] of [15, 15, 20, 20, 12, 12].entries()) assert.ok(Math.abs(sides[i] / cloud.count - area / 94) < 0.01);
  for (const count of quadrants) assert.ok(Math.abs(count / sides[2] - 0.25) < 0.025);
});

test('ordered quad forms one world-quantised lattice across triangle seams, clipped with unit normals', async t => {
  const root = new Group();
  const wall = new Mesh(new PlaneGeometry(2, 2), new MeshStandardMaterial({ color: 0x809060 }));
  root.add(wall); t.after(() => dispose(root));
  const bounds = new Box3(new Vector3(-0.5, -0.5, -1), new Vector3(0.5, 0.5, 1));
  const cloud = await sampleSurfacePointCloud(root, bounds, signal());
  assert.equal(cloud.ordered, true);
  assert.equal(cloud.spacing, Math.sqrt(ORDERED_ROW_SPACING * ORDERED_ALONG_ROW_SPACING));
  const expected = (Math.ceil(0.5 / ORDERED_ROW_SPACING) - Math.ceil(-0.5 / ORDERED_ROW_SPACING))
    * (Math.ceil(0.5 / ORDERED_ALONG_ROW_SPACING) - Math.ceil(-0.5 / ORDERED_ALONG_ROW_SPACING));
  assert.ok(Math.abs(cloud.count - expected) <= 2, `${cloud.count} != ${expected}`);
  const seen = new Set<string>();
  for (let i = 0; i < cloud.count; i++) {
    const p = new Vector3().fromArray(cloud.positions, i * 3), n = new Vector3().fromArray(cloud.normals!, i * 3);
    assert.ok(bounds.containsPoint(p));
    assert.ok(Math.abs(p.x / ORDERED_ALONG_ROW_SPACING - Math.round(p.x / ORDERED_ALONG_ROW_SPACING)) < 1e-5);
    assert.ok(Math.abs(p.y / ORDERED_ROW_SPACING - Math.round(p.y / ORDERED_ROW_SPACING)) < 1e-5);
    assert.ok(n.distanceTo(new Vector3(0, 0, 1)) < 1e-6);
    seen.add(`${Math.round(p.x / ORDERED_ALONG_ROW_SPACING)},${Math.round(p.y / ORDERED_ROW_SPACING)}`);
    assert.ok(Math.abs(cloud.colors[i * 3] - 0x80 / 255) < 1e-5);
  }
  assert.equal(seen.size, cloud.count, 'diagonal triangle seams must not double points');
  const capped = await sampleSurfacePointCloud(root, bounds, signal(), { maxPoints: 900 });
  assert.ok(capped.count <= 900 && capped.count > 750);
  assert.ok(capped.spacing! > cloud.spacing!);
  const cappedBounds = new Box3().setFromArray(capped.positions);
  assert.ok(cappedBounds.min.x < -0.45 && cappedBounds.max.x > 0.45, 'cap coarsens the whole surface rather than truncating it');
  const abort = new AbortController();
  const pending = sampleSurfacePointCloud(root, bounds, abort.signal);
  setTimeout(() => abort.abort(), 1);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('world-space area and inverse-transpose normals survive nonuniform scale and rotation', async t => {
  const root = new Group();
  const large = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ color: 0xff0000 }));
  large.rotation.set(0.4, 0.6, 0.2); large.scale.set(4, 2, 0.5);
  const small = new Mesh(new PlaneGeometry(1, 1), new MeshStandardMaterial({ color: 0x00ff00 }));
  small.position.x = 4; small.scale.set(2, 1, 1);
  root.add(large, small); t.after(() => dispose(root));
  const cloud = await sampleSurfacePointCloud(root, new Box3(new Vector3(-10, -10, -10), new Vector3(10, 10, 10)), signal(), { maxPoints: 10_000 });
  const normal = new Vector3(0, 0, 1).applyMatrix3(new Matrix3().getNormalMatrix(large.matrixWorld)).normalize();
  let red = 0;
  for (let i = 0; i < cloud.count; i++) if (cloud.colors[i * 3] > 0.9) {
    red++;
    assert.ok(new Vector3().fromArray(cloud.normals!, i * 3).distanceTo(normal) < 1e-6);
  }
  const projectedCount = 8 * Math.abs(normal.z) / cloud.spacing! ** 2;
  assert.ok(Math.abs(red / projectedCount - 1) < 0.02);
  assert.ok(cloud.count <= 10_000);
  assert.ok(Math.abs(cloud.spacing! - Math.sqrt(10 / 10000)) < 1e-8);
});

test('CPU texels respect UV transforms, flipY, wrapping and linear factor × sRGB map, cached once', async t => {
  const root = new Group();
  const map = new Texture(); map.colorSpace = SRGBColorSpace;
  map.wrapS = RepeatWrapping; map.wrapT = MirroredRepeatWrapping;
  map.offset.set(1.25, 1.25); map.repeat.set(2, 2); map.flipY = true;
  const geometry = new PlaneGeometry(1, 1);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.5);
  const material = new MeshStandardMaterial({ map }); material.color.setRGB(0.5, 0.25, 1);
  const a = new Mesh(geometry, material), b = new Mesh(geometry, material); b.position.x = 2; root.add(a, b);
  t.after(() => { dispose(root); map.dispose(); });
  let reads = 0;
  const cloud = await sampleSurfacePointCloud(root, new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5)), signal(), {
    maxPoints: 100,
    readTexture(texture) {
      assert.equal(texture, map); reads++;
      return { width: 2, height: 2, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 128, 64, 192, 255, 0, 0, 255, 255]) };
    },
  });
  // (0.5,0.5) * 2 + (1.25,1.25) wraps to (0.25,0.25), then flipY selects bottom-left.
  const expected = new Color().setRGB(128 / 255, 64 / 255, 192 / 255).convertSRGBToLinear().multiply(material.color).convertLinearToSRGB();
  assert.equal(reads, 1);
  for (let i = 0; i < cloud.count; i++) for (const [axis, value] of expected.toArray().entries()) assert.ok(Math.abs(cloud.colors[i * 3 + axis] - value) < 1e-6);
});

test('material groups are sampled separately; only marked fittings use emissive colour', async t => {
  const root = new Group();
  const materials = Array.from({ length: 6 }, (_, i) => new MeshStandardMaterial({ color: i % 2 ? 0x00ff00 : 0xff0000, emissive: 0x0000ff }));
  root.add(new Mesh(new BoxGeometry(1, 1, 1), materials));
  const fitting = new Mesh(new PlaneGeometry(1, 1), materials[0]); fitting.position.x = 2; fitting.userData.astralEmitter = true; root.add(fitting);
  t.after(() => dispose(root));
  const cloud = await sampleSurfacePointCloud(root, new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5)), signal(), { maxPoints: 7000 });
  const counts = [0, 0, 0];
  for (let i = 0; i < cloud.count; i++) {
    const rgb = cloud.colors.subarray(i * 3, i * 3 + 3);
    counts[rgb[0] > 0.9 ? 0 : rgb[1] > 0.9 ? 1 : 2]++;
  }
  assert.ok(cloud.count <= 7000);
  assert.equal(counts[0], counts[1]);
  assert.ok(Math.abs(counts[2] / cloud.count - 1 / 7) < 0.01);
});

test('sampler rejects invalid, empty and aborted requests, and yields to cancellation', async () => {
  const root = new Group(), bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
  const abort = new AbortController(); abort.abort();
  await assert.rejects(sampleSurfacePointCloud(root, bounds, abort.signal), { name: 'AbortError' });
  for (const maxPoints of [0, -1, 1.5, NaN, Infinity, 4_000_001]) await assert.rejects(sampleSurfacePointCloud(root, bounds, signal(), { maxPoints }), /Invalid/);
  await assert.rejects(sampleSurfacePointCloud(root, bounds, signal()), /No interior/);
  root.add(box([1, 1, 1], [0, 0, 0]));
  const pending = new AbortController();
  const promise = sampleSurfacePointCloud(root, bounds, pending.signal);
  pending.abort();
  await assert.rejects(promise, { name: 'AbortError' });
  dispose(root);
});

const manifest = {
  id: 'test', label: 'Test recorded fixture', camera: { position: [0.134, 1.083, 0.74], lookAt: [0.134, 1.083, -6], fovDeg: 59.2, width: 1280, height: 720 },
  room: { width: 2, depth: 2, height: 2 }, shell: 'models/room.glb', heroes: [{ id: 'lamp', name: 'Lamp', glb: 'models/lamp.glb', order: 0 }],
  wire: { lineColor: '#000000', heroColor: '#ffffff' }, stages: { wire: 'wire.png', evaLit: 'eva.png', paint: 'paint.png', final: 'final.png' },
};

function selectSurreal(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { search: '?room=surreal' } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'location', original); else Reflect.deleteProperty(globalThis, 'location'); });
}

test('recorded source loads original GLBs only, preserves recorded frame/arrival and reports fittings', async t => {
  selectSurreal(t);
  const shell = new Group(), lamp = new Group();
  shell.add(box([2.4, 0.2, 2.4], [0, -0.1, 2]));
  const light = box([0.2, 0.02, 0.2], [0, 1.99, 2]); light.userData.role = 'light'; light.material.emissive.setHex(0xffddaa); shell.add(light);
  lamp.add(box([0.1, 0.4, 0.1], [0.5, 0.2, 2.5]));
  const released: number[] = [];
  for (const root of [shell, lamp]) root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const resource of [object.geometry, ...[object.material].flat()]) { const id = released.length; released.push(0); resource.addEventListener('dispose', () => released[id]++); }
  });
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => { urls.push(url); return new Response(JSON.stringify(manifest)); });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url: string) => {
    urls.push(url); return { scene: url.endsWith('room.glb') ? shell : lamp };
  });
  const cloud = await loadRecordedRoomCloud(null as unknown as WebGLRenderer, signal());
  assert.deepEqual(urls, ['/fixtures/surreal-library/manifest.json', '/fixtures/surreal-library/models/room.glb', '/fixtures/surreal-library/models/lamp.glb']);
  assert.deepEqual(cloud.arrival, { position: manifest.camera.position, lookAt: manifest.camera.lookAt });
  assert.deepEqual(cloud.lights?.ceiling, [[0, 1.99, 2]]);
  assert.ok(Math.abs(cloud.lights!.lamps[0][1] - 0.34) < 1e-7);
  assert.equal(cloud.lights!.lamps[0][0], 0.5);
  assert.ok(cloud.normals && cloud.normals.length === cloud.positions.length);
  assert.equal(cloud.ordered, true);
  assert.equal(cloud.spacing, Math.sqrt(ORDERED_ROW_SPACING * ORDERED_ALONG_ROW_SPACING));
  assert.ok(cloud.count > 40_000);
  for (const count of released) assert.equal(count, 1);
});

test('recorded source validates paths before loading and disposes late loads after a failure', async t => {
  selectSurreal(t);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...manifest, shell: '../escape.glb' })));
  const root = new Group(); const mesh = box([1, 1, 1], [0, 0, 0]); root.add(mesh);
  let loads = 0, disposed = 0;
  mesh.geometry.addEventListener('dispose', () => disposed++);
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url: string) => {
    loads++;
    if (url.endsWith('room.glb')) throw new Error('synthetic load failure');
    await new Promise<void>(resolve => setTimeout(resolve, 5));
    return { scene: root };
  });
  await assert.rejects(loadRecordedRoomCloud(null as unknown as WebGLRenderer, signal()), /invalid shell/);
  assert.equal(loads, 0);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(manifest)));
  await assert.rejects(loadRecordedRoomCloud(null as unknown as WebGLRenderer, signal()), /synthetic load failure/);
  assert.equal(disposed, 1);
});
