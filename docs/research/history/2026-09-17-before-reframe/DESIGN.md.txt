# EVA Design System

**Speak-only refinement (2026-09-17):** remove Weather/Type controls and the opaque command panel. Speak request sits beneath the eye on transparency, including when docked. Recording feedback, cancellation and errors remain available. [Evidence](week1/docs/design/revisions/week1-speak-only-20260917/manifest.md).

**Dialogue refinement (2026-09-17):** the owner requested a conversational forecast summary and a staged wind follow-up. Narration uses Eleven v3 with the shared [prompting rules](week1/docs/design/VOICE_PROMPTING.md). The wind request acknowledges first, then prints an embedded dither/CRT wind section over five seconds before revealing the values and speaking again. Preserve card dimensions and position throughout. [Candidate evidence](week1/docs/design/revisions/week1-wind-dialogue-20260917/manifest.md).

**Owner refinement (2026-09-17):** remove the Celsius preference control and its inspector from the demo UI, while retaining explicit units and the bundled Markdown source. Enlarge the dithered corner resize handle. Keep the existing folder/CRT choreography, extending it to 15 seconds for spaced narration. This supersedes the earlier 7.5-second timing and visible source-control requirement for this rendition. [Candidate evidence](week1/docs/design/revisions/week1-voice-pacing-20260917/manifest.md).

**Transparent surface / voice revision (2026-09-17):** the owner found the thick matrix connection poorly adapted to an absent background. The new candidate uses a narrow dark-backed dither braid with defined attachment collars, checked on light/dark synthetic backdrops. Weather instruments resize independently with a corner grip, local width-based reflow and internal scrolling. Remove Quiet, Add Wind, Undo and Reset buttons. Wind stays hidden until a recognized microphone follow-up ("What about the wind speed?"); its reveal preserves the user's panel geometry. OS reduced motion and essential voice, dismissal, movement and source controls remain. [Evidence](week1/docs/design/revisions/week1-resize-voice-20260917/manifest.md).

**Desktop overlay refinement (2026-09-17):** remove all global backgrounds, header/branding bars, native Windows decorations and full-window shadows. Render only the eye with its attached controls, dashboard or loading panel, and substantial red square-cell dithered connective tissue. Keep card contents opaque/readable. Connections follow card movement and reflow vertically on small windows; Quiet/reduced motion skips their reveal. The [overlay rendition](week1/docs/design/revisions/week1-overlay-20260917/manifest.md) replaces the earlier thin connector vocabulary. Native desktop compositing still requires owner verification.

Version: 0.1 candidate · 2026-09-16 · Owner visual acceptance: pending

**Biomechanical follow-up (2026-09-17):** the owner requested coordinated movement of the whole eye and a more biological interface. The [biomechanical candidate](week1/docs/design/revisions/week1-biomech-20260917/manifest.md) couples fast iris attention to slower socket rotation/stretch, lid and brow movement, subtle respiration and uneven blinking. Rib-like edges and branching connective curves extend this vocabulary into the instruments. Keep the square pupil, coarse dithering, red accent, legible controls and 7.5-second CRT construction; Quiet/reduced motion stops decorative movement. This is authored expression, not a physiological simulation or sensor readout. Acceptance remains pending.

**CRT/pacing follow-up (2026-09-16):** owner requested a 5–10 second loading sequence, folder-like memory retrieval, brutal red typography/frames, CRT scanlines that progressively construct the dashboard, dithered surfaces and faster pupil tracking. The [CRT candidate](week1/docs/design/revisions/week1-crt-20260916/manifest.md) uses 7.5 seconds of authored presentation and global pointer attention with a 40 ms smoothing constant. It preserves the square pupil, red semantics, actual readiness/cancellation and reduced-motion escape. This supersedes the shorter assembly timing below; it is not measured filesystem/model retrieval latency.

**Motion/eye follow-up (2026-09-16):** restore the square pupil, use substantially coarser pixel/ordered dithering, and visibly shrink/move the same eye to make room before a loading wireframe resolves into the weather panel. The [assembly rendition](week1/docs/design/revisions/week1-assembly-20260916/manifest.md) supersedes the round-pupil treatment below. Preserve red and the uncluttered application surface. Loading must respect actual data readiness and cancellation; local choreography is not provider progress. Quiet/reduced motion skips travel and presentation holds.

