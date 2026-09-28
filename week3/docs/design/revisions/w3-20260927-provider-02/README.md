# Native provider check — passed with synthetic input

Revision `w3-20260927-provider-02`, 2026-09-27. **Not live microphone or owner acceptance evidence.** [Numeric check output](checks.json).

## Executed path

An isolated native Tauri process used the hardened Rust backend, the owner's previously configured nonsecret voice ID, process-only API credentials, a separate temporary WebView2 profile, and a two-turn allowance. The window was explicitly labeled as a synthetic provider check and its ordinary controls were disabled during the run. No microphone was requested.

A deliberately synthetic sentence about selection for a showcase was synthesized locally by Windows speech synthesis into temporary mono 16 kHz PCM. The real provider-neutral TypeScript `Conversation` controller received that input through a test capture adapter, then used the real Rust IPC transport and real `LocalPlayback`:

1. OpenAI `gpt-4o-mini-transcribe-2025-12-15` transcribed the synthetic audio.
2. OpenAI `gpt-4.1-mini-2025-04-14` returned a reply/stance envelope; backend validation passed and the selected stance was `congratulatory`.
3. ElevenLabs `eleven_v3`, Natural stability `0.5`, returned MP3 audio for the approved existing voice.
4. Local audio playback started and completed; the controller returned to listening after `w3_delivered` completed. This verifies the software playback path, not a person's listening assessment or sound-device measurement.
5. A second synthetic turn was submitted. After its allowance was consumed, Stop cancelled processing; the controller remained interrupted and did not return to speaking during the 1.8-second observation.
6. End cleared the controller/backend session; mutable test buffers were zeroed and the isolated native window was closed.

Actual runtime requests succeeded through the pinned adapters; the configured/requested model IDs above are not a claim of independently inspecting provider infrastructure. Actual native `w3_status` rejected an extra model field with `w3_invalid_request` before any provider work.

## Measurement and limits

One observed input-end-to-playback scheduling interval: **5,923.7 ms**. This exceeds the plan's initial three-second target. No cold/warm distribution, physical sound onset, microphone onset detection delay or live-generation visual frame distribution was measured. The logged zero-millisecond stop sample occurred at the first synthetic onset before any answer was playing; it must **not** be cited as a measured barge-in latency.

No raw provider audio or transcript was written to the repository. The check report includes only states, times, model identifiers, stance and allowance. Synthetic input was held only in the temporary session directory and deleted after the checks. OpenAI `store:false` does not eliminate provider retention, and ElevenLabs zero-retention eligibility is still unverified.

Budget ledger: two earlier native turn slots were observed exhausted without their outcomes being captured, plus this completed turn and this cancelled turn = **four of ten slots counted; at most six remain**. Cancellation/failure does not refund a slot or guarantee provider billing stopped.

## Provenance and next test

Astra main used the native Tauri/Rust build, Node/PowerShell, Playwright CDP, local Windows speech synthesis and ffmpeg normalization. No alternate voice/provider or prerecorded reply substituted for the services. A first attempt to open a second WebView with a conflicting profile failed; an isolated temporary profile resolved that before this run, with no provider call in the failed launch.

Next owner test: actual microphone and loudspeakers, conversational correction during playback, first-word preservation, false-trigger/echo checks and subjective voice delivery while watching the clarified Week 1-based eye. This result does not accept the visual design, the full hands-free demo, E1/S0–S4 or the future brain adapter.
