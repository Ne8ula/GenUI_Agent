// Loads and caches the seed-33 photo layer's reference-derived assets (background, figure, foreground,
// tiles atlas, manifest.json) for both renderer backends. Decoded once per source URL (module-level
// cache, keyed by URL) so a backend switch or a second mounted canvas reuses the same bitmaps instead
// of re-fetching; a transient failure is retried once automatically, and a terminal failure is reported
// in words (never thrown from a render loop's draw() call) rather than cached as "ready" forever — no
// fake ready. createImageBitmap always requests `premultiplyAlpha: 'none'` so the decoded pixels are a
// known straight-alpha contract regardless of the browser's own default (candidate-2 fix).
import type { PhotoLayer, PhotoManifestData, PhotoTileRegion } from '../scene/types.ts';

export type PhotoAssetState = 'loading' | 'ready' | 'error';

export interface PhotoAssetEntry {
  state: PhotoAssetState;
  bitmap: ImageBitmap | null;
  error: string | null;
}

export interface LoadedPhotoLayer {
  background: PhotoAssetEntry;
  figure: PhotoAssetEntry;
  foreground: PhotoAssetEntry;
  tiles: PhotoAssetEntry;
  settledForeground?: PhotoAssetEntry;
  /** True once every configured bitmap is ready, including optional settled occlusion. */
  ready: boolean;
  /** The first error across the four, if any (for a single-line status). */
  error: string | null;
}

export interface PhotoAssetDeps {
  fetchImpl: typeof fetch;
  decode: (blob: Blob) => Promise<ImageBitmap>;
}

const defaultDeps: PhotoAssetDeps = {
  fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args),
  decode: (blob: Blob) => createImageBitmap(blob, { premultiplyAlpha: 'none' }),
};

/** One automatic retry for a transient failure (network blip during dev/capture), not an unbounded loop. */
export const MAX_LOAD_ATTEMPTS = 2;

interface CacheEntry {
  state: PhotoAssetState;
  bitmap: ImageBitmap | null;
  error: string | null;
  attempts: number;
  promise: Promise<void>;
}

const cache = new Map<string, CacheEntry>();

function attemptLoad(src: string, deps: PhotoAssetDeps, entry: CacheEntry): Promise<void> {
  return (async () => {
    try {
      const response = await deps.fetchImpl(src);
      if (!response.ok) throw new Error(`fetch ${src} failed: HTTP ${response.status}`);
      const blob = await response.blob();
      const bitmap = await deps.decode(blob);
      entry.state = 'ready';
      entry.bitmap = bitmap;
      entry.error = null;
    } catch (error) {
      entry.attempts += 1;
      const message = `could not load ${src}: ${error instanceof Error ? error.message : String(error)}`;
      if (entry.attempts < MAX_LOAD_ATTEMPTS) {
        entry.error = `${message} (retrying once)`;
        entry.promise = attemptLoad(src, deps, entry);
        await entry.promise;
        return;
      }
      entry.state = 'error';
      entry.error = message;
    }
  })();
}

function loadOne(src: string, deps: PhotoAssetDeps): CacheEntry {
  const hit = cache.get(src);
  if (hit) return hit;
  const entry: CacheEntry = { state: 'loading', bitmap: null, error: null, attempts: 0, promise: Promise.resolve() };
  entry.promise = attemptLoad(src, deps, entry);
  cache.set(src, entry);
  return entry;
}

function asEntry(c: CacheEntry): PhotoAssetEntry {
  return { state: c.state, bitmap: c.bitmap, error: c.error };
}

/**
 * Starts (or reuses) the load of all four image sources and returns the CURRENT state synchronously
 * (never blocks draw()); call again next frame to observe progress. Pass `onSettled` to be notified
 * once (per source, per attempt) when a load finishes, so a renderer can request a redraw instead of
 * polling (optional; the render loop already redraws every frame regardless).
 */
export function getPhotoLayerState(photo: PhotoLayer, deps: PhotoAssetDeps = defaultDeps, onSettled?: () => void): LoadedPhotoLayer {
  const sources = [photo.backgroundSrc, photo.figureSrc, photo.foregroundSrc, photo.tilesSrc];
  if (photo.settledForegroundSrc) sources.push(photo.settledForegroundSrc);
  const entries = sources.map((src) => {
    const existed = cache.has(src);
    const entry = loadOne(src, deps);
    if (!existed && onSettled) void entry.promise.then(onSettled);
    return entry;
  });
  const [background, figure, foreground, tiles] = entries as [CacheEntry, CacheEntry, CacheEntry, CacheEntry];
  const ready = entries.every(entry => entry.state === 'ready');
  const error = entries.find((e) => e.state === 'error')?.error ?? null;
  const settledForeground = entries[4];
  return { background: asEntry(background), figure: asEntry(figure), foreground: asEntry(foreground), tiles: asEntry(tiles),
    ...(settledForeground ? { settledForeground: asEntry(settledForeground) } : {}), ready, error };
}

