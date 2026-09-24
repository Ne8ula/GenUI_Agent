// Local test tooling only. Never enable a debugging port in shipped configuration.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.env.E1_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : "playwright");
const endpoint = process.env.E1_CDP_URL ?? "http://127.0.0.1:9223";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("Use a loopback-only E1 debug endpoint.");
const out = resolve(process.argv[2] ?? "benchmark-results");
const count = Number(process.argv[3] ?? 2000);
if (![2000, 8000].includes(count)) throw new Error("Only the specified E1 loads are permitted.");
await mkdir(out, { recursive: true });
const browser = await chromium.connectOverCDP(endpoint);
const page = browser.contexts().flatMap((context) => context.pages())
  .find((candidate) => candidate.url() === "http://127.0.0.1:1431/");
if (!page) throw new Error("The E1 dev WebView is not open.");
const metadata = await page.evaluate(() => ({
  native: !!window.__TAURI_INTERNALS__,
  userAgent: navigator.userAgent,
  cssWidth: innerWidth, cssHeight: innerHeight, dpr: devicePixelRatio,
  physicalWidth: innerWidth * devicePixelRatio, physicalHeight: innerHeight * devicePixelRatio,
  visibility: document.visibilityState,
  osReducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
}));
if (!metadata.native || metadata.visibility !== "visible") throw new Error("Requires a visible native E1 window.");
const results = { timestamp: new Date().toISOString(), metadata, count,
  method: "Development WebView2; forced continuous settled field draws; 2s warm-up, then 3 x 30s per backend. rAF intervals, not GPU or input-to-photon timing. No recording during sampling; CDP and React diagnostics remain active.",
  runs: [] };
const save = () => writeFile(resolve(out, `frames-${metadata.cssWidth}x${metadata.cssHeight}-${metadata.dpr}dpr-${count}.json`), JSON.stringify(results, null, 2) + "\n");
const sample = async (duration) => {
  await page.evaluate((ms) => window.__E1_TEST__.benchmark.start(ms), duration);
  // The native material renderer acknowledges asynchronously; don't mistake
  // the pre-acknowledgement idle state for a completed run.
  await page.waitForFunction(() => window.__E1_TEST__.benchmark.isRunning(), null, { polling: 100, timeout: 5000 });
  await page.waitForFunction(() => !window.__E1_TEST__.benchmark.isRunning(), null, { polling: 100, timeout: duration + 15000 });
  return page.evaluate(() => window.__E1_TEST__.benchmark.getSamples());
};
try {
  await page.evaluate(() => {
    const c = window.__E1_TEST__.controller;
    c.request(); c.setReducedMotion(false); c.setPlain(false);
    c.select("15:00"); c.move("15:00", { x: 0.72, y: 0.5 }); c.pin("15:00", true); c.compare();
  });
  for (const renderer of ["canvas2d", "webgl"]) {
    await page.evaluate(({ renderer, count }) => {
      window.__E1_TEST__.setRenderer(renderer); window.__E1_TEST__.setCount(count);
    }, { renderer, count });
    await page.waitForFunction(({ renderer, count }) => {
      const h = window.__E1_TEST__, s = h.getStats();
      return h.getRenderer() === renderer && s.renderer === renderer && s.requestedCount === count && s.settled;
    }, { renderer, count }, { polling: 100, timeout: 15000 });
    await sample(2000);
    for (let repeat = 1; repeat <= 3; repeat++) {
      const samples = (await sample(30000)).filter((value) => Number.isFinite(value) && value > 0);
      const state = await page.evaluate(() => ({ visibility: document.visibilityState, stats: window.__E1_TEST__.getStats() }));
      const sorted = [...samples].sort((a, b) => a - b);
      const percentile = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
      const duration = samples.reduce((a, b) => a + b, 0);
      if (duration < 29500 || state.visibility !== "visible" || state.stats.renderer !== renderer) {
        throw new Error(`Invalid/truncated ${renderer} sample: ${duration}ms, ${state.visibility}`);
      }
      const run = { renderer, repeat, samplesMs: samples, sampledDurationMs: duration,
        medianMs: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
        framesOver16_7Ms: samples.filter((n) => n > 16.7).length,
        framesOver50Ms: samples.filter((n) => n > 50).length, stats: state.stats };
      results.runs.push(run); await save();
      console.log(JSON.stringify({ renderer, count, repeat, samples: samples.length,
        duration, medianMs: run.medianMs, p95Ms: run.p95Ms, p99Ms: run.p99Ms }));
    }
  }
  await page.evaluate(() => window.__E1_TEST__.controller.stop());
  results.completed = true; await save();
} catch (error) {
  results.failure = String(error); await save(); throw error;
} finally {
  await page.evaluate(() => window.__E1_TEST__?.benchmark.stop()).catch(() => {});
  // Exit disconnects this test client without closing the owner's native window.
  process.exitCode = results.completed ? 0 : 1;
  await browser.close();
}
