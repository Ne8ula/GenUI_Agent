# HCI Research Proposal: EVA for Dreamatorium Steps 6–7

- **Student:** [Student name]
- **Faculty supervisor:** Professor José Sánchez
- **Research context:** Game Assemblies Lab
- **Term:** Fall 2026 context retained; the expanded program has no newly approved deadline.
- **Updated:** 2026-10-15.
- **Scope:** EVA is Dreamatorium's agent. GenUI_Agent combines genuine 3D reconstruction (Dreamatorium System B) with expressive rendering and spatial experience (System C).
- **Status:** Owner-directed research alignment; new implementation phases, protocol, sampling, and research results remain proposed.
- **Paper split:** Shado owns Steps 1–5 and a model/geometric-learning paper. GenUI_Agent owns Steps 6–7 and an HCI paper for research and industry audiences.

## Research goal

Determine how reconstructing and expressively rendering generated video affects spatial understanding, exploration behavior, and evidence interpretation, and whether independently established improvements from Shado's upstream pipeline translate into better human interaction with those environments.

The primary contribution is HCI evidence and design knowledge about people using the resulting environments. Steps 6–7 provide the experimental system. A person should be able to explore the scene, compare its raw and artistic representations, inspect its sources and limitations, and dismiss or simplify it. Paris is the flagship scenario; it is not the sole evidence of generality.

## Seven-step pipeline and two papers

![Dreamatorium flowchart: Shado owns Steps 1–5; EVA in GenUI_Agent owns Step 6 genuine 3D reconstruction and Step 7 aesthetic rendering.](figures/dreamatorium-seven-step-flow.png)

*Owner-supplied diagram, preserved unchanged. Its arrows express proposed dependencies, not established model or human benefits.*

**Shado / Paper 1:** reference image + prompt → AI video generation → marker-based geometric verification → synthetic-data selection + model post-training → marker-free generation. This paper tests upstream geometry and generalization.

**GenUI_Agent / Paper 2:** genuine 3D reconstruction → Dreamatorium aesthetic rendering and creative interaction. This paper tests how people understand, explore, and assess the resulting environments, including whether upstream gains lead to downstream human benefits.

Shado provides frozen baseline/treatment clips, pairing IDs, model/configuration provenance, all attempts/failures, and independent quality evidence. EVA holds reconstruction and rendering constant for the upstream comparison. Shared data and diagnostics are disclosed and cited across the two papers, not presented as separate new discoveries.

## Track ownership

| Track or system | Scope | Relationship to EVA |
| --- | --- | --- |
| Track A | Creating/improving the video-generation model, including marker-assisted learning | Upstream and outside this repo's research contribution |
| Track B | Revision/editing research | Supporting mechanisms and interfaces; no primary revision-superiority hypothesis |
| Track C | Reconstruction, rendering, and experience | EVA / GenUI_Agent's sole research alignment |
| Dreamatorium System B | Genuine 3D reconstruction | Included |
| Dreamatorium System C | Expressive computational rendering and spatial interaction | Included |

Track labels are not interchangeable with the supplied document's System labels: System B means reconstruction, not revision. Optimizing a per-scene 3D Gaussian representation belongs to Track C; training a video generator belongs to Track A.

This replaces the earlier proposal's primary focus on contingent revision. That work remains useful for interruption, selection, locks, undo, equivalent controls, and qualitative context. Its exact text is [preserved](history/2026-10-15-before-track-c/README.md).

## Research questions and hypotheses

**Primary HCI question:** How do navigable reconstruction and expressive rendering affect people's spatial understanding, exploration, and ability to judge what an environment supports—and how do these outcomes change with matched baseline versus Shado-treated inputs?

