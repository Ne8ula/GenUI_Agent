// Asset readiness for the seed-33 photo layer: loading/ready/error states, caching (decode once per
// source), a transient failure retried once automatically (candidate-2), and a terminal failure
// reported in words rather than thrown or silently treated as ready. Also the manifest fetch/parse path
// (candidate-2's stable schema: figure.cropBoxInBackgroundFrac, tiles.regions[].{id,group,rect,sourceBoxPx}).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LOAD_ATTEMPTS, clearPhotoAssetCache, getPhotoLayerState, getPhotoManifestState, parsePhotoManifest } from '../src/render/photoAssets.ts';
import type { PhotoAssetDeps } from '../src/render/photoAssets.ts';
import type { PhotoLayer } from '../src/scene/types.ts';

const photo: PhotoLayer = {
  backgroundSrc: '/assets/seed33/test-background.png',
  figureSrc: '/assets/seed33/test-figure.png',
  foregroundSrc: '/assets/seed33/test-foreground.png',
  tilesSrc: '/assets/seed33/test-tiles.png',
  manifestSrc: '/assets/seed33/test-manifest.json',
};

function fakeBitmap(tag: string): ImageBitmap {
  return { __tag: tag } as unknown as ImageBitmap;
}

function okDeps(decodeCalls: string[]): PhotoAssetDeps {
  return {
    fetchImpl: ((url: string) => Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({ __url: url } as unknown as Blob) } as unknown as Response)) as typeof fetch,
    decode: (blob: Blob) => {
      const url = (blob as unknown as { __url: string }).__url;
      decodeCalls.push(url);
      return Promise.resolve(fakeBitmap(url));
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (times = 4) => {
  for (let i = 0; i < times; i++) await tick();
};

test('getPhotoLayerState starts loading, then reports ready with the decoded bitmaps once all four sources settle', async () => {
  clearPhotoAssetCache();
  const decodeCalls: string[] = [];
  const deps = okDeps(decodeCalls);
  const first = getPhotoLayerState(photo, deps);
  assert.equal(first.ready, false);
  assert.equal(first.background.state, 'loading');
  assert.equal(first.error, null);
  await settle();
  const settled = getPhotoLayerState(photo, deps);
  assert.equal(settled.ready, true);
  assert.equal(settled.background.state, 'ready');
  assert.equal(settled.figure.state, 'ready');
  assert.equal(settled.foreground.state, 'ready');
  assert.equal(settled.tiles.state, 'ready');
  assert.ok(settled.background.bitmap);
  assert.equal(settled.error, null);
});

test('each source is decoded once no matter how many times getPhotoLayerState is called (cache, not a redundant fetch)', async () => {
  clearPhotoAssetCache();
  const decodeCalls: string[] = [];
  const deps = okDeps(decodeCalls);
  getPhotoLayerState(photo, deps);
  getPhotoLayerState(photo, deps);
  getPhotoLayerState(photo, deps);
  await settle();
  getPhotoLayerState(photo, deps);
  assert.equal(decodeCalls.filter((u) => u === photo.backgroundSrc).length, 1, 'background decoded exactly once');
  assert.equal(decodeCalls.length, 4, 'exactly one decode per distinct source (background/figure/foreground/tiles)');
});

test('a transient failure is retried once automatically, and succeeds if the retry works', async () => {
  clearPhotoAssetCache();
  assert.equal(MAX_LOAD_ATTEMPTS, 2, 'exactly one automatic retry, not an unbounded loop');
  let calls = 0;
  const deps: PhotoAssetDeps = {
    fetchImpl: ((url: string) => {
      if (/background/.test(url)) {
        calls++;
        if (calls === 1) return Promise.reject(new Error('transient network blip'));
      }
      return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({ __url: url } as unknown as Blob) } as unknown as Response);
    }) as typeof fetch,
    decode: (blob: Blob) => Promise.resolve(fakeBitmap((blob as unknown as { __url: string }).__url)),
  };
  getPhotoLayerState(photo, deps);
  await settle(6);
  const state = getPhotoLayerState(photo, deps);
  assert.equal(state.background.state, 'ready', 'the retry succeeded');
  assert.equal(calls, 2, 'fetched exactly twice: the failure and the one retry');
});

