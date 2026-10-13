// Shared contracts between the authored scene, idle life and the renderers.
// Everything is data: the renderers receive particle arrays, never code or authority.
import type { Band } from '../../../core/scene.ts';

export type { Band };

/** sRGB components in 0..1. */
export type Rgb = readonly [number, number, number];

export interface RegionSpec {
  /** Stable scene ID from fixtures/scenes/paris-1980s-terrace.json, optionally with a '/part' suffix. */
  id: string;
  band: Band;
  /** Core-frame depth in virtual metres (z toward the viewer; the cup plane is 0). Used from step 2. */
  depth: number;
  /** Particle slot range [start, end) in the store; fixed for the scene's lifetime (ID continuity). */
  start: number;
  end: number;
  /** True when idle life rewrites these particles every frame (steam, smoke, walkers). */
  dynamic: boolean;
}

/** Structure-of-arrays particle store. Slot index is particle identity and never moves. */
export interface ParticleStore {
  readonly capacity: number;
  count: number;
  /** Authored frame coordinates for the neutral seat: x 0..1 left→right, y 0..1 top→bottom. */
  x: Float32Array;
  y: Float32Array;
  /** Core-frame depth (metres). Renderers use it only for ordering in step 1. */
  z: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
  /** Opacity 0..1. Zero means the slot is present but invisible (life may fade it in). */
  a: Float32Array;
  /** Diameter in CSS px at a 1080-px-tall frame; renderers scale by frame.height / 1080. */
  size: Float32Array;
  /** Index into SceneFrame.regions. */
  region: Uint16Array;
  /** Bead phase 0..1: offsets the time-driven shimmer so neighbours never pulse together. */
  phase: Float32Array;
  /** Shimmer speed in cycles per second; 0 means a static particle (no time-driven change). */
  motion: Float32Array;
  /** Host-clock time (ms) at which this particle becomes visible; renderers ramp alpha in over BIRTH_RAMP_MS after it. */
  birthMs: Float32Array;
}

export type TilePattern = 'transparent' | 'flat' | 'dither' | 'dotgrid' | 'scanline';

/** A hard-edged rectangular tile floating over a region (authored frame coordinates, 0..1). */
export interface Tile {
  /** Stable tile ID, e.g. 'tile:facade-left/03'. Identity never changes; only its state does. */
  id: string;
  /** Index into SceneFrame.regions of the region it belongs to (its depth order decides when it calms). */
  region: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pattern: TilePattern;
  /** Pattern colour (the light tone for dither/dotgrid/scanline, the fill for flat). */
  colour: Rgb;
  alpha: number;
  /** Pattern cell size in CSS px at a 1080-px-tall frame (dither cell, dot pitch, scanline pitch). */
  cellPx: number;
  /** Length of the 1-px hairline dropping from the tile's bottom edge, in frame-height units (0 = none). */
  hairline: number;
  /** Host-clock time (ms) at which the tile becomes visible. */
  birthMs: number;
}

/** Sky gradient above the roofline; below `horizonY` the ground colour (SceneFrame.paper) shows. */
export interface Sky {
  top: Rgb;
  horizon: Rgb;
  /** Frame y (0..1) where the gradient meets the ground tone; the blend band is soft (about 0.04). */
  horizonY: number;
  /**
   * Optional clip: the visible sky region as a simple polygon in frame coordinates (the wedge between the
   * rooflines). Outside it the ground shows (the dark building masses). Absent = full frame width.
   */
  polygon?: readonly (readonly [number, number])[];
}

export interface BuildSpec {
  /** Length of the construction (build-in) in host-clock ms; 0 means the scene is complete at t = 0. */
  durationMs: number;
}

/**
 * Reference-derived photo layer for the seed-33 fidelity rebuild (w4-20261008-seed33-fidelity-r1).
 * Owner-authorized exception for this pass only (AskUserQuestion, 2026-10-08): runtime texture reads
 * of seed-33-derived pixels, combined with live geometry/shaders/animation. Extracted by the project's
 * extraction script from the approved still (img-13); see manifestSrc for source hashes, the figure's
 * actual crop box and the real tile-chip source rectangles (candidate-2 correction, 2026-10-08: main
 * owns extraction/public asset content; this module only consumes the stable manifest contract). Not a
 * whole-frame video or frame atlas: every source here is a still image driven by live pose/deform/life
 * math (seed33Photo.ts); figure/tile pixel dimensions are read from the manifest or the decoded bitmap
 * at runtime, never hard-coded, so this module needs no edit when the asset content changes.
 */
export interface PhotoLayer {
  /** Everything except the near woman and the near café furniture (buildings, sky, lamps, far walkers, pavement); now has no tile chips baked in (those are the separate tiles atlas). */
  backgroundSrc: string;
  /** RGBA matte of the woman, tightly traced; animated at runtime (seed33Photo.ts). */
  figureSrc: string;
  /** Full-frame RGBA cutout of the table/saucer/cup/ashtray (transparent elsewhere), redrawn on top of the figure so it occludes her as she nears the camera; has no tile chips baked in. */
  foregroundSrc: string;
  /** Optional post-formation occlusion layer; construction keeps using foregroundSrc. */
  settledForegroundSrc?: string;
  /** The real tile-chip pixels (26 source crops), drawn as independent textured quads, never procedural patterns. */
  tilesSrc: string;
  /** manifest.json: source hashes, the figure's actual crop box (home placement) and the tile regions (id/rectNorm/sourceBoxPx/group). Fetched once at runtime (see render/photoAssets.ts loadPhotoManifest), not duplicated here. */
  manifestSrc: string;
}

