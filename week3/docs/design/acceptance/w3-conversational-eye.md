# Week 3 acceptance — conversational eye

**Owner decision: pending.** No acceptance date or accepted visual baseline. This record does not accept E1, S0–S4, or the separate brain adapter.

## Authorized scope and revision

Owner authorized the bounded Week 3 live conversational-eye implementation and at most ten short billable voice rehearsal turns, using existing OpenAI and ElevenLabs API access. They subsequently authorized reading only the existing nonsecret Week 1 voice ID for the test process. No image/video generation, ComfyUI, deployment or commits were authorized or performed by this session.

Source started at `53203fa`; a concurrent session created `fc33b6b` (“cloud working start”) during implementation. That checkpoint was preserved. Current candidate: **w3-20260927-06**, identified by its [source manifest](../revisions/w3-20260927-06/source-manifest.json). Original planning prose is retained with minimal current-status/owner-clarification links; archived weeks remain unchanged.

## Reproducible owner exercise

Use [launch instructions and the 105-second rehearsal](../../../README.md). Native mode, approved ElevenLabs voice, physical microphone and loudspeakers at presentation volume. Use invented dialogue only.

Expected: explicit mic activation; hands-free turns; comfort → congratulation → joy → assistance; interrupt during speech with a correction; fresh same-family geometry; processing trails only while processing; boxes tracking the form; End stops all output and releases capture. Test Mute/Stop/End separately, keyboard access, reduced motion, denied mic and unavailable providers.

## Actual technical checks to date

- Frontend: TypeScript/Vite production build passed. **113 Vitest checks passed**, including actual Week 1 CPU raster transfer, square pupil/dither/gaze, shared mesh/landmark projection, seeded variation, lifecycle/capture/playback and reduced/End behavior.
- Hardened Rust: **28 tests passed**, check/clippy with warnings denied passed; native build and launch executed. Exact IPC keys, bounded history/spending, cancellation and post-decider guards are covered.
- Synthetic-device browser smoke passed explicit consent, actual AudioWorklet loading/capture on a fake device, mute/unmute, Escape, End track release and canvas-failure controls. The final harness mocks the IPC boundary; an earlier HMR-versioned module patch timed out and was corrected. This is not physical microphone/provider evidence.
- [Current visual/native evidence](../revisions/w3-20260927-06/README.md): three occurrences per grammar, source-red rest, both gaze directions/tissue lag/blink, processing/interruption/reduced/End, phone/focus, motion recording and actual native WebView capture. Fresh capture had no page/console errors. Earlier rejected/intermediate renditions remain indexed.
- [Native boundary smoke](../revisions/w3-20260927-native-01/README.md): real Rust readiness/zero-budget denial and AudioWorklet module load without mic access.
- [Real provider integration](../revisions/w3-20260927-provider-02/README.md): one completed synthetic-input native STT → reply → ElevenLabs → playback turn, then a cancelled processing turn with no speech revival observed. First playback **5.924 s**, not the target three seconds. No real mic, acoustic timing or voice-quality judgment by the harness. **Four slots counted; at most six of the authorized ten remain.**
- Dependency audit: zero reported npm vulnerabilities after selecting a patched test runner. Not a security certification.

## Decisions and provenance

- Tauri 2/Rust retains credentials/provider operations/policy; TypeScript owns provider-neutral local turn coordination; Canvas 2D owns bounded procedural drawing. Windows host requests `--disable-gpu`; no resumption of the archived native wgpu experiment.
- Brain interjection applied: `providers::decide_conversation` is interim and brain-replaceable; closed validation and generation checks remain after it. No brain imports, shared edits, revision-field changes or adapter wiring this week.
- Gateway metadata for this session records main `codex/gpt-6-astra`, researcher `codex/gpt-5.6-terra`, implementer `codex/gpt-5.6-sol`, UI `anthropic/claude-sonnet-5`, and reviewer `anthropic/claude-opus-4-8`. Native Agent execution, not Ruflo coordination records, supplied workers. Ruflo `hooks_route` was advisory only. Tools: Read/Glob/Grep/Edit/Write, shell/Cargo/npm, browser Playwright and official-source web research.
- No development subscription was treated as runtime API entitlement. OpenAI non-billable catalog confirmed the selected models. ElevenLabs catalog returned `missing_permissions`, not proof of an invalid TTS key.

## Blockers and remaining owner tests

1. Genuine microphone → providers → ElevenLabs → playback and live loudspeaker interruption still require an observed owner exercise. Synthetic input/device tests never substitute.
2. Real echo cancellation, quiet speech, false-onset/missed-onset rates and first-word preservation remain unmeasured. The local energy gate's 160 ms confirmation and thresholds are tuning hypotheses, not speech-recognition or acoustic guarantees.
3. Natural voice delivery, emotional congruence, recognizable variation and continuous sculpture must be judged with sound and motion on the revised candidate. Screenshots and geometric-distance tests cannot establish perception.
4. There is no external factual verifier. Model scope and host heuristics cannot prove arbitrary prose grounded; do not present this demo as a factual assistant or executor of tasks.
5. Provider retention entitlements, real first-audio/physical-stop latency and frame-time distributions under live generation remain unverified unless explicitly recorded in later evidence. Numeric targets are not measurements.
6. No packaged-origin native microphone check, hardware/GPU benchmark, performance-under-billable-generation result or institutional study approval is implied.

## Owner feedback, fixes and decision

- Owner steering: implement Week 3; use bounded native agents; preserve the future brain decider seam. They rejected the replacement-eye direction and clarified retaining Week 1's silhouette/square pupil, dithering and cursor response, with source-eye transformations and broader response colors. Candidate 06 implements that clarification. None of this is acceptance of the new candidate.
- Retest: run candidate 06's native rehearsal on real speakers/microphone, judging eye identity, distinct related forms, reference overlays and spoken interruption together. Six authorized turn slots remain; obtain a fresh budget before exceeding ten total attempts across restarts.
- Owner exercised revision: **not yet recorded**.
- Decision/date: **pending**.
