import { FloatType, Quaternion, RedFormat, Vector3 } from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { KINDS, MOODS, POSES, SURFACES, parseLedger, type BaseRoom, type Thing } from './grammar.ts';
import type { PointCloud, RoomHero, RoomPlace, RoomWater } from './types.ts';

export type PosedCamera = {
  intrinsics: { width: number; height: number; fx: number; fy: number; cx: number; cy: number };
  extrinsics: { coordinateSystem: 'rub'; position: [number, number, number]; quaternion: [number, number, number, number] };
};
export type PosedManifest = { frames: { image: string; depth: string; confidence: string; source: 'picture' | 'generated'; camera: PosedCamera }[]; heroes?: RoomHero[]; places?: RoomPlace[]; splats?: string; points?: string; water?: RoomWater;
  /** What the room is to the grammar (LIMINAL-GRAMMAR.md, Part 4); its slots are the heroes that have one. */
  room?: Omit<BaseRoom, 'slots' | 'places'> };
export type DepthFrame = { camera: PosedCamera; depth: Float32Array; confidence: Uint8ClampedArray; kept?: Uint8Array };
export const MIN_CONFIDENCE = 128;
const surfaceTolerance = (depth: number) => 0.02 + 0.0125 * depth;

const among = (list: readonly unknown[], value: unknown) => list.includes(value);
const isId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9-]{1,40}$/.test(value);
/** One of the six directions along an axis. */
const alongAxis = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every(number => number === 0 || number === 1 || number === -1) && value.filter(Boolean).length === 1;
/** What a slot holds in the recording, read by the ledger's own rules (grammar.ts): a known discrepancy and pose, numbers in range, an absence exactly where no thing is. */
function stands(holds: unknown, slot: string): boolean {
  if (typeof holds !== 'object' || holds === null) return false;
  const thing = (holds as { thing?: unknown }).thing;
  if (thing !== null && !isId(thing)) return false;
  return parseLedger([{ ...holds, slot, seed: 0, at: 0 }], { slots: [{ id: slot }] } as unknown as BaseRoom, thing === null ? [] : [{ id: thing } as Thing]).length === 1;
}

/** The manifest as the grammar's base room: each hero that is a slot, its box the clear volume. Null when the manifest declares no room. */
export function baseRoom(manifest: PosedManifest): BaseRoom | null {
  if (!manifest.room) return null;
  const { mood, kind, era, deviation, ambiguity } = manifest.room;
  const slots = (manifest.heroes ?? []).flatMap(({ min, max, slot }) => {
    if (!slot) return [];
    const [x, y, z] = [0, 1, 2].map(axis => max[axis]! - min[axis]!) as [number, number, number];
    // width is across the way a thing there faces, depth along it
    return [{ id: slot.id, surface: slot.surface, anchor: slot.anchor, clear: slot.facing[0] ? [z, y, x] as const : [x, y, z] as const, holds: slot.holds }];
  });
  return { mood, kind, era, deviation, ambiguity, slots, places: manifest.places?.length ?? 0 };
}

