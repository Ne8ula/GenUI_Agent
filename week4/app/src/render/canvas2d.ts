// Canvas2D backend: the same layers as WebGL2 with canvas calls. Ground fill → sky linear gradient over the frame,
// clipped to Sky.polygon (the wedge between the rooflines) when it is set, full width when it is absent (or the
// hashed-grain paper pattern when frame.sky is null) → one ellipse/rect per visible particle in slot order,
// with the birth ramp and shimmer from view.timeMs through pack.ts → tiles (fillRect for flat; a cached offscreen
// tile rasterised from patterns.ts for dither/dotgrid/scanline) → 1-px fillRect hairlines; tiles and hairlines are
// clipped to the frame rect so a hairline dropping past the frame bottom never paints the margin (the WebGL2
// backend scissors the same pass). Geometry, shape, grain, time and pattern math are shared with WebGL2 through
// pack.ts and patterns.ts so both look alike at a glance.
// The per-frame path allocates no strings or objects: the sky gradient, the polygon clip path, the grain pattern and
// the offscreen pattern tiles are cached by value or identity and rebuilt only when their inputs change, and the
// fill style is assigned only when the rounded 8-bit colour changes.
import type { FrameView, Renderer, RendererStats, Rgb, SceneFrame, Sky, Tile } from '../scene/types.ts';
import { birthRamp, canvas2dRadius, canvas2dStride, deviceDiameter, grainTile, particleAlpha, particleShape, type ParticleShape } from './pack.ts';
import { PATTERN_ID, cellDevicePx, hairlineDeviceRect, patternPixels, skyBottomY, skyStops, tileDeviceRect, type DeviceRect } from './patterns.ts';
import { CANVAS2D_RECT_BELOW, GRAIN_SALT, GRAIN_TILE, HAIRLINE_ALPHA, MIN_ALPHA } from './paper.ts';

export interface Canvas2DOptions {
  /** Why Canvas2D was chosen when it was not the explicit preference; appended to stats.detail. */
  reason?: string;
}

const TAU = 2 * Math.PI;
/** Float32 threshold, matching pack.ts: the store holds float32 opacities. */
const ALPHA_THRESHOLD = Math.fround(MIN_ALPHA);
/** Pattern canvases cached per tile id; cleared when it grows past this many entries (tile sets are 16–24). */
const PATTERN_CACHE_LIMIT = 256;
/** Number of values the sky gradient is keyed on: top rgb, horizon rgb, horizonY, ground rgb, device top, device bottom. */
const SKY_KEY_LENGTH = 12;

/** An offscreen pattern tile and the values it was rasterised from (compared field by field, no key string). */
interface PatternEntry {
  id: number;
  width: number;
  height: number;
  cell: number;
  r: number;
  g: number;
  b: number;
  canvas: HTMLCanvasElement;
}

const to255 = (c: number): number => Math.round(c * 255);

