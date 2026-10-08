# Renderer contract for the step-1 rebuild (direction C)

Authored read-only through `eva-reviewer` (alias `opus`; self-report Claude Opus 5.5) on 2026-10-08; integrated by the main session. **Proposal, not an accepted specification.** It binds a UI writer only after the C packet ([w4-20261008-paris-c-hybrid](docs/design/revisions/w4-20261008-paris-c-hybrid/REVIEW.md)) has inspected outputs and the owner has seen them. Companion to [DESIGN_PROMPT_C.md](DESIGN_PROMPT_C.md).

> **2026-10-08, checkpoint 1.** The owner rejected RC1 and the realistic-plate idea itself (reasons: "Looks like a stock photo; the aesthetic is gone", "Not 1980s Paris enough", "Realistic plates are the wrong idea"). Everything here about photographic plates (§2.3, §4, the PL jobs, the plate renderer) is **superseded**. The coloured-wireframe material and the reveal mechanics remain proposals pending the alternatives the owner asked for. Record: [w4-20261008-paris-c-hybrid](docs/design/revisions/w4-20261008-paris-c-hybrid/REVIEW.md).

**Proposed scope (owner question 9):**
- the arrival composite at rest from PL1–PL3, with native idle life;
- the WC1 survey state rendered natively, with a replayable draw-on;
- one near reveal (cup, saucer, table, ashtray, chair, first pavement strip) on a fixture scrub, on the chosen ground.

**Not in step 1:** head coupling (step 2), the full A–G timeline (step 5), the native shell (step 6).

**Reuse from the rejected step 1:**
- host, fixture bar and focus handling;
- capture and compare scripts;
- the `core/validate.ts` browser refactor;
- per-region RNG streams and life sub-stepping;
- the composition measurements, re-measured on RC1.

**Retire from the build:** the particle store and the point-sprite renderer. Keep their record.

## A. Line renderer

1. **Data.** Authored 3D polylines in fixture JSON (data only).
   - Each polyline has a region ID that maps to a stable scene ID: `obj:table`, `obj:cup`, `obj:saucer`, `obj:ashtray`, `obj:cigarette`, `obj:neighbour-chair`, `obj:awning`, `obj:lamp-post`, `layer:facade`, `layer:pavement`, `layer:far`, `actors:passersby` (sub-IDs renderer-internal).
   - Per-line fields: colour token, cumulative arc length, start time and duration, overshoot.
   - Sources:
     - architecture comes from the measured composition on the proxy planes;
     - silhouettes of matted elements come from the mattes' contours (marching squares, simplified to about 1 px) lifted onto their cards;
     - a few interior lines are hand-authored.
   - The schema rejects unknown fields.
2. **Rasterisation.** Screen-space expanded segment quads with analytic anti-aliasing (coverage from the distance to the segment and `fwidth`) and round joins and caps. Not `GL_LINES`.
   - Width in device pixels, scaled by DPR.
   - Widths below 1 px render at 1 px with alpha equal to the width.
3. **Depth cue.**
   - Width: `w = 2.2·(0.6/max(0.6,−z))^0.35`, clamped to [0.6, 2.4] px at 1080p.
   - Alpha: `(0.6/max(0.6,−z))^0.2`, floor 0.55.
   - Both are tunable.
4. **Glow (dark ground only).** Half-resolution separable Gaussian of the line layer, σ 2.5 px (1080p), intensity 0.10–0.30 by depth, composited additively. Glow never touches plates, accents or the ground. Off on paper.
5. **Draw-on.**
   - Per-vertex arc length against a per-line progress value.
   - A write head at the leading point: 1.6× luminance, radius 1.5× width, 150 ms trailing decay (on paper, a 1.3× denser dot).
   - Speed: near about 900 px/s, far about 500 px/s.
   - Corner overshoot 4–12 px, fading first.
