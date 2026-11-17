// What EVA allows, and how a thing the visitor picked enters the room (LIMINAL-GRAMMAR.md, Part 1: "What EVA allows" and
// "The visitor picks what, EVA picks how"). Pure: no three.js, no page, no clock, no Math.random. The menu's pick calls it (AstralRoom.tsx).
import { roomValues, standingNow } from './grammar.ts';
import type { BaseRoom, Change, Discrepancy, Mood, Pose, Slot, Standing, Surface, Thing } from './grammar.ts';

export type Refusal = 'unknown' | 'spent' | 'anchor' | 'fit';
export type Decision = { ok: true; changes: Change[] } | { ok: false; refusal: Refusal };

// ---- The document's (Part 1). The weights themselves are in grammar.ts and are read through roomValues, never copied here.
/** A discrepancy of this weight or more is a strong one; only one stands at a time. */
const STRONG = 20;
/** Deviation over this: the room is spent. */
const SPENT = 70;
/** Familiarity never goes under this. */
const ANCHOR = 65;
/** The discrepancies each mood prefers. Light is not a thing's to carry (step 10), and "traces of use" has no name in the data yet. */
const PREFERS: Record<Mood, readonly Discrepancy[]> = { quiet: ['displacement', 'light'], uncanny: ['scale', 'repetition'], eerie: ['absence'] };

// ---- Proposals, the owner's to change. None of these is in the document.
/** Wrong scale: the sizes allowed, against true size. Larger only (owner, 2026-11-17): a thing made small reads as something
 * little on the floor, not as wrong. Exported with the copies' figures: the development switch uses the same. */
export const SCALE_FACTORS = [2.5, 4, 6] as const;
/** A scaled thing is never shorter than this, in metres, or the room's dots lose it. */
const SCALE_SMALLEST = 0.15;
/** Repetition: how many of one thing. One stands in the slot picked and the others in other places of the room, never side by
 * side or stacked (owner, 2026-11-17), so the slot needs room for one only. */
export const COPIES_MIN = 3;
export const COPIES_MAX = 6;
/** Air under a hovering thing, in metres. Exported with the next two: the placement (object-points.ts) stands a thing by the same figures. */
export const HOVER_GAP = 0.3;
/** The share of a sunk thing that is below the floor or inside the wall. */
export const SUNK_SHARE = 0.4;
/** A leaning thing is tipped back, away from the way its slot faces, by this many degrees. */
export const LEAN_TILT = 15;
/**
 * The height and depth a thing tipped back by LEAN_TILT takes, against its own. Not one figure: both depend on how deep the thing
 * is against its height (`deep`). It is the room its box takes, so never less than the room the thing itself takes.
 */
const LEAN_ROOM = (deep: number) => {
  const tilt = LEAN_TILT * Math.PI / 180;
  return { tall: Math.cos(tilt) + deep * Math.sin(tilt), deep: Math.cos(tilt) + Math.sin(tilt) / deep };
};

const ARRIVALS = { rests: 'assembles', hovers: 'rises', dropped: 'falls', sunk: 'pushes-up', leans: 'tips', mounted: 'assembles', turned: 'turns' } as const;

/** How a thing arrives in a pose (Part 1, the pose table). */
export function arrivalOf(pose: Pose): 'assembles' | 'rises' | 'falls' | 'pushes-up' | 'tips' | 'turns' {
  return ARRIVALS[pose];
}

/** A room whose deviation is over 70 accepts nothing more. */
export function roomSpent(base: BaseRoom, ledger: readonly Change[], shelf: readonly Thing[]): boolean {
  return roomValues(base, ledger, shelf).deviation > SPENT;
}

const onGround = (surface: Surface) => surface === 'floor' || surface === 'tabletop';

/**
 * The poses a thing can arrive in on a surface, before its size is checked. 'dropped' is never an arrival: it is how a hover is put right.
 * reading: a thing on a surface it does not normally stand on has one pose only (hovers in the air; mounted on a wall or ceiling if it
 * normally stands on a floor or tabletop), and a wall or ceiling thing does not go on a floor at all.
 * shortcut: leans does not ask for a wall or a thing to lean on, because a slot does not say what is beside it; add that when slots do.
 */
