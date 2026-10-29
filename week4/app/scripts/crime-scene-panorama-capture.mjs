// Real-scene verification only inside the approved Modal job; no fixtures or provider calls.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {browserOptions} from './browser-options.mjs';
import {assertInteriorDetail} from './panorama-quality.mjs';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';
assert.equal(process.env.EVA_REQUIRE_NVIDIA, '1', 'Run only inside the approved Modal GPU job');
const output=fileURLToPath(new URL('../../../docs/design/revisions/crime-scene-realsee-v1/implementation/after/',import.meta.url));
const directory=await mkdtemp(join(tmpdir(),'eva-panorama-')), videos=await mkdtemp(join(tmpdir(),'eva-panorama-video-'));
const forbidden=async()=>{throw Error('Provider access disabled for panorama verification');};
const {server}=await createBroker({directory,sceneNotebookOptions:{key:async()=>'',fetcher:forbidden},sceneInvestigatorOptions:{demo:true,key:forbidden,fetcher:forbidden,resource:forbidden}});
const report={status:'failed',viewport:{width:2560,height:1440},dpr:1,checks:[],errors:[],requests:[]};
let browser,context,page,video;
function save(phase){report.phase=phase;writeFileSync(output+'panorama.json',JSON.stringify(report,null,2));console.log(phase);}
async function capture(name){save(name);const bytes=await page.screenshot({path:output+name+'.png'});assert.equal(bytes.readUInt32BE(16),2560);assert.equal(bytes.readUInt32BE(20),1440);}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(1442,'127.0.0.1',resolve);});
  browser=await chromium.launch(browserOptions());
  context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,hasTouch:true,recordVideo:{dir:videos,size:report.viewport}});
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await context.addInitScript(()=>{
    window.__textureUploads=[];
    for(const name of ['texImage2D','texSubImage2D']){
      const original=WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name]=function(...args){
        const image=args.at(-1);if(image?.width&&image?.height)window.__textureUploads.push([image.width,image.height]);
        return original.apply(this,args);
      };
    }
  });
  page=await context.newPage();video=page.video();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))report.errors.push(message.text());});
  page.on('request',request=>{if(request.url().includes('/api/'))report.requests.push(new URL(request.url()).pathname);});
  save('load-real-candidate');
  const downloaded=page.waitForResponse(r=>r.url().endsWith('/realsee/scene.glb')&&r.ok());
  await page.goto('http://127.0.0.1:1440/?scene=crime-scene');
  const response=await downloaded;
  report.asset_sha256=hash(await response.body());
  assert.equal(report.asset_sha256,'138e407bcff0ca2c241860b80f48486bcafeb36038123099c0ca73a116fe5815');
  await page.locator('.panorama-app[data-phase="ready"]').waitFor({timeout:45000});
  const canvas=page.locator('.panorama-stage canvas');
  report.gpu=await canvas.evaluate(c=>{const gl=c.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'',drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};});
  assert.match(report.gpu.renderer,/NVIDIA/i);assert.doesNotMatch(report.gpu.renderer,/swiftshader|llvmpipe|software/i);
  report.textureUploads=await page.evaluate(()=>window.__textureUploads);
  assert.ok(report.textureUploads.some(([w,h])=>w===2048&&h===2048));
  assert.ok(report.textureUploads.some(([w,h])=>w===1024&&h===1024));
  await capture('panorama-inside');report.checks.push('exact GLB identity, NVIDIA, both decoded textures, native viewport');
  const initialInside=hash(await canvas.screenshot());
  const interiorPixels=await page.evaluate(async base64=>{
    const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
    const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    try {
      const sample=new OffscreenCanvas(64,64),ctx=sample.getContext('2d');
      if(!ctx)throw Error('Interior pixel inspection unavailable');
      ctx.drawImage(image,image.width*.2,image.height*.2,image.width*.6,image.height*.6,0,0,64,64);
      return Array.from(ctx.getImageData(0,0,64,64).data);
    } finally {image.close();}
  },(await canvas.screenshot()).toString('base64'));
  report.interior=assertInteriorDetail(interiorPixels);
  report.checks.push('interior central crop is not nearly uniform; manual quality acceptance still pending');
  await canvas.focus();
  const bounds=await canvas.boundingBox();assert.ok(bounds);
  await page.mouse.move(bounds.x+bounds.width*.5,bounds.y+bounds.height*.5);
  const beforeDrag=hash(await canvas.screenshot());
  await page.mouse.down();await page.mouse.move(bounds.x+bounds.width*.65,bounds.y+bounds.height*.55,{steps:8});await page.mouse.up();
  assert.notEqual(hash(await canvas.screenshot()),beforeDrag,'Mouse drag must move the view');
  const beforeWheel=hash(await canvas.screenshot());
  await page.mouse.wheel(0,-240);await page.waitForTimeout(150);
  assert.notEqual(hash(await canvas.screenshot()),beforeWheel,'Mouse wheel must move the view');
  report.checks.push('mouse drag look and wheel movement');
  await page.getByRole('button',{name:'Reset inside',exact:true}).click();
  await canvas.focus();await page.keyboard.press('ArrowRight');await capture('panorama-turned');
  assert.ok(await canvas.evaluate(c=>c===document.activeElement));
  report.focusOutline=await canvas.evaluate(c=>getComputedStyle(c).outlineStyle);assert.notEqual(report.focusOutline,'none');
  await page.keyboard.press('Escape');
  const paused=hash(await canvas.screenshot());await page.keyboard.press('ArrowLeft');assert.equal(hash(await canvas.screenshot()),paused);
  await page.getByRole('button',{name:'Resume navigation',exact:true}).click();
  await page.getByRole('button',{name:'Reset inside',exact:true}).click();
  assert.equal(hash(await canvas.screenshot()),initialInside,'Reset must restore the opening interior');
  await canvas.focus();await page.keyboard.press('ArrowUp');await capture('panorama-forward');
  assert.notEqual(hash(await canvas.screenshot()),initialInside,'Forward navigation must move inside');
  await page.getByRole('button',{name:'Reset inside',exact:true}).click();
  save('measuring-navigation');
  report.performance=await canvas.evaluate(async c=>{
    const gl=c.getContext('webgl2'),intervals=[],drawMs=[];let last;
    for(let i=0;i<180;i++){
      const now=await new Promise(requestAnimationFrame),start=performance.now();
      c.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));gl.finish();
      if(i>=30){intervals.push(now-last);drawMs.push(performance.now()-start);}last=now;
    }
    const sorted=[...intervals].sort((a,b)=>a-b),mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;
    return {method:'180 user-key-driven draws; 30 warmup, 150 samples; rAF intervals with synchronous GPU finish; video recorder active',samples:intervals.length,median_ms:sorted[Math.floor(sorted.length*.5)],p95_ms:sorted[Math.floor(sorted.length*.95)],max_ms:Math.max(...intervals),mean_fps:1000/mean,over_16_67_ms:intervals.filter(x=>x>16.67).length,draw_gpu_finish_mean_ms:drawMs.reduce((a,b)=>a+b,0)/drawMs.length,intervals_ms:intervals};
  });
  await page.getByRole('button',{name:'Reset inside',exact:true}).click();
  await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowUp');
  // A home-pose comparison also passes when remount forgets to restore the saved view.
  const beforeEvidence=hash(await canvas.screenshot());
  assert.notEqual(beforeEvidence,initialInside,'Camera continuity must start away from home');
  await page.getByRole('button',{name:'Original evidence',exact:true}).click();
  await page.locator('.scene-markers:not([hidden])').waitFor({timeout:45000});
  await capture('original-scan');
  await page.getByRole('button',{name:'Clues',exact:true}).click();
  await page.getByRole('button',{name:'Inspect tag 18: Upside down chair',exact:true}).click();
  await page.getByRole('button',{name:'Open photo',exact:true}).click();
  await page.waitForFunction(()=>{const image=document.querySelector('dialog img');return image?.complete&&image.naturalWidth>0;});
  await capture('original-photo');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Return to panorama room',exact:true}).click();
  await page.locator('.panorama-app[data-phase="ready"]').waitFor();
  assert.equal(hash(await canvas.screenshot()),beforeEvidence,'Camera must survive original-evidence round trip');
  report.checks.push('keyboard focus, pause interruption, inside/reset, original scan/photo access, camera continuity');
  await page.emulateMedia({reducedMotion:'reduce'});await capture('panorama-reduced');
  const stable=hash(await canvas.screenshot());await page.waitForTimeout(500);assert.equal(hash(await canvas.screenshot()),stable);
  report.checks.push('reduced-motion stable view');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Reset inside',exact:true}).tap();
  const beforeTap=hash(await canvas.screenshot());
  await page.getByRole('button',{name:'Turn left',exact:true}).tap();
  assert.notEqual(hash(await canvas.screenshot()),beforeTap,'Touch navigation must move the view');
  await page.screenshot({path:output+'panorama-mobile.png',fullPage:true});
  report.checks.push('390px responsive layout and touch tap navigation; pinch not checked');
  await page.setViewportSize(report.viewport);
  // Delayed fetch cancellation uses the real broker; abort before forwarding is not a synthetic asset.
  let release,started;const held=new Promise(resolve=>{release=resolve;}),downloadStarted=new Promise(resolve=>{started=resolve;});
  await page.route('**/realsee/scene.glb',async route=>{started();await held;await route.continue().catch(()=>{});});
  await page.reload();
  await Promise.race([downloadStarted,page.waitForTimeout(15000).then(()=>{throw Error('GLB download did not start');})]);
  await page.getByRole('button',{name:'Cancel loading',exact:true}).click();release();
  await page.locator('.panorama-app[data-phase="cancelled"]').waitFor();
  await page.unroute('**/realsee/scene.glb');
  await page.getByRole('button',{name:'Reopen room',exact:true}).click();
  await page.locator('.panorama-app[data-phase="ready"]').waitFor();await capture('panorama-reopened');
  report.checks.push('cancel during held real GLB request and reopen');
  const lostCanvas=await canvas.elementHandle();
  await canvas.evaluate(c=>{const extension=c.getContext('webgl2').getExtension('WEBGL_lose_context');if(!extension)throw Error('Context-loss test unavailable');extension.loseContext();});
  await page.locator('.panorama-app[data-phase="error"]').waitFor();
  await page.getByRole('button',{name:'Reopen room',exact:true}).click();
  await page.locator('.panorama-app[data-phase="ready"]').waitFor();
  assert.equal(await canvas.evaluate((c,old)=>c===old,lostCanvas),false,'Recovery requires a fresh canvas');
  await lostCanvas.dispose();await capture('panorama-context-recovered');
  report.checks.push('graphics context loss and fresh-canvas recovery');
  assert.deepEqual(report.errors,[]);
  assert.ok(!report.requests.some(url=>url.endsWith('/crime-scene/ask')||url.includes('/models/')||url.includes('/figures/')));
  report.status='passed';save('complete');
} catch(error) {
  report.error=String(error);save('failed');await page?.screenshot({path:output+'panorama-failure.png',timeout:2000}).catch(()=>{});throw error;
} finally {
  await context?.close();if(video)await video.saveAs(output+'panorama.webm');await browser?.close();
  if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  await rm(directory,{recursive:true,force:true});await rm(videos,{recursive:true,force:true});
  writeFileSync(output+'panorama.json',JSON.stringify(report,null,2));
}
