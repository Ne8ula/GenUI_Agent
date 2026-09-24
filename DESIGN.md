# EVA Design System: Expressive Response Grammar

Version: 0.2 research candidate · 2026-09-17 · New visual baseline and implementation acceptance: pending.

This is the single canonical visual and interaction guide for [PLANNING.md](PLANNING.md) and the [independent study](docs/research/GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md). The response is the design object: readable information and an evolving composition that can propose, attend, yield, and reconsider with the user.

The owner initially authorized this research reframe; a subsequent 2026-09-17 instruction recorded in [AGENTS.md](AGENTS.md) authorized the bounded E1 build in `experiments/e1/`. Finished E1 acceptance and later phase gates remain pending. The successfully demonstrated [Week 1 app and evidence](week1/README.md) remain unchanged. Its red palette, square pupil, transparent surface, voice refinements, and long authored reveal belong to that rendition; they are not measurements or requirements for every future response. The exact prior guide and accumulated refinements are [preserved here](docs/research/history/2026-09-17-before-reframe/README.md). The [decision log](docs/research/DIRECTION_DECISIONS.md) distinguishes owner direction from new recommendations.

## 1. Experience and design hypothesis

An answer can inhabit the desktop without occupying a rectangular dashboard. Dithered matter gathers around a readable fact; a selected time becomes a spatial anchor; a comparison parts one field into two; a user's intervention causes the composition to yield and form a different proposal. Silence and stillness are legitimate phases. The answer remains available throughout.

Owner critique of the first assembled E1 candidate, 2026-09-23: it is “still too reliant on texts as a display.” Make composition and material response primary rather than placing a small effect behind a control panel. Keep time/temperature and compact synthetic-source context in the foreground; disclose the full reading layer and technical controls on demand. Plain answer is effect-free. This refinement preserves immediate access to exact facts, missingness, focus, and local controls; it does not accept a new visual baseline.

The owner's subsequent E1 refinement makes the **actual desktop the composition space**: use desktop-pet-like transparent presence and independent positioning for the response, not a pet character. Remove full-window backings, dashboard frames, enclosing stages, fixed content columns, and permanent toolbars. Undrawn native pixels must be genuinely transparent; a wallpaper rendered inside an opaque app does not qualify. Weather material and compact anchors can occupy separate locations, yield to selection, and relate across open space without recentering existing pins. Use only small local reading backings. Underlying applications remain usable through empty regions, and dismissal leaves no invisible input blocker. This is spatial presentation within E1, not permission to inspect desktop content or add connectors. Native evidence must use deliberately synthetic, nonprivate backgrounds; see the [implementation refinement](docs/design/revisions/e1-20260923-02/REFINEMENT.md).

The hypothesis is that coherent, situated, revisable behavior may invite an interpretation of attention or intention. It is not a claim that EVA feels emotion or reads the user's feelings. Affect is explored through the relation between action and response: anticipation followed by a controllable reveal, an interrupted movement that yields, an interpretation that can be refused, and a familiar element that persists through change. “Happy = yellow” and “angry = red” are not the grammar.

Credit The Memory Archive and artistic influences without copying their characters, artwork, signatures, or interaction sequences. See the [transfer study](docs/research/MEMORY_ARCHIVE_TRANSFER.md), [academic synthesis](docs/research/EXPRESSIVE_RESPONSE_SYNTHESIS.md), and [precedents](docs/research/ARTISTIC_PRECEDENTS.md). Desktop spatial attachment does not require a camera.

Owner addition, 2026-09-24: the finished E1 demo must integrate the **actual Week 1 eye**, not substitute a logo or new icon. Reuse the authored `week1/apps/desktop/src/SignalEye.tsx` geometry, square pupil and red dithering in an E1-only adaptation; preserve the archive. Remove its opaque canvas backing and global pointer/audio coupling. The eye belongs to the click-through material layer, follows explicit selected-anchor geometry through bounded cues, settles without a perpetual idle loop, stops locally, and disappears in plain answer and dismissal. It remains shell-owned expression, not factual verification, emotion detection, or an additional model-selectable privilege.

