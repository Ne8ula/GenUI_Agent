# EVA voice and weather demo

This app is part of the isolated [Week 1 project](../../README.md). Commands and direct script paths below are relative to `week1/`; root npm commands also forward here.

Latest interaction: [weather and wind dialogue](../../docs/design/revisions/week1-wind-dialogue-20260917/manifest.md). Drag the weather card's bottom-right grip to resize it; focus the grip and use arrow keys for keyboard resizing. Smaller panels reflow and scroll internally. Use **Speak request** and **Send recording** to ask for weather; Weather/Type shortcuts and the black command panel are removed. After opening weather, click **Speak request**, ask **"What about the wind speed?"**, then **Send recording**. The wind panel appears only through that microphone follow-up: EVA says "Give me a second.", then a five-second CRT animation builds the wind section before EVA introduces it. Position, size and selected day are preserved. Repeat requests do not duplicate it; a new weather session hides it again. The Add Wind, Quiet, Undo and Reset buttons are removed; OS reduced motion remains supported. The header's small × dismisses the dashboard, and Escape cancels/dismisses. The Celsius preference control and inspector have been removed; explicit temperature units remain on readings. The bundled Markdown preference still supplies the unit.

The connector now uses a narrow dark-backed dither braid with attachment collars, designed for a transparent desktop surface. `node scripts/speak-only-smoke.mjs <new-output-directory>` checks the final entry flow; `wind-dialogue-smoke.mjs` covers the wind sequence. Older button-driven visual harnesses, including `resize-voice-smoke.mjs`, are historical. The test uses real AudioWorklet capture with an injected Whisper result, not a live provider transcription.

Current shell: [transparent desktop overlay](../../docs/design/revisions/week1-overlay-20260917/manifest.md), with dense dithered connectors. Restart `npm.cmd run desktop:dev` to apply the native window settings: no Windows title bar, no window shadow, transparent gaps between the opaque eye/dashboard/loading surfaces. Hover or tab into the eye to access its small drag and close controls; Alt+F4 remains available. The dashboard header contains Move and Dismiss. Browser previews cannot remove browser chrome or show your desktop through a browser tab. Desktop click-through and always-on-top are not implemented by this change.

The latest full debug desktop build was blocked by Windows Application Control (error 4551 in a Tauri build script), although frontend build and `cargo check --locked` passed. Native appearance and drag/close need a fresh Tauri run once the local policy allows that build.

## Spoken dashboard replies

