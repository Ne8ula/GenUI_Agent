import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';

async function implementation() {
  assert.ok(existsSync(new URL('../src/crime-scene/panorama.ts', import.meta.url)), 'Panorama loader is not implemented');
  return import('../src/crime-scene/panorama.ts');
}

test('panorama opens inside at the retained origin, not the bounds midpoint or an exterior orbit', async () => {
  const { framePanorama } = await implementation();
  const group = new THREE.Group();
  group.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  group.add(new THREE.Mesh(new THREE.BoxGeometry(6, 4, 2)));
  group.position.x = 1;
  const matrix = group.matrix.clone(), quaternion = group.quaternion.clone();
  for (const aspect of [16 / 9, 0.5]) {
    const frame = framePanorama(group, aspect);
    assert.deepEqual(frame.size.toArray().map(n => Math.round(n)), [6, 2, 4]);
    assert.ok(group.quaternion.equals(quaternion));
    assert.deepEqual(group.scale.toArray(), [1, 1, 1]);
    assert.deepEqual(frame.position.toArray(), [0, 0, 0]);
    const camera = new THREE.PerspectiveCamera(50, aspect, frame.near, frame.far);
    camera.position.copy(frame.position); camera.lookAt(frame.target); camera.updateMatrixWorld(true);
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const reviewed = new THREE.Vector3(1, -.5, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -47 * .12).normalize();
    assert.ok(forward.distanceTo(reviewed) < 1e-10, 'Keep the sofa/chair heading and pitch down to include the chair legs');
    assert.ok(frame.near > 0 && frame.near < 1 && frame.far > 4);
  }
  assert.notDeepEqual(group.matrix, matrix, 'Only normal matrixWorld update, not a second coordinate conversion');
});

test('authored clue rays stop on existing surfaces and never fill a missing surface', async () => {
  const { surfaceAnchor } = await implementation();
  assert.equal(typeof surfaceAnchor, 'function');
  const room = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  wall.position.set(2, 0, 0); wall.rotation.y = Math.PI / 2; room.add(wall);
  const anchor = surfaceAnchor(room, new THREE.Vector3(1, 0, 0));
  assert.ok(anchor); assert.ok(anchor.point.distanceTo(new THREE.Vector3(2, 0, 0)) < 1e-6);
  assert.ok(Math.abs(anchor.normal.x) > .999);
  assert.equal(surfaceAnchor(room, new THREE.Vector3(-1, 0, 0)), undefined);
  assert.equal(room.children.length, 1);
  wall.geometry.dispose(); wall.material.dispose();
});

test('Matrix treatment preserves source material and binds a reversible radial reveal', async () => {
  const { applyPanoramaInspection } = await implementation();
  const texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: texture });
  const uniforms = { inspectionMode: { value: 0 }, inspectionSweep: { value: 0 }, inspectionRange: { value: 1 }, inspectionPixelRatio: { value: 2 }, inspectionOrigin: { value: new THREE.Vector3() } };
  applyPanoramaInspection(material, uniforms);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  assert.equal(material.map, texture);
  assert.equal(material.depthWrite, true, 'Dither gaps must not expose the far side of the room');
  assert.equal(shader.uniforms.inspectionMode, uniforms.inspectionMode);
  assert.match(shader.fragmentShader, /bayer4\(cell\)/);
  assert.match(shader.fragmentShader, /square < 0\.13/, 'Inferred surfaces retain hollow marks');
  assert.match(shader.fragmentShader, /mix\(base, investigative, scanned\)/);
  assert.doesNotMatch(shader.fragmentShader, /float bands =/, 'No broad radial contour stack');
  assert.match(shader.fragmentShader, /float bright = smoothstep\(0\.12, 0\.65, lightness\)/);
  assert.match(shader.fragmentShader, /mix\(0\.18, 0\.055, bright\) \+ rim \* 0\.12/, 'Bright surfaces have fewer marks than shadows');
  assert.match(shader.fragmentShader, /sqrt\(max\(base, vec3\(0\.0\)\)\) \* mix\(0\.32, 0\.06, bright\)/, 'Shadow backing retains texture rather than flattening dark furniture');
  assert.doesNotMatch(shader.fragmentShader, /discard\s*;/, 'Readable backing still occludes surfaces behind it');
  assert.equal(material.customProgramCacheKey(), 'eva-inspection-matrix-v3');
  material.dispose(); texture.dispose();
});

test('empty or degenerate framing is rejected', async () => {
  const { framePanorama } = await implementation();
  assert.throws(() => framePanorama(new THREE.Group(), 1), /bounds/);
});

test('candidate identity agrees with broker and rejects corrupt bytes before GLTF parsing', async t => {
  const { PANORAMA, loadPanorama } = await implementation();
  const catalog = JSON.parse(readFileSync(new URL('../../../scripts/room_workflow/ffs-resources.json', import.meta.url), 'utf8'));
  assert.equal(PANORAMA.sha256, catalog['realsee/scene.glb'].sha256);
  assert.equal(PANORAMA.bytes, catalog['realsee/scene.glb'].bytes);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(new Uint8Array(PANORAMA.bytes)); });
  await assert.rejects(loadPanorama(new AbortController().signal, () => {}), /integrity/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(loadPanorama(abort.signal, () => {}), { name: 'AbortError' });
  assert.equal(calls, 1);
});
