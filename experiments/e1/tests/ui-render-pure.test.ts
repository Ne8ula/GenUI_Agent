import { describe, expect, it } from "vitest";
import { E1Controller } from "../src/core";
import { anchorPixels } from "../src/ui/anchorGeometry";
import {
  BENCHMARK_MAX_DURATION_MS,
  deriveLobes,
  generateFieldTargets,
  isAcceptableBenchmarkDuration,
  PointCloudState,
  type Lobe,
} from "../src/ui/render";

function readyController(variant: "complete" | "missing-cloud" = "complete"): E1Controller {
  const controller = new E1Controller();
  controller.request(undefined, variant);
  return controller;
}

describe("deriveLobes", () => {
  it("returns nothing before a fixture is ready (idle status)", () => {
    const controller = new E1Controller();
    const lobes = deriveLobes({ snapshot: controller.getSnapshot(), widthPx: 1000, heightPx: 800, totalCount: 2000 });
    expect(lobes).toEqual([]);
  });

  it("is genuinely effect-free in plain answer, not merely instant/unanimated (regression: concern 1)", () => {
    const controller = readyController();
    controller.setPlain(true);
    const lobes = deriveLobes({ snapshot: controller.getSnapshot(), widthPx: 1000, heightPx: 800, totalCount: 2000 });
    expect(lobes).toEqual([]);
  });

  it("produces a field lobe and a bound cloud-occlusion lobe when cloud cover is available and nonzero", () => {
    const controller = readyController("complete");
    // Default selection is noon (20% cloud in the W-NYC-01 fixture).
    const lobes = deriveLobes({ snapshot: controller.getSnapshot(), widthPx: 1000, heightPx: 800, totalCount: 2000 });
    const tones = lobes.map((lobe) => lobe.tone);
    expect(tones).toContain(0);
    expect(tones).toContain(1);
    expect(tones).not.toContain(2);
    const totalPoints = lobes.reduce((sum, lobe) => sum + lobe.count, 0);
    expect(totalPoints).toBeGreaterThan(0);
    expect(totalPoints).toBeLessThanOrEqual(2000);
  });

  it("renders a distinct neutral tone-2 ring for missing cloud cover, never an implied-clear (tone-1) reading (regression: owner correction)", () => {
    const controller = readyController("missing-cloud");
    const lobes = deriveLobes({ snapshot: controller.getSnapshot(), widthPx: 1000, heightPx: 800, totalCount: 2000 });
    const tones = lobes.map((lobe) => lobe.tone);
    expect(tones).not.toContain(1); // never a bound cloud-occlusion lobe with no data
    expect(tones).toContain(2); // the explicit "unknown" neutral indicator
    const unknownLobe = lobes.find((lobe) => lobe.tone === 2);
    expect(unknownLobe?.shape).toBe("ring");
    expect(unknownLobe?.count ?? 0).toBeGreaterThan(0);
  });

  it("keeps the primary field attached to the exact anchor pixel position (attachment regression: concern 7)", () => {
    const controller = readyController("complete");
    controller.move("12:00", { x: 0.9, y: 0.05 }); // near an edge, exercising the clamp path
    const snapshot = controller.getSnapshot();
    const widthPx = 1200;
    const heightPx = 900;
    const lobes = deriveLobes({ snapshot, widthPx, heightPx, totalCount: 2000 });
    const primaryFieldLobe = lobes.find((lobe) => lobe.key === "field:primary");
    expect(primaryFieldLobe).toBeDefined();
    const anchor = anchorPixels(snapshot.anchors[snapshot.selected], widthPx, heightPx);
    expect(primaryFieldLobe!.cx).toBeCloseTo(anchor.x, 6);
    expect(primaryFieldLobe!.cy).toBeCloseTo(anchor.y, 6);
  });
});

