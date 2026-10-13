# Seed-33 Rust fidelity R4

**Status: candidate18 implemented and technically verified; architectural/gait fidelity remains incomplete. Owner acceptance: pending. Accepted baseline: none.** Main Astra authored all changes; helpers were read-only. No commit or phase advancement.

## Review candidate18

- [Reference / candidate17 / candidate18 comparison](implementation/after/comparison-reference-before-after.png)
- [24-second construction and living clip](implementation/after/candidate-18-motion/rust-construction-and-living-24s.mp4) — 361/361 stepped frames; not a performance measurement.
- [Unstepped browser recording](implementation/after/candidate-18-motion/realtime/4160c30a74e032b5612543a06f2be55d.webm) — 12-second observation after ready, with navigation/startup in the recording.
- [Gait samples at 100ms](implementation/after/candidate-18-motion/gait-samples-100ms.png), [construction overview at 1s](implementation/after/candidate-18-motion/construction-overview-1s.png).
- [Exact checks and measurements](implementation/candidate-18-checkpoint.json), [127-file source manifest](implementation/candidate-18-source.json), [source diff against candidate17](implementation/source-changes.patch).

Changes: grouped unequal façade bays, building-specific story/cornice levels and taller shopfront openings; directional surface-normal lighting; pelvis/shoulder counterrotation, lower quintic foot swing and softer shoulder silhouette; two-row surface sampling that preserves vertex/normal/order while avoiding duplicate evaluations. Fixed camera, anchors, controls, procedural-only runtime and construction stages remain.

**Passed:** 18 Rust tests, 207 app tests, typecheck/WASM/production build, 47 browser checks, full recording, and three additional timing samples. Final audit verified all127 source hashes unchanged,22 local links and52 media hashes; JSON, Rust formatting, measurement-driver syntax and git whitespace checks passed. The first local-link audit failed on Windows' default text codec (`UnicodeDecodeError`); explicit UTF-8 fixed the audit, with no application change. Native Opus source-only review found no confirmed correctness defects in surface reuse, façade openings/IDs or gait reach/continuity; it did not execute tests or judge aesthetics. Main and reviewer routes observed in session-linked Gateway metadata: Codex `gpt-6-astra`, Anthropic `claude-opus-4-8`. Terra-configured recovery was read-only.

## Measured resources, not a speed guarantee

Six-second Windows Chrome samples at matching 1920×1080 viewport/DPR1, controls visible (render targets 64,488,960 bytes). Values are RAF intervals and Rust generation/submission CPU wall time, **not GPU duration or native/WebView2 measurements**.

| Observation | RAF median / p95 ms | CPU-submit median / p95 ms | Max WASM bytes |
| --- | --- | --- | --- |
| Candidate17 historical R3 | 7.0 / 13.8 | 6.2 / 12.1 | 32,768,000 |
| Candidate17 fresh before | 13.9 / 48.6 | 15.3 / 47.6 | 32,768,000 |
| Candidate18 initial after | 7.0 / 7.1 | 3.7 / 6.7 | 32,571,392 |
| Candidate18 repeat 1 | 7.0 / 7.1 | 5.6 / 6.8 | 32,571,392 |
| Candidate18 repeat 2 | 7.0 / 7.1 | 3.9 / 6.8 | 32,571,392 |
| Candidate18 repeat 3 | 6.9 / 7.0 | 3.6 / 4.2 | 32,571,392 |

[All repeat samples](implementation/after/candidate-18-performance-repeat.json), [portable repeat harness](implementation/measure-repeat.mjs). Run from repository root: `node <revision>/implementation/measure-repeat.mjs <new-absolute-report.json>`. Baseline variability was large and was not controlled. These observations support a lower measured CPU cost in this pass, **not a causal speedup ratio or guaranteed frame rate**.

Settled uploads remain approximately **2.49 MB/frame**; requested vertex storage remains **12,058,624 bytes**. WASM falls by **196,608 bytes** relative to candidate17, but remains above candidate16's historical 31,195,136 bytes. Final full-construction recording allocations: WASM 33,423,360 bytes, requested vertex buffers 19,922,944 bytes, targets 74,649,600 bytes at 1920×1080 with capture controls hidden. Construction and settled memory scenarios are different; do not merge them. The earlier R3 upload-versus-timing regression remains recorded, not rewritten as a success.

