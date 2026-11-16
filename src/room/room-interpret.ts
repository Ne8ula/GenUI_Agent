import { validateRoomInterpretationResult, UnsupportedCapabilityError, unsupportedCapabilityMessage } from './room-interpretation-result.ts';

const messages = {
  network_error: 'The room interpretation endpoint could not be reached.',
  invalid_response: 'The endpoint did not return a valid bounded interpretation and reply.',
  unsupported_capability: unsupportedCapabilityMessage,
  interpretation_failed: 'Room interpretation failed; no replacement was installed.',
  disabled: 'Room interpretation is not enabled.',
  missing_key: 'The dedicated server-side interpretation key is not configured.',
  busy: 'Another room interpretation is already in progress.',
  budget_exhausted: 'The approved interpretation allowance is exhausted.',
  timeout: 'Interpretation timed out locally. Provider charges may still apply.',
  interpretation_refused: 'The provider declined this interpretation.',
  input_token_limit: 'The suggestion exceeds the approved input-token limit.',
} as const;
class CompositionFailure extends Error {
  code: keyof typeof messages;
  constructor(code: keyof typeof messages) { super(messages[code]); this.code = code; }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    promise.then(value => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason);
      else resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
  });
}
function cancelBody(response: Response) {
  void response.body?.cancel().catch(() => {});
}
async function responseJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) { cancelBody(response); throw signal.reason; }
  const limit = 16 * 1024;
  const type = response.headers.get('content-type');
  const length = response.headers.get('content-length');
  if (!type || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type.trim()) || !response.body
    || (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))) {
    cancelBody(response);
    throw new CompositionFailure('invalid_response');
  }
  signal.throwIfAborted();
  const reader = response.body.getReader();
  let cancelled = false;
  const cancel = () => { if (!cancelled) { cancelled = true; void reader.cancel().catch(() => {}); } };
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let complete = false;
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) { complete = true; break; }
      bytes += chunk.value.byteLength;
      if (bytes > limit || chunks.length >= limit) throw new CompositionFailure('invalid_response');
      chunks.push(chunk.value);
    }
    signal.throwIfAborted();
    if (length !== null && Number(length) !== bytes) throw new CompositionFailure('invalid_response');
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error instanceof CompositionFailure ? error : new CompositionFailure('invalid_response');
  } finally {
    signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}
export async function interpret(fetch: typeof globalThis.fetch, suggestion: string, signal: AbortSignal) {
  let received: Response | undefined;
  try {
    signal.throwIfAborted();
    const pending = fetch('/api/compose-room', {
      method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ suggestion }),
    }).then(response => {
      received = response;
      if (signal.aborted) { cancelBody(response); throw signal.reason; }
      return response;
    });
    const response = await abortable(pending, signal);
    signal.throwIfAborted();
    const data = await responseJson(response, signal);
    signal.throwIfAborted();
    if (!response.ok) {
      const code = record(data) ? data.error : undefined;
      switch (code) {
        case 'disabled': case 'missing_key': case 'busy': case 'budget_exhausted':
        case 'timeout': case 'interpretation_refused': case 'input_token_limit': case 'unsupported_capability':
          throw new CompositionFailure(code);
        default: throw new CompositionFailure('interpretation_failed');
      }
    }
    try { return validateRoomInterpretationResult(data, suggestion); }
    catch (error) { throw new CompositionFailure(error instanceof UnsupportedCapabilityError ? 'unsupported_capability' : 'invalid_response'); }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error instanceof CompositionFailure ? error : new CompositionFailure('network_error');
  } finally {
    if (received && signal.aborted) cancelBody(received);
  }
}
