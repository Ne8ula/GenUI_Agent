import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FrameRect, Sky, Tile } from '../src/scene/types.ts';
import {
  BAYER4,
  BYTES_PER_TILE_INSTANCE,
  FLOATS_PER_TILE_INSTANCE,
  PATTERN_ID,
  TILE_OFFSET_BIRTH,
  TILE_OFFSET_CELL,
  TILE_OFFSET_COLOR,
  TILE_OFFSET_PATTERN,
  TILE_OFFSET_RECT,
  bayer4Index,
  bayer4Threshold,
  cachedTriangulation,
  cellDevicePx,
  ditherValue,
  hairlineColumn,
  hairlineDeviceRect,
  packSkyTriangles,
  packTiles,
  patternCoverage,
  patternFill,
  patternPixels,
  pointInPolygon,
  polygonArea2,
  skyBottomY,
  skyClipPolygon,
  skyClipVertexCount,
  skyRgb,
  skyStops,
  skyTriangleFloats,
  SKY_FLOATS_PER_VERTEX,
  tileDeviceRect,
  triangulatePolygon,
  type PolygonPoint,
} from '../src/render/patterns.ts';
import { DITHER_HI, DITHER_LO, DOT_RADIUS, HAIRLINE_ALPHA, MIN_CELL_DEVICE_PX, SCANLINE_PX, SKY_BAND } from '../src/render/paper.ts';
import { SEED33_SKY_POLYGON } from '../src/scene/seed33.ts';

const FRAME: FrameRect = { left: 0, top: 0, width: 1920, height: 1080 };
const OFFSET_FRAME: FrameRect = { left: 37, top: 11, width: 1280, height: 720 };

function tile(over: Partial<Tile> = {}): Tile {
  return {
    id: 'tile:test/00',
    region: 3,
    x: 0.1,
    y: 0.2,
    w: 0.05,
    h: 0.08,
    pattern: 'flat',
    colour: [0.8, 0.5, 0.4],
    alpha: 0.9,
    cellPx: 6,
    hairline: 0.1,
    birthMs: 1500,
    ...over,
  };
}

test('pattern ids are stable and the arithmetic Bayer index equals the 4×4 table', () => {
  assert.deepEqual(PATTERN_ID, { transparent: 0, flat: 1, dither: 2, dotgrid: 3, scanline: 4 });
  assert.deepEqual([...BAYER4].sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i));
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      assert.equal(bayer4Index(x, y), BAYER4[(y & 3) * 4 + (x & 3)], `(${x}, ${y})`);
      const th = bayer4Threshold(x, y);
      assert.ok(th > 0 && th < 1);
    }
  }
  assert.equal(bayer4Index(0, 0), 0);
  assert.equal(bayer4Index(1, 0), 8);
  assert.equal(bayer4Index(0, 1), 12);
  assert.equal(bayer4Index(3, 3), 5);
});

test('patternCoverage: flat is 1, transparent is 0, scanline rows, dot-grid discs, dither cells', () => {
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      assert.equal(patternCoverage(PATTERN_ID.flat, x, y, 12, 12, 4), 1);
      assert.equal(patternCoverage(PATTERN_ID.transparent, x, y, 12, 12, 4), 0);
      assert.equal(patternCoverage(99, x, y, 12, 12, 4), 0);
      // Scanline: SCANLINE_PX rows on at the top of every cell, regardless of x.
      assert.equal(patternCoverage(PATTERN_ID.scanline, x, y, 12, 12, 4), y % 4 < SCANLINE_PX ? 1 : 0, `scanline (${x}, ${y})`);
    }
  }
  assert.equal(SCANLINE_PX, 2);
  // Dot grid with an 8 px cell: the cell-centre pixel is fully inside the disc, the cell corner fully outside.
  assert.equal(DOT_RADIUS, 0.3);
  assert.equal(patternCoverage(PATTERN_ID.dotgrid, 3, 3, 16, 16, 8), 1); // centre (3.5, 3.5) vs disc centre (4, 4): d = 0.71 < r − 0.5 = 1.9
  assert.equal(patternCoverage(PATTERN_ID.dotgrid, 0, 0, 16, 16, 8), 0); // corner: d = 4.95 > r + 0.5
  assert.equal(patternCoverage(PATTERN_ID.dotgrid, 11, 11, 16, 16, 8), 1); // second cell
  const edge = patternCoverage(PATTERN_ID.dotgrid, 6, 4, 16, 16, 8); // (6.5, 4.5): d = 2.55, inside the one-pixel soft band around r = 2.4
  assert.ok(edge > 0 && edge < 1, `soft edge ${edge}`);
  // Dither: whole cells, thresholded; every pixel of a cell agrees.
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const c = patternCoverage(PATTERN_ID.dither, x, y, 64, 64, 4);
      assert.ok(c === 0 || c === 1);
      assert.equal(c, patternCoverage(PATTERN_ID.dither, (x >> 2) << 2, (y >> 2) << 2, 64, 64, 4));
    }
  }
});

