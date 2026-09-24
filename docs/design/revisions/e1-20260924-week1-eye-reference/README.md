# Week 1 eye reference for E1

2026-09-24 · Reference recapture and Mock Desktop composite · Not an E1 implementation candidate or owner acceptance.

## Purpose and current endpoint

The owner requested the original Week 1 eye and cursor-tracking behavior as the eye endpoint for the Weave study, then supplied a Mock Desktop to simulate the desktop setting. The actual archived renderer was run unchanged. No weather morphology, E1 tracking, speech, or new app behavior was implemented.

**Use [K0-week1-eye-on-mock-desktop.png](K0-week1-eye-on-mock-desktop.png) as the canonical K0-Desktop:**

- **2000 × 1126**, matching the owner's provided desktop image.
- Import once into Weave; connect that same image to **V1 First Frame** and **V3 Last Frame**.
- Eye center approximately **(1000, 538)**; source element bounds `(502, 304.078125, 996, 467.6875)` CSS px at DPR 1. Painted alpha bounds, including the original local border, are `(500, 302)` to `(1500, 774)`.
- Fresh Week 1 eye capture at that viewport, not a scaled copy of the earlier 2560 × 1392 capture.
- Non-generative `Pillow.Image.alpha_composite` of the captured eye layer over the owner's supplied desktop. No scaling, translation, inpainting, color-keying, generated eye, or regenerated wallpaper.
- Background outside the eye and the bottom taskbar were verified pixel-for-pixel unchanged. The original local opaque eye-canvas surface/frame is preserved; it was not falsely keyed out.
- This is a reference composite, **not** evidence that a native application was running on that desktop.

Follow the [node-by-node Weave guide](../../experiments/E1_VOICE_WEAVE_BRIEF.md). The desktop's landscape, white wallpaper sun, taskbar, icons, clock, and date stay fixed through K0/K1/K2 and all transitions. The taskbar date is not the synthetic forecast clock.

## Files

| File | Role / limits |
| --- | --- |
| [K0-week1-eye-on-mock-desktop.png](K0-week1-eye-on-mock-desktop.png) | Current full-frame K0, 2000 × 1126, actual eye on supplied Mock Desktop |
| [mock-desktop-owner.png](mock-desktop-owner.png) | Owner-provided clean background plate, copied byte-for-byte; no claim of redistribution/license clearance |
| [week1-eye-only-mock-size.png](week1-eye-only-mock-size.png) | Actual eye-only browser layer at 2000 × 1126, transparent outside the rendered eye; source used for the composite |
| [week1-eye-only.png](week1-eye-only.png) | Close-up from the initial 2560 × 1392 run; detailed eye/material reference, not a video endpoint |
| [week1-cursor-tracking.mp4](week1-cursor-tracking.mp4) | Trimmed actual pointer-tracking recording; 8.84 s, 2560 × 1392, encoded 25 fps, no audio |
| [week1-cursor-tracking.gif](week1-cursor-tracking.gif) | Lower-resolution motion reference, 1280 × 696 at a nominal 12 fps; not a renderer-FPS measurement |
| [week1-cursor-tracking-raw.webm](week1-cursor-tracking-raw.webm) | Preserved browser recording before trim, including capture setup |
| [tracking-contact-sheet.png](tracking-contact-sheet.png) | Eight representative recording frames, one-second sampling, chronological left-to-right/top-to-bottom |
| [week1-eye-gaze-left.png](week1-eye-gaze-left.png), [right](week1-eye-gaze-right.png), [up](week1-eye-gaze-up.png), [down](week1-eye-gaze-down.png) | Actual original eye response to programmatic browser pointer events, before adding the recording's cursor marker |
| [week1-idle-unmodified.png](week1-idle-unmodified.png) | Initial full browser view, including Speak request, before capture-only control hiding |
| [week1-eye-only-fullframe.png](week1-eye-only-fullframe.png) | Earlier eye-only full frame, 2560 × 1392 with transparent outside pixels; preserved, not the current Mock Desktop endpoint |
| [week1-eye-only-fullframe-dark.png](week1-eye-only-fullframe-dark.png) | Earlier dark-matte K0 study before the owner supplied their desktop; preserved, not mixed into the new sequence |
| [tracking-preview.png](tracking-preview.png) | Recording end-state with the capture-only pointer marker |
| [capture.json](capture.json) | Initial browser/GPU/viewport/source hashes, request/error log, pointer trace, recording timestamps, and unchanged-source result |
| [mock-frame-capture.json](mock-frame-capture.json) | Second, 2000 × 1126 capture metadata and unchanged-source check |
| [composite.json](composite.json) | Source/output hashes and desktop pixel-preservation checks |

K0-Desktop SHA-256: `70a0b8e70070606b68ead6655f9b3f0b7a5ca360fe0ef6457973fed1c134ae7f`.

## Source / platform / actual tools

