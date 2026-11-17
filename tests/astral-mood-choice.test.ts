import assert from 'node:assert/strict';
import test from 'node:test';
import { MOODS } from '../src/astral/grammar.ts';
import { MOOD_CASTS, MOOD_FIGURES, MOOD_POINTS, SHELL_KEPT, SHELL_OPEN, chooseMood, chosenMood, forgetMood, moodFigures, moodPoints } from '../src/astral/mood-choice.ts';

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

test('every mood has a figure in both sets: points in its cast, within reach of the view, with unit normals', () => {
  for (const figures of MOOD_FIGURES) for (const mood of MOODS) {
    const figure = moodPoints(mood, figures), cast = MOOD_CASTS[mood], what = `${figures} ${mood}`;
    assert.ok(figure.count > 500 && figure.count <= MOOD_POINTS, `${what}: ${figure.count} points`);
    assert.equal(figure.positions.length, figure.count * 3, what);
    assert.equal(figure.colors.length, figure.count * 3, what);
    assert.equal(figure.normals!.length, figure.count * 3, what);
    assert.ok(figure.positions.every(value => Math.abs(value) <= 0.75), `${what}: about 1 across`);
    for (let i = 0; i < figure.count; i++) {
      const [r, g, b] = figure.colors.subarray(i * 3, i * 3 + 3) as unknown as [number, number, number], shade = r / cast[0];
      assert.ok(shade > 0.3 && shade <= 1.0001 && Math.abs(g - cast[1] * shade) < 1e-5 && Math.abs(b - cast[2] * shade) < 1e-5, `${what}: its cast`);
      assert.ok(Math.abs(Math.hypot(...figure.normals!.subarray(i * 3, i * 3 + 3)) - 1) < 1e-4, `${what}: a unit normal`);
    }
  }
});

test('the three figures of a set are unlike one another, and those of the grid differ only in what the middle cube does', () => {
  const size = (figure: { count: number; positions: Float32Array }, axis: number) => {
    let low = Infinity, high = -Infinity;
    for (let i = axis; i < figure.count * 3; i += 3) { low = Math.min(low, figure.positions[i]!); high = Math.max(high, figure.positions[i]!); }
    return high - low;
  };
  const [floors, cubes, shell] = MOODS.map(mood => moodPoints(mood, 'forms')) as [ReturnType<typeof moodPoints>, ReturnType<typeof moodPoints>, ReturnType<typeof moodPoints>];
  // a square figure is laid down an eighth of a turn round, so its box is as wide as it is from corner to corner
  assert.ok(size(floors, 1) < 0.5 && Math.abs(size(floors, 0) - Math.SQRT2) < 0.05, 'quiet lies flat');
  assert.ok(size(cubes, 1) > 0.95 && Math.abs(size(cubes, 0) - Math.SQRT2) < 0.05, 'uncanny stands as tall as its largest cube');
  // the shell is round, and open on one side: nothing of it lies toward its opening
  const open = [(SHELL_OPEN[0] + SHELL_OPEN[2]) * Math.SQRT1_2, SHELL_OPEN[1], (SHELL_OPEN[2] - SHELL_OPEN[0]) * Math.SQRT1_2];
  assert.ok(shell.count > 3000 && shell.count < 5000, `eerie keeps about two thirds of its shell: ${shell.count}`);
  for (let i = 0; i < shell.count * 3; i += 3) {
    const [x, y, z] = shell.positions.subarray(i, i + 3) as unknown as [number, number, number];
    assert.ok(Math.abs(Math.hypot(x, y, z) - 0.5) < 1e-4, 'round');
    assert.ok(x * open[0]! + y * open[1]! + z * open[2]! < SHELL_KEPT / 2 + 1e-4, 'with an opening');
  }
  const [lifted, large, gone] = MOODS.map(mood => moodPoints(mood, 'grid')) as [ReturnType<typeof moodPoints>, ReturnType<typeof moodPoints>, ReturnType<typeof moodPoints>];
  assert.ok(size(lifted, 1) > size(large, 1) && size(large, 1) > size(gone, 1) + 0.2, 'lifted, too large, gone');
  assert.ok(gone.count < lifted.count && lifted.count < large.count);
  for (const figure of [lifted, large, gone]) assert.ok(Math.abs(size(figure, 0) - 0.88 * Math.SQRT2) < 0.01, 'the eight cubes round it stand as they were');
});

test('the set of figures is read from the address, and anything else is the first', () => {
  assert.equal(moodFigures(''), 'forms');
  assert.equal(moodFigures('?moods=grid'), 'grid');
  assert.equal(moodFigures('?menu=row&moods=forms'), 'forms');
  assert.equal(moodFigures('?moods=rooms'), 'forms');
  assert.deepEqual(Object.keys(MOOD_CASTS), [...MOODS]);
});
