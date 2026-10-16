# Project EVA
## Research and Implementation Plan v1.0 — Conversational Composition and Revisable Visual Experiences

**Date:** 2026-10-15  
**Status:** Proposed research program and implementation sequence  
**Repository:** GenUI_Agent  
**Primary objective:** Develop and evaluate a generative interface that turns conversational intent and source material into expressive visual compositions that people can meaningfully reshape.  
**Research focus:** Contingent expression, continuity during revision, user influence, and factual clarity.  
**Flagship application:** An EVA eye that constructs a source-informed interpretation of 1980s Paris, then responds to correction, selection, comparison, and redirection.

> **Final research goal:** Establish when and how a generative interface can make a person's influence legible through the changing behavior of an expressive composition, while preserving relevant context, reliable information, and control.

This plan expands the [independent-study proposal](GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md) into a longer research program using the architecture, phases, experiments, and success levels of the supplied Dreamatorium plan. It proposes an extension beyond the original weather experiment; it does not record completed experiments or advance a phase. [PLANNING.md](../../PLANNING.md) remains the governing scope and architecture plan, [DESIGN.md](../../DESIGN.md) owns the design grammar, and [AGENTS.md](../../AGENTS.md) owns repository workflow. If this expanded program is adopted, reconcile those documents in one scoped follow-up instead of maintaining conflicting roadmaps.

The September research documents and later Week 3–4 briefs describe different stages of the project. Preserve that history. The [current eye-to-Paris brief](../../week4/docs/design/revisions/w4-20261015-eye-paris-construction-r13/BRIEF.md) describes a bounded browser construction study; it does not establish arbitrary runtime composition, native desktop integration, or participant findings. Newer explicit owner instructions take precedence over older technical proposals.

---

# 1. Project Architecture

EVA comprises three independently testable systems. Their shared research unit is a **response episode**: an initial request, a composition, one or more interventions, the resulting revisions, and the person's decision to continue, simplify, or stop.

## System A — Conversational Composition and Source Grounding

**Input:** A request, curated source material, available visual primitives, explicit presentation preferences, and bounded session context.

**Process:**

1. Interpret the requested subject, emphasis, and interaction goals.
2. Retrieve from an approved source packet or report missing evidence.
3. Separate factual claims, source-supported interpretation, and artistic invention.
4. Compose a declarative experience specification from supported primitives.
5. Attach source references and interaction affordances to relevant entities.
6. Validate content, references, resource limits, and allowed operations.
7. On a follow-up, propose a patch against the current revision.

**Output:** A validated composition or revision proposal with inspectable provenance.

The model composes bounded data. It does not send executable JavaScript, HTML, shaders, shell commands, or arbitrary native actions to the renderer. Model selection remains configurable; model training is not required for the initial research contribution.

## System B — Continuous Interaction and Revision

**Input:** A validated composition, current rendered state, user selections, locks, corrections, and cancellation events.

**Process:**

1. Maintain stable entity identities and revision history.
2. Resolve references such as “this café” through explicit selection or clarification.
3. Apply valid patches atomically against the expected revision.
4. Retain unaffected objects, user edits, and locks.
5. Transition from the current visual state, including partially completed movement.
6. Support undo, interruption, reduced motion, inspection, and a plain presentation.
7. Reject superseded results and record the effect of each intervention.

**Output:** A revisable experience and a trace linking requests, decisions, visible changes, and retained state.

## System C — Expressive Presentation and Evaluation

**Input:** The validated state, approved visual grammar, source assets, and an explicit experiment condition.

**Process:**

1. Render the eye, particles, structures, typography, source material, and contextual controls.
2. Coordinate attention, yielding, construction, revision, and return.
3. Preserve readable information and source access throughout expression.
4. Render matched comparison conditions from the same content and functional operations.
5. Record timing, performance, state transitions, and research measures.

**Output:** An inspectable interactive artifact, reproducible episodes, and evidence about the experience of revision.

## Relationship to Dreamatorium

Dreamatorium investigates marker-assisted geometric learning and reconstruction. EVA investigates how people steer expressive generated experiences. A later adapter may let EVA use Dreamatorium scenes, but the initial studies can use authored geometry, source images, and existing assets. Representations must declare whether they are 2D, 2.5D, authored 3D, or reconstructed 3D. Particle depth and camera motion alone do not establish reconstruction accuracy.

---

# 2. Research Questions and Hypotheses

**Primary research question:** How does a generative interface's contingent visual response to user intervention affect perceived responsiveness and user influence?

**Secondary questions:** What does continuity contribute? Can composition extend beyond prepared examples? Can expressive experiences preserve a clear distinction between evidence and interpretation?

The hypotheses below are proposed tests, not commitments to positive results. H2 is the primary human-interaction hypothesis. H1 and H4 concern system behavior; H3 is a focused human follow-up; H5 is an information-quality guardrail.

