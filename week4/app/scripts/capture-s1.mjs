// Week 4 step 1 capture: arrival-frame screenshots, frame timing, an idle video and a focus screenshot.
// Fixture only: no camera, microphone, provider or desktop effect. Browser-only evidence; it is not
// a GPU, WebView2 or Windows measurement. Evidence is never overwritten.
//
//   EVA_CAPTURE_DIR=/abs/path [EVA_CAPTURE_SECONDS=25 EVA_CAPTURE_PORT=1443 EVA_CAPTURE_SEED=7] \
//     node scripts/capture-s1.mjs
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { browserOptions } from './browser-options.mjs';
// One percentile definition for the app and for the evidence.
import { summarize } from '../src/host/frameStats.ts';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 1920, height: 1080 };
const FONT_FILE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const TIMING_SAMPLES = 300;
// Labels are derived from the actual platform and the renderer string the host reported, never
// hard-coded. Whatever the GPU, this script only ever produces browser evidence (headless
// Chromium under Playwright), never a WebView2 or Windows-shell measurement.
const PLATFORM = `${process.platform} ${os.release()} (${os.arch()}, ${os.cpus().length} CPU)`;
const isSoftwareGl = (detail) => /swiftshader|llvmpipe|software|mesa offscreen/i.test(detail ?? '');
const timingLabel = (backend, detail) =>
  backend === 'webgl2'
    ? `headless Chromium on ${PLATFORM}; WebGL2 renderer "${detail ?? 'unknown'}" — ${isSoftwareGl(detail) ? 'software GL, not GPU evidence' : 'hardware-reported renderer, still browser evidence'}; not a WebView2 or Windows-shell measurement`
    : `headless Chromium on ${PLATFORM}; Canvas2D on the CPU; browser evidence, not a WebView2 or Windows-shell measurement`;
const environmentNote = (details) =>
  `${PLATFORM}; browser-only evidence (Playwright headless Chromium). WebGL2 renderer reported: ${details.length ? details.join(' | ') : 'none'}${details.some(isSoftwareGl) ? ' (software GL)' : ''}. No WebView2, Windows shell, camera or pose input was involved.`;
/** Stills are taken with idle life advanced to a fixed time and paused, so they are reproducible. */
const STILL_LIFE_MS = 3000;

const commands = [];
const failures = [];
const pageErrors = [];
const checks = { ok: false, startedAt: new Date().toISOString() };

function fail(message) {
  console.error(`capture-s1: ${message}`);
  process.exit(1);
}

function intEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) fail(`${name} must be an integer in ${min}..${max}`);
  return Number(raw);
}

const captureDir = process.env.EVA_CAPTURE_DIR;
if (!captureDir || !path.isAbsolute(captureDir)) fail('EVA_CAPTURE_DIR must be set to an absolute path');
const seconds = intEnv('EVA_CAPTURE_SECONDS', 25, 1, 600);
const port = intEnv('EVA_CAPTURE_PORT', 1443, 1024, 65535);
const seed = intEnv('EVA_CAPTURE_SEED', 7, 0, 9999);
const afterDir = path.join(captureDir, 'after');
const checksPath = path.join(captureDir, 'checks.json');

await mkdir(afterDir, { recursive: true });
if ((await readdir(afterDir)).length > 0) fail(`${afterDir} already contains files; evidence is never overwritten. Use a new EVA_CAPTURE_DIR.`);
if (existsSync(checksPath)) fail(`${checksPath} already exists; evidence is never overwritten. Use a new EVA_CAPTURE_DIR.`);

// ---- Vite dev server ------------------------------------------------------------------------------

function findViteBin(start) {
  const name = process.platform === 'win32' ? 'vite.cmd' : 'vite';
  for (let dir = start; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', '.bin', name);
    if (existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir) return null;
  }
}

let server = null;
async function stopServer() {
  const child = server;
  server = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
    child.once('exit', () => {
      clearTimeout(kill);
      resolve();
    });
    child.kill('SIGTERM');
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void stopServer().finally(() => process.exit(130));
  });
}
process.on('exit', () => server?.kill('SIGKILL'));

