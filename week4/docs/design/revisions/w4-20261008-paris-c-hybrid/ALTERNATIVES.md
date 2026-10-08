# Alternatives after the RC1 rejection: coloured lines, Blackwall-structured construction, no photographic surfaces

Date: 2026-10-08 · Status: **proposal, documentation only. Every value, prompt, timing and cost figure here is a proposal or an estimate. Nothing in this file has been generated, quoted, run or accepted.** · Accepted Week 4 baseline: none · Packet: [w4-20261008-paris-c-hybrid](REVIEW.md)

Authored read-only through the project `eva-reviewer` route: configured alias `opus`; self-reported identity Claude Opus 5.5 (`claude-opus-5-5`). The author cannot observe the served model or the transport; see [AUTHORSHIP.md](../../../../AUTHORSHIP.md). Integrated by the main session. Source revision: `e7d1424` plus the uncommitted step-1 tree.

**Inputs:**
- [P1](../w4-20261005-paris-p1-converge/references/images/img-01-p1-settled-painterly.png), [RC1](references/images/img-01-rc1-realistic-master.png) and its comparison sheets.
- [REVIEW.md](REVIEW.md), [JOBS.md](JOBS.md), [DESIGN_PROMPT.md](../../../../DESIGN_PROMPT.md), [DESIGN_PROMPT_C.md](../../../../DESIGN_PROMPT_C.md), [RENDERER_CONTRACT_C.md](../../../../RENDERER_CONTRACT_C.md) and [planning.md](../../../../planning.md) §2–§6.
- The [decision record](../../acceptance/w4-visual-steps.md).
- The six mood references in `week4/references/`.
- The owner's five style references (viewed locally; never committed; §1).

The owner's motion video had not reached the main session when this was written. §2.6 lists what waits for it.

## 0. What the owner asked for

Owner words, as recorded or relayed by the main session:
- **Step 1 rejection:** *"I feel as if the results do not resemble anything like P1. I want realism and aesthetics at its peak, so form is too hard, maybe just use colored wireframes, or something that feels technological and realistic but also aesthetic at the same time."*
- **Checkpoint 1:** "Reject the realistic look". The reasons were "Looks like a stock photo; the aesthetic is gone", "Not 1980s Paris enough" and "Realistic plates are the wrong idea". The last option's description reads: "Photographic surfaces should not be in the picture at all; the coloured lines (and perhaps a painted or stylised fill) should carry it." Next run: "No run yet: write me the alternatives first".
- **With the five references:** "Especially refer to Cyberpunk 2077's blackwall aesthetic and shaders."
- **Clarification:** "The video uploaded in the file picker is how I want the loading animation to feel like as well. The images is what the city should feel like in terms of aesthetics (not colors)."

