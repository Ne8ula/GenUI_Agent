/**
 * Deterministic seeded randomness for the eye renderer.
 *
 * Main supplies either a fresh crypto-sourced numeric seed per live turn, or
 * a fixed deterministic fixture seed for reproducible synthetic tests
 * (week3/PLANNING.md#2, #4 day 3, #6 "deterministic reproduction of
 * synthetic seeds"). Nothing here reads real time, DOM state or conversation
 * text: a given (seed) always produces the same sequence.
 */

export type Rng = () => number;

/** mulberry32: small, fast, statistically adequate for visual variation (not cryptographic). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Combine a numeric seed with plain identifying tokens (stance name, retry
 * index, ...) into a new 32-bit seed. No conversation content is ever
 * passed here; only short local labels and numbers.
 */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return h >>> 0;
}

/** Sample a float uniformly within [lo, hi) using the given rng. */
export function pickRange(rng: Rng, range: readonly [number, number]): number {
  const [lo, hi] = range;
  if (hi <= lo) return lo;
  return lo + rng() * (hi - lo);
}

/** Sample an integer within [lo, hi] inclusive using the given rng. */
export function pickInt(rng: Rng, range: readonly [number, number]): number {
  const [lo, hi] = range;
  if (hi <= lo) return Math.round(lo);
  return Math.min(hi, Math.round(lo + rng() * (hi - lo)));
}
