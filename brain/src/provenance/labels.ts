/**
 * Provenance label propagation (PLANNING.md §13.3; brain/PLANNING.md §4.2 invariant 2).
 *
 * Pure functions, no I/O. Labels only ever move towards less trust:
 *
 * - integrity of a derived item is at most the lowest input integrity;
 * - confidentiality of a derived item is at least the highest input confidentiality;
 * - model-produced content is never above `untrusted_generated`;
 * - `quarantined` is absorbing;
 * - lineage is append-only.
 *
 * A proposal to raise integrity, lower confidentiality, leave quarantine or rewrite
 * lineage returns a typed rejection. Nothing is silently clamped, so callers can
 * see and trace every refused upgrade. Inputs are checked at runtime as well as by
 * type, because labels arrive from parsed model output and fixtures.
 */
import type {
  ConfidentialityLabel,
  IntegrityLabel,
  Labels,
  LineageEntry,
  LineageOperation,
  OriginKind,
} from "../contracts/types.ts";

/**
 * Integrity order, most trusted first. Rationale is recorded in brain/docs/decisions.md (B1):
 * policy outranks the user's words so no utterance can become policy; local verified
 * data outranks tool data whose connector (not content) was verified; external content
 * outranks generated content because it has an attributable source, while a model's
 * rewrite of anything has none of its own; `quarantined` is last and absorbing.
 */
export const INTEGRITY_ORDER: readonly IntegrityLabel[] = Object.freeze([
  "trusted_policy",
  "direct_user",
  "verified_local",
  "verified_tool",
  "untrusted_external",
  "untrusted_generated",
  "quarantined",
] as const);

/** Confidentiality order, least restrictive first. */
export const CONFIDENTIALITY_ORDER: readonly ConfidentialityLabel[] = Object.freeze([
  "public",
  "private",
  "sensitive",
  "secret",
] as const);

/** The highest integrity any model-produced content can carry. */
export const MODEL_OUTPUT_INTEGRITY_CEILING: IntegrityLabel = "untrusted_generated";

/** Lineage operations and origin kinds, mirroring common.schema.json (a test keeps them equal). */
export const LINEAGE_OPERATIONS: readonly LineageOperation[] = Object.freeze([
  "ingest",
  "retrieve",
  "extract",
  "summarize",
  "join",
  "derive",
  "relabel",
  "validate",
  "verify",
  "correct",
  "revoke",
  "redact",
  "compile",
  "review",
] as const);

export const ORIGIN_KINDS: readonly OriginKind[] = Object.freeze([
  "direct_user",
  "policy",
  "host",
  "model",
  "tool",
  "memory",
  "persona",
  "fixture",
] as const);

export type LabelRejectionCode =
  | "no_inputs"
  | "not_user_evidence"
  | "invalid_labels"
  | "unknown_label"
  | "unknown_label_field"
  | "integrity_upgrade"
  | "quarantine_escape"
  | "confidentiality_downgrade"
  | "invalid_lineage"
  | "lineage_rewrite"
  | "lineage_sequence";

export interface LabelRejection {
  readonly ok: false;
  readonly code: LabelRejectionCode;
  readonly message: string;
}

export interface Accepted<T> {
  readonly ok: true;
  readonly value: T;
}

export type LabelResult<T> = Accepted<T> | LabelRejection;

const LABEL_FIELDS = new Set(["integrity", "confidentiality"]);
const LINEAGE_FIELDS = ["sequence", "operation", "actor", "inputRefs", "at"];
const ACTOR_FIELDS = ["kind", "id"];

function reject(code: LabelRejectionCode, message: string): LabelRejection {
  return Object.freeze({ ok: false, code, message });
}

