import { createHash } from 'node:crypto';

const CHUNK_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
    : JSON.stringify(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new ShadoBridgeClientError('invalid_bridge_response', message); };

export class ShadoBridgeClientError extends Error {
  constructor(code, message, { status, uncertain = false } = {}) {
    super(message); this.code = code; this.status = status; this.uncertain = uncertain;
  }
}
export function configuredShadoOrigin(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new ShadoBridgeClientError('invalid_origin', 'Configure the deployed Shado HTTPS origin.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash)
    throw new ShadoBridgeClientError('invalid_origin', 'Shado must be a bare HTTPS origin without credentials, path or query.');
  return parsed.origin;
}
async function boundedJson(response, signal) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) fail('Shado returned an unexpected response format.');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) fail('Shado response exceeded its size limit.');
  if (!response.body) fail('Shado returned an empty response.');
  const reader = response.body.getReader(), chunks = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) fail('Shado response exceeded its size limit.');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { signal.removeEventListener('abort', cancel); }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('Shado returned invalid JSON.'); }
  if (!object(value)) fail('Shado returned invalid JSON.');
  return value;
}
function mediaDescriptor(value, expected = null) {
  if (!object(value) || !id(value.id) || !id(value.sourceId) || !id(value.version)
    || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.size)
    || value.size < 1 || value.size > 200 * 1024 * 1024 || typeof value.sealed !== 'boolean'
    || value.chunkBytes !== CHUNK_BYTES || typeof value.mimeType !== 'string') fail('The media descriptor is invalid.');
  if (expected && ['sourceId', 'version', 'sha256', 'size', 'mimeType'].some(key => value[key] !== expected[key]))
    fail('The media descriptor differs from the approved original.');
  return value;
}
function validOriginal(asset) {
  return object(asset) && id(asset.sourceId) && id(asset.version) && /^[a-f0-9]{64}$/.test(asset.sha256)
    && Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= 20 * 1024 * 1024
    && ['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)
    && Object.keys(asset).sort().join(',') === 'mimeType,sha256,size,sourceId,version';
}

/** Proposed protocol v2; not wired to the active broker. Server-side only.
 * The caller must durably save taskId before submit.
 * No method retries a failed request; uncertain submit outcomes recover by status. */
export function createShadoBridgeClient({ origin, grant: input, fetcher = fetch, timeoutMs = 120_000, now = Date.now }) {
  const endpoint = `${configuredShadoOrigin(origin)}/api/eva-room-bridge`;
  if (!object(input) || Object.keys(input).sort().join(',') !== 'assets,expiresAt,maximumMicros,nodeId,phase,project,quoteId,recipeHash,taskId,token'
    || typeof input.token !== 'string' || input.token.length > 16384
    || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(input.token)
    || !id(input.taskId) || !id(input.nodeId) || !/^[a-f0-9]{64}$/.test(input.recipeHash)
    || typeof input.project !== 'string' || Buffer.byteLength(input.project) > 3_000_000
    || !['upload', 'generation', 'recovery'].includes(input.phase)
    || (input.phase !== 'generation' ? input.quoteId !== null || input.maximumMicros !== 0 : !id(input.quoteId) || input.maximumMicros < 1)
    || !Number.isSafeInteger(input.maximumMicros) || input.maximumMicros < 0 || input.maximumMicros > 100_000_000
    || !Number.isSafeInteger(input.expiresAt) || !Array.isArray(input.assets) || !input.assets.length
    || input.assets.length > 12 || !input.assets.every(validOriginal))
    throw new ShadoBridgeClientError('invalid_grant_bundle', 'A complete scoped Shado grant bundle is required.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
    throw new ShadoBridgeClientError('invalid_timeout', 'The bridge timeout must be bounded to 120 seconds.');
  const grant = structuredClone(input);
  let envelope;
  try { envelope = JSON.parse(grant.project); } catch { fail('The frozen project is invalid.'); }
  if (!object(envelope) || envelope.format !== 'shado-project' || envelope.version !== 1) fail('The frozen Shado project envelope is invalid.');
  const project = envelope.project;
  if (!object(project) || !id(project.id)) fail('The frozen project ID is invalid.');

  async function request(body, { signal } = {}) {
    const allowed = grant.phase === 'upload' ? ['media', 'quote']
      : grant.phase === 'recovery' ? ['status', 'stop', 'output'] : ['submit', 'status', 'stop', 'output'];
    if (!allowed.includes(body.operation)) throw new ShadoBridgeClientError('grant_phase_mismatch', 'Obtain the appropriate scoped grant before this operation.');
    if (grant.expiresAt <= now()) throw new ShadoBridgeClientError('grant_expired', 'Renew the same Shado task delegation before continuing.');
    signal?.throwIfAborted();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const uncertain = body.operation === 'submit';
    try {
      // Race the complete response read, not just response headers.
      const aborted = new Promise((_, reject) => {
        combined.addEventListener('abort', () => reject(new ShadoBridgeClientError('request_aborted',
          uncertain ? 'Submission acknowledgement was interrupted. Recover the saved task before continuing.' : 'The Shado request was interrupted.',
          { uncertain })), { once: true });
      });
      const operation = (async () => {
        const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${grant.token}` },
          body: JSON.stringify(body), signal: combined });
        // Custom transports must preserve the same no-redirect policy as native fetch.
        if (response.redirected || response.status >= 300 && response.status < 400) fail('Shado redirected the authenticated request.');
        const result = await boundedJson(response, combined);
        if (!response.ok || result.ok !== true) {
          const code = typeof result.error?.code === 'string' && /^[a-z0-9_]{1,80}$/.test(result.error.code) ? result.error.code : 'bridge_request_failed';
          throw new ShadoBridgeClientError(code, 'Shado rejected the request.', { status: response.status,
            uncertain: uncertain && response.status >= 500 });
        }
        return result;
      })();
      return await Promise.race([operation, aborted]);
    } catch (error) {
      if (error instanceof ShadoBridgeClientError) {
        // Invalid/lost successful submission replies can still hide durable admission.
        if (uncertain && error.status === undefined) error.uncertain = true;
        throw error;
      }
      throw new ShadoBridgeClientError('transport_failed',
        uncertain ? 'Submission could not be confirmed. Recover the saved task before continuing.' : 'The Shado request could not be completed.',
        { uncertain });
    } finally { clearTimeout(timer); controller.abort(); }
  }
  function verifiedQuote(value) {
    if (!object(value) || !id(value.id) || value.recipeHash !== grant.recipeHash || value.currency !== 'USD'
      || !object(value.recipe) || value.recipe.projectId !== project.id || value.recipe.nodeId !== grant.nodeId
      || hash(canonical(value.recipe)) !== grant.recipeHash
      || !Number.isSafeInteger(value.pricing?.amountMicros) || value.pricing.amountMicros < 0
      || value.pricing.amountMicros > 100_000_000 || value.maximumCostUsd !== value.pricing.amountMicros / 1_000_000
      || (grant.phase === 'generation' && (value.id !== grant.quoteId || value.pricing.amountMicros !== grant.maximumMicros))
      || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now()) fail('The quote does not match the approved task or spending limit.');
    return structuredClone(value);
  }
  function verifiedTask(value, allowNull = false) {
    if (value === null && allowNull) return null;
    if (!object(value) || value.id !== grant.taskId || value.projectId !== project.id
      || !['queued', 'running', 'waiting_approval', 'completed', 'failed', 'stopped'].includes(value.status)
      || !Array.isArray(value.steps) || value.steps.length !== 1 || value.steps[0]?.nodeId !== grant.nodeId
      || !id(value.steps[0]?.invocationId) || !Array.isArray(value.receipts) || value.receipts.length > 1
      || value.receipts.some(receipt => !object(receipt) || receipt.nodeId !== grant.nodeId || receipt.recipeHash !== grant.recipeHash
        || receipt.invocationId !== value.steps[0].invocationId || !id(receipt.jobId) || !id(receipt.quoteId)
        || !Array.isArray(receipt.outputs) || receipt.outputs.length < 1 || receipt.outputs.some(output => !id(output.id) || output.kind !== 'video')))
      fail('The durable task response does not match this delegation.');
    return structuredClone(value);
  }
  const media = (assetIndex, operation, options) => request({ operation: 'media', assetIndex, request: operation }, options);
  return Object.freeze({
    taskId: grant.taskId,
    async quote(options) { return verifiedQuote((await request({ operation: 'quote', project: grant.project, nodeId: grant.nodeId }, options)).quote); },
    async submit(quote, options) {
      const frozen = verifiedQuote(quote);
      const result = await request({ operation: 'submit', project: grant.project, nodeId: grant.nodeId,
        quoteId: frozen.id, recipeHash: frozen.recipeHash, maximumMicros: frozen.pricing.amountMicros }, options);
      try { return verifiedTask(result.task); }
      catch { throw new ShadoBridgeClientError('submission_response_mismatch', 'Recover the saved task before continuing.', { uncertain: true }); }
    },
    async status(options) { return verifiedTask((await request({ operation: 'status' }, options)).task, true); },
    async stop(options) { return verifiedTask((await request({ operation: 'stop' }, options)).task, true); },
    async uploadPhoto(assetIndex, bytes, options) {
      if (!Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex >= grant.assets.length) fail('The photo index is outside the grant.');
      const expected = grant.assets[assetIndex];
      if (!(bytes instanceof Uint8Array) || bytes.byteLength !== expected.size || hash(bytes) !== expected.sha256)
        fail('The selected photo bytes differ from the approved original.');
      const prepared = await media(assetIndex, { operation: 'prepare' }, options);
      const descriptor = mediaDescriptor(prepared.asset, expected);
      if (descriptor.sealed) return descriptor;
      const count = Math.ceil(bytes.byteLength / CHUNK_BYTES), uploaded = prepared.uploaded ?? [];
      if (!Array.isArray(uploaded) || uploaded.length > count || new Set(uploaded).size !== uploaded.length
        || uploaded.some(index => !Number.isInteger(index) || index < 0 || index >= count)) fail('The upload resume receipt is invalid.');
      for (let index = 0; index < count; index++) {
        if (uploaded.includes(index)) continue;
        const result = await media(assetIndex, { operation: 'chunk', assetId: descriptor.id, index,
          base64: Buffer.from(bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)).toString('base64') }, options);
        if (result.chunk?.id !== descriptor.id || result.chunk.index !== index) fail('The uploaded chunk receipt is invalid.');
      }
      const sealed = mediaDescriptor((await media(assetIndex, { operation: 'seal', assetId: descriptor.id }, options)).asset, expected);
      if (!sealed.sealed || sealed.id !== descriptor.id) fail('The uploaded original was not sealed.');
      return sealed;
    },
    async outputDescriptor(assetId, options) {
      if (!id(assetId)) fail('The output ID is invalid.');
      const descriptor = mediaDescriptor((await request({ operation: 'output', assetId, index: null }, options)).asset);
      if (descriptor.id !== assetId || !descriptor.sealed || !['video/mp4', 'video/webm', 'video/quicktime'].includes(descriptor.mimeType))
        fail('The completed video descriptor is invalid.');
      return descriptor;
    },
    async downloadOutput(assetId, { maxBytes = 200 * 1024 * 1024, signal } = {}) {
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 200 * 1024 * 1024) fail('The output byte limit is invalid.');
      const descriptor = await this.outputDescriptor(assetId, { signal });
      if (descriptor.size > maxBytes) fail('The video exceeds the approved download size.');
      const chunks = [];
      for (let index = 0; index < Math.ceil(descriptor.size / CHUNK_BYTES); index++) {
        const { chunk } = await request({ operation: 'output', assetId, index }, { signal });
        if (chunk?.id !== assetId || chunk.index !== index || typeof chunk.base64 !== 'string'
          || chunk.base64.length > Math.ceil(CHUNK_BYTES / 3) * 4) fail('The output chunk receipt is invalid.');
        const bytes = Buffer.from(chunk.base64, 'base64');
        if (bytes.toString('base64') !== chunk.base64 || bytes.length !== Math.min(CHUNK_BYTES, descriptor.size - index * CHUNK_BYTES))
          fail('The output chunk bytes are invalid.');
        chunks.push(bytes);
      }
      const bytes = Buffer.concat(chunks);
      if (hash(bytes) !== descriptor.sha256) fail('The completed video checksum does not match its receipt.');
      return { descriptor, bytes };
    },
  });
}
