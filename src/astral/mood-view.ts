// The void's choice as it is drawn (owner, 2026-11-17): one body of grains in front of the viewer that takes the selected mood's
// form (mood-choice.ts has the forms). Stepping to another mood throws the grains and gathers them into its form. Each form moves
// in its own way: the quiet one breathes, the uncanny one wrings itself, the eerie one loses grains that drift off and come back.
// Three ticks under the body say which of the three it is. No words.
// The motions are cut down from the field's effects (point-field.ts), which are adapted from Gather 聚 by DAO (be-of-dao.com),
// used under the Patreon Source licence: breathe, weightless, and the kick's throw and gather. The one-body-many-forms staging
// follows the owner's reference, bricelab.dev.
import {
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, GLSL3, Group, LineBasicMaterial, LineSegments, OneFactor,
  OneMinusSrcColorFactor, Points, ShaderMaterial, Vector2, Vector3, type PerspectiveCamera,
} from 'three';
import { MOODS } from './grammar.ts';
import { MOOD_CASTS, moodForm } from './mood-choice.ts';

const DEPTH = 2;          // metres in front of the viewer
const SIZE = 1.15;        // the body's width, in halves of the frame's height
const RAISED = 0.06;      // its middle above the frame's, in halves of the frame's height
const GATHER = 0.45;      // seconds per e-fold: going from one form to another
const EASE = 0.5;         // seconds per e-fold: the body appearing, and dispersing when a mood is picked
const TICKS_Y = -0.72, TICK = 0.035, TICK_GAP = 0.11;   // the three ticks, in halves of the frame's height from the body's middle

export interface MoodView {
  /** Add to the scene. */
  readonly object: Group;
  /** Once per frame, after the camera has moved. `selected`: which mood the body shows, or null when no choice is offered. */
  update(selected: number | null, time: number, dt: number, camera: PerspectiveCamera): void;
  dispose(): void;
}

const VS = /* glsl */ `
uniform float uTime, uPresence, uPx; uniform vec3 uW; uniform vec3 uCast[3];
in vec3 aP1, aP2, aN1, aN2; out vec3 vCol;
uint hashu(uint x) { x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16; return x; }
float h01(uint x) { return float(hashu(x) >> 8) * 5.9604645e-8; }
vec3 flow(vec3 q, float t) {
  return 0.5 * vec3(sin(q.y * 2.3 + t) + sin(q.z * 3.1 - t * 0.7 + q.x), sin(q.x * 2.7 - t * 0.8) + sin(q.z * 2.9 + t * 0.6 + q.y), sin(q.x * 3.3 + t * 0.5) + sin(q.y * 3.7 - t));
}
vec3 turnY(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(c * d.x + s * d.z, d.y, c * d.z - s * d.x); }
void main() {
  uint id = uint(gl_VertexID);
  float r1 = h01(id * 7u + 5u), r2 = h01(id * 13u + 3u), r3 = h01(id * 19u + 11u), T = uTime;
  vec3 rv = vec3(r1, r2, r3) * 2.0 - 1.0;
  // each grain crosses from form to form at its own moment
  vec3 w = pow(max(uW, vec3(1e-4)), vec3(mix(0.6, 3.5, r1))); w /= w.x + w.y + w.z;
  vec3 p = position * w.x + aP1 * w.y + aP2 * w.z;
  vec3 n = normalize(normal * w.x + aN1 * w.y + aN2 * w.z + 1e-5);
  float between = 1.0 - max(w.x, max(w.y, w.z)), alive = 1.0;

  // quiet breathes: it swells and sinks in slow uneven lobes
  p *= 1.0 + w.x * 0.06 * sin(T * 0.7) * (0.65 + 0.35 * flow(p * 1.5, T * 0.3).x);
  // uncanny wrings itself: each height turns its own way round the upright axis, slowly, and comes back
  float wring = w.y * 0.6 * sin(T * 0.33 + p.y * 2.6);
  p = turnY(p, wring); n = turnY(n, wring);
  // eerie is weightless: whole regions lift and drift, and some grains leave the surface, thin out and form again
  vec3 f = flow(p * 1.4, 1.7);
  p.y += w.z * 0.07 * (0.5 + 0.5 * f.x) * (0.5 + 0.5 * sin(T * (0.17 + 0.2 * r2) + r3 * 6.28));
  p += flow(p * 0.9 + f * 0.5, T * 0.11) * w.z * 0.04;
  float gone = fract(r2 + T * 0.045) * step(r3, 0.3) * w.z;
  p += (n + rv * 0.35) * gone * 0.4; alive *= 1.0 - gone;
  // the kick: between forms, and as the body arrives or disperses, the grains are thrown and hang as a cloud
  float thrown = between * 1.5 + (1.0 - uPresence) * 1.2;
  p += (normalize(rv + 1e-4) * (0.25 + 0.3 * r2) + flow(p * 2.0 + r2 * 3.0, T * 0.9) * 0.22) * thrown;
  p += flow(p * 2.0 + r2 * 3.0, T * 0.12) * 0.003;   // held grains barely stir

  // the body turns slowly, tipped a little toward the viewer
  p = turnY(p, T * 0.22); n = turnY(n, T * 0.22);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 nv = normalize(normalMatrix * n), v = normalize(-mv.xyz);
  float facing = dot(nv, v), lit = max(dot(nv, normalize(vec3(-0.45, 0.7, 0.55))), 0.0);
  vec3 tint = uCast[0] * w.x + uCast[1] * w.y + uCast[2] * w.z;
  // glass, as grains: the mood's cast where the light falls, and a spectrum that runs with the angle of view toward the edges
  vec3 spectrum = 0.5 + 0.5 * cos(6.2832 * (facing * 1.1 + dot(p, vec3(0.5, 0.35, 0.2)) + vec3(0.0, 0.33, 0.67)));
  vec3 c = tint * (0.28 + 0.72 * lit);
  c = mix(c, spectrum * (0.35 + 0.65 * lit), 0.12 + 0.5 * pow(1.0 - abs(facing), 2.0));
  c *= facing < 0.0 ? 0.16 : 1.0;                       // the far side shows through, dimly
  vCol = min(c, vec3(0.85)) * alive * uPresence * mix(1.0, 0.55, clamp(thrown, 0.0, 1.0));
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, floor(uPx * (0.75 + 0.6 * r3) + 0.5));   // whole pixels: crisp square grains, not all one size
}`;
const FS = /* glsl */ `precision highp float; in vec3 vCol; out vec4 o; void main() { o = vec4(vCol, 1.0); }`;

