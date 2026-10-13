// Extra actual browser states aligned to VB2 keyframes, and bounded fixture regression checks.
// Usage: node capture-extra.mjs <app directory> <new output directory> [port]
// Uses the app's installed Playwright and Vite; no injected rendering or postprocessed screenshots.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [appDir, outputDir, port = '1454'] = process.argv.slice(2);
if (!appDir || !outputDir) throw new Error('Supply absolute app and output directories');
const require = createRequire(path.join(path.resolve(appDir), 'package.json'));
const { chromium } = require('playwright');
const viteEntry = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
await mkdir(outputDir, { recursive: true });
if ((await readdir(outputDir)).length) throw new Error('Output directory must be empty; captures are immutable');
const server = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
const report = { checks: [], errors: [], resourceErrors: [], files: [], browser: null, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, note: 'Browser fixture only; no camera, native shell or pose input' };
const ensure = (name, ok, details) => { report.checks.push({ name, ok, details }); if (!ok) process.exitCode = 1; };
const base = `http://127.0.0.1:${port}`;
try {
  await new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => reject(new Error(`Vite startup timed out: ${log}`)), 30000);
    const onData = chunk => { log += chunk; if (log.includes('Local:')) { clearTimeout(timer); resolve(); } };
    server.stdout.on('data', onData); server.stderr.on('data', onData);
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Vite exited: ${code}: ${log}`)); });
  });
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) report.errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) report.resourceErrors.push({ url: r.url(), status: r.status() }); });
  page.on('requestfailed', r => report.errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  const url = opts => `${base}/?${new URLSearchParams({ fixture: '1', look: 'seed33', seed: '33', build: '12000', backend: 'webgl2', paused: '1', ...opts })}`;
  const ready = async () => { await page.waitForSelector('canvas[data-ready="1"]', { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(150); };
  const data = () => page.locator('canvas').evaluate(c => ({ ...c.dataset }));
  const screenshot = async file => { await page.screenshot({ path: path.join(outputDir, file) }); report.files.push(file); };
  for (const ms of [0, 1250, 2500, 3750, 4960, 7000, 8000, 8250, 8500, 10000, 18000]) {
    await page.goto(url({ capture: '1', t: String(12000 + ms) })); await ready();
    await screenshot(`idle-${String(ms).padStart(4, '0')}.png`);
    const d = await data();
    ensure(`idle +${ms} clock`, Math.abs(Number(d.timeMs) - (12000 + ms)) < 1, d);
  }
  await page.goto(url({ t: '14500' })); await ready();
  const paused = await data(); await page.waitForTimeout(350); const later = await data();
  ensure('pause holds both clocks', paused.timeMs === later.timeMs && paused.lifeMs === later.lifeMs, { before: paused, after: later });
  await page.getByRole('button', { name: /^Tiles:/ }).click();
  await page.waitForTimeout(120); const tilesOff = await data();
  await screenshot('tiles-off.png');
  ensure('tiles off', Number(tilesOff.tiles) === 0, tilesOff);
  await page.getByRole('button', { name: /^Tiles:/ }).click();
  await page.waitForTimeout(120); const tilesOn = await data();
  ensure('tiles restored', Number(tilesOn.tiles) > 0, tilesOn);
  await page.getByRole('button', { name: /^Reduced motion:/ }).click();
  await page.waitForTimeout(120); const reduced = await data();
  ensure('reduced toggle keeps clocks', reduced.timeMs === tilesOn.timeMs && reduced.lifeMs === tilesOn.lifeMs && reduced.reduced === '1', reduced);
  await screenshot('reduced-toggle.png');
  await page.getByLabel('Backend', { exact: true }).selectOption('canvas2d'); await ready();
  const fallback = await data();
  ensure('backend switch keeps clocks', fallback.timeMs === reduced.timeMs && fallback.lifeMs === reduced.lifeMs && fallback.backend === 'canvas2d', fallback);
  await screenshot('canvas2d-reduced.png');
  await page.getByLabel('Backend', { exact: true }).selectOption('webgl2'); await ready();
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(250);
  await screenshot('narrow-fixture.png');
  ensure('no narrow horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), await data());
  await page.goto(url({ capture: '1', t: '19000' })); await ready();
  await screenshot('narrow-moving-figure.png');
  await page.setViewportSize(report.viewport);
  await page.goto(url({ capture: '1', t: '12000', clock: 'manual' })); await ready();
  const manualBefore = await data();
  // The fixture API caps one step at 1000ms; advance within that public bound.
  await page.evaluate(() => { window.__evaFixture.step(1000); window.__evaFixture.step(250); }); await page.waitForTimeout(120);
  const manualAfter = await data();
  ensure('manual clock advances coherently', Number(manualAfter.timeMs) === 13250 && Number(manualAfter.lifeMs) === 13250, { before: manualBefore, after: manualAfter });
  ensure('no page errors', report.errors.length === 0, report.errors);
  ensure('no scene resource errors', report.resourceErrors.every(r => r.status === 404 && new URL(r.url).pathname === '/favicon.ico'), report.resourceErrors);
} catch (error) { report.errors.push(String(error)); process.exitCode = 1; }
finally {
  await browser?.close();
  server.kill('SIGTERM');
  report.ok = !process.exitCode && report.errors.length === 0;
  await writeFile(path.join(outputDir, 'checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, checks: report.checks.map(c => ({ name: c.name, ok: c.ok })), errors: report.errors }, null, 2));
}
