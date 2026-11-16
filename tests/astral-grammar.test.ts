import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLedger, roomState, roomValues, standingNow } from '../src/astral/grammar.ts';
import type { BaseRoom, Change, Discrepancy, Kind, Pose, Slot, Standing, Surface, Thing, Values } from '../src/astral/grammar.ts';

// ---- Examples for these tests only. Nothing here is a recorded room or the real shelf.

const thing = (id: string, height: number, surfaces: Surface[], kinds: Kind[], era: number, repeatable = false): Thing =>
  ({ id, height, surfaces, kinds, era, repeatable });

const SHELF: Thing[] = [
  thing('desk', 0.75, ['floor'], ['office'], 1990),
  thing('office-chair', 0.95, ['floor'], ['office'], 1995),
  thing('monitor', 0.4, ['tabletop'], ['office', 'home'], 1995),
  thing('filing-cabinet', 1.3, ['floor'], ['office'], 1985),
  thing('pot-plant', 0.6, ['floor', 'tabletop'], ['office', 'home', 'service'], 1995, true),
  thing('armchair', 0.9, ['floor'], ['home'], 1985),
  thing('sideboard', 0.8, ['floor'], ['home'], 1980),
  thing('television', 0.5, ['floor', 'tabletop'], ['home', 'office'], 1990, true),
  thing('washing-machine', 0.85, ['floor'], ['service'], 1995, true),
  thing('stacking-chair', 0.8, ['floor'], ['service', 'office'], 1990, true),
  thing('gramophone', 0.7, ['floor', 'tabletop'], ['home'], 1910), // from the wrong era for every room below
];

const stands = (id: string | null, discrepancy: Discrepancy | null = null, pose: Pose = 'rests', factor = 1, copies = 1): Standing =>
  ({ thing: id, discrepancy, pose, factor, copies });
const slot = (id: string, anchor: boolean, holds: Standing | null, surface: Surface = 'floor'): Slot =>
  ({ id, surface, anchor, clear: [1, 2, 1], holds });
const change = (slotId: string, standing: Standing, at = 0): Change => ({ ...standing, slot: slotId, seed: 1, at });

/** Quietly liminal: an office where one chair faces the wall and an armchair from a home stands in the corner. */
const QUIET: BaseRoom = {
  mood: 'quiet', kind: 'office', era: 1995, deviation: 5, ambiguity: 70,
  slots: [
    slot('desk', true, stands('desk')),
    slot('chair', true, stands('office-chair', 'displacement', 'turned')),
    slot('screen', true, stands('monitor'), 'tabletop'),
    slot('cabinet', true, stands('filing-cabinet')),
    slot('corner', true, stands('armchair')),
    slot('spare', false, null),
    slot('plant', false, stands('pot-plant')),
  ],
};

/** Subtly uncanny: a sitting room where the pot plant is three times its size. */
const UNCANNY: BaseRoom = {
  mood: 'uncanny', kind: 'home', era: 1988, deviation: 15, ambiguity: 75,
  slots: [
    slot('chair-a', true, stands('armchair')),
    slot('chair-b', true, stands('armchair', 'displacement', 'turned')),
    slot('sideboard', true, stands('sideboard')),
    slot('television', true, stands('television')),
    slot('screen', true, stands('monitor'), 'tabletop'),
    slot('second-sideboard', true, stands('sideboard')),
    slot('plant', true, stands('pot-plant', 'scale', 'rests', 3)),
    slot('spare', false, null),
  ],
};

/** Eerie absence: a laundromat set out for use, with one machine gone and its place showing. */
const EERIE: BaseRoom = {
  mood: 'eerie', kind: 'service', era: 1992, deviation: 0, ambiguity: 95,
  slots: [
    ...[1, 2, 3, 4, 5, 6].map((n) => slot(`machine-${n}`, true, stands('washing-machine'))),
    slot('machine-7', true, stands(null, 'absence')),
    ...[1, 2, 3].map((n) => slot(`seat-${n}`, true, stands('stacking-chair'))),
    slot('spare', false, null),
  ],
};

const near = (actual: number, expected: number, label: string) =>
  assert.ok(Math.abs(actual - expected) <= 2, `${label}: ${actual} is not near ${expected}`);

