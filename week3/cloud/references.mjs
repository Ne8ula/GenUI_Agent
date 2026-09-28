import { readdir, readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const input = join(root, 'week3/pivot_references');
const output = join(resolve(process.env.EVA_SCULPT_WORK_DIR ?? '/tmp/eva-w3-sculpt'), 'references');
export function sampling(duration, gifFrames = 0) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Missing/invalid media duration');
  if (gifFrames > 0 && gifFrames <= 48) return { allFrames: true, frameSlots: gifFrames, fps: null };
  const fps = Math.min(duration < 10 ? 2 : 1, 48 / duration);
  return { allFrames: false, frameSlots: Math.min(48, Math.max(1, Math.ceil(duration * fps))), fps };
}
function run(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 2 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${program} failed: ${result.error?.message ?? result.stderr.slice(-1200)}`);
  return result.stdout;
}
async function exists(path) { try { await access(path); return true; } catch { return false; } }

export async function prepareReferences() {
  await mkdir(output, { recursive: true });
  const records = [];
  const names = (await readdir(input)).filter(name => /\.(jpg|jpeg|png|gif|mp4)$/i.test(name)).sort();
  for (const [index, name] of names.entries()) {
    const source = join(input, name);
    const bytes = await readFile(source);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const record = { source: `week3/pivot_references/${name}`, sha256 };
    if (!/\.(gif|mp4)$/i.test(name)) { records.push({ ...record, kind: 'original-still' }); continue; }
    const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,avg_frame_rate,nb_frames', '-of', 'json', source]));
    const stream = info.streams.find(item => item.width && item.height);
    if (!stream) throw new Error(`Video stream missing: ${name}`);
    const duration = Number(info.format.duration);
    const plan = sampling(duration, extname(name).toLowerCase() === '.gif' ? Number(stream.nb_frames) : 0);
    const subdir = `ref-${index + 1}-${sha256.slice(0, 10)}`;
    const dir = join(output, subdir);
    await mkdir(dir, { recursive: true });
    const contact = join(dir, 'contact.png');
    if (!await exists(contact)) {
      const rate = plan.allFrames ? '' : `fps=${plan.fps},`;
      const rows = Math.ceil(plan.frameSlots / 6);
      const filter = `${rate}scale=256:256:force_original_aspect_ratio=decrease,pad=256:256:(ow-iw)/2:(oh-ih)/2:color=0x16181b,tile=6x${rows}:nb_frames=${plan.frameSlots}`;
      run('ffmpeg', ['-nostdin', '-n', '-v', 'error', '-i', source, '-vf', filter, '-frames:v', '1', contact]);
    }
    const detailFrames = [];
    for (const fraction of [.2, .5, .8]) {
      const name = `detail-${Math.round(fraction * 100)}.png`;
      if (!await exists(join(dir, name))) run('ffmpeg', ['-nostdin', '-n', '-v', 'error', '-ss', String(duration * fraction), '-i', source, '-frames:v', '1', join(dir, name)]);
      detailFrames.push({ file: `${subdir}/${name}`, seconds: duration * fraction });
    }
    records.push({ ...record, kind: 'motion-reference', duration, width: stream.width, height: stream.height, originalFrameRate: stream.avg_frame_rate, sampling: plan, contact: `${subdir}/contact.png`, detailFrames });
  }
  const manifest = { referenceDirectory: 'week3/pivot_references', records, note: 'Private analysis copies only, not licensed runtime assets. frameSlots is contact-sheet capacity; final slots may be empty. Contact sheets sample time; inspect original motion where supported. No audio extracted.' };
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Reference study prepared: ${join(output, 'manifest.json')} (${records.length} references).`);
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareReferences();
