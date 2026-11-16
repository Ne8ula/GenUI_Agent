import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { POSES, parseLedger, roomValues, standingNow } from '../src/astral/grammar.ts';
import type { BaseRoom, Change, Kind, Mood, Slot, Standing, Surface, Thing } from '../src/astral/grammar.ts';
import * as decideModule from '../src/astral/grammar-decide.ts';
import { arrivalOf, decideChange, roomSpent } from '../src/astral/grammar-decide.ts';
import type { Decision } from '../src/astral/grammar-decide.ts';

// ---- Examples for these tests only. Nothing here is a recorded room or the real shelf.

const EVERYWHERE: Kind[] = ['office', 'home', 'service'];
const thing = (id: string, height: number, surfaces: Surface[], kinds: Kind[], era: number, repeatable = false): Thing =>
  ({ id, height, surfaces, kinds, era, repeatable });

const SHELF: Thing[] = [
  thing('chair', 0.9, ['floor'], EVERYWHERE, 1995, true),
  thing('plant', 0.5, ['floor', 'tabletop'], EVERYWHERE, 1995),
  thing('wardrobe', 2, ['floor'], EVERYWHERE, 1995),
  thing('bead', 0.2, ['floor', 'tabletop'], EVERYWHERE, 1995, true),
  thing('picture', 0.6, ['wall'], EVERYWHERE, 1995),
  thing('helmet', 0.45, ['floor', 'tabletop'], [], 1900), // belongs nowhere and is from the wrong era: 20, whatever EVA chooses
  thing('totem', 4, ['floor'], [], 1995),
];
const byId = new Map(SHELF.map((each) => [each.id, each]));

const plain = (id: string): Standing => ({ thing: id, discrepancy: null, pose: 'rests', factor: 1, copies: 1 });
const slot = (id: string, surface: Surface, clear: [number, number, number], holds: Standing | null = null, anchor = false): Slot =>
  ({ id, surface, anchor, clear, holds });

const SLOTS: Slot[] = [
  slot('desk', 'floor', [1.6, 1.2, 0.8], plain('desk'), true), // the recording's own desk: not on the shelf
  slot('seat', 'floor', [1.5, 2.4, 1.5], plain('chair'), true),
  slot('bin', 'floor', [1, 1.5, 1], plain('plant')),
  slot('corner', 'floor', [3, 2.4, 3]),
  slot('ledge', 'tabletop', [0.7, 0.7, 0.7]),   // too low for the plant to hover, and nothing sinks into a table
  slot('low', 'floor', [2.5, 1.5, 2.5]),        // the wardrobe stands here only sunk, or small
  slot('crawl', 'floor', [2.5, 1.1, 2.5]),      // the wardrobe stands here only small
  slot('wall', 'wall', [1.2, 1.2, 1]),
  slot('sky', 'air', [1, 1, 1]),
];
const room = (mood: Mood, deviation = 25, slots: Slot[] = SLOTS): BaseRoom => ({ mood, kind: 'office', era: 1995, deviation, ambiguity: 70, slots });

const AT = 1_800_000_000_000;
const SEEDS = Array.from({ length: 200 }, (_, seed) => seed);
const decide = (base: BaseRoom, ledger: readonly Change[], where: string, what: string | null, seed = 1): Decision =>
  decideChange(base, ledger, SHELF, where, what, seed, AT);
const accepted = (decision: Decision): Change[] => {
  if (!decision.ok) throw new assert.AssertionError({ message: `refused: ${decision.refusal}` });
  return decision.changes;
};
const refusal = (decision: Decision) => (decision.ok ? 'accepted' : decision.refusal);
/** The first seed whose decision, for that pick, puts the thing in that pose. */
const seedFor = (base: BaseRoom, where: string, what: string, pose: string): number => {
  const seed = SEEDS.find((each) => accepted(decide(base, [], where, what, each))[0].pose === pose);
  assert.notEqual(seed, undefined, `no seed gives ${pose}`);
  return seed!;
};
/** Strong, said without the module: a weight of 20 or more in the document's table. */
const strong = (standing: Standing | null | undefined) => !!standing && (standing.discrepancy === 'scale' || standing.discrepancy === 'repetition'
  || standing.discrepancy === 'absence' || (standing.thing !== null && ['hovers', 'sunk', 'mounted'].includes(standing.pose)));
