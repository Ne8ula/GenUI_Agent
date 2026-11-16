import { ceilingPanels, unprojectPixel, validatePosedManifest, yieldToFrame, type PosedManifest } from './posed-frames.ts';
import type { PointCloud } from './types.ts';

// EVAP v1: 32-byte little-endian header, xyz float32[], RGB uint8[], normal xyz int8[].
const MAGIC = 0x50415645, VERSION = 1, HEADER = 32, STRIDE = 18, FLAGS = 3;
export const MAX_BAKED_BYTES = HEADER + 4_000_000 * STRIDE;
function header(buffer: ArrayBuffer) {
  if (buffer.byteLength < HEADER) throw new Error('Invalid baked point header.');
  const view = new DataView(buffer), count = view.getUint32(8, true), spacing = view.getFloat32(16, true);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION || count < 1 || count > 4_000_000
    || view.getUint32(12, true) !== FLAGS || !Number.isFinite(spacing) || spacing <= 0 || spacing > 1
    || view.getUint32(20, true) !== HEADER || view.getUint32(24, true) !== count * STRIDE || view.getUint32(28, true) !== 0) throw new Error('Invalid baked point header.');
  return { count, spacing, bytes: HEADER + count * STRIDE };
}

export async function encodeBakedPoints(cloud: PointCloud, signal: AbortSignal): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  if (!Number.isInteger(cloud.count) || cloud.count < 1 || cloud.count > 4_000_000 || !cloud.ordered || !cloud.lit
    || !Number.isFinite(cloud.spacing) || cloud.spacing! <= 0 || cloud.spacing! > 1
    || [cloud.positions, cloud.colors, cloud.normals].some(a => !a || a.length !== cloud.count * 3)) throw new Error('Invalid cloud to bake.');
  const buffer = new ArrayBuffer(HEADER + cloud.count * STRIDE), view = new DataView(buffer);
  [MAGIC, VERSION, cloud.count, FLAGS].forEach((n, i) => view.setUint32(i * 4, n, true));
  view.setFloat32(16, cloud.spacing!, true); view.setUint32(20, HEADER, true); view.setUint32(24, cloud.count * STRIDE, true);
  const colorOffset = HEADER + cloud.count * 12, normalOffset = colorOffset + cloud.count * 3;
  let deadline = performance.now() + 5;
  for (let i = 0; i < cloud.count * 3; i++) {
    if (i % 12288 === 0 && performance.now() >= deadline) { await yieldToFrame(signal); deadline = performance.now() + 5; }
    view.setFloat32(HEADER + i * 4, cloud.positions[i], true);
    view.setUint8(colorOffset + i, Math.round(Math.min(1, Math.max(0, cloud.colors[i])) * 255));
    view.setInt8(normalOffset + i, Math.round(Math.min(1, Math.max(-1, cloud.normals![i])) * 127));
  }
  signal.throwIfAborted(); return buffer;
}

export async function decodeBakedPoints(buffer: ArrayBuffer, manifest: PosedManifest, signal: AbortSignal): Promise<PointCloud> {
  signal.throwIfAborted();
  const { count, spacing, bytes } = header(buffer);
  if (buffer.byteLength !== bytes) throw new Error('Baked point payload length does not match its header.');
  const view = new DataView(buffer), positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const colorOffset = HEADER + count * 12, normalOffset = colorOffset + count * 3;
  const heroes = manifest.heroes?.map(hero => ({ ...hero, count: 0 }));
  let deadline = performance.now() + 5;
  for (let i = 0; i < count * 3; i += 3) {
    if (i % 12288 === 0 && performance.now() >= deadline) { await yieldToFrame(signal); deadline = performance.now() + 5; }
    let length = 0;
    for (let axis = 0; axis < 3; axis++) {
      const p = view.getFloat32(HEADER + (i + axis) * 4, true), n = view.getInt8(normalOffset + i + axis) / 127;
      if (!Number.isFinite(p) || Math.abs(p) > 10000 || n < -1) throw new Error('Invalid baked point coordinates or normal.');
      positions[i + axis] = p; colors[i + axis] = view.getUint8(colorOffset + i + axis) / 255; normals[i + axis] = n; length += n * n;
    }
    if (length < .97 || length > 1.03) throw new Error('Invalid baked point normal.');
    length = Math.sqrt(length); for (let axis = 0; axis < 3; axis++) normals[i + axis] /= length;
    for (const hero of heroes ?? []) if (positions[i] >= hero.min[0] && positions[i] <= hero.max[0] && positions[i + 1] >= hero.min[1] && positions[i + 1] <= hero.max[1] && positions[i + 2] >= hero.min[2] && positions[i + 2] <= hero.max[2]) hero.count++;
  }
  const camera = manifest.frames[0].camera;
  const lights = { ceiling: await ceilingPanels(positions, normals, colors, signal), lamps: [] };
  signal.throwIfAborted();
  return { count, positions, colors, normals, spacing, ordered: true, lit: true, lights, heroes, water: manifest.water,
    arrival: { position: [...camera.extrinsics.position], lookAt: unprojectPixel(camera, camera.intrinsics.cx, camera.intrinsics.cy, 6).toArray() } };
}

export async function loadBakedPoints(base: string, input: unknown, signal: AbortSignal): Promise<PointCloud> {
  const manifest = validatePosedManifest(input);
  if (!manifest.points) throw new Error('No baked point file.');
  signal.throwIfAborted(); const started = performance.now();
  const response = await fetch(base + manifest.points, { signal, redirect: 'error', credentials: 'same-origin' });
  if (!response.ok || !response.body) throw new Error(`Baked points could not load (HTTP ${response.status}).`);
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_BAKED_BYTES) { await response.body.cancel(); throw new Error('Baked point file is too large.'); }
  const reader = response.body.getReader(), prefix = new Uint8Array(HEADER);
  let data: Uint8Array | undefined, total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      signal.throwIfAborted();
      const oldTotal = total; total += value.length;
      if (total > MAX_BAKED_BYTES) throw new Error('Baked point file is too large.');
      if (!data) {
        const take = Math.min(HEADER - oldTotal, value.length); prefix.set(value.subarray(0, take), oldTotal);
        if (total < HEADER) continue;
        const { bytes } = header(prefix.buffer);
        if (declared && declared !== bytes) throw new Error('Baked point transfer length does not match its header.');
        data = new Uint8Array(bytes); data.set(prefix);
        if (total > bytes) throw new Error('Baked point payload exceeds its header.');
        data.set(value.subarray(take), HEADER);
      } else {
        if (total > data.length) throw new Error('Baked point payload exceeds its header.');
        data.set(value, oldTotal);
      }
    }
    if (!data || total !== data.length) throw new Error('Truncated baked point file.');
    const cloud = await decodeBakedPoints(data.buffer as ArrayBuffer, manifest, signal);
    cloud.splats = manifest.splats ? base + manifest.splats : undefined;
    console.info('Recorded baked points:', JSON.stringify({ count: cloud.count, spacing: cloud.spacing, seconds: (performance.now() - started) / 1000 }));
    return cloud;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
