// Focused acceptance tests for the corrected Seed-33 component-construction planner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSeed33Construction,
  FIGURE_COMPLETE_START,
  FIGURE_GARMENT_START,
  FIGURE_SCAFFOLD_START,
  FIGURE_VOLUME_START,
} from '../src/scene/seed33Construction.ts';
import { CONSTRUCTION_COMMAND_LIMIT } from '../src/scene/constructionTypes.ts';
import type {
  ConstructionCommand,
  ConstructionInput,
  ConstructionPatch,
  ConstructionPoint,
  ConstructionStroke,
} from '../src/scene/constructionTypes.ts';
import type { PhotoManifestData } from '../src/scene/types.ts';

const BUILD_MS = 12_000;
const FIGURE_RECT = [0.321127792, 0.3489583333, 0.4046136946, 0.7545572917] as const;
const MANIFEST: PhotoManifestData = {
  figureHomeRectNorm: FIGURE_RECT,
  tilesAtlasSizePx: [2731, 1536],
  tileRegions: [
    { id: 'left-coral', rectNorm: [0.0911753936, 0.099609375, 0.0648114244, 0.0983072917], sourceBoxPx: [249, 153, 426, 304], group: 'left' },
    { id: 'right-scanlines', rectNorm: [0.7374588063, 0.3268229167, 0.0483339436, 0.0442708333], sourceBoxPx: [2014, 502, 2146, 570], group: 'right' },
    { id: 'table-cream-dots', rectNorm: [0.4020505309, 0.7506510417, 0.0476016111, 0.1686197917], sourceBoxPx: [1098, 1153, 1228, 1412], group: 'table' },
  ],
};

const ALT_MANIFEST: PhotoManifestData = {
  ...MANIFEST,
  figureHomeRectNorm: [0.55, 0.20, 0.68, 0.60],
};

function inputAt(progress: number, overrides: Partial<ConstructionInput> = {}): ConstructionInput {
  return {
    timeMs: BUILD_MS * progress,
    buildMs: BUILD_MS,
    seed: 33,
    reducedMotion: false,
    showTiles: true,
    manifest: MANIFEST,
    ...overrides,
  };
}

function planAt(progress: number, overrides: Partial<ConstructionInput> = {}) {
  return buildSeed33Construction(inputAt(progress, overrides));
}

function triangleArea(points: readonly ConstructionPoint[]): number {
  assert.equal(points.length, 3);
  const [a, b, c] = points;
  return Math.abs((b![0] - a![0]) * (c![1] - a![1]) - (b![1] - a![1]) * (c![0] - a![0])) / 2;
}

function destinationArea(patch: ConstructionPatch): number {
  return triangleArea(patch.vertices.map((vertex): ConstructionPoint => [vertex.x, vertex.y]));
}

function sourceArea(patch: ConstructionPatch): number {
  return triangleArea(patch.vertices.map((vertex): ConstructionPoint => [vertex.u, vertex.v]));
}

function pointInTriangle(point: ConstructionPoint, patch: ConstructionPatch): boolean {
  const [a, b, c] = patch.vertices;
  const sign = (p: ConstructionPoint, q: ConstructionPoint, r: ConstructionPoint): number =>
    (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const p: ConstructionPoint = point;
  const pa: ConstructionPoint = [a.x, a.y];
  const pb: ConstructionPoint = [b.x, b.y];
  const pc: ConstructionPoint = [c.x, c.y];
  const d1 = sign(p, pa, pb);
  const d2 = sign(p, pb, pc);
  const d3 = sign(p, pc, pa);
  const epsilon = 1e-10;
  return !((d1 < -epsilon || d2 < -epsilon || d3 < -epsilon) && (d1 > epsilon || d2 > epsilon || d3 > epsilon));
}

function texturePatches(commands: readonly ConstructionCommand[], texture: ConstructionPatch['texture']): ConstructionPatch[] {
  return commands.filter((command): command is ConstructionPatch => command.kind === 'texture' && command.texture === texture);
}

function findObservableFigureStage(prefix: string, from: number, to: number, predicate: (commands: readonly ConstructionCommand[]) => boolean) {
  for (let step = 0; step <= 80; step += 1) {
    const progress = from + ((to - from) * step) / 80;
    const plan = planAt(progress);
    const commands = plan.commands.filter((command) => command.id.startsWith(prefix));
    if (predicate(commands)) return { progress, plan, commands };
  }
  assert.fail(`no observable ${prefix} geometry in ${from}..${to}`);
}

function commandPoints(command: ConstructionCommand): ConstructionPoint[] {
  if (command.kind === 'stroke') return [...command.points];
  if (command.kind === 'disc') return [command.center];
  if (command.kind === 'solid') return [...command.points];
  return command.vertices.map((vertex) => [vertex.x, vertex.y]);
}

function assertNormalisedAndFinite(command: ConstructionCommand): void {
  assert.ok(command.alpha >= 0 && command.alpha <= 1, `${command.id}: bounded alpha`);
  for (const [x, y] of commandPoints(command)) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `${command.id}: finite point`);
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `${command.id}: point is clipped to frame`);
  }
  if (command.kind === 'texture') {
    for (const vertex of command.vertices) {
      assert.ok(Number.isFinite(vertex.u) && Number.isFinite(vertex.v), `${command.id}: finite source UV`);
      assert.ok(vertex.u >= 0 && vertex.u <= 1 && vertex.v >= 0 && vertex.v <= 1, `${command.id}: normalised source UV`);
    }
  }
}

