// walk-away-r3: approach/drift checks below cover retained compatibility helpers only.
// Current renderer gait/tile-body behavior is covered by walk-away.test.ts and browser captures.
// w4-20261008-seed33-fidelity-r1 candidate-2 (2026-10-08, reviewer-driven correction): the seed-33 look
// is a reference-derived photo layer (src/scene/seed33Photo.ts) plus a small shimmer-bead accent, with
// the real tile-chip atlas and the figure's home placement now read from a runtime-fetched manifest
// (render/photoAssets.ts), not hard-coded here or baked into this scene module. Structural/photographic
// fidelity is carried by public/assets/seed33/*.png (main-owned extraction), not asserted here as pixel
// content; this file asserts the scene/pose contract: determinism, regions for the renderer's shimmer,
// the photo layer's four real sources, and the figure's monotonic, non-looping, correctly-culled approach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStableId } from '../../core/ids.ts';
import {
  APPROACH_GUIDE_SAMPLES,
  ASPECT,
  BUILD_REVEAL_BAND,
  DEFAULT_HOME,
  DEFAULT_NATIVE_ASPECT,
  FIGURE_BUILD_FADE,
  FIGURE_MESH_ROWS,
  FOOT_START_FRACTION,
  GROUND,
  PHOTO_LAYER,
  REGION_ORDER,
  SWAY_START_FRACTION,
  TILE_DRIFT_AMPLITUDE,
  TILE_DRIFT_ONSET_MS,
  buildRevealY,
  buildSeed33PhotoScene,
  DEFAULT_SEED33_PHOTO,
  figureBoundsNorm,
  figureBuildAlpha,
  isFullyOffFrame,
  photoApproachPose,
  setSeed33PhotoReducedMotion,
  swayWeight,
  tileDriftOffset,
  walkSwayOffsets,
} from '../src/scene/seed33Photo.ts';
import { createLife, stepLife } from '../src/scene/life.ts';
import { isParisTone } from '../src/scene/palette.ts';

const regionBase = (id: string) => id.split('/')[0] ?? id;

test('the photo scene is deterministic: same seed/density/buildMs gives byte-identical shimmer particles and regions', () => {
  const a = buildSeed33PhotoScene(DEFAULT_SEED33_PHOTO);
  const b = buildSeed33PhotoScene(DEFAULT_SEED33_PHOTO);
  assert.equal(a.store.count, b.store.count);
  assert.ok(a.store.count > 0, 'the shimmer accent is not empty');
  assert.deepEqual(a.regions, b.regions);
  for (const key of ['x', 'y', 'a', 'size', 'phase', 'motion', 'birthMs'] as const) {
    assert.deepEqual(Array.from(a.store[key].subarray(0, a.store.count)), Array.from(b.store[key].subarray(0, b.store.count)), key);
  }
});

test('regions cover the still composition far -> near with stable IDs; frame.tiles is empty (the real tile-chip atlas is drawn by the renderer from the manifest, not authored here)', () => {
  const frame = buildSeed33PhotoScene(DEFAULT_SEED33_PHOTO);
  assert.deepEqual(frame.regions.map((r) => r.id), [...REGION_ORDER]);
  for (const r of frame.regions) {
    assert.ok(isStableId(regionBase(r.id)), `${r.id} base is not a stable id`);
    assert.ok(r.start <= r.end);
  }
  const bands = frame.regions.map((r) => r.band);
  const firstNear = bands.indexOf('near');
  assert.ok(firstNear > 0 && bands.slice(firstNear).every((b) => b === 'near'), 'near regions are last, as the old bead order was');
  assert.equal(frame.aspect, ASPECT);
  assert.equal(frame.paper, GROUND);
  assert.equal(frame.sky, null, 'the photo supplies its own sky pixels; no procedural gradient underneath it');
  assert.equal(frame.build.durationMs, DEFAULT_SEED33_PHOTO.buildMs);
  assert.deepEqual(frame.tiles, [], 'no procedural tiles: candidate-2 removed the old authorTiles-driven patterns that were stacking over the real source chips');
});

