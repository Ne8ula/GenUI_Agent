import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const load=async()=>{
  assert.ok(existsSync(new URL('../src/crime-scene/models.ts',import.meta.url)),'Scene models are not implemented');
  return import('../src/crime-scene/models.ts');
};
test('segmentAttribute maps original PLY indices through the crop filter',async()=>{
  const {segmentAttribute}=await load();
  // Kept points keep their original PLY index; lists are in original order and may name cropped-out points.
  const kept=new Uint32Array([2,5,9,40]);
  const lists=new Map([[0,new Uint32Array([5,9,7])],[3,new Uint32Array([40,999999])]]);
  assert.deepEqual(Array.from(segmentAttribute(kept,lists)),[-1,0,0,3]);
  assert.deepEqual(Array.from(segmentAttribute(new Uint32Array(),lists)),[]);
});
test('unapproved segment → -1 (sphere fallback)',async()=>{
  const {segmentAttribute,hologramLabel}=await load();
  assert.deepEqual(Array.from(segmentAttribute(new Uint32Array([1,2]),new Map())),[-1,-1]);
  assert.equal(hologramLabel({kind:'sphere'}),'approximate region');
  assert.equal(hologramLabel({kind:'segment'}),null);
});
test('modelVisible false below threshold, rejected, or missing GLB',async()=>{
  const {modelVisible}=await load();
  const approved={status:'approved' as const,upright:[0,0,0] as [number,number,number]};
  assert.equal(modelVisible({coverage:.9},approved,.8),true);
  assert.equal(modelVisible({coverage:.7},approved,.8),false);
  assert.equal(modelVisible({coverage:.9},{...approved,status:'rejected'},.8),false);
  assert.equal(modelVisible({coverage:.9},undefined,.8),false);
  assert.equal(modelVisible(undefined,approved,.8),false);
});
test('label text "Generated from source photo, fitted to scan (coverage 87 %, mean 1.2 cm)"',async()=>{
  const {hologramLabel,modelLabel}=await load();
  const fit={matrix:[],coverage:.874,mean_cm:1.24};
  assert.equal(modelLabel(fit),'Generated from source photo, fitted to scan (coverage 87 %, mean 1.2 cm)');
  assert.equal(hologramLabel({kind:'model',fit}),modelLabel(fit));
});
test('review.md parses its fenced json block and fails closed to nothing approved',async()=>{
  const {parseReview,NO_REVIEW}=await load();
  const review={segments:{'marker-01':'approved','marker-02':'rejected'},crops:{},models:{'18':{status:'approved',upright:[0,0,1]}},coverage_threshold:.6};
  const text='# FFS th_0028 — owner review\n\nOwner input.\n\n```json\n'+JSON.stringify(review,null,2)+'\n```\n';
  assert.deepEqual(parseReview(text),{segments:review.segments,models:review.models,coverage_threshold:.6});
  assert.deepEqual(parseReview('no block here'),NO_REVIEW);
  assert.deepEqual(parseReview('```json\n{"segments":'),NO_REVIEW);
  const valid='```json\n{"segments":{"marker-01":"approved"},"models":{},"coverage_threshold":0.5}\n```';
  assert.equal(parseReview(valid).segments['marker-01'],'approved');
  assert.deepEqual(parseReview(valid.replace('approved','maybe')),NO_REVIEW);
  assert.deepEqual(parseReview('```json\n{"segments":{},"models":{"18":{"status":"approved"}},"coverage_threshold":0.5}\n```'),NO_REVIEW);
  assert.deepEqual(parseReview('```json\n{"segments":{},"models":{},"coverage_threshold":2}\n```'),NO_REVIEW);
  assert.deepEqual(NO_REVIEW,{segments:{},models:{},coverage_threshold:1});
});

