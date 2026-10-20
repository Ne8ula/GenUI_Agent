import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spacedPointIndices } from '../src/room/point-sampling.ts';

test('overlapping source patches collapse to existing representatives without modifying the source', () => {
  const points = new Float32Array([0.01, 0.01, 0.01, 0.025, 0.025, 0.025, 0.025, 0.025, 0.025, 0.08, 0.025, 0.025]);
  const original = points.slice();
  assert.deepEqual([...spacedPointIndices(points, .05)], [1, 3]);
  assert.deepEqual(points, original);
});

test('negative cells remain distinct and density is bounded by occupied cells', () => {
  const points = [-.025, 0, 0, .025, 0, 0, .03, 0, 0];
  assert.equal(spacedPointIndices(points, .05).length, 2);
  assert.deepEqual([...spacedPointIndices(points, .05)], [...spacedPointIndices(points, .05)]);
});

test('invalid positions and sampling scales are rejected', () => {
  assert.throws(() => spacedPointIndices([NaN, 0, 0]));
  assert.throws(() => spacedPointIndices([0, 0, 0], 0));
  assert.throws(() => spacedPointIndices([0, 0]));
});
