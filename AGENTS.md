# EVA astral room: final visual demo

This document covers what the application is, what exists, how to run and check it, what is known to be wrong, and the rules for working here. Keep it current when you change something it describes. There is one other project document, `LIMINAL-GRAMMAR.md` (owner, 2026-11-16): how a room is composed and changed, the style every generation follows, and the build order for what comes next. Read it before any work on rooms, objects, menus or generation; where it differs from Direction below, it is later and wins. Do not add other planning, handoff or evidence documents.

Branch `final-visual-demo`, started 2026-11-16 from `future-demos`. The final visual demo is due about 2026-11-30.

## Direction

EVA is a fictional, unreliable machine presence shown on a large exhibition screen. It takes a visitor through a tunnel of points into a room it has imagined, which they move through and look around, while EVA talks at them.

For the final demo the owner wants two things changed from the state described below: the visitor interaction, and stronger visual aesthetics for the exhibit.

**Interaction (owner, 2026-11-16).** The exhibit will have few visitors, walking in and out unattended, and crowd chatter. Hold-to-talk speech and keyboard-and-mouse flight do not survive that, so they are being replaced:

- **Controller.** Handheld, on a tether or wireless. It carries the movement controls that `W A S D` provide today, and a dial that selects the lighting settings. The owner will build it (3D printed), after a prototype on a repurposed Xbox or similar game controller. Before either, the first slice is built and judged with the keyboard and mouse standing in for the controller and the camera; do not start game-controller input until the owner asks.
- **Camera.** A webcam near the screen, not mounted on it, tracks the one visitor holding the controller. Moving side to side changes the view of the scene; this replaces the mouse. Moving closer or further does nothing: the controller moves the viewer's location.
- **Voice.** Visitors no longer talk to EVA: no microphone, no transcription. EVA still speaks, in generated voice lines meant to unsettle and tease the visitor in response to what they do. Example from the owner: if the visitor has not worked out that they can move side to side, EVA asks, with sarcastic politeness, whether they knew they could.

- **Side to side** (decided): in the middle of the floor the view behaves like a window, so stepping right shows more of the left; near either edge the view keeps turning the same way, so a visitor can turn fully round.
- **Unattended** (decided): a visitor arriving starts the tunnel and room with no key to find; when they leave, the room returns to the void and waits.

Built so far (2026-11-16): the first slice of all of the above, with the keyboard and mouse as stand-ins and a placeholder voice. "What exists" describes it. Not built: the controller, the camera, EVA's real voice.

Still open, ask the owner before building: where exactly the camera sits and which way it points (it must face the visitor to measure side-to-side movement; a camera looking across the room from the side cannot); whether EVA's real lines are recorded in advance or generated live; how the lines stay audible over crowd chatter, since captions are not allowed.

**Changed later on 2026-11-16 (owner); where this differs from the list above, this wins:**

