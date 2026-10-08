# w4-20261005-paris-p1-glitch-paris: Paris palette and glitch-in construction

**Status:** three images and one 10 s video generated and inspected. **The owner chose the painterly look and the shop awning (K1/K2) over R1's stipple and canopy.** [V4](references/videos/vid-01-v4-k1-to-k2-glitch.mp4) (K1 → K2) is the provisional glitch-in motion reference. A settled painterly end frame is quoted but not run (budget reached). Owner review of V4 is pending; UI stays blocked.

![Contact sheet](references/contact-sheet.png)

| Candidate | Job | Selection | Owner |
| --- | --- | --- | --- |
| [img-01-r1-paris-recolour.png](references/images/img-01-r1-paris-recolour.png) | R1, H1 recoloured | Not chosen as the finished look (owner chose painterly); palette reference | Pending |
| [img-02-k1-early-glitch.png](references/images/img-02-k1-early-glitch.png) | K1, early glitch-in | **Glitch-in start keyframe** (owner-chosen look) | Pending |
| [img-03-k2-two-thirds-glitch.png](references/images/img-03-k2-two-thirds-glitch.png) | K2, two-thirds in | **Owner-chosen look and awning**; not a settled frame | Pending |

All are 2752×1536 Nano Banana 2 edits of [H1](../w4-20261003-paris-p1-s3-week3-ink/references/images/img-09-h1-no-hem.png), 9 credits each, approved by the owner. Run IDs are in [provenance.json](provenance.json). Source revision `f3f48ba`; previous packet: [p1-s3-week3-ink](../w4-20261003-paris-p1-s3-week3-ink/REVIEW.md).

## Owner direction (2026-10-05)

> The glitch strips should be glitching not neatly falling into places, refer to the animal gif with overlay boxes, thats how I want the scenes to slowly appear. Also change the color, the colors of these particles kind of ruin the vibes of the request, change the colors into what fits best with the paris environment.

**References re-inspected.** Both are owner-selected Week 3 pivot references. They are described to the model in text only, not uploaded, because their rights are unverified.
- **Klickpin animal video** (45 s, 30 fps, sampled at 8 fps):
  - Every ~0.125–0.25 s the overlay reconfigures: 5–30 hairline grey rectangles, many crossed corner to corner with an X, appear, jump, resize and regroup over detail regions, linked by thin straight lines.
  - Subjects flicker between an outline sketch and a filled image.
  - Its tiny numeric labels are excluded here (brief: no numbers or HUD).
- **Glitch GIF** (`0268915e…`, 1.14 s, 19 frames): a walking figure torn every frame by horizontal smeared colour bands and pixel fragments.

**Palette.** This returns to the Opus brief's Paris palette ([DESIGN_PROMPT §5](../../../../DESIGN_PROMPT.md#5-materials-colour-type-sound)): paper, limestone, sage shutters, zinc, iron, a faded red awning, marble, porcelain and espresso, honey rattan, and muted period clothing. It replaces the Week 3 emotion palette at the owner's request. The Week 3 *material* (stipple particles) and *construction grammar* (wireframe and boxes) remain.

## Inspection

**R1, the Paris recolour.**
- **Achieved:**
  - The particle material and composition are unchanged.
  - Cream limestone with sage shutters and dark iron balconies; a zinc mansard with chimneys; a dark iron lamp post.
  - The woman wears a camel trench; the walkers wear navy and oatmeal.
  - A white porcelain cup of espresso; a pale marble table; a honey rattan chair.
- **Remaining issue:** the canopy is still a strong raspberry-to-pink gradient over the top third, redder than "faded brick". It is the one element that still pulls the mood away from Paris.

**K1, early glitch-in.**
- **The glitch grammar the owner described is present:**
  - Horizontal strips of the woman, the cup and a duplicate cup are torn and smeared sideways with red and cyan fringes.
  - Hairline boxes, many X-crossed, sit around the cup, ashtray, walkers, lamp and an awning fragment, linked by straight lines into a constellation.
  - Most of the frame is still graphite wireframe on paper.