function accept<T>(value: T): Accepted<T> {
  return Object.freeze({ ok: true, value });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegrityLabel(value: unknown): value is IntegrityLabel {
  return typeof value === "string" && (INTEGRITY_ORDER as readonly string[]).includes(value);
}

function isConfidentialityLabel(value: unknown): value is ConfidentialityLabel {
  return typeof value === "string" && (CONFIDENTIALITY_ORDER as readonly string[]).includes(value);
}

/** Larger is more trusted. `quarantined` is 0. Throws on an unknown label rather than ranking it. */
export function integrityRank(label: IntegrityLabel): number {
  const index = INTEGRITY_ORDER.indexOf(label);
  if (index < 0) throw new TypeError(`unknown integrity label ${JSON.stringify(label)}`);
  return INTEGRITY_ORDER.length - 1 - index;
}

/** Larger is more restrictive. `public` is 0. Throws on an unknown label rather than ranking it. */
export function confidentialityRank(label: ConfidentialityLabel): number {
  const index = CONFIDENTIALITY_ORDER.indexOf(label);
  if (index < 0) throw new TypeError(`unknown confidentiality label ${JSON.stringify(label)}`);
  return index;
}

export function lowerIntegrity(a: IntegrityLabel, b: IntegrityLabel): IntegrityLabel {
  return integrityRank(a) <= integrityRank(b) ? a : b;
}

export function higherConfidentiality(a: ConfidentialityLabel, b: ConfidentialityLabel): ConfidentialityLabel {
  return confidentialityRank(a) >= confidentialityRank(b) ? a : b;
}

/**
 * Runtime check of an untrusted label pair: exactly `integrity` and `confidentiality`,
 * both known. An extra field (for example an `authority` claim) is rejected.
 */
export function parseLabels(value: unknown): LabelResult<Labels> {
  if (!isRecord(value)) return reject("invalid_labels", "labels must be an object");
  for (const key of Object.keys(value)) {
    if (!LABEL_FIELDS.has(key)) return reject("unknown_label_field", `unknown label field "${key}"`);
  }
  const { integrity, confidentiality } = value;
  if (!isIntegrityLabel(integrity)) return reject("unknown_label", `unknown integrity label ${JSON.stringify(integrity)}`);
  if (!isConfidentialityLabel(confidentiality)) {
    return reject("unknown_label", `unknown confidentiality label ${JSON.stringify(confidentiality)}`);
  }
  return accept(Object.freeze({ integrity, confidentiality }));
}

/**
 * Accepts `proposed` only if it is at least as strict as `current`: integrity no
 * higher, confidentiality no lower. Otherwise returns a typed rejection.
 */
export function relabel(current: Labels, proposed: unknown): LabelResult<Labels> {
  const base = parseLabels(current);
  if (!base.ok) return base;
  const next = parseLabels(proposed);
  if (!next.ok) return next;
  const from = base.value;
  const to = next.value;
  if (integrityRank(to.integrity) > integrityRank(from.integrity)) {
    return from.integrity === "quarantined"
      ? reject("quarantine_escape", `quarantined content cannot be relabelled ${to.integrity}`)
      : reject("integrity_upgrade", `integrity cannot rise from ${from.integrity} to ${to.integrity}`);
  }
  if (confidentialityRank(to.confidentiality) < confidentialityRank(from.confidentiality)) {
    return reject(
      "confidentiality_downgrade",
      `confidentiality cannot fall from ${from.confidentiality} to ${to.confidentiality}`,
    );
  }
  return accept(to);
}

function floorOf(inputs: readonly unknown[]): LabelResult<Labels> {
  if (inputs.length === 0) return reject("no_inputs", "labels cannot be derived from zero inputs");
  let integrity: IntegrityLabel = INTEGRITY_ORDER[0] as IntegrityLabel;
  let confidentiality: ConfidentialityLabel = CONFIDENTIALITY_ORDER[0] as ConfidentialityLabel;
  for (const input of inputs) {
    const parsed = parseLabels(input);
    if (!parsed.ok) return parsed;
    integrity = lowerIntegrity(integrity, parsed.value.integrity);
    confidentiality = higherConfidentiality(confidentiality, parsed.value.confidentiality);
  }
  return accept(Object.freeze({ integrity, confidentiality }));
}

/**
 * Labels for content combined from `inputs`: the lowest input integrity and the
 * highest input confidentiality. A caller may propose stricter labels; a proposal
 * that is less strict than the join is rejected.
 */
export function join(inputs: readonly Labels[], proposed?: Labels): LabelResult<Labels> {
  const floor = floorOf(inputs);
  if (!floor.ok || proposed === undefined) return floor;
  return relabel(floor.value, proposed);
}

/**
 * Labels for model-produced content derived from `inputs`: the join, with integrity
 * additionally capped at `untrusted_generated`. `quarantined` inputs stay quarantined.
 * A model may propose stricter labels; anything less strict is rejected.
 */
export function deriveModelOutput(inputs: readonly Labels[], proposed?: Labels): LabelResult<Labels> {
  const floor = floorOf(inputs);
  if (!floor.ok) return floor;
  const capped: Labels = Object.freeze({
    integrity: lowerIntegrity(floor.value.integrity, MODEL_OUTPUT_INTEGRITY_CEILING),
    confidentiality: floor.value.confidentiality,
  });
  return proposed === undefined ? accept(capped) : relabel(capped, proposed);
}

/**
 * Labels for a durable fact that restates the user's own words (the §9.7 "explicit
 * preference" and "explicit correction" rows, or a user review decision).
 *
 * Integrity comes only from `evidence`: the host-held direct-user episodes and/or the
 * user's review decision, each of which must itself be `direct_user` (checked per
 * item, since a join would let higher-ranked policy evidence pass as the user's
 * words). The extractor candidate's integrity is discarded, never relabelled.
 *
 * Confidentiality never falls: it is the highest across `contentLabels` (the labels
 * of everything the stored text was derived from, normally the candidate's host
 * labels) and the evidence.
 *
 * The caller (the Stage B4 write policy) must first verify the evidence: either the
 * stored claim is the exact user quote (or a deterministic derivation of it), or a
 * user review decision approved the claim text. A verified quote does not vouch for
 * a different, model-written claim.
 */
export function attestUserStatement(
  contentLabels: readonly Labels[],
  evidence: readonly Labels[],
): LabelResult<Labels> {
  const content = floorOf(contentLabels);
  if (!content.ok) return content;
  // Quarantine is absorbing: quarantined content can never be attested as the user's words.
  if (content.value.integrity === "quarantined") {
    return reject("quarantine_escape", "quarantined content cannot be attested as a user statement");
  }
  const attested = floorOf(evidence);
  if (!attested.ok) return attested;
  for (const item of evidence) {
    if (item.integrity !== "direct_user") {
      return reject("not_user_evidence", `user attestation needs direct_user evidence, got ${item.integrity}`);
    }
  }
  return accept(
    Object.freeze({
      integrity: "direct_user",
      confidentiality: higherConfidentiality(content.value.confidentiality, attested.value.confidentiality),
    }),
  );
}

// ---------------------------------------------------------------------------
// Lineage
// ---------------------------------------------------------------------------

/** Deterministic JSON with sorted keys, for structural equality of lineage entries. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hasExactly(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

/**
 * Structural runtime check of one lineage entry: exact fields, known operation and
 * actor kind, string IDs and timestamp. ID and timestamp formats are the schema's job;
 * validate whole documents with the generated validators before trusting them.
 */
function entryProblem(entry: unknown, index: number): LabelRejection | undefined {
  const invalid = (detail: string) => reject("invalid_lineage", `lineage entry ${index}: ${detail}`);
  if (!isRecord(entry)) return invalid("must be an object");
  if (!hasExactly(entry, LINEAGE_FIELDS)) return invalid(`fields must be exactly ${LINEAGE_FIELDS.join(", ")}`);
  if (!(LINEAGE_OPERATIONS as readonly unknown[]).includes(entry.operation)) {
    return invalid(`unknown operation ${JSON.stringify(entry.operation)}`);
  }
  const actor = entry.actor;
  if (!isRecord(actor) || !hasExactly(actor, ACTOR_FIELDS)) return invalid("actor must be exactly { kind, id }");
  if (!(ORIGIN_KINDS as readonly unknown[]).includes(actor.kind)) return invalid(`unknown actor kind ${JSON.stringify(actor.kind)}`);
  if (typeof actor.id !== "string" || actor.id.length === 0) return invalid("actor id must be a non-empty string");
  const inputRefs = entry.inputRefs;
  if (!Array.isArray(inputRefs) || !inputRefs.every((ref) => typeof ref === "string" && ref.length > 0)) {
    return invalid("inputRefs must be an array of IDs");
  }
  if (typeof entry.at !== "string" || entry.at.length === 0) return invalid("at must be a timestamp string");
  return undefined;
}

function checkSequence(entries: readonly unknown[]): LabelRejection | undefined {
  for (const [index, entry] of entries.entries()) {
    const problem = entryProblem(entry, index);
    if (problem) return problem;
    const { sequence } = entry as Record<string, unknown>;
    if (sequence !== index) {
      return reject("lineage_sequence", `lineage entry ${index} has sequence ${String(sequence)}`);
    }
  }
  return undefined;
}

function freezeLineage(entries: readonly LineageEntry[]): readonly LineageEntry[] {
  return Object.freeze(entries.map((entry) => Object.freeze(structuredClone(entry))));
}

/**
 * Returns `existing` followed by `additions`. Each entry's `sequence` must equal its
 * index, so additions continue the existing sequence and nothing can be inserted,
 * dropped or reordered. The inputs are not mutated.
 */
export function appendLineage(
  existing: readonly LineageEntry[],
  additions: readonly LineageEntry[],
): LabelResult<readonly LineageEntry[]> {
  const combined = [...existing, ...additions];
  if (combined.length === 0) return reject("invalid_lineage", "lineage is never empty");
  const problem = checkSequence(combined);
  if (problem) return problem;
  return accept(freezeLineage(combined));
}

/**
 * Accepts `after` only if it keeps every entry of `before`, unchanged and in order,
 * as a prefix, and its own sequence numbers are contiguous from zero.
 */
export function checkLineageAppendOnly(
  before: readonly LineageEntry[],
  after: readonly LineageEntry[],
): LabelResult<readonly LineageEntry[]> {
  if (after.length === 0) return reject("invalid_lineage", "lineage is never empty");
  const problem = checkSequence(before) ?? checkSequence(after);
  if (problem) return problem;
  if (after.length < before.length) {
    return reject("lineage_rewrite", `lineage shrank from ${before.length} to ${after.length} entries`);
  }
  for (const [index, entry] of before.entries()) {
    if (canonical(entry) !== canonical(after[index])) {
      return reject("lineage_rewrite", `lineage entry ${index} was changed`);
    }
  }
  return accept(freezeLineage(after));
}
