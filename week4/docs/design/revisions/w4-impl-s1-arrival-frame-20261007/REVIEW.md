# w4-impl-s1-arrival-frame-20261007: step 1, renderer foundation and the static arrival frame

**Status: owner decision recorded — "Reject direction" (2026-10-07/08; see the [decision record](../../acceptance/w4-visual-steps.md)). Work on this direction stopped; a new direction needs a fresh Weave packet. The owner also decided: no P1 pixels as runtime data; near walker facing "Toward (as P1 shows)"; do not commit yet.** The candidate below is kept as the record of what was built and judged. Browser-only evidence from a Linux container with software WebGL2 (SwiftShader); no Windows, WebView2, GPU, camera or voice result is claimed. Nothing here accepts step 1, Week 4 or any phase.

Source revision: `e7d1424` (branch `week4`) plus this session's uncommitted working tree; the exact bytes are bound by the sha256 manifest and root hash in [checks.json](checks.json) (`sourceRevision.manifestRootSha256`), which the acceptance record cites. Accepted baseline: none. Reference packet: [w4-20261005-paris-p1-converge](../w4-20261005-paris-p1-converge/REVIEW.md) (owner-selected for steps 1–6; no new generation, no credits spent).

## 1. What to look at (owner checklist)

1. **[compare/compare-full.png](implementation/compare/compare-full.png)** — P1 (img-01) beside the WebGL2 arrival frame at the same height. Judge palette, composition and calm.
2. **[compare/compare-details.png](implementation/compare/compare-details.png)** — matching crops: cup and saucer, ashtray and cigarette, the woman, chair and table edge, awning and left façade, lamp/mansard/walkers, right façade. Judge the painterly particle material.
3. **[after/webgl2-idle-25s.mp4](implementation/after/webgl2-idle-25s.mp4)** (H.264, 30 fps) and its [4 fps frame sheet](implementation/after/webgl2-idle-frames-4fps.png) — steam and smoke rising, three walkers strolling slowly, the woman receding and respawning. Note: recorded at the software-GL frame rate (§8.2), so motion is stepped here; the pacing is real (life-to-wall ratio 1.00), the smoothness is not what this capture can show.
4. **Near-walker facing:** [away](implementation/after/webgl2-arrival-facing-away.png) (the brief's preference, default) versus [toward](implementation/after/webgl2-arrival-facing-toward.png) (as in P1). Decision needed (§10).
5. **Canvas2D fallback:** [away](implementation/after/canvas2d-arrival-facing-away.png) — a labelled stride subset (about a third of the particles). Is it acceptable *as a fallback*?
6. **Fixture bar and keyboard focus:** [fixture-controls-focus.png](implementation/after/fixture-controls-focus.png) — controls below the picture, first Tab on "Backend" with a visible ring, status in words.
7. Answer the two owner questions in §10 and give one of: **Approve this step / Request changes / Reject direction**.

## 2. Reference packet: owner designation and writer inspections

**Owner instruction (verbatim, this session's task, 2026-10-07):** "The selected packet: `week4/docs/design/revisions/w4-20261005-paris-p1-converge/`. Read REVIEW.md and provenance.json, then open and inspect every image and video yourself" and "**Weave gate:** the converge packet covers the P1 arrival visuals, which are steps 1–6. Steps 7 and 8 need fresh packets (P2 desktop, P3 follow-ups) before any UI edit. Any owner-requested redesign that departs from the packet also needs a fresh packet." That designation lifts the packet's own "UI blocked pending owner acceptance" note for steps 1–6 (a dated note now sits in the packet's REVIEW; `provenance.json.writerInspections` records the three writers below). The owner's acceptance of the packet as a packet, and of this step, remain pending.

**Main session** (before any edit): all four selected assets were opened and viewed, plus my own 2 fps extraction of V5 (20 frames) to check the settled idle:

- **P1 (img-01, 2752×1536):** warm cream paper; left façade lit cream with sage louvred shutters and iron balconies, a terracotta retractable shop awning (no scallops, no hem), a woman in a belted camel trench walking *toward* the viewer at x≈0.37, two far walkers (one a ghosted pair), a dark iron lamp post at x≈0.57 with a second lamp farther back, a zinc mansard block closing the street at x 0.46–0.61, the right façade in shade with tall sage shutters, iron balconies and a string course; foreground: white marble table (far edge y≈0.77 at centre), espresso cup and saucer at (0.70, 0.84), glass ashtray with an unbranded cigarette at (0.33, 0.89), honey rattan chair hoop with a diamond lattice cut by the left edge. Material: pointillist stipple shading over soft edges; thin sepia outlines; scattered stray teal/coral dots (a known deviation, not copied).
- **A0 (img-02):** the same composition with sand-coloured specks streaming in curved trails; hairline rectangles (some X-crossed) and two glitch boxes — step 3/4 material, used here only to confirm the speck grain and colours.
- **E0 (img-03):** mostly paper and pencil wireframe; only cup, saucer, table and ashtray condensed — step 3 material.
- **V5 (10.08 s, 24 fps):** 0–2.3 s streams, 2.3–3.3 s the woman condenses, 3.3–6 s colour arrives as a wash, **6–10 s settled and calm: the walkers stroll, steam rises from the cup and smoke from the cigarette.** That settled segment is step 1's motion reference.

**Host worker** (`eva-ui-designer`, before its edits; from its hand-back): "P1 is a calm, warm-cream paper picture: pale limestone façades with sage shutters and iron balconies, and one terracotta awning as the only strong red. The woman in a camel trench … A marble table with a white cup, a glass ashtray with smoke and a cut rattan chair sit in the foreground. Hairline pencil edges and fine stipple shading; a few stray teal and coral dots. A0 shows sand-coloured specks streaming in curved trails … About ten hairline rectangles, several X-crossed … E0 is mostly paper and pencil wireframe … The 30-frame sheet (3 fps) goes: 0–2.3 s specks, boxes and a building chair … 6–10 s is settled, with steam and smoke. Overall it is quiet and desaturated, with no strips, no HUD and no readable text." (It read the woman as seen from behind; P1 actually shows her walking toward the viewer — see §10.)

**Renderer worker** (built-in `general-purpose`, before its edits; from its hand-back): "P1: calm painterly street on warm cream/ivory paper with a faint fibrous mottle; shading is pointillist stipple (cup, saucer, lamp post and coat are built from dense fine dots), edges are soft … A0: sand/sepia specks stream in curving trails … hundreds of small round dots of varied size with soft edges that accumulate into tone where dense … E0: mostly paper and pencil wireframe … V5 frames: … 6–10 s settled. No strips, no flashes; far field paints in as a wash. Renderer take-away: warm paper with a very subtle grain, small soft discs with premultiplied over blending so dense speck clouds build tone like stipple."


## 3. What was built

All new code lives under `week4/app/` (an npm workspace of `week4/`); `week4/core` is reused unchanged except for one browser-safety refactor.

| Area | Files | Notes |
| --- | --- | --- |
| Workspace | `week4/package.json`, `package-lock.json`, `.gitignore`, `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html` | Vite 7.3.7, React 19.3, TypeScript 5.9.3, Playwright 1.56.1 (dev), `@fontsource` IBM Plex Sans/Mono and Space Grotesk, `ajv` (core). `npm --prefix week4 run check` = core typecheck + 103 tests, app typecheck + tests + `vite build` |
| Core | `week4/core/validate.ts` | Schemas imported statically (`with { type: 'json' }`) and `TextEncoder` instead of `node:fs`/`Buffer`, so the director, timeline, reducer and schema validation run unchanged in the browser. Behaviour identical; 103/103 |
| Scene contracts | `app/src/scene/types.ts`, `store.ts`, `rng.ts` | Structure-of-arrays particle store (x, y, z, r, g, b, a, size, region); slot index is identity and never moves; `RegionSpec` carries the stable scene ID, band, depth and `[start, end)` |
| Authoring | `app/src/scene/palette.ts`, `author.ts`, `arrival.ts` | Paris palette tokens sampled from P1 (§5); jittered-grid fills, strokes and ink outlines; the measured P1 composition (§4) written far → near. ~168,400 particles at density 1 (cap 262,144; density clamped 0.25–1.25). Deterministic per seed |
| Idle life | `app/src/scene/life.ts` | Steam (170 slots) and smoke (240 slots) threads; three walkers rigged from their authored particles (limb tags, normalised offsets): slow stroll along the lane toward the vanishing point with gait swing and bob, perspective scale from foot height, fade-out/respawn loop; reduced motion = slower drift, smaller amplitudes. Rewrites only dynamic slots; counts and static particles untouched |
| Renderer | `app/src/render/create.ts`, `webgl2.ts`, `canvas2d.ts`, `pack.ts`, `paper.ts`, `dev.ts`, `app/render-dev.html` | WebGL2 point sprites (one interleaved dynamic VBO, soft discs with ≤15 % hashed squash, premultiplied "over" blending, paper clear + deterministic ±2 % grain), context-loss handling; Canvas2D fallback with the same paper/grain and a declared stride budget above 80,000 particles; `'auto'` falls back only when `getContext('webgl2')` is null |
| Host | `app/src/App.tsx`, `main.tsx`, `style.css`, `src/host/*` | Stage above a fixture bar in document flow (never over the picture); Backend / Pause / Reduced motion / Near walker facing / Density / Seed controls as real form elements with labels and visible focus rings; status in words (IBM Plex Mono); a visually hidden live region announces only backend/degraded/unavailable; URL params whitelisted and clamped; `?fixture` dataset reporting; `?capture=1` hides the bar |
| Evidence tooling | `app/scripts/capture-s1.mjs`, `browser-options.mjs`, `render-smoke.mjs`, `compare-sheet.py` | Playwright captures (refuses to overwrite evidence), ffmpeg transcode and frame sheet, Pillow compare sheets |
| Tests | `app/tests/*.test.ts` | 40 (`store` 3, `scene-arrival` 5, `life` 4, `host-params` 9, `host-stats` 10, `render-pack` 9) |

**Decision recorded:** the renderer is raw WebGL2 point sprites rather than the Three.js/WebGL2 recommendation in planning §6.1 (a recommendation, not a decision): a single dependency-free program keeps the renderer reviewable, matches the project's "data only" boundary, and the head-coupled projection already exists in `week4/core/projection.ts` as plain matrices. Three.js can be revisited at step 2 if depth layering needs it.

**Not built, by design:** head coupling (step 2), convergence and wireframe (step 3), overlays (step 4), the eye and the A–G director integration, Esc/S shortcuts, audio (step 5), the Tauri shell (step 6). The desktop broker stays the mock.

**Runtime assets:** none adopted. The scene is authored natively; no reference pixels are read at runtime (§10 question 1). `fixtures/assets/inventory.json` is unchanged (all 51 assets still `missing`).

## 4. Composition: measured from P1, implemented natively

Frame coordinates (x 0..1 across, y 0..1 down) read from P1 on a 10 %/2 % grid; the implementation uses these values directly (`app/src/scene/arrival.ts`).

| Element | P1 measurement | Implemented |
| --- | --- | --- |
| Horizon / vanishing | street converges near (0.50, 0.53–0.55) | `HORIZON_Y = 0.545`; lanes and façade bases converge there |
| Left façade base | (0.2, 0.70) → (0.4, 0.60) | line (0.0, 0.795) → (0.46, 0.565); plinth band 0.035 above |
| Left façade top edge | exits the top at x≈0.395, meets the mansard at (0.46, 0.33) | same |
| Near-left window | glass x 0.047–0.10, y 0.13–0.60; right shutter 0.105–0.138, y 0.15–0.63 | same, with balcony rail 0.05–0.10 × 0.53–0.60 |
| Second left window | shutters 0.178–0.205 / 0.258–0.287, glass 0.205–0.255, y 0.26–0.59, balcony y 0.52–0.60 | same |
| Receding left slits | x 0.298–0.322, 0.352–0.368, 0.393–0.405, 0.424–0.432 | same (mostly behind the woman) |
| Shop awning | top edge (0.165, 0.02) → (0.29, 0.052) → (0.364, 0.11) → (0.435, 0.30); hem (0.218, 0.078) → (0.29, 0.17) → (0.364, 0.26) → (0.418, 0.306) | polygon with roller, front bar and two arms; terracotta lit → shaded far end |
| Woman | head top (0.366, 0.355), shoulders y 0.42 (0.33–0.41), belt y 0.50, hem y 0.655, feet y 0.745 | feet (0.366, 0.745), height 0.39; coat, belt, legs, boots; facing parameter |
| Far walkers | man with folder at x 0.527, feet 0.615; ghost pair at x 0.46–0.50 | man (0.528, 0.616) h 0.205 with folder; **one** third walker (0.476, 0.606) h 0.19 |
| Near lamp | base (0.5755, 0.625), shaft to y 0.30, lantern 0.21–0.30, finial 0.165 | same proportions (`lampBody`) |
| Far lamp | base (0.5445, 0.452), lantern 0.31–0.35 | same at 0.4 scale |
| Mansard block | walls x 0.458–0.61, y 0.305–0.50; roof ridge y 0.225; chimneys at 0.49, 0.54; three dormers; two window rows | same |
| Right façade | string course (0.585, 0.29) → (1.0, 0.19); base (0.585, 0.555) → (1.0, 0.725); windows: glass 0.784–0.831 (y 0.33–0.57), 0.882–0.918 (y 0.30–0.60), 0.992–1.0; shutters 0.762–0.784, 0.831–0.853, 0.853–0.882, 0.918–0.951, 0.957–0.992; five receding slits per floor; balcony at 0.79–0.832 × 0.04–0.10 | same |
| Table | far edge y≈0.765 at centre, 0.86 at x 0.1 | ellipse centre (0.5, 1.04), rx 0.53, ry 0.275; rim band and ink |
| Cup and saucer | cup body x 0.644–0.76, rim y 0.753–0.78, base y 0.86; saucer 0.61–0.797 × 0.843–0.94 | rim (0.70, 0.768) rx 0.052; saucer (0.70, 0.89) rx 0.094 ry 0.045; handle on the right |
| Ashtray and cigarette | glass 0.269–0.40 × 0.843–0.943; cigarette from (0.318, 0.906) to (0.405, 0.846) | same; ember at the tip; smoke origin (0.317, 0.902) |
| Chair | hoop top (0.05, 0.495), rightmost (0.218, 0.84), cut by the left edge | rotated ellipse centre (0.11, 0.75), rx 0.09, ry 0.29, −24°; diamond lattice pitch 0.052 |
| Depth per region (for step 2) | — | table z +0.2…−0.3, cup 0, ashtray −0.08, chair −0.12, woman −2.2, near lamp −3.2, awning/left façade −2.5…−12 along x, far walkers −6, far lamp −8, right façade −12…−2.5, mansard −14, sky −40 |

## 5. Palette (sampled from P1 medians at inspected points; Paris only)

paper `#f6f0e6`; limestone lit `#f6e2c8` / shade `#e8dacb` / cool `#d8cbc2`; shutter sage `#b8c1a4` / shade `#8e9a80` / louvre `#5f6b57`; window pane `#8b8c7b`; balcony iron `#5a5c58`; awning `#c78b79` / shade `#8b5449`; zinc `#77777f`; lamp iron `#3a3338` with stipple `#7b6274`; camel `#d6a97e` / shade `#976d54`, hair `#694437`; far walkers `#826871`, `#977e7b`; marble `#f3efeb` with veins `#c6c1bd`; cup white `#f6f1ec` / shade `#c7bcb6`; coffee `#d69f69` / `#8b5a3a`; glass `#c2c3c8`; rattan `#daa671` / lit `#f0d2a6` / shade `#b07a3e`; shadows `#a89aa0`; steam `#b9b2ae`; smoke `#9d968f`. A unit test rejects any particle in the cyan→blue→purple hue band and any token within a short RGB distance of the Week 3 ice/lavender/coral accents.

## 6. Timeline mapping (planning §4 → the packet)

The authored content of planning §4 (red survey lines, watercolour bleed) is replaced by the owner-selected packet; the timing and the staging rules in `week4/core/timeline.ts` are unchanged.

| Planning phases | Time | Visual (packet) | Step |
| --- | --- | --- | --- |
| A–B | 0:00–0:12 | The Week 3 eye hears the request and clears to paper | 5 |
| C | 0:12–0:22 | Wireframe survey, like E0 | 3 |
| D–E | 0:22–0:44 | Convergence, like A0 (far field also from particles) | 3 (+4 overlays) |
| F | 0:44–0:54 | The first walkers, smoke and steam come alive | 3/5 — the idle life built here is F's content |
| G | 0:54–1:00 | Arrival on P1 with the overlays gone | **this frame is G's end state** |

## 7. Investigation: why Week 3 runs WebView2 with `--disable-gpu`

- **Where it came from.** The flag is present in Week 3's very first `tauri.conf.json` (commit `985a948`, 2026-09-28) and was carried through the p2 overlay (`83bb46a`). No Week 3 bug or issue about WebView2 GPU rendering is recorded anywhere in the repository.
- **Why.** It is the Week 2 **"GPU quarantine"**. On 2026-09-24 the owner reported system-wide black screens and freezing during the native Sunny→Rainy transition of the Week 2 E1 build, whose material layer was a native Rust **wgpu / DX12** renderer (`week2/src-tauri/src/weave_gpu.rs`, header: "QUARANTINED: owner reported system-wide graphics failure during a transition"). The cause was never proven; the native path was blocked (`NATIVE_RENDERER_QUARANTINED`), the recovery used Canvas2D with "No WebGL or GPU context requested", and browser checks ran "with the GPU off" (`week2/docs/design/acceptance/e1.md`, `week2/README.md`). Week 3 inherited it as policy: `week3/src/visual/EyeStage.tsx` ("Canvas2D, bounded CPU work (no WebGL/wgpu), per the project's GPU quarantine"), the Week 3 acceptance record ("Windows host requests `--disable-gpu`; no resumption of the archived native wgpu experiment") and `week3/cloud/PROMPT.md` ("A different rendering technique needing a new GPU/native route … requires an explicit proposal and owner authorization first; do not use Cloud hardware as evidence that a quarantined native renderer is safe").
- **Reading.** The quarantine targeted a native wgpu/DX12 layer drawing into its own window. WebView2's own GPU process (ANGLE over D3D11 for WebGL2) is a different code path that was never implicated — but it was also never tested on the demo machine, and the original failure is unexplained. Week 4's plan (§6.1) asks exactly this question before enabling the GPU.
- **Consequence for Week 4.** The flag is **not copied blindly**: the renderer is GPU-capable (WebGL2) with a Canvas2D fallback and an explicit backend switch, and the future Tauri shell (step 6) should keep `--disable-gpu` available as a documented fallback switch rather than a default. **The real WebView2 GPU test is blocked in this environment** (no Windows, no WebView2, no GPU: this container's Chromium 141 exposes WebGL2 only through SwiftShader, ANGLE Vulkan software). It needs the owner's workstation and, given the Week 2 history, should be an explicit, consented test. A first probe the owner can run before any Tauri shell exists, **with other work saved first** (the Week 2 failure was system-wide and unexplained): `npm --prefix week4 run app:dev`, open `http://127.0.0.1:1440/?fixture` in Microsoft Edge (same Chromium engine family as WebView2) and read the status line's renderer string — a non-SwiftShader string (e.g. ANGLE D3D11 naming the RTX) plus smooth frame times is the first evidence. The default backend is `auto` (WebGL2, `powerPreference: 'high-performance'`); `?backend=canvas2d` is the no-GPU escape. The WebView2 shell itself is tested in step 6.

## 8. Captures and comparison

Environment: Linux container, headless Chromium 141.0.7390.37 via Playwright 1.56.1, viewport 1920×1080 at device scale factor 1, software WebGL2 (ANGLE/SwiftShader). **Browser evidence only; not native, not GPU, no camera, no pose.** Full machine-readable record: [checks.json](checks.json).

### 8.1 Files (all under `implementation/`)

| Capture | File | Facts |
| --- | --- | --- |
| Arrival frame, WebGL2, facing **away** (default) | [after/webgl2-arrival-facing-away.png](implementation/after/webgl2-arrival-facing-away.png) | 1920×1080, dpr 1, seed 7, density 1, idle life advanced to 3.0 s and paused (reproducible); 168,910 particles drawn; renderer string `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) …)), SwiftShader driver` |
| Arrival frame, WebGL2, facing **toward** | [after/webgl2-arrival-facing-toward.png](implementation/after/webgl2-arrival-facing-toward.png) | same settings; 169,329 particles drawn |
| Arrival frame, Canvas2D fallback, away / toward | [away](implementation/after/canvas2d-arrival-facing-away.png), [toward](implementation/after/canvas2d-arrival-facing-toward.png) | detail `Canvas2D · stride 3`; 56,302 / 56,444 particles drawn (declared subset); life 3.0 s paused |
| Idle video, WebGL2, facing away | [after/webgl2-idle-25s.mp4](implementation/after/webgl2-idle-25s.mp4) | H.264 yuv420p 1920×1080, 30 fps, 826 frames, 27.53 s (includes page-load lead); source [webm](implementation/after/webgl2-idle-25s.webm) VP8 25 fps, 688 frames; [frame sheet 4 fps, 10×12](implementation/after/webgl2-idle-frames-4fps.png). **Life-to-wall ratio during the recording: 1.00** (27,099 ms of idle life over 27,099 ms; 147 drawn frames, ≈5.4 fps while recording) |
| Fixture bar and keyboard focus | [after/fixture-controls-focus.png](implementation/after/fixture-controls-focus.png) | bar 65 px, stage 1015 px, no overlap; first Tab lands on the `select` "Backend", `:focus-visible` true, outline `rgb(58, 47, 42) solid 2px` |
| Compare sheets | [compare-full.png](implementation/compare/compare-full.png), [compare-details.png](implementation/compare/compare-details.png); [toward/](implementation/compare/toward/compare-full.png) ([details](implementation/compare/toward/compare-details.png)); [canvas2d/](implementation/compare/canvas2d/compare-full.png) ([details](implementation/compare/canvas2d/compare-details.png)) | P1 (img-01) beside the implementation at equal height; seven matching normalised crops |

Capture run 3: 2026-10-07 20:12:44 → 20:15:50 UTC, `node scripts/capture-s1.mjs` (EVA_CAPTURE_SECONDS=25, port 1448, seed 7); page errors: none; failures: none; exit 0. Runs 1 and 2 are kept as `implementation/superseded-01-cup-defect/` (cup-body defect, review finding B1) and `implementation/superseded-02-life-clamp/` (life-to-wall ratio 0.56); see their READMEs.

### 8.2 Frame-time distribution (software only; **not** a performance result)

| Backend | rAF interval median / p95 / max (300 samples) | draw median / p95 / max (301) | particles drawn |
| --- | --- | --- | --- |
| WebGL2 — SwiftShader software GL | **133.2 / 150.0 / 183.3 ms** (≈7.5 fps) | 3.5 / 5.6 / 11.9 ms (CPU submit time, not GPU) | 168,910 |
| Canvas2D fallback — software Skia, stride 3 | **200.1 / 233.4 / 333.3 ms** (≈5.0 fps) | 173.2 / 194.5 / 285.5 ms | 56,302 |

Headless Chromium 141 on a 4-vCPU Linux container with no GPU. The idle video is therefore stepped (its 30 fps container holds about 5–6 distinct frames per second while recording), but its *pacing* is real: idle life is sub-stepped per frame and advanced exactly as much as wall time (ratio 1.00 above). The renderer's own CPU cost is small (3–6 ms submit); the frame time here is the software rasteriser. Real numbers need the demo machine (step 6).

### 8.3 Comparison against P1 (this session's assessment, not the owner's)

- **Palette — matches.** Cream paper, lit limestone, sage shutters, terracotta awning, camel coat, dark iron lamp, zinc mansard, white marble, glass. No teal, coral, apricot or plum anywhere (the stray dots of P1 were not copied).
- **Composition — matches element for element.** Table edge height, cup and saucer, ashtray and cigarette, the chair hoop and lattice cut by the left edge, the woman's position and size, both lamps, the mansard block, both façades, their windows and balconies, the awning's shape and slope all sit where the measurements in §4 put them (see `compare-full.png`).
- **Painterly particle material — partly.** The frame is a pointillist particle stipple on paper: coarser and more open than P1's painted stipple, so the walls read lighter and flatter and the fine ink detail (louvres, ironwork scrolls, mullions) is reduced to short strokes. The woman, the awning, the lamp post, the mansard and the chair read well. The cup is now a solid white cup with a dark coffee surface, grey shading on its right, a handle and a shaded saucer (the hourglass defect of the first capture set is gone); it and the ashtray still read lighter and softer than P1's firmly painted objects (`compare-details.png`, first two columns).
- **Calm — yes.** Nothing moves quickly. In the 25 s video the woman recedes about a tenth of the frame height and shrinks with distance (she does not fade or respawn within 25 s: her cycle is 34 s of travel plus a 2.5 s gap), the far walker on the left fades out around 13 s and reappears around 17.5 s, the man with the folder drifts, and steam and smoke rise and bend as thin threads.
- **Facing.** `away` keeps the brief's "nobody looks at the camera"; `toward` adds lapels and a small face patch as in P1. Both are captured; the owner decides (§10).
- If the owner asks for changes within step 1, this session's own priority list would be: (1) firmer near objects — cup shading, coffee depth, saucer, ashtray glass; (2) darker louvres and balcony ironwork; (3) a modelled far-right roof instead of the grey wedge; (4) slightly denser façade stipple.

## 9. Tests, checks and provenance

### 9.1 Checks run (actual results)

| Check | Result |
| --- | --- |
| `git rev-parse HEAD` / status at start | `e7d1424`, branch `week4`, clean |
| `npm --prefix week4 ci --ignore-scripts` | ok (workspaces: core + app; 0 vulnerabilities reported by npm) |
| `npm --prefix week4 run check` (final run after all edits) | core `tsc` clean, **103/103**; app `tsc` clean, **44/44** (`store` 3, `scene-arrival` 7, `life` 5, `host-params` 10, `host-stats` 10, `render-pack` 9); `vite build` ✓ |
| `cargo test --manifest-path week4/Cargo.toml` (rerun after the capture) | **69/69** |
| `cargo fmt --all -- --check` | clean |
| `node app/scripts/render-smoke.mjs` | ok: webgl2, canvas2d, auto→webgl2, canvas2d stress 100,000 → `stride 2`; no page errors |
| `node app/scripts/capture-s1.mjs` (25 s), three runs | run 3 exit 0; no page errors; files in §8.1; runs 1–2 superseded (cup defect; life-to-wall 0.56) and kept with their checks |
| Compare sheets (`compare-sheet.py`, Pillow 12.3) | 3 pairs generated |
| Focused scene tests | determinism (same options → identical arrays), required stable IDs present, slot ranges contiguous, far→near ordering, bounds/alpha/size, Paris-hue rule on every particle and Week 3-accent distance on every token, density scaling, per-region RNG isolation (every region other than the woman byte-identical across facings), capacity overflow throws, cup walls filled (simple outline), life rewrites only dynamic slots, emitters rise and become visible, walkers stroll slowly / scale with distance / respawn, reduced-motion clocks and no jump on toggle, `advanceLife` keeps wall-clock pace |
| Not run | Windows, WebView2, Tauri shell, real GPU, camera, microphone, providers, wallpaper/window effects, commit/push |

Machine-readable: [checks.json](checks.json).

### 9.2 Provenance (configured versus observed)

| Role | Configured | Observed / self-reported | Work |
| --- | --- | --- | --- |
| Main session (orchestration, packet inspection, scaffold, `core/validate.ts` refactor, scene authoring, integration, captures, docs) | session `configured_model: claude-opus-5-5` | `session_context.model` and `last_served_model`: **`claude-fable-5-1`** (`user_switched_model`) | all of `app/src/scene/*`, workspace files, docs |
| `eva-ui-designer` (host, fixture controls, capture script) | alias `sonnet` | self-report `claude-sonnet-5-5` (not independent evidence) | `app/src/App.tsx`, `main.tsx`, `style.css`, `src/host/*`, `tests/host-*.test.ts`, `scripts/browser-options.mjs`, `scripts/capture-s1.mjs`; integrated byte-for-byte, then one main-session change (state-only live region) |
| Renderer worker | **`eva-implementer` failed**: `claude-gpt-5.6-sol[1m]` → API `model_not_found` (404), no Model Gateway in Cloud; not transient, not retried | built-in `general-purpose` as a disclosed fallback; self-report `claude-fable-5-1` | `app/src/render/*`, `app/render-dev.html`, `tests/render-pack.test.ts`, `scripts/render-smoke.mjs`; integrated byte-for-byte, `types.ts` doc comment adjusted |
| `eva-reviewer` (independent read-only review) | alias `opus` | see §9.3 | findings only |
| Not used | `eva-mechanical` (Luna), `eva-researcher` (Terra) — same unavailable Gateway route; Ruflo `claude-flow` MCP failed to connect | — | — |

Weave: Figma MCP authenticated (`whoami`: owner handle, two plans); `weave_list_tools` empty; direct-model route listed; **no generation, 0 credits**. No creative authorship beyond the packet was undertaken: the two creative questions are put to the owner in §10 rather than decided here (the main session is not the Opus 5.5 route the owner asked for creative direction).

### 9.3 Independent review (`eva-reviewer`, read-only; configured alias `opus`, self-report "claude-opus-5-5")

The reviewer examined the whole working tree (app source, tests, scripts, configs, `core/validate.ts`, the packet, the planning sources cited in §7) and the first two captures; it ran nothing. Findings and what was done:

| # | Finding | Disposition |
| --- | --- | --- |
| B1 | Cup body outline self-intersecting (rim arc reversed) → hourglass cup in every capture | **Fixed** (`arrival.ts`, outline now a simple loop); a test now asserts the cup's walls are filled; the first capture set is kept as `implementation/superseded-01-cup-defect/` and the set was re-captured |
| S1 | Gate evidence inconsistent: packet REVIEW/INDEX said "UI blocked"; only VSCODE_PROMPT backed the designation | **Fixed**: the owner's instruction is quoted verbatim in §2; dated note added to the packet REVIEW; INDEX row reconciled |
| S2 | UI writers' inspections and the renderer worker's model not recorded | **Fixed**: §2 quotes both inspections; §9.2 and `provenance.json.writerInspections` record writers and self-reported models |
| S3 | Step-1 evidence incomplete under the owner's protocol (native video, native frame time, WebView2 GPU test) while asking for "Approve this step" | **Adopted**: the decision is offered explicitly in browser scope (§10) and the unmet native items are carried into the acceptance row |
| S4 | Tested revision ("e7d1424 + uncommitted tree") not reproducible | **Fixed**: `checks.json` carries a sha256 manifest of every changed/new file and a root hash; the acceptance row binds to it |
| S5 | `dt` clamp 50 ms made life run at ~43 % of wall-clock on 117 ms frames; life time not recorded; stills at a wall-time offset | **Fixed in two passes**: host clamp raised to 250 ms and `data-life-ms`/`data-wall-ms` reported; the capture now records the life-to-wall ratio for the video. The second capture then measured **0.56** (`stepLife` still capped each step at 100 ms under ~178 ms recorder frames; kept as `implementation/superseded-02-life-clamp/`), so the host now sub-steps life in ≤ 50 ms slices (`advanceLife`, tested). Stills are taken at life 3.0 s paused (`?paused=1&life=3000`) |
| S6 | "Woman recedes and respawns in 25 s" was false | **Fixed** (§8.3 now states what the 25 s actually shows) |
| S7 | Hard-coded "Linux/SwiftShader" labels | **Fixed**: labels derive from `process.platform` and the reported renderer string; still always browser evidence |
| S8 | `checks.json` location | **Fixed**: merged `checks.json` at the revision root; the capture's own file stays under `implementation/` |
| S9 | Black stage under the error message when the scene is null | **Fixed**: canvas hidden without a scene; message has a paper background |
| S10 | Edge probe called "low-risk" | **Fixed** (§7 wording) |
| S11 | `auto` has no fallback after a WebGL2 init failure | **Fixed** for init failure: `auto` retries once on a fresh Canvas2D canvas and reports "Renderer degraded: WebGL2 failed (…); using Canvas2D" in words; an unrestored context loss still waits (step 6) |
| S12 | Core-reuse wording overstated | **Fixed**: §3 now says the refactor makes core importable in the browser; the host imports only types until step 5 |
| S13 | Shared RNG made every later region change with the woman's facing | **Fixed**: per-region RNG streams (`author.ts`); the test now asserts every other region is byte-identical between facings — a real ID-continuity property for step 3 |
| N1 | `validate.ts` equivalence looks right; no multibyte test; Ajv needs `unsafe-eval` under a Tauri CSP | Noted for step 6 (CSP) |
| N2 | Hue guard missed Week 3's magenta/plum ink tints; unused tokens | **Fixed**: saturation-gated 290–345° band; four unused tokens removed |
| N3 | Lattice through the table; awning reads detached; facings barely distinguishable | Table opacity raised (6.4 px discs); lapels/face strengthened for `toward`; the awning attachment stays a known deviation (§11) |
| N4 | `dispose` did not release the GL context; `preserveDrawingBuffer` should be capture-only | **Fixed** (context released on dispose); `preserveDrawingBuffer` noted for step 6 |
| N5 | Misleading "fell back to Canvas2D" default; unused draw ring | **Fixed** |
| N6 | Reduced-motion toggle made walkers jump | **Fixed**: life keeps separately slowed walker/emitter clocks |
| N7 | `/part` region IDs outside core's pattern; lamp-far band; density doc; NaN clamp; no overflow test | Documented as renderer-internal; density doc corrected; NaN-safe clamp; overflow test added |
| N8 | Record the raw-WebGL2 decision; bundle OFL licences; `compare-sheet.py` overwrote; webm+mp4 duplication; stale progress row | Decision in §3; `app/LICENSES/` added; overwrite guard added; webm kept as the raw source (noted); progress updated |

The reviewer did not verify test, build, Rust or smoke results, the videos or the compare sheets (they did not exist yet), or any worker's actual route.

## 10. Owner questions and decision

1. **May P1/E0/A0 pixels be adopted as runtime source data** (particle colours or position targets)? Current state: **no** — the scene is authored natively; only palette *tokens* were sampled from P1 and recorded in §5. Recommendation: keep native authoring. The outputs are Nano Banana 2 (fal-ai) edits whose terms for runtime use are unreviewed (`provenance.json`: "Generated development reference; not an adopted runtime asset"), and native authoring is what steps 2–5 (depth, convergence, deconstruction) need anyway. If the owner wants reference pixels adopted, that decision and a terms note go into `week4/fixtures/assets/inventory.json`.
2. **Facing of the near walker:** `away` (the brief: nobody looks at the camera; DESIGN_PROMPT §6) or `toward` (as P1 shows)? Both are implemented and captured; `away` is the current default.

**Decision requested — in browser scope.** The step-1 protocol also asks for the idle video and frame-time distribution *natively* and a real WebView2 GPU test; none of those can be produced in this environment (§7). So the decision offered is: *Approve step 1 on the browser evidence* (with the three native items carried as open obligations into step 6 and the acceptance row), *Request changes*, or *Reject direction*. The decision is recorded verbatim in [acceptance/w4-visual-steps.md](../../acceptance/w4-visual-steps.md) against the content manifest in `checks.json`.

## 11. Known deviations and limitations

- The particle material is coarser than P1's fine stipple (3–6 px soft discs at 1080p against sub-2 px grain in a 2752 px image); fine pencil detail (balcony scrolls, louvre lines, mullions) is simplified to short strokes.
- The top of the far-right building (x 0.585–0.665, y 0–0.2) is a soft grey wedge, not a modelled mansard with dormers.
- Deliberately not copied from P1: the stray teal/coral dots and the ghosted double walker (one walker each).
- Steam and smoke are thin grey threads; P1's are fainter still.
- The Canvas2D fallback draws a declared stride-3 subset (about 56k of 168k particles) and is visibly sparser; it is labelled in the status line and in `checks.json`.
- Frame times here are software GL and software Skia on a 4-vCPU container; the 25 s video is stepped accordingly. No performance claim is made for the demo machine (step 6).
- `fixtures/scenes/paris-1980s-terrace.json` still places `obj:awning` as an overhead valance (band `overhead`, z +0.1) from the original plan; the owner's shop awning sits on the left façade (depth −4 to −7 here). The fixture reconciliation is proposed for step 2, when depth matters, and is noted here rather than changed silently.
- `@fontsource` licences (OFL) are present in `node_modules`; bundling them with built assets is due when a distributable build exists (step 6).
- Esc/S shortcuts and the A–G director are not wired (step 5); head coupling is off (step 2).
- The awning reads somewhat detached from its façade (no modelled attachment shadow); the mansard's zinc reads slightly lavender-blue in captures although its tokens are low-saturation greys — for the owner to judge.
- Region sub-IDs (`layer:facade/left`, `obj:lamp-post/far`, …) are renderer-internal; only their base IDs are stable scene IDs.
- Canvas2D keeps allocating a colour string per particle per frame; it is the fallback and makes no allocation claim.
- Under reduced motion walkers, steam and smoke still move slowly (planning §4: "slow and small"); step 5 owns the reduced-motion arrival as a whole.
