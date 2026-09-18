# Independent Study Proposal: Expressive Responses as Revisable Encounters

- **Student:** [Student name]
- **Faculty supervisor:** Professor José Sánchez
- **Research context:** Game Assemblies Lab
- **Term:** Fall 2026. The earlier proposal named mid-December; the present reframe supplies no new deadline or approved schedule.
- **Status:** Research and design proposal revised 2026-09-17; implementation, study protocol, and phase acceptance remain pending.
- **Testbed:** EVA's existing Tauri/React/Rust desktop foundation; [Week 1](../../week1/README.md) remains an intact, successfully demonstrated archive.

## Thesis and continuity

EVA investigates the **response**, rather than the dashboard, as an object of generative interaction design. An ordinary request can be answered through readable information and a composition of movement, spatial relationships, imagery, typography, rhythm, language, sound, and silence. The composition should propose an interpretation, attend to a user's intervention, yield, and reconsider. Collaboration must be observable in behavior; announcing empathy or playing a fixed animation is insufficient.

The Memory Archive situated generated speech within a character's gaze, voice, emotional state, body, and object encounters. EVA asks what changes when some of that expressive work moves from a character's body into the behavior of an interface. This is a research hypothesis, not an established equivalence. Social interpretation does not prove understanding, feeling, or a relationship. The [literature synthesis](EXPRESSIVE_RESPONSE_SYNTHESIS.md) and [code-grounded transfer study](MEMORY_ARCHIVE_TRANSFER.md) distinguish those claims.

The owner's broader agenda is to challenge perspective, explore generative experience, and eventually develop a personal relationship through remembered context. The first study isolates an immediate encounter. A later personal-agent study would require repeated use and inspectable persistent memory; an exhibit could instead offer a short self-contained encounter without personal retention. Neither is required for the first contribution.

## Candidate questions and recommendation

| Candidate | Contribution | Main difficulty | Decision |
| --- | --- | --- | --- |
| How do visual and temporal responses to user intervention shape perceived responsiveness and influence in an ordinary information request? | An actionable grammar of attending, yielding, and revising, with evidence tied to specific events | Separate contingency from spectacle and functional differences | **Recommend first** |
| How do subject-specific visual materials change emotional interpretation of weather and transit information? | Knowledge about congruence between information and expressive material | Domain, familiarity, aesthetics, and factual complexity vary together | Transit transfer critique first; study later |
| How does remembered expressive history shape a personal relationship with an agent? | Longitudinal continuity and relationship design | Repeated use, memory governance, and a different study duration | Defer to personal-agent track |
| How can a brief mediated encounter challenge a visitor's perspective on ordinary information? | An exhibit format and situated interpretation | Venue, audience, staging, and novelty dominate | Separate later exhibit adaptation |

**Recommended research question:** How does a composition's contingent visual and temporal response to user intervention shape perceived responsiveness and user influence during an ordinary information request?

**Proposed contribution:** a bounded expressive-response grammar, an inspectable prototype, and a research-through-design account of which revision behaviors people interpret as attending to their intervention—and when they instead experience them as decorative, obstructive, or manipulative. This is narrower than demonstrating emotional intelligence or shared authorship of a whole interface.

## Research basis and resulting design choices

The synthesis gives verified bibliographic records, reading-depth limits, and a concept → predecessor mechanism → EVA interpretation → question → evidence chain. Its consequential commitments are:

