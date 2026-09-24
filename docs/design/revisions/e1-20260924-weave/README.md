# E1 Weave approximation

**Superseded after owner critique; not accepted.** Source was `cb7ac83688c075d2268ff6be06288e47e0467745` plus the initial working-tree redesign.

This packet preserves the before-state, imported-video contact sheets, initial procedural candidates and browser recordings/checks. The owner reported that the sun/rain and motion were very far from the Weave exports and required the actual original cursor behavior and a faithful Rust GPU recreation. Passing behavior checks did not establish visual fidelity.

The [replacement candidate](../e1-20260924-faithful/README.md) uses source-derived artwork and full frame sequences, a Rust/wgpu native material layer, and the subsequent smaller-eye refinement. E1 owner acceptance remains pending.

`browser-01` through `browser-03` retain failed pixel-comparison attempts; `browser-04` and `browser-final` passed the approximation's browser behavior checks. Those results are not acceptance or verification of the materially different Rust GPU candidate. Original keyframe/MP4 imports remain unchanged in `experiments/e1/weave/`.
