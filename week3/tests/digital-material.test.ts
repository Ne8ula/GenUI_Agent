import { describe, expect, it } from "vitest";
import {
  buildMatrixCells,
  buildSmearBands,
  buildTrackingBoxes,
  buildTrackingBoxesFromLandmarks,
  type DigitalColorKey,
  type LandmarkPoint,
} from "../src/visual/digital-material";
import { MAX_MATRIX_CELLS, MAX_SMEAR_BANDS, MAX_TRACKING_BOXES } from "../src/visual/constants";
import { advanceRuntime, buildFrame, createAnimationRuntime, type EyeStageProps, type WarpChannels } from "../src/visual/runtime";
import { drawEye, warpPoint, DEFAULT_EYE_INTERACTION } from "../src/visual/render";

// render.ts uses Path2D purely as an opaque path handle passed straight back
// into ctx.fill/clip/stroke; jsdom/node do not implement it, so a no-op stub
// is enough here (same pattern as visual.test.ts's viewport-fit check).
if (typeof (globalThis as { Path2D?: unknown }).Path2D === "undefined") {
  (globalThis as { Path2D?: unknown }).Path2D = class {
    moveTo() {}
    lineTo() {}
    quadraticCurveTo() {}
    closePath() {}
  };
}

const NEUTRAL_WEIGHTS = { pearl: 0.3, lavender: 0.25, ice: 0.25, coral: 0.2 };
const VALID_COLOR_KEYS: DigitalColorKey[] = ["magenta", "cyan", "lime", "blue", "pearl"];

describe("digital-material: matrix cells", () => {
  it("is deterministic and bounded by maxCells", () => {
    const a = buildMatrixCells({ seed: 42, maxCells: 500, paletteWeights: NEUTRAL_WEIGHTS });
    const b = buildMatrixCells({ seed: 42, maxCells: 500, paletteWeights: NEUTRAL_WEIGHTS });
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(500);
    expect(a.length).toBeGreaterThan(0);
  });

  it("never exceeds MAX_MATRIX_CELLS and keeps every cell inside the requested annulus", () => {
    const coreHoleFrac = 0.3;
    const rimMarginFrac = 0.05;
    const cells = buildMatrixCells({
      seed: 7,
      maxCells: MAX_MATRIX_CELLS,
      paletteWeights: NEUTRAL_WEIGHTS,
      coreHoleFrac,
      rimMarginFrac,
    });
    expect(cells.length).toBeLessThanOrEqual(MAX_MATRIX_CELLS);
    for (const cell of cells) {
      expect(cell.radiusFrac).toBeGreaterThanOrEqual(coreHoleFrac);
      expect(cell.radiusFrac).toBeLessThanOrEqual(1 - rimMarginFrac);
      expect(Number.isFinite(cell.theta)).toBe(true);
      expect(VALID_COLOR_KEYS).toContain(cell.colorKey);
    }
  });

  it("produces a genuinely dense matrix (not a handful of cells)", () => {
    const cells = buildMatrixCells({ seed: 1, maxCells: MAX_MATRIX_CELLS, paletteWeights: NEUTRAL_WEIGHTS });
    expect(cells.length).toBeGreaterThan(800);
  });
});

