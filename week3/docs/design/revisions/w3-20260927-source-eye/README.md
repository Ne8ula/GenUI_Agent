# Week 1 identity transfer

2026-09-27, Week 3 source-transfer check; accepted Week 3 baseline **none**. This is an isolated rendering fixture, not the final conversational composition.

Ported the actual authored equations from [SignalEye.tsx](../../../../../week1/apps/desktop/src/SignalEye.tsx), using the [accepted biomechanical rendition](../../../../../week1/docs/design/revisions/week1-biomech-20260917/manifest.md) as identity evidence. Preserved the asymmetric lids, socket/brow, lashes, iris fibers, square pupil, reflection, and stationary 4×4 Bayer treatment. An outer alpha feather removes a hard panel edge. No reference photo/frame is drawn at runtime. JavaScript and GLSL noise arithmetic are not promised bit-identical.

Main inspected [rest](rest.png), with [left](left.png) and [right](right.png) retained. Browser Chrome 153, Windows 11, 1000×700/DPR 1; 280×140 generated raster upscaled without smoothing to 896×448. [Checks](checks.json): 19 source-derived feature landmarks, three individual raster durations (cold 71.9 ms, then 40.3 and 41.8 ms); not FPS or input-to-photon measurements. No microphone/provider call.

Command: `npm --prefix week3 run source:eye`. Source base `fc33b6b` plus uncommitted transfer. Author: native Sol (`gpt-5.6-sol` route), integration/capture Astra, Read/Write/shell/Node/Playwright. Seven focused source tests and standalone TypeScript check passed in the worker; main's integrated suite also passed.

A later exact-zero-branch optimization retained identical CPU output in 12 byte/landmark comparisons, with separate Node timings recorded in candidate 06. The optimization worker supplied the written change/report, but terminal completion subsequently hit Gateway 503 twice, including the single same-route retry. Main stopped retries and independently integrated/tested the files; no fallback or configuration change was used. This fixture establishes source identity transfer, not owner acceptance of its later transformations, native performance or live voice behavior.
