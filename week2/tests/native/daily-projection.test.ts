import { describe, expect, it } from "vitest";
import { E1Controller } from "../../src/core";
import { INITIAL_RENDERER, sceneFromSnapshot, snapshotFromScene } from "../../src/ui/nativeScene";

describe("daily native projection", () => {
  it("round trips daily evidence without adding an intraday fixture", () => {
    const controller = new E1Controller();
    controller.requestForecast("tomorrow", "NYC");
    const scene = sceneFromSnapshot(controller.getSnapshot(), INITIAL_RENDERER, 1);
    expect(scene.forecast?.date).toBe("2026-10-15");
    expect(scene.fixtureId).toBeNull();
    expect(scene.records).toEqual([]);
    const projected = snapshotFromScene({ ...scene, controllerSessionId: "test-session" });
    expect(projected.forecast).toEqual(controller.getSnapshot().forecast);
    expect(projected.fixture).toBeNull();
    expect(projected.anchors).toEqual(controller.getSnapshot().anchors);
  });

  it("dismisses without daily evidence and refuses corrupt projection data", () => {
    const controller = new E1Controller();
    controller.requestForecast("today", "NYC");
    const scene = sceneFromSnapshot(controller.getSnapshot(), INITIAL_RENDERER, 1);
    const corrupt = { ...scene, controllerSessionId: "test-session", forecast: { ...scene.forecast!, temperatureC: 100 } };
    expect(snapshotFromScene(corrupt).forecast).toBeNull();
    controller.dismiss();
    const dismissed = sceneFromSnapshot(controller.getSnapshot(), INITIAL_RENDERER, 2);
    expect(dismissed.status).toBe("dismissed");
    expect(dismissed.forecast).toBeNull();
    expect(dismissed.records).toEqual([]);
  });
});