const strongStanding = (base: BaseRoom, ledger: readonly Change[]) => [...standingNow(base, ledger).values()].filter(strong).length;
const deviation = (base: BaseRoom, ledger: readonly Change[]) => roomValues(base, ledger, SHELF).deviation;

/**
 * That a standing is inside its slot's clear volume, worked out here and not by the module: a thing is as wide and deep as it is
 * tall; 0.3 m of air under a hover; 60% of a sunk thing shows, above a floor or out of a wall; a leaning thing takes 1.2 times its
 * height and depth; copies stand in a grid, each on 1.25 times its width. These repeat the module's proposals on purpose.
 */
function assertFits(base: BaseRoom, change: Change): void {
  const { surface, clear: [width, height, depth] } = base.slots.find((each) => each.id === change.slot)!;
  const size = byId.get(change.thing!)!.height * change.factor;
  const where = `${change.thing} ${change.pose} x${change.factor} x${change.copies} in ${change.slot}`;
  const shown = change.pose === 'sunk' ? 0.6 : 1, lean = change.pose === 'leans' ? 1.2 : 1;
  const tall = size * (surface === 'wall' ? 1 : shown) * lean + (change.pose === 'hovers' && surface !== 'air' ? 0.3 : 0);
  const deep = size * (surface === 'wall' ? shown : 1) * lean;
  assert.ok(size > 0 && tall <= height, `${where}: height`);
  if (change.copies === 1) {
    assert.ok(size <= width && deep <= depth, `${where}: floor`);
  } else {
    const across = Math.floor(width / (size * 1.25)), back = Math.floor(depth / (size * 1.25));
    assert.ok(across >= 1 && back >= 1 && across * back >= change.copies, `${where}: grid`);
  }
}

// ---- The module itself

