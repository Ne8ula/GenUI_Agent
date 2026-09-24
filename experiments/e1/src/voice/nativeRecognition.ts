import { invoke } from "@tauri-apps/api/core";
import type { RecognitionEvent, VoiceEnvironment, VoiceRecognition } from "./types";

export const NATIVE_CAPTURE_LIMITS = Object.freeze({
  maxDurationMs: 15_000, maxAudioBytes: 480_044, idleSegmentMs: 2_000,
  silenceMs: 750, minimumSpeechMs: 150, rmsThreshold: 0.012, sampleMs: 50,
});
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg"] as const;

export interface NativeRecognitionPorts {
  getUserMedia(): Promise<MediaStream>;
  createContext(): AudioContext;
  createRecorder(stream: MediaStream, mimeType: string): MediaRecorder;
  supportsMime(mimeType: string): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  now(): number;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(timer: unknown): void;
  makeId(): string;
}

function browserPorts(): NativeRecognitionPorts | null {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === "undefined" || typeof AudioContext === "undefined") return null;
  return {
    getUserMedia: () => navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
    }),
    createContext: () => new AudioContext(),
    createRecorder: (stream, mimeType) => new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 }),
    supportsMime: (mimeType) => MediaRecorder.isTypeSupported(mimeType),
    invoke, now: () => performance.now(), setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>), makeId: () => crypto.randomUUID(),
  };
}

function recognitionError(error: unknown): string {
  if (error instanceof Error && ["NotAllowedError", "PermissionDeniedError"].includes(error.name)) return "not-allowed";
  if (error instanceof Error && ["NotFoundError", "NotReadableError"].includes(error.name)) return "audio-capture";
  if (error === "recognition_not_configured") return "recognition-not-configured";
  if (error === "recognition_auth_failed") return "recognition-auth-failed";
  if (error === "recognition_rate_limited") return "recognition-rate-limited";
  return "network";
}