describe("digital-material: tracking boxes", () => {
  it("returns no boxes when targetCount is 0 (frame.boxes empty means none)", () => {
    expect(buildTrackingBoxes({ seed: 1, anchorAngles: [0.1, 0.4], targetCount: 0, maxCount: MAX_TRACKING_BOXES })).toEqual([]);
  });

  it("places the runtime anchors first, on the live contour", () => {
    const anchorAngles = [0.2, 1.1, 2.4];
    const boxes = buildTrackingBoxes({ seed: 3, anchorAngles, targetCount: 24, maxCount: MAX_TRACKING_BOXES });
    for (let i = 0; i < anchorAngles.length; i++) {
      expect(boxes[i].theta).toBe(anchorAngles[i]);
      expect(boxes[i].radiusFrac).toBe(1);
    }
  });

  it("respects the requested count within [0, maxCount] and never sends companions beyond the contour", () => {
    const boxes = buildTrackingBoxes({ seed: 9, anchorAngles: [0], targetCount: 40, maxCount: MAX_TRACKING_BOXES });
    expect(boxes.length).toBe(40);
    for (const box of boxes) {
      expect(box.radiusFrac).toBeGreaterThan(0);
      expect(box.radiusFrac).toBeLessThanOrEqual(1);
      expect(box.size).toBeGreaterThan(0);
    }
  });

  it("keeps connecting-line targets within bounds", () => {
    const boxes = buildTrackingBoxes({ seed: 5, anchorAngles: [0, 1, 2], targetCount: 32, maxCount: MAX_TRACKING_BOXES });
    for (const box of boxes) {
      if (box.connectToIndex !== null) {
        expect(box.connectToIndex).toBeGreaterThanOrEqual(0);
        expect(box.connectToIndex).toBeLessThan(boxes.length);
      }
    }
  });

  it("is deterministic for the same seed/inputs", () => {
    const a = buildTrackingBoxes({ seed: 11, anchorAngles: [0.5], targetCount: 20, maxCount: MAX_TRACKING_BOXES });
    const b = buildTrackingBoxes({ seed: 11, anchorAngles: [0.5], targetCount: 20, maxCount: MAX_TRACKING_BOXES });
    expect(a).toEqual(b);
  });
});

describe("digital-material: smear bands", () => {
  it("produces nothing when fragmentation is 0", () => {
    expect(buildSmearBands({ seed: 1, fragmentation: 0, maxBands: MAX_SMEAR_BANDS, timeSec: 5 })).toEqual([]);
  });

  it("scales band count with fragmentation, bounded by maxBands", () => {
    const low = buildSmearBands({ seed: 1, fragmentation: 0.2, maxBands: MAX_SMEAR_BANDS, timeSec: 0 });
    const high = buildSmearBands({ seed: 1, fragmentation: 1, maxBands: MAX_SMEAR_BANDS, timeSec: 0 });
    expect(low.length).toBeGreaterThan(0);
    expect(high.length).toBeLessThanOrEqual(MAX_SMEAR_BANDS);
    expect(high.length).toBeGreaterThanOrEqual(low.length);
  });

  it("keeps band identity (color, dropouts) stable while only the continuous drift changes with time", () => {
    const t0 = buildSmearBands({ seed: 4, fragmentation: 0.8, maxBands: MAX_SMEAR_BANDS, timeSec: 0 });
    const t1 = buildSmearBands({ seed: 4, fragmentation: 0.8, maxBands: MAX_SMEAR_BANDS, timeSec: 1.5 });
    expect(t0.length).toBe(t1.length);
    for (let i = 0; i < t0.length; i++) {
      expect(t1[i].colorKey).toBe(t0[i].colorKey);
      expect(t1[i].yFrac).toBe(t0[i].yFrac);
      expect(t1[i].dropouts).toEqual(t0[i].dropouts);
    }
  });
});

function baseProps(overrides: Partial<EyeStageProps> = {}): EyeStageProps {
  return { state: "idle", stance: "attentive", intensity: 0.6, seed: 42, reducedMotion: false, active: true, ...overrides };
}

