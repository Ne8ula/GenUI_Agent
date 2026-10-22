import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {loadBenchmark,loadIdealizationSource,benchmarkResource,benchmarkProfile,validateCompletion,validateMaterial,geometryHash} from './benchmark.mjs';
import {makeSyntheticAnalysis} from './test-fixtures.mjs';
import {createBroker,terminateProcessTree} from './broker.mjs';
import {makeIdealizedFixture,expectedIdealizedBinding} from './idealized-fixtures.mjs';
import {runIdealization} from './idealized-adapter.mjs';
import {idealizedDigest,sealIdealized} from './idealized-result.mjs';
async function fixture(t) {
  const folder=await mkdtemp(join(tmpdir(),'eva-benchmark-'));
  t.after(()=>rm(folder,{recursive:true,force:true}));
  const request={version:1,operation:'analyze',job_id:'benchmark-test',images:Array.from({length:7},(_,i)=>{
    const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20,i)]);
    return {id:`photo-${i}`,sha256:createHash('sha256').update(bytes).digest('hex'),data_base64:bytes.toString('base64')};
  })};
  const result=makeSyntheticAnalysis(request);
  const save=()=>Promise.all([writeFile(join(folder,'analyze-request.json'),JSON.stringify(request)),
    writeFile(join(folder,'analysis-result.json'),JSON.stringify(result))]);
  await save();return {folder,request,result,save};
}
test('fixed benchmark exposes validated geometry without embedding original image bytes',async t=>{
  const {folder}=await fixture(t),bundle=await loadBenchmark(folder);
  assert.equal(bundle.photos.length,7);
  assert.equal(bundle.payload.boundary_status,'unconfirmed');
  assert.equal(bundle.payload.shado_status,'not-run');
  assert.ok(!JSON.stringify(bundle.payload).includes('data_base64'));
  assert.match(bundle.payload.photos[0].url,/originals\/0$/);
});
test('benchmark rejects swapped source bytes and mismatched result binding',async t=>{
  const {folder,request,result,save}=await fixture(t);
  request.images[0].data_base64=request.images[1].data_base64;await save();
  await assert.rejects(loadBenchmark(folder),/integrity/);
  result.analysis_geometry_sha256='0'.repeat(64);await save();
  await assert.rejects(loadBenchmark(folder),/binding/);
});
test('benchmark rejects incomplete output and unknown path selectors',async t=>{
  const {folder,result,save}=await fixture(t);
  result.model_execution='not-run';await save();
  await assert.rejects(loadBenchmark(folder));
  for(const path of ['/api/room-workflow/benchmark/arkitscenes/originals/7',
    '/api/room-workflow/benchmark/arkitscenes/../../sessions.json',
    '/api/room-workflow/benchmark/private',
    '/api/room-workflow/benchmark/arkitscenes/profiles/unknown',
    '/api/room-workflow/benchmark/arkitscenes/profiles/../../pilot-v1',
    '/api/room-workflow/benchmark/arkitscenes/profiles/vga-visual-v1/originals/7',
    '/api/room-workflow/benchmark/arkitscenes/profiles/%2e%2e'])assert.equal(await benchmarkResource(path),null);
});

test('closed profiles preserve original default and isolate source image URLs',async t=>{
  const {folder}=await fixture(t);
  const original=await loadBenchmark(folder),vga=await loadBenchmark(folder,undefined,'vga-visual-v1');
  assert.equal(original.payload.profile.id,'original');
  assert.equal(original.payload.profile.initial_source_view,0);
  assert.equal(vga.payload.profile.label,'Broader room views');
  assert.equal(vga.payload.profile.initial_source_view,1);
  assert.deepEqual(vga.payload.profile.outside_source_indices,[0]);
  assert.notEqual(original.payload.photos[0].url,vga.payload.photos[0].url);
  assert.match(vga.payload.photos[0].url,/profiles\/vga-visual-v1\/originals\/0$/);
  assert.doesNotMatch(vga.payload.profile.source_note,/withheld/);
  assert.doesNotMatch(vga.payload.profile.dense_note,/second.*export/);
  for(const id of ['__proto__','../pilot-v1','unknown','constructor'])
    await assert.rejects(loadBenchmark(folder,undefined,id),/Unknown benchmark profile/);
  const copy=benchmarkProfile('vga-visual-v1');copy.outside_source_indices.push(6);
  assert.deepEqual(benchmarkProfile('vga-visual-v1').outside_source_indices,[0]);
});
test('completion validates topology, provenance and exact geometry fingerprint',async t=>{
  const {result}=await fixture(t),g=result.arms.A.geometry,h=geometryHash(g);
  assert.equal(validateCompletion(g,h),g);
  for(const mutate of [v=>v.positions[0]=NaN,v=>v.indices[0]=1000,
    v=>v.provenance[0]='observed',v=>v.colors[0]=.9,v=>v.units='meters']) {
    const bad=structuredClone(g);mutate(bad);assert.throws(()=>validateCompletion(bad,h));
  }
});