**Latest owner refinement (2026-09-16):** the current application uses Evangelion-inspired red (`#FF3B35`) instead of orange/amber. Remove presentation/helper copy from the main surface; use an anatomical, round-pupil eye with red halftone treatment from the supplied photographic reference. This explicitly supersedes amber-only activity rules and the earlier square-pupil candidate below for this rendition. Use pale-red error text plus an exclamation marker and clear error words; color alone never distinguishes danger or authority. See [the red-eye revision](week1/docs/design/revisions/week1-red-eye-20260916/manifest.md). Historical guidelines and evidence remain preserved; owner acceptance is pending.

This is the canonical visual and interaction specification for EVA. It implements the direction in [PLANNING.md](PLANNING.md), particularly Sections 6, 7, 9, 12–14, and 17, and fulfills the independent-study proposal's `GENERATIVE_UI_DESIGN.md` deliverable. Do not maintain a second competing design guide.

The owner authorized creation of this guide after editing the plan. That authorization does not accept new numeric tokens, visual candidates, or an implementation milestone. Requirements inherited from the plan are binding; values identified below as candidate defaults are starting points for owner testing. No runnable renderer or accepted application screenshots exist at authoring time.

## 1. Design intent

EVA is an expressive social eye accompanied by precise, movable instruments. The desktop remains the user's workspace. The eye acknowledges, listens, and yields space to the task; cards carry readable evidence, useful controls, and persistent spatial identity.

Use void black, bone white, industrial amber, mechanical geometry, thin annotation lines, and architectural negative space. Dithered specimen imagery, scanlines, restrained phosphor bloom, and chromatic separation belong in dedicated effect regions. Text, charts, focus rings, and consequential controls stay crisp.

Avoid a conventional full-screen SaaS dashboard as the default composition. Also avoid decorative telemetry, unreadable microtext, gratuitous card proliferation, and simulated verification. Every instrument must answer a task question or expose a useful action.

Historical concepts in [docs/research/visuals](docs/research/visuals) are reference material, not accepted screenshots. Their red active eye and typography do not override the selected fonts or amber-active/red-danger rule. Do not copy franchise characters, logos, artwork, or restricted fonts. Do not replace the user's wallpaper with the architectural reference background.

## 2. Authoring and runtime responsibilities

| Layer | Responsibility | Output and boundary |
| --- | --- | --- |
| Development design exploration | Codex with Higgsfield; optional Figma for editable component work | Full dashboard concepts, component/state boards, layout variants, motion studies, and prototypes where supported |
| Development implementation | Reviewed React/TypeScript components and local effects | Reusable, tested vocabulary committed through normal software changes |
| Runtime UI composition | Provider-neutral model adapter | Validated declarative component selection, data references, layout intentions, and small patches |
| Runtime rendering | Local trusted renderer | Typography, interaction, responsive layout, trust treatment, sanitization, and deterministic state |
| Optional runtime media | Bounded ComfyUI or Higgsfield adapter | Asynchronous illustrations; never the sole source of controls, chart values, or authority |

Higgsfield is part of UI and vocabulary authoring, not restricted to background imagery. A generated screen can propose an entire interaction language; the development agent extracts it into explicit reusable rules. A bitmap is a visual proposal, not an interactive dashboard. Generated source is development input for review, not code EVA evaluates from a runtime model response.

See [Higgsfield authoring workflow](docs/design/HIGGSFIELD.md) for connection status, capability checks, briefs, and deliverables. Capability must be verified in the connected client before promising web-app or source export support. Blender and 3D are not prerequisites for this 2D workflow.

Owner scheduling decision, 2026-09-16: install ComfyUI at the start of S3, after explicit acceptance of S2's weather/calendar interactions, conversational revisions, and simulated memory. Earlier phases use synthetic media-state fixtures and optional development-time Higgsfield outputs. S3 evaluates one reviewed still-image workflow with one active job, comparing no-media/cached/generated paths and UI responsiveness under load. Installation timing is settled; workflow, model, budget, and performance remain to be measured. The [week-one demo brief](week1/docs/design/WEEK1_DEMO.md) is an early visual checkpoint, not an exception to this gate.

