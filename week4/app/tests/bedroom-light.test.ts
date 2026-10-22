import assert from 'node:assert/strict';
import test from 'node:test';
import { createCeilingLight } from '../src/bedroom/light.ts';

test('authored ceiling light has bounded complete parts and finite colored geometry', () => {
  const light = createCeilingLight();
  assert.equal(light.userData.provenance, 'authored');
  assert.deepEqual(light.userData.parts, ['canopy', 'stem', 'shade', 'rim', 'diffuser']);
  const positions = light.getAttribute('position');
  assert.ok(positions.count > 1000 && positions.count < 20000);
  assert.equal(light.getAttribute('color').count, positions.count);
  assert.ok(Array.from(positions.array).every(Number.isFinite));
  light.computeBoundingBox();
  assert.ok(light.boundingBox!.min.z > .6 && light.boundingBox!.max.z <= 1.04);
  assert.ok(light.boundingBox!.max.x - light.boundingBox!.min.x > .4);
  assert.ok(light.index!.count > 1000);
  light.dispose();
});
