import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { POSES, frameAt, steppedFrame } from './playback.ts';
import type { Frame, Pose, Scenario } from './playback.ts';
// Hologram figures for EVA's hypothetical reconstruction: generic mannequins labelled A/B/C, never a person's name or likeness.
export type Figures = ReturnType<typeof createFigures>;
type Position3 = [number, number, number];
type ObjectState = Scenario['steps'][number]['object_moves'][number]['state'];
export type Landing = { tag: number; t: number; state: ObjectState; position: Position3 | null };
// Renderer playback state. Only 'time' touches t (walking and scanning have no action here); stop hides playback until the next time or scenario.
export type PlaybackState = { scenario: Scenario | null; t: number; stopped: boolean };
export type PlaybackAction = { type: 'scenario'; scenario: Scenario | null } | { type: 'time'; t: number } | { type: 'stop' };
export const PLAYBACK_IDLE: PlaybackState = { scenario: null, t: 0, stopped: false };
export function playbackReduce(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'scenario': return { ...state, scenario: action.scenario, stopped: action.scenario ? false : state.stopped };
    case 'time': return { ...state, t: Number.isFinite(action.t) ? action.t : 0, stopped: false };
    case 'stop': return { ...state, stopped: true };
  }
}
// Reduced motion shows the latest step's exact state whatever time the bar sends, and nothing before the first step, as normal motion does.
export function frameFor(s: Scenario, t: number, reduced: boolean): Frame {
  const frame = frameAt(s, t);
  if (!reduced) return frame;
  return frame.step < 0 ? { step: -1, actors: [], objects: [] } : steppedFrame(s, frame.step);
}
// Representative clip phases also anchor entry transitions and static reduced-motion poses.
export const POSE_CLIPS: Record<Pose, { clip: string; at: number }> = {
  stand: { clip: 'Idle_Loop', at: 0 },
  walk: { clip: 'Walk_Loop', at: .25 },
  reach: { clip: 'PickUp_Table', at: .5 },
  push: { clip: 'Push_Loop', at: .5 },
  strike: { clip: 'Punch_Cross', at: .5 },
  fall: { clip: 'Death01', at: .5 },
  crouch: { clip: 'Crouch_Idle_Loop', at: 0 },
  lie: { clip: 'Death01', at: 1 },
};
// Weapon clips would depict weapons the scenario never asserted.
export const WEAPON_CLIPS = /^(Pistol|Sword|Spell)_/;
export function poseClips(clips: { name: string }[]): Record<Pose, THREE.AnimationClip> | null {
  const found = {} as Record<Pose, THREE.AnimationClip>;
  for (const pose of POSES) {
    const clip = clips.find(candidate => candidate.name === POSE_CLIPS[pose].clip);
    if (!(clip instanceof THREE.AnimationClip) || WEAPON_CLIPS.test(clip.name)) return null;
    found[pose] = clip;
  }
  return found;
}
// The glTF mannequin is y-up and faces +Z; the scene is z-up with yaw 0 along +X.
export function figureRotation(facing: number): [number, number, number, 'ZYX'] {
  return [Math.PI / 2, 0, facing + Math.PI / 2, 'ZYX'];
}
// Rigid transform of a ghost relative to its measured pose: nothing for current, the owner-authored rotation about the hologram centre for upright,
// and for displaced the centre moved over [x, y] with the measured bottom (base) brought to z, the resting height.
export function ghostMatrix(state: 'upright' | 'current' | 'displaced', position: Position3 | null, centre: THREE.Vector3, upright: Position3 | undefined, base: number) {
  const m = new THREE.Matrix4();
  if (state === 'upright' && upright) m.makeTranslation(centre).multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...upright))).multiply(new THREE.Matrix4().makeTranslation(centre.clone().negate()));
  else if (state === 'displaced' && position) m.makeTranslation(position[0] - centre.x, position[1] - centre.y, position[2] - base);
  return m;
}
// An upright state is shown whenever the owner recorded a rotation, whatever the model decision (that gates only the generated mesh); otherwise it is the measured pose.
export function ghostState(state: ObjectState, upright: Position3 | undefined): ObjectState {
  return state === 'upright' && !upright ? 'current' : state;
}
// Blend two rigid ghost transforms about the hologram centre, so a rotating ghost pivots in place instead of swinging off-centre.
export function ghostBlend(from: THREE.Matrix4, to: THREE.Matrix4, blend: number, centre: THREE.Vector3, out = new THREE.Matrix4()) {
  const ca = centre.clone().applyMatrix4(from), cb = centre.clone().applyMatrix4(to);
  const qa = new THREE.Quaternion().setFromRotationMatrix(from), qb = new THREE.Quaternion().setFromRotationMatrix(to);
  return out.compose(ca.lerp(cb, blend), qa.slerp(qb, blend), new THREE.Vector3(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(centre.clone().negate()));
}
// Times at which an object completes a change of state or displaced position (duplicate tags in a step resolve to the last entry, as in frameAt).
export function landings(s: Scenario): Landing[] {
  const current = new Map<number, string>(), out: Landing[] = [];
  for (const step of [...s.steps].sort((a, b) => a.t - b.t)) {
    for (const [tag, move] of new Map(step.object_moves.map(move => [move.tag, move]))) {
      const position = move.state === 'displaced' ? move.position : null, key = position ? `displaced:${position.join()}` : move.state;
      if ((current.get(tag) ?? 'current') !== key) out.push({ tag, t: step.t, state: move.state, position });
      current.set(tag, key);
    }
  }
  return out;
}
function letter(id: string) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(5,12,28,.85)'; ctx.beginPath(); ctx.roundRect(4, 4, 56, 56, 10); ctx.fill();
    ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#dff3ff'; ctx.font = '600 36px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(id, 32, 34);
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}
// Cloned rigs share geometry; all clip times derive from playback, never a second clock.
export function createFigures(scene: THREE.Scene, asset: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, material: () => THREE.Material) {
  const found = poseClips(asset.animations);
  if (!found) throw Error('The figure asset lacks the pose clips.');
  const clips = found;
  type Actor = { group: THREE.Group; mixer: THREE.AnimationMixer; actions: Record<Pose, THREE.AnimationAction>; holo: THREE.Material; label: THREE.Sprite; head: THREE.Object3D | undefined };
  const actors = new Map<string, Actor>(), v = new THREE.Vector3();
  function actor(id: string): Actor {
    const existing = actors.get(id); if (existing) return existing;
    const group = new THREE.Group(), body = clone(asset.scene), holo = material(), head = body.getObjectByName('DEF-head');
    // Posed bodies leave the bind-pose bounds, so never frustum-cull them.
    body.traverse(node => { if (node instanceof THREE.Mesh) { node.material = holo; node.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(body), actions = {} as Record<Pose, THREE.AnimationAction>;
    for (const pose of POSES) {
      const clip = clips[pose].clone(); clip.name = pose; // two poses may sample the same clip at different times
      const action = mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true;
      action.play(); action.paused = true; action.setEffectiveWeight(0);
      actions[pose] = action;
    }
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: letter(id), transparent: true, depthTest: false }));
    label.scale.setScalar(.16); label.position.set(0, 2.02, 0); // y-up local: just above the head
    group.add(body, label); scene.add(group);
    const made = { group, mixer, actions, holo, label, head }; actors.set(id, made); return made;
  }
  return {
    apply(frame: Frame) {
      for (const a of actors.values()) a.group.visible = false;
      for (const { id, pose, next, blend, elapsed, remaining, position, facing } of frame.actors) {
        const a = actor(id); a.group.visible = true;
        a.group.position.set(position[0], position[1], 0); a.group.rotation.set(...figureRotation(facing));
        for (const p of POSES) {
          const action = a.actions[p], length = clips[p].duration, anchor = POSE_CLIPS[p].at * length;
          const loop = POSE_CLIPS[p].clip.endsWith('_Loop');
          let time = anchor;
          if (elapsed !== null && p !== 'lie') {
            if (loop) time = ((anchor + (p === pose ? elapsed : -remaining)) % length + length) % length;
            else if (p === pose) time = p === 'fall' ? Math.min(length, anchor + elapsed) : anchor;
            else time = anchor * blend;
          }
          action.time = time;
          action.setEffectiveWeight(p === pose ? (next === pose ? 1 : 1 - blend) : p === next ? blend : 0);
        }
        a.mixer.update(0);
        // The tag follows the posed head (lower for fall and lie), 25 cm above it.
        if (a.head) { a.group.updateMatrixWorld(true); a.label.position.copy(a.group.worldToLocal(a.head.getWorldPosition(v))).y += .25; }
      }
    },
    clear() { for (const a of actors.values()) a.group.visible = false; },
    dispose() {
      for (const a of actors.values()) {
        scene.remove(a.group); a.mixer.stopAllAction(); a.holo.dispose(); a.label.material.map?.dispose(); a.label.material.dispose();
        a.group.traverse(node => { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); });
      }
      actors.clear();
    },
  };
}
