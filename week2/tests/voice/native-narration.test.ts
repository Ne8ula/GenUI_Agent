import { describe, expect, it, vi } from "vitest";
import { createNativeNarrationAdapter, NATIVE_NARRATION_NOTICE, VoiceSession, type ForecastNarration, type NarrationCallbacks, type NarrationOutput, type NativeNarrationEnvironment, type VoiceRecognition } from "../../src/voice";

const today: ForecastNarration = { fixtureId: "W-NYC-02", fixtureRevision: 1, day: "today" };
const tomorrow: ForecastNarration = { ...today, day: "tomorrow" };
const todayText = "In this synthetic scenario, today in New York City is sunny, 22 degrees Celsius.";
const tomorrowText = "In this synthetic scenario, tomorrow in New York City is rainy, 16 degrees Celsius.";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let index = 0; index < 6; index++) await Promise.resolve(); };

function setup(native = true) {
  const replies: ReturnType<typeof deferred<unknown>>[] = [];
  const playback: { signal: AbortSignal; onStarted: () => void; job: ReturnType<typeof deferred<void>> }[] = [];
  const output: NarrationOutput = {
    unlock: vi.fn(), stop: vi.fn(), dispose: vi.fn(),
    play: vi.fn((_bytes, signal, onStarted) => {
      const job = deferred<void>(); playback.push({ signal, onStarted, job }); return job.promise;
    }),
  };
  const invoke = vi.fn(async (command: string, _args?: Record<string, unknown>) => {
    if (command !== "e1_speak_forecast") return undefined;
    const job = deferred<unknown>(); replies.push(job); return job.promise;
  });
  let sequence = 0;
  const environment: NativeNarrationEnvironment = { native, invoke, output, requestId: () => `speech-${++sequence}` };
  const adapter = createNativeNarrationAdapter(environment);
  const callbacks: NarrationCallbacks = { onstart: vi.fn(), onend: vi.fn(), onerror: vi.fn() };
  const reply = (index = 0, forecast = today, text = todayText, override: Record<string, unknown> = {}) => replies[index].resolve({
    requestId: `speech-${index + 1}`, fixtureId: forecast.fixtureId, fixtureRevision: forecast.fixtureRevision,
    day: forecast.day, text, mime: "audio/mpeg", audioBase64: "AQID", ...override,
  });
  return { adapter, callbacks, output, invoke, replies, playback, reply };
}

