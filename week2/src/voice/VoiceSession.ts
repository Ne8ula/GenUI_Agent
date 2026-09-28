import { createBrowserVoiceEnvironment } from "./browser";
import type { ForecastNarration, VoiceEnvironment, VoiceRecognition, VoiceSessionOptions, VoiceState, VoiceUtterance } from "./types";

const RESTART_MS = 180;
const SPEECH_TAIL_MS = 350;
const SPEECH_LIMIT_MS = 30_000;
const TEXT_LIMIT = 500;

/** One explicitly enabled, half-duplex session. Dismissal interrupts; only Off revokes listening. */
export class VoiceSession {
  private readonly environment: VoiceEnvironment;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private state: VoiceState;
  private recognition: VoiceRecognition | null = null;
  private utterance: VoiceUtterance | null = null;
  private narrationPending = false;
  private get speechBusy() { return Boolean(this.utterance || this.narrationPending); }
  private restartTimer: unknown = null;
  private speechTimer: unknown = null;
  private epoch = 0;
  private rapidEnds = 0;
  private disposed = false;

  constructor(private readonly options: VoiceSessionOptions) {
    this.environment = options.environment ?? createBrowserVoiceEnvironment();
    this.now = this.environment.now ?? (() => performance.now());
    this.setTimer = this.environment.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = this.environment.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
    this.state = Object.freeze({
      phase: "off", enabled: false, speaking: false,
      audioEnabled: options.audioEnabled ?? true,
      recognitionAvailable: Boolean(this.environment.createRecognition),
      speechAvailable: options.narration?.available ?? Boolean(this.environment.synthesis && this.environment.createUtterance),
      message: "Microphone off.",
    });
  }

  getState(): VoiceState { return this.state; }

  /** Prime native audio only from a user gesture; it performs no provider request. */
  unlockAudio(): void {
    if (this.disposed || !this.state.audioEnabled) return;
    try { this.options.narration?.unlock(); } catch { /* A later speak reports a usable no-audio fallback. */ }
  }

  /** Call from an explicit Enable microphone gesture, never on mount or after denial. */
  enable(): void {
    if (this.disposed || this.state.enabled) return;
    this.unlockAudio();
    if (!this.environment.createRecognition) {
      this.update({ phase: "unavailable", enabled: false, message: "Speech recognition is unavailable here. Use the text controls or a supported browser." });
      return;
    }
    if (!this.speechBusy) this.epoch++;
    this.rapidEnds = 0;
    this.update({ enabled: true, phase: this.speechBusy ? "paused" : "starting", message: this.speechBusy ? "Microphone paused while EVA speaks. Stop is available." : "Starting microphone…" });
    if (!this.speechBusy) this.startRecognition();
  }

  disable(): void {
    if (this.disposed) return;
    this.cancelWork();
    this.update({ enabled: false, phase: "off", speaking: false, message: "Microphone off." });
  }

  /** Invalidates recognition, queued narration and old callbacks, but retains microphone consent. */
  interrupt(): void {
    if (this.disposed) return;
    const wasSpeaking = this.speechBusy;
    this.cancelWork();
    this.update({ speaking: false, phase: this.state.enabled ? "starting" : this.state.phase, message: this.state.enabled ? "Resuming listening…" : this.state.phase === "off" ? "Microphone off." : this.state.message });
    this.scheduleRecognition(wasSpeaking ? SPEECH_TAIL_MS : RESTART_MS);
  }

  cancelSpeech(): void { this.interrupt(); }

  setAudioEnabled(enabled: boolean): void {
    if (this.disposed || this.state.audioEnabled === enabled) return;
    this.update({ audioEnabled: enabled });
    if (!enabled && this.speechBusy) this.interrupt();
  }

