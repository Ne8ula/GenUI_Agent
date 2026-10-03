# Week 4 Cloud report: non-visual foundations (W4-1)

Session date 2026-10-03 (UTC). Task: [CLOUD_PROMPT.md](CLOUD_PROMPT.md). Running checklist: [CLOUD_PROGRESS.md](CLOUD_PROGRESS.md). **Nothing here accepts W4-1 or any phase. UI, Weave, paid-provider and Windows gates all remain pending.**

## 1. Source, model and routes

| Item | Actual |
| --- | --- |
| Checkout | `da6eba55e551770ad6627929cd40904ef2bc4c9a`, branch `week4`, clean at start. All Week 4 inputs were tracked |
| Environment | Linux; Node v22.22.0; npm 10.9.4; cargo/rustc 1.97.0; clippy 0.1.97; rustfmt 1.9.0 |
| Main session | Cloud's selected Claude model. The platform withholds model identifiers from repository artifacts; see the Cloud session record. The harness configuration text is not independently verified route evidence |
| Broker writer | Built-in `general-purpose` subagent in an isolated worktree. It inherits the session's Claude model; its self-report is not independent route evidence. The main session integrated its files byte-for-byte in two rounds: the initial crate, then the review fixes from §7. Between the rounds the main session changed `renderer.rs` (§2) |
| Research | Built-in `general-purpose` subagent, read-only (web fetch/search). Same model caveat |
| Independent review | Project `eva-reviewer` agent (Claude `opus` alias; its self-report is not independent route evidence), read-only with Read/Glob/Grep only, so it ran no tests. Results are in §7 |
| Unavailable routes | Project `eva-implementer`/`eva-mechanical`/`eva-researcher` are GPT routes through Model Gateway; Cloud has no Gateway, so they were not invoked, and no Sol/Luna/Terra/Astra participation is claimed. The Ruflo `claude-flow` MCP failed to connect and was not used |
| Figma MCP | `weave_*` tool names are listed in this Cloud session. **No Figma or Weave tool was called**: no cost approval, no packet requested, the owner was unavailable |

## 2. What changed (all under `week4/`; no tracked file modified)

```
week4/
  package.json, package-lock.json, tsconfig.json, .gitignore   standalone Node workspace (no workspaces, no root forwarding)
  Cargo.toml, Cargo.lock                                        Rust workspace: members = ["broker"]
  core/      ids, validate, scene, director, intents, narration, timeline, projection, tracking (TypeScript)
  schemas/   scene, stage-request, transcript-event, narration-manifest, asset-inventory, weave-jobs (JSON Schema 2020-12)
  fixtures/  scenes/paris-1980s-terrace.json, intents/transcripts.json (91), narration/week4-lines.json (17 lines),
             assets/inventory.json (6 refs + 51 assets), ipc/stage-requests.json (shared TS/Rust)
  tests/     scene, intents, narration, timeline, projection, tracking, director, inventory (node:test)
  broker/    eva-w4-stage-broker crate: src (16 modules), tests (8 files incl. review_fixes.rs), README
  docs/design/WEAVE_JOBS.md, docs/design/weave-jobs.json, docs/research/SOURCE_CHECKS.md
  CLOUD_PROGRESS.md, CLOUD_REPORT.md, WINDOWS_SMOKE.md
```

### Architecture and decisions

