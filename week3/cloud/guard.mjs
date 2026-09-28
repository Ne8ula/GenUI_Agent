import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../..', import.meta.url));
const [action, destination] = process.argv.slice(2);
if (!['init', 'check'].includes(action) || !destination) throw new Error('Usage: guard.mjs init|check <scratch-baseline.json>');
const protectedPaths = ['week1', 'week2', 'week3/pivot_references', 'week3/src/voice', 'week3/src-tauri', 'week3/schemas', 'week3/fixtures', '.claude', '.mcp.json', 'AGENTS.md', 'CLAUDE.md', 'docs/development/AGENT_WORKFLOW.md'];
// Git excludes ignored private environment files, node_modules, target and worktrees.
const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...protectedPaths], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (listed.status !== 0) throw new Error('Cannot inventory protected files');
const paths = [...new Set(listed.stdout.split('\0').filter(Boolean))].sort();
const current = {};
for (const path of paths) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(root, path))) hash.update(chunk);
  current[path] = hash.digest('hex');
}
const file = resolve(destination);
let previous;
try { previous = JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!previous) {
  if (action !== 'init') throw new Error('Protected baseline missing; initialize before any source edits');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ root, files: current }, null, 2), { flag: 'wx' });
  console.log(`Protected baseline saved (${paths.length} files; no contents or credentials printed).`);
} else {
  if (previous.root !== root) throw new Error('Baseline belongs to another checkout; use a separate scratch directory');
  const changed = [...new Set([...Object.keys(previous.files), ...paths])].filter(path => previous.files[path] !== current[path]);
  if (changed.length) {
    console.error(JSON.stringify({ protectedFilesChanged: changed, action: 'Stop and report. Do not rewrite this baseline or discard someone else’s edits.' }, null, 2));
    process.exitCode = 1;
  } else console.log(`Protected paths unchanged (${paths.length} files).`);
}
