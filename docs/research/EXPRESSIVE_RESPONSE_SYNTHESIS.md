# From a character's body to an interface's behavior

Research revision: 2026-09-17. Status: source-backed design proposal; no new implementation or participant results. Read with the [mechanism audit](MEMORY_ARCHIVE_TRANSFER.md), [artistic precedents](ARTISTIC_PRECEDENTS.md), [study proposal](GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md), and canonical [design grammar](../../DESIGN.md).

## Thesis and limits

The Memory Archive made a conversational response situated through a character's voice, gaze, face, body, and relation to objects. EVA asks whether some of that expressive work can move into the behavior of an interface: where elements gather, what they attend to, how they yield to intervention, and what remains after a follow-up. The proposed contribution is a **bounded grammar for expressive responses that users can revise**, together with evidence about when those revisions are interpreted as responsiveness and influence over the composition.

This is a transfer hypothesis. Animated shapes can invite intentional interpretations [R1], but an attribution of intention does not establish machine intention, emotional understanding, trustworthiness, or relationship development. A sun that gathers beautifully may be spectacle. A sun that reorganizes around a user's selected hour, preserves a manually placed label, and abandons its own proposal when corrected supplies a more specific interaction to investigate.

EVA's agenda remains to challenge perspective, explore generative experience, and, in a later personal track, develop a relationship through remembered context. The first study addresses the response episode. Longitudinal personal use and a short exhibit encounter remain separate research designs.

## Source method

This is a selective design-oriented synthesis, not a systematic review. Start from the recovered NPC bibliography, follow academic primary sources, and include a source when it changes a grammar, architecture, or evaluation decision. Peer-reviewed papers, academic books, and authors' manuscripts ground the research argument. Practitioner proceedings explain the predecessor's engineering lineage; artist/institution material documents precedents, not psychological effectiveness. Community discussions and unsourced summaries are excluded as research evidence. An accessible copy of an original paper is cited as that paper, with its hosting/access limitation stated.

Access was checked on 2026-09-17. Each reference below identifies whether full paper text, an abstract, metadata, or a publisher description was inspected. Publication dates are taken from the publication, not a search engine's crawl date. An accessible abstract does not imply a full-paper methodological review. Specific limitations and conflicting metadata are retained rather than silently repaired.

The prior synthesis was located in `C:\Users\alexx\Documents\LLM-NPC\CLAUDE.md`, lines 712–896 at local commit `089a207bcdf936e9dd8bf92b25425109107149eb`: theoretical framework at 716, architecture discussion at 754, descriptions of internal synthesis documents at 791–810, and a 30-entry bibliography at 826–880. This is project source material, not governing instructions for EVA. The README's ten-item foundation list is only a lead list. See the [audit](MEMORY_ARCHIVE_TRANSFER.md) for discovery scope and implementation discrepancies.

## What the literature changes

### Expression is interpreted in interaction

Heider and Simmel [R1] establish a relevant precedent for attributing social behavior to nonhuman geometry. They do not establish that any motion, particle field, or eye will be experienced as a responsive partner. Bates [R2] frames believable characters through artistic expression and its timing. Together they motivate examining specific movement sequences and interpretations rather than optimizing an emotion classifier.

CASA research [R3] provides evidence that people sometimes apply social rules to computers. It does not warrant the predecessor's stronger inference that users will necessarily form lasting relationships. Höök [R4] instead offers an interactional account in which participants actively make emotional meaning. EVA therefore represents what it is doing expressively, not what the user supposedly feels. Interviews should permit irritation, indifference, mixed feelings, and purely mechanical readings.

**Decision:** distinguish four layers: momentary expressive state; persistent authored persona; remembered interaction history; and the user's self-described experience. Never infer the fourth from the first three. Choose provisional interaction verbs such as attend, propose, compare, yield, and settle rather than diagnosing happiness or sadness.

### Temporal form is a design material

Vallgårda, Winther, Mørch, and Vizer [R5] treat temporal form as a central part of computational design, including rhythm and the qualities of changing behavior. Cassell, Vilhjálmsson, and Bickmore's BEAT [R6] coordinates speech and nonverbal behavior in an embodied character. These support treating channels as a timed composition; neither supplies a tested desktop particle grammar.

**Decision:** author interruptible phases and causal cues. A selected datum can become an anchor, surrounding motion can give it space, and a follow-up can transform the current arrangement. Distinguish system waiting from expressive pacing; do not hide ready facts behind a theatrical loading sequence. Silence is a user-controlled absence of speech, not evidence of agreement or satisfaction.

