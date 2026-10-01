/**
 * Canvas2D drawing for one EyeFrame. Bounded CPU path only (no WebGL/wgpu,
 * per the GPU quarantine).
 *
 * Revision history:
 * - w3-20260927-01/02: an invented abstract silhouette (anisotropic
 *   "eye-aspect" disc + dense polar pixel matrix). The owner rejected this
 *   direction outright: it must be the *actual* Week 1 eye (SignalEye.tsx:
 *   red phosphor, square pupil, 4x4 ordered Bayer dithering, gaze/tissue
 *   responsiveness), transformed into the five stance forms, never an
 *   independent invented shape.
 * - This revision: the source eye now comes from `./week1-eye`
 *   (`rasterizeWeek1Eye`), a separately authored CPU port of the exact
 *   SignalEye.tsx shader equations. render.ts owns turning that raster +
 *   its 19 feature landmarks into the five distinct stance forms (via
 *   `warpPoint`, one authored coordinate warp applied identically to a
 *   triangulated-mesh sampling of the raster *and* to the landmarks, so tracking
 *   boxes stay attached to the actual warped eye) and the digital-material
 *   overlay (dense tracking-box field, only-while-processing data-smear
 *   ribbons).
 * - Performance: a 280x140 raster measured ~35.7ms warm -- far too slow to
 *   redo every animation frame (renderer target 45Hz, matching the
 *   accepted Week 1 cap). `ensureRaster` below rasterizes at a bounded
 *   ~224x112 (~192x96 for even tighter budgets) and caches the result,
 *   refreshing only every `RASTER_REFRESH_INTERVAL_MS` (~30Hz); the warp
 *   and digital-material overlay (cheap pure math + canvas rect/line
 *   drawing) still run on every `drawEye` call, so geometry/boxes track the
 *   live pose at the full frame rate even while the underlying pixel
 *   raster is briefly stale. `interaction.quiet` (a settled/reduced-motion
 *   single draw) bypasses the throttle and uses a larger, higher-quality
 *   raster instead, since it is not repeated every frame.
 */

import { clamp01, MAX_TRACKING_BOXES, MAX_SMEAR_BANDS } from "./constants";
import { PALETTE, withAlpha } from "./palette";
import { buildSmearBands, buildTrackingBoxesFromLandmarks, type DigitalColorKey, type LandmarkPoint } from "./digital-material";
import { rasterizeWeek1Eye, type EyeInteraction, type Week1Pose } from "./week1-eye";
import type { EyeFrame, WarpChannels } from "./runtime";
import { createGlitchState, glitchEnvelope, stepGlitches, type GlitchEvent, type GlitchState } from "./glitch";
import { compositePixel, hexToRgb, inkTint, inkWeight, lumaAt, materialColor, rgba, type LumaGrid, type Rgb } from "./backdrop";
import { formCenter } from "./placement";
import { cellHash, formationStrength, formationTarget, formationVariation, formationWeights, perspective, releaseDelay, releaseProgress, tilt, type FormationVariation, type ParticlePoint } from "./particles";

export type { EyeInteraction, Week1Pose } from "./week1-eye";

export const DEFAULT_EYE_INTERACTION: EyeInteraction = {
  gazeX: 0,
  gazeY: 0,
  tissueX: 0,
  tissueY: 0,
  closure: 0,
  quiet: false,
};

// Bounded well under week1-eye.ts's own 360x180 / 64,800px hard cap. 224x112
// keeps the per-frame-refresh raster within budget; a settled/quiet single
// draw affords a larger, sharper one-off raster instead.
const LIVE_RASTER_WIDTH = 192;
const LIVE_RASTER_HEIGHT = 96;
const QUIET_RASTER_WIDTH = 320;
const QUIET_RASTER_HEIGHT = 160;
const RASTER_REFRESH_INTERVAL_MS = 1000 / 30;

/** Normalized-eye-unit size as a fraction of min(viewport): small at rest, grown while speaking. */
const REST_SCALE = 0.22;
const SPEAKING_SCALE = 0.4;
/** Particle splat buffer width cap (the buffer is drawn scaled to the canvas). */
const PARTICLE_BUFFER_MAX_WIDTH = 820;
const FORMATION_TILT = -0.28;

interface ParticleBuffers {
  width: number;
  height: number;
  accum: Float32Array;
  image: ImageData | null;
  canvas: HTMLCanvasElement | null;
  glow: HTMLCanvasElement | null;
  /** Quarter-resolution light-only accumulation for the soft bloom (never ink: no dark haze). */
  glowAccum: Float32Array;
  glowImage: ImageData | null;
  positions: Float32Array;
}

const particleBuffers = new WeakMap<CanvasRenderingContext2D, ParticleBuffers>();
interface VariationMemory {
  seed: number;
  variation: FormationVariation;
  previous?: FormationVariation;
  /** Animation clock when this variation arrived; the previous one blends out from here. */
  changedAt: number;
}

const variationMemory = new WeakMap<CanvasRenderingContext2D, VariationMemory>();
const glitchStates = new WeakMap<CanvasRenderingContext2D, GlitchState>();

/** 0..1 progress of the current composition handover (1 = settled). */
function variationHandover(ctx: CanvasRenderingContext2D, timeSec: number): number {
  const remembered = variationMemory.get(ctx);
  if (!remembered || !remembered.previous) return 1;
  return clamp01((timeSec - remembered.changedAt) / VARIATION_BLEND_SECONDS);
}
/** Seconds to morph from one occurrence's composition to the next without a jump. */
const VARIATION_BLEND_SECONDS = 1.2;

