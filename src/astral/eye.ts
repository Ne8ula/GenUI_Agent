/// <reference types="vite/client" />
import {
  AddEquation, BufferAttribute, BufferGeometry, CustomBlending, DataTexture, GLSL3, Group, LinearFilter, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry,
  Matrix4, Quaternion, ShaderMaterial, Vector2, Vector3, Vector4,
  type Camera, type IUniform,
} from 'three';
import { fixed } from './data-marks.ts';
import { createEyeMarks, BOX_SLOTS } from './eye-marks.ts';
import { createFits, TEAR_SLOTS, type Mood, type Tear } from './eye-fits.ts';
import { EYE_FS, EYE_VS } from './eye-shader.ts';
import { rasterizeWeek1Eye } from './eye-source.ts';
import { createEyeVolume } from './eye-volume.ts';
import type { AstralEye, AstralPhase, EyeStage } from './types.ts';

// The source image: small on purpose, so the CPU raster stays cheap (7–9 ms in Node on the dev machine, 20 times a second at most).
const RASTER_W = 160;
const RASTER_H = 80;
const REDRAW_INTERVAL = 1 / 20;

/** Inside the 9 × 9 × 4.1 m room, a little off the walls. */
const ROOM_MIN = new Vector3(-4.1, 0.3, -5.6);
const ROOM_MAX = new Vector3(4.1, 3.85, 2.6);

/** How the eye convulses in each phase (eye-fits.ts). Speaking is driven by EVA's voice on top of this. */
const MOODS: Record<AstralPhase, Mood> = {
  // restless, with sudden fits out of long uneven lulls
  idle: { gap: 2, length: 0.8, power: 0.9, rest: 0.28, tears: true },
  // the microphone indicator: steady and whole; it may tremble, never tear
  listening: { gap: Infinity, length: 0, power: 0, rest: 0.05, tears: false },
  // at its wildest
  thinking: { gap: 0.4, length: 1.6, power: 1, rest: 0.5, tears: true },
  speaking: { gap: 1.4, length: 0.45, power: 0.85, rest: 0.1, tears: true },
  // dim and faltering
  unavailable: { gap: 4.5, length: 0.5, power: 0.35, rest: 0.07, tears: true },
};
/** The quad the torn image is drawn on, in eye widths: room around the eye for pieces flung more than an eye width away. */
const QUAD_W = 4.4;
const QUAD_H = 2;
/** Spacing of the eye's depth layers, eye widths: five layers span 0.48. */
const LAYER_STEP = 0.12;
/** The constant seethe in each phase, before the fits raise it: how far the eye's matter comes apart. */
const SEETHE: Record<AstralPhase, number> = { idle: 0.5, listening: 0.05, thinking: 0.38, speaking: 0.3, unavailable: 0.3 };

interface Waypoint {
  /**
   * 'viewer' offsets are in the camera frame: x right, y up, z ahead. 'orbit' circles the view axis
   * in the camera frame: at.x = radius, at.z = distance ahead, the angle advancing at `spin` rad/s.
   */
  anchor: 'world' | 'viewer' | 'orbit';
  at: Vector3;
  spin?: number;
  /** Spring stiffness, 1/s²: low = slow drift, high = a sweep. */
  stiffness: number;
  /** Quad width, metres. */
  size: number;
  /** Seconds before the next waypoint. */
  stay: number;
  /** Wandering amplitude around the waypoint, metres. */
  wander: number;
}

const random = (low: number, high: number) => low + Math.random() * (high - low);
const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)]!;
const damp = (current: number, target: number, seconds: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-dt / seconds));
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const roomPoint = (y = random(ROOM_MIN.y, ROOM_MAX.y)) =>
  new Vector3(random(ROOM_MIN.x, ROOM_MAX.x), y, random(ROOM_MIN.z, ROOM_MAX.z));

/** The roaming repertoire; returns one or two waypoints. */
function roam(): Waypoint[] {
  const world = (at: Vector3, stiffness: number, size: number, stay: number, wander = 0.35): Waypoint =>
    ({ anchor: 'world', at, stiffness, size, stay, wander });
  const viewer = (x: number, y: number, z: number, stiffness: number, size: number, stay: number, wander = 0.05): Waypoint =>
    ({ anchor: 'viewer', at: new Vector3(x, y, z), stiffness, size, stay, wander });
  const side = Math.random() < 0.5 ? -1 : 1;
  switch (pick(['corner', 'corner', 'ceiling', 'low', 'low', 'drift', 'drift', 'face', 'behind'] as const)) {
    case 'corner':
      return [world(new Vector3(pick([ROOM_MIN.x, ROOM_MAX.x]), pick([ROOM_MIN.y + 0.2, ROOM_MAX.y - 0.1]), Math.random() < 0.7 ? ROOM_MIN.z : ROOM_MAX.z),
        random(0.25, 0.8), random(0.9, 1.5), random(4, 8))];
    case 'ceiling':
      return [world(roomPoint(ROOM_MAX.y), random(0.3, 1), random(1.1, 1.8), random(3, 6), 0.6)];
    case 'low':
      return [world(roomPoint(random(0.3, 0.75)), random(0.4, 1), random(0.45, 0.8), random(3, 7), 0.2)];
    case 'drift':
      return [world(roomPoint(), random(0.15, 0.6), random(0.5, 1.2), random(4, 9), 0.6)];
    case 'face':
      // Drift right past the viewer's cheek and out the other side, behind them.
      return [viewer(side * 0.32, random(-0.05, 0.12), 0.55, 1.6, 0.2, 2.5),
        viewer(-side * random(1.4, 2.2), random(0, 0.6), random(-1.5, -0.6), 0.9, 0.4, random(2.5, 4), 0.15)];
    case 'behind':
      return [viewer(random(-0.4, 0.4), random(0.05, 0.3), random(-1.1, -0.7), random(1, 2.5), 0.32, random(3, 6), 0.04)];
  }
}

