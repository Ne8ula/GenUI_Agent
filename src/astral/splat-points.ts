import { Color, Quaternion, Vector3 } from 'three';
import { ORDERED_ALONG_ROW_SPACING, ORDERED_ROW_SPACING } from './surface-sampler.ts';
import { ceilingPanels, insideWater, unprojectPixel, validatePosedManifest, yieldToFrame, type PosedManifest } from './posed-frames.ts';
import type { PointCloud, RoomHero } from './types.ts';

export const SPLAT_REACH = 1.25;
export const MIN_SPLAT_OPACITY = 0.2;
export const MAX_SPLAT_SCALE = 0.25;
export type SurfaceSplat = { center: Vector3; scales: Vector3; quaternion: Quaternion; opacity: number; color: Color };
type SplatSource = { numSplats: number; getSplat(index: number): SurfaceSplat };
type Ellipse = { center: Vector3; u: Vector3; v: Vector3; normal: Vector3; color: Color; slice: number; along: number };
const ellipse = (): Ellipse => ({ center: new Vector3(), u: new Vector3(), v: new Vector3(), normal: new Vector3(), color: new Color(), slice: 1, along: 0 });

export function rejectSplat(splat: SurfaceSplat): 'opacity' | 'size' | 'invalid' | null {
  const { center: c, scales: s, quaternion: q, color, opacity } = splat;
  if (!Number.isFinite(c.x + c.y + c.z + s.x + s.y + s.z + q.x + q.y + q.z + q.w + color.r + color.g + color.b + opacity)
    || s.x < 0 || s.y < 0 || s.z < 0 || q.lengthSq() < 0.99 || q.lengthSq() > 1.01) return 'invalid';
  if (opacity < MIN_SPLAT_OPACITY) return 'opacity';
  if (Math.max(s.x, s.y, s.z) > MAX_SPLAT_SCALE) return 'size';
  return null;
}

export function splatEllipse(splat: SurfaceSplat, cameras: readonly Vector3[], target = ellipse()): Ellipse | null {
  if (rejectSplat(splat)) return null;
  const s = splat.scales, shortest = s.x <= s.y && s.x <= s.z ? 0 : s.y <= s.z ? 1 : 2;
  const a = (shortest + 1) % 3, b = (shortest + 2) % 3;
  if (s.getComponent(a) < 1e-7 || s.getComponent(b) < 1e-7) return null;
  target.center.copy(splat.center);
  target.u.set(0, 0, 0).setComponent(a, s.getComponent(a) * SPLAT_REACH).applyQuaternion(splat.quaternion);
  target.v.set(0, 0, 0).setComponent(b, s.getComponent(b) * SPLAT_REACH).applyQuaternion(splat.quaternion);
  target.normal.set(0, 0, 0).setComponent(shortest, 1).applyQuaternion(splat.quaternion).normalize();
  let nearest = cameras[0], distance = Infinity;
  for (const camera of cameras) {
    const d = camera.distanceToSquared(splat.center);
    if (d < distance) { distance = d; nearest = camera; }
  }
  if (nearest && target.normal.x * (nearest.x - splat.center.x) + target.normal.y * (nearest.y - splat.center.y) + target.normal.z * (nearest.z - splat.center.z) < 0) target.normal.negate();
  target.slice = Math.abs(target.normal.y) >= Math.SQRT1_2 ? 0 : 1;
  target.along = target.slice === 0 ? 2 : Math.abs(target.normal.x) > Math.abs(target.normal.z) ? 2 : 0;
  // PackedSplats exposes raw sRGB (including SH0 + 0.5), not Three's usual linear material colour.
  target.color.copy(splat.color);
  return target;
}