test('dither gradient runs from DITHER_HI at the top-left to DITHER_LO at the bottom-right and the fill follows it', () => {
  assert.ok(DITHER_HI > DITHER_LO && DITHER_LO > 0 && DITHER_HI < 1);
  const w = 64;
  const h = 64;
  const cell = 4;
  assert.ok(ditherValue(0, 0, cell, w, h) > ditherValue(15, 15, cell, w, h));
  assert.ok(Math.abs(ditherValue(0, 0, cell, w, h) - (DITHER_HI - (DITHER_HI - DITHER_LO) * 0.5 * (2 * 2) / 64)) < 1e-12);
  // Top-left quarter is denser than the bottom-right quarter; overall fill sits around the gradient's mean.
  let tl = 0;
  let br = 0;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      tl += patternCoverage(PATTERN_ID.dither, x, y, w, h, cell);
      br += patternCoverage(PATTERN_ID.dither, x + 32, y + 32, w, h, cell);
    }
  }
  assert.ok(tl > br, `top-left ${tl} vs bottom-right ${br}`);
  const fill = patternFill(PATTERN_ID.dither, w, h, cell);
  assert.ok(fill > 0.45 && fill < 0.75, `dither fill ${fill}`);
  const dots = patternFill(PATTERN_ID.dotgrid, 64, 64, 8);
  assert.ok(dots > 0.2 && dots < 0.36, `dot fill ${dots}`); // π · 0.3² ≈ 0.283 plus the soft edge
  assert.ok(Math.abs(patternFill(PATTERN_ID.scanline, 64, 64, 8) - 0.25) < 1e-12);
  assert.equal(patternFill(PATTERN_ID.flat, 10, 10, 4), 1);
  assert.equal(patternFill(PATTERN_ID.transparent, 10, 10, 4), 0);
});

test('patternPixels: straight-alpha RGBA in the tile colour, alpha = coverage × 255, deterministic', () => {
  const px = patternPixels(PATTERN_ID.scanline, 6, 6, 3, [0.8, 0.5, 0.4]);
  assert.equal(px.length, 6 * 6 * 4);
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 6; x++) {
      const o = (y * 6 + x) * 4;
      assert.equal(px[o], 204);
      assert.equal(px[o + 1], 128);
      assert.equal(px[o + 2], 102);
      assert.equal(px[o + 3], y % 3 < 2 ? 255 : 0);
    }
  }
  assert.deepEqual(Array.from(patternPixels(PATTERN_ID.dither, 20, 12, 4, [1, 1, 1])), Array.from(patternPixels(PATTERN_ID.dither, 20, 12, 4, [1, 1, 1])));
  assert.throws(() => patternPixels(PATTERN_ID.flat, 0, 4, 4, [1, 1, 1]), RangeError);
  assert.throws(() => patternPixels(PATTERN_ID.flat, 2.5, 4, 4, [1, 1, 1]), RangeError);
});

