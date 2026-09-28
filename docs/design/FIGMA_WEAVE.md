# Figma Weave authoring workflow

Owner decision: 2026-09-28. Figma Weave replaces Higgsfield for future **development-time visual authoring** because the owner reports greater familiarity, available credits and an expectation of better output. This is a tool preference, not a measured quality comparison, generation allowance, runtime-provider change or phase acceptance.

Follow [AGENTS.md](../../AGENTS.md), [DESIGN.md](../../DESIGN.md) and the active phase. Week 3 uses its explicitly authorized [design direction](../../week3/DESIGN.md) and [plan](../../week3/PLANNING.md). Preserve Week 1/2 and historical Higgsfield/Weave outputs. ComfyUI's separate S3-after-explicit-S2-acceptance gate is unchanged.

## Mandatory prerequisite for every UI change

Owner refinement, 2026-09-28: **Weave generation is required, not optional, before every frontend/UI change, redesign, reimplementation or new visual iteration.** This applies to all development agents/models and environments: local Claude Code, Claude Cloud, Astra, native workers and any other contributor. It includes layout, styling, components, graphics, motion, interaction presentation and frontend reimplementation even when intended to preserve appearance. Documentation-only and unrelated non-UI/backend work do not trigger generation. No agent may invent a small-change, mechanical-change or deadline exception; only an explicit owner exception can waive the step.

Required sequence for each bounded change/pass (owner-approved clarification, 2026-09-28): **direct Weave model calls OR reusable Weave workflows both satisfy the generation route.** The earlier graph-only restriction is superseded. No manual graph-building is required for each design task.

1. Define the exact UI change, current before-state, constraints, affected states and reference questions.
2. Generate fresh task-specific image references through either approved Weave route. Generate video references as well for animation, transitions, choreography or temporal interaction changes. A new UI direction/pass needs a new run; individual file saves within the same documented pass do not each need another generation.
3. Retrieve and **inspect the actual images and motion**, not just filenames, prompts or a successful job status. If video playback is unavailable, inspect temporal samples and record the timing limitation; if the required motion cannot be evaluated, stop rather than claiming review.
4. Before implementation, record a reference packet with: change/pass ID and source revision; brief; route (`direct-model` or `workflow`); actual model ID, or tool/recipe ID and version with nodes/models where exposed; exact inputs/settings; real prediction/run IDs; cost approval/result; retained local image/video paths; inspection observations; selected reference and extracted geometry/material/timing rules; owned UI files; and known deviations. Selection by the agent is not owner acceptance. Do not fabricate a packet to clear this gate.
5. Give that packet to every UI writer, including a delegated design agent. Each writer must inspect the selected outputs before editing, implement against them, and compare matching application captures/motion afterward. Old archival references, a text brief, Figma frame sync or screenshots of the existing app alone do not satisfy fresh Weave generation. Direct generation through another provider is not the approved direct-Weave route.

If Weave access, a usable model or workflow, required cost approval, generation or inspectable output is missing, **pause frontend/UI edits and request the missing prerequisite**. Do not proceed with procedural-only visual design or another provider. Independent non-UI work may continue. This requirement does not grant an unlimited credit allowance: keep the tool's explicit per-run cost confirmation, including reruns and default-input confirmation; never auto-run generation from a hook.

For Cloud or a worker without Weave access, the connected main session may generate the current task's packet and hand off retained outputs/provenance through an authorized channel. The receiving worker must inspect it; the next distinct visual pass needs another packet. Do not copy workstation credentials, silently add Cloud connections or claim local OAuth works in Cloud. The policy applies everywhere, but uncommitted local configuration does not propagate to an existing remote checkout.

The project `.claude/settings.json` installs SessionStart, SubagentStart and pre-edit/shell/delegation **reminder hooks** using `scripts/agents/weave-reference-reminder.mjs`. They inject this prerequisite without uploading data, spending credits or changing tool permissions. They are not a tamper-proof blocker or verification that references were generated/viewed; agents must obey the gate and disclose missing hook support. Non-Claude harnesses must follow AGENTS.md and include the same prerequisite in their handoffs. Open `/hooks` or restart to reload if needed; Cloud hook execution must be verified in that environment, not inferred from a local check.

## Two different connections

| Connection | Purpose | Boundary |
| --- | --- | --- |
| Figma node inside a Weave workflow | Bind text/image inputs to layers of a Figma frame and send results back to Figma | Requires linked account and edit access; connecting can write to a real design file |
| Official Figma MCP connection | External agents discover and run Weave models directly, or inspect/run existing Weave tools | Does not create or edit Weave workflow graphs; no separate Weave MCP server is required |