export function createCanvas2DRenderer(canvas: HTMLCanvasElement, options: Canvas2DOptions = {}): Renderer {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error(
      'Canvas2D context unavailable: the canvas is already bound to another context type or 2D canvases are disabled. Mount a fresh canvas.',
    );
  }
  const baseDetail = options.reason ? `Canvas2D · ${options.reason}` : 'Canvas2D';
  let stats: RendererStats = { backend: 'canvas2d', lastDrawMs: 0, particlesDrawn: 0, degraded: false, detail: baseDetail };
  // Grain pattern, keyed on the paper colour.
  let grain: CanvasPattern | null = null;
  let grainR = Number.NaN;
  let grainG = Number.NaN;
  let grainB = Number.NaN;
  // Sky gradient, keyed on SKY_KEY_LENGTH numbers (see skyGradient).
  let skyGradientCache: CanvasGradient | null = null;
  const skyKey = new Float64Array(SKY_KEY_LENGTH).fill(Number.NaN);
  // Sky polygon clip path, keyed on the polygon's identity and the frame rect it was mapped through.
  let skyPath: Path2D | null = null;
  let skyPathPolygon: Sky['polygon'] = undefined;
  let skyPathLeft = Number.NaN;
  let skyPathTop = Number.NaN;
  let skyPathWidth = Number.NaN;
  let skyPathHeight = Number.NaN;
  let patternCache = new Map<string, PatternEntry>();
  // The 8-bit colour the context's fillStyle currently holds, or −1 when it holds something else (a gradient, a pattern, unknown).
  let fillR = -1;
  let fillG = -1;
  let fillB = -1;
  // stats.detail for the last stride, so a strided frame does not build the string again.
  let detailStride = 1;
  let detail = baseDetail;
  let disposed = false;
  const shape: ParticleShape = { angle: 0, squash: 1 };
  const rect: DeviceRect = { left: 0, top: 0, width: 0, height: 0 };
  const line: DeviceRect = { left: 0, top: 0, width: 1, height: 0 };

  /** Sets a solid fill style only when the rounded colour differs from the one the context already holds. */
  function setFill(r: number, g: number, b: number): void {
    if (r === fillR && g === fillG && b === fillB) return;
    ctx!.fillStyle = `rgb(${r},${g},${b})`;
    fillR = r;
    fillG = g;
    fillB = b;
  }

  /** Pre-rendered GRAIN_TILE² noise tile for this paper colour, cached until the paper changes. */
  function paperPattern(paper: Rgb): CanvasPattern | null {
    if (grain && paper[0] === grainR && paper[1] === grainG && paper[2] === grainB) return grain;
    const tile = document.createElement('canvas');
    tile.width = GRAIN_TILE;
    tile.height = GRAIN_TILE;
    const tctx = tile.getContext('2d');
    if (!tctx) return null;
    const img = tctx.createImageData(GRAIN_TILE, GRAIN_TILE);
    img.data.set(grainTile(GRAIN_TILE, paper, GRAIN_SALT));
    tctx.putImageData(img, 0, 0);
    const pattern = ctx!.createPattern(tile, 'repeat');
    if (!pattern) return null;
    grain = pattern;
    grainR = paper[0];
    grainG = paper[1];
    grainB = paper[2];
    return pattern;
  }

  /** Vertical sky gradient for this frame placement, cached until the sky colours, horizon, ground or device span changes. */
  function skyGradient(sky: Sky, ground: Rgb, top: number, bottom: number): CanvasGradient {
    const same =
      skyGradientCache !== null &&
      skyKey[0] === sky.top[0] &&
      skyKey[1] === sky.top[1] &&
      skyKey[2] === sky.top[2] &&
      skyKey[3] === sky.horizon[0] &&
      skyKey[4] === sky.horizon[1] &&
      skyKey[5] === sky.horizon[2] &&
      skyKey[6] === sky.horizonY &&
      skyKey[7] === ground[0] &&
      skyKey[8] === ground[1] &&
      skyKey[9] === ground[2] &&
      skyKey[10] === top &&
      skyKey[11] === bottom;
    if (same) return skyGradientCache!;
    const gradient = ctx!.createLinearGradient(0, top, 0, bottom);
    for (const stop of skyStops(sky, ground)) gradient.addColorStop(stop.offset, `rgb(${to255(stop.rgb[0])},${to255(stop.rgb[1])},${to255(stop.rgb[2])})`);
    skyKey[0] = sky.top[0];
    skyKey[1] = sky.top[1];
    skyKey[2] = sky.top[2];
    skyKey[3] = sky.horizon[0];
    skyKey[4] = sky.horizon[1];
    skyKey[5] = sky.horizon[2];
    skyKey[6] = sky.horizonY;
    skyKey[7] = ground[0];
    skyKey[8] = ground[1];
    skyKey[9] = ground[2];
    skyKey[10] = top;
    skyKey[11] = bottom;
    skyGradientCache = gradient;
    return gradient;
  }

  /** The sky polygon as a device-px Path2D, rebuilt only when the polygon array or the frame rect changes. */
  function skyClipPath(polygon: NonNullable<Sky['polygon']>, fl: number, ft: number, fw: number, fh: number): Path2D {
    if (skyPath && skyPathPolygon === polygon && skyPathLeft === fl && skyPathTop === ft && skyPathWidth === fw && skyPathHeight === fh) return skyPath;
    const path = new Path2D();
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!;
      if (i === 0) path.moveTo(fl + p[0] * fw, ft + p[1] * fh);
      else path.lineTo(fl + p[0] * fw, ft + p[1] * fh);
    }
    path.closePath();
    skyPath = path;
    skyPathPolygon = polygon;
    skyPathLeft = fl;
    skyPathTop = ft;
    skyPathWidth = fw;
    skyPathHeight = fh;
    return path;
  }

  /** Offscreen pattern tile for a dither/dotgrid/scanline tile at its current device size, cached per tile id until its inputs change. */
  function patternCanvas(tile: Tile, r: DeviceRect, cell: number): HTMLCanvasElement | null {
    const id = PATTERN_ID[tile.pattern] ?? 0;
    const hit = patternCache.get(tile.id);
    if (
      hit &&
      hit.id === id &&
      hit.width === r.width &&
      hit.height === r.height &&
      hit.cell === cell &&
      hit.r === tile.colour[0] &&
      hit.g === tile.colour[1] &&
      hit.b === tile.colour[2]
    ) {
      return hit.canvas;
    }
    const off = document.createElement('canvas');
    off.width = r.width;
    off.height = r.height;
    const octx = off.getContext('2d');
    if (!octx) return null;
    const img = octx.createImageData(r.width, r.height);
    img.data.set(patternPixels(id, r.width, r.height, cell, tile.colour));
    octx.putImageData(img, 0, 0);
    if (patternCache.size >= PATTERN_CACHE_LIMIT && !hit) patternCache = new Map();
    patternCache.set(tile.id, { id, width: r.width, height: r.height, cell, r: tile.colour[0], g: tile.colour[1], b: tile.colour[2], canvas: off });
    return off;
  }

  return {
    backend: 'canvas2d',
    draw(frame: SceneFrame, view: FrameView) {
      if (disposed) return;
      const t0 = performance.now();
      const w = canvas.width;
      const h = canvas.height;
      if (!(w > 0 && h > 0 && view.widthPx > 0 && view.heightPx > 0)) return;
      const { store, tiles, paper } = frame;
      const timeMs = view.timeMs;
      const fl = view.frame.left;
      const ft = view.frame.top;
      const fw = view.frame.width;
      const fh = view.frame.height;

      // Ground over the whole canvas, margins included. The fill memo starts unknown every frame.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      fillR = fillG = fillB = -1;
      setFill(to255(paper[0]), to255(paper[1]), to255(paper[2]));
      ctx.fillRect(0, 0, w, h);
      if (frame.sky) {
        // Sky: the frame's columns from its top to the bottom of the horizon band; below that the ground stays.
        // With Sky.polygon the same gradient is clipped to the polygon (and to the frame rect, so margins stay ground).
        const sky = frame.sky;
        const bottomPx = skyBottomY(sky) * fh;
        const polygon = sky.polygon !== undefined && sky.polygon.length >= 3 ? sky.polygon : undefined;
        if (bottomPx > 0 && fw > 0) {
          if (polygon) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(fl, ft, fw, fh);
            ctx.clip();
            ctx.clip(skyClipPath(polygon, fl, ft, fw, fh));
          }
          ctx.fillStyle = skyGradient(sky, paper, ft, ft + bottomPx);
          fillR = -1;
          ctx.fillRect(fl, ft, fw, bottomPx);
          if (polygon) ctx.restore(); // restores the ground fill style; the memo is already unknown
        }
      } else {
        const pattern = paperPattern(paper);
        if (pattern) {
          ctx.fillStyle = pattern;
          fillR = -1;
          ctx.fillRect(0, 0, w, h);
        }
      }

      // Particles in slot order (far → near). Above the budget, a deterministic stride subset; stated in detail.
      const stride = canvas2dStride(store.count);
      const { x, y, r, g, b, a, size, phase, motion, birthMs } = store;
      let drawn = 0;
      for (let i = 0; i < store.count; i += stride) {
        const stored = a[i]!;
        if (!(stored > ALPHA_THRESHOLD)) continue;
        const alpha = particleAlpha(stored, motion[i]!, phase[i]!, birthMs[i]!, timeMs);
        if (!(alpha > 0.0005)) continue; // not yet born
        const d = deviceDiameter(size[i]!, fh);
        const cx = fl + x[i]! * fw;
        const cy = ft + y[i]! * fh;
        setFill(to255(r[i]!), to255(g[i]!), to255(b[i]!));
        ctx.globalAlpha = alpha;
        if (d < CANVAS2D_RECT_BELOW) {
          ctx.fillRect(cx - d * 0.5, cy - d * 0.5, d, d);
        } else {
          const rr = canvas2dRadius(d);
          particleShape(i, shape);
          ctx.beginPath();
          ctx.ellipse(cx, cy, rr, rr * shape.squash, shape.angle, 0, TAU);
          ctx.fill();
        }
        drawn++;
      }

      // Tiles and hairlines are clipped to the frame rect: a hairline from a tile near the bottom stops at the frame edge.
      ctx.save();
      ctx.beginPath();
      ctx.rect(fl, ft, fw, fh);
      ctx.clip();

      // Tiles in array order with the birth ramp; hard edges on whole device pixels.
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i]!;
        const alpha = (t.alpha > 1 ? 1 : t.alpha) * birthRamp(t.birthMs, timeMs);
        if (!(alpha > 0.0005) || t.pattern === 'transparent') continue;
        tileDeviceRect(t, view.frame, rect);
        if (rect.width <= 0 || rect.height <= 0) continue;
        ctx.globalAlpha = alpha;
        if (t.pattern === 'flat') {
          setFill(to255(t.colour[0]), to255(t.colour[1]), to255(t.colour[2]));
          ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
        } else {
          const off = patternCanvas(t, rect, cellDevicePx(t.cellPx, fh));
          if (off) ctx.drawImage(off, rect.left, rect.top);
        }
      }

      // Hairlines: 1 device px wide, dropping from each tile's bottom edge (transparent tiles included).
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i]!;
        if (!(t.hairline > 0)) continue;
        const alpha = (t.alpha > 1 ? 1 : t.alpha) * birthRamp(t.birthMs, timeMs) * HAIRLINE_ALPHA;
        if (!(alpha > 0.0005)) continue;
        tileDeviceRect(t, view.frame, rect);
        if (rect.width <= 0) continue;
        hairlineDeviceRect(rect, t.hairline, i, view.frame, line);
        if (line.height <= 0) continue;
        ctx.globalAlpha = alpha;
        setFill(to255(t.colour[0]), to255(t.colour[1]), to255(t.colour[2]));
        ctx.fillRect(line.left, line.top, 1, line.height);
      }

      ctx.restore(); // drops the frame clip; fillStyle reverts to the saved one, so the memo is unknown again
      fillR = -1;
      ctx.globalAlpha = 1;
      if (stride !== detailStride) {
        detailStride = stride;
        detail = stride > 1 ? `${baseDetail} · stride ${stride}` : baseDetail;
      }
      // performance.now() is used only for this measurement; every time-driven effect above read view.timeMs.
      stats = { backend: 'canvas2d', lastDrawMs: performance.now() - t0, particlesDrawn: drawn, degraded: false, detail };
    },
    stats: () => stats,
    dispose() {
      disposed = true;
      grain = null;
      skyGradientCache = null;
      skyPath = null;
      skyPathPolygon = undefined;
      patternCache = new Map();
    },
  };
}