/** Before any room the eye is all there is: keep it in view, drifting through depth, with rare brief exits. */
function inView(slow: number): Waypoint[] {
  const depth = random(1.8, 9);
  const exit = Math.random() < 0.12;
  const x = exit ? pick([-1.4, 1.4]) * depth : random(-0.7, 0.7) * depth;
  return [{ anchor: 'viewer', at: new Vector3(x, random(-0.28, 0.28) * depth, depth),
    stiffness: random(0.25, 0.7) * slow, size: random(0.5, 0.9) * (0.6 + depth * 0.12),
    stay: exit ? random(1.2, 2) : random(4, 8), wander: 0.15 }];
}

/** In the tunnel: travel with the viewer round the wall, never on the axis; sometimes drop behind. */
function aroundAxis(phase: AstralPhase, stage: EyeStage, side: number): Waypoint[] {
  if (stage === 'arriving') {
    // Lead the way in from one side.
    return [{ anchor: 'orbit', at: new Vector3(2.2, 0, 4), spin: 0, stiffness: 1.2, size: 0.7, stay: Infinity, wander: 0.1 }];
  }
  const thinking = phase === 'thinking', speaking = phase === 'speaking';
  const behind = !thinking && !speaking && Math.random() < 0.2;
  const ahead = behind ? random(-2, -0.6) : thinking || speaking ? random(2.5, 3.5) : random(2.5, 6);
  return [{ anchor: 'orbit', at: new Vector3(random(1.5, 2.3), 0, ahead),
    spin: side * (thinking ? random(0.3, 0.45) : random(0.12, 0.3)),
    stiffness: thinking ? 1.6 : random(0.8, 1.4), size: speaking ? 0.8 : random(0.5, 0.7),
    stay: thinking ? random(2, 3.5) : behind ? random(1.5, 3) : random(4, 8), wander: 0.08 }];
}

function forPhase(phase: AstralPhase, stage: EyeStage, side: number): Waypoint[] {
  if (phase === 'listening') {
    // The microphone indicator: front and centre in every stage.
    return [{ anchor: 'viewer', at: new Vector3(0, -0.04, 1.35), stiffness: 3, size: 0.62, stay: Infinity, wander: 0 }];
  }
  if (stage === 'tunnel' || stage === 'arriving') return aroundAxis(phase, stage, side);
  if (stage === 'void' && (phase === 'idle' || phase === 'unavailable')) return inView(phase === 'unavailable' ? 0.4 : 1);
  switch (phase) {
    case 'thinking':
      return [{ anchor: 'viewer', at: new Vector3(random(-1.8, 1.8), random(-0.6, 0.9), random(1.6, 3.4)),
        stiffness: random(0.9, 1.6), size: random(0.45, 0.7), stay: random(2.5, 4.5), wander: 0.08 }];
    case 'speaking':
      return [{ anchor: 'viewer', at: new Vector3(random(-1, 1), random(-0.2, 0.5), random(1.8, 2.8)),
        stiffness: random(0.8, 1.6), size: random(0.7, 0.95), stay: random(3, 5), wander: 0.12 }];
    case 'unavailable':
      return roam().map(waypoint => ({ ...waypoint, stiffness: Math.min(waypoint.stiffness, 1) * 0.3, size: waypoint.size * 0.7 }));
    case 'idle':
      return roam();
  }
}

const PHASES: readonly AstralPhase[] = ['idle', 'listening', 'thinking', 'speaking', 'unavailable'];
const pair = (...values: (string | null)[]) => (values.every(value => value !== null) ? values.join(' ') : null);

