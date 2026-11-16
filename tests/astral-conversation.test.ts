import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createAstralConversation } from '../src/astral/conversation.ts';
import type { AstralPhase, AstralReply } from '../src/astral/types.ts';

const reply: AstralReply = { reply: 'Let the walls borrow your breath.', effect: 'breathe', intensity: 0.4, room: 'An empty hotel hallway with one door slightly too tall.', light: 'unchanged' };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
class FakeSocket extends EventTarget {
  readyState = 1;
  bufferedAmount = 0;
  sent: string[] = [];
  closes = 0;
  send(value: string) { this.sent.push(value); }
  close() { this.closes++; this.readyState = 3; }
  message(value: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
}
function setup(t: TestContext, respond?: (url: string, init: RequestInit) => Response | Promise<Response> | undefined, enableDecision = false) {
  const phases: AstralPhase[] = [];
  const decisions: Pick<AstralReply, 'effect' | 'intensity' | 'light'>[] = [];
  const replies: AstralReply[] = [];
  const levels: number[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  const tracks: (EventTarget & { stops: number; readyState: string; stop(): void })[] = [];
  const nodes: { port: { onmessage: null | ((event: { data: ArrayBuffer }) => void); close(): void }; connect(): void; disconnect(): void }[] = [];
  const sockets: FakeSocket[] = [];
  const outputs: (EventTarget & { plays: number; pauses: number })[] = [];
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const result = respond?.(url, init);
    if (result) return result;
    if (url === '/api/speech') return json({ available: true, reason: null, remainingRequests: 40, models: { transcription: 'scribe_v2_realtime', speech: 'eleven_v3' } });
    if (url === '/api/astral-reply' && init.method === 'GET') return json({ available: true, reason: null, model: 'claude-opus-5-5', remainingRequests: 20 });
    if (url === '/api/astral-reply') return json(reply);
    if (url === '/api/astral-decision') return json({ effect: 'scatter', intensity: 0.75, light: 'night' });
    if (url === '/api/speech/token') return json({ token: 'synthetic-token' });
    if (url === '/api/speech/speak') return new Response(new Uint8Array([0xff, 0xfb, 0, 0]), { headers: { 'content-type': 'audio/mpeg' } });
    assert.fail(`Unexpected fake route: ${url}`);
  });
  const globals = {
    navigator: { mediaDevices: { async getUserMedia() {
      const track = Object.assign(new EventTarget(), { stops: 0, readyState: 'live', stop() { this.stops++; this.readyState = 'ended'; } });
      tracks.push(track);
      return { getTracks: () => [track] };
    } } },
    AudioContext: class {
      sampleRate = 16000;
      destination = {};
      audioWorklet = { async addModule() {} };
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      async resume() {}
      async close() {}
    },
    AudioWorkletNode: class {
      port = { onmessage: null as null | ((event: { data: ArrayBuffer }) => void), close() {} };
      constructor() { nodes.push(this); }
      connect() {}
      disconnect() {}
    },
    WebSocket: class extends FakeSocket { constructor() { super(); sockets.push(this); } },
    Audio: class extends EventTarget {
      plays = 0;
      pauses = 0;
      constructor() { super(); outputs.push(this); }
      async play() { this.plays++; }
      pause() { this.pauses++; }
      removeAttribute() {}
      load() {}
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globalThis, name); });
  }
  const conversation = createAstralConversation({ onPhase: phase => phases.push(phase), onReply: value => replies.push(value),
    onDecision: enableDecision ? value => decisions.push(value) : undefined, onVoiceLevel: value => levels.push(value) });
  t.after(() => conversation.dispose());
  return { conversation, phases, replies, decisions, levels, calls, tracks, nodes, sockets, outputs, warnings };
}
async function listen(app: ReturnType<typeof setup>) {
  app.conversation.startListening();
  await flush();
  const socket = app.sockets.at(-1)!;
  assert.ok(socket);
  socket.message({ message_type: 'session_started' });
  await flush();
  app.nodes.at(-1)!.port.onmessage!({ data: new Uint8Array([0, 0, 1, 0]).buffer });
  return socket;
}
async function answer(app: ReturnType<typeof setup>, text = 'Where am I?') {
  const socket = await listen(app);
  app.conversation.finishListening();
  socket.message({ message_type: 'committed_transcript', text });
  await flush();
  return socket;
}

