import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.E1_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href : "playwright");
if (!process.argv[2]) throw new Error("Supply a fresh output directory.");
const out = resolve(process.argv[2]);
await mkdir(out);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const pages = browser.contexts().flatMap((context) => context.pages());
const main = pages.find((page) => page.url() === "http://127.0.0.1:1431/");
const material = pages.find((page) => new URL(page.url()).searchParams.get("layer") === "material");
if (!main || !material) throw new Error("Expected both native E1 layers.");
const result = { kind: "native-webview-lifecycle", timestamp: new Date().toISOString(), checks: [], errors: [] };
const check = (name, passed) => { assert.ok(passed, name); result.checks.push(name); };
main.on("pageerror", (error) => result.errors.push(error.message));
material.on("pageerror", (error) => result.errors.push(error.message));
const eyeCount = () => material.evaluate(() => Number(document.querySelector(".e1-signal-eye canvas")?.dataset.eyeDrawCount ?? -1));
const waitEyeQuiet = async () => {
  await material.waitForTimeout(1100);
  const count = await eyeCount();
  await material.waitForTimeout(200);
  return count >= 0 && count === await eyeCount();
};

try {
  await main.evaluate(() => { const c = window.__E1_TEST__.controller; c.request("NYC"); c.setPlain(false); c.setReducedMotion(false); c.select("12:00"); });
  await material.waitForSelector(".e1-signal-eye canvas");
  check("actual archived shader path, not only SVG fallback", await material.locator(".e1-signal-eye").getAttribute("data-renderer") === "webgl");
  check("eye context has alpha", await material.evaluate(() => document.querySelector(".e1-signal-eye canvas").getContext("webgl").getContextAttributes().alpha));
  check("eye self-settles without a perpetual idle loop", await waitEyeQuiet());
  await material.locator(".e1-eye-presence").screenshot({ path: resolve(out, "eye-native-settled.png"), omitBackground: true });

  const before = await eyeCount();
  await main.evaluate(() => window.__E1_TEST__.controller.select("15:00"));
  await material.waitForFunction((previous) => Number(document.querySelector(".e1-signal-eye canvas")?.dataset.eyeDrawCount) > previous, before);
  check("explicit selection triggers a bounded eye cue", true);
  await main.evaluate(() => window.__E1_TEST__.controller.stop());
  await material.waitForTimeout(160);
  const stopped = await eyeCount();
  await material.waitForTimeout(250);
  check("Stop halts eye drawing and does not resume", stopped === await eyeCount());

  await main.evaluate(() => { const c = window.__E1_TEST__.controller; c.setReducedMotion(true); c.select("09:00"); });
  await material.waitForTimeout(200);
  const reduced = await eyeCount();
  await material.waitForTimeout(250);
  check("reduced motion leaves a static eye", reduced === await eyeCount());
  await main.evaluate(() => window.__E1_TEST__.controller.setPlain(true));
  await material.waitForFunction(() => !document.querySelector(".e1-eye-presence"));
  check("plain answer removes eye and field effects", await material.locator(".e1-eye-presence").count() === 0 && !(await material.locator(".e1-field-canvas").isVisible()));

  await main.evaluate(() => { const c = window.__E1_TEST__.controller; c.setPlain(false); c.setReducedMotion(false); c.select("15:00"); });
  await material.waitForSelector(".e1-signal-eye canvas");
  check("expressive mode recreates and then settles the eye", await waitEyeQuiet());
  await main.evaluate(() => window.__E1_TEST__.setRenderer("webgl"));
  await main.waitForFunction(() => window.__E1_TEST__.getStats().renderer === "webgl");
  check("native field WebGL is actually alpha-capable", await material.evaluate(() => document.querySelector(".e1-field-canvas canvas").getContext("webgl").getContextAttributes().alpha));
  await main.evaluate(() => window.__E1_TEST__.simulateRendererFailure("webgl-context-lost"));
  await main.waitForFunction(() => window.__E1_TEST__.getStats().renderer === "canvas2d");
  check("native WebGL context loss falls back to actual Canvas2D", true);
  await main.evaluate(() => window.__E1_TEST__.clearSimulatedFailure());
  check("no uncaught native lifecycle errors", result.errors.length === 0);
  result.completed = true;
} catch (error) {
  result.failure = String(error);
  process.exitCode = 1;
} finally {
  await writeFile(resolve(out, "checks.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
