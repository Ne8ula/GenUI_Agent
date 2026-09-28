# Week 3 Cloud sculpting

A handoff for **Claude Code on the web**, not an API-managed agent. The owner likes the state-changing behavior but has **not accepted the current visuals/animations**. Claude should refine the eye against the references, then pause for feedback after **three passes**. No app redesign is performed by this setup pack.

## 1. Make the right source available first

A normal Cloud session clones a GitHub branch, **not this local working tree**. At the start of this task, HEAD was `fc33b6b` and much of Week 3 was uncommitted. A concurrent checkpoint, **`985a948`**, subsequently captured that implementation. It was not created by this handoff task. This Cloud pack and its small browser-script compatibility changes still need to be included in the branch you send to Cloud; a local commit alone does not establish that the remote has it.

Review and transfer the desired snapshot to your chosen Cloud branch yourself. Do not blindly stage the repository or include private environment files. This session does not commit, push, create a PR, upload a bundle or provision a Cloud VM for you.

The branch must contain the current `week3/` code, these Cloud files, all of `week3/pivot_references/`, the Week 1 source eye/accepted reference, and applicable instructions. `preflight.mjs` refuses an older/incomplete checkout instead of quietly rebuilding the wrong demo. A CLI `--cloud` launch normally clones the remote; even forced local bundles omit untracked files unless staged and have size limits. Prefer a reviewed branch for this media-heavy repo.

## 2. Create the Cloud environment