- **Attribution is an outcome to examine.** Moving-shape studies and CASA motivate examining people's interpretations, not treating an interface as a person. [Heider and Simmel, 1944](https://doi.org/10.2307/1416950); [Nass and Moon, 2000](https://doi.org/10.1111/0022-4537.00153).
- **Meaning arises in interaction.** Affective-loop work motivates a sequence in which the person can change the expression and reflect on it. It does not justify classifying emotion from a pause or gaze. [Höök, 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2781899/).
- **Time is design material.** Onset, duration, rhythm, interruption, and return matter independently of a screenshot. Record the episode and alternative timings. [Vallgårda et al., 2015](https://www.ijdesign.org/index.php/IJDesign/article/view/2212/710).
- **Initiative must remain negotiable.** A proposal can be redirected or simplified without losing the answer or surrendering control. [Horvitz, 1999](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz.pdf).
- **An artifact is part of the inquiry.** Preserve alternatives, failures, and rationale so the work can be assessed for process, invention, relevance, and extensibility. [Zimmerman, Forlizzi, and Evenson, 2007](https://doi.org/10.1145/1240624.1240704).

Artistic precedents inform compositional decisions; they are not empirical support for user outcomes. See [the precedent analysis](ARTISTIC_PRECEDENTS.md) for Kat Zhang / The Poet Engineer, selected ONX and DAT LAB connections, and the owner's unverified numerical recollection from *Sunshine*. Academic primary sources ground the research; creator documentation supports claims about the works.

## Prototype and scope

Use the [canonical grammar](../../DESIGN.md) and proposed [E1 revisable-weather experiment](../design/experiments/E1_REVISABLE_WEATHER.md). A synthetic NYC weather answer appears as readable facts with a dithered field that can gather, part, and reorganize around selected information. The user can redirect the time window, compare periods, pin a fact, request less motion, reject an interpretation, or choose a plain answer. Follow-ups change the ongoing composition while preserving identity and direct edits.

Weather is the first executable scenario. A clearly synthetic uptown-M transit response is a **design transfer example**, not a second required integration. It explores waiting and anticipated arrival without inventing service or implying live train positions. No production weather/transit account is needed.

The model may compose bounded authored primitives and phase recipes. Data supplies facts; deterministic runtime code supplies provenance and authority; the user controls interventions and presentation limits. Hand-authored scores can establish the foundation first, but must be labeled as such. Claiming model composition later requires actual outputs, validation traces, and behavior beyond selecting a fixed movie. Memory, dialogue orchestration, and rendering remain separate.

## Research-through-design process

1. Translate selected literature and predecessor mechanisms into alternative response sketches. Record why each option was retained, changed, or rejected.
2. Build only the accepted bounded experiment. Compare at least two ways the composition can attend to the same intervention, including an unadorned response. Save scores, seeds, timing, captures, and decision notes.
3. Use owner/faculty critique to identify unreadable facts, ambiguous agency, coerced interaction, and novelty mistaken for responsiveness. This is design critique, not participant-study evidence.
4. Prepare and pilot matched conditions, prompts, logging, and interview materials. Obtain required institutional guidance and approval before recruitment or research data collection.
5. Conduct a small formative study if approved and feasible; revise the grammar using supportive and disconfirming episodes. Report situated findings rather than population-level effects from a small sample.

An initial planning envelope is two formative rounds totaling approximately 6–8 participants, subject to faculty agreement and institutional requirements. This is a feasibility proposal, not a power calculation, recruitment decision, or approved sample. If participant work cannot proceed, deliver the prototype, critique record, and submission-ready protocol; do not substitute informal conversations for an approved study.

## Unit of analysis and comparison

The **response episode** begins with a request and ends when the user settles, simplifies, dismisses, or stops the revised answer. It includes the initial answer, at least one explicit intervention, the transition, and the user's interpretation of what changed. A screenshot alone is not the unit.

| Condition | Shared behavior | Deliberately varied behavior |
| --- | --- | --- |
| Contingent expression | Same facts, reading order, revision functions, controls, input methods, and response availability | Expressive material attends to the chosen entity, yields around a lock, and reorganizes in response to the intervention |
| Matched authored motion | Same functional revision and factual updates; controls remain effective | A prescribed field sequence provides comparable motion and material without coordinated expressive accommodation |
| Plain answer | Same facts and usable revision controls | Optional reference for comprehension, comfort, and accessibility; not a bundled social-personality manipulation |

The comparison is a proposed research instrument, not desired shipping behavior. Stop, reduced motion, and direct manipulation work in every condition. Do not fake a broken control. Match duration, density, palette, and broad motion energy as closely as feasible; exact trajectories cannot be identical when contingency is the manipulation. Document this residual difference.

Start with voice and sound off, identical eye behavior, neutral equivalent wording, and no personal-history references. Avoid bundling personality, sarcasm, memory, voice acting, and timing into one unexplained effect. Later multimodal work can vary one coordinated channel at a time.

## Evidence and interpretation

| Role | Evidence | Interpretation limit |
| --- | --- | --- |
| Primary: perceived responsiveness | Brief episode-level ratings and accounts of the exact intervention and observed response | Researcher-authored items are not a validated scale; show items and distributions, not a diagnostic score |
| Explanatory: user influence | Whether a requested change survives, where control is attributed, rejection/revision traces, interview explanations | Executing a built-in command alone is not proof of co-authorship |
| Guardrail: comprehension | Correct reading of temperature/time/units/source; recognition of synthetic and missing data | An attractive response that obscures facts fails |
| Exploratory: emotional interpretation and authorship | Participant language about invitation, anticipation, irritation, agency, ownership, or indifference | Do not require emotion, presume positive affect, or infer a relationship |

Suggested prompts: “What changed because of your action?”, “What did you feel you could influence?”, and “Was anything expressive or distracting? Point to the moment.” Ask open accounts before supplying agentic labels. Record negative and non-social interpretations.

Use equivalent weather variants rather than one memorized answer. A possible session has six short episodes, three per main condition, with task and condition order counterbalanced and a plain-answer reference. Finalize duration and fatigue after the pilot. Within-session repeated exposure can reveal novelty decay; it cannot establish a longitudinal relationship.

- **Novelty and spectacle:** share visual vocabulary, repeat exposure, ask about novelty separately, and keep plain answer available.
- **Latency:** expose facts at the same time; replay or precompute expressive proposals; log actual delays. A slower model must not be confounded with thoughtfulness.
- **Information and function:** use identical evidence, uncertainty, wording, controls, and successful factual revisions. Only coordinated expressive behavior varies.
- **Experimenter suggestion:** do not describe one condition as empathetic or collaborative; analyze concrete accounts before inferred constructs.
- **Learning and taste:** counterbalance order and tasks; preserve participant preferences and within-person disagreements.

Analyze event traces alongside recordings and interview excerpts using a documented coding process and discrepant cases. Report the actual number of coders and procedure; do not claim independent coding without it. Summarize descriptive ratings and comprehension failures. Later hypothesis tests need separately justified sampling and analysis.

## Authority, privacy, and accessibility

Facts never depend on emotional rapport. Fictional witness/consent framing does not authorize disclosure, data collection, or real actions. No camera, facial emotion classifier, speaker identification, or incidental-screen inference is required. Silence means no new instruction.

Use synthetic fixtures and session-only context first. Approved research recordings and identifiers belong in institutionally approved private storage, not the public repository. Public evidence contains only synthetic data. Persistent personal memory is a later opt-in, inspectable mechanism with separate retention/deletion decisions.

Keep model output declarative and bounded, safety/provenance host-owned, factual speech verified, and interruption propagated. Provide keyboard equivalents, stable reading surfaces, explicit units and missingness, reduced motion, intensity control, and plain answer. Social expression must never resist dismissal or pressure acceptance.

## Delivery phases and assessment

The proposed S0–S4 sequence in [PLANNING.md Section 17](../../PLANNING.md#17-milestones) is a dependency order, not a new deadline. Week 1 success does not accept these phases. Each needs explicit owner review of its actual revision; institutional approval is separate.

The existing ComfyUI decision remains an **earliest-use gate**: no installation before explicit S2 acceptance, and only a separately authorized S3 experiment. Generated imagery is unnecessary for the first response study. Redefining scope does not authorize early installation.

Deliver the annotated synthesis and transfer study, this protocol proposal, **DESIGN.md** as the one canonical grammar, an inspectable response prototype/schema, design iterations and evidence, approved study materials/results if feasible, and a critical manuscript/demo. No duplicate `GENERATIVE_UI_DESIGN.md` will be created. Conference submission and acceptance remain separate decisions.

Suggested assessment weights, for faculty discussion: research foundation 20%; grammar/rationale 25%; prototype/iteration evidence 25%; evaluation design/approved study and analysis 20%; critical reflection/presentation 10%. These replace the two-dashboard deliverable as a proposal, not an approved grading change.

## Boundaries and open decisions

The owner supplied the expressive-response direction. The focused question, grammar, comparison, sample envelope, and experiment are recommendations for review. Decisions remain about preferred attending behavior after executable alternatives exist, faculty agreement on constructs/protocol, and whether a later extension prioritizes personal continuity or an exhibit. These do not block documentation work.

Full backend completion, production accounts, consequential actions, Live2D/Unreal, camera input, and GPU/model installation are outside this phase. The [decision log](DIRECTION_DECISIONS.md) records the change from the dashboard proposal, whose exact text remains [archived](history/2026-09-17-before-reframe/README.md).
