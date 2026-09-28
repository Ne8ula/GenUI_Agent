import { describe, expect, it } from 'vitest';
import { createEyeMesh, drawEyeMesh, projectEyePoint } from '../src/visual/eye-mesh';
import { createAnimationRuntime, advanceRuntime, buildFrame } from '../src/visual/runtime';

describe('shared eye mesh projection', () => {
  it('keeps the resting source eye exactly unwarped, not merely near neutral', () => {
    const runtime = createAnimationRuntime();
    const props = { state: 'idle' as const, stance: 'attentive' as const, seed: 7, intensity: .5, active: true, reducedMotion: false };
    for (let i = 0; i < 90; i++) advanceRuntime(runtime, props, 1 / 45);
    expect(Object.values(buildFrame(runtime, props).warp)).toEqual([0, 0, 0, 0, 0]);
    expect(buildFrame(runtime, props).phosphor).toEqual([1, .23, .2]);
  });
  it('reproduces affine mappings for pixels and feature points', () => {
    const mesh = createEyeMesh(200, 100, (x, y) => ({ x: 30 + x * 2 + y * .2, y: 50 - x * .1 + y * 3 }));
    for (const [x, y] of [[0, 0], [17, 41], [150, 75], [200, 100]]) {
      const point = projectEyePoint(mesh, x, y);
      expect(point.x).toBeCloseTo(30 + x * 2 + y * .2, 8);
      expect(point.y).toBeCloseTo(50 - x * .1 + y * 3, 8);
    }
  });
  it('uses the painted triangle interpolation, not an unrelated nonlinear point warp', () => {
    const mesh = createEyeMesh(100, 50, (x, y) => ({ x: x * x / 100, y }), 2, 1);
    expect(projectEyePoint(mesh, 25, 10).x).toBe(12.5);
    expect(projectEyePoint(mesh, 25, 10).x).not.toBe(6.25);
  });
  it('caps mesh resources and rejects invalid projections', () => {
    expect(() => createEyeMesh(200, 100, (x, y) => ({ x, y }), 100, 100)).toThrow();
    expect(() => createEyeMesh(200, 100, () => ({ x: NaN, y: 0 }))).toThrow();
  });
  it('draws exactly two bounded affine triangles per mesh cell', () => {
    let draws = 0, transforms = 0;
    const ctx = { save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, transform(...values: number[]) { expect(values.every(Number.isFinite)).toBe(true); transforms++; }, drawImage() { draws++; } } as unknown as CanvasRenderingContext2D;
    const mesh = createEyeMesh(200, 100, (x, y) => ({ x, y }), 4, 2);
    drawEyeMesh(ctx, {} as HTMLCanvasElement, mesh);
    expect(draws).toBe(16); expect(transforms).toBe(16);
  });
});
