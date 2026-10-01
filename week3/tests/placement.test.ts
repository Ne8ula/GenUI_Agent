import { describe, expect, it } from "vitest";
import { clampAnchor, DEFAULT_ANCHOR, formCenter, formHalfExtent, onEye } from "../src/visual/placement";
import { cropGrid, type LumaGrid } from "../src/visual/backdrop";

describe("floating placement (batch w3-cloud-20260929-b p2)", () => {
  it("rests in the lower right by default", () => {
    expect(DEFAULT_ANCHOR.x).toBeGreaterThan(0.7);
    expect(DEFAULT_ANCHOR.y).toBeGreaterThan(0.6);
  });

  it("draws at the anchor itself while small and inside the screen", () => {
    expect(formCenter(1200, 700, 90, 0, 1400, 900)).toEqual({ x: 1200, y: 700 });
  });

  it("pulls a growing form inward just enough to stay on the monitor", () => {
    const scale = 360;
    const c = formCenter(1300, 860, scale, 1, 1400, 900);
    const half = formHalfExtent(1);
    expect(c.x + half.x * scale).toBeLessThanOrEqual(1400 + 1e-6);
    expect(c.y + half.y * scale).toBeLessThanOrEqual(900 + 1e-6);
    expect(c.x).toBeLessThan(1300);
    expect(c.y).toBeLessThan(860);
  });

  it("joy may pass the edge (unclamped)", () => {
    expect(formCenter(1300, 860, 360, 1, 1400, 900, true)).toEqual({ x: 1300, y: 860 });
  });

  it("keeps a dragged resting eye fully on screen", () => {
    const a = clampAnchor({ x: 1.2, y: -0.3 }, 1400, 900, 100);
    const half = formHalfExtent(0);
    expect(a.x * 1400 + half.x * 100).toBeLessThanOrEqual(1400 + 1e-6);
    expect(a.y * 900 - half.y * 100).toBeGreaterThanOrEqual(-1e-6);
  });

  it("hit-tests the resting eye and nothing far from it (click-through elsewhere)", () => {
    expect(onEye(1200, 700, 1200, 700, 100)).toBe(true);
    expect(onEye(1270, 700, 1200, 700, 100)).toBe(true);
    expect(onEye(1200, 820, 1200, 700, 100)).toBe(false);
    expect(onEye(600, 300, 1200, 700, 100)).toBe(false);
  });
});

describe("cropGrid", () => {
  const grid: LumaGrid = { cols: 2, rows: 1, data: Float32Array.of(1, 0) };
  it("returns the grid unchanged when the canvas is the whole viewport", () => {
    expect(cropGrid(grid, { left: 0, top: 0, width: 1400, height: 900 }, 1400, 900)).toBe(grid);
  });
  it("resamples the part behind a smaller canvas", () => {
    const right = cropGrid(grid, { left: 700, top: 0, width: 700, height: 900 }, 1400, 900);
    expect(right.data[1]).toBeLessThan(right.data[0] + 1e-6);
    expect(right.data[1]).toBeCloseTo(0, 5);
  });
});
