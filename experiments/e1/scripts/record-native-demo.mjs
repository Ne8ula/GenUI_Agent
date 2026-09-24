// One bounded native recording/exercise. No tool/UI focus switches are needed
// between starting the guarded recorder and completing the recorded actions.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [fixturePid, stateFile, nativePid, output] = process.argv.slice(2);
if (!output) throw new Error("Arguments: fixturePid stateFile nativePid freshOutputDirectory");
const out = resolve(output);
mkdirSync(out);
const { chromium } = await import(process.env.E1_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href : "playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const pages = browser.contexts().flatMap((context) => context.pages());
const main = pages.find((page) => page.url() === "http://127.0.0.1:1431/");
const material = pages.find((page) => new URL(page.url()).searchParams.get("layer") === "material");
if (!main || !material) throw new Error("Both native E1 windows must be running.");
const result = { kind: "native-recorded-exercise", startedAt: new Date().toISOString(), checks: [], inputMethods: { pointer: "Win32 SendInput", keyboard: "native WebView2 CDP" } };
const probePath = resolve("experiments/e1/scripts/desktop-probe.ps1");
const common = ["-FixtureProcessId", fixturePid, "-StatePath", stateFile];
const probe = (args, withE1 = true) => JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-File", probePath,
  ...common, ...(withE1 ? ["-E1ProcessId", nativePid] : []), ...args], { encoding: "utf8", windowsHide: true }));
const fixture = () => JSON.parse(readFileSync(stateFile, "utf8"));
const capture = (name, withE1 = true) => probe(["-Action", "Capture", "-ScreenshotPath", resolve(out, `${name}.png`)], withE1);
const click = async (locator) => {
  const r = await locator.boundingBox(); assert.ok(r);
  probe(["-Action", "Click", "-X", String(Math.round(r.x + r.width / 2)), "-Y", String(Math.round(r.y + r.height / 2))]);
};
const anchor = (time) => main.locator(`.e1-anchor[data-time="${time}"]`);
const settle = () => main.waitForFunction(() => window.__E1_TEST__.getSnapshot().transition.status !== "active");
let recorder;
let recorderExit;
let recorderError = "";