function materialFixture() {
  const base={positions:[0,0,0,1,0,0,0,1,0, 0,0,1,1,0,1,0,1,1, 0,0,2,1,0,2,0,1,2],
    indices:[0,1,2,3,4,5,6,7,8],colors:Array(27).fill(.4),normals:Array(27).fill(0),
    provenance:['photo-estimated','authored-room-shell','authored-room-shell'],source_view_indices:[0,-1,-1],units:'relative'};
  const material=structuredClone(base);material.colors.fill(.6,9,18);
  const baseReport={candidate_geometry_sha256:geometryHash(base),source_analysis_binding:{source:'original'},input_result_sha256:'a',input_request_sha256:'b'};
  const policy={minimum_faces:40};
  const frozen={source_candidate_sha256:geometryHash(base),source_report_sha256:'report-hash',policy};
  const report={...baseReport,candidate_geometry_sha256:geometryHash(material),material_policy:policy,
    status:'provisional-material-appearance-candidate',appearance_only:true,boundary_confirmed:false,duplicated_vertices:0,
    physical_triangles_unchanged:true,photo_face_colors_unchanged:true,all_camera_depth_renders_identical:true,
    source_candidate_geometry_sha256:geometryHash(base),
    material_planes:[
      {status:'inferred',face_indices:[1],fallback_rgb:[.4,.4,.4],inferred_rgb:[.6,.6,.6],
        support_before_color_filter:{passed:true},support_after_color_filter:{passed:true}},
      {status:'unknown-fallback',face_indices:[2],fallback_rgb:[.4,.4,.4]},
    ]};
  return {base,material,report,frozen,baseReport};
}
test('material variant allows only bound authored colors with exact photo and fallback preservation',()=>{
  const f=materialFixture(),run=()=>validateMaterial(f.base,f.material,f.report,f.frozen,f.baseReport,'report-hash');
  assert.equal(run(),f.material);
  f.material.colors[9]=.7;
  assert.throws(run,/validation/,'Exact material geometry hash must bind colors');
  for(const mutate of [
    f=>f.material.positions[0]=.01,
    f=>f.material.indices[0]=1,
    f=>f.material.normals[0]=1,
    f=>f.material.provenance[0]='authored-room-shell',
    f=>f.material.source_view_indices[0]=-1,
    f=>f.material.colors[0]=.9,
    f=>f.material.colors[18]=.9,
    f=>f.report.material_planes[0].fallback_rgb[0]=.3,
    f=>f.report.material_planes[0].face_indices=[0],
    f=>f.report.material_planes.pop(),
    f=>f.report.source_analysis_binding={source:'other'},
    f=>f.frozen.source_report_sha256='swapped-report',
    f=>f.frozen.policy={minimum_faces:0},
  ]) {
    const changed=materialFixture();mutate(changed);
    changed.report.candidate_geometry_sha256=geometryHash(changed.material);
    assert.throws(()=>validateMaterial(changed.base,changed.material,changed.report,changed.frozen,changed.baseReport,'report-hash'));
  }
});
test('completion source mismatch fails closed while preserving the validated raw result',async t=>{
  const {folder,result}=await fixture(t),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const g=result.arms.A.geometry,report={boundary_confirmed:false,units:'relative',
    source_analysis_binding:result.analysis_binding,input_result_sha256:hash(await readFile(join(folder,'analysis-result.json'))),
    input_request_sha256:hash(await readFile(join(folder,'analyze-request.json'))),
    original_to_candidate_rotation:[[1,0,0],[0,1,0],[0,0,1]],candidate_geometry_sha256:geometryHash(g),fused_geometry_sha256:geometryHash(g)};
  await Promise.all(['candidate.json','fused-bounded.json'].map(name=>writeFile(join(folder,name),JSON.stringify(g))));
  await writeFile(join(folder,'report.json'),JSON.stringify(report));
  assert.equal((await loadBenchmark(folder,folder)).payload.completion.variants.length,2);
  await mkdir(join(folder,'material-v1'));
  await writeFile(join(folder,'material-v1','report.json'),'{}');
  await writeFile(join(folder,'material-v1','frozen-policy.json'),'{}');
  const rejectedMaterial=(await loadBenchmark(folder,folder,'vga-visual-v1')).payload;
  assert.equal(rejectedMaterial.completion.variants.length,2);
  assert.match(rejectedMaterial.material_error,/reviewed revision/);
  assert.equal((await loadBenchmark(folder,folder)).payload.material_error,undefined,'Original profile never reads material artifacts');
  report.input_result_sha256='0'.repeat(64);await writeFile(join(folder,'report.json'),JSON.stringify(report));
  const payload=(await loadBenchmark(folder,folder)).payload;
  assert.equal(payload.completion,undefined);assert.match(payload.completion_error,/frozen source/);
  assert.equal(payload.result.status,'complete');
});
async function worldmirrorFixture(t) {
  const f=await fixture(t),completion=join(f.folder,'worldmirror'),frozenPath=join(f.folder,'frozen.json');
  await mkdir(completion);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const frozen={version:1,status:'provisional-completion-candidate',boundary_confirmed:false,units:'relative',
    source_analysis_binding:f.result.analysis_binding,input_result_sha256:hash(await readFile(join(f.folder,'analysis-result.json'))),
    input_request_sha256:hash(await readFile(join(f.folder,'analyze-request.json'))),
    boundary:f.result.boundary_proposal.value,voxel_relative:.009,numerical_ml_fields:{confidence_excluded_lower_percentile:0},
    original_to_candidate_rotation:[[0,-1,0],[1,0,0],[0,0,1]]};
  await writeFile(frozenPath,JSON.stringify(frozen));
  const raw=structuredClone(f.result.arms.A.geometry);raw.positions=raw.positions.map((v,i)=>i%3===0?v+.25:v);
  raw.coordinate_frame='analysis';
  const cameras=structuredClone(f.result.arms.A.cameras);
  for(const c of cameras){c.center[0]+=.25;c.world_to_camera[0][3]-=.25;}
  const fields=Buffer.from('opaque synthetic archive; numerical decoding belongs to Python');
  const manifest={version:1,kind:'eva-worldmirror-raw-v1',job_id:f.request.job_id,units:'unverified-scale',candidate_promoted:false,
    source_revision:'df9988efb87bfc0f4947eb3889411cf957478b06',checkpoint_revision:'d78a16c91c7a56488894a1c8de4f5c7cc28aa8b0',
    original_input_hashes:f.request.images.map(({id,sha256})=>({id,sha256})),inference_seconds:2.5,
    original_inputs_sha256:'0'.repeat(64),normalization:[],preprocessing:[],target_size:518,
    camera_convention:'OpenCV camera-to-world; depth is camera Z; pts3d is world-space',field_shapes:{},implementation_sha256:{},
    limitations:['Synthetic test; no neural inference.'],fields_file:'raw-fields.npz',fields_sha256:hash(fields)};
  const manifestBytes=JSON.stringify(manifest);
  const report={...frozen,openings:[],raw_geometry_sha256:geometryHash(raw),cameras,
    fused_geometry_sha256:geometryHash(raw),candidate_geometry_sha256:geometryHash(raw),
    worldmirror:{source_revision:manifest.source_revision,checkpoint_revision:manifest.checkpoint_revision,
      manifest_sha256:hash(manifestBytes),fields_sha256:hash(fields)},frozen_report_sha256:hash(JSON.stringify(frozen)),
    confidence_excluded_lower_percentile:0,registration:{scale:1,rms_relative_to_extent:.01,
      rotation:[[0,1,0],[-1,0,0],[0,0,1]],translation:[0,0,0]},limitations:['Synthetic test, not model execution.']};
  delete report.numerical_ml_fields;
  const save=async()=>{
    await writeFile(join(completion,'report.json'),JSON.stringify(report));
    await writeFile(join(completion,'raw.json'),JSON.stringify(raw));
    for(const name of ['fused-bounded.json','candidate.json'])await writeFile(join(completion,name),JSON.stringify({...raw,coordinate_frame:'candidate'}));
  };
  await writeFile(join(completion,'manifest.json'),manifestBytes);
  await writeFile(join(completion,'raw-fields.npz'),fields);await save();
  const suggestionsPath=join(f.folder,'suggestions.json');
  const suggestions={views:makeIdealizedFixture().bindings.observations.map(o=>({image_id:o.image_id,
    detections:[{id:o.id,mask:{sha256:o.mask_sha256}}]}))};
  await writeFile(suggestionsPath,JSON.stringify(suggestions));
  return {...f,completion,frozenPath,suggestionsPath,raw,cameras,report,save,
    load:()=>loadBenchmark(f.folder,completion,'worldmirror-v1',frozenPath)};
}
test('source fingerprint includes exact suggestion bytes and observation references',async t=>{
  const f=await worldmirrorFixture(t),load=()=>loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath);
  const source=await load();
  await writeFile(f.suggestionsPath,(await readFile(f.suggestionsPath,'utf8'))+'\n');
  const changed=await load();assert.notEqual(changed.source_sha256,source.source_sha256);
  assert.notEqual(changed.suggestions_sha256,source.suggestions_sha256);
  assert.deepEqual(source.observations,makeIdealizedFixture().bindings.observations);
  assert.deepEqual(changed.observations,source.observations);
});