| ID | Hypothesis | Main comparison | Evidence against the hypothesis |
| --- | --- | --- | --- |
| H1 — Faithful composition | A bounded composer can satisfy held-out combinations of supported requests and constraints more often than a fixed recipe selector. | Model composition versus a capable authored recipe selector with the same assets, grammar, and input interpretation. | No material advantage; more violations, failures, or unsupported content. |
| H2 — Contingent expression | Expression coordinated with the target and meaning of an intervention increases perceived responsiveness relative to matched generic motion. | Contingent expression versus authored motion with identical successful functional revisions. | No practically meaningful gain, contrary interpretations, or a gain accompanied by unacceptable comprehension/control costs. |
| H3 — Revision continuity | Preserving visible object correspondence across a revision improves recognition of what changed and reduces reorientation effort. | Continuous revision versus a discontinuous presentation of the same resulting state. | No useful improvement or increased confusion, distraction, or task difficulty. |
| H4 — Transfer | The composer remains useful on held-out prompt, asset, and supported scenario families without new scenario-specific recipes or prompt tuning. | Locked transfer benchmark versus in-domain benchmark and recipe baseline. | Gains disappear outside prepared scenarios or require manual intervention for each case. |
| H5 — Factual clarity | Expressive presentation can preserve evidence/interpretation discrimination and source-finding accuracy within a prespecified acceptable loss relative to a plain presentation. | Expressive versus plain versions of the same source packet and claims. | Increased unsupported beliefs, poor source identification, or degradation beyond the chosen margin. |

For H1, schema validity is insufficient: independent checks must establish whether the requested meaning was implemented. For H4, transfer is limited to the declared grammar and available assets; success does not establish arbitrary world generation. For H5, absence of statistical significance does not prove equivalence. A formal noninferiority claim requires an advance margin and adequate sample justification; a small formative study can only describe observed failures and uncertainty.

## Intended contributions

1. A documented grammar for proposing, attending, yielding, revising, and returning.
2. A bounded composition-and-patch representation with stable identity and provenance.
3. Controlled evidence about contingent expression and revision continuity.
4. A benchmark of supported and unsupported requests, corrections, and transfer cases.
5. An inspectable artistic prototype and a critical account of where the approach fails.

These are candidate contributions. A targeted literature review must establish their relationship to prior work before making novelty claims.

---

# 3. Recommended Technology Stack

Retain existing foundations and choose the active renderer through a small feasibility comparison. The repo contains both Rust rendering work and a newer Three.js browser proof; this plan does not silently replace either or mandate a new implementation stack.

| Component | Proposed implementation | Responsibility |
| --- | --- | --- |
| Host and controls | Existing React and TypeScript app | Input, accessible controls, source inspection, experiment runner |
| Desktop shell | Existing Tauri/Rust architecture when native integration is in scope | Native window lifecycle and broker-owned effects |
| Visual renderer | Existing Three.js path or Rust/WASM renderer selected at Phase 0 | Approved primitives, rendering, continuous transitions |
| Composition contracts | Versioned JSON Schema and typed adapters | Validate experience specifications and patches |
| Runtime model adapter | Provider-neutral TypeScript service behind existing boundaries | Bounded composition, cancellation, request/version tracking |
| Source registry | JSON manifests and approved local assets | Claims, evidence references, interpretation labels, rights metadata |
| State and revision engine | Deterministic reducer and event log | Entity identity, patch preconditions, locks, undo, stale-result rejection |
| Voice extension | Existing speech pathway after separate integration checks | Speech input/output and interruption; optional in core experiments |
| Verification | Existing JS/Rust test infrastructure and browser automation | Invariants, fixture replay, failure cases, visual and timing checks |
| Analysis | Python or R selected for the locked protocol | Descriptive results, uncertainty, statistical analysis where justified |
| Research records | Versioned JSON/JSONL/CSV plus private approved study storage | Reproducibility without publishing personal records |

Rendering and local controls must work without waiting for model output. The deterministic runtime owns stop, cancellation, validation, and authority. Generated media may enrich an experience but cannot contain the only readable facts or operational controls.

Visual implementation follows the current [reference-authoring workflow](../design/FIGMA_WEAVE.md), including the recorded 2026-10-15 temporary override of the Weave-only route. Verify the active instruction at implementation time. This documentation task does not require image generation or authorize paid runs.

---

# 4. Implementation Phases

The complete program is approximately 18–20 working weeks after scope, resources, and study access are established. These are dependency estimates, not a Fall 2026 deadline. A shorter deliverable should use the minimum viable research milestone in Section 10.

## Phase 0 — Scope, Feasibility, and Protocol Definition

**Target:** Weeks 1–2.

### Tasks

- Inventory implemented, authored, proposed, and unverified capabilities in Weeks 1–4.
- Choose a research branch/workspace within the existing repository without disturbing concurrent work.
- Select the initial renderer through a fixture requiring selection, a local patch, interruption, and source inspection. Compare actual behavior and maintenance cost, not screenshots alone.
- Define the supported primitive vocabulary and explicit unsupported cases.
- Freeze coordinate conventions, entity identity rules, source references, and representation labels.
- Establish a baseline request-to-render trace and test cancellation before adding model complexity.
- Specify H2's manipulation and primary outcome; define H1/H4 scoring rubrics independently of the composer.
- Expand the literature review around generative interfaces, temporal form, object correspondence, mixed initiative, and evaluation instruments.
- Obtain faculty/institutional guidance on participant research and prepare materials before recruitment.
- Set a finite model/media budget, benchmark attempt count, and retry policy.

### Deliverables

- Capability audit and renderer decision record.
- Architecture and schema specification.
- Draft experiment protocol, source policy, and analysis plan.
- Feasibility fixture with a reproducible trace.

**Exit gate:** One authored composition accepts a local intervention, preserves a locked entity, handles cancellation, and exposes source provenance. Failure narrows the grammar or renderer choice before expanding generation.

