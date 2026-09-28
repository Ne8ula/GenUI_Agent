import { describe, expect, it } from 'vitest';
import { createEyeMotion, pointEye, restEye, stepEyeMotion } from '../src/visual/eye-interaction';

describe('Week 1 cursor and tissue response', () => {
  it('bounds gaze and makes orbital tissue follow more slowly than the iris', () => {
    const motion = createEyeMotion(); pointEye(motion, 100, -100);
    const pose = stepEyeMotion(motion, .04, 0, false);
    expect(pose.gazeX).toBeGreaterThan(0); expect(pose.gazeX).toBeLessThanOrEqual(.145);
    expect(pose.gazeY).toBeGreaterThanOrEqual(-.075);
    expect(pose.tissueX).toBeGreaterThan(0); expect(pose.tissueX).toBeLessThan(pose.gazeX);
  });
  it('uses a fast close, brief hold and slower opening rather than a fixed symmetric blink', () => {
    const motion = createEyeMotion(); stepEyeMotion(motion, .02, 2.7, false);
    expect(stepEyeMotion(motion, .02, 2.8, false).closure).toBe(1);
    const reopening = stepEyeMotion(motion, .02, 2.9, false).closure;
    expect(reopening).toBeGreaterThan(0); expect(reopening).toBeLessThan(1);
    expect(stepEyeMotion(motion, .02, 3.1, false).closure).toBe(0);
  });
  it('freezes all pose channels at zero dt after End', () => {
    const motion = createEyeMotion(); pointEye(motion, .1, .03);
    const before = stepEyeMotion(motion, .02, 2.8, false);
    restEye(motion);
    expect(stepEyeMotion(motion, 0, 100, false)).toEqual(before);
  });
  it('uses a static neutral gaze and open lid in reduced motion', () => {
    const motion = createEyeMotion(); pointEye(motion, .1, .03);
    const expected = { gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0, closure: 0, quiet: true };
    expect(stepEyeMotion(motion, .02, 3, true)).toEqual(expected);
    expect(stepEyeMotion(motion, .02, 300, true)).toEqual(expected);
  });
});
