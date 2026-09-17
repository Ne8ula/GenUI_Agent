# Week-one visual vertical slice

Status: recommendation for owner review, 2026-09-16. Target demo: 2026-09-17. No implementation or phase acceptance claimed.

Execution follow-up: the [weather candidate](revisions/week1-weather-20260916/manifest.md) implemented this brief, then the owner requested a stronger visual redesign, simple Whisper weather input and a square-pupil eye. The [voice/eye refinement](revisions/week1-voice-eye-20260916/authoring-brief.md) supersedes this brief's eye/effect direction and earlier voice exclusion for the narrow demo. Its [browser and live Whisper evidence](revisions/week1-voice-eye-20260916/manifest.md) is available; final native verification remains Windows-policy blocked and owner acceptance is pending.

Implementation sequencing, Tauri/Rust setup, and technical acceptance are defined in [WEEK1_DEMO_PLANNING.md](../../WEEK1_DEMO_PLANNING.md). This file remains the visual and presentation brief.

## What this checkpoint should establish

Demonstrate that EVA has a distinctive, readable visual language which can survive a real interface revision, and that a visible preference can be traced to inspectable stored data. This is the smallest useful path through fixture data, a bounded UI document, native components, user input, a validated patch, and evidence inspection.

This scope is selected for deadline reliability and reuse in the planned study. A conversation/character demo would put voice, turn-taking, personality, and provider latency ahead of testing the central interface grammar. A static concept alone would leave revision continuity and data provenance untested. Tomorrow's checkpoint should therefore be a working, deterministic visual prototype.

## One 60–90 second demonstration

| Step | What the audience sees | What actually works |
| --- | --- | --- |
| 1. Open EVA | Small amber eye opens; a weather instrument appears on a neutral desktop-like backdrop | Local open/close state; no microphone or screen capture implied |
| 2. Read the week | Seven dated days, temperatures, units, location, and a clear synthetic-source label | Native readable components bound to a fixed JSON fixture |
| 3. Change the view | Click “Add wind”; a wind row/panel joins the forecast while the original card stays in place | A predefined, validated UI patch; stable card identity and geometry |
| 4. Inspect memory | Open “Preference used: Celsius”; a bone-white inspector shows the exact record and source | A checked-in synthetic Markdown record is read and its preference applied; no model retrieval claim |
| 5. Recover and close | Undo the wind addition, reset the scenario, then dismiss EVA | Real local undo/reset/close; clean, repeatable replay |

Use one weather workflow. “Add wind” is a clearly labeled preset revision, not purported natural-language understanding. Do not add a chat input that cannot really interpret input. The presentation can explain that later conversational input will produce the same bounded patch.

## What it should look like

Use the existing Space Grotesk headings, IBM Plex Sans controls, and IBM Plex Mono values. Start with one floating near-black forecast instrument, bone-white text, restrained rules, and amber selection/activity. Keep generous empty space; add the memory dossier only when opened. The small eye is an activation/status anchor, not a talking NPC.

The forecast should dominate the composition. Allow one genuine direct-manipulation interaction: move its header and demonstrate that the wind revision preserves the position. Keep resize/group/pin and the full topology out of the deadline unless already implemented. One short opening transition and a restrained patch highlight are enough; readable text and responsive input take priority over CRT effects. Reduced motion/static rendering must work.

Primary target is a Windows Tauri 2 desktop window hosting React/TypeScript, with a narrow Rust command supplying the synthetic memory record. Verify the actual presentation viewport and a narrower-window layout. Use an ordinary decorated window; defer native transparency, global hotkeys, and click-through. Keep a browser preview of the same components as a presentation fallback, labeled honestly if native setup is blocked. Follow the setup checkpoint in the week-one execution plan.

## Memory: a small real file, an honest simulation

Include a synthetic record such as `fixtures/vault/preferences/weather-units.md` with an ID, category (`preference`), value (`Celsius`), synthetic source, scope (`weather`), and recorded date. Match the final schema when implemented; week-one metadata is a provisional fixture contract.

The inspector should show a tiny folder context, rendered fields, and a “View source” view of the actual Markdown. The card's unit choice must really derive from that record. A narrow Rust command accepts a known fixture ID, reads the bundled record, and returns parsed fields plus the exact source. It never accepts an arbitrary path. No vector database, graph store, Obsidian plugin, cloud account, or memory-write pipeline is needed. A small filename/source reference is more useful here than an animated memory network.

Clearly label the record “Synthetic demo memory” and lookup “Fixture lookup.” Do not imply semantic retrieval, learning, private-vault access, persistent writeback, or a completed memory architecture. If this read path risks the deadline, retain the source inspector and explicitly label application of the preference as simulated; report that limitation.

## Implementation boundary and reuse

- Use actual reusable card/header/value/evidence primitives and shared design tokens. Avoid a one-off raster dashboard or an unrelated website template.
- Create a minimal closed declarative schema for the displayed components and one revision operation. Use the planned Ajv validator and fixed fixtures; do not scaffold the entire future protocol catalog.
- Render the initial valid document and apply the preset revision only after validation. A malformed patch must leave the last good view intact. This is a presentation-contract check, not the Rust security broker.
- Keep synthetic fixture loading, component rendering, and revision application separate. Later model/voice output replaces the preset producer, not the renderer.
- Demonstrate one direct edit surviving a patch and one provenance link resolving to stored source. These are reusable foundations for S1/S2.
- Do not implement live weather/calendar services, conversation, speech, autonomous tools, learning, agent orchestration, or a GPU generation service for this checkpoint.

Higgsfield may supply a bounded pre-demo reference if already authenticated and useful; the runnable demo must not depend on a generation finishing. ComfyUI stays scheduled for the start of S3 after explicit S2 acceptance. Do not create a hosted Higgsfield site merely to demonstrate the desktop UI.

## Deadline priorities and exit checks

First establish the Tauri window and Rust fixture call under the setup checkpoint in WEEK1_DEMO_PLANNING.md. Then build the weather instrument, valid preset patch and undo, readable token styling, source-backed memory inspector, drag continuity, and small eye/transition polish. If time slips, cut optional effects and additional layouts first. Keep the functioning revision and source inspection ahead of ornament.

Before the presentation:

- Run open → add wind → inspect source → undo → close twice from reset.
- Check fixture values/units and labels, keyboard activation/Escape, and reduced motion.
- Confirm the patch preserves a moved card; invalid input cannot corrupt the last good state.
- Confirm the source viewer reads the stored fixture rather than a second hardcoded copy.
- Confirm the demo runs without live credentials or network generation.
- Save matching screenshots of base/revised/memory views, a short backup recording, and exact launch/reset instructions. Record actual checks and missing evidence.

The demo passes its narrow checkpoint when the sequence is reliable, the visual vocabulary is coherent, revision continuity is visible, and the source of the applied preference is inspectable. It supplies candidate design evidence for S0 and a small implementation subset for S1. It does not complete S0/S1/S2, validate relational effects, or prove the full desktop agent.

## After tomorrow

Collect focused critique: can viewers read the primary information, understand what changed, find the source, and distinguish the eye/status from operational authority? Record candidate baseline feedback under the existing owner gate. Feed the reusable components/fixtures into S1, add the second calendar workflow, and later connect conversational revision and simulated-memory behavior in S2. Preserve the planned voice/relational research rather than redefining the project around a polished weather widget.
