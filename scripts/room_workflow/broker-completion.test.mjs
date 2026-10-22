/** Synthetic admission/race checks; CPU geometry correctness is tested separately. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {createBroker,validateLocalCompletion,terminateProcessTree} from './broker.mjs';
import {makeSyntheticAnalysis} from './test-fixtures.mjs';
import {geometryHash} from './benchmark.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const artifact=(envelope,digest)=>({
  version:1,artifact_type:'eva-room-local-completion-v1',status:'complete',job_id:envelope.request.job_id,units:'relative',
  source_analysis_binding:envelope.analysis.analysis_binding,
  bindings:{adapter_request_sha256:digest,numerical_fields_sha256:envelope.analysis.prediction_fields.sha256,
    numerical_fields_model_config_sha256:envelope.analysis.model_config_sha256},
  geometry:structuredClone(envelope.analysis.arms.A.geometry),fused_geometry:structuredClone(envelope.analysis.arms.A.geometry),
  raw_geometry:structuredClone(envelope.analysis.arms.A.geometry),cameras:envelope.analysis.arms.A.cameras,
  candidate_geometry_sha256:geometryHash(envelope.analysis.arms.A.geometry),fused_geometry_sha256:geometryHash(envelope.analysis.arms.A.geometry),
  boundary:envelope.review.boundary,openings:envelope.review.openings,diagnostics:{new_model_execution:false},
});
async function setup(t,run) {
  const directory=await mkdtemp(join(tmpdir(),'eva-cpu-test-'));const hosts=new Set();let calls=0;
  const broker=await createBroker({directory,allowedHosts:hosts,...(run==='actual'?{}:{completionRunner:async(e,options)=>{
    calls++;return run?run(e,options):artifact(e,options.inputSha256);
  }})});
  await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));const host=`127.0.0.1:${broker.server.address().port}`;hosts.add(host);
  const base=`http://${host}/api/room-workflow`,response=await fetch(base+'/session'),cookie=response.headers.get('set-cookie').split(';')[0],session=await response.json();
  const api=(path,body)=>fetch(base+path,{method:body===undefined?'GET':'POST',
    headers:{Cookie:cookie,Origin:'http://127.0.0.1:1440','X-EVA-CSRF':session.csrf,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  t.after(async()=>{await broker.wait();broker.server.closeAllConnections();await new Promise(r=>broker.server.close(r));await rm(directory,{recursive:true,force:true});});
  const images=Array.from({length:5},(_,i)=>({name:`fake${i}.png`,mime:'image/png',data_base64:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20,i)]).toString('base64')}));
  const job=await(await api('/jobs',{images,areaStatement:'300 sqft',retention:'temporary'})).json(),path=join(directory,job.id+'.json');
  const record=JSON.parse(await readFile(path,'utf8')),request={version:1,operation:'analyze',job_id:job.id,images:record.images.map(({id,sha256,data_base64})=>({id,sha256,data_base64}))};
  record.result=makeSyntheticAnalysis(request);
  record.result.prediction_fields={format:'eva-vggt-fields-npz-v1',image_ids:request.images.map(r=>r.id),shape:[5,518,518],bytes:1,sha256:sha('x'),data_base64:'eA==',meaning:'Synthetic opaque test bytes, no numerical decoding.'};
  record.analysisBinding=record.result.analysis_binding;record.boundary=record.result.boundary_proposal.value;record.openings=[];record.status='awaiting-shado';
  await writeFile(path,JSON.stringify(record));
  const action=(name,body={})=>api(`/jobs/${job.id}/${name}`,body);
  return {broker,path,api,action,get calls(){return calls;},visible:async()=>await(await api('/jobs/'+job.id)).json(),
    envelope:{version:1,analysis:record.result,request,review:{version:1,coordinate_frame:'analysis',analysis_binding:record.analysisBinding,boundary:record.boundary,openings:[]}}};
}
test('CPU result is a separate source-bound artifact; raw A remains and B is absent',async t=>{
  const h=await setup(t);assert.equal((await h.action('complete-local')).status,202);await h.broker.wait();
  const job=await h.visible();assert.equal(job.status,'awaiting-shado');assert.equal(job.localCompletionStatus,'complete');assert.equal(job.hasLocalCompletion,true);
  assert.equal(job.localCompletion,undefined);
  const result=await(await h.api(`/jobs/${job.id}/result`)).json();assert.equal(result.arms.B,undefined);assert.equal(result.arms.A.geometry.positions.length,9);
  const local=await(await h.api(`/jobs/${job.id}/completion`)).json();assert.equal(local.artifact_type,'eva-room-local-completion-v1');
  assert.equal((await h.action('complete-local')).status,409);assert.equal(h.calls,1);
});
test('CPU validation rejects changed source, boundary, raw geometry and output hash',async t=>{
  const h=await setup(t),digest=sha(JSON.stringify(h.envelope));
  assert.ok(validateLocalCompletion(artifact(h.envelope,digest),h.envelope,digest));
  const fused=artifact(h.envelope,digest);fused.geometry.source_view_indices=[-1];fused.fused_geometry.source_view_indices=[-1];
  assert.ok(validateLocalCompletion(fused,h.envelope,digest));
  for(const mutate of [a=>a.bindings.adapter_request_sha256='0'.repeat(64),a=>a.boundary={...a.boundary,floor:1},
    a=>a.raw_geometry.positions[0]=10,a=>a.candidate_geometry_sha256='0'.repeat(64),a=>a.geometry.provenance[0]='unknown',
    a=>a.geometry.source_view_indices=[20],a=>a.raw_geometry.source_view_indices=[-1]]) {
    const value=artifact(h.envelope,digest);mutate(value);assert.throws(()=>validateLocalCompletion(value,h.envelope,digest));
  }
});
test('missing numerical fields or an unconfirmed boundary cannot launch CPU work',async t=>{
  const h=await setup(t),record=JSON.parse(await readFile(h.path,'utf8'));delete record.result.prediction_fields;
  await writeFile(h.path,JSON.stringify(record));assert.equal((await h.action('complete-local')).status,400);
  record.status='review-boundary';await writeFile(h.path,JSON.stringify(record));assert.equal((await h.action('complete-local')).status,409);assert.equal(h.calls,0);
});
test('review changed while CPU work runs rejects late output without losing raw A',async t=>{
  let release;const h=await setup(t,(e,options)=>new Promise(r=>{release=()=>r(artifact(e,options.inputSha256));}));
  await h.action('complete-local');const record=JSON.parse(await readFile(h.path,'utf8'));record.boundary.floor=-1;
  await writeFile(h.path,JSON.stringify(record));release();await h.broker.wait();
  const job=await h.visible();assert.equal(job.localCompletionStatus,'failed');assert.equal(job.hasResult,true);assert.equal(job.hasLocalCompletion,false);
});
test('cancellation waits for runner settlement then discards the result',async t=>{
  let release;const h=await setup(t,(e,options)=>new Promise(r=>{release=()=>r(artifact(e,options.inputSha256));}));
  await h.action('complete-local');await h.action('cancel');assert.equal((await h.visible()).status,'cancel-requested');
  release();await h.broker.wait();assert.equal((await h.visible()).status,'cancelled');assert.equal((await h.visible()).hasLocalCompletion,false);
});
test('Windows termination uses a validated numeric process tree with no shell',async()=>{
  let called;const launch=(command,args,options)=>{called={command,args,options};const child=new EventEmitter();queueMicrotask(()=>child.emit('exit',0));return child;};
  await terminateProcessTree({pid:4321,exitCode:null},{platform:'win32',launch});
  assert.equal(called.command,'taskkill');assert.deepEqual(called.args,['/PID','4321','/T','/F']);
  assert.equal(called.options.shell,false);assert.equal(called.options.windowsHide,true);
  await assert.rejects(terminateProcessTree({pid:'4321 & bad'},{platform:'win32',launch}),/Invalid/);
});
test('actual owned parent and child processes stop together',{skip:process.env.EVA_PROCESS_TREE_SMOKE!=='1'},async()=>{
  // The tested processes also self-expire. A denied taskkill must report a
  // failed check without leaving indefinitely running fixture descendants.
  const parent=spawn(process.execPath,['-e',`const {spawn}=require('child_process');const c=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),5000)'],{windowsHide:true,stdio:'ignore'});console.log(c.pid);setTimeout(()=>process.exit(0),5000);`],{windowsHide:true,stdio:['ignore','pipe','ignore'],detached:process.platform!=='win32'});
  let childPid;
  try{
    childPid=await new Promise((r,j)=>{parent.once('error',j);parent.stdout.once('data',bytes=>r(Number(bytes.toString().trim())));});
    const exited=new Promise(r=>parent.once('exit',r));
    await terminateProcessTree(parent);await exited;
    assert.throws(()=>process.kill(childPid,0),'Spawned child must have exited, not merely its supervisor.');
  }finally{
    if(Number.isSafeInteger(childPid))try{process.kill(childPid);}catch{}
    if(parent.exitCode===null)parent.kill();
    parent.stdout.destroy();parent.unref();
  }
});
test('actual CPU adapter runs through broker and admits a bound artifact',{skip:process.env.EVA_CPU_INTEGRATION!=='1'},async t=>{
  assert.ok(process.env.EVA_ROOM_COMPLETION_PYTHON);
  const fixture=JSON.parse(await readFile('.local/reconstruction/arkitscenes/42445021/pilot-v1/local-completion-adapter-v1/request.json','utf8'));
  const h=await setup(t,'actual'),record=JSON.parse(await readFile(h.path,'utf8'));
  // Isolated test-owner alias around real saved ML fields; review comes from the
  // explicitly synthetic adapter fixture, never presented as owner acceptance.
  record.images=fixture.request.images.map(image=>({...image,name:image.id+'.png',mime:'image/png',bytes:Buffer.from(image.data_base64,'base64').length}));
  record.result=fixture.analysis;record.result.job_id=record.id;record.analysisBinding=fixture.analysis.analysis_binding;
  record.boundary=fixture.review.boundary;record.openings=fixture.review.openings;
  await writeFile(h.path,JSON.stringify(record));
  const response=await h.action('complete-local');assert.equal(response.status,202,await response.text());
  await h.broker.wait();const visible=await h.visible();
  assert.equal(visible.localCompletionStatus,'complete');assert.equal(visible.status,'awaiting-shado');
  const admitted=JSON.parse(await readFile(h.path,'utf8')).localCompletion;
  assert.ok(admitted.geometry.indices.length>300000);assert.equal(admitted.diagnostics.new_model_execution,false);
  assert.equal(visible.hasResult,true);assert.equal(visible.hasLocalCompletion,true);
});
