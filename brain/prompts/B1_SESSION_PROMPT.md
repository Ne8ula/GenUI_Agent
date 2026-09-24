# New-session prompt — EVA Brain, Stage B0 + B1 (Opus 5.5)

Set up the isolated EVA Brain workspace (Stage B0), then implement Stage B1: contracts and provenance labels. Build it; don't write another plan. Stop when B1 is committed and pushed. Do **not** start B2.

## Start here

1. Confirm this session's model is **`claude-opus-5-5`**. The owner selected Opus 5.5 to implement B1. The project default in `.claude/settings.json` is Astra, so if `/model` shows anything else, stop and tell the owner to run `/model claude-opus-5-5`. Record the observed model in your report.
2. Follow `CLAUDE.md`, `AGENTS.md` and `docs/development/AGENT_WORKFLOW.md` (loaded automatically).
3. Read `brain/PLANNING.md` in full. Sections 2–4, Stage B0, Stage B1, Section 6 and Section 9 are the contract for this session. Also read PLANNING.md §6.4, §7.2–7.3, §7.7, §8.1–8.3, §8.5, §9.2, §9.4, §9.7 and §13.3; the B1 schemas encode them.
4. Run `git status` in the shared checkout. Astra (GPT-6) has uncommitted Week 2 / E1 work there. Treat all of it as another session's work: never edit, stage, stash, reset, clean or commit it, and never switch the shared checkout's branch.

## Owner decisions already made (2026-09-24)

Don't re-ask these. Copy them into `brain/docs/decisions.md` during B0.

- **D1** The brain is an independent development track, not S2, and doesn't wait for E1 acceptance. Only B9 waits for Astra.
- **D2** Scope: orchestration + memory + personality. No UI, voice, tools or embeddings.
- **D3** Memory-saving rules are written in TypeScript for now (B4), with a later Rust migration verified against shared fixtures. No real vault is written until then.
- **D4** The GitHub repository is **public**. Every push publishes immediately.
- **D5** No automatic advance: stop after each stage for owner review. This prompt commissions B0 (setup) and B1 together, as two separate commits, and stops after B1.
- **D6** No Anthropic API key yet. Make no model API calls of any kind.
- **Git authorization:** the owner asked for each brain commit to be pushed to a separate `brain` branch on GitHub. You may commit and push **only** on branch `brain`, only from the brain worktree, never with `--force`, never amending a pushed commit. Don't touch `main`, merge, rebase or open a PR.
- **Route:** Opus 5.5 (this session) implements B1 directly, instead of the default `eva-implementer`. The read-only reviewers in the verification step keep their definitions.

## Part 1 — Stage B0: worktree and scaffold

Skip any step that's already done, and verify it instead.

1. `git fetch origin`. If a local or remote `brain` branch already exists, stop and report; don't reuse or overwrite it.
2. Create the worktree from the current `main` (record its SHA; it was `cb7ac83`, equal to `origin/main`, when this prompt was written):
   `git worktree add .claude/worktrees/brain -b brain main`.
   `.claude/worktrees/` is gitignored, so it won't appear in the shared checkout's status.
3. Copy the untracked `brain/` folder from the shared checkout (`PLANNING.md`, `prompts/`) into `<worktree>/brain/`. Verify every copy with SHA-256. Don't delete the originals yet.
4. Scaffold `<worktree>/brain/` as described in PLANNING Section 4:
   - `package.json`: `"name": "@eva/brain"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=24.14.0" }`. Scripts:
     - `generate:validators` and `generate:validators:check`
     - `typecheck` (`tsc --noEmit`)
     - `test` (`node --test` over `tests/**/*.test.ts`)
     - `check`, which runs the validator check, then typecheck, then tests.
   - Dependencies: `ajv` (match E1's `^8.20.0`); devDependency `typescript` (match E1's `~6.0.3`). Add nothing else in B0/B1. Commit the lockfile.
   - `tsconfig.json`: `strict`, `noEmit`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `module`/`moduleResolution` `nodenext`, `noUncheckedIndexedAccess`. Node 24 runs the `.ts` sources directly through type stripping, so use no enums, namespaces or parameter properties.
   - `brain/docs/decisions.md` with D1–D6, the git authorization, the B1 route, and the base SHA.
   - `brain/docs/acceptance/brain.md`: status **pending**, following the AGENTS.md acceptance-record fields. Nothing is accepted.
   - A minimal smoke test so `npm run check` is meaningful.
