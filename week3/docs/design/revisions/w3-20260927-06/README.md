# Candidate 06 — the Week 1 eye

2026-09-27 · Week 3 · **Owner acceptance pending** · Accepted Week 3 baseline: **none**.

Source: `fc33b6b` plus uncommitted implementation, identified by [source-manifest.json](source-manifest.json). No commit or deployment was made by this session. Predecessors [01](../w3-20260927-01/README.md)–[04](../w3-20260927-04/README.md) used the rejected replacement-eye direction; [05](../w3-20260927-05/README.md) restored the original identity and exposed remaining mesh seams.

## Requested correction and implementation

The owner clarified: keep Week 1's **actual silhouette, square pupil, original dithering and cursor responsiveness**; transform the eye itself into distinct forms; allow broader response colors and return to original red at rest. [Direction record](../../REFERENCE_REFINEMENT.md).

- The source pixels are generated from the authored Week 1 `SignalEye.tsx` equations, not a new orb, photograph, reference frame or prerecorded clip. Lids, brow, lashes, iris, square pupil and stationary Bayer pattern are retained. A gentle outer alpha feather removes the hard panel edge. JavaScript noise is not promised pixel-identical to GLSL.
- The original 40 ms gaze / 145 ms tissue-following dynamics and asymmetric blink are adapted locally. Cursor response works before microphone activation; End freezes the visual and reduced motion removes tracking/blink motion.
- Seeded fold, lift/twist, bloom and fan channels deform the same eye material through a bounded triangular mesh. The pupil region is protected. Pixel painting and feature-box positions share the same piecewise-affine projection, rather than independently moving an unrelated shape.
- Connected multiscale boxes follow source-derived feature landmarks. Fine horizontal RGB scanline smears and dropouts are gated to processing; interruption/End suppress them. Broader phosphor colors are driven by actual speaking, not a request-start guess.
- Resting warp is exactly zero. Slight clip overlap removes visible triangle seams. Canvas backing size, mesh, overlays and CPU raster sizes are bounded; Windows requests software rendering. No archived GPU renderer was resumed.

## Captures and reproduction

Command: `npm.cmd --prefix week3 run dev`, then `EVA_CAPTURE_REVISION=w3-20260927-06 npm --prefix week3 run capture` (PowerShell: set `$env:EVA_CAPTURE_REVISION` first). The runner refuses to overwrite existing revisions; use a new ID for another candidate.

Windows 11, headless Chrome **153.0.8010.53**, **1400×900, DPR 1**, plus **390×844** resize. [Checks, exact seeds and pose samples](checks.json). The sequence runs in one mounted scene, including repeated stances; it is explicitly synthetic and makes no provider/microphone calls.

- Identity: [rest](idle.png), [left](look-left.png), [right](look-right.png), [blink observation](blink.png).
- Forms: [comfort](comforting-1.png), [joy](shared_joy-1.png), [congratulation](congratulatory-2.png), [support](supportive-1.png), [attention](attentive-1.png). Each has three seeded captures (`-1`, `-2`, `-3`).
- State/control: [processing](processing.png), [interruption](interrupted.png), [reduced motion](reduced-motion.png), [End](ended.png), [phone](mobile.png).
- [Motion recording](page@41edd40de2b6c8817de6ae8ae3f6603f.webm).
- [Actual native processing view](native-processing.png), [resting review view](review.png), [native metadata](native-checks.json): WebView2 Chromium 153, 1180×780/DPR 1, software rendering requested, synthetic fixture only. Not a microphone/speaker exercise.

## Actual verification and measurements

- **113 frontend tests passed**; TypeScript/Vite production build passed.
- Hardened Rust: **28 tests passed**, check/clippy (warnings denied) passed; native build and launch executed. Renderer-only refinements did not change the backend.
- Browser fixture checks passed: left/right gaze, tissue lag, observed blink, static reduced/End frames, keyboard focus, phone overflow and browser live-disable; zero page/console errors on fresh capture.
- Synthetic-device browser smoke exercises the actual controls/AudioWorklet, mute/unmute, Escape, End track release and canvas-failure controls. An earlier harness attempt patched the wrong HMR-versioned module and timed out; the corrected runner mocks the IPC boundary explicitly instead. These remain test doubles, not native-provider evidence.
- The [separate native provider test](../w3-20260927-provider-02/README.md) completed real STT/reply/ElevenLabs playback with synthetic input and cancelled a second turn during processing. One first-playback interval was **5.924 s**, above the three-second target. Four of ten turn slots are counted; six remain.
- During the browser synthetic-processing recording: 180 rAF intervals, median **7.0 ms**, p95 **20.9 ms**; approximately **45.5 authored draw callbacks/s** over that short sample. Synchronous drawing samples: median **23.2 ms**, p95 **23.8 ms**. These include CPU work and command submission, not end-to-end compositor/GPU time. The renderer intentionally retains Week 1's **45 Hz draw cap**, so the proposed native 60 fps target is not a passed claim.
- Native fixture rAF intervals: median **7.0 ms**, p95 **20.9 ms**, max **27.8 ms** over 180 samples. No live-generation load, physical onset/stop timing or hardware/GPU certification.
- Source-raster optimization retained exact CPU RGBA/landmark output in 12 comparisons. Worker Node medians improved 224×112 from **21.167 to 14.136 ms**; this is a separate Node benchmark, not browser FPS.

## Provenance, failures and next owner test

Gateway-observed development routes: main **Codex/Astra**, CPU/backend **Codex/Sol**, UI **Anthropic/Sonnet 5**, research **Codex/Terra**, voice/backend static review **Anthropic/Opus 4.8**. The reviewer did not independently review this final visual port. Actual tools: native Agent worktrees, Read/Edit/Write/Grep, shell/Cargo/npm, Node and Playwright. The optimization worker returned its written change and check report, but its terminal completion hit Gateway 503 errors, including after the single permitted same-route retry. No further retry, configuration change or model fallback was used. Main integrated the files and ran the local suite/build/captures independently. This development-route failure is separate from the successful runtime OpenAI/ElevenLabs test. Earlier development HMR errors were cleared by a full refresh; fresh-capture checks are the evidence above, not the old open-page console.

Repository-local Git long-path support was enabled to create the requested isolated Windows worktrees; no model/permission settings were changed. Original source code and original local effects only. Referenced artist images/videos were inspected as inspiration, never used as runtime frames. Fonts and licenses are bundled. No private conversation, raw runtime microphone audio or credentials are in the captures.

Remaining limitations: real loudspeaker echo/false-onset/missed-onset behavior, physical barge-in timing and first-word preservation; subjective naturalness/congruence; external-fact verification (lexical guards are not a verifier); provider retention; packaged-origin microphone behavior. One successful synthetic provider turn is not the live hands-free demo.

Next: use the [105-second native rehearsal](../../../../README.md#rehearse-for-approximately-105-seconds), including a spoken correction during playback. Ask the owner to judge identity preservation, distinctly different but related forms, reference-effect fidelity and voice/interruption together. **Decision/date: pending.**
