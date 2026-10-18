# EVA: memory palace

The midterm focus is an artistic, explorable reconstruction of a remembered place. EVA's eye helps the user supply photographs, explore a room, inspect objects and add memories. This is the current direction, **not an implemented reconstruction capability**.

Start with [midterm scope](PLANNING.md), [visual direction](DESIGN.md), and the [condensed Dreamatorium/Shado research plan](docs/research/EVA_RESEARCH_IMPLEMENTATION_PLAN.md). Development rules are in [AGENTS.md](AGENTS.md).

## Run the retained foundation

The application remains in [week4/](week4/README.md). It is the Paris/eye browser fixture, not the new memory palace.

```powershell
npm.cmd ci --prefix week4
npm.cmd run dev
```

Open `http://127.0.0.1:1440/?scene=paris-arrival` for the eye, source photos, artistic scene and hoverable objects. The root URL opens the procedural Rust scene. Rust/WASM tooling is required; see [setup and checks](week4/README.md).

`npm.cmd run check` checks the TypeScript application; `npm.cmd run rust:test` checks the Rust workspace.

The [R18 acceptance](week4/docs/design/acceptance/w4-hover-overlays-r18.md) covers only the 2026-10-16 hover/overlay refinement. Multiview reconstruction, live conversation and editable memory annotations are upcoming work.

## Repository map

- `week4/app`: React host, eye, renderers, source inspection and tests.
- `week4/core`, `schemas`, `fixtures`, `tests`: bounded data/behavior contracts.
- `week4/renderer`: authored Rust/WASM graphics; `week4/broker`: mock desktop policy.
- `docs/design`: Weave workflow and evidence index.
- `docs/research`: one long-term plan and the supplied seven-step chart.
- [History and recovery](docs/HISTORY.md): superseded material and recovery commit.

Weeks 1?3, superseded Week 4 handoffs and most historical media were removed from this checkout on the owner's 2026-10-18 instruction. Git history remains intact. Retrieve old material only for a specific recovery task.
