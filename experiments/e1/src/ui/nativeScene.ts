import { E1Controller, E1_DEFAULT_FIXTURE, TIME_IDS, type E1Snapshot, type WeatherFixture } from "../core";
import type { MaterialScene, MaterialSceneInput, MaterialStatus } from "../native";
import type { RendererStats } from "./render";

export type NativeRendererSettings = MaterialSceneInput["renderer"];

export const INITIAL_RENDERER: NativeRendererSettings = {
  kind: "canvas2d", requestedPointCount: 2000, simulatedFailure: null,
  benchmark: { runId: null, active: false, durationMs: null },
};

export const EMPTY_RENDERER_STATS: RendererStats = {
  renderer: "canvas2d", drawCount: 0, pointCount: 0, requestedCount: 2000,
  lastFrameMs: 0, framesRendered: 0, settled: true, contextLost: false, forcedContinuous: false,
};

export function sceneFromSnapshot(
  snapshot: Readonly<E1Snapshot>, renderer: NativeRendererSettings, sceneSequence: number,
): MaterialSceneInput {
  return {
    schemaVersion: "e1.material-scene/1", sceneSequence,
    responseId: snapshot.responseId, revision: snapshot.revision, generation: snapshot.generation,
    fixtureId: snapshot.fixture?.fixtureId ?? null, seed: snapshot.fixture?.seed ?? null,
    status: snapshot.status, selected: snapshot.selected, comparison: snapshot.comparison,
    anchors: TIME_IDS.map((time) => ({ ...snapshot.anchors[time] })),
    records: snapshot.fixture?.records.map((record) => ({
      id: record.id, temperatureC: record.temperature.value,
      cloudCoverPercent: record.cloudCover.status === "available" ? record.cloudCover.value : null,
      precipitationProbabilityPercent: record.precipitationProbability.value, windKmh: record.wind.value,
    })) ?? [],
    recipe: snapshot.recipe, reducedMotion: snapshot.reducedMotion, plain: snapshot.plain,
    transition: {
      id: snapshot.transition.id, status: snapshot.transition.status,
      durationMs: snapshot.transition.durationMs, fromRevision: snapshot.transition.fromRevision,
      toRevision: snapshot.transition.toRevision,
    },
    renderer,
  };
}

const EMPTY_SNAPSHOT = new E1Controller().getSnapshot();

// This projection is render-only: it contains no controller authority, event
// history, model proposals, or commands. The native host validated the scene.
export function snapshotFromScene(scene: MaterialScene): Readonly<E1Snapshot> {
  const records = scene.records.map((record) => ({
    id: record.id, localTime: record.id,
    temperature: { value: record.temperatureC, unit: "°C" as const },
    cloudCover: record.cloudCoverPercent === null
      ? { status: "unavailable" as const, unit: "%" as const }
      : { status: "available" as const, value: record.cloudCoverPercent, unit: "%" as const },
    precipitationProbability: { value: record.precipitationProbabilityPercent, unit: "%" as const },
    wind: { value: record.windKmh, unit: "km/h" as const },
  }));
  const fixture: WeatherFixture | null = scene.fixtureId ? {
    ...E1_DEFAULT_FIXTURE, records: records as unknown as WeatherFixture["records"],
  } : null;
  return {
    ...EMPTY_SNAPSHOT,
    responseId: scene.responseId, revision: scene.revision, generation: scene.generation,
    token: `e1-token-${scene.generation}`, fixture,
    selected: scene.selected, comparison: scene.comparison,
    anchors: Object.fromEntries(scene.anchors.map((anchor) => [anchor.id, anchor])) as E1Snapshot["anchors"],
    status: scene.status, recipe: scene.recipe, reducedMotion: scene.reducedMotion, plain: scene.plain,
    transition: { ...scene.transition, recipe: scene.recipe, token: `e1-token-${scene.generation}` },
  };
}

export function isCurrentMaterialStatus(status: MaterialStatus, scene: MaterialSceneInput | null, sessionId: string | null): boolean {
  return !!scene && status.controllerSessionId === sessionId && status.sceneSequence === scene.sceneSequence && status.responseId === scene.responseId &&
    status.revision === scene.revision && status.transitionId === scene.transition.id;
}

export function rendererStatsFromStatus(status: MaterialStatus): RendererStats {
  const { requestedPointCount, benchmark: _benchmark, ...stats } = status.stats;
  return { ...stats, requestedCount: requestedPointCount };
}