function ensureParticleBuffers(ctx: CanvasRenderingContext2D, width: number, height: number, cells: number): ParticleBuffers {
  const bufferWidth = Math.max(1, Math.round(Math.min(width, PARTICLE_BUFFER_MAX_WIDTH)));
  const bufferHeight = Math.max(1, Math.round(height * (bufferWidth / width)));
  let buffers = particleBuffers.get(ctx);
  if (!buffers || buffers.width !== bufferWidth || buffers.height !== bufferHeight || buffers.positions.length !== cells * 2) {
    const hasDom = typeof document !== "undefined" && typeof ImageData !== "undefined";
    const canvas = hasDom ? document.createElement("canvas") : null;
    const glow = hasDom ? document.createElement("canvas") : null;
    if (canvas) { canvas.width = bufferWidth; canvas.height = bufferHeight; }
    const glowWidth = Math.max(1, Math.ceil(bufferWidth / 4));
    const glowHeight = Math.max(1, Math.ceil(bufferHeight / 4));
    if (glow) { glow.width = glowWidth; glow.height = glowHeight; }
    buffers = {
      width: bufferWidth,
      height: bufferHeight,
      accum: new Float32Array(bufferWidth * bufferHeight * 3),
      image: hasDom ? new ImageData(bufferWidth, bufferHeight) : null,
      canvas,
      glow,
      glowAccum: new Float32Array(glowWidth * glowHeight * 3),
      glowImage: hasDom ? new ImageData(glowWidth, glowHeight) : null,
      positions: new Float32Array(cells * 2),
    };
    particleBuffers.set(ctx, buffers);
  }
  return buffers;
}

interface CellCache {
  width: number;
  height: number;
  hx: Float32Array;
  hy: Float32Array;
  hz: Float32Array;
  /** Oval fade matching the approved rest-eye reference (no rectangular panel edge). */
  oval: Float32Array;
  keep: Float32Array;
  h4: Float32Array;
  h5: Float32Array;
  h6: Float32Array;
  h8: Float32Array;
  h9: Float32Array;
}

const cellCaches = new Map<string, CellCache>();

function ensureCellCache(width: number, height: number): CellCache {
  const key = `${width}x${height}`;
  const existing = cellCaches.get(key);
  if (existing) return existing;
  const cells = width * height;
  const aspect = height / width;
  const cache: CellCache = {
    width, height,
    hx: new Float32Array(cells), hy: new Float32Array(cells), hz: new Float32Array(cells),
    oval: new Float32Array(cells), keep: new Float32Array(cells),
    h4: new Float32Array(cells), h5: new Float32Array(cells), h6: new Float32Array(cells),
    h8: new Float32Array(cells), h9: new Float32Array(cells),
  };
  for (let row = 0, i = 0; row < height; row++) {
    for (let col = 0; col < width; col++, i++) {
      // Sub-cell jitter so particles never sit on a visible grid.
      const hx = ((col + 0.5 + (cellHash(i, 11) - 0.5) * 0.9) / width - 0.5) * 2;
      const hy = ((row + 0.5 + (cellHash(i, 12) - 0.5) * 0.9) / height - 0.5) * 2 * aspect;
      cache.hx[i] = hx;
      cache.hy[i] = hy;
      cache.hz[i] = 0.2 * (1 - hx * hx * 0.7 - hy * hy * 2) + (cellHash(i, 13) - 0.5) * 0.12;
      const radial = Math.hypot(hx / 0.96, hy / 0.44);
      const fade = clamp01((radial - 0.72) / 0.32);
      cache.oval[i] = 1 - fade * fade * (3 - 2 * fade);
      cache.keep[i] = cellHash(i, 14);
      cache.h4[i] = cellHash(i, 4);
      cache.h5[i] = cellHash(i, 5) * 20;
      cache.h6[i] = cellHash(i, 6) * 20;
      cache.h8[i] = cellHash(i, 8);
      cache.h9[i] = cellHash(i, 9);
    }
  }
  if (cellCaches.size > 4) cellCaches.clear();
  cellCaches.set(key, cache);
  return cache;
}

/**
 * Splat every raster cell of the source eye as a particle with depth
 * (particles.ts). No stage (batch w3-cloud-20260929-b): accumulated light
 * becomes alpha, so black is fully transparent and the desktop shows through.
 * Each pixel's material follows the backdrop behind it (backdrop.ts): light
 * over dark, pigment over bright, one form. Returns each cell's
 * projected canvas position (landmark cells always; others only when drawn)
 * so tracking boxes follow the moving particles.
 */
