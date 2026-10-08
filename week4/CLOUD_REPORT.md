# Week 4 Cloud report: non-visual foundations (W4-1)

Session date 2026-10-03 (UTC). Task: [CLOUD_PROMPT.md](CLOUD_PROMPT.md). Running checklist: [CLOUD_PROGRESS.md](CLOUD_PROGRESS.md).

**Nothing here accepts W4-1 or any phase.** Windows, live-voice, paid-provider and owner-acceptance gates remain pending. The owner has authorized moving next to Weave-led visual work. That authorization is not acceptance, and it is not a generation allowance.

## 0. Next-session entry point

1. Read this file, then [planning.md](planning.md), [DESIGN_PROMPT.md](DESIGN_PROMPT.md) and the [Weave gate](../docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change).
2. In a connected session, discover the actual Weave route and get a quote for **S1** only ([WEAVE_JOBS.md](docs/design/WEAVE_JOBS.md)). Obtain explicit per-run cost approval before generating.
3. Inspect the outputs and record the packet under `week4/docs/design/revisions/<revision-id>/`, following the guide's layout. Only then begin UI or renderer work against it.
4. Native desktop staging stays disabled until [DURABLE_JOURNAL_REQUIREMENT.md](broker/DURABLE_JOURNAL_REQUIREMENT.md) is met and tested on Windows. Visual work may use the mocks.
5. Run `cd week4 && npm ci --ignore-scripts && npm run check` and `cargo test --manifest-path week4/Cargo.toml` to confirm the baseline.

## 1. Source, model and routes

| Item | Actual |
| --- | --- |
| Starting checkout | `da6eba55e551770ad6627929cd40904ef2bc4c9a`, branch `week4`, clean. All Week 4 inputs were tracked |
| Environment | Linux; Node v22.22.0; npm 10.9.4; cargo/rustc 1.97.0; clippy 0.1.97; rustfmt 1.9.0 |
| Main session | Cloud's selected Claude model. The platform withholds model identifiers from repository artifacts; see the Cloud session record. The harness configuration text is not independently verified route evidence |
| Broker writer | Built-in `general-purpose` subagent in an isolated worktree. It inherits the session's Claude model; its self-report is not independent route evidence. The main session integrated its files byte-for-byte in two rounds (initial crate, then review fixes). The main session itself made the `renderer.rs` alignment (§2) and the consolidation changes (§3) |
| Research | Built-in `general-purpose` subagent, read-only (web fetch/search). Same caveat |
| Independent review | Project `eva-reviewer` agent (Claude `opus` alias; self-report not independent route evidence), read-only with Read/Glob/Grep only, so it ran no tests |
| Unavailable routes | Project `eva-implementer`/`eva-mechanical`/`eva-researcher` are GPT routes through Model Gateway; Cloud has no Gateway. They were not invoked, and no Sol/Luna/Terra/Astra participation is claimed. The Ruflo `claude-flow` MCP failed to connect and was not used |
| Figma MCP | `weave_*` tool names are listed in this Cloud session. **No Figma or Weave tool was called** |

## 2. What exists (all under `week4/`)

```
week4/
  package.json, package-lock.json, tsconfig.json, .gitignore   standalone Node workspace
  Cargo.toml, Cargo.lock                                        Rust workspace: members = ["broker"]
  core/      ids, validate, scene, director, intents, narration, timeline, projection, tracking (TypeScript)
  schemas/   scene, stage-request, transcript-event, narration-manifest, asset-inventory, weave-jobs (JSON Schema 2020-12)
  fixtures/  scenes/paris-1980s-terrace.json, intents/transcripts.json (97), narration/week4-lines.json (17 lines),
             assets/inventory.json (6 refs + 51 assets), ipc/stage-requests.json (shared TS/Rust)
  tests/     scene, intents, narration, timeline, projection, tracking, director, inventory (node:test)
  broker/    eva-w4-stage-broker crate: src (16 modules), tests (9 files), README, DURABLE_JOURNAL_REQUIREMENT.md
  docs/design/WEAVE_JOBS.md, docs/design/weave-jobs.json, docs/research/SOURCE_CHECKS.md
  CLOUD_PROGRESS.md, CLOUD_REPORT.md, WINDOWS_SMOKE.md, planning.md (§6.4 wording corrected)
```

