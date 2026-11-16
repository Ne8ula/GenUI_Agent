// What EVA allows, and how a thing the visitor picked enters the room (LIMINAL-GRAMMAR.md, Part 1: "What EVA allows" and
// "The visitor picks what, EVA picks how"). Pure: no three.js, no page, no clock, no Math.random. Nothing calls it yet (step 5).
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
/** Wrong scale: the sizes allowed, against true size. */
const SCALE_FACTORS = [0.25, 0.4, 2.5, 4, 6] as const;
/** A scaled thing is never shorter than this, in metres, or the room's dots lose it. */
const SCALE_SMALLEST = 0.15;
/** Repetition: how many of one thing, in a grid on the slot's floor or tabletop. */
const COPIES_MIN = 3;
const COPIES_MAX = 9;
/** The floor each copy takes, against the thing's own width. */
const COPY_PITCH = 1.25;
/** Air under a hovering thing, in metres. */
const HOVER_GAP = 0.3;
/** The share of a sunk thing that is below the floor or inside the wall. */
const SUNK_SHARE = 0.4;
/** The height and depth a leaning thing takes, against its own; step 3 gives the pose its real tilt. */
const LEAN_ROOM = 1.2;

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
 * Whether a thing `size` metres tall, in that pose, `copies` of it in a grid, stands inside the slot's clear volume.
 * shortcut: the shelf gives a thing's height only, so it is taken to be as wide and deep as it is tall; use its real width and depth
 * once step 2 measures the models.
 */
function fits(slot: Slot, pose: Pose, size: number, copies = 1): boolean {
  const [width, height, depth] = slot.clear;
  const shown = pose === 'sunk' ? 1 - SUNK_SHARE : 1;
  const inWall = slot.surface === 'wall';
  const lean = pose === 'leans' ? LEAN_ROOM : 1;
  const tall = size * (inWall ? 1 : shown) * lean + (pose === 'hovers' && slot.surface !== 'air' ? HOVER_GAP : 0);
  const pitch = size * (copies > 1 ? COPY_PITCH : 1);
  // A clear volume with a side of nothing or less holds nothing (two negative sides would otherwise multiply into room).
  return size > 0 && width > 0 && depth > 0 && tall <= height
    && Math.floor(width / pitch) * Math.floor(depth / (pitch * (inWall ? shown : 1) * lean)) >= copies;
}

/** Every way the thing can stand in the slot and fit its clear volume: plainly, in each displaced pose, at each wrong size, in each number. */
function waysIn(thing: Thing, slot: Slot): Standing[] {
  const ways: Standing[] = [];
  const add = (pose: Pose, discrepancy: Discrepancy | null, factor = 1, copies = 1) => {
    if (fits(slot, pose, thing.height * factor, copies)) ways.push({ thing: thing.id, discrepancy, pose, factor, copies });
  };
  for (const pose of posesOn(thing, slot.surface)) {
    add(pose, pose === 'rests' ? null : 'displacement');
    if (pose !== 'rests') continue;
    for (const factor of SCALE_FACTORS) if (thing.height * factor >= SCALE_SMALLEST) add('rests', 'scale', factor);
    if (thing.repeatable && onGround(slot.surface)) for (let copies = COPIES_MIN; copies <= COPIES_MAX; copies++) add('rests', 'repetition', 1, copies);
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
  if (!thing || !thing.surfaces.includes(slot.surface) || !fits(slot, 'rests', thing.height)) return null;
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
  const ways = (picked ? waysIn(picked, place) : [absence])
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
