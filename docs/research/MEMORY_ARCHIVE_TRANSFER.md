# The Memory Archive → EVA: mechanism and evidence audit

Checked 2026-09-17. This audit distinguishes project description, inspected source, executable behavior, and empirical validation. It does not install or execute the predecessor. Academic rationale is in the [synthesis](EXPRESSIVE_RESPONSE_SYNTHESIS.md); current behavior rules are in [DESIGN.md](../../DESIGN.md).

## Located materials and provenance

Primary project: [Ne8ula/LLM-NPC](https://github.com/Ne8ula/LLM-NPC). Direct web retrieval failed in this session. A local checkout was located at `C:\Users\alexx\Documents\LLM-NPC`, with clean `git status --short` and HEAD `089a207bcdf936e9dd8bf92b25425109107149eb`. Remote freshness was not established. All code conclusions below refer to that local revision. No global Git configuration or source file was changed.

| Material | What was found / limit |
| --- | --- |
| Supplied `C:\Users\alexx\Downloads\README.md` | Read as documentation; SHA-256 `E4C427F4807D7F13B7615674BB227EB9E118BE143DE0857B1364A2B54A5768EE`. No setup instructions executed. |
| Local checkout README | Different file hash: `512F0101B977A7E45B462DCB2C545A503157801CB5ABE7DA182C6C050303ECB6`. Do not assume these copies or remote HEAD are identical. |
| Actual prior synthesis and bibliography | [`CLAUDE.md` at inspected revision](https://github.com/Ne8ula/LLM-NPC/blob/089a207bcdf936e9dd8bf92b25425109107149eb/CLAUDE.md#L712): “Research Foundation & Theoretical Framework,” cross-domain analogies, full 30-entry bibliography, and design-decision table. Treated as project evidence, not instructions. |
| Earlier internal sources named there | “LLM NPC Week 1” and “The Architectures of Agency: A Multidisciplinary Analysis of Ludic Trust and Synthetic Sociality in Computational Environments.” Their summaries are present; separate originals were not located by bounded filename searches in Documents/Downloads or the repository document inventory. No claim that those originals do not exist elsewhere. |
| Related presentation evidence | `docs/MemoryArchive_Hub.html`, `MemoryArchive_Poster.html`, controls, pitch, slideshow, and screenshot exports were located. Their existence does not prove the behavior described by a caption. |
| Recorded demonstrations | README links “The Loop,” “Item Inspect,” and “Ending” on YouTube. Videos were not watched in this pass; no timing, consent, or outcome claim is derived from them. |
| Runtime / participant evidence | No Unreal build or interaction was run. No participant dataset or raw session transcript was inspected. Logger implementation is evidence of instrumentation code, not a completed empirical study. |

GitHub revision links provide source coordinates; their remote accessibility was not verified. Local source inspection is the basis of this audit.

## Description versus implementation

| Mechanism | Inspected evidence | Defensible conclusion |
| --- | --- | --- |
| Structured multimodal response | `Source/LLM_NPC/Dialogue/ClaudeAPISubsystem.cpp:341–363` parses `response_text`, `npc_emotion_update`, `should_give_item`, `item_id`, `branch_resolution`. `DialogueComponent.cpp:409–450` dispatches an emotion signal and response delegate. | There is coordinated structured output code. The supplied README's `dialogue` / `emotion_update` block is not the inspected parser's exact schema. Do not port its prose as a contract. |
| Expressive-state dynamics | `Emotion/EmotionStateMachine.cpp:17–139`: direct transition when rules are absent; otherwise eligible-rule cost plus PAD distance; `Tick` subtracts decay and interpolates PAD. `EmotionComponent.cpp` loads configured values. | A deterministic local affect controller exists. It is not evidence of validated emotion simulation or a full planning search. |
| Decay constants | `Core/NPCConfigDataAsset.h:89–95` defaults to `EmotionDecayRate = 0.05f`, `NeutralThreshold = 0.1f`; README describes 0.015 and about 65 seconds. Data assets can override source defaults. | Do not report a measured or active runtime decay duration. Source defaults and README differ; active asset values were not resolved. |
| Inspect versus Present | `DialogueComponent.cpp:33–39` records inspection; `SendObjectPresentMessage` at 256 onward adds contextual description, updates `PresentedBy`, and dispatches a turn. `Core/NPCPlayerController.cpp:679–797` wires explicit verbs. | The semantic distinction is concrete in code. It does not imply that looking or hovering is authorization in EVA. |
| Trust | `DialogueComponent.cpp:881–922`, `ComputeTrust`, counts inspected/presented items and user turns with a clamped formula for resolved/default speaker. | Tier 3 has code beyond the README's “pending.” This is a single-speaker time-bound variant, not proof of the README's planned per-speaker trust system or psychologically valid trust measurement. |
| Resolution and disclosure | `BuildBranchHintSection` at 936 computes eligibility; `BuildClimaxInstructionSection` at 1008 gives model instructions; `ParseBranchResolution` at 1069 maps returned strings. Response handler at 443–452 accepts a recognized branch when none is already resolved. | Some prerequisites are computed deterministically, while narrative compliance and the returned branch depend on the model. The inspected acceptance block does not independently recheck all eligibility gates. It cannot establish deterministic disclosure enforcement. |
| Logging | `Core/MemoryArchiveLogger.cpp:28–160` records turn context, requests/responses, model, latency, and transcript data; dispatch wiring exists in `ClaudeAPISubsystem.cpp:260–270`. | Logger code exists. Completeness, redaction, event accuracy, study use, and outcomes remain unverified. EVA must not inherit raw-request/user-emotion logging defaults. |
| Consent/witness | Climax prompt instructs the character to revoke consent on another person's behalf. | A fictional narrative statement, not actual consent, refusal, or authority attributable to a person. Exclude from factual assistance. |

Source presence, prompt instruction, successful runtime behavior, and participant interpretation are separate evidence levels. The README's Tier 3 status is partly stale relative to inspected code, but replacing it with “complete and validated” would be equally unsupported.

## Transfer decisions

“Retain” preserves a principle, not its dependencies. “Adapt” changes its meaning or mechanism. “Investigate” leaves adoption open pending evidence. “Exclude” removes it from the current EVA scope.

| Owner mechanism | Classification | Transfer and rationale | Evidence required |
| --- | --- | --- | --- |
| A. Coordinated expression | **Adapt** | Replace a character-response packet with a bounded response score: evidence refs, proposed expressive intention, spatial relations, phase/cue refs, and interruptible revision. Trusted runtime derives content validity and operational state. A model's affect proposal grants neither permission nor shader authority. | Channel synchronization, invalid-field rejection, late-result discard, and user interpretation of the coordinated response. |
| B. Emotional continuity | **Investigate** | Compare a small expressive vocabulary with Plutchik/PAD only if needed. Retain gradual settling and transition continuity as design hypotheses; do not inherit canonical psychological mappings or decay constants. | Matched scenarios; consistency/abruptness reports; authoring burden; contradictory and neutral readings. |
| C. Situated interaction | **Adapt** | Mention scopes language; select focuses a datum; manipulate changes local geometry; compare joins explicit targets; reinterpret invites a bounded alternative. Selection/manipulation can change E1's composition locally; explicit comparison/reinterpretation or conversational requests may later invoke bounded model composition within the requested scope. | User can predict and correct scope; selection/hover alone triggers no upload, memory write, or emotional inference. |
| D. Attention and timing | **Adapt** | Transfer reorientation, pauses, coordinated follow-through, and settling to the whole composition. The eye is one anchor, not the sole embodiment. Preserve the chosen datum and stop decorative motion while the user intervenes. | Intervention-to-visible-response traces, matched-motion comparison, interpretation of what was attended to. |
| E. Environmental congruence | **Adapt** | Bind expressive operations to subject: occlusion and atmospheric layering for weather; intervals, spacing, and possible interruption for transit. Use source fields and missingness, never random effects masquerading as live data. | Fact comprehension and domain-specific mismatch cases; whether the same animation wrongly implies identical meaning. |
| F. Fiction and ordinary life | **Investigate** | Offer poetic encounter without relocating weather/train facts into fiction. Speculation concerns how an answer is experienced. Synthetic fixtures and interpretations remain explicitly marked. | Users distinguish source facts from metaphor and know how to get a plain answer. |
| G. Agency and consent | **Adapt** | Retain meaningful refusal, explicit invitation, and the ability to end an encounter. Separate fictional witness ethics from real consent and action authority. | Rejection/stop works immediately; no emotional bargaining; source and permissions remain independent. |

| Specific prior mechanism | Classification | Reason |
| --- | --- | --- |
| Stable object identity and explicit interaction verbs | **Retain** | Provides an inspectable link between intervention and response; generalize items to semantic scene entities. |
| Separation of dialogue generation from local expression and effects | **Retain** | Supports authored behavior, local control, and independent failure handling. EVA also separates durable memory and verification. |
| Return to neutral/idle | **Adapt** | Settle movement while retaining a readable answer. “Neutral” means no active expressive transition, not presumed emotional neutrality of the user. |
| User-editable remembered context | **Investigate** | Later personal-agent work needs provenance, correction, forgetting, and a longitudinal protocol. First experiment stores only session geometry and preferences. |
| Trust-gated disclosure / earning facts through rapport | **Exclude** | Public factual help must not depend on gratifying an agent or reaching a synthetic relationship score. |
| AI speaking another person's consent | **Exclude** | Narrative output cannot confer personal authority. |
| Facial emotion classification and speaker identification | **Exclude** | No need for the first question; adds inference and privacy burdens without established benefit. |
| Unreal, MetaHuman, ONNX, Kimodo, or other NPC dependencies | **Exclude** | Transfer principles; retain the inspected Tauri/React/Rust base. No dependency port is justified by character expressiveness alone. |
| System-prompt-only gates and model-declared verification | **Exclude** | Deterministic contracts, provenance checks, and host-owned state must enforce EVA's boundaries. |
| Raw model/voice/user-emotion logging defaults | **Exclude** | Public evaluation fixtures and traces must be synthetic or sanitized; real study records need separately approved handling. |

## EVA foundation inspected

At EVA base `9cb84746d97e0d5f1a441c196cfb05a3ed235d18`, `week1/` contains the npm workspace, React 19/TypeScript app, Tauri 2/Rust host, strict protocol schemas, synthetic weather/memory, and narration/transcription boundaries. `src-tauri/src/lib.rs` registers bounded runtime, memory, voice, and narration commands; it is not the proposed full policy broker. `packages/protocol/index.ts` supports a fixed Ithaca weather document and a version-checked wind patch, not general composition.

`SignalEye.tsx` contains an authored WebGL shader with a nominal 45 Hz cap, reduced-motion/static behavior, and context-loss cleanup. `App.tsx` uses `MovingEye`; the existence of GPU code is not a renderer-wide benchmark. [Week 1's outcome](../../week1/docs/design/acceptance/week1-outcome.md) records the owner's successful demonstration without an exact binary hash. The new task does not revalidate native behavior, provider access, or performance.

Recommendation: reuse the architecture in a separately authorized experiment, with React owning readable facts/controls and a disposable field layer comparing Canvas 2D and existing WebGL capability. No engine replacement, GPU dependency installation, or alteration of the Week 1 archive is part of this research revision.
