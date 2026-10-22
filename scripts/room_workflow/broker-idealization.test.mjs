/** Private lifecycle with real CPU assembly/admission; sources are explicitly synthetic. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile,readdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createBroker,terminateProcessTree} from './broker.mjs';
import {runIdealization,readIdealizedCandidate} from './idealized-adapter.mjs';
import {makeIdealizedFixture} from './idealized-fixtures.mjs';
import {idealizedDigest,sealIdealized} from './idealized-result.mjs';

const python=resolve('.local/reconstruction/venv/Scripts/python.exe');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const registration={scale:1,rotation:[[1,0,0],[0,1,0],[0,0,1]],translation:[0,0,0]};
function preparedFixture(){
  const fixture=makeIdealizedFixture();fixture.frame.id='worldmirror-candidate';
  fixture.bindings.frame_sha256=idealizedDigest(fixture.frame);
  fixture.bindings.registration_sha256=idealizedDigest(registration);
  return fixture;
}
async function setup(t,runner,extras={}){
  const {beforeSourceLoad,...options}=extras;
  const directory=await mkdtemp(join(tmpdir(),'eva-idealization-broker-')),hosts=new Set(),fixture=preparedFixture();
  const source={source:'retained-seven-photo-room',source_sha256:sha('synthetic source'),
    request:{job_id:fixture.job_id,images:fixture.bindings.originals.map(p=>({...p,data_base64:Buffer.alloc(20).toString('base64')}))},
    analysis:{analysis_binding:fixture.bindings.analysis_binding},observations:fixture.bindings.observations,
    worldmirror_report:{registration,original_to_candidate_rotation:registration.rotation,
      boundary:fixture.boundary,openings:fixture.openings,
      worldmirror:{manifest_sha256:fixture.bindings.estimator_artifact_sha256}}};
  const inputLoader=async(_source,review)=>({...Object.fromEntries(['candidate_id','bindings','frame'].map(k=>[k,structuredClone(fixture[k])])),
    ...structuredClone(review),shell_color_srgb:[.52,.50,.46]});
  const config={directory,allowedHosts:hosts,idealizationSourceLoader:async()=>{await beforeSourceLoad?.();return structuredClone(source);},
    idealizationInputLoader:inputLoader,idealizationPython:python,
    idealizationRunner:runner??((envelope,options)=>runIdealization(envelope,{...options,python,terminate:terminateProcessTree})),...options};
  let broker=await createBroker(config),base;
  async function listen(){await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));const host=`127.0.0.1:${broker.server.address().port}`;hosts.add(host);base=`http://${host}/api/room-workflow`;}
  await listen();
  const response=await fetch(base+'/session'),cookie=response.headers.get('set-cookie').split(';')[0],session=await response.json();
  const api=(path,body,method=body===undefined?'GET':'POST',headers={})=>fetch(base+path,{method,
    headers:{Cookie:cookie,Origin:'http://127.0.0.1:1440','X-EVA-CSRF':session.csrf,'Content-Type':'application/json',...headers},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const imported=await api('/jobs/import-idealization',{source:source.source,expected_source_sha256:source.source_sha256});
  assert.equal(imported.status,201);const {job_id:id}=await imported.json(),path=join(directory,id+'.json');
  const action=body=>api(`/jobs/${id}/idealization`,body);
  const get=async()=>{const r=await api(`/jobs/${id}/idealization`);assert.equal(r.status,200,await r.clone().text());return r.json();};
  const prepare=()=>action({action:'prepare',expected_revision:null,boundary:fixture.boundary,openings:fixture.openings,inventory:fixture.inventory});
  const close=async()=>{await broker.wait();broker.server.closeAllConnections();await new Promise(r=>broker.server.close(r));};
  t.after(async()=>{await close();await rm(directory,{recursive:true,force:true});});
  return {id,path,directory,fixture,source,api,action,get,prepare,get broker(){return broker;},
    restart:async()=>{await close();broker=await createBroker(config);await listen();}};
}
const reviewBody=(state,source)=>({action:'review',expected_revision:state.revision,candidate_revision:state.revision,
  source_sha256:source.source_sha256,boundary_sha256:idealizedDigest({boundary:state.candidate.boundary,openings:state.candidate.openings}),
  inventory_sha256:idealizedDigest(state.candidate.inventory),decisions:{boundary:true,inventory:true,review_reasons:state.review_reasons}});

test('source discovery exposes only current import bindings and unconfirmed room data',async t=>{
  const h=await setup(t,()=>{throw Error('Discovery must not assemble');}),before=await readFile(h.path);
  const files=await readdir(h.directory),response=await h.api('/idealization-source');
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const value=await response.json();
  assert.deepEqual(value,{source:h.source.source,source_sha256:h.source.source_sha256,
    coordinate_frame:'worldmirror-candidate',up:'Z',units:'relative',boundary_confirmed:false,
    boundary:h.fixture.boundary,openings:h.fixture.openings,
    photos:h.fixture.bindings.originals.map((p,i)=>({...p,url:`/api/room-workflow/benchmark/arkitscenes/originals/${i}`}))});
  assert.deepEqual(await readFile(h.path),before);assert.deepEqual(await readdir(h.directory),files);
  h.source.source_sha256=sha('updated synthetic source');
  const updated=await(await h.api('/idealization-source')).json();assert.notEqual(updated.source_sha256,value.source_sha256);
  assert.equal((await h.api('/jobs/import-idealization',{source:value.source,expected_source_sha256:value.source_sha256})).status,409);
  assert.equal((await h.api('/jobs/import-idealization',{source:updated.source,expected_source_sha256:updated.source_sha256})).status,201);
});

test('source discovery requires session and same-origin inspection and accepts no selectors or writes',async t=>{
  const h=await setup(t);
  assert.equal((await h.api('/idealization-source',undefined,'GET',{Cookie:''})).status,401);
  assert.equal((await h.api('/idealization-source',undefined,'GET',{Origin:'https://unrelated.invalid'})).status,403);
  assert.equal((await h.api('/idealization-source?path=private.json')).status,400);
  assert.equal((await h.api('/idealization-source',{})).status,405);
  assert.equal((await h.api('/idealization-source',undefined,'DELETE')).status,405);
  assert.equal((await h.get()).status,'not-started');
});

test('source discovery fails closed without leaking source-loader errors',async t=>{
  let fail=false;
  const h=await setup(t,undefined,{idealizationSourceLoader:async()=>{
    if(fail)throw Error('Private path C:/private/source.json');
    const fixture=preparedFixture();
    return {source:'retained-seven-photo-room',source_sha256:sha('synthetic source'),
      request:{job_id:fixture.job_id,images:fixture.bindings.originals.map(p=>({...p,data_base64:Buffer.alloc(20).toString('base64')}))}};
  }});
  fail=true;
  const response=await h.api('/idealization-source');assert.equal(response.status,503);
  const body=await response.text();assert.doesNotMatch(body,/C:|private\/|source\.json/);
  assert.equal((await h.get()).status,'not-started');
});

for(const other of ['discovery','import'])test(`source discovery serializes heavy loads with ${other}`,async t=>{
  let holding=false,active=0,peak=0,entered,release;
  const started=new Promise(r=>{entered=r;}),gate=new Promise(r=>{release=r;});
  const h=await setup(t,undefined,{beforeSourceLoad:async()=>{
    if(!holding)return;
    active++;peak=Math.max(peak,active);entered();await gate;active--;
  }});
  holding=true;
  const first=other==='discovery'?h.api('/idealization-source'):
    h.api('/jobs/import-idealization',{source:h.source.source,expected_source_sha256:h.source.source_sha256});
  await started;
  const received=new Promise(r=>h.broker.server.once('request',r));
  const second=h.api('/idealization-source');
  await received;await new Promise(r=>setImmediate(r));release();
  assert.equal((await first).status,other==='discovery'?200:201);assert.equal((await second).status,200);
  assert.equal(peak,1,'Source loads must not overlap discovery or import');
});

test('private idealization assembles and reopens without changing job or model results',async t=>{
  const h=await setup(t),before=JSON.parse(await readFile(h.path));
  assert.deepEqual(await h.get(),{status:'not-started',revision:null,loaded_revision:null,candidate:null,review_reasons:[]});
  const response=await h.prepare();assert.equal(response.status,202,await response.text());await h.broker.wait();
  const state=await h.get();assert.equal(state.status,'needs-review');assert.equal(state.candidate.job_id,h.id);
  assert.equal(state.loaded_revision,state.revision);assert.deepEqual(state.candidate.inventory,h.fixture.inventory);
  const after=JSON.parse(await readFile(h.path));assert.equal(after.status,before.status);assert.deepEqual(after.result,before.result);
  const visible=await(await h.api('/jobs/'+h.id)).json();assert.equal(visible.idealization,undefined);assert.equal(visible.idealizationSource,undefined);
  assert.equal((await h.prepare()).status,409);
  await h.restart();assert.deepEqual(await h.get(),state);
});

for(const changed of ['estimator','registration','observations','frame'])test(`preparation rejects unbound ${changed}`,async t=>{
  const fixture=preparedFixture();
  if(changed==='estimator')fixture.bindings.estimator_id='Other';
  if(changed==='registration')fixture.bindings.registration_sha256='0'.repeat(64);
  if(changed==='observations')fixture.bindings.observations[0].mask_sha256='0'.repeat(64);
  if(changed==='frame'){
    fixture.frame.source_to_candidate[0][3]=1;fixture.frame.candidate_to_source[0][3]=-1;
    fixture.bindings.frame_sha256=idealizedDigest(fixture.frame);
  }
  const h=await setup(t,undefined,{idealizationInputLoader:async(_source,review)=>({
    ...Object.fromEntries(['candidate_id','bindings','frame'].map(k=>[k,structuredClone(fixture[k])])),
    ...structuredClone(review),shell_color_srgb:[.52,.50,.46]})});
  assert.equal((await h.prepare()).status,202);await h.broker.wait();
  const state=await h.get();assert.equal(state.status,'failed');assert.equal(state.loaded_revision,null);
});

test('review is exact and corrections retain history while rejecting stale concurrent edits',async t=>{
  const h=await setup(t);assert.equal((await h.prepare()).status,202);await h.broker.wait();const initial=await h.get();
  const forged=reviewBody(initial,h.source);forged.source_sha256='0'.repeat(64);
  assert.equal((await h.action(forged)).status,409);
  assert.equal((await h.action({...reviewBody(initial,h.source),ready:true})).status,400);
  assert.equal((await h.action(reviewBody(initial,h.source))).status,200);assert.equal((await h.get()).status,'ready');
  const correction={action:'correct',expected_revision:initial.revision,correction:{action:'set',object_id:h.fixture.inventory[0].id,changes:{color_srgb:[0,0,0]}}};
  const results=await Promise.all([h.action(correction),h.action(correction)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[202,409]);await h.broker.wait();
  const updated=await h.get();assert.equal(updated.status,'needs-review');assert.notEqual(updated.revision,initial.revision);
  assert.equal(updated.candidate.parent_revision,initial.revision);assert.deepEqual(updated.candidate.inventory[0].color_srgb,[0,0,0]);
  assert.equal((await h.action(reviewBody(initial,h.source))).status,409);
  assert.equal((await h.action({action:'undo',expected_revision:updated.revision,revision:initial.revision})).status,202);
  await h.broker.wait();const undone=await h.get();assert.equal(undone.status,'needs-review');
  assert.equal(undone.candidate.parent_revision,updated.revision);assert.notEqual(undone.revision,initial.revision);
  assert.deepEqual(undone.candidate.inventory,initial.candidate.inventory);
  assert.equal((await h.api('/jobs/'+h.id,undefined,'DELETE')).status,200);
  assert.deepEqual((await readdir(h.directory)).filter(n=>n.startsWith(h.id)),[]);
});

test('failed update and sidecar cancellation keep the loaded candidate and model status',async t=>{
  let rejectUpdate;
  const h=await setup(t,async(envelope,options)=>{
    if(envelope.parent_revision)return new Promise((_,reject)=>{rejectUpdate=reject;options.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});});
    return runIdealization(envelope,{...options,python,terminate:terminateProcessTree});
  });
  assert.equal((await h.prepare()).status,202);await h.broker.wait();const initial=await h.get();
  const edit={action:'correct',expected_revision:initial.revision,correction:{action:'omit',object_id:h.fixture.inventory[0].id}};
  await h.action(edit);
  // Derivation happens asynchronously before the deliberately delayed assembly.
  while(!rejectUpdate)await new Promise(r=>setImmediate(r));
  rejectUpdate(Error('worker failed'));await h.broker.wait();
  let state=await h.get();assert.equal(state.status,'failed');assert.equal(state.loaded_revision,initial.revision);assert.deepEqual(state.candidate,initial.candidate);
  rejectUpdate=undefined;await h.action(edit);while(!rejectUpdate)await new Promise(r=>setImmediate(r));
  assert.equal((await h.action({action:'cancel',expected_revision:initial.revision})).status,200);await h.broker.wait();
  state=await h.get();assert.equal(state.status,'cancelled');assert.equal(state.loaded_revision,initial.revision);
  assert.equal((await(await h.api('/jobs/'+h.id)).json()).status,'idealization-review');
});

test('fitting diagnostics remain explicit review reasons and do not survive changed geometry',async t=>{
  const diagnostic={code:'silhouette-disagreement',object_ids:['table-1'],view_ids:['photo-1'],residual:.8,reason:'Synthetic poor agreement'};
  const fixture=preparedFixture();diagnostic.object_ids=[fixture.inventory[0].id];
  const h=await setup(t,undefined,{idealizationInputLoader:async(_source,review)=>({
    ...Object.fromEntries(['candidate_id','bindings','frame'].map(k=>[k,structuredClone(fixture[k])])),...structuredClone(review),
    shell_color_srgb:[.52,.50,.46],fit_diagnostics:[diagnostic]})});
  assert.equal((await h.prepare()).status,202);await h.broker.wait();const initial=await h.get();
  assert.ok(initial.review_reasons.some(reason=>reason.includes('silhouette-disagreement')));
  assert.equal((await h.action({action:'correct',expected_revision:initial.revision,
    correction:{action:'set',object_id:fixture.inventory[0].id,changes:{yaw:.1}}})).status,202);
  await h.broker.wait();const changed=await h.get();assert.equal(changed.status,'needs-review');
  assert.equal(changed.candidate.diagnostics.some(d=>d.code==='silhouette-disagreement'),false);
});

for(const stage of ['assembly','reopen'])test(`source-fit diagnostics cannot be removed at ${stage}`,async t=>{
  const fixture=preparedFixture(),diagnostic={code:'silhouette-disagreement',object_ids:[fixture.inventory[0].id],
    view_ids:[fixture.bindings.originals[0].id],residual:.8,reason:'Synthetic poor agreement'};
  const h=await setup(t,stage==='assembly'?async(envelope,options)=>{
    const altered={...envelope,fit_diagnostics:[]};
    return runIdealization(altered,{...options,python,terminate:terminateProcessTree,inputSha256:sha(JSON.stringify(altered))});
  }:undefined,{idealizationInputLoader:async(_source,review)=>({
    ...Object.fromEntries(['candidate_id','bindings','frame'].map(k=>[k,structuredClone(fixture[k])])),...structuredClone(review),
    shell_color_srgb:[.52,.50,.46],fit_diagnostics:[diagnostic]})});
  assert.equal((await h.prepare()).status,202);await h.broker.wait();
  if(stage==='assembly'){
    const state=await h.get();assert.equal(state.status,'failed');assert.equal(state.loaded_revision,null);
  }else{
    const state=await h.get(),record=JSON.parse(await readFile(h.path)),entry=record.idealization.history[0];
    const folder=join(h.directory,h.id+'-idealization-'+entry.attempt),path=join(folder,'candidate.json');
    const candidate=JSON.parse(await readFile(path));candidate.diagnostics=candidate.diagnostics.filter(d=>d.code!=='silhouette-disagreement');
    sealIdealized(candidate);const bytes=JSON.stringify(candidate);await writeFile(path,bytes);
    await writeFile(join(folder,'manifest.json'),JSON.stringify({version:1,revision:candidate.revision,candidate_sha256:sha(bytes)}));
    // Keep the trusted prepared envelope, but point history at this newly resealed output.
    entry.revision=candidate.revision;record.idealization.revision=candidate.revision;record.idealization.loaded_revision=candidate.revision;
    await writeFile(h.path,JSON.stringify(record));
    assert.notEqual(candidate.revision,state.revision);
    assert.equal((await h.api(`/jobs/${h.id}/idealization`)).status,400);
  }
});

test('room corrections revise boundary and openings without granting review or changing inventory',async t=>{
  const h=await setup(t);assert.equal((await h.prepare()).status,202);await h.broker.wait();const initial=await h.get();
  assert.equal((await h.action(reviewBody(initial,h.source))).status,200);
  const boundary={...initial.candidate.boundary,ceiling:3.2},openings=[
    {id:'window-1',kind:'window',edge_index:2,t0:.2,t1:.4,bottom:1,top:2}];
  const correction={action:'room',boundary,openings};
  assert.equal((await h.action({action:'correct',expected_revision:initial.revision,correction})).status,202);
  await h.broker.wait();const changed=await h.get();assert.equal(changed.status,'needs-review');
  assert.deepEqual(changed.candidate.boundary,boundary);assert.deepEqual(changed.candidate.openings,openings);
  assert.deepEqual(changed.candidate.inventory,initial.candidate.inventory);
  assert.equal(changed.candidate.parent_revision,initial.revision);
  assert.equal((await h.action(reviewBody(initial,h.source))).status,409);
  await h.restart();assert.deepEqual(await h.get(),changed);
  for(const invalid of [{...correction,ready:true},{...correction,boundary:{...boundary,ceiling:-1}},
    {...correction,openings:[{...openings[0],top:9}]}]){
    const response=await h.action({action:'correct',expected_revision:changed.revision,correction:invalid});
    assert.ok([400,202].includes(response.status));await h.broker.wait();
    const rejected=await h.get();assert.notEqual(rejected.status,'ready');assert.equal(rejected.loaded_revision,changed.revision);
    assert.deepEqual(rejected.candidate,changed.candidate);
  }
});

test('uncertain candidate reopen durably blocks further verification and cleanup',async t=>{
  let clock=Date.now(),reads=0,uncertain=false;
  const h=await setup(t,undefined,{now:()=>clock,idealizationReader:async(...args)=>{
    reads++;
    if(uncertain){const error=Error('Synthetic verifier uncertainty');error.code='termination-unconfirmed';throw error;}
    return readIdealizedCandidate(...args);
  }});
  assert.equal((await h.prepare()).status,202);await h.broker.wait();const initial=await h.get();
  uncertain=true;
  assert.equal((await h.api(`/jobs/${h.id}/idealization`)).status,400);
  const count=reads,record=JSON.parse(await readFile(h.path));assert.equal(record.idealization.cleanup_pending,true);
  assert.equal((await h.get()).candidate,null);assert.equal(reads,count);
  assert.equal((await h.api('/jobs/'+h.id,undefined,'DELETE')).status,409);
  clock+=25*3600000;await h.broker.expire();await h.restart();
  const state=await h.get();assert.equal(state.cleanup_pending,true);assert.equal(state.loaded_revision,initial.revision);
  assert.equal(reads,count);assert.ok((await readFile(h.path)).length);
});

test('restart retains an interrupted worker receipt and blocks retries or deletion',async t=>{
  const h=await setup(t);assert.equal((await h.prepare()).status,202);await h.broker.wait();const initial=await h.get();
  const record=JSON.parse(await readFile(h.path));record.idealization.status='preparing';record.idealization.cleanup_pending=true;
  await writeFile(h.path,JSON.stringify(record));await h.restart();
  const state=await h.get();assert.equal(state.status,'failed');assert.equal(state.loaded_revision,initial.revision);
  assert.equal((await h.action({action:'correct',expected_revision:initial.revision,correction:{action:'omit',object_id:h.fixture.inventory[0].id}})).status,409);
  assert.equal((await h.api('/jobs/'+h.id,undefined,'DELETE')).status,409);
  assert.ok((await readFile(h.path)).length>0);
});

test('expiry aborts owned idealization before removing its private files',async t=>{
  let clock=Date.now(),aborted=false,started;const startedPromise=new Promise(r=>{started=r;});
  const h=await setup(t,(_envelope,{signal})=>new Promise((_,reject)=>{
    const timer=setTimeout(()=>reject(Error('test worker expired')),3000);timer.unref();
    signal.addEventListener('abort',()=>{aborted=true;clearTimeout(timer);reject(Error('cancelled'));},{once:true});started();
  }),{now:()=>clock});
  assert.equal((await h.prepare()).status,202);await startedPromise;clock+=25*3600000;
  await h.broker.expire();await h.broker.wait();
  assert.equal(aborted,true);assert.deepEqual((await readdir(h.directory)).filter(n=>n.startsWith(h.id)),[]);
});

test('one unsafe expired artifact cannot block listing or another private import',async t=>{
  let clock=Date.now();const h=await setup(t,undefined,{now:()=>clock});
  const unexpected=join(h.directory,h.id+'-unexpected');await mkdir(unexpected);
  await writeFile(join(unexpected,'keep.txt'),'Retain for operator inspection');
  clock+=25*3600000;
  const listed=await h.api('/jobs');assert.equal(listed.status,200,await listed.clone().text());
  assert.equal((await listed.json())[0].cleanupError,'Private artifacts require operator cleanup inspection.');
  const imported=await h.api('/jobs/import-idealization',{source:h.source.source,expected_source_sha256:h.source.source_sha256});
  assert.equal(imported.status,201,await imported.text());
  await h.restart();
  assert.ok((await readFile(h.path)).length);
  assert.equal(await readFile(join(unexpected,'keep.txt'),'utf8'),'Retain for operator inspection');
});

test('unconfirmed worker termination cannot expire its recovery records',async t=>{
  let clock=Date.now();const h=await setup(t,async()=>{const error=Error('unconfirmed');error.code='termination-unconfirmed';throw error;},{now:()=>clock});
  assert.equal((await h.prepare()).status,202);await h.broker.wait();clock+=25*3600000;
  await h.broker.expire();assert.ok((await readFile(h.path)).length>0);
  assert.equal((await h.api('/jobs/'+h.id,undefined,'DELETE')).status,409);
});

for(const nested of [false,true])test(`private cleanup does not follow ${nested?'nested':'top-level'} directory links`,async t=>{
  const h=await setup(t),outside=join(h.directory,'unrelated');await mkdir(outside);
  await writeFile(join(outside,'keep.txt'),'Unrelated evidence');
  let parent=h.directory;
  if(nested){
    assert.equal((await h.prepare()).status,202);await h.broker.wait();
    const record=JSON.parse(await readFile(h.path));parent=join(h.directory,h.id+'-idealization-'+record.idealization.history[0].attempt);
  }
  const link=join(parent,nested?'linked-evidence':h.id+'-linked-evidence');
  await symlink(outside,link,process.platform==='win32'?'junction':'dir');
  assert.equal((await h.api('/jobs/'+h.id,undefined,'DELETE')).status,nested?200:400);
  assert.equal(await readFile(join(outside,'keep.txt'),'utf8'),'Unrelated evidence');
  if(!nested){assert.ok((await readFile(h.path)).length>0);await rm(link);}
});

test('idealization requires owner, session and CSRF and enforces request and attempt limits',async t=>{
  const h=await setup(t),path=`/jobs/${h.id}/idealization`,body={action:'prepare',expected_revision:null,
    boundary:h.fixture.boundary,openings:[],inventory:h.fixture.inventory};
  assert.equal((await h.api(path,undefined,'GET',{Cookie:''})).status,401);
  assert.equal((await h.api(path,body,'POST',{'X-EVA-CSRF':''})).status,403);
  assert.equal((await h.api(path,body,'POST',{Origin:'https://unrelated.invalid'})).status,403);
  const other=await h.api('/session',undefined,'GET',{Cookie:''});
  const cookie=other.headers.get('set-cookie').split(';')[0],session=await other.json();
  assert.equal((await h.api(path,undefined,'GET',{Cookie:cookie})).status,400);
  assert.equal((await h.api(path,body,'POST',{Cookie:cookie,'X-EVA-CSRF':session.csrf})).status,400);
  assert.equal((await h.action({...body,ready:true})).status,400);
  assert.equal((await h.action({...body,inventory:'x'.repeat(65536)})).status,400);
  assert.equal((await h.get()).status,'not-started');
  const record=JSON.parse(await readFile(h.path));record.idealization.attempts=32;await writeFile(h.path,JSON.stringify(record));
  assert.equal((await h.prepare()).status,409);assert.equal((await h.get()).status,'not-started');
});

for(const changed of ['source-snapshot','source-binding','history','revision'])test(`assembly rejects changed ${changed} before admission`,async t=>{
  let started,release;const startedPromise=new Promise(r=>{started=r;}),gate=new Promise(r=>{release=r;});
  const h=await setup(t,async(envelope,options)=>{
    const value=await runIdealization(envelope,{...options,python,terminate:terminateProcessTree});
    started();await gate;return value;
  });
  assert.equal((await h.prepare()).status,202);await startedPromise;
  const record=JSON.parse(await readFile(h.path));
  if(changed==='source-snapshot')await writeFile(join(h.directory,h.id+'-idealization-source.json'),JSON.stringify({...h.source,source_sha256:'0'.repeat(64)}));
  else{
    if(changed==='source-binding')record.idealizationSource.source_sha256='0'.repeat(64);
    if(changed==='history')record.idealization.history=[{revision:'0'.repeat(64)}];
    if(changed==='revision')record.idealization.revision='0'.repeat(64);
    await writeFile(h.path,JSON.stringify(record));
  }
  release();await h.broker.wait();const rejected=JSON.parse(await readFile(h.path)).idealization;
  assert.equal(rejected.status,'failed');assert.equal(rejected.loaded_revision,null);assert.equal(rejected.review,undefined);
});

for(const forged of ['ready','provenance','inventory'])test(`worker cannot choose ${forged}`,async t=>{
  const h=await setup(t,async(envelope,options)=>{
    const value=await runIdealization(envelope,{...options,python,terminate:terminateProcessTree});
    if(forged==='ready')value.ready=true;
    if(forged==='provenance')value.geometry.provenance[0]='photo-estimated';
    if(forged==='inventory')value.inventory[0].color_srgb=[1,0,0];
    sealIdealized(value);return value;
  });
  assert.equal((await h.prepare()).status,202);await h.broker.wait();const state=await h.get();
  assert.equal(state.status,'failed');assert.equal(state.candidate,null);assert.equal(state.loaded_revision,null);
});

test('tampered candidate is never returned even when its structural hashes are resealed',async t=>{
  const h=await setup(t);assert.equal((await h.prepare()).status,202);await h.broker.wait();const initial=await h.get();
  const folders=(await readdir(h.directory)).filter(n=>n.startsWith(h.id+'-idealization-')&&!n.endsWith('.json'));
  assert.equal(folders.length,1);const path=join(h.directory,folders[0],'candidate.json'),candidate=JSON.parse(await readFile(path));
  candidate.geometry.positions[0]-=.1;sealIdealized(candidate);const bytes=JSON.stringify(candidate);await writeFile(path,bytes);
  await writeFile(join(h.directory,folders[0],'manifest.json'),JSON.stringify({version:1,revision:candidate.revision,candidate_sha256:sha(bytes)}));
  const response=await h.api(`/jobs/${h.id}/idealization`);assert.equal(response.status,400);assert.equal((await response.json()).candidate,undefined);
  assert.equal(JSON.parse(await readFile(h.path)).idealization.loaded_revision,initial.revision);
});
