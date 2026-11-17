// What is in the room, and what that makes it (LIMINAL-GRAMMAR.md, Parts 1 and 4).
// Pure: no three.js, no page, no clock, no randomness.

export const MOODS = ['quiet', 'uncanny', 'eerie'] as const;        // quietly liminal, subtly uncanny, eerie absence
export const KINDS = ['office', 'home', 'service'] as const;        // each mood's kind of place, in the same order
export const SURFACES = ['floor', 'tabletop', 'wall', 'ceiling', 'air'] as const;
export const DISCREPANCIES = ['scale', 'repetition', 'displacement', 'absence', 'light', 'era'] as const;
export const POSES = ['rests', 'hovers', 'dropped', 'sunk', 'leans', 'mounted', 'turned'] as const;
export type Mood = typeof MOODS[number];
export type Kind = typeof KINDS[number];
export type Surface = typeof SURFACES[number];
export type Discrepancy = typeof DISCREPANCIES[number];
export type Pose = typeof POSES[number];

/**
 * A thing of the shelf, as far as the grammar needs it. `height` is its true height in metres, `era` a year.
 * `wide` and `deep` are its model's width and depth against its height (1: as wide as it is tall), measured facing its front.
 */
export interface Thing { id: string; height: number; wide: number; deep: number; surfaces: readonly Surface[]; kinds: readonly Kind[]; era: number; repeatable: boolean }
/**
 * What stands in a slot. `thing` null with discrepancy 'absence': it was taken away and its place shows.
 * `factor` is size against true size (1 unless the discrepancy is scale); `copies` is 1 unless it is repetition.
 */
export interface Standing { thing: string | null; discrepancy: Discrepancy | null; pose: Pose; factor: number; copies: number }
/** A place a thing can be. `clear` is its free width, height and depth in metres, the depth along the way a thing there faces. */
export interface Slot { id: string; surface: Surface; anchor: boolean; clear: readonly [number, number, number]; holds: Standing | null }
/**
 * `deviation` is what the recording carries outside its slots; `ambiguity` is the mood's starting figure. `places` is how many
 * places the room has, beside the slot picked, where a copy of a repeated thing can stand; a room that says nothing has none.
 */
export interface BaseRoom { mood: Mood; kind: Kind; era: number; deviation: number; ambiguity: number; slots: readonly Slot[]; places?: number }
/** One change a visitor caused: what now stands in a slot. `at` is milliseconds since 1970, passed in. */
export interface Change extends Standing { slot: string; seed: number; at: number }
export interface Values { familiarity: number; deviation: number; ambiguity: number }
export type State = 'ordinary' | 'quiet' | 'eerie' | 'uncanny' | 'surreal' | 'unreadable';

// ---- Every weight and threshold, in one place. They are the document's starting heuristics
// (Part 4 "Starting weights", Part 1 "The three values") and are to be tuned from captures.

/** Deviation a discrepancy adds. */
const DISCREPANCY_WEIGHT: Record<Discrepancy, number> = {
  scale: 30,
  repetition: 30,
  absence: 20,
  light: 10,
  era: 10,
  // reading: the table gives displacement no weight of its own; the pose that displaces carries it.
  displacement: 0,
};
/** Deviation a pose adds. */
const POSE_WEIGHT: Record<Pose, number> = { rests: 0, dropped: 0, hovers: 20, sunk: 20, mounted: 20, leans: 10, turned: 10 };
/** Deviation of a thing that does not belong to the room's kind of place, whatever EVA chose. */
const FOREIGN_WEIGHT = 10;
/** A thing is from the wrong era when its year is more than this from the room's. */
const ERA_SPAN = 25;
/** Ambiguity each absence adds. */
const AMBIGUITY_STEP = 5;

/** Familiarity under this: unreadable. */
const FAMILIARITY_READABLE = 35;
/** Deviation from this up to DEVIATION_SURREAL: the uncanny band. Under it: ordinary, quiet or eerie. */
const DEVIATION_UNCANNY = 35;
/** Deviation over this: surreal rupture. */
const DEVIATION_SURREAL = 70;
/** Ambiguity over this: liminal rather than ordinary. */
const AMBIGUITY_LIMINAL = 55;
/** Ambiguity from this up, with low deviation: eerie absence. */
const AMBIGUITY_EERIE = 85;

// Bounds on a stored ledger. These four are not in the document: they only keep untrusted input finite.
/** shortcut: a ledger longer than this forgets its oldest changes, and a slot changed only in those returns to the recording; fold the ledger to one change per slot when a room outlives this many. */
const LEDGER_LIMIT = 512;
const FACTOR_MIN = 0.1;
const FACTOR_MAX = 10;
const COPIES_MAX = 32;

const percent = (value: number) => Math.min(100, Math.max(0, value));

/** The ledger played over the recording: what stands in each slot now, and how many absences the changes made. */
function replay(base: BaseRoom, ledger: readonly Change[]) {
  const now = new Map<string, Standing | null>(base.slots.map((slot) => [slot.id, slot.holds]));
  let absences = 0;
  // reading: the "latest" change is the last in the ledger's order, not the one with the greatest `at`.
  for (const { slot, thing, discrepancy, pose, factor, copies } of ledger) {
    if (!now.has(slot)) continue;
    if (discrepancy === 'absence' && now.get(slot)?.discrepancy !== 'absence') absences++;
    now.set(slot, { thing, discrepancy, pose, factor, copies });
  }
  return { now, absences };
}

