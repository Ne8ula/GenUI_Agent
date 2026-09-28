import { describe, expect, it, vi } from 'vitest';
import { Conversation } from '../src/voice/conversation';
import type { Capture, Playback, Reply, VoiceTransport } from '../src/voice/contracts';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function setup() {
  let onset!: () => void; let utterance!: (wav: Uint8Array) => void;
  const capture: Capture = { start: vi.fn(async (a, b) => { onset = a; utterance = b; }), mute: vi.fn(), discard: vi.fn(), stop: vi.fn() };
  const pending = deferred<Reply>();
  const playback: Playback = { unlock: vi.fn(async () => {}), play: vi.fn(async (_reply, started) => { started(); }), stop: vi.fn(), close: vi.fn() };
  const transport: VoiceTransport = { status: vi.fn(), start: vi.fn(async () => ({ sessionId: 'session1' })), advance: vi.fn(async () => {}), turn: vi.fn(() => pending.promise), delivered: vi.fn(async () => {}), end: vi.fn(async () => {}) };
  const flow = new Conversation(transport, capture, playback);
  const reply = (generation = 1): Reply => ({ sessionId: 'session1', generation, transcript: 'A synthetic day.', reply: 'Want to tell me more?', stance: 'comforting', intensity: .4, audioBase64: 'AA==', audioMime: 'audio/mpeg' });
  return { flow, capture, playback, transport, pending, reply, onset: () => onset(), utterance: () => utterance(new Uint8Array([1, 2])) };
}

