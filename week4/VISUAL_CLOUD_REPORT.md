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
| S2a oblique | same model, edit of S1 | `a084a81d-bb01-4eb5-af2f-65398a5aef75` | 9 | Owner | Completed, inspected; not selected |
| S2b receding | same model, edit of S1 | `2e6899ad-feea-4719-8135-651d0ff5f875` | 9 | Owner | Completed, inspected; not selected |
| S2c layered | same model, edit of S1. The first quote call was blocked by the session's permission check (no spend); the owner asked for a retry | `64035bab-b53b-4204-8490-b3c28d1f71c9` | 9 | Owner | Completed, inspected; not selected |
| S2d combined | same model, edit of S2c with S2b as a reference | `f41cdb9c-65c4-4bd9-9af0-4362c2a2fe46` | 9 | Owner | Completed, inspected; composition liked by the owner, but the aesthetic was judged generic; now the layout reference |
| S3a arrived ink | edit of S2d, with Week 3 ink board and joy ink as style inputs | `f4adad0e-c6cf-4c8c-b78e-dc3ff35c337b` | 9 | Owner | Completed, inspected; outlines kept; not selected |
| S3b remembered ink | same inputs | `c3b2a13c-11bd-43a9-ab7d-d1e8cb489c13` | 9 | Owner | Completed, inspected; not selected |
| S3c particle memory | new image; Week 3 references primary, S2d as loose layout | `31d01533-3f3b-4869-b87f-1fcfd5ffbc69` | 9 | Owner | Completed, inspected; aesthetic direction found |
| S3d refined | edit of S3c | `6eab4405-ee75-43d9-8a72-48ef784baf99` | 9 | Owner | Completed, inspected; **provisional P1 master** |
| C2 survey | edit of S3d; owner's construction references described in text | `806933aa-46ec-49cc-a442-f350d5ec9fc7` | 9 | Owner | Completed, inspected; provisional keyframe |
| C3 massing | edit of S3d | `ef3f14a8-90de-4fca-9adc-76313474a773` | 9 | Owner | Completed, inspected; provisional keyframe |
| C4 nearly arrived | edit of S3d | `4e8c628b-3385-49cf-852c-a041a53b82db` | 9 | Owner | Completed, inspected; provisional keyframe |
| T1 awning underside | edit of S3d, after owner feedback that the scallops read as spheres | `1cf75875-f25e-4f45-a6c0-b20859047c6a` | 9 | Owner (chosen over T2/T3) | Completed, inspected; canopy too large; not selected |
| H1 no hem | edit of T1 | `749be315-e37b-4fbb-8f71-899aa31cf0e9` | 9 | Owner | Completed, inspected; **provisional arrival master** |
| G1 wireframe + glitch | T1 plus Week 3 glitch strip | `0b67896c-e655-4c68-bdf1-ef444e0e57b4` | 9 | Owner | Completed, inspected; provisional keyframe |
| G2 tiles materialising | same inputs | `fbaf84fd-0d64-4d24-b815-7a117b36e61b` | 9 | Owner | Completed, inspected; provisional keyframe (flat red canopy not adopted) |
| G3 settling | same inputs | `4785db01-4e48-4dd6-aa6a-853caaf1086f` | 9 | Owner | Completed, inspected; provisional keyframe |
| V1 G1→G2 video | Kling First & Last Frame, O1 Pro, 5 s | `64661ac0-feb5-4766-a538-7da732b1c153` | 55 | Owner | Completed; inspected via 4 fps samples and per-frame luma difference; provisional motion reference |
| V2 G2→G3 video | same | `9625c40c-5f18-488b-9a8b-8107380b11b0` | 55 | Owner | Completed; inspected likewise; provisional motion reference |
| V3 G1→H1 full-process video | Kling First & Last Frame, O1 Pro, 10 s (Kling 3.0 15 s quoted at 185/246, not run) | `279cb077-1151-4daf-a4af-4dd99b2bec1b` | 109 | Owner | Completed; whole process visible; overlay-box density not met; recommend a native box layer |
| R1 Paris recolour | edit of H1 | `950e5e30-0410-42e9-b9ca-d0f7aa64630a` | 9 | Owner | Completed, inspected; **provisional arrival master** |
| K1 early glitch-in | edit of H1 | `bc9713de-0c76-4a87-9ba7-541c336ccb5c` | 9 | Owner | Completed, inspected; glitch grammar reference, style drift |
| K2 two-thirds glitch-in | edit of H1 | `7980aa3e-266e-4328-acce-55acf55c5f06` | 9 | Owner | Completed, inspected; **owner-chosen look (painterly, shop awning)** |
| V4 K1→K2 glitch-in video | Kling First & Last Frame, O1 Pro, 10 s | `1eef5b9f-4c5e-44d6-ae22-790a4710f06d` | 109 | Owner (K1→R1 version superseded, not run) | Completed; strips later rejected by the owner (particles converging instead) |
| P1 settled painterly | edit of K2 | `cf5f9adf-8d07-4761-8e7e-c1537d16d6ae` | 9 | Owner (beyond ~500, acknowledged) | Completed, inspected; **provisional arrival master** |
| A0 particles converging | edit of K2 | `44be3fb4-80b9-4908-b692-91887900d3c7` | 9 | Owner (beyond ~500, acknowledged) | Completed, inspected; provisional convergence keyframe |
| E0 early converging | edit of A0 | `0ed6f1b8-27f1-4a89-bed0-542f657b5e93` | 9 | Owner | Completed, inspected; provisional start frame |
| V5 E0→P1 convergence video | Kling First & Last Frame, O1 Pro, 10 s | `fff3bbc2-fd52-4ced-9b44-df575c156ade` | 109 | Owner (after top-up) | Completed; particles converge (near field), overlays as accents, no strips; far field paints in as a wash |