6. **Waver: none.** If ever enabled for review, at most ±0.5 px, low-frequency, deterministic, never flickering.
7. **Layering.** Plates draw back-to-front; each region's lines draw immediately after its plate, so nearer filled plates hide farther lines. Before any fill, every line is visible.
8. **Lines are 3D** and use the same camera, so they gain parallax in step 2 with no extra work.

## B. Plate renderer

1. **Camera projection from the rest pose.** Each plate is a texture projected from the calibrated rest-pose camera onto proxy meshes. UVs are computed once from the rest pose. At rest, the composite must equal the offline reference composite of the same plates within a small tolerance.
2. **Premultiplied alpha throughout.**
   - Premultiply offline and upload with `UNPACK_PREMULTIPLY_ALPHA_WEBGL=false`.
   - Blend with `ONE, ONE_MINUS_SRC_ALPHA`.
   - Generate mipmaps from premultiplied data.
   - Dilate colour under alpha 0.
3. **Colour space.** Composite in one documented space: either gamma-space, as image editors do, or linear end to end with `SRGB8_ALPHA8` and a final encode. Do not mix them.
4. **Filtering.** Trilinear, plus anisotropic filtering (`EXT_texture_filter_anisotropic`) where available, for the receding pavement and façades.
5. **Mattes.**
   - Vector mattes are rasterised from the same polylines that draw the lines; one source of truth.
   - Pixel mattes come from keyed PL2 and PL3; one texture per component.
   - Feather 1–1.5 px; 6–12 px on the sky.
6. **Overscan.** The display shows the central fraction of the plates at rest; default 6 % margin per side, tunable. At the head-box extremes, clamp to the edge and fade into the ground at the outer border. Verify in step 2 at full gain.
7. **Integrity.**
   - Plates are referenced by asset ID with sha256 in `fixtures/assets/inventory.json` (schema revision and provider-terms note first; owner decision 2).
   - A missing or mismatched hash fails closed into a labelled "lines only" degraded mode.
   - **No P1, E0 or A0 pixels at runtime.**

## C. Reveal mechanics: parameters tunable live by the owner

Tunables live on the fixture bar, outside the picture. Chosen values are saved to a fixture JSON whose hash is recorded in `checks.json`.

| Parameter | Default (proposal) | Range |
| --- | --- | --- |
| Ground | dark `#15110E` / paper `#F3EEE3` | switch |
| Ground lift (dark): start, end, target | 26 s → 44 s → RC1 sky sample | — |
| Fill mode per region | edge-in or directional (vector) | — |
| Per-region start and duration | §5 schedule | ±50 % |
| Global speed | 1.0 | 0.5–2 |
| Front softness | near 16 px, far 24–32 px | 4–48 |
| Front noise amplitude and scale | 6 px, low frequency | 0–16 |
| Seam width | 3 px | 0–6 |
| Seam intensity | 0.6 dark / 0.5 paper | 0–1 |
| Settle (saturation 0.7 → 1, contrast 0.85 → 1) | 700 ms | 0–2000 |
| Pre-sun grade and its lift window | on, 38–42 s | on/off |
| Line hold after fill | 0.4 s | — |
| Line fade after fill | 0.9 s | — |
| Contour fade delay | +0.5 s | — |
| Line width near/far; glow σ and intensity | per A.3 and A.4 | — |
| Write-head speed near/far | 900 / 500 px/s | — |
| Overshoot | 8 px | 0–12 |
| Registration frames: max on screen, life, X ratio | 4; 0.5–1.4 s; 1/3 | max ≤ 6 |
| Slips: max, life, offset, interval floor | 1; 0.15–0.3 s; 2–4 px; 3 s | max ≤ 1 |
| Accent cutoffs | frames none after 47 s; slips none after 42 s | — |

**Hard caps, not tunable:**
- No particles.
- No colour split, unless the owner answers question 6 otherwise.
- No accents or slips in reduced motion.

**Luminance limit** (proposed check, from captures): mean per-frame |ΔY| at most 2.0 on 0–255, and no single frame step above 4.

## D. Idle life (native)

