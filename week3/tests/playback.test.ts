import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalPlayback } from '../src/voice/playback';
import type { Reply } from '../src/voice/contracts';
const reply: Reply = { sessionId: 's', generation: 1, transcript: 'synthetic', reply: 'Hello.', stance: 'attentive', intensity: .3, audioMime: 'audio/mpeg', audioBase64: 'AA==' };
afterEach(() => vi.unstubAllGlobals());
function audio() {
  let ctx: any;
  const source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  class Context {
    state = 'running'; destination = {};
    constructor() { ctx = this; }
    resume = vi.fn(async () => { this.state = 'running'; });
    close = vi.fn(async () => { this.state = 'closed'; });
    decodeAudioData = vi.fn(async () => ({ duration: 2 }));
    createBufferSource = vi.fn(() => source);
  }
  vi.stubGlobal('AudioContext', Context);
  return { source, context: () => ctx };
}
describe('local audio ownership', () => {
  it('stops and disconnects synchronously and settles playback', async () => {
    const mock = audio(); const player = new LocalPlayback(); await player.unlock(); const started = vi.fn();
    const playing = player.play(reply, started); await Promise.resolve();
    expect(started).toHaveBeenCalledTimes(1); player.stop();
    expect(mock.source.stop).toHaveBeenCalledTimes(1); expect(mock.source.buffer).toBe(null); await playing; player.close();
  });
  it('does not revive cancelled audio when decoding finishes late', async () => {
    const mock = audio(); const player = new LocalPlayback(); await player.unlock();
    let finish!: (value: { duration: number }) => void;
    mock.context().decodeAudioData.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const started = vi.fn(); const playing = player.play(reply, started); player.stop(); finish({ duration: 1 }); await playing;
    expect(started).not.toHaveBeenCalled(); expect(mock.source.start).not.toHaveBeenCalled(); player.close();
  });
  it('resumes a suspended playback context', async () => {
    const mock = audio(); const player = new LocalPlayback(); await player.unlock(); mock.context().state = 'suspended';
    const playing = player.play(reply, vi.fn()); await Promise.resolve(); await Promise.resolve();
    expect(mock.context().resume).toHaveBeenCalledTimes(2); player.stop(); await playing; player.close();
  });
});
