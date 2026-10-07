# Week 4 visual implementation: VS Code task

Paste the task below into a new Claude Code session in VS Code, opened at the repository root on the Windows workstation. It is a task prompt, not a script. Keep every new deliverable under `week4/`.

The current task source is branch `week4` at or after `16e068e`, which contains the selected particle-convergence packet. Update the source before starting.

---

You are implementing the EVA Week 4 visual experience: 1980s Paris, seated at a café table, which EVA builds around the viewer from converging particles over about a minute.

Work in **gated steps**. Each step ends with:
- real screenshots and real video of the running implementation;
- a side-by-side comparison against the selected references;
- an explicit owner decision.

**Do not begin the next step until the owner has approved the current one in writing.** Silence, a test pass, an agent's opinion or your own judgement is not approval.

## 1. Read first

1. `CLAUDE.md`, `AGENTS.md`, `docs/development/AGENT_WORKFLOW.md` and `docs/design/FIGMA_WEAVE.md`.
2. `week4/planning.md`, especially §4 (the minute), §6 (architecture), §9 (phases) and §10 (tests and owner smoke).
3. `week4/DESIGN_PROMPT.md`. It is the Opus-authored art direction. Composition, restraint and emotional rules still apply; later owner decisions (§3 below) replace its ink-and-watercolour material.
4. `week4/CLOUD_REPORT.md` (the W4-1 non-visual foundations) and `week4/VISUAL_CLOUD_REPORT.md` (the visual-reference session, with every Weave run, cost and owner decision).
5. **The selected packet:** `week4/docs/design/revisions/w4-20261005-paris-p1-converge/`. Read `REVIEW.md` and `provenance.json`, then open and inspect every image and video yourself:
   - `img-03-e0-early-converging.png`: the start of construction;
   - `img-02-a0-particles-converging.png`: mid-construction;
   - `img-01-p1-settled-painterly.png`: arrival;
   - `videos/vid-01-v5-e0-to-p1-converge.mp4`: the motion reference.
6. Earlier packets in `week4/docs/design/INDEX.md`, for history only. They contain rejected directions; never implement from them without the owner's say-so.
7. The existing code you will build on:
   - `week4/core/` (director, timeline, scene reducer, intents, narration, projection, tracking);
   - `week4/schemas/` and `week4/fixtures/`;
   - `week4/broker/` (the Rust stage broker; the native adapter fails closed).

   Reuse these. Do not write a second set of timing, permission or state rules.
8. Week 3's renderer (`week3/src/visual/`) and its Tauri configuration (`week3/src-tauri/tauri.conf.json`, which has `--disable-gpu`). These are for understanding only. Week 1–3 files are read-only.

## 2. Authority and limits

- **Authorized:** the gated implementation steps below, with their focused tests, captures and revisions. Routine fixes within an approved step's scope need no extra permission.
- **Not authorized:**
  - starting the next step before owner approval;
  - paid generation without a quote and per-run approval;
  - STT/TTS or other provider calls;
  - real camera use without the owner's explicit consent at that moment;
  - real Windows window movement or wallpaper changes before step 7's gates;
  - deployment, publishing, PRs, `main` writes or force pushes;
  - another model router, permission bypass or disabled hooks.
- **Commits:** commit or push only if the owner authorizes it in this session. If authorized, use `week4` only, after reviewing the diff, and exclude build output, credentials, raw recordings of private screens and runtime/recovery data.
- **Development models:** follow `docs/development/AGENT_WORKFLOW.md`.
  - Astra orchestrates. Use the native `eva-*` agents: `eva-ui-designer` for React/interaction, `eva-implementer` for renderer/Rust/TypeScript integration, `eva-reviewer` for independent review.
  - At most three concurrent workers, isolated writers, one writer per file.
  - Record each worker's actual configured and observed model. If a route fails, report it; never claim it ran.
  - If a decision needs new creative authorship beyond the packet, ask the owner. The owner previously asked for Claude Opus 5.5 for creative direction; verify that route the way `week4/AUTHORSHIP.md` did.
- **Weave gate:** the converge packet covers the P1 arrival visuals, which are steps 1–6. Steps 7 and 8 need fresh packets (P2 desktop, P3 follow-ups) before any UI edit. Any owner-requested redesign that departs from the packet also needs a fresh packet. The owner's workstation has the Figma/Weave connection; quote first and get structured per-run approval.

