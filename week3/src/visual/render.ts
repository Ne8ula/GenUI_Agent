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
import { createEyeMesh, drawEyeMesh, projectEyePoint } from './eye-mesh';

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
const LIVE_RASTER_WIDTH = 224;
const LIVE_RASTER_HEIGHT = 112;
const QUIET_RASTER_WIDTH = 320;
const QUIET_RASTER_HEIGHT = 160;
const RASTER_REFRESH_INTERVAL_MS = 1000 / 30;

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

interface RasterCache {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  landmarks: Array<{ x: number; y: number }>;
  canvas: HTMLCanvasElement | null;
  lastRasterMs: number;
}

const rasterCaches = new WeakMap<CanvasRenderingContext2D, RasterCache>();

/**
 * Rasterize (and cache) the source eye. Only the expensive per-pixel
 * `rasterizeWeek1Eye` call is throttled/cached; callers still get fresh
 * `landmarks` every ~33ms even during continuous motion, and a bypassed,
 * immediate, higher-resolution raster while `bypassThrottle` (quiet/reduced
 * motion) is set.
 */
function ensureRaster(ctx: CanvasRenderingContext2D, rasterWidth: number, rasterHeight: number, pose: Week1Pose, bypassThrottle: boolean): RasterCache {
  let rasterCache = rasterCaches.get(ctx) ?? null;
  const now = nowMs();
  const dimensionsChanged = !rasterCache || rasterCache.width !== rasterWidth || rasterCache.height !== rasterHeight;
  const stale = !rasterCache || now - rasterCache.lastRasterMs >= RASTER_REFRESH_INTERVAL_MS;
  if (dimensionsChanged || bypassThrottle || stale) {
    const reuseTarget = !dimensionsChanged && rasterCache ? rasterCache.data : undefined;
    const { data, landmarks } = rasterizeWeek1Eye(rasterWidth, rasterHeight, pose, reuseTarget);
    // The offscreen canvas is only needed to hand the raster to
    // ctx.drawImage; it requires a real DOM (browser), which vitest's
    // "node" test environment intentionally does not provide. Skip it
    // there -- the pure rasterize/warp/landmark path above still runs and
    // stays fully testable; only the final pixel paint is browser-only.
    let canvas = !dimensionsChanged && rasterCache ? rasterCache.canvas : null;
    if (typeof document !== "undefined") {
      if (!canvas) canvas = document.createElement("canvas");
      if (dimensionsChanged || canvas.width !== rasterWidth || canvas.height !== rasterHeight) {
        canvas.width = rasterWidth;
        canvas.height = rasterHeight;
      }
      const offCtx = canvas.getContext("2d");
      if (!offCtx) throw new Error('Source eye canvas unavailable');
      offCtx.putImageData(new ImageData(new Uint8ClampedArray(data), rasterWidth, rasterHeight), 0, 0);
    }
    rasterCache = { width: rasterWidth, height: rasterHeight, data, landmarks, canvas, lastRasterMs: now };
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

export function drawEye(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: EyeFrame,
  interaction: EyeInteraction = DEFAULT_EYE_INTERACTION
): void {
  if (!(width > 0) || !(height > 0)) return;
  const minDim = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PALETTE.charcoal;
  ctx.fillRect(0, 0, width, height);

  const pose: Week1Pose = {
    ...interaction,
    time: frame.timeSec,
    energy: frame.energy,
    phosphor: frame.phosphor,
  };

  const isQuiet = interaction.quiet === true;
  const rasterWidth = isQuiet ? QUIET_RASTER_WIDTH : LIVE_RASTER_WIDTH;
  const rasterHeight = isQuiet ? QUIET_RASTER_HEIGHT : LIVE_RASTER_HEIGHT;
  const { landmarks, canvas } = ensureRaster(ctx, rasterWidth, rasterHeight, pose, isQuiet);

  const displayScale = minDim * 0.52;
  const rasterAspect = rasterHeight / rasterWidth;
  const toNormalized = (px: number, py: number) => ({
    x: (px / rasterWidth - 0.5) * 2,
    y: (py / rasterHeight - 0.5) * 2 * rasterAspect,
  });
  const toCanvas = (nx: number, ny: number) => ({ x: cx + nx * displayScale, y: cy + ny * displayScale });
  const center = landmarks[10] ?? { x: rasterWidth / 2, y: rasterHeight / 2 };
  const pupil = toNormalized(center.x + .5, center.y + .5);
  const hasWarp = frame.energy > .001 || Object.values(frame.warp).some(value => Math.abs(value) > .001);
  const project = (sx: number, sy: number) => {
    const p = toNormalized(sx, sy);
    if (!hasWarp) return toCanvas(p.x, p.y);
    const warped = warpPoint(p.x, p.y, frame.warp);
    const angle = Math.atan2(p.y - pupil.y, p.x - pupil.x);
    const varied = frame.harmonics.reduce((sum, harmonic) => sum + harmonic.amp * Math.sin(angle * harmonic.k + harmonic.phase + frame.timeSec * .25), 0);
    const ripple = Math.max(-.14, Math.min(.14, varied * 3 * frame.energy));
    warped.x += Math.cos(angle) * ripple;
    warped.y += Math.sin(angle) * ripple;
    // Preserve the square pupil while the surrounding eye material unfolds.
    const distance = Math.hypot(p.x - pupil.x, p.y - pupil.y);
    const t = clamp01((distance - .22) / .34);
    const strength = t * t * (3 - 2 * t);
    return toCanvas(p.x + (warped.x - p.x) * strength, p.y + (warped.y - p.y) * strength);
  };
  const mesh = createEyeMesh(rasterWidth, rasterHeight, project);
  if (canvas) {
    ctx.imageSmoothingEnabled = false;
    if (hasWarp) drawEyeMesh(ctx, canvas, mesh);
    else ctx.drawImage(canvas, cx - displayScale, cy - rasterAspect * displayScale, displayScale * 2, rasterAspect * displayScale * 2);
  }
  // Piecewise interpolation matches the very same triangles used to paint the pixels.
  const warpedLandmarks: LandmarkPoint[] = landmarks.map(lm => projectEyePoint(mesh, lm.x + .5, lm.y + .5));

  drawSmearBands(ctx, cx, cy, minDim, frame);
  drawTrackingBoxes(ctx, warpedLandmarks, minDim, frame);

  ctx.restore();
}

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
  frame: EyeFrame
): void {
  if (frame.boxes.length === 0 || landmarks.length === 0) return;
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

  ctx.strokeStyle = withAlpha(PALETTE.pearl, clamp01(0.28 * anchorOpacityAvg));
  ctx.lineWidth = Math.max(0.4, minDim * 0.001);
  for (let i = 0; i < boxes.length; i++) {
    const to = boxes[i].connectToIndex;
    if (to === null || to === undefined || !boxes[to]) continue;
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

    ctx.strokeStyle = withAlpha(PALETTE.pearl, Math.min(0.6, alpha));
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
function drawSmearBands(ctx: CanvasRenderingContext2D, cx: number, cy: number, minDim: number, frame: EyeFrame): void {
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

    const sorted = [...band.dropouts].sort((a, b) => a.startFrac - b.startFrac);
    const draw = (offset: number, color: string, opacity: number) => {
      let cursor = 0;
      ctx.fillStyle = withAlpha(color, opacity);
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
      ctx.globalCompositeOperation = 'lighter';
      draw(-minDim * .006, '#ff4d6d', baseAlpha * .5);
      draw(0, '#4dffb8', baseAlpha * .5);
      draw(minDim * .006, '#4d9dff', baseAlpha * .5);
      ctx.globalCompositeOperation = 'source-over';
    } else draw(0, hex, baseAlpha);
  }
}
