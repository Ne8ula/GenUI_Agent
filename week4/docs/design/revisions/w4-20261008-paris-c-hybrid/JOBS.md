# C packet job list (w4-20261008-paris-c-hybrid)

Authored read-only through `eva-reviewer` (alias `opus`; self-report Claude Opus 5.5) on 2026-10-08 as part of [DESIGN_PROMPT_C.md](../../../../DESIGN_PROMPT_C.md); integrated by the main session. **Status: RC1 ran and was rejected at checkpoint 1 (2026-10-08); the owner also rejected realistic plates as an idea, so PL1–PL3, RC2, VC2 and the photographic RC1-fix/RC1-alt variants are superseded. No other job has run.** Real run IDs, quotes and approvals are recorded in [provenance.json](provenance.json), never here.

**Live contract check (main session, 2026-10-08, `weave_find_model`, read-only):** the image route resolves to Weave label "Nano Banana 2.1", id `bebebed5-50c1-4701-98b3-86929db21585`, `modelId` `fal-ai/nano-banana-2/edit`, inputs `prompt` + `images[]` (up to 14, so two-image jobs WC2/WC3 are possible), params `model` ("Nano Banana 2" | "Nano Banana 2.1", default 2.1), `resolution` (512/1K/2K/4K), `aspect_ratio`, `output_format` (png default), `thinking_level` (Minimal | High), `enable_web_search`, `seed`. No negative-prompt field. The video route "Kling First & Last Frame", id `85caf705-a459-48dd-96cd-953a04b4c08e`, takes `image`, `tail_image_url`, `prompt`, `negative_prompt`, `model` (O1 Pro default), `duration` (5 | 10), `cfg_scale`. Discovery estimates (3.5 and 55) are not quotes.


**Route:** `direct-model`, discovered live by the main session. **Last recorded prices, not quotes:** Nano Banana 2 edit (`fal-ai/nano-banana-2/edit`) at 9 credits per 16:9 2K image; Kling First & Last Frame O1 Pro at 55 credits per 5 s and 109 per 10 s.

**Every run:** quote, then the owner's structured Approve, then a single submission, then retrieval and inspection. Never resubmit before checking whether a run was created.

**Contracts as last recorded (verify live):**
- Nano Banana 2 edit took `images[]`, `prompt`, `aspect_ratio`, `resolution`, `enable_web_search`, `seed`. **No negative-prompt field**, so exclusions go in the prompt. Whether it accepts two input images (needed for WC2 and WC3) must be checked live; the fallback is RC1 alone, with the line style described in text.
- Kling took `image`, `tail_image_url`, `prompt`, `negative_prompt`, `model`, `duration`, `cfg_scale`.

**Image settings for every image job:** `aspect_ratio` 16:9, `resolution` 2K, `enable_web_search` false, `seed` null unless the model exposes and records one. Expected output for every image job: one PNG of about 2752×1536.

## Checkpoints

**Checkpoint 1: RC1 alone.** The owner approves the realistic look before anything else is spent.

**Checkpoint 2: the rest.** It runs only after RC1 is approved.
- **2a:** WC1-D and WC1-P. The owner then picks the ground in one structured question.
- **2b:** WC2, PL1, PL2, PL3, RC2, VC1a, VC2.
- **2c:** WC3 and VC1b, which can wait until the construction step.

## Summary table

"Step 1" means mandatory for the new step 1, assuming the step-1 scope I recommend (owner question 9). If the owner limits step 1 to the arrival frame only, WC2 and VC1a move to "later".

