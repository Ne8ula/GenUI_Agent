# Seed-33 Rust fidelity refinement

2026-10-10. **Candidate 16 implemented and technically verified; visual fidelity remains incomplete.** No accepted implementation baseline. Owner: “Continue from the idle. Resume the remaining workload.” Astra owns implementation/integration; native Opus review is read-only.

[Watch construction + living scene](implementation/after/candidate-16-motion/rust-construction-and-living-24s.mp4) · [Compare original](implementation/after/candidate-16/comparison-original.png) · [Compare fresh reference](implementation/after/candidate-16/comparison-reference.png) · [Compare before](implementation/after/candidate-16/comparison-before.png) · [Gait close-up](implementation/after/candidate-16-motion/gait-closeup-12s.mp4)

**Passed:** 12 Rust tests, 207 app tests, typecheck/build, 47 production-browser checks, compiled-resource/historical-preservation audit, 361/361 recording frames and 127-file post-recording source verification. No native/WebView2 evidence or owner acceptance.

## Scope and gate

Continue the Rust-only fixed-camera reconstruction, correcting the overly uniform architectural grid, weak directional material hierarchy and mannequin-like near figure. Preserve procedural construction, source-image independence, controls, anchored accent corruption and all phase gates. No camera, voice, desktop effects or runtime provider inference.

Before-state: [candidate 14 comparison](../w4-20261009-seed33-rust-rebuild-r1/implementation/after/candidate-14-msaa/comparison.png), [recording](../w4-20261009-seed33-rust-rebuild-r1/implementation/after/candidate-14-motion/rust-construction-and-living-24s.mp4), and [127-file manifest](../w4-20261009-seed33-rust-rebuild-r1/implementation/candidate-14-source.json). All 127 hashes rechecked unchanged before this pass. Source HEAD `e43c7aedb2690c8b9edc3e2446f1d1f584897a5d` plus retained uncommitted Week 4 work; digest `303bf95d2ef8c4a5825fc1c5810852f9513fec38b9a036742dd911403db16062`.

## Generation checkpoint

Two quote-only attempts were denied by auto-mode permissions, including one after explicit quote-only approval. Owner then said “Manual mode is back on, send the request again”. The third quote-only attempt succeeded at 5 Weave credits; owner selected Approve. One Nano Banana 2.1 2K image run submitted: `4cc33779-8550-4b74-9325-80714906da67`, completed. Still inspected before edits. One separately quoted/approved 54-credit six-second Kling run `153d4f1a-0e1b-4479-8c6e-77e8efac237e` completed; full-scene 500ms and figure 200ms samples inspected before edits. Total authorized/reported cost 59 Weave credits; further allowance zero. No automatic reruns.

## Selected guidance and exclusions — before implementation

[Contact sheet](references/contact-sheet.png) · [Still](references/images/img-01-fidelity.png) · [Motion](references/videos/vid-01-living.mp4) · [Gait samples](references/videos/gait-200ms.png) · [Exact inputs/provenance](provenance.json)

- Still: preserve the original fixed camera and object anchors; select bright left jamb relief against deep awning shadow, dark window recesses and sparse right architectural strands, round shoulder/coat envelope and luminous ceramic rims. Reject the crossed/floating foot pose; pixels are never runtime data.
- Motion: select subtle opposing arm movement and continuous cloth/hem lag. Reject rightward travel, floating/crossed-foot impression, slight scene drift and weak accent breakup. Keep the Rust planted-foot constraints and existing left/away path. Inspection used temporal samples, not full-speed playback; audio excluded.
- Before captures copied unchanged into [structure](implementation/before/structure-1800.png) and [formed](implementation/before/formed-12000.png); original source-bound recording remains linked above.

## Implementation contract

