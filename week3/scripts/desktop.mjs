import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const env = { ...process.env };
if (args.includes('--reuse-preview')) {
  args.splice(args.indexOf('--reuse-preview'), 1);
  args.push('--config', JSON.stringify({ build: { beforeDevCommand: '' } }));
}
// Explicit opt-in; reuse only the nonsecret approved voice ID, never archived API keys.
if (args.includes('--previous-voice')) {
  args.splice(args.indexOf('--previous-voice'), 1);
  if (!env.ELEVENLABS_VOICE_ID) {
    try {
      const text = await readFile(new URL('../../week1/.env.local', import.meta.url), 'utf8');
      const line = text.split(/\r?\n/).find(line => /^ELEVENLABS_VOICE_ID\s*=/.test(line));
      const id = line?.slice(line.indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
      if (!id || !/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw new Error();
      env.ELEVENLABS_VOICE_ID = id;
    } catch {
      console.error('Previous voice ID unavailable. Configure ELEVENLABS_VOICE_ID outside the repository.');
      process.exit(1);
    }
  }
}
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url)), 'dev', ...args], {
  cwd: fileURLToPath(new URL('..', import.meta.url)), env, stdio: 'inherit',
});
child.on('error', () => { console.error('Could not launch Tauri. Run npm ci in week3 first.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
