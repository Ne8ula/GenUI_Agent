import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_MATRIX_TILE_PATCHES, matrixTilePatches } from '../src/scene/matrixTiles.ts';
import type { ConstructionPatch, ConstructionPoint } from '../src/scene/constructionTypes.ts';
import type { PhotoTileRegion } from '../src/scene/types.ts';

const EPSILON = 1e-9;
const MAX_OFFSET_X = 6 / 1920;
const MAX_OFFSET_Y = 6 / 1080;
const ATLAS_SIZE = Object.freeze([1000, 500] as const);
const REGION = Object.freeze({
  id: 'right-scanlines',
  group: 'right',
  rectNorm: Object.freeze([0.24, 0.2, 0.32, 0.28] as const),
  sourceBoxPx: Object.freeze([120, 80, 760, 360] as const),
} satisfies PhotoTileRegion);

type Triangle = readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint];

function destinationTriangle(patch: ConstructionPatch): Triangle {
  const [a, b, c] = patch.vertices;
  return [[a.x, a.y], [b.x, b.y], [c.x, c.y]];
}

function sourceTriangle(patch: ConstructionPatch): Triangle {
  const [a, b, c] = patch.vertices;
  return [[a.u, a.v], [b.u, b.v], [c.u, c.v]];
}

function triangleArea(points: Triangle): number {
  const [a, b, c] = points;
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

function pointInTriangle(point: ConstructionPoint, triangle: Triangle): boolean {
  const [a, b, c] = triangle;
  const sign = (p: ConstructionPoint, q: ConstructionPoint, r: ConstructionPoint): number =>
    (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  return !((d1 < -EPSILON || d2 < -EPSILON || d3 < -EPSILON)
    && (d1 > EPSILON || d2 > EPSILON || d3 > EPSILON));
}

function expectedDestination(u: number, v: number): ConstructionPoint {
  const [x, y, width, height] = REGION.rectNorm;
  const [sourceX0, sourceY0, sourceX1, sourceY1] = REGION.sourceBoxPx;
  return [
    x + ((u * ATLAS_SIZE[0] - sourceX0) / (sourceX1 - sourceX0)) * width,
    y + ((v * ATLAS_SIZE[1] - sourceY0) / (sourceY1 - sourceY0)) * height,
  ];
}

function geometrySignature(commands: readonly ConstructionPatch[]): string {
  return JSON.stringify(commands.map((command) => ({
    alpha: command.alpha,
    texture: command.texture,
    vertices: command.vertices,
  })));
}

function assertQuantizedHoldsAndChanges(generateSignature: (timeMs: number) => string): void {
  const stepMs = 25;
  const signatures: string[] = [];
  for (let timeMs = 0; timeMs <= 2400; timeMs += stepMs) signatures.push(generateSignature(timeMs));

  let longestHoldMs = 0;
  let runSamples = 1;
  for (let index = 1; index < signatures.length; index += 1) {
    if (signatures[index] === signatures[index - 1]) {
      runSamples += 1;
      longestHoldMs = Math.max(longestHoldMs, (runSamples - 1) * stepMs);
    } else {
      runSamples = 1;
    }
  }
  assert.ok(longestHoldMs >= 150, `a local box pattern holds long enough to read (${longestHoldMs}ms observed)`);
  assert.ok(new Set(signatures).size >= 2, 'a later hold visibly changes occupancy/offsets rather than only ids');
}

function assertFiniteUnit(value: number, label: string): void {
  assert.ok(Number.isFinite(value), `${label}: finite`);
  assert.ok(value >= 0 && value <= 1, `${label}: clipped to normalised bounds`);
}

function assertSourceOccupancyIsPartial(patches: readonly ConstructionPatch[]): void {
  const [sourceX0, sourceY0, sourceX1, sourceY1] = REGION.sourceBoxPx;
  const u0 = sourceX0 / ATLAS_SIZE[0];
  const v0 = sourceY0 / ATLAS_SIZE[1];
  const u1 = sourceX1 / ATLAS_SIZE[0];
  const v1 = sourceY1 / ATLAS_SIZE[1];
  const sourceTriangles = patches.map(sourceTriangle);
  let covered = 0;
  const columns = 41;
  const rows = 31;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point: ConstructionPoint = [
        u0 + ((column + 0.371) / columns) * (u1 - u0),
        v0 + ((row + 0.619) / rows) * (v1 - v0),
      ];
      if (sourceTriangles.some((triangle) => pointInTriangle(point, triangle))) covered += 1;
    }
  }
  assert.ok(covered > 0, 'partial tile exposes real source-colour cells');
  assert.ok(covered < columns * rows, 'partial tile leaves source cells absent instead of fading a full box');
}

