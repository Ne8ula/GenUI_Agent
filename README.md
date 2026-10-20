# EVA: memory palace

The midterm focus is an artistic, explorable reconstruction of a remembered place. The browser demo contains a [room-wide reconstruction/completion candidate](docs/design/revisions/room-refinement-v5/REVIEW.md) of Hypersim `ai_001_004`: all 100 supplied RGBD views, inferred architecture, recovered source detail and explicitly assumed adjoining spaces. Navigate full surfaces or simplified dots, inspect provenance, and toggle assumed space in Sources & details. This uses supplied depth/poses; hidden structure remains inferred and visible seams remain. EVA conversation and editable memory annotations remain proposed.

Start with [midterm scope](PLANNING.md), [visual direction](DESIGN.md), and the [condensed Dreamatorium/Shado research plan](docs/research/EVA_RESEARCH_IMPLEMENTATION_PLAN.md). Development rules are in [AGENTS.md](AGENTS.md).

## Run the retained foundation

The application remains in [week4/](week4/README.md), alongside the retained Paris/eye fixtures.

```powershell
npm.cmd ci --prefix week4
npm.cmd run dev
```

Open **http://127.0.0.1:1440/** for the reconstructed room (also `?scene=hypersim-room`). Drag to look, scroll to move, or focus the room and use W A S D / arrow keys. Home resets the selected view. Touch supports dragging, pinching and movement buttons. Choose **Sources & details** to inspect source images and coverage limits.

Retained routes: `?scene=paris-arrival` for the eye fixture and `?scene=rust` for the procedural Rust scene. Rust/WASM tooling is required by the app build; see [setup and checks](week4/README.md).

`npm.cmd run check` checks the TypeScript application; `npm.cmd run rust:test` checks the Rust workspace.

The [current room review and before/after captures](docs/design/revisions/room-refinement-v5/REVIEW.md) document the room-completion refinement under its existing Weave waiver. [Acceptance](docs/design/acceptance/room-refinement-v5.md) is pending. The original 96-view reconstruction remains at `?scene=hypersim-room&room=r03`, with its [original review](docs/design/revisions/room-r03/REVIEW.md). The [R18 acceptance](week4/docs/design/acceptance/w4-hover-overlays-r18.md) covers only the earlier hover/overlay refinement. Photo-only reconstruction, live conversation and editable memory annotations are upcoming work.

## Repository map

- `week4/app`: React host, eye, renderers, source inspection and tests.
- `week4/core`, `schemas`, `fixtures`, `tests`: bounded data/behavior contracts.
- `week4/renderer`: authored Rust/WASM graphics; `week4/broker`: mock desktop policy.
- `docs/design`: Weave workflow and evidence index.
- `docs/research`: one long-term plan and the supplied seven-step chart.
- [History and recovery](docs/HISTORY.md): superseded material and recovery commit.

Weeks 1?3, superseded Week 4 handoffs and most historical media were removed from this checkout on the owner's 2026-10-18 instruction. Git history remains intact. Retrieve old material only for a specific recovery task.
