// Only transient mono PCM leaves this worklet; no recording or network access.
class MicrophoneFrames extends AudioWorkletProcessor {
  constructor() { super(); this.frame = new Float32Array(320); this.offset = 0; }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const value of channel) {
      this.frame[this.offset++] = value;
      if (this.offset === this.frame.length) {
        this.port.postMessage(this.frame, [this.frame.buffer]);
        this.frame = new Float32Array(320); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('microphone-frames', MicrophoneFrames);
