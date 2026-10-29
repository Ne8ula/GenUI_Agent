import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as playback from '../src/crime-scene/playback.ts';
import * as investigation from '../src/crime-scene/investigation.ts';

// Exercise the real component's renderer effect without allocating a browser/WebGL context.
for (const original of [false, true]) test(`renderer applies current presentation before loading (original=${original})`, () => {
  const calls: unknown[][] = [], effects: (() => unknown)[] = [];
  const view = {
    setPresentation: (...values: unknown[]) => calls.push(['presentation', ...values]),
    setScanned: (tags: number[]) => calls.push(['scanned', tags]),
    setBeacon: (tag: number | null) => calls.push(['beacon', tag]),
    setReview: (review: unknown) => calls.push(['review', review]),
    setScenario: (scenario: unknown) => calls.push(['scenario', scenario]),
    load: () => { calls.push(['load']); return new Promise(() => {}); },
    snapshot: () => undefined,
    dispose: () => calls.push(['dispose']),
  };
  // State is seeded as if tags arrived after controls were changed during loading, with an EVA reconstruction already loaded.
  const review = {segments: {}, models: {}, coverage_threshold: 1};
  const scenario = {title: 'Hypothesis', hypothetical: true, actors: [], steps: [{t: 0, actor: null, pose: 'stand', position: [0, 0], facing: 0, object_moves: [], caption: 'Start'}]};
  const marker = {id: 'm18', tag: 18}, states = [{evidence: [], markers: [marker]}, '', 0, 0, true, 'loading', '', 0, 18, false, null, new Set(), original, [13], 0, null, null, '', null, null, false, review, {scenario, t: 0, playing: false}, false];
  let state = 0, ref = 0;
  const react = {
    useState: () => [states[state++], () => {}],
    useRef: (value: unknown) => ({current: ref++ < 2 ? {} : value}),
    useEffect: (effect: () => unknown) => effects.push(effect),
    useReducer: () => [0, () => {}],
  };
  const exports: {CrimeSceneApp?: () => unknown} = {};
  const source = readFileSync(new URL('../src/crime-scene/CrimeSceneApp.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(code, {exports, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return {jsx: () => null, jsxs: () => null};
    if (name === './renderer.ts') return {createSceneRenderer: () => view};
    if (name === './state.ts') return {FFS: ''};
    if (name === './models.ts') return {NO_REVIEW: review, loadReview: () => Promise.resolve(review), hologramLabel: () => null};
    if (name === './card.ts') return {createCard: () => () => {}};
    if (name === './firstperson.ts') return {captureTimeline: () => [{tag: 18, time: '13:35:52'}]};
    if (name === './playback.ts') return playback;
    if (name === './investigation.ts') return investigation;
    if (name === './api.ts' || name === './Notebook.tsx' || name === './AskEva.tsx' || name.endsWith('.css')) return {};
    throw Error(`Unexpected import ${name}`);
  }});
  exports.CrimeSceneApp!();
  assert.equal(state, states.length, 'Update the hook fixture if component state changes');
  const cleanup = effects[1]!() as () => void;
  assert.deepEqual(calls, [['presentation', original], ['scanned', [13]], ['beacon', 18], ['review', review], ['scenario', scenario], ['load']]);
  cleanup();
  assert.deepEqual(calls.at(-1), ['dispose']);
});
