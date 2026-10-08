// Pure, DOM-free tile-pattern, hairline and sky helpers shared by both backends; unit-tested with node:test.
// The WebGL2 tile fragment shader mirrors patternCoverage on device pixels relative to the tile's top-left;
// Canvas2D rasterises the same function through patternPixels into a cached offscreen tile. Rects are snapped
// to whole device pixels so tile edges stay hard in both backends.
import type { FrameRect, Rgb, Sky, Tile, TilePattern } from '../scene/types.ts';
import { hash01 } from '../scene/rng.ts';
import { smoothstep } from './pack.ts';
import {
  AUTHORED_FRAME_HEIGHT,
  DITHER_HI,
  DITHER_LO,
  DOT_RADIUS,
  HAIRLINE_ALPHA,
  HAIRLINE_SALT,
  MIN_CELL_DEVICE_PX,
  SCANLINE_PX,
  SKY_BAND,
} from './paper.ts';

/** Numeric pattern ids carried in the tile instance buffer and switched on by the shader. */
export const PATTERN_ID: Readonly<Record<TilePattern, number>> = { transparent: 0, flat: 1, dither: 2, dotgrid: 3, scanline: 4 };

/** Standard 4×4 Bayer matrix, row-major, thresholds 0..15. */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** BAYER4[(y & 3) * 4 + (x & 3)] computed arithmetically, exactly as the shader does (no array indexing). */
export function bayer4Index(x: number, y: number): number {
  const xi = x & 3;
  const yi = y & 3;
  const xy = xi ^ yi;
  return ((xy & 1) << 3) | ((yi & 1) << 2) | (((xy >> 1) & 1) << 1) | ((yi >> 1) & 1);
}

/** Bayer threshold in (0, 1) for cell (x, y): (index + 0.5) / 16. */
export function bayer4Threshold(x: number, y: number): number {
  return (bayer4Index(x, y) + 0.5) / 16;
}

/** Whole-device-pixel rectangle (top-left origin, y down). */
export interface DeviceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A tile's rectangle in device px, snapped to whole pixels (edges round independently so neighbours share edges). */
export function tileDeviceRect(
  tile: Pick<Tile, 'x' | 'y' | 'w' | 'h'>,
  frame: FrameRect,
  out: DeviceRect = { left: 0, top: 0, width: 0, height: 0 },
): DeviceRect {
  const left = Math.round(frame.left + tile.x * frame.width);
  const right = Math.round(frame.left + (tile.x + tile.w) * frame.width);
  const top = Math.round(frame.top + tile.y * frame.height);
  const bottom = Math.round(frame.top + (tile.y + tile.h) * frame.height);
  out.left = left;
  out.top = top;
  out.width = right > left ? right - left : 0;
  out.height = bottom > top ? bottom - top : 0;
  return out;
}

/** Pattern cell pitch in whole device px for an authored cellPx (CSS px at 1080), never below MIN_CELL_DEVICE_PX. */
export function cellDevicePx(cellPx: number, frameHeightPx: number): number {
  const c = Math.round((cellPx * frameHeightPx) / AUTHORED_FRAME_HEIGHT);
  return c > MIN_CELL_DEVICE_PX ? c : MIN_CELL_DEVICE_PX; // NaN → minimum
}

/** Dither gradient value at the centre of cell (cx, cy): DITHER_HI at the top-left corner falling to DITHER_LO at the bottom-right. */
export function ditherValue(cx: number, cy: number, cell: number, widthPx: number, heightPx: number): number {
  const u = clamp01(((cx + 0.5) * cell) / widthPx);
  const v = clamp01(((cy + 0.5) * cell) / heightPx);
  return DITHER_HI - (DITHER_HI - DITHER_LO) * 0.5 * (u + v);
}

/**
 * Coverage 0..1 of device pixel (px, py) (integers, relative to the tile's top-left) for a pattern id, in a
 * widthPx × heightPx tile with a `cell` px pitch. flat = 1; dither = Bayer-thresholded diagonal gradient, whole
 * cells; dotgrid = discs of radius DOT_RADIUS · cell on the cell grid (one-pixel soft edge); scanline = SCANLINE_PX
 * rows every cell; transparent (or unknown) = 0. The WebGL2 tile shader implements the same arithmetic.
 */
