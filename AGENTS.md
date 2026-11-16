# EVA astral room: final visual demo

This is the only project document. It covers what the application is, what exists, how to run and check it, what is known to be wrong, and the rules for working here. Keep it current when you change something it describes; do not add other planning, handoff or evidence documents.

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

**Aesthetics: not yet specified.** Ask before designing a new look.

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
- No commits, pushes, publishing, installs, model downloads or spending without the owner asking. Paid provider calls need the owner's approval each time, except World Labs calls for this demo, which the owner approved without a cap on 2026-11-12; still make only the calls a check needs and report each one.
- Never open `.env.worldlabs` or any other `.env` file. Pass it with `node --env-file`.
- Preserve existing protections in the server routes (origin checks, enable flags, request allowances, bounded inputs and responses). Model output is data, never code or permission.
- The planned interaction has no microphone. If visitor speech ever returns, the exhibit must first tell visitors their speech is sent to ElevenLabs and logged there (see Known faults). Camera frames must stay on the machine.
- DAO's Gather source licence forbids publicly releasing an application built mainly from it. Gather and Wake are references only; their source and video are not in this project.

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
- Parallel agents share one working tree and one dev port. Give each agent files no other agent is editing. A variant look goes in its own file behind `?look=`, and the orchestrator does the shared wiring (`looks.ts`, `AstralRoom.tsx`). The orchestrator alone starts the server on 5173 and takes the captures, one variant after another. Worktrees are not used: they have no `node_modules`, and installs are not allowed.
- Before reporting which model did a piece of work, read it from the subagent's transcript under `~/.claude/projects/`; the definition only says which model was requested.

## What exists

`index.html` loads `src/main.tsx`, which mounts `AstralRoom`. There is one page and no on-screen interface.

Sequence: black void with the eye. Any key press or mouse movement counts as a visitor arriving and starts a spiral tunnel of points, which carries the viewer along it (at least 12 seconds). The room forms at the far end from the tunnel's own points. A 12 second arrival flight follows, then the visitor has control. After 45 seconds in the room with no input, the room disperses back into the void and waits for the next visitor.

In the room, the keyboard and mouse stand in for the planned controller and camera:

- Keys move the viewer. The mouse's left-right place across the page is where the visitor stands, side to side; `flight.ts` `setSide` is the seam the camera will later drive. There is no mouse-look and no pointer lock. The view does not tilt up or down.
- If a visitor has been giving input for 20 seconds without moving side to side, EVA teases them aloud, again every 30 seconds, until they move across a quarter of the floor width. The lines are placeholders in `tease.ts`, spoken by **the browser's built-in voice, not EVA's voice**; the console says so on every line. Chrome will not speak until the page has had a key press or click, so an exhibition machine needs the `--autoplay-policy=no-user-gesture-required` flag or recorded audio.

The room is the **recorded library**: `public/fixtures/library/`, rebuilt once from a single picture with World Labs (fifteen generated views, then a 2M-splat reconstruction). 3.84M points. Five inspectable heroes: melted clock, statue head, pool, sky cube, spiral of books. It has a simulated pool and a painted splat version. This is a recording, not live generation, and the console says so.

