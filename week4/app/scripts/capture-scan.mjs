import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const out = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Provide a new empty evidence directory');
await fs.mkdir(out, { recursive: true });
if ((await fs.readdir(out)).length) throw new Error('Evidence directory must be empty');
const base = process.argv[3] ?? 'http://127.0.0.1:1440';
const report = { base, viewport: [2560, 1440], dpr: 1, checks: [], errors: [], failedRequests: [], requests: [], stats: null, timing: null };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const check = (name, condition) => { report.checks.push({ name, passed: Boolean(condition) }); assert.ok(condition, name); };
page.on('pageerror', e => report.errors.push(e.message));
page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) report.failedRequests.push([r.status(), r.url()]); });
page.on('request', r => report.requests.push(r.url()));
const ready = () => page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');
const pixels = () => page.evaluate(() => document.querySelector('canvas').toDataURL());
const hash = s => createHash('sha256').update(s).digest('hex');
async function shot(name) {
  await page.evaluate(() => document.querySelector('.scan-app').classList.add('scan-capture'));
  await page.screenshot({ path: path.join(out, name + '.png') });
  await page.evaluate(() => document.querySelector('.scan-app').classList.remove('scan-capture'));
}
try {
  await page.goto(`${base}/?scene=paris-scan`); await ready();
  report.stats = await page.evaluate(() => window.__evaScan.stats());
  check('QHD framebuffer', report.stats.width === 2560 && report.stats.height === 1440);
  check('bounded geometry without image textures', report.stats.points === 109593 && report.stats.calls === 1 && report.stats.textures === 0 && report.stats.geometries === 1);
  const start = hash(await pixels()); await shot('composite-qhd');
  const modes = ['Point cloud', 'Gaussian splats', 'Ordered dither', 'Edges']; const hashes = [start];
  for (const mode of modes) {
    await page.getByLabel('Representation').selectOption(mode);
    await page.waitForTimeout(100);
    hashes.push(hash(await pixels()));
    await shot(mode.toLowerCase().replaceAll(' ', '-'));
  }
  check('four distinct material families and composite', new Set(hashes).size === 5);
  await page.getByLabel('Representation').selectOption('Composite');
  await page.waitForTimeout(100);
  check('mode return preserves exact samples', hash(await pixels()) === start);
  await page.getByLabel('Density', { exact: true }).fill('0.4');
  await page.waitForTimeout(100);
  check('density changes coverage', hash(await pixels()) !== start);
  await page.getByLabel('Density', { exact: true }).fill('1');
  await page.getByLabel('Local scatter').fill('1');
  await page.getByRole('button', { name: 'Animate samples' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  const paused = await page.evaluate(() => window.__evaScan.stats().time);
  await page.waitForTimeout(200);
  check('Escape stops clock', paused > 0 && (await page.evaluate(() => window.__evaScan.stats().time)) === paused);
  await page.evaluate(() => window.__evaScan.seek(3)); const at3 = hash(await pixels());
  await page.evaluate(() => window.__evaScan.seek(8)); const at8 = hash(await pixels());
  await shot('scatter-08s');
  await page.evaluate(() => window.__evaScan.seek(3));
  check('seek is deterministic and samples move', hash(await pixels()) === at3 && at3 !== at8);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  check('reset returns source anchors', hash(await pixels()) === start);
  await page.getByLabel('Less motion').check();
  await page.evaluate(() => window.__evaScan.seek(12));
  check('reduced motion is static', hash(await pixels()) === start && await page.getByRole('button', { name: 'Animate samples' }).isDisabled());
  await page.getByLabel('Less motion').uncheck();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.screenshot({ path: path.join(out, 'controls-qhd.png') });
  await page.getByLabel('Representation').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  check('keyboard representation selection', await page.getByLabel('Representation').inputValue() === 'Point cloud');
  await page.getByLabel('Representation').selectOption('Composite');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(150);
  check('narrow viewport has no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(out, 'narrow.png') });
  await page.setViewportSize({ width: 2560, height: 1440 }); await page.waitForTimeout(150);
  check('resize restores projection', hash(await pixels()) === start);
  report.timing = await page.evaluate(async () => {
    const times = [];
    for (let i = 0; i < 90; i++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const t = performance.now(); window.__evaScan.seek(i / 30); times.push(performance.now() - t);
    }
    times.sort((a,b) => a-b);
    return { frames: times.length, cpuSubmissionMedianMs: times[45], cpuSubmissionP95Ms: times[85], note: 'CPU submission only, not GPU frame time or guaranteed FPS' };
  });
  await page.evaluate(() => document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('alert').waitFor();
  check('context loss stops explicitly', (await page.getByRole('alert').innerText()).includes('context lost'));
  check('context loss clears fixture handle', await page.evaluate(() => window.__evaScan === undefined));
  await page.getByRole('button', { name: 'Retry', exact: true }).click(); await ready();
  check('retry recovers with bounded geometry', (await page.evaluate(() => window.__evaScan.stats())).geometries === 1);
  check('no scene image, video or external request', report.requests.every(url => new URL(url).origin === new URL(base).origin && !/\.(png|jpe?g|webp|mp4|webm)(\?|$)/i.test(url)));
  check('normal run has no page/resource failure', report.errors.length === 0 && report.failedRequests.length === 0);

  const missing = await context.newPage();
  await missing.route('**/assets/paris-scan-r12/points.bin', r => r.fulfill({ status: 404, body: 'missing' }));
  await missing.goto(`${base}/?scene=paris-scan`); await missing.getByRole('alert').waitFor();
  check('missing asset fails closed', (await missing.getByRole('alert').innerText()).includes('download failed'));
  await missing.close();
  const unsupported = await context.newPage();
  await unsupported.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
  });
  await unsupported.goto(`${base}/?scene=paris-scan`); await unsupported.getByRole('alert').waitFor();
  check('no WebGL2 fails closed', (await unsupported.getByRole('alert').innerText()).includes('WebGL2 unavailable'));
  await unsupported.close();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__evaScan?.stats().reduced === true);
  check('system reduced motion honored', await page.getByRole('button', { name: 'Animate samples' }).isDisabled());
  await page.close(); await context.close();
  const recording = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1,
    recordVideo: { dir: path.join(out, 'recording'), size: { width: 2560, height: 1440 } } });
  const movie = await recording.newPage();
  await movie.goto(`${base}/?scene=paris-scan`);
  await movie.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');
  await movie.getByLabel('Local scatter').fill('1');
  await movie.getByRole('button', { name: 'Animate samples' }).click();
  await movie.evaluate(() => document.querySelector('.scan-app').classList.add('scan-capture'));
  await movie.waitForTimeout(6000);
  await movie.keyboard.press('Escape');
  await movie.waitForTimeout(250);
  const video = movie.video();
  await recording.close();
  await video.saveAs(path.join(out, 'scan-local-scatter.webm'));
  report.recording = 'scan-local-scatter.webm';
} catch (error) {
  report.failure = error.stack; process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, stats: report.stats, timing: report.timing, failure: report.failure }, null, 2));
}