test('idealization import snapshots original analysis and separately bound WorldMirror evidence',async t=>{
  const f=await worldmirrorFixture(t);
  const before=await readFile(join(f.folder,'analysis-result.json'));
  const source=await loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath);
  assert.equal(source.source,'retained-seven-photo-room');
  assert.match(source.source_sha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(source.request,f.request);
  assert.deepEqual(source.analysis,f.result);
  assert.deepEqual(source.worldmirror_report,f.report);
  assert.notDeepEqual(source.analysis.arms.A.geometry,f.raw);
  assert.equal(source.ready,undefined);
  assert.deepEqual(await readFile(join(f.folder,'analysis-result.json')),before);
  assert.equal((await loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath)).source_sha256,source.source_sha256);
  f.report.limitations.push('Additional synthetic limitation');await f.save();
  assert.notEqual((await loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath)).source_sha256,source.source_sha256);
  await writeFile(join(f.completion,'raw-fields.npz'),'changed source');
  await assert.rejects(loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath),/WorldMirror/);
});

async function reviewedIdealizationFixture(t){
  const f=await worldmirrorFixture(t),source=await loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath),fixture=makeIdealizedFixture();
  fixture.frame.id='worldmirror-candidate';fixture.bindings.frame_sha256=idealizedDigest(fixture.frame);
  const bindings={...fixture.bindings,originals:source.request.images.map(({id,sha256})=>({id,sha256})),
    analysis_binding:source.analysis.analysis_binding,estimator_artifact_sha256:source.worldmirror_report.worldmirror.manifest_sha256,
    registration_sha256:idealizedDigest(source.worldmirror_report.registration)};
  const envelope={job_id:randomUUID(),candidate_id:fixture.candidate_id,bindings,frame:fixture.frame,boundary:fixture.boundary,
    openings:[],inventory:fixture.inventory,parent_revision:null,shell_color_srgb:[.5,.5,.5]};
  const directory=join(f.folder,'idealized'),options={idealizationDirectory:directory,
    idealizationSourceLoader:()=>loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath),
    python:resolve('.local/reconstruction/venv/Scripts/python.exe'),terminate:terminateProcessTree};
  const candidate=await runIdealization(envelope,{...options,outputDirectory:directory,
    inputSha256:createHash('sha256').update(JSON.stringify(envelope)).digest('hex')});
  const record={version:1,expected:expectedIdealizedBinding(candidate),fit_diagnostics:[],review:{action:'review',
    expected_revision:candidate.revision,candidate_revision:candidate.revision,source_sha256:source.source_sha256,
    boundary_sha256:idealizedDigest({boundary:candidate.boundary,openings:candidate.openings}),inventory_sha256:idealizedDigest(candidate.inventory),
    decisions:{boundary:true,inventory:true,review_reasons:['table-1:dimensions-unconfirmed']},owner:randomUUID(),at:Date.now()}};
  const reviewPath=join(directory,'review.json');await writeFile(reviewPath,JSON.stringify(record));
  return {...f,candidate,record,reviewPath,directory,options,
    loadSidecar:()=>loadBenchmark(f.folder,f.completion,'worldmirror-v1',f.frozenPath,options)};
}

