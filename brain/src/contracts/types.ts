/**
 * Hand-written TypeScript types matching brain/schemas/*.schema.json.
 *
 * The schemas are the source of truth; the generated validators narrow `unknown`
 * to these types. tests/contracts-types.test.ts builds a type-checked sample of
 * every type and asserts it passes its validator, so the two cannot silently drift.
 * Conditional schema rules (if/then) are enforced by the validators; the types
 * keep them only where a discriminated union is cheap.
 */

// ---------------------------------------------------------------------------
// common.schema.json
// ---------------------------------------------------------------------------

/** RFC 3339 date-time with an explicit offset. */
export type Timestamp = string;
/** `sha256:` followed by 64 lowercase hex characters. */
export type Sha256 = string;
/** Any synthetic brain ID: `<kind>_<suffix>`. */
export type EntityId = string;
export type ArtifactId = `art_${string}`;
export type RevisionId = `rev_${string}`;
export type ContextItemId = `ctx_${string}`;
export type TaskId = `task_${string}`;
export type PlanId = `plan_${string}`;
export type RunId = `run_${string}`;
export type SessionId = `sess_${string}`;
export type TurnId = `turn_${string}`;
export type EpisodeId = `ep_${string}`;
export type MemoryNodeId = `mem_${string}`;
export type CandidateId = `cand_${string}`;
export type ReviewDecisionId = `rd_${string}`;
export type RequestId = `mreq_${string}`;
export type ResponseId = `mres_${string}`;
export type TraceId = `trace_${string}`;
export type UserId = `user_${string}`;
/** `persona-v<major>.<minor>.<patch>` */
export type PersonaVersion = `persona-v${number}.${number}.${number}`;
/** URI of a brain schema: `https://eva.local/schemas/brain/<name>.schema.json`. */
export type BrainSchemaRef = string;

export type IntegrityLabel =
  | "trusted_policy"
  | "direct_user"
  | "verified_local"
  | "verified_tool"
  | "untrusted_external"
  | "untrusted_generated"
  | "quarantined";

export type ConfidentialityLabel = "public" | "private" | "sensitive" | "secret";

export interface Labels {
  integrity: IntegrityLabel;
  confidentiality: ConfidentialityLabel;
}

/** Labels for model-produced content: never above `untrusted_generated`. */
export interface GeneratedLabels {
  integrity: "untrusted_generated" | "quarantined";
  confidentiality: ConfidentialityLabel;
}

export type OriginKind = "direct_user" | "policy" | "host" | "model" | "tool" | "memory" | "persona" | "fixture";

export interface Origin {
  kind: OriginKind;
  id: EntityId;
}

export type LineageOperation =
  | "ingest"
  | "retrieve"
  | "extract"
  | "summarize"
  | "join"
  | "derive"
  | "relabel"
  | "validate"
  | "verify"
  | "correct"
  | "revoke"
  | "redact"
  | "compile"
  | "review";

export interface LineageEntry {
  sequence: number;
  operation: LineageOperation;
  actor: Origin;
  inputRefs: EntityId[];
  at: Timestamp;
}

export type SourceKind =
  | "user_turn"
  | "episode"
  | "artifact"
  | "revision"
  | "memory_node"
  | "tool_result"
  | "policy"
  | "persona_file"
  | "fixture";

export interface SourceRef {
  kind: SourceKind;
  /** Prefix must match `kind` (for example `policy_` for policy, `mem_` for memory_node). */
  id: EntityId;
  /** `chars=a-b`, `line=n[-m]`, `field=name` or `seq=n`. Never a path or URL. */
  locator?: string;
}

/** Root shape of common.schema.json. */
export interface ProvenanceStamp {
  origin: Origin;
  sourceRef: SourceRef;
  labels: Labels;
  lineage: LineageEntry[];
}

export interface Route {
  logicalRoute: string;
  modelId: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costMicroUsd?: number;
}

export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "refusal" | "error" | "cancelled" | "timeout";

export interface Refusal {
  category: "safety" | "policy" | "capability" | "other";
  message?: string;
}

export interface ModelError {
  code:
    | "rate_limited"
    | "overloaded"
    | "context_exceeded"
    | "invalid_request"
    | "provider_error"
    | "network"
    | "malformed_output"
    | "schema_invalid"
    | "timeout"
    | "cancelled";
  retryable: boolean;
  message?: string;
}

