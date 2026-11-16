// Which hero the viewer is inspecting: look steadily at one, or come close to it. Pure: boxes, camera and time in; a hero index out.

export type Vec3 = readonly [number, number, number];
export interface Box { readonly min: Vec3; readonly max: Vec3 }

export const INSPECT = {
  /** The view's centre ray counts only this far, metres. */
  reach: 12,
  /** How long the centre ray must rest on a hero before it answers, seconds. */
  dwell: 0.4,
  /** This close to a hero's box, metres, it answers at once. */
  near: 1.2,
  /** How long a hero is kept after neither holds, seconds. */
  release: 0.8,
} as const;

export interface InspectState {
  /** The hero being inspected, or -1. */
  readonly hero: number;
  /** The hero the centre ray rests on (or that is near), and since when. */
  readonly candidate: number;
  readonly since: number;
  /** When the inspected hero stopped qualifying, or null while it still does. */
  readonly lostAt: number | null;
}
export const INSPECT_NONE: InspectState = Object.freeze({ hero: -1, candidate: -1, since: 0, lostAt: null });

/** How far along the ray (origin o, unit direction d) it enters the box; 0 when o is inside; null when it misses. */
export function rayBox(o: Vec3, d: Vec3, box: Box): number | null {
  let near = -Infinity, far = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]!) < 1e-12) {
      if (o[a]! < box.min[a]! || o[a]! > box.max[a]!) return null;
      continue;
    }
    const t1 = (box.min[a]! - o[a]!) / d[a]!, t2 = (box.max[a]! - o[a]!) / d[a]!;
    near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
  }
  if (near > far || far < 0) return null;
  return Math.max(0, near);
}

/** Distance from p to the nearest point of the box; 0 inside. */
export function boxDistance(p: Vec3, box: Box): number {
  let s = 0;
  for (let a = 0; a < 3; a++) { const v = Math.max(box.min[a]! - p[a]!, 0, p[a]! - box.max[a]!); s += v * v; }
  return Math.sqrt(s);
}

/**
 * One frame of the decision. A hero is taken when the viewer comes within `near` of it, or when the centre ray has rested on it
 * (nearest hit within `reach`) for `dwell`. While it still qualifies by either it is kept, whatever else the ray crosses: no
 * flicker between two heroes. Once neither holds for `release` it is let go, and a hero the viewer has meanwhile settled on takes over.
 */
export function nextInspect(state: InspectState, boxes: readonly Box[], position: Vec3, direction: Vec3, time: number): InspectState {
  let looked = -1, lookedAt: number = INSPECT.reach, close = -1, closest: number = INSPECT.near;
  boxes.forEach((box, i) => {
    const t = rayBox(position, direction, box);
    if (t !== null && t <= lookedAt) { looked = i; lookedAt = t; }
    const d = boxDistance(position, box);
    if (d <= closest) { close = i; closest = d; }
  });
  const qualifies = (i: number) => i >= 0 && i < boxes.length && (i === looked || i === close || (rayBox(position, direction, boxes[i]!) ?? Infinity) <= INSPECT.reach || boxDistance(position, boxes[i]!) <= INSPECT.near);

  // what the viewer is settling on now: being close wins over looking
  const candidate = close >= 0 ? close : looked;
  const since = candidate === state.candidate ? state.since : time;
  let hero = state.hero, lostAt = state.lostAt;
  if (hero >= 0 && qualifies(hero)) lostAt = null;
  else if (hero >= 0) {
    lostAt ??= time;
    if (time - lostAt >= INSPECT.release) { hero = -1; lostAt = null; }
  }
  if (hero < 0 && candidate >= 0 && (candidate === close || time - since >= INSPECT.dwell)) { hero = candidate; lostAt = null; }
  return { hero, candidate, since, lostAt };
}
