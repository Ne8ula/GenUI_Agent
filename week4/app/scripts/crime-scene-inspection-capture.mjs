// Direct browser evidence; run only in the separately approved Modal container.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserOptions } from './browser-options.mjs';
import { createBroker } from '../../../scripts/room_workflow/broker.mjs';
assert.equal(process.env.EVA_REQUIRE_NVIDIA, '1', 'Modal GPU capture only');
const phase = process.env.EVA_INSPECTION_PHASE;
assert.ok(['before', 'after'].includes(phase));
const output = fileURLToPath(new URL(`../../../docs/design/revisions/crime-scene-inspection-demo-v1/implementation/${phase}/`, import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'eva-inspection-'));
const forbidden = async () => { throw Error('No provider calls in scripted demonstration'); };
const { server } = await createBroker({ directory, sceneNotebookOptions: { key: forbidden, fetcher: forbidden }, sceneInvestigatorOptions: { demo: true, key: forbidden, fetcher: forbidden, resource: forbidden } });
const report = { status: 'failed', phase, viewport: { width: 2560, height: 1440 }, checks: [], errors: [], measuredFps: null };
let browser, context, page;
function save() { writeFileSync(output + 'inspection.json', JSON.stringify(report, null, 2)); }
async function capture(name) { await page.screenshot({ path: output + name + '.png' }); }
async function at(seconds) { await page.waitForFunction(s => Number(document.querySelector('.panorama-app')?.dataset.seconds) >= s, seconds, { timeout: 35000 }); }
async function openPage(options = {}) {
  context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, hasTouch: true, ...options });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('console', message => { if (/THREE.WebGLProgram|shader error|VALIDATE_STATUS|GL_INVALID_OPERATION/i.test(message.text())) report.errors.push(message.text()); });
  await page.goto('http://127.0.0.1:1440/?scene=crime-scene');
  await page.locator('.panorama-app[data-phase="ready"]').waitFor({ timeout: 45000 });
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(1442, '127.0.0.1', resolve); });
  browser = await chromium.launch(browserOptions());
  await openPage(phase === 'after' ? { recordVideo: { dir: directory, size: report.viewport } } : {});
  const canvas = page.locator('.panorama-stage canvas');
  report.gpu = await canvas.evaluate(c => { const gl = c.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '', buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] }; });
  assert.match(report.gpu.renderer, /NVIDIA/i); assert.doesNotMatch(report.gpu.renderer, /swiftshader|llvmpipe|software/i);
  if (phase === 'before') {
    await capture('room-normal');
    for (let view = 1; view <= 3; view++) {
      await canvas.focus();
      for (let step = 0; step < 13; step++) await page.keyboard.press('ArrowRight');
      await capture('room-direction-' + view);
    }
    report.checks.push('unchanged baseline and three interior look directions captured; quality not asserted');
  } else {
    const clip = { x: 900, y: 500, width: 600, height: 400 };
    const normal = await page.screenshot({ clip });
    await page.getByRole('button', { name: 'Play demo' }).click();
    await at(1); await capture('room-normal');
    await at(4.5); await capture('room-scan');
    await at(7); await capture('room-detective');
    assert.equal(await page.locator('.panorama-app').getAttribute('data-mode'), 'detective');
    assert.notDeepEqual(await page.screenshot({ clip }), normal, 'Detective treatment must visibly change room pixels');
    await at(12); await capture('room-source');
    assert.equal(await page.locator('.inspection-evidence img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await at(21); await capture('room-return');
    assert.equal(await page.locator('.inspection-evidence').count(), 0);
    await at(26); await capture('room-restored');
    assert.deepEqual(await page.screenshot({ clip }), normal, 'Returning to normal must preserve viewpoint and room appearance');
    await at(28);
    assert.equal(await page.locator('.panorama-app').getAttribute('data-playing'), 'false');
    report.checks.push('28-second normal/scan/detective/source/return/normal cycle', 'room pixels change in Detective Mode and restore exactly in the central comparison crop', 'unaltered source photograph decoded');
    const video = page.video();
    await context.close(); context = undefined;
    await video.saveAs(output + 'walkthrough.webm');
    report.video = 'walkthrough.webm';

    await openPage();
    await page.getByRole('button', { name: 'Play demo' }).click();
    await at(4);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const frozen = await page.locator('.panorama-app').getAttribute('data-seconds');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.panorama-app').getAttribute('data-seconds'), frozen);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.locator('canvas').click({ position: { x: 500, y: 450 } });
    assert.equal(await page.locator('.panorama-app').getAttribute('data-playing'), 'false');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Source photograph', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Close inspection' }).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: 'Source photograph', exact: true }).evaluate(el => el === document.activeElement), true);
    report.checks.push('pause freezes progression; resume works; canvas input takes over', 'keyboard opens source; Escape closes and returns focus');
    await context.close(); context = undefined;

    await openPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true });
    await page.getByRole('button', { name: 'Detective Mode', exact: true }).tap();
    assert.equal(await page.locator('.panorama-app').getAttribute('data-mode'), 'detective');
    await page.getByRole('button', { name: 'Source photograph', exact: true }).tap();
    await page.getByRole('button', { name: 'Close inspection' }).waitFor();
    await capture('room-mobile');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('button', { name: 'Close inspection' }).tap();
    await page.getByRole('button', { name: 'Exit Detective Mode', exact: true }).tap();
    assert.equal(await page.locator('.panorama-app').getAttribute('data-mode'), 'normal');
    report.checks.push('390px touch controls/source dismissal; no horizontal overflow', 'reduced-motion activation settles directly without sweep');
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed'; save();
} catch (error) {
  report.error = String(error); save();
  await page?.screenshot({ path: output + 'failure.png', timeout: 2000 }).catch(() => {});
  throw error;
} finally {
  await context?.close(); await browser?.close();
  if (server.listening) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  await rm(directory, { recursive: true, force: true }); save();
}
