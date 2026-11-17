// The void's choice (LIMINAL-GRAMMAR.md, Part 1 and step 6): which mood's room exists, and each mood's form for the void.
// A visitor who finds no room picks one of the three moods; that mood's room then exists until it is forgotten (a spent room
// dispersing, or the owner's key). Pure: no three, no page. AstralRoom.tsx offers the choice; mood-view.ts draws it.
// shortcut: the mood is kept in this browser's storage, as the room's memory is (replacements.ts); it moves to the server with it (step 9).
import { MOODS, type Mood } from './grammar.ts';

const KEY = 'eva.astral.mood';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Storage can be missing (tests, a locked-down browser) or refuse (a full or private profile): then no room is remembered.
const storage = (): Store | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };

/** The mood of the room that exists, or null when there is no room. Storage is data, not trusted: anything but a mood's name is no room. */
export function chosenMood(store: Store | undefined = storage()): Mood | null {
  try { const held = store?.getItem(KEY); return MOODS.find(mood => mood === held) ?? null; } catch { return null; }
}

/** A visitor picked this mood: its room exists from now on. */
export function chooseMood(mood: Mood, store: Store | undefined = storage()): void {
  try { if (MOODS.includes(mood)) store?.setItem(KEY, mood); } catch { /* not remembered */ }
}

/** The room is over: the next visitor finds none, and is offered the three moods. */
export function forgetMood(store: Store | undefined = storage()): void {
  try { store?.removeItem(KEY); } catch { /* nothing was kept */ }
}

/** Each mood's colour cast (LIMINAL-GRAMMAR.md, Part 2), sRGB 0..1. Starting values, to be judged from captures. */
export const MOOD_CASTS: Record<Mood, readonly [number, number, number]> = {
  quiet: [0.8, 0.84, 0.36],     // sickly yellow-green
  uncanny: [0.22, 0.7, 0.68],   // cold teal to blue-green
  eerie: [0.88, 0.86, 0.7],     // dull warm white with green in it
};

// How a mood is shown in the void (owner, 2026-11-17): one body of grains that takes an abstract form for each mood, after the
// owner's two references (a twisted loop of glass ribbon; a sphere parted by an S-shaped seam). The forms are proposals:
//   quiet: the sphere with its seam, whole and still. uncanny: the ribbon, a loop turned through itself.
//   eerie: a ring round nothing (no reference; made to sit with the other two).
// Every form has the same number of grains, so each grain has a place in all three and the body can go from one to another.

/** Grains in the body: a lattice of GRAINS_ALONG rows of GRAINS_ROUND dots on each form. */
const GRAINS_ALONG = 400, GRAINS_ROUND = 100;
export const MOOD_GRAINS = GRAINS_ALONG * GRAINS_ROUND;

/** A form: where each grain sits, within 0.5 of the middle, and the way the surface faces there. */
export interface MoodForm { positions: Float32Array; normals: Float32Array }
type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** A band round a closed curve: `wide` and `thick` are its half-sizes at `u` (0..1 along), and it turns `twist` times on its way round. */
function band(curve: (t: number) => V3, size: (u: number) => readonly [number, number], twist: number, at: (i: number, p: V3, n: V3) => void) {
  for (let i = 0; i < MOOD_GRAINS; i++) {
    const row = Math.floor(i / GRAINS_ROUND), u = row / GRAINS_ALONG, t = u * 2 * Math.PI;
    const phi = ((i % GRAINS_ROUND) + (row % 2) / 2) / GRAINS_ROUND * 2 * Math.PI;   // every other row half a step round: dots in a diamond
    const c = curve(t), ahead = curve(t + 1e-3), behind = curve(t - 1e-3);
    const along = unit([ahead[0] - behind[0], ahead[1] - behind[1], ahead[2] - behind[2]]);
    const side = unit(cross(along, [0, 0, 1])), up = cross(along, side);   // the curves here never run along z
    const turn = twist * t, cos = Math.cos(turn), sin = Math.sin(turn), [wide, thick] = size(u);
    const w: V3 = [cos * side[0] + sin * up[0], cos * side[1] + sin * up[1], cos * side[2] + sin * up[2]];
    const x: V3 = [cos * up[0] - sin * side[0], cos * up[1] - sin * side[1], cos * up[2] - sin * side[2]];
    const a = Math.cos(phi), b = Math.sin(phi);
    at(i, [c[0] + wide * a * w[0] + thick * b * x[0], c[1] + wide * a * w[1] + thick * b * x[1], c[2] + wide * a * w[2] + thick * b * x[2]],
      unit([thick * a * w[0] + wide * b * x[0], thick * a * w[1] + wide * b * x[1], thick * a * w[2] + wide * b * x[2]]));
  }
}