| # | Job | Model | Inputs | Depends on | Step 1? | Estimated credits |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | RC1 realistic master | NB2 edit | P1 (layout only) | — | **Yes** | 9 |
| 2 | WC1-D survey, dark ground | NB2 edit | RC1 | 1 + checkpoint 1 | **Yes** | 9 |
| 3 | WC1-P survey, paper ground | NB2 edit | RC1 | 1 + checkpoint 1 | **Yes** (for the ground decision) | 9 |
| 4 | WC2 near-fill state | NB2 edit | RC1 + chosen WC1 | 2/3 + ground choice | **Yes** | 9 |
| 5 | WC3 late street-fill state | NB2 edit | RC1 + chosen WC1 | 2/3 + ground choice | Later (construction step) | 9 |
| 6 | PL1 clean street | NB2 edit | RC1 | 1 | **Yes** | 9 |
| 7 | PL2 tabletop on chroma | NB2 edit | RC1 | 1 | **Yes** | 9 |
| 8 | PL3 figures and occluders on chroma | NB2 edit | RC1 | 1 | **Yes** | 9 |
| 9 | RC2 "two seconds later" | NB2 edit | RC1 | 1 | **Yes** (VC2 end frame) | 9 |
| 10 | VC1a survey → near fill | Kling F&L O1 Pro, 5 s | WC1 → WC2 | 4 | **Yes** | 55 |
| 11 | VC1b near fill → arrival | Kling F&L O1 Pro, 10 s | WC2 → RC1 | 4 | Later | 109 |
| 12 | VC2 settled idle | Kling F&L O1 Pro, 5 s | RC1 → RC2 | 9 | **Yes** | 55 |

**Estimated totals (not quotes):**
- Step-1 mandatory set: **182** credits (8 images at 72, plus VC1a and VC2 at 110).
- Later: **118** (WC3, VC1b).
- Whole packet: **300**.

**Conditional jobs, each approved separately:**
- RC1-fix: a targeted edit of RC1 for a defect found at checkpoint 1. 9.
- RC1-alt: realist-painting variant from P1's layout, only if the owner says RC1 is too far from P1. 9.
- PL1b: PL1 with the awning removed and the façade behind it completed, only if step-2 parallax shows a gap. 9.
- WK1: walker sprite video on a matte background, only under Option B. Needs a locally cropped upload; about 55 per 5 s. Specify it only if chosen.

**Splitting the survey→arrival video in two:** VC1a and VC1b are anchored at WC2, which forces near-first order. A single 10 s WC1→RC1 run would leave the model free to wash the whole frame, as V5 did with the far field.

## 1. RC1: realistic master (checkpoint 1)

- **Purpose:** decide the realistic look; master for all plates.
- **Model:** `fal-ai/nano-banana-2/edit`.
- **Input:** P1 `img-01` as a **layout input only**. Pass it as its Weave-hosted output if available; otherwise it is an upload, and that is recorded. P1 stays a reference.
- **Estimated cost:** 9.

```text
Re-create this illustration as a real photograph. Keep its composition exactly: the same viewpoint and framing, the same horizon height and vanishing point, and the same position, size and outline of every object, building and person. Use the illustration only as a guide to layout, colour and light; none of its drawing style may remain — no outlines, no stippling, no paper texture, no painted edges, no coloured dots.

A first-person view from a seat at an outdoor café table in Paris, late afternoon in early autumn, in the 1980s, at seated adult eye height, looking down a quiet, narrow street. At the bottom of the frame, a round white marble café table with soft grey veins and a few faint cup rings; its near edge crosses the bottom of the frame. On the table, right of centre, a thick white porcelain espresso cup of black coffee with a thin pale crema, on a matching saucer, with a barely visible thread of steam. On the table, left of centre, a heavy clear pressed-glass ashtray with a little grey ash and a half-smoked plain white cigarette with no markings resting in its notch, giving off a faint thin thread of smoke. At the left edge, close to us and cut off by the frame, the curved back of an empty honey-coloured woven rattan bistro chair with a diamond lattice.

On the left of the street, a cream limestone building with tall muted sage-green louvred wooden shutters, plain wrought-iron balcony rails and a retractable terracotta canvas shop awning, faded by the sun, plain, with no scallops, fringe or lettering. On the right, the facing building in soft open shade: cream limestone, tall sage-green shutters, wrought-iron balconies, a stone string course. At the end of the street, closing the view, a pale limestone building with a grey zinc mansard roof, three small dormer windows and two chimney stacks. A near-black cast-iron Paris lamp post stands right of the street's centre; a second, smaller one stands farther back. The pavement is pale, worn stone. Windows show dim interiors and soft reflections of the sky only.

People, ordinary and unposed, absorbed in their own afternoon. On the left pavement, one woman in a long belted camel trench coat with broad shoulders, falling below the knee, dark boots, dark brown chin-length hair, her hands in her coat pockets, walks toward us at an easy pace; her head is tilted down and slightly to her left as she watches the pavement, her face in soft shade and not distinct; she does not look at us. Farther down the street, near the lamp post, a man in a muted brown jacket with a folded newspaper under his arm walks away from us, and one other person in a dark coat, hands in pockets, walks a little ahead of him, also away from us. Exactly one of each person: no doubled, ghosted, transparent or overlapping figures.

Light and photography: soft, low late-afternoon sun, warm on the left building and the awning; the right building in luminous pale open shade; long soft shadows on the pavement. High-key, airy and low in contrast, with gentle natural colour, like a quiet, well-exposed photograph. Natural perspective of a 35 mm lens. Deep focus: the table, the cup and the far building are all acceptably sharp, with only slight atmospheric softening in the distance. Very fine, almost invisible grain. A pale, almost white, warm sky.

Colours only from: cream limestone, café crème, espresso, honey rattan, zinc grey, muted sage green, near-black iron, white marble and porcelain, camel, and one faded terracotta.

Exclude: any readable text, letters, numbers, signs, logos, brand names, watermarks or signatures; smartphones, screens, modern cars, scooters, bicycles, LED lights, satellite dishes, air-conditioning units, euro signs; landmarks; outlines, ink, stippling, dots, specks, paper texture, painterly brushwork, illustration; teal, coral, purple, blue or neon colours; motion blur, lens flare, heavy vignette, tilt-shift, HDR look, oversharpening, oversaturation, teal-and-orange grading, nostalgia filter; people looking at the camera; any frame, border, interface or overlay.
```

