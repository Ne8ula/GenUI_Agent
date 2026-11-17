import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { parseLedger, roomValues, type Pose } from '../src/astral/grammar.ts';
import { SCALE_FACTORS, decideChange, roomSpent } from '../src/astral/grammar-decide.ts';
import { floorOf, litLikeRoom, loadObjectPoints, loadShelf, poseIn, replaceHero, roomCast, standInSlot, type Posture } from '../src/astral/object-points.ts';
import { baseRoom, validatePosedManifest } from '../src/astral/posed-frames.ts';
import type { PointCloud, RoomSlot } from '../src/astral/types.ts';
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
  // Each is a thing of the grammar, and its width and depth are the model's own: the GLB's bounds, against its height.
  for (const item of shelf) {
    const bytes = readFileSync(new URL(item.glb.slice('/fixtures/objects/'.length), shelfDir));
    const { accessors, meshes } = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12))) as { accessors: { min: number[]; max: number[] }[]; meshes: { primitives: { attributes: { POSITION: number } }[] }[] };
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const { attributes } of meshes.flatMap(mesh => mesh.primitives)) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], accessors[attributes.POSITION].min[axis]); max[axis] = Math.max(max[axis], accessors[attributes.POSITION].max[axis]);
    }
    assert.ok(Math.abs(item.wide - (max[0] - min[0]) / (max[1] - min[1])) < 0.002, `${item.id}: wide`);
    assert.ok(Math.abs(item.deep - (max[2] - min[2]) / (max[1] - min[1])) < 0.002, `${item.id}: deep`);
    assert.ok(item.height > 0 && item.surfaces.length > 0 && Number.isInteger(item.era) && typeof item.repeatable === 'boolean' && Array.isArray(item.kinds));
  }
});

test('the recorded library and the recorded shelf are a room the grammar can decide in', async t => {
  serve(t, () => new Response(readFileSync(new URL('manifest.json', shelfDir))));
  const shelf = await loadShelf(signal());
  const manifest = validatePosedManifest(JSON.parse(readFileSync(new URL('../public/fixtures/library/manifest.json', import.meta.url), 'utf8')));
  // The boxes points.bin was baked with: a changed number here needs a re-bake.
  assert.deepEqual(manifest.heroes!.map(({ name, min, max, slot }) => [name, min, max, slot?.id]), [
    ['melted clock', [-2.86, 0.93, -4.66], [-2.44, 2.32, -3.5], 'clock'],
    ['statue head', [-3.678, 0.019, -10.37], [-1.941, 1.082, -9.09], 'statue-head'],
    ['pool', [-0.2, -1.4, -6.81], [2.6, 0.18, -4.19], undefined],
    ['sky cube', [1.364, 2.07, -6.045], [2.222, 2.841, -5.175], 'sky-cube'],
    ['spiral of books', [3.036, 0, -7.287], [4.525, 2.465, -5.837], 'books'],
  ]);
  const base = baseRoom(manifest)!;
  assert.deepEqual(base.slots.map(slot => [slot.id, slot.surface, slot.anchor, slot.holds?.pose, slot.holds?.discrepancy]), [
    ['clock', 'wall', false, 'rests', null], ['statue-head', 'floor', false, 'rests', null], ['sky-cube', 'air', false, 'rests', null], ['books', 'floor', false, 'rests', null],
  ]);
  // The development fixture as declared: not spent, and with no anchor its familiarity is 0.
  assert.deepEqual(roomValues(base, [], shelf), { familiarity: 0, deviation: 25, ambiguity: 70 });
  assert.equal(roomSpent(base, [], shelf), false);
  // The globe stands where the statue head is, and its change survives storing. In the air where the cube is, the helmet hovers at
  // its true size; the rocking horse, a metre tall, has no room there and is refused.
  const decide = (slot: string, thing: string) => decideChange(base, [], shelf, slot, thing, 1, 1_800_000_000_000);
  const globe = decide('statue-head', 'globe');
  assert.ok(globe.ok && globe.changes[0].thing === 'globe');
  assert.deepEqual(parseLedger(globe.changes, base, shelf), globe.changes);
  const helmet = decide('sky-cube', 'diving-helmet');
  assert.ok(helmet.ok && helmet.changes[0].pose === 'hovers' && helmet.changes[0].factor === 1);
  assert.deepEqual(decide('sky-cube', 'rocking-horse'), { ok: false, refusal: 'fit' });
});

