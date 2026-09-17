# Week 1 relocation verification

Date: 2026-09-17. Performed by Codex using PowerShell, Node/npm, Cargo/Tauri and Playwright with installed Edge on Windows. This is a directory reorganization, not a new UI rendition or owner native acceptance.

| Check after relocation | Actual result |
| --- | --- |
| Root command forwarding | Build, test, dev, desktop debug build and Rust commands execute the isolated project under `week1/`. |
| Workspace dependency links | Offline npm install refreshed three local workspace junctions to their relocated paths; existing versions/lockfile retained. |
| Frontend/server TypeScript and Vite build | Passed. Output bundle hashes match the pre-move build. |
| JavaScript tests | 24 passed, including memory/protocol/voice/narration and 1000 ms audio ending. |
| Rust tests | 17 passed. |
| Rust formatting and Clippy | Passed, with warnings denied for Clippy. |
| Tauri debug application build | Passed through the root `npm.cmd run desktop:build:debug` command, producing `week1/apps/desktop/src-tauri/target/debug/eva-desktop.exe`. |
| Browser entry/voice smoke | Passed at 1440x960 and 400x640, with one microphone entry button, transparent surfaces, keyboard focus and synthetic microphone-to-weather flow; no page errors. [Results](relocation-browser/results.json). |
| Source/evidence preservation | All 931 inventoried files remain present. Historical non-Markdown evidence and runtime source/configuration retain their pre-move hashes. Intentional edits are listed in [relocation checks](relocation-checks.json). |
| Documentation links | Local Markdown targets checked after updating cross-boundary references; no unresolved targets remain. |
| Private configuration | Moved without printing its contents; `week1/.env.local`, dependencies and build caches remain Git-ignored. A blank `.env.example` is provided. |
| Native window/live provider exercise | Not rerun. No paid provider calls made for relocation verification. |

The first Rust test attempt exposed cached Tauri permission paths pointing to the old absolute location. `node scripts/rust.mjs clean -p tauri` removed only that package's build artifacts; rebuilding regenerated the metadata. Rust tests, the debug application build and Clippy then passed. Rustup emitted a non-fatal home-path canonicalization warning in the restricted environment.

Browser captures: [wide](relocation-browser/1440.png), [narrow](relocation-browser/400.png), [weather](relocation-browser/dashboard.png). These are synthetic fixture checks, not new native compositing evidence. The temporary dev server used by this task was stopped after verification.

The only verification-harness behavior changed is `speak-only-smoke.mjs`: it now accepts a fresh output directory, defaults to a temporary directory and refuses to overwrite an existing evidence directory. Historical captures are preserved. Other historical button-driven harnesses remain as records of earlier interfaces.

The [relocation map](relocation.json) records pre-move hashes, old/new paths and moved roots. Historical result JSON and source-hash files retain their original paths and timestamps. Shared product planning, design governance, research concepts/proposal and exports remain at the repository level. The owner's existing planning and proposal edits were preserved; only their Week 1 link targets changed during relocation.
