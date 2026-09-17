import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const out = resolve(process.argv[2]); await mkdir(out, { recursive: false });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
try {
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("http://127.0.0.1:1420"); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(1000);
  const gpu = await page.locator("canvas").evaluate(canvas => { const gl = canvas.getContext("webgl"); const ext = gl?.getExtension("WEBGL_debug_renderer_info"); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable", width: canvas.width, height: canvas.height }; });
  await page.screenshot({ path: join(out, "eye.png"), fullPage: true });
  await page.getByRole("button", { name: "Weather", exact: false }).first().click();
  await page.waitForTimeout(300); await page.screenshot({ path: join(out, "assembling.png"), fullPage: true });
  await page.waitForTimeout(1000); await page.screenshot({ path: join(out, "weather.png"), fullPage: true });
  await page.getByRole("button", { name: "Add wind" }).click(); await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, "wind.png"), fullPage: true });
  await writeFile(join(out, "results.json"), JSON.stringify({ gpu, errors }, null, 2)); console.log({ gpu, errors });
} finally { await browser.close(); }
