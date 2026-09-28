import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Synthetic only: this runner never requests a microphone or calls a provider.
const revision = process.env.EVA_CAPTURE_REVISION ?? 'w3-20260927-01';
if (!/^[a-z0-9-]+$/.test(revision)) throw new Error('Invalid evidence revision');
const directory = resolve('docs/design/revisions', revision);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: directory, size: { width: 1400, height: 900 } } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const stances = ['attentive', 'comforting', 'shared_joy', 'congratulatory', 'supportive'];
const go = async (query) => { await page.goto(`http://127.0.0.1:1430/?fixture&${query}`); await page.locator('canvas').waitFor(); await page.evaluate(() => document.fonts.ready); };
try {
  await go('stance=attentive&state=idle&seed=41');
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${directory}/idle.png` });
  for (const stance of stances) {
    await page.getByLabel('Fixture stance').selectOption(stance);
    await page.getByLabel('Fixture state').selectOption('speaking');
    for (let variation = 1; variation <= 3; variation++) {
      await page.getByRole('button', { name: 'New variation' }).click();
      await page.waitForTimeout(1400);
      await page.screenshot({ path: `${directory}/${stance}-${variation}.png` });
    }
  }
  await page.getByLabel('Fixture state').selectOption('processing');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${directory}/processing.png` });
  const timing = await page.evaluate(() => new Promise(resolve => {
    const frames = []; let previous = performance.now();
    function frame(now) { frames.push(now - previous); previous = now; if (frames.length < 180) requestAnimationFrame(frame); else { frames.sort((a,b)=>a-b); resolve({ samples: frames.length, median: frames[90], p95: frames[171], max: frames[179] }); } }
    requestAnimationFrame(frame);
  }));
  await page.getByRole('button', { name: 'Interrupt fixture' }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${directory}/interrupted.png` });
  await page.getByRole('button', { name: 'Reduced motion off' }).click();
  await page.getByLabel('Fixture state').selectOption('processing');
  await page.waitForTimeout(250);
  const still = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(450);
  const reducedStatic = still === await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await page.screenshot({ path: `${directory}/reduced-motion.png` });
  await page.getByRole('button', { name: 'End fixture' }).click();
  await page.waitForTimeout(150);
  const ended = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(450);
  const endStatic = ended === await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await page.screenshot({ path: `${directory}/ended.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await page.screenshot({ path: `${directory}/mobile.png`, fullPage: true });
  await page.goto('http://127.0.0.1:1430/');
  await page.getByText('A little room to talk.').waitFor();
  const browserLiveDisabled = await page.getByRole('button', { name: 'Start conversation' }).isDisabled();
  await page.keyboard.press('Tab');
  const keyboardFocus = await page.evaluate(() => ({ tag: document.activeElement.tagName, visible: document.activeElement.matches(':focus-visible') }));
  await page.screenshot({ path: `${directory}/browser-start.png`, fullPage: true });
  const report = { revision, browser: browser.version(), viewport: '1400x900', deviceScaleFactor: 1, fixturesOnly: true, providersCalled: 0, timing: { ...timing, note: 'Headless Chrome rAF intervals while a synthetic processing fixture runs with video recording. Not native, GPU, voice-load or acoustic latency measurements.' }, reducedStatic, endStatic, noOverflow, browserLiveDisabled, keyboardFocus, errors };
  await writeFile(`${directory}/checks.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length || !reducedStatic || !endStatic || !noOverflow || !browserLiveDisabled || !keyboardFocus.visible) process.exitCode = 1;
} finally {
  await context.close();
  const video = await page.video().path();
  console.log(`Synthetic motion recording: ${video}`);
  await browser.close();
}