### Affect models are options, not ground truth

Plutchik's psychoevolutionary theory [R7] and PAD research [R8] supply different conceptualizations of emotion. The verified PAD abstract concerns human verbal reports; it does not validate numerical mappings from model labels to particles, colors, or user emotions. The NPC code's canonical PAD vectors, transition costs, and linear decay are engineering choices. A decay constant is not an empirical emotional law.

**Decision:** begin with a small expressive state and explicit continuity rules. Plutchik/PAD remain an investigatory alternative if a simpler model cannot produce the desired range or continuity. A later comparison would hold the rendered vocabulary and scenarios constant and test interpretation, abrupt transitions, authoring burden, and failure cases. Do not claim the simpler model is psychologically superior; it is the more inspectable first experiment.

### Situatedness requires explicit interaction semantics

Smart Objects encode interaction information with objects [R9]. Peters and colleagues [R10] extend that approach to attentional behavior. SUPPLE [R11] treats interface rendition as constrained optimization for devices and usage. These provide useful precedents for binding representation to its subject and affordances; they do not make a context label into consent or guarantee environmental congruence.

Horvitz [R12] motivates coupling automation with direct manipulation and correction. Hu and colleagues [R13] organize vision-based multimodal interface design; the existence of a multimodal taxonomy is not a reason to add a camera or physiological inference.

**Decision:** distinguish mention, selection, manipulation, comparison, and explicit reinterpretation. Selection changes focus locally; it is not a request to upload an object or create memory. A weather contour is bound to dated weather records; a transit interval is bound to an arrival estimate. Subject-specific behavior must remain distinguishable from a quantitative chart or simulation.

### Fictional framing does not suspend everyday obligations

Stenros [R14] separates personal playfulness, social agreement, and the arena of play. Consalvo [R15] challenges a rigid separation of games from ordinary context. This complicates the NPC notebook's equation of a system prompt with a hard magic-circle boundary. A prompt can propose a fictional frame; it cannot enforce security or ensure a shared understanding of that frame.

Dunne and Raby [R16] position speculation as a way to raise questions and explore alternatives. For EVA, the speculative object can be **how an answer is encountered**. The temperature, station, direction, estimate, and uncertainty still have ordinary factual obligations. An exhibit may make fiction explicit, but cannot treat a generated witness's statement as a real person's consent.

**Decision:** challenge the framing of the request without withholding the answer. After showing two arrival estimates, EVA may offer a comparison of waiting intervals. The user can refuse that proposal and keep the plain answer. No trust score, rapport ritual, or emotional performance unlocks public facts.

### Planning systems explain control, not emotion

Orkin's F.E.A.R. account [R17] and Isla's Halo 2 paper [R18] document ways to organize game behavior. Riedl and Young [R19] address narrative planning and character intentionality. These are different problems and architectures, not a linear progression that inevitably ends in a blackboard plus LLM.

**Decision:** use a deterministic event/state controller for the first response grammar. Retain cancellation, preconditions, and intelligible transitions. Exclude the prior notebook's unsupported complexity formula and its inference that all narrative planning is too expensive for EVA. Do not describe transition-cost lookup as a full GOAP planner, or a blackboard as proof of containment.

### Generative UI already exists; the contribution must be narrower

SUPPLE [R11] predates LLM interfaces. Leviathan and colleagues' generative-UI work [R20] reports preference comparisons for generated interfaces while explicitly setting generation speed aside. This is relevant prior art, but preference over outputs does not answer whether a revisable response feels contingent on a particular intervention.

**Decision:** make no claim to invent generative interfaces, co-design, embodied agents, or expressive motion. Investigate the integration of subject-bound visual/temporal composition, immediate user correction, and factual invariants. Keep model-produced renderer code out of EVA even when another research system generates complete webpages.

### Research through design needs a trace of decisions

Zimmerman, Forlizzi, and Evenson [R21] offer process, invention, relevance, and extensibility as lenses for interaction design research. This supports preserving alternatives, negative cases, and the reasoning that moves from a material experiment to a provisional design claim.

Bickmore and Picard [R22] explicitly address sustained relationships. Their work belongs in EVA's longitudinal track, not as evidence that one impressive encounter has created a relationship.

**Decision:** combine an annotated design trajectory with a small comparative response study. The primary evidence is whether participants can identify how their intervention changed the composition and whether they experienced meaningful influence. Factual comprehension is a guardrail. Emotional interpretation and authorship are qualitative questions, not a mandatory battery of success scores. See the [protocol proposal](GENERATIVE_UI_INDEPENDENT_STUDY_PROPOSAL.md).

