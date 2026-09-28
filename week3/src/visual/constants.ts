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

/**
 * Eye-identity shape constants (revision w3-20260927-01/02 follow-up).
 * Applied only at pixel-conversion time in render.ts so the pure scalar
 * grammar in grammar.ts stays a simple radius(theta) model. EYE_ASPECT_X/Y
 * stretch the silhouette into a wide lens. The corner taper is applied to
 * the vertical (Y) extent *only* -- tapering both axes together (the
 * w3-20260927-02 capture) shrinks the horizontal reach exactly at the
 * corners too, producing a pinched-waist "hourglass/bowtie" instead of a
 * silhouette that tapers smoothly to a point while staying at full width.
 */
export const EYE_ASPECT_X = 1.28;
export const EYE_ASPECT_Y = 0.74;
export const EYE_PINCH_STRENGTH = 0.62;
export const EYE_PINCH_POWER = 8;

/** Discrete polar-grid cell cap for the digital pixel-matrix material. */
export const MAX_MATRIX_CELLS = 3500;

/** Total rendered tracking-box cap (runtime anchors plus render-local companions). */
export const MAX_TRACKING_BOXES = 48;

/** Horizontal data-smear ribbon cap, active only while processing. */
export const MAX_SMEAR_BANDS = 28;

/**
 * Ceiling, as a fraction of min(viewport width, height), on the
 * *aspect-adjusted* worst-case horizontal reach (grammar.ts's
 * composeGrammar already multiplies its pre-aspect scalar budget by
 * EYE_ASPECT_X before comparing against this constant). Tuned against the
 * actual envelope ranges in grammar.ts so a typical draw for four of the
 * five families never needs scaling at all, and only congratulatory's
 * (deliberately biggest/burstiest) upper tail is gently pulled down; that
 * plus the tracking-box half size still leaves a generous margin inside
 * the stage (week3 revision w3-20260927-01 feedback: "silhouette badly
 * CLIPPED top/bottom" / "composition now radius scales >viewport").
 */
export const SAFE_RADIUS_FRACTION = 0.36;

/** Hard pixel-space clamp applied right before drawing, as a second, independent safety net. */
export const MAX_RENDER_RADIUS_FRACTION = 0.42;

/** How much each additional ribbon layer spreads outward from the core. */
export const LAYER_SPREAD_FACTOR = 0.12;

/**
 * Time constant for expressive "energy" releasing back to the neutral
 * baseline once a turn stops speaking (owner steering, 2026-09-27: "release
 * bloom/energy over ~1-2s instead of endlessly celebrating between turns").
 * Rising back to full expression when speaking begins uses the current
 * stance's own attackSmoothTime instead, so the bloom-in keeps its
 * per-family character; only the release-to-neutral rate is fixed.
 */
export const ENERGY_RELEASE_SMOOTH_TIME = 0.45;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
