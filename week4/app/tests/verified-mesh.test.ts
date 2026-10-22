import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedMesh } from '../src/room/verified-mesh.ts';

const record = { bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' };
const signal = () => new AbortController().signal;
test('verified mesh returns exact bytes and progress only after bounded transfer', async () => {
  const progress: number[] = [];
  const result = await verifiedMesh('data:application/octet-stream,abc', record, signal(), v => progress.push(v));
  assert.equal(new TextDecoder().decode(result), 'abc');
  assert.equal(progress.at(-1), 1);
});
test('verified mesh rejects oversized, truncated and corrupted bytes', async () => {
  await assert.rejects(verifiedMesh('data:,abcd', record, signal(), () => {}), /exceeded/);
  await assert.rejects(verifiedMesh('data:,ab', record, signal(), () => {}), /incomplete/);
  await assert.rejects(verifiedMesh('data:,abd', record, signal(), () => {}), /integrity/);
});
test('verified mesh rejects cancellation and unbounded allocation records', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(verifiedMesh('data:,abc', record, abort.signal, () => {}), { name: 'AbortError' });
  for (const bytes of [-1, 0, 1.5, 64 * 1024 * 1024 + 1, Infinity]) {
    await assert.rejects(verifiedMesh('data:,abc', { ...record, bytes }, signal(), () => {}), /limit/);
  }
});