test('a shelf manifest with a path, a repeated id, no objects, or a thing the grammar cannot use is refused', async t => {
  const entry = { id: 'a', name: 'A', glb: 'a.glb', height: 0.5, wide: 1, deep: 1, surfaces: ['floor'], kinds: [], era: 1990, repeatable: false };
  serve(t, () => new Response(JSON.stringify({ objects: [entry, { ...entry, id: 'b' }] })));
  assert.deepEqual(await loadShelf(signal()), [{ ...entry, glb: '/fixtures/objects/a.glb' }, { ...entry, id: 'b', glb: '/fixtures/objects/a.glb' }]);
  const { height: _, ...unmeasured } = entry;
  for (const objects of [[], [{ ...entry, glb: '../a.glb' }], [{ ...entry, glb: 'https://example.com/a.glb' }], [entry, entry], [{ ...entry, name: '' }], [{ id: 'a', glb: 'a.glb' }], 'a',
    [unmeasured], ...[{ height: 0 }, { height: -1 }, { height: '0.5' }, { height: 11 }, { wide: 0 }, { deep: NaN }, { surfaces: [] }, { surfaces: ['shelf'] }, { surfaces: ['floor', 'floor'] },
      { surfaces: 'floor' }, { kinds: ['library'] }, { kinds: null }, { era: 1990.5 }, { era: 990 }, { repeatable: 'yes' }].map(change => [{ ...entry, ...change }])]) {
    serve(t, () => new Response(JSON.stringify({ objects })));
    await assert.rejects(loadShelf(signal()), /Invalid object shelf manifest/, JSON.stringify(objects));
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

const slotAt = (surface: RoomSlot['surface'], point: [number, number, number], normal: [number, number, number], facing: [number, number, number] = [0, 0, 1]): RoomSlot =>
  ({ id: 'place', surface, anchor: false, point, normal, facing, holds: null });
const near = (actual: readonly number[], expected: readonly number[], message?: string) =>
  assert.ok(actual.length === expected.length && actual.every((value, i) => Math.abs(value - expected[i]) < 1e-9), `${message ?? ''} ${actual} is not ${expected}`);

test('a thing stands on its slot\'s point at its height, and is made smaller only where it would leave the clear volume', () => {
  const box = { min: [0, 0, 0] as [number, number, number], max: [2, 1, 2] as [number, number, number] };
  const floor = { ...box, slot: slotAt('floor', [1, 0, 1], [0, 1, 0]) };
  // A model 1 x 2 x 1 asked to be 0.5 m tall: a quarter of its size, its underside on the point (1 mm clear), centred on it.
  const stood = standInSlot([1, 2, 1], floor, 0.5);
  near([stood.scale, stood.shown, ...stood.centre], [0.25, 1, 1, 0.251, 1]);
  // Twice the height at twice the size, in the same place: the size follows the height asked, not the box.
  near([standInSlot([1, 2, 1], floor, 0.998).scale, standInSlot([1, 2, 1], floor, 0.998).shown], [0.499, 1]);
  // Taller than the volume: as tall as it leaves, and it says what share that is.
  const tall = standInSlot([1, 2, 1], floor, 3);
  near([tall.scale, tall.shown, ...tall.centre], [0.499, 0.998 / 3, 1, 0.5, 1]);
  // Too wide, and a point off the middle: the nearer face limits it, and it stays centred on the point.
  near([standInSlot([8, 2, 1], floor, 0.5).scale], [1.998 / 8]);
  const aside = standInSlot([1, 2, 1], { ...box, slot: slotAt('floor', [0.25, 0, 1], [0, 1, 0]) }, 0.998);
  near([aside.scale, ...aside.centre], [0.498, 0.25, 0.499, 1]);
  // On a wall its back is on the wall and it is centred on the point up and along; under a ceiling it hangs from the point.
  const wall = standInSlot([1, 2, 1], { ...box, slot: slotAt('wall', [0, 0.5, 1], [1, 0, 0], [1, 0, 0]) }, 0.5);
  near([wall.scale, ...wall.centre], [0.25, 0.126, 0.5, 1]);
  const ceiling = standInSlot([1, 2, 1], { ...box, slot: slotAt('ceiling', [1, 1, 1], [0, -1, 0]) }, 0.5);
  near([ceiling.scale, ...ceiling.centre], [0.25, 1, 0.749, 1]);
  // Every placement is inside the volume, 1 mm clear.
  for (const { scale, centre } of [stood, tall, aside, wall, ceiling]) for (let axis = 0; axis < 3; axis++) {
    const half = [1, 2, 1][axis] * scale / 2;
    assert.ok(centre[axis] - half >= box.min[axis] + 0.001 - 1e-9 && centre[axis] + half <= box.max[axis] - 0.001 + 1e-9, `axis ${axis}`);
  }
  // A point on a side face leaves no room across it.
  assert.throws(() => standInSlot([1, 2, 1], { ...box, slot: slotAt('floor', [0, 0, 1], [0, 1, 0]) }, 0.5), /no room/);
});

test('an object in a slot is its true height, on the slot\'s point, turned to the slot\'s facing; without a height it is fitted as before', async t => {
  // The chair model spans 0.6 x 1.0 x 0.6 m with its back on its +z side; the box and slot are the library's statue head.
  const box = { min: [-3.678, 0.019, -10.37] as [number, number, number], max: [-1.941, 1.082, -9.09] as [number, number, number] };
  const point: [number, number, number] = [-2.8095, 0.019, -9.73];
  const info = serve(t, () => new Response(chairFixture({ textured: false }).bytes));
  const measure = async (facing: [number, number, number], height?: number) => {
    const cloud = await loadObjectPoints('/object.glb', { ...box, slot: slotAt('floor', point, [0, 1, 0], facing) }, signal(), 1, height);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], back = [0, 0, 0];
    let backs = 0;
    for (let i = 0; i < cloud.count * 3; i += 3) {
      for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], cloud.positions[i + axis]); max[axis] = Math.max(max[axis], cloud.positions[i + axis]); }
      assert.ok(Math.abs(Math.hypot(cloud.normals![i], cloud.normals![i + 1], cloud.normals![i + 2]) - 1) < 1e-4);
    }
    // where the chair's back is: the points in its top quarter, against the slot's point
    for (let i = 0; i < cloud.count * 3; i += 3) if (cloud.positions[i + 1] > min[1] + 0.75 * (max[1] - min[1])) {
      backs++; back[0] += cloud.positions[i] - point[0]; back[2] += cloud.positions[i + 2] - point[2];
    }
    return { min, max, back: [back[0] / backs, back[2] / backs], size: max.map((value, axis) => value - min[axis]) };
  };
  const stood = await measure([0, 0, 1], 0.5);
  near(stood.size.map(value => Math.round(value * 1e4) / 1e4), [0.3, 0.5, 0.3], 'size');
  assert.ok(Math.abs(stood.min[1] - (point[1] + 0.001)) < 1e-4, 'it does not stand on the point');
  for (const axis of [0, 2]) assert.ok(Math.abs((stood.min[axis] + stood.max[axis]) / 2 - point[axis]) < 1e-4, `axis ${axis} is not centred on the point`);
  assert.equal(info.mock.calls.length, 0);
  // Turned with the slot: the chair's back goes where the slot faces.
  assert.ok(stood.back[1] > 0.1 && Math.abs(stood.back[0]) < 0.01, `facing +z: ${stood.back}`);
  for (const [facing, x, z] of [[[1, 0, 0], 1, 0], [[0, 0, -1], 0, -1], [[-1, 0, 0], -1, 0]] as const) {
    const { back, size } = await measure([...facing], 0.5);
    assert.ok(Math.abs(back[0] - x * stood.back[1]) < 0.01 && Math.abs(back[1] - z * stood.back[1]) < 0.01, `facing ${facing}: ${back}`);
    assert.ok(Math.abs(size[1] - 0.5) < 1e-4);
  }
  // Taller than the clear volume: it is made to fit, and the console says so.
  const tall = await measure([0, 0, 1], 2);
  assert.ok(Math.abs(tall.size[1] - (1.063 - 0.002)) < 1e-4);
  assert.match(String(info.mock.calls[0].arguments[0]), /2 m tall does not fit the slot "place"; it is shown at 0\.53 of that/);
  // No height: fitted to the box whatever the slot says, as the menu's choices are.
  const fitted = await measure([1, 0, 0]);
  assert.ok(Math.abs(fitted.size[1] - (1.063 - 0.002)) < 1e-4 && fitted.back[1] > 0.1 && Math.abs(fitted.back[0]) < 0.01);
});