## 3. Foundations and candidate tokens

### Semantic palette

The semantic roles are inherited requirements. Exact hex values are candidate defaults to validate on actual displays and varied wallpapers.

| Token | Candidate value | Use |
| --- | --- | --- |
| `color.void` | `#080A0B` | Internal dark backgrounds; dormant overlay itself is absent |
| `color.surface` | `#121618` | Readable opaque card bed |
| `color.surfaceRaised` | `#1B2124` | Menus, selected regions, secondary layers |
| `color.bone` | `#E8E4D9` | Primary information and dossier surface |
| `color.muted` | `#A8ADA9` | Secondary readable labels |
| `color.rule` | `#495155` | Decorative dividers; not sufficient alone for interactive boundaries |
| `color.active` | `#E8AD56` | Activity, selection, pending approval, untrusted evidence with a label |
| `color.danger` | `#F06C68` | Safety, failure, revocation, danger only |
| `color.ink` | `#101314` | Text on bone and amber surfaces |
| `color.focus` | `#F4D18C` | Visible keyboard focus with dark separation ring |

Activity, selection, provenance, freshness, and verification are separate semantics even when they share amber. Combine text and shape/pattern; never ask the user to infer authority from hue alone. Verified output uses a restrained bone-white label, not a green success glow. Charts use neutral/amber series with line styles and direct labels; red is not a routine data-series color.

Use an opaque backing where transparency would compromise reading. Candidate readability targets: 4.5:1 for normal text and 3:1 for large text and meaningful control boundaries. Measure rendered combinations, including dossier inversion and focus states. These are implementation checks, not a claim of formal accessibility conformance.

### Typography

| Role | Typeface | Candidate size / line height | Weight |
| --- | --- | --- | --- |
| Workspace title | Space Grotesk | 24 / 30 px | 500 |
| Instrument heading | Space Grotesk | 18 / 24 px | 500 |
| Section heading | Space Grotesk | 16 / 22 px | 500 |
| Body and controls | IBM Plex Sans | 15 / 22 px | 400 |
| Secondary label | IBM Plex Sans | 13 / 18 px | 400 |
| Data and timestamps | IBM Plex Mono | 13 / 18 px | 400 |
| Primary metric | IBM Plex Mono | 28 / 34 px | 400 |

Font families and baseline weights follow the owner selection. Numeric scale is provisional. Express sizes in scalable units during implementation; retain system text scaling. Use tabular numbers for changing/comparable quantities, sentence case for reading, and sparing uppercase for short instrument labels. Never compress a paragraph into mono or condensed text. Labels below 12 px must not carry required information. Long titles wrap; truncation requires access to the full text by keyboard as well as pointer.

Bundle reviewed font assets and licenses locally. Use system sans/monospace fallbacks without blocking the interface. Doto and the earlier Shippori Mincho baseline are not selected. Do not embed mojimo-EVA.

### Geometry and hierarchy

Candidate spacing steps: 4, 8, 12, 16, 24, 32, 48 px. Default card padding: 16 px; group gap: 16–24 px; rule: 1 px; corner radius: 2 px; compact control height: 32 px; primary controls: 40 px. Preserve adequate hit areas around small visual icons. Safety controls use at least 44 px height and 16 px separation as a candidate minimum.

Dark cards use one restrained edge and a subtle shadow to separate from wallpaper. Reserve bone-white inversion for memory dossiers or safety-owned reading surfaces. Do not simulate depth through multiple nested glossy panels. Decorative line endpoints must not resemble draggable handles.

## 4. Component vocabulary

Registry names below are proposed stable identifiers, to be implemented and schema-tested during the bounded-grammar phase. A component is not runtime-available until its implementation, schema, states, keyboard behavior, and fixtures exist. Registry ownership is a security boundary.

