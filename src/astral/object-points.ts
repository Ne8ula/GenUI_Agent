import { Box3, Group, Mesh, Quaternion, Texture, Vector3, type Material } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { sampleSurfacePointCloud } from './surface-sampler.ts';
import { KINDS, SURFACES, type Pose, type Thing } from './grammar.ts';
import { HOVER_GAP, LEAN_TILT, SUNK_SHARE, arrivalOf } from './grammar-decide.ts';
import type { Move, Stood } from './sand-look.ts';
import type { PointCloud, RoomHero, RoomPlace, RoomSlot } from './types.ts';

// Replacing one hero of a room with another object: the shelf of recorded models, a model as points standing in a hero's slot
// at its true height in one of the grammar's poses (or fitted into a box), and the room with that hero's points exchanged. The menu
// and the change animation live elsewhere and call these.

/** Where a pose could look two ways, the name of its other way (?swap=). None is chosen: delete the ways the owner does not keep. */
export const POSE_OTHER: Partial<Record<Pose, string>> = { sunk: 'tilted', leans: 'side', mounted: 'base', turned: 'corner' };
/** Sunk, the other way: tilted this many degrees, as the statue head lies, about the level diagonal between the slot's facing and its right. */
const SUNK_TILT = 20;
/** Turned: to the wall behind it, or the other way to a corner. Degrees from the slot's facing. */
const TURNED_WALL = 180, TURNED_CORNER = 135;
// Absence: the floor a thing leaves (floorOf). What counts as a slot's surface among the room's points:
const FLOOR_SKIN = 0.08;    // within this of the slot's plane, in metres (the library's floor lies up to 8 cm off its slots' planes),
// and of the surface's own colour: no channel, against its brightest, further than this from the piece's middle point's. Loose,
// and with no test of which way a point faces: the library's carpet is speckled and its normals are rough, and tighter tests
// left a third of the real carpet out, so the laid floor came out thinner than the floor round it.
const FLOOR_HUE = 0.5;
const FLOOR_CELL = 0.05;    // the squares its cover is counted in, in metres
// A placed thing is lit as the room is (litLikeRoom). Starting values, tuned from captures.
const LIT_UNDER = 0.35;     // the light a face turned straight down keeps, against one turned straight up
const LIT_CAST = 0.7;       // how far its colour goes toward the room's own cast

const SHELF = '/fixtures/objects/';
const MAX_GLB_BYTES = 8 * 1024 * 1024;
/** Linear density of an object against the sampler's own lattice: 2 is half the spacing, four times the points. Tuned from captures. */
const OBJECT_DENSITY = 2;
/** An object never takes more points than this; past it the sampler coarsens the object's whole lattice. */
const OBJECT_MAX_POINTS = 250_000;
/** Nor do all the copies of a repeated thing together take more than this, each an equal share. At one object's worth for all of
 * them, six stacks of televisions had about 40,000 points each and the near ones could be seen through. */
const COPIES_MAX_POINTS = 600_000;
/** The object stays this far inside the box, so every one of its points tests as inside (the hero's points are those in its box). */
const INSET = 0.001;

type Box = { min: [number, number, number]; max: [number, number, number] };
const inside = (p: ArrayLike<number>, i: number, box: Box) =>
  p[i] >= box.min[0] && p[i] <= box.max[0] && p[i + 1] >= box.min[1] && p[i + 1] <= box.max[1] && p[i + 2] >= box.min[2] && p[i + 2] <= box.max[2];

const listOf = (list: readonly string[], value: unknown, least: number) =>
  Array.isArray(value) && value.length >= least && new Set(value).size === value.length && value.every(entry => list.includes(entry));
const within = (value: unknown, least: number, most: number) => typeof value === 'number' && value >= least && value <= most;

/** The recorded shelf: models generated once and saved, never live generation. `glb` comes back as a URL for loadObjectPoints.
 * Each is also the grammar's Thing (grammar.ts): true height in metres, the model's width and depth against it, where it stands and belongs, its year. */