## 3. The approved visual direction (owner decisions, 2026-10-03 to 10-05)

**Look**
- A painterly 1980s Paris street seen from a café seat (P1):
  - cream limestone façades, sage-green shutters, iron balconies;
  - a zinc mansard closing the street;
  - **a shop awning on the left façade, with no overhead canopy, scallops or hem**;
  - a dark iron lamp post;
  - a woman in a camel trench coat, plus walkers in muted period colours;
  - a white marble table, a white cup of espresso with steam, a clear glass ashtray with an unbranded cigarette and smoke, and a honey rattan chair.
- **Paris palette only.** Do not reintroduce the Week 3 emotion palette (teal, coral, apricot, plum).

**Construction**
- The main motion is **particles converging into form**: specks of the scene's own colours stream in from the frame edges along curved paths and condense **nearest first**:
  1. cup and table;
  2. ashtray and chair;
  3. woman and walkers;
  4. lamp post;
  5. façades and awning;
  6. far street.
- Pencil wireframe fades as each region fills.

**Overlays are accents only**
- Thin graphite hairline rectangles: at most about 10 at once. Some are crossed with an X and some are linked by thin straight lines. They frame what is converging, live about 0.3–1 s, may jump once or twice, then fade.
- One or two small scanline glitch boxes with a faint red/cyan edge, each lasting about 0.2–0.5 s, at forming edges.
- Overlays taper to none at arrival.

**Never**
- horizontal strips or smear bands across the picture;
- full-frame flashes;
- numbers, labels, HUD, hexagons or glyph rain;
- Animus or Assassin's Creed assets;
- a red wash.

**Known deviations in the references (do not copy)**
- P1 has a ghosted double walker and stray teal/coral dots.
- The woman walks toward the viewer; the brief prefers people turned away. Ask the owner which they want.
- In V5 the far field paints in as a colour wash; the implementation should converge the far field from particles too, sparser and finer.

**Timing:** the existing 60-second A–G timeline in `week4/core/timeline.ts` and planning §4. Map the packet onto it:

| Planning phases | Visual |
| --- | --- |
| A–B | The Week 3 eye hears the request and clears to paper |
| C | Wireframe survey, like E0 |
| D–E | Convergence, like A0 |
| F | The first walkers, smoke and steam come alive |
| G | Arrival on P1, with the overlays gone |

The visual content changes from the plan's red-line/watercolour wording to the packet above; record that mapping in step 1's REVIEW.

**Runtime assets:** generated images are references, not adopted runtime assets. Using P1/E0/A0 pixels as runtime data (for example particle colour or position targets) needs an explicit owner decision at step 1, with a note on provider terms. Record it in `week4/fixtures/assets/inventory.json`. Otherwise, author the scene natively.

## 4. Evidence and approval protocol (every step)

For each step `N`, create `week4/docs/design/revisions/w4-impl-sN-<short-name>-<yyyymmdd>/` containing:

| Path | Contents |
| --- | --- |
| `REVIEW.md` | Status at the top; what was built; links to every capture; a comparison against the selected references; deviations; tests run with actual results; a numbered list of what the owner should look at |
| `implementation/before/` | Captures from before the step. For the first renderer step, state that no runnable before-state exists |
| `implementation/after/` | Real captures (format below) |
| `implementation/compare/` | Side-by-side sheets of the reference vs the implementation at matching moments, labelled |
| `checks.json` | Commands, counts, environment, viewport, DPI, browser/WebView version, GPU state and timings, with actual values only |

**Capture format**
- **Screenshots:** PNG at a recorded viewport. Default 1920×1080 at device scale factor 1. Also capture at the real demo monitor's resolution once known.
- **Videos:** H.264 MP4 at 30 fps or more. Capture the whole step's behaviour, not a highlight. Also save a labelled frame sheet (for example 3–4 fps) for quick review.
- **Tools:** use Playwright (already used in Week 3) for the browser build. Use real Windows screen capture for the native WebView2/Tauri build (for example `ffmpeg -f gdigrab`, or the Week 3 `native-visual` approach), recording the tool and settings.
- **Label honestly:** browser, native, synthetic pose or real camera. A browser capture is not Windows WebView2 evidence. Never fabricate or retouch a capture.
- **Privacy:** no personal desktop content, private audio or the owner's face in committed evidence. Use synthetic demo windows and a neutral wallpaper. Keep camera-test recordings local and uncommitted unless the owner explicitly approves.