Owner's later 2026-09-24 Weave direction supersedes the preceding E1-only eye/silence/dismissal restrictions: the original cursor-responsive eye itself becomes the weather and returns on weather dismissal; microphone-off remains separate. The owner rejected an approximate procedural rendition and explicitly requested faithful imported keyframes/timelines and Rust GPU rendering, then a smaller eye. The current candidate uses source-derived foreground frames with Rust/wgpu, and a 60%-scale idle/returned eye with matching transition framing. Generated backdrop drift and incorrect/interpolated factual labels are excluded. See the [current evidence and limitations](docs/design/revisions/e1-20260924-faithful/README.md); acceptance and broader performance claims remain pending.

Subsequent owner correction: the extracted-frame rendition is rejected, and its native Sunny→Rainy transition reportedly caused system-wide freezing/black screens. **Native rendering is quarantined.** Recreate actual particle geometry and kinematics rather than removing a video background. The [replacement](docs/design/revisions/e1-20260924-procedural/README.md) uses bounded Rust/WASM particle state and a CPU-oriented browser preview; reference PNG/MP4 files are not runtime frames. No new native hardware exercise or stability claim follows from browser tests. Preserve the smaller cursor-responsive eye, immediate facts, controls and archived evidence; native resumption requires separate review and explicit owner authorization.

## 2. Ownership and boundaries

| Source | Determines | Cannot determine |
| --- | --- | --- |
| Development author | Primitive implementations, material vocabulary, phase recipes, constraints, schemas, keyboard behavior, fallbacks | User consent or empirical emotional effects |
| Runtime model | A bounded proposal: selected primitives, evidence references, semantic anchors, permitted phase recipe, expressive intention | Executable code/shaders, arbitrary CSS/IPC, trusted labels, user emotion, permission, unbounded resources |
| Validated data | Values, units, location, time, uncertainty, missingness, evidence identity | Personality, authority, emotional diagnosis |
| Deterministic runtime | Validation, provenance/status, event ordering, policy, resource limits, renderer state, cancellation, patch eligibility | A person's actual emotional interpretation |
| User | Explicit focus, comparison, manipulation, locks, correction, rejection, intensity, plain answer, dismissal | Hidden approval through incidental behavior |
| Session state | Stable entity IDs, direct edits, selected scope, presentation history, unresolved proposal | Durable personal facts or revived authority |
| Later persistent memory | Explicitly reviewed context with source, retention, correction, deletion | Unreviewed emotion inferences or permission derived from past rapport |

Keep dialogue orchestration, memory, expressive scoring, and rendering separate. A proposed intention such as `invite-comparison` is an instruction to bounded expressive machinery, not a diagnosis of the user or a trusted affect state. Start without PAD/Plutchik state; investigate its value only against a simpler model if continuity failures justify it.

Higgsfield can support whole-composition studies, response state boards, and motion references through the [authoring workflow](docs/design/HIGGSFIELD.md). A bitmap is a proposal, not interaction evidence. Runtime media is optional. ComfyUI remains gated until explicit S2 acceptance and a separately authorized S3 experiment; no generation dependency is needed for E1.

## 3. Foundations and material language

### Palette and type

The owner replaced amber-only activity with red in Week 1. Carrying red into this new candidate is a proposed continuity choice, not acceptance of a new baseline. Resolve safety with host-owned words, shape, placement, and control behavior rather than assuming that red always means danger.

| Token | Candidate | Role |
| --- | --- | --- |
| Void | `#080A0B` | Local reading/effect backing; not a full-desktop wallpaper |
| Surface | `#121618` | Opaque protection behind text and controls where required |
| Bone | `#E8E4D9` | Primary facts, typography, stable material |
| Muted | `#A8ADA9` | Secondary labels with measured contrast |
| Expressive red | `#FF3B35` | Field accents, emphasis, selected expressive geometry |
| Pending amber | `#E8AD56` | Optional fixed host status, always labeled; not an emotion |
| Error pale red | `#F06C68` | Host-owned error text with icon and explicit words |
| Focus | `#F4D18C` | High-contrast focus ring with dark separation |