/** Per slot of the base room: the latest change to it, else what the recording holds. Changes to unknown slots are ignored. */
export function standingNow(base: BaseRoom, ledger: readonly Change[]): Map<string, Standing | null> {
  return replay(base, ledger).now;
}

/**
 * Familiarity, deviation and ambiguity, each 0 to 100, from what is in the room.
 * A thing the shelf does not know (only the recording can hold one; `parseLedger` drops the rest) is taken
 * as the recording's own: it belongs to the room's kind of place and era.
 */
export function roomValues(base: BaseRoom, ledger: readonly Change[], shelf: readonly Thing[]): Values {
  const things = new Map(shelf.map((thing) => [thing.id, thing]));
  const { now, absences } = replay(base, ledger);
  let deviation = base.deviation;
  let anchors = 0;
  let intact = 0;
  for (const slot of base.slots) {
    if (slot.anchor) anchors++;
    const standing = now.get(slot.id);
    if (!standing) continue;
    const thing = standing.thing === null ? undefined : things.get(standing.thing);
    const foreign = thing !== undefined && !thing.kinds.includes(base.kind);

    if (standing.discrepancy && standing.discrepancy !== 'era') deviation += DISCREPANCY_WEIGHT[standing.discrepancy];
    if (standing.thing !== null) deviation += POSE_WEIGHT[standing.pose]; // nothing there, nothing posed
    if (foreign) deviation += FOREIGN_WEIGHT;
    // reading: an era that does not fit counts once, whether EVA chose it or the thing's year brings it.
    if (standing.discrepancy === 'era' || (thing !== undefined && Math.abs(thing.era - base.era) > ERA_SPAN)) deviation += DISCREPANCY_WEIGHT.era;

    // reading: "at its true size" is a factor of 1; a pose or a wrong era does not break an anchor.
    if (slot.anchor && standing.thing !== null && !foreign && standing.factor === 1) intact++;
  }
  return {
    // reading: a room that declares no anchor has none intact.
    familiarity: anchors === 0 ? 0 : percent((100 * intact) / anchors),
    deviation: percent(deviation),
    // Counts the absences changes have made, not the ones standing, so it never falls when a thing returns.
    // reading: the recording's own absences are inside the figure the base room declares. Traces are not in the data yet.
    ambiguity: percent(base.ambiguity + AMBIGUITY_STEP * absences),
  };
}

/** The room's state: familiarity is tested first, then deviation, then ambiguity. */
export function roomState({ familiarity, deviation, ambiguity }: Values): State {
  if (familiarity < FAMILIARITY_READABLE) return 'unreadable';
  if (deviation > DEVIATION_SURREAL) return 'surreal';
  // reading: the table has no row for the uncanny band with ambiguity of 55 or less; it falls to ordinary.
  if (deviation >= DEVIATION_UNCANNY) return ambiguity > AMBIGUITY_LIMINAL ? 'uncanny' : 'ordinary';
  if (ambiguity >= AMBIGUITY_EERIE) return 'eerie';
  return ambiguity > AMBIGUITY_LIMINAL ? 'quiet' : 'ordinary';
}

const among = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

/**
 * A stored ledger (already parsed from JSON) read as untrusted data. Kept: changes to a slot of this room,
 * with a thing of this shelf or none, a known discrepancy or none, a known pose, and numbers in range.
 * Everything else is dropped, entry by entry; each kept change is built afresh from its known fields.
 */
export function parseLedger(value: unknown, base: BaseRoom, shelf: readonly Thing[]): Change[] {
  if (!Array.isArray(value)) return [];
  const slots = new Set(base.slots.map((slot) => slot.id));
  const things = new Set(shelf.map((thing) => thing.id));
  const changes: Change[] = [];
  for (const entry of value.slice(-LEDGER_LIMIT) as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { slot, thing, discrepancy, pose, factor, copies, seed, at } = entry as Record<string, unknown>;
    if (typeof slot !== 'string' || !slots.has(slot)) continue;
    if (thing !== null && (typeof thing !== 'string' || !things.has(thing))) continue;
    if (discrepancy !== null && !among(DISCREPANCIES, discrepancy)) continue;
    if (!among(POSES, pose)) continue;
    // reading: an absence is exactly a slot with no thing, and no thing can carry no other discrepancy.
    if (thing === null ? discrepancy !== null && discrepancy !== 'absence' : discrepancy === 'absence') continue;
    if (typeof factor !== 'number' || !(factor >= FACTOR_MIN && factor <= FACTOR_MAX)) continue;
    if (factor !== 1 && discrepancy !== 'scale') continue;
    if (typeof copies !== 'number' || !Number.isInteger(copies) || copies < 1 || copies > COPIES_MAX) continue;
    if (copies !== 1 && discrepancy !== 'repetition') continue;
    if (typeof seed !== 'number' || !Number.isFinite(seed)) continue;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) continue;
    changes.push({ slot, thing, discrepancy, pose, factor, copies, seed, at });
  }
  return changes;
}
