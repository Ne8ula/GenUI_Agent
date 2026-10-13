import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed33Construction } from '../src/scene/seed33Construction.ts';
import { CONSTRUCTION_COMMAND_LIMIT } from '../src/scene/constructionTypes.ts';
import type {
  ConstructionCommand,
  ConstructionInput,
  ConstructionPlan,
  ConstructionPoint,
  ConstructionStroke,
  ConstructionPatch,
  FigureConstructionStage,
} from '../src/scene/constructionTypes.ts';
import type { PhotoManifestData, PhotoTileRegion } from '../src/scene/types.ts';

const BUILD_MS = 12_000;
const TILE_REGIONS = [
  {
    id: 'left-coral',
    group: 'left',
    sourceBoxPx: [249, 153, 426, 304],
    rectNorm: [0.0911753936, 0.099609375, 0.0648114244, 0.0983072917],
  },
  {
    id: 'right-scanlines',
    group: 'right',
    sourceBoxPx: [2014, 502, 2146, 570],
    rectNorm: [0.7374588063, 0.3268229167, 0.0483339436, 0.0442708333],
  },
  {
    id: 'table-cream-dots',
    group: 'table',
    sourceBoxPx: [1098, 1153, 1228, 1412],
    rectNorm: [0.4020505309, 0.7506510417, 0.0476016111, 0.1686197917],
  },
] as const satisfies readonly PhotoTileRegion[];

const MANIFEST: PhotoManifestData = {
  figureHomeRectNorm: [0.321127792, 0.3489583333, 0.4046136946, 0.7545572917],
  tilesAtlasSizePx: [2731, 1536],
  tileRegions: TILE_REGIONS,
};

const inputAt = (progress: number, overrides: Partial<ConstructionInput> = {}): ConstructionInput => ({
  timeMs: Math.round(BUILD_MS * progress),
  buildMs: BUILD_MS,
  seed: 33,
  reducedMotion: false,
  showTiles: true,
  manifest: MANIFEST,
  ...overrides,
});

const planAt = (progress: number, overrides: Partial<ConstructionInput> = {}): ConstructionPlan =>
  buildSeed33Construction(inputAt(progress, overrides));

const semantic = (command: ConstructionCommand, prefix: string): boolean =>
  command.id.startsWith(prefix) || command.component.startsWith(prefix);

const finite = (value: number, label: string): void => {
  assert.ok(Number.isFinite(value), `${label} must be finite; got ${value}`);
};

const normalised = (value: number, label: string): void => {
  finite(value, label);
  assert.ok(value >= 0 && value <= 1, `${label} must be in 0..1; got ${value}`);
};

const checkPoint = (point: ConstructionPoint, label: string): void => {
  assert.equal(point.length, 2, `${label} is a 2D point`);
  normalised(point[0], `${label}.x`);
  normalised(point[1], `${label}.y`);
};

const findStage = (stage: FigureConstructionStage, from: number, to: number): { progress: number; plan: ConstructionPlan } => {
  for (let step = 0; step <= 40; step += 1) {
    const progress = from + ((to - from) * step) / 40;
    const plan = planAt(progress);
    const stageCommands = plan.commands.filter((command) => semantic(command, `figure:${stage}:`));
    const observable = stage === 'scaffold'
      ? stageCommands.some((command) => command.kind === 'stroke') && stageCommands.some((command) => command.kind === 'disc')
      : stage === 'volume'
        ? stageCommands.some((command) => command.kind === 'solid')
        : stageCommands.some((command) => command.kind === 'stroke') && stageCommands.some((command) => command.kind === 'texture');
    if (plan.figureStage === stage && observable) return { progress, plan };
  }
  assert.fail(`no ${stage} stage was observable in documented window ${from}..${to}`);
};

const pathLength = (points: readonly ConstructionPoint[]): number => {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    length += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }
  return length;
};

test('completed, zero-length, and reduced-motion inputs bypass construction and expose the settled scene', () => {
  const cases: Array<[string, ConstructionInput, number | null]> = [
    ['completed', inputAt(1), 1],
    ['past completion', inputAt(1.4), 1],
    ['zero build', inputAt(0, { buildMs: 0, timeMs: 0 }), 1],
    ['reduced mid-build', inputAt(0.52, { reducedMotion: true }), null],
  ];

  for (const [label, input, expectedProgress] of cases) {
    const plan = buildSeed33Construction(input);
    assert.equal(plan.active, false, `${label}: construction is bypassed`);
    if (expectedProgress !== null) assert.equal(plan.progress, expectedProgress, `${label}: progress is complete`);
    else assert.ok(plan.progress >= 0 && plan.progress <= 1, `${label}: reported progress remains bounded`);
    assert.equal(plan.figureStage, 'complete', `${label}: no intermediate figure is exposed`);
    assert.deepEqual(plan.commands, [], `${label}: no construction commands leak into the settled path`);
    assert.equal(plan.stats.growingStrands, 0, `${label}: no strand remains active`);
    assert.equal(plan.stats.movingTiles, 0, `${label}: no tile remains in assembly motion`);
    assert.ok(Number.isSafeInteger(plan.stats.completedStrands) && plan.stats.completedStrands >= 0, `${label}: completed strand count remains valid`);
  }
});

