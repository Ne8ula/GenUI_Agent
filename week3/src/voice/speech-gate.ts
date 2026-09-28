/** Bounded local energy VAD. Acoustic accuracy must be tested on the real speaker/mic pair. */
const CONFIRMED_VOICE_MS = 160;

export class SpeechGate {
  private pre: Float32Array[] = [];
  private chunks: Float32Array[] = [];
  private hot = 0;
  private quiet = 0;
  private voiced = 0;
  private elapsed = 0;
  private noise = .002;
  private speaking = false;
  private waitingForQuiet = false;
  constructor(private onset: () => void, private complete: (samples: Float32Array) => void, readonly sampleRate = 16000) {}
  push(frame: Float32Array) {
    const ms = frame.length / this.sampleRate * 1000;
    const rms = Math.sqrt(frame.reduce((sum, value) => sum + value * value, 0) / frame.length);
    const hot = rms > Math.max(.012, this.noise * 3.5);
    if (!this.speaking && !hot) this.noise = Math.min(.015, this.noise * .98 + rms * .02);
    if (this.waitingForQuiet) {
      this.quiet = hot ? 0 : this.quiet + ms;
      if (this.quiet >= 700) { this.waitingForQuiet = false; this.quiet = 0; }
      return;
    }
    if (!this.speaking) {
      this.pre.push(frame.slice());
      while (this.pre.reduce((n, c) => n + c.length, 0) > this.sampleRate * .24) this.pre.shift()?.fill(0);
      this.hot = hot ? this.hot + ms : 0;
      if (this.hot < CONFIRMED_VOICE_MS) return;
      this.speaking = true;
      this.chunks = this.pre;
      this.pre = [];
      this.elapsed = this.chunks.reduce((n, c) => n + c.length, 0) / this.sampleRate * 1000;
      this.voiced = this.hot;
      this.quiet = 0;
      this.onset();
      return;
    }
    this.chunks.push(frame.slice());
    this.elapsed += ms;
    this.voiced += hot ? ms : 0;
    this.quiet = hot ? 0 : this.quiet + ms;
    if (this.quiet < 700 && this.elapsed < 30_000) return;
    const capped = this.elapsed >= 30_000;
    if (this.voiced >= CONFIRMED_VOICE_MS) {
      const length = Math.min(this.sampleRate * 30, this.chunks.reduce((n, c) => n + c.length, 0));
      const result = new Float32Array(length);
      let offset = 0;
      for (const chunk of this.chunks) {
        const part = chunk.subarray(0, Math.max(0, length - offset));
        result.set(part, offset); offset += part.length;
      }
      this.complete(result);
    }
    this.reset();
    this.waitingForQuiet = capped;
  }
  reset() {
    for (const chunk of [...this.pre, ...this.chunks]) chunk.fill(0);
    this.pre = []; this.chunks = [];
    this.hot = this.quiet = this.voiced = this.elapsed = 0;
    this.speaking = this.waitingForQuiet = false;
  }
}

export function encodeWav(samples: Float32Array, sampleRate = 16000): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true));
  return bytes;
}