**Inspect before accepting:**
1. **Layout:** overlay on P1 at 50 %. The step-1 anchors hold within about 2 % of frame size: horizon about 0.545; cup about (0.70, 0.84); ashtray about (0.33, 0.89); woman's feet about (0.366, 0.745); near lamp base about (0.576, 0.625); mansard x 0.46–0.61; chair hoop cut by the left edge.
2. **One of each person.** No ghost pair. Woman toward us, face indistinct, hands in pockets. Far walkers turned away.
3. **No text anywhere.** Zoom on the awning, windows, cigarette and ashtray. No stray dots.
4. **Palette:** sampled points stay within the Paris palette. No teal, coral or purple cast.
5. **Deep focus;** no motion blur or vignette.
6. **Realism defects:** cup handle geometry, ashtray glass plausibility, lattice continuity, lamp structure, feet and boots, perspective of the façades.
7. **Period intrusions.**
8. **Thumbnail test:** at 400 px wide beside P1, does it read as P1's place, light and calm?
9. Record the actual run ID and the reported cost.

## 2–3. WC1-D and WC1-P: wireframe survey on both grounds (checkpoint 2a)

- **Purpose:** the line language at the end of phase C, plus the ground decision.
- **Model:** NB2 edit. **Input:** RC1, so the lines inherit its exact geometry.
- **Estimated cost:** 9 each.

**WC1-D prompt:**

