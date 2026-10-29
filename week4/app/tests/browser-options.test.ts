import test from 'node:test';
import assert from 'node:assert/strict';
import {browserOptions} from '../scripts/browser-options.mjs';

test('cloud NVIDIA request adds hardware flags without changing default browser launches', () => {
  assert.deepEqual(browserOptions({}, 'linux'), {headless: true});
  assert.deepEqual(browserOptions({}, 'win32'), {headless: true, channel: 'chrome'});
  const cloud = browserOptions({EVA_REQUIRE_NVIDIA: '1'}, 'linux');
  assert.equal(cloud.channel, 'chromium', 'Use full Chromium new-headless, not headless-shell');
  assert.ok(cloud.args?.includes('--enable-gpu'));
  assert.ok(cloud.args?.includes('--use-angle=vulkan'));
  assert.ok(!cloud.args?.some((arg: string) => /swiftshader|unsafe-webgpu/.test(arg)));
});
