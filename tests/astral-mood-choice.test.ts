import assert from 'node:assert/strict';
import test from 'node:test';
import { MOODS } from '../src/astral/grammar.ts';
import { MOOD_CASTS, MOOD_GRAINS, chooseMood, chosenMood, forgetMood, moodForm } from '../src/astral/mood-choice.ts';

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

/** How far a form reaches along each axis, and the nearest and farthest its grains lie from its middle. */
function measure(form: { positions: Float32Array }) {
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
  let near = Infinity, far = 0;
  for (let i = 0; i < form.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) { low[a] = Math.min(low[a]!, form.positions[i + a]!); high[a] = Math.max(high[a]!, form.positions[i + a]!); }
    const d = Math.hypot(form.positions[i]!, form.positions[i + 1]!, form.positions[i + 2]!);
    near = Math.min(near, d); far = Math.max(far, d);
  }
  return { size: high.map((value, a) => value - low[a]!), near, far };
}

test('every mood has a form: the same grains in each, within half a unit of the middle, each with the way its surface faces', () => {
  for (const mood of MOODS) {
    const form = moodForm(mood);
    assert.equal(form.positions.length, MOOD_GRAINS * 3, mood);
    assert.equal(form.normals.length, MOOD_GRAINS * 3, mood);
    assert.ok(form.positions.every(Number.isFinite) && form.normals.every(Number.isFinite), `${mood}: finite`);
    assert.ok(Math.abs(measure(form).far - 0.5) < 1e-4, `${mood}: reaches 0.5 and no further`);
    for (let i = 0; i < MOOD_GRAINS * 3; i += 3 * 97)
      assert.ok(Math.abs(Math.hypot(form.normals[i]!, form.normals[i + 1]!, form.normals[i + 2]!) - 1) < 1e-3, `${mood}: a unit normal`);
    assert.deepEqual(moodForm(mood), form, `${mood}: the same every time`);
  }
  assert.deepEqual(Object.keys(MOOD_CASTS), [...MOODS]);
});

test('the three forms are unlike one another: a seamed sphere, a ribbon in a figure of eight, a ring round nothing', () => {
  const [sphere, ribbon, ring] = MOODS.map(mood => moodForm(mood)) as [ReturnType<typeof moodForm>, ReturnType<typeof moodForm>, ReturnType<typeof moodForm>];
  // the sphere is round but for its seam, a groove a tenth of its radius deep, and it faces outward everywhere
  const round = measure(sphere);
  assert.ok(round.near > 0.4 && round.near < 0.47, `the seam is a groove: ${round.near}`);
  assert.ok(round.size.every(side => side > 0.9), 'as wide every way');
  for (let i = 0; i < MOOD_GRAINS * 3; i += 3 * 97)
    assert.ok(sphere.positions[i]! * sphere.normals[i]! + sphere.positions[i + 1]! * sphere.normals[i + 1]! + sphere.positions[i + 2]! * sphere.normals[i + 2]! > 0, 'facing out');
  // the ribbon is taller than it is wide or deep, and passes close to its own middle where it crosses
  const loop = measure(ribbon);
  assert.ok(loop.size[1]! > loop.size[0]! && loop.size[1]! > loop.size[2]! * 1.3, `upright: ${loop.size}`);
  assert.ok(loop.near < 0.2, 'it crosses near its middle');
  // the ring keeps clear of its middle all the way round
  const hoop = measure(ring);
  assert.ok(hoop.near > 0.3, `nothing in the middle: ${hoop.near}`);
  assert.ok(hoop.size[0]! > 0.95 && hoop.size[1]! < hoop.size[0]!, 'tipped toward the viewer');
});
