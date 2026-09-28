import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const dir = 'docs/design/revisions/w3-20260927-source-eye';
await mkdir(dir);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
  await page.route('**/src/main.tsx', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.goto('http://127.0.0.1:1430/');
  const poses = [
    { name: 'rest', gazeX: 0, gazeY: 0, tissueX: 0, tissueY: 0 },
    { name: 'left', gazeX: -.13, gazeY: 0, tissueX: -.08, tissueY: 0 },
    { name: 'right', gazeX: .13, gazeY: 0, tissueX: .08, tissueY: 0 },
  ];
  const timings = [];
  for (const pose of poses) {
    const result = await page.evaluate(async (pose) => {
      const { rasterizeWeek1Eye } = await import('/src/visual/week1-eye.ts');
      document.body.replaceChildren();
      document.body.style.cssText = 'margin:0;background:#111316;color:#e4ded2;font:14px sans-serif';
      const caption = document.createElement('p'); caption.textContent = `Source-derived Week 1 eye / ${pose.name} / CPU identity fixture, not the final composition`;
      caption.style.cssText = 'position:absolute;top:24px;width:100%;text-align:center';
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700;
      document.body.append(canvas, caption);
      const source = document.createElement('canvas'); source.width = 280; source.height = 140;
      const start = performance.now();
      const eye = rasterizeWeek1Eye(280, 140, { ...pose, closure: 0, quiet: true, time: 2, energy: 0 });
      const rasterMs = performance.now() - start;
      source.getContext('2d').putImageData(new ImageData(eye.data, 280, 140), 0, 0);
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, 52, 126, 896, 448);
      return { pose: pose.name, rasterMs, landmarks: eye.landmarks.length };
    }, pose);
    timings.push(result);
    await page.screenshot({ path: `${dir}/${pose.name}.png` });
  }
  const report = { browser: browser.version(), viewport: '1000x700', dpr: 1, raster: '280x140', source: 'week1/apps/desktop/src/SignalEye.tsx', timing: timings, note: 'Three individual CPU raster durations, not frame-rate or input-to-photon measurements. No microphone, provider calls or owner acceptance.' };
  await writeFile(`${dir}/checks.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
