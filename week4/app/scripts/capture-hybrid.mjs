// Browser evidence for the static hybrid checkpoint, with a native-resolution source comparison.
// node week4/app/scripts/capture-hybrid.mjs <new absolute output directory> [port]
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(app, 'package.json'))('playwright');
const output = process.argv[2], port = Number(process.argv[3] || 1440);
if (!output || !path.isAbsolute(output)) throw new Error('New absolute output directory required');
await mkdir(output, { recursive: false });
const report = { checks: [], errors: [], requests: [], captures: [], pixelComparison: null };
const check = (name, ok, details) => report.checks.push({ name, ok: Boolean(ok), details });
const url = `http://127.0.0.1:${port}/?scene=paris-hybrid`;
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 848, height: 430 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('request', r => report.requests.push(r.url()));
  await page.goto(`${url}&capture=1`);
  await page.waitForSelector('canvas[data-ready="1"]');
  const data = await page.locator('canvas').evaluate(c => ({ ...c.dataset }));
  check('Ten real GPU layer draws; no new effects', data.renderer === 'three-webgl2' && data.layerCount === '10' && data.drawCalls === '10' && data.effects === 'none', data);
  check('GPU view does not load the flattened master or Rust WASM', !report.requests.some(u => /paris-clean\.png|\.wasm|\.mp4|\.webm/.test(u)), [...report.requests]);
  await page.screenshot({ path: path.join(output, 'gpu-native-848x430.png') });
  // Canvas2D is used ONLY by this test to decode reference pixels, never as a runtime renderer/fallback.
  report.pixelComparison = await page.evaluate(async () => {
    const image = await createImageBitmap(await (await fetch('/assets/paris-hybrid-r11/paris-clean.png')).blob());
    const reference = new OffscreenCanvas(image.width, image.height);
    const ctx = reference.getContext('2d'); ctx.drawImage(image, 0, 0); image.close();
    const expected = ctx.getImageData(0, 0, 848, 430).data;
    const canvas = document.querySelector('canvas'), gl = canvas.getContext('webgl2');
    const actual = new Uint8Array(848 * 430 * 4); gl.readPixels(0, 0, 848, 430, gl.RGBA, gl.UNSIGNED_BYTE, actual);
    let total = 0, contentError = 0, content = 0, withinTwo = 0, max = 0;
    for (let y = 0; y < 430; y++) for (let x = 0; x < 848; x++) {
      const r = (y * 848 + x) * 4, g = ((429 - y) * 848 + x) * 4;
      const isContent = Math.max(expected[r], expected[r+1], expected[r+2]) > 8;
      let worst = 0;
      for (let c = 0; c < 3; c++) { const d = Math.abs(expected[r+c] - actual[g+c]); total += d; worst = Math.max(worst, d); if (isContent) contentError += d; }
      if (isContent) content++; if (worst <= 2) withinTwo++; max = Math.max(max, worst);
    }
    return { width: 848, height: 430, meanAbsoluteRgbError: total / (848*430*3), contentMeanAbsoluteRgbError: contentError / (content*3), pixelsWithinTwo: withinTwo / (848*430), maxChannelError: max, note: '8-bit RGB channel differences, source-sized actual GPU framebuffer; not a perceptual or artistic quality score' };
  });
  check('Native source match: mean RGB error below 1/255', report.pixelComparison.meanAbsoluteRgbError < 1, report.pixelComparison);
  await page.setViewportSize({ width: 1696, height: 860 });
  await page.waitForFunction(() => document.querySelector('canvas')?.width === 1696);
  await page.screenshot({ path: path.join(output, 'gpu-1696x860.png') });
  await page.goto(url); await page.waitForSelector('canvas[data-ready="1"]');
  await page.getByLabel('Cutout', { exact: true }).selectOption('figure_woman');
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.drawCalls === '1');
  check('Cutout isolation draws one GPU layer', await page.locator('canvas').evaluate(c => c.dataset.visibleLayers === '1'));
  await page.getByRole('button', { name: 'Original source', exact: true }).click();
  await page.locator('img.hybrid-reference').waitFor();
  check('Original comparison is explicitly selected', await page.getByRole('button', { name: 'Original source', exact: true }).getAttribute('aria-pressed') === 'true');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.drawCalls === '10');
  check('Escape restores full GPU view', await page.locator('img.hybrid-reference').count() === 0);
  await page.screenshot({ path: path.join(output, 'controls-1696x860.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('canvas')?.width === 390);
  check('Narrow viewport does not overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, 'narrow-390x844.png') });
  await page.evaluate(() => document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('alert').waitFor();
  check('Context loss reports failure without image fallback', await page.locator('canvas[data-ready="1"], img.hybrid-reference').count() === 0);
  await page.getByRole('button', { name: 'Retry GPU', exact: true }).click();
  await page.waitForSelector('canvas[data-ready="1"]');
  check('Retry restores all ten layers', await page.locator('canvas').evaluate(c => c.dataset.drawCalls === '10'));
  await context.close();
  for (const mode of ['missing-layer', 'no-webgl']) {
    const failed = await browser.newContext();
    if (mode === 'missing-layer') await failed.route('**/layers/cafe.png', route => route.abort());
    else await failed.addInitScript(() => { const get = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : get.call(this, type, ...args); }; });
    const p = await failed.newPage(); await p.goto(url); await p.getByRole('alert').waitFor();
    check(`${mode} fails closed`, await p.locator('canvas[data-ready="1"], img.hybrid-reference').count() === 0, await p.getByRole('alert').innerText());
    await failed.close();
  }
} catch (error) { report.errors.push(error.stack || String(error)); }
finally { await browser.close(); }
report.ok = report.errors.length === 0 && report.checks.every(c => c.ok);
await writeFile(path.join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ok: report.ok, checks: report.checks.length, failures: report.checks.filter(c => !c.ok), errors: report.errors, pixelComparison: report.pixelComparison }, null, 2));
process.exitCode = report.ok ? 0 : 1;
