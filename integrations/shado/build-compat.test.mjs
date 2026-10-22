import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('bundled skill builder gives identical manifests for LF and Windows CRLF sources', () => {
  const patch = readFileSync(new URL('./shado-windows-build-compat.patch', import.meta.url), 'utf8');
  const hunk = patch.slice(patch.indexOf('\n@@'));
  const script = hunk.split('\n').filter(line => line.startsWith('+') || line.startsWith(' '))
    .map(line => line.slice(1)).join('\n');
  assert.match(script, /replace\(\/\\r\\n\/g, '\\n'\)/);
  const root = mkdtempSync(path.join(tmpdir(), 'shado-skills-newlines-'));
  try {
    const outputs = ['\n', '\r\n'].map((newline, index) => {
      const fixture = path.join(root, String(index));
      mkdirSync(path.join(fixture, 'scripts'), { recursive: true });
      writeFileSync(path.join(fixture, 'scripts/build-codex-skills.mjs'), script);
      for (const name of ['shado-directing', 'shado-video-editing', 'shado-canvas']) {
        mkdirSync(path.join(fixture, 'skills', name), { recursive: true });
        writeFileSync(path.join(fixture, 'skills', name, 'SKILL.md'), [
          '---', `name: ${name}`, 'description: A bounded fixture', '---',
          '', '# Instructions', 'Preserve Unicode: café. Keep literal \\n escapes.', '',
        ].join(newline));
      }
      execFileSync(process.execPath, [path.join(fixture, 'scripts/build-codex-skills.mjs')]);
      return JSON.parse(readFileSync(path.join(fixture, '.generated/codex-skills.json'), 'utf8'));
    });
    assert.deepEqual(outputs[0], outputs[1]);
    assert.equal(outputs[0].manifests.length, 3);
    assert.match(outputs[0].version, /^[a-f0-9]{64}$/);
    assert.match(outputs[0].manifests[0].text, /café.*literal \\n escapes/);
  } finally {
    const resolvedRoot = path.resolve(root);
    assert.equal(path.dirname(resolvedRoot), path.resolve(tmpdir()));
    assert.ok(path.basename(resolvedRoot).startsWith('shado-skills-newlines-'));
    rmSync(resolvedRoot, { recursive: true, force: true });
  }
});