test('tileDeviceRect snaps to whole pixels, shares edges between neighbours and never goes negative', () => {
  const r = tileDeviceRect(tile(), FRAME);
  assert.deepEqual(r, { left: 192, top: 216, width: 96, height: 86 });
  const a = tileDeviceRect({ x: 0.1, y: 0.2, w: 0.0333, h: 0.1 }, OFFSET_FRAME);
  const b = tileDeviceRect({ x: 0.1333, y: 0.2, w: 0.05, h: 0.1 }, OFFSET_FRAME);
  for (const v of [a.left, a.top, a.width, a.height, b.left, b.width]) assert.ok(Number.isInteger(v));
  assert.equal(a.left + a.width, b.left, 'adjacent tiles meet on the same device column');
  assert.deepEqual(tileDeviceRect({ x: 0.5, y: 0.5, w: 0, h: 0 }, FRAME), { left: 960, top: 540, width: 0, height: 0 });
  assert.deepEqual(tileDeviceRect({ x: 0.5, y: 0.5, w: 0.0001, h: 0.0001 }, FRAME), { left: 960, top: 540, width: 0, height: 0 });
});

test('cellDevicePx scales with frame height / 1080, rounds to whole pixels and floors at MIN_CELL_DEVICE_PX', () => {
  assert.equal(MIN_CELL_DEVICE_PX, 2);
  assert.equal(cellDevicePx(6, 1080), 6);
  assert.equal(cellDevicePx(6, 2160), 12);
  assert.equal(cellDevicePx(6, 720), 4);
  assert.equal(cellDevicePx(4, 360), 2);
  assert.equal(cellDevicePx(4, 100), 2);
  assert.equal(cellDevicePx(Number.NaN, 1080), 2);
});

test('hairline: one device px wide, from the tile bottom, hairline × frame height long, at a stable column inside the tile', () => {
  const r = tileDeviceRect(tile(), FRAME);
  const line = hairlineDeviceRect(r, 0.1, 7, FRAME);
  assert.equal(line.width, 1);
  assert.equal(line.top, r.top + r.height);
  assert.equal(line.height, 108);
  assert.ok(line.left >= r.left && line.left < r.left + r.width);
  assert.equal(hairlineColumn(r, 7), hairlineColumn(r, 7));
  assert.notEqual(hairlineColumn(r, 7), hairlineColumn(r, 8));
  assert.equal(hairlineDeviceRect(r, 0, 7, FRAME).height, 0);
  assert.equal(hairlineDeviceRect(r, 0.0001, 7, FRAME).height, 0);
  const narrow = hairlineDeviceRect({ left: 10, top: 10, width: 1, height: 5 }, 0.05, 3, FRAME);
  assert.equal(narrow.left, 10);
  assert.equal(narrow.height, 54);
});

