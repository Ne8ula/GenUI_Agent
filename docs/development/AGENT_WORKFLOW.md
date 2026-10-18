# Development workflow

Retained owner preference: Astra orchestrates Claude Code through existing Model Gateway; Ruflo supplies optional coordination. This is separate from EVA's runtime and study conditions.

Read [AGENTS.md](../../AGENTS.md) and [current scope](../../PLANNING.md). Existing definitions/settings and `scripts/agents/` remain. Configured aliases are not proof of current access/execution.

Astra owns decomposition/integration/verification. Existing definitions assign implementation to Sol, mechanical tasks to Luna, research to Terra, UI to Sonnet and independent review to Opus. Use available authorized routes and disclose substitutions; other harnesses must not pretend to invoke Claude-native definitions.

Delegate independent substantive work with owned files, inputs, source revision, baseline or none, criteria and output. At most three workers; one writer per overlapping file. Parallel writers use isolated worktrees; read-only audits may share a checkout.

Ruflo routing is advisory; records do not prove inference. Invoke actual workers and distinguish configured from observed model identity. Retry once only for a transient route failure; otherwise report/reassign. Kimi remains an external handoff until a working authorized adapter is verified.

## Existing tooling and handoff

`scripts/agents/start-astra.ps1` launches the configured local workflow; `check-ruflo.mjs` checks coordination. Inspect contracts/diagnostics before use. Do not install routers, initialize/reset configuration, overwrite auth or stop shared services to complete ordinary work.

No bypassPermissions, automatic commit/push/merge, silent model override or API-key detour. Local credentials do not establish Cloud readiness.

Report task/phase/source revision; actual agent/model/tools; changed files; inputs/baseline; decisions; checks/evidence; limitations; next owner exercise.

Every UI writer obeys the [fresh Weave gate](../design/FIGMA_WEAVE.md). A coordinator may supply the current scoped packet to Cloud without credentials or a new allowance. Old unattended Cloud prompts are retired. Historical setup/version evidence is in [Git recovery](../HISTORY.md), not asserted as current.