export function patternCoverage(patternId: number, px: number, py: number, widthPx: number, heightPx: number, cell: number): number {
  switch (patternId) {
    case 1:
      return 1;
    case 2: {
      const cx = Math.floor(px / cell);
      const cy = Math.floor(py / cell);
      return ditherValue(cx, cy, cell, widthPx, heightPx) > bayer4Threshold(cx, cy) ? 1 : 0;
    }
    case 3: {
      const cx = Math.floor(px / cell);
      const cy = Math.floor(py / cell);
      const dx = px + 0.5 - (cx + 0.5) * cell;
      const dy = py + 0.5 - (cy + 0.5) * cell;
      const d = Math.sqrt(dx * dx + dy * dy);
      const r = DOT_RADIUS * cell;
      return 1 - smoothstep(r - 0.5, r + 0.5, d);
    }
    case 4:
      return py - Math.floor(py / cell) * cell < SCANLINE_PX ? 1 : 0;
    default:
      return 0;
  }
}

/** Mean coverage of a pattern over a tile (used by tests and the dev HUD; not called per frame). */
export function patternFill(patternId: number, widthPx: number, heightPx: number, cell: number): number {
  if (!(widthPx > 0 && heightPx > 0)) return 0;
  let sum = 0;
  for (let y = 0; y < heightPx; y++) for (let x = 0; x < widthPx; x++) sum += patternCoverage(patternId, x, y, widthPx, heightPx, cell);
  return sum / (widthPx * heightPx);
}

/** Straight-alpha RGBA pixels (widthPx × heightPx) of a pattern in `colour`: alpha = coverage × 255. For Canvas2D ImageData. */
export function patternPixels(patternId: number, widthPx: number, heightPx: number, cell: number, colour: Rgb): Uint8ClampedArray {
  if (!Number.isInteger(widthPx) || !Number.isInteger(heightPx) || widthPx <= 0 || heightPx <= 0) {
    throw new RangeError('pattern tile size must be positive integers');
  }
  const px = new Uint8ClampedArray(widthPx * heightPx * 4);
  const r = Math.round(clamp01(colour[0]) * 255);
  const g = Math.round(clamp01(colour[1]) * 255);
  const b = Math.round(clamp01(colour[2]) * 255);
  let o = 0;
  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = Math.round(patternCoverage(patternId, x, y, widthPx, heightPx, cell) * 255);
      o += 4;
    }
  }
  return px;
}

/** Device x of a tile's hairline: a deterministic column inside the tile from its array index (stable while the tile lives). */
export function hairlineColumn(rect: DeviceRect, index: number): number {
  const span = rect.width > 1 ? rect.width - 1 : 0;
  const k = Math.floor(hash01(index, HAIRLINE_SALT) * (span + 1));
  return rect.left + (k > span ? span : k);
}

/** The 1-device-px hairline dropping from a tile's bottom edge: `hairline` frame-heights long. Height 0 means none. */
export function hairlineDeviceRect(
  rect: DeviceRect,
  hairline: number,
  index: number,
  frame: FrameRect,
  out: DeviceRect = { left: 0, top: 0, width: 1, height: 0 },
): DeviceRect {
  out.left = hairlineColumn(rect, index);
  out.top = rect.top + rect.height;
  out.width = 1;
  const h = Math.round(hairline * frame.height);
  out.height = h > 0 ? h : 0;
  return out;
}

/**
 * Tile instance layout (floats): left, top, width, height (device px); r, g, b, alpha; pattern id; cell (device px);
 * birthMs. Hairlines are instances too (pattern flat, 1 px wide, alpha × HAIRLINE_ALPHA), packed after every tile so
 * one instanced draw lays tiles first and hairlines on top.
 */
export const FLOATS_PER_TILE_INSTANCE = 11;
export const BYTES_PER_TILE_INSTANCE = FLOATS_PER_TILE_INSTANCE * 4;
export const TILE_OFFSET_RECT = 0;
export const TILE_OFFSET_COLOR = 16;
export const TILE_OFFSET_PATTERN = 32;
export const TILE_OFFSET_CELL = 36;
export const TILE_OFFSET_BIRTH = 40;

const scratchRect: DeviceRect = { left: 0, top: 0, width: 0, height: 0 };
const scratchLine: DeviceRect = { left: 0, top: 0, width: 1, height: 0 };

