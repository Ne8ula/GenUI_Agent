import { Vector3, type PerspectiveCamera } from 'three';

export type Vec3 = [number, number, number];

/** Recorded camera of public/fixtures/surreal-library/manifest.json, looking toward −z. */
export const START_POSITION: Readonly<Vec3> = [0.134, 1.083, 0.74];
/** Middle of the 9 × 9 × 4.1 m room (side walls x = ±4.5, back z = −6, front z = 3). */
export const ROOM_CENTRE: Readonly<Vec3> = [0, 2.05, -1.5];
export const TETHER_RADIUS = 14;

const THRUST = 1.25; // m/s²; with GLIDE this cruises at ~1.75 m/s
const GLIDE = 1.4; // s; velocity e-folding time, the long coast to rest
const TETHER_PULL = 0.8; // m/s² per metre past the tether radius
const LOOK_LAG = 0.16; // s; the view trails the turn slightly
const SIDE_LAG = 0.3; // s; the view trails the visitor's step slightly
const WINDOW_SHIFT = 0.9; // m the viewpoint slides when the visitor stands at either edge
const WINDOW_DEPTH = 2.5; // m ahead to the point the window keeps in the middle of the screen
const TURN_EDGE = 0.7; // beyond this share of the way to either edge the view keeps turning
const TURN_RATE = 0.6; // rad/s at the very edge
const MAX_PITCH = 1.45;

export interface FlightState {
  position: Vec3;
  velocity: Vec3;
}

/** Soft pull back toward the room once beyond the tether radius; zero inside it. */
export function tetherPull(position: Readonly<Vec3>): Vec3 {
  const dx = ROOM_CENTRE[0] - position[0];
  const dy = ROOM_CENTRE[1] - position[1];
  const dz = ROOM_CENTRE[2] - position[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= TETHER_RADIUS) return [0, 0, 0];
  const strength = ((distance - TETHER_RADIUS) * TETHER_PULL) / distance;
  return [dx * strength, dy * strength, dz * strength];
}

/** One step of disembodied flight. `thrust` is a world-space direction of length ≤ 1. Mutates state. */
export function stepFlight(state: FlightState, thrust: Readonly<Vec3>, dt: number): void {
  const fade = Math.exp(-dt / GLIDE);
  const pull = tetherPull(state.position);
  for (let axis = 0; axis < 3; axis++) {
    const acceleration = thrust[axis]! * THRUST + pull[axis]!;
    // Exact solution of v' = a − v/GLIDE over dt, so the glide feels the same at any frame rate.
    state.velocity[axis] = state.velocity[axis]! * fade + acceleration * GLIDE * (1 - fade);
    state.position[axis] += state.velocity[axis]! * dt;
  }
}

/** Yaw and pitch (radians, the flight's convention: yaw 0 looks toward −z) that look from `from` to `to`. */
export function lookAngles(from: Readonly<Vec3>, to: Readonly<Vec3>): [number, number] {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
}

/** Cubic Hermite path leaving `p0` with velocity `v0` and coming to rest at `p1` after `duration` seconds. */
export function arrivalPath(p0: Readonly<Vec3>, v0: Readonly<Vec3>, p1: Readonly<Vec3>, duration: number, t: number): Vec3 {
  const s = Math.max(0, Math.min(1, t / duration));
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = (s3 - 2 * s2 + s) * duration, h01 = -2 * s3 + 3 * s2;
  return [0, 1, 2].map(axis => h00 * p0[axis]! + h10 * v0[axis]! + h01 * p1[axis]!) as Vec3;
}

/**
 * Distance travelled toward a holding point: speed proportional to what remains, eased in from rest,
 * so there is always forward motion and the holding point is never reached, however long the wait.
 */
export function holdingGlide(distance: number, elapsed: number, rate = 0.03, easeIn = 4): number {
  // Time warped so speed ramps linearly from zero over `easeIn`, then the exponential approach.
  const delayed = elapsed < easeIn ? (elapsed * elapsed) / (2 * easeIn) : elapsed - easeIn / 2;
  return distance * (1 - Math.exp(-rate * delayed));
}

/**
 * What the visitor's side-to-side position (-1 left edge, 0 middle, 1 right edge) does to the view. In the middle it is
 * a window: the viewpoint slides `shift` metres to that side and the look swings `yaw` radians the other way, so stepping
 * right shows more of the left. Near an edge the look also keeps swinging the same way at `turn` rad/s, so a visitor
 * can turn fully round. Positive yaw looks left (the flight's convention).
 * shortcut: a slide and a counter-turn, not an off-axis projection; upgrade once the tracked camera and screen are calibrated.
 */
export function sideView(side: number): { shift: number; yaw: number; turn: number } {
  const s = Number.isFinite(side) ? Math.max(-1, Math.min(1, side)) : 0;
  const shift = s * WINDOW_SHIFT;
  const past = Math.max(0, Math.abs(s) - TURN_EDGE) / (1 - TURN_EDGE);
  return { shift, yaw: Math.atan(shift / WINDOW_DEPTH), turn: Math.sign(s) * past * TURN_RATE };
}

export interface FlightPush {
  /** Added to the velocity, m/s. */
  velocity?: Vec3;
  /** Added to the look direction, radians. */
  yaw?: number;
  pitch?: number;
  /** Seconds during which the participant's keys and side-to-side position are ignored. */
  hold?: number;
}

