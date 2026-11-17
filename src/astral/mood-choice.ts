// The void's choice (LIMINAL-GRAMMAR.md, Part 1 and step 6): which mood's room exists, and each mood's small room for the void.
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
const CAST = 0.8;            // how far a small room's colours go toward its mood's cast
/** A small room has at most this many of its base room's points, and is drawn this many times a menu choice's size. Starting values. */
export const MOOD_ROOM_POINTS = 24000, MOOD_ROOM_SIZE = 1.6;
const BEHIND = 1;            // metres of the room kept behind the spot where the visitor arrives
const TRIM = 0.005;          // the share of points left out at each end of each axis: the few far-flung ones, which would shrink the rest

const light = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * A base room as its mood's small room in the void: a thinned copy, each point as bright as it was, its colour taken toward the cast.
 * It is the room ahead of where the visitor arrives, when the room says where that is, without its few far-flung points.
 */
export function moodRoom(room: MenuPoints & { arrival?: { position: readonly number[]; lookAt: readonly number[] } }, mood: Mood, most = MOOD_ROOM_POINTS): MenuPoints {
  const limit = Math.max(0, Math.floor(most)), from = room.arrival?.position, to = room.arrival?.lookAt;
  const ahead = from && to ? [0, 1, 2].map(a => to[a]! - from[a]!) : null, far = ahead ? Math.hypot(...ahead) || 1 : 1;
  // candidates, evenly through the room's points whatever their order; then the trim, on what is left of them
  let taken: number[] = [];
  for (let k = 0, some = Math.min(room.count, limit * 8); k < some; k++) {
    const j = Math.floor(k * room.count / some) * 3;
    if (!ahead || [0, 1, 2].reduce((sum, a) => sum + (room.positions[j + a]! - from![a]!) * ahead[a]!, 0) / far > -BEHIND) taken.push(j);
  }
  for (let a = 0; a < 3; a++) {
    const along = Float32Array.from(taken, j => room.positions[j + a]!).sort();
    const low = along[Math.floor(along.length * TRIM)]!, high = along[Math.ceil(along.length * (1 - TRIM)) - 1]!;
    taken = taken.filter(j => room.positions[j + a]! >= low && room.positions[j + a]! <= high);
  }
  const count = Math.min(taken.length, limit), cast = MOOD_CASTS[mood], castLight = light(...cast);
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), normals = room.normals && new Float32Array(count * 3);
  for (let o = 0; o < count; o++) {
    const j = taken[Math.floor(o * taken.length / count)]!;
    const at = light(room.colors[j]!, room.colors[j + 1]!, room.colors[j + 2]!) / castLight;
    for (let a = 0; a < 3; a++) {
      positions[o * 3 + a] = room.positions[j + a]!;
      colors[o * 3 + a] = Math.min(1, room.colors[j + a]! + (cast[a]! * at - room.colors[j + a]!) * CAST);
      if (normals) normals[o * 3 + a] = room.normals![j + a]!;
    }
  }
  return normals ? { count, positions, colors, normals } : { count, positions, colors };
}