export type MemoryType =
  | "working"
  | "episodic"
  | "semantic"
  | "procedural"
  | "preference"
  | "affective"
  | "identity"
  | "prospective";

export type Sensitivity = "low" | "moderate" | "high";
export type Assertion = "explicit" | "inferred";
export type RevisionStatus = "provisional" | "verified" | "corrected" | "revoked" | "stale";
export type ExpressiveIntention = "attend" | "invite-comparison" | "reconsider" | "settle";
export type SarcasmSuppressionReason =
  | "safety_confirmation"
  | "user_distress"
  | "failed_action"
  | "factual_uncertainty"
  | "privacy_block"
  | "security_event";

// ---------------------------------------------------------------------------
// context-item.schema.json
// ---------------------------------------------------------------------------

export interface ContextItem {
  schemaVersion: "brain.context-item/1";
  id: ContextItemId;
  origin: Origin;
  sourceRef: SourceRef;
  labels: Labels;
  lineage: LineageEntry[];
  freshness: {
    observedAt: Timestamp;
    /** Required when `volatile` is true. */
    expiresAt?: Timestamp;
    volatile: boolean;
  };
  validation?: {
    state: "unvalidated" | "schema_valid" | "schema_invalid";
    signature: "none" | "verified" | "failed";
  };
  content: {
    mediaType: "text/plain" | "text/markdown" | "application/json";
    body: string;
  };
}

// ---------------------------------------------------------------------------
// artifact-envelope.schema.json
// ---------------------------------------------------------------------------

export type ProducerRole = "worker" | "retriever" | "extractor" | "verifier" | "narrator" | "host";

export interface ArtifactEnvelope {
  schemaVersion: "brain.artifact-envelope/1";
  artifactId: ArtifactId;
  artifactType: string;
  contentSchemaVersion: string;
  taskId: TaskId;
  planId: PlanId;
  runId: RunId;
  /** Late-result token: a consumer rejects artifacts from an older generation. */
  generation: number;
  /**
   * Worker, extractor, narrator and verifier producers, any producer with a `route`,
   * and any artifact whose lineage has a model step carry generated labels only.
   */
  producer: {
    role: ProducerRole;
    id: EntityId;
    route?: Route;
  };
  contentHash: Sha256;
  version: number;
  labels: Labels;
  citations: SourceRef[];
  lineage: LineageEntry[];
  validation: { state: "pending" | "schema_valid" | "schema_invalid" };
  /** `verifierId` and `verifiedAt` are required when `state` is `verified`. */
  verification: {
    state: "unverified" | "verified" | "failed" | "not_applicable";
    verifierId?: EntityId;
    verifiedAt?: Timestamp;
  };
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  /** Must name an artifact when `version` is 2 or more. */
  supersedes: ArtifactId | null;
  deadline: { hardAt: Timestamp; preferredAt: Timestamp };
  resourceUsage: {
    wallMs: number;
    inputTokens?: number;
    outputTokens?: number;
    costMicroUsd?: number;
  };
  parentId?: ArtifactId;
  dependencyIds: ArtifactId[];
}

// ---------------------------------------------------------------------------
// revision-event.schema.json
// ---------------------------------------------------------------------------

export interface RevisionEvent {
  schemaVersion: "brain.revision-event/1";
  revisionId: RevisionId;
  turnId: TurnId;
  /** `narrator` prose is limited to generated labels; `host_template` is deterministic host text. */
  producer: "narrator" | "host_template";
  generation: number;
  sequence: number;
  status: RevisionStatus;
  /** Must name a revision when `status` is `corrected` or `revoked`. */
  supersedes: RevisionId | null;
  /** At least one entry when `status` is `verified`. */
  sourceRefs: EntityId[];
  confidence: number;
  expiresAt: Timestamp;
  /** User-visible output is never `trusted_policy` or `direct_user`. */
  labels: {
    integrity: Exclude<IntegrityLabel, "trusted_policy" | "direct_user">;
    confidentiality: ConfidentialityLabel;
  };
}

// ---------------------------------------------------------------------------
// routing-contract.schema.json
// ---------------------------------------------------------------------------

export type RiskCeiling = "read_only" | "low" | "medium" | "high";

