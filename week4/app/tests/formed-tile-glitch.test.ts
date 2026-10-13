// Focused acceptance tests for the post-formation glitch overlay
// (w4-20261009-seed33-formed-glitch-r1): week4/app/src/scene/matrixTiles.ts's
// `formedTileGlitchPatches`, and its one construction-build callsite in
// week4/app/src/scene/seed33Construction.ts (`emitTile`). The settled Canvas2D/WebGL2 renderer call
// sites (render/canvas2d.ts, render/webgl2.ts) have no dedicated unit coverage in this suite (consistent
// with the rest of this file's backends, which are exercised only through browser capture, owned by
// main); this file instead proves the SHARED planner they both call is correct, deterministic and bounded.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_FORMED_GLITCH_PATCHES, formedTileGlitchPatches } from '../src/scene/matrixTiles.ts';
import { buildSeed33Construction } from '../src/scene/seed33Construction.ts';
import type { ConstructionPatch } from '../src/scene/constructionTypes.ts';
import type { PhotoManifestData, PhotoTileRegion } from '../src/scene/types.ts';

const ATLAS_SIZE = Object.freeze([1000, 500] as const);
const MAX_OFFSET_X = 6 / 1920;
const MAX_OFFSET_Y = 6 / 1080;

const REGION_A = Object.freeze({
  id: 'left-coral',
  group: 'left',
  rectNorm: Object.freeze([0.24, 0.2, 0.32, 0.28] as const),
  sourceBoxPx: Object.freeze([120, 80, 760, 360] as const),
} satisfies PhotoTileRegion);

const REGION_B = Object.freeze({
  id: 'right-scanlines',
  group: 'right',
  rectNorm: Object.freeze([0.05, 0.05, 0.1, 0.1] as const),
  sourceBoxPx: Object.freeze([10, 10, 400, 200] as const),
} satisfies PhotoTileRegion);

type GlitchInput = Parameters<typeof formedTileGlitchPatches>[0];

function scan(input: Omit<GlitchInput, 'timeMs'>, fromMs: number, toMs: number, stepMs = 20): Array<{ timeMs: number; patches: readonly ConstructionPatch[] }> {
  const samples: Array<{ timeMs: number; patches: readonly ConstructionPatch[] }> = [];
  for (let timeMs = fromMs; timeMs <= toMs; timeMs += stepMs) {
    samples.push({ timeMs, patches: formedTileGlitchPatches({ ...input, timeMs }) });
  }
  return samples;
}

interface Run {
  empty: boolean;
  startMs: number;
  endMs: number;
}

/** Collapses a time-ordered sample scan into maximal runs of consecutive empty/non-empty output. */
function collapseRuns(samples: ReadonlyArray<{ timeMs: number; patches: readonly unknown[] }>): Run[] {
  const runs: Run[] = [];
  for (const sample of samples) {
    const empty = sample.patches.length === 0;
    const last = runs[runs.length - 1];
    if (last && last.empty === empty) last.endMs = sample.timeMs;
    else runs.push({ empty, startMs: sample.timeMs, endMs: sample.timeMs });
  }
  return runs;
}

test('formedTileGlitchPatches rejects invalid/missing geometry and non-finite inputs without throwing', () => {
  assert.deepEqual(formedTileGlitchPatches({ region: null as unknown as PhotoTileRegion, atlasSizePx: ATLAS_SIZE, index: 0, timeMs: 0, seed: 33 }), []);
  assert.deepEqual(formedTileGlitchPatches({ region: { ...REGION_A, id: '' }, atlasSizePx: ATLAS_SIZE, index: 0, timeMs: 5000, seed: 33 }), []);

  const degenerateRect = { ...REGION_A, rectNorm: [0.2, 0.2, 0, 0.3] } satisfies PhotoTileRegion;
  assert.deepEqual(formedTileGlitchPatches({ region: degenerateRect, atlasSizePx: ATLAS_SIZE, index: 0, timeMs: 5000, seed: 33 }), []);

  const degenerateCrop = { ...REGION_A, sourceBoxPx: [120, 80, 120, 360] } satisfies PhotoTileRegion;
  assert.deepEqual(formedTileGlitchPatches({ region: degenerateCrop, atlasSizePx: ATLAS_SIZE, index: 0, timeMs: 5000, seed: 33 }), []);

  const outOfAtlasCrop = { ...REGION_A, sourceBoxPx: [120, 80, 1100, 360] } satisfies PhotoTileRegion;
  assert.deepEqual(formedTileGlitchPatches({ region: outOfAtlasCrop, atlasSizePx: ATLAS_SIZE, index: 0, timeMs: 5000, seed: 33 }), []);

  assert.deepEqual(formedTileGlitchPatches({ region: REGION_A, atlasSizePx: [0, 500], index: 0, timeMs: 5000, seed: 33 }), []);

  // Non-finite timeMs/index/seed fall back to bounded defaults (0) rather than throwing or producing NaN.
  assert.doesNotThrow(() => formedTileGlitchPatches({ region: REGION_A, atlasSizePx: ATLAS_SIZE, index: Number.NaN, timeMs: Number.NaN, seed: Number.NaN }));
  assert.deepEqual(
    formedTileGlitchPatches({ region: REGION_A, atlasSizePx: ATLAS_SIZE, index: 0, timeMs: Number.NaN, seed: 33 }),
    formedTileGlitchPatches({ region: REGION_A, atlasSizePx: ATLAS_SIZE, index: 0, timeMs: 0, seed: 33 }),
  );

  // Inputs are never mutated.
  assert.deepEqual(REGION_A.rectNorm, [0.24, 0.2, 0.32, 0.28]);
  assert.deepEqual(ATLAS_SIZE, [1000, 500]);
});

