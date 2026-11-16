import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, Quaternion, Vector3 } from 'three';
import { MAX_SPLAT_SCALE, MIN_SPLAT_OPACITY, SPLAT_REACH, sampleSplatPoints, splatEllipse, type SurfaceSplat } from '../src/astral/splat-points.ts';
import { ORDERED_ALONG_ROW_SPACING as ALONG, ORDERED_ROW_SPACING as ROW } from '../src/astral/surface-sampler.ts';
import { insideWater, validatePosedManifest, type PosedManifest } from '../src/astral/posed-frames.ts';

const splat = (): SurfaceSplat => ({ center: new Vector3(0, 0, -2), scales: new Vector3(.2, .1, .001), quaternion: new Quaternion(), opacity: .9, color: new Color(.25, .5, .75) });
const manifest = (): PosedManifest => ({ frames: [{ image: 'a.jpg', depth: 'a.exr', confidence: 'a.png', source: 'picture', camera: { intrinsics: { width: 8, height: 8, fx: 10, fy: 10, cx: 4, cy: 4 }, extrinsics: { coordinateSystem: 'rub', position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] } } }] });
const sample = (splats: SurfaceSplat[], m = manifest(), cap = 10000) => sampleSplatPoints({ numSplats: splats.length, getSplat: i => splats[i] }, m, new AbortController().signal, cap);

test('overlapping wall ellipses claim one world lattice with the analytical union count and raw sRGB', async () => {
  const a = splat(), b = splat(); b.center.x = .07;
  const cloud = await sample([a, b, a]);
  const ra = .2 * SPLAT_REACH, rb = .1 * SPLAT_REACH;
  let expected = 0;
  for (let y = -30; y <= 30; y++) for (let x = -100; x <= 100; x++) {
    if ((x * ALONG / ra) ** 2 + (y * ROW / rb) ** 2 <= 1 + 1e-9 || ((x * ALONG - .07) / ra) ** 2 + (y * ROW / rb) ** 2 <= 1 + 1e-9) expected++;
  }
  assert.equal(cloud.count, expected);
  const seen = new Set<string>();
  for (let i = 0; i < cloud.count; i++) {
    const p = new Vector3().fromArray(cloud.positions, i * 3);
    assert.ok(Math.abs(p.x / ALONG - Math.round(p.x / ALONG)) < 1e-5);
    assert.ok(Math.abs(p.y / ROW - Math.round(p.y / ROW)) < 1e-5);
    assert.equal(p.z, -2); seen.add(p.toArray().join(','));
    assert.deepEqual(Array.from(cloud.colors.subarray(i * 3, i * 3 + 3)), [.25, .5, .75]);
    assert.equal(cloud.normals![i * 3 + 2], 1);
  }
  assert.equal(seen.size, cloud.count); assert.equal(cloud.ordered, true); assert.equal(cloud.lit, true);
  assert.equal(cloud.spacing, Math.sqrt(ROW * ALONG));
});

test('floor uses constant-x rows and points up; normals face the nearest camera on walls and ceiling', async () => {
  const floor = splat(); floor.center.set(0, 0, 0); floor.scales.set(.2, .001, .1);
  const cloud = await sample([floor]);
  for (let i = 0; i < cloud.count; i++) {
    const p = new Vector3().fromArray(cloud.positions, i * 3);
    assert.ok(Math.abs(p.x / ROW - Math.round(p.x / ROW)) < 1e-5);
    assert.ok(Math.abs(p.z / ALONG - Math.round(p.z / ALONG)) < 1e-5);
    assert.equal(p.y, 0); assert.equal(cloud.normals![i * 3 + 1], 1);
  }
  const cameras = [new Vector3(20, 1.6, 0), new Vector3(0, 1.6, 0)];
  floor.center.y = 3;
  assert.equal(splatEllipse(floor, cameras)!.normal.y, -1);
  const wall = splat(); wall.center.set(2, 1, 0); wall.scales.set(.001, .1, .2);
  assert.equal(splatEllipse(wall, cameras)!.normal.x, -1);
});

test('sub-cell splats retain one conservative world-lattice sample instead of losing thin bright detail', async () => {
  const a = splat(); a.center.set(.002, .004, -2); a.scales.set(.0003, .0002, .00001);
  const cloud = await sample([a, a]);
  assert.equal(cloud.count, 1); assert.deepEqual(Array.from(cloud.positions), [0, 0, -2]);
  assert.deepEqual(Array.from(cloud.colors), [.25, .5, .75]);
});

test('overlap colour preserves finer detail instead of depending on file order', async () => {
  const broad = splat(), fine = splat(); broad.color.setRGB(.1, .1, .1); fine.scales.set(.001, .001, .0001); fine.color.setRGB(1, .8, .5);
  for (const list of [[broad, fine], [fine, broad]]) {
    const cloud = await sample(list);
    let index = -1;
    for (let i = 0; i < cloud.count; i++) if (cloud.positions[i * 3] === 0 && cloud.positions[i * 3 + 1] === 0) index = i;
    assert.ok(index >= 0); assert.equal(cloud.colors[index * 3], 1);
  }
});