  /** The caller supplies already validated fixture text; this module never invents an answer. */
  speak(text: string, forecast?: ForecastNarration): boolean {
    if (this.disposed || !this.state.audioEnabled) return false;
    const sentence = text.trim();
    if (!sentence || sentence.length > TEXT_LIMIT) return false;
    if (this.options.narration) return this.speakNarration(sentence, forecast);
    this.cancelWork();
    const unavailable = (message: string) => {
      this.update({ speaking: false, speechAvailable: false, phase: this.state.enabled ? "starting" : this.state.phase, message });
      this.scheduleRecognition(SPEECH_TAIL_MS);
      return false;
    };
    const { synthesis, createUtterance } = this.environment;
    if (!synthesis || !createUtterance) {
      return unavailable("Native ElevenLabs narration is required for the Week 1 voice. The readable answer is unchanged.");
    }
    // Do not silently introduce a cloud TTS provider or credentials through the browser fallback.
    let voices;
    try { voices = synthesis.getVoices().filter((voice) => voice.localService && /^en(?:-|$)/i.test(voice.lang)); }
    catch { return unavailable("Spoken audio is unavailable. The readable answer is unchanged."); }
    const voice = voices.find((candidate) => candidate.default) ?? voices[0];
    if (!voice) return unavailable("No local English voice is available. The readable answer is unchanged.");
    const token = this.epoch;
    let utterance: VoiceUtterance;
    try {
      utterance = createUtterance(sentence);
    } catch {
      return unavailable("Spoken audio is unavailable. The readable answer is unchanged.");
    }
    this.utterance = utterance;
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = 1;
    utterance.volume = 1;
    const current = () => !this.disposed && this.epoch === token && this.utterance === utterance;
    const finish = (message?: string) => {
      if (!current()) return;
      this.detachUtterance();
      this.update({ speaking: false, phase: this.state.enabled ? "starting" : this.state.phase, message: message ?? (this.state.enabled ? "Resuming listening…" : "Microphone off.") });
      this.scheduleRecognition(SPEECH_TAIL_MS);
    };
    utterance.onstart = () => { if (current()) this.update({ speaking: true }); };
    utterance.onend = () => finish();
    utterance.onerror = () => finish("Spoken audio stopped. The readable answer is unchanged.");
    this.update({ speaking: false, speechAvailable: true, phase: this.state.enabled ? "paused" : this.state.phase, message: this.state.enabled ? "Microphone paused while EVA speaks. Stop is available." : "Speaking with the microphone off." });
    this.speechTimer = this.setTimer(() => {
      if (!current()) return;
      finish("Spoken audio timed out. The readable answer is unchanged.");
      try { synthesis.cancel(); } catch { /* Local controls remain available. */ }
    }, SPEECH_LIMIT_MS);
    try {
      synthesis.speak(utterance);
      return true;
    } catch {
      finish("Spoken audio is unavailable. The readable answer is unchanged.");
      return false;
    }
  }

  private speakNarration(text: string, forecast?: ForecastNarration): boolean {
    const adapter = this.options.narration!;
    this.cancelWork();
    if (!adapter.available || !forecast || forecast.fixtureId !== "W-NYC-02" || forecast.fixtureRevision !== 1 || !["today", "tomorrow"].includes(forecast.day)) {
      this.update({ speaking: false, speechAvailable: false, phase: this.state.enabled ? "starting" : this.state.phase,
        message: !adapter.available ? adapter.unavailableMessage : "Speech requires the validated E1 forecast. The readable answer is unchanged." });
      this.scheduleRecognition(SPEECH_TAIL_MS);
      return false;
    }
    this.unlockAudio();
    this.narrationPending = true;
    const token = this.epoch;
    const current = () => !this.disposed && this.epoch === token && this.narrationPending;
    const finish = (message?: string) => {
      if (!current()) return;
      this.narrationPending = false;
      if (this.speechTimer !== null) this.clearTimer(this.speechTimer);
      this.speechTimer = null;
      this.update({ speaking: false, phase: this.state.enabled ? "starting" : this.state.phase,
        speechAvailable: !message, message: message ?? (this.state.enabled ? "Resuming listening…" : "Microphone off.") });
      this.scheduleRecognition(SPEECH_TAIL_MS);
    };
    this.update({ speaking: false, speechAvailable: true, phase: this.state.enabled ? "paused" : this.state.phase,
      message: "Preparing the Week 1 ElevenLabs voice. Microphone paused; Stop remains available." });
    this.speechTimer = this.setTimer(() => {
      if (!current()) return;
      adapter.cancel();
      finish("ElevenLabs narration timed out. The readable answer is unchanged.");
    }, 40_000);
    try {
      adapter.speak(text, forecast, {
        onstart: () => { if (current()) this.update({ speaking: true, message: "EVA is speaking. Microphone paused; Stop remains available." }); },
        onend: () => finish(),
        onerror: (message) => finish(message),
      });
      return true;
    } catch {
      adapter.cancel();
      finish("ElevenLabs narration is unavailable. The readable answer is unchanged.");
      return false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancelWork();
    this.options.narration?.dispose();
    this.disposed = true;
    this.state = Object.freeze({ ...this.state, enabled: false, speaking: false, phase: "off", message: "Microphone off." });
  }

  private update(patch: Partial<VoiceState>): void {
    if (this.disposed) return;
    this.state = Object.freeze({ ...this.state, ...patch });
    this.options.onState?.(this.state);
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) this.clearTimer(this.restartTimer);
    this.restartTimer = null;
  }

  private detachRecognition(): void {
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
    recognition.onprocessing = null;
    try { recognition.abort(); } catch { /* A browser may already have ended capture. */ }
  }

