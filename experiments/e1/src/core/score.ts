import { evidenceRef, recordAt } from "./fixtures";
import { deepFreeze } from "./immutability";
import type {
  AnchorState,
  ComparisonState,
  ModelProposal,
  ModelProposalEntity,
  RecipeId,
  WeatherFixture,
  WeatherTimeId,
} from "./types";

export const RECIPE_DURATIONS: Readonly<Record<RecipeId, number>> = Object.freeze({
  "part-and-relate": 900,
  "withdraw-and-reanchor": 720,
});

export function createDefaultAnchors(): Record<WeatherTimeId, AnchorState> {
  return {
    "09:00": { id: "09:00", x: 0.24, y: 0.62, pinned: false, userMoved: false },
    "12:00": { id: "12:00", x: 0.5, y: 0.4, pinned: false, userMoved: false },
    "15:00": { id: "15:00", x: 0.76, y: 0.62, pinned: false, userMoved: false },
  };
}

export interface AuthoredScoreContext {
  revision: number;
  selected: WeatherTimeId;
  comparison: ComparisonState | null;
  anchors: Readonly<Record<WeatherTimeId, AnchorState>>;
  fixture: WeatherFixture;
  recipe: RecipeId;
  reducedMotion: boolean;
  plain: boolean;
}

function scoreAnchor(context: AuthoredScoreContext, targetId: WeatherTimeId) {
  const anchor = context.anchors[targetId];
  return { targetId, x: anchor.x, y: anchor.y };
}

export function composeAuthoredScore(context: AuthoredScoreContext): Readonly<ModelProposal> {
  const selectedRecord = recordAt(context.fixture, context.selected);
  const temperatureRef = evidenceRef(context.selected, "temperature");
  const entities: ModelProposalEntity[] = [
    {
      id: `fact:${context.selected}`,
      primitive: "fact-anchor",
      dataRefs: [temperatureRef],
      unit: "°C",
      anchor: scoreAnchor(context, context.selected),
    },
    {
      id: "field:primary",
      primitive: "dither-field",
      dataRefs: [temperatureRef],
      unit: "°C",
      anchor: scoreAnchor(context, context.selected),
      count: 1200,
    },
  ];

  if (selectedRecord.cloudCover.status === "available") {
    entities.push({
      id: "occlusion:primary",
      primitive: "occlusion-layer",
      dataRefs: [evidenceRef(context.selected, "cloudCover")],
      unit: "%",
      anchor: scoreAnchor(context, context.selected),
      count: Math.max(80, Math.round(selectedRecord.cloudCover.value * 8)),
    });
  }

  if (context.comparison) {
    const firstRef = evidenceRef(context.comparison.first, "temperature");
    const secondRef = evidenceRef(context.comparison.second, "temperature");
    entities.push({
      id: "comparison:pair",
      primitive: "comparison-pair",
      dataRefs: [firstRef, secondRef],
      unit: "°C",
      anchor: scoreAnchor(context, context.selected),
    });
  }

  const evidenceRefs = [...new Set(entities.flatMap((entity) => entity.dataRefs))];
  const elementBudget = entities.reduce((total, entity) => total + (entity.count ?? 0), 0);
  const durationMs = context.reducedMotion || context.plain ? 0 : RECIPE_DURATIONS[context.recipe];

  return deepFreeze({
    schemaVersion: "e1.response-score-proposal/1",
    responseId: "response:e1-weather",
    baseRevision: context.revision,
    evidenceRefs,
    intent: context.comparison
      ? "invite-comparison"
      : context.revision <= 1
        ? "orient"
        : "reconsider",
    entities,
    phaseRecipe: {
      id: context.recipe,
      durationMs,
      elementBudget,
    },
  }) as Readonly<ModelProposal>;
}
