// Particle store allocation and frame fitting. Pure; shared by authoring, life and renderers.
import type { FrameRect, ParticleStore, Rgb } from './types.ts';

export const MAX_PARTICLES = 262_144;

export function createStore(capacity: number): ParticleStore {
  if (!Number.isInteger(capacity) || capacity <= 0 || capacity > MAX_PARTICLES) {
    throw new RangeError(`particle capacity must be an integer in 1..${MAX_PARTICLES}`);
  }
  return {
    capacity,
    count: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    r: new Float32Array(capacity),
    g: new Float32Array(capacity),
    b: new Float32Array(capacity),
    a: new Float32Array(capacity),
    size: new Float32Array(capacity),
    region: new Uint16Array(capacity),
    phase: new Float32Array(capacity),
    motion: new Float32Array(capacity),
    birthMs: new Float32Array(capacity),
  };
}

/** Contain-fit of an authored frame with the given aspect inside a canvas, in device px. */
export function fitFrame(widthPx: number, heightPx: number, aspect: number): FrameRect {
  if (!(widthPx > 0 && heightPx > 0 && aspect > 0)) return { left: 0, top: 0, width: Math.max(widthPx, 0), height: Math.max(heightPx, 0) };
  const byWidth = widthPx / aspect;
  if (byWidth <= heightPx) return { left: 0, top: (heightPx - byWidth) / 2, width: widthPx, height: byWidth };
  const byHeight = heightPx * aspect;
  return { left: (widthPx - byHeight) / 2, top: 0, width: byHeight, height: heightPx };
}

export function hexToRgb(hex: string): Rgb {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new RangeError(`unsupported colour ${hex}`);
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const f = Math.min(Math.max(t, 0), 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