At [claude.ai/code](https://claude.ai/code), open the **cloud/environment selector above the message box → Add cloud environment**.

- Name: **EVA Week 3 — Visual Sculpting**.
- Network: **Trusted** initially. If an install is blocked, use **Custom**, include the defaults, and allow only the needed download hosts. Likely additional hosts are `nodejs.org`, `cdn.playwright.dev`, and `playwright.download.prss.microsoft.com`; Ubuntu package mirrors may also be needed. Diagnose the actual blocked host rather than enabling unrestricted access or disabling TLS checks.
- Environment variables: copy [environment.env.example](environment.env.example) below.
- Setup script: paste the **entire contents** of [setup-environment.sh](setup-environment.sh) into the setup field. Do not rely on a cloned repo path there. It provisions Node and ffmpeg independently of the repository, validates the Node archive against its official checksum, and starts no server.
- Keep ordinary permission prompts. Do not enable bypass mode or automatic PR fixing/publishing.
- Select an available Claude model in the Cloud UI. The prompt explicitly scopes this Cloud task to the Cloud-selected Claude route; it does not change the workstation's Astra/Gateway configuration or EVA's OpenAI/ElevenLabs runtime. Do not copy local Gateway configuration/tokens into Cloud. If the repo's local model/plugin setup blocks startup, use the platform's model selector or report the conflict—do not rewrite project routing or install another proxy.

```dotenv
EVA_NODE_VERSION=24.14.0
EVA_TOOLCHAIN_ROOT=/opt/eva-w3
PLAYWRIGHT_BROWSERS_PATH=/opt/eva-w3/ms-playwright
EVA_BROWSER_CHANNEL=chromium
EVA_SCULPT_WORK_DIR=/tmp/eva-w3-sculpt
EVA_SCULPT_REVIEW_EVERY=3
EVA_W3_MAX_TURNS=0
BASH_DEFAULT_TIMEOUT_MS=300000
BASH_MAX_TIMEOUT_MS=600000
```

**No API keys are needed.** Do not add OpenAI/ElevenLabs keys, the voice ID, an Anthropic API key, local proxy URLs or private `.env` values. Cloud Claude's own authentication is supplied by the platform, not by these files. The earlier local voice allowance does **not** authorize Cloud voice calls or paid visual generation.

Variables in environment settings reach new sessions; shell `export`s or background processes in setup are not assumed to survive a cached VM. `env.sh` reconstructs the tool path for every task-side command. Setup runs as root on the documented Ubuntu image; tasks use the provisioned files. Keep provisioning within the platform's roughly five-minute caching window where possible; dependency/browser installation happens after clone in the task, so it need not be part of that cache window.

## 3. Start the task

Select the prepared branch and environment. Paste [PROMPT.md](PROMPT.md) as the task message.

Claude's first task-side commands are:

```bash
bash week3/cloud/session.sh prepare
# Run this one as a session-scoped background command:
bash week3/cloud/session.sh start
```

`prepare` verifies the current snapshot, runs `npm ci --include=dev`, installs the **project-pinned Playwright Chromium** and Linux browser libraries, snapshots protected files, extracts reference study sheets, and runs tests/build. It never invokes Claude recursively or calls a provider. No service is started in cached environment setup.

The preview is `http://127.0.0.1:1430/?fixture&state=idle&stance=attentive&seed=42` **inside the VM**. Your own computer's localhost is not the Cloud VM. Review the session's actual image/video/file outputs or a platform-provided preview if available; do not assume this is a public URL or deploy it merely to make a link.

Cloud fixtures remain visibly labeled synthetic. They exercise visuals/state transitions, not live inference. Linux screenshots are not native Windows, speaker, microphone or workstation-GPU evidence.

## 4. Sculpt, capture, inspect; pause every three passes

After reference inspection and the prompt's targeted artistic clarification, Claude performs three meaningful iterations. The shell tools only support that workflow: **the prompt drives Claude's editing/critique loop**. There is no cron job, infinite `claude -p` loop, hidden API client, grading-model call or guaranteed 24/7 execution.

Use fresh IDs; the capture scripts refuse overwrites:

```bash
bash week3/cloud/session.sh status
bash week3/cloud/session.sh capture w3-cloud-20260928-a-baseline
bash week3/cloud/session.sh source-eye w3-cloud-20260928-a-identity
# After a scoped visual edit:
bash week3/cloud/session.sh test
bash week3/cloud/session.sh capture w3-cloud-20260928-a-p1-a1
# Then p2, p3, with actual visual critique between them; pause for owner feedback.
```

Reference study outputs are under `$EVA_SCULPT_WORK_DIR/references/manifest.json`: original-still paths, full GIF frames when bounded, full-span sampled MP4 contacts and three detailed frames per motion reference. They are private analysis aids, not licensed runtime assets. Sampling is not a claim of having watched or listened to full motion.

The guard hashes protected voice/backend/schema, instruction/config and archived files without printing their contents. It refuses drift from its initial snapshot. It is an accidental-change check, not a tamper-proof permission system; Claude must not rewrite the baseline to conceal changes. Existing captures remain under `week3/docs/design/revisions/`.

`EVA_SCULPT_REVIEW_EVERY=3` is read/validated by the wrapper and used by the prompt's review protocol. It is **not a token, dollar or platform-enforced session cap**. Cloud usage/rate limits still apply; the VM may expire when idle, and background processes do not survive expiry. Resume with `session.sh prepare` when needed, then restart the preview. No automatic acceptance follows a successful run.

### Continue after reviewing a batch

Paste into the same Cloud session:

> Continue the next three-pass sculpting batch. Keep the state-changing/voice contracts unchanged and retain Week 1 eye identity. Keep: [specific features]. Change: [specific motion/material/form problems]. Prioritize reference [filename/moment]. Ask only genuinely unresolved artistic questions before a new direction. Implement, capture, compare and critique each pass; show the strongest candidate after pass three and wait. No provider calls, commits, push, deployment or phase acceptance.

## Scope, compatibility and verification

Added tools live here; shared browser helpers add `EVA_BROWSER_CHANNEL` support without changing Windows/macOS's existing Chrome default. Linux defaults to bundled Chromium. `source:eye` now accepts a unique `EVA_CAPTURE_REVISION`, avoiding its prior fixed-directory collision. Vite remains loopback-only on 1430; voice/controller/backend code is not changed by this handoff.

This pack does not modify `.claude/settings.json`, register hooks, reset routing or add an API SDK. The project-specific prompt, wrappers and capture commands document the launch path; a future `/run-skill-generator` pass could package it as a project skill if desired.

Local checks performed for this pack are recorded in [VERIFICATION.md](VERIFICATION.md). A fresh Linux Cloud provisioning run remains distinct from local Windows/Git Bash verification. If Cloud setup/install/browser access is blocked, report the exact step and stop; do not claim the environment was created or that visual inspection ran.

Official references checked for this handoff:
- [Cloud environments: variables, root Ubuntu setup, caching and tools](https://code.claude.com/docs/en/cloud-environments)
- [Claude Code in the cloud: branch/bundle transfer and session limits](https://code.claude.com/docs/en/claude-code-on-the-web)
