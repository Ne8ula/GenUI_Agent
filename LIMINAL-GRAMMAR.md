# Liminal room grammar and implementation plan

This is the second project document. `AGENTS.md` says what exists and how to work here; this says how a room is composed and changed, what every generation must look like, and what to build next. Read `AGENTS.md` first. Where the two differ on direction, this one is later (owner, 2026-11-16, evening) and wins.

Part 5 says, under each step, what has been built. Parts 1 to 4 are the rules that the code and every generation prompt must follow.

Sources: the owner's research brief and its HTML explorer (`liminal_rooms_research_and_explorer.zip`), eight reference images (`C:\Users\alexx\Downloads\liminal rooms`), and the owner's answers on 2026-11-16. The brief is design guidance only: its three values are creative settings, not measurements, and its participant test plan is not part of this project.

## Part 1. The grammar

### The rule

A room is recognisable enough to raise expectations, and then breaks them selectively. Every room, and every change to a room, keeps to three things:

1. **One anchor of normality.** The room is a kind of place a visitor knows at a glance.
2. **One primary discrepancy.** One thing is wrong, and a visitor can point at it.
3. **One open question.** Something about who was here, or when, is left unexplained.

Stacking discrepancies turns the room from uncanny into plainly surreal, which reads as fantasy and stops unsettling. The library room in the demo today is in that state: five strange heroes at once and no ordinary thing left.

### The four discrepancies

These are the ones with direct experimental support (Diel and Lewis 2022). They are the only ways an object may be wrong.