test('tile helper has exact empty/completion behavior, preserves input data, and rejects finite degeneracies', () => {
  assert.equal(MAX_MATRIX_TILE_PATCHES, 64);
  assert.deepEqual(matrixTilePatches({ region: REGION, atlasSizePx: ATLAS_SIZE, index: 4, localProgress: 0, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixTilePatches({ region: REGION, atlasSizePx: ATLAS_SIZE, index: 4, localProgress: -0.2, timeMs: 600, seed: 33 }), []);

  const completed = matrixTilePatches({ region: REGION, atlasSizePx: ATLAS_SIZE, index: 4, localProgress: 1, timeMs: 600, seed: 33 });
  assert.equal(completed.length, 2, 'completion is exactly the two source-registered rect triangles');
  const [x, y, width, height] = REGION.rectNorm;
  const [sourceX0, sourceY0, sourceX1, sourceY1] = REGION.sourceBoxPx;
  const expectedDestinationCorners = new Set([
    `${x},${y}`,
    `${x + width},${y}`,
    `${x + width},${y + height}`,
    `${x},${y + height}`,
  ]);
  const expectedSourceCorners = new Set([
    `${sourceX0 / ATLAS_SIZE[0]},${sourceY0 / ATLAS_SIZE[1]}`,
    `${sourceX1 / ATLAS_SIZE[0]},${sourceY0 / ATLAS_SIZE[1]}`,
    `${sourceX1 / ATLAS_SIZE[0]},${sourceY1 / ATLAS_SIZE[1]}`,
    `${sourceX0 / ATLAS_SIZE[0]},${sourceY1 / ATLAS_SIZE[1]}`,
  ]);
  const actualDestinationCorners = new Set(completed.flatMap((patch) => patch.vertices.map((vertex) => `${vertex.x},${vertex.y}`)));
  const actualSourceCorners = new Set(completed.flatMap((patch) => patch.vertices.map((vertex) => `${vertex.u},${vertex.v}`)));
  assert.deepEqual(actualDestinationCorners, expectedDestinationCorners);
  assert.deepEqual(actualSourceCorners, expectedSourceCorners);
  assert.ok(Math.abs(completed.reduce((sum, patch) => sum + triangleArea(destinationTriangle(patch)), 0) - width * height) <= EPSILON);
  assert.ok(Math.abs(completed.reduce((sum, patch) => sum + triangleArea(sourceTriangle(patch)), 0)
    - ((sourceX1 - sourceX0) / ATLAS_SIZE[0]) * ((sourceY1 - sourceY0) / ATLAS_SIZE[1])) <= EPSILON);
  for (const patch of completed) {
    assert.equal(patch.kind, 'texture');
    assert.equal(patch.texture, 'tiles');
    assert.equal(patch.alpha, 1);
    assert.ok(patch.id.startsWith(`tile:${REGION.id}:`));
    for (const vertex of patch.vertices) {
      const expected = expectedDestination(vertex.u, vertex.v);
      assert.ok(Math.abs(vertex.x - expected[0]) <= EPSILON && Math.abs(vertex.y - expected[1]) <= EPSILON, `${patch.id}: exact final crop mapping`);
    }
  }

  const degenerateRect = { ...REGION, rectNorm: [0.2, 0.2, 0, 0.3] } satisfies PhotoTileRegion;
  const degenerateCrop = { ...REGION, sourceBoxPx: [120, 80, 120, 360] } satisfies PhotoTileRegion;
  const outOfAtlasCrop = { ...REGION, sourceBoxPx: [120, 80, 1100, 360] } satisfies PhotoTileRegion;
  assert.deepEqual(matrixTilePatches({ region: degenerateRect, atlasSizePx: ATLAS_SIZE, index: 4, localProgress: 0.5, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixTilePatches({ region: degenerateCrop, atlasSizePx: ATLAS_SIZE, index: 4, localProgress: 0.5, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixTilePatches({ region: outOfAtlasCrop, atlasSizePx: ATLAS_SIZE, index: 4, localProgress: 0.5, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixTilePatches({ region: REGION, atlasSizePx: [0, 500], index: 4, localProgress: 0.5, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(REGION.rectNorm, [0.24, 0.2, 0.32, 0.28]);
  assert.deepEqual(REGION.sourceBoxPx, [120, 80, 760, 360]);
  assert.deepEqual(ATLAS_SIZE, [1000, 500]);
});

test('partial tile output is finite, cropped, genuinely sparse, locally offset, unrotated, and capped', () => {
  const output = matrixTilePatches({ region: REGION, atlasSizePx: ATLAS_SIZE, index: 4, localProgress: 0.55, timeMs: 725, seed: 33 });
  assert.ok(output.length > 0 && output.length <= MAX_MATRIX_TILE_PATCHES);
  assert.equal(new Set(output.map((patch) => patch.id)).size, output.length, 'derived tile command ids are unique');

  const [x, y, width, height] = REGION.rectNorm;
  const [sourceX0, sourceY0, sourceX1, sourceY1] = REGION.sourceBoxPx;
  const u0 = sourceX0 / ATLAS_SIZE[0];
  const v0 = sourceY0 / ATLAS_SIZE[1];
  const u1 = sourceX1 / ATLAS_SIZE[0];
  const v1 = sourceY1 / ATLAS_SIZE[1];
  let hasInternalCellBoundary = false;

  for (const patch of output) {
    assert.equal(patch.kind, 'texture');
    assert.equal(patch.texture, 'tiles', 'warm/source colour comes only from the existing tile atlas');
    assert.ok(patch.id.startsWith(`tile:${REGION.id}:`));
    assert.ok(Number.isFinite(patch.alpha) && patch.alpha > 0 && patch.alpha <= 1, `${patch.id}: local alpha is bounded`);
    assert.ok(triangleArea(destinationTriangle(patch)) > EPSILON, `${patch.id}: nondegenerate destination`);
    assert.ok(triangleArea(sourceTriangle(patch)) > EPSILON, `${patch.id}: nondegenerate source crop`);

    const offsets = patch.vertices.map((vertex): ConstructionPoint => {
      assertFiniteUnit(vertex.x, `${patch.id}:x`);
      assertFiniteUnit(vertex.y, `${patch.id}:y`);
      assert.ok(Number.isFinite(vertex.u) && vertex.u >= u0 - EPSILON && vertex.u <= u1 + EPSILON, `${patch.id}: u stays in its tile crop`);
      assert.ok(Number.isFinite(vertex.v) && vertex.v >= v0 - EPSILON && vertex.v <= v1 + EPSILON, `${patch.id}: v stays in its tile crop`);
      assert.ok(vertex.x >= x - MAX_OFFSET_X - EPSILON && vertex.x <= x + width + MAX_OFFSET_X + EPSILON, `${patch.id}: x displacement remains local`);
      assert.ok(vertex.y >= y - MAX_OFFSET_Y - EPSILON && vertex.y <= y + height + MAX_OFFSET_Y + EPSILON, `${patch.id}: y displacement remains local`);
      if ((vertex.u > u0 + EPSILON && vertex.u < u1 - EPSILON) || (vertex.v > v0 + EPSILON && vertex.v < v1 - EPSILON)) {
        hasInternalCellBoundary = true;
      }
      const base = expectedDestination(vertex.u, vertex.v);
      return [vertex.x - base[0], vertex.y - base[1]];
    });
    const referenceOffset = offsets[0];
    assert.ok(referenceOffset);
    assert.ok(Math.abs(referenceOffset[0]) <= MAX_OFFSET_X + EPSILON, `${patch.id}: horizontal jitter <= 6 CSS px`);
    assert.ok(Math.abs(referenceOffset[1]) <= MAX_OFFSET_Y + EPSILON, `${patch.id}: vertical jitter <= 6 CSS px`);
    for (const offset of offsets.slice(1)) {
      assert.ok(Math.abs(offset[0] - referenceOffset[0]) <= 1e-8, `${patch.id}: no whole-box or subcell rotation in x`);
      assert.ok(Math.abs(offset[1] - referenceOffset[1]) <= 1e-8, `${patch.id}: no whole-box or subcell rotation in y`);
    }
  }
  assert.equal(hasInternalCellBoundary, true, 'partial output contains real internal subcells/scanlines');
  assertSourceOccupancyIsPartial(output);
});

test('edge-local tile glitches clip to the frame instead of creating a full-frame flash', () => {
  const edgeRegion = {
    id: 'right-edge-test',
    group: 'right',
    rectNorm: [0.998, 0.997, 0.001, 0.002],
    sourceBoxPx: [100, 100, 300, 250],
  } satisfies PhotoTileRegion;
  const output = matrixTilePatches({ region: edgeRegion, atlasSizePx: ATLAS_SIZE, index: 8, localProgress: 0.58, timeMs: 725, seed: 33 });
  assert.ok(output.length > 0 && output.length <= MAX_MATRIX_TILE_PATCHES);
  for (const patch of output) {
    for (const vertex of patch.vertices) {
      assertFiniteUnit(vertex.x, `${patch.id}:edge-x`);
      assertFiniteUnit(vertex.y, `${patch.id}:edge-y`);
    }
  }
});

test('tile patterns are deterministic, quantized into readable holds, and later change visibly', () => {
  const input = { region: REGION, atlasSizePx: ATLAS_SIZE, index: 4, localProgress: 0.57, seed: 91 } as const;
  assert.deepEqual(matrixTilePatches({ ...input, timeMs: 777 }), matrixTilePatches({ ...input, timeMs: 777 }));
  assertQuantizedHoldsAndChanges((timeMs) => geometrySignature(matrixTilePatches({ ...input, timeMs })));
});
