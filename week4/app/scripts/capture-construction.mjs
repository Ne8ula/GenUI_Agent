// Focused Seed-33 construction capture and continuity checks.
// Usage: node capture-construction.mjs <absolute appDir> <new absolute outputDir> <port>
// The driver starts and stops only its own strict-port Vite process. It captures real browser output;
// it does not inject renderer code, replace screenshots, or synthesize evidence.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const [appDirArg, outputDirArg, portArg] = process.argv.slice(2);
if (!appDirArg || !outputDirArg || !portArg) {
  throw new Error('Usage: node capture-construction.mjs <absolute appDir> <new absolute outputDir> <port>');
}
if (!path.isAbsolute(appDirArg) || !path.isAbsolute(outputDirArg)) {
  throw new Error('appDir and outputDir must both be absolute paths');
}
if (!/^\d+$/.test(portArg) || Number(portArg) < 1024 || Number(portArg) > 65535) {
  throw new Error('port must be an integer in 1024..65535');
}

const appDir = path.resolve(appDirArg);
const outputDir = path.resolve(outputDirArg);
const port = Number(portArg);
await access(path.join(appDir, 'package.json'));
try {
  await mkdir(outputDir, { recursive: false });
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
    throw new Error(`outputDir already exists; construction captures are immutable: ${outputDir}`);
  }
  throw error;
}

const require = createRequire(path.join(appDir, 'package.json'));
const { chromium } = require('playwright');
const playwrightPackage = require.resolve('playwright/package.json');
const vitePackage = require.resolve('vite/package.json');
const viteEntry = path.join(path.dirname(vitePackage), 'bin', 'vite.js');
const VIEWPORT = { width: 1920, height: 1080 };
const NARROW_VIEWPORT = { width: 390, height: 844 };
const BUILD_MS = 12_000;
const SEED = 33;
const PROGRESSES = [0, 0.1, 0.25, 0.4, 0.52, 0.67, 0.8, 0.92, 0.999, 1];

const report = {
  schemaVersion: 1,
  startedAt: new Date().toISOString(),
  phase: 'Week4 Step1',
  fixture: { look: 'seed33', seed: SEED, buildMs: BUILD_MS },
  input: { appDir, outputDir, port },
  environment: {
    platform: process.platform,
    osRelease: os.release(),
    arch: os.arch(),
    node: process.version,
    playwright: JSON.parse(await readFile(playwrightPackage, 'utf8')).version,
    vite: JSON.parse(await readFile(vitePackage, 'utf8')).version,
    chromium: null,
  },
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  captures: [],
  checks: [],
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  resourceErrors: [],
  failures: [],
  server: { command: [process.execPath, viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], outputTail: '' },
  files: [],
  labels: {
    evidence: 'Playwright browser fixture only',
    native: false,
    camera: 'none',
    pose: 'none',
    timing: 'paused fixed host/life clock except the explicit manual-step check; no performance claim',
  },
  ok: false,
};

const check = (name, ok, details) => {
  const result = { name, ok: Boolean(ok), details };
  report.checks.push(result);
  if (!result.ok) report.failures.push(`${name}: ${JSON.stringify(details)}`);
  return result.ok;
};

let server = null;
let browser = null;
let stopping = null;
let interrupted = false;

async function stopOwnedServer() {
  if (stopping) return stopping;
  const child = server;
  server = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  stopping = (async () => {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
  })();
  return stopping;
}

async function shutdownForSignal(signal) {
  if (interrupted) return;
  interrupted = true;
  report.failures.push(`interrupted by ${signal}`);
  await browser?.close().catch(() => {});
  await stopOwnedServer().catch(() => {});
  process.exit(130);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void shutdownForSignal(signal));
process.once('exit', () => {
  if (server && server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
});

function startOwnedServer() {
  server = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: appDir,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error(`Vite startup timed out: ${output.slice(-1500)}`)), 60_000);
    const onData = (chunk) => {
      output += chunk.toString();
      report.server.outputTail = output.slice(-4000);
      // eslint-disable-next-line no-control-regex
      const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
      if (/Local:\s+http:\/\/127\.0\.0\.1:/i.test(plain)) finish(resolve, `http://127.0.0.1:${port}`);
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.once('error', (error) => finish(reject, error));
    server.once('exit', (code, signal) => finish(reject, new Error(`Vite exited before readiness (code ${code}, signal ${signal}): ${output.slice(-1500)}`)));
  });
}

