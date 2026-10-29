import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';

import {verifyRetirement} from './crime-scene-retirement.mjs';
const target='.local/reconstruction/ffs-th0028-objects-v2/returned/models/tag-18.glb';
const source='.local/reconstruction/ffs-th0028-media-v1/source.jpg';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'eva-retirement-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const entries=[];
  for(const [path,classification,body,key] of [[target,'delete-payload','candidate','models/tag-18.glb'],[source,'preserve','original','photos/source.jpg']]){
    await mkdir(dirname(join(root,path)),{recursive:true});
    await writeFile(join(root,path),body);
    entries.push({path,classification,sha256:sha(body),bytes:Buffer.byteLength(body),catalog_keys:[key],cutover_task:classification==='preserve'?null:5,reason:classification==='preserve'?'Original evidence':'Superseded generated candidate'});
  }
  const catalog=Object.fromEntries(entries.map(entry=>[entry.catalog_keys[0],{path:entry.path,sha256:entry.sha256,bytes:entry.bytes,type:'application/octet-stream'}]));
  return {root,entries,catalog};
}

test('retirement verification is read-only and binds all preserved and candidate bytes',async t=>{
  const {root,entries,catalog}=await fixture(t);
  assert.deepEqual(await verifyRetirement(entries,{root,catalog}),{verified:2,removed:0});
  assert.equal(await readFile(join(root,target),'utf8'),'candidate');
  assert.equal(await readFile(join(root,source),'utf8'),'original');
});

test('changed candidate or preserved evidence blocks the manifest even at the same byte length',async t=>{
  const {root,entries,catalog}=await fixture(t);
  for(const path of [target,source]){
    const original=await readFile(join(root,path));
    await writeFile(join(root,path),Buffer.alloc(original.length,120));
    await assert.rejects(verifyRetirement(entries,{root,catalog}),/hash|changed/i);
    await writeFile(join(root,path),original);
  }
});

test('unknown fields, duplicate paths, traversal and unsupported delete targets are rejected',async t=>{
  const {root,entries,catalog}=await fixture(t);
  for(const entry of [
    {...entries[0],approved:true},
    {...entries[0],path:'../outside.glb'},
    {...entries[0],path:'C:/outside.glb'},
    {...entries[0],path:target.replaceAll('/','\\')},
    {...entries[0],path:'.local/reconstruction/ffs-th0028-objects-v2/returned/models/tag-18.glb.'},
    {...entries[0],bytes:-1},
    {...entries[0],bytes:Infinity},
    {...entries[0],sha256:'bad'},
    {...entries[0],catalog_keys:['models/tag-18.glb','models/tag-18.glb']},
    {...entries[0],cutover_task:1},
    {...entries[1],classification:'delete-payload',cutover_task:5},
  ])await assert.rejects(verifyRetirement([entry,entries[1]],{root,catalog}),/manifest|path|target/i);
  await assert.rejects(verifyRetirement([...entries,entries[0]],{root,catalog}),/duplicate/i);
});

test('removed candidates require catalog migration; preserved files can never be declared removed',async t=>{
  const {root,entries,catalog}=await fixture(t);
  await assert.rejects(verifyRetirement(entries,{root,catalog,removed:[source]}),/preserv|remov/i);
  await assert.rejects(verifyRetirement(entries,{root,catalog:{'photos/source.jpg':catalog['photos/source.jpg']},removed:[target]}),/exist|remov/i);
  await rm(join(root,target));
  await assert.rejects(verifyRetirement(entries,{root,catalog}),/missing|ENOENT/i);
  await assert.rejects(verifyRetirement(entries,{root,catalog,removed:[target]}),/catalog/i);
  delete catalog['models/tag-18.glb'];
  assert.deepEqual(await verifyRetirement(entries,{root,catalog,removed:[target]}),{verified:1,removed:1});
  await assert.rejects(verifyRetirement(entries,{root,catalog,removed:[target,target]}),/duplicate/i);
  await assert.rejects(verifyRetirement(entries,{root,catalog,removed:['missing.glb']}),/manifest|remov/i);
});

test('changed catalog hashes, alias references and uncatalogued payloads cannot escape inspection',async t=>{
  const {root,entries,catalog}=await fixture(t);
  await assert.rejects(verifyRetirement(entries,{root,catalog:{...catalog,'models/tag-18.glb':{...catalog['models/tag-18.glb'],sha256:'0'.repeat(64)}}}),/catalog/i);
  await assert.rejects(verifyRetirement(entries,{root,catalog:{...catalog,'alias.glb':catalog['models/tag-18.glb']}}),/catalog/i);
  await assert.rejects(verifyRetirement(entries,{root,catalog:{...catalog,'unlisted.glb':{...catalog['models/tag-18.glb'],path:'.local/unlisted.glb'}}}),/catalog/i);
});

test('preserved evidence must retain its catalog keys while candidate keys may retire',async t=>{
  const {root,entries,catalog}=await fixture(t);
  const migrated={...catalog};
  delete migrated['models/tag-18.glb'];
  assert.deepEqual(await verifyRetirement(entries,{root,catalog:migrated}),{verified:2,removed:0});
  delete migrated['photos/source.jpg'];
  await assert.rejects(verifyRetirement(entries,{root,catalog:migrated}),/preserv.*catalog/i);
});

test('ancestor directory links cannot redirect a preservation or retirement check',async t=>{
  const {root,entries,catalog}=await fixture(t);
  const original=join(root,source),outside=join(root,'outside');
  await mkdir(outside);
  await writeFile(join(outside,'source.jpg'),'original');
  await rm(dirname(original),{recursive:true});
  await symlink(outside,dirname(original),process.platform==='win32'?'junction':'dir');
  await assert.rejects(verifyRetirement(entries,{root,catalog}),/link/i);
});
