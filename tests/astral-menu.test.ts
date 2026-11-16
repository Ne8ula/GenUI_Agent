import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MENU_ARRANGEMENTS, MENU_REFUSED, MENU_STEP, menuArrangement, menuDrag, menuLayout, menuOpen, menuStep, menuTurn, refusedPoints,
} from '../src/astral/menu.ts';

test('?menu= picks one of the arrangements, and anything else is the ring', () => {
  assert.deepEqual([...MENU_ARRANGEMENTS], ['ring', 'row', 'one']);
  for (const arrangement of MENU_ARRANGEMENTS) assert.equal(menuArrangement(`?look=sand&menu=${arrangement}`), arrangement);
  for (const other of ['', '?menu=', '?menu=dropdown', '?menu=RING', '?look=sand']) assert.equal(menuArrangement(other), 'ring', other);
});

test('the menu opens on a hero with the first choice selected, and only when there is a hero and a choice', () => {
  assert.deepEqual(menuOpen(3, 5), { hero: 3, index: 0, count: 5, carry: 0 });
  for (const [hero, count] of [[-1, 5], [1.5, 5], [0, 0], [0, -2], [0, 2.5], [NaN, 5]] as const) assert.equal(menuOpen(hero, count), null);
});

test('A and D move one choice at a time and come round at either end', () => {
  const open = menuOpen(0, 5)!;
  assert.equal(menuStep(open, 1).index, 1);
  assert.equal(menuStep(open, -1).index, 4);
  assert.equal(menuStep({ ...open, index: 4 }, 1).index, 0);
  assert.equal(menuStep(open, 12).index, 2);
  assert.equal(menuStep(open, NaN).index, 0);
  assert.equal(menuStep({ ...open, carry: 0.02 }, 1).carry, 0);   // a key press forgets half-spent mouse travel
  assert.equal(menuStep(menuOpen(2, 1)!, 1).index, 0);            // one choice: it stays selected
});

test('the mouse moves one choice for every step of travel, keeps the remainder, and comes back the way it went', () => {
  const open = menuOpen(0, 5)!;
  const short = menuDrag(open, MENU_STEP * 0.6);
  assert.equal(short.index, 0);
  assert.equal(menuDrag(short, MENU_STEP * 0.6).index, 1);          // two short moves add up to a step
  assert.equal(menuDrag(open, MENU_STEP * 3.5).index, 3);
  assert.ok(Math.abs(menuDrag(open, MENU_STEP * 3.5).carry - MENU_STEP * 0.5) < 1e-12);
  assert.equal(menuDrag(open, -MENU_STEP * 1.2).index, 4);          // leftwards, round the end
  assert.equal(menuDrag(menuDrag(open, MENU_STEP * 2.2), -MENU_STEP * 2.2).index, 0);
  assert.equal(menuDrag(open, NaN), open);
  assert.equal(menuDrag(open, Infinity), open);
  assert.equal(menuDrag(open, 0).index, 0);
});

test('the distance between two choices goes the short way round', () => {
  assert.equal(menuTurn(1, 0, 5), 1);
  assert.equal(menuTurn(4, 0, 5), -1);
  assert.equal(menuTurn(0, 4, 5), 1);
  assert.equal(menuTurn(2, 2, 5), 0);
  assert.ok(Math.abs(menuTurn(0, 4.5, 5) - 0.5) < 1e-12);   // while the selection eases from 4 round to 0
});

test('in every arrangement the selected choice is the largest and the brightest, and every slot is finite', () => {
  for (const arrangement of MENU_ARRANGEMENTS) for (const count of [1, 2, 5, 8]) for (let selected = 0; selected < count; selected++) {
    const slots = menuLayout(arrangement, count, selected);
    assert.equal(slots.length, count);
    slots.forEach((slot, i) => {
      assert.ok([slot.x, slot.y, slot.size, slot.light].every(Number.isFinite), `${arrangement} ${count} ${i}`);
      if (i !== selected) assert.ok(slot.size < slots[selected]!.size && slot.light < slots[selected]!.light, `${arrangement} ${count} ${selected} ${i}`);
    });
    assert.equal(slots[selected]!.light, 1);
  }
});

test('ring turns the selected choice to below the eye; row keeps its places; one shows the selected and its two neighbours only', () => {
  for (let selected = 0; selected < 5; selected++) {
    const ring = menuLayout('ring', 5, selected)[selected]!;
    assert.ok(Math.abs(ring.x) < 1e-9 && ring.y < 0);
  }
  assert.deepEqual(menuLayout('row', 5, 0).map(slot => slot.x), menuLayout('row', 5, 3).map(slot => slot.x));
  assert.deepEqual(menuLayout('row', 5, 0).map(slot => slot.x), [-1, -0.5, 0, 0.5, 1]);
  // eight choices on a 16:9 frame: drawn closer together, so the whole line (each choice 0.24 to 0.39 across) stays inside it
  const wide = menuLayout('row', 8, 7, 16 / 9);
  assert.ok(wide[0]!.x - wide[0]!.size / 2 > -16 / 9 && wide[7]!.x + wide[7]!.size / 2 < 16 / 9);
  const one = menuLayout('one', 6, 2);
  assert.deepEqual(one.map(slot => slot.size > 0), [false, true, true, true, false, false]);
  assert.ok(one[1]!.x < 0 && one[2]!.x === 0 && one[3]!.x > 0);
});

test('each entry EVA refuses has points of its own to show', () => {
  for (const id of MENU_REFUSED) {
    const points = refusedPoints(id);
    assert.ok(points.count > 500, id);
    assert.equal(points.positions.length, points.count * 3);
    assert.equal(points.colors.length, points.count * 3);
    assert.ok(points.positions.every(Number.isFinite) && points.colors.every(value => value >= 0 && value <= 1), id);
  }
});
