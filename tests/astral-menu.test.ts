import assert from 'node:assert/strict';
import test from 'node:test';
import { MENU_NOTHING, MENU_REFUSED, MENU_STEP, entryPoints, menuDrag, menuLayout, menuOpen, menuStep, menuTurn } from '../src/astral/menu.ts';

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

test('the selected choice is the largest and the brightest, below the eye, and every slot is finite', () => {
  for (const count of [1, 2, 5, 8]) for (let selected = 0; selected < count; selected++) {
    const slots = menuLayout(count, selected);
    assert.equal(slots.length, count);
    slots.forEach((slot, i) => {
      assert.ok([slot.x, slot.y, slot.size, slot.light].every(Number.isFinite), `${count} ${i}`);
      if (i !== selected) assert.ok(slot.size < slots[selected]!.size && slot.light < slots[selected]!.light, `${count} ${selected} ${i}`);
    });
    assert.equal(slots[selected]!.light, 1);
    assert.ok(Math.abs(slots[selected]!.x) < 1e-9 && slots[selected]!.y < 0);   // the ring turns it to below the eye
  }
});

test('each entry that is no object, "nothing" and the ones EVA refuses, has points of its own to show', () => {
  for (const id of [MENU_NOTHING, ...MENU_REFUSED] as const) {
    const points = entryPoints(id);
    assert.ok(points.count > (id === MENU_NOTHING ? 200 : 500), id);
    assert.equal(points.positions.length, points.count * 3);
    assert.equal(points.colors.length, points.count * 3);
    assert.ok(points.positions.every(Number.isFinite) && points.colors.every(value => value >= 0 && value <= 1), id);
  }
});
