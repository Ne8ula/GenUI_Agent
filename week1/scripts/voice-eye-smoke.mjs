import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { validWave } from "../packages/protocol/voice.ts";

const output = resolve(process.argv[2]); await mkdir(output, { recursive: false });
const live = process.argv.includes("--live");
const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${join(tmpdir(), "eva-synthetic-weather-request.wav")}`] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ["microphone"], recordVideo: { dir: join(output, "video"), size: { width: 1440, height: 960 } } });
await context.addInitScript(() => {
  window.__testTracks = [];
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); window.__testTracks.push(...stream.getTracks()); return stream; };
});
const page = await context.newPage();
const errors = [], checks = []; page.on("pageerror", error => errors.push(error.message));
const capture = async name => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: join(output, `${name}.png`), animations: "disabled", fullPage: true }); };
let uploads = 0;
async function mock(text, milliseconds = 500, code = 200) {
  await page.unroute("**/api/voice/transcribe");
  await page.route("**/api/voice/transcribe", async route => {
    uploads++;
    const request = route.request().postDataJSON();
    assert.ok(validWave(Buffer.from(request.audioBase64, "base64")), "Microphone worklet produced canonical bounded audio");
    assert.equal(await page.evaluate(() => window.__testTracks.every(track => track.readyState === "ended")), true);
    await new Promise(resolve => setTimeout(resolve, milliseconds));
    await route.fulfill({ status: code, json: code === 200 ? { text, model: "whisper-1" } : { error: text } }).catch(() => {});
  });
}
try {
  if (!live) await mock("Show me the weather in Ithaca.");
  await page.goto("http://127.0.0.1:1420");
  await page.locator("canvas[data-renderer=webgl]").waitFor();
  checks.push({ renderer: await page.locator("canvas").evaluate(c => { const gl = c.getContext("webgl"); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "not exposed"; }) });
  await capture("ready");
  await page.getByRole("button", { name: "Speak request", exact: true }).click();
  await page.getByRole("button", { name: "Send recording", exact: true }).waitFor();
  await page.waitForTimeout(2900); await capture("listening");
  const nonzero = await page.locator(".meter-track > span").evaluate(el => el.style.transform !== "scaleX(0)");
  assert.ok(nonzero, "Actual synthetic audio energy reaches the meter");
  await page.getByRole("button", { name: "Send recording", exact: true }).click();
  await page.getByRole("button", { name: "Transcribing…", exact: true }).waitFor();
  await capture("transcribing");
  const outcome = await Promise.race([
    page.getByTestId("weather-card").waitFor({ timeout: 35000 }).then(() => "weather"),
    page.locator(".voice-error").waitFor({ timeout: 35000 }).then(() => "error"),
  ]);
  if (outcome === "error") throw new Error(`Voice UI: ${await page.locator(".voice-error").innerText()}; synthetic transcript: ${await page.locator(".request-receipt").textContent().catch(() => "none")}`);
  await page.getByRole("button", { name: "Preference used: Celsius" }).waitFor();
  assert.equal(await page.evaluate(() => window.__testTracks.every(track => track.readyState === "ended")), true);
  checks.push({ voice: live ? "Live Whisper API, synthetic Windows speech via fake microphone" : "Injected transcription, real AudioWorklet capture", transcript: await page.locator(".request-receipt p").innerText() });
  await page.waitForTimeout(1200); await capture("voice-weather");
  for (let cycle = 0; cycle < 2; cycle++) {
    const card = page.getByTestId("weather-card");
    await page.getByRole("button", { name: "Move weather card" }).focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowRight");
    const position = await card.evaluate(el => el.style.transform);
    await page.getByRole("button", { name: "Sunday, Sep 20", exact: false }).click();
    await page.getByRole("button", { name: "Add wind" }).click();
    assert.equal(await card.evaluate(el => el.style.transform), position);
    await page.getByRole("button", { name: "Preference used: Celsius" }).click();
    await page.getByText("View exact Markdown source").click(); await capture(`source-${cycle}`);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "Preference used: Celsius" }).evaluate(el => document.activeElement === el), true);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await card.evaluate(el => el.style.transform), position);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
  }
  checks.push("Two complete movement, selected day, wind, source, Escape, undo/reset regressions passed");
  for (const [width,height] of [[1440,960],[960,760],[1960,530],[600,760],[400,640]]) {
    await page.setViewportSize({width,height}); await capture(`weather-${width}x${height}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} page fits`);
    assert.ok(await page.locator(".day-cell").evaluateAll(cells => cells.every(el => el.scrollWidth <= el.clientWidth)), `${width} day values fit`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await mock("Delete my files and show the weather.");
  await page.getByRole("button", { name: "Speak request", exact: true }).click(); await page.getByRole("button", { name: "Send recording" }).waitFor(); await page.waitForTimeout(500);
  const beforeCancel = uploads; await page.getByRole("button", { name: "Cancel", exact: true }).click(); await page.waitForTimeout(200);
  assert.equal(uploads, beforeCancel); assert.equal(await page.evaluate(() => window.__testTracks.every(track => track.readyState === "ended")), true);
  await page.getByRole("button", { name: "Speak request", exact: true }).click(); await page.getByRole("button", { name: "Send recording" }).waitFor(); await page.waitForTimeout(600); await page.getByRole("button", { name: "Send recording" }).click();
  await page.getByText("Only Ithaca weather is available.").waitFor();
  await mock("voice_unavailable", 200, 502);
  await page.getByRole("button", { name: "Speak request", exact: true }).click(); await page.getByRole("button", { name: "Send recording" }).waitFor(); await page.waitForTimeout(600); await page.getByRole("button", { name: "Send recording" }).click();
  await page.getByText(/Voice is unavailable/).waitFor(); await capture("voice-error");
  await mock("Show me the weather", 1800);
  await page.getByRole("button", { name: "Speak request", exact: true }).click(); await page.getByRole("button", { name: "Send recording" }).waitFor(); await page.waitForTimeout(600); await page.getByRole("button", { name: "Send recording" }).click();
  await page.getByRole("button", { name: "Transcribing…" }).waitFor(); await page.getByRole("button", { name: "Dismiss" }).click();
  await page.getByRole("button", { name: "Open EVA" }).waitFor(); await page.waitForTimeout(2100);
  assert.equal(await page.getByTestId("weather-card").count(), 0); assert.equal(await page.locator("canvas").count(), 0);
  checks.push("Cancel releases microphone without upload; unsupported intent bounded; provider failure; dismissal rejects late transcription and unmounts GPU canvas");
  await page.getByRole("button", { name: "Open EVA" }).click();
  await page.locator("canvas[data-renderer=webgl]").waitFor();
  await page.locator("canvas").evaluate(c => c.getContext("webgl").getExtension("WEBGL_lose_context").loseContext());
  await page.locator(".static-eye > svg").waitFor(); await capture("gpu-fallback");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Weather", exact: false }).first().click();
  assert.equal(await page.getByTestId("weather-card").evaluate(el => getComputedStyle(el).animationName), "none");
  await capture("reduced-motion");
  assert.deepEqual(errors, []);
  checks.push("GPU context loss fallback and reduced motion passed");
  await writeFile(join(output, "results.json"), JSON.stringify({ status: "passed", liveWhisper: live, checks, errors }, null, 2));
  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
} catch (error) {
  await writeFile(join(output, "failure.json"), JSON.stringify({ checks, errors, error: error.message }, null, 2)); throw error;
} finally { await context.close(); await browser.close(); }
