#!/usr/bin/env node
// Renderer smoke: starts the Vite dev server on 127.0.0.1:1442, opens render-dev.html with each backend in
// headless Chromium (Playwright), checks the data attributes, reads back pixels, samples 120 rAF intervals
// and draw times, exercises WebGL2 context loss/restore and the Canvas2D stride budget, checks the dev sky
// gradient and the five test tiles (flat, dither, dot grid, scanline, transparent-with-hairline) plus the
// tiles-off and no-sky (paper grain) paths, checks the sky wedge (?skywedge=1: Sky.polygon clipping) on both
// backends — the top-left corner of the frame is ground while a pixel inside the wedge is sky — checks on a
// letterboxed viewport (1280×800: 40-px margins above and below the 16:9 frame) that nothing paints the margins
// (the sky wedge starts above the frame top; tiles and hairlines are scissored/clipped to the frame rect; the dev
// tiles sit at the top of the frame, so an actual hairline overflow is not produced here) and writes
// screenshots to a temp dir under os.tmpdir().
// Nothing is written inside the repository. Exit code 1 on any failure.
//
// Timings here describe this machine's Chromium; on a software GL (SwiftShader) host they are not GPU evidence.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(appDir, 'package.json'));
const { chromium } = require('playwright');

const PORT = 1442;
const HOST = '127.0.0.1';
const VIEWPORT = { width: 1280, height: 720 };
const SAMPLE_FRAMES = 120;

/** Walks up from the app dir to find vite's entry (node_modules is hoisted to week4/node_modules). */
function resolveViteBin() {
  let dir = appDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'node_modules', 'vite', 'bin', 'vite.js');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // vite's package "exports" hides ./bin, so require.resolve cannot be used as a fallback.
  throw new Error(`could not find node_modules/vite/bin/vite.js above ${appDir}; run npm ci in week4`);
}

function startServer() {
  const bin = resolveViteBin();
  const child = spawn(process.execPath, [bin, '--host', HOST, '--port', String(PORT), '--strictPort'], {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  let log = '';
  const url = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`vite did not report a local URL within 30 s\n${log}`)), 30_000);
    const onData = (chunk) => {
      const text = chunk.toString();
      log += text;
      const m = /Local:\s+(https?:\/\/[^\s]+)/.exec(log);
      if (m) {
        clearTimeout(timer);
        resolve(m[1].replace(/\/$/, ''));
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`vite exited early with code ${code}\n${log}`));
    });
  });
  return { child, url, log: () => log };
}

function quantiles(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return { median: null, p95: null, n: 0 };
  const at = (q) => v[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))];
  return { median: round(at(0.5)), p95: round(at(0.95)), n: v.length, min: round(v[0]), max: round(v[v.length - 1]) };
}
const round = (x) => Math.round(x * 1000) / 1000;

/** Reads a canvas back through a 2D copy and samples a grid against the paper colour. */
async function samplePixels(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('scene');
    const paper = window.__evaRenderDev.scene.paper.map((c) => Math.round(c * 255));
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, off.width, off.height).data;
    const stepX = Math.max(1, Math.floor(off.width / 160));
    const stepY = Math.max(1, Math.floor(off.height / 90));
    let samples = 0;
    let nonPaper = 0;
    let nearPaper = 0;
    let sum = [0, 0, 0];
    let distinct = new Set();
    for (let y = 0; y < off.height; y += stepY) {
      for (let x = 0; x < off.width; x += stepX) {
        const o = (y * off.width + x) * 4;
        const r = data[o];
        const g = data[o + 1];
        const b = data[o + 2];
        samples++;
        sum[0] += r;
        sum[1] += g;
        sum[2] += b;
        distinct.add((r << 16) | (g << 8) | b);
        const diff = Math.max(Math.abs(r - paper[0]), Math.abs(g - paper[1]), Math.abs(b - paper[2]));
        if (diff > 24) nonPaper++;
        else if (diff > 0) nearPaper++;
      }
    }
    return {
      paper,
      samples,
      nonPaperFraction: Math.round((nonPaper / samples) * 1000) / 1000,
      grainFraction: Math.round((nearPaper / samples) * 1000) / 1000,
      distinctColours: distinct.size,
      mean: sum.map((s) => Math.round(s / samples)),
      canvasSize: [off.width, off.height],
    };
  });
}