Astra alone owns `renderer/src/scene.rs`, `materials.rs`, `gait.rs`, related focused geometry tests and the browser capture driver's failure checks. No parallel writers. Target selective geometry-based jamb highlights and toned-down repeated lines, broadened dark awning mass, smooth continuous coat profiles and shoulder/sleeve joins, more upright rear heading while retaining left/away locomotion, and restrained local foot/hem motion. Do not change broker authority, host typography/layout, tile anchors, scene IDs or control semantics.

Palette remains deep umber `#0E0603`, warm shadow `#2B180A`, bone `#FFDFB6`, pale sky `#FCE3D3`, coral `#CC7557`, ochre `#CC995E`. Existing Space Grotesk / IBM Plex Sans / Mono stays untouched. Composition—not new chrome—is the design focus: left cropped chair and coat figure, bottom table, lower-right cup, central-depth lamps, convergent facades. Reject a uniformly luminous wireframe grid in favor of selective relief surfaces and negative space.

Acceptance checks: same-viewport stage captures and direct original/new-reference comparison; Rust geometry/gait/determinism/budgets; app tests/typecheck/build; production image-denial, controls, resource failures/context restoration; complete construction plus at least ten living seconds with gait/tile samples and source hashes. No claim of exact fidelity or naturalistic gait based solely on tests. Owner acceptance and all later phases remain pending.

## Implemented checkpoints and source ownership

Astra main (configured `claude-gpt-6-astra[1m]`, observed Codex `gpt-6-astra`) changed four authored source files: `renderer/src/scene.rs`, `renderer/src/materials.rs`, `renderer/src/gait.rs`, and `app/scripts/capture-rust.mjs`. Generated WASM was rebuilt; generated JS did not change. Host layout, typography, controls, broker and historical runtime sources were not edited.

- Candidate 15: added true narrow jamb surfaces, reduced repeated cornice/rail/strand brightness, stronger selective left illumination and broader dark awning; smoother folded coat envelope, smaller hood, more away-oriented left/depth heading, low swing-foot clearance and joined sleeve geometry. Captures exposed bulbous mechanical shoulder caps; retained rather than promoted unchanged. [Source](implementation/candidate-15-source.json), [archive](implementation/source-candidate-15.tgz), [captures/checks](implementation/after/candidate-15-retry/checks.json).
- Candidate 16: shoulders moved inward/down, caps reduced and coat shading moved toward rim emphasis instead of uniformly luminous beads; low-clearance bound added to existing gait test. The shoulder silhouette is less mechanical, though still stylized and too dark through the torso relative to the target. [Source](implementation/candidate-16-source.json), [archive](implementation/source-candidate-16.tgz), [source binding](implementation/candidate-16-verification.json).
- Expanded browser failure coverage exercises first/second renderbuffer and framebuffer allocations separately, requiring the specific error and no ready/fallback canvas. The antialiasing check allows actual samples at least the requested four rather than rejecting legal driver promotion; this machine returned exactly four for both attachments.

The native `eva-reviewer` (configured `opus`, observed Anthropic `claude-opus-4-8`) reviewed final **candidate 14** GPU lifecycle, not candidate 16 aesthetics. It confirmed the MSAA fix and found no runtime defect, with the four allocation-test gaps now covered. Main implemented all changes. No other model implemented UI in this pass. Its earlier handback failed under manual mode; the completed report was recovered via SendMessage, not reconstructed or attributed to another reviewer.

## Executed evidence and limits