**My reading (interpretation, not the owner's words):**
- **There are two briefs.**
  - The *loading animation* (planning phases B–E: clearing, survey, fill) should feel like the Blackwall shader video.
  - The *city* (the arrived place) should carry the aesthetics of the five images, in the Paris palette.
- **"Realism"** means conviction of light, geometry and depth, not photographic texture.
- **Why RC1 read as stock:** it was reality left untouched. It was plausible, evenly exposed, tidy and anonymous, with nothing selected or left out. It read as not-1980s because nothing in it can be dated except one coat: the street could be photographed today.
- **What references 1 and 2 do instead:** they show reality visibly worked on, either marked object by object or assembled from panes. That act on the place is what keeps them from reading as stock while they stay real.

**Rules that still hold:**
- Paris palette only (reconfirmed by "not colors").
- No red wash, no strips, no full-frame flashes.
- One walker each; the woman walks toward us with an unreadable face.
- No readable text.
- No photographic plates.
- No Animus assets. By extension: no Cyberpunk 2077 assets, logos, UI or screenshots, either as generation inputs or in prompts.

**Agent-proposed rules that yield to the owner's latest instruction:**
- DESIGN_PROMPT_C §7 "no scanline sweep, no hologram flicker".
- DESIGN_PROMPT_C §3 "no colour split".

The bounded Blackwall vocabulary in §2 replaces them: ghosting in palette tones, and beads that travel along lines, never as a synchronised full-frame sweep or flicker.

**Overlaps the owner must confirm (§11):**
- Dot-matrix beads that live on lines, versus the earlier "no stray dots".
- Fine, evenly spaced vertical lines, versus "no strips".

**Shared by all three directions:**
1. **The same construction (§2).** A Blackwall-structured line field in the scene's own colours on a warm dark ground. The place appears in it as relief, condenses into coloured outlines, and settles into surface, nearest first.
2. **The coloured lines survive into the arrived frame** and help carry it. DESIGN_PROMPT_C §2.1 ended with no lines; here they persist, with tunable alpha. What sits between the lines is what differs between directions.
3. **Reference 3's ruled construction lines cross the whole frame** and stay faintly at arrival.
4. **Reference 2's small residue:** a few unsettled panes above the far roofs, identical in all three arrival prompts so it does not bias the choice.
5. **One shared content block (§3)** in every prompt, so the images differ only in material.
6. **Realism comes from light, geometry, depth and head-coupled parallax.** A drawing you can look around feels more like a place than a flat photograph.

## 1. The owner's five references

| # | What is there (as viewed) | What we take: structure, texture, material, motion | What we do not take | Where it shaped this document |
| --- | --- | --- | --- | --- |
| 1 | A real photograph of a utility pole against a white sky. Transformers, brackets, insulators and arms are painted flat saturated colours that keep their real shading; wires and sky stay grey and white; a "50" is on one transformer | Reality with a colour-tag layer: whole objects marked in flat matte colour over their real light and shade; crisp segmentation; untagged structure stays neutral | The saturated hues (Paris palette instead), the photograph itself, the number | Direction 2; the "not stock" diagnosis in §0 |
| 2 | Realistic farmland under cumulus. The middle of the cloud is replaced by translucent rectangular tiles and planes of different sizes and depths, some offset, with thin vertical lines dropping to the ground; the rest is intact | Partial assembly: one bounded region still assembling from translucent panes, anchored by vertical drop lines, inside an otherwise whole place | Blue sky colour; collage density; anything resembling the horizontal strips the owner rejected | The residue above the far roofs in all arrivals; the sky's assembly in phase E (§2.3) |
| 3 | An ink-and-watercolour sketch looking up at domed buildings: fast vertical hatching, loose grey and ochre wash, birds, and long straight ruled construction lines crossing the whole page through the sky | Ruled guides that run past the forms across the frame and stay in the finished picture; vertical ink hatching as shadow | The upward view, the domes (landmark-like), the birds (possible later idle life; §11) | Line rules (§2.1 of DESIGN_PROMPT_C, page-crossing guides); Direction 1's hatching |
| 4 | Blackwall (game image): a dark space; a wall of dense vertical red/magenta line-light with brighter bands; a figure made of line-light inside it; tiny silhouettes before it; starfield specks; a floor of light points | A curtain of vertical line-light with depth; a single figure made of line-light; the restraint of one form inside a field | Red and magenta; starfield specks; menace; the game's entity, framing and assets; broad vertical bands | §2; Direction 3; the woman as the line-light figure |
| 5 | Blackwall shader close-up: fine vertical striations on black, each line displaced by noise so the form appears in relief; brightness broken into dot-matrix beads; slight magenta chromatic ghosting | Striation as the way of rendering; noise displacement of lines; dot-matrix waveforms travelling through lines; ghost copies drifting into register | Magenta and RGB split; pure black (warm umber instead) | §2.1–2.4 (line-field shader); BW1 and VB1 |

The six earlier mood references and P1 still define the place's hand and calm. Reference 3 bridges them to references 1, 2, 4 and 5.

## 2. The construction ("loading animation"): Blackwall structure in Paris colours (all directions)

### 2.1 What the Blackwall gives as a construction language

1. **A vertical line field.** A curtain of fine, evenly spaced vertical lines of light fills the frame. It is the medium the place is built in.
2. **Striation as rendering.** Each line takes the colour and brightness of the scene behind it along its length, so forms exist only as the lines' modulation.
3. **Noise displacement.** Lines bend sideways where forms have edges (relief) and ripple with slow noise that calms as a region settles.
4. **Dot-matrix waveforms.** Short beads of brighter light, quantised into dots, travel up and down individual lines at their own speeds and phases: data moving through the wall.
5. **A figure of line-light.** The woman first exists as a camel figure inside the field. "Life is the threshold" (DESIGN_PROMPT §7.6) becomes her walking out of the light toward us.
6. **Ghosting that settles.** Each line carries one or two faint copies offset in neighbouring palette tones, not RGB. The copies are strongest far away and early, and converge to zero as a region locks.
7. **Condensation.** Lines at an object's contour pull into its coloured outline (the wireframe), then the lines inside widen and close into surface: light becoming matter.

### 2.2 What it must not bring

- No red or magenta (owner: "not colors"), and no full-frame red wash.
- No HUD, UI, readouts or game assets. No game names in prompts, and no screenshots as inputs.
- No horror: no faces in the field, no looming or distorted figures, no menace. The woman is calm and walks at an ordinary pace.
- No strips or bands of image, no broad vertical colour bands, and no full-frame flash, pulse or synchronised sweep. No starfield specks and no RGB split.
- No hologram blue and no Tron grid.

### 2.3 The minute on the A–G timeline (proposal)

| Phase | Time | Picture |
| --- | --- | --- |
| A Heard | 0–5 s | The Week 3 eye leans in; tracking boxes gather on the pupil. No field yet |
| B Clearing | 5–12 s | Windows glide aside. The eye's square dither cells stretch vertically into the first lines, and the curtain grows outward from the pupil over at least 3 s while the warm dark ground gathers behind it. Dim and still, with no beads yet. The eye moves to the vanishing point |
| C Survey | 12–22 s | Veil opaque at 12.0. The scene appears in the curtain as relief, nearest first: table rim and cup (12.8–15.0), then ashtray and chair, then the street. Beads begin to travel; ripples and ghosts are strongest far away. Ruled construction lines cross the field: the horizon leaves the pupil, then page-crossing perspective guides. Coloured outlines condense at each near object's contour. Registration frames lock on cup, ashtray and chair. The woman is a camel line-light figure from about 17 s. State at about 20 s ≈ **BW1** |
| D Near settle | 22–32 s | `stage.setFarField` under the veil. Near regions settle: ripples calm, ghosts converge, beads stop, lines widen and close into the direction's surface. In Directions 1 and 2, paper or the grey drawing opens locally around each settled region (a local ground lift); in Direction 3 the lines settle in place. Cup 22.6–24.2, table 23.2–26.0, ashtray 24.4–26.0, chair 25.6–28.4, first pavement strip 27.6–31.0. State at about 31 s ≈ **BW2** |
| E Street and light | 32–44 s | Pavement, façades, lamps and awning settle near to far, the mansard last. The sky above the roofs assembles from translucent panes with vertical drop lines (reference 2), leaving the small residue. Light arrives as the direction's light pass. Walkers start moving as line-light at about 36 s. Beads thin out |
| F Inhabiting | 44–54 s | The woman settles from line-light into the direction's material while walking (in Direction 3 she settles but stays line-light). Far walkers 47–50 s. No beads or ghosts after about 50 s except the residue |
| G Arrival | 54–60 s | The remaining field dissolves (Directions 1 and 2) or rests (Direction 3). The sky turns transparent onto the wallpaper. EVA's line at about 55 s |

**Departure:**
1. The place unsettles far-first back into line-light, with ripples and ghosts returning gently.
2. The field thins and the lines retract into the pupil, the horizon last.
3. The eye returns.

**Esc** restores immediately.

**Reduced motion** (about 15 s): stills crossfaded in 800 ms steps. Still field, then near settled, then street settled, then arrival. No beads, ripples or ghosts.

**Skip** (about 6 s): the field settles everywhere at 4× speed with no beads, to the identical end state.

### 2.4 Runtime: a line-field shader (proposed new section E of the renderer contract)

**Source.** The shader samples the chosen direction's master image: a new Weave-generated image recorded in `fixtures/assets/inventory.json` with a provider-terms note before runtime use (owner decision 2). Never P1, E0, A0 or RC1. In Directions 1 and 2 the same master, or its plates, is also what the settle reveals.

**Geometry.**
- Lines run vertically in world space, laid on each proxy surface (façade planes, pavement, cards).
- Pitch is fixed in screen pixels at the rest pose: proposal 7 px at 1080p, tunable 5–12.
- The curtain belongs to the place and gains parallax with the phase-C gain ramp (0 → 0.25).

**Per pixel.**
- Distance to the nearest line centre is taken after displacement `d = relief + noise(t) × A_region(t)`.
- Coverage uses analytic anti-aliasing (`fwidth`).
- Colour comes from the source. Brightness is source luminance × (floor + bead term). Width grows slightly with luminance, so lines are wider in the sun.

**Beads.**
- Per-line travelling packets with seeded speed (proposal 40–160 px/s, both directions) and phase.
- Quantised to 3–4 px vertical cells; duty cycle ≤ 30 %.
- Density is set per region and never synchronised across lines.

**Ghosts.**
- Two copies per line, offset ±g px. One is lighter and warmer, one deeper, both within the palette; alpha ≤ 0.3.
- g goes from about 4 px (far, early) to 0 at settle.

**Settle per region** (from the fixture schedule):
1. A, g and beads go to 0.
2. Line width goes to pitch over 0.6–1.0 s, so the lines close into surface.
3. A 0.4 s handover to the direction's material, with outlines (contract §A) drawn on top.

Per-region RNG streams and stable IDs follow contract §E.

**Ground.** Warm umber-dark (`#15110E` proposal). In Directions 1 and 2, paper or the grey drawing appears locally as regions settle, so mean luminance rises region by region with no flash.

**Tunables** (fixture bar): pitch, width, floor brightness, contrast cap, bead density, speed and duty, noise amplitude, scale and speed, ghost offset, tones and alpha, settle durations, ground.

**Determinism.** The same seed and time give byte-identical state arrays: line phases, A, g and settle progress.

**Fallback and performance.** Canvas2D shows the still stages only. One fragment pass per proxy; no measurement exists, and the frame-time distribution in contract H.7 is required.

**Changes versus RENDERER_CONTRACT_C:**
- Adds the line field before the reveal.
- Replaces §C's front, seam, settle and pre-sun parameters with the field settle.
- Retires the slips, since ghosting takes their role (owner question).
- Keeps registration frames, at most 4. They echo reference 2's panes and the owner's earlier "rectangle overlays as accents".
- Lines (§A) persist at arrival and are introduced by condensation from the field. Write heads remain for the ruled construction lines.
- Keeps the luminance limit: mean per-frame |ΔY| ≤ 2.0, no single step > 4.
- §B (fills) depends on the direction (§4–§6).

### 2.5 Comfort and accessibility

Fine, high-contrast parallel lines over large areas can be uncomfortable for some viewers, and travelling bright beads add temporal change. Proposals:
- Cap line contrast during construction (peak line luminance ≤ about 60 % of white before settle).
- Never pulse the whole field together.
- Keep large-area luminance change within the limit above, and below three flashes per second. The WCAG 2.3.1 threshold is used here as a design ceiling, not as a compliance claim.
- Keep pitch ≥ 5 px to limit moiré on the display.
- Check captures at the demo monitor's resolution.

Reduced motion removes beads, ripples and ghosts. In Direction 3 the field stays at arrival indefinitely, so the check matters most there.

### 2.6 What waits for the owner's video

These judgements wait for the clip:
- Line pitch and density, and whether lines are only vertical.
- Bead speed, direction and density.
- Ripple amplitude and tempo.
- How the ghosting behaves (echo or colour split) and how fast it settles.
- Whether the field has depth layers.
- Camera behaviour. Ours stays locked, with head-coupled parallax only.
- How a figure emerges, and how the clip ends (a settle or a cut).
- Pacing, and any sound sync.

The BW1 prompt and VB1 should be revised once the clip has been viewed. I recommend viewing it before VB1 is quoted, and ideally before BW1.

### 2.7 Red

The owner's clarification settles it: the images give aesthetics, not colours. The default is no red or magenta anywhere, and this document is built on that variant: Blackwall structure in Paris colours on a warm dark ground. The older open question stays open: EVA red for about 1 s on the first horizon line leaving the pupil (DESIGN_PROMPT_C §9 Q5; default none). Not asked for and not proposed: a red/magenta Blackwall veil as the construction field.

## 3. Shared wording blocks and period content

All prompts use P1 as image 1 (layout and hand), referred to as "this illustration". RC1 is not used as an input, because its photographic surfaces would leak into the result.

**Content block (verbatim in every arrival prompt):**

> The scene: a quiet, narrow side street in Paris, late afternoon in early autumn, in the mid-1980s, seen from a seat at an outdoor café table at seated adult eye height. At the bottom of the frame, the round white marble café table, its near edge crossing the bottom of the frame. On it, right of centre, the white porcelain cup of black coffee on its saucer, with a faint thread of steam; left of centre, the heavy pressed-glass ashtray with a little grey ash and a plain white cigarette resting in its notch, giving off one thin thread of smoke. At the left edge, close to us and cut off by the frame, the curved back of the empty honey rattan bistro chair with its diamond lattice. On the left, the limestone building with tall muted sage-green shutters, wrought-iron balcony rails and the plain faded terracotta canvas awning, with no lettering. On the right, the facing limestone building with the same shutters and balconies, and lace half-curtains in a few ground-floor windows. Closing the street, the limestone building with the grey zinc mansard roof and three dormers; its chimney stacks carry rows of terracotta chimney pots and a few thin television aerials. The crowned cast-iron lamp post right of the street's centre, and a smaller one farther back. Narrow asphalt pavements with granite kerbs, and a roadway of small worn cobbles between them. The street is lived-in, not restored: soot shadows under the cornices and sills, worn paint on the shutters, a chipped kerb.
>
> Exactly three people, ordinary and unposed, absorbed in their own afternoon, in everyday mid-1980s Parisian clothes. On the left pavement, a woman walks toward us at an easy pace: a long belted camel trench coat with broad padded shoulders, falling below the knee, dark leather boots, full chin-length dark brown hair, hands in her coat pockets; her head is bowed so that her face is hidden in shade beneath her hair, with no eyes, nose or mouth visible; she does not look at us. Farther down the street, near the lamp post, a man in a grey-brown wool jacket and pleated trousers walks away from us with a plain folded newspaper under his arm. A little ahead of him and to his left, where this illustration shows a faint doubled figure, one single young man in a short dark blouson jacket and straight jeans walks away from us, hands in his pockets.

**Construction-lines sentence (reference 3):**

> A few long, faint, ruled construction lines cross the whole picture, over the buildings and through the sky: the horizon at seated eye height and perspective lines running from the edges of the frame to the vanishing point at the end of the street, like guide lines left on an architect's page.

**Residue sentence (reference 2):**

> Above the far rooftops, a small part of the sky has not quite settled: a few translucent upright rectangular panes of the sky's own colour, of slightly different sizes and depths, a little out of register with the sky around them, with thin straight vertical lines dropping from them to the roofline. Everything else is complete.

**Shared exclusions:**

> any readable text, letters, numbers, house numbers, plaques, signs, logos, brand names, watermarks or signatures, and no print on the newspaper; smartphones, screens, cars, scooters, bicycles, satellite dishes, air-conditioning units, LED lights; landmarks; anyone looking at the viewer; doubled, ghosted, transparent or overlapping people; loose coloured dots or specks; interface, HUD, crosshairs, hexagons, glyphs, game or science-fiction styling; horizontal strips or bands, long horizontal panes; a red, magenta, orange or sepia tint over the picture; teal, coral, cyan, blue, purple, pink or neon colours.

**Period claims used here are my recollection and unverified**, to be checked under DESIGN_PROMPT §9 before final native assets:
- rooftop TV aerials were common in 1980s Paris;
- terracotta chimney pots sat on the stacks;
- side streets had asphalt pavements with granite kerbs and cobbled roadways;
- lace half-curtains hung in ground-floor windows;
- broad padded shoulders, belted trenches, pleated trousers and blouson jackets (already §9 hypotheses);
- stone was soot-darkened before cleaning.

The strongest period signals in a street (parked period cars, a moped, a kiosk, a Morris column, a tabac sign, posters) remain excluded by current rules; see §11.

## 4. Direction 1, Lavis: the architect's line-and-wash, carried to its peak

**4.1 Picture.**
- **Arrived:** P1's street, finished by a confident hand.
  - Thin coloured ink lines draw every edge, each a deeper shade of its own material; transparent watercolour sits inside them, with the paper left white for the brightest light.
  - Late sun from the left warms the left façade, the awning and the table. The right façade stands in a luminous warm-grey glaze.
  - Shadows are fine vertical ink hatching, the last trace of the construction's lines, under that glaze. Long cast shadows all fall the same way.
  - Finish falls with distance: the cup, ashtray, chair and woman are fully painted; the far mansard is mostly line. Page-crossing construction lines run faintly through the sky, a few panes over the far roofs have not quite settled, and the frame's edges open into unpainted paper.
- **Mid-construction (about 31 s):** the warm dark curtain still fills the far street, with slow ripples, warm ghosts and travelling beads. Near us it has settled: a patch of cream paper has opened around the table, and the cup, saucer, table and ashtray sit on it in wash inside coloured ink lines. At the edge of the paper, the curtain's lines turn into the ink hatching of the near shadows.

**4.2 The three complaints.**
- **Not a stock photo:** the hand is visible everywhere (line, wash, paper, selection), and things are left unpainted on purpose. This is the family of P1, reference 3 and all six mood references.
- **1980s Paris:** from content only (§3). The medium is not period-specific, so this is the weakest of the three on this complaint.
- **No photographic plates:** the fill is transparent watercolour wash: generated paintings, line-free, on white paper.

**4.3 Technological and realistic.**
- **Realism:** one sun and consistent cast shadows, reflected light in the shade, paler, cooler and finer with distance, deep focus, and parallax.
- **Technology:** the Blackwall construction, the persistent ruled lines and the residue panes.
- **Honest limit:** the arrived still is the least technological of the three. The technology lives in the minute and in the residue.
- **Guards:** lines coloured by material, never uniform black; no annotations or dimension lines.

**4.4 Runtime.**
- **Construction:** §2. The settle reveals paper and wash locally.
- **Fills:** line-free painted wash plates, generated later from the chosen master (street; tabletop; figures and occluders), on white paper.
  - They are projected onto the proxies (contract B.1) and composited as paper × wash inside vector mattes taken from the line polylines. No chroma key and no green spill.
  - A few pixels of misregistration read as a loose wash, which is the idiom of the medium. Proposed tolerance: 0.6 % of width instead of 0.3 %, still measured.
- **Hatching:** native fine vertical lines at the field's own pitch, masked by native shadow shapes, landing in phase E. The construction's lines become the shading.
- **Lines:** contract A, paper variant, persisting at about 0.7 alpha; construction guides at about 0.25.
- **Idle life:**
  - Painted walker cards with the Option A gait warp and a native outline on top (which hides card edges).
  - Steam and smoke as soft grey strokes.
  - The residue panes drift and re-register every 10–20 s (off in reduced motion).
- **Versus contract C:** plates are painted and multiplied, with no chroma; a new hatch layer; the ground lift is local; the pre-sun grade is replaced by the hatch-and-glaze landing.

**4.5 First run LV1 (arrival).**

Nano Banana 2.1 (`fal-ai/nano-banana-2/edit`). Image 1: P1. Settings: `model` "Nano Banana 2.1", `aspect_ratio` 16:9, `resolution` 2K, `output_format` png, `thinking_level` High, `enable_web_search` false, `seed` null. Expected output: one PNG of about 2752×1536. Today's reported price is about 5 credits; this is not a quote.

```text
Keep this illustration's composition exactly: the same viewpoint and framing, the same horizon height and vanishing point, and the same position, size and outline of every building, object and person. Keep its hand and its warm paper, and carry it further: more confident, more complete and more lit. Remove every small coloured dot scattered across it.

The scene: a quiet, narrow side street in Paris, late afternoon in early autumn, in the mid-1980s, seen from a seat at an outdoor café table at seated adult eye height. At the bottom of the frame, the round white marble café table, its near edge crossing the bottom of the frame. On it, right of centre, the white porcelain cup of black coffee on its saucer, with a faint thread of steam; left of centre, the heavy pressed-glass ashtray with a little grey ash and a plain white cigarette resting in its notch, giving off one thin thread of smoke. At the left edge, close to us and cut off by the frame, the curved back of the empty honey rattan bistro chair with its diamond lattice. On the left, the limestone building with tall muted sage-green shutters, wrought-iron balcony rails and the plain faded terracotta canvas awning, with no lettering. On the right, the facing limestone building with the same shutters and balconies, and lace half-curtains in a few ground-floor windows. Closing the street, the limestone building with the grey zinc mansard roof and three dormers; its chimney stacks carry rows of terracotta chimney pots and a few thin television aerials. The crowned cast-iron lamp post right of the street's centre, and a smaller one farther back. Narrow asphalt pavements with granite kerbs, and a roadway of small worn cobbles between them. The street is lived-in, not restored: soot shadows under the cornices and sills, worn paint on the shutters, a chipped kerb.

Exactly three people, ordinary and unposed, absorbed in their own afternoon, in everyday mid-1980s Parisian clothes. On the left pavement, a woman walks toward us at an easy pace: a long belted camel trench coat with broad padded shoulders, falling below the knee, dark leather boots, full chin-length dark brown hair, hands in her coat pockets; her head is bowed so that her face is hidden in shade beneath her hair, with no eyes, nose or mouth visible; she does not look at us. Farther down the street, near the lamp post, a man in a grey-brown wool jacket and pleated trousers walks away from us with a plain folded newspaper under his arm. A little ahead of him and to his left, where this illustration shows a faint doubled figure, one single young man in a short dark blouson jacket and straight jeans walks away from us, hands in his pockets.

Render it as a finished perspective drawing in coloured ink line and transparent watercolour on warm off-white paper. Lines: thin and precise, ruled where the form is straight, each line in a deeper shade of the material it outlines: the table, cup, saucer and ashtray in warm grey; the rattan in deep honey; the woman's coat in dark camel; the shutters in deep sage; the lamp posts and balcony rails in near-black iron; the limestone in warm stone-brown; the roof in zinc grey; the awning and chimney pots in terracotta-brown. Lines grow finer and paler with distance and overshoot the corners of the buildings by a hair. The lines stay visible everywhere in the finished picture. A few long, faint, ruled construction lines cross the whole picture, over the buildings and through the sky: the horizon at seated eye height and perspective lines running from the edges of the frame to the vanishing point at the end of the street, like guide lines left on an architect's page. Colour: transparent watercolour washes inside the lines, with the white of the paper left as the brightest light; soft granulation; slightly darker pooling at the edges of washes; here and there a wash sits a little loose of its line. Shadows are built from fine, fast vertical ink hatching under a transparent warm-grey glaze, never from dots. Light: a low warm sun from the left falls on the left façade, the awning and the table; the right façade stands in luminous shade with warm reflected light inside it; long cast shadows from the people, the lamp posts, the chair, the cup and the ashtray lie across the pavement, the cobbles and the marble, all falling the same way. Finish falls with distance: the table, cup, ashtray, chair and woman fully painted; the façades lighter; the far building mostly line with a pale wash; the sky unpainted paper with a faint warm wash above the rooftops; the outer edges of the picture fade softly into unpainted paper. Above the far rooftops, a small part of the sky has not quite settled: a few translucent upright rectangular panes of the sky's own colour, of slightly different sizes and depths, a little out of register with the sky around them, with thin straight vertical lines dropping from them to the roofline. Everything else is complete.

Colours only from: warm off-white paper, cream limestone, café crème, espresso, honey rattan, zinc grey, muted sage green, near-black iron, white marble and porcelain, camel, warm grey, and one faded terracotta.

Exclude: photographic texture, photorealism, smooth digital airbrush, glossy 3D rendering, black outlines, stippling; any readable text, letters, numbers, house numbers, plaques, signs, logos, brand names, watermarks or signatures, and no print on the newspaper; smartphones, screens, cars, scooters, bicycles, satellite dishes, air-conditioning units, LED lights; landmarks; anyone looking at the viewer; doubled, ghosted, transparent or overlapping people; loose coloured dots or specks; interface, HUD, crosshairs, hexagons, glyphs, game or science-fiction styling; horizontal strips or bands, long horizontal panes; a red, magenta, orange or sepia tint over the picture; teal, coral, cyan, blue, purple, pink or neon colours.
```

**Inspect** (shared checks first, then specific).

*Shared checks, for LV1, TG1 and LL1:*
1. **Layout:** a 50 % overlay on P1. The anchors hold within about 2 % of frame size: horizon about 0.545; cup about (0.70, 0.84); ashtray about (0.33, 0.89); woman's feet about (0.366, 0.745); near lamp base about (0.576, 0.625); mansard x 0.46–0.61; chair hoop cut by the left edge.
2. **People:**
   - exactly three;
   - the woman toward us with her face hidden. Check at 1:1 on the 2K file: RC1's face was readable only at 2K. Hands in pockets;
   - two far walkers turned away, with no ghost figure.
3. **Text:** zoom on the awning, doors (house numbers were RC1's defect), windows, newspaper and chimneys.
4. **Palette:** no loose dots (P1's defect). Run the step-1 Paris-hue probe and report the percentage outside the guard.
5. **Period cues:** chimney pots and aerials present and few; cobbles read as cobbles, not a grid; the wardrobe reads mid-1980s; wear is present but not grimy.
6. **Residue:** small and upright, not a band.
7. **Stock and thumbnail test:** at 400 px beside P1 and RC1, does it read as P1's afternoon? Does it look like stock or generic AI art?
8. **Exclusions:** no HUD, strips, tint or vehicles.
9. **Record:** run ID, quote and reported cost, settings and sha256 in provenance.json.

*Specific to LV1:*
- Is it clearly *more* than P1? A near-identical result answers nothing.
- Lines coloured by material and visible everywhere.
- Shadows hatched, not stippled.
- Edges fade to paper.

**4.6 Risks and drop criteria.**
- **Risks:**
  - It may come back too close to P1.
  - The owner may feel it steps back from "technological".
  - The tonal reversal from the dark field to paper must stay slow and local.
  - Line-free wash plates may not register (test later).
  - The period read is weakest here.
- **Drop if** the owner says the arrived city itself must feel technological, or if LV1 is indistinguishable from P1 at thumbnail.

## 5. Direction 2, Tagged: true light in a grey drawing, things marked in their own colours (my recommendation)

**5.1 Picture.**
- **Arrived:** the street as a fine monochrome drawing in warm greys, exact in perspective and true in its late light: sun on the left façade and table, reflected light inside the shade, long shadows, the far end softened by air.
  - On this drawing, things are tagged. Each is painted in one flat, clean, matte colour that keeps the light and shade beneath it, with crisp edges that follow the object exactly, as if the place had been read and each object identified.
  - Tagged: the cup porcelain white, the chair honey, the coat camel, the shutters sage, the awning and chimney pots terracotta, the lamps and rails iron.
  - The limestone, cobbles, marble, glass and sky stay untagged in grey, the way reference 1 leaves wires and sky alone.
  - Coloured outlines edge each tag. Page-crossing guides run faintly, and a few sky panes over the roofs have not settled.
- **Mid-construction (about 31 s):** near us the curtain has settled into the grey drawing on a patch of opening paper. The cup's porcelain tag has just snapped in from its outline inward, and the chair's honey tag is flooding along its strands under a registration frame. Everything beyond the first pavement strip is still warm line-light, with the woman a camel figure inside it.

**5.2 The three complaints.**
- **Not a stock photo:** reality is visibly worked on, which is reference 1's logic. A camera cannot produce it, but it stays true in light and form.
- **1980s Paris:** from content (§3), with the 1980s things (the coat, the jackets, the chimney pots) singled out by the tags. The medium is not period-specific.
- **No photographic plates:** the only generated pixels at runtime are a *monochrome drawing* (value only). All colour is native flat tags.

**5.3 Technological and realistic.**
- **Realism:** carried entirely by value (light, shadow, depth) in the grey drawing.
- **Technology:** identification and marking (segmentation made beautiful), the coloured outlines, the construction and the residue.
- **Guards:**
  - Tags are material colours, never code colours.
  - No labels, boxes or IDs.
  - Tags complete and exact, so it never reads as an unfinished colouring book.

**5.4 Runtime.**
- **The value master:** one generated monochrome master, later split into monochrome street, tabletop and figure plates on white, composited multiply with vector mattes. A greyscale plate is easier to register and inspect.
- **Tags:** native vector regions taken from the same polylines as the wireframe (one source of truth).
  - Filled with a flat palette colour; luminance comes from the value plate, either multiply or a luminance-preserving colour blend. One is chosen and documented.
  - Resolution-independent and directly testable by the palette guard.
- **Follow-ups:** rain and evening (planning §7) can re-grade the value plate and re-colour the tags natively.
- **Construction:** the field settles into the grey drawing. Each tag arrives as a discrete event, nearest first, flooding its region from the outline inward in 250–400 ms with a crisp front, under a registration frame.
- **Idle life:** grey walker cards with native tags and outlines and the Option A gait; grey steam and smoke threads; the residue.
- **Versus contract C:**
  - §B becomes a value-plate renderer plus a tag renderer.
  - A tag fixture schema that rejects unknown fields.
  - A palette test on tag colours.

**5.5 First run TG1 (arrival).** Same model and settings as LV1; image 1: P1; about 5 credits, not a quote.

```text
Keep this illustration's composition exactly: the same viewpoint and framing, the same horizon height and vanishing point, and the same position, size and outline of every building, object and person. Change how it is rendered, and remove every small coloured dot scattered across it.

The scene: a quiet, narrow side street in Paris, late afternoon in early autumn, in the mid-1980s, seen from a seat at an outdoor café table at seated adult eye height. At the bottom of the frame, the round white marble café table, its near edge crossing the bottom of the frame. On it, right of centre, the white porcelain cup of black coffee on its saucer, with a faint thread of steam; left of centre, the heavy pressed-glass ashtray with a little grey ash and a plain white cigarette resting in its notch, giving off one thin thread of smoke. At the left edge, close to us and cut off by the frame, the curved back of the empty honey rattan bistro chair with its diamond lattice. On the left, the limestone building with tall muted sage-green shutters, wrought-iron balcony rails and the plain faded terracotta canvas awning, with no lettering. On the right, the facing limestone building with the same shutters and balconies, and lace half-curtains in a few ground-floor windows. Closing the street, the limestone building with the grey zinc mansard roof and three dormers; its chimney stacks carry rows of terracotta chimney pots and a few thin television aerials. The crowned cast-iron lamp post right of the street's centre, and a smaller one farther back. Narrow asphalt pavements with granite kerbs, and a roadway of small worn cobbles between them. The street is lived-in, not restored: soot shadows under the cornices and sills, worn paint on the shutters, a chipped kerb.

Exactly three people, ordinary and unposed, absorbed in their own afternoon, in everyday mid-1980s Parisian clothes. On the left pavement, a woman walks toward us at an easy pace: a long belted camel trench coat with broad padded shoulders, falling below the knee, dark leather boots, full chin-length dark brown hair, hands in her coat pockets; her head is bowed so that her face is hidden in shade beneath her hair, with no eyes, nose or mouth visible; she does not look at us. Farther down the street, near the lamp post, a man in a grey-brown wool jacket and pleated trousers walks away from us with a plain folded newspaper under his arm. A little ahead of him and to his left, where this illustration shows a faint doubled figure, one single young man in a short dark blouson jacket and straight jeans walks away from us, hands in his pockets.

Render it in two layers. First, the whole street as a realistic, finely made monochrome picture in warm greys on warm off-white paper, in precise ink line and graded grey wash, exact in perspective and true in its late-afternoon light: a low warm sun from the left on the left façade, the awning and the table; the right façade in soft shade with reflected light inside it; long cast shadows all falling the same way; the far end of the street softened by air. Real light and depth, but no photographic texture: stone, marble and cobbles are described by light and a few lines, not by grain. Second, a layer of colour tags: some things are painted in one flat, clean, matte colour each that keeps the light and shade of the monochrome picture beneath it, with crisp edges that follow each object exactly, as if each object had been identified and marked: the cup and saucer in porcelain white with espresso inside; the rattan chair in honey; the woman's coat in camel, her boots and hair in dark brown; every shutter in muted sage green; the awning and the chimney pots in faded terracotta; the lamp posts and balcony rails in near-black iron; the man's jacket in grey-brown; the young man's jacket in dark brown-grey. The limestone, the pavements, the cobbles, the table's marble, the glass ashtray and the sky are not tagged: they stay in the warm grey picture. Thin coloured lines trace the edges of every tagged object in a deeper shade of its tag colour; the untagged architecture keeps fine warm-grey lines. A few long, faint, ruled construction lines cross the whole picture, over the buildings and through the sky: the horizon at seated eye height and perspective lines running from the edges of the frame to the vanishing point at the end of the street, like guide lines left on an architect's page. Above the far rooftops, a small part of the sky has not quite settled: a few translucent upright rectangular panes of the sky's own colour, of slightly different sizes and depths, a little out of register with the sky around them, with thin straight vertical lines dropping from them to the roofline. Everything else is complete.

Colours only from: warm greys and warm off-white for everything untagged; for the tags only porcelain white, espresso, honey, camel, dark brown, muted sage green, faded terracotta, near-black iron, grey-brown and dark brown-grey.

Exclude: photographic texture, photorealism, a black-and-white photograph look, 3D render or CGI look, glossy surfaces, texture or gradients inside the tags other than the light and shade beneath them, black outlines, labels or boxes on objects; any readable text, letters, numbers, house numbers, plaques, signs, logos, brand names, watermarks or signatures, and no print on the newspaper; smartphones, screens, cars, scooters, bicycles, satellite dishes, air-conditioning units, LED lights; landmarks; anyone looking at the viewer; doubled, ghosted, transparent or overlapping people; loose coloured dots or specks; interface, HUD, crosshairs, hexagons, glyphs, game or science-fiction styling; horizontal strips or bands, long horizontal panes; a red, magenta, orange or sepia tint over the picture; teal, coral, cyan, blue, purple, pink or neon colours.
```

**Inspect:** the shared checks (§4.5), then:
- Tags are flat, exact to their objects, and keep the light beneath them.
- Untagged areas are truly grey.
- The grey layer reads as a drawing, not as a black-and-white photograph. A photograph look fails "no photographic surfaces".
- Does it look finished rather than half-coloured?

**5.6 Risks and drop criteria.**
- **Risks:**
  - The grey layer may drift toward a black-and-white photograph (stock again).
  - Muted tags may not read as tags.
  - The model may tag everything or nothing.
  - The result may feel cool or diagrammatic.
- **Drop if** TG1 reads as an old photograph, a colouring book, or "unfinished", and one targeted fix (about 5 credits) does not cure it.

## 6. Direction 3, Line-light: Paris made of the construction's own light

**6.1 Picture.**
- **Arrived:** the whole street is a dense curtain of fine vertical lines of warm light on warm umber-dark, settled and in register.
  - Along each line, colour and brightness reproduce the afternoon: sun on the left façade and awning, luminous shade on the right, the white cup and marble, the honey chair, the camel coat.
  - Forms are drawn by the lines bending a hair at their edges, and coloured outlines lie on top.
  - The sky above the roofs is a smooth pale warm glow without lines. A few unsettled panes hang over the roofs.
  - Beads rest on a few lines in the far street. The woman is a settled figure of camel line-light walking toward us, her face indistinct.
- **Mid-construction:** the same curtain unsettled, with ripples, warm ghosts and travelling beads everywhere. Only the cup and table rim have pressed together into calm lines.

**6.2 The three complaints.**
- **Not a stock photo:** nothing photographic exists in it at all. The image *is* the technology, and the aesthetic is light.
- **1980s Paris:** from content (§3). As a design hypothesis, a fine line raster could also nod to 1980s display technology (CRT phosphor, the Minitel era) rather than to the future. The opposite risk is that it reads as 2077.
- **No photographic plates:** the fill is lines. The coloured lines carry everything.

**6.3 Technological and realistic.**
- **Realism:** the distribution of light, sampled from a painted master, plus parallax.
- **Technology:** at its maximum of the three.
- **Guards:** warm palette only, no glow haze, no bands, a calm settled field, and the comfort limits in §2.5.

**6.4 Runtime.**
- **The field shader (§2.4) is the arrival renderer.** A generated painted colour master is sampled and never displayed.
- **At arrival:** settled parameters (A = 0, g = 0) with beads on a few far lines only. The sky above the roofs is a smooth gradient without lines, so the wallpaper seam stays low-frequency (planning §6.4); static wallpaper lines would show moiré against moving foreground lines.
- **Walkers:** line-light cards sampled from walker sprites through the same shader, with the gait warp applied before sampling.
- **Idle life:** slow bead drift; a soft ripple passing through the far street every 15–30 s; the residue.
- **Versus contract C:**
  - No displayed plates; §B shrinks to texture sampling.
  - Glow stays on.
  - The ground stays dark at arrival.
  - The comfort check (§2.5) becomes a release condition.

**6.5 First run LL1 (arrival).** Same model and settings as LV1; image 1: P1; about 5 credits, not a quote.

```text
Keep this illustration's composition exactly: the same viewpoint and framing, the same horizon height and vanishing point, and the same position, size and outline of every building, object and person. Change how it is made completely, and remove every small coloured dot scattered across it.

The scene: a quiet, narrow side street in Paris, late afternoon in early autumn, in the mid-1980s, seen from a seat at an outdoor café table at seated adult eye height. At the bottom of the frame, the round white marble café table, its near edge crossing the bottom of the frame. On it, right of centre, the white porcelain cup of black coffee on its saucer, with a faint thread of steam; left of centre, the heavy pressed-glass ashtray with a little grey ash and a plain white cigarette resting in its notch, giving off one thin thread of smoke. At the left edge, close to us and cut off by the frame, the curved back of the empty honey rattan bistro chair with its diamond lattice. On the left, the limestone building with tall muted sage-green shutters, wrought-iron balcony rails and the plain faded terracotta canvas awning, with no lettering. On the right, the facing limestone building with the same shutters and balconies, and lace half-curtains in a few ground-floor windows. Closing the street, the limestone building with the grey zinc mansard roof and three dormers; its chimney stacks carry rows of terracotta chimney pots and a few thin television aerials. The crowned cast-iron lamp post right of the street's centre, and a smaller one farther back. Narrow asphalt pavements with granite kerbs, and a roadway of small worn cobbles between them. The street is lived-in, not restored: soot shadows under the cornices and sills, worn paint on the shutters, a chipped kerb.

Exactly three people, ordinary and unposed, absorbed in their own afternoon, in everyday mid-1980s Parisian clothes. On the left pavement, a woman walks toward us at an easy pace: a long belted camel trench coat with broad padded shoulders, falling below the knee, dark leather boots, full chin-length dark brown hair, hands in her coat pockets; her head is bowed so that her face is hidden in shade beneath her hair, with no eyes, nose or mouth visible; she does not look at us. Farther down the street, near the lamp post, a man in a grey-brown wool jacket and pleated trousers walks away from us with a plain folded newspaper under his arm. A little ahead of him and to his left, where this illustration shows a faint doubled figure, one single young man in a short dark blouson jacket and straight jeans walks away from us, hands in his pockets.

Render the whole picture as light drawn in lines on a deep warm umber-dark ground, never pure black and never blue. Everything below the rooftops is a dense, even curtain of very fine vertical lines of light, close together. Along its length, each line takes the colour and brightness of the scene behind it, so that from a distance the curtain shows the whole late-afternoon street: warm sun on the left façade and the awning, luminous shade on the right, the white cup and marble table, the honey chair, the camel coat, the sage shutters, the terracotta chimney pots. Where a form has an edge or a curve, the lines bend sideways by a hair, so every form is drawn in relief by the lines themselves; in shadow the lines are dim, in sunlight bright and slightly wider. Over the curtain, thin precise outlines in each material's colour trace the main edges. The sky above the rooftops is a smooth, pale, warm glow with no lines, the brightest part of the picture. A few long, faint, ruled construction lines cross the whole picture: the horizon at seated eye height and perspective lines running from the edges of the frame to the vanishing point at the end of the street. The curtain is settled and calm: every line is single and in register; only on a few lines in the far street do short beads of brighter light rest, like the dots of a dot-matrix display. The woman is made of the same lines, a figure of warm camel line-light walking toward us, her face indistinct beneath her hair. Above the far rooftops, a few translucent upright rectangular panes of pale sky light have not quite settled, a little out of register, with thin straight vertical lines dropping from them to the roofline. Everything else is complete.

Colours only from: deep warm umber-dark ground, pale warm sky light, cream limestone, café crème, honey, camel, muted sage green, faded terracotta, zinc grey and porcelain white.

Exclude: any paint, wash or photographic surface; solid filled areas below the rooftops; broad vertical bands of colour; horizontal lines other than the few construction lines; glow haze, bloom, lens flare, light rays, sparkles, stars, starfield; scanline flicker, glitch blocks, colour fringes; faces in the light, horror; any readable text, letters, numbers, house numbers, plaques, signs, logos, brand names, watermarks or signatures, and no print on the newspaper; smartphones, screens, cars, scooters, bicycles, satellite dishes, air-conditioning units, LED lights; landmarks; anyone looking at the viewer; doubled, ghosted, transparent or overlapping people; loose coloured dots or specks; interface, HUD, crosshairs, hexagons, glyphs, game or science-fiction styling; horizontal strips or bands, long horizontal panes; a red, magenta, orange or sepia tint over the picture; teal, coral, cyan, blue, purple, pink or neon colours.
```

**Inspect:** the shared checks (§4.5), then:
- The ground is warm, not black or blue (sample it).
- Lines are fine and even, with no bands.
- Small objects stay legible at 1080p: the cup must read through about 30 lines.
- The sky has no lines.
- Does it feel like an afternoon, or like a display?
- Is there any cyberpunk or hologram read?
- Mean luminance, for the wallpaper decision.

**6.6 Risks and drop criteria.**
- **Risks:**
  - It may feel like seeing a display of Paris rather than being in Paris.
  - It sits far from P1.
  - Moiré and aliasing on the monitor and under parallax.
  - Pattern discomfort over an indefinite arrival.
  - A cyberpunk read despite the palette.
- **Drop if** LL1 reads as sci-fi, or if the owner wants the calm high-key P1 afternoon at arrival. The field remains the construction in Directions 1 and 2 either way.

## 7. Construction runs (shared): BW1, BW2 and VB1

**Which directions need a video to judge.**
- The construction does, for every direction; the owner's motion brief is about it. VB1 is that study.
- Direction 3's arrival also needs motion (idle beads and ripples). VB1 covers it if BW2 uses LL1.
- Directions 1 and 2 can be judged from stills at arrival.

**BW1, construction still (about 20 s).** Image 1: P1. Settings as LV1. About 5 credits, not a quote. Revise after the owner's clip if it differs.

```text
Keep this illustration's composition exactly: the same viewpoint, framing, horizon and vanishing point, and the same position, size and outline of every building, object and person. Show it as a moment in the middle of its own construction, on a deep warm umber-dark ground, never pure black and never blue.

The scene is a quiet Paris side street in the mid-1980s seen from a café table: the marble table at the bottom with the cup and saucer on the right and the glass ashtray with its cigarette on the left, the rattan chair cut by the left edge, the limestone façades with shutters and balconies on both sides, the terracotta awning on the left, the two lamp posts, and the mansard building with chimney pots closing the street. Exactly three people: the woman walking toward us on the left pavement, and near the lamp post a man with a newspaper and one young man, both walking away.

The whole frame is a dense curtain of fine vertical lines of soft light, evenly spaced, like a wall made of light. The scene exists only inside this curtain. Where the forms are, the lines bend sideways, thicken and brighten to describe them in relief, and take on the colours of their materials: porcelain white for the cup, saucer and table rim; honey for the chair; camel for the woman; sage green for the shutters; faded terracotta for the awning and chimney pots; cream for the limestone; zinc grey for the roof and the lamp posts. Between the forms the lines are dim. Near us the forms are clearest: around the cup, the saucer and the table rim the lines are pressed close together and almost solid. Farther away the lines ripple in slow, uneven waves, and each line carries one or two faint copies of itself in a neighbouring warm tone, slightly out of register; the copies are strongest at the end of the street and almost gone around the table. On many lines, short beads of brighter light sit at different heights, like the dots of a dot-matrix waveform. The woman walking toward us is a figure made entirely of vertical line-light in camel tones, her face indistinct. A few thin, straight, ruled construction lines cross the curtain: the horizon at seated eye height and perspective lines from the edges of the frame to the vanishing point at the end of the street. Thin coloured outlines are beginning to form along the edges of the cup, the saucer, the ashtray and the table rim. The copies belong to the lines only: each person appears once.

Colours only from: deep warm umber-dark ground, cream, porcelain white, honey, camel, muted sage green, faded terracotta and zinc grey.

Exclude: red, magenta, pink, purple, cyan, blue or neon light; colour fringes in red, green or blue; broad vertical bands; horizontal strips or bands; glow haze, bloom, lens flare, light rays, starfield, loose specks; any bright full-frame glow; any readable text, letters, numbers, logos or watermark; interface, HUD, crosshairs, hexagons, glyphs, game or science-fiction styling; horror, faces in the light, distorted or melting people; doubled or extra people; anyone looking at the viewer; cars, smartphones, landmarks.
```

**Inspect BW1:**
- Palette: the model may drift to red or magenta because of the subject; sample it.
- Lines fine and even, with no bands.
- Ghosts in warm tones, not RGB.
- Forms legible near and dissolving far.
- The woman is line-light, with her face hidden.
- No horror.
- Overlay anchors.
- Owner judgement: does it carry the feel of their clip in Paris colours?

**BW2, near settled (about 31 s).** Run only after the direction is chosen. Image 1: BW1; image 2: the chosen arrival (LV1, TG1 or LL1). About 5 credits.

```text
Image 1 is a moment in the construction of a scene; image 2 is the finished scene, in exactly the same positions. Show the moment a few seconds after image 1: near us the construction has settled. The marble table, the cup and saucer, the ashtray with its cigarette and the rattan chair are now complete exactly as in image 2, with their thin coloured outlines, and the first strip of pavement beyond the table has settled too. At the edge of the settled area the curtain has calmed: its copies have merged into single lines, and its lines have widened and closed into surface, like light condensing. Everything farther away is still as in image 1: the curtain of vertical line-light with its slow ripples, its faint offset copies and its travelling beads; the woman still a figure of camel line-light. No steam or smoke yet. Each person appears once.

Exclude: red, magenta, pink, purple, cyan, blue or neon light; colour fringes; broad vertical bands; horizontal strips or bands; glow haze, bloom, lens flare, starfield, loose specks; any readable text, letters, numbers, logos or watermark; interface, HUD, hexagons, glyphs, game or science-fiction styling; horror, faces in the light; doubled or extra people; anyone looking at the viewer.
```

**VB1, video study (5 s).** Kling First & Last Frame (`85caf705-a459-48dd-96cd-953a04b4c08e`), model O1 Pro, `duration` 5, `cfg_scale` 0.5 (V5's value; verify). `image`: BW1; `tail_image_url`: BW2. Previously quoted at 55 credits; this is not a quote for this job. Quote it only after the owner's clip has been viewed.

```text
Locked-off camera; nothing moves except the light. A curtain of fine vertical lines of warm light fills the frame, and the café scene exists inside it. Short beads of brighter light, like a dot-matrix waveform, travel up and down individual lines at different speeds and heights, never all together. The lines ripple sideways in slow, soft, uneven waves, and each line's faint offset copies drift toward it and merge. Starting at the cup at the bottom of the frame and moving outward, the ripples calm, the copies converge into single lines, the beads stop, and the lines widen and close into solid surface: first the cup and saucer, then the marble table, the ashtray and the cigarette, then the rattan chair, then the first strip of pavement. Farther away the curtain keeps its slow life, and the woman, a figure made of warm camel line-light, takes two slow steps toward us. Warm colours only: cream, honey, camel, sage, terracotta, zinc grey, porcelain white on a deep warm umber-dark ground. Calm, continuous, unhurried.
```

`negative_prompt`:

```text
camera movement, zoom, pan, tilt, cuts, whole-frame flash, strobe, flicker of the whole frame, brightness jumps, synchronized sweep, horizontal strips, bands, smear, glitch blocks, red, magenta, pink, purple, cyan, blue, neon, colour fringes, starfield, loose specks, text, numbers, logos, HUD, interface, hexagons, faces, horror, morphing people, extra people, doubled people, people facing the camera
```

**Inspect VB1:**
- Frame sheets at 3 fps and a 12 fps burst.
- Per-frame luma difference (mean and max, as for V5). The result should stay within the §2.4 limit, with no frames above it.
- Palette on every sheet frame.
- Beads are independent rather than synced; ripples calm near-first; ghosts converge.
- No strips and no wash.
- Treat it as a feel reference against the owner's clip; the native shader stays authoritative.

**Option VB0.** BW1 as both first and last frame, to judge the field's life before choosing a direction. Same prompt minus the settle sentence; about 55 credits. Whether Kling accepts identical first and last frames is unverified.

## 8. Recommendation

My recommendation is **Direction 2, Tagged**. This is a judgement made before seeing any output.
- It is the only direction whose arrival carries references 1, 2 and 3 together, in daylight, with P1's composition and palette.
- It makes the technology visible in the place itself, not only in the loading.
- It answers "the coloured lines (and perhaps a painted or stylised fill) should carry it": coloured lines plus flat stylised tags.
- It pairs naturally with the Blackwall construction: the striation settles into the grey drawing, then tags snap in.
- It has the lowest runtime risk: the only generated pixels at runtime are greyscale; colour is native and testable; and the rain and evening follow-ups can be done natively.

The other two:
- **Direction 1 (Lavis)** is the safe choice if, after seeing TG1, the owner wants P1 itself, finished, at arrival.
- **Direction 3 (Line-light)** is the choice if the owner wants the Blackwall material to remain the city.

All three images are cheap next to building the wrong direction, so I recommend running them together.

## 9. Comparison

| | 1 Lavis | 2 Tagged (recommended) | 3 Line-light |
| --- | --- | --- | --- |
| Arrived city | P1 at its peak: coloured ink and wash, hatched shadows | Grey drawing true in light; objects colour-tagged; coloured outlines | Paris as warm line-light on warm dark; smooth bright sky |
| Fill material | Transparent painted wash | Flat matte tags over drawn value | Lines only |
| Generated pixels at runtime | Painted, line-free wash plates | One monochrome value master (or its plates) | A painted master, sampled and never shown |
| Lines at arrival | Yes, about 0.7, plus faint guides | Yes, on tags; grey on architecture | Yes; the image is lines |
| Owner references carried | 3, the six moods, P1 (2 as residue) | 1, 3, 2 | 4, 5, 2 |
| Not-stock mechanism | Visible hand | Reality visibly identified and marked | No photographic element |
| 1980s source | Content | Content, singled out by tags | Content (and a possible raster-era nod) |
| Technological at arrival | Low (residue, guides) | Medium-high | Highest |
| Closeness to P1 | Highest | High in composition and palette | Low in material |
| Main risk | Too close to P1 | Black-and-white photograph or colouring-book read | Display read, comfort, moiré |
| 4K demo monitor | Plates upsample (soft) | Tags crisp; value plate soft-tolerant | Shader native; master soft-tolerant |
| Wallpaper seam | Paper: easy | Paper or grey: easy | Needs a line-free sky (specified) |
| First run | LV1, about 5 | TG1, about 5 | LL1, about 5 |

## 10. Smallest run set (estimates at today's reported 5 credits per image; each run quoted separately)

- **Batch 1** (one multi-select approval, per the owner's preference): LV1, TG1, LL1 and BW1. About 20 credits.
  - If the owner prefers to see the clip first: LV1, TG1 and LL1 only (about 15), with BW1 later.
- **Batch 2** (after the direction choice and after the clip has been viewed): BW2 (about 5) and VB1 (about 55 if the earlier quote holds). About 60 credits.
- **Comparison sheet:** P1 | LV1 | TG1 | LL1 at 400 px and full size, with the seven anchor crops, using the main session's scripts.
- **Survey jobs:** the earlier WC1-D and WC1-P survey jobs are superseded by BW1 unless the owner still wants a paper-ground construction compared (§11).

## 11. Owner questions (I cannot decide these)

1. **City direction** after the three images: Lavis, Tagged or Line-light?
2. **Construction ground:** warm dark for the line field (proposal), or do you still want a paper-ground construction compared, as chosen earlier ("Both grounds")?
3. **EVA red:** none (default), or the first horizon line leaving the pupil in red for about 1 s? (A red veil was not asked for and is not proposed.)
4. **Dot-matrix beads:** you excluded stray dots earlier. May beads that live on the lines, as in reference 5, appear during construction? Loose specks stay excluded.
5. **Fine vertical lines versus "no strips":** confirm that thin, even line fields are acceptable and that only bands of image are excluded.
6. **Ghosting:** offset copies in neighbouring warm tones (default), or something closer to the clip if it shows a colour split?
7. **Residue at arrival** (reference 2): none, small above the far roofs (proposal, in all three images), or larger?
8. **Lines at arrival:** keep them as part of the picture (proposal), or let them withdraw?
9. **Generated images at runtime:** do painted or monochrome generated images still fall within "new generated images may be runtime plates", given "Realistic plates are the wrong idea"?
10. **Owner references as Weave inputs:** words only (default). References 4 and 5 never, being game imagery. References 1–3 only with your approval and a recorded upload.
11. **Period cues** currently excluded: may any enter, such as badge-free period cars, a parked moped, a kiosk, a Morris column, a tabac sign or posters? All except the vehicles carry text.
12. **Shutters:** keep P1's sage wooden shutters, or test grey folding metal shutters? My unverified recollection is that these are more typical of Paris apartment buildings.
13. **Birds** (reference 3) as later idle life: yes or no?
14. **Your video:** which of its qualities define the feel? Pitch, speed, ghosting, the figure, the ending.
15. **Budget:** Batch 1 now (about 20 credits estimated), or only the three arrival images (about 15)?

## 12. Considered and not proposed

- **Ligne claire (clear line and flat print colour).** It carried the 1980s through the medium and would have been fully native. I set it aside because your references point to real light under a technological layer, not to flat graphic worlds. It can return if you want the period to come from the medium.
- **Light-washes on dark as a separate direction.** Absorbed into Direction 3 and into the shared construction.
- **Opaque gouache realism.** The fill, not the lines, would carry the picture, and it risks a generic painted-AI look, which is the stock complaint in paint.
- **A red or magenta Blackwall veil.** Not asked for.
- **A single 5 s video from field to arrival.** It compresses about 40 s, and V5 showed far fields washing in.
- **RC1-fix and RC1-alt.** Superseded.

## 13. What would change in existing documents if a direction is chosen (not done here)

- **DESIGN_PROMPT_C:**
  - §2.1: lines persist; page-crossing guides.
  - §2.3 and §4: replaced by the chosen fill.
  - §3: the field settle replaces the front and seam; slips are retired.
  - §7: bounded Blackwall vocabulary.
- **RENDERER_CONTRACT_C:**
  - New §E line field.
  - §B per direction.
  - §C tunables replaced.
  - §D idle life per direction.
  - §H.1 compares against the new master.
- **JOBS.md:** BW1, BW2 and VB1 added; WC1 inputs change from RC1 to the chosen master, if WC1 is kept.

**Status: every value in this document is a proposal. Nothing here has been generated, quoted, run or accepted. The owner's motion video has not been viewed.**