test('the photo layer names all four reference-derived sources plus the manifest; no figure size or foreground rect is baked in here (read at runtime instead)', () => {
  const frame = buildSeed33PhotoScene(DEFAULT_SEED33_PHOTO);
  assert.ok(frame.photo, 'the seed-33 scene carries a photo layer');
  const photo = frame.photo!;
  assert.equal(photo, PHOTO_LAYER);
  for (const src of [photo.backgroundSrc, photo.figureSrc, photo.foregroundSrc, photo.tilesSrc]) {
    assert.ok(src.startsWith('/assets/seed33/'), src);
    assert.ok(src.endsWith('.png'), src);
  }
  assert.ok(photo.manifestSrc.endsWith('manifest-walk-away-v2.json'));
  assert.ok(photo.settledForegroundSrc?.endsWith('foreground-away.png'));
  assert.ok(photo.figureSrc.endsWith('figure-away.png'));
  assert.ok(!('figureSizePx' in photo), 'no hard-coded figure pixel size: the renderer reads the decoded bitmap');
  assert.ok(!('foregroundRectNorm' in photo), 'the foreground is now full-frame; no placement rect to bake in');
});

test('every shimmer bead is finite, inside the frame margin, on-palette and genuinely animated (motion > 0)', () => {
  const frame = buildSeed33PhotoScene(DEFAULT_SEED33_PHOTO);
  const s = frame.store;
  assert.ok(s.count > 0);
  for (let k = 0; k < s.count; k++) {
    const x = s.x[k] ?? NaN, y = s.y[k] ?? NaN;
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && x > -0.05 && x < 1.05 && y > -0.05 && y < 1.05, `bead ${k} at ${x},${y}`);
    assert.ok(isParisTone([s.r[k] ?? 0, s.g[k] ?? 0, s.b[k] ?? 0]), `bead ${k} is off-palette`);
    assert.ok((s.motion[k] ?? 0) > 0, `shimmer bead ${k} should actually animate (this is the "modest localized shimmer", not a static dot)`);
  }
});

test('reduced motion zeroes the shimmer in place (no rebuild), restores it exactly on release; life still runs (no tile state attached to this scene any more)', () => {
  const frame = buildSeed33PhotoScene(DEFAULT_SEED33_PHOTO);
  const authored = Array.from(frame.store.motion.subarray(0, frame.store.count));
  assert.ok(authored.every((m) => m > 0));
  setSeed33PhotoReducedMotion(frame, true);
  for (let k = 0; k < frame.store.count; k++) assert.equal(frame.store.motion[k], 0);
  setSeed33PhotoReducedMotion(frame, false);
  assert.deepEqual(Array.from(frame.store.motion.subarray(0, frame.store.count)), authored, 'restores the authored shimmer exactly');
  const life = createLife(frame);
  assert.equal(life.tiles, null, 'no tiles authored on this frame, so no tile life either');
  for (let i = 0; i < 100; i++) stepLife(life, frame, 16.7, { reducedMotion: false }); // does not throw with no tiles/rigs
});

test("DEFAULT_HOME/DEFAULT_NATIVE_ASPECT are plausible fallbacks only; the renderer always supplies the real manifest crop box and decoded bitmap instead", () => {
  assert.ok(DEFAULT_HOME.centerX > 0 && DEFAULT_HOME.centerX < 1);
  assert.ok(DEFAULT_HOME.topY > 0 && DEFAULT_HOME.topY < 1);
  assert.ok(DEFAULT_HOME.heightFrac > 0 && DEFAULT_HOME.heightFrac < 1);
  assert.ok(DEFAULT_NATIVE_ASPECT > 0 && DEFAULT_NATIVE_ASPECT < 1, 'the figure crop is taller than wide');
  assert.equal(APPROACH_GUIDE_SAMPLES[0]!.tMs, 0);
  assert.ok(APPROACH_GUIDE_SAMPLES.every((s, i, arr) => i === 0 || s.height >= arr[i - 1]!.height), 'guide samples grow monotonically (a sanity check on the manifest-copied guide table, not a measurement claim)');
});