## Explicit transfer chain

| Prior concept | Previous prototype mechanism | Proposed EVA interpretation | Research question | Evidence needed |
| --- | --- | --- | --- | --- |
| Believability and multimodal coordination [R2, R6] | Dialogue/emotion parse fans out to voice and character behavior | One validated response score coordinates text, eye, fields, and optional sound | Can coordinated changes be read as one response? | Synchronized event trace plus participant accounts of channel agreement and contradiction |
| Affect as unfolding experience [R4, R5] | Decay, transition rules, return to idle | Bounded expressive state settles while facts and user edits persist | Does continuity support interpretation across a follow-up? | Repeated episodes, abrupt-reset counterexamples, stimulated recall |
| Smart Objects and mixed initiative [R9, R10, R12] | Inspect records context; Present dispatches a turn | Select locally; explicitly invite reinterpretation or comparison | Does the user understand which act changes EVA's proposal? | Event/source mapping, failed expectations, ability to correct the scope |
| CASA and apparent behavior [R1, R3] | Gaze, pauses, speech/body timing | Composition yields and reorients around the active subject | Is this read as response to intervention or generic animation? | Matched-motion comparison; open interpretation before social labels |
| Context-bound affordances [R9–R11, R13] | Narrative fields carried by inspectable items | Weather occlusion and transit intervals use different subject-bound operations | Does subject-specific expression clarify or distract? | Fact questions, domain transfer critique, accounts of misleading mappings |
| Magic-circle critique and speculation [R14–R16] | Fictional archive and witness frame | Optional poetic framing around a stable factual answer | Can perspective shift coexist with clear factual status? | Fiction/reality discrimination, provenance inspection, refusals of reinterpretation |
| Longitudinal relational agents [R22] | Conversation history and trust framing | Reviewable remembered preferences in a separate later track | What, if anything, accumulates beyond repeated novelty? | Multi-session design, retention/forgetting controls, change over time; outside first study |

## Verified references and reading depth

The short interpretations above are limited to the material inspected. Entries labelled abstract/metadata need deeper reading before importing instruments or effect-size claims. No community discussion is used as an academic source.

