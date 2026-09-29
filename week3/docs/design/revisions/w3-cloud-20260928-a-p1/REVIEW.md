# Weave reference review — w3-cloud-20260928-a-p1

## Quick review

- Pass: **p1, dissolve-and-reform grammar**. Source `8227623`. Batch ledger: [LEDGER.md](../w3-cloud-20260928-a/LEDGER.md). Research: [REFERENCE_RESEARCH.md](../w3-cloud-20260928-a/REFERENCE_RESEARCH.md).
- Status: **image set approved by the owner (2026-09-29); motion reference generated and inspected; implementation in progress.** Owner acceptance of any implementation remains pending.
- Contact sheets: [first full frames](references/contact-sheet.png), [abstract redos](references/contact-sheet-v2.png).
- Overlay previews (local ffmpeg composites over a generated synthetic desktop, not app captures): [screen blend only](references/overlay-mockups/overlay-sheet.png), [soft dark halo](references/overlay-mockups/halo-sheet.png), [strong dark halo](references/overlay-mockups/strong-halo-sheet.png). The earlier [wallpaper-style mockup](references/desktop-mockups/depth-test-sheet.png) is rejected: EVA is a floating agent over the desktop, not a background.
- Current candidates, selected by the agent and not accepted by the owner:
  - rest [img-07](references/images/img-07-rest-eye-full.png)
  - thinking [img-08](references/images/img-08-thinking-full.png)
  - comfort [img-14](references/images/img-14-comfort-fold.png)
  - joy [img-21](references/images/img-21-joy-shimmer.png)
  - congratulation [img-22](references/images/img-22-congratulation-helix.png) (rising helix; replaces the bloom, which the owner found too similar to comfort)
  - supportive [img-19](references/images/img-19-supportive-soft-edge.png)
- Final-direction previews: [pure light, small rest / grown response](references/overlay-mockups/final-overlay-sheet.png) and [rest placement over white vs dark](references/overlay-mockups/rest-placement-sheet.png). Owner chose **pure light, no halo** and **small at rest, grows to respond**.
- Selected video: [vid-01 rest to comfort](references/videos/vid-01-rest-to-comfort.mp4), with [12 sampled frames](references/videos/vid-01-frames.png) (sampled, not watched in real time).
- Owner decision: image set approved; **implementation p1-a2 approved 2026-09-29** ("Approve whatever this belongs to", on the p1-a2 motion samples). Not Week 3 phase acceptance.
- Before: [baseline capture](../w3-cloud-20260928-a-baseline/). After: [p1-a1](../w3-cloud-20260928-a-p1-a1/) (attentive-dissolve bug), [p1-a2](../w3-cloud-20260928-a-p1-a2/) (current). Comparisons: [baseline vs p1](implementation/compare-baseline-p1.png), [p1-a2 motion samples](implementation/p1-a2-motion-samples.png), [seeded variations](implementation/p1-a2-variations.png). Critique in the [ledger](../w3-cloud-20260928-a/LEDGER.md).

## Direction as refined with the owner

The eye's dither dots become particles with depth, never a flat 2D pixel grid. At rest the particles form the red eye with its square pupil; during processing it thins into a white filament point cloud with soft sideways smears. While speaking, the particles flow into an abstract formation, then return. Formations must stay abstract (nothing concrete), fully contained on a desktop monitor, and softly three-dimensional. Joy is the deliberate exception to containment: the eye bursts into a shimmer that envelops the viewer.

| State | Structure principle (abstract) | Current candidate |
| --- | --- | --- |
| Rest / attentive | Red particle eye, square pupil, gaze | img-07 |
| Processing | Filament point cloud, soft RGB time-smears | img-08 |
| Comfort | One broad sheet draping and folding over itself, settling low | img-14 |
| Shared joy | Eye bursts into scattered shimmer through 3D space | img-21 |
| Congratulation | Particle helix climbing and opening into drifting sparks at its crest | img-22 |
| Supportive | Upward-curving mass beneath one small steady light; wispy edges | img-19 |

## Candidates

Route, model IDs, settings, costs and prediction IDs are in [provenance.json](provenance.json). Rejected candidates are retained in place.

| Asset | Status | Observation |
| --- | --- | --- |
| img-01 four-forms board | rejected (owner) | Smooth 3D objects (lotus, arch, cushion): "too realistic". |
| img-02 congratulation end frame | rejected (owner) | Translucent five-lobed flower; too realistic. |
| img-03 clean eye plate | utility | Faithful Week 1 eye without UI; input for later runs. |
| img-04 abstract colour fields | rejected (owner) | "too pixelated, dithering should not be a translation for 2D pixels". |
| img-05 stipple volumes | rejected (owner) | Soft-body blobs; "graphic rendition would be intense". |
| img-06 particle grammar board | direction liked (owner) | Several panels cropped. |
| img-07–img-12 full frames | mixed | 07/08/09 contained; 10/11/12 cropped. |
| img-13 congratulation outpaint | superseded (owner: too similar to comfort) | Whole bloom contained. |
| img-14 comfort fold | candidate | One clear drape, contained. |
| img-15 joy clusters | rejected (owner) | "clusters seem like a bad idea for joy". |
| img-16 supportive held light | superseded | Hard spherical edge (owner). |
| img-17 rest eye depth | not selected | Foreground bokeh too heavy for a desktop. |
| img-18 congratulation depth | superseded (bloom retired); depth level adopted | Calm depth with small soft motes and haze. |
| img-19 supportive soft edge | candidate | Edge dissolves into wisps. |
| img-20 synthetic desktop | utility | Invented content; contains OS and browser UI icons; local review only. |
| img-22 congratulation helix | candidate | Gold/coral/magenta helix, crest opening into sparks; contained; distinct from comfort. |
| img-21 joy shimmer | candidate | Faint red eye trace bursting into apricot/gold/mint shimmer, large soft sparkles toward the edges. |

## Overlay finding

A purely light-emitting overlay (screen blend) almost disappears over white application windows; it reads only over the dark wallpaper. A soft dark halo that dims the content beneath EVA restores legibility (strong-halo mock) but, at the current size, covers the centre of the user's work. Size, placement and halo strength are open owner decisions before implementation.

## Implementation guidance

See `implementationGuidance` in [provenance.json](provenance.json). Video observations: 0–0.8 s the eye holds while the upper-lid particles brighten; 1.2–2.1 s the upper lid peels away as a pale rose sheet arching over the eye; 2.5–3.3 s the sheet spreads and lowers while the colour cools; the iris and square pupil survive until covered; 3.75–4.6 s it settles into the drape.

With pure light (owner decision), the small rest eye disappears over white windows and reads well over dark areas ([comparison](references/overlay-mockups/rest-placement-sheet.png)). Implementation note: default placement should favour darker screen regions, and the eye must be user-movable.
