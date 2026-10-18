# Retained Week 4 foundation

Current direction: [memory palace](../PLANNING.md). This folder retains the Paris/eye implementation and reusable contracts. Old Cloud/design/Rust prompts are retired assignments.

## Setup and run

Requires Node >=22.18, npm, Cargo/Rust, the `wasm32-unknown-unknown` target and matching `wasm-bindgen 0.2.128`. The build checks `week4/target/wasm-tools/bin`, then PATH. Inspect available tools before installing; cleanup installs none.

From the repository root:

```powershell
npm.cmd ci --prefix week4
npm.cmd run dev
npm.cmd run check
npm.cmd run rust:test
```

Open `http://127.0.0.1:1440/?scene=paris-arrival` for eye/source/scene/object interaction. The root URL opens the Rust scene. Retained alternatives: `?scene=paris-scan`, `?scene=paris-hybrid` and development-only `?historical=1`; these are fixtures, not midterm assignments.

Root commands target Week 4; none forwards to removed Week 1. Keeping this directory avoids an application migration during cleanup.

## What exists

React eye/arrival host, closed local intent routing, construction timeline, source-photo discovery, keyboard/touch/hover object inspection; source-derived 2.5D and hybrid fixtures; authored Rust/WASM geometry; bounded contracts and projection math; mock Rust desktop policy.

Native Windows effects remain unsupported. Upload-to-multiview reconstruction, automatic detection, live conversational journal and forensic analysis are not implemented capabilities.

The bounded [R18 acceptance/evidence](docs/design/acceptance/w4-hover-overlays-r18.md) remains. The eye test oracle in `fixtures/regression/original-eye.ts` was copied intact from Week 3.

## Fixture and packaging limits

`fixtures/assets/inventory.json` and `weave-jobs.json` are historical schema-test data, not a current backlog, live quote or approved generation plan. Six reference JPGs remain because tests verify their provenance and prohibit runtime use.

All app source modules are reachable from existing entry points, including development routes. Their behavior is preserved. Comments/manifests may cite historical packet paths; retrieve them through [history](../docs/HISTORY.md), not as runtime dependencies.

Pre-cleanup packaging gaps: the production allowlist omits the hybrid pack and one SourceWindows photograph. This cleanup does not claim production parity for those routes. Arrival is the review entry point.
