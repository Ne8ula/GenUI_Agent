# Higgsfield: UI and vocabulary authoring

Status: official CLI 1.1.25 and three Codex companion skills installed; browser sign-in started, account authorization pending verification. Checked 2026-09-16.

## Purpose

Use Higgsfield with the development agent to create complete EVA dashboard concepts, a coherent component vocabulary, state variations, and motion references. Convert selected work into the native bounded design system in [DESIGN.md](../../DESIGN.md). This is a development workflow; EVA's runtime remains a local interactive renderer consuming validated declarative data.

This extends the authoring role described in PLANNING.md Sections 4.1 and 14.14 following the owner's 2026-09-16 request. The runtime restriction there still applies: optional media services do not generate operational authority, trusted badges, or executable primary-overlay UI. Development-time UI/source generation is reviewed through the ordinary implementation process.

## Sequencing with ComfyUI

Owner decision, 2026-09-16: install ComfyUI at the start of S3, after explicit S2 acceptance. Use Higgsfield for early development-time design exploration and reusable visual references; use mocked media jobs in the application before S3. The week-one demo must run without a generation request or a connected creative service.

At S3, test one reviewed local still-image workflow with one active job. Compare no-media, cached-media, and generated-media paths; measure cold/warm generation time, queue time, peak/free VRAM, and UI frame times with generation idle and active. Test cancellation, failure, and late/superseded results. ComfyUI is an optional asset-production tool, not an accelerator for React interaction or cloud reasoning. Keep it only if the measured benefit warrants the complexity; its absence must not block the study prototype. This is a schedule, not an installation or benchmark result.

## Connection and capability evidence

The plugin directory returned Higgsfield as available but not installed. The initial host-plugin suggestion has been superseded for this IDE workflow by the official CLI plus companion skills, following the owner's request to install the best-fitting option. No duplicate MCP/plugin connection was added.

Installed and locally verified:

- `@higgsfield/cli` 1.1.25 via user-level global npm installation; `higgsfield.cmd version` succeeded.
- Official `higgsfield-generate`, `higgsfield-websites`, and `higgsfield-brandkit` skills from `higgsfield-ai/skills` in the user's Codex skills directory. New skills become available on the next turn.
- `higgsfield.cmd website --help` exposes create, repo-access, deploy, status, and other website operations.
- `higgsfield.cmd auth login` opened browser authorization. Installation and help output do not establish an authenticated account or paid entitlement. Verify with `higgsfield.cmd account status` after sign-in; never inspect or print raw tokens.

