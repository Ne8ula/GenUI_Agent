/** Read-only, fixed-capture inspection. Never submits work or accepts filesystem paths from HTTP. */
import {readFile,stat,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {validateWorkerResult,validateArm,canonical,geometryHash} from './result.mjs';
import {readIdealizedCandidate} from './idealized-adapter.mjs';
import {idealizedDigest,idealizationReasons,validateFitDiagnostics,validateIdealizedSource} from './idealized-result.mjs';
export {geometryHash} from './result.mjs';
const privatePath=path=>fileURLToPath(new URL(`../../.local/reconstruction/arkitscenes/42445021/${path}/`,import.meta.url));
const profiles=Object.freeze({
  original:Object.freeze({directory:privatePath('pilot-v1'),completionDirectory:privatePath('completion-v2/confidence-0'),
    fieldsFilename:'analysis-fields-result.json',label:'Original photos',initial_source_view:0,outside_source_indices:[],
    source_note:'Guided iPad scan frames, selected as sparse photo inputs. Supplied depth, poses and meshes were excluded. The original split retains seven other views for evaluation.',
    dense_note:'Full predicted depth from a second VGGT export, matched to the original cameras and raw geometry. Low-confidence estimates are retained to preserve object details; these remain uncertain.'}),
  'worldmirror-v1':Object.freeze({directory:privatePath('pilot-v1'),completionDirectory:privatePath('worldmirror-candidate-v1'),
    label:'WorldMirror · matched photos',initial_source_view:0,outside_source_indices:[],
    source_note:'Same seven RGB originals as the VGGT pilot; no supplied depth or camera priors. Registration to VGGT is not independent accuracy evidence.',
    dense_note:'WorldMirror camera-Z depth fused with the frozen VGGT voxel, rotation and unconfirmed boundary. No confidence filtering or SAM 3D object completion.'}),
  'vga-visual-v1':Object.freeze({
    directory:privatePath('raw-rgb-selection-v1/visual-room-seven-v1/vga/request'),
    completionDirectory:privatePath('raw-rgb-selection-v1/visual-room-seven-v1/vga/completion-v1/room-only-v2'),
    material:Object.freeze({folder:'material-v1',
      reportSha256:'bc3f7b805e8d8ed606ef276adeff403dd6803b2fbe2956c6c959cba5c98ff51a',
      policySha256:'f1eda8890bfc5eec7496ed998d4215849d268338c16225c4cf29ffe6cb4d5541'}),
    fieldsFilename:'analysis-result.json',label:'Broader room views',initial_source_view:1,outside_source_indices:[0],
    source_note:'Exploratory selection from denser guided iPad RGB video, covering furniture and shared transitions. This is not a blind evaluation or evidence of better accuracy. Supplied depth, poses and meshes were excluded.',
    dense_note:'Full predicted depth from this saved VGGT run, fused and clipped to a provisional single-room boundary. Low-confidence estimates and assumed closures remain uncertain.'}),
});
export const idealizationSourcePaths=Object.freeze({
  result:join(profiles.original.directory,'analysis-result.json'),request:join(profiles.original.directory,'analyze-request.json'),
  'raw-directory':profiles['worldmirror-v1'].completionDirectory,'candidate-directory':profiles['worldmirror-v1'].completionDirectory,
  suggestions:fileURLToPath(new URL('../../.local/reconstruction/object-suggestions-v1/result.json',import.meta.url)),
});
export function benchmarkProfile(id='original') {
  if(typeof id!=='string'||!Object.hasOwn(profiles,id))throw Error('Unknown benchmark profile.');
  const {label,initial_source_view,outside_source_indices,source_note,dense_note}=profiles[id];
  return {id,label,initial_source_view,outside_source_indices:[...outside_source_indices],source_note,dense_note};
}
const resourceBase=id=>id==='original'?'/api/room-workflow/benchmark/arkitscenes':`/api/room-workflow/benchmark/arkitscenes/profiles/${id}`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateCompletion(g,expectedHash) {
  if(!g||!Array.isArray(g.positions)||g.positions.length<9||g.positions.length>600000||g.positions.length%3||
    g.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||
    !Array.isArray(g.colors)||g.colors.length!==g.positions.length||g.colors.some(v=>!Number.isFinite(v)||v<0||v>1)||
    !Array.isArray(g.indices)||!g.indices.length||g.indices.length>1200000||g.indices.length%3||
    g.indices.some(v=>!Number.isInteger(v)||v<0||v>=g.positions.length/3)||
    !Array.isArray(g.provenance)||g.provenance.length!==g.indices.length/3||
    g.provenance.some(v=>!['photo-estimated','authored-room-shell'].includes(v))||
    !g.provenance.includes('photo-estimated')||g.units!=='relative'||geometryHash(g)!==expectedHash)
    throw Error('Completion geometry failed validation.');
  return g;
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateMaterial(base,material,report,frozen,baseReport,baseReportSha) {
  validateCompletion(material,report.candidate_geometry_sha256);
  const baseHash=geometryHash(base);
  if(report.status!=='provisional-material-appearance-candidate'||report.appearance_only!==true||
    report.boundary_confirmed!==false||report.duplicated_vertices!==0||
    report.physical_triangles_unchanged!==true||report.photo_face_colors_unchanged!==true||
    report.all_camera_depth_renders_identical!==true||report.source_candidate_geometry_sha256!==baseHash||
    frozen.source_candidate_sha256!==baseHash||baseReport.candidate_geometry_sha256!==baseHash||
    frozen.source_report_sha256!==baseReportSha||!equal(frozen.policy,report.material_policy))
    throw Error('Material variant does not match its frozen base and policy.');
  for(const key of ['input_result_sha256','input_request_sha256','source_analysis_binding',
    'boundary','openings','original_to_candidate_rotation','numerical_ml_fields','source_inputs'])
    if(!equal(report[key],baseReport[key]))throw Error('Material source binding changed.');
  // This reviewed revision has no vertex duplication. Preserve all physical
  // coordinates, indices, normals, attribution and other base metadata exactly.
  for(const key of Object.keys(base))
    if(key!=='colors'&&!equal(base[key],material[key]))throw Error('Material variant changed physical geometry or provenance.');
  if(Object.keys(material).some(key=>!Object.hasOwn(base,key)&&key!=='appearance'))
    throw Error('Unexpected material geometry field.');
  if(!Array.isArray(report.material_planes)||report.material_planes.length>32)
    throw Error('Invalid material plane list.');
  const byFace=new Map(),rgb=value=>Array.isArray(value)&&value.length===3&&value.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
  for(const plane of report.material_planes) {
    if(!['inferred','unknown-fallback'].includes(plane.status)||!rgb(plane.fallback_rgb)||
      (plane.status==='inferred'&&(!rgb(plane.inferred_rgb)||plane.support_before_color_filter?.passed!==true||
        plane.support_after_color_filter?.passed!==true))||!Array.isArray(plane.face_indices)||!plane.face_indices.length)
      throw Error('Invalid inferred material or fallback.');
    for(const face of plane.face_indices) {
      if(!Number.isInteger(face)||face<0||face>=base.provenance.length||byFace.has(face)||base.provenance[face]!=='authored-room-shell')
        throw Error('Material plane targets an invalid or photo-derived face.');
      byFace.set(face,plane);
    }
  }
  for(let face=0;face<base.provenance.length;face++) {
    const plane=byFace.get(face);
    if(base.provenance[face]==='authored-room-shell'&&!plane)throw Error('Authored material plane is missing.');
    for(let corner=0;corner<3;corner++)for(let channel=0;channel<3;channel++) {
      const index=base.indices[face*3+corner]*3+channel;
      if(plane&&base.colors[index]!==plane.fallback_rgb[channel])throw Error('Plane fallback differs from original color.');
      const expected=plane?.status==='inferred'?plane.inferred_rgb[channel]:base.colors[index];
      if(material.colors[index]!==expected)throw Error('Material changed photo colors or unsupported fallback.');
    }
  }
  return material;
}
const readBytes=async(path,limit)=>{
  if((await stat(path)).size>limit)throw Error('Benchmark artifact exceeds its limit.');
  const bytes=await readFile(path);
  if(bytes.length>limit)throw Error('Benchmark artifact exceeds its limit.');
  return bytes;
};
const readJson=async(path,limit)=>JSON.parse((await readBytes(path,limit)).toString('utf8'));
async function worldmirrorResult(folder,completionFolder,frozenReportPath,baseline,request) {
  if(!completionFolder)throw Error('WorldMirror candidate unavailable; no VGGT fallback.');
  try {
    const [report,manifestBytes,fieldsBytes,frozenBytes,raw]=await Promise.all([
      readJson(join(completionFolder,'report.json'),1024**2),readBytes(join(completionFolder,'manifest.json'),128*1024),
      readBytes(join(completionFolder,'raw-fields.npz'),64*1024**2),readBytes(frozenReportPath,1024**2),
      readJson(join(completionFolder,'raw.json'),64*1024**2),
    ]);
    const manifest=JSON.parse(manifestBytes),frozen=JSON.parse(frozenBytes),binding=baseline.analysis_binding;
    const keys=['version','status','units','boundary_confirmed','boundary','openings','original_to_candidate_rotation',
      'input_result_sha256','input_request_sha256','source_analysis_binding','raw_geometry_sha256','fused_geometry_sha256',
      'candidate_geometry_sha256','cameras','worldmirror','frozen_report_sha256','voxel_relative',
      'confidence_excluded_lower_percentile','registration','source_inputs','raw_triangles','bounded_triangles',
      'discarded_outside_boundary_triangles','authored_shell_triangles','provenance','limitations'];
    if(!report||Object.keys(report).some(k=>!keys.includes(k))||report.version!==1||
      report.status!=='provisional-completion-candidate'||report.units!=='relative'||report.boundary_confirmed!==false||
      canonical(report.source_analysis_binding)!==canonical(binding)||report.frozen_report_sha256!==sha(frozenBytes)||
      report.input_result_sha256!==sha(await readBytes(join(folder,'analysis-result.json'),64*1024**2))||
      report.input_request_sha256!==sha(await readBytes(join(folder,'analyze-request.json'),58*1024**2)))
      throw Error('source report binding failed');
    for(const key of ['input_result_sha256','input_request_sha256','source_analysis_binding','boundary','original_to_candidate_rotation'])
      if(canonical(report[key])!==canonical(frozen[key]))throw Error('frozen comparison settings changed');
    if(frozen.version!==1||frozen.status!=='provisional-completion-candidate'||frozen.units!=='relative'||frozen.boundary_confirmed!==false||
      report.voxel_relative!==.009||frozen.voxel_relative!==.009||report.confidence_excluded_lower_percentile!==0||
      frozen.numerical_ml_fields?.confidence_excluded_lower_percentile!==0||
      canonical(report.openings)!==canonical(frozen.openings??[])||report.openings.length)
      throw Error('frozen comparison settings unsupported');
    const wm=report.worldmirror;
    const manifestKeys=['version','kind','job_id','units','candidate_promoted','source_revision','checkpoint_revision',
      'original_input_hashes','original_inputs_sha256','normalization','preprocessing','target_size','inference_seconds',
      'camera_convention','fields_file','fields_sha256','field_shapes','implementation_sha256','limitations'];
    // Numerical archive decoding and source-raster checks belong to the offline converter.
    if(!manifest||Object.keys(manifest).sort().join(',')!==manifestKeys.sort().join(','))throw Error('raw manifest fields rejected');
    if(!wm||Object.keys(wm).sort().join(',')!=='checkpoint_revision,fields_sha256,manifest_sha256,source_revision'||
      wm.source_revision!=='df9988efb87bfc0f4947eb3889411cf957478b06'||
      wm.checkpoint_revision!=='d78a16c91c7a56488894a1c8de4f5c7cc28aa8b0'||
      wm.manifest_sha256!==sha(manifestBytes)||wm.fields_sha256!==sha(fieldsBytes)||
      manifest.version!==1||manifest.kind!=='eva-worldmirror-raw-v1'||manifest.job_id!==request.job_id||
      manifest.units!=='unverified-scale'||manifest.candidate_promoted!==false||manifest.fields_file!=='raw-fields.npz'||
      manifest.source_revision!==wm.source_revision||manifest.checkpoint_revision!==wm.checkpoint_revision||
      manifest.fields_sha256!==wm.fields_sha256||
      canonical(manifest.original_input_hashes)!==canonical(request.images.map(({id,sha256})=>({id,sha256})))||
      !Number.isFinite(manifest.inference_seconds)||manifest.inference_seconds<0)
      throw Error('raw artifact identity or integrity failed');
    const registration=report.registration;
    if(!registration||!Number.isFinite(registration.scale)||registration.scale<=0||
      !Number.isFinite(registration.rms_relative_to_extent)||registration.rms_relative_to_extent<0||registration.rms_relative_to_extent>.08)
      throw Error('registration rejected');
    const arm={status:'complete',geometry:raw,cameras:report.cameras};
    validateArm(arm,'A',request.images,false);
    if(raw.coordinate_frame!=='analysis'||geometryHash(raw)!==report.raw_geometry_sha256||
      !Array.isArray(report.limitations)||report.limitations.length>32||report.limitations.some(v=>typeof v!=='string'||v.length>2000))
      throw Error('raw geometry frame, fingerprint or limitations failed');
    return {report,result:{units:'relative',elapsed_seconds:manifest.inference_seconds,
      analysis_geometry_sha256:report.raw_geometry_sha256,estimator:{model:'WorldMirror 2.0',source_revision:wm.source_revision,
        checkpoint_revision:wm.checkpoint_revision},arms:{A:arm},limitations:report.limitations}};
  } catch(error) {
    if(error.code==='ENOENT')throw Error('WorldMirror candidate unavailable; no VGGT fallback.');
    throw Error(`WorldMirror candidate rejected: ${error.message}`);
  }
}
async function loadSources(folder) {
  const [request,result]=await Promise.all([
    readJson(join(folder,'analyze-request.json'),58*1024**2),
    readJson(join(folder,'analysis-result.json'),64*1024**2),
  ]);
  validateWorkerResult(result,request);
  if(request.operation!=='analyze'||result.status!=='complete')throw Error('Benchmark analysis is incomplete.');
  const photos=request.images.map(image=>{
    const bytes=Buffer.from(image.data_base64??'','base64');
    if(bytes.length<16||bytes.length>10*1024**2||sha(bytes)!==image.sha256||
      !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
      throw Error('Benchmark source image failed integrity validation.');
    return {id:image.id,sha256:image.sha256,mime:'image/png',bytes};
  });
  return {request,result,photos};
}
export async function loadIdealizationSource(folder=profiles.original.directory,
  completionFolder=profiles['worldmirror-v1'].completionDirectory,
  frozenReportPath=join(profiles.original.completionDirectory,'report.json'),suggestionsPath=idealizationSourcePaths.suggestions) {
  const {request,result}=await loadSources(folder);
  const {report}=await worldmirrorResult(folder,completionFolder,frozenReportPath,result,request);
  const suggestionsBytes=await readBytes(suggestionsPath,16*1024**2),suggestions=JSON.parse(suggestionsBytes);
  const suggestions_sha256=sha(suggestionsBytes);
  const observations=suggestions.views.flatMap(view=>view.detections.map(d=>({id:d.id,image_id:view.image_id,mask_sha256:d.mask.sha256})));
  const source_sha256=sha(canonical({request:sha(canonical(request)),analysis:sha(canonical(result)),
    worldmirror_report:sha(canonical(report)),suggestions_sha256}));
  return {source:'retained-seven-photo-room',source_sha256,request,analysis:result,worldmirror_report:report,suggestions_sha256,observations};
}
let idealizationReading=false,idealizationCleanupPending=false;
async function benchmarkIdealization(photos,{idealizationDirectory,idealizationSourceLoader=loadIdealizationSource,...options}={}) {
  if(!idealizationDirectory)return {};
  if(idealizationCleanupPending)return {idealizationError:'Idealization verification requires operator process cleanup.'};
  if(idealizationReading)return {idealizationError:'Idealization verification is busy; retry inspection.'};
  idealizationReading=true;
  try {
    const directoryInfo=await lstat(idealizationDirectory);
    if(!directoryInfo.isDirectory()||directoryInfo.isSymbolicLink())throw Error('Invalid sidecar directory.');
    const path=join(idealizationDirectory,'review.json'),info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink())throw Error('Invalid sidecar review.');
    const before=await readBytes(path,16*1024**2),record=JSON.parse(before);
    if(!record||Object.keys(record).sort().join(',')!=='expected,fit_diagnostics,review,version'||record.version!==1||
      !Array.isArray(record.fit_diagnostics))throw Error('Invalid review record.');
    const {review,expected}=record,source=await idealizationSourceLoader();
    if(!review||Object.keys(review).sort().join(',')!=='action,at,boundary_sha256,candidate_revision,decisions,expected_revision,inventory_sha256,owner,source_sha256'||
      review.action!=='review'||typeof review.owner!=='string'||!/^[a-f0-9-]{36}$/.test(review.owner)||
      !Number.isSafeInteger(review.at)||review.at<=0||review.at>Date.now()||
      review.source_sha256!==source.source_sha256||review.expected_revision!==review.candidate_revision)
      throw Error('Invalid review authority or source.');
    const originals=source.request.images.map(({id,sha256})=>({id,sha256}));
    if(canonical(photos.map(({id,sha256})=>({id,sha256})))!==canonical(originals))
      throw Error('Sidecar source binding changed.');
    const candidate=await readIdealizedCandidate(idealizationDirectory,expected,options);
    validateIdealizedSource(candidate,source);
    validateFitDiagnostics(candidate,record);
    if(candidate.revision!==review.candidate_revision||
      review.boundary_sha256!==idealizedDigest({boundary:candidate.boundary,openings:candidate.openings})||
      review.inventory_sha256!==idealizedDigest(candidate.inventory)||
      canonical(review.decisions)!==canonical({boundary:true,inventory:true,review_reasons:idealizationReasons(candidate)}))
      throw Error('Review does not match the candidate.');
    if(!before.equals(await readBytes(path,16*1024**2))||
      (await idealizationSourceLoader()).source_sha256!==source.source_sha256)
      throw Error('Review or source changed during admission.');
    return {idealization:candidate};
  } catch(error) {
    if(error.code==='termination-unconfirmed')idealizationCleanupPending=true;
    return error.code==='ENOENT'?{}:{idealizationError:'Idealization unavailable: source, review or geometry admission failed.'};
  } finally {idealizationReading=false;}
}
export async function loadBenchmark(folder=profiles.original.directory,completionFolder,profileId='original',
  frozenReportPath=join(profiles.original.completionDirectory,'report.json'),idealizationOptions={}) {
  const profile=benchmarkProfile(profileId);
  const {request,result,photos}=await loadSources(folder);
  const worldmirror=profileId==='worldmirror-v1'?await worldmirrorResult(folder,completionFolder,frozenReportPath,result,request):null;
  const payload={dataset:'ARKitScenes',capture:'42445021',boundary_status:'unconfirmed',profile,
    shado_status:'not-run',result:worldmirror?.result??result,
    photos:photos.map(({id,sha256},index)=>({id,sha256,url:`${resourceBase(profileId)}/originals/${index}`}))};
  if(completionFolder) {
    try {
      const report=worldmirror?.report??await readJson(join(completionFolder,'report.json'),1024**2);
      if(report.boundary_confirmed!==false||report.units!=='relative'||
        Object.keys(result.analysis_binding).some(key=>report.source_analysis_binding?.[key]!==result.analysis_binding[key])||
        report.input_result_sha256!==sha(await readFile(join(folder,'analysis-result.json')))||
        report.input_request_sha256!==sha(await readFile(join(folder,'analyze-request.json'))))
        throw Error('Completion does not match the frozen source analysis.');
      if(report.numerical_ml_fields) {
        const fieldsPath=join(folder,profiles[profileId].fieldsFilename),fieldsBytes=await readFile(fieldsPath);
        if(fieldsBytes.length>64*1024**2||sha(fieldsBytes)!==report.numerical_ml_fields.result_sha256)
          throw Error('Dense prediction result failed integrity validation.');
        const dense=JSON.parse(fieldsBytes.toString('utf8'));
        validateWorkerResult(dense,request);
        if(dense.prediction_fields?.sha256!==report.numerical_ml_fields.fields_sha256||
          dense.analysis_geometry_sha256!==result.analysis_geometry_sha256||
          dense.model_config_sha256!==report.numerical_ml_fields.model_config_sha256||
          JSON.stringify(dense.arms.A.cameras)!==JSON.stringify(result.arms.A.cameras)||
          JSON.stringify(dense.preprocessing)!==JSON.stringify(result.preprocessing)||
          dense.estimator.vggt_checkpoint_revision!==result.estimator.vggt_checkpoint_revision)
          throw Error('Dense prediction does not match the original views and estimate.');
      }
      const rotation=report.original_to_candidate_rotation;
      if(!Array.isArray(rotation)||rotation.length!==3||rotation.some(row=>!Array.isArray(row)||row.length!==3||row.some(v=>!Number.isFinite(v))))
        throw Error('Invalid completion rotation.');
      const transform=v=>rotation.map(row=>row.reduce((sum,n,i)=>sum+n*v[i],0));
      const cameras=payload.result.arms.A.cameras.map(camera=>({position:transform(camera.center),
        forward:transform(camera.world_to_camera[2].slice(0,3)),up:transform(camera.world_to_camera[1].slice(0,3).map(v=>-v))}));
      const variants=await Promise.all([['fused','fused-bounded.json','fused_geometry_sha256'],['completed','candidate.json','candidate_geometry_sha256']].map(async([id,name,key])=>({
        id,geometry:validateCompletion(await readJson(join(completionFolder,name),64*1024**2),report[key]),sha256:report[key],
      })));
      payload.completion={variants,cameras,boundary_confirmed:false,dense_fields:!!worldmirror||!!report.numerical_ml_fields,
        confidence_excluded_lower_percentile:worldmirror?0:report.numerical_ml_fields?.confidence_excluded_lower_percentile??null};
      const materialConfig=profiles[profileId].material;
      if(materialConfig)try {
        const materialFolder=join(completionFolder,materialConfig.folder);
        const materialReportPath=join(materialFolder,'report.json'),policyPath=join(materialFolder,'frozen-policy.json');
        const materialReport=await readJson(materialReportPath,1024**2),frozen=await readJson(policyPath,65536);
        if(sha(await readFile(materialReportPath))!==materialConfig.reportSha256||
          sha(await readFile(policyPath))!==materialConfig.policySha256)
          throw Error('Material report or policy differs from the reviewed revision.');
        const material=validateMaterial(variants.find(v=>v.id==='completed').geometry,
          await readJson(join(materialFolder,'candidate.json'),64*1024**2),materialReport,frozen,report,
          sha(await readFile(join(completionFolder,'report.json'))));
        variants.push({id:'material',geometry:material,sha256:materialReport.candidate_geometry_sha256});
      } catch(e) {
        if(e.code!=='ENOENT')payload.material_error=e.message;
      }
    } catch(e) {
      if(e.code!=='ENOENT')payload.completion_error=e.message;
    }
  }
  if(profileId!=='vga-visual-v1')Object.assign(payload,await benchmarkIdealization(payload.photos,idealizationOptions));
  return {payload,photos};
}
const cache=new Map();
export async function benchmarkResource(pathname,idealizationOptions={}) {
  const match=pathname.match(/^\/api\/room-workflow\/benchmark\/arkitscenes(?:\/profiles\/(original|vga-visual-v1|worldmirror-v1))?(?:\/originals\/([0-6]))?$/);
  if(!match)return null;
  const id=match[1]??'original',{directory,completionDirectory,fieldsFilename}=profiles[id];
  // Revalidate after an artifact changes. The private folder is never publicly mounted.
  const stamps=await Promise.all(['analyze-request.json','analysis-result.json'].map(async name=>{
    const info=await stat(join(directory,name));return `${info.mtimeMs}:${info.size}`;
  }));
  if(fieldsFilename)try {const info=await stat(join(directory,fieldsFilename));stamps.push(`${info.mtimeMs}:${info.size}`);}
  catch {stamps.push('no-dense-fields');}
  if(id==='worldmirror-v1') {
    for(const path of [join(profiles.original.completionDirectory,'report.json'),
      ...['manifest.json','raw-fields.npz','raw.json'].map(name=>join(completionDirectory,name))]) {
      try {const info=await stat(path);stamps.push(`${info.mtimeMs}:${info.size}`);}
      catch {stamps.push('no-worldmirror-artifact');}
    }
  }
  for(const name of ['report.json','candidate.json','fused-bounded.json']) {
    try {const info=await stat(join(completionDirectory,name));stamps.push(`${info.mtimeMs}:${info.size}`);}
    catch {stamps.push('unavailable');}
  }
  if(profiles[id].material)for(const name of ['report.json','candidate.json','frozen-policy.json']) {
    try {const info=await stat(join(completionDirectory,profiles[id].material.folder,name));stamps.push(`${info.mtimeMs}:${info.size}`);}
    catch {stamps.push('no-material');}
  }
  const key=stamps.join('|');
  if(cache.get(id)?.key!==key)cache.set(id,{key,bundle:await loadBenchmark(directory,completionDirectory,id)});
  const {bundle}=cache.get(id);
  if(match[2]===undefined) {
    // Review/sidecar changes must not inherit the raw-evidence cache's lifetime.
    const sidecar=id==='vga-visual-v1'?{}:await benchmarkIdealization(bundle.payload.photos,
      {...idealizationOptions,idealizationDirectory:privatePath('idealized-room-v1')});
    return {type:'application/json',body:JSON.stringify({...bundle.payload,...sidecar})};
  }
  const photo=bundle.photos[Number(match[2])];
  if(!photo)return null;
  return {type:photo.mime,body:photo.bytes};
}