**The approval stop.** When the evidence is complete:
1. Update `week4/docs/design/INDEX.md` and `week4/VISUAL_IMPLEMENTATION_PROGRESS.md`. Create the progress file on first use.
2. Present the owner with:
   - the REVIEW.md path;
   - the two or three most important screenshots and the main video;
   - a short checklist of what to judge;
   - known deviations.
3. Ask a structured question: **Approve this step / Request changes / Reject direction**.
4. **Stop and wait.** Do not start the next step's code, references or spending.
5. Record the owner's decision verbatim, with the date and the tested revision, in `week4/docs/design/acceptance/w4-visual-steps.md`. Create it with every step `pending`.
6. On *Request changes*, revise within the step, re-capture, and ask again.
7. On *Reject direction*, stop and discuss. A new direction needs a fresh Weave packet.

Approval of a step is a pass result only. It does not accept Week 4, W4-1 or any study phase.

## 5. The gated steps

**Before step 1 (no gate):**
- Record the checkout SHA, branch and status.
- Run `npm --prefix week4 ci --ignore-scripts`, `npm --prefix week4 run check` and `cargo test --manifest-path week4/Cargo.toml`.
- Report the actual counts. The last recorded baseline was TS 103/103 and Rust 69/69.
- Confirm that the Weave connection, `/agents` and the GPU/WebView2 version are actually available, and report each.

### Step 1: Renderer foundation and the static arrival frame

**Build**
- A Week 4 app under `week4/app/`: Vite + React + TypeScript, consistent with the Week 3 stack, using `week4/core` for state.
- A GPU-capable particle renderer (WebGL2 first, Canvas2D fallback) that draws the **arrival frame (P1) at rest** as a particle scene with idle life:
  - steam and cigarette smoke rising;
  - the walkers strolling slowly.
- No head coupling yet.

**Investigate first**
- Find why Week 3 runs WebView2 with `--disable-gpu`: git history, docs and issue notes.
- Test GPU rendering in the real Windows WebView2.
- Report the findings, and do not copy the flag blindly.

**Ask the owner at this step**
- Whether P1 pixels may be adopted as runtime source data (see §3, Runtime assets).
- The facing of the near walker.

**Capture**
- Screenshots of the full arrival frame.
- A 20–30 s idle video, in the browser and natively.
- Compare sheets against P1.
- Frame-time distribution (median, p95) in both, labelled.

**Gate:** does the frame read as P1: palette, composition, painterly particle material, calm?

### Step 2: Real off-axis depth

**Build**
- Depth layers for the scene: near table objects, chair, the woman, walkers, lamp, each façade, mansard, sky and paper.
- Head-coupled off-axis projection from `week4/core/projection.ts` and `tracking.ts`, inside the calibrated head box.
- First with **synthetic, labelled poses**. Then, only with the owner's consent at that moment, local MediaPipe face tracking:
  - local processing only;
  - explicit camera permission;
  - a loss-handling ease and a labelled static fallback.
- Rendering must never block on face inference.

**Capture**
- Screenshots at the head-box centre and its four extremes, showing occlusion changes.
- A video of a scripted synthetic head sweep.
- If consented: a real-tracking test kept local, plus measured pose-to-frame latency.

**Gate:** does leaning feel like looking through a window rather than inspecting a model? Are occlusions and stability right?

### Step 3: Particle convergence (the construction)

**Build**
- The convergence from E0 to A0 to P1, driven by the existing timeline phases C–G. Particles travel curved paths from the frame edges, nearest first; the wireframe fades as each region fills.
- **The far field also converges from particles**, unlike V5's wash.
- Exact, deterministic ID and anchor continuity.

**Capture**
- Screenshots at the moments matching E0, A0 and P1.
- The full construction video at real speed.
- A side-by-side video or frame sheet against V5.

**Gate:** does it feel like the place condensing around you, at the right pace?

### Step 4: Overlay accents

