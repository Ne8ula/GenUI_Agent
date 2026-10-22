import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createShadoBridgeClient, configuredShadoOrigin } from './client-v2.mjs';

const now = 1_800_000_000_000, origin = 'https://shado.example';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const recipe = { modelId: 'fixture-video', nodeId: 'video-1', projectId: 'project-1' };
const recipeHash = hash(JSON.stringify(recipe));
const photo = Buffer.alloc(512 * 1024 + 3, 7);
const asset = { sourceId: 'source-1', version: 'version-1', sha256: hash(photo), size: photo.length, mimeType: 'image/png' };
const grant = () => ({ token: `fixture.${'a'.repeat(43)}`, taskId: 'task-1', project: JSON.stringify({ format: 'shado-project', version: 1, project: { id: 'project-1' } }),
  nodeId: 'video-1', recipeHash, phase: 'generation', quoteId: 'quote-1', maximumMicros: 500_000, expiresAt: now + 900_000, assets: [asset] });
const uploadGrant = () => ({ ...grant(), phase: 'upload', quoteId: null, maximumMicros: 0 });
const quote = () => ({ id: 'quote-1', recipeHash, recipe, currency: 'USD', maximumCostUsd: .5,
  pricing: { amountMicros: 500_000 }, expiresAt: new Date(now + 60_000).toISOString() });
const task = () => ({ id: 'task-1', projectId: 'project-1', status: 'queued', steps: [{ nodeId: 'video-1', invocationId: 'invocation-1', status: 'waiting' }], receipts: [] });
const json = value => Response.json(value);
const client = (fetcher, overrides = {}) => createShadoBridgeClient({ origin, grant: grant(), fetcher, now: () => now, ...overrides });

test('upload-only grant cannot spend or read tasks; generation grant cannot upload or requote', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw Error('Must not run'); };
  const upload = client(fetcher, { grant: uploadGrant() }), generation = client(fetcher);
  for (const action of [() => upload.submit(quote()), () => upload.status(), () => upload.stop(),
    () => upload.outputDescriptor('output-1'), () => generation.uploadPhoto(0, photo), () => generation.quote()]) {
    await assert.rejects(action(), error => error.code === 'grant_phase_mismatch');
  }
  for (const changed of [{ ...quote(), id: 'other-quote' }, { ...quote(), pricing: { amountMicros: 499_999 }, maximumCostUsd: .499999 }])
    await assert.rejects(generation.submit(changed));
  assert.equal(calls, 0);
});
test('recovery can observe an existing failed task but cannot upload quote or submit', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return json({ ok: true, task: { ...task(), status: 'failed' } }); },
    { grant: { ...uploadGrant(), phase: 'recovery' } });
  assert.equal((await api.status()).status, 'failed');
  for (const action of [() => api.uploadPhoto(0, photo), () => api.quote(), () => api.submit(quote())])
    await assert.rejects(action(), error => error.code === 'grant_phase_mismatch');
  assert.equal(calls, 1);
});

test('origin and grant configuration reject unsafe authority and freeze the input', async () => {
  for (const url of ['http://shado.example', 'https://user:pass@shado.example', 'https://shado.example/api', 'https://shado.example?token=secret', 'file:///tmp/x'])
    assert.throws(() => configuredShadoOrigin(url));
  for (const field of ['ownerId', 'role', 'approved', 'maximumCostUsd', 'operations', 'providerKey', 'renewAutomatically'])
    assert.throws(() => client(async () => {}, { grant: { ...grant(), [field]: 'untrusted' } }));
  let calls = 0;
  const bundle = grant(), api = client(async () => { calls++; return json({ ok: true, task: null }); }, { grant: bundle });
  bundle.expiresAt = 0;
  assert.equal(await api.status(), null); assert.equal(calls, 1);
  await assert.rejects(client(async () => { calls++; }, { grant: { ...grant(), expiresAt: now } }).status(), error => error.code === 'grant_expired');
  assert.equal(calls, 1);
});

test('quote with upload authority then submit with distinct exact-quote authority', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    assert.equal(url, `${origin}/api/eva-room-bridge`);
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Authorization, `Bearer ${grant().token}`);
    const body = JSON.parse(init.body); calls.push(body);
    return json(body.operation === 'quote' ? { ok: true, quote: quote() } : { ok: true, task: task() });
  };
  const api = client(fetcher);
  const offer = await client(fetcher, { grant: uploadGrant() }).quote();
  assert.equal((await api.submit(offer)).id, 'task-1');
  assert.deepEqual(calls.map(call => call.operation), ['quote', 'submit']);
  assert.equal(calls[1].maximumMicros, 500_000);
  assert.equal(calls[1].recipeHash, recipeHash);
  assert.equal('ownerId' in calls[1], false);
});

