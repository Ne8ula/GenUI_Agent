/** Loopback development broker. Cloud computation is explicit and job-bound. */
import http from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, readdir, stat, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createShadoBridgeClient } from '../../integrations/shado/client-v2.mjs';
import { validateBoundary, validateOpenings } from './boundary.mjs';
import { validateWorkerResult, canonical, geometryHash } from './result.mjs';
import { ffsResource, createSceneNotebook } from './crime-scene.mjs';
import { createSceneInvestigator } from './eva-investigator.mjs';
import { createSceneReview } from './scene-review.mjs';
import { benchmarkResource, loadIdealizationSource } from './benchmark.mjs';
import { recoveryInputs, validateRecovery, runRecoveryClient, receiptCancelled } from './cloud-recovery.mjs';
import { validateImagePreflight, runImagePreflight } from './image-preflight.mjs';
import {runIdealization,readIdealizedCandidate,deriveIdealizedCorrection,prepareIdealizationInputs} from './idealized-adapter.mjs';
import {validateIdealizedResult,idealizedDigest,idealizationReasons,validateFitDiagnostics,validateIdealizedSource} from './idealized-result.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const idPattern = /^[a-f0-9-]{36}$/;
const equal=(a,b)=>canonical(a)===canonical(b);
export function validateLocalCompletion(artifact,envelope,inputHash) {
  const {analysis,request,review}=envelope;
  if(!artifact||artifact.version!==1||artifact.artifact_type!=='eva-room-local-completion-v1'||artifact.status!=='complete'||
    artifact.job_id!==request.job_id||artifact.units!=='relative'||!equal(artifact.source_analysis_binding,analysis.analysis_binding)||
    artifact.bindings?.adapter_request_sha256!==inputHash||
    artifact.bindings?.numerical_fields_sha256!==analysis.prediction_fields?.sha256||
    artifact.bindings?.numerical_fields_model_config_sha256!==analysis.model_config_sha256||
    !equal(artifact.boundary,review.boundary)||!equal(artifact.openings,review.openings)||
    !equal(artifact.cameras,analysis.arms.A.cameras)||artifact.diagnostics?.new_model_execution!==false)
    throw Error('Local completion is not bound to the reviewed source.');
  const {prediction_fields,boundary_proposal,...validation}=analysis;
  const fusedShape=geometry=>{
    const {source_view_indices,...shape}=geometry??{};
    // Local multi-view fusion has no unique face-to-view attribution. -1 means
    // unassigned here, not permission to relabel any source as observed.
    if(source_view_indices!==undefined&&(!Array.isArray(source_view_indices)||source_view_indices.length!==geometry.provenance?.length||
      source_view_indices.some((v,i)=>!Number.isInteger(v)||v< -1||v>=request.images.length||
        (geometry.provenance[i].startsWith('authored-')&&v!==-1))))throw Error('Invalid local fused-source attribution.');
    return shape;
  };
  const condition={status:'complete',geometry:fusedShape(artifact.geometry),raw_geometry:artifact.raw_geometry,cameras:artifact.cameras};
  validateWorkerResult({...validation,status:'partial',arms:{A:condition,B:{status:'failed',reason:{type:'ShadoPending'}}}},
    {...request,operation:'reconstruct',analysis_binding:analysis.analysis_binding,boundary:review.boundary,generated_images:[]});
  validateWorkerResult({...validation,status:'partial',arms:{A:{...condition,geometry:fusedShape(artifact.fused_geometry)},B:{status:'failed',reason:{type:'ShadoPending'}}}},
    {...request,operation:'reconstruct',analysis_binding:analysis.analysis_binding,boundary:review.boundary,generated_images:[]});
  if(geometryHash(artifact.geometry)!==artifact.candidate_geometry_sha256||
    geometryHash(artifact.fused_geometry)!==artifact.fused_geometry_sha256)throw Error('Local completion geometry fingerprint mismatch.');
  return artifact;
}
export async function terminateProcessTree(child,{platform=process.platform,launch=spawn,kill=process.kill}={}) {
  if(!Number.isSafeInteger(child.pid)||child.pid<1)throw Error('Invalid local worker process.');
  if(platform==='win32')await new Promise((accept,reject)=>{
    const terminator=launch('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});
    const timer=setTimeout(()=>{terminator.kill();reject(Error('Local worker termination was not confirmed.'));},10000);
    terminator.once('error',e=>{clearTimeout(timer);reject(e);});
    terminator.once('exit',code=>{clearTimeout(timer);code===0||child.exitCode!==null?accept():reject(Error('Local worker termination was not confirmed.'));});
  });
  else kill(-child.pid,'SIGKILL');
}
export function validateIntake(value) {
  if (!value || Object.keys(value).some(k => !['images','areaStatement','retention'].includes(k))) throw Error('Unexpected upload fields.');
  if (!Array.isArray(value.images) || value.images.length < 5 || value.images.length > 7) throw Error('Choose 5–7 photos of the same room.');
  if (typeof value.areaStatement !== 'string' || value.areaStatement.length > 500) throw Error('Keep the size description under 500 characters.');
  if (!['temporary','saved'].includes(value.retention)) throw Error('Choose a storage preference.');
  let total = 0;
  const seen = new Set();
  const images = value.images.map((image, index) => {
    if (!image || Object.keys(image).some(k => !['name','mime','data_base64'].includes(k)) ||
      typeof image.name !== 'string' || image.name.length > 180 || !['image/jpeg','image/png'].includes(image.mime) ||
      typeof image.data_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data_base64)) throw Error('Use JPEG or PNG photos.');
    const data = Buffer.from(image.data_base64, 'base64');
    if (data.toString('base64') !== image.data_base64 || data.length < 16 || data.length > 10 * 1024 ** 2) throw Error('Each photo must be under 10 MB.');
    if (image.mime === 'image/jpeg' ? data[0] !== 255 || data[1] !== 216 || data[2] !== 255
      : !data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('Photo contents do not match their format.');
    total += data.length;
    const sha256 = hash(data);
    if (seen.has(sha256)) throw Error('Remove duplicate photos before continuing.');
    seen.add(sha256);
    return { id: `photo-${index + 1}`, name: image.name, mime: image.mime, sha256, bytes: data.length, data_base64: image.data_base64 };
  });
  if (total > 40 * 1024 ** 2) throw Error('Keep the complete photo set under 40 MB.');
  return { images, areaStatement: value.areaStatement.trim(), retention: value.retention };
}
export function approximateArea(statement) {
  const match = statement.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|square feet|ft²|m²|sqm|square met(?:er|re)s)(?:\s|$|[.,!?])/i);
  if (!match) return null;
  const nominal = Number(match[1]) * (/^(m²|sqm|square met)/i.test(match[2]) ? 1 : .09290304);
  if (!(nominal >= 2 && nominal <= 1000)) return null;
  return { nominal_m2: nominal, source: 'user-reported-approximate', statement, measured: false };
}
function publicJob(job) {
  const { images, owner, result, generatedImages, generatedVideo, authorizationNonce, shadoUploadNonce,
    shadoFrozen, shadoQuote, localCompletion, localCompletionReturnStatus, cloudCallId, cloudRecoveryAttempt,
    idealizationSource, idealization, ...rest } = job;
  return { ...rest, images: images.map(({ data_base64, ...image }) => image),
    ...(idealization?{idealizationStatus:idealization.status}:{}),
    shadoQuoteSummary:shadoQuote?{maximumCostUsd:shadoQuote.maximumCostUsd,currency:shadoQuote.currency,expiresAt:shadoQuote.expiresAt}:null,
    hasLocalCompletion:!!localCompletion,canCompleteLocally:!!result?.prediction_fields&&!!job.boundary,
    hasResult: !!result, resultSummary: result ? { status: result.status, model_execution: result.model_execution } : null };
}
export async function createBroker({ directory = join(root,'.local/room-workflow'), runner, recoveryRunner, preflightRunner, completionRunner, sceneNotebookOptions, sceneInvestigatorOptions, reviewEnabled=false, sceneReviewOptions,
  idealizationSourceLoader=loadIdealizationSource, idealizationInputLoader=prepareIdealizationInputs, idealizationRunner=runIdealization,
  idealizationReader=readIdealizedCandidate, idealizationPython=process.env.EVA_ROOM_COMPLETION_PYTHON, shadoFetch=fetch, now = () => Date.now(),
  allowedHosts = new Set(['127.0.0.1:1440','127.0.0.1:1441','127.0.0.1:1442','localhost:1440','localhost:1441','localhost:1442']) } = {}) {
  await mkdir(directory, { recursive: true });
  const notebook=createSceneNotebook({directory,...sceneNotebookOptions});
  // Without its own options EVA inherits the notebook's key/fetcher, so demos that disable the provider disable both.
  const review=createSceneReview(sceneReviewOptions);
  const investigator=createSceneInvestigator({directory,review:review.approved,...(sceneInvestigatorOptions??sceneNotebookOptions)});
  const sessions = new Map();
  const sessionFile = join(directory,'sessions.json');
  try {
    for (const [token,session] of JSON.parse(await readFile(sessionFile,'utf8'))) if (session.expiresAt>now()) sessions.set(token,session);
  } catch {}
  const active = new Set();
  // Delegation tokens only live in memory. Reopening after a restart requires the
  // authenticated popup to renew the exact frozen task, never a persisted bearer.
  const shadoGrants = new Map();
  const localControllers=new Map();
  const tasks = new Map();
  const writes = new Map(), locks = new Map(), cancellations = new Set();
  let approvalQueue=Promise.resolve();
  async function underJobLock(id,action) {
    const previous=locks.get(id)??Promise.resolve();let release;
    const next=new Promise(resolve=>{release=resolve;});locks.set(id,next);await previous;
    try{return await action();}finally{release();if(locks.get(id)===next)locks.delete(id);}
  }
  async function discardLateResult(job,result,resultPath,bindings={}) {
    let bytes=Buffer.from(JSON.stringify(result));
    try{
      const saved=await readFile(resultPath);
      if(!equal(JSON.parse(saved),result))throw Error('Late artifact changed before discard.');
      bytes=saved;
    }catch(error){if(error.code!=='ENOENT')throw error;}
    const outcome={version:1,artifact_type:'eva-room-discarded-cloud-result-v1',job_id:job.id,
      operation:job.pendingOperation,request_sha256:job.requestSha256,result_sha256:hash(bytes),
      remote_result_status:result.status,disposition:'discarded-after-local-cancellation',...bindings};
    await writeFile(join(directory,`${job.id}-discarded-${randomUUID()}.json`),JSON.stringify(outcome),{mode:0o600,flag:'wx'});
    await rm(resultPath,{force:true});
  }
  async function discardUnverifiedLateResult(job,resultPath) {
    let details;
    try{details=await stat(resultPath);}catch(error){if(error.code==='ENOENT')return;throw error;}
    const digest=details.size<=64*1024**2+4096?hash(await readFile(resultPath)):null;
    await writeFile(join(directory,`${job.id}-discarded-unverified-${randomUUID()}.json`),JSON.stringify({
      version:1,artifact_type:'eva-room-discarded-cloud-result-v1',job_id:job.id,
      operation:job.pendingOperation,request_sha256:job.requestSha256,artifact_sha256:digest,artifact_bytes:details.size,
      disposition:'unverified-result-discarded-after-local-cancellation',remote_state:'unresolved',
    }),{mode:0o600,flag:'wx'});
    await rm(resultPath);
  }
  const unresolved=job=>active.has(job.id)||job.idealization?.cleanup_pending===true||['shado-preparing','shado-running','shado-submission-unknown','submission-unknown','cancel-requested'].includes(job.status);
  async function removePrivateJob(id) {
    if(!idPattern.test(id))throw Error('Invalid private job identity.');
    const entries=[];
    for(const name of await readdir(directory))if(name===id+'.json'||name===id+'.shado-grant.json'||name.startsWith(id+'-')){
      const path=join(directory,name),info=await lstat(path);
      if(info.isSymbolicLink()||(!info.isFile()&&!info.isDirectory())||
        (info.isDirectory()&&(!name.startsWith(id+'-idealization-')||!idPattern.test(name.slice((id+'-idealization-').length)))))
        throw Error('Unexpected private artifact; preserve cleanup records for inspection.');
      entries.push({name,path,recursive:info.isDirectory()});
    }
    // Keep the owner/recovery record until every owned artifact has been removed.
    entries.sort((a,b)=>Number(a.name===id+'.json')-Number(b.name===id+'.json'));
    for(const entry of entries)await rm(entry.path,{force:true,recursive:entry.recursive});
  }
  async function listJobs(owner) {
    const jobs=[];
    for(const name of await readdir(directory))if(/^[a-f0-9-]{36}\.json$/.test(name)){
      try {const job=JSON.parse(await readFile(join(directory,name),'utf8'));if(!owner||job.owner===owner)jobs.push(job);}catch{}
    }
    return jobs;
  }
  async function expire() {
    for(let job of await listJobs())if(job.expiresAt<=now()&&!locks.has(job.id)){
      if(job.idealization?.cleanup_pending&&active.has(job.id)){
        await underJobLock(job.id,async()=>{
          job=JSON.parse(await readFile(join(directory,job.id+'.json')));
          job.idealization.status='cancelled';delete job.idealization.review;await persist(job);
          localControllers.get(job.id)?.abort();
        });
        await tasks.get(job.id);
        job=JSON.parse(await readFile(join(directory,job.id+'.json')));
      }
      if(!unresolved(job)&&!locks.has(job.id))await underJobLock(job.id,async()=>{
        const current=JSON.parse(await readFile(join(directory,job.id+'.json')));
        if(current.expiresAt>now()||unresolved(current))return;
        try{await removePrivateJob(current.id);}
        catch{
          current.cleanupError='Private artifacts require operator cleanup inspection.';
          await persist(current);
        }
      });
    }
  }
  async function persist(job) {
    const previous=writes.get(job.id)??Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      if(cancellations.has(job.id)&&!['cancelled','cancel-requested'].includes(job.status)) {
        job.status=active.has(job.id)?'cancel-requested':'cancelled';
        job.message='Cancelled. No new stages will start.';
      }
    const path = join(directory, job.id + '.json');
    await writeFile(path + '.tmp', JSON.stringify(job), { mode: 0o600 });
    await rename(path + '.tmp', path);
    });
    writes.set(job.id,next);
    try {await next;}finally{if(writes.get(job.id)===next)writes.delete(job.id);}
  }
  function sealedShado(job) {
    const q=job.shadoQuote,f=job.shadoFrozen;
    return !!job.shadoTaskId&&!!f&&!!q&&q.recipeHash===f.recipeHash&&q.recipeHash===job.shadoRecipeHash&&
      hash(canonical(q.recipe))===q.recipeHash&&q.currency==='USD'&&
      Number.isSafeInteger(q.pricing?.amountMicros)&&q.pricing.amountMicros>=0&&q.pricing.amountMicros<=100000000&&
      q.maximumCostUsd===q.pricing.amountMicros/1000000&&Number.isFinite(Date.parse(q.expiresAt))&&
      Array.isArray(f.assets)&&f.assets.length===job.images.length&&
      job.images.every((p,i)=>f.assets[i]?.sha256===p.sha256&&f.assets[i]?.size===p.bytes&&f.assets[i]?.mimeType===p.mime);
  }
  async function renewExpiredShado(job) {
    if(job.status==='ready-shado-generation'&&(!shadoGrants.has(job.id)||shadoGrants.get(job.id).expiresAt<=now()||
      Date.parse(job.shadoQuote?.expiresAt)<=now())){
      job.shadoInputsSealed=sealedShado(job);
      shadoGrants.delete(job.id);job.shadoAuthorized=false;delete job.authorizationNonce;delete job.shadoUploadNonce;
      job.status='awaiting-shado';job.message='Renew authorization for this same sealed task. No upload or generation was replayed.';
      await persist(job);
    }
  }
  // Never replay an interrupted cloud submission.
  for (const name of await readdir(directory)) if (idPattern.test(name.replace(/\.json$/, ''))) {
    try {
      const job = JSON.parse(await readFile(join(directory,name),'utf8'));
      if(job.idealization?.status==='preparing'||job.idealization?.cleanup_pending){
        job.idealization.status='failed';job.idealization.cleanup_pending=true;
        job.idealization.error='Broker restarted before CPU settlement; retained evidence requires cleanup verification.';
        delete job.idealization.review;await persist(job);
      }
      if(job.cloudRecoveryStatus==='checking'){
        job.cloudRecoveryStatus='unavailable';delete job.cloudRecoveryAttempt;
        job.message='The previous existing-call check was interrupted. The cloud call remains unresolved; check that same call again.';
        await persist(job);
      }
      if(job.status==='preflighting-images'&&!job.cloudPending){
        job.status='awaiting-cloud-approval';job.imagePreflightStatus='interrupted';
        job.message='Local photo validation was interrupted before cloud admission. No model submission was started.';await persist(job);
      }else if(job.status==='completing-room'){
        job.status='awaiting-shado';job.localCompletionStatus='failed';
        job.message='Local completion was interrupted. The original estimate remains available; no automatic retry was started.';await persist(job);
      } else if (['analyzing','reconstructing'].includes(job.status)) {
        job.cloudPending=true;
        job.status = 'submission-unknown'; job.message = 'The broker restarted during processing. Recover the existing cloud call before retrying.';
        await persist(job);
      } else if (job.status==='shado-preparing') {
        job.status=job.shadoSubmissionStarted?'shado-submission-unknown':'awaiting-shado';
        job.message=job.shadoSubmissionStarted?'Recover the existing Shado task after the restart; no new attempt will start.':
          'Upload preparation was interrupted. Reauthorize the same task to resume sealed originals; generation was not submitted.';
        await persist(job);
      }
      await renewExpiredShado(job);
      if(job.shadoTaskId){job.shadoAuthorized=false;delete job.authorizationNonce;delete job.shadoUploadNonce;await persist(job);}
    } catch { /* malformed records are not exposed */ }
  }
  async function load(id, owner) {
    if (!idPattern.test(id)) throw Error('Room not found.');
    const job = JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));
    if (job.owner !== owner) throw Error('Room not found.');
    await renewExpiredShado(job);
    if (job.expiresAt <= now()&&!unresolved(job)) { await removePrivateJob(id); throw Error('This room working copy has expired.'); }
    return job;
  }
  function payload(job, operation) {
    return { version: 1, operation, job_id: job.id,
      images: job.images.map(({id,sha256,data_base64}) => ({id,sha256,data_base64})),
      ...(operation === 'reconstruct' ? { boundary: job.boundary,
        ...(job.generatedVideo ? {generated_video:job.generatedVideo} : {generated_images:job.generatedImages ?? []}), openings: job.openings ?? [],
        analysis_binding:job.analysisBinding } : {}) };
  }
  function completionEnvelope(job) {
    return {version:1,analysis:job.result,request:payload(job,'analyze'),
      review:{version:1,coordinate_frame:'analysis',analysis_binding:job.analysisBinding,boundary:job.boundary,openings:job.openings??[]}};
  }
  const idealizationOptions={python:idealizationPython,terminate:terminateProcessTree};
  const expectedIdealization=envelope=>Object.fromEntries(['job_id','bindings','parent_revision','boundary','openings','inventory'].map(k=>[k,structuredClone(envelope[k])]));
  function idealizationDirectory(job,attempt){
    if(typeof attempt!=='string'||!idPattern.test(attempt))throw Error('Invalid private idealization identity.');
    return join(directory,`${job.id}-idealization-${attempt}`);
  }
  async function idealizationSource(job){
    const path=join(directory,job.id+'-idealization-source.json'),info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||info.size>128*1024**2)throw Error('Invalid retained source snapshot.');
    const bytes=await readFile(path);
    if(bytes.length>128*1024**2||hash(bytes)!==job.idealizationSource.snapshot_sha256)throw Error('Retained source snapshot changed.');
    const source=JSON.parse(bytes);
    if(source.source_sha256!==job.idealizationSource.source_sha256||source.request.job_id!==job.idealizationSource.source_job_id)
      throw Error('Retained source binding changed.');
    return source;
  }
  async function idealizationCandidate(job,revision=job.idealization?.loaded_revision){
    if(!revision)return null;
    const entry=job.idealization.history?.find(item=>item.revision===revision);
    if(!entry||entry.expected.job_id!==job.id||entry.expected.parent_revision!==entry.envelope.parent_revision)
      throw Error('Idealization revision is not in this job history.');
    if(entry.expected.parent_revision&&!job.idealization.history.some(item=>item.revision===entry.expected.parent_revision))
      throw Error('Idealization parent is not retained in this job.');
    if(job.idealization.cleanup_pending)throw Error('CPU cleanup must be verified before reopening.');
    // Persist intent before launching so a restart cannot erase an uncertain verifier.
    job.idealization.cleanup_pending=true;await persist(job);
    let uncertain=false;
    try{
      const candidate=await idealizationReader(idealizationDirectory(job,entry.attempt),entry.expected,idealizationOptions);
      if(candidate.revision!==revision)throw Error('Retained idealization revision changed.');
      validateFitDiagnostics(candidate,entry.envelope);
      return candidate;
    }catch(error){
      uncertain=error?.code==='termination-unconfirmed';
      if(uncertain){
        job.idealization.status='failed';delete job.idealization.review;
        job.idealization.error='CPU termination is unconfirmed; preserve recovery records.';
      }
      throw error;
    }finally{job.idealization.cleanup_pending=uncertain;await persist(job);}
  }
  async function idealizationView(job){
    await idealizationSource(job);
    const state=job.idealization,candidate=state.cleanup_pending?null:await idealizationCandidate(job);
    return {status:state.status,revision:state.revision,loaded_revision:state.loaded_revision,candidate,
      ...(state.cleanup_pending?{cleanup_pending:true}:{}),review_reasons:candidate?idealizationReasons(candidate):[]};
  }
  async function startIdealization(job,body){
    const state=job.idealization,attempt=randomUUID(),abort=new AbortController(),source=await idealizationSource(job);
    const previous=state.revision,historyFingerprint=hash(canonical(state.history??[])),sourceFingerprint=hash(canonical(job.idealizationSource));
    if(body.action==='prepare'&&typeof idealizationInputLoader!=='function')throw Error('The retained source preparation adapter is not configured.');
    const outputDirectory=idealizationDirectory(job,attempt);
    const prior=body.action==='prepare'?null:await idealizationCandidate(job,body.action==='undo'?body.revision:previous);
    if(body.action!=='prepare'&&!prior)throw Error('A retained candidate is required.');
    state.status='preparing';state.cleanup_pending=true;state.attempt=attempt;state.attempts=(state.attempts??0)+1;delete state.review;
    active.add(job.id);localControllers.set(job.id,abort);
    try{await persist(job);}catch(error){active.delete(job.id);localControllers.delete(job.id);throw error;}
    const task=(async()=>{
      try{
        let envelope;
        if(body.action==='prepare'){
          envelope=await idealizationInputLoader(source,{boundary:body.boundary,openings:body.openings,inventory:body.inventory},
            {...idealizationOptions,signal:abort.signal,outputDirectory,sourcePath:join(directory,job.id+'-idealization-source.json')});
          validateIdealizedSource(envelope,source);
          envelope={...envelope,job_id:job.id,parent_revision:null};
        }else{
          const entry=state.history.find(item=>item.revision===prior.revision);
          envelope=structuredClone(entry.envelope);envelope.parent_revision=previous;
          if(body.action==='correct'){
            if(body.correction?.action==='room'){
              if(Object.keys(body.correction).sort().join(',')!=='action,boundary,openings')throw Error('Unsupported room correction fields.');
              envelope.boundary=structuredClone(body.correction.boundary);
              envelope.openings=structuredClone(body.correction.openings);
            }else envelope.inventory=await deriveIdealizedCorrection(prior.inventory,body.correction,
              {...idealizationOptions,signal:abort.signal,outputPath:outputDirectory+'-inventory.json'});
            // Source-fit residuals describe the old inventory/room, not this correction.
            delete envelope.fit_diagnostics;
          }
        }
        abort.signal.throwIfAborted();
        const bytes=JSON.stringify(envelope),expected=expectedIdealization(envelope);
        if(Buffer.byteLength(bytes)>16*1024**2)throw Error('Idealization input exceeds its metadata budget.');
        // Snapshot trusted derivation before the separately injected assembly worker sees it.
        const frozen=structuredClone(envelope);
        const result=await idealizationRunner(envelope,{...idealizationOptions,signal:abort.signal,outputDirectory,inputSha256:hash(bytes)});
        validateIdealizedResult(result,expected);
        const admitted=await readIdealizedCandidate(outputDirectory,expected,{...idealizationOptions,signal:abort.signal});
        if(!equal(admitted,result))throw Error('Worker response differs from retained candidate.');
        validateFitDiagnostics(admitted,frozen);
        await underJobLock(job.id,async()=>{
          const current=await load(job.id,job.owner),next=current.idealization;
          await idealizationSource(current);
          if(abort.signal.aborted||current.expiresAt<=now()||next.attempt!==attempt||next.status!=='preparing'||next.revision!==previous||
            hash(canonical(next.history??[]))!==historyFingerprint||hash(canonical(current.idealizationSource))!==sourceFingerprint)
            throw Error('Idealization inputs or current revision changed during assembly.');
          next.history??=[];next.history.push({attempt,revision:admitted.revision,envelope:frozen,expected});
          next.status='needs-review';next.cleanup_pending=false;delete next.error;
          next.revision=admitted.revision;next.loaded_revision=admitted.revision;
          await persist(current);
        });
      }catch(error){
        await underJobLock(job.id,async()=>{
          const current=await load(job.id,job.owner),next=current.idealization;
          if(next.attempt!==attempt)return;
          next.status=abort.signal.aborted?'cancelled':'failed';
          next.cleanup_pending=error?.code==='termination-unconfirmed';
          next.error=next.cleanup_pending?'CPU termination is unconfirmed; preserve recovery records.':'No matching candidate was admitted. Prior evidence remains retained.';
          await persist(current);
        });
      }finally{active.delete(job.id);tasks.delete(job.id);localControllers.delete(job.id);}
    })();tasks.set(job.id,task);
  }
  async function idealizationAction(job,body,send){
    const fields={prepare:['boundary','openings','inventory'],correct:['correction'],review:['candidate_revision','source_sha256','boundary_sha256','inventory_sha256','decisions'],undo:['revision'],cancel:[]};
    if(!body||Array.isArray(body)||typeof body.action!=='string'||!Object.hasOwn(fields,body.action)||
      Object.keys(body).sort().join(',')!==['action','expected_revision',...fields[body.action]].sort().join(','))
      return send(400,{error:'Unsupported idealization action or fields.'});
    const state=job.idealization;
    if(body.expected_revision!==state.revision)return send(409,{error:'Idealization revision changed; reopen before editing.'});
    if(body.action==='cancel'){
      if(active.has(job.id)&&state.status!=='preparing')return send(409,{error:'Another stage owns the active operation.'});
      state.status='cancelled';delete state.review;await persist(job);localControllers.get(job.id)?.abort();
      return send(200,{status:state.status,revision:state.revision,loaded_revision:state.loaded_revision});
    }
    if(unresolved(job)||state.cleanup_pending||['cancelled','cancel-requested','submission-unknown'].includes(job.status))
      return send(409,{error:'Resolve the active or interrupted operation before editing.'});
    if(body.action==='review'){
      const candidate=await idealizationCandidate(job);await idealizationSource(job);
      if(!candidate||!['needs-review','ready'].includes(state.status)||body.candidate_revision!==state.revision||
        body.source_sha256!==job.idealizationSource.source_sha256||
        body.boundary_sha256!==idealizedDigest({boundary:candidate.boundary,openings:candidate.openings})||
        body.inventory_sha256!==idealizedDigest(candidate.inventory))return send(409,{error:'Review does not match the exact current candidate and source.'});
      if(!equal(body.decisions,{boundary:true,inventory:true,review_reasons:idealizationReasons(candidate)}))
        return send(400,{error:'Explicit room, inventory and unresolved-reason decisions are required.'});
      state.review={...structuredClone(body),owner:job.owner,at:now()};state.status='ready';await persist(job);
      return send(200,{status:'ready',revision:state.revision,loaded_revision:state.loaded_revision});
    }
    if((body.action==='prepare')!==(state.revision===null))return send(409,{error:'Prepare is only for the first candidate; edits require a retained revision.'});
    if((state.attempts??0)>=32)return send(409,{error:'Idealization attempt limit reached; preserve or delete this working copy.'});
    if(body.action==='undo'&&!state.history?.some(entry=>entry.revision===body.revision))return send(409,{error:'Undo requires a retained revision from this job.'});
    await startIdealization(job,body);return send(202,{status:'preparing',revision:state.revision,loaded_revision:state.loaded_revision});
  }
  async function completeLocally(job) {
    if(!completionRunner&&!process.env.EVA_ROOM_COMPLETION_PYTHON)throw Error('The local CPU completion adapter is not configured.');
    if(!job.boundary||!job.result?.prediction_fields||!job.analysisBinding)throw Error('Confirmed boundary and existing numerical ML predictions are required.');
    const envelope=completionEnvelope(job),bytes=JSON.stringify(envelope),digest=hash(bytes);
    if(Buffer.byteLength(bytes)>64*1024**2)throw Error('Local completion input exceeds 64 MiB.');
    validateWorkerResult(job.result,envelope.request);
    job.localCompletionReturnStatus=job.status;job.status='completing-room';job.localCompletionStatus='running';
    job.message='Completing the confirmed room from existing ML depth on this PC. No model or cloud call is running.';
    const abort=new AbortController();localControllers.set(job.id,abort);
    await persist(job);active.add(job.id);
    const task=(async()=>{
      try {
        const result=completionRunner?await completionRunner(envelope,{signal:abort.signal,inputSha256:digest}):
          await runLocalCompletion(bytes,job.id,directory,abort.signal);
        const current=await load(job.id,job.owner);
        if(current.status==='cancel-requested'||abort.signal.aborted){current.localCompletionStatus='cancelled';current.status='cancelled';current.message='Local worker exited; its late result was discarded.';await persist(current);return;}
        if(hash(JSON.stringify(completionEnvelope(current)))!==digest)throw Error('Room review or source changed during local completion.');
        validateLocalCompletion(result,envelope,digest);
        current.localCompletion=result;current.localCompletionStatus='complete';current.status=current.localCompletionReturnStatus??'awaiting-shado';
        current.message='Photo-based room completion is ready to inspect. Closures are authored assumptions; the Shado comparison remains pending.';
        await persist(current);
      } catch(error) {
        const current=await load(job.id,job.owner);
        // runLocalCompletion rejects cancellation only after confirmed process exit.
        const uncertain=error?.code==='termination-unconfirmed';
        current.localCompletionStatus=uncertain?'termination-unconfirmed':abort.signal.aborted?'cancelled':'failed';
        current.status=uncertain?'cancel-requested':abort.signal.aborted?'cancelled':current.localCompletionReturnStatus??'awaiting-shado';
        current.message=uncertain?'Local worker termination is unconfirmed. Its output will not be admitted; retain this recovery record.':
          abort.signal.aborted?'Local worker exited after cancellation. No completion was admitted.':
          'Local completion did not return a valid matching artifact. The original ML estimate remains available.';
        await persist(current);
      } finally {active.delete(job.id);tasks.delete(job.id);localControllers.delete(job.id);}
    })();tasks.set(job.id,task);
  }
  async function shadoClient(job) {
    if(!process.env.EVA_SHADO_ORIGIN)throw Error('The scoped Shado bridge is not configured.');
    const grant=shadoGrants.get(job.id);
    if(!grant)throw Error('Reauthorize this exact room job in Shado. Delegations are not saved to disk.');
    if(grant.assets?.length!==job.images.length || job.images.some((p,i)=>grant.assets[i]?.sha256!==p.sha256||grant.assets[i]?.size!==p.bytes||grant.assets[i]?.mimeType!==p.mime))
      throw Error('Shado authorization does not match these original photos.');
    if(job.shadoTaskId && job.shadoTaskId!==grant.taskId)throw Error('Recover the existing Shado task; a replacement task is not allowed.');
    return {client:createShadoBridgeClient({origin:process.env.EVA_SHADO_ORIGIN,grant,fetcher:shadoFetch,now}),grant};
  }
  async function prepareShado(job) {
    const {client,grant}=await shadoClient(job);
    if(grant.phase!=='upload')throw Error('Upload-only permission is required to prepare a quote.');
    job.shadoTaskId=grant.taskId;job.shadoRecipeHash=grant.recipeHash;job.status='shado-preparing';
    job.message='Uploading the approved originals and obtaining the real quote. This permission cannot generate video.';
    await persist(job);active.add(job.id);
    const task=(async()=>{
      try {
        for(let i=0;!job.shadoInputsSealed&&i<job.images.length;i++) {
          if((await load(job.id,job.owner)).status==='cancel-requested'||shadoGrants.get(job.id)!==grant)return;
          await client.uploadPhoto(i,Buffer.from(job.images[i].data_base64,'base64'));
        }
        if(shadoGrants.get(job.id)!==grant)return;
        const quote=job.shadoInputsSealed&&sealedShado(job)&&Date.parse(job.shadoQuote.expiresAt)>now()
          ?job.shadoQuote:await client.quote();
        const current=await load(job.id,job.owner);
        if(current.status==='cancel-requested'||shadoGrants.get(job.id)!==grant)return;
        current.shadoQuote=quote;current.shadoInputsSealed=true;current.status='awaiting-shado-generation';current.shadoAuthorized=false;
        current.message=current.shadoSubmissionStarted?'Review the bound quote in Shado to renew access to the existing task. No replacement generation will start.':
          'Originals are sealed and the real quote is ready. Review and authorize generation in the Shado window.';
        await persist(current);
      } catch {
        const current=await load(job.id,job.owner);
        if(current.status!=='cancel-requested') {
          current.status=current.shadoSubmissionStarted?'shado-submission-unknown':'awaiting-shado';
          current.message=current.shadoSubmissionStarted?'Shado did not return a verified result. Check the existing task; do not submit another generation.':'Shado preparation failed before generation submission. Reconnect or retry preparation of this same task.';
          await persist(current);
        }
      } finally {
        active.delete(job.id);tasks.delete(job.id);
        const current=await load(job.id,job.owner);
        if(current.status==='cancel-requested'&&!current.shadoSubmissionStarted){
          current.status='cancelled';current.message='Cancelled before generation submission.';await persist(current);
        }
      }
    })();tasks.set(job.id,task);
  }
  async function startShado(job) {
    const {client,grant}=await shadoClient(job);
    if(grant.phase!=='generation'||!job.shadoQuote||job.shadoSubmissionStarted)throw Error('One current quote-bound generation grant is required.');
    // Durably record admission intent before the only submit. Never quote with a
    // generation grant; a lost acknowledgement must recover this same task.
    job.shadoSubmissionStarted=true;job.status='shado-submission-unknown';
    job.message='Submitting the single authorized task. Any uncertain response will recover this same task.';
    await persist(job);active.add(job.id);
    const task=(async()=>{
      let acknowledged=false;
      try {
        if(cancellations.has(job.id)||shadoGrants.get(job.id)!==grant)return;
        const result=await client.submit(job.shadoQuote);acknowledged=true;
        const current=await load(job.id,job.owner);
        if(current.status==='cancel-requested'){await client.stop();return;}
        if(shadoGrants.get(job.id)!==grant)return;
        current.status='shado-running';current.shadoStatus=result.status;current.message='Shado is processing the one authorized video.';
        await persist(current);
      } catch(error) {
        await underJobLock(job.id,async()=>{
          const current=await load(job.id,job.owner);
          if(!acknowledged&&error?.uncertain===false){
            current.shadoSubmissionStarted=false;current.shadoAuthorized=false;current.shadoCancelRequested=false;
            shadoGrants.delete(job.id);delete current.authorizationNonce;delete current.shadoUploadNonce;
            current.status=cancellations.has(job.id)?'cancelled':'awaiting-shado';
            current.message='Shado rejected submission. No automatic retry was started; renew authorization for this same task or delete the working copy.';
          }else if(current.status!=='cancel-requested'){
            current.status='shado-submission-unknown';current.message='Submission remains uncertain. Recover the existing task; another generation will not be submitted.';
          }
          await persist(current);
        });
      } finally {active.delete(job.id);tasks.delete(job.id);}
    })();tasks.set(job.id,task);
  }
  async function refreshShado(job) {
    const {client}=await shadoClient(job);
    const task=await client.status();
    if(!task){job.message='No durable task was found. The previous submission remains unresolved; no retry was started.';await persist(job);return;}
    job.shadoStatus=task.status;
    if(job.status==='cancel-requested'||job.shadoCancelRequested){
      if(['completed','failed','stopped'].includes(task.status)){
        job.status='cancelled';job.message='The remote task has settled. Its outputs were discarded after cancellation.';
      }else job.message='Cancellation requested; the remote task has not yet settled.';
      await persist(job);return;
    }
    if(task.status==='completed'){
      const output=task.receipts[0]?.outputs[0];
      if(!output)throw Error('Shado completed without a receipt-bound video.');
      const {descriptor,bytes}=await client.downloadOutput(output.id,{maxBytes:50*1024**2});
      job.generatedVideo={id:'shado-video',sha256:descriptor.sha256,data_base64:bytes.toString('base64')};
      job.shadoReceipt={taskId:task.id,recipeHash:job.shadoRecipeHash,assetId:descriptor.id,sha256:descriptor.sha256};
      job.status='awaiting-comparison';job.message='The actual Shado video is verified. The paired cloud reconstruction is ready for its bounded allowance.';
    } else if(['failed','stopped'].includes(task.status)){
      job.status='shado-failed';job.message='The Shado attempt did not yield a usable video. The original-photo estimate remains available.';
    } else {job.status='shado-running';job.message='The existing Shado task is still processing.';}
    await persist(job);
  }
  async function cloud(job, operation) {
    const request = payload(job, operation);
    const bytes=JSON.stringify(request),digest = hash(bytes);
    job.requestSha256=digest;job.pendingOperation=operation;
    if (!runner && !process.env.EVA_ROOM_PYTHON) {
      job.status='awaiting-cloud-approval';job.requestSha256=digest;job.pendingOperation=operation;
      job.message='The cloud worker needs configuration and a job-specific allowance. No model has run.';
      await persist(job);return;
    }
    const eligible=a=>a.jobId===job.id&&a.operation===operation&&a.requestSha256===digest&&
      a.expiresAt>now()&&a.maxSeconds===600&&a.used!==true;
    let available=[];try{available=JSON.parse(await readFile(join(directory,'run-approvals.json'),'utf8'));}catch{}
    if (!available.some(eligible)) {
      job.status = 'awaiting-cloud-approval'; job.requestSha256 = digest; job.pendingOperation = operation;
      job.message = 'A job-specific cloud allowance is required. Your photos are saved locally; no model has run.';
      await persist(job); return;
    }
    if(!preflightRunner&&!process.env.EVA_ROOM_COMPLETION_PYTHON){
      job.status='awaiting-cloud-approval';job.imagePreflightStatus='not-configured';
      job.message='Configure local CPU photo validation before cloud processing. The allowance remains unused.';
      await persist(job);return;
    }
    // Save the exact bytes before admission; keep them through uncertainty and
    // retention. A later recovery must never reconstruct a missing request.
    const requestPath=join(directory,`${job.id}-${operation}-request.json`);
    try{await writeFile(requestPath,bytes,{mode:0o600,flag:'wx'});}catch(error){
      if(error.code!=='EEXIST'||!Buffer.from(bytes).equals(await readFile(requestPath)))throw Error('The frozen request already exists with different bytes.');
    }
    job.cloudPending=false;job.status='preflighting-images';job.imagePreflightStatus='running';
    job.message='Checking the original photos locally before using the cloud allowance.';
    const abort=new AbortController();localControllers.set(job.id,abort);
    await persist(job); active.add(job.id);
    const task = (async () => {
      let admissionStarted=false;
      try {
        const reportPath=join(directory,`${job.id}-image-preflight-${randomUUID()}.json`);
        const report=preflightRunner?await preflightRunner(request,{signal:abort.signal,requestSha256:digest}):
          await runImagePreflight(requestPath,reportPath,{signal:abort.signal,terminate:terminateProcessTree});
        if(preflightRunner){
          const encoded=JSON.stringify(report);
          if(Buffer.byteLength(encoded)>65536)throw Error('Image admission report exceeds 64 KiB.');
          await writeFile(reportPath,encoded,{mode:0o600,flag:'wx'});
        }
        validateImagePreflight(report,request,digest);abort.signal.throwIfAborted();
        if(hash(await readFile(requestPath))!==digest)throw Error('The frozen request changed during photo validation.');
        let grant;
        const consume=approvalQueue.catch(()=>{}).then(async()=>{
          const current=await load(job.id,job.owner);
          if(current.status==='cancel-requested'||abort.signal.aborted)return;
          const approvals=JSON.parse(await readFile(join(directory,'run-approvals.json'),'utf8'));
          grant=approvals.find(eligible);
          if(!grant)return;
          // Durable uncertain intent precedes allowance consumption. A restart
          // anywhere after this boundary must never submit the request again.
          current.imagePreflightStatus='valid';current.cloudPending=true;current.cloudSubmissionStarted=true;
          current.status=operation==='analyze'?'analyzing':'reconstructing';current.message='Validated photos admitted to the one authorized cloud call.';
          await persist(current);
          if(abort.signal.aborted){grant=undefined;return;}
          admissionStarted=true;grant.used=true;
          await writeFile(join(directory,'run-approvals.json'),JSON.stringify(approvals),{mode:0o600});
        });
        approvalQueue=consume;await consume;
        if(abort.signal.aborted){
          const current=await load(job.id,job.owner);
          current.cloudPending=false;current.status='cancelled';current.imagePreflightStatus='cancelled';
          current.message='Cancelled before cloud submission. No model call was started.';
          await persist(current);return;
        }
        if(!grant){
          const current=await load(job.id,job.owner);
          current.cloudPending=false;current.imagePreflightStatus='valid';current.status='awaiting-cloud-approval';
          current.message='The photos passed local validation; a current unused allowance is required.';
          await persist(current);return;
        }
        // Keep the local launch barrier cancellable through the last request
        // read. Once the client process launches, its receipt owns remote stop.
        let result;
        if(runner){localControllers.delete(job.id);result=await runner(request);}
        else result=await runCloudClient(request,directory,grant.maxSeconds,{
          signal:abort.signal,onLaunch:()=>localControllers.delete(job.id),
        });
        await underJobLock(job.id,async()=>{
        const current = await load(job.id, job.owner);
        validateWorkerResult(result,request);
        let receiptCancellation=false,callId;
        try{
          const receiptBytes=await readFile(join(directory,`${job.id}-${operation}-request.receipt.json`));
          if(receiptBytes.length>65536)throw Error('Cloud receipt exceeded its limit.');
          const receipt=JSON.parse(receiptBytes);
          if(receipt.job_id!==job.id||receipt.request_sha256!==digest)throw Error('Cloud receipt changed its job binding.');
          receiptCancellation=receiptCancelled(receipt);callId=receipt.modal_call_id;
        }catch(error){if(error.code!=='ENOENT')throw error;}
        current.cloudPending=false;
        if (current.status === 'cancel-requested'||receiptCancellation) {
          await discardLateResult(current,result,join(directory,`${job.id}-${operation}-result.json`),callId?{modal_call_id:callId}:{});
          current.status='cancelled';
          current.message = 'Result discarded after cancellation. Remote cost may have accrued before the time limit.';
          await persist(current); return;
        }
        current.result = result;
        if(operation==='analyze')current.analysisBinding=result.analysis_binding;
        current.status = operation === 'analyze' && result.status !== 'failed' ? 'review-boundary' : result.status;
        current.message = result.status==='failed' ? `The worker reported a failure (${result.model_execution}). Inspect the recorded result; no automatic retry was started.` :
          operation === 'analyze' ? 'Review the estimated room boundary. Dimensions remain approximate.' : 'Comparison returned. Inspect the source and generated contributions.';
        await persist(current);
        });
      } catch(error) {
        try {
          const current = await load(job.id,job.owner);
          if(admissionStarted&&current.status==='cancel-requested')
            await discardUnverifiedLateResult(current,join(directory,`${job.id}-${operation}-result.json`));
          if(error?.code==='cloud-not-submitted'){
            current.cloudPending=false;current.cloudSubmissionStarted=false;
            current.status=cancellations.has(job.id)?'cancelled':'awaiting-cloud-approval';
            current.message='No cloud submission was started. The consumed allowance remains used; another attempt requires a fresh allowance.';
          }else if(!admissionStarted){
            const uncertain=error?.code==='termination-unconfirmed';
            current.cloudPending=false;current.imagePreflightStatus=uncertain?'termination-unconfirmed':abort.signal.aborted?'cancelled':'failed';
            current.status=uncertain?'cancel-requested':abort.signal.aborted?'cancelled':'awaiting-cloud-approval';
            current.message=uncertain?'Local validation termination is unconfirmed. Its output cannot authorize cloud work.':
              abort.signal.aborted?'Local photo validation stopped. No cloud allowance was consumed or model submitted.':
              'Original photos did not pass local validation. The cloud allowance remains unused.';
          }else if (current.status !== 'cancel-requested') {
            current.status = 'submission-unknown'; current.message = 'The cloud call did not return a verified result. Recover its existing call before any retry.';
          }
          await persist(current);
        } catch {}
      } finally { active.delete(job.id); tasks.delete(job.id);localControllers.delete(job.id); }
    })();
    tasks.set(job.id,task);
  }
  async function recoverCloud(job) {
    if(active.has(job.id))throw Error('An operation on this room is already active.');
    const input=await recoveryInputs(directory,job,payload(job,job.pendingOperation));
    job.cloudCallId=input.modalCallId;job.cloudPending=true;job.cloudRecoveryAttempt=randomUUID();
    job.cloudRecoveryStatus='checking';job.message='Checking only the existing cloud call. No model submission or new allowance is requested.';
    const attempt=job.cloudRecoveryAttempt;
    await persist(job);active.add(job.id);
    const task=(async()=>{
      const output=join(directory,`${job.id}-recovery-${attempt}.json`);
      try{
        let envelope;
        if(recoveryRunner){
          envelope=await recoveryRunner(input);
          const bytes=JSON.stringify(envelope);
          if(Buffer.byteLength(bytes)>64*1024**2+4096)throw Error('Recovery artifact exceeds its resource limit.');
          await writeFile(output,bytes,{mode:0o600,flag:'wx'});
        }else envelope=await runRecoveryClient(input,output,{terminate:terminateProcessTree});
        validateRecovery(envelope,input);
        await underJobLock(job.id,async()=>{
        const current=await load(job.id,job.owner);
        if(current.cloudRecoveryAttempt!==attempt)throw Error('The recovery attempt changed.');
        // Cancellation may update receipt status, never its identity or request.
        const latest=await recoveryInputs(directory,current,payload(current,current.pendingOperation));
        if(envelope.status!=='result-available'){
          current.cloudRecoveryStatus=envelope.status;
          current.message='The existing cloud call is still unresolved. No replacement call was submitted.';
        }else{
          current.cloudPending=false;current.cloudRecoveryStatus='settled';
          if(current.status==='cancel-requested'||cancellations.has(job.id)||envelope.cancellation_requested||receiptCancelled(latest.receipt)){
            // Keep a small binding/outcome receipt; discard the newly returned
            // payload, never an unrelated original result artifact.
            await writeFile(join(directory,`${job.id}-discarded-${attempt}.json`),JSON.stringify({
              version:1,artifact_type:'eva-room-discarded-cloud-result-v1',job_id:job.id,
              operation:input.request.operation,request_sha256:input.requestSha256,
              receipt_sha256:input.receiptSha256,modal_call_id:input.modalCallId,
              result_sha256:hash(JSON.stringify(envelope.result)),recovery_artifact_sha256:hash(await readFile(output)),
              remote_result_status:envelope.result.status,disposition:'discarded-after-local-cancellation',
            }),{mode:0o600,flag:'wx'});
            await rm(output);
            current.status='cancelled';current.message='The existing worker returned a conclusive result. Its geometry was discarded after cancellation.';
          }else{
            current.result=envelope.result;
            if(current.pendingOperation==='analyze')current.analysisBinding=envelope.result.analysis_binding;
            current.status=current.pendingOperation==='analyze'&&envelope.result.status!=='failed'?'review-boundary':envelope.result.status;
            current.message='The existing cloud result was recovered and validated. No new model call ran.';
          }
        }
        await persist(current);
        });
      }catch{
        const current=await load(job.id,job.owner);
        if(current.status==='cancel-requested'||receiptCancelled(input.receipt))
          await discardUnverifiedLateResult(current,output);
        current.cloudRecoveryStatus='unavailable';
        current.message='Recovery did not return a verified result for this exact call. The remote task remains unresolved; no retry was submitted.';
        await persist(current);
      }finally{active.delete(job.id);tasks.delete(job.id);}
    })();tasks.set(job.id,task);
  }
  const server = http.createServer(async (request,response) => {
    let unlock;
    const send = (status,body) => { response.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); response.end(JSON.stringify(body)); };
    try {
      if (!allowedHosts.has(request.headers.host ?? '')) return send(403,{error:'Loopback host required.'});
      const origin = request.headers.origin;
      if (request.method !== 'GET' && !['http://127.0.0.1:1440','http://127.0.0.1:1441','http://localhost:1440'].includes(origin)) return send(403,{error:'Same-origin request required.'});
      const token = (request.headers.cookie ?? '').match(/(?:^|;\s*)eva_room=([a-f0-9]{64})/)?.[1];
      let session = token && sessions.get(hash(token));
      if (session && session.expiresAt<=now()) session=undefined;
      const pathname = new URL(request.url,'http://127.0.0.1').pathname;
      if (pathname === '/api/room-workflow/session' && request.method === 'GET') {
        if (!session) {
          const secret = randomBytes(32).toString('hex'); session = { owner: randomUUID(), csrf: randomBytes(24).toString('hex'),expiresAt:now()+30*24*3600000 };
          sessions.set(hash(secret),session);
          await writeFile(sessionFile,JSON.stringify([...sessions]),{mode:0o600});
          response.setHeader('Set-Cookie',`eva_room=${secret}; HttpOnly; SameSite=Strict; Max-Age=2592000; Path=/api/room-workflow`);
        }
        return send(200,{csrf:session.csrf,cloudConfigured:!!process.env.EVA_ROOM_PYTHON,shadoConfigured:!!process.env.EVA_SHADO_ORIGIN,
          imagePreflightConfigured:!!process.env.EVA_ROOM_COMPLETION_PYTHON,
          localCompletionConfigured:!!process.env.EVA_ROOM_COMPLETION_PYTHON,
          storage:'Local development intake; cloud execution requires a job-specific allowance.',comparisonRequired:true});
      }
      if (!session) return send(401,{error:'Open the upload page to start a private session.'});
      if(pathname==='/api/room-workflow/idealization-source'){
        if(request.method!=='GET')return send(405,{error:'Source discovery is read-only.'});
        if(origin&&!['http://127.0.0.1:1440','http://127.0.0.1:1441','http://localhost:1440'].includes(origin))
          return send(403,{error:'Same-origin inspection required.'});
        if(new URL(request.url,'http://127.0.0.1').search)return send(400,{error:'Source discovery accepts no selectors.'});
        return await underJobLock('intake',async()=>{
        try{
          const source=await idealizationSourceLoader(),report=source.worldmirror_report;
          const boundary=validateBoundary(report.boundary),openings=validateOpenings(report.openings,boundary);
          return send(200,{source:source.source,source_sha256:source.source_sha256,
            coordinate_frame:'worldmirror-candidate',up:'Z',units:'relative',boundary_confirmed:false,boundary,openings,
            photos:source.request.images.map(({id,sha256},i)=>({id,sha256,url:`/api/room-workflow/benchmark/arkitscenes/originals/${i}`}))});
        }catch{return send(503,{error:'Retained source is unavailable or failed admission. No work was started.'});}
        });
      }
      if(pathname.startsWith('/api/room-workflow/benchmark/')) {
        if(request.method!=='GET')return send(405,{error:'Benchmark inspection is read-only.'});
        if(origin&&!['http://127.0.0.1:1440','http://127.0.0.1:1441','http://localhost:1440'].includes(origin))
          return send(403,{error:'Same-origin inspection required.'});
        let resource;
        if(pathname.startsWith('/api/room-workflow/benchmark/ffs/')){
          if(new URL(request.url,'http://127.0.0.1').search)return send(400,{error:'FFS resources accept no selectors.'});
          try{resource=await ffsResource(pathname);}catch{return send(503,{error:'FFS resource unavailable or integrity check failed.'});}
        }else resource=await benchmarkResource(pathname,idealizationOptions);
        if(!resource)return send(404,{error:'Benchmark resource not found.'});
        response.writeHead(200,{'Content-Type':resource.type,'Cache-Control':'no-store',
          'X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});
        return response.end(resource.body);
      }
      if (request.method !== 'GET') {
        const csrf = Buffer.from(String(request.headers['x-eva-csrf'] ?? ''));
        const expected = Buffer.from(session.csrf);
        if (csrf.length !== expected.length || !timingSafeEqual(csrf,expected)) return send(403,{error:'Session check failed.'});
      }
      let body = {};
      if (request.method === 'POST') {
        if (!(request.headers['content-type'] ?? '').startsWith('application/json')) return send(415,{error:'JSON required.'});
        const chunks = []; let length = 0;
        const limit=pathname.startsWith('/api/room-workflow/crime-scene/')||pathname.endsWith('/import-idealization')||pathname.endsWith('/idealization')?65536:58*1024**2;
        for await (const chunk of request) { length += chunk.length; if (length > limit) throw Error('Request is too large.'); chunks.push(chunk); }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
      if(pathname.startsWith('/api/room-workflow/crime-scene/')){
        if(origin&&!['http://127.0.0.1:1440','http://127.0.0.1:1441','http://localhost:1440'].includes(origin))return send(403,{error:'Same-origin inspection required.'});
        if(new URL(request.url,'http://127.0.0.1').search)return send(400,{error:'Notebook accepts no selectors.'});
        const action=pathname.slice('/api/room-workflow/crime-scene/'.length);
        if(!['notes','status','reply','investigation','ask',...(reviewEnabled?['review']:[])].includes(action))return send(404,{error:'Not found.'});
        const abort=new AbortController();
        const disconnected=()=>{if(!response.writableEnded)abort.abort();};
        response.once('close',disconnected);
        try{
          if(action==='notes'&&request.method==='GET')return send(200,await notebook.read(session.owner));
          if(action==='status'&&request.method==='GET')return send(200,await notebook.status(session.owner));
          if(action==='notes'&&request.method==='POST')return send(200,await notebook.save(session.owner,body));
          if(action==='reply'&&request.method==='POST')return send(200,await notebook.reply(session.owner,body,{signal:abort.signal}));
          if(action==='investigation'&&request.method==='GET')return send(200,{...await investigator.status(session.owner),...await investigator.read(session.owner)});
          if(action==='ask'&&request.method==='POST')return send(200,await investigator.ask(session.owner,body,{signal:abort.signal}));
          if(action==='review'&&request.method==='GET')return send(200,await review.read());
          if(action==='review'&&request.method==='POST')return send(200,await review.save(body));
          return send(405,{error:'Method not allowed.'});
        }catch(error){
          // Every EVA error after the reservation carries a status, so an unstatused one means nothing was counted.
          if(!response.destroyed)return send(error.status??503,{error:error.status?error.message:['ask','investigation'].includes(action)?
            'EVA is unavailable. No request was counted.':'Private notebook is unavailable. Your draft has not been discarded.'});
        }finally{response.removeListener('close',disconnected);}
        return;
      }
      if (['/api/room-workflow/jobs','/api/room-workflow/jobs/import-idealization'].includes(pathname) && request.method === 'POST') {
        return await underJobLock('intake',async()=>{
        await expire();
        const existing=await listJobs();
        if(existing.length>=20||existing.filter(j=>j.owner===session.owner).length>=5)
          return send(409,{error:'Working-copy limit reached. Delete an old room before uploading another.'});
        if(pathname.endsWith('/import-idealization')){
          if(!body||Array.isArray(body)||Object.keys(body).sort().join(',')!=='expected_source_sha256,source'||
            body.source!=='retained-seven-photo-room'||typeof body.expected_source_sha256!=='string'||
            body.expected_source_sha256.length!==64||!/^[a-f0-9]{64}$/.test(body.expected_source_sha256))
            return send(400,{error:'Import requires the fixed retained source and exact source fingerprint.'});
          const source=await idealizationSourceLoader();
          if(source.source!==body.source||source.source_sha256!==body.expected_source_sha256)
            return send(409,{error:'Retained evidence changed. Review its current source fingerprint before importing.'});
          const bytes=JSON.stringify(source);
          if(Buffer.byteLength(bytes)>128*1024**2)throw Error('Retained source snapshot exceeds its budget.');
          const job={id:randomUUID(),owner:session.owner,kind:'idealization-review',status:'importing-source',
            createdAt:now(),expiresAt:now()+24*3600000,retention:'temporary',areaStatement:'',scale:null,boundary:null,result:null,
            images:source.request.images.map(({id,sha256,data_base64})=>({id,sha256,name:id+'.png',mime:'image/png',bytes:Buffer.from(data_base64,'base64').length})),
            idealizationSource:{source:source.source,source_sha256:source.source_sha256,source_job_id:source.request.job_id,snapshot_sha256:hash(bytes)},
            idealization:{status:'not-started',revision:null,loaded_revision:null},
            message:'Retained evidence only. Room and inventory review are pending; model actions are disabled.'};
          await persist(job);
          try{
            await writeFile(join(directory,job.id+'-idealization-source.json'),bytes,{flag:'wx',mode:0o600});
            job.status='idealization-review';await persist(job);
          }catch(error){job.status='import-failed';await persist(job);throw error;}
          return send(201,{job_id:job.id,revision:null});
        }
        const input = validateIntake(body);
        const job = { ...input,id:randomUUID(),owner:session.owner,status:'awaiting-analysis',createdAt:now(),
          expiresAt: input.retention === 'temporary' ? now()+24*3600000 : now()+30*24*3600000,
          scale:approximateArea(input.areaStatement),message:'Photos saved locally. No cloud upload or generation has started.',boundary:null,result:null };
        await persist(job); return send(201,publicJob(job));
        });
      }
      if(pathname==='/api/room-workflow/jobs'&&request.method==='GET'){
        await expire();return send(200,(await listJobs(session.owner)).map(publicJob));
      }
      const match = pathname.match(/^\/api\/room-workflow\/jobs\/([a-f0-9-]{36})(?:\/(analyze|boundary|compare|result|completion|complete-local|idealization|cancel|recover-cloud|shado|shado-status|shado-quote|shado-invalidate|authorize|grant))?$/);
      if (!match) return send(404,{error:'Not found.'});
      if(request.method!=='GET'||match[2]==='idealization') {
        const previous=locks.get(match[1])??Promise.resolve();
        let release;const next=new Promise(resolve=>{release=resolve;});
        locks.set(match[1],next);await previous;
        unlock=()=>{release();if(locks.get(match[1])===next)locks.delete(match[1]);};
      }
      const job = await load(match[1],session.owner), action = match[2];
      if(action==='idealization'){
        if(job.kind!=='idealization-review'||!job.idealization)return send(409,{error:'Import the retained source into a private idealization working copy first.'});
        if(request.method==='GET')return send(200,await idealizationView(job));
        if(request.method==='POST')return await idealizationAction(job,body,send);
        return send(405,{error:'Idealization accepts GET or POST only.'});
      }
      if (request.method === 'GET') {
        if(action==='completion')return send(200,job.localCompletion??{status:job.localCompletionStatus??'not-run'});
        if(action==='shado-quote'){
          if(job.status!=='awaiting-shado-generation'||!job.shadoQuote||!job.authorizationNonce||!job.shadoUploadNonce)
            return send(409,{error:'No quote is ready for this authorization window.'});
          return send(200,{type:'eva-room-quote',nonce:job.authorizationNonce,jobId:job.id,taskId:job.shadoTaskId,
            recipeHash:job.shadoRecipeHash,uploadNonce:job.shadoUploadNonce,quote:job.shadoQuote});
        }
        return send(200, action === 'result' ? job.result ?? {status:'not-run'} : publicJob(job));
      }
      if (request.method === 'DELETE') {
        if (unresolved(job)) return send(409,{error:'Resolve the existing remote task before deleting its recovery records.'});
        await removePrivateJob(job.id);return send(200,{deleted:true});
      }
      if (request.method !== 'POST') return send(405,{error:'Method not allowed.'});
      if(job.kind==='idealization-review')return send(409,{error:'Imported evidence permits private idealization only, not model or Shado actions.'});
      if(action==='recover-cloud'){
        if(!body||Array.isArray(body)||Object.keys(body).length)return send(400,{error:'Recovery accepts no call IDs, paths or new authority.'});
        if(active.has(job.id))return send(409,{error:'An operation on this room is already active.'});
        if(job.cloudRecoveryStatus==='settled'||!job.cloudPending&&job.result&&
          !['submission-unknown','cancel-requested'].includes(job.status))return send(200,publicJob(job));
        if(job.status!=='submission-unknown'&&!(job.status==='cancel-requested'&&job.cloudPending===true))
          return send(409,{error:'No unresolved cloud call is eligible for recovery.'});
        await recoverCloud(job);return send(202,publicJob(await load(job.id,session.owner)));
      }
      if (action === 'cancel') {
        cancellations.add(job.id);
        job.shadoCancelRequested=!!job.shadoSubmissionStarted;
        const remote=unresolved(job);
        job.status = remote ? 'cancel-requested' : 'cancelled';
        job.message = remote ? 'Cancellation requested. Remote termination is not yet confirmed; late results will be discarded.' : 'Cancelled. No new stages will start.';
        // Existing generation delegation remains memory-only for status/stop.
        // The durable cancellation flag prevents every future submit.
        if(!['generation','recovery'].includes(shadoGrants.get(job.id)?.phase))shadoGrants.delete(job.id);
        job.shadoAuthorized=false;delete job.authorizationNonce;delete job.shadoUploadNonce;
        await persist(job);
        localControllers.get(job.id)?.abort();
        if(job.shadoTaskId)try {const {client}=await shadoClient(job);await client.stop();}catch{}
        if(process.env.EVA_ROOM_PYTHON)try {await cancelCloudCall(directory,job.id,job.pendingOperation??(job.boundary?'reconstruct':'analyze'));}catch{}
        return send(200,publicJob(await load(job.id,session.owner)));
      }
      if(action==='shado-status'){
        if(!job.shadoTaskId||!['shado-running','shado-submission-unknown','cancel-requested'].includes(job.status))return send(409,{error:'No recoverable Shado task.'});
        if(job.shadoCancelRequested){const {client}=await shadoClient(job);await client.stop();}
        await refreshShado(job);return send(200,publicJob(job));
      }
      if(action==='shado-invalidate'){
        if(Object.keys(body).some(k=>!['nonce','jobId','uploadNonce'].includes(k))||body.jobId!==job.id||
          !job.authorizationNonce||body.nonce!==job.authorizationNonce||body.uploadNonce!==job.shadoUploadNonce)
          return send(409,{error:'This authorization window is no longer current.'});
        shadoGrants.delete(job.id);delete job.authorizationNonce;delete job.shadoUploadNonce;delete job.shadoQuote;
        job.shadoAuthorized=false;job.status=job.shadoSubmissionStarted?'shado-submission-unknown':'awaiting-shado';
        job.message='Shado authorization was withdrawn or the account changed. Reconnect the same task before continuing.';
        await persist(job);return send(200,publicJob(job));
      }
      if(action==='authorize'){
        if(active.has(job.id)||!['awaiting-shado','awaiting-shado-generation','ready-shado-generation','shado-running','shado-submission-unknown','cancel-requested'].includes(job.status)||!job.boundary||
          (job.status==='cancel-requested'&&!job.shadoSubmissionStarted))
          return send(409,{error:'Confirm the room before authorizing Shado.'});
        const origin=new URL(process.env.EVA_SHADO_ORIGIN??'');
        if(origin.protocol!=='https:'||origin.origin!==process.env.EVA_SHADO_ORIGIN)throw Error('Configure the exact HTTPS Shado origin first.');
        job.shadoTaskId??=randomUUID();job.authorizationNonce=randomBytes(24).toString('hex');
        job.shadoInputsSealed=sealedShado(job);
        shadoGrants.delete(job.id);job.shadoAuthorized=false;delete job.shadoUploadNonce;
        await persist(job);
        return send(200,{origin:origin.origin,packet:{type:job.shadoSubmissionStarted?'eva-room-recovery-request':'eva-room-request',nonce:job.authorizationNonce,jobId:job.id,taskId:job.shadoTaskId,
          assets:job.images.map((p,i)=>({id:job.shadoFrozen?.assets[i]?.sourceId??`${job.id}-${p.id}`,sha256:p.sha256,size:p.bytes,mimeType:p.mime}))}});
      }
      if(action==='grant'){
        if(Object.keys(body).some(k=>!['type','nonce','jobId','uploadNonce','grant'].includes(k))||body.type!=='eva-room-grant'||
          !/^[a-f0-9]{64}$/.test(body.uploadNonce??'')||body.grant?.expiresAt<=now())throw Error('Invalid or expired Shado authorization.');
        if(active.has(job.id)||!['awaiting-shado','awaiting-shado-generation','ready-shado-generation','shado-running','shado-submission-unknown','cancel-requested'].includes(job.status)||!job.authorizationNonce||body.nonce!==job.authorizationNonce||
          body.jobId!==job.id||body.grant?.taskId!==job.shadoTaskId)throw Error('Shado authorization does not match this pending room.');
        if(job.shadoRecipeHash&&job.shadoRecipeHash!==body.grant.recipeHash)throw Error('Renewal must preserve the existing task recipe.');
        createShadoBridgeClient({origin:process.env.EVA_SHADO_ORIGIN,grant:body.grant,fetcher:shadoFetch,now});
        if(body.grant.assets?.length!==job.images.length||job.images.some((p,i)=>body.grant.assets[i]?.sha256!==p.sha256||body.grant.assets[i]?.size!==p.bytes||body.grant.assets[i]?.mimeType!==p.mime))throw Error('Authorization photos do not match.');
        const frozen={project:body.grant.project,nodeId:body.grant.nodeId,recipeHash:body.grant.recipeHash,assets:body.grant.assets};
        if(job.shadoFrozen&&JSON.stringify(job.shadoFrozen)!==JSON.stringify(frozen))throw Error('Renewal must preserve the frozen project and original asset versions.');
        if(body.grant.phase==='recovery'){
          if(!job.shadoSubmissionStarted||!job.shadoFrozen)throw Error('Recovery permission requires an existing submitted task.');
          shadoGrants.set(job.id,structuredClone(body.grant));delete job.authorizationNonce;delete job.shadoUploadNonce;
          job.shadoAuthorized=false;job.status=job.shadoCancelRequested?'cancel-requested':'shado-submission-unknown';
          job.message='Recovery-only access renewed for the existing task. Check or stop it; generation is not permitted.';
          await persist(job);return send(200,publicJob(job));
        }
        if(job.shadoSubmissionStarted)throw Error('A submitted task accepts recovery-only permission; another generation is forbidden.');
        if(body.grant.phase==='generation'){
          if(job.status!=='awaiting-shado-generation'||body.uploadNonce!==job.shadoUploadNonce||!job.shadoQuote||
            body.grant.quoteId!==job.shadoQuote.id||body.grant.maximumMicros!==job.shadoQuote.pricing.amountMicros||
            Date.parse(job.shadoQuote.expiresAt)<=now())throw Error('Generation permission must match the current sealed-input quote.');
          shadoGrants.set(job.id,structuredClone(body.grant));delete job.authorizationNonce;
          job.shadoAuthorized=true;job.status=job.shadoCancelRequested?'cancel-requested':job.shadoSubmissionStarted?'shado-submission-unknown':'ready-shado-generation';
          job.message=job.shadoSubmissionStarted?'Access renewed for the existing task. Check its status; no replacement generation was started.':
            'The exact generation quote is authorized. Continue to submit this one task.';
          await persist(job);return send(200,publicJob(job));
        }
        if(job.shadoUploadNonce)throw Error('This upload delegation has already been delivered. Reopen authorization to renew it.');
        job.shadoFrozen=frozen;job.shadoUploadNonce=body.uploadNonce;job.shadoRecipeHash=body.grant.recipeHash;
        shadoGrants.set(job.id,structuredClone(body.grant));
        await persist(job);await prepareShado(job);return send(202,publicJob(await load(job.id,session.owner)));
      }
      if (active.has(job.id) || ['cancelled','cancel-requested','submission-unknown'].includes(job.status)) return send(409,{error:'This job cannot start another stage.'});
      if(action==='complete-local'){
        if(job.status!=='awaiting-shado'||job.localCompletionStatus==='complete')return send(409,{error:'Confirm the room and finish other processing before local completion.'});
        await completeLocally(job);return send(202,publicJob(await load(job.id,session.owner)));
      }
      if(action==='shado'){
        if(job.status!=='ready-shado-generation'||!job.boundary||job.shadoSubmissionStarted||job.shadoCancelRequested)return send(409,{error:'A confirmed room and one current quote-bound generation permission are required.'});
        await startShado(job);return send(202,publicJob(await load(job.id,session.owner)));
      }
      if (action === 'analyze') {
        if (job.boundary||!['awaiting-analysis','awaiting-cloud-approval'].includes(job.status)) return send(409,{error:'Analysis has already been attempted.'});
        await cloud(job,'analyze'); return send(202,publicJob(await load(job.id,session.owner)));
      }
      if (action === 'boundary') {
        if (job.status !== 'review-boundary') return send(409,{error:'A real photo estimate is required before boundary review.'});
        if(Object.keys(body).some(k=>!['boundary','openings','confirmed'].includes(k))||body.confirmed!==true)throw Error('Confirm the room outline.');
        const b=validateBoundary(body.boundary);
        job.openings=validateOpenings(body.openings??[],b);
        job.boundary=b; job.status='awaiting-shado'; job.message='Boundary confirmed. Connect the scoped Shado bridge to request the comparison video.';
        await persist(job); return send(200,publicJob(job));
      }
      if (action === 'compare') {
        if(!['awaiting-comparison','awaiting-cloud-approval'].includes(job.status))return send(409,{error:'This comparison cannot be submitted again.'});
        if (!job.boundary) return send(409,{error:'Confirm the room boundary first.'});
        // No fake video or silently omitted B condition.
        if (!job.generatedImages?.length&&!job.generatedVideo) return send(409,{error:'An authenticated Shado video and admitted frames are required. The service bridge must be activated first.'});
        await cloud(job,'reconstruct'); return send(202,publicJob(await load(job.id,session.owner)));
      }
      return send(404,{error:'Not found.'});
    } catch (error) { send(400,{error: error?.code === 'ENOENT' ? 'Room not found.' : (error instanceof SyntaxError ? 'Invalid JSON.' : String(error.message).slice(0,240))}); }
    finally {unlock?.();}
  });
  await expire();
  const expiryTimer=setInterval(()=>void expire().catch(()=>{}),60000);expiryTimer.unref();
  server.once('close',()=>clearInterval(expiryTimer));
  return { server, wait: () => Promise.all(tasks.values()), directory, expire };
}
async function runLocalCompletion(bytes,id,directory,signal) {
  const attempt=randomUUID(),requestPath=join(directory,`${id}-completion-${attempt}-request.json`),
    responsePath=join(directory,`${id}-completion-${attempt}-result.json`);
  signal.throwIfAborted();let exited=false;
  await writeFile(requestPath,bytes,{mode:0o600,flag:'wx'});
  try {
    await new Promise((accept,reject)=>{
      const child=spawn(process.env.EVA_ROOM_COMPLETION_PYTHON,[join(root,'scripts/room_workflow/completion_client.py'),
        '--request',requestPath,'--response',responsePath,'--timeout-seconds','150'],
        {cwd:root,windowsHide:true,shell:false,stdio:'ignore',detached:process.platform!=='win32'});
      let stopping=false,terminationTimer;
      const stop=()=>{
        if(stopping||exited)return;stopping=true;
        void terminateProcessTree(child).catch(()=>{});
        terminationTimer=setTimeout(()=>{const error=Error('Local process termination is unconfirmed.');error.code='termination-unconfirmed';reject(error);},10000);
      };
      const timeout=setTimeout(stop,170000);
      signal.addEventListener('abort',stop,{once:true});
      if(signal.aborted)stop();
      const clear=()=>{clearTimeout(timeout);clearTimeout(terminationTimer);signal.removeEventListener('abort',stop);};
      child.once('error',e=>{exited=true;clear();reject(e);});
      child.once('exit',code=>{exited=true;clear();code===0&&!signal.aborted&&!stopping?accept():reject(Error('Local completion worker stopped or failed.'));});
    });
    if((await stat(responsePath)).size>64*1024**2)throw Error('Local completion output exceeds 64 MiB.');
    return JSON.parse(await readFile(responsePath,'utf8'));
  } finally {
    if(exited){await rm(requestPath,{force:true});await rm(responsePath,{force:true});}
  }
}
async function cancelCloudCall(directory,id,operation) {
  if(!['analyze','reconstruct'].includes(operation))return;
  const receipt=join(directory,`${id}-${operation}-request.receipt.json`);
  await readFile(receipt);
  await new Promise((accept,reject)=>{
    const child=spawn(process.env.EVA_ROOM_PYTHON,[join(root,'scripts/room_workflow/cloud_client.py'),'--cancel-receipt',receipt],
      {cwd:root,windowsHide:true,stdio:'ignore',shell:false});
    const timer=setTimeout(()=>{child.kill();reject(Error('Cancellation unconfirmed.'));},15000);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',code=>{clearTimeout(timer);code===0?accept():reject(Error('Cancellation unconfirmed.'));});
  });
}
export async function runCloudClient(payload,directory,maxSeconds,{signal,onLaunch,readRequest=readFile,launch=spawn}={}) {
  const requestPath = join(directory,`${payload.job_id}-${payload.operation}-request.json`);
  const resultPath = join(directory,`${payload.job_id}-${payload.operation}-result.json`);
  if((await readRequest(requestPath,'utf8'))!==JSON.stringify(payload))throw Error('The preserved cloud request changed.');
  if(signal?.aborted){const error=Error('Cancelled before cloud process launch.');error.code='cloud-not-submitted';throw error;}
  let processStopped=false;
  try {
    await new Promise((accept,reject) => {
      let child;
      try {
        child=launch(process.env.EVA_ROOM_PYTHON,[join(root,'scripts/room_workflow/cloud_client.py'),'--request',requestPath,'--response',resultPath,'--confirm-billable'],
          { cwd:root,windowsHide:true,stdio:'ignore',shell:false });
      } catch(error) {processStopped=true;throw error;}
      onLaunch?.();
      const timer = setTimeout(()=>{child.kill();void cancelCloudCall(directory,payload.job_id,payload.operation).catch(()=>{});reject(Error('Cloud deadline expired.'));},(maxSeconds+60)*1000);
      child.once('error',e=>{processStopped=!child.pid;clearTimeout(timer);reject(e);});
      // A failed worker may still return a definitive, inspectable result.
      child.once('exit',()=>{processStopped=true;clearTimeout(timer);accept();});
    });
    if((await stat(resultPath)).size>64*1024**2)throw Error('Result exceeds its limit.');
    const bytes = await readFile(resultPath); if (bytes.length>64*1024**2) throw Error('Result exceeds its limit.');
    return JSON.parse(bytes.toString('utf8'));
  } catch(error) {
    // The helper reserves before submission; even a null-call receipt is uncertain.
    if(processStopped)try{await stat(join(directory,`${payload.job_id}-${payload.operation}-request.receipt.json`));}
      catch(receiptError){if(receiptError.code==='ENOENT')error.code='cloud-not-submitted';}
    throw error;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {server}=await createBroker(); server.listen(1442,'127.0.0.1',()=>process.stdout.write('EVA private room intake: http://127.0.0.1:1442\n'));
}
