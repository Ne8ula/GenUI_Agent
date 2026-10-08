import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasLabel } from '../src/host/label.ts';

test('the seed-33 label describes beaded light on a dark ground and mentions tiles only when they are shown', () => {
  const on = canvasLabel({ look: 'seed33', facing: 'away', showTiles: true });
  const off = canvasLabel({ look: 'seed33', facing: 'away', showTiles: false });
  assert.match(on, /beaded points of light on a dark ground/);
  assert.match(on, /colour tiles/);
  assert.doesNotMatch(off, /tile/);
  assert.match(off, /toward you/);
  assert.doesNotMatch(on, /warm paper|earlier arrival/);
});

test('the seed-33 woman walks toward the viewer whatever the arrival-look facing says', () => {
  assert.match(canvasLabel({ look: 'seed33', facing: 'away', showTiles: true }), /walking toward you/);
  assert.match(canvasLabel({ look: 'seed33', facing: 'toward', showTiles: true }), /walking toward you/);
});

test('the arrival label names the earlier look, has no tiles and follows the near walker facing', () => {
  const away = canvasLabel({ look: 'arrival', facing: 'away', showTiles: true });
  const toward = canvasLabel({ look: 'arrival', facing: 'toward', showTiles: true });
  for (const label of [away, toward]) {
    assert.match(label, /earlier arrival look/);
    assert.match(label, /warm paper/);
    assert.doesNotMatch(label, /tile|dark ground|beaded/);
  }
  assert.match(away, /walking away from you/);
  assert.match(toward, /walking toward you/);
});

test('an unknown look is described as the seed-33 look and no label carries a placeholder', () => {
  assert.equal(canvasLabel({ look: 'other', facing: 'away', showTiles: true }), canvasLabel({ look: 'seed33', facing: 'away', showTiles: true }));
  for (const look of ['seed33', 'arrival']) for (const showTiles of [true, false]) {
    const label = canvasLabel({ look, facing: 'away', showTiles });
    assert.doesNotMatch(label, /undefined|null|\$\{/);
    assert.match(label, /^EVA's Paris frame/);
  }
});
