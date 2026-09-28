import { describe, expect, it } from "vitest";
import {
  rasterizeWeek1Eye,
  week1BayerThreshold,
  type Week1Pose,
} from "../src/visual/week1-eye";

function pose(overrides: Partial<Week1Pose> = {}): Week1Pose {
  return {
    gazeX: 0,
    gazeY: 0,
    tissueX: 0,
    tissueY: 0,
    closure: 0,
    quiet: false,
    time: 1.25,
    energy: 0.35,
    ...overrides,
  };
}

function byteDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let changed = 0;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) changed++;
  return changed;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("Week 1 eye CPU raster", () => {
  it("returns finite bounded RGBA bytes and source-derived landmarks", () => {
    const width = 96;
    const height = 48;
    const result = rasterizeWeek1Eye(width, height, pose());

    expect(result.data).toBeInstanceOf(Uint8ClampedArray);
    expect(result.data).toHaveLength(width * height * 4);
    expect(result.landmarks).toHaveLength(19);
    for (const channel of result.data) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
    for (const point of result.landmarks) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }

    // Five sampled upper-lid points precede the matching lower-lid points.
    for (let index = 0; index < 5; index++) {
      expect(result.landmarks[index].y).toBeLessThan(result.landmarks[index + 5].y);
    }
  });

  it("is deterministic and writes into an exact-size reusable target", () => {
    const width = 80;
    const height = 40;
    const input = pose({ gazeX: 0.08, tissueX: 0.025, tissueY: -0.01, time: 7.5 });
    const first = rasterizeWeek1Eye(width, height, input);
    const target = new Uint8ClampedArray(width * height * 4);
    const second = rasterizeWeek1Eye(width, height, input, target);

    expect(second.data).toBe(target);
    expect(second.data).toEqual(first.data);
    expect(second.landmarks).toEqual(first.landmarks);
    expect(() => rasterizeWeek1Eye(width, height, input, new Uint8ClampedArray(4))).toThrow(RangeError);
  });

  it("retains a square pupil region under the eye's shared tissue shear", () => {
    const result = rasterizeWeek1Eye(160, 80, pose({ quiet: true, energy: 0 }));
    // Landmark order: 5 upper lid, 5 lower lid, iris center, 4 iris edges,
    // then the pupil's four source-square corners.
    const [sourceBottomLeft, sourceBottomRight, sourceTopRight, sourceTopLeft] = result.landmarks.slice(15);
    const bottom = distance(sourceBottomLeft, sourceBottomRight);
    const right = distance(sourceBottomRight, sourceTopRight);
    const top = distance(sourceTopRight, sourceTopLeft);
    const left = distance(sourceTopLeft, sourceBottomLeft);

    expect(top / right).toBeGreaterThan(0.98);
    expect(top / right).toBeLessThan(1.02);
    expect(bottom).toBeCloseTo(top, 8);
    expect(left).toBeCloseTo(right, 8);
    expect(sourceBottomLeft.x).toBeLessThan(sourceBottomRight.x);
    expect(sourceBottomLeft.y).toBeGreaterThan(sourceTopLeft.y);
  });

  it("moves source landmarks and raster output with gaze", () => {
    const left = rasterizeWeek1Eye(120, 60, pose({ gazeX: -0.1, quiet: true }));
    const right = rasterizeWeek1Eye(120, 60, pose({ gazeX: 0.1, quiet: true }));

    expect(right.landmarks[10].x).toBeGreaterThan(left.landmarks[10].x);
    expect(byteDifference(left.data, right.data)).toBeGreaterThan(500);
  });

  it("freezes time-driven decorative motion in quiet mode", () => {
    const early = rasterizeWeek1Eye(100, 50, pose({ quiet: true, time: 0 }));
    const late = rasterizeWeek1Eye(100, 50, pose({ quiet: true, time: 91.25 }));
    expect(late.data).toEqual(early.data);
    expect(late.landmarks).toEqual(early.landmarks);

    const movingEarly = rasterizeWeek1Eye(100, 50, pose({ quiet: false, time: 0 }));
    const movingLate = rasterizeWeek1Eye(100, 50, pose({ quiet: false, time: 91.25 }));
    expect(byteDifference(movingEarly.data, movingLate.data)).toBeGreaterThan(0);
  });

  it("keeps the 4x4 Bayer pattern stationary and runtime RGB bounded", () => {
    const thresholds = new Set<number>();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) thresholds.add(week1BayerThreshold(x, y, 4));
    }
    expect(thresholds.size).toBe(16);

    const result = rasterizeWeek1Eye(72, 36, pose({ phosphor: [0, 1, 0.5] }));
    for (const channel of result.data) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
    expect(() => rasterizeWeek1Eye(8, 8, pose({ phosphor: [1.01, 0, 0] }))).toThrow(RangeError);
    expect(() => rasterizeWeek1Eye(8, 8, pose({ phosphor: [Number.NaN, 0, 0] }))).toThrow(TypeError);
  });

  it("rejects dimensions beyond the bounded raster contract", () => {
    for (const [width, height] of [
      [0, 10],
      [10.5, 10],
      [361, 10],
      [10, 181],
    ]) {
      expect(() => rasterizeWeek1Eye(width, height, pose())).toThrow(RangeError);
    }
    expect(() => rasterizeWeek1Eye(360, 180, pose({ quiet: true }))).not.toThrow();
  });
});
