// The object change: what stands in a hero's box leaves and the object that replaces it arrives, shatter then spiral (the owner's
// pick, 2026-11-17). The leaving (Gather's AWAY style SHATTER) and the arriving (its travel SPIRAL) are adapted from Gather 聚 v17
// by DAO (be-of-dao.com), used under the owner's Patreon Source licence. point-field.ts calls the pieces here; nothing else knows
// about them.
import { POSES, type Pose } from './grammar.ts';
import { COPIES_MAX, COPIES_MIN, SCALE_FACTORS, type arrivalOf } from './grammar-decide.ts';
import { boxDistance, type Box, type Vec3 } from './inspect.ts';
import { POSE_OTHER } from './object-points.ts';
import type { PointCloud } from './types.ts';

export const SWAP_SECONDS = 5;
const SWAP_SPREAD = 0.30;       // shares of the change: between the first chunk letting go and the last,
const SWAP_LEAVE = 0.35;        // one grain leaving,
const SWAP_BACK = 0.35;         // and one grain of the new object arriving. They add up to 1
const SWAP_REACH = 1.0;         // how far the leaving grains go, in halves of the hero's longest side
const SWAP_CHUNKS = 2.5;        // chunks per half of the hero's longest side

// The arrivals (LIMINAL-GRAMMAR.md, the pose table). 'assembles' is the change alone. In the others the thing assembles where its
// move starts from, then moves into its pose. Seconds and curves are starting values, to tune from the running page.
export type Arrival = ReturnType<typeof arrivalOf>;
const MOVES: Record<Arrival, { seconds: number; drop: boolean; whole: boolean } | null> = {
  assembles: null,
  rises: { seconds: 3, drop: false, whole: false },         // eases up from where it would rest
  falls: { seconds: 0.9, drop: true, whole: false },        // drops from its hover, lands, rebounds once
  'pushes-up': { seconds: 4, drop: false, whole: true },    // comes whole through the surface, cut off at it, while the old thing leaves
  tips: { seconds: 1.4, drop: true, whole: false },         // stands upright, then falls into its lean
  turns: { seconds: 3, drop: false, whole: false },         // faces the room, then turns away
};
const MOVE_AT = 0.9;            // a move starts when this share of the assembling has run: the last grains land as the thing sets off
const PUSH_AT = 0.3;            // and a thing that comes whole starts at this share, as the old thing goes
const MOVE_LOOSE = 0.5;         // 'grains': the share of a move between the first grain setting off and the last
const DROP_LANDS = 0.62;        // a drop: the share of the move at which it lands; the rest is one rebound,
const DROP_REBOUND = 0.05;      // this share of the way back up

/**
 * How an arriving thing gets into its pose (object-points.ts works it out). Its grains are where it ends. When the move starts the
 * thing is turned by `angle` radians about `axis` through `centre`, and shifted by `offset` metres; the move undoes both.
 */
export interface Move {
  readonly arrival: Arrival;
  readonly centre: Vec3; readonly axis: Vec3; readonly angle: number; readonly offset: Vec3;
  /** The surface a sunk thing is cut off at while it changes: an arriving grain with dot(xyz, its place) under w is not drawn. */
  readonly cut: readonly [number, number, number, number] | null;
  /** A variant, not chosen: each grain makes the move at its own moment, instead of the thing as one body. */
  readonly loose?: boolean;
  /** What stood there is this same thing (a hover put right): nothing leaves and nothing assembles, it only moves. */
  readonly carried?: boolean;
}

/** A change's parts in seconds: the pair (old thing leaving, new assembling), when the move starts, how long it takes, and all of it. */
export function swapTimes(move?: Move | null): { pair: number; from: number; move: number; total: number } {
  const how = move ? MOVES[move.arrival] : null;
  if (!how) return { pair: SWAP_SECONDS, from: 0, move: 0, total: SWAP_SECONDS };
  const pair = move!.carried ? 0 : SWAP_SECONDS, from = pair * (how.whole ? PUSH_AT : MOVE_AT);
  return { pair, from, move: how.seconds, total: Math.max(pair, from + how.seconds) };
}

/** The shader's uniforms for a move, by name; with none, a move that changes nothing. uSwapMove's first figure is the frame's (swapNow). */
export function moveUniforms(move?: Move | null): Record<'uSwapMove' | 'uSwapFrom' | 'uSwapTurn' | 'uSwapMid' | 'uSwapCut', number[]> {
  const how = move ? MOVES[move.arrival] : null;
  if (!move || !how) return { uSwapMove: [1, 0, 0, 0], uSwapFrom: [0, 0, 0], uSwapTurn: [0, 1, 0, 0], uSwapMid: [0, 0, 0], uSwapCut: [0, 0, 0, -1] };
  return {
    uSwapMove: [0, how.drop ? 1 : 0, move.loose ? MOVE_LOOSE : 0, how.whole || move.carried ? 1 : 0],
    uSwapFrom: [...move.offset], uSwapTurn: [...move.axis, move.angle], uSwapMid: [...move.centre], uSwapCut: [...(move.cut ?? [0, 0, 0, -1])],
  };
}

