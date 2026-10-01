# Batch w3-cloud-20260929-b — floating agent over the desktop

Status: **pass 1 approved by the owner (p1-a1, commit `d4da63e`); pass 2 implemented (p2-a2), awaiting owner review.** Week 3 phase acceptance remains pending. No accepted Week 3 visual baseline.

## Source and environment

- Source revision: `f32de6d` ("Week 3 visuals: particle eye formations, seeded variation, transition glitches"), fast-forwarded from `8227623` onto the session branch `claude/eva-week3-conversational-eye-pm3rhb`. This is the owner-approved p3-a2 candidate from [batch a](../w3-cloud-20260928-a/LEDGER.md).
- Executor: Claude Code on the web, main session. Configured model `claude-opus-5-5`; not independently transport-verified.
- Toolchain: `week3/cloud/setup-environment.sh` run task-side (Node 24.14.0, ffmpeg). `npm ci`; `cdn.playwright.dev` is not used; a VM-local shim in `/opt/eva-w3/ms-playwright` maps the pinned rev 1243 directory layout onto the preinstalled **Chromium 141.0.7390.37** (rev 1194). Captures are Chromium 141 headless. No repository file changed for this.
- Before edits: guard baseline 1041 protected files; **127/127 Vitest passed**; production build passed.
- Figma MCP `whoami`: Alex Xiong (`ax388@nyu.edu`). Direct-model route used.

## Owner decisions for this batch (2026-09-29)

Goal: make the eye a true floating agent over the desktop — no background, just light — keeping every approved visual (p1-a2 forms, p2 seeded variation and handover, p3-a2 transition glitches).

| Question | Owner answer |
| --- | --- |
| Readability over bright/dark windows | **Pure light, user places it.** No screen reading (consent text promises no screen capture). Wash-out over white windows accepted. |
| Placement / movement | **Starts bottom-right, small; drag the eye itself; position remembered.** Grows around that spot while responding, clamped to the monitor (joy excepted). |
| Click-through | **Everywhere except the eye and controls.** Gaze keeps following the cursor via a native cursor-position poll. |
| Glitch box backing | **Pure-light stripes, no backing**; brighten slightly so they don't vanish like p3-a1. |
| Controls / captions | **Compact setup/consent card beside the eye once; slim control pill (Mute, Stop, End, Captions, Reduced motion) on hover/focus, always keyboard-reachable; captions float below the eye as light text with a soft shadow.** |
| `week3/src-tauri` (guard-protected) | **Authorized:** `tauri.conf.json`, `capabilities/*.json`, and one small read-only window/cursor module registered in `lib.rs`. Voice/provider code untouched. The guard will flag these files; the baseline is not rewritten. Each changed protected file is listed per pass. |
| Other polish | **Known form gaps:** comfort slightly dense/ribbon-like; supportive currents crisper than the soft aurora strands of the references. |
| Plan and allowance | Three passes (p1 floating light, p2 agent chrome and interaction, p3 form gaps). **250 Weave credits** for the batch. |
| Bright vs dark (p1 image redo) | Owner: img-02's veil over white is *too weak*; each emotion should have a **different visual state over white vs dark**. Chose **local-only pixel sampling under EVA** (native, ≤2 Hz, one brightness value, never stored or sent; consent text updated) and a **pigment/ink state** over bright areas. This supersedes the earlier "no screen reading" answer. |
| Cost confirmation | Owner, mid-p1: *"Auto approve credit usage from now on."* Every run is still quoted first and logged; runs proceed without a per-run prompt while the batch total stays within 250. Video still waits for owner approval of each pass's images. |

## Passes

