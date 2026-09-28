export const TIME_IDS = ["09:00", "12:00", "15:00"] as const;

export type WeatherTimeId = (typeof TIME_IDS)[number];
export type FixtureVariant = "complete" | "missing-cloud";
export type WeatherUnit = "°C" | "%" | "km/h";
export type WeatherField =
  | "temperature"
  | "cloudCover"
  | "precipitationProbability"
  | "wind";
export type RecipeId = "part-and-relate" | "withdraw-and-reanchor";
export type ScoreIntent = "orient" | "invite-comparison" | "reconsider" | "settle";
export type PrimitiveId =
  | "fact-anchor"
  | "dither-field"
  | "occlusion-layer"
  | "attention-link"
  | "comparison-pair";

export interface Measurement {
  value: number;
  unit: WeatherUnit;
}

export type CloudMeasurement =
  | { status: "available"; value: number; unit: "%" }
  | { status: "unavailable"; unit: "%" };

export interface WeatherRecord {
  id: WeatherTimeId;
  localTime: WeatherTimeId;
  temperature: Measurement & { unit: "°C" };
  cloudCover: CloudMeasurement;
  precipitationProbability: Measurement & { unit: "%" };
  wind: Measurement & { unit: "km/h" };
}

export interface WeatherFixture {
  schemaVersion: "e1.weather-fixture/1";
  fixtureId: "W-NYC-01";
  revision: 1;
  location: {
    id: "nyc";
    label: "New York City";
    timezone: "America/New_York";
  };
  date: "2026-10-14";
  asOfLocal: "08:00";
  source: {
    kind: "synthetic";
    label: "EVA invented E1 weather fixture — not live weather";
  };
  seed: "W-NYC-01-r1-seed-20261014";
  records: readonly [WeatherRecord, WeatherRecord, WeatherRecord];
}

export type ForecastDay = "today" | "tomorrow";

