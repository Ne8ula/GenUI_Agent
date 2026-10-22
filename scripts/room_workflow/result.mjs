/** Validate worker data before it can authorize boundary review or a later stage.
 * This checks contracts/integrity, not whether neural geometry is physically true.
 */
import { createHash } from 'node:crypto';

const SHA = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const categories = new Set(['photo-estimated','generated-influenced','authored-room-shell','authored-door-cap','authored-window-cap']);
const bindingKeys = ['analysis_geometry_sha256','model_config_sha256','original_inputs_sha256'];
const resultKeys = new Set(['version','job_id','status','model_execution','arms','sources','markers','masks',
  'preprocessing','estimator','model_config_sha256','original_input_hashes','original_inputs_sha256',
  'analysis_geometry_sha256','analysis_binding','boundary_proposal','units','alignment','determinism',
  'limitations','peak_cuda_bytes','elapsed_seconds','generated_video','error','prediction_fields']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw Error(`Invalid room worker result: ${message}`); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const hash = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : object(value) ? `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
function predictionFields(value, records) {
  exactKeys(value,['format','image_ids','shape','bytes','sha256','data_base64','meaning'],'numerical sidecar fields');
  if(value.format!=='eva-vggt-fields-npz-v1'||canonical(value.image_ids)!==canonical(records.map(r=>r.id))
    ||canonical(value.shape)!==canonical([records.length,518,518])
    ||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>24*1024**2
    ||typeof value.data_base64!=='string'||value.data_base64.length>33554432
    ||!SHA.test(value.sha256)||typeof value.meaning!=='string'||value.meaning.length>300)fail('numerical sidecar envelope');
  const data=Buffer.from(value.data_base64,'base64');
  if(data.length!==value.bytes||data.toString('base64')!==value.data_base64||hash(data)!==value.sha256)fail('numerical sidecar integrity');
  // Numerical archive decoding/shape checks happen in prediction_fields.py.
  // This opaque artifact grants no boundary/scale/execution authority.
}
function exactKeys(value, keys, label) {
  if (!object(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(label);
}
function finiteArray(value, length, max, label) {
  if (!Array.isArray(value) || value.length !== length || value.some(v=>!finite(v)||Math.abs(v)>max)) fail(label);
}
function matrix(value, rows, columns, max, label) {
  if (!Array.isArray(value) || value.length !== rows) fail(label);
  for (const row of value) finiteArray(row,columns,max,label);
}
export function geometryHash(geometry) {
  const digest=createHash('sha256');
  for (const key of ['positions','colors','indices']) {
    digest.update(key);
    const bytes=Buffer.allocUnsafe(geometry[key].length*4);
    geometry[key].forEach((value,index)=>key==='indices'?bytes.writeUInt32LE(value,index*4):bytes.writeFloatLE(value,index*4));
    digest.update(bytes);
  }
  return digest.digest('hex');
}
function geometry(value, arm, viewCount, raw) {
  if (!object(value)) fail(`${arm} geometry missing`);
  const {positions,colors,indices,provenance}=value;
  if (!Array.isArray(positions)||positions.length<9||positions.length>600000||positions.length%3
    ||positions.some(v=>!finite(v)||Math.abs(v)>10000)) fail(`${arm} positions`);
  finiteArray(colors,positions.length,1,`${arm} colors`);
  if (colors.some(v=>v<0)) fail(`${arm} colors`);
  if (!Array.isArray(indices)||indices.length<3||indices.length>1200000||indices.length%3
    ||indices.some(v=>!Number.isSafeInteger(v)||v<0||v>=positions.length/3)) fail(`${arm} indices`);
  if (!Array.isArray(provenance)||provenance.length!==indices.length/3
    ||provenance.some(v=>!categories.has(v))) fail(`${arm} provenance`);
  const expected=arm==='A'?'photo-estimated':'generated-influenced';
  if (provenance.some(v=>v!==expected&&(raw||!v.startsWith('authored-')))) fail(`${arm} source attribution`);
  if (!provenance.includes(expected)) fail(`${arm} lacks estimated geometry`);
  if (value.normals!==undefined) finiteArray(value.normals,positions.length,1.00001,`${arm} normals`);
  if (value.source_view_indices!==undefined) {
    if (!Array.isArray(value.source_view_indices)||value.source_view_indices.length!==provenance.length) fail(`${arm} source indices`);
    value.source_view_indices.forEach((view,index)=>{
      if (!Number.isSafeInteger(view)||(provenance[index].startsWith('authored-')?view!==-1:view<0||view>=viewCount))
        fail(`${arm} source index attribution`);
    });
  }
  if (value.units!==undefined&&value.units!=='relative') fail(`${arm} unsupported metric claim`);
  return value;
}
function cameras(value, records, arm) {
  if (!Array.isArray(value)||value.length!==records.length) fail(`${arm} camera count`);
  value.forEach((camera,index)=>{
    if (!object(camera)||camera.image_id!==records[index].id||camera.units!=='relative'||camera.depth_kind!=='OpenCV-z')
      fail(`${arm} camera source/convention`);
    matrix(camera.world_to_camera,3,4,1e6,`${arm} camera pose`);
    matrix(camera.intrinsics,3,3,1e6,`${arm} camera intrinsics`);
    finiteArray(camera.center,3,1e6,`${arm} camera center`);
    const r=camera.world_to_camera.map(row=>row.slice(0,3)), k=camera.intrinsics;
    if (!(k[0][0]>0&&k[1][1]>0)||Math.abs(k[2][0])+Math.abs(k[2][1])+Math.abs(k[2][2]-1)>1e-5)
      fail(`${arm} camera intrinsics`);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)
      if(Math.abs(r[i].reduce((sum,v,c)=>sum+v*r[j][c],0)-(i===j?1:0))>1e-3) fail(`${arm} nonrigid camera`);
    const determinant=r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])
      -r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]);
    if(Math.abs(determinant-1)>1e-3) fail(`${arm} reflected camera`);
    for(let i=0;i<3;i++)
      if(Math.abs(r[i].reduce((sum,v,c)=>sum+v*camera.center[c],0)+camera.world_to_camera[i][3])>1e-3*Math.max(1,...camera.center.map(Math.abs)))
        fail(`${arm} camera center/pose mismatch`);
  });
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function onSegment(p,a,b) {
  return Math.abs(cross(a,b,p))<=1e-9&&(p[0]-a[0])*(p[0]-b[0])+(p[1]-a[1])*(p[1]-b[1])<=1e-9;
}
function intersects(a,b,c,d) {
  const abC=cross(a,b,c),abD=cross(a,b,d),cdA=cross(c,d,a),cdB=cross(c,d,b);
  return (abC*abD<0&&cdA*cdB<0)||onSegment(c,a,b)||onSegment(d,a,b)||onSegment(a,c,d)||onSegment(b,c,d);
}
function boundary(value) {
  exactKeys(value,['polygon','floor','ceiling'],'boundary fields');
  if (!finite(value.floor)||!finite(value.ceiling)||value.ceiling-value.floor<=1e-5||value.ceiling-value.floor>10000)
    fail('boundary height');
  const p=value.polygon;
  if (!Array.isArray(p)||p.length<3||p.length>32) fail('boundary polygon');
  for(const vertex of p)finiteArray(vertex,2,100000,'boundary vertex');
  let twiceArea=0;
  for(let i=0;i<p.length;i++) {
    const a=p[i],b=p[(i+1)%p.length];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<=1e-9) fail('repeated boundary vertex');
    twiceArea+=a[0]*b[1]-a[1]*b[0];
    for(let j=i+1;j<p.length;j++)if(j!==i+1&&!(i===0&&j===p.length-1)
      &&intersects(a,b,p[j],p[(j+1)%p.length])) fail('self-intersecting boundary');
  }
  if(Math.abs(twiceArea)<=2e-9) fail('zero-area boundary');
}
export { boundary as validateResultBoundary };

function binding(value) {
  exactKeys(value,bindingKeys,'analysis binding fields');
  if(Object.values(value).some(v=>typeof v!=='string'||!SHA.test(v))) fail('analysis binding hashes');
}
function generatedRecords(result,request) {
  if(!request.generated_video)return request.generated_images??[];
  const video=result.generated_video;
  if(!object(video)||video.id!==request.generated_video.id||video.sha256!==request.generated_video.sha256
    ||!finite(video.duration_seconds)||video.duration_seconds<=0||video.duration_seconds>30.01
    ||!Number.isSafeInteger(video.decoded_frame_count)||video.decoded_frame_count<1||video.decoded_frame_count>1800
    ||!Array.isArray(video.frames)||video.frames.length<1||video.frames.length>12) fail('generated video provenance');
  let lastIndex=-1,lastTime=-1;
  const seen=new Set(request.images.map(image=>image.id));
  for(const frame of video.frames) {
    if(!object(frame)||typeof frame.id!=='string'||!ID.test(frame.id)||seen.has(frame.id)||!SHA.test(frame.sha256)
      ||!Number.isSafeInteger(frame.frame_index)||frame.frame_index<=lastIndex||frame.frame_index>=video.decoded_frame_count
      ||!finite(frame.timestamp_seconds)||frame.timestamp_seconds<0||frame.timestamp_seconds<=lastTime
      ||frame.timestamp_seconds>video.duration_seconds) fail('generated frame provenance');
    lastIndex=frame.frame_index;lastTime=frame.timestamp_seconds;seen.add(frame.id);
  }
  return video.frames;
}
export function validateArm(arm, name, records, reconstruction) {
  if(!object(arm)||arm.status!=='complete') fail(`${name} did not complete`);
  geometry(arm.geometry,name,records.length,!reconstruction);
  cameras(arm.cameras,records,name);
  if(reconstruction)geometry(arm.raw_geometry,name,records.length,true);
}

export function validateWorkerResult(result,request) {
  if(!object(request)||request.version!==1||typeof request.job_id!=='string'||!ID.test(request.job_id)
    ||!['analyze','reconstruct'].includes(request.operation)||!Array.isArray(request.images)
    ||request.images.length<5||request.images.length>7||request.images.some(image=>!object(image)
      ||typeof image.id!=='string'||!ID.test(image.id)||typeof image.sha256!=='string'||!SHA.test(image.sha256)))
    fail('invalid expected request');
  if(!object(result)||Object.keys(result).some(key=>!resultKeys.has(key))||result.version!==1||result.job_id!==request.job_id
    ||!['complete','partial','failed'].includes(result.status)||!['executed','not-run'].includes(result.model_execution)
    ||!object(result.arms)||Object.keys(result.arms).some(key=>!['A','B'].includes(key))) fail('identity/version/status');
  if(result.elapsed_seconds!==undefined&&(!finite(result.elapsed_seconds)||result.elapsed_seconds<0))fail('elapsed time');
  if(result.prediction_fields!==undefined) {
    if(request.operation!=='analyze'||result.model_execution!=='executed')fail('numerical sidecar execution');
    predictionFields(result.prediction_fields,request.images);
  }
  if(result.status==='failed') {
    if(!object(result.error)||typeof result.error.type!=='string'||result.error.type.length>128
      ||typeof result.error.message!=='string'||result.error.message.length>1000) fail('failure diagnostic');
    // Known failure is a terminal worker outcome, not an uncertain submission.
    // It cannot carry review authority, even if earlier stages left diagnostics.
    if(result.model_execution==='not-run'&&Object.keys(result.arms).length)fail('not-run result contains geometry');
    if(result.arms.B!==undefined)fail('failed result carries an undeclared B outcome');
    if(result.arms.A!==undefined)validateArm(result.arms.A,'A',request.images,false);
    return result;
  }
  if(result.model_execution!=='executed'||result.units!=='relative') fail('successful result requires executed relative geometry');
  binding(result.analysis_binding);
  for(const key of bindingKeys)if(result[key]!==result.analysis_binding[key])fail('binding/top-level mismatch');
  const originals=request.images.map(({id,sha256})=>({id,sha256}));
  if(canonical(result.original_input_hashes)!==canonical(originals))fail('original image hashes/order');
  const ids=new Set(originals.map(image=>image.id));
  const masks=Object.fromEntries(Object.entries(request.masks??{}).filter(([key])=>ids.has(key)).map(([key,value])=>[key,value.sha256]));
  if(result.original_inputs_sha256!==hash(canonical({images:originals,masks})))fail('original input fingerprint');
  if(request.operation==='analyze') {
    if(result.status!=='complete'||result.arms.B!==undefined)fail('analysis condition/status');
    validateArm(result.arms.A,'A',originals,false);
    if(geometryHash(result.arms.A.geometry)!==result.analysis_geometry_sha256)fail('analysis geometry fingerprint');
    const proposal=result.boundary_proposal;
    if(!object(proposal)||proposal.requires_user_confirmation!==true||typeof proposal.origin!=='string'||proposal.origin.length>500)
      fail('boundary review requirement');
    boundary(proposal.value);
  } else {
    binding(request.analysis_binding);
    if(canonical(result.analysis_binding)!==canonical(request.analysis_binding))fail('reviewed analysis changed');
    validateArm(result.arms.A,'A',originals,true);
    if(geometryHash(result.arms.A.raw_geometry)!==result.analysis_geometry_sha256)fail('repeated baseline geometry changed');
    if(result.status==='complete') {
      const generated=generatedRecords(result,request);
      if(!generated.length||generated.length>12)fail('required generated comparison missing');
      validateArm(result.arms.B,'B',originals.concat(generated),true);
      if(!object(result.alignment)||!finite(result.alignment.scale)||result.alignment.scale<=0
        ||!finite(result.alignment.rms_relative_to_extent)||result.alignment.rms_relative_to_extent<0
        ||result.alignment.rms_relative_to_extent>.08)fail('missing/invalid shared-photo alignment');
    } else if(!object(result.arms.B)||result.arms.B.status!=='failed'||!object(result.arms.B.reason)) {
      fail('partial comparison requires explicit failed B');
    }
  }
  return result;
}