Higgsfield [recommends its CLI for Codex](https://higgsfield.ai/mcp), and its [official skills repository](https://github.com/higgsfield-ai/skills) supplies generation, identity, and website workflows. These are development tools, not dependencies to ship inside EVA. Companion website instructions target Higgsfield-hosted products; they do not replace EVA's explicitly chosen Tauri architecture, fonts, visual review, or owner acceptance requirements.

The directory description advertises website, web-app, and browser-game creation as well as media. However, Higgsfield's [client connection guide](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent) says Website Building is unavailable in ChatGPT. These claims differ by surface or documentation state. Inspect the actual connected tool catalog before asserting UI/code generation or export support.

Preferred route: the installed CLI, with browser sign-in to the intended Higgsfield account. After authentication, check account status and the live model catalog. Use one bounded synthetic authoring request for an end-to-end check when generation scope and budget are established. Record actual tool/command, job/result identifier, output type, and retrieval result without credentials. No generation or website provisioning was performed during installation.

The website workflow involves local source editing and platform hosting. It does not automatically convert an image into EVA-compatible components. Use Codex to extract/implement the vocabulary and Higgsfield for supported visual generation; use hosted website operations only for a separately scoped prototype. Deployment makes a site live and is not part of installing these tools.

For a direct MCP client, Higgsfield publishes `https://mcp.higgsfield.ai/mcp` on its [official setup page](https://higgsfield.ai/mcp). This is an alternative route, not an additional required dependency. [Codex MCP documentation](https://developers.openai.com/codex/mcp) describes adding a Streamable HTTP server in the IDE's MCP settings, restarting the extension, and authenticating. A minimal direct-client configuration would be:

```toml
[mcp_servers.higgsfield]
url = "https://mcp.higgsfield.ai/mcp"
```

This snippet is documentation, not an installed configuration. Use host settings for the environment actually running the agent. The selected CLI route is invoked through the shell; installing it does not add MCP tools to the conversation. Do not add a duplicate connection or store tokens in this repository.

After connecting, establish which operations actually exist:

| Capability | Verification | Use |
| --- | --- | --- |
| Image/reference generation | Discover tool/schema and retrieve a synthetic result | Full UI concepts and component/state contact sheets |
| Motion/video | Check supported input, duration, status/result retrieval | Eye and transition studies; reference only |
| Website/web-app creation | Confirm tool availability in this client | Interactive design prototype, if supported |
| Source/editable project export | Inspect actual export format and dependencies | Reviewable implementation input, if supported |
| Cancellation and cost reporting | Check job controls and provider semantics | Bounded runs; truthful cancellation reporting |

If only media tools are exposed, create dashboard/state-board visuals through Higgsfield and have Codex implement the actual UI vocabulary in React/TypeScript. If source export is available, inspect and adapt the source to EVA's contracts. A hosted preview is not proof of Tauri compatibility. Do not auto-publish a prototype as part of a design experiment.

## Repeatable authoring loop

1. Read DESIGN.md, the active phase, and accepted scenario references. Use only synthetic or deliberately sanitized inputs.
2. Write one bounded brief with deliverables, fixed constraints, variable design questions, output formats, and a finite iteration budget. Distinguish generation credits from runtime cost estimates.
3. Generate the whole composition and a component/state board, not just decorative backgrounds. If the budget permits variants, vary one design dimension at a time while holding fixture values constant.
4. Inspect hierarchy, legibility, component reuse, responsive adaptation, state coverage, and compliance with the amber/red semantics. Archive candidates, including rejected alternatives.
5. Extract a vocabulary table: component name, anatomy, props, states, events, responsive rules, tokens, and evidence requirements. Exact text/data in a raster output must be reconstructed from the fixture.
6. Implement selected components through ordinary reviewed source changes in the authorized implementation phase. Add schemas, semantic interactions, and data bindings. Keep effects separate from reading surfaces.
7. Render the same scenario locally, compare against the concept, fix behavior and visual differences, and record before/after evidence. Test without Higgsfield, without media, and in reduced-effects mode.
8. Present a reproducible owner review packet. Only an explicit owner decision promotes a baseline or closes a phase.

This is the useful 2D counterpart to agent-driven tool workflows: brief → specialist tool output → inspection → reusable implementation → rendered verification. A strong initial generation can accelerate the cycle; it does not establish behavior, accessibility, safety, or acceptance on its own.

## Ready-to-use first brief

```text
Design EVA's two-dimensional floating desktop instrument system.
Produce a complete seven-day weather dashboard, a calendar-planning
dashboard using the same visual vocabulary, and a component/state board.
These are synthetic design prototypes, not live services.

Style: expressive social eye, precise mechanical instruments, architectural
negative space, void black, bone white, industrial amber for activity.
Emergency red appears only in safety/failure states. Use Space Grotesk
headings, IBM Plex Sans body/controls, IBM Plex Mono data. Keep text and
chart labels crisp. Confine dither/bloom/CRT effects to eye or media regions.
Do not reproduce protected characters, logos, or franchise interface art.

Weather fixture: fictional location, seven explicitly dated days,
high/low temperatures in Celsius, precipitation percentages, wind in km/h,
and a visible synthetic-source label. Include initial, add-wind, and
Friday-versus-Saturday comparison compositions. Keep values identical
across variants; use a supplied fixture when one exists.

Calendar fixture: fictional commitments and priorities in an explicit
timezone, fixed-event constraints, and a proposed two-hour writing block.
Include initial, revised, and conflict states. No live account actions.

Shared vocabulary: card header, evidence footer, metric grid, forecast
strip, chart with axes/units, agenda, priority list, constraint chips,
memory dossier, compact work status, optional media slot. Demonstrate
loading, empty, provisional, verified-mock, stale, and error states.
Safety confirmation is a separately labeled reserved host surface;
do not implement approval behavior in generated content.

Show 1440x900 and 2560x1440 layouts. Preserve readable type and card
identity across revisions. Eye yields space to task content. Wallpaper
is context, not part of the app. Avoid a generic full-screen admin panel.

Return full compositions and a component/state contact sheet. If the
connected tools support a web prototype and source export, provide an
unpublished interactive prototype and editable source; otherwise return
clearly labeled visual concepts. Report actual output capabilities.
Request accompanying component/token/state notes where supported;
the development agent will extract them when only images are returned.
```

Before submission, attach the precise synthetic fixture, selected references, and explicit supported generation settings. The brief is prepared here; no generation is claimed to have run.

## Review packet

Save actual outputs in a new `docs/design/revisions/<revision-id>/` directory with the DESIGN.md manifest fields, plus prompt/brief, provider job IDs, output capabilities, asset/source provenance, credit/cost information if exposed, and limitations. Do not store credentials or expiring authenticated URLs in public records. Link the resulting vocabulary decisions to DESIGN.md and the eventual registry changes.

Acceptance checks: weather/calendar share components; data and labels remain editable; reading surfaces are crisp; trust labels are honest; pinned geometry survives revision; keyboard and cancellation work; optional media failure does not block use; no generated approval authority; no required cloud call for local interaction. UI generation is complete only when the reviewable implementation meets its scoped checks, not when an attractive image finishes rendering.
