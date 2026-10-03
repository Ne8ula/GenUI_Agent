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
| C | Voice intents and narration manifest | passed | `core/intents.ts` (91 synthetic transcripts), `core/narration.ts`; all audio `missing` |
| D | Timeline and projection math | passed | `core/timeline.ts`, `core/projection.ts`, `core/tracking.ts`; synthetic poses only |
| E | Mocked desktop broker and recovery (Rust) | passed | `broker/` integrated from the worktree in two rounds; 62/62 tests; fmt and clippy clean; IPC aligned to the schema by the main session |
| F | Asset inventory, Weave checklist and research | passed | `fixtures/assets/inventory.json`, `docs/design/weave-jobs.json` (26 jobs, none run), `docs/research/SOURCE_CHECKS.md`; six JPGs inspected by main session |
| G | Integration, verification, Windows smoke handoff and report | passed | 95/95 TS + 62/62 Rust after the review fixes; independent review done (H1 and M1–M4 fixed); `WINDOWS_SMOKE.md` (all steps not run); `CLOUD_REPORT.md` final |

## Not authorized and therefore not done

UI, rendering or visual blockout; Weave generation; paid STT/TTS or other provider calls; camera or microphone access; real wallpaper or window effects; commit, push or PR; any change outside `week4/`.

## Session end

Backlog A–G is complete within the non-visual scope. No commit or push was made; the platform stop hook's requests were declined under the owner's explicit instruction. See [CLOUD_REPORT.md](CLOUD_REPORT.md).