**Architecture**
- **Stack.**
  - TypeScript runs through Node's native type stripping and `node:test`.
  - The only dependency is `ajv` (strict Draft 2020-12). Dev dependencies are `typescript` ~5.9.3 and `@types/node`. Installs use `--ignore-scripts`, and no installed package declares an install script.
  - Rust uses `serde` and `serde_json` only.
  - No React, CSS, Canvas/WebGL or Tauri shell exists.
- **Schemas.** Every object sets `additionalProperties: false`. IDs are pattern-checked and byte limits apply before parsing. Free text is screened for URLs, paths, markup and handles.
- **Presentation reducer** (`core/scene.ts`). Holds weather, light, revision, a bounded undo stack (16) and frozen object IDs. Undo cannot touch consent, leases, permission or freshness.
- **Director** (`core/director.ts`). A pure event→effect state machine: home → consent → constructing → arrived → returning → restoring.
  - Session epochs reject late STT, blend, stage and consent results as `stale`. Utterances are ordered.
  - Skip is refused before consent. After consent it emits only pending required staging, then crossfades for up to 6 s, capped at the authored end.
  - One follow-up can be queued; a newer one supersedes it, and cancel clears it.
  - Graceful return (5 s) and emergency Esc/cancel are distinct. Esc in `restoring` escalates or retries the emergency restore.
  - A failed restore returns home with `restore_incomplete`.
- **Intents** (`core/intents.ts`). Deterministic and closed-set; see §5.
- **Narration.** Lines are requested by ID only, and all audio is `missing`; see §6.
- **Timeline.**
  - A–G phases, 60 s: windows move at entry (B, 5 s); the opaque veil starts at 12 s; the wallpaper is set at 22 s (D).
  - Reduced motion: 15 s, parallax off unless opted in.
  - Return: 5 s.
- **Projection and tracking.** Independently implemented: an asymmetric frustum with zero parallax at the screen plane. Eye position is approximate, from an assumed interpupillary distance (IPD); calibration, head-box clamp, One-Euro smoothing, and loss/resume easing are included. Inputs are synthetic only.
- **Broker** (`broker/`; see the [README](broker/README.md)).
  - Platform-neutral policy: consent registry, allowlisted scope, write-ahead journal **contract**, journal-folded ledger, conditional restore with read-back verification, `closing` gate, recovery under an **in-process** lock.
  - Wallpaper is modelled as a per-monitor image plus global position, colour and enabled state.
  - Uses a fake adapter, gated to tests or the `fake` feature. The native adapter fails closed.
  - There is no durable file journal.
- **IPC alignment by the main session.** `renderer.rs` matches `stage-request.schema.json` exactly (`prepare`/`enter`/`setFarField`/`restore`). The shared `fixtures/ipc/stage-requests.json` is checked by both languages.

## 3. Owner consolidation decisions (2026-10-03) and their evidence