test('each pose says how a thing is turned, lifted and sunk, and how it stands when its arrival\'s move starts', () => {
  const floor = slotAt('floor', [0, 0, 0], [0, 1, 0]), air = slotAt('air', [0, 0, 0], [0, 1, 0]), wall = slotAt('wall', [0, 0, 0], [1, 0, 0], [1, 0, 0]);
  const turns = (turn: Posture['turn'], v: [number, number, number]) => new Vector3(...v).applyQuaternion(turn).toArray().map(value => Math.round(value * 1e4) / 1e4);
  const plain = (posture: Posture) => [...turns(posture.turn, [0, 1, 0]), ...turns(posture.turn, [0, 0, 1]), posture.lift, posture.sunk];
  const upright = [0, 1, 0, 0, 0, 1, 0, 0];
  for (const other of [false, true]) assert.deepEqual([plain(poseIn('rests', floor, other).stands), plain(poseIn('rests', floor, other).from)], [upright, upright]);
  // 0.3 m of air under a hover, which rises from where it would rest; in the air the slot's point is already under it
  assert.deepEqual([poseIn('hovers', floor).stands.lift, poseIn('hovers', floor).from.lift], [0.3, 0]);
  assert.deepEqual([poseIn('hovers', air).stands.lift, poseIn('hovers', air).from.lift], [0, -0.3]);
  // dropped: it rests, having come from that hover
  assert.deepEqual([plain(poseIn('dropped', floor).stands), poseIn('dropped', floor).from.lift], [upright, 0.3]);
  // 40% of a sunk thing is behind the surface; it starts wholly behind it. The other way it is tilted, and stays so as it comes.
  assert.deepEqual([plain(poseIn('sunk', floor).stands), plain(poseIn('sunk', floor).from)], [[0, 1, 0, 0, 0, 1, 0, 0.4], [0, 1, 0, 0, 0, 1, 0, 1]]);
  const tilted = poseIn('sunk', floor, true);
  assert.ok(Math.abs(turns(tilted.stands.turn, [0, 1, 0])[1] - Math.cos(20 * Math.PI / 180)) < 1e-4 && tilted.stands.sunk === 0.4);
  assert.deepEqual(turns(tilted.from.turn, [0, 1, 0]), turns(tilted.stands.turn, [0, 1, 0]));
  // leans: its top goes back 15 degrees, away from the way the slot faces (the other way: to its side); it starts upright
  const s = Math.round(Math.sin(15 * Math.PI / 180) * 1e4) / 1e4, c = Math.round(Math.cos(15 * Math.PI / 180) * 1e4) / 1e4;
  assert.deepEqual([turns(poseIn('leans', floor).stands.turn, [0, 1, 0]), plain(poseIn('leans', floor).from)], [[0, c, -s], upright]);
  assert.deepEqual(turns(poseIn('leans', wall).stands.turn, [0, 1, 0]), [-s, c, 0]);
  assert.deepEqual([turns(poseIn('leans', floor, true).stands.turn, [0, 1, 0]), turns(poseIn('leans', floor, true).stands.turn, [0, 0, 1])], [[-s, c, 0], [0, 0, 1]]);
  // turned: its front to the wall behind it (the other way: to a corner); it starts facing the room
  assert.deepEqual([turns(poseIn('turned', floor).stands.turn, [0, 0, 1]), plain(poseIn('turned', floor).from)], [[0, 0, -1], upright]);
  const corner = Math.round(Math.SQRT1_2 * 1e4) / 1e4;
  assert.deepEqual(turns(poseIn('turned', floor, true).stands.turn, [0, 0, 1]), [corner, 0, -corner]);
  // mounted: upright with its back to the wall, as a thing resting there is; the other way it stands on the wall as on a floor
  assert.deepEqual([plain(poseIn('mounted', wall).stands), plain(poseIn('mounted', wall).from)], [upright, upright]);
  assert.deepEqual(turns(poseIn('mounted', wall, true).stands.turn, [0, 1, 0]), [1, 0, 0]);
  assert.deepEqual(poseIn('mounted', wall, true).from, poseIn('mounted', wall, true).stands);

  // The placement with air under the thing, or part of it behind the surface. A model 1 x 2 x 1 in a volume 2 x 1 x 2.
  const box = { min: [0, 0, 0] as [number, number, number], max: [2, 1, 2] as [number, number, number], slot: slotAt('floor', [1, 0, 1], [0, 1, 0]) };
  const hover = standInSlot([1, 2, 1], box, 0.5, { lift: 0.3 });
  near([hover.scale, hover.shown, ...hover.centre], [0.25, 1, 1, 0.551, 1]);
  // the air is not scaled: a thing too tall to hover there is made smaller under the same 0.3 m
  const cramped = standInSlot([1, 2, 1], box, 3, { lift: 0.3 });
  near([cramped.scale, cramped.centre[1] + cramped.scale], [0.349, 0.999]);
  // sunk: only the part that shows has to fit, so a thing taller than the volume can stand in it
  const sunk = standInSlot([1, 2, 1], box, 1.6, { sunk: 0.4 });
  near([sunk.scale, sunk.shown, sunk.centre[1] + sunk.scale, sunk.centre[1] - sunk.scale], [0.8, 1, 0.961, -0.639]);
  // a tipped thing's bounds are taller than it is: its size follows its own height
  near([standInSlot([1, 2.2, 1.5], box, 0.5, { upright: 2 }).scale], [0.25]);
});

