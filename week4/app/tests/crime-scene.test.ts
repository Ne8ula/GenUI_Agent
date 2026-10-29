import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const load=async()=>{
  assert.ok(existsSync(new URL('../src/crime-scene/state.ts',import.meta.url)),'Scene state is not implemented');
  return import('../src/crime-scene/state.ts');
};
test('notes retain 32 immutable undo steps, with no-op edits excluded',async()=>{
  const {editNotes,undoNotes}=await load();
  let state={current:[] as {text:string;tags:number[]}[],history:[] as {text:string;tags:number[]}[][]};
  const initial=state;
  for(let i=0;i<40;i++)state=editNotes(state,[{text:String(i),tags:[12]}]);
  assert.equal(state.history.length,32);assert.equal(initial.current.length,0);
  assert.equal(editNotes(state,[{text:'39',tags:[12]}]),state);
  for(let i=0;i<32;i++)state=undoNotes(state);
  assert.equal(state.current[0]?.text,'7');assert.equal(undoNotes(state),state);
});
test('display crop rotates scanner XY and translates height without changing source',async()=>{
  const {displayPoint,inCrop}=await load();
  const point:[number,number,number]=[1,0,350];
  const crop={rotation_z:Math.PI/2,min:[-.1,.9,349],max:[.1,1.1,351]};
  assert.equal(inCrop(point,crop),true);
  assert.equal(inCrop([2,0,350],crop),false);
  const result=displayPoint(point,crop);
  assert.ok(Math.abs(result[0]!)<1e-6);assert.equal(result[1],1);assert.ok(Math.abs(result[2]!-.8)<1e-6);
  assert.deepEqual(point,[1,0,350]);
});
