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
const LOOK_RATE = 0.0016; // rad per mouse pixel
const LOOK_LAG = 0.16; // s; the view trails the hand slightly
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

export interface FlightPush {
  /** Added to the velocity, m/s. */
  velocity?: Vec3;
  /** Added to the look direction, radians. */
  yaw?: number;
  pitch?: number;
  /** Seconds during which the participant's keys and mouse are ignored. */
  hold?: number;
}

export interface Flight {
  /** Participant input is ignored until the room is live. */
  enabled: boolean;
  update(time: number, dt: number): void;
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

/** Free flight for `camera`; mouse look only while `lockTarget` holds the pointer lock. */
export function createFlight(camera: PerspectiveCamera, lockTarget: Element): Flight {
  const state: FlightState = { position: [...START_POSITION], velocity: [0, 0, 0] };
  const held = new Set<string>();
  let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0, holdUntil = 0, now = 0;
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
  const onMouseMove = (event: MouseEvent) => {
    if (!flight.enabled || guided || now < holdUntil || document.pointerLockElement !== lockTarget) return;
    targetYaw -= event.movementX * LOOK_RATE;
    targetPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, targetPitch - event.movementY * LOOK_RATE));
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);

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
      const look = 1 - Math.exp(-dt / LOOK_LAG);
      yaw += (targetYaw - yaw) * look;
      pitch += (targetPitch - pitch) * look;

      forward.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      right.set(Math.cos(yaw), 0, -Math.sin(yaw));
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
        state.position[0] + Math.sin(time * 0.29) * 0.018,
        state.position[1] + Math.sin(time * 0.41) * 0.03 + Math.sin(time * 0.17 + 1) * 0.02,
        state.position[2] + Math.sin(time * 0.23 + 2) * 0.018,
      );
      camera.rotation.set(
        pitch + Math.sin(time * 0.31) * 0.006,
        yaw + Math.sin(time * 0.19 + 0.5) * 0.008,
        Math.sin(time * 0.21) * 0.014 - lateral * 0.035,
        'YXZ',
      );
      camera.updateMatrixWorld();
    },
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
      document.removeEventListener('mousemove', onMouseMove);
    },
  };
  flight.update(0, 0);
  return flight;
}
