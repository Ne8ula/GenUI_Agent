// Trusted, bundled worklet. Mono PCM only; never writes audio to disk.
class EvaCapture extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(1024); this.count = 0; this.total = 0; this.finished = false;
    this.port.onmessage = event => { if (event.data === "flush") { this.flush(); this.port.postMessage("flushed"); } };
  }
  flush() {
    if (!this.count) return;
    const part = this.buffer.slice(0, this.count); this.port.postMessage(part, [part.buffer]); this.count = 0;
  }
  process(inputs) {
    if (this.finished) return false;
    for (const sample of inputs[0]?.[0] ?? []) {
      this.buffer[this.count++] = sample; this.total++;
      if (this.count === 1024) this.flush();
      if (this.total >= sampleRate * 15) { this.flush(); this.finished = true; this.port.postMessage("limit"); return false; }
    }
    return true;
  }
}
registerProcessor("eva-capture", EvaCapture);