/** One object change: which hero, how the new thing gets into its pose, and either running since `at` (progress null) or held at `progress`. */
export interface Swap { readonly hero: number; readonly progress: number | null; readonly at: number; readonly move?: Move | null }
export const SWAP_NONE: Swap = Object.freeze({ hero: -1, progress: null, at: 0 });
/** What a laid floor's grains are marked with (aObj): an object of no hero, so no change is ever theirs and a replaced hero's box does not take them. */
export const SWAP_FLOOR = 255;

/**
 * What stands for a hero after a change: the grains of a thing, or of several copies of it in several places of the room, or the
 * floor an absent thing leaves. `parts`: where it is more than one thing, how many of its grains each is, in order, and the
 * middle each one's change is drawn about (absent: the hero's box's own, for all of it).
 */
export type Stood = PointCloud & { parts?: readonly { count: number; mid: Vec3 }[] };

/** What createPointField adds to PointField for the change. */
export interface SwapControl {
  /**
   * Hero `hero` is replaced by `object`, whose grains may stand anywhere in the room. What stands for that hero now shatters and
   * leaves, and they spiral in, then make `move` into their pose, from now over swapTimes(move).total seconds (progress null) or
   * held at `progress` 0..1 of that. Every other grain is left exactly as it is. False, and nothing changes, when any of it is
   * invalid or a new room is on its way.
   */
  replaceHero(hero: number, object: Stood, progress: number | null, move?: Move | null): boolean;
  /**
   * The floor of hero `hero`'s slot, as a cloud of its own: laid at once and left alone until the room is set again. No change
   * takes it away, brings it or moves it, whatever stands or sinks there. False, and nothing changes, when that hero already has
   * one, when the floor is empty, or without a room.
   */
  layFloor(hero: number, floor: PointCloud): boolean;
  /** How far the room steps back behind what is shown in front of it (the menu), 0..1. It eases, and only shows while a hero is inspected. */
  setStepBack(amount: number): void;
}

/**
 * ?swap=<hero index>,<progress>[,<pose>[,<way>[,<thing>[,<wrong>]]]]: a change held still, for matching captures.
 * `progress` is 0..1 of the whole change, or `run` to let it run. `pose` is one of the grammar's (default rests). `way` is the
 * pose's other way (POSE_OTHER), `grains` (each grain moves at its own moment), both joined by + (which an address gives as a
 * space), or nothing. `thing` is a shelf id (default: the shelf's first). `wrong` is a discrepancy: `x` and one of the allowed
 * sizes (x2.5: wrong scale), `n` and a number of copies (n6: repetition), or `gone` (absence: the thing taken away). Null
 * unless every part given is valid.
 */
export function parseSwap(search: string): { hero: number; progress: number | null; pose: Pose; other: boolean; loose: boolean; thing: string | null;
  factor: number; copies: number; gone: boolean } | null {
  const parts = new URLSearchParams(search).get('swap')?.split(',') ?? [];
  if (parts.length < 2 || parts.length > 6 || parts.slice(0, 3).some(part => part.trim() === '')) return null;
  const wrong = parts[5], factor = wrong?.[0] === 'x' ? Number(wrong.slice(1)) : 1, copies = wrong?.[0] === 'n' ? Number(wrong.slice(1)) : 1, gone = wrong === 'gone';
  if (wrong !== undefined && !(SCALE_FACTORS as readonly number[]).includes(factor) && !(Number.isInteger(copies) && copies >= COPIES_MIN && copies <= COPIES_MAX) && !gone) return null;
  const hero = Number(parts[0]), progress = parts[1] === 'run' ? null : Number(parts[1]);
  const pose = (parts[2] ?? 'rests') as Pose, ways = (parts[3] ?? '').split(/[ +]/).filter(Boolean), thing = parts[4] ?? null;
  if (!Number.isInteger(hero) || hero < 0) return null;
  if (!(progress === null || (progress >= 0 && progress <= 1)) || !POSES.includes(pose)) return null;
  if (new Set(ways).size !== ways.length || ways.some(way => way !== 'grains' && way !== POSE_OTHER[pose])) return null;
  if (thing !== null && !/^[a-z0-9-]{1,40}$/.test(thing)) return null;
  return { hero, progress, pose, other: ways.some(way => way !== 'grains'), loose: ways.includes('grains'), thing, factor, copies, gone };
}

