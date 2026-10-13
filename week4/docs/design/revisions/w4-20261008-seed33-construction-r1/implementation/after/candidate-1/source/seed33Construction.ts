// Seed-33 component-construction planner (w4-20261008-seed33-construction-r1).
//
// Pure, deterministic, data-only staged-geometry builder. Both renderers consume the ordered
// `ConstructionCommand[]` this module returns; no shader/code/runtime image analysis happens here.
// See the inspected Weave reference packet this pass is built from:
//   week4/docs/design/revisions/w4-20261008-seed33-construction-r1/REVIEW.md
//   week4/docs/design/revisions/w4-20261008-seed33-construction-r1/IMPLEMENTATION_CONTRACT.md
// Image inspection: img-01-early-anchors.png (sparse umber field, bead figure rig, incomplete
// furniture arcs/roofline anchors, a few already-solid tile fragments) and img-02-component-assembly.png
// (facade strand weave, chair wicker arcs, table radial rim sectors, cup/ashtray rings+ribs, a figure
// with a visible leg scaffold under a forming body volume, moving coral/cream/sage tile fragments).
// Motion inspection (vid-02-sheet-2fps.png / vid-02-figure-sheet-2fps.png, 0-10s @ 2fps): contour-before-
// surface timing and asynchronous panel translation/settle are reused below; the video's own shortcomings
// are NOT reproduced: architecture does not fill in 1-2s here (it is spread across most of the build),
// the figure gets three genuinely distinct, separately-timed geometry stages instead of one rapid 3.5-7s
// coat pop, and there is no invented sweeping decorative arc beside the figure.
//
// Painter order (background -> figure -> tiles -> foreground) matches the existing photo layer's own
// occlusion order (foreground is redrawn over the figure in seed33Photo.ts/the backends), so furniture
// scaffolds/surfaces are authored as the "foreground" group and emitted last.
import type {
  ConstructionCommand,
  ConstructionInput,
  ConstructionPatch,
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

// ---------------------------------------------------------------------------
// Small local math helpers (deliberately not imported from seed33Photo.ts/other writers' modules, to
// keep this file's only project-internal dependencies the frozen type contract plus pre-existing,
// already-stable scene/palette/rng modules none of the four isolated writers own or edit).
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;
const smoothstep = (e0: number, e1: number, x: number): number => {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Figure stage windows, as fractions of buildMs (IMPLEMENTATION_CONTRACT.md suggested values).
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

// ---------------------------------------------------------------------------
// Growth primitive: a strand/stroke is authored as a fixed polyline; at a given local progress in
// [0,1] only the already-grown prefix is returned, with the final segment interpolated so the bright
// tip travels smoothly between authored points rather than jumping.
function growPolyline(points: readonly ConstructionPoint[], t: number): readonly ConstructionPoint[] {
  if (points.length === 0) return points;
  if (t <= 0) return [points[0]!];
  if (t >= 1) return points;
  const segments = points.length - 1;
  if (segments <= 0) return points;
  const scaled = t * segments;
  const idx = Math.min(segments - 1, Math.floor(scaled));
  const localT = scaled - idx;
  const a = points[idx]!;
  const b = points[idx + 1]!;
  const tip: ConstructionPoint = [lerp(a[0], b[0], localT), lerp(a[1], b[1], localT)];
  return [...points.slice(0, idx + 1), tip];
}

interface GrowthWindow {
  start: number;
  end: number;
}

/** A deterministic per-item window inside [rangeStart, rangeEnd], staggered by `index`/`seed`/`salt`. */
function staggeredWindow(rangeStart: number, rangeEnd: number, index: number, seed: number, salt: number, widthFrac: number): GrowthWindow {
  const span = Math.max(0, rangeEnd - rangeStart);
  if (span <= 0) return { start: rangeStart, end: rangeStart };
  const h1 = hash01(index, (seed ^ salt) >>> 0);
  const h2 = hash01(index + 10007, (seed ^ (salt + 3)) >>> 0);
  const start = rangeStart + h1 * span * (1 - widthFrac);
  const width = Math.max(span * 0.02, span * widthFrac * (0.6 + 0.4 * h2));
  return { start, end: Math.min(rangeEnd, start + width) };
}

interface AuthoredStrand {
  id: string;
  component: string;
  points: readonly ConstructionPoint[];
  widthPx: number;
  colour: Rgb;
  tipColour: Rgb;
  window: GrowthWindow;
  tip: boolean;
}

interface StrandCounters {
  growing: number;
  completed: number;
}

function emitStrand(out: ConstructionCommand[], strand: AuthoredStrand, progress: number, counters: StrandCounters): void {
  const local = smoothstep(strand.window.start, strand.window.end, progress);
  if (local <= 0) return;
  const grown = growPolyline(strand.points, local);
  out.push({ kind: 'stroke', id: strand.id, component: strand.component, alpha: 1, points: grown, widthPx: strand.widthPx, colour: strand.colour });
  if (local >= 1) counters.completed += 1;
  else counters.growing += 1;
  if (strand.tip && local > 0 && local < 1) {
    const tipPoint = grown[grown.length - 1]!;
    out.push({
      kind: 'disc',
      id: `${strand.id}:tip`,
      component: strand.component,
      alpha: 1,
      center: tipPoint,
      radiusPx: strand.widthPx * 1.8,
      colour: strand.tipColour,
    });
  }
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, count: number, startAngle = 0, endAngle = Math.PI * 2): ConstructionPoint[] {
  const pts: ConstructionPoint[] = [];
  for (let i = 0; i <= count; i++) {
    const a = startAngle + ((endAngle - startAngle) * i) / count;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Architecture: facade/roofline/window/lamp paths (background layer). Individually timed strands with
// staggered starts/directions, per the inspected images' strand-by-strand facade weave.
const SALT_FACADE_L = 0x1a;
const SALT_FACADE_R = 0x1b;
const SALT_ROOF = 0x1c;
const SALT_WINDOW = 0x1d;
const SALT_LAMP = 0x1e;
const SALT_AWNING = 0x1f;

const BEAD = PALETTE.limestoneLit;
const BEAD_TIP = PALETTE.cupWhite;
const ARCH_RANGE: GrowthWindow = { start: 0.0, end: 0.58 };

function authorArchitecture(seed: number): AuthoredStrand[] {
  const strands: AuthoredStrand[] = [];

  const sides: ReadonlyArray<{ side: 'left' | 'right'; x0: number; salt: number }> = [
    { side: 'left', x0: 0.03, salt: SALT_FACADE_L },
    { side: 'right', x0: 0.615, salt: SALT_FACADE_R },
  ];
  for (const { side, x0, salt } of sides) {
    for (let i = 0; i < 10; i++) {
      const jitterX = (hash01(i, (seed ^ salt) >>> 0) - 0.5) * 0.01;
      const x = x0 + i * 0.035 + jitterX;
      const yTop = 0.08 + hash01(i + 50, (seed ^ salt) >>> 0) * 0.03;
      const yBottom = 0.9 + hash01(i + 90, (seed ^ salt) >>> 0) * 0.03;
      const points: ConstructionPoint[] = [
        [x, yTop],
        [x, lerp(yTop, yBottom, 0.33)],
        [x, lerp(yTop, yBottom, 0.66)],
        [x, yBottom],
      ];
      strands.push({
        id: `architecture:facade-${side}:strand-${i}`,
        component: 'architecture',
        points,
        widthPx: 1.4,
        colour: BEAD,
        tipColour: BEAD_TIP,
        window: staggeredWindow(ARCH_RANGE.start, ARCH_RANGE.end, i, seed, salt, 0.4),
        tip: true,
      });
    }
  }

  // Roofline: two diagonals from the facade top corners to a shared vanishing point (quick, early).
  const vanishing: ConstructionPoint = [0.5, 0.165];
  strands.push({
    id: 'architecture:roofline:left',
    component: 'architecture',
    points: [[0.03, 0.08], [0.26, 0.12], vanishing],
    widthPx: 1.6,
    colour: BEAD,
    tipColour: BEAD_TIP,
    window: staggeredWindow(0.0, 0.2, 0, seed, SALT_ROOF, 0.6),
    tip: true,
  });
  strands.push({
    id: 'architecture:roofline:right',
    component: 'architecture',
    points: [[0.97, 0.08], [0.74, 0.12], vanishing],
    widthPx: 1.6,
    colour: BEAD,
    tipColour: BEAD_TIP,
    window: staggeredWindow(0.0, 0.2, 1, seed, SALT_ROOF, 0.6),
    tip: true,
  });

  // Awning edge hint, upper-left facade.
  strands.push({
    id: 'architecture:awning:edge',
    component: 'architecture',
    points: [[0.05, 0.235], [0.17, 0.255], [0.30, 0.275]],
    widthPx: 1.8,
    colour: PALETTE.awningRed,
    tipColour: BEAD_TIP,
    window: staggeredWindow(0.04, 0.26, 0, seed, SALT_AWNING, 0.55),
    tip: true,
  });

  // Lamp posts: near + far, each a pole and a short cross-arm; the lantern glass is appended separately
  // once the pole finishes growing (see emitArchitecture below).
  const lamps: ReadonlyArray<{ id: string; x: number; yTop: number; yBottom: number; armW: number }> = [
    { id: 'near', x: 0.615, yTop: 0.20, yBottom: 0.62, armW: 0.025 },
    { id: 'far', x: 0.52, yTop: 0.30, yBottom: 0.50, armW: 0.014 },
  ];
  for (let i = 0; i < lamps.length; i++) {
    const lamp = lamps[i]!;
    strands.push({
      id: `architecture:lamp-${lamp.id}:pole`,
      component: 'architecture',
      points: [[lamp.x, lamp.yBottom], [lamp.x, lerp(lamp.yBottom, lamp.yTop, 0.5)], [lamp.x, lamp.yTop]],
      widthPx: 1.6,
      colour: PALETTE.lampIron,
      tipColour: BEAD_TIP,
      window: staggeredWindow(0.06, 0.34, i, seed, SALT_LAMP, 0.5),
      tip: true,
    });
    strands.push({
      id: `architecture:lamp-${lamp.id}:arm`,
      component: 'architecture',
      points: [[lamp.x - lamp.armW, lamp.yTop + 0.01], [lamp.x + lamp.armW, lamp.yTop + 0.01]],
      widthPx: 1.2,
      colour: PALETTE.lampIron,
      tipColour: BEAD_TIP,
      window: staggeredWindow(0.10, 0.38, i + 20, seed, SALT_LAMP, 0.5),
      tip: false,
    });
  }

  // Windows: small rectangle loops within each facade zone, appearing after local strands are underway.
  for (let i = 0; i < 8; i++) {
    const side: 'left' | 'right' = i < 4 ? 'left' : 'right';
    const salt = side === 'left' ? SALT_FACADE_L : SALT_FACADE_R;
    const col = i % 4;
    const x0 = side === 'left' ? 0.06 + col * 0.085 : 0.63 + col * 0.085;
    const y0 = 0.22 + hash01(i, (seed ^ SALT_WINDOW) >>> 0) * 0.45;
    const w = 0.045;
    const h = 0.07;
    const loop: ConstructionPoint[] = [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + h],
      [x0, y0 + h],
      [x0, y0],
    ];
    strands.push({
      id: `architecture:window-${side}:${i % 4}`,
      component: 'architecture',
      points: loop,
      widthPx: 1.1,
      colour: PALETTE.paneLight,
      tipColour: BEAD_TIP,
      window: staggeredWindow(0.16, 0.5, i, seed, salt, 0.35),
      tip: false,
    });
  }

  return strands;
}

// ---------------------------------------------------------------------------
// Furniture: table/chair/cup/ashtray curved/radial scaffolds (foreground layer, drawn last so the
// furniture sits over the figure/tiles exactly like the existing photo's foreground occlusion plate).
const SALT_TABLE = 0x2a;
const SALT_CHAIR = 0x2b;
const SALT_CUP = 0x2c;
const SALT_ASH = 0x2d;
const FURN_RANGE: GrowthWindow = { start: 0.08, end: 0.56 };

function authorFurniture(seed: number): AuthoredStrand[] {
  const strands: AuthoredStrand[] = [];

  // Table: elliptical rim traced as one growing loop, plus individually timed radial ribs.
  const tableCx = 0.5, tableCy = 0.84, tableRx = 0.46, tableRy = 0.085;
  strands.push({
    id: 'table:rim',
    component: 'table',
    points: ellipsePoints(tableCx, tableCy, tableRx, tableRy, 20),
    widthPx: 1.8,
    colour: PALETTE.marble,
    tipColour: BEAD_TIP,
    window: staggeredWindow(FURN_RANGE.start, FURN_RANGE.end, 0, seed, SALT_TABLE, 0.55),
    tip: true,
  });
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    const rim: ConstructionPoint = [tableCx + Math.cos(a) * tableRx, tableCy + Math.sin(a) * tableRy];
    strands.push({
      id: `table:rib-${i}`,
      component: 'table',
      points: [[tableCx, tableCy], rim],
      widthPx: 1.3,
      colour: PALETTE.marbleShade,
      tipColour: BEAD_TIP,
      window: staggeredWindow(FURN_RANGE.start, FURN_RANGE.end, i + 1, seed, SALT_TABLE, 0.4),
      tip: true,
    });
  }

  // Chair: wicker arcs (back hoop + two seat arcs), left of frame.
  const chairArcs: ReadonlyArray<{ id: string; cx: number; cy: number; rx: number; ry: number; a0: number; a1: number }> = [
    { id: 'back-hoop', cx: 0.12, cy: 0.74, rx: 0.095, ry: 0.16, a0: Math.PI * 1.05, a1: Math.PI * 1.95 },
    { id: 'seat-arc-left', cx: 0.10, cy: 0.92, rx: 0.07, ry: 0.035, a0: Math.PI * 0.9, a1: Math.PI * 1.6 },
    { id: 'seat-arc-right', cx: 0.19, cy: 0.92, rx: 0.07, ry: 0.035, a0: Math.PI * 1.4, a1: Math.PI * 2.1 },
  ];
  for (let i = 0; i < chairArcs.length; i++) {
    const arc = chairArcs[i]!;
    strands.push({
      id: `chair:${arc.id}`,
      component: 'chair',
      points: ellipsePoints(arc.cx, arc.cy, arc.rx, arc.ry, 10, arc.a0, arc.a1),
      widthPx: 1.5,
      colour: PALETTE.rattanLit,
      tipColour: BEAD_TIP,
      window: staggeredWindow(FURN_RANGE.start, FURN_RANGE.end, i, seed, SALT_CHAIR, 0.5),
      tip: true,
    });
  }

  // Cup: rim + base loops, with rising ribs connecting them.
  const cupCx = 0.80, cupRimCy = 0.772, cupBaseCy = 0.792, cupRx = 0.034, cupRimRy = 0.011, cupBaseRy = 0.008;
  strands.push({
    id: 'cup:rim',
    component: 'cup',
    points: ellipsePoints(cupCx, cupRimCy, cupRx, cupRimRy, 14),
    widthPx: 1.3,
    colour: PALETTE.cupWhite,
    tipColour: BEAD_TIP,
    window: staggeredWindow(FURN_RANGE.start, FURN_RANGE.end, 0, seed, SALT_CUP, 0.45),
    tip: true,
  });
  strands.push({
    id: 'cup:base',
    component: 'cup',
    points: ellipsePoints(cupCx, cupBaseCy, cupRx * 0.6, cupBaseRy, 14),
    widthPx: 1.1,
    colour: PALETTE.cupShade,
    tipColour: BEAD_TIP,
    window: staggeredWindow(FURN_RANGE.start, FURN_RANGE.end, 1, seed, SALT_CUP, 0.45),
    tip: true,
  });
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6;
    const top: ConstructionPoint = [cupCx + Math.cos(a) * cupRx, cupRimCy + Math.sin(a) * cupRimRy];
    const bottom: ConstructionPoint = [cupCx + Math.cos(a) * cupRx * 0.6, cupBaseCy + Math.sin(a) * cupBaseRy];
    strands.push({
      id: `cup:rib-${i}`,
      component: 'cup',
      points: [bottom, top],
      widthPx: 1.0,
      colour: PALETTE.cupShade,
      tipColour: BEAD_TIP,
      window: staggeredWindow(FURN_RANGE.start, FURN_RANGE.end, i + 2, seed, SALT_CUP, 0.4),
      tip: false,
    });
  }

  // Ashtray: one loop.
  strands.push({
    id: 'ashtray:loop',
    component: 'ashtray',
    points: ellipsePoints(0.42, 0.885, 0.028, 0.010, 12),
    widthPx: 1.2,
    colour: PALETTE.ash,
    tipColour: BEAD_TIP,
    window: staggeredWindow(FURN_RANGE.start, FURN_RANGE.end, 0, seed, SALT_ASH, 0.5),
    tip: true,
  });

  return strands;
}

// ---------------------------------------------------------------------------
// Background/foreground local-material reveal cells: small, component-local, individually timed texture
// patches (never one synchronized full-frame grid/wipe) that let near-complete surfaces already be in
// place by the time construction finishes, so the handoff to the existing photo render path has no pop.
// `background.png`/`foreground.png` are full-frame-aligned plates (their own pixel UV already equals the
// destination frame coordinate), so each cell's source UV is simply its destination corner.
interface RevealCell {
  id: string;
  component: string;
  texture: ConstructionTexture;
  corners: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint];
  window: GrowthWindow;
}

