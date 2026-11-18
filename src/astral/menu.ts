// The visitor's menu of replacements for a hero: which choice is selected, where each choice sits in the ring round the eye (the
// owner's pick of three arrangements, 2026-11-17), "nothing", and the two entries EVA will not do. Pure: no three, no page.
// menu-view.ts draws it; AstralRoom.tsx feeds it the keys and the mouse.

/** Mouse travel that moves the selection one choice along, as a share of the page's width. */
export const MENU_STEP = 1 / 24;

/** The open menu: on which hero, which of `count` choices is selected, and mouse travel not yet spent on a step (shares of the page's width). */
export interface MenuState { readonly hero: number; readonly index: number; readonly count: number; readonly carry: number }

/** The menu opened on a hero with the first choice selected; null when there is no such hero or nothing to choose. */
export function menuOpen(hero: number, count: number): MenuState | null {
  return Number.isInteger(hero) && hero >= 0 && Number.isInteger(count) && count > 0 ? { hero, index: 0, count, carry: 0 } : null;
}

/** One choice along (by 1) or back (by -1); past either end it comes round to the other. */
export function menuStep(state: MenuState, by: number): MenuState {
  const steps = Number.isFinite(by) ? Math.trunc(by) : 0;
  return { ...state, index: (((state.index + steps) % state.count) + state.count) % state.count, carry: 0 };
}

/** The mouse moved `dx` across the page (a share of its width, right positive): every MENU_STEP of travel is one choice along. */
export function menuDrag(state: MenuState, dx: number): MenuState {
  if (!Number.isFinite(dx)) return state;
  const carry = state.carry + dx, steps = Math.trunc(carry / MENU_STEP);
  return steps ? { ...menuStep(state, steps), carry: carry - steps * MENU_STEP } : { ...state, carry };
}

/** How far choice `i` is from `selected`, going round the choices the short way; signed. `selected` may lie between two while it eases. */
export function menuTurn(i: number, selected: number, count: number): number {
  const d = (((i - selected) % count) + count) % count;
  return d > count / 2 ? d - count : d;
}

/** Where a choice sits from the eye's place, and how large, in halves of the frame's height (y up); `light` 0..1. */
export interface MenuSlot { x: number; y: number; size: number; light: number }

/**
 * Each choice's slot: the choices circle the eye, and the circle turns to bring the selected one below it. The selected one is
 * always the largest and the brightest.
 */
export function menuLayout(count: number, selected: number): MenuSlot[] {
  return Array.from({ length: count }, (_, i) => {
    const d = menuTurn(i, selected, count), near = Math.max(0, 1 - Math.abs(d)), angle = -Math.PI / 2 + d * 2 * Math.PI / count;
    return { x: 0.52 * Math.cos(angle), y: 0.52 * Math.sin(angle), size: 0.24 * (1 + 0.6 * near), light: 0.3 + 0.7 * near };
  });
}

/** Entries EVA will not do, after the shelf's objects in the menu. Her lines for each are in tease.ts (REFUSALS). */
export const MENU_REFUSED = ['door', 'eye'] as const;
export type MenuRefused = typeof MENU_REFUSED[number];

/** What a choice looks like in the menu: its own points. A PointCloud is one. */
export interface MenuPoints { count: number; positions: Float32Array; colors: Float32Array; normals?: Float32Array }

/** "Nothing": the entry that takes a slot's thing away and puts nothing there. It comes after the shelf's objects, before the refused entries. */
export const MENU_NOTHING = 'nothing';

/** An entry that is no object of the shelf, as points: a door standing ajar in its frame, a square-pupilled eye, or, for
 * "nothing", the bare edges of an empty box. */
export function entryPoints(id: MenuRefused | typeof MENU_NOTHING): MenuPoints {
  const at: number[] = [], rgb: number[] = [];
  const dot = (x: number, y: number, z: number, c: readonly number[]) => { at.push(x, y, z); rgb.push(c[0]!, c[1]!, c[2]!); };
  const STEP = 0.012;
  if (id === MENU_NOTHING) {
    // the twelve edges of the space a thing would take, sparse and pale, and nothing in it
    const pale = [0.7, 0.7, 0.66];
    for (let t = -0.5; t <= 0.5; t += STEP * 3) for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) { dot(t, a, b, pale); dot(a, t, b, pale); dot(a, b, t, pale); }
  } else if (id === 'door') {
    const pale = [0.82, 0.8, 0.72], dim = [0.5, 0.49, 0.45];
    for (const z of [-0.04, 0.04]) for (let t = 0; t <= 1; t += STEP) for (const w of [0, 0.02, 0.04]) {
      dot(-0.27 - w, t, z, pale); dot(0.27 + w, t, z, pale);                // the jambs
      if (t <= 0.62) dot(-0.31 + t, 1 + w, z, pale);                          // the head
    }
    // the leaf, hinged on the left and standing ajar, with its handle
    const c = Math.cos(0.7), s = Math.sin(0.7);
    for (let u = 0; u <= 0.54; u += STEP * 1.5) for (let y = 0; y <= 1; y += STEP * 1.5) dot(-0.27 + u * c, y, u * s, dim);
    for (let a = 0; a < 6.28; a += 0.4) dot(-0.27 + 0.46 * c + 0.015 * Math.cos(a), 0.48 + 0.015 * Math.sin(a), 0.46 * s + 0.02, pale);
  } else {
    const red = [0.95, 0.1, 0.06], deep = [0.6, 0.04, 0.03];
    for (const z of [-0.03, 0, 0.03]) {
      for (let x = -0.5; x <= 0.5; x += STEP / 2) for (const w of [0, 0.012]) {      // the lids
        const lid = (0.26 - w) * (1 - 4 * x * x);
        dot(x, lid, z, red); dot(x, -lid, z, red);
      }
      for (let a = 0; a < 6.283; a += 0.03) dot(0.19 * Math.cos(a), 0.19 * Math.sin(a), z, deep);   // the iris
      for (let x = -0.07; x <= 0.07; x += STEP) for (let y = -0.07; y <= 0.07; y += STEP) dot(x, y, z, red);   // the square pupil
    }
  }
  return { count: at.length / 3, positions: Float32Array.from(at), colors: Float32Array.from(rgb) };
}