function posesOn(thing: Thing, surface: Surface): Pose[] {
  if (thing.surfaces.includes(surface)) {
    return ['rests', ...(onGround(surface) ? ['hovers', 'leans', 'turned'] as const : []), ...(surface === 'floor' || surface === 'wall' ? ['sunk'] as const : [])];
  }
  if (surface === 'air') return ['hovers'];
  return !onGround(surface) && thing.surfaces.some(onGround) ? ['mounted'] : [];
}

/**
 * Whether the thing at `factor` times its true size, in that pose, stands inside the slot's clear volume.
 * Its width and depth are the model's own, measured against its height (step 2), across and along the way the slot faces.
 */
function fits(slot: Slot, pose: Pose, thing: Thing, factor = 1): boolean {
  const [width, height, depth] = slot.clear;
  const size = thing.height * factor;
  const shown = pose === 'sunk' ? 1 - SUNK_SHARE : 1;
  const inWall = slot.surface === 'wall';
  const lean = pose === 'leans' ? LEAN_ROOM(thing.deep) : { tall: 1, deep: 1 };
  const tall = size * (inWall ? 1 : shown) * lean.tall + (pose === 'hovers' && slot.surface !== 'air' ? HOVER_GAP : 0);
  // A clear volume with a side of nothing or less holds nothing.
  return size > 0 && width > 0 && depth > 0 && tall <= height && size * thing.wide <= width && size * thing.deep * (inWall ? shown : 1) * lean.deep <= depth;
}

/**
 * Every way the thing can stand in the slot and fit its clear volume: plainly, in each displaced pose, at each wrong size, in each number.
 * The other copies of a repeated thing stand in the room's `places`, one each, so a room with fewer than COPIES_MIN - 1 of them
 * repeats nothing, and no number asks for more places than the room has.
 * reading: a place is not asked whether the thing belongs on its surface or fits it. A room's places are written by hand for
 * what should stand there (owner, 2026-11-17: against a shelf, on the floor, floating in the water), each with its own pose, and
 * the page makes every copy as much smaller as the tightest of them takes.
 */
function waysIn(thing: Thing, slot: Slot, places: number): Standing[] {
  const ways: Standing[] = [];
  const add = (pose: Pose, discrepancy: Discrepancy | null, factor = 1, copies = 1) => {
    if (fits(slot, pose, thing, factor)) ways.push({ thing: thing.id, discrepancy, pose, factor, copies });
  };
  for (const pose of posesOn(thing, slot.surface)) {
    add(pose, pose === 'rests' ? null : 'displacement');
    if (pose !== 'rests') continue;
    for (const factor of SCALE_FACTORS) if (thing.height * factor >= SCALE_SMALLEST) add('rests', 'scale', factor);
    if (thing.repeatable && onGround(slot.surface)) for (let copies = COPIES_MIN; copies <= Math.min(COPIES_MAX, 1 + places); copies++) add('rests', 'repetition', 1, copies);
  }
  return ways;
}

/**
 * A strong discrepancy put right: the same thing at its true size, in its place, one of it; after an absence, the thing that last stood there.
 * reading: null when that cannot be done, because the shelf does not know the thing (the recording's own points cannot be drawn again
 * another way) or the thing cannot rest in that slot (it only fits there hovering, mounted, sunk or small).
 */
function putRight(slot: Slot, standing: Standing, ledger: readonly Change[], shelf: readonly Thing[]): Standing | null {
  const id = standing.thing ?? ledger.filter((change) => change.slot === slot.id && change.thing !== null).pop()?.thing ?? slot.holds?.thing;
  const thing = shelf.find((each) => each.id === id);
  if (!thing || !thing.surfaces.includes(slot.surface) || !fits(slot, 'rests', thing)) return null;
  const hovered = standing.thing !== null && standing.pose === 'hovers' && onGround(slot.surface);
  return { thing: thing.id, discrepancy: null, pose: hovered ? 'dropped' : 'rests', factor: 1, copies: 1 };
}

/** A whole number under `n`, fixed by the seed and by which of a decision's choices it is. */
function draw(seed: number, choice: number, n: number): number {
  let x = (Math.imul(seed | 0, 0x9e3779b1) + choice) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) % n;
}

/**
 * The visitor picked `thing` (null: "nothing") for `slot`. EVA refuses, or decides how it stands: `changes` is the visitor's change,
 * then one change for each strong discrepancy elsewhere that it puts right. The same inputs and seed give the same decision.
 */