## Phase 1 — Authored Interaction and Expressive Grammar

**Target:** Weeks 3–4.

### Objective

Establish reliable expressive revision independently of model quality.

### Tasks

- Build one Paris episode using prepared source material and explicitly authored behavior.
- Implement selection, focus, comparison, simplification, pin/lock, undo, and source inspection.
- Author at least two ways of expressing the same intervention, such as gathering around the selected subject versus yielding surrounding material.
- Implement local interruption and continuation from the current rendered state.
- Provide plain and reduced-motion presentations with equivalent essential controls.
- Produce the first contingent and matched-motion versions from a common functional state engine.
- Save before/after captures, transition recordings, and deterministic replay fixtures.

### Deliverables

- Grammar entries added to DESIGN.md only through a scoped authorized update.
- Authored Paris episode and condition fixtures.
- Technical interaction report and design critique record.

**Exit gate:** Every required intervention works in all conditions; comparison controls do not break functions or hide information. The system is still described as authored at this stage.

## Phase 2 — Source Grounding and Model Composition

**Target:** Weeks 5–7.

### Objective

Replace prepared composition choices with validated runtime proposals while preserving deterministic interaction.

### Tasks

- Create curated source packets with verifiable dates, places, captions, and usage permissions.
- Implement the request interpreter, composition adapter, semantic checks, and patch validator.
- Preserve an identical input interpreter for composer and recipe-baseline evaluations where possible.
- Define ambiguity handling: explicit selection, a concise clarification, or an honest unsupported response.
- Build a second scenario in a different information domain, such as synthetic weather or a documented object/material explanation.
- Support multiple successive corrections, including correction of an earlier interpretation.
- Record all proposals, rejected outputs, retries, fallback choices, and final visible states.
- Keep factual content and source links host-rendered and inspectable.

### Deliverables

- Versioned composition and patch schemas.
- Model adapter and authored-recipe baseline.
- Two source packets and executable scenario families.
- Pilot composition report.

**Exit gate:** Unseen combinations of supported requests produce meaningfully different valid compositions or appropriate refusals. Selecting the same prepared film or changing only color does not establish composition.

## Phase 3 — Technical Benchmark and Fault Handling

**Target:** Weeks 8–9.

### Objective

Evaluate H1 and establish readiness for people to use the prototype.

### Tasks

- Lock development/test splits before tuning the final composer.
- Run composer and recipe baseline on the same requests, source packets, asset budgets, and supported operation set.
- Include multi-step edits, ambiguous references, contradictions, unsupported requests, stale responses, malformed patches, and missing assets.
- Measure semantic success, constraint preservation, source accuracy, latency, cost, and failures.
- Stress interruption at different lifecycle points and during late asset arrival.
- Inspect actual rendered outputs as well as structured specifications.
- Freeze the human-study build after critical failures are resolved.

### Deliverables

- Technical benchmark and complete attempt manifest.
- H1 analysis and error taxonomy.
- Reproducible study candidate and known limitations.

**Exit gate:** Core correctness and cancellation checks pass, performance is usable on the declared device, and condition fidelity is verified. A weak composer does not prevent a carefully labelled authored study of H2; it prevents claiming runtime generative success.

## Phase 4 — Primary Contingent Expression Study

**Target:** Weeks 10–12, subject to research approval and recruitment.

### Objective

Evaluate H2 without confounding expressive contingency with model quality, voice, or functional success.

### Tasks

- Use validated, prepared specifications from a frozen set for the controlled comparison.
- Pilot instructions, episode duration, condition matching, rating items, and interview prompts.
- Counterbalance condition and task order; use equivalent content variants rather than asking people to memorize repeated answers.
- Run the contingent-versus-matched-motion comparison in Section 6.
- Ask open accounts before supplying terms such as attention, agency, or collaboration.
- Analyze event-level explanations together with ratings, comprehension, and control outcomes.
- Record disagreement, indifference, distraction, and refusals of the expressive framing.

### Deliverables

- Final protocol and approved study materials.
- Condition-fidelity audit.
- H2 results, discrepant cases, and revised design principles.

**Exit gate:** Produce an interpretable result with limitations, whether positive, negative, or inconclusive. A positive result is not required to finish the phase. If participant research cannot proceed, deliver the study-ready artifact and protocol and mark the human hypothesis untested.

## Phase 5 — Revision Continuity and Evidence Comprehension

**Target:** Weeks 13–15.

### Objective

Separate the contribution of continuity from general expression and examine H5's factual-clarity guardrail.

### Tasks

- Compare a continuous transition with a discontinuous presentation of the same final state.
- Preserve locks, edits, source content, and final object positions in both versions.
- Measure change attribution, object reacquisition, and reorientation effort.
- Compare expressive and plain presentations for source location and evidence/interpretation classification.
- Use separate blocks or a separate study to avoid a large factorial design.
- Revise labels, source access, or transition grammar in response to failures; evaluate a materially revised design as a new version.

### Deliverables

- H3 analysis and continuity recommendations.
- H5 discrimination results and source-access audit.
- A decision on any additional powered study needed for a formal claim.

**Exit gate:** Identify where continuity helps and where expression obscures evidence. Do not promote a design with unresolved serious source confusion merely because participants like it.

## Phase 6 — Transfer and Live Composition Evaluation

**Target:** Weeks 16–18.

