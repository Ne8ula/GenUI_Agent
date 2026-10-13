// Seed-33 component-construction planner (w4-20261008-seed33-construction-r1).
//
// This is a pure, deterministic draw-plan builder. The authored geometry follows the inspected Seed-33
// still: converging Paris facades, the large left chair, radial near table, cup at x~.72, ashtray at
// x~.33, and the near woman's actual manifest placement. Source triangles now resolve through local
// matrix occupancy; approved strand geometry/timing remains unchanged. At .999 every guide has
// retired and the exact source-registered background/figure/tile/foreground meshes remain.
import type {
  ConstructionCommand,
  ConstructionInput,
  ConstructionPlan,
  ConstructionPoint,
  ConstructionTexture,
  ConstructionTextureVertex,
  FigureConstructionStage,
} from './constructionTypes.ts';
import { CONSTRUCTION_COMMAND_LIMIT } from './constructionTypes.ts';
import type { PhotoManifestData, PhotoTileRegion, Rgb } from './types.ts';
import { PALETTE } from './palette.ts';
import { hash01 } from './rng.ts';
import { matrixMaterialPatches, matrixSolidCommands } from './matrixMaterials.ts';
import { formedTileGlitchPatches, matrixTilePatches } from './matrixTiles.ts';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const lerp = (a: number, b: number, amount: number): number => a + (b - a) * amount;
const mixPoint = (a: ConstructionPoint, b: ConstructionPoint, amount: number): ConstructionPoint => [
  lerp(a[0], b[0], amount),
  lerp(a[1], b[1], amount),
];
const smoothstep = (from: number, to: number, value: number): number => {
  if (to <= from) return value < from ? 0 : 1;
  const amount = clamp01((value - from) / (to - from));
  return amount * amount * (3 - 2 * amount);
};

interface GrowthWindow {
  start: number;
  end: number;
}

export const FIGURE_SCAFFOLD_START = 0.22;
export const FIGURE_VOLUME_START = 0.44;
export const FIGURE_GARMENT_START = 0.64;
export const FIGURE_COMPLETE_START = 0.94;

function figureStageFor(progress: number): FigureConstructionStage {
  if (progress < FIGURE_SCAFFOLD_START) return 'absent';
  if (progress < FIGURE_VOLUME_START) return 'scaffold';
  if (progress < FIGURE_GARMENT_START) return 'volume';
  if (progress < FIGURE_COMPLETE_START) return 'garment';
  return 'complete';
}

/** Stable timing variation only; authored coordinates never come from random lines. */
function staggeredWindow(
  rangeStart: number,
  rangeEnd: number,
  index: number,
  seed: number,
  salt: number,
  minWidthFraction = 0.22,
  maxWidthFraction = 0.42,
): GrowthWindow {
  const span = Math.max(0, rangeEnd - rangeStart);
  if (span === 0) return { start: rangeStart, end: rangeEnd };
  const widthFraction = lerp(minWidthFraction, maxWidthFraction, hash01(index + 8191, (seed ^ salt) >>> 0));
  const width = span * widthFraction;
  const start = rangeStart + hash01(index, (seed ^ (salt + 17)) >>> 0) * Math.max(0, span - width);
  return { start, end: Math.min(rangeEnd, start + width) };
}

function growPolyline(points: readonly ConstructionPoint[], amount: number): readonly ConstructionPoint[] {
  if (points.length < 2 || amount >= 1) return points;
  const lengths: number[] = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const length = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    lengths.push(length);
    total += length;
  }
  if (total <= 1e-12) return [points[0]!, points[1]!];
  const target = Math.max(total * amount, 1e-10);
  const grown: ConstructionPoint[] = [points[0]!];
  let travelled = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!;
    const next = points[index + 1]!;
    if (travelled + length <= target) {
      grown.push(next);
      travelled += length;
      continue;
    }
    const previous = points[index]!;
    grown.push(mixPoint(previous, next, length <= 1e-12 ? 1 : (target - travelled) / length));
    break;
  }
  return grown.length >= 2 ? grown : [points[0]!, points[1]!];
}

function quadraticBezier(
  start: ConstructionPoint,
  control: ConstructionPoint,
  end: ConstructionPoint,
  segments: number,
): ConstructionPoint[] {
  const points: ConstructionPoint[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const inverse = 1 - t;
    points.push([
      inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
      inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
    ]);
  }
  return points;
}

function ellipsePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments: number,
  from = 0,
  to = Math.PI * 2,
): ConstructionPoint[] {
  const points: ConstructionPoint[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = lerp(from, to, index / segments);
    points.push([clamp01(cx + Math.cos(angle) * rx), clamp01(cy + Math.sin(angle) * ry)]);
  }
  return points;
}

interface AuthoredStrand {
  id: string;
  component: string;
  points: readonly ConstructionPoint[];
  widthPx: number;
  colour: Rgb;
  tipColour: Rgb;
  window: GrowthWindow;
  retire: GrowthWindow;
  tip: boolean;
}

interface StrandCounters {
  growing: number;
  completed: number;
}

function emitStrand(
  output: ConstructionCommand[],
  strand: AuthoredStrand,
  progress: number,
  counters: StrandCounters,
): void {
  const local = smoothstep(strand.window.start, strand.window.end, progress);
  if (local <= 0) return;
  if (local < 1) counters.growing += 1;
  else counters.completed += 1;

  // Alpha is used only to retire a completed local guide after source material reaches it. It never
  // reveals source imagery and is zero before the .999 endpoint handoff.
  const alpha = 1 - smoothstep(strand.retire.start, strand.retire.end, progress);
  if (alpha <= 1e-6) return;
  const grown = growPolyline(strand.points, local);
  output.push({
    kind: 'stroke',
    id: strand.id,
    component: strand.component,
    alpha,
    points: grown,
    widthPx: strand.widthPx,
    colour: strand.colour,
  });
  if (strand.tip && local < 1) {
    output.push({
      kind: 'disc',
      id: `${strand.id}:tip`,
      component: strand.component,
      alpha,
      center: grown[grown.length - 1]!,
      radiusPx: Math.max(1.4, strand.widthPx * 2.1),
      colour: strand.tipColour,
    });
  }
}

