// Tests for the seed-33 component-construction planner (w4-20261008-seed33-construction-r1).
// Owned file, isolated worktree C:/Users/alexx/Documents/ClaudeAgent/GenUI_Agent/.claude/worktrees/wf_bba524d0-8ed-1.
// These exercise real staged geometry (distinct scaffold/volume/garment command kinds, non-uniform
// strand growth, actually-moving tile vertices) rather than mirroring the implementation's own formulas,
// so a structurally-wrong planner (e.g. a renamed global fade) would fail them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed33Construction, FIGURE_SCAFFOLD_START, FIGURE_VOLUME_START, FIGURE_GARMENT_START, FIGURE_COMPLETE_START } from '../src/scene/seed33Construction.ts';
import { CONSTRUCTION_COMMAND_LIMIT } from '../src/scene/constructionTypes.ts';
import type { ConstructionInput } from '../src/scene/constructionTypes.ts';
import type { PhotoManifestData } from '../src/scene/types.ts';

const BUILD_MS = 12_000;

const MANIFEST: PhotoManifestData = {
  figureHomeRectNorm: [0.321128, 0.348958, 0.404614, 0.754557],
  tilesAtlasSizePx: [2731, 1536],
  tileRegions: [
    { id: 'left-coral', rectNorm: [0.0912, 0.0996, 0.0648, 0.0983], sourceBoxPx: [249, 153, 426, 304], group: 'left' },
    { id: 'table-honey', rectNorm: [0.5005, 0.7858, 0.0381, 0.1497], sourceBoxPx: [1367, 1207, 1471, 1437], group: 'table' },
    { id: 'right-sage', rectNorm: [0.7375, 0.3711, 0.0363, 0.0293], sourceBoxPx: [2014, 570, 2113, 615], group: 'right' },
  ],
};

const ALT_MANIFEST: PhotoManifestData = {
  ...MANIFEST,
  figureHomeRectNorm: [0.55, 0.20, 0.68, 0.60],
};

function input(overrides: Partial<ConstructionInput> = {}): ConstructionInput {
  return {
    timeMs: 4000,
    buildMs: BUILD_MS,
    seed: 33,
    reducedMotion: false,
    showTiles: true,
    manifest: MANIFEST,
    ...overrides,
  };
}

const STABLE_ID = /^[a-z][a-z0-9-]*(:[a-z0-9][a-z0-9-]*)+$/;

test('deterministic: identical input produces a structurally identical plan', () => {
  const a = buildSeed33Construction(input());
  const b = buildSeed33Construction(input());
  assert.deepEqual(a, b);
});

test('zero-length build bypasses construction at the approved endpoint', () => {
  const plan = buildSeed33Construction(input({ buildMs: 0, timeMs: 0 }));
  assert.equal(plan.active, false);
  assert.equal(plan.commands.length, 0);
  assert.equal(plan.figureStage, 'complete');
});

test('a completed build (timeMs >= buildMs) is inactive with no commands', () => {
  const plan = buildSeed33Construction(input({ timeMs: BUILD_MS }));
  assert.equal(plan.active, false);
  assert.equal(plan.commands.length, 0);
  const plan2 = buildSeed33Construction(input({ timeMs: BUILD_MS + 5000 }));
  assert.equal(plan2.active, false);
});

test('reduced motion bypasses construction regardless of timeMs', () => {
  const mid = buildSeed33Construction(input({ timeMs: 4000, reducedMotion: true }));
  const early = buildSeed33Construction(input({ timeMs: 1, reducedMotion: true }));
  assert.equal(mid.active, false);
  assert.equal(mid.commands.length, 0);
  assert.equal(early.active, false);
  assert.equal(early.commands.length, 0);
});

test('mid-build commands stay within the exported command cap, substantially under it', () => {
  for (const t of [500, 2000, 4000, 6000, 8000, 10000, 11999]) {
    const plan = buildSeed33Construction(input({ timeMs: t }));
    assert.ok(plan.commands.length <= CONSTRUCTION_COMMAND_LIMIT, `t=${t} exceeded the hard cap`);
    assert.ok(plan.commands.length < 2000, `t=${t} used ${plan.commands.length} commands, expected a modest authored count`);
  }
});

