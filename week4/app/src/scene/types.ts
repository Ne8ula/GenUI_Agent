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
}

export interface RendererStats {
  backend: Backend;
  lastDrawMs: number;
  particlesDrawn: number;
  /** True while a lost WebGL2 context has paused drawing (a GL-bound canvas cannot switch to Canvas2D). */
  degraded: boolean;
  /** Human-readable backend detail, e.g. the unmasked WebGL renderer string, or null. */
  detail: string | null;
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
