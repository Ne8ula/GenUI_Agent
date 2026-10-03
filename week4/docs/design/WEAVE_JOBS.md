# Week 4 Weave job checklist (not run)

This is the finite list of reference jobs from [DESIGN_PROMPT.md](../../DESIGN_PROMPT.md) §10–§13 and [planning.md](../../planning.md) §8. The machine-readable copy is [weave-jobs.json](weave-jobs.json), validated by `schemas/weave-jobs.schema.json`.

**Status of every job: not run, awaiting cost approval.** No route has been discovered, no model or workflow ID chosen, no quote requested and no output exists. The schema forces run IDs, costs, approvals and outputs to stay null or empty, so this file cannot be mistaken for a reference packet. No candidate rows exist in a design index, because there are no candidates.

| Packet | Images | Video studies | Unblocks |
| --- | --- | --- | --- |
| P1 arrival | S1, S2a–c, C1–C6, A1–A3 (13) | V1 lines→mass, V2 wash bleed, V3 gait, V4 smoke/steam (4) | Renderer blockout and the arrival build |
| P2 desktop | D1 proxy choreography board (1) | V7 proxy window displacement and return (1) | Desktop integration visuals |
| P3 follow-ups | F1 rain, F2 evening, F3 return, F4 combined rain+evening (4) | V5 rain onset, V6 evening transition, V8 deconstruction (3) | In-place follow-up states |

Total: 18 images and 8 video studies (26 jobs). F4 is not in DESIGN_PROMPT's list. Planning §8 requires combined-state coverage, so F4's prompt still has to be composed from F1 and F2 and reviewed.

## Order for a connected session

1. Discover the actual direct-model or workflow route through the Figma MCP Weave tools. Do not guess model IDs.
2. Quote S1 alone first. Get the owner's explicit approval, run it, inspect the output, and choose framing before quoting the rest of P1.
3. Record the packet under `week4/docs/design/revisions/<revision-id>/` in the layout from [FIGMA_WEAVE.md](../../../docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change). Then update `weave-jobs.json` with real IDs. That needs a schema revision too, because the current schema forbids recorded runs.

The six owner JPGs are mood references, not inputs to upload. Uploading any of them, or a Week 3 capture (C1's optional input), needs separate owner clearance.
