// Focused acceptance tests for the post-formation feature-tracking overlay
// (w4-20261009-seed33-tracking-r2): week4/app/src/scene/postFormationOverlay.ts's
// `buildPostFormationOverlay`, the shared planner render/canvas2d.ts and render/webgl2.ts both now call
// once the global construction build has completed, replacing the former per-tile formedTileGlitchPatches
// burst at those two call sites only (matrixTiles.ts/seed33Construction.ts are unchanged and keep their
// own prior behaviour and test coverage in formed-tile-glitch.test.ts/formed-glitch-mapping.test.ts).
// Revision (candidate-inspection gaps 1-3): channel-filtered texture fragments instead of flat coloured
// lines, layered disjoint source rows instead of one smooth band, and genuine local clusters with a fast
// dense-member refresh. The actual per-pixel channel isolation itself happens in the renderer consumers
// (render/constructionCanvas.ts's SVG filter, render/constructionWebgl.ts's shader tint), which have no
// Node-side DOM/WebGL2RenderingContext here (consistent with the rest of this file's backends, exercised
// only through browser capture, owned by main); this file proves the SHARED planner emits the right command
// shape (channel-tagged texture patches, not coloured strokes) and the right temporal/topological behaviour.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_POSTFORMATION_COMMANDS, buildPostFormationOverlay } from '../src/scene/postFormationOverlay.ts';
import type { PostFormationOverlayInput } from '../src/scene/postFormationOverlay.ts';
import type { PhotoPose } from '../src/scene/seed33Photo.ts';
import type { PhotoTileRegion } from '../src/scene/types.ts';

const ATLAS_SIZE = Object.freeze([2731, 1536] as const);
const CHANNELS = new Set(['r', 'g', 'b', 'cyan', 'magenta', 'yellow']);

const TILE_REGIONS: readonly PhotoTileRegion[] = [
  { id: 'left-coral', group: 'left', sourceBoxPx: [249, 153, 426, 304], rectNorm: [0.0911753936, 0.099609375, 0.0648114244, 0.0983072917] },
  { id: 'right-scanlines', group: 'right', sourceBoxPx: [2014, 502, 2146, 570], rectNorm: [0.7374588063, 0.3268229167, 0.0483339436, 0.0442708333] },
  { id: 'table-cream-dots', group: 'table', sourceBoxPx: [1098, 1153, 1228, 1412], rectNorm: [0.4020505309, 0.7506510417, 0.0476016111, 0.1686197917] },
  { id: 'facade-grid', group: 'left', sourceBoxPx: [40, 40, 220, 260], rectNorm: [0.02, 0.05, 0.08, 0.18] },
];

function onFramePose(centerX = 0.4): PhotoPose {
  return { centerX, headTopY: 0.22, heightFrac: 0.55, offFrame: false, legPhase: 1.1 };
}

const baseInput: Omit<PostFormationOverlayInput, 'timeMs'> = {
  seed: 33,
  reducedMotion: false,
  tileRegions: TILE_REGIONS,
  atlasSizePx: ATLAS_SIZE,
  msAfterBuild: 5000,
  figure: { pose: onFramePose(), nativeAspect: 228 / 623 },
};

function allCoordsFiniteAndBounded(commands: ReadonlyArray<ReturnType<typeof buildPostFormationOverlay>[number]>): boolean {
  for (const command of commands) {
    if (!(Number.isFinite(command.alpha) && command.alpha >= 0 && command.alpha <= 1)) return false;
    if (command.kind === 'stroke') {
      for (const [x, y] of command.points) {
        if (!(Number.isFinite(x) && x >= -1e-6 && x <= 1 + 1e-6)) return false;
        if (!(Number.isFinite(y) && y >= -1e-6 && y <= 1 + 1e-6)) return false;
      }
      if (!Number.isFinite(command.widthPx) || command.widthPx <= 0) return false;
    } else if (command.kind === 'texture') {
      for (const v of command.vertices) {
        if (![v.x, v.y, v.u, v.v].every((n) => Number.isFinite(n) && n >= -1e-6 && n <= 1 + 1e-6)) return false;
      }
      if (command.channel !== undefined && !CHANNELS.has(command.channel)) return false;
    }
  }
  return true;
}

test('deterministic: identical inputs (including timeMs) produce byte-identical output', () => {
  const a = buildPostFormationOverlay({ ...baseInput, timeMs: 15234 });
  const b = buildPostFormationOverlay({ ...baseInput, timeMs: 15234 });
  assert.deepEqual(a, b);
  const c = buildPostFormationOverlay({ ...baseInput, timeMs: 22010 });
  const d = buildPostFormationOverlay({ ...baseInput, timeMs: 22010 });
  assert.deepEqual(c, d);
});

