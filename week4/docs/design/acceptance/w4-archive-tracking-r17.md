# R17 archival tracking acceptance

Status: **pending owner exercise and decision**. This bounded visual refinement does not accept any step in [the main Week 4 record](w4-visual-steps.md) or a research phase.

## Scope / source

Source `565b5ad6c4b62cf903cf903288941ce8f95850ff` plus the uncommitted files bound by the [R17 manifest](../revisions/w4-20261015-archive-tracking-r17/implementation/source-manifest.json). Accepted baseline: none. Owner requested distinct loading photographs, fast switching, supplied-example tracking overlays and occasional historical-photo reference insets. Explicit one-pass supplied-reference exception recovered from the prior conversation. No new generation spend.

## Reproducible owner exercise

Build: `npm --prefix week4/app run build`.
Run: `npm --prefix week4/app run preview -- --port 1467`.
URL: `http://127.0.0.1:1467/?scene=paris-arrival`.

Submit the default prompt. Expect seven distinct photographs with quick focus/source changes, followed by the existing construction. In settled Paris, expect object-bound label frames and rotating photographic context insets. Focus/open one to inspect local attribution; Escape pauses; type `resume`, `photos`, `skip` or `return`. Test a narrow window and OS reduced motion.

## Evidence / actual results

[Review entry point and visual evidence](../revisions/w4-20261015-archive-tracking-r17/REVIEW.md). Final 260 app tests, typecheck/build and 69 browser checks passed. QHD/narrow captures, 41.32s full sequence and 12.56s idle recording retained. Initial stale R15 baseline assertion failed; corrected to the same frameless arrival fixture and passed, with failed evidence preserved. R16 scene/ground/data/renderer hashes unchanged. No current runtime blocker reproduced.

Limitations: authored boxes, not detection; archival context, not exact object matches; source-derived 2.5D scene, not genuine reconstruction. Sampled video inspection, not continuous playback certification. Chrome browser evidence only; no native WebView2 or performance result. Detailed model/tool provenance in the implementation handoff.

Owner feedback on this tested revision: **not yet received**.
Owner decision/date: **pending**.
No commit, push, publication or phase advancement.