const BEAD = PALETTE.limestoneLit;
const TIP = PALETTE.cupWhite;

function oriented(points: readonly ConstructionPoint[], reverse: boolean): readonly ConstructionPoint[] {
  return reverse ? [...points].reverse() : points;
}

/** Hundreds of source-traced facade, roof, awning, window, and lamp paths. */
function authorArchitecture(seed: number): AuthoredStrand[] {
  const strands: AuthoredStrand[] = [];
  const add = (
    id: string,
    points: readonly ConstructionPoint[],
    index: number,
    salt: number,
    range: GrowthWindow,
    colour: Rgb = BEAD,
    widthPx = 0.7,
    tip = true,
  ): void => {
    const window = staggeredWindow(range.start, range.end, index, seed, salt);
    const retireStart = Math.max(window.end + 0.08, 0.68 + (index % 7) * 0.018);
    strands.push({
      id,
      component: 'architecture',
      points,
      widthPx,
      colour,
      tipColour: TIP,
      window,
      retire: { start: Math.min(0.94, retireStart), end: 0.978 },
      tip,
    });
  };

  const leftTop = (x: number): number => x <= 0.19 ? 0 : lerp(0, 0.285, clamp01((x - 0.19) / 0.27));
  const leftBottom = (x: number): number => lerp(0.73, 0.81, clamp01(x / 0.46));
  const rightTop = (x: number): number => x >= 0.67 ? 0 : lerp(0.245, 0, clamp01((x - 0.585) / 0.085));
  const rightBottom = (x: number): number => lerp(0.80, 0.72, clamp01((x - 0.585) / 0.415));

  // Dense vertical facade line fields seen in the source, interrupted into perspective-aware segments.
  for (let index = 0; index < 132; index += 1) {
    const x = lerp(0.004, 0.458, index / 131);
    const top = leftTop(x);
    const bottom = leftBottom(x);
    const points: ConstructionPoint[] = [
      [x, top],
      [x + (0.5 - x) * 0.004, lerp(top, bottom, 0.34)],
      [x + (0.5 - x) * 0.007, lerp(top, bottom, 0.69)],
      [x + (0.5 - x) * 0.01, bottom],
    ];
    add(`architecture:facade-left:vertical-${index}`, oriented(points, index % 5 === 0), index, 0x111, { start: 0.015, end: 0.70 }, BEAD, 0.42 + (index % 4) * 0.09);
  }
  for (let index = 0; index < 132; index += 1) {
    const x = lerp(0.585, 0.998, index / 131);
    const top = rightTop(x);
    const bottom = rightBottom(x);
    const points: ConstructionPoint[] = [
      [x, top],
      [x + (0.5 - x) * 0.004, lerp(top, bottom, 0.33)],
      [x + (0.5 - x) * 0.007, lerp(top, bottom, 0.67)],
      [x + (0.5 - x) * 0.01, bottom],
    ];
    add(`architecture:facade-right:vertical-${index}`, oriented(points, index % 6 === 0), index, 0x112, { start: 0.025, end: 0.72 }, BEAD, 0.42 + (index % 5) * 0.08);
  }

  // Perspective courses and roof/awning fields converge on the source street opening rather than on a grid.
  for (let index = 0; index < 30; index += 1) {
    const t = index / 29;
    const edgeY = lerp(0.055, 0.70, t);
    add(
      `architecture:facade-left:course-${index}`,
      [[0, edgeY], [0.20, lerp(edgeY, 0.33, 0.36)], [0.455, lerp(0.275, 0.71, t)]],
      index,
      0x121,
      { start: 0.04, end: 0.68 },
      index % 4 === 0 ? PALETTE.limestoneShade : BEAD,
      0.55,
      index % 3 === 0,
    );
    add(
      `architecture:facade-right:course-${index}`,
      [[1, edgeY], [0.79, lerp(edgeY, 0.32, 0.38)], [0.585, lerp(0.245, 0.69, t)]],
      index,
      0x122,
      { start: 0.05, end: 0.70 },
      index % 4 === 0 ? PALETTE.limestoneShade : BEAD,
      0.55,
      index % 3 === 1,
    );
  }

  for (let index = 0; index < 18; index += 1) {
    const offset = index * 0.0032;
    add(
      `architecture:roof-left:strand-${index}`,
      [[0.18 + offset * 0.4, 0], [0.31 + offset * 0.2, 0.105 + offset], [0.458, 0.282 + offset * 0.15]],
      index,
      0x131,
      { start: 0, end: 0.34 },
      BEAD,
      0.7,
    );
    add(
      `architecture:roof-right:strand-${index}`,
      [[0.67 - offset * 0.2, 0], [0.63 - offset * 0.1, 0.11 + offset], [0.585, 0.242 + offset * 0.15]],
      index,
      0x132,
      { start: 0, end: 0.34 },
      BEAD,
      0.7,
    );
    add(
      `architecture:awning-left:strand-${index}`,
      [[0.09, 0.265 + offset], [0.245, 0.292 + offset * 0.7], [0.445, 0.37 + offset * 0.2]],
      index,
      0x133,
      { start: 0.10, end: 0.50 },
      index % 5 === 0 ? PALETTE.awningRed : PALETTE.limestoneShade,
      0.8,
    );
  }

  // Window edges are individual traced paths, not rectangles used as image-reveal cells.
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const side = sideIndex === 0 ? 'left' : 'right';
    for (let panel = 0; panel < 8; panel += 1) {
      const near = panel / 8;
      const x0 = side === 'left' ? lerp(0.055, 0.39, near) : lerp(0.62, 0.95, near);
      const width = lerp(0.040, 0.018, side === 'left' ? near : 1 - near);
      const y0 = 0.30 + (panel % 3) * 0.115;
      const height = 0.10 + (panel % 2) * 0.045;
      const edges: readonly (readonly ConstructionPoint[])[] = [
        [[x0, y0], [x0 + width, y0]],
        [[x0 + width, y0], [x0 + width, y0 + height]],
        [[x0 + width, y0 + height], [x0, y0 + height]],
        [[x0, y0 + height], [x0, y0]],
      ];
      for (let edge = 0; edge < edges.length; edge += 1) {
        add(
          `architecture:window-${side}:panel-${panel}-edge-${edge}`,
          edges[edge]!,
          panel * 4 + edge,
          side === 'left' ? 0x141 : 0x142,
          { start: 0.16, end: 0.66 },
          PALETTE.paneLight,
          0.65,
          edge === 1,
        );
      }
    }
  }

  const authorLamp = (name: string, x: number, top: number, bottom: number, scale: number, salt: number): void => {
    add(`architecture:lamp-${name}:pole`, [[x, bottom], [x - 0.003 * scale, lerp(bottom, top, 0.54)], [x, top + 0.038 * scale]], 0, salt, { start: 0.06, end: 0.50 }, PALETTE.lampGlass, 1.15 * scale);
    for (let index = 0; index < 5; index += 1) {
      const inset = index * 0.0022 * scale;
      add(
        `architecture:lamp-${name}:lantern-${index}`,
        [[x - (0.018 - inset) * scale, top + 0.028 * scale], [x - 0.011 * scale, top], [x + 0.011 * scale, top], [x + (0.018 - inset) * scale, top + 0.028 * scale], [x, top + 0.052 * scale], [x - (0.018 - inset) * scale, top + 0.028 * scale]],
        index + 1,
        salt,
        { start: 0.12, end: 0.56 },
        PALETTE.lampGlass,
        0.75 * scale,
        index === 0,
      );
    }
    for (let index = 0; index < 7; index += 1) {
      const y = lerp(top + 0.065 * scale, bottom, index / 6);
      const half = lerp(0.006, 0.014, index / 6) * scale;
      add(`architecture:lamp-${name}:base-${index}`, [[x - half, y], [x + half, y]], index + 8, salt, { start: 0.20, end: 0.62 }, PALETTE.lampGlass, 0.65 * scale, false);
    }
  };
  authorLamp('near', 0.566, 0.188, 0.704, 1, 0x151);
  authorLamp('far', 0.526, 0.342, 0.548, 0.58, 0x152);

  return strands;
}