test('reviewed idealization sidecar preserves raw model arms and original photos',async t=>{
  const f=await reviewedIdealizationFixture(t),baseline=await f.load(),bundle=await f.loadSidecar();
  assert.equal(bundle.payload.idealization?.mode,'idealized');
  assert.deepEqual(bundle.payload.idealization,f.candidate);
  assert.deepEqual(bundle.photos,baseline.photos);assert.deepEqual(bundle.payload.photos,baseline.payload.photos);
  assert.deepEqual(bundle.payload.result,baseline.payload.result);
  assert.equal(bundle.payload.idealizationError,undefined);
  assert.ok(!JSON.stringify(bundle.payload).includes(f.record.review.owner));
  const original=await loadBenchmark(f.folder,undefined,'original',f.frozenPath,f.options);
  assert.deepEqual(original.payload.idealization,f.candidate);
  const broader=await loadBenchmark(f.folder,undefined,'vga-visual-v1',f.frozenPath,f.options);
  assert.equal(broader.payload.idealization,undefined);
});

test('missing or changed sidecar review leaves evidence available and never grants readiness',async t=>{
  const f=await reviewedIdealizationFixture(t);
  for(const change of [r=>r.review.boundary_sha256='0'.repeat(64),r=>r.review.source_sha256='0'.repeat(64),
    r=>r.review.candidate_revision='0'.repeat(64),r=>r.expected.boundary.ceiling=4,
    r=>r.expected.bindings.estimator_id='VGGT',r=>r.review.ready=true,r=>r.review.decisions.review_reasons=[],
    r=>r.fit_diagnostics=[{code:'silhouette-disagreement',object_ids:['table-1'],view_ids:['photo-0'],residual:1,reason:'Required synthetic review'}]]){
    const changed=structuredClone(f.record);change(changed);await writeFile(f.reviewPath,JSON.stringify(changed));
    const {payload}=await f.loadSidecar();assert.equal(payload.idealization,undefined);assert.ok(payload.idealizationError);
    assert.deepEqual(payload.result.arms.A.geometry,f.raw);
  }
  await writeFile(f.reviewPath,JSON.stringify(f.record));assert.ok((await f.loadSidecar()).payload.idealization);
  await rm(f.reviewPath);const missing=await f.loadSidecar();assert.equal(missing.payload.idealization,undefined);
  assert.deepEqual(missing.payload.result.arms.A.geometry,f.raw);
});

