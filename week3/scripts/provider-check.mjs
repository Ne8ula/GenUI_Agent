import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

if (process.env.EVA_APPROVE_PROVIDER_CHECK !== '2') throw new Error('Explicit two-turn allowance required for this billable check');
const pcmPath = process.env.EVA_SYNTHETIC_PCM;
if (!pcmPath) throw new Error('Supply an intentionally synthetic mono16k PCM file, never ordinary recorded conversation');
const pcm = (await readFile(pcmPath)).toString('base64');
const directory = `docs/design/revisions/${process.env.EVA_PROVIDER_CHECK_REVISION ?? 'w3-20260927-provider-01'}`;
await mkdir(directory); // Never overwrite prior evidence.
const port = process.env.EVA_NATIVE_DEBUG_PORT ?? '1432';
if (!/^\d{4,5}$/.test(port)) throw new Error('Invalid local inspection port');
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('http://localhost:1430/'));
if (!page) throw new Error('Native test app is not running');
let report = { syntheticInput: true, microphoneUsed: false, maxAttemptedTurns: 2, voiceListeningJudgment: 'Not performed' };
try {
  // The inspected page continues to say Microphone off. No test input is presented as live microphone interaction.
  await page.getByRole('button', { name: /Captions/ }).click();
  await page.evaluate(() => {
    const banner = document.createElement('aside');
    banner.textContent = 'Synthetic provider check — microphone off. This is not the live rehearsal.';
    banner.style.cssText = 'position:fixed;inset:0 0 auto;padding:16px;background:#312820;color:#ffe3b0;z-index:999;text-align:center';
    banner.id = 'synthetic-provider-check'; document.body.append(banner);
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  });
  const status = await page.evaluate(async () => (await import('/src/voice/transport.ts')).nativeTransport.status());
  report = { ...report, initialStatus: status };
  assert.equal(status.ready, true); assert.equal(status.remainingTurns, 2);
  const unknownFieldsRejected = await page.evaluate(async () => {
    try { await window.__TAURI_INTERNALS__.invoke('w3_status', { model: 'untrusted' }); return false; }
    catch (error) { return String(error) === 'w3_invalid_request'; }
  });
  assert.equal(unknownFieldsRejected, true);
  report = { ...report, unknownFieldsRejected };
  await page.evaluate(async (pcm) => {
    const [{ Conversation }, { LocalPlayback }, { nativeTransport }, { encodeWav }] = await Promise.all([
      import('/src/voice/conversation.ts'), import('/src/voice/playback.ts'), import('/src/voice/transport.ts'), import('/src/voice/speech-gate.ts'),
    ]);
    const bytes = Uint8Array.from(atob(pcm), c => c.charCodeAt(0));
    const integers = new Int16Array(bytes.buffer);
    const samples = Float32Array.from(integers, sample => sample / 32768);
    const wav = encodeWav(samples); samples.fill(0); bytes.fill(0);
    const hooks = {};
    const capture = { start: async (onset, utterance) => Object.assign(hooks, { onset, utterance }), mute() {}, discard() {}, stop() {} };
    const transport = { ...nativeTransport, turn: async (...args) => {
      try { return await nativeTransport.turn(...args); }
      catch (error) { const code = String(error); window.__providerCheck.failureCategory = /^w3_[a-z0-9_]+$/.test(code) ? code : 'unclassified'; throw error; }
    } };
    const flow = new Conversation(transport, capture, new LocalPlayback());
    window.__providerCheck = { flow, hooks, wav, states: [] };
    flow.subscribe(() => {
      const state = flow.snapshot().state;
      const log = window.__providerCheck.states;
      if (log.at(-1)?.state !== state) log.push({ state, at: performance.now() });
    });
    await flow.start(); hooks.onset(); hooks.utterance(wav.slice());
  }, pcm);
  await page.waitForFunction(() => {
    const test = window.__providerCheck;
    return test.flow.snapshot().state === 'unavailable' || (test.states.some(event => event.state === 'speaking') && test.flow.snapshot().state === 'listening');
  }, null, { timeout: 120_000 });
  const first = await page.evaluate(async () => ({ failureCategory: window.__providerCheck.failureCategory, state: window.__providerCheck.flow.snapshot().state, stance: window.__providerCheck.flow.snapshot().stance, states: window.__providerCheck.states, timing: (await import('/src/voice/timing.ts')).localTimings(), status: await (await import('/src/voice/transport.ts')).nativeTransport.status() }));
  report = { ...report, first };
  assert.equal(first.state, 'listening', 'Provider/playback turn did not finish; inspect stage status privately, never log payloads');
  assert.equal(first.status.remainingTurns, 1);
  await page.evaluate(() => { const test = window.__providerCheck; test.hooks.onset(); test.hooks.utterance(test.wav.slice()); });
  await page.waitForFunction(async () => (await (await import('/src/voice/transport.ts')).nativeTransport.status()).remainingTurns === 0, null, { timeout: 10_000 });
  await page.evaluate(() => window.__providerCheck.flow.stop());
  await page.waitForTimeout(1800);
  const stopped = await page.evaluate(() => ({ state: window.__providerCheck.flow.snapshot().state, eventsAfterStop: window.__providerCheck.states.slice(-3) }));
  assert.equal(stopped.state, 'interrupted');
  report = { ...report, stopped, result: 'First synthetic-input native STT/reply/TTS/playback turn completed; second turn cancelled after budget consumption. Not hands-free or acoustic evidence.' };
} catch (error) {
  report = { ...report, failure: error.message, result: 'Failed; no automatic provider retry.' };
  process.exitCode = 1;
} finally {
  await page.evaluate(() => { window.__providerCheck?.flow.end(); window.__providerCheck?.wav.fill(0); delete window.__providerCheck; });
  await writeFile(`${directory}/checks.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
