/**
 * Transition glitch accents (pass w3-cloud-20260928-a-p3; owner request: "when
 * it's transitioning between states, add the .gif reference ... very minor,
 * like only a few glitch boxes appear").
 *
 * A tiny scheduler: while the eye is actually changing (expressive energy
 * rising/falling, or one composition handing over to the next), it spawns at
 * most a few short-lived glitch boxes anchored on particles. Timing follows the
 * packet video: each event grows from a thin line into a small striped box,
 * briefly throws a thin horizontal trail, then vanishes (about 0.2-0.5 s).
 * No new events and nothing drawn when the clock does not advance (End freeze,
 * reduced motion). Pure state; render.ts draws.
 */

import { cellHash } from "./particles";

/** Owner: "only a few glitch boxes". */
export const MAX_GLITCH_BOXES = 3;
/** Events per second at full transition activity. */
const SPAWN_RATE = 5;

export interface GlitchEvent {
  /** Stable id; drives placement, size and colours. */
  id: number;
  start: number;
  duration: number;
  /** 0..1 selector for the anchoring particle. */
  anchor: number;
  /** Box width as a fraction of the eye's display scale (about the rest eye's width). */
  width: number;
  /** Box height as a fraction of its width. */
  aspect: number;
  trail: boolean;
}

export interface GlitchState {
  events: GlitchEvent[];
  counter: number;
  lastTime: number | null;
  lastEnergy: number;
  /** Accumulated spawn budget (deterministic, no Math.random). */
  budget: number;
}

export function createGlitchState(): GlitchState {
  return { events: [], counter: 0, lastTime: null, lastEnergy: 0, budget: 0 };
}

/**
 * 0..1 transition activity from how fast expressive energy is changing, plus
 * any in-progress composition handover (0 = idle/settled, 1 = mid-change).
 */
export function transitionActivity(energyRate: number, handover: number): number {
  const fromEnergy = Math.min(1, Math.abs(energyRate) / 1.2);
  const fromHandover = handover > 0 && handover < 1 ? Math.sin(handover * Math.PI) : 0;
  return Math.max(fromEnergy, fromHandover);
}

/**
 * Advance the scheduler to `time` and return the events visible now. Returns
 * nothing (and clears events) when the clock did not advance or `enabled` is
 * false, so a frozen or reduced-motion frame never shows a glitch.
 */
export function stepGlitches(state: GlitchState, time: number, energy: number, handover: number, seed: number, enabled: boolean): GlitchEvent[] {
  const dt = state.lastTime === null ? 0 : time - state.lastTime;
  const energyRate = dt > 0 ? (energy - state.lastEnergy) / dt : 0;
  state.lastTime = time;
  state.lastEnergy = energy;
  if (!enabled || !(dt > 0) || dt > 0.5) {
    state.events.length = 0;
    state.budget = 0;
    return state.events;
  }
  state.events = state.events.filter(event => time - event.start < event.duration);
  const activity = transitionActivity(energyRate, handover);
  state.budget = activity > 0.05 ? state.budget + activity * SPAWN_RATE * dt : 0;
  while (state.budget >= 1 && state.events.length < MAX_GLITCH_BOXES) {
    state.budget -= 1;
    const id = state.counter++;
    const h = (salt: number) => cellHash(id * 7919 + (seed % 100003), salt);
    state.events.push({
      id,
      start: time,
      duration: 0.2 + 0.28 * h(1),
      anchor: h(2),
      width: 0.12 + 0.1 * h(3),
      aspect: 0.55 + 0.25 * h(4),
      trail: h(5) < 0.55,
    });
  }
  if (state.budget > 1) state.budget = 1;
  return state.events;
}

/**
 * Event envelope from the packet video: a thin line (first quarter), the full
 * striped box (middle), fading out (last quarter). `grow` is the 0..1 width
 * scale (a vertical line opening into the box), plus 0..1 opacity and trail.
 */
export function glitchEnvelope(event: GlitchEvent, time: number): { grow: number; alpha: number; trail: number } {
  const t = Math.min(1, Math.max(0, (time - event.start) / event.duration));
  const grow = t < 0.25 ? 0.12 + 0.88 * (t / 0.25) : 1;
  const alpha = t < 0.75 ? Math.min(1, t / 0.1) : 1 - (t - 0.75) / 0.25;
  const trail = event.trail && t > 0.35 && t < 0.7 ? 1 : 0;
  return { grow, alpha: Math.max(0, Math.min(1, alpha)), trail };
}
