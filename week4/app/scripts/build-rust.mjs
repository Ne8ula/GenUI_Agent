import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const week = path.resolve(app, '..');
const executable = process.platform === 'win32' ? 'wasm-bindgen.exe' : 'wasm-bindgen';
const local = path.join(week, 'target', 'wasm-tools', 'bin', executable);
const tool = existsSync(local) ? local : executable;
function run(command, args) {
  const result = spawnSync(command, args, { cwd: week, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
const version = spawnSync(tool, ['--version'], { encoding: 'utf8', shell: false });
if (version.status !== 0 || version.stdout.trim() !== 'wasm-bindgen 0.2.128') {
  throw new Error('Install matching tooling: cargo install wasm-bindgen-cli --version 0.2.128 --locked --root week4/target/wasm-tools --jobs 2 (from repository root)');
}
run('cargo', ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'eva-seed33-renderer', '--jobs', '2']);
const out = path.join(app, 'src', 'generated', 'seed33');
mkdirSync(out, { recursive: true });
run(tool, [path.join(week, 'target', 'wasm32-unknown-unknown', 'release', 'eva_seed33_renderer.wasm'), '--target', 'web', '--out-dir', out]);
console.log('Built Rust-owned Seed-33 WASM renderer (no reference-image resources).');