Red expression must not impersonate an error, approval, verified source, or security hold. Do not make source quality prettier with warmer affect. Palette is constrained across weather and transit; domain differentiation comes from composition and timing.

Use **Space Grotesk** headings, **IBM Plex Sans** reading/controls, and **IBM Plex Mono** quantities and timestamps. Candidate defaults: headings 18/24 px, body 15/22, secondary/data 13/18, primary metric 28/34. Use scalable units, tabular numerals, bundled licensed fonts and system fallbacks. Never place required text below 12 px or run paragraphs in decorative mono. The archived fonts and licenses are reusable after ordinary asset review.

### Pixels, dithering, and space

Square-cell ordered dithering gives matter a shared material, not factual uncertainty. Start with candidate cell sizes of 3–6 CSS px; test at actual DPI and scale. Reserve high-frequency texture for effect layers. Text, numerals, charts, focus rings, source labels, and controls remain crisp. No flashing, continual scanline crawl over reading, or bloom that erases a glyph.

Use negative space as a compositional resource. Semantic anchors attach material to a time, value, selected entity, or user-created region. Curves and fields may cross the space between anchors; they must not intercept unrelated clicks or imply a privileged relationship. Reading backings may be rectangular when useful, but a card grid is not the default skeleton.

Candidate spacing: 4/8/12/16/24/32/48 px. Controls have adequate hit areas and visible focus; consequential controls use a distinct protected surface with candidate 44 px minimum height. Preserve system scaling. Test actual contrast on light/dark synthetic wallpapers: proposed targets 4.5:1 normal text and 3:1 large text/meaningful controls. These targets are not a conformance claim.

## 4. Authored primitive vocabulary

These identifiers are **proposed**, not implemented registry entries. Each needs a version, closed schema, required evidence, events, bounds, reduced-motion rendition, keyboard contract, and positive/negative fixtures before a model may select it.

| Primitive | Expressive role | Data and interaction contract |
| --- | --- | --- |
| `fact-anchor` | Stable readable point around which material organizes | Value/text bound to approved evidence; units/context/source visible; select, pin, inspect |
| `time-ribbon` | Connect or separate explicit periods | Ordered time records with timezone; select/range/compare; no fake precision |
| `dither-field` | Gather, disperse, part, hold, or settle matter | Bounded count/density/seed; qualitative unless a declared quantitative mapping is supplied |
| `occlusion-layer` | Weather-specific cloud/light relation | Bind to cloud fraction when present; separate precipitation probability; never obscure facts |
| `attention-link` | Acknowledge an explicit chosen entity | Follows valid entity anchor; cannot point at arbitrary desktop/private content |
| `comparison-pair` | Hold two interpretations side by side | Compatible data units and stable IDs; independent labels, keyboard comparison |
| `interval-band` | Make an arrival range or duration legible | Start/end, units, as-of/uncertainty; unknown is not zero |
| `text-fragment` | Brief interpretation or invitation | Plain sanitized text, required evidence for factual claims, no invented source/status |
| `illustration-slot` | Optional atmosphere or authored media | Validated local catalog ref; labeled illustration; never sole carrier of facts or controls |
| `reading-layer` | Stable facts, accessible list/table, plain answer | Host-governed reading order, provenance, focus; persists when effects fail |

The shell also owns local eye/status, stop/intensity controls, evidence inspection, and revision controls. Safety confirmation and security hold are **not** model-selectable primitives. Future charts, dossiers, topology, and task instruments remain reusable product surfaces when needed, not mandatory furniture for every response.

Begin with at most two simultaneous effect fields, one active attention target, and three fact groups for E1. These are proposed budgets to test, not measured capacities. A field does not receive permission to fill the desktop or run indefinitely.

## 5. Temporal grammar and coordination

