# Week 4 Cloud handoff

For a manually started, unattended Claude Cloud session. This pack prepares the **non-visual foundations** of the Paris demo while the owner is away. It does not authorize paid generation or silently waive the fresh Weave image/video gate.

Start with [the task prompt](../CLOUD_PROMPT.md). Product scope remains [planning.md](../planning.md); art direction remains [DESIGN_PROMPT.md](../DESIGN_PROMPT.md).

## Before sleeping: five steps

1. **Make the intended source available to Cloud.** At preparation time, all of `week4/` was untracked locally on `week-3` at `d25d705`. A normal Cloud checkout cannot see that local folder. Review and intentionally commit/push the Week 4 documents, these Cloud files and all six reference JPGs to the source branch you will select. This pack does not commit or push anything. Do not include local credentials, runtime data, node_modules or private recovery journals. Select that remote branch in Cloud, not an older `main` snapshot that lacks Week 4.
2. Create/select a Cloud environment for this repository. Leave ordinary platform permissions in place. Use **Trusted** network access for common package registries and GitHub if dependencies need downloading; do not enable unrestricted network just to avoid diagnosing a blocked dependency.
3. In the environment's **Setup script** field, paste the complete contents of [setup-environment.sh](setup-environment.sh). It is deliberately repo-independent. Do not paste only `bash week4/scripts/cloud-setup.sh` here: checkout timing and working directory at provisioning were not established by the inspected official documentation.
4. Add the non-secret environment values below. Use Cloud's available model selector; choose **Opus 5.5 if offered** for continuity with the design author. A prompt or environment variable cannot prove that route. Do not copy workstation Gateway variables or tokens to force it.
5. Start a new Cloud session against the correct source branch and paste [CLOUD_PROMPT.md](../CLOUD_PROMPT.md). Confirm that provisioning finishes and the task sees the expected Week 4 files before leaving it unattended. The task runs the separate repository bootstrap after checkout, then implements/tests the unblocked backlog. No scheduled routine, local relay, background shell loop or always-on computer is required by this handoff.

If the complete handoff is already on the selected remote branch, this short launch message is sufficient:

```text
Read week4/CLOUD_PROMPT.md in full and execute its bounded Week 4 unattended task. I am unavailable: continue through all unblocked work, record blockers instead of waiting for replies, and finish the progress and hand-back files. Do not bypass the Weave, spending, Windows-evidence or owner-acceptance gates.
```

A session still has provider/tool/runtime limits; this is not a guarantee that Claude runs for the entire night. If it reaches a real limit, its progress/report files are the continuation point. Do not infer completion from silence.

## Environment variables

Copy from [environment.env.example](environment.env.example) into Cloud's variable editor. These are ordinary configuration values, not secrets:

```dotenv
CI=true
TZ=UTC
EVA_W4_WORK_MODE=foundations
EVA_W4_PROVIDER_MODE=mock
EVA_W4_REFERENCE_PACKET=
EVA_CLOUD_INSTALL_NODE_DEPS=1
EVA_CLOUD_NPM_LIFECYCLE_SCRIPTS=0
EVA_CLOUD_FETCH_RUST_DEPS=0
```

If the UI does not accept an empty variable, omit `EVA_W4_REFERENCE_PACKET`. Do not set it to an old Week 3 packet or a mood-reference folder.

| Variable | Meaning |
| --- | --- |
| `CI`, `TZ` | Standard non-interactive tooling/timezone conventions; neither changes tool permissions. |
| `EVA_W4_WORK_MODE=foundations` | Instruction-level coordination hint: no frontend/visual implementation in the default session. |
| `EVA_W4_PROVIDER_MODE=mock` | Instruction-level hint: synthetic data, no runtime provider calls. No current application adapter is claimed to enforce it. |
| `EVA_W4_REFERENCE_PACKET` | Optional future packet locator only. A path does not grant cost approval or satisfy generation/inspection requirements. |
| `EVA_CLOUD_INSTALL_NODE_DEPS=1` | Repository bootstrap installs only when `week4/package.json` and its lock exist. It defers cleanly when Week 4 has no package yet. |
| `EVA_CLOUD_NPM_LIFECYCLE_SCRIPTS=0` | Bootstrap uses `npm ci --ignore-scripts` by default. If a future reviewed dependency needs a build script, make a specific reviewed decision; do not enable all scripts reflexively. |
| `EVA_CLOUD_FETCH_RUST_DEPS=0` | Bootstrap does not fetch crates by default. Optional `1` requires a Week 4 Rust manifest/lock and cargo. This is separate from later reviewed dependency decisions during development. |

There are **no required API keys** for tonight's fixture-only work. Do not copy local `.env` files, Figma/Weave OAuth, ElevenLabs/OpenAI credentials, `ANTHROPIC_BASE_URL`, alias pins or `CLAUDE_CODE_SUBAGENT_MODEL`. Also do not unset or replace Cloud's own host-managed authentication. Connected tools in the Windows session do not prove Cloud connectivity.

The supplied `.env`-style example is documentation; scripts do not source it. Setup-shell exports are not relied on for later commands. Set values in the Cloud environment editor before starting the new session.

## Two setup stages, intentionally separate

### Environment provisioning