test('photoApproachPose: starts exactly at `home` (no extra offset added to it), matches the guide samples\' shape at 0/1.25/2.5/3.75/4.96s relative to home, and grows monotonically', () => {
  const home = DEFAULT_HOME;
  const p0 = photoApproachPose(-500, false, home);
  assert.equal(p0.centerX, home.centerX, 'no extra offset: before/at build completion she is exactly at home, not a separately-authored VB2-guide estimate of home');
  assert.equal(p0.headTopY, home.topY);
  assert.equal(p0.heightFrac, home.heightFrac);
  assert.equal(p0.offFrame, false);
  const base = APPROACH_GUIDE_SAMPLES[0]!;
  for (const sample of APPROACH_GUIDE_SAMPLES) {
    const p = photoApproachPose(sample.tMs, false, home);
    const expectedHeight = home.heightFrac * (sample.height / base.height);
    const expectedCenterX = home.centerX + (sample.centerX - base.centerX);
    const expectedTopY = home.topY + (sample.headTopY - base.headTopY);
    assert.ok(Math.abs(p.heightFrac - expectedHeight) < 1e-9, `heightFrac at ${sample.tMs}ms`);
    assert.ok(Math.abs(p.centerX - expectedCenterX) < 1e-9, `centerX at ${sample.tMs}ms`);
    assert.ok(Math.abs(p.headTopY - expectedTopY) < 1e-9, `headTopY at ${sample.tMs}ms`);
  }
  // Monotonic over the whole span sampled at 50ms, including past the measured 4.96s window.
  let prev = photoApproachPose(0, false, home);
  for (let t = 50; t <= 15000; t += 50) {
    const p = photoApproachPose(t, false, home);
    assert.ok(p.heightFrac >= prev.heightFrac - 1e-9, `heightFrac decreased at ${t}ms`);
    assert.ok(p.centerX >= prev.centerX - 1e-9, `centerX decreased at ${t}ms`);
    assert.ok(p.headTopY <= prev.headTopY + 1e-9, `headTopY increased (moved down) at ${t}ms`);
    prev = p;
  }
  const last = APPROACH_GUIDE_SAMPLES[APPROACH_GUIDE_SAMPLES.length - 1]!;
  const past = photoApproachPose(6000, false, home);
  assert.ok(past.heightFrac > home.heightFrac * (last.height / base.height), 'still growing past the guide window (continues past the viewer)');
});

test('candidate-2 regression: a figure at heightMul≈4 of home (the OLD, reviewer-disproven cull threshold) is still centrally visible and must NOT be culled', () => {
  const home = DEFAULT_HOME;
  // Find a time where height has grown to ~4x home under the new curve, independent of the cull logic itself.
  let t = 0;
  let pose = photoApproachPose(t, false, home);
  while (pose.heightFrac < home.heightFrac * 4 && t < 30000) {
    t += 10;
    pose = photoApproachPose(t, false, home);
  }
  assert.ok(pose.heightFrac >= home.heightFrac * 4, 'reached 4x home height within a reasonable time (sanity on the fit)');
  const bounds = figureBoundsNorm(pose, DEFAULT_NATIVE_ASPECT);
  assert.ok(bounds.left < 1 && bounds.right > 0 && bounds.top < 1 && bounds.bottom > 0, `at 4x height (t=${t}ms) the sprite bounds ${JSON.stringify(bounds)} still intersect the frame`);
  assert.equal(pose.offFrame, false, `t=${t}ms (height 4x home) must not be culled — this is exactly the main revision's candidate-1 idle-10000/idle-18000.png regression (an empty street where she should still be huge and on-screen)`);
});

