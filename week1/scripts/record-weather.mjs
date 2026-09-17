import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Readable browser-fallback recording; native IPC evidence is captured separately.
const output = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Pass a new evidence directory");
await mkdir(output, { recursive: false });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, recordVideo: { dir: output, size: { width: 1280, height: 1000 } } });
const page = await context.newPage();
try {
  await page.goto("http://127.0.0.1:1420");
  await page.evaluate(() => document.fonts.ready);
  await delay(1500);
  await page.getByRole("button", { name: "Open EVA" }).click();
  await page.getByRole("button", { name: "Preference used: Celsius" }).waitFor();
  await delay(2000);
  await page.screenshot({ path: join(output, "base-viewport.png") });
  const handle = await page.getByRole("button", { name: "Move weather card" }).boundingBox();
  await page.mouse.move(handle.x + 20, handle.y + 15); await page.mouse.down();
  await page.mouse.move(handle.x + 54, handle.y + 39, { steps: 24 }); await page.mouse.up();
  await delay(1500);
  await page.getByRole("button", { name: "Add wind" }).click();
  await delay(2500);
  await page.screenshot({ path: join(output, "wind-viewport.png") });
  await page.getByRole("button", { name: "Preference used: Celsius" }).click();
  await delay(2000);
  await page.getByText("View exact Markdown source").click();
  await page.locator("dialog pre").scrollIntoViewIfNeeded();
  await delay(3000);
  await page.screenshot({ path: join(output, "source-viewport.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await delay(2000);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await delay(1500);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await delay(1500);
  await writeFile(join(output, "recording.json"), JSON.stringify({ mode: "browser-fixture", viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, sequence: "open, move, wind, exact source, undo, reset, dismiss", browser: browser.version(), motion: "no-preference" }, null, 2));
  await page.close();
  await page.video().saveAs(join(output, "weather-demo.webm"));
} finally { await context.close(); await browser.close(); }