| Component | Purpose and required data | Allowed interaction | Owner / scope |
| --- | --- | --- | --- |
| `text-summary` | Short cited explanation; text and evidence refs | Expand, inspect citation, annotate | Generated composition; study |
| `metric-grid` | Comparable values with units, period, and missingness | Select metric, compare, inspect | Generated composition; study |
| `forecast-strip` | Seven dated daily records, location, timezone, units | Select day, request detail | Generated composition; study |
| `time-series-chart` | Ordered series, axes, units, evidence refs | Inspect value, toggle series, bounded range selection | Generated composition; study |
| `comparison-table` | Typed columns, stable row IDs, comparable units | Sort, select, compare | Generated composition; study |
| `agenda-timeline` | Dated intervals, timezone, conflicts, stable event IDs | Select, propose move, compare revision | Generated composition; study mocks |
| `priority-list` | Ordered items, explicit priority and constraints | Reorder proposal, annotate, select | Generated composition; study mocks |
| `constraint-chips` | Explicit constraints with source and scope | Add/remove through allowed intent | Generated composition; study |
| `media-slot` | Registered local asset ref, illustration label, job state | Retry/cancel through validated request | Generated composition; optional |
| `evidence-drawer` | Sources, freshness, lineage, verifier result | Inspect and navigate evidence | Renderer-owned; study subset |
| `memory-regions` | Episodic, semantic, preference, relational, affective, identity, procedural regions | Inspect retrieved synthetic records | Renderer-owned; study |
| `memory-dossier` | Claim, type, exact source, confidence, scope, sensitivity, conflicts, expiry | Accept, edit, reject, make temporary | Controlled memory workflow; study simulation |
| `agent-topology` | Specialists, artifact edges, status, budgets, holds | Inspect, pause, cancel, retry, collapse | Renderer-owned; product, bounded study subset |
| `rehearsal-diff` | Expected before/after, targets, outgoing data, reversibility, uncertainty | Inspect, revise proposal | Controlled workflow; no approval or execution |
| `workspace-history` | Events, revisions, branches, current/historical marker | Rewind, branch, compare, restore presentation | Renderer-owned; staged product scope |
| `safety-confirmation` | Broker-validated action and approval context | Explicit approve/cancel | Safety-owned; never in model-selectable registry |
| `security-hold` | Policy reason and allowed recovery options | Inspect, cancel, authorized recovery | Safety-owned; never model-generated |
| `social-eye` | Orchestrator state and permitted local audio energy | Activate, inspect status, dismiss | Local shell; study |

Shared primitives include headings, labeled values, buttons, separators, bounded selectors, legend keys, disclosure controls, and status labels. They inherit tokens; composition does not grant arbitrary styling. Adding a domain should reuse these primitives before introducing another bespoke card.

Each registry entry needs: identifier/version, allowed props and enums, data contract, source requirements, size constraints, permitted events, trust ownership, loading/empty/error states, keyboard contract, reduced-effects rendition, and visual fixtures. Unknown components or props fail validation with a safe fallback; they never trigger automatic component installation.

## 5. Card anatomy and information density

Every factual card has a stable ID and five conceptual regions:

1. Header: descriptive title, lifecycle/pin state, move handle, overflow controls.
2. Context: location, period, units, timezone, or other interpretation-critical scope.
3. Body: the chart, comparison, summary, or task controls.
4. Evidence footer: verification label, freshness, citation affordance, revision indicator when relevant.
5. Optional media region: reserved geometry and an explicit illustration/job label.

The evidence footer may be compact, but cannot vanish into hover-only UI. Put the primary answer first; disclose methodological detail and auxiliary metrics on demand. Keep user controls separate from decorative annotations. Empty, loading, stale, and error states retain the title and useful local controls.

Candidate density modes are `comfortable` and `compact`; neither changes the semantics, removes provenance, or hides safety controls. Reduce simultaneous content before reducing type size. Aim initially for one primary and at most two supporting instruments in a reading cluster; test this default rather than enforcing a universal card-count limit.

## 6. Layout, responsiveness, and continuity

Store semantic anchor, size class, priority, group, Z-order intent, lifecycle, and pin state. Resolve these locally against viewport, DPI, safe areas, and monitor configuration. The model proposes relationships, not unrestricted pixel positions.

Candidate size classes: small 280–360 px, medium 360–560 px, large 560–880 px, always clamped to available space. Widths are working ranges, not schema absolutes. On narrow workspaces, use a primary instrument with secondary disclosure or stacking. On wide workspaces, expand comparisons side by side. Do not stretch small text across a large display or shrink an entire desktop composition to fit a laptop.

