# w4-20261003-paris-p1-s1: S1 master scene and S2 depth variants

**Status:** S1 and four S2 depth variants generated and inspected. **S2d is the provisional environment base**, selected by the coordinating agent; owner review is pending. Walker depth is **not resolved** in any candidate (see the S2 round). **The P1 packet is incomplete.** Construction keyframes and video studies have not run, so no UI or renderer work is cleared by this folder.

![Contact sheet](references/contact-sheet.png)

| Candidate | Job | Selection | Owner |
| --- | --- | --- | --- |
| [img-01-s1-master.png](references/images/img-01-s1-master.png) (2752×1536) | S1 | Superseded as base (flat façade, walkers at one depth) | Pending |
| [img-02-s2a-oblique.png](references/images/img-02-s2a-oblique.png) | S2a | Not selected: strong oblique recession, but a second lamp post was added and the walkers are unchanged | Pending |
| [img-03-s2b-receding.png](references/images/img-03-s2b-receding.png) | S2b | Not selected: best recession, but the walkers are unchanged | Pending |
| [img-04-s2c-layered.png](references/images/img-04-s2c-layered.png) | S2c | Not selected: best walker layering (teen far), near lamp post, cobbles; façade still flat | Pending |
| [img-05-s2d-combined.png](references/images/img-05-s2d-combined.png) | S2d | **Provisional environment base** | Pending |

All images are 2752×1536.

There are no videos yet. `references/videos/` and `implementation/` will be created when real outputs or captures exist.

## Scope and source

