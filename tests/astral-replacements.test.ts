import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decideChange, roomSpent, type Refusal } from '../src/astral/grammar-decide.ts';
import type { Change, Thing } from '../src/astral/grammar.ts';
import { MENU_REFUSED } from '../src/astral/menu.ts';
import { baseRoom, validatePosedManifest } from '../src/astral/posed-frames.ts';
import { pickSeed, readLedger, writeLedger } from '../src/astral/replacements.ts';
import { REFUSALS, SIDE_TEASES } from '../src/astral/tease.ts';

// The real library and the real shelf, as the page has them.
const json = (path: string) => JSON.parse(readFileSync(new URL(`../public/fixtures/${path}`, import.meta.url), 'utf8'));
const base = baseRoom(validatePosedManifest(json('library/manifest.json')))!;
const shelf: Thing[] = json('objects/manifest.json').objects;

/** A storage that holds one string, as localStorage would. */
function store(initial: string | null = null) {
  let held = initial;
  return { getItem: () => held, setItem: (_key: string, value: string) => { held = value; }, removeItem: () => { held = null; }, get held() { return held; } };
}
/** The visitor's picks, each decided with the page's own seed, at a fixed time. */
function visit(picks: readonly (readonly [slot: string, thing: string | null])[]) {
  let ledger: Change[] = [];
  const said: (Refusal | string)[] = [];
  for (const [slot, thing] of picks) {
    const decision = decideChange(base, ledger, shelf, slot, thing, pickSeed(base, ledger, slot), 1_700_000_000_000);
    if (decision.ok) ledger = [...ledger, ...decision.changes];
    said.push(decision.ok ? decision.changes.map(change => `${change.slot}:${change.thing}:${change.discrepancy}:${change.pose}`).join(' ') : decision.refusal);
  }
  return { ledger, said };
}
// The path captured in headless Chrome for step 5 (.local/eva-decides/).
const PATH = [['books', 'televisions'], ['statue-head', 'globe'], ['sky-cube', null], ['sky-cube', 'diving-helmet'], ['sky-cube', 'gramophone'], ['books', null]] as const;

test('a visit in the library: EVA\'s discrepancy, a plain pick, "nothing" putting it right, a forced pick that spends the room, then refusals', () => {
  const { ledger, said } = visit(PATH);
  assert.deepEqual(said, [
    'books:televisions:displacement:hovers',                             // the first pick carries her discrepancy
    'statue-head:globe:null:rests',                                      // one stands, so the next arrives plainly
    'sky-cube:null:absence:rests books:televisions:null:dropped',        // "nothing" is a new one: the old is put right
    'sky-cube:diving-helmet:displacement:hovers',                        // in the air a thing only hovers: the visitor forced it
    'spent', 'spent',
  ]);
  assert.equal(ledger.length, 5);
  assert.equal(roomSpent(base, ledger, shelf), true);
  assert.equal(roomSpent(base, ledger.slice(0, 4), shelf), false);
  // elsewhere a forced pick puts two things right at once: the absence's thing returns as the new discrepancy arrives
  assert.deepEqual(visit([['books', 'televisions'], ['statue-head', 'globe'], ['statue-head', null], ['sky-cube', 'diving-helmet']]).said.at(-1),
    'sky-cube:diving-helmet:displacement:hovers statue-head:globe:null:rests');
  // the same picks in the same order are decided the same way
  assert.deepEqual(visit(PATH).said, said);
});

test('the seed is the ledger\'s length and the slot, nothing else', () => {
  const { ledger } = visit(PATH.slice(0, 2));
  assert.equal(pickSeed(base, [], 'clock'), 0);
  assert.notEqual(pickSeed(base, [], 'books'), pickSeed(base, [], 'clock'));
  assert.notEqual(pickSeed(base, ledger, 'books'), pickSeed(base, [], 'books'));
  assert.equal(pickSeed(base, ledger, 'books'), pickSeed(base, [...ledger].reverse(), 'books'));
  assert.ok(Number.isFinite(pickSeed(base, ledger, 'no-such-slot')));
});

test('a ledger written is read back whole; an empty one forgets it; a missing or failing storage remembers nothing', () => {
  const { ledger } = visit(PATH), kept = store();
  writeLedger(ledger, kept);
  assert.deepEqual(readLedger(base, shelf, kept), ledger);
  writeLedger([], kept);
  assert.equal(kept.held, null);
  assert.deepEqual(readLedger(base, shelf, kept), []);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('denied'); } };
  assert.deepEqual(readLedger(base, shelf, broken), []);
  assert.doesNotThrow(() => writeLedger(ledger, broken));
  assert.deepEqual(readLedger(base, shelf, undefined), []);   // no storage at all (this test process)
});

test('what storage holds is read as data: only changes to this room\'s slots with this shelf\'s things survive', () => {
  const good = visit(PATH.slice(0, 1)).ledger[0]!;
  for (const bad of [null, '', 'not json', '{}', '"globe"', '[null]', '[7,"junk"]', JSON.stringify([{ ...good, slot: 'pool' }]), JSON.stringify([{ ...good, thing: '../secret' }]),
    JSON.stringify([{ ...good, pose: 'flying' }]), JSON.stringify([{ ...good, factor: 1e9 }]), JSON.stringify([{ ...good, seed: 'x' }])])
    assert.deepEqual(readLedger(base, shelf, store(bad)), [], String(bad));
  // one bad entry does not lose the good ones, and nothing extra is carried through
  assert.deepEqual(readLedger(base, shelf, store(JSON.stringify([{ ...good, extra: '<script>' }, { ...good, slot: 'nowhere' }, 7]))), [good]);
});

test('EVA has a line for every entry she refuses, for the pool, and for every check a pick can fail', () => {
  for (const what of [...MENU_REFUSED, 'pool', 'unknown', 'spent', 'fit', 'anchor'] as const satisfies readonly (keyof typeof REFUSALS)[])
    assert.ok(REFUSALS[what].length > 0 && REFUSALS[what].every(line => line.trim().length > 0), what);
});

test('every line of EVA\'s is one sentence of twenty words at most (owner, 2026-11-17)', () => {
  for (const line of [...SIDE_TEASES, ...Object.values(REFUSALS).flat()]) {
    assert.ok(line.split(/\s+/).length <= 20, line);
    assert.match(line, /^[^.?!]+[.?!]$/, line);   // one sentence: nothing ends before the end
  }
});