export function validatePosedManifest(value: unknown): PosedManifest {
  const fail = (): never => { throw new Error('Invalid posed-frame manifest.'); };
  const filename = (name: unknown) => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name) && !name.includes('..');
  if (!value || typeof value !== 'object' || !('frames' in value) || !Array.isArray(value.frames) || value.frames.length < 1 || value.frames.length > 16) return fail();
  let pixels = 0;
  for (const frame of value.frames) {
    if (!frame || typeof frame !== 'object') return fail();
    for (const key of ['image', 'depth', 'confidence']) {
      if (!filename(frame[key])) return fail();
    }
    if (frame.source !== 'picture' && frame.source !== 'generated') return fail();
    const i = frame.camera?.intrinsics, e = frame.camera?.extrinsics;
    if (!i || !e || e.coordinateSystem !== 'rub') return fail();
    for (const key of ['width', 'height', 'fx', 'fy', 'cx', 'cy']) if (!Number.isFinite(i[key])) return fail();
    if (!Number.isInteger(i.width) || !Number.isInteger(i.height) || i.width < 2 || i.height < 2 || i.width > 4096 || i.height > 4096 || i.width * i.height > 4_194_304 || i.fx <= 0 || i.fy <= 0) return fail();
    pixels += i.width * i.height;
    for (const [vector, length] of [[e.position, 3], [e.quaternion, 4]] as const) {
      if (!Array.isArray(vector) || vector.length !== length || !vector.every(Number.isFinite)) return fail();
    }
    if (Math.abs(Math.hypot(...e.quaternion) - 1) > 0.001) return fail();
  }
  if (pixels > 16_777_216) return fail();
  if ('splats' in value && !filename(value.splats)) return fail();
  if ('points' in value && !filename(value.points)) return fail();
  const slots = new Set<string>();
  /** A box with a side to every way, and (if it has one) a slot whose id is new and whose point is in the box. */
  const boxed = (entry: any): boolean => {
    if (!entry) return false;
    for (const vector of [entry.min, entry.max]) if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) return false;
    // also: a slot's clear volume has no side of nothing or less
    if (entry.min.some((number: number, axis: number) => number >= entry.max[axis])) return false;
    if (!('slot' in entry)) return true;
    const slot = entry.slot;
    if (!slot || !isId(slot.id) || slots.has(slot.id) || !among(SURFACES, slot.surface) || typeof slot.anchor !== 'boolean'
      || !alongAxis(slot.normal) || !alongAxis(slot.facing) || slot.facing[1] !== 0
      || !Array.isArray(slot.point) || slot.point.length !== 3 || !slot.point.every((number: unknown, axis: number) => typeof number === 'number' && number >= entry.min[axis] && number <= entry.max[axis])
      || !(slot.holds === null || stands(slot.holds, slot.id))) return false;
    slots.add(slot.id);
    return true;
  };
  if ('heroes' in value) {
    if (!Array.isArray(value.heroes) || value.heroes.length > 16) return fail();
    for (const hero of value.heroes) {
      if (!hero || typeof hero.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 '_-]{0,63}$/.test(hero.name) || !boxed(hero)) return fail();
    }
  }
  // Places for the copies of a repeated thing: each a clear volume with a slot that holds nothing, and the pose a thing takes there.
  if ('places' in value) {
    if (!Array.isArray(value.places) || value.places.length > 16) return fail();
    for (const place of value.places) {
      if (!boxed(place) || !place.slot || place.slot.holds !== null || place.slot.anchor !== false || !('pose' in place ? among(POSES, place.pose) : true)) return fail();
    }
  }
  if ('room' in value) {
    const room = value.room as Record<string, unknown> | null;
    if (!room || !among(MOODS, room.mood) || !among(KINDS, room.kind) || !Number.isInteger(room.era) || (room.era as number) < 1800 || (room.era as number) > 2100
      || ![room.deviation, room.ambiguity].every(number => typeof number === 'number' && number >= 0 && number <= 100)) return fail();
  }
  if ('water' in value) {
    const water = value.water as RoomWater;
    if (!water || !Array.isArray(water.center) || water.center.length !== 3 || !water.center.every(Number.isFinite)
      || !Array.isArray(water.radius) || water.radius.length !== 2 || !water.radius.every(r => Number.isFinite(r) && r > 0 && r <= 100)
      || !Number.isFinite(water.depth) || water.depth <= 0 || water.depth > 20) return fail();
  }
  return value as PosedManifest;
}

export function unprojectPixel(camera: PosedCamera, u: number, v: number, depth: number, target = new Vector3()): Vector3 {
  const { fx, fy, cx, cy } = camera.intrinsics;
  const { position, quaternion } = camera.extrinsics;
  return target.set((u - cx) / fx * depth, -(v - cy) / fy * depth, -depth)
    .applyQuaternion(new Quaternion(...quaternion)).add(new Vector3(...position));
}

function depthAt(frame: DepthFrame, x: number, y: number): number {
  const { width, height } = frame.camera.intrinsics;
  if (x < 0 || y < 0 || x >= width || y >= height) return NaN;
  const index = y * width + x, depth = frame.depth[index];
  return Number.isFinite(depth) && depth > 0 && frame.confidence[index * 4] >= MIN_CONFIDENCE ? depth : NaN;
}

