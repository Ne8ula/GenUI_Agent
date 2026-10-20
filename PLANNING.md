# Midterm: an artistic memory palace

Owner direction: 2026-10-18. This replaces the random-scene/Paris assignment as the current focus. The room reconstruction demo is implemented; the full interactive memory journal remains proposed.

## Current refinement: simpler dots and adjoining spaces — 2026-10-20

Owner feedback identified dense points and white voids between walls. [v5 implements both fixes](docs/design/revisions/room-refinement-v5/REVIEW.md): 108,923 spatially selected dots replace the 1.61-million-vertex display while retaining the full surface mesh. An east room/return and two alcoves supply geometry behind the uncaptured openings. These are explicit layout/material assumptions, shown in lavender and switchable in Sources & details. Existing v4 mesh arrays remain exact.

Independent full-resolution checks across all 100 source cameras found no newly assumed face violating the stated finite-visibility tolerances. Source-background coverage is now 99.8487%, which measures authored coverage rather than accuracy. Fifty-three Python tests, 356 application tests, typechecks/build, 19 browser checks and production verification pass. No new paid activity. The same room-completion Weave waiver covers this feedback refinement; [acceptance remains pending](docs/design/acceptance/room-refinement-v5.md).

## Previous room-wide candidate — 2026-10-20

The preceding [full-room-v4](docs/research/hypersim/evidence/full-room-v4/REVIEW.md) uses all 100 RGBD views, 15 mm TSDF fusion, source-supported architectural plane completion and fine source-triangle recovery. This replaced the floor-only route with a working room-wide candidate. Whole-mesh Poisson and Poisson patch variants were inspected and superseded after full-turn inspection exposed unseen gaps. Structural completion protects measured free space and source-visible background openings; v5's separate assumed-space category intentionally extends behind those openings.

The actual browser mesh reaches 99.9947% mean valid-depth coverage across conditioning views, with 3.809 mm mean per-view overlap error. This is **not held-out accuracy**: all 100 views condition this separate demonstration. The original r03 mesh, 96/4 protocol and viewer route remain available. Inferred wall extents, reused materials, visible seams and open exterior background remain explicit.

The owner waived Weave for this room-completion UI pass. Surfaces, points, provenance, source inspection, navigation and recovery are implemented and browser-tested; [tour and checks](docs/design/revisions/full-room-v4/REVIEW.md). Fifty-one Python tests, 353 application tests, typechecks and production build pass. No further model/cloud/image-generation cost was incurred. [Owner acceptance is pending](docs/design/acceptance/full-room-v4.md). The sections below preserve the preceding decisions and experiments.

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

The full scenario above remains proposed. The 2026-10-19 reconstruction-first demo implements room navigation, surface/point switching and source-view inspection using the supplied-depth Hypersim r03 mesh. Conversation, automatic object selection and memory editing remain unimplemented. See the [review packet](docs/design/revisions/room-r03/REVIEW.md); owner acceptance is pending. The owner explicitly waived Weave only for this first room-demo pass. No deadline, paid allowance, model installation or study approval is implied.

## Generative completion decision (2026-10-19)

The owner selected completion of this room and the hidden sides of existing furniture. Inventing additional rooms or unrelated furnishings is outside this pass. Small adjustments to reconstructed surfaces are allowed in a separate candidate to improve seams and continuity; the original r03 mesh remains unchanged. Generated additions and adjusted surfaces retain explicit provenance and can be compared with the original.

The owner requested investigation of their existing Modal account. Read-only checks using the existing Modal 1.6.1 client authenticated successfully, listed the selected environment, returned no apps in that environment, and confirmed the existing GLM cache volume. No compute was started, models downloaded, account settings changed, or existing volume modified. Remaining credits, billing limits and GPU allocation have not been verified.

