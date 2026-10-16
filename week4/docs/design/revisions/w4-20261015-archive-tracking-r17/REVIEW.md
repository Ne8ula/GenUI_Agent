# Archive windows and tracking overlays

Status: **implementation ready for owner retest; acceptance pending.** Recovered after API failure and completed against source HEAD `565b5ad` plus the existing uncommitted R16/R17 work. The owner-approved supplied-reference exception remains scoped to this pass. No generation spend.

- **[Settled tracking overlays](implementation/after/integration-02/tracking-qhd-idle-0.png)** · [Alternate reference selection](implementation/after/integration-02/tracking-qhd-idle-5.png) · [Seven-photo discovery](implementation/after/integration-02/discovery-5s.png)
- **[Full runtime sequence, 41.32s](implementation/after/integration-02/discovery-to-paris-realtime.webm)** · [Idle reference rotation, 12.56s](implementation/after/idle-01/idle-references-realtime.webm)
- [Narrow layout](implementation/after/responsive-01/tracking-390-idle-0.png) · [Actual reference contact sheet](references/contact-sheet.png)
- [Verification and handoff](IMPLEMENTATION.md) · [Acceptance record](../../acceptance/w4-archive-tracking-r17.md) · [Source manifest](implementation/source-manifest.json)

260 app tests, typecheck/production build, 30 discovery/browser checks and 39 responsive/overlay checks passed. Before-state and unsuccessful first integration capture remain preserved. The existing source-derived scene, ground, colors and renderer were not changed.

## Owner request and authority

The owner requested more distinct loading photographs instead of repeated copies; faster switching among the photo windows following their supplied video; and a replacement overlay design based on three new attached examples, sometimes including actual archival photographs as reference insets. They explicitly selected **Use supplied references (Recommended)** for this new pass: the three new images, original motion clip and verified archival photos may be used directly instead of fresh generation. No generation allowance or phase acceptance follows.

This supersedes the R16 detached description-card design, not its frameless ground extension, current Paris colours/people, input controls or archive provenance. Preserve R15/R16 evidence and Weeks1–3.

## Inspected references

- [Owner image1](references/images/owner/img-01.png): thin red object rectangles, compact labels above edges, overlapping tracked-object vocabulary. Transfer frame/label language, not the birds, logo or a claim of actual detection.
- [Owner image2](references/images/owner/img-02.png): white outlined boxes, compact white title tabs, dashed inter-object connectors. Transfer boxes/tabs/sparse connections, not typography branding, arbitrary Object IDs or its orange palette.
- [Owner image3](references/images/owner/img-03.png): blue target box, label tab, separate photographic detail insets and connecting lines. Transfer the linked reference-image composition; no CCTV frame, surveillance timestamps, warning symbols, gender/identity classifications or copied portrait/runtime artwork.
- The original local Winter Outfit video remains a style reference only. Main inspected fresh0.2-second samples of [0–5s](references/videos/window-switching-0-to-5s.png) and [10–15s](references/videos/window-switching-10-to-15s.png). The clip changes depth/prominence and camera angle quickly around a cluster; it does not provide a measured archival-image-switch algorithm. R17 timing is authored to the owner's requested quicker switching, not falsely derived timing evidence. Audio/full-speed playback not reviewed.
- Actual before: [repeated discovery images](implementation/before/discovery-5s.png), [R16 settled overlay layout](implementation/before/settled-qhd.png). Main inspected these current states; prior source files retained under `implementation/before/source/`.

The three supplied style images remain development references, not runtime assets or a licence to publish third-party artwork. Archival runtime photos require separate creator/date/licence records and inspection.

## Implementation contract

Main owns the archival catalogue/assets/credits, discovery data/component and tests, host integration, build allowlist and captures. A bounded isolated UI worker may own only `ItemOverlays.tsx`, `item-overlays.ts`, `item-overlays.css` and its test; it must inspect this packet and actual owner images before editing. No shared-file parallel writers or commits.

1. Expand to seven distinct licensed 1980s Paris photographs (existing3 plus4 newly verified sources), with no simultaneous repeated source IDs or alternative crops passed off as separate photographs. If sources fail, show fewer unique photographs, not duplicates. No generated historical images or claimed live search.
2. Keep the depth-cluster vocabulary, but move emphasis to a different window about every0.65s and swap selected source assignments at a slower bounded cadence. Exact thresholds are tunable authored targets. Avoid full-screen flashes, strobing or high-frequency contrast changes. Deterministic seek/replay/pause/OS reduced motion must hold the same source assignments.
3. Replace detached title cards with object-bound hairline rectangles, compact label tabs, short readable descriptions and sparse dashed/solid leader lines. Use the actual fixed source-to-canvas projection; no jitter that falsely resembles measured detection. Keep faces and the prompt clear.
4. Show one or two occasional photographic reference insets in open space, joined to the selected object region. Clearly label them **archival context/reference**, not proof of the generated item's identity/location. No made-up exact item matches. Photo links open the local creator/date/licence record and pause for inspection. Retain all attribution, crop disclosures and source uncertainty.
5. All animation follows the existing clocks. Discovery/source-inspection/return/error must not leak settled labels or stale images. Reduced motion gives a static unique-photo cluster and static reference annotation. On narrow view reduce concurrent overlays rather than shrink text below12px.
6. Keep R16 ground geometry/camera/colours unchanged. No camera/mic, providers at runtime, external media requests, native desktop, downloads of models, spending or publication.

## Sources and verification

Existing R15 source/rights records remain unchanged. All seven runtime photographs have local credit/licence records and hash tests, including the disclosed Beaubourg date conflict. Current verification is in [IMPLEMENTATION.md](IMPLEMENTATION.md). Owner visual decision remains pending.
