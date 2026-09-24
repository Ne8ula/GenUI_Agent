# E1 — procedural particle redesign

## Native build quarantined

**Do not relaunch an older `eva-e1.exe`.** The owner reported system-wide freezing and repeated black screens during the previous Sunny→Rainy transition. Its frame-playback implementation was also rejected as not recreating particles. The cause of the reported graphics failure is **not established**.

Native launch is blocked in both the CLI wrapper and Rust entry point. The hardware-initializing test is ignored in ordinary test runs. No GPU crash reproduction, driver changes, or native relaunch is part of this recovery. See [quarantine notes](quarantine/README.md).

## Current preview

```powershell
npm --prefix experiments/e1 run dev
# Open http://127.0.0.1:1431
```

This builds a small Rust/WASM module and runs an isolated browser preview. It does **not** launch the transparent Windows overlay. Node and Rust are required; the CPU-only `wasm32-unknown-unknown` standard-library target is installed on this workstation. A different workstation needs that target installed explicitly.

Choose **Today in NYC → Tomorrow → Dismiss weather**. Stop also freezes an interrupted return. Controls contains Pin, Less motion, Plain answer and a typed-command fallback. The smaller eye follows browser-local cursor movement. Geometry, focus, pins and preferences persist across day revisions.

### Actual particles, not frames

- `particles/src/lib.rs` owns **8,192 persistent particle slots**: analytic eye/sun/cloud geometry, recycled falling droplets and impact-linked expanding ripple rings. No weather image sampling, video decoding or PNG-sequence playback.
- Rust compiles to `public/particles.wasm` with no host imports. Ordinary updates do not allocate/grow linear memory; checked WASM memory is about 4.4 MB.
- Canvas2D draws the particle buffer, capped at 1280×720 backing pixels and 30 FPS, with slow-frame throttling/stop, hidden-tab suspension and cancellation. No WebGL/WebGPU/native graphics context is requested by the current app.
- The Mock Desktop is one fixed, labelled preview backdrop. Compact protected reading surfaces replace the oversized transparent captions.
- The Weave exports are **design/motion references**, not runtime frames. This is an authored recreation requiring visual review, not a claim of pixel-exact reconstruction.

Browser software-only validation explicitly disables GPU/compositing/WebGL. A normal browser may use its own compositor; the preview is not a diagnosis or guarantee about the workstation's graphics driver.

## Data and voice

W-NYC-02 remains explicit invented NYC data: 2026-10-14 sunny 22 °C; 2026-10-15 rainy 16 °C; America/New_York. The taskbar clock is not the scenario clock. Facts appear before animation completes.

Week 1's ElevenLabs voice ID/profile and fixed native Whisper/ElevenLabs contracts are preserved, but **native voice is unavailable while native launch is quarantined**. No substitute voice is silently used. Browser microphone input is optional, off by default, and discloses the browser speech service before enabling. Typed controls work without microphone/audio. Live microphone/provider tests were not run.

## Checks and limits

```powershell
npm --prefix experiments/e1 run typecheck
npm --prefix experiments/e1 test
npm --prefix experiments/e1 run build
cargo test --manifest-path experiments/e1/particles/Cargo.toml --offline --locked
npm --prefix experiments/e1 run rust:test
```

Do not opt into ignored GPU tests. `scripts/verify-procedural.mjs <fresh-directory>` runs only a software-rendered browser, using an installed Playwright module (`E1_PLAYWRIGHT_MODULE` when external).

[Current evidence and safety review](../../docs/design/revisions/e1-20260924-procedural/README.md). Native stability/desktop interaction and E1 visual acceptance remain pending. Previous extracted assets are retained under `quarantine/weave-derived/`, outside Vite public assets and Tauri resources. Original Weave exports and `week1/` remain unchanged.
