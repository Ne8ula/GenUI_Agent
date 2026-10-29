import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FFS } from './state.ts';
import type { Marker } from './state.ts';
// Owner review (review.md) and fitted models (models/fits.json): owner input and generated completion, not source evidence.
type Decision = 'approved' | 'rejected';
export type ModelDecision = { status: Decision; upright: [number, number, number] };
export type Review = { segments: Record<string, Decision>; models: Record<string, ModelDecision>; coverage_threshold: number };
export type Fit = { matrix: number[]; coverage: number; mean_cm: number; model?: string; revision?: string };
export type LoadedModel = { index: number; tag: number; fit: Fit; object: THREE.Group };
export type Hologram = { kind: 'model'; fit: Fit } | { kind: 'segment' } | { kind: 'sphere' };
export const NO_REVIEW: Review = { segments: {}, models: {}, coverage_threshold: 1 };
const GLB_LIMIT = 2 * 1024 * 1024, TEXT_LIMIT = 64 * 1024;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const decision = (value: unknown): value is Decision => value === 'approved' || value === 'rejected';
const finite = (value: unknown, low: number, high: number): value is number => typeof value === 'number' && value >= low && value <= high;

export function modelLabel(fit: { coverage: number; mean_cm: number }) {
  return `Generated from source photo, fitted to scan (coverage ${Math.round(fit.coverage * 100)} %, mean ${fit.mean_cm.toFixed(1)} cm)`;
}
// Generator provenance recorded in fits.json (model id and weights revision), shown in Sources & details.
export function generatorLabel(fit: Fit) {
  return fit.model && fit.revision ? `generator ${fit.model} @ ${fit.revision.slice(0, 8)}` : 'generator not recorded';
}
export function hologramLabel(hologram: Hologram) {
  return hologram.kind === 'model' ? modelLabel(hologram.fit) : hologram.kind === 'sphere' ? 'approximate region' : null;
}
// Fails closed: anything unexpected approves nothing.
export function parseReview(text: string): Review {
  const block = text.match(/```json\n([\s\S]*?)\n```/);
  let value: unknown; try { value = JSON.parse(block?.[1] ?? ''); } catch { return NO_REVIEW; }
  if (!record(value) || !record(value.segments) || !record(value.models) || !finite(value.coverage_threshold, 0, 1)) return NO_REVIEW;
  if (!Object.values(value.segments).every(decision)) return NO_REVIEW;
  if (!Object.values(value.models).every(m => record(m) && decision(m.status) && Array.isArray(m.upright) && m.upright.length === 3 && m.upright.every(v => finite(v, -Math.PI, Math.PI)))) return NO_REVIEW;
  return { segments: value.segments as Review['segments'], models: value.models as Review['models'], coverage_threshold: value.coverage_threshold };
}
export function modelVisible(fit: { coverage: number } | undefined, review: ModelDecision | undefined, threshold: number) {
  return !!fit && review?.status === 'approved' && fit.coverage >= threshold;
}
// Per kept point: the marker index whose approved segment lists its original PLY index, or -1.
export function segmentAttribute(kept: Uint32Array, lists: Map<number, Uint32Array>) {
  const owner = new Int32Array(kept.reduce((a, b) => Math.max(a, b), -1) + 1).fill(-1);
  for (const [index, list] of lists) for (const i of list) if (i < owner.length) owner[i] = index;
  return Float32Array.from(kept, i => owner[i]!);
}
// Optional catalogue entries: the broker serves only hash-verified bytes; absence or refusal means the fallback.
async function bytes(name: string, limit: number, signal: AbortSignal) {
  const response = await fetch(FFS + name, { signal }); if (!response.ok) return null;
  const buffer = await response.arrayBuffer(); signal.throwIfAborted();
  return buffer.byteLength <= limit ? buffer : null;
}
export async function loadReview(signal: AbortSignal) {
  try { const buffer = await bytes('review.md', TEXT_LIMIT, signal); return buffer ? parseReview(new TextDecoder().decode(buffer)) : NO_REVIEW; }
  catch (e) { if (signal.aborted) throw e; return NO_REVIEW; }
}
// Lists are keyed in marker order whatever the fetch order, so overlapping segments resolve deterministically (last marker wins).
export async function loadSegments(markers: Marker[], review: Review, total: number, signal: AbortSignal) {
  const found = await Promise.all(markers.map(async marker => {
    if (review.segments[marker.id] !== 'approved') return null;
    const buffer = await bytes(`segments/${marker.id}.u32`, total * 4, signal).catch(() => null);
    if (!buffer || buffer.byteLength % 4) return null;
    const list = new Uint32Array(buffer); // shortcut: host-endian read of little-endian files, all supported platforms are little-endian
    return list.length && list.every(i => i < total) ? list : null;
  }));
  return new Map(found.flatMap((list, index) => list ? [[index, list] as const] : []));
}
const affine = (matrix: unknown): matrix is number[] => Array.isArray(matrix) && matrix.length === 16 && matrix.every(v => finite(v, -1e4, 1e4))
  && [3, 7, 11].every(i => matrix[i] === 0) && matrix[15] === 1;
// A model only replaces an approved segment; the GLB is fetched only when the fit passes the owner's decision and threshold.
export async function loadModels(markers: Marker[], review: Review, signal: AbortSignal): Promise<LoadedModel[]> {
  const wanted = markers.flatMap((marker, index) => marker.tag !== null && review.segments[marker.id] === 'approved' && review.models[marker.tag]?.status === 'approved' ? [{ index, tag: marker.tag }] : []);
  if (!wanted.length) return [];
  const buffer = await bytes('models/fits.json', TEXT_LIMIT, signal).catch(() => null);
  let fits: unknown; try { fits = JSON.parse(new TextDecoder().decode(buffer ?? new ArrayBuffer(0))); } catch { return []; }
  if (!record(fits)) return [];
  const loader = new GLTFLoader();
  const loaded = await Promise.all(wanted.map(async ({ index, tag }) => {
    const fit = fits[tag];
    if (!record(fit) || !affine(fit.matrix) || !finite(fit.coverage, 0, 1) || !finite(fit.mean_cm, 0, 1e4)
      || !modelVisible({ coverage: fit.coverage }, review.models[tag], review.coverage_threshold)) return null;
    try {
      const glb = await bytes(`models/tag-${tag}.glb`, GLB_LIMIT, signal); if (!glb) return null;
      const { scene } = await loader.parseAsync(glb, '');
      scene.matrixAutoUpdate = false; scene.matrix.fromArray(fit.matrix); scene.updateMatrixWorld(true);
      const generator = typeof fit.model === 'string' && /^[\w.-]{1,64}\/[\w.-]{1,64}$/.test(fit.model) && typeof fit.revision === 'string' && /^[0-9a-f]{7,64}$/.test(fit.revision)
        ? { model: fit.model, revision: fit.revision } : {};
      return { index, tag, fit: { matrix: fit.matrix, coverage: fit.coverage, mean_cm: fit.mean_cm, ...generator }, object: scene };
    } catch (e) { if (signal.aborted) throw e; return null; }
  }));
  return loaded.filter((m): m is LoadedModel => m !== null);
}