| Phase | Behavior | Transition and escape |
| --- | --- | --- |
| Acknowledge | Local focus/status responds to the explicit request | Immediate local cue; no provisional factual speech |
| Expose | Show available verified fixture facts and source | Facts never wait for theatrical construction or an asset |
| Propose | Material gathers into a subject-specific arrangement | Short, skippable phase; duration bounded by authored recipe |
| Inhabit | Settle into readable stillness or minimal motion | No compulsory idle animation or implied emotion sensing |
| Attend | On explicit selection/intervention, orient relevant material and preserve the target | Local feedback; hovering may reveal a tooltip but grants no broader request |
| Reconsider | Revise the arrangement around the new scope or constraint | Keep IDs, locks, direct edits, focus, and evidence; reject stale patches |
| Settle / dissolve | Hold a useful result, simplify, or withdraw | User can stop immediately; no sulking, guilt, or delayed dismissal |

The phase order is not a mandatory movie. A follow-up can interrupt propose; a correction can jump to expose; plain answer can bypass every effect. Data readiness and expressive timing are distinct. Do not display percentage progress unless it represents a measured operation.

Coordinate channels through actual events. Eye attends to the selected anchor, then yields spatial prominence; surrounding matter follows a slower authored response if that helps legibility. Text does not jiggle to simulate speech. When optional speech is enabled, factual utterances wait for sentence verification and speech cues follow actual playback-start/end events, not a guessed timer. Sound is optional, independently muted, and never required for missing-data or failure comprehension. Silence remains usable space.

A shared cancellation token invalidates pending score, model, media, audio, and queued transitions for the response. A new revision cannot revive stale sound or attach a late field to a dismissed entity. E1 starts with silent comparison conditions; adding voice is a separate manipulation.

## 6. Explicit interaction and persistence

| User act | Context change | Allowed response |
| --- | --- | --- |
| Mention | Adds a possible referent in language | Resolve or ask a bounded clarification; no attachment to private desktop content |
| Select | Establishes explicit focus on a visible entity | Show related evidence and a local attention cue |
| Manipulate | Changes position, scale, scope, or expressive intensity | Apply locally; preserve the direct edit across revisions |
| Compare | Invites a relation between named/selected entities | Build a labeled comparison using compatible evidence |
| Invite reinterpretation | Explicitly asks for a different framing/material emphasis | Offer a reversible composition; keep facts invariant |
| Pause, hover, look, remain silent | No additional authority or emotional disclosure | At most ordinary local affordance feedback; no inferred approval |

Use stable IDs for facts, anchors, fields, and revisions. Store semantic anchors and bounded layout relations; the renderer resolves viewport/DPI and collisions. Follow-ups patch affected entities rather than rebuilding the whole scene. Preserve focus, reading order, scroll, pins, user geometry, locks, intensity, and selected scope. If a patch conflicts with a lock, adapt around it or show an optional proposal; do not silently move it.

Offer keyboard alternatives to selection, drag, resize, compare, intensity, and stop. Direct manipulation remains local and responsive without a model call. Keep controls recoverable after viewport/display changes. Plain answer is always reachable and preserves current facts/scope. Reduced motion uses immediate state changes, restrained crossfades if allowed, and static spatial relationships; no traveling particles, breathing, or drifting field.

For E1's transparent desktop refinement, keep geometry within the display's usable work area and preserve user positions across selection and comparison. Reading targets do not drift while being read or manipulated. Expose Stop, Less motion, Plain answer, and Dismiss through a small keyboard-accessible local control affordance rather than a permanent toolbar. CSS `pointer-events: none` alone does not establish OS pass-through: native hit testing must keep empty regions and decorative material nonblocking, while explicit interactive regions remain operable. Native region/state messages are host-owned UI plumbing, never capabilities accepted from a response score. Verify light, dark, and busy synthetic underlying windows; test actual OS clicks, dragging, keyboard recovery, interruption, and dismissal. Browser previews cannot establish native transparency or hit testing.

Session continuity can remember “keep this fact here” and “less motion for this response.” Persistent preferences require an explicit, inspectable memory workflow. Do not write a transient expressive state, stale claim, or inferred user feeling as durable fact. Presentation rewind restores an earlier arrangement, never freshness, permission, approval, leases, or secrets.

