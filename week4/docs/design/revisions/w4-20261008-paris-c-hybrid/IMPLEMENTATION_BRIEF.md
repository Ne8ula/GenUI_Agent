# Implementation brief: the seed-33 look and the VB2 motion, procedurally

Date: 2026-10-08 (overnight). Status: **the single implementation guide for this pass.** Every worker reads this file, the two references below and only the source files it owns. Written by the main session (configured `claude-opus-5-5`, served `claude-fable-5-1`) from the owner's words and the inspected references. Nothing here is owner acceptance.

## 0. Owner authority for this pass (verbatim, recorded in [the decision record](../../acceptance/w4-visual-steps.md))

- "Seed 33: select" and "it should just be seed 33 as the video, disregard BWA-2 now. The aesthetic and style should follow seed 33 solely."
- "switch to approval off and just start implementation with owner approval of the video already registered right now … Ensure the graphic implementation recreates the video exactly but not through screenshots, but through actual particles and animations happening on the desktop. Ensure smooth transition and animation."
- "use agents to delegate tasks … ensure the context doesnt cause hallucination and creation suboptimal results."
- Loading intensity: "Toned down: same language, slower and nearer-first".

Still in force: Paris palette only (`isParisTone` in `app/src/scene/palette.ts` is the guard); no readable text, HUD, hexagons, glyph rain, strips or full-frame flashes; one walker each; the woman walks toward the viewer with no readable face; keyboard focus, captions and controls stay outside the picture; error and authority states in words; no commit or push; no generated image is loaded at runtime (the references are looked at, never sampled).

## 1. The references (look at them before editing)

| What | Path (relative to this folder) |
| --- | --- |
| **The look** (selected still, seed 33) | `references/images/img-13-bwa3c-seed33.png` (2752×1536) |
| **The motion** (VB2, owner-approved) | `references/videos/vid-02-vb2-seed33-only.mp4` (5.04 s, 24 fps); sheets `vid-02-sheet-3fps.png`, `vid-02-sheet-12fps-first2s.png`; key frames `vid-02-key-01…05.png` |
| Earlier sibling for contrast (not a target) | `references/images/img-09-bwa2-abstract-blackwall-city.png` |
| Composition geometry (measured from P1, same layout) | `week4/app/src/scene/arrival.ts` constants: `HORIZON_Y`, table ellipse, cup, saucer, ashtray, chair, façade bases, awning polygon, lamps, walker rigs |

What the look is, in words (from inspection): a warm umber-black ground; a pale pink-cream sky above the rooflines; building masses that are dark and only *suggested* by sparse vertical beaded light-threads (not drawn in detail), the threads uneven from almost invisible to bright; the rattan chair's hoop as honey beaded lines; the marble table as a radial burst of beaded light-lines fanning from below the frame to the table rim; the cup, saucer and glass ashtray as beaded light drawings in porcelain white and glass grey; the woman in the camel trench as a figure made of an ordered dot grid of light (dithered), face unreadable, walking toward us; two far walkers as dimmer dot figures walking away near the lamp; the lamp posts as thin beaded silhouettes; hard-edged rectangular tiles (flat Paris-colour swatches, ordered-dither cells, dot grids, scanline rasters, a few transparent) floating over the façades, the awning area and the table edge, with thin 1-px hairlines dropping from some of them. In the clip: beads shimmer along threads, the woman approaches (about 1.6× larger over 5 s), tiles shift and swap slowly (no more than one or two swaps per second in the whole frame, never all together), nothing flashes; per-frame luma difference mean 3.2, max 6.2 on 0–255. That calm is the target; the owner's own tree clip (mean 19.4) is what was toned down.

## 2. Architecture (what exists, what is added)

Existing and reused: `app/src/scene/{types,store,rng,palette,author,arrival,life}.ts` (SoA particle store with slot identity, per-region deterministic RNG, polygon/ellipse/polyline authoring, walker rigs and gait, steam/smoke emitters), `app/src/render/{create,webgl2,canvas2d,pack,paper}.ts` (WebGL2 point sprites with premultiplied blending and Canvas2D fallback), the host (`app/src/host/*`, `App.tsx`), the capture script and the compare script.

