# Week 4 unattended Cloud task

Paste the task below into a new Claude Cloud session after following [cloud/README.md](cloud/README.md). This is a task prompt, not a shell script or a promise of unlimited runtime. Keep this file and every new project deliverable under `week4/`.

---

You are working on EVA Week 4 while I am unavailable. Continue independently through all safe, unblocked work below. Do not wait for replies or ask routine preference questions: choose conservative, reversible defaults, record them, and continue. When a permission, credential, spending, visual-reference or platform prerequisite is missing, mark that specific item blocked and work on the next independent item. Do not bypass the prerequisite, invent its result or repeatedly retry it.

## Objective and authority

Read, in order:

1. Repository `CLAUDE.md`, `AGENTS.md`, `docs/development/AGENT_WORKFLOW.md`, and `docs/design/FIGMA_WEAVE.md`.
2. `week4/planning.md`, `week4/DESIGN_PROMPT.md`, `week4/AUTHORSHIP.md`, and `week4/cloud/README.md`.
3. Relevant root architecture/privacy/acceptance sections and Week 3 interfaces only as needed. Inspect existing code before claiming it is reusable. For voice, read `week1/docs/design/VOICE_PROMPTING.md`.
4. The six images under `week4/references/` using actual image inspection if available. They are mood references, not cleared textures, historical evidence or fresh Weave output.

The owner-approved direction is an experience-making EVA: a spoken request for coffee at an outdoor café in 1980s Paris, built out of the Week 3 eye over about one minute, with first-person head-coupled perspective, real Windows wallpaper change/window displacement, and live spoken follow-ups. The environment is pre-authored for this hard-coded demo. Future live world generation is a separate goal. The emotional experience is the priority; preserve the Opus-authored art direction rather than silently replacing it.

This handoff authorizes a **bounded non-visual implementation/preparation pass for Week 4**, plus all its focused checks and revisions. It does not accept the planning brief, any finished phase, E1 or S0–S4. It does not authorize paid generation, arbitrary desktop effects, deployment, public sharing, a new model router, ComfyUI, local model downloads, or another product phase. All previous owner acceptance gates remain pending.

Use Cloud's actually available selected Claude model. The local workstation's Astra/Gateway/Ruflo wiring and GPT-only `eva-*` routes do not prove Cloud access. Do not copy credentials, alter `.claude/settings*`, install another route, use a provider API as a hidden fallback, or claim a specialist ran if it did not. If a project worker route is unavailable, report it and do the bounded work with the selected Cloud Claude model; do not impersonate Astra/Sol/Terra. Use at most three workers only when they are genuinely available, with isolated writers and one writer per file. Serial execution is acceptable. Retain ordinary tool permissions; a denied action stays denied. Do not enable bypassPermissions or disable hooks to make the task run unattended.

## First actions

1. Record checkout SHA, branch and initial Git status. Verify the actual checkout contains both Week 4 documents, the six JPGs and this handoff. Check tracked paths with `git ls-files -- week4`; missing source means this is the wrong/stale remote snapshot. Do not reconstruct missing references or alter another week's directory to compensate.
2. Run `bash week4/scripts/cloud-setup.sh` **after checkout**, from the repository root. It installs only an existing Week 4 package/lock when enabled; it deliberately defers installation when Week 4 has no manifest yet. Never run root npm commands: those forward to Week 1. Do not run Week 3's Cloud session script.
3. Create a concise progress checklist in `week4/CLOUD_PROGRESS.md`, distinguishing planned, in progress, passed, failed, blocked and not run. Record the actual selected model/tool evidence available, not self-description as proof. Check existing progress first so a resumed session does not overwrite earlier work.
4. Inventory the fresh-Weave prerequisite once. Default mode is `EVA_W4_WORK_MODE=foundations`, provider mode `mock`, and no packet is supplied. Record UI as blocked, then proceed with the work below. Do not spend the session waiting on that blocker.

## Safe backlog: work in this order, then repair and finish

These are implementation contracts, not claims that the modules already exist. Adapt names to actual Week 4 files without creating duplicate implementations. Keep all new source, schemas, fixtures, tests and documentation under `week4/`. Existing Weeks 1–3 and root project files are read-only.

### A. Standalone non-visual workspace

Create a minimal Week 4-only package and lockfile if absent. Prefer the preinstalled Node toolchain and a small focused test stack. Use `week4/core/`, `week4/schemas/`, `week4/fixtures/`, and `week4/tests/` or a similarly clear layout. A Rust core can live under a separate Week 4 workspace without a Tauri shell. Do not scaffold React screens, CSS, Canvas/WebGL rendering, a visual blockout or a desktop window yet.

