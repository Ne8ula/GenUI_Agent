# week1-biomech-20260917

Owner follow-up, 2026-09-17: “Perfect.” The presented visual rendition is accepted; see the [dated acceptance record](../../acceptance/week1-biomech.md). The original candidate report below remains historical. New three-sentence narration has a separate review packet.

Status: **candidate; owner acceptance pending**, 2026-09-17. Working tree based on `83a155f`; [source hashes](source-hashes.json). No commit or publication. Existing owner planning/research edits preserved. Accepted setup baseline remains `week1-resize-20260916`; predecessor `week1-crt-20260916` is superseded and preserved.

## Direction and implementation

Owner feedback: the pupil alone felt mechanical; move the whole eye, emphasize the biological aspect of Evangelion-inspired biomechanical brutalism, and carry that into the interface. This is a revision of the authorized week-one slice, not a new product/study phase.

Actual author/tools: Codex / GPT-6, PowerShell, apply_patch, React/TypeScript, local GLSL/CSS/SVG, Playwright and Edge. No subagent or independent reviewer. No new raster provider, franchise artwork, model downloads or GPU setup. Higgsfield's earlier account restriction remains documented in the [authoring brief](../week1-voice-eye-20260916/authoring-brief.md). Extracted vocabulary for later exploration: weighted orbital tissue, asymmetrical apertures, rib-like instrument edges, branching connective curves and coarse red print grain.

| Before | After | Why |
| --- | --- | --- |
| Fast pupil movement within mostly fixed anatomy | Fast iris, slower translating/rolling/stretching socket, following lids and brow | Make attention involve the whole eye |
| Regular periodic blink | Fast closure, brief closed pause, softer reopening with varying intervals | Break the mechanical rhythm |
| Rigid rectangular frames | Asymmetric anatomical edges, rib-like borders and branching eye-to-panel connectors | Extend biological form into the brutal red console |
| Pristine decorative contours | Existing dither/grain plus subtle tissue contours | Preserve the rough screen-print treatment |

`SignalEye.tsx` retains 40 ms gaze smoothing; orbital tissue follows with a 145 ms time constant. Lid/brow curves and lashes deform together. Blink closes over 90 ms, holds 35 ms and opens over 175 ms; its interval varies deterministically. Subtle multi-frequency idle deformation is decorative breathing, not measured respiration. Square pupil, red phosphor, ordered dithering, 45 Hz draw cap and bounded resolution remain. This is procedural anatomy, not a photograph or physiology simulation.

`SomaticFrame.tsx` and `Biomech.css` provide reusable frame/connective vocabulary. Instrument ornaments are masked to border gutters so labels and controls remain readable. The connection disappears at narrow widths; text/chart values remain stable. Quiet and OS reduced motion freeze tissue, blink and frame effects. Existing same-canvas docking, 7.5-second folder/CRT presentation, cancellation, data readiness, fixture provenance and voice contracts are unchanged.

Changed implementation files: `SignalEye.tsx`, `MovingEye.tsx`, `App.tsx`, `WeatherAssembly.tsx`, new `SomaticFrame.tsx` and `Biomech.css`. Added `scripts/biomech-smoke.mjs`; updated canonical design refinement, application README, revision index and acceptance handoff. No backend/protocol changes.

## Evidence and checks

Windows x64, Node 24.14.0, installed Edge, DPR 1, browser content at `http://127.0.0.1:1420`. Voice regression identified the RTX 5080 through ANGLE/D3D11. Main fixture: 1440 x 960, synthetic Ithaca September 17-23 weather and bundled synthetic Markdown units. Additional viewports: 960 x 760, 1960 x 530, 600 x 760 and 400 x 640. Normal animation time is live/unseeded; directional stills are not exact pixel comparisons across revisions.

| Evidence | Result |
| --- | --- |
| [Before eye](before/eye.png), [before retrieval](before/assembling.png), [before final wind](before/wind.png) | Pre-edit CRT rendition at matching viewport. The preview's short `weather.png` delay also captured loading. |
| [Initial candidate](browser-01/weather.png), [initial failure](browser-01/failure.json) | Preserved intermediate: corner ornament crossed controls; an initial Quiet pixel-equality check failed. No initial-pass claim. |
| [Final motion checks](browser-02/results.json), [Quiet diagnostics](browser-02/quiet-diagnostic.json) | Final candidate passed gaze/tissue coupling, both axes, blink observation, canvas identity through docking, exact Quiet screenshot equality, reduced motion, four responsive layouts and disposal. Initial Quiet mismatch did not reproduce; diagnostics show zero gaze/tissue/closure and no running eye-frame animations. |
| [Left](browser-02/look-left.png), [following tissue](browser-02/tissue-following.png), [right](browser-02/look-right.png), [down](browser-02/look-down.png), [blink](browser-02/blink.png) | Coordinated gaze states. A screenshot taken after blink detection is not a timing measurement. |
| [Motion clip](browser-02/biomech-eye.webm), [retrieval](browser-02/retrieval.png), [weather](browser-02/weather.png), [narrow](browser-02/weather-400x640.png) | Final movement and layouts, including border-gutter correction |
| [Voice regression](voice-regression/results.json) | Real AudioWorklet with injected transcription; two complete move/day/wind/source/undo/reset cycles, keyboard/Escape, cancellation, errors, unsupported intent, GPU context-loss fallback and reduced motion |
| [Voice recording](recording/voice-weather-demo.webm), [weather still](recording/weather-viewport.png) | Real Whisper using temporary synthetic Windows speech, updated eye, docking, retrieval/CRT construction and interactive forecast; no audio track or raw microphone data saved |

`npm.cmd run build` passed frontend/server TypeScript and Vite production build after final source edits. Backend tests/Rust checks were not rerun because those sources were unchanged. Native verification remains blocked by the previously documented Windows Application Control issue; no native build or performance claim. The 90 ms gaze sample in the test reads shader uniforms, not input-to-photon latency. Recording callback timings are not GPU performance certification.

Owner decision/date: **pending**. [Reproducible owner exercise](../../acceptance/week1-biomech.md). Missing native acceptance and subjective visual review remain explicit; tests do not accept a study phase.