```text
Turn this photograph into its own construction drawing. Remove every photographic surface, texture, fill, shadow and highlight, and keep only a sparse set of thin, precise, softly luminous coloured lines tracing the main edges of the exact same scene, in exactly the same positions and perspective, on a deep warm near-black ground (a very dark umber-graphite; not pure black, not blue).

Each line takes the colour of the material it outlines: the marble table's rim and the cup, saucer and ashtray in warm porcelain white; the cigarette in pale cream with a faint terracotta tip; the rattan chair's curved back and diamond lattice in honey; the woman's outline, belt and coat opening in camel; the two far walkers in muted brown-grey; both lamp posts in pale zinc grey; the façades' cornices, string courses, window and door openings in pale limestone cream; the shutters as simple rectangles in muted sage green, with a few louvre lines only on the nearest ones; the balcony rails in zinc grey; the awning's outline, roller and arms in faded terracotta; the far building's mansard roof, dormers and chimneys in zinc grey; the kerbs and a few perspective guides in dim stone grey.

Line weight follows distance: the table rim and cup are the boldest, about three times the width of the far building's lines, which are the finest and dimmest. A faint, soft glow surrounds each line, strongest on the nearest lines, never a haze. One horizon line at seated eye height crosses the whole frame; a few straight perspective guides run along the kerbs and the façade bases to the vanishing point at the end of the street. Lines meet cleanly at corners and overshoot them by a hair, like an architect's construction drawing.

People are outlines only: no faces, no features, no hands, no skeleton, no stick figures. The sky, the window glass, the stone, the marble, the coffee and the shadows stay empty ground. No steam or smoke.

Three thin rectangles, each in the colour of the object it frames and fainter than the lines, sit around the cup, the ashtray and the chair; the one around the cup is crossed corner to corner with an X, and the cup and ashtray rectangles are joined by one thin straight line.

Exclude: filled surfaces, photographic detail, paint, shading, text, letters, numbers, labels, dimension lines, arrows, measurements, grid floors, grid skies, triangle meshes, wireframe spheres, hexagons, glyphs, HUD, interface, crosshairs, scanlines, strips, particles, specks, dots, lens flare, neon, saturated cyan, blue, teal, purple or neon-green glow, sci-fi or video-game styling.
```

**WC1-P prompt:**

```text
Turn this photograph into its own construction drawing. Remove every photographic surface, texture, fill, shadow and highlight, and keep only a sparse set of thin, precise, crisp coloured lines tracing the main edges of the exact same scene, in exactly the same positions and perspective, on warm off-white paper with a faint, even grain.

Each line takes a deeper shade of the material it outlines, so it reads clearly on the paper: the marble table's rim and the cup, saucer and ashtray in warm grey; the cigarette in light warm grey with a faint terracotta-brown tip; the rattan chair's curved back and diamond lattice in deep honey; the woman's outline, belt and coat opening in dark camel; the two far walkers in brown-grey; both lamp posts in near-black iron; the façades' cornices, string courses, window and door openings in warm stone brown-grey; the shutters as simple rectangles in deep sage green, with a few louvre lines only on the nearest ones; the balcony rails in iron grey; the awning's outline, roller and arms in faded terracotta-brown; the far building's mansard roof, dormers and chimneys in zinc grey; the kerbs and a few perspective guides in light warm grey.

Line weight follows distance: the table rim and cup are the boldest, about three times the width of the far building's lines, which are the finest and palest. No glow. One horizon line at seated eye height crosses the whole frame; a few straight perspective guides run along the kerbs and the façade bases to the vanishing point at the end of the street. Lines meet cleanly at corners and overshoot them by a hair, like an architect's construction drawing.

People are outlines only: no faces, no features, no hands, no skeleton, no stick figures. The sky, the window glass, the stone, the marble, the coffee and the shadows stay empty paper. No steam or smoke.

Three thin rectangles, each in the colour of the object it frames and fainter than the lines, sit around the cup, the ashtray and the chair; the one around the cup is crossed corner to corner with an X, and the cup and ashtray rectangles are joined by one thin straight line.

Exclude: filled surfaces, photographic detail, paint, watercolour, shading, stippling, text, letters, numbers, labels, dimension lines, arrows, measurements, grid floors, grid skies, triangle meshes, hexagons, glyphs, HUD, interface, crosshairs, scanlines, strips, particles, specks, dots, neon, cyan, blue, teal or purple, sci-fi or video-game styling.
```

**Inspect:**
- Line positions match RC1 (50 % overlay).
- Colour mapping per object; weight falls with distance.
- No faces or skeletons.
- Sparse, not a mesh.
- The CAD, Tron and HUD test (DESIGN_PROMPT_C §1).
- Ground colour: dark is not blue or black; paper is not grey.
- Accent count is 3, with one X and one link.
- No text.
- On the dark version, the glow is a halo, not haze.

## 4. WC2: near-fill state (about 31 s)

- **Model:** NB2 edit. **Inputs:** image 1 = RC1; image 2 = the chosen WC1.
- Use the bracketed variant that matches the chosen ground.
- **Estimated cost:** 9.

