// Pure, DOM-free helpers shared by the WebGL2 and Canvas2D backends; unit-tested with node:test.
// Both backends derive geometry, shape, grain and the time-driven alpha (birth ramp, shimmer) from these
// functions so they look alike at a glance. Time is always the host clock (view.timeMs), never wall time.
import { BIRTH_RAMP_MS, type ParticleStore, type Rgb } from '../scene/types.ts';
import { hash01 } from '../scene/rng.ts';
import {
  AUTHORED_FRAME_HEIGHT,
  CANVAS2D_BUDGET,
  GRAIN_AMPLITUDE,
  GRAIN_SALT,
  GRAIN_WARMTH,
  MAX_SQUASH,
  MIN_ALPHA,
  MIN_DEVICE_DIAMETER,
  SHAPE_ANGLE_SALT,
  SHAPE_SQUASH_SALT,
  SHIMMER_BASE,
  SHIMMER_DEPTH,
  SOFT_EDGE,
} from './paper.ts';

/**
 * Interleaved vertex layout (floats): x, y (authored frame 0..1), size (authored CSS px), seed (store slot),
 * r, g, b, a (stored opacity), phase (0..1), motion (cycles/s), birthMs (host clock).
 */
export const FLOATS_PER_PARTICLE = 11;
export const BYTES_PER_PARTICLE = FLOATS_PER_PARTICLE * 4;
export const OFFSET_POS = 0;
export const OFFSET_SIZE = 8;
export const OFFSET_SEED = 12;
export const OFFSET_COLOR = 16;
export const OFFSET_PHASE = 32;
export const OFFSET_MOTION = 36;
export const OFFSET_BIRTH = 40;

const TAU = 2 * Math.PI;

/** GLSL-style smoothstep; e1 must be greater than e0. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = x <= e0 ? 0 : x >= e1 ? 1 : (x - e0) / (e1 - e0);
  return t * t * (3 - 2 * t);
}

/** Birth ramp 0..1: smoothstep(birth, birth + BIRTH_RAMP_MS, time), both in host-clock ms. 0 before birth. */
export function birthRamp(birthMs: number, timeMs: number): number {
  return smoothstep(birthMs, birthMs + BIRTH_RAMP_MS, timeMs);
}

/**
 * Shimmer alpha factor for a bead: SHIMMER_BASE + SHIMMER_DEPTH · (0.5 + 0.5 · sin(2π(motion · t + phase)))
 * with t in seconds; exactly 1 for a static particle (motion ≤ 0). Reduced motion is authored upstream as motion 0.
 */
export function shimmerFactor(motion: number, phase: number, timeS: number): number {
  if (!(motion > 0)) return 1;
  return SHIMMER_BASE + SHIMMER_DEPTH * (0.5 + 0.5 * Math.sin(TAU * (motion * timeS + phase)));
}

/** Effective opacity of a particle at host time `timeMs`: stored alpha × birth ramp × shimmer. */
export function particleAlpha(alpha: number, motion: number, phase: number, birthMs: number, timeMs: number): number {
  const a = alpha > 1 ? 1 : alpha;
  return a * birthRamp(birthMs, timeMs) * shimmerFactor(motion, phase, timeMs * 0.001);
}

/**
 * Packs the visible particles of a store (stored a > minAlpha) into `out` in slot order, far → near as authored.
 * The seed lane carries the store slot so per-particle shape stays stable while neighbours fade in and out.
 * Birth ramp and shimmer are not applied here: the stored alpha is packed and the vertex shader applies time.
 * Returns the number of particles packed. `out` must hold FLOATS_PER_PARTICLE × store.capacity floats.
 */
export function packParticles(store: ParticleStore, out: Float32Array, minAlpha: number = MIN_ALPHA): number {
  const n = Math.min(store.count, store.capacity);
  if (out.length < n * FLOATS_PER_PARTICLE) {
    throw new RangeError(`pack buffer holds ${Math.floor(out.length / FLOATS_PER_PARTICLE)} particles, store has ${n}`);
  }
  const { x, y, size, r, g, b, a, phase, motion, birthMs } = store;
  // Compare in float32: the store holds float32 opacities, so 0.002 stored reads back as 0.0020000000949….
  const threshold = Math.fround(minAlpha);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const alpha = a[i]!;
    if (!(alpha > threshold)) continue; // also skips NaN
    out[o] = x[i]!;
    out[o + 1] = y[i]!;
    out[o + 2] = size[i]!;
    out[o + 3] = i;
    out[o + 4] = r[i]!;
    out[o + 5] = g[i]!;
    out[o + 6] = b[i]!;
    out[o + 7] = alpha;
    out[o + 8] = phase[i]!;
    out[o + 9] = motion[i]!;
    out[o + 10] = birthMs[i]!;
    o += FLOATS_PER_PARTICLE;
  }
  return o / FLOATS_PER_PARTICLE;
}