function makeRecordingCtx(cx: number, cy: number) {
  const points: Array<[number, number]> = [];
  let strokeRectCalls = 0;
  const note = (x: number, y: number) => points.push([x - cx, y - cy]);
  const ctx = {
    save() {},
    restore() {},
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo: note,
    lineTo: note,
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
      note(cpx, cpy);
      note(x, y);
    },
    closePath() {},
    clip() {},
    fill() {},
    stroke() {},
    strokeRect(x: number, y: number, w: number, h: number) {
      strokeRectCalls++;
      note(x, y);
      note(x + w, y + h);
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    set fillStyle(_v: unknown) {},
    set strokeStyle(_v: unknown) {},
    set lineWidth(_v: unknown) {},
    set globalCompositeOperation(_v: unknown) {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, points, getStrokeRectCalls: () => strokeRectCalls };
}

// Owner clarification (2026-09-27): render.ts no longer draws its own
// invented silhouette/matrix -- the source eye now comes from the pending
// `./week1-eye` module (a separate port of the actual SignalEye.tsx shader
// equations). The describes below replace the old bowtie/hero-size/
// theta-box regression tests with coverage for what render.ts now actually
// owns: the pure `warpPoint` coordinate transform shared by the raster
// strip-mesh and the landmarks, the landmark-attached box builder, and
// `drawEye`'s graceful background-only behavior while that module is
// pending (never an invented replacement eye).

const ZERO_WARP: WarpChannels = { fold: 0, lift: 0, bloom: 0, fan: 0, twist: 0 };

describe("render.ts: warpPoint (the one transform shared by raster strips and landmarks)", () => {
  it("is the identity transform at all-zero warp (attentive/neutral reads as the unwarped source eye)", () => {
    for (const [x, y] of [
      [0, 0],
      [0.6, -0.3],
      [-0.9, 0.4],
      [0.1, 0.95],
    ]) {
      const result = warpPoint(x, y, ZERO_WARP);
      expect(result.x).toBeCloseTo(x, 10);
      expect(result.y).toBeCloseTo(y, 10);
    }
  });

  it("gives each dominant channel a distinct, non-identity effect in isolation", () => {
    const point: [number, number] = [0.5, 0.3];
    const fold = warpPoint(point[0], point[1], { ...ZERO_WARP, fold: 0.7 });
    const lift = warpPoint(point[0], point[1], { ...ZERO_WARP, lift: 0.7 });
    const bloom = warpPoint(point[0], point[1], { ...ZERO_WARP, bloom: 0.7 });
    const fan = warpPoint(point[0], point[1], { ...ZERO_WARP, fan: 0.7 });

    const identity = warpPoint(point[0], point[1], ZERO_WARP);
    const results = [fold, lift, bloom, fan];
    for (const r of results) {
      expect(Math.hypot(r.x - identity.x, r.y - identity.y)).toBeGreaterThan(0.01);
    }
    // Pairwise distinct, not four copies of the same displacement.
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const same = Math.abs(results[i].x - results[j].x) < 1e-9 && Math.abs(results[i].y - results[j].y) < 1e-9;
        expect(same).toBe(false);
      }
    }
  });

  it("bloom pushes points radially outward; fold compresses the vertical extent", () => {
    const identity = warpPoint(0.4, 0.4, ZERO_WARP);
    const bloomed = warpPoint(0.4, 0.4, { ...ZERO_WARP, bloom: 0.6 });
    expect(Math.hypot(bloomed.x, bloomed.y)).toBeGreaterThan(Math.hypot(identity.x, identity.y));

    const folded = warpPoint(0.2, 0.8, { ...ZERO_WARP, fold: 0.6 });
    expect(Math.abs(folded.y)).toBeLessThan(Math.abs(0.8));
  });
});