test('explicit utterance follows listening thinking speaking idle, with reply only at actual playback start', async t => {
  const app = setup(t);
  assert.equal(app.calls.length, 0);
  const socket = await listen(app);
  socket.message({ message_type: 'partial_transcript', text: 'Where' });
  assert.equal(app.calls.filter(call => call.url === '/api/astral-reply' && call.init.method === 'POST').length, 0);
  app.conversation.finishListening();
  assert.equal(app.tracks[0].stops, 1);
  assert.equal(app.phases.at(-1), 'thinking');
  assert.deepEqual(app.replies, []);
  socket.message({ message_type: 'committed_transcript', text: 'Where am I?' });
  await flush();
  assert.deepEqual(app.phases, ['idle', 'listening', 'thinking', 'speaking']);
  assert.deepEqual(app.replies, [reply]);
  assert.equal(app.levels.at(-1), 1);
  const post = app.calls.find(call => call.url === '/api/astral-reply' && call.init.method === 'POST')!;
  assert.deepEqual(JSON.parse(String(post.init.body)), { utterance: 'Where am I?', history: [] });
  assert.deepEqual(JSON.parse(String(app.calls.find(call => call.url === '/api/speech/speak')!.init.body)), { text: reply.reply });
  app.outputs[0].dispatchEvent(new Event('ended'));
  assert.equal(app.phases.at(-1), 'idle');
  assert.equal(app.levels.at(-1), 0);
  assert.equal(app.outputs[0].pauses, 1);
});

test('history retains only four started audible turns and repeated starts do not overlap', async t => {
  const app = setup(t);
  for (let index = 0; index < 6; index++) {
    const socket = await listen(app);
    app.conversation.startListening();
    assert.equal(app.sockets.length, index + 1);
    app.conversation.finishListening();
    socket.message({ message_type: 'committed_transcript', text: `Turn ${index}` });
    await flush();
    const post = app.calls.filter(call => call.url === '/api/astral-reply' && call.init.method === 'POST').at(-1)!;
    const body = JSON.parse(String(post.init.body));
    assert.equal(body.history.length, Math.min(index, 4));
    if (index === 5) assert.equal(body.history[0].utterance, 'Turn 1');
    app.outputs.at(-1)!.dispatchEvent(new Event('ended'));
  }
});

test('an interrupted announced room is remembered, and later replies may leave the room unchanged', async t => {
  let count = 0;
  const app = setup(t, (url, init) => url === '/api/astral-reply' && init.method === 'POST'
    ? json({ ...reply, room: ++count === 1 ? reply.room : null }) : undefined);
  await answer(app);
  app.conversation.stop();
  await answer(app, 'Stay here.');
  const post = app.calls.filter(call => call.url === '/api/astral-reply' && call.init.method === 'POST').at(-1)!;
  assert.deepEqual(JSON.parse(String(post.init.body)).history, [{ utterance: 'Where am I?', response: reply }]);
  assert.deepEqual(app.replies.at(-1), { ...reply, room: null });
});

test('unavailable or malformed local status causes no microphone or paid request', async t => {
  for (const route of ['/api/speech', '/api/astral-reply']) {
    const app = setup(t, url => url === route ? json({ available: false, reason: 'disabled', remainingRequests: 20, model: 'claude-opus-5-5' }, 503) : undefined);
    app.conversation.startListening();
    await flush();
    assert.equal(app.phases.at(-1), 'unavailable');
    assert.equal(app.tracks.length, 0);
    assert.equal(app.calls.every(call => call.init.method === 'GET'), true);
    assert.equal(app.warnings.length, 1);
    app.conversation.dispose();
  }
});

test('stop immediately releases microphone and discards late transcript, playback stops and disposal is inert', async t => {
  const app = setup(t);
  const socket = await listen(app);
  app.conversation.finishListening();
  app.conversation.stop();
  socket.message({ message_type: 'committed_transcript', text: 'late words' });
  assert.equal(app.tracks[0].stops, 1);
  assert.equal(socket.closes, 1);
  assert.equal(app.phases.at(-1), 'idle');
  assert.equal(app.calls.some(call => call.url === '/api/astral-reply' && call.init.method === 'POST'), false);
  await answer(app);
  app.conversation.stop();
  assert.equal(app.outputs[0].pauses, 1);
  assert.equal(app.levels.at(-1), 0);
  app.outputs[0].dispatchEvent(new Event('ended'));
  app.conversation.dispose();
  const count = app.calls.length;
  app.conversation.startListening();
  app.conversation.finishListening();
  app.conversation.stop();
  assert.equal(app.calls.length, count);
});

