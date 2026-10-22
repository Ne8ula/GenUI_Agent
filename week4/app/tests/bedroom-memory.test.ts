import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as memoryView from '../src/bedroom/memory.ts';
import { createMemory, applyMemory, createTeddy, updateTeddy, placeTeddy } from '../src/bedroom/memory.ts';

test('Matrix renders sampled teddy points with hidden-surface depth, preserving edits and resources', () => {
  const teddy = createTeddy();
  const clouds = teddy.children.filter((child): child is THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> => child instanceof THREE.Points);
  assert.ok(clouds.length > 0, 'Teddy must have a sampled Matrix representation');
  const meshes = teddy.children.filter((child): child is THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> => child instanceof THREE.Mesh);
  const anchor = teddy.position.toArray(), identity = teddy.uuid;
  const geometry = clouds.map(cloud => cloud.geometry);
  const count = clouds.reduce((sum, cloud) => sum + cloud.geometry.getAttribute('position').count, 0);
  assert.ok(count > 3000 && count < 60000, 'Bounded, readable surface samples');
  for (const cloud of clouds) assert.ok([...cloud.geometry.getAttribute('position').array].every(Number.isFinite));
  updateTeddy(teddy, { present: true, color: 'cream' });
  for (let i = 0; i < 12; i++) {
    memoryView.setTeddyMode(teddy, 'matrix');
    assert.ok(meshes.every(mesh => !mesh.material.colorWrite && mesh.material.depthWrite));
    assert.ok(clouds.every(cloud => cloud.visible));
    updateTeddy(teddy, { present: true, color: 'blue' });
    assert.equal((teddy.getObjectByName('body-matrix') as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>).material.color.getHexString(), '7caec8');
    memoryView.setTeddyMode(teddy, 'surface');
    assert.ok(meshes.every(mesh => mesh.material.colorWrite));
    assert.ok(clouds.every(cloud => !cloud.visible));
  }
  assert.deepEqual(clouds.map(cloud => cloud.geometry), geometry);
  assert.deepEqual(teddy.position.toArray(), anchor);
  assert.equal(teddy.uuid, identity);
  updateTeddy(teddy, { present: false, color: 'blue' });
  memoryView.setTeddyMode(teddy, 'matrix');
  assert.equal(teddy.visible, false, 'Representation changes must not restore a removed bear');
});

test('plush detail has bounded fabric texture, a stitched face and finite geometry', () => {
  const teddy = createTeddy();
  const body = teddy.getObjectByName('body') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  assert.ok(body.material.bumpMap, 'Plush fabric must not be a smooth plastic surface');
  assert.ok(body.material.bumpMap.image.width <= 256);
  assert.ok(teddy.getObjectByName('mouth'));
  assert.ok(teddy.children.some(child => child instanceof THREE.LineSegments), 'Short pile adds a fabric silhouette');
  teddy.traverse(child => {
    if (child instanceof THREE.Mesh) assert.ok([...child.geometry.getAttribute('position').array].every(Number.isFinite));
  });
});

test('teddy sits on the visible surface at its authored anchor without changing the scan', () => {
  const teddy = createTeddy();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.position.set(.2, 3.4, -.4); mesh.updateMatrixWorld();
  const positions = [...geometry.getAttribute('position').array];
  placeTeddy(teddy, mesh);
  assert.ok(Math.abs(teddy.position.z + .4) < 1e-6);
  assert.deepEqual(teddy.position.toArray().slice(0, 2), [.2, 3.4]);
  assert.deepEqual([...geometry.getAttribute('position').array], positions);
  mesh.position.x = 10; mesh.updateMatrixWorld();
  assert.throws(() => placeTeddy(teddy, mesh), /bed anchor/);
});

test('preset edits undo in order without changing prior snapshots', () => {
  const initial = createMemory();
  const added = applyMemory(initial, 'add');
  const blue = applyMemory(added, 'blue');
  const removed = applyMemory(blue, 'remove');
  assert.deepEqual(initial.current, { present: false, color: 'cream' });
  assert.deepEqual(removed.current, { present: false, color: 'blue' });
  const restored = applyMemory(removed, 'undo');
  assert.deepEqual(restored.current, { present: true, color: 'blue' });
  const cream = applyMemory(restored, 'undo');
  assert.deepEqual(cream.current, { present: true, color: 'cream' });
  assert.deepEqual(applyMemory(cream, 'undo'), initial);
});

test('inapplicable commands are no-ops and cannot erase useful undo', () => {
  const empty = createMemory();
  for (const command of ['remove', 'blue', 'undo'] as const) assert.equal(applyMemory(empty, command), empty);
  const added = applyMemory(empty, 'add');
  assert.equal(applyMemory(added, 'add'), added);
  const blue = applyMemory(added, 'blue');
  assert.equal(applyMemory(blue, 'blue'), blue);
  assert.throws(() => applyMemory(blue, 'execute' as never), /Unknown/);
});

test('history stays bounded during repeated demo edits', () => {
  let memory = createMemory();
  for (let i = 0; i < 200; i++) memory = applyMemory(memory, i % 2 ? 'remove' : 'add');
  assert.equal(memory.history.length, 32);
  for (let i = 0; i < 32; i++) memory = applyMemory(memory, 'undo');
  assert.equal(applyMemory(memory, 'undo'), memory);
});

test('recolour and removal keep teddy geometry, identity and authored anchor unchanged', () => {
  const teddy = createTeddy();
  const id = teddy.uuid;
  const position = teddy.position.toArray();
  const geometry = teddy.children.filter(x => x instanceof THREE.Mesh).map(x => (x as THREE.Mesh).geometry);
  updateTeddy(teddy, { present: true, color: 'blue' });
  assert.equal(teddy.visible, true);
  const body = teddy.getObjectByName('body') as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  assert.equal(body.material.color.getHexString(), '7caec8');
  updateTeddy(teddy, { present: false, color: 'cream' });
  assert.equal(teddy.visible, false);
  assert.equal(body.material.color.getHexString(), 'dcbf92');
  assert.equal(teddy.uuid, id);
  assert.deepEqual(teddy.position.toArray(), position);
  assert.deepEqual(teddy.children.filter(x => x instanceof THREE.Mesh).map(x => (x as THREE.Mesh).geometry), geometry);
  assert.equal(teddy.userData.provenance, 'user-authored');
  const box = new THREE.Box3().setFromObject(teddy);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(size.z > .3 && size.z < .65);
  assert.ok(size.x < .7 && size.y < .7);
  const seen = new Set<THREE.Material>();
  teddy.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); if (!seen.has(obj.material)) { seen.add(obj.material); obj.material.dispose(); } } });
});
