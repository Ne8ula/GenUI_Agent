import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARRIVAL_FULL, ARRIVAL_REDUCED, RETURN_GRACEFUL, SKIP_CROSSFADE_MS, checkTimeline, cuesBetween, gainAt, phaseAt, skipPlan } from '../core/timeline.ts';
import type { Cue, Timeline } from '../core/timeline.ts';

const all = [ARRIVAL_FULL, ARRIVAL_REDUCED, RETURN_GRACEFUL];

test('timelines are contiguous, sorted and internally consistent', () => {
  for (const t of all) assert.deepEqual(checkTimeline(t), [], t.id);
});

test('default arrival has seven phases totalling 60 seconds', () => {
  assert.equal(ARRIVAL_FULL.durationMs, 60_000);
  assert.deepEqual(ARRIVAL_FULL.phases.map((p) => p.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  assert.equal(ARRIVAL_FULL.phases.reduce((n, p) => n + (p.endMs - p.startMs), 0), 60_000);
});

test('something new is perceptible at least every 12 s (pacing guard on authored cues)', () => {
  const times = [...new Set(ARRIVAL_FULL.cues.map((c) => c.atMs)), ARRIVAL_FULL.durationMs].sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++) assert.ok((times[i] ?? 0) - (times[i - 1] ?? 0) <= 12_000);
});

test('wallpaper is set under the opaque veil in phase D, after windows move in B', () => {
  const at = (id: string) => ARRIVAL_FULL.cues.find((c) => c.id === id)?.atMs ?? -1;
  assert.equal(phaseAt(ARRIVAL_FULL, at('stage.enter')).id, 'B');
  assert.equal(phaseAt(ARRIVAL_FULL, at('stage.setFarField')).id, 'D');
  assert.ok(at('picture:paper-veil-opaque') <= at('stage.setFarField'));
  assert.ok(at('stage.setFarField') < at('picture:veil-transparent-far-field'));
});

test('head-coupling gain ramps 0 to 1 monotonically and stays in range', () => {
  let prev = -1;
  for (let ms = 0; ms <= 60_000; ms += 250) {
    const g = gainAt(ARRIVAL_FULL, ms);
    assert.ok(g >= 0 && g <= 1);
    assert.ok(g >= prev - 1e-12);
    prev = g;
  }
  assert.equal(gainAt(ARRIVAL_FULL, 0), 0);
  assert.equal(gainAt(ARRIVAL_FULL, 12_000), 0);
  assert.equal(gainAt(ARRIVAL_FULL, 22_000), 0.25);
  assert.equal(gainAt(ARRIVAL_FULL, 60_000), 1);
  assert.equal(gainAt(ARRIVAL_FULL, -10), 0);
  assert.equal(gainAt(ARRIVAL_FULL, 1e9), 1);
});

test('reduced motion is ~15 s, keeps parallax off unless opted in, and keeps required staging', () => {
  assert.equal(ARRIVAL_REDUCED.durationMs, 15_000);
  for (let ms = 0; ms <= 15_000; ms += 500) assert.equal(gainAt(ARRIVAL_REDUCED, ms), 0);
  assert.equal(gainAt(ARRIVAL_REDUCED, 15_000, { reducedMotionParallax: true }), 1);
  const req = (t: Timeline) => t.cues.filter((c) => c.required).map((c) => c.id).sort();
  assert.deepEqual(req(ARRIVAL_REDUCED), req(ARRIVAL_FULL));
});

test('cuesBetween emits each cue exactly once across arbitrary tick sizes', () => {
  for (const step of [16, 333, 1000, 7000, 60_000]) {
    const got: string[] = [];
    let prev = -1;
    for (let ms = 0; prev < ARRIVAL_FULL.durationMs; ms += step) {
      const to = Math.min(ms, ARRIVAL_FULL.durationMs);
      got.push(...cuesBetween(ARRIVAL_FULL, prev, to).map((c) => c.id));
      prev = to;
    }
    assert.deepEqual(got, ARRIVAL_FULL.cues.map((c) => c.id), `step ${step}`);
  }
  assert.deepEqual(cuesBetween(ARRIVAL_FULL, 5000, 5000), []);
  assert.deepEqual(cuesBetween(ARRIVAL_FULL, 9000, 1000), []);
});

test('skip from every phase reaches the same end state without dropping required staging', () => {
  const endState = (emitted: Cue[]) => emitted.filter((c) => c.required || c.arrival).map((c) => c.id).sort();
  const full = endState(ARRIVAL_FULL.cues.slice());
  for (const p of ARRIVAL_FULL.phases) {
    const before = cuesBetween(ARRIVAL_FULL, -1, p.startMs + 1);
    const plan = skipPlan(ARRIVAL_FULL, new Set(before.map((c) => c.id)));
    assert.equal(plan.crossfadeMs, SKIP_CROSSFADE_MS);
    const emitted = [...before, ...plan.required, ...plan.arrival];
    assert.deepEqual(endState(emitted), full, `skip in ${p.id}`);
    // No required cue is emitted twice.
    const ids = emitted.filter((c) => c.required).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    // Required cues keep authored order.
    const order = plan.required.map((c) => c.atMs);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
  }
});

test('graceful return is ~5 s and ends with a restore request; it differs from emergency', () => {
  assert.equal(RETURN_GRACEFUL.durationMs, 5000);
  const last = RETURN_GRACEFUL.cues.at(-1);
  assert.equal(last?.id, 'stage.restore.graceful');
  assert.equal(last?.atMs, 5000);
  assert.ok(!RETURN_GRACEFUL.cues.some((c) => c.id.includes('emergency')));
});

test('no cue or phase presents progress or loading', () => {
  for (const t of all) {
    for (const s of [...t.cues.map((c) => c.id), ...t.phases.map((p) => p.name)]) assert.doesNotMatch(s, /load|progress|percent/i);
  }
});