```text
The two images show the same scene in the same positions. Image 1 is the finished photograph; image 2 is its coloured line drawing on a [deep warm near-black ground | warm off-white paper]. Combine them to show one moment in between: the photograph has filled in only the nearest things. The marble table, the espresso cup and saucer, the glass ashtray and cigarette, the rattan chair and the first strip of pavement just beyond the table are fully photographic, exactly as in image 1, with no steam and no smoke yet. Everything farther away is still only the coloured lines of image 2 on the [ground | paper]: the woman, the two far walkers, both lamp posts, both façades with their shutters and balconies, the awning, the far building and the sky.

On the pavement, the photograph is advancing away from us: its far edge is a soft, slightly irregular border traced by a thin luminous seam in the colour of the lines, with the photograph behind it and the line drawing ahead of it. The lines around the filled objects are still faintly visible along their edges, fading. [Dark only: around the filled table the ground has lifted slightly toward a warm dark grey.] One thin camel rectangle, fainter than the lines and crossed corner to corner with an X, frames the woman's outline.

Exclude: any text, letters, numbers, labels, logos, watermark; particles, specks, dots, strips, smear bands, scanlines, flashes, glow on the photograph, hexagons, HUD, interface, neon, cyan, teal, blue or purple; doubled or ghosted figures; people looking at the camera.
```

**Inspect:**
- Only the near set is photographic, and it matches RC1.
- The seam is thin and soft, not a wipe edge.
- The far field is lines only, with no wash.
- One accent; no dots.
- Does a photograph-in-lines frame look beautiful rather than collaged?

## 5. WC3: late street-fill state (about 41 s; later step)

- **Inputs:** as WC2. **Estimated cost:** 9.

```text
The two images show the same scene in the same positions. Image 1 is the finished photograph; image 2 is its coloured line drawing on a [deep warm near-black ground | warm off-white paper]. Combine them to show a later moment: almost everything is now photographic, exactly as in image 1 — the table and everything on it, the rattan chair, the pavement, both façades with their shutters, balconies and the awning, and both lamp posts. A thin thread of steam rises from the cup and a thin thread of smoke from the cigarette. The far building at the end of the street is half filled: its lower half is photographic, while its zinc roof, dormers and chimneys are still fine zinc-grey lines, with a soft luminous seam between them. The sky above the rooftops is [still the deep warm dark ground, lifting toward pale warm light near the rooflines | still plain paper, with pale warm sky light beginning above the rooflines].

The three people are still only coloured outlines, walking within the real street: the woman a camel outline mid-stride on the left pavement, the two far walkers brown-grey outlines farther down the street. They have no faces and no fill. One thin camel rectangle, fainter than the lines, frames the woman.

Exclude: any text, letters, numbers, labels, logos, watermark; particles, specks, dots, strips, smear bands, scanlines, flashes, hexagons, HUD, interface, neon, cyan, teal, blue or purple; filled or photographic people; faces; doubled or ghosted figures.
```

**Inspect:**
- The people are outlines in a real street. Does it read as "life before substance" or as an error?
- The far-field seam; the sky treatment; one accent only.

## 6. PL1: clean street plate (runtime candidate)

- **Model:** NB2 edit. **Input:** RC1. **Estimated cost:** 9.

```text
Edit this photograph. Remove the café table and everything on it, the rattan chair, the woman, both far walkers, both lamp posts, all steam and smoke, and every shadow any of them cast. Complete what was behind them so the street reads as if photographed a moment when nobody was there and nothing stood in the foreground: continue the pale worn stone pavement and the kerbs right down to the bottom edge of the frame, and complete the façades, shutters, doorways, balcony rails and the far building where they were hidden, in the same light, perspective, sharpness, grain and colour. Change nothing else: identical framing, identical buildings, awning, windows, sky and light.

Exclude: any text, letters, numbers, signs, logos, watermarks; any people, figures, silhouettes, ghosts or shadows of removed objects; new objects, furniture, cars, bicycles, plants or street furniture; outlines, dots, specks, illustration style; blur, smears or repeated patterns where objects were removed.
```