- **No camera for now.** The webcam is dropped. Keyboard and mouse stay the way to move and look; the game controller comes later, and still waits for the owner to ask. The mouse's side-to-side view stays as built.
- **The room is edited piece by piece** (first slice built 2026-11-16: a visitor replaces one hero object from a menu, see "Object replacement, visitor side" under What exists; the rest is not built). A visitor first picks from three categories and EVA generates the room; later visitors keep replacing its parts (walls, floor, objects) or ask for changes such as a longer room, so the room is never the same twice and never starts from nothing. EVA pushes back, sarcastically, on requests that are technically out of reach. Choices are made from menus EVA shows, not by speech.
- **Menus.** As few words as possible, and not bound by conventional interface patterns; thumbnails made of points are welcome. This relaxes "no labels" below for menus only.
- **Gather's code may be used.** The owner holds DAO's licence and Patreon subscription and said so. The licence text has not been read in any session; see Working rules.
- **The room keeps its ordered dots** (owner, 2026-11-16, after comparing them with Gather v17's grain as `?look=sand`). For an object change the owner likes **burn then fall** and **shatter then spiral**; glitch then morph was not picked. `?look=sand` is therefore an unchosen variant; it has not been removed, because the object change and the replacement objects share its file (`sand-look.ts`) and its passes. The captures the owner chose from are in `.local/look-compare/round2/` (`sheet.png`, and `crop-default.png` against `crop-sand.png` at 1:1). What they showed:
  - Sand now draws only the front surface (a depth pass of the same grains), with Gather's grain sizes (1.3 to 3.6 px), grains scattered off the rows, up to ten extra scattered passes, and brightness carried by how many grains there are. From the arrival view it is a crisp stipple, solid, as bright as the default, with the heroes level with the room. The first round's faults (blown out to white, then soft and see-through) came from layers adding up and from grains up to 16 px across.
  - Still wrong in sand: individual book spines are not readable (confetti at 1:1; the default reads them better), the ceiling panels do not read as lit, and an arriving object glows brighter than in the default. Surfaces nearer than about 1.8 to 3.6 m open up instead of filling.
  - In the default look a changing hero no longer turns into a white blob: its grains stay in the settled pass, and the burn shows EVA's red.
  - Found on the way: `ceilingPanels` in `posed-frames.ts` merges the visible room's panels into one fitting, so the panel glow lands between the real panels in both looks; and there are shells of stray grains 0.5 to 2 m in front of the arrival camera, which only sparse near grains hide.
  - Measured in headless Chrome at 1920x1080 (capped at 60): sand with ten passes held 16.7 ms a frame; twelve began dropping frames. Not measured at 3440x1440.
- **Measured:** a draft World Labs splat (`refine: false`) of the fifteen library frames came back within 34 s as 524,288 splats; the refined one took 17 to 19 minutes for 2M. One run; its look is not yet judged. Draft is what makes paint possible inside a visit.
- **Measured, one object (a brass diving helmet), one run each, timed from the moment its picture exists** (the picture itself took 16 s from OpenAI): picture to depth, 19 s, a front-only shell; picture to eight views' depth, 46 s, photographic from the front and torn at the sides; picture to eight views to draft splat to points, 79 s, the roughest; picture to a textured 3D model from Meshy, 32 s, the only one that is one solid shape from every side, with a plainer texture. Data, a plain-dot viewer and the comparison sheet are in `.local/object-test/` (`captures/sheet.png`). At the room's dot spacing a 0.5 m object gets about 6,700 points, so objects need finer sampling than the room. The owner has not yet picked a route.

**Aesthetics:** the room's grain is settled as ordered dots (see above). Anything else about the look is still to be asked; comparison variants are approved.

Do not infer the direction from the old crime-scene concept (a visitor suggests a room, EVA stages a solvable crime); that concept was rejected and its application has been removed.

Standing art direction (owner, 2026-11-12), which still applies unless the owner says otherwise:

- Mood: liminal spaces above all; surreal, out-of-body. EVA's hallucinated output should read as an artistic inference, not as an error.
- Look: a GPU point field after DAO's Gather / Wake. Grains must be crisp: hard, separate, with black between them. Ordered dots that follow each surface and a glow only where dots are dense and bright are the chosen default.
- Interface: no labels, sentences or captions. Allowed: brutalist marks (frames, crosshairs, ticks) and numerals, only where the number is real and live.
- The eye: a red, square-pupilled eye, always recognisable as an eye, alive and unpredictable inside, unmistakable while the microphone is live. It must read as a 3D object. Keep its travel and turning slow.
- Water in a room is real simulated water with depth. A room can swap between its points and its painted (splat) version.
- References the owner picked: Marshmallow Laser Feast "Works of Nature" (presentation), Ryoji Ikeda "data-verse" (numerals as clean abstract data), RICH&MIYU's Chemical Brothers "Live Again" (ordered dots that follow form; line ribbons that gather into objects).
- Process the owner chose for visual work: build variants in the engine, capture them side by side, and the owner picks. Do not finish a favourite unasked.

## Working rules

- Do the requested task and stop. Read this file, then only the code, callers and tests the task touches. No unrequested features, refactoring, research or scaffolding.
- Target is one desktop exhibition screen (ultrawide or LED wall) in Chrome; keyboard and mouse today, a physical controller and side webcam planned (see Direction). No mobile, responsive or touch work unless asked.
- Verify what you changed. Run `npm run check`. For visual work also look at the running application at desktop size; judge grain from PNG captures at 1:1, because JPEG smears single-pixel grains. Add a focused test for new non-trivial logic.
- Be truthful. Distinguish recorded fixtures from live generation, on screen and in reports. Never claim a check ran, a provider call worked, or a key is present without evidence from this session.
- No commits, pushes, publishing, installs, model downloads or spending without the owner asking. Paid provider calls need the owner's approval each time, with two exceptions: World Labs calls for this demo (approved without a cap on 2026-11-12), and calls a comparison experiment needs, so the owner can see which parts to keep (approved on 2026-11-16, any provider). Under both, make only the calls the check or comparison needs and report each one. Anything that runs unattended or repeatedly still needs asking.
- Never open `.env.worldlabs` or any other `.env` file. Pass it with `node --env-file`.
- Preserve existing protections in the server routes (origin checks, enable flags, request allowances, bounded inputs and responses). Model output is data, never code or permission.
- The planned interaction has no microphone. If visitor speech ever returns, the exhibit must first tell visitors their speech is sent to ElevenLabs and logged there (see Known faults). Camera frames must stay on the machine.
- DAO's Gather source is "not for redistribution" (its file header), and an earlier note here says the licence forbids publicly releasing an application built mainly from it. On 2026-11-16 the owner, who holds the licence, allowed adapting Gather's code in this project. Keep a credit comment where it is adapted, do not copy Gather's files or video into the project, and do not publish the source. The v17 source is at `C:\Users\alexx\Downloads\Gather-Source-v17\Gather-Source-v17` (its `LICENSE.txt` is not in that folder).

## Agents

The main session orchestrates on Fable 5.2 (pinned in the user settings). Workers are defined in `.claude/agents/`. Each definition fixes its model; GPT models run through the local Model Gateway and can only be reached through a definition.

| Agent | Model | Use for |
|---|---|---|
| `eva-ui-designer` | Fable 5.2 | Visual, shader, motion and interaction work; variant looks |
| `eva-implementer` | GPT-6 Astra | Non-visual code: routes, speech, room generation, contracts, tooling |
| `eva-mechanical` | GPT-6.1 Sol | Exactly specified, repetitive or documentation edits |
| `eva-researcher` | GPT-6.1 Sol | Read-only research in documentation and the codebase |
| `eva-reviewer` | Opus 5.5 | Read-only review of GPT-written work |
| `eva-reviewer-gpt` | GPT-6 Astra | Read-only review of Claude-written work |

- Never pass a `model` when spawning an `eva-*` agent. An override replaces the model in the definition; on 2026-11-12 every UI and research run went to Opus that way.
- A review crosses model families: `eva-reviewer` for GPT work, `eva-reviewer-gpt` for Claude work. The look of visual work is judged by the owner from captures, not by a reviewer.
- Parallel agents share one working tree and one dev port. Give each agent files no other agent is editing. A variant look goes in its own file behind `?look=`, and the orchestrator does the shared wiring (`looks.ts`, `AstralRoom.tsx`). The orchestrator alone starts the server on 5173 and takes the captures, one variant after another.
- Before reporting which model did a piece of work, read it from the subagent's transcript under `~/.claude/projects/`; the definition only says which model was requested.

## Several sessions at once

The owner runs several Claude Code sessions on this project at the same time, from the CLI and from VS Code conversations. Two things keep them apart.

**Sessions in the same folder take turns on a file.** A user-level hook, `~/.claude/hooks/file-queue.mjs` (rules in `../CLAUDE.md`), queues `Edit` and `Write` calls per file. An edit on a file another session is using is refused at once with the place in the queue kept: do other work, then retry, and the retry waits up to 5 minutes for the turn. Read the file again before retrying. The queue does not cover:

- Shell writes. Do not write project files through the shell.
- Subagents of one session, which count as one owner. The orchestrator still gives each its own files.
- The dev port and the git index. One session at a time runs the server on 5173, and one commits.

**A session doing longer independent work takes its own worktree**: a separate checkout at `.claude/worktrees/<name>` on branch `worktree-<name>`, started from the current commit (`worktree.baseRef` in `.claude/settings.json`).

- From a terminal: `claude -w <name>` in the project folder.
- From a VS Code conversation: Claude Code 2.1.322 cannot create a worktree there ("Refusing to use ... as an isolation worktree", because VS Code gives the folder path a lowercase `c:`). Create it with `git worktree add .claude/worktrees/<name> -b worktree-<name>`, then enter it by its path; entering an existing worktree works.
- A worktree needs no `node_modules`. It sits inside the project folder, so Node, `tsc`, `npm run` and Vite find the main checkout's packages by looking upward. **Never link or junction `node_modules` into a worktree**: `git worktree remove` deletes what is behind a junction (tested 2026-11-16 on a dummy folder), and installs are not allowed.
- Ignored files are not in a worktree: `.env.worldlabs` (pass `--env-file=../../../.env.worldlabs`), `.local/`, `dist/`.
- The routes accept only port 5173, so one checkout serves at a time. Stop your server when you have looked.
- To bring work back, commit in the worktree, then run `git merge worktree-<name>` in the main checkout. Remove a finished worktree with `git worktree remove`.

Checked 2026-11-16 in a worktree made by `claude -w`: `npm run check` passed (324 tests), the build succeeded, and the dev page loaded in headless Chrome with no console errors or failed requests (on temporary port 5199, because another session held 5173).

## What exists

`index.html` loads `src/main.tsx`, which mounts `AstralRoom`. There is one page; the only interface drawn over the room is the inspection marks and the replacement menu, neither with words.

Sequence: black void with the eye. If no room exists, the void offers the three moods first (next paragraph). If one exists, any key press or mouse movement counts as a visitor arriving and starts a spiral tunnel of points, which carries the viewer along it (at least 12 seconds). The room forms at the far end from the tunnel's own points. A 12 second arrival flight follows, then the visitor has control. After 45 seconds in the room with no input, the room disperses back into the void and waits for the next visitor.

**The void's choice (2026-11-17, `LIMINAL-GRAMMAR.md` step 6).** While no room exists, three small rooms of points wait round the eye in the void, one for each mood, with no words: quietly liminal, subtly uncanny, eerie absence, in that order. Nothing starts until one is picked.

- **Whether a room exists** is `mood-choice.ts`: `chosenMood()`, `chooseMood(mood)`, `forgetMood()`. The mood is kept in the browser's storage (key `eva.astral.mood`) and read back as untrusted data: anything but a mood's name is no room. A marked shortcut, as the room's memory is: one machine, one browser profile, one address.
- **Picking** uses the menu's keys and mouse: `A`/`D` or the arrow keys, or mouse travel, move between the three; `Enter`, `F` or a click picks. `Esc` does nothing (the choice opens again on the first mood). The pick stores the mood and starts the tunnel. **Until step 7 every mood's room is the recorded library**, and the console says so at each pick.
- **A small room** (`moodRoom`) is a thinned copy of its mood's base room: the part ahead of the spot where the visitor arrives and a metre behind it, without the half percent of points at each end of each axis (the library's stray points reach 19 m out and would shrink the room to a sliver), at most 24,000 points, each as bright as it was and its colour taken 80% of the way to the mood's cast (`MOOD_CASTS`: yellow-green, teal, warm white with green in it). All of these are starting values.
- **Drawn by the menu's own view**: a second `createMenuView`, which now takes a scale and a point count; the three rooms are drawn at 1.6 times a menu choice's size. The arrangement is the menu's switch, `?menu=ring|row|one`, and none is chosen. In the void the eye is left in its idle phase, not put in its thinking phase as the room's menu does.
- **Nothing in this checkout forgets the mood.** `forgetMood()` is for the room's ending (a spent room dispersing, the owner's key), which is another session's step 5. Until that is merged, a room once chosen exists until the stored key is removed by hand.

