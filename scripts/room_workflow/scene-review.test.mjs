import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSceneReview} from './scene-review.mjs';
import {createBroker} from './broker.mjs';
import {ffsResource,sha} from './crime-scene.mjs';

const BASE={'photos/IMG_20240306_133505.jpg':{path:'.local/x.jpg',sha256:'0'.repeat(64),bytes:1,type:'image/jpeg'}};
const markers=['marker-01','marker-02','marker-08'];
async function fixture(catalog=BASE){
  const dir=await mkdtemp(join(tmpdir(),'eva-review-'));
  const catalogPath=join(dir,'ffs-resources.json');
  await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
  return {dir,catalogPath,path:join(dir,'review-v1','review.md')};
}
const valid={segments:{'marker-01':'approved','marker-02':'rejected'},crops:{'IMG_20240306_133505.jpg':[0.1,0.2,0.6,0.9]},
  models:{17:{status:'approved',upright:[0,Math.PI/2,-Math.PI]}},coverage_threshold:0.6};

test('round trip keeps revision and catalogue hash in sync',async()=>{
  const {dir,catalogPath,path}=await fixture();
  try{
    const review=createSceneReview({path,catalogPath,markers});
    const initial=await review.read();
    assert.deepEqual(initial.review,{segments:{},crops:{},models:{},coverage_threshold:1});
    const saved=await review.save({...valid,revision:initial.revision});
    const text=await readFile(path);
    assert.equal(saved.revision,sha(text));
    assert.match(text.toString(),/^# .*\n[\s\S]*```json\n/);
    const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
    assert.deepEqual(Object.keys(catalog),[...Object.keys(BASE),'review.md']);
    assert.deepEqual(catalog['photos/IMG_20240306_133505.jpg'],BASE['photos/IMG_20240306_133505.jpg']);
    assert.equal(catalog['review.md'].sha256,sha(text));
    assert.equal(catalog['review.md'].bytes,text.length);
    assert.equal(catalog['review.md'].type,'text/markdown');
    // The catalogued path resolves through the verified FFS reader.
    assert.deepEqual((await ffsResource('/api/room-workflow/benchmark/ffs/review.md',{catalog})).body,text);
    assert.deepEqual(await review.read(),{review:{...valid,models:{'17':valid.models[17]}},revision:saved.revision});
    const again=await review.save({...valid,coverage_threshold:0.4,revision:saved.revision});
    assert.equal(JSON.parse(await readFile(catalogPath,'utf8'))['review.md'].sha256,again.revision);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('rejects unknown fields, bad marker ids, crops outside 0–1, unknown tags, threshold out of range',async()=>{
  const {dir,catalogPath,path}=await fixture();
  try{
    const review=createSceneReview({path,catalogPath,markers});
    const {revision}=await review.read();
    const bad=[
      {...valid,extra:1},
      {...valid,segments:{'marker-99':'approved'}},
      {...valid,segments:{'marker-01':'maybe'}},
      {...valid,crops:{'IMG_20240306_133505.jpg':[0.1,0.2,1.2,0.9]}},
      {...valid,crops:{'IMG_20240306_133505.jpg':[0.6,0.2,0.1,0.9]}},
      {...valid,crops:{'IMG_20240306_999999.jpg':[0.1,0.2,0.6,0.9]}},
      {...valid,crops:{'../secret.jpg':[0.1,0.2,0.6,0.9]}},
      {...valid,models:{21:{status:'approved',upright:[0,0,0]}}},
      {...valid,models:{17:{status:'approved',upright:[0,0,4]}}},
      {...valid,models:{17:{status:'approved',upright:[0,0]}}},
      {...valid,models:{17:{status:'approved',upright:[0,0,0],note:'x'}}},
      {...valid,coverage_threshold:1.5},
      {...valid,coverage_threshold:'0.5'},
    ];
    for(const body of bad)await assert.rejects(review.save({...body,revision}),{status:400},JSON.stringify(body));
    await assert.rejects(readFile(path),{code:'ENOENT'});
    assert.deepEqual(JSON.parse(await readFile(catalogPath,'utf8')),BASE);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('stale revision → 409',async()=>{
  const {dir,catalogPath,path}=await fixture();
  try{
    const review=createSceneReview({path,catalogPath,markers});
    const {revision}=await review.read();
    await review.save({...valid,revision});
    await assert.rejects(review.save({...valid,revision}),{status:409});
    // An unavailable marker source is reported as such, not as a changed review.
    const unavailable={[Symbol.iterator](){throw Object.assign(new Error('tags unavailable'),{status:503});}};
    await assert.rejects(createSceneReview({path,catalogPath,markers:unavailable}).read(),{status:503});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('approved segment summaries need the catalogued summary and owner approval',async()=>{
  const {dir,catalogPath,path}=await fixture();
  try{
    const review=createSceneReview({path,catalogPath,markers});
    await review.save({...valid,segments:{'marker-01':'approved','marker-02':'rejected','marker-08':'approved'},revision:(await review.read()).revision});
    assert.deepEqual(await review.approved(),{});
    const summaryPath=join(dir,'summary.json');
    const register=async marks=>{
      const summary=JSON.stringify({params:{},revision:'r',floor:{normal:[0,0,1],offset:0},markers:marks});
      await writeFile(summaryPath,summary);
      const catalog=JSON.parse(await readFile(catalogPath,'utf8'));
      catalog['segments/summary.json']={path:relative(fileURLToPath(new URL('../../',import.meta.url)),summaryPath).replaceAll('\\','/'),
        sha256:sha(summary),bytes:Buffer.byteLength(summary),type:'application/json'};
      await writeFile(catalogPath,JSON.stringify(catalog,null,2)+'\n');
      return summary;
    };
    const marks={
      'marker-01':{tag:17,count:40,bbox:[[0,0,0],[0.1,0.1,0.05]],height:0.05,base_above_floor:0,flags:[]},
      'marker-02':{tag:69,count:90,bbox:[[1,1,0],[1.1,1.1,0.3]],height:0.3,base_above_floor:0,flags:[]},
      'marker-08':{tag:21,count:12,bbox:[[2,2,0.4],[2.1,2.1,0.5]],height:0.1,base_above_floor:0.4,flags:['overlap:marker-02']}};
    const summary=await register(marks);
    assert.deepEqual(await review.approved(),{
      17:{bbox_m:[[0,0,0],[0.1,0.1,0.05]],extent_m:0.05,base_above_floor_m:0,point_count:40},
      21:{bbox_m:[[2,2,0.4],[2.1,2.1,0.5]],extent_m:0.1,base_above_floor_m:0.4,point_count:12}});
    await writeFile(summaryPath,summary.replace('"count":40','"count":41'));
    await assert.rejects(review.approved(),{status:503});
    const {base_above_floor,...unlabelled}=marks['marker-01'];
    await register({...marks,'marker-01':unlabelled});
    await assert.rejects(review.approved(),{status:503});
    await register({...marks,'marker-08':{...marks['marker-08'],tag:17}});
    await assert.rejects(review.approved(),{status:503});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('route absent unless reviewEnabled',async()=>{
  const {dir,catalogPath,path}=await fixture();
  const servers=[];
  try{
    for(const reviewEnabled of [undefined,true]){
      const allowedHosts=new Set();
      const {server}=await createBroker({directory:join(dir,'broker'),sceneNotebookOptions:{key:async()=>''},allowedHosts,
        ...(reviewEnabled?{reviewEnabled,sceneReviewOptions:{path,catalogPath,markers}}:{})});
      servers.push(server);
      await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
      allowedHosts.add(`127.0.0.1:${server.address().port}`);
      const base=`http://127.0.0.1:${server.address().port}/api/room-workflow`;
      const request=(p,headers={},body)=>fetch(base+p,{method:body===undefined?'GET':'POST',headers:{host:'127.0.0.1:1440',...headers},body:body===undefined?undefined:JSON.stringify(body)});
      const session=await request('/session'),cookie=session.headers.get('set-cookie').split(';')[0],{csrf}=await session.json();
      const headers={cookie,origin:'http://127.0.0.1:1440','x-eva-csrf':csrf,'content-type':'application/json'};
      const read=await request('/crime-scene/review',headers);
      if(!reviewEnabled){
        assert.equal(read.status,404);
        assert.equal((await request('/crime-scene/review',headers,{...valid,revision:'x'})).status,404);
        continue;
      }
      assert.equal(read.status,200);
      const {revision}=await read.json();
      assert.equal((await request('/crime-scene/review',{...headers,'x-eva-csrf':'bad'},{...valid,revision})).status,403);
      const saved=await request('/crime-scene/review',headers,{...valid,revision});
      assert.equal(saved.status,200);
      assert.equal((await request('/crime-scene/review',headers,{...valid,revision})).status,409);
      assert.equal((await request('/crime-scene/review',headers,{...valid,extra:1,revision:(await saved.json()).revision})).status,400);
    }
  }finally{
    for(const server of servers)await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
