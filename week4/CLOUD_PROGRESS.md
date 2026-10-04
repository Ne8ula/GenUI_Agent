# Week 4 Cloud progress

Session started 2026-10-03 (UTC). Task: [CLOUD_PROMPT.md](CLOUD_PROMPT.md), bounded non-visual foundations (W4-1). No earlier progress file existed, so this is the first session.

Status keys: **planned**, **in progress**, **passed**, **failed**, **blocked**, **not run**.

## Session facts

| Item | Value |
| --- | --- |
| Checkout | `da6eba55e551770ad6627929cd40904ef2bc4c9a` ("week 4 init planning commit"), branch `week4`, clean initial status |
| Week 4 source present | Yes. `git ls-files -- week4` lists both briefs, AUTHORSHIP, CLOUD_PROMPT, the cloud pack, both scripts and all six JPGs |
| Environment | Linux; Node v22.22.0; npm 10.9.4; cargo/rustc 1.97.0. EVA env values as in the cloud README (`foundations`, `mock`, empty packet) |
| Selected model | Cloud's selected Claude model. The platform withholds model identifiers from repository artifacts; see the Cloud session record. The harness configuration text is not independent route evidence |
| Project `eva-*` GPT routes | **Unavailable.** No Model Gateway in Cloud (`ANTHROPIC_BASE_URL` points at Anthropic). Sol, Luna and Terra were not invoked. Workers used the built-in `general-purpose` type, which inherits the session's Claude model |
| Ruflo | `claude-flow` MCP failed to connect (connection closed). Not used |
| Figma MCP | Tool names, including `weave_*`, are listed in this session. No Weave call was made: there is no cost approval and the owner is unavailable |

## Checklist

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 0 | Repository bootstrap `bash week4/scripts/cloud-setup.sh` | passed | Exit 0. Node and Rust dependency setup deferred because no manifests existed yet |
| 0b | Fresh-Weave prerequisite inventory | blocked | No packet, no cost approval, mode `foundations`. **All UI, rendering and visual work is blocked** |
| A | Standalone Week 4 workspace | passed | `package.json` + lock; deps ajv, typescript, @types/node; installed with `--ignore-scripts`; Node native type stripping + `node:test` |
| B | Scene contracts, schema and reducer | passed | `core/scene.ts`, `core/director.ts`, scene/stage/transcript schemas; 10 scene + 35 director tests |
| C | Voice intents and narration manifest | passed | `core/intents.ts` (97 synthetic transcripts), `core/narration.ts`; all audio `missing` |
| D | Timeline and projection math | passed | `core/timeline.ts`, `core/projection.ts`, `core/tracking.ts`; synthetic poses only |
| E | Mocked desktop broker and recovery (Rust) | passed | `broker/` integrated from the worktree in two rounds; 62/62 tests; fmt and clippy clean; IPC aligned to the schema by the main session |
| F | Asset inventory, Weave checklist and research | passed | `fixtures/assets/inventory.json`, `docs/design/weave-jobs.json` (26 jobs, none run), `docs/research/SOURCE_CHECKS.md`; six JPGs inspected by main session |
| G | Integration, verification, Windows smoke handoff and report | passed | At the checkpoint: 95/95 TS + 62/62 Rust. After consolidation: 103/103 TS + 69/69 Rust. Independent review reconciled; `WINDOWS_SMOKE.md` (all steps not run) |

## Consolidation (owner instruction, 2026-10-03)

| Step | Status | Notes |
| --- | --- | --- |
| Checkpoint commit and push to `week4` | passed | `1206a22` pushed (fast-forward from `da6eba5`); no `main` write, PR or force push |
| Wallpaper wording (per-monitor image, global settings) | passed | `planning.md` §6.4 corrected; existing broker tests cover the globals |
| Staging order (B entry, D wallpaper under veil) | passed | New director tests: order, Esc before D, skip ordering, wallpaper declined |
| Parking: no resizing by default; reject unsafe fit | passed | `ParkingPolicy::RejectIfResizeNeeded`; 7 tests in `broker/tests/consolidation.rs` |
| Torn final journal record | passed (fail closed) | Fault-injection test; `broker/DURABLE_JOURNAL_REQUIREMENT.md`; native staging disabled until met |
| Voice routing (quoted/mentioned cancel) | passed | 6 new fixtures (97 total) |
| Nine proposed voice lines | recorded, unreviewed | Text and triggers in `CLOUD_REPORT.md` §6; audio missing |
| Low review items L1–L9 | reconciled | `CLOUD_REPORT.md` §7: fixed L3, L6, L7, L9; retained with rationale L1, L4, L5; blocked L2, L8 |
| Final checks | passed | TypeScript 103/103; Rust 69/69; fmt (after one formatting fix), clippy and setup tests (15/15) clean |
| Second commit and push to `week4` | see the hand-back message for the SHA | |

## Still not authorized or not done

Weave generation without per-run cost approval; paid STT/TTS or other provider calls; camera or microphone access; real wallpaper or window effects; native staging before the durable-journal requirement; any `main` write or PR; owner acceptance. Every Windows smoke step is not run. The owner has authorized Weave-led visual work as the **next** session's task. Its entry point is `CLOUD_REPORT.md` §0.

## Visual-gated session (2026-10-03, second Cloud task)

Report: [VISUAL_CLOUD_REPORT.md](VISUAL_CLOUD_REPORT.md). Mode `visual-gated`, provider mode `mock`.

| Step | Status | Notes |
| --- | --- | --- |
| Baseline fast-forward `da6eba5` → `2e640b5` | passed | Remote `week4` held the W4-1 commits |
| Setup and checks | passed | TS 103/103; Rust 69/69; fmt and clippy clean; setup tests 15/15 |
| Weave discovery (read-only) | passed | Figma MCP authenticated; no workflows listed; direct-model route via Nano Banana 2 |
| S1 quote and run | passed | 9 credits, owner-approved, prediction `ff83853e-…`, submitted once |
| S1 inspection and packet | passed | [w4-20261003-paris-p1-s1](docs/design/revisions/w4-20261003-paris-p1-s1/REVIEW.md); provisional framing, owner review pending |
| S2a–d depth variants | passed | 4 × 9 credits, each owner-approved; S2d provisional environment base; walker depth unresolved by edits |
| S3a–c Week 3 aesthetic | passed | Owner asked for Week 3's emotional aesthetics; 3 × 9 credits, each approved; S3c provisional direction |
| Rest of P1 (C1–C6, A1–A3, V1–V4) | blocked | Needs the owner's direction decision and per-run approvals (ceiling ~500; 63 used) |
| UI/renderer passes A–D | blocked | No complete inspected packet |
