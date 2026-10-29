import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

async function check() {
  const path = new URL('../scripts/panorama-quality.mjs', import.meta.url);
  assert.ok(existsSync(path), 'Interior capture needs a flat-frame rejection check');
  return (await import(path.href)).assertInteriorDetail;
}

function pixels(values: number[]) { return values.flatMap(value => [value, value, value, 255]); }

test('interior capture rejects blank and nearly uniform images rather than accepting screenshot creation', async () => {
  const inspect = await check();
  for (const values of [[0, 0, 0, 0], [140, 140, 140, 140], [138, 142, 138, 142]]) {
    assert.throws(() => inspect(pixels(values)), /nearly uniform/);
  }
});

test('detail check reports measured contrast without granting visual acceptance', async () => {
  const inspect = await check();
  assert.deepEqual(inspect(pixels([50, 150, 50, 150])), { lumaStddev: 50, visualAcceptance: 'pending' });
});

test('detail check rejects empty or malformed decoded pixels', async () => {
  const inspect = await check();
  for (const input of [[], [1, 2], [NaN, 0, 0, 255], [256, 0, 0, 255]]) assert.throws(() => inspect(input), /pixels/);
});
