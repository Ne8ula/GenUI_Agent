import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildAestheticRoom, AESTHETIC_PALETTE_SAMPLES } from '../src/room/aesthetic-room.ts';
import { sampleSurfacePoints } from '../src/room/surface-points.ts';

test('aesthetic study is bounded, deterministic and entirely authored', () => {
  const first = buildAestheticRoom(), second = buildAestheticRoom();
  assert.deepEqual(first, second);
  const g = first.geometry;
  assert.ok(g.positions.length > 1000 && g.positions.length <= 600000);
  assert.equal(g.positions.length % 3, 0);
  assert.equal(g.colors.length, g.positions.length);
  assert.ok(g.indices.length <= 1200000);
  assert.equal(g.indices.length, g.provenance.length * 3);
  assert.equal(g.samplingGroups!.length, g.provenance.length);
  assert.ok(g.samplingGroups!.every(group => Number.isSafeInteger(group) && group >= 0));
  assert.ok(new Set(g.samplingGroups).size > first.objects.length);
  assert.ok(g.positions.every(Number.isFinite));
  assert.ok(g.colors.every(c => Number.isFinite(c) && c >= 0 && c <= 1));
  assert.ok(g.indices.every(i => Number.isInteger(i) && i >= 0 && i < g.positions.length / 3));
  assert.deepEqual(new Set(g.provenance), new Set(['authored-room-shell', 'authored-aesthetic-object']));
  for (let i = 0; i < g.positions.length; i += 3) {
    assert.ok(Math.abs(g.positions[i]!) <= 1.581);
    assert.ok(Math.abs(g.positions[i + 1]!) <= 2.081);
    assert.ok(g.positions[i + 2]! >= -.081 && g.positions[i + 2]! <= 2.681);
  }
});

test('thin furniture overlays have separate point sampling partitions', () => {
  const { geometry, objects } = buildAestheticRoom();
  for (const name of ['cabinet', 'television']) {
    const object = objects.find(o => o.id === name)!;
    const groups = geometry.samplingGroups!.slice(object.firstTriangle, object.firstTriangle + object.triangleCount);
    assert.ok(new Set(groups).size >= 4, `${name} should retain distinct closed-part spacing`);
  }
});

test('visible TV screen and cabinet fronts retain samples instead of being erased by hidden bodies', () => {
  const { geometry } = buildAestheticRoom();
  const { positions } = sampleSurfacePoints(geometry);
  let screen = 0, cabinet = 0, window = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (x > -1.16 && x < -1.15 && y > .25 && y < 1.15 && z > .93 && z < 1.42) screen++;
    if (x > -1.008 && x < -.998 && y > -.4 && y < 1.4 && z > .2 && z < .65) cabinet++;
    if (y > 1.87 && y < 1.88 && x > -.7 && x < .5 && z > 1.2 && z < 2.2) window++;
  }
  assert.ok(screen > 70, `Only ${screen} screen-front samples`);
  assert.ok(cabinet > 100, `Only ${cabinet} cabinet-front samples`);
  assert.ok(window > 150, `Only ${window} window-front samples`);
});

test('every triangle belongs to a documented complete object with source views and limitations', () => {
  const { geometry, objects } = buildAestheticRoom();
  assert.deepEqual(objects.map(o => o.id), ['room', 'window', 'sofa', 'cabinet', 'television', 'lamp', 'desk', 'printer', 'chair', 'door']);
  let cursor = 0;
  for (const object of objects) {
    assert.equal(object.firstTriangle, cursor);
    assert.ok(object.triangleCount > 10);
    assert.ok(object.assumptions.length > 50);
    assert.ok(object.sourceViews.length > 0 && object.sourceViews.every(v => Number.isInteger(v) && v >= 1 && v <= 7));
    const expected = object.id === 'room' ? 'authored-room-shell' : 'authored-aesthetic-object';
    assert.ok(geometry.provenance.slice(cursor, cursor + object.triangleCount).every(p => p === expected));
    cursor += object.triangleCount;
  }
  assert.equal(cursor, geometry.indices.length / 3);
});

test('shell encloses the room in every direction and cameras remain inside', () => {
  const { geometry, objects, views } = buildAestheticRoom();
  const shell = objects[0]!;
  const buffer = new THREE.BufferGeometry();
  buffer.setAttribute('position', new THREE.Float32BufferAttribute(geometry.positions, 3));
  buffer.setIndex(geometry.indices.slice(shell.firstTriangle * 3, (shell.firstTriangle + shell.triangleCount) * 3));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(buffer, material);
  mesh.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  for (const { camera } of views) {
    assert.ok(Math.abs(camera.position[0]!) < 1.5 && Math.abs(camera.position[1]!) < 2);
    assert.ok(camera.position[2]! > 0 && camera.position[2]! < 2.6);
    for (const direction of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
      ray.set(new THREE.Vector3().fromArray(camera.position), new THREE.Vector3().fromArray(direction));
      const hits = ray.intersectObject(mesh);
      assert.ok(hits.length > 0 && hits[0]!.distance > 0 && hits[0]!.distance < 5);
    }
  }
  buffer.dispose(); material.dispose();
});

test('cabinet is continuous across its complete length, including the missing central area', () => {
  const { geometry, objects } = buildAestheticRoom();
  const cabinet = objects.find(o => o.id === 'cabinet')!;
  const buffer = new THREE.BufferGeometry();
  buffer.setAttribute('position', new THREE.Float32BufferAttribute(geometry.positions, 3));
  buffer.setIndex(geometry.indices.slice(cabinet.firstTriangle * 3, (cabinet.firstTriangle + cabinet.triangleCount) * 3));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(buffer, material); mesh.updateMatrixWorld();
  for (let y = -.45; y < 1.46; y += .05) {
    const ray = new THREE.Raycaster(new THREE.Vector3(0, y, .4), new THREE.Vector3(-1, 0, 0));
    const hits = ray.intersectObject(mesh);
    assert.ok(hits.length > 0 && hits[0]!.distance < 1.4, `Missing cabinet at y=${y}`);
  }
  buffer.dispose(); material.dispose();
});

test('sampled palette carries reproducible source coordinates and exact encoded median colors', () => {
  assert.equal(AESTHETIC_PALETTE_SAMPLES.length, 14);
  for (const sample of AESTHETIC_PALETTE_SAMPLES) {
    assert.match(sample.imageSha256, /^[0-9a-f]{64}$/);
    const [x, y, width, height] = sample.crop;
    assert.ok(width > 0 && height > 0 && x >= 0 && y >= 0 && x + width <= 480 && y + height <= 640);
    assert.equal(sample.hex, '#' + sample.medianRgb.map(v => v.toString(16).padStart(2, '0')).join(''));
  }
});
