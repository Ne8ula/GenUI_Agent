# week1-resize-voice-20260917

2026-09-17, **candidate; owner review pending**. Working tree based on `83a155f`; [source hashes](source-hashes.json). Accepted visual baseline remains the earlier biomechanical eye rendition; the preceding overlay candidate is superseded, not accepted. No commit/publication; owner planning/research changes preserved.

Owner requested a connector designed for the transparent background, independent weather-panel resizing, fewer unnecessary buttons, and removal of Add Wind in favor of "What about the wind speed?" by voice. The follow-up clarification confirms that the wind UI must stay hidden until voice activation, not be added by default.

Actual author/tools: Codex / GPT-6, TypeScript/React, CSS/SVG, PowerShell/apply_patch, Node tests, Playwright/Edge. Emil design-engineering skill applied; no subagent, external image generation, new dependency or native backend expansion.

| Before | After | Why |
| --- | --- | --- |
| Broad unbacked red matrix tissue | Narrow 2 px dither braid on a dark cable silhouette, defined end collars, shorter gap | Give the connector its own contrast and structure against desktop content |
| Viewport-driven weather width | Pointer/keyboard corner resizing, container-width reflow, internal scroll | Let the owner size the weather instrument itself |
| Quiet/Add Wind/Undo/Reset button cluster | Essential microphone, small move/close/resize affordances and source inspection | Reduce the application control clutter |
| Button-triggered wind patch | Recognized microphone follow-up; hidden beforehand and in each new weather session | Match the requested voice-only reveal |

`windIntent` is a bounded independent matcher, rejecting unrelated/compound instructions. Only the microphone transcript callback can apply the wind patch; typed intent is rejected. A ready weather card is required. Existing schema validation and synthetic wind values/units/missingness are retained. The patch preserves stable card ID, selected day, dimensions and position. The content scrolls to the wind section; repeating the request brings it back into view without a second revision. A fresh weather session hides wind again. No wind sentence is added to the three-line ElevenLabs narration.

`usePanelResize.ts` owns local dimensions outside generated document state. Drag and arrow-key resizing enforce minimum dimensions and available viewport/stage bounds. The card header/grip stay outside its scrollable content. Container queries reflow forecast and wind rows when the panel becomes narrow even on a wide desktop. Local geometry survives the voice-driven patch. Connector endpoints track dimensions and movement. Cancel/lost pointer capture ends resizing. OS reduced motion remains available despite removal of the Quiet button.

Transparent/frameless native configuration remains unchanged. The backing belongs only to the narrow connector; no global background was restored. Essential preset/typed weather fallback and inspectable preference source are retained. The former button-driven regression scripts are preserved as historical fixtures; current interaction harness is `scripts/resize-voice-smoke.mjs`.

## Actual evidence and verification

Windows/Edge, DPR 1, 1440 x 960 with synthetic Ithaca weather and synthetic audio fixture; additional 1960 x 530, 960 x 760, 600 x 760 and 400 x 640 layouts. Normal eye motion uses live time. Images with alpha may display black in viewers. The light/dark backdrop captures are **synthetic browser contrast fixtures**, not desktop screenshots or actual native compositing evidence. Video has no audio track.

- [Before](before/weather-alpha.png), [before motion/checks](before/results.json): captured preceding implementation before source edits.
- [Intermediate weather](browser-01/weather.png), [intermediate resized](browser-01/resized.png), [checks](browser-01/results.json): preserved first passing candidate. Final refinement improves grip visibility, restores hidden wind on a new session and adds contrast captures.
- [Final weather](browser-02/weather.png), [resized](browser-02/resized.png), [voice wind reveal](browser-02/wind-voice.png), [narrow wind](browser-02/wind-400x640.png), [loading](browser-02/loading.png), [motion recording](browser-02/resize-voice.webm).
- [Light surface](browser-02/weather-light-surface.png), [dark surface](browser-02/weather-dark-surface.png): reviewed connector contrast with the full-window background absent in the actual app.
- [Final browser results](browser-02/results.json): pointer resizing changes both dimensions; keyboard resizing works; wind hidden initially; removed buttons absent; typed wind rejected; real AudioWorklet with injected Whisper follow-up reveals wind; geometry and card ID preserved; repeat idempotent; content has no horizontal overflow at four viewports; reduced-motion dismissal; wind-before-weather rejected; fresh weather session hides wind. No browser errors.
- `npm.cmd test`: **19 JavaScript tests passed**, including positive and negative wind intent fixtures and existing protocol/memory/voice/narration boundaries.
- `npm.cmd run build`: frontend/server TypeScript and Vite production build passed after final edits.

No Rust changes or Rust test rerun this revision. Live Whisper recognition of the new spoken phrase and actual native overlay/resizing still require owner exercise; browser voice tests inject the bounded transcript. The preceding full desktop build was blocked by Windows Application Control error 4551; it was not retried here. No native/performance claim or study-phase acceptance.

Changed implementation: `App.tsx`, `DitherLink.tsx`, `Overlay.css`, new `usePanelResize.ts`, `packages/protocol/voice.ts`, `scripts/voice-contract.test.mjs`, new browser harness. Updated canonical design/README/index and this review packet.

Owner exercise: open weather, drag the corner grip smaller/larger, move the card, then use the microphone to ask "What about the wind speed?" and send. Expect wind to appear with the same panel position/size, with no Add Wind button. Scroll back to forecast, try narrow/short windows and dismiss/reopen. Owner decision/date: **pending**.
