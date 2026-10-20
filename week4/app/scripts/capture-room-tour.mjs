// Actual browser recording: source views, a full turn, and provenance inspection.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
const output = process.argv[2];
const url = process.argv[3] ?? 'http://127.0.0.1:1440/';
if (!output || existsSync(output)) throw new Error('Supply a fresh evidence directory');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: output, size: { width: 1440, height: 1000 } } });
const page = await context.newPage();
const events = [];
try {
  await page.goto(url);
  await page.getByRole('button', { name: 'Reset selected view' }).waitFor();
  await page.locator('canvas').focus();
  for (let quarter = 1; quarter <= 4; quarter++) {
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(65);
    }
    await page.screenshot({ path: path.join(output, `turn-${quarter}.png`) });
    events.push({ quarter, pose: await page.evaluate(() => window.__evaRoom?.snapshot()) });
    await page.waitForTimeout(500);
  }
  await page.keyboard.press('Home');
  for (const view of ['Shelves and light View 0062', 'A second angle View 0087', 'The doorway View 0037']) {
    await page.getByRole('button', { name: view }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(output, view.match(/\d{4}/)[0]+'.png') });
  }
  await page.getByRole('button', { name: 'The cabinet View 0012' }).click();
  await page.getByRole('button', { name: 'Points', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Provenance', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Surfaces', exact: true }).click();
  await page.getByRole('button', { name: 'Sources & details' }).click();
  await page.waitForTimeout(1000);
  await writeFile(path.join(output, 'tour.json'), JSON.stringify({ url, browser: browser.version(), events, note: 'Actual headless Edge browser recording with scripted keyboard input. Not native or physical-device performance evidence.' }, null, 2));
} finally {
  await context.close();
  await page.video().saveAs(path.join(output, 'room-tour.webm'));
  await browser.close();
}