test('sidecar mutation alone is revalidated through regenerated Python geometry',async t=>{
  const f=await reviewedIdealizationFixture(t);assert.ok((await f.loadSidecar()).payload.idealization);
  const candidate=structuredClone(f.candidate);candidate.geometry.positions[0]-=.1;sealIdealized(candidate);
  const bytes=JSON.stringify(candidate);await writeFile(join(f.directory,'candidate.json'),bytes);
  await writeFile(join(f.directory,'manifest.json'),JSON.stringify({version:1,revision:candidate.revision,
    candidate_sha256:createHash('sha256').update(bytes).digest('hex')}));
  const record=structuredClone(f.record);record.review.candidate_revision=candidate.revision;record.review.expected_revision=candidate.revision;
  await writeFile(f.reviewPath,JSON.stringify(record));
  const {payload}=await f.loadSidecar();assert.equal(payload.idealization,undefined);assert.ok(payload.idealizationError);
  assert.deepEqual(payload.result.arms.A.geometry,f.raw);
});

for(const changed of ['observations','frame'])test(`sidecar rejects resealed ${changed} unrelated to the frozen source`,async t=>{
  const f=await reviewedIdealizationFixture(t),candidate=structuredClone(f.candidate);
  if(changed==='observations')candidate.bindings.observations[0].mask_sha256='0'.repeat(64);
  else{
    candidate.frame.source_to_candidate[0][3]=1;candidate.frame.candidate_to_source[0][3]=-1;
    candidate.bindings.frame_sha256=idealizedDigest(candidate.frame);
  }
  sealIdealized(candidate);const bytes=JSON.stringify(candidate);
  await writeFile(join(f.directory,'candidate.json'),bytes);
  await writeFile(join(f.directory,'manifest.json'),JSON.stringify({version:1,revision:candidate.revision,
    candidate_sha256:createHash('sha256').update(bytes).digest('hex')}));
  const record=structuredClone(f.record);record.expected=expectedIdealizedBinding(candidate);
  record.review.candidate_revision=candidate.revision;record.review.expected_revision=candidate.revision;
  await writeFile(f.reviewPath,JSON.stringify(record));
  const {payload}=await f.loadSidecar();assert.equal(payload.idealization,undefined);assert.ok(payload.idealizationError);
});

