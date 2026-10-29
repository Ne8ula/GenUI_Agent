import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../scripts/crime-scene-walkthrough.mjs', import.meta.url), 'utf8');

test('walkthrough rejects figure warnings as well as renderer errors', () => {
  const registration = source.split('\n').find(line => line.includes("page.on('console',"));
  assert.ok(registration);
  const errors: string[] = [];
  let listener: (message: { type: () => string; text: () => string }) => void;
  // Execute the driver's real listener without starting a browser or broker.
  runInNewContext(registration, { errors, report: { phase: 'loading-figure' }, checkpoint() {}, page: { on: (_: string, callback: typeof listener) => { listener = callback; } } });
  for (const [type, text] of [['warning', 'Hologram figures unavailable; playing object ghosts only.'], ['error', 'WebGL failed'], ['log', 'WebGL initialized'], ['warning', 'Unrelated warning']]) {
    listener!({ type: () => type!, text: () => text! });
  }
  assert.deepEqual(errors, ['Hologram figures unavailable; playing object ghosts only.', 'WebGL failed']);
});

test('walkthrough retains progress and renderer errors even when a screenshot never completes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'eva-walkthrough-report-'));
  try {
    let completeScreenshot!: () => void;
    const screenshot = new Promise<void>(resolve => { completeScreenshot = resolve; });
    const listeners: Record<string, (message: any) => void> = {};
    const context = {
      output: directory + sep, writeFileSync, console: { log() {} },
      page: { screenshot: () => screenshot, waitForTimeout: async () => {}, on: (name: string, callback: (message: any) => void) => { listeners[name] = callback; } },
    };
    // Execute the real capture/report code; only the unavailable GPU screenshot is stalled.
    const registrations = source.split('\n').filter(line => line.includes("page.on('console',") || line.includes("page.on('pageerror',")).join('\n');
    const driver = runInNewContext(source.slice(source.indexOf('const report='), source.indexOf('\ntry{')) + registrations + '\n({capture});', context);
    const pending = driver.capture('paused');
    const saved = () => JSON.parse(readFileSync(join(directory, 'walkthrough.json'), 'utf8'));
    assert.equal(saved().status, 'failed');
    assert.equal(saved().phase, 'capture-paused');
    assert.deepEqual(saved().steps, []);
    listeners.console!({ type: () => 'error', text: () => 'WebGL shader compilation failed' });
    listeners.pageerror!(new Error('Figure load failed'));
    assert.deepEqual(saved().errors, ['WebGL shader compilation failed', 'Figure load failed']);
    completeScreenshot();
    await pending;
    assert.deepEqual(saved().steps, ['paused']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('recording script gates playback capture on a completed figure response', () => {
  const watch = source.indexOf('const figureResponse=page.waitForResponse(');
  const play = source.indexOf("await eva.getByRole('button',{name:'Play reconstruction',exact:true}).click();");
  const complete = source.indexOf('await (await figureResponse).finished()');
  const capture = source.indexOf("await capture('paused')");
  assert.ok(watch >= 0 && watch < play && play < complete && complete < capture);
});