- **Pass:** Week 4 P1 arrival packet, first job only (S1), which is used to choose framing before quoting the rest of P1 ([WEAVE_JOBS.md](../../WEAVE_JOBS.md)).
- **Source revision:** `2e640b5` on `week4`, the final W4-1 foundations commit. Accepted Week 4 visual baseline: none.
- **Route:** direct model. `weave_list_tools` returned no workflows. Nano Banana 2, `fal-ai/nano-banana-2/edit` (Weave id `bebebed5-…`), was used text-only with no upload.
- **Inputs:** the [DESIGN_PROMPT.md §11](../../../../DESIGN_PROMPT.md#11-master-prompt) master prompt verbatim; 16:9; 2K; 1 output; random seed; web search off. The 16:9 ratio is an assumption, because the demo monitor's aspect is not recorded in the plan.
- **Run:** prediction `ff83853e-952e-428f-a283-edc58ff2ee90`. Quoted 9 credits, approved by the owner for this exact run, submitted once, reported cost 9. Details are in [provenance.json](provenance.json).

## Inspection

The full frame was viewed, plus full-resolution crops of the table objects, the newspaper, the cassette player and the car. Positions below are approximate fractions of width (x) and height (y), read by eye.

**Matches the brief**
- **Anchors are all present and legible.**
  - The faded red scalloped awning valance runs along the top (y 0–10%). It is the only red in the frame, so the environment is not red-washed.
  - The round worn marble table fills the bottom ~21% (from y 79%).
  - A thick white cup on its saucer, with steam, sits at x ≈ 65%, y ≈ 85%. A torn sugar stick lies on the saucer.
  - A heavy glass ashtray with ash and a half-smoked unbranded cigarette sits at x ≈ 39%, y ≈ 88%, with a smoke thread. Two coins lie beside it.
  - An empty honey rattan chair is cut by the left edge (x 4–27%).
- **Passers-by.** Three walkers, all in profile and none looking at the viewer: a woman in a belted, broad-shouldered trench coat; a man in a pale jacket with a folded newspaper; a teenager with foam headphones and a belt cassette player.
- **Street.** Cream limestone façades, iron balconies, muted green shutters, a zinc roof with chimney pots, a lamp post and a small hatchback with no visible badge.
- **Clean, separable planes.** The near table and objects, the chair, the walkers, the car, the façade, and the roof and sky barely interpenetrate. This suits native reconstruction from layered plates.
- **Mood.** Quiet and unhurried. There are no landmarks, berets, screens or modern intrusions.

**Departs from the brief or is risky for implementation**
1. **Little perspective recession.** The façade is a nearly frontal elevation and the street runs parallel to the picture plane. Off-axis parallax would therefore read as a few stacked flats unless intermediate depth planes are reconstructed, such as the curb, the street surface and the car. The seated horizon (~40–45% in the brief) is only weakly implied.
2. **Walkers are lined up at one depth** and evenly spaced like a parade, rather than overlapping at different depths. The lamp post sits at x ≈ 27%, behind the woman, so it does not occlude walkers in turn (the brief has it at x ≈ 78%).
3. **The style is tidier than the brief.** It reads as clean editorial illustration with flat wash, not loose ink over transparent watercolour. The far façade is not clearly lighter or more linear than the near objects, so selective colour is weak. The low warm sun from the left and its long shadows are barely present.
4. **The far-field boundary is hard.** The right roofline and chimneys are crisp against a small sky, and only the upper corners fade to paper. The plan says no hard roofline should straddle the wallpaper/foreground boundary, so the wallpaper split cannot be cut from this frame as-is.
5. **Text-like marks.** The cassette player has pseudo-glyphs; the newspaper and coins have illegible scribble and embossing; there is a small scribble on the wall at about x 60%, y 63%. None is legible, but the "no text" rule is not fully met.
6. **The near table edge is sharp, not softly out of focus.** The cup is clean rather than chipped, and there is no ring stain.
7. **Era plausibility is unverified.** The hatchback silhouette could read as late-1980s or early-1990s. The wardrobe is a hypothesis (DESIGN_PROMPT §9).

## S2 round: depth and walker fixes

Owner direction (2026-10-03): fix depth and walkers first, with each run quoted and approved separately and a ceiling of about 500 credits for the rest of P1. All four runs were edits of earlier outputs with the same model and settings (16:9, 2K, 9 credits each). Prediction IDs are in [provenance.json](provenance.json).

| Variant | Depth | Walkers | Other |
| --- | --- | --- | --- |
| S2a oblique (S1 input) | The façade recedes strongly to a right-side vanishing point; the roofline converges and fades to paper | Unchanged from S1: all three at one depth | A second lamp post appeared mid-frame; the car is now foreshortened |
| S2b receding (S1 input) | A central side street recedes to a vanishing point near x 49%, y 57%; its far end fades to paper | The main three are unchanged; a small fourth figure appears far down the street | Lamp post moved to x ≈ 66%, but it occludes no walker |
| S2c layered (S1 input) | Façade still frontal, but lighter and more linear; cobbles converge | **Teen moved far and small.** Woman and man are still at one depth | Lamp post moved to the near curb at x ≈ 73%, in front of the car; newspaper now plain |
| S2d combined (S2c and S2b inputs) | **S2b's central street inside S2c's layout**, fading to paper | The man was **not** moved; the teen was replaced by a far figure walking toward the viewer with a visible face | At full resolution a halftone dot texture appears, a degradation after repeated edits; newspaper pseudo-glyphs are back |

**Finding.** The edit model reliably changes architecture and depth, but it resists resizing or moving figures it already contains. Two attempts each left the man at the woman's size. More edits of this kind are unlikely to fix walker depth at 9 credits a try.

**Recommendation.** Use S2d as the *environment* base: recession, a near lamp-post occluder, a cobbled ground plane and a paper far field. Solve walker depth natively. The renderer places passers-by as separate depth layers anyway (the plan's pavement band, with the lamp post occluding them in turn), sourced from the A3 passer-by sheet. Target walker depths:
- near, on our pavement, cut by the table;
- middle, on the street, passing behind the lamp post;
- small, in the side street, in profile and not facing us.

S2d's frontal far figure and its halftone texture are excluded from any plate.

## Implementation guidance (provisional)

This is for planning only. It must not be implemented until the rest of P1 exists and has been inspected.
- Keep the **anchor positions** above as candidate scene-fixture coordinates: valance, table, cup, ashtray and chair. The cup is the zero-parallax anchor.
- **Depth bands** inferred from this frame:
  - near: table, cup, ashtray, chair, valance;
  - pavement: walkers;
  - street: car and curb;
  - façade;
  - roof and sky (far field).
  Add intermediate planes deliberately (curb, street surface, lamp post moved forward) to avoid a stacked-card look.
- The **far field needs a softer paper fade** above the roofline before the wallpaper split can be tested.
- Remove or repaint the pseudo-text in any adopted plate. Generated images remain references, not runtime textures, until rights and adoption are recorded.

## Proposed next jobs (not run, need per-run quotes and approval)

After the owner decides on the S2d base:
1. C2–C4 construction keyframes, and the A1–A3 plates and sheets, as edits of the selected base.
2. Discover a video model (read-only), then quote the V1–V4 studies individually.

See [VISUAL_CLOUD_REPORT.md](../../../../VISUAL_CLOUD_REPORT.md).

## Owner acceptance

Pending. The agent's framing selection is not acceptance.
