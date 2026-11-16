// The eye's volume, as real geometry in the room: blocks of the eye's own picture raised out of its surface round the iris
// (taller the more restless it is), and a dim cone of drifting grains leaving the iris the way it looks.
import {
  AddEquation, BoxGeometry, BufferAttribute, BufferGeometry, CustomBlending, GLSL3, Group, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, OneFactor, OneMinusSrcAlphaFactor, Points, ShaderMaterial, type IUniform,
} from 'three';
import { EYE_RELIEF } from './eye-shader.ts';

/** Block footprint, eye widths: about three raster cells. */
const CELL = 0.02;
const MOTES = 14000;
/** The cone's length, eye widths. */
const BEAM_LENGTH = 3.4;

const BLOCK_VS = /* glsl */ `
in vec3 aCell;                          // centre xy in the eye's frame, and a hash
uniform sampler2D uA, uB;
uniform float uMix, uTime, uRise, uOpacity, uGain;
out vec3 vCol;
${EYE_RELIEF}
void main() {
  vec2 uv = vec2(aCell.x + 0.5, 0.5 - aCell.y * 2.0);
  vec4 tex = mix(texture(uA, uv), texture(uB, uv), uMix);
  float lum = mix(tex.r * tex.r * 0.45, tex.r, tex.g) * tex.a;
  // nothing stands on the iris, and a block carries only light the picture has there
  float clear = smoothstep(1.15, 1.6, length(aCell.xy - uIris.xy) / uIris.z);
  // only the picture's bright parts stand up, so in a lit room the blocks are red light, never dark lumps
  float bright = smoothstep(0.22, 0.4, lum);
  if (bright <= 0.0 || clear <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float h1 = fract(aCell.z * 7.31), h2 = fract(aCell.z * 13.7);
  float tall = aCell.z * aCell.z * uRise * clear * bright * (0.55 + 0.45 * sin(uTime * (0.15 + 0.5 * h1) + 6.283 * h2));
  float height = ${CELL} * (0.3 + 14.0 * tall);
  vec3 at = vec3(aCell.xy + position.xy * ${CELL * 0.8}, relief(aCell.xy) + (position.z + 0.5) * height);
  vCol = vec3(1.0, 0.23, 0.2) * min(1.0, (0.3 + 0.7 * lum) * uGain * uOpacity * (normal.z > 0.5 ? 0.7 + 1.6 * tall : 0.35 + 0.4 * lit(normal)));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(at, 1.0);
}`;
const BLOCK_FS = /* glsl */ `
precision highp float;
in vec3 vCol; out vec4 o;
void main() { o = vec4(vCol, 1.0); }`;

const BEAM_VS = /* glsl */ `
in vec4 aMote;                          // how far along, angle round the axis, how far out from it, a hash
uniform float uTime, uBeam, uFocal;
uniform vec2 uGaze;
uniform vec3 uIris;
out float vA;
void main() {
  float t = fract(aMote.x + uTime * (0.01 + 0.02 * aMote.w));
  float z = 0.1 + t * ${BEAM_LENGTH.toFixed(1)};
  float radius = (uIris.z * 0.7 + t * ${(BEAM_LENGTH * 0.26).toFixed(3)}) * aMote.z;
  vec4 view = modelViewMatrix * vec4(uIris.xy + uGaze * z + radius * vec2(cos(aMote.y), sin(aMote.y)), z, 1.0);
  // brightest at the iris and on the axis; nothing right in the viewer's face
  vA = uBeam * pow(1.0 - t, 1.5) * smoothstep(0.0, 0.03, t) * (1.0 - aMote.z * aMote.z) * smoothstep(0.25, 0.8, -view.z);
  gl_Position = projectionMatrix * view;
  // crisp grains about 4 mm across, in whole pixels
  gl_PointSize = clamp(floor(0.004 * uFocal / max(-view.z, 0.01) + 0.5), 1.0, 3.0);
}`;
const BEAM_FS = /* glsl */ `
precision highp float;
in float vA; out vec4 o;
void main() { o = vec4(vec3(1.0, 0.23, 0.2) * vA, 0.9 * vA); }`;

/** `u` is the eye's own uniform table: the blocks and the cone read its picture, iris, lids and time, and add uRise, uBeam, uGaze, uFocal. */
export function createEyeVolume(u: Record<string, IUniform>) {
  Object.assign(u, { uRise: { value: 0 }, uBeam: { value: 0 }, uGaze: { value: [0, 0] }, uFocal: { value: 1000 } });

  // Blocks on a grid over the lids and the white, thinning toward the corners of the picture.
  const cells: number[] = [];
  for (let y = -0.25 + CELL / 2; y < 0.25; y += CELL) for (let x = -0.5 + CELL / 2; x < 0.5; x += CELL) {
    const e = Math.hypot((x + 0.02) / 0.42, (y - 0.03) / 0.17);
    if (Math.random() < 0.75 * Math.exp(-(((e - 0.95) / 0.45) ** 2))) cells.push(x, y, Math.random());
  }
  const box = new BoxGeometry(1, 1, 1);
  const blockGeometry = new InstancedBufferGeometry();
  blockGeometry.index = box.index;
  blockGeometry.setAttribute('position', box.attributes.position!);
  blockGeometry.setAttribute('normal', box.attributes.normal!);
  blockGeometry.setAttribute('aCell', new InstancedBufferAttribute(new Float32Array(cells), 3));
  blockGeometry.instanceCount = cells.length / 3;
  // Opaque and depth-written: solid things in the room, sorted against each other and against the eye's own layers.
  const blockMaterial = new ShaderMaterial({ glslVersion: GLSL3, uniforms: u, vertexShader: BLOCK_VS, fragmentShader: BLOCK_FS });
  const blocks = new Mesh(blockGeometry, blockMaterial);

  const motes = new Float32Array(MOTES * 4);
  for (let i = 0; i < MOTES; i++) motes.set([Math.random(), Math.random() * Math.PI * 2, Math.sqrt(Math.random()), Math.random()], i * 4);
  const beamGeometry = new BufferGeometry();
  beamGeometry.setAttribute('position', new BufferAttribute(new Float32Array(MOTES * 3), 3));
  beamGeometry.setAttribute('aMote', new BufferAttribute(motes, 4));
  const beamMaterial = new ShaderMaterial({
    glslVersion: GLSL3, uniforms: u, vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
    // the eye's own blend: light on black, and in a lit room each grain shades what is behind it as much as it glows
    transparent: true, depthWrite: false, blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
  });
  const beam = new Points(beamGeometry, beamMaterial);
  beam.renderOrder = 9;

  const object = new Group();
  for (const part of [blocks, beam]) { part.frustumCulled = false; object.add(part); }
  return {
    object,
    /** The room's surfaces hide them, except while the eye is the microphone indicator. */
    setDepthTest(on: boolean) { blockMaterial.depthTest = beamMaterial.depthTest = on; },
    dispose() {
      box.dispose();
      blockGeometry.dispose();
      blockMaterial.dispose();
      beamGeometry.dispose();
      beamMaterial.dispose();
    },
  };
}