/** The yielded vector is reused. Quantisation is in world coordinates, never relative to a splat centre. */
function* strictEllipseLattice(e: Ellipse, rowSpacing: number, alongSpacing: number, point: Vector3): Generator<Vector3> {
  const s = e.slice, t = e.along;
  const us = e.u.getComponent(s), vs = e.v.getComponent(s), ut = e.u.getComponent(t), vt = e.v.getComponent(t);
  const cs = e.center.getComponent(s), ct = e.center.getComponent(t);
  const h = us * us + vs * vs, radius = Math.sqrt(h), det = us * vt - vs * ut;
  if (h < 1e-20 || Math.abs(det) < 1e-20) return;
  const first = Math.ceil((cs - radius) / rowSpacing - 1e-7), last = Math.floor((cs + radius) / rowSpacing + 1e-7);
  for (let row = first; row <= last; row++) {
    const rowPosition = row * rowSpacing, offset = rowPosition - cs;
    const middle = ct + (ut * us + vt * vs) * offset / h;
    const extent = Math.sqrt(Math.max(0, 1 - offset * offset / h)) * Math.abs(det) / radius;
    const start = Math.ceil((middle - extent) / alongSpacing - 1e-7), end = Math.floor((middle + extent) / alongSpacing + 1e-7);
    for (let column = start; column <= end; column++) {
      const along = column * alongSpacing, delta = along - ct;
      const a = (offset * vt - vs * delta) / det, b = (us * delta - offset * ut) / det;
      point.copy(e.center).addScaledVector(e.u, a).addScaledVector(e.v, b);
      point.setComponent(s, rowPosition).setComponent(t, along);
      yield point;
    }
  }
}

export function* ellipseLattice(e: Ellipse, rowSpacing: number, alongSpacing: number, point = new Vector3(), probeStride = 1): Generator<Vector3> {
  let emitted = false;
  for (const p of strictEllipseLattice(e, rowSpacing, alongSpacing, point)) { emitted = true; yield p; }
  if (emitted) return;
  const row = rowSpacing / probeStride, along = alongSpacing / probeStride;
  if (probeStride > 1 && !strictEllipseLattice(e, row, along, point).next().done) return;
  // Conservative cell coverage: sub-cell splats (notably the clock face) must not disappear between rows.
  const s = e.slice, t = e.along, other = 3 - s - t;
  const ri = Math.round(e.center.getComponent(s) / row), ci = Math.round(e.center.getComponent(t) / along);
  if (ri % probeStride !== 0 || ci % probeStride !== 0) return;
  const ds = ri * row - e.center.getComponent(s), dt = ci * along - e.center.getComponent(t);
  point.copy(e.center).setComponent(s, ri * row).setComponent(t, ci * along);
  point.setComponent(other, e.center.getComponent(other) - (e.normal.getComponent(s) * ds + e.normal.getComponent(t) * dt) / e.normal.getComponent(other));
  yield point;
}

function insideHero(point: Vector3, heroes: readonly RoomHero[]): boolean {
  return heroes.some(h => point.x >= h.min[0] && point.x <= h.max[0] && point.y >= h.min[1] && point.y <= h.max[1] && point.z >= h.min[2] && point.z <= h.max[2]);
}

function* heroLattice(e: Ellipse, row: number, along: number, heroes: readonly RoomHero[], point: Vector3, stride = 1): Generator<Vector3> {
  const touches = heroes.some(h => [0, 1, 2].every(axis => {
    const reach = Math.hypot(e.u.getComponent(axis), e.v.getComponent(axis)) + row;
    return e.center.getComponent(axis) + reach >= h.min[axis] && e.center.getComponent(axis) - reach <= h.max[axis];
  }));
  if (!touches) { yield* ellipseLattice(e, row, along, point, stride); return; }
  for (const p of ellipseLattice(e, row, along, point, stride)) if (!insideHero(p, heroes)) yield p;
  for (const p of ellipseLattice(e, row / 2, along / 2, point, stride)) if (insideHero(p, heroes)) yield p;
}

