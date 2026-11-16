import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { registerHooks } from 'node:module';
import { Box3, Mesh, MeshStandardMaterial, Vector3, type WebGLRenderer } from 'three';
import { createProceduralRoom } from '../src/room/procedural-room.ts';
import { paintCamera } from '../src/room/room-paint.ts';
import { caseFixture } from './fixtures/room-case-fixture.ts';
import type { sampleSurfacePointCloud } from '../src/astral/surface-sampler.ts';

// Replace only this module's build/sampling boundaries; route clients and validators remain real.
const generationURL = new URL('../src/astral/room-generation.ts', import.meta.url).href;
const buildKey = Symbol.for('astral-generation-test-build');
const sampleKey = Symbol.for('astral-generation-test-sample');
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL === generationURL) {
    const entry = specifier === './surface-sampler.ts' ? ['sampleSurfacePointCloud', 'astral-generation-test-sample']
      : specifier === '../room/procedural-room.ts' ? ['createProceduralRoom', 'astral-generation-test-build'] : null;
    if (entry) return { url: `data:text/javascript,${encodeURIComponent(`export const ${entry[0]} = (...args) => globalThis[Symbol.for('${entry[1]}')](...args);`)}`, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { generateRoomCloud } = await import('../src/astral/room-generation.ts');
hooks.deregister();
const globals = globalThis as unknown as Record<symbol, unknown>;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const roomDescription = { version: 1, width: 6, depth: 6, height: 3.4,
  doorway: { placement: 'center', width: 1.2, height: 2.3 }, colors: { wall: 'cream', floor: 'walnut' }, furnishings: [{ kind: 'chair', color: 'teal' }] };
const interpretation = () => ({ version: 2, outcome: 'supported', reply: 'I imagine a teal chair in a cream room.', unsupported: [], description: roomDescription, case: caseFixture() });

type Call = { url: string; init: RequestInit };
function setup(t: TestContext, respond?: (call: Call) => Response | Promise<Response> | undefined) {
  const abort = new AbortController();
  const calls: Call[] = [], events: string[] = [];
  const disposals = new Map<object, number>();
  let built: ReturnType<typeof createProceduralRoom> | undefined;
  const originalColors = new Map<MeshStandardMaterial, number>();
  const track = (resource: { addEventListener(type: 'dispose', listener: () => void): void }) => {
    if (disposals.has(resource)) return;
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource)! + 1));
  };
  const trackScene = () => built!.scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    track(object.geometry);
    for (const material of [object.material].flat()) track(material);
  });
  globals[buildKey] = (...args: Parameters<typeof createProceduralRoom>) => {
    events.push('build');
    built = createProceduralRoom(...args);
    trackScene();
    built.scene.traverse(object => { if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) originalColors.set(object.material, object.material.color.getHex()); });
    return built;
  };
  globals[sampleKey] = (async (scene, bounds, signal) => {
    events.push('points');
    assert.equal(signal, abort.signal);
    assert.equal(scene, built!.scene);
    assert.deepEqual(bounds, new Box3(new Vector3(-3, 0, -3), new Vector3(3, 3.4, 3)));
    trackScene();
    for (const [material, color] of originalColors) assert.equal(material.color.getHex(), color, 'full base colour is preserved');
    const panels = scene.children.filter(child => child.name === 'astral-ceiling-panel');
    assert.equal(panels.length, 9);
    for (const panel of panels) {
      assert.ok(panel instanceof Mesh && panel.material instanceof MeshStandardMaterial);
      assert.equal(panel.userData.astralEmitter, true);
      assert.notEqual(panel.material.emissive.getHex(), 0);
      assert.ok(Math.abs(new Box3().setFromObject(panel).max.y - 3.4) < 1e-7);
    }
    const shade = scene.getObjectByName('astral-lamp-shade')!;
    const lamp = new Box3().setFromObject(shade);
    const furniture = new Box3().setFromObject(scene.getObjectByName('furnishings')!);
    assert.equal(lamp.intersectsBox(furniture), false);
    assert.ok(lamp.min.z > 2 && lamp.max.z < 3);
    assert.ok(Math.abs(shade.position.x - built!.layout.doorwayX) > roomDescription.doorway.width / 2 + 0.3);
    return { count: 1, positions: new Float32Array([0, 0, 0]), normals: new Float32Array([0, 1, 0]), colors: new Float32Array([0.5, 0.5, 0.5]), spacing: 0.01, ordered: true };
  }) satisfies typeof sampleSurfacePointCloud;
  const renderer = null as unknown as WebGLRenderer;
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init }; calls.push(call);
    assert.equal(init.signal, abort.signal);
    assert.equal(init.redirect, 'error');
    const response = await respond?.(call);
    if (response) return response;
    if (call.url === '/api/compose-room') { events.push('interpretation'); return json(interpretation()); }
    assert.fail(`Unexpected fake route ${call.url}; paint must never be requested`);
  });
  t.after(() => { delete globals[buildKey]; delete globals[sampleKey]; });
  return { abort, calls, events, renderer, disposals, trackScene, get built() { return built; },
    run: (text = 'a quiet interior with a teal chair') => generateRoomCloud(text, renderer, abort.signal) };
}