test('a model stands in every pose at its true height, a sunk one cut off at the surface, with the move its arrival makes', async t => {
  // The chair model spans 0.6 x 1.0 x 0.6 m with its back on its +z side; at 0.5 m it is 0.3 x 0.5 x 0.3. The statue head's box and slot.
  const box = { min: [-3.678, 0.019, -10.37] as [number, number, number], max: [-1.941, 1.082, -9.09] as [number, number, number] };
  const point: [number, number, number] = [-2.8095, 0.019, -9.73], floor = point[1] + 0.001;
  const info = serve(t, () => new Response(chairFixture({ textured: false }).bytes));
  const span = (p: ArrayLike<number>) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], back = [0, 0];
    for (let i = 0; i < p.length; i += 3) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], p[i + axis]); max[axis] = Math.max(max[axis], p[i + axis]); }
    // where the chair's back is: the points in its top quarter, against the middle of its bounds
    let backs = 0;
    for (let i = 0; i < p.length; i += 3) if (p[i + 1] > min[1] + 0.75 * (max[1] - min[1])) { backs++; back[0] += p[i] - (min[0] + max[0]) / 2; back[1] += p[i + 2] - (min[2] + max[2]) / 2; }
    return { min, max, size: max.map((value, axis) => value - min[axis]), back: back.map(value => value / backs) };
  };
  const stand = async (pose: Pose, other = false, slot = slotAt('floor', point, [0, 1, 0]), height = 0.5, volume = box) => {
    const cloud = await loadObjectPoints('/object.glb', { ...volume, slot }, signal(), 1, height, { pose, other });
    const { centre, axis, angle, offset } = cloud.move!, from = new Float32Array(cloud.count * 3), cos = Math.cos(angle), sin = Math.sin(angle);
    // where its move starts: each point turned about the axis through the centre, and shifted
    for (let i = 0; i < from.length; i += 3) {
      const d = [0, 1, 2].map(k => cloud.positions[i + k] - centre[k]), dot = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
      const cross = [axis[1] * d[2] - axis[2] * d[1], axis[2] * d[0] - axis[0] * d[2], axis[0] * d[1] - axis[1] * d[0]];
      for (let k = 0; k < 3; k++) from[i + k] = centre[k] + d[k] * cos + cross[k] * sin + axis[k] * dot * (1 - cos) + offset[k];
    }
    return { cloud, move: cloud.move!, now: span(cloud.positions.subarray(0, cloud.count * 3)), from: span(from) };
  };
  const about = (actual: readonly number[], expected: readonly number[], message: string, slack = 1e-3) =>
    assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < slack), `${message}: ${actual} is not ${expected}`);
  /** Standing as a resting thing does: upright, 0.3 x 0.5 x 0.3, on the floor (or `lift` over it), centred on the point, its back toward +z. */
  const rested = (at: ReturnType<typeof span>, message: string, lift = 0, slack = 1e-3) => {
    about(at.size, [0.3, 0.5, 0.3], `${message}, size`, slack);
    about([at.min[1], (at.min[0] + at.max[0]) / 2, (at.min[2] + at.max[2]) / 2], [floor + lift, point[0], point[2]], `${message}, place`, slack);
    assert.ok(at.back[1] > 0.05 && Math.abs(at.back[0]) < 0.01, `${message}, back: ${at.back}`);
  };

  const rests = await stand('rests');
  rested(rests.now, 'rests'); rested(rests.from, 'rests, from');
  assert.deepEqual([rests.move.arrival, rests.move.cut], ['assembles', null]);
  about([rests.move.angle, ...rests.move.offset], [0, 0, 0, 0], 'rests moves nowhere', 1e-9);

  const hovers = await stand('hovers');
  rested(hovers.now, 'hovers', 0.3); rested(hovers.from, 'hovers, from');
  assert.equal(hovers.move.arrival, 'rises');
  const inAir = await stand('hovers', false, slotAt('air', point, [0, 1, 0]));
  rested(inAir.now, 'hovers in the air'); rested(inAir.from, 'hovers in the air, from', -0.3);

  const dropped = await stand('dropped');
  rested(dropped.now, 'dropped'); rested(dropped.from, 'dropped, from', 0.3);
  assert.equal(dropped.move.arrival, 'falls');

  // Sunk: the top 60% shows and the points stop at the floor; it starts with its top at the floor.
  const sunk = await stand('sunk');
  about([sunk.now.max[1], sunk.from.max[1]], [floor + 0.3, floor], 'sunk');
  // its lowest row of points is within one row (14 mm at this density) of the floor, never under it
  assert.ok(sunk.now.min[1] >= floor && sunk.now.min[1] < floor + 0.015, `sunk, lowest: ${sunk.now.min[1]}`);
  about([sunk.now.size[0], sunk.now.size[2]], [0.3, 0.3], 'sunk, across');
  assert.ok(sunk.cloud.count < rests.cloud.count * 0.8 && sunk.cloud.count > 0);
  assert.equal(sunk.move.arrival, 'pushes-up');
  about(sunk.move.cut!, [0, 1, 0, floor - 1e-4], 'sunk, cut', 1e-9);
  for (let i = 1; i < sunk.cloud.count * 3; i += 3) assert.ok(sunk.cloud.positions[i] >= sunk.move.cut![3], 'a point under the cut');
  const tilted = await stand('sunk', true);
  about([tilted.from.max[1]], [floor], 'sunk tilted', 0.01);   // the points' top, which on a tipped face is not quite the model's
  assert.ok(tilted.now.min[1] >= floor && tilted.now.min[1] < floor + 0.015 && tilted.now.max[1] - floor > 0.3 && tilted.now.size[1] < 0.4 && tilted.now.size[0] > 0.31, `sunk tilted: ${tilted.now.size}`);

  // Leans: tipped back 15 degrees and still on the floor. It takes more room than upright and no more than its box tipped
  // (0.5 cos 15 + 0.3 sin 15 tall, 0.3 cos 15 + 0.5 sin 15 deep), which is what grammar-decide.ts allows it. It starts as it would rest.
  const cos15 = Math.cos(15 * Math.PI / 180), sin15 = Math.sin(15 * Math.PI / 180), tall = 0.5 * cos15 + 0.3 * sin15, wide = 0.3 * cos15 + 0.5 * sin15;
  const within = (value: number, least: number, most: number, message: string) => assert.ok(value > least && value <= most + 1e-3, `${message}: ${value} is not in ${least}..${most}`);
  const leans = await stand('leans');
  about([leans.now.min[1], leans.now.size[0]], [floor, 0.3], 'leans', 0.01);
  within(leans.now.size[1], 0.5, tall, 'leans, height'); within(leans.now.size[2], 0.3, wide, 'leans, depth');
  assert.ok(leans.now.back[1] < rests.now.back[1] - 0.02, 'its top has not gone back');
  rested(leans.from, 'leans, from', 0, 0.01);
  about([leans.move.angle], [15 * Math.PI / 180], 'leans, angle', 1e-6);
  assert.equal(leans.move.arrival, 'tips');
  const aside = await stand('leans', true);
  about([aside.now.min[1], aside.now.size[2]], [floor, 0.3], 'leans to its side', 0.01);
  within(aside.now.size[1], 0.5, tall, 'leans to its side, height'); within(aside.now.size[0], 0.3, wide, 'leans to its side, width');
  rested(aside.from, 'leans to its side, from', 0, 0.01);

  // Turned: the same room, its back the other way; it starts facing the room.
  const turned = await stand('turned');
  about([...turned.now.size, turned.now.min[1]], [0.3, 0.5, 0.3, floor], 'turned');
  assert.ok(turned.now.back[1] < -0.05, `turned, back: ${turned.now.back}`);
  rested(turned.from, 'turned, from');
  about([turned.move.angle], [Math.PI], 'turned, angle', 1e-6);
  assert.equal(turned.move.arrival, 'turns');
  const corner = await stand('turned', true);
  about([corner.now.size[0], corner.now.size[2]], [0.3 * Math.SQRT2, 0.3 * Math.SQRT2], 'turned to a corner', 0.01);
  rested(corner.from, 'turned to a corner, from', 0, 0.01);

  // Mounted on a wall: upright with its back to it, as it rests there; the other way it stands on the wall, its height along the normal.
  const room = { min: [0, 0, 0] as [number, number, number], max: [1, 2, 2] as [number, number, number] };
  const wall = slotAt('wall', [0, 1, 1], [1, 0, 0], [1, 0, 0]);
  const mounted = await stand('mounted', false, wall, 0.5, room);
  about([...mounted.now.size, mounted.now.min[0], (mounted.now.min[1] + mounted.now.max[1]) / 2], [0.3, 0.5, 0.3, 0.001, 1], 'mounted');
  assert.equal(mounted.move.arrival, 'assembles');
  const based = await stand('mounted', true, wall, 0.5, room);
  about([...based.now.size, based.now.min[0], (based.now.min[1] + based.now.max[1]) / 2], [0.5, 0.3, 0.3, 0.001, 1], 'mounted by its base');
  about(based.from.size, based.now.size, 'mounted by its base, from');

  // Every pose stands inside the clear volume, so the room draws all of it.
  for (const { now } of [rests, hovers, inAir, dropped, sunk, tilted, leans, aside, turned, corner]) for (let axis = 0; axis < 3; axis++) {
    assert.ok(now.min[axis] >= box.min[axis] && now.max[axis] <= box.max[axis], `axis ${axis}`);
  }
  assert.equal(info.mock.calls.length, 0);
  // Too tall to hover there at its height: made smaller under the same 0.3 m of air, and the console says so.
  const cramped = await stand('hovers', false, undefined, 2);
  about([cramped.now.min[1], cramped.now.max[1]], [floor + 0.3, box.max[1] - 0.001], 'too tall to hover');
  assert.match(String(info.mock.calls[0].arguments[0]), /2 m tall does not fit the slot "place" in the pose "hovers"; it is shown at 0\.38 of that/);
});

