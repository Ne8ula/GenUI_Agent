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
test('cutaway hides only fixed near-edge and upper bands without changing crop or input',async()=>{
  const state=await load();
  assert.equal(typeof state.inCutaway,'function','Reversible cutaway predicate is not implemented');
  const crop={rotation_z:0,min:[-1.5,-2.85,349.15],max:[1.85,.58,352.3]};
  const original=JSON.stringify(crop),interior:[number,number,number]=[0,-1,350];
  assert.equal(state.inCutaway(interior,crop),true);
  assert.equal(state.inCutaway([1.8,-2.8,349.8],crop),true,'Low edge points remain visible, including marker-height geometry');
  for(const p of [[1.8,-1,350.5],[0,-2.8,350.5],[0,-1,351.6]] as [number,number,number][]){
    assert.equal(state.inCrop(p,crop),true,'Full scan retains these points');
    assert.equal(state.inCutaway(p,crop),false);
  }
  assert.equal(state.inCutaway([-1.49,-1,350],crop),true,'Far edge stays visible');
  assert.equal(state.inCutaway([0,.57,350],crop),true,'Far edge stays visible');
  assert.equal(state.inCutaway([0,-1,349.16],crop),true,'Floor stays visible');
  assert.deepEqual(interior,[0,-1,350]);assert.equal(JSON.stringify(crop),original);
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