| ID | Proposed test | Main evidence |
| --- | --- | --- |
| C-H1 | A fixed pipeline reconstructs a meaningful proportion of a declared input class into usable navigable scenes. | All-attempt yield, registration, held-out views, coverage, and geometry error where ground truth exists |
| C-H2 | Geometry-anchored expression reduces viewpoint-dependent drift compared with a matched image-derived 2.5D baseline. | Fixed camera paths, independent anchors, occlusion/attachment error |
| C-H3 | Structured contours, points, and selective materials support interpretation and exploration while offering expressive qualities beyond the raw reconstruction. | Matched raw/stylized tasks, spatial comprehension, open experiential accounts, tradeoffs |
| C-H4 | Evidence, inferred geometry, artistic treatment, and unknown regions remain distinguishable in expressive presentation. | Source-location and classification tasks with identical provenance access |
| C-H5 | The frozen reconstruction/export/rendering grammar transfers to held-out supported scenes without bespoke per-scene rescue. | Scene-family benchmark, stage-specific and full-pipeline success, manual intervention logs |
| C-H6 | Independently established upstream geometry gains lead to better spatial understanding after the same Steps 6–7 pipeline. | Matched Shado baseline/treatment cohorts, frozen downstream system, participant comparison and failure accounting |

These are hypotheses/propositions to evaluate, not promised positive findings. C-H3/C-H4/C-H6 are the HCI argument; C-H1/C-H2/C-H5 establish enabling feasibility/validity. C-H3 does not equate preference with comprehension. C-H4 needs a justified margin and sample for formal noninferiority. C-H6 may fail even when Shado improves geometric scores.

Choose one primary human endpoint, initially spatial-relation or viewpoint-transfer accuracy against an independently adjudicated answer key. Secondary behavioral measures include task success/time, route efficiency, revisits, viewpoint choices, and source-inspection actions. More exploration time can indicate confusion rather than engagement. Assess confidence against correctness; do not treat greater trust as inherently beneficial. Presence, learning, emotion, and long-term behavior change require distinct justified measures and cannot be inferred from appearance or dwell time.

## Current foundation and remaining gap

The [dated capability audit](EVA_IMPLEMENTATION_STATUS.md) is the detailed status source. It separates inspected code from recorded validation and acceptance.

| Existing work | What it supplies | What it does not establish |
| --- | --- | --- |
| Week 1 desktop/weather/voice | Historical working foundation; owner-reported successful demo | Later phase acceptance, general generation, or participant findings |
| Week 2 weather/particles | Browser expression and control experiments | Native recovery after the quarantined candidate or accepted E1 completion |
| Week 3 conversational eye | Implemented expressive vocabulary, visual approval for a specific revision, bounded voice integration records | Full physical live-voice acceptance or emotional-understanding evidence |
| Week 4 Rust/core/broker work | Authored geometry/rendering and control contracts | Multiview scene reconstruction or complete native staging |
| Paris R11/R12 | Source-derived GPU visual baselines and recorded browser checks | Trained 3DGS, LiDAR, unknown-view geometry recovery, or final phase acceptance |
| R13 arrival | Concurrent eye-to-Paris implementation | Verified integrated reconstruction-to-experience pipeline |

The crucial new technical gap is a genuine camera-recovery/reconstruction/export path feeding the expressive renderer. Source-image particles and shallow authored depth remain valuable labelled prototypes and comparison baselines. They cannot be renamed reconstruction evidence.

## Proposed artifact

EVA will consume a versioned scene package with input provenance, cameras, coordinate/scale conventions, representation type, raw scene attributes, coverage, and evaluation diagnostics.

The experience will expose:

- A bounded eye-to-scene construction and return.
- Raw reconstruction and expressive points/contours/material modes.
- Navigation within a declared supported viewpoint range.
- Source, representation, and unknown-region inspection.
- Pause, intensity, reduced motion, keyboard access, and stop.
- A small supported set of parameter revisions where useful.

Reconstruction runs outside the interactive frame loop. Models may choose validated packages and bounded presentation parameters; runtime model output cannot execute code, invent verified claims, or authorize desktop actions. A prepared construction timeline is artistic content, not an invented live-processing percentage.

## Research method

### Technical reconstruction and rendering work

