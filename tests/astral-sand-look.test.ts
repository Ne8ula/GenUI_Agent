import assert from 'node:assert/strict';
import test from 'node:test';
import type { Box } from '../src/astral/inspect.ts';
import { ASTRAL_LOOKS } from '../src/astral/looks.ts';
import { SWAP_NONE, SWAP_PAIRINGS, SWAP_SECONDS, moveUniforms, parseSwap, swapHero, swapNow, swapTimes, type Move, type Swap } from '../src/astral/sand-look.ts';

test('sand is a registered look', () => {
  assert.ok((ASTRAL_LOOKS as readonly string[]).includes('sand'));
});

test('G steps through burn then fall, shatter then spiral, glitch then morph, in Gather\'s own codes', () => {
  assert.deepEqual(SWAP_PAIRINGS.map(p => p.name), ['burn, fall', 'shatter, spiral', 'glitch, morph']);
  assert.deepEqual(SWAP_PAIRINGS.map(p => [p.away, p.back]), [[2, 5], [1, 4], [5, 2]]);
  assert.deepEqual([0, 1, 2, 3, 4].map(press => SWAP_PAIRINGS[press % SWAP_PAIRINGS.length]!.away), [2, 1, 5, 2, 1]);
});

test('?swap= needs a hero index, a pairing index and a progress from 0 to 1; a pose, its way, a thing and a discrepancy may follow', () => {
  const plain = { pose: 'rests', other: false, loose: false, thing: null, factor: 1, copies: 1, gone: false };
  // wrong scale at an allowed size (none under true size), repetition of 3 to 6, absence
  assert.deepEqual(parseSwap('?swap=4,0,1,rests,,globe,x2.5'), { hero: 4, pairing: 0, progress: 1, ...plain, thing: 'globe', factor: 2.5 });
  assert.deepEqual(parseSwap('?swap=1,0,1,rests,,televisions,n6'), { hero: 1, pairing: 0, progress: 1, ...plain, thing: 'televisions', copies: 6 });
  assert.deepEqual(parseSwap('?swap=1,0,0.5,rests,,globe,gone'), { hero: 1, pairing: 0, progress: 0.5, ...plain, thing: 'globe', gone: true });
  for (const bad of ['x3', 'x1', 'x', 'x0.25', 'x0.4', 'n2', 'n7', 'n3.5', 'gone-', 'gone-pale', '', '2.5'])
    assert.equal(parseSwap(`?swap=1,0,1,rests,,globe,${bad}`), null, bad);
  assert.equal(parseSwap('?swap=1,0,1,rests,,globe,x2.5,n3'), null);
  assert.deepEqual(parseSwap('?swap=1,0,0.5'), { hero: 1, pairing: 0, progress: 0.5, ...plain });
  assert.deepEqual(parseSwap('?look=sand&swap=4,2,1'), { hero: 4, pairing: 2, progress: 1, ...plain });
  assert.deepEqual(parseSwap('?swap=0,1,0'), { hero: 0, pairing: 1, progress: 0, ...plain });
  assert.deepEqual(parseSwap('?swap=1,0,run'), { hero: 1, pairing: 0, progress: null, ...plain });
  assert.deepEqual(parseSwap('?swap=1,0,0.8,hovers'), { hero: 1, pairing: 0, progress: 0.8, ...plain, pose: 'hovers' });
  assert.deepEqual(parseSwap('?swap=1,0,1,leans,side'), { hero: 1, pairing: 0, progress: 1, ...plain, pose: 'leans', other: true });
  assert.deepEqual(parseSwap('?swap=1,0,0.8,sunk,tilted+grains,gramophone'), { hero: 1, pairing: 0, progress: 0.8, ...plain, pose: 'sunk', other: true, loose: true, thing: 'gramophone' });
  assert.deepEqual(parseSwap('?swap=1,0,0.8,rests,,globe'), { hero: 1, pairing: 0, progress: 0.8, ...plain, thing: 'globe' });
  for (const bad of ['', '?look=sand', '?swap=', '?swap=1,0', '?swap=1,0,0.5,2', '?swap=1,3,0.5', '?swap=-1,0,0.5', '?swap=1.5,0,0.5',
    '?swap=1,0,1.2', '?swap=1,0,-0.1', '?swap=a,0,0.5', '?swap=1,,0.5', '?swap=1,0,', '?swap=1,0,x',
    '?swap=1,0,0.5,', '?swap=1,0,0.5,floats', '?swap=1,0,0.5,leans,tilted', '?swap=1,0,0.5,rests,side', '?swap=1,0,0.5,leans,side+side',
    '?swap=1,0,0.5,leans,side,../x', '?swap=1,0,0.5,leans,side,globe,7'])
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
  // the last figure is the move into the pose: with none to make, it is made
  assert.deepEqual(swapNow(SWAP_NONE, 99), [-1, 0, 0, 1]);
  const running: Swap = { hero: 2, pairing: 0, progress: null, at: 10 };
  assert.deepEqual(swapNow(running, 10), [2, 0, 0, 1]);
  assert.deepEqual(swapNow(running, 10 + SWAP_SECONDS / 2), [2, 0.5, SWAP_SECONDS / 2, 1]);
  assert.deepEqual(swapNow(running, 10 + SWAP_SECONDS), [-1, 0, 0, 1]);
  assert.deepEqual(swapNow(running, 9), [-1, 0, 0, 1]);
  const held: Swap = { hero: 1, pairing: 1, progress: 0.25, at: 10 };
  assert.deepEqual(swapNow(held, 10), swapNow(held, 500));
  assert.deepEqual(swapNow(held, 500), [1, 0.25, 0.25 * SWAP_SECONDS, 1]);
  assert.deepEqual(swapNow({ ...held, progress: 1 }, 0), [1, 1, SWAP_SECONDS, 1]);
});