test('sidecar review and source races reject while concurrent inspection stays bounded',async t=>{
  const f=await reviewedIdealizationFixture(t),source=await f.options.idealizationSourceLoader();
  const load=options=>loadBenchmark(f.folder,f.completion,'worldmirror-v1',f.frozenPath,{...f.options,...options});
  for(const target of ['source','review']){
    let reads=0;
    const bundle=await load({idealizationSourceLoader:async()=>{
      if(++reads===2&&target==='source')return {...source,source_sha256:'0'.repeat(64)};
      if(reads===1&&target==='review')await writeFile(f.reviewPath,JSON.stringify({...f.record,review:{...f.record.review,at:1}}));
      return source;
    }});
    assert.equal(bundle.payload.idealization,undefined);assert.ok(bundle.payload.idealizationError);
    assert.deepEqual(bundle.payload.result.arms.A.geometry,f.raw);
    await writeFile(f.reviewPath,JSON.stringify(f.record));
  }
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{release=resolve;});
  const first=load({idealizationSourceLoader:async()=>{entered();await hold;return source;}});
  await started;
  try{const second=await load({});assert.equal(second.payload.idealization,undefined);assert.match(second.payload.idealizationError,/busy/);}
  finally{release();}
  assert.deepEqual((await first).payload.idealization,f.candidate);
});

test('sidecar directory links are rejected without exposing their target',async t=>{
  const f=await reviewedIdealizationFixture(t),link=join(f.folder,'linked-idealization');
  await symlink(f.directory,link,process.platform==='win32'?'junction':'dir');
  const {payload}=await loadBenchmark(f.folder,f.completion,'worldmirror-v1',f.frozenPath,
    {...f.options,idealizationDirectory:link});
  assert.equal(payload.idealization,undefined);assert.ok(payload.idealizationError);
  assert.ok(!payload.idealizationError.includes(f.directory));
  assert.deepEqual(payload.result.arms.A.geometry,f.raw);
  assert.deepEqual(JSON.parse(await readFile(f.reviewPath)),f.record);
});

test('uncertain sidecar verifier termination blocks further process launches',async t=>{
  const f=await reviewedIdealizationFixture(t);
  const isolated=await import('./benchmark.mjs?uncertain-sidecar-test');
  let launches=0;
  const options={...f.options,timeoutMs:1,terminate:async()=>{throw Error('Synthetic termination uncertainty');},
    launch:()=>{launches++;return Object.assign(new EventEmitter(),{stdout:new PassThrough()});}};
  const load=()=>isolated.loadBenchmark(f.folder,f.completion,'worldmirror-v1',f.frozenPath,options);
  assert.ok((await load()).payload.idealizationError);
  const second=await load();assert.equal(second.payload.idealization,undefined);
  assert.equal(launches,1,'An unconfirmed stop must not free the verifier slot');
  assert.deepEqual(second.payload.result.arms.A.geometry,f.raw);
});