Contracts already extended by the main session in `app/src/scene/types.ts` (read it; do not change it without saying so in the hand-back):
- `ParticleStore` gains `phase` (0..1), `motion` (shimmer cycles/s, 0 = static) and `birthMs` lanes; `author.ts` `emit` writes `phase = rng()`, `motion = writer.motion`, `birthMs = writer.birthMs`.
- `SceneFrame` gains `sky: Sky | null`, `tiles: Tile[]`, `build: { durationMs }`; `paper` is now the ground colour.
- `Tile { id, region, x, y, w, h, pattern: 'transparent'|'flat'|'dither'|'dotgrid'|'scanline', colour, alpha, cellPx, hairline, birthMs }`.
- `BIRTH_RAMP_MS = 400`: renderers ramp alpha from 0 to the stored alpha over this time after `birthMs`, using `view.timeMs` (the host clock; it stops while paused).

Layers, drawn in this order by both renderers: ground clear (`frame.paper`) → sky gradient (`frame.sky`, top to `horizonY`, soft 0.04 band) → particles in store order with birth ramp and shimmer → tiles in array order with birth ramp → hairlines.

Shimmer (both backends, from `view.timeMs`): for a particle with `motion > 0`, `alphaFactor = 0.55 + 0.45 * (0.5 + 0.5 * sin(2π (motion · t_s + phase)))`; static particles use 1. Reduced motion is handled upstream by authoring/life setting `motion` to 0, not by the renderer.

## 3. The scene module (owner: worker S)

New file `app/src/scene/seed33.ts` exporting `buildSeed33Scene(opts: Seed33Options): SceneFrame` with `Seed33Options { seed: number; density: number; buildMs: number; reducedMotion: boolean }` and `DEFAULT_SEED33`. Use `createWriter` and the `author.ts` primitives; keep `CAPACITY = 262_144`; keep every colour a palette token or a tone that passes `isParisTone`; write regions far → near with the existing stable IDs (`layer:far`, `layer:facade/mansard`, `layer:facade/right`, `layer:facade/left`, `obj:awning`, `obj:lamp-post/far`, `actors:passersby/third`, `actors:passersby/man`, `obj:lamp-post`, `actors:passersby/woman`, `obj:neighbour-chair`, `obj:table`, `obj:ashtray`, `obj:cigarette`, `fx:smoke`, `obj:saucer`, `obj:cup`, `fx:steam`). Geometry comes from `arrival.ts` constants (import or duplicate the numbers with a comment); do not change `arrival.ts`.

