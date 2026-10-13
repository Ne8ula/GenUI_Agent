import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASPECT, BUILD_REVEAL_BAND, DEFAULT_NATIVE_ASPECT, STEP_HZ,
  buildRevealY, figureBoundsNorm, photoApproachPose, walkSwayOffsets,
} from '../src/scene/seed33Photo.ts';

test('the soft reveal starts fully hidden and ends fully opaque, including frame edges', () => {
  assert.ok(buildRevealY(12000, 0) - BUILD_REVEAL_BAND >= 1);
  assert.ok(buildRevealY(12000, 12000) + BUILD_REVEAL_BAND <= 1e-12);
  assert.ok(buildRevealY(0, 0) + BUILD_REVEAL_BAND <= 0);
});

test('culling waits until every deformed mesh row has left the frame', () => {
  let sawVisible = false;
  let sawExit = false;
  for (let ms = 0; ms <= 10000; ms += 5) {
    const pose = photoApproachPose(ms, false);
    const halfWidth = pose.heightFrac * DEFAULT_NATIVE_ASPECT / ASPECT / 2;
    const offsets = walkSwayOffsets(pose.legPhase);
    const rows = Array.from(offsets, (sway, i) => {
      const centerX = pose.centerX + sway * pose.heightFrac / ASPECT;
      return { left: centerX - halfWidth, right: centerX + halfWidth, y: pose.headTopY + i / (offsets.length - 1) * pose.heightFrac };
    });
    const allRight = rows.every(r => r.left >= 1);
    const allLeft = rows.every(r => r.right <= 0);
    const allAbove = rows.every(r => r.y <= 0);
    const allBelow = rows.every(r => r.y >= 1);
    if (pose.offFrame) {
      assert.ok(allRight || allLeft || allAbove || allBelow, `visible mesh culled at ${ms}ms`);
      sawExit = true;
    } else {
      assert.equal(sawExit, false, 'the departed figure must not return');
      sawVisible = true;
    }
    const bounds = figureBoundsNorm(pose, DEFAULT_NATIVE_ASPECT);
    for (const row of rows) {
      assert.ok(row.left >= bounds.left - 1e-9 && row.right <= bounds.right + 1e-9);
    }
  }
  assert.ok(sawVisible && sawExit);
});

test('foot deformation is continuous across complete stride cycles', () => {
  for (let cycle = 1; cycle <= 6; cycle++) {
    const t = cycle * 1000 / STEP_HZ;
    const before = walkSwayOffsets(photoApproachPose(t - 0.01, false).legPhase);
    const after = walkSwayOffsets(photoApproachPose(t + 0.01, false).legPhase);
    assert.ok(Math.max(...before.map((v, i) => Math.abs(v - after[i]!))) < 0.0001);
  }
});