- **Stack.** TypeScript runs through Node's native type stripping and `node:test`. The only dependency is `ajv` (Draft 2020-12, strict mode); dev dependencies are `typescript` ~5.9.3 and `@types/node`. Rust uses `serde` and `serde_json` only. Installs used `--ignore-scripts`, and none of the installed packages declares an install lifecycle script. There is no React, CSS, Canvas/WebGL or Tauri shell.
- **Schemas are the source of truth.** Every object sets `additionalProperties: false`. IDs are pattern-checked and byte limits apply before parsing. Free text is screened for URLs, paths, markup and handle-like values. Cross-reference checks cover anchors, required IDs and depth-band order.
- **Presentation reducer** (`core/scene.ts`) holds only weather, light, revision, a bounded undo stack (16) and frozen object IDs. Undo therefore cannot touch consent, leases, permission or freshness.
- **Director** (`core/director.ts`) is a pure event→effect state machine.
  - Modes: home → consent → constructing → arrived → returning → restoring.
  - Sessions are `w4s-<epoch>`. A new epoch opens on start, cancel and restore start, so late STT, blend, stage or consent results are rejected as `stale`. Utterances are ordered.
  - Skip is refused before consent. After consent it emits only the required staging not yet reached, then crossfades for 6 s.
  - One follow-up can be queued; a newer one supersedes it, and cancel clears it.
  - Graceful return (5 s, then a graceful restore) and Esc/cancel (an immediate emergency restore, with no speech prerequisite) are distinct paths. On failure the director restores first, then reports.
- **Intents** (`core/intents.ts`) are deterministic and closed-set, as in planning §6.5. `ask_about_era` was added from §6.5's honesty rule. Conservative choices:
  - Bare "stop" stops speech.
  - "Cancel …" always wins, including "cancel the rain", because cancelling restores the desktop.
  - "Go back" is ambiguous and gets a clarification.
  - Combined requests ("rainy evening") get "one at a time".
  - Negation means no change.
  - Unknown places, and eras other than the 1980s, get the honest line and no staging.
- **Narration** reuses the Week 1 v3 policy values, copied into the manifest rather than imported, to keep Week 4 standalone.
  - Lint rules: tag allowlist, ≤3 stacked cues, no SSML or ellipses, no quiet+loud mix, no emphatic capitals, and a short-form exception for each line.
  - The 8 planning lines are verbatim. The 9 additional lines are labelled `cloud-proposal-unreviewed`.
  - All audio is `missing`, and a `reviewed` take needs owner listening evidence and a hash.
- **Timeline** (`core/timeline.ts`) holds the authored A–G phases (60 s), the reduced-motion version (15 s, parallax off unless opted in) and graceful return (5 s). Windows move in B; the wallpaper is set in D under the opaque veil.
- **Projection and tracking** were implemented independently, since the off-axis repository's licence is unverified.
  - Projection uses an asymmetric frustum with the screen plane at z=0, so the cup has zero parallax.
  - Tracking estimates eye position from an assumed IPD, with mirrored-camera handling, neutral calibration (≥15 stable samples), a head-box clamp of ±12/±8/±12 cm, a One-Euro filter, a 250 ms hold, an 0.8 s ease to neutral, and a 300 ms resume blend. It is approximate by design.
- **Broker** (`broker/`; see its [README](broker/README.md)).
  - Platform-neutral policy with a fake adapter and an unsupported native adapter that fails closed.
  - Consent registry and allowlisted scope.
  - A write-ahead journal **contract**: an in-memory journal plus a JSON-lines encoder/decoder. There is no durable file journal yet.
  - A journal-folded ledger and conditional restore with read-back verification.
  - Recovery serialized by an **in-process** lock only. Live staging is not yet lease-serialized against recovery.
  - Wallpaper modelled as a per-monitor reference plus global position, colour and enabled state.
  - Edge slots stay inside the stage monitor; windows are fitted into a 240 px column, so they may be resized.
  - A `closing` state after restore starts.
  - The fake adapter is gated behind a test-only `fake` feature.
- **Integration fix made by the main session.** The worker's renderer command used `scene`/`variant`/`set_far_field` and an extra `cancel`, which drifted from `stage-request.schema.json`. I aligned it to `sceneId`/`variantId`/`setFarField`/`restore` exactly. Emergency cancel is `restore` with mode `emergency`. The new shared `fixtures/ipc/stage-requests.json` is checked by both languages.

## 3. Commands and results

