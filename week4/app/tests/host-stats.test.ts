import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhase, createRingBuffer, formatBuildState, formatLiveState, formatStatus, percentile, summarize } from '../src/host/frameStats.ts';
import type { StatusInput } from '../src/host/frameStats.ts';

const close = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `expected ${expected}, got ${actual}`);

test('percentile interpolates linearly between ranks', () => {
  close(percentile([1, 2, 3, 4, 5], 50), 3);
  close(percentile([1, 2, 3, 4], 50), 2.5);
  close(percentile([1, 2, 3, 4, 5], 95), 4.8);
  close(percentile([10, 20], 0), 10);
  close(percentile([10, 20], 100), 20);
  close(percentile([7], 95), 7);
  close(percentile([5, 1, 4, 2, 3], 50), 3, 1e-9); // order of input does not matter
  close(percentile([1, 2, 3], -10), 1, 1e-9); // p clamps into 0..100
  close(percentile([1, 2, 3], 250), 3, 1e-9);
  assert.ok(Number.isNaN(percentile([], 50)));
});

test('percentile does not mutate its input', () => {
  const input = [3, 1, 2];
  percentile(input, 95);
  assert.deepEqual(input, [3, 1, 2]);
});

test('summarize reports count, median, p95 and max', () => {
  assert.equal(summarize([]), null);
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  const s = summarize(values);
  assert.ok(s);
  assert.equal(s.count, 100);
  close(s.median, 50.5);
  close(s.p95, 95.05);
  assert.equal(s.max, 100);
});

test('ring buffer keeps the last N samples oldest to newest', () => {
  const ring = createRingBuffer(3);
  assert.deepEqual(ring.values(), []);
  ring.push(1);
  ring.push(2);
  assert.deepEqual(ring.values(), [1, 2]);
  assert.equal(ring.size, 2);
  ring.push(3);
  ring.push(4);
  ring.push(5);
  assert.deepEqual(ring.values(), [3, 4, 5]);
  assert.equal(ring.size, 3);
  assert.equal(ring.capacity, 3);
  ring.clear();
  assert.deepEqual(ring.values(), []);
  ring.push(9);
  assert.deepEqual(ring.values(), [9]);
});

test('ring buffer ignores non-finite samples and rejects a bad capacity', () => {
  const ring = createRingBuffer(4);
  ring.push(Number.NaN);
  ring.push(Number.POSITIVE_INFINITY);
  ring.push(2);
  assert.deepEqual(ring.values(), [2]);
  assert.throws(() => createRingBuffer(0), RangeError);
  assert.throws(() => createRingBuffer(2.5), RangeError);
});

test('a 120-sample window summarises only the most recent 120 intervals', () => {
  const ring = createRingBuffer(120);
  for (let i = 0; i < 500; i++) ring.push(i < 380 ? 1000 : 16.7); // old slow frames fall out of the window
  const s = summarize(ring.values());
  assert.ok(s);
  assert.equal(s.count, 120);
  close(s.median, 16.7);
  close(s.max, 16.7);
});

const running: StatusInput = {
  backend: 'webgl2',
  detail: 'ANGLE (SwiftShader)',
  degraded: false,
  particles: 123456,
  frame: { count: 120, median: 16.66, p95: 21.04, max: 30 },
  drawMs: 4.24,
  unavailable: null,
};

test('status line reads as plain words and numbers', () => {
  assert.equal(
    formatStatus(running),
    'Backend: WebGL2 · ANGLE (SwiftShader) · particles 123,456 · frame 16.7 ms median / 21.0 ms p95 (last 120) · draw 4.2 ms · Head tracking: off (not in this step)',
  );
});

test('status line names a degraded renderer in words', () => {
  const text = formatStatus({ ...running, backend: 'canvas2d', degraded: true, detail: 'WebGL2 context lost; using Canvas2D' });
  assert.ok(text.startsWith('Renderer degraded: WebGL2 context lost; using Canvas2D · Backend: Canvas2D'));
  assert.ok(!text.includes('ANGLE'));
});

test('status line covers starting, warming up and unavailable states', () => {
  assert.equal(
    formatStatus({ ...running, backend: null, detail: null, frame: null, drawMs: null, particles: 0 }),
    'Backend: starting · Head tracking: off (not in this step)',
  );
  assert.ok(formatStatus({ ...running, frame: null, drawMs: null }).includes('frame timing: collecting · draw: n/a'));
  assert.equal(
    formatStatus({ ...running, backend: null, unavailable: 'WebGL2 is not available' }),
    'Rendering unavailable: WebGL2 is not available · Head tracking: off (not in this step)',
  );
});

