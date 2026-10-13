import type { FrameRect, Rgb } from '../scene/types.ts';
import type { ConstructionPlan, ConstructionTexture } from '../scene/constructionTypes.ts';

export type ConstructionCanvasTextures = Readonly<Record<ConstructionTexture, ImageBitmap>>;

export interface ConstructionCanvasDrawStats {
  commandsDrawn: number;
  degenerateTriangles: number;
  tilesShown: number;
}

export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const TRIANGLE_EPSILON = 1e-8;
const DESTINATION_AREA_EPSILON = 1e-4;
const TAU = Math.PI * 2;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);
const channel = (value: number): number => Math.round(clamp01(value) * 255);
const cssColour = (colour: Rgb): string => `rgb(${channel(colour[0])},${channel(colour[1])},${channel(colour[2])})`;

/**
 * Solves the Canvas2D affine transform that maps three source-pixel points to three
 * destination-pixel points. The supplied output object is reused by the caller.
 */
export function solveAffineTriangle(
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  dx0: number,
  dy0: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number,
  out: AffineTransform,
): boolean {
  const denominator = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (!Number.isFinite(denominator) || Math.abs(denominator) <= TRIANGLE_EPSILON) return false;

  out.a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denominator;
  out.b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denominator;
  out.c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denominator;
  out.d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denominator;
  out.e =
    (dx0 * (sx1 * sy2 - sx2 * sy1) +
      dx1 * (sx2 * sy0 - sx0 * sy2) +
      dx2 * (sx0 * sy1 - sx1 * sy0)) /
    denominator;
  out.f =
    (dy0 * (sx1 * sy2 - sx2 * sy1) +
      dy1 * (sx2 * sy0 - sx0 * sy2) +
      dy2 * (sx0 * sy1 - sx1 * sy0)) /
    denominator;

  return Number.isFinite(out.a) && Number.isFinite(out.b) && Number.isFinite(out.c) && Number.isFinite(out.d) && Number.isFinite(out.e) && Number.isFinite(out.f);
}

export interface ConstructionCanvasRenderer {
  draw(plan: ConstructionPlan, frame: FrameRect, textures: ConstructionCanvasTextures): ConstructionCanvasDrawStats;
}

/**
 * Creates a retained Canvas2D construction-plan consumer. It allocates no canvases or
 * per-command geometry: source-textured triangles clip the original bitmap and map its
 * UV triangle to the authored destination triangle with one affine transform.
 */
