import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSEMBLE, SLOT, introFrame, introPhotos } from '../src/crime-scene/intro.ts';
import type { SceneData } from '../src/crime-scene/state.ts';

test('intro uses each catalogued source photo once and rejects other names', () => {
  const data = { evidence: [{ tag: 1, item: 'Key', photos: ['IMG_20240306_133442.jpg', '../secret.jpg'] },
    { tag: 2, item: 'Case', photos: ['IMG_20240306_133454.jpg', 'IMG_20240306_133442.jpg'] }] } as unknown as SceneData;
  assert.deepEqual(introPhotos(data), ['IMG_20240306_133442.jpg', 'IMG_20240306_133454.jpg']);
});

test('carousel centres one photo at a time and reveals the scan floor-up to completion', () => {
  const count = 11;
  assert.deepEqual(introFrame(0, count).photos.slice(0, 2), [{ offset: 0, stage: 0 }, { offset: 1, stage: -1 }]);
  assert.equal(introFrame(.5, count).photos[0]!.offset, 0, 'Analysis holds the photo centred');
  assert.equal(introFrame(1, count).photos[1]!.offset, 0, 'Next photo arrives centred');
  assert.ok(introFrame(.9, count).photos[0]!.offset < 0, 'Finished photo slides away');
  let previous = -1;
  for (let f = 0; f <= count + ASSEMBLE / SLOT; f += .05) {
    const { reveal } = introFrame(f, count);
    assert.ok(reveal >= previous && reveal <= 1); previous = reveal;
  }
  assert.equal(introFrame(count, count).reveal, .8);
  assert.equal(introFrame(count + ASSEMBLE / SLOT, count).reveal, 1);
});