test('the module exports what the seam lists, and reads no clock, no randomness and no three.js', () => {
  assert.deepEqual(Object.keys(decideModule).sort(), ['arrivalOf', 'decideChange', 'roomSpent']);
  const code = readFileSync(new URL('../src/astral/grammar-decide.ts', import.meta.url), 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /Math\.random|Date|performance|from 'three|document|window/);
});

test('each pose has the arrival the pose table gives it', () => {
  assert.deepEqual(POSES.map((pose) => [pose, arrivalOf(pose)]), [
    ['rests', 'assembles'], ['hovers', 'rises'], ['dropped', 'falls'], ['sunk', 'pushes-up'], ['leans', 'tips'], ['mounted', 'assembles'], ['turned', 'turns'],
  ]);
});

test('a room is spent when its deviation is over 70, not at 70', () => {
  assert.equal(roomSpent(room('quiet', 70), [], SHELF), false);
  assert.equal(roomSpent(room('quiet', 71), [], SHELF), true);
  const hover: Change = { ...plain('chair'), discrepancy: 'displacement', pose: 'hovers', slot: 'corner', seed: 0, at: AT };
  assert.equal(roomSpent(room('quiet', 50), [hover], SHELF), false);
  assert.equal(roomSpent(room('quiet', 51), [hover], SHELF), true);
});

// ---- Refusals

test('unknown: no such slot, no such thing, a thing only the recording has, or nothing to take away', () => {
  const base = room('eerie');
  assert.equal(refusal(decide(base, [], 'nowhere', 'chair')), 'unknown');
  assert.equal(refusal(decide(base, [], 'corner', 'ghost')), 'unknown');
  assert.equal(refusal(decide(base, [], 'corner', 'desk')), 'unknown');
  assert.equal(refusal(decide(base, [], 'corner', null)), 'unknown');
  const gone = accepted(decide(base, [], 'bin', null));
  assert.equal(refusal(decide(base, gone, 'bin', null)), 'unknown', 'an absence cannot be taken away again');
});

test('unknown: a seed or a time that a stored ledger would drop', () => {
  const base = room('eerie');
  for (const [seed, at] of [[NaN, AT], [Infinity, AT], [1, NaN], [1, -1], [1, Infinity]]) {
    assert.equal(refusal(decideChange(base, [], SHELF, 'corner', 'chair', seed, at)), 'unknown', `seed ${seed} at ${at}`);
  }
  for (const [seed, at] of [[1.5, AT], [2 ** 40, AT], [-3, 0]]) {
    const changes = accepted(decideChange(base, [], SHELF, 'corner', 'chair', seed, at));
    assert.deepEqual(parseLedger(changes, base, SHELF), changes);
  }
});

test('spent: a room over 70 refuses every pick, and unknown is said before spent, spent before fit', () => {
  const base = room('eerie', 75);
  for (const [where, what] of [['corner', 'chair'], ['bin', null], ['seat', 'plant']] as const) assert.equal(refusal(decide(base, [], where, what)), 'spent');
  assert.equal(refusal(decide(base, [], 'nowhere', 'chair')), 'unknown');
  assert.equal(refusal(decide(base, [], 'corner', 'picture')), 'spent');
  assert.equal(refusal(decide(room('eerie'), [], 'corner', 'picture')), 'fit');
});

test('fit: the wrong surface, or too large in every pose at every allowed size', () => {
  const base = room('eerie');
  assert.equal(refusal(decide(base, [], 'corner', 'picture')), 'fit', 'a wall thing does not go on a floor');
  assert.equal(refusal(decide(base, [], 'ledge', 'wardrobe')), 'fit', 'a floor thing does not go on a tabletop');
  assert.equal(refusal(decide(base, [], 'sky', 'totem')), 'fit', 'too large for the air it would hang in');
  // An anchor's slot and a thing that does not belong: it is the fit that is refused, before the anchor is asked about.
  assert.equal(refusal(decide(base, [], 'desk', 'totem')), 'fit');
  assert.equal(accepted(decide(base, [], 'wall', 'picture'))[0].pose, 'rests');
  // A clear volume with a side of nothing or less holds nothing, also when two sides are negative.
  for (const clear of [[-1, 2, -1], [0, 2, 1], [1, 2, 0], [1, -2, 1], [NaN, 2, 1]] as [number, number, number][]) {
    assert.equal(refusal(decide(room('eerie', 25, [slot('pit', 'floor', clear)]), [], 'pit', 'plant')), 'fit', `${clear}`);
  }
});

test('a leaning thing needs more room than a standing one', () => {
  // The plant fills this slot exactly: it can be turned, and cannot hover, sink into a table or lean.
  const tight = room('quiet', 25, [slot('top', 'tabletop', [0.5, 0.5, 0.5])]);
  assert.deepEqual([...new Set(SEEDS.map((seed) => accepted(decide(tight, [], 'top', 'plant', seed))[0].pose))], ['turned']);
});

test('anchor: familiarity does not go under 65', () => {
  const base = room('eerie'); // two anchors: losing either leaves 50
  assert.equal(refusal(decide(base, [], 'seat', 'helmet')), 'anchor', 'a thing that does not belong');
  assert.equal(refusal(decide(base, [], 'seat', null)), 'anchor', 'nothing');
  assert.equal(accepted(decide(base, [], 'seat', 'plant')).length, 1, 'a thing that belongs keeps the anchor');

  const three = room('eerie', 25, [...SLOTS, slot('stool', 'floor', [1.5, 2.4, 1.5], plain('chair'), true)]);
  const first = accepted(decide(three, [], 'seat', 'helmet')); // one anchor of three lost: 67
  assert.equal(refusal(decide(three, first, 'stool', null)), 'anchor');
  assert.equal(refusal(decide(three, first, 'stool', 'helmet')), 'anchor');
  // A second absence is not a second loss: it puts the first right, so the chair returns and familiarity stays at 67.
  const emptied = accepted(decide(three, [], 'seat', null));
  const moved = accepted(decide(three, emptied, 'stool', null));
  assert.deepEqual(moved.map(({ slot: where, thing: what }) => [where, what]), [['stool', null], ['seat', 'chair']]);
});

test('anchor: a change that does not lower familiarity is not refused, even in a room with no anchor', () => {
  const bare = room('eerie', 25, SLOTS.map((each) => ({ ...each, anchor: false })));
  assert.equal(roomValues(bare, [], SHELF).familiarity, 0);
  assert.equal(accepted(decide(bare, [], 'corner', 'chair')).length, 1);
  assert.equal(accepted(decide(bare, [], 'seat', null)).length, 1);
});

test('EVA does not break the anchor by her own choice', () => {
  // In an anchor's slot a wrong size would leave familiarity at 50; she repeats the chair or leaves it plain, and is never refused.
  for (const seed of SEEDS) {
    const [change] = accepted(decide(room('uncanny'), [], 'seat', 'chair', seed));
    assert.notEqual(change.discrepancy, 'scale');
    assert.equal(change.factor, 1);
  }
});

// ---- The visitor picks what, EVA picks how

test('with no strong discrepancy standing, the change carries one of a kind the mood prefers', () => {
  const quiet = SEEDS.map((seed) => accepted(decide(room('quiet'), [], 'corner', 'chair', seed)));
  for (const changes of quiet) {
    assert.equal(changes.length, 1);
    assert.equal(changes[0].discrepancy, 'displacement');
    assert.ok(strong(changes[0]));
  }
  assert.deepEqual([...new Set(quiet.map(([change]) => change.pose))].sort(), ['hovers', 'sunk']);

  const uncanny = SEEDS.map((seed) => accepted(decide(room('uncanny'), [], 'corner', 'chair', seed))[0]);
  for (const change of uncanny) {
    assert.equal(change.pose, 'rests');
    assert.ok(change.discrepancy === 'scale' ? change.factor !== 1 && change.copies === 1 : change.discrepancy === 'repetition' && change.factor === 1 && change.copies > 1);
  }
  assert.deepEqual([...new Set(uncanny.map((change) => change.discrepancy))].sort(), ['repetition', 'scale']);
});

test('a thing that cannot bear what the mood prefers arrives plainly', () => {
  // Eerie absence prefers absence, which no thing carries.
  for (const seed of SEEDS) {
    assert.deepEqual(decide(room('eerie'), [], 'corner', 'chair', seed), { ok: true, changes: [{ ...plain('chair'), slot: 'corner', seed, at: AT }] });
  }
  // The plant is not repeatable and the ledge has no room for it at another size... except smaller.
  const sizes = new Set(SEEDS.map((seed) => accepted(decide(room('uncanny'), [], 'ledge', 'plant', seed))[0].factor));
  assert.deepEqual([...sizes], [0.4]);
});

test('where no strong pose fits, a displaced thing leans or is turned', () => {
  const poses = new Set(SEEDS.map((seed) => {
    const [change] = accepted(decide(room('quiet'), [], 'ledge', 'plant', seed));
    assert.equal(change.discrepancy, 'displacement');
    return change.pose;
  }));
  assert.deepEqual([...poses].sort(), ['leans', 'turned']);
});

test('nothing is an absence in any mood', () => {
  for (const mood of ['quiet', 'uncanny', 'eerie'] as const) {
    assert.deepEqual(decide(room(mood), [], 'bin', null, 7), {
      ok: true, changes: [{ thing: null, discrepancy: 'absence', pose: 'rests', factor: 1, copies: 1, slot: 'bin', seed: 7, at: AT }],
    });
  }
});

test('while a strong discrepancy stands elsewhere, the next thing arrives plainly', () => {
  const ledger = accepted(decide(room('quiet'), [], 'corner', 'chair'));
  for (const seed of SEEDS) assert.deepEqual(accepted(decide(room('quiet'), ledger, 'ledge', 'plant', seed)), [{ ...plain('plant'), slot: 'ledge', seed, at: AT }]);
});

test('replacing the thing that carries the strong discrepancy lets the new thing carry one, with nothing to put right', () => {
  const base = room('uncanny');
  const ledger = accepted(decide(base, [], 'corner', 'chair'));
  for (const seed of SEEDS) {
    const changes = accepted(decide(base, ledger, 'corner', 'plant', seed));
    assert.equal(changes.length, 1);
    assert.equal(changes[0].discrepancy, 'scale');
    assert.equal(strongStanding(base, [...ledger, ...changes]), 1);
  }
});

// ---- One strong discrepancy, and the old one put right

test('a new strong discrepancy puts the old one right in the same decision', () => {
  const quiet = room('quiet');
  // A hovering chair drops; a sunk one rests.
  for (const [pose, right] of [['hovers', 'dropped'], ['sunk', 'rests']] as const) {
    const ledger = accepted(decide(quiet, [], 'corner', 'chair', seedFor(quiet, 'corner', 'chair', pose)));
    assert.equal(deviation(quiet, ledger), 45);
    const changes = accepted(decide(quiet, ledger, 'bin', null, 3));
    assert.deepEqual(changes, [
      { thing: null, discrepancy: 'absence', pose: 'rests', factor: 1, copies: 1, slot: 'bin', seed: 3, at: AT },
      { ...plain('chair'), pose: right, slot: 'corner', seed: 3, at: AT },
    ]);
    assert.equal(deviation(quiet, [...ledger, ...changes]), 45);
    assert.equal(strongStanding(quiet, [...ledger, ...changes]), 1);
  }

  // Wrong scale returns to true size and repetition to one, also when the recording itself declares them.
  for (const wrong of [{ discrepancy: 'scale', factor: 4 }, { discrepancy: 'repetition', copies: 5 }] as const) {
    const recorded = room('uncanny', 25, SLOTS.map((each) => (each.id === 'corner' ? { ...each, holds: { ...plain('plant'), ...wrong } } : each)));
    assert.equal(deviation(recorded, []), 55);
    const changes = accepted(decide(recorded, [], 'bin', null));
    assert.deepEqual(changes[1], { ...plain('plant'), slot: 'corner', seed: 1, at: AT });
    assert.equal(deviation(recorded, changes), 45);
  }

  // An absence is put right by the thing that last stood there.
  const eerie = room('eerie');
  const emptied = accepted(decide(eerie, [], 'bin', null));
  const hung = accepted(decide(eerie, emptied, 'sky', 'chair')); // only hovers in the air: a strong discrepancy the visitor forced
  assert.deepEqual(hung.map(({ slot: where, thing: what, pose }) => [where, what, pose]), [['sky', 'chair', 'hovers'], ['bin', 'plant', 'rests']]);
  const later = accepted(decide(eerie, emptied, 'bin', 'bead'));
  const again = accepted(decide(eerie, [...emptied, ...later, ...accepted(decide(eerie, [...emptied, ...later], 'bin', null))], 'sky', 'chair'));
  assert.equal(again[1].thing, 'bead', 'the last thing to stand there, not the recording\'s');
});

test('a strong discrepancy that cannot be put right stays the only one', () => {
  const quiet = room('quiet');
  // The wardrobe fits its slot only sunk, so it cannot rest there.
  const ledger = accepted(decide(quiet, [], 'low', 'wardrobe'));
  assert.equal(ledger[0].pose, 'sunk');
  for (const seed of SEEDS) assert.deepEqual(accepted(decide(quiet, ledger, 'corner', 'chair', seed)), [{ ...plain('chair'), slot: 'corner', seed, at: AT }]);
  // reading: picks that can only arrive as a second strong discrepancy are refused as 'fit'.
  assert.equal(refusal(decide(quiet, ledger, 'bin', null)), 'fit');
  assert.equal(refusal(decide(quiet, ledger, 'sky', 'chair')), 'fit');
  // The same holds for a discrepancy of the recording's own thing, which the shelf cannot draw again.
  const recorded = room('quiet', 25, SLOTS.map((each) => (each.id === 'desk' ? { ...each, holds: { ...plain('desk'), discrepancy: 'displacement', pose: 'hovers' } as Standing } : each)));
  assert.equal(refusal(decide(recorded, [], 'bin', null)), 'fit');
  assert.equal(accepted(decide(recorded, [], 'corner', 'chair'))[0].discrepancy, null);
});

test('a recording that declares several strong discrepancies keeps them through plain changes, and a new strong one puts all right', () => {
  const hovering: Standing = { ...plain('chair'), discrepancy: 'displacement', pose: 'hovers' };
  const base = room('eerie', 0, SLOTS.map((each) => (each.id === 'corner' || each.id === 'low' ? { ...each, holds: hovering } : each)));
  const plainly = accepted(decide(base, [], 'ledge', 'plant'));
  assert.equal(plainly.length, 1);
  assert.equal(strongStanding(base, plainly), 2);
  const changes = accepted(decide(base, [], 'bin', null));
  assert.deepEqual(changes.map(({ slot: where, thing: what, pose }) => [where, what, pose]), [['bin', null, 'rests'], ['corner', 'chair', 'dropped'], ['low', 'chair', 'dropped']]);
  assert.equal(strongStanding(base, changes), 1);
});

test('only one strong discrepancy ever stands, and everything chosen fits its slot and survives storing', () => {
  const picks = [...SHELF.map((each) => each.id), null];
  let made = 0;
  for (const mood of ['quiet', 'uncanny', 'eerie'] as const) {
    for (let walk = 1; walk <= 40; walk++) {
      const base = room(mood, 5);
      const ledger: Change[] = [];
      let x = walk * 7919;
      const next = (n: number) => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return (x >>> 16) % n; };
      for (let step = 0; step < 40; step++) {
        const where = SLOTS[next(SLOTS.length)].id, what = picks[next(picks.length)];
        const decision = decide(base, ledger, where, what, next(1 << 15));
        if (!decision.ok) continue;
        made++;
        for (const change of decision.changes) if (change.thing !== null) assertFits(base, change);
        assert.equal(decision.changes[0].slot, where);
        assert.equal(decision.changes[0].thing, what);
        assert.deepEqual(parseLedger(decision.changes, base, SHELF), decision.changes, 'a stored ledger keeps every change');
        ledger.push(...decision.changes);
        assert.ok(strongStanding(base, ledger) <= 1, `${mood} walk ${walk} step ${step}`);
      }
    }
  }
  assert.ok(made > 600, `only ${made} changes were made`);
});