5. `npm install`, then `npm run check`. It must pass.
6. **Visibility check.** `gh` isn't installed. Run an unauthenticated `curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/Ne8ula/GenUI_Agent`: 200 means public. If it isn't 200, stop before pushing and report, because it contradicts D4.
7. Run the pre-push gate below, then commit `brain(B0): scaffold brain workspace and move plan` and push with `git push -u origin brain`.
8. Only after the push succeeds, and after confirming `git -C <worktree> show HEAD:brain/PLANNING.md` hashes identically to the original, delete the untracked originals from the shared checkout's `brain/` folder. That's the only change you make to the shared checkout.

## Part 2 — Stage B1: contracts and provenance

All B1 work goes in the worktree, within these owned paths: `brain/schemas/**`, `brain/src/contracts/**`, `brain/src/provenance/**`, `brain/scripts/**`, `brain/tests/**`, `brain/fixtures/contracts/**`, plus `brain/docs/decisions.md`.

### Schemas

JSON Schema Draft 2020-12. Use `$id` values of the form `https://eva.local/schemas/brain/<name>.schema.json`, matching E1's convention. **Every object is closed** (`additionalProperties: false`, or `unevaluatedProperties: false` where composition requires it). Put shared definitions in `common.schema.json`. Required schemas:

| Schema | Must encode |
| --- | --- |
| `common` | ID patterns, RFC 3339 timestamps, integrity labels (`direct_user`, `trusted_policy`, `verified_local`, `verified_tool`, `untrusted_external`, `untrusted_generated`, `quarantined`), confidentiality labels (`public`, `private`, `sensitive`, `secret`), label pair, lineage entry, source reference |
| `context-item` | Origin, source ref, labels, lineage, freshness/expiry, content |
| `artifact-envelope` | Every §6.4 field: ID, type, schema version, task/plan/run/producer IDs, content hash, version, labels, citations, lineage, validation/verification state, created/expiry/supersedes, deadline/resource usage, parent/dependency IDs |
| `revision-event` | §7.7: `revisionId`, `sequence`, `status` (`provisional`, `verified`, `corrected`, `revoked`, `stale`), `supersedes`, `sourceRefs`, `confidence` in [0,1], `expiresAt`, plus a `generation` token for late-result rejection |
| `routing-contract` | §7.3: hard and preferred deadlines, quality tier, risk ceiling, privacy constraints, token/cost budgets, cancellation/fallback behaviour, provisional-display flag, tools/specialists-permitted flags |
| `model-request`, `model-response`, `model-stream-event` | §7.2 normalized shape: logical route and model ID as data, messages with labelled parts, structured-output schema ref, usage, refusal, error, stop reason. Provider-neutral: no provider-specific fields at the top level |
| `memory-node` | §9.4 frontmatter: stable ID, type (§9.2 categories), subject, claim, origin artifact/revision IDs, labels, source ref and quote/event pointer, created/updated, valid-from/until, confidence, `explicit`/`inferred`, sensitivity, review state, supersedes/contradicted-by, tags, persona version |
| `episode-record` | Append-only conversation event with synthetic IDs, direct-user vs other origin, labels, timestamp |
| `memory-candidate` | A proposal only. It must **not** be able to carry a review decision, a durable-write flag, or a raised integrity label. Separate the model-proposed fields from the host-owned fields in the schema |
| `review-decision` | `accept` / `edit` / `reject` / `make-temporary`, the reviewer (the user), the candidate ID, timestamp, and an optional edited claim |
| `persona-identity`, `persona-style` | The `persona.yaml` and `style-state.yaml` shapes from §8.1–8.3. Style values are bounded numbers or enums, not free text; a sarcasm level must exist so later stages can suppress it |
| `session-affect` | Expressive intention in `attend` / `invite-comparison` / `reconsider` / `settle`, intensity in [0,1], a required `expiresAt`, and origin. No PAD/Plutchik fields (Investigate only, per the transfer audit) |
| `persona-packet` | Compiled output: persona version, content hash, layer hashes, register constraints, sarcasm-suppression flag and reason. Only the narrator receives it |
| `trace-event` | Synthetic IDs only: route, observed model, persona hash, cited node IDs, revision IDs, timings, outcome. No raw prompt or response text fields |

### Validators and types

- `brain/scripts/generate-validators.mjs` generates standalone Ajv 2020 validators plus `.d.ts` into `brain/src/contracts/generated/`, with a `--check` mode that fails on drift. Read `experiments/e1/scripts/generate-validators.mjs` **as a reference only**: copy the approach, but don't import it or edit anything in E1.
- `brain/src/contracts/index.ts` exports the validators and hand-written TS types that match the schemas. Add one test asserting that a type-shaped fixture passes its validator, so the types and schemas can't silently drift.

