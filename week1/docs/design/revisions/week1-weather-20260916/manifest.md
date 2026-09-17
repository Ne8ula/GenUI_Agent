# week1-weather-20260916

Status: **candidate; owner acceptance pending**. Date: 2026-09-16. Final browser verification passed; final native launch is blocked by Windows Application Control.

## Identity and intent

- Predecessor: accepted setup layout `week1-resize-20260916`; intervening step-2 memory implementation `week1-memory-20260916`. Owner authorized next implementation steps after reporting passing memory tests.
- Source: working tree based on `83a155f`; [source hashes](source-hashes.json). Owner planning/research edits were preserved. Nothing committed or published.
- Actual author: Codex / GPT-6, using PowerShell, apply_patch, React/TypeScript, Rust, Ajv, Playwright and Edge/WebView2. No additional model reviewer or development agent was invoked.
- Tool versions: Node 24.14.0, React 19.3.0, TypeScript 6.0.3, Vite 8.3.0, Ajv 8.20.0, Playwright 1.63.0, Edge/WebView2 153.0.4234.32; Rust 1.98.1 and Tauri 2.11.5 from the installed toolchain/lock. See lockfiles for exact transitive dependencies.
- Platform: Windows x64. Browser captures use local Vite; native successful captures use the embedded frontend at `http://tauri.localhost/`. DPR 1. Native viewport resizing uses CDP emulation, not dragging OS borders. OS chrome is not captured.
- Fixtures: `fixtures/connectors/weather-ithaca-week.json`, seven synthetic days September 17–23, 2026; `fixtures/vault/preferences/weather-units.md`, exact bundled synthetic source. No runtime clock, random seed, private data or live weather.
- Intent: establish a reusable visual vocabulary around one indexed forecast instrument, a small amber iris, restrained rules and a bone-white source dossier. Preserve the same card and user position across a validated preset revision/undo.

## Authoring and extracted vocabulary

The [Higgsfield brief](authoring-brief.md) scoped one GPT Image 2.5 reference board. The installed CLI authenticated after selecting the sole available workspace. The single generation attempt failed with `only_mcp_usage_on_trial_is_available` (exit 3). The empty `higgsfield-result.json` is retained as the failed command's output, not a generated result. No credits/output success is claimed, no other provider was substituted, and no hosted site or runtime media dependency was created.

Native implementation follows DESIGN.md directly: near-black surfaces, bone text, amber activity, Space Grotesk titles, IBM Plex Sans controls and IBM Plex Mono values. Shared tokens and reusable Action, IndexLabel, Eye and WeatherGlyph components live in `packages/ui-system`. Card frame, seven-day cells, evidence footer, preset toolbar and source dossier are ordinary React/CSS. Tokens are a candidate application of the design guide, not a newly accepted design system.

Closed Draft 2020-12 schemas live in `packages/protocol`; the only patch changes wind visibility at an expected revision. Unknown fields/components, authority-like extensions, incorrect references, stale/replayed revisions and invalid weather are rejected. Ajv generates standalone validators before dev/build/tests, keeping runtime CSP free of `unsafe-eval`. Local position and selection remain outside the patch. This is a bounded presentation contract, not authorization for product effects.

## Renditions and evidence

All previous renditions remain available. Screenshots from the smoke runner are full-page renders at the recorded CSS viewport, so they can be taller than the window; the recording stills are actual viewport captures.

| Artifact | Meaning |
| --- | --- |
| [Before results](before-02/results.json) | Actual accepted setup before visual edits, captured at 960×760, 1960×530, 1280×530, 960×530 and 400×640, DPR 1. Initial `before/` attempt had no Vite server and produced no screenshot. |
| `browser-01/` | First visual candidate; valid interactions, but captures caught fades partway and spacing needed refinement. Preserved, not selected. |
| `browser-02/` | More compact desktop instrument; visual inspection found temperature pairs crowding at 600 px. |
| [Final browser checks](browser-03/results.json) | Two full rehearsals; pointer/keyboard move, selected day/focus preservation, exact source, undo/reset, topmost Escape, quiet/reduced-motion checks. Individual day-cell overflow assertions added. |
| [Final base](browser-03/base.png), [final wind](browser-03/wind-1280x900.png), [narrow base](browser-03/base-400x640.png) | Final candidate components. Intermediate-width temperatures stack; narrow forecast becomes rows. Short windows scroll vertically. |
| [Earlier native checks](native-03/results.json) | Embedded debug candidate: real Rust preference/source/retry, normal close/relaunch and two complete rehearsals. Injected states cover pending/error, timeout, superseded replies, Fahrenheit derivation and HTML-like source rendered as text. |
| [Native failure](native-04/failure.txt), [policy events](native-04/policy-events.json), [blocked build hash](blocked-build-hash.json) | Final rebuilt executable compiled successfully but was rejected at launch by Windows Code Integrity events 3033/3077. Vite had been stopped. This is not a passed final native retest. |
| [Backup recording](recording-02/weather-demo.webm) | Final browser fixture, 1280×1000, DPR 1, normal motion: open, move, wind, inspect exact source, undo, reset, dismiss. Native IPC proof is separate. |
| [Viewport base](recording-02/base-viewport.png), [wind](recording-02/wind-viewport.png), [source](recording-02/source-viewport.png) | Representative stills of the same recording. `recording-01/` retains the preceding rendition. |

Final browser matrix: 960×760, 1280×900, 1960×530, 1280×530, 960×530, 600×760 and 400×640. Each covers base/wind/dossier with no horizontal page, card, day-cell or source overflow. Matching five viewport sizes link this candidate to the before-state. Motion is a 240 ms entrance fade and 180 ms wind reveal, suppressed by quiet/reduced motion; dismissal is immediate.

Native retest history: `native-01` could not initialize WebView2 in the restricted tool sandbox and normal close timed out. `native-02` and `native-03` passed outside that sandbox; their test windows closed normally. `native-04` failed to spawn after the final rebuild. Event logs identify signing-policy rejection, distinct from the earlier sandbox issue. No runtime/policy setting was changed. The previous successful executable hash was not saved before rebuilding; the blocked final executable hash is retained and must not be cited as a passed build.

The two final CSS refinements after `native-03` were stacked temperatures at intermediate widths and a sticky dossier close header. Their browser behavior passed in `browser-03`; no claim is made that the final native binary ran.

## Checks and limitations

- Eight JavaScript tests passed: three memory contracts, five weather/document/patch/reducer tests.
- Ten Rust tests, rustfmt and Clippy with warnings denied passed.
- TypeScript/Vite production build and debug native compilation passed. Final native execution blocked as recorded above.
- No uncaught JavaScript errors or external HTTP requests during the exercised browser/native scenarios. Production assets/fonts remain bundled. No live generation or cloud credential is required by the application.
- Sources are rendered as escaped text; loading/error/default attribution is explicit. Timeout and dismissed/superseded responses cannot silently apply later.
- Historical optimized release build remains blocked by Windows Application Control on a dependency build script. No installer/signing, policy bypass, macOS, real connector, voice, model conversation, memory write or GPU setup was attempted.
- This is not a full accessibility audit, performance measurement, product security review, S0–S2 completion or phase acceptance. Native final delivery remains incomplete until legitimate policy/signing review and a successful retest.

Owner feedback for this candidate: none yet. Decision/date: **pending**. Follow the [owner exercise](../../acceptance/week1-weather.md); launch instructions are in the [desktop README](../../../../apps/desktop/README.md).
