/** Protocol tests use an explicit fake Shado transport. No model or provider calls. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createBroker} from './broker.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function setup(t) {
  const previous=process.env.EVA_SHADO_ORIGIN;process.env.EVA_SHADO_ORIGIN='https://shado.example';
  const directory=await mkdtemp(join(tmpdir(),'eva-shado-v2-')),calls=[];
  let job,packet,cookie,server,broker,url,grant,mode='normal',clock=Date.now(),hold;
  const recipe={modelId:'synthetic-video',nodeId:'eva-room-video',projectId:'fixture-project'};
  const recipeHash=sha(JSON.stringify(recipe));
  const offer=()=>({id:'quote-1',recipeHash,recipe,currency:'USD',maximumCostUsd:.5,pricing:{amountMicros:500000},expiresAt:new Date(clock+60000).toISOString()});
  const task=()=>({id:packet.taskId,projectId:recipe.projectId,status:mode==='stopped'?'stopped':'running',
    steps:[{nodeId:recipe.nodeId,invocationId:'fixture-invocation',status:'running'}],receipts:[]});
  const fetcher=async(_url,init)=>{
    const body=JSON.parse(init.body);calls.push({operation:body.operation,token:init.headers.Authorization,body});
    if(body.operation==='media'){
      if(hold)await hold;
      const asset=grant.assets[body.assetIndex];
      return Response.json({ok:true,asset:{...asset,id:`media-${body.assetIndex}`,sealed:true,chunkBytes:512*1024}});
    }
    if(body.operation==='quote')return Response.json({ok:true,quote:offer()});
    if(body.operation==='submit'&&hold)await hold;
    if(body.operation==='stop'&&mode==='stop-rejected')return Response.json({ok:false,error:{code:'eva_scope_mismatch'}},{status:403});
    if(body.operation==='submit'&&mode==='uncertain')throw Error('Fake lost acknowledgement');
    if(body.operation==='submit'&&mode==='rejected')return Response.json({ok:false,error:{code:'eva_scope_mismatch'}},{status:403});
    if(body.operation==='stop'){mode='stopped';return Response.json({ok:true,task:task()});}
    return Response.json({ok:true,task:task()});
  };
  async function start() {
    const hosts=new Set();broker=await createBroker({directory,shadoFetch:fetcher,now:()=>clock,allowedHosts:hosts});server=broker.server;
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const host=`127.0.0.1:${server.address().port}`;hosts.add(host);url=`http://${host}/api/room-workflow`;
    const response=await fetch(url+'/session',{headers:cookie?{Cookie:cookie}:{}});
    cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;
    const session=await response.json();api.csrf=session.csrf;
  }
  async function close(){await broker.wait();server.closeAllConnections();await new Promise(r=>server.close(r));}
  const api=async(path,body,extra={})=>fetch(url+path,{method:body===undefined?'GET':'POST',
    headers:{Cookie:cookie,Origin:'http://127.0.0.1:1440','X-EVA-CSRF':api.csrf,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),...extra});
  await start();
  t.after(async()=>{await close();await rm(directory,{recursive:true,force:true});if(previous===undefined)delete process.env.EVA_SHADO_ORIGIN;else process.env.EVA_SHADO_ORIGIN=previous;});
  const images=Array.from({length:5},(_,i)=>({name:`fixture-${i}.png`,mime:'image/png',
    data_base64:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20,i)]).toString('base64')}));
  job=await(await api('/jobs',{images,areaStatement:'About 300 sqft',retention:'saved'})).json();
  const path=join(directory,job.id+'.json');
  const record=JSON.parse(await readFile(path,'utf8'));
  record.status='awaiting-shado';record.boundary={polygon:[[0,0],[2,0],[2,2],[0,2]],floor:0,ceiling:2};
  await writeFile(path,JSON.stringify(record));
  const action=(name,body={})=>api(`/jobs/${job.id}/${name}`,body);
  const visible=async()=>await(await api('/jobs/'+job.id)).json();
  const authorize=async()=>{
    const response=await action('authorize');assert.equal(response.status,200);packet=(await response.json()).packet;
    return packet;
  };
  const bundle=(phase='upload')=>({token:`${phase}.${'a'.repeat(43)}`,taskId:packet.taskId,
    project:JSON.stringify({format:'shado-project',version:1,project:{id:recipe.projectId}}),nodeId:recipe.nodeId,recipeHash,
    phase,quoteId:phase==='generation'?'quote-1':null,maximumMicros:phase==='generation'?500000:0,expiresAt:clock+900000,
    assets:packet.assets.map(({id,...asset})=>({...asset,sourceId:id,version:id}))});
  const envelope=(value,uploadNonce='b'.repeat(64))=>({type:'eva-room-grant',nonce:packet.nonce,jobId:job.id,uploadNonce,grant:value});
  const upload=async()=>{await authorize();grant=bundle();const r=await action('grant',envelope(grant));assert.equal(r.status,202,await r.text());await broker.wait();};
  const generation=async()=>{const r=await action('grant',envelope(bundle('generation')));assert.equal(r.status,200,await r.text());};
  return {api,action,visible,authorize,bundle,envelope,upload,generation,calls,directory,path,
    get packet(){return packet;},get broker(){return broker;},setMode:value=>{mode=value;},setHold:value=>{hold=value;},
    restart:async()=>{await close();await start();},advance:ms=>{clock+=ms;}};
}
test('zero-spend upload obtains real quote, then distinct quote-bound authority submits once',async t=>{
  const h=await setup(t);await h.upload();
  assert.equal((await h.visible()).status,'awaiting-shado-generation');
  assert.deepEqual(h.calls.map(c=>c.operation),['media','media','media','media','media','quote']);
  assert.equal((await h.action('shado')).status,409);
  const quote=await(await h.api(`/jobs/${(await h.visible()).id}/shado-quote`)).json();
  assert.equal(quote.type,'eva-room-quote');assert.equal(quote.uploadNonce,'b'.repeat(64));
  await h.generation();assert.equal((await h.visible()).status,'ready-shado-generation');
  assert.equal((await h.action('shado')).status,202);await h.broker.wait();
  assert.equal((await h.visible()).status,'shado-running');
  assert.equal((await h.action('shado')).status,409);
  assert.equal(h.calls.filter(c=>c.operation==='submit').length,1);
  assert.equal(h.calls.find(c=>c.operation==='quote').token,'Bearer upload.'+'a'.repeat(43));
  assert.equal(h.calls.find(c=>c.operation==='submit').token,'Bearer generation.'+'a'.repeat(43));
  const serialized=JSON.stringify(await h.visible());
  for(const secret of ['authorizationNonce','shadoUploadNonce','shadoFrozen','shadoQuote":','"project":','generation.'+'a'.repeat(43)])assert.ok(!serialized.includes(secret));
  for(const name of await readdir(h.directory))assert.ok(!(await readFile(join(h.directory,name),'utf8')).includes('.'+'a'.repeat(43)),'No bearer token persisted');
});
test('different room jobs receive distinct immutable Shado media identities',async t=>{
  const h=await setup(t);const first=await h.authorize();
  const original=JSON.parse(await readFile(h.path,'utf8'));
  const images=original.images.map(({name,mime,data_base64})=>{
    const bytes=Buffer.from(data_base64,'base64');bytes[bytes.length-1]+=10;
    return {name,mime,data_base64:bytes.toString('base64')};
  });
  const second=await(await h.api('/jobs',{images,areaStatement:'About 300 sqft',retention:'saved'})).json();
  const path=join(h.directory,second.id+'.json');const record=JSON.parse(await readFile(path,'utf8'));
  record.status='awaiting-shado';record.boundary=original.boundary;await writeFile(path,JSON.stringify(record));
  const response=await h.api(`/jobs/${second.id}/authorize`,{});assert.equal(response.status,200);
  const packet=(await response.json()).packet;
  assert.equal(packet.assets.some(a=>first.assets.some(b=>a.id===b.id)),false);
  assert.deepEqual((await h.authorize()).assets,first.assets);
});
test('legacy frozen media identities survive authorization renewal',async t=>{
  const h=await setup(t);await h.upload();
  const record=JSON.parse(await readFile(h.path,'utf8'));
  record.shadoFrozen.assets.forEach((asset,i)=>{asset.sourceId=record.images[i].id;asset.version=record.images[i].id;});
  await writeFile(h.path,JSON.stringify(record));await h.restart();
  const packet=await h.authorize();assert.deepEqual(packet.assets.map(a=>a.id),record.images.map(a=>a.id));
  assert.equal((await h.action('grant',h.envelope(h.bundle('upload')))).status,202);await h.broker.wait();
  assert.equal((await h.visible()).status,'awaiting-shado-generation');
});
test('generation rejects wrong popup binding, price, quote and frozen project',async t=>{
  const h=await setup(t);await h.upload();
  const good=h.bundle('generation');
  for(const value of [{...h.envelope(good),uploadNonce:'c'.repeat(64)},h.envelope({...good,maximumMicros:1}),
    h.envelope({...good,quoteId:'different'}),h.envelope({...good,project:good.project+' '}),
    h.envelope({...good,recipeHash:'0'.repeat(64)})])assert.equal((await h.action('grant',value)).status,400);
  h.advance(60001);assert.equal((await h.action('grant',h.envelope(good))).status,400);
  assert.equal(h.calls.filter(c=>c.operation==='submit').length,0);
});
test('reopen resumes frozen uploaded task; stale invalidation cannot revoke the new popup',async t=>{
  const h=await setup(t);await h.upload();const previous={nonce:h.packet.nonce,jobId:(await h.visible()).id,uploadNonce:'b'.repeat(64)},task=h.packet.taskId;
  await h.restart();assert.equal((await h.visible()).shadoAuthorized,false);
  await h.upload();assert.equal(h.packet.taskId,task);
  assert.equal((await h.action('shado-invalidate',previous)).status,409);
  assert.equal((await h.visible()).status,'awaiting-shado-generation');
  assert.equal((await h.action('shado-invalidate',{...previous,nonce:h.packet.nonce})).status,200);
  assert.equal((await h.visible()).status,'awaiting-shado');
  assert.equal((await h.action('grant',h.envelope(h.bundle('generation')))).status,400);
});
test('uncertain submission survives restart and only recovery access can query its same task',async t=>{
  const h=await setup(t);await h.upload();await h.generation();h.setMode('uncertain');
  await h.action('shado');await h.broker.wait();assert.equal((await h.visible()).status,'shado-submission-unknown');
  const task=h.packet.taskId;await h.restart();await h.authorize();assert.equal(h.packet.type,'eva-room-recovery-request');assert.equal(h.packet.taskId,task);
  assert.equal((await h.action('grant',h.envelope(h.bundle('upload')))).status,400);
  assert.equal((await h.action('grant',h.envelope(h.bundle('recovery')))).status,200);
  assert.equal((await h.action('shado')).status,409);
  assert.equal((await h.action('shado-status')).status,200);
  assert.equal(h.calls.filter(c=>c.operation==='submit').length,1);
  assert.equal(h.calls.filter(c=>c.operation==='quote').length,1);
});
test('definite submit rejection permits deletion and requires fresh authorization',async t=>{
  const h=await setup(t);await h.upload();await h.generation();h.setMode('rejected');
  await h.action('shado');await h.broker.wait();
  const job=await h.visible();
  assert.equal(job.status,'awaiting-shado');assert.equal(job.shadoSubmissionStarted,false);
  assert.equal(job.shadoAuthorized,false);
  assert.equal((await h.action('shado')).status,409);
  assert.equal(h.calls.filter(c=>c.operation==='submit').length,1);
  assert.equal((await h.api('/jobs/'+job.id,undefined,{method:'DELETE'})).status,200);
});
test('rejected stop after acknowledged submit retains recovery state',async t=>{
  const h=await setup(t);await h.upload();await h.generation();h.setMode('stop-rejected');
  let release;h.setHold(new Promise(r=>{release=r;}));
  try{
    await h.action('shado');await h.action('cancel');
  }finally{release();}
  await h.broker.wait();const job=await h.visible();
  assert.equal(job.status,'cancel-requested');assert.equal(job.shadoSubmissionStarted,true);
  assert.equal(job.shadoCancelRequested,true);
  assert.equal((await h.api('/jobs/'+job.id,undefined,{method:'DELETE'})).status,409);
  await h.restart();await h.authorize();assert.equal(h.packet.type,'eva-room-recovery-request');
});
test('cancelled submit rejection settles without losing deletion access',async t=>{
  const h=await setup(t);await h.upload();await h.generation();
  let release;h.setHold(new Promise(r=>{release=r;}));
  try{
    await h.action('shado');await h.action('cancel');h.setMode('rejected');
  }finally{release();}
  await h.broker.wait();const job=await h.visible();
  assert.equal(job.status,'cancelled');assert.equal(job.shadoSubmissionStarted,false);
  assert.equal((await h.action('authorize')).status,409);
  assert.equal((await h.api('/jobs/'+job.id,undefined,{method:'DELETE'})).status,200);
});
test('cancel during upload discards late quote and cannot authorize generation',async t=>{
  const h=await setup(t);let release;h.setHold(new Promise(r=>{release=r;}));
  await h.authorize();const upload=h.bundle();const accepted=await h.action('grant',h.envelope(upload));assert.equal(accepted.status,202);
  await h.action('cancel');release();await h.broker.wait();
  assert.equal((await h.visible()).status,'cancelled');
  assert.equal((await h.action('authorize')).status,409);assert.equal((await h.action('shado')).status,409);
  assert.equal(h.calls.filter(c=>c.operation==='quote'||c.operation==='submit').length,0);
});
test('cancelled submitted task keeps stop/status access and never uploads or generates again',async t=>{
  const h=await setup(t);await h.upload();await h.generation();await h.action('shado');await h.broker.wait();
  await h.action('cancel');assert.equal((await h.visible()).status,'cancel-requested');
  await h.restart();await h.authorize();assert.equal(h.packet.type,'eva-room-recovery-request');
  assert.equal((await h.action('grant',h.envelope(h.bundle('recovery')))).status,200);
  assert.equal((await h.action('shado-status')).status,200);
  assert.equal((await h.visible()).status,'cancelled');
  assert.equal(h.calls.filter(c=>c.operation==='submit').length,1);
  assert.equal(h.calls.filter(c=>c.operation==='quote').length,1);
});
test('restart before submission permits only fresh upload authority for the frozen task',async t=>{
  const h=await setup(t);await h.upload();const task=h.packet.taskId;
  const record=JSON.parse(await readFile(h.path,'utf8'));record.status='shado-preparing';await writeFile(h.path,JSON.stringify(record));
  await h.restart();assert.equal((await h.visible()).status,'awaiting-shado');
  await h.authorize();assert.equal(h.packet.taskId,task);
  const modified=h.bundle();modified.assets[0].version='changed';
  assert.equal((await h.action('grant',h.envelope(modified))).status,400);
  assert.equal(h.calls.filter(c=>c.operation==='submit').length,0);
});
test('ready generation survives restart through same-task renewal without replaying sealed uploads',async t=>{
  const h=await setup(t);await h.upload();await h.generation();const task=h.packet.taskId;
  await h.restart();assert.equal((await h.visible()).status,'awaiting-shado');
  const before=h.calls.length;await h.authorize();assert.equal(h.packet.taskId,task);
  assert.equal((await h.action('grant',h.envelope(h.bundle('generation')))).status,400);
  assert.equal((await h.action('grant',h.envelope(h.bundle('upload')))).status,202);await h.broker.wait();
  assert.equal((await h.visible()).status,'awaiting-shado-generation');
  assert.equal(h.calls.length,before,'Renewal reuses unexpired quote and does not upload.');
  await h.generation();assert.equal((await h.visible()).status,'ready-shado-generation');
  assert.equal(h.calls.filter(c=>c.operation==='submit').length,0);
});
test('expired ready authorization permits quote-only renewal and never reuploads or submits automatically',async t=>{
  const h=await setup(t);await h.upload();await h.generation();h.advance(900001);
  assert.equal((await h.visible()).status,'awaiting-shado');
  assert.equal((await h.action('shado')).status,409);
  const task=h.packet.taskId;await h.authorize();assert.equal(h.packet.taskId,task);
  await h.action('grant',h.envelope(h.bundle('upload')));await h.broker.wait();
  assert.equal(h.calls.filter(c=>c.operation==='media').length,5);
  assert.equal(h.calls.filter(c=>c.operation==='quote').length,2);
  assert.equal(h.calls.filter(c=>c.operation==='submit').length,0);
  await h.generation();assert.equal((await h.visible()).status,'ready-shado-generation');
});