/** The sphere's radius toward `d`: two halves meeting along a seam that swings up and down twice round it, one half standing a little proud. */
function seamed(d: V3): number {
  const from = Math.asin(Math.max(-1, Math.min(1, d[1]))) - 0.75 * Math.sin(2 * Math.atan2(d[2], d[0])) * Math.hypot(d[0], d[2]);
  return 1 + 0.05 * Math.tanh(from / 0.08) - 0.11 * Math.exp(-((from / 0.11) ** 2));
}

/** A mood's form. Pure and the same every time. */
export function moodForm(mood: Mood): MoodForm {
  const positions = new Float32Array(MOOD_GRAINS * 3), normals = new Float32Array(MOOD_GRAINS * 3);
  const at = (i: number, p: V3, n: V3) => { positions.set(p, i * 3); normals.set(n, i * 3); };
  if (mood === 'quiet') {
    for (let i = 0; i < MOOD_GRAINS; i++) {
      const y = 1 - 2 * (i + 0.5) / MOOD_GRAINS, r = Math.sqrt(1 - y * y), d: V3 = [r * Math.cos(i * 2.399963), y, r * Math.sin(i * 2.399963)];
      // the way the surface faces, from two points beside this one
      const e1 = unit(cross(d, Math.abs(y) > 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(d, e1), R = seamed(d);
      const beside = (e: V3): V3 => { const q = unit([d[0] + 0.01 * e[0], d[1] + 0.01 * e[1], d[2] + 0.01 * e[2]]), s = seamed(q); return [q[0] * s - d[0] * R, q[1] * s - d[1] * R, q[2] * s - d[2] * R]; };
      const n = unit(cross(beside(e1), beside(e2)));
      const out = n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < 0 ? -1 : 1;
      at(i, [d[0] * R, d[1] * R, d[2] * R], [n[0] * out, n[1] * out, n[2] * out]);
    }
  } else if (mood === 'uncanny') {
    // a figure of eight in depth, its upper loop the larger; the ribbon turns once on its way round
    band(t => [0.45 * Math.sin(2 * t) * (1 + 0.25 * Math.sin(t)), 0.62 * Math.sin(t), 0.3 * Math.cos(t)], () => [0.17, 0.045], 1, at);
  } else {
    // a ring, tipped toward the viewer so that what it stands round shows, a little uneven in its thickness
    const tip = 1.0, cos = Math.cos(tip), sin = Math.sin(tip);
    band(t => [0.5 * Math.cos(t), 0.5 * Math.sin(t), 0], u => { const r = 0.1 * (1 + 0.22 * Math.sin(6 * Math.PI * u)); return [r, r]; }, 0,
      (i, p, n) => at(i, [p[0], p[1] * cos - p[2] * sin, p[1] * sin + p[2] * cos], [n[0], n[1] * cos - n[2] * sin, n[1] * sin + n[2] * cos]));
  }
  // every form within 0.5 of the middle, so the body is one size whatever it is
  let far = 0;
  for (let i = 0; i < MOOD_GRAINS * 3; i += 3) far = Math.max(far, Math.hypot(positions[i]!, positions[i + 1]!, positions[i + 2]!));
  for (let i = 0; i < MOOD_GRAINS * 3; i++) positions[i] = positions[i]! * 0.5 / far;
  return { positions, normals };
}
