# Eye docking and weather assembly review

Revision `week1-assembly-20260916`, 2026-09-16. **Pending owner acceptance.** [Manifest / hashes / evidence](../revisions/week1-assembly-20260916/manifest.md).

Owner feedback: dashboard needs a loading/generation animation; eye should visibly shrink/move to create space; increase pixelation/dithering and restore square pupil. Implemented inside the existing week-one scope; no phase acceptance inferred.

At `http://127.0.0.1:1420`, use Speak request → “Show me the weather in Ithaca” → Send recording, or select Weather. Watch the same eye travel to the rail, the wireframe draw/scan, then the forecast fill in. Move/select/add wind/inspect Celsius/undo/reset. Dismiss while loading and confirm nothing reappears. Try a narrow or short window and Quiet mode. F11 supports clean browser recording.

Expected: coarse red/black pixel eye with square pupil; visible continuous shrink/move; loading placeholders with no fabricated readings; data appears after presentation and actual readiness; Escape/dismiss cancels. Quiet/reduced motion skips choreography. Local fixture presentation is not a cloud generation measurement.

Actual: final frontend build, browser voice/card regressions and focused motion/readiness tests passed. Delayed/timeout tests use an explicitly injected IPC seam; real Whisper recording uses synthetic audio. Native testing remains blocked by the previously documented Windows Application Control issue and was not retried for this frontend change.

Owner decision/date: **pending**. Review visual pacing and eye treatment against the recording/current source. Native acceptance still requires legitimate policy resolution and a fresh Tauri run.

Follow-up owner request: extend loading to 5–10 seconds, show memory retrieval through folders, use stronger Evangelion-inspired brutalism/CRT building and dithered surfaces, and track the cursor faster. This rendition is superseded, not accepted; see [CRT review](week1-crt.md).
