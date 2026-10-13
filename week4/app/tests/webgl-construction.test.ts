// Focused unit coverage for the one pure (non-GL) helper constructionWebgl.ts exports:
// constructionTileShownCount. Everything else in that module issues real WebGL2 calls (programs, VAOs,
// buffer uploads via gl.bufferSubData/drawArrays) and has no Node-side WebGL2RenderingContext to run
// against here — the existing test suite never exercises render/webgl2.ts's gl.* calls directly either
// (render-pack.test.ts / render-tiles.test.ts test the pure CPU-side pack.ts/patterns.ts packers, not
// gl.draw*); actual pixel evidence for the construction draw path is the capture driver's job (writer 4,
// IMPLEMENTATION_CONTRACT.md "New capture driver"), not a Node unit test. The core planner module
// (scene/seed33Construction.ts) this renderer depends on did not exist at the time this pass was
// implemented, so these fixtures build ConstructionPlan/ConstructionCommand objects by hand against the
// frozen scene/constructionTypes.ts contract instead of importing a real plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constructionTileShownCount } from '../src/render/constructionWebgl.ts';
import type { ConstructionCommand, ConstructionPlan, ConstructionTexture } from '../src/scene/constructionTypes.ts';

function texturePatch(id: string, texture: ConstructionTexture): ConstructionCommand {
  return {
    kind: 'texture',
    id,
    component: 'tile',
    alpha: 1,
    texture,
    vertices: [
      { x: 0, y: 0, u: 0, v: 0 },
      { x: 1, y: 0, u: 1, v: 0 },
      { x: 0, y: 1, u: 0, v: 1 },
    ],
  };
}

function plan(commands: ConstructionCommand[]): ConstructionPlan {
  return {
    active: true,
    progress: 0.5,
    figureStage: 'volume',
    commands,
    stats: { growingStrands: 0, completedStrands: 0, movingTiles: 0 },
  };
}

test('constructionTileShownCount counts distinct tile:<manifest-id> prefixes among texture:"tiles" commands', () => {
  const p = plan([
    texturePatch('tile:facade-left/03:a', 'tiles'),
    texturePatch('tile:facade-left/03:b', 'tiles'),
    texturePatch('tile:facade-left/04:a', 'tiles'),
    texturePatch('figure:garment:coat-a', 'figure'),
  ]);
  assert.equal(constructionTileShownCount(p), 2);
});

test('constructionTileShownCount ignores non-tile-prefixed and non-"tiles"-texture commands', () => {
  const p = plan([
    texturePatch('figure:garment:coat-a', 'figure'),
    texturePatch('architecture:facade-left:03', 'background'),
  ]);
  assert.equal(constructionTileShownCount(p), 0);
});

test('constructionTileShownCount is 0 for an empty command list', () => {
  assert.equal(constructionTileShownCount(plan([])), 0);
});
