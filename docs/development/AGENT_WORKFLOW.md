# Astra in Claude Code with Ruflo coordination

Owner-requested development workflow, 2026-09-17. This refines PLANNING.md Section 16.1 only. It does not alter EVA's runtime providers, start another study phase, or accept a milestone.

## Components and routing

- **Model Gateway 0.51.2** (`model-gateway@eigenwise-toolshed`), project scope: local Anthropic-compatible transport to the ChatGPT subscription backend, with ordinary Claude requests forwarded to Anthropic. Proxy **0.1.40** was downloaded with its SHA-256 verified by the plugin.
- **Existing Ruflo core 0.1.0**, retained: its cached copy has agent/skill definitions but no MCP registration. The project `.mcp.json` fills that gap using the already-cached, pinned `@claude-flow/cli@3.16.3` stdio server. Its small Node launcher finds that exact installed version in npm's cache and imports the stdio entry point without a network install at startup. No global Ruflo update or initialization wizard was run.
- **Native project agents** in `.claude/agents/`: explicit model selection and scoped tools. These execute real work; Ruflo's agent records only coordinate it. Ruflo's installed `agent_spawn.model` schema accepts Claude aliases, not Astra IDs. Its `agent_execute` uses a separate API-key path, which this workflow does not use.
- **Higgsfield visual authoring**: the official HTTP MCP connection is registered in `.mcp.json`; the CLI account is authenticated. Claude Code's project approval and MCP sign-in are still required. See [connection status and activation](HIGGSFIELD_CLAUDE_CODE.md). The main session coordinates authoring and passes selected output to the UI worker.
- **SideQuest is not installed.** Automatic approval review rejected its enforced permission-bypass and automatic publishing behavior. The owner allowed retaining Ruflo, so this implementation uses Ruflo plus native routing instead.

| Task | Native agent / model | Intended reason |
| --- | --- | --- |
| Decomposition, architecture decisions, integration, difficult escalation | Main session: `claude-gpt-6-astra[1m]`, high | Owner-selected orchestrator |
| Substantial implementation, Rust/TypeScript integration, tests | `eva-implementer`: `claude-gpt-5.6-sol[1m]` | General coding worker |
| Exact mechanical or repetitive edits | `eva-mechanical`: `claude-gpt-5.6-luna[1m]` | Bounded low-complexity tasks |
| Current documentation and codebase research | `eva-researcher`: `claude-gpt-5.6-terra[1m]` | Read-only research worker |
| React layout, accessibility, interaction | `eva-ui-designer`: `sonnet` | Claude UI implementation route |
| Independent architecture/security review | `eva-reviewer`: `opus` | Read-only cross-provider review |

These are starting assignments, not a benchmark claiming each model is universally best. Claude aliases resolve through the installed CLI/gateway pins; record the concrete observed model. Fable or Kimi may be used only after their access and transport are verified. No silent fallback: report a route failure, retry once for a transient failure, then let Astra reassign the bounded task and disclose the changed model. Worker effort currently follows the session/provider translation; only the main session's `high` is explicitly configured.

`[1m]` selects Claude Code's larger client context behavior. It does not prove a one-million-token backend limit. Use `/context`; Gateway's advertised window and overflow handling are separate from OpenAI API model limits.

## First use and recovery

In PowerShell at the repository root:

```powershell
# Only needed if authentication is missing or expired:
node "$env:USERPROFILE/.claude/model-gateway/model-gateway.js" login
node "$env:USERPROFILE/.claude/model-gateway/model-gateway.js" setup

# Inspect actual readiness and advertised models:
node "$env:USERPROFILE/.claude/model-gateway/model-gateway.js" doctor
node "$env:USERPROFILE/.claude/model-gateway/model-gateway.js" models
node scripts/agents/check-ruflo.mjs

# Start a NEW Claude Code CLI process for this project:
./scripts/agents/start-astra.ps1
```

