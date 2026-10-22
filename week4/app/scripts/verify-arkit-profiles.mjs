/** Actual saved profiles through a real isolated read-only broker; no model calls. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';
const output=process.argv[2];if(!output)throw Error('Fresh evidence directory required.');
await mkdir(output,{recursive:false});
const directory=await mkdtemp(join(tmpdir(),'eva-benchmark-profiles-'));
const checks=[],errors=[],apiWrites=[],summaries=[];
let broker,server,browser;
async function cameraView(canvas) {
  return canvas.evaluate(element=>{
    const gl=element.getContext('webgl2')??element.getContext('webgl');
    const program=gl.getParameter(gl.CURRENT_PROGRAM);
    // All candidate objects use identity model transforms; inspect the actual
    // GPU view transform without adding test-only camera access to the renderer.
    const location=gl.getUniformLocation(program,'viewMatrix')??gl.getUniformLocation(program,'modelViewMatrix');
    const matrix=location&&gl.getUniform(program,location);
    if(!matrix||matrix.length!==16)throw Error('Rendered camera matrix unavailable');
    return Array.from(matrix);
  });
}
function sameCamera(actual,expected) {
  assert.equal(actual.length,16);
  assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<1e-5),'Matched switch must preserve the rendered camera transform');
}
async function renderedFrame(canvas) {
  return canvas.evaluate(async element=>{
    // Render synchronously through the public Home interaction, then read the
    // drawing buffer before its default non-preserved contents are discarded.
    element.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    const gl=element.getContext('webgl2')??element.getContext('webgl');
    const pixels=new Uint8Array(element.width*element.height*4);
    gl.readPixels(0,0,element.width,element.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const distinct=new Set();
    for(let i=0;i<pixels.length&&distinct.size<32;i+=4)distinct.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    if(distinct.size<4)throw Error('Drawing buffer comparison lacks rendered scene content');
    const png=element.toDataURL('image/png').split(',')[1];
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),b=>b.toString(16).padStart(2,'0')).join('');
    return {hash,png,width:element.width,height:element.height};
  });
}
try {
  const hosts=new Set();
  broker=await createBroker({directory,allowedHosts:hosts,
    runner:async()=>{throw Error('Cloud calls forbidden.');},
    completionRunner:async()=>{throw Error('New completion forbidden.');},
    shadoFetch:async()=>{throw Error('Shado forbidden.');}});
  server=broker.server;await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const host=`127.0.0.1:${server.address().port}`;hosts.add(host);
  const origin=`http://${host}`;
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  async function makeContext(options) {
    const context=await browser.newContext(options);
    await context.route('**/api/room-workflow/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()!=='GET')apiWrites.push(url.pathname);
      assert.equal(request.method(),'GET','Only read-only API access permitted');
      assert.ok(url.pathname==='/api/room-workflow/session'||url.pathname.startsWith('/api/room-workflow/benchmark/'));
      const response=await route.fetch({url:origin+url.pathname+url.search,timeout:190000});
      await route.fulfill({response});
    });
    return context;
  }
  const context=await makeContext({viewport:{width:1440,height:1100}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const profile of ['original','worldmirror-v1','vga-visual-v1']) {
    const query=profile==='original'?'':`&profile=${profile}`;
    const base='/api/room-workflow/benchmark/arkitscenes'+(profile==='original'?'':`/profiles/${profile}`);
    await page.goto(`http://127.0.0.1:1440/?scene=arkitscenes-room${query}`);
    await page.getByText('ML execution complete',{exact:true}).waitFor();
    await page.getByRole('button',{name:'WorldMirror 2.0 · matched photos',exact:true}).waitFor({timeout:5000});
    assert.equal(await page.getByText('Same seven photos · Relative scale · Registration between models is not accuracy evidence.',{exact:true}).count(),profile==='vga-visual-v1'?0:1,
      'Matched-input claim belongs only to the two matched profiles');
    await page.getByRole('button',{name:'Provisional completion',exact:true}).waitFor();
    // The broader profile now opens the separate authored aesthetic study.
    // This regression suite explicitly inspects the preserved fused candidate.
    await page.getByRole('button',{name:'Provisional completion',exact:true}).click();
    await page.getByRole('button',{name:'Surfaces',exact:true}).click();
    const selected=page.getByRole('combobox',{name:'Viewpoint'}),canvas=page.locator('canvas');
    assert.equal(await selected.inputValue(),profile==='vga-visual-v1'?'1':'0');
    const summary=await page.evaluate(async url=>{
      const data=await (await fetch(url)).json();
      const base=data.completion.variants.find(v=>v.id==='completed'),material=data.completion.variants.find(v=>v.id==='material');
      return {profile:data.profile.id,raw:data.result.analysis_geometry_sha256,
        completed:base.sha256,material:material?.sha256??null,
        materialInvariants:material?{
          physical:['positions','indices','normals','provenance','source_view_indices'].every(k=>JSON.stringify(base.geometry[k])===JSON.stringify(material.geometry[k])),
          photoColors:base.geometry.provenance.every((p,f)=>p!=='photo-estimated'||[0,1,2].every(c=>{
            const v=base.geometry.indices[f*3+c]*3;return [0,1,2].every(k=>base.geometry.colors[v+k]===material.geometry.colors[v+k]);
          })),
        }:null,
        photoHashes:data.photos.map(p=>p.sha256),photoUrls:data.photos.map(p=>p.url),
        elapsed:data.result.elapsed_seconds};
    },base);
    assert.equal(summary.profile,profile);summaries.push(summary);
    assert.equal(await page.getByRole('button',{name:'Provisional completion',exact:true}).getAttribute('aria-pressed'),'true');
    if(profile!=='vga-visual-v1')assert.equal(await page.getByRole('button',{name:'Inferred wall colors',exact:true}).count(),0);
    else {
      assert.ok(summary.material&&summary.materialInvariants.physical&&summary.materialInvariants.photoColors);
      const before=await canvas.screenshot({path:join(output,'material-before-surfaces.png')});
      await page.getByRole('button',{name:'Provenance',exact:true}).click();
      await canvas.screenshot({path:join(output,'material-before-provenance.png')});
      const beforeProvenance=await renderedFrame(canvas);
      await writeFile(join(output,'material-before-provenance-buffer.png'),Buffer.from(beforeProvenance.png,'base64'));
      await page.getByRole('button',{name:'Inferred wall colors',exact:true}).click();
      await page.getByText('These flat colors do not recover window texture or unseen details.',{exact:false}).waitFor();
      const after=await canvas.screenshot({path:join(output,'material-after-surfaces.png')});
      assert.notDeepEqual(after,before,'Optional inferred colors must visibly change supported walls');
      await page.getByRole('button',{name:'Provenance',exact:true}).click();
      await canvas.screenshot({path:join(output,'material-after-provenance.png')});
      const afterProvenance=await renderedFrame(canvas);
      await writeFile(join(output,'material-after-provenance-buffer.png'),Buffer.from(afterProvenance.png,'base64'));
      assert.equal(afterProvenance.hash,beforeProvenance.hash,
        'Provenance drawing-buffer pixels must remain identical, independent of fractional page crop offsets');
      summary.provenanceFrame={sha256:beforeProvenance.hash,width:beforeProvenance.width,height:beforeProvenance.height};
      await page.getByRole('button',{name:'Points',exact:true}).click();
      const materialHome=await canvas.screenshot({path:join(output,'material-after-points.png')});
      await canvas.focus();await page.keyboard.press('w');
      assert.notDeepEqual(await canvas.screenshot(),materialHome);
      await page.keyboard.press('Home');assert.deepEqual(await canvas.screenshot(),materialHome);
      await page.screenshot({path:join(output,'material-desktop.png'),fullPage:true});
      await page.getByRole('button',{name:'Provisional completion',exact:true}).click();
      await page.getByRole('button',{name:'Surfaces',exact:true}).click();
      assert.deepEqual(await canvas.screenshot(),before,'Original completion remains exactly recoverable');
      checks.push('Optional wall colors change appearance only; actual physical arrays/photo colors/provenance pixels unchanged, keyboard reset and original completion preserved');
    }
    assert.equal(await page.getByRole('img').count(),7);
    await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
    assert.deepEqual(await page.getByRole('img').evaluateAll(images=>images.map(i=>new URL(i.src).pathname)),summary.photoUrls);
    await canvas.screenshot({path:join(output,`${profile}-completed-interior.png`)});
    await page.getByRole('button',{name:'Points',exact:true}).click();
    const home=await canvas.screenshot({path:join(output,`${profile}-points.png`)});
    await canvas.focus();await page.keyboard.press('w');
    assert.notDeepEqual(await canvas.screenshot(),home,'Movement must change actual pixels');
    await page.keyboard.press('Home');
    assert.deepEqual(await canvas.screenshot(),home,'Home restores interior view');
    await page.keyboard.press('ArrowLeft');
    assert.notDeepEqual(await canvas.screenshot(),home,'Orbit must change actual pixels');
    await page.keyboard.press('Home');
    assert.equal(await canvas.evaluate(e=>e===document.activeElement),true);
    await page.getByRole('button',{name:'Provenance',exact:true}).click();
    assert.notDeepEqual(await canvas.screenshot({path:join(output,`${profile}-provenance.png`)}),home);
    await page.getByRole('button',{name:'Fused surfaces',exact:true}).click();
    await page.getByRole('button',{name:'Points',exact:true}).click();
    await canvas.screenshot({path:join(output,`${profile}-fused-points.png`)});
    await page.getByRole('button',{name:'Provisional completion',exact:true}).click();
    if(profile==='vga-visual-v1') {
      await selected.selectOption('0');
      await page.getByText('This source camera is outside the provisional room boundary.',{exact:false}).waitFor();
      await canvas.screenshot({path:join(output,'vga-source0-closure-occlusion.png')});
      await page.getByRole('button',{name:'Raw ML estimate',exact:true}).click();
      await canvas.screenshot({path:join(output,'vga-source0-raw.png')});
      await page.getByRole('button',{name:'Provisional completion',exact:true}).click();
      await selected.selectOption('1');
      assert.equal(await page.getByText('This source camera is outside the provisional room boundary.',{exact:false}).count(),0);
      await canvas.screenshot({path:join(output,'vga-source1-interior.png')});
      checks.push('Broader profile starts inside camera1; outside camera0 closure and raw source remain inspectable and labeled');
    }
    await page.screenshot({path:join(output,`${profile}-desktop.png`),fullPage:true});
    await canvas.evaluate(e=>(e.getContext('webgl2')??e.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext());
    await page.getByRole('alert').filter({hasText:'Graphics interrupted'}).waitFor();
    await page.getByRole('button',{name:'Reopen viewer'}).click();
    await page.waitForFunction(()=>!document.querySelector('[role=alert]'));
    await page.locator('canvas').screenshot({path:join(output,`${profile}-recovered.png`)});
    const phoneContext=await makeContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const phone=await phoneContext.newPage();phone.on('pageerror',e=>errors.push(e.message));
    await phone.goto(`http://127.0.0.1:1440/?scene=arkitscenes-room${query}`);
    await phone.getByText('ML execution complete',{exact:true}).waitFor();
    await phone.getByRole('button',{name:'Provisional completion',exact:true}).tap();
    await phone.getByRole('button',{name:'Points',exact:true}).tap();
    assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await phone.screenshot({path:join(output,`${profile}-phone-points.png`),fullPage:true});
    if(profile==='vga-visual-v1') {
      await phone.getByRole('button',{name:'Inferred wall colors',exact:true}).tap();
      await phone.getByRole('button',{name:'Points',exact:true}).tap();
      assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await phone.screenshot({path:join(output,'material-phone-points.png'),fullPage:true});
    }
    await phoneContext.close();
    checks.push(`${profile}: actual source hashes/7images, surface/points/provenance/fused, pixel movement/reset, focus, WebGL recovery and reduced-motion touch layout`);
  }
  assert.notEqual(summaries[0].raw,summaries[1].raw);
  assert.notEqual(summaries[0].completed,summaries[1].completed);
  assert.deepEqual(summaries[0].photoHashes,summaries[1].photoHashes,'WorldMirror and VGGT use identical ordered originals');
  assert.ok(summaries[0].photoHashes.every(h=>!summaries[2].photoHashes.includes(h)));
  await page.getByRole('link',{name:'Original photos',exact:true}).click();
  await page.getByText('ML execution complete',{exact:true}).waitFor();
  assert.equal(await page.getByRole('combobox',{name:'Viewpoint'}).inputValue(),'0');
  assert.equal(await page.getByRole('img').first().getAttribute('src'),summaries[0].photoUrls[0]);
  checks.push('Switching profiles preserves source isolation and the original default');
  const modelButtons={original:'VGGT · matched photos',worldmirror:'WorldMirror 2.0 · matched photos'};
  async function waitModel(name) {
    await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(b=>b.textContent===label&&b.getAttribute('aria-pressed')==='true'),name);
  }
  async function switchModel(name) {await page.getByRole('button',{name,exact:true}).click();await waitModel(name);}
  // The same model at Home must render identically whether opened directly or
  // reached from another model; sampling must not inherit the first mesh's pitch.
  async function uniformHome(target) {
    await target.getByRole('button',{name:'Provisional completion',exact:true}).click();
    await target.getByRole('combobox',{name:'Viewpoint'}).selectOption('0');
    for(const name of ['Points','Uniform dots','Source colors'])await target.getByRole('button',{name,exact:true}).click();
    return (await renderedFrame(target.locator('canvas'))).hash;
  }
  const direct=await context.newPage();
  await direct.goto('http://127.0.0.1:1440/?scene=arkitscenes-room&profile=worldmirror-v1');
  await direct.getByText('ML execution complete',{exact:true}).waitFor();
  const directHash=await uniformHome(direct);
  await switchModel(modelButtons.worldmirror);
  assert.equal(await uniformHome(page),directHash,'WorldMirror dots must not depend on which model loaded first');
  await direct.close();await switchModel(modelButtons.original);
  checks.push('Direct and switched WorldMirror uniform-dot Home frames are byte-identical');
  const canvas=page.locator('canvas'),selected=page.getByRole('combobox',{name:'Viewpoint'});
  const continuity=[];
  for(const [variant,label] of [['fused','Fused surfaces'],['raw','Raw ML estimate'],['completed','Provisional completion']]) {
    const priorFramePose=await cameraView(canvas);
    await page.getByRole('button',{name:label,exact:true}).click();
    if(variant!=='fused')assert.notDeepEqual(await cameraView(canvas),priorFramePose,'Explicit analysis/candidate frame change resets the view');
    await selected.selectOption('2');
    await page.getByRole('button',{name:'Points',exact:true}).click();
    await page.getByRole('button',{name:'Uniform dots',exact:true}).click();
    await page.getByRole('button',{name:'Source colors',exact:true}).click();
    await canvas.focus();await page.keyboard.press('Home');await page.keyboard.press('w');await page.keyboard.press('ArrowLeft');
    const pose=await cameraView(canvas),node=await canvas.elementHandle();
    await canvas.screenshot({path:join(output,`matched-${variant}-vggt.png`)});
    await switchModel(modelButtons.worldmirror);
    assert.equal(await node.evaluate(e=>e.isConnected),true,'Model switch must not remount the canvas');
    assert.equal(await selected.inputValue(),'2');
    for(const name of [label,'Points','Uniform dots','Source colors'])assert.equal(await page.getByRole('button',{name,exact:true}).getAttribute('aria-pressed'),'true');
    sameCamera(await cameraView(canvas),pose);
    await canvas.screenshot({path:join(output,`matched-${variant}-worldmirror.png`)});
    await page.screenshot({path:join(output,`matched-${variant}-worldmirror-desktop.png`),fullPage:true});
    await switchModel(modelButtons.original);sameCamera(await cameraView(canvas),pose);
    continuity.push({variant,pose,roundtrip:await cameraView(canvas)});
  }
  await page.getByRole('button',{name:'Paris matrix',exact:true}).click();
  const matrixPose=await cameraView(canvas);
  await canvas.screenshot({path:join(output,'matched-matrix-vggt.png')});
  await switchModel(modelButtons.worldmirror);
  assert.equal(await page.getByRole('button',{name:'Paris matrix',exact:true}).getAttribute('aria-pressed'),'true');
  sameCamera(await cameraView(canvas),matrixPose);
  await canvas.screenshot({path:join(output,'matched-matrix-worldmirror.png')});
  await page.getByText('Run details and limitations',{exact:true}).click();
  await page.getByRole('definition').filter({hasText:'WorldMirror 2.0'}).waitFor();
  assert.ok((await page.locator('main').innerText()).includes('SAM 3D'));
  await page.getByText('Run details and limitations',{exact:true}).click();
  await page.goBack();await waitModel(modelButtons.original);sameCamera(await cameraView(canvas),matrixPose);
  await page.goForward();await waitModel(modelButtons.worldmirror);sameCamera(await cameraView(canvas),matrixPose);
  await canvas.focus();await page.keyboard.press('Home');
  const homePose=await cameraView(canvas);assert.notDeepEqual(homePose,matrixPose,'Home restores the active model source camera');
  await selected.selectOption('3');assert.notDeepEqual(await cameraView(canvas),homePose,'Explicit source selection resets the view');
  await canvas.focus();await page.keyboard.press('w');
  const recoveryPose=await cameraView(canvas);
  await canvas.evaluate(e=>(e.getContext('webgl2')??e.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('alert').filter({hasText:'Graphics interrupted'}).waitFor();
  await page.getByRole('button',{name:'Reopen viewer'}).click();
  await page.waitForFunction(()=>!document.querySelector('[role=alert]'));
  sameCamera(await cameraView(canvas),recoveryPose);
  assert.equal(await page.getByRole('button',{name:'Paris matrix',exact:true}).getAttribute('aria-pressed'),'true');
  await canvas.screenshot({path:join(output,'matched-recovery.png')});
  checks.push('Raw/fused/enclosure model switching preserves actual GPU camera matrix, source and display controls; history, explicit source/Home reset and context recovery verified');
  await writeFile(join(output,'continuity.json'),JSON.stringify(continuity,null,2));

  // Hold a real read-only response so switching away exercises stale-request
  // cancellation rather than substituting synthetic geometry for either model.
  await switchModel(modelButtons.original);
  const wmRoute='**/api/room-workflow/benchmark/arkitscenes/profiles/worldmirror-v1';
  let release,arrived,finished;
  const held=new Promise(resolve=>{release=resolve;}),received=new Promise(resolve=>{arrived=resolve;}),delivered=new Promise(resolve=>{finished=resolve;});
  await context.route(wmRoute,async route=>{
    assert.equal(route.request().method(),'GET','Delayed profile request remains read-only');
    const response=await route.fetch({url:origin+'/api/room-workflow/benchmark/arkitscenes/profiles/worldmirror-v1'});
    arrived();await held;
    try {await route.fulfill({response});}catch(error){if(!/closed|disposed|canceled|cancelled|aborted|Invalid InterceptionId/i.test(String(error)))throw error;}finally{finished();}
  });
  await page.getByRole('button',{name:modelButtons.worldmirror,exact:true}).click();await received;
  assert.equal(await page.getByRole('button',{name:modelButtons.original,exact:true}).getAttribute('aria-pressed'),'true','Pending data must keep its original model identity');
  await switchModel(modelButtons.original);release();await delivered;
  await context.unroute(wmRoute);
  await page.waitForFunction(()=>!document.querySelector('[role=status]'));
  await waitModel(modelButtons.original);
  await context.route(wmRoute,route=>{
    assert.equal(route.request().method(),'GET','Failed profile request remains read-only');
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Controlled read-only load failure'})});
  });
  await page.getByRole('button',{name:modelButtons.worldmirror,exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Controlled read-only load failure'}).waitFor();
  await waitModel(modelButtons.original);assert.equal(await canvas.count(),1);
  await page.screenshot({path:join(output,'matched-load-failure.png'),fullPage:true});
  await context.unroute(wmRoute);
  await page.getByRole('button',{name:'Retry loading',exact:true}).click();await waitModel(modelButtons.worldmirror);
  checks.push('Delayed/cancelled and failed profile loads keep honest loaded identity; retry succeeds without new computation');

  const touchContext=await makeContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const touch=await touchContext.newPage();touch.on('pageerror',e=>errors.push(e.message));
  await touch.goto('http://127.0.0.1:1440/?scene=arkitscenes-room');
  await touch.getByText('ML execution complete',{exact:true}).waitFor();
  await touch.getByRole('button',{name:modelButtons.worldmirror,exact:true}).tap();
  await touch.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='WorldMirror 2.0 · matched photos'&&b.getAttribute('aria-pressed')==='true'));
  await touch.getByRole('button',{name:'Points',exact:true}).tap();
  assert.ok(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await touch.screenshot({path:join(output,'matched-phone.png'),fullPage:true});
  await touchContext.close();
  await page.getByRole('button',{name:modelButtons.original,exact:true}).focus();
  await page.keyboard.press('Enter');await waitModel(modelButtons.original);
  assert.equal(await page.getByRole('button',{name:modelButtons.original,exact:true}).evaluate(e=>e===document.activeElement),true);
  checks.push('Matched model buttons work with keyboard focus and reduced-motion touch emulation');
  await page.goto('http://127.0.0.1:1440/?scene=arkitscenes-room&profile=unknown');
  await page.getByRole('alert').filter({hasText:'Unknown saved room profile'}).waitFor();
  assert.equal(await page.locator('canvas').count(),0);
  checks.push('Unknown UI profile fails explicitly without loading another result');
  assert.deepEqual(errors,[]);assert.deepEqual(apiWrites,[]);
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'passed',checks,errors,summaries,apiWrites,
    limits:'Actual saved model results through a real isolated broker. No new inference/completion. Headless Edge with touch emulation; rendering/interaction checks do not establish accuracy or owner boundary acceptance.'},null,2));
} catch(error) {
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'failed',checks,errors,summaries,apiWrites,error:String(error)},null,2));
  throw error;
} finally {
  await browser?.close();if(broker)await broker.wait();
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  await rm(directory,{recursive:true,force:true});
}