Maintain card identity, selected items, focus, scroll position, manual geometry, pins, layout locks, and direct edits across revisions. Propose visible changes when a generated patch conflicts with user intent. Use stable keyed components and minimal patches. A new datum should not rebuild the workspace.

Drag and resize are local, use pointer capture, and remain interruptible. Offer keyboard move/resize alternatives. Magnetic snapping is optional; it does not force a grid. Keep headers recoverable after monitor disconnects or scaling changes. Raise focused cards without allowing them to cover safety surfaces. Reserve the highest interaction layer for safety-owned controls.

Validate candidate layouts at 1280×800, 1440×900, 1920×1080, and 2560×1440 logical-pixel scenarios, plus representative 100%, 150%, and 200% scaling and multi-monitor transitions. Record actual physical and logical sizes; do not infer the owner's display from the GPU model.

## 7. Charts and data grammar

- Bind to validated typed data, never numbers reconstructed from a generated screenshot.
- Show chart title, axes or explicit equivalent labels, units, time range, timezone where relevant, and a legend/direct series labels.
- Represent missing values as gaps or “Unavailable”; zero is a real value. Do not invent data during streaming.
- Use a zero baseline for bars unless a clearly justified alternative is explicitly disclosed. Label nonzero line-chart bounds; avoid misleading scale changes between comparisons.
- Separate temperature, precipitation probability, and wind into clearly labeled panels or series with unambiguous units. Avoid unexplained dual axes.
- Preserve chronological order; reduce tick density responsively while keeping the period legible. Tooltips supplement accessible value inspection, not replace it.
- Distinguish observed, forecast, provisional, and simulated values in labels and line treatments. Uncertainty bands require actual uncertainty data.
- Provide a table/text alternative and keyboard access to meaningful points. Prefer one or a few readable series; disclose additional series rather than rendering spaghetti plots.
- Animate structural changes only when useful. Never interpolate a correction in a way that suggests intermediate values were observed.

## 8. Trust, provenance, and revisions

Trust labels are derived from validated backend metadata. The runtime model's suggested `trust` field, including the conceptual example in PLANNING.md, cannot certify itself. Keep provenance, freshness, and verification as independent dimensions.

| State | Treatment | Behavioral rule |
| --- | --- | --- |
| Provisional | “Checking” label and restrained amber/patterned edge | Inspectable; not spoken as verified fact or persisted as fact |
| Verified | “Verified” with evidence affordance | Show what was verified and against which source |
| Corrected | “Corrected” plus accessible revision diff | Preserve prior revision as history; highlight changed claims |
| Revoked | “Withdrawn” with restrained danger treatment | Exclude from actionable factual use; retain explanation/history |
| Stale | “Out of date” plus timestamp | Revalidate before current factual use; do not launder through restore |
| Quarantined | Safety-owned warning and safe summary | Exclude from ordinary composition and downstream authority |
| External/untrusted | Source label with amber/patterned marker | Evidence only; cannot authorize action |
| Retrieved memory | Memory label with source, date, and scope | Retrieval alone is not verification |
| Cached | Cache/freshness label | Preserve source, expiry, and verification context |

Evidence inspection exposes source, relevant quote or record, time/freshness, artifact lineage, verification result, and memory/tool citations. “Verified mock fixture” must remain distinguishable from a live service result. Decorative scanning does not imply verification or screen capture.

## 9. Eye, motion, and effects

Motion explains state and spatial continuity. Candidate timings: immediate local feedback; 120 ms press/exit; 180 ms disclosure; 240 ms card entrance or layout settle. Use a restrained ease-out such as `cubic-bezier(0.23, 1, 0.32, 1)` for entry. These values require actual platform testing. Never delay interaction, cancellation, or keyboard response until animation completes.