test('stop aborts pending reply and decision; late completion cannot synthesize or distort', async t => {
  const pending = deferred<Response>();
  const decision = deferred<Response>();
  const app = setup(t, (url, init) => {
    if (url === '/api/astral-reply' && init.method === 'POST') return pending.promise;
    if (url === '/api/astral-decision') return decision.promise;
  }, true);
  await answer(app);
  assert.equal(app.phases.at(-1), 'thinking');
  const post = app.calls.find(call => call.url === '/api/astral-reply' && call.init.method === 'POST')!;
  const instant = app.calls.find(call => call.url === '/api/astral-decision')!;
  app.conversation.stop();
  assert.equal(post.init.signal!.aborted, true);
  assert.equal(instant.init.signal!.aborted, true);
  pending.resolve(json(reply));
  decision.resolve(json({ effect: 'scatter', intensity: 1, light: 'dark' }));
  await flush();
  assert.equal(app.phases.at(-1), 'idle');
  assert.deepEqual(app.replies, []);
  assert.deepEqual(app.decisions, []);
  assert.equal(app.outputs.length, 0);
});

test('route rejection invalid reply and synthesis failure never retry or announce a reply', async t => {
  for (const kind of ['rejected', 'invalid', 'missing-light', 'unknown-light', 'speech']) {
    const app = setup(t, (url, init) => {
      if (kind === 'speech' && url === '/api/speech/speak') return json({ error: 'provider_rejected' }, 502);
      if (url === '/api/astral-reply' && init.method === 'POST') {
        if (kind === 'rejected') return json({ error: 'invalid_reply' }, 422);
        if (kind === 'invalid') return json({ ...reply, effect: 'execute' });
        if (kind === 'missing-light') return json({ ...reply, light: undefined });
        if (kind === 'unknown-light') return json({ ...reply, light: 'execute' });
      }
    });
    await answer(app);
    assert.equal(app.phases.at(-1), 'idle');
    assert.deepEqual(app.replies, []);
    assert.equal(app.outputs.length, 0);
    assert.equal(app.calls.filter(call => call.url === '/api/astral-reply' && call.init.method === 'POST').length, 1);
    assert.equal(app.warnings.length, 1);
    app.conversation.dispose();
  }
});

test('decision starts beside reply with identical bounded history and is delivered while thinking', async t => {
  const pending = deferred<Response>();
  let first = true;
  const app = setup(t, (url, init) => {
    if (url === '/api/astral-reply' && init.method === 'POST' && first) { first = false; return pending.promise; }
  }, true);
  const socket = await listen(app);
  assert.equal(app.calls.some(call => call.url === '/api/astral-decision'), false);
  app.conversation.finishListening();
  socket.message({ message_type: 'committed_transcript', text: 'Let me go.' });
  const instant = app.calls.find(call => call.url === '/api/astral-decision')!;
  const slow = app.calls.find(call => call.url === '/api/astral-reply' && call.init.method === 'POST')!;
  assert.ok(instant);
  assert.ok(slow);
  assert.equal(instant.init.method, 'POST');
  assert.equal(instant.init.body, slow.init.body);
  await flush();
  assert.deepEqual(app.decisions, [{ effect: 'scatter', intensity: 0.75, light: 'night' }]);
  assert.deepEqual(app.replies, []);
  assert.equal(app.phases.at(-1), 'thinking');
  pending.resolve(json(reply));
  await flush();
  assert.deepEqual(app.replies, [reply]);
  assert.equal(app.phases.at(-1), 'speaking');
  assert.equal(app.warnings.length, 0);
  app.outputs[0].dispatchEvent(new Event('ended'));
  await answer(app, 'Again.');
  const next = app.calls.filter(call => call.url === '/api/astral-decision').at(-1)!;
  const nextReply = app.calls.filter(call => call.url === '/api/astral-reply' && call.init.method === 'POST').at(-1)!;
  assert.equal(next.init.body, nextReply.init.body);
  assert.deepEqual(JSON.parse(String(next.init.body)).history, [{ utterance: 'Let me go.', response: reply }]);
});

