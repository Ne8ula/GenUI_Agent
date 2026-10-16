# Hover information and right-side bounds

Status: **owner accepted the bounded R18 refinement on 2026-10-16**: “Perfect. Commit and push to Week 4 branch.” Prior accepted baseline: **none**. Prior candidate: R17. Source: HEAD `565b5ad` plus existing uncommitted R17/R18 work. Date: 2026-10-16.

- **[Quiet eight-rectangle scene](implementation/after/check-03/settled-qhd.png)** · **[Sign hover](implementation/after/check-03/hover-stop-sign-qhd.png)** · [Before](implementation/before/settled-qhd.png)
- [Upper window](implementation/after/check-03/hover-upper-window-qhd.png) · [Doorway](implementation/after/check-03/hover-right-doorway-qhd.png) · [Shopfront board](implementation/after/check-03/hover-shopfront-board-qhd.png) · [Narrow focus](implementation/after/check-03/focus-stop-sign-390.png)
- [Interaction recording, 9.68s](implementation/after/check-03/hover-focus-interactions.webm) · [Browser checks](implementation/after/check-03/checks.json) · [Source/build fingerprints](implementation/source-manifest.json) · [Owner exercise](../../acceptance/w4-hover-overlays-r18.md)

## Owner scope and reference exception

Owner: “Make the information appear after user's cursor hovers over it. Also create more rectangle overlays for the stop sign, and other objects on the right, currently the four boxes are all on the left.”

The owner explicitly selected **Reuse existing references (Recommended)** in response to: “May I reuse the existing references for this bounded hover-and-overlay adjustment, without new generation?” This permits reference reuse for this pass only, with no generation spend. It does not accept R17/R18 or waive future passes.

## Selected references and actual inspection

- [Reused R17 owner-reference contact sheet](../w4-20261015-archive-tracking-r17/references/contact-sheet.png): inspected in this session. Retain thin object rectangles, compact tabs and linked archival context; do not copy surveillance claims, portraits or artwork into runtime.
- [Current before-state, 2560×1440 / DPR 1](implementation/before/settled-qhd.png): captured and inspected before edits at construction 30s / idle 0. Existing four rectangles and always-visible information are concentrated on the left. Preserve the scene, typography, colours, ground, people and camera. Add authored stationary-object bounds on the right; these are not detector output.
- Prior [R17 packet](../w4-20261015-archive-tracking-r17/REVIEW.md) and archival sources retained unchanged. No new image or video generation. Hover reveal will be immediate, not a new animated transition.

## Implementation contract

Main session owns `week4/app/src/arrival/ItemOverlays.tsx`, `item-overlays.ts`, `item-overlays.css`, their focused tests, capture scripts and this revision's evidence/index. A read-only native eva-researcher inspects right-side geometry/references independently; no parallel writer.

Keep all object rectangles visible and pinned. Reveal title, description, connector and an available contextual photo on hover, keyboard focus or touch activation; retain usable access from object to its photo. Leaving/blur/dismissal must not leave stale information. No automatic rotating information. Maintain local pause/return and prompt access, readable narrow-screen information, keyboard focus visibility, reduced-motion equivalence and failed-photo fallback. Preserve existing catalogue, credits, scene and renderer. Add several right-side stationary objects including the stop sign; do not label people or invent exact historical matches.

## Checks and limitations

## Checks and limitations

- Final `npm --prefix week4/app run check`: **250/250 app tests, typecheck and production build passed**. Existing Rust unused-import/dead-code warnings remain unrelated. The former rotation-only tests were replaced by explicit-selection, right-side geometry and no-photo tests; the lower count does not imply 260 unchanged tests were rerun.
- Final `capture-tracking.mjs …/check-03 http://127.0.0.1:1467 --record`: **99/99 browser assertions passed**, covering every object hover, transparent interiors, keyboard focus/Tab/Escape/reopen, local credits, hoverable photos, blur/touch dismissal, unchanged canvas pixels, 2560×1440 / 1024×700 / 390×844 layout, description/photo separation, reduced motion, return/discovery cleanup and failed photos.
- `capture-discovery.mjs …/discovery-regression http://127.0.0.1:1467`: **30/30 passed** against the preceding check-02 candidate, before the final description-placement-only correction. No discovery or renderer changes followed. This includes original photo sequence, interruption, return/retry, timeout and late delivery paths.
- Before and after captured at matching QHD / DPR 1, construction 30s / idle 0. Main inspected quiet scene, sign hover and narrow focus; final sign image confirms the description clears its photo. The 9.68s browser interaction recording was decoded and temporal samples inspected; it includes automated viewport changes, not a real-time performance benchmark.
- Initial typecheck caught a missing JSX closing tag; corrected before successful checks. Initial screenshot review caught the global button-hover fill; local override and a regression assertion now keep the interior transparent. Follow-up image inspection found description/photo overlap at the sign; placement correction and 24 per-object/viewport overlap checks pass. Earlier captures remain under check-01/check-02.
- `git diff --check` and whitespace checks of the seven edited source/test/script files passed. No commits, publication, generation spending or phase advancement.

Changed implementation files: `ItemOverlays.tsx`, `item-overlays.ts`, `item-overlays.css`, and the conditional host mount in `ArrivalApp.tsx`; `tests/item-overlays.test.ts`; `scripts/capture-tracking.mjs` and the new-UI assertion in `capture-discovery.mjs`. Original uncommitted versions are retained in `implementation/before/source/`. Scene data, renderer, catalogue/credits and other sessions' changes were not edited.

Main implementation/integration: session-configured `claude-gpt-6-astra[1m]`, Read/Edit/Write, shell, Playwright. Native `eva-researcher`, configured `claude-gpt-5.6-terra[1m]`, independently inspected the supplied visual references and proposed right-side source-UV bounds using Read/Glob; it did not edit or verify code. Transport/model metadata was not independently audited for this pass. Ruflo `hooks_route` was advisory, not an inference worker.

Browser-only evidence; no native desktop, performance, real detection or historical reconstruction claim. Small source-bound objects remain small on phone-width scenes; touch was checked on the sign, while keyboard access covers all eight. Owner accepted this bounded refinement on 2026-10-16; broader phase gates remain unchanged.
