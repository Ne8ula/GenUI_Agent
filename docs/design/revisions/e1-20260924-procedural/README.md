# E1 procedural recovery

**Candidate; owner acceptance pending. Native rendering is quarantined.** Source: `cb7ac83688c075d2268ff6be06288e47e0467745` plus working-tree changes. Accepted visual baseline: none.

## Incident and containment

The owner reported a system-wide crash/freezing with recurring black screens during the previous native Sunny→Rainy transition and rejected background-extracted frames as a substitute for particle recreation. The attached private desktop screenshot was inspected as diagnostic context, not copied into repository evidence. No E1 process was running when checked at the start of recovery.

Native startup now stops before window/device creation, and `desktop:dev` refuses to invoke Tauri. The debug executable was rebuilt with that guard **without being run**. The hardware-initializing DX12 test is ignored in ordinary test runs. Rejected PNG sequences were preserved under `experiments/e1/quarantine/weave-derived/`, outside Vite public assets and Tauri resources. Original imports and Week 1 remain unchanged. No driver/security changes, native relaunch, GPU benchmark or crash reproduction occurred.

A narrow System-event query found no matching Display-reset event 4101 in its last-12-hour window. That does not disprove the report or identify a cause.

### Read-only code audit, not a proven crash diagnosis

- Tao visibility changes rewrite cached window styles, conflicting with the old renderer's manual DirectComposition/layered-window flags.
- Fatal GPU drawing failure can stop the render thread without hiding stale material; explicit device-loss handling is missing.
- The old channel is unbounded; draining can replace Stop/Clear with a later Scene. There is no joined renderer shutdown before HWND destruction.
- The previous path really was synchronous PNG decode/upload, not particles. No per-frame texture leak was demonstrated. These defects and transfer costs are not proof of the system-wide crash's root cause.

The native path remains disabled rather than being reactivated after another compilation-only check. A future recovery needs a separately reviewed lifecycle, bounded messages, terminal cancellation, joined shutdown, fail-closed device loss and explicit owner authorization for hardware testing.

## Replacement design

- **Actual Rust/WASM simulation:** 8,192 persistent slots: 7,680 body/eye cells, 256 droplet-trail cells and 256 impact-linked ripple cells. Analytic geometry and seeded dither; no sampled reference pixels, weather images, video frames or texture playback.
- Fixed state buffer and no host imports. The module is 66,520 bytes; observed linear memory was **4,390,912 bytes**, stable across tested revisions.
- Canvas2D presentation, capped at 1280×720 backing pixels and 30 FPS. Slow-frame throttling/stopping, hidden-tab suspension, and local cancellation. The app requests no WebGL/WebGPU/native graphics context. Normal browsers may still use their own compositor; this is not a graphics-driver stability guarantee.
- Smaller analytic eye with square pupil and browser-local gaze/tissue response; sun body with horizontal particle threads; two cloud masses with falling droplets and expanding ripple rings. Reference-guided authored recreation, **not a pixel-exact claim**.
- Compact bone/black fact backings replace giant transparent captions. Immediate typed/day controls, Stop, pins, keyboard movement, plain answer, reduced motion and day context are retained. W-NYC-02 remains explicit synthetic data.
- Week 1's native ElevenLabs voice configuration/contracts remain preserved. Native voice is unavailable during quarantine; browser audio is off and no substitute voice is silently used.

## Executed verification

- **139 Vitest tests passed**: existing contracts plus particle-buffer bounds and a launcher-refusal test.
- **10 CPU Rust simulation tests passed**; separate worker formatting/clippy and direct WASM tests passed, including 300 revisions with stable pointer/memory.
- **21 native policy/math tests passed, 1 GPU test intentionally ignored**. Formatting/clippy and frontend typecheck/build passed. Native debug build compiled only; it was not launched.
- **22 software-only browser checks passed**, [full results](software-checks/checks.json). Actual WASM cells change during reveal; droplets/ripples evolve; gaze responds; pins/focus survive; Stop freezes drawing and state, including interrupted return; plain/reduced modes work; memory/raster budgets hold; no weather image/video or provider requests and no graphics contexts beyond Canvas2D.
- Browser flags disable GPU, GPU compositing, accelerated Canvas2D, WebGL and software WebGL rasterization. Viewports 1440×900 and 420×900, DPR 1. No actual desktop was captured. No live microphone, Whisper or ElevenLabs call.

These checks do not establish native recovery, exact visual fidelity, participant outcomes or general performance. The per-frame diagnostic in the browser log is not a performance benchmark.

## Visual evidence

[Interaction recording](particles-preview.mp4) · [eye](software-checks/eye.png) · [reveal](software-checks/reveal.png) · [sunny](software-checks/sunny.png) · [cloud formation](software-checks/forming-clouds.png) · [rain/ripples](software-checks/rainy.png) · [plain answer](software-checks/plain.png) · [returned eye](software-checks/returned-eye.png) · [narrow viewport](software-checks/narrow.png).

Before-state: preserved [withdrawn frame experiment](../e1-20260924-faithful/README.md). It was deliberately **not relaunched** to obtain another before-capture. Original proposed references remain under `experiments/e1/weave/`.

## Changed areas, provenance and next gate

Changes: native launch/test quarantine; rejected assets moved out of runtime; standalone `particles/` Rust crate and WASM build helper; bounded Canvas2D bridge/renderer; reading/controls redesign; Stop during return; focused tests and software-only capture helper; safety/evidence documentation. No commit, push, publication, new creative-service generation or phase acceptance.

Development used the main Astra session and two Astra forks (harness-reported inherited model; one read-only audit, one isolated Rust writer), Ruflo advisory routing, local file/shell tools, Rust/Cargo, Vite/Vitest, installed Playwright and FFmpeg. The Rust WebAssembly standard-library target was added for CPU compilation. Exact per-worker provider route logs were not independently correlated. No lower-tier worker was substituted.

When the workstation is stable, review the recording first or run **`npm --prefix experiments/e1 run dev`**, then Today → Tomorrow → Stop/Dismiss. Do **not** use `desktop:dev`, old executables or ignored GPU tests. Owner visual decision: **pending**. Native desktop/voice restoration is a separate blocked gate, not a completed deliverable.
