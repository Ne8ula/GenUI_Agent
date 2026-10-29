/** Read-only cutover check. A passing snapshot never authorizes deletion or prevents later edits. */
import {lstat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';

const PAYLOADS=new Set([13,18,69].map(tag=>`.local/reconstruction/ffs-th0028-objects-v2/returned/models/tag-${tag}.glb`));
const CODE=new Set(['scripts/room_workflow/ffs_objects_cloud.py','scripts/room_workflow/test_ffs_objects_cloud.py']);
const fields='bytes,catalog_keys,classification,cutover_task,path,reason,sha256';
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const portable=value=>typeof value==='string'&&value.length<=512&&value.split('/').every(part=>/^[\w.-]+$/.test(part)&&part!=='.'&&part!=='..'&&!part.endsWith('.'));

async function noLinks(root,path){
  let current=resolve(root);
  const base=await lstat(current);
  if(!base.isDirectory()||base.isSymbolicLink())throw Error('Manifest root must not be a link.');
  for(const part of path.split('/')){
    current=join(current,part);
    const info=await lstat(current);
    if(info.isSymbolicLink())throw Error(`Manifest path contains a link: ${path}`);
  }
  return current;
}

export async function verifyRetirement(entries,{root,catalog,removed=[]}){
  if(!Array.isArray(entries)||!entries.length||entries.length>2048||!record(catalog)||!Array.isArray(removed))throw Error('Invalid retirement manifest.');
  const byPath=new Map(),catalogKeys=new Set();
  let total=0;
  for(const entry of entries){
    if(!record(entry)||Object.keys(entry).sort().join(',')!==fields||!portable(entry.path)||
      !['delete-payload','retire-code','preserve'].includes(entry.classification)||
      typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)||
      !Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>256*1024**2||
      typeof entry.reason!=='string'||!entry.reason.trim()||entry.reason.length>500||
      !Array.isArray(entry.catalog_keys)||entry.catalog_keys.length>100||entry.catalog_keys.some(key=>!portable(key)))throw Error('Invalid retirement manifest entry.');
    if(byPath.has(entry.path))throw Error(`Duplicate manifest path: ${entry.path}`);
    if(entry.classification==='delete-payload'&&(!PAYLOADS.has(entry.path)||entry.cutover_task!==5)||
      entry.classification==='retire-code'&&(!CODE.has(entry.path)||entry.cutover_task!==3)||
      entry.classification==='preserve'&&entry.cutover_task!==null)throw Error('Unsupported retirement target or manifest cutover task.');
    for(const key of entry.catalog_keys){
      if(catalogKeys.has(key))throw Error('Duplicate manifest catalog key.');
      catalogKeys.add(key);
    }
    total+=entry.bytes;
    if(total>1024**3)throw Error('Manifest inspection exceeds the one GiB bound.');
    byPath.set(entry.path,entry);
  }
  const missing=new Set(removed);
  if(missing.size!==removed.length)throw Error('Duplicate removed path.');
  for(const path of missing)if(!byPath.has(path)||byPath.get(path).classification==='preserve')throw Error('Removed path is absent from manifest or is preserved.');
  for(const [key,entry] of Object.entries(catalog)){
    const expected=record(entry)&&byPath.get(entry.path);
    if(!expected||missing.has(entry.path)||!expected.catalog_keys.includes(key)||
      entry.sha256!==expected.sha256||entry.bytes!==expected.bytes)throw Error(`Catalog entry disagrees with the manifest: ${key}`);
  }
  for(const entry of entries)if(entry.classification==='preserve'){
    for(const key of entry.catalog_keys)if(!Object.hasOwn(catalog,key))throw Error(`Preserved catalog key is missing: ${key}`);
  }
  let verified=0;
  for(const entry of entries){
    if(missing.has(entry.path)){
      try{await noLinks(root,entry.path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      throw Error(`Declared removed file still exists: ${entry.path}`);
    }
    const path=await noLinks(root,entry.path),file=await open(path,'r');
    try{
      const before=await file.stat();
      if(!before.isFile()||before.size!==entry.bytes)throw Error(`Manifest file size changed: ${entry.path}`);
      const hash=createHash('sha256');let bytes=0;
      for await(const block of file.createReadStream({autoClose:false,highWaterMark:1024**2})){
        bytes+=block.length;
        if(bytes>entry.bytes)throw Error(`Manifest file grew: ${entry.path}`);
        hash.update(block);
      }
      const after=await file.stat(),named=await lstat(await noLinks(root,entry.path));
      if(bytes!==entry.bytes||hash.digest('hex')!==entry.sha256||
        ['size','mtimeMs','ctimeMs','ino','dev'].some(key=>before[key]!==after[key]||after[key]!==named[key]))throw Error(`Manifest hash or file changed: ${entry.path}`);
      verified++;
    }finally{await file.close();}
  }
  return {verified,removed:missing.size};
}
