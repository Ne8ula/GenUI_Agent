import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

if (!process.argv[2]) throw new Error('Provide a new empty output directory');
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: true });
if ((await fs.readdir(out)).length) throw new Error('Output must be empty');
const base = process.argv[3] ?? 'http://127.0.0.1:1467';
const report = { base, checks: [], errors: [], viewports: [] };
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
const check = (name, passed) => { report.checks.push({ name, passed: Boolean(passed) }); assert.ok(passed, name); };
const shot = name => page.screenshot({ path: path.join(out, `${name}.png`) });
try {
  await page.goto(`${base}/?scene=paris-arrival`);
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');
  await page.evaluate(() => window.__evaArrival.seekDiscovery(3));
  await page.waitForFunction(() => document.querySelectorAll('.discovery-photo img').length === 7);
  const emphasis = [];
  for (const t of [2.1, 2.8, 3.45, 4.1, 4.75, 5.4]) {
    await page.evaluate(t => window.__evaArrival.seekDiscovery(t), t);
    const windows = await page.locator('.discovery-photo').evaluateAll(nodes => nodes.map(n => ({ id: n.dataset.sourceId, slot: n.dataset.window, focused: n.dataset.focused })));
    check(`unique seven-photo assignment at ${t}s`, windows.length === 7 && new Set(windows.map(n => n.id)).size === 7);
    emphasis.push(windows.find(n => n.focused === 'true')?.slot);
  }
  check('quick focus handoffs reach multiple distinct windows', new Set(emphasis).size >= 5);
  await shot('discovery-switching');
  for (const [width, height] of [[2560, 1440], [1024, 700], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.__evaArrival.seek(30, 0));
    await page.waitForTimeout(120);
    for (const idle of [0, 5, 10, 14]) {
      await page.evaluate(idle => window.__evaArrival.seek(30, idle), idle);
      const layout = await page.locator('.item-overlay-tab, .item-overlay-desc, .item-overlay-inset, .item-overlay-inset-link').evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect();
        return { kind: n.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, font: parseFloat(getComputedStyle(n).fontSize) };
      }));
      report.viewports.push({ width, height, idle, layout });
      check(`readable overlay text stays in ${width}x${height} at idle ${idle}`, layout.every(r => r.left >= 0 && r.right <= width + 1 && r.top >= 0 && r.bottom <= height - 56 && r.font >= 12));
      check(`inset targets remain usable at ${width} idle ${idle}`, layout.filter(r => r.kind.includes('inset-link')).every(r => r.width >= 40 && r.height >= 40));
      if (idle === 0 || width === 390) await shot(`tracking-${width}-idle-${idle}`);
    }
    check(`responsive box count at ${width}`, await page.locator('.item-overlay-box').count() === (width <= 650 ? 1 : 4));
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.__evaArrival.seek(30, 0));
  const staticMarkup = await page.locator('.item-overlays-root').innerHTML();
  await page.evaluate(() => window.__evaArrival.seek(30, 20));
  check('reduced motion freezes reference selection and geometry', await page.locator('.item-overlays-root').innerHTML() === staticMarkup);
  await page.evaluate(() => window.__evaArrival.reset());
  check('return removes every overlay and inset', await page.locator('.item-overlay-box, .archive-inset').count() === 0);

  const partial = await context.newPage();
  await partial.route('**/sources/paris-r17/*.jpg', route => route.abort());
  await partial.goto(`${base}/?scene=paris-arrival`);
  await partial.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');
  await partial.evaluate(() => window.__evaArrival.seekDiscovery(5));
  await partial.getByRole('alert').waitFor();
  check('two failed photos leave five unique sources, never duplicates', await partial.locator('.discovery-photo').evaluateAll(nodes => nodes.length === 5 && new Set(nodes.map(n => n.dataset.sourceId)).size === 5));
  await partial.evaluate(() => window.__evaArrival.seek(30, 5));
  await partial.waitForTimeout(250);
  check('failed context image is omitted without a broken inset', await partial.locator('.archive-inset img').evaluateAll(nodes => nodes.every(n => n.complete && n.naturalWidth > 0)));
  await partial.close();
  check('no uncaught runtime errors', report.errors.length === 0);
} catch (error) {
  report.failure = error.stack;
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, failure: report.failure }, null, 2));
}
