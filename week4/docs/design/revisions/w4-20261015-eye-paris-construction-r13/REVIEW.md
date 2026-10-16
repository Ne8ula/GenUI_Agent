# Eye to Paris

Status: **request-driven browser candidate ready for owner retest; acceptance pending.**

**[Open eye → Paris](http://127.0.0.1:1440/?scene=paris-arrival)** · [Fixture controls](http://127.0.0.1:1440/?scene=paris-arrival&fixture=1) · [Production preview](http://127.0.0.1:1452/?scene=paris-arrival) · [Full real-time recording](implementation/after/production-02/eye-to-paris-realtime.webm) · [Actual temporal samples](implementation/after/production-02/temporal-samples.png)

Launch: `npm --prefix week4 run app:dev`, then `?scene=paris-arrival`. The original `?scene=paris-scan` remains the comparison route.

[Selected corrected motion](references/videos/54556d2b/construction.mp4) · [Selected temporal samples](references/videos/54556d2b/temporal-samples.png) · [Reference contact sheet](references/contact-sheet.png)

[Storyboard](references/images/ba5e04de/storyboard.png) · [First motion candidate — rejected](references/videos/e94f8b9f/construction.mp4) · [Its temporal samples](references/videos/e94f8b9f/temporal-samples.png) · [Current Paris before-state](implementation/before/composite-qhd.png) · [Brief](BRIEF.md) · [Exact runs](runs.json)

## Inputs and authority

Owner asked to construct the current Paris scan scene from the EVA eye after a request about 1980s Paris. Current original-color R12 geometry is retained; no new composition, voice, microphone, desktop actions, providers at runtime or phase acceptance. Typed input uses the existing deterministic local request router. Main ran a five-phrase router check: both owner's Paris phrasings resolve to `arrive_paris_cafe`; modern Paris, London and negated Paris do not.

Reference-only identity inputs: [canonical Week3 eye screenshot](../../../../../week3/docs/design/revisions/w3-20260927-06/idle.png), [canonical eye crop on stage](references/inputs/canonical-eye-start.png), [current original-color scan](../w4-20261015-paris-scan-r12/implementation/colour-refinement/after/composite-qhd.png). The old images are conditioning/reference-identity inputs, not substitutes for this fresh pass. Main inspected the real canonical screenshot and current scan.

## Actual generation and inspection

- **Storyboard: selected for staged mechanisms, with exclusions.** GPT Image 2.5 / Sunburst high, prediction `ba5e04de-abe7-459a-aed5-cda2297131fa`, 8 credits, 2560×1440. Main read the output image. Panels 1–3 support red eye → separated outgoing particles → incomplete contours and object bounds. Later panels become too photographic; do not copy those fills. Its abstract eye is not the canonical eye geometry and cannot replace it.
- **First video: rejected.** Kling 3 Pro, prediction `e94f8b9f-206a-4a2c-aac4-ca3b42792681`, 164 credits, text-only, 10 seconds, no audio. Main inspected half-second temporal samples, not full-speed playback. It substitutes solid white figures, complete solid facades and a different street; the eye shrinks away without point transfer. This does not establish the desired transition.
- **Corrective video: selected for material-transfer timing, with exclusions.** Main inspected 20 half-second temporal samples: eye holds initially, outgoing red particle threads appear around 2–4s, partial fixed object contours and furniture/people anchors appear around 3–5s, facade coverage and original color grow through 5–9.5s. This supports actual point departure and staged anchor accumulation rather than a global fade. The eye's square pupil becomes round, its tissue appears rectangular, the foreground people walk and change scale, and some growth is wipe-like: exclude all of those defects. Preserve canonical eye equations and fixed R12 people; use authored 30-second timing rather than claiming the generated clip measures the implementation. Full-speed playback was not inspected. Kling 3 Pro, prediction `54556d2b-c886-409f-a1cf-903571f69733`, separately approved 164 credits, exact actual eye/scan start-end images, CFG .75, 10 seconds, no audio. The user explicitly approved after disclosure of the failed first reference and already-spent 172 credits. Total submitted 336 credits, each job once. No further retry allowance.

## Implementation contract

Main owns Week4 code and integration. Reuse the standalone canonical `week3/src/visual/week1-eye.ts` equations in a Week4-owned copy, not the archived conversation app or microphone. Native GPU point samples of that eye become the first Paris anchors; author local surface/density/flow/material construction for the remaining unchanged scene samples. Preserve `?scene=paris-scan` and add `?scene=paris-arrival` for the request-driven path. End-frame pixel preservation is a test, not an assumption. Stop/seek/skip/reset and reduced-motion behavior remain local.

## Implemented sequence and checks

The typed question “What's it like in 1980s Paris?” is recognized by the existing deterministic local router. Unsupported/negated requests leave the eye unchanged. It is not live voice or an LLM conversation.

| Authored time | Actual mechanism |
| --- | --- |
| 0–2s | Canonical red eye samples acknowledge with a small contraction; no Paris samples |
| 2–7s | 19,232 eye points depart on deterministic curved paths to unique Paris anchors; their original eye locations empty as they leave. Open-corner object bounds appear |
| 7–14s | Disconnected surface point/splat/dither islands accumulate on the retained destination geometry, with staggered local arrivals |
| 14–21s | Short thin directional trails settle into edge fragments. Architecture does not translate |
| 21–30s | Remaining edge/detail samples arrive and monochrome construction marks resolve to the original Paris sample colors; all brackets and eye points are gone at completion |

The final canvas is **pixel-identical** to the retained colored R12 scene at QHD/DPR1. Its source point binary and manifest are unchanged. These are authored 2.5D/image-derived graphics, not genuine multiview reconstruction, learned 3DGS, LiDAR or SLAM.

**Executed:** app `check` passed (typecheck, **222 tests**, Rust/WASM prebuild, production build); after the thin-trail refinement, typecheck, **6 focused arrival tests**, build and all **21 production arrival checks** passed again. The separate **20 scan regression checks** passed for the unchanged comparison route. Checks include exact canonical-eye raster parity, deterministic target permutation, bounded births, end-frame equality, typed/unsupported input, pause/Escape/resume, seek backward, skip, return, local/OS reduced motion, resize, missing data, unavailable WebGL2 and context loss/retry. [Arrival results](implementation/after/production-02/checks.json) · [Scan regression](implementation/scan-regression/checks.json).

A real-time browser recording runs through all 30 authored seconds and reaches `settled` with 109,593 born samples. Main inspected checkpoints and temporal samples, not full-speed playback. `production-01` is retained because temporal inspection exposed overbright overlapping flight marks; `production-02` thins their pixel footprint/alpha and staggers births within each surface region. Initial strict-index type errors in the copied eye source were corrected with four type-only non-null assertions; the archive remains unchanged. The raster parity test imports the archived module at runtime so Week4's stricter typecheck does not modify or re-typecheck archive code.

Resource counters: 109,593 retained scene samples, 19,232 eye samples, at most three draws/three geometries during transfer, zero image textures. Typed vertex-array payload **6,107,440 bytes**, not total process/GPU memory. No renderer FPS, GPU completion time, native WebView2 or hardware-independent performance claim. Rust tests and core test suite were not rerun; source there is unchanged.

Changed code: new `app/src/arrival/{ArrivalApp.tsx,arrival.css,timeline.ts,samples.ts,construction.ts,eye-source.ts}`, additive `App.tsx` route, optional construction extension in `scan/renderer.ts`, `app/tests/arrival.test.ts`, `app/scripts/capture-arrival.mjs`. The copied eye equations are from Week3 at HEAD565b5ad; GPU square-point rendering is a new transport, not a claim of pixel-identical full Canvas-host presentation.

## Owner retest and limits

Open the arrival link, submit the prefilled request, watch the eye depart and each construction layer, pause with Escape, resume, skip, and Return to eye. Fixture mode adds deterministic seeking and named time checkpoints. Less motion goes directly to the retained Paris scene on submission. The stage is a synthetic browser study with no microphone, desktop choreography, provider calls or generated-video playback. Aesthetic pacing still needs owner judgement; no exact recreation of the reference clip is claimed. People remain fixed, as required by the retained scene. No new phase, commit, push or public publishing.

Configured main Astra implemented/integrated using file tools, Node/TypeScript, Three.js/WebGL2, Playwright/Chrome, Python/Pillow and FFmpeg. Native Terra researcher used Read/Glob/Grep for eye/input discovery, no edits or tests. Independent native Opus-configured reviewer inspected the final thin-trail code and reported no blocking correctness defect; its runtime reported `claude-opus-4-8[1m]`, without independently correlated Gateway logs. Review was static only, not executed tests or visual acceptance. Nonblocking notes: future sample counts must remain compatible with the guarded target permutation; future timing edits must retain the tested <28s birth ceiling; the host currently updates React state each animation frame. No independent Gateway transport metadata is claimed; Ruflo routing was advisory only. [Final source binding](implementation/production-02-source.json). **Owner decision remains pending.**