function watchPage(page, scope) {
  page.on('pageerror', (error) => report.pageErrors.push({ scope, message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      report.consoleErrors.push({ scope, message: message.text() });
    }
  });
  page.on('requestfailed', (request) => report.requestFailures.push({ scope, url: request.url(), error: request.failure()?.errorText ?? null }));
  page.on('response', (response) => {
    if (response.status() >= 400) report.resourceErrors.push({ scope, url: response.url(), status: response.status() });
  });
}

const fixtureUrl = (base, options = {}) => {
  const params = new URLSearchParams({
    fixture: '1',
    look: 'seed33',
    seed: String(SEED),
    build: String(BUILD_MS),
    ...options,
  });
  return `${base}/?${params.toString()}`;
};

async function waitReady(page, label) {
  await page.waitForSelector('canvas[data-ready="1"]', { state: 'attached', timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const dataset = await page.locator('canvas[data-ready="1"]').evaluate((canvas) => ({ ...canvas.dataset }));
  check(`${label}: assets reported ready`, dataset.assetsReady !== '0', dataset);
  return dataset;
}

async function gotoFixture(page, base, options, label) {
  await page.goto(fixtureUrl(base, options), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  return waitReady(page, label);
}

async function readDataset(page) {
  return page.locator('canvas[data-ready="1"]').evaluate((canvas) => ({ ...canvas.dataset }));
}

async function screenshot(page, file, label, dataset, requested) {
  const png = await page.screenshot({ path: path.join(outputDir, file), type: 'png' });
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('canvas[data-ready="1"]');
    const rect = canvas?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      devicePixelRatio,
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      canvasCss: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      canvasBacking: canvas instanceof HTMLCanvasElement ? { width: canvas.width, height: canvas.height } : null,
    };
  });
  const dimensions = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const facts = { file, label, requested, dimensions, bytes: png.byteLength, layout, dataset };
  report.captures.push(facts);
  report.files.push({ name: file, bytes: png.byteLength, dimensions });
  return facts;
}

async function captureBackend(base, backend) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watchPage(page, `captures/${backend}`);
  try {
    for (const progress of PROGRESSES) {
      const timeMs = Math.round(BUILD_MS * progress);
      const percent = progress === 0.999 ? '099p9' : String(Math.round(progress * 100)).padStart(3, '0');
      const label = `${backend}/build-${percent}pct`;
      const dataset = await gotoFixture(page, base, { capture: '1', backend, paused: '1', t: String(timeMs) }, label);
      const file = `${backend}-seed33-build-${percent}pct.png`;
      await screenshot(page, file, label, dataset, { backend, progress, timeMs, reduced: false });
      check(`${label}: requested backend rendered`, dataset.backend === backend, { requested: backend, actual: dataset.backend, detail: dataset.detail });
      check(`${label}: paused host/life clocks match`, Number(dataset.timeMs) === timeMs && Math.abs(Number(dataset.lifeMs) - timeMs) <= 0.5, dataset);
      check(`${label}: fixed fixture identity`, dataset.look === 'seed33' && Number(dataset.seed) === SEED && Number(dataset.buildMs) === BUILD_MS, dataset);
    }

    const plusFiveMs = BUILD_MS + 5000;
    const plusLabel = `${backend}/complete-plus-5s`;
    const plusDataset = await gotoFixture(page, base, { capture: '1', backend, paused: '1', t: String(plusFiveMs) }, plusLabel);
    await screenshot(page, `${backend}-seed33-complete-plus-5s.png`, plusLabel, plusDataset, { backend, progress: 1, timeMs: plusFiveMs, reduced: false });
    check(`${plusLabel}: post-build clock is exact`, Number(plusDataset.timeMs) === plusFiveMs && Math.abs(Number(plusDataset.lifeMs) - plusFiveMs) <= 0.5, plusDataset);
    check(`${plusLabel}: requested backend rendered`, plusDataset.backend === backend, { requested: backend, actual: plusDataset.backend, detail: plusDataset.detail });

    const reducedTimeMs = Math.round(BUILD_MS * 0.52);
    const reducedLabel = `${backend}/reduced-midbuild`;
    const reducedDataset = await gotoFixture(page, base, { capture: '1', backend, paused: '1', reduced: '1', t: String(reducedTimeMs) }, reducedLabel);
    await screenshot(page, `${backend}-seed33-reduced-midbuild.png`, reducedLabel, reducedDataset, { backend, progress: 0.52, timeMs: reducedTimeMs, reduced: true });
    check(`${reducedLabel}: reduced state preserves requested time`, reducedDataset.reduced === '1' && Number(reducedDataset.timeMs) === reducedTimeMs && Math.abs(Number(reducedDataset.lifeMs) - reducedTimeMs) <= 0.5, reducedDataset);
    check(`${reducedLabel}: requested backend rendered`, reducedDataset.backend === backend, { requested: backend, actual: reducedDataset.backend, detail: reducedDataset.detail });
  } finally {
    await context.close();
  }
}