// ---- Spending the room

test('EVA never spends the room by her own choice', () => {
  // 30 more would be 75: the chair arrives plainly, for every seed.
  for (const seed of SEEDS) {
    const changes = accepted(decide(room('uncanny', 45), [], 'corner', 'chair', seed));
    assert.equal(changes[0].discrepancy, null);
    assert.equal(roomSpent(room('uncanny', 45), changes, SHELF), false);
  }
  // 30 more is exactly 70, which is not over it.
  for (const seed of SEEDS) {
    const changes = accepted(decide(room('uncanny', 40), [], 'corner', 'chair', seed));
    assert.ok(strong(changes[0]));
    assert.equal(deviation(room('uncanny', 40), changes), 70);
  }
  for (const seed of SEEDS) assert.equal(accepted(decide(room('quiet', 51), [], 'corner', 'chair', seed))[0].pose, 'rests');
  for (const seed of SEEDS) assert.ok(strong(accepted(decide(room('quiet', 50), [], 'corner', 'chair', seed))[0]));
  // The helmet brings 20 of its own; with a wrong size on top the room would be spent, so she adds nothing.
  for (const seed of SEEDS) assert.equal(accepted(decide(room('uncanny', 30), [], 'corner', 'helmet', seed))[0].discrepancy, null);
});

