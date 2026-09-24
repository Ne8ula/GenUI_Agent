import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [fixturePid, stateFile, nativePid, output] = process.argv.slice(2);
if (!output) throw new Error("Arguments: fixturePid stateFile nativePid freshOutputDirectory");
const out = resolve(output); mkdirSync(out);
const { chromium } = await import(process.env.E1_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href : "playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const pages = browser.contexts().flatMap((c) => c.pages());
const main = pages.find((p) => p.url() === "http://tauri.localhost/");
const material = pages.find((p) => p.url().startsWith("http://tauri.localhost/") && p.url().includes("layer=material"));
if (!main || !material) throw new Error("Expected the bundled native frontend, not Vite.");
const result = { kind: "bundled-native-production-csp", timestamp: new Date().toISOString(), checks: [], errors: [] };
for (const p of [main, material]) {
  p.on("pageerror", (error) => result.errors.push(error.message));
  p.on("console", (message) => { if (message.type() === "error") result.errors.push(message.text().slice(0, 500)); });
}
const check = (name, ok) => { assert.ok(ok, name); result.checks.push(name); };
const probe = (args) => JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-File", resolve("experiments/e1/scripts/desktop-probe.ps1"),
  "-FixtureProcessId", fixturePid, "-StatePath", stateFile, "-E1ProcessId", nativePid, ...args], { encoding: "utf8", windowsHide: true }));
const click = async (locator) => {
  const box = await locator.boundingBox(); assert.ok(box);
  probe(["-Action", "Click", "-X", String(Math.round(box.x + box.width / 2)), "-Y", String(Math.round(box.y + box.height / 2))]);
};

try {
  await main.reload();
  await main.waitForSelector("button[type=submit]");
  await main.evaluate(() => document.fonts.ready);
  // Native hit regions follow the final font/layout boxes, not the first
  // fallback-font paint of a cold bundled page.
  await main.waitForTimeout(250);
  probe(["-Action", "Capture", "-PrepareFixture", "-FixtureMode", "light"]);
  await click(main.locator("button[type=submit]"));
  await main.waitForSelector(".e1-anchor");
  await material.waitForSelector(".e1-signal-eye canvas");
  await main.evaluate(() => document.fonts.ready);
  check("bundled native main renders all three anchors", await main.locator(".e1-anchor").count() === 3);
  check("development harness is absent", await main.evaluate(() => !window.__E1_TEST__));
  check("production test controls are absent", await main.locator(".e1-inspector").count() === 0);
  check("root stays transparent under production CSP", await main.evaluate(() => getComputedStyle(document.documentElement).backgroundColor === "rgba(0, 0, 0, 0)"));
  check("bundled fonts are loaded", await main.evaluate(() => document.fonts.status === "loaded" && document.fonts.check('16px "IBM Plex Sans"') && document.fonts.check('16px "Space Grotesk"')));
  check("archived eye uses real alpha WebGL in packaged build", await material.evaluate(() => {
    const eye = document.querySelector(".e1-signal-eye canvas");
    return !!eye && eye.getContext("webgl").getContextAttributes().alpha;
  }));
  probe(["-Action", "Capture", "-ScreenshotPath", resolve(out, "packaged-noon-light.png")]);

  await click(main.locator(".e1-menu > summary"));
  await click(main.getByText("Location and fixture", { exact: true }));
  await main.locator(".e1-location__input").fill("Boston");
  await click(main.locator("button[type=submit]"));
  check("packaged unavailable path retains labeled NYC facts", (await main.locator(".e1-unavailable").innerText()).includes("Boston") && await main.locator(".e1-anchor").count() === 3);
  await main.locator(".e1-location__input").fill("NYC");
  await click(main.locator(".e1-location__variant-disclosure > summary"));
  await main.getByRole("radio", { name: /Missing cloud/ }).check();
  await click(main.locator("button[type=submit]"));
  await click(main.locator('.e1-anchor[data-time="15:00"] .e1-anchor__more > summary'));
  check("packaged missing-cloud path is honest", (await main.locator('.e1-anchor[data-time="15:00"] .e1-anchor__details').innerText()).includes("Not provided"));
  check("no uncaught or CSP console errors", result.errors.length === 0);
  result.completed = true;
} catch (error) {
  result.failure = String(error); process.exitCode = 1;
} finally {
  writeFileSync(resolve(out, "checks.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}
