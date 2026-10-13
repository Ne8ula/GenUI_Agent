// Capture fixed post-formation states in the real app; starts/stops only its own strict-port server.
// node capture-formed-glitch.mjs <absolute appDir> <new absolute outputDir> <port>
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [appDir, out, port] = process.argv.slice(2);
if (!path.isAbsolute(appDir ?? '') || !path.isAbsolute(out ?? '') || !/^\d+$/.test(port ?? '')) throw new Error('Expected absolute appDir/outputDir and port');
await mkdir(out); // New immutable evidence only; never overwrite a previous run.
const require = createRequire(path.join(appDir, 'package.json'));
const { chromium } = require('playwright');
const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const report = { startedAt: new Date().toISOString(), viewport: { width: 1920, height: 1080 }, dpr: 1, captures: [], errors: [], checks: [], ok: false };
const server = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', port, '--strictPort'], { cwd: appDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let browser;
const check = (name, ok, details = {}) => { report.checks.push({ name, ok, details }); if (!ok) report.errors.push(name); };
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite readiness timeout')), 60000);
    const read = data => { if (/Local:\s+http:\/\/127\.0\.0\.1:/.test(data.toString().replace(/\u001b\[[0-9;]*m/g, ''))) { clearTimeout(timer); resolve(); } };
    server.stdout.on('data', read);
    server.stderr.on('data', read);
    server.once('error', e => { clearTimeout(timer); reject(e); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Vite exited: ${code}`)); });
  });
  browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  report.browser = browser.version();
  const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('requestfailed', r => report.errors.push(`request failed: ${r.url()}`));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) report.errors.push(m.text()); });
  const cases = [
    ...[12000, 12300, 12600, 13000, 13300, 13600, 14000, 14300, 14600, 15000, 15300, 15600, 16000, 16300, 16600, 17000, 17300, 17600, 18000].map(t => ({ t, mode: 'normal' })),
    { t: 17000, mode: 'tiles-off' }, { t: 17000, mode: 'reduced' }, { t: 18000, mode: 'reduced' },
  ];
  for (const backend of ['webgl2', 'canvas2d']) {
    for (const state of cases) {
      const q = new URLSearchParams({ fixture: '1', capture: '1', look: 'seed33', seed: '33', build: '12000', paused: '1', t: String(state.t), backend });
      if (state.mode === 'tiles-off') q.set('tiles', '0');
      if (state.mode === 'reduced') q.set('reduced', '1');
      await page.goto(`http://127.0.0.1:${port}/?${q}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('canvas[data-ready="1"]', { state: 'attached', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      const dataset = await page.locator('canvas').evaluate(c => ({ ...c.dataset }));
      check(`${backend}/${state.t}/${state.mode} ready and fixed`, dataset.backend === backend && Number(dataset.timeMs) === state.t && dataset.assetsReady !== '0', dataset);
      const file = `${backend}-${state.t}-${state.mode}.png`;
      await page.screenshot({ path: path.join(out, file) });
      report.captures.push({ file, backend, ...state, dataset });
    }
  }
  await context.close();
} catch (error) {
  report.errors.push(String(error.stack ?? error));
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
}
report.finishedAt = new Date().toISOString();
report.ok = report.errors.length === 0;
await writeFile(path.join(out, 'checks.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ok: report.ok, captures: report.captures.length, checks: report.checks.length, errors: report.errors }));
process.exitCode = report.ok ? 0 : 1;
