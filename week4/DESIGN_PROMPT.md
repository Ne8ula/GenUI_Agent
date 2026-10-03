# Week 4: Art direction and Weave prompt (1980s Paris, seated)

Date: 2026-10-03 · Status: **reusable art-direction prompt, documentation only.** No generation has run, and nothing here is a reference packet, mockup or accepted candidate. · Source revision: `d25d705` · Accepted Week 4 baseline: none.

Authored by Claude Opus 5.5; integrated/checked by Astra. Execution provenance recorded separately.

Companion: [Week 4 plan](planning.md). The [Weave gate](../docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change) applies: each run needs explicit cost approval, and outputs must be inspected before any UI edit.

## 1. The feeling

Not "Paris." **An afternoon in Paris that happens to have you in it.**

It is late afternoon in early autumn. You have nowhere to be. The coffee has gone from too hot to just right. Someone at the next table left a cigarette smouldering in a heavy glass ashtray. Its smoke climbs in a thread, bends, and is gone. People pass at walking pace: a coat, a newspaper, a pair of foam headphones on a teenager. They are not posing, and none of them looks at you. The light lies low and warm across the stone opposite. Nothing happens, and that is the point.

Words to hold: **intimate, unhurried, lived-in, slightly worn, specific.** Words to refuse: spectacular, iconic, cinematic establishing shot, theme park, nostalgia filter.

The 1980s here is a temporal *texture*: clothes, objects, the absence of screens. It is not a documentary claim about a real café or date. EVA offers an interpretation, and says so if asked.

## 2. Reference analysis

These are owner-supplied mood references. They are **not** Weave outputs, not licensed runtime textures, and not evidence of 1980s Paris. Do not copy or remove watermarks, signatures, or brand-like names.

| Reference | What is actually there | Rule extracted |
| --- | --- | --- |
| [28b48b61…](references/28b48b610729cef693cd04600eb23b36.jpg) | Watercolour corner café: weathered pale-green wooden shopfront, orange awning, pink blossom spilling from a balcony, red metal chairs at a round marble table, chalkboards, terracotta pots, lanterns, pale limestone blocks. The sign reads "COFFEE" in English. Illegible signature at bottom left; a cropped circular mark at the right edge. | Worn painted wood and limestone; one saturated accent against pale stone; a single small table as the emotional unit. English signage is wrong for the setting. The blossom is too sweet for our restraint. |
| [a207be6c…](references/a207be6cdddf6b4e346131af1a7a44f0.jpg) | Frontal watercolour shopfront isolated on white: navy façade, blue-and-white striped awning, illegible script on the fascia, honey-coloured rattan bistro chairs, small round tables, warm pendant glow inside, wall lantern, young street tree, flower boxes. Faint repeated overlay marks appear on the awning and window area, consistent with a stock watermark. | Rattan chairs as the signature material; warm interior glow against cool exterior wash (useful for the evening state). The isolated-object presentation suits object sheets. Do not reproduce the overlay or the fascia lettering. |
| [a54e0060…](references/a54e00607a02c92656355ff4c7b6e0d4.jpg) | Architectural ink drawing with watercolour: construction lines extend past the building edges, pseudo-handwritten annotations, an arched entry with a hanging clock, wooden shopfront, balcony with a potted tree, two wooden chairs. Brand-like text "Arcliine/Arciine" appears in the header and on the fascia. | **The key construction reference.** Survey lines that overshoot their forms; drafting becomes painting within one image; annotation used as texture. Do not copy the name or render legible fake labels. |
| [898605f3…](references/898605f339e51b8a604fa64ab26b7eb4.jpg) | Tall ink-and-wash canal alley: ivy-covered stone houses, flower boxes, iron lanterns, an arched bridge, teal water with lily pads, strong one-point recession. | Depth through layered overlap: near flowers, mid walls, bridge, far light. Stone texture density falls off with distance. **This is a style and depth reference, not Paris geography.** No canals. |
| [6d5d8291…](references/6d5d82913fd3585257cce0069c4d7c6b.jpg) | Loose ink line with selective colour: white corner building, yellow awnings, dark wood shopfront, about seven people seated on the terrace talking, rooftop antennas, a lamp post, a small red sign. Signature at bottom right. | **Lived-in.** People absorbed in their own afternoons; selective colour against unpainted line; antennas and posters as worn specificity. The figures' clothing reads as contemporary, so the wardrobe is not a period reference. |
| [e0f47b19…](references/e0f47b195de820d773545eae34f70f96.jpg) | Ink line with a blue wash: ornate blue corner shopfront, wrought-iron balcony with plants, folding wooden chairs and a round table with a cup in the near foreground, cobbles, a receding street of cream façades with chimney pots, overhead wires, a vignette fading to white paper. | **Closest to our viewpoint:** chair and table near the viewer, the street receding. The fade to paper becomes our wallpaper periphery and hides the parallax seam. |

