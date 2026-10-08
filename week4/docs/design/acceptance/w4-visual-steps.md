# Week 4 visual implementation: owner decisions per gated step

Status: **every step pending.** This record holds the owner's written decision for each gated step of the Week 4 visual implementation ([VSCODE_PROMPT.md](../../../VSCODE_PROMPT.md) §5, [progress](../../../VISUAL_IMPLEMENTATION_PROGRESS.md)). A step's approval is a pass result for that step only; it does not accept Week 4, W4-1 or any study phase. Silence, a test pass, an agent's opinion or the implementer's judgement is not approval. Each decision is recorded verbatim with its date and the exact tested revision.

| Step | Scope | Evidence | Tested revision | Owner decision (verbatim) | Date |
| --- | --- | --- | --- | --- | --- |
| 1 | Renderer foundation and the static arrival frame (P1 at rest with idle life). **Offered in browser scope:** the native idle video, native frame-time distribution and the real WebView2 GPU test could not be produced in the Cloud environment and remain open obligations (carried to step 6) | [w4-impl-s1-arrival-frame-20261007](../revisions/w4-impl-s1-arrival-frame-20261007/REVIEW.md) | `e7d1424` + working tree; sha256 manifest of 74 files in the revision's `checks.json`, root `34c62ecb1c84d248…` (full value in `checks.json`) | **"Reject direction"** — selected from the structured question *Approve step 1 (browser scope) / Request changes / Reject direction*. Per the protocol, work stops for discussion; a new direction needs a fresh Weave packet before any further UI edit | 2026-10-07/08 (UTC; structured answer in the Cloud session) |
| 2 | Real off-axis depth (synthetic poses; real tracking only with consent) | — | — | **pending** | — |
| 3 | Particle convergence E0 → A0 → P1 on timeline phases C–G | — | — | **pending** | — |
| 4 | Overlay accents (hairline rectangles, glitch boxes) | — | — | **pending** | — |
| 5 | The full minute (A–G, skip, graceful return, Esc, reduced motion, failure) | — | — | **pending** | — |
| 6 | Native Windows build and performance | — | — | **pending** | — |
| 7 | Desktop choreography (needs a fresh P2 packet first) | — | — | **pending** | — |
| 8 | Follow-ups (needs a fresh P3 packet first) | — | — | **pending** | — |

## Open owner questions raised at step 1

1. **Runtime use of P1/E0/A0 pixels.** The step-1 scene is authored natively; no reference pixels are read at runtime. Palette tokens were sampled from P1 at inspected points (recorded in the step-1 REVIEW). Decision (owner, 2026-10-07/08, verbatim option): **"No — keep native authoring (Recommended)"**. `week4/fixtures/assets/inventory.json` stays unchanged.
2. **Facing of the near walker.** The brief prefers people turned away; P1 shows the woman walking toward the viewer. Both are implemented and captured (`facing=away` was the default). Decision (owner, 2026-10-07/08, verbatim option): **"Toward (as P1 shows)"**. The default is not flipped yet because the direction was rejected in the same answer; it becomes the default in the next authorized visual pass.
3. **Commit.** Asked whether to commit the step-1 work to `week4`. Decision (owner, verbatim option): **"Do not commit yet"**. The working tree remains uncommitted.

Status lines in the step-1 REVIEW, the design INDEX and the progress file were updated *after* the decision to record it; the manifest root above is the tree the owner decided on, before those documentation-only edits.

## Direction after the step-1 rejection (owner, 2026-10-08)

Owner's words on the rejection: *"I feel as if the results do not resemble anything like P1. I want realism and aesthetics at its peak, so form is too hard, maybe just use colored wireframes, or something that feels technological and realistic but also aesthetic at the same time."*

Structured decisions (verbatim options):

1. Direction for the fresh Weave packet: **"C — Hybrid: coloured wireframe builds, realistic plates fill in (Recommended)"** — a technological wireframe construction language, realistic image plates revealed region by region, head-coupled parallax on the plates at arrival; wireframe returns for departure.
2. Runtime images: **"Yes — new generated images may be runtime plates"** — new Weave-generated images (not P1/E0/A0, which stay references) may be adopted as runtime plates/textures, recorded in `week4/fixtures/assets/inventory.json` with a provider-terms note before any runtime use (the inventory schema needs a revision for adopted generated assets; it is made when the first plate exists).
3. Art direction: **"Claude Opus 5.5 via the `opus` route (as before; self-report caveat recorded)"** — a read-only authoring run; the main session integrates.
4. Weave runs: **"Here in this Cloud session (Figma MCP is authenticated)"** — every run quoted and approved by the owner in a structured prompt before it executes; outputs inspected and recorded in a new revision folder before any UI edit.

