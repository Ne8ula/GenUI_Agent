import { Box3, Group, Mesh, Texture, Vector3, type Material } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sampleSurfacePointCloud } from './surface-sampler.ts';
import type { PointCloud, RoomHero } from './types.ts';

// Replacing one hero of a room with another object: the shelf of recorded models, a model as points fitted into a hero's box,
// and the room with that hero's points exchanged. The menu and the change animation live elsewhere and call these three.

const SHELF = '/fixtures/objects/';
const MAX_GLB_BYTES = 8 * 1024 * 1024;
/** Linear density of an object against the sampler's own lattice: 2 is half the spacing, four times the points. Tuned from captures. */
const OBJECT_DENSITY = 2;
/** An object never takes more points than this; past it the sampler coarsens the object's whole lattice. */
const OBJECT_MAX_POINTS = 250_000;
/** The object stays this far inside the box, so every one of its points tests as inside (the hero's points are those in its box). */
const INSET = 0.001;

type Box = { min: [number, number, number]; max: [number, number, number] };
const inside = (p: ArrayLike<number>, i: number, box: Box) =>
  p[i] >= box.min[0] && p[i] <= box.max[0] && p[i + 1] >= box.min[1] && p[i + 1] <= box.max[1] && p[i + 2] >= box.min[2] && p[i + 2] <= box.max[2];

/** The recorded shelf: models generated once and saved, never live generation. `glb` comes back as a URL for loadObjectPoints. */
export async function loadShelf(signal: AbortSignal): Promise<{ id: string; name: string; glb: string }[]> {
  const response = await fetch(`${SHELF}manifest.json`, { signal, redirect: 'error', credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`The object shelf could not be loaded (HTTP ${response.status}).`);
  const body = await response.text();
  if (body.length > 16 * 1024) throw new Error('The object shelf manifest is too large.');
  const objects: unknown = (JSON.parse(body) as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(objects) || !objects.length || objects.length > 24) throw new Error('Invalid object shelf manifest.');
  const ids = new Set<string>();
  const shelf = objects.map((entry: unknown) => {
    const { id, name, glb } = (entry ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id) || ids.has(id)
      || typeof name !== 'string' || !name.trim() || name.length > 60 || /[\p{Cc}\p{Cf}]/u.test(name)
      || typeof glb !== 'string' || !/^[a-z0-9-]{1,40}\.glb$/.test(glb)) throw new Error('Invalid object shelf manifest.');
    ids.add(id);
    return { id, name, glb: SHELF + glb };
  });
  console.info(`Object shelf: ${shelf.length} recorded models (each generated once: an OpenAI picture, then a Meshy model). A recording, not live generation.`);
  return shelf;
}

/** A model as points in room coordinates: scaled evenly to the largest size that fits the box, centred in it, standing on its floor.
 * Unlit base colour, with normals. `density` is linear against the sampler's lattice (the factor the owner tunes). */
export async function loadObjectPoints(glbUrl: string, box: Box, signal: AbortSignal, density = OBJECT_DENSITY): Promise<PointCloud> {
  signal.throwIfAborted();
  const size = box.max.map((value, axis) => value - box.min[axis] - 2 * INSET);
  if (![...box.min, ...box.max].every(Number.isFinite) || size.some(value => !(value > 0))) throw new Error('Invalid box for an object.');
  const response = await fetch(glbUrl, { signal, redirect: 'error', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`The object model could not be loaded (HTTP ${response.status}).`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_GLB_BYTES) throw new Error('The object model is too large.');
  const { scene } = await new GLTFLoader().parseAsync(bytes, '');
  try {
    signal.throwIfAborted();
    const bounds = new Box3().setFromObject(scene), extent = bounds.getSize(new Vector3()), centre = bounds.getCenter(new Vector3());
    if (bounds.isEmpty() || ![extent.x, extent.y, extent.z].every(value => value > 0 && Number.isFinite(value))) throw new Error('The object model has no volume.');
    const scale = Math.min(size[0] / extent.x, size[1] / extent.y, size[2] / extent.z);
    const holder = new Group().add(scene);
    holder.scale.setScalar(scale);
    holder.position.set((box.min[0] + box.max[0]) / 2 - centre.x * scale, box.min[1] + INSET - bounds.min.y * scale, (box.min[2] + box.max[2]) / 2 - centre.z * scale);
    // Sampled inside its own bounds, a little loose: the sampler drops faces that lie flat on its boundary, such as the underside.
    const fitted = new Box3().setFromObject(holder).expandByScalar(INSET / 2);
    return await sampleSurfacePointCloud(holder, fitted, signal, { density, maxPoints: OBJECT_MAX_POINTS });
  } finally {
    const materials = new Set<Material>(), textures = new Set<Texture>();
    scene.traverse(object => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of [object.material].flat()) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      }
    });
    materials.forEach(material => material.dispose());
    for (const texture of textures) { texture.dispose(); if (typeof texture.image?.close === 'function') texture.image.close(); }
  }
}

/** The room without the points inside that hero's box, then the object's points; that hero's count is the object's points in the box.
 * Everything else is carried over, including the water and the painted (splat) room, which still shows the old object. */
export function replaceHero(room: PointCloud, hero: number, object: PointCloud): PointCloud {
  const box: RoomHero | undefined = room.heroes?.[hero];
  if (!room.heroes || !box) throw new RangeError('The room has no such hero.');
  if (room.normals && !object.normals) throw new Error('The object needs normals to join this room.');
  let kept = 0;
  for (let i = 0; i < room.count; i++) if (!inside(room.positions, i * 3, box)) kept++;
  const count = kept + object.count;
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), normals = room.normals && new Float32Array(count * 3);
  let at = 0;
  for (let i = 0; i < room.count * 3; i += 3) {
    if (inside(room.positions, i, box)) continue;
    for (let axis = 0; axis < 3; axis++) {
      positions[at + axis] = room.positions[i + axis]; colors[at + axis] = room.colors[i + axis];
      if (normals) normals[at + axis] = room.normals![i + axis];
    }
    at += 3;
  }
  positions.set(object.positions.subarray(0, object.count * 3), at);
  colors.set(object.colors.subarray(0, object.count * 3), at);
  normals?.set(object.normals!.subarray(0, object.count * 3), at);
  let own = 0;
  for (let i = 0; i < object.count; i++) if (inside(object.positions, i * 3, box)) own++;
  // shortcut: the other heroes' counts are carried over, which is right while hero boxes do not overlap (none do in the library); recount them if a room's boxes ever do.
  return { ...room, count, positions, colors, normals, heroes: room.heroes.map((entry, index) => index === hero ? { ...entry, count: own } : entry) };
}