/** Reject intermediate depths at an occlusion boundary, but retain either side of a clean step. */
export function isFlyingPixel(frame: DepthFrame, x: number, y: number): boolean {
  const depth = depthAt(frame, x, y), tolerance = surfaceTolerance(depth);
  for (const radius of [1, 2]) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const a = depthAt(frame, x - dx * radius, y - dy * radius) - depth;
    const b = depthAt(frame, x + dx * radius, y + dy * radius) - depth;
    if (a * b < 0 && Math.abs(a) > tolerance && Math.abs(b) > tolerance) {
      const near = depthAt(frame, x - dx * radius * 2, y - dy * radius * 2);
      const far = depthAt(frame, x + dx * radius * 2, y + dy * radius * 2);
      const span = Math.abs(1 / (depth + a) - 1 / (depth + b));
      const continuation = Math.abs(1 / near - 1 / (depth + a)) + Math.abs(1 / far - 1 / (depth + b));
      // A perspective plane is linear in inverse depth: do not mistake a grazing floor for an edge.
      if (Number.isFinite(continuation) && continuation < span * 0.5) return true;
    }
  }
  return false;
}

export function depthNormal(frame: DepthFrame, x: number, y: number, target = new Vector3()): Vector3 | null {
  const d = depthAt(frame, x, y);
  if (!Number.isFinite(d)) return null;
  const { fx, fy, cx, cy } = frame.camera.intrinsics;
  const center = new Vector3((x - cx) / fx * d, -(y - cy) / fy * d, -d);
  const tangent = (dx: number, dy: number) => {
    const a = depthAt(frame, x - dx, y - dy), b = depthAt(frame, x + dx, y + dy);
    const da = Number.isFinite(a) ? Math.abs(a - d) : Infinity, db = Number.isFinite(b) ? Math.abs(b - d) : Infinity;
    const sign = da < db ? -1 : 1, z = sign === -1 ? a : b;
    if (!Number.isFinite(z)) return null;
    if (Math.min(da, db) > surfaceTolerance(d)) {
      const outer = depthAt(frame, x + 2 * sign * dx, y + 2 * sign * dy);
      if (!Number.isFinite(outer) || Math.abs(1 / d - 2 / z + 1 / outer) > 0.15 * Math.abs(1 / d - 1 / z)) return null;
    }
    return new Vector3((x + sign * dx - cx) / fx * z, -(y + sign * dy - cy) / fy * z, -z).sub(center).multiplyScalar(sign);
  };
  const horizontal = tangent(1, 0), vertical = tangent(0, 1);
  if (!horizontal || !vertical) return null;
  target.crossVectors(vertical, horizontal);
  if (!Number.isFinite(target.lengthSq()) || target.lengthSq() < 1e-16) return null;
  target.normalize();
  if (target.dot(center) > 0) target.negate();
  // Almost edge-on normals are unstable and do not describe a reliable visible surface.
  if (-target.dot(center) / center.length() < 0.015) return null;
  return target.applyQuaternion(new Quaternion(...frame.camera.extrinsics.quaternion));
}

export function coveredByEarlierFrame(point: Vector3, frame: DepthFrame): boolean {
  const { position, quaternion } = frame.camera.extrinsics;
  const local = point.clone().sub(new Vector3(...position)).applyQuaternion(new Quaternion(...quaternion).conjugate());
  const d = -local.z;
  if (d <= 0) return false;
  const { fx, fy, cx, cy, width, height } = frame.camera.intrinsics;
  const x = Math.round(local.x / d * fx + cx), y = Math.round(-local.y / d * fy + cy);
  if (x < 0 || y < 0 || x >= width || y >= height || (frame.kept && !frame.kept[y * width + x])) return false;
  const previous = depthAt(frame, x, y);
  return Number.isFinite(previous) && Math.abs(d - previous) <= 0.03 + 0.01 * previous;
}

export function insideWater(point: Vector3, water?: RoomWater): boolean {
  // The fused reflective surface sits up to 12 cm above the recorded floor; clear that reconstruction bias.
  return !!water && point.y <= water.center[1] + 0.15
    && ((point.x - water.center[0]) / water.radius[0]) ** 2 + ((point.z - water.center[2]) / water.radius[1]) ** 2 <= 1;
}

