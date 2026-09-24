import type { ErrorObject } from "ajv";
import { evidenceBindings } from "./fixtures";
import { validateModelProposal as validateStructure } from "./generated/validators.js";
import { deepFreeze, safeJsonClone } from "./immutability";
import type {
  AnchorState,
  ComparisonState,
  ModelProposal,
  ModelProposalEntity,
  ProposalValidation,
  RecipeId,
  ResourceBudget,
  ValidationIssue,
  WeatherFixture,
  WeatherTimeId,
} from "./types";

export const MODEL_PROPOSAL_SCHEMA_ID = "https://eva.local/schemas/e1/model-proposal.schema.json";

const PROHIBITED_KEYS = new Set([
  "approved",
  "authority",
  "code",
  "command",
  "css",
  "html",
  "ipc",
  "javascript",
  "js",
  "permission",
  "permissions",
  "rawcode",
  "script",
  "shader",
  "shell",
  "trusted",
  "trustedenvelope",
  "verified",
]);

export interface ProposalContext {
  responseId: "response:e1-weather";
  revision: number;
  fixture: WeatherFixture | null;
  anchors: Readonly<Record<WeatherTimeId, AnchorState>>;
  comparison: ComparisonState | null;
  recipe: RecipeId;
  reducedMotion: boolean;
  plain: boolean;
  budget: ResourceBudget;
}

function issue(code: ValidationIssue["code"], path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function prohibitedFieldIssues(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const visit = (candidate: unknown, path: string) => {
    if (Array.isArray(candidate)) {
      candidate.forEach((child, index) => visit(child, `${path}/${index}`));
      return;
    }
    if (typeof candidate !== "object" || candidate === null) return;
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      const normalized = key.replaceAll(/[-_]/g, "").toLowerCase();
      if (PROHIBITED_KEYS.has(normalized)) {
        issues.push(issue("prohibited-field", `${path}/${key}`, `Field ${key} is host-only or executable`));
      }
      visit(child, `${path}/${key}`);
    }
  };
  visit(value, "");
  return issues;
}

function structuralIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) =>
    issue(
      "structure",
      error.instancePath || "/",
      `${error.keyword}: ${error.message ?? "proposal does not match the closed schema"}`,
    ),
  );
}

function entityCompatibilityIssues(
  entity: ModelProposalEntity,
  index: number,
  context: ProposalContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `/entities/${index}`;
  const bindings = context.fixture ? evidenceBindings(context.fixture) : new Map();
  const resolved = entity.dataRefs.map((ref) => bindings.get(ref));
  const known = resolved.filter((binding) => binding !== undefined);
  const fields = new Set(known.map((binding) => binding.field));
  const times = new Set(known.map((binding) => binding.time));

  if (known.some((binding) => binding.unit !== entity.unit)) {
    issues.push(issue("unit-mismatch", `${path}/unit`, "Entity unit does not match all bound evidence"));
  }
  if (!times.has(entity.anchor.targetId)) {
    issues.push(
      issue("anchor-mismatch", `${path}/anchor/targetId`, "Anchor target is not represented by the entity evidence"),
    );
  }

  const hostAnchor = context.anchors[entity.anchor.targetId];
  if (
    hostAnchor &&
    (hostAnchor.pinned || hostAnchor.userMoved) &&
    (Math.abs(hostAnchor.x - entity.anchor.x) > 0.000001 ||
      Math.abs(hostAnchor.y - entity.anchor.y) > 0.000001)
  ) {
    issues.push(
      issue("anchor-conflict", `${path}/anchor`, "Proposal conflicts with pinned or directly moved host geometry"),
    );
  }

  const hasCount = entity.count !== undefined;
  switch (entity.primitive) {
    case "dither-field":
      if (
        entity.id !== "field:primary" ||
        entity.dataRefs.length !== 1 ||
        fields.size !== 1 ||
        !fields.has("temperature") ||
        !hasCount
      ) {
        issues.push(
          issue(
            "primitive-incompatibility",
            path,
            "dither-field requires field:primary, one temperature reference, and a count",
          ),
        );
      }
      break;
    case "occlusion-layer":
      if (
        entity.id !== "occlusion:primary" ||
        entity.dataRefs.length !== 1 ||
        fields.size !== 1 ||
        !fields.has("cloudCover") ||
        !hasCount
      ) {
        issues.push(
          issue(
            "primitive-incompatibility",
            path,
            "occlusion-layer requires occlusion:primary, one cloud-cover reference, and a count",
          ),
        );
      }
      break;
    case "fact-anchor":
      if (
        entity.id !== `fact:${entity.anchor.targetId}` ||
        entity.dataRefs.length !== 1 ||
        hasCount
      ) {
        issues.push(
          issue(
            "primitive-incompatibility",
            path,
            "fact-anchor requires the matching stable fact ID, one evidence reference, and no count",
          ),
        );
      }
      break;
    case "attention-link":
      if (entity.id !== "attention:primary" || entity.dataRefs.length !== 1 || hasCount) {
        issues.push(
          issue(
            "primitive-incompatibility",
            path,
            "attention-link requires attention:primary, one evidence reference, and no count",
          ),
        );
      }
      break;
    case "comparison-pair": {
      if (
        entity.id !== "comparison:pair" ||
        entity.dataRefs.length !== 2 ||
        fields.size !== 1 ||
        hasCount
      ) {
        issues.push(
          issue(
            "primitive-incompatibility",
            path,
            "comparison-pair requires two compatible references and no count",
          ),
        );
      }
      const expected = context.comparison
        ? new Set([context.comparison.first, context.comparison.second])
        : null;
      if (
        !expected ||
        times.size !== expected.size ||
        [...times].some((time) => !expected.has(time))
      ) {
        issues.push(
          issue("comparison-mismatch", `${path}/dataRefs`, "Comparison evidence does not match host scope"),
        );
      }
      break;
    }
  }
  return issues;
}