The Figma node is not an npm/Node.js package or a replacement MCP endpoint, and frame sync is not required for reference generation. Graph authoring is needed only when choosing to create/change a reusable workflow; it is not a prerequisite for direct model generation. A Figma Design connection alone does not prove model access, usable tools or credits.

## Choose a generation route

- **Direct model (default for a new one-off design task):** `weave_find_model` discovers the actual model and input contract. Supply the requested inputs to `weave_run_model` without `acknowledgedCost` to obtain the quote. Show the quoted cost and get explicit structured Approve/Cancel for every run, including reruns; only then pass the quoted `acknowledgedCost`. Retrieve the result with `weave_get_model_run_output`. Inspect available image/video capability rather than guessing a model ID or required input. No graph needs to be authored.
- **Reusable workflow:** inspect a provided tool/flow URL with `weave_get_tool_inputs`, or discover tools with `weave_list_tools`. Use its returned version, inputs and defaults with `weave_run_tool`. Quote first, explain auto-filled values and obtain explicit structured cost approval before running; retrieve with `weave_get_tool_run_output`. Reuse a suitable existing graph with new inputs. Create/edit a graph in Weave only when that reusable pipeline is actually needed, not for every task.

Both routes require the same fresh reference packet, actual inspection, privacy and spending gates. An empty tool listing blocks only that workflow route, not an otherwise available direct-model route. Graph-tool cancellation support must not be assumed for direct-model jobs; follow the actual exposed controls and report limits.

## Connect this workstation

1. In Weave, open **Settings → Profile → Linked accounts** and connect the intended Figma account. The official external-agent article lists Starter, Pro, Team or Enterprise as required Weave plans. Confirm the intended active workspace; MCP sees tools in that workspace.
2. Reuse the **already installed official Figma plugin** in Claude Code, exposed in this session as `plugin:figma:figma`. Complete its OAuth in the browser using the intended Figma account; use `/mcp` to inspect/authenticate the connection in an interactive session. Credentials stay in the client's credential storage, never in this repository.
3. After OAuth, discover the actual Figma tool catalog. Perform only read-only checks: discover a suitable direct model and its contract, or inspect a selected reusable tool's requirements and output types. Record actual tool names from discovery, not guessed API names.
4. If no reusable tools are listed, direct Weave model discovery is still an approved route; manual graph creation is not required. If neither route is accessible, verify linked account, eligible plan and active workspace. Do not infer working generation from the plugin name or silently install another connector.
5. Before an end-to-end run, establish the exact synthetic inputs, destination, output count and finite credit budget with the owner. Setup alone authorizes no uploads, frame writes, generation or public sharing.

Figma's official remote endpoint is `https://mcp.figma.com/mcp`. There is **no second project Figma entry** in `.mcp.json`, because the installed plugin supplies that route. The retired `higgsfield` entry was removed while preserving `claude-flow`. Restart the project session to retire an already loaded Higgsfield connection; do not kill other sessions or uninstall global tools. The previous CLI installation/authentication was not revoked.

For a different checkout **without** the plugin, the official manual alternative is `claude mcp add --transport http figma https://mcp.figma.com/mcp`, followed by restart and `/mcp` authentication. Choose one route; do not run this as an additional setup step on the workstation above. No separate Weave endpoint, API key, CLI or runtime SDK is established by this guide.

## Connect the Figma node

These are documented steps, not an executed frame-sync test:

1. Use a deliberately selected development frame in a Figma file you can edit. Link the Figma account as above.
2. Copy the frame in Figma and paste it into a Weave workflow. Pasting alone does not modify the source file.
3. Choose **Add Input**, or **+** beside Inputs in the side panel. Select **Text** or **Image** and bind it to the intended layer within the frame. Connect the corresponding Weave text/image node; do not assume video, 3D or arbitrary layer properties are supported by this node.
4. Click **Connect** and choose the original Figma file or a new one. Confirm the destination before doing this: subsequent Weave changes automatically push to Figma. Prefer a development copy when the source is an accepted design.
5. Edits made directly in Figma, including moved layers, require **Update** in Weave to pull them in. Do not describe this as automatic two-way live sync.

The official Figma blog previewed the node on 2026-06-24. Current help material documents its use; an exact 2026-09-28 release date was not independently verified.

## Agent capabilities and spending

The official Weave external-agent article describes listing own/shared tools, inspecting inputs, uploading image/video/audio/3D inputs, running tools, checking progress/results and cancelling runs. These are documented capabilities, not a live-account verification. **Creating or editing workflows through MCP is unsupported.** Upload support also does not establish Figma-node layer support or editable source export.

