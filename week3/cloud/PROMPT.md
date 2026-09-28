# Week 3 Cloud Sculpting Prompt

Paste this entire prompt into a **new Claude Code on-the-web session** attached to the current, owner-reviewed repository snapshot. It is a task prompt, not a background shell loop.

---

You are refining EVA's Week 3 conversational eye. Work as a visual/motion designer who implements and inspects the result, not as someone trying to make tests pass with another generic effect.

## Latest owner feedback — the governing brief

I like the **state-changing behavior**, but I do **not** like the current visuals or animations. They still do not express the reference direction. Keep the working conversation/state coordination, and redesign the visual performance so **the eye itself transforms into different emotional response forms**, then coherently returns.

My earlier clarifications still apply:
- Retain Week 1's recognizable eye identity: its actual silhouette/proportions, square pupil, original ordered-dither character, and responsive gaze/weighted tissue motion.
- The eye transforms; do not substitute an unrelated orb, doughnut, generic particle blob, fixed icon, or decorative animation around an unchanged eye.
- Broader colors are allowed during responses; rest returns to the original red identity.
- A recognizably continuous core does not mean every response must be the same flat eye photograph tilted, stretched, recolored or waved like a rectangular sheet.
- Use the Week 3 images, GIF and MP4 references seriously: sculptural depth and folds, organic/pixel material, rich connected tracking boxes, matrix fragmentation, horizontal RGB smears and pixel trails. Their effects must belong to the changing eye, not appear pasted on afterward.

**No Week 3 visual baseline is accepted.** Candidate 06 is implementation input and a comparison point, not an approved final design. Liking the state changes is not full phase acceptance.

## First actions — inspect, then clarify before redesigning

1. Read `AGENTS.md`, `docs/development/AGENT_WORKFLOW.md`, `week3/DESIGN.md`, `week3/PLANNING.md`, `week3/docs/design/REFERENCE_REFINEMENT.md`, and the current acceptance record. Inspect git status/diff and preserve unrelated work.
2. Run `bash week3/cloud/session.sh prepare`. If preflight says files are missing, stop: this Cloud clone is older than the local implementation. Do not recreate an approximation from a stale checkout.
3. Start `bash week3/cloud/session.sh start` with the available background-process tool. Setup-cache processes are not assumed to survive. Do not kill an unknown process occupying port 1430.
4. Inspect the original Week 1 `week1/apps/desktop/src/SignalEye.tsx` and its accepted biomechanical captures. Inspect the actual Week 3 reference stills at full detail. Read the generated reference manifest/contact sheets under `$EVA_SCULPT_WORK_DIR/references`, including the detail frames. Play the original motion where the tools support it; otherwise inspect sampled sequences and explicitly say that timing was sampled rather than watched in full.
5. Capture a fresh **before** rendition with a unique revision ID. Look at the images, not merely the filenames or passing test output. Inspect the motion recording, or extract representative temporal frames when direct video viewing is unavailable.
6. Ask me up to three **targeted artistic questions before making the next redesign**. State what is already settled above; do not ask me to repeat the square-pupil/dither/cursor/color choices. Show the specific unresolved choices about transformation vocabulary, degree of abstraction, material or motion phrasing using the references as anchors. If a proposed approach contradicts an existing rule, name that conflict rather than silently replacing the rule. Wait for my answers.

After those clarifications, proceed through **three visual sculpting passes**, without asking permission for every routine edit. Then pause for my review. Do not start a fourth pass or another batch without my feedback.

## Scope and routing

For this Cloud-only task, use the available Claude model selected in this Cloud session instead of attempting to recreate the workstation's Astra/Model Gateway transport. This is not a change to EVA's runtime models or local development settings. Record configured/observed model/tool provenance honestly.

Do not install/reset a router, copy local credentials, enable bypassPermissions, edit `.claude`/MCP settings, or set a subagent-model override. If delegation materially helps, use only project `eva-*` agents whose actual Cloud route/tools work; respect their explicit model definitions, isolated writers, one writer per overlapping file, and the maximum of three concurrent workers. Do not attempt the workstation-only GPT routes if unavailable. Continue the bounded work in the main Cloud Claude session and disclose the missing worker, rather than inventing participation or silently changing its model.

Editable scope: `week3/src/visual/**`, directly related visual tests, and narrowly necessary visual presentation/capture support. Preserve the voice/controller behavior in `week3/src/voice/**`, the Rust backend, schemas, microphone consent, cancellation, generation IDs, validated reply envelope and provider settings. Do not rewrite `App`'s state coordination to fake a nicer visual sequence. Keep Week 1/2 and original reference files unchanged. Keep existing reviewable evidence, even rejected candidates. If a necessary fix lies outside this scope, report it and ask first.

The five response stances remain `attentive`, `comforting`, `shared_joy`, `congratulatory`, `supportive`. `providers::decide_conversation` remains the interim, brain-replaceable decider; no brain imports, new adapter wiring, new authority fields or renderer-side emotion inference. Turn-state effects and seeds remain local.