const STABLE_ID = /^[a-z][a-z0-9-]*(:[a-z0-9][a-z0-9-]*)+$/;

test('planner is deterministic, bounded, finite, normalised, and uniquely identified', () => {
  for (const progress of [0, 0.1, 0.25, 0.4, 0.52, 0.67, 0.8, 0.92, 0.999]) {
    const first = planAt(progress);
    const second = planAt(progress);
    assert.deepEqual(first, second, `progress ${progress}: deterministic`);
    assert.equal(first.active, true);
    assert.ok(first.commands.length < CONSTRUCTION_COMMAND_LIMIT, `progress ${progress}: matrix subdivisions stay below the cap without truncation`);
    const ids = new Set<string>();
    for (const command of first.commands) {
      assert.match(command.id, STABLE_ID);
      assert.equal(ids.has(command.id), false, `duplicate id ${command.id}`);
      ids.add(command.id);
      assertNormalisedAndFinite(command);
    }
  }
});

test('complete, zero-build, reduced, and hidden-tile paths preserve their bypass contracts', () => {
  for (const overrides of [
    { timeMs: BUILD_MS },
    { timeMs: BUILD_MS + 5000 },
    { timeMs: 0, buildMs: 0 },
    { timeMs: BUILD_MS * 0.5, reducedMotion: true },
  ]) {
    const plan = buildSeed33Construction(inputAt(0, overrides));
    assert.equal(plan.active, false);
    assert.equal(plan.figureStage, 'complete');
    assert.deepEqual(plan.commands, []);
  }
  for (const progress of [0.2, 0.6, 0.999]) {
    const hidden = planAt(progress, { showTiles: false });
    assert.equal(hidden.stats.movingTiles, 0);
    assert.equal(hidden.commands.some((command) => command.id.startsWith('tile:') || (command.kind === 'texture' && command.texture === 'tiles')), false);
  }
});

test('hundreds of fine source-traced paths occupy the measured facades and object coordinates', () => {
  const plan = planAt(0.60);
  const strokes = plan.commands.filter((command): command is ConstructionStroke => command.kind === 'stroke');
  const architecture = strokes.filter((command) => command.id.startsWith('architecture:'));
  assert.ok(architecture.length > 300, `expected hundreds of facade/window/roof/lamp paths, got ${architecture.length}`);
  assert.ok(architecture.some((command) => command.id.includes('window-left')));
  assert.ok(architecture.some((command) => command.id.includes('window-right')));
  assert.ok(architecture.some((command) => command.id.includes('roof-left')));
  assert.ok(architecture.some((command) => command.id.includes('awning-left')));
  assert.ok(architecture.some((command) => command.id.includes('lamp-near')));

  const chairPoints = strokes.filter((command) => command.id.startsWith('chair:')).flatMap((command) => command.points);
  assert.ok(Math.min(...chairPoints.map((point) => point[0])) <= 0.005, 'large chair reaches the left crop');
  assert.ok(Math.max(...chairPoints.map((point) => point[0])) >= 0.22, 'large chair curves span the source width');

  const table = strokes.filter((command) => command.id.startsWith('table:perspective-thread-'));
  assert.ok(table.length > 60, 'table uses many perspective threads rather than a generic ellipse guide');
  assert.ok(table.filter((command) => command.points.at(-1)?.[1] === 1).length > 40, 'table threads continue to the clipped lower frame');

  const cupPoints = strokes.filter((command) => command.id.startsWith('cup:')).flatMap((command) => command.points);
  assert.ok(Math.min(...cupPoints.map((point) => point[0])) < 0.66 && Math.max(...cupPoints.map((point) => point[0])) > 0.81);
  assert.ok(Math.min(...cupPoints.map((point) => point[1])) <= 0.76 && Math.max(...cupPoints.map((point) => point[1])) >= 0.92);

  const ashtrayPoints = strokes.filter((command) => command.id.startsWith('ashtray:')).flatMap((command) => command.points);
  const ashtrayCenter = (Math.min(...ashtrayPoints.map((point) => point[0])) + Math.max(...ashtrayPoints.map((point) => point[0]))) / 2;
  assert.ok(Math.abs(ashtrayCenter - 0.333) < 0.01, `ashtray center ${ashtrayCenter} follows source x~.33`);
});