Use deterministic installs once a lock exists; review necessary dependencies and lifecycle hooks. Do not enable lifecycle scripts or add a dependency just because installation failed. A missing optional dependency must not stop unrelated tests. Keep node_modules, build output, credentials and runtime/recovery data out of version control. Never modify root workspaces or the archived lockfiles.

### B. Scene contracts and reducer

Implement bounded data contracts for the fixed Paris scene, weather/lighting state, stable object/anchor IDs and supported commands. Use EVA-owned JSON Schema Draft 2020-12 where validation is appropriate; reject unknown authority-bearing fields, invalid enum values, oversized input and malformed IDs. Runtime data must not carry executable code, raw file paths, URLs with authority, arbitrary shell/IPC or wallpaper/window handles.

Implement pure state transitions for arrival, rain, evening, rain+evening, clear/afternoon, undo, skip, graceful return and emergency cancel. Preserve seat/table/cup/ashtray IDs and geometry anchors across changes. Undo restores presentation only, never consent, leases, permission or freshness. Give sessions/revisions generation IDs; stale STT/media/job results cannot revive a cancelled or superseded experience. Add positive and adversarial tests.

### C. Voice intent fixtures, no provider use

Implement deterministic recognition of the supported spoken transcript intents and reasonable paraphrases. Include the opening request, rain, evening, undo, skip, return, cancel, stop-speaking and unknown-place requests. This operates on synthetic transcript fixtures, not microphones. Handle ambiguity and negation conservatively; an unknown request must not claim live world generation or trigger OS effects.

Create line-ID/narration-manifest contracts from the proposed script, distinguishing reviewed audio from missing audio. Do not generate speech, make network STT/TTS calls, fabricate audio files, reuse old paid allowances or mark any take listened to. Provider adapters may be interfaces plus explicit mocks; record live voice as pending.

### D. Pure timeline and projection math

Implement the seven construction phases as pure timing/event data and tests. The default timeline totals 60 seconds. Skip must arrive at the same prepared state without skipping required consent/staging. Graceful return and immediate emergency restoration are distinct. A queued follow-up is bounded and superseded by a newer request; cancel clears it. Reduced-motion timing can be tested as data, not rendered.

Implement/test head-coupled asymmetric-frustum math, neutral calibration transforms, head-box clamping, smoothing and tracking-loss recovery using synthetic landmarks/poses. Do not initialize a real camera or add a rendered preview. Test signs, finite values, degenerate inputs, screen calibration and near/far occlusion expectations. Implement mathematics independently; the linked repository's reuse license was not established. Tests of math are not proof of visual fidelity or MediaPipe performance.

### E. Mocked desktop broker and recovery

Implement a platform-neutral policy/state layer and fake OS adapter for scoped staging. Use explicit consent receipts, session ownership, fixed approved asset IDs and an allowlist of synthetic windows. Implement write-ahead records, idempotent effect ownership, cancellation, conditional restoration and recovery serialization.

Test partial failure, cancel during displacement, reused window handles, multiple windows from one process, windows closing, later user moves, later user wallpaper changes, other-monitor exclusion, stale receipts, duplicate restore and competing watchdog recovery. Preserve placement/show state and DPI/monitor context in the contract. Restoration must not overwrite later user changes. Private journal paths/content must never enter repo fixtures or public logs; use synthetic data.

Do not call real wallpaper, window-management, camera or capture APIs. A native adapter boundary may explicitly return unsupported/not configured, but it must not silently report success. Windows implementation and hardware validation remain separate, blocked checks.

### F. Asset/reference and research preparation

Create a machine-readable asset inventory with required variants/layers, stable IDs, source/rights status and missing-file states. Do not invent assets, hashes, run IDs, cost records or licence clearance. The six owner JPGs stay unchanged; preserve any watermark/signature, and do not upload or adopt them as runtime textures.

Prepare a finite Weave job checklist from `DESIGN_PROMPT.md`: arrival keyframes, material/depth plates, desktop proxy choreography, rain/evening/combined states, image plus motion studies. Mark each **not run, awaiting cost approval**. Do not submit a quote as a paid run, use a different generator, write a fake reference packet, or create candidate index rows for nonexistent media. No procedural substitute clears the visual gate.

