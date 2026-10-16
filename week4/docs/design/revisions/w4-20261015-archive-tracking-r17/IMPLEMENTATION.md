# R17 recovery and verification

## Scope and recovery

Source HEAD `565b5ad6c4b62cf903cf903288941ce8f95850ff` plus uncommitted owner work. Accepted baseline: none. This resumes the latest request in the FOUR_LAYER_IMPLEMENTATION conversation, not its superseded R8 Rust-only specification. The owner subsequently selected the source-derived GPU composition and requested archival discovery, frameless ground, then these tracking overlays. Those later decisions remain controlling.

Recovered the structured **Use supplied references (Recommended)** answer for this pass from the prior session (2026-10-16 02:04 UTC). Inspected R17's actual contact sheet, window-switching temporal samples and before captures. No generation or spending occurred. Source records retain their original R17 date-based directory name.

The interrupted session had already implemented seven-photo discovery and prepared isolated UI-worker output. Recovery integrated its four owned overlay files, connected the real catalogue and inspection pause callback, fixed title-tab foreground/background contrast and sub-12px text, moved photo insets beside the left-hand objects to shorten connectors, and checked responsive text/links. R16's ground, scene data, projection, colors and animation source hashes remain unchanged.

## Changed files

Recovered prior-session work: `arrival/archive.ts`, `discovery.ts`, `PhotoDiscovery.tsx`, `tests/discovery.test.ts`, production source allowlist in `vite.config.ts`, R17 archival files and credit records.

Integrated/refined in this session: `arrival/ArrivalApp.tsx`, `ItemOverlays.tsx`, `item-overlays.ts`, `item-overlays.css`, `tests/item-overlays.test.ts`; updated `scripts/capture-discovery.mjs` and added `scripts/capture-tracking.mjs`; this packet, design index and scoped acceptance record. No renderer, ground, root research files or Weeks 1–3 edits.

## Result

- Seven genuinely distinct local photographs, with a different window emphasized about every 0.65s and deterministic source-assignment swaps every 1.3s. Unavailable sources produce fewer windows, not duplicated photos.
- Four fixed object-bound rectangles with compact title tabs and brief descriptions. Coordinates are authored source-region bounds, **not machine detection**.
- Up to two rotating archival-context insets on desktop, one on narrow/reduced-motion views. References hold for 4.5s. They link to the local creator/date/licence record and explicitly disclaim exact identity/location matches.
- Escape, inspection focus and pause freeze the shared clock. Return removes every overlay; reduced motion holds a static arrangement. No extra dashboard buttons.

## Executed checks

| Check | Result |
| --- | --- |
| `npm --prefix week4/app run check` | Typecheck, app tests, Rust/WASM prebuild and production build passed. Existing three Rust unused-code warnings retained. |
| `npm --prefix week4/app test` after final test additions | **260/260 passed**. |
| `capture-discovery.mjs … http://127.0.0.1:1467 --record` | **30/30 passed**, [report](implementation/after/integration-02/checks.json). |
| `capture-tracking.mjs … http://127.0.0.1:1467` | **39/39 passed**, [report](implementation/after/responsive-01/checks.json). |
| Video probe/full decode | Both runtime recordings decoded without errors: full sequence 41.32s and idle rotation 12.56s. QHD 2560×1440, DPR 1, Chrome driven by Playwright; full recording VP8 at 25fps. |
| Preservation | R16 manifest comparison: only the ten expected catalogue/discovery/overlay/integration/test/build-allowlist files changed among its 34 entries. Scene data, ground, construction, eye, renderer and original R15 archives match. |
| Whitespace | `git diff --check` passed, with existing line-ending notices. |

Tests cover seven unique simultaneous sources, rapid emphasis changes, backward seek, replay, inspection credit links, partial/total/late image failure, loading timeout, return/reset, construction handoff, GPU loss/retry, reduced motion, shared-clock cancellation and responsive annotation text/hit targets at QHD, 1024×700 and 390×844. Runtime network checks allow only local archival images, no video/external requests.

The first browser run stopped on the old R15 assertion comparing the arrival canvas against `paris-scan`, which does not include R16's added ground. Its [failed report/captures](implementation/after/integration-01/checks.json) are preserved. The corrected test compares the same frameless arrival fixture before/after replay; it is not falsely described as a pixel comparison to the older scan scene. The scene preservation claim additionally uses the unchanged R16 source/data hashes.

## Visual inspection and limitations

Inspected QHD settled frames, seven-photo discovery, narrow-screen layout, [discovery temporal samples](implementation/after/integration-02/discovery-temporal.png) and [idle temporal samples](implementation/after/idle-01/idle-temporal.png). The latter has five decoded samples and one unused tile. These show changing photo prominence and inset selection while retaining the scene and four bound objects. Temporal sampling is not full-speed playback certification. The source motion reference likewise was sampled rather than continuously played.

The style now uses the requested thin object frames, label tabs and linked photographic context rather than detached cards. Context photos are deliberately not alleged to depict the exact generated café or furniture. On phones the scene remains small under the preserved contain-fit projection; one annotation is shown at a time. The illustrative 2.5D image-derived scene is unchanged, not newly reconstructed 3D, trained 3DGS, SLAM or LiDAR. No native Windows/WebView2 test or new performance benchmark. Rust unit tests were not rerun for this host-only pass.

## Actual model/tool provenance

Main integration: configured Astra `claude-gpt-6-astra[1m]`; current-session gateway metadata confirms Codex `gpt-6-astra`. Read-only native `eva-researcher`: configured Terra, current-session metadata includes Codex `gpt-5.6-terra`. Recovered isolated `eva-ui-designer` output: configured Sonnet; prior-session metadata includes Anthropic `claude-sonnet-5`, without worker-ID-level correlation. No new UI writer or independent reviewer was launched in recovery. Ruflo `hooks_route` was advisory only. Tools: Read/Glob/Grep, Edit/Write, PowerShell/Bash, existing Playwright/Chrome, FFmpeg/FFprobe. No model's self-identification is used as transport proof.

## Owner retest

Running preview: `http://127.0.0.1:1467/?scene=paris-arrival`.

To relaunch: `npm --prefix week4/app run preview -- --port 1467` after `npm --prefix week4/app run build`.

1. Submit the default Paris prompt; inspect distinct photographs and quick prominence changes.
2. Let construction settle; watch the context insets change alongside the fixed item bounds.
3. Focus/click a reference for credits; Escape pauses. Type `resume`, `photos`, `skip` or `return` to exercise the existing local controls.
4. Review the recordings and decide whether the tracking/inset appearance matches the supplied direction.

**Owner decision pending.** No commits, push, publication, new generation or phase advancement.
