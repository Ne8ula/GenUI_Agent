# Week 4 visual implementation progress

Task: [VSCODE_PROMPT.md](VSCODE_PROMPT.md) (the eight owner-gated steps). Owner decisions per step: [docs/design/acceptance/w4-visual-steps.md](docs/design/acceptance/w4-visual-steps.md). Design index: [docs/design/INDEX.md](docs/design/INDEX.md). **Nothing in this file accepts a step, Week 4 or any phase.**

Status keys: **implemented**, **mocked**, **simulated**, **blocked**, **failed**, **not run**, **pending owner**.

## Session 2026-10-07 (Cloud): pre-step checks and step 1

### Pre-step facts

| Item | Actual |
| --- | --- |
| Checkout at start | `e7d1424507045b4e4504d10ea54844335272b7eb`, branch `week4`, clean, tracking `origin/week4` |
| Environment | Linux container (Ubuntu, kernel 6.18), Node v22.22.0, npm 10.9.4, cargo/rustc 1.97.0, Playwright 1.56.1 (workspace) / Chromium 141.0.7390.37 at `/opt/pw-browsers`, ffmpeg 6.1.1, ImageMagick, Python 3.13 + Pillow 12.3 |
| Baseline `npm --prefix week4 ci --ignore-scripts` + `npm --prefix week4 run check` | TS typecheck clean; **103/103** tests pass (matches the recorded baseline) |
| Baseline `cargo test --manifest-path week4/Cargo.toml` | **69/69** (lib 8, boundary 2, consent 10, consolidation 7, journal 4, recovery 5, review_fixes 10, scope 5, wallpaper 6, windows 12) |
| Weave connection | Figma MCP authenticated from this Cloud session: `whoami` returned the owner's handle and two plans; `weave_list_tools` returned `{"tools":[],"totalCount":0}` (as on 2026-09-28 and 10-03); the direct-model route (`weave_find_model`/`weave_run_model`) is listed. **No generation run, no credits spent**: the converge packet covers steps 1–6 per the owner's task |
| `/agents` (native routes) | `eva-ui-designer` (alias `sonnet`) routed; probe self-reported `claude-sonnet-5-5`. `eva-implementer` (`claude-gpt-5.6-sol[1m]`) **failed**: API `model_not_found` (HTTP 404) — no Model Gateway in Cloud; not transient, not retried. `eva-mechanical`/`eva-researcher` (Luna/Terra) are the same Gateway route and were not invoked. `eva-reviewer` (alias `opus`) not yet invoked. Ruflo `claude-flow` MCP failed to connect and was not used |
| Main session model | Session metadata: `configured_model: claude-opus-5-5`; `session_context.model` and `last_served_model`: **`claude-fable-5-1`** (`user_switched_model`). The main session is therefore not Opus 5.5; it did no creative authorship beyond the packet (see the step-1 REVIEW for the two creative questions put to the owner) |
| GPU / WebView2 | This container has no GPU (`/dev/dri` absent). Headless Chromium 141 exposes WebGL2 only through **SwiftShader** (ANGLE Vulkan, software). Windows WebView2 is not available here; the real GPU test for step 1 is **blocked** on the owner's workstation (see the REVIEW's investigation) |

### Step 1: renderer foundation and the static arrival frame

Evidence folder: [docs/design/revisions/w4-impl-s1-arrival-frame-20261007](docs/design/revisions/w4-impl-s1-arrival-frame-20261007/REVIEW.md).

