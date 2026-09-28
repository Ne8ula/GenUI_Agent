import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { browserOptions } from '../scripts/browser-options.mjs';
import { sampling } from './references.mjs';

test('Linux defaults to project-installed Chromium, not a missing branded Chrome', () => {
  assert.deepEqual(browserOptions({}, 'linux'), { headless: true });
});
test('Windows/macOS preserve the existing local Chrome choice', () => {
  for (const platform of ['win32', 'darwin']) assert.deepEqual(browserOptions({}, platform), { headless: true, channel: 'chrome' });
});
test('explicit browser selection is validated', () => {
  assert.deepEqual(browserOptions({ EVA_BROWSER_CHANNEL: 'chromium' }, 'win32'), { headless: true });
  assert.deepEqual(browserOptions({ EVA_BROWSER_CHANNEL: 'msedge' }, 'linux'), { headless: true, channel: 'msedge' });
  assert.throws(() => browserOptions({ EVA_BROWSER_CHANNEL: 'unreviewed-browser' }, 'linux'));
});
test('reference sampling includes the complete short GIF and bounds long clips', () => {
  assert.deepEqual(sampling(1.14, 19), { allFrames: true, frameSlots: 19, fps: null });
  assert.equal(sampling(45.02).frameSlots, 46);
  assert.equal(sampling(600).frameSlots, 48);
  assert.equal(sampling(8.3).frameSlots, 17);
  assert.throws(() => sampling(0)); assert.throws(() => sampling(NaN));
});
test('protected-file guard catches changes and never overwrites its baseline', async () => {
  const parent = process.env.EVA_CLOUD_TEST_DIR;
  assert.ok(parent, 'Set EVA_CLOUD_TEST_DIR to the current session scratch directory');
  const temp = await mkdtemp(join(parent, 'w3-cloud-guard-'));
  try {
    await mkdir(join(temp, 'week3/cloud'), { recursive: true });
    await mkdir(join(temp, 'week3/src/voice'), { recursive: true });
    await mkdir(join(temp, 'week1'), { recursive: true });
    await copyFile(new URL('./guard.mjs', import.meta.url), join(temp, 'week3/cloud/guard.mjs'));
    await writeFile(join(temp, 'week3/src/voice/contracts.ts'), 'synthetic original');
    await writeFile(join(temp, 'week1/README.md'), 'synthetic archive');
    const init = spawnSync('git', ['init', '--quiet'], { cwd: temp, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const baseline = join(temp, 'snapshot.json');
    const run = action => spawnSync(process.execPath, [join(temp, 'week3/cloud/guard.mjs'), action, baseline], { encoding: 'utf8' });
    assert.equal(run('init').status, 0);
    const original = await readFile(baseline, 'utf8');
    assert.equal(run('check').status, 0);
    await writeFile(join(temp, 'week3/src/voice/contracts.ts'), 'synthetic changed');
    const changed = run('check');
    assert.equal(changed.status, 1); assert.match(changed.stderr, /contracts\.ts/);
    assert.equal(run('init').status, 1);
    assert.equal(await readFile(baseline, 'utf8'), original);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