**Combined style:** confident ink line over transparent watercolour on warm paper. Selective colour, so near and important things are painted while far things stay closer to line. The edges of the world breathe out into unpainted paper.

## 3. Two layers that must not merge

| | EVA construction layer | Paris environment |
| --- | --- | --- |
| Role | The guide that builds and then withdraws | The place that remains |
| Material | Week 3 square-pupil eye, square dither cells, thin tracking boxes, survey lines | Ink, watercolour, limestone, zinc, rattan, porcelain, glass, smoke |
| Colour | EVA expressive red `#FF3B35` (survey lines, sparingly), Bone `#E8E4D9`, Void `#080A0B` only in controls | Warm palette (§5); never red overall |
| Lifetime | Phases A–F; remnants dissolve at G; it returns for follow-ups and leaving | Persistent until return |

The survey lines **start in EVA's red and cool into ordinary sepia ink as the world takes over**. The guide's hand becomes the place's own drawing. One faded red awning valance carries EVA's colour quietly into the world.

## 4. Composition and depth

The view is fixed, first-person and seated. These proportions are proposals to test, with a frame matching the demo monitor's aspect ratio.

- **Horizon** at about 40–45% from the top, the seated eye height.
- **Awning valance** across the top 0–8%, scalloped, faded red, slightly out of focus. It frames the view and later sheds rain drips.
- **Table** fills the bottom 22–28%. It is a round marble top, worn, with a ring stain. The near edge is soft.
- **Cup and saucer** at about x 60%, y 80%: small white porcelain, black coffee, a thin thread of steam. Zero-parallax anchor: it stays steady while the world moves.
- **Glass ashtray** at about x 32%, y 85%. An unbranded cigarette rests on its lip with a thread of smoke. A few coins sit beside it, and a sugar wrapper.
- **Neighbour's empty rattan chair** cut by the left edge, close. A near occluder for the pavement.
- **Pavement lane** in the 35–60% height band, where three or four passers-by overlap at different depths. A lamp post at about x 78% occludes them in turn.
- **Façade opposite** in the 8–45% band: cream limestone, iron balconies, tall shutters, a zinc roofline, chimney pots. A parked small hatchback with no badge.
- **Periphery:** a 6–10% vignette fading to warm paper, wider in the sky. This is the low-frequency far field the wallpaper carries.

Depth must read from overlap, size, line density and wash saturation, so that a still keyframe already implies how parallax will behave.

## 5. Materials, colour, type, sound

**Palette (proposed hex values, to be checked against the generated references):**
- Paper `#F3EEE3`
- Limestone `#E3D6BF`
- Shadow wash `#9AA3A8`
- Café crème `#C9A27A`
- Espresso `#2B1D16`
- Rattan `#C08A4A`
- Zinc `#8E9696`
- Shutter green `#4F6B57`
- Faded awning red `#A8322D`
- Sepia ink `#3A2F2A`

Evening adds lamp amber and a blue-hour slate. Rain lowers saturation and adds reflected highlights.