export function createConstructionCanvasRenderer(ctx: CanvasRenderingContext2D): ConstructionCanvasRenderer {
  const transform: AffineTransform = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stats: ConstructionCanvasDrawStats = { commandsDrawn: 0, degenerateTriangles: 0, tilesShown: 0 };
  const drawnTileIds = new Set<string>();

  return {
    draw(plan, frame, textures) {
      stats.commandsDrawn = 0;
      stats.degenerateTriangles = 0;
      stats.tilesShown = 0;
      drawnTileIds.clear();
      if (!plan.active || !(frame.width > 0 && frame.height > 0)) return stats;

      const { left, top, width, height } = frame;
      const cssPixelScale = height / 1080;

      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.clip();
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (const command of plan.commands) {
        const alpha = clamp01(command.alpha);
        if (!(alpha > 0)) continue;
        ctx.globalAlpha = alpha;

        if (command.kind === 'stroke') {
          if (command.points.length === 0 || !(command.widthPx > 0)) continue;
          const first = command.points[0]!;
          const x0 = left + first[0] * width;
          const y0 = top + first[1] * height;
          if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
          if (command.points.length === 1) {
            ctx.beginPath();
            ctx.arc(x0, y0, command.widthPx * cssPixelScale * 0.5, 0, TAU);
            ctx.fillStyle = cssColour(command.colour);
            ctx.fill();
            stats.commandsDrawn += 1;
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          let valid = true;
          for (let i = 1; i < command.points.length; i++) {
            const point = command.points[i]!;
            const x = left + point[0] * width;
            const y = top + point[1] * height;
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
              valid = false;
              break;
            }
            ctx.lineTo(x, y);
          }
          if (!valid) continue;
          ctx.lineWidth = command.widthPx * cssPixelScale;
          ctx.strokeStyle = cssColour(command.colour);
          ctx.stroke();
          stats.commandsDrawn += 1;
          continue;
        }

        if (command.kind === 'disc') {
          const x = left + command.center[0] * width;
          const y = top + command.center[1] * height;
          const radius = command.radiusPx * cssPixelScale;
          if (!Number.isFinite(x) || !Number.isFinite(y) || !(radius > 0)) continue;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, TAU);
          ctx.fillStyle = cssColour(command.colour);
          ctx.fill();
          stats.commandsDrawn += 1;
          continue;
        }

        let dx0: number;
        let dy0: number;
        let dx1: number;
        let dy1: number;
        let dx2: number;
        let dy2: number;
        if (command.kind === 'solid') {
          dx0 = left + command.points[0][0] * width;
          dy0 = top + command.points[0][1] * height;
          dx1 = left + command.points[1][0] * width;
          dy1 = top + command.points[1][1] * height;
          dx2 = left + command.points[2][0] * width;
          dy2 = top + command.points[2][1] * height;
        } else {
          dx0 = left + command.vertices[0].x * width;
          dy0 = top + command.vertices[0].y * height;
          dx1 = left + command.vertices[1].x * width;
          dy1 = top + command.vertices[1].y * height;
          dx2 = left + command.vertices[2].x * width;
          dy2 = top + command.vertices[2].y * height;
        }
        const destinationArea = (dx1 - dx0) * (dy2 - dy0) - (dy1 - dy0) * (dx2 - dx0);
        if (
          !Number.isFinite(dx0) ||
          !Number.isFinite(dy0) ||
          !Number.isFinite(dx1) ||
          !Number.isFinite(dy1) ||
          !Number.isFinite(dx2) ||
          !Number.isFinite(dy2) ||
          !Number.isFinite(destinationArea) ||
          Math.abs(destinationArea) <= DESTINATION_AREA_EPSILON
        ) {
          stats.degenerateTriangles += 1;
          continue;
        }

        if (command.kind === 'solid') {
          ctx.beginPath();
          ctx.moveTo(dx0, dy0);
          ctx.lineTo(dx1, dy1);
          ctx.lineTo(dx2, dy2);
          ctx.closePath();
          ctx.fillStyle = cssColour(command.colour);
          ctx.fill();
          stats.commandsDrawn += 1;
          continue;
        }

        const image = textures[command.texture];
        const sourceWidth = image.width;
        const sourceHeight = image.height;
        const v0 = command.vertices[0];
        const v1 = command.vertices[1];
        const v2 = command.vertices[2];
        const mapped =
          sourceWidth > 0 &&
          sourceHeight > 0 &&
          solveAffineTriangle(
            v0.u * sourceWidth,
            v0.v * sourceHeight,
            v1.u * sourceWidth,
            v1.v * sourceHeight,
            v2.u * sourceWidth,
            v2.v * sourceHeight,
            dx0,
            dy0,
            dx1,
            dy1,
            dx2,
            dy2,
            transform,
          );
        if (!mapped) {
          stats.degenerateTriangles += 1;
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(dx0, dy0);
        ctx.lineTo(dx1, dy1);
        ctx.lineTo(dx2, dy2);
        ctx.closePath();
        ctx.clip();
        ctx.transform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f);
        ctx.drawImage(image, 0, 0);
        ctx.restore();
        if (command.texture === 'tiles' && command.id.startsWith('tile:')) {
          drawnTileIds.add(command.id.split(':').slice(0, 2).join(':'));
        }
        stats.commandsDrawn += 1;
      }

      stats.tilesShown = drawnTileIds.size;
      ctx.restore();
      return stats;
    },
  };
}