test('interpret -> procedural room -> fittings -> unlit surfaces; no paint calls, all resources released', async t => {
  const s = setup(t);
  const cloud = await s.run();
  assert.deepEqual(s.events, ['interpretation', 'build', 'points']);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(cloud.arrival?.position, [0, 1.7, 2.5]);
  const direction = new Vector3(...cloud.arrival!.lookAt).sub(new Vector3(...cloud.arrival!.position)).normalize();
  assert.ok(direction.distanceTo(paintCamera().getWorldDirection(new Vector3())) < 1e-12);
  assert.equal(cloud.lights?.ceiling.length, 9);
  assert.deepEqual(cloud.lights?.lamps, [[-2.55, 1.65, 2.6]]);
  assert.equal(cloud.spacing, 0.01);
  assert.equal(cloud.ordered, true);
  assert.deepEqual(cloud.normals, new Float32Array([0, 1, 0]));
  assert.equal(s.built!.scene.children.length, 0);
  assert.ok(s.disposals.size > 20);
  for (const count of s.disposals.values()) assert.equal(count, 1);
});

test('pre-abort and invalid input send nothing', async t => {
  const s = setup(t);
  for (const text of [' ', 'x'.repeat(2001)]) await assert.rejects(s.run(text), /interpretation: invalid_input/);
  s.abort.abort('owner stop');
  await assert.rejects(s.run(), /interpretation: aborted/);
  assert.equal(s.calls.length, 0);
});

test('interpretation rejection or malformed response never builds; no retries', async t => {
  for (const code of ['disabled', 'missing_key', 'budget_exhausted', 'invalid_response', 'unsupported_capability']) {
    await t.test(code, async t => {
      const s = setup(t, () => code === 'invalid_response' ? json({})
        : code === 'unsupported_capability' ? json({ version: 2, outcome: 'unsupported', reply: 'That is outside my vocabulary.', unsupported: ['Pools'], description: null, case: null })
        : json({ error: code }, 503));
      await assert.rejects(s.run(), new RegExp(`interpretation: ${code}`));
      assert.equal(s.calls.length, 1);
      assert.equal(s.built, undefined);
    });
  }
});

test('abort while interpretation is pending settles even if fake transport ignores it', async t => {
  const s = setup(t, () => {
    queueMicrotask(() => s.abort.abort());
    return new Promise<Response>(() => {});
  });
  await assert.rejects(s.run(), /interpretation: aborted/);
  assert.equal(s.built, undefined);
});

test('build failure is wrapped without further requests', async t => {
  const s = setup(t);
  globals[buildKey] = () => { throw new Error('synthetic build failure'); };
  await assert.rejects(s.run(), /build: build_failed/);
  assert.equal(s.calls.length, 1);
});

test('point failures, empty clouds and aborts release fittings and scene', async t => {
  for (const code of ['points_failed', 'empty_cloud', 'aborted']) await t.test(code, async t => {
    const s = setup(t);
    globals[sampleKey] = async () => {
      s.trackScene();
      if (code === 'points_failed') throw new Error('synthetic CPU failure');
      if (code === 'aborted') s.abort.abort();
      return { count: 0, positions: new Float32Array(), colors: new Float32Array() };
    };
    await assert.rejects(s.run(), new RegExp(`points: ${code}`));
    assert.equal(s.built!.scene.children.length, 0);
    for (const count of s.disposals.values()) assert.equal(count, 1);
  });
});

test('cleanup failure still attempts the remaining releases', async t => {
  const s = setup(t);
  globals[sampleKey] = async () => {
    s.trackScene();
    const shade = s.built!.scene.getObjectByName('astral-lamp-shade') as Mesh;
    shade.geometry.addEventListener('dispose', () => { throw new Error('synthetic disposal failure'); });
    return { count: 1 };
  };
  await assert.rejects(s.run(), /cleanup: cleanup_failed/);
  assert.equal(s.built!.scene.children.length, 0);
  for (const count of s.disposals.values()) assert.equal(count, 1);
});
