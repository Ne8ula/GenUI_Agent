import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as panorama from '../src/crime-scene/panorama.ts';

class Canvas extends EventTarget {
  captured = new Set<number>();
  focus() {}
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  send(type: string, properties: Record<string, unknown> = {}) {
    const event = Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, button: 0, clientX: 0, clientY: 0, ...properties });
    this.dispatchEvent(event); return event;
  }
}

function setup() {
  assert.equal(typeof panorama.createPanoramaControls, 'function', 'Interior look controls must be implemented');
  const canvas = new Canvas(), camera = new THREE.PerspectiveCamera();
  let draws = 0;
  const reset = () => { camera.position.set(0, 0, 0); controls.target.set(1, 0, 0); controls.update(); };
  const controls = panorama.createPanoramaControls(camera, canvas as unknown as HTMLCanvasElement, () => draws++, reset);
  controls.step = .2; controls.pause(false); reset();
  return { canvas, camera, controls, draws: () => draws };
}

test('turn and pointer look change direction without orbiting or moving the camera', () => {
  const { canvas, camera, controls } = setup();
  const origin = camera.position.clone();
  controls.turn(1);
  assert.ok(camera.position.equals(origin));
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).z > 0, 'Right turn from +X looks toward +Z');
  canvas.send('pointerdown');
  canvas.send('pointermove', { clientX: 30, clientY: -20 });
  assert.ok(camera.position.equals(origin));
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).y > 0, 'Upward drag looks upward');
  canvas.send('pointermove', { clientX: 30, clientY: -100000 });
  const direction = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(direction.y < 1 && Math.hypot(direction.x, direction.z) > .05, 'Pitch must not flip through the pole');
  controls.dispose();
});

test('movement preserves height even after looking up, and Home resets inside', () => {
  const { canvas, camera, controls } = setup();
  canvas.send('pointerdown'); canvas.send('pointermove', { clientY: -80 }); canvas.send('pointerup');
  const before = camera.position.clone();
  canvas.send('keydown', { key: 'ArrowUp' });
  assert.equal(camera.position.y, before.y);
  assert.ok(Math.abs(camera.position.distanceTo(before) - .2) < 1e-10);
  canvas.send('keydown', { key: 'Home' });
  assert.deepEqual(camera.position.toArray(), [0, 0, 0]);
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
  controls.dispose();
});

test('pause interrupts a drag and blocks every navigation route until resumed', () => {
  const { canvas, camera, controls, draws } = setup();
  canvas.send('pointerdown');
  controls.pause(true);
  const position = camera.position.clone(), quaternion = camera.quaternion.clone(), count = draws();
  for (const key of ['ArrowRight', 'ArrowUp', 'Home']) canvas.send('keydown', { key });
  canvas.send('pointermove', { clientX: 60 }); canvas.send('wheel', { deltaY: -120 });
  controls.turn(1); controls.move(1);
  assert.ok(camera.position.equals(position) && camera.quaternion.equals(quaternion));
  assert.equal(draws(), count);
  assert.equal(canvas.captured.size, 0);
  controls.pause(false);
  canvas.send('pointermove', { clientX: 90 });
  assert.ok(camera.quaternion.equals(quaternion), 'Resume must not revive the old drag');
  controls.turn(1); assert.ok(!camera.quaternion.equals(quaternion));
  controls.dispose();
});

for (const interruption of ['pointercancel', 'lostpointercapture', 'blur']) {
  test(`${interruption} ends the active pointer drag`, () => {
    const { canvas, camera, controls } = setup();
    canvas.send('pointerdown'); canvas.send(interruption);
    const before = camera.quaternion.clone();
    canvas.send('pointermove', { clientX: 60 });
    assert.ok(camera.quaternion.equals(before));
    controls.dispose();
  });
}

test('another pointer cannot drive or end the active drag', () => {
  const { canvas, camera, controls } = setup();
  canvas.send('pointerdown');
  canvas.send('pointerdown', { pointerId: 2 }); canvas.send('pointermove', { pointerId: 2, clientX: 90 });
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-10);
  canvas.send('pointerup', { pointerId: 2 });
  canvas.send('pointermove', { clientX: 30 });
  assert.ok(camera.getWorldDirection(new THREE.Vector3()).z > 0);
  controls.dispose();
});

test('wheel moves rather than zooming, modified shortcuts are left to the browser, and disposal detaches input', () => {
  const { canvas, camera, controls, draws } = setup();
  const fov = camera.fov;
  const modified = canvas.send('keydown', { key: 'ArrowRight', ctrlKey: true });
  assert.equal(modified.defaultPrevented, false);
  assert.ok(canvas.send('wheel', { deltaY: -120 }).defaultPrevented);
  assert.ok(camera.position.x > 0); assert.equal(camera.fov, fov);
  controls.dispose();
  const position = camera.position.clone(), quaternion = camera.quaternion.clone(), count = draws();
  canvas.send('pointerdown'); canvas.send('pointermove', { clientX: 60 });
  canvas.send('keydown', { key: 'ArrowUp' }); canvas.send('wheel', { deltaY: -120 });
  assert.ok(camera.position.equals(position) && camera.quaternion.equals(quaternion));
  assert.equal(draws(), count);
});
