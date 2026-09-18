# Expressive-response research reframe — documentation review

- **Phase/scope:** S0 research direction, canonical planning/design/proposal, source synthesis, predecessor audit, precedents and next experiment specification.
- **Status:** Pending owner review. Documentation work does not accept S0 or authorize E1 implementation.
- **Date:** 2026-09-17.
- **Source revision:** `9cb84746d97e0d5f1a441c196cfb05a3ed235d18` plus the uncommitted documentation changes linked below. No application build is associated with this record.
- **Accepted baseline:** Owner-reported successful Week 1 remains archived; no accepted baseline for the new expressive-response grammar.
- **Actual tools:** Current OpenAI Codex session, shell/filesystem inspection, web research and bounded public browser inspection. No independent reviewer or extra model is claimed. The future development workflow is Astra inside Claude Code, as requested by the owner.

## Review scenario and expected result

Read the [research index](../../research/INDEX.md), [decision log](../../research/DIRECTION_DECISIONS.md), [canonical plan](../../../PLANNING.md), [design grammar](../../../DESIGN.md), [study proposal](../../research/GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md), and [E1 experiment](../experiments/E1_REVISABLE_WEATHER.md).

Expected: one clear response-level research contribution; traceable academic/source evidence with limits; explicit A–G transfer decisions; synthetic weather/transit grammar; a bounded next implementation; separation from personal/exhibit/product tracks; and compatibility with Astra in Claude Code. History and authority boundaries remain intact.

Useful review commands, from repository root:

```powershell
git diff -- PLANNING.md DESIGN.md AGENTS.md README.md docs/design/HIGGSFIELD.md docs/design/INDEX.md docs/research/GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md
git status --short
git diff --check
git diff --name-only -- week1
```

New untracked research/specification files must be read directly through the index; ordinary `git diff` does not include them. Concurrent development-workflow changes are separate work and are not claimed as this task's implementation.

## Actual checks and limitations

| Check | Result |
| --- | --- |
| Documentation diff whitespace | `git diff --check` passed; Git emitted line-ending conversion notices, no whitespace errors |
| Local links and heading fragments | Passed: 124 local references across 15 current documentation files; no missing targets or heading fragments; balanced fenced blocks and no trailing whitespace |
| Historical snapshots | All three snapshots match the base commit's text after CRLF/LF normalization; original copied bytes retained |
| Week 1 preservation | `git diff --name-only -- week1` returned no changes |
| Retained product boundaries | Base/current text comparison passed for product principles, Sections 9–13, Section 15.5 release gates/adversarial protocol, and full-product Milestones 0–12 |
| Research/source distinctions | Bibliography records primary sources and reading depths; code, descriptions, still observations, inferences and proposed results are labeled separately |
| Development-workflow consistency | Current AGENTS.md/CLAUDE.md/development workflow inspected; obsolete planning role table replaced; current harness separated from runtime provider choices |
| Application tests/build/renderer benchmarks | Not run: documentation-only change, no new runtime implementation |
| New visual evidence | Not applicable to documentation; no new candidate screenshots or motion records fabricated |
| Human-subject study | Not run or approved by this record |

An initial link-check attempt used `python`, which was absent from PATH; the check was rerun with the already available Node runtime. No dependency was installed.

Source limits: local NPC revision inspected, remote freshness/runtime unverified; some academic entries limited to abstracts/metadata; artist stills and descriptions inspected but inaccessible motion not watched; *Sunshine* numerical detail unverified. See the linked research records for exact limits. These constrain claims but do not block the documentation handoff.

## Owner feedback and decision

Owner direction during work: prioritize academic references and ensure the restructuring agrees with Astra inside Claude Code's harness. Both are incorporated. This is steering, not acceptance of the new study or visual baseline.

Outstanding review: focused question, proposed comparison, weather-first scope, simple expressive-state model, E1 boundaries and criteria. New appearance/timing choices await an executable candidate. Faculty sampling/protocol and institutional approval remain separate.

**Owner decision/date:** pending. **Reported documentation blockers/retest:** none received. Record any feedback and the exact reviewed revision before declaring acceptance; do not infer it from silence or Week 1 success.