In the room, the keyboard and mouse stand in for the planned controller and camera:

- Keys move the viewer. The mouse's left-right place across the page is where the visitor stands, side to side; `flight.ts` `setSide` is the seam the camera will later drive. There is no mouse-look and no pointer lock. The view does not tilt up or down.
- If a visitor has been giving input for 20 seconds without moving side to side, EVA teases them aloud, again every 30 seconds, until they move across a quarter of the floor width. The lines are placeholders in `tease.ts`, spoken by **the browser's built-in voice, not EVA's voice**; the console says so on every line. Chrome will not speak until the page has had a key press or click, so an exhibition machine needs the `--autoplay-policy=no-user-gesture-required` flag or recorded audio.

The room is the **recorded library**: `public/fixtures/library/`, rebuilt once from a single picture with World Labs (fifteen generated views, then a 2M-splat reconstruction). 3.84M points. Five inspectable heroes: melted clock, statue head, pool, sky cube, spiral of books. It has a simulated pool and a painted splat version. Outside what the one picture showed (more than about 55 degrees from its centre, so beside and behind the arrival spot) the points are drawn as thin upright lines of falling marks instead of where the reconstruction put them (`point-field.ts`, `uSeenAt`); the paint there is unchanged. This is a recording, not live generation, and the console says so.

