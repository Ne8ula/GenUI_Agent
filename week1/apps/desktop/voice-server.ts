import type { Plugin } from "vite";
import { validWave, MAX_WAV_BYTES } from "../../packages/protocol/voice.ts";
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";

// Loopback development adapter only. The packaged app uses Rust IPC.
export function voiceServer(): Plugin {
  const file = new URL("../../.env.local", import.meta.url);
  const key = process.env.OPENAI_API_KEY || (existsSync(file) ? parseEnv(readFileSync(file, "utf8")).OPENAI_API_KEY : "");
  let job: { id: string; controller: AbortController } | null = null;
  let lastStarted = 0;
  return { name: "eva-voice-loopback", configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/api/voice/")) return next();
      const reply = (code: number, data: unknown) => { if (!res.destroyed) { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); } };
      const origin = "http://127.0.0.1:1420";
      if (req.headers.host !== "127.0.0.1:1420" || (req.headers.origin && req.headers.origin !== origin)) return reply(403, { error: "forbidden" });
      if (req.method === "GET" && req.url === "/api/voice/status") return reply(200, { configured: Boolean(key), model: "whisper-1" });
      if (req.method !== "POST" || req.headers.origin !== origin || req.headers["content-type"] !== "application/json") return reply(403, { error: "forbidden" });
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > Math.ceil(MAX_WAV_BYTES * 4 / 3) + 256) return reply(413, { error: "invalid_audio" });
          chunks.push(chunk);
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!payload || typeof payload.requestId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(payload.requestId)) return reply(400, { error: "invalid_request" });
        if (req.url === "/api/voice/cancel") {
          if (Object.keys(payload).length !== 1) return reply(400, { error: "invalid_request" });
          const activeJob = job;
          if (activeJob && activeJob.id === payload.requestId) activeJob.controller.abort();
          return reply(200, { cancelled: true });
        }
        if (req.url !== "/api/voice/transcribe" || Object.keys(payload).sort().join() !== "audioBase64,requestId" || typeof payload.audioBase64 !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.audioBase64)) return reply(400, { error: "invalid_request" });
        const audio = Buffer.from(payload.audioBase64, "base64");
        if (!validWave(audio) || audio.toString("base64") !== payload.audioBase64) return reply(400, { error: "invalid_audio" });
        if (!key) return reply(503, { error: "voice_not_configured" });
        if (job || Date.now() - lastStarted < 2000) return reply(429, { error: "voice_busy" });
        const current = { id: payload.requestId, controller: new AbortController() }; job = current; lastStarted = Date.now();
        const timer = setTimeout(() => current.controller.abort(), 25000);
        const disconnect = () => { if (!res.writableEnded) current.controller.abort(); };
        res.once("close", disconnect);
        try {
          const body = new FormData();
          body.append("model", "whisper-1"); body.append("language", "en"); body.append("response_format", "json");
          body.append("file", new Blob([audio], { type: "audio/wav" }), "request.wav");
          const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body, signal: current.controller.signal, redirect: "error" });
          if (!response.ok) return reply(502, { error: response.status === 401 ? "voice_auth_failed" : response.status === 429 ? "voice_rate_limited" : "voice_unavailable" });
          const reader = response.body?.getReader(); let result = "";
          if (!reader) throw new Error("empty");
          while (true) { const chunk = await reader.read(); if (chunk.done) break; result += new TextDecoder().decode(chunk.value); if (result.length > 8192) { await reader.cancel(); throw new Error("large"); } }
          const data = JSON.parse(result);
          if (typeof data.text !== "string" || data.text.length > 1000) throw new Error("invalid");
          reply(200, { text: data.text.trim(), model: "whisper-1" });
        } catch { reply(502, { error: current.controller.signal.aborted ? "voice_cancelled_or_timed_out" : "voice_unavailable" }); }
        finally { clearTimeout(timer); res.off("close", disconnect); if (job === current) job = null; }
      } catch { reply(400, { error: "invalid_request" }); }
    });
    server.httpServer?.once("close", () => job?.controller.abort());
  } };
}