### Objective

Evaluate H4 and the integrated live system beyond prepared Paris episodes.

### Tasks

- Freeze prompts, model configuration, grammar, retry budget, and scoring before accessing the transfer set.
- Introduce new source assets, held-out prompt families, longer correction sequences, and one supported but previously unseen scenario family.
- Run all scheduled attempts with fixed limits; retain failures in the denominator.
- Compare to the recipe baseline and the in-domain benchmark.
- Conduct a bounded live-use assessment if approved, logging actual model delays and fallbacks.
- Separate evidence from prepared controlled conditions from evidence about real runtime behavior.

### Deliverables

- Locked transfer suite and H4 report.
- Live-system latency, cost, failure, and recovery report.
- Demonstrations across at least three scenario families, labelled by provenance and capability.

**Exit gate:** State the demonstrated generalization boundary. A domain added through new bespoke recipes is implementation expansion, not held-out transfer.

## Phase 7 — Research Synthesis and Demonstration

**Target:** Weeks 19–20.

### Tasks

- Consolidate the final grammar, schemas, protocols, results, and design history.
- Package runnable synthetic/public fixtures and analysis scripts.
- Produce a flagship Paris demonstration and contrasting scenario demonstrations.
- Include corrections, refusal, source inspection, and interruption in the demo.
- Report technical success and each research hypothesis separately.
- Prepare a manuscript or thesis chapter, limitations, and a clear claim-to-evidence table.

### Deliverables

- Final research report and reproducibility package.
- Versioned prototype and demonstration recording.
- Explicit technical, research, and artistic success assessment.

**Exit gate:** Another researcher can reproduce the public technical benchmark and inspect the basis of every reported claim. Personal study data remain under their approved access rules.

---

# 5. Expressive Composition and Revision Engine

## 5.1 Experience specification

A specification should contain:

- Experience ID, schema version, source-packet version, and revision number.
- Subject, requested emphasis, and declared representation type.
- Stable entity IDs, supported primitive types, relationships, and anchor constraints.
- Content references and provenance status for claims and assets.
- Bounded material, layout, intensity, and temporal parameters.
- Interaction affordances and accessible equivalents.
- Presentation preferences and user locks, with authority retained by the host.
- Explicit unavailable or unsupported elements.

Prefer named behaviors with constrained parameters to free-form animation code. All source IDs must resolve to the current approved registry. Valid references do not automatically mean a claim is supported: semantic verification checks that relationship separately.

## 5.2 Revision contract

A revision proposes changes against an expected base revision. The runtime validates the entire patch before applying it. Useful operations include selecting, emphasizing, comparing, adding an allowed entity, updating an allowed property, hiding, simplifying, and restoring a prior presentation.

The lifecycle is: receive intervention → acknowledge locally → prepare proposal → validate → apply → transition → settle. A newer intervention may supersede an older one at any point. Invalid patches leave the last valid state intact and produce an understandable recovery option.

Undo restores presentation and approved content state; it never restores expired permissions, revoked evidence, or obsolete authority. If a requested edit conflicts with a lock, explain the conflict rather than silently overriding it.

## 5.3 Continuity constraints

- Retain IDs for surviving entities.
- Preserve unaffected spatial anchors and reading surfaces where appropriate.
- Maintain selection, keyboard focus, locks, and user edits.
- Retarget from the actual current pose/velocity instead of restarting an introductory animation.
- Keep causal changes local enough to follow; explain necessary global changes.
- Allow a deliberate reset when the user requests one or the subject genuinely changes.

Continuity is a design variable, not an instruction to animate every change. Reduced-motion users may receive immediate state changes with explicit change summaries and stable placement.

## 5.4 Expressive grammar

| Behavior | Intended role | Example | Failure to watch for |
| --- | --- | --- | --- |
| Propose | Make a provisional interpretation available | Assemble a source-informed street composition | Presenting artistic choices as historical certainty |
| Attend | Make the target of an intervention legible | Rebalance around a selected café | Spotlighting the wrong object |
| Yield | Give priority to direct user control | Move surrounding material away from a locked reading region | Motion that competes with input |
| Revise | Show what changed and why | Transform the selected period while preserving comparison anchors | Whole-scene replacement that loses context |
| Settle | Make the answer usable | Reduce movement around text and inspection controls | Persistent spectacle or blocked reading |
| Return | End or simplify the encounter | Restore the eye or plain presentation promptly | Delayed dismissal or revival of cancelled effects |

## 5.5 Source and interpretation layers

Use distinct host-owned labels for verified source material, supported claims, interpretive synthesis, and artistic invention. Source inspection should reveal the actual supporting item and relevant passage/caption, not merely a generic bibliography.

For Paris, identify the exact date/place supported by each asset and the limits of the collection. A curated packet cannot represent every experience of a city or decade. An expressive scene should be presented as one interpretation. Unsupported details remain labelled artistic choices or are omitted.

## 5.6 Multimodal and native extensions

Voice, sound, native windows, embodied perspective, and long-term memory are separate extension tracks after the core study. For a voice comparison, preserve the same spoken content, delivery, and availability across visual conditions; test interruption in the real audio environment. Native desktop effects require actual native lifecycle and restoration tests. A browser demonstration cannot establish them.

Persistent memory requires a longitudinal protocol. Repeated use within one session cannot establish relationship development. Dreamatorium integration requires a separately validated scene adapter. None of these extensions is necessary to test H2.