describe("generateFieldTargets (fieldLayout)", () => {
  function distanceFromCenter(lobe: Lobe, x: number, y: number): number {
    const dx = x - lobe.cx;
    const dy = (y - lobe.cy) / 0.82; // undo the authored vertical compression
    return Math.sqrt(dx * dx + dy * dy);
  }

  it("samples a disk lobe's points within its radius", () => {
    const lobe: Lobe = { key: "disk", cx: 100, cy: 100, radius: 50, count: 500, seed: "disk-seed", tone: 0 };
    const { points, totalCount } = generateFieldTargets([lobe]);
    expect(totalCount).toBe(500);
    for (let i = 0; i < totalCount; i += 1) {
      const d = distanceFromCenter(lobe, points[i * 2], points[i * 2 + 1]);
      expect(d).toBeLessThanOrEqual(50 + 1e-6);
    }
  });

  it("samples a ring lobe's points within a thin annulus, never at the center (regression: missing-cloud neutral shape)", () => {
    const lobe: Lobe = { key: "ring", cx: 200, cy: 200, radius: 80, count: 500, seed: "ring-seed", tone: 2, shape: "ring" };
    const { points, totalCount } = generateFieldTargets([lobe]);
    expect(totalCount).toBe(500);
    let sawNearOuter = false;
    for (let i = 0; i < totalCount; i += 1) {
      const d = distanceFromCenter(lobe, points[i * 2], points[i * 2 + 1]);
      expect(d).toBeGreaterThanOrEqual(80 * 0.78 - 1e-6);
      expect(d).toBeLessThanOrEqual(80 * 1.02 + 1e-6);
      if (d > 80 * 0.9) sawNearOuter = true;
    }
    // A disk's radial bias (r^1.7) concentrates samples near the center; a
    // ring must not reproduce that — points should spread across the band,
    // including near its outer edge.
    expect(sawNearOuter).toBe(true);
  });

  it("is deterministic for a fixed seed (reproducible fixture requirement)", () => {
    const lobe: Lobe = { key: "det", cx: 10, cy: 10, radius: 20, count: 50, seed: "fixed-seed", tone: 0 };
    const a = generateFieldTargets([lobe]);
    const b = generateFieldTargets([lobe]);
    expect(Array.from(a.points)).toEqual(Array.from(b.points));
  });
});

describe("PointCloudState (settle-loop finiteness, regression: concern 6)", () => {
  it("reaches settled in a bounded number of ticks and stays put once there", () => {
    const state = new PointCloudState();
    state.setTargets(generateFieldTargets([{ key: "a", cx: 0, cy: 0, radius: 1, count: 4, seed: "s", tone: 0 }]));
    // All new points start already at target (documented "pop-in"), so the
    // very first tick is already settled for a from-empty setTargets call —
    // exercise a genuine chase by nudging the target away first.
    state.setTargets({
      points: Float32Array.from([50, 50, 50, 50, 50, 50, 50, 50]),
      tones: Uint8Array.from([0, 0, 0, 0]),
      keys: ["a:0", "a:1", "a:2", "a:3"],
      totalCount: 4,
    });
    expect(state.isSettled()).toBe(false);

    let ticks = 0;
    const MAX_TICKS = 1000; // generous bound; a real settle is O(tau) ticks
    while (!state.isSettled() && ticks < MAX_TICKS) {
      state.tick(16, 200);
      ticks += 1;
    }
    expect(state.isSettled()).toBe(true);
    expect(ticks).toBeLessThan(MAX_TICKS);

    // isSettled() is a within-epsilon threshold, not an exact-convergence
    // stop (the caller — FieldCanvas's runLoop — is what actually stops
    // ticking once settled). Ticking further must keep it within the same
    // epsilon, never diverge or overshoot away from the target.
    state.tick(16, 200);
    expect(state.isSettled()).toBe(true);
  });

  it("freeze() halts the chase and preserves exact current geometry", () => {
    const state = new PointCloudState();
    state.setTargets({
      points: Float32Array.from([0, 0]),
      tones: Uint8Array.from([0]),
      keys: ["p:0"],
      totalCount: 1,
    });
    state.setTargets({
      points: Float32Array.from([100, 100]),
      tones: Uint8Array.from([0]),
      keys: ["p:0"],
      totalCount: 1,
    });
    state.tick(16, 200);
    const midFlight = Array.from(state.getCurrent());
    expect(midFlight).not.toEqual([100, 100]);
    expect(midFlight).not.toEqual([0, 0]);

    state.freeze();
    expect(state.isSettled()).toBe(true);
    state.tick(16, 200);
    expect(Array.from(state.getCurrent())).toEqual(midFlight);
  });
});

describe("isAcceptableBenchmarkDuration (regression: concern 4)", () => {
  it("accepts an omitted duration for the bounded 30s default", () => {
    expect(isAcceptableBenchmarkDuration(undefined)).toBe(true);
  });

  it("accepts values within the supported budget, including the >=30s spec minimum", () => {
    expect(isAcceptableBenchmarkDuration(30_000)).toBe(true);
    expect(isAcceptableBenchmarkDuration(1)).toBe(true);
    expect(isAcceptableBenchmarkDuration(BENCHMARK_MAX_DURATION_MS)).toBe(true);
  });

  it("rejects nonfinite durations", () => {
    expect(isAcceptableBenchmarkDuration(Number.NaN)).toBe(false);
    expect(isAcceptableBenchmarkDuration(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isAcceptableBenchmarkDuration(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("rejects zero/negative and out-of-budget durations", () => {
    expect(isAcceptableBenchmarkDuration(0)).toBe(false);
    expect(isAcceptableBenchmarkDuration(-1000)).toBe(false);
    expect(isAcceptableBenchmarkDuration(BENCHMARK_MAX_DURATION_MS + 1)).toBe(false);
  });
});
