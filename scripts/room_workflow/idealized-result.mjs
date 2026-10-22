import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {canonical, geometryHash, validateResultBoundary} from './result.mjs';
import {validateOpenings} from './boundary.mjs';

// Use the existing Week 4 dependency; no second validator dependency/version.
const require=createRequire(new URL('../../week4/package.json',import.meta.url));
const {Ajv2020}=require('ajv/dist/2020.js');
const schema=JSON.parse(readFileSync(new URL('./idealized-room.schema.json',import.meta.url),'utf8'));
const validateSchema=new Ajv2020({strict:true,allErrors:false}).compile(schema);
const fail=message=>{throw Error(`Invalid idealization: ${message}`);};
const MAX_METADATA=16*1024**2, MAX_OUTPUT=64*1024**2;

function* tokens(value){
  if(typeof value==='number'){
    if(!Number.isFinite(value))fail('nonfinite number');
    const bytes=Buffer.allocUnsafe(8);bytes.writeDoubleLE(value===0?0:value);
    yield canonical({$f64le:bytes.toString('hex')});
  }else if(Array.isArray(value)){
    yield '[';
    for(let i=0;i<value.length;i++){if(i)yield ',';yield* tokens(value[i]);}
    yield ']';
  }else if(value!==null&&typeof value==='object'){
    yield '{';let i=0;
    for(const key of Object.keys(value).sort()){
      if(i++)yield ',';
      yield JSON.stringify(key)+':';yield* tokens(value[key]);
    }
    yield '}';
  }else{
    if(typeof value==='string'&&!value.isWellFormed())fail('invalid Unicode');
    yield JSON.stringify(value);
  }
}
export function idealizedDigest(value){
  const hash=createHash('sha256');
  for(const token of tokens(value))hash.update(token);
  return hash.digest('hex');
}
export function idealizationReasons(candidate){
  return [...new Set([...candidate.inventory.flatMap(obj=>obj.omitted?[]:obj.review_reasons.map(reason=>obj.id+':'+reason)),
    ...candidate.diagnostics.filter(d=>d.code!=='floor-contact').map(d=>d.object_ids.join(',')+':'+d.code)])].sort();
}
export function validateFitDiagnostics(candidate,envelope){
  const expected=envelope.fit_diagnostics??[];
  const actual=candidate.diagnostics.filter(d=>['support-distance','silhouette-disagreement','silhouette-center'].includes(d.code));
  if(canonical(actual)!==canonical(expected))
    throw Error('Source-fit diagnostics differ from the trusted preparation.');
}
export function validateIdealizedSource(value,source){
  const {bindings,frame}=value,report=source.worldmirror_report;
  const expected={originals:source.request.images.map(({id,sha256})=>({id,sha256})),
    analysis_binding:source.analysis.analysis_binding,estimator_id:'WorldMirror-2.0',
    estimator_artifact_sha256:report.worldmirror.manifest_sha256,
    registration_sha256:idealizedDigest(report.registration),observations:source.observations};
  for(const [key,wanted] of Object.entries(expected))
    if(wanted===undefined||canonical(bindings[key])!==canonical(wanted))fail('imported source '+key);
  if(frame.id!=='worldmirror-candidate'||frame.up!=='Z'||bindings.frame_sha256!==idealizedDigest(frame))fail('imported frame identity');
  checkFrame(frame);
  const {scale,rotation,translation}=report.registration,basis=report.original_to_candidate_rotation;
  for(let i=0;i<3;i++)for(let j=0;j<4;j++){
    const wanted=basis[i].reduce((sum,n,k)=>sum+(j===3?n*translation[k]:scale*n*rotation[k][j]),0);
    const actual=frame.source_to_candidate[i][j];
    if(!Number.isFinite(wanted)||!Number.isFinite(actual)||Math.abs(actual-wanted)>1e-9*(1+Math.abs(wanted)))
      fail('imported coordinate frame');
  }
}
export function sealIdealized(value){
  value.geometry_sha256=geometryHash(value.geometry);
  const {revision:_,...content}=value;
  value.revision=idealizedDigest(content);
  return value;
}
function unique(records,key='id'){
  const ids=new Set(records.map(r=>r[key]));
  if(ids.size!==records.length)fail('duplicate identity');
  return ids;
}
const subset=(a,b)=>[...a].every(x=>b.has(x));
const equalSet=(a,b)=>a.size===b.size&&subset(a,b);
function checkFrame(frame){
  const a=frame.source_to_candidate,b=frame.candidate_to_source;
  for(const m of [a,b])for(let i=0;i<4;i++)if(Math.abs(m[3][i]-(i===3?1:0))>1e-9)fail('nonaffine frame');
  const scale2=a.slice(0,3).reduce((s,r)=>s+r[0]**2,0);
  if(scale2<=1e-12)fail('degenerate frame');
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){
    const product=a[i].reduce((s,v,k)=>s+v*b[k][j],0);
    if(Math.abs(product-(i===j?1:0))>1e-6)fail('nonreversible frame');
    if(i<3&&j<3){
      const dot=a.slice(0,3).reduce((s,r)=>s+r[i]*r[j],0), target=i===j?scale2:0;
      if(Math.abs(dot-target)>1e-6+1e-6*Math.abs(target))fail('nonsimilarity frame');
    }
  }
  const det=a[0][0]*(a[1][1]*a[2][2]-a[1][2]*a[2][1])-a[0][1]*(a[1][0]*a[2][2]-a[1][2]*a[2][0])+a[0][2]*(a[1][0]*a[2][1]-a[1][1]*a[2][0]);
  if(det<=0)fail('reflected frame');
}
export function validateIdealizedResult(value,expected){
  if(!value||!value.geometry)fail('missing artifact/geometry');
  const g=value.geometry;
  for(const [key,max] of [['positions',600000],['colors',600000],['indices',1200000],['provenance',400000]])
    if(!Array.isArray(g[key])||g[key].length>max)fail('geometry budget/shape');
  if(!Array.isArray(value.inventory)||value.inventory.length>64)fail('inventory budget');
  if(!validateSchema(value))fail(`schema ${validateSchema.errors[0].instancePath}`);
  const {geometry:_,...metadata}=value;
  if(Buffer.byteLength(JSON.stringify(metadata))>MAX_METADATA||Buffer.byteLength(JSON.stringify(value))>MAX_OUTPUT)fail('byte budget');
  if(!expected||Object.keys(expected).sort().join(',')!=='bindings,boundary,inventory,job_id,openings,parent_revision')fail('expected binding');
  for(const key of Object.keys(expected))if(canonical(value[key])!==canonical(expected[key]))fail('source/job/parent changed');
  const originals=unique(value.bindings.originals),observations=unique(value.bindings.observations);
  if(value.bindings.observations.some(o=>!originals.has(o.image_id)))fail('observation source');
  checkFrame(value.frame);
  if(idealizedDigest(value.frame)!==value.bindings.frame_sha256)fail('frame digest');
  validateResultBoundary(value.boundary);validateOpenings(value.openings,value.boundary);
  if(g.positions.length%3||g.colors.length!==g.positions.length||g.indices.length%3||g.provenance.length!==g.indices.length/3)fail('geometry shape');
  if(g.indices.some(i=>!Number.isSafeInteger(i)||i<0||i>=g.positions.length/3))fail('index');
  for(let i=0;i<g.indices.length;i+=3){
    const p=g.indices.slice(i,i+3).map(j=>g.positions.slice(j*3,j*3+3));
    const a=p[1].map((n,j)=>n-p[0][j]),b=p[2].map((n,j)=>n-p[0][j]);
    if(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])<=1e-12)fail('degenerate face');
  }
  const objectIds=unique(value.inventory),objects=new Map(value.inventory.map(o=>[o.id,o])),claimed=new Set();
  for(const obj of objects.values()){
    const refs=new Set(obj.observation_ids);
    if(!subset(refs,observations)||obj.predecessor_ids.includes(obj.id))fail('object source/lineage');
    if(obj.origin==='idealized-procedural'&&!refs.size)fail('unsupported inventory addition');
    if(obj.origin==='owner-authored-addition'&&(refs.size||['dimension_origin','pose_origin','color_origin'].some(k=>obj.design_priors[k]!=='owner')))fail('owner addition claims source support');
    const pending=[...obj.predecessor_ids],visited=new Set();
    while(pending.length){
      const id=pending.pop(),predecessor=objects.get(id);
      if(id===obj.id||!predecessor)fail('predecessor lineage');
      if(visited.has(id))continue;
      visited.add(id);
      if(!obj.omitted&&!predecessor.omitted)fail('active successor duplicates predecessor');
      pending.push(...predecessor.predecessor_ids);
    }
    if(!obj.omitted)for(const ref of refs){if(claimed.has(ref))fail('duplicated observation');claimed.add(ref);}
  }
  unique(value.components);
  let nextFace=0;const represented=new Set();
  for(const c of value.components){
    const refs=new Set(c.source_reference_ids),obj=objects.get(c.object_id);
    if(c.first_face!==nextFace||c.first_face+c.face_count>g.provenance.length)fail('component partition');
    for(let i=c.first_face;i<c.first_face+c.face_count;i++)if(g.provenance[i]!==c.origin)fail('component provenance');
    if(c.object_id===null){
      if(!c.origin.startsWith('authored-')||!subset(refs,originals))fail('architecture origin/source');
    }else{
      if(!obj||obj.omitted||c.origin!==obj.origin||!equalSet(refs,new Set(obj.observation_ids)))fail('component ownership/source');
      represented.add(obj.id);
    }
    nextFace+=c.face_count;
  }
  if(nextFace!==g.provenance.length||!equalSet(represented,new Set(value.inventory.filter(o=>!o.omitted).map(o=>o.id))))fail('missing component/object');
  if(!equalSet(unique(value.omissions,'object_id'),new Set(value.inventory.filter(o=>o.omitted).map(o=>o.id))))fail('omission reasons');
  for(const d of value.diagnostics)if(!subset(new Set(d.object_ids),objectIds)||!subset(new Set(d.view_ids),originals))fail('diagnostic source');
  if(geometryHash(g)!==value.geometry_sha256)fail('geometry digest');
  const {revision,...content}=value;
  if(idealizedDigest(content)!==revision)fail('revision digest');
  return value;
}