function authorRevealZone(
  zoneId: string,
  component: string,
  texture: ConstructionTexture,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cols: number,
  rows: number,
  rangeStart: number,
  rangeEnd: number,
  seed: number,
  salt: number,
): RevealCell[] {
  const cells: RevealCell[] = [];
  const cw = (x1 - x0) / cols;
  const ch = (y1 - y0) / rows;
  let index = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx0 = x0 + c * cw;
      const cy0 = y0 + r * ch;
      const corners: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint] = [
        [cx0, cy0],
        [cx0 + cw, cy0],
        [cx0 + cw, cy0 + ch],
        [cx0, cy0 + ch],
      ];
      cells.push({
        id: `architecture:${zoneId}:cell-${index}`,
        component,
        texture,
        corners,
        window: staggeredWindow(rangeStart, rangeEnd, index, seed, salt, 0.5),
      });
      index += 1;
    }
  }
  return cells;
}

function authorBackgroundCells(seed: number): RevealCell[] {
  return [
    ...authorRevealZone('sky', 'architecture', 'background', 0.0, 0.0, 1.0, 0.22, 4, 1, 0.0, 0.16, seed, 0x31),
    ...authorRevealZone('facade-left', 'architecture', 'background', 0.02, 0.09, 0.42, 0.95, 3, 3, 0.16, 0.56, seed, 0x32),
    ...authorRevealZone('facade-right', 'architecture', 'background', 0.58, 0.09, 0.98, 0.95, 3, 3, 0.16, 0.56, seed, 0x33),
    ...authorRevealZone('street', 'architecture', 'background', 0.30, 0.90, 0.70, 1.0, 3, 1, 0.10, 0.30, seed, 0x34),
  ];
}