/** The hero a change acts on: the one being inspected, else the nearest to the viewer; -1 in a room without heroes. */
export function swapHero(inspected: number, heroes: readonly Box[], position: Vec3): number {
  if (Number.isInteger(inspected) && inspected >= 0 && inspected < heroes.length) return inspected;
  let nearest = -1, least = Infinity;
  heroes.forEach((box, i) => { const d = boxDistance(position, box); if (d < least) { least = d; nearest = i; } });
  return nearest;
}

/**
 * A change at `time`, for the shader: hero (-1 when nothing is changing), how far through the leaving and assembling 0..1 (uSwap),
 * and how far through the move 0..1 (uSwapMove.x). A running change ends by itself; a held one stays.
 */
export function swapNow(swap: Swap, time: number): [number, number, number] {
  if (swap.hero < 0) return [-1, 0, 1];
  const times = swapTimes(swap.move), s = swap.progress ?? (time - swap.at) / times.total;
  if (!(s >= 0) || (swap.progress === null && s >= 1)) return [-1, 0, 1];
  const T = Math.min(1, s) * times.total;   // a held change's clock is its progress, so two captures of it match
  const share = (from: number, length: number) => length > 0 ? Math.min(1, Math.max(0, (T - from) / length)) : 1;
  return [swap.hero, share(0, times.pair), share(times.from, times.move)];
}

const f = (x: number) => x.toFixed(4);

/**
 * Vertex shader, before main(): swapGrain, called for every grain. Needs the field's uHeroMin/uHeroMax/uHeroN, h01, ease, rot and
 * PI. It works in Gather's picture space: here the hero's box, its longest side from -1 to 1.
 * shortcut: Gather's picture axes are taken as the room's (x across, y up, z depth), which is how the arrival view sees it; turn the
 * frame to the viewer if a change seen from the side reads wrong.
 */