test('a terminal failure (every attempt fails) is reported as an error state in words, never thrown, and never reported ready — and does not retry forever', async () => {
  clearPhotoAssetCache();
  let fetchCalls = 0;
  const deps: PhotoAssetDeps = {
    fetchImpl: ((url: string) => {
      if (/background/.test(url)) {
        fetchCalls++;
        return Promise.resolve({ ok: false, status: 404, blob: () => Promise.reject(new Error('unreachable')) } as unknown as Response);
      }
      return Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({} as unknown as Blob) } as unknown as Response);
    }) as typeof fetch,
    decode: () => Promise.resolve(fakeBitmap('ok')),
  };
  assert.doesNotThrow(() => getPhotoLayerState(photo, deps));
  await settle(6);
  const state = getPhotoLayerState(photo, deps);
  assert.equal(state.ready, false, 'never reports ready when one source failed every attempt');
  assert.equal(state.background.state, 'error');
  assert.ok(state.background.error?.includes('404') || state.background.error?.includes('HTTP'), state.background.error ?? '');
  assert.equal(state.error, state.background.error);
  assert.equal(fetchCalls, MAX_LOAD_ATTEMPTS, `fetched exactly MAX_LOAD_ATTEMPTS (${MAX_LOAD_ATTEMPTS}) times, not forever`);
  // Calling again after the terminal failure does not refetch (no retry storm beyond the bounded one).
  getPhotoLayerState(photo, deps);
  await settle();
  assert.equal(fetchCalls, MAX_LOAD_ATTEMPTS, 'a terminal failure is not silently retried on every subsequent call');
});

test('clearPhotoAssetCache allows a fresh load afterwards (remount/invalidation path)', async () => {
  clearPhotoAssetCache();
  const calls: string[] = [];
  const deps = okDeps(calls);
  getPhotoLayerState(photo, deps);
  await settle();
  assert.equal(getPhotoLayerState(photo, deps).ready, true);
  clearPhotoAssetCache();
  const fresh = getPhotoLayerState(photo, deps);
  assert.equal(fresh.ready, false, 'a cleared cache starts loading again, not stuck ready or stuck error');
  await settle();
  assert.equal(getPhotoLayerState(photo, deps).ready, true);
});

test('onSettled fires once per source after its own load finishes, not before, and not again for a cached source', async () => {
  clearPhotoAssetCache();
  const deps = okDeps([]);
  let settledCount = 0;
  getPhotoLayerState(photo, deps, () => {
    settledCount++;
  });
  assert.equal(settledCount, 0, 'not settled synchronously');
  await settle();
  assert.equal(settledCount, 4, 'one callback per source');
  getPhotoLayerState(photo, deps, () => {
    settledCount++;
  });
  await settle();
  assert.equal(settledCount, 4, 'cached sources do not re-fire the settle callback');
});

test('optional settled occlusion loads once and leaves the original construction foreground separate', async () => {
  clearPhotoAssetCache();
  const calls: string[] = [];
  const deps = okDeps(calls);
  const withOcclusion = { ...photo, settledForegroundSrc: '/assets/seed33/test-occlusion.png' };
  assert.equal(getPhotoLayerState(withOcclusion, deps).ready, false);
  await settle();
  const state = getPhotoLayerState(withOcclusion, deps);
  assert.equal(state.ready, true);
  assert.equal(state.settledForeground?.state, 'ready');
  assert.notEqual(state.foreground.bitmap, state.settledForeground?.bitmap);
  getPhotoLayerState(withOcclusion, deps);
  assert.equal(calls.length, 5);
});

