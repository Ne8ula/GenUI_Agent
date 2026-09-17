import type { Plugin } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { narrationPayload, type PromptPolicy } from "../../packages/protocol/narration.ts";

const lines: Record<string, string> = JSON.parse(readFileSync(new URL("../../fixtures/narration/weather-lines.json", import.meta.url), "utf8"));
const profile = JSON.parse(readFileSync(new URL("../../fixtures/narration/voice-profile.json", import.meta.url), "utf8"));
const policy: PromptPolicy = JSON.parse(readFileSync(new URL("../../fixtures/narration/prompt-policy.json", import.meta.url), "utf8"));
const weather = JSON.parse(readFileSync(new URL("../../fixtures/connectors/weather-ithaca-week.json", import.meta.url), "utf8"));
const speechPayload = (phase: string) => narrationPayload(phase, lines, profile, policy, weather);
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9-]{1,64}$/.test(id);
const MAX_AUDIO = 400_000;
// Fixed demo sentences only; secrets and provider routing never enter the renderer.
export function narrationServer(): Plugin {
  const file = new URL("../../.env.local", import.meta.url);
  const local = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const key = process.env.ELEVENLABS_API_KEY ?? local.ELEVENLABS_API_KEY ?? "";
  const voice = process.env.ELEVENLABS_VOICE_ID ?? local.ELEVENLABS_VOICE_ID ?? "";
  const configured = Boolean(key) && /^[a-zA-Z0-9_-]{1,80}$/.test(voice);
  const cache = new Map<string, string>();
  let job: { id: string; controller: AbortController } | null = null;
  let lastStarted = 0;
  return { name: "eva-narration-loopback", configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/api/narration/")) return next();
      const reply = (code: number, value: unknown) => { if (!res.destroyed) { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(value)); } };
      const origin = "http://127.0.0.1:1420";
      if (req.headers.host !== "127.0.0.1:1420" || (req.headers.origin && req.headers.origin !== origin)) return reply(403, { error: "forbidden" });
      if (req.method === "GET" && req.url === "/api/narration/status") return reply(200, { configured });
      if (req.method !== "POST" || req.headers.origin !== origin || req.headers["content-type"] !== "application/json") return reply(403, { error: "forbidden" });
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 256) return reply(413, { error: "invalid_request" }); chunks.push(chunk); }
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!payload || !validId(payload.requestId)) return reply(400, { error: "invalid_request" });
        if (req.url === "/api/narration/cancel") {
          if (Object.keys(payload).join() !== "requestId") return reply(400, { error: "invalid_request" });
          const current = job; if (current && current.id === payload.requestId) current.controller.abort();
          return reply(200, { cancelled: true });
        }
        if (req.url !== "/api/narration/speak" || Object.keys(payload).sort().join() !== "phase,requestId" || typeof payload.phase !== "string" || !Object.hasOwn(lines, payload.phase)) return reply(400, { error: "invalid_request" });
        if (!configured) return reply(503, { error: "narration_not_configured" });
        const phase: string = payload.phase;
        const speech = speechPayload(phase);
        if (cache.has(phase)) return reply(200, { audioBase64: cache.get(phase), mime: "audio/mpeg" });
        if (job || Date.now() - lastStarted < 250) return reply(429, { error: "narration_busy" });
        const current = { id: payload.requestId, controller: new AbortController() }; job = current; lastStarted = Date.now();
        const timer = setTimeout(() => current.controller.abort(), 20000);
        const disconnect = () => { if (!res.writableEnded) current.controller.abort(); }; res.once("close", disconnect);
        try {
          const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
            method: "POST", headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
            body: JSON.stringify(speech),
            redirect: "error", signal: current.controller.signal,
          });
          if (!response.ok) return reply(502, { error: response.status === 401 || response.status === 403 ? "narration_auth_failed" : "narration_unavailable" });
          if (!response.headers.get("content-type")?.startsWith("audio/mpeg")) throw new Error("type");
          const reader = response.body?.getReader(); if (!reader) throw new Error("empty");
          const audio: Uint8Array[] = []; let length = 0;
          while (true) { const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.length; if (length > MAX_AUDIO) { await reader.cancel(); throw new Error("large"); } audio.push(chunk.value); }
          if (!length || current.controller.signal.aborted) throw new Error("cancelled");
          const audioBase64 = Buffer.concat(audio).toString("base64"); cache.set(phase, audioBase64);
          reply(200, { audioBase64, mime: "audio/mpeg" });
        } catch { reply(502, { error: "narration_unavailable" }); }
        finally { clearTimeout(timer); res.off("close", disconnect); if (job === current) job = null; }
      } catch { reply(400, { error: "invalid_request" }); }
    });
    server.httpServer?.once("close", () => { job?.controller.abort(); cache.clear(); });
  } };
}