/** Device diameter in px for an authored size at the given frame height; never below MIN_DEVICE_DIAMETER. */
export function deviceDiameter(size: number, frameHeightPx: number): number {
  const d = size * (frameHeightPx / AUTHORED_FRAME_HEIGHT);
  return d > MIN_DEVICE_DIAMETER ? d : MIN_DEVICE_DIAMETER; // NaN → minimum
}

/** Clamps a point size to the implementation range (gl.ALIASED_POINT_SIZE_RANGE as [min, max]). */
export function clampPointSize(diameter: number, range: ArrayLike<number>): number {
  const lo = range[0] ?? MIN_DEVICE_DIAMETER;
  const hi = range[1] ?? diameter;
  return diameter < lo ? lo : diameter > hi ? hi : diameter;
}

/**
 * Canvas2D arc radius with the same integrated coverage as the WebGL soft disc, whose coverage
 * falls from 1 to 0 across the outer SOFT_EDGE of the radius: r·(1 − SOFT_EDGE / 2).
 */
export function canvas2dRadius(deviceDiameterPx: number): number {
  return deviceDiameterPx * 0.5 * (1 - SOFT_EDGE / 2);
}

/** Deterministic Canvas2D stride so that ceil(count / stride) ≤ budget; 1 when the store fits the budget. */
export function canvas2dStride(count: number, budget: number = CANVAS2D_BUDGET): number {
  return count > budget ? Math.ceil(count / budget) : 1;
}

/** Number of slots visited by a strided walk over `count` slots. */
export function stridedCount(count: number, stride: number): number {
  return count <= 0 ? 0 : Math.ceil(count / stride);
}

export interface ParticleShape {
  /** Major-axis angle in radians. */
  angle: number;
  /** Minor / major axis ratio in [1 − MAX_SQUASH, 1]. */
  squash: number;
}

/** Per-slot elliptical irregularity (≤ MAX_SQUASH), identical in both backends. */
export function particleShape(slot: number, out: ParticleShape = { angle: 0, squash: 1 }): ParticleShape {
  out.angle = 2 * Math.PI * hash01(slot, SHAPE_ANGLE_SALT);
  out.squash = 1 - MAX_SQUASH * hash01(slot, SHAPE_SQUASH_SALT);
  return out;
}

/** Integer 2-D hash in [0, 1). The WebGL2 paper shader implements the same arithmetic on uints. */
export function grainHash(x: number, y: number, salt: number): number {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Two-octave grain value in [0, 1): 60 % single-pixel noise, 40 % two-pixel cells, so it reads as fibre rather than static. */
export function grainNoise(x: number, y: number, salt: number = GRAIN_SALT): number {
  return 0.6 * grainHash(x, y, salt) + 0.4 * grainHash(x >> 1, y >> 1, salt + 1);
}

/** Luminance factor for a grain value: 1 ± GRAIN_AMPLITUDE. */
export function grainLuminance(n: number): number {
  return 1 + GRAIN_AMPLITUDE * (2 * n - 1);
}

/** Paper colour with grain applied: luminance ±GRAIN_AMPLITUDE and a warm shift of up to ±GRAIN_WARMTH on darker grain. */
export function grainRgb(paper: Rgb, n: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const lum = grainLuminance(n);
  const warm = (0.5 - n) * 2 * GRAIN_WARMTH;
  out[0] = clamp01(paper[0] * lum * (1 + warm));
  out[1] = clamp01(paper[1] * lum);
  out[2] = clamp01(paper[2] * lum * (1 - warm));
  return out;
}

/** Opaque RGBA pixels of a size × size grain tile for the Canvas2D pattern (size should be GRAIN_TILE). */
export function grainTile(size: number, paper: Rgb, salt: number = GRAIN_SALT): Uint8ClampedArray {
  if (!Number.isInteger(size) || size <= 0) throw new RangeError('grain tile size must be a positive integer');
  const px = new Uint8ClampedArray(size * size * 4);
  const rgb: [number, number, number] = [0, 0, 0];
  let o = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      grainRgb(paper, grainNoise(x, y, salt), rgb);
      px[o] = Math.round(rgb[0] * 255);
      px[o + 1] = Math.round(rgb[1] * 255);
      px[o + 2] = Math.round(rgb[2] * 255);
      px[o + 3] = 255;
      o += 4;
    }
  }
  return px;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
