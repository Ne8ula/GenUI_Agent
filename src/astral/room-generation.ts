import {
  Box3, BoxGeometry, CylinderGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera,
  Vector3, type BufferGeometry, type WebGLRenderer,
} from 'three';
import { interpret } from '../room/room-interpret.ts';
import { createProceduralRoom } from '../room/procedural-room.ts';
import { CENTER_VIEWPOINT, setFixtureViewpoint } from '../room/spatial-fixture.ts';
import { sampleSurfacePointCloud } from './surface-sampler.ts';
import type { PointCloud, RoomLights } from './types.ts';

class RouteFailure extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

function addFittings(room: ReturnType<typeof createProceduralRoom>, releases: (() => void)[]): RoomLights {
  const { width, depth, height } = room.layout.description;
  const lights: RoomLights = { ceiling: [], lamps: [] };
  const pale = new MeshStandardMaterial({ color: 0xf4f1dc, emissive: 0xf4f1dc });
  const metal = new MeshStandardMaterial({ color: 0x55534c });
  releases.push(() => pale.dispose(), () => metal.dispose());
  const part = (name: string, geometry: BufferGeometry, position: [number, number, number], luminous: boolean) => {
    releases.push(() => geometry.dispose());
    const mesh = new Mesh(geometry, luminous ? pale : metal);
    mesh.name = name;
    mesh.userData.astralEmitter = luminous;
    mesh.position.set(...position);
    room.scene.add(mesh);
  };
  const columns = Math.max(1, Math.round(width / 2.4)), rows = Math.max(1, Math.round(depth / 2.4));
  for (let x = 0; x < columns; x++) for (let z = 0; z < rows; z++) {
    const position: [number, number, number] = [-width / 2 + (x + 0.5) * width / columns, height - 0.025, 3 - depth + (z + 0.5) * depth / rows];
    part('astral-ceiling-panel', new BoxGeometry(0.6, 0.05, 1.2), position, true);
    lights.ceiling.push(position);
  }
  // Procedural furnishings end at z=2. The front strip is clear; use the corner opposite the doorway aisle.
  const x = (room.layout.doorwayX < 0 ? 1 : -1) * (width / 2 - 0.45), z = 2.6;
  part('astral-lamp-base', new CylinderGeometry(0.18, 0.18, 0.06, 20), [x, 0.03, z], false);
  part('astral-lamp-pole', new CylinderGeometry(0.018, 0.018, 1.55, 12), [x, 0.835, z], false);
  part('astral-lamp-shade', new CylinderGeometry(0.16, 0.24, 0.3, 24), [x, 1.65, z], true);
  lights.lamps.push([x, 1.65, z]);
  return lights;
}

/** One paid interpretation; abort stops locally, not an already submitted remote task. No paint request. */
export async function generateRoomCloud(description: string, _renderer: WebGLRenderer, signal: AbortSignal): Promise<PointCloud> {
  let stage = 'interpretation';
  const releases: (() => void)[] = [];
  try {
    signal.throwIfAborted();
    if (typeof description !== 'string' || !description.trim() || description.trim().length > 2000) {
      throw new RouteFailure('invalid_input');
    }
    const interpreted = await interpret(globalThis.fetch, description.trim(), signal);
    signal.throwIfAborted();
    if (interpreted.outcome === 'unsupported') throw new RouteFailure('unsupported_capability');

    stage = 'build';
    const room = createProceduralRoom(interpreted.description, crypto.getRandomValues(new Uint32Array(1))[0]);
    releases.push(() => { try { room.dispose(); } finally { room.scene.clear(); } });
    signal.throwIfAborted();
    const lights = addFittings(room, releases);

    stage = 'points';
    const { width, height, depth } = room.layout.description;
    const bounds = new Box3(new Vector3(-width / 2, 0, 3 - depth), new Vector3(width / 2, height, 3));
    const cloud = await sampleSurfacePointCloud(room.scene, bounds, signal);
    signal.throwIfAborted();
    if (!cloud.count) throw new RouteFailure('empty_cloud');
    // Same pose as paintCamera(), without importing the now-unused painting implementation.
    const primary = new PerspectiveCamera();
    setFixtureViewpoint(primary, CENTER_VIEWPOINT);
    cloud.arrival = {
      position: primary.position.toArray(),
      lookAt: primary.getWorldDirection(new Vector3()).add(primary.position).toArray(),
    };
    cloud.lights = lights;
    return cloud;
  } catch (error) {
    const code = signal.aborted ? 'aborted'
      : error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : `${stage}_failed`;
    throw new Error(`Room generation ${stage}: ${code}`, { cause: error });
  } finally {
    let failed = false;
    for (const release of releases.reverse()) {
      try { release(); } catch { failed = true; }
    }
    if (failed) throw new Error('Room generation cleanup: cleanup_failed');
  }
}