**Passed**
- `bash week4/scripts/cloud-setup.sh`: exit 0. It was run three times: before any manifest existed (dependency installs deferred); after `package-lock.json` existed (`npm ci --ignore-scripts` succeeded); and after `Cargo.lock` existed (Rust fetch skipped by default).
- `EVA_CLOUD_FETCH_RUST_DEPS=1 bash week4/scripts/cloud-setup.sh`: exit 0; `cargo fetch --locked` succeeded.
- `node --test week4/scripts/test-cloud-setup.mjs`: 15/15 passed.
- `cd week4 && npm run check` (`tsc --noEmit` + `node --test "tests/**/*.test.ts"`): typecheck clean, **95/95 passed** (the final run after the review fixes; the intent fixture now has 91 transcripts).
- `cargo test --manifest-path week4/Cargo.toml`: **62/62 passed** (lib 8, boundary 2, consent 10, journal 4, recovery 5, review_fixes 10, scope 5, wallpaper 6, windows 12). The worker's hand-back said "72"; its own per-file counts sum to 62, and 62 is what the main session observed.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and `cargo clippy --lib -- -D warnings` (without `fake`): clean.
- **Mutation spot checks**, each temporary and reverted, to show the tests can fail:
  - TypeScript, 8 mutations, all caught: ignoring wallpaper consent, removing the blend staleness check, removing utterance ordering, skip dropping staging, an unbounded undo stack, a flipped frustum sign, ignoring camera mirroring, and ignoring cancel negation.
  - Rust, reported by the worker and not rerun by the main session: removing the restore ownership checks failed 7 tests; applying an effect before journaling failed 2. Reverting each review fix failed its regression tests (H1a, H1b, M1, M2 ×3, M3).
- Owner reference hashes are unchanged (SHA-256 recorded before and after; also asserted in `tests/inventory.test.ts`).

**Failed, then fixed during the session**
- 2 of 83 intent fixtures at first: "rainy afternoon" is now treated as a combined request, and "let's go back" now means return.
- A broker serde unit-variant issue, the worker's first test run, and the formatting and clippy findings. The worker fixed them.
- The independent review found 1 high, 4 medium and 9 low issues; §7 lists them and what was fixed.

**Blocked**
- All UI, rendering and visual work: no fresh Weave packet, no cost approval, `EVA_W4_WORK_MODE=foundations`.
- Weave generation (the 26 jobs in [WEAVE_JOBS.md](docs/design/WEAVE_JOBS.md)).
- Live STT/TTS: a new budget is needed.
- Every Windows check.

**Not run**
- Real camera, microphone, wallpaper, window or capture APIs.
- Any provider call, upload or publish.
- Performance measurements.
- Everything in [WINDOWS_SMOKE.md](WINDOWS_SMOKE.md).

No permission or network denials occurred. The npm registry, crates.io and the research fetches worked under the environment's network policy; some research pages returned 403 and are marked "snippet only".

## 4. Implemented versus mocked

| Area | Status |
| --- | --- |
| Scene contract, reducer, director, intents, narration manifest, timeline, projection and tracking maths | Implemented as pure logic with tests. Inputs are synthetic |
| Desktop broker | Policy implemented. The OS is **mocked**; the native adapter returns unsupported |
| Speech | Transcript routing only. No microphone, STT or TTS. All 17 voice takes are missing |
| Assets | Inventory only. All 51 are `missing`, with rights unreviewed or pending. The six owner JPGs are recorded as mood references with runtime use prohibited, and they were inspected visually by the main session (consistent with DESIGN_PROMPT §2; the faint watermark on `a207be6c…` was not clearly visible at this resolution) |
| Generation | None. Every Weave job is "not run, awaiting cost approval"; the schema forbids run IDs, costs or outputs |
| Research | [SOURCE_CHECKS.md](docs/research/SOURCE_CHECKS.md). Notably, **planning §6.4's "per-monitor" wallpaper position and colour conflicts with Microsoft Learn: they are global.** planning.md was left unedited for the owner; the broker contract follows the API documentation |

## 5. Remaining Windows-only checks and the next owner action

The Windows-only checks are listed in [WINDOWS_SMOKE.md](WINDOWS_SMOKE.md): WebView2 GPU and transparency, the full head-box seam and parallax check, the wallpaper/window round trip, Esc, crash/watchdog, user-overridden state, multi-monitor/DPI, and live voice.