test('the three example base rooms start near their mood\'s figures and in their mood\'s state', () => {
  for (const [room, familiarity, deviation, ambiguity] of [[QUIET, 80, 25, 70], [UNCANNY, 85, 55, 75], [EERIE, 90, 20, 95]] as const) {
    const values = roomValues(room, [], SHELF);
    near(values.familiarity, familiarity, `${room.mood} familiarity`);
    near(values.deviation, deviation, `${room.mood} deviation`);
    near(values.ambiguity, ambiguity, `${room.mood} ambiguity`);
    assert.equal(roomState(values), room.mood);
  }
});

test('standingNow: the latest change to a slot wins, else the recording stands', () => {
  const ledger = [
    change('spare', stands('television'), 30),
    change('desk', stands('gramophone', 'displacement', 'hovers'), 20),
    change('nowhere', stands('television'), 25),
    change('spare', stands('pot-plant', 'scale', 'rests', 2), 10), // later in the ledger, though earlier by the clock
  ];
  const now = standingNow(QUIET, ledger);
  assert.deepEqual([...now.keys()], QUIET.slots.map((s) => s.id), 'the room\'s slots, and no others');
  assert.deepEqual(now.get('spare'), stands('pot-plant', 'scale', 'rests', 2));
  assert.deepEqual(now.get('desk'), stands('gramophone', 'displacement', 'hovers'));
  assert.deepEqual(now.get('cabinet'), stands('filing-cabinet'));
  assert.equal(standingNow(QUIET, []).get('spare'), null);
  assert.equal(now.has('nowhere'), false);
});

test('deviation: each discrepancy and pose adds its weight to what the recording carries', () => {
  const start = roomValues(QUIET, [], SHELF).deviation;
  const added = (standing: Standing) => roomValues(QUIET, [change('spare', standing)], SHELF).deviation - start;
  // a pot plant belongs everywhere and is of the room's era, so only the choice weighs
  assert.equal(added(stands('pot-plant')), 0);
  assert.equal(added(stands('pot-plant', 'scale', 'rests', 3)), 30);
  assert.equal(added(stands('pot-plant', 'repetition', 'rests', 1, 6)), 30);
  assert.equal(added(stands('pot-plant', 'displacement', 'hovers')), 20);
  assert.equal(added(stands('pot-plant', 'displacement', 'sunk')), 20);
  assert.equal(added(stands('pot-plant', 'displacement', 'mounted')), 20);
  assert.equal(added(stands('pot-plant', 'displacement', 'leans')), 10);
  assert.equal(added(stands('pot-plant', 'displacement', 'turned')), 10);
  assert.equal(added(stands('pot-plant', null, 'dropped')), 0);
  assert.equal(added(stands('pot-plant', 'light')), 10);
  assert.equal(added(stands('pot-plant', 'era')), 10);
  assert.equal(added(stands(null, 'absence')), 20);
  // the pose carries a displacement's weight; the word alone carries none, and nothing poses an absence
  assert.equal(added(stands('pot-plant', 'displacement')), 0);
  assert.equal(added(stands(null, 'absence', 'hovers')), 20);
  // discrepancy and pose add up
  assert.equal(added(stands('pot-plant', 'scale', 'hovers', 3)), 50);
});

test('deviation: a thing from another kind of place or the wrong era weighs without being chosen', () => {
  const start = roomValues(QUIET, [], SHELF).deviation;
  const added = (room: BaseRoom, standing: Standing) => roomValues(room, [change('spare', standing)], SHELF).deviation;
  assert.equal(added(QUIET, stands('sideboard')) - start, 10, 'a sideboard is not an office thing');
  assert.equal(added(QUIET, stands('gramophone')) - start, 20, 'a gramophone is neither an office thing nor of 1995');
  assert.equal(added(QUIET, stands('gramophone', 'era')) - start, 20, 'the wrong era counts once');
  const homeStart = roomValues(UNCANNY, [], SHELF).deviation;
  assert.equal(added(UNCANNY, stands('gramophone')) - homeStart, 10, 'in a home only its era is wrong');
  // 25 years is still the room's era; 26 is not
  const year = (era: number) => roomValues({ ...QUIET, era }, [change('spare', stands('pot-plant'))], SHELF).deviation
    - roomValues({ ...QUIET, era }, [], SHELF).deviation;
  assert.equal(year(1995 + 25), 0);
  assert.equal(year(1995 + 26), 10);
});

