import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceSession, parseVoiceIntent, type VoiceEnvironment, type VoiceRecognition, type VoiceUtterance, type RecognitionEvent, type OutputVoice } from "../../src/voice";

class FakeRecognition implements VoiceRecognition {
  continuous = false;
  interimResults = true;
  lang = "";
  onstart: VoiceRecognition["onstart"] = null;
  onend: VoiceRecognition["onend"] = null;
  onerror: VoiceRecognition["onerror"] = null;
  onresult: VoiceRecognition["onresult"] = null;
  start = vi.fn(() => this.onstart?.());
  abort = vi.fn();
  result(text: string, isFinal = true) { this.onresult?.(resultEvent(text, isFinal)); }
}

function resultEvent(text: string, isFinal = true): RecognitionEvent {
  return { resultIndex: 0, results: [{ isFinal, length: 1, 0: { transcript: text } }] };
}

function setup(options: { recognition?: boolean; speech?: boolean; voices?: OutputVoice[]; onTranscript?: (text: string) => void } = {}) {
  const recognizers: FakeRecognition[] = [];
  const utterances: (VoiceUtterance & { text: string })[] = [];
  const cancel = vi.fn();
  const onTranscript = vi.fn(options.onTranscript);
  const onState = vi.fn();
  const voices = options.voices ?? [{ lang: "en-US", localService: true, default: true }];
  const environment: VoiceEnvironment = {
    createRecognition: options.recognition === false ? undefined : () => {
      const recognition = new FakeRecognition(); recognizers.push(recognition); return recognition;
    },
    createUtterance: options.speech === false ? undefined : (text) => {
      const utterance = { text, lang: "", rate: 0, volume: 0, voice: null, onstart: null, onend: null, onerror: null };
      utterances.push(utterance); return utterance;
    },
    synthesis: options.speech === false ? undefined : {
      cancel, getVoices: () => voices, speak: (utterance) => utterance.onstart?.(),
    },
    now: () => Date.now(),
  };
  const session = new VoiceSession({ environment, onTranscript, onState });
  return { session, recognizers, utterances, cancel, onTranscript, onState };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("hands-free voice lifecycle (mock browser ports)", () => {
  it("does not open a microphone before explicit enable and keeps listening without more clicks", () => {
    const { session, recognizers, onTranscript } = setup();
    expect(recognizers).toHaveLength(0);
    expect(session.getState().phase).toBe("off");
    session.enable();
    session.enable();
    expect(recognizers).toHaveLength(1);
    expect(session.getState()).toMatchObject({ enabled: true, phase: "listening" });
    expect(recognizers[0]).toMatchObject({ continuous: true, interimResults: false, lang: "en-US" });
    recognizers[0].result("What's the weather today in NYC?");
    expect(onTranscript).toHaveBeenCalledWith("What's the weather today in NYC?");
    vi.advanceTimersByTime(180);
    expect(recognizers).toHaveLength(2);
    recognizers[1].result("What about tomorrow?");
    expect(onTranscript).toHaveBeenCalledTimes(2);
    session.dispose();
  });

  it("ignores interim, empty, oversized and late recognition results", () => {
    const { session, recognizers, onTranscript } = setup();
    session.enable();
    const staleResult = recognizers[0].onresult!;
    recognizers[0].result("weather", false);
    recognizers[0].result("   ");
    recognizers[0].result("x".repeat(501));
    expect(onTranscript).not.toHaveBeenCalled();
    session.interrupt();
    staleResult(resultEvent("What's the weather today in NYC?"));
    expect(onTranscript).not.toHaveBeenCalled();
    vi.advanceTimersByTime(180);
    expect(recognizers).toHaveLength(2);
    session.dispose();
  });

  it("stops capture before actual speech, rejects echo and resumes after playback plus its tail", () => {
    const { session, recognizers, utterances, onTranscript } = setup();
    session.enable();
    const oldResult = recognizers[0].onresult!;
    expect(session.speak("Synthetic NYC today is sunny, 22 degrees Celsius.")).toBe(true);
    expect(recognizers[0].abort).toHaveBeenCalledOnce();
    expect(session.getState()).toMatchObject({ speaking: true, phase: "paused", enabled: true });
    oldResult(resultEvent("Synthetic NYC today is sunny"));
    expect(onTranscript).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(recognizers).toHaveLength(1);
    utterances[0].onend!();
    vi.advanceTimersByTime(349);
    expect(recognizers).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(recognizers).toHaveLength(2);
    expect(session.getState()).toMatchObject({ speaking: false, phase: "listening" });
    session.dispose();
  });

  it("dismissal immediately cancels speech but preserves microphone enablement", () => {
    const { session, recognizers, utterances, cancel } = setup();
    session.enable();
    session.speak("Synthetic rainy tomorrow.");
    const lateStart = utterances[0].onstart!;
    const lateEnd = utterances[0].onend!;
    session.interrupt();
    expect(cancel).toHaveBeenCalledOnce();
    expect(session.getState()).toMatchObject({ speaking: false, enabled: true });
    lateStart(); lateEnd();
    expect(session.getState().speaking).toBe(false);
    vi.advanceTimersByTime(350);
    expect(recognizers).toHaveLength(2);
    session.disable();
    vi.advanceTimersByTime(60_000);
    expect(recognizers).toHaveLength(2);
    expect(session.getState()).toMatchObject({ enabled: false, phase: "off" });
    session.dispose();
  });

  it("rapid new speech cancels old audio and old end callbacks cannot resume recognition", () => {
    const { session, recognizers, utterances, cancel } = setup();
    session.enable();
    session.speak("Today is sunny.");
    const lateEnd = utterances[0].onend!;
    session.speak("Tomorrow is rainy.");
    expect(cancel).toHaveBeenCalledOnce();
    lateEnd();
    vi.advanceTimersByTime(500);
    expect(recognizers).toHaveLength(1);
    expect(session.getState().speaking).toBe(true);
    utterances[1].onend!();
    vi.advanceTimersByTime(350);
    expect(recognizers).toHaveLength(2);
    session.dispose();
  });

  it("a transcript can synchronously speak without accidentally restarting during output", () => {
    const context = setup({ onTranscript: () => context.session.speak("Today is sunny.") });
    context.session.enable();
    context.recognizers[0].result("What's the weather today in NYC?");
    vi.advanceTimersByTime(1_000);
    expect(context.recognizers).toHaveLength(1);
    expect(context.session.getState().phase).toBe("paused");
    context.utterances[0].onend!();
    vi.advanceTimersByTime(350);
    expect(context.recognizers).toHaveLength(2);
    context.session.dispose();
  });

  it("off from a transcript invalidates the recognition restart", () => {
    const context = setup({ onTranscript: () => context.session.disable() });
    context.session.enable();
    context.recognizers[0].result("Microphone off.");
    vi.advanceTimersByTime(60_000);
    expect(context.recognizers).toHaveLength(1);
    expect(context.session.getState().enabled).toBe(false);
    context.session.dispose();
  });

  it("permission denial is terminal until a new explicit enable", () => {
    const { session, recognizers } = setup();
    session.enable();
    recognizers[0].onerror!({ error: "not-allowed" });
    expect(session.getState()).toMatchObject({ enabled: false, phase: "denied" });
    vi.advanceTimersByTime(60_000);
    expect(recognizers).toHaveLength(1);
    session.enable();
    expect(recognizers).toHaveLength(2);
    session.dispose();
  });

  it.each(["audio-capture", "language-not-supported", "network"])("reports %s without a retry loop", (error) => {
    const { session, recognizers } = setup();
    session.enable();
    recognizers[0].onerror!({ error });
    expect(session.getState().enabled).toBe(false);
    expect(session.getState().phase).toBe(error === "network" ? "error" : "unavailable");
    vi.advanceTimersByTime(60_000);
    expect(recognizers).toHaveLength(1);
    session.dispose();
  });

  it("unsupported recognition and audio remain honest, usable fallbacks", () => {
    const { session, recognizers, utterances } = setup({ recognition: false, speech: false });
    session.enable();
    expect(session.getState()).toMatchObject({ enabled: false, phase: "unavailable", recognitionAvailable: false });
    expect(session.speak("Sunny today.")).toBe(false);
    expect(session.getState().phase).toBe("unavailable");
    session.interrupt();
    expect(session.getState().phase).toBe("unavailable");
    expect(recognizers).toHaveLength(0);
    expect(utterances).toHaveLength(0);
    session.dispose();
  });

  it("uses only local English speech voices rather than a hidden cloud provider", () => {
    const { session, recognizers, utterances } = setup({ voices: [{ lang: "en-US", localService: false, default: true }] });
    session.enable();
    expect(session.speak("Sunny today.")).toBe(false);
    expect(utterances).toHaveLength(0);
    expect(session.getState().message).toContain("No local English voice");
    vi.advanceTimersByTime(350);
    expect(recognizers).toHaveLength(2);
    session.dispose();
  });

  it("muting cancels audio, not microphone consent; unmuting never repeats old speech", () => {
    const { session, recognizers, utterances, cancel } = setup();
    session.enable();
    session.speak("Sunny today.");
    session.setAudioEnabled(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(session.getState()).toMatchObject({ audioEnabled: false, speaking: false, enabled: true });
    expect(session.speak("Rainy tomorrow.")).toBe(false);
    vi.advanceTimersByTime(350);
    expect(recognizers).toHaveLength(2);
    session.setAudioEnabled(true);
    expect(utterances).toHaveLength(1);
    session.dispose();
  });

  it("can enable listening while speech is already playing without losing its completion", () => {
    const { session, recognizers, utterances } = setup();
    session.speak("Sunny today.");
    session.enable();
    expect(session.getState()).toMatchObject({ enabled: true, phase: "paused" });
    utterances[0].onend!();
    vi.advanceTimersByTime(350);
    expect(recognizers).toHaveLength(1);
    expect(session.getState().phase).toBe("listening");
    session.dispose();
  });

  it("limits rapidly terminating recognizers and eventually times out stalled speech", () => {
    const { session, recognizers } = setup();
    session.enable();
    for (let index = 0; index < 4; index++) {
      recognizers[index].onend!();
      vi.advanceTimersByTime(180);
    }
    expect(recognizers).toHaveLength(4);
    expect(session.getState()).toMatchObject({ enabled: false, phase: "error" });
    session.enable();
    session.speak("Sunny today.");
    vi.advanceTimersByTime(30_000);
    expect(session.getState().speaking).toBe(false);
    vi.advanceTimersByTime(350);
    expect(session.getState().phase).toBe("listening");
    session.dispose();
  });

  it("dispose cancels all work and stale callbacks cannot publish state or transcripts", () => {
    const { session, recognizers, onTranscript, onState } = setup();
    session.enable();
    const result = recognizers[0].onresult!;
    const end = recognizers[0].onend!;
    session.dispose();
    const stateCalls = onState.mock.calls.length;
    result(resultEvent("Weather today in NYC")); end();
    session.enable(); session.speak("No."); session.interrupt();
    vi.advanceTimersByTime(60_000);
    expect(recognizers).toHaveLength(1);
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onState).toHaveBeenCalledTimes(stateCalls);
  });
});

describe("bounded weather voice grammar", () => {
  it.each(["What's the weather today in NYC?", "What is the weather in New York City today?", "Please show me the NYC weather today."])("recognizes %s", (text) => {
    expect(parseVoiceIntent(text)).toEqual({ type: "weather", day: "today", location: "NYC" });
  });
  it.each(["What about tomorrow?", "How about tomorrow", "tomorrow"])("leaves location context to the controller for %s", (text) => {
    expect(parseVoiceIntent(text)).toEqual({ type: "weather", day: "tomorrow", location: null });
  });
  it("does not relabel NYC data as another city", () => {
    expect(parseVoiceIntent("What's the weather tomorrow in Paris?")).toEqual({ type: "unsupported-location", location: "paris" });
  });
  it.each([
    ["Dismiss the weather.", "dismiss"], ["Stop.", "stop"], ["Stop speaking", "stop"],
    ["Turn the microphone off", "microphone-off"], ["Microphone off", "microphone-off"],
    ["Stop listening", "microphone-off"], ["Just the numbers", "plain"], ["Less motion", "reduced-motion"],
  ])("maps %s to %s", (text, type) => expect(parseVoiceIntent(text)).toEqual({ type }));
  it.each(["Don't dismiss the weather", "What's the weather next Friday in NYC", "NYC weather today and tomorrow", "Turn on the camera", "read my files", "weather " + "x".repeat(501)])("rejects out-of-scope %s", (text) => {
    expect(parseVoiceIntent(text)).toEqual({ type: "unknown" });
  });
});
