import test from 'node:test';
import assert from 'node:assert/strict';
import { POSES, duration, frameAt, steppedFrame, type Scenario } from '../src/crime-scene/playback.ts';

const radians = (degrees: number) => degrees * Math.PI / 180;
const scenario: Scenario = {
  title: 'Synthetic hypothesis',
  hypothetical: true,
  actors: [{ id: 'A', label: 'Person A' }, { id: 'B', label: 'Person B' }, { id: 'C', label: 'Absent' }],
  steps: [
    { t: 0, actor: 'A', pose: 'stand', position: [0, 0], facing: radians(170), object_moves: [], caption: 'Start' },
    { t: 5, actor: 'B', pose: 'reach', position: [2, 3], facing: 0, object_moves: [], caption: 'B appears' },
    { t: 10, actor: 'A', pose: 'push', position: [10, 20], facing: radians(-170), object_moves: [{ tag: 69, state: 'upright', position: [1, 2, 3] }], caption: 'First move' },
    { t: 20, actor: 'A', pose: 'fall', position: [-10, 0], facing: 0, object_moves: [{ tag: 69, state: 'displaced', position: [4, 5, 6] }, { tag: 17, state: 'upright', position: [7, 8, 9] }], caption: 'End' },
  ],
};
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('interpolates position and facing between steps, blending pose names', () => {
  assert.deepEqual(POSES, ['stand', 'walk', 'reach', 'push', 'strike', 'fall', 'crouch', 'lie']);
  const frame = frameAt(scenario, 5);
  assert.equal(frame.step, 1);
  assert.deepEqual(frame.actors[0]!.position, [5, 10]);
  assert.equal(frame.actors[0]!.pose, 'stand');
  assert.equal(frame.actors[0]!.next, 'push');
  assert.equal(frame.actors[0]!.blend, 0.5);
  near(frame.actors[0]!.facing, Math.PI);
  const reversed: Scenario = { ...scenario, steps: [...scenario.steps].reverse() };
  const before = structuredClone(reversed);
  assert.deepEqual(frameAt(reversed, 5), frame);
  assert.equal(duration(reversed), 20);
  assert.deepEqual(reversed, before);
  const clockwise: Scenario = { ...scenario, steps: scenario.steps.slice(0, 3).map(step => ({ ...step, facing: -step.facing })) };
  near(frameAt(clockwise, 5).actors[0]!.facing, -Math.PI);
});

test('actor and object transitions ease into and out of keyframes', () => {
  const early = frameAt(scenario, 2.5).actors[0]!;
  near(early.blend, .15625);
  near(early.position[0], 1.5625);
  near(frameAt(scenario, 7.5).actors[0]!.blend, .84375);
  near(frameAt(scenario, 6.25).objects[0]!.blend, .15625);
  near(frameAt(scenario, 8.75).objects[0]!.blend, .84375);
  near(frameAt(scenario, 0).actors[0]!.blend, 0);
});

test('holds the last step after the end', () => {
  assert.equal(duration(scenario), 20);
  const last = frameAt(scenario, 20);
  assert.deepEqual(frameAt(scenario, 60), last);
  assert.equal(last.step, 3);
  assert.deepEqual(last.actors[0]!, { id: 'A', pose: 'fall', next: 'fall', blend: 1, remaining: 0, elapsed: 0, position: [-10, 0], facing: 0 });
  assert.deepEqual(last.actors[1], { id: 'B', pose: 'reach', next: 'reach', blend: 1, remaining: 0, elapsed: 15, position: [2, 3], facing: 0 });
  const single: Scenario = { ...scenario, steps: [scenario.steps[0]!] };
  assert.equal(duration(single), 0);
  assert.deepEqual(frameAt(single, 30), frameAt(single, 0));
});

test('objects blend from previous state to the step\'s state', () => {
  assert.deepEqual(frameAt(scenario, 2).objects[0]!, { tag: 69, from: 'current', to: 'current', blend: 1, fromPosition: null, toPosition: null });
  assert.deepEqual(frameAt(scenario, 7.5).objects[0]!, { tag: 69, from: 'current', to: 'upright', blend: 0.5, fromPosition: null, toPosition: null });
  assert.deepEqual(frameAt(scenario, 15).objects[0]!, { tag: 69, from: 'upright', to: 'displaced', blend: 0.5, fromPosition: null, toPosition: [4, 5, 6] });
  assert.deepEqual(frameAt(scenario, 20).objects[0]!, { tag: 69, from: 'displaced', to: 'displaced', blend: 1, fromPosition: [4, 5, 6], toPosition: [4, 5, 6] });
  assert.equal(frameAt(scenario, 15).objects[1]!.from, 'current');
  const sparse: Scenario = { ...scenario, steps: scenario.steps.map((step, index) => ({ ...step, object_moves: index === 0 ? [{ tag: 69, state: 'current', position: [0, 0, 0] }] : step.object_moves })) };
  const held = frameAt(sparse, 2).objects[0]!;
  assert.equal(held.blend, 1);
  assert.equal(held.toPosition, null);
  assert.equal(frameAt(sparse, 7.5).objects[0]!.fromPosition, null);
  const restored: Scenario = { ...scenario, steps: [...scenario.steps, { ...scenario.steps[3]!, t: 30, object_moves: [{ tag: 69, state: 'current', position: [99, 99, 99] }] }] };
  assert.deepEqual(frameAt(restored, 25).objects[0], { tag: 69, from: 'displaced', to: 'current', blend: 0.5, fromPosition: [4, 5, 6], toPosition: null });
});