test('wrong scale: at each allowed size the thing stands on its slot\'s surface, that many times its true height where the slot has room', async t => {
  // The chair model spans 0.6 x 1.0 x 0.6 m; say its true height is 0.6 m. The books' box and slot: 1.489 m wide, 2.465 tall,
  // 1.45 deep. Measured from its points, so to within a row of dots.
  const box = { min: [3.036, 0, -7.287] as [number, number, number], max: [4.525, 2.465, -5.837] as [number, number, number] };
  const point: [number, number, number] = [3.7805, 0, -6.562], row = 0.015;
  const info = serve(t, () => new Response(chairFixture({ textured: false }).bytes));
  for (const factor of SCALE_FACTORS) {
    const cloud = await loadObjectPoints('/object.glb', { ...box, slot: slotAt('floor', point, [0, 1, 0]) }, signal(), 1, 0.6 * factor);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < cloud.count * 3; i++) { min[i % 3] = Math.min(min[i % 3], cloud.positions[i]); max[i % 3] = Math.max(max[i % 3], cloud.positions[i]); }
    const tall = Math.min(0.6 * factor, (1.45 - 0.002) / 0.6);   // as tall as asked, or as its depth leaves it
    assert.ok(Math.abs(max[1] - min[1] - tall) < row, `x${factor}: ${max[1] - min[1]} m tall, not ${tall}`);
    assert.ok(Math.abs(max[0] - min[0] - tall * 0.6) < row, `x${factor}: it lost its proportion`);
    assert.ok(min[1] >= point[1] + 0.001 - 1e-6 && min[1] < point[1] + row, `x${factor}: it does not stand on the surface`);
    for (const axis of [0, 2]) assert.ok(Math.abs((min[axis] + max[axis]) / 2 - point[axis]) < row, `x${factor}: axis ${axis} is not centred on the point`);
    for (let axis = 0; axis < 3; axis++) assert.ok(min[axis] >= box.min[axis] && max[axis] <= box.max[axis], `x${factor}: axis ${axis} leaves the slot`);
  }
  // Only six times (3.6 m) leaves the slot: that one is made to fit, and the console says so.
  assert.equal(info.mock.calls.length, 1);
  assert.match(String(info.mock.calls[0].arguments[0]), /a thing 3\.\d+ m tall does not fit the slot "place"; it is shown at 0\.67 of that/);
});