test('packTiles: 11 floats per instance, tiles first then hairlines, transparent/invisible tiles skipped but their hairlines kept', () => {
  assert.equal(FLOATS_PER_TILE_INSTANCE, 11);
  assert.equal(BYTES_PER_TILE_INSTANCE, 44);
  assert.deepEqual([TILE_OFFSET_RECT, TILE_OFFSET_COLOR, TILE_OFFSET_PATTERN, TILE_OFFSET_CELL, TILE_OFFSET_BIRTH], [0, 16, 32, 36, 40]);
  const tiles: Tile[] = [
    tile({ id: 'a', pattern: 'dither', hairline: 0.05, birthMs: 100 }),
    tile({ id: 'b', pattern: 'transparent', x: 0.3, hairline: 0.2, birthMs: 200 }),
    tile({ id: 'c', pattern: 'flat', x: 0.5, hairline: 0, alpha: 0, birthMs: 300 }),
    tile({ id: 'd', pattern: 'scanline', x: 0.7, hairline: 0, cellPx: 4, birthMs: 400 }),
  ];
  const out = new Float32Array(tiles.length * 2 * FLOATS_PER_TILE_INSTANCE);
  const n = packTiles(tiles, FRAME, out);
  // Instances: a (tile), d (tile), a (hairline), b (hairline). b is transparent, c invisible.
  assert.equal(n, 4);
  const inst = (k: number) => Array.from(out.subarray(k * FLOATS_PER_TILE_INSTANCE, (k + 1) * FLOATS_PER_TILE_INSTANCE));
  const ra = tileDeviceRect(tiles[0]!, FRAME);
  assert.deepEqual(inst(0).slice(0, 4), [ra.left, ra.top, ra.width, ra.height]);
  assert.ok(Math.abs(inst(0)[7]! - 0.9) < 1e-6);
  assert.equal(inst(0)[8], PATTERN_ID.dither);
  assert.equal(inst(0)[9], 6);
  assert.equal(inst(0)[10], 100);
  assert.equal(inst(1)[8], PATTERN_ID.scanline);
  assert.equal(inst(1)[9], 4);
  assert.equal(inst(1)[10], 400);
  // Hairline of a: flat, 1 px wide, 54 px tall, alpha × HAIRLINE_ALPHA, birth of its tile.
  assert.equal(inst(2)[2], 1);
  assert.equal(inst(2)[3], 54);
  assert.equal(inst(2)[8], PATTERN_ID.flat);
  assert.ok(Math.abs(inst(2)[7]! - 0.9 * HAIRLINE_ALPHA) < 1e-6);
  assert.equal(inst(2)[10], 100);
  // Hairline of the transparent b still drawn, 216 px tall.
  assert.equal(inst(3)[3], 216);
  assert.equal(inst(3)[10], 200);
  // Deterministic and order-preserving.
  const again = new Float32Array(out.length);
  assert.equal(packTiles(tiles, FRAME, again), n);
  assert.deepEqual(Array.from(again.subarray(0, n * FLOATS_PER_TILE_INSTANCE)), Array.from(out.subarray(0, n * FLOATS_PER_TILE_INSTANCE)));
  assert.equal(packTiles([], FRAME, new Float32Array(0)), 0);
  assert.throws(() => packTiles(tiles, FRAME, new Float32Array(FLOATS_PER_TILE_INSTANCE)), RangeError);
});

test('sky: gradient top → horizon, soft SKY_BAND into the ground centred on horizonY, canvas stops increasing', () => {
  assert.equal(SKY_BAND, 0.04);
  const sky: Sky = { top: [0.98, 0.9, 0.86], horizon: [0.9, 0.8, 0.76], horizonY: 0.4 };
  const ground = [0.1, 0.07, 0.06] as const;
  assert.deepEqual(skyRgb(sky, ground, 0), [0.98, 0.9, 0.86]);
  const mid = skyRgb(sky, ground, 0.2);
  assert.ok(Math.abs(mid[0] - 0.94) < 1e-12 && Math.abs(mid[1] - 0.85) < 1e-12 && Math.abs(mid[2] - 0.81) < 1e-12);
  // Just above the band: still on the gradient (95 % of the way to the horizon colour, no ground mixed in);
  // at horizonY: halfway to the ground; below the band: ground.
  const bandTop = skyRgb(sky, ground, 0.4 - SKY_BAND / 2);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(bandTop[c]! - (sky.top[c]! + (sky.horizon[c]! - sky.top[c]!) * 0.95)) < 1e-12, `channel ${c}`);
  const atHorizon = skyRgb(sky, ground, 0.4);
  assert.ok(Math.abs(atHorizon[0] - (0.9 + 0.1) / 2) < 1e-12);
  const near = (got: readonly number[], want: readonly number[]) => got.every((v, c) => Math.abs(v - want[c]!) < 1e-12);
  assert.ok(near(skyRgb(sky, ground, 0.4 + SKY_BAND / 2), ground), 'band bottom is the ground');
  assert.ok(near(skyRgb(sky, ground, 0.9), ground), 'far below is the ground');
  assert.ok(Math.abs(skyBottomY(sky) - 0.42) < 1e-12);
  // Monotonic through the band.
  let prev = 1;
  for (let fy = 0.38; fy <= 0.42; fy += 0.001) {
    const v = skyRgb(sky, ground, fy)[0];
    assert.ok(v <= prev + 1e-12, `fy ${fy}`);
    prev = v;
  }
  const stops = skyStops(sky, ground);
  assert.ok(stops.length >= 4);
  assert.equal(stops[0]!.offset, 0);
  assert.equal(stops[stops.length - 1]!.offset, 1);
  for (let i = 1; i < stops.length; i++) assert.ok(stops[i]!.offset > stops[i - 1]!.offset);
  assert.ok(near(stops[stops.length - 1]!.rgb, ground), 'last stop is the ground');
  // A degenerate horizon does not divide by zero.
  const low = skyRgb({ top: [1, 1, 1], horizon: [0, 0, 0], horizonY: 0 }, ground, 0.1);
  assert.ok(low.every((v) => Number.isFinite(v)));
});

