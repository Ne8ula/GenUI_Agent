# week1-red-eye-20260916

Status: **candidate; owner decision pending**. Date: 2026-09-16. Source: working tree based on `83a155f`; [source hashes](source-hashes.json). No commit or publish. Pre-existing owner changes in PLANNING.md and the independent-study proposal were preserved.

## Owner direction and authoring

The owner requested removal of explanatory texts so the interface behaves like an application during a desktop recording; an organic, realistically shaped eye using the supplied photographic/halftone reference; and Evangelion red instead of orange. This explicitly supersedes the amber activity rule and the prior square-pupil candidate. The new reference's green hue and advocacy copy are not reproduced.

Accepted setup predecessor: `week1-resize-20260916`. Intervening `week1-weather-20260916` and `week1-voice-eye-20260916` remain preserved and unaccepted. This revision responds to visual feedback inside the authorized week-one scope; it does not accept S2 or add a new backend capability.

Actual author/tooling: Codex / GPT-6 with PowerShell, apply_patch, TypeScript/React, locally authored GLSL, Playwright and Edge. No subagent or independent model review. No new raster generation or copied photograph was used: the eye is a procedural interpretation, not a photographic reproduction. The earlier Higgsfield account restriction remains documented in the [prior brief](../week1-voice-eye-20260916/authoring-brief.md); no alternate provider or duplicate integration was installed. This manifest's direction is also the deferred authoring brief for later whole-interface exploration.

| Before | After | Why |
| --- | --- | --- |
| Presentation heading, instructions, transport/demo branding, assembly ledger and footer | Eye, controls, transcript, forecast and source inspector | Remove narration from the application surface |
| Symmetric floating oval and square pupil | Asymmetric lids, inset circular iris, round pupil, radial iris texture, tear duct, fine irregular lashes, socket/crease shading | More anatomical geometry based on the new reference |
| Amber buttons, marks and eye frame | Red `#FF3B35` accent, red halftone eye, pink focus and pale-red error text with an exclamation marker | Apply the explicit semantic palette revision; error meaning remains textual and shaped |
| Pitch-like two-column welcome | Large centered eye with a compact interaction row | Let the eye and interaction lead the recording |

Functional status/error text and the transcript remain. A compact **Sample** label identifies synthetic weather; source and transport details are available on demand via **Celsius**. No live-weather claim is introduced. The main surface contains no explanatory paragraphs. Voice errors are shortened without altering the capture/network contract. The microphone button's tooltip identifies Whisper; recording still has a visible timer, send and cancel controls. Audio auto-sends at 15 seconds as documented in the README.

Eye motion retains gaze attention, blink, microphone response, transcription focus and closure. The new shader remains local and bounded; it has no network/privileged input. Quiet/reduced motion, hidden/offscreen pause, SVG context-loss fallback and disposal on dismissal remain. Shared fonts and card IDs, position/selection, wind patch and undo semantics are preserved.

## Evidence and checks

Platform: Windows x64, Edge 153.0.4234.32, Node 24.14.0, DPR 1. Exact dependencies remain in package-lock.json/Cargo.lock. All new application evidence is browser content at `http://127.0.0.1:1420`, not native Tauri or OS chrome. Actual WebGL renderer reports NVIDIA RTX 5080 through ANGLE/D3D11. No new GPU installation or GPU speed claim.

Fixtures: synthetic Ithaca weather for September 17–23, 2026 and existing bundled synthetic Markdown units preference. Recording uses temporary synthesized Windows speech, never a person's microphone audio. Live shader time/grain are not seeded for pixel-identical normal-motion comparisons. No raw speech or secrets are stored in this packet.

| Artifact | Scope |
| --- | --- |
| [Before](before/eye.png), [before weather](before/weather.png), [before results](before/results.json) | Actual prior UI captured before edits at 1440 × 960 |
| `candidate-01/` | Initial anatomical eye; lashes/iris refined after inspection; preserved |
| [Selected eye](candidate-02/eye.png), [weather](candidate-02/weather.png) | Final shader/composition at matching 1440 × 960; later edits are docs/tests only |
| [Browser checks](browser-01/results.json) | Real AudioWorklet with injected provider replies; two move/select/wind/source/undo/reset cycles, focus restoration, cancellation, unsupported intent, errors, late reply rejection, dismissal and GPU fallback/reduced motion |
| [Narrow weather](browser-01/weather-400x640.png), [wide/short](browser-01/weather-1960x530.png) | Weather layout at five sizes, no page/day-cell horizontal overflow |
| [Entry checks](layouts/results.json), [narrow entry](layouts/entry-400x640.png) | Entry and expanded text field at 1440 × 960, 960 × 760, 1960 × 530, 600 × 760, 400 × 640; typed request works; two actual canvas screenshots identical in Quiet mode |
| [Motion recording](recording/voice-weather-demo.webm) | Real Whisper on synthetic speech; gaze, recording, transcription, assembly, drag, wind, source, undo/reset, dismissal; 1440 × 960, no audio track |
| [Eye still](recording/eye-viewport.png), [listening](recording/listening-viewport.png), [weather still](recording/weather-viewport.png) | Representative viewport-sized recording stills |

`npm.cmd run build` passed after the final source changes (frontend/server TypeScript and Vite). Browser runners passed without uncaught page errors. Backend/protocol logic was not changed; its prior 14 JavaScript tests are not presented as rerun this turn. No Rust changes or native build retry: the previously documented Windows Application Control block remains unresolved. This rendition is not native-verified. Recording helper frame samples measure browser callback cadence only and are not a performance certification.

Review the [owner exercise](../../acceptance/week1-red-eye.md). Acceptance/date: **pending**. Native close/relaunch and voice IPC require retest after the legitimate Windows policy/signing issue is resolved. Browser fullscreen is available for recording, but is not native execution evidence.
