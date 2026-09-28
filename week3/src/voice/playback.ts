import type { Playback, Reply } from './contracts';

export class LocalPlayback implements Playback {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private epoch = 0;
  private settle: (() => void) | null = null;
  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }
  async play(reply: Reply, started: () => void) {
    this.stop();
    const epoch = this.epoch;
    const context = this.context;
    if (!context || context.state === 'closed') throw new Error('Playback is not active');
    if (context.state === 'suspended') await context.resume();
    if (epoch !== this.epoch) return;
    if (reply.audioMime !== 'audio/mpeg' || reply.audioBase64.length > 8_000_000) throw new Error('Invalid audio envelope');
    const bytes = Uint8Array.from(atob(reply.audioBase64), c => c.charCodeAt(0));
    // decodeAudioData takes ownership of (and detaches) this transient buffer.
    const buffer = await context.decodeAudioData(bytes.buffer);
    if (epoch !== this.epoch) return;
    if (buffer.duration > 45) throw new Error('Reply exceeds audio limit');
    await new Promise<void>((resolve) => {
      const source = context.createBufferSource();
      this.source = source;
      this.settle = resolve;
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        source.disconnect();
        if (this.source === source) { this.source = null; this.settle = null; }
        resolve();
      };
      source.start();
      started();
    });
  }
  stop() {
    ++this.epoch;
    if (this.source) {
      this.source.onended = null;
      try { this.source.stop(); } catch { /* Already ended. */ }
      this.source.disconnect();
      this.source.buffer = null;
      this.source = null;
    }
    this.settle?.();
    this.settle = null;
  }
  close() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