  private detachUtterance(): void {
    if (this.speechTimer !== null) this.clearTimer(this.speechTimer);
    this.speechTimer = null;
    if (this.utterance) this.utterance.onstart = this.utterance.onend = this.utterance.onerror = null;
    this.utterance = null;
  }

  private cancelWork(): void {
    this.epoch++;
    this.clearRestart();
    this.detachRecognition();
    const hadSpeech = Boolean(this.utterance);
    this.detachUtterance();
    const hadNarration = this.narrationPending;
    this.narrationPending = false;
    if (hadNarration) this.options.narration?.cancel();
    if (hadSpeech) {
      try { this.environment.synthesis?.cancel(); } catch { /* Epoch guards also reject late playback events. */ }
    }
  }

  private scheduleRecognition(delay: number): void {
    this.clearRestart();
    if (!this.state.enabled || this.disposed || this.speechBusy) return;
    const token = this.epoch;
    this.restartTimer = this.setTimer(() => {
      this.restartTimer = null;
      if (this.epoch === token) this.startRecognition();
    }, delay);
  }

  private failRecognition(phase: "denied" | "unavailable" | "error", message: string): void {
    this.cancelWork();
    this.update({ enabled: false, speaking: false, phase, message });
  }

  private startRecognition(): void {
    if (this.disposed || !this.state.enabled || this.speechBusy || this.recognition) return;
    const create = this.environment.createRecognition;
    if (!create) return;
    const token = this.epoch;
    const began = this.now();
    try {
      const recognition = create();
      this.recognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      const current = () => !this.disposed && this.epoch === token && this.recognition === recognition && this.state.enabled && !this.speechBusy;
      recognition.onstart = () => { if (current()) this.update({ phase: "listening", message: "Listening. Say a weather request, or turn the microphone off." }); };
      recognition.onprocessing = () => { if (current()) this.update({ phase: "transcribing", message: "Transcribing the utterance… Microphone paused." }); };
      recognition.onresult = (event) => {
        if (!current()) return;
        const parts: string[] = [];
        for (let index = event.resultIndex; index < event.results.length && index < event.resultIndex + 16; index++) {
          const result = event.results[index];
          if (result?.isFinal && result.length > 0 && typeof result[0]?.transcript === "string") parts.push(result[0].transcript);
        }
        const text = parts.join(" ").trim();
        if (!text || text.length > TEXT_LIMIT) return;
        this.rapidEnds = 0;
        // Rotate the recognition instance before application code can dismiss, revise or speak.
        this.detachRecognition();
        this.update({ phase: "starting", message: "Heard request. Listening will resume automatically." });
        this.options.onTranscript(text);
        if (this.epoch === token) this.scheduleRecognition(RESTART_MS);
      };
      recognition.onerror = ({ error }) => {
        if (!current()) return;
        if (error === "no-speech" || error === "aborted") return;
        if (error === "not-allowed" || error === "service-not-allowed") {
          this.failRecognition("denied", "Microphone permission denied. Use text controls; enable again only after changing browser permissions.");
        } else if (error === "recognition-not-configured") {
          this.failRecognition("unavailable", "Native transcription is not configured. Reuse the Week 1 OPENAI_API_KEY or use text controls.");
        } else if (error === "recognition-auth-failed") {
          this.failRecognition("error", "Native transcription authentication failed. Use text controls and check the Week 1 voice configuration.");
        } else if (error === "recognition-rate-limited") {
          this.failRecognition("error", "Native transcription is rate limited. Use text controls or enable later to retry.");
        } else if (error === "audio-capture" || error === "language-not-supported") {
          this.failRecognition("unavailable", "Microphone or speech recognition is unavailable. Use the text controls.");
        } else {
          this.failRecognition("error", "Speech recognition stopped. Check the browser's speech service or use text controls. Enable to retry.");
        }
      };
      recognition.onend = () => {
        if (!current()) return;
        this.detachRecognition();
        this.rapidEnds = this.now() - began < 1_000 ? this.rapidEnds + 1 : 0;
        if (this.rapidEnds >= 4) {
          this.failRecognition("error", "The browser repeatedly stopped recognition. Use text controls or enable to retry.");
          return;
        }
        this.update({ phase: "starting", message: "Resuming listening…" });
        this.scheduleRecognition(RESTART_MS);
      };
      this.update({ phase: "starting" });
      recognition.start();
    } catch (error) {
      const denied = error instanceof Error && error.name === "NotAllowedError";
      this.failRecognition(denied ? "denied" : "error", denied ? "Microphone permission denied. Use the text controls." : "Could not start speech recognition. Use text controls or enable to retry.");
    }
  }
}
