# Synthetic memory command — week-one step 2

The source of truth is [weather-units.md](../../fixtures/vault/preferences/weather-units.md), a public synthetic fixture. Its six metadata fields determine the returned preference; there is no second hardcoded record in the browser adapter.

From the repository root, run the offline contract fixture:

```powershell
npm.cmd run memory:check
```

Expected: **3 JavaScript tests and 7 Rust memory tests pass**. They cover the exact source/field response, changed units derived from source, malformed metadata, duplicate/unknown fields, invalid dates, missing content, size limits, and unknown IDs/path attempts. The existing runtime-probe tests remain available in `npm.cmd run rust:test` (10 Rust tests total).

For the actual recorded IPC result, inspect [native results](../design/revisions/week1-memory-20260916/native/results.json), specifically `checks[].memoryLookup`. It contains `transport: "tauri"`, all six fields, the exact Markdown string, and the display-only source reference. The [browser result](../design/revisions/week1-memory-20260916/browser/results.json) has the same record and explicitly reports `transport: "browser-fixture"`.

## Contract

The native command is `get_demo_memory` with arguments:

```json
{ "request": { "recordId": "weather-units" } }
```

It returns `id`, `category`, `value`, `scope`, `source`, `recordedDate`, `markdown`, and `sourceReference`. Current metadata is `weather-units`, `preference`, `Celsius`, `weather`, `synthetic-demo`, `2026-09-16`. The display reference is `fixtures/vault/preferences/weather-units.md`; it is not an instruction to open a user-supplied path.

Only the local `main` window receives `allow-get-demo-memory`. The command maps the exact ID to an `include_str!` resource compiled into the application. It does not read a private vault, open arbitrary paths, write files, run shell commands, or access the network. Editing the fixture requires a Rust rebuild; a missing fixture prevents compilation. The parser's absent-source branch returns `record_unavailable` and is unit-tested; it is not a live filesystem lookup.

The deliberately small frontmatter dialect accepts exactly six unquoted scalar lines between `---` delimiters, followed by nonempty Markdown content. Order may vary; duplicate or unknown fields, non-synthetic provenance, unexpected scope/category/ID, unsupported units, invalid calendar dates, NULs and sources over 4096 UTF-8 bytes fail closed. Accepted units are `Celsius` and `Fahrenheit`. General YAML features are not supported. The original Markdown, including line endings, is returned unchanged.

`getDemoMemory()` in `apps/desktop/src/memory.ts` calls native IPC or reads the same fixture via Vite's raw import. The native response must contain exactly the contract fields and agree with its Markdown. The adapter distinguishes its transport and maps failures to **Demo memory unavailable**. It does not silently attribute a default preference to memory. A later inspector must render `markdown` as escaped text, not executable Markdown/HTML.

## Current integration retest

The weather workspace now consumes the adapter and exposes the exact source. Use the [desktop README](../../apps/desktop/README.md) and `scripts/weather-smoke.mjs` for current browser/native exercises. The latest native executable launch is blocked by Windows Application Control; the preceding native candidate passed real memory IPC. The following scaffold commands are historical and do not match the current UI.

## Historical step-2 integration retest

Run `npm.cmd run desktop:dev` in one terminal so the current Rust host and Vite server are available. In another terminal, choose a new evidence folder (existing renditions must not be overwritten):

```powershell
node scripts/smoke.mjs --memory --output docs/design/revisions/week1-memory-20260916/owner-native
node scripts/smoke.mjs --memory --browser --output docs/design/revisions/week1-memory-20260916/owner-browser
```

The first command launches a separate debug-host instance, imports the adapter from the local development server, verifies real IPC and rejection cases, and closes only its own test window. The second uses a temporary headless Edge session. These checks require development mode; the current production UI does not yet import the memory adapter. Screenshots show the existing scaffold and are regression evidence, not a memory inspector.

Step 3 will consume this preference in the weather instrument. The full memory dossier remains step 5. The release-build Application Control blocker from the setup checkpoint remains unresolved; this work does not require changing that policy.
