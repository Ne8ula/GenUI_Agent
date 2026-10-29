import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {createBroker} from './broker.mjs';
test('HTTP notebook enforces sessions, origin, CSRF, methods, owner isolation and missing-key recovery',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'eva-ffs-http-'));
  const allowedHosts=new Set();
  const {server}=await createBroker({directory,sceneNotebookOptions:{key:async()=>''},allowedHosts});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  allowedHosts.add(`127.0.0.1:${server.address().port}`);
  const base=`http://127.0.0.1:${server.address().port}/api/room-workflow`;
  const request=(path,headers={},body,method=body===undefined?'GET':'POST')=>fetch(base+path,{method,headers:{host:'127.0.0.1:1440',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  try{
    assert.equal((await request('/crime-scene/notes')).status,401);
    const session=await request('/session'),cookie=session.headers.get('set-cookie').split(';')[0],{csrf}=await session.json();
    const headers={cookie,origin:'http://127.0.0.1:1440','x-eva-csrf':csrf,'content-type':'application/json'};
    const initial=await request('/crime-scene/notes',headers);assert.equal(initial.status,200);
    const saved={revision:(await initial.json()).revision,notes:[{text:'Bottle?',tags:[12]}]};
    assert.equal((await request('/crime-scene/notes',{...headers,origin:'http://evil.test'},saved)).status,403);
    assert.equal((await request('/crime-scene/notes',{...headers,'x-eva-csrf':'bad'},saved)).status,403);
    const result=await request('/crime-scene/notes',headers,saved);assert.equal(result.status,200);
    const revision=(await result.json()).revision;
    assert.equal((await request('/crime-scene/notes',headers,saved)).status,409);
    assert.deepEqual((await (await request('/crime-scene/notes',headers)).json()).notes,saved.notes);
    assert.equal((await request('/crime-scene/notes',headers,undefined,'DELETE')).status,405);
    assert.equal((await request('/crime-scene/notes?owner=forged',headers)).status,400);
    assert.equal((await request('/crime-scene/status',headers)).status,200);
    assert.equal((await request('/crime-scene/reply',headers,{revision,consent:true})).status,503);
    const second=await request('/session');
    assert.deepEqual((await (await request('/crime-scene/notes',{cookie:second.headers.get('set-cookie').split(';')[0]})).json()).notes,[]);
    assert.equal((await request('/benchmark/ffs/not-allowed',headers)).status,404);
    const tags=await request('/benchmark/ffs/tags.json',headers);assert.equal(tags.status,200);
    assert.equal((await tags.json()).evidence.length,11);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

const sha = v => createHash('sha256').update(v).digest('hex');
const load = async () => {
  assert.ok(existsSync(new URL('./crime-scene.mjs',import.meta.url)), 'Crime-scene broker module is not implemented');
  return import('./crime-scene.mjs');
};

test('fixed resources reject unknown paths and changed bytes, and serve matching bytes',async()=>{
  const {ffsResource}=await load(),root=await mkdtemp(join(tmpdir(),'eva-ffs-'));
  try {
    await writeFile(join(root,'photo.jpg'),'original');
    const catalog={'photos/a.jpg':{path:'photo.jpg',sha256:sha('original'),bytes:8,type:'image/jpeg'}};
    assert.equal(await ffsResource('/api/room-workflow/benchmark/ffs/../../.env',{root,catalog}),null);
    const result=await ffsResource('/api/room-workflow/benchmark/ffs/photos/a.jpg',{root,catalog});
    assert.equal(result.body.toString(),'original');
    await writeFile(join(root,'photo.jpg'),'tampered');
    await assert.rejects(ffsResource('/api/room-workflow/benchmark/ffs/photos/a.jpg',{root,catalog}),/integrity/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('Markdown notes round-trip text, reject stale saves, unknown fields and foreign owner reads',async()=>{
  const {createSceneNotebook}=await load(),directory=await mkdtemp(join(tmpdir(),'eva-notes-'));
  try {
    const notebook=createSceneNotebook({directory,key:async()=>''});
    const owner=randomUUID(),first=await notebook.read(owner);
    const notes=[{text:'One\n## Note 2\n<script>not executed</script>',tags:[12,22]}];
    const saved=await notebook.save(owner,{revision:first.revision,notes});
    assert.deepEqual((await notebook.read(owner)).notes,notes);
    assert.match(await readFile(join(directory,`crime-scene-${owner}.md`),'utf8'),/> One/);
    assert.deepEqual((await notebook.read(randomUUID())).notes,[]);
    await assert.rejects(notebook.save(owner,{revision:first.revision,notes:[]}),/changed/);
    await assert.rejects(notebook.save(owner,{revision:saved.revision,notes,authority:true}),/fields/);
    await assert.rejects(notebook.reply(owner,{revision:saved.revision,consent:true}),/API key/);
    assert.deepEqual((await notebook.read(owner)).notes,notes);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Claude request is text-only, capped durably, rejects forged inputs, and never leaks upstream errors',async()=>{
  const {createSceneNotebook}=await load(),directory=await mkdtemp(join(tmpdir(),'eva-replies-'));
  try {
    let calls=0;
    const options={directory,key:async()=> 'test-secret',scene:async()=>({evidence:[{tag:12,item:'Beer bottle',photos:['private.jpg']}],markers:[{tag:12,centroid:[1,2,3],numbering:'manual-from-panorama'}]}),
      fetcher:async(url,init)=>{
        calls++;assert.equal(url,'https://api.anthropic.com/v1/messages');
        const body=JSON.parse(init.body);
        assert.equal(body.model,'claude-opus-5-5');assert.equal(body.max_tokens,2048);
        assert.equal(body.tools,undefined);assert.doesNotMatch(init.body,/private.jpg|data_base64/);
        assert.doesNotMatch(init.body,/Beer bottle|centroid|manual-from-panorama/);
        assert.deepEqual(Object.keys(JSON.parse(body.messages[0].content)),['notes']);
        assert.equal(init.redirect,'error');
        return new Response(JSON.stringify({stop_reason:'end_turn',content:[{type:'text',text:'Your note mentions a bottle.'}]}));
      }};
    let notebook=createSceneNotebook(options);const owner=randomUUID();
    const saved=await notebook.save(owner,{revision:(await notebook.read(owner)).revision,notes:[{text:'Bottle?',tags:[12]}]});
    await assert.rejects(notebook.reply(owner,{revision:saved.revision,consent:true,model:'forged'}),/fields/);
    for(let i=0;i<5;i++){
      assert.equal((await notebook.reply(owner,{revision:saved.revision,consent:true})).text,'Your note mentions a bottle.');
      notebook=createSceneNotebook(options);
    }
    await assert.rejects(notebook.reply(owner,{revision:saved.revision,consent:true}),/limit/);
    assert.equal(calls,5);
    const other=randomUUID(),otherSaved=await notebook.save(other,{revision:(await notebook.read(other)).revision,notes:[{text:'X',tags:[]}]});
    notebook=createSceneNotebook({...options,fetcher:async()=>{throw Object.assign(Error('test-secret'),{status:502});}});
    await assert.rejects(notebook.reply(other,{revision:otherSaved.revision,consent:true}),e=>!e.message.includes('test-secret')&&e.message.includes('unavailable'));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('provider responses reject malformed text, truncation, oversized and non-JSON bodies without retry',async t=>{
  const {createSceneNotebook}=await load(),directory=await mkdtemp(join(tmpdir(),'eva-reply-bounds-'));
  try{
    const cases=[
      ['non-string text',()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:{secret:'not text'}}]})],
      ['truncated',()=>Response.json({stop_reason:'max_tokens',content:[{type:'text',text:'partial'}]})],
      ['oversized',()=>new Response('x'.repeat(65537))],
      ['non-JSON',()=>new Response('test-secret')],
      ['HTTP error',()=>new Response('test-secret',{status:400})],
      ['null block',()=>Response.json({stop_reason:'end_turn',content:[null]})],
    ];
    for(const [name,response] of cases)await t.test(name,async()=>{
      let calls=0;
      const notebook=createSceneNotebook({directory,key:async()=> 'test-secret',scene:async()=>({evidence:[],markers:[]}),fetcher:async()=>{calls++;return response();}});
      const owner=randomUUID(),saved=await notebook.save(owner,{revision:(await notebook.read(owner)).revision,notes:[{text:'Observation?',tags:[]}]});
      await assert.rejects(notebook.reply(owner,{revision:saved.revision,consent:true}),e=>e.status===502&&!e.message.includes('test-secret'));
      assert.equal(calls,1);assert.equal((await notebook.status(owner)).remaining,4);
    });
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('abort, timeout and concurrent operations preserve notes and charge only submitted reservations',async t=>{
  const {createSceneNotebook}=await load(),directory=await mkdtemp(join(tmpdir(),'eva-reply-abort-'));
  let started,called;
  const entered=()=>new Promise(resolve=>started=resolve);
  try{
    const notebook=createSceneNotebook({directory,key:async()=> 'test-secret',scene:async()=>({evidence:[],markers:[]}),fetcher:async(_url,{signal})=>{
      called++;started();return new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(Error('private upstream abort')),{once:true});});
    }});
    called=0;
    const owner=randomUUID(),saved=await notebook.save(owner,{revision:(await notebook.read(owner)).revision,notes:[{text:'Observation?',tags:[]}]});
    const pre=new AbortController();pre.abort();
    await assert.rejects(notebook.reply(owner,{revision:saved.revision,consent:true},{signal:pre.signal}));
    assert.equal(called,0);assert.equal((await notebook.status(owner)).remaining,5);
    const abort=new AbortController(),began=entered();
    const pending=notebook.reply(owner,{revision:saved.revision,consent:true},{signal:abort.signal});
    const rejected=assert.rejects(pending,e=>e.status===502&&!e.message.includes('private upstream'));
    await began;
    await assert.rejects(notebook.save(owner,{revision:saved.revision,notes:[]}),e=>e.status===409);
    abort.abort();await rejected;
    assert.deepEqual((await notebook.read(owner)).notes,saved.notes);assert.equal((await notebook.status(owner)).remaining,4);
    t.mock.timers.enable({apis:['setTimeout']});
    const timeoutBegan=entered();
    const timed=assert.rejects(notebook.reply(owner,{revision:saved.revision,consent:true}),e=>e.status===502);
    await timeoutBegan;t.mock.timers.tick(45000);await timed;
    assert.equal(called,2);assert.equal((await notebook.status(owner)).remaining,3);
    await notebook.save(owner,{revision:saved.revision,notes:saved.notes});
  }finally{t.mock.timers.reset();await rm(directory,{recursive:true,force:true});}
});

test('note limits and malformed private files fail closed without changing the saved notebook',async()=>{
  const {createSceneNotebook}=await load(),directory=await mkdtemp(join(tmpdir(),'eva-note-bounds-'));
  try{
    const notebook=createSceneNotebook({directory,key:async()=>''}),owner=randomUUID(),initial=await notebook.read(owner);
    for(const notes of [Array.from({length:41},()=>({text:'',tags:[]})),[{text:'x'.repeat(2001),tags:[]}],
      Array.from({length:7},()=>({text:'x'.repeat(1800),tags:[]})),[{text:'a\rb',tags:[]}],[{text:'a\0b',tags:[]}],
      [{text:'x',tags:[12,12]}],[{text:'x',tags:[999]}]]){
      await assert.rejects(notebook.save(owner,{revision:initial.revision,notes}),e=>e.status===400);
      assert.equal((await notebook.read(owner)).revision,initial.revision);
    }
    const path=join(directory,`crime-scene-${owner}.md`);
    await writeFile(path,'Hand-edited, not the notebook format');
    await assert.rejects(notebook.read(owner),e=>e.status===409);
    await assert.rejects(notebook.save(owner,{revision:initial.revision,notes:[]}),e=>e.status===409);
    assert.equal(await readFile(path,'utf8'),'Hand-edited, not the notebook format');
    await writeFile(path,'x'.repeat(128*1024+1));await assert.rejects(notebook.read(owner),/rejected/);
    await writeFile(path+'.requests.json','{"count":-1}');await assert.rejects(notebook.status(owner),/allowance/);
    await writeFile(path+'.requests.json','not JSON');await assert.rejects(notebook.status(owner));
  }finally{await rm(directory,{recursive:true,force:true});}
});
