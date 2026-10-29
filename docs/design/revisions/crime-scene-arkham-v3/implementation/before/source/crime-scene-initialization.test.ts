import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Exercise the real component's renderer effect without allocating a browser/WebGL context.
for (const original of [false, true]) test(`renderer applies current presentation before loading (original=${original})`, () => {
  const calls: unknown[][] = [], effects: (() => unknown)[] = [];
  const view = {
    setCutaway: (value: boolean) => calls.push(['cutaway', value]),
    setPresentation: (...values: unknown[]) => calls.push(['presentation', ...values]),
    load: () => { calls.push(['load']); return new Promise(() => {}); },
    snapshot: () => undefined,
    dispose: () => calls.push(['dispose']),
  };
  // State is seeded as if tags arrived after controls were changed during loading.
  const marker = {id: 'm18', tag: 18}, states = [{evidence: [], markers: [marker]}, '', 0, 0, true, 'loading', '', 0, 18, false, null, new Set(), false, original, null, null, false];
  let state = 0, ref = 0;
  const react = {
    useState: () => [states[state++], () => {}],
    useRef: (value: unknown) => ({current: ref++ < 2 ? {} : value}),
    useEffect: (effect: () => unknown) => effects.push(effect),
  };
  const exports: {CrimeSceneApp?: () => unknown} = {};
  const source = readFileSync(new URL('../src/crime-scene/CrimeSceneApp.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  runInNewContext(code, {exports, require: (name: string) => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return {jsx: () => null, jsxs: () => null};
    if (name === './renderer.ts') return {createSceneRenderer: () => view};
    if (name === './state.ts') return {FFS: ''};
    if (name === './api.ts' || name === './Notebook.tsx' || name.endsWith('.css')) return {};
    throw Error(`Unexpected import ${name}`);
  }});
  exports.CrimeSceneApp!();
  assert.equal(state, states.length, 'Update the hook fixture if component state changes');
  const cleanup = effects[1]!() as () => void;
  assert.deepEqual(calls, [['cutaway', false], ['presentation', original, marker], ['load']]);
  cleanup();
  assert.deepEqual(calls.at(-1), ['dispose']);
});