export interface RoutingContract {
  schemaVersion: "brain.routing-contract/1";
  taskId: TaskId;
  deadlines: { hardMs: number; preferredMs: number };
  qualityTier: "fast" | "standard" | "high" | "frontier";
  riskCeiling: RiskCeiling;
  privacy: { maxConfidentiality: ConfidentialityLabel; localOnly: boolean };
  budgets: {
    maxInputTokens: number;
    maxOutputTokens: number;
    maxCostMicroUsd: number;
    maxCpuMs?: number;
    maxMemoryMb?: number;
    maxNetworkBytes?: number;
  };
  cancellation: {
    propagate: "all_dependents";
    onHardDeadline: "cancel_and_fail" | "cancel_and_fallback" | "cancel_and_keep_provisional";
  };
  fallback: "none" | "cheaper_route" | "deterministic_text";
  provisionalDisplayAllowed: boolean;
  externalToolsPermitted: boolean;
  specialistsPermitted: boolean;
}

// ---------------------------------------------------------------------------
// model-request.schema.json
// ---------------------------------------------------------------------------

export interface ModelMessagePart {
  type: "text";
  text: string;
  labels: Labels;
  sourceRef?: SourceRef;
}

export interface ModelMessage {
  /** System-role parts must carry `trusted_policy` integrity. */
  role: "system" | "user" | "assistant";
  parts: ModelMessagePart[];
}

export type ModelPurpose = "narrator" | "worker" | "extractor" | "verifier" | "classifier";

export interface ModelRequest {
  schemaVersion: "brain.model-request/1";
  requestId: RequestId;
  taskId: TaskId;
  generation: number;
  /** Must be `narrator` when `personaPacketHash` is present. */
  purpose: ModelPurpose;
  route: Route;
  messages: ModelMessage[];
  outputSchemaRef?: BrainSchemaRef;
  personaPacketHash?: Sha256;
  reasoning?: { effort: "none" | "low" | "medium" | "high" };
  maxOutputTokens: number;
  deadlineMs: number;
  stream: boolean;
}

// ---------------------------------------------------------------------------
// model-response.schema.json
// ---------------------------------------------------------------------------

export type ModelOutput =
  | { kind: "text"; text: string }
  | { kind: "structured"; schemaRef: BrainSchemaRef; json: string };

interface ModelResponseBase {
  schemaVersion: "brain.model-response/1";
  responseId: ResponseId;
  requestId: RequestId;
  generation: number;
  route: Route;
  labels: GeneratedLabels;
  usage: Usage;
}

export type ModelResponse =
  | (ModelResponseBase & {
      outcome: "completed";
      stopReason: "end_turn" | "max_tokens" | "stop_sequence";
      output: ModelOutput;
    })
  | (ModelResponseBase & { outcome: "refused"; stopReason: "refusal"; refusal: Refusal })
  | (ModelResponseBase & { outcome: "error"; stopReason: "error"; error: ModelError })
  | (ModelResponseBase & {
      outcome: "cancelled" | "timeout";
      stopReason: "cancelled" | "timeout";
      error?: ModelError;
    });

// ---------------------------------------------------------------------------
// model-stream-event.schema.json
// ---------------------------------------------------------------------------

interface StreamEventBase {
  schemaVersion: "brain.model-stream-event/1";
  requestId: RequestId;
  generation: number;
  sequence: number;
}

export type ModelStreamEvent =
  | (StreamEventBase & { type: "start"; sequence: 0; route: Route })
  | (StreamEventBase & { type: "text_delta"; delta: string })
  | (StreamEventBase & { type: "structured_delta"; jsonFragment: string })
  | (StreamEventBase & { type: "usage"; usage: Usage })
  | (StreamEventBase & { type: "refusal"; refusal: Refusal })
  | (StreamEventBase & { type: "error"; error: ModelError })
  | (StreamEventBase & { type: "stop"; stopReason: StopReason })
  | (StreamEventBase & {
      type: "abort";
      reason: "user_cancelled" | "superseded" | "deadline" | "parent_cancelled";
    });

// ---------------------------------------------------------------------------
// memory-node.schema.json
// ---------------------------------------------------------------------------

export type MemoryRelation =
  | "prefers"
  | "works_on"
  | "decided"
  | "supersedes"
  | "contradicts"
  | "evidenced_by"
  | "experienced_during"
  | "related_to"
  | "depends_on"
  | "committed_to";

/** Pending candidates stay in the review queue; rejected ones are never written. */
export type MemoryReviewState = "not_required" | "accepted" | "edited" | "temporary";