| Discrepancy | What it is | Reference |
|---|---|---|
| Wrong scale | A thing far larger or smaller than it should be, among things at their true size | The flower as tall as the door |
| Repetition | A thing repeated beyond any use for it | Televisions standing through an office |
| Displacement | A thing where it does not belong, or facing the wrong way | Two chairs facing each other under a window of sky |
| Absence | A thing the room needs is missing, and the place it stood still shows | (none of the eight; the brief's dinner that never happened) |

Two more come from the brief with weaker support and are used the same way: **lighting that does not fit** (light affects mystery, not proven for uncanniness) and **a contradiction in time** (objects from eras that do not meet).

### The three values

EVA keeps three values for the room, each 0 to 100. The visitor never sees them. They are worked out from what is in the room, never set by hand.

- **Familiarity**: how much of the room's anchor is intact.
- **Deviation**: how much is wrong, as the sum of the discrepancies present.
- **Ambiguity**: how much is left unexplained.

The room's state is read off them with the explorer's own thresholds:

| State | Condition |
|---|---|
| Ordinary | deviation under 35, ambiguity 55 or less |
| Quietly liminal | deviation under 35, ambiguity over 55 |
| Eerie absence | deviation under 35, ambiguity 85 or more |
| Subtly uncanny | deviation 35 to 70, ambiguity over 55 |
| Surreal rupture | deviation over 70 |
| Unreadable | familiarity under 35 |

### The three moods

A visitor who finds no room chooses one of three moods in the black void, shown as one body of grains that takes an abstract form for each mood, with no words (owner, 2026-11-17: abstract moving forms, not small rooms, which were tried first and were hard to tell apart). Each mood is one base room, recorded once.

| Mood | Starts near (familiarity, deviation, ambiguity) | How it unsettles | Discrepancies EVA prefers |
|---|---|---|---|
| Quietly liminal | 80, 25, 70 | Nothing is wrong enough to name; the room is waiting | Displacement, lighting |
| Subtly uncanny | 85, 55, 75 | One thing is plainly wrong in a believable room | Wrong scale, repetition |
| Eerie absence | 90, 20, 95 | The room is prepared and nobody is there | Absence, traces of use |

Kinds of place (owner confirmed 2026-11-16): quietly liminal is a small carpeted office or waiting room under ceiling panels; subtly uncanny is a domestic hallway or sitting room under one fixture; eerie absence is a service room set out for use, such as a laundromat or a canteen laid for a meal.

### What EVA allows

These are checked before every change. A change that fails is refused aloud and nothing happens.

- **The anchor holds.** Familiarity never goes under 65. EVA refuses a change that would replace the last thing that tells a visitor what kind of room this is.
- **One primary discrepancy.** Only one strong discrepancy stands at a time; strong means a weight of 20 or more (Part 4). When a new one is made, the old one is put right in the same change: its object returns to its true size, place or number.
- **Nothing is explained.** EVA never adds a cue that settles the question: no readable clock, no legible text, no figure of a person.
- **The room can be spent.** A change that takes deviation over 70 is the last one that room accepts. EVA refuses everything after it in that visit. When that visitor leaves, the room disperses for good and the next visitor gets the three moods. The owner keeps a key to clear a room by hand.
- **Requests out of reach.** The pool cannot be replaced, and the menu keeps entries EVA will not do (a door, a second eye). These stay as built.

A change with no discrepancy costs nothing, so a room can be changed many times without being spent. Replacing a wrong thing with a plain one lowers deviation.

EVA never chooses a discrepancy that would spend the room. A room is spent by what visitors bring into it: a thing that does not belong to that kind of place, or comes from the wrong era, carries its weight whether she likes it or not, and so does a thing that can only stand in its slot in a displaced pose. The menu will also offer "nothing" for a slot (step 5): picking it takes the thing away and leaves its place showing, which is how an absence is made.

### The visitor picks what, EVA picks how

The menu shows things only. When a visitor picks one for a place in the room, EVA decides three matters from the room's values and mood:

1. **The discrepancy**, or none. If the room has no primary discrepancy and can take one, this change carries it, of a kind the mood prefers and the thing can bear. Otherwise the thing arrives plainly.
2. **The pose**, from a fixed set. Nothing is simulated.
3. **The arrival**, which follows from the pose.

| Pose | Meaning | Counts as | Arrival |
|---|---|---|---|
| Rests | Stands on its surface at its true size | Nothing | Assembles in place |
| Hovers | Hangs clear of every surface | Displacement | Rises from where it would rest |
| Dropped | Rests, having come from a hover | Nothing | Falls and settles |
| Sunk | Part of it is below the floor or inside a wall, cut off cleanly, as the statue head is | Displacement | Pushes up through the surface |
| Leans | Tipped against a wall or another thing | Minor displacement | Assembles, then tips |
| Mounted | On a wall or ceiling, where it would normally stand on a floor | Displacement | Assembles in place |
| Turned | Faces a wall or a corner | Minor displacement | Assembles, then turns |

The same choice is made the same way for the same room and seed, so a capture can be repeated.

### Light and sound

Light belongs to the grammar. Each mood has one colour cast and one kind of source, given in Part 2, and the base room is recorded in it. A lighting change a visitor asks for stays inside the mood's cast unless EVA spends the room's primary discrepancy on it.

Sound belongs to the grammar and is not built. Each mood will carry off-screen sounds with no visible source (ventilation, a machine running, distant movement), and each change, refusal and ending of a room is an event sound can follow. The owner will connect a sound service after the visual prototype is polished.

## Part 2. The style sheet

Every generated picture, object and surface follows this. It is distilled from the eight references. Send the written sheet by default; the owner has said the references are free of copyright, so one may be attached to a request when words are not enough.

**The room**

- An ordinary interior built for use by people, with none in it: office, corridor, waiting room, laundromat, playroom, hallway, sitting room.
- Institutional or modest domestic, built between about 1980 and 2005. Nothing new, nothing ruined, nothing dirty beyond a scrap on the floor.
- Plain surfaces in large flat areas: painted plaster, block wall, suspended ceiling tiles, short carpet in one colour or a small repeat, vinyl or ceramic tile.
- Few things. Most of the floor is empty.

**The view**

- Straight on, at standing eye height, one-point perspective, the far wall square to the viewer.
- The whole room in frame: floor, both side walls, ceiling. Wide, not distorted.

**The light**

- One kind of source, visible in frame: ceiling panels, one tube, one fitting, or one window.
- Even, flat, shadowless in the open; soft pools under the fittings; corners fall away.
- One colour cast over everything. No second colour of light.
- Windows show black night or featureless sky, never a street or a landscape.

| Mood | Cast | Source |
|---|---|---|
| Quietly liminal | Sickly yellow-green | Ceiling panels or a single tube |
| Subtly uncanny | Cold teal to blue-green | One ceiling fitting, dim |
| Eerie absence | Dull warm white with green in it | Panels, with black windows |

**The things**

- Ordinary and a little out of date: office chair, steel desk, cathode-ray monitor or television, stacking chair, chest of drawers, pot plant, washing machine, vending panel, toy blocks.
- Matte, plain colour, soft wear. No brands.
- One accent colour at most in a room, on one thing (the orange seats, the pink flower).

**Never**

- People, animals, figures, faces, mirrors showing anyone.
- Readable words, numbers, clocks showing a time, screens showing content other than a flat glow or static.
- Gore, decay, cobwebs, broken glass, horror props, fog, lens flare, dramatic shadow.
- More than one wrong thing.

**What each reference is for**

| File | Use it for |
|---|---|
| `06e0494e…` desk and monitor in a bare room | Quietly liminal: the cast, the single tube, how little is needed |
| `6b2b7124…` laundromat | Eerie absence: a room set out for use, black windows, the one accent colour |
| `1de89667…` hallway with the tall flower | Subtly uncanny: wrong scale in a believable room, the teal cast |
| `49a93184…` televisions through an office | Repetition; ceiling panels; patterned carpet |
| `e1e39c3b…` two chairs under a window | Displacement; a window of featureless sky |
| `4b886707…` office under water, `a4f26f0a…` flooded playroom | Water in a room; also the limit: both are close to surreal rupture |
| `29a93990…` green display room | One cast over everything. Ignore its printed text |

**Prompt skeletons.** The server builds every prompt from these and from fixed lists; no visitor's words reach a provider, as today.

- Object picture (then to Meshy): "A single {thing}, {era} {institutional or domestic} make, matte {colour}, lightly worn, complete and standing on its own, seen from a three-quarter front view, on a plain mid-grey background, even soft light, no shadow on the background, no text, no logo, no person."
- Base room picture: "An empty {kind of place}, built around {year}, {surfaces}. Seen straight on at eye height, one-point perspective, the whole room in frame. Lit only by {source}, even and flat, {cast} over everything. {Anchor things}, few, most of the floor empty. {The one discrepancy}. No people, no readable text, windows show {black night or blank sky}. Photographic, slightly soft, no dramatic shadow."
- Room edit picture: the current view of the room, with "Change only {the part}: {the change}. Keep everything else, the light and the view exactly as they are."

## Part 3. Decisions (owner, 2026-11-16)

| Matter | Decision |
|---|---|
| Objects, furniture, anything that stands in a room | Generated by Meshy from a picture. Decided |
| Walls, floor, ceiling, layout, room edits such as a pool | Undecided. Two candidates are built and compared (Part 5, step 8) |
| Image model for room pictures and room edits | OpenAI's GPT 2.6 Sunburst image model, as the owner named it. Its API id is `gpt-image-2.6-sunburst` (confirmed from OpenAI's documentation on 2026-11-17, before step 7's first call). Object pictures stay on `gpt-image-2.5-flare`, which the object route uses today, unless the owner moves them |
| Who holds the three values | EVA, hidden |
| First choice in the void | Three moods |
| How many rooms last | One. The moods are offered only when no room exists |
| When a room ends | When its grammar is spent, after that visitor leaves; and by the owner's key |
| Base rooms in the prototype | Recorded once each, three of them |
| Menu | The visitor picks the thing; EVA picks discrepancy, pose and arrival |
| Physics | Fixed poses with animated arrivals; no simulation |
| Object supply | A backend keeps about 12 unused objects ready, chosen by what visitors have been changing, and generates only to refill. At most 40 objects a day. A few recorded objects to start |
| Check on generated models | A separate admission for Meshy objects; the existing one is left alone |
| References | Written style sheet by default; an image may be attached when needed |
| Light, sound | Both in the grammar. Sound waits for the owner's service |
| Evidence | Captures against the references, used loosely. No participant ratings |

Decisions made in writing this document, for the owner to overturn:

- EVA's choices are a pure function with a seed, not a model call. It is instant, free, testable and repeatable. A model may later write her lines.
- A slot replaces the hero box (Part 4). Objects are sized by their true size, not fitted to a box.
- The three values are computed from a ledger of what is in the room, with the starting weights in Part 4.

## Part 4. Data

### A room

A base room's manifest gains:

- `mood`, `kind` (the kind of place), and its starting discrepancies.
- `anchors`: the slots whose things tell a visitor what the room is.
- `slots`: places a thing can be. Each has an id, the surface it belongs to (floor, tabletop, wall, ceiling, air), a point on that surface, the surface's normal, the clear volume round it, a facing, and what stands there in the recording.
- `cast`: the mood's light.

Today's hero box becomes a slot whose clear volume is the old box.

### A thing

The shelf manifest gains, per object: its true height in metres, the surfaces it can stand on, the kinds of place it belongs to, its era, whether it may be repeated, and which way it faces. Without a true height, wrong scale means nothing.

### The ledger

The room is its base room plus an ordered list of changes: slot, thing, discrepancy, pose, seed, time. The three values and the room's state are computed from the ledger. The ledger is the room's memory and moves from the browser's storage to the server, since one room must last across visitors and machines.

### Starting weights

Tune these from captures; they are heuristics, as the brief's are.

| In the room | Deviation |
|---|---|
| Wrong scale, repetition | 30 each |
| Hovers, sunk, mounted, absence | 20 each |
| Leans, turned, lighting that does not fit, an era that does not fit | 10 each |
| A thing that does not belong to this kind of place | 10 |

Familiarity is 100 times the share of anchor slots holding a thing that belongs to the room's kind of place at its true size. Ambiguity starts at the mood's figure, rises 5 for each absence and trace, and never falls, because EVA adds no explaining cue. A thing is from the wrong era when its year is more than 25 from the room's. The recording itself carries some deviation outside its slots, which the base room declares.

### The seam for step 1

Two sessions build step 1 at the same time and meet at these names. One writes `src/astral/grammar.ts`; the other writes `src/astral/grammar-decide.ts`, which imports from it. Once both exist, the code is the truth and this section is history.

```ts
// src/astral/grammar.ts: what is in the room, and what that makes it
export const MOODS = ['quiet', 'uncanny', 'eerie'] as const;        // quietly liminal, subtly uncanny, eerie absence
export const KINDS = ['office', 'home', 'service'] as const;        // each mood's kind of place, in the same order
export const SURFACES = ['floor', 'tabletop', 'wall', 'ceiling', 'air'] as const;
export const DISCREPANCIES = ['scale', 'repetition', 'displacement', 'absence', 'light', 'era'] as const;
export const POSES = ['rests', 'hovers', 'dropped', 'sunk', 'leans', 'mounted', 'turned'] as const;
export type Mood = typeof MOODS[number];            // and Kind, Surface, Discrepancy, Pose likewise

/** A thing of the shelf, as far as the grammar needs it. */
export interface Thing { id: string; height: number; surfaces: readonly Surface[]; kinds: readonly Kind[]; era: number; repeatable: boolean }
/** What stands in a slot. `thing` null with discrepancy 'absence': it was taken away and its place shows. */
export interface Standing { thing: string | null; discrepancy: Discrepancy | null; pose: Pose; factor: number; copies: number }
export interface Slot { id: string; surface: Surface; anchor: boolean; clear: readonly [number, number, number]; holds: Standing | null }
export interface BaseRoom { mood: Mood; kind: Kind; era: number; deviation: number; ambiguity: number; slots: readonly Slot[] }
/** One change a visitor caused: what now stands in a slot. */
export interface Change extends Standing { slot: string; seed: number; at: number }
export interface Values { familiarity: number; deviation: number; ambiguity: number }
export type State = 'ordinary' | 'quiet' | 'eerie' | 'uncanny' | 'surreal' | 'unreadable';

export function standingNow(base: BaseRoom, ledger: readonly Change[]): Map<string, Standing | null>;
export function roomValues(base: BaseRoom, ledger: readonly Change[], shelf: readonly Thing[]): Values;
export function roomState(values: Values): State;
export function parseLedger(value: unknown, base: BaseRoom, shelf: readonly Thing[]): Change[];

// src/astral/grammar-decide.ts: what EVA allows, and how a picked thing enters
export type Refusal = 'unknown' | 'spent' | 'anchor' | 'fit';
export type Decision = { ok: true; changes: Change[] } | { ok: false; refusal: Refusal };
export function roomSpent(base: BaseRoom, ledger: readonly Change[], shelf: readonly Thing[]): boolean;
export function decideChange(base: BaseRoom, ledger: readonly Change[], shelf: readonly Thing[],
  slot: string, thing: string | null, seed: number, at: number): Decision;
export function arrivalOf(pose: Pose): 'assembles' | 'rises' | 'falls' | 'pushes-up' | 'tips' | 'turns';
```

- `height` is the thing's true height in metres and `era` a year; `clear` is the free width, height and depth of a slot in metres; `factor` is size against true size (1 unless the discrepancy is scale); `copies` is 1 unless it is repetition; `at` is milliseconds since 1970, passed in so nothing reads the clock.
- `standingNow`: for each slot, the latest change to it, else what the recording holds.
- `roomValues` and `roomState` follow the weights and thresholds in this document. `roomState` tests familiarity first, then deviation, as the explorer does.
- `parseLedger` treats its input as untrusted: whatever is not a change to a known slot, with a known thing or none, within range, is dropped.
- `decideChange` with `thing` null is the visitor picking "nothing". `changes` is the visitor's change and, when it makes a new strong discrepancy, a second change that puts the old one right. The refusals: `unknown` (no such slot or thing), `spent` (deviation is already over 70), `anchor` (familiarity would go under 65), `fit` (the thing cannot stand in that slot in any pose at any allowed size).

## Part 5. Build order

Each step ends with `npm run check` passing and, where it shows on screen, PNG captures beside the nearest reference.

1. **The grammar as code.** A pure module, `src/astral/grammar.ts`: the ledger, the three values, the state, the checks in "What EVA allows", and the choice of discrepancy, pose and arrival. Tests for every rule and for repeatability by seed. Nothing on screen.
   - Built 2026-11-16: the ledger, the three values and the state (`src/astral/grammar.ts`, `tests/astral-grammar.test.ts`), tested against three example rooms and an example shelf that exist only in the test file. Nothing calls it yet. Where this document was silent the code took the smallest reading and marks each one with a `reading:` comment: displacement weighs only through its pose; a wrong era counts once; ambiguity counts the absences that changes have made, on top of the figure the base room declares; deviation of 35 to 70 with ambiguity of 55 or less is ordinary; a room with no anchor has familiarity 0. Traces are not in the data, so only absences raise ambiguity. A stored ledger keeps its latest 512 changes, with size factors of 0.1 to 10 and up to 32 copies; those bounds are the code's, not this document's.
   - Built 2026-11-16, the other half: the checks in "What EVA allows" and the choice of discrepancy, pose and arrival (`src/astral/grammar-decide.ts`, `tests/astral-grammar-decide.test.ts`), with the exports the seam lists and no others, tested against an example room and shelf that exist only in the test file. Nothing calls it yet. It reads every weight through `roomValues`; the three thresholds it needs (20, 70, 65) are repeated at the top of the file because `grammar.ts` does not export them.
     - Proposals, not this document's, named constants at the top of the file: wrong sizes of 0.25, 0.4, 2.5, 4 and 6 times true size, never under 0.15 m tall; 3 to 9 copies in a grid, each taking 1.25 times the thing's width; 0.3 m of air under a hovering thing; 40% of a sunk thing hidden; a leaning thing takes 1.2 times its height and depth, until step 3 gives the pose its real tilt.
     - Readings, each marked `reading:` or `shortcut:` in the code. A thing is taken to be as wide and deep as it is tall, because the shelf gives its height only. On a surface it does not normally stand on a thing has one pose (hovers in the air; mounted on a wall or ceiling if it is a floor or tabletop thing), and a wall or ceiling thing on a floor is refused as `fit`. Sunk is for floors and walls; leans and turned for floors and tabletops; leans does not ask what is beside the slot. EVA picks a strong pose where one fits and a minor one (leans, turned) only where none does. Light and traces are not a thing's to carry, so in the eerie mood a picked thing always arrives plainly. A thing that cannot stand plainly takes the lightest way that fits, which may be a wrong size. "Nothing" where nothing stands is `unknown`. The anchor refusal is for a change that lowers familiarity to under 65, so a room with no anchor can still be changed. A strong discrepancy is put right only if its thing is on the shelf and can rest in its slot; where it cannot be, EVA makes no new one and a pick that could only arrive as one is refused as `fit`, since the seam has no refusal for that. Strong discrepancies are put right only when a change makes a new strong one: a recording that declares several keeps them through plain changes, and has all of them put right by the first new strong one, so `changes` can hold more than two. A seed that is not finite, or a time that is negative or not finite, is `unknown`, so that no accepted change is dropped by `parseLedger` when the ledger is read back. A clear volume with a side of zero or less holds nothing.
     - Reviewed by `eva-reviewer-gpt` on 2026-11-16 (read-only, nothing executed by it). Left open from that review: duplicate slot or thing ids are not caught here (the decision uses the first, `roomValues` the last); that belongs to the manifest validation of step 2.
2. **Slots and true size, in the library.** Extend both manifests. Place the six shelf objects by slot and true height instead of fitting the box. Captures of each object resting in the sky cube's and statue head's slots.
   - Built 2026-11-16: both manifests carry what `grammar.ts` needs, and the page stands a picked thing in its slot at its true height instead of fitting it to the box (`object-points.ts` `standInSlot`, `posed-frames.ts` `baseRoom`; tests in `tests/astral-object-points.test.ts` and `tests/posed-frames.test.ts`). The menu and `replaceHero` work as before; the grammar's decisions are still not called by the page. No box changed, so `points.bin` was not re-baked. Captures of the six objects in the two slots, default look, are in `.local/slots/` (`sheet.png`).
     - **The seam changed: `Thing` has two more fields**, `wide` and `deep`, a model's width and depth against its height, measured from the GLB's bounds. `grammar-decide.ts` uses them where it took a thing to be as wide and deep as it is tall; that shortcut is gone and nothing else in the file changed. A slot's `clear` is now read as width across the way a thing there faces, height, depth along it.
     - The shelf, all of it proposals except the two measured columns:

       | Thing | True height, m | Wide | Deep | Stands on | Belongs to | Year | Repeatable |
       |---|---|---|---|---|---|---|---|
       | Brass diving helmet | 0.5 | 0.751 | 0.81 | floor, tabletop | nowhere | 1900 | no |
       | Gramophone | 0.7 | 0.589 | 0.667 | floor, tabletop | home | 1910 | no |
       | Rocking horse | 1.0 | 0.332 | 1.091 | floor | home | 1950 | no |
       | Antique globe | 0.55 | 0.452 | 0.446 | floor, tabletop | office, home | 1930 | no |
       | Garden chess knight (0.07 until step 5; see there) | 0.6 | 0.434 | 0.464 | floor, tabletop | home | 1990 | yes |
       | Stack of televisions | 1.35 | 0.499 | 0.246 | floor | office, home | 1990 | yes |

       The four things that belong on a table are given the floor as well, because the library has no tabletop slot and `decideChange` refuses a tabletop thing on a floor. The stack is three sets, and Meshy made it a quarter as deep as it is tall.
     - The library's slots are its heroes: each hero's manifest entry but the pool's has a `slot`, and its box, numbers unchanged, is the clear volume. `clock` is on a wall (the shelf face it hangs down, facing +x), `statue-head` and `books` on the floor, `sky-cube` in the air.
     - **The library is declared as a development fixture**, as the owner set out: each slot holds the recording's own thing plainly, deviation 25 outside the slots, no anchor. Proposed with it: mood quiet (whose starting deviation is the same 25), kind office, era 1990, ambiguity 70. What follows from no anchor: familiarity is 0 and the state always reads unreadable, and the anchor refusal can never be met in this room. Declaring the books the one anchor would give a readable state (quiet) and let step 5 show the anchor refusal, at the price that only a thing of the room's kind could replace them.
     - Placement, each a reading: a thing touches the surface at the slot's point, grows along the normal and is centred on the point the other two ways, so on a wall its back is on the wall and it stays upright. In the air the point is under the thing. Normal and facing must lie along an axis; a model's front is taken to be its +z, because the shelf does not yet say which way a thing faces (Part 4 lists that; it was not asked for in this step). Every library facing but the clock's is +z, which turns nothing.
     - **A thing that does not fit the clear volume is made smaller until it does**, and the console says by how much. The field draws only the points a new object has inside the hero's box, so a thing cannot stand outside it without changing `sand-look.ts`. At true height the televisions fit neither slot (shown at 0.79 of their height on the floor, 0.57 in the air) and the horse does not fit the air slot (0.77). Step 5 should not need this: in the air `decideChange` refuses the horse and the televisions as `fit`, and on the floor it has the televisions arrive sunk or small, which steps 3 and 4 draw.
     - **The chess knight** is recorded at its true 7 cm. At that size it is about 22 pixels tall from 3 m on a 1080-line screen, and reads as nothing having arrived. Until step 5 the page shows any thing under 0.15 m at 6 times its height (0.42 m for the knight): both figures are `grammar-decide.ts`'s own proposals, kept as a marked shortcut in `AstralRoom.tsx`. Proposed for step 5: a thing shorter than 0.15 m never arrives plainly; it is the shelf's natural carrier of wrong scale. The alternative is to call it a garden chess piece 0.6 m tall, which makes the ledger say "nothing is wrong" about a thing every visitor reads as too big.
     - Rejected, with tests: a shelf with a repeated id or a thing whose height, width, depth, surfaces, kinds, year or repeatable is missing or out of range; a room with a repeated slot id, a clear volume with a side of nothing or less, a point outside its volume, a normal or facing off the axes, a `holds` the ledger's own rules would drop, or a mood, kind, year or value out of range.
     - Seen in the captures, not caused by this step: the statue head's box does not hold the whole head (about 8,000 pale points, by a rough count on colour, lie behind, above and beside it and stay when it is replaced), and the carpet inside that box leaves with the head, so a smaller thing stands in a dark patch.
3. **Poses and arrivals.** The seven poses in the change shader (`sand-look.ts`), with sunk cut off at the surface. The three existing pairings become the "assembles" arrival until the owner picks one. Captures of one object in every pose.
   - Built 2026-11-16, default look: a thing can stand in each of the seven poses and arrive by that pose's arrival. The placement is `poseIn` and `standInSlot` in `object-points.ts` (pure, tested in `tests/astral-object-points.test.ts`); the arrivals are in `sand-look.ts` (`Move`, `swapTimes`, the last block of the shader's `swapGrain`; tested in `tests/astral-sand-look.test.ts`). **Nothing is wired to the menu**: the page still stands every pick in `rests`, and only the development switch reaches the rest, as `?swap=<hero>,<pairing>,<progress>[,<pose>[,<way>[,<thing>]]]`. `AGENTS.md` describes what exists; this note is what was decided and what the owner has to pick.
     - **The poses, each a reading where the table was silent.** Hovers: 0.3 m of air under the thing, none in an air slot, where the slot's point is already under it. Dropped stands exactly as rests does; only its arrival differs. Sunk: 40% of the thing's extent along the slot's normal is behind the surface, so in a floor its lower 40%, in a wall its rear 40%; the points stop at the surface. Mounted: upright with its back to the surface, which is how step 2 already stands a thing on a wall, so on a wall mounted and rests look the same. Turned: 180 degrees, to the wall behind it. Leans: see the next item.
     - **Leaning is tipped back 15 degrees**, away from the way the slot faces, which is toward the wall a thing would lean on. **`LEAN_ROOM` is no longer one figure, because no one figure is true**: the room a tipped thing takes depends on how deep it is against its height. It is now worked out per thing from `LEAN_TILT`: height times (cos 15 + deep x sin 15), depth times (cos 15 + sin 15 / deep). For the shelf that is 1.03 to 1.25 times the height and 1.20 to 2.02 times the depth (the televisions, a quarter as deep as they are tall, need twice their depth), against the 1.2 of both that step 1 proposed. It is the room of the thing's box, so never less than the thing itself takes.
     - **The seam changed: `grammar-decide.ts` exports three figures more**, `HOVER_GAP`, `SUNK_SHARE` and `LEAN_TILT`, so the placement and the fit check cannot drift apart.
     - **Four poses could reasonably look two ways; both are built, neither is chosen.** Sunk: upright, or tilted 20 degrees as the statue head lies. Leans: tipped back, or to its side. Mounted: upright with its back to the wall, or standing on the wall as on a floor (its base on the wall, its height along the normal). Turned: to the wall behind it, or to a corner (135 degrees). `grammar-decide.ts` checks the room of the first of each only; the second ways of leans, mounted and turned take different room, and a thing that then does not fit is made smaller.
     - **The arrivals.** Assembles is the pairing alone, and the three pairings are its three versions, still taken in turn. Rises, tips and turns are the pairing, then a move: the thing assembles where the move starts from (on the surface; upright; facing the room) and then rises, falls into its lean, or turns. Pushes-up does not assemble: the thing comes whole through the surface, cut off at it, while the old thing leaves. Falls is a hover put right: the same thing is already there, so nothing leaves and nothing assembles, it drops, lands and rebounds once. Lengths, all starting values: 5 s for the pairing; then 3 s rising, 1.4 s tipping, 3 s turning; pushing up takes 4 s from 1.5 s into the pairing; falling takes 0.9 s.
     - **Every move is built two ways, neither chosen**: the thing moves as one body, or grain by grain, each grain making the move at its own moment (`grains` on the switch).
     - Shortcuts, the first two marked in the code: a move turns the thing about its middle and shifts it, so a tipping thing's foot slides a little instead of staying put; a moving thing keeps the lighting of where it ends. Also: a thing that leaves does so by the pairing from where it stands, whatever its pose; and the page must say when a falling thing is the one already hovering there (step 5 knows this from the ledger).
     - A thing still cannot stand outside its slot's clear volume, so a pose that needs more room than the thing at rest (hovers, leans, the second ways) can make it smaller. The gramophone in the clock's slot is shown at 0.90 of its height mounted, and 0.60 standing on the wall.
     - Captures, default look, the gramophone, 1920x1080, in `.local/poses/`: `sheet-poses.png` (settled in every pose, both ways) and `sheet-arrivals.png` (every arrival held at 25%, 50% and 80%, and each move at three points, both ways). No console errors. Frames held 16.7 ms through every arrival in headless Chrome, which caps at 60.
     - **For the owner to pick, from the sheets**: for sunk, leans, mounted and turned, which way; for the moves, one body or grain by grain; and, still open from before, which pairing is "assembles".
     - Seen in the captures: leaning back hardly shows to a viewer facing the slot, and shows clearly from its side, while leaning to the side shows from in front. A sunk gramophone is only its horn, because 40% of its height is its whole case. Sunk in a wall cannot be told from mounted from in front. A thing pushing up breaks the surface first wherever its highest part is, which for the gramophone is the rim of its horn, in front of where its case will be.