export async function sampleSplatPoints(source: SplatSource, manifest: PosedManifest, signal: AbortSignal, maxPoints = 4_000_000): Promise<PointCloud> {
  signal.throwIfAborted();
  if (!Number.isSafeInteger(maxPoints) || maxPoints < 1 || maxPoints > 4_000_000 || !Number.isSafeInteger(source.numSplats) || source.numSplats < 1 || source.numSplats > 16_000_000) throw new Error('Invalid splat point budget or source.');
  const cameras = manifest.frames.map(frame => new Vector3(...frame.camera.extrinsics.position));
  if (!cameras.length) throw new Error('No splat orientation cameras.');
  const positions = new Float32Array(maxPoints * 3), normals = new Float32Array(maxPoints * 3), colors = new Float32Array(maxPoints * 3);
  // An exact open-addressed integer grid avoids millions of string keys and their GC stalls.
  const capacity = 2 ** Math.ceil(Math.log2(Math.max(16, maxPoints * 2))), mask = capacity - 1;
  const cells = new Int32Array(capacity * 3), indices = new Uint32Array(capacity), quality = new Float32Array(maxPoints);
  const stats = { splats: source.numSplats, opacity: 0, size: 0, invalid: 0, accepted: 0, water: 0, duplicates: 0, candidates: 0, passes: 0, maxSliceMs: 0 };
  let sliceStarted = performance.now();
  const pause = async () => { stats.maxSliceMs = Math.max(stats.maxSliceMs, performance.now() - sliceStarted); await yieldToFrame(signal); sliceStarted = performance.now(); };
  const heroes = manifest.heroes?.map(hero => ({ ...hero, count: 0 }));
  const heroBoxes = heroes ?? [];
  const e = ellipse(), p = new Vector3();
  const colorAt = (index: number, detail: number) => {
    quality[index] = detail;
    const j = index * 3;
    colors[j] = Math.max(0, Math.min(1, e.color.r)); colors[j + 1] = Math.max(0, Math.min(1, e.color.g)); colors[j + 2] = Math.max(0, Math.min(1, e.color.b));
  };
  let scale = 1, count = 0, rowSpacing = ORDERED_ROW_SPACING, alongSpacing = ORDERED_ALONG_ROW_SPACING;
  // Projected ellipse area gives the lattice demand; sparse world-grid probes measure its overlap.
  let area = 0;
  for (let i = 0; i < source.numSplats; i++) {
    if (i % 128 === 0 && performance.now() - sliceStarted >= 5) await pause();
    if (!splatEllipse(source.getSplat(i), cameras, e)) continue;
    area += (insideHero(e.center, heroBoxes) ? 4 : 1) * Math.PI * Math.abs(e.u.getComponent(e.slice) * e.v.getComponent(e.along) - e.v.getComponent(e.slice) * e.u.getComponent(e.along));
  }
  const demand = area / (ORDERED_ROW_SPACING * ORDERED_ALONG_ROW_SPACING);
  if (demand > maxPoints) {
    scale = Math.max(1, Math.sqrt(demand / (maxPoints * .995)));
    const stride = maxPoints >= 100000 ? 2 : 1;
    for (let probe = 0; probe < 3; probe++) {
      const seen = new Set<string>();
      const along = ORDERED_ALONG_ROW_SPACING * scale, row = ORDERED_ROW_SPACING * scale;
      for (let i = 0; i < source.numSplats; i++) {
        if (i % 128 === 0 && performance.now() - sliceStarted >= 5) await pause();
        if (!splatEllipse(source.getSplat(i), cameras, e)) continue;
        for (const point of heroLattice(e, row * stride, along * stride, heroBoxes, p, stride)) {
          if (insideWater(point, manifest.water)) continue;
          const q = insideHero(point, heroBoxes) ? 2 : 1;
          seen.add(`${Math.round(point.x * q / along) * (2 / q)},${Math.round(point.y * q / along) * (2 / q)},${Math.round(point.z * q / along) * (2 / q)}`);
        }
      }
      const estimated = seen.size * stride * stride;
      scale = Math.max(1, scale * Math.sqrt(estimated / (maxPoints * .995)));
      console.info('Splat estimate:', JSON.stringify({ demand, probe, estimated, scale }));
    }
  }
  for (let attempt = 0; attempt < 16; attempt++) {
    stats.passes++; count = 0; stats.water = 0; stats.duplicates = 0; stats.candidates = 0;
    stats.opacity = 0; stats.size = 0; stats.invalid = 0; stats.accepted = 0;
    for (const hero of heroes ?? []) hero.count = 0;
    for (let i = 0; i < cells.length; i += 262144) {
      cells.fill(0, i, Math.min(cells.length, i + 262144));
      if (i < indices.length) indices.fill(0, i, Math.min(indices.length, i + 262144));
      if (performance.now() - sliceStarted >= 5) await pause();
    }
    let claimedSlot = 0;
    rowSpacing = ORDERED_ROW_SPACING * scale; alongSpacing = ORDERED_ALONG_ROW_SPACING * scale;
    const claim = (point: Vector3) => {
      const q = insideHero(point, heroBoxes) ? 2 : 1;
      const x = Math.round(point.x * q / alongSpacing) * (2 / q), y = Math.round(point.y * q / alongSpacing) * (2 / q), z = Math.round(point.z * q / alongSpacing) * (2 / q);
      if (Math.abs(x) > 2147483647 || Math.abs(y) > 2147483647 || Math.abs(z) > 2147483647) throw new Error('Splat position is outside the metric lattice range.');
      let slot = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
      while (true) {
        const i = slot * 3;
        if (indices[slot] === 0) { cells[i] = x; cells[i + 1] = y; cells[i + 2] = z; claimedSlot = slot; return -1; }
        if (cells[i] === x && cells[i + 1] === y && cells[i + 2] === z) return indices[slot] - 1;
        slot = (slot + 1) & mask;
      }
    };
    let overflow = false;
    for (let i = 0; i < source.numSplats; i++) {
      if (i % 128 === 0 && performance.now() - sliceStarted >= 5) await pause();
      const splat = source.getSplat(i), rejected = rejectSplat(splat);
      if (rejected) { stats[rejected]++; continue; }
      if (!splatEllipse(splat, cameras, e)) { stats.invalid++; continue; }
      stats.accepted++;
      const detail = splat.opacity / Math.max(1e-12, e.u.length() * e.v.length());
      for (const point of heroLattice(e, rowSpacing, alongSpacing, heroBoxes, p)) {
        if (++stats.candidates % 256 === 0 && performance.now() - sliceStarted >= 5) await pause();
        if (insideWater(point, manifest.water)) { stats.water++; continue; }
        const previous = claim(point);
        // A broad low-detail splat must not win a texel over a fine surface merely by file order.
        if (previous >= 0) { stats.duplicates++; if (detail > quality[previous]) colorAt(previous, detail); continue; }
        if (count === maxPoints) { overflow = true; break; }
        indices[claimedSlot] = count + 1;
        const j = count * 3;
        point.toArray(positions, j); e.normal.toArray(normals, j); colorAt(count, detail);
        for (const hero of heroes ?? []) {
          if (positions[j] >= hero.min[0] && positions[j] <= hero.max[0] && positions[j + 1] >= hero.min[1] && positions[j + 1] <= hero.max[1] && positions[j + 2] >= hero.min[2] && positions[j + 2] <= hero.max[2]) hero.count++;
        }
        count++;
      }
      if (overflow) break;
    }
    if (!overflow) break;
    // Restart globally; never truncate the room or thin holes into its rows.
    scale *= 1.025;
    if (attempt === 15) throw new Error('Cannot fit the splat lattice into the point budget.');
  }
  if (!count) throw new Error('Splats contain no usable surface points.');
  await pause();
  const cloud: PointCloud = { count, positions: positions.subarray(0, count * 3), normals: normals.subarray(0, count * 3), colors: colors.subarray(0, count * 3), spacing: Math.sqrt(rowSpacing * alongSpacing), ordered: true, lit: true, heroes, water: manifest.water };
  cloud.lights = { ceiling: await ceilingPanels(cloud.positions, cloud.normals!, cloud.colors, signal), lamps: [] };
  const camera = manifest.frames[0].camera;
  cloud.arrival = { position: [...camera.extrinsics.position], lookAt: unprojectPixel(camera, camera.intrinsics.cx, camera.intrinsics.cy, 6).toArray() };
  signal.throwIfAborted();
  console.info('Splat lattice:', JSON.stringify({ ...stats, count, rowSpacing, alongSpacing, spacing: cloud.spacing, reach: SPLAT_REACH, lights: cloud.lights, heroes: heroes?.map(({ name, count }) => ({ name, count })) }));
  return cloud;
}

export async function loadSplatPoints(base: string, input: unknown, signal: AbortSignal): Promise<PointCloud> {
  const manifest = validatePosedManifest(input);
  if (!manifest.splats) throw new Error('The room has no splat file.');
  signal.throwIfAborted();
  const started = performance.now(), url = base + manifest.splats;
  const { PackedSplats } = await import('@sparkjsdev/spark');
  signal.throwIfAborted();
  const response = await fetch(url, { signal, redirect: 'error', credentials: 'same-origin' });
  if (!response.ok || !response.body) throw new Error(`Room splats could not load (HTTP ${response.status}).`);
  // Spark decodes the stream in its own worker; no synchronous EXR parser or file-sized byte copy here.
  const packed = new PackedSplats({ stream: response.body, streamLength: Number(response.headers.get('content-length')) || undefined, fileName: manifest.splats });
  try {
    await packed.initialized;
    signal.throwIfAborted();
    const cloud = await sampleSplatPoints(packed, manifest, signal);
    cloud.splats = url;
    console.info('Recorded splat points:', JSON.stringify({ count: cloud.count, spacing: cloud.spacing, seconds: (performance.now() - started) / 1000 }));
    return cloud;
  } finally { packed.dispose(); }
}