test('matrix material resolves through sparse source-registered bit occupancy rather than smooth triangle scaling', () => {
  const early = texturePatches(planAt(0.25).commands, 'background');
  const middle = texturePatches(planAt(0.55).commands, 'background');
  const late = texturePatches(planAt(0.80).commands, 'background');
  const areaOf = (patches: readonly ConstructionPatch[]): number => patches.reduce((sum, patch) => sum + destinationArea(patch), 0);
  assert.ok(middle.some((patch) => patch.id.includes(':bit-')), 'integrated material emits local bit cells');
  assert.ok(middle.length > 50, 'partial fill is subdivided, not one alpha-faded source triangle');
  assert.ok(areaOf(early) < areaOf(late), 'source occupancy resolves over the build');
  assert.ok(areaOf(middle) > 0 && areaOf(middle) < 1, 'mid-build retains visible unfilled regions');
  for (const patches of [early, middle, late]) {
    assert.ok(areaOf(patches) <= 1 + 1e-9, 'local material cells do not double-cover the source');
    for (const patch of patches) {
      assert.equal(patch.alpha, 1, 'material is occupied or absent, never a whole-photo dissolve');
      for (const vertex of patch.vertices) {
        assert.ok(Math.abs(vertex.x - vertex.u) < 1e-10 && Math.abs(vertex.y - vertex.v) < 1e-10, 'occupied cells sample their exact source location');
      }
    }
  }
});

test('the .999 background and foreground meshes cover each source exactly once with no geometric holes or overlaps', () => {
  const plan = planAt(0.999);
  for (const texture of ['background', 'foreground'] as const) {
    const patches = texturePatches(plan.commands, texture);
    assert.ok(patches.length >= 20, `${texture}: semantic triangle mesh exists`);
    const area = patches.reduce((sum, patch) => sum + destinationArea(patch), 0);
    assert.ok(Math.abs(area - 1) < 1e-9, `${texture}: triangle area ${area} covers the full source exactly once`);
    for (const patch of patches) {
      assert.equal(patch.alpha, 1);
      for (const vertex of patch.vertices) {
        assert.ok(Math.abs(vertex.x - vertex.u) < 1e-12 && Math.abs(vertex.y - vertex.v) < 1e-12, `${patch.id}: exact full-frame source registration`);
      }
    }
    // Offset samples avoid authored boundaries; every point must belong to exactly one triangle.
    for (let row = 0; row < 31; row += 1) {
      for (let column = 0; column < 53; column += 1) {
        const point: ConstructionPoint = [(column + 0.371) / 53, (row + 0.619) / 31];
        const owners = patches.filter((patch) => pointInTriangle(point, patch)).length;
        assert.equal(owners, 1, `${texture}: sample ${point.join(',')} has ${owners} triangle owners`);
      }
    }
  }
});

