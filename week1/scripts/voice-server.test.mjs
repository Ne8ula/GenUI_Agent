import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { voiceServer } from "../apps/desktop/voice-server.ts";
import { pcmWave } from "../packages/protocol/voice.ts";
const originalFetch = globalThis.fetch;
const request = { requestId: "synthetic-request", audioBase64: Buffer.from(pcmWave(new Float32Array(16000))).toString("base64") };
async function fixture(run, provider) {
  const saved = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = "synthetic-test-key";
  let handler, calls = 0;
  const server = createServer((req,res) => handler(req,res,() => { res.writeHead(404); res.end(); }));
  voiceServer().configureServer({ middlewares: { use(value) { handler = value; } }, httpServer: server });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  globalThis.fetch = async (url, options) => {
    if (String(url) !== "https://api.openai.com/v1/audio/transcriptions") return originalFetch(url,options);
    calls++; assert.equal(options.headers.Authorization, "Bearer synthetic-test-key"); assert.equal(options.redirect, "error");
    assert.equal(options.body.get("model"), "whisper-1"); assert.equal(options.body.get("file").type, "audio/wav");
    return provider ? provider(options) : new Response(JSON.stringify({ text: "Show me the weather." }), { status: 200 });
  };
  const send = (path, value = request, headers = {}) => new Promise((resolve,reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port: server.address().port, path: `/api/voice/${path}`, method: "POST",
      headers: { Host: "127.0.0.1:1420", Origin: "http://127.0.0.1:1420", "Content-Type": "application/json", ...headers } }, res => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk)); res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })));
    }); req.on("error", reject); req.end(JSON.stringify(value));
  });
  try { await run(send, () => calls); }
  finally { globalThis.fetch = originalFetch; if (saved === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved; await new Promise(resolve => server.close(resolve)); }
}
test("loopback boundary rejects cross-origin, unknown authority/model fields and malformed audio before upload", async () => {
  await fixture(async (send,calls) => {
    assert.equal((await send("transcribe", request, { Origin: "https://untrusted.example" })).status, 403);
    assert.equal((await send("transcribe", request, { Host: "untrusted.example" })).status, 403);
    for (const extra of ["endpoint", "model", "apiKey", "permission"]) assert.equal((await send("transcribe", { ...request, [extra]: "untrusted" })).status, 400);
    assert.equal((await send("transcribe", { ...request, audioBase64: "YWJj" })).status, 400);
    assert.equal(calls(), 0);
  });
});
test("one Whisper upload returns only bounded transcript; rapid replay is rejected", async () => {
  await fixture(async (send,calls) => {
    const response = await send("transcribe"); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { text: "Show me the weather.", model: "whisper-1" });
    assert.equal((await send("transcribe")).status, 429); assert.equal(calls(), 1);
  });
});
test("cancel aborts the in-flight provider request and permits no second simultaneous job", async () => {
  let started; const ready = new Promise(resolve => { started = resolve; });
  await fixture(async (send,calls) => {
    const pending = send("transcribe"); await ready;
    assert.equal((await send("transcribe", { ...request, requestId: "other" })).status, 429);
    assert.equal((await send("cancel", { requestId: request.requestId })).status, 200);
    assert.deepEqual(await (await pending).json(), { error: "voice_cancelled_or_timed_out" }); assert.equal(calls(), 1);
  }, options => new Promise((resolve,reject) => { started(); options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }); }));
});
test("provider diagnostics and oversized responses stay out of the renderer", async () => {
  await fixture(async send => {
    const response = await send("transcribe"); assert.deepEqual(await response.json(), { error: "voice_auth_failed" });
  }, () => new Response("sensitive provider diagnostics", { status: 401 }));
  await fixture(async send => {
    const response = await send("transcribe"); assert.deepEqual(await response.json(), { error: "voice_unavailable" });
  }, () => new Response(JSON.stringify({ text: "a".repeat(10000) })));
});
