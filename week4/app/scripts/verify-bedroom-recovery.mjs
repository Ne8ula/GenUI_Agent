import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { browserOptions } from './browser-options.mjs';

const url = 'http://127.0.0.1:1440/?scene=teal-bedroom';
const asset = '**/assets/teal-bedroom/room.ply';
const out = fileURLToPath(new URL(`../../../docs/design/revisions/teal-bedroom-demo-v1/implementation/recovery-${Date.now()}`, import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions());
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const requests = [];
page.on('request', r => requests.push({ method: r.method(), url: r.url().split('?')[0] }));
try {
  // Synthetic transfer delay makes cancellation reproducible; no network endpoint receives the scan.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      if (String(args[0]).includes('/assets/teal-bedroom/room.ply')) await new Promise(resolve => setTimeout(resolve, 700));
      return original(...args);
    };
  });
  await page.route(asset, route => route.fulfill({ status: 200, body: Buffer.from('not a scan') }));
  await page.goto(url);
  await page.getByRole('alert').filter({ hasText: 'incomplete' }).waitFor();
  await page.unroute(asset);
  await page.route(asset, route => route.fulfill({ status: 200, body: Buffer.alloc(24837257) }));
  await page.getByRole('button', { name: 'Reopen room', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'integrity check' }).waitFor();
  await page.unroute(asset);
  await page.getByRole('button', { name: 'Reopen room', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel loading', exact: true }).click();
  await page.getByRole('heading', { name: 'Opening paused', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Reopen room', exact: true }).click();
  await page.getByRole('button', { name: 'Add teddy', exact: true }).click();
  await page.getByRole('button', { name: 'Make it blue', exact: true }).click();
  const before = await page.evaluate(() => window.__evaBedroom.snapshot());
  const extension = await page.evaluate(() => {
    const gl = document.querySelector('canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext(); return true;
  });
  assert.equal(extension, true, 'Browser must support context-loss exercise');
  await page.getByRole('alert').filter({ hasText: 'Graphics were interrupted' }).waitFor();
  await page.screenshot({ path: `${out}/interrupted.png` });
  await page.getByRole('button', { name: 'Reopen room', exact: true }).click();
  await page.waitForFunction(() => window.__evaBedroom?.snapshot().sourceVertices === 622077 && window.__evaBedroom?.snapshot().teddyVisible);
  const after = await page.evaluate(() => window.__evaBedroom.snapshot());
  assert.equal(after.teddyColor, before.teddyColor);
  assert.deepEqual(after.teddyAnchor, before.teddyAnchor);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'cream teddy is back' }).waitFor();
  assert.equal(await page.evaluate(() => window.__evaBedroom.snapshot().teddyColor), 'dcbf92');
  await page.screenshot({ path: `${out}/reopened.png` });
  assert.equal(requests.some(r => r.method !== 'GET'), false, 'No file uploads or other write requests');
  assert.equal(requests.some(r => /^https?:/.test(r.url) && new URL(r.url).hostname !== '127.0.0.1'), false, 'No external requests');
  await writeFile(`${out}/checks.json`, JSON.stringify({ checks: ['wrong size rejection', 'corrupt hash rejection', 'cancel synthetic delayed file read', 'reopen after cancel', 'real WebGL context loss', 'memory/history survive graphics reopen', 'no network uploads', 'no external requests'], before, after, requests }, null, 2));
  console.log('PASS: rejection, cancellation, graphics interruption/reopen, memory/history and private file boundary');
} finally { await context.close(); await browser.close(); }
