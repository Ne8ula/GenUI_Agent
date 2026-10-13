import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canvasLabel } from '../src/host/label.ts';

test('the seed-33 label describes beaded light on a dark ground and mentions tiles only when they are shown', () => {
  const on = canvasLabel({ look: 'seed33', facing: 'away', showTiles: true });
  const off = canvasLabel({ look: 'seed33', facing: 'away', showTiles: false });
  assert.match(on, /beaded points of light on a dark ground/);
  assert.match(on, /colour tiles/);
  assert.doesNotMatch(off, /tile/);
  assert.match(off, /away from you toward the left side of the chair/);
  assert.match(on, /glitching around fixed anchors/);
  assert.doesNotMatch(on, /floating|walking toward you/);
  assert.doesNotMatch(on, /warm paper|earlier arrival/);
});

test('the seed-33 figure walks left and away regardless of the arrival-look facing', () => {
  assert.match(canvasLabel({ look: 'seed33', facing: 'away', showTiles: true }), /walking away from you toward the left/);
  assert.match(canvasLabel({ look: 'seed33', facing: 'toward', showTiles: true }), /walking away from you toward the left/);
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