test('hero boxes use half-pitch rows and dots, without refining outside or duplicating overlaps', async () => {
  const a = splat(), m = manifest();
  m.heroes = [{ name: 'detail', min: [-1, -1, -2.01], max: [0, 1, -1.99] }];
  const baseline = await sample([a]), refined = await sample([a, a], m);
  assert.equal(refined.spacing, baseline.spacing);
  const outside = (cloud: typeof refined) => {
    const points: string[] = [];
    for (let i = 0; i < cloud.count; i++) if (cloud.positions[i * 3] > 0) points.push(Array.from(cloud.positions.subarray(i * 3, i * 3 + 3)).join(','));
    return points.sort();
  };
  assert.deepEqual(outside(refined), outside(baseline));
  const unique = new Set<string>(); let heroes = 0, halfRows = 0;
  for (let i = 0; i < refined.count; i++) {
    const p = new Vector3().fromArray(refined.positions, i * 3); unique.add(p.toArray().join(','));
    if (p.x <= 0) {
      heroes++;
      assert.ok(Math.abs(p.x / (ALONG / 2) - Math.round(p.x / (ALONG / 2))) < 1e-5);
      assert.ok(Math.abs(p.y / (ROW / 2) - Math.round(p.y / (ROW / 2))) < 1e-5);
      if (Math.abs(p.y / ROW - Math.round(p.y / ROW)) > .4) halfRows++;
    }
  }
  assert.equal(unique.size, refined.count); assert.equal(refined.heroes![0].count, heroes);
  assert.ok(halfRows > 0); assert.ok(refined.count > baseline.count * 2);
});

test('oversized, transparent and non-finite splats are dropped without altering valid walls', async () => {
  const valid = splat(), large = splat(), transparent = splat(), invalid = splat();
  large.scales.x = MAX_SPLAT_SCALE + .01; transparent.opacity = MIN_SPLAT_OPACITY - .01; invalid.center.x = NaN;
  assert.deepEqual((await sample([valid, large, transparent, invalid])).positions, (await sample([valid])).positions);
  await assert.rejects(sample([large, transparent]), /no usable/);
});

test('cap coarsens the entire lattice rather than truncating the last splats; cancellation yields', async () => {
  const a = splat(), b = splat(); b.center.x = 1;
  const capped = await sample([a, b], manifest(), 100);
  assert.ok(capped.count <= 100 && capped.count > 40); assert.ok(capped.spacing! > Math.sqrt(ROW * ALONG));
  assert.ok(capped.positions.some((value, i) => i % 3 === 0 && value > 1.1));
  assert.ok(capped.positions.some((value, i) => i % 3 === 0 && value < -.1));
  const abort = new AbortController();
  const pending = sampleSplatPoints({ numSplats: 100000, getSplat: () => a }, manifest(), abort.signal, 10000);
  setTimeout(() => abort.abort(), 0);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('rotated ellipses stay on their tangent plane; invalid budgets and pre-abort fail before decoding', async () => {
  const a = splat(); a.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), .6);
  const cloud = await sample([a]);
  const normal = new Vector3(0, 0, 1).applyQuaternion(a.quaternion);
  for (let i = 0; i < cloud.count; i++) {
    const p = new Vector3().fromArray(cloud.positions, i * 3).sub(a.center);
    assert.ok(Math.abs(p.dot(normal)) < 1e-6);
    assert.ok(new Vector3().fromArray(cloud.normals!, i * 3).dot(normal) > .99999);
  }
  const source = { numSplats: 1, getSplat: () => { throw new Error('must not decode'); } };
  for (const cap of [0, -1, 4_000_001, NaN, 1.5]) await assert.rejects(sampleSplatPoints(source, manifest(), new AbortController().signal, cap), /Invalid/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(sampleSplatPoints(source, manifest(), abort.signal), { name: 'AbortError' });
});

test('water validates and removes exactly the elliptical volume; heroes count retained points', async () => {
  const m = manifest(); m.water = { center: [0, 0, 0], radius: [.1, .06], depth: 1.4 };
  m.heroes = [{ name: 'floor', min: [-1, -.1, -1], max: [1, .1, 1] }];
  assert.equal(validatePosedManifest(m).water, m.water);
  assert.equal(insideWater(new Vector3(.099, 0, 0), m.water), true);
  assert.equal(insideWater(new Vector3(.101, 0, 0), m.water), false);
  assert.equal(insideWater(new Vector3(0, .12, 0), m.water), true);
  assert.equal(insideWater(new Vector3(0, .151, 0), m.water), false);
  for (const water of [{ ...m.water, depth: 0 }, { ...m.water, radius: [1, NaN] }, { ...m.water, center: [0, Infinity, 0] }]) assert.throws(() => validatePosedManifest({ ...m, water }), /Invalid/);
  const floor = splat(); floor.center.set(0, 0, 0); floor.scales.set(.2, .001, .1);
  const cloud = await sample([floor], m);
  for (let i = 0; i < cloud.count; i++) assert.equal(insideWater(new Vector3().fromArray(cloud.positions, i * 3), m.water), false);
  assert.equal(cloud.heroes![0].count, cloud.count); assert.deepEqual(cloud.water, m.water);
});