test('never reads Date.now/Math.random: same (seed, timeMs) called repeatedly across a real delay still matches', async () => {
  const first = buildPostFormationOverlay({ ...baseInput, timeMs: 9000 });
  await new Promise((resolve) => setTimeout(resolve, 15));
  const second = buildPostFormationOverlay({ ...baseInput, timeMs: 9000 });
  assert.deepEqual(first, second);
});

test('bounded: command count never exceeds MAX_POSTFORMATION_COMMANDS and every coordinate is finite and frame-bounded', () => {
  for (let timeMs = 0; timeMs <= 30000; timeMs += 500) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    assert.ok(commands.length <= MAX_POSTFORMATION_COMMANDS, `${timeMs}ms: ${commands.length} commands exceeds the cap`);
    assert.ok(allCoordsFiniteAndBounded(commands), `${timeMs}ms: a command has a non-finite, out-of-range or unknown-channel coordinate`);
  }
});

test('continued activity: the plan keeps changing through the whole 12-30s post-formation window, not settling to one frozen state', () => {
  const snapshots = new Set<string>();
  for (let timeMs = 12000; timeMs <= 30000; timeMs += 400) {
    snapshots.add(JSON.stringify(buildPostFormationOverlay({ ...baseInput, timeMs })));
  }
  assert.ok(snapshots.size > 5, `expected visible variation across 12-30s, saw only ${snapshots.size} distinct snapshot(s)`);
});

test('mostly non-empty: a frame with every feature simultaneously fully dropped-out is rare, not the rule', () => {
  let emptyCount = 0;
  let total = 0;
  for (let timeMs = 0; timeMs <= 20000; timeMs += 733) {
    total += 1;
    if (buildPostFormationOverlay({ ...baseInput, timeMs }).length === 0) emptyCount += 1;
  }
  assert.ok(emptyCount <= Math.ceil(total * 0.1), `${emptyCount}/${total} sampled instants were fully empty`);
});

test('variable rectangle sizes: sampled tracking-box widths are not uniform across clusters/time', () => {
  const widths = new Set<number>();
  for (let timeMs = 0; timeMs <= 16000; timeMs += 250) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    for (const c of commands) {
      if (c.kind === 'stroke' && c.id.includes(':box') && c.points.length === 5) {
        const xs = c.points.map((p) => p[0]);
        widths.add(Math.round((Math.max(...xs) - Math.min(...xs)) * 1000) / 1000);
      }
    }
  }
  assert.ok(widths.size >= 4, `expected widely varying box widths, saw ${widths.size} distinct rounded width(s)`);
});

test('crosses and connectors are both observed over a reasonable scan window', () => {
  let sawCross = false;
  let sawConnector = false;
  for (let timeMs = 0; timeMs <= 20000 && !(sawCross && sawConnector); timeMs += 250) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    if (commands.some((c) => c.id.includes(':cross-a'))) sawCross = true;
    if (commands.some((c) => c.id.startsWith('connector:'))) sawConnector = true;
  }
  assert.ok(sawCross, 'expected at least one diagonal cross mark across the scan');
  assert.ok(sawConnector, 'expected at least one connector hairline across the scan');
});

test('connectors only ever link nearby features: no connector endpoint pair spans a large fraction of the frame', () => {
  for (let timeMs = 0; timeMs <= 16000; timeMs += 500) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    for (const c of commands) {
      if (c.kind !== 'stroke' || !c.id.startsWith('connector:')) continue;
      const [[x0, y0], [x1, y1]] = c.points as readonly [readonly [number, number], readonly [number, number]];
      const distance = Math.hypot(x0 - x1, y0 - y1);
      assert.ok(distance <= 0.32, `${c.id} at ${timeMs}ms spans ${distance.toFixed(3)}, expected a nearby (not frame-wide) link`);
    }
  }
});

test('genuine local clusters: at least one feature shows 3+ simultaneous tracking-box members at some sampled instant', () => {
  let sawDenseCluster = false;
  for (let timeMs = 0; timeMs <= 20000 && !sawDenseCluster; timeMs += 200) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    const byFeature = new Map<string, number>();
    for (const c of commands) {
      if (c.kind !== 'stroke' || !c.id.endsWith(':box')) continue;
      // id shape: track:<feature>:m<N>:box
      const match = /^track:(.+):m\d+:box$/.exec(c.id);
      if (!match) continue;
      const feature = match[1]!;
      byFeature.set(feature, (byFeature.get(feature) ?? 0) + 1);
    }
    if (Array.from(byFeature.values()).some((n) => n >= 3)) sawDenseCluster = true;
  }
  assert.ok(sawDenseCluster, 'expected at least one feature to show a genuine 3+-member local cluster across the scan');
});

