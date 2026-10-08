// Authoring primitives: write particles into a store, region by region, deterministically.
// All geometry is in authored frame coordinates (x 0..1 across the width, y 0..1 down the
// height). Spacing and widths are in frame-height units, so a value of 0.003 is 3.24 px at
// a 1080-px-tall frame; the x axis is scaled by the aspect so sampling stays isotropic.
import { hash01, mulberry32 } from './rng.ts';
import type { Rng } from './rng.ts';
import type { Band, ParticleStore, RegionSpec, Rgb } from './types.ts';

export type Pt = readonly [number, number];
export type ColourAt = Rgb | ((x: number, y: number, u: number, v: number) => Rgb);
export type ScalarAt = number | ((x: number, y: number, u: number, v: number) => number);

export interface FillSpec {
  colour: ColourAt;
  /** Particle spacing in frame-height units at density 1 (default 0.003). */
  spacing?: number;
  /** Diameter in px at a 1080-px frame (default 3.2); ±20% jitter is applied. */
  size?: ScalarAt;
  alpha?: ScalarAt;
  /** Keep probability 0..1 at each sample (default 1): lower values let paper show through. */
  coverage?: ScalarAt;
  /** Position jitter as a fraction of spacing (default 0.55). */
  jitter?: number;
  /** Colour jitter amount (default 0.03). */
  tone?: number;
  /** Depth override (frame-level default is the region depth). */
  depth?: ScalarAt;
}

export interface Writer {
  store: ParticleStore;
  regions: RegionSpec[];
  /** The authoring seed; every region gets its own stream derived from it (see beginRegion). */
  seed: number;
  rng: Rng;
  aspect: number;
  /** Multiplies particle counts (spacing / sqrt(density)); clamped to 0.25..1.25. */
  density: number;
  current: { index: number; depth: number } | null;
  overflow: number;
  /** Side channel for idle life: the tag written to `tags[k]` by every emit (0 = static). */
  tag: number;
  tags: Uint8Array;
  /** Shimmer speed (cycles/s) written to every emitted particle; 0 = static. */
  motion: number;
  /** Birth time (host-clock ms) written to every emitted particle; 0 = visible from the start. */
  birthMs: number;
}

export function createWriter(store: ParticleStore, aspect: number, density: number, seed: number): Writer {
  const d = Math.min(Math.max(Number.isFinite(density) ? density : 1, 0.25), 1.25);
  const s = Number.isFinite(seed) ? Math.trunc(seed) : 0;
  return { store, regions: [], seed: s, rng: mulberry32(s), aspect, density: d, current: null, overflow: 0, tag: 0, tags: new Uint8Array(store.capacity), motion: 0, birthMs: 0 };
}

/** A deterministic per-region stream: the same region ID and seed always author the same jitter, whatever was drawn before it. */
function regionRng(seed: number, id: string): Rng {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return mulberry32((seed ^ h ^ Math.floor(hash01(h, 7) * 4294967296)) >>> 0);
}

export function beginRegion(w: Writer, id: string, band: Band, depth: number, dynamic = false): number {
  if (w.current) throw new Error(`region ${w.regions[w.current.index]?.id} still open`);
  const index = w.regions.length;
  w.regions.push({ id, band, depth, start: w.store.count, end: w.store.count, dynamic });
  w.current = { index, depth };
  w.rng = regionRng(w.seed, id);
  return index;
}

export function endRegion(w: Writer): RegionSpec {
  const cur = w.current;
  if (!cur) throw new Error('no open region');
  const region = w.regions[cur.index];
  if (!region) throw new Error('region missing');
  region.end = w.store.count;
  w.current = null;
  return region;
}