export async function loadShelf(signal: AbortSignal): Promise<(Thing & { name: string; glb: string })[]> {
  const response = await fetch(`${SHELF}manifest.json`, { signal, redirect: 'error', credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error(`The object shelf could not be loaded (HTTP ${response.status}).`);
  const body = await response.text();
  if (body.length > 16 * 1024) throw new Error('The object shelf manifest is too large.');
  const objects: unknown = (JSON.parse(body) as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(objects) || !objects.length || objects.length > 24) throw new Error('Invalid object shelf manifest.');
  const ids = new Set<string>();
  const shelf = objects.map((entry: unknown) => {
    const { id, name, glb, height, wide, deep, surfaces, kinds, era, repeatable } = (entry ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(id) || ids.has(id)
      || typeof name !== 'string' || !name.trim() || name.length > 60 || /[\p{Cc}\p{Cf}]/u.test(name)
      || typeof glb !== 'string' || !/^[a-z0-9-]{1,40}\.glb$/.test(glb)
      || !within(height, 0.01, 10) || !within(wide, 0.01, 100) || !within(deep, 0.01, 100)
      || !listOf(SURFACES, surfaces, 1) || !listOf(KINDS, kinds, 0) || !Number.isInteger(era) || !within(era, 1800, 2100)
      || typeof repeatable !== 'boolean') throw new Error('Invalid object shelf manifest.');
    ids.add(id);
    return { id, name, glb: SHELF + glb, height, wide, deep, surfaces, kinds, era, repeatable } as Thing & { name: string; glb: string };
  });
  console.info(`Object shelf: ${shelf.length} recorded models (each generated once: an OpenAI picture, then a Meshy model). A recording, not live generation.`);
  return shelf;
}

/** How a thing is put in a slot: turned by `turn` from upright and facing the slot's way, `lift` metres clear of the surface, `sunk` of it (a share) behind the surface. */
export interface Posture { turn: Quaternion; lift: number; sunk: number }

/**
 * A pose of the grammar (LIMINAL-GRAMMAR.md, the pose table) in a slot: how the thing stands in it, and how it stands when its
 * arrival's move starts (the same, where it only assembles). `other`: the pose's other way (POSE_OTHER). Nothing is simulated.
 * A thing leans back, away from the way its slot faces, or the other way to its side. A mounted thing is upright with its back to
 * the surface, as a resting one is on a wall, or the other way stands on the surface as on a floor.
 */
export function poseIn(pose: Pose, slot: Pick<RoomSlot, 'surface' | 'normal' | 'facing'>, other = false): { stands: Posture; from: Posture } {
  const up = new Vector3(0, 1, 0), facing = new Vector3(...slot.facing), right = up.clone().cross(facing);
  const about = (axis: Vector3, degrees: number) => new Quaternion().setFromAxisAngle(axis.clone().normalize(), degrees * Math.PI / 180);
  const posture = (turn = new Quaternion(), lift = 0, sunk = 0): Posture => ({ turn, lift, sunk });
  const gap = slot.surface === 'air' ? 0 : HOVER_GAP;   // in the air the slot's point is already under the thing
  if (pose === 'hovers') return { stands: posture(undefined, gap), from: posture(undefined, gap - HOVER_GAP) };
  if (pose === 'dropped') return { stands: posture(), from: posture(undefined, HOVER_GAP) };
  if (pose === 'sunk') {
    const turn = other ? about(right.clone().add(facing), SUNK_TILT) : new Quaternion();
    return { stands: posture(turn, 0, SUNK_SHARE), from: posture(turn, 0, 1) };   // it starts wholly behind the surface
  }
  if (pose === 'leans') return { stands: posture(other ? about(facing, LEAN_TILT) : about(right, -LEAN_TILT)), from: posture() };
  if (pose === 'turned') return { stands: posture(about(up, other ? TURNED_CORNER : TURNED_WALL)), from: posture() };
  const stands = posture(pose === 'mounted' && other ? new Quaternion().setFromUnitVectors(up, new Vector3(...slot.normal)) : undefined);
  return { stands, from: stands };
}

/** The centre of a thing's bounds in a slot: it meets the surface at the slot's point (lifted, or part behind it) and is centred on the point the other two ways. */
const centreIn = (extent: readonly number[], slot: RoomSlot, scale: number, lift: number, sunk: number) =>
  [0, 1, 2].map(axis => slot.point[axis] + slot.normal[axis] * (INSET + lift + extent[axis] * scale * (0.5 - sunk))) as [number, number, number];

/**
 * Where a thing `height` metres tall stands in a slot, given its model's size once turned to the slot's facing and into its pose:
 * its scale against the model and the centre of its bounds. It touches the surface at the slot's point, grows from there along the
 * normal, and is centred on the point the other two ways. `how`: the model's height standing upright where the pose tips it
 * (default: the size's own), the air under it in metres, and the share of it behind the surface.
 * A thing that would leave the clear volume is made as much smaller as it takes, because that volume is what the room has free
 * there; `shown` is the share of the asked height it kept, 1 when it fits.
 */
export function standInSlot(extent: readonly [number, number, number], hero: Box & { slot: RoomSlot }, height: number,
  how: { upright?: number; lift?: number; sunk?: number } = {}): { scale: number; shown: number; centre: [number, number, number] } {
  const { point, normal } = hero.slot, { upright = extent[1], lift = 0, sunk = 0 } = how, asked = height / upright;
  // what the volume leaves each way: from the point to the far face along the normal, less the air under the thing, for the part
  // of it that shows; twice the point to the nearer face across it
  const scale = Math.min(asked, ...extent.map((size, axis) => {
    const before = point[axis] - hero.min[axis], after = hero.max[axis] - point[axis];
    return normal[axis] ? ((normal[axis] > 0 ? after : before) - lift - 2 * INSET) / (size * (1 - sunk)) : 2 * (Math.min(before, after) - INSET) / size;
  }));
  if (!(scale > 0 && Number.isFinite(scale))) throw new Error('The slot has no room for a thing.');
  return { scale, shown: scale / asked, centre: centreIn(extent, hero.slot, scale, lift, sunk) };
}

/** A model as points in room coordinates. Unlit base colour, with normals. `density` is linear against the sampler's lattice (the
 * factor the owner tunes).
 * With a `height` in metres and a box that is a slot, the thing stands in the slot at that height, turned to its facing, in the
 * pose `stance` names (standInSlot, poseIn); a sunk thing's points stop at the surface. `move` is then how it gets there when it
 * arrives (sand-look.ts). Wrong scale needs nothing here: it is a `height` that is not the thing's own.
 * Repetition: with `places`, a copy more stands in each of those places of the room, at the size the first came out and in the
 * place's own pose. The copies share COPIES_MAX_POINTS, each an equal part and none more than one object's; `parts` says which
 * points are which copy.
 * Otherwise it is scaled evenly to the largest size that fits the box, centred in it, standing on its floor: the menu's choices. */
export async function loadObjectPoints(glbUrl: string, box: Box & { slot?: RoomSlot }, signal: AbortSignal, density = OBJECT_DENSITY, height?: number,
  stance: { pose: Pose; other?: boolean; places?: readonly RoomPlace[] } = { pose: 'rests' }): Promise<Stood & { move?: Move }> {
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
    const holder = new Group().add(scene), slot = height === undefined ? undefined : box.slot;
    const yaw = new Quaternion();   // the turn to the facing of the slot or place being stood in: a model's front is its +z
    /** The model's true bounds (its vertices', so a tipped thing touches its surface) once turned by `turn`, at scale 1 about the origin. */
    const turned = (turn: Quaternion) => {
      holder.quaternion.copy(turn).multiply(yaw); holder.scale.setScalar(1); holder.position.set(0, 0, 0);
      const bounds = new Box3().setFromObject(holder, true);
      return { bounds, extent: bounds.getSize(new Vector3()).toArray(), mid: bounds.getCenter(new Vector3()) };
    };
    /** Put the model with the centre of its bounds at `to`; its matrix. */
    const put = (turn: Quaternion, scale: number, to: readonly number[]) => {
      const { mid } = turned(turn);
      holder.scale.setScalar(scale);
      holder.position.set(to[0] - mid.x * scale, to[1] - mid.y * scale, to[2] - mid.z * scale);
      holder.updateMatrixWorld(true);
      return holder.matrixWorld.clone();
    };
    const { bounds, extent } = turned(new Quaternion());
    if (bounds.isEmpty() || !extent.every(value => value > 0 && Number.isFinite(value))) throw new Error('The object model has no volume.');
    /** The model as it now stands, as points. Sampled inside its own bounds, a little loose: the sampler drops faces that lie flat
     * on its boundary, such as the underside. A sunk thing's bounds stop at the surface, which cuts it off cleanly there. */
    const sample = (maxPoints: number, surface?: { axis: number; at: number; out: number }) => {
      const fitted = new Box3().setFromObject(holder).expandByScalar(INSET / 2);
      if (surface) (surface.out > 0 ? fitted.min : fitted.max).setComponent(surface.axis, surface.at);
      return sampleSurfacePointCloud(holder, fitted, signal, { density, maxPoints });
    };
    if (!slot) {
      const fit = Math.min(size[0] / extent[0], size[1] / extent[1], size[2] / extent[2]);
      put(new Quaternion(), fit, [(box.min[0] + box.max[0]) / 2, box.min[1] + INSET + extent[1] * fit / 2, (box.min[2] + box.max[2]) / 2]);
      return await sample(OBJECT_MAX_POINTS);
    }
    /** The thing `tall` metres high standing in a slot or a place, in a pose: its points, the move its arrival makes, and the share of that height it kept. */
    const stand = async (at: Box & { slot: RoomSlot }, pose: Pose, other: boolean | undefined, tall: number, maxPoints: number) => {
      const here = at.slot;
      yaw.setFromAxisAngle(new Vector3(0, 1, 0), Math.atan2(here.facing[0], here.facing[2]));
      const { stands, from } = poseIn(pose, here, other), posed = turned(stands.turn).extent;
      const { scale, shown, centre } = standInSlot(posed, at, tall, { upright: extent[1], lift: stands.lift, sunk: stands.sunk });
      if (shown < 1) console.info(`[astral] a thing ${tall} m tall does not fit the slot "${here.id}"${pose === 'rests' ? '' : ` in the pose "${pose}"`}; it is shown at ${shown.toFixed(2)} of that.`);
      // Where its arrival's move starts, then where it stands. What takes the second to the first is a turn about an axis through
      // the middle of the thing as it stands, and a shift.
      const start = put(from.turn, scale, centreIn(turned(from.turn).extent, here, scale, from.lift, from.sunk)), end = put(stands.turn, scale, centre);
      const back = start.multiply(end.clone().invert()), turn = new Quaternion().setFromRotationMatrix(back);
      if (turn.w < 0) turn.set(-turn.x, -turn.y, -turn.z, -turn.w);
      const half = Math.hypot(turn.x, turn.y, turn.z), mid = new Vector3(...centre);
      const axis = here.normal.findIndex(value => value !== 0), out = here.normal[axis];
      const surface = stands.sunk > 0 ? { axis, at: here.point[axis] + out * INSET, out } : undefined;
      const move: Move = {
        arrival: arrivalOf(pose), centre, angle: 2 * Math.atan2(half, turn.w),
        axis: half > 1e-9 ? [turn.x / half, turn.y / half, turn.z / half] : [0, 1, 0],
        offset: mid.clone().applyMatrix4(back).sub(mid).toArray(),
        // a hair under the surface the points stop at, so none of them is lost to rounding
        cut: surface ? [here.normal[0], here.normal[1], here.normal[2], out * surface.at - 1e-4] : null,
      };
      return { cloud: await sample(maxPoints, surface), move, shown };
    };
    const places = stance.places ?? [], share = Math.min(OBJECT_MAX_POINTS, Math.floor(COPIES_MAX_POINTS / (1 + places.length)));
    const first = await stand({ ...box, slot }, stance.pose, stance.other, height!, share);
    if (!places.length) return { ...first.cloud, move: first.move };
    // The other copies, each where its place has it stand. They only assemble: the first copy's move, if its pose has one, is
    // made by all of them as one body (sand-look.ts), which is right for a shift and wrong for a turn; repetition rests.
    const clouds = [first.cloud];
    for (const place of places) clouds.push((await stand(place, place.pose ?? 'rests', false, height! * first.shown, share)).cloud);
    const middle = (of: Box) => of.min.map((value, axis) => (value + of.max[axis]) / 2) as [number, number, number];
    return { ...first.cloud, ...joinClouds(clouds), move: first.move, parts: clouds.map((cloud, i) => ({ count: cloud.count, mid: middle(i ? places[i - 1] : box) })) };
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

/**
 * The surface of a slot as if nothing had ever stood on it (owner, 2026-11-17: a clean floor). The page lays it, as a cloud of
 * its own, under whatever replaces a hero that stands on a floor; when the thing is taken away (absence) it is all that is left.
 * A recording has no floor under its own things, and what floor a hero's box does hold is sampled finer than the room's and mixed
 * with the thing's own colours. So none of it is kept: the slot's whole footprint is laid with a copy of the real floor beside it,
 * its points as they are, moved across. That carries the room's own grain, density, colour and unevenness.
 * The patch comes from whichever of the four neighbouring pieces of floor, each the footprint's own size, is the most complete
 * once points that are not the floor's colour are left out. Where the room's own floor remains under the box (below its
 * underside, so not taken away with it) nothing is laid over it.
 * shortcut: the patch is one piece from one side, so its light is that side's, up to a slot's width away; blend patches from
 * two sides if its edge shows in a room whose floor is lit unevenly.
 */
export function floorOf(hero: Box & { slot: RoomSlot }, room: PointCloud): PointCloud {
  const { point, normal, id } = hero.slot, n = normal.findIndex(Boolean), [u, v] = [0, 1, 2].filter(axis => axis !== n), P = room.positions, C = room.colors;
  const size = [hero.max[u] - hero.min[u], hero.max[v] - hero.min[v]], shifts = [[0, size[1]], [0, -size[1]], [size[0], 0], [-size[0], 0]];
  /** The square of the footprint a point at (a, b) is over, or -1 when it is not over the footprint. */
  const cell = (a: number, b: number) => a < hero.min[u] || a > hero.max[u] || b < hero.min[v] || b > hero.max[v] ? -1
    : Math.floor((b - hero.min[v]) / FLOOR_CELL) * 4096 + Math.floor((a - hero.min[u]) / FLOOR_CELL);
  // The room's surface points round the slot: those of each neighbouring piece, and those under the box that stay.
  const beside: number[][] = shifts.map(() => []), stays = new Map<number, number>();
  for (let i = 0; i < room.count * 3; i += 3) {
    if (Math.abs((P[i + n] - point[n]) * normal[n]) > FLOOR_SKIN) continue;
    const over = cell(P[i + u], P[i + v]);
    if (over >= 0) { if (!inside(P, i, hero)) stays.set(over, (stays.get(over) ?? 0) + 1); continue; }
    const from = shifts.findIndex(([a, b]) => cell(P[i + u] - a, P[i + v] - b) >= 0);
    if (from >= 0) beside[from].push(i);
  }
  // Of each piece, the points of the floor's own colour (a colour's channels against its brightest; the piece's middle one is the floor's), and the squares they cover.
  const pieces = beside.map((list, from) => {
    const hue = (i: number, axis: number) => C[i + axis] / Math.max(C[i], C[i + 1], C[i + 2], 1e-6);
    const middle = [0, 1, 2].map(axis => list.map(i => hue(i, axis)).sort((a, b) => a - b)[list.length >> 1] ?? 0);
    const floor = list.filter(i => middle.every((value, axis) => Math.abs(hue(i, axis) - value) <= FLOOR_HUE));
    return { from, floor, cover: new Set(floor.map(i => cell(P[i + u] - shifts[from][0], P[i + v] - shifts[from][1]))).size };
  });
  const best = pieces.reduce((a, b) => b.cover > a.cover ? b : a), [du, dv] = shifts[best.from], thick = best.floor.length / Math.max(1, best.cover);
  const laid = best.floor.filter(i => (stays.get(cell(P[i + u] - du, P[i + v] - dv)) ?? 0) < thick / 2);
  const positions = new Float32Array(laid.length * 3), colors = new Float32Array(laid.length * 3), normals = new Float32Array(laid.length * 3);
  laid.forEach((i, at) => {
    for (let axis = 0; axis < 3; axis++) {
      positions[at * 3 + axis] = P[i + axis] - (axis === u ? du : axis === v ? dv : 0);
      colors[at * 3 + axis] = C[i + axis]; normals[at * 3 + axis] = room.normals ? room.normals[i + axis] : normal[axis];
    }
  });
  const squares = Math.ceil(size[0] / FLOOR_CELL) * Math.ceil(size[1] / FLOOR_CELL);
  console.info(`[astral] the floor of the slot "${id}" is laid again: ${laid.length} points copied from the floor beside it, over ${Math.round(100 * best.cover / squares)}% of it. A copy, not the recording.`);
  return { count: laid.length, positions, colors, normals, spacing: room.spacing, ordered: true };
}

/** Several clouds with normals as one: their points one after another. */
export function joinClouds(clouds: readonly PointCloud[]): { count: number; positions: Float32Array; colors: Float32Array; normals: Float32Array } {
  const count = clouds.reduce((sum, cloud) => sum + cloud.count, 0), joined = (key: 'positions' | 'colors' | 'normals') => {
    const all = new Float32Array(count * 3);
    clouds.reduce((at, cloud) => { all.set(cloud[key]!.subarray(0, cloud.count * 3), at); return at + cloud.count * 3; }, 0);
    return all;
  };
  return { count, positions: joined('positions'), colors: joined('colors'), normals: joined('normals') };
}

/** The room's cast: the mean colour of its points, its brightest channel as 1. */
export function roomCast(room: PointCloud): [number, number, number] {
  const sum = [0, 0, 0];
  for (let i = 0; i < room.count * 3; i++) sum[i % 3] += room.colors[i];
  const most = Math.max(...sum, 1e-6);
  return sum.map(value => value / most) as [number, number, number];
}

/**
 * A placed thing lit as the room is, in place. A shelf model's colours are its bare texture, evenly bright from every side,
 * where the room's points carry the light they were recorded in: such a thing reads as pasted in, and a pale one (the marble
 * knight) as a flat cut-out. So it is lit from the ceiling, its upward faces full and its undersides LIT_UNDER, and its colour
 * taken LIT_CAST of the way toward the room's cast.
 */
export function litLikeRoom(object: PointCloud, cast: readonly [number, number, number]): void {
  if (!object.normals) return;
  for (let i = 0; i < object.count * 3; i += 3) {
    const light = LIT_UNDER + (1 - LIT_UNDER) * (0.5 + 0.5 * object.normals[i + 1]);
    for (let axis = 0; axis < 3; axis++) object.colors[i + axis] *= light * (1 - LIT_CAST + LIT_CAST * cast[axis]);
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
