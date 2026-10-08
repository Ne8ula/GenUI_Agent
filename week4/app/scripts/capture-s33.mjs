// Week 4 seed-33 pass capture: stills across the build, a real-time recording, a stepped (fixed frame time) clip,
// frame-time stats, a reduced-motion still, the focus screenshot and a few control checks.
// Fixture only: no camera, microphone, provider or desktop effect. Browser-only evidence; it is not a GPU, WebView2
// or Windows measurement. Evidence is never overwritten.
//
//   EVA_CAPTURE_DIR=/abs/path/to/<revision>/implementation \
//     [EVA_CAPTURE_BUILD_MS=12000 EVA_CAPTURE_IDLE_SECONDS=10 EVA_CAPTURE_SEED=33 EVA_CAPTURE_PORT=1443 \
//      EVA_CAPTURE_REALTIME=1 EVA_CAPTURE_STEPPED=1] node scripts/capture-s33.mjs
//
// The seed defaults to the look's own default (33 for the seed-33 look this script captures, 7 for the earlier
// arrival look), taken from the host's params module so the capture and the app cannot drift apart.
//
// Files go to $EVA_CAPTURE_DIR/after/ and $EVA_CAPTURE_DIR/checks.json; both must not exist yet.
//
// Two clips are recorded because they answer different questions:
//   realtime  Playwright's screencast of the page running on this machine's clock. It shows what this machine
//             really manages (software GL here is slow) and is the source of the life-to-wall ratio.
//   stepped   The same page on `clock=manual`: the host and life clocks advance exactly 1000/30 ms per frame, each
//             frame is a page screenshot piped to ffmpeg. It shows the intended motion at 30 fps whatever the frame
//             rate of the machine, and is the clip whose per-frame luma difference is compared with VB2.
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { browserOptions } from './browser-options.mjs';
// One percentile definition for the app and for the evidence.
import { summarize } from '../src/host/frameStats.ts';
// The host's own per-look default seed and its look-switch rule (both DOM-free, so Node can load them).
import { defaultSeedFor, seedAfterLookChange } from '../src/host/params.ts';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 1920, height: 1080 };
const FONT_FILE = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const STEP_FPS = 30;
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

const commands = [];
const failures = [];
const pageErrors = [];
const checks = { ok: false, startedAt: new Date().toISOString() };

function fail(message) {
  console.error(`capture-s33: ${message}`);
  process.exit(1);
}

function intEnv(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) fail(`${name} must be an integer in ${min}..${max}`);
  return Number(raw);
}

const flagEnv = (name) => process.env[name] !== '0';

const captureDir = process.env.EVA_CAPTURE_DIR;
if (!captureDir || !path.isAbsolute(captureDir)) fail('EVA_CAPTURE_DIR must be set to an absolute path');
const buildMs = intEnv('EVA_CAPTURE_BUILD_MS', 12000, 1000, 60000);
const idleSeconds = intEnv('EVA_CAPTURE_IDLE_SECONDS', 10, 1, 120);
const port = intEnv('EVA_CAPTURE_PORT', 1443, 1024, 65535);
/** The look this script captures; the URL always names it, so a changed host default cannot change the evidence. */
const look = 'seed33';
const seed = intEnv('EVA_CAPTURE_SEED', defaultSeedFor(look), 0, 9999);
const wantRealtime = flagEnv('EVA_CAPTURE_REALTIME');
const wantStepped = flagEnv('EVA_CAPTURE_STEPPED');
const afterDir = path.join(captureDir, 'after');
const checksPath = path.join(captureDir, 'checks.json');
const clipMs = buildMs + idleSeconds * 1000;
/** Idle time after the build for the "complete + 5 s" still, the reduced-motion still and the idle timing. */
const IDLE_STILL_MS = buildMs + 5000;

await mkdir(afterDir, { recursive: true });
// The packet's own placeholder README.md is the one file that may already be there; anything else is evidence.
if ((await readdir(afterDir)).some((name) => name !== 'README.md')) fail(`${afterDir} already contains files; evidence is never overwritten. Use a new EVA_CAPTURE_DIR.`);
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