Materials (beads = points; sizes in px at 1080):
- **Façade threads**: for each façade quad, vertical threads at a pitch that reads sparse (about 14–22 px at 1080, jittered), each a column of beads 3–4 px apart, size 2.2–3; per-thread alpha from a smooth hash in 0.08–0.85 so many threads are near-invisible; dimmer across window openings (use the window rectangles the arrival scene uses) and brighter near the lit left cornice; colours limestoneLit/limestoneShade/café crème; the far mansard the same but finer and dimmer. The building *mass* stays dark: no fills.
- **Table**: beaded radial lines from a focal point below the frame (about (0.5, 1.30)) to the table rim ellipse, angular pitch about 1.2–1.6°, beads 3 px apart, size 2.6, colour marble/cupWhite warm, alpha rising toward the rim (0.25 → 0.95); the rim itself a bright beaded ellipse.
- **Cup, saucer, ashtray, cigarette, chair**: beaded contours and a few hatch lines along `ellipseArc` paths (cup body, rim, handle; saucer rings; ashtray rim, base, notch; chair hoop double line and the diamond lattice), porcelain white / glass grey / honey / cigPaper with the ember token; sizes 2.6–3.4, alpha 0.6–1.
- **People** (dynamic regions, rigs registered through the same mechanism `arrival.ts` uses so `life.ts` moves them): an ordered dot grid at about 5 px pitch inside the silhouette polygons (reuse the walker silhouettes from `arrival.ts`), brightness by a 4×4 Bayer threshold against a body-light field (brighter in the torso, dimmer at the edges, no features in the head), colour camel for the woman, walkerTan/trousers tones for the men; the woman's rig faces toward; sizes 2.4–3; alpha 0.5–1.
- **Lamps**: thin beaded silhouettes (post, lantern box) in lampIron with a brighter lampGlass bead cluster.
- **Steam and smoke**: keep the existing emitters (dim grey beads, low alpha).
- **Tiles** (`frame.tiles`): 16–24 tiles authored by a deterministic function in a new `app/src/scene/tiles.ts`: sizes 3–9 % of frame width, aspect 0.6–1.6, placed over the left façade/awning area, the right façade, the chair, the table's far edge and the cup/saucer; patterns distributed about flat 35 %, dither 30 %, dotgrid 15 %, scanline 10 %, transparent 10 %; flat colours from the Paris tokens (terracotta awningRed, cream paper, honey rattanLit, sage shutterGreen, zinc, saucer blush); dither/dotgrid/scanline light tones cream/café crème on the dark ground; `cellPx` 4–8; `hairline` 0.02–0.18 on about half; alpha 0.75–0.95; `region` = the region each tile floats over (its depth order drives settling).
- **Birth schedule** (construction, nearest first, over `buildMs`, default 12 000): table and cup 0–15 %, ashtray and cigarette 8–20 %, chair 12–28 %, woman 25–40 %, lamps and far walkers 35–50 %, left façade and awning 45–70 %, right façade 55–80 %, mansard 80–100 %; within a thread, birth increases upward (beads draw on from the bottom); tiles are born in the first 20 %. With `buildMs = 0` everything is born at 0.
- **Shimmer**: threads `motion` 0.12–0.4 cycles/s; table and object beads 0.08–0.2; people 0 (life moves them); reduced motion sets all `motion` to 0.

`app/src/scene/tiles.ts` also exports the tile life: `createTileState(frame, seed)` and `stepTiles(state, frame, dtMs, timeMs, opts: { reducedMotion })`, called from `life.ts`'s `stepLife` (S owns the small change in `life.ts` that wires it). Rules: each tile has its own next-swap time; a swap changes `pattern` (and colour for flat) instantly (hard-edged, like the clip) and may nudge `x`/`y` by at most 1 % of the frame; base interval 2.5–6 s per tile, globally never more than 2 swaps in any 1 s; during the build the interval is scaled by 0.5; after the build a tile's interval grows with its region's nearness (nearest regions calm first: interval × (1 + 3 · settle) where settle rises from 0 at build end to 1 over the next 10 s for near regions, slower for far ones); reduced motion: no swaps at all after the first second. Deterministic from the seed and time: the same seed and the same sequence of dt gives byte-identical tile state.

Tests (owner S, `app/tests/scene-seed33.test.ts`, `app/tests/tiles.test.ts`): capacity not exceeded at density 1.25; every emitted colour and every tile colour passes `isParisTone`; region order far → near; birth order nearest-first (median birth of `obj:cup` < `obj:neighbour-chair` < `actors:passersby/woman` < `layer:facade/left` < `layer:facade/mansard`); no particle outside the frame margin; people have no beads above the head line (no features is a visual check, note it); tile count and pattern caps; swap cap (≤ 2 per second) and determinism; reduced motion has no swaps.

## 4. The renderers (owner: worker R)