export function createMoodView(): MoodView {
  // the group carries the camera's own frame, so the body is placed in view space: x right, y up, the viewer looking down -z
  const object = new Group();
  object.matrixAutoUpdate = false; object.visible = false;
  const forms = MOODS.map(moodForm), geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(forms[0]!.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(forms[0]!.normals, 3));
  for (const i of [1, 2]) {
    geometry.setAttribute(`aP${i}`, new BufferAttribute(forms[i]!.positions, 3));
    geometry.setAttribute(`aN${i}`, new BufferAttribute(forms[i]!.normals, 3));
  }
  const weights = new Vector3(1, 0, 0), buffer = new Vector2(1, 1440);
  const material = new ShaderMaterial({
    glslVersion: GLSL3, vertexShader: VS, fragmentShader: FS,
    uniforms: { uTime: { value: 0 }, uPresence: { value: 0 }, uPx: { value: 2 }, uW: { value: weights }, uCast: { value: MOODS.map(mood => new Vector3(...MOOD_CASTS[mood])) } },
    // light on light, over whatever is behind, like the field's grains and the menu's
    transparent: true, depthTest: false, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcColorFactor,
  });
  const body = new Points(geometry, material);
  body.frustumCulled = false; body.renderOrder = 8;
  body.onBeforeRender = renderer => { renderer.getDrawingBufferSize(buffer); };
  // three ticks under the body: the selected one is white, the others dim
  const tickAt = new Float32Array(18), tickLight = new Float32Array(18);
  for (let i = 0; i < 3; i++) tickAt.set([(i - 1) * TICK_GAP - TICK, 0, 0, (i - 1) * TICK_GAP + TICK, 0, 0], i * 6);
  const ticks = new LineSegments(new BufferGeometry().setAttribute('position', new BufferAttribute(tickAt, 3)).setAttribute('color', new BufferAttribute(tickLight, 3)),
    new LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: false, depthWrite: false }));
  ticks.frustumCulled = false; ticks.renderOrder = 8;
  object.add(body, ticks);
  let presence = 0, shown = 0;

  return {
    object,
    update(selected, time, dt, camera) {
      const step = Math.max(0, dt);
      presence += ((selected === null ? 0 : 1) - presence) * (1 - Math.exp(-step / EASE));
      object.visible = presence > 0.01;
      if (!object.visible) { presence = selected === null ? 0 : presence; weights.set(1, 0, 0); shown = 0; return; }
      if (selected !== null) shown = selected;
      const k = 1 - Math.exp(-step / GATHER);
      weights.x += ((shown === 0 ? 1 : 0) - weights.x) * k; weights.y += ((shown === 1 ? 1 : 0) - weights.y) * k; weights.z += ((shown === 2 ? 1 : 0) - weights.z) * k;
      object.matrix.copy(camera.matrixWorld); object.matrixWorldNeedsUpdate = true;
      const half = DEPTH * Math.tan(camera.fov * Math.PI / 360);
      body.position.set(0, RAISED * half, -DEPTH); body.rotation.x = 0.22; body.scale.setScalar(SIZE * half);
      material.uniforms.uTime!.value = time; material.uniforms.uPresence!.value = presence;
      material.uniforms.uPx!.value = 2.6 * buffer.y / 1440;
      ticks.position.set(0, (RAISED + TICKS_Y) * half, -DEPTH); ticks.scale.setScalar(half);
      for (let i = 0; i < 3; i++) tickLight.fill(i === shown ? 1 : 0.28, i * 6, i * 6 + 6);
      ticks.geometry.attributes.color!.needsUpdate = true;
      ticks.material.opacity = presence;
    },
    dispose() { geometry.dispose(); material.dispose(); ticks.geometry.dispose(); ticks.material.dispose(); },
  };
}