function authorForegroundCells(seed: number): RevealCell[] {
  return authorRevealZone('furniture-surface', 'table', 'foreground', 0.0, 0.70, 1.0, 1.0, 4, 2, 0.55, 0.93, seed, 0x35).map((cell) => ({
    ...cell,
    id: cell.id.replace('architecture:', 'table:'),
  }));
}

function texVertex(p: ConstructionPoint, u: number, v: number): ConstructionTextureVertex {
  return { x: p[0], y: p[1], u, v };
}

function emitCell(out: ConstructionCommand[], cell: RevealCell, progress: number): void {
  const local = smoothstep(cell.window.start, cell.window.end, progress);
  if (local <= 0) return;
  const [tl, tr, br, bl] = cell.corners;
  const vTl = texVertex(tl, tl[0], tl[1]);
  const vTr = texVertex(tr, tr[0], tr[1]);
  const vBr = texVertex(br, br[0], br[1]);
  const vBl = texVertex(bl, bl[0], bl[1]);
  out.push({ kind: 'texture', id: `${cell.id}:a`, component: cell.component, alpha: 1, texture: cell.texture, vertices: [vTl, vTr, vBr] });
  out.push({ kind: 'texture', id: `${cell.id}:b`, component: cell.component, alpha: 1, texture: cell.texture, vertices: [vTl, vBr, vBl] });
}