export interface MemoryNode {
  schemaVersion: "brain.memory-node/1";
  id: MemoryNodeId;
  type: MemoryType;
  subject: string;
  claim: string;
  origin?: { artifactId?: ArtifactId; revisionId?: RevisionId };
  /** Memory is evidence, never policy, and a durable node is never quarantined. */
  labels: {
    integrity: Exclude<IntegrityLabel, "trusted_policy" | "quarantined">;
    confidentiality: ConfidentialityLabel;
  };
  sourceRef: SourceRef;
  evidence: { kind: "quote"; quote: string } | { kind: "event"; eventRef: SourceRef };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  validFrom: Timestamp;
  /** Required for affective and temporary nodes. */
  validUntil?: Timestamp;
  confidence: number;
  assertion: Assertion;
  sensitivity: Sensitivity;
  /**
   * Never `not_required` for inferred, affective, identity or high-sensitivity nodes;
   * `not_required` also needs `direct_user` labels, quote evidence and an episode or
   * user-turn source.
   */
  reviewState: MemoryReviewState;
  /** Required for accepted, edited and temporary nodes; absent otherwise. */
  reviewDecisionId?: ReviewDecisionId;
  supersedes: MemoryNodeId[];
  contradictedBy: MemoryNodeId[];
  tags: string[];
  links: { relation: MemoryRelation; target: MemoryNodeId }[];
  personaVersion?: PersonaVersion;
}

// ---------------------------------------------------------------------------
// episode-record.schema.json
// ---------------------------------------------------------------------------

export type EpisodeOrigin = "direct_user" | "narrator" | "host" | "tool" | "system_event";

export interface EpisodeRecord {
  schemaVersion: "brain.episode-record/1";
  id: EpisodeId;
  sessionId: SessionId;
  turnId: TurnId;
  sequence: number;
  /** `null` only for sequence 0. */
  prevEntryHash: Sha256 | null;
  at: Timestamp;
  /** Only `direct_user` origin may carry `direct_user` integrity, and it must. */
  origin: EpisodeOrigin;
  labels: Labels;
  /** Required for narrator events. */
  revisionId?: RevisionId;
  content: { mediaType: "text/plain"; text: string };
}

// ---------------------------------------------------------------------------
// memory-candidate.schema.json
// ---------------------------------------------------------------------------

/**
 * memory-candidate-proposal.schema.json: the extractor's entire output. Untrusted;
 * `evidence.quote` is required when `assertion` is `explicit`.
 */
export interface MemoryCandidateProposal {
  type: MemoryType;
  subject: string;
  claim: string;
  assertion: Assertion;
  confidence: number;
  sensitivity: Sensitivity;
  evidence: { episodeId: EpisodeId; quote?: string };
  proposedLabels?: GeneratedLabels;
  validUntil?: Timestamp;
  tags?: string[];
}

/** Host-computed fields: not model-writable. */
export interface MemoryCandidateHost {
  candidateId: CandidateId;
  generation: number;
  extractedAt: Timestamp;
  extractorRoute?: Route;
  sourceEpisodeIds: EpisodeId[];
  /** `null` when the candidate came directly from an episode. */
  originRevision: { revisionId: RevisionId; status: RevisionStatus } | null;
  labels: GeneratedLabels;
  lineage: LineageEntry[];
}

export interface MemoryCandidate {
  schemaVersion: "brain.memory-candidate/1";
  proposal: MemoryCandidateProposal;
  host: MemoryCandidateHost;
}

// ---------------------------------------------------------------------------
// review-decision.schema.json
// ---------------------------------------------------------------------------

interface ReviewDecisionBase {
  schemaVersion: "brain.review-decision/1";
  decisionId: ReviewDecisionId;
  candidateId: CandidateId;
  reviewer: { kind: "direct_user"; id: UserId };
  decidedAt: Timestamp;
  labels: { integrity: "direct_user"; confidentiality: ConfidentialityLabel };
}

export type ReviewDecision =
  | (ReviewDecisionBase & { decision: "accept"; validUntil?: Timestamp })
  | (ReviewDecisionBase & { decision: "edit"; editedClaim: string; validUntil?: Timestamp })
  | (ReviewDecisionBase & { decision: "reject" })
  | (ReviewDecisionBase & { decision: "make-temporary"; validUntil: Timestamp });

// ---------------------------------------------------------------------------
// persona-identity.schema.json, persona-style.schema.json
// ---------------------------------------------------------------------------

