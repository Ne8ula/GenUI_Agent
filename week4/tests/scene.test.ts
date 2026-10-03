import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REQUIRED_STABLE_IDS, VARIANT_IDS } from '../core/ids.ts';
import { MAX_UNDO, checkScene, initialPresentation, parseScene, presentationVariant, reducePresentation } from '../core/scene.ts';
import type { Presentation, SceneDefinition } from '../core/scene.ts';
import { parseJson, validateValue } from '../core/validate.ts';

const sceneText = readFileSync(new URL('../fixtures/scenes/paris-1980s-terrace.json', import.meta.url), 'utf8');
const clone = (): any => JSON.parse(sceneText);

function scene(): SceneDefinition {
  const r = parseScene(sceneText);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  return r.value;
}

test('fixture scene validates and contains every required stable ID', () => {
  const s = scene();
  const ids = new Set([...s.anchors.map((a) => a.id), ...s.objects.map((o) => o.id)]);
  for (const id of REQUIRED_STABLE_IDS) assert.ok(ids.has(id), id);
  assert.deepEqual([...s.states].sort(), [...VARIANT_IDS].sort());
});

test('scene rejects unknown and authority-bearing fields at every level', () => {
  const cases: [string, (v: any) => void][] = [
    ['top-level script', (v) => (v.script = 'alert(1)')],
    ['wallpaper path', (v) => (v.wallpaperPath = 'C:/Users/x/a.jpg')],
    ['object url', (v) => (v.objects[0].url = 'https://example.com/a.png')],
    ['window handle', (v) => (v.anchors[0].hwnd = 1234)],
    ['permission on default state', (v) => (v.defaultState.permission = 'granted')],
  ];
  for (const [name, mutate] of cases) {
    const v = clone();
    mutate(v);
    assert.equal(checkScene(v).ok, false, name);
  }
});

test('scene rejects invalid enums, malformed IDs and broken references', () => {
  const cases: [string, (v: any) => void][] = [
    ['weather enum', (v) => (v.defaultState.weather = 'snow')],
    ['band enum', (v) => (v.objects[0].band = 'sky')],
    ['ID with path', (v) => (v.objects[0].id = 'obj:../../etc')],
    ['ID uppercase', (v) => (v.objects[0].id = 'obj:Table')],
    ['ID too long', (v) => (v.objects[0].id = `obj:${'a'.repeat(80)}`)],
    ['missing anchor reference', (v) => (v.objects[0].anchor = 'anchor:nowhere')],
    ['duplicate object', (v) => v.objects.push({ ...v.objects[0] })],
    ['missing required cup', (v) => (v.objects = v.objects.filter((o: any) => o.id !== 'obj:cup'))],
    ['occludes unknown', (v) => (v.objects[0].occludes = ['obj:ghost'])],
    ['non-finite-ish huge coordinate', (v) => (v.anchors[0].position = [0, 0, 1e9])],
    ['negative size', (v) => (v.objects[0].size = [0.1, -1, 0.1])],
    ['notice with URL', (v) => (v.interpretationNotice = 'see http://x.example')],
    ['notice with markup', (v) => (v.interpretationNotice = '<img src=x>')],
    ['depth order broken', (v) => (v.anchors.find((a: any) => a.id === 'anchor:far').position = [0, 0, -1])],
  ];
  for (const [name, mutate] of cases) {
    const v = clone();
    mutate(v);
    assert.equal(checkScene(v).ok, false, name);
  }
});

test('oversized and malformed scene input is rejected before parsing', () => {
  const big = JSON.stringify({ ...clone(), pad: 'x'.repeat(70 * 1024) });
  const r = parseScene(big);
  assert.equal(r.ok, false);
  assert.match((!r.ok && r.errors[0]) || '', /limit/);
  assert.equal(parseScene('{"schemaVersion":1,').ok, false);
});