Complete the browser sign-in yourself. Authentication lives outside the repository. Gateway's setup writes `.claude/settings.local.json`, which is ignored; the shared default model lives in `.claude/settings.json`. Do not copy tokens from Codex, `.env.local`, or browser storage. A full Claude Code process restart is required after wiring/model-discovery changes; `/reload-plugins` alone is insufficient. Existing GPT/Claude processes are not stopped or changed by this setup.

If Claude Code requests trust for the project's `claude-flow` MCP server, review `.mcp.json` and approve that server. No blanket MCP permission allowlist or bypass mode is installed. The PowerShell session launcher targets this workstation. The MCP launcher supports the default Windows/Unix npm caches and `npm_config_cache`; if the pinned package is absent, run `npx --yes @claude-flow/cli@3.16.3 --version` explicitly to install it, then retry. It never silently upgrades or falls back to a different version.

A process-level `ANTHROPIC_BASE_URL` can override project wiring. Follow `doctor` diagnostics rather than overwriting unrelated global settings. Do not use Desktop model-picker workarounds; this workflow targets the Claude Code CLI. If Ruflo is upgraded to a plugin version that registers its own server, verify that server and remove the duplicate project registration as a separately reviewed change.

## How the orchestrator works

1. Read AGENTS.md, inspect git status, current scope, and acceptance records. Preserve the active objective across user corrections and questions.
2. For substantial tasks, assign independent work to the narrowest `eva-*` agent. Include objective, owned files, source revision, accepted baseline or none, constraints, acceptance criteria, and checks. At most three workers run concurrently. Simple known edits can remain inline.
3. Ruflo tools discovered through ToolSearch (`mcp__claude-flow__*`) can track a bounded swarm and return routing advice. Do not run initialization/reset commands or write project content to shared memory automatically. `hooks_route` does not override the explicit project model map. Never claim a worker ran based on `agent_spawn` alone.
4. Launch the corresponding native Agent by its project name without a per-call model override. That preserves the definition's model. Do not set `CLAUDE_CODE_SUBAGENT_MODEL`: older installed CLI versions can override explicit agent fields with that variable. If it is set externally, report the conflict before claiming route verification.
5. Writers use isolated worktrees. A worktree does not include uncommitted shared edits; pass required context explicitly and do not create an unsolicited checkpoint commit. If work depends on another session's uncommitted changes, coordinate ownership and integration first. No two writers own the same file. Read-only reviews require a stable candidate.
6. Keep normal permission prompts. No automatic commits, pushes, merges, branch switching in the shared checkout, or owner acceptance. Do not enable `bypassPermissions` to make a plugin work. Inspect actual diffs and relevant checks before integrating authorized changes.
7. Record configured and observed model identities separately. Gateway route metadata is in `~/.claude/model-gateway/logs/request-routes.jsonl`; inspect only needed fields, never credentials or raw private transcripts. Return evidence and limitations, not a model's self-identification as proof.

## Owner smoke exercise

After restarting, check `/model`, `/context`, `/agents`, and `/mcp`. Astra should be selected, the five `eva-*` agents should be listed, and `claude-flow` should connect. Then request:

> Keep this read-only. Use eva-researcher to identify the current phase gate in AGENTS.md, then eva-reviewer to check that finding. Report actual routes and evidence. Do not edit, commit, write memories, or start product work.

Expected: an Astra main session, a Terra research request, and an Anthropic Opus review request, with no file changes. A successful handshake/catalog alone does not prove model access or orchestration. See the verification record below for checks actually executed during setup.

## Rollback

To stop choosing Astra by default, remove only `model` and `effortLevel` introduced by this change from project settings, or select a working Claude model. Gateway's `env --remove` removes its wiring; run it from this project and inspect the diff. Disable the project Gateway plugin with `claude plugin disable model-gateway@eigenwise-toolshed --scope project`, then restart. Leave shared gateway processes alone if another project uses them. Remove the project MCP entry and `eva-*` files only if retiring this workflow; keep the existing global Ruflo install and unrelated settings intact.

