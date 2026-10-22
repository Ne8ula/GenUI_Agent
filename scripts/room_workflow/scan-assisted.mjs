/** Private scan replay only; no source registration, review authority or HTTP route. */
import {lstat,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {idealizedDigest} from './idealized-result.mjs';
import {invokeCpuReview} from './cpu-review-worker.mjs';

const privateRoot=fileURLToPath(new URL('../../.local/reconstruction',import.meta.url));
const expectedKeys=['frame_sha256','inventory_sha256','parent_revision','recipe_sha256','review_sha256','revision','source_sha256'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const limit=64*1024**2;

async function privatePath(path,root){
  if(typeof path!=='string'||path.split(/[\\/]/).includes('..'))throw Error('Invalid private scan path.');
  const absolute=resolve(path),rel=relative(root,absolute);
  if(rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel))throw Error('Scan path outside private root.');
  for(let part=absolute;;part=dirname(part)){
    const info=await lstat(part);
    if(info.isSymbolicLink())throw Error('Linked scan path.');
    if(part===dirname(part))break;
  }
  return absolute;
}
async function boundedFile(path,root,cap){
  await privatePath(path,root);
  const info=await lstat(path);
  if(!info.isFile()||info.nlink!==1||info.size>cap)throw Error('Invalid scan file or byte budget.');
  const bytes=await readFile(path);
  if(bytes.length>cap)throw Error('Scan file exceeds byte budget.');
  return bytes;
}

async function workerState(receiptPath,root){
  const locked=await lstat(join(root,'.scan-cpu.lock')).then(()=>true,error=>{
    if(error.code==='ENOENT')return false;throw error;
  });
  let receipt=null;
  try{receipt=JSON.parse(await boundedFile(receiptPath,root,4096));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  return {receipt,settled:!locked&&receipt?.status==='settled',notStarted:!locked&&receipt===null};
}

export async function readScanCandidate(directory,expected,{rootDirectory=privateRoot,...options}={}){
  options.signal?.throwIfAborted();
  if(!expected||Object.keys(expected).sort().join(',')!==expectedKeys.join(',')||
    expectedKeys.some(key=>key==='parent_revision'&&expected[key]===null?false:!/^([a-f0-9]{64})$/.test(expected[key])))
    throw Error('Invalid exact scan host binding.');
  const binding=structuredClone(expected),root=resolve(rootDirectory);
  directory=await privatePath(directory,root);
  const snapshot={};let total=0;
  for(const name of ['manifest.json','candidate.json','recipe.json']){
    const bytes=await boundedFile(join(directory,name),root,name==='manifest.json'?1024:limit-1024);
    total+=bytes.length;snapshot[name]=hash(bytes);
  }
  if(total>limit)throw Error('Combined scan persistence budget exceeded.');
  const id=randomUUID(),requestPath=join(root,id+'.expected.json'),receiptPath=join(root,id+'.resources.json');
  const lockPath=join(root,'.scan-worker.lock');
  await writeFile(lockPath,JSON.stringify({id,requestPath,receiptPath}),{flag:'wx',mode:0o600});
  let launched=false,settled=false;
  try{
    await writeFile(requestPath,JSON.stringify(binding),{flag:'wx',mode:0o600});
    launched=true;
    const report=await invokeCpuReview(['--operation','verify','--input',directory,'--expected',requestPath,
      '--receipt',receiptPath],options,'cpu_review_worker.py');
    const state=await workerState(receiptPath,root),receipt=state.receipt;
    settled=state.settled;
    if(!settled||receipt.outcome!=='passed'||!Number.isFinite(receipt.peak_rss_bytes)||receipt.peak_rss_bytes<=0||
      receipt.peak_rss_bytes>768*1024**2||!Number.isFinite(receipt.min_available_bytes)||receipt.min_available_bytes<2*1024**3||
      !Number.isFinite(receipt.elapsed_seconds)||receipt.elapsed_seconds>150)throw Error('Scan resource admission failed.');
    let value;
    for(const [name,before] of Object.entries(snapshot)){
      const bytes=await boundedFile(join(directory,name),root,name==='manifest.json'?1024:limit-1024);
      if(hash(bytes)!==before)throw Error('Scan files changed during verification.');
      if(name==='candidate.json')value=JSON.parse(bytes);
    }
    const {revision,...content}=value;
    if(idealizedDigest(content)!==revision||revision!==report.revision||value.kind!=='eva-scan-room-v1'||value.mode!=='scan-assisted'||
      expectedKeys.some(key=>key!=='recipe_sha256'&&value[key]!==binding[key])||
      value.objects.filter(object=>object.disposition==='retain').length!==report.objects)
      throw Error('Scan candidate differs from verified host binding.');
    options.signal?.throwIfAborted();
    return value;
  }catch(error){
    if(launched&&!settled){
      try{
        const state=await workerState(receiptPath,root);
        settled=state.settled||(state.notStarted&&error?.code!=='termination-unconfirmed');
      }catch{}
      if(!settled){const uncertain=Error('Scan worker termination is unconfirmed; retained lock requires cleanup verification.',{cause:error});
        uncertain.code='termination-unconfirmed';throw uncertain;}
    }
    throw error;
  }finally{
    if(!launched||settled){await rm(lockPath);}
  }
}