export function emit(w: Writer, x: number, y: number, z: number, rgb: Rgb, a: number, size: number): number {
  const cur = w.current;
  if (!cur) throw new Error('emit outside a region');
  const s = w.store;
  if (s.count >= s.capacity) {
    w.overflow++;
    return -1;
  }
  const k = s.count++;
  s.x[k] = x;
  s.y[k] = y;
  s.z[k] = z;
  s.r[k] = clamp01(rgb[0]);
  s.g[k] = clamp01(rgb[1]);
  s.b[k] = clamp01(rgb[2]);
  s.a[k] = clamp01(a);
  s.size[k] = Math.max(0.5, size);
  s.region[k] = cur.index;
  s.phase[k] = w.rng();
  s.motion[k] = w.motion;
  s.birthMs[k] = w.birthMs;
  w.tags[k] = w.tag;
  return k;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
/** Renderers draw soft discs whose solid core is ~0.875 r; authored diameters are scaled up to keep fills covering. */
export const SIZE_GAIN = 1.12;
const scalar = (v: ScalarAt | undefined, d: number, x: number, y: number, u: number, v2: number) =>
  v === undefined ? d : typeof v === 'number' ? v : v(x, y, u, v2);
const colourAt = (c: ColourAt, x: number, y: number, u: number, v: number): Rgb => (typeof c === 'function' ? c(x, y, u, v) : c);

/** Multiplicative lightness jitter plus a faint warm/cool drift, so fills read as stipple, not flat. */
export function jitterColour(rgb: Rgb, rng: Rng, amount: number): Rgb {
  const l = 1 + (rng() - 0.5) * 2 * amount;
  const warm = (rng() - 0.5) * amount * 0.6;
  return [rgb[0] * l + warm, rgb[1] * l, rgb[2] * l - warm];
}

export function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const f = clamp01(t);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function pointInPolygon(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] as Pt;
    const [xj, yj] = poly[j] as Pt;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Samples outside the authored frame (plus a small margin) are never stored: they would never draw. */
const inFrame = (x: number, y: number) => x > -0.03 && x < 1.03 && y > -0.03 && y < 1.03;

function emitSample(w: Writer, spec: FillSpec, x: number, y: number, u: number, v: number): void {
  if (!inFrame(x, y)) return;
  const cov = scalar(spec.coverage, 1, x, y, u, v);
  if (cov < 1 && w.rng() > cov) return;
  const base = colourAt(spec.colour, x, y, u, v);
  const rgb = jitterColour(base, w.rng, spec.tone ?? 0.03);
  const size = scalar(spec.size, 3.2, x, y, u, v) * SIZE_GAIN * (0.8 + w.rng() * 0.4);
  const a = scalar(spec.alpha, 1, x, y, u, v);
  const depth = scalar(spec.depth, w.current?.depth ?? 0, x, y, u, v);
  emit(w, x, y, depth, rgb, a, size);
}

/** Jittered-grid fill of a polygon (even-odd rule). */
export function fillPolygon(w: Writer, poly: readonly Pt[], spec: FillSpec): void {
  if (poly.length < 3) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const s = (spec.spacing ?? 0.003) / Math.sqrt(w.density);
  const dx = s / w.aspect;
  const jit = spec.jitter ?? 0.55;
  const bw = Math.max(x1 - x0, 1e-6);
  const bh = Math.max(y1 - y0, 1e-6);
  for (let gy = y0 + s * 0.5; gy < y1; gy += s) {
    for (let gx = x0 + dx * 0.5; gx < x1; gx += dx) {
      const x = gx + (w.rng() - 0.5) * dx * jit * 2;
      const y = gy + (w.rng() - 0.5) * s * jit * 2;
      if (!pointInPolygon(x, y, poly)) continue;
      emitSample(w, spec, x, y, (x - x0) / bw, (y - y0) / bh);
    }
  }
}

/** Jittered-grid fill of an ellipse, optionally rotated (radians, clockwise on screen). */
export function fillEllipse(w: Writer, cx: number, cy: number, rx: number, ry: number, spec: FillSpec, rot = 0): void {
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const ext = Math.max(rx, ry);
  const s = (spec.spacing ?? 0.003) / Math.sqrt(w.density);
  const dx = s / w.aspect;
  const jit = spec.jitter ?? 0.55;
  for (let gy = cy - ext; gy <= cy + ext; gy += s) {
    for (let gx = cx - ext; gx <= cx + ext; gx += dx) {
      const x = gx + (w.rng() - 0.5) * dx * jit * 2;
      const y = gy + (w.rng() - 0.5) * s * jit * 2;
      // Rotate into the ellipse frame using isotropic units.
      const ox = (x - cx) * w.aspect, oy = y - cy;
      const lx = (ox * cosR + oy * sinR) / w.aspect, ly = -ox * sinR + oy * cosR;
      const d = (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry);
      if (d > 1) continue;
      emitSample(w, spec, x, y, (lx / rx + 1) / 2, (ly / ry + 1) / 2);
    }
  }
}

/** Points on a rotated ellipse, t in radians. */
export function ellipsePoint(cx: number, cy: number, rx: number, ry: number, t: number, rot = 0, aspect = 16 / 9): Pt {
  const lx = rx * Math.cos(t) * aspect, ly = ry * Math.sin(t);
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  return [cx + (lx * cosR - ly * sinR) / aspect, cy + lx * sinR + ly * cosR];
}

export function ellipseArc(cx: number, cy: number, rx: number, ry: number, t0: number, t1: number, steps: number, rot = 0, aspect = 16 / 9): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) out.push(ellipsePoint(cx, cy, rx, ry, t0 + ((t1 - t0) * i) / steps, rot, aspect));
  return out;
}