| Item | Status | Notes |
| --- | --- | --- |
| `week4/app` Vite + React + TypeScript host over `week4/core` (npm workspace) | implemented | `npm --prefix week4 ci --ignore-scripts` installs both; `npm --prefix week4 run check` runs core tests, app tests and the Vite build |
| `core/validate.ts` browser-safe (static schema imports, TextEncoder) | implemented | Behaviour unchanged; core tests 103/103 |
| Natively authored P1 scene as particle targets (Paris palette sampled from P1) | implemented | ~168,400 particles at density 1 (cap 262,144; density 0.25–1.25); deterministic per seed; region IDs tied to `fixtures/scenes/paris-1980s-terrace.json`; no reference pixels read at runtime |
| Idle life: steam, cigarette smoke, three walkers strolling (fade/respawn loop), reduced-motion variant | implemented | Rewrites only dynamic slots; counts and static particles untouched (tested) |
| WebGL2 point-sprite renderer with Canvas2D fallback (declared stride budget), context-loss handling | implemented | Renderer worker (built-in `general-purpose`, disclosed fallback for the failed Sol route); smoke ok |
| Fixture host: controls outside the picture, status in words, state-only live region, dataset reporting, capture script | implemented | `eva-ui-designer` worker; integrated byte-for-byte, one host change by the main session |
| Captures: PNG 1920×1080 dpr 1 (WebGL2 + Canvas2D, both facings, stills at life 3.0 s paused), 25 s H.264 MP4 + 4 fps frame sheet, focus screenshot, compare sheets, frame-time, life-to-wall ratio | implemented (browser-only) | Numbers in REVIEW §8 (software GL; not GPU/WebView2/Windows evidence). Run 1 (cup-polygon defect) and run 2 (life-to-wall 0.56) are kept as `implementation/superseded-01-cup-defect/` and `superseded-02-life-clamp/` |
| Investigation: why Week 3 uses `--disable-gpu` | implemented (documented) | Week 2 native wgpu/DX12 quarantine inherited as policy; not a WebView2 finding; flag not copied blindly (REVIEW §7) |
| Real Windows WebView2 GPU test | blocked | No Windows/WebView2/GPU here; owner-run probe proposed in REVIEW §7; shell is step 6 |
| Head coupling | not in this step | Step 2 by design |
| Independent review (`eva-reviewer`, read-only; alias `opus`, self-report claude-opus-5-5) | implemented | 1 blocking (cup polygon self-intersecting → fixed, set re-captured), 13 should-fix and 8 notes; every disposition in REVIEW §9.3 |
| Owner decision | **Reject direction** (2026-10-07/08) | Verbatim options chosen: "Reject direction"; "No — keep native authoring (Recommended)"; "Toward (as P1 shows)"; "Do not commit yet". Per protocol: stop, discuss; a new direction needs a fresh Weave packet before any UI edit. Recorded in [the decision record](docs/design/acceptance/w4-visual-steps.md) |

**Tests at the stop:** core 103/103; app 44/44; Rust 69/69; fmt clean; build ✓; render smoke ok; capture run 3 exit 0 with no page errors (software GL: WebGL2 133.2 ms median / 150.0 ms p95 frame interval; Canvas2D stride 3: 200.1 / 233.4 ms; video life-to-wall ratio 1.00). Runs 1–2 superseded and kept.

**Capture locations:** `docs/design/revisions/w4-impl-s1-arrival-frame-20261007/implementation/after/` (captures), `…/implementation/compare/` (sheets), `…/checks.json`.