describe("digital-material: landmark-attached tracking boxes", () => {
  const landmarks: LandmarkPoint[] = [
    { x: 10, y: 20 },
    { x: 40, y: 25 },
    { x: 70, y: 30 },
  ];

  it("returns nothing when targetCount is 0 or there are no landmarks (frame.boxes empty means none)", () => {
    expect(buildTrackingBoxesFromLandmarks({ seed: 1, landmarks, targetCount: 0, maxCount: MAX_TRACKING_BOXES })).toEqual([]);
    expect(buildTrackingBoxesFromLandmarks({ seed: 1, landmarks: [], targetCount: 20, maxCount: MAX_TRACKING_BOXES })).toEqual([]);
  });

  it("places every real landmark first, exactly at its own position", () => {
    const boxes = buildTrackingBoxesFromLandmarks({ seed: 3, landmarks, targetCount: 20, maxCount: MAX_TRACKING_BOXES });
    for (let i = 0; i < landmarks.length; i++) {
      expect(boxes[i].x).toBe(landmarks[i].x);
      expect(boxes[i].y).toBe(landmarks[i].y);
      expect(boxes[i].opacity).toBeCloseTo(0.85, 5);
    }
  });

  it("respects the requested count within [0, maxCount] and stays deterministic", () => {
    const a = buildTrackingBoxesFromLandmarks({ seed: 11, landmarks, targetCount: 30, maxCount: MAX_TRACKING_BOXES });
    const b = buildTrackingBoxesFromLandmarks({ seed: 11, landmarks, targetCount: 30, maxCount: MAX_TRACKING_BOXES });
    expect(a.length).toBe(30);
    expect(a).toEqual(b);
  });

  it("keeps connecting-line targets within bounds", () => {
    const boxes = buildTrackingBoxesFromLandmarks({ seed: 5, landmarks, targetCount: 24, maxCount: MAX_TRACKING_BOXES });
    for (const box of boxes) {
      if (box.connectToIndex !== null) {
        expect(box.connectToIndex).toBeGreaterThanOrEqual(0);
        expect(box.connectToIndex).toBeLessThan(boxes.length);
      }
    }
  });
});

describe("render.ts: drawEye integrates the real ./week1-eye raster (no invented replacement eye)", () => {
  it("does not throw for the default four-argument call (source-eye body draw is DOM-only and safely skipped in this test environment)", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "idle", stance: "attentive" });
    for (let i = 0; i < 30; i++) advanceRuntime(runtime, props, 1 / 60);
    const frame = buildFrame(runtime, props);
    const { ctx } = makeRecordingCtx(700, 450);
    expect(() => drawEye(ctx, 1400, 900, frame)).not.toThrow();
  });

  it("accepts an explicit fifth EyeInteraction argument without throwing", () => {
    const runtime = createAnimationRuntime();
    const props = baseProps({ state: "speaking", stance: "shared_joy" });
    for (let i = 0; i < 30; i++) advanceRuntime(runtime, props, 1 / 60);
    const frame = buildFrame(runtime, props);
    const { ctx } = makeRecordingCtx(700, 450);
    expect(() =>
      drawEye(ctx, 1400, 900, frame, { ...DEFAULT_EYE_INTERACTION, gazeX: 0.3, closure: 0.1, quiet: true })
    ).not.toThrow();
  });

  it("draws tracking boxes attached to the eye's real (warped) landmarks while frame.boxes is active, and none once it is empty", () => {
    const runtime = createAnimationRuntime();
    const activeProps = baseProps({ state: "processing", stance: "congratulatory" });
    for (let i = 0; i < 90; i++) advanceRuntime(runtime, activeProps, 1 / 60);
    const activeFrame = buildFrame(runtime, activeProps);
    expect(activeFrame.boxes.length).toBeGreaterThan(0);

    const { ctx: activeCtx, getStrokeRectCalls: activeStrokeRects } = makeRecordingCtx(700, 450);
    drawEye(activeCtx, 1400, 900, activeFrame, { ...DEFAULT_EYE_INTERACTION, quiet: true });
    expect(activeStrokeRects()).toBeGreaterThanOrEqual(18);
    expect(activeStrokeRects()).toBeLessThanOrEqual(MAX_TRACKING_BOXES);

    const endedProps = baseProps({ state: "processing", stance: "congratulatory", active: false });
    advanceRuntime(runtime, endedProps, 1 / 60);
    const endedFrame = buildFrame(runtime, endedProps);
    expect(endedFrame.boxes.length).toBe(0);

    const { ctx: endedCtx, getStrokeRectCalls: endedStrokeRects } = makeRecordingCtx(700, 450);
    drawEye(endedCtx, 1400, 900, endedFrame, { ...DEFAULT_EYE_INTERACTION, quiet: true });
    expect(endedStrokeRects()).toBe(0);
  });
});