test('repetition: one copy stands in the slot and one in each place given, each in its place\'s pose, all within the copies\' share of points', async t => {
  // The chair at 0.5 m is 0.3 m wide and deep. It stands in a floor slot; a copy stands against a wall that looks along -x, and
  // a copy floats in water (sunk: its lower 40% under the plane, cut off there).
  const box = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] }, slot = slotAt('floor', [0.5, 0, 0.5], [0, 1, 0]);
  const wall = { min: [4, 0, 4] as [number, number, number], max: [5, 2, 6] as [number, number, number], slot: slotAt('wall', [5, 1, 5], [-1, 0, 0], [-1, 0, 0]) };
  const water = { min: [8, -0.03, 8] as [number, number, number], max: [9, 1, 9] as [number, number, number], slot: slotAt('floor', [8.5, -0.03, 8.5], [0, 1, 0]), pose: 'sunk' as const };
  const info = serve(t, () => new Response(chairFixture({ textured: false }).bytes));
  const load = (places: (typeof wall | typeof water)[], density = 1, height = 0.5) => loadObjectPoints('/object.glb', { ...box, slot }, signal(), density, height, { pose: 'rests', places });
  const one = await load([]), three = await load([wall, water]);
  assert.equal(one.parts, undefined);
  // which points are which copy, and the middle of each copy's own volume
  assert.deepEqual(three.parts!.map(part => part.mid), [[0.5, 0.5, 0.5], [4.5, 1, 5], [8.5, 0.485, 8.5]]);
  assert.equal(three.parts!.reduce((sum, part) => sum + part.count, 0), three.count);
  assert.equal(three.positions.length, three.count * 3);
  assert.ok(three.parts![0].count === one.count && Math.abs(three.parts![1].count / one.count - 1) < 0.05, `${three.parts!.map(part => part.count)} against ${one.count}`);
  const span = (from: number, count: number) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = from * 3; i < (from + count) * 3; i++) { min[i % 3] = Math.min(min[i % 3], three.positions[i]); max[i % 3] = Math.max(max[i % 3], three.positions[i]); }
    return { min, max };
  };
  const [a, b, c] = three.parts!.map((part, i) => span(three.parts!.slice(0, i).reduce((sum, each) => sum + each.count, 0), part.count));
  const about = (actual: number[], expected: number[], message: string) => assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < 0.015), `${message}: ${actual} is not ${expected}`);
  about([...a.min, ...a.max], [0.35, 0.001, 0.35, 0.65, 0.501, 0.65], 'in the slot');
  // against the wall: its back on it, centred on the point up and along, turned to face out of the wall
  about([...b.min, ...b.max], [4.699, 0.75, 4.85, 4.999, 1.25, 5.15], 'against the wall');
  // in the water: 0.3 m of it shows, and no point is under the water's plane
  about([c.max[1], c.min[0], c.max[0]], [0.271, 8.35, 8.65], 'in the water');
  assert.ok(c.min[1] >= -0.03 && c.min[1] < -0.03 + 0.016 && three.parts![2].count < one.count * 0.8, `in the water, lowest: ${c.min[1]}`);
  assert.equal(info.mock.calls.length, 0);
  // Too tall for its slot (1.5 m in a slot 1 m tall): the copies stand at the size the first came out.
  const tall = await load([wall], 1, 1.5);
  assert.match(String(info.mock.calls[0].arguments[0]), /1\.5 m tall does not fit the slot "place"; it is shown at 0\.67 of that/);
  let top = -Infinity, bottom = Infinity;
  for (let i = tall.parts![0].count * 3 + 1; i < tall.count * 3; i += 3) { top = Math.max(top, tall.positions[i]); bottom = Math.min(bottom, tall.positions[i]); }
  assert.ok(Math.abs(top - bottom - 0.998) < 0.015, `the copy on the wall is ${top - bottom} m tall`);
  // Six copies sampled far more densely than they could all be drawn: each coarsens to its sixth of the 600,000 points copies share.
  const dense = await load([wall, wall, wall, wall, wall], 8);
  assert.ok(dense.count <= 600_000 && dense.count > 400_000 && dense.parts!.every(part => part.count <= 100_000), `${dense.parts!.map(part => part.count)}`);
});