**Smallest next owner action:** read this diff, then decide whether to authorize a commit. In a connected session, approve a quote for the single Weave **S1** job, so that P1 can start and the W4-3 renderer/desktop spike can follow.

Open decisions for the owner:
1. The `enter`/`set_far_field` split in the broker, and the 240 px in-monitor edge column. Windows may be resized; overhanging slots are not used because they could land on another monitor.
2. Whether recovery should tolerate a torn final journal line (currently it fails closed).
3. The 9 proposed voice lines.
4. The conservative intent choices in §2.
5. Correcting planning §6.4's wording.
6. Review L1: a read-back after EVA's own failed step counts as broker-owned, so a coincident user drag could be undone.
7. Microphone decline (L4): transcripts are still accepted, because planning's typed-request degraded mode uses the same path.
8. Whether to bump the journal format version. It changed during this session and remains v1; nothing has been persisted.

## 6. Source control and gates

- **No commit, push, PR or branch switch was made.** A generic platform stop hook asked for a commit and push. I declined, because CLOUD_PROMPT and the cloud README explicitly forbid agent-invoked commits and pushes without a separate owner instruction.
- The work exists only as untracked files in this container's checkout, so the owner should retrieve or authorize it before the session is reclaimed.
- The broker worker's isolated worktree remains at `.claude/worktrees/agent-ad066a53577beaded` (ignored by Git). Its `renderer.rs` predates the integration fix.
- **UI, Weave, paid-provider and Windows gates, and all owner acceptance (W4-1 included), remain pending.** None is evidenced here.

## 7. Independent review

Reviewer: project `eva-reviewer` agent, Claude `opus` alias, read-only with no shell. Findings and dispositions follow; every fix has a regression test, and the main session reran all checks afterwards.

| # | Finding | Disposition |
| --- | --- | --- |
| H1 | Edge slots overhung onto a neighbouring monitor. On real Windows, restore would then report "UserChanged" and strand the window | **Fixed (broker worker):** slots stay inside the stage monitor; applied steps record monitor and DPI; the fake reassigns a window's monitor by overlap; two-monitor round-trip tests added |
| M1 | `enter` reset the cancel token, erasing an Esc raised just before it | **Fixed:** the token is reset in `prepare` and after a completed restore; `enter` checks it before `SessionBegin` |
| M2 | Staging was still accepted after restore had started, other receipts stayed valid, and the ledger did not reopen settled effects | **Fixed:** a `closing` gate; every receipt of the session is consumed; a new intent clears the ledger's terminal result |
| M3 | The director could stay in `restoring` forever, and Esc could not escalate a graceful restore | **Fixed (main session):** Esc or cancel in `restoring` re-issues an emergency restore; a failed restore result returns home with `restore_incomplete`; the broker checks the cancel token between return steps |
| M4 | "No, cancel" and "Never mind, cancel that" were read as negated | **Fixed (main session):** only verb-level negation ("do not cancel", "never cancel") blocks cancel; 6 fixtures added |
| L1 | A coincident user drag could be taken as an EVA-owned read-back | Open owner decision (§5) |
| L2 | Recovery lock is in-process only; live staging is not leased against recovery | Documented in code, README and this report; not implemented |
| L3 | The success-returning fake was public | **Fixed:** behind `cfg(test)` / the `fake` feature |
| L4 | Microphone decline does not gate transcripts | Open owner decision (§5) |
| L5 | An unfinished earlier restore is not surfaced by `prepare` | Not fixed. `enter` fails closed with `EffectsOutstanding`, and the director shows `stage_degraded`. Follow-up |
| L6 | Utterance numbering rule undocumented | **Fixed:** described in the transcript schema |
| L7 | A late skip could arrive after the authored end | **Fixed:** crossfade capped to the remaining time; test added |
| L8 | Motion steps have no timing | Not fixed; pacing belongs to the native host and the W4-3 spike |
| L9 | Report overstated the journal and review status | **Fixed** in this report |
