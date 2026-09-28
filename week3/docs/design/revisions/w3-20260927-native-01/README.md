# Native boundary smoke

Revision `w3-20260927-native-01`, 2026-09-27; Week 3 accepted baseline **none**. This is native-host evidence, not an accepted visual revision or a live speech demonstration.

## Executed

Windows 11 / WebView2 Chromium 153.0.0.0, native client area 1180×780 in the captured screenshot. Display device scale and GPU/driver were not separately recorded. The window requests software rendering with `--disable-gpu`; no archived wgpu renderer was resumed. Canvas 2D uses the initial visual candidate, subsequently sent for refinement.

Launched the real app with a temporary configuration skipping the already-running Vite process, a reused Cargo dependency cache, spending explicitly zero, and a loopback-only debugging port:

```powershell
$env:CARGO_TARGET_DIR = (Resolve-Path '.claude/worktrees/agent-ab4fe3dcd92428a39/week3/src-tauri/target').Path
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=1432 --disable-gpu'
$env:EVA_W3_MAX_TURNS = '0'
# native-check.json contained only {"build":{"beforeDevCommand":""}}.
npm.cmd --prefix week3 run desktop -- --no-watch --config '<session scratchpad>/native-check.json'
npm.cmd --prefix week3 run native:smoke
```

The normal owner launch is in [README.md](../../../../README.md) and needs neither debugging flags nor the temporary build cache.

- Native Tauri build and actual window launch succeeded.
- Actual `w3_status` Rust IPC returned `ready:false`, missing voice ID and positive allowance, remaining turns 0, and the pinned provider IDs. [Full nonsecret results](checks.json).
- Actual `w3_start` failed closed with `w3_not_ready`; no provider operation occurred.
- Clicked Captions and Reduced motion in the native WebView. [Screenshot](native-start.png) inspected by the main session.
- Separately loaded `/microphone-worklet.js` through `AudioContext.audioWorklet.addModule()` inside the native WebView and closed the context: `NATIVE_WORKLET_LOAD_OK_NO_MIC`. No microphone was requested. This did not reproduce the reviewer's possible development-CSP worklet blocker. A packaged-origin microphone run remains untested.

## Provenance and limits

Main: Gateway-observed `codex/gpt-6-astra`, PowerShell, Node, Tauri CLI and Playwright CDP. Backend: native `eva-implementer`, observed `codex/gpt-5.6-sol`; independent static review: observed `anthropic/claude-opus-4-8`. All calls used ordinary permissions. No commit, deployment, microphone audio, private dialogue or billable generation.

Source base `53203fa`, concurrent checkpoint `fc33b6b`, with uncommitted Week 3 changes. Backend source was the first integrated worker rendition (23 Rust tests), before later review hardening. The screenshot is not a before/after comparison at browser-fixture DPI. It proves rendering and controls in the native host, not physical microphone capture, playback, barge-in, voice quality, performance under generation, or provider entitlement. Neither the short worklet check nor a fake browser device establishes real echo cancellation.

Owner feedback and decision: **pending**. Retest the hardened backend and revised visuals, then exercise the genuine microphone/ElevenLabs scenario after approved voice setup.
