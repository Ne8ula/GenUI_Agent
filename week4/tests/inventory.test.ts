import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { VARIANT_IDS } from '../core/ids.ts';
import { validateValue } from '../core/validate.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const inventory = JSON.parse(read('fixtures/assets/inventory.json'));
const jobs = JSON.parse(read('docs/design/weave-jobs.json'));
const scene = JSON.parse(read('fixtures/scenes/paris-1980s-terrace.json'));
const lines = JSON.parse(read('fixtures/narration/week4-lines.json')).lines as { lineId: string }[];

test('asset inventory validates; every runtime asset is explicitly missing with no file or hash', () => {
  const r = validateValue('asset-inventory', inventory);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  for (const a of inventory.assets) {
    assert.equal(a.status, 'missing');
    assert.equal(a.file, null);
    assert.equal(a.sha256, null);
  }
});

test('owner references are recorded with their real hashes and prohibited from runtime use', () => {
  const files = readdirSync(new URL('../references/', import.meta.url)).filter((f) => f.endsWith('.jpg')).sort();
  assert.equal(files.length, 6);
  assert.deepEqual(inventory.references.map((r: any) => r.file.slice('references/'.length)).sort(), files);
  for (const r of inventory.references) {
    const actual = createHash('sha256').update(readFileSync(new URL(`../${r.file}`, import.meta.url))).digest('hex');
    assert.equal(r.sha256, actual, r.file);
    assert.equal(r.runtimeUse, 'prohibited');
  }
});

test('inventory refers only to scene IDs that exist, covers every variant wallpaper and every narration line', () => {
  const ids = new Set([scene.sceneId, ...scene.anchors.map((a: any) => a.id), ...scene.objects.map((o: any) => o.id)]);
  for (const a of inventory.assets) for (const id of a.sceneIds) assert.ok(ids.has(id), `${a.id} -> ${id}`);
  const assetIds = new Set(inventory.assets.map((a: any) => a.id));
  for (const v of VARIANT_IDS) assert.ok(assetIds.has(`wallpaper:paris-1980s-terrace:${v}`), v);
  for (const l of lines) assert.ok(assetIds.has(`voice:${l.lineId}`), l.lineId);
  assert.equal(assetIds.size, inventory.assets.length, 'asset IDs are unique');
});

test('inventory rejects invented clearance, files and hashes', () => {
  for (const mutate of [
    (v: any) => (v.assets[0].status = 'ready'),
    (v: any) => (v.assets[0].file = 'assets/table.glb'),
    (v: any) => (v.assets[0].rights = 'cleared'),
    (v: any) => (v.references[0].runtimeUse = 'texture'),
    (v: any) => (v.assets[0].url = 'https://cdn.example/table.glb'),
  ]) {
    const v = structuredClone(inventory);
    mutate(v);
    assert.equal(validateValue('asset-inventory', v).ok, false);
  }
});

test('Weave checklist is finite, covers all packets and media, and nothing is marked run', () => {
  const r = validateValue('weave-jobs', jobs);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.errors));
  const ids = jobs.jobs.map((j: any) => j.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['S1', 'C1', 'C6', 'A1', 'A3', 'D1', 'F1', 'F2', 'F3', 'F4', 'V1', 'V8']) assert.ok(ids.includes(id), id);
  for (const p of ['P1-arrival', 'P2-desktop', 'P3-follow-ups']) {
    const media = new Set(jobs.jobs.filter((j: any) => j.packet === p).map((j: any) => j.media));
    assert.deepEqual([...media].sort(), ['image', 'video'], p);
  }
  for (const mutate of [
    (v: any) => (v.jobs[0].status = 'done'),
    (v: any) => (v.jobs[0].runId = 'run_123'),
    (v: any) => (v.jobs[0].quotedCost = 4),
    (v: any) => (v.route.modelOrWorkflowId = 'guessed-model'),
    (v: any) => v.jobs[0].outputs.push('references/images/s1.png'),
  ]) {
    const v = structuredClone(jobs);
    mutate(v);
    assert.equal(validateValue('weave-jobs', v).ok, false);
  }
});
