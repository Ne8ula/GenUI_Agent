import { chromium } from '@playwright/test';
import { writeFile, access } from 'node:fs/promises';
const revision = process.env.EVA_NATIVE_VISUAL_REVISION ?? 'w3-20260927-06';
if (!/^[a-z0-9-]+$/.test(revision)) throw new Error('Invalid evidence revision');
const dir = `docs/design/revisions/${revision}`;
try { await access(`${dir}/native-processing.png`); throw new Error('Native rendition already exists'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const browser = await chromium.connectOverCDP('http://127.0.0.1:1432');
try {
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('http://localhost:1430/'));
  if (!page) throw new Error('Week 3 native window not available');
  const mic = await page.locator('.mic-status').textContent();
  if (mic.includes('Microphone on') || mic.includes('Microphone muted')) throw new Error('End the microphone session before this fixture-only check');
  await page.goto('http://localhost:1430/?fixture&state=processing&stance=attentive&seed=42');
  await page.locator('canvas').waitFor();
  await page.waitForTimeout(1500);
  const display = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, userAgent: navigator.userAgent }));
  const intervals = await page.evaluate(() => new Promise(resolve => {
    const values = []; let last = performance.now();
    function tick(now) { values.push(now - last); last = now; if (values.length < 180) requestAnimationFrame(tick); else { values.sort((a,b)=>a-b); resolve({ count: 180, median: values[90], p95: values[171], max: values[179] }); } }
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: `${dir}/native-processing.png` });
  await writeFile(`${dir}/native-checks.json`, JSON.stringify({ display, intervals, softwareRenderingRequested: true, fixtureOnly: true, providerCalls: 0, note: 'Actual native WebView scheduling with a synthetic processing fixture. No microphone, live generation load, acoustic measurements or GPU benchmark.' }, null, 2));
  console.log(JSON.stringify({ display, intervals, providerCalls: 0 }, null, 2));
} finally { await browser.close(); }