test('formedTileGlitchPatches is deterministic and repeats a readable rest(>=1s)/burst(<=350ms) cadence', () => {
  const input = { region: REGION_A, atlasSizePx: ATLAS_SIZE, index: 4, seed: 33 } as const;

  // Determinism: same (region, atlasSizePx, index, timeMs, seed) always yields the same output.
  assert.deepEqual(formedTileGlitchPatches({ ...input, timeMs: 4321 }), formedTileGlitchPatches({ ...input, timeMs: 4321 }));
  assert.deepEqual(formedTileGlitchPatches({ ...input, timeMs: 9999 }), formedTileGlitchPatches({ ...input, timeMs: 9999 }));

  const samples = scan(input, 0, 6400, 20);
  assert.ok(samples.some((sample) => sample.patches.length > 0), 'at least one burst is observed over the scan');
  assert.ok(samples.some((sample) => sample.patches.length === 0), 'rest (no overlay output) is also observed');

  const runs = collapseRuns(samples);
  // Drop the first/last run: the scan window can truncate them, which would understate their length.
  const interior = runs.slice(1, -1);
  const restRuns = interior.filter((run) => run.empty);
  const burstRuns = interior.filter((run) => !run.empty);
  assert.ok(restRuns.length > 0 && burstRuns.length > 0, 'both rest and burst runs are fully observed inside the scan');

  const longestRestMs = Math.max(...restRuns.map((run) => run.endMs - run.startMs));
  assert.ok(longestRestMs >= 1000 - 20, `a rest holds for at least ~1s (observed ${longestRestMs}ms)`);

  for (const run of burstRuns) {
    const durationMs = run.endMs - run.startMs;
    assert.ok(durationMs <= 350 + 20, `a burst stays within the readable-hold budget (observed ${durationMs}ms)`);
  }
  const longestBurstMs = Math.max(...burstRuns.map((run) => run.endMs - run.startMs));
  assert.ok(longestBurstMs >= 200 - 20, `at least one burst reaches the lower readable-hold bound (observed ${longestBurstMs}ms)`);
});

test('different tiles stagger: bursts are not synchronized in lockstep across boxes', () => {
  const inputA = { region: REGION_A, atlasSizePx: ATLAS_SIZE, index: 0, seed: 33 } as const;
  const inputB = { region: REGION_B, atlasSizePx: ATLAS_SIZE, index: 1, seed: 33 } as const;
  let anyDifferentPhase = false;
  for (let timeMs = 0; timeMs <= 5000 && !anyDifferentPhase; timeMs += 20) {
    const aActive = formedTileGlitchPatches({ ...inputA, timeMs }).length > 0;
    const bActive = formedTileGlitchPatches({ ...inputB, timeMs }).length > 0;
    if (aActive !== bActive) anyDifferentPhase = true;
  }
  assert.ok(anyDifferentPhase, 'two distinct tiles are observed in different rest/burst phases at the same time');
});

