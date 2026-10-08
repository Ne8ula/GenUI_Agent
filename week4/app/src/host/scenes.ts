// Scene construction for the host: the one place that knows which scene modules exist.
// `../scene/seed33.ts` (owner: scene worker S) is imported here and nowhere else in the host, so integration
// only has to touch this file if its names change. Its contract (see IMPLEMENTATION_BRIEF.md section 3 and 9):
//   buildSeed33Scene({ seed, density, buildMs, reducedMotion }): SceneFrame
//   setReducedMotion(frame, reduced): flips the shimmer lanes in place; clocks, tiles and particles are untouched
//
// Reduced motion is never an authoring input here: a scene is always authored with its shimmer, and the host calls
// `applyReducedMotion` to switch it on or off in place. Toggling it therefore never rebuilds the scene, never replays
// idle life and never moves a clock (see clock.ts).
import { buildArrivalScene } from '../scene/arrival.ts';
import type { WalkerFacing } from '../scene/arrival.ts';
import { createLife } from '../scene/life.ts';
import * as seed33Module from '../scene/seed33.ts';
import { buildSeed33Scene, seed33RigsOf } from '../scene/seed33.ts';
import type { SceneFrame } from '../scene/types.ts';
import type { Density, Look } from './params.ts';
import type { Scene } from './useRenderLoop.ts';

export interface SceneRequest {
  look: Look;
  seed: number;
  density: Density;
  /** Arrival look only: which way the near walker faces. The seed-33 woman always walks toward the viewer. */
  facing: WalkerFacing;
  /** Seed-33 look only: construction length in ms (0 = complete). */
  buildMs: number;
}

export interface BuiltScene {
  scene: Scene | null;
  /** Plain-language reason when the scene could not be built. */
  error: string | null;
}

export function buildHostScene(request: SceneRequest): BuiltScene {
  try {
    const frame =
      request.look === 'seed33'
        ? buildSeed33Scene({ seed: request.seed, density: request.density, buildMs: request.buildMs, reducedMotion: false })
        : buildArrivalScene({ seed: request.seed, density: request.density, nearWalkerFacing: request.facing });
    return { scene: { frame, life: createLife(frame) }, error: null };
  } catch (error) {
    return { scene: null, error: `the scene could not be built (${error instanceof Error ? error.message : String(error)})` };
  }
}

/**
 * What makes two scenes "the same clip": a change restarts the host and life clocks at `startMs`. Reduced motion is
 * deliberately absent (it is applied in place and never makes a new scene), and so is the backend (the clocks
 * outlive a renderer; see clock.ts).
 */
export function sceneKey(request: SceneRequest & { startMs: number }): string {
  const arrival = request.look === 'arrival';
  return [request.look, request.seed, request.density, arrival ? request.facing : '-', arrival ? 0 : request.buildMs, request.startMs].join('|');
}

type ReducedSetter = (frame: SceneFrame, reduced: boolean) => void;

// ADAPTER (remove once seed33.ts exports `setReducedMotion`; then import it by name and call it directly).
// The scene module's own export is looked up by name so this file typechecks and runs with or without it. Without
// it, the same in-place rule is applied here: the authored `motion` lane is stashed once per frame and zeroed, and
// restored on the way back. Nothing is rebuilt either way.
const sceneSetReducedMotion = (seed33Module as unknown as { setReducedMotion?: ReducedSetter }).setReducedMotion;
const AUTHORED_MOTION = new WeakMap<SceneFrame, Float32Array>();

function stashedSetReducedMotion(frame: SceneFrame, reduced: boolean): void {
  const { motion, count } = frame.store;
  if (reduced) {
    if (!AUTHORED_MOTION.has(frame)) AUTHORED_MOTION.set(frame, motion.slice(0, count));
    motion.fill(0, 0, count);
    return;
  }
  const authored = AUTHORED_MOTION.get(frame);
  if (authored) motion.set(authored);
}

/**
 * Switches the shimmer of an authored scene off (reduced) or back on, in place. Touches only the `motion` lane (and
 * whatever the scene module keeps with it): no clock, no particle position, no tile and no life state moves, so it
 * cannot rebuild, replay or stall anything. Frames not authored by the seed-33 module (the arrival look has no shimmer
 * lanes) are left alone.
 */
export function applyReducedMotion(frame: SceneFrame, reduced: boolean): void {
  if (seed33RigsOf(frame) === undefined) return;
  (sceneSetReducedMotion ?? stashedSetReducedMotion)(frame, reduced);
}
