# EVA — Week 1 Demo Plan

**Archive update, 2026-09-17:** the owner reported the Week 1 demo successful. See [the summary](README.md) and [outcome record](docs/design/acceptance/week1-outcome.md). The plan and checkpoint statuses below preserve their historical context.

| Field | Value |
| --- | --- |
| Planned demo date | 2026-09-17 |
| Revision date | 2026-09-16 |
| Status | Weather/revision/memory candidate implemented; final native launch blocked by Windows signing policy; owner demo acceptance pending |
| Target | Windows desktop demo using Tauri 2, Rust, React, and TypeScript |
| Presentation length | 60–90 seconds |
| Core question | Can EVA present a coherent visual workspace, revise it without losing continuity, and expose the stored source of a preference? |

This is the execution plan for the [week-one visual brief](docs/design/WEEK1_DEMO.md). It adopts the owner's request to include Tauri/Rust setup. [PLANNING.md](../PLANNING.md) remains the product roadmap, [DESIGN.md](../DESIGN.md) owns visual rules, and [AGENTS.md](../AGENTS.md) owns development and acceptance practices. Creating this plan does not claim software has been implemented or a phase has passed.

Current execution record, 2026-09-16: the owner authorized the next implementation steps after reporting passing memory checks. The [weather candidate](docs/design/revisions/week1-weather-20260916/manifest.md) implements steps 3–6 and prepares step 7 evidence. Browser checks pass; an earlier native candidate passed, but the final rebuilt executable was blocked by Windows Application Control. See the [owner exercise and remaining gate](docs/design/acceptance/week1-weather.md). This is not S0–S2 or full-product acceptance.

## 1. Deliverable

A real Tauri desktop window containing one weather instrument, a small eye/status anchor, and an on-demand memory inspector. The UI renders synthetic weather, applies one validated preset revision, preserves a user-moved card, and obtains a synthetic memory record through a narrow Rust command.

The working path is:

```text
Local weather fixture → validated UI document → React instrument
Preset “Add wind” → validated patch → same instrument, same position
Preference request → Tauri IPC → Rust fixture reader → Markdown record
                   → structured response → applied units + source inspector
```

The UI remains usable without cloud models, live connectors, or generated assets. Rust supplies a meaningful read-only backend boundary; it is not the full policy broker or memory system.

## 2. Required demo sequence

| Step | Visible result | Implementation requirement |
| --- | --- | --- |
| Launch | An ordinary desktop window opens with an “Open EVA” control | Tauri dev launch and a locally built executable both work on the presentation machine |
| Open workspace | Small amber eye and near-black weather card appear | Local state transition, keyboard access, reduced-motion rendition |
| Read forecast | Seven dated days, location, units, and synthetic-source label | Typed fixture data; missing values are not fabricated |
| Move card | Presenter drags the card header | Position stored locally; header remains reachable |
| Add wind | Wind row/panel appears in the existing instrument | Preset patch validated against the current revision; card identity and position preserved |
| Inspect memory | “Preference used: Celsius” opens a bone-white dossier | Rust returns the actual synthetic Markdown source and parsed fields; UI derives its unit preference from that response |
| Undo/reset | Wind addition can be undone; reset restores the initial scenario | Deterministic local state; undo preserves current user geometry, while explicit reset restores initial geometry |
| Dismiss/exit | Workspace disappears; the desktop window can then close normally | Distinguish workspace dismissal from closing the application; no fake OS click-through claim |

Label “Add wind” as a preset revision and memory as “Synthetic demo memory / Fixture lookup.” Do not present preset behavior as conversational understanding or the fixture reader as semantic retrieval.

## 3. Tauri and Rust setup

### Prerequisites

Before installation, recheck Node/npm, Rust/Cargo/rustup, the MSVC C++ toolchain/Windows SDK, and WebView2. Earlier inspection found Node/npm but did not locate Rust/Cargo or a matching C++ compiler installation. This is a prior observation, not a substitute for checking the machine when setup begins.

Follow the [official Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows):