test('a burst is bounded: capped command count, ids, local source UV, and local destination offsets', () => {
  const input = { region: REGION_A, atlasSizePx: ATLAS_SIZE, index: 4, seed: 33 } as const;
  const burst = scan(input, 0, 6400, 20).find((sample) => sample.patches.length > 0);
  assert.ok(burst, 'a burst sample exists in the scan window');
  const patches = burst!.patches;

  assert.ok(patches.length > 0 && patches.length <= MAX_FORMED_GLITCH_PATCHES);
  assert.equal(new Set(patches.map((patch) => patch.id)).size, patches.length, 'patch ids are unique');

  const [x, y, width, height] = REGION_A.rectNorm;
  const [sourceX0, sourceY0, sourceX1, sourceY1] = REGION_A.sourceBoxPx;
  const u0 = sourceX0 / ATLAS_SIZE[0];
  const v0 = sourceY0 / ATLAS_SIZE[1];
  const u1 = sourceX1 / ATLAS_SIZE[0];
  const v1 = sourceY1 / ATLAS_SIZE[1];

  for (const patch of patches) {
    assert.equal(patch.kind, 'texture');
    assert.equal(patch.texture, 'tiles');
    assert.equal(patch.alpha, 1);
    assert.ok(patch.id.startsWith(`tile:${REGION_A.id}:glitch-`), `${patch.id}: carries the tile's own glitch id prefix`);
    for (const vertex of patch.vertices) {
      assert.ok(Number.isFinite(vertex.x) && vertex.x >= 0 && vertex.x <= 1, `${patch.id}: x normalised`);
      assert.ok(Number.isFinite(vertex.y) && vertex.y >= 0 && vertex.y <= 1, `${patch.id}: y normalised`);
      assert.ok(vertex.u >= u0 - 1e-9 && vertex.u <= u1 + 1e-9, `${patch.id}: u stays inside the tile's own real source crop`);
      assert.ok(vertex.v >= v0 - 1e-9 && vertex.v <= v1 + 1e-9, `${patch.id}: v stays inside the tile's own real source crop`);
      assert.ok(vertex.x >= x - MAX_OFFSET_X - 1e-9 && vertex.x <= x + width + MAX_OFFSET_X + 1e-9, `${patch.id}: x displacement stays within the bounded pad`);
      assert.ok(vertex.y >= y - MAX_OFFSET_Y - 1e-9 && vertex.y <= y + height + MAX_OFFSET_Y + 1e-9, `${patch.id}: y displacement stays within the bounded pad`);
    }
  }
});

test('anchorOffset shifts every emitted vertex uniformly, for settled-renderer drift alignment', () => {
  const base = { region: REGION_A, atlasSizePx: ATLAS_SIZE, index: 4, seed: 33 } as const;
  const burstTimeMs = scan(base, 0, 6400, 20).find((sample) => sample.patches.length > 0)?.timeMs;
  assert.ok(burstTimeMs !== undefined, 'a burst time exists');

  const plain = formedTileGlitchPatches({ ...base, timeMs: burstTimeMs! });
  const offset = { dx: 0.004, dy: -0.002 };
  const shifted = formedTileGlitchPatches({ ...base, timeMs: burstTimeMs!, anchorOffset: offset });
  assert.equal(shifted.length, plain.length);
  for (let i = 0; i < plain.length; i += 1) {
    for (let v = 0; v < 3; v += 1) {
      assert.ok(Math.abs(shifted[i]!.vertices[v]!.x - (plain[i]!.vertices[v]!.x + offset.dx)) < 1e-9);
      assert.ok(Math.abs(shifted[i]!.vertices[v]!.y - (plain[i]!.vertices[v]!.y + offset.dy)) < 1e-9);
      // The source crop is untouched by the anchor offset: only destination moves.
      assert.equal(shifted[i]!.vertices[v]!.u, plain[i]!.vertices[v]!.u);
      assert.equal(shifted[i]!.vertices[v]!.v, plain[i]!.vertices[v]!.v);
    }
  }
});

const TILE_REGIONS = [
  { id: 'left-coral', group: 'left', sourceBoxPx: [249, 153, 426, 304], rectNorm: [0.0911753936, 0.099609375, 0.0648114244, 0.0983072917] },
  { id: 'right-scanlines', group: 'right', sourceBoxPx: [2014, 502, 2146, 570], rectNorm: [0.7374588063, 0.3268229167, 0.0483339436, 0.0442708333] },
  { id: 'table-cream-dots', group: 'table', sourceBoxPx: [1098, 1153, 1228, 1412], rectNorm: [0.4020505309, 0.7506510417, 0.0476016111, 0.1686197917] },
] as const satisfies readonly PhotoTileRegion[];
const MANIFEST: PhotoManifestData = {
  figureHomeRectNorm: [0.321127792, 0.3489583333, 0.4046136946, 0.7545572917],
  tilesAtlasSizePx: [2731, 1536],
  tileRegions: TILE_REGIONS,
};
const BUILD_MS = 12_000;

