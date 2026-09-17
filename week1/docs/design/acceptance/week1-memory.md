# Week-one step 2: synthetic memory boundary

Status: **pending owner review**, prepared 2026-09-16. Accepted input baseline: `week1-resize-20260916` (step 1), explicitly confirmed by the owner before authorizing this step.

Follow-up, 2026-09-16: after supplying the passing contract output below, the owner explicitly requested implementation of the next steps and the visual pattern. That authorizes continuation within week one. It does not assert that the owner separately inspected every source/result field. The [weather candidate](week1-weather.md) now supplies the consumer and source inspector for the next exercise. The original technical record below is preserved.

Revision: `week1-memory-20260916`, source and evidence identified in the [manifest](../revisions/week1-memory-20260916/manifest.md). Implementation: Codex / GPT-6 using local Rust, TypeScript and Playwright tools; no external reviewer was invoked.

## Owner exercise

1. Read the [synthetic record](../../../fixtures/vault/preferences/weather-units.md).
2. Run `npm.cmd run memory:check` from the repository root. Expect 3 JavaScript and 7 Rust memory tests to pass.
3. Inspect the `memoryLookup` entry in the [actual native result](../revisions/week1-memory-20260916/native/results.json). Confirm `Celsius`, synthetic provenance, weather scope, recorded date, exact Markdown source and the relative source reference. Compare the [browser result](../revisions/week1-memory-20260916/browser/results.json), which must identify itself as `browser-fixture`.
4. For a fresh live check, follow [the integration retest commands](../../setup/DEMO_MEMORY.md). Expect native IPC success and rejection of invalid IDs/path/authority fields. Failure messages exposed by the adapter are bounded to **Demo memory unavailable**.

## Technical record

Passed: all 10 Rust tests, 3 JavaScript contract tests, native and browser integration, TypeScript/Vite build, Rust formatting and Clippy. Source equality is checked against the file rather than a second hand-written fixture. Tests cover malformed metadata, unknown/duplicate fields, missing input, invalid dates, unsupported units, size limits and authority/path injection. The native capability remains limited to `main` and the two explicit application commands.

Limitations: this is a runnable backend/adapter foundation fixture. The setup screen is unchanged; the weather consumer and source inspector remain planned steps 3 and 5. The record is compiled into Rust; missing it fails the build, and the bounded absent-source parser result is verified by a unit test. No arbitrary filesystem lookup, live account, private vault, memory write or semantic retrieval exists. No new standalone/release executable is claimed; the earlier Application Control release blocker remains.

Owner feedback, 2026-09-16: the owner supplied their `npm.cmd run memory:check` output: 3 JavaScript tests passed, 7 Rust memory tests passed, zero failures. The 3 filtered Rust tests are the existing runtime-probe tests excluded by the `demo_memory` filter; the main binary contains no separate tests. Current source hashes match `week1-memory-20260916`. This records the owner's successful contract-fixture run; source/result review and explicit step-2 acceptance were not stated in that message.

Blockers found during implementation (ES2020 `Object.hasOwn` mismatch) were fixed and retested. Decision/date: pending. Full week-one and study/product milestone acceptance remain separate.
