import { describe, expect, it, vi } from "vitest";
import invalidLocationRequest from "../fixtures/invalid-location-request.json";
import {
  COMPLETE_WEATHER_FIXTURE,
  E1Controller,
  MISSING_CLOUD_WEATHER_FIXTURE,
  TIME_IDS,
} from "../src/core";

function mutable<T>(value: T): T {
  return structuredClone(value);
}

describe("E1 synthetic fixture", () => {
  it("preserves the exact W-NYC-01 revision 1 invented records and visible seed", () => {
    expect(COMPLETE_WEATHER_FIXTURE).toMatchObject({
      fixtureId: "W-NYC-01",
      revision: 1,
      location: {
        label: "New York City",
        timezone: "America/New_York",
      },
      date: "2026-10-14",
      asOfLocal: "08:00",
      source: { kind: "synthetic" },
      seed: "W-NYC-01-r1-seed-20261014",
    });
    expect(
      COMPLETE_WEATHER_FIXTURE.records.map((record) => ({
        id: record.id,
        temperature: record.temperature.value,
        cloud: record.cloudCover.status === "available" ? record.cloudCover.value : null,
        rain: record.precipitationProbability.value,
        wind: record.wind.value,
      })),
    ).toEqual([
      { id: "09:00", temperature: 18, cloud: 70, rain: 10, wind: 12 },
      { id: "12:00", temperature: 22, cloud: 20, rain: 5, wind: 18 },
      { id: "15:00", temperature: 21, cloud: 45, rain: 15, wind: 16 },
    ]);
    expect(TIME_IDS).toEqual(["09:00", "12:00", "15:00"]);
    expect(Object.isFrozen(COMPLETE_WEATHER_FIXTURE)).toBe(true);
  });

  it("changes only cloud availability in the missing-cloud variant", () => {
    const expected = mutable(COMPLETE_WEATHER_FIXTURE) as unknown as {
      records: Array<{ cloudCover: unknown }>;
    };
    for (const record of expected.records) {
      record.cloudCover = { status: "unavailable", unit: "%" };
    }
    expect(MISSING_CLOUD_WEATHER_FIXTURE).toEqual(expected);
  });
});