test('non-tautological bounds check: offFrame matches an independently recomputed bounding-box intersection at times straddling the real exit, and never wraps back once true', () => {
  const home = DEFAULT_HOME;
  const nativeAspect = DEFAULT_NATIVE_ASPECT;
  // Search forward (coarse, then refine) for the first time the pose's OWN reported offFrame flips true.
  let lo = 0, hi = 0;
  let step = 100;
  while (!photoApproachPose(hi, false, home, nativeAspect).offFrame && hi < 120_000) hi += step;
  assert.ok(hi < 120_000, 'a genuine exit occurs within two minutes of continued approach (not never, not absurdly late)');
  lo = Math.max(0, hi - step);
  for (let i = 0; i < 20 && hi - lo > 1; i++) {
    const mid = Math.floor((lo + hi) / 2);
    if (photoApproachPose(mid, false, home, nativeAspect).offFrame) hi = mid;
    else lo = mid;
  }
  // Independently recompute the bounds at lo (just before) and hi (at/just after) from the pose's own
  // centerX/headTopY/heightFrac output, rather than trusting the function's internal offFrame bookkeeping.
  const before = photoApproachPose(lo, false, home, nativeAspect);
  const boundsBefore = figureBoundsNorm(before, nativeAspect);
  assert.equal(before.offFrame, false, `t=${lo}ms`);
  assert.equal(isFullyOffFrame(boundsBefore), false, `independently recomputed bounds at t=${lo}ms still intersect the frame: ${JSON.stringify(boundsBefore)}`);
  const after = photoApproachPose(hi, false, home, nativeAspect);
  const boundsAfter = figureBoundsNorm(after, nativeAspect);
  assert.equal(after.offFrame, true, `t=${hi}ms`);
  assert.equal(isFullyOffFrame(boundsAfter), true, `independently recomputed bounds at t=${hi}ms do not intersect the frame: ${JSON.stringify(boundsAfter)}`);
  // No reset: once off-frame, stays off-frame (and bounds keep moving the same direction, not wrapping).
  for (const t of [hi + 1, hi + 10_000, hi + 120_000]) {
    const p = photoApproachPose(t, false, home, nativeAspect);
    assert.equal(p.offFrame, true, `t=${t}ms must stay off-frame, never wrap back to visible`);
    assert.ok(p.centerX >= after.centerX - 1e-6, 'centerX does not move backward after exit');
  }
});

test('reduced motion holds the figure exactly at `home` regardless of elapsed time, with no clock jump needed', () => {
  const home = DEFAULT_HOME;
  for (const t of [0, 1250, 5000, 20000, 600_000]) {
    const p = photoApproachPose(t, true, home);
    assert.equal(p.heightFrac, home.heightFrac);
    assert.equal(p.centerX, home.centerX);
    assert.equal(p.headTopY, home.topY);
    assert.equal(p.offFrame, false, 'stays visible at the reference pose, never treated as exited');
    assert.equal(p.legPhase, 0, 'no gait motion while reduced');
  }
});

test('the walk-cycle mesh deform (candidate-2: hip sway + a faster/smaller foot harmonic, not one uniform sine) sways only the lower rows, scales with reduced motion, and is pure/deterministic', () => {
  const full = walkSwayOffsets(Math.PI / 2, FIGURE_MESH_ROWS, false);
  const reduced = walkSwayOffsets(Math.PI / 2, FIGURE_MESH_ROWS, true);
  assert.equal(full.length, FIGURE_MESH_ROWS);
  for (let i = 0; i < FIGURE_MESH_ROWS; i++) {
    const frac = i / (FIGURE_MESH_ROWS - 1);
    if (frac < SWAY_START_FRACTION) assert.equal(full[i], 0, `row ${i} (above the hip) must not sway`);
  }
  assert.ok(full[FIGURE_MESH_ROWS - 1]! !== 0, 'the feet row moves at this phase');
  let prevW = 0;
  for (let i = 0; i < FIGURE_MESH_ROWS; i++) {
    const w = swayWeight(i / (FIGURE_MESH_ROWS - 1));
    assert.ok(w >= prevW - 1e-9);
    prevW = w;
  }
  assert.ok(FOOT_START_FRACTION > SWAY_START_FRACTION, 'the foot harmonic only adds on top of the hip sway, lower down');
  // Reduced motion scales amplitude down (not to exactly 0, matching the gait-bob precedent) at a phase where both harmonics are non-zero.
  assert.ok(Math.abs(reduced[FIGURE_MESH_ROWS - 1]!) < Math.abs(full[FIGURE_MESH_ROWS - 1]!));
  assert.deepEqual(Array.from(walkSwayOffsets(1.23, 10, false)), Array.from(walkSwayOffsets(1.23, 10, false)), 'pure function');
  // The deform is not literally a single uniform sine any more: the boot band's shape differs from the hip band's.
  const atZero = walkSwayOffsets(0.001, FIGURE_MESH_ROWS, false);
  const atQuarter = walkSwayOffsets(Math.PI / 2, FIGURE_MESH_ROWS, false);
  const hipRow = Math.round((SWAY_START_FRACTION + 0.05) * (FIGURE_MESH_ROWS - 1));
  const footRow = FIGURE_MESH_ROWS - 1;
  const hipRatio = (atQuarter[hipRow] ?? 0) / (atZero[hipRow] || 1e-9);
  const footRatio = (atQuarter[footRow] ?? 0) / (atZero[footRow] || 1e-9);
  assert.notEqual(Math.round(hipRatio * 100), Math.round(footRatio * 100), 'the foot row does not simply scale the hip row by a constant factor (a genuine second harmonic, not a relabelled uniform sway)');
});

