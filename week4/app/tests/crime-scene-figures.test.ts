import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { POSES, frameAt, steppedFrame, type Scenario } from '../src/crime-scene/playback.ts';
import { PLAYBACK_IDLE, POSE_CLIPS, WEAPON_CLIPS, figureRotation, frameFor, ghostBlend, ghostMatrix, ghostState, landings, playbackReduce, poseClips, createFigures } from '../src/crime-scene/figures.ts';
import { parseReview } from '../src/crime-scene/models.ts';

// Clip names of the registered figures/human.glb (Quaternius Universal Animation Library, Godot export), read from its JSON chunk.
const ASSET_CLIPS = ['A_TPose', 'Crouch_Fwd_Loop', 'Crouch_Idle_Loop', 'Dance_Loop', 'Death01', 'Driving_Loop', 'Fixing_Kneeling', 'Hit_Chest', 'Hit_Head', 'Idle_Loop',
  'Idle_Talking_Loop', 'Idle_Torch_Loop', 'Interact', 'Jog_Fwd_Loop', 'Jump_Land', 'Jump_Loop', 'Jump_Start', 'PickUp_Table', 'Pistol_Aim_Down', 'Pistol_Aim_Neutral',
  'Pistol_Aim_Up', 'Pistol_Idle_Loop', 'Pistol_Reload', 'Pistol_Shoot', 'Punch_Cross', 'Punch_Enter', 'Punch_Jab', 'Push_Loop', 'Roll', 'Roll_RM', 'Sitting_Enter',
  'Sitting_Exit', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Spell_Simple_Enter', 'Spell_Simple_Exit', 'Spell_Simple_Idle_Loop', 'Spell_Simple_Shoot', 'Sprint_Loop',
  'Swim_Fwd_Loop', 'Swim_Idle_Loop', 'Sword_Attack', 'Sword_Attack_RM', 'Sword_Idle', 'Walk_Formal_Loop', 'Walk_Loop'];
const near = (actual: THREE.Vector3, expected: [number, number, number]) => assert.ok(actual.distanceTo(new THREE.Vector3(...expected)) < 1e-9, `${actual.toArray()} != ${expected}`);

test('every schema pose samples a clip the asset has, never a weapon clip', () => {
  const clips = ASSET_CLIPS.map(name => new THREE.AnimationClip(name, 1, []));
  const found = poseClips(clips);
  assert.ok(found);
  for (const pose of POSES) {
    assert.equal(found[pose].name, POSE_CLIPS[pose].clip);
    assert.doesNotMatch(found[pose].name, WEAPON_CLIPS);
    assert.ok(POSE_CLIPS[pose].at >= 0 && POSE_CLIPS[pose].at <= 1);
  }
  assert.match('Pistol_Shoot', WEAPON_CLIPS); assert.match('Sword_Attack', WEAPON_CLIPS); assert.match('Spell_Simple_Idle_Loop', WEAPON_CLIPS);
  assert.equal(poseClips(clips.filter(clip => clip.name !== 'Walk_Loop')), null);
  assert.equal(poseClips(clips.filter(clip => !WEAPON_CLIPS.test(clip.name))) !== null, true);
});

test('figures stand on the z-up floor facing the yaw', () => {
  for (const facing of [0, 1.2, -2.5, Math.PI]) {
    const euler = new THREE.Euler(...figureRotation(facing));
    // The glTF mannequin is y-up and faces +Z; yaw 0 is +X in the scene.
    near(new THREE.Vector3(0, 0, 1).applyEuler(euler), [Math.cos(facing), Math.sin(facing), 0]);
    near(new THREE.Vector3(0, 1, 0).applyEuler(euler), [0, 0, 1]);
  }
});

test('ghost matrices: identity for current, authored rotation about the centre for upright, base brought to the resting z for displaced', () => {
  const centre = new THREE.Vector3(1, 2, 0.5), base = 0.2;
  assert.deepEqual(ghostMatrix('current', null, centre, [1, 1, 1], base).toArray(), new THREE.Matrix4().toArray());
  const upright = ghostMatrix('upright', null, centre, [0, 0, Math.PI / 2], base);
  near(centre.clone().applyMatrix4(upright), [1, 2, 0.5]);
  near(new THREE.Vector3(2, 2, 0.5).applyMatrix4(upright), [1, 3, 0.5]);
  assert.deepEqual(ghostMatrix('upright', null, centre, undefined, base).toArray(), new THREE.Matrix4().toArray());
  // Displaced z is the resting height: the measured bottom lands on it, the centre over [x, y] keeps its height above the bottom.
  const displaced = ghostMatrix('displaced', [0, 0, 0], centre, undefined, base);
  near(new THREE.Vector3(1, 2, base).applyMatrix4(displaced), [0, 0, 0]);
  near(centre.clone().applyMatrix4(displaced), [0, 0, 0.3]);
  near(new THREE.Vector3(1, 2, base).applyMatrix4(ghostMatrix('displaced', [0.5, 0.5, 0.75], centre, undefined, base)), [0.5, 0.5, 0.75]);
  assert.deepEqual(ghostMatrix('displaced', null, centre, undefined, base).toArray(), new THREE.Matrix4().toArray());
});

