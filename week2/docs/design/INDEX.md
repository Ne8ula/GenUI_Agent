# Week 2 design evidence (E1)

Start with the [Week 2 summary](../../README.md). Experiment scope: [E1 — a weather response that yields and recomposes](experiments/E1_REVISABLE_WEATHER.md). The finished E1 candidate's owner decision remains [pending](acceptance/e1.md).

Revisions in the order they happened:

| Revision | Actual evidence and status |
| --- | --- |
| [e1-20260917-01 authoring](revisions/e1-20260917-01/authoring/brief.md) | Higgsfield still concepts; not executable or accepted visual evidence |
| [e1-20260923-01 assembled before-state](revisions/e1-20260923-01/README.md) | Integrated boxed UI, browser and actual Tauri/WebView2 stills; owner requested less text and a true transparent desktop presentation; superseded, not accepted |
| [e1-20260923-02 desktop-overlay refinement](revisions/e1-20260923-02/REFINEMENT.md) | The direction change away from "an application inside a box", plus the last browser-only check pass |
| [e1-20260924-01 transparent response and eye](revisions/e1-20260924-01/README.md) | Actual Windows two-layer overlay, physical input pass-through checks, restored Week 1 eye, native captures/recording and bounded renderer measurements; superseded |
| [Week 1 eye / K0-Desktop reference](revisions/e1-20260924-week1-eye-reference/README.md) | Unchanged-renderer browser eye captures and cursor-tracking recording; non-generative eye composite over the owner's Mock Desktop for the [Weave node guide](experiments/E1_VOICE_WEAVE_BRIEF.md). Reference only |
| [e1-20260924-weave approximation](revisions/e1-20260924-weave/README.md) | Final approximation browser checks; owner rejected the approximate shapes/timing and asked for a faithful source recreation |
| [e1-20260924-faithful frame experiment](revisions/e1-20260924-faithful/README.md) | Withdrawn/quarantined: owner rejected extracted frames and reported a system-wide graphics failure during a transition; historical evidence, not proof of stability |
| [e1-20260924-procedural recovery](revisions/e1-20260924-procedural/README.md) | **Current.** Real Rust/WASM particles with CPU-only browser evidence, bounded state and redesigned reading surfaces; native renderer stays quarantined; acceptance pending |

Original Figma Weave exports (inputs, keyframes, the three transition clips) live in [../../weave/](../../weave/README.md). A brief, screenshot, another agent's review or an automated pass never counts as owner acceptance.

Superseded iteration folders, raw Playwright recordings, unlinked intermediate stills, the quarantined 108 MB extracted-frame set and byte-identical copies were removed in the Week 2 cleanup. All of them can be recovered from git commit `56f056d`.