### Provenance module

`brain/src/provenance/labels.ts`, as pure functions with no I/O:

- An explicit integrity order and confidentiality order. Document the chosen integrity order and its rationale in `decisions.md`. `quarantined` is absorbing.
- `join(inputs)`: the output's integrity is at most the lowest input integrity, and its confidentiality is at least the highest input confidentiality.
- `deriveModelOutput(inputs)`: model-produced content is never above `untrusted_generated`, and its confidentiality is at least the highest input confidentiality.
- Lineage is append-only: a transform can add entries but never remove or reorder existing ones.
- Any attempt to raise integrity or lower confidentiality returns a typed rejection, not a silent clamp.

### B1 acceptance criteria (from the plan)

- Each schema has ≥1 valid and ≥2 invalid fixtures in `brain/fixtures/contracts/<schema>/{valid,invalid}/`. At least one invalid fixture per schema adds an unknown field, and for label-bearing schemas an unknown authority or label field.
- `memory-candidate` invalid fixtures include a candidate that sets its own review decision, and one that claims `direct_user` or `trusted_policy` integrity.
- Tests prove that model-sourced items can't upgrade integrity or downgrade confidentiality through `join` or `deriveModelOutput`, that `quarantined` absorbs, and that lineage is append-only.
- `npm run generate:validators:check` detects a changed schema. Test this by generating against a modified copy in a temp directory, never by editing the real schema.
- All fixtures are fictional and public-safe: no real names, paths, emails, keys or vault content.

## Verification

1. Run `npm run check` yourself in the worktree and read the output.
2. Launch two read-only reviewers **in parallel** with the Agent tool, using the project agent names and **no model override**:
   - `eva-reviewer`: review `git -C <worktree> diff <B0 commit>` for authority/label escalation paths, schema openness, provenance propagation, memory-candidate self-approval, and public-repo hygiene. Concrete defects only, each with file and line.
   - `eva-researcher`: check each B1 acceptance criterion above against the code and tests, one by one, and mark each as met or unmet with evidence.
3. Fix blockers and majors, then rerun checks and both reviews. Stop after **three** rounds. If blockers remain, don't commit B1; report them.
4. Record the reviewers' actual routes from `~/.claude/model-gateway/logs/request-routes.jsonl`. Read only the model/route/timestamp fields for this session; never read credentials or transcript bodies. Report the observed models, not the agents' self-descriptions.

## Pre-push gate (before every push)

- `git diff --check` is clean.
- A secret and privacy scan of the staged diff for API-key patterns (`sk-ant`, `sk-`, `ghp_`, `Bearer`), `.env*` files, tokens, emails, absolute user paths (`C:\Users\`, `/Users/`), and private vault references. Any hit stops the push.
- No file over 1 MB.
- `git -C <worktree> status` shows changes only inside `brain/`.

Then commit `brain(B1): contracts and provenance labels`, with the session's required co-author line, and `git push origin brain`. Append the B1 result (SHA, checks, routes, deferred minors) to `decisions.md` **before** that commit so it's included.

## Boundaries

- Don't touch `experiments/`, `week1/`, root `PLANNING.md`, `AGENTS.md`, `DESIGN.md`, `docs/` or root `package.json`, in either checkout.
- Network use is limited to `git fetch` / `git push`, `npm install`, and the one GitHub visibility request. No model API calls, MCP generation tools, Higgsfield, or Ruflo `agent_execute`.
- At most three agents at once. You are the only writer. Reviewers are read-only.
- Don't use the Workflow tool for this session. The verification loop above replaces it for B1.
- Don't start B2, and don't mark anything accepted.

## Report (end of session)

Use the AGENTS.md handoff format:

```text
Task / phase / source revision:
Actual agent, model, tools:
Owned and changed files:
Inputs and accepted baseline (or none):
Decisions and rationale:
Checks and evidence:
Unresolved questions / blockers:
Next test and owner decision needed:
```

Include:
- the B0 and B1 commit SHAs and the pushed branch URL;
- the `npm run check` output summary with real exit codes;
- each reviewer's findings and how you resolved them;
- the integrity-order decision;
- anything deferred to later stages.

Finish with the owner's next step: review the two pushed commits on `origin/brain`, then decide whether to start B2.