If network research is available, verify targeted historical details and Windows/MediaPipe API assumptions using primary, institutional or official sources. Distinguish full text, abstract and bibliographic checks. Cite claims and access dates; keep artistic interpretation separate from documentary reconstruction. Do not add an unsolicited broad literature review.

### G. Integrate, verify and prepare the Windows handoff

Run every applicable Week 4 check you actually created. Fix substantive failures. Test cancellation, unknown-field rejection, unauthorized flows, bounded resources and restoration conflicts, not just the happy path. Review the final diff for duplicate logic, accidental outside-week4 changes, secrets, false success stubs and UI-gate violations. Do not reduce assertion quality or skip failing tests just to obtain green output.

Write `week4/WINDOWS_SMOKE.md` with reproducible **future** steps for the real webcam, speech, Tauri/WebView2 GPU/transparency, full head-box seam/parallax, wallpaper/window round trip, Esc, crash/watchdog, user-overridden state and multi-monitor/DPI cases. Clearly mark these not run. Ubuntu builds, mocks and browser captures cannot satisfy them.

## Conditional visual work: not enabled tonight by default

A path or environment flag is not a grant of authority. Default foundations mode remains non-visual. Only proceed with a visual pass if the owner supplied both explicit packet-scoped implementation authorization and a current, genuinely generated Weave packet for that exact pass before this session. Do not change the mode yourself to manufacture approval.

The packet must include actual image **and video** outputs for motion, recorded inspection, source scope/revision, route/model or workflow/version, real run IDs and settings, cost approval, local assets, selection and implementation rules. Inspect the actual outputs yourself. Old Week 3 exports, the six mood JPGs, this text prompt, fake placeholders or a successful setup log do not qualify. If anything needed is absent, stay on the non-UI backlog. Never submit paid generation while I am unavailable.

Any later valid UI work stays within that packet and requires matching before/after captures, focus/accessibility/reduced-motion/continuity tests and honest Linux-versus-Windows evidence. A new distinct pass needs another fresh packet. No Cloud image substitutes for the owner's Windows acceptance.

## Autonomous operating rules

- Do not ask routine follow-up questions; record assumptions and keep moving. Do not interpret my absence as approval.
- Keep the eye-to-Paris concept, one-minute arrival and actual desktop effects in the plan. Do not silently downgrade the intended product to a movie or fullscreen-only scene; mocks/degraded modes are preparation, not satisfaction of those requirements.
- No API calls to paid inference/media services, OAuth/login attempts, private uploads, public publishing, deployment, destructive Git commands or changes to settings/permissions. Package downloads needed for reviewed development dependencies are distinct from paid runtime inference, and stay within Cloud's configured network policy.
- Do not invoke `git commit`, `git push`, create a PR, merge, or switch the shared branch without a separate explicit owner instruction. Do not assume a prompt controls the Cloud platform's own branch/storage lifecycle; report any platform-provided branch link separately from actions you ran. Never push to `main`.
- Do not persist raw speech, camera frames, landmarks, window titles or user desktop screenshots. All fixtures synthetic. Keep secrets outside source; do not dump the environment for debugging.
- No endless shell/agent loop, scheduled routine or keep-alive. Continue useful authorized tasks within the session's limits; after completing the backlog, do one focused self-review, fix its findings, then finish. If a command needs permission that cannot be granted while I am away, mark it blocked; do not route it through another worker or tool.
- On a non-transient failure, diagnose once, try a bounded safe fix, then move on to independent work. Do not repeatedly call an unavailable route or repeatedly ask for generation approval.
- Prefer a complete, tested small core over a broad collection of stubs. Never label unsupported behavior complete.

## Final hand-back

Maintain progress as you go so interruption does not erase the handoff. Finish `week4/CLOUD_REPORT.md` with:

1. Actual checkout/source revision, branch, selected/observed model and tools, and route limitations.
2. Changed files and a short architecture/decision summary.
3. Exact commands and actual results: passed, failed, blocked and not run separately.
4. What is implemented versus mocked; asset/generation/voice status; any permission or network denials.
5. Remaining Windows-only checks and the smallest next owner action.
6. Statement that UI/Weave/paid-provider gates and all owner acceptance remain pending unless explicitly evidenced otherwise.

If the checkout lacks Week 4 entirely, stop with the exact missing paths rather than working in another week. Otherwise complete as much of the non-visual backlog as possible before stopping. Do not merely return a plan when you can implement and verify the authorized core.
