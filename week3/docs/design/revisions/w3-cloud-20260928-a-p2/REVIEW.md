# Weave reference review — w3-cloud-20260928-a-p2

## Quick review

- Pass: **p2, seeded variation**: every occurrence of an emotion is composed differently while staying the same family. Builds on owner-approved p1-a2. Batch ledger: [LEDGER.md](../w3-cloud-20260928-a/LEDGER.md).
- Status: **references approved by the owner; implementation captured as [p2-a6](../w3-cloud-20260928-a-p2-a6/).** The owner did not decide on p2-a6 separately. It is superseded by [p3-a2](../w3-cloud-20260928-a-p3-a2/), which the owner approved on 2026-09-29 ("...the animations and transitions as well"). That candidate includes this pass's variation and handover.
- Selected references: [Board B — supportive and joy](references/images/img-02-board-b-supportive-joy-variations.png) (approved), [Board A redo — comfort and congratulation](references/images/img-03-board-a-redo.png) (approved), [video — supportive currents](references/videos/vid-01-supportive-currents.mp4) ([12 sampled frames](references/videos/vid-01-frames.png), not watched in real time).
- Rejected: [Board A first attempt](references/images/img-01-board-a-comfort-congratulation-variations.png) (near-duplicate panels; owner asked for a redo).
- Evidence: [variations p2-a6](implementation/p2-a6-variations.png), [motion samples p2-a6](implementation/p2-a6-motion-samples.png), [retarget morph strips](implementation/p2-a6-retarget-morph-strips.png); earlier attempts [a1](implementation/p2-a1-variations.png), [a2](implementation/p2-a2-variations.png), [a3](implementation/p2-a3-variations.png), [a4](implementation/p2-a4-variations.png), [a5](implementation/p2-a5-variations.png).
- Before: [p1-a2](../w3-cloud-20260928-a-p1-a2/). Route, prediction IDs, costs and approvals: [provenance.json](provenance.json).

## Implementation rules extracted

| Family | Archetypes (seeded) | Continuous per seed |
| --- | --- | --- |
| Comfort | hanging corner · low double wave · inward curl | side, width, rotation, scale |
| Congratulation | slim leaning two-strand · thick many-ribbon wide crest · tall S-curve | strands, turn, lean, radius, crest, height |
| Supportive | low light to one side · high centred wings · converging from all around | light position, current count, bend, wings; travelling-wave sway anchored at the light (video) |
| Joy | upward · all around · sideways stream | spiral, rotation, stretch; red iris ring stays behind |

A new composition never reuses either of the previous two compositions' archetypes. Consecutive compositions hand over particle by particle on staggered drifting arcs over 1.2 s (the first blend attempt collapsed mirrored shapes into a vertical column; fixed and verified in the morph strips).
