import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validatePropGlb } from '../room/prop-glb-admission.ts';

// Live object generation: a fixed object id -> an OpenAI picture -> a Meshy textured model -> GLB admission -> the GLB.
// Provider handling adapted from the earlier prop routes (git show f661157:src/server/prop-mesh.ts, prop-reference-image-openai.ts).

const endpoint = '/api/object';
const pictureUrl = 'https://api.openai.com/v1/images/generations';
const pictureModel = 'gpt-image-2.5-flare';
const meshUrl = 'https://api.meshy.ai/openapi/v1/image-to-3d';
const meshModel = 'meshy-t2.5';
const requestByteLimit = 1024;
const pictureByteLimit = 8 * 1024 * 1024;
// Base64 of a picture at its limit, plus the response's own fields.
const pictureJsonLimit = Math.ceil(pictureByteLimit / 3) * 4 + 64 * 1024;
const taskJsonLimit = 64 * 1024;
const glbByteLimit = 8 * 1024 * 1024;

/** The only objects this route makes. A request names an id; no visitor text ever reaches a provider. */
export const OBJECTS = [
  { id: 'diving-helmet', name: 'brass diving helmet', subject: 'A vintage brass diving helmet with round glass portholes' },
  { id: 'gramophone', name: 'gramophone', subject: 'An antique gramophone with a large brass horn on a dark wooden box' },
  { id: 'rocking-horse', name: 'rocking horse', subject: 'A worn painted wooden rocking horse' },
  { id: 'globe', name: 'antique globe', subject: 'An antique terrestrial globe on a turned wooden floor stand' },
  { id: 'chess-knight', name: 'marble chess knight', subject: 'A giant white marble chess knight piece' },
  { id: 'televisions', name: 'stack of televisions', subject: 'A stack of three old cathode-ray television sets with dark blank screens' },
] as const;
// The wording of the one measured run (2026-11-16), with the subject swapped.
const picturePrompt = (subject: string) => `${subject}, standing upright on a plain light-grey studio floor in front of a plain light-grey backdrop, seen from a three-quarter front view at eye level, the whole object in frame with space around it, soft even light, no text, no people.`;

const charged = 'Provider charges may still apply. No retry was made.';
const failures = {
  not_found: [404, 'Unknown object endpoint.'],
  forbidden: [403, 'Objects require the configured local origin and a loopback connection.'],
  method: [405, 'Use GET for status or POST for one object id.'],
  content_type: [415, 'Send uncompressed UTF-8 application/json.'],
  invalid_request: [400, 'Send only { "id": <one of the listed object ids> }.'],
  request_too_large: [413, 'Object request exceeds 1 KiB.'],
  disabled: [503, 'Object generation is not enabled.'],
  missing_key: [503, 'The server-side picture and model keys are not both configured.'],
  busy: [409, 'Another object is being made.'],
  budget_exhausted: [429, 'The configured object allowance is exhausted.'],
  picture_failed: [502, `The picture provider did not deliver a picture. ${charged}`],
  model_failed: [502, `The model provider did not deliver a model. ${charged}`],
  provider_unavailable: [502, `A provider could not be reached or dropped the connection. ${charged}`],
  invalid_provider_response: [502, `A provider returned an invalid or oversized response. ${charged}`],
  invalid_mesh: [422, `The model failed bounded GLB admission. ${charged}`],
  timeout: [504, `A local deadline expired; the remote work may still complete. ${charged}`],
  cancelled: [499, `Work stopped locally; the remote work may still complete. ${charged}`],
} as const;
class RequestFailure extends Error {
  code: keyof typeof failures;
  status: number;
  constructor(code: keyof typeof failures) { super(failures[code][1]); this.code = code; this.status = failures[code][0]; }
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function jsonType(value: unknown) { return typeof value === 'string' && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value.trim()); }
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}
function readInput(req: IncomingMessage, signal: AbortSignal): Promise<typeof OBJECTS[number]> {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    const finish = (error?: unknown, input?: typeof OBJECTS[number]) => {
      req.off('data', data); req.off('end', end); signal.removeEventListener('abort', abort);
      if (error !== undefined) { req.resume(); reject(error); } else resolve(input!);
    };
    const abort = () => finish(signal.reason);
    const data = (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > requestByteLimit) finish(new RequestFailure('request_too_large')); else chunks.push(chunk);
    };
    const end = () => {
      try {
        const length = req.headers['content-length'];
        if (length !== undefined && Number(length) !== bytes) throw new Error('length');
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        const object = record(value) && Object.keys(value).length === 1 ? OBJECTS.find(entry => entry.id === value.id) : undefined;
        if (!object) throw new Error('id');
        finish(undefined, object);
      } catch { finish(new RequestFailure('invalid_request')); }
    };
    if (signal.aborted) { abort(); return; }
    if (req.readableEnded) { finish(new RequestFailure('invalid_request')); return; }
    signal.addEventListener('abort', abort, { once: true });
    req.on('data', data);
    req.once('end', end);
  });
}

