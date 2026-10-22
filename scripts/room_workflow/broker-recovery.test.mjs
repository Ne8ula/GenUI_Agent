import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createBroker} from './broker.mjs';
import {validateRecovery,runRecoveryClient,receiptCancelled,recoveryInputs} from './cloud-recovery.mjs';
import {makeSyntheticAnalysis} from './test-fixtures.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const intake={images:Array.from({length:5},(_,i)=>({name:`p${i}.png`,mime:'image/png',
  data_base64:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(16,i)]).toString('base64')})),
  areaStatement:'300 sqft',retention:'temporary'};
function recovered(input,status='result-available',result){
  if(status==='result-available'&&result===undefined)result=makeSyntheticAnalysis(input.request);
  return {version:1,artifact_type:'eva-room-cloud-recovery-v1',job_id:input.request.job_id,operation:input.request.operation,
    request_sha256:input.requestSha256,receipt_sha256:input.receiptSha256,modal_call_id:input.modalCallId,
    status,result:status==='result-available'?result:null,error_type:status==='unavailable'?'OutputExpiredError':null,cancellation_requested:receiptCancelled(input.receipt)};
}
async function setup(t,recoveryRunner) {
  const directory=await mkdtemp(join(tmpdir(),'eva-recovery-'));
  let broker,url,cookie,csrf,calls=0,clock=Date.now();
  async function start(){
    const hosts=new Set();broker=await createBroker({directory,allowedHosts:hosts,now:()=>clock,
      recoveryRunner:async input=>{calls++;return recoveryRunner?recoveryRunner(input):recovered(input);}});
    await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));
    const host=`127.0.0.1:${broker.server.address().port}`;hosts.add(host);url=`http://${host}/api/room-workflow`;
    const response=await fetch(url+'/session',{headers:cookie?{Cookie:cookie}:{}});
    cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;csrf=(await response.json()).csrf;
  }
  async function close(){await broker.wait();broker.server.closeAllConnections();await new Promise(r=>broker.server.close(r));}
  const api=(path,body,extra={})=>fetch(url+path,{method:body===undefined?'GET':'POST',
    headers:{Cookie:cookie,Origin:'http://127.0.0.1:1440','X-EVA-CSRF':csrf,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),...extra});
  await start();t.after(async()=>{await close();await rm(directory,{recursive:true,force:true});});
  const job=await(await api('/jobs',intake)).json(),path=join(directory,job.id+'.json');
  const raw=JSON.parse(await readFile(path,'utf8'));
  const request={version:1,operation:'analyze',job_id:job.id,images:raw.images.map(({id,sha256,data_base64})=>({id,sha256,data_base64}))};
  const requestBytes=JSON.stringify(request),requestPath=join(directory,`${job.id}-analyze-request.json`);
  const receipt={version:1,job_id:job.id,request_sha256:sha(requestBytes),modal_call_id:'fc-EXISTING',status:'submitted'};
  const receiptPath=join(directory,`${job.id}-analyze-request.receipt.json`);
  Object.assign(raw,{status:'submission-unknown',pendingOperation:'analyze',cloudPending:true,requestSha256:sha(requestBytes)});
  await writeFile(path,JSON.stringify(raw));await writeFile(requestPath,requestBytes);await writeFile(receiptPath,JSON.stringify(receipt));
  return {api,job,request,requestPath,receiptPath,path,directory,get broker(){return broker;},get calls(){return calls;},
    visible:async()=>await(await api(`/jobs/${job.id}`)).json(),
    recover:body=>api(`/jobs/${job.id}/recover-cloud`,body??{}),
    restart:async()=>{await close();await start();},advance:ms=>{clock+=ms;}};
}
test('restart recovers exact stored call, preserves private originals, and settled recovery is idempotent',async t=>{
  const h=await setup(t),before=await readFile(h.receiptPath);
  const raw=JSON.parse(await readFile(h.path));raw.status='analyzing';await writeFile(h.path,JSON.stringify(raw));
  await h.restart();assert.equal((await h.visible()).status,'submission-unknown');
  assert.equal((await h.recover()).status,202);await h.broker.wait();
  assert.equal((await h.visible()).status,'review-boundary');assert.equal(h.calls,1);
  assert.deepEqual(await readFile(h.receiptPath),before);assert.equal(sha(await readFile(h.requestPath)),raw.requestSha256);
  assert.equal((await h.recover()).status,200);assert.equal(h.calls,1);
  assert.equal((await readdir(h.directory)).filter(n=>n.includes('-recovery-')).length,1);
});
test('restart clears a stale checking flag without resolving or replaying its call',async t=>{
  const h=await setup(t),job=JSON.parse(await readFile(h.path));
  Object.assign(job,{status:'cancel-requested',cloudRecoveryStatus:'checking',cloudRecoveryAttempt:'interrupted-attempt'});
  await writeFile(h.path,JSON.stringify(job));await h.restart();
  const current=await h.visible();assert.equal(current.status,'cancel-requested');assert.equal(current.cloudRecoveryStatus,'unavailable');
  assert.equal(h.calls,0);assert.equal((await h.recover()).status,202);await h.broker.wait();
  assert.equal(h.calls,1);assert.equal((await h.visible()).status,'cancelled');
});
for(const status of ['pending','unavailable'])test(`${status} never resolves cancellation or retention`,async t=>{
  const h=await setup(t,input=>recovered(input,status));await h.api(`/jobs/${h.job.id}/cancel`,{});
  assert.equal((await h.recover()).status,202);await h.broker.wait();
  const current=await h.visible();assert.equal(current.status,'cancel-requested');assert.equal(current.cloudRecoveryStatus,status);
  h.advance(25*3600000);await h.broker.expire();
  assert.equal((await h.api(`/jobs/${h.job.id}`,undefined,{method:'DELETE'})).status,409);
  assert.equal((await h.visible()).hasResult,false);
});
test('recovery is owner/CSRF bound and takes no caller-selected identifiers',async t=>{
  const h=await setup(t);
  assert.equal((await h.recover({modal_call_id:'fc-FORGED'})).status,400);
  assert.equal((await h.api(`/jobs/${h.job.id}/recover-cloud`,{},{headers:{Origin:'http://127.0.0.1:1440','Content-Type':'application/json'}})).status,401);
  assert.equal((await h.api(`/jobs/${h.job.id}/recover-cloud`,{},{headers:{Cookie:'eva_room=wrong',Origin:'https://other.example'}})).status,403);
  assert.equal(h.calls,0);
});
test('missing request and rebound receipt fail before invoking provider',async t=>{
  const h=await setup(t);const original=await readFile(h.requestPath);
  await rm(h.requestPath);const missing=await h.recover();
  assert.equal(missing.status,400);assert.match((await missing.json()).error,/exact original request is missing/);
  await writeFile(h.requestPath,original);
  const receipt=JSON.parse(await readFile(h.receiptPath));receipt.job_id='other';await writeFile(h.receiptPath,JSON.stringify(receipt));
  assert.equal((await h.recover()).status,400);assert.equal(h.calls,0);
});
test('concurrent checks poll once and cancellation during recovery discards valid geometry',async t=>{
  let release;const h=await setup(t,input=>new Promise(r=>{release=()=>r(recovered(input));}));
  const responses=await Promise.all([h.recover(),h.recover()]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);assert.equal(h.calls,1);
  await h.api(`/jobs/${h.job.id}/cancel`,{});release();await h.broker.wait();
  const job=await h.visible();assert.equal(job.status,'cancelled');assert.equal(job.hasResult,false);assert.equal(job.cloudPending,false);
  const artifacts=(await readdir(h.directory)).filter(n=>n.includes('-recovery-')||n.includes('-discarded-'));
  assert.equal(artifacts.length,1);assert.match(artifacts[0],/-discarded-/);
  const receipt=JSON.parse(await readFile(join(h.directory,artifacts[0])));
  assert.equal(receipt.disposition,'discarded-after-local-cancellation');assert.match(receipt.result_sha256,/^[a-f0-9]{64}$/);
  for(const key of ['result','positions','colors','indices','prediction_fields','data_base64'])assert.ok(!JSON.stringify(receipt).includes(`"${key}"`));
});
test('malformed late result cannot settle cancelled job or release its retention',async t=>{
  const h=await setup(t,input=>recovered(input,'result-available',{status:'complete',positions:[1,2,3],colors:[1,1,1]}));
  await h.api(`/jobs/${h.job.id}/cancel`,{});await h.recover();await h.broker.wait();
  assert.equal((await h.visible()).status,'cancel-requested');assert.equal((await h.visible()).cloudPending,true);
  const names=(await readdir(h.directory)).filter(name=>name.includes('-recovery-')||name.includes('-discarded-'));
  assert.equal(names.length,1);assert.match(names[0],/-discarded-unverified-/);
  const receipt=JSON.parse(await readFile(join(h.directory,names[0])));
  assert.equal(receipt.remote_state,'unresolved');assert.match(receipt.artifact_sha256,/^[a-f0-9]{64}$/);
  assert.equal(receipt.positions,undefined);assert.equal(receipt.result,undefined);assert.equal(receipt.colors,undefined);
});
test('valid conclusive worker failure resolves existing call without a new submit',async t=>{
  const h=await setup(t,input=>recovered(input,'result-available',{version:1,job_id:input.request.job_id,status:'failed',
    model_execution:'not-run',arms:{},error:{type:'FixtureFailure',message:'Synthetic failure.'}}));
  await h.recover();await h.broker.wait();assert.equal((await h.visible()).status,'failed');assert.equal(h.calls,1);
});
test('rebound recovery envelope and durable call identity fail closed',async t=>{
  const h=await setup(t,input=>({...recovered(input),modal_call_id:'fc-DIFFERENT'}));
  await h.recover();await h.broker.wait();assert.equal((await h.visible()).status,'submission-unknown');
  const receipt=JSON.parse(await readFile(h.receiptPath));receipt.modal_call_id='fc-CHANGED';await writeFile(h.receiptPath,JSON.stringify(receipt));
  assert.equal((await h.recover()).status,400);assert.equal(h.calls,1);
});
test('process recovery uses only GET-existing arguments and kills timed out helper tree',async()=>{
  let args,terminated=0;const child=new EventEmitter();child.pid=1234;
  await assert.rejects(runRecoveryClient({receiptPath:'receipt',requestPath:'request'},'fresh',{
    python:'python',timeoutMs:5,launch:(_python,arguments_)=>{args=arguments_;return child;},
    terminate:async c=>{assert.equal(c,child);terminated++;child.emit('exit',1);}}),/timed out/);
  assert.equal(terminated,1);assert.ok(args.includes('--recover-receipt'));assert.ok(!args.includes('--confirm-billable'));
  assert.ok(!args.includes('--cancel-receipt'));
});
test('unknown fields and geometry in pending envelope are rejected',()=>{
  const input={request:{job_id:'fixture',operation:'analyze'},requestSha256:'a',receiptSha256:'b',modalCallId:'fc-X'};
  const pending=recovered(input,'pending');
  assert.throws(()=>validateRecovery({...pending,permission:true},input),/malformed/);
  assert.throws(()=>validateRecovery({...pending,result:{}},input),/unresolved/);
});
test('receipt cancellation itself discards geometry even without a local cancel request',async t=>{
  const h=await setup(t);
  const receipt=JSON.parse(await readFile(h.receiptPath));receipt.cancellation='requested; remote termination unverified';
  await writeFile(h.receiptPath,JSON.stringify(receipt));await h.recover();await h.broker.wait();
  assert.equal((await h.visible()).status,'cancelled');assert.equal((await h.visible()).hasResult,false);
});
test('cancellation flag and definitive receipt status must agree with recovered envelope',async t=>{
  let input;const h=await setup(t,value=>{input=value;return recovered(value);});
  await h.recover();await h.broker.wait();
  assert.throws(()=>validateRecovery({...recovered(input),cancellation_requested:true},input),/malformed/);
  const changed={...input,receipt:{...input.receipt,status:'failed'}};
  assert.throws(()=>validateRecovery(recovered(changed),changed),/contradicts/);
});
test('cancellation marker added during polling is honored before admission',async t=>{
  let release;const h=await setup(t,input=>new Promise(r=>{release=()=>r(recovered(input));}));
  await h.recover();
  const receipt=JSON.parse(await readFile(h.receiptPath));receipt.cancellation='requested; remote termination unverified';
  await writeFile(h.receiptPath,JSON.stringify(receipt));release();await h.broker.wait();
  assert.equal((await h.visible()).status,'cancelled');assert.equal((await h.visible()).hasResult,false);
});
test('partial comparison is validated against the preserved reviewed analysis before recovery',async t=>{
  const h=await setup(t,input=>{
    const result=makeSyntheticAnalysis(input.request);delete result.boundary_proposal;
    result.status='partial';result.arms.A.raw_geometry=structuredClone(result.arms.A.geometry);
    result.arms.B={status:'failed',reason:{type:'SyntheticMissingGeneratedArm'}};
    return recovered(input,'result-available',result);
  });
  const analysis=makeSyntheticAnalysis(h.request),job=JSON.parse(await readFile(h.path));
  Object.assign(job,{pendingOperation:'reconstruct',boundary:analysis.boundary_proposal.value,openings:[],
    analysisBinding:analysis.analysis_binding,result:analysis});
  const request={...h.request,operation:'reconstruct',boundary:job.boundary,generated_images:[],openings:[],analysis_binding:job.analysisBinding};
  const bytes=JSON.stringify(request);job.requestSha256=sha(bytes);
  await writeFile(h.path,JSON.stringify(job));
  await writeFile(join(h.directory,`${job.id}-reconstruct-request.json`),bytes);
  await writeFile(join(h.directory,`${job.id}-reconstruct-request.receipt.json`),JSON.stringify({
    version:1,job_id:job.id,request_sha256:job.requestSha256,modal_call_id:'fc-COMPARE',status:'submitted'}));
  await h.recover();await h.broker.wait();assert.equal((await h.visible()).status,'partial');
});
test('reconstruct recovery supports requests above result limit, rejects above150MiB before reading',async t=>{
  const h=await setup(t),job=JSON.parse(await readFile(h.path));
  const request={...h.request,operation:'reconstruct',generated_video:{id:'video',sha256:'a'.repeat(64),data_base64:'A'.repeat(65*1024**2)}};
  const bytes=JSON.stringify(request);job.pendingOperation='reconstruct';job.requestSha256=sha(bytes);
  const path=join(h.directory,`${job.id}-reconstruct-request.json`);
  await writeFile(path,bytes);
  await writeFile(join(h.directory,`${job.id}-reconstruct-request.receipt.json`),JSON.stringify({
    version:1,job_id:job.id,request_sha256:job.requestSha256,modal_call_id:'fc-LARGE',status:'submitted'}));
  assert.equal((await recoveryInputs(h.directory,job,request)).modalCallId,'fc-LARGE');
  const handle=await open(path,'r+');try{await handle.truncate(150*1024**2+1);}finally{await handle.close();}
  await assert.rejects(recoveryInputs(h.directory,job,request),/resource limit/);assert.equal(h.calls,0);
});