/** Writes one tile instance at float offset `o` of `out` and returns the next offset. Module-level: no per-call closure. */
function writeTileInstance(out: Float32Array, o: number, rect: DeviceRect, colour: Rgb, alpha: number, pattern: number, cell: number, birthMs: number): number {
  out[o] = rect.left;
  out[o + 1] = rect.top;
  out[o + 2] = rect.width;
  out[o + 3] = rect.height;
  out[o + 4] = colour[0];
  out[o + 5] = colour[1];
  out[o + 6] = colour[2];
  out[o + 7] = alpha;
  out[o + 8] = pattern;
  out[o + 9] = cell;
  out[o + 10] = birthMs;
  return o + FLOATS_PER_TILE_INSTANCE;
}

/**
 * Packs tile instances then hairline instances into `out` (which must hold 2 × tiles.length × FLOATS_PER_TILE_INSTANCE
 * floats). Transparent tiles, invisible tiles and sub-pixel rects emit no tile instance; a transparent tile still
 * emits its hairline. Birth ramps are left to the shader (birthMs travels with the instance). Returns the instance count.
 * Allocation-free: called every frame by the WebGL2 backend.
 */
export function packTiles(tiles: readonly Tile[], frame: FrameRect, out: Float32Array): number {
  if (out.length < tiles.length * 2 * FLOATS_PER_TILE_INSTANCE) {
    throw new RangeError(`tile buffer holds ${Math.floor(out.length / FLOATS_PER_TILE_INSTANCE)} instances, ${tiles.length} tiles need ${tiles.length * 2}`);
  }
  let o = 0;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    const alpha = clamp01(t.alpha);
    if (!(alpha > 0)) continue;
    const id = PATTERN_ID[t.pattern] ?? 0;
    if (id === 0) continue;
    tileDeviceRect(t, frame, scratchRect);
    if (scratchRect.width <= 0 || scratchRect.height <= 0) continue;
    o = writeTileInstance(out, o, scratchRect, t.colour, alpha, id, cellDevicePx(t.cellPx, frame.height), t.birthMs);
  }
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]!;
    const alpha = clamp01(t.alpha);
    if (!(alpha > 0) || !(t.hairline > 0)) continue;
    tileDeviceRect(t, frame, scratchRect);
    if (scratchRect.width <= 0) continue;
    hairlineDeviceRect(scratchRect, t.hairline, i, frame, scratchLine);
    if (scratchLine.height <= 0) continue;
    o = writeTileInstance(out, o, scratchLine, t.colour, alpha * HAIRLINE_ALPHA, PATTERN_ID.flat, 1, t.birthMs);
  }
  return o / FLOATS_PER_TILE_INSTANCE;
}

/** Frame y (0..1) below which the sky pass has no effect: horizonY plus half the soft band. */
export function skyBottomY(sky: Sky): number {
  return sky.horizonY + SKY_BAND / 2;
}

/** Sky colour at frame y: the top→horizon gradient, blended into the ground across SKY_BAND centred on horizonY. */
export function skyRgb(sky: Sky, ground: Rgb, fy: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const hY = sky.horizonY > 1e-4 ? sky.horizonY : 1e-4;
  const t = clamp01(fy / hY);
  const m = smoothstep(hY - SKY_BAND / 2, hY + SKY_BAND / 2, fy);
  for (let c = 0; c < 3; c++) {
    const g = sky.top[c]! + (sky.horizon[c]! - sky.top[c]!) * t;
    out[c] = clamp01(g + (ground[c]! - g) * m);
  }
  return out;
}

export interface SkyStop {
  /** Gradient offset 0..1 over the span frame top → skyBottomY. */
  offset: number;
  rgb: [number, number, number];
}

/** Colour stops for a Canvas2D linear gradient spanning frame y 0 → skyBottomY: exact up to the band, `bandSteps` samples across it. */
export function skyStops(sky: Sky, ground: Rgb, bandSteps: number = 8): SkyStop[] {
  const bottom = skyBottomY(sky);
  const hY = sky.horizonY > 1e-4 ? sky.horizonY : 1e-4;
  const ys = [0, hY - SKY_BAND / 2];
  for (let k = 1; k < bandSteps; k++) ys.push(hY - SKY_BAND / 2 + (SKY_BAND * k) / bandSteps);
  ys.push(bottom); // the last stop is exactly the ground at skyBottomY (offset 1), not an accumulated approximation
  const stops: SkyStop[] = [];
  let last = -1;
  for (const y of ys) {
    const offset = clamp01(y / bottom);
    if (offset <= last) continue; // keep offsets strictly increasing for the canvas gradient
    last = offset;
    stops.push({ offset, rgb: skyRgb(sky, ground, y) });
  }
  return stops;
}