---

# 6. Experimental Design and Measurement

## Experiment E0 — Runtime Invariants and Feasibility

Exercise valid/invalid patches, cancellation, undo, missing assets, source mismatch, lock conflicts, and interruption during transition. Test late model and asset callbacks after dismissal, app unmount, and superseding revisions. Include render-resource exhaustion and an accessible fallback.

**Measures:** Validation outcome, state preservation, stale-result rejection, source-reference integrity, local input delay, frame timing, memory/resource use, and recovery success.

**Pass rule:** All enumerated critical invariant tests pass on the frozen release candidate. This is a finite test-suite result, not proof that every future input is safe or correct.

## Experiment E1 — Composition Fidelity

**Targets:** H1 and technical readiness.

Compare two methods:

- **G:** Model composition using the bounded grammar and patch interface.
- **R:** A documented authored recipe selector with parameterized variations and the same input interpretation, sources, assets, and operations.

R must be a credible baseline rather than a single rigid Paris script. Provide equal development attention and record its recipe coverage. Compare end-to-end cost and latency without artificially slowing R to equal G.

Prepare approximately 120 development cases and 120 held-out test cases as a starting engineering budget, with three scheduled attempts per test case for each method. Revise and freeze these counts in Phase 0 according to cost and family coverage; they are not a statistical power calculation. Deterministic repetitions measure repeatability, not new independent cases.

Include initial requests, combinations of supported constraints, successive corrections, reference resolution, comparisons, reversals, unsupported requests, and contradictory instructions. Split related sources and paraphrase families together. Define success per case before running either method.

**Primary endpoint:** End-to-end semantic success per scheduled attempt: the visible result satisfies the requested constraints, preserves required state, and introduces no unsupported factual assertion.

**Secondary endpoints:** Constraint pass fraction, first-attempt validity, delivered validity after bounded repair, appropriate refusal, unnecessary refusal, source support, latency, retry rate, fallback rate, and cost per successful episode. Report supported and unsupported cases separately so excessive refusal cannot inflate success.

Use deterministic checks for explicit constraints and a method-masked human rubric for meaning and source support where feasible. Record masking failures and disagreements. The composing model cannot be the sole evaluator. Treat source/prompt family as a dependence group when calculating uncertainty.

## Experiment E2 — Contingent Expression

**Target:** H2; primary human study.

| Condition | Functional behavior | Expressive behavior |
| --- | --- | --- |
| C — Contingent | Identical facts, controls, successful revisions, locks, and sources | Motion and composition visibly accommodate the intervention target |
| M — Matched motion | Identical functional outcomes and response availability | Comparable authored motion unrelated to the semantic target |
| P — Plain reference | Equivalent facts, controls, and successful revisions | Minimal expression and stable reading surfaces |

**Primary contrast:** C versus M. P supports interpretation and H5; it is not the primary test of contingency.

Match asset quality, palette, motion duration, broad movement energy, text, layout readability, final semantic result, and response timing as closely as feasible. Document residual differences. Both C and M preserve continuity; manipulate continuity separately in E3. Controls, local acknowledgement, stop, and reduced motion work in every condition.

Start with typed input, neutral equivalent wording, identical eye behavior, no personal memory, and sound off. Use prepared, validated specifications to remove model variability from the causal comparison. This study tests the interaction mechanism under controlled conditions, not live model reliability.

**Proposed session:** Six short episodes, three per main condition, across equivalent content variants; brief plain-reference tasks in a separate counterbalanced block. Pilot total length and fatigue before freezing the schedule. Counterbalance condition/task assignment and avoid repeating the exact answer. Collect repeated episodes without treating them as independent participants.

**Primary outcome:** Episode-level perceived responsiveness. Pilot a clearly worded item such as “The visual response changed in a way that matched what I asked,” with an explicit rating scale. Label it researcher-authored, not a validated psychological scale.

**Secondary outcomes:** Perceived influence, accurate explanation of the change, comprehension, intervention completion, distraction, comfort, and preference. Ask “What changed because of your action?” and “What could you influence?” before introducing social interpretations. Avoid equating preference with agency.

Use counterbalanced allocation and neutral condition names. Check that participants can notice the intended manipulation without leading them. If motion energy or availability differs substantially, interpret the result as an evaluation of the combined design rather than an isolated contingency effect.

## Experiment E3 — Continuity During Revision

**Target:** H3; focused follow-up.

Compare continuous target tracking with a discontinuous transition to the same final layout, content, locks, and edits. Keep final-state availability time equal where feasible, record transitional access differences, and retain identical controls. The discontinuous condition may briefly replace the visual field but must not erase user decisions or disable correction.

After revision, ask the person to identify changed entities, locate a previously selected object, and explain what remained unchanged. The proposed primary endpoint is correct change attribution; freeze its scoring rubric and smallest worthwhile improvement in Phase 0. Secondary measures are reacquisition time from final-state availability, errors, and reported reorientation effort. Use a short workload measure only after selecting and documenting an appropriate instrument.

Do not mix this with new voice, new sources, or a different model. This contrast tests the chosen continuity treatment; it does not isolate every component of spatial, temporal, and semantic continuity at once.

## Experiment E4 — Transfer and Live Robustness

**Target:** H4.

Freeze G and R, then test:

