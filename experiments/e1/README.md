# E1 — revisable weather

Separate synthetic experiment; **finished-candidate acceptance is pending**. `week1/` is preserved. The active direction is a composition-first, genuinely transparent Windows desktop response with the actual Week 1 procedural eye—not a boxed weather dashboard. See [the current native review packet](../../docs/design/revisions/e1-20260924-01/README.md), [owner refinement](../../docs/design/revisions/e1-20260923-02/REFINEMENT.md), and [pending review](../../docs/design/acceptance/e1.md).

## Run from the repository root

The already-built, bundled Windows demo can be opened directly without a Vite server:

```powershell
& ".\experiments\e1\src-tauri\target\debug\eva-e1.exe"
```

That build uses the production frontend/CSP and contains no development Inspector or test harness. For source development/rebuilding, use the commands below.

Prerequisites: the existing Windows Rust/MSVC/WebView2 setup and Node 24.14 or later. This project does not install GPU models, request live weather, or require a provider credential.

```powershell
npm --prefix experiments/e1 ci
npm --prefix experiments/e1 run desktop:dev
```

Do not run a second Vite server on port 1431; the desktop command starts it. Browser-only development is available separately:

```powershell
npm --prefix experiments/e1 run dev
# http://127.0.0.1:1431
```

Browser rendering does **not** establish native transparency or OS input pass-through. Run the native candidate over deliberately nonprivate content while reviewing it. Native evidence and exact platform limitations are recorded in the [design evidence index](../../docs/design/INDEX.md), not inferred from the configuration.

The transparent native host is currently **Windows-only** and uses the current monitor's work area. The development executable is unsigned. An earlier launch was blocked by Smart App Control; the owner reported disabling that setting and then authorized the successful native run. No security setting is changed by these scripts. If Windows blocks a future build, stop at that policy boundary rather than applying an automatic workaround. Claude's prompted permissions and the E1 acceptance gate are unchanged.

## Bounded episode

1. Launch the native app, then use **EVA → Location and fixture → Request weather**. The controls close and the independent facts/material appear over the real desktop. The restored Week 1 eye appears near the lower-left work-area edge.
2. Click the **15:00** anchor, drag its time/temperature handle, and click its small **Pin** button. Open **EVA → Compare & recipe → Compare with noon**. The existing positions must remain unchanged.
3. Redirect to **09:00** or **12:00** while the material is moving. With an E1 anchor focused, press **S** to stop, **L** for less motion, or **P** for plain answer. Arrow keys move the focused anchor; Shift uses a larger step. These are local focused-window shortcuts, not global keyboard hooks.
4. Use an anchor's **···** disclosure for local facts, or **EVA → Full weather table / Source and context**. Plain answer removes the eye and field effects while keeping exact facts and scope.
5. In **Location and fixture**, try the **Missing cloud** variant and then an unavailable location such as **Boston**. The cloud must read **Not provided** in the missing variant, and NYC values must not be relabeled as Boston.
6. Click **EVA → Dismiss**. Both native windows exit; click the formerly occupied area to confirm the underlying application works. **Escape** closes an open local disclosure first, otherwise dismisses E1. Relaunch explicitly for a new response.

The eye and weather material themselves are click-through; only bounded local controls/reading targets receive native input. The development Inspector contains renderer/failure/stale-patch tests and is absent from a packaged production frontend. Do not interpret a preset, test trace or owner impression as runtime model generation or participant-study evidence.

This is an authored response vocabulary, **not live/model-generated UI**. The only data is W-NYC-01 r1, seed `W-NYC-01-r1-seed-20261014`: invented NYC weather, America/New_York, 2026-10-14 as-of 08:00. Cloud fraction and precipitation probability are distinct. Missing cloud is not zero or clear sky.

## Checks

```powershell
npm --prefix experiments/e1 run typecheck
npm --prefix experiments/e1 test
npm --prefix experiments/e1 run build
npm --prefix experiments/e1 run rust:check
npm --prefix experiments/e1 run rust:test
npm --prefix experiments/e1 run rust:fmt
npm --prefix experiments/e1 run rust:clippy
npm --prefix experiments/e1 run desktop:build:debug
```

`src-tauri/Cargo.lock` is retained alongside the experiment source for reproducibility; normal check/test scripts use `--locked`. No repository commit is implied. Rebuilds do not constitute an exercised native demo. The current owner decision remains pending even when checks pass.

## Test tooling and provenance

The original controller/schema/core and UI were recovered from separate predecessor workers' disjoint worktrees; source revision was `9cb8474`, integrated onto `23e0450` without committing or modifying the originals. The Ajv strict schema blocker was corrected during integration. Fonts are local OFL assets with [source/license notes](public/fonts/SOURCES.md). The Windows icon is the unchanged archived standard Tauri scaffold icon, a build placeholder rather than an accepted EVA logo.

`src/core/API.md` documents the deterministic controller. `src/native/API.md` describes the label/session-bound native bridge. The eye derives from explicit selected-anchor geometry; it does not watch the desktop, pointer, microphone or user emotion.

The controller event `monotonicMs` values are **synthetic sequence timestamps**, not measured latency. Actual renderer sampling uses rAF intervals from the real material layer and reports instrumentation overhead. Test scripts may attach to a loopback CDP port supplied to a **test process only**; no debugging port belongs in shipped configuration. Public captures contain synthetic test backgrounds only, never personal desktop or participant content.

Verification helpers:

- `scripts/verify-browser.mjs <fresh-output-directory>`: supplementary browser regression and alpha PNGs, never native pass-through proof.
- `scripts/verify-native.mjs <fixture-pid> <state-file> <native-pid> <fresh-output-directory> final`: actual OS pointer routing and guarded native captures.
- `scripts/verify-eye-native.mjs <fresh-output-directory>`: actual native shader/lifecycle and renderer-loss checks.
- `scripts/record-native-demo.mjs <fixture-pid> <state-file> <native-pid> <fresh-output-directory>`: guarded native composite recording with physical pointer actions and dismissal.
- `scripts/native-benchmark.mjs <output-directory> <2000|8000>`: three 30-second material-renderer runs per backend after warm-up; no recording during sampling.
- `scripts/measure-native-feedback.mjs <fixture-pid> <state-file> <native-pid> <output-json>`: 30 focused native key events to second-rAF proxy, not input-to-photon measurement.

These Node helpers require an installed Playwright module; set `E1_PLAYWRIGHT_MODULE` to its `index.mjs` path when it is not a project dependency. The executed evidence records the actual local version. They do not install it implicitly. See [the separate desktop fixture/probe](scripts/DESKTOP_FIXTURE.md) for the nonprivate test background and physical-coordinate requirements.