/** The host URL for one fixture state. `look` is always explicit so a changed default cannot change the evidence. */
const url = (base, params) => {
  const query = new URLSearchParams({ look, build: String(buildMs), seed: String(seed), ...params });
  return `${base}/?fixture&${query.toString()}`;
};

/** True once the host reports its first successful draw; records a failure instead of throwing. */
async function waitReady(page, label) {
  try {
    await page.waitForSelector('canvas[data-ready="1"]', { state: 'attached', timeout: 90000 });
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

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const rounded = (summary) => (summary ? { samples: summary.count, median: round(summary.median), p95: round(summary.p95), max: round(summary.max) } : null);
const pad = (value) => String(value).padStart(3, '0');

/** `count` rAF intervals in the page, plus the host's own draw ms taken from the dataset once per drawn frame. */
async function measureTiming(page, reportedBackend, count, note) {
  const { intervals, draws } = await page.evaluate(
    (samples) =>
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
          if (intervals.length < samples) requestAnimationFrame(step);
          else resolve({ intervals, draws });
        };
        requestAnimationFrame(step);
      }),
    count,
  );
  const detail = await page.locator('canvas[data-ready="1"]').evaluate((canvas) => canvas.dataset.detail ?? null);
  return { note, label: timingLabel(reportedBackend, detail), backend: reportedBackend, frameIntervalMs: rounded(summarize(intervals)), drawMs: rounded(summarize(draws)) };
}

// ---- ffmpeg ---------------------------------------------------------------------------------------

function run(command, args) {
  commands.push([command, ...args].join(' '));
  return spawnSync(command, args, { encoding: 'utf8' });
}

const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

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

/** A 4 fps contact sheet of a whole clip, 10 columns, with timestamps; falls back to no timestamps without drawtext. */
function makeSheet(source, sheet, clipSeconds) {
  const rows = Math.max(1, Math.ceil((4 * clipSeconds) / 10));
  const withText = `fps=4,scale=480:-1,drawtext=fontfile=${FONT_FILE}:text='%{pts\\:hms}':x=8:y=8:fontsize=20:fontcolor=black:box=1:boxcolor=white@0.7,tile=10x${rows}`;
  const plain = `fps=4,scale=480:-1,tile=10x${rows}`;
  let result = existsSync(FONT_FILE) ? run('ffmpeg', ['-y', '-v', 'error', '-i', source, '-vf', withText, '-frames:v', '1', '-update', '1', sheet]) : { status: 1, stderr: 'font file missing' };
  let timestamps = result.status === 0;
  if (result.status !== 0) result = run('ffmpeg', ['-y', '-v', 'error', '-i', source, '-vf', plain, '-frames:v', '1', '-update', '1', sheet]);
  return result.status === 0
    ? { frameSheet: path.basename(sheet), frameSheetLayout: `10 columns x ${rows} rows at 4 fps, 480 px wide, ${timestamps ? 'timestamps from the start of the clip' : 'no timestamps (drawtext unavailable)'}` }
    : { frameSheetError: result.stderr.trim() };
}

function encodeRealtime(webm, trimStartSeconds) {
  const facts = { webm: path.basename(webm), ffmpeg: hasFfmpeg(), trimStartSeconds: round(trimStartSeconds, 2) };
  if (!facts.ffmpeg) {
    facts.note = 'ffmpeg is not on PATH; the webm is kept and no mp4 or frame sheet was produced.';
    return facts;
  }
  facts.webmProbe = probe(webm);
  const mp4 = webm.replace(/\.webm$/, '.mp4');
  const transcode = run('ffmpeg', ['-y', '-v', 'error', '-ss', String(trimStartSeconds), '-i', webm, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4]);
  if (transcode.status === 0) {
    facts.mp4 = path.basename(mp4);
    facts.mp4Probe = probe(mp4);
    const seconds = Number.isFinite(facts.mp4Probe.durationSeconds) ? facts.mp4Probe.durationSeconds : clipMs / 1000;
    Object.assign(facts, makeSheet(mp4, mp4.replace(/\.mp4$/, '-frames-4fps.png'), seconds));
  } else {
    facts.mp4Error = transcode.stderr.trim();
  }
  return facts;
}

// ---- Run ------------------------------------------------------------------------------------------

