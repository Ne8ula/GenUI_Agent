# Week 4 visual-phase handoff

Date: 2026-10-03. Local source inspected: `da6eba5`, branch `week4`, initially clean. The local checkout contains the planning/setup pack and references, **not** the Cloud foundations implementation or its reports.

## Use these prompts in order

1. **Existing Cloud task:** paste [CURRENT_TASK_REPLY.md](CURRENT_TASK_REPLY.md). It authorizes a checkpoint commit/push to `week4` before further work, followed by bounded consolidation and a final verified save to the same branch. It excludes secrets/build/runtime output, forbids force-push and `main` writes, and preserves concurrent changes.
2. Wait for that task's final pushed commit SHA and actual check results.
3. **New Cloud chat:** select the updated remote `week4` branch and paste the full [CLOUD_VISUAL_PROMPT.md](../CLOUD_VISUAL_PROMPT.md). Do not use only a "read this local file" instruction unless you have also made the new prompt file available to Cloud.

No commits, pushes, fetch/merge, media generation or Cloud messages were executed by creating these local prompt files.

## Consolidation decisions

| Topic | Instruction in the current-task reply |
| --- | --- |
| Wallpaper scope | Clarify per-monitor image/path versus global position/layout and colour; never change global settings to stage one monitor. The existing plan already contained the global-setting rule, but its snapshot wording was ambiguous. |
| Entry / phase D | Retain entry-time window displacement and phase-D wallpaper application; reconcile skip/cancel and visibility claims. |
| 240-pixel parking/resizing | Keep only as a mock fixture, not final visual approval or permission to resize arbitrary windows. Preserve geometry, reject unfit moves, test interruption/no cross-monitor spill. |
| Torn journal | Preserve the checkpoint's conservative failure behavior; test and document the unresolved recovery limit. Real Windows effects remain blocked until durable/recoverable behavior is verified. |
| Voice routing | Retain genuine-cancel precedence, ambiguity clarification and one-change-at-a-time handling; do not defeat negation tests. |
| Nine new lines | Exact wording is unavailable locally. Keep proposed/unreviewed and audio missing; include text/triggers in the returned report. |
| Remaining low review items | Cloud must inspect every actual finding and record fixed/retained/blocked with evidence. No unseen issue is certified fixed here. |

These instructions consolidate the reported decisions; actual Cloud code changes must happen against the source in the existing Cloud task. This local work does not pretend to have integrated unavailable code.

## Approval boundary

The owner's request authorizes proceeding to the **visual work process**. It does not establish a completed Windows demo, accept Week 4/S0–S4, approve unseen voice lines, or grant a generation budget.

The reported 95 TypeScript / 62 Rust passes remain **Cloud-reported, not independently rerun locally**. The new session must inspect the preserved implementation and run its real baseline checks before relying on it.

The new task starts with discovery and the **actual quote for one S1 image**. Every run still requires its specific cost approval. Motion/UI implementation waits for an inspected image **and video** packet; S1 alone, old exports and the six JPGs do not clear it. The 26-job checklist is not an approved bulk order.

## New-chat configuration

Reuse the existing [Cloud setup guide](README.md), with these instruction-level overrides for the new task:

```dotenv
EVA_W4_WORK_MODE=visual-gated
EVA_W4_PROVIDER_MODE=mock
```

Leave `EVA_W4_REFERENCE_PACKET` unset until there is an actual packet to point to. These values are not security enforcement, cost approval or acceptance. Do not copy workstation credentials. Select Opus 5.5 for creative authorship if available and verify the actual route; neither a prompt nor the alias `opus` establishes that model.

The new prompt explicitly authorizes bounded reviewed checkpoint/final commits to `week4` only so the next Cloud container does not become the sole copy again. It does not authorize merge, deployment, a PR, force-push or writing `main`.

## Review provenance and checks

Main session: harness identifies Astra; authored operational handoffs only, without changing the Opus-authored aesthetic document. A native `eva-reviewer` performed a read-only boundary audit; it reported an older Opus route (`claude-opus-4-8[1m]`), not Opus 5.5. Independent transport attribution for that review was not established; its report is advice, not acceptance. Ruflo routing was advisory only.

Verification for this change is documentation-only: local link/format checks and a scope/status check. No unavailable Cloud implementation tests, Windows checks, voice/provider calls or visual generation are represented as executed.
