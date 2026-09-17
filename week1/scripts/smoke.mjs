import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { createServer } from "node:net";

// Development-only WebView2 instrumentation. No debugging port is configured in the app.
const browserMode = process.argv.includes("--browser");
const output = resolve(process.argv[process.argv.indexOf("--output") + 1] || "");
if (!process.argv.includes("--output")) throw new Error("Pass --output <new evidence directory>");
await mkdir(output, { recursive: false }); // Preserve every previous rendition.
const checks = [];
let browser;
let child;
let exited;
async function launchNative() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(9223, "127.0.0.1", () => probe.close(resolve));
  });
  const profile = await mkdtemp(join(tmpdir(), "eva-webview-smoke-"));
  const executable = resolve(process.env.EVA_SMOKE_EXE || "apps/desktop/src-tauri/target/debug/eva-desktop.exe");
  child = spawn(executable, [], {
    windowsHide: true,
    env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: profile,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9223 --remote-debugging-address=127.0.0.1" },
    stdio: "ignore",
  });
  exited = new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
  for (let n = 0; n < 60; n++) {
    try { browser = await chromium.connectOverCDP("http://127.0.0.1:9223", { timeout: 1000 }); break; }
    catch { if (child.exitCode !== null) throw new Error("Native app exited before WebView was ready"); await delay(500); }
  }
  assert.ok(browser, "WebView2 debugging connection became available");
  const nativeWindow = execFileSync("powershell.exe", ["-NoProfile", "-Command", `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Get-Process -Id ${child.pid}) | Select-Object MainWindowTitle,MainWindowHandle | ConvertTo-Json -Compress`], { encoding: "utf8", windowsHide: true }).trim();
  checks.push({ nativeWindow: JSON.parse(nativeWindow) });
  assert.ok(JSON.parse(nativeWindow).MainWindowHandle, "Native top-level window exists");
  return browser.contexts()[0].pages()[0] || await browser.contexts()[0].waitForEvent("page");
}
async function closeNative() {
  const sent = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${child.pid}).CloseMainWindow()`], { encoding: "utf8", windowsHide: true }).trim();
  assert.equal(sent, "True", "Normal window close request was sent");
  assert.equal(await Promise.race([exited, delay(10000).then(() => "timeout")]), 0, "Normal window close exits cleanly");
  await browser.close();
  browser = null;
  child = null;
}

try {
  let page;
  if (browserMode) {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    page = await browser.newPage({ viewport: { width: 960, height: 760 }, reducedMotion: "reduce" });
    await page.goto("http://127.0.0.1:1420");
  } else page = await launchNative();
  // Establish CDP viewport emulation before focusing: its first enable can reload WebView2.
  if (process.argv.includes("--resize")) await page.setViewportSize({ width: 960, height: 760 });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("heading", { name: "A window. A working connection." }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  checks.push({ viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })), url: page.url() });
  const button = page.getByRole("button", { name: browserMode ? "Check browser fixture" : "Check Rust connection" });
  await page.screenshot({ path: join(output, "idle.png") });
  await page.keyboard.press("Tab");
  assert.equal(await button.evaluate(el => el === document.activeElement), true);
  await page.screenshot({ path: join(output, "focus.png") });
  await page.keyboard.press("Enter");
  await page.getByText(browserMode ? "Browser fixture ready" : "Rust connection verified", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "success.png") });
  checks.push("Keyboard activation and runtime response passed");

  if (process.argv.includes("--memory")) {
    // Exercise the adapter as served by Vite, without adding a debug hook to the UI.
    assert.equal(new URL(page.url()).origin, "http://127.0.0.1:1420", "Memory adapter check requires development mode");
    const expectedMarkdown = await readFile(new URL("../fixtures/vault/preferences/weather-units.md", import.meta.url), "utf8");
    const lookup = await page.evaluate(async () => (await import("/src/memory.ts")).getDemoMemory());
    assert.equal(lookup.transport, browserMode ? "browser-fixture" : "tauri");
    assert.equal(lookup.record.markdown, expectedMarkdown);
    assert.equal(lookup.record.value, "Celsius");
    assert.equal(lookup.record.sourceReference, "fixtures/vault/preferences/weather-units.md");
    assert.equal(lookup.record.source, "synthetic-demo");
    const invalidId = await page.evaluate(async () => {
      try { await (await import("/src/memory.ts")).getDemoMemory("../private"); return "unexpected success"; }
      catch (error) { return error.message; }
    });
    assert.equal(invalidId, "Demo memory unavailable");
    if (!browserMode) {
      const rejected = await page.evaluate(async () => {
        const invoke = window.__TAURI_INTERNALS__.invoke;
        return Promise.all([
          { request: { recordId: "unknown" } },
          { request: { recordId: "weather-units", path: "private.md" } },
          { request: { recordId: "weather-units", permission: "admin" } },
          { request: {} },
        ].map(async args => {
          try { await invoke("get_demo_memory", args); return false; } catch { return true; }
        }));
      });
      assert.ok(rejected.every(Boolean));
      checks.push("Native memory command rejects unknown ID, path/authority fields and missing ID");
    }
    checks.push({ memoryLookup: lookup, invalidIdMessage: invalidId });
  }

  if (process.argv.includes("--resize")) {
    await page.locator(".overview").waitFor();
    const sizes = [];
    for (const [width, height] of [[1960, 530], [1280, 530], [960, 530], [400, 640], [960, 760]]) {
      await page.setViewportSize({ width, height });
      const geometry = await page.evaluate(() => ({
        width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        scrollWidth: document.documentElement.scrollWidth,
        footerBottom: document.querySelector("footer").getBoundingClientRect().bottom,
        focused: document.activeElement === document.querySelector("button"),
      }));
      assert.ok(geometry.scrollWidth <= width);
      assert.ok(geometry.focused);
      if (width >= 760) assert.ok(geometry.footerBottom <= height);
      await page.getByText(browserMode ? "Browser fixture ready" : "Rust connection verified", { exact: true }).waitFor();
      await page.screenshot({ path: join(output, `resize-${width}x${height}.png`) });
      sizes.push(geometry);
    }
    checks.push({ webviewViewportResize: sizes });
  }

  if (!browserMode) {
    const rejections = await page.evaluate(async () => {
      const invoke = window.__TAURI_INTERNALS__.invoke;
      const calls = [
        ["check_runtime", { request: { protocolVersion: 2 } }],
        ["check_runtime", { request: { protocolVersion: 1, permission: "admin" } }],
        ["check_runtime", { request: {} }],
        ["not_registered", {}],
        ["plugin:window|set_title", { label: "main", title: "Forbidden" }],
      ];
      return Promise.all(calls.map(async ([command, args]) => {
        try { await invoke(command, args); return { command, rejected: false }; }
        catch (error) { return { command, rejected: true, error: String(error) }; }
      }));
    });
    assert.ok(rejections.every(result => result.rejected));
    checks.push({ rejections });
    await page.evaluate(() => {
      window.__smokeOriginalFetch = window.fetch;
      window.fetch = (url, options) => String(url).includes("ipc.localhost/check_runtime")
        ? new Promise(resolve => setTimeout(() => resolve(new Response('"synthetic_failure"', { headers: { "content-type": "application/json", "Tauri-Response": "error" } })), 1500))
        : window.__smokeOriginalFetch(url, options);
    });
    await button.click();
    const pendingButton = page.getByRole("button", { name: "Checking…" });
    assert.equal(await pendingButton.isDisabled(), true);
    await page.screenshot({ path: join(output, "loading.png") });
    await page.getByText("Runtime check unavailable. Try again.").waitFor();
    await page.screenshot({ path: join(output, "error.png") });
    await page.evaluate(() => { window.fetch = window.__smokeOriginalFetch; delete window.__smokeOriginalFetch; });
    await button.click();
    await page.getByText("Rust connection verified", { exact: true }).waitFor();
    checks.push("Injected failure displays bounded error; retry reaches Rust again");
  } else {
    await page.setViewportSize({ width: 400, height: 640 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(output, "narrow-reduced-motion.png") });
    checks.push("400px browser viewport has no horizontal overflow; reduced motion enabled");
  }
  assert.deepEqual(errors, []);
  checks.push("No uncaught JavaScript errors during exercised interactions");
  if (!browserMode) {
    await closeNative();
    page = await launchNative();
    await page.getByRole("button", { name: "Check Rust connection" }).click();
    await page.getByText("Rust connection verified", { exact: true }).waitFor();
    await page.screenshot({ path: join(output, "relaunch.png") });
    await closeNative();
    checks.push("Normal native close, relaunch, second IPC response and second close passed");
  }
  await writeFile(join(output, "results.json"), JSON.stringify({ status: "passed", mode: browserMode ? "browser-fixture" : "native-webview2", checks }, null, 2) + "\n");
  console.log(JSON.stringify({ status: "passed", output, checks }, null, 2));
} catch (error) {
  await writeFile(join(output, "results.json"), JSON.stringify({ status: "failed", checks, error: error.message }, null, 2) + "\n");
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (child && child.exitCode === null) child.kill();
}