test('a weight the visitor forces spends the room, and the next request is refused', () => {
  // A thing that does not belong, from the wrong era: 20 onto 55.
  const base = room('uncanny', 55);
  const changes = accepted(decide(base, [], 'corner', 'helmet'));
  assert.deepEqual(changes, [{ ...plain('helmet'), slot: 'corner', seed: 1, at: AT }]);
  assert.equal(deviation(base, changes), 75);
  assert.equal(roomSpent(base, changes, SHELF), true);
  for (const [where, what] of [['corner', 'chair'], ['corner', null], ['ledge', 'plant']] as const) assert.equal(refusal(decide(base, changes, where, what)), 'spent');

  // A pose that is the only one that fits: a chair in the air hovers.
  const eerie = room('eerie', 55);
  const hung = accepted(decide(eerie, [], 'sky', 'chair'));
  assert.equal(hung[0].pose, 'hovers');
  assert.equal(roomSpent(eerie, hung, SHELF), true);
  assert.equal(refusal(decide(eerie, hung, 'corner', 'chair')), 'spent');

  // Nothing: an absence of 20.
  const emptied = accepted(decide(eerie, [], 'bin', null));
  assert.equal(roomSpent(eerie, emptied, SHELF), true);
});

// ---- Poses, sizes and numbers

