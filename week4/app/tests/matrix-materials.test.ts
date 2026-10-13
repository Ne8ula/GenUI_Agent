import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_MATRIX_MATERIAL_PATCHES,
  MAX_MATRIX_SOLID_TRIANGLES,
  matrixMaterialPatches,
  matrixSolidCommands,
} from '../src/scene/matrixMaterials.ts';
import type {
  ConstructionPatch,
  ConstructionPoint,
  ConstructionSolid,
} from '../src/scene/constructionTypes.ts';

const EPSILON = 1e-9;

type Triangle = readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint];

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

const SOURCE_PATCH = deepFreeze({
  kind: 'texture',
  id: 'foreground:table-panel-7',
  component: 'foreground:table',
  alpha: 0.83,
  texture: 'foreground',
  vertices: [
    { x: 0.18, y: 0.16, u: 0.07, v: 0.11 },
    { x: 0.82, y: 0.24, u: 0.89, v: 0.16 },
    { x: 0.31, y: 0.86, u: 0.22, v: 0.93 },
  ],
} satisfies ConstructionPatch);

const SOURCE_SOLID = deepFreeze({
  kind: 'solid',
  id: 'figure:volume:torso:triangle-3',
  component: 'figure:volume',
  alpha: 0.74,
  colour: [0.61, 0.39, 0.27],
  points: [
    [0.33, 0.28],
    [0.58, 0.31],
    [0.47, 0.73],
  ],
} satisfies ConstructionSolid);

function triangleArea(points: Triangle): number {
  const [a, b, c] = points;
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
}

function patchDestinationTriangle(patch: ConstructionPatch): Triangle {
  const [a, b, c] = patch.vertices;
  return [[a.x, a.y], [b.x, b.y], [c.x, c.y]];
}

function patchSourceTriangle(patch: ConstructionPatch): Triangle {
  const [a, b, c] = patch.vertices;
  return [[a.u, a.v], [b.u, b.v], [c.u, c.v]];
}

function barycentricWeights(point: ConstructionPoint, triangle: Triangle): readonly [number, number, number] {
  const [a, b, c] = triangle;
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  assert.ok(Math.abs(denominator) > EPSILON, 'source triangle is nondegenerate');
  const wa = ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / denominator;
  const wb = ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / denominator;
  return [wa, wb, 1 - wa - wb];
}

function expectedUvAt(point: ConstructionPoint): ConstructionPoint {
  const destination = patchDestinationTriangle(SOURCE_PATCH);
  const source = patchSourceTriangle(SOURCE_PATCH);
  const weights = barycentricWeights(point, destination);
  return [
    weights[0] * source[0][0] + weights[1] * source[1][0] + weights[2] * source[2][0],
    weights[0] * source[0][1] + weights[1] * source[1][1] + weights[2] * source[2][1],
  ];
}

function assertPointInside(point: ConstructionPoint, parent: Triangle, label: string): void {
  const weights = barycentricWeights(point, parent);
  for (const weight of weights) {
    assert.ok(weight >= -EPSILON && weight <= 1 + EPSILON, `${label}: point remains inside its source triangle`);
  }
}

function assertFiniteUnit(value: number, label: string): void {
  assert.ok(Number.isFinite(value), `${label}: finite`);
  assert.ok(value >= 0 && value <= 1, `${label}: normalised`);
}

function patchGeometrySignature(commands: readonly ConstructionPatch[]): string {
  return JSON.stringify(commands.map((command) => ({
    alpha: command.alpha,
    texture: command.texture,
    vertices: command.vertices,
  })));
}

function solidGeometrySignature(commands: readonly ConstructionSolid[]): string {
  return JSON.stringify(commands.map((command) => ({
    alpha: command.alpha,
    colour: command.colour,
    points: command.points,
  })));
}

function assertQuantizedHoldsAndChanges(generateSignature: (timeMs: number) => string, label: string): void {
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
  assert.ok(longestHoldMs >= 150, `${label}: a geometry state holds long enough to read (${longestHoldMs}ms observed)`);
  assert.ok(new Set(signatures).size >= 2, `${label}: a later hold changes visible geometry or occupancy, not only ids`);
}