**Inspect:**
- Difference against RC1 is near zero in unchanged areas: check window edges, cornices and the awning.
- Global drift is at most about 0.3 % of width after alignment.
- Completions are plausible. Look especially behind the woman, the lamp and the chair, and at the pavement under the table.
- No residual shadows or ghosts; no repeated texture; sky unchanged.

## 7. PL2: tabletop plate on chroma (runtime candidate)

- **Model:** NB2 edit. **Input:** RC1. **Estimated cost:** 9.

```text
Edit this photograph. Keep only the round marble table and the things on it — the espresso cup with its coffee, the saucer, the glass ashtray with its ash and the cigarette — exactly as they are: same position, size, perspective, light, sharpness and detail. Remove the steam and the smoke completely. Remove the rattan chair. Replace everything else in the frame — the street, the pavement, the people, the buildings, the lamp posts, the awning and the sky — with a flat, perfectly uniform pure chroma-green background, with no shadows, gradients, texture, reflections or vignette. The table's far edge and the cup's outline stay crisp against the green; nothing green reflects in the cup, the saucer, the marble or the glass.

Exclude: any text, letters, numbers, logos, watermark; green tint or green fringes on the objects; added objects; outlines, dots, specks, illustration style; steam, smoke or haze.
```

**Inspect:**
- The objects match RC1 at 50 % overlay.
- The green is flat (low variance).
- No green tint on rims or glass beyond 1–2 px.
- No steam or smoke; the ember is intact; the table's far edge is clean.

## 8. PL3: figures and occluders on chroma (runtime candidate)

- **Model:** NB2 edit. **Input:** RC1. **Estimated cost:** 9.

```text
Edit this photograph. Keep only these, exactly as they are — same position, size, pose, perspective, light, sharpness and detail: the empty rattan chair at the left edge, the woman in the camel trench coat, the man with the newspaper, the other far walker, the near lamp post and the far lamp post. Complete the chair's curved back and lattice where the table hid it, down to about the height of its seat, in the same woven rattan. Remove the table and everything on it, the street, the pavement, the buildings, the awning, the sky, the steam, the smoke and every shadow. Replace everything removed with a flat, perfectly uniform pure chroma-green background with no shadows, gradients or texture; the green shows through the open gaps of the chair's lattice. Keep each person and object separate, unchanged and not overlapping; keep the woman's head tilted down with her face in soft shade and not distinct.

Exclude: any text, letters, numbers, logos, watermark; added or doubled people, ghosted or transparent figures; green tint or green fringes on hair, coats or rattan; outlines, dots, specks, illustration style; changes to clothing, pose or proportions.
```

**Inspect:**
- Each element's position against RC1.
- The woman's identity is consistent, her face is still unreadable and her hands are in her pockets.
- Lattice holes show green; the lantern ironwork is intact.
- Spill can be decontaminated; there are six separable components; nothing has been added.

## 9. RC2: "two seconds later" (end frame for VC2)

- **Model:** NB2 edit. **Input:** RC1. **Estimated cost:** 9.

```text
Edit this photograph so that about two seconds have passed and nothing else has changed. The woman in the camel trench coat is two easy steps closer to us along the same left pavement — slightly larger, in the next phase of her stride, hands still in her pockets, head still tilted down, her face still in soft shade and not distinct. The man with the newspaper and the other far walker are each a few steps farther away down the street and slightly smaller. The steam thread above the cup and the smoke thread above the cigarette have drifted and bent slightly. Everything else is identical: framing, light, colours, table, cup, ashtray, chair, buildings, awning, lamp posts and sky.

Exclude: any text, letters, numbers, logos, watermark; added, doubled or ghosted people; anyone looking at the camera; changes to the clothing, the buildings or the light; outlines, dots, specks or illustration style.
```

**Inspect:**
- Difference against RC1 is confined to the walkers and the threads.
- Identity holds; the face is still unreadable; no duplicates.

## 10. VC1a: survey → near fill (5 s)

