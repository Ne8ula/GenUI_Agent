# EVA - Week 1 vertical slice

**Demo outcome: successful, reported by the owner on 2026-09-17.** Additional notes will be added later. This folder preserves the runnable demo and its development history as a separate npm workspace project. The [outcome record](docs/design/acceptance/week1-outcome.md) records the owner's feedback without assigning an unreported executable hash or advancing later milestones.

## What we built

EVA became a working Windows desktop application built with Tauri 2, React, TypeScript and Rust. The demo connects a voice request to a synthetic weather dashboard, retrieves a stored preference through Rust, and visibly constructs and revises the interface while a social eye and spoken responses accompany the interaction.

| Area | Week 1 result |
| --- | --- |
| Native foundation | Installed and checked Rust/Cargo, MSVC/Windows SDK and WebView2; scaffolded Tauri/React; verified the window-to-Rust IPC connection. |
| Weather and memory | Bundled seven days of synthetic Ithaca weather and an inspectable Markdown Celsius preference; added strict schemas, bounded read-only memory IPC and matching browser fixtures. |
| Reactive interface | Reusable weather components, day selection, dragging, manual pointer/keyboard resizing, width-dependent reflow and scrolling; patches preserve card identity, geometry and selected day. |
| Visual identity | Iterated from a setup screen to Evangelion-inspired red, black and bone typography, biomechanical frames, coarse pixel/dither effects and narrow matrix connectors. Fonts: Space Grotesk, IBM Plex Sans and IBM Plex Mono. |
| Social eye | Anatomical eye shape, square pupil, fast cursor attention, coordinated socket/lid/brow movement and blinking. The same eye shrinks and docks to make room for the dashboard. |
| Construction sequence | Folder-style memory retrieval followed by progressive CRT scan-line construction. The final weather sequence lasts about 15 seconds to accommodate narration. |
| Desktop overlay | Transparent frameless window with no Windows title bar or shadow; opaque eye, loading and dashboard surfaces remain connected over the desktop. |
| Speech input | Microphone capture and a bounded Whisper transcription request; narrow weather and wind intent matching, cancellation and error handling. |
| Spoken replies | Direct ElevenLabs v3 synthesis with a shared prompt policy, fixture-grounded weather summary, local playback sequencing and cancellation. Each clip has 1000 ms of trailing silence. |
| Wind follow-up | Only a spoken follow-up reveals wind. EVA acknowledges, the wind section builds for five seconds, then the data appears and EVA speaks again. |
| Final cleanup | Removed explanatory presentation copy, Weather/Type shortcuts, Celsius controls, Add Wind, Quiet and other demo buttons. Speak request floats below the eye. |

The weather and memory are deliberately synthetic. Whisper and ElevenLabs can make real configured provider requests, but dashboard generation is a deterministic, validated component/revision flow. This is not a general-purpose LLM agent, semantic memory search or live weather service. The visual folder search is authored choreography, not a filesystem scan. No GPU throughput benefit was benchmarked, and ComfyUI was not installed for this slice.

## Run it

Requirements and historical installation evidence: [Windows prerequisites](docs/setup/WINDOWS_PREREQUISITES.md). The project expects Node 24.14 or newer, Rust's Windows MSVC toolchain, Visual Studio C++ Build Tools/Windows SDK and WebView2.

From the repository root:

```powershell
cd week1
npm.cmd ci
# Fresh setup only; preserve existing private configuration:
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd run desktop:dev
```

The existing local dependencies and private `.env.local` were moved here during organization; no credential values were changed or copied into documentation. For this workstation, skip installation/configuration if already present and simply run `npm.cmd run desktop:dev` from either the repository root or `week1/`.

Configure these backend-only settings in `week1/.env.local`:

```dotenv
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

Do not prefix secrets with `VITE_`. Restart desktop development after changing settings. Use one dev server at a time: port 1420 is fixed, so close the previous session before relaunching. Browser fallback is available with `npm.cmd run dev` at `http://127.0.0.1:1420`; it uses the fixture adapter instead of native IPC and does not prove native transparency or permissions.

## Demo interaction

1. Click **Speak request**, ask for the weather in Ithaca, then click **Send recording**.
2. EVA acknowledges; the eye docks and the memory/CRT construction plays. The weather panel appears with a short forecast summary and follow-up invitation.
3. Drag the panel, select a day, and drag its bottom-right grip to demonstrate responsive layout. The move and resize handles also support arrow keys when focused.
4. Click **Speak request**, say **"What about the wind speed?"**, and send the recording.
5. EVA says "Give me a second." After that clip completes, a five-second CRT sequence builds the wind section, then EVA introduces it. Existing geometry and selected day persist.
6. Dismiss the dashboard or press Escape. A new session starts with wind hidden again.

