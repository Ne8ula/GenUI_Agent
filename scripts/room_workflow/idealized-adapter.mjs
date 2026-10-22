/** Private CPU assembly and regenerated-geometry admission; never review authority. */
import {readFile,writeFile,lstat,rm} from 'node:fs/promises';
import {invokeCpuReview as invoke} from './cpu-review-worker.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {validateIdealizedResult,idealizedDigest} from './idealized-result.mjs';
import {idealizationSourcePaths} from './benchmark.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const expectedKeys=['job_id','bindings','parent_revision','boundary','openings','inventory'];
const metadataLimit=16*1024**2,outputLimit=64*1024**2;
function encode(value){
  const bytes=JSON.stringify(value);
  if(typeof bytes!=='string'||Buffer.byteLength(bytes)>metadataLimit)throw Error('Idealization input exceeds its metadata budget.');
  return bytes;
}
async function boundedFile(path,limit){
  const info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size>limit)throw Error('Invalid idealization file or byte budget.');
  const bytes=await readFile(path);
  if(bytes.length>limit)throw Error('Idealization file exceeds its byte budget.');
  return bytes;
}
export async function readIdealizedCandidate(directory,expected,options={}){
  options.signal?.throwIfAborted();
  directory=resolve(directory);
  const info=await lstat(directory);
  if(!info.isDirectory()||info.isSymbolicLink())throw Error('Invalid private candidate directory.');
  const requestPath=directory+'-verify-'+randomUUID()+'.json';
  await writeFile(requestPath,encode(expected),{flag:'wx',mode:0o600});
  let uncertain=false;
  try{
    const report=await invoke(['--input',requestPath,'--verify',directory],options);
    const manifest=JSON.parse(await boundedFile(join(directory,'manifest.json'),1024));
    const bytes=await boundedFile(join(directory,'candidate.json'),outputLimit-1024);
    if(!manifest||Object.keys(manifest).sort().join(',')!=='candidate_sha256,revision,version'||manifest.version!==1||
      hash(bytes)!==manifest.candidate_sha256||manifest.revision!==report.revision)throw Error('Candidate changed after Python geometry admission.');
    const value=validateIdealizedResult(JSON.parse(bytes),expected);
    if(value.revision!==report.revision||value.inventory.filter(obj=>!obj.omitted).length!==report.objects)
      throw Error('Candidate changed after Python geometry admission.');
    options.signal?.throwIfAborted();
    return value;
  }catch(error){uncertain=error?.code==='termination-unconfirmed';throw error;}
  finally{if(!uncertain)await rm(requestPath,{force:true});}
}

export async function prepareIdealizationInputs(source,review,{sourcePath,outputDirectory,paths=idealizationSourcePaths,...options}={}){
  options.signal?.throwIfAborted();
  const before=await boundedFile(sourcePath,128*1024**2);
  if(idealizedDigest(JSON.parse(before))!==idealizedDigest(source))throw Error('Imported source changed before preparation.');
  const requestPath=outputDirectory+'-review.json',outputPath=outputDirectory+'-prepared.json',bytes=encode(review);
  if(Buffer.byteLength(bytes)>65536)throw Error('Preparation review exceeds 64 KiB.');
  await writeFile(requestPath,bytes,{flag:'wx',mode:0o600});
  const args=['--source-snapshot',sourcePath,'--review',requestPath,'--output',outputPath,
    ...['result','request','raw-directory','candidate-directory','suggestions'].flatMap(key=>['--'+key,paths[key]])];
  const report=await invoke(args,options,'idealized_prepare.py');
  const value=JSON.parse(await boundedFile(outputPath,metadataLimit));
  if(idealizedDigest(value)!==report.revision||!Array.isArray(value.inventory)||
    value.inventory.filter(obj=>!obj.omitted).length!==report.objects||
    !before.equals(await boundedFile(sourcePath,128*1024**2)))throw Error('Prepared input or imported source changed.');
  return value;
}

export async function deriveIdealizedCorrection(inventory,correction,{outputPath,...options}={}){
  options.signal?.throwIfAborted();
  const bytes=encode({inventory,correction}),requestPath=outputPath+'-request.json';
  await writeFile(requestPath,bytes,{flag:'wx',mode:0o600});
  const report=await invoke(['--input',requestPath,'--correct',outputPath],options);
  const value=JSON.parse(await boundedFile(outputPath,metadataLimit));
  if(!Array.isArray(value)||value.length>64||idealizedDigest(value)!==report.revision||
    value.filter(obj=>!obj.omitted).length!==report.objects)throw Error('Corrected inventory changed after derivation.');
  return value;
}

export async function runIdealization(envelope,{outputDirectory,inputSha256,...options}={}){
  options.signal?.throwIfAborted();
  const bytes=encode(envelope);
  if(hash(bytes)!==inputSha256)throw Error('Idealization input fingerprint changed.');
  const expected=Object.fromEntries(expectedKeys.map(key=>[key,structuredClone(envelope[key])]));
  const requestPath=outputDirectory+'-request.json';
  await writeFile(requestPath,bytes,{flag:'wx',mode:0o600});
  const report=await invoke(['--input',requestPath,'--output',outputDirectory],options);
  const value=await readIdealizedCandidate(outputDirectory,expected,options);
  if(value.revision!==report.revision)throw Error('Assembly changed before reopen.');
  return value;
}