export async function yieldToFrame(signal: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

export async function ceilingPanels(positions: Float32Array, normals: Float32Array, colors: Float32Array, signal: AbortSignal): Promise<[number, number, number][]> {
  let deadline = performance.now() + 5;
  const heights: number[] = [];
  for (let i = 1; i < positions.length; i += 3 * 512) heights.push(positions[i]);
  heights.sort((a, b) => a - b);
  const top = heights[Math.floor(heights.length * 0.95)];
  const cells = new Map<string, { cell: number[]; sum: Vector3; count: number }>();
  for (let i = 0; i < positions.length; i += 3) {
    if (i % 12288 === 0 && performance.now() >= deadline) { await yieldToFrame(signal); deadline = performance.now() + 5; }
    const r = colors[i], g = colors[i + 1], b = colors[i + 2];
    if (positions[i + 1] < top - 0.4 || normals[i + 1] > -0.55 || r < 0.85 || g < 0.8 || b < 0.55 || Math.min(r, g, b) / Math.max(r, g, b) < 0.6) continue;
    const cell = [positions[i], positions[i + 1], positions[i + 2]].map(v => Math.floor(v / 0.3));
    const key = cell.join(','), entry = cells.get(key) ?? { cell, sum: new Vector3(), count: 0 };
    entry.sum.add(new Vector3().fromArray(positions, i)); entry.count++; cells.set(key, entry);
  }
  const panels: [number, number, number][] = [];
  while (cells.size) {
    const first = cells.keys().next().value!;
    const queue = [cells.get(first)!]; cells.delete(first);
    const sum = new Vector3(); let count = 0;
    for (let i = 0; i < queue.length; i++) {
      if (i % 128 === 0 && performance.now() >= deadline) { await yieldToFrame(signal); deadline = performance.now() + 5; }
      const entry = queue[i]; sum.add(entry.sum); count += entry.count;
      const [x, y, z] = entry.cell;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const key = [x + dx, y + dy, z + dz].join(','), next = cells.get(key);
        if (next) { queue.push(next); cells.delete(key); }
      }
    }
    if (count >= 12) panels.push(sum.divideScalar(count).toArray());
  }
  return panels;
}