test('channel-filtered texture fragments replace the flat coloured line substitute: real texture commands carry a channel tag, no stroke carries one', () => {
  let sawChannelTexture = false;
  for (let timeMs = 0; timeMs <= 12000 && !sawChannelTexture; timeMs += 200) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    for (const c of commands) {
      assert.equal(c.kind === 'stroke' ? (c as { channel?: unknown }).channel : undefined, undefined, `${c.id}: a stroke command must never carry a channel tag`);
      if (c.kind === 'texture' && c.channel !== undefined) {
        assert.ok(CHANNELS.has(c.channel), `${c.id}: unexpected channel ${c.channel}`);
        sawChannelTexture = true;
      }
    }
  }
  assert.ok(sawChannelTexture, 'expected at least one real channel-tagged texture fragment across the scan');
  // The old flat-coloured "chroma" stroke substitute must be entirely gone.
  for (let timeMs = 0; timeMs <= 12000; timeMs += 500) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    assert.equal(commands.some((c) => c.kind === 'stroke' && c.id.includes('chroma')), false, `${timeMs}ms: a flat-coloured chroma stroke leaked back in`);
  }
});

test('real layered row fragments: a single instant shows several distinct disjoint rows for at least one feature', () => {
  let sawLayeredRows = false;
  for (let timeMs = 0; timeMs <= 12000 && !sawLayeredRows; timeMs += 200) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    const rowsByFeature = new Map<string, Set<number>>();
    for (const c of commands) {
      // id shape: tear:<feature>:row<N>[:...]
      const match = /^tear:(.+):row(\d+)(?::|$)/.exec(c.id);
      if (!match) continue;
      const feature = match[1]!;
      const rowIndex = Number(match[2]);
      const set = rowsByFeature.get(feature) ?? new Set<number>();
      set.add(rowIndex);
      rowsByFeature.set(feature, set);
    }
    if (Array.from(rowsByFeature.values()).some((set) => set.size >= 3)) sawLayeredRows = true;
  }
  assert.ok(sawLayeredRows, 'expected at least one feature to show 3+ distinct simultaneous row fragments');
});

test('topology changes within a 1-second stationary-figure window: member/row counts change several times, not just once', () => {
  const pose = onFramePose();
  const snapshots = new Set<string>();
  for (let timeMs = 10000; timeMs <= 11000; timeMs += 50) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs, figure: { pose, nativeAspect: 228 / 623 } });
    const boxCount = commands.filter((c) => c.kind === 'stroke' && c.id.endsWith(':box')).length;
    const rowCount = commands.filter((c) => c.kind === 'texture' && /:row\d+:a$/.test(c.id)).length;
    snapshots.add(`${boxCount}|${rowCount}`);
  }
  assert.ok(snapshots.size >= 4, `expected several distinct topology states within 1s (stationary figure), saw ${snapshots.size}`);
});

test('walk-away tile anchors stay fixed instead of inheriting the retired whole-tile drift', () => {
  const early = buildPostFormationOverlay({ ...baseInput, timeMs: 4000, msAfterBuild: 0 });
  const late = buildPostFormationOverlay({ ...baseInput, timeMs: 4000, msAfterBuild: 8000 });
  assert.ok(early.some(c => c.id.startsWith('tear:accent-')));
  assert.deepEqual(early, late, 'only the host-clock local glitch state changes; whole tile anchors do not drift');
});

test('figure attachment: figure-tagged commands appear while on frame and disappear once offFrame is reported', () => {
  const on = buildPostFormationOverlay({ ...baseInput, timeMs: 5000, figure: { pose: onFramePose(), nativeAspect: 228 / 623 } });
  assert.ok(on.some((c) => c.id.includes('figure-shoulder') || c.id.includes('figure-torso')), 'expected figure-attached marks while on frame');

  const offPose: PhotoPose = { centerX: 2.4, headTopY: -0.1, heightFrac: 3, offFrame: true, legPhase: 4 };
  const off = buildPostFormationOverlay({ ...baseInput, timeMs: 5000, figure: { pose: offPose, nativeAspect: 228 / 623 } });
  assert.equal(off.some((c) => c.id.includes('figure-shoulder') || c.id.includes('figure-torso')), false, 'no figure-attached mark may remain once the figure has exited');

  const nullFigure = buildPostFormationOverlay({ ...baseInput, timeMs: 5000, figure: null });
  assert.equal(nullFigure.some((c) => c.id.includes('figure-shoulder') || c.id.includes('figure-torso')), false, 'no figure-attached mark without a supplied pose');
});