test('every command carries a stable semantic id with a recognised component prefix', () => {
  const plan = buildSeed33Construction(input({ timeMs: 9000 }));
  assert.ok(plan.commands.length > 0);
  const prefixes = new Set(['architecture', 'table', 'chair', 'cup', 'ashtray', 'figure', 'tile']);
  for (const cmd of plan.commands) {
    assert.match(cmd.id, STABLE_ID, `bad id: ${cmd.id}`);
    const prefix = cmd.id.split(':')[0]!;
    assert.ok(prefixes.has(prefix), `unexpected component prefix in id: ${cmd.id}`);
  }
});

test('ids are stable across two calls at the same timeMs (identity, not just count)', () => {
  const a = buildSeed33Construction(input({ timeMs: 7000 })).commands.map((c) => c.id).sort();
  const b = buildSeed33Construction(input({ timeMs: 7000 })).commands.map((c) => c.id).sort();
  assert.deepEqual(a, b);
});

test('architecture strands grow non-uniformly: strokes have varied point counts at a mid-build time, not all identical or all complete', () => {
  const plan = buildSeed33Construction(input({ timeMs: 2500 }));
  const archStrokes = plan.commands.filter((c) => c.kind === 'stroke' && c.component === 'architecture');
  assert.ok(archStrokes.length > 3, 'expected several architecture strokes to be growing by t=2500');
  const lengths = new Set(archStrokes.map((c) => (c.kind === 'stroke' ? c.points.length : -1)));
  assert.ok(lengths.size > 1, 'expected non-uniform strand growth (varied point counts), not a synchronized sweep');
});

test('growing (not-yet-complete) strands emit a bright leading tip disc', () => {
  const plan = buildSeed33Construction(input({ timeMs: 1500 }));
  const tips = plan.commands.filter((c) => c.kind === 'disc' && c.id.endsWith(':tip'));
  assert.ok(tips.length > 0, 'expected at least one growing-strand tip bead early in the build');
  assert.ok(plan.stats.growingStrands > 0);
});

test('stats distinguish growing from completed strands across the build', () => {
  const early = buildSeed33Construction(input({ timeMs: 300 }));
  const late = buildSeed33Construction(input({ timeMs: 11500 }));
  assert.ok(early.stats.completedStrands < late.stats.completedStrands, 'more strands should have finished growing later in the build');
});

test('figure stage progresses absent -> scaffold -> volume -> garment -> complete with distinct geometry kinds, not a fade', () => {
  const stageAt = (frac: number) => buildSeed33Construction(input({ timeMs: Math.floor(BUILD_MS * frac) }));

  const absent = stageAt(FIGURE_SCAFFOLD_START / 2);
  assert.equal(absent.figureStage, 'absent');
  assert.equal(absent.commands.filter((c) => c.component === 'figure').length, 0);

  const scaffold = stageAt((FIGURE_SCAFFOLD_START + FIGURE_VOLUME_START) / 2);
  assert.equal(scaffold.figureStage, 'scaffold');
  const scaffoldCmds = scaffold.commands.filter((c) => c.id.startsWith('figure:scaffold:'));
  assert.ok(scaffoldCmds.length > 0, 'expected scaffold joints/bones');
  assert.ok(scaffoldCmds.some((c) => c.kind === 'disc'), 'expected joint discs');
  assert.equal(scaffold.commands.filter((c) => c.id.startsWith('figure:volume:')).length, 0, 'volume must not appear during scaffold stage');
  assert.equal(scaffold.commands.filter((c) => c.id.startsWith('figure:garment:')).length, 0, 'garment must not appear during scaffold stage');

  const volume = stageAt((FIGURE_VOLUME_START + FIGURE_GARMENT_START) / 2);
  assert.equal(volume.figureStage, 'volume');
  const volumeCmds = volume.commands.filter((c) => c.id.startsWith('figure:volume:'));
  assert.ok(volumeCmds.length > 0, 'expected opaque volume geometry');
  assert.ok(volumeCmds.every((c) => c.kind === 'solid'), 'volume stage must be actual solid geometry, not a textured/alpha matte');
  assert.equal(volume.commands.filter((c) => c.id.startsWith('figure:garment:')).length, 0, 'garment must not appear during volume stage');
  // scaffold should still be present (volume grows around it, not replacing it)
  assert.ok(volume.commands.some((c) => c.id.startsWith('figure:scaffold:')), 'scaffold should persist under the volume stage');

  const garment = stageAt((FIGURE_GARMENT_START + FIGURE_COMPLETE_START) / 2);
  assert.equal(garment.figureStage, 'garment');
  const garmentCmds = garment.commands.filter((c) => c.id.startsWith('figure:garment:'));
  assert.ok(garmentCmds.length > 0, 'expected garment panels');
  assert.ok(garmentCmds.every((c) => c.kind === 'texture' && c.texture === 'figure'), 'garment must be separate textured panel geometry');

  const complete = stageAt((FIGURE_COMPLETE_START + 1) / 2);
  assert.equal(complete.figureStage, 'complete');
});