Begin with controlled synthetic and captured static scenes, then frozen generated-video cohorts. Use existing reconstruction methods with fixed frame sampling, settings, optimization budgets, and failure rules. Freeze fitting/evaluation splits before tuning. Record every attempted sequence.

Evaluate raw reconstruction before stylization. Use independent geometry and camera references where available; otherwise report consistency and reconstructability. In unconstrained generated video there is no automatic physical ground truth. Keep known-camera or other assisted runs separate from the ordinary camera-recovery condition. If low yield motivates a narrower input class, preserve the original denominator and require a fresh held-out cohort for confirmatory claims about that refined class.

Test geometry-anchored expressive layers across held-out viewpoints against a matched 2.5D/view-dependent baseline. Preserve source material, initial framing, style vocabulary, and camera envelope as far as possible; document residual capacity differences.

### Representation and experience study

Compare **raw reconstruction** and **structured stylization** of the same scene. If feasible, add an **unstructured stylization** with approximately matched density/visibility to test the structural-selection rule more directly.

Keep the underlying geometry, sources, camera envelope, interaction functions, eye/voice behavior, information availability, and provenance access equal. The unit of observation is an exploration episode over a scene with defined tasks; repeated episodes within a participant are not independent participants.

Choose one primary comprehension endpoint, such as correctly identifying predefined spatial relationships. Collect navigation performance and open accounts of scene/subject interpretation, coherence, ambiguity, distraction, and comfort. Ask open questions before presenting aesthetic or agentic labels. A preference score alone cannot establish the hypothesis.

Include evidence-discrimination tasks: identify original source content, inferred geometry, artistic treatment, and unknown regions using answer keys derived from actual processing/provenance records. Permit overlapping labels or ask about specific attributes; an inferred surface can simultaneously have source-derived color and artistic masking. A generated Paris interpretation cannot borrow historical authority merely by appearing beside an archival photograph.

### Transfer

Hold out source assets and at least one supported scene category. Freeze reconstruction and renderer settings, grammar, retry limits, and scoring. Report reconstruction success, renderer success on valid supplied scenes, and full-pipeline success separately. Record manual geometry/shader authoring as an intervention, not autonomous transfer.

### Upstream-to-human comparison

C-E6 compares frozen Shado baseline and treatment marker-free outputs matched by source/prompt family, camera request, settings, and generation budget. Hold Steps 6–7 and the task protocol fixed. Randomize/counterbalance participant exposure and mask checkpoint identities where feasible. Evaluate the prespecified spatial-understanding endpoint and secondary exploration/evidence outcomes.

Report all-attempt usable-experience yield separately from participant outcomes on the prespecified common reconstructable subset. Retain all exclusions/failures and acknowledge survivor selection; do not fabricate comprehension scores for unavailable experiences. A separate realistic failure-encounter study can assess whole-system usability.

Matching prompts and seeds does not isolate geometry: appearance, semantic content, and motion may also change. The initial causal claim concerns the complete upstream treatment's downstream effect. Metric-to-behavior associations alone do not establish geometry as the mechanism. The existing same-reconstruction raw/stylized study isolates the presentation tradeoff more directly; a powered 2 × 2 upstream-condition × renderer-style study is optional.

Until Shado's paired outputs and independent quality evidence exist, controlled/captured or existing-generator scenes can support downstream HCI research. They cannot establish that Shado's Steps 1–5 caused a human benefit. Report C-E6 as untested and extend its schedule if the handoff is delayed.

## Sampling and analysis

Use a formative round of approximately 6–8 participants, subject to faculty and institutional approval, to establish task clarity, tolerable duration, and credible condition matching. This is a planning envelope, not a power calculation.

A confirmatory study requires a prespecified primary contrast, smallest worthwhile effect or acceptable-loss margin, participant-count justification, exclusions, and analysis. If that sample is infeasible, report formative research-through-design findings rather than a general causal or equivalence claim.

