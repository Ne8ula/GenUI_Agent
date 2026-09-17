import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const output = resolve(process.argv[2]);
const before = process.argv.includes("--before");
await mkdir(output, { recursive: false });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 760 }, reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:1420");
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await page.getByText("Browser fixture ready", { exact: true }).waitFor();
  for (const [width, height] of [[960, 760], [1960, 530], [1280, 530], [960, 530], [400, 640]]) {
    await page.setViewportSize({ width, height });
    const metrics = await page.evaluate(() => {
      const rect = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, bottom: r.bottom };
      };
      return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        section: rect("section"), result: rect(".result"), footer: rect("footer"),
        focused: document.activeElement === document.querySelector("button") };
    });
    await page.screenshot({ path: join(output, `${width}x${height}.png`) });
    results.push(metrics);
    if (!before) {
      assert.ok(metrics.scrollWidth <= width, "No horizontal overflow");
      assert.ok(metrics.focused, "Resize preserves keyboard focus");
      await page.getByText("Browser fixture ready", { exact: true }).waitFor();
      if (width >= 760) assert.ok(metrics.footer.bottom <= height, `Footer and connection result fit ${width}x${height}`);
    }
  }
  if (!before) assert.ok(results[1].section.width > results[0].section.width, "Wide window expands the panel");
  await writeFile(join(output, "results.json"), JSON.stringify({ mode: before ? "before-capture" : "passed", results }, null, 2) + "\n");
  console.log(JSON.stringify({ mode: before ? "before-capture" : "passed", results }, null, 2));
} finally { await browser.close(); }
