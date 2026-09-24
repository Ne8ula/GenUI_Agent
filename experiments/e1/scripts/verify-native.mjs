// Actual Windows pointer routing against a separate synthetic application.
// CDP reads E1 state/geometry; it does not inject the pointer actions below.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [fixturePid, stateFile, nativePid, output, phase = "before-eye"] = process.argv.slice(2);
if (!fixturePid || !stateFile || !nativePid || !output) throw new Error("Arguments: fixturePid stateFile nativePid freshOutputDirectory [before-eye|final]");
const out = resolve(output);
if (existsSync(out)) throw new Error("Use a fresh output directory to preserve prior evidence.");
mkdirSync(out, { recursive: true });
const probe = resolve("experiments/e1/scripts/desktop-probe.ps1");
const { chromium } = await import(process.env.E1_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href : "playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const pages = browser.contexts().flatMap((context) => context.pages());
const main = pages.find((page) => page.url() === "http://127.0.0.1:1431/");
const material = pages.find((page) => new URL(page.url()).searchParams.get("layer") === "material");
if (!main || !material) throw new Error("Both E1 native layers must be open.");
const result = { phase, startedAt: new Date().toISOString(), checks: [], captures: [], errors: [] };
main.on("pageerror", (error) => result.errors.push({ layer: "main", error: error.message }));
material.on("pageerror", (error) => result.errors.push({ layer: "material", error: error.message }));
const check = (label, passed) => { assert.ok(passed, label); result.checks.push(label); };
const fixture = () => JSON.parse(readFileSync(stateFile, "utf8"));
const runProbe = (args) => JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-File", probe,
  "-FixtureProcessId", fixturePid, "-StatePath", stateFile, "-E1ProcessId", nativePid, ...args], { encoding: "utf8" }));
const snapshot = () => main.evaluate(() => window.__E1_TEST__.getSnapshot());
const settle = () => main.waitForFunction(() => window.__E1_TEST__.getSnapshot().transition.status !== "active", null, { timeout: 10000 });
const click = async (locator) => {
  const box = await locator.boundingBox();
  assert.ok(box, "control has a visible native rectangle");
  runProbe(["-Action", "Click", "-X", String(Math.round(box.x + box.width / 2)), "-Y", String(Math.round(box.y + box.height / 2))]);
};
const capture = (name, mode = "light") => {
  const path = resolve(out, `${name}.png`);
  const response = runProbe(["-Action", "Capture", "-FixtureMode", mode, "-ScreenshotPath", path]);
  result.captures.push({ name, mode, width: response.screenshot.width, height: response.screenshot.height });
};
const anchor = (time) => main.locator(`.e1-anchor[data-time="${time}"]`);

try {
  await main.reload();
  await main.waitForFunction(() => window.__E1_TEST__?.getStats().drawCount > 0);
  result.geometry = await main.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
    left: screenX, top: screenY, native: !!window.__TAURI_INTERNALS__, userAgent: navigator.userAgent }));
  const area = fixture().client;
  check("actual Tauri host and two native layers", result.geometry.native && await material.evaluate(() => !!window.__TAURI_INTERNALS__));
  check("controlled physical coordinate mapping", result.geometry.dpr === 1 && result.geometry.left === area.screenLeft &&
    result.geometry.top === area.screenTop && result.geometry.width === area.width && result.geometry.height === area.height);
  runProbe(["-Action", "Capture", "-PrepareFixture"]);
  const initialClicks = fixture().clickCount;
  await click(main.locator("button[type=submit]"));
  await main.waitForFunction(() => window.__E1_TEST__.getSnapshot().status === "ready");
  await settle();
  check("real OS request click reaches the overlay, not the backdrop", fixture().clickCount === initialClicks);
  check("native material has actual field points", await main.evaluate(() => window.__E1_TEST__.getStats().pointCount === 2000));
  await main.evaluate(() => document.fonts.ready);
  capture("native-noon-light");

  const emptyBefore = fixture().clickCount;
  runProbe(["-Action", "Click", "-X", "2380", "-Y", "1270"]);
  check("empty transparent area passes real OS input to another process", fixture().clickCount === emptyBefore + 1);
  const interactiveBefore = fixture().clickCount;
  await click(anchor("15:00").locator(".e1-anchor__handle"));
  await main.waitForFunction(() => window.__E1_TEST__.getSnapshot().selected === "15:00");
  await settle();
  check("interactive anchor intercepts its own OS click", fixture().clickCount === interactiveBefore);

  const before = (await snapshot()).anchors["15:00"];
  const handle = await anchor("15:00").locator(".e1-anchor__handle").boundingBox();
  const x = Math.round(handle.x + handle.width / 2), y = Math.round(handle.y + handle.height / 2);
  runProbe(["-Action", "Drag", "-StartX", String(x), "-StartY", String(y), "-EndX", String(x + 120), "-EndY", String(y - 130)]);
  await settle();
  const moved = (await snapshot()).anchors["15:00"];
  check("real OS drag changes local geometry", moved.userMoved && moved.x > before.x && moved.y < before.y);
  await click(anchor("15:00").locator(".e1-anchor__pin"));
  const pin = (await snapshot()).anchors["15:00"];
  check("pin control is interactive in native window", pin.pinned);
  await click(main.locator(".e1-menu > summary"));
  if (!(await main.locator(".e1-controls__more").evaluate((element) => element.open))) {
    await click(main.locator(".e1-controls__more > summary"));
  }
  await click(main.getByRole("button", { name: "Compare with noon", exact: true }));
  await settle();
  assert.deepEqual((await snapshot()).anchors["15:00"], pin);
  result.checks.push("native comparison preserves the exact pinned position");
  capture("native-comparison-light");
  capture("native-comparison-dark", "dark");
  capture("native-comparison-busy", "busy-neutral");

  const decorBefore = fixture().clickCount;
  // Field material is present near the noon anchor, away from its interactive pill.
  const noon = (await snapshot()).anchors["12:00"];
  runProbe(["-Action", "Click", "-X", String(Math.round(noon.x * result.geometry.width)),
    "-Y", String(Math.round(noon.y * result.geometry.height + 160))]);
  check("decorative material also passes real OS input", fixture().clickCount === decorBefore + 1);
  if (phase === "final") {
    check("Week 1 eye is integrated in the material window", await material.locator(".e1-signal-eye").count() === 1);
    const eyeBefore = fixture().clickCount;
    const eye = await material.locator(".e1-eye-presence").boundingBox();
    runProbe(["-Action", "Click", "-X", String(Math.round(eye.x + eye.width / 2)), "-Y", String(Math.round(eye.y + eye.height / 2))]);
    check("eye is genuinely click-through", fixture().clickCount === eyeBefore + 1);
  }
  result.snapshot = await snapshot();
  result.backdropClicks = fixture().clickCount;
  check("no uncaught native page errors", result.errors.length === 0);
  result.completed = true;
} catch (error) {
  result.failure = String(error);
  process.exitCode = 1;
} finally {
  writeFileSync(resolve(out, "checks.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ completed: result.completed ?? false, checks: result.checks, failure: result.failure ?? null, captures: result.captures }, null, 2));
  await browser.close();
}