test('a thing that fits its slot in one way only takes that way, the lightest first', () => {
  const eerie = room('eerie');
  for (const seed of SEEDS) {
    assert.deepEqual(accepted(decide(eerie, [], 'low', 'wardrobe', seed))[0], { ...plain('wardrobe'), discrepancy: 'displacement', pose: 'sunk', slot: 'low', seed, at: AT });
    assert.equal(accepted(decide(eerie, [], 'wall', 'chair', seed))[0].pose, 'mounted');
    assert.equal(accepted(decide(eerie, [], 'sky', 'plant', seed))[0].pose, 'hovers');
  }
  // Too tall even sunk: it can only stand there small.
  const sizes = new Set(SEEDS.map((seed) => {
    const [change] = accepted(decide(eerie, [], 'crawl', 'wardrobe', seed));
    assert.deepEqual([change.discrepancy, change.pose], ['scale', 'rests']);
    return change.factor;
  }));
  assert.deepEqual([...sizes].sort(), [0.25, 0.4]);
});

test('every pose and every arrival can be reached', () => {
  const quiet = room('quiet'), eerie = room('eerie');
  const poses = new Set<string>();
  for (const seed of SEEDS) {
    for (const [base, where, what] of [[eerie, 'corner', 'chair'], [quiet, 'corner', 'chair'], [quiet, 'ledge', 'plant'], [eerie, 'wall', 'chair']] as const) {
      poses.add(accepted(decide(base, [], where, what, seed))[0].pose);
    }
  }
  const hovering = accepted(decide(quiet, [], 'corner', 'chair', seedFor(quiet, 'corner', 'chair', 'hovers')));
  poses.add(accepted(decide(quiet, hovering, 'bin', null))[1].pose);
  assert.deepEqual([...poses].sort(), [...POSES].sort());
  assert.deepEqual([...new Set([...poses].map((pose) => arrivalOf(pose as typeof POSES[number])))].sort(), ['assembles', 'falls', 'pushes-up', 'rises', 'tips', 'turns']);
});

