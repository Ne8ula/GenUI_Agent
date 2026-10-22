import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../../',import.meta.url));

export async function invokeCpuReview(args,{signal,terminate,python=process.env.EVA_ROOM_COMPLETION_PYTHON,launch=spawn,timeoutMs=150000}={},script='idealized_room.py'){
  if(!['idealized_room.py','idealized_prepare.py','cpu_review_worker.py'].includes(script))throw Error('Unknown CPU review entrypoint.');
  if(!python||typeof terminate!=='function')throw Error('Configure the CPU idealization adapter and bounded termination.');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>150000)throw Error('Invalid idealization deadline.');
  signal?.throwIfAborted();
  const report=await new Promise((accept,reject)=>{
    const child=launch(python,[...(script==='cpu_review_worker.py'?['-I']:[]),join(root,'scripts/room_workflow',script),...args],
      {cwd:root,windowsHide:true,shell:false,stdio:['ignore','pipe','ignore'],detached:process.platform!=='win32'});
    let stopped=false,exited=false,terminationTimer,length=0;
    const chunks=[];
    const clear=()=>{clearTimeout(timer);clearTimeout(terminationTimer);signal?.removeEventListener('abort',stop);};
    const stop=()=>{
      if(stopped||exited)return;stopped=true;
      terminationTimer=setTimeout(()=>{
        clear();const error=Error('Idealization process termination is unconfirmed.');error.code='termination-unconfirmed';reject(error);
      },10000);
      void terminate(child).catch(()=>{});
    };
    const timer=setTimeout(stop,timeoutMs);
    child.stdout.on('data',chunk=>{length+=chunk.length;if(length>65536)stop();else chunks.push(chunk);});
    child.once('error',error=>{exited=true;clear();reject(error);});
    child.once('close',code=>{exited=true;clear();code===0&&!stopped&&!signal?.aborted?
      accept(Buffer.concat(chunks)):reject(Error('CPU idealization failed, timed out or was cancelled.'));});
    signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  });
  signal?.throwIfAborted();
  const value=JSON.parse(report);
  if(!value||Object.keys(value).sort().join(',')!=='objects,revision,status'||value.status!=='needs-review'||
    typeof value.revision!=='string'||!/^[a-f0-9]{64}$/.test(value.revision)||
    !Number.isInteger(value.objects)||value.objects<0||value.objects>64)throw Error('Invalid CPU idealization report.');
  return value;
}