test('deviation: a plain thing in place of a wrong one lowers it, and it stays within 0 to 100', () => {
  const start = roomValues(UNCANNY, [], SHELF).deviation;
  assert.equal(roomValues(UNCANNY, [change('plant', stands('pot-plant'))], SHELF).deviation, start - 30);
  const everything = UNCANNY.slots.map((s) => change(s.id, stands('gramophone', 'scale', 'hovers', 3)));
  assert.equal(roomValues(UNCANNY, everything, SHELF).deviation, 100);
});

test('familiarity: the share of anchor slots holding a thing of the room\'s kind at its true size', () => {
  const familiarity = (room: BaseRoom, ...ledger: Change[]) => roomValues(room, ledger, SHELF).familiarity;
  assert.equal(familiarity(QUIET), 80, 'four of five: the armchair is not an office thing');
  assert.equal(familiarity(QUIET, change('corner', stands('filing-cabinet'))), 100);
  assert.equal(familiarity(QUIET, change('desk', stands('sideboard'))), 60, 'a thing from elsewhere');
  assert.equal(familiarity(QUIET, change('desk', stands('desk', 'scale', 'rests', 2))), 60, 'the right thing at the wrong size');
  assert.equal(familiarity(QUIET, change('desk', stands(null, 'absence'))), 60, 'nothing');
  assert.equal(familiarity(QUIET, change('desk', stands('desk', 'displacement', 'hovers'))), 80, 'a pose leaves the anchor');
  assert.equal(familiarity(QUIET, change('spare', stands('gramophone'))), 80, 'a slot that is not an anchor does not count');
  assert.equal(familiarity({ ...QUIET, slots: QUIET.slots.map((s) => ({ ...s, anchor: false })) }), 0, 'no anchor declared');
  // a thing only the recording knows is the recording's own
  const recorded: BaseRoom = { ...QUIET, slots: [slot('counter', true, stands('reception-counter'))] };
  assert.deepEqual(roomValues(recorded, [], SHELF), { familiarity: 100, deviation: 5, ambiguity: 70 });
});

test('ambiguity: starts at the room\'s figure, rises 5 for each absence made, and never falls', () => {
  const ambiguity = (room: BaseRoom, ...ledger: Change[]) => roomValues(room, ledger, SHELF).ambiguity;
  assert.equal(ambiguity(QUIET), 70);
  assert.equal(ambiguity(EERIE), 95, 'the recording\'s own absence is inside its figure');
  const gone = change('desk', stands(null, 'absence'));
  assert.equal(ambiguity(QUIET, gone), 75);
  assert.equal(ambiguity(QUIET, gone, change('cabinet', stands(null, 'absence'))), 80);
  assert.equal(ambiguity(QUIET, gone, gone), 75, 'the same absence twice is one absence');
  const back = change('desk', stands('desk'));
  assert.equal(ambiguity(QUIET, gone, back), 75, 'the thing returning does not lower it');
  assert.equal(ambiguity(QUIET, gone, back, gone), 80, 'taken away again is a second absence');
  assert.equal(ambiguity(QUIET, change('spare', stands('pot-plant', 'scale', 'hovers', 3))), 70, 'only absences raise it');
  assert.equal(ambiguity(QUIET, change('nowhere', stands(null, 'absence'))), 70, 'an unknown slot changes nothing');
  assert.equal(ambiguity(EERIE, change('machine-1', stands(null, 'absence')), change('machine-2', stands(null, 'absence'))), 100);
  assert.equal(ambiguity(EERIE, change('machine-7', stands(null, 'absence'))), 95, 'already absent in the recording');
});