MCP runs consume **Weave credits, not Figma AI credits**. The article describes cost confirmation for paid runs and a warning where dynamic cost cannot be quoted. EVA's authoring policy still requires an explicit finite allowance; free runs are not permission to upload private data, modify a design or publish. For unquotable dynamic costs, obtain a separate bounded authorization or use a quotable tool instead. Do not inherit an old E1 or voice allowance, claim cancellation refunds credits, or retry a timed-out submission before checking whether it created a run.

## Repeatable authoring and implementation

1. **Brief:** inspect the active guide, owner feedback and actual references. Specify one design question, fixed identity/fixture constraints, deliverables, destination and iteration/credit ceiling. Use synthetic or explicitly cleared inputs only; no private microphone recordings, screenshots, vault data or credentials.
2. **Select a route:** use a direct Weave model for a one-off task, or reuse a suitable published workflow with new inputs. No manual graph-building is required per task. For Week 3, explore one eye identity across the five response grammars, structural variation, processing trails, tracking boxes and interruption. Follow Week 3's reference refinements rather than the archived weather brief.
3. **Inspect before running:** verify actual nodes/models, input/output contracts and cost. Coordinate from the main session. Run through either the UI or MCP, never both for the same request. No community publishing or expanded sharing is required for this repository workflow; ask before changing visibility.
4. **Retrieve and review:** retain candidates, including rejected alternatives. Record actual tool/workflow/model identifiers where exposed, inputs/settings, run IDs, output format and cost. Inspect exports before claiming editable layers, alpha, motion fidelity, code or licensing. Keep credentials and expiring authenticated URLs out of public evidence. A generated bitmap/movie is a reference, not proof of live behavior.
5. **Extract rules:** document tokens, primitives, spatial anchors, bounded parameters, motion phases, intervention events, continuity and reduced-motion equivalents. Rebuild factual text from approved data. Give the selected output and bounded contract to the native UI worker.
6. **Implement locally:** reviewed React/TypeScript and authored renderer code implement the vocabulary. Runtime models continue to emit bounded validated data, not executable HTML/JS/CSS/shaders or authority. Week 3 stays procedural and interruptible, not a sequence of generated video clips or network generation per turn.
7. **Verify:** capture matching before/after fixtures, representative stills and motion for timing changes. Test keyboard/focus, reduced effects, interruption, continuity, failure and no-media behavior. Provider cancellation is not proof that billing/processing stopped; discard stale results and do not attach them to superseded work.
8. **Review:** retain explicit owner acceptance gates. Missing Weave access blocks frontend/UI work; prepare briefs or arrange a current authorized reference-packet handoff while continuing only unrelated non-UI work. Never substitute Higgsfield, ComfyUI or procedural-only visual design.

## Review folders and quick navigation

For each new change/pass use one revision folder, e.g. `week3/docs/design/revisions/w3-YYYYMMDD-comfort-p1/`. Use descriptive, unique IDs; never overwrite or reorganize historical revisions merely to match this convention.

```text
<revision-id>/
├── REVIEW.md                    # Start here: status, selected assets, comparison
├── references/
│   ├── contact-sheet.png        # Labeled thumbnails of actual generated candidates
│   ├── images/                  # img-01-soft-fold.png, img-02-open-fold.png, ...
│   └── videos/                  # vid-01-soft-fold.mp4, ...
├── implementation/
│   ├── before/                  # Actual app captures before edits
│   └── after/                   # Actual app captures after edits
└── provenance.json              # Route, inputs, IDs, cost, inspection and checks
```

Start from [the review-folder template](templates/weave-review/REVIEW.md) and [provenance template](templates/weave-review/provenance.json). The template directories are empty and marked as such; they are not candidates or evidence. Create a contact sheet only from real generated images, labeled with filenames and selection status. Link every candidate/video directly from REVIEW.md; mark selected/rejected/unreviewed there rather than making duplicate asset copies. Preserve rejected candidates. Link before/after captures side by side, recording matching viewport/DPI and any motion-playback limits. Keep native capture-tool outputs in their original immutable location when a tool fixes its destination, and link those actual files from REVIEW.md instead of moving/duplicating them or pretending the planned path exists.

Put **status, contact sheet, selected images and video links at the top** so the owner can review immediately. Record source constraints and implementation guidance below. Keep `reference selection` separate from `owner acceptance`, which starts pending. No fake thumbnail, cost, run ID, inspected status or placeholder success result. `provenance.json` holds `direct-model` or `workflow`, actual IDs/version where exposed, settings, per-run approval/cost, asset paths, inspection and checks; unused or unverified fields stay null/empty, never invented. Do not store credentials, private source URLs or expiring authenticated links.

