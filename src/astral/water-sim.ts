// The pool's water: a height field under the linear wave equation on a grid over the pool's ellipse, reflecting at the rim.
// Pure: no three.js, no DOM. One simulation drives both renderings (water.ts).
import type { RoomWater } from './types.ts';

export type Vec3 = [number, number, number];

export interface WaterSimOptions {
  /** Cells across the pool's longer axis. */
  cells?: number;
  /** Wave speed, m/s: ripples a few centimetres long on deep water travel at about this. */
  speed?: number;
  /** Velocity damping, 1/s: a disturbance has mostly died away within about ten seconds. */
  damping?: number;
  /** The room's own life (a rare drip, a slow swell). Off for tests. */
  ambient?: boolean;
  /** Seed for the drips and droplets. */
  seed?: number;
}

export interface WaterInput {
  /** The viewer's position: flying low across the water or dipping into it disturbs it. */
  viewer?: Vec3;
  /** The eye's position and glow: passing close above, it stirs the water. */
  eye?: Vec3;
  eyeGlow?: number;
}

/** A drop thrown out of the water; it falls back and rings the surface (or lands on the floor around it and is gone). */
export interface Droplet { x: number; y: number; z: number; vx: number; vy: number; vz: number; size: number }

export const SUBSTEP = 1 / 120;          // fixed sub-step, seconds
const MAX_SUBSTEPS = 12;                 // per call: a long frame is time lost, never an unstable step
const GRAVITY = 9.81;
const MAX_DROPLETS = 96;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export interface WaterSim {
  readonly water: RoomWater;
  /** Grid: nx by nz cells of `cell` metres, the first cell's corner at (x0, z0). Cell (i, k) is h[k * nx + i]. */
  readonly nx: number;
  readonly nz: number;
  readonly cell: number;
  readonly x0: number;
  readonly z0: number;
  /** 1 inside the ellipse. Cells outside never move. */
  readonly mask: Uint8Array;
  /** Height above the rest level, metres, and its rate, m/s. */
  readonly h: Float32Array;
  readonly v: Float32Array;
  readonly droplets: Droplet[];
  /** Seconds simulated. */
  readonly time: number;
  /** Advance by dt seconds of frame time (any value; long frames are clipped). */
  step(dt: number, input?: WaterInput): void;
  /** Kick the surface: a vertical velocity (m/s, negative pushes down) spread over `radius` metres round (x, z). Returns false outside. */
  disturb(x: number, z: number, radius: number, speed: number): boolean;
  /** Height at a point (bilinear), metres above the rest level; 0 outside. */
  heightAt(x: number, z: number): number;
  inside(x: number, z: number): boolean;
  /** Rendering field, RGBA per cell: height, d/dx, d/dz, and the surface's curvature (Laplacian, 1/m), for caustics. */
  fill(out: Float32Array): void;
}