function drawParticleField(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cx: number,
  cy: number,
  displayScale: number,
  rasterWidth: number,
  rasterHeight: number,
  data: Uint8ClampedArray,
  landmarks: Array<{ x: number; y: number }>,
  frame: EyeFrame,
  quiet: boolean,
  backdrop: LumaGrid | null,
): Float32Array {
  const cells = rasterWidth * rasterHeight;
  const buffers = ensureParticleBuffers(ctx, width, height, cells);
  const cache = ensureCellCache(rasterWidth, rasterHeight);
  const { accum, positions } = buffers;
  const bw = buffers.width;
  const bh = buffers.height;
  const k = bw / width;
  accum.fill(0);

  const landmarkCells = new Set<number>();
  for (const lm of landmarks) {
    landmarkCells.add(Math.min(rasterHeight - 1, Math.max(0, Math.round(lm.y))) * rasterWidth + Math.min(rasterWidth - 1, Math.max(0, Math.round(lm.x))));
  }
  const aspect = rasterHeight / rasterWidth;
  const pupilLandmark = landmarks[10] ?? { x: rasterWidth / 2, y: rasterHeight / 2 };
  const pupilX = ((pupilLandmark.x + 0.5) / rasterWidth - 0.5) * 2;
  const pupilY = ((pupilLandmark.y + 0.5) / rasterHeight - 0.5) * 2 * aspect;
  const weights = formationWeights(frame.warp);
  const strength = formationStrength(frame.warp);
  // A fresh composition (new turn or stance) carries a fresh seeded variation of its
  // formation, never repeating either of the previous two compositions' archetypes.
  let remembered = variationMemory.get(ctx);
  if (!remembered || remembered.seed !== frame.fragmentSeed) {
    remembered = {
      seed: frame.fragmentSeed,
      variation: formationVariation(frame.fragmentSeed, remembered?.variation, remembered?.previous),
      previous: remembered?.variation,
      changedAt: frame.timeSec,
    };
    variationMemory.set(ctx, remembered);
  }
  const variation = remembered.variation;
  // Retarget continuity: morph from the previous occurrence's composition instead of
  // jumping. Static draws (reduced motion, frozen End) show the new composition directly.
  const blendLinear = quiet || !remembered.previous ? 1 : clamp01((frame.timeSec - remembered.changedAt) / VARIATION_BLEND_SECONDS);
  const variationBlend = blendLinear * blendLinear * (3 - 2 * blendLinear);
  const previousVariation = variationBlend < 1 ? remembered.previous : undefined;
  const previousTarget: ParticlePoint = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0 };
  const hasFormation = strength > 0 && weights.comfort + weights.joy + weights.congratulation + weights.supportive > 0;
  const energy = clamp01(frame.energy);
  const fragmentation = clamp01(frame.fragmentation);
  const t = frame.timeSec;
  const live = quiet ? 0 : 1;
  // Joy: part of the eye stays behind as a faint trace while the rest bursts.
  const joyTrace = weights.joy;
  const target: ParticlePoint = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 0 };
  const scale = displayScale * k;
  const ccx = cx * k;
  const ccy = cy * k;

  for (let index = 0; index < cells; index++) {
    const byte = index * 4;
    const coverage = data[byte + 3] / 255;
    const red = data[byte] / 255;
    const green = data[byte + 1] / 255;
    const blue = data[byte + 2] / 255;
    const peak = red > green ? (red > blue ? red : blue) : (green > blue ? green : blue);
    const keep = cache.keep[index];
    // Thin the resting eye so particles read as separate points of light.
    let alpha = peak * coverage * cache.oval[index] * (keep < 0.62 ? 1 : 0.18);
    if (live) alpha *= 0.8 + 0.2 * Math.sin(t * 1.3 + cache.h5[index] * 2);

    const hx = cache.hx[index];
    const hy = cache.hy[index];
    let progress = 0;
    if (hasFormation && energy > 0.001) {
      const pupilDistance = Math.hypot(hx - pupilX, hy - pupilY);
      progress = strength * releaseProgress(energy, releaseDelay(hy, pupilDistance, cache.h4[index]));
      // Joy leaves the eye's red ring (iris rim) and a sparse trace of the eye behind.
      if (joyTrace > 0.01 && (keep < 0.22 || (pupilDistance > 0.17 && pupilDistance < 0.34 && keep < 0.62))) progress *= 1 - joyTrace;
    }
    const isLandmark = landmarkCells.has(index);
    if (alpha < 0.03 && progress < 0.001 && fragmentation < 0.001 && !isLandmark) continue;

    const hasHue = peak > 0.02;
    let r = hasHue ? red / peak : frame.phosphor[0];
    let g = hasHue ? green / peak : frame.phosphor[1];
    let b = hasHue ? blue / peak : frame.phosphor[2];
    let x = hx + live * Math.sin(t * 0.9 + hy * 7) * 0.003;
    let y = hy + live * Math.sin(t * 0.7 + hx * 5) * 0.003;
    let z = cache.hz[index];

    if (progress > 0.001 && formationTarget(index, weights, t, target, variation)) {
      if (previousVariation && formationTarget(index, weights, t, previousTarget, previousVariation)) {
        // Each particle hands over at its own staggered moment and travels on a small
        // drifting arc, so the two compositions never average into a collapsed shape.
        const start = cache.h8[index] * 0.6;
        const own = clamp01((variationBlend - start) / 0.4);
        const handover = own * own * (3 - 2 * own);
        const keepOld = 1 - handover;
        const drift = Math.sin(handover * Math.PI) * 0.12;
        target.x += (previousTarget.x - target.x) * keepOld + Math.sin(t * 0.9 + cache.h5[index]) * drift;
        target.y += (previousTarget.y - target.y) * keepOld - drift * 0.6;
        target.z += (previousTarget.z - target.z) * keepOld;
        target.r += (previousTarget.r - target.r) * keepOld;
        target.g += (previousTarget.g - target.g) * keepOld;
        target.b += (previousTarget.b - target.b) * keepOld;
        target.a += (previousTarget.a - target.a) * keepOld;
      }
      tilt(target, FORMATION_TILT);
      const transit = Math.sin(progress * Math.PI);
      const flow = transit * 0.16;
      x += (target.x - x) * progress + Math.sin(t * 0.8 + cache.h5[index]) * flow;
      y += (target.y - y) * progress - transit * 0.1;
      z += (target.z - z) * progress + Math.cos(t * 0.6 + cache.h6[index]) * flow * 0.5;
      r += (target.r - r) * progress;
      g += (target.g - g) * progress;
      b += (target.b - b) * progress;
      // Joy keeps a share of the particles in the shimmer; the rest fade out.
      const joyThin = joyTrace > 0.01 && keep >= 0.6 ? joyTrace : 0;
      alpha += (target.a * (1 - joyThin) - alpha) * progress;
    }

    if (fragmentation > 0.001) {
      // Processing: the eye thins into a sparse white filament point cloud.
      const kept = cache.h8[index] < 0.24 ? 1 : 0.08;
      alpha *= 1 - fragmentation * (1 - kept);
      r += (0.86 - r) * fragmentation * 0.85;
      g += (0.94 - g) * fragmentation * 0.85;
      b += (1 - b) * fragmentation * 0.85;
      x += Math.sin(t * 2.3 + hy * 90) * 0.022 * fragmentation;
    }

    const depth = perspective(z);
    const bx = ccx + x * scale * depth;
    const by = ccy + y * scale * depth;
    positions[index * 2] = bx / k;
    positions[index * 2 + 1] = by / k;
    if (alpha < 0.03) continue;

    const attenuated = alpha * (0.5 + 0.5 * Math.min(1.5, depth)) * 0.75;
    splatParticle(accum, bw, bh, bx, by, r, g, b, attenuated, depth);
    if (fragmentation > 0.001 && cache.h9[index] < 0.1) {
      const split = scale * 0.06 * fragmentation;
      splatParticle(accum, bw, bh, bx - split, by, 1, 0.25, 0.3, attenuated * 0.5, 1);
      splatParticle(accum, bw, bh, bx + split, by, 0.3, 0.55, 1, attenuated * 0.5, 1);
    }
  }

  const tint = inkTint(weights, strength);
  if (buffers.image && buffers.canvas && buffers.glow && buffers.glowImage) {
    const pixels = buffers.image.data;
    const glowAccum = buffers.glowAccum;
    glowAccum.fill(0);
    const gw = buffers.glow.width;
    const scratch: [number, number, number] = [0, 0, 0];
    // Per-column u is constant; the backdrop grid is coarse, so sample ink per 4x4 block.
    let blockInk = 0;
    for (let y = 0, i = 0, j = 0; y < bh; y++) {
      const v = (y + 0.5) / bh;
      const gRow = (y >> 2) * gw;
      for (let x = 0; x < bw; x++, i += 3, j += 4) {
        const ar = accum[i], ag = accum[i + 1], ab = accum[i + 2];
        if (ar + ag + ab < 1e-4) { pixels[j + 3] = 0; continue; }
        if ((x & 3) === 0 || blockInk < 0) blockInk = backdrop ? inkWeight(lumaAt(backdrop, (x + 0.5) / bw, v)) : 0;
        const lightShare = compositePixel(ar, ag, ab, blockInk, tint, pixels, j, scratch);
        if (lightShare > 0.004) {
          const g = (gRow + (x >> 2)) * 3;
          const a = pixels[j + 3] > 0 ? lightShare / 255 : 0;
          glowAccum[g] += pixels[j] * a; glowAccum[g + 1] += pixels[j + 1] * a; glowAccum[g + 2] += pixels[j + 2] * a;
        }
      }
      blockInk = -1;
    }
    const glowPixels = buffers.glowImage.data;
    for (let g = 0, q = 0; g < glowAccum.length; g += 3, q += 4) {
      const gr = glowAccum[g] / 16, gg = glowAccum[g + 1] / 16, gb = glowAccum[g + 2] / 16;
      const m = gr > gg ? (gr > gb ? gr : gb) : (gg > gb ? gg : gb);
      if (m < 1 / 255) { glowPixels[q + 3] = 0; continue; }
      glowPixels[q] = (gr / m) * 255; glowPixels[q + 1] = (gg / m) * 255; glowPixels[q + 2] = (gb / m) * 255; glowPixels[q + 3] = Math.min(1, m) * 255;
    }
    const bufferCtx = buffers.canvas.getContext("2d");
    const glowCtx = buffers.glow.getContext("2d");
    if (!bufferCtx || !glowCtx) throw new Error("Particle buffer unavailable");
    bufferCtx.putImageData(buffers.image, 0, 0);
    glowCtx.putImageData(buffers.glowImage, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buffers.canvas, 0, 0, width, height);
    // Soft bloom from the light share only: over bright areas there is no light, so no haze.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45;
    ctx.drawImage(buffers.glow, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  // Supportive: the one small steady warm light the currents converge on.
  const lightStrength = weights.supportive * strength * clamp01((energy - 0.3) / 0.5);
  if (lightStrength > 0.01) {
    const from = previousVariation ?? variation;
    const peak: ParticlePoint = {
      x: from.lightX + (variation.lightX - from.lightX) * variationBlend,
      y: from.lightY + (variation.lightY - from.lightY) * variationBlend,
      z: 0, r: 0, g: 0, b: 0, a: 0,
    };
    tilt(peak, FORMATION_TILT);
    const depth = perspective(peak.z);
    const lx = cx + peak.x * displayScale * depth;
    const ly = cy + peak.y * displayScale * depth;
    const radius = displayScale * 0.2;
    const ink = backdrop ? inkWeight(lumaAt(backdrop, lx / width, ly / height)) : 0;
    if (ink < 0.999) {
      const glow = lightStrength * (1 - ink);
      const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, radius);
      gradient.addColorStop(0, withAlpha("#ffd9a8", 0.8 * glow));
      gradient.addColorStop(0.16, withAlpha("#ff9f6b", 0.3 * glow));
      gradient.addColorStop(1, withAlpha("#ff9f6b", 0));
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = gradient;
      ctx.fillRect(lx - radius, ly - radius, radius * 2, radius * 2);
    }
    if (ink > 0.001) {
      // Over bright areas the warm light becomes a small deep-amber pigment core (img-04/05).
      const core = lightStrength * ink;
      const inkRadius = radius * 0.55;
      const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, inkRadius);
      gradient.addColorStop(0, rgba([0.78, 0.33, 0.04], 0.85 * core));
      gradient.addColorStop(0.35, rgba([0.62, 0.22, 0.05], 0.4 * core));
      gradient.addColorStop(1, rgba([0.62, 0.22, 0.05], 0));
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = gradient;
      ctx.fillRect(lx - inkRadius, ly - inkRadius, inkRadius * 2, inkRadius * 2);
    }
  }
  ctx.globalCompositeOperation = "source-over";
  return positions;
}