## References and current before-state

- [Contact sheet](references/contact-sheet.png)
- **Selected for architecture/cloth only:** [fresh image](references/images/img-01-architecture-gait.png). Crossed feet are **rejected**, not reproduced.
- **Selected for support/heel/hem timing only:** [fresh 6-second isolated walking study](references/videos/vid-01-grounded-gait.mp4), [30 samples at 200ms](references/videos/gait-samples-200ms.png). Its photographic style, initial turn/lateral travel, clipped head and background are rejected as scene guidance.
- [Actual candidate17 formed before-state](implementation/before/candidate-17-recheck/formed-12000.png), [wireframe](implementation/before/candidate-17-recheck/structure-1800.png), [baseline checks/performance](implementation/before/candidate-17-recheck/checks.json).
- [Exact run inputs, approvals, inspection and source binding](provenance.json).

59 Weave workspace credits approved in two separate structured confirmations (5 still + 54 motion), spent once per run; further allowance **zero**. No private/local upload. The still used the already hosted original Seed-33 output; motion was text-only to avoid propagating the still's crossed-foot pose. These are development references, never runtime plates or clips.

## Bounded implementation contract

Source: `e43c7ae` plus existing uncommitted Week 4 work. All 127 candidate17 source hashes matched before rebuilding/capturing; [manifest](implementation/before-source.json). Prior candidate and its evidence remain intact.

1. Break the 13-identical-bay rhythm into coherent building groups with unequal bay widths, story boundaries, shopfront proportions and cornice segments. Retain true wall openings, returns, stable existing IDs and fixed camera/anchors. Use the new still's light hierarchy rather than adding uniform bright outlines.
2. Preserve planted world-space foot contact and two uncrossed paths. Relate pelvis/shoulder/arm phase to actual support; use small heel lift, low swing clearance and delayed hem response. Keep the rear-facing left/away route. The reference's late rear-view sequence informs movement qualities, not pose extraction or a claim of anatomical realism.
3. Keep the coat luminous but vary cloth folds and rounded shoulder transitions. Do not change furniture, tiles, UI controls or introduce reference-image runtime data.
4. Reduce duplicate parametric surface evaluation without changing its sampled vertices/normals/order. Verify equivalence rather than claiming speed from fewer operations alone; compare actual matching browser timing/memory samples after the pass.

Owned source: `renderer/src/{scene,materials,gait,geometry,lib}.rs`. Generated WASM follows the existing build. Evidence/docs only elsewhere under Week 4.

## Acceptance criteria and limits

Run Rust tests, app checks/build, matched 1920×1080 DPR1 captures including construction, reduced motion/context recovery/failure fixtures, a live recording with gait samples, and the same six-second RAF/CPU/memory observation. Compare source hashes and report any failed checks. No GPU or native/WebView2 timing claim from browser CPU/RAF samples.

Image inspected at full resolution via Read; video inspected as actual 200ms temporal samples. Implemented formed/wireframe captures, 100ms gait samples and 1s construction overview were inspected. Full-speed playback and anatomical validation are **not** claimed.

## Remaining limitations and next owner exercise

Façades are less uniform but still schematic, especially broad planar massing and sparse shopfront/roof detail. The figure remains a stylized procedural body: uniform cloth cells, restrained analytical gait, no physical cloth simulation or ground-contact shadow. Ground contact is numerically tested but the dark pavement makes it less visually obvious than in the isolated reference. Glass remains a sparse highlight approximation. No exact Seed-33 recreation, native integration or phase completion is claimed.

Start `npm --prefix week4/app run dev`, then open `http://127.0.0.1:1440/?fixture=1&look=seed33&seed=33&build=12000`. Compare the 12-second construction and following gait to the linked clip and references. Check façade light/depth, luminous rear coat, left/away stepping, pause/reduced motion and tile toggles. **Owner decision on candidate18 is pending.** Tests and generated references do not supply it; no subsequent phase was started.