test('figure scaffold is articulated through elbows/wrists/arms and volume is rounded opaque mesh geometry', () => {
  const scaffold = findObservableFigureStage('figure:scaffold:', FIGURE_SCAFFOLD_START, FIGURE_VOLUME_START, (commands) =>
    commands.some((command) => command.kind === 'stroke') && commands.some((command) => command.kind === 'disc'));
  assert.equal(scaffold.plan.figureStage, 'scaffold');
  const lateScaffold = planAt(0.43).commands.filter((command) => command.id.startsWith('figure:scaffold:'));
  for (const articulation of ['joint-elbow-left', 'joint-elbow-right', 'joint-wrist-left', 'joint-wrist-right', 'bone-arm-left-upper', 'bone-arm-left-lower', 'bone-arm-right-upper', 'bone-arm-right-lower']) {
    assert.ok(lateScaffold.some((command) => command.id.includes(articulation)), `scaffold includes ${articulation}`);
  }

  const volume = findObservableFigureStage('figure:volume:', FIGURE_VOLUME_START, FIGURE_GARMENT_START, (commands) =>
    commands.filter((command) => command.kind === 'solid').length > 50);
  assert.equal(volume.plan.figureStage, 'volume');
  assert.ok(volume.commands.every((command) => command.kind === 'solid'), 'body volume has no photo matte');
  const head = volume.commands.filter((command) => command.id.startsWith('figure:volume:head:'));
  const leftArm = volume.commands.filter((command) => command.id.startsWith('figure:volume:arm-left-upper:'));
  assert.ok(head.length >= 12 && leftArm.length >= 10, 'head ellipse and arm capsule have rounded triangle fans');
  const headVertices = new Set(head.flatMap(commandPoints).map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`));
  assert.ok(headVertices.size >= 12, 'head is not a two-triangle rectangular block');
});

test('garment window observably coexists with growing seam/ribbon strokes and source-textured triangular panels', () => {
  let observed: ReturnType<typeof planAt> | null = null;
  for (let step = 0; step <= 60; step += 1) {
    const progress = FIGURE_GARMENT_START + ((FIGURE_COMPLETE_START - FIGURE_GARMENT_START) * step) / 60;
    const plan = planAt(progress);
    const seams = plan.commands.filter((command) => command.kind === 'stroke' && command.id.startsWith('figure:garment:seam-'));
    const panels = plan.commands.filter((command) => command.kind === 'texture' && command.texture === 'figure' && command.id.startsWith('figure:garment:panel-'));
    const volume = plan.commands.filter((command) => command.kind === 'solid' && command.id.startsWith('figure:volume:'));
    if (seams.length >= 4 && panels.length >= 6 && volume.length > 0) {
      observed = plan;
      break;
    }
  }
  assert.ok(observed, 'seams, local source garment triangles, and retained body volume coexist in .64-.94');
  const garment = observed.commands.filter((command) => command.id.startsWith('figure:garment:'));
  assert.ok(garment.some((command) => command.kind === 'stroke'));
  const panels = garment.filter((command): command is ConstructionPatch => command.kind === 'texture' && command.texture === 'figure');
  assert.ok(panels.length >= 6);
  const lastPanelIndex = Math.max(...panels.map((panel) => observed.commands.indexOf(panel)));
  const seamIndices = garment.filter((command) => command.kind === 'stroke').map((command) => observed.commands.indexOf(command));
  assert.ok(seamIndices.some((index) => index > lastPanelIndex), 'seams paint over garment material and remain observably legible');
  assert.ok(new Set(panels.map((panel) => panel.id.replace(/^.*panel-/, ''))).size >= 6, 'garment is semantic triangular panels, not five full-width bands');
});

test('the .999 figure source is exactly registered and every non-texture scaffold/body/guide has retired', () => {
  const plan = planAt(0.999);
  assert.equal(plan.figureStage, 'complete');
  assert.ok(plan.commands.length > 0);
  assert.ok(plan.commands.every((command) => command.kind === 'texture' && command.alpha === 1), 'only exact source texture triangles remain');
  assert.equal(plan.commands.some((command) => command.id.includes(':scaffold:') || command.id.includes(':volume:') || command.id.includes(':seam-')), false);

  const figure = texturePatches(plan.commands, 'figure');
  assert.equal(figure.length, 12, 'semantic garment fan covers the figure source');
  const [x0, y0, x1, y1] = FIGURE_RECT;
  assert.ok(Math.abs(figure.reduce((sum, patch) => sum + destinationArea(patch), 0) - (x1 - x0) * (y1 - y0)) < 1e-9);
  assert.ok(Math.abs(figure.reduce((sum, patch) => sum + sourceArea(patch), 0) - 1) < 1e-9);
  for (const patch of figure) {
    for (const vertex of patch.vertices) {
      assert.ok(Math.abs(vertex.u - (vertex.x - x0) / (x1 - x0)) < 1e-9, `${patch.id}: figure u is source registered`);
      assert.ok(Math.abs(vertex.v - (vertex.y - y0) / (y1 - y0)) < 1e-9, `${patch.id}: figure v is source registered`);
    }
  }
});

test('tile matrix cells stay close to source boxes and reach exact supplied rectangles before completion', () => {
  const region = MANIFEST.tileRegions[0]!;
  const [x, y, width, height] = region.rectNorm;
  let partialObserved = false;
  for (let step = 45; step < 95; step += 2) {
    const patches = texturePatches(planAt(step / 100).commands, 'tiles').filter((patch) => patch.id.startsWith(`tile:${region.id}:cell-`));
    if (patches.length === 0) continue;
    partialObserved ||= patches.length > 2 && patches.reduce((sum, patch) => sum + destinationArea(patch), 0) < width * height;
    for (const patch of patches) {
      for (const vertex of patch.vertices) {
        assert.ok(vertex.x >= x - 6 / 1920 - 1e-10 && vertex.x <= x + width + 6 / 1920 + 1e-10, 'bit cells stay local instead of whole-box fly-in');
        assert.ok(vertex.y >= y - 6 / 1080 - 1e-10 && vertex.y <= y + height + 6 / 1080 + 1e-10, 'bit cells stay within the small jitter envelope');
      }
    }
  }
  assert.ok(partialObserved, 'integrated overlay reveals a genuine partial subcell pattern');

  const id = `tile:${region.id}:triangle-a`;
  const exact = planAt(0.999).commands.find((command): command is ConstructionPatch => command.kind === 'texture' && command.id === id);
  assert.ok(exact);
  const [sx0, sy0, sx1, sy1] = region.sourceBoxPx;
  assert.deepEqual(exact.vertices.map((vertex) => [vertex.x, vertex.y]), [[x, y], [x + width, y], [x + width, y + height]]);
  assert.deepEqual(exact.vertices.map((vertex) => [vertex.u, vertex.v]), [[sx0 / 2731, sy0 / 1536], [sx1 / 2731, sy0 / 1536], [sx1 / 2731, sy1 / 1536]]);
});

test('painter order matches settled background -> figure -> foreground -> overlay tiles', () => {
  const commands = planAt(0.82).commands;
  const lastIndex = (predicate: (command: ConstructionCommand) => boolean): number => {
    for (let index = commands.length - 1; index >= 0; index -= 1) if (predicate(commands[index]!)) return index;
    return -1;
  };
  const firstIndex = (predicate: (command: ConstructionCommand) => boolean): number => commands.findIndex(predicate);
  const lastBackground = lastIndex((command) => command.id.startsWith('architecture:'));
  const firstFigure = firstIndex((command) => command.id.startsWith('figure:'));
  const lastFigure = lastIndex((command) => command.id.startsWith('figure:'));
  const firstTile = firstIndex((command) => command.id.startsWith('tile:'));
  const firstForeground = firstIndex((command) => command.kind === 'texture' && command.texture === 'foreground');
  const lastForeground = lastIndex((command) => command.kind === 'texture' && command.texture === 'foreground');
  assert.ok([lastBackground, firstFigure, lastFigure, firstForeground, lastForeground, firstTile].every((index) => index >= 0));
  assert.ok(lastBackground < firstFigure && lastFigure < firstForeground && lastForeground < firstTile);
});

test('manifest/source inputs are never mutated and invalid source metadata uses bounded local fallbacks only', () => {
  const before = JSON.parse(JSON.stringify(MANIFEST));
  planAt(0.3);
  planAt(0.7);
  planAt(0.999);
  assert.deepEqual(MANIFEST, before, 'planner does not mutate source rectangles or UV boxes');

  const a = planAt(0.43, { manifest: MANIFEST }).commands.find((command) => command.id === 'figure:scaffold:joint-head');
  const b = planAt(0.43, { manifest: ALT_MANIFEST }).commands.find((command) => command.id === 'figure:scaffold:joint-head');
  assert.ok(a?.kind === 'disc' && b?.kind === 'disc');
  assert.notDeepEqual(a.center, b.center, 'valid manifest figure placement remains authoritative');

  const malformed = {
    figureHomeRectNorm: [Number.NaN, -2, 4, 0],
    tilesAtlasSizePx: [0, Number.NaN],
    tileRegions: [{ id: 'bad', group: 'left', rectNorm: [0, 0, Number.NaN, 1], sourceBoxPx: [0, 0, 0, 0] }],
  } as unknown as PhotoManifestData;
  const safe = planAt(0.7, { manifest: malformed });
  assert.equal(safe.commands.some((command) => command.id.startsWith('tile:bad:')), false);
  safe.commands.forEach(assertNormalisedAndFinite);
});
