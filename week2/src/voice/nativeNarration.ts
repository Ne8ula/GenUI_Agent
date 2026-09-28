import { invoke, isTauri } from "@tauri-apps/api/core";
import type { ForecastNarration, NarrationAdapter, NarrationCallbacks } from "./types";

const MAX_AUDIO_BYTES = 400_000;
const MAX_AUDIO_BASE64 = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;
export const NATIVE_NARRATION_NOTICE = "Native ElevenLabs narration is required for the Week 1 voice. Browser preview keeps the readable answer without substituting a voice.";

export interface NativeNarrationStatus {
  readonly configured: boolean;
  readonly provider: "ElevenLabs";
  readonly model: "eleven_v3";
  readonly voiceSource: "Week 1 ELEVENLABS_VOICE_ID";
}

/** Injected ports keep cancellation and binding tests independent of providers and real audio. */
export interface NarrationOutput {
  unlock(): void;
  play(bytes: Uint8Array, signal: AbortSignal, onStarted: () => void): Promise<void>;
  stop(): void;
  dispose(): void;
}
export interface NativeNarrationEnvironment {
  readonly native: boolean;
  readonly invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  readonly output: NarrationOutput;
  readonly requestId: () => string;
}

function nativeAvailable(): boolean { return typeof window !== "undefined" && isTauri(); }

export async function getNativeNarrationStatus(): Promise<NativeNarrationStatus | null> {
  if (!nativeAvailable()) return null;
  const value = await invoke<NativeNarrationStatus>("e1_narration_status");
  if (typeof value.configured !== "boolean" || value.provider !== "ElevenLabs" || value.model !== "eleven_v3" || value.voiceSource !== "Week 1 ELEVENLABS_VOICE_ID") throw new Error("Invalid native narration status");
  return value;
}

function createAudioOutput(): NarrationOutput {
  let context: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let rejectPlayback: (() => void) | null = null;
  const stop = () => {
    const active = source; source = null;
    if (active) {
      active.onended = null;
      try { active.stop(); } catch { /* Already stopped. */ }
      active.disconnect();
    }
    const reject = rejectPlayback; rejectPlayback = null; reject?.();
  };
  return {
    unlock() {
      context ??= new AudioContext();
      void context.resume().catch(() => {});
    },
    async play(bytes, signal, onStarted) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const audioContext = context;
      if (!audioContext || audioContext.state !== "running") throw new Error("narration_audio_blocked");
      const audio = await audioContext.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > 15 || audio.numberOfChannels > 2) throw new Error("narration_audio_limit");
      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) { reject(new DOMException("Cancelled", "AbortError")); return; }
        const node = audioContext.createBufferSource();
        node.buffer = audio; node.connect(audioContext.destination); source = node;
        const cleanup = () => {
          signal.removeEventListener("abort", abort);
          node.onended = null; node.disconnect();
          if (source === node) { source = null; rejectPlayback = null; }
        };
        const abort = () => {
          cleanup();
          try { node.stop(); } catch { /* Already stopped. */ }
          reject(new DOMException("Cancelled", "AbortError"));
        };
        rejectPlayback = abort;
        signal.addEventListener("abort", abort, { once: true });
        node.onended = () => { cleanup(); resolve(); };
        try { node.start(); onStarted(); }
        catch (error) { cleanup(); reject(error); }
      });
    },
    stop,
    dispose() {
      stop();
      const previous = context; context = null;
      void previous?.close().catch(() => {});
    },
  };
}

function narrationError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  switch (code) {
    case "narration_not_configured": return "ElevenLabs is not configured. Reuse the Week 1 ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID; the readable answer remains available.";
    case "narration_auth_failed": return "ElevenLabs authentication failed. Check the existing Week 1 voice configuration; the readable answer remains available.";
    case "narration_rate_limited": return "ElevenLabs is rate limited. The readable answer remains available.";
    case "narration_busy": return "ElevenLabs narration was superseded or is busy. The newest readable answer remains available.";
    case "narration_audio_blocked": return "Audio playback was blocked. Enable audio with a local control; the readable answer remains available.";
    case "narration_audio_limit": return "Narration exceeded the audio limit and was not played. The readable answer remains available.";
    case "narration_binding_failed": return "Narration did not match the current synthetic forecast and was not played.";
    default: return "ElevenLabs narration is unavailable. The readable answer remains available.";
  }
}

function decodeReply(value: unknown, id: string, forecast: ForecastNarration, text: string): Uint8Array {
  if (!value || typeof value !== "object") throw new Error("narration_binding_failed");
  const reply = value as Record<string, unknown>;
  if (reply.requestId !== id || reply.fixtureId !== forecast.fixtureId || reply.fixtureRevision !== forecast.fixtureRevision || reply.day !== forecast.day || reply.text !== text || reply.mime !== "audio/mpeg"
    || typeof reply.audioBase64 !== "string" || !reply.audioBase64.length || reply.audioBase64.length > MAX_AUDIO_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(reply.audioBase64) || reply.audioBase64.length % 4 !== 0) {
    throw new Error("narration_binding_failed");
  }
  const binary = atob(reply.audioBase64);
  if (!binary.length || binary.length > MAX_AUDIO_BYTES) throw new Error("narration_audio_limit");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createNativeNarrationAdapter(injected?: NativeNarrationEnvironment): NarrationAdapter {
  const environment: NativeNarrationEnvironment = injected ?? {
    native: nativeAvailable(), invoke: (command, args) => invoke(command, args),
    output: createAudioOutput(), requestId: () => crypto.randomUUID(),
  };
  let pending: { id: string; abort: AbortController } | null = null;
  let disposed = false;
  const cancel = () => {
    const job = pending; pending = null;
    job?.abort.abort();
    environment.output.stop();
    if (job && environment.native) {
      void environment.invoke("e1_cancel_narration", { request: { requestId: job.id } }).catch(() => {});
    }
  };
  return {
    available: environment.native,
    unavailableMessage: NATIVE_NARRATION_NOTICE,
    unlock() { if (!disposed && environment.native) environment.output.unlock(); },
    speak(text: string, forecast: ForecastNarration, callbacks: NarrationCallbacks) {
      cancel();
      if (disposed) return;
      if (!environment.native) { callbacks.onerror(NATIVE_NARRATION_NOTICE); return; }
      if (forecast.fixtureId !== "W-NYC-02" || forecast.fixtureRevision !== 1 || !["today", "tomorrow"].includes(forecast.day) || !text.trim() || text.length > 500) {
        callbacks.onerror(narrationError("narration_binding_failed")); return;
      }
      const job = { id: environment.requestId(), abort: new AbortController() };
      pending = job;
      const current = () => pending === job && !job.abort.signal.aborted && !disposed;
      const run = async () => {
        try {
          const value = await environment.invoke("e1_speak_forecast", { request: {
            requestId: job.id, fixtureId: forecast.fixtureId, fixtureRevision: forecast.fixtureRevision, day: forecast.day,
          } });
          if (!current()) return;
          const bytes = decodeReply(value, job.id, forecast, text);
          await environment.output.play(bytes, job.abort.signal, () => { if (current()) callbacks.onstart(); });
          if (!current()) return;
          pending = null; callbacks.onend();
        } catch (error) {
          if (!current()) return;
          pending = null; environment.output.stop(); callbacks.onerror(narrationError(error));
        }
      };
      void run();
    },
    cancel,
    dispose() { if (disposed) return; cancel(); disposed = true; environment.output.dispose(); },
  };
}