**Material behaviour:** stone shows chisel marks and soot at the sills; rattan is woven, worn pale at the arms; porcelain is thick and slightly chipped; the glass ashtray is heavy, with grey ash; zinc is matte. Watercolour pools at edges, and painted paper keeps a slight grain.

**Type:** none in the scene during generation. Any period signage is authored natively later, after the authenticity checks. EVA's controls and captions use IBM Plex Sans; Space Grotesk and IBM Plex Mono appear only where the Week 3 controls already use them. No HUD, no readouts, no fake data.

**Sound** carries arrival as much as picture does:
- Room tone, then filtered city hum.
- A pen scratch with the survey lines.
- A cup on a saucer (heard before it is seen).
- Espresso hiss and unintelligible French murmur.
- Footsteps on stone, a far-off two-stroke moped, a chair scrape, pigeons.

No accordion, no recognisable music, no tourist-cliché score. Every ambience source needs licence provenance.

## 6. Restraint and negative rules

- No Eiffel Tower, landmarks, berets, accordions, baguettes or mime. No postcard framing or panorama.
- No modern intrusions: smartphones, screens, QR codes, e-scooters, bike-share, euro signs, LED fixtures, modern car silhouettes.
- No readable text, logos, brand names, watermarks or signatures in generated references. Cigarettes and packs are unbranded.
- Nobody looks at the camera. No posed crowd, no celebrity likeness.
- Smoking is depicted as ordinary period life, not glamorised or advertised.
- No Animus imitation: no game HUD, logo, glyph rain, sync bars, white-void-plus-blue-hex motif, percentages or "loading" labels.
- Nothing red-washes the environment. No neon, no heavy film-grain nostalgia filter, no sepia over the whole frame.
- The world is quieter than you expect.

## 7. An original reading of the Animus idea

1. **Built from where you sit.** The first lines are the ones nearest your body: the table edge and the horizon at your eye height. The world grows outward from your seat.
2. **Survey before substance.** Line, then plane, then mass, then wash, then light, then life, then full sound.
3. **Partial resolution coexists.** Near objects become solid while far ones are still line. Resolution follows closeness.
4. **The guide's material is the scaffold.** EVA's square cells and tracking boxes are the construction medium. They lock onto the cup and ashtray, then let go.
5. **Sound arrives just ahead of sight.** You hear the espresso machine before you see light on the cup.
6. **Life is the threshold.** The first passer-by crossing is the moment you are *there*.
7. **Leaving has dignity.** The same lines retract in reverse, and nothing is torn away.

## 8. The sixty-second emotional arc

