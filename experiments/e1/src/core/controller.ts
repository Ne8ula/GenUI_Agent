import {
  COMPLETE_WEATHER_FIXTURE,
  TRUSTED_HOST_ENVELOPE,
  fixtureForVariant,
  isWeatherTimeId,
} from "./fixtures";
import { clampNormalized, deepFreeze, safeJsonClone } from "./immutability";
import { composeAuthoredScore, createDefaultAnchors } from "./score";
import type {
  AnchorState,
  ControllerEvent,
  DelayedScorePatch,
  E1ControllerOptions,
  E1Snapshot,
  EventReason,
  FixtureVariant,
  ModelProposal,
  NormalizedPoint,
  RecipeId,
  ResponsePhase,
  ScoreDecision,
  TransitionState,
  ValidationIssue,
  WeatherTimeId,
} from "./types";
import { E1_RESOURCE_BUDGET } from "./types";
import { validateModelProposal } from "./validation";

interface EventDraft {
  type: ControllerEvent["type"];
  entityId?: WeatherTimeId;
  reason?: EventReason;
}

const RESPONSE_ID = "response:e1-weather" as const;
const DEFAULT_TRACE_LIMIT = 128;
const MAX_QUEUED_PATCHES = 8;

function tokenFor(generation: number): string {
  return `e1-token-${generation}`;
}

function idleTransition(recipe: RecipeId, generation: number, revision: number): TransitionState {
  return {
    id: `transition:${generation}:${revision}`,
    status: "idle",
    recipe,
    durationMs: 0,
    token: tokenFor(generation),
    fromRevision: revision,
    toRevision: revision,
  };
}

function sanitizeLocation(location: string | undefined): string {
  if (location === undefined) return "NYC";
  const sanitized = location.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80);
  return sanitized || "Unspecified location";
}

function isSupportedLocation(location: string): boolean {
  const normalized = location.toLowerCase().replaceAll(".", "").replaceAll(/\s+/g, " ").trim();
  return normalized === "nyc" || normalized === "new york city";
}

function isFixtureVariant(value: unknown): value is FixtureVariant {
  return value === "complete" || value === "missing-cloud";
}

function staleIssue(message: string): ValidationIssue {
  return { code: "stale-base", path: "/", message };
}

export class E1Controller {
  private snapshot: Readonly<E1Snapshot>;
  private readonly listeners = new Set<() => void>();
  private readonly traceLimit: number;
  private eventSequence = 0;
  private patchSequence = 0;
  private readonly issuedPatches = new Map<string, DelayedScorePatch>();