// ---------------------------------------------------------------------------
// Figure: abstract joint/line scaffold -> opaque expanding body volume -> separate garment panels.
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
}

function buildFigureSkeleton(x0: number, y0: number, x1: number, y1: number): FigureSkeleton {
  const width = x1 - x0;
  const height = y1 - y0;
  const cx = (x0 + x1) / 2;
  const head: ConstructionPoint = [cx, y0 + height * 0.05];
  const neck: ConstructionPoint = [cx, y0 + height * 0.14];
  const shoulderL: ConstructionPoint = [cx - width * 0.24, y0 + height * 0.17];
  const shoulderR: ConstructionPoint = [cx + width * 0.24, y0 + height * 0.17];
  const hip: ConstructionPoint = [cx, y0 + height * 0.52];
  const kneeL: ConstructionPoint = [cx - width * 0.10, y0 + height * 0.78];
  const kneeR: ConstructionPoint = [cx + width * 0.10, y0 + height * 0.78];
  const footL: ConstructionPoint = [cx - width * 0.12, y1];
  const footR: ConstructionPoint = [cx + width * 0.12, y1];
  const joints: FigureJoint[] = [
    { id: 'head', point: head },
    { id: 'neck', point: neck },
    { id: 'shoulder-left', point: shoulderL },
    { id: 'shoulder-right', point: shoulderR },
    { id: 'hip', point: hip },
    { id: 'knee-left', point: kneeL },
    { id: 'knee-right', point: kneeR },
    { id: 'foot-left', point: footL },
    { id: 'foot-right', point: footR },
  ];
  const bones: FigureBone[] = [
    { id: 'spine-upper', a: neck, b: head },
    { id: 'collar-left', a: neck, b: shoulderL },
    { id: 'collar-right', a: neck, b: shoulderR },
    { id: 'spine-lower', a: neck, b: hip },
    { id: 'leg-left-upper', a: hip, b: kneeL },
    { id: 'leg-left-lower', a: kneeL, b: footL },
    { id: 'leg-right-upper', a: hip, b: kneeR },
    { id: 'leg-right-lower', a: kneeR, b: footR },
  ];
  return { joints, bones };
}

