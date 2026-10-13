import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formedTileGlitchPatches } from '../src/scene/matrixTiles.ts';
import type { PhotoTileRegion } from '../src/scene/types.ts';

const region: PhotoTileRegion = {
  id: 'mapping-fixture',
  group: 'right',
  rectNorm: [0.2, 0.2, 0.4, 0.4],
  sourceBoxPx: [100, 100, 600, 400],
};

test('every formed glitch patch changes the base source mapping rather than repainting identical pixels', () => {
  let inspected = 0;
  const [x, y, w, h] = region.rectNorm;
  const [sx0, sy0, sx1, sy1] = region.sourceBoxPx;
  for (let timeMs = 12000; timeMs <= 18400; timeMs += 100) {
    for (const patch of formedTileGlitchPatches({ region, atlasSizePx: [1000, 500], index: 4, seed: 33, timeMs })) {
      const changesMapping = patch.vertices.some(vertex => {
        const baseU = (sx0 + ((vertex.x - x) / w) * (sx1 - sx0)) / 1000;
        const baseV = (sy0 + ((vertex.y - y) / h) * (sy1 - sy0)) / 500;
        return Math.abs(vertex.u - baseU) > 1e-9 || Math.abs(vertex.v - baseV) > 1e-9;
      });
      assert.ok(changesMapping, `${patch.id} at ${timeMs}ms only repaints its unchanged base pixels`);
      inspected += 1;
    }
  }
  assert.ok(inspected > 0, 'the test exercised active bursts, not only resting states');
});