Files: `app/src/render/pack.ts`, `webgl2.ts`, `canvas2d.ts`, `paper.ts`, `create.ts`, `dev.ts`, `render-dev.html`, `app/tests/render-pack.test.ts`, `app/scripts/render-smoke.mjs`.
- `pack.ts`: extend the interleaved layout with `phase`, `motion`, `birthMs` (FLOATS_PER_PARTICLE 8 → 11; update offsets and tests); keep the far → near slot order; keep the alpha threshold on the stored alpha.
- `webgl2.ts`: uniform `u_time` (seconds, from `view.timeMs`); vertex shader applies the birth ramp (`smoothstep(birth, birth + BIRTH_RAMP_MS, time)`) and the shimmer factor to the alpha; discard fully transparent points early. Replace the paper grain pass with a **ground + sky pass**: clear to `frame.paper`, then a fullscreen pass that draws the sky gradient from the frame top to `sky.horizonY` with a soft band into the ground colour, in frame coordinates (margins outside the frame stay ground). When `frame.sky` is null, keep the current paper grain behaviour. Add a **tile pass**: instanced quads (one VBO of per-tile data: rect, pattern id, colour, alpha, cellPx, birth) with a fragment shader generating the pattern in device pixels relative to the tile's top-left: `flat` = solid; `dither` = 4×4 Bayer threshold of a soft diagonal gradient, light tone on the dark ground; `dotgrid` = discs on a `cellPx` grid; `scanline` = 2-px lines every `cellPx`; `transparent` = alpha 0 (the tile still draws its hairline). Hard edges, no antialias blur beyond one pixel. Then **hairlines**: 1-device-px vertical quads from each tile's bottom edge down `hairline` frame-heights, alpha 0.35 × tile alpha, in the tile colour. Premultiplied blending throughout. Context loss handling stays.
- `canvas2d.ts`: the same layers with canvas calls (gradient for the sky; patterns via small offscreen tiles for dither/dotgrid/scanline; `fillRect` for flat; 1-px `fillRect` hairlines); the stride budget stays for particles.
- `render-smoke.mjs` must still pass and should now draw a frame with a sky and two or three test tiles; `dev.ts` gets a tiles toggle if it is cheap.

Tests (`render-pack.test.ts` and a new `render-tiles.test.ts` for any pure helpers such as the Bayer matrix and pattern coverage functions): packing of the new lanes, birth ramp and shimmer helpers (pure functions shared by both backends live in `pack.ts` or a new `render/time.ts`), pattern helpers identical in both backends.

## 5. The host and the evidence (owner: worker H)

