export type Note = { text: string; tags: number[] };
export type NotesState = { current: Note[]; history: Note[][] };
export type Point = [number, number, number];
export type Crop = { rotation_z: number; min: number[]; max: number[] };
export type Marker = { id: string; tag: number | null; centroid: Point; numbering: string | null; label: string };
export type Evidence = { tag: number; item: string; photos: string[] };
export type SceneData = { markers: Marker[]; evidence: Evidence[]; crop: Crop; attribution: string; review: string; limitations: string[] };
export const FFS = '/api/room-workflow/benchmark/ffs/';
export function editNotes(state: NotesState, current: Note[]): NotesState {
  if (JSON.stringify(state.current) === JSON.stringify(current)) return state;
  return { current, history: [...state.history.slice(-31), state.current] };
}
export function undoNotes(state: NotesState): NotesState {
  return state.history.length ? { current: state.history.at(-1)!, history: state.history.slice(0, -1) } : state;
}
export function displayPoint([x, y, z]: Point, crop: Crop): Point {
  const c = Math.cos(crop.rotation_z), s = Math.sin(crop.rotation_z);
  return [c * x - s * y, s * x + c * y, z - 349.2];
}
export function inCrop(point: Point, crop: Crop) {
  const p = displayPoint(point, crop); p[2] += 349.2;
  return p.every((v, i) => v >= crop.min[i]! && v <= crop.max[i]!);
}