test('post-formation glitching is observable after an individual box forms (still mid-build) and reuses the same planner the settled renderers call', () => {
  const region = TILE_REGIONS[0]!;

  // Find a timeMs where this tile has reached its settled rest shape (matrixTilePatches' own
  // triangle-a), well before the overall build completes.
  let formedTimeMs: number | null = null;
  for (let progress = 0.5; progress < 0.97 && formedTimeMs === null; progress += 0.002) {
    const timeMs = Math.round(BUILD_MS * progress);
    const plan = buildSeed33Construction({ timeMs, buildMs: BUILD_MS, seed: 33, reducedMotion: false, showTiles: true, manifest: MANIFEST });
    if (plan.commands.some((command) => command.id === `tile:${region.id}:triangle-a`)) formedTimeMs = timeMs;
  }
  assert.ok(formedTimeMs !== null && formedTimeMs < BUILD_MS, 'the tile settles well before the overall build completes');

  // Scan forward (still mid-build) for an observable glitch burst on that same, already-formed tile.
  let preBuildBurstTimeMs: number | null = null;
  for (let t = formedTimeMs!; t < BUILD_MS && preBuildBurstTimeMs === null; t += 20) {
    const plan = buildSeed33Construction({ timeMs: t, buildMs: BUILD_MS, seed: 33, reducedMotion: false, showTiles: true, manifest: MANIFEST });
    if (plan.commands.some((command) => command.id.startsWith(`tile:${region.id}:glitch-`))) preBuildBurstTimeMs = t;
  }
  assert.ok(preBuildBurstTimeMs !== null, 'a post-formation glitch burst is observable before the overall build ends');

  // Backend reuse: the construction-build glitch commands for that instant are exactly what calling
  // formedTileGlitchPatches directly (as the settled renderers do, with no drift anchor pre-build)
  // produces for the same (region, index, seed, timeMs) — the shared planner, not a duplicated algorithm.
  const plan = buildSeed33Construction({ timeMs: preBuildBurstTimeMs!, buildMs: BUILD_MS, seed: 33, reducedMotion: false, showTiles: true, manifest: MANIFEST });
  const constructionGlitch = plan.commands.filter(
    (command): command is ConstructionPatch => command.kind === 'texture' && command.id.startsWith(`tile:${region.id}:glitch-`),
  );
  const direct = formedTileGlitchPatches({ region, atlasSizePx: MANIFEST.tilesAtlasSizePx, index: 0, timeMs: preBuildBurstTimeMs!, seed: 33 });
  assert.deepEqual(constructionGlitch, direct, 'the construction-build overlay is exactly the shared planner, reused unmodified');

  // Continues past build completion: the exact same function, called well beyond buildMs the way the
  // settled Canvas2D/WebGL2 renderers call it, still produces bursts (no "stops once fully built" cliff).
  let postBuildBurstSeen = false;
  for (let t = BUILD_MS; t < BUILD_MS + 6400 && !postBuildBurstSeen; t += 20) {
    if (formedTileGlitchPatches({ region, atlasSizePx: MANIFEST.tilesAtlasSizePx, index: 0, timeMs: t, seed: 33 }).length > 0) postBuildBurstSeen = true;
  }
  assert.ok(postBuildBurstSeen, 'post-formation glitch activity continues well beyond the overall 12s build');
});

test('reduced motion and hidden tiles suppress every glitch command immediately, through the existing construction-level gates', () => {
  for (const timeMs of [BUILD_MS * 0.6, BUILD_MS * 0.9, BUILD_MS, BUILD_MS + 4000]) {
    const reduced = buildSeed33Construction({ timeMs, buildMs: BUILD_MS, seed: 33, reducedMotion: true, showTiles: true, manifest: MANIFEST });
    assert.equal(reduced.commands.some((command) => command.id.includes(':glitch-')), false, `reduced motion at ${timeMs}ms: no glitch command leaks`);

    const hidden = buildSeed33Construction({ timeMs, buildMs: BUILD_MS, seed: 33, reducedMotion: false, showTiles: false, manifest: MANIFEST });
    assert.equal(hidden.commands.some((command) => command.id.includes(':glitch-')), false, `hidden tiles at ${timeMs}ms: no glitch command leaks`);
  }
});
