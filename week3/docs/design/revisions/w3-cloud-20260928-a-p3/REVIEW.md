# Weave reference review — w3-cloud-20260928-a-p3

## Quick review

- Pass: **p3, minor glitch boxes during state transitions** (owner, 2026-09-29: *"When its transitioning between states, can you add the .gif reference (the glitchy effects). Make it very minor, like only a few glitch boxes appear."*). Source `8227623` plus uncommitted p1/p2 work (p2-a6). Batch ledger: [LEDGER.md](../w3-cloud-20260928-a/LEDGER.md).
- Status: **implementation p3-a2 approved by the owner 2026-09-29** (on [the transition recording](implementation/p3-a2-transitions.mp4)): *"Approve p3, the video provided is what I am looking for. The animations and transitions as well."* Not Week 3 phase acceptance.
- Contact sheet: [references/contact-sheet.png](references/contact-sheet.png).
- Selected references:
  - [img-01 transition glitch strip](references/images/img-01-transition-glitch-strip.png): approved by the owner. 
  - [vid-01 transition glitch](references/videos/vid-01-transition-glitch.mp4), with [24 sampled frames](references/videos/vid-01-frames.png) (sampled, not watched in real time).
- Before: [p2-a6](../w3-cloud-20260928-a-p2-a6/) (no transition glitches). After: [p3-a1](../w3-cloud-20260928-a-p3-a1/) (too faint, superseded), [p3-a2](../w3-cloud-20260928-a-p3-a2/) (current).
- Transition evidence: [p3-a1 comfort dissolve](implementation/p3-a1-comforting-dissolve-strip.png), [p3-a2 comfort](implementation/p3-a2-comforting-transition-strips.png), [p3-a2 congratulation](implementation/p3-a2-congratulatory-transition-strips.png), [glitch detail](implementation/p3-a2-glitch-detail.png), [reference vs p3-a2](implementation/p3-reference-vs-a2.png), [transition recording (mp4)](implementation/p3-a2-transitions.mp4).

## Observations

| Asset | Status | Observation |
| --- | --- | --- |
| img-01 transition glitch strip | selected (owner approved) | Two to four small boxes per moment, with horizontal cyan/magenta/lime/white scanlines, colour-split edges and thin sideways trails. The count drops as the form dissolves. |
| vid-01 transition glitch | selected (timing and box grammar) | About four events in ~3 s, mostly one at a time, each ~0.2–0.6 s. A thin vertical line opens into a small dark-backed box of vertical colour stripes with an outline, a thin horizontal trail crosses the eye, then it vanishes. The model only brightened the eye rather than dissolving it, so its form change was not used. |

## Implementation guidance used

- Glitches appear only while the eye is changing: expressive energy rising or falling, or one composition handing over to the next. There are none when settled or in reduced motion, and none on End because the clock freezes.
- No more than 3 at once, which gives about 3–4 per transition with the real runtime. Each lasts 0.2–0.48 s, runs line → striped box → trail → fade, and is anchored on the moving eye landmarks.
- The vertical-stripe box with its dark backing follows the video. The first attempt (p3-a1) used horizontal additive rows from img-01 and was almost invisible over bright particles.

Route, IDs, costs and checks: [provenance.json](provenance.json).