1. Unseen wording and combinations of supported interventions.
2. New source packets and assets within familiar scenario families.
3. A held-out scenario family expressible through the same grammar.
4. Longer correction sequences and explicit out-of-scope requests.

Reserve at least one entire scenario family from tuning. Use separate family-level reporting; do not let easy paraphrases mask domain failures. Measure the same semantic endpoint as E1, relative degradation, constraint retention over successive edits, latency, and cost. Record manual rescue as failure of autonomous completion.

A later live-use session can reveal delays, negotiation, and recovery that prepared E2 stimuli suppress. Report it separately; do not pool it into the controlled contingency contrast.

## Experiment E5 — Evidence and Interpretation

**Target:** H5; required guardrail, with formal inference optional.

Compare expressive and plain versions of the same claims and source packets. Keep provenance labels, source-link availability, inspection depth, supporting content, and task wording identical; testing a different provenance interface would require its own comparison. Ask people to classify selected elements as source-supported fact, interpretation, artistic invention, or unknown; find the supporting source; and identify an unsupported assertion. Include genuinely ambiguous or missing evidence with an adjudicated answer rubric that accepts justified uncertainty.

Measure classification accuracy, source-finding success/time, unsupported-belief endorsement, and confidence relative to correctness. Confidence alone is not success. Do not intentionally present fabricated historical claims as truth outside an approved study protocol and debriefing plan.

For a formal noninferiority analysis, choose a defensible maximum acceptable loss with faculty/domain input before collecting confirmatory data and size the study accordingly. Otherwise report descriptive differences, uncertainty, and concrete failures; do not conclude “no harm” from a small null result.

## Sampling and Analysis

- **Formative stage:** Two rounds totaling roughly 6–8 participants, subject to approval, to refine tasks, matching, and measures. This is a usability/design inquiry, not a powered hypothesis test.
- **Confirmatory stage:** Determine participant count before recruitment from the primary contrast, smallest effect of interest, repeated-measures design, and attrition assumptions. Do not borrow an effect size uncritically from a small pilot.
- **Feasibility decision:** If a justified sample is unattainable, retain a formative research-through-design claim and report H2/H3 as preliminary or inconclusive.
- **Quantitative analysis:** Prespecify endpoint, exclusions, missing-data handling, dependence structure, and multiplicity treatment. Use participant-level paired estimates or an appropriate hierarchical/ordinal model; justify the selected method. Show distributions, effect estimates, and uncertainty.
- **Qualitative analysis:** Link accounts to specific intervention moments. Document the coding method, actual number of analysts, disagreements, and disconfirming episodes. Do not invent independent coding.
- **Failures:** Retain attempted episodes in completion/failure reporting. Record outcomes that could not be measured rather than silently dropping them or assigning invented ratings.
- **Protocol changes:** Version pilot modifications; freeze the confirmatory protocol before collection. Treat post hoc findings as exploratory.

---

# 7. Repository and Data Architecture

Use the existing week-based implementation until a deliberate consolidation is authorized. Add modules inside existing boundaries rather than creating a parallel application. The paths below are a proposed placement map, not a claim that the modules already exist.

| Location | Proposed contents |
| --- | --- |
| `docs/research/` | This program, literature synthesis, protocols, analysis plans, and aggregate reports |
| `DESIGN.md` | Canonical expressive grammar after scoped updates |
| `week4/schemas/` | Versioned experience, patch, source, and experiment schemas |
| `week4/core/` | State, revision, validation, and deterministic event logic where compatible with existing contracts |
| `week4/app/src/` | Composition adapter interfaces, accessible host, condition runner, and selected renderer integration |
| `week4/renderer/` | Existing Rust renderer where retained by the renderer decision |
| `week4/broker/` | Existing privileged boundary; extend only for explicitly scoped native capabilities |
| `week4/fixtures/research/` | Public/synthetic scenarios, request suites, source manifests, and replay traces |
| `week4/tests/` | Contract, state, fault-injection, and integration checks |
| `week4/scripts/research/` | Benchmark execution, manifest validation, export, and analysis entry points |
| `week4/docs/design/revisions/` | Preserved visual alternatives, captures, motion evidence, and decisions |
| Institutionally approved private storage | Consent, recordings, participant linkage, and restricted research data |

Keep Week 1–3 archives and unexplained concurrent edits intact. Do not commit dependencies, generated build output, credentials, private voice recordings, or participant data. Share reproducible public fixtures and aggregate/de-identified results only within their consent and access rules.

## Episode manifest

Record:

- Episode/scenario/condition IDs and protocol version.
- Code revision, renderer version, grammar/schema version, model configuration, and seeds where supported.
- Source packet, asset versions, claim references, representation type, and authored/model provenance.
- Request family, intervention sequence, selected targets, constraints, and locks.
- Proposed patches, validation outcomes, repairs, fallbacks, applied revisions, and rejection reasons.
- Request, acknowledgement, proposal, application, transition, and settled timestamps.
- Final rendered-state references, evaluation scores, missing outcomes, and failures.
- Allocation and participant pseudonym only in the approved private study record.

Keep model configuration separate from secrets. Provider nondeterminism must be recorded; identical seeds do not guarantee identical remote outputs. Log sufficient approved output for inspection without retaining unnecessary private conversation.

---

# 8. Research Integrity Requirements

