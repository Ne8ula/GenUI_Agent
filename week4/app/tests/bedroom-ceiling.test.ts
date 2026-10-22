import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ceilingDisplay } from '../src/bedroom/ceiling.ts';

test('ceiling replacement changes display indices only and restores immutable scan attributes', () => {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, .1, 0, 0, 0, .1, 0,
    2, 2, 2, 3, 2, 2, 2, 3, 2,
    0, 0, 0, 3, 0, 0, 0, 3, 0,
  ], 3));
  source.setAttribute('color', new THREE.Float32BufferAttribute(Array(27).fill(.5), 3));
  source.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const patch = new THREE.BoxGeometry(1, 1, 1);
  const before = Array.from(source.index!.array);
  const camera = new THREE.PerspectiveCamera(70, 1, .025, 40);
  camera.position.z = 2; camera.updateMatrixWorld();
  const display = ceilingDisplay(source, patch, camera, new THREE.Vector3(0, 0, 1 / 2.2));
  assert.deepEqual(Array.from(display.mesh.index!.array), [3, 4, 5, 6, 7, 8], 'only triangles wholly within replacement bounds are hidden');
  assert.deepEqual(Array.from(display.points.index!.array), [4, 8], 'source points within patch bounds are hidden');
  assert.deepEqual(Array.from(source.index!.array), before);
  assert.equal(display.mesh.getAttribute('position'), source.getAttribute('position'));
  assert.equal(display.mesh.getAttribute('color'), source.getAttribute('color'));
  display.mesh.dispose(); display.points.dispose(); source.dispose(); patch.dispose();
});

test('ceiling replacement preserves source outside the captured patch rectangle', () => {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute([.49, .49, .49, .48, .49, .49, .49, .48, .49], 3));
  source.setAttribute('color', new THREE.Float32BufferAttribute(Array(9).fill(.5), 3));
  source.setIndex([0, 1, 2]);
  const patch = new THREE.BufferGeometry();
  patch.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, 0, .5, .5], 3));
  const camera = new THREE.PerspectiveCamera(70, 1, .025, 40);
  camera.position.z = 2; camera.updateMatrixWorld();
  const display = ceilingDisplay(source, patch, camera, new THREE.Vector3(0, 0, 1 / 2.2));
  assert.deepEqual(Array.from(display.mesh.index!.array), [0, 1, 2]);
  display.mesh.dispose(); display.points.dispose(); source.dispose(); patch.dispose();
});

test('replacement hides old fixture protrusions but preserves the supported ceiling plane', () => {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute([
    -.3, 0, 0, -.29, 0, 0, -.3, .01, 0,
    0, 0, -.2, .01, 0, -.2, 0, .01, -.2,
  ], 3));
  source.setAttribute('color', new THREE.Float32BufferAttribute(Array(18).fill(.5), 3));
  source.setIndex([0, 1, 2, 3, 4, 5]);
  const patch = new THREE.BoxGeometry(.1, .1, .1);
  const camera = new THREE.PerspectiveCamera(70, 1, .025, 40);
  camera.position.z = 2; camera.updateMatrixWorld();
  const display = ceilingDisplay(source, patch, camera, new THREE.Vector3(0, 0, 1 / 2.2));
  assert.deepEqual(Array.from(display.mesh.index!.array), [3, 4, 5]);
  assert.deepEqual(Array.from(source.index!.array), [0, 1, 2, 3, 4, 5]);
  display.mesh.dispose(); display.points.dispose(); source.dispose(); patch.dispose();
});

test('authored fixture clearance hides stray scan shards without altering source geometry', () => {
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .7, .01, 0, .7, 0, .01, .7], 3));
  source.setAttribute('color', new THREE.Float32BufferAttribute(Array(9).fill(.5), 3));
  source.setIndex([0, 1, 2]);
  const patch = new THREE.BoxGeometry(.1, .1, .1);
  const clearance = new THREE.Box3(new THREE.Vector3(-.1, -.1, .3), new THREE.Vector3(.1, .1, .9));
  const display = ceilingDisplay(source, patch, new THREE.PerspectiveCamera(), new THREE.Vector3(0, 0, 1), clearance);
  assert.equal(display.mesh.index!.count, 0);
  assert.equal(source.index!.count, 3);
  display.mesh.dispose(); display.points.dispose(); source.dispose(); patch.dispose();
});

test('ceiling replacement rejects empty and non-finite patch bounds', () => {
  const source = new THREE.BoxGeometry();
  assert.throws(() => ceilingDisplay(source, new THREE.BufferGeometry(), new THREE.PerspectiveCamera(), new THREE.Vector3(0, 0, 1)), /patch/i);
  const patch = new THREE.BufferGeometry();
  patch.setAttribute('position', new THREE.Float32BufferAttribute([NaN, 0, 0], 3));
  assert.throws(() => ceilingDisplay(source, patch, new THREE.PerspectiveCamera(), new THREE.Vector3(0, 0, 1)), /patch/i);
  source.dispose(); patch.dispose();
});