function startServer() {
  const vite = findViteBin(appDir);
  if (!vite) throw new Error('could not find node_modules/.bin/vite; run npm ci in week4 first');
  const args = ['--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  commands.push(`(cd ${appDir} && ${path.relative(appDir, vite) || vite} ${args.join(' ')})`);
  server = spawn(vite, args, {
    cwd: appDir,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Vite did not print its local URL within 60 s:\n${output.slice(-1500)}`)), 60000);
    const onData = (chunk) => {
      output += chunk.toString();
      // eslint-disable-next-line no-control-regex
      const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
      const match = plain.match(/Local:\s+(http:\/\/[^\s]+)/);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1].replace(/\/$/, ''));
      }
    };
    server.stdout.on('data', onData);
    server.stderr.on('data', onData);
    server.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Vite exited early with code ${code}:\n${output.slice(-1500)}`));
    });
  });
}

// ---- Page helpers ---------------------------------------------------------------------------------

function watch(page, label) {
  page.on('pageerror', (error) => pageErrors.push(`[${label}] pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(`[${label}] console.error: ${message.text()}`);
  });
}

const url = (base, query) => `${base}/?${query}`;

/** True once the host reports its first successful draw; records a failure instead of throwing. */
async function waitReady(page, label) {
  try {
    await page.waitForSelector('canvas[data-ready="1"]', { state: 'attached', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    return true;
  } catch (error) {
    failures.push(`${label}: canvas[data-ready="1"] never appeared (${error.message.split('\n')[0]})`);
    return false;
  }
}

async function readDataset(page) {
  return page.locator('canvas[data-ready="1"]').evaluate((canvas) => ({ ...canvas.dataset }));
}

const round = (value) => Math.round(value * 100) / 100;
const rounded = (summary) => (summary ? { samples: summary.count, median: round(summary.median), p95: round(summary.p95), max: round(summary.max) } : null);

/** 300 rAF intervals in the page, plus the host's own draw ms taken from the dataset once per drawn frame. */
async function measureTiming(page, reportedBackend) {
  const { intervals, draws } = await page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const canvas = document.querySelector('canvas[data-ready="1"]');
        const intervals = [];
        const draws = [];
        let previous = null;
        let seen = Number(canvas?.dataset.frameCount ?? 0);
        const step = (now) => {
          if (previous !== null) intervals.push(now - previous);
          previous = now;
          const drawn = Number(canvas?.dataset.frameCount ?? 0);
          if (drawn !== seen) {
            draws.push(Number(canvas?.dataset.drawMs ?? 0));
            seen = drawn;
          }
          if (intervals.length < count) requestAnimationFrame(step);
          else resolve({ intervals, draws });
        };
        requestAnimationFrame(step);
      }),
    TIMING_SAMPLES,
  );
  const detail = await page.locator('canvas[data-ready="1"]').evaluate((canvas) => canvas.dataset.detail ?? null);
  return { label: timingLabel(reportedBackend, detail), backend: reportedBackend, frameIntervalMs: rounded(summarize(intervals)), drawMs: rounded(summarize(draws)) };
}

// ---- ffmpeg ---------------------------------------------------------------------------------------

function run(command, args) {
  commands.push([command, ...args].join(' '));
  return spawnSync(command, args, { encoding: 'utf8' });
}

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;
}

function ratio(text) {
  const [a, b] = String(text ?? '').split('/').map(Number);
  return a && b ? a / b : Number(text) || null;
}

function probe(file) {
  const result = run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration:format=duration',
    '-of', 'json', file,
  ]);
  if (result.status !== 0) return { error: result.stderr.trim() };
  const parsed = JSON.parse(result.stdout);
  const stream = parsed.streams?.[0] ?? {};
  return {
    codec: stream.codec_name,
    pixelFormat: stream.pix_fmt,
    width: stream.width,
    height: stream.height,
    reportedFps: ratio(stream.r_frame_rate),
    averageFps: ratio(stream.avg_frame_rate),
    frames: Number(stream.nb_read_frames),
    durationSeconds: Number(stream.duration ?? parsed.format?.duration),
  };
}

function encodeVideo(webm) {
  const facts = { webm: path.basename(webm), ffmpeg: hasFfmpeg() };
  if (!facts.ffmpeg) {
    facts.note = 'ffmpeg is not on PATH; the webm is kept and no mp4 or frame sheet was produced.';
    return facts;
  }
  const mp4 = webm.replace(/\.webm$/, '.mp4');
  const transcode = run('ffmpeg', ['-y', '-v', 'error', '-i', webm, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4]);
  if (transcode.status === 0) {
    facts.mp4 = path.basename(mp4);
    facts.mp4Probe = probe(mp4);
  } else {
    facts.mp4Error = transcode.stderr.trim();
  }
  // The sheet covers the whole clip: the page-load seconds plus the idle seconds, 4 frames per second, 10 columns.
  const webmProbe = probe(webm);
  facts.webmProbe = webmProbe;
  const clipSeconds = Number.isFinite(webmProbe.durationSeconds) ? webmProbe.durationSeconds : seconds;
  const rows = Math.max(1, Math.ceil((4 * clipSeconds) / 10));
  const sheet = path.join(path.dirname(webm), 'webgl2-idle-frames-4fps.png');
  const filter =
    `fps=4,scale=480:-1,drawtext=fontfile=${FONT_FILE}:text='%{pts\\:hms}':x=8:y=8:fontsize=20:fontcolor=black:box=1:boxcolor=white@0.7,tile=10x${rows}`;
  const sheetRun = run('ffmpeg', ['-y', '-v', 'error', '-i', webm, '-vf', filter, '-frames:v', '1', '-update', '1', sheet]);
  if (sheetRun.status === 0) {
    facts.frameSheet = path.basename(sheet);
    facts.frameSheetLayout = `10 columns x ${rows} rows at 4 fps, 480 px wide, timestamps from the start of the recording`;
  } else {
    facts.frameSheetError = sheetRun.stderr.trim();
  }
  return facts;
}

// ---- Run ------------------------------------------------------------------------------------------

let browser = null;
try {
  const base = await startServer();
  commands.push(`node ${path.relative(appDir, fileURLToPath(import.meta.url))} (EVA_CAPTURE_SECONDS=${seconds}, EVA_CAPTURE_PORT=${port}, EVA_CAPTURE_SEED=${seed})`);
  browser = await chromium.launch(browserOptions());
  const require = createRequire(import.meta.url);
  Object.assign(checks, {
    versions: {
      node: process.version,
      playwright: JSON.parse(readFileSync(require.resolve('playwright/package.json'), 'utf8')).version,
      chromium: browser.version(),
    },
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    baseUrl: base,
    seed,
    idleSeconds: seconds,
    environment: null, // filled once the backends have reported their renderer strings
  });

  // Warm-up so Vite's first-load dependency optimisation cannot reload a page mid-capture. Not evidence.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(url(base, 'fixture&capture=1&backend=canvas2d'));
    await waitReady(page, 'warm-up');
    await context.close();
  }

  const backends = {};
  for (const backend of ['webgl2', 'canvas2d']) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    watch(page, backend);
    const entry = { requested: backend, arrivals: {} };
    for (const facing of ['away', 'toward']) {
      const label = `${backend}/${facing}`;
      // Still: life advanced to STILL_LIFE_MS before the first draw, then paused, so the frame is reproducible.
      await page.goto(url(base, `fixture&capture=1&backend=${backend}&seed=${seed}&facing=${facing}&paused=1&life=${STILL_LIFE_MS}`));
      if (!(await waitReady(page, label))) continue;
      await page.waitForTimeout(1500);
      const file = `${backend}-arrival-facing-${facing}.png`;
      await page.screenshot({ path: path.join(afterDir, file) });
      const data = await readDataset(page);
      entry.arrivals[facing] = {
        file,
        backend: data.backend,
        detail: data.detail,
        particles: Number(data.particles),
        degraded: data.degraded === '1',
        seed: Number(data.seed),
        density: Number(data.density),
        facing: data.facing,
        lifeMs: Number(data.lifeMs),
        paused: data.paused === '1',
      };
      if (data.backend !== backend) failures.push(`${label}: requested ${backend} but the host reports ${data.backend}`);
      if (facing === 'away') {
        // Timing runs on a live (unpaused) page.
        await page.goto(url(base, `fixture&capture=1&backend=${backend}&seed=${seed}&facing=${facing}`));
        if (await waitReady(page, `${label}/timing`)) entry.timing = await measureTiming(page, data.backend);
      }
    }
    backends[backend] = entry;
    await context.close();
  }
  checks.backends = backends;
  checks.environment = environmentNote([...new Set(Object.values(backends).flatMap((b) => Object.values(b.arrivals).map((a) => a.detail)).filter((d) => d && !/^Canvas2D/.test(d)))]);

  // Idle video: webgl2, facing away, nothing touched.
  {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      recordVideo: { dir: afterDir, size: VIEWPORT },
    });
    const page = await context.newPage();
    watch(page, 'idle-video');
    await page.goto(url(base, `fixture&capture=1&backend=webgl2&seed=${seed}&facing=away`));
    await waitReady(page, 'idle-video');
    await page.waitForTimeout(seconds * 1000);
    // Life time against wall time over the recording: pacing is only real when the ratio is near 1.
    const lifeWall = await page.locator('canvas[data-ready="1"]').evaluate((canvas) => ({ lifeMs: Number(canvas.dataset.lifeMs), wallMs: Number(canvas.dataset.wallMs), frames: Number(canvas.dataset.frameCount) }));
    checks.videoLife = { ...lifeWall, lifeToWallRatio: lifeWall.wallMs > 0 ? Math.round((lifeWall.lifeMs / lifeWall.wallMs) * 1000) / 1000 : null, note: 'life ms / wall ms during the recording; drawn frames over the same span' };
    const video = page.video();
    await context.close();
    const recorded = await video?.path();
    if (recorded) {
      const webm = path.join(afterDir, `webgl2-idle-${seconds}s.webm`);
      await rename(recorded, webm);
      checks.video = encodeVideo(webm);
    } else {
      failures.push('idle-video: Playwright produced no recording');
    }
  }

  // Fixture bar with the first keyboard focus.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    watch(page, 'fixture-bar');
    await page.goto(url(base, `fixture&backend=webgl2&seed=${seed}`));
    if (await waitReady(page, 'fixture-bar')) {
      await page.keyboard.press('Tab');
      await page.screenshot({ path: path.join(afterDir, 'fixture-controls-focus.png') });
      checks.focus = await page.evaluate(() => {
        const element = document.activeElement;
        const labelledBy = element?.getAttribute('aria-labelledby');
        const name =
          element?.getAttribute('aria-label') ??
          (labelledBy ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : null) ??
          element?.labels?.[0]?.textContent ??
          element?.textContent ??
          '';
        const bar = document.querySelector('.bar');
        const stage = document.querySelector('.stage');
        return {
          tag: element?.tagName.toLowerCase() ?? null,
          accessibleName: name.trim(),
          matchesFocusVisible: element?.matches(':focus-visible') ?? false,
          outline: element ? getComputedStyle(element).outline : null,
          barHeightPx: bar ? Math.round(bar.getBoundingClientRect().height * 10) / 10 : null,
          stageHeightPx: stage ? Math.round(stage.getBoundingClientRect().height * 10) / 10 : null,
          barOverlapsStage: bar && stage ? bar.getBoundingClientRect().top < stage.getBoundingClientRect().bottom - 0.5 : null,
        };
      });
      try {
        checks.focus.ariaSnapshot = (await page.locator(':focus').ariaSnapshot()).trim();
      } catch (error) {
        checks.focus.ariaSnapshotError = error.message.split('\n')[0];
      }
    }
    await context.close();
  }
} catch (error) {
  failures.push(`fatal: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser?.close().catch(() => {});
  await stopServer();
}

// ---- Report ---------------------------------------------------------------------------------------

const files = [];
for (const name of (await readdir(afterDir)).sort()) files.push({ name: `after/${name}`, bytes: (await stat(path.join(afterDir, name))).size });
if (pageErrors.length > 0) failures.push(`${pageErrors.length} page error(s) recorded`);
Object.assign(checks, {
  ok: failures.length === 0,
  finishedAt: new Date().toISOString(),
  commands,
  pageErrors,
  failures,
  files,
  labels: { browser: true, native: false, camera: 'none', pose: 'none' },
});
await writeFile(checksPath, `${JSON.stringify(checks, null, 2)}\n`);
console.log(JSON.stringify(checks, null, 2));
process.exitCode = checks.ok ? 0 : 1;
