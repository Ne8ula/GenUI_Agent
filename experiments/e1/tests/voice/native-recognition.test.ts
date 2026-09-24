import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeRecognition, NATIVE_CAPTURE_LIMITS, createNativeRecognitionEnvironment, type NativeRecognitionPorts } from "../../src/voice/nativeRecognition";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  let amplitude = 0;
  let serial = 0;
  const stopped = vi.fn();
  const closed = vi.fn(async () => {});
  const stream = { getTracks: () => [{ stop: stopped }] } as unknown as MediaStream;
  const recorders: Array<{
    state: string; ondataavailable: ((event: { data: Blob }) => void) | null;
    onstop: (() => void) | null; onerror: (() => void) | null; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>;
  }> = [];
  const invoke = vi.fn(async (command: string, _args?: Record<string, unknown>): Promise<unknown> => {
    if (command === "e1_transcribe_utterance") return { text: "What about tomorrow?", model: "whisper-1" };
    return undefined;
  });
  const ports: NativeRecognitionPorts = {
    getUserMedia: vi.fn(async () => stream),
    createContext: () => ({
      createAnalyser: () => ({ fftSize: 0, getFloatTimeDomainData: (data: Float32Array) => data.fill(amplitude), disconnect: vi.fn() }),
      createMediaStreamSource: () => ({ connect: vi.fn(), disconnect: vi.fn() }),
      resume: async () => {}, close: closed,
    }) as unknown as AudioContext,
    createRecorder: () => {
      const recorder = {
        state: "inactive", ondataavailable: null as ((event: { data: Blob }) => void) | null,
        onstop: null as (() => void) | null, onerror: null as (() => void) | null,
        start: vi.fn(), stop: vi.fn(),
      };
      recorder.start.mockImplementation(() => { recorder.state = "recording"; });
      recorder.stop.mockImplementation(() => {
        recorder.state = "inactive";
        recorder.ondataavailable?.({ data: new Blob([new Uint8Array(128)], { type: "audio/webm" }) });
        recorder.onstop?.();
      });
      recorders.push(recorder);
      return recorder as unknown as MediaRecorder;
    },
    supportsMime: (mime) => mime === "audio/webm;codecs=opus",
    invoke: invoke as NativeRecognitionPorts["invoke"], now: () => Date.now(),
    setTimer: (callback, ms) => setTimeout(callback, ms), clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    makeId: () => `test-${++serial}`,
  };
  const recognition = new NativeRecognition(ports);
  recognition.onstart = vi.fn();
  recognition.onend = vi.fn();
  recognition.onerror = vi.fn();
  recognition.onprocessing = vi.fn();
  recognition.onresult = vi.fn();
  return { ports, recognition, invoke, stopped, closed, stream, recorders, volume: (value: number) => { amplitude = value; } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

async function speech(h: ReturnType<typeof harness>) {
  h.volume(0.1);
  await vi.advanceTimersByTimeAsync(300);
  h.volume(0);
  await vi.advanceTimersByTimeAsync(800);
}

describe("native microphone recognition", () => {
  it("does not acquire or upload until explicit start; silence is never transcription", async () => {
    const h = harness();
    expect(h.ports.getUserMedia).not.toHaveBeenCalled();
    expect(h.invoke).not.toHaveBeenCalled();
    h.recognition.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.recognition.onstart).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(6500);
    expect(h.recorders.length).toBe(4);
    expect(h.invoke.mock.calls.some(([command]) => command === "e1_transcribe_utterance")).toBe(false);
    h.recognition.abort();
    expect(h.stopped).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("detects real-input RMS boundaries, releases capture, and emits the provider transcript", async () => {
    const h = harness();
    h.recognition.start();
    await vi.advanceTimersByTimeAsync(0);
    await speech(h);
    const call = h.invoke.mock.calls.find(([command]) => command === "e1_transcribe_utterance");
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ request: { sessionId: "test-1", mimeType: "audio/webm;codecs=opus" } });
    expect(h.stopped).toHaveBeenCalledOnce();
    expect(h.closed).toHaveBeenCalledOnce();
    expect(h.recognition.onprocessing).toHaveBeenCalledOnce();
    expect(h.recognition.onresult).toHaveBeenCalledWith(expect.objectContaining({ results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: "What about tomorrow?" } } } }));
  });

  it("releases a late permission stream after abort without recording", async () => {
    const h = harness();
    const permission = deferred<MediaStream>();
    h.ports.getUserMedia = () => permission.promise;
    h.recognition.start();
    await vi.advanceTimersByTimeAsync(0);
    h.recognition.abort();
    permission.resolve(h.stream);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.stopped).toHaveBeenCalledOnce();
    expect(h.recorders).toHaveLength(0);
    expect(h.recognition.onstart).not.toHaveBeenCalled();
  });

  it("cancels pending native work and rejects its late transcript", async () => {
    const h = harness();
    const pending = deferred<unknown>();
    h.invoke.mockImplementation(async (command) => command === "e1_transcribe_utterance" ? pending.promise : undefined);
    h.recognition.start();
    await vi.advanceTimersByTimeAsync(0);
    await speech(h);
    h.recognition.abort();
    expect(h.invoke).toHaveBeenCalledWith("e1_cancel_recognition", { request: { sessionId: "test-1" } });
    pending.resolve({ text: "What's the weather today in NYC?", model: "whisper-1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.recognition.onresult).not.toHaveBeenCalled();
  });

  it("stops at the utterance duration limit and rejects oversized chunks", async () => {
    const h = harness();
    h.volume(0.1);
    h.recognition.start();
    await vi.advanceTimersByTimeAsync(15_000);
    const call = h.invoke.mock.calls.find(([command]) => command === "e1_transcribe_utterance");
    expect(call).toBeDefined();
    const request = call?.[1]?.request as { durationMs: number };
    expect(request.durationMs).toBeLessThanOrEqual(15_000);
    const other = harness();
    other.recognition.start();
    await vi.advanceTimersByTimeAsync(0);
    other.recorders[0].ondataavailable?.({ data: new Blob([new Uint8Array(NATIVE_CAPTURE_LIMITS.maxAudioBytes + 1)]) });
    expect(other.recognition.onerror).toHaveBeenCalledWith({ error: "audio-capture" });
    expect(other.stopped).toHaveBeenCalledOnce();
    expect(other.invoke.mock.calls.some(([command]) => command === "e1_transcribe_utterance")).toBe(false);
  });

  it("discards a timer-throttled overlong capture instead of claiming a shorter duration", async () => {
    const h = harness();
    h.volume(0.1);
    h.recognition.start();
    await vi.advanceTimersByTimeAsync(300);
    vi.setSystemTime(20_000);
    await vi.advanceTimersByTimeAsync(50);
    expect(h.invoke.mock.calls.some(([command]) => command === "e1_transcribe_utterance")).toBe(false);
    expect(h.recorders.length).toBe(2);
    h.recognition.abort();
  });

  it("reports denied, missing configuration and unavailable capture honestly", async () => {
    const denied = harness();
    denied.ports.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
    denied.recognition.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(denied.recognition.onerror).toHaveBeenCalledWith({ error: "not-allowed" });
    const missing = harness();
    missing.invoke.mockRejectedValue("recognition_not_configured");
    missing.recognition.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(missing.recognition.onerror).toHaveBeenCalledWith({ error: "recognition-not-configured" });
    expect(missing.ports.getUserMedia).not.toHaveBeenCalled();
    expect(createNativeRecognitionEnvironment(null)).toEqual({});
  });
});