| # | Decision | What changed | Evidence |
| --- | --- | --- | --- |
| 1 | Wallpaper image per monitor; position/layout, colour and enabled state are global and never changed | `planning.md` §6.4 wording corrected (the snapshot bullet, the restore rule and a motion note); [SOURCE_CHECKS.md](docs/research/SOURCE_CHECKS.md) updated. Broker behaviour unchanged (already conservative) | Rust `wallpaper_set_changes_only_stage_monitor_image` (globals and other monitor untouched; `enter` makes 0 wallpaper calls), `user_changed_only_wallpaper_position_mode_later`, `unrestorable_wallpaper_selects_degraded_mode` |
| 2 | Windows move at entry; wallpaper only in D under the opaque veil; skip never skips consented staging | Tests added; the timeline was already correct | TS `staging order: enter in B, far field only from D, veil opaque first` (asserts exactly `5000:enter, 12000:veil, 22000:setFarField`); `Esc at 3000/8000/15000/21750 ms … never sets the wallpaper`; `skip before entry emits the consented staging in order`; `skip with wallpaper declined …`; the existing skip tests from all 7 phases |
| 3 | 240 px column is a mock fixture only; no resizing of arbitrary windows; reject unsafe parking | New `ParkingPolicy`, default `RejectIfResizeNeeded`: a window that cannot be parked inside the stage monitor at its exact size is excluded as `DoesNotFit`, with nothing journaled or moved. `MockFitToStrip` is used only by the shared synthetic fixture. The fake now enforces per-window minimum sizes | Rust `tests/consolidation.rs`: `default_policy_is_reject_if_resize_needed`, `default_policy_rejects_windows_that_would_need_resizing`, `default_policy_parks_a_fitting_window_without_resizing_or_spilling`, `minimum_size_fit_failure_is_rejected_and_undone`, `cancel_mid_move_under_default_policy_restores_original_geometry`, `recovery_records_keep_original_geometry_and_show_state` (maximized show state round-trips through a serialized journal), plus H1 two-monitor tests. Removing the parking gate, or the minimum-size enforcement, fails a test |
| 4 | Torn final journal record fails closed for now | Requirement written: [DURABLE_JOURNAL_REQUIREMENT.md](broker/DURABLE_JOURNAL_REQUIREMENT.md). Native staging stays disabled until it is met and tested | Rust `torn_final_journal_record_fails_closed`: the record is cut mid-line; the error names the final line; no adapter calls; no silent truncation or replay |
| 5 | Cancel precedence for genuine requests; clarify "go back"; "one at a time"; negation preserved; quoted or mentioned "cancel" is not a request; scene commands separate from authority | Intents: quoted spans and mentions ("the word cancel") are removed before cancel detection; 6 fixtures added (97 total) | TS intent fixtures; director `scene commands never carry permission or OS authority`; removing the quote/mention handling fails the fixture test |
| 6 | The nine proposed voice lines stay proposed and unreviewed; audio stays missing; the planned eight keep their provenance | Exact text and triggers are listed in §6. No synthesis or recording | TS narration tests: the 8 planning lines verbatim; 0 reviewed and 17 missing; a `reviewed` take needs owner listening evidence |

## 4. Commands and actual results (final run, after all edits)

**Passed**
- `cd week4 && npm run check` (`tsc --noEmit -p tsconfig.json` + `node --test "tests/**/*.test.ts"`): typecheck clean; `# tests 103`, `# pass 103`, `# fail 0`.
- `cargo test --manifest-path week4/Cargo.toml`: **69 passed, 0 failed**.
  - By file: lib 8, boundary 2, consent 10, consolidation 7, journal 4, recovery 5, review_fixes 10, scope 5, wallpaper 6, windows 12.
  - The earlier checkpoint had 62. The worker's earlier hand-back said "72"; its own per-file counts summed to 62.
- `cargo fmt --all -- --check`: clean. The first check after the consolidation edits **failed** on layout in the new test code; `cargo fmt` was run and the recheck passed.
- `cargo clippy --all-targets -- -D warnings` and `cargo clippy -p eva-w4-stage-broker --lib -- -D warnings` (without `fake`): clean.
- `node --test week4/scripts/test-cloud-setup.mjs`: 15 passed, 0 failed.
- `bash week4/scripts/cloud-setup.sh`: exit 0, including `npm ci --ignore-scripts` from the lockfile. `EVA_CLOUD_FETCH_RUST_DEPS=1` was run earlier, and `cargo fetch --locked` succeeded.
- The six owner JPG SHA-256 hashes are unchanged (checked against the values recorded at session start, and asserted in `tests/inventory.test.ts`).
- Mutation spot checks (temporary, reverted):
  - TypeScript, 8 at the checkpoint plus 1 for quoted/mentioned cancel: all caught.
  - Rust, consolidation: 2 caught (the parking gate, minimum-size enforcement).
  - Rust, worker-reported and not rerun by the main session: the ownership checks, journal-before-effect, and each review fix.