test('proposed ranges: wrong sizes of 0.25 to 6 and never under 0.15 m, 3 to 9 copies, all inside the clear volume', () => {
  const base = room('uncanny');
  const factors = new Set<number>(), copies = new Set<number>();
  for (const seed of SEEDS) {
    for (const [where, what] of [['corner', 'bead'], ['corner', 'chair'], ['bin', 'chair'], ['ledge', 'bead'], ['corner', 'plant']] as const) {
      const [change] = accepted(decide(base, [], where, what, seed));
      assertFits(base, change);
      assert.ok(byId.get(what)!.height * change.factor >= 0.15);
      if (change.discrepancy === 'scale') factors.add(change.factor);
      if (change.discrepancy === 'repetition') copies.add(change.copies);
    }
  }
  assert.deepEqual([...factors].sort((a, b) => a - b), [0.25, 0.4, 2.5, 4, 6]);
  assert.deepEqual([...copies].sort((a, b) => a - b), [3, 4, 5, 6, 7, 8, 9]);
  // The corner has floor for four chairs and no more; the bin's slot has floor for one.
  const chairs = new Set(SEEDS.map((seed) => accepted(decide(base, [], 'corner', 'chair', seed))[0].copies));
  assert.deepEqual([...chairs].sort(), [1, 3, 4]);
  for (const seed of SEEDS) assert.equal(accepted(decide(base, [], 'bin', 'chair', seed))[0].copies, 1);
});

// ---- Seeds

test('the same inputs and seed give the same decision, different seeds vary it, and nothing passed in is changed', () => {
  const base = room('uncanny');
  const ledger = Object.freeze(accepted(decide(room('eerie'), [], 'ledge', 'plant')));
  const snapshot = JSON.stringify([base, ledger, SHELF]);
  const seen = new Set<string>();
  for (const seed of SEEDS) {
    const decision = decide(base, ledger, 'corner', 'chair', seed);
    assert.deepEqual(decide(base, ledger, 'corner', 'chair', seed), decision);
    for (const change of accepted(decision)) assert.deepEqual([change.seed, change.at], [seed, AT]);
    seen.add(JSON.stringify(accepted(decision).map(({ seed: _seed, ...rest }) => rest)));
  }
  assert.ok(seen.size >= 4, `${seen.size} different decisions`);
  assert.equal(JSON.stringify([base, ledger, SHELF]), snapshot);
});
