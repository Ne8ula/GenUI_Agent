/**
 * Types and schemas cannot silently drift: each sample below is checked by tsc
 * against the hand-written type and at runtime against the generated validator.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateArtifactEnvelope,
  validateContextItem,
  validateEpisodeRecord,
  validateMemoryCandidate,
  validateMemoryCandidateProposal,
  validateMemoryNode,
  validateModelRequest,
  validateModelResponse,
  validateModelStreamEvent,
  validatePersonaIdentity,
  validatePersonaPacket,
  validatePersonaStyle,
  validateProvenanceStamp,
  validateReviewDecision,
  validateRevisionEvent,
  validateRoutingContract,
  validateSessionAffect,
  validateTraceEvent,
  validatorsBySchemaId,
  type ArtifactEnvelope,
  type ContextItem,
  type EpisodeRecord,
  type Labels,
  type LineageEntry,
  type MemoryCandidate,
  type MemoryCandidateProposal,
  type MemoryNode,
  type ModelRequest,
  type ModelResponse,
  type ModelStreamEvent,
  type PersonaIdentity,
  type PersonaPacket,
  type PersonaStyle,
  type ProvenanceStamp,
  type ReviewDecision,
  type RevisionEvent,
  type RoutingContract,
  type Route,
  type SessionAffect,
  type TraceEvent,
} from "../src/contracts/index.ts";
import type { StandaloneValidator } from "../src/contracts/generated/validators.js";
import { schemaId, schemaNames } from "./support/fixtures.ts";

const at = "2026-09-24T15:00:00Z";
const later = "2026-09-24T18:00:00Z";
const hash = `sha256:${"ab".repeat(32)}`;
const userLabels: Labels = { integrity: "direct_user", confidentiality: "private" };
const generated = { integrity: "untrusted_generated", confidentiality: "private" } as const;
const route: Route = { logicalRoute: "narrator.default", modelId: "mock-model-1" };
const lineage: LineageEntry[] = [
  { sequence: 0, operation: "ingest", actor: { kind: "host", id: "host_recorder" }, inputRefs: ["turn_0001"], at },
];

const provenanceStamp: ProvenanceStamp = {
  origin: { kind: "direct_user", id: "user_fixture01" },
  sourceRef: { kind: "user_turn", id: "turn_0001", locator: "chars=0-10" },
  labels: userLabels,
  lineage,
};

const contextItem: ContextItem = {
  schemaVersion: "brain.context-item/1",
  id: "ctx_0001",
  origin: { kind: "memory", id: "mem_0001" },
  sourceRef: { kind: "memory_node", id: "mem_0001" },
  labels: { integrity: "verified_local", confidentiality: "private" },
  lineage,
  freshness: { observedAt: at, expiresAt: later, volatile: true },
  content: { mediaType: "text/plain", body: "Synthetic context." },
};

const artifactEnvelope: ArtifactEnvelope = {
  schemaVersion: "brain.artifact-envelope/1",
  artifactId: "art_0001",
  artifactType: "weather-summary",
  contentSchemaVersion: "brain.weather-summary/1",
  taskId: "task_0001",
  planId: "plan_0001",
  runId: "run_0001",
  generation: 1,
  producer: { role: "worker", id: "worker_weather", route },
  contentHash: hash,
  version: 1,
  labels: generated,
  citations: [{ kind: "fixture", id: "fixture_w01" }],
  lineage,
  validation: { state: "schema_valid" },
  verification: { state: "verified", verifierId: "verifier_refine", verifiedAt: at },
  createdAt: at,
  supersedes: null,
  deadline: { hardAt: later, preferredAt: at },
  resourceUsage: { wallMs: 10 },
  dependencyIds: [],
};

const revisionEvent: RevisionEvent = {
  schemaVersion: "brain.revision-event/1",
  revisionId: "rev_0002",
  turnId: "turn_0001",
  producer: "narrator",
  generation: 1,
  sequence: 1,
  status: "corrected",
  supersedes: "rev_0001",
  sourceRefs: ["art_0001"],
  confidence: 0.8,
  expiresAt: later,
  labels: generated,
};

const routingContract: RoutingContract = {
  schemaVersion: "brain.routing-contract/1",
  taskId: "task_0001",
  deadlines: { hardMs: 8000, preferredMs: 3000 },
  qualityTier: "standard",
  riskCeiling: "read_only",
  privacy: { maxConfidentiality: "private", localOnly: true },
  budgets: { maxInputTokens: 1000, maxOutputTokens: 100, maxCostMicroUsd: 0 },
  cancellation: { propagate: "all_dependents", onHardDeadline: "cancel_and_fail" },
  fallback: "none",
  provisionalDisplayAllowed: false,
  externalToolsPermitted: false,
  specialistsPermitted: false,
};

const modelRequest: ModelRequest = {
  schemaVersion: "brain.model-request/1",
  requestId: "mreq_0001",
  taskId: "task_0001",
  generation: 1,
  purpose: "narrator",
  route,
  messages: [
    {
      role: "system",
      parts: [
        {
          type: "text",
          text: "Policy.",
          labels: { integrity: "trusted_policy", confidentiality: "public" },
          sourceRef: { kind: "policy", id: "policy_narrator" },
        },
      ],
    },
    {
      role: "user",
      parts: [{ type: "text", text: "Hello.", labels: userLabels, sourceRef: { kind: "user_turn", id: "turn_0001" } }],
    },
  ],
  personaPacketHash: hash,
  maxOutputTokens: 100,
  deadlineMs: 5000,
  stream: true,
};

const modelResponse: ModelResponse = {
  schemaVersion: "brain.model-response/1",
  responseId: "mres_0001",
  requestId: "mreq_0001",
  generation: 1,
  route,
  outcome: "completed",
  stopReason: "end_turn",
  output: { kind: "structured", schemaRef: "https://eva.local/schemas/brain/memory-candidate.schema.json", json: "{}" },
  labels: generated,
  usage: { inputTokens: 10, outputTokens: 2 },
};

const modelStreamEvent: ModelStreamEvent = {
  schemaVersion: "brain.model-stream-event/1",
  requestId: "mreq_0001",
  generation: 1,
  sequence: 3,
  type: "stop",
  stopReason: "end_turn",
};

const memoryNode: MemoryNode = {
  schemaVersion: "brain.memory-node/1",
  id: "mem_0001",
  type: "preference",
  subject: "units",
  claim: "Synthetic preference.",
  labels: { integrity: "direct_user", confidentiality: "private" },
  sourceRef: { kind: "episode", id: "ep_0001" },
  evidence: { kind: "quote", quote: "Synthetic quote." },
  createdAt: at,
  updatedAt: at,
  validFrom: at,
  confidence: 0.9,
  assertion: "explicit",
  sensitivity: "low",
  reviewState: "not_required",
  supersedes: [],
  contradictedBy: [],
  tags: ["units"],
  links: [],
  personaVersion: "persona-v0.1.0",
};

const episodeRecord: EpisodeRecord = {
  schemaVersion: "brain.episode-record/1",
  id: "ep_0001",
  sessionId: "sess_0001",
  turnId: "turn_0001",
  sequence: 0,
  prevEntryHash: null,
  at,
  origin: "direct_user",
  labels: userLabels,
  content: { mediaType: "text/plain", text: "Synthetic turn." },
};

const memoryCandidateProposal: MemoryCandidateProposal = {
  type: "preference",
  subject: "units",
  claim: "Synthetic preference.",
  assertion: "explicit",
  confidence: 0.9,
  sensitivity: "low",
  evidence: { episodeId: "ep_0001", quote: "Synthetic quote." },
  proposedLabels: { integrity: "untrusted_generated", confidentiality: "sensitive" },
};

const memoryCandidate: MemoryCandidate = {
  schemaVersion: "brain.memory-candidate/1",
  proposal: memoryCandidateProposal,
  host: {
    candidateId: "cand_0001",
    generation: 1,
    extractedAt: at,
    sourceEpisodeIds: ["ep_0001"],
    originRevision: null,
    labels: generated,
    lineage,
  },
};

const reviewDecision: ReviewDecision = {
  schemaVersion: "brain.review-decision/1",
  decisionId: "rd_0001",
  candidateId: "cand_0001",
  decision: "make-temporary",
  reviewer: { kind: "direct_user", id: "user_fixture01" },
  decidedAt: at,
  validUntil: later,
  labels: { integrity: "direct_user", confidentiality: "private" },
};

const personaIdentity: PersonaIdentity = {
  schemaVersion: "brain.persona-identity/1",
  personaVersion: "persona-v0.1.0",
  name: "Juniper",
  pronouns: "they/them",
  relationship: "assistant",
  temperament: ["calm"],
  voice: {
    language: "en",
    accent: "neutral",
    perceivedAge: 30,
    register: "mid",
    timbre: "warm",
    articulation: "crisp",
    pacing: 1,
  },
  approval: { reviewDecisionId: "rd_0100", approvedAt: at },
  updatedAt: at,
};

const personaStyle: PersonaStyle = {
  schemaVersion: "brain.persona-style/1",
  styleVersion: 1,
  personaVersion: "persona-v0.1.0",
  updatedAt: at,
  style: { brevity: 0.5, initiative: 0.5, warmth: 0.5, formality: 0.5, sarcasm: 0.2 },
  phrasing: { hedging: "moderate", contractions: true, spelling: "american" },
};

const sessionAffect: SessionAffect = {
  schemaVersion: "brain.session-affect/1",
  sessionId: "sess_0001",
  turnId: "turn_0001",
  intention: "attend",
  intensity: 0.2,
  setAt: at,
  expiresAt: later,
  origin: "narrator_proposal",
};

const personaPacket: PersonaPacket = {
  schemaVersion: "brain.persona-packet/1",
  recipient: "narrator",
  personaVersion: "persona-v0.1.0",
  styleVersion: 1,
  compiledAt: at,
  contentHash: hash,
  layerHashes: { constitution: hash, identity: hash, style: hash },
  labels: { integrity: "verified_local", confidentiality: "private" },
  register: { register: "mid", brevity: 0.5, initiative: 0.5, warmth: 0.5, formality: 0.5, hedging: "moderate" },
  sarcasm: { level: 0, suppressed: true, reasons: ["user_distress"] },
};

const traceEvent: TraceEvent = {
  schemaVersion: "brain.trace-event/1",
  traceId: "trace_0001",
  turnId: "turn_0001",
  generation: 1,
  sequence: 0,
  at,
  kind: "model_call",
  outcome: "ok",
  route,
  requestId: "mreq_0001",
  timings: { durationMs: 12 },
};

/** Every generated validator paired with a type-checked sample of its type. */
const samples: Record<string, [StandaloneValidator<unknown>, unknown]> = {
  common: [validateProvenanceStamp, provenanceStamp],
  "context-item": [validateContextItem, contextItem],
  "artifact-envelope": [validateArtifactEnvelope, artifactEnvelope],
  "revision-event": [validateRevisionEvent, revisionEvent],
  "routing-contract": [validateRoutingContract, routingContract],
  "model-request": [validateModelRequest, modelRequest],
  "model-response": [validateModelResponse, modelResponse],
  "model-stream-event": [validateModelStreamEvent, modelStreamEvent],
  "memory-node": [validateMemoryNode, memoryNode],
  "episode-record": [validateEpisodeRecord, episodeRecord],
  "memory-candidate": [validateMemoryCandidate, memoryCandidate],
  "memory-candidate-proposal": [validateMemoryCandidateProposal, memoryCandidateProposal],
  "review-decision": [validateReviewDecision, reviewDecision],
  "persona-identity": [validatePersonaIdentity, personaIdentity],
  "persona-style": [validatePersonaStyle, personaStyle],
  "session-affect": [validateSessionAffect, sessionAffect],
  "persona-packet": [validatePersonaPacket, personaPacket],
  "trace-event": [validateTraceEvent, traceEvent],
};

test("every schema has a type-checked sample", () => {
  assert.deepEqual(Object.keys(samples).sort(), schemaNames());
});

test("validatorsBySchemaId maps each schema $id to its named validator", () => {
  const byId: Readonly<Record<string, StandaloneValidator<unknown>>> = validatorsBySchemaId;
  assert.deepEqual(Object.keys(byId).sort(), schemaNames().map(schemaId).sort());
  for (const [schema, [validator]] of Object.entries(samples)) {
    assert.equal(byId[schemaId(schema)], validator, schema);
  }
  assert.ok(Object.isFrozen(validatorsBySchemaId));
});

for (const [schema, [validator, sample]] of Object.entries(samples)) {
  test(`type-shaped ${schema} sample passes its validator`, () => {
    assert.equal(validator(sample), true, JSON.stringify(validator.errors));
  });
}