/** Depth-sized splat: far particles are single points, near ones soft 2x2, very near ones dim 3x3 bokeh. */
function splatParticle(accum: Float32Array, bw: number, bh: number, x: number, y: number, r: number, g: number, b: number, alpha: number, depth: number): void {
  const px = x | 0;
  const py = y | 0;
  if (px < 1 || py < 1 || px >= bw - 2 || py >= bh - 2) return;
  if (depth < 1.1) {
    const i = (py * bw + px) * 3;
    accum[i] += r * alpha; accum[i + 1] += g * alpha; accum[i + 2] += b * alpha;
    return;
  }
  const radius = depth < 1.35 ? 1 : 2;
  const spread = alpha / (radius === 1 ? 2.2 : 4.5);
  for (let dy = -radius + 1; dy <= radius; dy++) {
    for (let dx = -radius + 1; dx <= radius; dx++) {
      const i = ((py + dy) * bw + px + dx) * 3;
      accum[i] += r * spread; accum[i + 1] += g * spread; accum[i + 2] += b * spread;
    }
  }
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

interface RasterCache {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  landmarks: Array<{ x: number; y: number }>;
  lastRasterMs: number;
}

const rasterCaches = new WeakMap<CanvasRenderingContext2D, RasterCache>();

/**
 * Rasterize (and cache) the source eye. The particle field reads the raster
 * bytes directly, so no offscreen raster canvas is needed. The expensive
 * per-pixel `rasterizeWeek1Eye` call is throttled; while the eye is dissolved
 * into a formation (`energy` high) it refreshes less often, since most of its
 * particles are away from home. `bypassThrottle` (quiet/reduced motion)
 * always rasterizes immediately.
 */
function ensureRaster(ctx: CanvasRenderingContext2D, rasterWidth: number, rasterHeight: number, pose: Week1Pose, bypassThrottle: boolean): RasterCache {
  let rasterCache = rasterCaches.get(ctx) ?? null;
  const now = nowMs();
  const dimensionsChanged = !rasterCache || rasterCache.width !== rasterWidth || rasterCache.height !== rasterHeight;
  const interval = RASTER_REFRESH_INTERVAL_MS * (1 + 2 * clamp01(pose.energy));
  const stale = !rasterCache || now - rasterCache.lastRasterMs >= interval;
  if (dimensionsChanged || bypassThrottle || stale) {
    const reuseTarget = !dimensionsChanged && rasterCache ? rasterCache.data : undefined;
    const { data, landmarks } = rasterizeWeek1Eye(rasterWidth, rasterHeight, pose, reuseTarget);
    rasterCache = { width: rasterWidth, height: rasterHeight, data, landmarks, lastRasterMs: now };
    rasterCaches.set(ctx, rasterCache);
  }
  if (!rasterCache) throw new Error('Source eye raster unavailable');
  return rasterCache;
}

/**
 * Authored coordinate warp: the one function that turns the source eye into
 * each of the five distinct stance forms (owner clarification: "Use the
 * original eye's material itself unfolding/warping into forms, never
 * independent unrelated blob"). Operates on a centered, aspect-normalized
 * coordinate (roughly -1..1) so it is independent of actual raster/canvas
 * pixel dimensions; render.ts applies it identically to a triangulated-mesh
 * sampling of the rasterized eye *and* to its feature landmarks, so
 * tracking boxes stay attached to the actual warped eye by construction.
 *
 * At all-zero channels (the attentive/neutral resting values) this is the
 * identity transform: `warpPoint(x, y, zeroWarp) === {x, y}`, matching
 * "Neutral static/source eye MUST immediately read as Week1 anatomic eye."
 */
export function warpPoint(x: number, y: number, warp: WarpChannels): { x: number; y: number } {
  let px = x;
  let py = y;

  // Comfort: fold -- the lid/shell softens, compresses and curls inward, as if closing.
  if (warp.fold !== 0) {
    py *= 1 - warp.fold * 0.55;
    py += warp.fold * 0.1;
    px += warp.fold * 0.14 * Math.sign(x) * Math.pow(Math.min(1, Math.abs(x)), 1.4) * (1 - Math.min(1, Math.abs(y)));
  }

  // Joy: lift -- the whole body lifts and broadens/opens.
  if (warp.lift !== 0) {
    py -= warp.lift * 0.22;
    px *= 1 + warp.lift * 0.18;
  }

  // Congratulatory: bloom -- a radial petal unfold (five soft lobes).
  if (warp.bloom !== 0) {
    const r = Math.hypot(px, py);
    const a = Math.atan2(py, px);
    const rBloom = r * (1 + warp.bloom * 0.55 + warp.bloom * 0.18 * Math.cos(a * 5));
    px = Math.cos(a) * rBloom;
    py = Math.sin(a) * rBloom;
  }

  // Supportive: fan -- ribbons spread outward from the vertical axis, gathering and opening.
  if (warp.fan !== 0) {
    const r = Math.hypot(px, py);
    const a = Math.atan2(py, px);
    const aFan = a + warp.fan * 0.32 * Math.sign(Math.sin(a)) * Math.abs(Math.cos(a));
    const rFan = r * (1 + warp.fan * 0.22);
    px = Math.cos(aFan) * rFan;
    py = Math.sin(aFan) * rFan;
  }

  // Shared directional twist (currently meaningfully non-zero only for joy).
  if (warp.twist !== 0) {
    const r = Math.hypot(px, py);
    const a = Math.atan2(py, px) + warp.twist;
    px = Math.cos(a) * r;
    py = Math.sin(a) * r;
  }

  return { x: px, y: py };
}

const DIGITAL_COLOR_HEX: Record<DigitalColorKey, string> = {
  magenta: "#c94fa0",
  cyan: "#3fbfd8",
  lime: "#9fd44a",
  blue: "#4f74d6",
  pearl: PALETTE.pearl,
};

/** Where EVA rests on a full-overlay canvas (batch w3-cloud-20260929-b p2). Absent = centred, sized to the canvas. */
export interface EyePlacement {
  /** Rest anchor in canvas px. */
  anchorX: number;
  anchorY: number;
  /** Length (canvas px) that the approved rest/speaking scales are fractions of. */
  sizeBasis: number;
}

/** What was drawn, for placing chrome and hit-testing (canvas px). */
export interface EyeLayout {
  cx: number;
  cy: number;
  scale: number;
  restScale: number;
}

export function drawEye(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: EyeFrame,
  interaction: EyeInteraction = DEFAULT_EYE_INTERACTION,
  backdrop: LumaGrid | null = null,
  placement: EyePlacement | null = null
): EyeLayout {
  if (!(width > 0) || !(height > 0)) return { cx: 0, cy: 0, scale: 0, restScale: 0 };
  const minDim = placement ? placement.sizeBasis : Math.min(width, height);
  // Small eye at rest that grows while responding (owner decision, batch w3-cloud-20260928-a).
  const displayScale = minDim * (REST_SCALE + (SPEAKING_SCALE - REST_SCALE) * clamp01(frame.energy));
  let cx = width / 2;
  let cy = height / 2;
  if (placement) {
    // Grow around the anchor, pulled inward only as far as needed to stay on the monitor.
    // Joy is the one form allowed past the edge, so its share relaxes the clamp continuously.
    const clamped = formCenter(placement.anchorX, placement.anchorY, displayScale, clamp01(frame.energy), width, height);
    const free = clamp01(formationWeights(frame.warp).joy * formationStrength(frame.warp));
    cx = clamped.x + (placement.anchorX - clamped.x) * free;
    cy = clamped.y + (placement.anchorY - clamped.y) * free;
  }

  ctx.save();
  // No stage: EVA floats over the user's desktop (batch w3-cloud-20260929-b).
  ctx.clearRect(0, 0, width, height);

  const pose: Week1Pose = {
    ...interaction,
    time: frame.timeSec,
    energy: frame.energy,
    phosphor: frame.phosphor,
  };

  const isQuiet = interaction.quiet === true;
  const rasterWidth = isQuiet ? QUIET_RASTER_WIDTH : LIVE_RASTER_WIDTH;
  const rasterHeight = isQuiet ? QUIET_RASTER_HEIGHT : LIVE_RASTER_HEIGHT;
  const { landmarks, data } = ensureRaster(ctx, rasterWidth, rasterHeight, pose, isQuiet);

  const positions = drawParticleField(ctx, width, height, cx, cy, displayScale, rasterWidth, rasterHeight, data, landmarks, frame, isQuiet, backdrop);
  const tint = inkTint(formationWeights(frame.warp), formationStrength(frame.warp));
  const inkAt = (x: number, y: number) => (backdrop ? inkWeight(lumaAt(backdrop, x / width, y / height)) : 0);
  const trackedLandmarks: LandmarkPoint[] = landmarks.map(lm => {
    const index = Math.min(rasterHeight - 1, Math.max(0, Math.round(lm.y))) * rasterWidth + Math.min(rasterWidth - 1, Math.max(0, Math.round(lm.x)));
    return { x: positions[index * 2], y: positions[index * 2 + 1] };
  });

  drawSmearBands(ctx, cx, cy, displayScale * 1.9, frame, inkAt, tint);
  drawTrackingBoxes(ctx, trackedLandmarks, minDim, frame, inkAt, tint);

  // Pass p3: a few brief glitch boxes only while the eye is changing state.
  let glitchState = glitchStates.get(ctx);
  if (!glitchState) { glitchState = createGlitchState(); glitchStates.set(ctx, glitchState); }
  const glitches = stepGlitches(glitchState, frame.timeSec, clamp01(frame.energy), variationHandover(ctx, frame.timeSec), frame.fragmentSeed, !isQuiet);
  drawTransitionGlitches(ctx, glitches, trackedLandmarks, displayScale, frame.timeSec, inkAt, tint);

  ctx.restore();
  return { cx, cy, scale: displayScale, restScale: minDim * REST_SCALE };
}

const GLITCH_STRIPE_COLORS = ["#e0625a", "#c94fa0", "#3fbfd8", "#9fd44a", PALETTE.pearl, "#7a2a2e"] as const;

/**
 * Transition glitch accents from the p3 packet (img-01, vid-01): each event
 * opens from a thin vertical line into a small box of vertical colour
 * stripes with a thin outline, briefly throws a thin horizontal trail across
 * the form, then vanishes. Anchored on the eye's (moving) feature landmarks.
 * A few at most; see glitch.ts for scheduling.
 *
 * Batch w3-cloud-20260929-b p1 (owner): pure light, no dark backing. Over
 * dark areas the stripes are emitted light (a little brighter than p3-a2 so
 * they don't vanish like p3-a1); over bright areas the same stripes turn to
 * ink, like the particles.
 */
function drawTransitionGlitches(ctx: CanvasRenderingContext2D, events: GlitchEvent[], anchors: LandmarkPoint[], displayScale: number, timeSec: number, inkAt: (x: number, y: number) => number, tint: Rgb): void {
  if (events.length === 0 || anchors.length === 0) return;
  const line = Math.max(1, displayScale * 0.006);
  for (const event of events) {
    const { grow, alpha, trail } = glitchEnvelope(event, timeSec);
    if (alpha <= 0.02) continue;
    const anchor = anchors[Math.min(anchors.length - 1, Math.floor(event.anchor * anchors.length))];
    const fullWidth = event.width * displayScale;
    const w = Math.max(line * 1.5, fullWidth * grow);
    const h = fullWidth * event.aspect;
    const x0 = anchor.x - w / 2;
    const y0 = anchor.y - h / 2;
    const ink = inkAt(anchor.x, anchor.y);
    // Light is added (never darkens); ink is laid over with normal alpha.
    const paint = (light: Rgb, lightAlpha: number, inkAlpha: number, draw: () => void) => {
      if (ink < 0.999) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = ctx.strokeStyle = rgba(light, lightAlpha * GLITCH_LIGHT_GAIN * alpha * (1 - ink)); draw(); }
      if (ink > 0.001) { ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = ctx.strokeStyle = rgba(materialColor(light, 1, tint), inkAlpha * alpha * ink); draw(); }
    };
    if (trail > 0) {
      const length = displayScale * (1.3 + 0.6 * cellHash(event.id, 43));
      const ty = anchor.y + (cellHash(event.id, 47) - 0.5) * h * 0.4;
      const tx = anchor.x - length / 2 + (cellHash(event.id, 41) - 0.5) * displayScale * 0.3;
      paint(PEARL, 0.55, 0.6, () => ctx.fillRect(tx, ty, length, line * 0.8));
      paint(hexToRgb("#3fbfd8"), 0.25, 0.35, () => ctx.fillRect(tx + line * 3, ty + line, length, line * 0.6));
    }
    const stripe = Math.max(1.5, fullWidth / 13);
    for (let sx = 0, c = 0; sx < w - 0.5; sx += stripe, c++) {
      const hc = cellHash(event.id * 131 + c, 17);
      if (hc < 0.2) continue; // gap
      const color = GLITCH_STRIPE_COLORS[Math.floor(cellHash(event.id * 131 + c, 23) * GLITCH_STRIPE_COLORS.length) % GLITCH_STRIPE_COLORS.length];
      const inset = h * 0.08 * cellHash(event.id * 131 + c, 29);
      paint(hexToRgb(color), 0.6, 0.7, () => ctx.fillRect(x0 + sx, y0 + inset, Math.min(stripe * 0.7, w - sx), h - inset * 2));
    }
    ctx.lineWidth = Math.max(0.6, line * 0.6);
    paint(PEARL, 0.55, 0.6, () => ctx.strokeRect(x0, y0, w, h));
  }
  ctx.globalCompositeOperation = "source-over";
}

