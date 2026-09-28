import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const revision = process.env.EVA_NATIVE_CHECK_REVISION ?? 'w3-20260927-native-01';
if (!/^[a-z0-9-]+$/.test(revision)) throw new Error('Invalid evidence revision');
const directory = `docs/design/revisions/${revision}`;
await mkdir(directory);
const browser = await chromium.connectOverCDP('http://127.0.0.1:1432');
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('http://localhost:1430/'));
if (!page) throw new Error('Week 3 native WebView not found');
await page.getByRole('button', { name: 'Start conversation' }).waitFor();
const status = await page.evaluate(async () => {
  const { nativeTransport } = await import('/src/voice/transport.ts');
  return nativeTransport.status();
});
assert.equal(status.ready, false);
assert.equal(status.remainingTurns, 0);
const startFailure = await page.evaluate(async () => {
  const { nativeTransport } = await import('/src/voice/transport.ts');
  try { await nativeTransport.start(); return 'UNEXPECTED_SUCCESS'; } catch (error) { return String(error); }
});
assert.notEqual(startFailure, 'UNEXPECTED_SUCCESS');
assert.equal(await page.getByRole('button', { name: 'Start conversation' }).isDisabled(), true);
await page.getByRole('button', { name: 'Reduced motion off' }).click();
await page.getByRole('button', { name: 'Captions on' }).click();
await page.screenshot({ path: `${directory}/native-start.png` });
const report = { native: true, webView: await page.evaluate(() => navigator.userAgent), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio })), status, startFailure, providersCalled: 0, realMicActivated: false, scope: 'Native WebView launch, actual Rust IPC readiness and start fail-closed, visible controls. No live voice or acoustic claim.', softwareRenderingRequested: true };
await writeFile(`${directory}/checks.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
// Disconnect, leaving the app available to inspect. The main session closes its own process later.
await browser.close();