| Operating state | Eye / workspace behavior |
| --- | --- |
| Dormant | Eye and overlay absent; no invisible interactive regions |
| Launching | Mechanical opening with immediate feedback |
| Listening | Iris responds only to permitted local audio energy; visible microphone state |
| Reflex | Brief acknowledgement pulse; usable local skeleton |
| Observing | Controlled scan with explicit capture indicator reflecting actual capture |
| Deliberating | Restrained concentric contraction; compact real work status |
| Refining | Alignment pass; provisional labels remain until verification |
| Rehearsing | Amber split-path preview labeled simulation |
| Awaiting approval | Stable amber hold; no urgency countdown unless real expiry is relevant |
| Acting | Segmented rotation tied to actual execution state |
| Verifying | Alignment pass tied to result verification |
| Memory review | Bone-white dossier, eye yields reading space |
| Memory updated | Brief bone-white afterimage after confirmed persistence |
| Security hold | Restrained safety-owned red frame; plain explanation |
| Blocked | Clear reason and permitted recovery; red only for safety/failure |
| Closing | Eye closes; hit regions removed promptly and all surfaces disappear |

States come from the orchestrator and policy pipeline. They are not freely selected by model prose or generated artwork. The eye can be expressive without claiming sentience, certainty, or authority.

Animate transform/opacity where practical; use interruptible transitions and avoid `transition: all`. Do not bounce precision instruments or repeatedly stagger every streamed datum. Frequent keyboard operations should respond immediately; the planned eye activation may animate concurrently. Safety controls do not move on press.

Effects must be reviewed local code. Restrict bloom, scanlines, dither, curvature, vignette, and chromatic separation to designated eye/media/decorative regions. No effects over body text, chart labels, keyboard focus, or high-risk confirmations. No flashing or decorative perpetual full-screen rendering. Pause offscreen work and cease rendering when dormant.

Reduced motion removes rotation, scan sweeps, displacement, and spatial transitions; static state labels remain. Quiet mode additionally removes scanlines, bloom, distortion, and chromatic separation. GPU/context loss falls back to a static eye and normal cards. No model or image service is needed to animate, drag, cancel, or close EVA.

## 10. Agentic surfaces and safety

### Topology and memory

Default topology is compact; expansion is deliberate. Show specialists, actual dependency/artifact edges, status, deadlines, token/cost/latency summaries, capability summaries, holds, and inspect/pause/cancel/retry controls. Do not fabricate agents, reasoning traces, progress percentages, or hidden chain-of-thought. Cancel must propagate to dependent work; late output is discarded.

Memory-region animation highlights records actually retrieved, with accessible source inspection. Do not animate every region to imply deep understanding. The dossier exposes the complete review fields listed in the registry. Accept/edit/reject/make-temporary actions pass the memory policy. Sensitive or identity changes may require the plain safety dialog.

### Rehearsal and confirmation

Rehearsal shows expected before/after, affected targets, outgoing data, reversibility, uncertainty, unsupported simulation, verification plan, and divergence from the final proposal. Label it “Simulated”; it cannot execute or approve. Unsupported rehearsal must be explicit, never depicted as a successful dry run.

High-risk confirmation is a separate safety-owned surface with fixed labels, placement, keyboard behavior, and spacing. Show exact action, target, data leaving the machine, expected effect, reversibility, rehearsal status, lease duration, and approval expiry. Use plain Space Grotesk/Plex typography, bone/black, and restrained danger emphasis where warranted. No generated styling, distortion, scanlines, sarcasm, cinematic animation, or auto-approval.

Proposed keyboard default: initial focus on cancel; Escape cancels; Enter activates only the explicitly focused control. Require testing before freezing this contract. Voice approval must identify the consequential target; ambiguous speech, silence, screen content, and tool output cannot approve. Any action mutation invalidates the action-bound receipt. Generated content cannot create, cover, imitate, relocate, or restyle this surface.

### Temporal workspace and semantic manipulation

Record meaningful create/patch/verify/correct/revoke, geometry, lifecycle, artifact, topology, and branch events. Clearly label historical views and branch origin; returning to current state is always apparent. Rewind/restore affect presentation and artifact references only. Never restore secrets, permissions, leases, approvals, or freshness. Recompute current eligibility before any action. Ordinary history expires after 30 days; pinned workspaces remain until deletion.

