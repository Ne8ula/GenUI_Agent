// Browser evidence for the real Rust/WASM path. Never synthesizes scene pixels.
// node scripts/capture-rust.mjs <new absolute output directory> [port]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(app, 'package.json'));
const { chromium } = require('playwright');
const output = process.argv[2];
const port = Number(process.argv[3] || 1459);
const production = process.argv.includes('--production');
if (!output || !path.isAbsolute(output)) throw new Error('New absolute output directory required');
await mkdir(output, { recursive: false });
const report = { production, startedAt: new Date().toISOString(), viewport: { width: 1920, height: 1080 }, dpr: 1, checks: [], captures: [], requests: [], blocked: [], errors: [], performance: null };
const check = (name, ok, details) => { report.checks.push({ name, ok: Boolean(ok), details }); };
const server = spawn(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), ...(production ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite readiness timeout')), 60000);
    const consume = (data) => { if (data.toString().includes('Local:')) { clearTimeout(timer); resolve(); } };
    server.stdout.on('data', consume);server.stderr.on('data', consume);
    server.once('error', (error) => { clearTimeout(timer); reject(error); });
    server.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Vite exit ${code}`)); });
  });
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    window.__evaLightSamples = [];
    const allocate = WebGL2RenderingContext.prototype.renderbufferStorageMultisample;
    WebGL2RenderingContext.prototype.renderbufferStorageMultisample = function (...args) {
      allocate.apply(this, args);
      window.__evaLightSamples.push({ requested: args[1], actual: this.getRenderbufferParameter(this.RENDERBUFFER, this.RENDERBUFFER_SAMPLES) });
      if (window.__evaLightSamples.length > 16) window.__evaLightSamples.shift();
    };
  });
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (/\.(png|jpe?g|webp|avif|gif|mp4|webm|svg)(?:\?|$)/i.test(url) || /\/assets\/seed33\//.test(url) || /\/docs\/design\/revisions\//.test(url)) {
      report.blocked.push(url); await route.abort('blockedbyclient');
    } else await route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => report.errors.push(error.message));
  page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) (report.console ??= []).push(message.text()); });
  page.on('request', (request) => report.requests.push(request.url()));
  const url = (params) => `http://127.0.0.1:${port}/?fixture=1&look=seed33&seed=33&build=12000&${new URLSearchParams(params)}`;
  const data = () => page.locator('canvas[data-ready="1"]').evaluate((c) => ({ ...c.dataset }));
  const ready = async () => { await page.waitForSelector('canvas[data-ready="1"]', { timeout: 60000 }); await page.evaluate(() => document.fonts.ready); };
  for (const [name, time] of [['structure', 1800], ['base', 5700], ['detail', 9000], ['formed', 12000], ['late', 22000]]) {
    await page.goto(url({ capture: '1', clock: 'manual', t: String(time) }));
    await ready();
    const dataset = await data();
    await page.screenshot({ path: path.join(output, `${name}-${time}.png`) });
    const pixels = await page.evaluate(() => {
      const c = document.querySelector('canvas'); const gl = c.getContext('webgl2');
      const rgba = new Uint8Array(c.width * c.height * 4);gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      let light = 0, varied = 0;
      for (let i = 0; i < rgba.length; i += 4) { if (rgba[i] > 100) light++; if (rgba[i] > 25 || rgba[i + 1] > 20 || rgba[i + 2] > 20) varied++; }
      return { light, varied, total: c.width * c.height };
    });
    report.captures.push({ name, time, dataset, pixels });
    check(`${name}: actual Rust module/frame`, dataset.renderer === 'rust-wasm' && dataset.sceneId === 'scene:paris-1980s-terrace' && Number(dataset.timeMs) === time && Number(dataset.segments) > 0, dataset);
    check(`${name}: visible nonempty content with images blocked`, pixels.light > 1000 && pixels.varied > 10000, pixels);
  }
  report.lightSamples = await page.evaluate(() => window.__evaLightSamples);
  check('live scene target retains at least four-sample colour and depth antialiasing', report.lightSamples.length >= 2 && report.lightSamples.every((s) => s.requested === 4 && s.actual >= 4), report.lightSamples);
  await page.goto(url({ clock: 'manual', paused: '1', t: '18000' }));await ready();
  const before = await data();
  if (production) check('historical look explicitly unavailable in production', await page.locator('option[value="arrival"]').isDisabled());
  report.staticObjectInventory = await page.evaluate(() => window.__evaFixture.inventory());
  await page.getByRole('button', { name: 'Tiles: on', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.tiles === '0');
  const hidden = await data();
  check('tile visibility preserves clock', before.timeMs === hidden.timeMs && hidden.tiles === '0', hidden);
  await page.getByRole('button', { name: 'Tiles: off', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.tiles) === 22);
  await page.evaluate(() => window.__evaFixture.step(1000));
  check('manual stepping is exact', Number((await data()).timeMs) === 19000, await data());
  const reducedButton = page.getByRole('button', { name: 'Reduced motion: off', exact: true });
  await reducedButton.focus(); await reducedButton.press('Space');
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.reduced === '1');
  check('keyboard activation retains reduced-control focus', await page.getByRole('button', { name: 'Reduced motion: on', exact: true }).evaluate((e) => e === document.activeElement));
  await page.keyboard.press('Tab');
  check('tab reaches the next enabled control', await page.getByLabel('Density', { exact: true }).evaluate((e) => e === document.activeElement));
  const reducedA = await page.locator('canvas').screenshot({ path: path.join(output, 'reduced-19000.png') });
  await page.evaluate(() => window.__evaFixture.step(1000));
  const reducedB = await page.locator('canvas').screenshot({ path: path.join(output, 'reduced-20000.png') });
  check('reduced pixels invariant across time', reducedA.equals(reducedB));
  await page.getByLabel('Backend', { exact: true }).selectOption('canvas2d');
  await page.getByRole('alert').waitFor();
  check('unsupported backend fails closed', !(await page.locator('canvas[data-ready="1"]').count()) && (await page.getByRole('alert').innerText()).includes('no raster fallback'));
  await page.getByLabel('Backend', { exact: true }).selectOption('webgl2');await ready();
  check('backend remount preserves clock', Number((await data()).timeMs) === 20000, await data());
  await page.evaluate(() => window.__evaFixture.loseContext());
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.degraded === '1');
  check('context loss clears readiness', !(await page.locator('canvas[data-ready="1"]').count()));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__evaFixture.restoreContext());await ready();
  check('context restored at same time', Number((await data()).timeMs) === 20000, await data());
  const concurrent = await page.evaluate(() => Promise.allSettled([window.__evaFixture.step(0), window.__evaFixture.step(0)]).then((r) => r.map((x) => x.status)));
  check('manual queue is explicitly bounded', concurrent[0] === 'fulfilled' && concurrent[1] === 'rejected', concurrent);
  const interrupted = await page.evaluate(async () => {
    const pending = window.__evaFixture.step(500);
    window.__evaFixture.loseContext();
    return await pending.then(() => 'fulfilled', () => 'rejected');
  });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.degraded === '1');
  check('lost-context manual step rejects instead of hanging', interrupted === 'rejected', interrupted);
  await page.waitForTimeout(300);await page.evaluate(() => window.__evaFixture.restoreContext());await ready();
  check('undrawn manual step does not consume time', Number((await data()).timeMs) === 20000, await data());
  await page.locator('canvas').screenshot({ path: path.join(output, 'restored-reduced.png') });
  await page.setViewportSize({ width: 390, height: 844 });await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, 'narrow-controls.png') });
  check('narrow page does not overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  report.denialProbeUrl = `http://127.0.0.1:${port}/assets/seed33/background.png`;
  const probe = await page.evaluate((source) => fetch(source).then(() => 'unexpected access', () => 'blocked'), report.denialProbeUrl);
  check('historical image denial actively enforced', probe === 'blocked' && report.blocked.includes(report.denialProbeUrl), { probe, url: report.denialProbeUrl });
  await page.evaluate(() => {
    const original = WebGL2RenderingContext.prototype.createBuffer;
    WebGL2RenderingContext.prototype.createBuffer = function () { return window.__denyRestoredBuffer ? null : original.call(this); };
    window.__evaFixture.loseContext();
  });
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.degraded === '1');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__denyRestoredBuffer = true; window.__evaFixture.restoreContext(); });
  await page.getByRole('alert').filter({ hasText: 'buffer allocation failed' }).waitFor({ timeout: 15000 });
  check('restoration allocation failure is reported without a freed-pointer exception', !(await page.locator('canvas[data-ready="1"]').count()), await page.getByRole('alert').innerText());
  await context.close();
  for (const failure of ['wasm', 'gpu', 'light', 'light-samples', 'light-framebuffer', 'renderbuffer-1', 'renderbuffer-2', 'framebuffer-1', 'framebuffer-2']) {
    const denied = await browser.newContext({ viewport: report.viewport });
    if (failure === 'wasm') await denied.route(/\.wasm(?:\?|$)/, (route) => route.abort('blockedbyclient'));
    else if (failure === 'light') await denied.addInitScript(() => {
      WebGL2RenderingContext.prototype.createTexture = () => null;
    });
    else if (/^(renderbuffer|framebuffer)-[12]$/.test(failure)) await denied.addInitScript((mode) => {
      const [kind, nth] = mode.split('-');
      const method = kind === 'renderbuffer' ? 'createRenderbuffer' : 'createFramebuffer';
      const allocate = WebGL2RenderingContext.prototype[method];
      let count = 0;
      WebGL2RenderingContext.prototype[method] = function () {
        return ++count === Number(nth) ? null : allocate.call(this);
      };
    }, failure);
    else if (failure === 'light-framebuffer') await denied.addInitScript(() => {
      WebGL2RenderingContext.prototype.checkFramebufferStatus = function () { return this.FRAMEBUFFER_UNSUPPORTED; };
    });
    else if (failure === 'light-samples') await denied.addInitScript(() => {
      const parameter = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (name) { return name === this.MAX_SAMPLES ? 2 : parameter.call(this, name); };
    });
    else await denied.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return type === 'webgl2' ? null : original.call(this, type, ...args); };
    });
    const failPage = await denied.newPage();
    await failPage.goto(url({ t: '12000', paused: '1' }));
    await failPage.getByRole('alert').waitFor({ timeout: 15000 });
    const failureText = await failPage.getByRole('alert').innerText();
    const expectedAllocation = { 'renderbuffer-1': 'live light colour allocation failed', 'renderbuffer-2': 'live light depth allocation failed', 'framebuffer-1': 'live light framebuffer allocation failed', 'framebuffer-2': 'live light resolve allocation failed' }[failure];
    check(`${failure} failure has no ready canvas or fallback`, !(await failPage.locator('canvas[data-ready="1"]').count()) && (!expectedAllocation || failureText.includes(expectedAllocation)), failureText);
    await denied.close();
  }
  const realtime = await browser.newContext({ viewport: report.viewport });
  const livePage = await realtime.newPage();
  await livePage.goto(url({ t: '12000', paused: '1' }));
  await livePage.waitForSelector('canvas[data-ready="1"]');
  const time = () => livePage.locator('canvas').evaluate((c) => Number(c.dataset.timeMs));
  const pausedAt = await time();await livePage.waitForTimeout(300);
  check('real pause holds time', (await time()) === pausedAt);
  await livePage.getByRole('button', { name: 'Resume', exact: true }).click();
  const samples = await livePage.evaluate(async () => {
    const results = [];let last = '';const start = performance.now();
    return await new Promise((resolve) => {
      function collect(now) {
        const d = document.querySelector('canvas')?.dataset;
        if (d?.ready === '1' && d.gpuFrames !== last) { last = d.gpuFrames; results.push({ frameMs: Number(d.frameMs), submitMs: Number(d.drawMs), timeMs: Number(d.timeMs), memory: Number(d.wasmBytes), buffer: Number(d.cpuBufferBytes), uploadedBytes: Number(d.uploadedBytes), gpuAllocatedBytes: Number(d.gpuAllocatedBytes), renderTargetBytes: Number(d.renderTargetBytes), widthPx: Number(d.widthPx), heightPx: Number(d.heightPx) }); }
        if (now - start >= 6000) resolve({ elapsedMs: now - start, samples: results }); else requestAnimationFrame(collect);
      }
      requestAnimationFrame(collect);
    });
  });
  const quantile = (key, q) => { const a = samples.samples.map((s) => s[key]).sort((a,b) => a-b);return a[Math.floor((a.length-1)*q)]; };
  report.performance = { ...samples, label: 'Actual real-time browser RAF intervals and Rust generation/submission CPU wall time; not GPU duration', frameMedianMs: quantile('frameMs',0.5), frameP95Ms: quantile('frameMs',0.95), submitMedianMs: quantile('submitMs',0.5), submitP95Ms: quantile('submitMs',0.95) };
  check('real resume advances time', (await time()) > pausedAt + 1000);
  check('WASM memory remains bounded', samples.samples.every((s) => s.memory <= 64*1024*1024));
  const fullFrameBytes = Number(report.captures.find((c) => c.name === 'formed').dataset.vertices) * 48;
  check('settled GPU uploads exclude cached static geometry', quantile('uploadedBytes',0.5) < fullFrameBytes * 0.6, { medianUploadedBytes: quantile('uploadedBytes',0.5), fullFrameBytes });
  check('requested vertex-buffer storage remains bounded', samples.samples.every((s) => s.gpuAllocatedBytes <= 4*240000*48));
  check('live-output target storage matches bounded dimensions', samples.samples.every((s) => s.renderTargetBytes === s.widthPx*s.heightPx*36 && s.renderTargetBytes <= 8_388_608*36));
  await livePage.getByRole('button', { name: 'Pause', exact: true }).click();
  const stoppedAt = await time();await livePage.waitForTimeout(300);check('pause stops again', (await time()) === stoppedAt);
  const memories = [];
  for (let i=0;i<8;i++) {
    const previousSeed = await livePage.locator('canvas').evaluate((c) => c.dataset.seed);
    await livePage.getByRole('button', { name: 'Reseed', exact: true }).click();
    await livePage.waitForFunction((old) => {const d=document.querySelector('canvas')?.dataset;return d?.ready==='1' && d.seed!==old;}, previousSeed);
    memories.push(await livePage.locator('canvas').evaluate((c) => Number(c.dataset.wasmBytes)));
  }
  check('reseed/remount memory bounded', memories.every((v) => v<=64*1024*1024), memories);
  await realtime.close();
  check('no runtime scene-image requests', report.blocked.every((u) => u === report.denialProbeUrl), report.blocked);
  check('WASM was actually requested', report.requests.some((u) => u.includes('.wasm')));
  check('no page errors', report.errors.length === 0, report.errors);
} catch (error) { report.errors.push(error.stack || String(error)); }
finally { await browser?.close(); server.kill(); }
report.finishedAt = new Date().toISOString();
report.ok = report.errors.length === 0 && report.checks.every((c) => c.ok);
await writeFile(path.join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ok: report.ok, checks: report.checks.length, failures: report.checks.filter((c) => !c.ok), errors: report.errors, output }, null, 2));
process.exitCode = report.ok ? 0 : 1;