/** Real microphone input; one bounded utterance per instance, automatically restarted by VoiceSession. */
export class NativeRecognition implements VoiceRecognition {
  continuous = true;
  interimResults = false;
  lang = "en-US";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { readonly error: string }) => void) | null = null;
  onresult: ((event: RecognitionEvent) => void) | null = null;
  onprocessing: (() => void) | null = null;
  private running = false;
  private epoch = 0;
  private sessionId: string | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private timer: unknown = null;
  private chunks: Blob[] = [];
  private byteCount = 0;
  private segmentStart = 0;
  private speechStart: number | null = null;
  private lastLoud = 0;
  private loudMs = 0;
  private readonly samples = new Float32Array(1024);

  constructor(private readonly ports: NativeRecognitionPorts) {}

  start(): void {
    if (this.running) throw new Error("Recognition already started");
    this.running = true;
    const token = ++this.epoch;
    this.sessionId = this.ports.makeId();
    void this.acquire(token, this.sessionId);
  }

  abort(): void {
    const active = this.running;
    this.running = false;
    this.epoch++;
    this.release();
    const sessionId = this.sessionId;
    this.sessionId = null;
    if (sessionId) void this.ports.invoke("e1_cancel_recognition", { request: { sessionId } }).catch(() => {});
    if (active) this.onend?.();
  }

  private current(token: number): boolean { return this.running && this.epoch === token; }

  private async acquire(token: number, sessionId: string): Promise<void> {
    try {
      const mimeType = MIME_TYPES.find((type) => this.ports.supportsMime(type));
      if (!mimeType) { this.fail("audio-capture", token); return; }
      await this.ports.invoke("e1_begin_recognition", { request: { sessionId } });
      if (!this.current(token)) {
        void this.ports.invoke("e1_cancel_recognition", { request: { sessionId } }).catch(() => {});
        return;
      }
      const stream = await this.ports.getUserMedia();
      if (!this.current(token)) { stream.getTracks().forEach((track) => track.stop()); return; }
      this.stream = stream;
      const context = this.ports.createContext();
      this.context = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = this.samples.length;
      this.analyser = analyser;
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(analyser);
      // The analyser is intentionally not connected to speakers.
      await context.resume();
      if (!this.current(token)) return;
      this.startSegment(token, mimeType);
      if (this.current(token)) this.onstart?.();
    } catch (error) { this.fail(recognitionError(error), token); }
  }

  private startSegment(token: number, mimeType: string): void {
    if (!this.current(token) || !this.stream) return;
    this.chunks = [];
    this.byteCount = 0;
    this.segmentStart = this.ports.now();
    this.speechStart = null;
    this.loudMs = 0;
    let recorder: MediaRecorder;
    try { recorder = this.ports.createRecorder(this.stream, mimeType); }
    catch { this.fail("audio-capture", token); return; }
    this.recorder = recorder;
    recorder.ondataavailable = (event) => {
      if (!this.current(token) || this.recorder !== recorder || !event.data.size) return;
      this.byteCount += event.data.size;
      if (this.byteCount > NATIVE_CAPTURE_LIMITS.maxAudioBytes) { this.fail("audio-capture", token); return; }
      this.chunks.push(event.data);
    };
    recorder.onerror = () => this.fail("audio-capture", token);
    try { recorder.start(200); this.tick(token, mimeType); }
    catch { this.fail("audio-capture", token); }
  }

  private tick(token: number, mimeType: string): void {
    if (!this.current(token) || !this.analyser || !this.recorder) return;
    this.analyser.getFloatTimeDomainData(this.samples);
    const rms = Math.sqrt(this.samples.reduce((total, value) => total + value * value, 0) / this.samples.length);
    const now = this.ports.now();
    if (rms >= NATIVE_CAPTURE_LIMITS.rmsThreshold) {
      this.speechStart ??= now;
      this.lastLoud = now;
      this.loudMs += NATIVE_CAPTURE_LIMITS.sampleMs;
    }
    const elapsed = now - this.segmentStart;
    const spoken = this.speechStart !== null && this.loudMs >= NATIVE_CAPTURE_LIMITS.minimumSpeechMs;
    if ((spoken && now - this.lastLoud >= NATIVE_CAPTURE_LIMITS.silenceMs) || elapsed >= NATIVE_CAPTURE_LIMITS.maxDurationMs - 100) {
      // A throttled timer must discard, not relabel, an overlong capture.
      this.finishSegment(token, mimeType, spoken && elapsed <= NATIVE_CAPTURE_LIMITS.maxDurationMs, elapsed);
    } else if (!spoken && elapsed >= NATIVE_CAPTURE_LIMITS.idleSegmentMs) {
      this.finishSegment(token, mimeType, false, elapsed);
    } else {
      this.timer = this.ports.setTimer(() => {
        this.timer = null;
        try { this.tick(token, mimeType); } catch { this.fail("audio-capture", token); }
      }, NATIVE_CAPTURE_LIMITS.sampleMs);
    }
  }

  private finishSegment(token: number, mimeType: string, submit: boolean, durationMs: number): void {
    const recorder = this.recorder;
    if (!recorder || !this.current(token)) return;
    recorder.onstop = () => {
      if (!this.current(token) || this.recorder !== recorder) return;
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      this.recorder = null;
      const blob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];
      if (submit && blob.size >= 128) {
        this.releaseCapture();
        this.onprocessing?.();
        void this.transcribe(token, blob, mimeType, durationMs);
      } else {
        this.startSegment(token, mimeType);
      }
    };
    try { recorder.stop(); } catch { this.fail("audio-capture", token); }
  }

  private async transcribe(token: number, blob: Blob, mimeType: string, durationMs: number): Promise<void> {
    const sessionId = this.sessionId;
    if (!sessionId || !this.current(token)) return;
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (!this.current(token)) { bytes.fill(0); return; }
      if (bytes.length > NATIVE_CAPTURE_LIMITS.maxAudioBytes) { bytes.fill(0); throw new Error("Audio limit"); }
      let binary = "";
      for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      bytes.fill(0);
      const result = await this.ports.invoke<{ text: string; model: string }>("e1_transcribe_utterance", {
        request: { sessionId, mimeType, durationMs: Math.round(durationMs), audioBase64: btoa(binary) },
      });
      binary = "";
      if (!this.current(token)) return;
      if (result?.model !== "whisper-1" || typeof result.text !== "string" || result.text.length > 1000) throw new Error("Invalid transcript");
      const text = result.text.trim();
      if (text) this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text } } } });
      if (this.current(token)) this.abort();
    } catch (error) { this.fail(recognitionError(error), token); }
  }

  private fail(error: string, token: number): void {
    if (!this.current(token)) return;
    this.onerror?.({ error });
    if (this.current(token)) this.abort();
  }

  private releaseCapture(): void {
    if (this.timer !== null) this.ports.clearTimer(this.timer);
    this.timer = null;
    this.source?.disconnect();
    this.source = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => {});
    this.samples.fill(0);
  }

  private release(): void {
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
      if (recorder.state !== "inactive") { try { recorder.stop(); } catch { /* Already stopped. */ } }
    }
    this.chunks = [];
    this.byteCount = 0;
    this.releaseCapture();
  }
}

export function createNativeRecognitionEnvironment(ports: NativeRecognitionPorts | null = browserPorts()): VoiceEnvironment {
  return ports ? { createRecognition: () => new NativeRecognition(ports) } : {};
}
