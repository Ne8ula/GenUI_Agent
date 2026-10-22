import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { captureCamera } from '../src/bedroom/capture.ts';

test('repair camera uses pixel-centred OpenCV rays in the unchanged scan frame', () => {
  const camera = new THREE.PerspectiveCamera(70, 1, .025, 40);
  camera.up.set(0, 0, 1); camera.position.set(-.65, 4, -.1); camera.lookAt(1.1, 3.2, .3);
  camera.updateMatrixWorld();
  const { K, world_from_cv } = captureCamera(camera, 512);
  assert.equal(K[0][2], 256); assert.equal(K[1][2], 256);
  for (const [x, y] of [[0, 0], [255, 255], [511, 511]] as const) {
    const world = new THREE.Vector3((x + .5 - K[0][2]) / K[0][0], (y + .5 - K[1][2]) / K[1][1], 1)
      .transformDirection(new THREE.Matrix4().fromArray(world_from_cv.flat()).transpose());
    const ray = new THREE.Vector3((x + .5) / 256 - 1, 1 - (y + .5) / 256, .5).unproject(camera).sub(camera.position).normalize();
    assert.ok(world.distanceTo(ray) < 1e-10);
  }
  assert.throws(() => captureCamera(camera, 4096));
});