// ---- Sky clip polygon (Sky.polygon): triangulation shared by the WebGL2 triangle list and the tests ----

/** A polygon vertex in authored frame coordinates (x, y in 0..1; values outside the frame are allowed and clipped by the frame). */
export type PolygonPoint = readonly [number, number];

/** Twice the signed area of a polygon (shoelace). Positive for one winding, negative for the other, 0 when degenerate. */
export function polygonArea2(points: readonly PolygonPoint[]): number {
  let area2 = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area2 += points[j]![0] * points[i]![1] - points[i]![0] * points[j]![1];
  }
  return area2;
}

/** Even-odd (ray-casting) point-in-polygon test; points on an edge may fall either side. */
export function pointInPolygon(x: number, y: number, points: readonly PolygonPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cross(a: PolygonPoint, b: PolygonPoint, c: PolygonPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** True when p lies inside or on triangle abc, whose winding sign is `sign` (±1). */
function pointInOrOnTriangle(p: PolygonPoint, a: PolygonPoint, b: PolygonPoint, c: PolygonPoint, sign: number): boolean {
  return cross(a, b, p) * sign >= 0 && cross(b, c, p) * sign >= 0 && cross(c, a, p) * sign >= 0;
}

/**
 * Ear-clipping triangulation of a simple polygon in either winding (convex or concave, as the sky wedge between the
 * rooflines is). Returns index triples into `points`, every triangle wound like the polygon; at most n − 2 of them.
 * Collinear vertices (turn within 1e-12 of the polygon's squared extent, so exact collinearity survives float
 * rounding) are dropped without a triangle. Fewer than three points or zero area gives []. A non-simple polygon
 * cannot be ear-clipped: what is left falls back to a fan from its first remaining vertex so drawing never stalls
 * (the result is then only approximate). Pure and deterministic; O(n²), meant for a few dozen vertices.
 */
export function triangulatePolygon(points: readonly PolygonPoint[]): number[] {
  const n = points.length;
  const out: number[] = [];
  if (n < 3) return out;
  const area2 = polygonArea2(points);
  if (!(area2 !== 0 && Number.isFinite(area2))) return out;
  const sign = area2 > 0 ? 1 : -1;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const eps = ((maxX - minX) ** 2 + (maxY - minY) ** 2) * 1e-12;
  if (!(Math.abs(area2) > eps)) return out;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i);
  let guard = n * n;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const m = idx.length;
      const i0 = idx[(k + m - 1) % m]!;
      const i1 = idx[k]!;
      const i2 = idx[(k + 1) % m]!;
      const a = points[i0]!;
      const b = points[i1]!;
      const c = points[i2]!;
      const turn = cross(a, b, c) * sign;
      if (turn < -eps) continue; // reflex vertex: never an ear
      if (turn <= eps) {
        idx.splice(k, 1); // collinear (or a zero-width spike): no triangle to emit
        clipped = true;
        break;
      }
      let ear = true;
      for (const q of idx) {
        if (q === i0 || q === i1 || q === i2) continue;
        if (pointInOrOnTriangle(points[q]!, a, b, c, sign)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push(i0, i1, i2);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) {
    // The last triangle, unless what remains is collinear (three points left on one line after the ears went).
    if (Math.abs(cross(points[idx[0]!]!, points[idx[1]!]!, points[idx[2]!]!)) > eps) out.push(idx[0]!, idx[1]!, idx[2]!);
  } else {
    for (let k = 1; k + 1 < idx.length; k++) out.push(idx[0]!, idx[k]!, idx[k + 1]!); // fallback fan (non-simple input)
  }
  return out;
}

/**
 * The region the sky pass paints, in frame coordinates: Sky.polygon when set (the wedge between the rooflines),
 * otherwise the full-width rectangle from the frame top down to skyBottomY (the previous full-width behaviour).
 */
export function skyClipPolygon(sky: Sky): readonly PolygonPoint[] {
  if (sky.polygon && sky.polygon.length >= 3) return sky.polygon;
  const bottom = skyBottomY(sky);
  return [
    [0, 0],
    [1, 0],
    [1, bottom],
    [0, bottom],
  ];
}

/** Vertex count of the polygon packSkyTriangles uses: Sky.polygon's when it is a clip, else the 4 of the full-width rectangle. */
export function skyClipVertexCount(sky: Sky): number {
  return sky.polygon && sky.polygon.length >= 3 ? sky.polygon.length : 4;
}

/** Floats per sky vertex in the triangle list: device x, device y. */
export const SKY_FLOATS_PER_VERTEX = 2;

/** Upper bound of floats packSkyTriangles writes for a polygon of `vertexCount` points (n − 2 triangles). */
export function skyTriangleFloats(vertexCount: number): number {
  return vertexCount > 2 ? (vertexCount - 2) * 3 * SKY_FLOATS_PER_VERTEX : 0;
}

/**
 * Triangulations cached per polygon array identity. A scene authors its Sky.polygon once (the contract types it
 * readonly) and the renderers see the same array every frame, so the O(n²) ear clipping runs once per polygon
 * and again only when `frame.sky.polygon` is replaced by another array. A WeakMap: a dropped polygon frees its entry.
 */
const triangulationCache = new WeakMap<readonly PolygonPoint[], readonly number[]>();

/** triangulatePolygon(polygon), computed once per array identity; the same array returns the same cached index list. */
export function cachedTriangulation(polygon: readonly PolygonPoint[]): readonly number[] {
  let tri = triangulationCache.get(polygon);
  if (tri === undefined) {
    tri = triangulatePolygon(polygon);
    triangulationCache.set(polygon, tri);
  }
  return tri;
}

/**
 * Index triples of the full-width rectangle [(0,0), (1,0), (1,b), (0,b)], computed once from the unit square: ear
 * clipping decides by turn signs only, so every such rectangle (b > 0) triangulates to the same triples. Used by the
 * no-polygon path of packSkyTriangles so a sky without a clip never allocates its rectangle per frame.
 */
const RECT_TRIANGULATION: readonly number[] = triangulatePolygon([
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]);

/**
 * Packs the sky clip polygon as a device-pixel triangle list (frame coordinates → device through the frame rect,
 * no snapping) into `out`, which must hold skyTriangleFloats(skyClipVertexCount(sky)) floats. Returns the vertex
 * count (a multiple of 3). The caller scissors to the frame rect so a polygon reaching past the frame never paints
 * the margins. Allocation-free after the first call per polygon identity (see cachedTriangulation).
 */
export function packSkyTriangles(sky: Sky, frame: FrameRect, out: Float32Array): number {
  const count = skyClipVertexCount(sky);
  if (out.length < skyTriangleFloats(count)) {
    throw new RangeError(`sky buffer holds ${Math.floor(out.length / SKY_FLOATS_PER_VERTEX)} vertices, ${count} points need ${skyTriangleFloats(count) / SKY_FLOATS_PER_VERTEX}`);
  }
  let o = 0;
  const poly = sky.polygon;
  if (poly && poly.length >= 3) {
    const tri = cachedTriangulation(poly);
    for (let k = 0; k < tri.length; k++) {
      const p = poly[tri[k]!]!;
      out[o] = frame.left + p[0] * frame.width;
      out[o + 1] = frame.top + p[1] * frame.height;
      o += SKY_FLOATS_PER_VERTEX;
    }
    return o / SKY_FLOATS_PER_VERTEX;
  }
  // No clip: the rectangle skyClipPolygon(sky) describes, written corner by corner through RECT_TRIANGULATION with the
  // same arithmetic as the polygon path (x 0 → frame.left, x 1 → frame.left + frame.width, y 0 → frame.top, y b → …).
  const bottom = skyBottomY(sky);
  for (let k = 0; k < RECT_TRIANGULATION.length; k++) {
    const i = RECT_TRIANGULATION[k]!;
    const px = i === 1 || i === 2 ? 1 : 0;
    const py = i === 2 || i === 3 ? bottom : 0;
    out[o] = frame.left + px * frame.width;
    out[o + 1] = frame.top + py * frame.height;
    o += SKY_FLOATS_PER_VERTEX;
  }
  return o / SKY_FLOATS_PER_VERTEX;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
