import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = process.env.EVA_EVIDENCE_DIR ?? '.local/reconstruction/bedroom-completion-check';
const browser = await chromium.launch(browserOptions());
try {
  await fs.mkdir(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:1440/?scene=teal-bedroom');
  await page.getByRole('button', { name: 'Ceiling light', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Surfaces', exact: true }).click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const toggle = page.getByRole('button', { name: 'Authored room', exact: true });
  const canvas = page.locator('canvas');
  const reports = [];
  for (const view of ['bed', 'side', 'ceiling']) {
    if (view === 'side') for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Turn right', exact: true }).click();
    if (view === 'ceiling') await page.getByRole('button', { name: 'Ceiling light', exact: true }).click();
    await toggle.click();
    const raw = await canvas.screenshot({ path: `${out}/${view}-original.png` });
    await toggle.click();
    const completed = await canvas.screenshot({ path: `${out}/${view}-completed.png` });
    const report = await page.evaluate(async ({ raw, completed }) => {
      async function pixels(base64) {
        const img = new Image(); img.src = `data:image/png;base64,${base64}`; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
        return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width, height: c.height };
      }
      const a = await pixels(raw), b = await pixels(completed);
      const isGap = (data, i) => Math.abs(data[i] - 17) <= 1 && Math.abs(data[i + 1] - 22) <= 1 && Math.abs(data[i + 2] - 21) <= 1;
      let gaps = 0, filled = 0, supported = 0, changed = 0;
      for (let y = 80; y < a.height - 80; y++) for (let x = 30; x < a.width - 30; x++) {
        const i = (y * a.width + x) * 4;
        if (isGap(a.data, i)) { gaps++; if (!isGap(b.data, i)) filled++; }
        else if ([-2, 0, 2].every(dy => [-2, 0, 2].every(dx => !isGap(a.data, i + 4 * (dy * a.width + dx))))) {
          supported++;
          if ([0, 1, 2].some(c => Math.abs(a.data[i + c] - b.data[i + c]) > 8)) changed++;
        }
      }
      return { gaps, filled, supported, changed, filledFraction: filled / Math.max(1, gaps), changedFraction: changed / Math.max(1, supported) };
    }, { raw: raw.toString('base64'), completed: completed.toString('base64') });
    reports.push({ view, ...report });
    console.log(view, report);
  }
  await fs.writeFile(`${out}/coverage.json`, JSON.stringify(reports, null, 2));
  for (const report of reports) {
    assert.ok(report.gaps > 100, `${report.view} has real source holes`);
    assert.ok(report.filledFraction > .95, `${report.view}: at least 95% of visible background gaps filled`);
    if (report.view !== 'ceiling') assert.ok(report.changedFraction < .005, `${report.view}: preserve existing surface detail`);
  }
} finally { await browser.close(); }