test('private retained-source import is owner-bound, finite and grants no model actions',async t=>{
  const f=await worldmirrorFixture(t),directory=join(f.folder,'broker'),allowedHosts=new Set();
  const source=await loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath);
  const broker=await createBroker({directory,allowedHosts,
    idealizationSourceLoader:()=>loadIdealizationSource(f.folder,f.completion,f.frozenPath,f.suggestionsPath)});
  await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));
  const host=`127.0.0.1:${broker.server.address().port}`;allowedHosts.add(host);
  t.after(async()=>{broker.server.closeAllConnections();await new Promise(r=>broker.server.close(r));});
  const base=`http://${host}/api/room-workflow`;
  const session=await fetch(base+'/session'),cookie=session.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:'http://127.0.0.1:1440','Content-Type':'application/json','x-eva-csrf':(await session.json()).csrf};
  const post=(path,body)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
  const body={source:'retained-seven-photo-room',expected_source_sha256:source.source_sha256};
  for(const bad of [{...body,path:f.folder},{...body,authorized:true},{...body,source:'vga-visual-v1'},
    {...body,expected_source_sha256:'0'.repeat(64)}])assert.notEqual((await post('/jobs/import-idealization',bad)).status,201);
  assert.deepEqual(await (await fetch(base+'/jobs',{headers})).json(),[]);
  const response=await post('/jobs/import-idealization',body);
  assert.equal(response.status,201,await response.clone().text());
  const imported=await response.json();
  assert.deepEqual(Object.keys(imported).sort(),['job_id','revision']);
  assert.equal(imported.revision,null);
  const jobPath='/jobs/'+imported.job_id;
  const job=await (await fetch(base+jobPath,{headers})).json();
  assert.equal(job.status,'idealization-review');assert.equal(job.hasResult,false);
  assert.equal(job.idealizationStatus,'not-started');
  assert.equal(job.idealizationSource,undefined);assert.equal(job.idealization,undefined);
  const saved=JSON.parse(await readFile(join(directory,imported.job_id+'-idealization-source.json')));
  assert.deepEqual(saved,source);
  assert.deepEqual(await (await fetch(base+jobPath+'/result',{headers})).json(),{status:'not-run'});
  for(const action of ['analyze','compare','boundary','complete-local','authorize','grant','shado','shado-status','recover-cloud'])
    assert.equal((await post(jobPath+'/'+action,{})).status,409,action);
  const other=await fetch(base+'/session'),otherCookie=other.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+jobPath,{headers:{Cookie:otherCookie}})).status,400);
  const concurrent=await Promise.all(Array.from({length:6},()=>post('/jobs/import-idealization',body)));
  assert.equal(concurrent.filter(r=>r.status===201).length,4);
  assert.equal(concurrent.filter(r=>r.status===409).length,2);
  const all=await (await fetch(base+'/jobs',{headers})).json();
  assert.equal(all.length,5);
  assert.equal((await fetch(base+jobPath,{method:'DELETE',headers})).status,200);
  await assert.rejects(readFile(join(directory,imported.job_id+'-idealization-source.json')),error=>error.code==='ENOENT');
});

test('WorldMirror profile serves its own raw estimate and aligned cameras, never VGGT stand-ins',async t=>{
  const f=await worldmirrorFixture(t),{payload}=await f.load();
  assert.equal(payload.profile.id,'worldmirror-v1');
  assert.deepEqual(payload.result.arms.A.geometry,f.raw);
  assert.notDeepEqual(payload.result.arms.A.geometry,f.result.arms.A.geometry);
  assert.deepEqual(payload.result.arms.A.cameras,f.cameras);
  assert.equal(payload.result.estimator.model,'WorldMirror 2.0');
  assert.equal(payload.result.estimator.vggt_model,undefined);
  assert.equal(payload.result.elapsed_seconds,2.5);
  assert.deepEqual(payload.completion.cameras[0].position,[0,.25,0]);
  assert.equal(payload.completion.dense_fields,true);
  assert.equal(payload.completion.confidence_excluded_lower_percentile,0);
  assert.match(payload.photos[0].url,/worldmirror-v1\/originals\/0$/);
});
test('WorldMirror missing, tampered and mismatched candidates fail without leaking VGGT fallback',async t=>{
  const f=await worldmirrorFixture(t);
  for(const mutate of [r=>r.frozen_report_sha256='0'.repeat(64),r=>r.worldmirror.fields_sha256='0'.repeat(64),
    r=>r.worldmirror.source_revision='0'.repeat(40),r=>r.cameras.reverse(),r=>r.cameras[0].center[0]+=1,
    r=>r.registration.rms_relative_to_extent=.09,r=>r.boundary.floor-=.1,r=>r.voxel_relative=.01,
    r=>r.numerical_ml_fields={},r=>r.authorized=true]) {
    const original=structuredClone(f.report);mutate(f.report);await f.save();
    await assert.rejects(f.load,/WorldMirror/);
    for(const key of Object.keys(f.report))delete f.report[key];Object.assign(f.report,original);
  }
  await f.save();await writeFile(join(f.completion,'raw-fields.npz'),'tampered');
  await assert.rejects(f.load,/WorldMirror/);
  await rm(join(f.completion,'report.json'));
  await assert.rejects(f.load,/WorldMirror.*unavailable/);
  await assert.rejects(loadBenchmark(f.folder,undefined,'worldmirror-v1'),/WorldMirror.*unavailable/);
});