1. **Separate technical, human, and artistic evidence.** Valid JSON, a successful demo, and positive participant interpretation establish different things.
2. **Distinguish authored behavior, procedural variation, and model composition.** Each run declares what was prepared and what was generated.
3. **Keep comparison functions equivalent.** Do not make the baseline controls ineffective to manufacture an advantage.
4. **Separate contingency, continuity, model quality, and modality.** Manipulate them in staged experiments with explicit controls.
5. **Keep sources inspectable.** Expressive confidence cannot substitute for support; visual effects cannot imply measured certainty.
6. **Preserve held-out evaluation.** Split source assets, prompt families, and scenarios before tuning; disclose any test exposure.
7. **Retain failures and bounded retries.** Report first-attempt and delivered performance separately. A best-of-many demonstration is not a benchmark.
8. **Test real behavior.** Browser captures do not establish native effects, audio interruption, or a physical relationship to the environment.
9. **Keep timing truthful.** Authored construction is experience content, not measured generation progress. Log actual delays and keep stop local.
10. **Respect interpretation limits.** Attributions of attention or personality do not prove understanding, emotion, or relationship development.
11. **Keep accessibility functional.** Keyboard access, plain presentation, stable facts, reduced motion, and dismissal remain effective. State which modalities/populations were actually studied.
12. **Preserve research governance.** Institutional approval and participant consent are separate from owner acceptance of a prototype. No study outcome is implied by either.

---

# 9. Milestone Roadmap

| Milestone | Approximate period | Required outcome | Evidence type |
| --- | --- | --- | --- |
| M0 — Protocol and feasibility | Weeks 1–2 | Renderer choice, scope, schemas, first valid revision | Technical and planning |
| M1 — Authored encounter | Weeks 3–4 | Paris episode, working interventions, condition variants | Technical and design |
| M2 — Runtime composition | Weeks 5–7 | Model proposals and patches; second scenario | Technical |
| M3 — Benchmark readiness | Weeks 8–9 | E0/E1 results and frozen human-study build | Technical, H1 |
| M4 — Contingent expression | Weeks 10–12 | E2 findings or clearly identified untested protocol | Human, H2 |
| M5 — Continuity and evidence | Weeks 13–15 | E3/E5 findings and design consequences | Human, H3/H5 |
| M6 — Transfer | Weeks 16–18 | Locked E4 and integrated live-system report | Technical, H4 |
| M7 — Research synthesis | Weeks 19–20 | Reproducible artifact, report, and demonstrations | Integrated |

Owner review applies to the tested revision at each implementation phase. Research approval, recruitment, provider availability, and unresolved technical issues can extend the schedule. The R&D timeline does not replace the repository's separate S0–S4 acceptance history or full-product milestones.

---

# 10. Minimum Viable Research Milestone

Before the full program, complete a bounded 4–6-week proof of concept, depending on asset readiness and review time.

## MVP Target

1. One curated Paris source packet with clearly labelled interpretation.
2. One authored eye-to-composition episode using the current approved visual direction.
3. Five working interventions: focus/select, preserve/lock, revise emphasis, inspect sources, and undo/simplify.
4. Two matched versions: contingent expression and generic authored motion.
5. A plain presentation and reduced-motion behavior.
6. Stable entity identity, interruption, stale-result rejection, and replay logs.
7. A small model-composition spike on unfamiliar supported combinations.
8. A second contrasting fixture to expose Paris-specific assumptions.
9. A technical audit and approved formative pilot if participant work is available.

## MVP Success Criteria

- All five interventions have reproducible expected outcomes and visible checks.
- Both main conditions implement the same requested changes and preserve the same locks.
- The provenance distinction is accessible without leaving the episode.
- Cancellation prevents superseded visual/audio work from returning in the tested cases.
- A reviewer can trace an intervention to its patch and visible result.
- The model spike is reported separately from the authored demonstration.
- The pilot, if conducted, identifies whether the manipulation is legible and the tasks are usable.

This MVP demonstrates an experimental instrument. It does not establish H2, cross-domain generality, a personal relationship, or arbitrary environment generation.

---

# 11. Immediate Implementation Sprint

The following is the proposed first seven working days after implementation scope is accepted. It is a work sequence, not authorization to run paid generation or start participant recruitment.

| Day | Work | Reviewable output |
| --- | --- | --- |
| 1 | Audit actual Week 4 paths, choose one preserved baseline, map claims to evidence | Capability matrix and bounded scope |
| 2 | Define entities, sources, locks, patch preconditions, and event records | Minimal schemas and example episode |
| 3 | Implement/verify state revision, undo, stale-result rejection, and lock handling | Focused tests and replay trace |
| 4 | Prepare and inspect the required current visual reference packet; implement one local revision through the selected renderer | Before/after capture and actual transition recording |
| 5 | Add source inspection and accessible stop/plain/reduced-motion paths | End-to-end authored fixture |
| 6 | Produce contingent and matched-motion variants using the same functional engine | Condition audit and timing comparison |
| 7 | Run the first unfamiliar-request composition spike, review failures, and prepare the next bounded demo | Feasibility report and next-phase decision packet |

If visual preparation or generation access is delayed, continue contracts, source records, and non-UI verification. Do not fabricate reference outputs or treat a written storyboard as inspected motion evidence.

---

# 12. Definition of Success

Report three success levels separately. A complete research project may produce negative or inconclusive hypotheses if its methods and limitations remain clear.

## Level 1 — Reliable Composition and Revision

