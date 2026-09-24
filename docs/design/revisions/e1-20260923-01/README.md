# E1 assembled before-state

Revision `e1-20260923-01` · 2026-09-23 · E1 · **superseded candidate, not accepted**. Source HEAD `23e0450ebe497fdfcebf04cc77eb424b7bbffefa` plus uncommitted integration of preserved predecessor core/UI worktrees. Accepted expressive baseline: none. Prior references: [Higgsfield concepts](../e1-20260917-01/authoring/brief.md).

## What was actually assembled

Separate `experiments/e1/` React/TypeScript/Vite/Tauri project, deterministic authored scores, W-NYC-01 fixtures, closed Draft 2020-12 schemas, local controller, Canvas 2D/WebGL implementations and bundled licensed fonts. No live weather, runtime model, audio, participant data, or ComfyUI. The prior worktrees were copied only after recovering their disjoint ownership contracts; their originals and `week1/` were preserved.

The assembled UI used an opaque black window, a central rectangular stage, a fact panel, exposed button row and reading table. Owner feedback requested a less text-dependent response, then explicitly a genuinely transparent desktop overlay. This before-state is retained to show the change, not promoted as the target.

## Checks executed on this before-state

- `npm ci`, full TypeScript checks, Vite production build: passed.
- Core Vitest: initially 23/23 passed after adding the nine missing object types in the fixture schema; expanded positive authored-state round trips brought the suite to **25/25 passed**. These are schema/controller checks, not visual acceptance.
- Native check initially failed: `icons/icon.ico not found; required for generating a Windows Resource file during tauri-build`. Copied the archive's existing standard Tauri scaffold icon unchanged into the experiment as a placeholder, not an accepted EVA logo.
- `rust:check`, `rust:fmt`, `rust:clippy -- -D warnings`: passed after that fix. `rust:test` completed with **zero Rust tests** in the original minimal host; not policy-test evidence.
- Actual Windows Tauri dev window launched; request control exercised and W-NYC-01 rendered. Captured its WebView content at 1440×900 CSS/physical pixels, DPR 1 / native DPI 96. This was a native WebView capture, not a whole-desktop composite.
- Read-only Opus core/schema/native review reported no current critical/high defects, a positive-state test gap (now covered), and the need for a packaged-CSP smoke check. No native transparency/pass-through claim follows from this review.

## Evidence

- [Browser noon](browser/before-noon-1440x900.png): viewport 1440×900; full-page image includes below-fold content.
- [Browser plain answer](browser/before-plain-1440x900.png): after afternoon move to normalized (0.72, 0.50), pin, compare, plain. This predecessor still drew a static field; the next rendition must be effect-free.
- [Native noon](native/before-noon-1440x900.png): actual Tauri/WebView2 client capture; 1440×900, DPR 1, no application-content inspection.

Fixture: `W-NYC-01` r1; schema `e1.weather-fixture/1`, score `e1.response-score-proposal/1`; seed `W-NYC-01-r1-seed-20261014`; NYC, America/New_York, 2026-10-14 as-of 08:00. Audio off. Native OS motion preference was not explicitly recorded at capture time; do not infer motion behavior from this still.

## Environment and provenance

Observed workstation metadata: Windows 11; NVIDIA GeForce RTX 5080, driver `32.0.16.1656`; display mode 2560×1440, reported refresh 143 Hz; active Razer Cortex power plan. WebView UA reported Edge/Chromium 153.0.0.0. These identify the setup, **not measured renderer performance**. A StarDesk virtual display adapter was also present, without an active mode reported by the query.

Gateway route metadata for the actual sessions records Astra and Terra via Codex, the recovered Sol worker via Codex, and Sonnet 5/Opus 4.8 via Anthropic. Tools used here: native Agent, advisory Ruflo `hooks_route`, Read/Edit/Write/Grep/Glob, PowerShell/Bash/npm/Cargo, Playwright browser and loopback CDP attached to the native WebView. The debug port was process-local, not added to shipped configuration. Higgsfield balance access succeeded; no new generation was submitted.

Fonts/licenses and extraction provenance are in `experiments/e1/public/fonts/SOURCES.md`; the archived scaffold icon is only a temporary Windows build resource. No performance distributions, native recording, transparency, OS pass-through, or macOS checks are claimed for this superseded rendition.

Next: [owner-authorized transparent spatial refinement](../e1-20260923-02/REFINEMENT.md). [Finished E1 acceptance remains pending](../../acceptance/e1.md).
