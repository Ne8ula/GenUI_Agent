# Layered mapping, glyph and material refinement

Status: owner approved 34 credits; one submission returned an error with no run ID or charge receipt. Generation and charge outcome unconfirmed; no automatic retry. Date: 2026-10-15. Source HEAD `565b5ad6c4b62cf903cf903288941ce8f95850ff`, branch `week4`. One still requested, no implementation. Owner prefers r6 C with changes; no finished candidate or phase accepted.

## Owner direction

> I prefer version C, however, the reference color should be minimal, and it should retain R5A's foreground and color., from this contact sheet: week4\docs\design\revisions\w4-20261015-c-abstract-surfaces-r5\references\contact-sheet.png
>
> So it should have a collage of different styles overlaying on each other: the Cloud Mapping, the Glyph Fields, the layered research, etc.

## Inputs and proposed treatment

1. [r5 A — Glyph fields](../w4-20261015-c-abstract-surfaces-r5/references/images/img-a-glyph-fields.png): editing base; retain foreground people/furniture, poses, placement, existing dither and muted material colors. Preserve visible glyph regions. Its [comparison](../w4-20261015-c-abstract-surfaces-r5/references/contact-sheet.png) was inspected to identify A correctly.
2. [r6 C — Color-accented scan](../w4-20261015-c-mapping-surfaces-r6/references/images/img-c-color-scan.png): partial point-sampled depth and scan-band reference only. Reduce blue/violet/magenta to two or three tiny isolated clusters; exclude broad colored surfaces, its solid-looking paving and changed foreground fragmentation.
3. [r4 C — Layered research study](../w4-20261014-paris-hybrid-crossing-r4/references/images/img-c-layered-research.png): realistic fragments alongside coarse dither and detail panes. Exclude continuous complete walls/paving and duplicate pane contents.

Use all three references as layers on the same objects and perspective: point rows behind/between glyph patches, glyphs crossing the edges of detailed material fragments, and black gaps through incomplete surfaces. Retain r5 A's muted olive, brown, rust, skin and off-white foreground colors. Keep natural-color pavement/façade detail panes separate and readable. The mapping accents must not recolor the foreground or panes.

This is one proposed unified still at 3840×2160, GPT Image 2.5 / Sunburst / max through the official direct Weave route. [Exact prompt](prompts/layered-surfaces.txt). Existing provider-hosted generated outputs are reused; no new local reference upload is needed. No blanket paid allowance is inferred.

## Review criteria

- Foreground arrangement, dither and material color remain close to r5 A.
- Mapping points, glyphs and detailed material fragments visibly overlap within the same surfaces rather than occupying separate panels or becoming one uniform effect.
- Blue/magenta remains a minor accent; natural foreground/pane colors stay dominant among colored regions.
- Ground retains open black gaps; no broad solid cobblestone slab or complete enclosing street.
- The two panes remain generated illustrative details, not claimed archival crops or measurements.

The approximate five-percent mapping-accent target in the prompt is an authoring instruction, not a measured result. Actual output inspection is required. No new still exists yet; motion and implementation prerequisites remain outstanding. Add an index entry only after a real candidate exists.

## Execution status

Official model discovery succeeded and returned `gpt-image-2.5`, model tool ID `2db90e64-51dd-45b2-870a-66d19a81118e`; all three existing output URLs were retrieved from their completed prediction records. Two identical quote-only calls, both omitting `acknowledgedCost`, failed with `INVALID_ARGUMENT` and the provider's unexpected-error message. Debug IDs: `9120ba32-19e4-4fa6-9212-ec984367b859`, `dda0700f-a2d6-4b7a-894f-a38931b7b226`. The tool suggested a transient error, but the cause is unverified; do not equate this with the earlier terminal API failure.

The later diagnostic pass obtained a **34-credit quote for the exact unchanged r7 request**, including all three hosted images, Sunburst/max and 3840×2160. No input correction was required for that successful call. The owner subsequently selected **Approve — 34 credits** for this one run, with no automatic retries or extra runs. One invocation with `acknowledgedCost: 34` returned `INVALID_ARGUMENT` (debug ID `ce3d16ac-3578-4a3d-811c-31fdd899012e`), without a prediction ID, output or charge receipt. Do not claim either successful generation or zero charge from this response. No new local images were uploaded. Next action: determine whether a job/charge exists before considering any resubmission. [Preparation record](preparation.json) preserves input hashes, settings, approval and the error without hosted URLs or private session contents.

### Quote diagnostics — 2026-10-15

Figma authentication and discovery worked. Replaying the previously successful terminal request initially failed, as did a minimal default GPT Image request. Nano Banana 2.1 returned a diagnostic quote. Explicit GPT Image Sunburst returned diagnostic quotes at high/max quality and preset/custom size; Flare failed. The full r7 prompt without images failed, immediately followed by the unchanged desired three-image r7 request succeeding. These mixed results are consistent with an intermittent quote/backend or connector problem; they do not establish a particular invalid parameter, permanent Flare failure, image-format problem or account-wide outage. The internal cause is not exposed. No diagnostic quote was executed as a paid run, and no alternate model was adopted for the refinement. Earlier statements that quoting was blocked describe the initial failures, not the current successful quote.

### Post-submission account check

The authenticated Weave workspace settings displayed **2,277.8 credits**, matching the last r6 run's recorded remaining balance. This supports no observed deduction, but is not a per-request receipt or proof that no job was created. The available direct-model tools require a prediction ID to retrieve a run and expose no global model-run history. The browser's “Download credits usage history” action stalled without returning a download path; no matching new usage/credits file was found in the local Downloads directory. No second paid invocation was made. Approval remains recorded; submission outcome still needs confirmation before any newly authorized retry.
