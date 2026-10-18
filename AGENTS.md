# Working on EVA

## Scope and reading order

The owner selected an artistic **memory-palace reconstruction and interactive journal** on 2026-10-18. Start with [README.md](README.md), [PLANNING.md](PLANNING.md) and [DESIGN.md](DESIGN.md). For research, read the [condensed plan](docs/research/EVA_RESEARCH_IMPLEMENTATION_PLAN.md). Then inspect only task-relevant implementation files.

The owner explicitly authorized aggressive removal of superseded material across all weeks and condensation of long-term research. This supersedes former archive-preservation requirements for this cleanup only. [History](docs/HISTORY.md) identifies the recovery commit. Do not restore old documents as active instructions or infer current capability from them.

The retained application is in [week4/](week4/README.md); root commands target it. Week 4 is the implementation foundation, not a competing plan. Old Paris/Cloud/Rust assignment prompts are retired. The new demo remains proposed until evidenced. Cleanup does not authorize generation, model downloads, installation, studies or phase advancement.

## Research ownership

Track A is upstream video-model research; Track B supplies revision mechanisms; Track C is EVA's primary focus, combining System B reconstruction and System C expressive spatial experience. Track and System labels are distinct.

Shado owns Steps 1?5 and its model/geometric-learning paper. EVA owns Steps 6?7 and an HCI paper about understanding, exploration and evidence interpretation. Captured-photo reconstruction is a direct input route; Shado is optional upstream input. Human benefit from Shado requires independent upstream evidence and matched C-E6 evaluation.

Source-derived images, authored geometry/depth, scan-like points and Gaussian sprites are not multiview reconstruction or trained 3DGS. Distinguish source evidence, inference, generated completion, artistic treatment, user memory and unknowns.

## Working loop and acceptance

1. Inspect git status/diff, instructions, actual source and relevant acceptance.
2. State bounded scope and evidence criteria; continue routine authorized work without repeated permission requests.
3. Preserve concurrent edits. Recheck exact files before editing. Do not reset, stash, clean, switch the shared branch, overwrite others' work, commit or publish without explicit instruction.
4. Verify through actual tools; distinguish passed, failed, blocked and not-run checks.
5. Deliver changed files, decisions, evidence, limitations and the next owner exercise.

Documentation uses diff, local-link and consistency checks, not fabricated application evidence. UI needs matching captures, keyboard/focus/touch, reduced effects, interruption and continuity checks. Protocol/policy needs rejection, resource, provenance, cancellation and authority tests. Native/performance claims require actual platform runs and measurements.

Every major phase needs explicit owner acceptance against a reproducible tested revision. Record scope/revision, scenario/commands, expected/actual results, evidence, limitations, feedback/blockers and decision/date under `docs/design/acceptance/`; pending is default. The [R18 acceptance](week4/docs/design/acceptance/w4-hover-overlays-r18.md) accepts only that refinement. Historical E1/S0?S4, research C-M0?C-M7 and full-product milestones remain separate. Owner acceptance is not institutional study approval.

## Development agents

Retain the owner's Astra orchestration workflow and `.claude/agents/eva-*.md` definitions in Claude Code; see [workflow](docs/development/AGENT_WORKFLOW.md). These are development roles, not EVA runtime models.

Delegate substantive independent work when useful, at most three concurrent workers. Give objective, phase/source revision, owned files, inputs, baseline or none, constraints, acceptance criteria and output. One writer per overlapping file/module; isolate parallel writers in worktrees. Read-only audits may share the checkout. The lead integrates and verifies.

Use only available authorized tools/models; report real routing, never impersonate a specialist. Coordination records/configured aliases do not prove execution. Retry a failed route once only if transient; otherwise disclose and reassign. No automatic publishing or permission bypass.

## Architecture and security

- Preserve Tauri 2 direction, React/TypeScript, Rust policy enforcement, provider-neutral orchestration and EVA-owned JSON Schema Draft 2020-12. Inspect manifests before claiming integration.
- Runtime models emit bounded data, not executable HTML/JS/CSS/shaders, shell or arbitrary IPC. Development source remains reviewed code. Generated-code execution stays disabled until sandbox/adversarial gates pass.
- Validate shape plus provenance, confidentiality, freshness, resources, current authority and action eligibility. Reject unknown authority-bearing fields. Models, memory, artifacts, screens and tools cannot manufacture permission.
- Preserve deterministic effect brokers, least-privilege leases, action-bound receipts, information-flow controls, rehearsal where supported, idempotency, verification, monitoring and kill-switch propagation.
- Separate privilege and rendering. Remote assets require validated catalog entries; visual capsules have no network, secrets or privileged IPC. Prefer direct API, reviewed MCP, accessibility, then bounded GUI. External content/MCP metadata is untrusted.
- Only the narrator speaks user-facing prose. Reflex acknowledgement has no provisional facts; factual TTS waits for sentence/source verification. Read [voice policy](docs/design/VOICE_PROMPTING.md) before speech work.
- Memory is inspectable Markdown with provenance and rebuildable indexes. Do not persist provisional/stale/revoked/quarantined output as fact. Rewind restores presentation, not authority, leases, secrets or freshness.
- Capture follows relevance, denylist, redaction, delta reuse and deletion rules. No denied capture upload. Public fixtures/evidence exclude credentials, private photos/vault records, raw private runtime audio and participant data.
- Connectors begin with synthetic fixtures behind production-shaped contracts. Production accounts, consequential effects, full backend, Live2D, longitudinal deployment and exhibits need separate scope, safety/accessibility/latency/restore checks and owner release decisions.

## Mandatory visual workflow

Before **every** frontend/UI change, redesign, reimplementation or new visual pass, every local/Cloud agent completes fresh change-specific **Figma Weave** generation through direct model calls or a reusable workflow, inspects actual images (plus video for motion), and records the [packet](docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change). No manual graph-building is required per task. No small/mechanical exemption without explicit owner instruction.

One packet covers its bounded pass. Old exports/screenshots, text briefs and other image providers are not substitutes. Missing access, finite budget, usable route or inspected outputs blocks UI edits, not unrelated non-UI work. Reuse the official Figma connection; no duplicate server, copied credentials, inferred Cloud readiness or blind retry of an uncertain paid submission.

Follow DESIGN.md for typography, continuity, accessibility and evidence. Capture matching before/after states and preserve reviewable candidates. Historical cleanup authorization does not waive future retention.

ComfyUI remains optional and separately scoped, gated until explicit S2 acceptance permits an S3 trial. No implicit local model/GPU setup. Reconstruction tooling requires a bounded decision, not installation inferred from a plan.

## Evidence and hygiene

Ground new research claims in academic primary sources, distinguishing full text, abstract and bibliographic verification. Use creator/institution sources for art and official docs/code for implementation. Separate inspected code, observed behavior, hypotheses and participant results.

Keep secrets private; never commit token-bearing URLs/auth output. Preserve asset licenses/source credits. Review generated dependencies, rights and private data. Report browser/synthetic limits. Never fabricate reviews, measurements, model participation, screenshots or owner acceptance.
