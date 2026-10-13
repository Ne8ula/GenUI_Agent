# Reply to the current Week 4 Cloud task

Paste the text below into the **existing Cloud session that holds the implementation**. It explicitly authorizes preservation on `week4`. It does not claim that the local coordinator inspected the Cloud diff or independently reproduced its tests. Keep the resulting commit SHA for the new visual session.

---

Yes. **I authorize you to commit and push the Week 4 work to the remote branch `week4`, never `main`.** Preserve the work now, before taking on further implementation. I also authorize the bounded consolidation below and then a follow-up commit/push to the same branch.

## 1. Preserve the existing result first

- Inspect actual Git status, source branch/revision, tracked diff **and untracked files**. Include only intentional `week4/` source, lockfiles, schemas, fixtures, tests and documentation. Exclude secrets, `.env` files, node_modules, target/dist output, private journals, raw audio/camera data and unrelated files. Preserve the six original JPGs unchanged.
- Verify the target remote and the latest `week4` branch state. Do not assume your old local remote-tracking reference is current. Do not reset, clean, stash, force-push or discard another session's work.
- Make a checkpoint commit containing the reviewed current Week 4 work, with an accurate message. End the message with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Push that commit to **`week4` only**, using an explicit target ref when necessary. Do not commit on `main`, push to `main`, merge to `main`, or open a PR. A non-fast-forward/conflicting destination is a reason to stop the push and report the conflict—not overwrite it. Preserve the local checkpoint and prepare a retrievable patch/bundle if the intended push cannot safely complete.
- Report the commit SHA, pushed destination and success/failure immediately. Do not delay the first preservation step to add new features or finish low-priority polish.

This is the separate owner instruction the previous prompt required. Platform hooks are not the source of this authorization.

## 2. Consolidate the remaining decisions

Read the complete actual `week4/CLOUD_REPORT.md`, review findings and current files before changing anything. Do not rely solely on the summary I pasted elsewhere. Reconcile all nine low items by marking each fixed, deliberately retained with rationale, or still blocked. Do not label a finding fixed without its code/test evidence.

The following scope decisions are approved for this consolidation:

1. **Wallpaper:** correct any ambiguous planning text. The image/path can be selected per monitor; wallpaper position/layout and background colour settings are global. Do not change global presentation settings or other monitors to stage one monitor. Preserve the current broker's conservative behavior and test/document the distinction. This is a wording/contract reconciliation, not permission to run real desktop effects.
2. **Order of staging:** retain window displacement at experience entry and wallpaper application in phase D under the opaque veil. Before D, the original wallpaper is still present. Make the timeline, skip/cancel tests and report agree; skip cannot skip required consented staging.
3. **240-pixel parking column:** retain it only as the present synthetic/mock fixture, **not as the approved final visual choreography or permission to resize arbitrary user windows**. Preserve original geometry/show state in recovery records. Test minimum-size/fit failures, cancellation mid-move and no spill onto another monitor. If safe parking cannot be represented, reject that move rather than force it. Final window choreography will be selected through the visual packet and verified on Windows.
4. **Truncated journal:** retain the fail-closed behavior for this checkpoint and document it as an unresolved native-readiness limitation. Do not silently truncate, discard or replay an ambiguous record to claim recovery succeeded. Add or verify a fault-injection test for a torn final record. Write the bounded next requirement for crash-safe durable records and verified recovery; real Windows staging stays disabled until that requirement is met and tested. This does not block independent visual work with mocks.
5. **Voice routing:** approve cancellation precedence for genuine cancellation requests, clarification for ambiguous "go back", and an honest "one change at a time" response for unsupported combined requests. Preserve negation tests: do not cancel just because the word occurs in "do not cancel" or quoted speech. Keep scene commands separate from permissions/OS authority.
6. **Nine new voice lines:** I have not seen their exact wording in this handoff. Keep them explicitly proposed/unreviewed and all missing audio marked missing. Include their exact text and triggers in the report for later review; do not mark them owner-approved or synthesize/record audio. Preserve the previously planned eight lines and their provenance.

Do not broadly rewrite the Opus-authored art direction, rescope the demo to a movie/fullscreen-only wallpaper substitute, or expand into UI/generation in this closing task. All edits stay under `week4/`. Preserve concurrent changes and do not alter root settings, permissions or Weeks 1–3.

## 3. Verify, save, and hand off

- Inspect the actual manifests and run the focused TypeScript typecheck/tests, Rust tests/format/lint and setup-script tests. Rerun affected checks after each substantive correction, then the final relevant suite. Use Week 4 paths only.
- Report the counts actually emitted by the final tools; the previous report says **95 TS and 62 Rust**, not 72 Rust. Do not hard-code those counts if new tests change them. Failures remain failures; do not weaken assertions or change test accounting to obtain a pass.
- Update `CLOUD_REPORT.md` and `CLOUD_PROGRESS.md` with exact commands/results, all low-item dispositions, remaining mock/Windows/generation/voice limits, and a clear next-session entry point. Keep every real Windows smoke step marked not run.
- Review the final diff and make a second bounded commit/push to `week4` if consolidation changed files. No force push, `main` write or PR. Supply the final remote commit SHA and a concise changed-file/checks summary.

**I approve moving next to Weave-led visual design and implementation.** This is work authorization, not final acceptance of Week 4, approval of unseen voice lines, proof of Windows behavior, or a paid-generation allowance. Leave final phase acceptance pending. The new session will read your preserved source and reconcile any remaining blockers before implementing against fresh inspected image/video references.