New Week 3 evidence belongs under `week3/docs/design/revisions/<revision-id>/`; other future phase evidence follows the root `docs/design/revisions/<revision-id>/` convention. Use the [manifest contract](../../DESIGN.md#11-evidence-and-acceptance). Add a direct link to each actual candidate's REVIEW.md in the phase's design INDEX.md with a plain status (references ready, implementation ready, blocked, rejected, accepted only by owner). Update only when actual candidates exist; no fabricated current review row. The [Week 2 Weave exports](../../week2/weave/README.md) are historical examples, not current capability evidence or acceptance.

## Connection check — 2026-09-28

- Official Figma remote-server installation page and Figma integration blog retrieved with WebFetch. Official Weave help pages returned HTTP 403 to WebFetch; the steps and limitations above were checked through indexed official-source WebSearch results, not authenticated full-page inspection.
- Initial OAuth initiation was followed by live Weave tool discovery: `weave_list_tools` succeeded and returned `{"tools":[],"totalCount":0}`. The connection is callable, but no runnable tool was listed in the active workspace. No workflow inputs, account plan or generation capability were verified by that empty result. A provided tool/flow URL can be inspected directly with `weave_get_tool_inputs`; `weave_run_tool` runs the published node workflow only after required cost confirmation. The connected catalog also offers `weave_find_model`, `weave_run_model` and `weave_get_model_run_output`; this establishes the direct-model tool surface, not a successful generation. The owner-provided flow was inspected with `weave_get_tool_inputs` and returned version 1 with empty inputs/outputs; that does not prove an empty graph or block the direct-model route.
- Follow-up mandatory-gate checks passed: reminder script syntax, piped SessionStart/SubagentStart/PreToolUse payloads through the exact configured shell commands, preserved pre-existing project settings, 25 new/changed local link targets, gate anchors and diff whitespace. Actual PreToolUse context was observed on Edit and Bash in this local session. SessionStart/SubagentStart were pipe-tested, not observed in a fresh session/worker; Cloud execution remains untested. No application tests were needed or run for this policy/hook change.
- Chrome extension reported not connected. No account settings or frame sync were inspected through the browser.
- Local checks passed: `git diff --check`; MCP JSON parsing and exact comparison to the prior configuration minus only Higgsfield; 23 new/changed local link targets plus the manifest heading; archive/application-file preservation. Git emitted line-ending normalization warnings, not whitespace errors. Application tests were not run for this documentation/configuration change.
- No uploaded assets, frame writes, tool runs, generated media, credit spend, public publishing or application changes occurred during this switch. No new visual baseline or product/study acceptance is recorded.
- Main session: harness identifies Astra (`claude-gpt-6-astra[1m]`); native `eva-researcher` performed a read-only repository audit, configured as Terra (`claude-gpt-5.6-terra[1m]`), using Read/Glob/Grep. These are configured identities; independent transport attribution for this invocation is not established here. Ruflo `hooks_route` was advisory; no Ruflo inference worker was used.

Next owner exercise: select the next specific UI change. Discover a suitable direct Weave model (no manual graph required), or reuse an available tool if preferable; inspect the contract, obtain cost approval and generate/inspect the first change-specific reference packet before UI edits. This policy/folder update itself runs no generation.

## Approved route/folder reconciliation — 2026-09-28

The owner approved workflow updates, not generation. Active root guidance, all five native-agent instructions, the reminder script and Cloud guidance now allow direct Weave models OR reusable workflows. The newer Cloud bootstrap/environment guidance was preserved with only conflicting route/path prose reconciled; no provisioning was run. Added an empty categorized review template and index navigation without inventing a candidate or changing historical assets.

Executed checks passed: reminder Node syntax; Cloud setup `bash -n`; `git diff --check`; exact configured shell commands for SessionStart/SubagentStart/PreToolUse with both routes and review layout; unchanged pre-existing settings and agent frontmatter; 36 added/changed local link targets and gate anchors; template JSON, four empty categorized folders and no fake media/run records; Cloud environment-example/README agreement; untouched Week 1/2 and app source. The revised PreToolUse reminder was observed on local tool calls. Cloud hook execution and actual generation remain untested; no unrelated app tests, spend, commit or publishing occurred. Astra integrated; the native Terra-configured read-only researcher audited agent/Cloud conflicts with Read/Glob/Grep; no new independent transport attribution is claimed.

## Official sources

- [Figma node](https://help.weavy.ai/en/articles/16440592-figma-node) — frame import, Text/Image inputs, Connect and manual Update.
- [Running Weave tools from external agents (MCP)](https://help.weavy.ai/en/articles/16202764-running-weave-tools-from-external-agents-mcp) — account linking, plans/workspace, capabilities, credits and graph-editing limitation.
- [Figma remote MCP installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/) — official endpoint, plugin/manual routes and OAuth.
- [Connecting Figma and Weave](https://www.figma.com/blog/connecting-figma-and-weave/) — 2026-06-24 preview; historical announcement, not current sync semantics or MCP pricing.