| ID | Bibliographic record and primary source | Reading depth and use |
| --- | --- | --- |
| R1 | Fritz Heider and Marianne Simmel (1944). *An Experimental Study of Apparent Behavior*. The American Journal of Psychology 57(2), 243–259. [Paper](https://cs.uky.edu/~sgware/reading/papers/heider1944experimental.pdf), [DOI](https://doi.org/10.2307/1416950). | Original paper available through university copy; movement/attribution precedent, not a validation of EVA. |
| R2 | Joseph Bates (1994). *The Role of Emotion in Believable Agents*. Communications of the ACM 37(7), 122–125. [Author manuscript, CMU-CS-94-136](https://acordo.net/acordo/wp-content/uploads/2020/08/Role-of-Emotion-in-Believable-AgentsBATES.pdf). | Original manuscript abstract inspected through an accessible copy; an artistic/research argument, not a controlled desktop trial. |
| R3 | Clifford Nass and Youngme Moon (2000). *Machines and Mindlessness: Social Responses to Computers*. Journal of Social Issues 56(1), 81–103. [Publisher](https://doi.org/10.1111/0022-4537.00153), [paper](https://www.coli.uni-saarland.de/courses/agentinteraction/contents/papers/Nass00.pdf). | Publisher abstract and original paper record; social-rule application, not inevitable attachment. Online posting date differs from issue year. |
| R4 | Kristina Höök (2009). *Affective loop experiences: designing for interactional embodiment*. Philosophical Transactions of the Royal Society B 364, 3585–3595. [Full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC2781899/), [DOI](https://doi.org/10.1098/rstb.2009.0202). | Full article text consulted selectively; meaning made through interaction. Distinct from her 2008 PERSUASIVE keynote paper. |
| R5 | Anna Vallgårda, Morten Winther, Nina Mørch, and Edit E. Vizer (2015). *Temporal Form in Interaction Design*. International Journal of Design 9(3), 1–15. [Journal full text](https://www.ijdesign.org/index.php/IJDesign/article/view/2212/710). | Full article available; temporal form and expressive qualities inform phase/rhythm alternatives. |
| R6 | Justine Cassell, Hannes Högni Vilhjálmsson, and Timothy Bickmore (2001). *BEAT: the Behavior Expression Animation Toolkit*. SIGGRAPH. [Author manuscript](https://www.media.mit.edu/gnl/publications/siggraph2001.pdf), [author bibliography](https://www.media.mit.edu/gnl/publications.html). | Original manuscript abstract and metadata; coordination precedent, not a ready-made interface grammar. |
| R7 | Robert Plutchik (1980). *A General Psychoevolutionary Theory of Emotion*. In *Emotion: Theory, Research, and Experience*, vol. 1, *Theories of Emotion*, 3–33. Academic Press. [Publisher](https://doi.org/10.1016/B978-0-12-558701-3.50007-7). | Publisher-indexed metadata verified; full chapter inaccessible here. No endorsement of canonical color or PAD conversions. |
| R8 | James A. Russell and Albert Mehrabian (1977). *Evidence for a three-factor theory of emotions*. Journal of Research in Personality 11(3), 273–294. [Publisher/abstract](https://doi.org/10.1016/0092-6566(77)90037-X). | Indexed publisher abstract; human verbal-report studies. Full publisher fetch blocked; no detailed methodological claim imported. |
| R9 | Marcelo Kallmann and Daniel Thalmann (1998). *Modeling Objects for Interaction Tasks*. In *Computer Animation and Simulation '98*. [DOI](https://doi.org/10.1007/978-3-7091-6375-7_6), [author paper copy](https://www.researchgate.net/publication/2640374_Modeling_Objects_for_Interaction_Tasks). | Original paper text accessible in copy; object-carried interaction features. This is a paper, not ResearchGate commentary. |
| R10 | Christopher Peters, Simon Dobbyn, Brian Mac Namee, and Carol O'Sullivan (2003). *Smart Objects for Attentive Agents*. WSCG 2003. [Proceedings paper](https://wscg.zcu.cz/wscg2003/Papers_2003/D05.pdf), [lab record](https://gv2.scss.tcd.ie/bibtexbrowser.php?bib=gv-2024.bib&key=DBLP%3Aconf-wscg-PetersDMO03). | Original abstract and lab bibliography; object-associated gaze/interaction information. |
| R11 | Krzysztof Gajos and Daniel S. Weld (2004). *SUPPLE: Automatically Generating User Interfaces*. IUI, 93–100. [Author publication page](https://www.eecs.harvard.edu/~kgajos/papers/2004/gajos04supple.shtml). | Author abstract and bibliography; constrained adaptation, not expressive-intention evaluation. |
| R12 | Eric Horvitz (1999). *Principles of Mixed-Initiative User Interfaces*. CHI. [Author paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz.pdf), [DOI](https://doi.org/10.1145/302979.303030). | Original paper; correction and direct invocation/termination inform user control. |
| R13 | Yongquan 'Owen' Hu, Jingyu Tang, Xinya Gong, Zhongyi Zhou, Shuning Zhang, Don Samitha Elvitigala, Florian 'Floyd' Mueller, Wen Hu, and Aaron J. Quigley (2025). *Vision-Based Multimodal Interfaces: A Survey and Taxonomy for Enhanced Context-Aware System Design*. CHI 2025. [Author preprint](https://arxiv.org/abs/2501.13443), [DOI](https://doi.org/10.1145/3706598.3714161). | Abstract and publication metadata; modality/context design lead, not validation of facial emotion inference. |
| R14 | Jaakko Stenros (2012). *In Defence of a Magic Circle: The Social and Mental Boundaries of Play*. Nordic DiGRA. [Proceedings and paper](https://dl.digra.org/index.php/dl/article/view/605). | Original paper's abstract/introduction; distinguishes playfulness, social contract, and arena. The expanded journal title adds “Cultural” and is a different version. |
| R15 | Mia Consalvo (2009). *There is No Magic Circle*. Games and Culture 4(4), 408–417. [Publisher](https://doi.org/10.1177/1555412009343575). | Publisher abstract and record; critique of treating play as isolated from everyday context. |
| R16 | Anthony Dunne and Fiona Raby (2013). *Speculative Everything: Design, Fiction, and Social Dreaming*. MIT Press. [Publisher](https://mitpress.mit.edu/9780262019842/speculative-everything/). | Bibliography and publisher description verified; no claim to have reread the entire book. Supports questioning, not measured effectiveness. |
| R17 | Jeff Orkin (2006). *Three States and a Plan: The A.I. of F.E.A.R.* GDC. [Author paper copy](https://www.gamedevs.org/uploads/three-states-plan-ai-of-fear.pdf), [official proceedings record](https://www.gdcvault.com/play/1013459/contactUs). | Original practitioner paper; implementation lineage, not peer-reviewed emotion theory. |
| R18 | Damian Isla (2005). *Handling Complexity in the Halo 2 AI*. GDC. [Author's proceedings text](https://www.gamedeveloper.com/programming/gdc-2005-proceeding-handling-complexity-in-the-i-halo-2-i-ai). | Primary practitioner account, not community discussion. Correct author given name is Damian. Used only for architecture lineage. |
| R19 | Mark O. Riedl and R. Michael Young (2010). *Narrative Planning: Balancing Plot and Character*. JAIR 39, 217–268. [Author paper](https://faculty.cc.gatech.edu/~riedl/pubs/jair.pdf), [2014 preprint posting](https://arxiv.org/abs/1401.3841), [DOI](https://doi.org/10.1613/jair.2989). | Original paper text and abstract; 2014 is not a separate journal publication. No complexity bound transferred to EVA. |
| R20 | Yaniv Leviathan et al. *Generative UI: LLMs are Effective UI Generators*. [Author preprint](https://arxiv.org/abs/2604.09577), [project](https://generativeui.github.io/). | Preprint abstract and project method/results inspected. Project BibTeX says 2025; the arXiv record retrieved says 2026. Google's [announcement](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/) is dated 2025-11-18. The NPC's “2024” is unsupported. Cite the version/URL and retain this discrepancy; peer review not established. |
| R21 | John Zimmerman, Jodi Forlizzi, and Shelley Evenson (2007). *Research Through Design as a Method for Interaction Design Research in HCI*. CHI, 493–502. [Original paper](https://courses.ischool.berkeley.edu/i262/s13/readings_pdf/Zimmerman_Research_Through_Design_as_a_Method_for_IaD_in_HCI_0.pdf), [DOI](https://doi.org/10.1145/1240624.1240704). | Paper text consulted selectively; informs documentation and evaluation of the design contribution. |
| R22 | Timothy Bickmore and Rosalind W. Picard (2005). *Establishing and Maintaining Long-Term Human-Computer Relationships*. ACM TOCHI 12(2), 293–327. [Author bibliography](https://www2.ccs.neu.edu/research/hci/publications/publications_tb.html), [DOI](https://doi.org/10.1145/1067860.1067867). | Author bibliography and paper abstract; publisher/linked PDF access blocked here. Supports a separate longitudinal question; no effect-size or clinical claim imported. |

## Bibliographic corrections and excluded inferences

- The prior notebook's *Rules of Play* 2003/2004 ambiguity can be recorded as an edition issue: MIT Press lists the linked edition's publication as 2003-09-25. [Publisher](https://mitpress.mit.edu/9780262240451/rules-of-play/). It is background, not evidence that prompts enforce a play boundary.
- Huizinga's *Homo Ludens* (original 1938), Caillois's *Les jeux et les hommes* (1958; English *Man, Play and Games*, 1961), and Castronova's *Synthetic Worlds* (2005) remain historical leads through the recovered bibliography and Stenros. These books were not independently reread in this pass; edition-specific quotations and the “porous membrane” attribution need source-page verification before use. EVA relies on R14/R15 for the present boundary argument.
- *The Behavior Tree Starter Kit* is by Alex J. Champandard and Philip Dunstan in **Game AI Pro (2013)**; the associated starter code is labelled 2012. [Book site](https://www.gameaipro.com/), [chapter](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter06_The_Behavior_Tree_Starter_Kit.pdf). Do not confuse code year with book year.
- Van der Woerdt (2012), the notebook's Sundar (2012) attribution, Roberts's particular reactive-behavior-tree chapter, and cross-domain fabrication/robotics analogies were not sufficiently verified to carry a current research claim. Preserve them as leads, not an academic foundation for emotion, consent, or safety.
- “System prompt = magic circle,” “blackboard = verifiable safety,” “GOAP cost = emotional psychology,” “Smart Objects prevent hallucination,” and “CASA proves relationship formation” are interpretations in project notes, not established findings of the cited sources.

## Remaining evidence work

Recover the two named original internal documents if available; verify edition-specific historical passages; read full methods before selecting any published instrument; obtain lawful access to artist motion references if exact temporal analysis becomes important. None blocks this documentation revision. The first bounded experiment is specified in [E1](../design/experiments/E1_REVISABLE_WEATHER.md); it has no implementation authorization or acceptance yet.