Step 1 remains **rejected**; a new step-1 pass starts only after the C packet has been generated, inspected and handed to the writers.

### C packet, checkpoint 1 (owner, 2026-10-08)

RC1, the realistic master (Nano Banana 2.1, 5 credits, run `005d85e5-692d-4cf6-8ab7-8d98c4085c3c`, [packet](../revisions/w4-20261008-paris-c-hybrid/REVIEW.md)), was shown beside P1 with the agent's inspection. Owner decision, verbatim option: **"Reject the realistic look"**. Companion answers: **"Both grounds, as planned (Recommended)"** for the wireframe survey, and **"One multi-select prompt per batch (Recommended)"** for later approvals. No further run until the direction is discussed. Reasons (multi-select, verbatim options): "Looks like a stock photo; the aesthetic is gone", "Not 1980s Paris enough", "Realistic plates are the wrong idea". Next run: **"No run yet: write me the alternatives first"**. Reference: **"I will upload one reference image"** (style input only, never committed). The realistic-plate half of direction C is therefore superseded; the owner's earlier choice of coloured wireframe construction stands as the open thread. The owner then supplied five reference images in chat with the words "Especially refer to Cyberpunk 2077's blackwall aesthetic and shaders." and clarified: "The video uploaded in the file picker is how I want the loading animation to feel like as well. The images is what the city should feel like in terms of aesthetics (not colors)." Paris palette only therefore stands; the references define structure, texture and motion. The references are hashed in the packet provenance and kept out of the repository.

### Alternatives and batch 1 (owner, 2026-10-08)

The owner read [ALTERNATIVES.md](../revisions/w4-20261008-paris-c-hybrid/ALTERNATIVES.md) and answered in a structured prompt (verbatim options):

- Batch 1 (each quoted at 5 Weave credits): **"TG1 Tagged, 5 credits (author's recommendation)"**, **"LV1 Lavis, 5 credits"**, **"LL1 Line-light, 5 credits"** — all three approved; each submitted once. BW1 waits for the owner's video clip.
- Beads: **"Yes, beads on lines during construction (Recommended)"** (loose specks stay excluded).
- Line fields versus "no strips": **"Yes, fine line fields are fine; only image bands are excluded (Recommended)"**.
- Runtime use: **"Yes, non-photographic generated masters may be runtime assets (Recommended)"** (photographic plates stay excluded; inventory record and provider-terms note required before runtime use).

These refine, and do not accept, any step. The city direction is chosen only after the three images are inspected.

### Batch 1 outcome (owner, 2026-10-08)

LV1, TG1 and LL1 were shown beside P1 with the agent's inspection. Owner, verbatim: **"Okay reconstruct the images from the ground up using the references images I provided the last message + the mp4 video from the file upload. Especially refer to Cyberpunk 2077's blackwall aesthetic and shaders. The newly generated images dont resemble anything from the reference images I uploaded."** The follow-up questions (fix the chosen image; quote BW1 now or wait for the clip) were answered "Refer to my previous answer to the previous question." All three batch-1 images are therefore rejected; the next pass reconstructs the references from the ground up around the owner's five images and video.

### Reconstruction batch (owner, 2026-10-08)

The owner confirmed the five references and the mp4 reached the session, chose **"Run words-only now (Recommended)"** for the reference inputs (chat uploads reach the session, not Weave; the picker and a direct upload both failed), approved all four reconstruction stills in one multi-select prompt (**"BWA Blackwall city, 5 credits"**, **"TGA colour-tagged city, 5 credits"**, **"TSA tile-swap construction frame, 5 credits"**, **"CLA ink construction sketch, 5 credits"**; each submitted once with RC1 as geometry input), and chose the loading intensity **"Toned down: same language, slower and nearer-first (Recommended)"**. Prompts and the reading of the owner's clip are in [RECONSTRUCTION.md](../revisions/w4-20261008-paris-c-hybrid/RECONSTRUCTION.md). No step is accepted by this.

### Reconstruction review (owner, 2026-10-08)

Shown BWA, TGA, TSA and CLA beside the references. Owner, verbatim: **"Combine BWA and TSA but make it more abstract. Less details on the blackwall, and more transparent/opaque lines"** Combination into the minute: **"Not yet: more stills first"**. Next spend: **"The BWA-2 should be again a bit more abstract."** and **"BWA-2: a second Blackwall city with visible beads, ghosting and ripple"**. Round-2 prompts are in [RECONSTRUCTION.md](../revisions/w4-20261008-paris-c-hybrid/RECONSTRUCTION.md). The owner then approved both in one multi-select prompt: **"BWA-2, 5 credits"**, **"BTA, 5 credits"**; each submitted once. No step is accepted by this.