/** Chair, table, cup, and ashtray paths measured from the actual Seed-33 source. */
function authorFurniture(seed: number): AuthoredStrand[] {
  const strands: AuthoredStrand[] = [];
  const add = (
    id: string,
    component: string,
    points: readonly ConstructionPoint[],
    index: number,
    salt: number,
    range: GrowthWindow,
    colour: Rgb,
    widthPx = 0.85,
    tip = true,
  ): void => {
    const window = staggeredWindow(range.start, range.end, index, seed, salt, 0.20, 0.38);
    strands.push({
      id,
      component,
      points,
      widthPx,
      colour,
      tipColour: TIP,
      window,
      retire: { start: Math.max(0.72, window.end + 0.10), end: 0.982 },
      tip,
    });
  };

  // Large left rattan chair: nested source-following curves plus wicker braces.
  for (let index = 0; index < 24; index += 1) {
    const inset = index * 0.0034;
    add(
      `chair:back-curve-${index}`,
      'chair',
      quadraticBezier([0, 0.505 + inset * 0.45], [0.218 - inset * 0.35, 0.49 + inset], [0.238 - inset * 0.20, 0.93], 16),
      index,
      0x211,
      { start: 0.06, end: 0.62 },
      index % 5 === 0 ? PALETTE.rattanLit : PALETTE.rattan,
      0.65 + (index % 4) * 0.09,
    );
  }
  for (let index = 0; index < 28; index += 1) {
    const t = index / 27;
    const start: ConstructionPoint = [lerp(0.005, 0.19, t), lerp(0.58, 0.69, t)];
    const end: ConstructionPoint = [lerp(0.035, 0.226, t), lerp(0.86, 0.94, t)];
    add(`chair:wicker-rib-${index}`, 'chair', [start, [lerp(start[0], end[0], 0.5) + 0.012, lerp(start[1], end[1], 0.5)], end], index, 0x212, { start: 0.12, end: 0.68 }, PALETTE.rattanLit, 0.62, index % 4 === 0);
  }

  // Table perspective threads originate around the rear edge and continue to the clipped lower frame.
  for (let index = 0; index < 92; index += 1) {
    const t = index / 91;
    const start: ConstructionPoint = [lerp(0.255, 0.755, t), 0.785 + Math.sin(t * Math.PI) * 0.012];
    const end: ConstructionPoint = [clamp01(lerp(-0.12, 1.12, t)), 1];
    add(`table:perspective-thread-${index}`, 'table', [start, [lerp(start[0], end[0], 0.48), 0.89], end], index, 0x221, { start: 0.10, end: 0.72 }, index % 7 === 0 ? PALETTE.marble : PALETTE.marbleShade, 0.55 + (index % 3) * 0.08, index % 6 === 0);
  }
  for (let index = 0; index < 9; index += 1) {
    add(`table:elliptical-course-${index}`, 'table', ellipsePoints(0.51, 0.905 + index * 0.0105, 0.49, 0.105 + index * 0.006, 46, Math.PI, Math.PI * 2), index, 0x222, { start: 0.16, end: 0.72 }, PALETTE.marble, 0.72, index % 2 === 0);
  }

  // Cup at x~.72, spanning y~.75-.93, including saucer and handle.
  for (let index = 0; index < 7; index += 1) {
    const t = index / 6;
    add(`cup:rim-course-${index}`, 'cup', ellipsePoints(0.715, lerp(0.758, 0.785, t), lerp(0.071, 0.062, t), lerp(0.021, 0.017, t), 28), index, 0x231, { start: 0.14, end: 0.66 }, PALETTE.cupWhite, 0.85, index < 2);
  }
  for (let index = 0; index < 34; index += 1) {
    const angle = lerp(Math.PI, Math.PI * 2, index / 33);
    const top: ConstructionPoint = [0.715 + Math.cos(angle) * 0.069, 0.775 + Math.sin(angle) * 0.020];
    const bottom: ConstructionPoint = [0.715 + Math.cos(angle) * 0.052, 0.882 + Math.sin(angle) * 0.014];
    add(`cup:wall-rib-${index}`, 'cup', oriented([bottom, [lerp(bottom[0], top[0], 0.54), 0.825], top], index % 4 === 0), index, 0x232, { start: 0.20, end: 0.72 }, index % 5 === 0 ? PALETTE.cupWhite : PALETTE.cupShade, 0.68, index % 5 === 0);
  }
  for (let index = 0; index < 6; index += 1) {
    add(`cup:saucer-${index}`, 'cup', ellipsePoints(0.718, 0.902 + index * 0.005, 0.126 - index * 0.008, 0.035 - index * 0.002, 34), index, 0x233, { start: 0.24, end: 0.74 }, PALETTE.saucer, 0.75, index === 0);
    add(`cup:handle-${index}`, 'cup', ellipsePoints(0.792, 0.824, 0.036 - index * 0.0035, 0.058 - index * 0.004, 18, -Math.PI / 2, Math.PI / 2), index, 0x234, { start: 0.26, end: 0.74 }, PALETTE.cupWhite, 0.72, index === 0);
  }

  // Ashtray at x~.33 with stacked glass loops and rising ribs.
  for (let index = 0; index < 8; index += 1) {
    add(`ashtray:glass-loop-${index}`, 'ashtray', ellipsePoints(0.333, 0.865 + index * 0.0105, 0.072 - index * 0.002, 0.024 - index * 0.0008, 28), index, 0x241, { start: 0.12, end: 0.66 }, index % 2 === 0 ? PALETTE.glassLight : PALETTE.glass, 0.72, index < 2);
  }
  for (let index = 0; index < 22; index += 1) {
    const angle = lerp(Math.PI, Math.PI * 2, index / 21);
    const top: ConstructionPoint = [0.333 + Math.cos(angle) * 0.07, 0.867 + Math.sin(angle) * 0.023];
    const bottom: ConstructionPoint = [0.333 + Math.cos(angle) * 0.058, 0.942 + Math.sin(angle) * 0.017];
    add(`ashtray:wall-rib-${index}`, 'ashtray', [bottom, top], index, 0x242, { start: 0.20, end: 0.70 }, PALETTE.glassLight, 0.62, index % 5 === 0);
  }

  return strands;
}