4. **Discrepancies.** Wrong scale; repetition (several of one thing in a row or grid within the point budget); displacement; absence with a trace on the surface. Captures of each.
   - Built 2026-11-17, default look, in two rounds: each discrepancy a `Change` can carry shows in the room. **Nothing is wired to the menu**: only the development switch reaches them, as a seventh part of `?swap=` (`x2.5`, `n6`, `gone`). `AGENTS.md` describes what exists and what was checked; this note is what was decided and found. The sheet is `.local/discrepancies/sheet.png`; the first round's, which the owner decided from, is in `round1/`.
     - **The owner's decisions of 2026-11-17, which change Parts 1 and 4 of this document** (their wording there is not yet rewritten; where it differs, these win):
       1. **Absence leaves a clean floor, with no trace.** The first round's three traces (the footprint outlined, a paler patch, the thing's lowest layer left faint) were all rejected, and so was the recording's own floor in the slot: it is denser than the room's and carries colours that are not the carpet's. So "the place it stood still shows" (Part 1) no longer holds: the place is as if nothing had stood there. Part 4's "ambiguity rises 5 for each absence and trace" now has no trace to count.
       2. **Base rooms should be recorded with their slots empty, and the laid floor kept as the fallback**, made consistent with the floor round it.
       3. **Six copies at most, never side by side or stacked**: split among different places of the room, such as against a shelf, on the floor, floating in the water.
       4. **No small sizes.** Wrong scale is larger only, and a thing made larger must not be more detailed than the scene round it.
       5. The televisions and the chess knight did not look of a piece with the room's own things.
     - **The carpet is its own cloud** (owner, 2026-11-17, after seeing replaced things stand in a black patch): the first time a slot on a floor is changed its floor is laid as a separate, static cloud that no later change touches, so a thing can stand on it, sink through it, rise off it or leave it. An absence is then the thing leaving and nothing arriving. **The black section of bookshelf behind a replaced thing is left for step 7**: it is where the slot's box reaches into the shelf and where the recording has nothing, and base rooms recorded with their slots empty will not have it.
     - **The laid floor** (`floorOf` in `object-points.ts`): the slot's whole floor is laid with a copy of the real floor beside it, the points as they are, moved across, so it has the room's own grain, density, colours and unevenness. It takes the most complete of the four neighbouring pieces. First tried and dropped: filling only the hole with made-up dots (the join showed, and the box's own denser floor stayed).
     - **Found: a recorded room has no floor under its own things, and a replaced slot loses the floor it has.** This corrects step 2's note: the dark patch round a thing in the statue head's slot is a hole in the recording, not carpet leaving. In that slot the pale shape left after an absence is the recorded head itself, most of which lies outside its box.
     - **Wrong scale** needed no new placement: it is step 2's, at `factor` times the true height, with `SCALE_FACTORS` now 2.5, 4, 6. **The grammar's rule changed with it**: where a thing fitted its slot only small, EVA used to make it small; now she refuses (`fit`). A thing made larger is sampled at 1.4 times the room's lattice, against an object's usual 2. Tried and dropped: the room's own spacing, at which a near thing is more gap than grain and is seen through; and not drawing its back faces, which let the shelves behind show straight through it.
     - **Repetition**: one copy in the slot picked, the others in the room's **places**, a new part of a base room's manifest (Part 4 does not list it yet): a clear volume with a slot that holds nothing, and the pose a thing takes there (in water, `sunk`, which floats it). The library declares five, measured from its points; they are proposals. The copies share 600,000 points; six stacks of televisions held 16.7 ms a frame in headless Chrome.
     - **The seam changed.** `grammar-decide.ts` exports `SCALE_FACTORS`, `COPIES_MIN` and `COPIES_MAX` (now 6). Its fit check for a repeated thing no longer counts a grid in the slot: the slot needs room for one. **It does not yet count the room's places** or ask whether a thing belongs on a place's surface, because a `BaseRoom` does not list places: step 5 has to add them.
     - **Every placed thing is lit as the room is** (`litLikeRoom`): from above, and toward the room's own cast. That is what was done for the televisions and the knight without spending: it gave both form and the room's colour. **It does not make them other objects.** The televisions' screens are dead and the knight is a plain marble piece at six times its size; if they still do not sit with the room's things, they have to be generated again from the style sheet, which is paid and needs the owner's word.
     - **Displacement** is step 3's poses, looked at again beside the same thing resting plainly. My reading from the captures, for the owner to overturn: hovers reads as wrong at once, and so does mounted by its base; sunk reads as a different object (a horn on the floor) more than as a displaced one; leaning back hardly reads and leaning to the side reads slightly; turned reads only to someone who knows which way a gramophone faces; mounted upright reads as a thing put on a shelf, because this wall is a bookshelf.
     - **Open after this round, for the owner**: whether an absence with no trace still counts as a discrepancy of weight 20, since nothing marks it once the thing has gone; where the library's places should be; whether 1.4 is the right grain for an enlarged thing; whether to generate the televisions and the knight again.
     - Not done, because not asked: the same for a wall slot (the clock's piece of shelf); an absence in a wall or the air; any of it remembered.
5. **EVA decides.** Wire the grammar into the menu pick. Refusal lines for each failed check, in `tease.ts`. The spent room: refuses, then disperses for good when the visitor leaves.
   - Built 2026-11-17, default look: a visitor's pick in the menu goes through `decideChange`, and what it returns is what happens. `AGENTS.md` ("EVA decides") describes what exists and what was checked; this note is what was decided and found. Nothing in `grammar.ts` or `grammar-decide.ts` changed but one comment.
     - **The changes of a decision are shown one after the other**, the visitor's first, then each that puts an old discrepancy right, every one by its pose's arrival. The ledger is written when EVA decides, before anything is shown.
     - **The seed** is the ledger's length times 31 plus the slot's index in the base room (`pickSeed` in `replacements.ts`); `at` is the page's clock. The grammar reads neither.
     - **The menu has "nothing"**, after the six things and before the door and the second eye: the bare edges of an empty box, in dots. A first try, not judged.
     - **The four refusals have lines in `tease.ts`**, placeholder wording. A refusal turns the entry red and leaves the menu open, as the door does.
     - **The room's memory is the ledger**, in this browser's storage and read back through `parseLedger`; marked `shortcut:` until step 9. **A room that arrives with a ledger is no longer rebuilt as one cloud**: what the ledger has standing is put back through the field as the room forms, each thing an object of its own on its laid floor. So a later change takes all of it away, a repeated thing's copies too, which a cloud with the things baked in could not do.
     - **The 6-times shortcut for the chess knight is gone**, since what EVA returns is what happens. (At 7 cm it then read as nothing arriving; see the recommendations below.)
     - **The spent room** refuses every pick; when its visitor's 45 seconds without input run out it is over and its ledger is cleared. `endRoom` also calls `forgetMood()` (step 6, `mood-choice.ts`), wired when the two steps were merged.
     - **The owner's key is proposed as `Shift` + `Delete`**, in any build: a chord no visitor's path includes, and `Delete` alone does nothing. It replaces the development key `Backspace`.
     - **Found: in the library EVA can only ever choose displacement.** Its mood is quiet, which prefers displacement and light, and light is not a thing's to carry. Wrong scale and repetition can come only from the uncanny mood, so the page's handling of a size or a number in a decision has run only through `?swap=`.
     - **Found: what spends this room.** It starts at deviation 25. A thing from the wrong era or the wrong kind of place carries 10 for each wherever it stands, so a helmet (20) or a gramophone (20) standing plainly beside one strong discrepancy (20) is already 65, and the next foreign thing spends the room. The captured path: televisions for the books hover (45); a globe for the statue head, plain (55); "nothing" for the sky cube, which drops the televisions (55); a helmet for the empty air slot, which can only hover there (75, spent).
     - **Found: an absence in a slot whose recorded thing is not on the shelf cannot be put right**, so after "nothing" is picked for one of the recording's own things, every later pick that could only arrive as a strong discrepancy is refused as `fit` (the helmet on the clock's wall, for one). That is step 1's reading at work, and it reads oddly aloud: the line says the thing does not fit.
     - Captures and the script that checks each step are in `.local/eva-decides/` (`capture.mjs`, `again.mjs`).
   - Later on 2026-11-17 the owner asked for the best recommendation on each open matter, built. **All four are recommendations, the owner's to overturn**; where they differ from the note above, these win.
     1. **The owner's key stays `Shift` + `Delete`.** A chord, so nothing a visitor does while flying (`Shift` is "down") can end a room by one stray key, and it sits on every keyboard. Once the controller replaces the keyboard, only the owner has a keyboard at all.
     2. **The chess knight is a garden chess piece, 0.6 m tall**: one figure and the name in the shelf's manifest, nothing in the grammar. That is what its model was generated as ("a giant white marble chess knight piece" is the route's own prompt). The other way, "a thing under 0.15 m never arrives plainly", made every knight a strong discrepancy whatever the mood, and its largest size was 42 cm. At 0.6 m it is seen in every room, and in an uncanny room wrong scale makes it 1.5, 2.4 or 3.6 m, which is the reference's flower as tall as the door. Changes Part 5 step 2's table, which is corrected.
     3. **"Nothing" stays the bare edges of an empty box.** Selected, in its brackets, it reads as the space a thing would take with nothing in it, and it needs no word (`11-menu-nothing.png`).
     4. **A refusal leaves the menu open with that entry red**, so the visitor can pick something else. The red entry is the only sign of a refusal that does not depend on her line being heard, and captions are not allowed. **A spent room's menu opens with every entry red**: one look says nothing more goes in.
   - Built with them:
     - **EVA's lines follow the owner's new rule** (Part 1 says nothing of her voice; `AGENTS.md`, Direction, has it): one sentence, twenty words at most, dry and helpful rather than cutting. All lines in `tease.ts` were rewritten; a test holds them to the length.
     - **The grammar counts the room's places**, which step 4 left open. **The seam changed: `BaseRoom` has `places`**, how many places the room has for a repeated thing's copies beside the slot picked; `baseRoom` sets it from the manifest's list, and a room that says nothing has none. No number of copies asks for more than one more than that, and a room with fewer than two places repeats nothing. **Reading, for the owner to overturn: a place is not asked whether the thing belongs on its surface.** The owner asked for copies against a shelf and floating in the water, which a surface check would forbid for every thing on the shelf; places are written by hand for what should stand there.
     - **A spent ledger found when a room loads is ended before the room is shown**: the page went before the visitor's 45 seconds ran out, and whoever arrives is the next visitor.
     - **Wrong scale and repetition were run through the page**, by answering the manifest as an uncanny room in the capture's own browser (`capture-uncanny.mjs`, captures `u01` to `u08`): five knights in the slot and the room's places, read back from the ledger, and all of them gone when the repetition is put right; a knight 2.5 times its size; the refusals `unknown` and `fit`; the spent menu.
   - **For step 6.** The mood reaches the grammar as `cloud.base.mood`, which `room-source.ts` sets from the manifest; a chosen mood has to replace it there or as the cloud is taken (`showRoom` in `AstralRoom.tsx`), before the first pick. Every ending of a room goes through `endRoom`, where one marked line waits for `forgetMood()`. With the library loaded as an uncanny room, repetition and wrong scale come out of the menu as captured; as an eerie room a picked thing always arrives plainly, by step 1's reading.
