# Liminal room grammar and implementation plan

This is the second project document. `AGENTS.md` says what exists and how to work here; this says how a room is composed and changed, what every generation must look like, and what to build next. Read `AGENTS.md` first. Where the two differ on direction, this one is later (owner, 2026-11-16, evening) and wins.

Nothing in Part 5 is built yet. Parts 1 to 4 are the rules that the code and every generation prompt must follow.

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
| Image model for room pictures and room edits | OpenAI's GPT 2.6 Sunburst image model, as the owner named it. Its exact API id has not been looked up; confirm it from OpenAI's documentation before the first call. Object pictures stay on `gpt-image-2.5-flare`, which the object route uses today, unless the owner moves them |
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
3. **Poses and arrivals.** The seven poses in the change shader (`sand-look.ts`), with sunk cut off at the surface. The three existing pairings become the "assembles" arrival until the owner picks one. Captures of one object in every pose.
4. **Discrepancies.** Wrong scale; repetition (several of one thing in a row or grid within the point budget); displacement; absence with a trace on the surface. Captures of each.
5. **EVA decides.** Wire the grammar into the menu pick. Refusal lines for each failed check, in `tease.ts`. The spent room: refuses, then disperses for good when the visitor leaves.
6. **The void's choice.** With no room, three small rooms round the eye; picking one loads that mood's base room. Until step 7, all three load the library.
   - Built 2026-11-17, in a worktree at the commit before steps 2 to 5 (`src/astral/mood-choice.ts`, `tests/astral-mood-choice.test.ts`, `src/astral/mood-view.ts`, wiring in `AstralRoom.tsx`). Whether a room exists is the stored mood: `chosenMood()`, `chooseMood(mood)`, `forgetMood()`, kept in the browser's storage and read back as untrusted data. With none, the void offers the three moods, stepped and picked with the menu's keys and mouse; the pick stores the mood and starts the tunnel into the library. `AGENTS.md` has what was checked and the known faults.
     - **Changed twice the same day by the owner; the third round is the one the owner chose as final.** First each mood was a thinned copy of the library in its cast (not liked, hard to tell apart). Then three still figures of dots side by side, in two sets (the owner wanted forms like two pictures of glass, and movement). Now **one body of 40,000 grains takes an abstract form for the selected mood and moves in that mood's way**, after the owner's references: the two pictures, Gather's effects, and bricelab.dev, where one body of particles re-forms for each item. The code and captures of the first two rounds are deleted. `.local/void-choice/sheet.png` shows the chosen one.
     - Made as proposals and chosen with this version: which form is which mood (quiet a seamed sphere that breathes; uncanny a ribbon in a figure of eight that wrings itself; eerie a ring round nothing that loses grains and gets them back), the three casts as colours (yellow-green 0.80, 0.84, 0.36; teal 0.22, 0.70, 0.68; warm white with green 0.88, 0.86, 0.70), each with 45% of its colour kept and paler toward the edges (owner, the same day: few colours, liminal and surreal, not colourful), and every size and speed.
     - Readings. The body stands in the middle of the frame and the eye wanders past it: no longer "round the eye". The eye stays in its idle phase while the choice waits. `Esc` does not dismiss the choice. A room exists from the pick, not from its arrival, so a tunnel that is stopped or fails leaves the mood chosen.
     - It has its own small view, `mood-view.ts`: the menu's view draws separate still choices and cannot move grains from form to form. `menu-view.ts` is unchanged by this step.
     - Not done here: nothing calls `forgetMood()`. Step 5's ending of a room, written in another session, has a marked line where the call goes.
7. **Three base rooms.** One picture per mood from the style sheet, rebuilt as the library was, with slots and anchors written by hand. Paid: needs the owner's go-ahead for the pictures; World Labs calls are already approved.
8. **Room edits, two candidates, compared.**
   - **A, EVA constructs.** A structured description becomes geometry and is sampled to points (`room-generation.ts`, `procedural-room.ts`, `surface-sampler.ts`). Seconds, exact, slots survive. Risk: plain built surfaces beside a photographic room.
   - **B, picture then rebuild.** The room's current view is edited by an image model under the style sheet, then rebuilt as points from depth (19 s measured) or a draft splat (34 s measured). Keeps the photographic look. Risk: slow, the whole room shifts, slots must be found again.
   - Both end as a point cloud thrown into place by the field's existing transition. The same three edits go through both (a longer room, a new floor, a pool), captured side by side with time, what else changed, and whether slots survived. The owner picks.
9. **The backend.** The room's ledger kept by a server route. The Meshy admission. A generator that keeps the stock at its target within the daily ceiling, logs every call, and stops on repeated failure. Off unless its flag is set; target and ceiling in the environment (12 and 40).
10. **Light.** Each mood's cast as the room's default; lighting that does not fit as a discrepancy. Sound's events exposed, nothing played.

Steps 1 to 6 need no spending. Steps 7 to 9 make paid calls.

## Open, for the owner

- What becomes of the library once three base rooms exist: retired, or kept as a development fixture.
- Whether object pictures also move to GPT 2.6 Sunburst, or stay on `gpt-image-2.5-flare`.
- Still unpicked from earlier work: ordered dots or sand, the leave-and-arrive pairing, the menu's arrangement.
- What a day at the ceiling costs: 40 objects is 600 Meshy credits and 40 pictures; the price in money has not been looked up.