The narrator uses **Eleven v3** (`eleven_v3`, Natural stability 0.5) and five approved delivery-tagged scripts for weather acknowledgement, construction, summary, wind acknowledgement and wind presentation. See [speech authoring rules](../../docs/design/VOICE_PROMPTING.md) and [current scripts](../../fixtures/narration/weather-lines.json). The acknowledgement follows the owner's exact cue-first format, including `pull-up-the-weather`. `[speed: 1.25x]` is an experimental text cue, not guaranteed numeric playback speed. V2-specific controls and request-stitching fields are omitted. Whisper remains input-only. The final weather line describes Thursday and Friday using the displayed synthetic fixture, then invites a follow-up; it does not claim live weather.

Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` privately in root `.env.local` or the launch environment, alongside the existing `OPENAI_API_KEY`; restart the dev server/app. Never commit the voice ID or key and never prefix either with `VITE_`. Both browser and Rust adapters use backend-only settings. See [.env.example](../../.env.example) and the [narration evidence](../../docs/design/revisions/week1-narration-20260917/manifest.md).

Audio plays sequentially through Web Audio with at least 1.2 seconds of silence between clips. Construction starts no earlier than 5 seconds after the request, and presentation waits until 700 ms after the dashboard finishes revealing. Dismiss, a new microphone request, hiding the window and unmount cancel playback and pending synthesis. Repeated requests for an already open card do not repeat narration. A slow construction line is dropped once the card is ready, avoiding stale progress speech. Missing configuration is silent; provider/playback failure reports “Speech unavailable.” and keeps the dashboard usable. The five clips are cached only in backend memory for repeat takes; restart clears them. No other text, user recording or private memory is sent to ElevenLabs.

`node scripts/narration-pacing-smoke.mjs <new-output-directory>` tests ordering/readiness and cancellation using real Web Audio with an injected synthetic tone fixture; it does not certify your chosen voice. Rust compile, Clippy and all 17 Rust tests passed on 2026-09-17, so the earlier build policy failure no longer blocks those checks. An actual Tauri window with the configured ElevenLabs voice still needs a live exercise.

Current visual revision: [biomechanical eye and instruments](../../docs/design/revisions/week1-biomech-20260917/manifest.md). Lids, brow and socket follow the fast iris with softer motion; irregular blinks and subtle tissue deformation replace pupil-only movement. The red/dithered instrument frame uses rib-like edges and connective curves. System reduced motion freezes these effects. Earlier biomechanical smoke scripts retain historical controls; use the current resize and narration harnesses above.

Current motion revision: [CRT retrieval and construction](../../docs/design/revisions/week1-crt-20260916/manifest.md). The same square-pupil eye docks over 1 second. A folder animation walks the allowlisted preference path, a CRT blueprint prints in stepped bands, then the forecast resolves line by line. Normal presentation now takes **15 seconds**: 12 seconds of retrieval/blueprint staging plus a 3-second reveal. The preference lookup retains its separate 6-second timeout and Celsius fallback. The folder walk illustrates the single bundled record, not a live filesystem search or measured provider delay. Controls inside the card stay inactive until the reveal completes. System reduced motion skips staging/reveal; Dismiss cancels preparation. Repeating a weather request preserves an already open card instead of replaying construction. The eye now follows the pointer across the whole window with faster smoothing.

An animated, anatomical eye listens to a short weather request. Whisper transcribes it, a bounded local matcher recognizes weather for Ithaca, and the weather instrument assembles. The current rendition uses red accents and removes presentation/helper copy from the application. Forecast values and the inspectable Markdown preference remain synthetic fixtures. Wind revisions, day selection, movement and manual resizing remain interactive. See the [current visual packet](../../docs/design/revisions/week1-red-eye-20260916/manifest.md).

## Run

From the repository root, with Node 24.14+:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:1420**. Voice requires an OpenAI API key supplied privately as `OPENAI_API_KEY` in the launching process or root `.env.local` (see `.env.example`). Restart after changing it. Never use a `VITE_` prefix: the key belongs to the server/Rust process, not the renderer. The browser adapter accepts the fixed loopback host/origin only. **Weather** works without credentials or microphone access. F11 gives a clean browser fullscreen view for screen recording; this remains the browser path, not proof of native Tauri execution.

For Tauri, install the [Windows prerequisites](../../docs/setup/WINDOWS_PREREQUISITES.md), stop the separate browser dev server, then run:

```powershell
npm.cmd run desktop:dev
```

The launcher loads the same private key configuration and adds rustup's bin directory to its child PATH. A directly launched standalone executable instead needs `OPENAI_API_KEY` in its process environment; it does not read `.env.local`. Cloud access is required for Whisper transcription and ElevenLabs narration.

Native WebView appearance and live voice playback need a desktop exercise; the current Rust tests and Clippy pass. Historical Windows Application Control failures remain documented in the preceding manifests.

## Exercise the interaction

1. Watch the eye blink and shift its gaze; move the pointer over it.
2. Select **Speak request**, allow microphone access, say **“Show me the weather in Ithaca”**, then **Send recording**. The meter and eye use captured audio energy. Capture stops before upload. A recording auto-sends at 15 seconds; **Cancel** discards it instead.
3. Read the Whisper transcript and synthetic forecast label. Non-weather, other-city and compound requests are rejected. This is English weather intent recognition, not a conversational model or live weather service.
4. Drag the bottom-right corner to resize the weather panel. Narrow widths reflow the forecast into rows; short panels scroll internally. Focus the corner and use arrow keys for keyboard resizing.
5. Move the card with the header handle, select a day, then use **Speak request** to say **"What about the wind speed?"**. Wind appears without changing size or position.
6. Test narrow/short windows and system reduced motion. Escape cancels active voice work before dismissing the workspace; **Open EVA** restores the entry view.

Audio is held in memory as mono 16 kHz PCM WAV, at most 15 seconds; the app does not save raw audio. Only explicit recording is sent to OpenAI Whisper. Cancellation stops local work and ignores late replies, but cannot recall bytes already uploaded. Only the five approved narration scripts, including a summary grounded in the displayed synthetic forecast use TTS; there is no background listening.

## Checks and evidence

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run rust:check
npm.cmd run rust:test
npm.cmd run rust:fmt
npm.cmd run rust:clippy
```

