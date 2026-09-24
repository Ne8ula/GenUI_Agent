# Higgsfield: UI and vocabulary authoring

Historical setup report, 2026-09-16: official CLI 1.1.25 and three Codex companion skills installed; browser sign-in started, account authorization pending verification. This research revision does not reverify connection or generate assets. Check the actual current capabilities before a future authoring run.

Current development harness: Astra in Claude Code, following [AGENTS.md](../../AGENTS.md) and [the development workflow](../development/AGENT_WORKFLOW.md). The Codex setup references below are historical client-specific notes, not a requirement to return to Codex. Verify CLI authentication and available tools in the active Claude Code session; do not assume Codex companion skills are automatically installed there or add a duplicate connection.

## Purpose

Use Higgsfield with the development agent to explore complete expressive-response compositions, a coherent primitive vocabulary, intervention/state variations, and motion references. Convert selected work into the native bounded design system in [DESIGN.md](../../DESIGN.md). This is a development workflow; EVA's runtime remains a local interactive renderer consuming validated declarative data.

E1 refinement, 2026-09-23: future authorized studies must depict **transparent desktop overlays**, dispersed independent elements, open space, and intervention sequences over explicitly contextual neutral light/dark/busy backgrounds—not black-artboard or presentation-board framing. Request alpha only after support is verified. The [replacement brief](revisions/e1-20260923-02/HIGGSFIELD_BRIEF.md) is prepared but not submitted; the prior three-job still-image allowance was already reported used. Do not generate again without remaining/new authorization. Actual Windows transparency and OS input pass-through require native evidence, never a concept bitmap.

This extends the authoring role described in PLANNING.md Sections 4.1 and 14.14 following the owner's 2026-09-16 request. The runtime restriction there still applies: optional media services do not generate operational authority, trusted badges, or executable primary-overlay UI. Development-time UI/source generation is reviewed through the ordinary implementation process.

## Sequencing with ComfyUI

Owner decision, 2026-09-16: ComfyUI installation cannot precede S3 and explicit S2 acceptance. Under the 2026-09-17 research reframe it is optional, with any installation requiring a separately authorized experiment. E1 uses authored procedural material and requires no generation service. Higgsfield remains available for scoped development-time exploration when connected; prepare briefs without running generation when authorization/capability is absent.

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

The website workflow involves local source editing and platform hosting. It does not automatically convert an image into EVA-compatible components. Astra coordinates extraction and reviewed implementation through the current development workflow; Higgsfield supplies supported visual generation. Hosted website operations require a separately scoped prototype. Deployment makes a site live and is not part of installing these tools.