## Sources

- [Requested Reddit workflow](https://www.reddit.com/r/ClaudeAI/comments/1wafqz0/why_using_astra_inside_claude_code_is_the_new/)
- [Model Gateway source and setup](https://github.com/Eigenwise/eigenwise-toolshed/tree/main/plugins/model-gateway)
- [Claude Code native subagent model selection](https://code.claude.com/docs/en/sub-agents)
- [Ruflo upstream](https://github.com/ruvnet/ruflo) (local installed source was inspected; current upstream differs)
- [OpenAI Astra model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra)

## Setup verification

Verified on Windows with Claude Code **2.1.212**, Node **24.14.0**, Gateway **0.51.2**, proxy **0.1.40**, and cached Ruflo CLI package **3.16.3**. Base repository revision was `9cb84746d97e0d5f1a441c196cfb05a3ed235d18`; these workflow changes remain uncommitted. Other-session research files were left untouched.

| Check | Actual result |
| --- | --- |
| Proxy download | SHA-256 verified by upstream setup |
| Browser sign-in and project wiring | Passed; credentials stored outside repository; private local settings ignored |
| Gateway doctor as the owning Windows user | Authenticated; Codex ready; live shim policy and discovery cache agree; project-only wiring |
| Astra real inference | `EVA_ASTRA_GATEWAY_OK`; CLI reports `claude-gpt-6-astra[1m]` |
| Project default, no model/effort override | `EVA_DEFAULT_ASTRA_OK`; CLI reports `claude-gpt-6-astra[1m]` |
| Native delegation from Astra | Terra and Opus returned their markers; CLI modelUsage includes Astra, `claude-gpt-5.6-terra[1m]`, and `claude-opus-4-8[1m]`; workers made no tool calls |
| Native Sol agent definition | `EVA_SOL_ROUTE_OK`; CLI reports `claude-gpt-5.6-sol[1m]` |
| Native Luna agent definition | `EVA_LUNA_ROUTE_OK`; CLI reports `claude-gpt-5.6-luna[1m]` |
| Native Sonnet agent definition | `EVA_SONNET_ROUTE_OK`; CLI reports `claude-sonnet-5[1m]` |
| Gateway route metadata | Confirms Codex Astra/Terra/Sol/Luna routes and Anthropic Opus 4.8/Sonnet 5 routes |
| Ruflo MCP initialize + tools/list | Passed; 317 tools, including hooks_route, swarm_init, swarm_status, agent_spawn, memory_search |
| Ruflo server identity | MCP self-reports 3.0.0 although inspected npm package is 3.16.3; do not conflate protocol identity with package version |
| Claude Code MCP registration | Recognized as project scope; its first-use trust approval remains pending in the interactive CLI |
| Script syntax and diff whitespace | Node syntax, PowerShell parser, and `git diff --check` passed |

Route-specific inference tests used low effort; the final default-setting test omitted model/effort overrides. Tests disabled silent fallback for the test process; normal sessions retain the configured high effort. CLI token/cost estimates are not a subscription invoice or performance benchmark. Successful native-delegation session: `8d8ef1c2-b3f9-447a-9475-32c746e7c0de`. Marker-only tests establish routing and access, not the quality of substantive implementation, worktree integration, or research.

Earlier checks and corrections: a sandboxed doctor could not see the owning user's credentials/processes; rerunning as that user passed. The first delegation harness exposed only Agent, so Claude Code correctly refused worker definitions whose read tools were unavailable; the corrected harness included the read-only tools and passed. `npx`-based MCP startup exceeded the 30-second check; direct import of the existing pinned package passed in the sandbox. No routing fallback, permission bypass, repository commit, or publishing was used to make the successful tests pass.

Owner exercise/acceptance remains pending. No product tests, UI captures, full writer-worktree lifecycle, or end-to-end Ruflo swarm execution were run; application code was unchanged. Restart Claude Code and approve the specific project MCP connection when its trust prompt appears to complete interactive activation.
