import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSurfacePoints } from '../src/room/surface-points.ts';

const square = {
  positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
  colors: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
  indices: [0, 1, 2, 0, 2, 3],
};

test('surface samples fill sparse large triangles with consistent minimum spacing and interpolated color', () => {
  const result = sampleSurfacePoints(square, 0.1);
  assert.ok(result.positions.length / 3 > 45);
  assert.ok(result.positions.length / 3 < 120);
  for (let i = 0; i < result.positions.length; i += 3) {
    const x = result.positions[i]!, y = result.positions[i + 1]!;
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
    assert.equal(result.positions[i + 2], 0);
    assert.ok(Math.abs(result.colors[i]! - x) < 1e-7);
    assert.ok(Math.abs(result.colors[i + 1]! - y) < 1e-7);
    for (let j = 0; j < i; j += 3) {
      assert.ok(Math.hypot(x - result.positions[j]!, y - result.positions[j + 1]!) >= 0.1 - 1e-7);
    }
  }
  // Coverage matters as well as separation: the sampler must not return only a
  // sparse set of original corners or points clustered around the diagonal.
  for (let x = 0; x <= 1; x += 0.1) for (let y = 0; y <= 1; y += 0.1) {
    let nearest = Infinity;
    for (let i = 0; i < result.positions.length; i += 3) {
      nearest = Math.min(nearest, Math.hypot(x - result.positions[i]!, y - result.positions[i + 1]!));
    }
    assert.ok(nearest < 0.2);
  }
});

test('small detached surfaces survive and no points bridge disconnected surfaces', () => {
  const geometry = {
    positions: [...square.positions, 0.4, 0.4, 0.5, 0.42, 0.4, 0.5, 0.4, 0.42, 0.5],
    colors: [...square.colors, 1, 0, 0, 1, 0, 0, 1, 0, 0],
    indices: [...square.indices, 4, 5, 6],
  };
  const original = structuredClone(geometry);
  const result = sampleSurfacePoints(geometry, 0.1);
  const detached = [];
  for (let i = 0; i < result.positions.length; i += 3) {
    assert.ok(result.positions[i + 2] === 0 || result.positions[i + 2] === 0.5);
    if (result.positions[i + 2] === 0.5) detached.push(i);
  }
  assert.equal(detached.length, 1);
  assert.deepEqual([...result.colors.slice(detached[0]!, detached[0]! + 3)], [1, 0, 0]);
  assert.deepEqual(sampleSurfacePoints(geometry, 0.1), result);
  assert.deepEqual(geometry, original);
});

test('duplicate tessellation cannot multiply point density and degenerate faces produce no points', () => {
  const duplicates = sampleSurfacePoints({ ...square, indices: Array.from({ length: 40 }, () => square.indices).flat() }, 0.1);
  assert.ok(duplicates.positions.length / 3 < 120);
  const degenerate = sampleSurfacePoints({ positions: [0, 0, 0], colors: [0, 0, 0], indices: [0, 0, 0] });
  assert.equal(degenerate.positions.length, 0);
  assert.ok(Number.isFinite(degenerate.spacing) && degenerate.spacing > 0);
});

test('an excessively fine requested spacing remains bounded to 120000 output points', () => {
  const result = sampleSurfacePoints(square, 0.00001);
  assert.equal(result.positions.length / 3, 120_000);
  assert.equal(result.colors.length, result.positions.length);
  assert.equal(result.spacing, 0.00001);
});

test('invalid geometry, spacing and oversized inputs are rejected before sampling', () => {
  assert.throws(() => sampleSurfacePoints(square, 0));
  assert.throws(() => sampleSurfacePoints(square, NaN));
  assert.throws(() => sampleSurfacePoints({ ...square, indices: [0, 1, 9] }));
  assert.throws(() => sampleSurfacePoints({ ...square, colors: [1, 0, 0] }));
  assert.throws(() => sampleSurfacePoints({ ...square, positions: [NaN, ...square.positions.slice(1)] }));
  assert.throws(() => sampleSurfacePoints({ ...square, colors: [2, ...square.colors.slice(1)] }));
  assert.throws(() => sampleSurfacePoints({ ...square, positions: new Float32Array(600_003) }));
  assert.throws(() => sampleSurfacePoints({ ...square, indices: new Uint32Array(1_200_003) }));
  assert.throws(() => sampleSurfacePoints({ ...square, samplingGroups: [0] }));
  assert.throws(() => sampleSurfacePoints({ ...square, samplingGroups: [0, NaN] }));
  assert.throws(() => sampleSurfacePoints({ ...square, samplingGroups: [0, -1] }));
});

test('nearby cabinet panels retain surface coverage when solids have explicit sampling ownership',()=>{
  const geometry={
    positions:[...square.positions,...square.positions.map((v,index)=>index%3===2?v+.02:v)],
    colors:[...square.colors,...square.colors],
    indices:[...square.indices,...square.indices.map(index=>index+4)],
    samplingGroups:[0,0,1,1],
  };
  const result=sampleSurfacePoints(geometry,.1);
  const layers=[[],[]] as number[][][];
  for(let i=0;i<result.positions.length;i+=3){
    const point=Array.from(result.positions.slice(i,i+3));
    layers[point[2]!>.01?1:0]!.push(point);
  }
  for(const points of layers){
    assert.ok(points.length>45,'Each close surface retains coverage');
    for(let i=0;i<points.length;i++)for(let j=0;j<i;j++){
      assert.ok(Math.hypot(...points[i]!.map((v,k)=>v-points[j]![k]!))>=.1-1e-7,'Spacing remains uniform within a surface');
    }
  }
  assert.deepEqual(sampleSurfacePoints(geometry,.1),result);
});
