import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {validateIdealizedResult, sealIdealized, idealizedDigest, validateFitDiagnostics} from './idealized-result.mjs';
import {makeIdealizedFixture, expectedIdealizedBinding} from './idealized-fixtures.mjs';

function rejected(change, reseal=true) {
  const value=makeIdealizedFixture(), expected=expectedIdealizedBinding(value);
  change(value);
  if(reseal)sealIdealized(value);
  assert.throws(()=>validateIdealizedResult(value,expected));
}

test('fit diagnostics must match the entire trusted fit list, including an empty list',()=>{
  const fit={code:'support-distance',object_ids:['chair-1'],view_ids:[],residual:.1,reason:'Trusted fit'};
  const extra={...fit,residual:0,reason:'Invented fit'};
  for(const expected of [[],[fit]]){
    assert.doesNotThrow(()=>validateFitDiagnostics({diagnostics:expected},{fit_diagnostics:expected}));
    assert.throws(()=>validateFitDiagnostics({diagnostics:[extra,...expected]},{fit_diagnostics:expected}),/Source-fit/);
  }
});

test('valid synthetic artifact is unchanged; black is a source color',()=>{
  const value=makeIdealizedFixture(), before=structuredClone(value);
  assert.equal(validateIdealizedResult(value,expectedIdealizedBinding(value)),value);
  assert.deepEqual(value,before);
  assert.ok(value.geometry.colors.includes(0));
});

test('closed authority, object ownership and source binding',()=>{
  for(const change of [v=>v.ready=true, v=>v.inventory[0].authorized=true,
    v=>v.bindings.originals.reverse(), v=>v.job_id='other', v=>v.parent_revision='b'.repeat(64),
    v=>v.components[1].first_face=0, v=>v.components[1].object_id='other-job',
    v=>v.components[1].origin='authored-room-shell', v=>v.inventory[0].observation_ids=['unknown'],
    v=>v.geometry.provenance[0]='photo-estimated', v=>v.inventory[0].origin='generated-object',
    v=>v.frame.candidate_to_source[0][3]=1])rejected(change);
});

test('lineage and owner additions cannot manufacture evidence',()=>{
  for(const mutate of [o=>o.predecessor_ids=['missing'],o=>o.origin='owner-authored-addition']){
    const value=makeIdealizedFixture();mutate(value.inventory[0]);
    value.components[1].origin=value.inventory[0].origin;
    value.geometry.provenance.fill(value.inventory[0].origin,value.components[1].first_face);
    sealIdealized(value);
    assert.throws(()=>validateIdealizedResult(value,expectedIdealizedBinding(value)));
  }
});

test('host binds reviewed boundary, openings and inventory',()=>{
  for(const change of [v=>v.boundary.ceiling=4,
    v=>v.openings.push({id:'door-1',kind:'door',edge_index:0,t0:.1,t1:.3,bottom:0,top:2}),
    v=>v.inventory[0].dimensions[0]=1.2])rejected(change);
});

test('numeric guards and exact resource limits',()=>{
  for(const bad of [true,-1,.5,999999])rejected(v=>v.geometry.indices[0]=bad,false);
  for(const bad of [NaN,Infinity,-Infinity])rejected(v=>v.geometry.positions[0]=bad,false);
  for(const bad of [true,0,-1])rejected(v=>v.inventory[0].dimensions[0]=bad);
  rejected(v=>v.geometry.indices[1]=v.geometry.indices[0]);
  rejected(v=>v.geometry.colors[0]=-.01);
  rejected(v=>v.geometry.positions=Array(600003).fill(0),false);
  rejected(v=>v.geometry.indices=Array(1200003).fill(0),false);
  rejected(v=>v.inventory=Array(65).fill(v.inventory[0]),false);
  rejected(v=>v.limitations=['x'.repeat(16777217)],false);
  rejected(v=>v.geometry.provenance=['x'.repeat(67108865)],false);
  rejected(v=>v.revision='0'.repeat(64),false);
  rejected(v=>v.geometry_sha256='0'.repeat(64),false);
});

test('Python and Node admit each other and reject the same resigned mutations',()=>{
  const folder=mkdtempSync(join(tmpdir(),'eva-idealized-parity-'));
  try {
    const input=join(folder,'node.json'), output=join(folder,'python.json');
    writeFileSync(input,JSON.stringify(makeIdealizedFixture()));
    const code=`import json,sys
from idealized_fixture import artifact,expected
from idealized_contract import validate_artifact,seal_artifact,digest
value=json.load(open(sys.argv[1],encoding='utf-8'))
validate_artifact(value,expected(value))
cases=[]
for key,bad in [('job_id','other'),('ready',True),('units','meters')]:
 v=artifact(); trusted=expected(v); v[key]=bad; seal_artifact(v)
 try: validate_artifact(v,trusted); accepted=True
 except ValueError: accepted=False
 cases.append({'value':v,'expected':trusted,'accepted':accepted})
json.dump({'artifact':artifact(),'cases':cases,'digest':digest({'text':'黑色 🪑','tiny':1e-7})},open(sys.argv[2],'w',encoding='utf-8'),ensure_ascii=False)
`;
    const python=resolve('.local/reconstruction/venv/Scripts/python.exe');
    const run=spawnSync(python,['-X','utf8','-c',code,input,output],{
      cwd:resolve('scripts/room_workflow'),encoding:'utf8',timeout:60000});
    assert.equal(run.status,0,run.stderr);
    const data=JSON.parse(readFileSync(output,'utf8'));
    validateIdealizedResult(data.artifact,expectedIdealizedBinding(data.artifact));
    assert.equal(idealizedDigest({text:'黑色 🪑',tiny:1e-7}),data.digest);
    for(const item of data.cases){
      assert.equal(item.accepted,false);
      assert.throws(()=>validateIdealizedResult(item.value,item.expected));
    }
  } finally {rmSync(folder,{recursive:true,force:true});}
});
