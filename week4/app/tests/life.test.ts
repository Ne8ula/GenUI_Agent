import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ARRIVAL, buildArrivalScene, rigsOf } from '../src/scene/arrival.ts';
import { createLife, stepLife, walkerPose } from '../src/scene/life.ts';

const snapshotStatic = (frame: ReturnType<typeof buildArrivalScene>) => {
  const s = frame.store;
  const out: number[] = [];
  for (const r of frame.regions) {
    if (r.dynamic) continue;
    for (let k = r.start; k < r.end; k += 97) out.push(s.x[k] ?? 0, s.y[k] ?? 0, s.a[k] ?? 0, s.size[k] ?? 0);
  }
  return out;
};

test('life rewrites only dynamic slots and never changes counts or static particles', () => {
  const frame = buildArrivalScene(DEFAULT_ARRIVAL);
  const before = snapshotStatic(frame);
  const count = frame.store.count;
  const regions = JSON.stringify(frame.regions);
  const life = createLife(frame);
  for (let i = 0; i < 600; i++) stepLife(life, frame, 16.7, { reducedMotion: false });
  assert.equal(frame.store.count, count);
  assert.equal(JSON.stringify(frame.regions), regions);
  assert.deepEqual(snapshotStatic(frame), before);
  const s = frame.store;
  for (const r of frame.regions.filter((r) => r.dynamic)) {
    for (let k = r.start; k < r.end; k++) {
      for (const key of ['x', 'y', 'a', 'size'] as const) assert.ok(Number.isFinite(s[key][k] ?? NaN), `${r.id} ${key} ${k}`);
      assert.ok((s.a[k] ?? -1) >= 0 && (s.a[k] ?? 2) <= 1);
    }
  }
});

test('steam and smoke rise from their emitters and are visible after the first second', () => {
  const frame = buildArrivalScene(DEFAULT_ARRIVAL);
  const life = createLife(frame);
  for (let i = 0; i < 60; i++) stepLife(life, frame, 16.7, { reducedMotion: false });
  const rigs = rigsOf(frame);
  assert.ok(rigs);
  for (const e of rigs.emitters) {
    let visible = 0, above = 0;
    for (let k = e.start; k < e.end; k++) {
      if ((frame.store.a[k] ?? 0) > 0.05) visible++;
      if ((frame.store.y[k] ?? 1) < e.origin[1]) above++;
    }
    assert.ok(visible > (e.end - e.start) * 0.4, `${e.id} visible ${visible}`);
    assert.equal(above, e.end - e.start, `${e.id} must rise`);
  }
});

test('walkers stroll slowly along the lane, scale with distance, and respawn without changing slots', () => {
  const frame = buildArrivalScene(DEFAULT_ARRIVAL);
  const rigs = rigsOf(frame);
  assert.ok(rigs);
  const woman = rigs.walkers.find((r) => r.id === 'actors:passersby/woman');
  assert.ok(woman);
  const p0 = walkerPose(woman, 0, false);
  const p10 = walkerPose(woman, 10, false);
  assert.ok(Math.abs(p0.feetY - woman.homeFeet[1]) < 0.01, 'starts at the authored P1 position');
  assert.ok(p0.fade > 0.95, 'visible at the start');
  assert.equal(p0.stride, 1, 'arrival rigs have no intro: always striding');
  assert.ok(p10.feetY < p0.feetY, 'walks away (recedes) by default');
  assert.ok(p10.height < p0.height, 'gets smaller as it recedes');
  assert.ok(Math.abs(p10.feetY - p0.feetY) < 0.06, 'strolls slowly: under 6% of the frame in 10 s');
  // Somewhere in the cycle the walker is fully faded, then returns.
  let faded = false, returned = false;
  for (let t = 0; t < 80; t += 0.25) {
    const f = walkerPose(woman, t, false).fade;
    if (f === 0) faded = true;
    if (faded && f > 0.9) returned = true;
  }
  assert.ok(faded && returned);
  // Reduced motion: the walker clock advances at REDUCED_WALK_RATE, so 10 s of wall time drifts less.
  const a = buildArrivalScene(DEFAULT_ARRIVAL), la = createLife(a);
  const b = buildArrivalScene(DEFAULT_ARRIVAL), lb = createLife(b);
  for (let i = 0; i < 600; i++) { stepLife(la, a, 16.7, { reducedMotion: false }); stepLife(lb, b, 16.7, { reducedMotion: true }); }
  assert.ok(Math.abs(la.walkMs - 10_020) < 1 && Math.abs(lb.walkMs - 10_020 * 0.35) < 1, 'walker clocks advance at the expected rates');
  // Toggling reduced motion never jumps: the pose after a toggle continues from the same walker time.
  const before = walkerPose(woman, lb.walkMs / 1000, true);
  stepLife(lb, b, 16.7, { reducedMotion: false });
  const after = walkerPose(woman, lb.walkMs / 1000, false);
  assert.ok(Math.abs(after.feetY - before.feetY) < 0.001, 'no jump on toggle');
});

test('toward facing approaches the viewer', () => {
  const frame = buildArrivalScene({ ...DEFAULT_ARRIVAL, nearWalkerFacing: 'toward' });
  const woman = rigsOf(frame)?.walkers.find((r) => r.id === 'actors:passersby/woman');
  assert.ok(woman);
  assert.ok(walkerPose(woman, 8, false).feetY > walkerPose(woman, 0, false).feetY);
});

test('advanceLife splits long frames so life keeps wall-clock pace', async () => {
  const { advanceLife, MAX_LIFE_STEP_MS } = await import('../src/scene/life.ts');
  const frame = buildArrivalScene(DEFAULT_ARRIVAL);
  const life = createLife(frame);
  advanceLife(life, frame, 180, { reducedMotion: false });
  assert.equal(life.clockMs, 180, 'a 180 ms frame advances life by 180 ms');
  assert.ok(MAX_LIFE_STEP_MS <= 50);
  const single = createLife(frame);
  stepLife(single, frame, 180, { reducedMotion: false });
  assert.equal(single.clockMs, 100, 'a single step is still capped at 100 ms');
});
