import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {browserOptions} from './browser-options.mjs';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';
const output=fileURLToPath(new URL('../../../docs/design/revisions/crime-scene-arkham-v2/implementation/after/',import.meta.url));
const directory=await mkdtemp(join(tmpdir(),'eva-scene-smoke-'));
const {server}=await createBroker({directory,sceneNotebookOptions:{key:async()=>'',fetcher:async()=>{throw Error('Provider disabled in smoke test');}}});
const ready=page=>page.locator('.scene-markers:not([hidden])').waitFor({timeout:30000});
async function clues(page){if(await page.getByRole('button',{name:'Clues',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('button',{name:'Clues',exact:true}).click();}
async function inspect(page,name){await clues(page);await page.getByRole('button',{name,exact:true}).click();}
const view=page=>page.locator('.scene-view-controls > details > summary');
const canvasPixels=page=>page.locator('canvas').screenshot({style:'.scene-caption,.scene-markers,.scene-view-controls,.scene-selected{visibility:hidden!important}'});
let browser;
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(1442,'127.0.0.1',resolve);});
 browser=await chromium.launch(browserOptions());
 const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if(message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))errors.push(message.text());});
 let scanRequests=0;page.on('request',r=>{if(r.url().endsWith('/benchmark/ffs/scene.ply'))scanRequests++;});
 let depthRequests=0;page.on('response',r=>{if(/\/benchmark\/ffs\/depth\/depth-IMG_\d{8}_\d{6}\.png$/.test(r.url())&&r.ok())depthRequests++;});
 await page.goto('http://127.0.0.1:1440/?scene=crime-scene');
 await page.locator('.scene-caption').getByText(/Analysing source photos · estimated depth/).waitFor();
 await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(e=>/\/depth\/depth-/.test(e.name)).length>=11,undefined,{timeout:20000});
 const intro=[];
 for(let i=1;i<=8;i++){await page.waitForTimeout(400);intro.push(await page.locator('canvas').screenshot({path:output+`intro-${i}.png`}));}
 assert.ok(new Set(intro.map(frame=>frame.toString('base64'))).size>=4,'Intro animates real photos and depth maps');
 assert.equal(depthRequests,11,'Each source photo has a verified depth map');
 await page.getByRole('button',{name:'Skip intro',exact:true}).click();await ready(page);
 if(process.env.EVA_REQUIRE_NVIDIA==='1'){
   const gpu=await page.locator('canvas').evaluate(canvas=>{
     const gl=canvas.getContext('webgl2'),info=gl?.getExtension('WEBGL_debug_renderer_info');
     return {renderer:info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '',vendor:info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : ''};
   });
   await writeFile(output+'gpu.json',JSON.stringify(gpu,null,2));
   assert.match(gpu.renderer,/NVIDIA/i,'Cloud verification requires hardware NVIDIA WebGL');
   assert.doesNotMatch(gpu.renderer,/swiftshader|llvmpipe|software/i,'Software fallback is not GPU evidence');
 }
 assert.equal(await page.locator('.scene-clues').isVisible(),false,'Start with the room, not an open clue list');
 assert.equal(await page.locator('.scene-notebook').isVisible(),false);
 assert.equal(await page.getByRole('button',{name:'Pause scan',exact:true}).isVisible(),false,'Secondary controls start collapsed');
 assert.equal(await page.locator('.scene-clue').count(),11);
 await page.locator('.scene-caption').getByText('Measured laser scan · detective view').waitFor();
 const live=await canvasPixels(page);await page.waitForTimeout(300);
 assert.ok(!(await canvasPixels(page)).equals(live),'Detective scan lines animate with normal motion');
 await page.screenshot({path:output+'desktop.png'});
 // Freeze time-based effects so the remaining comparisons are exact.
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
 const detective=await canvasPixels(page),initialRequests=scanRequests;
 await inspect(page,'Inspect tag 18: Upside down chair');await page.waitForTimeout(2150);
 assert.equal(await page.locator('.scene-examined').innerText(),'Not yet examined','Detective close-up is not examination of source evidence');
 await page.screenshot({path:output+'detective-selected.png'});
 await page.getByRole('button',{name:'Return to room',exact:true}).click();
 assert.ok((await canvasPixels(page)).equals(detective),'Selection highlight is display-only and reverts');
 await view(page).click();await page.getByRole('checkbox',{name:'Source colours',exact:true}).check();await view(page).click();
 assert.ok(!(await canvasPixels(page)).equals(detective),'Source colours differ from the detective treatment');
 await page.screenshot({path:output+'source-colours.png'});
 await view(page).click();await page.getByRole('checkbox',{name:'Source colours',exact:true}).uncheck();await view(page).click();
 assert.ok((await canvasPixels(page)).equals(detective),'Presentation switch preserves camera and geometry');
 assert.equal(scanRequests,initialRequests,'Presentation switches do not reload geometry');
 const cutaway=await canvasPixels(page),loaded=scanRequests;
 await view(page).click();await page.getByRole('checkbox',{name:'Full scan',exact:true}).check();
 assert.ok(!(await canvasPixels(page)).equals(cutaway),'Full scan restores hidden points');
 await view(page).click();await page.screenshot({path:output+'full-scan.png'});
 await view(page).click();await page.getByRole('checkbox',{name:'Full scan',exact:true}).uncheck();await view(page).click();
 assert.ok((await canvasPixels(page)).equals(cutaway),'Cutaway restores exact initial view');assert.equal(scanRequests,loaded,'Display toggle must not reload geometry');
 await page.locator('canvas').focus();await page.keyboard.press('w');
 assert.ok(!(await canvasPixels(page)).equals(cutaway),'Orthographic W zoom changes the view');
 await page.keyboard.press('Home');assert.ok((await canvasPixels(page)).equals(cutaway),'Home restores isometric overview');
 await clues(page);
 assert.ok(await page.locator('.scene-clue').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height>=68)),'Clue contents must fit each button');
 console.log('Clue images immediately after opening:',await page.locator('.scene-clue img').evaluateAll(images=>images.map(img=>({complete:img.complete,width:img.naturalWidth}))));
 await page.waitForFunction(()=>{
   const panel=document.querySelector('#scene-clues').getBoundingClientRect();
   const visible=[...document.querySelectorAll('.scene-clue img')].filter(img=>{const box=img.getBoundingClientRect();return box.top<panel.bottom&&box.bottom>panel.top;});
   return visible.length>0&&visible.every(img=>img.complete&&img.naturalWidth>0);
 },undefined,{timeout:10000});
 await page.screenshot({path:output+'clues.png'});
 await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').innerText(),'Clues');
 assert.ok(await page.locator('.scene-marker:not([hidden])').evaluateAll(nodes=>{
   const boxes=nodes.map(node=>node.getBoundingClientRect());
   return boxes.every((a,i)=>boxes.slice(i+1).every(b=>a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom));
 }),'Marker buttons must not overlap');
 // Only a Source colours close-up can count as examination, so dwell checks run there.
 await view(page).click();await page.getByRole('checkbox',{name:'Source colours',exact:true}).check();await view(page).click();
 for(const key of ['Home','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','w','s']){
   await inspect(page,'Inspect tag 17: 12-gauge case');
   await page.locator('canvas').focus();await page.keyboard.press(key);await page.waitForTimeout(2150);
   assert.equal(await page.locator('.scene-examined').innerText(),'Not yet examined',`${key} must cancel close-up dwell`);
   await page.keyboard.press('Escape');await page.getByRole('button',{name:'Reset view',exact:true}).click();
 }
 await page.locator('canvas').focus();await page.keyboard.press('Tab');
 const focusedMarker=await page.locator(':focus').getAttribute('data-marker');assert.ok(focusedMarker,'Tab reaches a visible marker');
 await page.keyboard.press('Enter');await page.getByRole('complementary',{name:'Selected clue'}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.locator(':focus').getAttribute('data-marker'),focusedMarker);
 await inspect(page,'Inspect tag 17: 12-gauge case');
 await page.locator('.scene-examined').getByText('Examined',{exact:true}).waitFor({timeout:4000});
 await page.screenshot({path:output+'inspector.png'});
 await page.getByRole('button',{name:'Return to room',exact:true}).click();
 await view(page).click();await page.getByRole('checkbox',{name:'Source colours',exact:true}).uncheck();await view(page).click();
 await inspect(page,'Inspect tag 1: Key');
 await page.getByText('Position unavailable. No scan marker has been assigned.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Open photo',exact:true}).click();
 await page.locator('dialog img').evaluate(img=>img.complete ? Promise.resolve() : new Promise(resolve=>img.onload=resolve));
 assert.ok(await page.locator('dialog img').evaluate(img=>img.naturalWidth>0));
 await page.screenshot({path:output+'photo.png'});
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Open photo',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.locator('.scene-examined').getByText('Examined',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Notes',exact:true}).click();
 assert.equal(await page.locator('.scene-selected').count(),0,'Only one panel is visible');
 await page.getByText("EVA's replies need an API key",{exact:true}).waitFor();
 await page.getByRole('button',{name:'Add note',exact:true}).click();
 await page.getByLabel('Note 1',{exact:true}).fill('Synthetic check: bottle 12? <script>not executed</script>');
 await page.getByText('Link tags',{exact:true}).click();
 await page.getByRole('checkbox',{name:'12 Beer bottle',exact:true}).check();
 await clues(page);assert.equal(await page.locator('.scene-notebook').isVisible(),false);
 await page.getByRole('button',{name:'Notes',exact:true}).click();
 assert.equal(await page.locator('.scene-clues').isVisible(),false);
 assert.match(await page.getByLabel('Note 1',{exact:true}).inputValue(),/Synthetic check/,'Switching panels preserves draft');
 await page.getByRole('button',{name:'Save notes',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Saved as private Markdown.'}).waitFor();
 await page.getByLabel('Note 1',{exact:true}).fill('Temporary edit');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 assert.match(await page.getByLabel('Note 1',{exact:true}).inputValue(),/Synthetic check/);
 await page.getByText('Link tags',{exact:true}).click();
 await page.locator('.scene-notebook').evaluate(node=>node.scrollTop=0);
 await page.screenshot({path:output+'notes.png'});
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Notes',exact:true}).evaluate(e=>e===document.activeElement),true);
 await page.getByRole('heading',{name:'Key',exact:true}).waitFor();
 await page.getByRole('button',{name:'Return to room',exact:true}).click();
 await page.reload();await ready(page);
 assert.equal(await page.locator('.scene-clue').getByText('Examined',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Notes',exact:true}).click();
 await page.getByLabel('Note 1',{exact:true}).waitFor();assert.match(await page.getByLabel('Note 1',{exact:true}).inputValue(),/Synthetic check/);
 await page.keyboard.press('Escape');
 const overview=await canvasPixels(page);
 await inspect(page,'Inspect tag 17: 12-gauge case');
 await view(page).click();await page.getByRole('button',{name:'Pause scan',exact:true}).click();
 await page.getByRole('heading',{name:'Scan paused',exact:true}).waitFor();
 await page.getByRole('button',{name:'Reopen scan',exact:true}).click();await ready(page);
 await view(page).click();await page.getByRole('button',{name:'Return to room',exact:true}).click();
 assert.ok((await canvasPixels(page)).equals(overview),'Return after reopen must restore overview position and orthographic zoom');
 await page.emulateMedia({reducedMotion:'reduce'});
 const first=await page.locator('.scene-stage').screenshot();await page.waitForTimeout(250);
 assert.ok((await page.locator('.scene-stage').screenshot()).equals(first),'Reduced motion must remain static');
 await page.screenshot({path:output+'reduced-motion.png'});
 let release;const blocked=new Promise(resolve=>release=resolve);
 await page.route('**/benchmark/ffs/scene.ply',async route=>{await blocked;await route.continue().catch(()=>{});});
 await page.reload();await page.getByRole('button',{name:'Cancel loading',exact:true}).click();
 await page.getByRole('heading',{name:'Scan paused',exact:true}).waitFor();release();
 await page.unroute('**/benchmark/ffs/scene.ply');
 await page.getByRole('button',{name:'Reopen scan',exact:true}).click();await ready(page);
 const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 const touch=await mobile.newPage();touch.on('pageerror',e=>errors.push(e.message));
 await touch.goto('http://127.0.0.1:1440/?scene=crime-scene');await ready(touch);
 assert.equal(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal page overflow');
 await touch.screenshot({path:output+'touch.png',fullPage:true});
 await touch.getByRole('button',{name:'Clues',exact:true}).tap();await touch.getByRole('button',{name:'Inspect tag 20: Smartphone',exact:true}).tap();
 await touch.getByRole('button',{name:'Open photo',exact:true}).tap();await touch.locator('dialog img').waitFor();
 await touch.getByRole('button',{name:'Close photo',exact:true}).tap();
 await touch.getByRole('button',{name:'Notes',exact:true}).tap();
 await touch.getByRole('button',{name:'Add note',exact:true}).tap();await touch.getByLabel('Note 1',{exact:true}).fill('Synthetic touch note');
 await touch.screenshot({path:output+'touch-notes.png'});
 await mobile.close();
 // Browser-boundary fixtures: these routes never reach the broker or Anthropic.
 let remaining=5,hold=false,releaseReply,submitted;
 await page.route('**/crime-scene/status',route=>route.fulfill({json:{available:true,remaining,max_tokens:2048}}));
 await page.route('**/crime-scene/reply',async route=>{
   remaining--;submitted?.();
   if(hold)await new Promise(resolve=>releaseReply=resolve);
   await route.fulfill({json:{text:'<img src=x onerror="window.sceneInjected=true"> Note 1 is an interpretation.',notes_revision:route.request().postDataJSON().revision,remaining}}).catch(()=>{});
 });
 await page.reload();await page.getByRole('button',{name:'Notes',exact:true}).click();
 const consent=page.getByRole('checkbox',{name:'I agree to send this saved notebook for one reply.',exact:true});
 await consent.check();await page.getByRole('button',{name:'Ask EVA (5 left)',exact:true}).click();
 await page.locator('.scene-reply').waitFor();
 assert.match(await page.locator('.scene-reply').innerText(),/<img/);assert.equal(await page.locator('.scene-reply img').count(),0);
 assert.equal(await page.evaluate(()=>window.sceneInjected),undefined);
 await page.getByLabel('Note 1',{exact:true}).fill('Changed interpretation');
 await page.getByText(/Your notes have changed since this reply/).waitFor();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 hold=true;
 for(const close of [false,true]){
   const started=new Promise(resolve=>submitted=resolve);
   await consent.check();await page.getByRole('button',{name:`Ask EVA (${remaining} left)`,exact:true}).click();await started;
   if(close){await clues(page);await page.getByRole('button',{name:'Notes',exact:true}).click();}
   else await page.getByRole('button',{name:'Cancel reply',exact:true}).click();
   await page.getByRole('status').filter({hasText:'Reply cancelled locally.'}).waitFor();
   await page.getByRole('button',{name:`Ask EVA (${remaining} left)`,exact:true}).waitFor();
   releaseReply();
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: photo/depth intro animates and skips, measured scan with animated detective view, source-colour-only examination, display-only highlight and source/detective canvas changes without overlay false positives; reversible cutaway without reload; orthographic zoom/reset/return; one panel with draft/selection continuity; scan, 11 clues, bounds, keyboard/focus/dwell, photos, Markdown/undo, loading/reply cancellation, text-only/stale replies, static reduced motion and emulated touch. No provider call.');
}finally{
 await browser?.close();
 if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
 await rm(directory,{recursive:true,force:true});
}
