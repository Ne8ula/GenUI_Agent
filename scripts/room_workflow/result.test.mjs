/** Synthetic contract fixtures; these tests never run or certify a model. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateWorkerResult } from './result.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`
  :value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`:JSON.stringify(value);
const clone=value=>structuredClone(value);
test('numerical sidecar binds exact views and bytes without granting authority',()=>{
  const {request,result}=analysis();
  const data=Buffer.from('opaque synthetic envelope; not a numerical model fixture');
  result.prediction_fields={format:'eva-vggt-fields-npz-v1',image_ids:request.images.map(r=>r.id),
    shape:[5,518,518],bytes:data.length,sha256:sha(data),data_base64:data.toString('base64'),meaning:'test envelope only'};
  assert.equal(validateWorkerResult(result,request),result);
  for(const mutation of [{sha256:'0'.repeat(64)},{image_ids:['wrong']},{shape:[5,8192,8192]},{bytes:1},{allow_boundary:true}]) {
    const bad=clone(result);Object.assign(bad.prediction_fields,mutation);
    assert.throws(()=>validateWorkerResult(bad,request));
  }
});
function geometry(category='photo-estimated') {
  return {positions:[0,0,1,1,0,1,0,1,1],colors:[.5,.5,.5,.5,.5,.5,.5,.5,.5],indices:[0,1,2],
    provenance:[category],normals:[0,0,1,0,0,1,0,0,1],source_view_indices:[0],units:'relative'};
}
function geometryHash(g) {
  const h=createHash('sha256');
  for(const key of ['positions','colors','indices']) {
    h.update(key);const bytes=Buffer.alloc(g[key].length*4);
    g[key].forEach((v,i)=>key==='indices'?bytes.writeUInt32LE(v,i*4):bytes.writeFloatLE(v,i*4));h.update(bytes);
  }return h.digest('hex');
}
function cameras(records) {
  return records.map(image=>({image_id:image.id,world_to_camera:[[1,0,0,0],[0,1,0,0],[0,0,1,0]],
    intrinsics:[[500,0,259],[0,500,259],[0,0,1]],center:[0,0,0],units:'relative',depth_kind:'OpenCV-z'}));
}
function analysis() {
  const request={version:1,job_id:'synthetic-contract',operation:'analyze',
    images:Array.from({length:5},(_,i)=>({id:`photo-${i}`,sha256:sha(String(i))}))};
  const binding={model_config_sha256:sha('synthetic-model-config'),original_inputs_sha256:sha(canonical({images:request.images,masks:{}})),
    analysis_geometry_sha256:geometryHash(geometry())};
  const result={version:1,job_id:request.job_id,status:'complete',model_execution:'executed',units:'relative',
    arms:{A:{status:'complete',geometry:geometry(),cameras:cameras(request.images)}},
    original_input_hashes:clone(request.images),...binding,analysis_binding:binding,
    boundary_proposal:{value:{polygon:[[0,0],[2,0],[2,2],[0,2]],floor:0,ceiling:3},
      requires_user_confirmation:true,origin:'synthetic fixture extent'}};
  return {request,result};
}
function reconstruction() {
  const {request,result}=analysis();
  request.operation='reconstruct';request.analysis_binding=clone(result.analysis_binding);
  request.boundary=clone(result.boundary_proposal.value);
  request.generated_images=[{id:'frame-1',sha256:sha('frame')}];
  result.arms.A.raw_geometry=clone(result.arms.A.geometry);
  result.arms.B={status:'complete',geometry:geometry('generated-influenced'),raw_geometry:geometry('generated-influenced'),
    cameras:cameras(request.images.concat(request.generated_images))};
  result.alignment={scale:1,rms_relative_to_extent:.01};
  delete result.boundary_proposal;
  return {request,result};
}
test('complete synthetic analysis needs real contract data and retains identity',()=>{
  const {request,result}=analysis();
  assert.equal(validateWorkerResult(result,request),result);
});
test('status strings alone cannot unlock boundary review',()=>{
  const {request}=analysis();
  assert.throws(()=>validateWorkerResult({version:1,job_id:request.job_id,status:'complete',model_execution:'executed',arms:{}},request));
});
test('mismatched job, unsupported version, unknown authority and fabricated success rejected',()=>{
  for(const mutation of [r=>r.job_id='another',r=>r.version=2,r=>r.status='success',
    r=>r.model_execution='not-run',r=>r.allow_network=true]) {
    const {request,result}=analysis();mutation(result);assert.throws(()=>validateWorkerResult(result,request));
  }
});
test('definitive failed and not-run outcomes are accepted without review authority',()=>{
  const {request}=analysis();
  for(const model_execution of ['executed','not-run']) {
    const result={version:1,job_id:request.job_id,status:'failed',model_execution,arms:{},
      error:{type:'RuntimeError',message:'Synthetic failure, no model ran in this test'}};
    assert.equal(validateWorkerResult(result,request),result);
  }
});
test('failure status cannot smuggle unvalidated geometry into inspection',()=>{
  const {request,result}=analysis();result.status='failed';result.error={type:'SyntheticError',message:'Failed'};
  result.arms.A.geometry.positions[0]=Infinity;
  assert.throws(()=>validateWorkerResult(result,request),/positions/);
  result.arms={};result.model_execution='not-run';
  assert.equal(validateWorkerResult(result,request),result);
  result.arms.A={status:'complete',geometry:geometry(),cameras:cameras(request.images)};
  assert.throws(()=>validateWorkerResult(result,request),/not-run result/);
});
test('nonfinite vertices, forged colors, bad topology and unknown provenance rejected',()=>{
  for(const mutation of [g=>g.positions[0]=Infinity,g=>g.colors[0]=-.1,g=>g.indices[2]=99,
    g=>g.indices[1]=.5,g=>g.provenance[0]='observed-truth',g=>g.provenance=[]]) {
    const {request,result}=analysis();mutation(result.arms.A.geometry);assert.throws(()=>validateWorkerResult(result,request));
  }
});
test('mesh hash binds review to returned geometry, including colors',()=>{
  for(const key of ['positions','colors']) {
    const {request,result}=analysis();result.arms.A.geometry[key][0]+=.01;
    assert.throws(()=>validateWorkerResult(result,request),/geometry fingerprint/);
  }
});
test('original hash order and binding cannot silently change',()=>{
  for(const mutation of [r=>r.original_input_hashes.reverse(),r=>r.analysis_binding.original_inputs_sha256=sha('other'),
    r=>r.analysis_binding.extra='authority']) {
    const {request,result}=analysis();mutation(result);assert.throws(()=>validateWorkerResult(result,request));
  }
});
test('boundary must require review and be a nondegenerate simple polygon',()=>{
  for(const mutation of [p=>p.requires_user_confirmation=false,p=>p.value.ceiling=0,
    p=>p.value.polygon=[[0,0],[2,2],[0,2],[2,0]],p=>p.value.holes=[]]) {
    const {request,result}=analysis();mutation(result.boundary_proposal);assert.throws(()=>validateWorkerResult(result,request));
  }
});
test('camera sources, rigid orientation and pixel conventions validated',()=>{
  for(const mutation of [c=>c.image_id='frame-unknown',c=>c.world_to_camera[0][0]=-1,
    c=>c.world_to_camera[0][0]=2,c=>c.intrinsics[0][0]=0,c=>c.center[0]=9,c=>c.depth_kind='ray-distance']) {
    const {request,result}=analysis();mutation(result.arms.A.cameras[0]);assert.throws(()=>validateWorkerResult(result,request));
  }
});
test('complete comparison requires valid A and generated-influenced B with alignment',()=>{
  const {request,result}=reconstruction();assert.equal(validateWorkerResult(result,request),result);
  result.arms.B.geometry.provenance[0]='photo-estimated';assert.throws(()=>validateWorkerResult(result,request),/attribution/);
});
test('reconstructed baseline must match the reviewed raw estimate',()=>{
  const {request,result}=reconstruction();result.arms.A.raw_geometry.positions[0]=.5;
  assert.throws(()=>validateWorkerResult(result,request),/baseline geometry changed/);
});
test('partial comparison retains valid A and explicit B failure',()=>{
  const {request,result}=reconstruction();result.status='partial';result.arms.B={status:'failed',reason:{type:'ValueError',message:'Synthetic B failure'}};
  assert.equal(validateWorkerResult(result,request),result);
  delete result.arms.B;assert.throws(()=>validateWorkerResult(result,request),/explicit failed B/);
});
test('analyze cannot report partial success or hide a B condition',()=>{
  for(const mutation of [r=>r.status='partial',r=>r.arms.B={status:'failed'}]) {
    const {request,result}=analysis();mutation(result);assert.throws(()=>validateWorkerResult(result,request));
  }
});
test('generated-video frames bind B cameras to actual video hash and timestamps',()=>{
  const {request,result}=reconstruction();
  delete request.generated_images;
  request.generated_video={id:'shado-video',sha256:sha('video')};
  result.generated_video={id:'shado-video',sha256:request.generated_video.sha256,duration_seconds:4,decoded_frame_count:120,
    frames:[{id:'frame-1',sha256:sha('frame'),frame_index:0,timestamp_seconds:0}]};
  assert.equal(validateWorkerResult(result,request),result);
  result.generated_video.sha256=sha('different-video');assert.throws(()=>validateWorkerResult(result,request),/video provenance/);
});
test('authored shell attribution cannot replace all estimated geometry',()=>{
  const {request,result}=reconstruction();
  result.arms.A.geometry.provenance[0]='authored-room-shell';
  result.arms.A.geometry.source_view_indices[0]=-1;
  assert.throws(()=>validateWorkerResult(result,request),/lacks estimated geometry/);
});