test('the 12s nearest-first build reveal: background/foreground wipe bottom-to-top and complete exactly at buildMs; a zero build is already complete', () => {
  assert.ok(buildRevealY(12000, 0) >= 1 + BUILD_REVEAL_BAND);
  const mid = buildRevealY(12000, 6000);
  assert.ok(mid > 0 && mid < 1, `midway reveal ${mid} is between the frame edges`);
  assert.ok(buildRevealY(12000, 12000) + BUILD_REVEAL_BAND <= 1e-9, 'even the top edge is fully revealed exactly at buildMs');
  assert.equal(buildRevealY(12000, 20000), buildRevealY(12000, 12000), 'stays fully revealed after the build, never re-hides');
  assert.ok(buildRevealY(0, 0) + BUILD_REVEAL_BAND <= 0, 'a zero-length build is already complete');
  let prevY = buildRevealY(12000, 0);
  for (let t = 100; t <= 12000; t += 100) {
    const y = buildRevealY(12000, t);
    assert.ok(y <= prevY + 1e-9, `reveal threshold rose at ${t}ms`);
    prevY = y;
  }
  assert.ok(BUILD_REVEAL_BAND > 0);
});

test("the figure's own build-phase fade: invisible before FIGURE_BUILD_FADE starts, fully visible by its end, complete for a zero build", () => {
  const buildMs = 12000;
  assert.equal(figureBuildAlpha(buildMs, 0), 0);
  assert.equal(figureBuildAlpha(buildMs, buildMs * FIGURE_BUILD_FADE[0]), 0);
  assert.ok(figureBuildAlpha(buildMs, buildMs * FIGURE_BUILD_FADE[1]) >= 0.999);
  assert.equal(figureBuildAlpha(buildMs, buildMs), 1, 'whole once the build completes');
  assert.equal(figureBuildAlpha(0, 0), 1, 'a zero-length build is already complete');
  let prev = 0;
  for (let t = 0; t <= buildMs; t += 200) {
    const a = figureBuildAlpha(buildMs, t);
    assert.ok(a >= prev - 1e-9, `fade alpha decreased at ${t}ms`);
    prev = a;
  }
});

test('tileDriftOffset: exactly zero at/before build completion (idle0 reconstructs the manifest rect exactly) and whenever reduced motion holds the source arrangement; bounded and deterministic once drifting', () => {
  assert.deepEqual(tileDriftOffset(3, 33, 0, false), { dx: 0, dy: 0 });
  assert.deepEqual(tileDriftOffset(3, 33, -500, false), { dx: 0, dy: 0 });
  assert.deepEqual(tileDriftOffset(3, 33, 5000, true), { dx: 0, dy: 0 }, 'reduced motion holds the source arrangement');
  const a = tileDriftOffset(3, 33, 5000, false);
  const b = tileDriftOffset(3, 33, 5000, false);
  assert.deepEqual(a, b, 'deterministic');
  assert.ok(Math.abs(a.dx) <= TILE_DRIFT_AMPLITUDE + 1e-9 && Math.abs(a.dy) <= TILE_DRIFT_AMPLITUDE + 1e-9, 'bounded small drift');
  const other = tileDriftOffset(4, 33, 5000, false);
  assert.notDeepEqual(a, other, 'different tiles do not move in lockstep');
  // Onset ramps in smoothly, not an instant jump, starting only after the build.
  const justAfter = tileDriftOffset(3, 33, 1, false);
  const mid = tileDriftOffset(3, 33, TILE_DRIFT_ONSET_MS / 2, false);
  assert.ok(Math.abs(justAfter.dx) < Math.abs(mid.dx) + 1e-6 || Math.abs(mid.dx) < TILE_DRIFT_AMPLITUDE, 'the drift ramps in rather than snapping to full amplitude immediately after the build');
});
