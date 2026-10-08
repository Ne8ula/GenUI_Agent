import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptScene, createClockSession, stepClocks, syncReducedMotion } from '../src/host/clock.ts';
import type { ClockSession } from '../src/host/clock.ts';
import { applyReducedMotion, buildHostScene, sceneKey } from '../src/host/scenes.ts';
import type { SceneRequest } from '../src/host/scenes.ts';
import type { Scene } from '../src/host/useRenderLoop.ts';

const REQUEST: SceneRequest = { look: 'seed33', seed: 33, density: 0.5, facing: 'away', buildMs: 12_000 };

function scene(patch: Partial<SceneRequest> = {}): Scene {
  const built = buildHostScene({ ...REQUEST, ...patch });
  assert.ok(built.scene, built.error ?? 'the scene must build');
  return built.scene;
}

const keyOf = (startMs: number, patch: Partial<SceneRequest> = {}): string => sceneKey({ ...REQUEST, ...patch, startMs });
const near = (actual: number, expected: number, message?: string): void => assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} is not ${expected}`);

/**
 * The tile life's schedules, counters and swap history. The scene module may keep a `hold` flag on it that a
 * reduced-motion toggle flips on purpose (stop/resume swapping); that flag is the one thing a toggle may change, so it
 * is left out of the comparison and the stop/resume behaviour has its own test.
 */
function tileLife(s: Scene): unknown {
  if (!s.life.tiles) return null;
  const copy = structuredClone(s.life.tiles) as unknown as Record<string, unknown>;
  delete copy.hold;
  return copy;
}

/** Everything a toggle or a remount must leave exactly as it was: both clocks, walker/emitter time, tile life, tiles, particle state. */
function snapshot(session: ClockSession, s: Scene) {
  const store = s.frame.store;
  return {
    clockMs: session.clockMs,
    life: { clockMs: s.life.clockMs, walkMs: s.life.walkMs, emitMs: s.life.emitMs },
    tileState: tileLife(s),
    tiles: structuredClone(s.frame.tiles),
    x: store.x.slice(),
    y: store.y.slice(),
    a: store.a.slice(),
    size: store.size.slice(),
    count: store.count,
  };
}

const laneOf = (s: Scene): Float32Array => s.frame.store.motion.slice(0, s.frame.store.count);

// ---- B: reduced motion is applied in place -----------------------------------------------------------------

test('toggling reduced motion leaves both clocks, walker time, tile state and every particle untouched', () => {
  const s = scene();
  const session = createClockSession();
  assert.equal(adoptScene(session, s, keyOf(3000), 3000, false), 'restarted');
  for (let i = 0; i < 5; i++) stepClocks(session, s, 1000, false);
  const authored = laneOf(s);
  assert.ok(authored.some((v) => v > 0), 'the scene shimmers before the toggle, so the test can tell the lanes changed');
  assert.ok(s.life.tiles, 'the seed-33 scene has tile life');
  const frame = s.frame;
  const store = s.frame.store;
  const tiles = s.frame.tiles;
  const before = snapshot(session, s);

  syncReducedMotion(session, s, true);
  assert.ok(laneOf(s).every((v) => v === 0), 'reduced motion zeroes every shimmer lane');
  assert.deepEqual(snapshot(session, s), before, 'switching on moved nothing but the lanes');

  syncReducedMotion(session, s, false);
  assert.deepEqual(laneOf(s), authored, 'switching off restores exactly the authored lanes');
  assert.deepEqual(snapshot(session, s), before, 'switching off moved nothing either');

  assert.equal(s.frame, frame, 'the scene was not rebuilt');
  assert.equal(s.frame.store, store);
  assert.equal(s.frame.tiles, tiles, 'the very same tiles array');
  assert.equal(session.scene, s);
});

test('a toggle does not replay or stall: the next step moves both clocks by exactly that step and walker time at its reduced rate', () => {
  const s = scene();
  const session = createClockSession();
  adoptScene(session, s, keyOf(3000), 3000, false);
  stepClocks(session, s, 5000, false);
  const walkBefore = s.life.walkMs;

  syncReducedMotion(session, s, true);
  stepClocks(session, s, 1000, true);
  near(session.clockMs, 9000, 'the host clock moved by the step only (no replay to the start, no stall)');
  near(s.life.clockMs, 9000, 'the life clock moved by the step only');
  near(s.life.walkMs - walkBefore, 350, 'walkers advance at the reduced rate for that second, they are not re-advanced from zero');

  syncReducedMotion(session, s, false);
  stepClocks(session, s, 1000, false);
  near(session.clockMs, 10_000);
  near(s.life.clockMs, 10_000);
  near(session.clockMs - s.life.clockMs, 0);
});

test('reduced motion stops the tile swaps and lifting it resumes them, with nothing reset in between', () => {
  const s = scene({ buildMs: 0 });
  const session = createClockSession();
  adoptScene(session, s, keyOf(20_000, { buildMs: 0 }), 20_000, false);
  const life = s.life.tiles;
  assert.ok(life, 'the seed-33 scene has tile life');
  const run = (seconds: number, reduced: boolean): void => {
    for (let i = 0; i < seconds; i++) stepClocks(session, s, 1000, reduced);
  };

  run(60, false);
  syncReducedMotion(session, s, true);
  const heldTotal = life.total;
  const heldTiles = structuredClone(s.frame.tiles);
  const heldSchedule = structuredClone(life.next);
  run(120, true);
  assert.equal(life.total, heldTotal, 'no swap while reduced motion is on');
  assert.deepEqual(s.frame.tiles, heldTiles, 'no tile changed pattern, colour or place');
  assert.deepEqual(life.next, heldSchedule, 'the schedule was not rewritten');

  syncReducedMotion(session, s, false);
  run(240, false);
  assert.ok(life.total > heldTotal, 'swapping resumed once reduced motion was lifted');
  assert.equal(s.life.tiles, life, 'the same tile life carried on; it was not recreated');
});

test('repeated toggling is stable, and a repeated state is a no-op', () => {
  const s = scene();
  const session = createClockSession();
  adoptScene(session, s, keyOf(0), 0, false);
  stepClocks(session, s, 2000, false);
  const authored = laneOf(s);
  for (let i = 0; i < 4; i++) {
    syncReducedMotion(session, s, true);
    syncReducedMotion(session, s, true);
    syncReducedMotion(session, s, false);
    syncReducedMotion(session, s, false);
  }
  assert.deepEqual(laneOf(s), authored);
  near(session.clockMs, 2000);
});

test('a scene adopted while reduced motion is on starts with its lanes at zero and can be restored', () => {
  const s = scene();
  const authored = laneOf(s);
  const session = createClockSession();
  adoptScene(session, s, keyOf(0), 0, true);
  assert.ok(laneOf(s).every((v) => v === 0));
  assert.equal(session.reducedApplied, true);
  syncReducedMotion(session, s, false);
  assert.deepEqual(laneOf(s), authored);
});

test('the arrival look has no shimmer lanes and applyReducedMotion leaves it alone', () => {
  const s = scene({ look: 'arrival', seed: 7 });
  const before = laneOf(s);
  applyReducedMotion(s.frame, true);
  assert.deepEqual(laneOf(s), before);
  applyReducedMotion(s.frame, false);
  assert.deepEqual(laneOf(s), before);
});

// ---- C: a backend switch keeps the host clock and does not re-advance life ----------------------------------

test('a backend switch (the effect runs again on the same session and scene) changes neither clock', () => {
  const s = scene();
  const session = createClockSession();
  const key = keyOf(3000);
  assert.equal(adoptScene(session, s, key, 3000, false), 'restarted');
  near(session.clockMs, 3000);
  near(s.life.clockMs, 3000);
  stepClocks(session, s, 2500, false);
  const before = snapshot(session, s);

  for (let remount = 0; remount < 3; remount++) {
    assert.equal(adoptScene(session, s, key, 3000, false), 'same', 'the new renderer finds the scene it was showing');
  }
  assert.deepEqual(snapshot(session, s), before, 'nothing moved, in particular life was not advanced a second time');
  near(session.clockMs, 5500, 'the host clock did not go back to the start time');
  near(s.life.clockMs, 5500);

  stepClocks(session, s, 500, false);
  near(session.clockMs, 6000);
  near(s.life.clockMs, 6000);
  near(session.clockMs - s.life.clockMs, 0, 'the two clocks never split');
});

test('negative control: a remount that kept no session (the old effect-local clock) would split the clocks', () => {
  const s = scene();
  const key = keyOf(3000);
  const first = createClockSession();
  adoptScene(first, s, key, 3000, false);
  stepClocks(first, s, 2500, false);
  const lifeBefore = s.life.clockMs;

  const forgetful = createClockSession(); // what a variable local to the effect amounts to
  assert.equal(adoptScene(forgetful, s, key, 3000, false), 'restarted');
  near(forgetful.clockMs, 3000, 'the host clock went back to the start time');
  near(s.life.clockMs, lifeBefore + 3000, 'and life was advanced a second time');
  assert.ok(Math.abs(forgetful.clockMs - s.life.clockMs) > 1000, 'so the two clocks split');
});

test('the clocks stay equal across a switch even when the clip starts late (t = 17 s)', () => {
  const s = scene({ buildMs: 0 });
  const session = createClockSession();
  const key = keyOf(17_000, { buildMs: 0 });
  adoptScene(session, s, key, 17_000, false);
  stepClocks(session, s, 1000, false);
  adoptScene(session, s, key, 17_000, false); // switch
  near(session.clockMs, 18_000);
  near(s.life.clockMs, 18_000, 'life was not advanced by another 17 s');
});

test('a different clip key restarts both clocks at its own start time', () => {
  const first = scene();
  const second = scene({ seed: 7 });
  const session = createClockSession();
  adoptScene(session, first, keyOf(3000), 3000, false);
  stepClocks(session, first, 4000, false);
  assert.equal(adoptScene(session, second, keyOf(1500, { seed: 7 }), 1500, false), 'restarted');
  near(session.clockMs, 1500);
  near(second.life.clockMs, 1500);
  assert.equal(session.scene, second);
});

test('the same clip with a new scene object carries the host clock on and advances the new life to it once', () => {
  const first = scene();
  const second = scene();
  const session = createClockSession();
  const key = keyOf(3000);
  adoptScene(session, first, key, 3000, false);
  stepClocks(session, first, 2000, false);
  assert.equal(adoptScene(session, second, key, 3000, false), 'continued');
  near(session.clockMs, 5000);
  near(second.life.clockMs, 5000);
  assert.equal(adoptScene(session, second, key, 3000, false), 'same');
  near(second.life.clockMs, 5000);
});

test('a paused frame (a zero step) and a negative step move nothing', () => {
  const s = scene();
  const session = createClockSession();
  adoptScene(session, s, keyOf(2000), 2000, false);
  const before = snapshot(session, s);
  stepClocks(session, s, 0, false);
  stepClocks(session, s, -50, false);
  stepClocks(session, s, Number.NaN, false);
  assert.deepEqual(snapshot(session, s), before);
});

test('without a scene the host clock still advances, so the clip time is not lost while a build error shows', () => {
  const session = createClockSession();
  stepClocks(session, null, 400, false);
  near(session.clockMs, 400);
});
