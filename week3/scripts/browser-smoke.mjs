import { chromium } from '@playwright/test';
import { browserOptions } from './browser-options.mjs';
import assert from 'node:assert/strict';

// Hardware-free integration of the real controls, worklet and capture lifecycle.
// Every provider method is replaced with a labeled in-memory test double.
const browser = await chromium.launch({ ...browserOptions(), args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const context = await browser.newContext({ permissions: ['microphone'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  // Mock the IPC boundary, not a Vite module instance (HMR may version module URLs).
  window.isTauri = true;
  window.__TAURI_INTERNALS__ = { invoke: async (command) => {
    if (command === 'w3_status') return { ready: true, missing: [], providers: { stt: 'TEST DOUBLE', reply: 'TEST DOUBLE', tts: 'TEST DOUBLE' }, remainingTurns: 10 };
    if (command === 'w3_start') return { sessionId: 'a'.repeat(32) };
    if (['w3_advance', 'w3_delivered', 'w3_end'].includes(command)) return;
    throw new Error('Synthetic smoke never supplies or plays a provider reply');
  } };
  window.__testMicCalls = 0; window.__testTracks = [];
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async constraints => {
    window.__testMicCalls++;
    const stream = await original(constraints); window.__testTracks.push(...stream.getTracks()); return stream;
  };
});
try {
  await page.goto('http://127.0.0.1:1430/');
  await page.getByRole('button', { name: 'Start conversation' }).waitFor();
  assert.equal(await page.evaluate(() => window.__testMicCalls), 0);
  assert.equal(await page.getByRole('button', { name: 'Start conversation' }).isDisabled(), true);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start conversation' }).click();
  await page.getByRole('button', { name: 'Mute microphone' }).waitFor();
  assert.equal(await page.evaluate(() => window.__testMicCalls), 1);
  await page.getByRole('button', { name: 'Mute microphone' }).click();
  assert.equal(await page.evaluate(() => window.__testTracks.every(track => !track.enabled)), true);
  await page.keyboard.press('Escape');
  await page.getByRole('status').filter({ hasText: 'Response stopped' }).waitFor();
  await page.getByRole('button', { name: 'Unmute microphone' }).click();
  assert.equal(await page.evaluate(() => window.__testTracks.every(track => track.enabled)), true);
  await page.getByRole('button', { name: 'End session' }).click();
  assert.equal(await page.evaluate(() => window.__testTracks.every(track => track.readyState === 'ended')), true);
  assert.deepEqual(errors, []);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === '2d' ? null : original.call(this, type, ...args);
    };
  });
  await page.reload();
  await page.getByText('Visuals unavailable. Voice controls remain active.').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start conversation' }).isVisible(), true);
  console.log('PASS: explicit consent, real AudioWorklet on fake device, mute/unmute, Esc, End track release, canvas-failure controls. No real microphone, provider calls, voice quality or acoustic evidence.');
} finally { await context.close(); await browser.close(); }