test('matrix material boundaries are empty, exact at completion, immutable, and safely reject degenerate input', () => {
  assert.equal(MAX_MATRIX_MATERIAL_PATCHES, 128);
  assert.equal(MAX_MATRIX_SOLID_TRIANGLES, 4);

  assert.deepEqual(matrixMaterialPatches({ patch: SOURCE_PATCH, localProgress: 0, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixMaterialPatches({ patch: SOURCE_PATCH, localProgress: -0.2, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixSolidCommands({ solid: SOURCE_SOLID, localProgress: 0, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixSolidCommands({ solid: SOURCE_SOLID, localProgress: Number.NaN, timeMs: 600, seed: 33 }), []);

  const completePatch = matrixMaterialPatches({ patch: SOURCE_PATCH, localProgress: 1, timeMs: 901, seed: 33 });
  assert.equal(completePatch.length, 1);
  assert.strictEqual(completePatch[0], SOURCE_PATCH, 'completion returns the exact registered source patch');
  const completeSolid = matrixSolidCommands({ solid: SOURCE_SOLID, localProgress: 1.4, timeMs: 901, seed: 33 });
  assert.equal(completeSolid.length, 1);
  assert.strictEqual(completeSolid[0], SOURCE_SOLID, 'completion returns the exact source-colour solid');

  const degeneratePatch = {
    ...SOURCE_PATCH,
    vertices: [
      { x: 0.2, y: 0.2, u: 0.1, v: 0.1 },
      { x: 0.4, y: 0.4, u: 0.3, v: 0.3 },
      { x: 0.6, y: 0.6, u: 0.5, v: 0.5 },
    ],
  } satisfies ConstructionPatch;
  const degenerateSolid = {
    ...SOURCE_SOLID,
    points: [[0.2, 0.2], [0.4, 0.4], [0.6, 0.6]],
  } satisfies ConstructionSolid;
  const degenerateSourcePatch = {
    ...SOURCE_PATCH,
    vertices: [
      { ...SOURCE_PATCH.vertices[0], u: 0.1, v: 0.1 },
      { ...SOURCE_PATCH.vertices[1], u: 0.3, v: 0.3 },
      { ...SOURCE_PATCH.vertices[2], u: 0.5, v: 0.5 },
    ],
  } satisfies ConstructionPatch;
  const nonFinitePatch = {
    ...SOURCE_PATCH,
    vertices: [SOURCE_PATCH.vertices[0], { ...SOURCE_PATCH.vertices[1], x: Number.NaN }, SOURCE_PATCH.vertices[2]],
  } satisfies ConstructionPatch;
  assert.deepEqual(matrixMaterialPatches({ patch: degeneratePatch, localProgress: 0.5, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixMaterialPatches({ patch: degenerateSourcePatch, localProgress: 0.5, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixMaterialPatches({ patch: nonFinitePatch, localProgress: 0.5, timeMs: 600, seed: 33 }), []);
  assert.deepEqual(matrixSolidCommands({ solid: degenerateSolid, localProgress: 0.5, timeMs: 600, seed: 33 }), []);

  assert.deepEqual(SOURCE_PATCH.vertices, [
    { x: 0.18, y: 0.16, u: 0.07, v: 0.11 },
    { x: 0.82, y: 0.24, u: 0.89, v: 0.16 },
    { x: 0.31, y: 0.86, u: 0.22, v: 0.93 },
  ]);
  assert.deepEqual(SOURCE_SOLID.points, [[0.33, 0.28], [0.58, 0.31], [0.47, 0.73]]);
});

test('partial texture material is bounded sparse occupancy with exact affine UV sampling and no flash command', () => {
  const output = matrixMaterialPatches({ patch: SOURCE_PATCH, localProgress: 0.55, timeMs: 725, seed: 33 });
  assert.ok(output.length > 0 && output.length <= MAX_MATRIX_MATERIAL_PATCHES);
  assert.equal(new Set(output.map((patch) => patch.id)).size, output.length, 'derived command ids are unique');

  const parentDestination = patchDestinationTriangle(SOURCE_PATCH);
  const parentArea = triangleArea(parentDestination);
  let occupiedArea = 0;
  for (const patch of output) {
    assert.equal(patch.kind, 'texture');
    assert.equal(patch.texture, SOURCE_PATCH.texture, 'source texture identity is preserved');
    assert.equal(patch.alpha, SOURCE_PATCH.alpha, 'occupancy is geometric, not a whole-patch alpha fade');
    assert.ok(patch.id.startsWith(`${SOURCE_PATCH.id}:bit-`));
    assert.ok(patch.component.startsWith(SOURCE_PATCH.component));
    const destination = patchDestinationTriangle(patch);
    const source = patchSourceTriangle(patch);
    const area = triangleArea(destination);
    assert.ok(area > EPSILON, `${patch.id}: nondegenerate destination`);
    assert.ok(triangleArea(source) > EPSILON, `${patch.id}: nondegenerate source crop`);
    occupiedArea += area;
    for (const vertex of patch.vertices) {
      for (const [value, label] of [[vertex.x, 'x'], [vertex.y, 'y'], [vertex.u, 'u'], [vertex.v, 'v']] as const) {
        assertFiniteUnit(value, `${patch.id}:${label}`);
      }
      assertPointInside([vertex.x, vertex.y], parentDestination, patch.id);
      const expected = expectedUvAt([vertex.x, vertex.y]);
      assert.ok(Math.abs(vertex.u - expected[0]) <= 1e-8, `${patch.id}: u follows the parent affine crop`);
      assert.ok(Math.abs(vertex.v - expected[1]) <= 1e-8, `${patch.id}: v follows the parent affine crop`);
    }
  }
  assert.ok(occupiedArea > EPSILON && occupiedArea < parentArea - EPSILON, 'mid-build material occupies real cells but not the full source triangle');
});

test('partial solid material preserves its warm colour and remains local, sparse, finite, and capped', () => {
  const output = matrixSolidCommands({ solid: SOURCE_SOLID, localProgress: 0.55, timeMs: 725, seed: 33 });
  assert.ok(output.length > 0 && output.length <= MAX_MATRIX_SOLID_TRIANGLES);
  assert.equal(new Set(output.map((solid) => solid.id)).size, output.length);

  const parentArea = triangleArea(SOURCE_SOLID.points);
  let occupiedArea = 0;
  for (const solid of output) {
    assert.equal(solid.kind, 'solid');
    assert.deepEqual(solid.colour, SOURCE_SOLID.colour, 'the source solid colour is preserved');
    assert.equal(solid.alpha, SOURCE_SOLID.alpha, 'solid occupancy does not become a whole-triangle fade');
    assert.ok(solid.id.startsWith(`${SOURCE_SOLID.id}:bit-`));
    assert.ok(solid.component.startsWith(SOURCE_SOLID.component));
    const area = triangleArea(solid.points);
    assert.ok(area > EPSILON, `${solid.id}: nondegenerate local solid`);
    occupiedArea += area;
    for (const point of solid.points) {
      assertFiniteUnit(point[0], `${solid.id}:x`);
      assertFiniteUnit(point[1], `${solid.id}:y`);
      assertPointInside(point, SOURCE_SOLID.points, solid.id);
    }
  }
  assert.ok(occupiedArea > EPSILON && occupiedArea < parentArea - EPSILON, 'mid-build solid occupancy is visible without filling or flashing the whole parent');
});

test('material and solid patterns are deterministic, quantized into readable holds, and later change visibly', () => {
  const patchInput = { patch: SOURCE_PATCH, localProgress: 0.57, seed: 91 } as const;
  const solidInput = { solid: SOURCE_SOLID, localProgress: 0.57, seed: 91 } as const;
  assert.deepEqual(
    matrixMaterialPatches({ ...patchInput, timeMs: 777 }),
    matrixMaterialPatches({ ...patchInput, timeMs: 777 }),
  );
  assert.deepEqual(
    matrixSolidCommands({ ...solidInput, timeMs: 777 }),
    matrixSolidCommands({ ...solidInput, timeMs: 777 }),
  );

  assertQuantizedHoldsAndChanges(
    (timeMs) => patchGeometrySignature(matrixMaterialPatches({ ...patchInput, timeMs })),
    'texture material',
  );
  assertQuantizedHoldsAndChanges(
    (timeMs) => solidGeometrySignature(matrixSolidCommands({ ...solidInput, timeMs })),
    'solid material',
  );
});