interface VolumePart {
  id: string;
  anchor: ConstructionPoint;
  corners: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint];
}

function buildVolumeParts(skeleton: FigureSkeleton, x0: number, x1: number): VolumePart[] {
  const width = x1 - x0;
  const jointsById = new Map(skeleton.joints.map((j) => [j.id, j.point] as const));
  const head = jointsById.get('head')!;
  const neck = jointsById.get('neck')!;
  const shoulderL = jointsById.get('shoulder-left')!;
  const shoulderR = jointsById.get('shoulder-right')!;
  const hip = jointsById.get('hip')!;
  const kneeL = jointsById.get('knee-left')!;
  const kneeR = jointsById.get('knee-right')!;
  const footL = jointsById.get('foot-left')!;
  const footR = jointsById.get('foot-right')!;
  const headR = width * 0.07;
  return [
    {
      id: 'figure:volume:head',
      anchor: neck,
      corners: [
        [head[0] - headR, head[1] - headR],
        [head[0] + headR, head[1] - headR],
        [head[0] + headR, head[1] + headR],
        [head[0] - headR, head[1] + headR],
      ],
    },
    {
      id: 'figure:volume:torso',
      anchor: neck,
      corners: [shoulderL, shoulderR, [hip[0] + width * 0.16, hip[1]], [hip[0] - width * 0.16, hip[1]]],
    },
    {
      id: 'figure:volume:hips',
      anchor: hip,
      corners: [
        [hip[0] - width * 0.17, hip[1]],
        [hip[0] + width * 0.17, hip[1]],
        [kneeR[0] + width * 0.06, kneeR[1]],
        [kneeL[0] - width * 0.06, kneeL[1]],
      ],
    },
    {
      id: 'figure:volume:leg-left',
      anchor: kneeL,
      corners: [
        [hip[0] - width * 0.14, hip[1]],
        [hip[0] - width * 0.02, hip[1]],
        [footL[0] + width * 0.05, footL[1]],
        [footL[0] - width * 0.05, footL[1]],
      ],
    },
    {
      id: 'figure:volume:leg-right',
      anchor: kneeR,
      corners: [
        [hip[0] + width * 0.02, hip[1]],
        [hip[0] + width * 0.14, hip[1]],
        [footR[0] + width * 0.05, footR[1]],
        [footR[0] - width * 0.05, footR[1]],
      ],
    },
  ];
}

