import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const output = process.argv[2];
const root = process.argv[3] ?? 'http://127.0.0.1:1441';
if (!output || existsSync(output)) throw new Error('Supply a fresh evidence directory');
await mkdir(output, { recursive: true });
const assetBase = '/assets/hypersim-full-room-v5/';
const manifest = await (await fetch(root + assetBase + 'scene.json')).json();
const verified = [];
for (const [name, entry] of Object.entries(manifest.files)) {
  const response = await fetch(root + assetBase + name);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, entry.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  verified.push(name);
}
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(root);
  await page.getByRole('button', { name: 'Reset selected view' }).waitFor();
  await page.getByRole('button', { name: 'Points', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'points.png') });
  await page.getByRole('button', { name: 'Surfaces', exact: true }).click();
  await page.locator('canvas').focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  await page.screenshot({ path: path.join(output, 'adjoining-space.png') });
  await page.getByRole('button', { name: 'Sources & details' }).click();
  const toggle = page.getByRole('checkbox', { name: 'Show assumed adjoining spaces' });
  await toggle.uncheck(); await toggle.check();
  assert.equal(await page.locator('.room-sources img').evaluate(i => i.complete && i.naturalWidth === 1024), true);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'checks.json'), JSON.stringify({
    status: 'passed', url: root, revision: manifest.revision, verifiedFiles: verified,
    meshSha256: manifest.files['room.ply'].sha256, errors,
  }, null, 2));
} finally { await browser.close(); }