export type Register = "low" | "lower_mid" | "mid" | "upper_mid" | "high";
export type Hedging = "minimal" | "moderate" | "careful";

export interface PersonaIdentity {
  schemaVersion: "brain.persona-identity/1";
  personaVersion: PersonaVersion;
  name: string;
  pronouns: "she/her" | "he/him" | "they/them" | "it/its";
  relationship: "assistant" | "collaborator" | "companion";
  temperament: (
    | "dry_warmth"
    | "high_competence"
    | "observant"
    | "calm"
    | "curious"
    | "playful"
    | "reserved"
    | "direct"
  )[];
  voice: {
    language: string;
    accent: "british" | "american" | "australian" | "irish" | "scottish" | "neutral";
    perceivedAge: number;
    register: Register;
    timbre: "smooth_controlled" | "bright" | "warm" | "breathy" | "resonant";
    articulation: "crisp" | "relaxed";
    pacing: number;
  };
  approval: { reviewDecisionId: ReviewDecisionId; approvedAt: Timestamp };
  updatedAt: Timestamp;
}

export interface PersonaStyle {
  schemaVersion: "brain.persona-style/1";
  styleVersion: number;
  personaVersion: PersonaVersion;
  updatedAt: Timestamp;
  style: {
    brevity: number;
    initiative: number;
    warmth: number;
    formality: number;
    sarcasm: number;
  };
  phrasing: {
    hedging: Hedging;
    contractions: boolean;
    spelling: "british" | "american";
  };
}

// ---------------------------------------------------------------------------
// session-affect.schema.json
// ---------------------------------------------------------------------------

export interface SessionAffect {
  schemaVersion: "brain.session-affect/1";
  sessionId: SessionId;
  turnId: TurnId;
  intention: ExpressiveIntention;
  intensity: number;
  setAt: Timestamp;
  expiresAt: Timestamp;
  origin: "host_rule" | "narrator_proposal" | "user_signal";
}

// ---------------------------------------------------------------------------
// persona-packet.schema.json
// ---------------------------------------------------------------------------

export type SarcasmState =
  | { level: 0; suppressed: true; reasons: SarcasmSuppressionReason[] }
  | { level: number; suppressed: false; reasons: [] };

export interface PersonaPacket {
  schemaVersion: "brain.persona-packet/1";
  recipient: "narrator";
  personaVersion: PersonaVersion;
  styleVersion: number;
  compiledAt: Timestamp;
  contentHash: Sha256;
  /** `affect` is required when the packet carries `affect`. */
  layerHashes: {
    constitution: Sha256;
    identity: Sha256;
    style: Sha256;
    voice?: Sha256;
    exemplars?: Sha256;
    affect?: Sha256;
  };
  /** Compiled from user-approved files: never `trusted_policy` or `direct_user`. */
  labels: {
    integrity: Exclude<IntegrityLabel, "trusted_policy" | "direct_user">;
    confidentiality: ConfidentialityLabel;
  };
  register: {
    register: Register;
    brevity: number;
    initiative: number;
    warmth: number;
    formality: number;
    hedging: Hedging;
  };
  sarcasm: SarcasmState;
  affect?: { intention: ExpressiveIntention; intensity: number; expiresAt: Timestamp };
}

// ---------------------------------------------------------------------------
// trace-event.schema.json
// ---------------------------------------------------------------------------

export type TraceEventKind =
  | "turn_started"
  | "route_selected"
  | "model_call"
  | "retrieval"
  | "revision_emitted"
  | "memory_candidate"
  | "cancelled"
  | "late_result_rejected"
  | "turn_completed";

export interface TraceEvent {
  schemaVersion: "brain.trace-event/1";
  traceId: TraceId;
  turnId: TurnId;
  generation: number;
  sequence: number;
  at: Timestamp;
  kind: TraceEventKind;
  outcome: "ok" | "refused" | "error" | "cancelled" | "timeout" | "rejected";
  /** Required for `turn_completed`, `model_call` and `route_selected`. */
  route?: Route;
  requestId?: RequestId;
  personaVersion?: PersonaVersion;
  personaHash?: Sha256;
  citedNodeIds?: MemoryNodeId[];
  revisionIds?: RevisionId[];
  candidateIds?: CandidateId[];
  timings?: { durationMs: number; firstEventMs?: number };
  usage?: Usage;
}
