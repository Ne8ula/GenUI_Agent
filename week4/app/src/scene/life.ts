// Idle life for the arrival frame: steam and cigarette smoke rising, walkers strolling slowly.
// Pure, deterministic from the life clock; rewrites only dynamic slots (x, y, a, size) in place
// so slot identity and every static particle stay exactly as authored.
// Round 3 (IMPLEMENTATION_BRIEF §9 A): a walker may carry an intro from its scene (seed33.ts
// `walkerIntroOf`): one approach phased to the build, a dwell at the near position, a fade, and only
// then the ordinary cycle. Rigs without an intro (the arrival scene) behave exactly as before.
import { ASPECT, HORIZON_Y, rigsOf, walkerHeightAt } from './arrival.ts';
import type { EmitterRig, Rigs, WalkerRig } from './arrival.ts';
import { hash01 } from './rng.ts';
import { smoothstep } from './author.ts';
import { WALKER_FADE_IN_S, WALKER_FADE_OUT_S, WALKER_GAP_S, seed33RigsOf, walkerIntroOf } from './seed33.ts';
import { createTileState, stepTiles } from './tiles.ts';
import type { TileState } from './tiles.ts';
import type { SceneFrame } from './types.ts';

/** Rigs of any authored scene: the arrival registry first, then the seed-33 one. */
export const rigsOfFrame = (frame: SceneFrame): Rigs | undefined => rigsOf(frame) ?? seed33RigsOf(frame);

export interface LifeOptions {
  /** Reduced motion: walkers hold to a slow drift, steam and smoke stay slow and small. */
  reducedMotion: boolean;
}

export interface LifeState {
  seed: number;
  /** Accumulated life clock in ms; the host passes wall-clock deltas, life owns its own time. */
  clockMs: number;
  /** Walker time and emitter time advance at reduced rates under reduced motion, so a toggle never jumps. */
  walkMs: number;
  emitMs: number;
  rigs: Rigs | null;
  /** Tile life (seed-33 scenes); null when the frame has no tiles. Steps on the life clock. */
  tiles: TileState | null;
}

export function createLife(frame: SceneFrame): LifeState {
  return { seed: frame.seed, clockMs: 0, walkMs: 0, emitMs: 0, rigs: rigsOfFrame(frame) ?? null, tiles: frame.tiles.length > 0 ? createTileState(frame, frame.seed) : null };
}

export const REDUCED_WALK_RATE = 0.35;
export const REDUCED_EMIT_RATE = 0.5;

const TAU = Math.PI * 2;

/** Largest single integration step; longer host frames are split so slow frames never slow life down. */
export const MAX_LIFE_STEP_MS = 50;

/** Advances idle life by any dtMs in slices of at most MAX_LIFE_STEP_MS; the host calls this once per frame. */
export function advanceLife(life: LifeState, frame: SceneFrame, dtMs: number, opts: LifeOptions): void {
  let remaining = Math.max(0, dtMs);
  while (remaining > 0) {
    const h = Math.min(remaining, MAX_LIFE_STEP_MS);
    stepLife(life, frame, h, opts);
    remaining -= h;
  }
}

/** Advances idle life by one step of at most 100 ms and rewrites only dynamic regions' particles in place. */
export function stepLife(life: LifeState, frame: SceneFrame, dtMs: number, opts: LifeOptions): void {
  const dt = Math.max(0, Math.min(dtMs, 100));
  life.clockMs += dt;
  life.walkMs += dt * (opts.reducedMotion ? REDUCED_WALK_RATE : 1);
  life.emitMs += dt * (opts.reducedMotion ? REDUCED_EMIT_RATE : 1);
  if (life.tiles) stepTiles(life.tiles, frame, dt, life.clockMs, opts);
  const rigs = life.rigs;
  if (!rigs) return;
  for (const rig of rigs.walkers) stepWalker(frame, rig, life.walkMs / 1000, opts.reducedMotion);
  for (const rig of rigs.emitters) stepEmitter(frame, rig, life.emitMs / 1000, opts.reducedMotion);
}

export interface WalkerPose {
  feetX: number;
  feetY: number;
  height: number;
  /** Visibility 0..1 (fade-in after a respawn, fade-out before it). */
  fade: number;
  /** Gait phase (radians). */
  phase: number;
  /** Stride 0..1: 1 while walking, 0 while standing at the end of an intro approach (the gait swing scales by it). */
  stride: number;
}

/**
 * Where a walker's feet are and how visible it is at walker time t (seconds of walker clock).
 * With an intro (seed-33 woman): from `startS` she approaches over `travelS`, stands for `holdS`, fades out,
 * and only then does the ordinary travel/gap cycle begin (first the gap, then a fresh approach), so she is
 * whole from her birth window through the complete-plus-five-seconds still. Without one: the cycle as before.
 */