Same phases as [the plan's storyboard](planning.md#4-the-minute-a-storyboard-of-about-60-seconds).

| Phase | Time | Emotional intent |
| --- | --- | --- |
| A Heard | 0:00–0:05 | Being listened to. The eye leans in; a short spoken promise. |
| B Clearing | 0:05–0:12 | Exhaling. The desktop's busyness steps aside; warm paper; quiet. |
| C Survey | 0:12–0:22 | Anticipation. Red lines find your eye height; with slight parallax, you realise *this has depth*. |
| D Massing | 0:22–0:32 | The place takes weight. The cup becomes solid; you hear it settle. |
| E Wash & light | 0:32–0:44 | Warmth. Colour bleeds in near-first; sunlight; steam. EVA stays silent, letting it happen. |
| F Inhabiting | 0:44–0:54 | Company. The first stranger walks past; smoke rises; sound fills in. |
| G Arrival | 0:54–1:00 | Settling. "There. Your coffee's still warm." Then nothing but the street. |

Pacing rule: unhurried but never stalled. Something new should be perceptible every 3–5 seconds. Skip, cancel and reduced motion are dignified alternatives, not failure states.

## 9. Historical care

This is an interpretation. Before native signage, wardrobe and props are finalised, these items are planned checks against primary or institutional sources. **None has been researched yet:**
- Franc coins and prices, not euros.
- Period cars as silhouettes without badges.
- Everyday 1980s wardrobe: broad shoulders, belted trench coats, high-waisted trousers, large eyeglass frames, portable cassette players with foam headphones. These are hypotheses to verify, not facts.
- Ashtray and cup forms.
- Street furniture and lamp styles.
- Signage language and typography.

No real address, café name or exact year is claimed.

## 10. Image and video outputs needed

Weave is used for short references. It is **not** assumed to export layered geometry, alpha, editable sources or a 60-second clip. The minute is assembled natively from keyframes and studies.
- **Images:** S1 (candidates), S2 (about three alternatives), C1–C6, F1–F3, D1, A1–A3.
- **Video:** V1–V8 short studies.

Counts, models and costs are confirmed through live discovery and per-run approval, with a finite ceiling set by the owner.

## 11. Master prompt

Copy-ready. Prepend the stage-specific line from §12–§13 when using it.

```text
First-person view from a seat at an outdoor café terrace in Paris, late afternoon in early autumn, during the 1980s — an artistic interpretation, not a specific real café or date. Seated adult eye height, looking across a small round worn marble café table toward a quiet street and the cream limestone façade opposite. On the table, lower right of centre: a small thick white porcelain cup of black coffee on a saucer, a thin thread of steam, a torn sugar wrapper. Lower left: a heavy glass ashtray with grey ash and a half-smoked unbranded cigarette resting on its lip, a fine thread of smoke; a few coins. The near table edge crosses the bottom of the frame, softly out of focus. A faded deep-red scalloped awning valance crosses the very top of the frame. An empty honey rattan bistro chair is cut by the left edge, close to us. Across the pavement, three or four passers-by in ordinary 1980s Parisian clothing walk past at different depths, mid-stride, unposed, overlapping, none looking at the viewer: a woman in a belted trench coat with broad shoulders, a man in a pale jacket with a folded newspaper, a teenager with a portable cassette player and foam headphones. Wrought-iron balconies, tall shutters in muted green, zinc-grey roofline with chimney pots, an old lamp post, a parked small hatchback with no visible badge.
Style: confident loose ink line drawing over transparent watercolour wash on warm off-white paper; architectural line quality; selective colour, near objects fully painted, far façade lighter and more linear; the sky and outer edges fade softly into unpainted paper. Palette: limestone, café crème, espresso, rattan honey, zinc grey, muted shutter green, one faded red accent. Low warm sunlight from the left, long soft shadows. Intimate, unhurried, lived-in, quiet. Clear depth: near table and objects, mid pavement and people, far façade and roofline.
Exclude: any readable text, letters, logos, brand names, signage words, watermark or signature; smartphones, screens, QR codes, e-scooters, bike-share, euro signs, LED lights, modern cars; Eiffel Tower, landmarks, berets, accordions, baguettes; people looking at the camera; interface, HUD, frames or borders.
```

## 12. Image sub-prompts

Every sub-prompt holds the **same viewpoint, framing and object positions** as S1, so the outputs register as one scene.

**S2: composition alternatives.** "Same scene as the master. Variant: [a] cup slightly more central, ashtray closer; [b] wider street, two walkers; [c] tighter, more table and awning." Use these to choose the framing before reconstruction begins.

**C1–C6: construction keyframes.** Prepend the stage line to a shortened master scene, keeping the identical composition.
- **C1 (eye opening):** "A small luminous red-and-bone eye with a square pupil at the horizon point; its square dither cells loosen and scatter into warm paper grain; the rest of the frame is blank warm paper." Optional input: an approved Week 3 capture, only if the owner clears the upload.
- **C2 (survey):** "Only thin red ink construction lines on warm paper: horizon at eye height, perspective lines from a vanishing point where the pupil was, ellipses for the table edge and cup, a grid of façade openings. Lines overshoot their forms like an architect's drawing. Small thin square outlines rest on the cup, ashtray and chair."
- **C3 (massing):** "Pale unpainted volumes with soft graphite shading; near table, cup and ashtray solid but uncoloured; façade still mostly line; lines shifting from red to sepia."
- **C4 (wash):** "Watercolour wash bleeding into the near table, cup and coffee first; the street half-washed; the façade still line; first warm sunlight."
- **C5 (life):** "Nearly complete; one passer-by drawn as a line figure, half filled with colour; smoke and steam beginning."
- **C6 (arrival):** "The master scene, with the last faint construction lines dissolving into the paper margins."

**F1: rain.** "Same scene. Steady light rain beyond the awning; drips falling from the valance edge; pavement glossy with soft reflections; walkers hurrying, two under dark umbrellas; sky softened grey into paper. The table, cup, coffee, ashtray and cigarette are unchanged and dry; the smoke bends in the damp air."

**F2: evening.** "Same scene at blue hour. The lamp post and café windows glow warm amber; warm light spills across the table and catches the cup's rim; the façade cools to slate; fewer walkers."

**F3: return / deconstruction.** "Same scene in reverse: wash lifting off the far façade first, people fading to line, sepia lines turning back to red and retracting toward a small eye at the horizon point; warm paper returning."

**D1: desktop choreography board (labelled PROXY).** "Storyboard sheet, four panels: [1] a dark desktop with three plain grey rounded rectangles labelled Proxy A/B/C and a small red-and-bone eye; [2] the rectangles gliding to the screen edges and shrinking as warm paper spreads from the eye; [3] full paper with red survey lines; [4] the café scene with the sky fading to paper, and a ghosted outline showing where the background wallpaper sits behind the transparent sky. No real application content, titles or icons."

**A1: spatial layer plates.** "The master scene separated into four plates on a neutral flat background: [far] sky and roofline fading to paper; [façade] opposite buildings and parked car; [pavement] walkers and lamp post; [near] table, cup, saucer, ashtray, chair and awning valance." These are references for native reconstruction. Matting may still be needed.

**A2: object sheet.** "Isolated on warm paper, front, three-quarter and top views: thick white porcelain cup and saucer with coffee; heavy glass ashtray with an unbranded cigarette; round worn marble table top with a cast-iron base; honey rattan bistro chair. Ink and watercolour, no text."

**A3: passer-by sheet.** "Eight full-length figures walking in profile and three-quarter view, everyday 1980s Parisian clothing of different ages, ordinary and unglamorous, no faces toward the viewer, no logos." Wardrobe is checked against §9 before use.

## 13. Video studies

Each study holds the S1 framing and composition and is as long as the selected model supports. A study is a timing and feel reference, not a runtime clip.

- **V1 lines→mass:** red survey lines draw outward from the horizon point, then volumes fill in. Near first.
- **V2 wash bleed:** watercolour spreads into the cup and table, then the street. Unhurried.
- **V3 gait:** two or three walkers pass at different depths, at an easy pace, with natural overlap.
- **V4 smoke and steam:** a slow thread rises, bends and disperses. Calm.
- **V5 rain onset:** drops begin beyond the awning, the pavement darkens, walkers quicken; table and cup stay still.
- **V6 evening transition:** light cools; the lamp and windows warm on.
- **V7 desktop proxy:** grey proxy windows glide to the edges as paper spreads, then return in reverse. Labelled proxy.
- **V8 deconstruction:** wash lifts, lines retract into the eye.

Check reduced-motion stills for C2, C3, C4 and C6 as their own frames.

## 14. Feedback questions

Ask these after each reference packet and after each live run, emotional questions first.

1. In the final seconds, did you feel you had *arrived somewhere*, or that something had *loaded*?
2. Where, if anywhere, did the minute drag? Where did you want more time?
3. Did the eye feel like it was *taking* you, or simply disappearing?
4. Did anything feel like a postcard, theme park or advertisement?
5. When you moved your head, did you feel *seated in a place* or *inspecting a model*?
6. How did the cigarette and ashtray land for you: atmospheric, neutral or off-putting?
7. Did rain or evening change the mood without breaking the place?
8. Did leaving feel safe and complete?
9. Only then: visible seams, jitter, legibility of the controls, sound balance.
