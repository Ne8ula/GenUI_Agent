import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createBroker,runCloudClient} from './broker.mjs';
import {validateImagePreflight,runImagePreflight} from './image-preflight.mjs';
import {makeSyntheticAnalysis} from './test-fixtures.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const report=(request,digest)=>({version:1,job_id:request.job_id,request_sha256:digest,status:'valid-original-photos',
  images:request.images.map((image,i)=>({id:image.id,sha256:image.sha256,width:64,height:64,normalized_pixels_sha256:sha(`fixture-${i}`)}))});
async function setup(t,preflight,runner){
  const directory=await mkdtemp(join(tmpdir(),'eva-preflight-'));let broker,cookie,csrf,url,calls=0,checks=0;
  const start=async()=>{
    const hosts=new Set();broker=await createBroker({directory,allowedHosts:hosts,
      runner:async payload=>{calls++;return runner?runner(payload):makeSyntheticAnalysis(payload);},
      preflightRunner:async(request,options)=>{checks++;return preflight?preflight(request,options):report(request,options.requestSha256);}});
    await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));const host=`127.0.0.1:${broker.server.address().port}`;hosts.add(host);
    url=`http://${host}/api/room-workflow`;const response=await fetch(url+'/session',{headers:cookie?{Cookie:cookie}:{}});
    cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;csrf=(await response.json()).csrf;
  };
  const close=async()=>{await broker.wait();broker.server.closeAllConnections();await new Promise(r=>broker.server.close(r));};
  const api=(path,body)=>fetch(url+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,
    Origin:'http://127.0.0.1:1440','X-EVA-CSRF':csrf,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  await start();t.after(async()=>{await close();await rm(directory,{recursive:true,force:true});});
  const images=Array.from({length:5},(_,i)=>({name:`p${i}.png`,mime:'image/png',
    data_base64:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(16,i)]).toString('base64')}));
  const job=await(await api('/jobs',{images,areaStatement:'300 sqft',retention:'temporary'})).json();
  const action=()=>api(`/jobs/${job.id}/analyze`,{});
  const waiting=await(await action()).json();
  const approval={jobId:job.id,operation:'analyze',requestSha256:waiting.requestSha256,maxSeconds:600,expiresAt:Date.now()+60000};
  await writeFile(join(directory,'run-approvals.json'),JSON.stringify([approval]));
  return {directory,job,api,action,get broker(){return broker;},get calls(){return calls;},get checks(){return checks;},
    visible:async()=>await(await api(`/jobs/${job.id}`)).json(),
    allowance:async()=>JSON.parse(await readFile(join(directory,'run-approvals.json')))[0],
    restart:async()=>{await close();await start();}};
}
test('valid preflight precedes the one allowance consumption and preserves exact request',async t=>{
  const h=await setup(t);assert.equal(h.checks,0);
  await h.action();await h.broker.wait();
  assert.equal(h.checks,1);assert.equal(h.calls,1);assert.equal((await h.allowance()).used,true);
  assert.equal((await h.visible()).status,'review-boundary');
  assert.equal(sha(await readFile(join(h.directory,`${h.job.id}-analyze-request.json`))),(await h.allowance()).requestSha256);
});
test('bad image report leaves allowance unused and never invokes model',async t=>{
  const h=await setup(t,async(request,options)=>({...report(request,options.requestSha256),request_sha256:'f'.repeat(64)}));
  await h.action();await h.broker.wait();
  assert.equal(h.calls,0);assert.notEqual((await h.allowance()).used,true);
  assert.equal((await h.visible()).imagePreflightStatus,'failed');
  assert.equal((await h.visible()).status,'awaiting-cloud-approval');
  const bytes=await readFile(join(h.directory,`${h.job.id}-analyze-request.json`));
  await h.action();await h.broker.wait();assert.deepEqual(await readFile(join(h.directory,`${h.job.id}-analyze-request.json`)),bytes);
});
test('cancellation while CPU preflight runs consumes no allowance and discards late valid report',async t=>{
  let release;const h=await setup(t,(request,options)=>new Promise(r=>{release=()=>r(report(request,options.requestSha256));}));
  await h.action();assert.equal((await h.visible()).status,'preflighting-images');
  await h.api(`/jobs/${h.job.id}/cancel`,{});release();await h.broker.wait();
  assert.equal((await h.visible()).status,'cancelled');assert.equal(h.calls,0);assert.notEqual((await h.allowance()).used,true);
});
test('restart of preflight is safely retryable but admitted intent remains unresolved',async t=>{
  const h=await setup(t),path=join(h.directory,h.job.id+'.json');
  let job=JSON.parse(await readFile(path));Object.assign(job,{status:'preflighting-images',cloudPending:false,imagePreflightStatus:'running'});
  await writeFile(path,JSON.stringify(job));await h.restart();
  assert.equal((await h.visible()).status,'awaiting-cloud-approval');assert.equal((await h.visible()).imagePreflightStatus,'interrupted');
  job=JSON.parse(await readFile(path));Object.assign(job,{status:'analyzing',cloudPending:true,cloudSubmissionStarted:true});
  await writeFile(path,JSON.stringify(job));await h.restart();assert.equal((await h.visible()).status,'submission-unknown');
  assert.equal((await h.action()).status,409);assert.equal(h.calls,0);
});
test('preflight report rejects duplicate normalized pixels, reordered originals and authority fields',()=>{
  const request={job_id:'fixture',images:[{id:'a',sha256:'a'.repeat(64)},{id:'b',sha256:'b'.repeat(64)}]},digest='c'.repeat(64);
  const good=report(request,digest);assert.equal(validateImagePreflight(good,request,digest),good);
  for(const modify of [
    value=>{value.images[1].normalized_pixels_sha256=value.images[0].normalized_pixels_sha256;},
    value=>value.images.reverse(),value=>{value.approved=true;},value=>{value.images[0].width=9000;},
  ]){
    const value=structuredClone(good);modify(value);assert.throws(()=>validateImagePreflight(value,request,digest));
  }
});
test('preflight cancellation terminates process tree before promise rejects',async()=>{
  const abort=new AbortController(),child=new EventEmitter();child.pid=2345;let killed=0;
  const pending=runImagePreflight('request','output',{signal:abort.signal,python:'python',timeoutMs:100,
    launch:()=>child,terminate:async()=>{killed++;child.emit('exit',1);}});
  abort.abort();await assert.rejects(pending,/cancelled/);assert.equal(killed,1);
});
test('proven unsubmitted cloud failure clears intent but does not refund its allowance',async t=>{
  const h=await setup(t,undefined,()=>{throw Object.assign(Error('No cloud process started'),{code:'cloud-not-submitted'});});
  await h.action();await h.broker.wait();const job=await h.visible();
  assert.equal(job.status,'awaiting-cloud-approval');assert.equal(job.cloudPending,false);
  assert.equal(job.cloudSubmissionStarted,false);assert.equal((await h.allowance()).used,true);
  await h.action();await h.broker.wait();assert.equal(h.calls,1);
});
test('cloud helper failures distinguish missing reservation from uncertain reserved submission',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'eva-launch-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const payload={job_id:'fixture',operation:'analyze'};
  await writeFile(join(directory,'fixture-analyze-request.json'),JSON.stringify(payload));
  for(const failure of ['throw','spawn-error','early-exit','reserved-exit']){
    const receipt=join(directory,'fixture-analyze-request.receipt.json');
    if(failure==='reserved-exit')await writeFile(receipt,JSON.stringify({modal_call_id:null,status:'reserved-before-submit'}));
    const launch=()=>{
      if(failure==='throw')throw Error('Synthetic launch rejection');
      const child=new EventEmitter();
      queueMicrotask(()=>{if(failure==='spawn-error')child.emit('error',Error('Synthetic ENOENT'));
        else {child.emit('spawn');child.emit('exit',1);}});
      return child;
    };
    await assert.rejects(runCloudClient(payload,directory,600,{launch}),error=>
      failure==='reserved-exit'?error.code!=='cloud-not-submitted':error.code==='cloud-not-submitted',failure);
  }
});
test('cancel during final frozen-request read prevents cloud client launch',async()=>{
  const abort=new AbortController(),payload={job_id:'fixture',operation:'analyze'};let release,calls=0;
  const pending=runCloudClient(payload,'private',600,{signal:abort.signal,
    readRequest:()=>new Promise(r=>{release=r;}),launch:()=>{calls++;throw Error('Must never launch');}});
  abort.abort();release(JSON.stringify(payload));
  await assert.rejects(pending,{code:'cloud-not-submitted'});assert.equal(calls,0);
});