interface SourceTriangle {
  id: string;
  component: string;
  texture: ConstructionTexture;
  destination: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint];
  source: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint];
  anchor: ConstructionPoint;
  sourceAnchor: ConstructionPoint;
  window: GrowthWindow;
}

const BACKGROUND_BOUNDARY: readonly ConstructionPoint[] = [
  [0, 0], [0.12, 0], [0.24, 0], [0.36, 0], [0.48, 0], [0.60, 0], [0.72, 0], [0.84, 0], [1, 0],
  [1, 0.16], [1, 0.32], [1, 0.50], [1, 0.68], [1, 0.84], [1, 1],
  [0.84, 1], [0.68, 1], [0.52, 1], [0.36, 1], [0.20, 1], [0, 1],
  [0, 0.84], [0, 0.68], [0, 0.50], [0, 0.32], [0, 0.16],
];

const FOREGROUND_BOUNDARY: readonly ConstructionPoint[] = [
  [0, 0], [0.20, 0], [0.40, 0], [0.60, 0], [0.80, 0], [1, 0],
  [1, 0.20], [1, 0.40], [1, 0.60], [1, 0.80], [1, 1],
  [0.82, 1], [0.64, 1], [0.46, 1], [0.28, 1], [0.10, 1], [0, 1],
  [0, 0.80], [0, 0.60], [0, 0.40], [0, 0.20],
];

function centroid(points: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint]): ConstructionPoint {
  return [
    (points[0][0] + points[1][0] + points[2][0]) / 3,
    (points[0][1] + points[1][1] + points[2][1]) / 3,
  ];
}

function authorBackgroundMesh(seed: number): SourceTriangle[] {
  const center: ConstructionPoint = [0.535, 0.285];
  const triangles: SourceTriangle[] = [];
  for (let index = 0; index < BACKGROUND_BOUNDARY.length; index += 1) {
    const a = BACKGROUND_BOUNDARY[index]!;
    const b = BACKGROUND_BOUNDARY[(index + 1) % BACKGROUND_BOUNDARY.length]!;
    const edgeMid: ConstructionPoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let semantic = 'street';
    let range: GrowthWindow = { start: 0.44, end: 0.965 };
    let salt = 0x311;
    if (a[1] === 0 && b[1] === 0 && edgeMid[0] >= 0.22 && edgeMid[0] <= 0.68) {
      semantic = 'sky';
      range = { start: 0.10, end: 0.80 };
      salt = 0x312;
    } else if (edgeMid[0] < 0.48 && edgeMid[1] < 0.94) {
      semantic = edgeMid[1] > 0.72 ? 'chair-field' : 'facade-left';
      range = { start: 0.28, end: semantic === 'chair-field' ? 0.95 : 0.90 };
      salt = 0x313;
    } else if (edgeMid[0] > 0.58 && edgeMid[1] < 0.94) {
      semantic = 'facade-right';
      range = { start: 0.30, end: 0.92 };
      salt = 0x314;
    }
    const destination = [center, a, b] as const;
    const anchor = centroid(destination);
    triangles.push({
      id: `architecture:surface-${semantic}:triangle-${index}`,
      component: 'architecture',
      texture: 'background',
      destination,
      source: destination,
      anchor,
      sourceAnchor: anchor,
      window: staggeredWindow(range.start, range.end, index, seed, salt, 0.34, 0.58),
    });
  }
  return triangles;
}

