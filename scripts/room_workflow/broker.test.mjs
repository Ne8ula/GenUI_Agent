import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createBroker,validateIntake,approximateArea } from './broker.mjs';
import { validateBoundary,validateOpenings } from './boundary.mjs';
import { makeSyntheticAnalysis } from './test-fixtures.mjs';
const images=Array.from({length:5},(_,i)=>({name:`photo${i}.png`,mime:'image/png',data_base64:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(16,i)]).toString('base64')}));
const input={images,areaStatement:'Probably around 300 sqft',retention:'temporary'};
async function setup(t,runner) {
  const directory=await mkdtemp(join(tmpdir(),'eva-room-test-'));
  const allowedHosts=new Set(['127.0.0.1:1442']);
  const broker=await createBroker({directory,runner,allowedHosts,
    preflightRunner:async(request,{requestSha256})=>({version:1,job_id:request.job_id,request_sha256:requestSha256,
      status:'valid-original-photos',images:request.images.map((p,i)=>({id:p.id,sha256:p.sha256,width:64,height:64,
        normalized_pixels_sha256:createHash('sha256').update(`synthetic-${i}`).digest('hex')}))})});
  await new Promise(resolve=>broker.server.listen(0,'127.0.0.1',resolve));
  allowedHosts.add(`127.0.0.1:${broker.server.address().port}`);
  t.after(async()=>{await broker.wait();broker.server.closeAllConnections();await new Promise(r=>broker.server.close(r));await rm(directory,{recursive:true,force:true});});
  const url=`http://127.0.0.1:${broker.server.address().port}/api/room-workflow`;
  const sessionResponse=await fetch(url+'/session',{headers:{Host:'127.0.0.1:1442'}});
  const cookie=sessionResponse.headers.get('set-cookie').split(';')[0], session=await sessionResponse.json();
  const headers={Host:'127.0.0.1:1442',Origin:'http://127.0.0.1:1440',Cookie:cookie,'X-EVA-CSRF':session.csrf,'Content-Type':'application/json'};
  const request=async(path,body,extra={})=>fetch(url+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)}),...extra});
  return {request,directory,broker,headers};
}
test('intake rejects duplicate, forged and excess uploads; remembered area is not measured',()=>{
  assert.equal(validateIntake(input).images.length,5);
  assert.throws(()=>validateIntake({...input,images:[...images.slice(0,4),images[0]]}),/duplicate/);
  assert.throws(()=>validateIntake({...input,owner:'forged'}),/Unexpected/);
  assert.throws(()=>validateIntake({...input,images:images.slice(0,4)}),/5–7/);
  assert.throws(()=>validateIntake({...input,images:images.map(p=>({...p,mime:'image/jpeg'}))}),/contents/);
  assert.equal(approximateArea(input.areaStatement).measured,false);
  assert.equal(approximateArea(input.areaStatement).nominal_m2,27.870912);
  assert.equal(approximateArea('I do not remember'),null);
});
test('origin, CSRF and owner checks reject unrelated access',async t=>{
  const {request,headers}=await setup(t);
  assert.equal((await request('/jobs',input,{headers:{...headers,Origin:'https://other.example'}})).status,403);
  assert.equal((await request('/jobs',input,{headers:{...headers,'X-EVA-CSRF':'forged'}})).status,403);
  const job=await (await request('/jobs',input)).json();
  const stranger=await request('/session',undefined,{headers:{Host:'127.0.0.1:1442'}});
  const otherCookie=stranger.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/jobs/'+job.id,undefined,{headers:{...headers,Cookie:otherCookie}})).status,400);
});
test('no allowance means no compute and no fake model output',async t=>{
  let calls=0; const {request}=await setup(t,async()=>{calls++;});
  const job=await (await request('/jobs',input)).json();
  const pending=await (await request(`/jobs/${job.id}/analyze`,{})).json();
  assert.equal(pending.status,'awaiting-cloud-approval');assert.equal(calls,0);
  assert.equal((await (await request(`/jobs/${job.id}/result`)).json()).status,'not-run');
  assert.equal((await request(`/jobs/${job.id}/boundary`,{boundary:{},confirmed:true})).status,409);
});
test('one exact grant is consumed; contract-shaped synthetic result reaches review; no B without Shado',async t=>{
  let calls=0;
  const {request,directory,broker}=await setup(t,async payload=>{calls++;return makeSyntheticAnalysis(payload);});
  const job=await (await request('/jobs',input)).json();
  const pending=await (await request(`/jobs/${job.id}/analyze`,{})).json();
  await writeFile(join(directory,'run-approvals.json'),JSON.stringify([{jobId:job.id,operation:'analyze',requestSha256:pending.requestSha256,maxSeconds:600,expiresAt:Date.now()+60000}]));
  await request(`/jobs/${job.id}/analyze`,{});await broker.wait();
  assert.equal(calls,1);
  assert.equal((await (await request('/jobs/'+job.id)).json()).status,'review-boundary');
  assert.equal((await request(`/jobs/${job.id}/analyze`,{})).status,409);
  const boundary={polygon:[[0,0],[2,0],[2,2],[0,2]],floor:0,ceiling:2};
  assert.equal((await request(`/jobs/${job.id}/boundary`,{boundary,confirmed:true})).status,200);
  assert.equal((await request(`/jobs/${job.id}/compare`,{})).status,409);
  assert.equal(JSON.parse(await readFile(join(directory,'run-approvals.json'),'utf8'))[0].used,true);
});
test('single-room boundaries reject crossed outlines and invalid closures before compute',()=>{
  const b={polygon:[[0,0],[2,0],[2,2],[0,2]],floor:0,ceiling:2};
  assert.equal(validateBoundary(b),b);
  assert.throws(()=>validateBoundary({...b,polygon:[[0,0],[2,2],[2,0],[0,2]]}),/cross/);
  assert.throws(()=>validateBoundary({...b,polygon:[[0,0],[1,0],[2,0]]}),/area/);
  const opening={id:'door',edge_index:0,t0:.2,t1:.4,bottom:0,top:1.8,kind:'door'};
  assert.equal(validateOpenings([opening],b).length,1);
  assert.throws(()=>validateOpenings([opening,{...opening,id:'other'}],b),/overlap/);
  assert.throws(()=>validateOpenings([{...opening,top:3}],b),/within/);
});
test('saved copies reopen only for their owner and have bounded retention',async t=>{
  const {request}=await setup(t);
  const job=await(await request('/jobs',{...input,retention:'saved'})).json();
  const jobs=await(await request('/jobs')).json();
  assert.equal(jobs.length,1);assert.equal(jobs[0].id,job.id);
  assert.equal(job.expiresAt-job.createdAt,30*24*3600000);
  assert.ok(!JSON.stringify(jobs).includes('data_base64'));
});
test('unresolved remote jobs retain recovery records on cancel/delete',async t=>{
  const {request,directory}=await setup(t);
  const job=await(await request('/jobs',input)).json();
  const path=join(directory,job.id+'.json'),privateJob=JSON.parse(await readFile(path,'utf8'));
  privateJob.status='submission-unknown';await writeFile(path,JSON.stringify(privateJob));
  assert.equal((await request('/jobs/'+job.id,undefined,{method:'DELETE'})).status,409);
  assert.equal((await(await request(`/jobs/${job.id}/cancel`,{})).json()).status,'cancel-requested');
  assert.equal((await request('/jobs/'+job.id,undefined,{method:'DELETE'})).status,409);
});
test('cancelled intake cannot start computation and can be deleted',async t=>{
  const {request}=await setup(t);
  const job=await (await request('/jobs',input)).json();
  assert.equal((await (await request(`/jobs/${job.id}/cancel`,{})).json()).status,'cancelled');
  assert.equal((await request(`/jobs/${job.id}/analyze`,{})).status,409);
  assert.equal((await request('/jobs/'+job.id,undefined,{method:'DELETE'})).status,200);
  assert.equal((await request('/jobs/'+job.id)).status,400);
});
test('concurrent requests consume one grant and cancellation discards late results',async t=>{
  let complete,calls=0,sourceRequest;
  const {request,directory,broker}=await setup(t,async payload=>{sourceRequest=payload;calls++;return new Promise(resolve=>{complete=resolve;});});
  const job=await(await request('/jobs',input)).json();
  const pending=await(await request(`/jobs/${job.id}/analyze`,{})).json();
  await writeFile(join(directory,'run-approvals.json'),JSON.stringify([{jobId:job.id,operation:'analyze',requestSha256:pending.requestSha256,maxSeconds:600,expiresAt:Date.now()+60000}]));
  const submitted=await Promise.all([request(`/jobs/${job.id}/analyze`,{}),request(`/jobs/${job.id}/analyze`,{})]);
  assert.deepEqual(submitted.map(r=>r.status).sort(),[202,409]);
  while(!complete)await new Promise(r=>setTimeout(r,2));
  assert.equal(calls,1);
  assert.equal((await(await request(`/jobs/${job.id}/cancel`,{})).json()).status,'cancel-requested');
  const late=makeSyntheticAnalysis(sourceRequest),latePath=join(directory,`${job.id}-analyze-result.json`);
  await writeFile(latePath,JSON.stringify(late));
  complete(late);await broker.wait();
  const cancelled=await(await request('/jobs/'+job.id)).json();
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.hasResult,false);
  await assert.rejects(readFile(latePath),{code:'ENOENT'});
  const discarded=(await readdir(directory)).find(name=>name.includes('-discarded-'));
  const outcome=JSON.parse(await readFile(join(directory,discarded)));
  assert.equal(outcome.disposition,'discarded-after-local-cancellation');assert.equal(outcome.result,undefined);
});
test('a definitive worker failure is retained instead of an unknown paid submission',async t=>{
  const {request,directory,broker}=await setup(t,async request=>({version:1,job_id:request.job_id,status:'failed',model_execution:'not-run',arms:{},error:{type:'FixtureFailure',message:'No model ran.'}}));
  const job=await(await request('/jobs',input)).json();
  const pending=await(await request(`/jobs/${job.id}/analyze`,{})).json();
  await writeFile(join(directory,'run-approvals.json'),JSON.stringify([{jobId:job.id,operation:'analyze',requestSha256:pending.requestSha256,maxSeconds:600,expiresAt:Date.now()+60000}]));
  await request(`/jobs/${job.id}/analyze`,{});await broker.wait();
  assert.equal((await(await request('/jobs/'+job.id)).json()).status,'failed');
  assert.equal((await(await request(`/jobs/${job.id}/result`)).json()).error.type,'FixtureFailure');
});
test('expired local copies are removed while unresolved remote receipts remain',async t=>{
  const {request,directory,broker}=await setup(t);
  const first=await(await request('/jobs',input)).json(),second=await(await request('/jobs',input)).json();
  for(const [job,status] of [[first,'awaiting-analysis'],[second,'submission-unknown']]){
    const path=join(directory,job.id+'.json'),record=JSON.parse(await readFile(path,'utf8'));
    record.expiresAt=Date.now()-1;record.status=status;await writeFile(path,JSON.stringify(record));
  }
  await broker.expire();
  await assert.rejects(readFile(join(directory,first.id+'.json')),/ENOENT/);
  assert.equal(JSON.parse(await readFile(join(directory,second.id+'.json'),'utf8')).status,'submission-unknown');
});
test('legacy one-step Shado spending grants cannot enter the v2 upload flow',async t=>{
  const previous=process.env.EVA_SHADO_ORIGIN;process.env.EVA_SHADO_ORIGIN='https://shado.example';
  t.after(()=>{if(previous===undefined)delete process.env.EVA_SHADO_ORIGIN;else process.env.EVA_SHADO_ORIGIN=previous;});
  const {request,directory}=await setup(t);
  const created=await(await request('/jobs',input)).json(),path=join(directory,created.id+'.json');
  let record=JSON.parse(await readFile(path,'utf8'));
  record.status='awaiting-shado';record.boundary={polygon:[[0,0],[2,0],[2,2],[0,2]],floor:0,ceiling:2};await writeFile(path,JSON.stringify(record));
  const {packet}=await(await request(`/jobs/${created.id}/authorize`,{})).json();
  const grant={token:`fixture.${'a'.repeat(43)}`,taskId:packet.taskId,project:JSON.stringify({format:'shado-project',version:1,project:{id:'eva-'+created.id}}),
    nodeId:'eva-room-video',recipeHash:'a'.repeat(64),maximumMicros:1000000,expiresAt:Date.now()+60000,
    assets:packet.assets.map(({id,...p})=>({...p,sourceId:id,version:id}))};
  const delivery={type:'eva-room-grant',nonce:packet.nonce,jobId:created.id,grant};
  assert.equal((await request(`/jobs/${created.id}/grant`,{...delivery,nonce:'wrong'})).status,400);
  assert.equal((await request(`/jobs/${created.id}/grant`,delivery)).status,400);
  const visible=await(await request('/jobs/'+created.id)).json();
  assert.ok(!visible.shadoAuthorized);assert.ok(!JSON.stringify(visible).includes(grant.token));assert.equal(visible.authorizationNonce,undefined);
  assert.equal((await request(`/jobs/${created.id}/grant`,delivery)).status,400);
  record=JSON.parse(await readFile(path,'utf8'));record.status='shado-running';record.shadoRecipeHash=grant.recipeHash;await writeFile(path,JSON.stringify(record));
  const renewal=await(await request(`/jobs/${created.id}/authorize`,{})).json();
  assert.equal(renewal.packet.taskId,packet.taskId);
  assert.equal((await request(`/jobs/${created.id}/grant`,{...delivery,nonce:renewal.packet.nonce,grant:{...grant,recipeHash:'b'.repeat(64)}})).status,400);
  assert.equal((await request(`/jobs/${created.id}/grant`,{...delivery,nonce:renewal.packet.nonce})).status,400);
  assert.equal((await(await request('/jobs/'+created.id)).json()).status,'shado-running');
});