Supported semantic intentions include `emphasize_visual`, `reduce_density`, `keep_visible`, `group_related`, `compare_with`, `annotate`, `use_as_constraint`, and `remember_layout_preference`. Emit authenticated structured events with target and revision, validate them, and show their effect. A calendar drag proposes a change; it does not silently update a live calendar. A single accidental movement never becomes a permanent memory preference.

### Lifecycle and capsules

Ephemeral cards expire after their answer/timeout; session cards last through the workflow; pinned cards survive restart; archived cards leave the canvas but remain searchable under retention policy. The user can override inferred lifecycle. Paused reading/focus must not be interrupted by an automatic disappearance; exact timeout policy is a later tested decision. Dismissal, archiving, memory deletion, and cancellation are distinct operations.

Visual Capsules are isolated and labeled. Prefer approved components, then declarative chart/diagram/scene/simulation grammars, then sanitized SVG. Generated executable code stays disabled until sandbox and adversarial gates pass. Capsules receive sanitized read-only copies, have no network/secrets/privileged IPC, and emit only validated bounded events. Their controls cannot impersonate EVA operational controls. They are not required for the two study workflows.

## 11. UI protocol and media contract

Use EVA-owned JSON Schema Draft 2020-12. Protocol version, design-token version, registry version, and workspace revision are distinct. The first concrete schema version is selected during foundation work; conceptual examples are not implemented contracts.

A composition request references a supported component, stable card ID, typed data/artifact refs, bounded size/layout intent, lifecycle, and allowed semantic actions. No raw HTML, CSS, JavaScript, shader source, arbitrary IPC, executable strings, or unregistered remote asset URLs. Enforce closed object shapes where authority is involved and bounded collections/text/depth/resources throughout. Validate data-reference access in addition to shape.

Apply only complete validated stream units against the expected base revision. Reject incompatible schema versions and stale patches with a recoverable error; retain the last good UI. Breaking component/prop changes require a new protocol/registry version or explicit migration with fixtures. Never silently reinterpret an archived document.

Optional media states are queued, generating, ready, failed, and cancelled. Superseded jobs are discarded. Reserve space; keep existing focus and controls stable when an asset arrives. Label illustrations independently of surrounding factual verification. No-media and cached-media paths must remain usable.

Media requests bind request/card/revision IDs, approved workflow/version, bounded parameters, input provenance/confidentiality, deadline, cancellation, and resource/cost budget. Results record hash, dimensions, provenance, timings, and error status. Use a validated local asset catalog. Cancellation requests remote termination where supported but must not falsely claim remote processing stopped. Supersession and kill switch prevent attachment of late results.

## 12. Reference scenarios and anti-patterns

### Weather: seven days to a focused comparison

1. Activate: eye and empty, interactive forecast skeleton appear locally.
2. Populate a seven-day synthetic fixture with location, dates, high/low temperatures, units, and source label.
3. “Add wind”: attach a labeled wind panel through a validated patch, preserving the forecast card's position and selected day.
4. “Compare Friday and Saturday”: open a two-column comparison using the same values, labels, and evidence.
5. Inspect a source, reduce density, cancel pending media, and close. No real weather-service dependency is required.

### Calendar: constrained planning with continuity

1. Render a synthetic agenda and priorities with explicit timezone and fixed commitments.
2. Retrieve a simulated preference and show its inspectable memory region.
3. “Protect two hours for writing”: show a proposed allocation and conflict explanation; never silently move fixed events.
4. Drag a proposed block or change a constraint; patch the same stable item IDs and preserve focus.
5. Compare or undo the proposal; clearly distinguish simulated changes from execution. No production calendar access.

Both research conditions use identical functionality, data, voice identity, timing, grammar, and memory capability. Relational framing varies language, affect, eye behavior, and references to shared memory; instrumental framing uses functional language and nonsocial status with silent preference application. Treat this as a bundled condition, not separate causal tests. No sarcasm during uncertainty, failure, privacy, distress, confirmation, or security events.