test('an owner-recorded upright rotation is honoured whatever the model decision; without one, upright is the measured pose', () => {
  const review = parseReview('```json\n' + JSON.stringify({ segments: {}, models: { '18': { status: 'rejected', upright: [0, 0, 1] } }, coverage_threshold: 1 }) + '\n```');
  assert.equal(ghostState('upright', review.models[18]?.upright), 'upright');
  assert.equal(ghostState('upright', review.models[13]?.upright), 'current');
  assert.equal(ghostState('displaced', undefined), 'displaced');
  assert.equal(ghostState('current', [0, 0, 1]), 'current');
});

test('landings list each completed state or displacement change in time order', () => {
  const step = (t: number, moves: Scenario['steps'][number]['object_moves']): Scenario['steps'][number] => ({ t, actor: null, pose: 'stand', position: [0, 0], facing: 0, object_moves: moves, caption: '' });
  const s: Scenario = { title: '', hypothetical: true, actors: [], steps: [
    step(20, [{ tag: 69, state: 'displaced', position: [4, 5, 6] }, { tag: 17, state: 'upright', position: [0, 0, 0] }]),
    step(5, [{ tag: 69, state: 'current', position: [0, 0, 0] }]),
    step(10, [{ tag: 69, state: 'upright', position: [0, 0, 0] }, { tag: 69, state: 'displaced', position: [1, 1, 1] }]),
    step(30, [{ tag: 69, state: 'displaced', position: [7, 8, 9] }]),
    step(40, [{ tag: 69, state: 'displaced', position: [7, 8, 9] }, { tag: 17, state: 'upright', position: [3, 3, 3] }]),
  ] };
  assert.deepEqual(landings(s), [
    { tag: 69, t: 10, state: 'displaced', position: [1, 1, 1] }, { tag: 69, t: 20, state: 'displaced', position: [4, 5, 6] },
    { tag: 17, t: 20, state: 'upright', position: null }, { tag: 69, t: 30, state: 'displaced', position: [7, 8, 9] }]);
});

test('ghostBlend pivots about the centre: the centre moves along the segment between its two state positions', () => {
  const centre = new THREE.Vector3(1, 2, 0.5);
  const from = ghostMatrix('upright', null, centre, [0, 0, Math.PI / 2], 0.3); from.elements[14] += 0.2; // floor fix lifts the pivot
  const to = ghostMatrix('displaced', [3, 2, 0.3], centre, undefined, 0.3);
  const half = ghostBlend(from, to, 0.5, centre);
  near(centre.clone().applyMatrix4(half), [2, 2, 0.6]);
  const rotated = new THREE.Vector3(2, 2, 0.5).applyMatrix4(half).sub(centre.clone().applyMatrix4(half));
  near(rotated, [Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), 0]);
  assert.deepEqual(ghostBlend(from, to, 0, centre).toArray().map(x => Math.round(x * 1e9) / 1e9), from.toArray().map(x => Math.round(x * 1e9) / 1e9));
  assert.deepEqual(ghostBlend(from, to, 1, centre).toArray().map(x => Math.round(x * 1e9) / 1e9), to.toArray().map(x => Math.round(x * 1e9) / 1e9));
});

const scenario: Scenario = { title: '', hypothetical: true, actors: [{ id: 'A', label: 'Person A' }], steps: [
  { t: 2, actor: 'A', pose: 'stand', position: [0, 0], facing: 0, object_moves: [], caption: '' },
  { t: 6, actor: 'A', pose: 'push', position: [4, 0], facing: 1, object_moves: [{ tag: 69, state: 'upright', position: [0, 0, 0] }], caption: '' },
] };

test('frameFor: reduced motion never interpolates and shows nothing before the first step', () => {
  assert.deepEqual(frameFor(scenario, 4, false), frameAt(scenario, 4));
  assert.equal(frameAt(scenario, 4).actors[0]!.blend, 0.5);
  assert.deepEqual(frameFor(scenario, 4, true), steppedFrame(scenario, 0));
  assert.equal(frameFor(scenario, 4, true).actors[0]!.blend, 1);
  assert.deepEqual(frameFor(scenario, 4, true).actors[0]!.position, [0, 0]);
  assert.deepEqual(frameFor(scenario, 9, true), steppedFrame(scenario, 1));
  assert.deepEqual(frameFor(scenario, 1, true), { step: -1, actors: [], objects: [] });
  assert.deepEqual(frameFor(scenario, 1, false).actors, []);
});