test('roomState: each state, and the edges of each threshold', () => {
  const state = (familiarity: number, deviation: number, ambiguity: number) => roomState({ familiarity, deviation, ambiguity });
  assert.equal(state(80, 20, 40), 'ordinary');
  assert.equal(state(80, 25, 70), 'quiet');
  assert.equal(state(90, 20, 95), 'eerie');
  assert.equal(state(85, 55, 75), 'uncanny');
  assert.equal(state(85, 80, 75), 'surreal');
  assert.equal(state(20, 20, 70), 'unreadable');
  // familiarity: under 35 is unreadable, and it is tested before anything else
  assert.equal(state(34.9, 25, 70), 'unreadable');
  assert.equal(state(35, 25, 70), 'quiet');
  assert.equal(state(34, 90, 70), 'unreadable');
  assert.equal(state(0, 0, 0), 'unreadable');
  // deviation: under 35 is the low band, 35 to 70 the uncanny band, over 70 surreal
  assert.equal(state(80, 34.9, 70), 'quiet');
  assert.equal(state(80, 35, 70), 'uncanny');
  assert.equal(state(80, 70, 70), 'uncanny');
  assert.equal(state(80, 70.1, 70), 'surreal');
  assert.equal(state(80, 100, 0), 'surreal', 'deviation is tested before ambiguity');
  // ambiguity in the low band: 55 or less ordinary, over 55 quiet, 85 or more eerie
  assert.equal(state(80, 20, 55), 'ordinary');
  assert.equal(state(80, 20, 55.1), 'quiet');
  assert.equal(state(80, 20, 84.9), 'quiet');
  assert.equal(state(80, 20, 85), 'eerie');
  assert.equal(state(80, 20, 100), 'eerie');
  // ambiguity in the uncanny band: eerie does not apply, and 55 or less has no row of its own
  assert.equal(state(80, 50, 95), 'uncanny');
  assert.equal(state(80, 50, 55.1), 'uncanny');
  assert.equal(state(80, 50, 55), 'ordinary');
});

test('parseLedger: a good ledger comes back whole, in order, with only its known fields', () => {
  const ledger: Change[] = [
    { slot: 'spare', thing: 'television', discrepancy: null, pose: 'rests', factor: 1, copies: 1, seed: 7, at: 1794787200000 },
    { slot: 'desk', thing: null, discrepancy: 'absence', pose: 'rests', factor: 1, copies: 1, seed: 8, at: 1794787260000 },
    { slot: 'plant', thing: 'pot-plant', discrepancy: 'scale', pose: 'rests', factor: 4, copies: 1, seed: 9, at: 1794787320000 },
    { slot: 'spare', thing: 'television', discrepancy: 'repetition', pose: 'rests', factor: 1, copies: 12, seed: 10, at: 1794787380000 },
    { slot: 'chair', thing: 'office-chair', discrepancy: 'displacement', pose: 'sunk', factor: 1, copies: 1, seed: -3.5, at: 0 },
    { slot: 'spare', thing: null, discrepancy: null, pose: 'rests', factor: 1, copies: 1, seed: 11, at: 1794787440000 },
  ];
  assert.deepEqual(parseLedger(JSON.parse(JSON.stringify(ledger)), QUIET, SHELF), ledger);
  const extra = [{ ...ledger[0], html: '<script>', __proto__: { polluted: true } }];
  const [kept] = parseLedger(extra, QUIET, SHELF);
  assert.deepEqual(kept, ledger[0]);
  assert.deepEqual(Object.keys(kept).sort(), ['at', 'copies', 'discrepancy', 'factor', 'pose', 'seed', 'slot', 'thing']);
});

