/**
 * Shared bounds for the procedural eye renderer.
 *
 * These caps exist so a live session (fresh crypto seeds, unbounded runtime)
 * cannot grow resource usage: a fixed maximum number of harmonics, layers,
 * tracking boxes and fragmentation streaks are allocated once and reused for
 * the lifetime of a mounted <EyeStage>. See week3/DESIGN.md#6 (motion
 * grammar) and week3/PLANNING.md#2 (bounded variable geometry, bounded box
 * count) for the requirements these constants encode.
 */

/** Device pixel ratio ceiling for the backing canvas (perf/resource bound). */
export const DPR_CAP = 1.5;

/** Fixed harmonic slots sampled by every composition (k = index + 1). */
export const HARMONIC_INDICES = [1, 2, 3, 4, 5, 6] as const;
export const MAX_HARMONICS = HARMONIC_INDICES.length;

/** Fixed ribbon/fold layer slots; unused layers spring their opacity to 0. */
export const MAX_LAYERS = 5;

/** Fixed tracking-box slots; unused slots spring their opacity to 0. */
export const MAX_BOXES = 6;

/** Fragmentation/streak particle cap, active only while processing. */
export const MAX_STREAKS = 36;

/** Bounded recent-composition memory (no conversational content, numbers only). */
export const COMPOSITION_MEMORY_SIZE = 4;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
