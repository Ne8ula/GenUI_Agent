import assert from 'node:assert/strict';
import test from 'node:test';
import type { Box } from '../src/astral/inspect.ts';
import { ASTRAL_LOOKS } from '../src/astral/looks.ts';
import { SWAP_NONE, SWAP_PAIRINGS, SWAP_SECONDS, parseSwap, swapHero, swapNow, type Swap } from '../src/astral/sand-look.ts';

test('sand is a registered look', () => {
  assert.ok((ASTRAL_LOOKS as readonly string[]).includes('sand'));
});

test('G steps through burn then fall, shatter then spiral, glitch then morph, in Gather\'s own codes', () => {
  assert.deepEqual(SWAP_PAIRINGS.map(p => p.name), ['burn, fall', 'shatter, spiral', 'glitch, morph']);
  assert.deepEqual(SWAP_PAIRINGS.map(p => [p.away, p.back]), [[2, 5], [1, 4], [5, 2]]);
  assert.deepEqual([0, 1, 2, 3, 4].map(press => SWAP_PAIRINGS[press % SWAP_PAIRINGS.length]!.away), [2, 1, 5, 2, 1]);
});

test('?swap= needs a hero index, a pairing index and a progress from 0 to 1', () => {
  assert.deepEqual(parseSwap('?swap=1,0,0.5'), { hero: 1, pairing: 0, progress: 0.5 });
  assert.deepEqual(parseSwap('?look=sand&swap=4,2,1'), { hero: 4, pairing: 2, progress: 1 });
  assert.deepEqual(parseSwap('?swap=0,1,0'), { hero: 0, pairing: 1, progress: 0 });
  for (const bad of ['', '?look=sand', '?swap=', '?swap=1,0', '?swap=1,0,0.5,2', '?swap=1,3,0.5', '?swap=-1,0,0.5', '?swap=1.5,0,0.5',
    '?swap=1,0,1.2', '?swap=1,0,-0.1', '?swap=a,0,0.5', '?swap=1,,0.5', '?swap=1,0,', '?swap=1,0,x'])
    assert.equal(parseSwap(bad), null, bad);
});

test('the change acts on the inspected hero, else the nearest', () => {
  const near: Box = { min: [-1, 0, -3], max: [1, 1, -2] }, far: Box = { min: [8, 0, -3], max: [9, 1, -2] };
  assert.equal(swapHero(1, [near, far], [0, 1, 0]), 1);
  assert.equal(swapHero(-1, [near, far], [0, 1, 0]), 0);
  assert.equal(swapHero(-1, [near, far], [8.5, 1, 0]), 1);
  assert.equal(swapHero(5, [near, far], [0, 1, 0]), 0);   // an index the room does not have
  assert.equal(swapHero(-1, [], [0, 1, 0]), -1);
});

test('a running change advances over its seconds and ends by itself; a held one stays, on a clock of its own', () => {
  assert.deepEqual(swapNow(SWAP_NONE, 99), [-1, 0, 0]);
  const running: Swap = { hero: 2, pairing: 0, progress: null, at: 10 };
  assert.deepEqual(swapNow(running, 10), [2, 0, 0]);
  assert.deepEqual(swapNow(running, 10 + SWAP_SECONDS / 2), [2, 0.5, SWAP_SECONDS / 2]);
  assert.deepEqual(swapNow(running, 10 + SWAP_SECONDS), [-1, 0, 0]);
  assert.deepEqual(swapNow(running, 9), [-1, 0, 0]);
  const held: Swap = { hero: 1, pairing: 1, progress: 0.25, at: 10 };
  assert.deepEqual(swapNow(held, 10), swapNow(held, 500));
  assert.deepEqual(swapNow(held, 500), [1, 0.25, 0.25 * SWAP_SECONDS]);
  assert.deepEqual(swapNow({ ...held, progress: 1 }, 0), [1, 1, SWAP_SECONDS]);
});