- **Steam:** 2–3 thin ribbons, curl-noise advected, alpha ≤ 0.12, warm grey sampled from RC1, rising slowly, bending, fading. Tune against VC2.
- **Smoke:** one slower thread from the cigarette tip.
- **Ember:** pulse of about 0.2 Hz, ±10 %.
- **Walkers (Option A):**
  - Cards move along authored 3D lanes at a stroll, with perspective scale.
  - Lower-body shear of ±2–3° at the stride frequency measured from VC2; bob 0.6–1 % of figure height; small sway.
  - The woman's path is keyed so that she stands at RC1's position at arrival; maximum upscale 1.5×.
  - Entry and exit only behind occluders; one card per identity on screen.
  - Contact shadow: soft multiply ellipse, aligned with RC1's shadows.
- **Optional, off by default:** a slow cloud dimming over the right façade; awning breathing.
- **Reduced motion:** walkers static or at most 25 % speed with half the warp; threads slow.

## E. Determinism and stable IDs

- The same seed and time produce byte-identical state arrays: line progress, region fronts, accent list, walker transforms. Test the state, not pixels across GPUs.
- Per-region RNG streams: changing one region never alters another (the S13 lesson).
- Every line, plate component and accent belongs to exactly one region ID. Schedules are keyed by ID.
- Follow-ups (rain, evening) must later change regions in place without changing IDs.

## F. Reduced motion, skip, departure, fallback

- Implement DESIGN_PROMPT_C §6 exactly: reduced-motion stills crossfades; skip in about 6 s to the identical end state with required cues emitted; graceful retraction R1–R3; Esc immediate.
- **Canvas2D fallback:** the arrival composite at rest, as layered `drawImage` calls, with simplified strokes and no parallax. Label it in words.
- WebGL2 is required for projection and parallax. The step-1 §7 GPU-quarantine question stays open for the Windows test.

## G. Focused tests

- **Line fixture:** schema valid; unknown fields rejected; every polyline has a known region ID.
- **Ordering:** draw schedule near→far; fill starts near→far; walkers fill last.
- **Accents:** caps and cutoffs hold.
- **Palette:** every line and accent colour passes the Paris-hue guard (no cyan, blue or purple band above a saturation threshold; reuse the step-1 guard).
- **Plates:** hash check fails closed.
- **Rest-pose registration:** composite matches the offline reference composite.
- **Reduced motion:** no write heads, accents or slips.
- **Determinism.**
- **Life:** keeps wall-clock pace; walker uniqueness.

## H. Captures for the comparison

All at 1920×1080, DPR 1, labelled honestly as browser, software GL or native. The demo-monitor resolution is added once known.

1. Arrival at rest beside RC1, plus an absolute-difference heat map. The same seven matching crops as step 1, for continuity: cup, ashtray, woman, chair and table edge, awning and left façade, lamp/mansard/walkers, right façade.
2. The native survey state beside WC1, on the chosen ground. If the owner wants the comparison, the other ground as well.
3. The native near-fill state beside WC2.
4. Reveal scrub video (MP4, ≥30 fps) beside a VC1a frame sheet.
5. A 25 s idle video beside a VC2 frame sheet, with the life-to-wall ratio.
6. Reduced-motion stills.
7. Frame-time distribution, labelled. A browser result is not a performance claim.
8. The tunables file and its hash.

## I. Acceptance questions for the owner (emotional first)

1. Does the arrival frame feel like being there, with realism and aesthetics at the level you wanted? Does it still feel like P1's afternoon?
2. Do the coloured lines feel technological and beautiful, or like CAD, Tron or a game?
3. When the cup and table became real, did it feel like the place arriving, or like a transition effect?
4. Ground: dark or paper?
5. Does the woman feel like a person walking, or a cut-out? Is her face unreadable enough?
6. Steam and smoke: real enough, and quiet enough?
7. Only then: seams, halos, fringes, double edges, accent density, focus and keyboard.

Then the step decision: **Approve this step / Request changes / Reject direction.**
