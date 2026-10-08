// The host's two clocks and the rules that keep them together. DOM-free so `node --test` can run it.
//
// `clockMs` is the host clock the renderers read (`view.timeMs`: birth ramps, shimmer). `scene.life.clockMs` is the
// life clock (walkers, steam, tile swaps). They start together at `startMs` (the `t` parameter), advance together and
// stop together while paused.
//
// Where the clocks live: in a session that outlives any one renderer. The render loop's effect is re-run by a
// backend switch (a canvas bound to one context type cannot change), and the effect's own variables are lost
// every time. So the session, not the effect, owns the host clock and remembers which scene it belongs to.
//
// The rules (each has a test in host-clock.test.ts):
//   1. A new clip (a different scene key) restarts both clocks at `startMs`, and the new scene's idle life is advanced
//      to that time once, before its first draw, so a still is reproducible.
//   2. BACKEND SWITCH keeps the host clock and does not re-advance life: the renderer is new, the scene and its life
//      are the same object, so the session finds its own scene again and changes nothing. Both clocks stay where they
//      were and stay equal. (The alternative, rebuilding both from `startMs`, would send the picture back to the
//      start; a switch of drawing technology must not do that.)
//   3. Reduced motion is applied to the scene in place (`applyReducedMotion`) and read by the steps as an option. The
//      toggle moves no clock, replays no life and rebuilds nothing.
//   4. The same clip with a new scene object (not reachable from the fixture bar today) carries the host clock on and
//      advances the new life up to it once; that is the one case that replays, and it is a replay of a new scene.
import { advanceLife } from '../scene/life.ts';
import { applyReducedMotion } from './scenes.ts';
import type { Scene } from './useRenderLoop.ts';

export interface ClockSession {
  /** The scene the clocks belong to; a remounted renderer on the same scene carries on (rule 2). */
  scene: Scene | null;
  /** The clip key of that scene (see sceneKey). */
  key: string | null;
  /** Host clock, ms. */
  clockMs: number;
  /** Which reduced-motion state is currently applied to `scene`'s lanes. */
  reducedApplied: boolean;
}

export const createClockSession = (): ClockSession => ({ scene: null, key: null, clockMs: 0, reducedApplied: false });

export type Adoption = 'same' | 'restarted' | 'continued';

/** Makes the lanes of `scene` match `reduced`; a no-op when they already do. Moves no clock. */
export function syncReducedMotion(session: ClockSession, scene: Scene, reduced: boolean): void {
  if (session.reducedApplied === reduced) return;
  applyReducedMotion(scene.frame, reduced);
  session.reducedApplied = reduced;
}

/**
 * Called every frame with the scene the host currently has. 'same': nothing to do (including after a backend
 * switch, rule 2). 'restarted': a new clip, both clocks start at `startMs` (rule 1). 'continued': the same clip with
 * a new scene object (rule 4).
 */
export function adoptScene(session: ClockSession, scene: Scene, key: string, startMs: number, reducedMotion: boolean): Adoption {
  if (session.scene === scene) return 'same';
  const restart = session.key !== key;
  session.scene = scene;
  session.key = key;
  session.reducedApplied = false; // a fresh scene is authored with its shimmer
  if (restart) session.clockMs = startMs;
  syncReducedMotion(session, scene, reducedMotion);
  advanceLife(scene.life, scene.frame, session.clockMs, { reducedMotion });
  return restart ? 'restarted' : 'continued';
}

/** Advances the host clock by `stepMs` and, with a scene, its life by the same amount. Zero or negative does nothing. */
export function stepClocks(session: ClockSession, scene: Scene | null, stepMs: number, reducedMotion: boolean): void {
  if (!(stepMs > 0)) return;
  session.clockMs += stepMs;
  if (scene) advanceLife(scene.life, scene.frame, stepMs, { reducedMotion });
}
