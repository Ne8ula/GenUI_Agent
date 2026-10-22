/** Bounded CPU admission before any allowance or cloud submission is consumed. */
import {stat,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const keys=(v,list)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===list.sort().join(',');
export function validateImagePreflight(report,request,digest){
  if(!keys(report,['version','job_id','request_sha256','status','images'])||report.version!==1||
    report.job_id!==request.job_id||report.request_sha256!==digest||report.status!=='valid-original-photos'||
    !Array.isArray(report.images)||report.images.length!==request.images.length)throw Error('Image admission report does not match the original request.');
  const pixels=new Set();
  for(let i=0;i<report.images.length;i++){
    const photo=report.images[i];
    if(!keys(photo,['id','sha256','width','height','normalized_pixels_sha256'])||photo.id!==request.images[i].id||
      photo.sha256!==request.images[i].sha256||!Number.isSafeInteger(photo.width)||!Number.isSafeInteger(photo.height)||
      Math.min(photo.width,photo.height)<32||Math.max(photo.width,photo.height)>8192||photo.width*photo.height>24000000||
      !/^[a-f0-9]{64}$/.test(photo.normalized_pixels_sha256)||pixels.has(photo.normalized_pixels_sha256))
      throw Error('Image admission dimensions, identity or uniqueness failed.');
    pixels.add(photo.normalized_pixels_sha256);
  }
  return report;
}
export async function runImagePreflight(requestPath,outputPath,{signal,terminate,python=process.env.EVA_ROOM_COMPLETION_PYTHON,
  launch=spawn,timeoutMs=30000}={}){
  if(!python)throw Error('Configure the local CPU image preflight before cloud processing.');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||typeof terminate!=='function')throw Error('Image preflight requires bounded termination.');
  signal?.throwIfAborted();
  await new Promise((accept,reject)=>{
    const child=launch(python,[join(root,'scripts/room_workflow/image_preflight.py'),'--request',requestPath,'--output',outputPath],
      {cwd:root,windowsHide:true,shell:false,stdio:'ignore',detached:process.platform!=='win32'});
    let stopped=false,exited=false,terminationTimer;
    const stop=()=>{
      if(stopped||exited)return;stopped=true;
      terminationTimer=setTimeout(()=>{
        const error=Error('Image preflight process termination is unconfirmed.');error.code='termination-unconfirmed';reject(error);
      },10000);
      void terminate(child).catch(()=>{});
    };
    const timer=setTimeout(stop,timeoutMs);
    signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
    const clear=()=>{clearTimeout(timer);clearTimeout(terminationTimer);signal?.removeEventListener('abort',stop);};
    child.once('error',error=>{exited=true;clear();reject(error);});
    child.once('exit',code=>{exited=true;clear();code===0&&!stopped?accept():reject(Error('Image preflight failed, timed out or was cancelled.'));});
  });
  if((await stat(outputPath)).size>65536)throw Error('Image admission report exceeds 64 KiB.');
  const bytes=await readFile(outputPath);
  if(bytes.length>65536)throw Error('Image admission report exceeds 64 KiB.');
  return JSON.parse(bytes);
}