test('WorldMirror raw metadata cannot add authority even with updated byte hashes',async t=>{
  const f=await worldmirrorFixture(t),path=join(f.completion,'manifest.json');
  const manifest=JSON.parse(await readFile(path));manifest.approved=true;
  const bytes=JSON.stringify(manifest);await writeFile(path,bytes);
  f.report.worldmirror.manifest_sha256=createHash('sha256').update(bytes).digest('hex');await f.save();
  await assert.rejects(f.load,/WorldMirror/);
});

test('saved matched profiles serve the retained WorldMirror candidate through the fixed read-only route',async t=>{
  try {await access(new URL('../../.local/reconstruction/arkitscenes/42445021/worldmirror-candidate-v1/report.json',import.meta.url));}
  catch(error) {if(error.code==='ENOENT'){t.skip('Retained private WorldMirror candidate is unavailable.');return;}throw error;}
  const base='/api/room-workflow/benchmark/arkitscenes';
  const original=JSON.parse((await benchmarkResource(base)).body);
  const wm=JSON.parse((await benchmarkResource(base+'/profiles/worldmirror-v1')).body);
  assert.equal(wm.profile.id,'worldmirror-v1');
  assert.equal(wm.result.estimator.model,'WorldMirror 2.0');
  assert.equal(wm.result.estimator.vggt_model,undefined);
  assert.equal(wm.capture,'42445021');
  assert.equal(wm.photos.length,7);
  assert.deepEqual(wm.photos.map(({id,sha256})=>({id,sha256})),original.photos.map(({id,sha256})=>({id,sha256})));
  assert.notEqual(wm.result.analysis_geometry_sha256,original.result.analysis_geometry_sha256);
  assert.deepEqual(wm.completion.variants.map(v=>v.id),['fused','completed']);
  assert.equal(wm.completion.boundary_confirmed,false);
  assert.equal(wm.completion_error,undefined);
  for(const photo of wm.photos) {
    const resource=await benchmarkResource(photo.url);
    assert.equal(resource.type,'image/png');
    assert.equal(createHash('sha256').update(resource.body).digest('hex'),photo.sha256);
  }
});

test('broker benchmark requires a session and cannot trigger mutations',async t=>{
  const {folder}=await fixture(t),allowedHosts=new Set();
  const broker=await createBroker({directory:folder,allowedHosts});
  await new Promise(r=>broker.server.listen(0,'127.0.0.1',r));
  const host=`127.0.0.1:${broker.server.address().port}`;allowedHosts.add(host);
  t.after(async()=>{broker.server.closeAllConnections();await new Promise(r=>broker.server.close(r));});
  const base=`http://${host}/api/room-workflow`;
  assert.equal((await fetch(base+'/benchmark/arkitscenes')).status,401);
  const session=await fetch(base+'/session'),cookie=session.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/benchmark/arkitscenes',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:1440'}})).status,405);
  assert.equal((await fetch(base+'/benchmark/arkitscenes',{headers:{Cookie:cookie,Origin:'https://example.com'}})).status,403);
  assert.equal((await fetch(base+'/benchmark/unknown',{headers:{Cookie:cookie}})).status,404);
  assert.equal((await fetch(base+'/benchmark/arkitscenes/profiles/vga-visual-v1')).status,401);
  assert.equal((await fetch(base+'/benchmark/arkitscenes/profiles/vga-visual-v1',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:1440'}})).status,405);
  assert.equal((await fetch(base+'/benchmark/arkitscenes/profiles/worldmirror-v1')).status,401);
  assert.equal((await fetch(base+'/benchmark/arkitscenes/profiles/worldmirror-v1',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:1440'}})).status,405);
  assert.equal((await fetch(base+'/benchmark/arkitscenes/profiles/unknown',{headers:{Cookie:cookie}})).status,404);
});
