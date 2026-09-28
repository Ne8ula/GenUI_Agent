import { describe, expect, it } from "vitest";
import { E1Controller } from "../src/core";
import type { MaterialScene, MaterialStatus } from "../src/native";
import { anchorPixels } from "../src/ui/anchorGeometry";
import { cellGeometry, cellStart } from "../src/ui/render/cellGeometry";
import { deriveLobes, generateFieldTargets, PointCloudState } from "../src/ui/render";
import { INITIAL_RENDERER, isCurrentMaterialStatus, sceneFromSnapshot, snapshotFromScene } from "../src/ui/nativeScene";

function scene(): MaterialScene {
  const controller = new E1Controller();
  controller.request(); controller.select("15:00"); controller.move("15:00", { x: .8, y: .65 });
  controller.pin("15:00", true); controller.compare();
  return { ...sceneFromSnapshot(controller.getSnapshot(), INITIAL_RENDERER, 7), controllerSessionId: "native-session-1" };
}

describe("native scene projection", () => {
  it("preserves exact fixture values, independent anchors, pins and comparison without controller authority", () => {
    const input = scene();
    const restored = snapshotFromScene(input);
    expect(restored.fixture?.records.map((r) => r.temperature.value)).toEqual([18, 22, 21]);
    expect(restored.anchors["15:00"]).toMatchObject({ x: .8, y: .65, pinned: true });
    expect(restored.comparison).toEqual({ first: "12:00", second: "15:00" });
    expect(restored.events).toEqual([]);
    expect(restored.host).toBeNull();
    expect(input).not.toHaveProperty("permission");
    expect(input).not.toHaveProperty("activeScore");
  });

  it("retains missingness rather than substituting zero", () => {
    const c = new E1Controller(); c.request("NYC", "missing-cloud");
    const projected = sceneFromSnapshot(c.getSnapshot(), INITIAL_RENDERER, 1);
    expect(projected.records.every((r) => r.cloudCoverPercent === null)).toBe(true);
    const restored = snapshotFromScene({ ...projected, controllerSessionId: "native-session-1" });
    expect(restored.fixture?.records.every((r) => r.cloudCover.status === "unavailable")).toBe(true);
  });

  it("rejects stale scene, revision, transition and controller session identities", () => {
    const current = scene();
    const status: MaterialStatus = {
      schemaVersion: "e1.material-status/1", kind: "transition-complete", controllerSessionId: current.controllerSessionId,
      sceneSequence: current.sceneSequence, responseId: current.responseId, revision: current.revision,
      transitionId: current.transition.id, monotonicMs: 42,
      stats: { renderer: "canvas2d", drawCount: 10, pointCount: 2000, requestedPointCount: 2000,
        lastFrameMs: 7, framesRendered: 10, settled: true, contextLost: false, forcedContinuous: false,
        benchmark: { runId: null, running: false, samplesMs: [] } },
    };
    expect(isCurrentMaterialStatus(status, current, current.controllerSessionId)).toBe(true);
    for (const patch of [
      { sceneSequence: 6 }, { revision: current.revision - 1 }, { transitionId: "old-transition" },
      { controllerSessionId: "native-session-0" },
    ]) expect(isCurrentMaterialStatus({ ...status, ...patch }, current, current.controllerSessionId)).toBe(false);
    expect(isCurrentMaterialStatus(status, null, current.controllerSessionId)).toBe(false);
  });
});

describe("reachable desktop geometry and renderer parity", () => {
  it.each([1, 1.5, 2])("uses integer, matching cell edges at DPR %s", (dpr) => {
    const { pitch, fill, inset } = cellGeometry(4, dpr);
    for (const position of [-7.3, 0, 3.2, 80.9]) {
      const edge = cellStart(position, dpr, pitch, inset);
      const webglCenter = edge + fill / 2;
      expect(Number.isInteger(edge)).toBe(true);
      expect(webglCenter - fill / 2).toBe(edge);
      expect(webglCenter + fill / 2).toBe(edge + fill);
    }
  });

  it("keeps edge anchors reachable and reserves the small control affordance", () => {
    expect(anchorPixels({ x: 0, y: 0 }, 1440, 900)).toEqual({ x: 128, y: 120 });
    expect(anchorPixels({ x: 1, y: 1 }, 1440, 900)).toEqual({ x: 1312, y: 860 });
  });

  it("gathers new material, retains identity and retargets on explicit selection", () => {
    const c = new E1Controller(); c.request();
    const targets = () => generateFieldTargets(deriveLobes({ snapshot: c.getSnapshot(), widthPx: 1440, heightPx: 900, totalCount: 2000 }));
    const cloud = new PointCloudState();
    cloud.setTargets(targets(), true);
    expect(cloud.isSettled()).toBe(false);
    cloud.snapToTarget();
    const before = cloud.getCurrent()[0];
    c.select("15:00"); cloud.setTargets(targets(), true);
    expect(cloud.getCurrent()[0]).toBe(before);
    expect(cloud.isSettled()).toBe(false);
    cloud.tick(16, 200);
    expect(cloud.getCurrent()[0]).not.toBe(before);
  });
});
