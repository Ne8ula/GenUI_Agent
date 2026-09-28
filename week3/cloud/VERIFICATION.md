# Cloud handoff verification

2026-09-28. Scope: prompt, environment provisioning/task helpers and browser-script portability—not another visual redesign. No Cloud VM/session was created or run by this task. Owner chose **Claude Code on the web** and a review pause after **three passes**.

## Executed locally

Windows 11, Node 24.14.0, Git Bash, existing ffmpeg and Chrome:

| Check | Actual result |
| --- | --- |
| `bash -n` on setup/environment/task scripts; task `help` | Passed; no provisioning/install executed |
| Visual-only environment isolation | Passed with synthetic test values: app-provider keys removed from the child shell, runtime allowance forced to 0 and review cadence validated as 3; no real key values printed |
| `node --test week3/cloud/tools.test.mjs` | 5 tests passed: Linux/Windows browser selection, invalid channel rejection, bounded reference sampling, protected-file drift and immutable-baseline behavior |
| `node week3/cloud/preflight.mjs` | Passed on current local snapshot; all required source/reference inputs found |
| Reference extraction | 8 references inventoried; GIF/full-span video contact sheets and detailed frames generated under the session scratch directory; one generated box-overlay contact sheet opened and inspected |
| Protected-file guard | 1,041 protected files fingerprinted and rechecked unchanged, including reference media; a separate temporary test repository verified detection of protected-file edits without touching app files |
| `npm --prefix week3 test` | 113 existing tests passed |
| `npm --prefix week3 run build` | TypeScript/Vite build passed |
| `npm --prefix week3 run smoke` | Passed with synthetic microphone/IPC test doubles; no real microphone or provider calls |

These results do **not** establish successful Ubuntu provisioning, root package installation, Cloud network allowlist access, Playwright Chromium download/launch in Cloud, native Windows behavior in Cloud, or aesthetic improvement. The first Cloud session must execute its own preparation, captures and review loop. Linux defaults to bundled Chromium; the actual local smoke used the preserved Windows Chrome default.

No renderer, state machine, voice implementation, Rust backend, original references or archived application files were edited in this task. Shared browser changes are limited to selecting an available browser and accepting a fresh identity-capture revision ID. No credentials were read/copied, no billable provider generation occurred, and no commit/push/deployment was performed.

A concurrent checkpoint `985a948` appeared during preparation and was preserved. This pack and the three browser-script edits remained separate working-tree changes at verification; ensure they reach the selected Cloud branch.

## Provenance

Main session: environment-declared Astra, file/shell tools, official Claude Code Cloud documentation via WebFetch. One native read-only `eva-researcher` worker, configured as Terra, inspected existing script/Cloud compatibility; no new independent provider-route audit was performed for that worker. Ruflo `hooks_route` was advisory only. No API-managed agent, Anthropic SDK client, scheduled loop or new routing service was introduced.

The script files are intended for review and use in the new environment. Setup only provisions files/tools; the pasted prompt drives Claude's three-pass implementation → capture → critique loop. Subjective visual judgments never replace owner acceptance.
