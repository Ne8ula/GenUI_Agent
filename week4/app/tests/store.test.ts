import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, fitFrame, hexToRgb, MAX_PARTICLES } from '../src/scene/store.ts';

test('store allocates SoA arrays of the requested capacity and refuses bad sizes', () => {
  const s = createStore(10);
  assert.equal(s.capacity, 10);
  assert.equal(s.count, 0);
  assert.equal(s.x.length, 10);
  assert.equal(s.region.length, 10);
  assert.throws(() => createStore(0), RangeError);
  assert.throws(() => createStore(MAX_PARTICLES + 1), RangeError);
  assert.throws(() => createStore(1.5), RangeError);
});

test('fitFrame contains a 16:9 frame with paper margins', () => {
  assert.deepEqual(fitFrame(1920, 1080, 16 / 9), { left: 0, top: 0, width: 1920, height: 1080 });
  const tall = fitFrame(1000, 1000, 16 / 9);
  assert.equal(tall.width, 1000);
  assert.ok(Math.abs(tall.height - 562.5) < 1e-9);
  assert.ok(Math.abs(tall.top - 218.75) < 1e-9);
  const wide = fitFrame(3000, 1000, 16 / 9);
  assert.equal(wide.height, 1000);
  assert.ok(Math.abs(wide.width - 1777.7777) < 1e-3);
});

test('hexToRgb parses and rejects', () => {
  assert.deepEqual(hexToRgb('#ffffff'), [1, 1, 1]);
  assert.throws(() => hexToRgb('fff'), RangeError);
});
