import assert from 'node:assert/strict';
import test from 'node:test';
import { bitsOf, fixed, headingDegrees } from '../src/astral/data-marks.ts';

test('fixed: leading zeros, sign, never cut, absent when not a number', () => {
  assert.equal(fixed(3.2749, 3, 2, true), '+003.27');
  assert.equal(fixed(-41.5, 3, 1, true), '-041.5');
  assert.equal(fixed(-0.001, 2, 2, true), '+00.00');
  assert.equal(fixed(16.67, 3, 1), '016.7');
  assert.equal(fixed(3703869, 8, 0), '03703869');
  assert.equal(fixed(123456, 3, 0), '123456');
  assert.equal(fixed(Number.NaN, 3, 2), null);
});

test('bitsOf: exact bits, most significant first, or nothing', () => {
  assert.deepEqual(bitsOf(5, 4), [false, true, false, true]);
  const bits = bitsOf(3703869, 24)!;
  assert.equal(bits.reduce((n, bit) => n * 2 + (bit ? 1 : 0), 0), 3703869);
  assert.equal(bitsOf(16, 4), null);
  assert.equal(bitsOf(-1, 8), null);
  assert.equal(bitsOf(1.5, 8), null);
});

test('headingDegrees: 0 toward -z, clockwise seen from above', () => {
  assert.equal(headingDegrees(0, -1), 0);
  assert.equal(headingDegrees(1, 0), 90);
  assert.equal(headingDegrees(0, 1), 180);
  assert.equal(headingDegrees(-1, 0), 270);
  assert.equal(headingDegrees(0, 0), null);
});