test('rig sampling advances, seeks exactly, holds at the end and stays static in reduced motion', () => {
  // Only canvas text drawing needs a browser; the actual Three mixer, tracks and clones run here.
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => null }) } });
  const scene = new THREE.Scene(), body = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'joint'; body.add(bone);
  const animations = ASSET_CLIPS.map(name => new THREE.AnimationClip(name, 3, [new THREE.VectorKeyframeTrack('joint.position', [0, 1.5, 3], [0, 0, 0, 1.5, 0, 0, 0, 0, 0])]));
  const figures = createFigures(scene, { scene: body, animations }, () => new THREE.MeshBasicMaterial());
  const s: Scenario = { ...scenario, steps: [0, 2, 4].map(t => ({ ...scenario.steps[0]!, t })) };
  const sample = (t: number, reduced = false) => { figures.apply(frameFor(s, t, reduced)); return scene.getObjectByName('joint')!.position.x; };
  try {
    assert.ok(Math.abs(sample(.25) - .25) < 1e-9);
    assert.ok(Math.abs(sample(.75) - .75) < 1e-9);
    assert.equal(sample(.75), sample(.75)); // repeated draws at paused time
    assert.ok(Math.abs(sample(.25) - .25) < 1e-9); // backward seek, not integrated delta time
    assert.ok(Math.abs(sample(2.25) - .75) < 1e-9); // same-pose keyframes do not reset the loop
    assert.equal(sample(50), sample(4));
    assert.equal(sample(.25, true), 0); assert.equal(sample(.75, true), 0);
    assert.equal(sample(2.25, true), 0);
  } finally {
    figures.dispose();
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('entering loops animate continuously and one-shot gestures hold their labelled pose', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => null }) } });
  const scene = new THREE.Scene(), body = new THREE.Group(), bone = new THREE.Bone(); bone.name = 'joint'; body.add(bone);
  const animations = ASSET_CLIPS.map(name => new THREE.AnimationClip(name, 3, [new THREE.VectorKeyframeTrack('joint.position', [0, 1.5, 3],
    name === 'Idle_Loop' ? [0, 0, 0, 0, 0, 0, 0, 0, 0] : name === 'Death01' ? [0, 0, 0, 1.5, 0, 0, 3, 0, 0] : [0, 0, 0, 1.5, 0, 0, 0, 0, 0])]));
  const figures = createFigures(scene, { scene: body, animations }, () => new THREE.MeshBasicMaterial());
  const s: Scenario = { ...scenario, steps: [
    { ...scenario.steps[0]!, t: 0 },
    { ...scenario.steps[0]!, t: 2, pose: 'walk' },
    { ...scenario.steps[0]!, t: 6, actor: null },
  ] };
  const sample = (t: number, reduced = false) => { figures.apply(frameFor(s, t, reduced)); return scene.getObjectByName('joint')!.position.x; };
  try {
    const entering = sample(1.5);
    s.steps[1]!.pose = 'reach'; const held = sample(3);
    s.steps[1]!.pose = 'walk';
    assert.deepEqual([entering, held], [.2109375, 1.5]); // walk phase .25 s, weight .84375; reach stays at its anchor
    assert.ok(Math.abs(sample(2 - 1e-6) - sample(2)) < 2e-6);
    assert.ok(Math.abs(sample(2 + 1e-6) - sample(2)) < 2e-6);
    assert.ok(Number.isFinite(sample(.1))); // incoming phase wraps negative time
    for (const pose of ['reach', 'strike'] as const) {
      s.steps[1]!.pose = pose;
      assert.ok(Math.abs(sample(3) - 1.5) < 1e-9);
      assert.ok(Math.abs(sample(5) - 1.5) < 1e-9);
      assert.ok(Math.abs(sample(3, true) - 1.5) < 1e-9);
      assert.ok(Math.abs(sample(2 - 1e-6) - sample(2)) < 2e-6);
    }
    s.steps[1]!.pose = 'fall'; assert.ok(Math.abs(sample(3) - 2.5) < 1e-9); assert.equal(sample(5), 3);
    s.steps[1]!.pose = 'lie'; assert.equal(sample(2), 3); assert.equal(sample(5), 3);
    assert.equal(sample(3, true), 3);
  } finally {
    figures.dispose();
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('playback state: stop is sticky until the next time or scenario, and only time changes t', () => {
  let state = playbackReduce(PLAYBACK_IDLE, { type: 'scenario', scenario });
  state = playbackReduce(state, { type: 'time', t: 3 });
  state = playbackReduce(state, { type: 'stop' });
  assert.equal(state.stopped, true); assert.equal(state.t, 3);
  assert.equal(playbackReduce(state, { type: 'scenario', scenario }).stopped, false);
  assert.equal(playbackReduce(state, { type: 'scenario', scenario: null }).stopped, true);
  assert.equal(playbackReduce(state, { type: 'scenario', scenario: null }).t, 3);
  const resumed = playbackReduce(state, { type: 'time', t: 4 });
  assert.deepEqual(resumed, { scenario, t: 4, stopped: false });
  assert.equal(playbackReduce(state, { type: 'time', t: NaN }).t, 0);
  // Invariant: the renderer dispatches 'time' only from setPlayback, so walking (keys/step) and scanning can never reset t.
  const lines = readFileSync(new URL('../src/crime-scene/renderer.ts', import.meta.url), 'utf8').split('\n').filter(line => line.includes("type: 'time'"));
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /^\s*setPlayback\(t: number\)/);
});