## 7. Content, uncertainty, and safety surfaces

Every answer exposes location/entity, period, units, timezone where relevant, source kind, and as-of/fixture identity. A compact source affordance must be available without hover. A synthetic label is not interchangeable with “verified live.” Model-generated text cannot award itself verification.

Qualitative motion is labeled as illustration where it could be confused with measurement. Quantitative mappings require named variables, scale, units, source, missingness, and uncertainty. Cloud fraction is not rain probability; a train's time estimate is not its physical distance. Never interpolate a missing fact as zero or silently invent the next arrival. Stale/failed data can settle the effect and retain a labeled prior value, but cannot continue an apparently live countdown.

Future memory dossiers expose claim/source/scope/expiry and accept/edit/reject/temporary options. Topology shows actual activity from trusted runtime events. Rehearsal shows proposed effects and uncertainty; it is not approval. Confirmations display broker-validated targets, payload, reversibility, and explicit choices in a reserved host-owned layer. Models, artifacts, media, caches, and expressive surfaces cannot imitate that layer.

Visual Capsules remain isolated, with no network, secrets, or privileged IPC. Generated-code execution remains disabled until sandbox and adversarial gates pass. Retain the full policy and release gates in PLANNING.md even when a small synthetic research fixture does not implement the full broker.

## 8. Response representation and architecture

A proposed **response score** coordinates composition; it does not replace evidence or authority. This conceptual shape is not a shipped schema or API:

```text
Model proposal (closed fields):
  schemaVersion, responseId, baseRevision
  evidenceRefs
  intent: orient | invite-comparison | reconsider | settle
  entities: stable id, approved primitive, dataRef, semantic anchor, bounded props
  phaseRecipe: approved recipe id and bounded parameters

Host envelope (never accepted from the model):
  accepted evidence and provenance, validation result
  revision and cancellation token, actual event timestamps
  user locks/preferences, local seed, resource budget, expiry
  permitted interactions and policy state
```

The model may propose only references it has been given. Reject unknown fields, missing/foreign evidence, raw HTML/JS/CSS/shaders, authority-bearing fields, invalid anchors, oversized requests, incompatible units, and superseded revisions. A structurally valid score also needs semantic, provenance, confidentiality, resource, and action checks. Clamp presentation preferences only where policy permits; reject an invalid factual binding rather than silently rewriting it.

Pipeline: synthetic evidence → provider-neutral score proposal → closed-schema and semantic checks → deterministic event/revision controller → React reading/interaction layer plus an authored local effect renderer. Rust retains privileged boundaries. Do not copy the full product's future broker features into a claim about the narrow archived command set.

Retain Tauri 2, React/TypeScript, and Rust. The archive already contains authored WebGL eye code and local animation, but no evidence that a new full-composition renderer meets performance targets. E1 compares Canvas 2D and a small authored WebGL primitive with identical fixtures. Record the actual selected runtime path; browser results cannot establish Tauri behavior. The reported RTX 5080 is a hardware target, not a benchmark. No native renderer replacement, Unreal, MetaHuman, camera stack, model downloads, or GPU dependencies are required now.

## 9. Weather composition: light that can be redirected

**Synthetic design fixture W-NYC-01:** New York City; 2026-10-14; America/New_York. At 09:00/12:00/15:00, temperature is 18/22/21 °C, cloud cover 70/20/45%, precipitation probability 10/5/15%, and wind 12/18/16 km/h. Fixture as-of is 08:00 on that date. These invented values are design data, not a forecast.

