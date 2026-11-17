import assert from 'node:assert/strict';
import test from 'node:test';
import { MOODS } from '../src/astral/grammar.ts';
import { MOOD_CASTS, chooseMood, chosenMood, forgetMood, moodRoom } from '../src/astral/mood-choice.ts';

/** A storage that holds one string, as localStorage would. */
function store(initial: string | null = null) {
  let held = initial;
  return { getItem: () => held, setItem: (_key: string, value: string) => { held = value; }, removeItem: () => { held = null; }, get held() { return held; } };
}

test('no room exists until a mood is chosen; the chosen mood is read back; forgetting it leaves no room', () => {
  const kept = store();
  assert.equal(chosenMood(kept), null);
  for (const mood of MOODS) { chooseMood(mood, kept); assert.equal(chosenMood(kept), mood); }
  forgetMood(kept);
  assert.equal(kept.held, null);
  assert.equal(chosenMood(kept), null);
});

test('what storage holds is read as data: anything but a mood\'s name is no room', () => {
  for (const bad of ['', 'surreal', 'Quiet', ' quiet', '"quiet"', '["quiet"]', '{"mood":"quiet"}', '0', 'null', '__proto__', 'constructor', 'quiet\n', 'q'.repeat(100_000)])
    assert.equal(chosenMood(store(bad)), null, bad.slice(0, 40));
  for (const mood of MOODS) assert.equal(chosenMood(store(mood)), mood);
});

test('only a mood is stored, and a storage that fails remembers nothing without throwing', () => {
  const kept = store();
  chooseMood('surreal' as never, kept);
  assert.equal(kept.held, null);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('denied'); } };
  assert.equal(chosenMood(broken), null);
  assert.doesNotThrow(() => chooseMood('quiet', broken));
  assert.doesNotThrow(() => forgetMood(broken));
});

/** A room of `count` mid-grey points along x, each with a normal. */
function room(count: number) {
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3).fill(0.5), normals = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { positions[i * 3] = i; normals[i * 3 + 1] = 1; }
  return { count, positions, colors, normals };
}

test('a small room is a thinned copy of its base room, taken evenly through it, and the base room is untouched', () => {
  const base = room(1000), small = moodRoom(base, 'quiet', 100);
  assert.equal(small.count, 100);
  assert.equal(small.positions.length, 300);
  const xs = Array.from({ length: small.count }, (_, i) => small.positions[i * 3]!);
  assert.ok(xs.every((x, i) => Number.isInteger(x) && x >= 0 && x < 1000 && (i === 0 || x > xs[i - 1]!)), 'its points are the room\'s, in the room\'s order');
  assert.ok(xs[0]! < 20 && xs[99]! > 980 && xs.every((x, i) => i === 0 || x - xs[i - 1]! < 20), 'from end to end, with no stretch left out');
  assert.deepEqual([...small.normals!.subarray(0, 3)], [0, 1, 0]);
  assert.ok(base.colors.every(value => value === 0.5));
  // a room with fewer points than asked is not padded; one without normals gets none; none asked, or none there, is none
  assert.ok(moodRoom(room(7), 'eerie', 100).count <= 7);
  assert.equal(moodRoom({ count: 2, positions: new Float32Array(6), colors: new Float32Array(6) }, 'eerie').normals, undefined);
  assert.equal(moodRoom(room(0), 'quiet').count, 0);
  assert.equal(moodRoom(base, 'quiet', 0).count, 0);
  assert.equal(moodRoom(base, 'quiet', -3).count, 0);
});

test('a small room leaves out the few far-flung points, and what lies behind the spot where the visitor arrives', () => {
  // two points of a thousand lie far outside the rest: with them the room would be drawn a thousandth of its size
  const stray = room(1000);
  stray.positions[500 * 3] = 1e6; stray.positions[250 * 3 + 1] = -1e6;
  const small = moodRoom(stray, 'uncanny', 1000);
  assert.ok(small.count > 900);
  assert.ok(small.positions.every(value => Math.abs(value) < 1000));
  // arriving at x 500 and looking along +x: the room from a metre behind that spot onward
  const ahead = moodRoom({ ...room(1000), arrival: { position: [500, 0, 0], lookAt: [506, 0, 0] } }, 'uncanny', 1000);
  const xs = Array.from({ length: ahead.count }, (_, i) => ahead.positions[i * 3]!);
  assert.ok(ahead.count > 450 && xs.every(x => x > 499), `${ahead.count} points from ${Math.min(...xs)}`);
  // looking the other way, the other half
  const back = moodRoom({ ...room(1000), arrival: { position: [500, 0, 0], lookAt: [400, 0, 0] } }, 'uncanny', 1000);
  assert.ok(back.count > 450 && back.positions.every((x, i) => i % 3 !== 0 || x < 501));
});

test('each mood tints the same room with its own cast, and a point stays as bright as it was', () => {
  const light = (c: ArrayLike<number>) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  const tints = MOODS.map(mood => [...moodRoom(room(10), mood).colors.subarray(0, 3)]);
  for (const tint of tints) assert.ok(Math.abs(light(tint) - 0.5) < 0.01, `brightness kept: ${tint}`);
  const [quiet, uncanny, eerie] = tints as [number[], number[], number[]];
  assert.ok(quiet[1]! > quiet[0]! && quiet[0]! > quiet[2]! + 0.15, `yellow-green: ${quiet}`);
  assert.ok(uncanny[1]! > uncanny[0]! + 0.2 && uncanny[2]! > uncanny[0]! + 0.2, `teal: ${uncanny}`);
  assert.ok(eerie[0]! > eerie[2]! && eerie[1]! > eerie[2]! && eerie[0]! - eerie[2]! < 0.15, `warm white with green in it: ${eerie}`);
  // the three differ from one another by more than a shade
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++)
    assert.ok(Math.hypot(...tints[a]!.map((value, i) => value - tints[b]![i]!)) > 0.1, `${MOODS[a]} against ${MOODS[b]}`);
  // black stays black, and nothing leaves 0..1
  const lit = { count: 2, positions: new Float32Array(6), colors: Float32Array.from([0, 0, 0, 1, 1, 1]) };
  for (const mood of MOODS) {
    const colors = moodRoom(lit, mood).colors;
    assert.deepEqual([...colors.subarray(0, 3)], [0, 0, 0]);
    assert.ok(colors.every(value => value >= 0 && value <= 1));
  }
  assert.deepEqual(Object.keys(MOOD_CASTS), [...MOODS]);
});