- `cargo test --manifest-path week4/Cargo.toml -p eva-seed33-renderer`: 12 passed, including geometry limits, determinism, reduced motion and connected gait/low swing clearance.
- `npm --prefix week4/app run check`: typecheck, 207 tests and production build passed. Native/WASM dead-code warnings remain; no build error.
- Production capture: [47 checks](implementation/after/candidate-16/checks.json), actual Rust/WASM requests and nonempty stage pixels with images denied, controls, stepping, reduced stability, resize, reseeding, failures and context restoration. Captures at 1800/5700/9000/12000/22000 ms, 1920×1080 viewport, DPR 1.
- [Resource audit](implementation/candidate-16-resource-audit.json): no compiled image/movie assets or historical scene-image path markers, actual WASM GPU imports, 100 historical baseline files unchanged and only six previously authorized integration differences. `implementation/before-source-manifest.json` is copied unchanged from the original Rust rebuild's pre-integration baseline, not relabeled as candidate 14. Live light targets contain current procedural GPU output only.
- [Recording report](implementation/after/candidate-16-motion/recording.json): 361/361 fixed-time 15 fps frames, 12 seconds construction + 12 seconds living, no page errors or blocked media requests. Separate unstepped browser observation lasted 12.095 seconds. Fixed-time recording is not a real-time performance measurement.
- Main inspected formed frames and original-target comparison, [construction samples](implementation/after/candidate-16-motion/construction-overview-1s.png), [100ms gait samples](implementation/after/candidate-16-motion/gait-samples-100ms.png) and [500ms tile samples](implementation/after/candidate-16-motion/tile-samples-500ms.png). These are temporal samples, not full-speed playback or proof of human-looking gait. [Tile close-up](implementation/after/candidate-16-motion/tile-closeup-12s.mp4).
- [Source digest](implementation/candidate-16-source.json): `c346f676d4091826171d0fbf2b652749c3b2fecab14ebaffd9072e5a0e78e89c`, all 127 files unchanged after captures/recording. Archives omit unchanged historical public images, which remain preserved in place and hashed by manifests.
- Formatting, capture-script syntax and diff whitespace checks passed. Git emitted line-ending warnings, not whitespace failures.

**Retained failed attempt:** [candidate-15 startup report](implementation/after/candidate-15/checks.json) has zero checks and a Vite readiness timeout when launched through Bash. A direct PowerShell Vite startup probe showed the expected `Local:` output; the PowerShell retry passed. The cause of the Bash timeout was not established. A diagnostic initially tried an unhoisted Vite path and received `MODULE_NOT_FOUND`; resolving Vite from the app package correctly found the hoisted dependency. No dependency installation or permission bypass was used.

### Measured resource trade-off

[Performance summary](implementation/after/candidate-16/summary.json): 824 real-time samples over 6.0045 seconds, Chrome on Windows, 1920×933 controls-visible canvas, DPR 1. RAF median/p95 **7.0/7.2 ms**; Rust generation/submission CPU median/p95 **6.9/7.9 ms**. Mean upload **3,728,841 bytes/frame**, WASM memory **31,195,136 bytes**, requested vertex buffers **13,631,488 bytes**, requested light attachments **64,488,960 bytes**. Attachments remain 36 bytes/pixel under the existing maximum.

The fuller cloth and joint geometry costs more than candidate 14 (submit p95 6.5 ms, mean upload about 2.38 MB/frame, WASM 19.20 MB). This is **not a performance improvement**. Measurements are browser CPU/RAF observations, not GPU execution time, physical VRAM, native WebView2 evidence or universal frame-rate guarantees.

## Remaining fidelity work and owner exercise

The directional left/right contrast and rear silhouette improved, but architecture still repeats too regularly; cornice bands and beads remain more schematic than the source. The coat torso is darker and less luminous than the reference; the figure remains a stylized rig, not a naturalistic human. Non-refractive glass, fixed-camera relief geometry and differences in chair/lamp detailing remain. The generated video itself had path/contact defects that were excluded. **This is a further candidate, not a claim that the full visual reconstruction is finished.**

Run `npm --prefix week4/app run dev`, then open `http://127.0.0.1:1440/?fixture=1&look=seed33&seed=33&build=12000`. Compare the 12-second construction and following left/away walk with the linked original target and fresh packet. Exercise pause, stepping, tiles and reduced motion. No server is left running by the capture scripts. Owner feedback/acceptance remains pending; no commit, push, publication or phase advancement.