/** Samples SAMPLE_FRAMES rAF intervals and the renderer's lastDrawMs after each frame. */
async function sampleTimings(page) {
  return page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        const intervals = [];
        const draws = [];
        let last = null;
        const step = (t) => {
          if (last !== null) {
            intervals.push(t - last);
            draws.push(window.__evaRenderDev.stats().lastDrawMs);
          }
          last = t;
          if (intervals.length >= frames) resolve({ intervals, draws });
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    SAMPLE_FRAMES,
  );
}

/**
 * Sky and tile checks against the dev page's own scene and last view (device px). Reads the canvas through a 2D
 * copy. Returns per-check results; `failures` lists what did not hold.
 */
async function sampleSkyAndTiles(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('scene');
    const dev = window.__evaRenderDev;
    const scene = dev.scene;
    const frame = dev.frame();
    const view = dev.view();
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, off.width, off.height).data;
    const px = (x, y) => {
      const o = (Math.min(off.height - 1, Math.max(0, y)) * off.width + Math.min(off.width - 1, Math.max(0, x))) * 4;
      return [data[o], data[o + 1], data[o + 2]];
    };
    const to255 = (c) => c.map((v) => Math.round(v * 255));
    const maxDiff = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const f = view.frame;
    const ground = to255(scene.paper);
    const failures = [];
    const result = { tilesDrawn: frame.tiles.length, tilesOn: dev.tilesOn(), sky: null, tiles: [] };
    // Even-odd point-in-polygon, the same rule as render/patterns.ts pointInPolygon (frame coordinates).
    const inPolygon = (x, y, pts) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };

    if (scene.sky) {
      const polygon = scene.sky.polygon ?? null;
      // Five columns at frame y 0.02: expect the gradient's top colour (particles may cover a sample or two).
      const fy = 0.02;
      const t = fy / scene.sky.horizonY;
      const expected = to255(scene.sky.top.map((v, c) => v + (scene.sky.horizon[c] - v) * t));
      let near = 0;
      const samples = [];
      for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const p = px(Math.round(f.left + fx * f.width), Math.round(f.top + fy * f.height));
        samples.push(p);
        if (maxDiff(p, expected) <= 10) near++;
      }
      // Below the band the ground must be back (frame y = horizonY + 0.1, away from the test tiles' row).
      const below = px(Math.round(f.left + 0.5 * f.width), Math.round(f.top + (scene.sky.horizonY + 0.1) * f.height));
      result.sky = { expected, samples, near, below, ground, wedge: polygon !== null };
      if (!polygon) {
        if (near < 3) failures.push(`sky: only ${near}/5 samples near the sky top colour ${expected} (got ${JSON.stringify(samples)})`);
      } else {
        // Sky wedge: classify a grid of points by the scene's own polygon; outside it the ground must show, inside the
        // sky gradient at that frame y. The top-left corner of the frame is asserted on its own (the building mass).
        const corner = px(Math.round(f.left + 0.02 * f.width), Math.round(f.top + 0.02 * f.height));
        const skyAt = (y) => {
          const k = Math.min(1, y / scene.sky.horizonY);
          return to255(scene.sky.top.map((v, c) => v + (scene.sky.horizon[c] - v) * k));
        };
        const bandTop = scene.sky.horizonY - 0.02;
        let insideN = 0;
        let insideSky = 0;
        let outsideN = 0;
        let outsideGround = 0;
        const misses = [];
        for (const y of [0.02, 0.06, 0.1, 0.14]) {
          for (let x = 0.02; x < 1; x += 0.04) {
            if (y >= bandTop) continue; // stay above the soft band so the expected colour is the pure gradient
            const fx = Math.round(x * 1000) / 1000;
            const p = px(Math.round(f.left + fx * f.width), Math.round(f.top + y * f.height));
            if (inPolygon(fx, y, polygon)) {
              insideN++;
              if (maxDiff(p, skyAt(y)) <= 10) insideSky++;
              else misses.push({ at: [fx, y], got: p, want: skyAt(y), where: 'inside' });
            } else {
              outsideN++;
              if (maxDiff(p, ground) <= 10) outsideGround++;
              else misses.push({ at: [fx, y], got: p, want: ground, where: 'outside' });
            }
          }
        }
        result.sky.wedgeCheck = { corner, insideN, insideSky, outsideN, outsideGround, misses: misses.slice(0, 8) };
        if (maxDiff(corner, ground) > 10) failures.push(`sky wedge: top-left corner ${corner} is not the ground ${ground}`);
        if (!(insideN >= 4 && outsideN >= 8)) failures.push(`sky wedge: too few classified samples (inside ${insideN}, outside ${outsideN})`);
        // Particles and tile edges may cover a few samples; the large majority must agree with the polygon.
        if (insideSky < insideN * 0.8) failures.push(`sky wedge: only ${insideSky}/${insideN} inside samples are sky-coloured`);
        if (outsideGround < outsideN * 0.8) failures.push(`sky wedge: only ${outsideGround}/${outsideN} outside samples are ground-coloured`);
        if (near >= 4) failures.push(`sky wedge: ${near}/5 top-row columns are sky-coloured; the wedge should leave the sides ground`);
      }
      if (maxDiff(below, ground) > 24 && maxDiff(below, expected) <= 10) failures.push(`sky: ground not restored below the horizon (got ${below})`);

      // Margins (only when the frame does not fill the canvas): every sample outside the frame rect is the ground.
      // Skipped without a sky because the paper-grain pass intentionally covers the whole canvas. Particles are not
      // clipped to the frame (neither backend ever did): a bead authored on the frame edge paints half its soft disc
      // past it, so a band of half the largest device diameter (+1 px) next to each edge is left out. The sky wedge
      // (starting 0.02 frame heights above the top) and any hairline (≥ 0.02 frame heights long) reach well past it.
      let maxSize = 0;
      for (let i = 0; i < scene.store.count; i++) if (scene.store.size[i] > maxSize) maxSize = scene.store.size[i];
      const overhang = Math.ceil((maxSize * f.height) / 1080 / 2) + 1;
      const fx0 = Math.round(f.left) - overhang;
      const fx1 = Math.round(f.left + f.width) + overhang;
      const fy0 = Math.round(f.top) - overhang;
      const fy1 = Math.round(f.top + f.height) + overhang;
      const margins = { present: fx0 > 0 || fy0 > 0 || fx1 < off.width || fy1 < off.height, overhangPx: overhang, sampled: 0, offGround: 0, worst: 0, examples: [] };
      const marginPoint = (x, y) => {
        const p = px(x, y);
        const d = maxDiff(p, ground);
        margins.sampled++;
        if (d > 2) {
          margins.offGround++;
          if (d > margins.worst) margins.worst = d;
          if (margins.examples.length < 4) margins.examples.push({ at: [x, y], got: p });
        }
      };
      if (margins.present) {
        for (let x = 0; x < off.width; x += 4) {
          for (let y = 0; y < fy0; y += 2) marginPoint(x, y);
          for (let y = fy1; y < off.height; y += 2) marginPoint(x, y);
        }
        for (let y = 0; y < off.height; y += 4) {
          for (let x = 0; x < fx0; x += 2) marginPoint(x, y);
          for (let x = fx1; x < off.width; x += 2) marginPoint(x, y);
        }
        if (margins.offGround > 0) failures.push(`margins: ${margins.offGround}/${margins.sampled} samples outside the frame rect are not the ground ${ground} (worst diff ${margins.worst}; e.g. ${JSON.stringify(margins.examples)})`);
      }
      result.margins = margins;
    }

    // Snap tiles the same way the renderers do.
    const rectOf = (t) => {
      const left = Math.round(f.left + t.x * f.width);
      const right = Math.round(f.left + (t.x + t.w) * f.width);
      const top = Math.round(f.top + t.y * f.height);
      const bottom = Math.round(f.top + (t.y + t.h) * f.height);
      return { left, top, width: right - left, height: bottom - top };
    };
    const fillFraction = (r, colour, tol) => {
      let hit = 0;
      let n = 0;
      for (let y = r.top; y < r.top + r.height; y++) {
        for (let x = r.left; x < r.left + r.width; x++) {
          n++;
          if (maxDiff(px(x, y), colour) <= tol) hit++;
        }
      }
      return n ? hit / n : 0;
    };
    for (const t of scene.tiles) {
      const r = rectOf(t);
      const colour = to255(t.colour);
      const centre = px(r.left + (r.width >> 1), r.top + (r.height >> 1));
      const entry = { id: t.id, pattern: t.pattern, rect: r, colour, centre, fill: Math.round(fillFraction(r, colour, 28) * 1000) / 1000 };
      if (frame.tiles.length === 0) {
        // Tiles off: nothing in the tile colour should fill the rect.
        if (entry.fill > 0.05) failures.push(`${t.id}: tiles are off but ${entry.fill} of its rect is in the tile colour`);
      } else {
        const bounds = { flat: [0.95, 1.01], dither: [0.3, 0.85], dotgrid: [0.1, 0.5], scanline: [0.15, 0.5], transparent: [0, 0.05] }[t.pattern];
        if (!(entry.fill >= bounds[0] && entry.fill <= bounds[1])) failures.push(`${t.id} (${t.pattern}): fill ${entry.fill} outside ${bounds}`);
        if (t.pattern === 'flat' && maxDiff(centre, colour) > 40) failures.push(`${t.id}: centre ${centre} far from ${colour}`);
        if (t.hairline > 0) {
          // Some column under the tile must carry a line of the tile colour (alpha 0.35 × 0.9 over the ground).
          const len = Math.round(t.hairline * f.height);
          let best = 0;
          for (let x = r.left; x < r.left + r.width; x++) {
            let hits = 0;
            for (let y = r.top + r.height; y < r.top + r.height + len; y++) if (maxDiff(px(x, y), ground) > 12) hits++;
            best = Math.max(best, hits / len);
          }
          entry.hairlineBest = Math.round(best * 1000) / 1000;
          if (best < 0.6) failures.push(`${t.id}: no hairline column found under the tile (best ${entry.hairlineBest})`);
        }
      }
      result.tiles.push(entry);
    }
    result.failures = failures;
    return result;
  });
}

