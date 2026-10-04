# w4-20261003-paris-p1-s3-week3-ink: the café in Week 3's emotional material

**Status:** three candidates generated and inspected. **S3c is the provisional aesthetic direction**, selected by the coordinating agent; owner review is pending. P1 is incomplete (no construction keyframes or video studies yet), so UI and renderer work stay blocked.

![Contact sheet](references/contact-sheet.png)

| Candidate | Job | Selection | Owner |
| --- | --- | --- | --- |
| [img-01-s3a-arrived-ink.png](references/images/img-01-s3a-arrived-ink.png) | S3a, edit of S2d | Not selected: stipple fill, but S2d's outlines survive | Pending |
| [img-02-s3b-remembered-ink.png](references/images/img-02-s3b-remembered-ink.png) | S3b, edit of S2d | Not selected: as S3a, plus indigo/teal currents and a hairline box on the cup | Pending |
| [img-03-s3c-particle-memory.png](references/images/img-03-s3c-particle-memory.png) | S3c, new image from the Week 3 references | **Provisional aesthetic direction** | Pending |

All images are 2752×1536. Run IDs, approvals and costs are in [provenance.json](provenance.json).

## Why this revision exists

Owner feedback on [S2d](../w4-20261003-paris-p1-s1/REVIEW.md) (2026-10-03): the composition was liked, but the images "don't feel like a specific aesthetic" and read as generic AI illustration. The owner asked to incorporate Week 3's emotional states and their aesthetics.

This changes the art direction in [DESIGN_PROMPT.md](../../../../DESIGN_PROMPT.md) (ink line over watercolour) at the owner's request. The brief's composition, depth, anchors, restraint rules and arc still apply. Only the material changes.

**Week 3 sources (owner-approved, inspected):**
- [ink state board](../../../../../week3/docs/design/revisions/w3-cloud-20260929-b-p1/references/images/img-05-ink-state-board.png);
- [joy ink](../../../../../week3/docs/design/revisions/w3-cloud-20260929-b-p1/references/images/img-07-joy-ink-shimmer.png);
- the approved comfort implementation capture ([p3-a2](../../../../../week3/docs/design/revisions/w3-cloud-20260928-a-p3-a2/comforting-2.png));
- [week3/DESIGN.md](../../../../../week3/DESIGN.md) §4–6.

Both reference images were passed as their existing Weave outputs. Nothing was uploaded.

## Inspection

**S3a and S3b.** These are edits of S2d. Close up, fills, steam and the awning became stipple, and near bokeh appeared. S3b also added indigo/teal particle currents and a faint hairline box on the cup. But every S2d outline survived, so both read as a conventional illustration with effects layered on top. The newspaper pseudo-text also persists. Editing preserves structure, which is the wrong tool for a material change.

**S3c** is a new image with the Week 3 references as the primary inputs.
- **Material:** particles only. There are no outlines; every form frays into loose specks. This matches the Week 3 board.
- **Emotional palette:**
  - the awning is dense crimson, the rest-eye colour;
  - the table is apricot/gold/coral (joy);
  - the cup and walkers are plum/rose (comfort);
  - the lamp post and far specks are teal/indigo (supportive);
  - steam is a gold speck thread; smoke is a pale plum thread.
- **Depth reads from the material itself:** dense large specks near, sparse fine specks far, large soft bokeh closest. The street fades out with no hard roofline. That is exactly what the wallpaper far field needs.
- **Fit with the renderer:** a particle scene with a depth value per particle is the natural input for real off-axis parallax, and Week 3's renderer is already particle-based.

**S3c weaknesses** (targets for the proposed S3d):
- **Too many large bokeh discs.** They cover the sky and right edge and start to read as polka dots; Week 3 flagged the same risk.
- **Paris and the 1980s have nearly vanished.** No balconies, shutters, zinc roof or car remain. The four walkers are generic, clustered at similar depths and walking away.
- **The ashtray is a thin black dotted ring** and the cigarette is barely visible.
- **The rattan weave is a regular diamond grid**, which looks like a pattern rather than woven cane.
- **The cup moved** to x ≈ 71%, y ≈ 83% and the ashtray to x ≈ 33%, y ≈ 87%, so registration with S2d is loose.

## Proposed rule: scene states borrow Week 3 stances

This is a proposal for the owner, not adopted:

| Scene state | Week 3 stance and material |
| --- | --- |
| EVA, construction and leaving | Rest eye, crimson; tracking and glitch boxes |
| Arrival, late afternoon | Joy warmth (apricot/gold) with comfort shade (plum/rose) |
| Rain | Comfort: plum/rose drape, softened, slower particles |
| Evening | Supportive: indigo/teal currents around an amber core, which becomes the lamp |
| Rain and evening together | Comfort drape over supportive currents |

## Implementation guidance (provisional)

- Build the scene as particles with a depth value per particle, not as textured planes. Near objects get dense large particles; far objects get sparse fine ones; a few large defocused particles sit closest to the viewer.
- Keep the far field as sparse specks fading into paper, so the wallpaper split falls in empty paper rather than across a roofline.
- Reuse Week 3's palettes and its hairline tracking-box language for the construction phases.
- Walkers are separate particle clouds at distinct depths (native placement, as recommended in the S2 round).

## Owner acceptance

Pending. The agent's selection is not acceptance.