**Build**
- The native overlay layer described in §3: hairline rectangles, some X-crossed and some linked; one or two small glitch boxes. It frames what is currently converging and tapers to none at arrival.
- Expose density and timing as parameters, so the owner can tune them live during review, and record the chosen values.
- No strips, numbers or flashes.

**Capture**
- Screenshots at peak and low density.
- The full construction video with overlays.
- A plot or table of overlay count over time.

**Gate:** are the overlays accents that support the convergence, at the right density?

### Step 5: The full minute

**Integrate the director's A–G timeline**
- **A–B:** the Week 3 eye hears and clears.
- **C–G:** construction, then arrival.
- Narration placeholders by line ID only. All audio is still missing, so do not synthesize any.
- Fixture controls, labelled as fixtures.
- Skip (to the same end state, about 6 s), graceful return (about 5 s, deconstruction in reverse), and **immediate** Esc/emergency cancel that no animation can delay.
- Reduced motion (about 15 s of stills crossfades; parallax off unless opted in) and failure recovery.

**Capture**
- The full 60 s video.
- Separate videos of skip from two phases, Esc from three phases, graceful return, reduced motion, and a forced failure.
- Keyboard and focus screenshots.
- The Esc-to-restore-start time measured from logs.

**Gate:** does the whole minute land emotionally? Use `DESIGN_PROMPT.md` §14's questions. Do the safety paths work?

### Step 6: Native Windows build and performance

**Build**
- The Tauri 2 / WebView2 shell for the Week 4 app. The desktop broker stays the mock in this step.

**Capture**
- Native screenshots and the full-minute video on the demo monitor.
- Frame-time distributions (idle, construction, overlays) and memory.
- With consent: real-camera tracking cost while rendering.

**Gate:** is the native experience smooth and faithful on the actual machine?

### Step 7: Desktop choreography (needs a fresh P2 packet first)

**Before any edit**
- Quote, approve, generate and inspect P2 image and video studies of window displacement, the wallpaper hand-off and return.

**Then build**
- The approved choreography through the Rust broker's bounded authority and fixed asset IDs. Use synthetic demo windows only.
- The 240 px column is a mock fixture, not an approved look.
- Never resize arbitrary windows. Reject unsafe fits.
- Per-monitor wallpaper image only; global wallpaper settings untouched.
- Wallpaper set in phase D under the opaque veil.

**Real Windows effects stay fail-closed** until `week4/broker/DURABLE_JOURNAL_REQUIREMENT.md` is met and tested on Windows. Show the mock first. Ask the owner before the first real-effect test, and test restoration on exit, forced kill, interrupted movement and later user changes.

**Capture:** before and after desktop screenshots, the choreography video, and the restoration test videos.

**Gate:** is the choreography right and the restoration trustworthy?

### Step 8: Follow-ups (needs a fresh P3 packet first)

**Before any edit:** quote, approve, generate and inspect the P3 packet: rain, evening, rain and evening together, undo, and deconstruction.

**Then build**
- In-place state changes through the existing reducer, keeping the seat, table and cup anchors.
- No replay of the minute.
- Late results are ignored.
- Unknown requests get the honest line.

**Capture:** screenshots of each state, and a video of rain, then evening, then undo, then return.

**Gate:** do the changes alter the mood without breaking the place?

**After step 8**
- Run `week4/WINDOWS_SMOKE.md` and planning §10's owner smoke together with the owner.
- Create `week4/docs/design/acceptance/w4-paris-arrival.md` with status **pending** for the owner's decision.
- Live voice (STT/TTS) still needs its own authorization and budget.

## 6. Every step, always

- Run `npm --prefix week4 run check`, the Rust tests, and focused new tests for the renderer, convergence ordering, overlay density bounds, ID continuity, skip/cancel/undo, reduced motion and stale results. Report real counts and failures.
- Never rewrite tests or contracts to match a bug.
- Keep keyboard focus, captions and controls outside the effect.
- Keep the error and authority states in explicit words, not colour alone.
- Distinguish implemented, mocked, simulated, blocked, failed and not run.
- Never claim Windows, camera, voice or performance results from a browser or synthetic run.
- Keep `week4/VISUAL_IMPLEMENTATION_PROGRESS.md` current. At each stop, give:
  - the files changed;
  - the actual model and tool provenance;
  - the tests;
  - capture locations;
  - known limitations;
  - the exact owner decision needed.