1. “What's the weather in NYC?” exposes time, temperatures, units, and synthetic source immediately. Bone pixels gather around the selected noon anchor into a sun-like field; a separate occluding material uses the cloud-cover input. A readable list remains available.
2. “Focus on the afternoon” selects 15:00. The relevant anchor stays legible while the field parts and reforms around it. It does not infer that the user feels brighter or needs encouragement.
3. The user pins 15:00 on the right and asks “Compare with noon.” A second stable anchor appears; material relates the two without moving the pin. Explicit values and labels carry the comparison.
4. “Less motion” settles the field immediately. “Just the numbers” preserves scope, comparison, source, and pinned information in the reading layer.
5. If the user corrects the location, invalidate incompatible evidence and obtain/select a labeled fixture for the new place; never relabel NYC's numbers as another city. If no fixture exists, show unavailable and preserve the correction.

The response is contingent because the selected time and lock change its spatial/temporal behavior, situated because light/occlusion relates to weather fields, and revisable because user constraints persist. Whether this is experienced as agentic or emotionally meaningful remains to be tested.

## 10. Transit composition: a bounded experience of waiting

**Synthetic design fixture T-M-01:** fictional “Demo Station A,” service label “M,” direction label “Uptown — scenario only,” destination “Demo Terminal,” America/New_York, as-of 2026-10-14 17:00. First arrival estimate 3–5 minutes; second 11–14 minutes. Station, route/direction combination, destinations, and estimates are unverified fictional placeholders, not NYC journey advice.

1. The request exposes station, service, direction, destination, interval, synthetic source, and as-of together. A narrow interval band gives the wait a spatial span. A restrained pulse suggests anticipation, explicitly illustrative—not a train-location tracker.
2. “Show the next two” establishes two labeled bands; rhythm separates alternatives without accelerating as if an arrival were guaranteed.
3. Selecting the later interval moves attention toward that option. “Keep that one here” pins it; “make the wait feel quieter” reduces density/rhythm while retaining estimates.
4. An unknown estimate becomes “No estimate” with no imminent-arrival pulse. Stale data freezes any derived elapsed-time display and visibly marks the source; a range is never converted to a precise countdown.
5. Plain answer lists both intervals and context. Dismissal dissolves the field immediately.

A real integration must verify the station identifier, route, direction, service at the requested time, destination, feed timestamp, and source semantics before displaying live advice. No live M-service assumption is needed for this design study. The point of transfer is a different material/time relationship, not a sun animation reskinned as a train.

## 11. Evidence and acceptance

The next proposed build is [E1](docs/design/experiments/E1_REVISABLE_WEATHER.md). Documentation acceptance uses the readable diff and decision list. New visual implementation requires the same fixture before/after at matching viewport/DPI, captures of affected states, a short recording for timing changes, and actual native-window checks. Preserve rejected candidates. Missing capture blocks a visual-completion claim, not independent work.

Each `docs/design/revisions/<revision-id>/` manifest records:

- revision ID, date, phase, source/build revision, actual tool/provider/model, and status;
- accepted baseline or “none,” prior candidate, scenario/fixture and seed, requested change and rationale;
- commands, platform/WebView/GPU/driver, viewport, display scale, reduced-motion/intensity, input/audio settings;
- score/schema and evidence versions, captures/recording paths, event trace and actual checks;
- source/asset provenance and licenses; performance measurements separated from targets;
- known failures and limits, owner feedback, retest and explicit decision/date.

Update [the evidence index](docs/design/INDEX.md) only with actual candidates; research prose is not a rendered candidate. Keep acceptance in `docs/design/acceptance/<phase-id>.md`, pending until an explicit owner decision tied to that revision.

Evaluate content comprehension, stable interaction, contingency, cancellation, missing-data honesty, reduced motion, and measured cost before claiming successful expression. A screenshot cannot establish timing; an event log cannot establish human meaning; a positive owner impression cannot establish a general psychological effect.

## 12. Anti-patterns

Avoid a fixed spectacle after every call; hiding facts until narration ends; making the eye the only responsive element; arbitrary emotion-to-color mappings; gesture/camera requirements without a research need; confidence expressed as brightness; personal memory used to simulate intimacy; information unlocked by rapport; a refusal that resists dismissal; and optional media that blocks useful work.

The useful test is concrete: **what did this explicit intervention cause the composition to do, what remained under the user's control, and could the person still understand the answer?**