describe("native ElevenLabs narration adapter (mock IPC/audio only)", () => {
  it("sends only day/fixture identity, never arbitrary text, credentials, voice or URL", async () => {
    const context = setup();
    context.adapter.unlock();
    context.adapter.speak(todayText, today, context.callbacks);
    expect(context.invoke).toHaveBeenCalledWith("e1_speak_forecast", { request: {
      requestId: "speech-1", fixtureId: "W-NYC-02", fixtureRevision: 1, day: "today",
    } });
    expect(context.callbacks.onstart).not.toHaveBeenCalled();
    context.reply(); await flush();
    expect(context.output.play).toHaveBeenCalledOnce();
    context.playback[0].onStarted();
    expect(context.callbacks.onstart).toHaveBeenCalledOnce();
    context.playback[0].job.resolve(); await flush();
    expect(context.callbacks.onend).toHaveBeenCalledOnce();
    context.adapter.dispose();
  });

  it.each([
    { requestId: "old" }, { fixtureId: "W-NYC-01" }, { fixtureRevision: 2 }, { day: "tomorrow" },
    { text: "Wrong fixture text" }, { mime: "text/html" }, { audioBase64: "" }, { audioBase64: "a".repeat(533340) },
  ])("rejects mismatched or unbounded audio before playback: %j", async (override) => {
    const context = setup();
    context.adapter.speak(todayText, today, context.callbacks);
    context.reply(0, today, todayText, override); await flush();
    expect(context.output.play).not.toHaveBeenCalled();
    expect(context.callbacks.onerror).toHaveBeenCalledOnce();
    context.adapter.dispose();
  });

  it("cancels a pending IPC response and cannot play a late result", async () => {
    const context = setup();
    context.adapter.speak(todayText, today, context.callbacks);
    context.adapter.cancel();
    expect(context.invoke).toHaveBeenCalledWith("e1_cancel_narration", { request: { requestId: "speech-1" } });
    context.reply(); await flush();
    expect(context.output.play).not.toHaveBeenCalled();
    expect(context.callbacks.onstart).not.toHaveBeenCalled();
    expect(context.callbacks.onend).not.toHaveBeenCalled();
    context.adapter.dispose();
  });

  it("supersedes decode/playback with the newest forecast and stops old audio", async () => {
    const context = setup();
    context.adapter.speak(todayText, today, context.callbacks);
    context.reply(); await flush();
    const nextCallbacks = { onstart: vi.fn(), onend: vi.fn(), onerror: vi.fn() };
    context.adapter.speak(tomorrowText, tomorrow, nextCallbacks);
    expect(context.playback[0].signal.aborted).toBe(true);
    context.playback[0].onStarted(); context.playback[0].job.resolve(); await flush();
    expect(context.callbacks.onstart).not.toHaveBeenCalled();
    expect(context.callbacks.onend).not.toHaveBeenCalled();
    context.reply(1, tomorrow, tomorrowText); await flush();
    context.playback[1].onStarted(); context.playback[1].job.resolve(); await flush();
    expect(nextCallbacks.onstart).toHaveBeenCalledOnce();
    expect(nextCallbacks.onend).toHaveBeenCalledOnce();
    context.adapter.dispose();
  });

  it("reports missing Week 1 configuration without exposing raw provider errors", async () => {
    const context = setup();
    context.adapter.speak(todayText, today, context.callbacks);
    context.replies[0].reject("narration_not_configured"); await flush();
    expect(context.callbacks.onerror).toHaveBeenCalledWith(expect.stringContaining("Week 1 ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID"));
    context.adapter.speak(todayText, today, context.callbacks);
    context.replies[1].reject("arbitrary private provider payload"); await flush();
    expect(context.callbacks.onerror).toHaveBeenLastCalledWith("ElevenLabs narration is unavailable. The readable answer remains available.");
    context.adapter.dispose();
  });

  it("browser fallback does not silently select a local or alternate voice", () => {
    const context = setup(false);
    expect(context.adapter.available).toBe(false);
    context.adapter.unlock(); context.adapter.speak(todayText, today, context.callbacks);
    expect(context.invoke).not.toHaveBeenCalled();
    expect(context.output.unlock).not.toHaveBeenCalled();
    expect(context.output.play).not.toHaveBeenCalled();
    expect(context.callbacks.onerror).toHaveBeenCalledWith(NATIVE_NARRATION_NOTICE);
    context.adapter.dispose();
  });

  it("VoiceSession pauses capture through synthesis and resumes only after actual playback", async () => {
    vi.useFakeTimers();
    const context = setup();
    const recognizers: VoiceRecognition[] = [];
    const session = new VoiceSession({ narration: context.adapter, onTranscript: vi.fn(), environment: {
      createRecognition: () => {
        const recognition: VoiceRecognition = { continuous: false, interimResults: false, lang: "", onstart: null, onend: null, onresult: null, onerror: null,
          start() { this.onstart?.(); }, abort: vi.fn() };
        recognizers.push(recognition); return recognition;
      },
    } });
    session.enable();
    expect(context.output.unlock).toHaveBeenCalledOnce();
    session.speak(todayText, today);
    expect(session.getState()).toMatchObject({ speaking: false, phase: "paused", enabled: true });
    vi.advanceTimersByTime(1_000);
    expect(recognizers).toHaveLength(1);
    context.reply(); await flush(); context.playback[0].onStarted();
    expect(session.getState().speaking).toBe(true);
    session.interrupt();
    expect(context.playback[0].signal.aborted).toBe(true);
    context.playback[0].job.resolve(); await flush();
    vi.advanceTimersByTime(350);
    expect(session.getState()).toMatchObject({ speaking: false, phase: "listening", enabled: true });
    expect(recognizers).toHaveLength(2);
    session.disable(); vi.advanceTimersByTime(60_000);
    expect(recognizers).toHaveLength(2);
    session.dispose(); vi.useRealTimers();
  });
});
