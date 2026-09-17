import test from 'node:test';
import assert from 'node:assert/strict';
import { speechEnding } from '../apps/desktop/src/speechEnding.ts';
test('speech ending preserves the phrase and adds 1000ms without modifying cached input',()=>{
  const source=new Float32Array(48000).fill(.5),output=speechEnding(source,48000);
  assert.equal(output.length,96000);
  assert.deepEqual(output.subarray(0,47760),source.subarray(0,47760));
  assert.equal(output[47999],0);assert.ok(output.subarray(48000).every(v=>v===0));
  assert.ok(source.every(v=>v===.5));
});
test('longer fade is restricted to an already quiet tail',()=>{
  const source=new Float32Array(48000).fill(.5);source.fill(.01,44160);
  const output=speechEnding(source,48000);
  assert.deepEqual(output.subarray(0,44160),source.subarray(0,44160));
  assert.ok(output[47000]<source[47000]);assert.equal(output[47999],0);
});
