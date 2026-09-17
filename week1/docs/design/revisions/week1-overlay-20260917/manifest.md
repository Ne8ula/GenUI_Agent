# week1-overlay-20260917

2026-09-17, **candidate; owner acceptance pending**. Working tree based on `83a155f`; [source hashes](source-hashes.json). Accepted visual predecessor: `week1-biomech-20260917`; intervening three-line narration is preserved. No commit/publication. Existing owner edits are preserved; the week-one plan receives only an explicit note authorizing the requested departure from its original decorated-window checkpoint.

Owner requested dither-matrix connectors instead of simple lines, removal of all global background and Windows chrome, and only the eye, dashboard/loading and connections over the desktop. Actual author/tools: Codex / GPT-6, React/TypeScript, SVG/CSS, Tauri config, PowerShell, Playwright/Edge and System.Drawing alpha inspection. Emil design-engineering skill applied. No independent agent, generated artwork or new dependency. Higgsfield's previously documented account limitation remains; this uses reviewed native components.

| Before | After | Why |
| --- | --- | --- |
| Thin branching SVG strokes | Three merged tissue strands made from 3 px square cells using a 4 x 4 ordered-dither threshold | Match the rough eye's matrix treatment |
| Fixed small connector beside the eye | Measured eye/card endpoints, updated after card moves, responsive vertical connections | Keep the visual connection attached |
| Full-window grain and contour background, EVA header and workspace bar | Transparent root layers; controls attached to the eye | Leave the desktop visible around actual app surfaces |
| Decorated opaque Windows window | Transparent, decoration-free, shadow-free Tauri configuration; eye-attached drag/close controls | Remove Windows chrome while retaining window control |

Implementation: new `DitherLink.tsx` and `Overlay.css`; updated App composition, MovingEye native controls and Tauri config/capabilities; removed obsolete SomaticLink code/styles. Narrow capabilities permit only dragging/closing the main window in addition to existing commands. [Official Tauri configuration](https://v2.tauri.app/reference/config/) documents transparency, decorations and shadow settings; [window API](https://v2.tauri.app/reference/javascript/api/namespacewindow/) supplies drag/close. No always-on-top or click-through implementation is implied.

Connectors use deterministic cells and authored curves, not runtime model code. ResizeObserver and card-position revisions update geometry; no perpetual connector draw loop. One stepped entry reveal yields to Quiet/reduced motion. Existing shader/canvas persists through docking. Dashboard values, typography, cards and source inspector remain opaque/readable; the inspector backdrop is transparent. Essential microphone, Quiet, Dismiss, preset and keyboard controls remain available. Native drag/close buttons appear on eye hover/focus (always visible at narrow widths); normal Alt+F4 remains the OS close action.

## Evidence and checks

Browser captures: Edge on Windows, 1440 x 960, DPR 1; synthetic Ithaca forecast and bundled preference. Additional 1960 x 530, 960 x 760, 600 x 760 and 400 x 640 fixtures. Live eye motion is unseeded. Screenshots use actual alpha, not a composited desktop image; a viewer may display transparent areas as black. Video has no alpha channel and no audio track, so it demonstrates motion only.

- [Before eye](before/eye.png), [before loading](before/assembling.png), [before wind](before/wind.png): preceding application captured before editing.
- [First candidate](browser-01/weather-alpha.png), [failure](browser-01/failure.json): preserved connector initialization failure. Corrected by mounting the connector after its referenced surfaces.
- [Final eye](browser-02/eye-alpha.png), [loading](browser-02/loading-alpha.png), [dashboard](browser-02/weather-alpha.png), [moved dashboard](browser-02/moved-alpha.png), [narrow](browser-02/weather-400x640.png), [motion clip](browser-02/overlay-flow.webm).
- [Overlay checks](browser-02/results.json): transparent computed root layers, absent global header, dense cells, connector movement, Quiet, four responsive widths, dismissal cleanup; no browser errors.
- [PNG alpha inspection](browser-02/alpha-check.json): corners have alpha 0, and substantial empty areas remain fully transparent in eye/loading/dashboard captures. System.Drawing sampled every eighth pixel; this is screenshot-alpha evidence, not native desktop-compositor proof.
- [Voice/control regression](voice-regression/results.json): two complete move/day/wind/source/undo/reset cycles, keyboard/focus/Escape, real AudioWorklet with injected transcription, cancellation/error, GPU context-loss fallback and reduced motion passed. RTX 5080 identified through ANGLE/D3D11; no new performance claim.
- Frontend/server TypeScript and Vite production build passed. `node scripts/rust.mjs check --locked` passed with the new window configuration/capabilities.
- `npm.cmd run desktop:build:debug` **blocked**: Windows Application Control error 4551 prevented execution of Tauri's `build-script-build`. No full native build success or native screenshot claimed. This is OS policy, not a tool approval rejection. Browser evidence does not verify native window transparency, OS dragging/closing, hit testing or resizing.

No backend contract changes; narration/Whisper services remain unchanged. Final cleanup removed only the unused thin-connector component/styles after browser capture. Owner acceptance remains pending, including a native retest. The prior visual acceptance does not accept this changed shell.

Owner exercise: restart `npm.cmd run desktop:dev` after the local build policy permits it; confirm the desktop is visible through gaps with no title bar or rectangular shadow; hover/focus the eye for drag/close; request weather and watch docking, matrix connection and CRT construction; move the card and try Quiet/Dismiss. Review the dense connector style. Browser mode intentionally cannot expose the desktop beneath its tab.
