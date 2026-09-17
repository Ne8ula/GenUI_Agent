# week1-scaffold-20260916

| Field | Value |
| --- | --- |
| Status | Candidate; owner acceptance pending |
| Date | 2026-09-16 |
| Scope | Week-one step 1: Tauri/React scaffold and read-only IPC probe |
| Predecessor | No runnable before-state; no accepted app screenshot |
| Concept reference | [Historical hero v3](../../../../../docs/research/visuals/eva-hero-interface-concept-v3.png); reference only, not a runnable predecessor |
| Source | Working tree based on `83a155f`; new scaffold, lockfiles and scripts identified by [SHA256 manifest](source-hashes.json); existing owner planning edits preserved |
| Actual authoring | Codex / GPT-6; official create-tauri-app 4.7.4, PowerShell, npm/Cargo, apply_patch, Playwright 1.63.0, Edge/WebView2 |
| Fixture | Fixed runtime request `{ "protocolVersion": 1 }`; no private data or connectors |
| Platform | Windows x64; WebView2 runtime 153.0.4234.32 |
| Viewport / DPI | Native WebView content and wide browser: 960 × 760 CSS px, DPR 1; narrow browser: 400 × 640, DPR 1 |
| Versions | Node 24.14.0; npm 11.9.0; Rust/Cargo 1.98.1; Tauri crate 2.11.5, CLI 2.11.4, API 2.11.1; React 19.3.0; TypeScript 6.0.3; Vite 8.3.0 |
| Fonts | Local Space Grotesk 500, IBM Plex Sans 400/500, IBM Plex Mono 400; Fontsource 5.3.0 and bundled OFL notices |
| Seed / clock | No random or clock-driven UI; fresh temporary WebView profile per native launch |
| Intended change | Ordinary decorated, resizable desktop window with fixed Rust response, explicit browser fixture, keyboard focus and readable request states |
| Tested executable | `apps/desktop/src-tauri/target/debug/eva-desktop.exe`, SHA256 `4A5DC60ECC25AB285D25BFA15FD663CAB6737101D9D23EB76E8F62E5D13E07C9` |
| Owner feedback / decision | 2026-09-16: owner confirmed "Rust connection verified" / "The local Rust runtime responded." Source hashes still match; launch mode/build hash not specified by owner. Remaining owner checks and acceptance pending; see [review record](../../acceptance/week1-demo.md). |

## Renditions and checks

- `native-01`: incomplete initial smoke attempt. Idle/focus/success screenshots retained; see its [note](native-01/NOTE.md) for the failure-injection harness issue.
- `native-02`: [passed native retest](native-02/results.json), including request rejection, bounded error/retry, normal close and relaunch. Window-title text in this result has a PowerShell output-encoding artifact; the final harness corrects it.
- `native-03`: [final standalone debug check](native-03/results.json). [Idle](native-03/idle.png), [focus](native-03/focus.png), [loading](native-03/loading.png), [success](native-03/success.png), [error](native-03/error.png), and [relaunch](native-03/relaunch.png). Captured with Vite stopped and the frontend embedded. Successful response and negative command checks use real Rust IPC. Loading/error states use explicitly synthetic transport injection; retry restores real IPC.
- `dev-01`: [development-mode check](dev-01/results.json) and [capture](dev-01/success.png), using the actual `desktop:dev -- --no-watch` launch with Vite. Ordinary window close succeeded. Tauri's shutdown of the Vite child printed an npm lifecycle error; the Tauri command exited 0.
- `browser-01`: [fallback check](browser-01/results.json), [wide capture](browser-01/success.png), and [400px reduced-motion capture](browser-01/narrow-reduced-motion.png). Keyboard activation passed, no horizontal overflow; narrow content scrolls vertically.

The native success/error and narrow browser images were visually inspected. Captures are WebView content, excluding OS chrome. Native title/handle and normal close/relaunch were checked separately; screenshots alone do not prove them. No animations were introduced.

Passed: frontend typecheck/build, Rust check, three contract tests, rustfmt, Clippy with warnings denied, debug desktop build, development and embedded native IPC, browser fallback, and `git diff --check`. Initial npm installation reported zero known vulnerabilities; this is not a full supply-chain audit.

Blocked: optimized release build. Windows Application Control refused the `camino v1.2.6` release dependency build script with OS error 4551. No Windows policy was disabled or changed. Debug build remains usable; release compilation, release launch, packaging, signing, and macOS are unverified.

## Limits

This is a setup screen, not the weather instrument or memory demo. It retains the stock Tauri app icon. No full visual-baseline acceptance, phase acceptance, performance measurement, drag/resize behavior beyond the configured native window, second-window ACL exercise, screen-reader assessment, or full product security audit is claimed. No external assets or cloud models run on this path. See the [owner test](../../acceptance/week1-demo.md).
