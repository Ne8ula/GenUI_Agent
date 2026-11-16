// Coherent deals: grains that end near each other start near each other. The arrival uses slab keys (the tunnel lays itself down as the
// room); the 'ribbons' look uses groups, so a bundle's flight paths share one curve. Pure arrays in, arrays out; point-field.ts uses them.

/** A room cut into k groups by position (k-means on a sample, then every point to its nearest centre). */
export interface Groups {
  k: number;
  /** xyz per group. */
  centres: Float32Array;
  /** Each point's group. */
  group: Uint8Array;
  /** Where each point lies across its group, 0..1, along the group's longest side. */
  u: Float32Array;
  /** Points per group. */
  sizes: Uint32Array;
}

export function groupPoints(pos: Float32Array, n: number, k: number): Groups {
  if (k < 1 || k > 255) throw new RangeError('group count must be 1..255');
  const m = Math.min(n, 20000), sample = new Float32Array(m * 3);
  for (let s = 0; s < m; s++) { const j = Math.floor(s * n / m) * 3; sample[s * 3] = pos[j]!; sample[s * 3 + 1] = pos[j + 1]!; sample[s * 3 + 2] = pos[j + 2]!; }
  const centres = new Float32Array(k * 3), near = new Float64Array(m).fill(Infinity);
  // farthest-point start: deterministic and spread over the whole room
  for (let c = 0, pick = 0; c < k; c++) {
    centres.set(sample.subarray(pick * 3, pick * 3 + 3), c * 3);
    let far = -1;
    for (let s = 0; s < m; s++) {
      const d = dist2(sample, s * 3, centres, c * 3);
      if (d < near[s]!) near[s] = d;
      if (near[s]! > far) { far = near[s]!; pick = s; }
    }
  }
  const sum = new Float64Array(k * 3), cnt = new Uint32Array(k);
  for (let it = 0; it < 10; it++) {
    sum.fill(0); cnt.fill(0);
    for (let s = 0; s < m; s++) { const c = nearest(sample, s * 3, centres, k); cnt[c]!++; for (let a = 0; a < 3; a++) sum[c * 3 + a]! += sample[s * 3 + a]!; }
    for (let c = 0; c < k; c++) if (cnt[c]) for (let a = 0; a < 3; a++) centres[c * 3 + a] = sum[c * 3 + a]! / cnt[c]!;
  }
  const group = new Uint8Array(n), sizes = new Uint32Array(k), lo = new Float64Array(k * 3).fill(Infinity), hi = new Float64Array(k * 3).fill(-Infinity);
  for (let i = 0; i < n; i++) {
    const c = nearest(pos, i * 3, centres, k); group[i] = c; sizes[c]!++;
    for (let a = 0; a < 3; a++) { const v = pos[i * 3 + a]!; if (v < lo[c * 3 + a]!) lo[c * 3 + a] = v; if (v > hi[c * 3 + a]!) hi[c * 3 + a] = v; }
  }
  const axis = new Uint8Array(k);
  for (let c = 0; c < k; c++) for (let a = 1; a < 3; a++) if (hi[c * 3 + a]! - lo[c * 3 + a]! > hi[c * 3 + axis[c]!]! - lo[c * 3 + axis[c]!]!) axis[c] = a;
  const u = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = group[i]!, a = axis[c]!, w = hi[c * 3 + a]! - lo[c * 3 + a]!;
    u[i] = w > 0 ? Math.min(0.999999, (pos[i * 3 + a]! - lo[c * 3 + a]!) / w) : 0;
  }
  return { k, centres, group, u, sizes };
}

function dist2(p: Float32Array, i: number, q: Float32Array, j: number): number {
  const x = p[i]! - q[j]!, y = p[i + 1]! - q[j + 1]!, z = p[i + 2]! - q[j + 2]!;
  return x * x + y * y + z * z;
}
function nearest(p: Float32Array, i: number, centres: Float32Array, k: number): number {
  let best = 0, bd = Infinity;
  for (let c = 0; c < k; c++) { const d = dist2(p, i, centres, c * 3); if (d < bd) { bd = d; best = c; } }
  return best;
}

/**
 * Work on millions of grains, cut into steps: each `yield` is a point where the caller may stop for this frame and carry on in the next,
 * so preparing a room never holds a frame up. finish() runs one to the end at once.
 */
export type Steps<T> = Generator<void, T, void>;
const STEP = 1 << 15;   // about 1-3 ms of work
export function finish<T>(steps: Steps<T>): T { for (;;) { const r = steps.next(); if (r.done) return r.value; } }