test('formatLiveState announces only backend, degradation and unavailability', async () => {
  const { formatLiveState } = await import('../src/host/frameStats.ts');
  assert.equal(formatLiveState({ backend: null, detail: null, degraded: false, unavailable: null }), 'Backend: starting');
  assert.equal(formatLiveState({ backend: 'webgl2', detail: 'ANGLE', degraded: false, unavailable: null }), 'Backend: WebGL2');
  assert.equal(formatLiveState({ backend: 'canvas2d', detail: 'lost', degraded: true, unavailable: null }), 'Renderer degraded: lost');
  assert.equal(formatLiveState({ backend: 'canvas2d', detail: null, degraded: false, unavailable: 'no context' }), 'Rendering unavailable: no context');
});

test('build state reads "constructing 4.2 s of 12 s" while building and "complete" afterwards', () => {
  assert.equal(formatBuildState({ timeMs: 4200, durationMs: 12_000 }), 'constructing 4.2 s of 12 s');
  assert.equal(formatBuildState({ timeMs: 0, durationMs: 12_000 }), 'constructing 0.0 s of 12 s');
  assert.equal(formatBuildState({ timeMs: 11_949, durationMs: 12_000 }), 'constructing 11.9 s of 12 s');
  assert.equal(formatBuildState({ timeMs: 12_000, durationMs: 12_000 }), 'complete');
  assert.equal(formatBuildState({ timeMs: 17_000, durationMs: 12_000 }), 'complete');
  assert.equal(formatBuildState({ timeMs: 0, durationMs: 0 }), 'complete', 'no build means complete from the first frame');
  assert.equal(formatBuildState({ timeMs: 1000, durationMs: 2500 }), 'constructing 1.0 s of 2.5 s');
  assert.equal(buildPhase({ timeMs: 1, durationMs: 12_000 }), 'constructing');
  assert.equal(buildPhase({ timeMs: 12_000, durationMs: 12_000 }), 'complete');
  assert.equal(buildPhase({ timeMs: 0, durationMs: 0 }), 'complete');
});

test('status line carries tiles, build state and the clock, in words', () => {
  assert.equal(
    formatStatus({ ...running, tiles: { shown: 21, authored: 21 }, build: { timeMs: 4200, durationMs: 12_000, paused: false } }),
    'Backend: WebGL2 · ANGLE (SwiftShader) · particles 123,456 · tiles 21 · Build: constructing 4.2 s of 12 s · clock 4.2 s · frame 16.7 ms median / 21.0 ms p95 (last 120) · draw 4.2 ms · Head tracking: off (not in this step)',
  );
  const done = formatStatus({ ...running, tiles: { shown: 21, authored: 21 }, build: { timeMs: 17_000, durationMs: 12_000, paused: true } });
  assert.ok(done.includes('· Build: complete · clock 17.0 s (paused) ·'), done);
});

test('status line says when tiles are hidden and does not call them hidden when there are none', () => {
  assert.ok(formatStatus({ ...running, tiles: { shown: 0, authored: 21 } }).includes('· tiles hidden (21 authored) ·'));
  assert.ok(formatStatus({ ...running, tiles: { shown: 0, authored: 0 } }).includes('· tiles 0 ·'));
  assert.ok(!formatStatus({ ...running, tiles: null, build: null }).includes('tiles'), 'no tile field, no tile words');
});

test('build and tile words are left out while starting or unavailable', () => {
  const starting = formatStatus({ ...running, backend: null, detail: null, frame: null, drawMs: null, particles: 0, tiles: { shown: 3, authored: 3 }, build: { timeMs: 0, durationMs: 12_000, paused: false } });
  assert.equal(starting, 'Backend: starting · Head tracking: off (not in this step)');
  const broken = formatStatus({ ...running, backend: null, unavailable: 'WebGL2 is not available', build: { timeMs: 0, durationMs: 12_000, paused: false } });
  assert.equal(broken, 'Rendering unavailable: WebGL2 is not available · Head tracking: off (not in this step)');
});

test('the live region announces only the two build phases, not the running clock', () => {
  const at = (timeMs: number) => ({ backend: 'webgl2' as const, detail: 'ANGLE', degraded: false, unavailable: null, build: { timeMs, durationMs: 12_000, paused: false } });
  assert.equal(formatLiveState(at(100)), 'Backend: WebGL2 · Build: constructing');
  assert.equal(formatLiveState(at(9000)), formatLiveState(at(100)), 'the text does not change while the build runs, so nothing is re-announced');
  assert.equal(formatLiveState(at(12_000)), 'Backend: WebGL2 · Build: complete');
  assert.equal(formatLiveState({ ...at(0), build: { timeMs: 0, durationMs: 0, paused: false } }), 'Backend: WebGL2', 'a scene without a build adds nothing');
  assert.equal(formatLiveState({ ...at(0), degraded: true, detail: 'lost' }), 'Renderer degraded: lost · Build: constructing');
  assert.equal(formatLiveState({ ...at(0), unavailable: 'no context' }), 'Rendering unavailable: no context');
});
