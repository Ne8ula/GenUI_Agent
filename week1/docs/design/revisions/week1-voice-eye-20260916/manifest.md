# week1-voice-eye-20260916

Status: **candidate; owner acceptance pending**. Date: 2026-09-16. Browser implementation and real Whisper transcription verified; final native verification blocked by Windows Application Control.

## Identity, direction and boundary

- Source: working tree based on `83a155f`, identified by [source hashes](source-hashes.json). Pre-existing owner changes in PLANNING.md and the research proposal were preserved. No commit/publish performed.
- Predecessors: accepted setup `week1-resize-20260916`; memory seam `week1-memory-20260916`; intervening `week1-weather-20260916`, superseded by the owner's redesign feedback. Historical evidence remains intact.
- Actual author/tooling: Codex / GPT-6, PowerShell, apply_patch, React/TypeScript, Rust, local GLSL, Playwright and installed Edge. No development subagent or independent model reviewer participated. OpenAI Whisper performed live transcription only.
- Versions/environment: Node 24.14.0, Edge 153.0.4234.32, Windows x64; dependencies resolved in package-lock.json and Cargo.lock. Browser captures use Vite at `http://127.0.0.1:1420`, DPR 1. No OS chrome or private desktop capture. Native behavior is not established by these captures.
- Fixtures: `fixtures/connectors/weather-ithaca-week.json` (September 17–23, 2026), `fixtures/vault/preferences/weather-units.md`, and temporary synthetic Windows speech “Show me the weather in Ithaca” with trailing silence. Raw speech is outside the repository; videos record no audio track. No personal microphone recording was made for evidence.
- Reference: owner's supplied still of a monochrome human eye with square pupil/catchlight. Slow gaze, blinks and listening response interpret that still; exact reference motion is not claimed. [Authoring brief and Higgsfield limitation](authoring-brief.md).
- Time/seed: forecast is fixed. Shader motion/grain use elapsed browser time; no deterministic animation seed or frame-identical eye comparison is claimed.

## Reviewable change

| Before | After | Why |
| --- | --- | --- |
| Small abstract amber iris, presentation-like weather composition | Large monochrome square-pupil eye, amber command-console rules, strong numbered/data hierarchy | Follow the owner's reference and requested Evangelion-inspired visual direction without copied franchise assets |
| Preset entry only | Explicit microphone capture, actual meter/eye response, real Whisper transcript, bounded weather matcher; preset retained | Provide a functional voice-to-dashboard interaction |
| Single entrance fade | Eye focus, assembly frame sweep and staggered weather rows; 1.1 s presentation transition | Make dashboard construction visible without invented generation percentages |
| Fixed card margins during narrow resizing | Geometry clamping adapts its inset to actual available width | Keep a moved card inside the workspace at 400 px |

Space Grotesk / IBM Plex Sans / IBM Plex Mono, amber activity and red danger remain. Effects are local source-authored CSS/GLSL; no runtime model supplies styling or commands. UI fields and fixture references retain closed contracts. Existing movement, selected day, wind revision, source inspection, undo/reset and focus continuity remain.

The eye uses hardware WebGL, not a Rust/CUDA renderer. Actual renderer evidence reports **ANGLE / NVIDIA GeForce RTX 5080 / Direct3D11**. Canvas resolution is capped at DPR 1.5 and draw requests at 45 Hz; hidden/offscreen work pauses. Quiet/system reduced motion use a static pose and remove grain/scan motion; lost WebGL uses SVG. Dormancy removes the canvas and disposes resources. No ComfyUI, model download or new GPU software was installed.

Voice uses a fixed `whisper-1` multipart WAV transcription request, following the [official speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text). Renderer capture is mono 16 kHz PCM16, 0.1–15 seconds, with silence rejection. The server/Rust validates actual bytes/header, strict fields and request IDs, permits one in-flight request with cooldown, bounds timeout/response and returns safe errors. Endpoint and credentials stay backend-owned; caller-supplied endpoint/model/path/authority fields fail closed. The browser adapter also requires the fixed loopback host/origin. Cancellation stops local work and prevents late UI application; it cannot recall already uploaded bytes. This narrow route is not the full product policy broker.

