import { Box3, Group, Mesh, Texture, Vector3, type Material, type Object3D, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CONSTRUCTION_FIXTURE_BASE, validateConstructionManifest } from '../room/construction-fixture.ts';
import { sampleSurfacePointCloud } from './surface-sampler.ts';
import { baseRoom, loadPosedFrames, validatePosedManifest } from './posed-frames.ts';
import { MOODS, type Mood } from './grammar.ts';
import { MOOD_CASTS } from './mood-choice.ts';
import type { PointCloud, RoomLights } from './types.ts';

/**
 * The recorded room of `mood`: that mood's base room (LIMINAL-GRAMMAR.md step 7). With no mood, the library, a development fixture.
 * ?room=<mood>, ?room=library and ?room=surreal are development switches that load that room whatever the mood.
 */
export async function loadRecordedRoomCloud(_renderer: WebGLRenderer, signal: AbortSignal, mood: Mood | null = null): Promise<PointCloud> {
  signal.throwIfAborted();
  const room = new URLSearchParams(globalThis.location?.search ?? '').get('room');
  if (room !== 'surreal') {
    const base = `/fixtures/${(MOODS as readonly unknown[]).includes(room) ? room : room === 'library' ? room : mood ?? 'library'}/`;
    const response = await fetch(`${base}manifest.json`, { signal, redirect: 'error', credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`The fixture manifest could not be loaded (HTTP ${response.status}).`);
    const body = await response.text();
    if (body.length > 64 * 1024) throw new Error('The fixture manifest is too large.');
    const manifest = validatePosedManifest(JSON.parse(body));
    const load = async () => {
      // Re-bake points.bin whenever room.spz or manifest.water changes; stale bakes cannot follow a new reconstruction.
      if (manifest.points) {
        try {
          const { loadBakedPoints } = await import('./baked-points.ts');
          return await loadBakedPoints(base, manifest, signal);
        } catch (error) {
          signal.throwIfAborted();
          console.warn('Recorded point bake rejected; recomputing from source.', error);
        }
      }
      if (manifest.splats) {
        const { loadSplatPoints } = await import('./splat-points.ts');
        return loadSplatPoints(base, manifest, signal);
      }
      return loadPosedFrames(base, manifest, signal);
    };
    const cloud = await load();
    cloud.pictured = true;   // all three arrive at the picture's own camera (the manifest's first frame)
    cloud.places = manifest.places;
    cloud.base = baseRoom(manifest) ?? undefined;
    // its default lighting is its mood's cast (step 10), where the room declares that it was recorded in one
    if (manifest.room?.cast) cloud.cast = MOOD_CASTS[manifest.room.mood];
    return cloud;
  }
  const started = performance.now();
  const base = CONSTRUCTION_FIXTURE_BASE;
  const response = await fetch(`${base}manifest.json`, { signal, redirect: 'error', credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`The fixture manifest could not be loaded (HTTP ${response.status}).`);
  const body = await response.text();
  if (body.length > 64 * 1024) throw new Error('The fixture manifest is too large.');
  const manifest = validateConstructionManifest(JSON.parse(body));
  signal.throwIfAborted();
  const loader = new GLTFLoader(), owned: Object3D[] = [];
  try {
    // Native GLBs already use recorded world coordinates: no replay alignment or Atlas materials to undo.
    // Wait for every load to settle so a late completion cannot leak after failure/abort.
    const loaded = await Promise.allSettled([manifest.shell, ...manifest.heroes.map(hero => hero.glb)].map(async path => {
      const { scene } = await loader.loadAsync(base + path);
      owned.push(scene);
      return scene;
    }));
    signal.throwIfAborted();
    const models = loaded.map(result => { if (result.status === 'rejected') throw result.reason; return result.value; });
    const root = new Group();
    root.add(...models);
    root.updateMatrixWorld(true);
    const lights: RoomLights = { ceiling: [], lamps: [] };
    models[0].traverse(object => {
      if (object.userData.role !== 'light' && !/^light(?:_\d+)?$/.test(object.name)) return;
      lights.ceiling.push(new Box3().setFromObject(object).getCenter(new Vector3()).toArray());
      object.traverse(child => { if (child instanceof Mesh) child.userData.astralEmitter = true; });
    });
    manifest.heroes.forEach((hero, i) => {
      if (hero.id !== 'lamp') return;
      const box = new Box3().setFromObject(models[i + 1]);
      const bulb = box.getCenter(new Vector3());
      // shortcut: bulb at the centre of the upper 30% of the scanned lamp, replace if a bulb landmark is supplied.
      bulb.y = box.min.y + (box.max.y - box.min.y) * 0.85;
      lights.lamps.push(bulb.toArray());
    });
    const { width, height, depth } = manifest.room;
    const bounds = new Box3(new Vector3(-width / 2, 0, 3 - depth), new Vector3(width / 2, height, 3));
    const cloud = await sampleSurfacePointCloud(root, bounds, signal);
    cloud.lights = lights;
    cloud.arrival = { position: [...manifest.camera.position], lookAt: [...manifest.camera.lookAt] };
    console.info(`Recorded room surfaces: ${((performance.now() - started) / 1000).toFixed(2)}s, ${cloud.count} points, ${cloud.spacing!.toFixed(6)}m spacing`);
    return cloud;
  } finally {
    const geometries = new Set<Mesh['geometry']>(), materials = new Set<Material>();
    const textures = new Set<Texture>();
    owned.forEach(root => root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      for (const material of [object.material].flat()) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
      }
    }));
    geometries.forEach(item => item.dispose());
    materials.forEach(item => item.dispose());
    const images = new Set([...textures].map(texture => texture.image));
    textures.forEach(item => item.dispose());
    for (const image of images) if (typeof image?.close === 'function') image.close();
  }
}