test('late decision is dropped without replacing the playing reply', async t => {
  const pending = deferred<Response>();
  const app = setup(t, url => url === '/api/astral-decision' ? pending.promise : undefined, true);
  await answer(app);
  assert.equal(app.phases.at(-1), 'speaking');
  pending.resolve(json({ effect: 'scatter', intensity: 1, light: 'dark' }));
  await flush();
  assert.deepEqual(app.decisions, []);
  assert.deepEqual(app.replies, [reply]);
  assert.equal(app.phases.at(-1), 'speaking');
  assert.equal(app.warnings.length, 1);
});

test('decision remains eligible while synthesis is pending, before playback begins', async t => {
  const decision = deferred<Response>();
  const audio = deferred<Response>();
  const app = setup(t, url => {
    if (url === '/api/astral-decision') return decision.promise;
    if (url === '/api/speech/speak') return audio.promise;
  }, true);
  await answer(app);
  decision.resolve(json({ effect: 'melt', intensity: 0.5, light: 'lamp_off' }));
  await flush();
  assert.equal(app.phases.at(-1), 'thinking');
  assert.deepEqual(app.decisions, [{ effect: 'melt', intensity: 0.5, light: 'lamp_off' }]);
  assert.deepEqual(app.replies, []);
  audio.resolve(new Response(new Uint8Array([0xff, 0xfb, 0, 0]), { headers: { 'content-type': 'audio/mpeg' } }));
  await flush();
  assert.deepEqual(app.replies, [reply]);
});

test('disabled missing unavailable rejected malformed and failing decisions never disturb the reply sequence', async t => {
  for (const response of [
    ...[403, 404, 409, 429, 503, 504].map(status => () => json({ error: 'unavailable' }, status)),
    ...[null, {}, { effect: 'execute', intensity: 0.5, light: 'unchanged' }, { effect: 'calm', intensity: -1, light: 'unchanged' },
      { effect: 'calm', intensity: 1.1, light: 'unchanged' }, { effect: 'calm', intensity: '0.5', light: 'unchanged' },
      { effect: 'calm', intensity: null, light: 'unchanged' }, { effect: 'calm', intensity: 0.5, light: 'unchanged', extra: true },
      { effect: 'calm', intensity: 0.5 }, { effect: 'calm', intensity: 0.5, light: 'execute' },
      { effect: 'calm', intensity: 0.5, light: null }].map(value => () => json(value)),
    () => new Response('{', { headers: { 'content-type': 'application/json' } }),
    () => new Response('{"effect":"calm","intensity":1e400,"light":"unchanged"}', { headers: { 'content-type': 'application/json' } }),
    () => { throw new Error('network'); },
  ]) {
    const app = setup(t, url => url === '/api/astral-decision' ? response() : undefined, true);
    await answer(app);
    assert.deepEqual(app.decisions, []);
    assert.deepEqual(app.replies, [reply]);
    assert.equal(app.warnings.length, 1);
    assert.equal(app.calls.filter(call => call.url === '/api/astral-decision').length, 1);
    app.outputs[0].dispatchEvent(new Event('ended'));
    assert.deepEqual(app.phases, ['idle', 'listening', 'thinking', 'speaking', 'idle']);
    app.conversation.dispose();
  }
});

test('without a decision callback the original voice loop makes no decision requests', async t => {
  const app = setup(t);
  await answer(app);
  assert.deepEqual(app.replies, [reply]);
  assert.equal(app.calls.some(call => call.url === '/api/astral-decision'), false);
});

test('stop during status check or early release cannot acquire microphone later', async t => {
  const pending = deferred<Response>();
  const app = setup(t, url => url === '/api/speech' ? pending.promise : undefined);
  app.conversation.startListening();
  app.conversation.stop();
  assert.equal(app.calls[0].init.signal!.aborted, true);
  pending.resolve(json({ available: true, reason: null, remainingRequests: 40, models: { transcription: 'scribe_v2_realtime', speech: 'eleven_v3' } }));
  await flush();
  assert.equal(app.tracks.length, 0);
  assert.equal(app.phases.at(-1), 'idle');
});
