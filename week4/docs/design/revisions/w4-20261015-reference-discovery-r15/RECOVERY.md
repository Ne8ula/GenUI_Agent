# Recovery and review notes

The interrupted conversation was recovered from its local user messages and structured-question results. The latest task is R15 input-only UI plus real archival-photo discovery, not the superseded R8 procedural implementation brief. The original session's 23:13 real-photo selection, 23:19 supplied-reference exception and 23:37 photo-linked-credits decision are recorded in provenance.json. Existing R14 rendering was preserved.

## Independent review

Native `eva-reviewer` (configured `opus`; worker reports configured Opus 4.8, not treated as independent transport proof) inspected the arrival host, discovery component/state, styles, tests, source credits and explicit production allowlist. No edits or browser execution by the reviewer.

- Loading gap: fixed by retaining the existing eye until archival assets resolve; no new visible labels/buttons were introduced.
- GPU failure: explicit typed `retry` remains intentional. Reset does not hide a genuine rendering failure or pretend it recovered.
- Suggested focus issue was withdrawn: supported resume requires focus on the text input, not the fading photo.
- Attribution-by-photo-link was already explicitly approved by the owner. Credits retain date uncertainty, author, licence, original-source link and crop disclosure.
- Production's explicit five-file allowlist was reviewed against all runtime references. Broad public copying remains disabled.

No open actionable defects remained in the review handoff. This is code review, not aesthetic approval, an independently executed test, a legal guarantee or owner acceptance.

## Failed checks retained

1. Initial TypeScript check found a possibly undefined next-fragment index. Added the explicit guard; subsequent typecheck/tests/build passed.
2. Development capture `implementation/after/check-01` passed 23 checks and recorded the full transition.
3. First production capture `implementation/after/production-01` timed out before discovery advanced. Root cause: `copyPublicDir:false` correctly excluded non-allowlisted public files, but the new three JPGs and credits files had not been explicitly emitted. The SPA fallback returned HTML at the photo paths and image decoding failed. Corrected via a five-file R15 allowlist, preserving all historical exclusions. Failed evidence is retained, not overwritten.
4. Final production retest is recorded separately; see REVIEW.md and its actual checks.json, not this narrative, for the result.

Main implementation/integration: harness-reported Astra (`claude-gpt-6-astra[1m]`), native Tools/Edit/Write/PowerShell/Bash and local Playwright. Two native `eva-researcher` tasks (configured Terra) recovered repository status and verified two additional Commons source records. Ruflo `hooks_route` was advisory; no Ruflo inference worker, new router or permission bypass was used. Local gateway logs showed Codex Astra and Anthropic Opus routes, but individual request-to-worker correlation was not established, so configured versus observed identity is not conflated.