export function walkerPose(rig: WalkerRig, t: number, reduced: boolean): WalkerPose {
  const travel = rig.travelS;
  const period = travel + WALKER_GAP_S;
  const [hx, hy] = rig.homeFeet;
  // Lane toward the vanishing point; the woman's lane is slightly to the right of it so she never crosses the far walkers.
  const laneX = 0.5 + (rig.facing === 'toward' ? 0.02 : 0);
  const phase = TAU * rig.stepHz * t + rig.phase0S;
  void reduced; // amplitude, not timing, differs under reduced motion (see stepWalker)
  const intro = walkerIntroOf(rig);
  let f: number;
  let fade: number;
  let stride = 1;
  let afterIntro = t;
  if (intro) {
    const introEnd = intro.startS + intro.travelS + intro.holdS + WALKER_FADE_OUT_S;
    if (t < introEnd) {
      const ti = t - intro.startS;
      const stand = intro.travelS + intro.holdS;
      f = Math.min(Math.max(ti / intro.travelS, 0), 1);
      fade = ti < 0 ? 0 : smoothstep(0, WALKER_FADE_IN_S, ti) * (1 - smoothstep(stand, stand + WALKER_FADE_OUT_S, ti));
      stride = 1 - smoothstep(intro.travelS - 0.8, intro.travelS, ti);
      const feetY = rig.startY + (rig.endY - rig.startY) * f;
      const feetX = hx + (hy - feetY) * ((laneX - hx) / (hy - HORIZON_Y));
      const height = rig.homeHeight * (walkerHeightAt(feetY) / walkerHeightAt(hy));
      return { feetX, feetY, height, fade, phase, stride };
    }
    // The ordinary cycle picks up after the intro, gap first: at introEnd the cycle time is `travel`.
    afterIntro = t - introEnd + travel - rig.phase0S;
  }
  const tc = (((afterIntro + rig.phase0S) % period) + period) % period;
  f = Math.min(tc / travel, 1);
  const feetY = rig.startY + (rig.endY - rig.startY) * f;
  const feetX = hx + (hy - feetY) * ((laneX - hx) / (hy - HORIZON_Y));
  const height = rig.homeHeight * (walkerHeightAt(feetY) / walkerHeightAt(hy));
  fade = tc >= travel ? 0 : smoothstep(0, WALKER_FADE_IN_S, tc) * (1 - smoothstep(travel - WALKER_FADE_OUT_S, travel, tc));
  return { feetX, feetY, height, fade, phase, stride };
}

function stepWalker(frame: SceneFrame, rig: WalkerRig, t: number, reduced: boolean): void {
  const s = frame.store;
  const { feetX, feetY, height, fade, phase, stride } = walkerPose(rig, t, reduced);
  const swing = Math.sin(phase) * (reduced ? 0.035 : 0.07) * stride;
  // Walking: a step bob; standing (stride 0): a slow, barely visible breath instead.
  const bob = -Math.abs(Math.sin(phase)) * (reduced ? 0.004 : 0.009) * stride + Math.sin(t * 1.1) * 0.0025 * (1 - stride) * (reduced ? 0.5 : 1);
  const n = rig.end - rig.start;
  for (let i = 0; i < n; i++) {
    const k = rig.start + i;
    const limb = rig.limb[i] ?? 0;
    let nx = rig.nx[i] ?? 0;
    let ny = rig.ny[i] ?? 0;
    if (limb === 1 || limb === 2) {
      const legF = Math.max(0, 1 + ny / 0.45); // 0 at the hip, 1 at the foot
      nx += (limb === 1 ? swing : -swing) * legF;
      ny += -Math.max(0, limb === 1 ? swing : -swing) * 0.25 * legF; // a slight lift on the forward swing
    } else if (limb !== 4) {
      ny += bob;
    }
    s.x[k] = feetX + (nx * height) / ASPECT;
    s.y[k] = feetY + ny * height;
    s.a[k] = (rig.baseA[i] ?? 0) * fade;
    s.size[k] = (rig.baseSize[i] ?? 1) * (height / rig.homeHeight);
  }
}

function stepEmitter(frame: SceneFrame, rig: EmitterRig, t: number, reduced: boolean): void {
  const s = frame.store;
  const n = rig.end - rig.start;
  const [ox, oy] = rig.origin;
  const amp = reduced ? 0.6 : 1;
  if (rig.id === 'fx:steam') {
    const T = 2.8;
    const drift = Math.sin(t * 0.25) * 0.006 * amp;
    for (let i = 0; i < n; i++) {
      const k = rig.start + i;
      const u = ((t / T + hash01(i, 101)) % 1 + 1) % 1;
      const sway = Math.sin(TAU * (u * 1.1 + hash01(i, 102))) * 0.0035 * amp;
      const spread = (hash01(i, 103) - 0.5) * 0.006 * u;
      s.x[k] = ox + sway + spread + drift * u;
      s.y[k] = oy - 0.15 * u * amp - 0.004;
      s.a[k] = 0.5 * Math.pow(1 - u, 1.2) * smoothstep(0, 0.08, u) * amp;
      s.size[k] = 2 + 5 * u;
    }
  } else {
    const T = 4.5;
    const bendDir = Math.sin(t * 0.18 + 0.7);
    for (let i = 0; i < n; i++) {
      const k = rig.start + i;
      const u = ((t / T + hash01(i, 201)) % 1 + 1) % 1;
      const bend = 0.028 * u * u * bendDir * amp;
      const wobble = Math.sin(TAU * (u * 0.8 + hash01(i, 202))) * 0.004 * u * amp;
      const spread = (hash01(i, 203) - 0.5) * 0.014 * Math.pow(u, 1.5);
      s.x[k] = ox + bend + wobble + spread;
      s.y[k] = oy - 0.22 * u * amp - 0.003;
      s.a[k] = 0.55 * Math.pow(1 - u, 1.4) * smoothstep(0, 0.05, u) * amp;
      s.size[k] = 1.6 + 4.2 * u;
    }
  }
}
