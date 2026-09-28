/**
 * Canvas2D drawing for one EyeFrame. Bounded CPU path only (no WebGL/wgpu,
 * per the GPU quarantine): a handful of filled/stroked paths and gradients
 * per frame, capped by the fixed slot counts in constants.ts.
 *
 * This module intentionally only *reads* an EyeFrame; all motion state
 * lives in runtime.ts so this file stays a thin, replaceable presentation
 * layer.
 */

import { MAX_STREAKS } from "./constants";
import { hashSeed, mulberry32 } from "./rng";
import { PALETTE, blendWeightedColor, mixHex, withAlpha } from "./palette";
import type { EyeFrame } from "./runtime";

const SILHOUETTE_SEGMENTS = 64;

function silhouettePoint(
  cx: number,
  cy: number,
  minDim: number,
  frame: EyeFrame,
  rotation: number,
  radiusScale: number,
  theta: number
): [number, number] {
  const t = theta + rotation;
  let r = frame.coreRadius;
  for (const h of frame.harmonics) {
    r += h.amp * Math.sin(h.k * t + h.phase);
  }
  r += frame.asymmetryMag * Math.cos(t - frame.asymmetryAngle);
  r = Math.max(0.1, r) * radiusScale * minDim;
  return [cx + Math.cos(t) * r, cy + Math.sin(t) * r];
}

function pathForLayer(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  minDim: number,
  frame: EyeFrame,
  rotation: number,
  radiusScale: number
): void {
  ctx.beginPath();
  for (let i = 0; i <= SILHOUETTE_SEGMENTS; i++) {
    const theta = (i / SILHOUETTE_SEGMENTS) * Math.PI * 2;
    const [x, y] = silhouettePoint(cx, cy, minDim, frame, rotation, radiusScale, theta);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawEye(ctx: CanvasRenderingContext2D, width: number, height: number, frame: EyeFrame): void {
  if (!(width > 0) || !(height > 0)) return;
  const minDim = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2 - frame.verticalBias * minDim * 0.4;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PALETTE.charcoal;
  ctx.fillRect(0, 0, width, height);

  const accent = blendWeightedColor(frame.paletteWeights);

  // Outer layers first (back to front) so the core reads on top.
  const orderedLayers = [...frame.layers].sort((a, b) => b.radiusScale - a.radiusScale);
  for (const layer of orderedLayers) {
    pathForLayer(ctx, cx, cy, minDim, frame, layer.rotation, layer.radiusScale);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.6 * layer.radiusScale);
    gradient.addColorStop(0, withAlpha(mixHex(PALETTE.charcoal, accent, 0.25), 0.05 * layer.opacity));
    gradient.addColorStop(0.55, withAlpha(accent, 0.16 * layer.opacity));
    gradient.addColorStop(1, withAlpha(mixHex(accent, PALETTE.charcoal, 0.4), 0.02 * layer.opacity));
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, minDim * 0.0025);
    ctx.strokeStyle = withAlpha(mixHex(accent, PALETTE.pearl, 0.5), 0.22 * layer.opacity);
    ctx.stroke();
  }

  // Recognizable dark core: keeps the silhouette a "presence" even mid-transformation.
  pathForLayer(ctx, cx, cy, minDim, frame, 0, 0.42);
  const coreGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.32);
  coreGradient.addColorStop(0, withAlpha(PALETTE.charcoal, 0.65 + 0.3 * frame.focus));
  coreGradient.addColorStop(0.7, withAlpha(mixHex(PALETTE.charcoal, accent, 0.3), 0.35 * frame.focus));
  coreGradient.addColorStop(1, withAlpha(accent, 0.08));
  ctx.fillStyle = coreGradient;
  ctx.fill();

  drawFragmentation(ctx, cx, cy, minDim, frame);
  drawBoxes(ctx, cx, cy, minDim, frame);

  ctx.restore();
}

function drawFragmentation(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  minDim: number,
  frame: EyeFrame
): void {
  if (frame.fragmentation <= 0.01) return;
  const count = Math.round(MAX_STREAKS * frame.fragmentation);
  const rng = mulberry32(hashSeed(Math.round(frame.coreRadius * 1000), "frag"));
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const radial = 0.55 + rng() * 0.5;
    const y = cy + Math.sin(theta) * radial * minDim * 0.5;
    const driftSpeed = 0.15 + rng() * 0.35;
    const driftPhase = rng() * Math.PI * 2;
    const drift = Math.sin(frame.timeSec * driftSpeed + driftPhase) * minDim * 0.08;
    const startX = cx + Math.cos(theta) * radial * minDim * 0.5 + drift;
    const len = (0.03 + rng() * 0.1) * minDim;
    const hue = rng() > 0.5 ? PALETTE.ice : PALETTE.coral;
    const alpha = frame.fragmentation * (0.15 + rng() * 0.35);
    ctx.strokeStyle = withAlpha(hue, alpha);
    ctx.lineWidth = Math.max(0.5, minDim * 0.0015);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + len, y);
    ctx.stroke();
  }
}

function drawBoxes(ctx: CanvasRenderingContext2D, cx: number, cy: number, minDim: number, frame: EyeFrame): void {
  for (const box of frame.boxes) {
    const [px, py] = silhouettePoint(cx, cy, minDim, frame, 0, 1, box.angle);
    const size = minDim * (0.05 + box.sizeJitter * 0.05);
    const pulse = 0.75 + 0.25 * Math.sin(frame.timeSec * 1.1 + box.angle * 3);
    const alpha = box.opacity * pulse;
    ctx.strokeStyle = withAlpha(PALETTE.pearl, Math.min(0.55, alpha));
    ctx.lineWidth = Math.max(0.5, minDim * 0.0015);
    ctx.strokeRect(px - size / 2, py - size / 2, size, size);
  }
}
