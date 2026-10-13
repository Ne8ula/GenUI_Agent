import type {
  ConstructionPatch,
  ConstructionPoint,
  ConstructionSolid,
  ConstructionTextureVertex,
} from './constructionTypes.ts';

export const MAX_MATRIX_MATERIAL_PATCHES = 128;
export const MAX_MATRIX_SOLID_TRIANGLES = 4;

const HOLD_MS = 300;
const EPSILON = 1e-10;
// The scene has 59 source triangles; retain one complete geometry set without per-frame eviction.
const CLIP_TEMPLATE_CACHE_LIMIT = 96;

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

interface ClipPoint {
  readonly x: number;
  readonly y: number;
}

type Barycentric = readonly [number, number, number];
type ClipTriangle = readonly [Barycentric, Barycentric, Barycentric];

interface ClipCellTemplate {
  readonly row: number;
  readonly column: number;
  readonly triangles: readonly ClipTriangle[];
}

const clipTemplateCache = new Map<string, readonly ClipCellTemplate[]>();

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function triangleDoubleArea(a: ClipPoint, b: ClipPoint, c: ClipPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointDoubleArea(a: ConstructionPoint, b: ConstructionPoint, c: ConstructionPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function finiteUnit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validTextureVertex(vertex: ConstructionTextureVertex | undefined): vertex is ConstructionTextureVertex {
  return vertex !== undefined
    && finiteUnit(vertex.x)
    && finiteUnit(vertex.y)
    && finiteUnit(vertex.u)
    && finiteUnit(vertex.v);
}

function validPoint(point: ConstructionPoint | undefined): point is ConstructionPoint {
  return point !== undefined && finiteUnit(point[0]) && finiteUnit(point[1]);
}

function validColour(colour: readonly number[] | undefined): boolean {
  return colour !== undefined && colour.length === 3 && colour.every(finiteUnit);
}

function validPatch(patch: ConstructionPatch | undefined): patch is ConstructionPatch {
  if (patch === undefined
    || patch.kind !== 'texture'
    || typeof patch.id !== 'string'
    || typeof patch.component !== 'string'
    || !finiteUnit(patch.alpha)
    || patch.vertices.length !== 3
    || !patch.vertices.every(validTextureVertex)) return false;

  const [a, b, c] = patch.vertices;
  return Math.abs(triangleDoubleArea(a, b, c)) > EPSILON
    && Math.abs(pointDoubleArea([a.u, a.v], [b.u, b.v], [c.u, c.v])) > EPSILON;
}

function validSolid(solid: ConstructionSolid | undefined): solid is ConstructionSolid {
  if (solid === undefined
    || solid.kind !== 'solid'
    || typeof solid.id !== 'string'
    || typeof solid.component !== 'string'
    || !finiteUnit(solid.alpha)
    || solid.points.length !== 3
    || !solid.points.every(validPoint)
    || !validColour(solid.colour)) return false;

  const [a, b, c] = solid.points;
  return Math.abs(pointDoubleArea(a, b, c)) > EPSILON;
}

function stringHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mixHash(index: number, seed: number): number {
  let value = (index ^ seed ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function hashUnit(index: number, seed: number): number {
  return (mixHash(index, seed) + 0.5) / 0x1_0000_0000;
}

function quantizedPhase(timeMs: number, seed: number, id: string): number {
  const safeTime = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  const componentOffset = mixHash(stringHash(id), seed) % 17;
  return Math.floor(safeTime / HOLD_MS) + componentOffset;
}

function samePoint(a: ClipPoint, b: ClipPoint): boolean {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function deduplicatePolygon(points: readonly ClipPoint[]): ClipPoint[] {
  const result: ClipPoint[] = [];
  for (const point of points) {
    if (result.length === 0 || !samePoint(result[result.length - 1]!, point)) result.push(point);
  }
  if (result.length > 1 && samePoint(result[0]!, result[result.length - 1]!)) result.pop();
  return result;
}

function clipPolygon(
  polygon: readonly ClipPoint[],
  axis: 'x' | 'y',
  boundary: number,
  keepGreater: boolean,
): ClipPoint[] {
  if (polygon.length === 0) return [];
  const output: ClipPoint[] = [];
  const inside = (point: ClipPoint): boolean => keepGreater
    ? point[axis] >= boundary - EPSILON
    : point[axis] <= boundary + EPSILON;

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    const currentInside = inside(current);
    const previousInside = inside(previous);

    if (currentInside !== previousInside) {
      const delta = current[axis] - previous[axis];
      if (Math.abs(delta) > EPSILON) {
        const amount = clamp01((boundary - previous[axis]) / delta);
        output.push({
          x: axis === 'x' ? boundary : previous.x + (current.x - previous.x) * amount,
          y: axis === 'y' ? boundary : previous.y + (current.y - previous.y) * amount,
        });
      }
    }
    if (currentInside) output.push(current);
  }

  return deduplicatePolygon(output);
}

function clipTriangleToCell(
  triangle: readonly [ClipPoint, ClipPoint, ClipPoint],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): ClipPoint[] {
  let polygon: readonly ClipPoint[] = triangle;
  polygon = clipPolygon(polygon, 'x', x0, true);
  polygon = clipPolygon(polygon, 'x', x1, false);
  polygon = clipPolygon(polygon, 'y', y0, true);
  polygon = clipPolygon(polygon, 'y', y1, false);
  return deduplicatePolygon(polygon);
}

function barycentricAt(
  point: ClipPoint,
  triangle: readonly [ClipPoint, ClipPoint, ClipPoint],
): Barycentric | null {
  const [a, b, c] = triangle;
  const denominator = triangleDoubleArea(a, b, c);
  if (Math.abs(denominator) <= EPSILON) return null;

  const first = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator;
  const second = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator;
  const third = 1 - first - second;
  const weights = [first, second, third].map((weight) => {
    if (Math.abs(weight) <= EPSILON) return 0;
    if (Math.abs(1 - weight) <= EPSILON) return 1;
    return clamp01(weight);
  });
  const total = weights[0]! + weights[1]! + weights[2]!;
  if (!(total > EPSILON)) return null;
  return Object.freeze([
    weights[0]! / total,
    weights[1]! / total,
    weights[2]! / total,
  ]) as Barycentric;
}

function buildClipCells(
  triangle: readonly [ClipPoint, ClipPoint, ClipPoint],
  columns: number,
  rows: number,
): readonly ClipCellTemplate[] {
  const minimumX = Math.min(triangle[0].x, triangle[1].x, triangle[2].x);
  const maximumX = Math.max(triangle[0].x, triangle[1].x, triangle[2].x);
  const minimumY = Math.min(triangle[0].y, triangle[1].y, triangle[2].y);
  const maximumY = Math.max(triangle[0].y, triangle[1].y, triangle[2].y);
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  if (!(width > EPSILON && height > EPSILON)) return [];

  const cells: ClipCellTemplate[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y0 = minimumY + height * (row / rows);
    const y1 = row === rows - 1 ? maximumY : minimumY + height * ((row + 1) / rows);
    for (let column = 0; column < columns; column += 1) {
      const x0 = minimumX + width * (column / columns);
      const x1 = column === columns - 1 ? maximumX : minimumX + width * ((column + 1) / columns);
      const polygon = clipTriangleToCell(triangle, x0, y0, x1, y1);
      if (polygon.length < 3) continue;

      const triangles: ClipTriangle[] = [];
      for (let pointIndex = 1; pointIndex + 1 < polygon.length; pointIndex += 1) {
        const firstPoint = polygon[0]!;
        const secondPoint = polygon[pointIndex]!;
        const thirdPoint = polygon[pointIndex + 1]!;
        if (Math.abs(triangleDoubleArea(firstPoint, secondPoint, thirdPoint)) <= EPSILON) continue;
        const first = barycentricAt(firstPoint, triangle);
        const second = barycentricAt(secondPoint, triangle);
        const third = barycentricAt(thirdPoint, triangle);
        if (first !== null && second !== null && third !== null) {
          triangles.push(Object.freeze([first, second, third]) as ClipTriangle);
        }
      }
      if (triangles.length > 0) {
        cells.push(Object.freeze({ row, column, triangles: Object.freeze(triangles) }));
      }
    }
  }
  return Object.freeze(cells);
}

function clipTemplateKey(vertices: readonly ConstructionTextureVertex[]): string {
  return vertices.map((vertex) => `${vertex.x},${vertex.y}`).join('|');
}

function clipCellsFor(patch: ConstructionPatch): readonly ClipCellTemplate[] {
  const key = clipTemplateKey(patch.vertices);
  const cached = clipTemplateCache.get(key);
  if (cached !== undefined) {
    clipTemplateCache.delete(key);
    clipTemplateCache.set(key, cached);
    return cached;
  }

  const triangle = patch.vertices.map(({ x, y }) => ({ x, y })) as [ClipPoint, ClipPoint, ClipPoint];
  const grids = [[10, 8], [8, 6], [6, 5], [4, 4]] as const;
  let selected: readonly ClipCellTemplate[] = [];
  for (const [columns, rows] of grids) {
    const candidate = buildClipCells(triangle, columns, rows);
    const triangleCount = candidate.reduce((count, cell) => count + cell.triangles.length, 0);
    if (triangleCount > 0 && triangleCount <= MAX_MATRIX_MATERIAL_PATCHES) {
      selected = candidate;
      break;
    }
  }

  clipTemplateCache.set(key, selected);
  if (clipTemplateCache.size > CLIP_TEMPLATE_CACHE_LIMIT) {
    const oldest = clipTemplateCache.keys().next().value as string | undefined;
    if (oldest !== undefined) clipTemplateCache.delete(oldest);
  }
  return selected;
}

function orderedCells(
  cells: readonly ClipCellTemplate[],
  seed: number,
  id: string,
): ClipCellTemplate[] {
  const parentHash = mixHash(stringHash(id), seed);
  const xOffset = parentHash & 3;
  const yOffset = (parentHash >>> 2) & 3;
  return [...cells].sort((left, right) => {
    const leftBayer = BAYER_4[(left.row + yOffset) & 3]![(left.column + xOffset) & 3]! / 16;
    const rightBayer = BAYER_4[(right.row + yOffset) & 3]![(right.column + xOffset) & 3]! / 16;
    const leftIndex = left.row * 257 + left.column;
    const rightIndex = right.row * 257 + right.column;
    const leftBand = ((left.row * 5 + left.column * 3 + (parentHash & 7)) % 11) / 11;
    const rightBand = ((right.row * 5 + right.column * 3 + (parentHash & 7)) % 11) / 11;
    const leftScore = leftBayer * 0.62 + hashUnit(leftIndex, parentHash) * 0.28 + leftBand * 0.1;
    const rightScore = rightBayer * 0.62 + hashUnit(rightIndex, parentHash) * 0.28 + rightBand * 0.1;
    return leftScore - rightScore || left.row - right.row || left.column - right.column;
  });
}

function activeCells(
  cells: readonly ClipCellTemplate[],
  progress: number,
  phase: number,
  seed: number,
  id: string,
): ReadonlySet<ClipCellTemplate> {
  if (cells.length <= 1) return new Set(cells);
  const order = orderedCells(cells, seed, id);
  const target = Math.max(1, Math.min(cells.length - 1, Math.ceil(progress * cells.length)));
  const selected = new Set(order.slice(0, target));

  // One bounded fringe substitution per hold creates a readable local bit/scanline change without
  // turning the complete surface into random static. The number of occupied cells remains progress-led.
  const removableSpan = Math.min(target, 4);
  const unselectedSpan = cells.length - target;
  const remove = order[target - 1 - (phase % removableSpan)]!;
  const add = order[target + (phase % unselectedSpan)]!;
  selected.delete(remove);
  selected.add(add);
  return selected;
}

function interpolateVertex(
  vertices: readonly [ConstructionTextureVertex, ConstructionTextureVertex, ConstructionTextureVertex],
  weights: Barycentric,
): ConstructionTextureVertex {
  return {
    x: clamp01(vertices[0].x * weights[0] + vertices[1].x * weights[1] + vertices[2].x * weights[2]),
    y: clamp01(vertices[0].y * weights[0] + vertices[1].y * weights[1] + vertices[2].y * weights[2]),
    u: clamp01(vertices[0].u * weights[0] + vertices[1].u * weights[1] + vertices[2].u * weights[2]),
    v: clamp01(vertices[0].v * weights[0] + vertices[1].v * weights[1] + vertices[2].v * weights[2]),
  };
}

export function matrixMaterialPatches(input: {
  patch: ConstructionPatch;
  localProgress: number;
  timeMs: number;
  seed: number;
}): readonly ConstructionPatch[] {
  const progress = Number.isFinite(input?.localProgress) ? clamp01(input.localProgress) : 0;
  if (progress <= 0 || !validPatch(input?.patch)) return [];
  const patch = input.patch;
  if (progress >= 1) return [patch];

  const cells = clipCellsFor(patch);
  if (cells.length === 0) return [];
  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed) >>> 0 : 0;
  const phase = quantizedPhase(input.timeMs, seed, patch.id);
  const selected = activeCells(cells, progress, phase, seed, patch.id);
  const output: ConstructionPatch[] = [];

  for (const cell of cells) {
    if (!selected.has(cell)) continue;
    for (let triangleIndex = 0; triangleIndex < cell.triangles.length; triangleIndex += 1) {
      const triangle = cell.triangles[triangleIndex]!;
      output.push({
        kind: 'texture',
        id: `${patch.id}:bit-r${cell.row}-c${cell.column}-t${triangleIndex}`,
        component: patch.component,
        alpha: patch.alpha,
        texture: patch.texture,
        vertices: [
          interpolateVertex(patch.vertices, triangle[0]),
          interpolateVertex(patch.vertices, triangle[1]),
          interpolateVertex(patch.vertices, triangle[2]),
        ],
      });
    }
  }
  return output;
}

function midpoint(a: ConstructionPoint, b: ConstructionPoint): ConstructionPoint {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function matrixSolidCommands(input: {
  solid: ConstructionSolid;
  localProgress: number;
  timeMs: number;
  seed: number;
}): readonly ConstructionSolid[] {
  const progress = Number.isFinite(input?.localProgress) ? clamp01(input.localProgress) : 0;
  if (progress <= 0 || !validSolid(input?.solid)) return [];
  const solid = input.solid;
  if (progress >= 1) return [solid];

  const [a, b, c] = solid.points;
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const ca = midpoint(c, a);
  const cells = [
    [a, ab, ca],
    [ab, b, bc],
    [ca, bc, c],
    [ab, bc, ca],
  ] as const;
  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed) >>> 0 : 0;
  const phase = quantizedPhase(input.timeMs, seed, solid.id);
  const parentHash = mixHash(stringHash(solid.id), seed);
  const direction = (parentHash & 1) === 0 ? 1 : 3;
  const start = (parentHash + phase) & 3;
  const count = Math.max(1, Math.min(MAX_MATRIX_SOLID_TRIANGLES - 1, Math.ceil(progress * 3)));
  const selected = new Set<number>();
  for (let index = 0; index < count; index += 1) selected.add((start + index * direction) & 3);

  const output: ConstructionSolid[] = [];
  for (let index = 0; index < cells.length; index += 1) {
    if (!selected.has(index)) continue;
    output.push({
      kind: 'solid',
      id: `${solid.id}:bit-${index}`,
      component: solid.component,
      alpha: solid.alpha,
      points: cells[index]!,
      colour: solid.colour,
    });
  }
  return output;
}