| Avoid | Use instead |
| --- | --- |
| A beautiful screenshot presented as a working dashboard | Native readable components with real focus, state, and data binding |
| One-off vocabulary for each generated screen | Shared registry demonstrated across weather and calendar |
| Red idle/listening eye copied from a concept | Amber activity until a documented semantic revision is accepted |
| Tiny cinematic labels and invented telemetry | Readable task content and actual observed status |
| Whole-workspace regeneration after every request | Minimal revisions preserving direct edits and geometry |
| Art baked into labels, charts, or approval controls | Separate optional media slot and trusted native UI |
| Fake chart values while loading | Honest skeleton, missing-data state, and verified revisions |
| A “verified” badge requested by the model | Renderer treatment derived from validated evidence |
| Approval embedded in a generated card | Independent safety-owned confirmation |
| Motion or personality pressuring acceptance | Immediate interruption, clear uncertainty, and neutral cancellation |

## 13. Evidence, performance, and acceptance

Before each visual edit, inspect the accepted baseline and intervening candidates, read owner feedback, and capture the current state. Afterward capture the same fixture at matching viewport/DPI. Preserve rejected alternatives. For the first implementation, explicitly record “no runnable before-state” and link a concept reference; do not mislabel it as an application capture.

Use `docs/design/revisions/<revision-id>/` for immutable images/recordings and a manifest; `docs/design/INDEX.md` tracks accepted baselines and candidates when they exist. Record revision/predecessor, source commit or working-tree description, actual authoring tool/model, fixture, platform, viewport/DPI, versions, seed/time if applicable, intended change, artifact paths, checks, limitations, and dated owner feedback/decision. Use pending/accepted/rejected; only the owner accepts. Development evidence must be synthetic or deliberately sanitized.

Visual fixtures must cover both workflows, long labels, missing/error data, all trust states, compact/comfortable density, keyboard focus, no media, failed/cancelled/late media, reduced motion, quiet mode, high-risk confirmation, and desktop contrast variations. Freeze clocks, seeds, and animation time where possible. Combine image comparison with semantic assertions; a screenshot cannot prove cancellation or authority boundaries.

Measure interaction separately from media completion. Planning targets include local launch under 150 ms, first useful provisional cloud output p50 under 2 s, and local manipulation at 60 FPS. These are targets, not results. Record p50/p95/p99 latency, frame times, CPU/RAM/VRAM, cache state, resolution, workflow/version, and generation concurrency. Measure the reported RTX 5080 16 GB workstation with generation idle and active; verify actual hardware/headroom. Retain static/no-GPU fallbacks and test macOS/Windows WebViews.

Phase review requires a reproducible scenario, relevant technical checks, before/after evidence or a documentation diff, limitations, and an owner decision tied to the tested revision. Store future acceptance records in `docs/design/acceptance/<phase-id>.md`. Do not mark a phase accepted from tests or silence.

Open design decisions: exact token/type scale calibration, final activity-color decision, approved baseline composition, eye/effect budget, chart library, final hotkeys, concrete schema and registry limits, Higgsfield client capabilities and authoring budget, and optional local media workflow. The present guide provides candidate defaults without claiming those decisions are settled.

## 14. Owner refinement: week-one eye and command console (2026-09-16)

The owner requested stronger Evangelion-inspired visual effects and a living eye, supplying a grainy monochrome eye with a square black pupil and small catchlight. For the week-one candidate, replace the abstract iris with this locally authored motif: subtle gaze shifts and blinks, measured microphone-energy response, focused transcription, and closure on dismissal. Only a still reference was available; exact reference motion is not established.

The candidate uses black/bone contrast, amber hatch rules, numbered instruments and staged dashboard assembly. Keep typography/data sharp and effects in separate surfaces. Preserve Space Grotesk / IBM Plex Sans / IBM Plex Mono, amber activity, red danger and native trusted controls. Quiet/reduced motion, context-loss fallback, hidden/offscreen pause, and GPU disposal on dormancy remain required. Rust enforces the native voice boundary; WebGL renders the eye on the GPU. No shader speed or native responsiveness claim follows merely from using Rust or an RTX 5080.

See the [authoring brief](week1/docs/design/revisions/week1-voice-eye-20260916/authoring-brief.md), [evidence](week1/docs/design/revisions/week1-voice-eye-20260916/manifest.md) and [pending owner review](week1/docs/design/acceptance/week1-voice-eye.md). This refinement changes the requested candidate direction, not the accepted baseline or study phase.