async function captureNarrowFixture(base) {
  const context = await browser.newContext({ viewport: NARROW_VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watchPage(page, 'narrow-fixture');
  try {
    const timeMs = Math.round(BUILD_MS * 0.52);
    const dataset = await gotoFixture(page, base, { backend: 'webgl2', paused: '1', t: String(timeMs) }, 'narrow-fixture');
    const facts = await screenshot(page, 'webgl2-seed33-narrow-fixture-midbuild.png', 'narrow-fixture', dataset, { backend: 'webgl2', progress: 0.52, timeMs, reduced: false });
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth, scrollHeight: document.documentElement.scrollHeight, innerHeight }));
    check('narrow fixture: screenshot has requested dimensions', facts.dimensions.width === NARROW_VIEWPORT.width && facts.dimensions.height === NARROW_VIEWPORT.height, facts.dimensions);
    check('narrow fixture: no horizontal page overflow', overflow.scrollWidth <= overflow.innerWidth, overflow);
  } finally {
    await context.close();
  }
}

async function checkControlContinuity(base) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watchPage(page, 'controls-continuity');
  try {
    const timeMs = Math.round(BUILD_MS * 0.8);
    const before = await gotoFixture(page, base, { backend: 'webgl2', paused: '1', t: String(timeMs) }, 'controls/before');
    await page.waitForTimeout(400);
    const pausedLater = await readDataset(page);
    check('pause continuity: host and life clocks hold', before.timeMs === pausedLater.timeMs && before.lifeMs === pausedLater.lifeMs, { before, after: pausedLater });

    await page.getByRole('button', { name: /^Reduced motion:/ }).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-ready="1"]')?.dataset.reduced === '1');
    const reduced = await readDataset(page);
    check('reduced continuity: toggling reduced motion preserves both clocks', reduced.timeMs === before.timeMs && reduced.lifeMs === before.lifeMs && reduced.reduced === '1', { before, after: reduced });

    await page.getByLabel('Backend', { exact: true }).selectOption('canvas2d');
    await page.waitForFunction(() => document.querySelector('canvas[data-ready="1"]')?.dataset.backend === 'canvas2d');
    await waitReady(page, 'controls/backend-canvas2d');
    const canvas = await readDataset(page);
    check('backend continuity: switch preserves host/life clocks and reduced state', canvas.timeMs === reduced.timeMs && canvas.lifeMs === reduced.lifeMs && canvas.reduced === '1' && canvas.backend === 'canvas2d', { before: reduced, after: canvas });

    const tilesButton = page.getByRole('button', { name: /^Tiles:/ });
    const tilesBefore = await readDataset(page);
    await tilesButton.click();
    await page.waitForFunction(() => document.querySelector('canvas[data-ready="1"]')?.dataset.tiles === '0');
    const tilesHidden = await readDataset(page);
    await tilesButton.click();
    await page.waitForFunction(() => Number(document.querySelector('canvas[data-ready="1"]')?.dataset.tiles ?? 0) > 0);
    const tilesRestored = await readDataset(page);
    check(
      'tile continuity: hide/restore preserves clocks and authored count',
      Number(tilesBefore.tiles) > 0 &&
        Number(tilesHidden.tiles) === 0 &&
        Number(tilesHidden.tilesAuthored) === Number(tilesBefore.tilesAuthored) &&
        Number(tilesRestored.tiles) === Number(tilesBefore.tiles) &&
        Number(tilesRestored.tilesAuthored) === Number(tilesBefore.tilesAuthored) &&
        tilesHidden.timeMs === tilesBefore.timeMs &&
        tilesHidden.lifeMs === tilesBefore.lifeMs &&
        tilesRestored.timeMs === tilesBefore.timeMs &&
        tilesRestored.lifeMs === tilesBefore.lifeMs,
      { before: tilesBefore, hidden: tilesHidden, restored: tilesRestored },
    );
  } finally {
    await context.close();
  }
}