### Round-2 review (owner, 2026-10-08)

Shown BWA-2 and BTA beside the Blackwall stills and a clip frame. Owner, verbatim: **"Even more abstract, the tiles should be glitchy/matrix/dither like in week 3. The outlines/threads should not resemble the structure too much, it should be more spaced out. Furthermore, I feel like we just do 1 picture generation, but 4 different variance of it, and the photo to use is BWA-2 but with more with tiles and the fixes I just mentioned."** Also: **"Closer, but push further"** and, on what comes next, **"Fix what I just added first."** Round 3 therefore edits BWA-2 with one prompt in four seed variants before any motion study or renderer planning. The owner approved all four in one multi-select prompt: **"Seed 11, 5 credits"**, **"Seed 22, 5 credits"**, **"Seed 33, 5 credits"**, **"Seed 44, 5 credits"**; each submitted once. No step is accepted by this.

### Round-3 selection (owner, 2026-10-08)

Shown the four seed variants beside BWA-2. Owner: **"Seed 33: select"**; next: **"Motion study, 5 s (about 55 credits)"**. Seed 33 (img-13) is recorded as the owner-selected constructing-state reference; the motion study VB1 was quoted at 55 credits and the owner chose **"Approve: 55 credits, seed 33 to BWA-2 (Recommended)"**; submitted once. Seconds later the owner redirected, verbatim: **"Wait no it should just be seed 33 as the video, disregard BWA-2 now. The aesthetic and style should follow seed 33 solely."** Cancellation of the running VB1 was attempted; a seed-33-only motion study (VB2, no end frame) was quoted at 55 credits and the owner chose **"Approve: 55 credits, seed 33 only (Recommended)"**; submitted once. BWA-2 is no longer the settled target. This is a reference selection, not acceptance of any implementation step.

### Overnight implementation authorization (owner, 2026-10-08)

Owner, verbatim: **"Also after you are done with the next thing, switch to approval off and just start implementation with owner approval of the video already registered right now since I am going to sleep and I want you to start working on the implementation overnight of the graphics. Ensure the graphic implementation recreates the video exactly but not through screenshots, but through actual particles and animations happening on the desktop. Ensure smooth transition and animation."**

Recorded reading, applied from this point:
- **Reference packet for the new step-1 pass:** seed 33 (img-13) as the sole aesthetic and the VB2 motion study (seed 33 only) as the motion reference. The owner registers approval of the video in advance, before its inspection; the main session still inspects it and records what it shows.
- **Approvals off for implementation:** the step-by-step structured approval prompts are suspended for tonight's implementation work; progress, captures and limitations are recorded in the packet and the progress file for the owner to review on waking. This does not accept any step: acceptance records stay pending until the owner writes a decision.
- **What is built:** a real-time procedural recreation of the clip's look and motion (sparse light threads, dithered light figures, hard-edged dither/matrix/scanline/flat tiles swapping slowly and settling nearest-first, breathing threads, pale sky) with native particles, lines and animation. No generated image is used as a texture or plate; the generated images stay references only.
- **Still in force:** no commit or push (owner: "Do not commit yet"); no further paid generation without a quote and approval; no STT/TTS; no camera; no Windows window movement or wallpaper; no PRs. "On the desktop" is implemented in the Week 4 browser host in this Cloud session; the native Windows shell cannot be built or captured here and remains step 6.

### New step-1 candidate: the seed-33 procedural recreation (2026-10-08, overnight)

Built under the owner's overnight authorization (approvals off for implementation) against the owner-selected still (seed 33, img-13) and the owner-approved motion study (VB2, vid-02). Evidence: [packet REVIEW, Implementation section](../revisions/w4-20261008-paris-c-hybrid/REVIEW.md), captures and comparisons under `implementation/run-1`, `run-2`, `run-3` (and `run-4` if present), `checks.json` with the content manifest, the [brief](../revisions/w4-20261008-paris-c-hybrid/IMPLEMENTATION_BRIEF.md) and the [progress file](../../../VISUAL_IMPLEMENTATION_PROGRESS.md). Browser-only evidence (headless Chromium, software WebGL2); not a Windows, WebView2 or GPU measurement. All checks green at the last capture, run-4 (core 103, app 119, Rust 69, build, render smoke). Measured idle motion is far calmer than VB2 (fidelity gap recorded).

**Owner decision: pending.** Approve this step / Request changes / Reject direction, in writing, against the manifest root in `checks.json`.

## How to record a decision

Copy the owner's words exactly into the row, with the date and the commit or working-tree revision the owner actually looked at. On *Request changes*, keep the row pending, revise within the step, re-capture under a new revision folder and ask again. On *Reject direction*, stop; a new direction needs a fresh Weave packet.