**Failed, then fixed during the session**
- 2 of the first 83 intent fixtures.
- A consolidation test-harness ordering error: an undrained pre-consent `prepare` effect. The test now asserts it explicitly; the staging assertion is unchanged.
- The `cargo fmt` check above.
- The worker's early serde, fmt and clippy issues.
- The independent review's H1 and M1–M4 (§7).

**Blocked**
- UI and rendering until a fresh inspected Weave packet exists.
- All 26 Weave jobs, which need per-run cost approval.
- Live STT/TTS, which needs a new budget.
- Native desktop staging, until the durable-journal requirement and the Windows smoke steps are met.

**Not run**
- Real camera, microphone, wallpaper, window or capture APIs.
- Provider calls, uploads or publishing.
- Performance measurement.
- Every step of [WINDOWS_SMOKE.md](WINDOWS_SMOKE.md).

## 5. Voice routing rules (approved 2026-10-03)

- **Cancellation.** A genuine cancel request outranks every other reading: "Cancel", "No, cancel", "Never mind, cancel that", "Stop everything", "Abort", "Get me out". "Cancel the rain" also cancels, because cancelling restores the desktop.
- **Cancel blocked.** Verb-level negation ("Don't cancel", "Never cancel", "Please do not abort") is negated, with no change. Quoted speech (`He said "cancel" earlier`) and mentions ("What does the word cancel do?") are not requests.
- **Bare "stop".** Stops speech only.
- **Ambiguity.** A bare "go back" asks "Undo the last change, or go home?".
- **Combined and negated requests.** A combined request ("rainy evening") gets "One change at a time. Which first?". Other negated requests change nothing.
- **Unknown places and eras.** Unknown places, and eras other than the 1980s, get the honest line, with no staging and no generation claim.
- **Authority.** Scene commands produce only fixed scene IDs, variants and line IDs. Text cannot reach permissions, paths, handles or OS effects. Microphone decline is a notice; transcripts are still accepted for the planned typed degraded mode (L4).

## 6. Narration lines and triggers (all audio missing)

**Planned lines** (verbatim; provenance `planning.md`):

| Line ID | Text | Trigger |
| --- | --- | --- |
| `arrival.promise` | `[softly] Nineteen-eighties Paris. Stay with me a moment.` | Construction start (0 s, after consent) |
| `arrival.settle` | `[softly] There. Your coffee's still warm.` | 55 s (13 s reduced), or the end of a skip crossfade |
| `followup.rain` | `[warm] Let it rain, then. We're under the awning.` | Rain applied |
| `followup.evening` | `[calm] The lamps come on about now.` | Evening applied |
| `undo.to-rain` | `[calm] Back to the rain, then.` | Undo whose result is rainy |
| `unknown.offer` | `[calm] I haven't built that one yet. I can make it rain, bring the evening, or take you home.` | Unsupported place or era, during construction or arrival |
| `return.leaving` | `[softly] Let's go back. I'll restore what I changed.` | Graceful return start |
| `era.framing` | `[calm] This is my picture of the eighties, not a record of one day.` (§6.5) | "What year is it?", "Is this real?", "Where are we?" |

**Proposed lines** (`cloud-proposal-unreviewed`; not owner-approved):

| Line ID | Text | Trigger |
| --- | --- | --- |
| `followup.clear` | `[calm] The rain's passing.` | Rain cleared |
| `followup.afternoon` | `[calm] Back to the afternoon light.` | Afternoon restored |
| `undo.generic` | `[calm] All right. As it was.` | Undo whose result is clear weather |
| `undo.nothing` | `[calm] There's nothing to undo yet.` | Undo with an empty stack |
| `followup.already` | `[calm] It already is.` | The requested look is already current |
| `clarify.undo-or-return` | `[calm] Undo the last change, or go home?` | Ambiguous "go back" |
| `clarify.one-at-a-time` | `[calm] One change at a time. Which first?` | Combined request |
| `clarify.not-sure` | `[calm] I didn't catch that. You can ask for rain, the evening, or to go home.` | Negated, unrecognized, too long, or quoted/mentioned cancel |
| `failure.restoring` | `[calm] Something went wrong. I'm putting your desktop back.` | Failure, spoken after the emergency restore is issued |