test('rain, evening, combined and undo preserve every object ID and anchor', () => {
  const s = scene();
  let p: Presentation = initialPresentation(s);
  const ids = [...p.objectIds];
  const steps = [
    { kind: 'set_weather', weather: 'rain' },
    { kind: 'set_light', light: 'evening' },
    { kind: 'undo' },
    { kind: 'set_weather', weather: 'clear' },
    { kind: 'set_light', light: 'evening' },
    { kind: 'undo' },
    { kind: 'undo' },
  ] as const;
  const seen: string[] = [];
  for (const cmd of steps) {
    p = reducePresentation(p, cmd).state;
    assert.deepEqual([...p.objectIds], ids);
    seen.push(presentationVariant(p));
  }
  assert.deepEqual(seen, ['afternoon-rain', 'evening-rain', 'afternoon-rain', 'afternoon-clear', 'evening-clear', 'afternoon-clear', 'afternoon-rain']);
  // The scene definition (geometry anchors) is untouched by presentation changes.
  assert.deepEqual(s, scene());
});

test('no-op requests and empty undo do not change the revision', () => {
  const p0 = initialPresentation(scene());
  const same = reducePresentation(p0, { kind: 'set_weather', weather: 'clear' });
  assert.equal(same.outcome, 'already_so');
  assert.equal(same.state, p0);
  const none = reducePresentation(p0, { kind: 'undo' });
  assert.equal(none.outcome, 'nothing_to_undo');
  assert.equal(none.state.revision, 0);
});

test('undo stack is bounded', () => {
  let p = initialPresentation(scene());
  for (let i = 0; i < 40; i++) p = reducePresentation(p, { kind: 'set_weather', weather: i % 2 === 0 ? 'rain' : 'clear' }).state;
  assert.equal(p.undo.length, MAX_UNDO);
});

test('presentation carries no consent, lease, permission or freshness fields', () => {
  const p = initialPresentation(scene());
  assert.deepEqual(Object.keys(p).sort(), ['look', 'objectIds', 'revision', 'sceneId', 'undo']);
});

test('stage IPC accepts only the closed operations', () => {
  const ok = [
    { op: 'prepare', sceneId: 'scene:paris-1980s-terrace' },
    { op: 'enter', variantId: 'afternoon-clear' },
    { op: 'setFarField', variantId: 'evening-rain' },
    { op: 'restore', mode: 'emergency' },
  ];
  for (const v of ok) assert.ok(validateValue('stage-request', v).ok, JSON.stringify(v));
  const bad = [
    { op: 'enter', variantId: 'afternoon-clear', hwnd: 66012 },
    { op: 'setFarField', variantId: 'evening-rain', path: 'C:/Windows/Web/a.jpg' },
    { op: 'setFarField', imageBytes: 'iVBORw0' },
    { op: 'speak', text: 'hello' },
    { op: 'enter', variantId: 'tokyo-night' },
    { op: 'restore', mode: 'graceful', windows: [1, 2] },
    { op: 'prepare', sceneId: 'scene:tokyo' },
    { op: 'exec', command: 'rm -rf /' },
  ];
  for (const v of bad) assert.equal(validateValue('stage-request', v).ok, false, JSON.stringify(v));
  assert.equal(parseJson('stage-request', JSON.stringify({ op: 'restore', mode: 'graceful', pad: 'x'.repeat(600) })).ok, false);
});

test('transcript events are bounded and reject extra fields', () => {
  assert.ok(validateValue('transcript-event', { sessionId: 'w4s-2', utteranceSeq: 3, text: 'Can it rain?' }).ok);
  assert.equal(validateValue('transcript-event', { sessionId: 'w4s-2', utteranceSeq: 3, text: 'x'.repeat(401) }).ok, false);
  assert.equal(validateValue('transcript-event', { sessionId: 'w4s-2', utteranceSeq: 3, text: 'hi', audio: 'UklGR' }).ok, false);
  assert.equal(validateValue('transcript-event', { sessionId: 'session/../2', utteranceSeq: 3, text: 'hi' }).ok, false);
  assert.equal(validateValue('transcript-event', { sessionId: 'w4s-2', utteranceSeq: -1, text: 'hi' }).ok, false);
});

test('shared IPC fixture (also parsed by the Rust broker) agrees with the schema', () => {
  const shared = JSON.parse(readFileSync(new URL('../fixtures/ipc/stage-requests.json', import.meta.url), 'utf8'));
  for (const v of shared.valid) assert.ok(validateValue('stage-request', v).ok, JSON.stringify(v));
  for (const v of shared.invalid) assert.equal(validateValue('stage-request', v).ok, false, JSON.stringify(v));
});