test('reduced motion is a single static, time-invariant plan (not a slower animation)', () => {
  const t1 = buildPostFormationOverlay({ ...baseInput, timeMs: 1000, reducedMotion: true, figure: { pose: onFramePose(), nativeAspect: 228 / 623 } });
  const t2 = buildPostFormationOverlay({ ...baseInput, timeMs: 18000, reducedMotion: true, figure: { pose: onFramePose(), nativeAspect: 228 / 623 } });
  const t3 = buildPostFormationOverlay({ ...baseInput, timeMs: 29500, reducedMotion: true, figure: { pose: onFramePose(), nativeAspect: 228 / 623 } });
  assert.deepEqual(t1, t2);
  assert.deepEqual(t1, t3);
  assert.ok(t1.length > 0, 'the static reduced-motion plan is not itself empty');

  // The reduced-motion plan differs from the live (non-reduced) plan sampled across a scan (i.e. it is a
  // distinct frozen composition, not coincidentally identical to every live frame).
  let sawDifference = false;
  for (let timeMs = 0; timeMs <= 20000 && !sawDifference; timeMs += 400) {
    const live = buildPostFormationOverlay({ ...baseInput, timeMs });
    if (JSON.stringify(live) !== JSON.stringify(t1)) sawDifference = true;
  }
  assert.ok(sawDifference, 'expected the static reduced-motion plan to differ from at least one live frame');
});

test('reduced motion still follows the supplied (already-reduced) figure pose, and omits figure marks once that pose reports offFrame', () => {
  const homePose = onFramePose(0.362869);
  const withFigure = buildPostFormationOverlay({ ...baseInput, timeMs: 7000, reducedMotion: true, figure: { pose: homePose, nativeAspect: 228 / 623 } });
  assert.ok(withFigure.some((c) => c.id.includes('figure-shoulder')), 'reduced motion still shows figure marks anchored to the supplied home pose');

  const offPose: PhotoPose = { ...homePose, offFrame: true };
  const withoutFigure = buildPostFormationOverlay({ ...baseInput, timeMs: 7000, reducedMotion: true, figure: { pose: offPose, nativeAspect: 228 / 623 } });
  assert.equal(withoutFigure.some((c) => c.id.includes('figure-shoulder')), false);
});

test('empty tileRegions and a null figure still produce a bounded, valid (non-crashing) plan from the fixed furniture/architecture anchors alone', () => {
  const commands = buildPostFormationOverlay({ ...baseInput, timeMs: 6000, tileRegions: [], figure: null });
  assert.ok(commands.length > 0);
  assert.ok(allCoordsFiniteAndBounded(commands));
  assert.equal(commands.some((c) => c.id.includes('accent-')), false, 'no accent cluster without any tile regions');
});

test('accent clusters only ever reference the supplied tileRegions’ own real ids (never a fabricated region)', () => {
  const knownIds = new Set(TILE_REGIONS.map((r) => r.id));
  for (let timeMs = 0; timeMs <= 12000; timeMs += 500) {
    const commands = buildPostFormationOverlay({ ...baseInput, timeMs });
    for (const c of commands) {
      // track:/tear: ids delimit the feature id with a trailing ':'; connector: ids concatenate two
      // feature ids without a reliable separator, so they are checked by the distance test instead.
      const match = /^(?:track|tear):accent-([^:]+):/.exec(c.id);
      if (!match) continue;
      assert.ok(knownIds.has(match[1]!), `${c.id} does not reference a supplied tile region`);
    }
  }
});

test('non-finite/invalid seed, timeMs, msAfterBuild and atlas size fall back to bounded defaults rather than throwing or producing NaN', () => {
  assert.doesNotThrow(() => buildPostFormationOverlay({ ...baseInput, timeMs: Number.NaN }));
  assert.doesNotThrow(() => buildPostFormationOverlay({ ...baseInput, timeMs: -500 }));
  assert.doesNotThrow(() => buildPostFormationOverlay({ ...baseInput, timeMs: 4000, seed: Number.NaN }));
  assert.doesNotThrow(() => buildPostFormationOverlay({ ...baseInput, timeMs: 4000, atlasSizePx: [0, 0] }));
  assert.doesNotThrow(() => buildPostFormationOverlay({ ...baseInput, timeMs: 4000, msAfterBuild: Number.NaN }));
  const withBadAtlas = buildPostFormationOverlay({ ...baseInput, timeMs: 4000, atlasSizePx: [0, 0] });
  assert.equal(withBadAtlas.some((c) => c.id.includes('accent-')), false, 'an invalid atlas size suppresses only the accent cluster');
  assert.ok(allCoordsFiniteAndBounded(withBadAtlas));
});

test('inputs are never mutated', () => {
  const regionsCopy = JSON.stringify(TILE_REGIONS);
  const poseCopy = { ...onFramePose() };
  buildPostFormationOverlay({ ...baseInput, timeMs: 8000, figure: { pose: poseCopy, nativeAspect: 228 / 623 } });
  assert.equal(JSON.stringify(TILE_REGIONS), regionsCopy);
  assert.deepEqual(poseCopy, onFramePose());
});