6. **The void's choice.** With no room, three small rooms round the eye; picking one loads that mood's base room. Until step 7, all three load the library.
   - Built 2026-11-17, in a worktree at the commit before steps 2 to 5 (`src/astral/mood-choice.ts`, `tests/astral-mood-choice.test.ts`, `src/astral/mood-view.ts`, wiring in `AstralRoom.tsx`). Whether a room exists is the stored mood: `chosenMood()`, `chooseMood(mood)`, `forgetMood()`, kept in the browser's storage and read back as untrusted data. With none, the void offers the three moods, stepped and picked with the menu's keys and mouse; the pick stores the mood and starts the tunnel into the library. `AGENTS.md` has what was checked and the known faults.
     - **Changed twice the same day by the owner; the third round is the one the owner chose as final.** First each mood was a thinned copy of the library in its cast (not liked, hard to tell apart). Then three still figures of dots side by side, in two sets (the owner wanted forms like two pictures of glass, and movement). Now **one body of 40,000 grains takes an abstract form for the selected mood and moves in that mood's way**, after the owner's references: the two pictures, Gather's effects, and bricelab.dev, where one body of particles re-forms for each item. The code and captures of the first two rounds are deleted. `.local/void-choice/sheet.png` shows the chosen one.
     - Made as proposals and chosen with this version: which form is which mood (quiet a seamed sphere that breathes; uncanny a ribbon in a figure of eight that wrings itself; eerie a ring round nothing that loses grains and gets them back), the three casts as colours (yellow-green 0.80, 0.84, 0.36; teal 0.22, 0.70, 0.68; warm white with green 0.88, 0.86, 0.70), each with 45% of its colour kept and paler toward the edges (owner, the same day: few colours, liminal and surreal, not colourful), and every size and speed.
     - Readings. The body stands in the middle of the frame and the eye wanders past it: no longer "round the eye". The eye stays in its idle phase while the choice waits. `Esc` does not dismiss the choice. A room exists from the pick, not from its arrival, so a tunnel that is stopped or fails leaves the mood chosen.
     - It has its own small view, `mood-view.ts`: the menu's view draws separate still choices and cannot move grains from form to form. `menu-view.ts` is unchanged by this step.
     - **Merged with steps 2 to 5 on 2026-11-17.** Two lines joined the steps, as step 5's note for step 6 asked: `endRoom` calls `forgetMood()`, and `loadRoom` puts the mood picked in place of the library's own before the first pick, so the room behaves as the mood chosen (a shortcut until step 7 gives each mood its base room). Checked together in the page: an `uncanny` room repeats a picked knight, and the owner's key brings the three moods back.