/** Particles along a polyline with a given width (frame-height units). u runs along the line, v across it. */
export function strokePolyline(w: Writer, pts: readonly Pt[], width: number, spec: FillSpec, closed = false): void {
  const s = (spec.spacing ?? 0.0022) / Math.sqrt(w.density);
  const jit = spec.jitter ?? 0.45;
  const path = closed && pts.length > 1 ? [...pts, pts[0] as Pt] : pts;
  let total = 0;
  const lens: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1] as Pt;
    const [bx, by] = path[i] as Pt;
    const l = Math.hypot((bx - ax) * w.aspect, by - ay);
    lens.push(l);
    total += l;
  }
  if (total <= 0) return;
  const across = Math.max(1, Math.round(width / s));
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1] as Pt;
    const [bx, by] = path[i] as Pt;
    const l = lens[i - 1] as number;
    if (l <= 0) continue;
    const tx = ((bx - ax) * w.aspect) / l, ty = (by - ay) / l; // unit tangent, isotropic
    const nx = -ty, ny = tx;
    for (let d = 0; d < l; d += s) {
      const u = (walked + d) / total;
      for (let k = 0; k < across; k++) {
        const v = across === 1 ? 0.5 : (k + 0.5) / across;
        const off = (v - 0.5) * width + (w.rng() - 0.5) * s * jit;
        const along = d + (w.rng() - 0.5) * s * jit;
        const px = ax + (tx * along + nx * off) / w.aspect;
        const py = ay + ty * along + ny * off;
        emitSample(w, spec, px, py, u, v);
      }
    }
    walked += l;
  }
}

/** Thin ink line: the pencil/sepia outline that P1 keeps around every form. */
export function ink(w: Writer, pts: readonly Pt[], colour: Rgb, alpha = 0.75, size = 2.0, closed = false, width = 0.0016): void {
  strokePolyline(w, pts, width, { colour, alpha, size, spacing: 0.0021, tone: 0.03 }, closed);
}

export function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** Linear interpolation along a quadrilateral's vertical edges: a column slice of a receding façade. */
export function quadColumn(q: readonly [Pt, Pt, Pt, Pt], u0: number, u1: number, v0: number, v1: number): Pt[] {
  // q = [top-left, top-right, bottom-right, bottom-left] in façade (u along, v down) order.
  const at = (u: number, v: number): Pt => {
    const tx = q[0][0] + (q[1][0] - q[0][0]) * u, ty = q[0][1] + (q[1][1] - q[0][1]) * u;
    const bx = q[3][0] + (q[2][0] - q[3][0]) * u, by = q[3][1] + (q[2][1] - q[3][1]) * u;
    return [tx + (bx - tx) * v, ty + (by - ty) * v];
  };
  return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
}

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