**Known limitations:** browser-only evidence on software GL; coarser stipple than P1 and faint near objects (REVIEW §8.3, §11); Canvas2D fallback is a stride subset; `obj:awning` fixture anchor predates the shop-awning decision (reconcile at step 2); font licences not yet bundled with a distributable build; no commit or push (not authorized in this session; the stop hook's request to commit was declined for that reason).

**Owner decision received:** *Reject direction* (plus: native authoring only; walker toward; no commit). **Next owner input needed:** what in the direction is rejected (the particle material, the natively authored look, the composition, or the approach itself) and what the intended direction is; then a quote-and-approve Weave run from the owner's workstation produces the fresh packet that any new visual pass requires.

Changed/new files (all under `week4/`): `package.json`, `package-lock.json`, `.gitignore`, `core/validate.ts`, `docs/design/INDEX.md` (one row), `app/**` (new), `docs/design/acceptance/w4-visual-steps.md` (new), `docs/design/revisions/w4-impl-s1-arrival-frame-20261007/**` (new), this file (new). Nothing outside `week4/` changed; Weeks 1–3 untouched.

## Session 2026-10-08 (Cloud): direction C after the rejection

| Item | Status | Notes |
| --- | --- | --- |
| Owner direction | decided | C — coloured wireframe builds, realistic plates fill in; new generated images may be runtime plates (terms note required); Opus 5.5 route authors the art direction; Weave runs here, quoted and approved per run. Recorded verbatim in [the decision record](docs/design/acceptance/w4-visual-steps.md) |
| Art-direction amendment and C-packet prompts | done (proposal) | `eva-reviewer` (alias `opus`; self-report Opus 5.5, transport unverified) authored [DESIGN_PROMPT_C.md](DESIGN_PROMPT_C.md), the [C job list](docs/design/revisions/w4-20261008-paris-c-hybrid/JOBS.md) and [RENDERER_CONTRACT_C.md](RENDERER_CONTRACT_C.md); integrated unchanged apart from headers; see [AUTHORSHIP.md](AUTHORSHIP.md) |
| Weave route discovery | done | Nano Banana 2.1 (`fal-ai/nano-banana-2/edit`, two-image input confirmed) and Kling First & Last Frame; P1's hosted output located as RC1's layout input; discovery estimates are not quotes |
| Alternatives after RC1 | done (proposal) | [ALTERNATIVES.md](docs/design/revisions/w4-20261008-paris-c-hybrid/ALTERNATIVES.md): shared Blackwall-structured construction in Paris colours; three city directions (Lavis, Tagged, Line-light), one first image each (LV1, TG1, LL1), construction stills BW1/BW2, video study VB1; author recommends Tagged; owner choice pending |
| Batch 1 (LV1, TG1, LL1) | done, inspected | 5 credits each, owner-approved in one multi-select prompt; outputs hashed in the packet; inspection in REVIEW.md; shared defect: the far young walker faces the viewer; TG1's woman has a readable face; LL1's residue panes read as towers. **Owner rejected all three** ("reconstruct the images from the ground up using the reference images… + the mp4 video… The newly generated images dont resemble anything from the reference images") |
| Reconstruction batch (BWA, TGA, TSA, CLA) | done, inspected | Words-only prompts from the owner's five references and clip (RECONSTRUCTION.md, main-session authored after the owner stopped the opus run); RC1 geometry input; 5 credits each; BWA and TSA carry the references' structure; inherited RC1 defects noted; owner review pending |
| Round 2 (BWA-2, BTA) | done, inspected | Owner: combine BWA and TSA, more abstract, less Blackwall detail, transparent-to-opaque threads; BWA-2 more abstract with beads, ghosting, ripple; 5 credits each, owner-approved; BWA-2 reads as a beaded light-curtain city, BTA as the combined construction frame (sky went dark; inherited face); owner review pending |
| Round 3 (BWA-3, seeds 11/22/33/44) | done, inspected | Owner: even more abstract, glitch/matrix/dither tiles like Week 3, threads sparser and less structural, one prompt in four variants from BWA-2; 5 credits each, owner-approved; b and d the sparsest and most abstract, c with colour-chip tiles, a closest to BWA-2; owner selection pending |
| Owner selection | decided | Seed 33 (img-13) is the sole aesthetic and style reference; BWA-2 dropped ("disregard BWA-2 now") |
| Motion studies | running | VB1 (seed 33 to BWA-2, 55 credits, submitted seconds before the redirect, uncancellable, superseded) and VB2 (seed 33 only, 55 credits, owner-approved); analysis against the owner clip follows |
| C packet generation | paused after checkpoint 1 | RC1 quoted (5, Minimal and High), owner approved High, run once, retrieved, hashed, compared with P1 and inspected; **owner rejected the realistic look** (2026-10-08). 5 credits used, 3912.8 remaining after submit. Reasons: "Looks like a stock photo; the aesthetic is gone", "Not 1980s Paris enough", "Realistic plates are the wrong idea"; next: alternatives first (opus route) around five owner chat references (colour-tagged pole photo, tile-assembled cloud landscape, ink-and-wash construction sketch, two Cyberpunk 2077 Blackwall captures; "Especially refer to Cyberpunk 2077's blackwall aesthetic and shaders"), kept out of the repository and hashed in provenance. Record: [w4-20261008-paris-c-hybrid](docs/design/revisions/w4-20261008-paris-c-hybrid/REVIEW.md) |
| Asset inventory schema revision for adopted plates | not started | Needed before the first runtime plate is used |
| UI edits | blocked | Until the C packet is inspected and handed to writers |

## Overnight implementation pass (2026-10-08, approvals off per the owner)

Guide: [IMPLEMENTATION_BRIEF.md](docs/design/revisions/w4-20261008-paris-c-hybrid/IMPLEMENTATION_BRIEF.md). References: seed 33 (img-13) and VB2 (vid-02). Shared contracts extended by the main session in `app/src/scene/types.ts`, `store.ts`, `author.ts` (lanes `phase`, `motion`, `birthMs`; `SceneFrame.sky/tiles/build`; `Tile`, `Sky`, `BIRTH_RAMP_MS`).

| Worker | Route (configured) | Owns | Status |
| --- | --- | --- | --- |
| R renderer | built-in general-purpose (disclosed fallback: the `eva-implementer` GPT route returns 404 in Cloud) | `app/src/render/*` (incl. new `patterns.ts`), `app/tests/render-*.test.ts`, `app/scripts/render-smoke.mjs` | done: 11-float pack with phase/motion/birth, birth ramp + shimmer from view.timeMs, ground + sky pass (grain kept when sky is null), instanced tile pass (flat/dither/dotgrid/scanline/transparent) + hairlines, Canvas2D parity; typecheck 0, 21/21 tests, smoke 7/7 pages (software GL); self-report claude-fable-5-1 |
| S scene | built-in general-purpose (same disclosure) | `app/src/scene/seed33.ts`, `app/src/scene/tiles.ts`, `app/src/scene/life.ts` wiring, `app/tests/scene-seed33.test.ts`, `app/tests/tiles.test.ts` | done: 46,788 beads at density 1 (threads, radial table, beaded objects, Bayer dot-grid people, lamps), nearest-first births, shimmer, 22 tiles with swap life (cap 2/s; measured ~1.7/s, to be calmed), reduced motion; typecheck 0, 23/23 tests; self-report claude-fable-5-1. Open: sky should be clipped to the roofline wedge (exports SEED33_SKY_POLYGON) |
| H host and evidence | `eva-ui-designer` (alias sonnet) | `app/src/App.tsx`, `app/src/host/*` (new `scenes.ts`, `tilesFlag.ts`), `app/src/style.css`, `app/index.html`, `app/scripts/capture-s33.mjs`, `app/scripts/compare-s33.py`, `app/tests/host-*.test.ts` | done in its worktree (the harness isolates this agent; main-checkout writes were blocked), copied across by the main session; params look/build/t/tiles, controls outside the picture, status in words, manual-clock capture hook, capture + compare scripts; typecheck 0 in its mirror, 38/38 host tests; self-report claude-sonnet-5-5; capture not yet run |

Writers share the main checkout with disjoint file ownership (the app is uncommitted, so worktrees would not contain it); the main session integrates, runs the full check, captures and records. No commit.

| Integration + run 1 | done | Full check green (core 103/103, app 85/85, build); capture run-1 (stills, reduced, focus, real-time + stepped 30 fps clips, sheets) and compare (luma diff: idle 0.30 mean / 1.6 max vs VB2 3.2 / 6.2). Inspected against seed 33: architecture right, look too faint and thin; round-2 tuning specified in the brief §8 |
| Round 2 (R2 sky wedge; S2 scene tuning) | done, integrated | R2: Sky.polygon clipping via ear-clipped triangle list (WebGL2) and canvas clip (Canvas2D), 25/25 render tests, smoke 9/9; S2: three thread classes + beaded courses, 0.55° table burst (29k beads), dot-filled cup/saucer/ashtray, silhouette woman (growth 1.63× over 8 s), 18 tiles with 2/s then 1/s caps (33 swaps per minute, was 101), lantern glow; 63,250 beads; 23/23 scene tests; both self-report claude-fable-5-1. Full check green after integration (core 103, app 89, build, smoke); capture run-2 in progress | Sky.polygon clipping in both renderers; luminous clustered threads + beaded courses, dense table burst, dot-filled objects, silhouette woman at the clip's pace, 16–18 calmer tiles, glowing lanterns; capture into run-2 after the full check |
| Rust broker tests | pass | `cargo test` 69/69 after integration (broker untouched by this pass) |
| Independent review | launched | `eva-reviewer` (alias opus) read-only pass on the integrated implementation; findings recorded in REVIEW.md when back |
| Run 2 capture + compare | done | Sky wedge, courses, lantern glow, calm tiles confirmed; still dim/grey, table a solid disc, cup transparent, woman dim and absent at +5 s (walk cycle). Luma idle 0.46 / 1.8 vs VB2 3.2 / 6.2 |
| Independent review | done | No blocking breach; findings A–G taken into round 3 (brief §9); notes recorded in REVIEW.md |
| Round 3 (S3 scene fixes + luminosity tuning; H3 host clock/toggle/seed/compare fixes; R3 renderer caching + hairline clip) | done, integrated | S3: woman intro phased to the build (visible at 12/17/20 s), home-relative tile nudges, zero-build births at −400 ms, in-place `setReducedMotion` + tile hold, halos, warm tones, 0.9° table, dense cup/saucer, glass ashtray, new walker silhouettes, fewer courses; 66,414 beads (12,270 halos); 28/28 scene tests. H3 (worktree, copied by the main session): no rebuild on the reduced toggle, clocks survive a backend switch, seed default per look (33/7), fidelity-gap reading in compare, per-look canvas label; 59/59 host tests. R3: cached sky triangulation and tile packing, hairlines clipped to the frame, 26/26, smoke 11/11. Self-reports: S3/R3 claude-fable-5-1, H3 claude-sonnet-5-5. Full check green after integration (core 103, app 116, build, smoke); capture run-3 in progress |
| Run 3 capture + compare | done | Woman visible at every still; warm objects; lantern glow; sky wedge; luma idle 0.28 / 1.34 vs VB2 3.18 / 6.2 (ratio 0.09: calm, fidelity gap). Remaining: blocky figure, dim glow, thin rim, courses |
| Round 4 (S4: figure, glow, table rim, courses) | done, integrated | Continuous organic walker silhouettes (no neck stalk, flared coat, hair bob), full dot grid with body light; halos ×4 at 0.16–0.22 plus thread halos; outer ray set and 4.2 px rim; porcelain pitch 2.6 px alpha 1; lintel courses removed; 82,793 beads at density 1 (97,382 at 1.25, 37 % of capacity); 31/31 scene tests; self-report claude-fable-5-1. Full check green (core 103, app 119, build, smoke); capture run-4 in progress |
| Run 4 capture + compare | done | Continuous luminous figure, glowing porcelain, rim burst, sky wedge; luma idle 0.28 / 1.34 vs VB2 3.18 / 6.2 (fidelity gap). Remaining: softer figure than the reference's crisp dot-matrix, sparser threads, less luminance, calmer idle. Overnight pass closed; owner decision pending |
