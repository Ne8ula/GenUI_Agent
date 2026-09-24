# E1 procedural particle ABI

This standalone crate is a CPU-only, fixed-storage simulation. It does not link Tauri/wgpu, create a window, read images/video, call a provider, or access OS input. Its output is developer-authored particle state, not sampled pixels.

Build from the repository root with `node experiments/e1/scripts/build-particles.mjs`. The Rust `wasm32-unknown-unknown` target must already exist. CPU tests: `cargo test --manifest-path experiments/e1/particles/Cargo.toml --offline --locked`. The crate has no third-party dependencies.

## Browser ABI

`WebAssembly.instantiate(bytes, {})` exposes:

- `memory`: `WebAssembly.Memory`.
- `init(seed: u32)`: initialize deterministic formations and state. Call once per instance, not per frame.
- `set_target(mode: u32, generation: u32, reduced: u32) -> u32`: modes `0 = eye`, `1 = sun`, `2 = rain`; returns 1 accepted, 0 invalid/stale. Equal-generation requests are accepted only if identical. Use a newer generation when changing mode or reduced motion.
- `step(time_ms: f64, width: f32, height: f32, center_x: f32, center_y: f32, gaze_x: f32, gaze_y: f32, paused: u32)`: advances/clamps simulation; center is normalized viewport space, default `.5,.38`; gaze is normalized `[-1,1]` browser-local pointer offset. `paused != 0` retains exact visible records. First call must use `paused = 0` to produce initial output; `reduced = 1` produces static endpoints without animation.
- `positions_ptr()`: byte offset into memory, read after `init`.
- `particle_count()`: exactly 8,192 fixed slots.
- `stride()`: 8 floats per slot.
- `transition_active()`: 1 while an authored transition is active, otherwise 0. A settled rainy state can still animate droplets; it is not a recommendation to run an unlimited browser loop.

Each `Float32Array` row is `[x_px, y_px, size_px, red, green, blue, alpha, kind]`. Color channels and alpha are in `[0,1]`. `kind` is 0 for body/eye, 1 for droplets, 2 for ripples. IDs are fixed row indices. Skip alpha-zero cells, paint squares centered at x/y, and respect the parent renderer's independent frame/work/pause budgets.

Ordinary `step` and `set_target` calls do not allocate or grow memory. Re-read the typed view if an instance is reinitialized. Width/height are finite-clamped to 64–4096; output coordinates and sizes are bounded. A time jump contributes at most 100 ms, preventing a hidden tab from simulating an unbounded backlog.

## Authored behavior and limits

There are 7,680 body cells, 256 recycled droplet trail cells and 256 ripple cells. The eye adapts the original Week 1 lid/iris/square-pupil equations, using precomputed skin/lid samples rather than an expensive full-frame shader. Its 320×150 reference-space size is approximately 60% of the earlier eye, centered at `(544,290)` in a contained 1088×608 frame. Gaze and tissue use the original 40/145 ms smoothing constants; blink uses the 90/125/300 ms envelope. No GPU context is needed.

Sun: dense asymmetric dithered core, deterministic horizontal cell threads and boundary fragments. Rain: two scalloped masses with diagonal square-cell hatching, distinct falling streams, and impact-timed expanding ellipse rings. These are newly authored geometry/kinematics guided by the references, **not an exact reverse-engineering of the generated pixels**. Validation of visual similarity belongs to the integrated preview and owner review.

Canonical transitions are 6.042 seconds for reveal/revision and 10.042 seconds for return; a return interrupting an unfinished transition is bounded to 0.9 seconds. Reduced motion applies endpoints immediately, with static illustrated drops/rings. Pausing freezes records without catch-up. On leaving rain, existing cycles finish/fade but no new cycle wraps in. Rain/ripples are qualitative illustrations, not measured precipitation rates.

Verification performed: ten CPU Rust tests, clippy `-D warnings`, formatting, and actual Node WebAssembly instantiation. A 300-revision WASM check retained a stable buffer pointer and 4,390,912-byte linear memory, with finite output. This is a bounded-memory check, not a frame-rate/GPU stability benchmark. Native GPU execution and real microphone/provider calls were not performed.