export interface Flight {
  /** Participant input is ignored until the room is live. */
  enabled: boolean;
  update(time: number, dt: number): void;
  /** Where the visitor stands, side to side: -1 left edge, 1 right edge (see sideView). */
  setSide(side: number): void;
  /** Lets the scene shove or briefly take over the flight. */
  push(push: FlightPush): void;
  /**
   * Scene-driven pose, set every frame while it lasts; participant input is ignored meanwhile. The bob and
   * roll still apply. `snap` teleports; otherwise the motion carries on as momentum when `null` releases it.
   */
  guide(pose: { position: Readonly<Vec3>; lookAt: Readonly<Vec3> } | null, snap?: boolean): void;
  /** The current (un-bobbed) position and velocity. */
  readonly state: Readonly<FlightState>;
  dispose(): void;
}

const KEYS: Record<string, Vec3> = {
  KeyW: [0, 0, 1], KeyS: [0, 0, -1], KeyD: [1, 0, 0], KeyA: [-1, 0, 0],
  Space: [0, 1, 0], KeyE: [0, 1, 0], ShiftLeft: [0, -1, 0], ShiftRight: [0, -1, 0], KeyQ: [0, -1, 0],
};

/** Free flight for `camera`: keys move, the visitor's side-to-side position (setSide) looks. */
export function createFlight(camera: PerspectiveCamera): Flight {
  const state: FlightState = { position: [...START_POSITION], velocity: [0, 0, 0] };
  const held = new Set<string>();
  let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0, holdUntil = 0, now = 0, sideInput = 0, side = 0;
  let guided: { position: Vec3; lookAt: Vec3 } | null = null;
  let snapNext = false;
  const forward = new Vector3(), right = new Vector3();

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.code in KEYS)) return;
    event.preventDefault();
    held.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const onBlur = () => held.clear();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const flight: Flight = {
    enabled: false,
    state,
    update(time, dt) {
      now = time;
      if (guided) {
        const [lookYaw, lookPitch] = lookAngles(guided.position, guided.lookAt);
        // Turn the short way round from wherever the mouse has wound the yaw.
        targetYaw = yaw + Math.atan2(Math.sin(lookYaw - yaw), Math.cos(lookYaw - yaw));
        targetPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, lookPitch));
        for (let axis = 0; axis < 3; axis++) {
          state.velocity[axis] = snapNext || dt === 0 ? 0 : (guided.position[axis]! - state.position[axis]!) / dt;
          state.position[axis] = guided.position[axis]!;
        }
        if (snapNext) { yaw = targetYaw; pitch = targetPitch; snapNext = false; }
      }
      // The window eases in and out with the visitor's control, so releasing or taking the flight never jumps the view.
      const free = flight.enabled && !guided && time >= holdUntil;
      side += ((free ? sideInput : 0) - side) * (1 - Math.exp(-dt / SIDE_LAG));
      const view = sideView(side);
      if (free) targetYaw += view.turn * dt;
      const look = 1 - Math.exp(-dt / LOOK_LAG);
      yaw += (targetYaw - yaw) * look;
      pitch += (targetPitch - pitch) * look;

      const viewYaw = yaw + view.yaw;
      forward.set(-Math.sin(viewYaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(viewYaw) * Math.cos(pitch));
      right.set(Math.cos(viewYaw), 0, -Math.sin(viewYaw));
      let f = 0, r = 0, u = 0;
      if (flight.enabled && time >= holdUntil) {
        for (const code of held) { const k = KEYS[code]!; r += k[0]; u += k[1]; f += k[2]; }
      }
      const length = Math.hypot(f, r, u) || 1;
      f /= length; r /= length; u /= length;
      if (!guided) {
        stepFlight(state, [
          forward.x * f + right.x * r,
          forward.y * f + u,
          forward.z * f + right.z * r,
        ], dt);
      }

      // Never dead still: a slow breath of drift, and a bank into sideways motion.
      const lateral = state.velocity[0] * right.x + state.velocity[2] * right.z;
      camera.position.set(
        state.position[0] + right.x * view.shift + Math.sin(time * 0.29) * 0.018,
        state.position[1] + Math.sin(time * 0.41) * 0.03 + Math.sin(time * 0.17 + 1) * 0.02,
        state.position[2] + right.z * view.shift + Math.sin(time * 0.23 + 2) * 0.018,
      );
      camera.rotation.set(
        pitch + Math.sin(time * 0.31) * 0.006,
        viewYaw + Math.sin(time * 0.19 + 0.5) * 0.008,
        Math.sin(time * 0.21) * 0.014 - lateral * 0.035,
        'YXZ',
      );
      camera.updateMatrixWorld();
    },
    setSide(value) { sideInput = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0; },
    push({ velocity, yaw: dYaw = 0, pitch: dPitch = 0, hold = 0 }) {
      if (velocity) for (let axis = 0; axis < 3; axis++) state.velocity[axis] += velocity[axis]!;
      targetYaw += dYaw;
      targetPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, targetPitch + dPitch));
      holdUntil = Math.max(holdUntil, now + hold);
    },
    guide(pose, snap = false) {
      guided = pose && { position: [...pose.position], lookAt: [...pose.lookAt] };
      snapNext = snap && pose !== null;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      },
  };
  flight.update(0, 0);
  return flight;
}
