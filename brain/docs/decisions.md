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

## B1 — contracts and provenance labels (2026-09-28)

- **Session and location.** Implemented by the owner-selected Opus 5.5 main session (`claude-opus-5-5`, confirmed by the session's own `get_session` metadata: configured and last-served model both `claude-opus-5-5`). It ran in a Claude Code cloud container: a fresh checkout of branch `brain` at `d0f849a` replaces the local `.claude/worktrees/brain` worktree. No Model Gateway exists there. Node `v24.14.0` from `/opt/eva-node/bin`. Baseline before B1: `npm ci --include=dev` and `npm run check` both exited 0 (2 tests).
- **Schemas (18).** The 17 in the B1 table plus `memory-candidate-proposal`, split out after review (below). All Draft 2020-12, `$id = https://eva.local/schemas/brain/<name>.schema.json`, every object shape closed. `common.schema.json`'s root validates a provenance stamp (origin, source ref, labels, lineage), so its type is `ProvenanceStamp`.
- **Integrity order** (most trusted first): `trusted_policy` > `direct_user` > `verified_local` > `verified_tool` > `untrusted_external` > `untrusted_generated` > `quarantined`. Rationale:
  - Policy outranks the user's words so that no utterance joined with policy text can come out as policy. The constitution changes only by reviewed code.
  - `direct_user` outranks everything the system itself produces or fetches.
  - `verified_local` (host-verified local data such as a validated vault read) outranks `verified_tool`, where only the connector identity and envelope were verified, not the content (§13.3).
  - `untrusted_external` outranks `untrusted_generated`: external text has an attributable source, while a model rewrite of anything has none of its own and may hallucinate. This matches the rule that model output is never above `untrusted_generated`.
  - `quarantined` is last and absorbing.
  - Confidentiality: `public` < `private` < `sensitive` < `secret`. Join takes the lowest integrity and the highest confidentiality.
- **Known limit of a total order** (reviewer note, deferred to B6): `join(untrusted_external, untrusted_generated)` yields `untrusted_generated`, so the label alone no longer shows that external (injection-prone) text was involved. Until then, external involvement is read from `origin` and `lineage`. B6 decides whether to add a separate external-taint marker before any external content reaches a planner.
- **No silent clamp.** `join`, `deriveModelOutput` and `relabel` accept a proposed label pair only if it is at least as strict; otherwise they return a typed `LabelRejection` (`integrity_upgrade`, `quarantine_escape`, `confidentiality_downgrade`, `unknown_label`, `unknown_label_field`, …). Rank helpers throw on unknown labels. Lineage is append-only (`appendLineage`, `checkLineageAppendOnly`), with each entry's `sequence` equal to its index and a structural check of every entry.
- **Candidate → durable node labels** (`attestUserStatement(contentLabels, evidence)`). An extracted candidate is at most `untrusted_generated`, and no relabel can raise it. For the §9.7 "explicit preference / explicit correction" rows, the write policy (B4) does not relabel the candidate:
  - **Integrity** comes only from host-held evidence: the cited episodes and/or the user's review decision. Each must be `direct_user`, checked per item.
  - **Confidentiality** is the highest across the stored content's labels and the evidence, so attestation can never declassify. B4 **must** include the candidate's host labels in `contentLabels`; the function cannot check that the caller did.
  - Quarantined content can never be attested (`quarantine_escape`).
  - **B4 obligations:**
    - The auto-write path stores the exact user quote (or a deterministic derivation of it) as the claim. Any other claim text needs a user review decision; a verified quote does not vouch for a different, model-written claim.
    - B4 recomputes `assertion` and `sensitivity` from the cited episode instead of trusting the proposal.
    - An attested node's lineage starts with a host `review`/`verify` entry that cites the candidate by ID, instead of carrying the model's extract step. Otherwise the model-lineage rule below would cap it at `untrusted_generated`.
    - The reviewer's failing input becomes a B4 policy fixture: a model-written "authorises location sharing" claim paired with an unrelated quote.
- **Schema-level escalation guards** (round 1–3 review fixes):
  - `common.schema.json#/$defs/originIntegrityRules` is shared by the provenance stamp and context items. It caps each origin:

    | Origin | Highest integrity |
    | --- | --- |
    | `model` | `untrusted_generated` |
    | `tool`, `fixture` | `verified_tool` |
    | `host`, `persona` | `verified_local` |
    | `memory`, `direct_user` | `direct_user` |

  - Within those rules, `direct_user` integrity needs either a `direct_user` origin with a `user_turn`/`episode` source, or a `memory` origin (a node attested as the user's words) with a `memory_node` source.
  - Any model step in an item's lineage limits it to generated labels, whatever its origin. This applies to stamps, context items and artifact envelopes.
  - `trusted_policy` integrity needs a `policy` origin and a `policy` source.
  - Every `sourceRef` ID prefix must match its kind (`policy_`, `mem_`, `ep_`, `turn_`, …).
  - Artifact envelopes:
    - Model-backed producers (worker, extractor, narrator, verifier), any producer with a `route`, and any artifact with a model step in its lineage carry only generated labels.
    - Retriever and host artifacts stay below `direct_user`.
  - Revisions carry a `producer`:
    - `narrator` prose is generated-only.
    - `host_template` text stays below `direct_user`.
  - Episodes:
    - Non-user origins stay below `direct_user`.
    - Tool origin is capped at `verified_tool`.
    - Narrator episodes are generated-only.
  - Model requests:
    - System-role parts must be `trusted_policy` from a `policy` source.
    - `trusted_policy` appears in no other role.
    - Assistant parts are generated-only.
    - `direct_user` parts must cite a user turn, episode or memory node.
  - Memory nodes are never `trusted_policy` or `quarantined`.
  - Persona packets are never `trusted_policy` or `direct_user`.
  - Lineage is never empty, in the schemas and in `appendLineage` / `checkLineageAppendOnly`.
  - Scope of these guards: they close label mislabelling. They cannot stop the host itself from writing a false ID of the right prefix. `origin.id` and lineage `actor.id` are not prefix-checked, and a worker could name itself as verifier. Source existence, identity and verifier independence are checked when the host resolves a reference (B3/B6).
- **Memory-node review state.** `pending` and `rejected` are not node states: pending candidates stay in the queue, and rejected ones are never written. `accepted`/`edited`/`temporary` require a `reviewDecisionId`; `not_required` forbids one. Inferred, affective, identity and high-sensitivity nodes can never be `not_required`. A `not_required` node must also be a `direct_user` statement with quote evidence from an episode or user turn. B4 may widen this only through a reviewed decision.
- **Extractor output schema.** `memory-candidate-proposal.schema.json` is the extractor's entire output (`outputSchemaRef`). The host-owned part of `memory-candidate` (ID, generation, labels, lineage, required-but-nullable `originRevision`) cannot be produced by the model. An explicit claim must quote its evidence.
- **Artifact envelope.** It carries metadata plus `contentHash`; the payload is stored separately and validated against `contentSchemaVersion`'s schema (added with the first worker artifact, B6). It carries a `generation` token for late-result rejection.
- **Generator changes.**
  - `strictRequired: false`, because Ajv evaluates `if/then` before `properties` and would reject every conditional `required`. `tests/contracts-schemas.test.ts` replaces it: every `required` name must be declared on the object shape for that instance location. The test follows conditions, local `$ref`s and array items, and was mutation-checked.
  - New `validatorsBySchemaId` export, so B2 can validate structured output by `outputSchemaRef`.
  - Generated `validators.js` is 862,274 bytes (under the 1 MB gate), mostly from `allErrors` and inlined conditionals. **B2 must watch this:** if more schemas push it past 1 MB, split the output per schema or drop `code.lines`, as a reviewed generator change.
- **Fixtures.** `fixtures/contracts/<schema>/{valid,invalid}`. Invalid fixtures are declarative JSON Patches over a named valid base, with the expected Ajv keyword and path (see `fixtures/contracts/README.md`). All data is synthetic; the persona fixture uses the fictional name "Juniper" and no real persona values.
- **Deferred to later stages (recorded so they are not lost):**
  - **B2:**
    - The router rejects `preferredMs > hardMs`.
    - Stream consumers inherit confidentiality from the request, because stream events carry no labels.
    - Structured output is validated only against the **request's** `outputSchemaRef` via `validatorsBySchemaId`. A response whose `output.schemaRef` differs is rejected, so a model cannot name a more privileged schema such as `review-decision`.
  - **B3/B4:**
    - Enforce the §9.7 table: emotional-pattern confidence cap, expiry, and the quote-as-claim rule above.
    - Recompute assertion and sensitivity.
    - Memory nodes do not yet record their own lineage or source `candidateId`. B4 adds that write provenance to the node, or to its change log.
  - **B5:**
    - Cap session-affect and packet-affect `expiresAt` relative to `setAt`, since JSON Schema cannot compare timestamps.
    - Check that sarcasm suppression matches the register context in the table test.
    - Decide where persona text sits in a model request. A system part must be policy-sourced, so either the constitution is policy text and identity/style go in a labelled non-system part, or the packet format changes by reviewed decision.
    - Lower packet labels when the affect came from a narrator proposal.
  - **B6:**
    - Decide on the external-taint marker.
    - Enforce `preferredAt <= hardAt` on envelopes.
    - Resolve source references against real objects.
  - **Episodes:** direct-user episodes cannot be downgraded (for example user-pasted web text marked `quarantined`). Revisit when paste or attachment ingestion exists.
  - **Timestamps:** the timestamp pattern accepts impossible calendar dates such as 02-31. Code that parses timestamps must reject them.

### B1 result (2026-09-28)

- **Commit:** `brain(B1): contracts and provenance labels`, on top of `d0f849a`. The SHA is in the pushed branch history and the stage report; a commit cannot contain its own SHA.
- **Checks** (run by the orchestrating session in the cloud checkout, Node v24.14.0):
  - `npm run check` exited 0. It runs `generate:validators:check` ("current (18 schema(s))"), `tsc --noEmit` and `node --test` (216 tests, 0 failures).
  - Pre-push gate: `git diff --check` is clean. The secret/privacy scan of the staged diff found no hits. There are no `.env*` files and no file over 1 MB. All changes are under `brain/`.
- **Review rounds.** All reviewers were read-only.
  1. Architecture review: 7 majors (memory → instruction, candidate → node label path, origin/producer ↔ integrity, memory-node review state, candidate approval inputs, extractor writing host fields, artifact generation). Acceptance check: 8/9 met; criterion 9 was unverified by the reviewer and verified by the orchestrator with git; 2 majors (schema origin ↔ label ties, missing integrity-order rationale). All fixed.
  2. Architecture review: 3 majors (attestation declassification, user/persona/policy origins claiming `trusted_policy`, verifier/host artifacts) plus minors. Acceptance check: 10/10 met; a deleted `fixtures/contracts/README.md` was found. All fixed.
  3. Architecture review: 2 majors (model lineage not capping context items and stamps; attestation releasing quarantined content). Acceptance check: 11/11 met, no blockers.
  4. **The owner authorized a 4th round after the 3-round cap** (owner's answer 2026-09-28: "4th review, then push"). The round-3 majors were fixed, then re-reviewed. Architecture review: all closed, no blocker or major. Acceptance check: all criteria met, no blocker or major.
- **Routes (actual).**
  - `eva-researcher` (configured `claude-gpt-5.6-terra[1m]`) failed at launch with `model_not_found` (HTTP 404, "model sent to the API: claude-gpt-5.6-terra"). This cloud container has no Model Gateway, so the failure was not transient and was not retried. The acceptance-criteria check was reassigned to a second read-only `eva-reviewer` (configured alias `opus`) for all four rounds.
  - Every reviewer reported itself as `claude-opus-5-5`. That is **self-reported only**: no Gateway `request-routes.jsonl` exists in this environment, so no route log confirms it.
  - The implementing session's model comes from the session's `get_session` metadata, not from a route log.
- **Deferred minors from round 4** (each also fits a deferral above):
  - Add a `verified_local` model-lineage negative and a valid `untrusted_generated` model-lineage context item, to pin the rule's exact strength.
  - `attestUserStatement` should check the parsed, frozen evidence copies rather than re-reading caller objects (hardening against getters/proxies in host code).
  - Make the candidate's labels a separate required parameter of `attestUserStatement` (B4).
  - The older `direct_user` origin rule is now redundant with the source-tied rule; it is kept as defence in depth.
  - The structural walker does not descend into `contains`, `prefixItems`, `dependentSchemas` or `propertyNames` (none are used outside conditions today).
- **Acceptance:** none. B1 awaits owner review of the pushed commit (D5); `docs/acceptance/brain.md` stays pending.