Use appropriate paired/hierarchical analysis for participant and scene dependence. Show distributions, effect estimates, uncertainty, failures, and missingness. Link qualitative interpretations to actual viewpoints and interactions; report the real coding process and disconfirming accounts. Owner critique and developer tests remain separate evidence.

## Implementation and milestone sequence

The [full Track C plan](EVA_RESEARCH_IMPLEMENTATION_PLAN.md) owns detailed contracts, experiments C-E0–C-E6, and milestones C-M0–C-M7.

| Milestone | Proposed outcome |
| --- | --- |
| C-M0 | Feasibility, genuine reconstruction/import/navigation, contracts and protocol |
| C-M1 | Controlled/captured reconstruction baseline |
| C-M2 | Frozen generated-input yield and failure analysis |
| C-M3 | Spatial expressive renderer and attachment evaluation |
| C-M4 | Integrated EVA encounter and matched study conditions |
| C-M5 | Human representation/evidence evaluation and C-E6 when upstream cohorts are ready |
| C-M6 | Held-out transfer and complete pipeline benchmark |
| C-M7 | Reproducible artifact, research report, and demonstration |

The full program estimates 18–20 working weeks after resources and scope are agreed. A 4–6-week MVP proves one reconstruction-to-renderer path, attempts a generated input, adds raw/stylized inspection, and records an EVA encounter. Neither schedule is an approved semester deadline.

These new identifiers do not redefine historical E1 or S0–S4 acceptance. Existing archive, installation, budget, native-validation, and owner-review requirements remain. The ComfyUI S2/S3 gate is retained, but ComfyUI is not a dependency of this plan.

## Definition of success

**Technical success:** The declared input class has a measured usable-reconstruction yield; the renderer consumes actual spatial data; expressive layers remain attached over the supported camera range; controls and provenance work. Freeze numerical yield/error/performance criteria on development evidence before held-out testing.

**HCI research success:** Controlled evaluations establish whether and when the environments help or hinder spatial understanding, exploration, and evidence interpretation, with actionable design implications. A positive claim that Steps 1–5 benefit HCI additionally requires the matched upstream-to-human study. Null or adverse results can constitute a completed research contribution.

**Integrated creative success:** EVA presents multiple supported, held-out scenes as coherent inspectable experiences, with raw and artistic representations clearly distinguished. The flagship demo includes viewpoint change, source/unknown-region inspection, and dismissal.

The final package includes code, scene contracts, public fixtures, splits/configs/manifests, analysis scripts, grammar/design history, approved study results where available, limitations, and a claim-to-evidence table. A beautiful Paris capture is insufficient by itself.

The HCI manuscript should lead with a human task and problem, introduce Steps 6–7 as the research artifact, explain its dependency on the separate Shado paper, and present behavioral findings before design implications and limits. Candidate implications for spatial previews, creative exploration, and exhibits remain scoped to the contexts actually studied. The work is not complete as an HCI contribution merely because reconstruction runs or shaders look convincing.

## Research basis, ethics, and limits

Use the [existing synthesis](EXPRESSIVE_RESPONSE_SYNTHESIS.md) and [artistic precedents](ARTISTIC_PRECEDENTS.md) with their reading-depth limits. Add primary literature on reconstruction evaluation, non-photorealistic rendering, spatial perception, and provenance visualization. Existing temporal-form work motivates construction as a design variable; it does not establish EVA's effects. The [full plan's sources](EVA_RESEARCH_IMPLEMENTATION_PLAN.md#13-research-basis) identify candidate technical foundations.

Public artifacts use synthetic or redistributable material. Restricted source assets, consent, recordings, and identifying data remain in approved private storage. Preserve camera/source uncertainty, generated-content labels, and known missing regions. Do not infer emotion, consent, or historical truth from visual expression.

Video-model creation, revision-algorithm superiority, arbitrary world generation, persistent relationships, production accounts, and unverified native/voice behavior are outside the current research claim. The [canonical plan](../../PLANNING.md) preserves deferred product architecture without making it a Track C completion requirement.