test('active plans are deterministic, finite, normalised, uniquely identified, and bounded by the exported cap', () => {
  for (const progress of [0, 0.1, 0.25, 0.4, 0.52, 0.67, 0.8, 0.92, 0.999]) {
    const input = inputAt(progress);
    const first = buildSeed33Construction(input);
    const second = buildSeed33Construction(input);
    assert.deepEqual(first, second, `progress ${progress}: same input is deterministic`);
    assert.equal(first.active, true, `progress ${progress}: build is active`);
    assert.ok(first.progress >= 0 && first.progress < 1, `progress ${progress}: progress is clamped below completion`);
    assert.ok(first.commands.length <= CONSTRUCTION_COMMAND_LIMIT, `progress ${progress}: command cap`);
    assert.ok(first.commands.length < 12_000, `progress ${progress}: planner remains substantially bounded`);
    const ids = new Set<string>();
    for (const command of first.commands) {
      assert.ok(command.id.length > 0 && command.component.length > 0, 'commands have semantic identity');
      assert.equal(ids.has(command.id), false, `duplicate command id ${command.id}`);
      ids.add(command.id);
      normalised(command.alpha, `${command.id}.alpha`);
      if (command.kind === 'stroke') {
        assert.ok(command.points.length >= 2, `${command.id}: a stroke has drawable geometry`);
        command.points.forEach((point, index) => checkPoint(point, `${command.id}.points[${index}]`));
        finite(command.widthPx, `${command.id}.widthPx`);
        assert.ok(command.widthPx > 0, `${command.id}: positive width`);
      } else if (command.kind === 'disc') {
        checkPoint(command.center, `${command.id}.center`);
        finite(command.radiusPx, `${command.id}.radiusPx`);
        assert.ok(command.radiusPx > 0, `${command.id}: positive radius`);
      } else if (command.kind === 'solid') {
        command.points.forEach((point, index) => checkPoint(point, `${command.id}.points[${index}]`));
      } else {
        for (const [index, vertex] of command.vertices.entries()) {
          normalised(vertex.x, `${command.id}.vertices[${index}].x`);
          normalised(vertex.y, `${command.id}.vertices[${index}].y`);
          normalised(vertex.u, `${command.id}.vertices[${index}].u`);
          normalised(vertex.v, `${command.id}.vertices[${index}].v`);
        }
      }
      if (command.kind !== 'texture') {
        command.colour.forEach((channel, index) => normalised(channel, `${command.id}.colour[${index}]`));
      }
    }
    for (const [name, value] of Object.entries(first.stats)) {
      assert.ok(Number.isSafeInteger(value) && value >= 0, `progress ${progress}: ${name} is a non-negative integer`);
    }
  }
});

test('the documented figure windows expose scaffold, opaque body volume, then separate figure-textured garment geometry', () => {
  const scaffold = findStage('scaffold', 0.22, 0.44);
  const scaffoldCommands = scaffold.plan.commands.filter((command) => semantic(command, 'figure:scaffold:'));
  assert.ok(scaffoldCommands.some((command) => command.kind === 'stroke'), `progress ${scaffold.progress}: scaffold has articulated lines`);
  assert.ok(scaffoldCommands.some((command) => command.kind === 'disc'), `progress ${scaffold.progress}: scaffold has joint nodes`);
  assert.equal(scaffold.plan.commands.some((command) => semantic(command, 'figure:volume:') || semantic(command, 'figure:garment:')), false, 'scaffold is not a dim completed body or coat');

  const volume = findStage('volume', 0.44, 0.64);
  const bodySolids = volume.plan.commands.filter((command) => semantic(command, 'figure:volume:') && command.kind === 'solid');
  assert.ok(bodySolids.length > 0, `progress ${volume.progress}: body volume uses opaque solid triangles`);
  assert.ok(bodySolids.every((command) => command.alpha > 0), 'body geometry is visible rather than a zero-alpha label');
  assert.equal(volume.plan.commands.some((command) => semantic(command, 'figure:volume:') && command.kind === 'texture'), false, 'body volume is not the finished figure matte');
  assert.equal(volume.plan.commands.some((command) => semantic(command, 'figure:garment:')), false, 'garment remains a later independent stage');

  const garment = findStage('garment', 0.64, 0.94);
  const garmentPanels = garment.plan.commands.filter((command) => semantic(command, 'figure:garment:'));
  assert.ok(garmentPanels.some((command) => command.kind === 'stroke'), `progress ${garment.progress}: garment has independent seam/ribbon growth`);
  assert.ok(garmentPanels.some((command) => command.kind === 'texture' && command.texture === 'figure'), `progress ${garment.progress}: garment resolves through local figure-source panels`);
  assert.ok(garment.plan.commands.some((command) => semantic(command, 'figure:volume:') && command.kind === 'solid'), 'garment assembles over retained body volume geometry');
});

