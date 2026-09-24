# Native renderer measurements

E1 candidate `e1-20260924-01`, 2026-09-24. These are executed Windows Tauri/WebView2 measurements, **not** a cloud benchmark, GPU timing, user-study result, or owner acceptance.

## Method and environment

- Windows 11; OS reports NVIDIA GeForce RTX 5080, driver `32.0.16.1656`, 2560×1440 display at 143 Hz; Razer Cortex power plan. A StarDesk virtual adapter is present but reports no active mode. Hardware inventory does not prove which GPU executed each draw.
- Actual native WebView2 UA: Edge/Chromium 153.0.0.0. Native DPI 96 / DPR 1. Tested clients: **1440×900** and **2560×1392** (the full 2560×1440 display minus its taskbar work-area exclusion).
- Same W-NYC-01 r1, seed, compact reading/control layer, pinned comparison, shared point distribution, integer cell geometry and tone ordering. The Week 1 eye is included and settled before sampling.
- Per renderer/load/size: 2-second warm-up, then **three separate 30-second runs**. 2,000 points is the ordinary load; 8,000 is an explicitly bounded stress load, run only after ordinary responsiveness passed.
- The development harness forces continuous draws of settled material solely during each sample. Normal settled presentation stops drawing. No capture or generation service runs during sampling. React diagnostics, native scene/status transport and loopback CDP remain active; this is a development build, not an isolated release-performance claim.
- Samples are **rAF callback intervals**, not GPU completion or input-to-photon timings. The runner verifies native presence, visibility, actual renderer, count and at least 29.5 seconds of retained intervals. First startup interval is omitted. Raw samples are retained in the JSON files below.

## Results

Values below are rounded to 0.1 ms. Each row summarizes three runs; all three had the displayed p95 at that precision.

| Native client | Elements | Actual renderer | Runs | p95 frame interval | Maximum run p99 | Frames >50 ms |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| 1440×900 | 2,000 | Canvas 2D | 3 | 7.1 ms | 7.2 ms | 0 |
| 1440×900 | 2,000 | WebGL | 3 | 7.1 ms | 7.2 ms | 0 |
| 1440×900 | 8,000 | Canvas 2D | 3 | 7.1 ms | 7.2 ms | 0 |
| 1440×900 | 8,000 | WebGL | 3 | 7.1 ms | 7.2 ms | 0 |
| 2560×1392 | 2,000 | Canvas 2D | 3 | 7.0 ms | 7.1 ms | 0 |
| 2560×1392 | 2,000 | WebGL | 3 | 7.0 ms | 7.1 ms | 0 |
| 2560×1392 | 8,000 | Canvas 2D | 3 | 7.0 ms | 7.1 ms | 0 |
| 2560×1392 | 8,000 | WebGL | 3 | 7.0 ms | 7.1 ms | 0 |

The original 16.7 ms candidate budget is met in these runs. This display is approximately 143 Hz (about 7 ms per refresh), not 60 Hz. These close distributions do **not** establish that either renderer is faster, nor that callback intervals equal presented frames.

**Decision:** retain **Canvas 2D as the default**, because it is the simpler field path and met the measured budget. Keep the authored WebGL option for comparison/fallback testing. No new renderer stack or GPU/model installation is justified by these observations.

## Local feedback proxy

At native 1440×900/DPR 1, a real OS click established anchor focus, then 30 native WebView2 CDP arrow-key events were measured from key-handler entry to the second rAF opportunity:

- Median **6.8 ms**; p95 **12.0 ms**; p99 **12.0 ms**.
- This is a **main-window rendering-opportunity proxy**, not physical input-to-photon latency or material-settlement duration. It supports a responsive local UI path but does not establish the full physical <100 ms target.

## Raw evidence and limitations

- [1440×900 / 2,000](measurements/frames-1440x900-1dpr-2000.json)
- [1440×900 / 8,000](measurements/frames-1440x900-1dpr-8000.json)
- [2560×1392 / 2,000](measurements/frames-2560x1392-1dpr-2000.json)
- [2560×1392 / 8,000](measurements/frames-2560x1392-1dpr-8000.json)
- [30-event feedback proxy](measurements/feedback-1440x900.json)
- [Failed pre-fix stress readiness attempt](measurements/failed-stress-before-fix.json): no measurements were collected; a native completion/acknowledgement race was corrected before the successful reruns.

Native 150% scaling, multi-monitor relocation, work-area changes, macOS and physical input-to-photon measurement were not exercised. No renderer measurements were taken under image-generation load, since generation is not part of this E1 runtime. Packaged production-CSP launch is a separate functional check, not interchangeable with this instrumented benchmark.