test('an arrival is the pairing, then its move: a thing that comes whole moves while the old one leaves, a carried one only moves', () => {
  const move = (arrival: Move['arrival'], more: Partial<Move> = {}): Move => ({ arrival, centre: [0, 0, 0], axis: [0, 1, 0], angle: 0, offset: [0, -0.3, 0], cut: null, ...more });
  // 'assembles' is the pairing alone, as a change without a move is
  assert.deepEqual(swapTimes(move('assembles')), swapTimes());
  assert.deepEqual(swapTimes(), { pair: SWAP_SECONDS, from: 0, move: 0, total: SWAP_SECONDS });
  for (const arrival of ['rises', 'falls', 'tips', 'turns'] as const) {
    const { pair, from, move: length, total } = swapTimes(move(arrival));
    assert.ok(pair === SWAP_SECONDS && from > 0.8 * pair && from <= pair && length > 0 && total === from + length, arrival);
  }
  const push = swapTimes(move('pushes-up'));
  assert.ok(push.pair === SWAP_SECONDS && push.from < 0.5 * push.pair && push.total >= push.pair);
  const carried = swapTimes(move('falls', { carried: true }));
  assert.deepEqual([carried.pair, carried.from, carried.total], [0, 0, carried.move]);
  // Running: the move has not begun while the pairing runs, is under way after it, and the change ends when the move does.
  const rises = move('rises'), times = swapTimes(rises), running: Swap = { hero: 1, pairing: 0, progress: null, at: 0, move: rises };
  assert.deepEqual(swapNow(running, times.from / 2), [1, times.from / 2 / times.pair, times.from / 2, 0]);
  const late = swapNow(running, times.from + times.move / 2);
  assert.ok(late[1] === 1 && Math.abs(late[3] - 0.5) < 1e-9);
  assert.equal(swapNow(running, times.total)[0], -1);
  // Held: progress is a share of the whole change.
  assert.deepEqual(swapNow({ ...running, progress: 1 }, 99), [1, 1, times.total, 1]);
  assert.deepEqual(swapNow({ hero: 1, pairing: 0, progress: 0.5, at: 0, move: move('falls', { carried: true }) }, 99), [1, 1, carried.move / 2, 0.5]);
  // The shader's figures: nothing to do without a move; whole for a thing that pushes up or is carried; grains only where asked.
  assert.deepEqual(moveUniforms(), moveUniforms(move('assembles')));
  assert.deepEqual(moveUniforms().uSwapMove, [1, 0, 0, 0]);
  assert.deepEqual([moveUniforms(rises).uSwapMove, moveUniforms(rises).uSwapFrom], [[0, 0, 0, 0], [0, -0.3, 0]]);
  assert.equal(moveUniforms(move('pushes-up')).uSwapMove[3], 1);
  assert.deepEqual(moveUniforms(move('falls', { carried: true })).uSwapMove.slice(1), [1, 0, 1]);
  assert.ok(moveUniforms(move('tips', { loose: true })).uSwapMove[2] > 0);
  assert.deepEqual(moveUniforms(move('pushes-up', { cut: [0, 1, 0, 0.02] })).uSwapCut, [0, 1, 0, 0.02]);
});
