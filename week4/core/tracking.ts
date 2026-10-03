// Head-pose estimation from eye-centre points, neutral calibration, head-box clamping,
// One-Euro smoothing and tracking-loss recovery (planning.md §6.2).
// Approximate by design: depth comes from an assumed interpupillary distance. This is
// not gaze tracking or metric truth, and these functions never touch a camera.
import type { Vec3 } from './projection.ts';

export interface EyeObservation {
  // Normalized image coordinates (0..1, origin top-left) of each eye centre.
  leftEye: readonly [number, number];
  rightEye: readonly [number, number];
}

export interface CameraModel {
  imageWidthPx: number;
  imageHeightPx: number;
  horizontalFovDeg: number;
  // Camera position in the screen frame (metres), e.g. top-centre bezel.
  offset: Vec3;
  // A front camera sees the user mirrored relative to the screen frame.
  mirrored: boolean;
  assumedIpdM: number;
}

export const DEFAULT_IPD_M = 0.063;
const MIN_EYE_SEPARATION_PX = 4;

function finite(...xs: number[]): boolean {
  return xs.every((x) => Number.isFinite(x));
}

// Raw eye-midpoint position in the screen frame, or null for an unusable observation.
export function estimateEye(obs: EyeObservation, cam: CameraModel): Vec3 | null {
  const [lx, ly] = obs.leftEye;
  const [rx, ry] = obs.rightEye;
  if (!finite(lx, ly, rx, ry)) return null;
  if ([lx, ly, rx, ry].some((v) => v < -0.5 || v > 1.5)) return null;
  if (!(cam.imageWidthPx > 0 && cam.imageHeightPx > 0 && cam.horizontalFovDeg > 1 && cam.horizontalFovDeg < 179 && cam.assumedIpdM > 0)) {
    return null;
  }
  const dx = (rx - lx) * cam.imageWidthPx;
  const dy = (ry - ly) * cam.imageHeightPx;
  const sepPx = Math.hypot(dx, dy);
  if (sepPx < MIN_EYE_SEPARATION_PX) return null;

  const focalPx = cam.imageWidthPx / 2 / Math.tan(((cam.horizontalFovDeg / 2) * Math.PI) / 180);
  const depth = (focalPx * cam.assumedIpdM) / sepPx;
  const u = ((lx + rx) / 2) * cam.imageWidthPx - cam.imageWidthPx / 2;
  const v = ((ly + ry) / 2) * cam.imageHeightPx - cam.imageHeightPx / 2;
  const camX = (u * depth) / focalPx;
  const camY = (-v * depth) / focalPx;
  const x = (cam.mirrored ? -camX : camX) + cam.offset[0];
  const y = camY + cam.offset[1];
  const z = depth + cam.offset[2];
  return finite(x, y, z) ? [x, y, z] : null;
}

export interface HeadBox {
  lateralM: number;
  verticalM: number;
  depthM: number;
}

// Proposal from planning.md §6.2.
export const DEFAULT_HEAD_BOX: HeadBox = { lateralM: 0.12, verticalM: 0.08, depthM: 0.12 };

export interface Calibration {
  rawNeutral: Vec3;
  designNeutral: Vec3;
  box: HeadBox;
}

export const MIN_CALIBRATION_SAMPLES = 15;
export const MAX_CALIBRATION_SPREAD_M = 0.02;

export type CalibrationResult = { ok: true; calibration: Calibration } | { ok: false; reason: 'too_few_samples' | 'unstable' | 'invalid' };

// Neutral calibration: the owner sits at the demo pose; raw estimates are averaged and
// later movement is applied relative to a designed neutral eye in front of the screen.
export function calibrate(samples: readonly (Vec3 | null)[], designNeutral: Vec3, box: HeadBox = DEFAULT_HEAD_BOX): CalibrationResult {
  if (!finite(...designNeutral) || designNeutral[2] <= 0.1) return { ok: false, reason: 'invalid' };
  const good = samples.filter((s): s is Vec3 => s !== null && finite(...s));
  if (good.length < MIN_CALIBRATION_SAMPLES) return { ok: false, reason: 'too_few_samples' };
  const mean: [number, number, number] = [0, 0, 0];
  for (const s of good) for (let i = 0; i < 3; i++) mean[i] = (mean[i] ?? 0) + (s[i] ?? 0) / good.length;
  const spread = Math.max(...good.map((s) => Math.hypot(s[0] - mean[0], s[1] - mean[1], s[2] - mean[2])));
  if (spread > MAX_CALIBRATION_SPREAD_M) return { ok: false, reason: 'unstable' };
  return { ok: true, calibration: { rawNeutral: mean, designNeutral, box } };
}