// Stubbed broker: a map of FFS names to bodies; anything else is a 404.
const serve=(files:Record<string,ArrayBuffer|string>)=>{
  const real=globalThis.fetch,calls:string[]=[];
  globalThis.fetch=(async(input:string|URL|Request)=>{
    const name=String(input).replace('/api/room-workflow/benchmark/ffs/','');calls.push(name);
    const body=files[name];
    return {ok:body!==undefined,arrayBuffer:async()=>typeof body==='string'?new TextEncoder().encode(body).buffer:body} as Response;
  }) as typeof fetch;
  return {calls,restore:()=>{globalThis.fetch=real;}};
};
const u32=(...values:number[])=>Uint32Array.from(values).buffer as ArrayBuffer;
const markers=[{id:'marker-01',tag:18,centroid:[0,0,0] as [number,number,number],numbering:null,label:''},{id:'marker-02',tag:13,centroid:[0,0,0] as [number,number,number],numbering:null,label:''}];
const approvedModel={status:'approved' as const,upright:[0,0,0] as [number,number,number]};
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
test('loadSegments fetches only approved markers and drops 404, oversize, misaligned and out-of-range lists',async()=>{
  const {loadSegments}=await load();
  const signal=new AbortController().signal,review={segments:{'marker-01':'approved' as const,'marker-02':'approved' as const},models:{},coverage_threshold:1};
  let stub=serve({'segments/marker-01.u32':u32(1,2,3)});
  try{
    const lists=await loadSegments(markers,review,10,signal);
    assert.deepEqual([...lists.keys()],[0]);assert.deepEqual(Array.from(lists.get(0)!),[1,2,3]);
    assert.deepEqual(stub.calls.sort(),['segments/marker-01.u32','segments/marker-02.u32']);
  }finally{stub.restore();}
  stub=serve({});
  try{assert.equal((await loadSegments(markers,{...review,segments:{}},10,signal)).size,0);assert.deepEqual(stub.calls,[]);}finally{stub.restore();}
  for(const body of [u32(1,2,3,4,5,6,7,8,9,10,11),new Uint8Array([1,2,3]).buffer,u32(1,10),new ArrayBuffer(0)]){
    stub=serve({'segments/marker-01.u32':body as ArrayBuffer});
    try{assert.equal((await loadSegments(markers,review,10,signal)).size,0);}finally{stub.restore();}
  }
});
test('loadSegments resolves overlapping lists in marker order whatever the fetch order',async()=>{
  const {loadSegments,segmentAttribute}=await load();
  const signal=new AbortController().signal,review={segments:{'marker-01':'approved' as const,'marker-02':'approved' as const},models:{},coverage_threshold:1};
  const real=globalThis.fetch;
  globalThis.fetch=(async(input:string|URL|Request)=>{
    const first=String(input).endsWith('marker-01.u32');
    await new Promise(resolve=>setTimeout(resolve,first?20:0));
    return {ok:true,arrayBuffer:async()=>u32(5)} as Response;
  }) as typeof fetch;
  try{
    const lists=await loadSegments(markers,review,10,signal);
    assert.deepEqual([...lists.keys()],[0,1]);
    assert.deepEqual(Array.from(segmentAttribute(new Uint32Array([5]),lists)),[1]);
  }finally{globalThis.fetch=real;}
});
// Smallest valid GLB: one triangle, no materials.
const tinyGlb=()=>{
  const bin=new Float32Array([0,0,0,1,0,0,0,1,0]);
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],bufferViews:[{buffer:0,byteLength:36}],buffers:[{byteLength:36}]};
  let text=JSON.stringify(json);while(text.length%4)text+=' ';
  const jsonBytes=new TextEncoder().encode(text),total=28+jsonBytes.length+bin.byteLength;
  const out=new ArrayBuffer(total),view=new DataView(out),u8=new Uint8Array(out);
  view.setUint32(0,0x46546C67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);
  view.setUint32(12,jsonBytes.length,true);view.setUint32(16,0x4E4F534A,true);u8.set(jsonBytes,20);
  const at=20+jsonBytes.length;view.setUint32(at,bin.byteLength,true);view.setUint32(at+4,0x004E4942,true);u8.set(new Uint8Array(bin.buffer),at+8);
  return out;
};
test('loadModels parses a valid GLB and places it with the fit matrix',async()=>{
  const {loadModels}=await load();
  const matrix=[...identity.slice(0,12),1,2,3,1],review={segments:{'marker-01':'approved' as const},models:{'18':approvedModel},coverage_threshold:.5};
  const stub=serve({'models/fits.json':JSON.stringify({'18':{matrix,coverage:.874,mean_cm:1.24}}),'models/tag-18.glb':tinyGlb()});
  try{
    const [model,...rest]=await loadModels(markers,review,new AbortController().signal);
    assert.equal(rest.length,0);assert.equal(model!.index,0);assert.equal(model!.tag,18);
    assert.deepEqual(model!.fit,{matrix,coverage:.874,mean_cm:1.24});
    assert.deepEqual(model!.object.matrix.toArray(),matrix);
    const {Box3}=await import('three'),box=new Box3().setFromObject(model!.object);
    assert.deepEqual([box.min.toArray(),box.max.toArray()],[[1,2,3],[2,3,3]]);
  }finally{stub.restore();}
});
test('loadModels keeps a well-formed generator model and revision from fits.json for Sources & details, and drops a malformed one',async()=>{
  const {loadModels,generatorLabel}=await load();
  const review={segments:{'marker-01':'approved' as const},models:{'18':approvedModel},coverage_threshold:.5},revision='5b521936b01fbe1890f6f9baed0254ab6351c04a';
  for(const [model,rev,expected] of [['stabilityai/TripoSR',revision,'generator stabilityai/TripoSR @ 5b521936'],['<b>x</b>',revision,'generator not recorded'],['stabilityai/TripoSR','main','generator not recorded']]){
    const stub=serve({'models/fits.json':JSON.stringify({'18':{matrix:identity,coverage:.874,mean_cm:1.24,model,revision:rev}}),'models/tag-18.glb':tinyGlb()});
    try{
      const [loaded]=await loadModels(markers,review,new AbortController().signal);
      assert.equal(generatorLabel(loaded!.fit),expected);
    }finally{stub.restore();}
  }
});
test('loadModels falls back on missing or malformed fits, bad matrices, failed GLBs and unapproved segments',async()=>{
  const {loadModels}=await load();
  const signal=new AbortController().signal;
  const review={segments:{'marker-01':'approved' as const},models:{'18':approvedModel},coverage_threshold:.5};
  const fit=(matrix:number[])=>JSON.stringify({'18':{matrix,coverage:.9,mean_cm:1}});
  const fits='models/fits.json',glb='models/tag-18.glb';
  const cases:[string,Record<string,ArrayBuffer|string>,string[]][]=[
    ['no fits.json',{},[fits]],
    ['malformed fits.json',{[fits]:'{"18":'},[fits]],
    ['short matrix',{[fits]:fit(identity.slice(0,15)),[glb]:new ArrayBuffer(8)},[fits]],
    ['bad bottom row',{[fits]:fit(identity.map((v,i)=>i===3?1:v)),[glb]:new ArrayBuffer(8)},[fits]],
    ['missing GLB',{[fits]:fit(identity)},[fits,glb]],
    ['invalid GLB bytes',{[fits]:fit(identity),[glb]:new TextEncoder().encode('not a glb').buffer as ArrayBuffer},[fits,glb]],
    ['oversize GLB',{[fits]:fit(identity),[glb]:new ArrayBuffer(2*1024*1024+1)},[fits,glb]],
  ];
  for(const [name,files,expected] of cases){
    const stub=serve(files);
    try{assert.deepEqual(await loadModels(markers,review,signal),[],name);assert.deepEqual(stub.calls,expected,name+' requests');}finally{stub.restore();}
  }
  let stub=serve({'models/fits.json':fit(identity),'models/tag-18.glb':new ArrayBuffer(8)});
  try{
    assert.deepEqual(await loadModels(markers,{...review,coverage_threshold:.95},signal),[],'below threshold');
    assert.deepEqual(stub.calls,['models/fits.json'],'GLB is not fetched for a hidden model');
  }finally{stub.restore();}
  stub=serve({'models/fits.json':fit(identity),'models/tag-18.glb':new ArrayBuffer(8)});
  try{
    assert.deepEqual(await loadModels(markers,{...review,segments:{}},signal),[],'model needs its approved segment');
    assert.deepEqual(stub.calls,[],'nothing is fetched without an approved segment');
  }finally{stub.restore();}
});
