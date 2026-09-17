import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { parseDemoMemory } from "../apps/desktop/src/memory-contract.ts";

const native = process.argv.includes("--native");
const outIndex = process.argv.indexOf("--output");
if (outIndex < 0) throw new Error("Pass --output <new evidence directory>");
const output = resolve(process.argv[outIndex + 1]);
await mkdir(output, { recursive: false });
const markdown = await readFile(new URL("../fixtures/vault/preferences/weather-units.md", import.meta.url), "utf8");
const checks = [], errors = [], requests = [];
let browser, child, exited, context;

async function launch() {
  if (!native) {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    context = await browser.newContext({ viewport: { width: 960, height: 760 }, recordVideo: { dir: join(output, "video"), size: { width: 960, height: 760 } } });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:1420");
    return page;
  }
  // Development-only instrumentation on this child. The packaged app has no debug port.
  await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once("error", reject);
    probe.listen(9223, "127.0.0.1", () => probe.close(resolve));
  });
  const profile = await mkdtemp(join(tmpdir(), "eva-weather-"));
  child = spawn(resolve("apps/desktop/src-tauri/target/debug/eva-desktop.exe"), [], {
    windowsHide: true, stdio: "ignore",
    env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1" },
  });
  exited = new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  for (let n = 0; n < 40; n++) {
    try { browser = await chromium.connectOverCDP("http://127.0.0.1:9223", { timeout: 1000 }); break; }
    catch { if (child.exitCode !== null) throw new Error("Native child exited"); await delay(500); }
  }
  assert.ok(browser, "Native WebView2 ready");
  const win = JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-Command", `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Get-Process -Id ${child.pid}) | Select-Object MainWindowTitle,MainWindowHandle | ConvertTo-Json -Compress`], { encoding: "utf8", windowsHide: true }));
  assert.ok(win.MainWindowHandle); checks.push({ nativeWindow: win });
  context = browser.contexts()[0];
  const page = context.pages()[0] || await context.waitForEvent("page");
  await page.setViewportSize({ width: 960, height: 760 });
  return page;
}
async function close() {
  if (child) {
    execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${child.pid}).CloseMainWindow()`], { windowsHide: true });
    assert.equal(await Promise.race([exited, delay(10000).then(() => "timeout")]), 0);
    child = null;
  }
  await browser?.close(); browser = null;
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No horizontal page clipping");
  const bounds = await page.getByTestId("weather-card").boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= (await page.viewportSize()).width + 1, "Card fits viewport");
  assert.ok(await page.locator(".day-cell").evaluateAll(cells => cells.every(el => el.scrollWidth <= el.clientWidth)), "Forecast values fit individual day cells");
}
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(output, name + ".png"), fullPage: true, animations: "disabled" });
}
try {
  if (native && process.argv.includes("--offline")) {
    let serverReachable = false;
    try { await fetch("http://127.0.0.1:1420", { signal: AbortSignal.timeout(1000) }); serverReachable = true; } catch { /* Expected: no Vite. */ }
    assert.equal(serverReachable, false, "Vite is stopped for standalone verification");
    checks.push("No development server was listening on port 1420");
  }
  let page = await launch();
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => requests.push(request.url()));
  await page.getByRole("button", { name: "Open EVA" }).waitFor();
  checks.push({ url: page.url(), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })), browser: browser.version() });
  if (native) assert.equal(new URL(page.url()).host, "tauri.localhost", "Standalone embedded frontend");
  await capture(page, "welcome");
  for (let cycle = 1; cycle <= 2; cycle++) {
    await page.getByRole("button", { name: "Open EVA" }).click();
    const preference = page.getByRole("button", { name: "Preference used: Celsius" });
    await preference.waitFor();
    assert.match(await page.locator(".memory-evidence").innerText(), native ? /Rust/ : /Browser/);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    if (cycle === 1) await capture(page, "base");
    const handle = page.getByRole("button", { name: "Move weather card" });
    await handle.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowRight");
    const weather = page.getByTestId("weather-card");
    const position = await weather.evaluate(el => el.style.transform);
    assert.notEqual(position, "translate(0px, 0px)");
    await page.getByRole("button", { name: "Sunday, Sep 20", exact: false }).click();
    const add = page.getByRole("button", { name: "Add wind" });
    await add.focus(); await page.keyboard.press("Enter");
    await page.getByTestId("wind-panel").waitFor();
    assert.equal(await weather.evaluate(el => el.style.transform), position);
    assert.match(await page.locator(".reading-label").innerText(), /Sunday/);
    assert.equal(await page.getByRole("button", { name: "Wind added" }).evaluate(el => el === document.activeElement), true);
    assert.match(await page.getByTestId("wind-panel").innerText(), /Unavailable/);
    if (cycle === 1) await capture(page, "wind-focus");
    await preference.click();
    await page.getByRole("dialog").waitFor();
    await page.getByText("View exact Markdown source").click();
    assert.equal(await page.locator("dialog pre").textContent(), markdown);
    if (cycle === 1) await capture(page, "memory-source");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await preference.evaluate(el => el === document.activeElement), true);
    assert.equal(await weather.count(), 1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    assert.equal(await page.getByTestId("wind-panel").count(), 0);
    assert.equal(await weather.evaluate(el => el.style.transform), position);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    assert.equal(await weather.evaluate(el => el.style.transform), "translate(0px, 0px)");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("button", { name: "Open EVA" }).evaluate(el => el === document.activeElement), true);
    checks.push(`Rehearsal ${cycle}: open, reset, keyboard move, select day, patch, exact source, topmost Escape, undo, reset, dismiss`);
  }
  await page.getByRole("button", { name: "Open EVA" }).click();
  await page.getByRole("button", { name: "Preference used: Celsius" }).waitFor();
  const handle = page.getByRole("button", { name: "Move weather card" });
  const rect = await handle.boundingBox();
  await page.mouse.move(rect.x + 15, rect.y + 15); await page.mouse.down();
  await page.mouse.move(rect.x + 30, rect.y + 60, { steps: 8 }); await page.mouse.up();
  assert.notEqual(await page.getByTestId("weather-card").evaluate(el => el.style.transform), "translate(0px, 0px)");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  for (const [width, height] of [[960,760], [1280,900], [1960,530], [1280,530], [960,530], [600,760], [400,640]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await noOverflow(page); await capture(page, `base-${width}x${height}`);
    await page.getByRole("button", { name: "Add wind" }).click();
    await noOverflow(page); await capture(page, `wind-${width}x${height}`);
    await page.getByRole("button", { name: "Preference used: Celsius" }).click();
    await page.getByText("View exact Markdown source").click();
    assert.ok(await page.locator("dialog").evaluate(el => el.scrollWidth <= el.clientWidth), "Dossier wraps source");
    await capture(page, `memory-${width}x${height}`);
    await page.keyboard.press("Escape");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(await page.getByTestId("weather-card").evaluate(el => getComputedStyle(el).animationName), "none");
  await page.getByRole("button", { name: "Add wind" }).click();
  assert.equal(await page.getByTestId("wind-panel").evaluate(el => getComputedStyle(el).animationName), "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Quiet mode", exact: true }).click();
  assert.equal(await page.getByTestId("weather-card").evaluate(el => getComputedStyle(el).animationName), "none");
  checks.push("Pointer drag; seven viewport base/wind/source checks; reduced motion and quiet mode passed");
  assert.deepEqual(errors, []);
  if (native) {
    await page.setViewportSize({ width: 960, height: 760 });
    await page.getByRole("button", { name: "Dismiss" }).click();
    // Synthetic responses exercise UI trust states; successful baseline and retry use real Rust.
    const alternate = parseDemoMemory(markdown.replace("value: Celsius", "value: Fahrenheit") + '\n<img src="x" onerror="alert(1)">\n');
    const inject = async (milliseconds, failure) => page.evaluate(({ milliseconds, failure, alternate }) => {
      window.__weatherFetch ??= window.fetch;
      window.fetch = (url, options) => String(url).includes("ipc.localhost/get_demo_memory")
        ? new Promise(resolve => setTimeout(() => resolve(new Response(JSON.stringify(failure ? "synthetic_failure" : alternate), {
          headers: { "content-type": "application/json", "Tauri-Response": failure ? "error" : "ok" },
        })), milliseconds)) : window.__weatherFetch(url, options);
    }, { milliseconds, failure, alternate });
    const restore = () => page.evaluate(() => { window.fetch = window.__weatherFetch; delete window.__weatherFetch; });
    await inject(1200, true);
    await page.getByRole("button", { name: "Open EVA" }).click();
    await page.getByText("Loading preference…", { exact: true }).waitFor();
    await capture(page, "injected-loading");
    await page.getByText("Demo memory unavailable", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Preference used/ }).count(), 0);
    await capture(page, "injected-error");
    await restore(); await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("button", { name: "Preference used: Celsius" }).waitFor();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await inject(10, false);
    await page.getByRole("button", { name: "Open EVA" }).click();
    await page.getByRole("button", { name: "Preference used: Fahrenheit" }).click();
    assert.match(await page.locator(".temperature").innerText(), /72/);
    await page.getByText("View exact Markdown source").click();
    assert.equal(await page.locator("dialog pre").textContent(), alternate.markdown);
    assert.equal(await page.locator("dialog img").count(), 0, "Markdown is escaped text");
    await capture(page, "injected-fahrenheit-source");
    await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Dismiss" }).click();
    await inject(1500, false);
    await page.getByRole("button", { name: "Open EVA" }).click();
    await page.getByText("Loading preference…", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await restore(); await page.getByRole("button", { name: "Open EVA" }).click();
    await page.getByRole("button", { name: "Preference used: Celsius" }).waitFor();
    await delay(1700);
    assert.equal(await page.getByRole("button", { name: "Preference used: Fahrenheit" }).count(), 0);
    await page.getByRole("button", { name: "Dismiss" }).click();
    await inject(6500, false);
    await page.getByRole("button", { name: "Open EVA" }).click();
    await page.getByText("Demo memory unavailable", { exact: true }).waitFor();
    await delay(700);
    assert.equal(await page.getByRole("button", { name: /Preference used/ }).count(), 0);
    await restore(); await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByRole("button", { name: "Preference used: Celsius" }).waitFor();
    checks.push("Injected pending/error, real Rust retry, derived Fahrenheit, escaped Markdown, dismissal supersession, timeout and late-result rejection passed");
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests.filter(url => /^https?:/.test(url) && !["tauri.localhost", "ipc.localhost", "127.0.0.1:1420"].includes(new URL(url).host)), []);
  await close();
  if (native) {
    page = await launch();
    await page.getByRole("button", { name: "Open EVA" }).click();
    await page.getByRole("button", { name: "Preference used: Celsius" }).waitFor();
    await close(); checks.push("Standalone normal window close and relaunch passed");
  }
  await writeFile(join(output, "results.json"), JSON.stringify({ status: "passed", checks, errors, requests }, null, 2));
  console.log(JSON.stringify({ status: "passed", output, checks }, null, 2));
} catch (error) {
  await writeFile(join(output, "failure.txt"), error.stack); throw error;
} finally { await close(); }