const PEARL = hexToRgb(PALETTE.pearl);
/** Pure-light stripes need a little more energy than the dark-backed p3-a2 boxes to stay visible. */
const GLITCH_LIGHT_GAIN = 1.35;
/** Hairline ink for tracking boxes over bright areas. */
const HAIRLINE_INK: Rgb = [0.17, 0.14, 0.2];

/**
 * A dense field of varying-size tracking boxes attached to the eye's actual
 * (warped) feature landmarks, with X/corner-tick marks and sparse
 * connecting lines (owner clarification: "20-40 connected multiscale
 * feature boxes ... follow actual eye"). `frame.boxes`'s live average
 * opacity (runtime-owned, turn-state-driven) supplies the density/opacity
 * signal; an emptied `frame.boxes` (interrupted/unavailable/inactive/End)
 * draws nothing here either.
 */
function drawTrackingBoxes(
  ctx: CanvasRenderingContext2D,
  landmarks: LandmarkPoint[],
  minDim: number,
  frame: EyeFrame,
  inkAt: (x: number, y: number) => number,
  _tint: Rgb
): void {
  if (frame.boxes.length === 0 || landmarks.length === 0) return;
  // Pearl light over dark areas, a dark ink hairline over bright ones.
  const hairline = (x: number, y: number, alpha: number) => {
    const ink = inkAt(x, y);
    return rgba([PEARL[0] + (HAIRLINE_INK[0] - PEARL[0]) * ink, PEARL[1] + (HAIRLINE_INK[1] - PEARL[1]) * ink, PEARL[2] + (HAIRLINE_INK[2] - PEARL[2]) * ink], alpha);
  };
  const anchorOpacityAvg = frame.boxes.reduce((sum, b) => sum + b.opacity, 0) / frame.boxes.length;
  if (anchorOpacityAvg <= 0.01) return;

  const targetCount = Math.min(MAX_TRACKING_BOXES, Math.max(12, Math.round(landmarks.length * (.55 + .27 * frame.boxes.length))));
  const boxes = buildTrackingBoxesFromLandmarks({
    seed: frame.fragmentSeed,
    landmarks,
    targetCount,
    maxCount: MAX_TRACKING_BOXES,
  });
  if (boxes.length === 0) return;

  ctx.lineWidth = Math.max(0.4, minDim * 0.001);
  for (let i = 0; i < boxes.length; i++) {
    const to = boxes[i].connectToIndex;
    if (to === null || to === undefined || !boxes[to]) continue;
    ctx.strokeStyle = hairline((boxes[i].x + boxes[to].x) / 2, (boxes[i].y + boxes[to].y) / 2, clamp01(0.28 * anchorOpacityAvg));
    ctx.beginPath();
    ctx.moveTo(boxes[i].x, boxes[i].y);
    ctx.lineTo(boxes[to].x, boxes[to].y);
    ctx.stroke();
  }

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    const size = minDim * box.size * (i % 8 === 0 ? 2.2 : i % 5 === 0 ? 1.6 : 1);
    const pulse = 0.8 + 0.2 * Math.sin(frame.timeSec * 1.1 + i * 0.7);
    const alpha = clamp01(box.opacity * anchorOpacityAvg * pulse);
    if (alpha <= 0.02) continue;

    ctx.strokeStyle = hairline(box.x, box.y, Math.min(0.6, alpha));
    ctx.lineWidth = Math.max(0.4, minDim * 0.0012);
    ctx.strokeRect(box.x - size / 2, box.y - size / 2, size, size);

    if (box.hasX) {
      ctx.beginPath();
      ctx.moveTo(box.x - size / 2, box.y - size / 2);
      ctx.lineTo(box.x + size / 2, box.y + size / 2);
      ctx.moveTo(box.x + size / 2, box.y - size / 2);
      ctx.lineTo(box.x - size / 2, box.y + size / 2);
      ctx.stroke();
    } else if (box.hasCornerTicks) {
      const tick = size * 0.3;
      ctx.beginPath();
      ctx.moveTo(box.x - size / 2, box.y - size / 2 + tick);
      ctx.lineTo(box.x - size / 2, box.y - size / 2);
      ctx.lineTo(box.x - size / 2 + tick, box.y - size / 2);
      ctx.moveTo(box.x + size / 2 - tick, box.y + size / 2);
      ctx.lineTo(box.x + size / 2, box.y + size / 2);
      ctx.lineTo(box.x + size / 2, box.y + size / 2 - tick);
      ctx.stroke();
    }
  }
}