- Base repository revision: `23e0450ebe497fdfcebf04cc77eb424b7bbffefa`, with pre-existing uncommitted E1 work left intact. The source hash list is in `capture.json`; the listed Week 1 frontend source files matched before/after both capture passes.
- Original implementation: `week1/apps/desktop/src/SignalEye.tsx`, mounted by `MovingEye.tsx` and `App.tsx`. Original pointer events, gaze easing, tissue/lid movement, blinking, matrix shading, and local canvas backing were retained.
- Windows host; browser fallback served by Vite **8.3.0**, not Tauri/WebView2. Node **24.14.0**; installed local Playwright; isolated Chromium **147.0.7727.15** from the existing `chromium-1217` installation.
- Observed WebGL renderer: `ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 (0x00002C02) Direct3D11 vs_5_0 ps_5_0, D3D11)`. This is renderer identification, not a performance benchmark. Driver version was not collected.
- DPR 1, browser dark color scheme, reduced motion `no-preference`, eye state `ready`, microphone unused, audio unused. No weather request, microphone permission, provider inference, or synthesis was triggered.
- Main Astra performed this capture/composite pass using Read/Grep/Glob, shell, local Playwright/Chromium, Pillow, and FFmpeg **8.1.1**. No specialist worker ran this pass. Earlier Terra reference inspection is separate. Ruflo routing was advisory only.
- Shared Playwright MCP could not open its occupied browser profile; it was left untouched. A separate locally installed Chromium instance was used. Playwright's default headless-shell revision was absent, so the existing Chromium executable was selected explicitly. No browser installation, global configuration, permission bypass, or shared-browser termination was used.

## Capture method and presentation-only adjustments

1. Launch the original browser fallback without regenerating archived validators:
   ```powershell
   npm.cmd --prefix week1/apps/desktop --ignore-scripts run dev -- --host 127.0.0.1
   ```
   The existing generated source and dependencies were used. This skips only npm lifecycle regeneration for an unchanged-source capture, not any Git hook.
2. Open an isolated Chromium context at `http://127.0.0.1:1420`. Wait for the actual `Speak request` control, `.signal-eye[data-eye-state="ready"] canvas`, and fonts; fail if the static fallback appears.
3. Move the actual browser pointer to the eye center and let the original gaze response settle. Capture the unmodified full view and eye element. No app source/shader is patched or replaced.
4. Eye-only frames hide `.welcome-command` and `.native-eye-tools` with capture-only `visibility:hidden`, preserving layout. Use `omitBackground` for the eye layer. The earlier dark study adds only a `#080909` HTML review matte.
5. Record center → left → right → up → down → center pointer movement, with holds and intermediate events. `capture.json` records actual positions/timestamps. Add a small visible pointer marker for this recording only; its position follows the same real pointer events that drive the eye. This marker does not control the shader. The source response, not a simulated eye animation, is recorded.
6. Trim the recorded WebM from 3.678 s for approximately 8.807 s; actual MP4 duration is 8.84 s after frame quantization. FFmpeg encodes H.264/yuv420p, CRF 18, no audio; the GIF is reduced to 1280 px width/12 fps. Original WebM remains preserved. Stills and the contact sheet were visually inspected.
7. After receiving the Mock Desktop, recapture the real eye at **2000 × 1126**, the attachment's original dimensions. Do not resize the earlier eye image. Hide only the same surrounding controls.
8. Copy the owner's background bytes unchanged and alpha-composite the new eye layer. Verify background equality wherever the layer has zero alpha and verify the taskbar remains unchanged. See `composite.json`.
9. Close the isolated capture browsers and stop the dev-server task created for this capture. No unrelated session/browser is stopped.

## Checks and limits

**Passed / observed:** actual app load; ready WebGL eye rather than fallback; original gaze/lid response to pointer movement; PNG and representative video-frame inspection; zero browser console/page errors in both passes; no blocked nonlocal/provider requests; listed source hashes unchanged; exact desktop copy; background/taskbar equality outside the eye; full-frame K0 dimension and output hash checks.

**Not performed:** native desktop transparency/input pass-through, production microphone/STT/TTS, E1 weather morph implementation, new weather fixtures, participant comprehension, app test suite, browser-renderer performance measurements, Weave account verification, or any image/video generation job. Encoded video frame rate is not an application rendering benchmark.

The full-frame composite is an authoring reference on an owner-supplied mock scene, not a personal desktop capture taken by this task, and was not uploaded to any service or published. Keep it local unless the owner chooses to submit it to Weave. No license or broader publication permission is inferred from receiving the image.

Owner feedback recorded here: they enjoy Week 1's eye/cursor tracking and requested it for K0, then supplied the Mock Desktop. That is direction for this study, not acceptance of a new E1 build or the finished weather transitions.

**Next owner check:** inspect the K0-Desktop image for the desired eye size/placement, then import BG/R1/K0 and begin the guide's sunny/rainy keyframes. Use this exact K0 for both the reveal start and dismissal end. No phase decision is requested from these captures alone.
