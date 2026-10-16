import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseHybridScene } from '../src/hybrid/manifest.ts';
const source = JSON.parse(readFileSync(new URL('../public/assets/paris-hybrid-r11/scene.json', import.meta.url), 'utf8'));

test('supplied Paris pack has ten stable aligned layers and preserves its dimensions', () => {
  const scene = parseHybridScene(source);
  assert.equal(scene.layers.length, 10);
  assert.equal(new Set(scene.layers.map(layer => layer.id)).size, 10);
  assert.equal(scene.width, 848); assert.equal(scene.height, 430);
  assert.equal(scene.reference, 'paris-clean.png');
});
test('hybrid manifest rejects unknown fields, versions and duplicate IDs', () => {
  assert.throws(() => parseHybridScene({ ...source, execute: 'shader' }));
  assert.throws(() => parseHybridScene({ ...source, version: 2 }));
  assert.throws(() => parseHybridScene({ ...source, layers: [source.layers[0], source.layers[0]] }));
  assert.throws(() => parseHybridScene({ ...source, layers: [{ ...source.layers[0], shader: 'code' }] }));
});
test('hybrid assets cannot escape the fixed local asset pack', () => {
  for (const image of ['https://example.com/image.png', '/private.png', '../secret.png', 'layers/../../secret.png', 'a.png?x=1', 'data:image/png;base64,x']) {
    assert.throws(() => parseHybridScene({ ...source, reference: image }));
    assert.throws(() => parseHybridScene({ ...source, layers: [{ ...source.layers[0], image }] }));
  }
});
test('hybrid dimensions, layer count and decoded texture budgets are bounded', () => {
  for (const width of [0, -1, 4097, NaN, 3.5]) assert.throws(() => parseHybridScene({ ...source, width }));
  assert.throws(() => parseHybridScene({ ...source, width: 4096, height: 4096 }));
  assert.throws(() => parseHybridScene({ ...source, width: 4096, height: 2048 }));
  assert.throws(() => parseHybridScene({ ...source, layers: [] }));
  assert.throws(() => parseHybridScene({ ...source, layers: Array.from({ length: 33 }, (_, i) => ({ ...source.layers[0], id: `layer-${i}` })) }));
});
test('relative depth is finite illustrative data and input objects are not retained', () => {
  for (const relativeDepth of [NaN, Infinity, 101, -101]) assert.throws(() => parseHybridScene({ ...source, layers: [{ ...source.layers[0], relativeDepth }] }));
  const parsed = parseHybridScene(source);
  parsed.layers[0]!.label = 'Changed';
  assert.notEqual(source.layers[0].label, 'Changed');
});