export const SWAP_VS = /* glsl */ `
uniform vec2 uSwap;        // which hero (-1: none), how far through the leaving and assembling 0..1
uniform vec4 uSwapMove;    // the arriving thing's move into its pose: how far through it 0..1, 1 when it drops (else it eases), the share of it the grains set off over (0: as one body), 1 when the thing comes whole instead of assembling
uniform vec3 uSwapFrom;    // when the move starts the thing is shifted by this, in metres,
uniform vec4 uSwapTurn;    // and turned about this axis by this angle,
uniform vec3 uSwapMid;     // through this point
uniform vec4 uSwapCut;     // an arriving grain with dot(xyz, its place) under w is not drawn: the surface a sunk thing is cut off at
uniform float uSwapOwn;    // 1 when it is the room's own grains that leave
uniform float uHeroOut[MAX_HERO];   // 1 once the room's own grains in that hero's box have been replaced
uniform float uStepBack;   // how far the room steps back behind the menu, 0..1
in float aObj;             // 0, or absent: one of the room's own grains. k+1: a grain of the object that replaced hero k. -(k+1): of that object as it leaves. SWAP_FLOOR: of a laid floor, which no change touches
in vec3 aMid;              // for an object's grain: the middle its change is drawn about (its own copy's place, where the object is several copies)
const vec2 SWAP_WIND = vec2(0.45, 0.2);   // Gather's drift direction, fixed
float hf(vec3 v) { return fract(sin(dot(v, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void swapGrain(uint i, inout vec3 p, inout float alive, inout float wsz) {
  // Whose grain this is. One of an object that replaced a hero leaves or arrives while that hero changes. One of the room's own, in
  // a hero's box that has been replaced, leaves in that hero's first change and is gone ever after.
  int k = int(uSwap.x), ok = int(abs(aObj) + 0.5) - 1;
  float role = 0.0;          // 1: it leaves. 2: it arrives
  if (ok >= 0) role = ok != k ? 0.0 : aObj < 0.0 ? 1.0 : 2.0;
  else for (int h = 0; h < MAX_HERO; h++) {
    if (h >= uHeroN) break;
    if (uHeroOut[h] > 0.5 && all(greaterThanEqual(position, uHeroMin[h])) && all(lessThanEqual(position, uHeroMax[h]))) {
      if (h == k && uSwapOwn > 0.5) role = 1.0; else alive = 0.0;
    }
  }
  if (role < 0.5 || k < 0 || k >= uHeroN) return;
  vec3 lo = uHeroMin[k], hi = uHeroMax[k];
  vec3 mid = ok >= 0 ? aMid : 0.5 * (lo + hi); float S = 0.5 * max(hi.x - lo.x, max(hi.y - lo.y, hi.z - lo.z));
  vec3 a = (position - mid) / S, q = a;
  float rd = h01(i * 2654435761u + 977u), r4 = h01(i * 17u + 113u);
  // the chunks: the object cracks along a warped grid
  vec3 cell = floor(a * ${f(SWAP_CHUNKS)} + 0.45 * sin(a.yzx * 9.0)), cen = (cell + 0.5) / ${f(SWAP_CHUNKS)};
  float c1 = hf(cell), c2 = hf(cell + 17.3), c3 = hf(cell + 41.9), c4 = hf(cell + 73.1);
  // Each chunk runs the change on its own clock, so some of the old object is still leaving while some of the new has arrived.
  float t = (uSwap.y - ${f(SWAP_SPREAD)} * c2) / ${f(SWAP_LEAVE)};   // 0: an old grain lets go. 1: it is gone, and a new one sets out
  float gone = clamp(t, 0.0, 1.0), m = clamp((t - 1.0) * ${f(SWAP_LEAVE / SWAP_BACK)}, 0.0, 1.0);
  if (role > 1.5 && uSwapMove.w > 0.5) m = 1.0;   // a thing that comes whole: every grain in its place from the first

  // Leaving (Gather's SHATTER, one life instead of its repeating ones): each chunk leaves whole, tumbling slowly as it goes, and falls
  float tr = gone * sqrt(gone), szK = 1.0 - 0.45 * gone;
  float rc = ${f(SWAP_REACH)} * (0.6 + 0.8 * c3), an = tr * (1.5 + 3.0 * c4), cA = cos(an), sA = sin(an);
  vec3 ax = normalize(vec3(c1, c4, c2) - 0.5 + 0.001), l = a - cen;
  l = l * cA + cross(ax, l) * sA + ax * dot(ax, l) * (1.0 - cA);
  vec3 dir = normalize(vec3(SWAP_WIND, 0.0) * 1.2 + (vec3(c2, c4, c1) - 0.5) * vec3(1.0, 1.0, 1.4));
  q = cen + l + dir * rc * tr; q.y -= tr * tr * rc * 0.5;
  float there = 1.0 - smoothstep(0.3, 1.0, gone);

  // Arriving (Gather's SPIRAL): a grain of the new object comes from where a grain leaving its own place would have gone, wheeling
  // round the middle on the way, and appears as it comes; until it sets out it is not there. A grain that left never comes back.
  if (role > 1.5) {
    there = 0.0;
    if (m > 0.0) {
      float e = ease(m), hump = sin(PI * e);
      vec3 at = mix(q, a, e);
      vec2 w = rot(at.xz, hump * (1.6 + 1.2 * rd) * (rd > 0.5 ? 1.0 : 0.85));
      q = vec3(w.x, at.y, w.y + hump * 0.15); szK = mix(szK, 1.0, e); there = smoothstep(0.0, 0.35, e);
    }
  }
  p += (q - a) * S; alive *= there; wsz *= szK;
  if (role > 1.5) {
    // The arrival's move: the thing has assembled where the move starts from, and now gets into its pose, as one body or each
    // grain at its own moment. A drop accelerates, lands and rebounds once; anything else eases.
    // shortcut: the thing turns about its middle and is shifted in a straight line, so a tipping thing's foot slides a little
    // instead of staying where it stands; turn it about the edge it stands on if that shows.
    // shortcut: its normals are not turned with it, so while it moves it is lit as it will be where it ends; turn aNorm too if a
    // turning thing's light reads wrong.
    float g = clamp((uSwapMove.x - uSwapMove.z * r4) / (1.0 - uSwapMove.z), 0.0, 1.0), s = g / ${f(DROP_LANDS)}, b = (g - ${f(DROP_LANDS)}) / ${f(1 - DROP_LANDS)};
    float left = uSwapMove.y < 0.5 ? 1.0 - ease(g) : s < 1.0 ? 1.0 - s * s : ${f(DROP_REBOUND)} * sin(PI * b) * (1.0 - b);
    vec3 d = p - uSwapMid, mx = uSwapTurn.xyz; float ma = uSwapTurn.w * left, cM = cos(ma), sM = sin(ma);
    p = uSwapMid + d * cM + cross(mx, d) * sM + mx * dot(mx, d) * (1.0 - cM) + uSwapFrom * left;
    if (dot(uSwapCut.xyz, p) < uSwapCut.w) alive = 0.0;
  }
}
`;
