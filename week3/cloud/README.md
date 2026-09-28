# Week 3 Cloud sculpting

A handoff for **Claude Code on the web**, not an API-managed agent. The owner likes the state-changing behavior but has **not accepted the current visuals/animations**. Claude should refine the eye against the references, then pause for feedback after **three passes**. No app redesign is performed by this setup pack.

## Mandatory reference generation

Before every UI change, redesign, reimplementation and each new sculpting pass, follow [the Weave generation gate](../../docs/design/FIGMA_WEAVE.md#mandatory-prerequisite-for-every-ui-change), using direct Weave models OR reusable workflows; no manual graph-building is required per task. Generate fresh change-specific images and video for motion, inspect actual outputs, record the reference packet and give it to every UI writer before edits. Cloud may receive the current pass's packet from the connected main session; old exports, reference-study sheets and local app captures alone do not satisfy the gate. Missing access, usable Weave model/workflow, cost approval or inspectable outputs blocks UI work, not unrelated non-UI work. Keep normal spending confirmations; never copy credentials. Local OAuth does not establish Cloud access. Transfer the updated guidance and hooks in the reviewed snapshot; uncommitted local changes do not reach an existing Cloud clone.

## 1. Make the right source available first

A normal Cloud session clones a GitHub branch, **not this local working tree**. The earlier implementation/handoff checkpoints are now followed by **`d99ce49`**. The owner's new Weave guidance, reminder hooks/configuration and this alignment are working-tree changes at the time of this update; an existing Cloud checkout will not acquire them automatically. Select a reviewed snapshot containing the updated policy and all four deliverables; a local commit alone does not establish that the remote has it.

Review and transfer the desired snapshot to your chosen Cloud branch yourself. Do not blindly stage the repository or include private environment files. This session does not commit, push, create a PR, upload a bundle or provision a Cloud VM for you.

The branch must contain the current `week3/` code, these Cloud files, all of `week3/pivot_references/`, the Week 1 source eye/accepted reference, and the updated `AGENTS.md`, `docs/design/FIGMA_WEAVE.md`, development workflow, project agent definitions, reminder script and reviewed hook configuration. Keep private local settings and credentials out of the transfer. `preflight.mjs` detects its listed source/reference prerequisites; it does **not** verify rollout of the new policy/hooks or Weave readiness. Read the current policy explicitly even if preflight prints `ready:true`. A CLI `--cloud` launch normally clones the remote; even forced local bundles omit untracked files unless staged and have size limits. Prefer a reviewed branch for this media-heavy repo.

## 2. Create the Cloud environment

At [claude.ai/code](https://claude.ai/code), open the **cloud/environment selector above the message box → Add cloud environment**.

- Name: **EVA Week 3 — Visual Sculpting**.
- Network: **Trusted** initially. If an install is blocked, use **Custom**, include the defaults, and allow only the needed download hosts. Likely additional hosts are `nodejs.org`, `cdn.playwright.dev`, and `playwright.download.prss.microsoft.com`; Ubuntu package mirrors may also be needed. Diagnose the actual blocked host rather than enabling unrestricted access or disabling TLS checks.
- Environment variables: copy [environment.env.example](environment.env.example) below.
- Setup script: paste the **entire contents** of [setup-environment.sh](setup-environment.sh) into the setup field. Do not rely on a cloned repo path there. It provisions Node.js and ffmpeg, validates the Node archive against its official checksum, and starts no server. It does **not** install/authenticate Weave, create a graph, generate a packet or spend credits. A Weave graph node is not an npm/Node.js package.
- Keep ordinary permission prompts. Do not enable bypass mode or automatic PR fixing/publishing.
- Select an available Claude model in the Cloud UI. The prompt explicitly scopes this Cloud task to the Cloud-selected Claude route; it does not change the workstation's Astra/Gateway configuration or EVA's OpenAI/ElevenLabs runtime. Do not copy local Gateway configuration/tokens into Cloud. If the repo's local model/plugin setup blocks startup, use the platform's model selector or report the conflict—do not rewrite project routing or install another proxy.

```dotenv
EVA_NODE_VERSION=24.14.0
EVA_TOOLCHAIN_ROOT=/opt/eva-w3
PLAYWRIGHT_BROWSERS_PATH=/opt/eva-w3/ms-playwright
EVA_BROWSER_CHANNEL=chromium
EVA_SCULPT_WORK_DIR=/tmp/eva-w3-sculpt
EVA_SCULPT_REVIEW_EVERY=3
EVA_WEAVE_TOOL_REF=
EVA_WEAVE_PACKET_ROOT=week3/docs/design/revisions
EVA_W3_MAX_TURNS=0
BASH_DEFAULT_TIMEOUT_MS=300000
BASH_MAX_TIMEOUT_MS=600000
```

**No application API keys are needed for this visual-only task.** Do not add OpenAI/ElevenLabs keys, the voice ID, an Anthropic API key, Figma/Weave tokens, proxy credentials or private `.env` values. Cloud Claude's platform authentication does **not** authenticate Figma/Weave. Use an authorized official Figma connection or receive the current pass's packet from the connected main session; never copy workstation OAuth into Cloud.

The two `EVA_WEAVE_*` values are nonsecret **coordination hints**, not provider/SDK configuration or a gate-enforcement mechanism. `EVA_WEAVE_TOOL_REF` may identify an existing published workflow tool/flow; leave it blank for direct-model discovery, and never use an expiring/authenticated asset URL. It does not require a workflow or prohibit the approved direct-model route. `EVA_WEAVE_PACKET_ROOT` is the suggested repository-relative packet location; setup prints the hint but creates no packet. The task prompt must verify actual scope/provenance/assets and inspection for each pass. Existing shell helpers do not validate these hints or clear the Weave prerequisite.

`EVA_W3_MAX_TURNS=0` disables runtime voice spending only. It is **not** a Weave credit allowance. Weave runs use Weave credits, not Figma AI credits; reported available credits, a three-pass request and previous E1/voice budgets authorize no new runs. Obtain a finite allowance and honor each tool's explicit cost/default-input confirmation, including reruns. For direct models, discover with `weave_find_model`, quote with `weave_run_model` **without** `acknowledgedCost`, obtain structured **Approve/Cancel**, and only then submit the quoted `acknowledgedCost`; retrieve with `weave_get_model_run_output`. Workflows use `weave_get_tool_inputs`, quote/approve before `weave_run_tool`, then `weave_get_tool_run_output`. Verify the actual exposed tools; do not assume workflow cancellation support for direct-model jobs. Dynamic unquotable costs require separate bounded authorization or a quotable workflow. Do not retry a timed-out submission before checking for its run; cancellation does not guarantee a refund.

Variables in environment settings reach new sessions; shell `export`s or background processes in setup are not assumed to survive a cached VM. `env.sh` reconstructs the tool path for every task-side command. Setup runs as root on the documented Ubuntu image; tasks use the provisioned files. Keep provisioning within the platform's roughly five-minute caching window where possible; dependency/browser installation happens after clone in the task, so it need not be part of that cache window.

## 3. Establish the Weave route before UI work

Follow [the canonical connection/generation workflow](../../docs/design/FIGMA_WEAVE.md). Default to direct Weave models for a new one-off task; reuse a workflow when useful. Select one route for the current pass:

| Route | Required evidence before edits |
| --- | --- |
| Authorized Weave access in Cloud | Use the existing official Figma connection; verify linked account, intended active Weave workspace and the selected direct Weave model's or reusable workflow's actual inputs/outputs. Discover real tool names rather than assuming the local catalog or an endpoint proves access. Obtain cost/input/destination confirmation, run once, retrieve and inspect images **and video**. |
| Current packet from connected main session | Main generates that specific pass's references under its authorized connection and finite allowance. Transfer retained local media and complete provenance through an authorized channel. Cloud and every UI writer inspect the outputs and confirm the packet matches this scope/source revision before edits. Request a new packet for the next distinct pass. |

MCP can generate through direct Weave models or run existing workflows. **Graph creation/editing happens in Weave** only when a custom workflow is chosen; it is not required for direct-model generation. Do not add a separate Weave server, duplicate the official Figma route or invent a Weave API key/SDK. The Figma node binds documented Text/Image inputs; do not infer that video/3D outputs can bind to Figma layers. Confirm the destination before Connect/frame-writing operations. Direct Figma edits require manual Update in Weave; this is not automatic two-way live sync. No uploads, frame writes, generation or public sharing are authorized by installing/configuring the connection.

The canonical guide records an **empty workflow-tool catalog**, not a failed direct-model discovery. Discover a suitable direct Weave model, or inspect a supplied reusable tool/flow reference. No successful generation or Cloud readiness is established by local tool availability; verify the chosen route in the executing environment.

Before implementation, the packet records:
- pass/change ID, exact scope/owned UI files, source revision and before-state;
- brief, route, actual direct-model ID or workflow/recipe ID/version where exposed, nodes/models where exposed; leave unused or unverified fields null/empty rather than inventing values;
- exact inputs/settings, real run IDs, finite allowance/per-run confirmation and cost/result as reported;
- retained local images/video, selected outputs, actual inspection (including motion limits), extracted geometry/material/timing rules and known deviations.

A manifest template, tool success status, old exported media, the reference-study cache or app screenshots cannot stand in for this packet. Direct **Weave** model output satisfies the route when accompanied by fresh change-specific images/video, actual provenance, cost approval and inspection; an alternate provider does not. Every UI writer must inspect the media. Missing access/usable model-or-workflow/budget/output—or required motion that cannot be evaluated—**pauses UI edits immediately**, even mid-batch. Only independent non-UI work may continue. There is no small-change, mechanical or deadline exception without explicit owner instruction, and no procedural-only or alternate-provider substitute.

## 4. Start the task

Select the prepared branch and environment. Paste [PROMPT.md](PROMPT.md) as the task message.

Claude's first task-side commands are:

```bash
bash week3/cloud/session.sh prepare
# Run this one as a session-scoped background command:
bash week3/cloud/session.sh start
```

`prepare` verifies its listed source prerequisites, runs `npm ci --include=dev`, installs the **project-pinned Playwright Chromium** and Linux browser libraries, snapshots protected files, extracts archival reference-study sheets, and runs tests/build. It never invokes Claude recursively, authenticates Figma/Weave, runs a workflow or grants spending permission. Toolchain preparation and baseline captures may precede the Weave run; **UI implementation may not**. No service is started in cached environment setup.

The preview is `http://127.0.0.1:1430/?fixture&state=idle&stance=attentive&seed=42` **inside the VM**. Your own computer's localhost is not the Cloud VM. Review the session's actual image/video/file outputs or a platform-provided preview if available; do not assume this is a public URL or deploy it merely to make a link.

Cloud fixtures remain visibly labeled synthetic. They exercise visuals/state transitions, not live inference. Linux screenshots are not native Windows, speaker, microphone or workstation-GPU evidence.

## 5. Sculpt, capture, inspect; pause every three passes

After reference inspection and the prompt's targeted artistic clarification, Claude performs three meaningful iterations, **each with its own fresh inspected Weave packet before implementation**. One packet covers that bounded pass, not a new direction/pass; individual saves within the same documented scope do not each require a new run. A blocked prerequisite or cost confirmation can pause work earlier than the three-pass review. The shell tools only support that workflow: **the prompt drives Claude's editing/critique loop**. There is no cron job, infinite `claude -p` loop, auto-generation hook, hidden API client, grading-model call or guaranteed 24/7 execution.

Use fresh IDs; the capture scripts refuse overwrites:

```bash
bash week3/cloud/session.sh status
bash week3/cloud/session.sh capture w3-cloud-20260928-a-baseline
bash week3/cloud/session.sh source-eye w3-cloud-20260928-a-identity
# Generate/inspect via direct Weave models or a reusable workflow, or receive the current-pass packet.
# Record it BEFORE UI edits, for example in:
# week3/docs/design/revisions/w3-cloud-20260928-a-p1/REVIEW.md
# Use references/images/, references/videos/, references/contact-sheet.png and provenance.json.
# After every UI writer inspects it and implements only that bounded pass:
bash week3/cloud/session.sh test
bash week3/cloud/session.sh capture w3-cloud-20260928-a-p1-a1
# Link the capture from p1/REVIEW.md; use fresh packets for p2 and p3, then pause.
```

Use [the canonical categorized folder template](../../docs/design/templates/weave-review/REVIEW.md): REVIEW.md, reference images/videos/contact sheet, implementation/before and after, and provenance.json. Keep the existing capture runner's immutable `...-p1-a1` output separate from the already-created `...-p1` packet: the runner refuses existing directories. Link its actual paths as before/after evidence in REVIEW.md and provenance.json rather than moving/duplicating captures or claiming the runner used the planned subfolders. This is a naming scheme, not an existing candidate. Link each actual packet's REVIEW.md from the phase index. Retain rejected Weave outputs and implementations; compare app captures against the fresh selected references and previous rendition.

The reference-study cache under `$EVA_SCULPT_WORK_DIR/references/manifest.json` contains original-still paths, bounded GIF frames, sampled MP4 contacts and detailed frames. It is **not Weave generation, a current pass packet or permission to edit UI**. Study copies are not licensed runtime assets, and sampling is not a claim of watching/listening to full motion. Generated Weave images/videos remain development references; implement the vocabulary as local procedural/interactive behavior, not runtime clip playback or generation per conversation turn.

The guard hashes protected voice/backend/schema, instruction/config and archived files without printing their contents. It refuses drift from its initial snapshot. It is an accidental-change check, not a tamper-proof permission system; Claude must not rewrite the baseline to conceal changes. Existing captures remain under `week3/docs/design/revisions/`.

`EVA_SCULPT_REVIEW_EVERY=3` is read/validated by the wrapper and used by the prompt's review protocol. It is **not a token, dollar or platform-enforced session cap**. Cloud usage/rate limits still apply; the VM may expire when idle, and background processes do not survive expiry. Resume with `session.sh prepare` when needed, then restart the preview. No automatic acceptance follows a successful run.

### Continue after reviewing a batch

Paste into the same Cloud session:

> Continue the next three-pass sculpting batch. Keep the state-changing/voice contracts unchanged and retain Week 1 eye identity. Keep: [specific features]. Change: [specific motion/material/form problems]. Prioritize reference [filename/moment]. Ask only genuinely unresolved artistic questions before a new direction. Before editing each pass, complete and inspect a fresh authorized Weave image/video generation packet using direct models or reusable workflows; stop UI work if it is unavailable. Then implement, capture, compare against that packet and critique each pass; show the strongest candidate after pass three and wait. No runtime-provider calls, commits, push, deployment or phase acceptance.

## Scope, compatibility and verification

Added tools live here; shared browser helpers add `EVA_BROWSER_CHANNEL` support without changing Windows/macOS's existing Chrome default. Linux defaults to bundled Chromium. `source:eye` now accepts a unique `EVA_CAPTURE_REVISION`, avoiding its prior fixed-directory collision. Vite remains loopback-only on 1430; voice/controller/backend code is not changed by this handoff.

The environment setup does not modify `.claude/settings.json`, register connections/hooks, reset routing or add an API SDK. The **owner's separate Weave policy update** does add repository reminder hooks in `scripts/agents/weave-reference-reminder.mjs` and project settings/agent guidance. Include that reviewed update in the Cloud snapshot and verify hook execution there. SessionStart/SubagentStart/PreToolUse reminders are not a tamper-proof blocker, cost authorization or proof of generated/inspected references; unsupported or absent hooks do not waive the policy. Existing setup/preflight/guard/test success likewise does not clear the Weave gate.

The earlier tooling checks are recorded in [VERIFICATION.md](VERIFICATION.md); they do not establish the new Weave integration. This four-deliverable alignment is documentation/bootstrap guidance, not a UI pass. No Figma connection change, upload, graph/frame write, generation, credit spend or Cloud hook execution is claimed. A fresh Linux Cloud provisioning run remains distinct from local syntax/link/consistency checks. If access or a required packet is blocked, report the exact missing prerequisite and pause UI work.

### Earlier alignment checks — 2026-09-28

The following checks describe the earlier graph-only handoff alignment, not verification of the subsequent direct-model/folder refinement. For that four-file update, setup-script `bash -n`, diff whitespace, six local link/anchor targets and exact agreement between the environment template and the README variable block passed. A native read-only `eva-reviewer` review found no blocking policy contradiction. Main environment: Astra; reviewer configured as `opus`, with its environment reporting Opus 4.8; no independent transport-log audit was performed for this review. Tools were file inspection/editing, Node, Git/Bash and the native Agent tool. No application tests were rerun for this documentation-only alignment, and no installer, authentication, upload, Weave run, Cloud deployment or credit spend occurred.

Official references checked for this handoff:
- [Cloud environments: variables, root Ubuntu setup, caching and tools](https://code.claude.com/docs/en/cloud-environments)
- [Claude Code in the cloud: branch/bundle transfer and session limits](https://code.claude.com/docs/en/claude-code-on-the-web)
