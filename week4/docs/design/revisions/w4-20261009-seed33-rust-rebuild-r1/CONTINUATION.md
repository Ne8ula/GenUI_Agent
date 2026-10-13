# Continuing the incomplete Rust reconstruction

2026-10-10. Owner: “Continue the remaining incomplete.” They reaffirmed Astra implementation/integration ownership; main confirmed that role. This continues the unfinished geometry/material/gait work in the existing bounded full-reconstruction pass, not a new direction or generation allowance. Accepted baseline: none. No commit or phase acceptance.

## Reference gate and before state

Main re-inspected original owner-selected Seed-33 (`../w4-20261008-paris-c-hybrid/references/images/img-13-bwa3c-seed33.png`), the scoped structural still (`references/images/img-02-structure.png`) and generated motion temporal overview (`references/videos/motion-overview-500ms.png`). Exact model/run IDs, approvals and exclusions remain in `provenance.json` and `REVIEW.md`. The original appearance remains the target; only component timing is selected from the motion study. Reject its conventional shading, skeleton persistence, forward gait and camera drift. No new generation; further allowance remains zero.

Before: the source-bound `implementation/after/resume-verification/` stage frames and `implementation/after/resume-motion/` recording/samples, source digest `5b4c42330f4a087cf0111d62214ffcb810b8024d8b55c2716432969e399d7b07`. Candidate 11 and all earlier evidence stay intact.

## Bounded corrections

- Material hierarchy: luminous cream edges and softly varying bead fields rather than equally bright regular grids; calmer tabletop lets glass/ceramic read.
- Architecture: vary authored façade bays, jambs, cornices and sparse strand occupancy locally; retain street, roof, lamp and foreground anchors. No generic low-poly city and no source-image tracing.
- Glass: strengthen actual ashtray rim/fluting and procedural highlights against the table; disclose non-refractive glass approximation.
- Figure: improve rear hood/coat silhouette, tapered connected limbs, foot roll and restrained supporting-side body motion; retain deterministic planted/swinging feet and left/away path. No sprite or pose playback.

Palette stays warm: deep umber `#0E0603`, warm shadow `#2B180A`, bone `#FFDFB6`, pale sky `#FCE3D3`, coral `#CC7557`, ochre `#CC995E` (existing shader family, not sampled pixel arrays). Host Space Grotesk/IBM Plex typography and all controls unchanged. Fixed-camera layout stays large left chair, bottom ellipse table, lower-right cup, lower-left ashtray, mid-left rear figure and central-depth lamps. Boldness remains in the live beaded scene, not additional chrome.

## Ownership and verification

Astra main alone writes `renderer/src/{materials,scene,gait,geometry,lib}.rs`, with `gpu.rs` only if a verified integration issue needs it; evidence, tests, README and docs as required. Native `eva-reviewer` is read-only on GPU/host contracts. No parallel writer. No changes to historical TS renderers, broker authority or Weeks 1–3.

Preserve Rust-owned geometry/materials/construction/GPU submission, no runtime scene imagery, one host clock, bounded resources, reduced-motion invariance and fail-closed behavior. Check actual matching stage captures and detail crops after each correction; retain rejected candidates. Final verification: Rust tests, app check, production image-denial/controls/context lifecycle, measured frame/resource sample, source-bound construction plus >=10 living seconds and gait/tile samples. Visual comparison must name remaining gaps; tests are not visual acceptance.

## Resumed workload — 2026-10-10

Owner: “Continue from the idle. Resume the remaining workload.” Candidate 14 remains the current implementation; this is not acceptance. Main re-inspected the target/candidate comparison: the uniform architectural grid and mannequin-like figure remain substantive visual gaps, not just test gaps. A focused new refinement pass requires a fresh image/video packet before visual edits.

- Source verification: all 127 entries in `implementation/candidate-14-source.json` still match their SHA-256 hashes; no application source was changed during this resumed check.
- Official Weave discovery returned Nano Banana 2.1 (`fal-ai/nano-banana-2/edit`, tool `bebebed5-50c1-4701-98b3-86929db21585`). Existing hosted Seed-33 output was retrieved read-only from run `9472c515-4ab8-4dbd-bc65-3d52e970e167`; no upload was attempted.
- A quote-only request, with `acknowledgedCost` omitted, was denied by Claude Code auto mode as `[Real-World Transactions]`. The owner explicitly selected **“Allow quote only”**. The authorized retry was also denied before execution. No quote, prediction ID, generation, spend or fresh reference packet resulted. No other route was used to bypass the denial.
- Owner then restored manual mode and explicitly requested the quote again. It succeeded; separate structured approvals authorized one 5-credit image and one 54-credit video for the [new fidelity-refinement packet](../w4-20261010-seed33-rust-fidelity-r2/REVIEW.md). The old packet's further allowance remains zero. New run IDs and reference inspection belong to that new packet, not retroactively to this revision.
- Final candidate-14 native `eva-reviewer` review returned: offscreen MSAA fix confirmed, with sound cleanup, resize, feedback prevention and context lifecycle. No runtime defect confirmed. Low-priority renderbuffer/framebuffer failure-coverage gaps and exact sample-count harness strictness were noted. Reviewer inspected recorded evidence, did not execute tests, and grants no aesthetic or owner acceptance. Configured `opus`; observed Anthropic `claude-opus-4-8`. Main remains responsible for integration.

## Internal checkpoints

- Candidate 12: actual ashtray rim/flute geometry and sparse cutout highlights now read against the calmer table. Vessel bead rows follow profile distance rather than crowding tiny lips. Seeded window/bay detail varies locally. Rust 11 tests and 38 browser checks passed; source and captures preserved. Lighting/figure correction continued rather than claiming completion.
- Candidate 13: live-output highlight spread in new `renderer/src/light.rs`, plus tapered connected limbs, a cloth rear hood and restrained shoulder counter-rotation. `gpu.rs` owns bounded render-target allocation/disposal; host only exposes truthful target-byte stats. Rust 12/app 207 tests, typecheck/build and 40 browser checks passed, including denied light-texture allocation and target-byte bounds. Actual screenshot review found that an offscreen single-sample target lost the default framebuffer's antialiasing, sharpening thin diagonal edges. Preserve this candidate and correct the live render-target sampling before finalizing.
- GPU review constraints were checked against source. The first reviewer mistakenly called vertex attribute 3 RGBA and glass material 6; it is material/detail/light/seed, glass=5 and sky=6. Their actual blending/depth warning was valid. Glass now uses opaque luminous cells with holes (discard), not unsorted translucent depth writes. This is an authored, non-refractive approximation. No runtime image texture is introduced; the light target holds only the Rust scene drawn during this frame.

