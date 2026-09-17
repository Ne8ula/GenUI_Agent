# week1-memory-20260916

Status: step-2 candidate; owner review pending. Date: 2026-09-16.

- Scope: synthetic Markdown resource, `get_demo_memory`, strict field parser, native permission, matching browser adapter, and runnable contract checks. No visual edit or new UI surface.
- Accepted baseline: `week1-resize-20260916`, confirmed by the owner with "Everything is confirmed. Start next implementation step." Source hashes were checked before edits. This acceptance applies to step 1, not the whole week-one demo or a release build.
- Source: working tree based on `83a155f`; [hashes](source-hashes.json) identify the new fixture, backend, adapter, contract tests and integration runner. Existing owner planning edits preserved.
- Actual implementation/tools: Codex / GPT-6, PowerShell, apply_patch, Node 24.14.0, Rust 1.98.1, Tauri 2.11.5, Playwright 1.63.0, Edge/WebView2. No additional model reviewer or media provider was invoked.
- Fixture: `fixtures/vault/preferences/weather-units.md`; fixed synthetic metadata dated 2026-09-16, no private data. No runtime clock or seed.
- Platform: Windows x64; development debug host loading `http://127.0.0.1:1420/`. Captures use the unchanged setup screen at 960×760 CSS px, DPR 1; browser narrow regression is 400×640, reduced motion enabled. No animation changed.
- Intent: return the actual bundled source with parsed preference fields; deny unknown IDs and path/authority-bearing requests without granting general filesystem access.

## Actual checks

- [Native integration](native/results.json): passed real `getDemoMemory()` → IPC → Rust lookup, exact source equality with the fixture, derived metadata, display-only source reference, unknown-ID rejection, unknown path/permission field rejection, and bounded adapter error. Existing connection, error/retry, close/relaunch checks also passed.
- [Browser integration](browser/results.json): passed same source/fields, explicit `browser-fixture` transport, invalid-ID error; existing keyboard and narrow-layout regression passed.
- `npm.cmd run memory:check`: 3 JavaScript contract tests + 7 Rust memory tests passed.
- `npm.cmd run rust:test`: all 10 Rust tests passed, including the original probe tests.
- TypeScript check, Vite production build, rustfmt and Clippy with warnings denied passed. The first typecheck identified unsupported `Object.hasOwn` under ES2020; replaced with the compatible own-property call and retested.
- `git diff --check` passed. No dependency added and no lockfile changed.

The existing development watcher rebuilt/restarted the Rust host to include the command. This is development IPC evidence; no new standalone/release bundle was built. Missing bundled files fail compilation. The absent-source parser branch is tested directly, not through a fabricated runtime file failure. UI screenshots retained by the smoke runner are regression artifacts; there is no new memory inspector to accept visually. The previously accepted resize baseline remains the visual baseline.

Owner feedback, 2026-09-16: supplied contract-fixture output confirms 3 JavaScript and 7 Rust memory tests passed with zero failures; current source hashes match this revision. Owner decision: pending for step 2. See the [owner review](../../acceptance/week1-memory.md). Release-build policy issue, full weather UI, schema/patch protocol and memory inspector remain outside this step.