test('absence: the slot\'s floor is laid again from the most complete piece of real floor beside it, and nothing of what was in the box is kept', t => {
  // A slot 1 m square. Its floor is a point every 4 cm, 1 cm over the slot's plane, carpet-coloured.
  const hero = { name: 'place', min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number], slot: slotAt('floor', [0.5, 0, 0.5], [0, 1, 0]) };
  const info = t.mock.method(console, 'info', () => {});
  const CARPET = [0.5, 0.15, 0.2], PALE = [0.9, 0.9, 0.9], BLUE = [0.1, 0.2, 0.9];
  const P: number[] = [], C: number[] = [], N: number[] = [];
  const add = (x: number, y: number, z: number, colour = CARPET, normal = [0, 1, 0]) => { P.push(x, y, z); C.push(...colour); N.push(...normal); };
  const steps = Array.from({ length: 25 }, (_, k) => 0.02 + 0.04 * k);   // 0.02 to 0.98
  for (const x of steps) for (const z of steps) {
    add(x, 0.01, z, PALE);                         // in the box: finer and of the thing's colours in a recording; none of it is kept
    add(x, 0.01, z - 1);                           // the piece beside it toward -z: all carpet
    add(x, 0.01, z + 1, x < 0.5 ? BLUE : CARPET);  // the piece toward +z: half of it is something else lying there
    if (x < 0.5 && z < 0.5) add(x, -0.01, z);      // real floor that lies just under the box, so stays in the room
  }
  // not floor, in the piece toward -z: a point too far over the plane, and one of another colour
  add(0.5, 0.5, -0.5); add(0.33, 0.01, -0.33, PALE);
  const room: PointCloud = { count: P.length / 3, positions: Float32Array.from(P), colors: Float32Array.from(C), normals: Float32Array.from(N), spacing: 0.01, ordered: true, heroes: [hero] };
  const floor = floorOf(hero, room);
  // The piece toward -z, moved across by the slot's depth, less the quarter where the room's own floor remains: 625 - 144.
  assert.equal(floor.count, 481);
  assert.equal(floor.normals!.length, floor.count * 3);
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  for (let i = 0; i < floor.count * 3; i += 3) {
    const [x, y, z] = floor.positions.subarray(i, i + 3);
    assert.ok(x > 0 && x < 1 && z > 0 && z < 1 && close(y, 0.01) && !(x < 0.49 && z < 0.49), `a floor point at ${x}, ${y}, ${z}`);
    assert.ok(steps.some(step => close(step, x)) && steps.some(step => close(step, z)), `${x}, ${z} is not a point of the floor beside it`);
    assert.ok(CARPET.every((value, axis) => close(floor.colors[i + axis], value)) && floor.normals![i + 1] === 1);
  }
  assert.match(String(info.mock.calls[0].arguments[0]), /the floor of the slot "place" is laid again: 481 points copied from the floor beside it, over 100% of it\. A copy, not the recording/);
  // It stands in for the thing: the box's own points go, the floor comes.
  const after = replaceHero(room, 0, floor);
  assert.equal(after.count, room.count - 625 + 481);
  assert.equal(after.heroes![0].count, 481);
  // A room with no floor round the slot has none to lay.
  assert.equal(floorOf(hero, { ...room, count: 0 }).count, 0);
});

