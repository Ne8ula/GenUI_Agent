import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import type { PanoramaRenderer } from '../src/crime-scene/panorama.ts';
import * as inspection from '../src/crime-scene/inspection.ts';
import * as matrixStyle from '../src/room/matrix-style.ts';

test('cancel and reopen replace the canvas identity instead of reusing a lost context', () => {
  const states: unknown[] = [];
  let cursor = 0;
  type Element = { type: string; props: Record<string, any>; key?: unknown };
  let elements: Element[] = [];
  const jsx = (type: string, props: Element['props'], key?: unknown) => {
    const element = { type, props, key }; elements.push(element); return element;
  };
  const exports: { PanoramaApp?: (props: unknown) => unknown } = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/crime-scene/PanoramaApp.tsx', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'react') return {
      useRef: (value: unknown) => ({ current: value }), useEffect: () => {},
      useState: (initial: unknown) => {
        const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], (next: unknown) => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
      },
    };
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === './panorama.ts') return { PANORAMA: { sha256: 'x' } };
    if (name === './state.ts') return { FFS: '' };
    if (name === './inspection.ts') return inspection;
    if (name === './api.ts' || name === './CrimeSceneApp.tsx' || name.endsWith('.css')) return {};
    throw new Error(name);
  }});
  const render = () => { cursor = 0; elements = []; exports.PanoramaApp!({ saved: { current: undefined }, onEvidence: () => {} }); };
  render();
  const first = elements.find(element => element.type === 'canvas')!.key;
  elements.find(element => element.type === 'button' && element.props.children === 'Cancel loading')!.props.onClick();
  render();
  assert.equal(elements.find(element => element.type === 'main')!.props['data-phase'], 'cancelled');
  elements.find(element => element.type === 'button' && element.props.children === 'Reopen room')!.props.onClick();
  render();
  assert.notEqual(elements.find(element => element.type === 'canvas')!.key, first, 'Reopen must mount a fresh canvas');
});

test('panorama unmount saves camera and cancels the renderer without committing late ready state', async () => {
  const path = new URL('../src/crime-scene/PanoramaApp.tsx', import.meta.url);
  assert.ok(existsSync(path), 'Panorama component is not implemented');
  const effects: (() => unknown)[] = [], states: unknown[] = [], calls: string[] = [];
  let finish: () => void = () => {}, started: () => void = () => {};
  const loading = new Promise<void>(resolve => { started = resolve; });
  const camera = { position: [1, 2, 3], target: [0, 0, 0] }, saved = { current: undefined as unknown };
  const view = { load: () => { started(); return new Promise<void>(resolve => { finish = resolve; }); }, pause: () => {}, snapshot: () => camera, dispose: () => calls.push('dispose') };
  const exports: { PanoramaApp?: (props: unknown) => unknown } = {};
  let refs = 0;
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, AbortController, require: (name: string) => {
    if (name === 'react') return {
      useRef: (value: unknown) => ({ current: refs++ === 0 ? {} : value }),
      useState: (value: unknown) => [typeof value === 'function' ? value() : value, (next: unknown) => states.push(next)],
      useEffect: (effect: () => unknown) => effects.push(effect),
    };
    if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    if (name === './panorama.ts') return { createPanoramaRenderer: () => view, PANORAMA: { sha256: 'x' } };
    if (name === './api.ts') return { sceneRequest: async () => ({ csrf: 'fixture' }) };
    if (name === './state.ts') return { FFS: '' };
    if (name === './inspection.ts') return inspection;
    if (name === './CrimeSceneApp.tsx' || name.endsWith('.css')) return {};
    throw new Error(name);
  }});
  exports.PanoramaApp!({ saved, onEvidence: () => {} });
  const cleanup = effects[0]!() as () => void;
  await loading;
  assert.ok(!states.includes('error'), JSON.stringify(states));
  cleanup();
  finish(); await Promise.resolve(); await Promise.resolve();
  assert.equal(saved.current, camera);
  assert.deepEqual(calls, ['dispose']);
  assert.ok(!states.includes('ready'), 'Unmounted load must not commit ready state');
});

test('renderer remount restores a non-home position and look target after loading', async () => {
  // Keep camera, controls and load/reset/restore real; replace GPU drawing and asset I/O only.
  let drawnCamera: THREE.PerspectiveCamera | undefined;
  class WebGLRenderer {
    setPixelRatio() {} getPixelRatio() { return 1; } setSize() {} dispose() {}
    render(_scene: THREE.Scene, camera: THREE.PerspectiveCamera) { drawnCamera = camera; }
  }
  class GLTFLoader {
    async parseAsync() {
      const scene = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), new THREE.MeshStandardMaterial({ map })));
      }
      return { scene };
    }
  }
  class Canvas extends EventTarget {
    getBoundingClientRect() { return { width: 800, height: 600 }; }
  }
  const exports: { createPanoramaRenderer?: typeof import('../src/crime-scene/panorama.ts').createPanoramaRenderer } = {};
  const code = ts.transpileModule(readFileSync(new URL('../src/crime-scene/panorama.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    exports, AbortController, window: { devicePixelRatio: 1 },
    ResizeObserver: class { observe() {} disconnect() {} },
    require: (name: string) => {
      if (name === 'three') return { ...THREE, WebGLRenderer };
      if (name === 'three/addons/loaders/GLTFLoader.js') return { GLTFLoader };
      if (name === '../room/matrix-style.ts') return matrixStyle;
      if (name === '../room/verified-mesh.ts') return { verifiedMesh: async () => new ArrayBuffer(0) };
      if (name === './state.ts') return { FFS: '/fixture/' };
      throw new Error(name);
    },
  });
  const create = (saved?: ReturnType<PanoramaRenderer['snapshot']>) => exports.createPanoramaRenderer!(
    new Canvas() as unknown as HTMLCanvasElement, message => assert.fail(message), saved);
  const first = create();
  let restored: PanoramaRenderer | undefined;
  try {
    await first.load(() => {});
    const home = structuredClone(first.snapshot());
    assert.deepEqual(home, { position: [0, 0, 0], target: [Math.cos(5.64), -.5, Math.sin(5.64)] });
    assert.equal(drawnCamera!.fov, 70, 'Opening view includes more room context');
    first.turn(1); first.move(1);
    const saved = structuredClone(first.snapshot())!;
    assert.notDeepEqual(saved.position, home!.position);
    assert.notDeepEqual(saved.target, home!.target);
    first.dispose();
    restored = create(saved);
    await restored.load(() => {});
    assert.deepEqual(structuredClone(restored.snapshot()), saved, 'Remount must restore both non-home pose vectors');
    assert.deepEqual(drawnCamera!.position.toArray(), saved.position);
    const direction = new THREE.Vector3().fromArray(saved.target).sub(new THREE.Vector3().fromArray(saved.position)).normalize();
    assert.ok(drawnCamera!.getWorldDirection(new THREE.Vector3()).distanceTo(direction) < 1e-10, 'Restored pose must update camera orientation');
    restored.reset();
    assert.deepEqual(structuredClone(restored.snapshot()), home, 'Reset still returns home after restoration');
  } finally { restored?.dispose(); first.dispose(); }
});
