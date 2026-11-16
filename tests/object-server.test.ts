import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { IncomingMessage, type ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createObjectHandler, OBJECTS } from '../src/server/object.ts';
import { chairFixture, mutateChair } from './fixtures/prop-glb.ts';

const origin = 'http://127.0.0.1:5173';
const pictureKey = 'synthetic-picture-key', modelKey = 'synthetic-model-key';
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('synthetic picture')]);
const glbUrl = 'https://assets.meshy.ai/account/tasks/task-1/output/model.glb?Expires=1';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

class CapturedResponse extends EventEmitter {
  statusCode = 200;
  writableEnded = false;
  destroyed = false;
  closed = false;
  headers = new Map<string, string | number>();
  body?: string | Buffer;
  setHeader(name: string, value: string | number) { this.headers.set(name, value); }
  end(value: string | Buffer) { this.body = value; this.writableEnded = true; this.closed = true; this.emit('close'); }
  get data() { return JSON.parse(String(this.body)); }
}
type Handler = ReturnType<typeof createObjectHandler>;
async function request(handler: Handler, options: {
  method?: string; url?: string; remoteAddress?: string; headers?: Record<string, string | undefined>; rawHeaders?: string[]; body?: string;
} = {}) {
  const socket = new Socket();
  Object.defineProperty(socket, 'remoteAddress', { value: options.remoteAddress ?? '127.0.0.1' });
  const req = new IncomingMessage(socket);
  req.method = options.method ?? 'POST';
  req.url = options.url ?? '/api/object';
  req.headers = { host: '127.0.0.1:5173', origin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...options.headers };
  req.rawHeaders = options.rawHeaders ?? Object.entries(req.headers).flatMap(([name, value]) => value === undefined ? [] : [name, value]);
  const res = new CapturedResponse();
  let nextCalls = 0;
  const done = handler(req, res as unknown as ServerResponse, () => { nextCalls += 1; });
  req.complete = true; req.push(Buffer.from(options.body ?? JSON.stringify({ id: 'globe' }))); req.push(null);
  await done;
  return { res, nextCalls };
}
/** Providers that answer as the real ones did on 2026-11-16, with any step replaced. */
function setup(steps: { picture?: () => Response; create?: () => Response; poll?: (n: number) => Response; download?: () => Response } = {}, maxRequests?: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  let polls = 0;
  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === 'https://api.openai.com/v1/images/generations') return steps.picture?.() ?? json({ data: [{ b64_json: png.toString('base64') }], usage: { total_tokens: 1439 } });
    if (url === 'https://api.meshy.ai/openapi/v1/image-to-3d') return steps.create?.() ?? json({ result: 'task-1' });
    if (url === 'https://api.meshy.ai/openapi/v1/image-to-3d/task-1') {
      return steps.poll?.(polls++) ?? json(polls++ ? { id: 'task-1', status: 'SUCCEEDED', model_urls: { glb: glbUrl }, consumed_credits: 15 } : { id: 'task-1', status: 'IN_PROGRESS' });
    }
    if (url === glbUrl) return steps.download?.() ?? new Response(chairFixture().bytes, { headers: { 'content-type': 'model/gltf-binary' } });
    throw new Error(`unexpected provider address ${url}`);
  };
  return { calls, handler: createObjectHandler({ origin, enabled: true, pictureKey, modelKey, fetch, maxRequests, pollMs: 1 }) };
}
const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

test('disabled, missing keys, other origins and invalid allowances fail closed without provider calls', async t => {
  t.mock.method(console, 'info', () => {});
  const { calls } = setup();
  const fetch = (() => { throw new Error('must not be called'); }) as typeof globalThis.fetch;
  for (const method of ['GET', 'POST']) {
    const { res } = await request(createObjectHandler({ origin, fetch, pictureKey, modelKey }), { method });
    assert.equal(res.statusCode, 503);
    assert.equal(res.data[method === 'GET' ? 'reason' : 'error'], 'disabled');
    assert.equal(res.data.remainingRequests, 3);
  }
  for (const keys of [{ pictureKey }, { modelKey }, { pictureKey: ' ', modelKey }]) {
    assert.equal((await request(createObjectHandler({ origin, enabled: true, fetch, ...keys }))).res.data.error, 'missing_key');
  }
  for (const invalid of ['http://localhost:5173', 'http://127.0.0.1:5199', `${origin}/`]) assert.throws(() => createObjectHandler({ origin: invalid }), /origin/);
  for (const maxRequests of [0, -1, 1.5, NaN, 21]) assert.throws(() => createObjectHandler({ origin, maxRequests }), /allowance/);
  assert.equal(calls.length, 0);
});

