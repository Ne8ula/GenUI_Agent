# week1-narration-20260917

2026-09-17; working tree based on `83a155f`, [source hashes](source-hashes.json). Implemented, selected voice listening review pending. Owner accepted the preceding [biomechanical visual rendition](../../acceptance/week1-biomech.md) with “Perfect” and authorized three sentences using an ElevenLabs voice ID. No new study phase, commit or publication.

Actual author/tools: Codex / GPT-6, local TypeScript/Rust, PowerShell/apply_patch, Node tests, Rust tools, Playwright/Edge. No delegated reviewer. Existing design, eye motion and loading duration are preserved. Before-state is the accepted [weather viewport](../week1-biomech-20260917/recording/weather-viewport.png); no visual redesign was requested. A bounded speech failure status is the only added visible message.

## Behavior and boundaries

Single-source [sentences](../../../../fixtures/narration/weather-lines.json):

1. “Of course, I'll bring up the weather for Ithaca.”
2. “I'm building your weather dashboard now.”
3. “Here's your weather dashboard.”

Request acknowledgement and construction queue on a recognized new weather request. Presentation queues only when the validated forecast is visible and its reveal is finished. Speech never holds dashboard readiness. Clips play sequentially, with no overlap. Slow construction speech is skipped if the card is already ready; cancellation or provider failure may end the sequence. There are no spoken temperature or current-weather claims.

The [official ElevenLabs convert endpoint](https://elevenlabs.io/docs/api-reference/text-to-speech/convert) supplies MP3 audio using `eleven_flash_v2_5`. API key and voice ID live only in the launch environment/root ignored `.env.local`. The renderer sends a request ID and one of three phase IDs; arbitrary text, URL, voice, model and authority fields are rejected. Browser loopback checks Host/Origin, request size and concurrency; Rust commands have main-window-only capabilities. Provider redirects are disabled, synthesis timeout is 8 seconds, audio is limited to 400 KB and decoded playback to 15 seconds. Provider diagnostics/secrets are not returned to the UI. Three generated clips remain only in process memory. No general-purpose TTS or external account action is enabled.

Quiet/Dismiss/new microphone/hidden document/unmount stop current playback, clear queued stages, abort requests and reject late results. AudioContext is unlocked in the initiating user gesture. Missing configuration leaves the existing silent flow usable; speech failures report a compact functional status. The previous fixed synthetic weather/memory and Whisper input remain unchanged.

Changed files: new `narration-server.ts`, `src/useNarration.ts`, Rust `narration.rs`, the sentence fixture, server/browser tests; App/Vite hooks; Rust command registration and capabilities; backend setting loader; `.env.example`, package test script and docs. No dependency additions or backend weather policy changes.

## Actual checks

- `npm.cmd test`: 18 JavaScript tests passed, including rejection of arbitrary routing/text/authority, missing configuration, in-memory caching, cancellation/concurrency, provider errors, MIME and response bounds.
- `npm.cmd run build`: frontend/server TypeScript and Vite production build passed.
- `node scripts/rust.mjs check --locked`: passed.
- `node scripts/rust.mjs test --locked`: all 14 Rust tests passed, including two narration boundary tests. The earlier Windows Application Control failure did not recur for these checks.
- `npm.cmd run rust:clippy`: passed with warnings denied after replacing a pre-existing modulo divisibility check in `voice.rs` with the equivalent `is_multiple_of` call required by the installed lint version; all 14 Rust tests passed again afterward.
- [Browser results](browser-01/results.json): real Web Audio decoded and played an injected synthetic tone WAV; phases were acknowledgement/loading, building/loading, presentation/ready with sequential playback. Quiet stopped playback; Dismiss rejected delayed audio; provider failure left the forecast usable. No browser errors.
- [Presented viewport](browser-01/presented.png), [speech failure](browser-01/speech-failure.png), [sequence video](browser-01/narration-flow.webm): Edge on Windows, 1440 x 960, DPR 1, same synthetic Ithaca fixture. Video has no audio track; event evidence proves playback scheduling, not voice quality. Normal eye animation uses live time.

Live ElevenLabs synthesis/listening with the owner's selected voice has **not** been verified: the voice ID/key configuration is still required. The browser fixture's tone is explicitly not generated speech. Actual Tauri window playback/autoplay remains unverified despite successful Rust compile/tests. No GPU performance measurement or phase acceptance is claimed.

Owner exercise: configure the two private ElevenLabs values, restart, request weather by voice or Weather, hear the three lines at the matching stages, then interrupt with Quiet/Dismiss/a new recording. Review the selected voice and pace. Owner decision/date for this audio rendition: **pending**.