/** EVA's eye: the Week 1 eye as a red image that tears and re-forms in fits, roaming the room and watching the viewer. */
export function createAstralEye(): AstralEye {
  // Two rasters, crossfaded, so the image moves at the frame rate though it is drawn 20 times a second.
  const pixels = new Uint8ClampedArray(RASTER_W * RASTER_H * 4);
  const textures = [0, 1].map(() => {
    const texture = new DataTexture(new Uint8Array(RASTER_W * RASTER_H * 4), RASTER_W, RASTER_H);
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
  });
  let latest = 1;
  const tearR = Array.from({ length: TEAR_SLOTS }, () => new Vector4());
  const tearM = Array.from({ length: TEAR_SLOTS }, () => new Vector4());
  const tearA = Array.from({ length: TEAR_SLOTS }, () => new Vector4());
  const u: Record<string, IUniform> = {
    uA: { value: textures[0] }, uB: { value: textures[1] }, uMix: { value: 1 },
    uTime: { value: 0 }, uOpacity: { value: 0 }, uGain: { value: 1.3 }, uOcclude: { value: 0.92 },
    uAgit: { value: 0 }, uSeed: { value: 0 }, uLines: { value: 120 }, uKeep: { value: 1 }, uDrop: { value: 0 }, uGuard: { value: 1 },
    uSeethe: { value: 0 }, uLid: { value: 0 }, uTearA: { value: tearA }, uDepth: { value: 0 }, uLayerStep: { value: LAYER_STEP },
    uJolt: { value: new Vector4(0, 0, 1, 1) }, uPupil: { value: new Vector4(-0.03, 0.06, 0.03, 0.03) }, uPupilAngle: { value: 0 },
    uIris: { value: new Vector3(-0.03, 0.06, 0.14) }, uTearR: { value: tearR }, uTearM: { value: tearM },
  };
  // Light on black like the field; it also shades what is behind it, so the eye still reads against a bright room.
  const material = new ShaderMaterial({
    glslVersion: GLSL3, uniforms: u, vertexShader: EYE_VS, fragmentShader: EYE_FS,
    transparent: true, depthTest: false, depthWrite: false,
    blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor,
  });
  // Five copies of the quad stacked along the view axis, LAYER_STEP eye widths apart: the eye's matter has depth in the room.
  // Subdivided so the vertex shader can raise each layer into the eye's relief, finest in the middle where the relief is.
  const plane = new PlaneGeometry(QUAD_W, QUAD_H, 132, 60), corners = plane.attributes.position!.array, index = plane.index!.array;
  for (let v = 0; v < corners.length; v += 3) for (const [axis, half] of [[0, QUAD_W / 2], [1, QUAD_H / 2]] as const) {
    const t = corners[v + axis]! / half;
    corners[v + axis] = half * t * (0.2 + 0.8 * t * t);
  }
  const stack = new Float32Array(corners.length * 5), indices: number[] = [];
  for (let layer = 0; layer < 5; layer++) {
    for (let v = 0; v < corners.length; v += 3) stack.set([corners[v]!, corners[v + 1]!, (layer - 2) * LAYER_STEP], layer * corners.length + v);
    for (const i of index) indices.push(i + layer * (corners.length / 3));
  }
  plane.dispose();
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(stack, 3));
  geometry.setIndex(indices);
  const quad = new Mesh(geometry, material);
  quad.renderOrder = 10;
  quad.frustumCulled = false;
  const marks = createEyeMarks();
  const volume = createEyeVolume(u);
  // the read-outs sit at the iris's depth in the relief
  marks.object.position.z = 0.13;
  const group = new Group();
  group.add(quad, volume.object, marks.object);
  const buffer = new Vector2(2560, 1440);
  quad.onBeforeRender = renderer => { renderer.getDrawingBufferSize(buffer); };
  const fits = createFits();

  let phase: AstralPhase = 'idle';
  let stage: EyeStage = 'void';
  let side = 1;
  let orbitAngle = 0;
  let voice = 0, voiceSlow = 0, lastKick = -Infinity;
  // Development only: lets a capture script stand in for EVA's voice level, to judge 'speaking' without the voice services.
  if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__astralEyeVoice = (level: number) => { voice = clamp(level, 0, 1); };
  let queue: Waypoint[] = [];
  let current: Waypoint = forPhase('idle', 'void', side)[0]!;
  let nextWaypointAt = 0;
  let nextBlinkAt = random(1.5, 4), blinkStart = -1;
  let nextSaccadeAt = 0;
  let lastRaster = -Infinity, lastText = -Infinity;
  let size = 0.8, closure = 1, energy = 0, opacity = 0, lift = 0;
  let gazeX = 0, gazeY = 0, saccadeX = 0, saccadeY = 0, targetSaccadeX = 0, targetSaccadeY = 0;
  let tissueX = 0, tissueY = 0;
  let glow = 0, depth = 0, rise = 0;
  // Where it looks: at the viewer, or for a while past them (an angle off the line to the viewer), so its side and its cone show.
  let glanceYaw = 0, glancePitch = 0, nextGlanceAt = random(4, 8);
  let forcedGlance: [number, number] | null = null;
  // Development only: lets a capture script turn the eye a fixed angle away from the viewer.
  if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__astralEyeGlance = (yaw?: number, pitch = 0) => { forcedGlance = yaw === undefined ? null : [yaw, pitch]; };
  const look = new Matrix4(), up = new Vector3(), aim = new Quaternion(), turn = new Quaternion(), X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0);
  const irisFrom = new Vector3(-0.03, 0.06, 0.14), irisTo = irisFrom.clone();
  const pupilFrom = new Vector4(-0.03, 0.06, 0.03, 0.03), pupilTo = pupilFrom.clone();
  let angleFrom = 0, angleTo = 0;
  // Tracking: which torn piece each box is locked to (the last slot is the pupil's), since when, and how many rows it reads out.
  const slots: (number | null)[] = Array.from({ length: BOX_SLOTS - 1 }, () => null);
  const slotSince = new Float64Array(BOX_SLOTS), slotRows = new Uint8Array(BOX_SLOTS);
  let pupilBox = false, pupilBoxToggle = 0;
  let placed = false;
  let relocate = false;
  let mood = '';

  const position = group.position;
  const velocity = new Vector3();
  const target = new Vector3();
  const toward = new Vector3();
  const local = new Vector3();
  const facing = new Quaternion();
  const inverse = new Quaternion();
  const projected = new Vector3();
  const lastCamera = new Vector3();

  const advance = (time: number) => {
    if (queue.length === 0) queue = forPhase(phase, stage, side);
    current = queue.shift()!;
    nextWaypointAt = time + current.stay;
  };

  /** A rectangle in the torn image's own frame, carried by the whole eye's judder into the quad's frame, where the boxes are drawn. */
  const jolted = (x0: number, y0: number, x1: number, y1: number) => {
    const j = fits.jolt;
    return [x0 * j[2] + j[0], y0 * j[3] + j[1], x1 * j[2] + j[0], y1 * j[3] + j[1]] as const;
  };
  /** Where a torn piece is now, clipped to the visible eye. */
  const pieceRect = (tear: Tear) => {
    const [x0, y0, x1, y1] = tear.rect;
    const cx0 = tear.mode === 0 ? Math.max(x0, -0.46) : x0, cx1 = tear.mode === 0 ? Math.min(x1, 0.46) : x1;
    // the bounds of the piece as it has turned, about its own centre
    const cx = (cx0 + cx1) / 2 + tear.dx, cy = (y0 + y1) / 2 + tear.dy, hx = (cx1 - cx0) / 2, hy = (y1 - y0) / 2;
    const cos = Math.abs(Math.cos(tear.angle)), sin = Math.abs(Math.sin(tear.angle));
    const ex = cos * hx + sin * hy, ey = sin * hx + cos * hy;
    return [cx - ex, Math.max(cy - ey, -0.95), cx + ex, Math.min(cy + ey, 0.95)] as const;
  };

  return {
    object: group,
    get glow() { return glow; },
    setPhase(next) {
      if (next === phase) return;
      phase = next;
      queue = [];
      nextWaypointAt = 0;
    },
    setStage(next) {
      if (next === stage) return;
      if (next === 'tunnel') {
        side = Math.random() < 0.5 ? -1 : 1;
        orbitAngle = side > 0 ? 0 : Math.PI;
        relocate = true;
      }
      // Lead in from whichever side of the axis it is already on.
      if (next === 'arriving') orbitAngle = Math.cos(orbitAngle) >= 0 ? 0 : Math.PI;
      stage = next;
      queue = [];
      nextWaypointAt = 0;
    },
    setVoice(level) {
      voice = clamp(level, 0, 1);
    },
    update(time, dt, camera) {
      if (time >= nextWaypointAt) advance(time);

      // Where it is heading, plus a slow unpredictable wander around that.
      if (current.anchor === 'orbit') {
        // One continuous angle, so moving between orbit waypoints goes round the axis, never across it.
        orbitAngle += (current.spin ?? 0) * dt;
        const r = current.at.x;
        // Flattened: an ultrawide view is far narrower vertically, and a round orbit would leave it top and bottom.
        target.set(Math.cos(orbitAngle) * r, Math.sin(orbitAngle) * r * 0.35, -current.at.z)
          .applyQuaternion(camera.quaternion).add(camera.position);
      } else if (current.anchor === 'viewer') {
        target.set(current.at.x, current.at.y, -current.at.z).applyQuaternion(camera.quaternion).add(camera.position);
      } else {
        target.copy(current.at);
        // Far from the room (the tunnel), keep it within reach: it waits up ahead instead of streaking off.
        toward.subVectors(target, camera.position);
        if (toward.length() > 12) target.copy(camera.position).addScaledVector(toward.normalize(), 12);
      }
      const w = current.wander;
      target.x += w * (Math.sin(time * 0.37 + 1.3) + 0.6 * Math.sin(time * 0.91 + 4));
      target.y += w * 0.6 * (Math.sin(time * 0.53 + 2.1) + 0.5 * Math.sin(time * 1.31));
      target.z += w * (Math.sin(time * 0.29 + 5.2) + 0.6 * Math.sin(time * 0.77 + 0.4));

      if ((stage === 'tunnel' || stage === 'arriving') && phase !== 'listening') {
        // Keep the far end of the tunnel clear: ahead of the viewer, never within 1.2 m of the view axis.
        inverse.copy(camera.quaternion).invert();
        local.subVectors(target, camera.position).applyQuaternion(inverse);
        const radial = Math.hypot(local.x, local.y);
        if (local.z < 0 && radial < 1.2) {
          if (radial < 1e-3) local.x = side;
          const push = 1.2 / Math.hypot(local.x, local.y);
          local.x *= push;
          local.y *= push;
          target.copy(local).applyQuaternion(camera.quaternion).add(camera.position);
        }
      }

      if (!placed) {
        // First appearance: far off in the dark ahead, so it drifts in rather than popping.
        position.set(random(-3, 3), random(1.5, 3.5), -5.5);
        placed = true;
      }
      if (relocate) {
        // The viewer was carried to the tunnel mouth; the eye follows from just behind their shoulder.
        position.copy(target).add(toward.set(0, 0, 5).applyQuaternion(camera.quaternion));
        velocity.set(0, 0, 0);
        relocate = false;
      }
      // Slightly under-damped spring: arrives, overshoots a touch, settles. Like something floating.
      // Anchored to the viewer, it travels with them; otherwise a fast glide would leave it trailing behind.
      toward.subVectors(camera.position, lastCamera);
      if (current.anchor !== 'world' && toward.length() < 5) position.add(toward);
      lastCamera.copy(camera.position);
      const k = current.stiffness;
      const step = Math.min(dt, 0.05);
      toward.subVectors(target, position).multiplyScalar(k).addScaledVector(velocity, -1.6 * Math.sqrt(k));
      velocity.addScaledVector(toward, step);
      position.addScaledVector(velocity, step);
      // Never inside the viewer's head.
      toward.subVectors(position, camera.position);
      if (toward.length() < 0.28) position.copy(camera.position).addScaledVector(toward.normalize(), 0.28);

      // The tissue turns toward the camera with a lag; the iris makes up the difference, so the gaze leads.
      // It turns, slowly and with weight, to look at the viewer; idle or thinking it looks past them for a while. Speaking and listening, never.
      if (time >= nextGlanceAt) {
        const away = phase === 'thinking' || (glanceYaw === 0 && Math.random() < 0.6);
        glanceYaw = away ? pick([-1, 1]) * random(0.4, 0.85) : 0;
        glancePitch = away ? random(-0.1, 0.25) : 0;
        nextGlanceAt = time + (away ? random(4, 7) : random(5, 10));
      }
      const attentive = phase === 'listening' || phase === 'speaking';
      const [yaw, pitch] = forcedGlance ?? (attentive ? [0, 0] : [glanceYaw, glancePitch]);
      aim.setFromRotationMatrix(look.lookAt(camera.position, position, up.set(0, 1, 0).applyQuaternion(camera.quaternion)))
        .multiply(turn.setFromAxisAngle(Y, yaw)).multiply(turn.setFromAxisAngle(X, -pitch));
      facing.slerp(aim, 1 - Math.exp(-dt / (attentive ? 0.5 : 1.4)));
      group.quaternion.copy(facing);
      inverse.copy(facing).invert();
      local.subVectors(camera.position, position).normalize().applyQuaternion(inverse);

      if (time >= nextSaccadeAt) {
        const restless = phase === 'thinking';
        targetSaccadeX = restless ? random(-0.22, 0.22) : random(-0.05, 0.05);
        targetSaccadeY = restless ? random(-0.1, 0.1) : random(-0.03, 0.03);
        if (phase === 'listening') targetSaccadeX = targetSaccadeY = 0;
        nextSaccadeAt = time + (restless ? random(0.5, 1.3) : random(0.8, 2.6));
      }
      saccadeX = damp(saccadeX, targetSaccadeX, 0.035, dt);
      saccadeY = damp(saccadeY, targetSaccadeY, 0.035, dt);
      gazeX = damp(gazeX, clamp(local.x * 0.5, -0.2, 0.2), 0.08, dt);
      gazeY = damp(gazeY, clamp(local.y * 0.5, -0.12, 0.12), 0.08, dt);

      // Tissue leans into the eye's own motion as seen from the viewer.
      local.copy(velocity).applyQuaternion(inverse);
      tissueX = damp(tissueX, clamp(local.x * 0.06, -0.2, 0.2), 0.2, dt);
      tissueY = damp(tissueY, clamp(local.y * 0.05, -0.12, 0.12), 0.2, dt);

      if (time >= nextBlinkAt) {
        blinkStart = time;
        nextBlinkAt = time + (phase === 'listening' ? random(4, 8) : random(2.2, 6.5));
      }
      const blinkT = (time - blinkStart) / 0.24;
      // While the microphone is live it only half blinks: a closed lid nearly vanishes in front of a bright room.
      const blink = (blinkT >= 0 && blinkT <= 1 ? Math.sin(Math.PI * blinkT) : 0) * (phase === 'listening' ? 0.5 : 1);

      const baseClosure = { idle: 0.1, listening: 0, thinking: 0.12, speaking: 0.06, unavailable: 0.58 }[phase];
      const baseEnergy = { idle: 0.15, listening: 0.4, thinking: 0.3, speaking: 0.15 + voice * 0.85, unavailable: 0 }[phase];
      closure = damp(closure, baseClosure, 0.3, dt);
      energy = damp(energy, baseEnergy, phase === 'speaking' ? 0.05 : 0.4, dt);
      lift = damp(lift, phase === 'listening' ? 0.06 : 0, 0.3, dt);
      opacity = damp(opacity, phase === 'unavailable' ? 0.38 : 1, 0.8, dt);
      size = damp(size, current.size * (phase === 'speaking' ? 1 + voice * 0.22 : 1), phase === 'speaking' ? 0.08 : 0.9, dt);
      // Drifting right up to the viewer, a big eye shrinks to stay an eye instead of a smear across the whole view.
      const distance = position.distanceTo(camera.position);
      const scale = Math.min(size, distance * 1.2);
      group.scale.setScalar(scale);

      // Its fits. Speaking, EVA's voice drives them: every sudden rise in it is a fit.
      if (mood !== phase) { fits.setMood(MOODS[phase], time); mood = phase; }
      fits.update(time, dt);
      voiceSlow = damp(voiceSlow, voice, 0.25, dt);
      if (phase === 'speaking' && voice - voiceSlow > 0.18 && time - lastKick > 0.15) {
        fits.kick(0.45 + 0.55 * voice, time);
        lastKick = time;
      }
      const agit = phase === 'speaking' ? Math.max(fits.level, voice * 0.75) : fits.level;

      // The red light it casts follows how awake and open it is, and flares with its fits; while the microphone is live it never goes out.
      glow = clamp(opacity * ((1 - 0.6 * Math.max(closure, blink)) * (0.55 + 0.6 * energy) + 0.35 * agit), phase === 'listening' ? 0.3 : 0, 1);

      // Over half the interval: long enough to smooth a blink, short enough that a saccade never shows two irises for long.
      const fade = clamp((time - lastRaster) / (REDRAW_INTERVAL * 0.5), 0, 1);
      u.uTime!.value = time;
      u.uOpacity!.value = opacity;
      u.uAgit!.value = agit;
      u.uSeed!.value = fits.seed;
      u.uKeep!.value = phase === 'listening' ? 1 : 0.9;
      u.uGuard!.value = phase === 'listening' ? 1 : phase === 'thinking' ? 0.85 : 0.9;
      u.uSeethe!.value = clamp(SEETHE[phase] + (phase === 'speaking' ? 0.3 * voice : 0) + 0.3 * agit * (phase === 'listening' ? 0 : 1), 0, 0.75);
      u.uLid!.value = Math.max(closure, blink);
      // listening folds the layers into one plane: steady and whole
      depth = damp(depth, phase === 'listening' ? 0 : 1, 0.3, dt);
      u.uDepth!.value = depth;
      // The room's surfaces hide it, except while it is the microphone indicator, which must never be lost behind a wall.
      material.depthTest = phase !== 'listening';
      volume.setDepthTest(phase !== 'listening');
      // The blocks stand taller the more restless it is (and with EVA's voice); listening, they lie nearly flat.
      rise = damp(rise, phase === 'listening' ? 0.08 : clamp(0.35 + 0.5 * agit + (phase === 'speaking' ? 0.5 * voice : 0), 0, 1), 0.6, dt);
      u.uRise!.value = rise;
      // The cone: dim, following its glow, gone behind shut lids, leaving the iris the way the iris looks.
      u.uBeam!.value = 0.7 * glow * (1 - Math.max(closure, blink));
      (u.uGaze!.value as number[])[0] = (gazeX + saccadeX) * 1.2;
      (u.uGaze!.value as number[])[1] = (gazeY + saccadeY) * 1.2;
      u.uDrop!.value = phase === 'unavailable' ? 0.1 + 0.4 * fits.level : 0;
      (u.uJolt!.value as Vector4).fromArray(fits.jolt);
      u.uMix!.value = fade;
      (u.uIris!.value as Vector3).lerpVectors(irisFrom, irisTo, fade);
      (u.uPupil!.value as Vector4).lerpVectors(pupilFrom, pupilTo, fade);
      u.uPupilAngle!.value = angleFrom + (angleTo - angleFrom) * fade;
      for (let i = 0; i < TEAR_SLOTS; i++) {
        const tear = fits.tears[i];
        if (!tear) { tearM[i]!.w = 0; continue; }
        tearR[i]!.fromArray(tear.rect);
        tearM[i]!.set(tear.dx, tear.dy, tear.mode, 1);
        tearA[i]!.x = tear.angle;
      }

      // Scan-lines about three pixels apart wherever it is, in steps, so the rows do not crawl as it moves.
      const focal = camera.projectionMatrix.elements[5]! * buffer.y / 2;
      u.uFocal!.value = focal;
      const eyePx = scale * focal / Math.max(distance, 0.01);
      u.uLines!.value = 2 ** (Math.round(Math.log2(clamp(eyePx * 0.5 / 3, 12, 500)) * 4) / 4);

      projected.copy(position).project(camera);
      const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.25 && Math.abs(projected.y) < 1.25;
      if (import.meta.env.DEV) {
        // Development only: where the eye is on screen, for captures.
        (globalThis as Record<string, unknown>).__astralEye = { x: projected.x, y: projected.y, front: projected.z < 1, widthPx: eyePx, bufferWidth: buffer.x, bufferHeight: buffer.y, distance, phase, level: agit, glow };
      }

      // Tracking boxes: locked onto the pieces that tear furthest, a moment after they tear, gone when they are home.
      // Fewer and shorter when the eye is small on screen, so it reads as tracking, not confetti.
      const maxBoxes = eyePx > 1000 ? 4 : eyePx > 650 ? 3 : eyePx > 380 ? 2 : eyePx > 160 ? 1 : 0;
      const maxRows = eyePx > 700 ? 5 : eyePx > 400 ? 3 : 2;
      let changed = false;
      for (let s = 0; s < slots.length; s++) {
        const tear = fits.tears.find(t => t.id === slots[s]);
        if (slots[s] !== null && (!tear || Math.hypot(tear.dx, tear.dy) < 0.012 || s >= maxBoxes)) { slots[s] = null; changed = true; }
      }
      // Only pieces that carry some of the eye's light, by the raster itself (a few samples of the open eye in the piece's home).
      const lit = (t: Tear) => {
        const [x0, y0, x1, y1] = t.rect;
        let sum = 0;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
          const x = clamp(x0 + (x1 - x0) * (i + 0.5) / 4, -0.46, 0.46), y = clamp(y0 + (y1 - y0) * (j + 0.5) / 3, -0.24, 0.24);
          const index = (Math.floor((0.25 - y) * 2 * RASTER_H) * RASTER_W + Math.floor((x + 0.5) * RASTER_W)) * 4;
          sum += pixels[index]! * pixels[index + 1]! / 65025;
        }
        return sum / 12;
      };
      // nor over the pupil's box and its read-out
      const pupilNow = u.uPupil!.value as Vector4;
      const overlaps = (t: Tear) => (pupilBox || phase === 'listening') && (() => {
        const a = pieceRect(t);
        return a[0] < pupilNow.x + 0.12 && pupilNow.x - 0.35 < a[2] && a[1] < pupilNow.y + 0.12 && pupilNow.y - 0.12 < a[3];
      })() || slots.some(id => {
        const other = fits.tears.find(each => each.id === id);
        if (!other) return false;
        const a = pieceRect(t), b = pieceRect(other);
        return a[0] < b[2] + 0.04 && b[0] < a[2] + 0.04 && a[1] < b[3] + 0.06 && b[1] < a[3] + 0.06;
      });
      const reach = (t: Tear) => Math.hypot(t.dx, t.dy) * lit(t);
      for (const tear of [...fits.tears].sort((a, b) => reach(b) - reach(a))) {
        if (slots.includes(tear.id) || time - tear.born < 0.05 || Math.hypot(tear.dx, tear.dy) < 0.03 || lit(tear) < 0.12 || overlaps(tear)) continue;
        const free = slots.findIndex((id, s) => id === null && s < maxBoxes);
        if (free < 0) break;
        slots[free] = tear.id;
        slotSince[free] = time;
        slotRows[free] = 2 + Math.floor(Math.random() * (maxRows - 1));
        changed = true;
      }
      const blinkIn = (since: number) => (time - since < 0.1 ? Math.floor(time * 30) % 2 : 1);
      for (let s = 0; s < slots.length; s++) {
        const tear = fits.tears.find(t => t.id === slots[s]);
        if (!tear) { marks.setBox(s, null); continue; }
        const r = pieceRect(tear), j = fits.jolt;
        const home = tear.mode === 1 || tear.mode === 2 || tear.id % 3 === 0
          ? [(r[0] + r[2]) / 2 - tear.dx, (r[1] + r[3]) / 2 - tear.dy].map((v, i) => v * j[2 + i]! + j[i]!) as [number, number] : null;
        // while the lids are shut there is nothing to track
        marks.setBox(s, jolted(...r), home, Math.max(closure, blink) < 0.6 ? opacity * blinkIn(slotSince[s]!) : 0);
      }
      // The pupil's box: held steady the whole time the microphone is live; otherwise it locks on and lets go now and then.
      const p = u.uPupil!.value as Vector4, angle = u.uPupilAngle!.value as number;
      if (time >= pupilBoxToggle) {
        pupilBox = !pupilBox;
        pupilBoxToggle = time + (pupilBox ? random(0.6, 3) : random(0.8, 5) * (phase === 'thinking' ? 0.4 : 1));
        if (pupilBox) slotSince[BOX_SLOTS - 1] = time;
        changed = true;
      }
      // never round an empty spot while the lids are shut
      const showPupil = Math.max(closure, blink) < 0.6
        && (phase === 'listening' || (pupilBox && phase !== 'unavailable' && slots.filter(id => id !== null).length < maxBoxes));
      if (showPupil) {
        const ex = Math.abs(Math.cos(angle)) * p.z + Math.abs(Math.sin(angle)) * p.w + 0.012;
        const ey = Math.abs(Math.sin(angle)) * p.z + Math.abs(Math.cos(angle)) * p.w + 0.012;
        // the pupil is drawn outside the judder, and so is its box
        marks.setBox(BOX_SLOTS - 1, [p.x - ex, p.y - ey, p.x + ex, p.y + ey], null, phase === 'listening' ? 1 : opacity * blinkIn(slotSince[BOX_SLOTS - 1]!));
      } else marks.setBox(BOX_SLOTS - 1, null);

      // The read-outs: every figure is a live value, refreshed twelve times a second. No words, no units.
      if (changed || time - lastText > 1 / 12) {
        lastText = time;
        const where = pair(fixed(position.x, 1, 2, true), fixed(position.y, 1, 2, true), fixed(position.z, 1, 2, true));
        for (let s = 0; s < slots.length; s++) {
          const tear = fits.tears.find(t => t.id === slots[s]);
          if (!tear) { marks.setText(s, []); continue; }
          // a sheared band's own width is what shows of it: the eye's width
          const [x0, y0, x1, y1] = tear.rect, size = [tear.mode === 0 ? Math.min(x1, 0.46) - Math.max(x0, -0.46) : x1 - x0, y1 - y0];
          const rows = [
            pair(fixed(tear.dx * scale, 1, 3, true), fixed(tear.dy * scale, 1, 3, true)),  // its displacement, metres
            pair(fixed(size[0] * scale, 1, 3), fixed(size[1] * scale, 1, 3)),                 // its own size, metres
            fixed(distance, 2, 2),                                                          // the eye's distance to the viewer
            fixed(glow, 1, 3),                                                              // its glow
            where,                                                                          // where the eye is
          ].slice(0, slotRows[s]);
          marks.setText(s, rows.filter(row => row !== null));
        }
        const rows = showPupil ? [
          pair(fixed(gazeX + saccadeX, 1, 3, true), fixed(gazeY + saccadeY, 1, 3, true)),  // the gaze offsets
          fixed(distance, 2, 2),
          fixed(glow, 1, 3),
          PHASES.map(each => (each === phase ? '#' : 'o')).join(''),                         // the phase
          phase === 'speaking' ? fixed(voice, 1, 3) : null,                                 // EVA's voice level
        ].slice(0, Math.max(maxRows, phase === 'listening' ? 4 : 2)) : [];
        marks.setText(BOX_SLOTS - 1, rows.filter(row => row !== null));
      }

      // Rasterising costs CPU: at most 20 times a second, and not at all while the eye is off screen.
      if (!onScreen || time - lastRaster < REDRAW_INTERVAL) return;
      lastRaster = time;
      const { landmarks } = rasterizeWeek1Eye(RASTER_W, RASTER_H, {
        time,
        energy,
        gazeX: gazeX + saccadeX,
        gazeY: gazeY + saccadeY,
        tissueX,
        tissueY: tissueY + lift,
        closure: Math.max(closure, blink),
        quiet: false,
        masks: true,
      }, pixels);
      latest = 1 - latest;
      const texture = textures[latest]!;
      (texture.image.data as Uint8Array).set(pixels);
      texture.needsUpdate = true;
      u.uA!.value = textures[1 - latest];
      u.uB!.value = texture;
      u.uMix!.value = 0;
      // Raster pixel coordinates into the eye's frame (one unit wide, y up).
      const at = (index: number) => {
        const point = landmarks[index]!;
        return [(point.x + 0.5) / RASTER_W - 0.5, 0.25 - (point.y + 0.5) / RASTER_H * 0.5] as const;
      };
      // Landmark 10 is the iris centre, 11 a point on its rim; 15 to 18 the pupil's corners, anticlockwise from bottom left.
      const centre = at(10), rim = at(11);
      irisFrom.copy(u.uIris!.value as Vector3);
      irisTo.set(centre[0], centre[1], Math.hypot(rim[0] - centre[0], rim[1] - centre[1]));
      const [a, b, c, d] = [15, 16, 17, 18].map(at) as [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]];
      pupilFrom.copy(u.uPupil!.value as Vector4);
      angleFrom = u.uPupilAngle!.value as number;
      pupilTo.set((a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4,
        Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, Math.hypot(c[0] - b[0], c[1] - b[1]) / 2);
      angleTo = Math.atan2(b[1] - a[1], b[0] - a[0]);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      volume.dispose();
      marks.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