## Preserved evidence

Full-page captures may exceed the viewport height; `*-viewport.png` files are window-sized stills. Matched before/after fixture viewports include 960 × 760, 1960 × 530, 600 × 760 and 400 × 640, DPR 1.

| Artifact | Meaning |
| --- | --- |
| [Before checks](before/results.json) | Actual preceding weather implementation captured before visual edits; two rehearsals and seven viewport checks |
| `candidate-01/` | Initial new shader/composition; preserved intermediate candidate |
| `live-01/` | Failed test-harness attempt: fake microphone repeated the short synthetic utterance; strict matcher rejected the repeated transcript. Preserved. Trailing silence corrected the synthetic input for later runs. |
| [Live Whisper checks](live-02/results.json) | Real AudioWorklet → live Whisper → recognized weather; measured RTX 5080 renderer, two rehearsals, cancellation/error/context-loss/reduced-motion checks |
| `final-browser/`, `recording/` | Preceding refinement, before final narrow-card/header and recording-hover fixes; preserved |
| [Final browser checks](final-browser-02/results.json) | Final source: real worklet capture with injected transcription, two movement/wind/source/undo cycles, five widths, cancellation, bounded unsupported intent/provider errors, late-response dismissal, GPU fallback and reduced motion; no page errors |
| [Final eye](recording-02/eye-viewport.png), [listening](recording-02/listening-viewport.png), [weather](recording-02/weather-viewport.png), [source](recording-02/source-viewport.png) | Final 1440 × 960 viewport stills; inspected for hierarchy, contrast and clipping |
| [Narrow weather](final-browser-02/weather-400x640.png), [wide/short](final-browser-02/weather-1960x530.png) | Final responsive layouts, no horizontal page/day overflow; vertical scrolling remains available |
| [Final motion demo](recording-02/voice-weather-demo.webm) | 1440 × 960 browser recording with real Whisper on synthetic speech: gaze, capture, transcription, assembly, move, wind, source, undo/reset and dismissal |
| [Frame sample](recording-02/measurement.json) | Two ~2 s browser requestAnimationFrame samples: idle median 6.9 ms / p95 7.1 ms; assembly median 6.9 ms / p95 7.0 ms. This measures callback cadence, not shader draw rate, GPU execution time, native responsiveness or generation latency. |

## Executed checks and limits

- `npm.cmd test`: 14 JavaScript tests passed (memory, weather/revision, voice PCM/intent, backend adapter).
- `npm.cmd run build`: frontend and server TypeScript plus Vite production build passed after final changes.
- `npm.cmd run rust:check`: passed after adding the native voice module/dependencies; later formatting/window metadata refinements do not establish a fresh native build.
- `npm.cmd run rust:fmt`: passed.
- `npm.cmd run rust:test` and `npm.cmd run rust:clippy`: blocked by Windows Application Control, OS error 4551, while launching tauri/application build scripts. Two new Rust voice tests exist but were not executed. This is not a Rust test failure or passing Clippy result.
- Native voice/microphone permission, final WebView rendering, standalone execution, close/relaunch and native performance are **not verified**. The earlier native weather result cannot substitute. No signing-policy bypass was attempted.
- No live weather, general conversation, TTS, private memory, model-generated UI, GPU media generation, macOS test or study-phase completion. Intent matching is deliberately simple and English-only. No full accessibility/security/performance certification is claimed.

Owner feedback against this rendition and decision/date: **pending**. Use the [owner exercise](../../acceptance/week1-voice-eye.md) and [run instructions](../../../../apps/desktop/README.md). The newest screenshot is not automatically accepted.
