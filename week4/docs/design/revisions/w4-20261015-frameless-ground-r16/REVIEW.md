# Frameless ground and item overlays

Status: **implemented and production-verified; owner visual acceptance pending.** Source HEAD `565b5ad6c4b62cf903cf903288941ce8f95850ff` with the shared R15 working tree. All 27 R15 source-manifest hashes matched before this pass.

[Open demo](http://127.0.0.1:1441/?scene=paris-arrival) · [Final QHD scene](implementation/after/production-03/settled-qhd.png) · [Ground detail](implementation/after/production-03/ground-detail.png) · [Runtime recording](implementation/after/production-03/ground-and-overlays-realtime.webm) · [26 browser checks](implementation/after/production-03/checks.json) · [Reference contact sheet](references/contact-sheet.png)

## Owner request and reference exception

Owner: “The ground is too hastily cutoff, like there is a frame at the bottom. Can you extend some of the ground tiles, to make it feel more frameless. After that, can you add a few rectangle overlays that float around that shows a very brief description of each 1980s item and a title. The rectangle overlays should feel like the final week 3 visual demo rectangle overlays.”

The owner explicitly selected **Reuse references (Recommended)** when asked to grant a one-pass exception to fresh generation for the current Paris scene plus the final Week 3 overlay references. This waiver covers only this ground-and-overlay pass. No new generation or spending is authorized or required. Inspection, provenance, matching before/after, reduced motion, cancellation and owner acceptance remain required.

This request permits the new object title/description overlays; it does not restore the removed header, toolbar, buttons or footer. Preserve the input-only host and archival-photo discovery. Preserve Weeks 1–3 as references, never edit the archive.

## Inspected current scene

[QHD before](implementation/before/settled-qhd.png) · [Ground close-up](implementation/before/ground-detail.png) · [Idle at 5 seconds](implementation/before/idle-5s-qhd.png).

Main inspected the actual bottom-ground capture: the central pavement ends at a nearly shared horizontal lower edge beneath the foreground pair, while chair/building fragments have some irregularity. Extend selected paving islands unevenly into the black space; avoid a full-width road slab or merely moving the rectangular cutoff. Keep figure contact points, source colours and architecture anchored.

## Selected Week 3 grammar — inspected before edits

Main inspected the actual `week3/docs/design/revisions/w3-cloud-20260928-a-p3/implementation/p3-a2-glitch-detail.png` and `week3/docs/design/revisions/w3-cloud-20260929-b-p2/implementation/after/p2-a2-still-44.5.png`. The first is the owner-approved rectangle-event vocabulary; the second is the final accepted-look companion, not broader phase acceptance. Actual prior recordings were sampled and inspected here: [rectangle motion, 2-second samples](references/videos/week3-rectangle-motion.png), [final treatment, 3-second samples](references/videos/week3-final-motion.png). No full-speed playback or audio inspection is claimed.

Observed: small hairline frames, diagonal X/corner marks, an inset vertical cyan/magenta/lime/white stripe patch, and a thin sideways trail. The final treatment is emitted light without an opaque backing. Transfer the line/frame/stripe vocabulary, not the archive's toolbar or desktop imagery. No accepted Week 3 overlay contains title/description typography: R16's Space Grotesk title and IBM Plex Sans description are an explicit new adaptation. Preserve a long readable hold and gentle bounded float rather than copying the 0.2–0.48-second decorative flashes onto text. No flicker or required text that disappears before it can be read.

## Implementation and bounded adaptations

The ground is a separate, bounded GPU geometry built once from two authored, reviewed floor-only sample windows. The original R12 binary, manifest validation, camera, original point buffer and construction/eye target schedule remain untouched. Five irregular continuation islands use the original samples' linear RGB/primitive attributes; unequal tile ends, narrow joints and sparse edges break the shared lower termination. They appear in the 21–30-second material phase. This runtime-derived extension avoids duplicating or weakening the original data pack; it is authored visual continuation, not reconstruction of unseen pavement.

Four title/description frames identify the café terrace, street lantern, woven bistro chairs and stone paving. Main moved the initial worker layout away from busy structures into negative space, and replaced a generic vertical accent bar with the inspected Week 3 small multicolour stripe patch. Fine neutral rectangles, corner/X marks and thin side trails have no opaque backing. Text remains legible for a long hold instead of inheriting the archive's short decorative flashes. Float is driven exclusively by the existing idle time; bounded state publication keeps it moving after settlement, and Escape freezes the whole composition. The input and photo discovery are retained. Narrow view shows two rotating labels plus all four descriptions in a stable accessible list; reduced motion fixes the selection and pose.

Early captures are preserved: [first ground extension](implementation/after/ground-01/ground-detail.png), [initial integrated layout](implementation/after/integrated-01/settled-qhd.png), [first production placement](implementation/after/production-01/settled-qhd.png). The first left-floor sample selection repeated a bright reflection; main narrowed its safe source window rather than recolouring original pixels. The initial labels crossed busy scene details; they were moved into open space before the final candidate.

## Scope and acceptance criteria

- Add bounded authored ground fragments with meaningful black gaps, staggered lengths and sparse edges. Do not imply genuine geometric reconstruction of unseen pavement.
- Add a few thin rectangle overlays, each with one short title and brief visual description tied to a visible scene item. Final Week 3 visual/motion rules will be inspected and linked before editing. Descriptions are of this illustrative composition, not authenticated 1980s archival claims or generated scan telemetry.
- Preserve construction, separate idle/discovery clocks, all keyboard commands, resize, GPU failure/retry and local-only data. Overlays appear with settled scene, not on eye/photo discovery. No independent wall-clock CSS animation that continues when Escape pauses.
- Reduced motion keeps a static arrangement. Stop/reset/supersession clear overlays; they do not capture input intended for the prompt or hide essential evidence.
- Main owns ground renderer + host integration and evidence. Any bounded overlay worker gets separate new files in an isolated worktree after inspecting the packet.
- Verify matched QHD/narrow captures, ground close-ups and a short runtime recording; focused tests for bounds, deterministic transforms, pause/reduced/reset and annotation visibility. Report fidelity limitations, not just test counts.

## Executed checks and owner retest

- `npm --prefix week4/app run check`: **247 app tests, TypeScript, WASM prebuild and production build passed**. Four new ground tests verify deterministic bounds, reviewed source windows, unchanged original records and exact source-colour attributes. Eleven new overlay tests verify stable content, layout bounds, bounded motion and mobile selection. Existing unrelated Rust warnings remain; no Rust source changed and Rust unit tests were not rerun.
- Final [production browser report](implementation/after/production-03/checks.json): **26/26 passed**, including unchanged upper-scene pixels, unchanged full-height foreground-person band, changed lower ground, sample/resource bounds, four readable labels at idle zero, accessibility list, transparent/nonblocking frames, clock-driven float, pause/seek, reduced motion, mobile coverage, input clearance, reset, GPU loss/retry and local-only requests.
- Actual runtime: **2,364 additional ground samples**, total **111,957**, original **109,593** retained. Reported geometry/sample storage **5,586,344 bytes**, two settled draw calls rather than one; this is not total browser memory or a measured framerate claim. Original R12 data/validation and the static scan comparison fixture remain unchanged.
- [Final recording](implementation/after/production-03/ground-and-overlays-realtime.webm): 2560×1440, encoded25fps,20.96s, from construction20s through ten seconds of settled float. [Two-second samples](implementation/after/production-03/motion-samples.png) inspected; no full-speed/audio review claimed. [Narrow reduced-motion capture](implementation/after/production-03/narrow-reduced.png) inspected.
- `production-01` passed before the final stripe/placement polish. `production-02` retained a failed mobile-label assertion: the driver sampled the DOM immediately after changing OS motion preference and seeking. The corrected driver waits for the media update and expected label pair; `production-03` passed against the same application build. The failed report is preserved and not described as a passing check.
- [34-file source manifest](implementation/source-manifest.json), SHA-256 `e5c76f19950e919b61628cf1ceeb79f3ef47b09fecfe1cbf4105d55995fc4ac3`, binds runtime/assets/tests and capture driver. Pre-pass source copies remain under `implementation/before/source/`.

Launch: `npm --prefix week4/app run dev`, then `http://127.0.0.1:1440/?scene=paris-arrival`. Production: build, then `npm --prefix week4/app run preview`. Type `skip` and Enter for immediate inspection. Watch the uneven floor ends and the four descriptive frames; Escape pauses, `resume` continues, `return` restores the eye. For the full flow submit the Paris request. Owner should compare frame weight, legibility and ground shape against the selected references; **visual acceptance remains pending**.

Reproduce capture: `node week4/app/scripts/capture-frameless.mjs <new-empty-absolute-output-directory> http://127.0.0.1:1441 --record`.

## Changed files and model/tool provenance

Main changed `app/src/scan/renderer.ts` and `app/src/arrival/ArrivalApp.tsx`; added `arrival/ground.ts`, `tests/ground.test.ts` and `scripts/capture-frameless.mjs`. A native `eva-ui-designer` worker in an isolated worktree supplied only new `arrival/ItemOverlays.tsx`, `item-overlays.ts`, `item-overlays.css` and `tests/item-overlays.test.ts`; main reviewed/integrated those files and refined placement, stripe treatment, a strict TypeScript index and reduced-motion selection. Week4 index/acceptance and this revision hold the evidence. No Week3, Rust, original binary asset, global settings or unrelated research edits.

Main: harness-reported Astra (`claude-gpt-6-astra[1m]`), native Read/Edit/Write/Bash/PowerShell and Playwright/ffmpeg. Read-only reference audit: native `eva-researcher`, configured Terra. Overlay implementation: native `eva-ui-designer`, configured Sonnet; worker reported `claude-sonnet-5[1m]`, not independently correlated to gateway request metadata. Ruflo routing was advisory. No invented model participation, new generation spend, commits, publication or phase advancement.

Limitations: the floor continuation is an authored arrangement of existing source-derived samples, not recovered 3D ground. The rectangles adapt Week3's decorative vocabulary into readable descriptions and slow float rather than exactly copying its brief flashes. Anchors are authored, not detected. Text identifies this illustrative scene, not authenticated historical objects. Browser-only evidence; owner judgement on the resulting framelessness/style remains open.
