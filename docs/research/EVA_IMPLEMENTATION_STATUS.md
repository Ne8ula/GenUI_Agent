# EVA implementation and evidence status

**Audit date:** 2026-10-15. **Scope:** Read-only source/document inspection for Dreamatorium Track C alignment. No application, reconstruction, voice, native, or participant tests were run for this audit. Active Week 4 work may change after this snapshot.

EVA is Dreamatorium's agent. GenUI_Agent's current research scope combines genuine 3D reconstruction (Dreamatorium System B) and expressive rendering/spatial experience (System C), corresponding to flowchart Steps 6–7 and the HCI paper. Steps 1–5 and the separate model/geometric-learning paper belong to Shado. The existing code supplies useful foundations; this scope decision does not establish that the combined pipeline is implemented or that upstream gains have produced human benefits.

## Evidence vocabulary

- **Implemented:** Relevant code exists and was inspected; this alone does not establish correct current runtime behavior.
- **Recorded validation:** A dated project artifact reports checks or observations; those checks were not rerun in this audit.
- **In progress:** Partial or concurrently edited work without verified complete integration.
- **Proposed/unverified:** A plan or contract without sufficient implementation/runtime evidence for the claim.
- **Accepted:** An explicit owner decision limited to the named revision and scope. It is not participant evidence.

## Capability matrix

| Capability | Source and retained evidence | Status and claim boundary |
| --- | --- | --- |
| Week 1 desktop, synthetic weather, and voice foundation | [Archive](../../week1/README.md), [voice server](../../week1/apps/desktop/voice-server.ts), [Rust voice code](../../week1/apps/desktop/src-tauri/src/voice.rs), [outcome](../../week1/docs/design/acceptance/week1-outcome.md) | Implemented historical foundation. Owner reported a successful demo on 2026-09-17; exact demonstrated binary is not identified by that statement. No general composition, live weather, or research-result claim. |
| Week 2 weather/particle experiment | [Archive](../../week2/README.md), [E1 acceptance record](../../week2/docs/design/acceptance/e1.md) | Implemented browser experiment with synthetic inputs and controls. E1 remains pending. Prior native candidate was withdrawn/quarantined following freeze/black-screen reports; browser evidence does not establish native recovery. |
| Week 3 expressive eye | [Grammar](../../week3/src/visual/grammar.ts), [eye renderer](../../week3/src/visual/render.ts), [native overlay adapter](../../week3/src/overlay/native.ts), [acceptance record](../../week3/docs/design/acceptance/w3-conversational-eye.md) | Implemented visual vocabulary and overlay path with recorded browser/native evidence. Visual appearance approved 2026-10-01 at 83bb46a p2-a2; full live conversational acceptance is distinct and pending. No participant finding about emotion or attention. |
| Week 3 voice integration | [Conversation code](../../week3/src/voice/conversation.ts), [playback](../../week3/src/voice/playback.ts), [same acceptance record](../../week3/docs/design/acceptance/w3-conversational-eye.md) | Provider path exists; a synthetic-input native turn and cancellation are recorded. Physical microphone/speaker echo, real interruption, and acoustic behavior remain separate unverified checks. Historical paid-run allowances are not new authorization. |
| Week 4 core and broker contracts | [Core scene](../../week4/core/scene.ts), [director](../../week4/core/director.ts), [unsupported native adapter](../../week4/broker/src/unsupported.rs), [dated cloud report](../../week4/CLOUD_REPORT.md) | Pure core and mock-backed policy contracts implemented, with dated test records. Native staging/camera/recovery integration remains unverified. The old cloud report's global absence-of-visual-host statement is stale; use it only for its dated core evidence. |
| Historical Rust scene | [Renderer documentation](../../week4/renderer/README.md), [host](../../week4/app/src/RustApp.tsx), [R5 record](../../week4/docs/design/revisions/w4-20261012-seed33-rust-fidelity-r5/REVIEW.md) | Implemented procedural geometry/material study with recorded browser checks. Authored geometry and reconstruction-inspired construction are not multiview reconstruction. Subsequent visual direction superseded this composition; no native WebView2 or final fidelity claim follows. |
| Archival photo overlays | [SourceWindows](../../week4/app/src/host/SourceWindows.tsx), [CSS](../../week4/app/src/host/SourceWindows.css), [host](../../week4/app/src/RustApp.tsx) | Authored browser DOM cascade for the R8 route. Three retained photo assets/credits; pointer-events disabled and aria-hidden. Not native OS windows, interactive provenance inspection, live retrieval, or proof that generated scene objects derive from those archival sources. |
| R11 hybrid Paris | [Hybrid host](../../week4/app/src/hybrid/HybridApp.tsx), [renderer](../../week4/app/src/hybrid/renderer.ts), [review](../../week4/docs/design/revisions/w4-20261015-paris-hybrid-r11/REVIEW.md) | Implemented static source-derived GPU baseline with recorded browser validation. No independent people animation, genuine scene recovery, native integration, or final acceptance. Retain its explicitly permitted Three.js/image-derived approach as labelled history. |
| R12 scan-inspired Paris | [Scan host](../../week4/app/src/scan/ScanApp.tsx), [renderer](../../week4/app/src/scan/renderer.ts), [review](../../week4/docs/design/revisions/w4-20261015-paris-scan-r12/REVIEW.md) | Implemented QHD browser proof using source-derived point/Gaussian-shaped sprite records and shallow authored depth. Browser and color-preservation checks recorded. Owner's “keep ... for now” is provisional. Not trained Gaussian Splatting, SLAM, LiDAR, or unseen-geometry reconstruction. |
| R13 eye-to-Paris arrival | [Arrival source directory](../../week4/app/src/arrival/), [brief](../../week4/docs/design/revisions/w4-20261015-eye-paris-construction-r13/BRIEF.md), [review](../../week4/docs/design/revisions/w4-20261015-eye-paris-construction-r13/REVIEW.md) | Concurrent implementation in progress at inspection; complete route/integration, performance, and acceptance were not established. The intended fixed endpoint and authored timeline are not runtime scene generation or validated reconstruction. Refresh this row against new evidence before reporting it complete. |

## New Track C work still proposed

1. A verified multiview camera-recovery and reconstruction pipeline, with per-scene optimization and exported cameras/scene attributes.
2. Controlled/captured/generated input cohorts, independent held-out views, geometric diagnostics, and complete failure denominators.
3. An EVA import adapter for a genuine reconstruction, with explicit coordinates, units, provenance, and supported navigation range.
4. Geometry-anchored structural contours and expressive layers evaluated over viewpoints.
5. Raw/stylized comparison and interactive source/representation/unknown-region inspection in the integrated encounter.
6. Held-out scene-family transfer without hidden per-scene reconstruction or shader authoring.
7. Approved participant studies and actual evidence for C-H1–C-H6 as defined in the [Track C plan](EVA_RESEARCH_IMPLEMENTATION_PLAN.md), including a versioned Shado handoff and matched upstream-to-human comparison for C-H6.

No verified end-to-end reconstruction pipeline or participant results were located in the bounded inspected sources. This is an evidence statement, not a claim that every historical file has been exhaustively inspected. Existing planning references to reconstruction and Gaussian-shaped graphics are insufficient to change that status.

## Preservation and future updates

Keep Week 1–3, superseded candidates, and current uncommitted work intact. Refresh status against actual code and dated run records; do not upgrade a capability because a new plan names it. Keep raw reconstruction, artistic transformations, native integration, source authority, and human interpretation as separate evidence categories.
