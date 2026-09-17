import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { nativeRuntime } from "./runtime";
import { speechEnding } from "./speechEnding";
type Phase = "acknowledge" | "building" | "present" | "wind-wait" | "wind-present";

export function useNarration(quiet: boolean) {
  const muted = useRef(quiet); muted.current = quiet;
  const generation = useRef(0), enabled = useRef(false), ready = useRef(false);
  const queue = useRef<Phase[]>([]), running = useRef(false);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const pending = useRef<{ requestId: string; abort: AbortController } | null>(null);
  const pause = useRef<{ timer: number; finish: () => void } | null>(null);
  const began = useRef(0), ended = useRef(0), presented = useRef(0);
  const windAcknowledged = useRef<(() => void) | null>(null);
  const [message, setMessage] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const configured = useRef(false);
  useEffect(() => {
    let current = true;
    const status = nativeRuntime ? invoke<{ configured: boolean }>("narration_status") : fetch("/api/narration/status", { signal: AbortSignal.timeout(3000) }).then(r => r.json());
    void status.then(v => { if (current) configured.current = v.configured === true; }).catch(() => {});
    return () => { current = false; };
  }, []);
  function cancel(update = true) {
    generation.current++; enabled.current = false; queue.current = []; running.current = false;
    windAcknowledged.current = null;
    if (pause.current) { clearTimeout(pause.current.timer); pause.current.finish(); pause.current = null; }
    source.current?.stop(); source.current = null;
    const job = pending.current; pending.current = null;
    if (job) {
      job.abort.abort(); const request = { requestId: job.requestId };
      if (nativeRuntime) void invoke("cancel_narration", { request }).catch(() => {});
      else void fetch("/api/narration/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }).catch(() => {});
    }
    if (update) { setSpeaking(false); setMessage(""); }
  }
  // Call directly inside a click/keyboard gesture, before microphone/network awaits.
  function unlock() {
    if (muted.current || !configured.current) return;
    try { context.current ??= new AudioContext(); void context.current.resume().catch(() => {}); } catch { /* Dashboard remains usable without output audio. */ }
  }
  async function drain() {
    if (running.current || !enabled.current || muted.current) return;
    const token = generation.current; running.current = true;
    try {
      while (queue.current.length && token === generation.current) {
        const phase = queue.current.shift()!;
        // A slow provider must not announce construction after the card is already usable.
        if (phase === "building" && ready.current) continue;
        const job = { requestId: crypto.randomUUID(), abort: new AbortController() }; pending.current = job;
        const request = { requestId: job.requestId, phase };
        const result = nativeRuntime ? await invoke<{ audioBase64: string; mime: string }>("speak_narration", { request }) : await fetch("/api/narration/speak", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.any([job.abort.signal, AbortSignal.timeout(21000)]),
        }).then(async r => { if (!r.ok) throw new Error("unavailable"); return r.json(); });
        if (token !== generation.current) return;
        pending.current = null;
        if (result.mime !== "audio/mpeg" || typeof result.audioBase64 !== "string" || !result.audioBase64.length || result.audioBase64.length > 533336) throw new Error("invalid audio");
        const audioContext = context.current;
        if (!audioContext || audioContext.state !== "running") throw new Error("audio blocked");
        const bytes = Uint8Array.from(atob(result.audioBase64), c => c.charCodeAt(0));
        const audio = await audioContext.decodeAudioData(bytes.buffer);
        if (token !== generation.current) return;
        if (audio.duration > 15) throw new Error("long audio");
        // Cached audio observes the same stage pacing as a fresh synthesis.
        const earliest = Math.max(ended.current ? ended.current + 1200 : 0,
          phase === "building" ? began.current + 5000 : phase === "present" || phase === "wind-present" ? presented.current + 700 : 0);
        const delay = earliest - performance.now();
        if (delay > 0) {
          await new Promise<void>(finish => { pause.current = { timer: window.setTimeout(finish, delay), finish }; });
          if (token !== generation.current) return;
          pause.current = null;
        }
        if (token !== generation.current) return;
        if (phase === "building" && ready.current) continue;
        const padded = audioContext.createBuffer(audio.numberOfChannels, audio.length + audio.sampleRate, audio.sampleRate);
        for (let channel = 0; channel < audio.numberOfChannels; channel++) padded.copyToChannel(speechEnding(audio.getChannelData(channel), audio.sampleRate), channel);
        const node = audioContext.createBufferSource(); node.buffer = padded; node.connect(audioContext.destination); source.current = node;
        setSpeaking(true);
        await new Promise<void>(resolve => { node.onended = () => { node.disconnect(); resolve(); }; node.start(); });
        if (token !== generation.current) return;
        source.current = null; ended.current = performance.now(); setSpeaking(false);
        if (phase === "wind-wait") { const next = windAcknowledged.current; windAcknowledged.current = null; next?.(); }
      }
    } catch {
      if (token === generation.current) { const next = windAcknowledged.current; cancel(); setMessage("Speech unavailable."); next?.(); }
    } finally { if (token === generation.current) running.current = false; }
  }
  function begin() {
    cancel(); ready.current = false; began.current = performance.now(); ended.current = 0;
    if (muted.current || !configured.current) return;
    unlock(); enabled.current = true; queue.current = ["acknowledge", "building"]; void drain();
  }
  function present() {
    if (ready.current) return; ready.current = true; presented.current = performance.now();
    if (enabled.current) { queue.current.push("present"); void drain(); }
  }
  function beginWind(acknowledged: () => void) {
    cancel(); ready.current = false; ended.current = 0;
    if (muted.current || !configured.current) { acknowledged(); return; }
    unlock(); enabled.current = true; windAcknowledged.current = acknowledged;
    queue.current = ["wind-wait"]; void drain();
  }
  function presentWind() {
    if (ready.current) return; ready.current = true; presented.current = performance.now();
    if (enabled.current) { queue.current.push("wind-present"); void drain(); }
  }
  useEffect(() => { if (quiet) cancel(); }, [quiet]);
  useEffect(() => {
    const hide = () => { if (document.hidden) cancel(); }; document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); cancel(false); void context.current?.close().catch(() => {}); };
  }, []);
  return { begin, present, beginWind, presentWind, cancel, unlock, message, speaking };
}