test('multiple architectural/object strands grow independently and carry component-local leading bead tips', () => {
  const objectPrefixes = ['architecture:', 'table:', 'chair:', 'cup:', 'ashtray:'];
  let observed: ConstructionPlan | null = null;
  for (let step = 2; step <= 17; step += 1) {
    const plan = planAt(step / 20);
    const strokes = plan.commands.filter(
      (command): command is ConstructionStroke => command.kind === 'stroke' && objectPrefixes.some((prefix) => semantic(command, prefix)),
    );
    const strokeComponents = new Set(strokes.map((command) => command.component));
    const tippedComponents = new Set(
      plan.commands
        .filter((command) => command.kind === 'disc' && strokeComponents.has(command.component))
        .map((command) => command.component),
    );
    const distinctLengths = new Set(strokes.map((command) => pathLength(command.points).toFixed(5)));
    if (plan.stats.growingStrands >= 2 && strokeComponents.size >= 2 && tippedComponents.size >= 2 && distinctLengths.size >= 2) {
      observed = plan;
      break;
    }
  }
  assert.ok(observed, 'an observable build window contains multiple non-uniformly grown semantic strands with their own bead tips');
  assert.ok(observed.stats.completedStrands >= 0, 'completed and growing strand counts are reported separately');
});

test('tile construction uses the supplied real source regions, moves across frames, and disappears completely when tiles are hidden', () => {
  const samples = [0.25, 0.4, 0.52, 0.67, 0.8, 0.92, 0.98].map((progress) => ({ progress, plan: planAt(progress) }));
  let motion: { progress: number; plan: ConstructionPlan; nextProgress: number; changedId: string } | null = null;
  for (let index = 0; index < samples.length - 1 && motion === null; index += 1) {
    const current = samples[index]!;
    const next = samples[index + 1]!;
    if (current.plan.stats.movingTiles <= 0 && next.plan.stats.movingTiles <= 0) continue;
    const nextById = new Map(
      next.plan.commands
        .filter((command): command is ConstructionPatch => command.kind === 'texture' && command.texture === 'tiles')
        .map((command) => [command.id, command] as const),
    );
    for (const command of current.plan.commands) {
      if (command.kind !== 'texture' || command.texture !== 'tiles') continue;
      const later = nextById.get(command.id);
      if (!later) continue;
      const beforePositions = command.vertices.flatMap((vertex) => [vertex.x, vertex.y]);
      const afterPositions = later.vertices.flatMap((vertex) => [vertex.x, vertex.y]);
      if (beforePositions.some((value, position) => Math.abs(value - afterPositions[position]!) > 1e-6)) {
        motion = { progress: current.progress, plan: current.plan, nextProgress: next.progress, changedId: command.id };
        break;
      }
    }
  }
  assert.ok(motion, 'at least one documented capture interval contains persistent tile geometry whose destination coordinates move');

  const tileCommands = motion.plan.commands.filter((command): command is ConstructionPatch => command.kind === 'texture' && command.texture === 'tiles');
  assert.ok(tileCommands.length > 0);
  for (const command of tileCommands) {
    const region = TILE_REGIONS.find((candidate) => semantic(command, `tile:${candidate.id}:`));
    assert.ok(region, `${command.id}: every tile command maps to a supplied manifest region`);
    const [atlasWidth, atlasHeight] = MANIFEST.tilesAtlasSizePx;
    const [sourceX0, sourceY0, sourceX1, sourceY1] = region.sourceBoxPx;
    const u0 = sourceX0 / atlasWidth;
    const v0 = sourceY0 / atlasHeight;
    const u1 = sourceX1 / atlasWidth;
    const v1 = sourceY1 / atlasHeight;
    for (const vertex of command.vertices) {
      assert.ok(vertex.u >= u0 - 1e-9 && vertex.u <= u1 + 1e-9, `${command.id}: u stays inside its real source crop`);
      assert.ok(vertex.v >= v0 - 1e-9 && vertex.v <= v1 + 1e-9, `${command.id}: v stays inside its real source crop`);
    }
  }
  assert.ok(motion.changedId.startsWith('tile:') || tileCommands.some((command) => command.id === motion.changedId), `tile movement is tied to stable semantic geometry between ${motion.progress} and ${motion.nextProgress}`);

  const hidden = planAt(motion.progress, { showTiles: false });
  assert.equal(hidden.stats.movingTiles, 0, 'hidden tiles are not counted as moving');
  assert.equal(hidden.commands.some((command) => semantic(command, 'tile:')), false, 'showTiles=false removes every tile construction command');
  assert.equal(hidden.commands.some((command) => command.kind === 'texture' && command.texture === 'tiles'), false, 'no tiles-atlas geometry remains under another name');
});

test('near-complete construction preserves settled foreground occlusion without covering overlay tiles', () => {
  const plan = planAt(0.999);
  const layers = { background: 0, figure: 1, foreground: 2, tiles: 3 } as const;
  const order = plan.commands.filter((command) => command.kind === 'texture').map((command) => layers[command.texture]);
  assert.deepEqual([...new Set(order)], [0, 1, 2, 3], 'all settled layers are present, with overlay tiles last');
  assert.ok(order.every((layer, index) => index === 0 || layer >= order[index - 1]!), 'construction painter order matches both settled renderers');
});