Files: `app/src/App.tsx`, `app/src/host/*`, `app/src/style.css`, `app/scripts/capture-s1.mjs` (or a new `capture-s33.mjs`), `app/scripts/compare-sheet.py` (or a new `compare-s33.py`), `app/tests/host-*.test.ts`, `app/index.html`.
- New host param `look=seed33|arrival` (default `seed33`); `build=<ms>` (construction length, default 12000, 0 = complete) and `t=<ms>` (start the host clock and the life clock at this time, replacing the old `life=` semantics: both clocks start at `t` so a still at `t=3000` shows the build at 3 s). Keep `paused`, `reduced`, `seed`, `density`, `backend`, `fixture`.
- Fixture controls outside the picture: look, build length, a time scrub (sets `t` and reloads or re-steps), tiles on/off (a `showTiles` flag: when off the loop hands the renderer a frame whose `tiles` is an empty array; never mutate the scene's tiles), reduced motion, pause; status line in words (backend, frame time, particles, tiles, build state: "constructing 4.2 s of 12 s" / "complete").
- The render loop: when `t` is set, advance life to `t` and start `clockMs` at `t`; call `advanceLife` as now (life now also steps tiles).
- Capture (`EVA_CAPTURE_DIR`, refuses non-empty): stills at 1920×1080 dpr 1 for build 0 %, 25 %, 50 %, 100 % and complete + 5 s (paused, reproducible); a 30 fps MP4 of the full build plus 10 s of idle, with the frame sheet at 4 fps; a reduced-motion still; the focus screenshot; frame-time stats with the honest platform labels already in the script; `checks.json` with life-to-wall ratio and the same honesty fields as before.
- Compare: a sheet placing each capture beside the matching VB2 key frame / the seed-33 still at the same scale, plus the seven anchor crops against seed 33; a per-frame luma-difference measurement of the captured MP4 (ffmpeg signalstats, as the packet does) reported next to VB2's (mean 3.18, max 6.2).

Tests: params (look, build, t), status wording, tiles flag.

## 6. Shared rules

- One writer per file (ownership above). Shared types are frozen; if you need a change, write it in your hand-back and stop at that boundary rather than editing another owner's file.
- Run `npm run typecheck` and `node --test` on your own tests in `week4/app`; do not run `npm run build` (the main session runs the full `npm --prefix week4 run check` at integration to avoid clashing on `dist/`).
- Deterministic everything: no `Math.random`, no `performance.now()` outside measurement; time comes from `view.timeMs` or the life clock.
- Comfort: never pulse the whole frame; keep the captured per-frame luma difference well under the owner's clip; no flashes.
- Report in the hand-back, in at most 60 lines: files changed, what was built, the exact commands run and their results (pass/fail counts), self-reported model identity, and anything left undone or uncertain. No claims of visual quality without a capture.

## 7. What "done" means for this pass (the main session verifies)

`npm --prefix week4 run check` green (core, app typecheck, tests, build), `cargo test` in `week4/broker` still green (untouched), render smoke ok, captures produced and compared against seed 33 and VB2, the packet's `implementation/after/` filled, REVIEW.md and the progress file updated, the acceptance record left pending for the owner's written decision.

## 8. Round 2 tuning (main session, after inspecting run-1 stills against seed 33)

Run-1 (`implementation/run-1/after/`) already shows the architecture working: dark ground, pink-cream sky, radial beaded table, beaded cup, saucer and ashtray, honey chair lattice, dot-grid people, lamp silhouettes, patterned tiles with hairlines, nearest-first build. Against `img-13` it misses in these ways, fixed in round 2:

1. **Sky wedge (renderers).** The sky must show only in the wedge between the rooflines; the upper building masses stay ground-dark. `Sky.polygon` (frame coordinates) is now in the contract and `seed33.ts` exports `SEED33_SKY_POLYGON`; the scene sets `sky.polygon` to it. WebGL2: draw the gradient as a triangle fan of the polygon (gradient by frame y, same soft band at the bottom edge); Canvas2D: clip to the polygon path. No polygon = full width as today.
2. **Façade threads read as faint uniform pinstripes.** Target: far fewer threads, but luminous, clustered at architectural edges. Keep pitch 18–26 px, but give 25 % of threads alpha 0.8–1.0 and bead size 3.2–4.2 (bright), 45 % alpha 0.25–0.5, 30 % alpha 0.06–0.15; brighter threads at window jambs, cornices and the awning edge; add beaded **horizontal courses** (cornice, string course, window lintels and sills: beads 4 px apart, alpha 0.5–0.9) so the façades are legible; the mansard gets a bright ridge and dormer outlines; window openings stay dark (threads × 0.15 inside them).
3. **Table too thin.** Radial pitch 1.3° → 0.55°, beads 3.0–3.6 px, alpha 0.35 → 1.0 toward the rim with a slight bloom (bead size +25 % in the outer third); the rim as a bright triple ring. The table should read as a dense burst of light, as in the reference.
4. **Cup, saucer, ashtray too wire-like.** Add a dot-fill (ordered grid, 4 px pitch, Bayer-thresholded by a simple shading field: bright on the lit side, dim on the far side) inside the cup body, the saucer surface and the ashtray body, alpha 0.6–1.0, so they read as luminous beaded solids; keep the contour rings.
5. **The woman reads as a dot rectangle.** Use the arrival rig's actual silhouette polygons (coat flare, shoulders, head, legs) for the grid mask; brightness alpha 0.75–1.0 with a 4×4 Bayer presence so the figure is luminous; head a dense dot cluster, no features; her home height as the reference (about 0.39 of frame height at feetY 0.745); approach pace closer to the clip: grow by about 1.6× over 8 s (startY/endY/travelS in the rig).
6. **Tiles.** 16–18 tiles instead of 22; keep the quotas; swap life calmer: base interval 12–30 s per tile (build ×0.5), global cap 1 swap per second after the build, 2 during it.
7. **Lamp.** Keep the silhouette; add a dense bright bead cluster for the lantern glass (lampGlass) so the lamps glow as in the reference.

Everything else (palette guard, stable IDs, determinism, tests) stays. Capture again into `implementation/run-2/` after the full check; never overwrite run-1.

## 9. Round 3 fixes (from the independent review of the integrated pass)

The `eva-reviewer` (alias `opus`; self-report Opus 5.5) read-only review found no blocking invariant breach and these defects, fixed in round 3 (one writer per file as before):

**Scene / life (worker S3: `seed33.ts`, `tiles.ts`, `life.ts`, their tests)**
- A. The woman's walk cycle (travel 8 s + gap 2.5 s, phase 1.6 s) cuts off her first build and leaves her absent at the complete + 5 s still (t = 17 s). Phase her cycle to the build: she must be whole and visible from her birth window through at least t = 20 s, then cycle as before; add a test that she is visible (fade > 0.8) at t = 12 s and t = 17 s with `buildMs` 12 000, and at t = 5 s with `buildMs` 0.
- D. Tile nudges random-walk from the current position; nudge relative to an authored home position instead (|offset| ≤ 1 % of frame from home, ever). Update the drift test accordingly.
- E. Default the seed-33 look to seed 33 everywhere the host and capture default it (coordinate with H3: `DEFAULT_SEED33.seed` is already 33; the host default seed must become 33 for `look=seed33`), and add tests for quotas, zones and swap caps at seed 7 too, so whichever seed the evidence uses is covered.
- G. With `buildMs = 0` every birth is 0 and `birthRamp(0, 0) = 0`, so a paused frame at t = 0 is empty. Give zero-length builds a birth time of −`BIRTH_RAMP_MS`.
- Reduced-motion toggle (B, scene side): export a `setReducedMotion(frame, reduced)` that flips `motion` lanes in place (0 or the authored value, which must be stored per particle, e.g. a `motionAuthored` Float32Array kept privately by seed33.ts in a WeakMap keyed by frame) and tells the tile state to stop/resume swapping without resetting anything; the host calls it instead of rebuilding.

**Host (worker H3: `App.tsx`, `host/*`, `capture-s33.mjs`, `compare-s33.py`, host tests)**
- B. Reduced-motion toggle must not rebuild the scene or replay life: call the scene's `setReducedMotion` and keep both clocks; no jump, no stall. Test: toggling leaves `life.clockMs`, walker time and tile state unchanged.
- C. Backend switch must not split the clocks: on remount, keep the current host clock (`clockMs`) and do not re-advance life; or rebuild both from `startMs`. Pick one, document it in the loop, test it.
- E. Host default seed for `look=seed33` is 33 (the arrival look keeps 7); the capture default seed follows the look.
- F. `compare-s33.py` reading line: report a captured idle luma difference far below VB2's as a **fidelity gap** ("less life than the reference") as well as a comfort result; print the ratio.
- Hairlines: clip tile hairlines to the frame rect in both backends is a renderer item (R3 below), not host.
- `CANVAS_LABEL`: describe the look actually shown (seed 33 vs arrival).

**Renderers (worker R3: `webgl2.ts`, `canvas2d.ts`, `patterns.ts`, render tests)**
- Cache the sky triangulation per polygon identity (recompute only when `frame.sky.polygon` changes); remove the per-call closure in `packTiles`; cache Canvas2D gradient/pattern keys.
- Clip hairlines to the frame rect (scissor in WebGL2; clip in Canvas2D).
- `render-tiles.test.ts`: import `SEED33_SKY_POLYGON` instead of a copied fixture.

Notes carried, not changed now: the palette guard stays test-time (all colours are authored tokens; boundary validation is required before any model-supplied scene data); the arrival scene is no longer byte-identical to the step-1 manifest because `emit` now draws a phase (expected and recorded); shimmer phases are per bead (no whole-frame pulse possible); the `host-tiles` "life keeps stepping" test is tautological and must call `stepTiles`.

## 10. Round 3 visual tuning (main session, after inspecting run-2 against seed 33)

Run-2 (`implementation/run-2/`) fixed the sky wedge, the façade legibility, the lantern glow and the tile cadence. Against `img-13` the picture is still dim, grey and thin where the reference is warm, luminous and dense. Worker S3 applies these with the §9 scene fixes:

1. **Luminosity and warmth everywhere.** The reference beads are bright warm cream-white with a soft glow; ours read grey. Use warm tones (cupWhite, café crème `#f0dbb8`, limestoneLit, camelLit) instead of marble greys for every near object; raise near-object bead alpha to 0.9–1.0 and size to 3.4–4.2 px; add a **halo bead** under each bright bead of the cup, saucer, ashtray, table rim, woman, lantern and chair hoop (same position, size × 3, alpha 0.10–0.14, same colour) so they glow. Stay under CAPACITY at density 1.25.
2. **Table**: run-2's 0.55° pitch with 3–3.6 px beads turned the table into a continuous grey disc. The reference is distinct radial lines of light with dark gaps between them, brighter toward the rim. Pitch back to 0.9°, warm cream colour, alpha 0.15 near the frame bottom → 1.0 at the rim, beads 3.0 px (3.8 px in the outer third), a bright thick rim ring (triple, with halo).
3. **Cup**: the reference cup is a dense luminous white body with a dark coffee ellipse and bright rim. Dot-fill at 3 px pitch, alpha 0.9–1.0, cupWhite, bead 3.4 px, halo under all; the coffee surface stays empty (dark) inside a bright rim; handle as a double bright arc. Saucer the same density; ashtray as a bright glass ring object (glassLight) with the ash well dim.
4. **Woman**: the reference figure is a bright dense dot-grid with a clear coat silhouette (shoulders narrower than the flared hem, head oval with hair, legs below). Author a new silhouette polygon set for the dot grid (coat trapezoid flaring from shoulders to hem at about 60 % of the height, lapel V, belt line, head oval 11 % of height with a hair mass, neck gap, two legs and boots), bead 3.2–3.6 px, alpha 0.9–1.0 with the Bayer presence, camelLit body / camel shade edges / hair in `hair`; halo under the body dots; keep "no features" and the toward-facing rig; apply the same silhouette to the far walkers at their size.
5. **Façades**: keep the thread classes; reduce the horizontal courses to the cornice, the string course and one lintel per window row (fewer lines; the reference has almost none) and slightly brighten the bright class (alpha 0.9–1.0, size 3.6–4.2).
6. **Chair**: honey hoop as a double bright line with halo; lattice unchanged.

Capture into `implementation/run-3/` after the full check.

## 11. Round 4 (main session, after inspecting run-3 against seed 33): figure and glow

Run-3 (`implementation/run-3/`) has the sky wedge, warm beaded objects, the glass ashtray, the glowing lanterns, the woman visible at every still, far walkers, calm tiles, and the radial table. Remaining gaps, the last scene round of this pass (worker S4, `seed33.ts` and its tests only):

1. **The woman reads as a blocky robot**: rectangular coat blocks with a dark seam, a square head on a stalk, stick legs. Author one continuous organic silhouette: a slightly sloped shoulder line, a coat that flares smoothly from shoulders to hem (no belt gap or vertical seam cutting the grid; the belt is a one-dot-row dimming only), a rounded head oval that sits on the shoulders with a soft hair mass widening at the jaw, no neck stalk, two legs that taper into boots. Fill the whole silhouette with the dot grid at 4 px pitch; body light brightest at the chest, falling toward the hem and edges; alpha 0.95–1.0 in the core. Same for the far walkers at their size (men's shoulders a little wider, no hair widening).
2. **Glow**: near-object halos ×4 size and alpha 0.16–0.22 (cup, saucer, ashtray, table rim, woman, lanterns, chair hoop); bright thread class gets a halo too (×3, alpha 0.10). Keep under CAPACITY at density 1.25.
3. **Table**: rays denser at the rim: a second ray set offset by half a pitch that starts at s = 0.55 (outer part only), so the burst thickens toward the rim without filling the centre; rim ring beads 4.2 px.
4. **Cup and saucer**: dot pitch 2.6 px, alpha 1.0, so they read as solid luminous porcelain; coffee ellipse stays dark.
5. **Façades**: remove the one-lintel-per-row courses too (keep cornice and string course only); thread bright class ×1.15 alpha weight; mid class alpha 0.3–0.55.

Capture into `implementation/run-4/`.