async function readCanvasState(page) {
  return page.evaluate(() => {
    const d = document.getElementById('scene').dataset;
    return {
      requested: d.requested,
      backend: d.backend,
      detail: d.detail,
      particles: Number(d.particles),
      degraded: d.degraded,
      tiles: Number(d.tiles),
      sky: d.sky,
      skyWedge: d.skyWedge,
      ready: d.ready,
      frames: Number(d.frames),
      drawMs: Number(d.drawMs),
    };
  });
}

async function runPage(
  browser,
  baseUrl,
  name,
  query,
  outDir,
  { timings = true, contextLoss = false, expectStride = null, expectTiles = 5, expectSky = true, expectWedge = false, viewport = VIEWPORT, expectMargins = false } = {},
) {
  const failures = [];
  const pageErrors = [];
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (err) => pageErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(`console.error: ${msg.text()}`);
  });
  const url = `${baseUrl}/render-dev.html?${query}`;
  const result = { name, url };
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('canvas[data-ready="1"]', { timeout: 60_000 });
    // Let a few frames settle so the screenshot and stats are steady.
    await page.waitForFunction(() => Number(document.getElementById('scene').dataset.frames) >= 3, null, { timeout: 60_000 });
    const state = await readCanvasState(page);
    Object.assign(result, state);
    const requested = state.requested;
    if (requested !== 'auto' && state.backend !== requested) {
      result.fallback = `requested ${requested}, got ${state.backend}`;
      failures.push(result.fallback);
    }
    if (!(state.particles > 0)) failures.push(`no particles drawn (${state.particles})`);

    const shot = path.join(outDir, `render-${name}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    result.screenshot = shot;

    const pixels = await samplePixels(page);
    result.pixels = pixels;
    if (!(pixels.nonPaperFraction > 0.01)) failures.push(`pixels do not differ from paper enough (nonPaperFraction ${pixels.nonPaperFraction})`);
    if (!(pixels.distinctColours > 16)) failures.push(`too few distinct colours (${pixels.distinctColours})`);

    // Sky gradient and test tiles (the dev page draws five test tiles and a dev sky unless told not to).
    if (state.tiles !== expectTiles) failures.push(`expected ${expectTiles} tiles drawn, data-tiles says ${state.tiles}`);
    if (state.sky !== (expectSky ? '1' : '0')) failures.push(`expected data-sky ${expectSky ? '1' : '0'}, got ${state.sky}`);
    if (state.skyWedge !== (expectWedge ? '1' : '0')) failures.push(`expected data-sky-wedge ${expectWedge ? '1' : '0'}, got ${state.skyWedge}`);
    const skyTiles = await sampleSkyAndTiles(page);
    result.skyTiles = skyTiles;
    failures.push(...skyTiles.failures);
    if (expectSky && !skyTiles.sky) failures.push('sky check did not run');
    if (expectWedge && !skyTiles.sky?.wedgeCheck) failures.push('sky wedge check did not run');
    if (expectMargins && !(skyTiles.margins?.present && skyTiles.margins.sampled > 0)) failures.push('letterbox margins expected but the frame filled the canvas; the margin check did not run');
    if (!expectSky && pixels.grainFraction < 0.2) failures.push(`no-sky page should show paper grain (grainFraction ${pixels.grainFraction})`);

    if (timings) {
      const t = await sampleTimings(page);
      result.rafIntervalMs = quantiles(t.intervals);
      result.drawMs = quantiles(t.draws);
    }

    if (expectStride !== null) {
      const re = new RegExp(`stride ${expectStride}\\b`);
      if (!re.test(state.detail ?? '')) failures.push(`expected detail to mention stride ${expectStride}, got '${state.detail}'`);
      if (state.particles > 80_000) failures.push(`stride budget exceeded: ${state.particles}`);
    }

    if (contextLoss && state.backend === 'webgl2') {
      const loss = { simulated: false };
      loss.simulated = await page.evaluate(() => window.__evaRenderDev.loseContext());
      if (loss.simulated) {
        await page.waitForFunction(() => document.getElementById('scene').dataset.degraded === '1', null, { timeout: 10_000 });
        const lostState = await readCanvasState(page);
        loss.lostDetail = lostState.detail;
        loss.lostParticles = lostState.particles;
        await page.evaluate(() => window.__evaRenderDev.restoreContext());
        await page.waitForFunction(
          () => {
            const d = document.getElementById('scene').dataset;
            return d.degraded === '0' && Number(d.particles) > 0;
          },
          null,
          { timeout: 20_000 },
        );
        const restored = await readCanvasState(page);
        loss.restoredDetail = restored.detail;
        loss.restoredParticles = restored.particles;
        const afterPixels = await samplePixels(page);
        loss.restoredNonPaperFraction = afterPixels.nonPaperFraction;
        if (!(afterPixels.nonPaperFraction > 0.01)) failures.push('after context restore the canvas is blank');
      } else {
        loss.note = 'WEBGL_lose_context unavailable; context loss not exercised';
      }
      result.contextLoss = loss;
    }
  } catch (err) {
    failures.push(`exception: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await page.close().catch(() => {});
  }
  if (pageErrors.length) failures.push(...pageErrors);
  result.pageErrors = pageErrors;
  result.failures = failures;
  result.ok = failures.length === 0;
  return result;
}