test('duplicate object tags resolve to the last entry throughout the transition', () => {
  const duplicates: Scenario = { ...scenario, steps: scenario.steps.map((step, index) => index === 2
    ? { ...step, object_moves: [...step.object_moves, { tag: 69, state: 'displaced', position: [9, 8, 7] }] }
    : step) };
  assert.deepEqual(frameAt(duplicates, 7.5).objects[0], { tag: 69, from: 'current', to: 'displaced', blend: 0.5, fromPosition: null, toPosition: [9, 8, 7] });
  assert.deepEqual(frameAt(duplicates, 10).objects[0]!.fromPosition, [9, 8, 7]);
  assert.deepEqual(steppedFrame(duplicates, 2).objects[0], { tag: 69, from: 'displaced', to: 'displaced', blend: 1, fromPosition: [9, 8, 7], toPosition: [9, 8, 7] });
});

test('non-finite times and indexes fall back to zero', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(frameAt(scenario, value), frameAt(scenario, 0));
    assert.deepEqual(steppedFrame(scenario, value), steppedFrame(scenario, 0));
  }
});

test('actor absent before first appearance', () => {
  assert.deepEqual(frameAt(scenario, 4).actors.map(actor => actor.id), ['A']);
  assert.deepEqual(frameAt(scenario, 5).actors.map(actor => actor.id), ['A', 'B']);
  const delayed: Scenario = { ...scenario, steps: scenario.steps.slice(1) };
  assert.deepEqual(frameAt(delayed, 0).actors, []);
  assert.equal(frameAt(delayed, 0).step, -1);
  const objectOnly: Scenario = { ...scenario, steps: [{ ...scenario.steps[2]!, actor: null }] };
  assert.deepEqual(frameAt(objectOnly, 10).actors, []);
  assert.equal(frameAt(objectOnly, 5).objects[0]!.blend, 0.5);
  const atZero: Scenario = { ...objectOnly, steps: objectOnly.steps.map(step => ({ ...step, t: 0 })) };
  const beforeZero = frameAt(atZero, -1).objects[0]!;
  assert.equal(beforeZero.from, 'current');
  assert.equal(beforeZero.blend, 0);
});

test('steppedFrame returns exact step states', () => {
  const frame = steppedFrame(scenario, 1);
  assert.equal(frame.step, 1);
  assert.deepEqual(frame.actors[0]!, { id: 'A', pose: 'stand', next: 'stand', blend: 1, remaining: 0, elapsed: null, position: [0, 0], facing: radians(170) });
  assert.deepEqual(frame.actors[1], { id: 'B', pose: 'reach', next: 'reach', blend: 1, remaining: 0, elapsed: null, position: [2, 3], facing: 0 });
  assert.equal(frame.objects[0]!.from, 'current');
  assert.equal(frame.objects[0]!.to, 'current');
  assert.equal(frame.objects[0]!.blend, 1);
  const second = steppedFrame(scenario, 2);
  assert.equal(second.actors[0]!.pose, 'push');
  assert.equal(second.actors[0]!.next, 'push');
  assert.equal(second.actors[0]!.blend, 1);
  assert.deepEqual(second.actors[0]!.position, [10, 20]);
  assert.equal(second.actors[0]!.facing, radians(-170));
  assert.deepEqual(second.objects[0]!, { tag: 69, from: 'upright', to: 'upright', blend: 1, fromPosition: null, toPosition: null });
  const ties: Scenario = { ...scenario, steps: scenario.steps.map(step => ({ ...step, t: 0 })) };
  assert.deepEqual(steppedFrame(ties, 0).actors.map(actor => actor.id), ['A']);
  assert.equal(steppedFrame(ties, 0).actors[0]!.pose, 'stand');
  assert.equal(frameAt(ties, 0).actors[0]!.pose, 'fall');
  assert.deepEqual(steppedFrame(scenario, 99), steppedFrame(scenario, 3));
  assert.deepEqual(steppedFrame(scenario, -1), steppedFrame(scenario, 0));
});