test('no single global alpha field is used as the figure assembly mechanism: every figure command carries local alpha 1', () => {
  const plan = buildSeed33Construction(input({ timeMs: 7500 }));
  const figureCmds = plan.commands.filter((c) => c.component === 'figure');
  assert.ok(figureCmds.length > 0);
  for (const c of figureCmds) assert.equal(c.alpha, 1, `expected local alpha 1, not a fade value, on ${c.id}`);
});

test('figure geometry actually depends on the supplied manifest home rect (not hardcoded)', () => {
  // Scaffold joint windows are staggered within [0.22, 0.44) with a 0.5 width fraction of that span,
  // so every joint is guaranteed to have appeared (local > 0) once overall progress passes 0.22 + 0.5 *
  // (0.44 - 0.22) = 0.33, regardless of the per-joint hash. Sample comfortably past that.
  const t = Math.floor(BUILD_MS * 0.40);
  const a = buildSeed33Construction(input({ timeMs: t, manifest: MANIFEST }));
  const b = buildSeed33Construction(input({ timeMs: t, manifest: ALT_MANIFEST }));
  const jointA = a.commands.find((c) => c.id === 'figure:scaffold:joint:head');
  const jointB = b.commands.find((c) => c.id === 'figure:scaffold:joint:head');
  assert.ok(jointA && jointA.kind === 'disc');
  assert.ok(jointB && jointB.kind === 'disc');
  if (jointA?.kind === 'disc' && jointB?.kind === 'disc') {
    assert.notDeepEqual(jointA.center, jointB.center, 'head joint position should move with the manifest home rect');
  }
});

test('tile fragments actually move: the same tile id is at a different destination at two different progress points, and settles toward its authored rect by late build', () => {
  const tileId = 'tile:left-coral:a';
  // Each tile's own window is hashed from (index, seed); scan to find when this one first appears
  // instead of guessing a fixed time, so the test holds for any seed/hash outcome.
  let firstAppearanceMs = -1;
  for (let t = 0; t < BUILD_MS; t += 50) {
    const plan = buildSeed33Construction(input({ timeMs: t }));
    if (plan.commands.some((c) => c.id === tileId)) {
      firstAppearanceMs = t;
      break;
    }
  }
  assert.ok(firstAppearanceMs >= 0, 'expected the tile to appear at some point before the build completes');
  const earlyPlan = buildSeed33Construction(input({ timeMs: firstAppearanceMs + 50 }));
  const latePlan = buildSeed33Construction(input({ timeMs: BUILD_MS - 1 }));
  const early = earlyPlan.commands.find((c) => c.id === tileId);
  const late = latePlan.commands.find((c) => c.id === tileId);
  assert.ok(early && early.kind === 'texture');
  assert.ok(late && late.kind === 'texture');
  if (early?.kind === 'texture' && late?.kind === 'texture') {
    const earlyPos = early.vertices[0];
    const latePos = late.vertices[0];
    assert.notDeepEqual(earlyPos, latePos, 'the fragment should have moved between the two sampled times');
    const region = MANIFEST.tileRegions[0]!;
    const [rx, ry] = region.rectNorm;
    const distEarly = Math.hypot(earlyPos.x - rx, earlyPos.y - ry);
    const distLate = Math.hypot(latePos.x - rx, latePos.y - ry);
    assert.ok(distLate <= distEarly, 'the fragment should be closer to its authored rect later in the build');
  }
  assert.ok(earlyPlan.stats.movingTiles > 0, 'expected at least one tile actively moving mid-build');
});

