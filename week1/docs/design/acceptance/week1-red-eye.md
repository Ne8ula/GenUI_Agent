# Red eye application review

Revision: `week1-red-eye-20260916`, 2026-09-16. Status: **pending owner acceptance**. [Manifest / source hashes / evidence](../revisions/week1-red-eye-20260916/manifest.md).

Owner feedback: remove explanatory texts, replace the artificial-looking eye with an organic eye based on the new reference, replace orange with Evangelion red. This is an explicitly authorized visual revision; it is not study-phase acceptance.

Run `npm.cmd run dev` and open `http://127.0.0.1:1420`; F11 gives browser fullscreen for recording. See the [README](../../../apps/desktop/README.md) for private voice configuration. Select Speak request, say “Show me the weather in Ithaca,” and Send recording. Observe the eye/assembly, move the card, add wind, inspect Celsius, Escape, undo/reset and dismiss. Repeat; try a short and narrow window, typed request and Quiet mode.

Expected: red accents, anatomical round-pupil eye with gaze/blink/audio response, no pitch/instruction paragraphs, readable interactive weather and essential controls/status only. Source details remain in the inspector. Forecast stays synthetic and carries a compact Sample label.

Actual: final frontend/server build and browser interaction/layout checks passed; fresh recording completed with real Whisper using synthetic speech. Before and intermediate renditions are preserved. Native verification remains blocked by the previously documented Windows Application Control issue; no native or Rust retest was claimed this turn. Eye is a source-authored stylized procedural rendition, not a photographic image asset.

Owner decision/date against this rendition: **pending**. Next owner test is the visual likeness and clean recorded interaction above; complete native acceptance still needs legitimate policy resolution and a fresh Tauri run.

Follow-up owner feedback, 2026-09-16: show the dashboard loading/generation animation and the eye shrinking/moving aside; the eye still looks cartoonish, so increase pixelation/dithering and restore the square pupil. This rendition is superseded, not accepted. See [assembly review](week1-assembly.md).
