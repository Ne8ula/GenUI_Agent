// Additive R8 evidence. Uses the real host/Rust renderer, never reference media.
// node week4/app/scripts/capture-paris.mjs <new absolute output directory> [port]
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(app, 'package.json'));
const { chromium } = require('playwright');
const output = process.argv[2];
const port = Number(process.argv[3] || 1440);
if (!output || !path.isAbsolute(output)) throw new Error('New absolute output directory required');
await mkdir(output, { recursive: false });
const report = { viewport: { width: 1672, height: 941 }, dpr: 1, checks: [], captures: [], errors: [], blocked: [] };
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
const check = (name, ok) => report.checks.push({ name, ok: Boolean(ok) });
const url = (time, extra = '') => `http://127.0.0.1:${port}/?scene=paris-r8&fixture=1&seed=33&t=${time}&${extra}`;
async function monitor(context) {
  await context.route('**/*', async route => {
    const u = route.request().url();
    if (/\.(png|jpe?g|webp|avif|gif|mp4|webm|svg)(?:\?|$)/i.test(u) || u.includes('/docs/design/revisions/')) { report.blocked.push(u); await route.abort(); }
    else await route.continue();
  });
  context.on('page', p => p.on('pageerror', e => report.errors.push(e.message)));
}
try {
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
  await monitor(context);
  const page = await context.newPage();
  const ready = () => page.waitForSelector('canvas[data-ready="1"]', { timeout: 30000 });
  const data = () => page.locator('canvas').evaluate(c => ({ ...c.dataset }));
  for (const t of [0, 3500, 7000, 10500, 14000, 17500, 21000, 25500, 30000, 34000, 39000]) {
    await page.goto(url(t, 'clock=manual')); await ready();
    await page.evaluate(() => document.fonts.ready);
    const d = await data();
    check(`Rust scene at ${t}`, d.renderer === 'rust-wasm' && d.sceneId === 'scene:paris-r8-four-layer' && Number(d.timeMs) === t);
    await page.screenshot({ path: path.join(output, `frame-${String(t).padStart(5, '0')}.png`) });
    report.captures.push({ time: t, data: d });
  }
  await page.goto(url(30000, 'clock=manual&reduced=1')); await ready();
  const a = await page.locator('canvas').screenshot();
  await page.evaluate(() => window.__evaFixture.step(1000));
  const b = await page.locator('canvas').screenshot();
  check('Reduced pixels remain static', a.equals(b));
  await context.close();
  const live = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, recordVideo: { dir: output, size: report.viewport } });
  await monitor(live);
  const view = await live.newPage();
  await view.goto(url(0)); await view.waitForSelector('canvas[data-ready="1"]');
  // This is real elapsed-time playback, not a generated clip or frame interpolation.
  await view.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.timeMs) >= 41000, undefined, { timeout: 65000 });
  await view.keyboard.press('Escape');
  const paused = await view.locator('canvas').evaluate(c => Number(c.dataset.timeMs));
  await view.waitForTimeout(200);
  check('Escape pauses real playback', paused === await view.locator('canvas').evaluate(c => Number(c.dataset.timeMs)));
  report.liveEnd = await view.locator('canvas').evaluate(c => ({ ...c.dataset }));
  const video = view.video();
  await live.close();
  await video.saveAs(path.join(output, 'four-layers-and-idle.webm'));
  check('No scene image/video requests', report.blocked.length === 0);
} catch (error) { report.errors.push(error.stack || String(error)); }
finally { await browser.close(); }
report.ok = report.errors.length === 0 && report.checks.every(c => c.ok);
await writeFile(path.join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