- **Model:** Kling First & Last Frame, O1 Pro. **image:** chosen WC1. **tail_image_url:** WC2.
- **Settings:** `duration` 5, `cfg_scale` 0.5 (V5's value; verify).
- **Estimated cost:** 55. **Expected output:** an MP4 of about 5 s at 24 fps.

```text
Locked-off camera; nothing in the frame moves except the construction. The coloured line drawing becomes real from the seat outward. First the espresso cup and saucer fill in from their own outlines inward behind a thin, soft, luminous seam in the colour of their lines; then the marble table from its near edge outward; then the glass ashtray and the cigarette; then the rattan chair along its woven strands; then the first strip of pavement beyond the table, the photograph advancing away from us. Each object's lines fade gently once it has filled. Everything farther away stays as still, quiet coloured lines. Calm, unhurried, continuous.
```

**negative_prompt:**
```text
camera movement, zoom, pan, tilt, cuts, morphing, melting, wobbling lines, whole-frame dissolve, colour wash, flicker, flashing, strobe, strips, smear bands, scanlines, particles, dust, specks, dots, text, numbers, labels, logos, watermark, hexagons, HUD, neon, cyan, teal, blue, purple, people moving, people facing the camera
```

**Inspect:**
- Use a 3 fps sheet, a 12 fps burst over the fills, and the per-frame luma difference (as for V5).
- Order is near-first; the fills are edge-led rather than a wash; the seam stays thin.
- No flashes, and peak luma difference is low.
- Lines stay stable, without wobble.
- Treat the clip as a timing and feel reference. The native mechanism stays authoritative.

## 11. VC1b: near fill → arrival (10 s; later step)

- **Model:** Kling F&L O1 Pro. **image:** WC2. **tail_image_url:** RC1.
- **Settings:** `duration` 10, `cfg_scale` 0.5.
- **Estimated cost:** 109.

```text
Locked-off camera. Continue the construction outward from the seat. The pavement fills in away from us behind a soft, thin, luminous seam; then the left building and its awning, from the nearest windows toward the end of the street; then the right building the same way; then the near lamp post and the far one; then the far building with its zinc roof. Last, the [dark ground lifts into a pale, warm sky | paper warms into a pale sky] above the rooftops. Meanwhile the woman and the two far walkers keep walking slowly as coloured outlines, and near the end each fills in from the outline inward. Each part's lines fade gently once it has filled. A thin thread of steam begins above the cup. The scene settles into the finished, quiet photograph.
```

**negative_prompt:**
```text
camera movement, zoom, pan, tilt, cuts, morphing, melting, whole-frame dissolve, colour wash, flicker, flashing, strobe, strips, smear bands, scanlines, particles, dust, specks, dots, text, numbers, labels, logos, watermark, hexagons, HUD, neon, cyan, teal, blue, purple, people facing the camera, faces, extra people, doubled or ghosted people
```

**Inspect:**
- Does the far field arrive line-led rather than as a wash? This was V5's failure.
- Do the walkers stay outlines until late?
- The sky lift has no flash; one walker each.

## 12. VC2: settled idle (5 s)

- **Model:** Kling F&L O1 Pro. **image:** RC1. **tail_image_url:** RC2.
- **Settings:** `duration` 5, `cfg_scale` 0.5.
- **Estimated cost:** 55.

```text
Locked-off camera, a still afternoon in real time. The woman in the camel trench coat walks two easy steps toward us along the left pavement, hands in her pockets, head down. Farther down the street the man with the newspaper and the other walker stroll away from us. A thin thread of steam rises from the espresso and a thin thread of smoke from the cigarette, bending slightly and fading. Nothing else moves. Calm and natural.
```

**negative_prompt:**
```text
camera movement, zoom, pan, cuts, people looking at the camera, faces turned to the camera, extra people, doubled or ghosted people, morphing, fast motion, flicker, flashing, strips, particles, dots, text, numbers, logos, watermark, lens flare, neon
```

**Inspect:**
- Gait pace and stride frequency (measure it for the native warp).
- The coat-hem motion; the thickness, speed and bend of the steam and smoke.
- Nothing else moves; the face stays unreadable.

**Recording requirements for every run:** actual run ID, model ID, inputs, settings, quoted and reported cost, approval reference, local path, sha256 and inspection notes, in the new revision's `provenance.json`. Store files under `references/images/` and `references/videos/` with a contact sheet. Keep rejected outputs. Mark selection separately from owner acceptance.
