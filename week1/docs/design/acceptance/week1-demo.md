# Week-one demo acceptance

**Later outcome, 2026-09-17:** [the owner reported the completed demo successful](week1-outcome.md). The scaffold checkpoint and statuses below are historical.

Status: **step 1 accepted; full week-one demo pending**. On 2026-09-16 the owner stated, "Everything is confirmed. Start next implementation step." This accepts the scaffold and resize fix at `week1-resize-20260916` and authorizes implementation-order step 2. The accepted source hashes were verified before starting new work. This does not claim completion of the weather/memory demo, a release build, or S0–S4/product milestones.

## Prepared checkpoint: scaffold and window IPC

Latest candidate follow-up (2026-09-16): the owner requested an effects-driven redesign, animated square-pupil eye and simple Whisper weather input. See [voice/eye owner exercise](week1-voice-eye.md). This changes the authorized demo scope; it does not accept the new rendition, resolve native policy blockers, or complete a study phase.

**Current follow-up, 2026-09-16:** the owner supplied passing step-2 tests and then requested the next implementation steps and a distinct visual pattern. The [weather review](week1-weather.md) is now the current exercise; the scaffold exercise below is historical. The new candidate is not accepted. Final browser checks pass; a preceding native candidate passed full IPC/rehearsal checks, but the final rebuilt executable is blocked by Windows Application Control. Full week-one acceptance remains pending.

Date: 2026-09-16. Scope is implementation-order step 1 only, under the owner's request to build the Tauri/React scaffold and window IPC check. The weather, memory and revision sequence remains pending.

Revision: `week1-scaffold-20260916`, working tree based on `83a155f`. The [manifest](../revisions/week1-scaffold-20260916/manifest.md) records source hashes, exact tested debug-executable hash, tools, versions, fixtures, screenshots, retests, and limitations. Implemented by Codex / GPT-6 using the official Tauri scaffolder and local development tools; no additional model reviewer was invoked.

## Reproducible owner exercise

From the repository root:

```powershell
npm.cmd run desktop:dev
```

1. Confirm an ordinary EVA desktop window opens with the **Desktop runtime** label.
2. Press Tab to focus **Check Rust connection**, then Enter. Expect **Rust connection verified**, **The local Rust runtime responded.**, and **Protocol 1 / App 0.1.0**.
3. Repeat the check, resize the native window, and confirm the control remains readable and reachable.
4. Close the window normally. Run the command again and repeat the check.
5. Close development mode, then run the embedded debug build:

```powershell
npm.cmd run desktop:build:debug
& .\apps\desktop\src-tauri\target\debug\eva-desktop.exe
```

Repeat the check without a Vite server. For the browser fallback, close the native app and use `npm.cmd run dev`; open `http://127.0.0.1:1420` and confirm the explicit **Browser fallback · Fixture only** label. It must not claim a Rust response.

Full command details are in the [desktop README](../../../apps/desktop/README.md).

## Actual technical results

| Check | Result |
| --- | --- |
| TypeScript check and Vite production build | Passed |
| Rust check, rustfmt, Clippy with warnings denied | Passed |
| Rust request/response contract tests | 3 passed: valid serialized response, unsupported protocol, unknown/missing/invalid fields |
| Standalone debug executable | Built; actual WebView2 IPC passed with Vite stopped |
| Actual Tauri development launch | Passed: Vite-backed native window and Rust IPC |
| Runtime negative checks | Unsupported protocol, missing/unknown payload fields, unregistered command and unauthorized window-title command rejected |
| Native lifecycle | Normal close, relaunch, repeated Rust response and normal close passed |
| Keyboard and states | Tab/Enter, pending disabled control, synthetic error, real retry response verified |
| Browser fallback | Passed; labeled fixture, keyboard activation, 400px overflow check and reduced-motion fixture |
| Visual evidence | Preserved; first implementation has no runnable before-state |
| Optimized release build | Blocked by Windows Application Control, OS error 4551, on dependency build script |
| Packaging/signing/macOS/full demo | Not run; outside this setup result |

Retest history: the first native smoke harness could not inject failure by assigning Tauri's immutable `invoke` function. The corrected test uses synthetic transport injection; the final native suite passed. The app implementation did not change to accommodate injection.

The release-build blocker remains unresolved. No security policy was bypassed. The debug executable supports this setup exercise; it does not establish a release build. Secondary-window/remote-origin adversarial tests and full security evaluation remain future work.

## Owner feedback and decision

### Resize blocker and retest, 2026-09-16

The owner reported that widening the window left the UI unchanged and cut off, with a screenshot. Reproduced a fixed-width stacked panel overflowing a short viewport. Candidate `week1-resize-20260916` adds a fluid, two-column layout for wide/short windows and preserves button focus during IPC loading. The [revision manifest](../revisions/week1-resize-20260916/manifest.md) records matching before/after evidence, failed focus-test candidates, final browser/native verification, source hashes, and limitations.

Technical retest passed in browser and actual native WebView2 at five viewport sizes. Native viewport changes were automated through CDP, not by dragging the OS border. The owner's development instance was left running; this revision was not rebuilt into a standalone executable during the resize task. The owner subsequently confirmed everything and authorized the next step on 2026-09-16; the resize blocker is closed for this accepted development revision. The reported confirmation does not establish a new standalone build hash or resolve the release-build blocker.

### Earlier feedback and current decision

- Feedback, 2026-09-16: owner reported **"Rust connection verified"** and **"The local Rust runtime responded."** This confirms the successful IPC response in the owner's exercise. Current source hashes match `week1-scaffold-20260916`; the owner did not specify development versus standalone debug launch or an executable hash.
- Decision/date: step 1 accepted on 2026-09-16 against `week1-resize-20260916`, following the owner's "Everything is confirmed" message. Individual additional test details were not supplied.
- Next owner test: the prepared [step-2 synthetic memory command fixture](week1-memory.md), revision `week1-memory-20260916`. Technical checks passed; step-2 owner review remains pending.
- Week-one demo and S0–S4/product milestone acceptance: not granted by these checks.