Twenty-two JavaScript tests cover memory, closed weather schemas/revisions, intent matching, actual PCM bounds, restricted server requests, concurrency, cancellation and bounded provider errors. Build checks both frontend and server TypeScript. All 17 Rust tests and Clippy passed for the current revision.

The [review packet](../../docs/design/revisions/week1-voice-eye-20260916/manifest.md) contains before/after captures, real Whisper evidence using synthetic speech, GPU identification, reduced-motion/context-loss checks, and a motion recording. The [owner exercise](../../docs/design/acceptance/week1-voice-eye.md) remains pending. Full study/product phase acceptance is separate.

Browser smoke and recording harnesses use installed Edge and a synthetic WAV at `%TEMP%\eva-synthetic-weather-request.wav`. Generate it without recording a person:

```powershell
Add-Type -AssemblyName System.Speech
$demoSpeech = New-Object System.Speech.Synthesis.SpeechSynthesizer
$demoSpeech.SetOutputToWaveFile((Join-Path $env:TEMP 'eva-synthetic-weather-request.wav'))
$demoSpeech.SpeakSsml('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">Show me the weather in Ithaca.<break time="5s"/></speak>')
$demoSpeech.Dispose()
node scripts/voice-eye-smoke.mjs docs/design/revisions/week1-voice-eye-20260916/owner-browser
```

Use a new output directory each time. Add `--live` for one real Whisper transcription; other error scenarios remain injected. `node scripts/record-voice-eye.mjs <new-output-directory>` records a readable sequence using real Whisper. Synthetic audio stays outside the repository; the video has no audio track. Older weather/scaffold harnesses are historical and do not match the new entry flow.

## Implementation boundary

- `src/SignalEye.tsx`: local authored WebGL shader, bounded resolution/45 Hz draw budget, offscreen/hidden pause and SVG context-loss fallback. Uses the browser GPU; Rust does not accelerate the shader.
- `src/useVoice.ts`, `public/audio-capture.js`: explicit microphone capture, meter, cleanup and cancellation.
- `src-tauri/src/voice.rs`: narrow Rust Whisper commands; `voice-server.ts`: corresponding loopback-only development adapter.
- `src/App.tsx`, `Command.css`: console composition, state-driven eye and assembly transitions, responsive geometry.
- `packages/protocol`: bounded voice intent/audio helpers plus existing closed weather/document/patch contracts.
- `src-tauri/src/demo_memory.rs`: allowlisted synthetic Markdown lookup; no private vault access or memory writes.

Only the main local window receives the named runtime/memory/voice commands. No general filesystem, shell, opener or HTTP plugin is enabled. Endpoint/model are fixed by backend source, never supplied by a model or UI request. Keys and provider diagnostics are not returned to the renderer. This is not the full product policy broker, general conversation, GPU media generation, ComfyUI, or a completed study phase.

Speech settings and official sources: [v3 prompting policy](../../docs/design/VOICE_PROMPTING.md). The preceding v2 research remains historical. `node scripts/narration-provider-check.mjs` is an optional live, billable five-script check; clips are stored only in a temporary local directory.

Current dialogue evidence: [weather summary and staged wind follow-up](../../docs/design/revisions/week1-wind-dialogue-20260917/manifest.md). Run `node scripts/wind-dialogue-smoke.mjs <new-output-directory>` for timing, voice-only wind, cancellation and geometry checks using injected speech/Whisper.

Speech ending refinement: playback preserves the whole decoded clip, fades only its last quiet 80 ms (or a 5 ms de-click edge for active speech), and appends 1,000 ms of silence before completion. This also applies to cached clips; it cannot restore words missing from provider audio. Explicit cancellation remains immediate. Focused coverage: `node --test scripts/speech-ending.test.mjs`.