Packets: [p1-converge (E0, A0, P1, V5)](docs/design/revisions/w4-20261005-paris-p1-converge/REVIEW.md), [p1-glitch-paris (R1, K1, K2, V4)](docs/design/revisions/w4-20261005-paris-p1-glitch-paris/REVIEW.md), [p1-s1 (S1, S2a–d)](docs/design/revisions/w4-20261003-paris-p1-s1/REVIEW.md) and [p1-s3-week3-ink (S3a–d, C2–C4, T1, H1, G1–G3, V1–V3)](docs/design/revisions/w4-20261003-paris-p1-s3-week3-ink/REVIEW.md). Credit ledger: S1 was approved separately (9). Under the owner's ~500-credit P1 ceiling, **635 are used** (S2a–d, S3a–d, C2–C4, T1, H1, G1–G3, V1–V5, R1, K1, K2, P1, A0, E0), past the ~500 allowance with owner acknowledgement. The owner topped up workspace credits on 2026-10-05; the balance after the last submit is 3917.8. No new standing budget has been set; each run is still quoted and approved. Video route discovered read-only: Kling First & Last Frame (O1 Pro: 5 s quoted at 55, 10 s at 109; neither run, because the owner redirected to the awning first).) V1 and V2 then ran at 5 s, 55 each. No other job has been quoted or run.

## 4. Status

- **Implemented:** none (visual). Baseline verification only.
- **Blocked:** all UI and renderer passes (A–D), until the P1 images and video studies exist and have been inspected. Pass C needs P2; pass D needs P3.
- **Mocked:** desktop broker and voice, unchanged from W4-1.
- **Not run:** Windows smoke, live STT/TTS, real OS effects, performance.

## 5. Pending owner decisions

1. Owner (2026-10-05): no strips; particles converging with box and glitch overlays as accents. Review E0 → A0 → P1 and V5; accept or redirect this packet as the reference for the renderer pass.
2. Set a budget for any remaining P1 references (walker, steam and smoke studies, layer sheets). The ~500 allowance is exceeded (635), and each run is still quoted and approved.
3. Approve starting the native renderer pass (particle convergence plus sparse overlay accents) against the converge packet, or continue references first.

Direction history (owner, 2026-10-03 to 10-05): S2d composition liked but generic, then Week 3 emotional aesthetics, then construction references, the awning simplified (hem removed, then a shop awning), glitch boxes like the Week 3 animal reference, a Paris palette, and a painterly finish.

## 6. Hand-off to VS Code (2026-10-07)

At the owner's request, [VSCODE_PROMPT.md](VSCODE_PROMPT.md) is the task prompt for implementing the selected design in a local VS Code Claude Code session. It defines eight owner-gated steps:
1. renderer and the arrival frame;
2. off-axis depth;
3. particle convergence;
4. overlay accents;
5. the full minute;
6. the native Windows build;
7. desktop choreography (needs a fresh P2 packet);
8. follow-ups (needs a fresh P3 packet).

Each step requires real screenshots, video and a reference comparison, then an explicit owner decision recorded in `week4/docs/design/acceptance/w4-visual-steps.md` before the next step starts. No implementation was started in this Cloud session.