const STILLS = [
  { name: 'build-000pct', t: 0, backends: ['webgl2'] },
  { name: 'build-025pct', t: Math.round(buildMs * 0.25), backends: ['webgl2'] },
  { name: 'build-050pct', t: Math.round(buildMs * 0.5), backends: ['webgl2', 'canvas2d'] },
  { name: 'build-100pct', t: buildMs, backends: ['webgl2'] },
  { name: 'complete-plus-5s', t: IDLE_STILL_MS, backends: ['webgl2', 'canvas2d'] },
];

let browser = null;
try {
  const base = await startServer();
  commands.push(`node ${path.relative(appDir, fileURLToPath(import.meta.url))} (EVA_CAPTURE_BUILD_MS=${buildMs}, EVA_CAPTURE_IDLE_SECONDS=${idleSeconds}, EVA_CAPTURE_SEED=${seed}, EVA_CAPTURE_PORT=${port}, EVA_CAPTURE_REALTIME=${wantRealtime ? 1 : 0}, EVA_CAPTURE_STEPPED=${wantStepped ? 1 : 0})`);
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
    look,
    seed,
    seedNote: `seed ${seed}: ${process.env.EVA_CAPTURE_SEED ? 'set by EVA_CAPTURE_SEED' : `the ${look} look's default (host params defaultSeedFor)`}`,
    buildMs,
    idleSeconds,
    environment: null, // filled once the backends have reported their renderer strings
  });

  // Warm-up so Vite's first-load dependency optimisation cannot reload a page mid-capture. Not evidence.
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(url(base, { capture: '1', backend: 'canvas2d', paused: '1' }));
    await waitReady(page, 'warm-up');
    await context.close();
  }

  // ---- Stills: paused at a fixed host/life time, so each is reproducible --------------------------------
  const backends = {};
  const stills = [];
  for (const backend of ['webgl2', 'canvas2d']) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    watch(page, backend);
    const entry = { requested: backend };
    const shoot = async (name, t, extra) => {
      const label = `${backend}/${name}`;
      await page.goto(url(base, { capture: '1', backend, paused: '1', t: String(t), ...extra }));
      if (!(await waitReady(page, label))) return;
      await page.waitForTimeout(1200);
      const file = `${backend}-seed33-${name}.png`;
      await page.screenshot({ path: path.join(afterDir, file) });
      const data = await readDataset(page);
      const record = {
        file,
        name,
        requestedMs: t,
        backend: data.backend,
        detail: data.detail,
        look: data.look,
        buildMs: Number(data.buildMs),
        startMs: Number(data.startMs),
        timeMs: Number(data.timeMs),
        lifeMs: Number(data.lifeMs),
        particles: Number(data.particles),
        tiles: Number(data.tiles),
        tilesAuthored: Number(data.tilesAuthored),
        reduced: data.reduced === '1',
        degraded: data.degraded === '1',
        paused: data.paused === '1',
      };
      stills.push(record);
      entry.detail = data.detail;
      if (data.backend !== backend) failures.push(`${label}: requested ${backend} but the host reports ${data.backend}`);
      if (data.look !== look) failures.push(`${label}: the host reports look ${data.look}, not ${look}`);
      if (Number(data.seed) !== seed) failures.push(`${label}: the host reports seed ${data.seed}, expected ${seed}`);
      if (record.timeMs !== t || Math.abs(record.lifeMs - t) > 0.5) failures.push(`${label}: paused clocks read host ${record.timeMs} ms / life ${record.lifeMs} ms, expected ${t} ms`);
      if (record.particles <= 0) failures.push(`${label}: no particles were drawn`);
    };
    for (const still of STILLS) if (still.backends.includes(backend)) await shoot(still.name, still.t, {});
    if (backend === 'webgl2') await shoot('reduced-complete-plus-5s', IDLE_STILL_MS, { reduced: '1' });

    // Frame times on a live (unpaused) page: during the build for WebGL2, and at idle for both backends.
    entry.timing = {};
    const samples = backend === 'webgl2' ? 300 : 90;
    if (backend === 'webgl2') {
      await page.goto(url(base, { capture: '1', backend, t: '0' }));
      if (await waitReady(page, `${backend}/timing-build`)) entry.timing.construction = await measureTiming(page, backend, samples, `first ${samples} frame intervals of the build, from t = 0`);
    }
    await page.goto(url(base, { capture: '1', backend, t: String(IDLE_STILL_MS) }));
    if (await waitReady(page, `${backend}/timing-idle`)) entry.timing.idle = await measureTiming(page, backend, samples, `${samples} frame intervals at idle, from t = ${IDLE_STILL_MS} ms (build complete)`);
    backends[backend] = entry;
    await context.close();
  }
  checks.stills = stills;
  checks.backends = backends;
  checks.environment = environmentNote([...new Set(Object.values(backends).map((b) => b.detail).filter((d) => d && !/^Canvas2D/.test(d)))]);

  // ---- Real-time recording: webgl2, from t = 0, nothing touched ---------------------------------------
  if (wantRealtime) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, recordVideo: { dir: afterDir, size: VIEWPORT } });
    const page = await context.newPage();
    watch(page, 'realtime-video');
    await page.goto(url(base, { capture: '1', backend: 'webgl2', t: '0' }));
    if (await waitReady(page, 'realtime-video')) {
      await page.waitForTimeout(clipMs);
      // Life time against wall time over the recording: pacing is only real when the ratio is near 1.
      const lw = await readDataset(page);
      const lifeMs = Number(lw.lifeMs);
      const wallMs = Number(lw.wallMs);
      const startMs = Number(lw.startMs);
      const frames = Number(lw.frameCount);
      checks.realtime = {
        requestedMs: clipMs,
        lifeMs,
        startMs,
        wallMs,
        frames,
        meanFrameMs: frames > 0 ? round(wallMs / frames) : null,
        lifeToWallRatio: wallMs > 0 ? round((lifeMs - startMs) / wallMs, 3) : null,
        note: '(life ms - start ms) / wall ms from the first drawn frame to the end of the recording; near 1 means life kept pace with the clock. Frames is the number of drawn frames over the same span, so wall/frames is this machine\'s real frame time.',
      };
      const video = page.video();
      const closeStarted = Date.now();
      await context.close();
      const closeMs = Date.now() - closeStarted;
      const recorded = await video?.path();
      if (recorded) {
        const webm = path.join(afterDir, 'webgl2-realtime-build-idle.webm');
        await rename(recorded, webm);
        const webmProbe = hasFfmpeg() ? probe(webm) : { durationSeconds: Number.NaN };
        // The recording starts when the page is created; the build starts at the first drawn frame, wallMs before the
        // read-out. Trim the page-load seconds so the clip begins at t = 0. Approximate: Playwright gives no marker.
        const trim = Number.isFinite(webmProbe.durationSeconds) ? Math.max(0, webmProbe.durationSeconds - wallMs / 1000 - closeMs / 1000) : 0;
        checks.realtime.video = encodeRealtime(webm, trim);
        checks.realtime.video.trimMethod = `clip length ${round(webmProbe.durationSeconds ?? Number.NaN)} s - ${round(wallMs / 1000)} s of wall time since the first drawn frame - ${round(closeMs / 1000)} s context-close latency; approximate to a few tenths of a second`;
        checks.realtime.video.nominalFps = 'Playwright screencast, nominally 25 fps, transcoded with -r 30; duplicated or dropped frames are possible and the real frame time is meanFrameMs above';
      } else {
        failures.push('realtime-video: Playwright produced no recording');
      }
    } else {
      await context.close();
    }
  }

  // ---- Stepped clip: manual clock, one screenshot per 1000/30 ms, piped into ffmpeg ---------------------
  if (wantStepped) {
    if (!hasFfmpeg()) {
      failures.push('stepped-video: ffmpeg is not on PATH, so no stepped clip was produced');
    } else {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      const page = await context.newPage();
      watch(page, 'stepped-video');
      await page.goto(url(base, { capture: '1', backend: 'webgl2', t: '0', clock: 'manual' }));
      if (await waitReady(page, 'stepped-video')) {
        const hooked = await page.evaluate(() => typeof window.__evaFixture?.step === 'function').catch(() => false);
        if (!hooked) {
          failures.push('stepped-video: window.__evaFixture.step is missing; the host did not enter manual-clock mode');
        } else {
          const stepMs = 1000 / STEP_FPS;
          const frames = Math.round(clipMs / stepMs) + 1; // frame 0 is t = 0
          const mp4 = path.join(afterDir, `webgl2-stepped-${STEP_FPS}fps-build-idle.mp4`);
          const args = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(STEP_FPS), '-vcodec', 'png', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', mp4];
          commands.push(`ffmpeg ${args.join(' ')}   # fed ${frames} page screenshots (png) on stdin`);
          const encoder = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
          let encoderError = '';
          encoder.stderr.on('data', (chunk) => (encoderError += chunk.toString()));
          encoder.stdin.on('error', () => {}); // an ffmpeg that died is reported through its exit code
          const done = new Promise((resolve) => encoder.once('exit', resolve));
          const startedAt = Date.now();
          const frameWall = [];
          let written = 0;
          try {
            for (let i = 0; i < frames; i++) {
              const t0 = Date.now();
              if (i > 0) await page.evaluate((ms) => window.__evaFixture.step(ms), stepMs);
              const png = await page.screenshot({ type: 'png' });
              if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
              written += 1;
              frameWall.push(Date.now() - t0);
              if (i % 60 === 0) console.error(`capture-s33: stepped clip frame ${i + 1}/${frames}`);
            }
          } catch (error) {
            failures.push(`stepped-video: capture stopped at frame ${written}/${frames} (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
          }
          encoder.stdin.end();
          const code = await done;
          const final = await readDataset(page).catch(() => ({}));
          const stepped = {
            fps: STEP_FPS,
            stepMs: round(stepMs, 4),
            framesRequested: frames,
            framesWritten: written,
            wallSeconds: round((Date.now() - startedAt) / 1000, 1),
            meanSecondsPerFrame: written > 0 ? round(frameWall.reduce((a, b) => a + b, 0) / written / 1000, 3) : null,
            finalHostMs: Number(final.timeMs),
            finalLifeMs: Number(final.lifeMs),
            expectedFinalMs: round((frames - 1) * stepMs, 1),
            ffmpegExit: code,
            label: `frames are page screenshots at 1920x1080 taken after each ${round(stepMs, 2)} ms virtual step on clock=manual; ${browser.version()} on ${PLATFORM}. This shows the intended motion at ${STEP_FPS} fps, not real-time performance of this machine.`,
          };
          if (code !== 0) {
            failures.push(`stepped-video: ffmpeg exited ${code}: ${encoderError.trim().split('\n')[0] ?? ''}`);
          } else {
            stepped.mp4 = path.basename(mp4);
            stepped.mp4Probe = probe(mp4);
            const seconds = Number.isFinite(stepped.mp4Probe.durationSeconds) ? stepped.mp4Probe.durationSeconds : clipMs / 1000;
            Object.assign(stepped, makeSheet(mp4, mp4.replace(/\.mp4$/, '-frames-4fps.png'), seconds));
          }
          if (written === frames && Math.abs(stepped.finalHostMs - stepped.expectedFinalMs) > 1) failures.push(`stepped-video: the host clock ended at ${stepped.finalHostMs} ms, expected ${stepped.expectedFinalMs} ms`);
          if (written === frames && Math.abs(stepped.finalLifeMs - stepped.finalHostMs) > 1) failures.push(`stepped-video: the life clock ended at ${stepped.finalLifeMs} ms, not the host clock ${stepped.finalHostMs} ms`);
          checks.stepped = stepped;
        }
      }
      await context.close();
    }
  }

  // ---- Fixture bar: keyboard focus, status words and control checks ----------------------------------------
  {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    watch(page, 'fixture-bar');
    const midBuild = Math.round(buildMs / 2);
    // Paused mid-build so the status line shows "constructing 6.0 s of 12 s (paused)".
    await page.goto(url(base, { backend: 'webgl2', paused: '1', t: String(midBuild) }));
    if (await waitReady(page, 'fixture-bar')) {
      await page.waitForTimeout(1000);
      checks.statusLines = { midBuild: (await page.locator('.status').innerText()).trim() };
      const names = [];
      const describeFocus = () =>
        page.evaluate(() => {
          const element = document.activeElement;
          const labelledBy = element?.getAttribute('aria-labelledby');
          const name =
            element?.getAttribute('aria-label') ??
            (labelledBy ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : null) ??
            element?.labels?.[0]?.textContent ??
            element?.textContent ??
            '';
          return { tag: element?.tagName.toLowerCase() ?? null, name: name.trim() };
        });
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
      // Tab order: the first controls in reading order, so a reordered bar shows up in the evidence.
      names.push((await describeFocus()).name);
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        names.push((await describeFocus()).name);
      }
      checks.focus.tabOrderFromFirst = names;
    }
    await context.close();
  }
  {
    // Control checks on a paused page at the end of the build: tiles toggle, look switch, status wording.
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    watch(page, 'controls');
    await page.goto(url(base, { backend: 'webgl2', paused: '1', t: String(IDLE_STILL_MS) }));
    if (await waitReady(page, 'controls')) {
      await page.waitForTimeout(800);
      const tiles = async () => {
        await page.waitForTimeout(700);
        const data = await readDataset(page);
        return { shown: Number(data.tiles), authored: Number(data.tilesAuthored) };
      };
      const toggle = page.getByRole('button', { name: /^Tiles:/ });
      const before = await tiles();
      await toggle.click();
      const hidden = await tiles();
      const hiddenStatus = (await page.locator('.status').innerText()).trim();
      await toggle.click();
      const restored = await tiles();
      checks.tilesToggle = {
        before,
        afterOff: hidden,
        afterOn: restored,
        statusWhenHidden: hiddenStatus,
        ok: before.shown > 0 && before.shown === before.authored && hidden.shown === 0 && hidden.authored === before.authored && restored.shown === before.authored,
      };
      if (!checks.tilesToggle.ok) failures.push(`controls: the tiles toggle did not hide and restore the authored tiles (${JSON.stringify(checks.tilesToggle)})`);
      const complete = (await page.locator('.status').innerText()).trim();
      checks.statusLines = { ...checks.statusLines, complete };
      if (!/Build: complete/.test(complete)) failures.push(`controls: the status line does not say the build is complete at t = ${IDLE_STILL_MS} ms (${complete})`);
      if (!/Build: constructing/.test(checks.statusLines.midBuild ?? '')) failures.push(`controls: the status line does not say "constructing" mid-build (${checks.statusLines.midBuild})`);

      // Look switch: the arrival look has no build and no tiles, and says so in its labels.
      await page.getByLabel('Look', { exact: true }).selectOption('arrival');
      await page.waitForTimeout(1500);
      const arrival = await readDataset(page);
      // A seed still at the old look's default follows the new look's default (33 -> 7); a seed set by hand is kept.
      const expectedSeedAfter = seedAfterLookChange(seed, look, 'arrival');
      checks.lookSwitch = {
        lookAfter: arrival.look,
        seedAfter: Number(arrival.seed),
        expectedSeedAfter,
        tiles: Number(arrival.tiles),
        buildSelectDisabled: await page.getByLabel(/^Build length/).isDisabled(),
        tilesButtonDisabled: await toggle.isDisabled(),
        tilesButtonText: (await toggle.innerText()).trim(),
      };
      if (checks.lookSwitch.seedAfter !== expectedSeedAfter) failures.push(`controls: switching to the arrival look left seed ${checks.lookSwitch.seedAfter}, expected ${expectedSeedAfter}`);
      if (arrival.look !== 'arrival' || checks.lookSwitch.tiles !== 0 || !checks.lookSwitch.buildSelectDisabled) failures.push(`controls: switching to the arrival look did not behave as described (${JSON.stringify(checks.lookSwitch)})`);
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
  labels: {
    browser: true,
    native: false,
    camera: 'none',
    pose: 'none',
    realtimeClip: 'Playwright screencast of the page on this machine\'s clock; shows real pacing',
    steppedClip: 'page screenshots at a fixed virtual frame time; shows the intended motion, not machine performance',
    stillsFrameNote: 'stills are paused with the host clock and the life clock both at the stated t',
  },
});
await writeFile(checksPath, `${JSON.stringify(checks, null, 2)}\n`);
console.log(JSON.stringify(checks, null, 2));
process.exitCode = checks.ok ? 0 : 1;
