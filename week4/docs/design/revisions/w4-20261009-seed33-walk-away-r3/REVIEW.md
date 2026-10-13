# Seed-33 tile corruption and walking away

**Status: superseded by the owner's Rust reconstruction correction. Candidate 3 is preserved technical evidence, NOT a compliant candidate for the requested scene.**

The owner clarified during recovery: no image background during coloring; rebuild the entire scene through Rust, constructing wireframes first, then basic colors, then details. This candidate still uses raster-derived scene imagery and therefore does not satisfy that requirement. The checks below validate the old implementation only. Stop overlay-only iteration; see the [current decision](../../acceptance/w4-visual-steps.md#rust-scene-reconstruction-correction).

- [Current full-scene motion, 18 seconds](implementation/after/candidate-3/webgl2-away-walk-18s.mp4) / [gait close-up](implementation/after/candidate-3/webgl2-away-walk-closeup-18s.mp4)
- [Current still at 22 seconds](implementation/after/candidate-3/webgl2-normal-22000.png)
- [Recorded browser checks and 75-file source manifest](implementation/after/candidate-3/checks.json) / [fresh recovery verification](implementation/recovery-verification.json)

- [Reference contact sheet](references/contact-sheet.png)
- [Selected still](references/images/img-01-tile-corruption-away.png) / [figure detail](references/images/img-01-figure-inspection.png)
- [Motion study](references/videos/vid-01-away-walk-tile-breakup.mp4)
- [Temporal overview](references/videos/temporal-overview.jpg) / [100ms gait samples](references/videos/gait-detail.jpg)
- [Exact run/settings/cost provenance](provenance.json)

Main inspected actual image pixels and video temporal samples (500ms across0–9.5s;100ms at1–2.9s), **not full-speed playback**. Select the rear-facing silhouette, separated legs/alternating foot poses and warm tile-row breakup. Exclude the video's initial rightward drift, delayed left turn, nearly fixed arms and still-too-intact tile bodies. Code must move left and away from the start, articulate planted/swing feet and arms, and replace—not decorate—the whole drifting tile quads. The generated environment is not adopted.

Approved/submitted once each: image5 credits (`b233ae7a-cca2-402b-b542-916f90b5437d`), video90 credits (`ee36e722-c68f-4cad-b7f3-2791b2b8a4e9`). **This pass:95 Weave credits.** No further run allowance.

Implementation ownership: Astra main owns new gait/tile helpers, required renderer/figure-asset/manifest/label seams and focused tests. Terra's code audit is read-only. Both backends share live triangle plans; retain the old figure file and record any new rear-image derivative separately. Figure-specific construction material will change if that new figure is adopted; architecture/furniture strand construction and other scene assets remain preserved.

## Requested correction

Owner, 2026-10-09: "The colored tiles should also be glitching rather than floating like the glitched boxes. The woman should be actually walking like a human rather than floating right to left. It should also not walk towards the user, it should walk towards the left side of the chair, slowly walking away."

Execution refinement: **"Use Astra for implementation, NOT sonnet."** Astra main owns all implementation for this pass. Native Terra is read-only research only; no Sonnet writer is assigned. This supersedes the earlier toward-viewer/past-viewer figure trajectory for this bounded pass. Preserve approved strand construction, the base scene, local controls, deterministic clocks and both rendering backends. Loading changes beyond those needed for the new figure require explicit disclosure.

Source: `e43c7aedb2690c8b9edc3e2446f1d1f584897a5d` plus the existing dirty tree and integrated tracking-r2 candidate. Previous packet: [tracking-r2](../w4-20261009-seed33-tracking-r2/REVIEW.md). Its overlay work is not an accepted visual baseline; the latest owner requests tile and figure changes. No commits, push, resets or phase advancement.

## Scope

- Corrupt the filled colored tile bodies using live fragmented/missing/displaced/reassembled rows at stable regional anchors, not intact drifting quads decorated by surrounding effects.
- Replace rigid image translation/row sway with articulated limbs and alternating planted/swinging feet, opposing arm motion and weight transfer, travelling slowly diagonally away toward the left side of the foreground chair. Do not enlarge/approach the viewer.
- A front-facing cutout cannot establish a convincing rear-facing walk merely by flipping it. Inspect the generated rear-three-quarter figure and plan an actual live code rig; do not play generated gait video or claim a fully procedural scene.
- Keep existing reference-derived environment layers explicit. Any newly adopted figure image requires provenance/inventory and inspection; references alone are not implementation evidence.

## Reference generation checkpoint (historical)

The owner explicitly approved uploading the synthetic current app capture `tracking-r2/implementation/after/candidate-2/webgl2-formed-12000.png` to Weave plus one 2K Nano Banana 2.1 run at up to 5 credits. Quoted again after image attachment: 5 credits. Submitted once as `b233ae7a-cca2-402b-b542-916f90b5437d` through official Figma Weave direct-model MCP (`fal-ai/nano-banana-2/edit`). The subsequent 90-credit motion run was separately approved, completed and inspected as recorded above and in provenance. No credentials or temporary upload token retained; no inherited or further credit allowance.

## Recovered implementation and evidence

Recovery after the memory/API interruption found **candidate 3 already recorded**. No runtime code or assets were changed during recovery. Candidates 1 and 2 remain retained under `implementation/after/`; they are not accepted baselines.

- The settled renderers share `walkAwayFigure.ts` (rear material panels, separate articulated limbs and alternating stance/swing contacts), `tileBodies.ts` (fragmented bodies at fixed anchors) and the existing `postFormationOverlay.ts` tracking grammar. The source-textured environment is still raster-derived, not a fully procedural recreation or runtime video playback.
- The static rear-figure derivative is `figure-away.png`; `foreground-away.png` supplies settled chair occlusion. Runtime provenance and hashes are retained in `app/public/assets/seed33/manifest-walk-away-v2.json`, including the Weave prediction and provider-rights caveat. The old figure/foreground assets remain. Figure-specific construction appearance changed with the rear material; this is not pixel-identical preservation of the prior figure.
- All **75 source/test/asset hashes** in candidate 3's report match the current working tree; all **28 screenshot hashes** match the retained files. The report SHA-256 is `8930ec5f7be2a257a222a1c535cd6baddfa5deda386a7d09c90762c818140d72`.
- Fresh recovery: `npm --prefix week4/app run check` passed typechecking, **207/207 app tests** and build. The **42 focused overlay/walk tests** also passed (a subset, not an additional 42). Core/Rust/native checks were not rerun.
- Recovered browser evidence: **36/36 checks**, no page exceptions or scene-resource errors, matching backend/clock/asset checks, tile hiding, pixel-static reduced motion on both backends and frozen paused pixels. These are prior recorded checks, not new recovery executions.
- Existing full-scene MP4 independently probed: **271 frames, 15fps, 1920×1080, 18.066667 seconds**, spanning fixed host time 12–30 seconds. This is intended-motion evidence, not real-time performance. A separate [real-time browser recording](implementation/after/candidate-3/realtime/e59ce36c02ccf59649361fb2dd966460.webm) is retained.
- Main inspected the current browser still, retained 22-second still and 16 close-up samples at 5fps across the first 3.2 seconds. This was **not full-speed playback**. Tile bodies visibly split into gapped/sheared rows, and the rear figure recedes left with changing leg poses. **Knees and lower legs remain conspicuously angular/mechanical; convincing natural human gait is not established.** Reference imagery is smoother. Tests prove contact/geometry invariants, not perceptual realism.

Additional recovery browser smoke used a dedicated server on port 1456. Tiles off reported zero shown/28 authored and unchanged 17000ms host/life clocks; the restore click was sent, but final dataset verification was interrupted when the browser page became `about:blank`. Only a favicon 404 appeared in the inspected console. An initial older server on port 1455 was not the recovered candidate and is excluded from evidence.

## Historical reproduction (not the requested Rust rebuild)

```powershell
npm --prefix week4/app run dev -- --port 1456
```

The historical fixture is `http://127.0.0.1:1456/?fixture=1&look=seed33&seed=33&build=12000&backend=webgl2&t=12000`. The clips and controls remain reproducible, but this image-backed candidate is **not being offered as satisfaction of the Rust reconstruction request**. All step/phase acceptances remain pending; no phase advancement.

Recovery provenance: harness-reported Astra main handled integration/verification; native `eva-researcher` (Terra-configured/reported) recovered context read-only via Read/Glob/Grep. Ruflo routing was advisory. No independent transport-log verification, Sonnet writer, new generation/spend, commit or push occurred during recovery.
