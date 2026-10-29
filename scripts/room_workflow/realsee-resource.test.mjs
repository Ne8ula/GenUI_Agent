import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ffsResource} from './crime-scene.mjs';

// This fixed candidate must not replace or inherit the measured scan's identity.
test('Realsee candidate has separate integrity-bound GLB and provenance entries', async () => {
  const catalog = JSON.parse(await readFile(new URL('./ffs-resources.json', import.meta.url)));
  assert.deepEqual(catalog['realsee/scene.glb'], {
    path: '.local/reconstruction/ffs-th0028-realsee-v2/scene.glb',
    bytes: 1222872,
    sha256: '138e407bcff0ca2c241860b80f48486bcafeb36038123099c0ca73a116fe5815',
    type: 'model/gltf-binary',
  });
  assert.equal(catalog['scene.ply'].sha256, 'f72bf4ff75ee242e4327d442e02ae9bb11ee779ba2b0c8684efe0ab571e984c0');
  assert.equal(catalog['realsee/report.json'].sha256, '55fc8a867152a586eebd044652186771ed7e6c319f4d7c0832c80d7b65b5765b');
});

test('private candidate remains inferred, unaligned and needs-review', async t => {
  let response;
  try { response = await ffsResource('/api/room-workflow/benchmark/ffs/realsee/report.json'); }
  catch (error) { if (error.code === 'ENOENT') return t.skip('Private candidate absent'); throw error; }
  assert.ok(response, 'Candidate provenance is not admitted');
  const report = JSON.parse(response.body);
  assert.equal(report.status, 'needs-review');
  assert.equal(report.classification, 'inferred');
  assert.equal(report.scan_alignment, null);
  assert.equal(report.source_calibration_verified, false);
  assert.equal(report.complete_surface, false);
  assert.equal(report.glb_sha256, '138e407bcff0ca2c241860b80f48486bcafeb36038123099c0ca73a116fe5815');
});
