/**
 * Shared renderer contracts for the E1 dither-field comparison.
 *
 * Canvas2D and the development-authored WebGL backend both draw the SAME
 * `PointCloudState` (identical seeded points, layout math, cell size, cloud
 * mask, and color mapping). Only the draw call differs between backends.
 */

export type RendererKind = "canvas2d" | "webgl" | "wgpu";

/**
 * 0 = primary dither field ("sun"), 1 = cloud occlusion bound to an available
 * cloud-cover value, 2 = neutral "unknown" indicator used only when cloud
 * cover is unavailable. Tone 2 is deliberately never mixed with tone 0/1 in
 * the same lobe: DESIGN.md/E1 require that a missing cloud reading render as
 * an explicitly unbound neutral rendition, never as an implied clear sky
 * (which would be visually identical to a "0% cloud" tone-1 absence).
 */
export type PointTone = 0 | 1 | 2;

export interface Lobe {
  /** Stable key so point identity (and therefore smooth retargeting) survives re-layout. */
  key: string;
  /** Anchor center in CSS pixels, within the stage's own coordinate space. */
  cx: number;
  cy: number;
  /** Lobe radius in CSS pixels. */
  radius: number;
  /** Point count assigned to this lobe. */
  count: number;
  /** Deterministic seed text (fixture seed + lobe key + revision-independent salt). */
  seed: string;
  tone: PointTone;
  /**
   * "disk" (default) samples a radially-biased filled area, matching a
   * "gathered" field. "ring" samples a thin annulus instead — used for the
   * neutral unknown-cloud indicator so it reads as a distinct halo, not a
   * differently-sized disk that could be mistaken for a specific cloud
   * proportion.
   */
  shape?: "disk" | "ring";
}

export interface FieldColors {
  field: string;
  occlusion: string;
  /** Neutral tone-2 color for an unbound "unknown" cloud reading. */
  unknown: string;
}

export interface RendererStats {
  renderer: RendererKind;
  drawCount: number;
  pointCount: number;
  /** The exact configured target count (2000/8000/etc.), distinct from the
   * rendered `pointCount`, which can differ slightly from lobe rounding. */
  requestedCount: number;
  lastFrameMs: number;
  framesRendered: number;
  settled: boolean;
  contextLost: boolean;
  forcedContinuous: boolean;
}

export interface DrawOptions {
  cellSizePx: number;
  colors: FieldColors;
  widthPx: number;
  heightPx: number;
  dpr: number;
}

export interface FieldBackend {
  readonly kind: RendererKind;
  /** True when the backend could not initialize (e.g. WebGL unavailable/lost). */
  readonly failed: boolean;
  resize(widthPx: number, heightPx: number, dpr: number): void;
  draw(positions: Float32Array, tones: Uint8Array, count: number, options: DrawOptions): void;
  destroy(): void;
}

export type SimulatedFailure = "webgl-context-lost" | "webgl-unavailable" | "canvas-error" | null;
