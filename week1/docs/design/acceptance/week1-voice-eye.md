# Week-one voice and eye owner review

Status: **pending**. Revision: `week1-voice-eye-20260916`, working tree based on `83a155f`, identified by the [manifest and hashes](../revisions/week1-voice-eye-20260916/manifest.md). Date: 2026-09-16. Accepted setup baseline remains `week1-resize-20260916`.

Owner feedback triggering this revision: the preceding UI felt like a PowerPoint and did not resemble the Evangelion-inspired guidelines; requested effects, an eye, simple Whisper weather input, then supplied a monochrome square-pupil eye reference. This authorizes the narrow demo extension, not S2 acceptance or local media installation.

## Reproducible exercise

Follow the [desktop README](../../../apps/desktop/README.md). Start `npm.cmd run dev`, open `http://127.0.0.1:1420`, and use an API key in the backend environment/private root `.env.local`.

1. Inspect the eye at 1440 × 960, then at 960 × 760 and 400 × 640. Observe gaze, blink and recording response.
2. Speak “Show me the weather in Ithaca,” send, and confirm the transcript precedes the synthetic weather view. Inspect the assembly motion and readable data.
3. Cancel another recording. Try an unsupported request. Dismiss during transcription and confirm no late dashboard appears.
4. Move the card, select a day, add wind, inspect exact memory source, Escape, undo/reset. Repeat twice. Confirm position/selection/focus continuity.
5. Try quiet/reduced motion and reopen after dismissal. Judge the eye likeness, motion and new dashboard aesthetic.
6. After legitimate Windows policy/signing resolution, build/run Tauri and repeat using real Rust voice/memory IPC; close/relaunch the normal window.

## Actual checks

Fourteen JavaScript tests and production frontend/server TypeScript build passed. Rust check passed earlier in the revision; formatting passed. Rust test/Clippy execution and final native verification are blocked by Windows Application Control (OS 4551); two added Rust tests are not reported as executed.

Browser evidence includes live Whisper on synthetic Windows speech, actual AudioWorklet capture, hardware WebGL on the RTX 5080, two complete interaction cycles, narrow/short layouts, cancellation/late-response rejection, provider failure, context loss and reduced motion. Final browser checks use injected provider responses; final motion recording uses real Whisper. See the manifest for exact artifacts and distinctions.

Known limits: weather fixture only, simple English intent matching, no TTS/general conversation, no live weather or local media generation, no final native run. The supplied eye was a still reference; motion was interpreted. Browser frame cadence is not a native performance certification.

Owner decision/date on this revision: **pending**. Any earlier runtime confirmation or memory-test result is not acceptance of this new visual/voice rendition.

Follow-up owner feedback, 2026-09-16: remove explanation texts, make the eye organic/realistic using the new photographic reference, and replace orange with Evangelion red. This rendition is superseded, not accepted. Continue with the [red-eye exercise](week1-red-eye.md).