For a direct MCP client, Higgsfield publishes `https://mcp.higgsfield.ai/mcp` on its [official setup page](https://higgsfield.ai/mcp). This is an alternative route, not an additional required dependency. [Codex MCP documentation](https://developers.openai.com/codex/mcp) describes adding a Streamable HTTP server in the IDE's MCP settings, restarting the extension, and authenticating. A minimal direct-client configuration would be:

```toml
[mcp_servers.higgsfield]
url = "https://mcp.higgsfield.ai/mcp"
```

This snippet is documentation, not an installed configuration. Use host settings for the environment actually running the agent. The selected CLI route is invoked through the shell; installing it does not add MCP tools to the conversation. Do not add a duplicate connection or store tokens in this repository.

After connecting, establish which operations actually exist:

| Capability | Verification | Use |
| --- | --- | --- |
| Image/reference generation | Discover tool/schema and retrieve a synthetic result | Whole response concepts and primitive/intervention contact sheets |
| Motion/video | Check supported input, duration, status/result retrieval | Composition/eye/transition studies; reference only |
| Website/web-app creation | Confirm tool availability in this client | Interactive design prototype, if supported |
| Source/editable project export | Inspect actual export format and dependencies | Reviewable implementation input, if supported |
| Cancellation and cost reporting | Check job controls and provider semantics | Bounded runs; truthful cancellation reporting |

If only media tools are exposed, create response/state-board visuals through Higgsfield and have the assigned development worker implement the vocabulary in React/TypeScript. If source export is available, inspect and adapt it to EVA's contracts. A hosted preview is not proof of Tauri compatibility. Do not auto-publish a prototype as part of a design experiment.

## Repeatable authoring loop

1. Read DESIGN.md, the active phase, and accepted scenario references. Use only synthetic or deliberately sanitized inputs.
2. Write one bounded brief with deliverables, fixed constraints, variable design questions, output formats, and a finite iteration budget. Distinguish generation credits from runtime cost estimates.
3. Generate the whole response composition and a primitive/intervention board, not just decorative backgrounds. If the budget permits variants, vary one design dimension at a time while holding fixture values constant.
4. Inspect hierarchy, legibility, component reuse, responsive adaptation, state coverage, and compliance with DESIGN.md's current palette and host-owned safety semantics. Archive candidates, including rejected alternatives.
5. Extract a vocabulary table: primitive name, factual binding, spatial anchors, bounded props, phases, intervention events, continuity rules, reduced-motion state, tokens, and evidence requirements. Exact text/data in a raster output must be reconstructed from the fixture.
6. Implement selected components through ordinary reviewed source changes in the authorized implementation phase. Add schemas, semantic interactions, and data bindings. Keep effects separate from reading surfaces.
7. Render the same scenario locally, compare against the concept, fix behavior and visual differences, and record before/after evidence. Test without Higgsfield, without media, and in reduced-effects mode.
8. Present a reproducible owner review packet. Only an explicit owner decision promotes a baseline or closes a phase.

This is the useful 2D counterpart to agent-driven tool workflows: brief → specialist tool output → inspection → reusable implementation → rendered verification. A strong initial generation can accelerate the cycle; it does not establish behavior, accessibility, safety, or acceptance on its own.

## Prepared expressive-response brief

This is a future authoring brief, not a submitted job or accepted visual direction.

```text
Explore EVA's revisable weather response as a composition inhabiting a
desktop. Produce two alternative response sequences and one shared
primitive/intervention board. Do not default to a dashboard/card grid.

Use DESIGN.md and E1's W-NYC-01 synthetic fixture exactly: NYC,
2026-10-14, America/New_York; 09:00/12:00/15:00; temperatures 18/22/21 C,
cloud cover 70/20/45%, precipitation probability 10/5/15%, wind 12/18/16
km/h; fixture as-of 08:00. Always label synthetic. These are not live facts.

Sequence: expose crisp facts; gather a dithered sun-like field around noon;
attend to an explicit afternoon selection; compare noon/afternoon while
preserving a manually pinned afternoon anchor; interrupt; settle into
reduced motion; show the same answer plainly. Make the intervention's
consequence visible. Do not hide information until an effect finishes.

Compare "part and relate" with "withdraw and re-anchor." The same facts,
reading order, controls, palette, and pin position apply in each alternative.
Show what persists across revisions. No emotion-to-color lookup or claims
that EVA feels empathy. No camera input is necessary.

Material: bone/void with restrained expressive red, square-cell dithering,
architectural negative space, spatial attachment to explicit referents.
Space Grotesk headings; IBM Plex Sans reading/controls; IBM Plex Mono
quantities. Effects never texture required text, source, focus or controls.
Show opaque local reading support on both light and dark synthetic wallpaper.
The wallpaper is context, not content that EVA generates or captures.

Vocabulary: fact-anchor, time-ribbon, dither-field, occlusion-layer,
attention-link, comparison-pair, reading-layer. Specify bounded props,
phase/event rules, stable IDs/anchors, locks, keyboard and reduced-motion
equivalents. Cloud fraction is distinct from rain probability.

Include missing-cloud, unavailable-location and renderer-failure states.
Safety-owned confirmation/authority remains a reserved host surface,
never a model-styled element. No generated approval or verified badge.

Provide matching 1440x900 and 2560x1440 compositions. If actual tools support
motion, add a short study showing the interruption/revision boundary.
If supported and separately scoped, return unpublished source for review;
otherwise label outputs as visual concepts and supply vocabulary notes.
Do not deploy, install dependencies, or claim the images implement behavior.

Optional transfer sheet only: DESIGN.md's fictional T-M-01 transit scenario.
Use labeled arrival ranges and restrained waiting rhythm, not fake train
positions or a sun animation reskinned as transit. Preserve every synthetic
service/direction disclaimer; no real journey advice.
```

Before submitting, attach the precise fixture, selected references, supported settings, deliverables and finite iteration/credit budget. Exact text/data must be reconstructed in native components. No generation is claimed by this document.

## Review packet

Save actual outputs in a new `docs/design/revisions/<revision-id>/` directory with the DESIGN.md manifest fields, plus prompt/brief, provider job IDs, output capabilities, asset/source provenance, credit/cost information if exposed, and limitations. Do not store credentials or expiring authenticated URLs in public records. Link the resulting vocabulary decisions to DESIGN.md and the eventual registry changes.

Acceptance checks: response alternatives share a vocabulary; explicit intervention changes the composition; data and labels remain editable/readable; qualitative effects do not misstate facts; provenance is honest; pins/focus/direct edits survive revision; keyboard, interruption and plain answer work; optional media failure does not block use; no generated approval authority or cloud call for local feedback. Visual concepts supply design hypotheses; implemented behavior and owner acceptance need their own evidence.