export interface DailyForecast {
  schemaVersion: "e1.daily-forecast/1";
  fixtureId: "W-NYC-02";
  revision: 1;
  scenarioDate: "2026-10-14";
  asOfLocal: "2026-10-14T08:00:00-04:00";
  location: WeatherFixture["location"];
  source: { kind: "synthetic"; label: "EVA invented E1 daily weather fixture — not live weather" };
  units: { temperature: "°C"; precipitationProbability: "%"; wind: "km/h" };
  day: ForecastDay;
  date: "2026-10-14" | "2026-10-15";
  condition: "sunny" | "rainy";
  temperatureC: number;
  precipitationProbabilityPercent: number;
  windKmh: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface AnchorState extends NormalizedPoint {
  id: WeatherTimeId;
  pinned: boolean;
  userMoved: boolean;
}

export interface ModelProposalEntity {
  id:
    | "field:primary"
    | "occlusion:primary"
    | "attention:primary"
    | "comparison:pair"
    | `fact:${WeatherTimeId}`;
  primitive: PrimitiveId;
  dataRefs: readonly string[];
  unit: WeatherUnit;
  anchor: NormalizedPoint & { targetId: WeatherTimeId };
  count?: number;
}

export interface ModelProposal {
  schemaVersion: "e1.response-score-proposal/1";
  responseId: "response:e1-weather";
  baseRevision: number;
  evidenceRefs: readonly string[];
  intent: ScoreIntent;
  entities: readonly ModelProposalEntity[];
  phaseRecipe: {
    id: RecipeId;
    durationMs: number;
    elementBudget: number;
  };
}

export interface ResourceBudget {
  maxEntities: 5;
  maxEffectFields: 2;
  maxElementCount: 2000;
  maxTransitionDurationMs: 1200;
}

export const E1_RESOURCE_BUDGET: ResourceBudget = Object.freeze({
  maxEntities: 5,
  maxEffectFields: 2,
  maxElementCount: 2000,
  maxTransitionDurationMs: 1200,
});

export interface TrustedHostEnvelope {
  sourceKind: "synthetic";
  evidenceStatus: "shape-and-semantics-validated";
  confidentiality: "public";
  fixtureId: "W-NYC-01";
  fixtureRevision: 1;
  seed: "W-NYC-01-r1-seed-20261014";
  budget: ResourceBudget;
}

export type RequestStatus = "idle" | "ready" | "unavailable" | "dismissed";
export type ResponsePhase =
  | "idle"
  | "expose"
  | "propose"
  | "attend"
  | "reconsider"
  | "inhabit"
  | "plain"
  | "dissolved";
export type TransitionStatus = "idle" | "active" | "settled" | "interrupted" | "dismissed";

export interface TransitionState {
  id: string;
  status: TransitionStatus;
  recipe: RecipeId;
  durationMs: number;
  token: string;
  fromRevision: number;
  toRevision: number;
}

export interface ComparisonState {
  first: WeatherTimeId;
  second: WeatherTimeId;
}

export interface ControllerError {
  code: "invalid-location" | "invalid-variant";
  requestedLocation: string;
  message: string;
  retainedFixtureId: "W-NYC-01" | "W-NYC-02" | null;
}

export type ScoreStatus =
  | { state: "none" }
  | { state: "active"; origin: "authored-controller" | "accepted-proposal" }
  | { state: "rejected"; issueCodes: readonly ValidationIssueCode[] }
  | { state: "interrupted" };

export type ControllerEventType =
  | "request"
  | "fact_exposed"
  | "request_unavailable"
  | "selection_changed"
  | "anchor_moved"
  | "pin_changed"
  | "comparison_changed"
  | "score_proposed"
  | "score_accepted"
  | "score_rejected"
  | "transition_started"
  | "transition_interrupted"
  | "transition_settled"
  | "reduced_motion_changed"
  | "plain_answer_changed"
  | "recipe_changed"
  | "delayed_patch_queued"
  | "late_result_rejected"
  | "dismissed";

export type EventReason =
  | "supported-request"
  | "unsupported-location"
  | "unsupported-variant"
  | "user-selection"
  | "local-manipulation"
  | "user-pin"
  | "user-comparison"
  | "authored-score"
  | "accepted-score"
  | "invalid-score"
  | "user-stop"
  | "reduced-motion"
  | "plain-answer"
  | "recipe-change"
  | "manual-settle"
  | "queued-test-patch"
  | "stale-context"
  | "dismissed-response"
  | "unissued-patch";

export interface ControllerEvent {
  sequence: number;
  monotonicMs: number;
  type: ControllerEventType;
  responseId: "response:e1-weather";
  revision: number;
  generation: number;
  fixtureId: "W-NYC-01" | "W-NYC-02" | null;
  entityId?: WeatherTimeId;
  reason?: EventReason;
}

export type ValidationIssueCode =
  | "structure"
  | "prohibited-field"
  | "wrong-response"
  | "stale-base"
  | "fixture-unavailable"
  | "unknown-evidence"
  | "unavailable-evidence"
  | "unlisted-evidence"
  | "unused-evidence"
  | "unit-mismatch"
  | "primitive-incompatibility"
  | "anchor-mismatch"
  | "anchor-conflict"
  | "duplicate-entity"
  | "entity-budget"
  | "effect-field-budget"
  | "element-budget"
  | "recipe-budget"
  | "recipe-mismatch"
  | "duration-budget"
  | "motion-mismatch"
  | "comparison-mismatch";

export interface ValidationIssue {
  code: ValidationIssueCode;
  path: string;
  message: string;
}

export interface ProposalValidation {
  valid: boolean;
  proposal?: Readonly<ModelProposal>;
  issues: readonly ValidationIssue[];
}

export interface ScoreDecision {
  accepted: boolean;
  revision: number;
  fallback: "retained-authored-score" | "retained-current-score" | "none";
  issues: readonly ValidationIssue[];
}

export interface DelayedScorePatch {
  readonly id: string;
  readonly kind: "e1-delayed-score-patch";
  readonly responseId: "response:e1-weather";
  readonly baseRevision: number;
  readonly generation: number;
  readonly token: string;
  readonly proposal: unknown;
}

export interface E1Snapshot {
  responseId: "response:e1-weather";
  revision: number;
  generation: number;
  token: string;
  selected: WeatherTimeId;
  comparison: ComparisonState | null;
  anchors: Readonly<Record<WeatherTimeId, AnchorState>>;
  focus: WeatherTimeId | null;
  fixture: WeatherFixture | null;
  /** Separate day-level evidence; never relabel the intraday fixture. */
  forecast: Readonly<DailyForecast> | null;
  fixtureVariant: FixtureVariant | null;
  requestedLocation: string | null;
  status: RequestStatus;
  error: ControllerError | null;
  recipe: RecipeId;
  reducedMotion: boolean;
  plain: boolean;
  phase: ResponsePhase;
  transition: TransitionState;
  activeScore: Readonly<ModelProposal> | null;
  scoreStatus: ScoreStatus;
  host: TrustedHostEnvelope | null;
  events: readonly ControllerEvent[];
  traceDropped: number;
}

export interface E1ControllerOptions {
  traceLimit?: number;
}