test('a placed thing is lit from above and takes the room\'s cast', () => {
  const room: PointCloud = { count: 2, positions: new Float32Array(6), colors: Float32Array.from([0.8, 0.4, 0.2, 0.4, 0.2, 0.1]) };
  const cast = roomCast(room);
  assert.ok(cast[0] === 1 && Math.abs(cast[1] - 0.5) < 1e-6 && Math.abs(cast[2] - 0.25) < 1e-6);
  // three white points: facing up, sideways, down
  const thing: PointCloud = { count: 3, positions: new Float32Array(9), colors: new Float32Array(9).fill(1), normals: Float32Array.from([0, 1, 0, 1, 0, 0, 0, -1, 0]) };
  litLikeRoom(thing, cast);
  const [up, side, down] = [0, 3, 6].map(i => [...thing.colors.subarray(i, i + 3)]);
  assert.equal(up[0], 1);                                             // the brightest channel of an upward face keeps its light
  assert.ok(up[1] < 1 && up[2] < up[1] && up[1] > 0.5 && up[2] > 0.25, `${up}`);   // warmer, and not all the way to the cast
  assert.ok(side[0] < up[0] && down[0] < side[0] && down[0] > 0.2, `${up[0]}, ${side[0]}, ${down[0]}`);
  for (const axis of [1, 2]) assert.ok(Math.abs(side[axis] / side[0] - up[axis] / up[0]) < 1e-6);   // shading does not change the hue
  const bare: PointCloud = { count: 1, positions: new Float32Array(3), colors: Float32Array.from([1, 1, 1]) };
  litLikeRoom(bare, cast);
  assert.deepEqual([...bare.colors], [1, 1, 1]);   // without normals it is left as it is
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