**No longer reachable from the page** (code and tests kept, nothing calls them): talking to EVA (`conversation.ts`, `src/speech/`, the four server routes) and the live room (`room-generation.ts`, `surface-sampler.ts`'s use by it, and the live-room files in `src/room/`). The live room never produced a room end to end (see Known faults). Decide with the owner whether EVA's real voice reuses the speech route before deleting any of it.

### Keys and address-bar switches

| Input | Effect |
|---|---|
| Any key, or moving the mouse | From the void: start the tunnel and the recorded library |
| `W A S D` | Move. `Space` / `E` up, `Shift` / `Q` down |
| Mouse left-right | Where the visitor stands: a window in the middle, turning near the edges |
| `R` | In a room: throw its points into the recorded library again |
| Look at a hero, or fly within 1.2 m | Inspect: its grains brighten, the room dims, brackets and four lines of real numerals appear |
| `P` | Swap points and painted (splat) room, through a spreading front |
| `8` `9` `0` `-` | Lighting: liminal, afternoon, night, dark. `L` toggles lamps |
| `1` to `7` | Effects: calm, breathe, melt, scatter, weightless, smear, vortex |
| `Esc` | Stop: EVA's line, a tunnel in progress. Mouse movement will not restart it until the next key press |
| `?px=0.5` to `2` | Render scale cap (default 1.5); lower it for a slow machine on a big screen |
| `?room=surreal` | `R` loads the earlier fixture `public/fixtures/surreal-library/` instead (GLB meshes sampled to points) |
| `?look=ribbons,data` | Two unchosen prototype looks (see below) |
| Dev server only | `?eye=idle\|listening\|thinking\|speaking\|unavailable`, `?splats=standin`, `?splatmax=`, `?splatnear=` |

### Source map

`src/astral/` is the application.

| File | Role |
|---|---|
| `AstralRoom.tsx` | Shell: renderer, stage sequence (void, tunnel, arriving, room, dissolving), keys, wiring |
| `types.ts` | Shared contract: `PointCloud`, `RoomLights`, `RoomHero`, effects, lights, phases, `AstralReply`, `TUNNEL` |
| `point-field.ts` | The GPU point renderer: tunnel cloud, tunnel-to-room arrival, seven effects, lighting moods (`MOODS`, `nextLighting`), hero highlight. Largest file |
| `flight.ts` | Key-driven flight, the side-to-side view (`sideView`, `setSide`), guided camera, arrival path |
| `tease.ts` | EVA's unprompted lines: placeholder wording, when one is due, and the placeholder browser voice |
| `eye.ts`, `eye-shader.ts`, `eye-source.ts`, `eye-fits.ts`, `eye-marks.ts`, `eye-volume.ts` | The eye: its raster source, shader, irregular fits, tracking marks and numerals, volume |
| `conversation.ts` | Not used by the page. Hold-to-talk voice loop: sends the transcript to the decision and reply routes in parallel; both carry effect, intensity and light |
| `room-source.ts` | Loads the recorded room: baked points, else splats, else posed frames; `?room=surreal` path |
| `baked-points.ts`, `splat-points.ts`, `posed-frames.ts` | Three ways from the library fixture to an ordered point cloud; manifest validation is in `posed-frames.ts` |
| `room-generation.ts`, `surface-sampler.ts` | Live room: description to procedural meshes to points. `room-generation.ts` is not used by the page; the sampler still serves `?room=surreal` |
| `splat-view.ts` | Renders `room.spz` with Spark as "the paint"; the points-to-paint swap; draw layers |
| `water.ts`, `water-sim.ts` | Height-field wave simulation over the pool, drawn as points and as splats |
| `inspect.ts`, `inspect-marks.ts` | Which hero the viewer is inspecting; its brackets and numerals on a 2D canvas |
| `glow.ts` | Bloom limited to dense bright areas; always on |
| `looks.ts`, `ribbons.ts`, `data-layer.ts`, `data-marks.ts` | Prototype looks behind `?look=`. `ribbons`: arrival as bundles of 1 px strands. `data`: four corner groups of live values. The owner has not chosen either; delete the ones not kept |

`src/speech/` is the browser side of speech (microphone capture, realtime transcription, playback). `src/server/` holds the four dev-server routes. `src/room/` is what remains of the earlier crime-scene application, kept only because code in `src/astral/` imports it:

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

`GET` on a route with an `Origin` header reports its status without a provider call.

### Fixtures

- `public/fixtures/library/`: `manifest.json` (frames with cameras, `splats`, `points`, `water`, five `heroes` boxes), fifteen frame trios (picture, depth EXR, confidence), `room.spz` (32 MB), `points.bin` (69 MB bake). **Re-bake `points.bin` whenever `room.spz` or `manifest.water` changes**; a stale bake is rejected and the points are recomputed from the splats (about 19 s). The bake script is `.local/bake-library-points.mjs`, which is not in the repository.
- `public/fixtures/surreal-library/`: the earlier recorded room (GLB shell and hero models); its own README describes it.

## Running and checking

- `npm run dev`, open `http://127.0.0.1:5173/` in Chrome, and move the mouse or press a key. Nothing paid, no keys needed.
- With provider keys, for the routes the page no longer calls: `node --env-file=.env.worldlabs node_modules/vite/bin/vite.js` with the flags above set to `1` in the shell.
- Ports are fixed and strict: 5173 for dev, 4173 for preview. A leftover `node` process holding the port makes the next start fail; find and stop it instead of changing the port.
- `npm run check` runs the typecheck and the tests. `npm run build` writes `dist/`.
- Headless captures need Chrome with a GPU: `chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })`. Playwright is a dev dependency.

Checked on 2026-11-16 after the first interaction slice: typecheck clean; 324 tests pass in 27 files; the build succeeds. In headless Chrome the built page had no console errors; mouse movement alone started the tunnel and the library; the view shifted with the mouse and turned at the edge; the room dispersed after 45 seconds without input and a key press brought it back; the tease fired 20 seconds after control and not after side-to-side movement. Not checked: the placeholder voice being audible (headless Chrome has no sound), how the side-to-side view feels in the hand, frame rate, any provider call.

Earlier measurements (2026-11-12, not repeated): 60 fps at 3440x1440 in headless Chrome on an RTX 5080 (headless caps at 60, so headroom is unknown). One live voice turn worked: Jev decision in 0.1 s, Opus reply in 2.4 s, spoken reply; EVA began speaking about 13 s after the visitor stopped.

## Known faults and open items

Live path:

- **No live room has ever appeared.** The one attempt returned `unsupported`: EVA's reply prompt asks for liminal corridors, stairwells and waiting rooms, while the composer can only build one box room with basic furniture and rejects lighting requests. The two prompts contradict each other. The owner deferred the fix, along with the picture-to-room pipeline (EVA paints a picture from speech, then rebuilds it in 3D) and automatic hero detection.
- **Latency.** The reply and the voice are not streamed, hence the 13 s wait.
- **ElevenLabs logs sessions.** Zero retention is refused on this account tier; the code logs the provider's warning and continues. The owner accepted this for testing only.
- Voice level reaches the eye as an on/off gate, not a real level.

Library room:

- The melted clock is faint in the points (clear in the paint). The near-left shelf and the ceiling are noisy as points. Looking back toward the entrance, the glass wall shows seams. The paint has thin soft strips at the far left and right of the arrival view.
- Lighting moods do nothing while the paint is shown. This room has no lamp, so `L` does nothing in it.
- The eye and the water were each mid-revision on 2026-11-12: the eye toward more dispersal and a 3D read, the pool toward reading as deep with a coping round its rim.

Display:

- The render scale cap of 1.5 means a display at 200% scaling is upscaled by the browser, which is real blur. The exhibition screen's resolution and scaling are not yet known; final judgement of sharpness has to happen on that screen.
- `npm install` reported one moderate advisory on 2026-11-12; not examined.

Repository:

- `points.bin` (69 MB) is committed as an ordinary file. GitHub warns above 50 MB and refuses above 100 MB; decide on Git LFS before the first push of this branch.

## Where the earlier work is

Commit `f661157` on this branch is the complete state before the cleanup: the crime-scene application (`?legacy`), head-tracked viewpoint with MediaPipe, prop and paint generation routes, their tests, the old planning documents and the archive of the previous project. `git show f661157:<path>` restores any file. The `future-demos` branch holds the same documents without the astral work. Consult them only when a task needs a specific idea from them; none of their processes apply here.