[setup-environment.sh](setup-environment.sh) is pasted into the Cloud environment UI. It:

- Checks Linux and existing Bash, Git, Node >=22 and npm.
- Reports tool versions, and whether cargo/rustc are available.
- Does not need the repository, root privileges, a persistent shell or a particular working directory.
- Installs nothing, prints no environment dump, alters no credentials/settings, and starts no server.

The inspected official environment documentation lists Ubuntu 24.04, Node 22 on PATH, and Rust/cargo among preinstalled tools. Actual tool versions must still be recorded in the session. Node 24 is not silently downloaded or assumed. If the hosted image lacks a required tool, the check fails clearly; it does not install a router or pipe an unreviewed installer into a shell.

### Repository/session bootstrap

Once Claude has the checkout, the prompt runs:

```bash
bash week4/scripts/cloud-setup.sh
```

The bootstrap is [here](../scripts/cloud-setup.sh). It verifies the Week 4 input documents and scopes installs to Week 4. Root npm commands are forbidden because they forward to Week 1.

Initially there is **no Week 4 application manifest or lockfile**. Dependency setup therefore reports deferred, not an application-ready success. The task can then create a standalone non-visual workspace and its lockfile, inspect its scripts/dependencies, and rerun the bootstrap. Setup never manufactures a package or lockfile, ports the Week 3 app, starts a dev server, calls a provider, captures a camera, or touches wallpaper/windows.

No Linux Tauri desktop packages, Chromium, GPU setup, media models, local proxy or ComfyUI are installed by default. They are not needed for the current pure-data/mock backlog. A future valid visual pass requires its own reviewed dependencies and actual packet; this pack does not pre-authorize that work.

## What can get done while you sleep

The handoff asks Claude to implement rather than merely re-plan:

- Standalone Week 4 tests and bounded JSON/data contracts.
- Stable scene IDs, presentation reducer, weather/light combinations and undo.
- Closed voice-intent/paraphrase fixtures and honest unknown-request handling.
- Pure 60-second timeline, skip, cancellation and supersession behavior.
- Off-axis projection/calibration/filter math with synthetic pose tests.
- Mocked desktop broker, consent and write-ahead recovery policy, including interrupted moves and later user changes.
- Asset/rights inventory, finite Weave job checklist and targeted source-backed research.
- A Windows smoke-test handoff and a report distinguishing implemented, mocked, blocked and not run.

Actual native effects, microphone/camera integration, audio generation and UI rendering are not represented as working by these tests. An explicit unsupported adapter is preferable to a success-returning stub.

## What still cannot proceed without preparation

There is no fresh Week 4 Weave packet or generation allowance in this snapshot. **The default Cloud session cannot implement the visual scene, construction animation, UI or desktop presentation.** It must not use the six supplied JPGs, old exports, procedural mockups or this prompt as a substitute.

To enable a later bounded visual pass before going offline:

1. In a connected session, select the exact pass, get finite per-run cost approval, generate fresh Weave images and motion studies, inspect them and record the real packet under `week4/docs/design/revisions/<revision-id>/`.
2. Make the actual packet and assets available in the intended Cloud source snapshot.
3. Give explicit implementation authorization for that packet's scope; an env flag alone does not authorize it.

Do not submit unattended paid jobs from this default prompt. If cost/tool approval is unavailable, remain on the non-UI backlog. No generation happened while making this pack.

## Windows and acceptance boundaries

Cloud is a Linux environment. It can test pure Rust/TypeScript policy, math, schemas and fixtures. It cannot establish Windows Tauri/WebView2 transparency, physical camera/microphone behavior, actual window displacement/wallpaper restoration, hotkey/watchdog operation, DPI/multi-monitor correctness, full-head-box visual seams or emotional success on the demo monitor.

Those require the owner's Windows run and acceptance against a tested revision. Previous Week 3 visual acceptance does not accept the full voice loop or Week 4. The handoff must not modify phase acceptance records to manufacture a pass.

## Source control and retrieval

This handoff deliberately does not authorize agent-invoked commit, push, PR creation, merge or deployment. Cloud's official documentation describes a `claude/` branch workflow; the inspected material did not establish whether every save/push step is platform-managed or agent-initiated. Do not promise that a prompt controls host lifecycle behavior. Review the actual Cloud session/branch controls before launch, and keep `main` untouched.

When you return, inspect `week4/CLOUD_PROGRESS.md`, `week4/CLOUD_REPORT.md` and `week4/WINDOWS_SMOKE.md` if the task created them, along with the complete diff. Use Cloud's available retrieval flow to preserve the result, then explicitly authorize any commit/push/merge you want. No Cloud session was launched by preparation of these files.

## Verification and official references

Local preparation checks and platform limits are recorded in `week4/cloud/VERIFICATION.md` after integration. They are not proof that provisioning or tests ran inside Cloud.

Official documentation inspected through the Claude Code guide worker on 2026-10-03:

- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Cloud environments](https://code.claude.com/docs/en/cloud-environments)

The environment guide states that setup is Bash, runs before Claude Code launches, and uses the environment's network access. It does not establish a repository working directory for the setup field in the excerpts inspected, which is why this pack avoids that dependency. The Trusted registry policy can still block a specific dependency host: diagnose the actual failure, do not automatically broaden network or permissions.
