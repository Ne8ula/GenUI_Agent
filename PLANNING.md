# Midterm: an artistic memory palace

Owner direction: 2026-10-18. This replaces the random-scene/Paris assignment as the current focus. The authorized cleanup consolidates planning and removes superseded material; implementation of the new demo remains proposed.

## The encounter

?I want to explore my childhood home.?

EVA's eye invites photographs of the room from multiple perspectives. An explorable scene assembles with artistic merit: spatial structure, depth, edges, sparse points, strands, surfaces and material transitions can become its visual language.

After construction, the user talks with EVA, rotates/explores the room, selects an object to inspect or expand it, and adds memories: ?Actually, I remember a small lion plushie on the bed.? The scene becomes an interactive memory journal.

Emphasize the remembered place and the user's relationship to it. Avoid a technical dashboard. Source evidence, inferred structure and personal recollection must still be inspectable.

## Proposed first demo

Owner selected Apple Hypersim and the synthetic living room **`ai_001_004`** on 2026-10-18. The first bounded implementation is an offline supplied-depth/supplied-camera reconstruction baseline; see the [fixture and tooling decision](docs/research/hypersim/README.md). Scene selection is accepted; reconstruction quality and C-M0/C-M1 remain pending owner review.

Use one room and a small, explicitly cleared image set. Hypersim images are rendered synthetic sources, not captured photographs of a real home. Later, begin with a controlled or well-covered captured room if childhood photographs are sparse or inconsistent; arbitrary historical photographs may not support a coherent room.

1. EVA introduces the encounter and requests relevant photographs.
2. Intake records source identity and permission for external processing. Diagnose missing coverage, incompatible room states and failure.
3. A genuine reconstruction route recovers cameras and spatial representation, retaining raw output and diagnostics. Algorithms, versions, resources and representation require a bounded technical decision.
4. The reconstruction supports an artistic construction sequence and navigable room. Show real job status; an authored reveal is not a live ML trace unless it actually uses that trace.
5. The user rotates the room, selects an anchored object and inspects a detail/source view. Expansion preserves the room anchor and return position.
6. Conversation supports interruption. Memories attach to objects/regions; the plushie stays user-reported unless a source supports it.
7. Review, correct, remove and revisit annotations. Persistence needs a tested save/reopen path; a session-only demo must say so.

This is a proposed scenario, not an implemented checklist or acceptance record. No deadline, paid allowance, model installation or study approval is implied.

## Reconstruction and Shado

Direct path: suitable room photographs ? genuine reconstruction ? artistic rendering and EVA interaction.

Optional path: a separately scoped Shado experiment supplies generated views/video ? reconstruction ? the same downstream experience. Generated views carry provenance and cannot silently become historical photographs or independent corroboration.

Shado owns Steps 1?5 of the research flow; EVA owns Steps 6?7. The [long-term plan](docs/research/EVA_RESEARCH_IMPLEMENTATION_PLAN.md) retains the three tracks and matched comparisons.

Depth estimates, edge extraction, point displays, wireframes and trained 3D Gaussian Splatting are different methods or representations. Choose after feasibility checks. The aesthetic alone does not establish reconstruction; LiDAR-like graphics are not LiDAR measurements.

## Memory and evidence

| Layer | Meaning |
| --- | --- |
| Supplied source | Actual photograph with recorded origin |
| Reconstructed geometry | Inference from identified inputs, with cameras, diagnostics and unresolved regions |
| Generated completion | Model-authored content with model/run/input provenance |
| Artistic treatment | Visual expression, not additional scene evidence |
| User memory | The user's account, with attribution and revision history |
| Unknown | Missing/conflicting information left unresolved |

An imagined plushie may be an annotation or a separately labelled authored object. Never overwrite raw reconstruction or silently promote it to observed fact. Preserve stable IDs, source links, undo, selection, direct edits and anchors through presentation changes.

## Foundation and gaps

The retained [Week 4 app](week4/README.md) provides the eye, deterministic construction, authored graphics, local controls, source-photo inspection and hover/focus regions. Paris arrival uses source-derived 2.5D data and authored boxes; the Rust route constructs authored geometry.

Neither establishes reconstruction from uploaded room photographs. The app does not provide the proposed conversational journal, live ML inference, automatic object detection or validated forensic analysis. Existing tests cover fixtures only.

Retain React/TypeScript orchestration, Rust rendering/policy boundaries and Tauri 2 architectural direction. The available demo is browser-based; native/provider integration needs separate evidence.

## Artistic continuity

Carry forward the eye identity and Week 4's sparse, structural, layered material language, adapted to an interior rather than the fixed Paris composition. The room palette, representation and motion require a fresh bounded pass under [DESIGN.md](DESIGN.md) and [Weave](docs/design/FIGMA_WEAVE.md).

The retired Rust reconstruction prompt assigned manually authored Paris geometry, not ML reconstruction. Retain its useful principles: stable geometry, staged construction, bounded effects and honest provenance.

## Future application: scene investigation journal

The owner also proposed reconstructing a crime scene and exploring hypothetical events, including blood-pattern/instrument scenarios. Preserve this as a separate application concept, not the first midterm deliverable.

Photo organization, annotation and labelled scenario exploration can inform shared journal design. No validated blood-pattern estimation, instrument compatibility or event reconstruction exists here. Future forensic claims require a separately scoped method, domain expertise and independent validation. A plausible rendering does not establish that an event occurred.

## Completion and next decision

Cleanup completion means concise authoritative guides, recoverable deletions, intact dependencies, relevant checks and a readable diff.

A later implementation phase should first establish one reproducible photo-to-spatial-scene fixture, then integrate artistic presentation, object memories and voice with failure/cancellation/accessibility checks. Record actual outputs and the owner's exercise against the tested revision. Technical checks, attractive media and silence do not constitute acceptance.
