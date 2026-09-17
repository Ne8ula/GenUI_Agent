# week1-resize-20260916

Status: accepted for the setup checkpoint on 2026-09-16. Owner: "Everything is confirmed. Start next implementation step." Recorded source hashes were verified before beginning step 2. This does not accept the full week-one demo or establish a new standalone executable build.

## Scope and provenance

- Predecessor: [week1-scaffold-20260916](../week1-scaffold-20260916/manifest.md), not an accepted visual baseline. Owner previously confirmed its Rust response, then reported a wide-window resize blocker and supplied a screenshot in the conversation.
- Source: working tree based on `83a155f`; [changed-source and lockfile hashes](source-hashes.json). App changes are confined to `apps/desktop/src/App.tsx` and `App.css`; verification changes are in `scripts/check-resize.mjs` and `scripts/smoke.mjs`.
- Actual author/tools: Codex / GPT-6, PowerShell, apply_patch, Playwright 1.63.0 and Edge/WebView2. No external design generator or additional agent participated.
- Fixture: the existing synthetic runtime probe, in native and browser-fallback modes. Same fonts, palette, and versions as the predecessor. No random data, clock-dependent content, new motion, or external media.
- Platform: Windows x64. Matching browser before/after captures at 960×760, 1960×530, 1280×530, 960×530 and 400×640 CSS px; DPR 1. Browser uses reduced motion. Native tests use the same WebView viewport sizes through CDP emulation; this does not physically drag the OS window border.
- Native source: an isolated instance of the existing debug host loading the updated frontend at `http://127.0.0.1:1420/`. The owner's running development window was left open. No new standalone executable was built for this frontend-only fix.

## Finding and fix

Before: the 880px maximum wrapper kept the panel at 816px across desktop widths. At 1960×530 the stacked content required 695px of document height, leaving the response and footer below the viewport. The user screenshot showed this wide, short arrangement.

After: a fluid wrapper up to 1440px and a two-column panel use available desktop width. A short-height breakpoint reduces spacing while retaining text size. At 1960×530 the panel is 1360px wide and the entire response/footer fit; the native footer bottom is 417.5px. Narrow windows retain natural vertical scrolling without horizontal overflow.

The native test also found that disabling the button during an asynchronous IPC call discarded keyboard focus. The button now exposes `aria-disabled` during loading, with an explicit request guard, so it keeps focus while rejecting repeated activation.

## Evidence and checks

- [Before captures and geometry](before/results.json), including [wide/short before](before/1960x530.png).
- `after` preserves the first responsive candidate. [Final browser check](after-02/results.json) and [matching wide/short after](after-02/1960x530.png) passed all five sizes.
- `native` and `native-02` preserve the failed focus checks. The second run initialized CDP emulation before focusing; focus still failed, identifying the disabled-button behavior. Neither run is a passed retest.
- [Final native check](native-03/results.json) passed after the focus fix. [Wide native response](native-03/resize-1960x530.png), [960×530 native response](native-03/resize-960x530.png), and idle/focus/loading/success/error/relaunch images are preserved in that folder. Wide before/after and native after images were visually inspected.
- Passed: TypeScript/Vite production build; responsive geometry, no horizontal overflow, retained response and keyboard focus through viewport changes; real Rust IPC; request rejection; loading/error/retry; normal close/relaunch of the separate test instance.
- No Rust logic or policy changed; earlier Rust tests were not repeated for this CSS/React adjustment. No release build was attempted; the previously documented Windows Application Control release blocker remains.

## Owner retest

Resize the running development window into the wide, short shape from the supplied screenshot. Expect the explanation on the left and the connection control/result on the right, with the footer visible. Click or keyboard-activate the check, resize again, and confirm the result persists. At narrow widths, vertical scrolling is expected. The owner subsequently confirmed the revision and authorized step 2 on 2026-09-16; this retest is closed.