test('uncertain submission performs one request and directs recovery by stable task', async () => {
  let calls = 0;
  const api = client(async () => { calls++; throw new Error('private upstream response'); });
  await assert.rejects(api.submit(quote()), error => error.uncertain === true && !error.message.includes('private'));
  assert.equal(calls, 1);
  const mismatch = client(async () => json({ ok: true, task: { ...task(), id: 'different-task' } }));
  await assert.rejects(mismatch.submit(quote()), error => error.uncertain === true);
});

test('quote rejects price, hash and expiry changes before paid submission', async () => {
  let calls = 0;
  const api = client(async () => { calls++; return json({ ok: true, task: task() }); });
  for (const changed of [{ ...quote(), pricing: { amountMicros: 1_000_001 } },
    { ...quote(), recipe: { ...recipe, modelId: 'changed' } },
    { ...quote(), expiresAt: new Date(now).toISOString() }]) await assert.rejects(api.submit(changed));
  assert.equal(calls, 0);
});

test('upload resumes existing chunks and validates photo bytes and seal', async () => {
  const operations = [], descriptor = { ...asset, id: 'media-1', sealed: false, chunkBytes: 512 * 1024 };
  const api = client(async (_url, init) => {
    const body = JSON.parse(init.body), request = body.request;
    assert.equal(body.assetIndex, 0); operations.push(request.operation);
    if (request.operation === 'prepare') return json({ ok: true, asset: descriptor, uploaded: [0] });
    if (request.operation === 'chunk') {
      assert.equal(request.index, 1); assert.equal(Buffer.from(request.base64, 'base64').length, 3);
      return json({ ok: true, chunk: { id: 'media-1', index: 1 } });
    }
    return json({ ok: true, asset: { ...descriptor, sealed: true } });
  }, { grant: uploadGrant() });
  assert.equal((await api.uploadPhoto(0, photo)).sealed, true);
  assert.deepEqual(operations, ['prepare', 'chunk', 'seal']);
  await assert.rejects(api.uploadPhoto(0, Buffer.alloc(photo.length, 9)));
  assert.equal(operations.length, 3);
});

test('bad upload resume receipts and cross-asset replies are rejected', async () => {
  const descriptor = { ...asset, id: 'media-1', sealed: false, chunkBytes: 512 * 1024 };
  await assert.rejects(client(async () => json({ ok: true, asset: descriptor, uploaded: [20] }), { grant: uploadGrant() }).uploadPhoto(0, photo));
  await assert.rejects(client(async () => json({ ok: true, asset: { ...descriptor, sourceId: 'someone-else' } }), { grant: uploadGrant() }).uploadPhoto(0, photo));
});

test('output download checks descriptor, chunk identities, size and full checksum', async () => {
  const bytes = Buffer.from('synthetic video bytes');
  const descriptor = { id: 'video-output', sourceId: 'video-output', version: 'video-output', sha256: hash(bytes),
    size: bytes.length, mimeType: 'video/mp4', sealed: true, chunkBytes: 512 * 1024 };
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    return json(body.index === null ? { ok: true, asset: descriptor }
      : { ok: true, chunk: { id: 'video-output', index: 0, base64: bytes.toString('base64') } });
  };
  assert.deepEqual((await client(fetcher).downloadOutput('video-output')).bytes, bytes);
  await assert.rejects(client(fetcher).downloadOutput('video-output', { maxBytes: 2 }));
  await assert.rejects(client(async (_url, init) => {
    const body = JSON.parse(init.body);
    return json(body.index === null ? { ok: true, asset: { ...descriptor, sha256: '0'.repeat(64) } }
      : { ok: true, chunk: { id: 'video-output', index: 0, base64: bytes.toString('base64') } });
  }).downloadOutput('video-output'));
});

test('redirects, excessive bodies, auth errors and stalled responses fail without retry', async () => {
  await assert.rejects(client(async () => new Response(null, { status: 302 })).status());
  await assert.rejects(client(async () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '999999999' } })).status());
  await assert.rejects(client(async () => Response.json({ ok: false, error: { code: 'unauthorized', message: 'secret' } }, { status: 401 })).status(),
    error => error.status === 401 && !error.message.includes('secret'));
  await assert.rejects(client(async () => new Promise(() => {}), { timeoutMs: 10 }).status(),
    error => error.code === 'request_aborted');
});
