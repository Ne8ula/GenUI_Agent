import type { FieldTargets } from "./fieldLayout";

// Sub-pixel and well under the 4px dither cell size, so it is visually
// indistinguishable from an exact match while letting the exponential
// smoothing (which asymptotically approaches, but never exactly reaches,
// its target) settle in roughly the authored transition duration rather
// than several extra tau periods.
const SETTLE_EPSILON_PX = 0.75;

/**
 * Renderer-agnostic animation state shared by both backends.
 *
 * Motion is framerate-independent exponential smoothing of "current" toward
 * "target" — never a fixed keyframe timeline. That makes every update
 * automatically retargetable: if the target changes mid-flight (a new
 * selection, a drag, a stop), the next tick simply chases the new target
 * from wherever the points currently are. `stop()` (via `freeze()`) halts
 * the chase entirely, preserving the exact current geometry.
 */
export class PointCloudState {
  private current: Float32Array = new Float32Array(0);
  private target: Float32Array = new Float32Array(0);
  private tones: Uint8Array = new Uint8Array(0);
  private keys: string[] = [];
  private frozen = false;

  count = 0;

  setTargets(targets: FieldTargets, gatherNew = false): void {
    const { points, tones, keys, totalCount } = targets;
    if (totalCount !== this.count || keys.some((key, index) => key !== this.keys[index])) {
      const nextCurrent = new Float32Array(totalCount * 2);
      const centers = new Map<string, { x: number; y: number; count: number }>();
      if (gatherNew) {
        for (let i = 0; i < totalCount; i++) {
          const group = keys[i].slice(0, keys[i].lastIndexOf(":"));
          const center = centers.get(group) ?? { x: 0, y: 0, count: 0 };
          center.x += points[i * 2]; center.y += points[i * 2 + 1]; center.count++;
          centers.set(group, center);
        }
      }
      // Existing particles keep their actual displayed positions. New material
      // can gather from a deterministic spread around its own spatial target.
      const priorIndexByKey = new Map<string, number>();
      for (let i = 0; i < this.keys.length; i += 1) priorIndexByKey.set(this.keys[i], i);
      for (let i = 0; i < totalCount; i += 1) {
        const priorIndex = priorIndexByKey.get(keys[i]);
        if (priorIndex !== undefined) {
          nextCurrent[i * 2] = this.current[priorIndex * 2];
          nextCurrent[i * 2 + 1] = this.current[priorIndex * 2 + 1];
        } else {
          const center = centers.get(keys[i].slice(0, keys[i].lastIndexOf(":")));
          const x = points[i * 2], y = points[i * 2 + 1];
          nextCurrent[i * 2] = center ? x + (x - center.x / center.count) * 0.4 : x;
          nextCurrent[i * 2 + 1] = center ? y + (y - center.y / center.count) * 0.4 : y;
        }
      }
      this.current = nextCurrent;
    }
    this.target = points;
    this.tones = tones;
    this.keys = keys;
    this.count = totalCount;
    this.frozen = false;
  }

  /** Interrupts the chase; current geometry is retained exactly as-is. */
  freeze(): void {
    this.frozen = true;
  }

  /** Snap instantly to target (reduced motion / plain answer / settled score). */
  snapToTarget(): void {
    this.current.set(this.target.subarray(0, this.current.length));
    this.frozen = false;
  }

  tick(dtMs: number, tauMs: number): void {
    if (this.frozen || this.count === 0) return;
    const clampedDt = Math.max(0, Math.min(dtMs, 100));
    const alpha = 1 - Math.exp(-clampedDt / Math.max(16, tauMs));
    for (let i = 0; i < this.current.length; i += 1) {
      this.current[i] += (this.target[i] - this.current[i]) * alpha;
    }
  }

  isSettled(): boolean {
    if (this.frozen) return true;
    for (let i = 0; i < this.current.length; i += 1) {
      if (Math.abs(this.target[i] - this.current[i]) > SETTLE_EPSILON_PX) return false;
    }
    return true;
  }

  getCurrent(): Float32Array {
    return this.current;
  }

  getTones(): Uint8Array {
    return this.tones;
  }
}
