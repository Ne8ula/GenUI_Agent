import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReplacements, readReplacements, withReplacement, writeReplacements } from '../src/astral/replacements.ts';
import { heroGrains } from '../src/astral/sand-look.ts';
import { REFUSALS } from '../src/astral/tease.ts';
import { MENU_REFUSED } from '../src/astral/menu.ts';
import type { PointCloud } from '../src/astral/types.ts';

/** A storage that holds one string, as localStorage would. */
function store(initial: string | null = null) {
  let held = initial;
  return { getItem: () => held, setItem: (_key: string, value: string) => { held = value; }, removeItem: () => { held = null; }, get held() { return held; } };
}

test('a hero replaced again keeps only its latest object; other heroes are untouched', () => {
  const list = withReplacement(withReplacement(withReplacement([], 1, 'globe'), 3, 'gramophone'), 1, 'chess-knight');
  assert.deepEqual(list, [{ hero: 3, object: 'gramophone' }, { hero: 1, object: 'chess-knight' }]);
});

test('what storage holds is read as data: only hero indexes with shelf ids survive', () => {
  assert.deepEqual(parseReplacements('[{"hero":1,"object":"globe"},{"hero":4,"object":"diving-helmet"}]'), [{ hero: 1, object: 'globe' }, { hero: 4, object: 'diving-helmet' }]);
  assert.deepEqual(parseReplacements('[{"hero":1,"object":"globe","extra":"<script>"}]'), [{ hero: 1, object: 'globe' }]);
  assert.deepEqual(parseReplacements('[{"hero":1,"object":"globe"},{"hero":1,"object":"rocking-horse"}]'), [{ hero: 1, object: 'rocking-horse' }]);
  for (const bad of [null, undefined, '', 'not json', '{}', '"globe"', '[null]', '[{"hero":-1,"object":"globe"}]', '[{"hero":1.5,"object":"globe"}]',
    '[{"hero":"1","object":"globe"}]', '[{"hero":99,"object":"globe"}]', '[{"hero":1,"object":"../secret"}]', '[{"hero":1,"object":"Globe"}]',
    '[{"hero":1,"object":""}]', '[{"hero":1}]', `[{"hero":1,"object":"${'a'.repeat(41)}"}]`])
    assert.deepEqual(parseReplacements(bad), [], String(bad));
  // one bad entry does not lose the good ones
  assert.deepEqual(parseReplacements('[{"hero":0,"object":"globe"},{"hero":1,"object":"NO"},7]'), [{ hero: 0, object: 'globe' }]);
});

test('replacements written are read back; an empty list forgets them; a missing or failing storage remembers nothing', () => {
  const kept = store();
  writeReplacements([{ hero: 2, object: 'globe' }], kept);
  assert.deepEqual(readReplacements(kept), [{ hero: 2, object: 'globe' }]);
  writeReplacements([], kept);
  assert.equal(kept.held, null);
  assert.deepEqual(readReplacements(kept), []);
  assert.deepEqual(readReplacements(store('[{"hero":0,"object":"x"},"junk"]')), [{ hero: 0, object: 'x' }]);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('denied'); } };
  assert.deepEqual(readReplacements(broken), []);
  assert.doesNotThrow(() => writeReplacements([{ hero: 0, object: 'globe' }], broken));
  assert.deepEqual(readReplacements(undefined), []);   // no storage at all (this test process)
});

test('the new object is the grains the changed room has in the hero\'s box, edges included', () => {
  const positions = Float32Array.from([0, 0, 0,  1, 1, 1,  2, 2, 2,  1.5, 1, 1,  1, 3, 1,  1.25, 1.25, 1.25]);
  const room: PointCloud = {
    count: 6, positions, colors: Float32Array.from(positions, v => v / 10), normals: new Float32Array(18).fill(1),
    heroes: [{ name: 'far', min: [5, 5, 5], max: [6, 6, 6] }, { name: 'box', min: [1, 1, 1], max: [2, 2, 2] }],
  };
  const grains = heroGrains(room, 1)!;
  assert.equal(grains.count, 4);   // not the origin, not the one above the box
  assert.deepEqual([...grains.positions], [1, 1, 1, 2, 2, 2, 1.5, 1, 1, 1.25, 1.25, 1.25]);
  assert.deepEqual([...grains.colors].slice(0, 6), [...Float32Array.from([0.1, 0.1, 0.1, 0.2, 0.2, 0.2])]);
  assert.equal(grains.normals.length, 12);
  assert.equal(heroGrains(room, 0)!.count, 0);   // an empty box is a valid, empty object
  assert.equal(heroGrains(room, 2), null);
  assert.equal(heroGrains({ ...room, normals: undefined }, 1), null);
  assert.equal(heroGrains({ ...room, count: 2 }, 1)!.count, 1);   // only the cloud's own count of points is read
});

test('EVA has a line for every entry she refuses, and for the pool', () => {
  for (const what of [...MENU_REFUSED, 'pool'] as const) assert.ok(REFUSALS[what].length > 0 && REFUSALS[what].every(line => line.trim().length > 0), what);
});