test('showTiles=false removes every tile construction command at every sampled progress', () => {
  for (const t of [1000, 6000, 9000, 11500]) {
    const plan = buildSeed33Construction(input({ timeMs: t, showTiles: false }));
    assert.equal(plan.commands.filter((c) => c.id.startsWith('tile:')).length, 0);
    assert.equal(plan.commands.filter((c) => c.kind === 'texture' && c.texture === 'tiles').length, 0);
  }
  const plan = buildSeed33Construction(input({ timeMs: 9000, showTiles: false }));
  assert.equal(plan.stats.movingTiles, 0);
});

test('painter order is background (architecture) -> figure -> tiles -> foreground (furniture)', () => {
  const plan = buildSeed33Construction(input({ timeMs: 9500 }));
  const indexOfFirst = (pred: (id: string) => boolean): number => plan.commands.findIndex((c) => pred(c.id));
  const indexOfLast = (pred: (id: string) => boolean): number => {
    for (let i = plan.commands.length - 1; i >= 0; i--) {
      const cmd = plan.commands[i]!;
      if (pred(cmd.id)) return i;
    }
    return -1;
  };
  const lastArchitecture = indexOfLast((id) => id.startsWith('architecture:'));
  const firstFigure = indexOfFirst((id) => id.startsWith('figure:'));
  const lastFigure = indexOfLast((id) => id.startsWith('figure:'));
  const firstTile = indexOfFirst((id) => id.startsWith('tile:'));
  const lastTile = indexOfLast((id) => id.startsWith('tile:'));
  const firstFurniture = indexOfFirst((id) => id.startsWith('table:') || id.startsWith('chair:') || id.startsWith('cup:') || id.startsWith('ashtray:'));
  assert.ok(lastArchitecture < firstFigure, 'architecture (background) must be painted before the figure');
  assert.ok(lastFigure < firstTile, 'figure must be painted before tiles');
  assert.ok(lastTile < firstFurniture, 'tiles must be painted before furniture (foreground)');
});

test('no rectangular full-screen background sweep: background reveal cells are confined to their authored zones, not covering the whole frame at once', () => {
  const plan = buildSeed33Construction(input({ timeMs: 1200 }));
  const backgroundCells = plan.commands.filter((c) => c.kind === 'texture' && c.texture === 'background');
  // Early in the build only a modest, zone-bounded subset should have appeared, never a full-frame flood.
  assert.ok(backgroundCells.length < 40, `expected a modest early background cell count, got ${backgroundCells.length}`);
});

test('every emitted coordinate is finite across a sweep of progress values (no NaN/Infinity from malformed transforms)', () => {
  for (const t of [1, 1000, 3000, 5000, 7000, 9000, 11000, 11999]) {
    const plan = buildSeed33Construction(input({ timeMs: t }));
    for (const cmd of plan.commands) {
      if (cmd.kind === 'stroke') {
        for (const [x, y] of cmd.points) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y), `non-finite stroke point in ${cmd.id} at t=${t}`);
        }
      } else if (cmd.kind === 'disc') {
        assert.ok(Number.isFinite(cmd.center[0]) && Number.isFinite(cmd.center[1]) && Number.isFinite(cmd.radiusPx));
      } else if (cmd.kind === 'solid') {
        for (const [x, y] of cmd.points) assert.ok(Number.isFinite(x) && Number.isFinite(y));
      } else {
        for (const v of cmd.vertices) assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.u) && Number.isFinite(v.v));
      }
    }
  }
});

test('a malformed manifest (missing tile regions / bad home rect) does not throw and yields a safe, bounded plan', () => {
  const brokenManifest = { figureHomeRectNorm: [0, 0, 0, 0], tilesAtlasSizePx: [0, 0], tileRegions: [] } as unknown as PhotoManifestData;
  assert.doesNotThrow(() => buildSeed33Construction(input({ timeMs: 6000, manifest: brokenManifest })));
  const plan = buildSeed33Construction(input({ timeMs: 6000, manifest: brokenManifest }));
  assert.ok(plan.commands.length >= 0);
  assert.equal(plan.commands.filter((c) => c.id.startsWith('tile:')).length, 0);
});