test('parseLedger: what is not a ledger, or not a change to this room with this shelf, is dropped', () => {
  for (const bad of [null, undefined, '', 'spare', 7, {}, { length: 1, 0: {} }, '[{"slot":"spare"}]'])
    assert.deepEqual(parseLedger(bad, QUIET, SHELF), [], String(bad));

  const good = { slot: 'spare', thing: 'television', discrepancy: null, pose: 'rests', factor: 1, copies: 1, seed: 7, at: 5 };
  assert.equal(parseLedger([good], QUIET, SHELF).length, 1);
  const without = (key: string) => Object.fromEntries(Object.entries(good).filter(([k]) => k !== key));
  const bad: unknown[] = [
    null, 7, 'spare', [], [good],
    ...Object.keys(good).map(without), // every field is required
    { ...good, slot: 'nowhere' }, { ...good, slot: 'machine-1' }, { ...good, slot: 5 }, { ...good, slot: '__proto__' },
    { ...good, thing: 'unicorn' }, { ...good, thing: 'Television' }, { ...good, thing: 3 }, { ...good, thing: undefined },
    { ...good, discrepancy: 'magic' }, { ...good, discrepancy: 0 }, { ...good, discrepancy: undefined },
    { ...good, pose: 'flies' }, { ...good, pose: null },
    // an absence is a slot with no thing, and no thing carries no other discrepancy
    { ...good, discrepancy: 'absence' }, { ...good, thing: null, discrepancy: 'scale', factor: 2 }, { ...good, thing: null, discrepancy: 'light' },
    // factor: in range, and 1 unless the discrepancy is scale
    { ...good, factor: 2 }, { ...good, discrepancy: 'scale', factor: 0 }, { ...good, discrepancy: 'scale', factor: -2 },
    { ...good, discrepancy: 'scale', factor: 10.5 }, { ...good, discrepancy: 'scale', factor: 0.05 }, { ...good, discrepancy: 'scale', factor: NaN },
    { ...good, discrepancy: 'scale', factor: Infinity }, { ...good, discrepancy: 'scale', factor: '2' },
    // copies: a whole number in range, and 1 unless the discrepancy is repetition
    { ...good, copies: 2 }, { ...good, discrepancy: 'repetition', copies: 0 }, { ...good, discrepancy: 'repetition', copies: 2.5 },
    { ...good, discrepancy: 'repetition', copies: 33 }, { ...good, discrepancy: 'repetition', copies: Infinity }, { ...good, discrepancy: 'repetition', copies: '4' },
    { ...good, seed: NaN }, { ...good, seed: Infinity }, { ...good, seed: '7' }, { ...good, seed: null },
    { ...good, at: -1 }, { ...good, at: NaN }, { ...good, at: Infinity }, { ...good, at: '5' },
  ];
  for (const entry of bad) assert.deepEqual(parseLedger([entry], QUIET, SHELF), [], JSON.stringify(entry));
  // one bad entry does not lose the good ones round it
  assert.deepEqual(parseLedger([good, ...bad, { ...good, seed: 8 }], QUIET, SHELF).map((c) => c.seed), [7, 8]);
});

test('parseLedger: the number of entries is bounded, keeping the latest', () => {
  const entry = (seed: number) => ({ slot: 'spare', thing: 'television', discrepancy: null, pose: 'rests', factor: 1, copies: 1, seed, at: seed });
  const kept = parseLedger(Array.from({ length: 2000 }, (_, i) => entry(i)), QUIET, SHELF);
  assert.equal(kept.length, 512);
  assert.equal(kept[0].seed, 2000 - 512);
  assert.equal(kept[511].seed, 1999);
  // the bound is on what is read, so a flood of rubbish cannot be made to cost more than that many entries
  assert.deepEqual(parseLedger([...Array.from({ length: 600 }, () => 'x'), entry(1)], QUIET, SHELF).map((c) => c.seed), [1]);
  assert.deepEqual(parseLedger([entry(1), ...Array.from({ length: 600 }, () => 'x')], QUIET, SHELF), []);
});

// The values feed the state: one worked room from recording to spent.
test('a room moves through its states as the ledger grows', () => {
  const at = (...ledger: Change[]): [Values, string] => { const v = roomValues(QUIET, ledger, SHELF); return [v, roomState(v)]; };
  assert.equal(at()[1], 'quiet');
  const tall = change('plant', stands('pot-plant', 'scale', 'rests', 3));
  assert.deepEqual(at(tall), [{ familiarity: 80, deviation: 55, ambiguity: 70 }, 'uncanny']);
  const hung = change('spare', stands('television', null, 'mounted'));
  assert.deepEqual(at(tall, hung), [{ familiarity: 80, deviation: 75, ambiguity: 70 }, 'surreal']);
  const emptied = ['desk', 'chair', 'screen', 'cabinet'].map((id) => change(id, stands(null, 'absence')));
  assert.equal(at(...emptied)[1], 'unreadable');
});