1. Install or modify Microsoft Build Tools with the **Desktop development with C++** workload and required Windows SDK.
2. Install Rust through rustup using the appropriate Windows MSVC target; verify the active toolchain.
3. Verify the WebView2 runtime; install it if absent.
4. Refresh the terminal environment and confirm `node --version`, `npm --version`, `rustc --version`, `cargo --version`, and `rustup show` work.
5. Scaffold a Tauri 2 application using React, TypeScript, and Vite under `apps/desktop`, following [Tauri's project setup](https://v2.tauri.app/start/create-project/). Use the planned npm workspace and a committed dependency lockfile.
6. Launch a plain window and make one frontend-to-Rust command call before building the visual scene.

Use normal environment approval mechanisms for toolchain installation; do not change machine-wide settings beyond the needed setup. No GPU tooling is required.

### Setup checkpoint

Allocate an initial 60–90 minute checkpoint for installation and the first working window/IPC call. This is a scheduling limit, not a prediction of download or compile duration. Record the actual blocker if the checkpoint slips; reserve the remaining deadline for the visible demo.

Retain a browser development path using the same frontend and a labeled fixture adapter. This is the presentation fallback if native setup remains blocked. It does not satisfy the Tauri/Rust acceptance checks and must not be reported as a completed desktop demo. Resume unresolved native setup afterward without rebuilding the frontend.

### Native scope

Use one ordinary decorated, resizable window and a dark internal canvas. Verify ordinary close and reopen behavior. Defer transparent windows, click-through, always-on-top behavior, global shortcuts, tray integration, screen capture, microphone access, custom window chrome, and macOS validation. Do not claim cross-platform readiness from the Windows demonstration.

Owner refinement, 2026-09-17: the requested current rendition replaces the decorated window/dark canvas above with a transparent, frameless Windows window and dither-matrix connections between the eye and dashboard. Essential controls attach to the eye; native drag/close controls replace the OS title bar. This explicitly authorizes those window changes within the demo. Click-through, always-on-top, tray/global shortcuts and macOS remain separate work. See the [overlay evidence and native build limitation](docs/design/revisions/week1-overlay-20260917/manifest.md).

## 4. Minimal implementation structure

Create only the directories needed for this slice; the full proposed monorepo is not a scaffolding checklist.

```text
apps/desktop/
  src/                    React UI, demo state, narrow backend interface
  src-tauri/              Tauri configuration, Rust command, capabilities
packages/protocol/        Minimal UI document/patch schemas and fixtures
packages/ui-system/       Shared tokens and the few reusable UI components
fixtures/connectors/     Synthetic seven-day weather JSON
fixtures/vault/           Synthetic Markdown preference record
docs/design/revisions/   Actual visual evidence when captured
```

Keep layout, weather data, memory access, and revision application separate. The browser and Tauri paths share the renderer; only the memory-source adapter differs. The future model or voice path replaces the preset producer and continues to emit the same bounded document/patch shape.

## 5. Memory and IPC contract

Implement one proposed command, `get_demo_memory`, accepting an allowlisted record ID such as `weather-units`. Rust maps that ID to a bundled synthetic Markdown resource; the frontend never supplies a filesystem path. Do not enable a general filesystem or shell plugin for this demo.

The response contains typed fields for ID, category, value, scope, synthetic source, and recorded date, plus the exact Markdown used to derive those fields and a display-only relative source reference. Use a small validated parser for the known fixture format. No private vault reads, arbitrary paths, writes, network access, or executable Markdown/HTML are required. Render source as escaped text.

Reject unsupported IDs and malformed/missing records with a bounded error. On failure, show “Demo memory unavailable”; any fallback units must be explicitly labeled as a default rather than attributed to memory. Do not print absolute personal paths or raw backend errors into the UI.

Use Tauri's explicit command registration, narrow application-command permissions, and window capabilities; verify invocation from the intended local window and review the configured CSP. Frontend validation does not replace Rust input validation. Keep production navigation and assets local. The limited fixture command demonstrates a boundary, not the full planned authorization architecture.

## 6. Visual and interaction scope

Use the selected Space Grotesk / IBM Plex Sans / IBM Plex Mono fonts, bundled locally with their license notices. Apply DESIGN.md's candidate tokens consistently: near-black card, bone-white content, amber activity, crisp labels, restrained rules, and generous spacing. Mark any fallback font in review evidence.

Required components are an eye/status anchor, card/header, forecast strip, wind detail, evidence footer, preset controls, and memory dossier/source viewer. The dossier appears on demand. Include a readable loading state for the Rust call and an honest error state.

Use one short open/close transition and a restrained revision highlight. Reduced motion must preserve the same information. Keyboard users can activate the preset, inspect/close memory, undo/reset, and dismiss the workspace. Escape closes the topmost inspector first; when none is open, it dismisses the workspace. Use the ordinary native close control to exit the app.

Higgsfield may help produce a bounded design reference before implementation if connected. Functional content must be native components. No live Higgsfield generation, hosted-site creation, or generation job belongs on the demo path. ComfyUI installation remains at the start of S3, after explicit S2 acceptance.

## 7. Implementation order

| Order | Work | Checkpoint |
| --- | --- | --- |
| 1 | Prerequisites, npm workspace, Tauri/React scaffold | Desktop window opens and Rust responds |
| 2 | Synthetic Markdown and narrow memory command | Fields and exact source returned; invalid ID rejected |
| 3 | Weather fixture, shared tokens, initial UI schema | Readable instrument renders with applied preference |
| 4 | Preset wind patch, revision checks, undo/reset | Valid patch succeeds; invalid/stale patch leaves last good UI intact |
| 5 | Memory inspector and card movement | Source is inspectable; movement survives patch and undo |
| 6 | Eye/status, keyboard behavior, reduced motion | Entire sequence usable and repeatable |
| 7 | Native build, presentation rehearsal, screenshots/recording | Offline executable and backup evidence verified |

If time slips, cut decorative effects, extra layouts, resizing, pinning, and additional interactions first. Protect the working native boundary, clear weather display, one revision, and source inspection. If a core item is missing, report it as incomplete rather than hiding it behind a screenshot.

## 8. Verification and delivery

Choose and document actual package scripts during scaffolding. Expected tasks are development launch, frontend typecheck/build, focused schema tests using Ajv and Node's test runner, Rust formatting/check/tests, and a Tauri application build. Command names and successful results are not established by this plan.

Required evidence:

- Windows Tauri launch, one real Rust response, normal close, and relaunch.
- Rust tests for valid fixture, unknown ID, and malformed fixture behavior.
- Schema tests for valid initial document/patch, unknown fields/components, and stale or invalid revisions.
- Two complete rehearsals from reset, including a moved card, preset patch, memory source inspection, undo, dismissal, and application exit.
- Matching base/revised/memory screenshots at the actual presentation viewport and one narrower-window check; keyboard focus and reduced-motion checks.
- A locally built executable tested without cloud credentials or generation access; installer packaging/signing is outside the checkpoint unless required to run on the presentation machine.
- Exact launch/reset instructions, known limitations, and a short backup recording. A recording supports a live demo but does not establish missing interactive behavior.

Store actual evidence under the existing design revision convention. The initial before-reference should state that no runnable application existed and link the concept; do not invent a before screenshot. Record the tested revision and owner feedback in `docs/design/acceptance/week1-demo.md` when a review packet exists. Only explicit owner acceptance closes this checkpoint.

## 9. Relationship to the roadmap

This slice supplies candidate visual evidence for S0, a small component/schema subset for S1, and one read-only memory seam for later S2 work. It does not complete Milestone 0, the secure desktop shell milestone, S1, S2, or the memory/security architecture.

After the demo, use feedback to refine shared components, complete the bounded grammar and calendar workflow, then add conversational revision and simulated memory under the existing phase gates. Voice/personality research remains part of the study. No live accounts, autonomous actions, vector database, graph store, memory writes, multi-agent runtime, ComfyUI, or full Rust policy broker are added to week one.

## 10. Explicit owner refinement — 2026-09-16

Latest visual follow-up: the owner requested an application suitable for screen recording, without explanatory copy, with a realistic eye shape and Evangelion red instead of orange. [The red-eye candidate](docs/design/revisions/week1-red-eye-20260916/manifest.md) applies this explicit color/shape revision; no further backend or study scope is added.

The owner subsequently requested an animated eye, simple Whisper API voice input restricted to weather, and a stronger Evangelion-inspired effects-driven dashboard. They supplied a monochrome eye with a square pupil as the visual reference. This narrow authorization supersedes the earlier week-one speech exclusion and restrained-effect priorities for this demo. It does not authorize general conversation, TTS, live weather, S2 acceptance, or early ComfyUI/GPU model installation.

Candidate implementation: [week1-voice-eye-20260916](docs/design/revisions/week1-voice-eye-20260916/manifest.md). Local WebGL supplies the eye; Rust owns the native fixed-endpoint Whisper request, with a corresponding server-side browser adapter. Audio is explicit, bounded to 15 seconds, cancellable, and never written to application storage. Only weather intent for the synthetic Ithaca fixture opens the instrument. The no-key preset remains available.

Browser capture, live Whisper with synthetic speech, UI tests and frontend build passed. Rust check/format passed, but Rust test/Clippy and final native verification are Windows-policy blocked. The [new owner exercise](docs/design/acceptance/week1-voice-eye.md) is pending; this is not completion of step 7 or a major study/product phase.
