import test from 'node:test';
import assert from 'node:assert/strict';
import * as inspection from '../src/crime-scene/inspection.ts';

test('28-second single-room walkthrough opens one source and finishes normally', () => {
  let state = inspection.startInspection();
  assert.equal(state.mode, 'normal');
  state = inspection.tickInspection(state, 4, false);
  assert.equal(state.mode, 'scan'); assert.ok(state.sweep > 0 && state.sweep < 1);
  state = inspection.tickInspection(state, 3, false);
  assert.equal(state.mode, 'detective'); assert.equal(state.open, false);
  state = inspection.tickInspection(state, 5, false);
  assert.equal(state.selection, 18); assert.equal(state.open, true);
  state = inspection.tickInspection(state, 8, false);
  assert.equal(state.open, false); assert.equal(state.selection, 18);
  state = inspection.tickInspection(state, 8, false);
  assert.equal(state.seconds, 28); assert.equal(state.mode, 'normal'); assert.equal(state.running, false);
});

test('pause freezes scan and script; manual takeover never resumes an old timeline', () => {
  const scan = inspection.tickInspection(inspection.startInspection(), 7, false);
  const paused = { ...scan, paused: true };
  assert.deepEqual(inspection.tickInspection(paused, 20, false), paused);
  const manual = inspection.interruptInspection(scan);
  assert.equal(manual.running, false);
  assert.equal(inspection.tickInspection(manual, 30, false).seconds, 7);
  assert.deepEqual(inspection.startInspection(), inspection.startInspection());
  assert.equal(inspection.resetInspection().selection, null);
  assert.equal(inspection.resetInspection().started, false);
});

test('reduced motion has settled states and invalid deltas cannot advance playback', () => {
  const initial = inspection.startInspection();
  const reduced = inspection.tickInspection(initial, 7, true);
  assert.equal(reduced.mode, 'detective'); assert.equal(reduced.sweep, 1);
  for (const delta of [-1, NaN, Infinity]) assert.deepEqual(inspection.tickInspection(initial, delta, false), initial);
  assert.equal(inspection.tickInspection(initial, 1000, true).seconds, 28);
});

test('demo evidence is explicitly authored and links only existing source photos', () => {
  assert.deepEqual(inspection.INSPECTION_CLUES.map(clue => clue.tag), [18, 21, 32]);
  for (const clue of inspection.INSPECTION_CLUES) {
    assert.match(clue.photo, /^IMG_\d{8}_\d{6}\.jpg$/);
    assert.equal(clue.placement, 'authored-demo');
    assert.ok(clue.observed.length > 20); assert.ok(clue.unknown.length > 20);
    assert.equal('centroid' in clue, false);
  }
});