| Pass | Hypothesis | Weave packet | Capture | Critique |
| --- | --- | --- | --- | --- |
| p1 | Floating light: transparent stage, real alpha from emitted light, pure-light glitch boxes, native transparent overlay window config | [p1 packet](../w3-cloud-20260929-b-p1/REVIEW.md): 7 image runs + 1 video, 77 cr; image set approved by owner (img-02 redone as img-04 + ink board img-05) | Before: [baseline](../w3-cloud-20260929-b-baseline/); after: [p1-a1](../w3-cloud-20260929-b-p1-a1/), [transitions mp4](../w3-cloud-20260929-b-p1/implementation/after/p1-a1-transitions.mp4) | [p1 REVIEW critique](../w3-cloud-20260929-b-p1/REVIEW.md#pass-p1-critique-agent-self-critique-not-an-owner-rating); native pieces moved to p2 |
| p2 | Agent chrome and interaction: corner placement, drag, click-through, cursor poll, card/pill/captions; Windows overlay + luma sampler | [p2 packet](../w3-cloud-20260929-b-p2/REVIEW.md): 3 image runs + 1 video, 62 cr; images approved by owner | Before: [p1-a1](../w3-cloud-20260929-b-p1-a1/); after: [p2-a2](../w3-cloud-20260929-b-p2-a2/) ([p2-a1](../w3-cloud-20260929-b-p2-a1/) superseded), [transitions mp4](../w3-cloud-20260929-b-p2/implementation/after/p2-a2-transitions.mp4) | [p2 critique](../w3-cloud-20260929-b-p2/REVIEW.md#pass-p2-critique-agent-self-critique-not-an-owner-rating); native not run |
| p3 | Form gaps: comfort and supportive | not started | — | — |

## Spend

| Run | Pass | Model | Quote | Approval | Reported |
| --- | --- | --- | --- | --- | --- |
| 1 | p1 | Nano Banana 2 edit | 6 | owner structured Approve | 6 |
| 2 | p1 | Nano Banana 2 edit | 6 | owner structured Approve | 6 |
| 3 | p1 | Nano Banana 2 edit | 6 | owner structured Approve | 6 |
| 4 | p1 redo | Nano Banana 2 edit | 6 | owner auto-approve instruction | 6 |
| 5 | p1 redo | Nano Banana 2 edit | 6 | owner auto-approve instruction | 6 |
| 6 | p1 redo 2 | Nano Banana 2 edit | 6 | owner auto-approve instruction | 6 |
| 7 | p1 redo 2 | Nano Banana 2 edit | 6 | owner auto-approve instruction | 6 |
| 8 | p1 video | Kling Video 2.5 Turbo Pro | 35 | owner "Approve both, make video" + auto-approve | 35 |

| 9–11 | p2 | Nano Banana 2 edit (2K) | 9 each | owner auto-approve instruction | 27 |
| 12 | p2 video | Kling Video 2.5 Turbo Pro, 5 s | 35 | owner "create video" + auto-approve | 35 |

Batch total: **139 / 250**.

## Native limits

Cloud cannot test real Windows/macOS behaviour: window transparency, native screen sampling and its OS permission, click-through, always-on-top, drag, multi-monitor clamping and native cursor polling. Browser captures over a synthetic test backdrop show the renderer's alpha only; they are not native evidence.

## Owner decision on pass 1 — 2026-09-30

The owner replied *"Approved. Start p2"* after reviewing [p1-a1-transitions.mp4](../w3-cloud-20260929-b-p1/implementation/after/p1-a1-transitions.mp4) and stills. Recorded as owner approval of pass-1 candidate **w3-cloud-20260929-b-p1-a1** (commit `d4da63e`), including the ink-over-text trade-off as captured. Not Week 3 phase acceptance; native overlay behaviour is untested.

## Owner decisions for pass 2 — 2026-09-30

| Question | Owner answer |
| --- | --- |
| Self-capture vs recordings | **Exclude EVA's window from capture** (Windows `WDA_EXCLUDEFROMCAPTURE`) so the luminance sample never reads EVA's own particles. Add a **"Visible to recordings"** toggle in the pill: while on, the exclusion is lifted, sampling pauses and each particle keeps the last light/ink map. |
| Platform | **Windows only.** macOS gets the same window behaviour but no sampling (pure light) until a later pass. |
| Monitors | **Primary monitor only.** Joy may exceed the eye's area but is clipped at the monitor edge. |

Technical finding: Tauri 2.12's JS API already provides `cursorPosition`, `setIgnoreCursorEvents`, `primaryMonitor`, `setPosition`/`setSize`, so gaze, drag and click-through need capability permissions only. Custom Rust is limited to the luminance sampler and capture exclusion. The Linux webview dev libraries are not preinstalled here; crates.io is reachable.

## Protected files changed in pass 2 (owner-authorized 2026-09-29)

`week3/src-tauri/tauri.conf.json`, `week3/src-tauri/capabilities/default.json`, `week3/src-tauri/src/lib.rs`, new `week3/src-tauri/src/overlay.rs`. No voice, provider, schema or credential code changed; `Cargo.toml`/`Cargo.lock` unchanged (hand-declared Win32 calls, no new crate). The guard reports exactly these four; its baseline was not rewritten.