function foregroundSemantic(edgeMid: ConstructionPoint): { component: string; semantic: string; range: GrowthWindow; salt: number } {
  if (edgeMid[1] > 0.72 && edgeMid[0] < 0.45) return { component: 'ashtray', semantic: 'ashtray-field', range: { start: 0.56, end: 0.96 }, salt: 0x321 };
  if ((edgeMid[1] > 0.70 && edgeMid[0] > 0.53) || edgeMid[0] > 0.86) return { component: 'cup', semantic: 'cup-field', range: { start: 0.58, end: 0.97 }, salt: 0x322 };
  return { component: 'table', semantic: 'table-field', range: { start: 0.52, end: 0.965 }, salt: 0x323 };
}

function authorForegroundMesh(seed: number): SourceTriangle[] {
  const center: ConstructionPoint = [0.52, 0.86];
  const triangles: SourceTriangle[] = [];
  for (let index = 0; index < FOREGROUND_BOUNDARY.length; index += 1) {
    const a = FOREGROUND_BOUNDARY[index]!;
    const b = FOREGROUND_BOUNDARY[(index + 1) % FOREGROUND_BOUNDARY.length]!;
    const semantic = foregroundSemantic([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    const destination = [center, a, b] as const;
    const anchor = centroid(destination);
    triangles.push({
      id: `${semantic.component}:surface-${semantic.semantic}:triangle-${index}`,
      component: semantic.component,
      texture: 'foreground',
      destination,
      source: destination,
      anchor,
      sourceAnchor: anchor,
      window: staggeredWindow(semantic.range.start, semantic.range.end, index, seed, semantic.salt, 0.34, 0.58),
    });
  }
  return triangles;
}

function textureVertex(destination: ConstructionPoint, source: ConstructionPoint): ConstructionTextureVertex {
  return { x: destination[0], y: destination[1], u: source[0], v: source[1] };
}

function emitSourceTriangle(output: ConstructionCommand[], triangle: SourceTriangle, progress: number, timeMs: number, seed: number): void {
  const local = smoothstep(triangle.window.start, triangle.window.end, progress);
  if (local <= 0) return;
  const vertices = triangle.destination.map((destination, index) => textureVertex(
    destination,
    triangle.source[index]!,
  )) as [ConstructionTextureVertex, ConstructionTextureVertex, ConstructionTextureVertex];
  output.push(...matrixMaterialPatches({
    patch: { kind: 'texture', id: triangle.id, component: triangle.component, alpha: 1, texture: triangle.texture, vertices },
    localProgress: local,
    timeMs,
    seed,
  }));
}

interface FigureJoint {
  id: string;
  point: ConstructionPoint;
}
interface FigureBone {
  id: string;
  a: ConstructionPoint;
  b: ConstructionPoint;
}
interface FigureSkeleton {
  joints: readonly FigureJoint[];
  bones: readonly FigureBone[];
  byId: ReadonlyMap<string, ConstructionPoint>;
}

function buildFigureSkeleton(x0: number, y0: number, x1: number, y1: number): FigureSkeleton {
  const width = x1 - x0;
  const height = y1 - y0;
  const cx = (x0 + x1) / 2;
  const point = (x: number, y: number): ConstructionPoint => [x0 + width * x, y0 + height * y];
  const joints: FigureJoint[] = [
    { id: 'head', point: [cx, y0 + height * 0.075] },
    { id: 'neck', point: [cx, y0 + height * 0.17] },
    { id: 'shoulder-left', point: point(0.28, 0.20) },
    { id: 'shoulder-right', point: point(0.72, 0.20) },
    { id: 'elbow-left', point: point(0.18, 0.38) },
    { id: 'elbow-right', point: point(0.82, 0.38) },
    { id: 'wrist-left', point: point(0.35, 0.52) },
    { id: 'wrist-right', point: point(0.65, 0.52) },
    { id: 'chest', point: point(0.50, 0.34) },
    { id: 'pelvis', point: point(0.50, 0.55) },
    { id: 'hip-left', point: point(0.39, 0.55) },
    { id: 'hip-right', point: point(0.61, 0.55) },
    { id: 'knee-left', point: point(0.42, 0.78) },
    { id: 'knee-right', point: point(0.60, 0.78) },
    { id: 'ankle-left', point: point(0.45, 0.95) },
    { id: 'ankle-right', point: point(0.58, 0.95) },
    { id: 'foot-left', point: point(0.43, 1.00) },
    { id: 'foot-right', point: point(0.61, 1.00) },
  ];
  const byId = new Map(joints.map((joint) => [joint.id, joint.point] as const));
  const bone = (id: string, a: string, b: string): FigureBone => ({ id, a: byId.get(a)!, b: byId.get(b)! });
  const bones: FigureBone[] = [
    bone('head-neck', 'head', 'neck'),
    bone('collar-left', 'neck', 'shoulder-left'),
    bone('collar-right', 'neck', 'shoulder-right'),
    bone('arm-left-upper', 'shoulder-left', 'elbow-left'),
    bone('arm-left-lower', 'elbow-left', 'wrist-left'),
    bone('arm-right-upper', 'shoulder-right', 'elbow-right'),
    bone('arm-right-lower', 'elbow-right', 'wrist-right'),
    bone('spine-upper', 'neck', 'chest'),
    bone('spine-lower', 'chest', 'pelvis'),
    bone('pelvis-left', 'pelvis', 'hip-left'),
    bone('pelvis-right', 'pelvis', 'hip-right'),
    bone('leg-left-upper', 'hip-left', 'knee-left'),
    bone('leg-left-lower', 'knee-left', 'ankle-left'),
    bone('foot-left', 'ankle-left', 'foot-left'),
    bone('leg-right-upper', 'hip-right', 'knee-right'),
    bone('leg-right-lower', 'knee-right', 'ankle-right'),
    bone('foot-right', 'ankle-right', 'foot-right'),
  ];
  return { joints, bones, byId };
}

interface VolumePart {
  id: string;
  anchor: ConstructionPoint;
  ring: readonly ConstructionPoint[];
}

function ellipseRing(center: ConstructionPoint, rx: number, ry: number, segments: number): ConstructionPoint[] {
  return Array.from({ length: segments }, (_, index): ConstructionPoint => {
    const angle = (Math.PI * 2 * index) / segments;
    return [clamp01(center[0] + Math.cos(angle) * rx), clamp01(center[1] + Math.sin(angle) * ry)];
  });
}

function capsuleRing(a: ConstructionPoint, b: ConstructionPoint, radius: number, capSegments = 5): ConstructionPoint[] {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const points: ConstructionPoint[] = [];
  for (let index = 0; index <= capSegments; index += 1) {
    const theta = angle - Math.PI / 2 + (Math.PI * index) / capSegments;
    points.push([clamp01(b[0] + Math.cos(theta) * radius), clamp01(b[1] + Math.sin(theta) * radius)]);
  }
  for (let index = 0; index <= capSegments; index += 1) {
    const theta = angle + Math.PI / 2 + (Math.PI * index) / capSegments;
    points.push([clamp01(a[0] + Math.cos(theta) * radius), clamp01(a[1] + Math.sin(theta) * radius)]);
  }
  return points;
}

function buildVolumeParts(skeleton: FigureSkeleton, x0: number, y0: number, x1: number, y1: number): VolumePart[] {
  const width = x1 - x0;
  const height = y1 - y0;
  const joint = (id: string): ConstructionPoint => skeleton.byId.get(id)!;
  const capsule = (id: string, from: string, to: string, radius: number): VolumePart => {
    const a = joint(from);
    const b = joint(to);
    return { id, anchor: mixPoint(a, b, 0.5), ring: capsuleRing(a, b, radius) };
  };
  return [
    { id: 'head', anchor: joint('head'), ring: ellipseRing(joint('head'), width * 0.22, height * 0.072, 14) },
    { id: 'torso', anchor: joint('chest'), ring: ellipseRing(joint('chest'), width * 0.27, height * 0.19, 16) },
    { id: 'hips', anchor: joint('pelvis'), ring: ellipseRing(joint('pelvis'), width * 0.23, height * 0.10, 14) },
    capsule('arm-left-upper', 'shoulder-left', 'elbow-left', width * 0.080),
    capsule('arm-left-lower', 'elbow-left', 'wrist-left', width * 0.065),
    capsule('arm-right-upper', 'shoulder-right', 'elbow-right', width * 0.080),
    capsule('arm-right-lower', 'elbow-right', 'wrist-right', width * 0.065),
    capsule('leg-left-upper', 'hip-left', 'knee-left', width * 0.095),
    capsule('leg-left-lower', 'knee-left', 'ankle-left', width * 0.070),
    capsule('leg-right-upper', 'hip-right', 'knee-right', width * 0.095),
    capsule('leg-right-lower', 'knee-right', 'ankle-right', width * 0.070),
  ];
}

function authorGarmentMesh(seed: number, x0: number, y0: number, x1: number, y1: number, skeleton: FigureSkeleton): SourceTriangle[] {
  const chest = skeleton.byId.get('chest')!;
  const boundary: readonly ConstructionPoint[] = [
    [x0, y0], [(x0 + x1) / 2, y0], [x1, y0],
    [x1, lerp(y0, y1, 0.18)], [x1, lerp(y0, y1, 0.42)], [x1, lerp(y0, y1, 0.68)], [x1, y1],
    [(x0 + x1) / 2, y1], [x0, y1],
    [x0, lerp(y0, y1, 0.68)], [x0, lerp(y0, y1, 0.42)], [x0, lerp(y0, y1, 0.18)],
  ];
  const uvOf = (point: ConstructionPoint): ConstructionPoint => [
    (point[0] - x0) / (x1 - x0),
    (point[1] - y0) / (y1 - y0),
  ];
  const labels = ['hood-left', 'hood-right', 'shoulder-right', 'sleeve-right', 'coat-right', 'boot-right', 'hem-right', 'hem-left', 'boot-left', 'coat-left', 'sleeve-left', 'shoulder-left'] as const;
  return boundary.map((a, index): SourceTriangle => {
    const b = boundary[(index + 1) % boundary.length]!;
    const destination = [chest, a, b] as const;
    return {
      id: `figure:garment:panel-${labels[index]}`,
      component: 'figure',
      texture: 'figure',
      destination,
      source: [uvOf(chest), uvOf(a), uvOf(b)],
      anchor: chest,
      sourceAnchor: uvOf(chest),
      window: staggeredWindow(FIGURE_GARMENT_START, FIGURE_COMPLETE_START, index, seed, 0x411, 0.30, 0.52),
    };
  });
}

function authorGarmentSeams(seed: number, skeleton: FigureSkeleton, x0: number, y0: number, x1: number, y1: number): AuthoredStrand[] {
  const joint = (id: string): ConstructionPoint => skeleton.byId.get(id)!;
  const centerX = (x0 + x1) / 2;
  const seamSpecs: ReadonlyArray<{ id: string; points: readonly ConstructionPoint[] }> = [
    { id: 'hood-left', points: quadraticBezier(joint('neck'), [x0 + (x1 - x0) * 0.12, y0 + (y1 - y0) * 0.05], [centerX, y0], 8) },
    { id: 'hood-right', points: quadraticBezier([centerX, y0], [x1 - (x1 - x0) * 0.12, y0 + (y1 - y0) * 0.05], joint('neck'), 8) },
    { id: 'lapel-left', points: [joint('neck'), [centerX - (x1 - x0) * 0.12, y0 + (y1 - y0) * 0.33], joint('wrist-left')] },
    { id: 'lapel-right', points: [joint('neck'), [centerX + (x1 - x0) * 0.12, y0 + (y1 - y0) * 0.33], joint('wrist-right')] },
    { id: 'sleeve-left', points: [joint('shoulder-left'), joint('elbow-left'), joint('wrist-left')] },
    { id: 'sleeve-right', points: [joint('shoulder-right'), joint('elbow-right'), joint('wrist-right')] },
    { id: 'coat-left', points: [joint('shoulder-left'), [x0 + (x1 - x0) * 0.15, lerp(y0, y1, 0.58)], [x0 + (x1 - x0) * 0.27, lerp(y0, y1, 0.82)]] },
    { id: 'coat-right', points: [joint('shoulder-right'), [x1 - (x1 - x0) * 0.15, lerp(y0, y1, 0.58)], [x1 - (x1 - x0) * 0.27, lerp(y0, y1, 0.82)]] },
    { id: 'center-ribbon', points: [joint('neck'), joint('chest'), joint('pelvis'), [centerX, lerp(y0, y1, 0.82)]] },
    { id: 'hem', points: [[x0 + (x1 - x0) * 0.27, lerp(y0, y1, 0.82)], [centerX, lerp(y0, y1, 0.85)], [x1 - (x1 - x0) * 0.27, lerp(y0, y1, 0.82)]] },
    { id: 'boot-left', points: [joint('knee-left'), joint('ankle-left'), joint('foot-left')] },
    { id: 'boot-right', points: [joint('knee-right'), joint('ankle-right'), joint('foot-right')] },
  ];
  return seamSpecs.map((spec, index): AuthoredStrand => ({
    id: `figure:garment:seam-${spec.id}`,
    component: 'figure',
    points: spec.points,
    widthPx: 0.9 + (index % 3) * 0.18,
    colour: index < 2 ? PALETTE.hair : PALETTE.limestoneLit,
    tipColour: TIP,
    window: staggeredWindow(FIGURE_GARMENT_START, 0.90, index, seed, 0x412, 0.34, 0.58),
    retire: { start: 0.92, end: 0.985 },
    tip: true,
  }));
}

interface FigureGeometry {
  skeleton: FigureSkeleton;
  volume: readonly VolumePart[];
  garment: readonly SourceTriangle[];
  seams: readonly AuthoredStrand[];
}

const CACHE_LIMIT = 8;
const ARCHITECTURE_CACHE = new Map<number, readonly AuthoredStrand[]>();
const FURNITURE_CACHE = new Map<number, readonly AuthoredStrand[]>();
const BACKGROUND_CACHE = new Map<number, readonly SourceTriangle[]>();
const FOREGROUND_CACHE = new Map<number, readonly SourceTriangle[]>();
const FIGURE_CACHE = new Map<string, FigureGeometry>();

function cached<K, V>(cache: Map<K, V>, key: K, build: () => V): V {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const value = build();
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return value;
}

const FALLBACK_HOME_RECT: readonly [number, number, number, number] = [0.321127792, 0.3489583333, 0.4046136946, 0.7545572917];

function resolveHomeRect(manifest: PhotoManifestData | null | undefined): readonly [number, number, number, number] {
  const rect = manifest?.figureHomeRectNorm;
  if (!Array.isArray(rect) || rect.length !== 4) return FALLBACK_HOME_RECT;
  const [x0, y0, x1, y1] = rect;
  if (![x0, y0, x1, y1].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) || x1 <= x0 || y1 <= y0) return FALLBACK_HOME_RECT;
  return [x0, y0, x1, y1];
}

function resolveTileRegions(manifest: PhotoManifestData | null | undefined): readonly PhotoTileRegion[] {
  return Array.isArray(manifest?.tileRegions) ? manifest.tileRegions.slice(0, 256) : [];
}

function resolveAtlasSize(manifest: PhotoManifestData | null | undefined): readonly [number, number] {
  const size = manifest?.tilesAtlasSizePx;
  if (!Array.isArray(size) || size.length !== 2 || !size.every((value) => Number.isFinite(value) && value > 0)) return [1, 1];
  return [size[0], size[1]];
}

function emitTile(
  output: ConstructionCommand[],
  region: PhotoTileRegion,
  index: number,
  seed: number,
  atlasSize: readonly [number, number],
  progress: number,
  counters: { moving: number },
  timeMs: number,
): void {
  const window = staggeredWindow(0.48, 0.975, index, seed, 0x511, 0.28, 0.48);
  const local = smoothstep(window.start, window.end, progress);
  if (local <= 0) return;
  const patches = matrixTilePatches({ region, atlasSizePx: atlasSize, index, localProgress: local, timeMs, seed });
  if (patches.length > 0 && local < 1) counters.moving += 1;
  output.push(...patches);
  // Post-formation glitch overlay (w4-20261009-seed33-formed-glitch-r1): once this box has reached its
  // settled rest shape (the two triangles matrixTilePatches just pushed above), additionally paint the
  // SAME bounded, sparse, repeating glitch burst the settled Canvas2D/WebGL2 renderers reuse once the
  // build completes, so a box keeps glitching through the rest of the build instead of going fully static
  // the instant it forms. No-op ([]) during a rest window; never alters the matrixTilePatches output above.
  if (local >= 1) {
    output.push(...formedTileGlitchPatches({ region, atlasSizePx: atlasSize, index, timeMs, seed }));
  }
}

function emitFigure(
  output: ConstructionCommand[],
  figure: FigureGeometry,
  progress: number,
  seed: number,
  counters: StrandCounters,
  timeMs: number,
): void {
  // Articulated scaffold, including independently visible elbows, wrists, arms, hips, knees, and ankles.
  const scaffoldAlpha = 1 - smoothstep(0.50, 0.72, progress);
  for (let index = 0; index < figure.skeleton.joints.length; index += 1) {
    const joint = figure.skeleton.joints[index]!;
    const window = staggeredWindow(FIGURE_SCAFFOLD_START, FIGURE_VOLUME_START, index, seed, 0x611, 0.32, 0.58);
    const local = smoothstep(window.start, window.end, progress);
    if (local <= 0 || scaffoldAlpha <= 1e-6) continue;
    output.push({ kind: 'disc', id: `figure:scaffold:joint-${joint.id}`, component: 'figure', alpha: scaffoldAlpha, center: joint.point, radiusPx: 2.1, colour: TIP });
  }
  for (let index = 0; index < figure.skeleton.bones.length; index += 1) {
    const bone = figure.skeleton.bones[index]!;
    emitStrand(output, {
      id: `figure:scaffold:bone-${bone.id}`,
      component: 'figure',
      points: [bone.a, bone.b],
      widthPx: 1.15,
      colour: TIP,
      tipColour: TIP,
      window: staggeredWindow(FIGURE_SCAFFOLD_START, FIGURE_VOLUME_START, index, seed, 0x612, 0.34, 0.58),
      retire: { start: 0.50, end: 0.72 },
      tip: true,
    }, progress, counters);
  }

  // Rounded opaque ellipse/capsule meshes expand from each anatomical anchor.
  const volumeRetirement = 1 - smoothstep(0.88, 0.985, progress);
  for (let partIndex = 0; partIndex < figure.volume.length; partIndex += 1) {
    const part = figure.volume[partIndex]!;
    const window = staggeredWindow(FIGURE_VOLUME_START, FIGURE_GARMENT_START, partIndex, seed, 0x621, 0.38, 0.62);
    const local = smoothstep(window.start, window.end, progress);
    if (local <= 0 || volumeRetirement <= 1e-6) continue;
    for (let triangleIndex = 0; triangleIndex < part.ring.length; triangleIndex += 1) {
      const a = mixPoint(part.anchor, part.ring[triangleIndex]!, local);
      const b = mixPoint(part.anchor, part.ring[(triangleIndex + 1) % part.ring.length]!, local);
      output.push(...matrixSolidCommands({
        solid: {
          kind: 'solid',
          id: `figure:volume:${part.id}:triangle-${triangleIndex}`,
          component: 'figure',
          alpha: volumeRetirement,
          points: [part.anchor, a, b],
          colour: part.id === 'head' ? PALETTE.skin : PALETTE.camelShade,
        },
        localProgress: local,
        timeMs,
        seed,
      }));
    }
  }

  // Source-textured garment triangles grow over the retained body; real seam/ribbon paths are painted
  // afterward so both layers remain visibly legible throughout the garment window.
  for (const triangle of figure.garment) emitSourceTriangle(output, triangle, progress, timeMs, seed);
  for (const seam of figure.seams) emitStrand(output, seam, progress, counters);
}

export function buildSeed33Construction(input: ConstructionInput): ConstructionPlan {
  const inactive = (): ConstructionPlan => ({
    active: false,
    progress: 1,
    figureStage: 'complete',
    commands: [],
    stats: { growingStrands: 0, completedStrands: 0, movingTiles: 0 },
  });

  const buildMs = Number.isFinite(input.buildMs) ? input.buildMs : 0;
  if (!(buildMs > 0) || input.reducedMotion) return inactive();
  const timeMs = Math.max(0, Number.isFinite(input.timeMs) ? input.timeMs : 0);
  if (timeMs >= buildMs) return inactive();

  const progress = clamp01(timeMs / buildMs);
  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed) >>> 0 : 0;
  const [x0, y0, x1, y1] = resolveHomeRect(input.manifest);
  const figureKey = `${seed}|${x0},${y0},${x1},${y1}`;
  const figure = cached(FIGURE_CACHE, figureKey, (): FigureGeometry => {
    const skeleton = buildFigureSkeleton(x0, y0, x1, y1);
    return {
      skeleton,
      volume: buildVolumeParts(skeleton, x0, y0, x1, y1),
      garment: authorGarmentMesh(seed, x0, y0, x1, y1, skeleton),
      seams: authorGarmentSeams(seed, skeleton, x0, y0, x1, y1),
    };
  });

  const commands: ConstructionCommand[] = [];
  const strandCounters: StrandCounters = { growing: 0, completed: 0 };
  const tileCounters = { moving: 0 };

  // Match the settled renderers: background, figure, foreground occlusion, then overlay tiles.
  const architecture = cached(ARCHITECTURE_CACHE, seed, () => authorArchitecture(seed));
  for (const strand of architecture) emitStrand(commands, strand, progress, strandCounters);
  const background = cached(BACKGROUND_CACHE, seed, () => authorBackgroundMesh(seed));
  for (const triangle of background) emitSourceTriangle(commands, triangle, progress, timeMs, seed);

  emitFigure(commands, figure, progress, seed, strandCounters, timeMs);

  const furniture = cached(FURNITURE_CACHE, seed, () => authorFurniture(seed));
  for (const strand of furniture) emitStrand(commands, strand, progress, strandCounters);
  const foreground = cached(FOREGROUND_CACHE, seed, () => authorForegroundMesh(seed));
  for (const triangle of foreground) emitSourceTriangle(commands, triangle, progress, timeMs, seed);

  if (input.showTiles) {
    const tileRegions = resolveTileRegions(input.manifest);
    const atlasSize = resolveAtlasSize(input.manifest);
    for (let index = 0; index < tileRegions.length; index += 1) {
      emitTile(commands, tileRegions[index]!, index, seed, atlasSize, progress, tileCounters, timeMs);
    }
  }

  return {
    active: true,
    progress,
    figureStage: figureStageFor(progress),
    commands: commands.length > CONSTRUCTION_COMMAND_LIMIT ? commands.slice(0, CONSTRUCTION_COMMAND_LIMIT) : commands,
    stats: {
      growingStrands: strandCounters.growing,
      completedStrands: strandCounters.completed,
      movingTiles: tileCounters.moving,
    },
  };
}