describe("E1Controller observable behavior", () => {
  it("exposes facts immediately with a deterministic authored score and stable snapshot identity", () => {
    const controller = new E1Controller();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    const initial = controller.getSnapshot();
    expect(controller.getSnapshot()).toBe(initial);

    expect(controller.request()).toBe(true);
    const ready = controller.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(ready).not.toBe(initial);
    expect(controller.getSnapshot()).toBe(ready);
    expect(ready).toMatchObject({
      revision: 1,
      generation: 1,
      token: "e1-token-1",
      selected: "12:00",
      focus: "12:00",
      status: "ready",
      phase: "propose",
      fixtureVariant: "complete",
      scoreStatus: { state: "active", origin: "authored-controller" },
    });
    expect(ready.fixture).toBe(COMPLETE_WEATHER_FIXTURE);
    expect(ready.activeScore?.baseRevision).toBe(ready.revision);
    expect(ready.host).toMatchObject({
      sourceKind: "synthetic",
      evidenceStatus: "shape-and-semantics-validated",
      confidentiality: "public",
    });
    expect(Object.isFrozen(ready)).toBe(true);
    expect(Object.isFrozen(ready.anchors)).toBe(true);
    expect(() => {
      (ready.anchors["12:00"] as { x: number }).x = 0;
    }).toThrow();

    unsubscribe();
    controller.completeTransition();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("preserves selected scope, moved and pinned geometry, focus, and IDs across compare and score patches", () => {
    const controller = new E1Controller();
    controller.request("New York City");
    controller.select("15:00");
    controller.move("15:00", { x: 0.91, y: 0.33 });
    controller.pin("15:00", true);
    controller.compare();

    const beforePatch = controller.getSnapshot();
    expect(beforePatch.selected).toBe("15:00");
    expect(beforePatch.focus).toBe("15:00");
    expect(beforePatch.comparison).toEqual({ first: "12:00", second: "15:00" });
    expect(beforePatch.anchors["15:00"]).toMatchObject({
      id: "15:00",
      x: 0.91,
      y: 0.33,
      pinned: true,
      userMoved: true,
    });

    const proposal = controller.proposeScore();
    expect(proposal).not.toBeNull();
    const decision = controller.acceptScore(proposal);
    expect(decision).toMatchObject({ accepted: true, fallback: "none" });

    const afterPatch = controller.getSnapshot();
    expect(afterPatch.selected).toBe(beforePatch.selected);
    expect(afterPatch.focus).toBe(beforePatch.focus);
    expect(afterPatch.comparison).toEqual(beforePatch.comparison);
    expect(afterPatch.anchors["15:00"]).toEqual(beforePatch.anchors["15:00"]);
    expect(afterPatch.activeScore?.entities.map((entity) => entity.id)).toContain("comparison:pair");
  });

  it("supports both authored recipes, reduced motion, and plain mode without losing reading scope", () => {
    const controller = new E1Controller();
    controller.request();
    controller.select("15:00");
    controller.compare();
    controller.move("15:00", { x: 0.88, y: 0.5 });
    controller.pin("15:00", true);

    controller.setRecipe("withdraw-and-reanchor");
    expect(controller.getSnapshot().transition).toMatchObject({
      recipe: "withdraw-and-reanchor",
      status: "active",
      durationMs: 720,
    });

    controller.setReducedMotion(true);
    expect(controller.getSnapshot().transition).toMatchObject({ status: "settled", durationMs: 0 });
    controller.setPlain(true);
    const plain = controller.getSnapshot();
    expect(plain.phase).toBe("plain");
    expect(plain.fixture?.records).toHaveLength(3);
    expect(plain.selected).toBe("15:00");
    expect(plain.comparison).toEqual({ first: "12:00", second: "15:00" });
    expect(plain.focus).toBe("15:00");
    expect(plain.anchors["15:00"]).toMatchObject({ x: 0.88, y: 0.5, pinned: true });
  });

  it("interrupts queued expression while preserving facts and rejects its deterministic late delivery", () => {
    const controller = new E1Controller();
    controller.request();
    const fixture = controller.getSnapshot().fixture;
    const patch = controller.createDelayedPatch();
    expect(patch).not.toBeNull();

    const generation = controller.getSnapshot().generation;
    controller.stop();
    const stopped = controller.getSnapshot();
    expect(stopped.fixture).toBe(fixture);
    expect(stopped.status).toBe("ready");
    expect(stopped.transition.status).toBe("interrupted");
    expect(stopped.generation).toBe(generation + 1);

    const decision = controller.deliverDelayedPatch(patch);
    expect(decision.accepted).toBe(false);
    expect(decision.issues.map((item) => item.code)).toContain("stale-base");
    expect(controller.getSnapshot().events.at(-1)).toMatchObject({
      type: "late_result_rejected",
      reason: "stale-context",
    });
    expect(controller.getSnapshot().fixture).toBe(fixture);
  });

  it("dismisses completely and does not revive from an old or replayed patch", () => {
    const controller = new E1Controller();
    controller.request();
    const patch = controller.createDelayedPatch();
    controller.dismiss();

    const late = controller.deliverDelayedPatch(patch);
    expect(late.accepted).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      status: "dismissed",
      phase: "dissolved",
      fixture: null,
      activeScore: null,
      focus: null,
      comparison: null,
    });
    expect(controller.deliverDelayedPatch(patch).accepted).toBe(false);
    expect(controller.getSnapshot().status).toBe("dismissed");
  });

  it("never relabels retained NYC evidence after an unavailable location correction", () => {
    const controller = new E1Controller();
    controller.request("NYC");
    const nycFixture = controller.getSnapshot().fixture;

    expect(controller.request(invalidLocationRequest.location)).toBe(false);
    const unavailable = controller.getSnapshot();
    expect(unavailable.status).toBe(invalidLocationRequest.expectedStatus);
    expect(unavailable.error).toMatchObject({
      code: "invalid-location",
      requestedLocation: "Boston",
      retainedFixtureId: invalidLocationRequest.mustNotRelabelFixtureId,
    });
    expect(unavailable.fixture).toBe(nycFixture);
    expect(unavailable.fixture?.location).toEqual({
      id: "nyc",
      label: "New York City",
      timezone: "America/New_York",
    });
    expect(unavailable.activeScore).toBeNull();
  });

  it("omits cloud-bound expression instead of implying clear sky when cloud is unavailable", () => {
    const controller = new E1Controller();
    controller.request("NYC", "missing-cloud");
    const snapshot = controller.getSnapshot();

    expect(snapshot.fixture?.records.every((record) => record.cloudCover.status === "unavailable")).toBe(true);
    expect(snapshot.activeScore?.entities.some((entity) => entity.primitive === "occlusion-layer")).toBe(false);
    expect(snapshot.activeScore?.evidenceRefs.some((ref) => ref.endsWith(":cloudCover"))).toBe(false);
  });

  it("keeps a bounded, monotonic, synthetic trace", () => {
    const controller = new E1Controller({ traceLimit: 4 });
    controller.request();
    controller.select("15:00");
    controller.move("15:00", { x: 1.4, y: -0.2 });
    controller.pin("15:00", true);
    controller.compare();

    const snapshot = controller.getSnapshot();
    expect(snapshot.events).toHaveLength(4);
    expect(snapshot.traceDropped).toBeGreaterThan(0);
    expect(snapshot.events.map((event) => event.sequence)).toEqual(
      [...snapshot.events.map((event) => event.sequence)].sort((a, b) => a - b),
    );
    expect(snapshot.events.map((event) => event.monotonicMs)).toEqual(
      snapshot.events.map((event) => event.sequence * 10),
    );
    expect(snapshot.events.every((event) => event.responseId === "response:e1-weather")).toBe(true);
    expect(JSON.stringify(snapshot.events)).not.toContain("Boston");
    expect(snapshot.anchors["15:00"]).toMatchObject({ x: 1, y: 0 });
  });
});