async function fetchAsset(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal, redirect: 'error', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Posed-frame asset failed (HTTP ${response.status}).`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 64 * 1024 * 1024) throw new Error('Posed-frame asset is too large.');
  signal.throwIfAborted();
  return buffer;
}

async function imagePixels(url: string, camera: PosedCamera, signal: AbortSignal): Promise<Uint8ClampedArray> {
  const bitmap = await createImageBitmap(new Blob([await fetchAsset(url, signal)]));
  try {
    signal.throwIfAborted();
    const { width, height } = camera.intrinsics;
    if (bitmap.width !== width || bitmap.height !== height) throw new Error('Posed-frame image and camera grids differ.');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Cannot decode posed-frame image.');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, width, height).data;
  } finally { bitmap.close(); }
}

export async function loadPosedFrames(base: string, input: unknown, signal: AbortSignal): Promise<PointCloud> {
  signal.throwIfAborted();
  const started = performance.now(), manifest = validatePosedManifest(input);
  const earlier: DepthFrame[] = [];
  const heroes = manifest.heroes?.map(hero => ({ ...hero, count: 0 }));
  const chunks: { positions: Float32Array; normals: Float32Array; colors: Float32Array; distances: Float32Array }[] = [];
  const stats = { pixels: 0, invalidDepth: 0, confidence: 0, flying: 0, normals: 0, covered: 0, water: 0, kept: 0 };
  const histogram = new Uint32Array(256);
  const pause = async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); signal.throwIfAborted(); };
  for (const frame of manifest.frames) {
    const { width, height } = frame.camera.intrinsics, size = width * height;
    const [buffer, rgb, confidence] = await Promise.all([
      fetchAsset(base + frame.depth, signal), imagePixels(base + frame.image, frame.camera, signal), imagePixels(base + frame.confidence, frame.camera, signal),
    ]);
    const decoded = new EXRLoader().setDataType(FloatType).setOutputFormat(RedFormat).parse(buffer);
    if (decoded.width !== width || decoded.height !== height || !(decoded.data instanceof Float32Array) || decoded.data.length !== size) throw new Error('Posed-frame depth and camera grids differ.');
    // EXRLoader's CPU output is bottom-up; RGB, confidence and intrinsics are top-down.
    const depth = new Float32Array(size);
    for (let y = 0; y < height; y++) depth.set(decoded.data.subarray((height - 1 - y) * width, (height - y) * width), y * width);
    const kept = new Uint8Array(size), current: DepthFrame = { camera: frame.camera, depth, confidence, kept };
    const positions = new Float32Array(size * 3), normals = new Float32Array(size * 3), colors = new Float32Array(size * 3), distances = new Float32Array(size);
    const p = new Vector3(), n = new Vector3(), left = new Vector3();
    let count = 0, distanceCount = 0;
    for (let y = 0; y < height; y++) {
      if (y % 32 === 0) await pause();
      for (let x = 0; x < width; x++) {
        const index = y * width + x, d = depth[index]; stats.pixels++; histogram[confidence[index * 4]]++;
        if (!Number.isFinite(d) || d <= 0) { stats.invalidDepth++; continue; }
        if (confidence[index * 4] < MIN_CONFIDENCE) { stats.confidence++; continue; }
        if (isFlyingPixel(current, x, y)) { stats.flying++; continue; }
        if (!depthNormal(current, x, y, n)) { stats.normals++; continue; }
        unprojectPixel(frame.camera, x, y, d, p);
        if (insideWater(p, manifest.water)) { stats.water++; continue; }
        if (earlier.some(previous => coveredByEarlierFrame(p, previous))) { stats.covered++; continue; }
        kept[index] = 1;
        p.toArray(positions, count * 3); n.toArray(normals, count * 3);
        for (const hero of heroes ?? []) {
          const i = count * 3;
          if (positions[i] >= hero.min[0] && positions[i] <= hero.max[0] && positions[i + 1] >= hero.min[1] && positions[i + 1] <= hero.max[1] && positions[i + 2] >= hero.min[2] && positions[i + 2] <= hero.max[2]) hero.count++;
        }
        for (let c = 0; c < 3; c++) colors[count * 3 + c] = rgb[index * 4 + c] / 255;
        if (x > 0 && kept[index - 1]) {
          unprojectPixel(frame.camera, x - 1, y, depth[index - 1], left);
          distances[distanceCount++] = p.distanceTo(left);
        }
        count++;
      }
    }
    stats.kept += count;
    chunks.push({ positions: positions.slice(0, count * 3), normals: normals.slice(0, count * 3), colors: colors.slice(0, count * 3), distances: distances.slice(0, distanceCount) });
    earlier.push(current);
  }
  if (!stats.kept) throw new Error('Posed frames contain no reliable points.');
  await pause();
  const positions = new Float32Array(stats.kept * 3), normals = new Float32Array(stats.kept * 3), colors = new Float32Array(stats.kept * 3);
  const distances = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.distances.length, 0));
  let offset = 0, distanceOffset = 0;
  for (const chunk of chunks) {
    positions.set(chunk.positions, offset); normals.set(chunk.normals, offset); colors.set(chunk.colors, offset); offset += chunk.positions.length;
    distances.set(chunk.distances, distanceOffset); distanceOffset += chunk.distances.length;
  }
  if (!distances.length) throw new Error('Posed frames have no reliable neighbouring points.');
  distances.sort();
  const middle = Math.floor(distances.length / 2), spacing = distances.length % 2 ? distances[middle] : (distances[middle - 1] + distances[middle]) / 2;
  const camera = manifest.frames[0].camera, position = new Vector3(...camera.extrinsics.position);
  const lookAt = new Vector3(0, 0, -6).applyQuaternion(new Quaternion(...camera.extrinsics.quaternion)).add(position);
  const lights = { ceiling: await ceilingPanels(positions, normals, colors, signal), lamps: [] };
  signal.throwIfAborted();
  console.info('Recorded posed frames:', JSON.stringify({ ...stats, frames: manifest.frames.length, spacing, seconds: (performance.now() - started) / 1000, lights, heroCounts: heroes?.map(({ name, count }) => ({ name, count })), confidenceHistogram: Array.from(histogram.entries()).filter(([, count]) => count) }));
  return { count: stats.kept, positions, normals, colors, spacing, ordered: true, lit: true, water: manifest.water, lights, heroes, splats: manifest.splats ? base + manifest.splats : undefined, arrival: { position: position.toArray(), lookAt: lookAt.toArray() } };
}
