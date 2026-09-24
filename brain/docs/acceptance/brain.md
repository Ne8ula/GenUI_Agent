# Acceptance record — EVA brain track

**Status: pending.** Nothing in this track has been accepted. Passing checks, reviewer findings and pushed commits are evidence for the owner's review, not acceptance (AGENTS.md).

| Field | Value |
| --- | --- |
| Phase / scope | Brain track, Stages B0–B9 per [brain/PLANNING.md](../PLANNING.md). Owner gates: G1 after B4, G2 after B7 (phase acceptance demo), G3 after B8, G4 after B9. |
| Revision / build | Base `cb7ac83` (`main`). Stage commits are listed in [decisions.md](../decisions.md) as they land on `origin/brain`. |
| Scenario and commands | Per stage: `cd brain && npm ci && npm run check`. From B7: `npm run scenario -- <id or all>`; from B4: `npm run memory:review`. |
| Expected results | `npm run check` exits 0 (validators current, typecheck clean, all tests pass). Stage-specific expectations are in each stage's acceptance criteria in the plan. |
| Actual checks | Recorded per stage in decisions.md with real exit codes. No check counts as acceptance. |
| Visual evidence | Not applicable: the brain has no UI. |
| Limitations | Mock provider only until B8; TypeScript policy is an interim stand-in for the Rust broker (D3); synthetic vault only. |
| Owner feedback | None recorded yet. |
| Blockers / retest | None recorded yet. |
| Owner decision / date | **Pending.** |