describe('conversation cancellation', () => {
  it('denied microphone permission never starts a backend session', async () => {
    const s = setup(); s.capture.start = vi.fn(async () => { throw new Error('NotAllowedError'); });
    await s.flow.start(); expect(s.transport.start).not.toHaveBeenCalled();
    expect(s.capture.stop).toHaveBeenCalled(); expect(s.playback.close).toHaveBeenCalled();
    expect(s.flow.snapshot().state).toBe('unavailable'); expect(s.flow.snapshot().active).toBe(false);
  });
  it('Mute during playback lets the existing reply complete and commit', async () => {
    const s = setup(); const played = deferred<void>();
    s.playback.play = vi.fn(async (_reply, started) => { started(); await played.promise; });
    await s.flow.start(); s.onset(); s.utterance(); await tick(); s.pending.resolve(s.reply()); await tick();
    s.flow.mute(); played.resolve(); await tick();
    expect(s.transport.delivered).toHaveBeenCalledWith('session1', 1);
    expect(s.flow.snapshot().muted).toBe(true); s.flow.end();
  });
  it('starts mic only after explicit start and dispatches after local speech end', async () => {
    const s = setup(); expect(s.capture.start).not.toHaveBeenCalled();
    await s.flow.start(); s.onset(); expect(s.transport.turn).not.toHaveBeenCalled();
    s.utterance(); await tick(); expect(s.transport.turn).toHaveBeenCalledTimes(1);
    s.pending.resolve(s.reply()); await tick(); expect(s.flow.snapshot().reply).toBe('Want to tell me more?');
    expect(s.transport.delivered).toHaveBeenCalledWith('session1', 1); s.flow.end();
  });
  it('stops locally on onset before waiting for backend cancellation', async () => {
    const s = setup(); const cancel = deferred<void>(); s.transport.advance = vi.fn((_id, generation) => generation === 0 ? Promise.resolve() : cancel.promise);
    await s.flow.start(); s.onset(); expect(s.playback.stop).toHaveBeenCalledTimes(1);
    expect(s.flow.snapshot().state).toBe('listening'); s.flow.end(); cancel.resolve();
  });
  it('never plays an older generation after a new onset', async () => {
    const s = setup(); await s.flow.start(); s.onset(); s.utterance(); await tick();
    s.onset(); s.pending.resolve(s.reply(1)); await tick();
    expect(s.playback.play).not.toHaveBeenCalled(); expect(s.transport.delivered).not.toHaveBeenCalled(); s.flow.end();
  });
  it('End clears local conversation and rejects late provider results', async () => {
    const s = setup(); await s.flow.start(); s.onset(); s.utterance(); await tick(); s.flow.end();
    s.pending.resolve(s.reply()); await tick(); expect(s.flow.snapshot().active).toBe(false);
    expect(s.flow.snapshot().reply).toBe(''); expect(s.playback.play).not.toHaveBeenCalled(); expect(s.capture.stop).toHaveBeenCalled();
  });
  it('Mute discards unfinished capture without stopping existing playback', async () => {
    const s = setup(); await s.flow.start(); s.onset(); const calls = vi.mocked(s.playback.stop).mock.calls.length;
    s.flow.mute(); s.utterance(); await tick(); expect(s.capture.mute).toHaveBeenCalledWith(true);
    expect(s.playback.stop).toHaveBeenCalledTimes(calls); expect(s.transport.turn).not.toHaveBeenCalled(); s.flow.end();
  });
  it('Stop rejects queued audio but keeps microphone session active', async () => {
    const s = setup(); await s.flow.start(); s.onset(); s.utterance(); await tick(); s.flow.stop();
    s.pending.resolve(s.reply()); await tick(); expect(s.playback.play).not.toHaveBeenCalled();
    expect(s.flow.snapshot().active).toBe(true); expect(s.flow.snapshot().state).toBe('interrupted'); s.flow.end();
  });
  it('does not revive a session ended while microphone permission was pending', async () => {
    const s = setup(); const permission = deferred<void>(); s.capture.start = vi.fn(() => permission.promise);
    const start = s.flow.start(); await tick(); s.flow.end(); permission.resolve(); await start;
    expect(s.transport.start).not.toHaveBeenCalled(); expect(s.flow.snapshot().active).toBe(false);
  });
  it('does not trust mismatched response identity or duplicate utterance callbacks', async () => {
    const s = setup(); await s.flow.start(); s.onset(); s.utterance(); s.utterance(); await tick();
    expect(s.transport.turn).toHaveBeenCalledTimes(1); s.pending.resolve({ ...s.reply(), sessionId: 'wrong' }); await tick();
    expect(s.playback.play).not.toHaveBeenCalled(); s.flow.end();
  });
  it('clears mutable in-flight raw audio immediately on End, even if a provider hangs', async () => {
    const s = setup(); await s.flow.start(); s.onset(); s.utterance(); await tick();
    const wav = vi.mocked(s.transport.turn).mock.calls[0][2];
    expect([...wav]).toEqual([1, 2]); s.flow.end(); expect([...wav]).toEqual([0, 0]);
  });
  it('an old permission completion cannot stop a newly started microphone', async () => {
    const s = setup(); const old = deferred<void>();
    s.capture.start = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValue(undefined);
    const first = s.flow.start(); await tick(); s.flow.end();
    await s.flow.start(); const stops = vi.mocked(s.capture.stop).mock.calls.length;
    old.resolve(); await first;
    expect(s.capture.stop).toHaveBeenCalledTimes(stops); expect(s.flow.snapshot().active).toBe(true); s.flow.end();
  });
  it('expires sessions locally at ten minutes', async () => {
    vi.useFakeTimers(); const s = setup(); await s.flow.start(); vi.advanceTimersByTime(600_000);
    expect(s.flow.snapshot().active).toBe(false); expect(s.capture.stop).toHaveBeenCalled(); vi.useRealTimers();
  });
  it('does not mark interrupted playback as delivered', async () => {
    const s = setup(); const played = deferred<void>();
    s.playback.play = vi.fn(async (_reply, started) => { started(); await played.promise; });
    await s.flow.start(); s.onset(); s.utterance(); await tick(); s.pending.resolve(s.reply()); await tick();
    expect(s.flow.snapshot().state).toBe('speaking'); s.onset(); played.resolve(); await tick();
    expect(s.transport.delivered).not.toHaveBeenCalled(); s.flow.end();
  });
});