const clamp = (v: number, lim: number) => Math.min(Math.max(v, -lim), lim);

export function toScreenEye(raw: Vec3, cal: Calibration): Vec3 {
  const d = cal.designNeutral;
  return [
    d[0] + clamp(raw[0] - cal.rawNeutral[0], cal.box.lateralM),
    d[1] + clamp(raw[1] - cal.rawNeutral[1], cal.box.verticalM),
    d[2] + clamp(raw[2] - cal.rawNeutral[2], cal.box.depthM),
  ];
}

// One-Euro filter (Casiez, Roussel & Vogel, CHI 2012), one instance per axis.
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t: number | null = null;
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  constructor(minCutoff = 1.0, beta = 0.3, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  reset(): void {
    this.x = null;
    this.dx = 0;
    this.t = null;
  }

  filter(value: number, tMs: number): number {
    if (this.x === null || this.t === null) {
      this.x = value;
      this.t = tMs;
      return value;
    }
    const dt = (tMs - this.t) / 1000;
    if (!(dt > 0)) return this.x; // duplicate or out-of-order timestamp
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuro.alpha(cutoff, dt) * (value - this.x);
    this.t = tMs;
    return this.x;
  }
}

export interface TrackerOptions {
  lossTimeoutMs: number;
  easeToNeutralMs: number;
  resumeBlendMs: number;
}

export const DEFAULT_TRACKER: TrackerOptions = { lossTimeoutMs: 250, easeToNeutralMs: 800, resumeBlendMs: 300 };

export type TrackingStatus = 'tracking' | 'easing_to_neutral' | 'neutral' | 'resuming';

const smoothstep = (f: number) => {
  const x = Math.min(Math.max(f, 0), 1);
  return x * x * (3 - 2 * x);
};

const lerp3 = (a: Vec3, b: Vec3, f: number): Vec3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

// The renderer reads `update(...)` at render rate; it never waits on inference.
export class HeadTracker {
  private readonly cal: Calibration;
  private readonly opts: TrackerOptions;
  private readonly filters = [new OneEuro(), new OneEuro(), new OneEuro()];
  private lastSeenMs: number | null = null;
  private output: Vec3;
  private lossStartPose: Vec3 | null = null;
  private lossStartMs = 0;
  private resumeFrom: Vec3 | null = null;
  private resumeStartMs = 0;
  status: TrackingStatus = 'neutral';

  constructor(cal: Calibration, opts: TrackerOptions = DEFAULT_TRACKER) {
    this.cal = cal;
    this.opts = opts;
    this.output = cal.designNeutral;
  }

  update(raw: Vec3 | null, nowMs: number): Vec3 {
    const usable = raw !== null && raw.every((v) => Number.isFinite(v));
    if (usable) {
      const target = toScreenEye(raw, this.cal);
      const wasLost = this.status === 'easing_to_neutral' || this.status === 'neutral';
      if (wasLost) {
        for (const f of this.filters) f.reset();
        this.resumeFrom = this.output;
        this.resumeStartMs = nowMs;
        this.status = 'resuming';
      }
      const smoothed: Vec3 = [
        this.filters[0]!.filter(target[0], nowMs),
        this.filters[1]!.filter(target[1], nowMs),
        this.filters[2]!.filter(target[2], nowMs),
      ];
      this.lastSeenMs = nowMs;
      this.lossStartPose = null;
      if (this.status === 'resuming' && this.resumeFrom) {
        const f = smoothstep((nowMs - this.resumeStartMs) / this.opts.resumeBlendMs);
        this.output = lerp3(this.resumeFrom, smoothed, f);
        if (f >= 1) {
          this.status = 'tracking';
          this.resumeFrom = null;
        }
      } else {
        this.output = smoothed;
        this.status = 'tracking';
      }
      return this.output;
    }

    // No usable observation: hold briefly, then ease to neutral.
    if (this.lastSeenMs !== null && nowMs - this.lastSeenMs < this.opts.lossTimeoutMs && this.status !== 'neutral') {
      return this.output;
    }
    if (this.status === 'neutral') return this.output;
    if (this.lossStartPose === null) {
      this.lossStartPose = this.output;
      this.lossStartMs = nowMs;
      this.status = 'easing_to_neutral';
    }
    const f = smoothstep((nowMs - this.lossStartMs) / this.opts.easeToNeutralMs);
    this.output = lerp3(this.lossStartPose, this.cal.designNeutral, f);
    if (f >= 1) this.status = 'neutral';
    return this.output;
  }
}
