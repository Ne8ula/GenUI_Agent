import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createRoomCompletion } from '../src/bedroom/completion.ts';

const angle = Math.atan2(.6417793929, .7668893081);
const world = (u: number, v: number, z: number) => new THREE.Vector3(u, v, z).applyAxisAngle(new THREE.Vector3(0, 0, 1), angle);

test('room completion supplies bounded colored architecture and existing furniture as authored geometry', () => {
  const geometry = createRoomCompletion();
  assert.equal(geometry.userData.provenance, 'authored');
  const names = geometry.userData.parts.map((part: { name: string }) => part.name);
  for (const name of ['ceiling', 'floor', 'head-wall', 'side-wall', 'window', 'door', 'wardrobe', 'bed', 'headboard', 'left-cabinet', 'right-cabinet']) assert.ok(names.includes(name), name);
  const positions = geometry.getAttribute('position');
  assert.ok(positions.count > 100 && positions.count < 200000);
  assert.equal(positions.count, geometry.getAttribute('color').count);
  assert.ok(Array.from(positions.array).every(Number.isFinite));
  assert.ok(Array.from(geometry.getAttribute('color').array).every(value => value >= 0 && value <= 1));
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox!.min.z >= -1.5 && geometry.boundingBox!.max.z <= 1.15);
  assert.ok(geometry.boundingBox!.max.length() < 8);
  geometry.dispose();
});

test('authored envelope closes holes but keeps window and door distinct from wall faces', () => {
  const geometry = createRoomCompletion();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  function firstPart(origin: THREE.Vector3, direction: THREE.Vector3) {
    const hit = new THREE.Raycaster(origin, direction.normalize()).intersectObject(mesh)[0];
    assert.ok(hit, 'closed room boundary');
    const vertex = hit.faceIndex! * 3;
    return geometry.userData.parts.find((part: { start: number; count: number }) => vertex >= part.start && vertex < part.start + part.count)?.name;
  }
  assert.equal(firstPart(world(2.4, 3.9, .2), world(0, 1, 0)), 'window');
  assert.equal(firstPart(world(.7, 1.1, 0), world(0, -1, 0)), 'door');
  assert.equal(firstPart(world(1.7, 2.5, .5), new THREE.Vector3(0, 0, 1)), 'ceiling');
  assert.equal(firstPart(world(1.35, 2, -.5), new THREE.Vector3(0, 0, -1)), 'floor');
  geometry.dispose(); material.dispose();
});