// ---------------------------------------------------------------------------
// manifest.json: fetched once, cached, parsed defensively against the candidate-2 contract (main owns
// the actual pixel content; this module only needs the stable shape: figure.cropBoxInBackgroundFrac and
// tiles.regions[].{id,group,rect,sourceBoxPx}). A shape mismatch is a loud, worded error, never a silent
// misplacement.

interface ManifestCacheEntry {
  state: PhotoAssetState;
  data: PhotoManifestData | null;
  error: string | null;
  attempts: number;
  promise: Promise<void>;
}

const manifestCache = new Map<string, ManifestCacheEntry>();

function isFiniteQuad(v: unknown): v is [number, number, number, number] {
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** Parses and validates the candidate-2 manifest shape; throws a worded error on any mismatch. */
export function parsePhotoManifest(json: unknown): PhotoManifestData {
  if (typeof json !== 'object' || json === null) throw new Error('manifest is not an object');
  const m = json as Record<string, unknown>;
  const figure = m.figure as Record<string, unknown> | undefined;
  const cropFrac = figure?.cropBoxInBackgroundFrac;
  if (!isFiniteQuad(cropFrac)) throw new Error('manifest.figure.cropBoxInBackgroundFrac is missing or not a 4-number array');
  const tilesObj = m.tiles as Record<string, unknown> | undefined;
  const size = tilesObj?.size;
  if (!Array.isArray(size) || size.length !== 2 || typeof size[0] !== 'number' || typeof size[1] !== 'number') {
    throw new Error('manifest.tiles.size is missing or not a 2-number array');
  }
  const rawRegions = tilesObj?.regions;
  if (!Array.isArray(rawRegions)) throw new Error('manifest.tiles.regions is missing or not an array');
  const regions: PhotoTileRegion[] = rawRegions.map((r, i) => {
    const region = r as Record<string, unknown>;
    const rect = region.rect;
    const sourceBoxPx = region.sourceBoxPx;
    if (typeof region.id !== 'string') throw new Error(`manifest.tiles.regions[${i}].id is missing`);
    if (!isFiniteQuad(rect)) throw new Error(`manifest.tiles.regions[${i}].rect is missing or not a 4-number array`);
    if (!isFiniteQuad(sourceBoxPx)) throw new Error(`manifest.tiles.regions[${i}].sourceBoxPx is missing or not a 4-number array`);
    const group = region.group;
    if (group !== 'left' && group !== 'right' && group !== 'table') throw new Error(`manifest.tiles.regions[${i}].group "${String(group)}" is not left/right/table`);
    return { id: region.id, rectNorm: rect, sourceBoxPx, group };
  });
  return { figureHomeRectNorm: cropFrac, tilesAtlasSizePx: size as [number, number], tileRegions: regions };
}

function attemptManifestLoad(src: string, deps: PhotoAssetDeps, entry: ManifestCacheEntry): Promise<void> {
  return (async () => {
    try {
      const response = await deps.fetchImpl(src);
      if (!response.ok) throw new Error(`fetch ${src} failed: HTTP ${response.status}`);
      const json = await response.json();
      entry.data = parsePhotoManifest(json);
      entry.state = 'ready';
      entry.error = null;
    } catch (error) {
      entry.attempts += 1;
      const message = `could not load manifest ${src}: ${error instanceof Error ? error.message : String(error)}`;
      if (entry.attempts < MAX_LOAD_ATTEMPTS) {
        entry.error = `${message} (retrying once)`;
        entry.promise = attemptManifestLoad(src, deps, entry);
        await entry.promise;
        return;
      }
      entry.state = 'error';
      entry.error = message;
    }
  })();
}

export interface PhotoManifestResult {
  state: PhotoAssetState;
  data: PhotoManifestData | null;
  error: string | null;
}

export function getPhotoManifestState(src: string, deps: PhotoAssetDeps = defaultDeps, onSettled?: () => void): PhotoManifestResult {
  let entry = manifestCache.get(src);
  if (!entry) {
    entry = { state: 'loading', data: null, error: null, attempts: 0, promise: Promise.resolve() };
    entry.promise = attemptManifestLoad(src, deps, entry);
    manifestCache.set(src, entry);
    if (onSettled) void entry.promise.then(onSettled);
  }
  return { state: entry.state, data: entry.data, error: entry.error };
}

/** Test/dev only: drops every cached entry (and disposes bitmaps) so a fresh load can be observed. */
export function clearPhotoAssetCache(): void {
  for (const entry of cache.values()) entry.bitmap?.close?.();
  cache.clear();
  manifestCache.clear();
}