Cloud work is **visual-only**. Use the clearly labeled `?fixture` view. Do not activate a real microphone, call OpenAI/ElevenLabs, reuse the earlier voice allowance, run `provider:check`, launch the native shell, or read private `.env` files. No new Anthropic API harness is needed: this coding session is already Claude. No paid image/video generation without a separate explicit budget. Higgsfield remains the selected optional authoring service if actually available and authorized; do not silently substitute another provider. No ComfyUI, GPU/model downloads, deployment, commits, pushes or PR creation without explicit instruction.

## What to sculpt

Make expressive families structurally and temporally different, with fresh composition on recurrence. Explore these as hypotheses, not pre-approved fixed presets:
- **Comfort:** the eye's own material softens, folds or gathers into a protective, low-tension form; restrained motion, not a sad color swap.
- **Shared joy:** an open, buoyant, lifted form with light internal flow, different from the congratulatory peak.
- **Congratulation:** a dimensional unfolding/bloom with a clear outward phrase and warm settlement, not a replayed starburst clip.
- **Supportive assistance:** a composed gathering/opening, coherent fanning or bridging of material, retaining focus rather than exploding into noise.
- **Curious attention:** the original identity is legible; restrained orientation and internal exploration without a new facial diagnosis.

Keep the state machine's decisions and timing truthful while improving **visual interpolation and choreography**. Start a speaking expression with actual playback state, not request submission. Processing fragmentation exists only during processing. The box layer recurs throughout the active experience, follows rendered feature geometry and yields on interruption. It does not represent hidden reasoning or track the user's face/screen.

Preserve shape/velocity continuity on mid-transition retargets. Source identity, spatial anchor and square pupil should survive the transformation; avoid reset-to-neutral-then-replay. Vary geometry, fold/lobe/ribbon arrangement, asymmetry, paths, composition and phrasing—not only hue or imperceptible noise. At least three seeded occurrences per family must be visibly related but different. Live seed generation must remain distinct from deliberate fixture replay.

Do not treat the current CPU raster, bitmap warp or mesh implementation as aesthetically sacred. Replace or reorganize visual internals where justified by the clarified direction, while retaining original-eye identity, bounded resources and the existing public contracts. A different rendering technique needing a new GPU/native route or an architectural/safety exception requires an explicit proposal and owner authorization first; do not use Cloud hardware as evidence that a quarantined native renderer is safe.

## Three-pass working loop

Create one short batch ledger under a new `week3/docs/design/revisions/w3-cloud-<date>-<batch>/` folder: baseline, clarified intent, pass IDs, concrete observations, checks, blockers and owner decision **pending**. Do not call self-critique an owner rating or an empirical result.

For each of passes 1–3:
1. Name one meaningful sculptural/motion hypothesis and the reference feature it transfers. Define what will visibly change and what must stay anchored.
2. Make a bounded implementation. Do not repeatedly reskin the same weak shape. Do not spend the batch building an elaborate evaluation harness instead of improving the visible work.
3. Run `bash week3/cloud/session.sh test`. Fix relevant failures honestly. Do not weaken contract/accessibility/cancellation tests to make a rendering change green; replace obsolete renderer-internal assertions only with an explained, equally meaningful behavior check.
4. Capture under a **new** revision, e.g. `bash week3/cloud/session.sh capture w3-cloud-<date>-<batch>-p1-a1`. Use a new attempt suffix after a failed capture; never overwrite an earlier rendition.
5. Inspect normal-speed motion where supported, plus matching stills of rest, all five stances (three variations each), recurring same-stance transitions, processing, interruption, reduced motion, End and resizing. Compare to the actual references and the previous pass at matching viewport/DPI. Evaluate the transformation as a sequence—not just its final pose.
6. Write a concise visual critique with observable examples: **identity**, **distinct emotional form/phrasing**, **depth/material**, **reference-effect integration**, **continuity**, and **comfort/control**. Mark each improved/unchanged/regressed with image paths or recording moments. Box counts, different hashes, a unit-test pass, or your own assertion of similarity are not visual fidelity.
7. Run the protected-file guard. Preserve evidence and explain any regression. Keep the best candidate accessible without deleting the others.

Do not add artificial loading delay to show off glitch effects. Avoid full-screen flashing and excessive contrast pulses. Keep captions/controls crisp and reachable, preserve keyboard focus, and retain static varied forms in reduced motion. End and interruption remain local and immediate. Measure actual browser resource/frame behavior and separate it from native, microphone, GPU or voice-load claims.

## Handback after pass three

Show the strongest current candidate and its motion evidence, with a compact baseline/pass1/pass2/pass3 comparison. Summarize actual changed files, executed checks, reference correspondences, remaining mismatches and model/tool provenance. Ask me what to retain or change next, then **wait**. If blocked, report the blocker earlier rather than filling the gap with fake evidence or a prerecorded interaction.

When I provide feedback, update the intent ledger and perform the next three-pass batch. Do not restart broad research or erase the original-eye anchor. Do not infer acceptance from silence, a positive comment on one feature, automated checks or another agent's opinion. All Week 3 and prior phase acceptance remains explicit and pending until I decide.