// ---- Sky clip polygon (Sky.polygon) ----

// The seed-33 wedge is the scene's own SEED33_SKY_POLYGON (imported, not copied), so the renderer tests follow it.
/** The dev harness wedge (render/dev.ts DEV_SKY_WEDGE): concave notch on the right, apex below the band. */
const DEV_WEDGE: readonly PolygonPoint[] = [
  [0.36, -0.02],
  [0.68, -0.02],
  [0.66, 0.12],
  [0.6, 0.16],
  [0.62, 0.24],
  [0.55, 0.44],
  [0.5, 0.34],
  [0.44, 0.2],
  [0.38, 0.1],
];
/** The dev wedge's first draft: (0.38, 0.1), (0.42, 0.18) and (0.55, 0.44) are exactly collinear (slope 0.5), with a 0.01 dent between them. */
const WEDGE_WITH_COLLINEAR: readonly PolygonPoint[] = [
  [0.36, -0.02],
  [0.68, -0.02],
  [0.66, 0.12],
  [0.6, 0.16],
  [0.62, 0.24],
  [0.55, 0.44],
  [0.47, 0.3],
  [0.42, 0.18],
  [0.38, 0.1],
];
const SQUARE: readonly PolygonPoint[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
/** A U shape: two reflex vertices, so a fan from vertex 0 would leave the polygon. */
const U_SHAPE: readonly PolygonPoint[] = [
  [0, 0],
  [3, 0],
  [3, 3],
  [2, 3],
  [2, 1],
  [1, 1],
  [1, 3],
  [0, 3],
];

function triangleArea2(p: readonly PolygonPoint[], a: number, b: number, c: number): number {
  return polygonArea2([p[a]!, p[b]!, p[c]!]);
}

/** Every triangle is non-degenerate, wound like the polygon, has its centroid inside it, and the areas add up to the polygon's. */
function checkTriangulation(points: readonly PolygonPoint[], label: string): number[] {
  const tri = triangulatePolygon(points);
  assert.equal(tri.length % 3, 0, `${label}: index triples`);
  assert.equal(tri.length / 3, points.length - 2, `${label}: n − 2 triangles`);
  const sign = Math.sign(polygonArea2(points));
  let sum = 0;
  for (let k = 0; k < tri.length; k += 3) {
    const [a, b, c] = [tri[k]!, tri[k + 1]!, tri[k + 2]!];
    for (const i of [a, b, c]) assert.ok(Number.isInteger(i) && i >= 0 && i < points.length, `${label}: index ${i}`);
    assert.ok(a !== b && b !== c && a !== c, `${label}: distinct corners`);
    const area2 = triangleArea2(points, a, b, c);
    assert.ok(Math.sign(area2) === sign && Math.abs(area2) > 1e-9, `${label}: triangle ${k / 3} area ${area2} vs polygon sign ${sign}`);
    const cx = (points[a]![0] + points[b]![0] + points[c]![0]) / 3;
    const cy = (points[a]![1] + points[b]![1] + points[c]![1]) / 3;
    assert.ok(pointInPolygon(cx, cy, points), `${label}: centroid of triangle ${k / 3} (${cx}, ${cy}) outside the polygon`);
    sum += area2;
  }
  assert.ok(Math.abs(sum - polygonArea2(points)) < 1e-9, `${label}: areas ${sum} vs ${polygonArea2(points)}`);
  return tri;
}

test('polygonArea2 and pointInPolygon: winding sign, degenerate zero, even-odd containment', () => {
  assert.equal(polygonArea2(SQUARE), 2);
  assert.equal(polygonArea2([...SQUARE].reverse()), -2);
  assert.equal(polygonArea2([[0, 0], [1, 1], [2, 2]]), 0);
  assert.equal(polygonArea2([]), 0);
  assert.ok(pointInPolygon(0.5, 0.5, SQUARE));
  assert.ok(!pointInPolygon(1.5, 0.5, SQUARE));
  assert.ok(!pointInPolygon(-0.1, 0.5, SQUARE));
  assert.ok(pointInPolygon(0.5, 2, U_SHAPE));
  assert.ok(!pointInPolygon(1.5, 2, U_SHAPE), 'the gap of the U is outside');
  assert.ok(pointInPolygon(2.5, 2, U_SHAPE));
  // The seed-33 wedge: the top centre is sky, the top-left corner and the far right are ground.
  assert.ok(SEED33_SKY_POLYGON.length >= 3);
  assert.ok(pointInPolygon(0.5, 0.02, SEED33_SKY_POLYGON));
  assert.ok(!pointInPolygon(0.02, 0.02, SEED33_SKY_POLYGON));
  assert.ok(!pointInPolygon(0.9, 0.02, SEED33_SKY_POLYGON));
  assert.ok(!pointInPolygon(0.5, 0.3, SEED33_SKY_POLYGON), 'below the wedge bottom is ground');
});

test('triangulatePolygon: convex, seed-33-like, concave dev wedge and a U shape; both windings; degenerate input', () => {
  const sq = checkTriangulation(SQUARE, 'square');
  assert.equal(sq.length, 6);
  checkTriangulation([...SQUARE].reverse(), 'square reversed');
  checkTriangulation(SEED33_SKY_POLYGON, 'seed-33 wedge');
  checkTriangulation([...SEED33_SKY_POLYGON].reverse(), 'seed-33 wedge reversed');
  checkTriangulation(DEV_WEDGE, 'dev wedge');
  checkTriangulation(U_SHAPE, 'U');
  checkTriangulation([...U_SHAPE].reverse(), 'U reversed');
  // An exactly collinear triple inside the polygon (float turn ~1e-17): no zero-area triangle, the area still adds up.
  const tc = triangulatePolygon(WEDGE_WITH_COLLINEAR);
  assert.ok(tc.length / 3 <= WEDGE_WITH_COLLINEAR.length - 2 && tc.length >= 3);
  let sumC = 0;
  for (let k = 0; k < tc.length; k += 3) {
    const a2 = triangleArea2(WEDGE_WITH_COLLINEAR, tc[k]!, tc[k + 1]!, tc[k + 2]!);
    assert.ok(a2 > 1e-9, `collinear case: triangle ${k / 3} area ${a2}`);
    sumC += a2;
  }
  assert.ok(Math.abs(sumC - polygonArea2(WEDGE_WITH_COLLINEAR)) < 1e-9, `collinear case: areas ${sumC}`);
  // Deterministic.
  assert.deepEqual(triangulatePolygon(DEV_WEDGE), triangulatePolygon(DEV_WEDGE));
  // A triangle is itself.
  assert.deepEqual(triangulatePolygon([[0, 0], [1, 0], [0, 1]]), [0, 1, 2]);
  // Collinear vertex dropped without a triangle: the square with a mid-edge point still covers the square.
  const withMid: PolygonPoint[] = [[0, 0], [0.5, 0], [1, 0], [1, 1], [0, 1]];
  const tm = triangulatePolygon(withMid);
  let sum = 0;
  for (let k = 0; k < tm.length; k += 3) sum += triangleArea2(withMid, tm[k]!, tm[k + 1]!, tm[k + 2]!);
  assert.ok(Math.abs(sum - 2) < 1e-12, `square with a collinear point covers area 1 (got ${sum / 2})`);
  // Degenerate input.
  assert.deepEqual(triangulatePolygon([]), []);
  assert.deepEqual(triangulatePolygon([[0, 0], [1, 1]]), []);
  assert.deepEqual(triangulatePolygon([[0, 0], [1, 1], [2, 2]]), []);
  assert.deepEqual(triangulatePolygon([[0, 0], [0, 0], [0, 0]]), []);
});

test('skyClipPolygon: Sky.polygon when set, else the full-width band from the frame top to skyBottomY', () => {
  const sky: Sky = { top: [0.98, 0.9, 0.86], horizon: [0.9, 0.8, 0.76], horizonY: 0.4 };
  const bottom = skyBottomY(sky); // 0.4 + SKY_BAND / 2 (0.42 up to float rounding)
  assert.ok(Math.abs(bottom - 0.42) < 1e-12);
  assert.deepEqual(skyClipPolygon(sky), [[0, 0], [1, 0], [1, bottom], [0, bottom]]);
  assert.equal(skyClipPolygon({ ...sky, polygon: DEV_WEDGE }), DEV_WEDGE);
  // Fewer than three points is not a clip: the full-width band again.
  assert.deepEqual(skyClipPolygon({ ...sky, polygon: [[0.4, 0], [0.6, 0]] }), [[0, 0], [1, 0], [1, bottom], [0, bottom]]);
  assert.equal(SKY_FLOATS_PER_VERTEX, 2);
  assert.equal(skyTriangleFloats(4), 12);
  assert.equal(skyTriangleFloats(9), 42);
  assert.equal(skyTriangleFloats(2), 0);
});

test('packSkyTriangles: device-px triangle list through the frame rect; full-width rect without a polygon; buffer bound', () => {
  const sky: Sky = { top: [0.98, 0.9, 0.86], horizon: [0.9, 0.8, 0.76], horizonY: 0.4 };
  const out = new Float32Array(skyTriangleFloats(4));
  const nv = packSkyTriangles(sky, OFFSET_FRAME, out);
  assert.equal(nv, 6);
  // Two triangles covering exactly the rect left..right × top..top + 0.42 · height, every vertex on a rect corner.
  const corners = new Set<string>();
  for (let v = 0; v < nv; v++) corners.add(`${out[v * 2]},${out[v * 2 + 1]}`);
  const bottom = Math.fround(11 + 0.42 * 720);
  assert.deepEqual([...corners].sort(), [`37,11`, `37,${bottom}`, `1317,11`, `1317,${bottom}`].sort());
  let area2 = 0;
  for (let k = 0; k < nv; k += 3) {
    const ax = out[k * 2]!, ay = out[k * 2 + 1]!, bx = out[k * 2 + 2]!, by = out[k * 2 + 3]!, cx = out[k * 2 + 4]!, cy = out[k * 2 + 5]!;
    area2 += (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }
  assert.ok(Math.abs(Math.abs(area2) / 2 - 1280 * 0.42 * 720) < 0.1, `rect area ${Math.abs(area2) / 2}`);
  // With a polygon: n − 2 triangles, vertices are the polygon's points mapped by the frame rect (no snapping).
  const wedge = { ...sky, polygon: DEV_WEDGE };
  const wo = new Float32Array(skyTriangleFloats(DEV_WEDGE.length));
  const wn = packSkyTriangles(wedge, OFFSET_FRAME, wo);
  assert.equal(wn, (DEV_WEDGE.length - 2) * 3);
  const mapped = new Set(DEV_WEDGE.map((p) => `${Math.fround(37 + p[0] * 1280)},${Math.fround(11 + p[1] * 720)}`));
  for (let v = 0; v < wn; v++) assert.ok(mapped.has(`${wo[v * 2]},${wo[v * 2 + 1]}`), `vertex ${v} is a mapped polygon point`);
  // The first vertex sits above the frame top (y −0.02): the renderers scissor/clip to the frame, not the packer.
  assert.ok([...Array(wn).keys()].some((v) => wo[v * 2 + 1]! < 11));
  // Deterministic, and a too-small buffer throws.
  const again = new Float32Array(wo.length);
  assert.equal(packSkyTriangles(wedge, OFFSET_FRAME, again), wn);
  assert.deepEqual(Array.from(again), Array.from(wo));
  assert.throws(() => packSkyTriangles(wedge, OFFSET_FRAME, new Float32Array(wo.length - 1)), RangeError);
});

test('packSkyTriangles without a polygon equals packing the explicit full-width rectangle; the triangulation cache is per array identity', () => {
  const sky: Sky = { top: [0.98, 0.9, 0.86], horizon: [0.9, 0.8, 0.76], horizonY: 0.4 };
  // The allocation-free rectangle path writes exactly what the generic polygon path writes for skyClipPolygon(sky).
  for (const frame of [FRAME, OFFSET_FRAME]) {
    const fast = new Float32Array(skyTriangleFloats(4));
    const generic = new Float32Array(skyTriangleFloats(4));
    assert.equal(packSkyTriangles(sky, frame, fast), 6);
    assert.equal(packSkyTriangles({ ...sky, polygon: skyClipPolygon(sky) }, frame, generic), 6);
    assert.deepEqual(Array.from(fast), Array.from(generic));
    // A horizon change moves the rectangle's bottom edge (the WebGL2 backend re-uploads on it).
    const lower = new Float32Array(skyTriangleFloats(4));
    packSkyTriangles({ ...sky, horizonY: 0.5 }, frame, lower);
    assert.notDeepEqual(Array.from(lower), Array.from(fast));
  }
  assert.equal(skyClipVertexCount(sky), 4);
  assert.equal(skyClipVertexCount({ ...sky, polygon: DEV_WEDGE }), DEV_WEDGE.length);
  assert.equal(skyClipVertexCount({ ...sky, polygon: SEED33_SKY_POLYGON }), SEED33_SKY_POLYGON.length);
  assert.equal(skyClipVertexCount({ ...sky, polygon: [[0.4, 0], [0.6, 0]] }), 4, 'fewer than three points is not a clip');
  // The cache: the same array gives the same list object; an equal but distinct array is its own entry with equal content.
  const first = cachedTriangulation(DEV_WEDGE);
  assert.equal(cachedTriangulation(DEV_WEDGE), first);
  assert.deepEqual([...first], triangulatePolygon(DEV_WEDGE));
  const copy: PolygonPoint[] = DEV_WEDGE.map((p) => [p[0], p[1]]);
  const second = cachedTriangulation(copy);
  assert.notEqual(second, first);
  assert.deepEqual([...second], [...first]);
  assert.equal(cachedTriangulation(SEED33_SKY_POLYGON), cachedTriangulation(SEED33_SKY_POLYGON));
  assert.deepEqual([...cachedTriangulation(SEED33_SKY_POLYGON)], triangulatePolygon(SEED33_SKY_POLYGON));
  // Packing through the cache is byte-identical to packing before it existed (the polygon path is pure).
  const viaCache = new Float32Array(skyTriangleFloats(SEED33_SKY_POLYGON.length));
  const nv = packSkyTriangles({ ...sky, polygon: SEED33_SKY_POLYGON }, OFFSET_FRAME, viaCache);
  assert.equal(nv, (SEED33_SKY_POLYGON.length - 2) * 3);
  const direct: number[] = [];
  for (const i of triangulatePolygon(SEED33_SKY_POLYGON)) {
    const p = SEED33_SKY_POLYGON[i]!;
    direct.push(Math.fround(OFFSET_FRAME.left + p[0] * OFFSET_FRAME.width), Math.fround(OFFSET_FRAME.top + p[1] * OFFSET_FRAME.height));
  }
  assert.deepEqual(Array.from(viaCache), direct);
});
