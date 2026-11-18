import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import type { WebGLRenderer } from 'three';
import { baseRoom, validatePosedManifest } from '../src/astral/posed-frames.ts';
import { MOODS, roomState, roomValues } from '../src/astral/grammar.ts';
import { loadRecordedRoomCloud } from '../src/astral/room-source.ts';
import { MOOD_CASTS } from '../src/astral/mood-choice.ts';
import { castGain } from '../src/astral/point-field.ts';

// The three base rooms of LIMINAL-GRAMMAR.md step 7: each mood's recorded room, its manifest written by hand.
const read = (mood: string) => validatePosedManifest(JSON.parse(readFileSync(new URL(`../public/fixtures/${mood}/manifest.json`, import.meta.url), 'utf8')));
const KIND = { quiet: 'office', uncanny: 'home', eerie: 'service' } as const;
// The fixtures are not committed until Git LFS is decided (AGENTS.md, Repository): a checkout without them skips, and says so.
const absent = MOODS.some(mood => !existsSync(new URL(`../public/fixtures/${mood}/manifest.json`, import.meta.url)));
const skip = absent ? 'the base rooms\' fixtures are not in this checkout' : false;

for (const mood of MOODS) test(`the ${mood} base room is a valid room of its mood, readable and unspent before the first pick`, { skip }, () => {
  const manifest = read(mood), base = baseRoom(manifest)!;
  assert.equal(manifest.frames.length, 15);
  assert.equal(manifest.frames[0].source, 'picture');
  assert.deepEqual([manifest.splats, manifest.points], ['room.spz', 'points.bin']);
  assert.deepEqual([base.mood, base.kind], [mood, KIND[mood]]);
  // Its anchors stand, so it reads as its own state; and it starts under the 70 that spends a room.
  const values = roomValues(base, [], []);
  assert.equal(values.familiarity, 100);
  assert.equal(roomState(values), mood);
  assert.ok(base.slots.filter(slot => slot.anchor).length >= 2, 'two anchors, so one can be replaced by a thing of the room\'s kind');
  assert.ok(base.slots.some(slot => slot.holds === null), 'a slot on open floor that holds nothing');
  // No box of a slot or a place reaches into another: a change in one never takes another's points.
  const boxes = [...manifest.heroes!, ...(manifest.places ?? [])].map(each => ({ id: each.slot!.id, min: each.min, max: each.max }));
  for (const a of boxes) for (const b of boxes) {
    if (a !== b) assert.ok([0, 1, 2].some(axis => a.max[axis]! <= b.min[axis]! || a.min[axis]! >= b.max[axis]!), `${a.id} is in the box of ${b.id}`);
  }
});

test('only the uncanny room, whose mood repeats things, declares places for the copies', { skip }, () => {
  assert.deepEqual(MOODS.map(mood => baseRoom(read(mood))!.places), [0, 5, 0]);
});

test('the mood picked loads that mood\'s base room; ?room= names another for development; no mood and any other name load the library', async t => {
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => { urls.push(url); return new Response('{}'); });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'location');
  t.after(() => { if (original) Object.defineProperty(globalThis, 'location', original); else Reflect.deleteProperty(globalThis, 'location'); });
  const fetched = async (search: string, mood?: typeof MOODS[number] | null) => {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { search } });
    await assert.rejects(loadRecordedRoomCloud(null as unknown as WebGLRenderer, new AbortController().signal, mood), /Invalid posed-frame manifest/);
    return urls.pop();
  };
  for (const mood of MOODS) assert.equal(await fetched('', mood), `/fixtures/${mood}/manifest.json`);
  for (const mood of MOODS) assert.equal(await fetched(`?room=${mood}`, 'quiet'), `/fixtures/${mood}/manifest.json`);
  assert.equal(await fetched('?room=library', 'eerie'), '/fixtures/library/manifest.json');
  for (const room of ['cellar', '../objects']) assert.equal(await fetched(`?room=${encodeURIComponent(room)}`, 'uncanny'), '/fixtures/uncanny/manifest.json');
  for (const search of ['', '?room=cellar']) assert.equal(await fetched(search, null), '/fixtures/library/manifest.json');
});

test('a room that declares a cast is lit by its mood\'s cast by default: nothing brighter, the cast\'s weakest colour pulled furthest', { skip }, () => {
  assert.deepEqual(castGain(undefined), [1, 1, 1]);   // the library declares none, and is shown as recorded
  assert.deepEqual(castGain([0.5, 0.5, 0.5]), [1, 1, 1]);
  for (const bad of [[0, 0, 0], [1, 1], [1, -0.2, 1], [NaN, 1, 1]]) assert.deepEqual(castGain(bad), [1, 1, 1]);
  const weakest = { quiet: 2, uncanny: 0, eerie: 2 } as const;   // yellow-green and warm white lose blue, teal loses red
  for (const mood of MOODS) {
    assert.equal(typeof read(mood).room?.cast?.colour, 'string');
    const gain = castGain(MOOD_CASTS[mood]);
    assert.ok(gain.every(value => value > 0.7 && value <= 1) && Math.max(...gain) === 1, mood);
    assert.equal(gain.indexOf(Math.min(...gain)), weakest[mood], mood);
  }
});
