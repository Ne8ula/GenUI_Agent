# Week 4 Cloud pack verification

Date: 2026-10-03. Source: `d25d705` on `week-3`. Scope: documentation and Cloud setup tooling only. No Week 4 product implementation or accepted baseline is claimed.

## Files prepared

- [CLOUD_PROMPT.md](../CLOUD_PROMPT.md): unattended, bounded non-visual implementation task and hand-back requirements.
- [README.md](README.md): environment setup, source-transfer prerequisites and launch instructions.
- [environment.env.example](environment.env.example): eight non-secret values; no model-selection, provider-key or spending grant.
- [setup-environment.sh](setup-environment.sh): repo-independent provisioning preflight to paste into Cloud's setup field.
- [cloud-setup.sh](../scripts/cloud-setup.sh): repository-session bootstrap after checkout.
- [test-cloud-setup.mjs](../scripts/test-cloud-setup.mjs): isolated fixture tests with mocked dependency commands.
- `week4/.gitattributes`: LF checkout rule for shell scripts.

## Actual local checks

Run by the integrating main session on Windows with Git Bash, after reading the worker's full script and test source:

| Check | Actual result |
| --- | --- |
| `bash -n week4/cloud/setup-environment.sh` | Passed |
| `bash -n week4/scripts/cloud-setup.sh` | Passed |
| `node --check week4/scripts/test-cloud-setup.mjs` | Passed |
| `node --test week4/scripts/test-cloud-setup.mjs` | **15 passed, 0 failed, 0 skipped** |
| Environment example parser | Eight unique assignments; all three Boolean controls valid; no credential/routing keys |
| Provisioning script on the non-Linux host | Correctly refused with the Linux-only diagnostic before installations or repository work |
| Final pack checks | Eight new files passed LF/final-newline/trailing-whitespace checks; 15 local links resolve; the env example is not ignored |
| Preservation/scope | All six original JPG hashes unchanged; `git diff --check` passed; only `week4/` is untracked, with no tracked-file changes |

Test temporary files were created under the session scratchpad for the integration run and cleaned by the suite. The tests inject mock npm/cargo/rustc commands; **no package or crate download occurs**. They cover missing source documents, absent-manifest deferral, exact Week 4-scoped locked npm arguments, lifecycle-script defaults/opt-in, missing lockfiles, archive/root script-forwarding rejection, strict Boolean validation, Node-install opt-out, Rust deferral/lock requirements, exact locked Rust command and missing cargo.

These tests exercise command selection and guards, not actual npm/cargo registry behavior. The script's forwarding checks are conservative safeguards, not a security sandbox or proof that arbitrary dependency code is safe. No app tests are claimed; no application exists in Week 4 yet.

## Execution provenance

- Main session: harness identifies `claude-gpt-6-astra[1m]`; wrote the prompt, environment guide/template and repo-independent provisioning preflight; inspected, integrated and tested the worker files.
- Native `eva-researcher`: configured Terra (`claude-gpt-5.6-terra[1m]`), read-only repository discovery with Read/Glob/Grep. Reported existing Week 3 setup patterns and archive/root pitfalls.
- Native `claude-code-guide`: read-only official Cloud-documentation lookup. Its exact resolved model was not independently established. The final guide does not repeat its initially unsupported automatic-save/push inference; setup checkout ordering remains unestablished and is not assumed.
- Native `eva-implementer`: configured/environment-reported Sol (`claude-gpt-5.6-sol[1m]`), wrote only the repository bootstrap, its tests and Week 4 `.gitattributes` in an isolated worktree. Main copied the three reviewed files without overwriting existing files and reran the suite.
- Direct correlation of these native worker IDs to Model Gateway route metadata was not found, so exact transport attribution is **not independently verified**. No claim of Opus 5.5 authorship is made for this Cloud pack; that verified authorship belongs to the earlier art-direction documents.
- Ruflo `hooks_route` supplied advisory routing only. No Ruflo inference path, authentication change, permission bypass, router installation, shared-branch switch, commit or push was used.

## Not run / remaining limits

- **Actual Ubuntu/Claude Cloud provisioning: not run.** The owner must launch the environment and inspect its first setup/task output.
- Real npm installation, Cargo fetch and Cloud network policy: not tested; current Week 4 has no package/lock or Rust manifest/lock.
- Cloud model selection and local-plugin compatibility: not established by workstation tooling.
- Weave access, generation, finite spending allowance and fresh Week 4 image/video packet: not established; no assets uploaded or generated.
- Windows application, microphone/camera, GPU/transparency, wallpaper/window effects and restoration: not implemented or tested.
- No Cloud session, scheduled routine, API-provider test, public artifact, PR or deployment was created.

At preparation time `week4/` remained untracked locally. The owner must intentionally transfer the intended source to the remote branch before a normal Cloud clone can use it. No phase or owner acceptance is implied by this setup pack.