7. **Three base rooms.** One picture per mood from the style sheet, rebuilt as the library was, with slots and anchors written by hand. Paid: needs the owner's go-ahead for the pictures; World Labs calls are already approved.
   - Built 2026-11-17: three recorded rooms, `public/fixtures/quiet/`, `uncanny/` and `eerie/`, each loaded with `?room=<mood>` (`room-source.ts`; `tests/base-rooms.test.ts`). `AGENTS.md` (Fixtures, Running and checking, Known faults) describes what exists, what was checked and what is wrong; this note is what was decided and found. **The fixtures are not committed**: 312 MB, waiting on Git LFS.
     - **The image model's id is `gpt-image-2.6-sunburst`**, confirmed from OpenAI's model page before the first call. Pictures were made at 1536x864 (16:9, as the library's frames are), quality high.
     - **The owner's decision of 2026-11-17, which changes this step and Part 1** (their wording is not rewritten; where it differs, this wins): **each base room is recorded with one strange thing in it.** The step began as the owner first set it, rooms recorded ordinary with their anchor things only, so that EVA adds the one discrepancy from the shelf. Twelve such pictures were made (four a mood, two places of each kind); the owner picked one a mood and said the objects "do not feel surreal enough". Eighteen more were made, six ideas for each picked place: three with one strange thing in an ordinary room, three with the room's own things made strange. **The owner picked `quiet-s5` (the desk sinking into the carpet), `uncanny-s5` (the television gone soft over its cabinet) and `eerie-s6` (a table bent into an arch)**: two of the three are a thing itself made strange, which is none of Part 1's four discrepancies. Both rounds' sheets are in `.local/base-rooms/` (`sheet-<mood>.png`, `sheet-<mood>-surreal.png`).
     - **What that costs the grammar, and how the manifests answer it. A proposal, the owner's to overturn.** A recorded strangeness cannot be put right, and step 1's reading is that EVA makes no new strong discrepancy while one stands that she cannot put right. Declared honestly in its slot, the sinking desk (`sunk`, 20) would therefore stop EVA choosing a pose or a size for anything, for the life of the room. So each strange thing is a slot that holds its thing plainly, and its weight is in `room.deviation`, exactly as step 2 declared the library. The price: two wrong things can stand at once (hers and the recording's), against "one primary discrepancy", and the weight stays when a visitor replaces the strange thing.
     - **The starting figures**, each a proposal: quiet 25 (a sunk thing's 20, and 5 for what World Labs invented behind the arrival spot), which is Part 1's figure for the mood; eerie 20, also Part 1's; **uncanny 35, not Part 1's 55**. At 55 EVA could never make the wrong scale or repetition her mood prefers, since 30 more would spend the room and she never chooses that; at 35 the room starts in the uncanny band and takes one. Familiarity is 100 in all three (two anchors each), and each room's state reads as its own mood before the first pick.
     - **Step 4's decision that base rooms are recorded with their slots empty is only partly kept.** Each room has one slot on open floor that holds nothing; its other three slots hold what was recorded there. The step-4 finding still applies to those three: a recorded room has no floor under its own things.
     - **Part 4 changed: a room's manifest has `cast`** inside `room`, the mood's colour and source in Part 2's words. Nothing reads it; step 10 will.
     - **Places are declared only where the mood repeats things**: five in the uncanny room, none in the other two.
     - **Found: World Labs invents the room behind the camera**, and differently each time: a second room through a wide opening (sitting room), an alcove (office), a door with a sign over it (canteen). The prompt for the generated views was the picture's own, which says nothing of the wall behind the viewer. A base room that must be a closed box needs that said, or a picture taken from further inside.
     - **Found: the paint has holes in the plain walls** of the office and the sitting room, and none in the canteen's block walls. See Known faults in `AGENTS.md` for the probable cause, which is in `splat-view.ts` and was not touched.
     - **Calls and what the providers said they cost.** OpenAI: 30 pictures, 39,546 tokens reported, about $1.01 at its documented rates. World Labs: twelve calls, three of them refined splats at 18 to 19 minutes each; its replies name no cost, and its documentation prices a refined splat at $5, so $15, with the nine smaller calls not priced anywhere read.
     - **Not done, because not asked:** the void's choice still loads the library for every mood (one small change in `AstralRoom.tsx`); the library is neither retired nor changed; nothing of step 10's light.
     - **For the owner to decide:** whether a recorded strange thing may stand beside one of EVA's, or should be the room's one discrepancy; the uncanny room's 35; whether the invented second room behind the sitting room stays; Git LFS for 312 MB of fixtures.
   - Joined to step 6 later on 2026-11-17, at the owner's word: **a mood picked in the void loads that mood's own base room** (`loadRoom` in `AstralRoom.tsx` passes the mood to `loadRecordedRoomCloud`). The room's mood, kind, era and starting values are its own manifest's; the shortcut that put the picked mood in place of the library's is gone. The library is a development fixture, loaded with `?room=library` or when no mood is stored. Walked in headless Chrome in all three rooms, with a menu pick in each (`AGENTS.md`, Running and checking).
8. **Room edits, two candidates, compared.**
   - **A, EVA constructs.** A structured description becomes geometry and is sampled to points (`room-generation.ts`, `procedural-room.ts`, `surface-sampler.ts`). Seconds, exact, slots survive. Risk: plain built surfaces beside a photographic room.
   - **B, picture then rebuild.** The room's current view is edited by an image model under the style sheet, then rebuilt as points from depth (19 s measured) or a draft splat (34 s measured). Keeps the photographic look. Risk: slow, the whole room shifts, slots must be found again.
   - Both end as a point cloud thrown into place by the field's existing transition. The same three edits go through both (a longer room, a new floor, a pool), captured side by side with time, what else changed, and whether slots survived. The owner picks.
9. **The backend.** The room's ledger kept by a server route. The Meshy admission. A generator that keeps the stock at its target within the daily ceiling, logs every call, and stops on repeated failure. Off unless its flag is set; target and ceiling in the environment (12 and 40).
10. **Light.** Each mood's cast as the room's default; lighting that does not fit as a discrepancy. Sound's events exposed, nothing played.
    - Built 2026-11-17, the first half only, at the owner's word (lighting as a discrepancy, and sound, are not for now): **each mood's cast is its room's default lighting.** `AGENTS.md` (What exists) describes it; this note is what was decided and found.
      - **Found: the base rooms already arrive in their cast**, because each was recorded in it (Part 2's skeleton says "{cast} over everything") and the field's default lighting leaves a recorded room's colours as they are. So joining the mood to its room (step 7's last note) did most of this.
      - **What the code now adds, a reading for the owner to overturn.** A room's manifest declares its `cast`, and such a room's default lighting is no longer "as recorded" but its mood's colour (`MOOD_CASTS`, the same three colours the void's body is drawn in) as a gentle multiplier on every grain: the cast's strongest colour is left alone and its weakest is pulled down by a quarter of what the cast lacks of it (`CAST_DEPTH` 0.25 in `point-field.ts`). So what the recording left off-colour, a laid floor and whatever a visitor brings in sit a little further under the one light. At 0 the room is exactly as recorded. Nobody has judged the figure; `.local/showcase/sheet-<mood>.png` has each room as recorded beside it.
      - **Left as it was:** the other lighting settings (afternoon's warm side light, night's blue, dark). They take a room out of its cast, which Part 1 allows only when EVA spends the primary discrepancy on it; that is this step's second half. A placed thing is still lit toward the room's measured mean colour (`roomCast`), not the declared cast.

Steps 1 to 6 need no spending. Steps 7 to 9 make paid calls.

## Open, for the owner

- What becomes of the library once three base rooms exist: retired, or kept as a development fixture.
- Whether object pictures also move to GPT 2.6 Sunburst, or stay on `gpt-image-2.5-flare`.
- Picked on 2026-11-17, and the rest deleted: ordered dots (sand is gone, with the `?look=` switch), shatter then spiral for every change (so "assembles" is that), the ring for the menu; ribbons and the data marks are kept and always on. Still unpicked from step 3: for sunk, leans, mounted and turned, which way; and a move as one body or grain by grain.
- What a day at the ceiling costs: 40 objects is 600 Meshy credits and 40 pictures; the price in money has not been looked up.
