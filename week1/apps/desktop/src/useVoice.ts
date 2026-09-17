import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { pcmWave, AUDIO_RATE, AUDIO_SECONDS } from "@eva/protocol/voice";
import { nativeRuntime } from "./runtime";

export type VoicePhase = "idle" | "requesting" | "listening" | "transcribing" | "error";
type Capture = { context: AudioContext; node: AudioWorkletNode; stream: MediaStream; chunks: Float32Array[]; total: number; flushed?: () => void };
const errors: Record<string, string> = {
  voice_not_configured: "Voice is not configured.",
  voice_auth_failed: "Voice authentication failed.",
  voice_rate_limited: "Voice is unavailable. Try again later.",
  voice_busy: "A transcription is already finishing. Try again in a moment.",
  voice_cancelled_or_timed_out: "Transcription timed out or was cancelled. Try again.",
  invalid_audio: "The recording was too short or invalid. Please try again.",
};
const errorText = (value: unknown) => errors[String(value)] ?? "Voice is unavailable. Please try again.";

export function useVoice(onTranscript: (text: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [message, setMessage] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const energy = useRef(0);
  const generation = useRef(0);
  const capture = useRef<Capture | null>(null);
  const pending = useRef<{ id: string; abort: AbortController } | null>(null);
  const callback = useRef(onTranscript); callback.current = onTranscript;
  const lastMeter = useRef(0);
  const starting = useRef(false);
  const finishing = useRef(false);

  useEffect(() => {
    let current = true;
    const status = nativeRuntime ? invoke<{ configured: boolean }>("voice_status") :
      fetch("/api/voice/status", { signal: AbortSignal.timeout(3000) }).then(r => r.ok ? r.json() : Promise.reject());
    status.then(value => { if (current) setConfigured(value.configured === true); }).catch(() => { if (current) setConfigured(false); });
    return () => { current = false; };
  }, []);

  function release() {
    const current = capture.current; capture.current = null;
    if (current) {
      current.stream.getTracks().forEach(track => track.stop()); current.node.disconnect();
      current.node.port.onmessage = null; current.node.port.close(); void current.context.close().catch(() => {});
      current.chunks.length = 0;
    }
    energy.current = 0;
  }
  function cancel(update = true) {
    generation.current++; starting.current = false; finishing.current = false; release();
    const current = pending.current; pending.current = null;
    if (current) {
      current.abort.abort();
      const request = { requestId: current.id };
      if (nativeRuntime) void invoke("cancel_voice", { request }).catch(() => {});
      else void fetch("/api/voice/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }).catch(() => {});
    }
    if (update) { setPhase("idle"); setMessage(""); setLevel(0); setSeconds(0); }
  }
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); cancel(false); };
  }, []);

  async function submit(flush = true) {
    const current = capture.current;
    if (!current || pending.current || finishing.current) return;
    finishing.current = true;
    const token = generation.current;
    try {
      // Stop the microphone before networking. Flush the worklet's last partial buffer.
      current.stream.getTracks().forEach(track => track.stop());
      if (flush) await new Promise<void>(resolve => {
        const timer = window.setTimeout(resolve, 150);
        current.flushed = () => { clearTimeout(timer); resolve(); }; current.node.port.postMessage("flush");
      });
      if (token !== generation.current) return;
      const samples = new Float32Array(current.total); let offset = 0;
      for (const chunk of current.chunks) { samples.set(chunk, offset); offset += chunk.length; }
      release(); setLevel(0);
      // A silent capture does not become a hallucinated weather request.
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / Math.max(1, samples.length));
      if (rms < 0.002) { setPhase("error"); setMessage("No speech detected. Try again closer to the microphone."); return; }
      const bytes = pcmWave(samples); samples.fill(0);
      let binary = ""; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const request = { requestId: crypto.randomUUID(), audioBase64: btoa(binary) };
      const job = { id: request.requestId, abort: new AbortController() }; pending.current = job;
      setPhase("transcribing"); setMessage("");
      const result: unknown = nativeRuntime ? await invoke("transcribe_weather", { request }) : await fetch("/api/voice/transcribe", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: job.abort.signal,
      }).then(async response => { const data = await response.json(); if (!response.ok) throw data.error; return data; });
      if (token !== generation.current) return;
      pending.current = null;
      if (!result || typeof result !== "object" || !("text" in result) || typeof result.text !== "string" || result.text.length > 1000 || !("model" in result) || result.model !== "whisper-1") throw "voice_unavailable";
      setPhase("idle"); callback.current(result.text);
    } catch (error) {
      if (token === generation.current) { pending.current = null; release(); setLevel(0); setPhase("error"); setMessage(errorText(error)); }
    } finally { if (token === generation.current) finishing.current = false; }
  }
  async function start() {
    if (starting.current || finishing.current || capture.current || pending.current) return;
    if (configured === false) { setPhase("error"); setMessage(errors.voice_not_configured); return; }
    starting.current = true;
    const token = ++generation.current; setPhase("requesting"); setMessage(""); setSeconds(0);
    let stream: MediaStream | null = null; let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (token !== generation.current) { stream.getTracks().forEach(track => track.stop()); return; }
      context = new AudioContext({ sampleRate: AUDIO_RATE });
      if (context.sampleRate !== AUDIO_RATE) throw new Error("Unsupported sample rate");
      await context.audioWorklet.addModule("/audio-capture.js"); await context.resume();
      if (token !== generation.current) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
      const node = new AudioWorkletNode(context, "eva-capture");
      const current: Capture = { context, node, stream, chunks: [], total: 0 }; capture.current = current;
      node.port.onmessage = event => {
        if (token !== generation.current || capture.current !== current) return;
        if (event.data === "flushed") { current.flushed?.(); return; }
        if (event.data === "limit") { void submit(false); return; }
        if (!(event.data instanceof Float32Array)) return;
        const chunk = event.data.subarray(0, Math.max(0, AUDIO_RATE * AUDIO_SECONDS - current.total));
        current.chunks.push(chunk); current.total += chunk.length;
        energy.current = Math.min(1, Math.sqrt(chunk.reduce((sum, v) => sum + v * v, 0) / Math.max(1, chunk.length)) * 8);
        if (performance.now() - lastMeter.current > 80) { lastMeter.current = performance.now(); setLevel(energy.current); setSeconds(current.total / AUDIO_RATE); }
      };
      node.onprocessorerror = () => { if (token === generation.current) { cancel(); setPhase("error"); setMessage("Microphone capture stopped. Please try again."); } };
      context.createMediaStreamSource(stream).connect(node); node.connect(context.destination); // worklet output stays silent
      setPhase("listening");
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop()); void context?.close().catch(() => {});
      if (token === generation.current) { release(); setPhase("error"); setMessage(error instanceof DOMException && error.name === "NotAllowedError" ? "Microphone access denied." : "Microphone unavailable."); }
    } finally { if (token === generation.current) starting.current = false; }
  }
  return { phase, message, configured, seconds, level, energy, start, submit, cancel };
}