**No longer reachable from the page** (code and tests kept, nothing calls them): talking to EVA (`conversation.ts`, `src/speech/`, the four server routes) and the live room (`room-generation.ts`, `surface-sampler.ts`'s use by it, and the live-room files in `src/room/`). The live room never produced a room end to end (see Known faults). Decide with the owner whether EVA's real voice reuses the speech route before deleting any of it.

**Object replacement, data side (2026-11-16; the page calls it through the visitor side, below).** `object-points.ts` exports three functions:

- `loadShelf(signal)`: the recorded shelf of six models as `{ id, name, glb }`, with `glb` a URL. The console says it is a recording.
- `loadObjectPoints(glbUrl, box, signal, density = 2)`: a model as points in room coordinates, scaled evenly to the largest size that fits the box, centred, standing on the box's floor, 1 mm clear of the box's faces, with normals and unlit texture colour. `density` is linear against the sampler's lattice (2 is half the spacing, four times the points) and is the factor to tune from captures; an object is capped at 250,000 points, past which its whole lattice coarsens.
- `replaceHero(room, hero, object)`: a new cloud without the room's points inside that hero's box, then the object's points; that hero's `count` becomes the object's points in the box, and everything else is carried over.

The live route `/api/object` (below) makes a fresh model of one of the same six objects. **Today it refuses every real model at its last step**; see Known faults.

**Object replacement, visitor side (2026-11-16).** With keyboard and mouse only, a visitor looks at a hero, opens a menu, picks a replacement and watches the old object leave and the new one arrive. Everything offered is the recorded shelf; nothing is generated live.

- **The menu** (`menu.ts`, `menu-view.ts`). While a hero is inspected, `F` or a click opens it. Each choice is the object itself as a small point cloud, turning slowly; there are no words. The selected one is the largest and brightest, in corner brackets. The rest of the room steps back to about a third of its light. While it is open the eye is put in its "thinking" phase, which brings it in front of the viewer, and the choices come out of the eye and stay round wherever it is on screen (moved in from the frame's edge so they all fit). `A`/`D` or the arrow keys move one choice along and wrap round; the mouse moves one choice for every 1/24 of the page's width it travels, and the side-to-side view holds still meanwhile. `Enter`, `F` or a click picks; `Esc` closes. The flight never sees the keys while the menu is open. The menu does not open during a change, or while any of the painted room is on screen.
- **Three arrangements, not chosen: `?menu=ring` (default), `row`, `one`.** Ring: the choices circle the eye and the circle turns to bring the selected one below it. Row: a fixed line under the eye; the selected one rises and grows. One: one large object under the eye with its two neighbours small beside it. Delete the two the owner does not keep.
- **The change** (`sand-look.ts`, `point-field.ts`). The page fits the picked model to the hero's box and calls `replaceHero`; the field takes from the new cloud only the points in that box and draws them as an object of its own beside the room's grains, which are never rebuilt, so every other grain keeps its place and its index. What stood in the box leaves by one of the three pairings and the new points arrive, over 5 seconds, in both looks. Each replacement takes the next pairing in turn (burn then fall, shatter then spiral, glitch then morph) until the owner picks one. A hero can be replaced again: then the earlier replacement is what leaves.
- **Pushback** (`tease.ts`, `REFUSALS`). Two entries after the six objects are requests EVA will not do: a door, and a second eye. Picking one makes her say a line in the placeholder browser voice, the entry turns the eye's red, and nothing changes. She also refuses, with a line and no menu, to have the pool replaced, because its water is simulated apart from the points. The wording is placeholder.
- **Memory** (`replacements.ts`). Each replacement a visitor makes is recorded as hero index and shelf id in the browser's `localStorage` (`eva.astral.replacements`), one entry per hero, and made again whenever the recorded library loads (the console says how many). **This is a shortcut: the room is remembered on one machine, in one browser profile, for one address.** What is stored is read as data and anything that is not a hero index with a shelf id is dropped.

### Keys and address-bar switches

| Input | Effect |
|---|---|
| Any key, or moving the mouse | From the void, when a room exists: start the tunnel and the recorded library |
| In the void, when no room exists: `A` / `D`, arrow keys, or moving the mouse | Move between the three moods' small rooms. `Enter`, `F` or a click picks one and starts the tunnel. `?menu=ring\|row\|one` arranges them as it does the menu |
| `W A S D` | Move. `Space` / `E` up, `Shift` / `Q` down |
| Mouse left-right | Where the visitor stands: a window in the middle, turning near the edges |
| `R` | In a room: throw its points into the recorded library again |
| Look at a hero, or fly within 1.2 m | Inspect: its grains brighten, the room dims, brackets and four lines of real numerals appear |
| `F` or a click, while a hero is inspected | Open the menu of replacements for it. On the pool: EVA refuses aloud |
| In the menu: `A` / `D`, arrow keys, or moving the mouse | Move between the choices. `Enter`, `F` or a click picks; `Esc` closes the menu and nothing else |
| `P` | Swap points and painted (splat) room: thin vertical lines of marks fall from the ceiling, some long, some short, and open into the paint |
| `8` `9` `0` `-` | Lighting: liminal, afternoon, night, dark. `L` toggles lamps |
| `1` to `7` | Effects: calm, breathe, melt, scatter, weightless, smear, vortex |
| `Esc` | Stop: EVA's line, a tunnel in progress. Mouse movement will not restart it until the next key press |
| `?px=0.5` to `2` | Render scale cap (default 1.5); lower it for a slow machine on a big screen |
| `?room=surreal` | `R` loads the earlier fixture `public/fixtures/surreal-library/` instead (GLB meshes sampled to points) |
| `?look=ribbons,data` | Two unchosen prototype looks (see below) |
| `?look=sand` | Comparison variant, not chosen: the settled room drawn with Gather v17's grain (soft round grains that add up, counted in a float buffer and toned), instead of ordered opaque dots |
| Dev server only | `?eye=idle\|listening\|thinking\|speaking\|unavailable`, `?splats=standin`, `?splatmax=`, `?splatnear=` |
| `?menu=ring\|row\|one` | The menu's arrangement (default `ring`); none is chosen |
| Dev server only: `G` | Replace a hero without the menu (the inspected hero, else the nearest; never the pool) with the next object of the shelf. Each press takes the next pairing: burn then fall, shatter then spiral, glitch then morph. Works in both looks. Not remembered |
| Dev server only: `Backspace` | Forget every remembered replacement and load the recorded library again |
| Dev server only: `?swap=<hero>,<pairing>,<0..1>` | That hero replaced by the shelf's first object (the diving helmet) on arrival, the change held still at a progress, for matching captures. Not remembered. Heroes: 0 clock, 1 statue head, 2 pool, 3 sky cube, 4 books |

### Source map

`src/astral/` is the application.

| File | Role |
|---|---|
| `AstralRoom.tsx` | Shell: renderer, stage sequence (void, tunnel, arriving, room, dissolving), keys, wiring |
| `types.ts` | Shared contract: `PointCloud`, `RoomLights`, `RoomHero`, effects, lights, phases, `AstralReply`, `TUNNEL` |
| `mood-choice.ts` | The void's choice, pure: which mood's room exists, kept in the browser's storage (`chosenMood`, `chooseMood`, `forgetMood`); each mood's cast and its small room for the void (`MOOD_CASTS`, `moodRoom`) |
| `point-field.ts` | The GPU point renderer: tunnel cloud, tunnel-to-room arrival, seven effects, lighting moods (`MOODS`, `nextLighting`), hero highlight, the objects that replaced heroes (`replaceHero`). Largest file |
| `flight.ts` | Key-driven flight, the side-to-side view (`sideView`, `setSide`), guided camera, arrival path |
| `tease.ts` | EVA's unprompted lines and her refusals (`REFUSALS`): placeholder wording, when a tease is due, and the placeholder browser voice |
| `menu.ts`, `menu-view.ts` | The menu of replacements. `menu.ts` is pure: which choice is selected, each arrangement's layout, the two refused entries as points. `menu-view.ts` draws the choices as turning point clouds round the eye |
| `grammar.ts` | Not used by the page. The room's ledger as pure data (`LIMINAL-GRAMMAR.md`, step 1): what stands in each slot (`standingNow`), the three hidden values (`roomValues`), the state read off them (`roomState`), a stored ledger read as untrusted data (`parseLedger`). Every weight and threshold is a named constant at the top of the file |
| `grammar-decide.ts` | Not used by the page. What EVA allows and how a picked thing enters (`LIMINAL-GRAMMAR.md`, step 1), pure and seeded: `decideChange` refuses (`unknown`, `spent`, `fit`, `anchor`) or gives the visitor's change with its discrepancy and pose, plus a change putting the old strong discrepancy right; `roomSpent`; `arrivalOf`. The allowed sizes, copy counts and clearances are proposals, named constants at the top of the file |
| `replacements.ts` | Which hero was replaced by which shelf object, kept in the browser's storage and read back as untrusted data |
| `sand-look.ts` | The `sand` look, and the object change in both looks: the leave and arrive shader (`SWAP_VS`), its pairings and timing, `heroGrains` |
| `eye.ts`, `eye-shader.ts`, `eye-source.ts`, `eye-fits.ts`, `eye-marks.ts`, `eye-volume.ts` | The eye: its raster source, shader, irregular fits, tracking marks and numerals, volume |
| `conversation.ts` | Not used by the page. Hold-to-talk voice loop: sends the transcript to the decision and reply routes in parallel; both carry effect, intensity and light |
| `room-source.ts` | Loads the recorded room: baked points, else splats, else posed frames; `?room=surreal` path |
| `baked-points.ts`, `splat-points.ts`, `posed-frames.ts` | Three ways from the library fixture to an ordered point cloud; manifest validation is in `posed-frames.ts` |
| `room-generation.ts`, `surface-sampler.ts` | Live room: description to procedural meshes to points. `room-generation.ts` is not used by the page; the sampler still serves `?room=surreal` and object replacement, and takes a `density` option (linear; 1 is the room's lattice) |
| `object-points.ts` | Object replacement, data side: the recorded shelf, a model as points fitted into a hero's box, the room with one hero exchanged. Called by `AstralRoom.tsx` |
| `splat-view.ts` | Renders `room.spz` with Spark as "the paint"; the points-to-paint swap; draw layers |
| `water.ts`, `water-sim.ts` | Height-field wave simulation over the pool, drawn as points and as splats |
| `inspect.ts`, `inspect-marks.ts` | Which hero the viewer is inspecting; its brackets and numerals on a 2D canvas |
| `glow.ts` | Bloom limited to dense bright areas; always on |
| `looks.ts`, `ribbons.ts`, `data-layer.ts`, `data-marks.ts` | Prototype looks behind `?look=`. `ribbons`: arrival as bundles of 1 px strands. `data`: four corner groups of live values. The owner has not chosen either; delete the ones not kept |

`src/speech/` is the browser side of speech (microphone capture, realtime transcription, playback). `src/server/` holds the five dev-server routes. `src/room/` is what remains of the earlier crime-scene application, kept only because code in `src/astral/` imports it:

- `room-interpret.ts`, `room-interpretation-result.ts`, `room-description.ts`, `room-case.ts`, `procedural-room.ts`, `spatial-fixture.ts`: the live room path. The compose-room contract still requires a crime "case" in every reply; nothing in the astral room uses it.
- `construction-fixture.ts` and what it imports (`construction-animation.ts`, `construction-reveal.ts`, `room-display.ts`, `room-paint.ts`, `room-inspection.ts`, `room-prop-request.ts`, `room-prop-visual.ts`, `prop-glb-admission.ts`, `prop-png-admission.ts`): needed only to validate the `?room=surreal` fixture manifest. Removing that switch would let all of these and `public/fixtures/surreal-library/` go.

### Server routes

Routes exist only inside the Vite dev and preview servers (`vite.config.ts`); a static build has none. The page calls none of them at present (see above). Each route is off unless its flag is `1`.

| Route | Provider and model | Flag | Key | Allowance variable (default) |
|---|---|---|---|---|
| `/api/speech` | ElevenLabs: `scribe_v2_realtime`, `eleven_v3` | `EVA_ENABLE_SPEECH` and `EVA_SPEECH_PRIVACY_CONFIRMED` | `EVA_ELEVENLABS_API_KEY`, `EVA_ELEVENLABS_VOICE_ID` | `EVA_SPEECH_MAX_ATTEMPTS` (3; a turn uses 2) |
| `/api/astral-reply` | Anthropic `claude-opus-5-5` | `EVA_ENABLE_ASTRAL_REPLY` | `EVA_ANTHROPIC_API_KEY` | `EVA_ASTRAL_REPLY_MAX_REQUESTS` (20) |
| `/api/astral-decision` | Jev `jev-1.14.0` | `EVA_ENABLE_ASTRAL_DECISION` | `EVA_JEV_API_KEY` | `EVA_ASTRAL_DECISION_MAX_REQUESTS` (20) |
| `/api/compose-room` | Anthropic `claude-opus-5-5` | `EVA_ENABLE_ROOM_INTERPRETATION` | `EVA_ANTHROPIC_API_KEY` | `EVA_ROOM_INTERPRETATION_MAX_REQUESTS` (3) |
| `/api/object` | OpenAI `gpt-image-2.5-flare`, then Meshy `meshy-t2.5` | `EVA_ENABLE_OBJECT` | `EVA_OPENAI_IMAGE_API_KEY`, `EVA_MESHY_API_KEY` | `EVA_OBJECT_MAX_REQUESTS` (3; a request is one picture and one model) |

`GET` on a route with an `Origin` header reports its status without a provider call.

`/api/object` (`src/server/object.ts`) takes `POST { "id": ... }` where the id is one of six objects in a fixed list in that file (`OBJECTS`: diving helmet, gramophone, rocking horse, globe, chess knight, televisions); the prompt is built on the server and no visitor text reaches a provider. It asks OpenAI for a 1536x1024 picture, sends it to Meshy for a textured model (smart topology, 10,000 target faces), polls every 2 s, downloads the GLB only from `assets.meshy.ai` (8 MiB at most), checks it with `validatePropGlb` and replies with the GLB bytes (`model/gltf-binary`); a failure is JSON with an `error` code. One request at a time, six minutes at most. `GET` also lists the six ids. On success the server console logs the timings, the picture's token count and the model's credits as live generation.

### Fixtures

- `public/fixtures/library/`: `manifest.json` (frames with cameras, `splats`, `points`, `water`, five `heroes` boxes), fifteen frame trios (picture, depth EXR, confidence), `room.spz` (32 MB), `points.bin` (69 MB bake). **Re-bake `points.bin` whenever `room.spz`, `manifest.water` or a `heroes` box changes**; a bake with a stale header is rejected and the points are recomputed from the splats (about 19 s), but a changed hero box is not detected: the old bake loads with the old point density. Points inside a hero box are sampled at half the room's spacing. The bake script is `.local/bake-library-points.mjs`, which is not in the repository.
- `public/fixtures/surreal-library/`: the earlier recorded room (GLB shell and hero models); its own README describes it.
- `public/fixtures/objects/`: the recorded shelf for object replacement. `manifest.json` (`objects`: id, name, glb file name) and six Meshy textured GLBs, 2.7 to 4.7 MB each, 22 MB together: diving helmet, gramophone, rocking horse, antique globe, marble chess knight, stack of televisions. Each was generated once on 2026-11-16 from an OpenAI picture; the helmet is the model of the first measured run, the other five went through the `/api/object` handler. The pictures, every provider call and plain-dot captures are in `.local/object-shelf/` (`calls.jsonl`, `captures/shelf-density-2.png`), which is not in the repository.

## Running and checking

- `npm run dev`, open `http://127.0.0.1:5173/` in Chrome, and move the mouse or press a key. Nothing paid, no keys needed.
- With provider keys, for the routes the page no longer calls: `node --env-file=.env.worldlabs node_modules/vite/bin/vite.js` with the flags above set to `1` in the shell.
- Ports are fixed and strict: 5173 for dev, 4173 for preview. A leftover `node` process holding the port makes the next start fail; find and stop it instead of changing the port.
- `npm run check` runs the typecheck and the tests. `npm run build` writes `dist/`.
- Headless captures need Chrome with a GPU: `chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })`. Playwright is a dev dependency.

Checked on 2026-11-16 after the first interaction slice: typecheck clean; 324 tests pass in 27 files; the build succeeds. In headless Chrome the built page had no console errors; mouse movement alone started the tunnel and the library; the view shifted with the mouse and turned at the edge; the room dispersed after 45 seconds without input and a key press brought it back; the tease fired 20 seconds after control and not after side-to-side movement. Not checked: the placeholder voice being audible (headless Chrome has no sound), how the side-to-side view feels in the hand, frame rate, any provider call.

Checked on 2026-11-16 for object replacement, with no dev server: 337 tests pass in 30 files, among them the shelf manifest, the fit into a box, the density factor, `replaceHero`'s counts and the route's protections against a synthetic provider. Five real requests went through the `/api/object` handler called directly from a script: the picture took 13.9 to 16.8 s (1,434 to 1,442 tokens each, as OpenAI reported), the model 29 to 40 s from submission to download (15 credits each, as Meshy reported), the whole request 43 to 56 s, and each ended in the 422 described under Known faults. In headless Chrome, with files answered from disk, all six shelf models became points in the statue-head box in 0.1 to 0.17 s each with their texture colours, every point inside the box, and `replaceHero` on the real 3.83M-point room took 0.07 s and gave the expected counts. Not checked: the route inside a running dev server, a 200 reply for a real model, anything in the engine's look, and the typecheck as a whole (it failed at the time on three files another session was editing: `AstralRoom.tsx`, `point-field.ts`, `sand-look.ts`).

Checked on 2026-11-16 for the visitor's side of object replacement, in headless Chrome at 1920x1080 against the dev server, on the sky cube: typecheck clean; 350 tests pass, among them the menu's selection and layouts, the stored replacements, the points taken for a new object, and a line for every refusal. A click and `F` each opened the menu with the six shelf objects and the two refused entries; six presses of `D` moved the selection and moved the viewer 4 mm (the flight did not see them); picking the door logged EVA's refusal as a placeholder-voice line, turned the entry red and changed nothing; mouse travel moved the selection; `Esc` closed the menu and nothing else; picking the gramophone replaced the cube over 5 seconds and stored `[{"hero":3,"object":"gramophone"}]`; after a reload the room arrived with the gramophone and the console said 1 of 1 replacements was made again; `Backspace` emptied the storage and brought the cube back. With `G` the same hero was replaced twice in both looks: the second time the first replacement left. No console errors. PNG captures are in `.local/object-menu/`: `menu-ring-default`, `menu-row-default`, `menu-one-default`, `menu-ring-sand`; `replace-default-025`, `-050`, `-080` and `replace-sand-025`, `-050`, `-080` (burn then fall held at those shares, seen from beside the line to the hero so it is not inspected); `flow-default-*` (the whole path above) and `twice-*`. `npm run build` succeeds. Not checked: the placeholder voice being audible (headless Chrome has no sound); the menu in the hand with a real mouse; how long the page stalls when a replacement starts (the room's 3.8M points are copied once) and the frame rate with the menu open; any hero but the sky cube; the row and one arrangements in sand; an ultrawide frame; the built page (only the dev server was looked at).

Earlier measurements (2026-11-12, not repeated): 60 fps at 3440x1440 in headless Chrome on an RTX 5080 (headless caps at 60, so headroom is unknown). One live voice turn worked: Jev decision in 0.1 s, Opus reply in 2.4 s, spoken reply; EVA began speaking about 13 s after the visitor stopped.

Checked on 2026-11-17 for the void's choice (`LIMINAL-GRAMMAR.md` step 6), in a worktree at the commit before steps 2 to 5, in headless Chrome at 1920x1080 against its dev server on temporary port 5199, default look: typecheck clean; 395 tests pass in 35 files, among them the stored mood (chosen, read back, forgotten, read as untrusted data, a storage that fails) and the small room (thinned evenly, stray points and what lies behind the arrival spot left out, each cast, brightness kept). `npm run build` succeeds. `.local/void-choice/capture.mjs` took one page through the path and checked each step against the console and the browser's storage:

1. A first visitor finds no room; nine seconds later the three small rooms are round the eye and nothing has started (`ring-01-void`).
2. Each mood selected in turn by `D` (`ring-02-quiet-selected`, `-03-uncanny-`, `-04-eerie-`); nothing starts and nothing is stored.
3. Mouse travel of a 24th of the page's width moves one along (`ring-05`). `Esc` leaves the choice offered (`ring-06`).
4. `Enter` on the third: `eerie` is stored, the console names the mood and says the room is a recording, the tunnel starts (`ring-07`).
5. The page loaded again: a room exists, the void waits with no choice (`ring-08`), and moving the mouse starts the tunnel.
6. With the stored mood removed by the script and the page loaded again, a click picks the selected mood (`quiet`).
7. With `{"mood":"surreal"}` stored and the page loaded again, the choice is offered and mouse movement starts nothing (`ring-09`).

The row and one arrangements were taken through steps 1 and 2 only (`row-*`, `one-*`). `room-menu.mjs` then arrived in the room with a mood stored, opened the replacement menu on the sky cube and picked the gramophone, to see that the room's own menu still works (`room-menu-open`, `room-menu-picked`). No console errors, page errors or failed requests in the runs kept. **The ring path was run seven times; the second run reported a failure whose line was not kept, and the five runs after it passed.** A guess, not checked: the script loaded the page again while the room's files were still arriving, which the browser reports as a failed request; the script now waits before that load, and the last run was with that wait.

Not checked: any of it watched running or used by a person with a real mouse; the three rooms together with step 5's ending of a room, since `forgetMood()` has no caller in this checkout; the sand look; an ultrawide frame; frame time with the three rooms on screen; how long the first frame stalls when the library is thinned (3.8M points are read once); the built page; whether the casts and sizes are right, which is the owner's to say. No reviewer agent read this work.

## Known faults and open items

Live path:

- **No live room has ever appeared.** The one attempt returned `unsupported`: EVA's reply prompt asks for liminal corridors, stairwells and waiting rooms, while the composer can only build one box room with basic furniture and rejects lighting requests. The two prompts contradict each other. The owner deferred the fix, along with the picture-to-room pipeline (EVA paints a picture from speech, then rebuilds it in 3D) and automatic hero detection.
- **Latency.** The reply and the voice are not streamed, hence the 13 s wait.
- **ElevenLabs logs sessions.** Zero retention is refused on this account tier; the code logs the provider's warning and continues. The owner accepted this for testing only.
- Voice level reaches the eye as an on/off gate, not a real level.

Library room:

- The melted clock's hero box was 0.6 m off until 2026-11-16 (it covered the shelf beside the clock), so the clock had ordinary point density and was nearly invisible as points; the box is corrected and the points re-baked. Its shape, face and rim now read; the Roman numerals are only hinted at, and from the arrival spot about 3,900 stray points still float in front of it. The near-left shelf and the ceiling are noisy as points. Looking back toward the entrance, the glass wall shows seams. The paint has thin soft strips at the far left and right of the arrival view.
- Lighting moods do nothing while the paint is shown. This room has no lamp, so `L` does nothing in it.
- The eye and the water were each mid-revision on 2026-11-12: the eye toward more dispersal and a 3D read, the pool toward reading as deep with a coping round its rim.

Object replacement:

- **`/api/object` refuses every real model (`invalid_mesh`, HTTP 422), after the picture and the model have been paid for.** `prop-glb-admission.ts` was written for small untextured props and rejects what Meshy's textured export contains: a JPEG texture (2048 px, 2.5 to 3.7 MB; the admission allows PNG only, 512 px and 2 MB), `doubleSided: true`, `normalized: false` on accessors, an identity `matrix` on the node, and a mipmap, repeating sampler. All five real requests on 2026-11-16 ended this way. Widening the admission for these models is the owner's decision (an attempt to edit it in that session was stopped by the permission system). Until then only the test with a synthetic provider shows a 200 reply.
- The six shelf models do not pass that admission either, for the same reasons; they were saved from the provider's download by the generation script, and the browser loads them with three.js's own GLB loader.
- **The painted (splat) room still shows the old object** after `replaceHero`: only the points change. The pool's water is also carried over, so an object put in the pool's box would stand on the basin floor under the water.
- An object's colours are its unlit texture, while the room's points carry the room's own lighting (`lit`); how the two sit together has not been looked at in the engine. Models face whichever way Meshy turned them (the rocking horse is head-on to the arrival view); there is no turn parameter.
- Not looked at: an object in the room in the engine's look (only plain-dot captures of the objects alone exist), and the default density of 2 (43,000 to 120,000 points in the statue-head box, against the 104,819 that hero has) is a starting value the owner has not judged. (Since then the visitor side has put the helmet and the gramophone in the sky cube's box in the engine, in both looks; see the next items and `.local/object-menu/`. Nobody has judged the density.)
- The page refuses to replace the pool (EVA says a line), for the reason above. A replacement of the pool found in storage is skipped on load.
- A replacement is drawn as an object of its own until the room is next loaded. Until then the field keeps the hero's box the room was set with, so a changed cloud that moved or resized that box would not be followed, and `R` throws the room from its original homes, the replaced hero among them. Floor and wall points that lie inside a hero's box leave with it; only the sky cube, which hangs clear of everything, has been replaced and looked at. The clock, the statue head and the books have not.
- A replacement started while another is running cuts the first short. The page keeps a visitor from doing that (the menu does not open during a change); the dev key `G` can.
- In the default look, about half-way through burn then fall, almost nothing shows in the box: the old object's last grains are dark ash and the new one's first grains are few. Glitch then morph is full of grains at the same moment. Which pairing is kept is the owner's to pick.
- In sand, an inspected hero comes out pure white (`menu-ring-sand`), and half-way through burn then fall the last leaving grains show as a dark smear with a black rim (`replace-sand-050`). Seen without inspection the arriving helmet reads as a helmet. Another session was retuning the sand look, in `sand-look.ts` and `point-field.ts`, throughout this work, so the sand captures show its state at that minute and the cause was not pursued.
- The menu stays round the eye, and the eye wanders, so the choices sometimes lie over the hero being replaced. `eye.ts` was not changed for the menu: the eye is only put in its thinking phase. After choosing with the mouse, the side-to-side view goes to wherever the mouse now is.
- The shelf objects are unlit texture colour in a room whose points carry its lighting: in the default look the gramophone's horn and the helmet come out brighter than anything else in the room.

The void's choice:

- **The three small rooms are one room three times**, the library tinted three ways, until step 7. What tells them apart is colour alone.
- The library is read twice for a first visitor: once to make the small rooms, once more when the tunnel starts (the browser's cache answers the second). If it cannot be read, no choice is shown and no room can be chosen; the console says so.
- A small room turns as a menu's object does, seen from 14 degrees above, so side-on it is a thin slab. Its ceiling is drawn (dim, as the far side of any choice is), and the heroes come out as white blobs because their points are four times as dense as the room's.
- In the ring and the row at 1.6 times, the three rooms fit the frame's height only where the eye is above the middle; elsewhere they are moved in from the edge, so the eye is not at their centre. In `one`, the selected room is large enough to lie over the eye.
- The eye's own marks and numerals are drawn among the rooms, and the eye in its idle phase sometimes leaves the frame for a second or two; the rooms then wait at that edge.
- `Esc` puts the selection back on the first mood. After a pick with the mouse, the side-to-side view goes to wherever the mouse now is, as after the room's menu.
- If the browser's storage refuses, the pick still starts the room, and the next void offers the three moods again.

Display:

- The render scale cap of 1.5 means a display at 200% scaling is upscaled by the browser, which is real blur. The exhibition screen's resolution and scaling are not yet known; final judgement of sharpness has to happen on that screen.
- `npm install` reported one moderate advisory on 2026-11-12; not examined.

Repository:

- `points.bin` (69 MB) is committed as an ordinary file. GitHub warns above 50 MB and refuses above 100 MB; decide on Git LFS before the first push of this branch.

## Where the earlier work is

Commit `f661157` on this branch is the complete state before the cleanup: the crime-scene application (`?legacy`), head-tracked viewpoint with MediaPipe, prop and paint generation routes, their tests, the old planning documents and the archive of the previous project. `git show f661157:<path>` restores any file. The `future-demos` branch holds the same documents without the astral work. Consult them only when a task needs a specific idea from them; none of their processes apply here.
