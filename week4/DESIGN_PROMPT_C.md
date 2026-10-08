# Week 4: Art direction C — coloured wireframe, realistic plates

Date: 2026-10-08 · Status: **art-direction amendment, documentation only. Every value here is a proposal.** No direction-C generation has run; nothing here is a reference packet, quote, mockup or accepted candidate. · Accepted Week 4 baseline: none · Step 1: rejected by the owner (2026-10-07/08), see [decision record](docs/design/acceptance/w4-visual-steps.md#direction-after-the-step-1-rejection-owner-2026-10-08).

Authored read-only through the project `eva-reviewer` agent (configured route alias `opus`; self-reported identity Claude Opus 5.5, `claude-opus-5-5`; no independent transport record is available in this Cloud session, see [AUTHORSHIP.md](AUTHORSHIP.md)); integrated by the main session. Source revision: `e7d1424` plus the uncommitted step-1 tree. Companion job list: [the C packet JOBS.md](docs/design/revisions/w4-20261008-paris-c-hybrid/JOBS.md); renderer contract: [RENDERER_CONTRACT_C.md](RENDERER_CONTRACT_C.md). Companion to [DESIGN_PROMPT.md](DESIGN_PROMPT.md) and [planning.md](planning.md). The [Weave gate](../docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change) applies to every run and every UI edit.

> **2026-10-08, checkpoint 1.** The owner rejected RC1 and the realistic-plate idea itself (reasons: "Looks like a stock photo; the aesthetic is gone", "Not 1980s Paris enough", "Realistic plates are the wrong idea"). Everything here about photographic plates (§2.3, §4, the PL jobs, the plate renderer) is **superseded**. The coloured-wireframe material and the reveal mechanics remain proposals pending the alternatives the owner asked for. Record: [w4-20261008-paris-c-hybrid](docs/design/revisions/w4-20261008-paris-c-hybrid/REVIEW.md).

## 0. What this amends, and why C

**Superseded:**
- DESIGN_PROMPT §2 "Combined style".
- The material row of §3 (ink, watercolour, red survey lines cooling to sepia).
- The arrival-look prompts of §11–§13.
- The particle-convergence material of the rejected step 1 and of the converge packet. E0, A0 and V5 are no longer construction references for C.

**Kept:**
- §1 feeling, restated below.
- §4 composition. Where P1 (the owner-chosen look) differs, P1's measured layout governs (step-1 REVIEW §4):
  - the shop awning sits on the left façade, with no overhead valance;
  - the cup is at x≈0.70;
  - there is no parked car and there are no coins;
  - the woman walks toward the viewer.
- §5 palette, plus the P1-sampled tokens in step-1 REVIEW §5. **Paris palette only.**
- §6 restraint, §7 principles 1–3 and 5–7, §8 arc, §9 historical care, §14 questions (three are added in §10 below).

**P1, E0 and A0 stay references.** New Weave outputs from the C packet may become runtime plates, but only after they are recorded in `fixtures/assets/inventory.json` with a provider-terms note (owner decision 2).

**Why C.** Step 1 showed that natively authored *form* cannot reach P1's level. Code is precise at structure, depth, timing and motion. C divides the work accordingly:
- The image model supplies surfaces and light: the realistic plates.
- Code supplies the lines, the depth, the reveal and the life.

**The lines are not decoration.** They trace the proxy geometry that the plates are projected onto (§4). What you watch being drawn is the scaffold the photograph lands on.

## 1. The feeling, restated for C

Still: **an afternoon in Paris that happens to have you in it.** Intimate, unhurried, lived-in, specific.

- **"Technological"** means precise, quiet and exact. Something is measuring the place with care before it lets you in. Think of a surveyor's instrument, not a game interface.
- **"Realistic"** means that when the place arrives, it is a photograph you could believe you are sitting in: real stone, porcelain, glass and rattan, and real low light.
- **"Aesthetic"** means both layers keep P1's restraint: pale, airy, few colours, nothing loud.

**The image to hold:** thin lines of light, each in the colour of the thing it will become, trace your table, then your cup, then the street. Then the real things arrive inside their own lines, nearest first, and the lines step back.

**It must not become:**
- **CAD:** dimension lines, arrows, numbers, uniform hairlines, axis gizmos, orthographic coldness.
- **Tron:** black with cyan neon, grid floors, everything glowing.
- **Game HUD:** reticles, readouts, sync bars, hexagons, glyph rain, the white void.
- **Sci-fi hologram:** flicker, scanline sweeps, chromatic splitting, blue glow.
- **A slideshow transition:** wipes, irises, crossfades of the whole frame.
- **A point-cloud scan.** That was step 1.

**Test:** if a mid-construction frame would sit comfortably on a product-launch slide or a game loading screen, it is wrong. It should look like a quiet light-drawing of somewhere you would like to sit.

## 2. The two layers

### 2.1 The coloured wireframe

**What gets a line.** Only silhouettes and major structural edges: the few edges that carry most of the read.

| Region | Lines (proposal) |
| --- | --- |
| Horizon | One line at seated eye height across the whole frame |
| `obj:table` | Rim ellipse; near-edge thickness line |
| `obj:cup`, `obj:saucer` | Rim ellipse, coffee-level ellipse, body silhouette, handle, foot; saucer outer and inner ellipses |
| `obj:ashtray`, `obj:cigarette` | Ashtray outer and inner rims, notch, base; cigarette's two long edges and its ends |
| `obj:neighbour-chair` | Hoop as a double line; lattice strands at the plate's own pitch (about 12–16 strands) |
| Woman | Outer contour, belt, coat opening, hem. **Nothing inside the head silhouette: no face lines, ever** |
| Far walkers | Contour only |
| `obj:lamp-post` (near and far) | Silhouette and lantern box |
| Façades | Cornices, string courses and base lines; every window and door opening as a rectangle; shutters as rectangles, with 3–6 louvre lines on the nearest four shutters only; balcony rails as top and bottom lines, with two or three baluster or scroll hints on the nearest three balconies |
| `obj:awning` | Outline, roller, front bar, two arms |
| Far mansard | Roof outline, three dormers, two chimneys, two window rows |
| `layer:pavement` | Kerb lines; two perspective guides per side, running to the vanishing point |

**What stays empty:** sky, window glass, stone texture, marble veins, the coffee surface, faces, hands, shadows, steam and smoke.

**Budget:** about 500–900 polylines.

**Line colour comes from each object's own material.** Values are proposals, to be re-sampled on RC1.

| Region | Material | Dark ground (lit tone) | Paper ground (deeper shade tone) |
| --- | --- | --- | --- |
| Horizon, perspective guides | limestone | `#E3D6BF` at 45 % | `#9A8F84` at 60 % |
| `obj:table` rim | marble | `#EEE8DF` | `#8C8782` |
| `obj:cup`, `obj:saucer` | porcelain | `#F6F1EC` | `#8F8780` |
| `obj:ashtray` | glass | `#D4D5D8` | `#7E8086` |
| `obj:cigarette` | paper, ember tip | `#F3EEE3`, tip `#C78B79` | `#9A8F84`, tip `#8B5449` |
| `obj:neighbour-chair` | rattan | `#DAA671` | `#B07A3E` |
| Woman | camel | `#D6A97E` | `#976D54` |
| Far walkers | muted brown-grey | `#A8948C` | `#6E5D5A` |
| `obj:lamp-post` | iron, lifted to zinc on dark | `#9C9EA0` | `#3A3338` |
| Façade cornices and openings | limestone | `#E8D9C0` | `#A8927A` |
| Shutters | sage | `#B8C1A4` | `#5F6B57` |
| Balcony rails | iron/zinc | `#8E9696` | `#5A5C58` |
| `obj:awning` | faded terracotta | `#C78B79` | `#8B5449` |
| Mansard, dormers, chimneys | zinc | `#9AA0A3` | `#6F7377` |
| Kerbs | stone shadow | `#B9B0A4` at 60 % | `#9A938B` |

No line uses a hue in the cyan, blue or purple band. No line is more saturated than its material.

**Weight by depth.**
- At 1080p, `w = 2.2 px × (0.6 / max(0.6, −z))^0.35`, clamped to 0.6–2.4 px.
- That gives roughly: table and cup 2.2 px; chair and woman 1.4 px; façades 0.8–1.1 px; far mansard 0.7 px.
- Alpha falls with the same law (exponent 0.2, floor 0.55).
- Sub-pixel widths render as 1 px with alpha equal to the width.
- Weight is what makes the drawing read as depth before parallax does.

**Luminosity.**
- *Dark ground:* one soft bloom of the line layer. Gaussian σ ≈ 2.5 px at 1080p; intensity 0.30 on the nearest lines, falling to 0.10 on the farthest. No halo wider than about 6 px, and no glow on plates, accents or the ground.
- *Paper ground:* no glow. Lines are crisp and slightly translucent.

**Drawing hand: no waver.** The precision is the technology. The only concession to a human hand is a small **overshoot** at corners (4–12 px at 1080p), taken from the owner's architectural construction-line reference. Overshoots fade first.

**How lines draw on (from the seat outward, §7.1).**
- Each line is drawn by a moving *write head*: a small point at about 1.6× the line's luminance, with a 150 ms trailing decay. On paper it is a slightly denser dot, like ink pooling.
- Screen speed is about 900 px/s for near lines and about 500 px/s for far lines. The far world draws more slowly, so it feels farther away.
- Order:
  1. The horizon line leaves the eye's pupil at the vanishing point and runs to both edges.
  2. The table rim, from its point nearest you outward along both sides.
  3. Cup and saucer; then ashtray and cigarette.
  4. The chair.
  5. Perspective guides run *from the frame edges into the street toward the vanishing point*, so lines travel away from you.
  6. The woman's contour; then the lamps and far walkers.
  7. Façade openings, nearest first, receding.
  8. The awning.
  9. The mansard, last of all.
- Starts overlap with 40–120 ms seeded stagger.

**How lines fade as a region fills.** When a region's fill completes, its interior lines hold for 0.4 s and then fade to zero over 0.9 s. The outer contour fades 0.5 s later, so the seam between plate and neighbour stays covered while the matte edge settles. By phase G no line remains.

### 2.2 The ground the wireframe lives on

**Warm paper**, as planning §4 B already clears to:
- Continuous with P1's cream and with the plan.
- Quietest.
- Hides the wallpaper seam easily.
- Coloured lines on paper read as a precise coloured architectural drawing. It is beautiful, but less "technological", and closer to E0, which the owner has already seen.
- Glow does not read on a light ground, so the technological quality has to come from precision and the write heads alone.

**Dark warm ground** (proposal `#15110E`, a near-black umber-graphite, never pure black or blue):
- Lines can be genuinely luminous, which is the clearest honest answer to "technological but aesthetic".
- It continues the Week 3 eye's dark Void.
- It gives a strong emotional shape: your table and cup become real first, like objects under a lamp in a dark room, and then the street comes up into daylight.
- Risks: a Tron reading (contained by the palette, depth weighting and the rules in §7) and a brightness jump at the end (contained by a slow *ground lift*). From 26 s the unfilled ground rises gradually toward RC1's sky tone, and mean frame luminance never changes abruptly.

**My recommendation: dark warm ground**, with paper as the safe alternative. I am not certain which one the owner will prefer, so the packet renders WC1 on both grounds (owner question 1). On a dark ground, phase B darkens from the eye outward over at least 3 s, never as a full-frame cut. The opaque veil cue keeps its ID (`picture:paper-veil-opaque`); its colour simply follows the chosen ground.

### 2.3 The realistic plates

**The look: a quiet, well-exposed photograph of P1.**
- P1's composition, palette and calm, rendered as a real place.
- High-key, airy and low in contrast, with natural colour.
- Soft, low late-afternoon sun: warm on the left building and the awning. The right building sits in luminous pale open shade. Long soft shadows lie on the pavement.
- The sky is pale and almost white-warm. It is low-frequency, which suits the wallpaper.
- 35 mm perspective at seated eye height.
- Very fine, almost invisible grain. No nostalgia filter, no vignette, no teal-and-orange grade, no HDR crunch.

**Deep focus, deliberately.** Baked depth of field reads as "a photograph" rather than "a window" once your head moves, and it makes matting harder. Everything is acceptably sharp. The far end of the street softens only through atmosphere. Nothing carries baked motion blur.

**How realism stays quiet: by subtraction.**
- Three people.
- No signage, cars, bicycles, planters or posters.
- A clean pavement.
- Window glass shows dim interiors and sky reflections only, never people, who would not move in a static reflection.
- Nothing decisive happens.

**Designed for the technique.**
- The woman keeps her **hands in her pockets** and wears a **long trench to below the knee** with dark boots.
- The man carries his **newspaper under his arm**.
- The other walker has hands in pockets.
- So no arm swing is needed, and a native coat-hem and boot gait can sell the walk (§4.4).
- Steam and smoke are never baked into runtime plates; they are native.

**People.**
- Unposed; exactly one of each.
- The woman walks toward us as in P1. Her head is tilted down and slightly to her left, watching the pavement, her face in soft shade and not distinct. No eye contact.
- The far walkers walk away (proposal; owner question 4).

**Period care (§9, still unresearched).** Wooden casements; no AC units, satellite dishes, LED lamp heads or modern bollards; plain unbranded cigarettes; pressed-glass ashtray; 1980s silhouettes (broad shoulders, belted trench). The result is an interpretation, not a record.

## 3. The reveal: from line to photograph

**Mechanism: an edge-led fill with a luminous seam.**
- Each region fills inside its own lines.
- Either **edge-in**: a front moves from the contour toward the interior, along a distance field of the region's matte. Used for cup, ashtray, chair and people.
- Or **directional**: away from you across the table and pavement; from the near end toward the vanishing point on each façade; from the rooflines upward in the sky.
- The front is soft (10–24 px at 1080p) and slightly irregular (±6 px, seeded static noise: irregular, never shimmering).
- **The seam:** a thin band at the front, 2–4 px, in the region's line colour, at about 0.6 of line intensity on dark ground (a crisp 0.5-alpha tone on paper). It exists only while the front moves. It is the line's light passing into the image.
- **Settle:** just behind the front, the plate starts at saturation 0.7 and contrast 0.85 and settles to full over 0.7 s. Exposure does not change, so there is no flash.

**Light arrives.** Until about 38 s, filled plates carry a subtle *pre-sun* grade: slightly cooler, with highlights 8 % lower. As the sky fills (38–42 s), it lifts to neutral: the sun comes out. Owner-tunable and subtle (owner question 8).

**The far field arrives from lines too,** never as a wash. V5's colour-wash failure is not repeated. The far field uses the same mechanism, only finer: 0.7 px lines, slower write heads, a softer front (20–32 px) and a faint seam. The sky has no lines. It fills when the ground lifts into the sky plate from the rooflines upward over about 3.5 s.

**People are the last to fill, and they move while still lines.** From about 36 s the woman and the far walkers walk as coloured outline figures through an already-real street. They fill during phase F. A person drawn in light, walking through a real place, is the threshold (§7.6).

**No particles in C.** I considered and rejected:
- particle dust, because the owner rejected the particle material and asked for no stray dots;
- a uniform wash or crossfade, which reads as a transition;
- geometric wipes, which read as a slideshow;
- a "developing photo" exposure from white or black, which risks a flash.

**The overlay accents in C, still sparse:**
- **Registration frames** replace the hairline rectangles.
  - A thin 1 px rectangle locks onto a region when its fill begins and releases when the fill completes.
  - Its geometry is the region's *projected* bounds, recomputed every frame, so it tracks parallax and belongs to the place, not the screen.
  - Colour: the region's line colour at 35–45 % of line alpha.
  - Some frames carry an X (their diagonals), meaning the plate's projection is being registered.
  - A **link** is one thin straight line from a releasing frame to the next one: the chain of attention moving outward from the seat.
  - At most 4 on screen; each lives 0.5–1.4 s and may jump once; about 12–16 in the whole minute.
  - The first three lock onto the cup, the ashtray and the chair (the Week 3 tracking-box legacy, §7.4). None after 47 s.
- **Slips** replace the glitch boxes.
  - A small rectangle (at most 3 % of frame width) at a moving seam, where the plate shows offset by 2–4 px with alternate rows dimmed 15 %. For an instant the place does not quite line up.
  - **No colour split**, because red/cyan fringes would bring cyan back into the picture (owner question 6).
  - At most one at a time, 0.15–0.3 s each, at most 5 per minute; none after 42 s.
- Both taper to none before arrival. Neither appears at all in reduced motion.

## 4. Depth plates for head-coupled parallax

### 4.1 Principle: camera projection onto proxy geometry

- Each plate is projected from the **calibrated rest-pose camera** onto simple proxy geometry: planes for the façades, the pavement, the tabletop and the sky; upright cards for people, lamps, the chair, the cup and the ashtray.
- That proxy geometry is the wireframe's own geometry.
- At the rest pose the composite reproduces the plates exactly.
- Away from rest, parallax is geometrically correct for each proxy, and anything a near object uncovers is filled by the completed plate behind it.

### 4.2 The plate set: three runtime plate runs

Depths are the step-1 virtual values, to be re-measured on RC1. Bands follow planning §6.3.

| Plate | Generated as | Contents | Proxies and depth | Matte |
| --- | --- | --- | --- | --- |
| **RC1** | Master | Everything | Verification only; not a runtime plate unless the owner chooses | — |
| **PL1** clean street | Full frame, nearer content removed and completed | Sky; far mansard and roofline; left façade and awning; right façade; pavement continued to the bottom edge. No people, lamps, chair, table, steam, smoke or shadows of removed things | Sky plane z −40 (far); mansard plane −14; left and right façade planes along their bases, −2.5 to −12 (façade band); awning as a tilted quad from its façade about 1 m into the street, −4 to −7; pavement ground plane −0.6 to −14 | **Vector mattes from the wireframe polylines** (1–1.5 px feather; 6–12 px at the roofline and sky) |
| **PL2** tabletop | Isolated, flat chroma above the table | Table, cup, saucer, ashtray, cigarette. No steam, smoke or chair | Table plane +0.2 to −0.3 (near band). Small upright cards for the cup (z 0, the zero-parallax anchor) and the ashtray (−0.08), so their silhouettes stay upright | Key, plus the vector ellipse of the table's far edge |
| **PL3** figures and occluders | Isolated on flat chroma, separate components | Chair (back completed where the table hid it), woman, man with newspaper, the other walker, near lamp, far lamp | Upright cards: chair −0.12 (yawed to follow its hoop); woman −2.2 at rest (moves); near lamp −3.2; walkers about −6 (moving); far lamp −8 | Key, split by connected components; manual cleanup of the lattice, the lantern and hair |

**Why so few runs.**
- Cup, saucer, ashtray and table sit within about 0.1 m of the zero-parallax plane. Their relative parallax is negligible, so they share one plate. That also bakes in the glass ashtray's view of the table, which needs no matte.
- PL3's subjects do not overlap in P1's layout, so one chroma run yields six isolated elements.

**Native (never plates):**
- Steam: two or three curl-advected ribbons, alpha at most 0.12, warm grey sampled from RC1.
- Smoke: one slow thread.
- The ember's slow pulse.
- Walker contact shadows: soft multiply ellipses, aligned with RC1's shadow direction.
- Walker motion and gait.
- The eye's glint on the coffee at G.
- The ground, lines and accents.
- Later: rain, evening light, lamp glow and wet reflections (P3 packet).

### 4.3 Matting, overscan and risks

**Keying.**
- Plates come back without alpha (assumed until verified).
- Isolated plates use a flat chroma green. Edges are decontaminated, and colour is dilated under alpha 0 to avoid fringes.
- The plate's **own pixels with their own alpha** are composited. RC1 pixels are not cut with a misfitting matte.

**Registration.**
- Generative edits can drift. Align each plate to RC1 offline using features in unchanged areas, then inspect a 50 % overlay or difference image.
- Reject drift above about 0.3 % of frame width after alignment.
- Match colour statistics to RC1 per plate.

**Overscan.**
- Display the central ~88 % of the plates at rest (about 6 % margin per side), so that far layers never run out at the head-box extremes.
- This costs a slightly tighter arrival frame than RC1: the chair is cut a little more and the table edge sits lower.
- The alternative is an outpainting run, which needs an upload of a padded RC1 (owner question 7).

**Known risks:**
- Double edges from misregistration.
- Exposure mismatch between regenerated plates.
- Green spill on white marble, porcelain and hair.
- Lattice and lantern alpha quality.
- A sliver of disocclusion behind the awning (fallback: PL1b, a street plate without the awning).
- Upsampling softness on a 4K demo monitor (owner question 11).
- The woman's upscale limit: keep her path at no more than 1.5× her plate scale.
- Rights and terms review before any runtime use (planning §11; owner decision 2).

### 4.4 Walkers

**Option A (recommended for step 1).**
- Cut-out cards travel along authored 3D lanes at a stroll, scaled by perspective.
- A native **puppet warp** shears the lower ~45 % of each figure at stride frequency: the coat hem and boots alternate within ±2–3°, with a 0.6–1 % vertical bob and a small shoulder sway.
- Hands in pockets and the newspaper under the arm make this believable.
- Walkers enter and exit only behind occluders (the lamp, the far end, the chair or the frame edge). One card per identity; never two on screen.

**Option B (later, owner decision).**
- Frame sequences cut from a generated walking video on a matte background.
- This would put frames of a generated clip into the render loop, which planning §2 deliberately kept out. It needs an explicit owner exception (owner question 3).

### 4.5 Wallpaper

- The wallpaper is EVA's own render of the arrival composite from the rest pose, at monitor resolution.
- At G, only the sky above the rooflines turns transparent onto it, feathered inside the sky.
- A realistic sky is low-frequency, so a hard roofline never straddles the seam (planning §6.4).

## 5. Timing on the A–G timeline (`core/timeline.ts`)

| Phase | Time | Picture in C | Gain |
| --- | --- | --- | --- |
| A Heard | 0–5 s | The Week 3 eye leans in; tracking boxes gather on the pupil. No lines yet | 0 |
| B Clearing | 5–12 s | Windows glide aside. The field settles into the chosen ground (dark: gathers from the eye outward over ≥3 s; paper: as planned). The eye travels to the vanishing point (about x 0.50, y 0.545; re-measure on RC1) and shrinks to a point; its dither cells settle into the ground's faint grain and vanish | 0 |
| C Survey | 12–22 s | Veil opaque at 12.0. Horizon leaves the pupil 12.0–12.8; table rim 12.8–14.2; cup and saucer 13.6–15.0; ashtray and cigarette 14.4–15.6; chair 15.0–16.6; perspective guides from the frame edges inward 15.6–17.6; woman (static contour) 16.8–18.0; lamps and walkers 17.6–18.8; façade openings near→far 17.8–21.0; awning 19.4–20.4; mansard 20.4–21.6. Frames lock on cup (~15.0), ashtray (~15.6), chair (~16.6). State at about 21.5 s = **WC1** | 0 → 0.25 (the lines have depth) |
| D Near fill | 22–32 s | `stage.setFarField` at 22.0 under the veil; the cup is heard on its saucer. Cup and saucer fill 22.6–24.2; table outward 23.2–26.0; ashtray and cigarette 24.4–26.0; chair 25.6–28.4; first pavement strip 27.6–31.0. Ground lift begins at 26 (dark). Frames on the woman (~28) and lamp (~30); one slip at the chair seam (~27). State at about 31 s = **WC2** | 0.25 → 0.5 |
| E Street and light | 32–44 s | Espresso heard at 32; steam appears at 33. Pavement 32–36; left façade and awning 33–38.5; right façade 34–39.5; near lamp 36–37.5; far lamp 37.5–38.5; mansard 39–42; sky last 40.5–44. Pre-sun grade lifts 38–42. Walkers start moving as outline figures at about 36. One slip at about 35; no slips after 42. State at about 41 s = **WC3** | 0.5 → 0.75 |
| F Inhabiting | 44–54 s | The woman fills from her contour inward while walking, 44.0–46.5; her line fades by 47.5 and her contact shadow fades in. Smoke begins at about 45. Far walkers fill 47–50. The last registration frame releases at about 46.5. Footsteps, a moped, a chair scrape | 0.75 → 1 |
| G Arrival | 54–60 s | Any residual line dissolves by 55. The sky turns transparent onto the wallpaper. EVA's line at 55. The eye is a faint glint on the coffee for about 2 s, then just its highlight. Then nothing but the street | 1 |

Something new is perceptible every 3–5 s; the timing above already places events about that often.

**Sound** follows DESIGN_PROMPT §5. The pen scratch becomes a much quieter, finer stylus whisper under the write heads.

## 6. Reduced motion, skip and departure

**Reduced motion** (`arrival-reduced`, about 15 s):
- A eye (0–3 s); B ground under the veil (3–5 s); then crossfades of 800 ms into native stills: C all lines at once (5–7.5 s), D near fill (7.5–10 s), E street fill (10–12.5 s), G arrival (12.5–15 s).
- No write heads, glow animation, accents, slips or moving seams.
- Walkers static, or at no more than 25 % speed with at most half the gait amplitude.
- Steam and smoke slow; parallax off unless opted in.

**Skip** (about 6 s, to the identical end state):
- Accents clear at once.
- Undrawn lines appear by a 1 s crossfade.
- All unfilled regions fill together with a soft front at about 4× speed over 4 s.
- Lines fade in the last second.
- Required staging cues are still emitted.

**Graceful departure** (`return-graceful`, 5 s; *the lines retract*):
- **R1, image lifts (0–2 s):** far first. The sky returns to ground, then the mansard, façades and lamps. The walkers return to outlines and stop. Then the pavement. **The cup is the last real thing.** As the image leaves each region, its lines come back at full strength.
- **R2 (2–4 s):** every line un-draws back along its own path, far lines first. The horizon is the last line, retracting into the pupil.
- **R3 (4–5 s):** the eye returns, and restoration begins.
- **Esc** skips all of this and restores immediately.

## 7. Negative rules

DESIGN_PROMPT §6 is kept in full. Added for C:

- **Palette:** Paris palette only. No teal, coral, apricot, plum, cyan, blue or neon; no saturated green glow. No red wash, and no EVA red in the scene unless the owner chooses it (owner question 5).
- **Line language:**
  - No CAD annotations, dimension lines, arrows or numbers.
  - No grid floor or grid sky, no triangle meshes, no wireframe spheres.
  - No axis gizmos, crosshairs or reticles.
  - No hexagons, glyph rain or HUD.
  - No scanline sweep across the frame, no hologram flicker, no full-frame chromatic aberration, no strips or smear bands.
- **Glow:** on lines only, never on plates. No bloom haze, no lens flare.
- **People:** outlines only. No face meshes, skeletons, stick figures or motion-capture dots.
- **No particles, specks or stray dots.**
- **Plates must not contain:**
  - baked motion blur, baked depth of field or a vignette;
  - shadows of removed objects;
  - duplicated, ghosted or transparent figures;
  - smoke or steam;
  - reflections of people;
  - modern intrusions or readable text.
- **No full-frame flashes.** Mean frame luminance changes gradually; the ground lift and sky fill are slow.
- **One walker each.** Nobody looks at the camera. The woman's face is never readable.
- **No Animus or Assassin's Creed assets** or imitation.

## 8. Composition and palette deltas from DESIGN_PROMPT §4–§5 (recorded, not silent)

- Awning: P1's shop awning on the left façade, not an overhead valance. The `obj:awning` fixture reconciliation stays pending (step-1 REVIEW §11).
- No parked car and no coins, as in P1.
- The cup sits at x≈0.70.
- Line-colour values (§2.1) are new proposals derived from §5 and the step-1 tokens.

## 9. Owner questions

1. **Ground:** dark warm graphite (recommended) or warm paper? Decided by comparing WC1-D and WC1-P.
2. **Realism level:** if RC1 feels too far from P1, try one realist-painting variant (RC1-alt)?
3. **Walker motion:** Option A, cut-outs with a native gait warp (recommended for step 1), or Option B, frames from a generated walking video, which needs an exception to planning §2?
4. **Far walkers:** walking away (proposal) or toward?
5. **EVA red:** none (default), or let the first horizon line leave the pupil in EVA red for about 1 s before it takes the limestone colour?
6. **Slips:** no colour split (default), or keep the earlier red/cyan edge? The latter conflicts with Paris palette only.
7. **Overscan:** crop about 6 % per side (default), or spend an outpainting run, which needs a padded-image upload?
8. **Pre-sun grade:** keep "the sun comes out" at 38–42 s, subtly, or drop it?
9. **Step-1 scope for C:** arrival + survey still + one near reveal (recommended), or arrival only?
10. **Terms:** who records the provider-terms note and the inventory schema revision before any plate runs at runtime?
11. **Demo monitor resolution:** 2K plates upsample on a 4K monitor.
12. **Leaving out the car and coins:** confirm.

## 10. Feedback questions added to §14 (asked emotional-first, as before)

- Did the lines feel like something measuring the place with care, or like a CAD program or a game?
- When each part became real, did it feel like the place arriving, or like a transition effect?
- Did the woman feel like a person walking, or like a cut-out?
- Did the arrival still feel like P1: the same quiet afternoon, now real?