Recording cancellation, synthesis failures and reduced-motion behavior are supported. Repeated wind requests do not duplicate the panel. Starting another microphone request, dismissing or hiding the document cancels pending wind work.

## Voice decisions

EVA owns the scripts, verified fixture facts, timing and cancellation; ElevenLabs renders speech. The final model is `eleven_v3` with Natural stability `0.5`. Five approved phases cover acknowledgement, building, forecast presentation, wind acknowledgement and wind presentation. The forecast presentation derives Thursday/Friday conditions from the same fixture displayed in the UI.

The owner's cue-first scripts use emotional tags and punctuation; short demo replies have explicit exceptions to the longer-context guidance. `[speed: 1.25x]` and hyphenated phrases are experimental literal cues, not guaranteed provider speed controls. Playback leaves at least 1.2 seconds between completed clips, with stage-specific timing, and adds a 1000 ms silent tail plus a small end-of-waveform fade. See [VOICE_PROMPTING.md](docs/design/VOICE_PROMPTING.md) and the [approved scripts/profile/policy](fixtures/narration/).

## Folder map

| Path | Contents |
| --- | --- |
| [apps/desktop/](apps/desktop/README.md) | React interface, Vite development adapters, Tauri configuration and Rust commands. |
| [packages/protocol/](packages/protocol/) | Closed JSON schemas, validators, weather/revision contracts and voice/narration policies. |
| [packages/ui-system/](packages/ui-system/) | Shared components and visual tokens used by this slice. |
| [fixtures/](fixtures/) | Synthetic weather, Markdown memory and approved narration configuration. |
| [scripts/](scripts/) | Toolchain launchers, validator generation, contract tests, provider checks and historical browser/native harnesses. |
| [WEEK1_DEMO_PLANNING.md](WEEK1_DEMO_PLANNING.md) | Original execution plan and implementation checkpoints. |
| [docs/design/WEEK1_DEMO.md](docs/design/WEEK1_DEMO.md) | Original visual brief; later owner refinements are documented in the revision history. |
| [docs/design/INDEX.md](docs/design/INDEX.md) | Full iteration index, linked manifests, screenshots, recordings and historical results. |
| [docs/design/acceptance/](docs/design/acceptance/) | Stage-specific reviews and final owner-reported demo outcome. |
| [docs/setup/](docs/setup/) | Windows installation and memory-contract setup evidence. |
| [docs/archive/](docs/archive/) | Relocation map, pre-move hashes and post-move verification. |

The shared [product plan](../PLANNING.md), [canonical design guide](../DESIGN.md), [development instructions](../AGENTS.md), research proposal and original research concepts remain outside this folder. They govern the wider project rather than only Week 1.

## Verification and history

Run these from `week1/` or use the same forwarded commands from the repository root:

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run memory:check
npm.cmd run rust:test
npm.cmd run rust:fmt
npm.cmd run rust:clippy
```

The [relocation check record](docs/archive/verification.md) distinguishes checks rerun after moving from prior results. Historical evidence includes real Rust IPC, positive/negative memory and schema cases, browser layout/resize checks, motion recordings, Whisper checks and successful v3 provider responses. Earlier Windows Application Control failures and rejected visual candidates are preserved rather than erased by the successful demo report.

For the final microphone-only UI, use `node scripts/speak-only-smoke.mjs <new-output-directory>` against a running dev server. The wind dialogue harness is `node scripts/wind-dialogue-smoke.mjs <new-output-directory>`. These use synthetic microphone/provider fixtures. Older button-based harnesses describe superseded interfaces and may no longer run against the final UI. Do not rerun historical captures into existing evidence directories. The provider checker makes billable live requests; it is not part of routine tests.

Historical manifests retain their original source paths, hashes, commands and findings. Their paths were relative to the then-project root, which is now this folder; references to shared documents were adjusted. The [relocation map](docs/archive/relocation.json) records old/new paths and pre-move hashes. It intentionally excludes credentials, installed dependencies and generated build caches. The local npm workspace junctions were refreshed and stale Tauri build metadata was rebuilt after moving.

## Notes to add later

Owner's Week 1 retrospective notes are pending. Add observations, audience feedback, rough edges and candidate next steps here when supplied. This successful demo does not by itself accept S0-S4, full-product milestones, production security, general agent behavior or the relocated build as a newly exercised native release.
