/** Existing-call recovery only. Paths originate in the private job store. */
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateWorkerResult,canonical} from './result.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const MAX_RESULT=64*1024**2,MAX_ENVELOPE=MAX_RESULT+4096,MAX_REQUEST=150*1024**2;
const receiptFields=new Set(['version','job_id','modal_call_id','request_sha256','status','retry_policy',
  'client_get_timeout_seconds','wait_error_type','cancellation','cancellation_error_type','result_sha256']);
const receiptStatuses=new Set(['complete','partial','failed','submission-started','submitted','result-unavailable',
  'cancellation-requested','cancellation-request-failed']);
export const receiptCancelled=receipt=>typeof receipt?.status==='string'&&receipt.status.startsWith('cancellation-')||
  typeof receipt?.cancellation==='string';
async function bounded(path,max) {
  if((await stat(path)).size>max)throw Error('Cloud recovery artifact exceeds its resource limit.');
  const bytes=await readFile(path);
  if(bytes.length>max)throw Error('Cloud recovery artifact exceeds its resource limit.');
  return bytes;
}
export async function recoveryInputs(directory,job,expected) {
  if(!['analyze','reconstruct'].includes(job.pendingOperation)||job.pendingOperation!==expected.operation)
    throw Error('The original cloud operation is not recorded; retain this unresolved job.');
  const requestPath=join(directory,`${job.id}-${job.pendingOperation}-request.json`);
  const receiptPath=join(directory,`${job.id}-${job.pendingOperation}-request.receipt.json`);
  let bytes;
  try{bytes=await bounded(requestPath,MAX_REQUEST);}catch(error){
    if(error.code==='ENOENT')throw Error('The exact original request is missing. This legacy cloud call remains unresolved; no request was regenerated.');
    throw error;
  }
  const request=JSON.parse(bytes),requestSha256=sha(bytes);
  if(requestSha256!==job.requestSha256||canonical(request)!==canonical(expected))
    throw Error('The preserved cloud request does not match this frozen job.');
  const receiptBytes=await bounded(receiptPath,65536),receipt=JSON.parse(receiptBytes);
  if(!receipt||Array.isArray(receipt)||Object.keys(receipt).some(k=>!receiptFields.has(k))||!receiptStatuses.has(receipt.status)||
    receipt.version!==1||receipt.job_id!==job.id||receipt.request_sha256!==requestSha256||
    typeof receipt.modal_call_id!=='string'||!/^fc-[A-Za-z0-9_-]{1,125}$/.test(receipt.modal_call_id))
    throw Error('The existing receipt is not bound to this job and request.');
  if(job.cloudCallId&&job.cloudCallId!==receipt.modal_call_id)throw Error('The original cloud call identity changed.');
  return {requestPath,receiptPath,request,requestSha256,receiptSha256:sha(receiptBytes),receipt,modalCallId:receipt.modal_call_id};
}
export function validateRecovery(value,input) {
  const keys=['version','artifact_type','job_id','operation','request_sha256','receipt_sha256','modal_call_id','status','result','error_type','cancellation_requested'];
  if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!==keys.sort().join(',')||
    value.version!==1||value.artifact_type!=='eva-room-cloud-recovery-v1'||value.job_id!==input.request.job_id||
    value.operation!==input.request.operation||value.request_sha256!==input.requestSha256||
    value.receipt_sha256!==input.receiptSha256||value.modal_call_id!==input.modalCallId||
    !['result-available','pending','unavailable'].includes(value.status)||value.cancellation_requested!==receiptCancelled(input.receipt)||
    !(value.error_type===null||typeof value.error_type==='string'&&/^[A-Za-z_][A-Za-z0-9_.]{0,127}$/.test(value.error_type)))
    throw Error('Cloud recovery response is malformed or bound to a different call.');
  if(value.status==='result-available'){
    if(value.error_type!==null)throw Error('A recovered result cannot also report an unavailable call.');
    if(Buffer.byteLength(JSON.stringify(value.result))>MAX_RESULT)throw Error('Recovered result exceeds its resource limit.');
    validateWorkerResult(value.result,input.request);
    if(['complete','partial','failed'].includes(input.receipt.status)&&input.receipt.status!==value.result.status)
      throw Error('Recovered result contradicts the definitive original receipt.');
  }else if(value.result!==null)throw Error('An unresolved cloud call cannot admit geometry.');
  return value;
}
export async function runRecoveryClient(input,outputPath,{python=process.env.EVA_ROOM_PYTHON,launch=spawn,terminate,timeoutMs=30000}={}) {
  if(!python)throw Error('The existing-call recovery client is not configured.');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||typeof terminate!=='function')
    throw Error('Recovery requires bounded process termination.');
  await new Promise((accept,reject)=>{
    const child=launch(python,[join(root,'scripts/room_workflow/cloud_client.py'),'--recover-receipt',input.receiptPath,
      '--request',input.requestPath,'--output',outputPath],{cwd:root,windowsHide:true,shell:false,stdio:'ignore',detached:process.platform!=='win32'});
    let stopped=false,exit=false,terminationTimer;
    const stop=()=>{
      if(stopped||exit)return;stopped=true;
      terminationTimer=setTimeout(()=>reject(Error('Recovery helper termination is unconfirmed; the remote call remains unresolved.')),10000);
      void terminate(child).catch(()=>{});
    };
    const timer=setTimeout(stop,timeoutMs);
    const clear=()=>{clearTimeout(timer);clearTimeout(terminationTimer);};
    child.once('error',error=>{exit=true;clear();reject(error);});
    child.once('exit',code=>{exit=true;clear();code===0&&!stopped?accept():reject(Error('Recovery helper failed or timed out; no remote state was inferred.'));});
  });
  return JSON.parse(await bounded(outputPath,MAX_ENVELOPE));
}
