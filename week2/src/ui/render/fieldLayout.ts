import type { Lobe, PointTone } from "./types";

/** Deterministic 32-bit hash (FNV-1a) so a text seed maps to a PRNG seed. */
function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic given the same integer seed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FieldTargets {
  points: Float32Array;
  tones: Uint8Array;
  /** Stable key per global index, for callers that need to diff lobe membership. */
  keys: string[];
  totalCount: number;
}

/**
 * Pure function: same lobes + same canvas size always produce the same
 * target buffer. Points are generated directly in CSS-pixel stage space so
 * both renderer backends share identical layout math; only the draw step
 * (fillRect batches vs. a WebGL point-sprite pass) differs.
 */
export function generateFieldTargets(lobes: readonly Lobe[]): FieldTargets {
  const totalCount = lobes.reduce((sum, lobe) => sum + Math.max(0, Math.floor(lobe.count)), 0);
  const points = new Float32Array(totalCount * 2);
  const tones = new Uint8Array(totalCount);
  const keys = new Array<string>(totalCount);

  // Thin annulus bounds for "ring" lobes (see Lobe.shape): a fixed fraction
  // of the lobe's own radius, not a function of any weather value, so the
  // ring reads as a qualitative "unknown" halo rather than a measured band.
  const RING_INNER_FRACTION = 0.78;
  const RING_OUTER_FRACTION = 1.02;

  let cursor = 0;
  for (const lobe of lobes) {
    const count = Math.max(0, Math.floor(lobe.count));
    const rand = mulberry32(hashSeed(lobe.seed));
    const isRing = lobe.shape === "ring";
    for (let i = 0; i < count; i += 1) {
      let r: number;
      if (isRing) {
        // Uniform-ish sampling across the annulus band (no radial bias): a
        // ring, not a disk with a hole, so it never implies a quantitative
        // proportion.
        const band = RING_OUTER_FRACTION - RING_INNER_FRACTION;
        r = lobe.radius * (RING_INNER_FRACTION + rand() * band);
      } else {
        // Radial bias toward the center: exponent > 1 concentrates samples near cx/cy,
        // matching a "gathered" field rather than a uniform disk.
        r = lobe.radius * rand() ** 1.7;
      }
      const theta = rand() * Math.PI * 2;
      const x = lobe.cx + Math.cos(theta) * r;
      const y = lobe.cy + Math.sin(theta) * r * 0.82; // slight vertical compression, oval field
      points[cursor * 2] = x;
      points[cursor * 2 + 1] = y;
      tones[cursor] = lobe.tone as PointTone;
      keys[cursor] = `${lobe.key}:${i}`;
      cursor += 1;
    }
  }

  return { points, tones, keys, totalCount };
}

export { hashSeed, mulberry32 };
