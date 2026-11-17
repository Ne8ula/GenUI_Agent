// The void's choice (LIMINAL-GRAMMAR.md, Part 1 and step 6): which mood's room exists, and each mood's figure for the void.
// A visitor who finds no room picks one of the three moods; that mood's room then exists until it is forgotten (a spent room
// dispersing, or the owner's key). Pure: no three, no page. AstralRoom.tsx offers the choice; menu-view.ts draws it.
// shortcut: the mood is kept in this browser's storage, as the room's memory is (replacements.ts); it moves to the server with it (step 9).
import { MOODS, type Mood } from './grammar.ts';
import type { MenuPoints } from './menu.ts';

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

/**
 * How a mood is shown in the void: an abstract figure of points in its cast, not a small room (owner, 2026-11-17). The owner is
 * choosing between two sets, ?moods=forms|grid. Delete the one not kept.
 * forms: three unlike shapes. Quiet is a floor and a ceiling with nothing between; uncanny is one cube repeated inside itself at the
 *   wrong sizes; eerie is a hollow shell, opened, with nothing in it.
 * grid: nine cubes with the middle one wrong, one way for each mood: lifted and turned, far too large, or gone with its place showing.
 */
export const MOOD_FIGURES = ['forms', 'grid'] as const;
export type MoodFigures = typeof MOOD_FIGURES[number];
export function moodFigures(search: string): MoodFigures {
  const asked = new URLSearchParams(search).get('moods');
  return MOOD_FIGURES.find(figures => figures === asked) ?? 'forms';
}

/** A figure has at most this many points, and is drawn this many times a menu choice's size. Starting values. */
export const MOOD_POINTS = 12000, MOOD_SIZE = 1.3;
const STEP = 0.02;   // between a figure's dots, where the figure is about 1 across
/** The eerie shell's opening: the way it faces (a unit vector, before the figure is laid down), and how far toward it the shell is kept. */
export const SHELL_OPEN = [0.6, 0.64, 0.48] as const, SHELL_KEPT = 0.3;

/** A mood's figure as points, with normals so that its far side is drawn dimmer as it turns. */
export function moodPoints(mood: Mood, figures: MoodFigures = 'forms'): MenuPoints {
  const at: number[] = [], rgb: number[] = [], out: number[] = [], cast = MOOD_CASTS[mood];
  // Every figure is laid down an eighth of a turn round: menu-view.ts sizes a choice by its box, and a square thing's box is then
  // as wide as the thing is from corner to corner, so it stays inside its brackets while it turns.
  const dot = (x: number, y: number, z: number, nx: number, ny: number, nz: number, shade = 1) => {
    at.push((x + z) * Math.SQRT1_2, y, (z - x) * Math.SQRT1_2); out.push((nx + nz) * Math.SQRT1_2, ny, (nz - nx) * Math.SQRT1_2);
    rgb.push(cast[0] * shade, cast[1] * shade, cast[2] * shade);
  };
  /** A cube of side `side` about `c`, turned `turn` round the upright axis: its six faces as dots, or only its twelve edges. */
  const cube = (c: readonly [number, number, number], side: number, turn = 0, edges = false) => {
    const n = Math.max(2, Math.round(side / STEP)), cos = Math.cos(turn), sin = Math.sin(turn);
    for (let axis = 0; axis < 3; axis++) for (const way of [-1, 1]) for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      if (edges && i % n && j % n) continue;
      const p = [0, 0, 0], m = [0, 0, 0];
      p[axis] = way * side / 2; p[(axis + 1) % 3] = side * (i / n - 0.5); p[(axis + 2) % 3] = side * (j / n - 0.5); m[axis] = way;
      dot(c[0] + p[0]! * cos + p[2]! * sin, c[1] + p[1]!, c[2] - p[0]! * sin + p[2]! * cos, m[0]! * cos + m[2]! * sin, m[1]!, -m[0]! * sin + m[2]! * cos);
    }
  };
  if (figures === 'grid') {
    const PITCH = 0.34, SIDE = 0.2;
    for (const gx of [-1, 0, 1]) for (const gz of [-1, 0, 1]) if (gx || gz) cube([gx * PITCH, SIDE / 2, gz * PITCH], SIDE);
    if (mood === 'quiet') cube([0, SIDE / 2 + 0.3, 0], SIDE, 0.6);            // displaced: it hovers, turned
    else if (mood === 'uncanny') cube([0, 0.23, 0], 0.46);                     // wrong scale
    else for (let t = -SIDE / 2; t <= SIDE / 2 + 1e-6; t += STEP) for (const e of [-SIDE / 2, SIDE / 2]) {   // absent: where it stood
      dot(t, 0, e, 0, 1, 0, 0.5); dot(e, 0, t, 0, 1, 0, 0.5);
    }
  } else if (mood === 'quiet') {
    // a floor and a ceiling of ordered dots, facing each other, and nothing between: the room is waiting
    for (let x = -0.5; x <= 0.5 + 1e-6; x += STEP * 1.5) for (let z = -0.5; z <= 0.5 + 1e-6; z += STEP * 1.5) { dot(x, -0.2, z, 0, 1, 0); dot(x, 0.2, z, 0, -1, 0); }
  } else if (mood === 'uncanny') {
    // one cube, repeated inside itself, each smaller and turned a little further: the same thing at the wrong sizes
    [1, 0.66, 0.4, 0.2].forEach((side, i) => cube([0, 0, 0], side, i * 0.35, true));
  } else {
    // a round shell, open on one side, and nothing inside: prepared, and nobody there
    const N = 6000;
    for (let k = 0; k < N; k++) {
      const y = 1 - 2 * (k + 0.5) / N, r = Math.sqrt(1 - y * y), x = r * Math.cos(k * 2.399963), z = r * Math.sin(k * 2.399963);
      if (x * SHELL_OPEN[0] + y * SHELL_OPEN[1] + z * SHELL_OPEN[2] < SHELL_KEPT) dot(x / 2, y / 2, z / 2, x, y, z);
    }
  }
  return { count: at.length / 3, positions: Float32Array.from(at), colors: Float32Array.from(rgb), normals: Float32Array.from(out) };
}
