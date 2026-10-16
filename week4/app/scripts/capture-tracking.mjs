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
const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1,
  ...(process.argv.includes('--record') ? { recordVideo: { dir: path.join(out, 'recording'), size: { width: 2560, height: 1440 } } } : {}) });
const page = await context.newPage();
page.on('pageerror', error => report.errors.push(error.message));
const check = (name, passed) => { report.checks.push({ name, passed: Boolean(passed) }); assert.ok(passed, name); };
const shot = name => page.screenshot({ path: path.join(out, `${name}.png`) });
const box = id => page.locator(`.item-overlay-box[data-item-id="${id}"]`);
const info = () => page.locator('.item-overlay-tab, .item-overlay-desc, .archive-inset');
const ready = p => p.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true');
const clear = async () => {
  await page.getByRole('textbox').focus();
  await page.mouse.move(20, 20);
  await page.keyboard.press('Escape');
};
try {
  await page.goto(`${base}/?scene=paris-arrival`);
  await ready(page);
  await page.evaluate(() => window.__evaArrival.seek(30, 0));
  await clear();
  check('eight quiet rectangles, no unsolicited information', await box('stop-sign').count() === 1 && await page.locator('.item-overlay-box').count() === 8 && await info().count() === 0);
  const baseline = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await shot('settled-qhd');
  const ids = await page.locator('.item-overlay-box').evaluateAll(nodes => nodes.map(n => n.dataset.itemId));
  for (const id of ids) {
    await box(id).hover();
    await page.locator('.item-overlay-tab').waitFor();
    check(`hover ${id} reveals only its information`, await page.locator('.item-overlay-tab').count() === 1 && await box(id).getAttribute('aria-expanded') === 'true');
    check(`hover ${id} keeps the object unobscured`, await box(id).evaluate(n => getComputedStyle(n).backgroundColor === 'rgba(0, 0, 0, 0)'));
    check(`hover ${id} leaves the scene geometry unchanged`, await page.locator('canvas').evaluate(canvas => canvas.toDataURL()) === baseline);
    if (['stop-sign', 'upper-window', 'right-doorway', 'shopfront-board'].includes(id)) await shot(`hover-${id}-qhd`);
    await page.mouse.move(20, 20);
    await page.waitForTimeout(380);
    check(`leaving ${id} hides its information`, await info().count() === 0);
  }
  await box('stop-sign').hover();
  await page.locator('.archive-inset').hover();
  await page.waitForTimeout(450);
  check('photo remains hoverable across the object-to-photo gap', await page.locator('.archive-inset').count() === 1);
  await page.keyboard.press('Escape');
  check('Escape dismisses hover information', await info().count() === 0);
  await clear();
  await box('stop-sign').focus();
  check('keyboard focus reveals information and visible focus ring', await box('stop-sign').getAttribute('aria-expanded') === 'true' && await box('stop-sign').evaluate(n => getComputedStyle(n).outlineStyle !== 'none'));
  await page.keyboard.press('Tab');
  check('Tab reaches the same object photo and pauses for source inspection', await page.locator('.archive-inset').evaluate(n => n === document.activeElement) && await page.evaluate(() => window.__evaArrival.stats().playback === 'paused'));
  await page.keyboard.press('Escape');
  check('Escape from the photo restores its object focus without reopening information', await box('stop-sign').evaluate(n => n === document.activeElement) && await info().count() === 0);
  await page.keyboard.press('Enter');
  check('keyboard activation reopens dismissed information', await page.locator('.item-overlay-tab').count() === 1);
  await page.keyboard.press('Tab');
  const popupPromise = context.waitForEvent('page');
  await page.keyboard.press('Enter');
  const popup = await popupPromise;
  await popup.waitForLoadState();
  check('context photo opens its local credit record', popup.url().includes('/sources/paris-r17/credits.html#clichy'));
  await popup.close();
  await page.keyboard.press('Tab');
  check('Tab advances to the next object without retaining old information', await box('upper-window').evaluate(n => n === document.activeElement) && await page.locator('.item-overlay-tab').innerText() === 'Upper window');
  await page.getByRole('textbox').focus();
  check('blur back to the prompt clears information', await info().count() === 0);

  for (const [width, height] of [[2560, 1440], [1024, 700], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    await clear();
    for (const id of ids) {
      await box(id).focus();
      const rects = await page.locator('.item-overlay-tab, .item-overlay-desc, .item-overlay-inset').evaluateAll(nodes => nodes.map(n => {
        const r = n.getBoundingClientRect();
        return { kind: n.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom, font: parseFloat(getComputedStyle(n).fontSize) };
      }));
      report.viewports.push({ width, height, id, rects });
      const photo = rects.find(r => r.kind === 'item-overlay-inset');
      const description = rects.find(r => r.kind === 'item-overlay-desc');
      check(`description clears its context photo for ${id} at ${width}`, !photo || description.right <= photo.left || description.left >= photo.right || description.bottom <= photo.top || description.top >= photo.bottom);
      check(`readable ${id} information fits ${width}x${height}`, rects.length >= 2 && rects.every(r => r.left >= 0 && r.right <= width + 1 && r.top >= 0 && r.bottom <= height - 56 && (r.kind === 'item-overlay-inset' || r.font >= 12)));
    }
    await box('stop-sign').focus();
    await shot(`focus-stop-sign-${width}`);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await clear();
  await page.evaluate(() => window.__evaArrival.seek(30, 0));
  check('reduced motion does not auto-reveal information', await info().count() === 0);
  await box('stop-sign').focus();
  const staticMarkup = await page.locator('.item-overlays-root').innerHTML();
  await page.evaluate(() => window.__evaArrival.seek(30, 20));
  check('reduced motion preserves explicit selection and geometry', await page.locator('.item-overlays-root').innerHTML() === staticMarkup);
  await page.evaluate(() => window.__evaArrival.reset());
  check('return removes all object hit regions and photos', await page.locator('.item-overlays-root').count() === 0);
  await page.evaluate(() => window.__evaArrival.seek(30, 0));
  check('re-entering the scene does not restore stale information', await info().count() === 0);
  await box('stop-sign').focus();
  await page.evaluate(() => window.__evaArrival.seekDiscovery(3));
  check('discovery unmounts all object overlays', await page.locator('.item-overlays-root').count() === 0);

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touch = await touchContext.newPage();
  await touch.goto(`${base}/?scene=paris-arrival`); await ready(touch);
  await touch.evaluate(() => window.__evaArrival.seek(30, 0));
  await touch.locator('[data-item-id="stop-sign"].item-overlay-box').tap();
  check('touch tap reveals right-side sign information', await touch.locator('.item-overlay-tab').innerText() === 'Street sign');
  await touch.getByRole('textbox').tap();
  check('touch outside dismisses information and keeps prompt usable', await touch.locator('.item-overlay-tab').count() === 0);
  await touchContext.close();

  const failed = await context.newPage();
  await failed.route('**/sources/**/*.jpg', route => route.abort());
  await failed.goto(`${base}/?scene=paris-arrival`); await ready(failed);
  await failed.evaluate(() => window.__evaArrival.seek(30, 0));
  await failed.locator('[data-item-id="stop-sign"].item-overlay-box').focus();
  await failed.waitForTimeout(250);
  check('failed photo disappears while object information stays available', await failed.locator('.archive-inset').count() === 0 && await failed.locator('.item-overlay-tab').innerText() === 'Street sign');
  await failed.close();
  check('no uncaught runtime errors', report.errors.length === 0);
} catch (error) {
  report.failure = error.stack;
  await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(path.join(out, 'hover-focus-interactions.webm'));
  await browser.close();
  await fs.writeFile(path.join(out, 'checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, failure: report.failure }, null, 2));
}
