# R16 bounded implementation contract

Source: HEAD `565b5ad` + verified R15 dirty working tree. Accepted baseline: none; R15 is a technical reference candidate, not owner acceptance. Read this revision's REVIEW.md and final inspected references before any UI edits.

## Object descriptions (illustrative, not archival identifications)

Use no more than four labels, chosen from:

- **Café terrace** — “An awning and small tables open the café onto the street.”
- **Woven bistro chairs** — “Light woven seats gather around a small round table.”
- **Street lantern** — “A wall lantern marks the café frontage.”
- **Stone paving** — “Broken paving fragments carry the street into open space.”

These describe visible authored elements in the imagined 1980s setting. Do not add invented manufacturers, precise years, addresses, historical dates, confidence scores, LiDAR/SLAM labels or archival assertions. Avoid a label implying that the generated sign's lettering proves historical traffic rules.

The owner requested title + very brief description in floating rectangles. Item annotations are a deliberate exception to the earlier no-other-text presentation; don't revive unrelated interface text or buttons.

## Worker boundary (after reference inspection)

Overlay implementation owns only new `week4/app/src/arrival/ItemOverlays.tsx`, `item-overlays.css`, and `item-overlays.ts` (pure pose/content helpers), with a bounded test file if useful. Main alone owns ArrivalApp host integration, scene ground changes, existing stylesheet and evidence. Do not edit Week 3. Use an isolated worktree and read shared uncommitted reference files via their full paths; they are not automatically in the worktree. Do not commit or switch the shared checkout.

Props should keep the view deterministic: visibility, idle time, reduced motion and current viewport/canvas geometry. No independent animation clock or CSS keyframes. Main passes existing clock values so Escape and source-photo inspection freeze everything. Keep the annotations absent during eye, photo discovery and incomplete construction; no duplicate people or scene changes.

Extract final Week 3 rectangle vocabulary from the inspected references before choosing dimensions, border details, type or floating behavior. A label is readable for long enough to inspect and remains within viewport; don't obstruct the input, faces or important scene details. Mobile can reduce the number of simultaneous overlays rather than shrinking type below 12px. Keep titles/descriptions accessible and noninteractive decoration pointer-transparent.