async function main() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eva-w4-render-smoke-'));
  const server = startServer();
  let browser = null;
  const summary = { chromium: null, outDir, pages: {}, ok: false, softwareGlNote: 'Timings are CPU-side on this machine; a SwiftShader renderer string means software GL, not GPU evidence.' };
  try {
    const baseUrl = await server.url;
    browser = await chromium.launch({ headless: true });
    summary.chromium = browser.version();
    summary.pages.webgl2 = await runPage(browser, baseUrl, 'webgl2', 'backend=webgl2', outDir, { contextLoss: true });
    summary.pages.canvas2d = await runPage(browser, baseUrl, 'canvas2d', 'backend=canvas2d', outDir);
    summary.pages.auto = await runPage(browser, baseUrl, 'auto', 'backend=auto', outDir, { timings: false });
    summary.pages.canvas2dStride = await runPage(browser, baseUrl, 'canvas2d-stress', 'backend=canvas2d&stress=100000', outDir, {
      timings: false,
      expectStride: 2,
    });
    summary.pages.webgl2NoSky = await runPage(browser, baseUrl, 'webgl2-nosky-notiles', 'backend=webgl2&sky=0&tiles=0', outDir, {
      timings: false,
      expectTiles: 0,
      expectSky: false,
    });
    summary.pages.canvas2dNoTiles = await runPage(browser, baseUrl, 'canvas2d-notiles', 'backend=canvas2d&tiles=0', outDir, {
      timings: false,
      expectTiles: 0,
    });
    summary.pages.webgl2Dark = await runPage(browser, baseUrl, 'webgl2-dark', 'backend=webgl2&look=dark', outDir, { timings: false });
    // Sky wedge (Sky.polygon) on both backends over the dark ground: corner ground, inside sky.
    summary.pages.webgl2Wedge = await runPage(browser, baseUrl, 'webgl2-wedge', 'backend=webgl2&look=dark&skywedge=1', outDir, {
      timings: false,
      expectWedge: true,
    });
    summary.pages.canvas2dWedge = await runPage(browser, baseUrl, 'canvas2d-wedge', 'backend=canvas2d&look=dark&skywedge=1', outDir, {
      timings: false,
      expectWedge: true,
    });
    // Letterboxed (1280×800): the frame is 1280×720 with 40-px margins above and below; the margins must stay ground on
    // both backends while the wedge (which starts above the frame top) and the tile/hairline pass are drawn.
    const letterbox = { width: 1280, height: 800 };
    summary.pages.webgl2Letterbox = await runPage(browser, baseUrl, 'webgl2-letterbox', 'backend=webgl2&look=dark&skywedge=1', outDir, {
      timings: false,
      expectWedge: true,
      viewport: letterbox,
      expectMargins: true,
    });
    summary.pages.canvas2dLetterbox = await runPage(browser, baseUrl, 'canvas2d-letterbox', 'backend=canvas2d&look=dark&skywedge=1', outDir, {
      timings: false,
      expectWedge: true,
      viewport: letterbox,
      expectMargins: true,
    });
    summary.ok = Object.values(summary.pages).every((p) => p.ok);
  } catch (err) {
    summary.error = err instanceof Error ? err.stack ?? err.message : String(err);
    summary.serverLog = server.log().slice(-2000);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.child.kill('SIGTERM');
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        server.child.kill('SIGKILL');
        resolve();
      }, 3000);
      server.child.on('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  for (const p of Object.values(summary.pages)) if (p.screenshot) console.log(`screenshot ${p.name}: ${p.screenshot}`);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