Selected route: adapt [GenRC](https://github.com/minfenli/GenRC) to the Hypersim mesh and cameras, beginning with one bounded gap around source view 0037. CUDA tensor operations and a PyTorch3D rasterization kernel have now passed on a Modal A100-40GB using the pinned CUDA 11.7 stack. Official SD2 access remains unavailable; the owner-approved pinned community mirror and publisher-linked IronDepth checkpoints have now loaded and generated one candidate. Useful completion remains unproven.

An A100-40GB is the proposed first scene GPU for memory headroom and Ampere compatibility. At [listed Modal Function rates](https://modal.com/pricing), checked 2026-10-19, GPU cost is $2.0988/hour; adding 4 physical CPU cores and 32 GiB host RAM yields a requested-resource baseline of $2.543424/hour (about $1.27 for 30 minutes). This is cost arithmetic, not measured runtime or a quote for a completed room. Image builds, startup, higher actual CPU/RAM use, storage and transfers can add cost. The initial compatibility-test allowances and subsequently authorized single generation pilot are recorded below; no additional run is implied.

The pilot should use one container, finite timeouts, no configured automatic retries, and separate completion outputs/cache from the GLM project. Preserve masks, seed, model revisions, camera/depth conventions, original-to-candidate surface changes, peak VRAM, elapsed time and intermediate meshes. Review multiple viewpoints, legitimate openings, seam changes and contradictions with source depth before expanding coverage. Candidate quality and phase acceptance remain pending.

Implementation now provides a [bounded Modal runner and Hypersim adapter](scripts/reconstruction/GENRC.md). Its first scope is GenRC-adapted perspective completion of a central frame-0037 crop, without panoramic E-Diffusion or textual inversion. The local 17-test suite, real r03 input packaging and smoke/generation job-definition dry runs pass. The owner approved three separate attempts, each up to **$5 for one image build and one five-minute GPU compatibility test only**, with no model generation or automatic retry. The first failed on compiler selection; the second compiled PyTorch3D but was stopped on an incompatible dependency upgrade. The third corrected dependency build and single GPU smoke passed, including full GenRC imports and 992 correctly depth-tested rasterized pixels. A client result-deserialization error was recovered from saved artifacts; its plain-JSON return correction passed a local regression test and the subsequent generation invocation. Those three compatibility apps are stopped with zero tasks. The subsequently authorized generation run also completed and stopped; the reporting fix worked remotely. See the [cloud-route acceptance record](docs/design/acceptance/genrc-cloud-pilot-v1.md). Actual charges remain unverified.

The owner then authorized verified model acquisition and one bounded generation pilot, explicitly approving the unaffiliated `sd2-community` mirror at a pinned revision. All downloaded SD2 file hashes matched its published metadata; official IronDepth archives were hashed and inspected, and strict model loads passed remotely. The single A100 run produced 84,967 added triangles while preserving every original vertex, triangle and color. Central-crop raycast coverage increased from 59.03% to 75.27%, but invented window grilles/chair-like content and remaining holes make the candidate unsuitable for promotion. The existing room viewer remains unchanged. [Review images, measurements and model provenance](docs/research/hypersim/evidence/genrc-pilot-v1/REVIEW.md). Owner acceptance remains pending; no automatic retry occurred.

### Weave replacement stage

The owner rejected the SD2 pilot visually and requested stronger image editing through Weavy/Weave plus depth, mask and edge nodes. The owner has no existing workflow URL and requested a workflow specification and directly callable image-edit stage. [The prepared Weave workflow](docs/research/hypersim/WEAVE_COMPLETION.md) uses a masked GPT Image 2.5 / Sunburst floor-patch edit with inspected training references. The owner approved 8 Weave credits for one image. The run completed, but its output adopted a reference viewpoint and changed content outside the mask; it was rejected for geometry. [Raw output and measured review](docs/research/hypersim/evidence/weave-room-v1/REVIEW.md). No automatic retry or depth/mesh run followed. Local observed-depth/normal/edge guides are prepared and explicitly distinguished from inferred Weave outputs. The connector has no published workflow available and no graph-authoring/extractor operation, so the full node chain remains specified rather than executed. No new mesh or viewer change is claimed.

### Geometry-first repair (2026-10-20)

Local alternatives now separate geometry from generated appearance. Full-resolution training RGBD reprojection recovered little additional coverage. A floor plane fitted to existing geometry repairs all 9,409 pixels in the bounded lower-left patch, with a narrow seam overlap, unchanged original mesh arrays and unchanged known target RGB. Independent post-freeze held-out depth error is 0.874 mm on average. Overall central-crop coverage is still only 62.61%; full-room completion remains unresolved. A broader floor extension was rejected despite 84.47% coverage because its added-depth error and material artifacts were unacceptable. [Actual comparisons and reproducible commands](docs/research/hypersim/evidence/geometry-completion-v1/REVIEW.md); [pending acceptance](docs/design/acceptance/geometry-completion-v1.md).

The new raw-image gate rejects failed Weave outputs before compositing. The owner subsequently approved the single-target-image, masked appearance-only test for 8 Weave credits. It completed but returned an almost-black image with a small floor-texture rectangle, removing the known room surfaces. The gate rejected it; input and mask downloads matched their local hashes exactly. [v2 result and diagnosis](docs/research/hypersim/evidence/weave-room-v2/REVIEW.md). No texture or new depth was applied to the repaired mesh, and no UI/viewer promotion or automatic retry occurred. Independent material generation mapped onto fixed geometry is the next proposed alternative; it has not run.

### Independent material adapter (2026-10-20)

The local material route is now implemented and exercised. It extracts a complete 40 cm floor tile from training frame 0005 with per-texel depth checks, then applies camera-independent world-coordinate texture detail to the existing repaired floor. Geometry, original vertex colors and protected target pixels are preserved; depth renders are identical at the target and two nearby views. Forty-seven tests pass. [Before/after evidence and reproduction](docs/research/hypersim/evidence/material-completion-v1/REVIEW.md); [acceptance pending](docs/design/acceptance/material-completion-v1.md).

This is inferred reuse of source material, not a new ML generation or recovered texture at the missing location. No further Weave credits were spent, and rejected outputs were not reused. The adapter currently accepts verified source-material tiles only. The new PLY is a separate review candidate; the browser viewer and unresolved room gaps are unchanged.

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