interface GarmentPanel {
  id: string;
  corners: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint];
  uv: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint];
  slide: ConstructionPoint;
}

/** Garment panels slice the figure texture's own 1:1-mapped UV space (figureSrc spans exactly
 * manifest.figureHomeRectNorm), so corner UV = corner position normalised into the home rect. */
function buildGarmentPanels(x0: number, y0: number, x1: number, y1: number): GarmentPanel[] {
  const width = x1 - x0;
  const height = y1 - y0;
  const cx = (x0 + x1) / 2;
  const uvOf = (p: ConstructionPoint): ConstructionPoint => [(p[0] - x0) / width, (p[1] - y0) / height];
  const rows: ReadonlyArray<{ id: string; y0: number; y1: number; x0: number; x1: number; slide: ConstructionPoint }> = [
    { id: 'head', y0: y0, y1: y0 + height * 0.18, x0, x1, slide: [0, -0.05] },
    { id: 'collar-left', y0: y0 + height * 0.18, y1: y0 + height * 0.42, x0, x1: cx, slide: [-0.05, 0] },
    { id: 'collar-right', y0: y0 + height * 0.18, y1: y0 + height * 0.42, x0: cx, x1, slide: [0.05, 0] },
    { id: 'lower-coat', y0: y0 + height * 0.42, y1: y0 + height * 0.80, x0, x1, slide: [0, 0.04] },
    { id: 'boots', y0: y0 + height * 0.80, y1: y1, x0, x1, slide: [0, 0.05] },
  ];
  return rows.map((row) => {
    const corners: readonly [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint] = [
      [row.x0, row.y0],
      [row.x1, row.y0],
      [row.x1, row.y1],
      [row.x0, row.y1],
    ];
    return {
      id: `figure:garment:${row.id}`,
      corners,
      uv: [uvOf(corners[0]), uvOf(corners[1]), uvOf(corners[2]), uvOf(corners[3])],
      slide: row.slide,
    };
  });
}

interface FigureGeometry {
  skeleton: FigureSkeleton;
  volume: VolumePart[];
  garment: GarmentPanel[];
}

// ---------------------------------------------------------------------------
// Bounded, immutable authored-geometry cache. Only ever stores pure, time-independent control-point
// data derived from (seed) or (seed, figureHomeRectNorm); never pixels, never a per-frame recompute.
const ARCHITECTURE_CACHE = new Map<number, readonly AuthoredStrand[]>();
const FURNITURE_CACHE = new Map<number, readonly AuthoredStrand[]>();
const BACKGROUND_CELLS_CACHE = new Map<number, readonly RevealCell[]>();
const FOREGROUND_CELLS_CACHE = new Map<number, readonly RevealCell[]>();
const FIGURE_CACHE = new Map<string, FigureGeometry>();
const CACHE_LIMIT = 8;

function cached<K, V>(cache: Map<K, V>, key: K, build: () => V): V {
  const hit = cache.get(key);
  if (hit) return hit;
  const built = build();
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, built);
  return built;
}

// ---------------------------------------------------------------------------
// Tiles: the manifest's real source-chip atlas fragments. Actual translate/rotate/scale motion,
// converging exactly to their authored rectNorm destination by the end of each tile's own window.
const SALT_TILE = 0x41;
const TILE_RANGE: GrowthWindow = { start: 0.50, end: 0.98 };
const TILE_COUNT_SAFETY_LIMIT = 256;