export function createObjectHandler(options: {
  origin: string; enabled?: boolean; pictureKey?: string; modelKey?: string; maxRequests?: number;
  fetch?: typeof globalThis.fetch; pollMs?: number;
}) {
  if (options.origin !== 'http://127.0.0.1:5173' && options.origin !== 'http://127.0.0.1:4173') throw new Error('Object origin must be an approved loopback origin.');
  const maxRequests = options.maxRequests ?? 3;
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 20) throw new Error('Object allowance must be an integer from 1 to 20.');
  const origin = options.origin;
  const host = new URL(origin).host;
  const enabled = options.enabled === true;
  const pictureKey = enabled ? options.pictureKey?.trim() : undefined;
  const modelKey = enabled ? options.modelKey?.trim() : undefined;
  const fetch = options.fetch ?? globalThis.fetch;
  const pollMs = options.pollMs ?? 2000;
  let attempts = 0;
  let active: AbortController | null = null;
  const unavailable = () => !enabled ? 'disabled' : !pictureKey || !modelKey ? 'missing_key' : active ? 'busy' : attempts >= maxRequests ? 'budget_exhausted' : null;

  // One bounded provider exchange: its own deadline, no redirects, at most `limit` bytes read. null = a status outside `accept`.
  async function exchange(url: string, init: RequestInit, limit: number, timeout: number, signal: AbortSignal, accept = [200]): Promise<{ status: number; bytes: Buffer | null }> {
    const local = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
    try {
      const response = await fetch(url, { ...init, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: local });
      const length = response.headers.get('content-length');
      if (!accept.includes(response.status) || !response.body) { void response.body?.cancel().catch(() => {}); return { status: response.status, bytes: null }; }
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) { void response.body.cancel().catch(() => {}); throw new RequestFailure('invalid_provider_response'); }
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          local.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > limit) throw new RequestFailure('invalid_provider_response');
          chunks.push(chunk.value);
        }
      } catch (error) { void reader.cancel().catch(() => {}); throw error; }
      if (!bytes) throw new RequestFailure('invalid_provider_response');
      return { status: response.status, bytes: Buffer.concat(chunks) };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (local.aborted) throw new RequestFailure('timeout');
      throw error instanceof RequestFailure ? error : new RequestFailure('provider_unavailable');
    }
  }
  function parse(bytes: Buffer): unknown {
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new RequestFailure('invalid_provider_response'); }
  }

  async function picture(subject: string, signal: AbortSignal): Promise<{ png: Buffer; tokens: number | null }> {
    const reply = await exchange(pictureUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${pictureKey!}`, 'content-type': 'application/json', accept: 'application/json', 'accept-encoding': 'identity' },
      body: JSON.stringify({ model: pictureModel, prompt: picturePrompt(subject), n: 1, size: '1536x1024', output_format: 'png' }),
    }, pictureJsonLimit, 180000, signal);
    if (!reply.bytes) throw new RequestFailure('picture_failed');
    const value = parse(reply.bytes);
    const encoded = record(value) && Array.isArray(value.data) && value.data.length === 1 && record(value.data[0]) ? value.data[0].b64_json : undefined;
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new RequestFailure('invalid_provider_response');
    const png = Buffer.from(encoded, 'base64');
    // shortcut: size and signature only, because the picture goes to the model provider and never to the page; admit it fully if it is ever shown.
    if (png.length > pictureByteLimit || png.length < 8 || png.readBigUInt64BE(0) !== 0x89504e470d0a1a0an) throw new RequestFailure('invalid_provider_response');
    const tokens = record(value) && record(value.usage) && Number.isSafeInteger(value.usage.total_tokens) ? value.usage.total_tokens as number : null;
    return { png, tokens };
  }

  async function model(png: Buffer, signal: AbortSignal): Promise<{ glb: Buffer; credits: number | null }> {
    const headers = { authorization: `Bearer ${modelKey!}`, accept: 'application/json', 'accept-encoding': 'identity' };
    const created = await exchange(meshUrl, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ image_url: `data:image/png;base64,${png.toString('base64')}`, model_type: 'smart-topology', ai_model: meshModel,
        target_polycount: 10000, should_texture: true, target_formats: ['glb'] }),
    }, taskJsonLimit, 60000, signal, [200, 202]);
    if (!created.bytes) throw new RequestFailure('model_failed');
    const submitted = parse(created.bytes);
    const taskId = record(submitted) ? submitted.result : undefined;
    if (typeof taskId !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(taskId)) throw new RequestFailure('invalid_provider_response');
    let failed = 0;
    // The whole request's deadline ends this loop.
    while (true) {
      await wait(failed ? 5000 : pollMs, signal);
      let polled: Awaited<ReturnType<typeof exchange>>;
      // Reading a task's status spends nothing: a slow or failed poll is tolerated three times in a row, a malformed one is not.
      try { polled = await exchange(`${meshUrl}/${taskId}`, { method: 'GET', headers }, taskJsonLimit, 30000, signal); }
      catch (error) {
        if (signal.aborted) throw signal.reason;
        if (!(error instanceof RequestFailure) || (error.code !== 'timeout' && error.code !== 'provider_unavailable')) throw error;
        if (++failed > 3) throw new RequestFailure('model_failed');
        continue;
      }
      if (!polled.bytes) {
        if ((polled.status !== 429 && polled.status < 500) || ++failed > 3) throw new RequestFailure('model_failed');
        continue;
      }
      failed = 0;
      const task = parse(polled.bytes);
      if (!record(task) || task.id !== taskId || typeof task.status !== 'string') throw new RequestFailure('invalid_provider_response');
      if (task.status === 'PENDING' || task.status === 'IN_PROGRESS') continue;
      if (task.status !== 'SUCCEEDED') throw new RequestFailure('model_failed');
      const link = record(task.model_urls) ? task.model_urls.glb : undefined;
      let url: URL;
      try { url = new URL(typeof link === 'string' && link.length <= 4096 ? link : ''); } catch { throw new RequestFailure('invalid_provider_response'); }
      // shortcut: only the asset address seen in real responses; widen only after inspecting another real sample.
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.hostname !== 'assets.meshy.ai'
        || !url.pathname.endsWith(`/tasks/${taskId}/output/model.glb`)) throw new RequestFailure('invalid_provider_response');
      const downloaded = await exchange(url.href, { method: 'GET', headers: { accept: 'model/gltf-binary', 'accept-encoding': 'identity' } }, glbByteLimit, 60000, signal);
      if (!downloaded.bytes) throw new RequestFailure('model_failed');
      return { glb: downloaded.bytes, credits: typeof task.consumed_credits === 'number' && Number.isFinite(task.consumed_credits) ? task.consumed_credits : null };
    }
  }

  return async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void): Promise<void> => {
    if (!req.url?.startsWith(endpoint)) { next(); return; }
    const head = (status: number, type: string) => {
      res.statusCode = status;
      res.setHeader('content-type', type);
      res.setHeader('cache-control', 'no-store');
      res.setHeader('x-content-type-options', 'nosniff');
    };
    const reply = (status: number, body: unknown) => {
      if (res.destroyed || res.writableEnded) return;
      head(status, 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disconnect = () => controller?.abort(new RequestFailure('cancelled'));
    const requestClose = () => { if (!req.complete) disconnect(); };
    const responseClose = () => { if (!res.writableEnded) disconnect(); };
    req.on('error', disconnect);
    res.on('error', disconnect);
    try {
      if (req.url !== endpoint) throw new RequestFailure('not_found');
      const protectedHeaders = new Set(['host', 'origin', 'content-type', 'content-length', 'content-encoding', 'transfer-encoding', 'sec-fetch-site']);
      const seen = new Set<string>();
      for (let index = 0; index < req.rawHeaders.length; index += 2) {
        const name = req.rawHeaders[index].toLowerCase();
        if (protectedHeaders.has(name) && seen.has(name)) throw new RequestFailure('forbidden');
        seen.add(name);
      }
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') || req.headers.host !== host
        || (req.headers.origin !== undefined && req.headers.origin !== origin) || (req.method === 'POST' && req.headers.origin !== origin)
        || (req.headers['sec-fetch-site'] !== undefined && req.headers['sec-fetch-site'] !== 'same-origin' && req.headers['sec-fetch-site'] !== 'none')) throw new RequestFailure('forbidden');
      if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); throw new RequestFailure('method'); }
      const reason = unavailable();
      if (req.method === 'GET') {
        reply(reason ? failures[reason][0] : 200, { available: reason === null, reason, pictureModel, meshModel,
          objects: OBJECTS.map(({ id, name }) => ({ id, name })), remainingRequests: maxRequests - attempts });
        return;
      }
      if (reason) throw new RequestFailure(reason);
      if (!jsonType(req.headers['content-type']) || (req.headers['content-encoding'] !== undefined && req.headers['content-encoding'] !== 'identity')) throw new RequestFailure('content_type');
      const length = req.headers['content-length'];
      if (length !== undefined) {
        if (typeof length !== 'string' || !/^\d+$/.test(length) || req.headers['transfer-encoding'] !== undefined) throw new RequestFailure('invalid_request');
        if (Number(length) > requestByteLimit) throw new RequestFailure('request_too_large');
      }
      controller = new AbortController();
      active = controller;
      const operation = controller;
      const { signal } = operation;
      req.on('aborted', disconnect);
      req.on('close', requestClose);
      res.on('close', responseClose);
      timer = setTimeout(() => operation.abort(new RequestFailure('timeout')), 360000);
      if (req.aborted || (req.destroyed && !req.complete) || res.destroyed) disconnect();
      const object = await readInput(req, signal);
      signal.throwIfAborted();
      // An attempt consumes its allowance from here, whatever the providers then do.
      attempts += 1;
      const started = performance.now();
      const { png, tokens } = await picture(object.subject, signal);
      const pictured = performance.now();
      const { glb, credits } = await model(png, signal);
      const modelled = performance.now();
      try { await validatePropGlb(Uint8Array.from(glb).buffer, signal); }
      catch { if (signal.aborted) throw signal.reason; throw new RequestFailure('invalid_mesh'); }
      signal.throwIfAborted();
      // Live generation, said as such; the numbers are the providers' own (picture tokens, model credits).
      console.info('Live object generated:', JSON.stringify({ id: object.id, pictureSeconds: (pictured - started) / 1000, modelSeconds: (modelled - pictured) / 1000,
        pictureTokens: tokens, modelCredits: credits, glbBytes: glb.length }));
      if (res.destroyed || res.writableEnded) return;
      head(200, 'model/gltf-binary');
      res.setHeader('content-length', glb.length);
      res.end(glb);
    } catch (error) {
      const cause: unknown = controller?.signal.aborted ? controller.signal.reason : error;
      const failure = cause instanceof RequestFailure ? cause : new RequestFailure('provider_unavailable');
      reply(failure.status, { error: failure.code, message: failure.message, remainingRequests: maxRequests - attempts });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      req.off('aborted', disconnect);
      req.off('close', requestClose);
      res.off('close', responseClose);
      if (req.closed) req.off('error', disconnect); else req.once('close', () => req.off('error', disconnect));
      if (res.closed) res.off('error', disconnect); else res.once('close', () => res.off('error', disconnect));
      controller?.abort(new RequestFailure('cancelled'));
      if (controller && active === controller) active = null;
      if (!req.readableEnded) req.resume();
    }
  };
}
