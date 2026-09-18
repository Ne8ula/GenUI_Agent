// Reuse the reviewed Ruflo package already installed in npm's cache.
// Do not download/update packages or run a project initializer at session start.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const version = '3.16.3';
const cache = process.env.npm_config_cache || (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'npm-cache')
  : path.join(homedir(), '.npm'));
const npxRoot = path.join(cache, '_npx');
const candidates = existsSync(npxRoot) ? readdirSync(npxRoot, { withFileTypes: true }) : [];
let entry;
for (const directory of candidates.filter(item => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const root = path.join(npxRoot, directory.name, 'node_modules', '@claude-flow', 'cli');
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const candidate = path.join(root, 'bin', 'mcp-server.js');
    if (pkg.name === '@claude-flow/cli' && pkg.version === version && existsSync(candidate)) {
      entry = candidate;
      break;
    }
  } catch { /* Other cached packages and incomplete installs are not candidates. */ }
}
if (!entry) {
  console.error(`Ruflo ${version} is not cached. Run: npx --yes @claude-flow/cli@${version} --version, then retry.`);
  process.exitCode = 1;
} else {
  await import(pathToFileURL(entry).href);
}
