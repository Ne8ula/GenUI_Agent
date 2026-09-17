import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

// Attach only to a development instance deliberately launched with CDP port 9224.
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: false });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9224");
try {
  const page = browser.contexts()[0].pages()[0];
  assert.equal(new URL(page.url()).origin, "http://127.0.0.1:1420");
  await page.getByRole("button", { name: "Check Rust connection" }).click();
  await page.getByText("Rust connection verified", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "success.png") });
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  await writeFile(join(output, "results.json"), JSON.stringify({ status: "passed", mode: "tauri-dev", url: page.url(), viewport, check: "Vite-backed native window returned real Rust response" }, null, 2) + "\n");
  console.log("Development window and Rust IPC passed");
} finally { await browser.close(); }