/** One real source tile chip (candidate-2: actual pixel crops, not a procedural dither/dotgrid pattern). */
export interface PhotoTileRegion {
  id: string;
  /** Position/size in the background frame, normalised 0..1: [x, y, w, h] (manifest.tiles.regions[].rect). */
  rectNorm: readonly [number, number, number, number];
  /** Box corners within the tiles atlas image, in atlas pixels: [x0, y0, x1, y1] (manifest.tiles.regions[].sourceBoxPx, NOT x/y/w/h). */
  sourceBoxPx: readonly [number, number, number, number];
  group: 'left' | 'right' | 'table';
}

/** The parsed, runtime-fetched manifest contract the photo layer depends on (candidate-2, stable schema). */
export interface PhotoManifestData {
  /** The figure's own crop box in the background frame, normalised 0..1: [x0, y0, x1, y1]. This IS the
   * figure's home (build-complete) placement — no separately-authored offset is added to it. */
  figureHomeRectNorm: readonly [number, number, number, number];
  /** Atlas pixel size [width, height], for converting sourceBoxPx to UV without decoding the bitmap first. */
  tilesAtlasSizePx: readonly [number, number];
  tileRegions: readonly PhotoTileRegion[];
}


/** Renderers ramp a particle or tile in over this many ms after its birth. */
export const BIRTH_RAMP_MS = 400;

export interface SceneFrame {
  store: ParticleStore;
  regions: readonly RegionSpec[];
  /** Authored frame aspect (width / height). */
  aspect: number;
  /** Ground colour the renderers clear to (the warm paper of the old arrival scene; the umber-black of the seed-33 scene). */
  paper: Rgb;
  /** Deterministic seed used to author this scene. */
  seed: number;
  /** Sky gradient, or null for scenes that are paper edge to edge. */
  sky: Sky | null;
  /** Tiles drawn after the particles, in array order; life mutates their state in place. */
  tiles: Tile[];
  build: BuildSpec;
  /** Present only for the seed-33 fidelity-rebuild scene (seed33Photo.ts); absent for every other scene. */
  photo?: PhotoLayer;
}

export type Backend = 'webgl2' | 'canvas2d';
export type BackendPreference = Backend | 'auto';

export interface FrameRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FrameView {
  /** Canvas backing-store size in device px and the device scale factor. */
  widthPx: number;
  heightPx: number;
  dpr: number;
  /** Where the authored frame lands in the canvas (contain fit), in device px. */
  frame: FrameRect;
  timeMs: number;
  /**
   * The host's current reduced-motion setting. Only the seed-33 photo layer reads this directly (its
   * figure approach must hold at the reference pose without a rebuild or a clock change, see
   * seed33Photo.ts); every other effect keeps deriving reduced motion from the frame data itself
   * (store.motion already zeroed, tiles already held) as before.
   */
  reducedMotion: boolean;
  /**
   * The host's current tiles-visibility setting. The seed-33 photo layer's real source-chip tile atlas
   * (candidate-2) is drawn entirely by the renderer from a runtime-fetched manifest, outside the
   * `SceneFrame.tiles` / `frameForDraw` mechanism the procedural tile system used, so it needs its own
   * signal here; every other look keeps using `frame.tiles` as before.
   */
  showTiles: boolean;
}

export interface RendererStats {
  backend: Backend;
  lastDrawMs: number;
  particlesDrawn: number;
  /** True while a lost WebGL2 context has paused drawing (a GL-bound canvas cannot switch to Canvas2D). */
  degraded: boolean;
  /** Human-readable backend detail, e.g. the unmasked WebGL renderer string, or null. */
  detail: string | null;
  /**
   * False while a scene's photo-layer textures (seed33Photo.ts) are still loading or failed to load;
   * absent (undefined) for scenes with no async assets, which the host treats as always ready. The host
   * never marks a capture frame `data-ready` until this is true, so evidence cannot be taken against an
   * unloaded or partially-drawn texture.
   */
  assetsReady?: boolean;
  /** The seed-33 photo layer's real source-chip tiles actually drawn this frame / known from the manifest (candidate-2: truthful counts, not the old authorTiles total). Absent for scenes with no photo-tile atlas. */
  photoTiles?: { shown: number; authored: number };
}

export interface Renderer {
  readonly backend: Backend;
  /**
   * Draws one whole frame: ground, sky, then every visible particle in store order (far → near), then tiles
   * and their hairlines. Time-driven effects (birth ramps, shimmer) read view.timeMs only. Never blocks.
   */
  draw(frame: SceneFrame, view: FrameView): void;
  stats(): RendererStats;
  dispose(): void;
}