/** Indices in ascending key order (keys 0..1), by counting sort into fine bins: O(n) for millions of grains. */
export function* orderByKeySteps(key: Float32Array, bins = 1 << 16): Steps<Uint32Array> {
  const n = key.length, count = new Uint32Array(bins + 1), bin = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(key[i]! * bins))); bin[i] = b; count[b + 1]!++;
    if (i % STEP === STEP - 1) yield;
  }
  for (let b = 0; b < bins; b++) count[b + 1]! += count[b]!;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) { order[count[bin[i]!]!++] = i; if (i % STEP === STEP - 1) yield; }
  return order;
}
export const orderByKey = (key: Float32Array, bins?: number): Uint32Array => finish(orderByKeySteps(key, bins));

/**
 * Deals each destination an origin by rank: the r-th destination in key order takes the origin at the same share of the origins' key order.
 * Keys that run in the same order on both sides keep neighbours together; with at least as many destinations as origins, every origin is used.
 */
export function* dealSteps(destKey: Float32Array, originOrder: Uint32Array): Steps<Uint32Array> {
  const n = destKey.length, no = originOrder.length, d = yield* orderByKeySteps(destKey), from = new Uint32Array(n);
  for (let r = 0; r < n; r++) { from[d[r]!] = originOrder[Math.floor(r * no / n)]!; if (r % STEP === STEP - 1) yield; }
  return from;
}
export const dealOrigins = (destKey: Float32Array, originKey: Float32Array): Uint32Array => finish(dealSteps(destKey, orderByKey(originKey)));

/**
 * Keys that cut a cloud into `slabs` slabs along z, each holding the same share of its grains (nearest -z first), and run round the
 * line x = cx, y = cy within each slab. Two clouds keyed alike and dealt by rank: each slab of one pours into the slab of the other at the
 * same share of its length, every grain to the same side of the line it came from (below to below: floor; above to above: ceiling).
 */
export function* slabKeySteps(pos: Float32Array, n: number, slabs: number, cx: number, cy: number): Steps<Float32Array> {
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < n; j++) { const z = pos[j * 3 + 2]!; if (z < lo) lo = z; if (z > hi) hi = z; if (j % STEP === STEP - 1) yield; }
  const zKey = new Float32Array(n), span = Math.max(1e-6, hi - lo);
  for (let j = 0; j < n; j++) { zKey[j] = (pos[j * 3 + 2]! - lo) / span; if (j % STEP === STEP - 1) yield; }
  const along = yield* orderByKeySteps(zKey), key = zKey;   // zKey is not needed again: its array becomes the key
  for (let r = 0; r < n; r++) {
    const j = along[r]!, slab = Math.floor(r * slabs / n);
    const round = Math.atan2(pos[j * 3 + 1]! - cy, pos[j * 3]! - cx) / (2 * Math.PI) + 0.5;
    key[j] = (slab + Math.min(0.999, round)) / slabs;
    if (r % STEP === STEP - 1) yield;
  }
  return key;
}

/**
 * Origin keys for the tunnel: it is cut along its length into bands, each band holding exactly the share of the tunnel that its
 * groups (perBand consecutive shares, in deal order) will take, and ordered round the spiral within the band. Dealt by rank,
 * each group then comes from one sector of one band: a patch of the spiral sheet, not scattered grains.
 */
export function tunnelOriginKeys(t: TunnelOrder, shares: number[], perBand: number): Float32Array {
  const { order, around } = t, n = order.length;
  const total = shares.reduce((a, b) => a + b, 0), edges = [0];
  for (let g = perBand, acc = 0; g < shares.length + perBand; g += perBand) {
    for (let s = g - perBand; s < Math.min(g, shares.length); s++) acc += shares[s]!;
    edges.push(Math.min(1, acc / total));
  }
  edges[edges.length - 1] = 1;
  const key = new Float32Array(n);
  for (let r = 0, band = 0; r < n; r++) {
    const q = r / n, j = order[r]!;
    while (band < edges.length - 2 && q >= edges[band + 1]!) band++;
    key[j] = edges[band]! + (edges[band + 1]! - edges[band]!) * around[j]! * 0.999;
  }
  return key;
}

/** The tunnel's grains in order along its length, and where each lies round the spiral sheet (0..1). Worked out once per tunnel. */
export interface TunnelOrder { order: Uint32Array; around: Float32Array }
export function tunnelOrder(pos: Float32Array, n: number, axisY: number, twist: number): TunnelOrder {
  let zlo = Infinity, zhi = -Infinity;
  for (let j = 0; j < n; j++) { const z = pos[j * 3 + 2]!; if (z < zlo) zlo = z; if (z > zhi) zhi = z; }
  const zKey = new Float32Array(n), span = Math.max(1e-6, zhi - zlo), around = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    zKey[j] = (pos[j * 3 + 2]! - zlo) / span;
    const t = Math.atan2(pos[j * 3 + 1]! - axisY, pos[j * 3]!) - twist * pos[j * 3 + 2]!;
    around[j] = ((t / (2 * Math.PI)) % 1 + 1) % 1;
  }
  return { order: orderByKey(zKey), around };
}
