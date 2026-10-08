import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/scene/store.ts';
import type { SceneFrame, Tile } from '../src/scene/types.ts';
import { createTileState, stepTiles } from '../src/scene/tiles.ts';
import type { TileState } from '../src/scene/tiles.ts';
import { frameForDraw } from '../src/host/tilesFlag.ts';

function tile(id: string, patch: Partial<Tile> = {}): Tile {
  return { id, region: 0, x: 0.1, y: 0.1, w: 0.05, h: 0.05, pattern: 'flat', colour: [0.8, 0.4, 0.3], alpha: 0.9, cellPx: 4, hairline: 0.1, birthMs: 0, ...patch };
}

function frame(tiles: Tile[]): SceneFrame {
  return {
    store: createStore(8),
    regions: [{ id: 'layer:facade/left', band: 'facade', depth: -9, start: 0, end: 0, dynamic: false }],
    aspect: 16 / 9,
    paper: [0.1, 0.05, 0.04],
    seed: 7,
    sky: { top: [0.95, 0.85, 0.8], horizon: [0.9, 0.8, 0.75], horizonY: 0.5 },
    tiles,
    build: { durationMs: 12_000 },
  };
}

test('tiles on hands the renderer the scene frame itself', () => {
  const scene = frame([tile('tile:a'), tile('tile:b')]);
  assert.equal(frameForDraw(scene, true), scene);
});

test('tiles off hands over a copy whose tiles array is empty and leaves the scene alone', () => {
  const tiles = [tile('tile:a'), tile('tile:b', { pattern: 'dither' })];
  const scene = frame(tiles);
  const before = JSON.stringify(scene.tiles);
  const drawn = frameForDraw(scene, false);
  assert.notEqual(drawn, scene);
  assert.deepEqual(drawn.tiles, []);
  assert.notEqual(drawn.tiles, scene.tiles, 'the copy has its own array');
  assert.equal(scene.tiles, tiles, 'the scene keeps its own array');
  assert.equal(scene.tiles.length, 2);
  assert.equal(JSON.stringify(scene.tiles), before, 'no tile was modified');
});

test('the copy shares the heavy parts and every other field', () => {
  const scene = frame([tile('tile:a')]);
  const drawn = frameForDraw(scene, false);
  assert.equal(drawn.store, scene.store);
  assert.equal(drawn.regions, scene.regions);
  assert.equal(drawn.sky, scene.sky);
  assert.equal(drawn.build, scene.build);
  assert.equal(drawn.paper, scene.paper);
  assert.equal(drawn.aspect, scene.aspect);
  assert.equal(drawn.seed, scene.seed);
});

test('the copy is cached per frame, so its identity is stable from one draw to the next', () => {
  const scene = frame([tile('tile:a')]);
  assert.equal(frameForDraw(scene, false), frameForDraw(scene, false));
  assert.notEqual(frameForDraw(frame([tile('tile:a')]), false), frameForDraw(scene, false));
});

/** Steps the real tile life in 100 ms slices on the life clock until `until` says stop (or `limitMs` passes); returns the clock. */
function stepUntil(scene: SceneFrame, state: TileState, until: () => boolean, limitMs = 60_000): number {
  let t = 0;
  while (!until() && t < limitMs) {
    t += 100;
    stepTiles(state, scene, 100, t, { reducedMotion: false });
  }
  return t;
}

test('life keeps stepping the scene tiles while they are hidden, and switching back shows the stepped state', () => {
  const scene = frame([tile('tile:a')]);
  const first = scene.tiles[0];
  assert.ok(first);
  const original = { pattern: first.pattern, colour: first.colour };
  const state = createTileState(scene, scene.seed);
  assert.equal(frameForDraw(scene, false).tiles.length, 0, 'hidden before any step');

  // The real stepTiles, not a hand edit: the tile must swap while the renderer is being handed no tiles.
  const t = stepUntil(scene, state, () => state.total > 0);
  assert.ok(state.total > 0, `the tile never swapped in ${t} ms of life`);
  assert.notEqual(first.pattern, original.pattern, 'a swap always changes the pattern');

  assert.equal(frameForDraw(scene, false).tiles.length, 0, 'still hidden after life stepped');
  const shown = frameForDraw(scene, true);
  assert.equal(shown, scene);
  assert.equal(shown.tiles[0], first, 'the very tile life stepped');
  assert.equal(shown.tiles[0]?.pattern, first.pattern);
  assert.notEqual(shown.tiles[0]?.pattern, original.pattern, 'switching back shows the stepped state, not the authored one');
});

test('hiding the tiles does not change the tile life: a hidden run and a shown run end in the same state', () => {
  const hidden = frame([tile('tile:a'), tile('tile:b', { pattern: 'dither', x: 0.4 }), tile('tile:c', { pattern: 'dotgrid', x: 0.7 })]);
  const shown = frame([tile('tile:a'), tile('tile:b', { pattern: 'dither', x: 0.4 }), tile('tile:c', { pattern: 'dotgrid', x: 0.7 })]);
  const hiddenState = createTileState(hidden, hidden.seed);
  const shownState = createTileState(shown, shown.seed);
  for (let t = 100; t <= 40_000; t += 100) {
    frameForDraw(hidden, false); // what the render loop does every frame while tiles are off
    stepTiles(hiddenState, hidden, 100, t, { reducedMotion: false });
    frameForDraw(shown, true);
    stepTiles(shownState, shown, 100, t, { reducedMotion: false });
  }
  assert.ok(hiddenState.total > 0, 'the run is long enough for swaps to happen');
  assert.equal(hiddenState.total, shownState.total);
  assert.deepEqual(hidden.tiles, shown.tiles);
});

test('a frame without tiles is returned as it is, whichever way the flag points', () => {
  const scene = frame([]);
  assert.equal(frameForDraw(scene, false), scene);
  assert.equal(frameForDraw(scene, true), scene);
});