- **Deviations:**
  - The resolved patches are rendered as painterly illustration (realistic veined marble, flat-painted shutters), not stipple particles.
  - The overhead canopy is reinterpreted as a separate shop awning at the upper right.
  - The ashtray is now black glass.
  - There are about 15 boxes, not 30–40.

**K2, two-thirds in.**
- **Present:**
  - Two wide horizontal bands are torn and smeared across the left and right façades, cutting through the woman.
  - The walker is duplicated (ghosted), and about 15 X-crossed boxes linked by lines frame the walkers and lamp.
  - The Paris palette reads well.
- **Deviations:**
  - The style has become a polished painterly illustration, with little stipple left.
  - The overhead canopy is gone: the top is open sky, and a shop awning hangs on the left façade. That changes the seated "under the awning" framing.

## Owner choices and V4 (2026-10-05)

**Choices:**
- The finished look is **painterly (K1/K2)**, not stipple (R1).
- The awning is **the shop awning on the façade (K2)**, not the overhead canopy.

The owner first approved V4 ending on R1. The agent flagged that this ending conflicted with these choices, and the owner switched the video to K1 → K2. The K1 → R1 version was not run.

| Video | Job | Selection |
| --- | --- | --- |
| [vid-01-v4-k1-to-k2-glitch.mp4](references/videos/vid-01-v4-k1-to-k2-glitch.mp4), [frames 3 fps](references/videos/vid-01-frames.png), [frames 12 fps, 2–3 s](references/videos/vid-01-frames-12fps-2to3s.png) | V4, K1 → K2, Kling First & Last Frame (O1 Pro), 10.08 s, 24 fps, 109 credits | **Provisional glitch-in motion reference** |

**Inspection.** Frames were sampled at 3 fps, with a 12 fps burst for 2–3 s. The average frame-to-frame brightness change was measured over all 242 frames: mean 0.77, max 2.74 at 7.46 s, so there are no full-frame flashes. The agent did not watch the clip in real time.

**Sequence:**

| Time | What happens |
| --- | --- |
| 0–3 s | The K1 state: about 10 X-crossed hairline boxes linked by lines around the cup, woman, lamp and the floating awning fragment. Smeared horizontal strips cut through the woman, cup and table. **The ashtray flickers between black and clear glass** several times before holding as clear glass, the "flicker between states" behaviour from the animal reference. |
| 2.3–3 s | The left façade and its shop awning paint in, in roughly 0.25 s steps; the mansard resolves at the street end |
| 3.3–4.7 s | The right façade resolves. The floating upper-right awning fragment **glitches out and disappears** at about 4.3–4.7 s |
| 3.7–9.7 s | **Torn smear bands keep recurring in new places** (around 4.0, 4.3, 5.7, 6.0, 6.3, 7.0–8.0 and 9.3–9.7 s). The largest burst is at about 7.4 s. Nothing settles neatly, as requested |

**Against the request:**
- **Glitching rather than falling neatly into place: met.**
- **Paris colours: met.**
- **Box density: improved but not met.** The boxes are dense early, then sparse: a few hairline frames around the walkers from ~4 s. Native authoring of the box layer remains the recommendation.
- **End state:** the video ends on K2, still mid-glitch, so there is no calm arrival frame. The settled painterly end frame P1 is quoted at 9 credits but not run, because the budget is reached.

## Implementation guidance (provisional)

**The glitch-in is driven natively by the construction timeline:**
- **Regions:** they stutter between wireframe and resolved several times before holding, nearest first.
- **Tears:** horizontal tear bands of 1–4 at a time, each a 2–12% height slice, displaced sideways 3–25% of the width and smeared, with a red/cyan fringe. They re-randomise every 2–6 frames.
- **Box constellation:** 10–40 hairline graphite rectangles, about half X-crossed, linked by straight lines. It reconfigures every ~0.125–0.25 s, clusters on the region being resolved, and thins to zero at arrival.
- **Limits:** no numbers or labels, and no full-frame flash.
- **Reduced motion:** no tearing or box jumps; keyframe crossfades only.

**Owner choices made (2026-10-05):** painterly finish and shop awning. The previous canopy and stipple guidance is superseded for the arrival look.

## Owner acceptance

Pending. The agent's selection is not acceptance.