try {
  await main.reload();
  await main.waitForFunction(() => window.__E1_TEST__?.getStats().drawCount > 0, null, { polling: 100, timeout: 10000 });
  await material.reload();
  await material.waitForSelector(".e1-signal-eye canvas");
  probe(["-Action", "Capture", "-FixtureMode", "dark"]);
  recorder = spawn("powershell.exe", ["-NoProfile", "-File", resolve("experiments/e1/scripts/record-native.ps1"),
    ...common, "-E1ProcessId", nativePid, "-OutputDirectory", resolve(out, "recording"), "-DurationSeconds", "35", "-FramesPerSecond", "12"],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  recorder.stderr.on("data", (data) => { recorderError += data.toString(); });
  recorderExit = new Promise((resolveExit) => recorder.once("exit", (code) => resolveExit(code)));
  await new Promise((resolveReady, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("Recorder readiness timed out")), 15000);
    recorder.stdout.on("data", (data) => {
      buffer += data.toString();
      if (buffer.includes('"recording-start"')) { clearTimeout(timeout); resolveReady(); }
    });
    recorder.once("exit", () => { clearTimeout(timeout); reject(new Error(`Recorder stopped before readiness: ${recorderError}`)); });
  });

  await main.waitForTimeout(700); // opening frame of the native recording
  await click(main.locator("button[type=submit]"));
  await main.waitForFunction(() => window.__E1_TEST__.getSnapshot().status === "ready");
  await settle();
  await click(anchor("15:00").locator(".e1-anchor__handle"));
  await settle();
  const r = await anchor("15:00").locator(".e1-anchor__handle").boundingBox();
  const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
  probe(["-Action", "Drag", "-StartX", String(x), "-StartY", String(y), "-EndX", String(x + 120), "-EndY", String(y - 130)]);
  await click(anchor("15:00").locator(".e1-anchor__pin"));
  const pinned = await main.evaluate(() => window.__E1_TEST__.getSnapshot().anchors["15:00"]);
  assert.equal(pinned.pinned, true);
  await click(main.locator(".e1-menu > summary"));
  await click(main.locator(".e1-controls__more > summary"));
  await click(main.getByRole("button", { name: "Compare with noon", exact: true }));
  await settle();
  assert.deepEqual(await main.evaluate(() => window.__E1_TEST__.getSnapshot().anchors["15:00"]), pinned);
  result.checks.push("recorded OS movement, pinning and comparison preserve geometry");

  const before = fixture().clickCount;
  probe(["-Action", "Click", "-X", "2380", "-Y", "1270"]);
  assert.equal(fixture().clickCount, before + 1);
  result.checks.push("recorded real OS click-through reaches underlying application");
  await click(anchor("09:00").locator(".e1-anchor__handle"));
  await main.waitForTimeout(120);
  await main.keyboard.press("s");
  assert.equal(await main.evaluate(() => window.__E1_TEST__.getSnapshot().transition.status), "interrupted");
  await main.waitForTimeout(200);
  const stopCount = await material.evaluate(() => Number(document.querySelector(".e1-signal-eye canvas").dataset.eyeDrawCount));
  await main.waitForTimeout(250);
  assert.equal(await material.evaluate(() => Number(document.querySelector(".e1-signal-eye canvas").dataset.eyeDrawCount)), stopCount);
  result.checks.push("native focused Stop shortcut arrests field and eye");
  await main.keyboard.press("l");
  assert.equal(await main.evaluate(() => window.__E1_TEST__.getSnapshot().reducedMotion), true);
  await main.keyboard.press("p");
  await material.waitForFunction(() => !document.querySelector(".e1-signal-eye"));
  assert.equal(await material.locator(".e1-field-canvas").isVisible(), false);
  result.checks.push("native focused less-motion/plain shortcuts preserve facts and remove effects");
  capture("native-plain-answer");
  await main.waitForTimeout(700);
  await click(main.getByRole("button", { name: "Plain answer", exact: true }));
  await main.evaluate(() => window.__E1_TEST__.controller.setReducedMotion(false));
  await main.keyboard.press("Escape"); // close the controls disclosure, not the response
  await click(anchor("15:00").locator(".e1-anchor__handle"));
  await settle();
  await main.waitForTimeout(1000);
  capture("native-eye-and-comparison");

  let late = null;
  main.on("console", (message) => {
    if (message.text().startsWith("E1_LATE_RESULT:")) late = JSON.parse(message.text().slice("E1_LATE_RESULT:".length));
  });
  await main.evaluate(() => {
    const c = window.__E1_TEST__.controller, patch = c.createDelayedPatch();
    const unsubscribe = c.subscribe(() => {
      if (c.getSnapshot().status !== "dismissed") return;
      unsubscribe();
      console.log("E1_LATE_RESULT:" + JSON.stringify(c.deliverDelayedPatch(patch)));
    });
  });
  await click(main.locator(".e1-menu > summary"));
  const closed = main.waitForEvent("close", { timeout: 10000 });
  await click(main.getByRole("button", { name: "Dismiss", exact: true }));
  await closed;
  assert.ok(late && late.accepted === false, "late patch is rejected during actual native dismissal");
  result.checks.push("real OS Dismiss closes native windows and rejects delayed output");
  const afterDismiss = fixture().clickCount;
  probe(["-Action", "Click", "-X", "2060", "-Y", "733"], false);
  assert.equal(fixture().clickCount, afterDismiss + 1);
  result.checks.push("former overlay location is usable after dismissal");
  capture("native-dismissed", false);
  const exitCode = await recorderExit;
  assert.equal(exitCode, 0, recorderError);
  result.completed = true;
} catch (error) {
  result.failure = String(error);
  process.exitCode = 1;
  if (recorderExit) await recorderExit;
} finally {
  writeFileSync(resolve(out, "checks.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (browser.isConnected()) await browser.close();
}