/**
 * Multi-row horizontal data-smear ribbons, only while `frame.fragmentation`
 * is non-zero (masked to actual processing in runtime.ts; cut instantly on
 * interrupt/End). An overlay on top of the source eye, never a replacement
 * for it.
 */
function drawSmearBands(ctx: CanvasRenderingContext2D, cx: number, cy: number, minDim: number, frame: EyeFrame, inkAt: (x: number, y: number) => number, tint: Rgb): void {
  const bands = buildSmearBands({
    seed: frame.fragmentSeed,
    fragmentation: frame.fragmentation,
    maxBands: MAX_SMEAR_BANDS,
    timeSec: frame.timeSec,
  });
  if (bands.length === 0) return;

  const baseAlpha = clamp01(frame.fragmentation * 0.5);

  for (const band of bands) {
    const y = cy + band.yFrac * minDim * 0.3;
    const height = Math.max(1, band.heightFrac * minDim);
    const halfWidth = band.extendFrac * minDim;
    const startX = cx - halfWidth + band.horizontalShiftFrac * minDim;
    const totalWidth = halfWidth * 2;
    const hex = DIGITAL_COLOR_HEX[band.colorKey];
    // Over bright areas the smear is laid down as ink instead of added light.
    const ink = inkAt(startX + totalWidth / 2, y);
    const inked = (color: string) => (ink > 0.5 ? rgba(materialColor(hexToRgb(color), 1, tint), 1) : color);

    const sorted = [...band.dropouts].sort((a, b) => a.startFrac - b.startFrac);
    const draw = (offset: number, color: string, opacity: number) => {
      let cursor = 0;
      ctx.fillStyle = color.startsWith('rgba') ? color.replace(/,[^,]*\)$/, `,${clamp01(opacity).toFixed(3)})`) : withAlpha(color, opacity);
      const scan = (x: number, span: number) => {
        for (let row = 0; row < height; row += 2) ctx.fillRect(x + offset + (row % 4 === 0 ? -1 : 1), y + row, span, Math.min(1, height - row));
      };
      for (const d of sorted) {
        const end = Math.max(cursor, d.startFrac);
        if (end > cursor) scan(startX + cursor * totalWidth, (end - cursor) * totalWidth);
        cursor = Math.min(1, Math.max(cursor, d.startFrac + d.widthFrac));
      }
      if (cursor < 1) scan(startX + cursor * totalWidth, (1 - cursor) * totalWidth);
    };
    if (band.channelSeparated) {
      ctx.globalCompositeOperation = ink > 0.5 ? 'source-over' : 'lighter';
      draw(-minDim * .006, inked('#ff4d6d'), baseAlpha * .5);
      draw(0, inked('#4dffb8'), baseAlpha * .5);
      draw(minDim * .006, inked('#4d9dff'), baseAlpha * .5);
      ctx.globalCompositeOperation = 'source-over';
    } else draw(0, inked(hex), baseAlpha);
  }
}