test('endpoint, method, loopback, origin, duplicate headers and the fixed id list are checked before any spending', async () => {
  const { handler, calls } = setup();
  assert.equal((await request(handler, { url: '/other' })).nextCalls, 1);
  for (const url of ['/api/object/', '/api/object?id=globe']) assert.equal((await request(handler, { url })).res.statusCode, 404);
  const put = (await request(handler, { method: 'PUT' })).res;
  assert.equal(put.statusCode, 405);
  assert.equal(put.headers.get('allow'), 'GET, POST');
  assert.equal((await request(handler, { remoteAddress: '192.0.2.1' })).res.statusCode, 403);
  for (const headers of [{ host: 'evil.example' }, { origin: undefined }, { origin: 'null' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await request(handler, { headers })).res.statusCode, 403);
  }
  assert.equal((await request(handler, { rawHeaders: ['origin', origin, 'Origin', origin] })).res.statusCode, 403);
  assert.equal((await request(handler, { headers: { 'content-type': 'text/plain' } })).res.statusCode, 415);
  // No free text: an unknown id, a prompt beside the id, a prompt alone and non-objects are all refused.
  for (const body of ['{"id":"a throne of teeth"}', '{"id":"globe","prompt":"x"}', '{"prompt":"x"}', '"globe"', '[]', '{', '']) {
    assert.equal((await request(handler, { body })).res.data.error, 'invalid_request');
  }
  assert.equal((await request(handler, { body: JSON.stringify({ id: 'x'.repeat(2000) }) })).res.statusCode, 413);
  const status = (await request(handler, { method: 'GET', headers: { origin: undefined } })).res;
  assert.equal(status.statusCode, 200);
  assert.deepEqual(status.data, { available: true, reason: null, pictureModel: 'gpt-image-2.5-flare', meshModel: 'meshy-t2.5',
    objects: OBJECTS.map(({ id, name }) => ({ id, name })), remainingRequests: 3 });
  assert.equal(OBJECTS.length, 6);
  assert.equal(calls.length, 0);
});

test('one id becomes a picture, then a textured model, then an admitted GLB, and consumes one allowance', async t => {
  const info = t.mock.method(console, 'info', () => {});
  const { handler, calls } = setup({}, 1);
  const { res } = await request(handler);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(new Uint8Array(res.body as Buffer), new Uint8Array(chairFixture().bytes));
  assert.deepEqual(calls.map(call => call.url), ['https://api.openai.com/v1/images/generations', 'https://api.meshy.ai/openapi/v1/image-to-3d',
    'https://api.meshy.ai/openapi/v1/image-to-3d/task-1', 'https://api.meshy.ai/openapi/v1/image-to-3d/task-1', glbUrl]);
  const picture = JSON.parse(String(calls[0].init.body));
  assert.deepEqual({ ...picture, prompt: undefined }, { model: 'gpt-image-2.5-flare', prompt: undefined, n: 1, size: '1536x1024', output_format: 'png' });
  assert.ok(picture.prompt.startsWith(`${OBJECTS.find(object => object.id === 'globe')!.subject}, standing upright`));
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { image_url: `data:image/png;base64,${png.toString('base64')}`, model_type: 'smart-topology',
    ai_model: 'meshy-t2.5', target_polycount: 10000, should_texture: true, target_formats: ['glb'] });
  // Each key goes to its own provider only; the asset download carries neither.
  assert.equal(header(calls[0].init, 'authorization'), `Bearer ${pictureKey}`);
  for (const call of calls.slice(1, 4)) assert.equal(header(call.init, 'authorization'), `Bearer ${modelKey}`);
  assert.equal(header(calls[4].init, 'authorization'), undefined);
  for (const call of calls) assert.equal(call.init.redirect, 'error');
  const logged = JSON.parse(String(info.mock.calls[0].arguments[1]));
  assert.deepEqual({ id: logged.id, pictureTokens: logged.pictureTokens, modelCredits: logged.modelCredits }, { id: 'globe', pictureTokens: 1439, modelCredits: 15 });
  const again = (await request(handler)).res;
  assert.equal(again.statusCode, 429);
  assert.equal(again.data.remainingRequests, 0);
  assert.equal(calls.length, 5);
});

test('provider failures, foreign asset addresses, oversized and inadmissible models are refused and still consume the allowance', async () => {
  const cases: [Parameters<typeof setup>[0], string, number][] = [
    [{ picture: () => json({ error: 'no' }, 400) }, 'picture_failed', 1],
    [{ picture: () => json({ data: [{ b64_json: Buffer.from('not a png at all').toString('base64') }] }) }, 'invalid_provider_response', 1],
    [{ picture: () => json({ data: [{ url: 'https://example.com/picture.png' }] }) }, 'invalid_provider_response', 1],
    [{ create: () => json({ message: 'insufficient credits' }, 402) }, 'model_failed', 2],
    [{ create: () => json({ result: '../../other' }) }, 'invalid_provider_response', 2],
    [{ poll: () => json({ id: 'task-1', status: 'FAILED', task_error: { message: 'x' } }) }, 'model_failed', 3],
    [{ poll: () => json({ id: 'task-2', status: 'SUCCEEDED', model_urls: { glb: glbUrl } }) }, 'invalid_provider_response', 3],
    [{ poll: () => json({ id: 'task-1', status: 'SUCCEEDED', model_urls: { glb: 'https://example.com/tasks/task-1/output/model.glb' } }) }, 'invalid_provider_response', 3],
    [{ poll: () => json({ id: 'task-1', status: 'SUCCEEDED', model_urls: { glb: 'https://assets.meshy.ai/tasks/other/output/model.glb' } }) }, 'invalid_provider_response', 3],
    [{ download: () => new Response(new Uint8Array(16), { headers: { 'content-length': String(9 * 1024 * 1024) } }) }, 'invalid_provider_response', 5],
    [{ download: () => new Response(new Uint8Array(8 * 1024 * 1024 + 1)) }, 'invalid_provider_response', 5],
    [{ download: () => new Response(mutateChair(chair => { chair.json.materials[0].doubleSided = true; })) }, 'invalid_mesh', 5],
    [{ download: () => new Response(Buffer.from('not a model')) }, 'invalid_mesh', 5],
  ];
  for (const [steps, error, providerCalls] of cases) {
    const { handler, calls } = setup(steps);
    const { res } = await request(handler);
    assert.equal(res.data.error, error, JSON.stringify(res.data));
    assert.ok(res.statusCode >= 400);
    assert.equal(res.data.remainingRequests, 2);
    assert.equal(calls.length, providerCalls, error);
  }
});