export function validateModelProposal(input: unknown, context: ProposalContext): ProposalValidation {
  const cloned = safeJsonClone(input);
  if (!cloned.ok) {
    return {
      valid: false,
      issues: [issue("structure", "/", cloned.message ?? "Proposal must be bounded JSON")],
    };
  }

  const prohibited = prohibitedFieldIssues(cloned.value);
  const structurallyValid = validateStructure(cloned.value);
  if (!structurallyValid || prohibited.length > 0) {
    return {
      valid: false,
      issues: deepFreeze([...prohibited, ...structuralIssues(validateStructure.errors)]),
    };
  }

  const proposal = cloned.value as ModelProposal;
  const issues: ValidationIssue[] = [];
  if (proposal.responseId !== context.responseId) {
    issues.push(issue("wrong-response", "/responseId", "Proposal targets another response"));
  }
  if (proposal.baseRevision !== context.revision) {
    issues.push(issue("stale-base", "/baseRevision", "Proposal base revision is stale"));
  }
  if (!context.fixture) {
    issues.push(issue("fixture-unavailable", "/evidenceRefs", "No current fixture can support this proposal"));
  }

  const bindings = context.fixture ? evidenceBindings(context.fixture) : new Map();
  for (const [index, ref] of proposal.evidenceRefs.entries()) {
    const binding = bindings.get(ref);
    if (!binding) {
      issues.push(issue("unknown-evidence", `/evidenceRefs/${index}`, "Evidence is not in the trusted fixture"));
    } else if (!binding.available) {
      issues.push(
        issue("unavailable-evidence", `/evidenceRefs/${index}`, "Evidence is explicitly unavailable"),
      );
    }
  }

  const listedRefs = new Set(proposal.evidenceRefs);
  const usedRefs = new Set<string>();
  const entityIds = new Set<string>();
  let elementCount = 0;
  let effectFields = 0;

  for (const [index, entity] of proposal.entities.entries()) {
    if (entityIds.has(entity.id)) {
      issues.push(issue("duplicate-entity", `/entities/${index}/id`, "Entity ID must be stable and unique"));
    }
    entityIds.add(entity.id);
    for (const ref of entity.dataRefs) {
      usedRefs.add(ref);
      if (!listedRefs.has(ref)) {
        issues.push(
          issue("unlisted-evidence", `/entities/${index}/dataRefs`, "Entity uses evidence absent from evidenceRefs"),
        );
      }
      const binding = bindings.get(ref);
      if (!binding) {
        issues.push(issue("unknown-evidence", `/entities/${index}/dataRefs`, "Entity evidence is unknown"));
      } else if (!binding.available) {
        issues.push(
          issue("unavailable-evidence", `/entities/${index}/dataRefs`, "Entity evidence is unavailable"),
        );
      }
    }
    if (entity.count !== undefined) elementCount += entity.count;
    if (entity.primitive === "dither-field" || entity.primitive === "occlusion-layer") effectFields += 1;
    issues.push(...entityCompatibilityIssues(entity, index, context));
  }

  for (const [index, ref] of proposal.evidenceRefs.entries()) {
    if (!usedRefs.has(ref)) {
      issues.push(issue("unused-evidence", `/evidenceRefs/${index}`, "Evidence reference is not used"));
    }
  }

  if (proposal.entities.length > context.budget.maxEntities) {
    issues.push(issue("entity-budget", "/entities", "Proposal exceeds the host entity budget"));
  }
  if (effectFields > context.budget.maxEffectFields) {
    issues.push(issue("effect-field-budget", "/entities", "Proposal exceeds the host effect-field budget"));
  }
  if (elementCount > context.budget.maxElementCount) {
    issues.push(issue("element-budget", "/entities", "Entity counts exceed the host element budget"));
  }
  if (elementCount > proposal.phaseRecipe.elementBudget) {
    issues.push(
      issue("element-budget", "/phaseRecipe/elementBudget", "Recipe budget is lower than entity counts"),
    );
  }
  if (proposal.phaseRecipe.elementBudget > context.budget.maxElementCount) {
    issues.push(
      issue("recipe-budget", "/phaseRecipe/elementBudget", "Recipe requests more elements than the host permits"),
    );
  }
  if (proposal.phaseRecipe.id !== context.recipe) {
    issues.push(
      issue("recipe-mismatch", "/phaseRecipe/id", "Proposal recipe conflicts with the host-selected recipe"),
    );
  }
  if ((context.reducedMotion || context.plain) && proposal.phaseRecipe.durationMs !== 0) {
    issues.push(
      issue("motion-mismatch", "/phaseRecipe/durationMs", "Suppressed-motion state requires zero duration"),
    );
  }
  if (proposal.phaseRecipe.durationMs > context.budget.maxTransitionDurationMs) {
    issues.push(
      issue("duration-budget", "/phaseRecipe/durationMs", "Recipe duration exceeds the host limit"),
    );
  }

  const comparisonEntities = proposal.entities.filter((entity) => entity.primitive === "comparison-pair");
  if (
    (proposal.intent === "invite-comparison" && comparisonEntities.length !== 1) ||
    (proposal.intent !== "invite-comparison" && comparisonEntities.length > 0)
  ) {
    issues.push(
      issue("comparison-mismatch", "/intent", "Comparison intent and comparison entity must agree"),
    );
  }

  if (issues.length > 0) return { valid: false, issues: deepFreeze(issues) };
  return {
    valid: true,
    proposal: deepFreeze(proposal) as Readonly<ModelProposal>,
    issues: deepFreeze([] as ValidationIssue[]),
  };
}