EVA can produce or select declared compositions, apply supported interventions correctly, preserve relevant state, expose provenance, and stop reliably on the declared platform.

**Provisional engineering targets for pilot calibration:**

| Measure | Proposed target | Interpretation |
| --- | --- | --- |
| Critical invariants | All enumerated lock, cancellation, stale-result, and source-reference tests pass | Finite release checks; no universal guarantee |
| Supported semantic success | At least 90% of scheduled benchmark attempts meet the full case rubric | Freeze after development calibration and before held-out testing |
| Source integrity | All cited IDs resolve; no known unsupported factual claim survives the release fixture audit | Reference validity and semantic support are checked separately |
| Local control response | p95 visible acknowledgement/stop within 100 ms on the declared test device | Engineering target, not a measured current capability |
| Rendering | p95 frame time at or below 33.3 ms in the declared scene budget | Report device, viewport, renderer, and measurement method |
| Remote composition | Measure p50/p95 request-to-valid-result latency and cost; choose a usable ceiling in Phase 0 | Do not hide model delay inside construction animation |

These targets can be revised on development evidence with reasons, then locked. Do not relax them after inspecting the final test results. In Phase 0, define the minimum meaningful G–R advantage for H1, the primary endpoints and smallest worthwhile gains for H2/H3, the minimum usable performance and maximum tolerated degradation for each transfer family in H4, and the acceptable loss margin for H5 if formal noninferiority is pursued. Justify these decisions from task requirements and development evidence, not final results. H1 support additionally requires the prespecified advantage over the credible recipe baseline; meeting an absolute threshold alone does not establish that comparison.

## Level 2 — Evidence About Human Interaction

The controlled study establishes the size, uncertainty, and interpretation of the contingent-expression effect. Follow-ups characterize continuity and factual clarity.

**Positive H2 support requires:** a prespecified meaningful improvement in responsiveness, corroborating accounts tied to real interventions, and acceptable comprehension/control outcomes. H3 and H5 require their own analyses. A small formative preference result is not sufficient for a general causal or noninferiority claim.

**Valid negative outcome:** people find the expression decorative, distracting, or no more responsive, leading to a documented narrower grammar or a conclusion that plain presentation works better for the tested cases.

## Level 3 — Transfer and Integrated Creative Application

The frozen system handles held-out supported scenario families and multi-step revisions, and the artistic demonstration makes those capabilities visible. Report the gap between prepared stimuli and live composition, including cost, latency, and failure recovery.

**Success requires:** repeatable evaluated behavior beyond a single hand-prepared Paris example, no hidden per-test recipe authoring, source/interpretation clarity, and a demonstration that includes meaningful correction and inspection.

## Final Research Package

- Versioned prototype with clear launch instructions and capability limits.
- Canonical grammar, schemas, and source-grounding policy.
- Public/synthetic benchmarks, splits, manifests, and analysis scripts.
- Protocols, actual sample/analysis details, aggregate findings, and negative cases.
- Claim-to-evidence table covering H1–H5 and untested extensions.
- A short demo showing request, construction, correction, preserved choice, provenance, and dismissal.
- A manuscript or thesis chapter explaining the contribution, prior work, limits, and implications.

The final claim should match the evidence: **EVA contributes a method and evaluated design knowledge for expressive visual responses that people can revise.** Whether that method improves responsiveness, orientation, or understanding is the research result to determine.

---

# 13. Research Basis and Further Reading

These sources motivate the questions and design choices; they do not establish EVA's hypotheses.

- **Eric Horvitz (1999), Principles of Mixed-Initiative User Interfaces.** The coupling of automated services and direct manipulation motivates preserving explicit user intervention alongside generated proposals. Publication summary checked for this plan; consult the full paper before deriving detailed design rules. [Microsoft Research](https://www.microsoft.com/en-us/research/publication/principles-mixed-initiative-user-interfaces/).
- **Anna Vallgårda, Morten Winther, Nina Mørch, and Edit E. Vizer (2015), Temporal Form in Interaction Design.** Its design experiment and treatment of temporal form motivate treating transition behavior as a design variable. Full-text sections consulted; it does not establish an EVA effect size or validate the proposed rating items. [Journal article](https://www.ijdesign.org/index.php/IJDesign/article/view/2212/710).
- **Priyan Vaithilingam, Elena L. Glassman, Jeevana Priya Inala, and Chenglong Wang (2024), DynaVis: Dynamically Synthesized UI Widgets for Visualization Editing.** Its combination of natural-language edits and persistent synthesized controls is relevant prior work for continued user revision. Abstract checked; its visualization-editing results are not evidence about EVA's expressive scenes. [Author preprint](https://arxiv.org/abs/2401.10880).
- **Repository research foundation:** [Expressive response synthesis](EXPRESSIVE_RESPONSE_SYNTHESIS.md), [predecessor transfer audit](MEMORY_ARCHIVE_TRANSFER.md), [artistic precedents](ARTISTIC_PRECEDENTS.md), and [independent-study proposal](GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md). Preserve their source-reading limits. In particular, affective-loop and social-attribution literature motivate questions about interpretation rather than claims that interface behavior demonstrates emotion.

Before locking the participant protocol, extend the primary-source review for continuity/object correspondence, generative-interface evaluation, appropriate measurement instruments, and sampling/analysis choices. Distinguish full-method reading from abstract access in the evidence register.
