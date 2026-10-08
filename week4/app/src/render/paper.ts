// Shared paper/grain and particle-material constants for both renderer backends.
// Pure constants only (no DOM), so pack.ts and node:test can import them.
//
// Visual reference: packet w4-20261005-paris-p1-converge (P1/A0/E0 + V5): warm cream paper with a
// faint fibrous mottle, pointillist sand/sepia specks with soft edges, no hard pixels, no visible tiling.

/** Authored particle sizes are CSS px at this frame height; device diameter = size × frame.height / AUTHORED_FRAME_HEIGHT. */
export const AUTHORED_FRAME_HEIGHT = 1080;
/** Particles with opacity at or below this are skipped by both backends. */
export const MIN_ALPHA = 0.002;
/** Smallest device diameter a particle is drawn at, in device px. */
export const MIN_DEVICE_DIAMETER = 1;
/** Soft edge as a fraction of the radius: coverage is smoothstep((1 − SOFT_EDGE)·r → r → 0). */
export const SOFT_EDGE = 0.25;
/** Maximum elliptical squash of a disc: the minor axis is at least (1 − MAX_SQUASH) of the major. */
export const MAX_SQUASH = 0.15;
/** Hash salts for the per-slot shape (rng.hash01), shared so both backends draw the same ellipse for the same slot. */
export const SHAPE_ANGLE_SALT = 12;
export const SHAPE_SQUASH_SALT = 11;

/** Paper grain: ±2 % luminance, hashed per device pixel. */
export const GRAIN_AMPLITUDE = 0.02;
/** Warm bias: darker grain is pushed toward red and away from blue by up to this fraction. */
export const GRAIN_WARMTH = 0.012;
/** Deterministic grain salt. */
export const GRAIN_SALT = 1980;
/** The grain repeats every GRAIN_TILE device px (power of two). It is white noise, so the period is not visible. */
export const GRAIN_TILE = 512;

/** Canvas2D budget: above this store count the backend draws a deterministic stride subset and says so in stats.detail. */
export const CANVAS2D_BUDGET = 80_000;
/** Canvas2D draws a fillRect below this device diameter and an ellipse at or above it. */
export const CANVAS2D_RECT_BELOW = 1.6;

// ---- Seed-33 look (packet w4-20261008-paris-c-hybrid, img-13 / VB2): ground + sky, shimmer, tiles ----

/** The sky gradient meets the ground across this soft band (in frame heights), centred on Sky.horizonY. */
export const SKY_BAND = 0.04;
/** Shimmer factor = SHIMMER_BASE + SHIMMER_DEPTH · (0.5 + 0.5 · sin(2π(motion · t + phase))); static particles use 1. */
export const SHIMMER_BASE = 0.55;
export const SHIMMER_DEPTH = 0.45;
/** Hairline opacity as a fraction of its tile's opacity. */
export const HAIRLINE_ALPHA = 0.35;
/** Salt for the per-tile hairline x position (rng.hash01 over the tile's array index). */
export const HAIRLINE_SALT = 33;
/** Smallest tile pattern cell in device px (cells scale with frame.height / 1080 like particle sizes). */
export const MIN_CELL_DEVICE_PX = 2;
/** Dot-grid disc radius as a fraction of the cell pitch. */
export const DOT_RADIUS = 0.3;
/** Scanline thickness in device px. */
export const SCANLINE_PX = 2;
/** Dither: the soft diagonal gradient runs from DITHER_HI (top-left cell) to DITHER_LO (bottom-right cell), thresholded by a 4×4 Bayer matrix. */
export const DITHER_HI = 0.9;
export const DITHER_LO = 0.3;
