import type { Capture } from './contracts';
import { encodeWav, SpeechGate } from './speech-gate';

export class Microphone implements Capture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gate: SpeechGate | null = null;
  private muted = false;
  private epoch = 0;
  async start(onset: () => void, utterance: (wav: Uint8Array) => void, failure: () => void) {
    this.stop();
    const epoch = this.epoch;
    const context = new AudioContext({ sampleRate: 16000 });
    this.context = context;
    await context.resume();
    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    if (epoch !== this.epoch) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    this.muted = false;
    stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { if (epoch === this.epoch) failure(); }, { once: true }));
    await context.audioWorklet.addModule('/microphone-worklet.js');
    if (epoch !== this.epoch) return;
    if (context.sampleRate !== 16000) throw new Error('16 kHz capture is unavailable');
    this.gate = new SpeechGate(onset, samples => {
      const wav = encodeWav(samples, context.sampleRate);
      samples.fill(0);
      utterance(wav);
    }, context.sampleRate);
    const worklet = new AudioWorkletNode(context, 'microphone-frames');
    this.worklet = worklet;
    worklet.onprocessorerror = () => { if (epoch === this.epoch) failure(); };
    worklet.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
      if (!this.muted && epoch === this.epoch) this.gate?.push(data);
      data.fill(0);
    };
    this.source = context.createMediaStreamSource(stream);
    const silent = context.createGain();
    silent.gain.value = 0;
    this.source.connect(worklet); worklet.connect(silent); silent.connect(context.destination);
  }
  mute(value: boolean) {
    this.muted = value;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
    this.discard();
  }
  discard() { this.gate?.reset(); }
  stop() {
    ++this.epoch;
    this.discard(); this.gate = null;
    if (this.worklet) { this.worklet.port.onmessage = null; this.worklet.port.close(); this.worklet.disconnect(); }
    this.worklet = null;
    this.source?.disconnect(); this.source = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
