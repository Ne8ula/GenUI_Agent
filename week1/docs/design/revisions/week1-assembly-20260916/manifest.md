# week1-assembly-20260916

Status: **candidate; owner review pending**. Date: 2026-09-16. Working tree based on `83a155f`; [source hashes](source-hashes.json). No commit/publish. Pre-existing owner planning/research edits remain intact.

## Direction and implementation

The owner requested a visible loading/generation sequence, a continuous eye shrink/move that makes room for the dashboard, heavier dithering/pixelation to reduce the cartoon appearance, and restoration of the earlier square pupil. The allowed procedural-dither route was selected; no new photograph or image provider was used. The supplied eye references remain visual direction, not copied image assets. Accepted setup predecessor remains `week1-resize-20260916`; the immediately preceding `week1-red-eye-20260916` is preserved and superseded, not accepted.

Actual author/tools: Codex / GPT-6, PowerShell, apply_patch, React/TypeScript, local GLSL, Playwright/Edge. No subagents or independent model review. Higgsfield's prior account limitation remains recorded in the [earlier brief](../week1-voice-eye-20260916/authoring-brief.md); no new generation or alternate image provider was invoked. This direction is the updated authoring brief.

| Before | After | Why |
| --- | --- | --- |
| Two conditional eye instances, a large one replaced by a small one | One mounted canvas follows measured layout anchors through a 1-second transform animation | Preserve gaze/blink continuity while visibly making room |
| Weather appears immediately with a brief entrance effect | Docking → drawing frame → scanning placeholder instrument → staggered data reveal | Make waiting and dashboard construction visible |
| Smooth round-pupil shading with fine halftone | Square pupil, pixel-quantized anatomy, stationary 4 × 4 ordered dithering with near-binary red/black ink | Follow the requested coarser printed/computer aesthetic |

`MovingEye.tsx` measures real responsive anchors, animates the existing surface, retargets window-size changes and cancels travel in quiet/reduced motion. The WebGL canvas is not replaced during entry-to-dashboard docking. It still pauses when hidden/offscreen, keeps a static SVG fallback and is removed on dormancy. The fallback also has a square pupil.

Preparation is explicit React state. Normal motion has a 1.9-second **local presentation hold**, followed by a 650 ms content reveal, and also waits for the actual preference lookup to settle. No forecast values appear in skeleton placeholders. Slow lookup keeps the loading view; the existing six-second timeout permits the default Celsius/error presentation. Cancellation clears timers, ignores late lookup results and disposes the eye. Repeated requests on an existing card preserve its instance, position, selected day and revision state. Quiet/reduced motion skips eye travel, placeholder animation and the presentation hold, while respecting real pending data.

The short **Assembling…** status is functional loading feedback. No demo narration, invented percentage, model token counter or provider latency is added. Red accent, fonts and minimal surface from the preceding revision remain. This is authored fixture presentation, not live model-generated weather or a new study phase.

## Evidence

Platform: Windows x64, Node 24.14.0, Edge 153.0.4234.32, DPR 1; dependencies remain lockfile-pinned. Browser content at `http://127.0.0.1:1420`, no OS chrome. Renderer evidence in the voice regression reports RTX 5080 through ANGLE/D3D11. No new GPU setup or speed claim. Shader time is live; stationary dithering uses a fixed coordinate pattern, but normal blink/gaze screenshots are not frame-identical fixtures.

Data: unchanged synthetic Ithaca week September 17–23, 2026, and bundled synthetic units Markdown. Voice recording uses synthetic Windows speech and real Whisper; no personal/raw microphone recording, key or private data is saved in evidence.

| Evidence | Meaning |
| --- | --- |
| [Before eye](before/eye.png), [before weather](before/weather.png) | Actual preceding rendition captured before editing, 1440 × 960 |
| `browser-01/` | Initial motion candidate and failure retained: eye continuity, cancellation and resize passed; delayed-data test incorrectly omitted the current `isTauri` test flag, so its intended delay was not injected |
| [Final assembly checks](browser-02/results.json) | Corrected injected IPC seam; continuous canvas identity, intermediate geometry, no immediate completed card, cancellation, four responsive loading layouts, delayed readiness, reduced motion, timeout fallback and ignored late result |
| [Pixel eye](browser-02/eye-before.png), [moving](browser-02/eye-moving.png), [loading](browser-02/loading.png), [ready](browser-02/weather-ready.png) | Matched 1440 × 960 sequence; moving canvas measured from 1000 px wide through an intermediate width to 260 px dock |
| [Narrow loading](browser-02/loading-400x640.png), [wide/short loading](browser-02/loading-1960x530.png), [slow data](browser-02/slow-memory.png) | Responsive construction and genuinely pending injected lookup. Injected IPC is not native Rust evidence. |
| [Voice regression](voice-regression/results.json) | Actual AudioWorklet capture with injected transcription; two card/wind/source/undo cycles, focus, five weather viewports, mic cancellation, unsupported intent/errors, late reply rejection, GPU fallback and reduced motion |
| [Final recording](recording/voice-weather-demo.webm) | Real Whisper on synthetic speech, continuous docking/loading/reveal, move/wind/source/undo/reset/dismiss, 1440 × 960, no audio track |
| [Docking still](recording/eye-docking-viewport.png), [loading still](recording/loading-viewport.png), [weather still](recording/weather-viewport.png) | Final viewport-sized recording frames |

The final code also skips a pending presentation hold when Quiet mode is enabled. Browser-02 preceded this small refinement; voice-regression and the recording use the final source. The frontend/server TypeScript and Vite production build passed after all changes. No backend/protocol logic changed, so prior backend test counts are not represented as rerun here. No Rust changes or native retry; the earlier Windows Application Control block remains unresolved. This is browser verification, not a final Tauri run or performance certification. Recording helper callback samples are not GPU/native timings.

Owner decision/date: **pending**. See the [owner exercise](../../acceptance/week1-assembly.md). Existing native delivery/phase acceptance limitations remain.
