import test from 'node:test';
import assert from 'node:assert/strict';
import {enhancePointColors,POINT_LUMINANCE_FLOOR} from '../src/room/point-colors.ts';
test('point-only contrast lift preserves input, bright colors, ordering and bounds',()=>{
  const source=new Float32Array([0,0,0,.04,.01,.02,.7,.3,.2,1,1,1]);
  const original=source.slice(),result=enhancePointColors(source);
  assert.deepEqual(source,original);assert.notEqual(result,source);
  assert.deepEqual(result.slice(6),source.slice(6));
  for(let i=0;i<6;i+=3) {
    const luminance=.2126*result[i]!+.7152*result[i+1]!+.0722*result[i+2]!;
    assert.ok(Math.abs(luminance-POINT_LUMINANCE_FLOOR)<1e-7);
  }
  assert.ok(result[3]!>result[5]!&&result[5]!>result[4]!);
  assert.ok([...result].every(v=>v>=0&&v<=1));
});
