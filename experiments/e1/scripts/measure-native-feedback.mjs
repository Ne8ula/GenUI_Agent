import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [fixturePid, stateFile, nativePid, output] = process.argv.slice(2);
if (!output) throw new Error("Arguments: fixturePid stateFile nativePid outputJson");
const { chromium } = await import(process.env.E1_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href : "playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url() === "http://127.0.0.1:1431/");
if (!page) throw new Error("Native E1 is not open.");
try {
  await page.evaluate(() => { const h = window.__E1_TEST__; h.controller.request(); h.controller.setPlain(false); h.controller.setReducedMotion(false); h.setCount(2000); h.setRenderer("canvas2d"); });
  await page.waitForFunction(() => window.__E1_TEST__.getSnapshot().transition.status === "settled", null, { polling: 100 });
  const box = await page.locator('.e1-anchor[data-time="15:00"] .e1-anchor__handle').boundingBox();
  execFileSync("powershell.exe", ["-NoProfile", "-File", resolve("experiments/e1/scripts/desktop-probe.ps1"),
    "-FixtureProcessId", fixturePid, "-StatePath", stateFile, "-E1ProcessId", nativePid,
    "-PrepareFixture", "-Action", "Click", "-X", String(Math.round(box.x + box.width / 2)), "-Y", String(Math.round(box.y + box.height / 2))],
    { windowsHide: true, encoding: "utf8" });
  await page.evaluate(() => {
    window.__E1_FEEDBACK_SAMPLES__ = [];
    window.__E1_FEEDBACK_HANDLER__ = (event) => {
      if (!event.key.startsWith("Arrow")) return;
      const start = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => window.__E1_FEEDBACK_SAMPLES__.push(performance.now() - start)));
    };
    window.addEventListener("keydown", window.__E1_FEEDBACK_HANDLER__, true);
  });
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(i % 2 ? "ArrowLeft" : "ArrowRight");
    await page.waitForFunction((n) => window.__E1_FEEDBACK_SAMPLES__.length > n, i, { polling: 10 });
  }
  const samples = await page.evaluate(() => window.__E1_FEEDBACK_SAMPLES__);
  const sorted = [...samples].sort((a, b) => a - b);
  const q = (p) => sorted[Math.ceil(sorted.length * p) - 1];
  const result = { timestamp: new Date().toISOString(), kind: "native-keyboard-feedback-proxy", count: samples.length,
    method: "Real OS pointer establishes native anchor focus; 30 native WebView2 CDP arrow-key events. Main-window key handler entry to second rAF. This is a render-opportunity proxy, NOT physical input-to-photon latency or the material-window settling time.",
    samplesMs: samples, medianMs: q(.5), p95Ms: q(.95), p99Ms: q(.99) };
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ count: result.count, medianMs: result.medianMs, p95Ms: result.p95Ms, p99Ms: result.p99Ms }));
} finally {
  await page.evaluate(() => { window.removeEventListener("keydown", window.__E1_FEEDBACK_HANDLER__, true); delete window.__E1_FEEDBACK_HANDLER__; delete window.__E1_FEEDBACK_SAMPLES__; }).catch(() => {});
  await browser.close();
}
