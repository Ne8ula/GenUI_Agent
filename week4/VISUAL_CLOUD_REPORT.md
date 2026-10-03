# Week 4 visual Cloud report (in progress)

Session date: 2026-10-03 (UTC). Mode: **visual-gated**, provider mode **mock**. This report is updated as the session proceeds. **Nothing here accepts a phase, a visual revision or Week 4.**

## 1. Baseline

| Item | Actual |
| --- | --- |
| Container checkout at start | `da6eba5` (planning snapshot), clean and behind `origin/week4` |
| Remote `week4` after fetch | `2e640b5` "Week 4 consolidation…", parent `1206a22` "W4-1 non-visual foundations checkpoint" |
| Action | Fast-forward to `2e640b5`. No local changes existed |
| Setup | `EVA_CLOUD_FETCH_RUST_DEPS=1 bash week4/scripts/cloud-setup.sh` (script inspected first: locked `npm ci --ignore-scripts`, `cargo fetch --locked`) |
| `npm run check` (week4) | Typecheck clean; **103/103** tests pass |
| `cargo test` (week4) | **69/69**: lib 8, boundary 2, consent 10, consolidation 7, journal 4, recovery 5, review_fixes 10, scope 5, wallpaper 6, windows 12 |
| `cargo fmt --check`, `cargo clippy --all-targets -D warnings` | Clean |
| `node --test scripts/test-cloud-setup.mjs` | 15/15 |

The 95 TS / 62 Rust numbers in the earlier hand-back were from checkpoint `1206a22`. The consolidation commit raised them to 103/69, and this session reran and observed those counts.

## 2. Models and routes

| Role | Actual |
| --- | --- |
| Main session (coordination, Weave discovery, inspection, art-direction review) | Cloud's selected Claude model. The session metadata's configured, current and last-served model fields were checked and match the owner's requested model. The platform withholds model identifiers from repository artifacts; see the Cloud session record |
| Project `eva-*` GPT routes | Unavailable in Cloud (no Model Gateway); not invoked |
| Ruflo `claude-flow` MCP | Failed to connect; not used |
| Figma MCP | Connected. `whoami` returned the owner's handle and two plans. `weave_list_tools` returned an empty list. `weave_find_model` resolved Nano Banana 2 and Flux candidates; "imagen 4" was unresolved |

## 3. Weave jobs

| Job | Route / model | Run ID | Quote | Approval | Result |
| --- | --- | --- | --- | --- | --- |
| S1 master | direct-model, `fal-ai/nano-banana-2/edit`, text-only, 16:9, 2K, 1 output | `ff83853e-952e-428f-a283-edc58ff2ee90` | 9 credits | Owner, structured Approve | Completed once, 2752×1536 PNG, inspected |

Packet: [revisions/w4-20261003-paris-p1-s1/REVIEW.md](docs/design/revisions/w4-20261003-paris-p1-s1/REVIEW.md). No other job has been quoted or run.

## 4. Status

- **Implemented:** none (visual). Baseline verification only.
- **Blocked:** all UI and renderer passes (A–D), until the P1 images and video studies exist and have been inspected. Pass C needs P2; pass D needs P3.
- **Mocked:** desktop broker and voice, unchanged from W4-1.
- **Not run:** Windows smoke, live STT/TTS, real OS effects, performance.

## 5. Pending owner decisions

1. Keep the S1 framing as the registration base, or revise first (see REVIEW "Proposed next jobs").
2. A finite credit ceiling for the rest of P1, with each run still quoted and approved individually.