export function decideChange(base: BaseRoom, ledger: readonly Change[], shelf: readonly Thing[],
  slot: string, thing: string | null, seed: number, at: number): Decision {
  const place = base.slots.find((each) => each.id === slot);
  const picked = thing === null ? null : shelf.find((each) => each.id === thing);
  const now = standingNow(base, ledger);
  // reading: "nothing" picked where nothing stands has no thing to take away, so it is 'unknown' as well. So is a seed or a time
  // that parseLedger would drop: no accepted change may vanish when the ledger is stored and read back.
  if (!place || picked === undefined || (picked === null && !now.get(slot)?.thing) || !Number.isFinite(seed) || !(at >= 0 && Number.isFinite(at))) {
    return { ok: false, refusal: 'unknown' };
  }
  const before = roomValues(base, ledger, shelf);
  if (before.deviation > SPENT) return { ok: false, refusal: 'spent' };

  // What a standing's own discrepancy weighs: the deviation it gives its slot, less what the same thing gives standing plainly
  // (its kind of place and its era, which are the thing's and not the discrepancy's).
  const weigh = (where: Slot, standing: Standing) => {
    const alone = (each: Standing) => roomValues({ ...base, deviation: 0, slots: [where] }, [{ ...each, slot: where.id, seed: 0, at: 0 }], shelf).deviation;
    return alone(standing) - (standing.thing === null ? 0 : alone({ ...standing, discrepancy: null, pose: 'rests', factor: 1, copies: 1 }));
  };

  // The strong discrepancies standing in other slots (one at most, in a room these decisions have kept), each put right.
  // reading: they are put right only when this change makes a new strong one, as the document says. A recording that declares
  // several keeps them through plain changes.
  const rights = base.slots.flatMap((other) => {
    const standing = now.get(other.id);
    if (other.id === slot || !standing || weigh(other, standing) < STRONG) return [];
    const right = putRight(other, standing, ledger, shelf);
    return [right && { ...right, slot: other.id, seed, at }];
  });
  const stuck = rights.includes(null);

  const absence: Standing = { thing: null, discrepancy: 'absence', pose: 'rests', factor: 1, copies: 1 };
  const ways = (picked ? waysIn(picked, place, base.places ?? 0) : [absence])
    .map((way) => ({ way, weight: weigh(place, way) }))
    // reading: where the strong discrepancy that stands cannot be put right, a second one cannot be made, and a pick that could only
    // arrive as one is refused as 'fit'. The seam has no refusal of its own for this.
    .filter(({ weight }) => weight < STRONG || !stuck);
  if (!ways.length) return { ok: false, refusal: 'fit' };

  const outcome = ({ way, weight }: typeof ways[number]) => {
    const changes = [{ ...way, slot, seed, at }, ...(weight >= STRONG ? rights as Change[] : [])];
    const { deviation, familiarity } = roomValues(base, [...ledger, ...changes], shelf);
    // reading: "would go under 65" is a change that lowers familiarity to under 65. One that leaves it where it was is not refused,
    // or a room recorded with no anchor (familiarity 0) could never be changed.
    return { changes, spends: deviation > SPENT, anchored: familiarity >= ANCHOR || familiarity >= before.familiarity };
  };

  // EVA's choice: with no strong discrepancy elsewhere, this change carries one, of a kind the mood prefers and the thing can bear,
  // unless it would spend the room or break the anchor.
  if (!rights.length) {
    const kinds = PREFERS[base.mood];
    for (let i = 0, first = draw(seed, 0, kinds.length); i < kinds.length; i++) {
      const ofKind = ways.filter(({ way }) => way.discrepancy === kinds[(first + i) % kinds.length]);
      const strong = ofKind.filter(({ weight }) => weight >= STRONG);
      // reading: a thing that can be displaced here only in a minor pose (leans, turned) takes one; where a strong pose fits, minor ones are never chosen.
      const allowed = (strong.length ? strong : ofKind).map(outcome).filter(({ spends, anchored }) => !spends && anchored);
      if (allowed.length) return { ok: true, changes: allowed[draw(seed, 1, allowed.length)].changes };
    }
  }

  // Otherwise plainly; and where the thing cannot stand plainly, the lightest way it fits, which may spend the room: the visitor forced it.
  const least = Math.min(...ways.map(({ weight }) => weight));
  const lightest = ways.filter(({ weight }) => weight === least);
  const { changes, anchored } = outcome(lightest[draw(seed, 2, lightest.length)]);
  return anchored ? { ok: true, changes } : { ok: false, refusal: 'anchor' };
}