async function checkManualClock(base) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watchPage(page, 'manual-clock');
  try {
    const startMs = Math.round(BUILD_MS * 0.4);
    const before = await gotoFixture(page, base, { capture: '1', backend: 'webgl2', clock: 'manual', t: String(startMs) }, 'manual-clock/before');
    const hooked = await page.evaluate(() => typeof window.__evaFixture?.step === 'function');
    check('manual clock: fixture hook is available', hooked, before);
    if (hooked) {
      await page.evaluate(async () => {
        await window.__evaFixture.step(1000);
        await window.__evaFixture.step(250);
      });
      const after = await readDataset(page);
      check('manual clock: bounded steps advance host and life together', Math.abs(Number(after.timeMs) - (startMs + 1250)) <= 0.5 && Math.abs(Number(after.lifeMs) - (startMs + 1250)) <= 0.5, { before, after, expectedMs: startMs + 1250 });
    }
  } finally {
    await context.close();
  }
}

try {
  const base = await startOwnedServer();
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  report.environment.chromium = browser.version();

  // Warm Vite and the async image cache without treating this load as evidence.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    watchPage(page, 'warmup');
    await gotoFixture(page, base, { capture: '1', backend: 'canvas2d', paused: '1', t: String(BUILD_MS) }, 'warmup');
    await context.close();
  }

  for (const backend of ['webgl2', 'canvas2d']) await captureBackend(base, backend);
  for (const progress of PROGRESSES) {
    const matches = report.captures.filter((capture) => capture.requested.progress === progress && !capture.requested.reduced && capture.requested.timeMs <= BUILD_MS);
    const gl = matches.find((capture) => capture.requested.backend === 'webgl2');
    const canvas = matches.find((capture) => capture.requested.backend === 'canvas2d');
    check(`backend tile-count parity at ${progress}`, Boolean(gl && canvas && gl.dataset.tiles === canvas.dataset.tiles && gl.dataset.tilesAuthored === canvas.dataset.tilesAuthored), { webgl2: gl?.dataset.tiles, canvas2d: canvas?.dataset.tiles });
  }
  await captureNarrowFixture(base);
  await checkControlContinuity(base);
  await checkManualClock(base);
} catch (error) {
  report.failures.push(`fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
} finally {
  await browser?.close().catch((error) => report.failures.push(`browser close: ${String(error)}`));
  browser = null;
  await stopOwnedServer().catch((error) => report.failures.push(`server cleanup: ${String(error)}`));
}

const allowedResourceError = (entry) => {
  try {
    return entry.status === 404 && new URL(entry.url).pathname === '/favicon.ico';
  } catch {
    return false;
  }
};
check('browser: no page exceptions', report.pageErrors.length === 0, report.pageErrors);
check('browser: no console errors', report.consoleErrors.length === 0, report.consoleErrors);
check('browser: no failed requests', report.requestFailures.length === 0, report.requestFailures);
check('browser: no scene resource errors', report.resourceErrors.every(allowedResourceError), report.resourceErrors);

for (const file of report.files) {
  const facts = await stat(path.join(outputDir, file.name));
  check(`file exists: ${file.name}`, facts.isFile() && facts.size === file.bytes && facts.size > 0, { expectedBytes: file.bytes, actualBytes: facts.size });
}
report.finishedAt = new Date().toISOString();
report.ok = report.failures.length === 0;
await writeFile(path.join(outputDir, 'checks.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ok: report.ok, outputDir, captures: report.captures.length, checks: report.checks.map(({ name, ok }) => ({ name, ok })), failures: report.failures }, null, 2));
process.exitCode = report.ok ? 0 : 1;
