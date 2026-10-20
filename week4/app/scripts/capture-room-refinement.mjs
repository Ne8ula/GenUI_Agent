import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
const output = process.argv[2];
if (!output || existsSync(output)) throw new Error('Supply a fresh evidence directory');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const poses = [];
try {
  await page.goto('http://127.0.0.1:1440/');
  await page.getByRole('button', { name: 'Reset selected view' }).waitFor();
  for (let quarter = 0; quarter < 4; quarter++) {
    if (quarter) {
      await page.locator('canvas').focus();
      for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
    }
    for (const mode of ['Surfaces', 'Points', 'Provenance']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      await page.waitForTimeout(80);
      await page.screenshot({ path: path.join(output, `turn-${quarter}-${mode.toLowerCase()}.png`) });
    }
    poses.push(await page.evaluate(() => window.__evaRoom.snapshot()));
  }
  await page.getByRole('button', { name: 'The doorway View 0037' }).click();
  await page.getByRole('button', { name: 'Points', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'doorway-points.png') });
  await page.getByRole('button', { name: 'The cabinet View 0012' }).click();
  await page.getByRole('button', { name: 'Surfaces', exact: true }).click();
  await page.locator('canvas').focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 25; i++) await page.keyboard.press('w');
  await page.screenshot({ path: path.join(output, 'inside-east-room.png') });
  poses.push(await page.evaluate(() => window.__evaRoom.snapshot()));
  await writeFile(path.join(output, 'cameras.json'), JSON.stringify(poses, null, 2));
} finally { await browser.close(); }