## 7. Independent review: all findings reconciled

| # | Finding | Disposition | Evidence |
| --- | --- | --- | --- |
| H1 | Edge slots overhung onto another monitor and were then stranded | **Fixed** (broker worker), then hardened in consolidation (no resizing by default) | `h1_two_monitor_round_trip_*`, `h1_broker_authored_monitor_context_is_owned`, `tests/consolidation.rs` |
| M1 | `enter` erased an earlier cancel | **Fixed** | `m1_cancel_requested_before_enter_moves_nothing` |
| M2 | Staging was accepted after restore; other receipts stayed valid; the ledger did not reopen effects | **Fixed** | `m2_*` tests (4) |
| M3 | The director could be stuck in `restoring`; no emergency escalation | **Fixed** (director + broker) | TS `Esc during a graceful restore escalates…`, `a failed broker restore does not strand…`; Rust `m3_emergency_during_graceful_return_jumps_to_prior` |
| M4 | Interjections suppressed cancel | **Fixed** | Intent fixtures "No, cancel" etc. |
| L1 | A read-back after EVA's own failed step counts as owned, so a coincident user drag could be undone | **Retained, with rationale.** It avoids misreporting EVA's own failed attempt as a user change. The window is a single read-back instant, and the native spike must measure it. Revisit with the native adapter | `windows.rs` retry test documents the trade-off |
| L2 | Recovery lock is in-process only; no lease against live staging | **Blocked** on native readiness: requirement item 5 | `RecoveryLock` doc comment; [DURABLE_JOURNAL_REQUIREMENT.md](broker/DURABLE_JOURNAL_REQUIREMENT.md) |
| L3 | Success-returning fake was public | **Fixed** | `#[cfg(any(test, feature = "fake"))]`; `cargo clippy --lib` clean without the feature |
| L4 | Microphone decline does not gate transcripts | **Retained, with rationale.** Planning's typed-request degraded mode uses the same transcript path, and real microphone gating belongs to the STT adapter, which does not exist yet | §5 |
| L5 | An unfinished earlier restore is not surfaced by `prepare` | **Retained, with rationale.** `enter` fails closed (`EffectsOutstanding`), and the director labels it `stage_degraded`. Explicit surfacing belongs with the durable journal and native recovery work | `second_session_blocked_while_effects_outstanding` |
| L6 | Utterance numbering undocumented | **Fixed** | `transcript-event.schema.json` description |
| L7 | A late skip arrived after the authored end | **Fixed** | TS `late skip never arrives later than the authored timeline` |
| L8 | Motion steps have no timing | **Blocked.** Pacing belongs to the native host and the W4-3 spike | — |
| L9 | Report wording overstated the journal and review status | **Fixed** | This report: "journal contract", "in-process lock", real routes |

## 8. Implemented versus mocked

| Area | Status |
| --- | --- |
| Scene contract, reducer, director, intents, narration manifest, timeline, projection and tracking maths | Implemented as pure logic with tests on synthetic inputs |
| Desktop broker | Policy implemented; the OS is **mocked**; the native adapter returns unsupported; there is no durable journal |
| Speech | Transcript routing only. No microphone, STT or TTS. 17 voice takes missing (9 lines unreviewed) |
| Assets | Inventory only. All 51 are `missing`, with rights unreviewed or pending. The six owner JPGs are mood references only and were inspected visually |
| Generation | None. The 26 Weave jobs are "not run, awaiting cost approval" |

## 9. Source control

- **Checkpoint:** commit `1206a221fbf94979228a427793454e213393e219` on `week4`, pushed to `origin/week4` (fast-forward from `da6eba5`) under the owner's explicit 2026-10-03 authorization. No `main` write, PR, force push or merge.
- **Consolidation:** a second commit on `week4` contains §3–§7. The owner receives its SHA in the hand-back message; a file cannot contain its own commit hash.
- The broker worker's isolated worktree remains at `.claude/worktrees/agent-ad066a53577beaded`, which Git ignores. It predates the consolidation and is not a source of truth.
- **Windows, live voice, paid generation, native staging and all owner acceptance (W4-1 included) remain pending.**