function rotateVec(v: ConstructionPoint, angle: number): ConstructionPoint {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

function emitTile(
  out: ConstructionCommand[],
  region: PhotoTileRegion,
  index: number,
  seed: number,
  atlasSize: readonly [number, number],
  progress: number,
  counters: { moving: number },
): void {
  if (!Array.isArray(region.rectNorm) || region.rectNorm.length !== 4) return;
  if (!Array.isArray(region.sourceBoxPx) || region.sourceBoxPx.length !== 4) return;
  const [rx, ry, rw, rh] = region.rectNorm;
  const [sx0, sy0, sx1, sy1] = region.sourceBoxPx;
  const [aw, ah] = atlasSize;
  if (!(aw > 0) || !(ah > 0) || !(rw > 0) || !(rh > 0)) return;

  const win = staggeredWindow(TILE_RANGE.start, TILE_RANGE.end, index, seed, SALT_TILE, 0.45);
  const local = smoothstep(win.start, win.end, progress);
  if (local <= 0) return;
  if (local < 1) counters.moving += 1;

  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const corners: readonly ConstructionPoint[] = [
    [rx, ry],
    [rx + rw, ry],
    [rx + rw, ry + rh],
    [rx, ry + rh],
  ];
  const angle = lerp((hash01(index, (seed ^ 0x09) >>> 0) - 0.5) * 0.6, 0, local);
  const scale = lerp(0.8, 1, local);
  const dirAngle = hash01(index, (seed ^ 0x11) >>> 0) * Math.PI * 2;
  const dist = lerp(0.05 + hash01(index, (seed ^ 0x22) >>> 0) * 0.05, 0, local);
  const offsetX = Math.cos(dirAngle) * dist;
  const offsetY = Math.sin(dirAngle) * dist;

  const transformed = corners.map((c): ConstructionPoint => {
    const rel: ConstructionPoint = [c[0] - cx, c[1] - cy];
    const rotated = rotateVec(rel, angle);
    return [cx + rotated[0] * scale + offsetX, cy + rotated[1] * scale + offsetY];
  });
  const uv: readonly ConstructionPoint[] = [
    [sx0 / aw, sy0 / ah],
    [sx1 / aw, sy0 / ah],
    [sx1 / aw, sy1 / ah],
    [sx0 / aw, sy1 / ah],
  ];
  const verts = transformed.map((p, i) => texVertex(p, uv[i]![0], uv[i]![1]));
  out.push({ kind: 'texture', id: `tile:${region.id}:a`, component: 'tiles', alpha: 1, texture: 'tiles', vertices: [verts[0]!, verts[1]!, verts[2]!] });
  out.push({ kind: 'texture', id: `tile:${region.id}:b`, component: 'tiles', alpha: 1, texture: 'tiles', vertices: [verts[0]!, verts[2]!, verts[3]!] });
}

// ---------------------------------------------------------------------------
// Defensive fallback home rect, used only when the live manifest is malformed (e.g. a draw call before
// a real fetch resolved); approximate, not authoritative, and independent of seed33Photo.ts's own
// DEFAULT_HOME so this module has no import coupling to another writer's file.
const FALLBACK_HOME_RECT: readonly [number, number, number, number] = [0.30, 0.35, 0.42, 0.76];

function resolveHomeRect(manifest: PhotoManifestData | null | undefined): readonly [number, number, number, number] {
  const rect = manifest?.figureHomeRectNorm;
  if (!Array.isArray(rect) || rect.length !== 4) return FALLBACK_HOME_RECT;
  const [x0, y0, x1, y1] = rect;
  if (![x0, y0, x1, y1].every((n) => Number.isFinite(n)) || x1 <= x0 || y1 <= y0) return FALLBACK_HOME_RECT;
  return [x0, y0, x1, y1];
}

function resolveTileRegions(manifest: PhotoManifestData | null | undefined): readonly PhotoTileRegion[] {
  const regions = manifest?.tileRegions;
  if (!Array.isArray(regions)) return [];
  return regions.slice(0, TILE_COUNT_SAFETY_LIMIT);
}

function resolveAtlasSize(manifest: PhotoManifestData | null | undefined): readonly [number, number] {
  const size = manifest?.tilesAtlasSizePx;
  if (!Array.isArray(size) || size.length !== 2 || !Number.isFinite(size[0]) || !Number.isFinite(size[1])) return [1, 1];
  return [size[0], size[1]];
}

// ---------------------------------------------------------------------------
export function buildSeed33Construction(input: ConstructionInput): ConstructionPlan {
  const inactivePlan = (): ConstructionPlan => ({
    active: false,
    progress: 1,
    figureStage: 'complete',
    commands: [],
    stats: { growingStrands: 0, completedStrands: 0, movingTiles: 0 },
  });

  const buildMs = Number.isFinite(input.buildMs) ? input.buildMs : 0;
  if (!(buildMs > 0)) return inactivePlan();
  if (input.reducedMotion) return inactivePlan();
  const timeMsRaw = Number.isFinite(input.timeMs) ? input.timeMs : 0;
  const timeMs = Math.max(0, timeMsRaw);
  if (timeMs >= buildMs) return inactivePlan();

  const progress = clamp01(timeMs / buildMs);
  const seed = Number.isFinite(input.seed) ? Math.trunc(input.seed) >>> 0 : 0;
  const [hx0, hy0, hx1, hy1] = resolveHomeRect(input.manifest);
  const tileRegions = resolveTileRegions(input.manifest);
  const atlasSize = resolveAtlasSize(input.manifest);

  const commands: ConstructionCommand[] = [];
  const strandCounters: StrandCounters = { growing: 0, completed: 0 };
  const tileCounters = { moving: 0 };

  // Background: architecture strands + local background-material cells.
  const architecture = cached(ARCHITECTURE_CACHE, seed, () => authorArchitecture(seed));
  for (const strand of architecture) emitStrand(commands, strand, progress, strandCounters);
  const backgroundCells = cached(BACKGROUND_CELLS_CACHE, seed, () => authorBackgroundCells(seed));
  for (const cell of backgroundCells) emitCell(commands, cell, progress);

  // Figure: scaffold -> volume -> garment (always re-derived from the manifest's own home rect).
  const figureKey = `${seed}|${hx0},${hy0},${hx1},${hy1}`;
  const figure = cached(FIGURE_CACHE, figureKey, (): FigureGeometry => {
    const skeleton = buildFigureSkeleton(hx0, hy0, hx1, hy1);
    const volume = buildVolumeParts(skeleton, hx0, hx1);
    const garment = buildGarmentPanels(hx0, hy0, hx1, hy1);
    return { skeleton, volume, garment };
  });

  // Scaffold joints (discs) + bones (growing strands with luminous tips).
  for (let i = 0; i < figure.skeleton.joints.length; i++) {
    const joint = figure.skeleton.joints[i]!;
    const win = staggeredWindow(FIGURE_SCAFFOLD_START, FIGURE_VOLUME_START, i, seed, 0x51, 0.5);
    const local = smoothstep(win.start, win.end, progress);
    if (local <= 0) continue;
    commands.push({
      kind: 'disc',
      id: `figure:scaffold:joint:${joint.id}`,
      component: 'figure',
      alpha: 1,
      center: joint.point,
      radiusPx: 3.2,
      colour: PALETTE.cupWhite,
    });
  }
  for (let i = 0; i < figure.skeleton.bones.length; i++) {
    const bone = figure.skeleton.bones[i]!;
    const strand: AuthoredStrand = {
      id: `figure:scaffold:bone:${bone.id}`,
      component: 'figure',
      points: [bone.a, bone.b],
      widthPx: 1.6,
      colour: PALETTE.cupWhite,
      tipColour: PALETTE.cupWhite,
      window: staggeredWindow(FIGURE_SCAFFOLD_START, FIGURE_VOLUME_START, i, seed, 0x52, 0.5),
      tip: true,
    };
    emitStrand(commands, strand, progress, strandCounters);
  }

  // Volume: actual expanding solid geometry (vertices lerp outward from their rig anchor).
  for (let i = 0; i < figure.volume.length; i++) {
    const part = figure.volume[i]!;
    const win = staggeredWindow(FIGURE_VOLUME_START, FIGURE_GARMENT_START, i, seed, 0x53, 0.5);
    const local = smoothstep(win.start, win.end, progress);
    if (local <= 0) continue;
    const verts = part.corners.map((c): ConstructionPoint => [
      part.anchor[0] + (c[0] - part.anchor[0]) * local,
      part.anchor[1] + (c[1] - part.anchor[1]) * local,
    ]);
    const [a, b, c, d] = verts as [ConstructionPoint, ConstructionPoint, ConstructionPoint, ConstructionPoint];
    commands.push({ kind: 'solid', id: `${part.id}:a`, component: 'figure', alpha: 1, points: [a, b, c], colour: PALETTE.camelShade });
    commands.push({ kind: 'solid', id: `${part.id}:b`, component: 'figure', alpha: 1, points: [a, c, d], colour: PALETTE.camelShade });
  }

  // Garment: separate textured panels, each sliding a short distance into its final place.
  for (let i = 0; i < figure.garment.length; i++) {
    const panel = figure.garment[i]!;
    const win = staggeredWindow(FIGURE_GARMENT_START, FIGURE_COMPLETE_START, i, seed, 0x54, 0.45);
    const local = smoothstep(win.start, win.end, progress);
    if (local <= 0) continue;
    const slideScale = 1 - local;
    const verts = panel.corners.map((c, vi): ConstructionTextureVertex => {
      const uv = panel.uv[vi]!;
      return texVertex([c[0] + panel.slide[0] * slideScale, c[1] + panel.slide[1] * slideScale], uv[0], uv[1]);
    });
    commands.push({ kind: 'texture', id: `${panel.id}:a`, component: 'figure', alpha: 1, texture: 'figure', vertices: [verts[0]!, verts[1]!, verts[2]!] });
    commands.push({ kind: 'texture', id: `${panel.id}:b`, component: 'figure', alpha: 1, texture: 'figure', vertices: [verts[0]!, verts[2]!, verts[3]!] });
  }

  // Tiles: the manifest's real atlas fragments, moving into their exact source rects.
  if (input.showTiles) {
    for (let i = 0; i < tileRegions.length; i++) {
      emitTile(commands, tileRegions[i]!, i, seed, atlasSize, progress, tileCounters);
    }
  }

  // Foreground: furniture scaffolds + local furniture-surface cells, drawn last (occludes the figure).
  const furniture = cached(FURNITURE_CACHE, seed, () => authorFurniture(seed));
  for (const strand of furniture) emitStrand(commands, strand, progress, strandCounters);
  const foregroundCells = cached(FOREGROUND_CELLS_CACHE, seed, () => authorForegroundCells(seed));
  for (const cell of foregroundCells) emitCell(commands, cell, progress);

  const limited = commands.length > CONSTRUCTION_COMMAND_LIMIT ? commands.slice(0, CONSTRUCTION_COMMAND_LIMIT) : commands;

  return {
    active: true,
    progress,
    figureStage: figureStageFor(progress),
    commands: limited,
    stats: { growingStrands: strandCounters.growing, completedStrands: strandCounters.completed, movingTiles: tileCounters.moving },
  };
}
