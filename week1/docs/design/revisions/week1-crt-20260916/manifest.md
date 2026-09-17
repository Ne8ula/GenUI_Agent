# week1-crt-20260916

Status: **candidate; owner acceptance pending**, 2026-09-16. Working tree based on `83a155f`; [source hashes](source-hashes.json). No commit/publish. Owner planning/research edits preserved. Accepted setup baseline remains `week1-resize-20260916`; immediately preceding `week1-assembly-20260916` is superseded and preserved.

## Direction and authorship

Owner requested 5–10 seconds of loading, folder-like memory retrieval, stronger Evangelion-inspired brutalism rather than minimal sci-fi, CRT bands progressively building the dashboard, dithery surfaces, and faster pupil response to cursor movement. This extends only the current week-one visual/interaction revision.

Actual author/tools: Codex / GPT-6, PowerShell, apply_patch, React/TypeScript, local CSS/GLSL, Playwright and Edge. No subagent or independent reviewer. No new raster/image provider or copied franchise asset. Higgsfield's earlier account restriction remains documented in the [prior authoring brief](../week1-voice-eye-20260916/authoring-brief.md); no substitute integration was installed. This direction and the extracted vocabulary below constitute the new deferred authoring brief.

| Before | After | Why |
| --- | --- | --- |
| Brief wireframe with geometric reticle | Folder/sheet retrieval, heavy MEMORY/CONSTRUCT blocks, stepped raster blueprint and forecast reveal | Follow requested memory-search and CRT/brutalist motion |
| ~2.5-second entry choreography | 5.4-second staging plus 2.1-second forecast reveal; measured 7.5 seconds on the fixture | Meet the requested 5–10-second recording pace |
| Mostly smooth card surfaces | Coarse print grain, solid red strips, dashed divisions and dithered selection/buttons | Carry the eye's rough treatment into the application |
| Gaze targets only inside the eye with slow smoothing | Whole-window pointer tracking with a frame-time-based 40 ms smoothing constant | React promptly to cursor movement over the dashboard as well |

`WeatherAssembly.tsx` stages VAULT → PREFERENCES → WEATHER-UNITS.MD, then prints a blueprint. Those labels represent the single existing synthetic record; this is **authored presentation, not a filesystem traversal/private-vault search**. The status independently reports actual pending/bound/unavailable data. No fabricated weather values or provider percentage appears. The raster unit follows the validated preference/default.

`Crt.css` owns the candidate visual vocabulary: black/red title slabs, dense stationary grain, folder tabs and lifted sheets, narrow scan beams, stepped top-to-bottom printing, and a temporary scanline layer that clears when the result becomes interactive. No full-screen flashes. Controls within the revealing card are inert until it is fully visible; Dismiss and Quiet remain available. Quiet/reduced motion skips artificial holds and animated construction but still waits for real data. Dismissal cancels stage timers and ignores late data. Repeating weather after a card exists preserves that card instead of replaying the entry animation.

`SignalEye.tsx` keeps the square pupil, coarse ordered dithering and continuous docking. Global passive pointer events set bounded gaze, including during listening/construction; idle drift resumes when the pointer leaves the window. A 40 ms exponential time constant replaces the old fixed slow blend. Quiet/reduced motion remains static. Listeners and GPU resources are removed on unmount.

## Evidence and checks

Windows x64, Node 24.14.0, Edge 153.0.4234.32, DPR 1; dependencies lockfile-pinned. All captures are browser content at `http://127.0.0.1:1420`, not OS chrome or native Tauri. Actual renderer in voice regression: RTX 5080 through ANGLE/D3D11. No new GPU setup or native performance claim.

Fixtures remain the synthetic September 17–23, 2026 Ithaca forecast and existing synthetic Markdown units. Real Whisper recording uses temporary synthetic Windows speech, not a personal microphone recording. No raw audio/secrets/private records are saved. Shader gaze/blink use live time; normal-motion frames are not pixel-identical seeded comparisons.

| Evidence | Meaning |
| --- | --- |
| [Before eye](before/eye.png), [before loading](before/assembling.png), [before wind](before/wind.png) | Current preceding UI captured before editing at 1440 × 960. The preview's short `weather.png` wait also caught loading; it is not labeled a completed forecast. Prior base is preserved in [preceding recording still](../week1-assembly-20260916/recording/weather-viewport.png). |
| [CRT checks](browser-01/results.json) | Measured exactly 7500 ms from loading to ready; pupil uniform reached right +0.1446 / left −0.1430 within each 180 ms sample window for pointer positions outside the eye; docked tracking, folder states, inert reveal, responsive layouts, quiet and cancellation passed |
| [Folders](browser-01/memory-folders.png), [record](browser-01/memory-record.png), [raster](browser-01/raster-build.png), [scan reveal](browser-01/scan-reveal.png), [ready](browser-01/ready.png) | Inspected 1440 × 960 state sequence |
| [Narrow folders](browser-01/folders-400x640.png), [wide/short folders](browser-01/folders-1960x530.png) | Four additional viewport checks: 960 × 760, 1960 × 530, 600 × 760, 400 × 640; no horizontal page/day overflow |
| [Readiness checks](readiness/results.json) | Final source: same-canvas travel, cancellation, responsive landing, injected 5.8-second memory response beyond the 5.4-second hold, reduced-motion waiting, timeout fallback and rejection of late replies. Injected IPC is not Rust/native proof. |
| [Voice regression](voice-regression/results.json) | Real AudioWorklet with injected provider replies; two move/day/wind/source/undo/reset cycles, focus, cancellation, error/unsupported intent, GPU loss fallback and reduced motion |
| [Final real-Whisper recording](recording/voice-weather-demo.webm) | Synthetic speech → real Whisper → eye docking, folders, CRT construction/reveal → move/wind/source/undo/reset/dismiss; 1440 × 960, no audio track |
| [Recording retrieval](recording/memory-record-viewport.png), [recording raster](recording/raster-viewport.png), [recording weather](recording/weather-viewport.png) | Representative final viewport stills |

The CRT matrix preceded only two small refinements: quiet mode freezes folder selection immediately and the blueprint unit is derived from the validated preference. Final readiness/voice checks and recording use those changes. Frontend/server TypeScript and Vite production build passed after all source edits. Backend/protocol code was unchanged; prior backend test counts are not reported as rerun. No Rust changes/build retry. Native verification remains blocked by the earlier Windows Application Control issue.

7500 ms measures this authored browser presentation, not backend/model latency. The 180 ms gaze check samples the shader uniform after pointer movement, not OS-to-photon latency. Recording helper frame samples are not a GPU/native performance certification. Eye remains procedural, not a photographic asset.

Owner decision/date: **pending**. [Owner exercise](../../acceptance/week1-crt.md). No study/product phase acceptance is inferred.
