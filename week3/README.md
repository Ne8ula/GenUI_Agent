# Week 3 — Conversational eye

A separate React/TypeScript + Tauri 2/Rust implementation of [DESIGN.md](DESIGN.md) and [PLANNING.md](PLANNING.md). The guides retain their original proposal status; current implementation evidence lives here and in the acceptance record. Week 1 and Week 2 are unchanged. **Owner acceptance is pending.** A working build or a synthetic visual recording is not evidence that the live loudspeaker demo passed.

## Current visual candidate

[Candidate 06](docs/design/revisions/w3-20260927-06/README.md) restores the actual Week 1 eye: asymmetric lids/iris, square pupil, ordered dithering and cursor-following tissue. Its own material folds, lifts, blooms and fans into seeded response forms; source-derived landmarks carry the reference-style boxes and processing smears. Rest is red; responses can broaden the palette. Earlier replacement-eye renditions are preserved as superseded, not accepted.

[Resting eye](docs/design/revisions/w3-20260927-06/idle.png) · [Native processing view](docs/design/revisions/w3-20260927-06/native-processing.png) · [Rehearsal preview](http://127.0.0.1:1430/?fixture&state=idle&stance=attentive&seed=42)

## Launch

Use Node 24+, Rust/MSVC Build Tools and WebView2 on Windows. From the repository root:

```powershell
npm.cmd --prefix week3 ci
npm.cmd --prefix week3 run desktop
```

The native app defaults to **zero paid turns**. In a new PowerShell terminal, configure these process/user environment variables outside the repository using your private credential setup:

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY` with text-to-speech permission
- `ELEVENLABS_VOICE_ID` for the owner's existing approved voice
- `EVA_W3_MAX_TURNS` — `0` by default, explicitly `1` through `10` for the authorized rehearsal.

Never use `VITE_*` for credentials. No secret is needed by the renderer, and no `.env` file is required or created. Do not paste a key into chat or commit one. Restart the native process after changing its environment. The optional `--previous-voice` launch flag reuses **only** the nonsecret approved voice ID from the existing private `week1/.env.local` when it is missing from the environment; it never imports archived API keys or modifies the archive. Omit that flag when configuring a standalone Week 3 setup. For the currently authorized rehearsal:

```powershell
$env:EVA_W3_MAX_TURNS = '6' # Four turn slots were consumed during this task; do not reset the ten-turn total.
npm.cmd --prefix week3 run desktop -- --previous-voice
```

Read the service disclosure, check the consent box, then select **Start conversation**. OS microphone permission is requested only then. Capture continues through playback, so subsequent turns and interruptions require no clicks. `Esc` / **Stop response** cancels the answer but keeps listening; **Mute microphone** discards unfinished capture without stopping an existing answer; **End session** stops both and clears local context. Sessions expire after ten minutes.

Close the previous native test window before launching a fresh process. If a Vite preview is already running on port 1430, either close that preview first or reuse it explicitly:

```powershell
$env:EVA_W3_MAX_TURNS = '6'
npm.cmd --prefix week3 run desktop -- --previous-voice --reuse-preview
```

The preview running during this implementation can be reused. A first native compile without the already-built dependency cache may take several minutes. The normal launcher does not enable remote debugging; the evidence scripts used temporary loopback-only debugging flags.

### Visual-only browser preview

```powershell
npm.cmd --prefix week3 run dev
```

Open `http://127.0.0.1:1430/`. Live Start is deliberately disabled in browsers: there is no secret-bearing development HTTP server or browser-to-provider fallback.

`http://127.0.0.1:1430/?fixture&stance=comforting&state=speaking&seed=42` opens a **clearly labeled synthetic visual fixture**, only in development builds. Its buttons are test controls, not evidence of model inference. It never captures a microphone, speaks prerecorded clips or calls providers.

## Rehearse for approximately 105 seconds

Use invented, non-sensitive dialogue on the actual presentation microphone and loudspeakers:

1. Start (0–10 s); confirm **Microphone on**.
2. “I've had such an annoying day. Nothing went the way I wanted.” Look for comfort, not immediate unsolicited fixing.
3. “Actually, some good news—my project was selected for the showcase!” Look for a fuller congratulatory bloom.
4. “I'm really happy about it.” Look for shared joy rather than another identical celebration.
5. “But I'm stuck on how to open my presentation.” **Speak over the response:** “Wait—just give me one opening sentence.” Check immediate silence, an intact first word, corrected content and a fresh supportive composition.
6. End (90–105 s). Confirm mic/audio/boxes/trails stop and no late response returns.

Also try a paraphrase, “I don't need advice, just listen,” a short cough/noise, Mute during capture/playback, Stop during processing, repeated interruptions, reduced motion and an external factual question. Do not disguise failure with a prerecorded response. Headphones are a diagnostic contingency, not a substitute for the loudspeaker gate.

## Checks

```powershell
npm.cmd --prefix week3 test
npm.cmd --prefix week3 run build
npm.cmd --prefix week3 run rust:test
npm.cmd --prefix week3 audit
# With the browser dev server running, captures synthetic fixtures only:
npm.cmd --prefix week3 run capture
```

Capture output is versioned under [docs/design/revisions](docs/design/revisions). Set a **new** `EVA_CAPTURE_REVISION` for a revised visual candidate; preserve earlier captures. See [evidence index](docs/design/INDEX.md) and [acceptance record](docs/design/acceptance/w3-conversational-eye.md) for actual executed checks and remaining blockers.

During a native development rehearsal, numeric session-only timing samples can be inspected in WebView devtools with `(await import('/src/voice/timing.ts')).localTimings()`. This contains only turn-end-to-playback scheduling and detected-onset-to-local-stop durations, not speech or identities; End clears it. It does **not** measure physical speech-onset detection, sound-device silence or visible-frame alignment. Those require an actual device exercise.

## Boundaries and implementation map

- [src/voice](src/voice): provider-neutral TS turn controller, local AudioWorklet capture, bounded energy VAD/pre-roll, cancellable playback, generation checks and numeric timing. Barge-in stops audio locally before awaiting Rust. Requested browser echo cancellation is not proof of echo immunity.
- [src-tauri](src-tauri): fixed provider transports and privileged validation, session/budget/resource limits, stale-result rejection and backend context. The renderer cannot select arbitrary TTS text, voice, URL or model.
- [src/visual](src/visual): the actual Week 1 shader equations transferred to bounded CPU rasterization, original gaze/tissue/blink dynamics, seeded mesh transformations and geometry-attached tracking/processing overlays. No reference clip playback, cloud visual generation or WebGL/wgpu resumption. A 45 Hz draw cap follows Week 1; the proposed 60 fps target is not claimed passed.
- [schemas](schemas): closed Draft 2020-12 response contracts. Schema validation does not itself establish factual truth or authority.
- [docs/VOICE_POLICY.md](docs/VOICE_POLICY.md): Week 3 short-form exception, Natural v3 settings, provider retention limits and rehearsal allowance.

**Brain seam:** `providers::decide_conversation` is the interim backend decider and must remain replaceable after the owner selects a tested Week 3 revision. Reply, stance and intensity share one validated envelope; no React/audio emotion heuristic is a second decider. There are no imports, shared edits or runtime wiring to the separate `brain` worktree. Its future revision envelope is not added to today's stable frontend `Reply` contract.

## Current access/evidence limitations

Non-billable OpenAI model-catalog access succeeded. The voice ID was initially absent from the environment; with the owner's explicit permission, the previous private Week 1 voice ID was found and supplied to the native test process without printing it or changing the archive. ElevenLabs' model catalog returned HTTP 401 with `missing_permissions`; that does **not** prove the key lacks TTS permission or is invalid.

The first automated provider check found the native window's two slots already consumed and stopped before submitting audio. A subsequent isolated, two-slot native check **passed one synthetic-input STT → reply → ElevenLabs → playback turn**, then cancelled the second turn during processing. Its one measured turn-end-to-playback interval was **5.924 s**, above the proposed 3 s target; this is not a latency distribution. Total slots counted: **4 of 10**, including cancelled/unobserved attempts; at most six remain. See [provider evidence](docs/design/revisions/w3-20260927-provider-02/README.md).

This verifies real provider/playback integration with synthetic input, not physical microphone capture, loudspeaker echo handling, natural voice quality or live spoken barge-in. Those remain owner tests.

Conversation is restricted to short acknowledgements and low-stakes suggestions; there is no external factual verifier or action connector. The model's self-classified scope is not a proof of factuality. Raw audio/transcripts are not intentionally persisted; provider retention and immutable JavaScript/IPC copies are outside secure local-erasure guarantees.
