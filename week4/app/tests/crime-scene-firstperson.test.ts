import test from 'node:test';
import assert from 'node:assert/strict';
import { aim, captureTimeline, face, standpoint, walk } from '../src/crime-scene/firstperson.ts';
import type { Marker, SceneData } from '../src/crime-scene/state.ts';

const crop = { rotation_z: 0, min: [-1.5, -2.85, 349.15], max: [1.85, .58, 352.3] };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test('start at the scanner origin at eye height', () => {
  assert.deepEqual(standpoint(crop).map(v => +v.toFixed(3)), [0, 0, 1.55]);
});

test('walk follows yaw and stays inside the display crop, keeping eye height', () => {
  const [x, y, z] = walk([0, 0, 1.55], 0, .5, 0, crop);
  assert.ok(near(x, .5) && near(y, 0) && z === 1.55, 'Forward at yaw 0 is +x');
  const [, right] = walk([0, 0, 1.55], 0, 0, .5, crop);
  assert.ok(near(right, -.5), 'Strafing right at yaw 0 is -y (z up)');
  assert.deepEqual(walk([0, 0, 1.55], 0, 9, 0, crop), [1.6, 0, 1.55], 'Clamped .25 m inside the crop');
  assert.deepEqual(walk([0, 0, 1.55], Math.PI / 2, 9, 0, crop).map(v => +v.toFixed(6)), [0, .33, 1.55]);
});

test('aim picks the marker nearest the reticle within a narrow cone, else none', () => {
  const marker = (id: string, tag: number | null, centroid: [number, number, number]): Marker => ({ id, tag, centroid, numbering: null, label: id });
  const markers = [marker('a', 18, [2, 0, 349.2 + 1.55]), marker('b', 13, [2, .5, 349.2 + 1.55])];
  assert.equal(aim([0, 0, 1.55], 0, 0, markers, crop)?.id, 'a');
  assert.equal(aim([0, 0, 1.55], Math.atan2(.5, 2), 0, markers, crop)?.id, 'b');
  assert.equal(aim([0, 0, 1.55], Math.PI, 0, markers, crop), null, 'Looking away finds nothing');
  assert.equal(aim([0, 0, 1.55], 0, 0, [marker('far', 1, [9, 0, 349.2 + 1.55])], crop), null, 'Beyond reach');
});

test('face turns the view toward a point', () => {
  const { yaw, pitch } = face([0, 0, 1.55], [0, 1, .55]);
  assert.ok(near(yaw, Math.PI / 2) && near(pitch, -Math.PI / 4));
});

test('timeline follows photo capture order, one step per evidence photo', () => {
  const data = { evidence: [
    { tag: 18, item: 'Chair', photos: ['IMG_20240306_133552.jpg'] },
    { tag: 13, item: 'Shoes', photos: ['IMG_20240306_133442.jpg'] },
    { tag: 1, item: 'Key', photos: ['IMG_20240306_133534.jpg'] },
  ] } as unknown as SceneData;
  assert.deepEqual(captureTimeline(data), [{ tag: 13, time: '13:34:42' }, { tag: 1, time: '13:35:34' }, { tag: 18, time: '13:35:52' }]);
});
