import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../..', import.meta.url));
const required = [
  'AGENTS.md', 'docs/development/AGENT_WORKFLOW.md',
  'week3/DESIGN.md', 'week3/PLANNING.md', 'week3/package-lock.json',
  'week3/docs/design/REFERENCE_REFINEMENT.md',
  'week3/src/visual/week1-eye.ts', 'week3/src/visual/eye-mesh.ts',
  'week3/src/visual/eye-interaction.ts', 'week3/src/voice/conversation.ts',
  'week3/src/voice/contracts.ts', 'week3/src-tauri/src/providers.rs',
  'week1/apps/desktop/src/SignalEye.tsx',
  'week1/docs/design/revisions/week1-biomech-20260917/browser-02/look-right.png',
  'week3/pivot_references/0268915e2cc8124b9d5b9c99545f8736.gif',
  'week3/pivot_references/12db78e771a340acc35cd34c9e8b2bd8.mp4',
];
const missing = [];
for (const path of required) { try { await access(join(root, path)); } catch { missing.push(path); } }
let references = [];
try { references = await readdir(join(root, 'week3/pivot_references')); } catch { /* Report below. */ }
if (!references.some(name => name.startsWith('From Klickpin.com-') && name.endsWith('.mp4'))) missing.push('week3/pivot_references/[box-overlay MP4]');
if (missing.length) {
  console.error(JSON.stringify({ ready: false, missing, action: 'Use the owner-approved CURRENT Week 3 snapshot. A normal Cloud clone cannot see uncommitted or untracked local files. Do not recreate or redesign from an older snapshot.' }, null, 2));
  process.exitCode = 1;
} else {
  const providers = await readFile(join(root, 'week3/src-tauri/src/providers.rs'), 'utf8');
  if (!providers.includes('decide_conversation')) throw new Error('Expected interim decider seam missing; ask before changing the shared contract.');
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (git.status !== 0) throw new Error('A repository checkout is required for this handoff');
  console.log(JSON.stringify({ ready: true, revision: git.stdout.trim(), references: references.filter(name => /\.(jpg|png|gif|mp4)$/i.test(name)), runtimeVoiceCallsAllowed: false, reviewEveryPasses: 3 }, null, 2));
}