export function createWaterSim(water: RoomWater, options: WaterSimOptions = {}): WaterSim {
  const [cx, cy, cz] = water.center, [rx, rz] = water.radius;
  if (![cx, cy, cz, rx, rz, water.depth].every(Number.isFinite) || rx <= 0 || rz <= 0 || water.depth <= 0) throw new RangeError('invalid pool');
  const cells = Math.max(8, Math.min(512, Math.round(options.cells ?? 128)));
  const cell = (2 * Math.max(rx, rz)) / cells;
  // one cell of margin all round, outside the ellipse, so every inside cell has four neighbours in the grid
  const nx = Math.ceil((2 * rx) / cell) + 2, nz = Math.ceil((2 * rz) / cell) + 2;
  const x0 = cx - (nx * cell) / 2, z0 = cz - (nz * cell) / 2;
  const n = nx * nz, mask = new Uint8Array(n), h = new Float32Array(n), v = new Float32Array(n), lap = new Float32Array(n);
  let inCount = 0;
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = (x0 + (i + 0.5) * cell - cx) / rx, z = (z0 + (k + 0.5) * cell - cz) / rz;
    if (x * x + z * z < 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1) { mask[k * nx + i] = 1; inCount++; }
  }
  const c = options.speed ?? 0.32, damping = options.damping ?? 0.35, ambient = options.ambient ?? true;
  const c2 = (c * c) / (cell * cell);
  const random = mulberry32(options.seed ?? 1);
  const droplets: Droplet[] = [];
  let time = 0, carry = 0, nextDrip = 4 + random() * 8;
  let lastViewer: Vec3 | null = null;

  const inside = (x: number, z: number) => { const a = (x - cx) / rx, b = (z - cz) / rz; return a * a + b * b < 1; };

  const disturb = (x: number, z: number, radius: number, speed: number): boolean => {
    if (!inside(x, z) || !Number.isFinite(speed) || !(radius > 0)) return false;
    const reach = Math.ceil((2.5 * radius) / cell), ci = Math.floor((x - x0) / cell), ck = Math.floor((z - z0) / cell);
    for (let k = Math.max(0, ck - reach); k <= Math.min(nz - 1, ck + reach); k++) for (let i = Math.max(0, ci - reach); i <= Math.min(nx - 1, ci + reach); i++) {
      const j = k * nx + i;
      if (!mask[j]) continue;
      const dx = x0 + (i + 0.5) * cell - x, dz = z0 + (k + 0.5) * cell - z;
      v[j] += speed * Math.exp(-(dx * dx + dz * dz) / (radius * radius));
    }
    return true;
  };

  // a strong kick throws a few drops; they come down and ring the surface where they land
  const splash = (x: number, z: number, strength: number) => {
    const count = Math.min(MAX_DROPLETS - droplets.length, Math.floor(strength * 24));
    for (let d = 0; d < count; d++) {
      const a = random() * Math.PI * 2, up = 0.9 + random() * 1.6 * Math.min(1.5, strength), out = 0.15 + random() * 0.45;
      droplets.push({ x: x + Math.cos(a) * 0.05, y: cy + 0.01, z: z + Math.sin(a) * 0.05, vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out, size: 0.004 + random() * 0.006 });
    }
  };

  const heightAt = (x: number, z: number) => {
    const fx = (x - x0) / cell - 0.5, fz = (z - z0) / cell - 0.5;
    const i = Math.floor(fx), k = Math.floor(fz);
    if (i < 0 || k < 0 || i >= nx - 1 || k >= nz - 1) return 0;
    const tx = fx - i, tz = fz - k, j = k * nx + i;
    return (h[j]! * (1 - tx) + h[j + 1]! * tx) * (1 - tz) + (h[j + nx]! * (1 - tx) + h[j + nx + 1]! * tx) * tz;
  };

  // reflecting rim: a neighbour outside the pool stands in at the cell's own height (no slope across the wall)
  const laplacian = (field: Float32Array, out: Float32Array) => {
    for (let k = 1; k < nz - 1; k++) for (let i = 1; i < nx - 1; i++) {
      const j = k * nx + i;
      if (!mask[j]) continue;
      const hc = field[j]!;
      out[j] = (mask[j - 1] ? field[j - 1]! : hc) + (mask[j + 1] ? field[j + 1]! : hc) + (mask[j - nx] ? field[j - nx]! : hc) + (mask[j + nx] ? field[j + nx]! : hc) - 4 * hc;
    }
  };

  const substep = (input: WaterInput, viewerVel: Vec3 | null) => {
    const dt = SUBSTEP;
    time += dt;
    // the room's own life: a slow slosh, and now and then a drip from nowhere
    if (ambient) {
      const swell = 0.0009 * Math.sin(time * 0.53) + 0.0006 * Math.sin(time * 0.31 + 1.7);
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const j = k * nx + i;
        if (mask[j]) v[j] += dt * swell * ((x0 + (i + 0.5) * cell - cx) / rx + 0.6 * (z0 + (k + 0.5) * cell - cz) / rz);
      }
      if (time > nextDrip) {
        nextDrip = time + 6 + random() * 12;
        const a = random() * Math.PI * 2, r = Math.sqrt(random()) * 0.8;
        disturb(cx + Math.cos(a) * r * rx, cz + Math.sin(a) * r * rz, 0.012, -0.35);
      }
    }
    // the viewer: flying low drags a wake; passing through the surface breaks it and throws drops
    const viewer = input.viewer;
    if (viewer && viewerVel) {
      const above = viewer[1] - cy, speed = Math.hypot(viewerVel[0], viewerVel[2]);
      const near = above > -water.depth && above < 0.7 ? 1 - Math.max(0, above) / 0.7 : 0;
      if (near > 0 && inside(viewer[0], viewer[2])) disturb(viewer[0], viewer[2], 0.07 + 0.05 * near, -dt * 60 * (0.025 + speed * 0.15) * near * near);
    }
    // the eye, close above, stirs it a little
    const eye = input.eye, glow = input.eyeGlow ?? 0;
    if (eye && glow > 0) {
      const above = eye[1] - cy;
      if (above > 0 && above < 0.9 && inside(eye[0], eye[2])) disturb(eye[0], eye[2], 0.06, -dt * 60 * 0.012 * glow * (1 - above / 0.9));
    }

    laplacian(h, lap);
    let mean = 0;
    for (let j = 0; j < n; j++) {
      if (!mask[j]) continue;
      v[j] += dt * (c2 * lap[j]! - damping * v[j]!);
      mean += v[j]!;
    }
    // water is neither made nor lost: what one kick pushes down rises elsewhere, so the level stays where it is
    mean /= inCount;
    for (let j = 0; j < n; j++) if (mask[j]) { v[j] -= mean; h[j] += dt * v[j]!; }

    for (let d = droplets.length - 1; d >= 0; d--) {
      const p = droplets[d]!;
      p.vy -= GRAVITY * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.vy < 0 && p.y <= cy + heightAt(p.x, p.z)) {
        const wet = inside(p.x, p.z);
        if (wet) disturb(p.x, p.z, 0.015, -0.4 * Math.min(2, -p.vy / 2));
        if (wet || p.y <= cy) droplets.splice(d, 1);
      }
    }
  };

  return {
    water, nx, nz, cell, x0, z0, mask, h, v, droplets,
    get time() { return time; },
    disturb, heightAt, inside,
    step(dt, input = {}) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      // the viewer's speed, from where they were; a jump (a new room, a teleport) is not a speed
      const viewer = input.viewer && input.viewer.every(Number.isFinite) ? input.viewer : undefined;
      let viewerVel: Vec3 | null = null;
      if (viewer && lastViewer) {
        const d: Vec3 = [(viewer[0] - lastViewer[0]) / dt, (viewer[1] - lastViewer[1]) / dt, (viewer[2] - lastViewer[2]) / dt];
        if (Math.hypot(...d) * dt < 1) viewerVel = d;
        // breaking the surface: a splash and drops, as hard as the viewer came through
        const before = lastViewer[1] - cy, after = viewer[1] - cy;
        if (viewerVel && before > 0 !== after > 0 && inside(viewer[0], viewer[2])) {
          const strength = Math.min(2, Math.abs(viewerVel[1]) + 0.3 * Math.hypot(viewerVel[0], viewerVel[2]));
          disturb(viewer[0], viewer[2], 0.12, -0.9 * strength);
          splash(viewer[0], viewer[2], strength);
        }
      }
      lastViewer = viewer ? [...viewer] : null;
      const eye = input.eye && input.eye.every(Number.isFinite) ? input.eye : undefined;
      const glow = Number.isFinite(input.eyeGlow) ? Math.min(1, Math.max(0, input.eyeGlow!)) : 0;
      carry = Math.min(carry + dt, MAX_SUBSTEPS * SUBSTEP);
      while (carry >= SUBSTEP) { carry -= SUBSTEP; substep({ viewer, eye, eyeGlow: glow }, viewerVel); }
    },
    fill(out) {
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const j = k * nx + i, o = j * 4;
        if (!mask[j]) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
        const hc = h[j]!, l = mask[j - 1] ? h[j - 1]! : hc, r = mask[j + 1] ? h[j + 1]! : hc, b = mask[j - nx] ? h[j - nx]! : hc, f = mask[j + nx] ? h[j + nx]! : hc;
        out[o] = hc; out[o + 1] = (r - l) / (2 * cell); out[o + 2] = (f - b) / (2 * cell); out[o + 3] = (l + r + b + f - 4 * hc) / (cell * cell);
      }
    },
  };
}
