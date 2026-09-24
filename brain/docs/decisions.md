# EVA brain — decision log

Decisions for the brain development track. The plan is [brain/PLANNING.md](../PLANNING.md); process rules come from the repository's `AGENTS.md`. Entries are dated and appended; earlier entries are not rewritten.

## Kickoff decisions (owner, 2026-09-24)

- **D1 — Independent track.** The brain is an independent development track (product Milestones 4/5 subset plus §8 persona), not study phase S2, and it does not wait for E1 acceptance. Only Stage B9 waits for Astra to finish and for an owner-named E1 revision. This accepts no other phase.
- **D2 — Scope.** Orchestration + memory + personality. No UI, voice, tools or embeddings.
- **D3 — Policy location (interim).** Memory-saving rules (the §9.7 approval table and the dedup/contradiction/sensitivity/provenance checks) are written in TypeScript in Stage B4 as a pure function driven by shared JSON fixtures under `brain/fixtures/policy/`. A later, separately gated Rust migration must pass those fixtures unchanged. Until then the brain writes only to a synthetic vault copy in a temp directory; no real vault is written.
- **D4 — Public repository.** `Ne8ula/GenUI_Agent` is public, so every push publishes immediately. Verified at B0 with an unauthenticated `GET https://api.github.com/repos/Ne8ula/GenUI_Agent` → HTTP 200, `"visibility": "public"`. The pre-push gate is mandatory; all fixtures, persona files and traces must be fictional and public-safe.
- **D5 — No automatic advance.** The pipeline stops after every stage for owner review. The B1 session prompt commissions B0 and B1 together as two separate commits and stops after B1.
- **D6 — No Anthropic API key yet.** No model API calls of any kind in B1–B7. B8 waits for a key and a spend limit.

## Git authorization (owner, 2026-09-24)

Each brain commit is pushed to the separate `brain` branch on GitHub. Commits and pushes are allowed **only** on branch `brain`, only from the brain worktree (`.claude/worktrees/brain`), never with `--force`, never amending a pushed commit. `main` is never touched; no merge, rebase or pull request without a separate owner instruction. Commit messages: `brain(B<n>): <summary>` with the session's required co-author line. The pre-push gate in PLANNING.md Section 3 runs before every push.

## Routes

- **B1 route (owner, 2026-09-24):** Opus 5.5 (`claude-opus-5-5`) as the main Claude Code session implements B0 and B1 directly, instead of the default `eva-implementer`. The read-only reviewers (`eva-reviewer`, `eva-researcher`) keep their project definitions with no model override. The observed model identity is recorded in the stage result below, not assumed from the selection.

## B0 — scaffold (2026-09-24)

- **Base revision:** `cb7ac83688c075d2268ff6be06288e47e0467745` (`main`, equal to `origin/main` at kickoff). Worktree `.claude/worktrees/brain`, branch `brain`.
- **Plan move:** `brain/PLANNING.md` and `brain/prompts/B1_SESSION_PROMPT.md` were copied from the untracked shared-checkout folder and verified by SHA-256 (`02f5379b…07bf` and `f3f99ef3…6596` respectively) before commit. The untracked originals are deleted only after the push succeeds and the committed copy hashes identically.
- **Toolchain:** Node ≥ 24.14 runs the `.ts` sources directly (type stripping), so the code uses no enums, namespaces or parameter properties (`erasableSyntaxOnly`). `node --test` is the test runner; `tsc --noEmit` typechecks `src`, `tests` and `types`. Dependencies are exactly `ajv ^8.20.0` and `typescript ~6.0.3`, matching E1's pins.
- **No `@types/node` yet (question for the owner).** B0/B1 were told to add no dependency beyond `ajv` and `typescript`. Typechecking tests that import `node:test`, `node:fs` etc. needs Node typings, so `brain/types/node-builtins.d.ts` declares a minimal ambient surface for exactly the built-ins used, and `tsconfig.json` sets `"types": []`. It is a stopgap: if the owner approves `@types/node` (E1 uses `^24.10.0`), the shim is deleted in the same change. Nothing at runtime depends on it.
- **Validator generation:** `scripts/generate-validators.mjs` discovers `schemas/*.schema.json`, enforces `$id = https://eva.local/schemas/brain/<name>.schema.json`, and writes standalone Ajv 2020 validators plus a `.d.ts` into `src/contracts/generated/`. `--check` fails on drift. `--schemas-dir` / `--out-dir` let tests prove drift detection against a temp copy. With no schemas it writes an empty module so `npm run check` is meaningful in B0.