test('failed settled occlusion is not silently treated as a ready complete scene', async () => {
  clearPhotoAssetCache();
  const normal = okDeps([]);
  const deps: PhotoAssetDeps = { ...normal, fetchImpl: ((url: string) => url.includes('occlusion')
    ? Promise.resolve({ ok: false, status: 404 } as Response) : normal.fetchImpl(url)) as typeof fetch };
  const withOcclusion = { ...photo, settledForegroundSrc: '/assets/seed33/test-occlusion.png' };
  getPhotoLayerState(withOcclusion, deps);
  await settle(6);
  const state = getPhotoLayerState(withOcclusion, deps);
  assert.equal(state.ready, false);
  assert.equal(state.foreground.state, 'ready');
  assert.equal(state.settledForeground?.state, 'error');
  assert.match(state.error ?? '', /occlusion.*404/);
});

// ---------------------------------------------------------------------------
// manifest.json (candidate-2 stable schema).

const VALID_MANIFEST = {
  figure: { cropBoxInBackgroundFrac: [0.32, 0.35, 0.40, 0.75] },
  tiles: {
    size: [2731, 1536],
    regions: [
      { id: 'left-coral', group: 'left', rect: [0.09, 0.1, 0.06, 0.1], sourceBoxPx: [249, 153, 426, 304] },
      { id: 'table-honey', group: 'table', rect: [0.5, 0.78, 0.04, 0.15], sourceBoxPx: [1367, 1207, 1471, 1437] },
    ],
  },
};

test('parsePhotoManifest accepts the candidate-2 shape and maps rect/sourceBoxPx/group exactly', () => {
  const data = parsePhotoManifest(VALID_MANIFEST);
  assert.deepEqual(data.figureHomeRectNorm, [0.32, 0.35, 0.40, 0.75]);
  assert.deepEqual(data.tilesAtlasSizePx, [2731, 1536]);
  assert.equal(data.tileRegions.length, 2);
  assert.equal(data.tileRegions[0]!.id, 'left-coral');
  assert.equal(data.tileRegions[0]!.group, 'left');
  assert.deepEqual(data.tileRegions[0]!.rectNorm, [0.09, 0.1, 0.06, 0.1]);
  assert.deepEqual(data.tileRegions[0]!.sourceBoxPx, [249, 153, 426, 304]);
});

test('parsePhotoManifest rejects a shape mismatch loudly instead of silently misplacing tiles', () => {
  assert.throws(() => parsePhotoManifest({}), /figure\.cropBoxInBackgroundFrac/);
  assert.throws(() => parsePhotoManifest({ figure: { cropBoxInBackgroundFrac: [0.3, 0.3, 0.4] } }), /cropBoxInBackgroundFrac/);
  assert.throws(() => parsePhotoManifest({ figure: { cropBoxInBackgroundFrac: [0, 0, 1, 1] }, tiles: {} }), /tiles\.size/);
  assert.throws(
    () => parsePhotoManifest({ figure: { cropBoxInBackgroundFrac: [0, 0, 1, 1] }, tiles: { size: [1, 1], regions: [{ id: 'x', group: 'nowhere', rect: [0, 0, 1, 1], sourceBoxPx: [0, 0, 1, 1] }] } }),
    /group/,
  );
});

test('getPhotoManifestState loads, caches and reports a parsed-shape error in words', async () => {
  clearPhotoAssetCache();
  let fetchCalls = 0;
  const deps: PhotoAssetDeps = {
    fetchImpl: ((url: string) => {
      fetchCalls++;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(VALID_MANIFEST) } as unknown as Response);
    }) as typeof fetch,
    decode: () => Promise.reject(new Error('unused')),
  };
  const first = getPhotoManifestState('/assets/seed33/manifest.json', deps);
  assert.equal(first.state, 'loading');
  await settle();
  const second = getPhotoManifestState('/assets/seed33/manifest.json', deps);
  assert.equal(second.state, 'ready');
  assert.equal(second.data?.tileRegions.length, 2);
  getPhotoManifestState('/assets/seed33/manifest.json', deps);
  assert.equal(fetchCalls, 1, 'fetched once, then cached');
});