  constructor(options: E1ControllerOptions = {}) {
    const requestedLimit = options.traceLimit ?? DEFAULT_TRACE_LIMIT;
    this.traceLimit = Math.max(1, Math.min(256, Math.floor(requestedLimit)));
    const recipe: RecipeId = "part-and-relate";
    this.snapshot = deepFreeze({
      responseId: RESPONSE_ID,
      revision: 0,
      generation: 0,
      token: tokenFor(0),
      selected: "12:00",
      comparison: null,
      anchors: createDefaultAnchors(),
      focus: null,
      fixture: null,
      fixtureVariant: null,
      requestedLocation: null,
      status: "idle",
      error: null,
      recipe,
      reducedMotion: false,
      plain: false,
      phase: "idle",
      transition: idleTransition(recipe, 0, 0),
      activeScore: null,
      scoreStatus: { state: "none" },
      host: null,
      events: [],
      traceDropped: 0,
    }) as Readonly<E1Snapshot>;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Readonly<E1Snapshot> => this.snapshot;

  request(location?: string, variant: FixtureVariant = "complete"): boolean {
    const requestedLocation = sanitizeLocation(location);
    const validLocation = isSupportedLocation(requestedLocation);
    const validVariant = isFixtureVariant(variant);
    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;

    if (!validLocation || !validVariant) {
      const reason: EventReason = validLocation ? "unsupported-variant" : "unsupported-location";
      const code = validLocation ? "invalid-variant" : "invalid-location";
      const next: E1Snapshot = {
        ...this.snapshot,
        revision,
        generation,
        token: tokenFor(generation),
        requestedLocation,
        status: "unavailable",
        error: {
          code,
          requestedLocation,
          message: validLocation
            ? "The requested fixture variant is unavailable."
            : `No synthetic fixture is available for ${requestedLocation}.`,
          retainedFixtureId: this.snapshot.fixture?.fixtureId ?? null,
        },
        phase: "expose",
        transition: {
          ...idleTransition(this.snapshot.recipe, generation, revision),
          status: "settled",
          fromRevision,
        },
        activeScore: null,
        scoreStatus: { state: "none" },
      };
      this.publish(next, [
        { type: "request", reason },
        { type: "request_unavailable", reason },
      ]);
      return false;
    }

    const fixture = fixtureForVariant(variant);
    const nextBase: E1Snapshot = {
      ...this.snapshot,
      revision,
      generation,
      token: tokenFor(generation),
      fixture,
      fixtureVariant: variant,
      requestedLocation,
      status: "ready",
      error: null,
      focus: this.snapshot.selected,
      host: TRUSTED_HOST_ENVELOPE,
      phase: "propose",
      transition: idleTransition(this.snapshot.recipe, generation, revision),
      activeScore: null,
      scoreStatus: { state: "none" },
    };
    const desiredPhase: ResponsePhase =
      this.snapshot.status === "idle" || this.snapshot.status === "dismissed" ? "propose" : "reconsider";
    const next = this.withAuthoredExpression(nextBase, fromRevision, desiredPhase);
    this.publish(next, [
      { type: "request", reason: "supported-request" },
      { type: "fact_exposed", reason: "supported-request" },
      this.transitionEvent(next, "authored-score"),
    ]);
    return true;
  }

  select(time: WeatherTimeId): boolean {
    if (this.snapshot.status !== "ready" || !isWeatherTimeId(time) || time === this.snapshot.selected) {
      return false;
    }
    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    const comparison = this.snapshot.comparison
      ? { first: "12:00" as const, second: time === "12:00" ? ("15:00" as const) : time }
      : null;
    const next = this.withAuthoredExpression(
      {
        ...this.snapshot,
        revision,
        generation,
        token: tokenFor(generation),
        selected: time,
        comparison,
        focus: time,
      },
      fromRevision,
      "attend",
    );
    this.publish(next, [
      { type: "selection_changed", entityId: time, reason: "user-selection" },
      this.transitionEvent(next, "user-selection"),
    ]);
    return true;
  }

  move(time: WeatherTimeId, point: NormalizedPoint): boolean {
    if (this.snapshot.status !== "ready" || !isWeatherTimeId(time)) return false;
    const x = clampNormalized(point.x);
    const y = clampNormalized(point.y);
    const current = this.snapshot.anchors[time];
    if (current.x === x && current.y === y && current.userMoved) return false;

    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    const anchor: AnchorState = { ...current, x, y, userMoved: true };
    const next = this.withAuthoredExpression(
      {
        ...this.snapshot,
        revision,
        generation,
        token: tokenFor(generation),
        anchors: { ...this.snapshot.anchors, [time]: anchor },
        focus: time,
      },
      fromRevision,
      "attend",
      360,
    );
    this.publish(next, [
      { type: "anchor_moved", entityId: time, reason: "local-manipulation" },
      this.transitionEvent(next, "local-manipulation"),
    ]);
    return true;
  }

  pin(time: WeatherTimeId, pinned: boolean): boolean {
    if (this.snapshot.status !== "ready" || !isWeatherTimeId(time)) return false;
    const current = this.snapshot.anchors[time];
    if (current.pinned === pinned) return false;

    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    const next = this.withAuthoredExpression(
      {
        ...this.snapshot,
        revision,
        generation,
        token: tokenFor(generation),
        anchors: { ...this.snapshot.anchors, [time]: { ...current, pinned } },
        focus: time,
      },
      fromRevision,
      "attend",
      360,
    );
    this.publish(next, [
      { type: "pin_changed", entityId: time, reason: "user-pin" },
      this.transitionEvent(next, "user-pin"),
    ]);
    return true;
  }

  compare(): boolean {
    if (this.snapshot.status !== "ready") return false;
    const second = this.snapshot.selected === "12:00" ? "15:00" : this.snapshot.selected;
    const comparison = { first: "12:00" as const, second };
    if (
      this.snapshot.comparison?.first === comparison.first &&
      this.snapshot.comparison.second === comparison.second
    ) {
      return false;
    }

    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    const next = this.withAuthoredExpression(
      {
        ...this.snapshot,
        revision,
        generation,
        token: tokenFor(generation),
        comparison,
      },
      fromRevision,
      "reconsider",
    );
    this.publish(next, [
      { type: "comparison_changed", entityId: second, reason: "user-comparison" },
      this.transitionEvent(next, "user-comparison"),
    ]);
    return true;
  }

  stop(): boolean {
    if (this.snapshot.status !== "ready") return false;
    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    const next: E1Snapshot = {
      ...this.snapshot,
      revision,
      generation,
      token: tokenFor(generation),
      phase: this.snapshot.plain ? "plain" : "inhabit",
      transition: {
        ...this.snapshot.transition,
        id: `transition:${generation}:${revision}`,
        status: "interrupted",
        durationMs: 0,
        token: tokenFor(generation),
        fromRevision,
        toRevision: revision,
      },
      scoreStatus: { state: "interrupted" },
    };
    this.publish(next, [{ type: "transition_interrupted", reason: "user-stop" }]);
    return true;
  }

  setReducedMotion(reducedMotion: boolean): boolean {
    if (this.snapshot.reducedMotion === reducedMotion) return false;
    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    let next: E1Snapshot = {
      ...this.snapshot,
      revision,
      generation,
      token: tokenFor(generation),
      reducedMotion,
    };
    if (next.status === "ready" && next.fixture) {
      next = this.withAuthoredExpression(next, fromRevision, "reconsider");
    } else {
      next.transition = idleTransition(next.recipe, generation, revision);
    }
    this.publish(next, [
      { type: "reduced_motion_changed", reason: "reduced-motion" },
      ...(next.status === "ready" ? [this.transitionEvent(next, "reduced-motion")] : []),
    ]);
    return true;
  }

  setPlain(plain: boolean): boolean {
    if (this.snapshot.plain === plain) return false;
    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    let next: E1Snapshot = {
      ...this.snapshot,
      revision,
      generation,
      token: tokenFor(generation),
      plain,
    };
    if (next.status === "ready" && next.fixture) {
      next = this.withAuthoredExpression(next, fromRevision, plain ? "plain" : "reconsider");
    } else {
      next.phase = plain ? "plain" : next.phase;
      next.transition = idleTransition(next.recipe, generation, revision);
    }
    this.publish(next, [
      { type: "plain_answer_changed", reason: "plain-answer" },
      ...(next.status === "ready" ? [this.transitionEvent(next, "plain-answer")] : []),
    ]);
    return true;
  }

  setRecipe(recipe: RecipeId): boolean {
    if (this.snapshot.recipe === recipe) return false;
    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    let next: E1Snapshot = {
      ...this.snapshot,
      revision,
      generation,
      token: tokenFor(generation),
      recipe,
    };
    if (next.status === "ready" && next.fixture) {
      next = this.withAuthoredExpression(next, fromRevision, "reconsider");
    } else {
      next.transition = idleTransition(recipe, generation, revision);
    }
    this.publish(next, [
      { type: "recipe_changed", reason: "recipe-change" },
      ...(next.status === "ready" ? [this.transitionEvent(next, "recipe-change")] : []),
    ]);
    return true;
  }

  completeTransition(): boolean {
    if (this.snapshot.transition.status !== "active") return false;
    const next: E1Snapshot = {
      ...this.snapshot,
      phase: this.snapshot.plain ? "plain" : "inhabit",
      transition: { ...this.snapshot.transition, status: "settled", durationMs: 0 },
    };
    this.publish(next, [{ type: "transition_settled", reason: "manual-settle" }]);
    return true;
  }

  dismiss(): boolean {
    if (this.snapshot.status === "dismissed") return false;
    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const generation = this.snapshot.generation + 1;
    const next: E1Snapshot = {
      ...this.snapshot,
      revision,
      generation,
      token: tokenFor(generation),
      comparison: null,
      focus: null,
      fixture: null,
      fixtureVariant: null,
      requestedLocation: null,
      status: "dismissed",
      error: null,
      phase: "dissolved",
      transition: {
        ...idleTransition(this.snapshot.recipe, generation, revision),
        status: "dismissed",
        fromRevision,
      },
      activeScore: null,
      scoreStatus: { state: "none" },
      host: null,
    };
    this.publish(next, [{ type: "dismissed", reason: "dismissed-response" }]);
    return true;
  }

  proposeScore(): Readonly<ModelProposal> | null {
    if (this.snapshot.status !== "ready" || !this.snapshot.fixture) return null;
    const proposal = composeAuthoredScore({
      revision: this.snapshot.revision,
      selected: this.snapshot.selected,
      comparison: this.snapshot.comparison,
      anchors: this.snapshot.anchors,
      fixture: this.snapshot.fixture,
      recipe: this.snapshot.recipe,
      reducedMotion: this.snapshot.reducedMotion,
      plain: this.snapshot.plain,
    });
    this.publish(this.snapshot, [{ type: "score_proposed", reason: "authored-score" }]);
    return proposal;
  }

  acceptScore(input: unknown): ScoreDecision {
    const validation = validateModelProposal(input, {
      responseId: RESPONSE_ID,
      revision: this.snapshot.revision,
      fixture: this.snapshot.status === "ready" ? this.snapshot.fixture : null,
      anchors: this.snapshot.anchors,
      comparison: this.snapshot.comparison,
      recipe: this.snapshot.recipe,
      reducedMotion: this.snapshot.reducedMotion,
      plain: this.snapshot.plain,
      budget: E1_RESOURCE_BUDGET,
    });

    if (!validation.valid || !validation.proposal) {
      const hadScore = this.snapshot.activeScore !== null;
      const authored = this.snapshot.scoreStatus.state === "active" &&
        this.snapshot.scoreStatus.origin === "authored-controller";
      const next: E1Snapshot = {
        ...this.snapshot,
        scoreStatus: {
          state: "rejected",
          issueCodes: validation.issues.map((item) => item.code),
        },
      };
      this.publish(next, [{ type: "score_rejected", reason: "invalid-score" }]);
      return {
        accepted: false,
        revision: this.snapshot.revision,
        fallback: authored
          ? "retained-authored-score"
          : hadScore
            ? "retained-current-score"
            : "none",
        issues: validation.issues,
      };
    }

    const fromRevision = this.snapshot.revision;
    const revision = fromRevision + 1;
    const proposal = validation.proposal;
    const durationMs = this.snapshot.reducedMotion || this.snapshot.plain
      ? 0
      : proposal.phaseRecipe.durationMs;
    const transition: TransitionState = {
      id: `transition:${this.snapshot.generation}:${revision}`,
      status: durationMs > 0 ? "active" : "settled",
      recipe: proposal.phaseRecipe.id,
      durationMs,
      token: this.snapshot.token,
      fromRevision,
      toRevision: revision,
    };
    const next: E1Snapshot = {
      ...this.snapshot,
      revision,
      activeScore: proposal,
      scoreStatus: { state: "active", origin: "accepted-proposal" },
      transition,
      phase: this.snapshot.plain ? "plain" : durationMs > 0 ? "reconsider" : "inhabit",
    };
    this.publish(next, [
      { type: "score_accepted", reason: "accepted-score" },
      this.transitionEvent(next, "accepted-score"),
    ]);
    return { accepted: true, revision, fallback: "none", issues: [] };
  }

  createDelayedPatch(proposal?: unknown): DelayedScorePatch | null {
    const candidate = proposal === undefined ? this.proposeScore() : proposal;
    if (candidate === null) return null;
    const cloned = safeJsonClone(candidate);
    const id = `delayed:${++this.patchSequence}`;
    const patch = deepFreeze({
      id,
      kind: "e1-delayed-score-patch",
      responseId: RESPONSE_ID,
      baseRevision: this.snapshot.revision,
      generation: this.snapshot.generation,
      token: this.snapshot.token,
      proposal: cloned.ok ? cloned.value : null,
    }) as DelayedScorePatch;

    if (this.issuedPatches.size >= MAX_QUEUED_PATCHES) {
      const oldest = this.issuedPatches.keys().next().value as string | undefined;
      if (oldest) this.issuedPatches.delete(oldest);
    }
    this.issuedPatches.set(id, patch);
    this.publish(this.snapshot, [{ type: "delayed_patch_queued", reason: "queued-test-patch" }]);
    return patch;
  }

  deliverDelayedPatch(patch: unknown): ScoreDecision {
    const candidate =
      typeof patch === "object" && patch !== null && "id" in patch
        ? this.issuedPatches.get(String((patch as { id: unknown }).id))
        : undefined;
    if (!candidate || candidate !== patch) {
      const issues = [{ code: "structure" as const, path: "/", message: "Patch was not issued by this controller" }];
      this.publish(this.snapshot, [{ type: "late_result_rejected", reason: "unissued-patch" }]);
      return {
        accepted: false,
        revision: this.snapshot.revision,
        fallback: this.snapshot.activeScore ? "retained-current-score" : "none",
        issues,
      };
    }
    this.issuedPatches.delete(candidate.id);

    const stale =
      this.snapshot.status === "dismissed" ||
      candidate.responseId !== this.snapshot.responseId ||
      candidate.baseRevision !== this.snapshot.revision ||
      candidate.generation !== this.snapshot.generation ||
      candidate.token !== this.snapshot.token;
    if (stale) {
      const issues = [staleIssue("Delayed patch belongs to a superseded or dismissed context")];
      this.publish(this.snapshot, [
        {
          type: "late_result_rejected",
          reason: this.snapshot.status === "dismissed" ? "dismissed-response" : "stale-context",
        },
      ]);
      return {
        accepted: false,
        revision: this.snapshot.revision,
        fallback: this.snapshot.activeScore ? "retained-current-score" : "none",
        issues,
      };
    }
    return this.acceptScore(candidate.proposal);
  }

  private withAuthoredExpression(
    state: E1Snapshot,
    fromRevision: number,
    desiredPhase: ResponsePhase,
    maximumDuration?: number,
  ): E1Snapshot {
    if (!state.fixture || state.status !== "ready") return state;
    const activeScore = composeAuthoredScore({
      revision: state.revision,
      selected: state.selected,
      comparison: state.comparison,
      anchors: state.anchors,
      fixture: state.fixture,
      recipe: state.recipe,
      reducedMotion: state.reducedMotion,
      plain: state.plain,
    });
    const authoredDuration = activeScore.phaseRecipe.durationMs;
    const durationMs = maximumDuration === undefined
      ? authoredDuration
      : Math.min(authoredDuration, maximumDuration);
    const status = durationMs > 0 ? "active" : "settled";
    return {
      ...state,
      activeScore,
      scoreStatus: { state: "active", origin: "authored-controller" },
      transition: {
        id: `transition:${state.generation}:${state.revision}`,
        status,
        recipe: state.recipe,
        durationMs,
        token: state.token,
        fromRevision,
        toRevision: state.revision,
      },
      phase: state.plain ? "plain" : status === "active" ? desiredPhase : "inhabit",
    };
  }

  private transitionEvent(state: E1Snapshot, reason: EventReason): EventDraft {
    return state.transition.status === "active"
      ? { type: "transition_started", reason }
      : { type: "transition_settled", reason };
  }

  private publish(state: Readonly<E1Snapshot>, drafts: readonly EventDraft[]): void {
    const generated = drafts.map((draft): ControllerEvent => {
      const sequence = ++this.eventSequence;
      return {
        sequence,
        monotonicMs: sequence * 10,
        type: draft.type,
        responseId: RESPONSE_ID,
        revision: state.revision,
        generation: state.generation,
        fixtureId: state.fixture?.fixtureId ?? null,
        ...(draft.entityId ? { entityId: draft.entityId } : {}),
        ...(draft.reason ? { reason: draft.reason } : {}),
      };
    });
    const allEvents = [...this.snapshot.events, ...generated];
    const droppedNow = Math.max(0, allEvents.length - this.traceLimit);
    const next: E1Snapshot = {
      ...state,
      events: allEvents.slice(-this.traceLimit),
      traceDropped: this.snapshot.traceDropped + droppedNow,
    };
    this.snapshot = deepFreeze(next) as Readonly<E1Snapshot>;
    for (const listener of [...this.listeners]) listener();
  }
}

export const E1_DEFAULT_FIXTURE = COMPLETE_WEATHER_FIXTURE;
