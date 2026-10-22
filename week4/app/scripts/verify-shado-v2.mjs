/** Real EVA browser + isolated broker. Shado transport/popup are explicit fixtures. No provider calls. */
import {chromium} from 'playwright';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output=process.argv[2];if(!output)throw Error('New evidence directory required.');
await mkdir(output,{recursive:false});
const directory=await mkdtemp(join(tmpdir(),'eva-shado-browser-')),calls=[],errors=[],checks=[],previous=process.env.EVA_SHADO_ORIGIN;
process.env.EVA_SHADO_ORIGIN='https://shado.example';
const recipe={modelId:'fixture-video',nodeId:'eva-room-video',projectId:'fixture-project'};
const recipeHash=createHash('sha256').update(JSON.stringify(recipe)).digest('hex');
let record,server,broker,browser;
try {
  const hosts=new Set();
  broker=await createBroker({directory,allowedHosts:hosts,shadoFetch:async(_url,init)=>{
    const body=JSON.parse(init.body);calls.push(body.operation);
    record=JSON.parse(await readFile(join(directory,record.id+'.json'),'utf8'));
    if(body.operation==='media'){
      const p=record.images[body.assetIndex];return Response.json({ok:true,asset:{sourceId:p.id,version:p.id,sha256:p.sha256,size:p.bytes,mimeType:p.mime,id:'media-'+body.assetIndex,sealed:true,chunkBytes:512*1024}});
    }
    if(body.operation==='quote')return Response.json({ok:true,quote:{id:'fixture-quote',recipeHash,recipe,currency:'USD',maximumCostUsd:.5,pricing:{amountMicros:500000},expiresAt:new Date(Date.now()+60000).toISOString()}});
    return Response.json({ok:true,task:{id:record.shadoTaskId,projectId:recipe.projectId,status:'running',steps:[{nodeId:recipe.nodeId,invocationId:'fixture-invocation'}],receipts:[]}});
  }});
  server=broker.server;await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const host=`127.0.0.1:${server.address().port}`;hosts.add(host);const origin=`http://${host}`;
  const response=await fetch(origin+'/api/room-workflow/session'),session=await response.json(),cookie=response.headers.get('set-cookie').split(';')[0];
  const images=Array.from({length:5},(_,i)=>({name:`synthetic-${i}.png`,mime:'image/png',data_base64:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(20,i)]).toString('base64')}));
  const created=await fetch(origin+'/api/room-workflow/jobs',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:1440','X-EVA-CSRF':session.csrf,'Content-Type':'application/json'},body:JSON.stringify({images,areaStatement:'300 sqft',retention:'saved'})});
  const job=await created.json(),path=join(directory,job.id+'.json');record=JSON.parse(await readFile(path,'utf8'));
  record.status='awaiting-shado';record.message='Synthetic boundary fixture for browser protocol checks; no model ran.';
  record.boundary={polygon:[[0,0],[2,0],[2,2],[0,2]],floor:0,ceiling:2};await writeFile(path,JSON.stringify(record));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'eva_room',value:cookie.split('=')[1],domain:'127.0.0.1',path:'/api/room-workflow',httpOnly:true,sameSite:'Strict'}]);
  await context.route('**/api/room-workflow/**',async route=>{
    const target=new URL(route.request().url());const r=await route.fetch({url:origin+target.pathname+target.search});
    await route.fulfill({response:r});
  });
  await context.route('https://shado.example/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><title>Fixture Shado authorization</title>
    <h1>Synthetic Shado popup</h1><p>No actual account, quote or model.</p><button id="upload" disabled>Allow fixture upload</button><button id="generate" disabled>Approve fixture quote</button>
    <script>
    const origin='http://127.0.0.1:1440',recipeHash=${JSON.stringify(recipeHash)},project=${JSON.stringify(JSON.stringify({format:'shado-project',version:1,project:{id:recipe.projectId}}))};
    let packet,quote;const uploadNonce='b'.repeat(64);
    function grant(phase){return {token:phase+'.'+'a'.repeat(43),taskId:packet.taskId,project,nodeId:'eva-room-video',recipeHash,phase,quoteId:phase==='generation'?quote.id:null,maximumMicros:phase==='generation'?quote.pricing.amountMicros:0,expiresAt:Date.now()+900000,assets:packet.assets.map(({id,...p})=>({...p,sourceId:id,version:id}))};}
    addEventListener('message',event=>{if(event.source!==opener||event.origin!==origin)return;
      if(event.data.type==='eva-room-request'){packet=event.data;document.querySelector('#upload').disabled=false;}
      if(event.data.type==='eva-room-quote'){if(event.data.nonce!==packet.nonce||event.data.uploadNonce!==uploadNonce)throw Error('Bad quote binding');quote=event.data.quote;document.querySelector('#generate').disabled=false;}});
    document.querySelector('#upload').onclick=()=>opener.postMessage({type:'eva-room-grant',nonce:packet.nonce,jobId:packet.jobId,uploadNonce,grant:grant('upload')},origin);
    document.querySelector('#generate').onclick=()=>opener.postMessage({type:'eva-room-grant',nonce:packet.nonce,jobId:packet.jobId,uploadNonce,grant:grant('generation')},origin);
    opener.postMessage({type:'eva-room-ready'},origin);
    </script>`}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:1440/?scene=upload-room');
  await page.getByText('Keep overlap between photos:',{exact:false}).waitFor();
  await page.screenshot({path:join(output,'intake-capture-guidance.png'),fullPage:true});
  await page.getByRole('button',{name:/Reopen room/}).click();
  const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Authorize upload in Shado'}).click();const popup=await popupPromise;
  await popup.getByRole('button',{name:'Allow fixture upload'}).click();
  await page.getByText('awaiting shado generation',{exact:true}).waitFor();
  assert.equal(calls.includes('submit'),false);assert.equal(popup.isClosed(),false);
  await page.screenshot({path:join(output,'quote-awaiting-separate-approval.png'),fullPage:true});
  checks.push('upload-only popup stays open; sealed-input quote reaches same bound window without submit');
  await popup.getByRole('button',{name:'Approve fixture quote'}).click();
  await page.getByRole('button',{name:'Generate the authorized video once'}).waitFor();
  assert.equal(calls.includes('submit'),false);
  await page.getByRole('button',{name:'Generate the authorized video once'}).click();
  await page.getByRole('button',{name:'Check existing Shado task'}).waitFor();
  await page.getByRole('button',{name:'Check existing Shado task'}).click();
  assert.equal(calls.filter(v=>v==='submit').length,1);
  await page.screenshot({path:join(output,'existing-task-recovery.png'),fullPage:true});
  checks.push('generation approval does not submit until explicit continue; one submit then same-task status');
  await page.reload();await page.getByRole('button',{name:/Reopen room/}).click();
  await page.getByRole('button',{name:'Check existing Shado task'}).waitFor();
  assert.equal(calls.filter(v=>v==='submit').length,1);
  checks.push('reload/reopen retains task without automatically generating');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Check existing Shado task'}).focus();assert.equal(await page.getByRole('button',{name:'Check existing Shado task'}).evaluate(e=>e===document.activeElement),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(output,'phone-recovery.png'),fullPage:true});
  checks.push('keyboard focus and reduced-motion phone layout remain usable');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'passed',checks,errors,calls,
    limits:'Actual EVA UI and isolated local broker; synthetic photos/boundary and mocked Shado popup/provider transport. No live Shado authentication, provider quote, generation or deployment verified.'},null,2));
} finally {
  await browser?.close();if(broker)await broker.wait();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  await rm(directory,{recursive:true,force:true});if(previous===undefined)delete process.env.EVA_SHADO_ORIGIN;else process.env.EVA_SHADO_ORIGIN=previous;
}
