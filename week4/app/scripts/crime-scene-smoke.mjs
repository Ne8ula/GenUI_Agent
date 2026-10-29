import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {browserOptions} from './browser-options.mjs';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';
const output=fileURLToPath(new URL('../../../docs/design/revisions/crime-scene-eva-v1/implementation/after/',import.meta.url));
const {Ajv2020}=createRequire(new URL('../../package.json',import.meta.url))('ajv/dist/2020.js');
const workflow=name=>readFile(new URL('../../../scripts/room_workflow/'+name,import.meta.url),'utf8').then(JSON.parse);
const directory=await mkdtemp(join(tmpdir(),'eva-scene-smoke-'));
const {server}=await createBroker({directory,sceneNotebookOptions:{key:async()=>'',fetcher:async()=>{throw Error('Provider disabled in smoke test');}}});
const ready=page=>page.locator('.scene-markers:not([hidden])').waitFor({timeout:30000});
async function clues(page){if(await page.getByRole('button',{name:'Clues',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('button',{name:'Clues',exact:true}).click();}
async function inspect(page,name){await clues(page);await page.getByRole('button',{name,exact:true}).click();}
const view=page=>page.locator('.scene-view-controls > details > summary');
const canvasPixels=page=>page.locator('.scene-stage > canvas').screenshot({style:'.scene-caption,.scene-markers,.scene-view-controls,.scene-selected,.scene-reticle,.scene-scan-status,.scene-timeline,.scene-playback,.scene-ask-eva,.scene-vignette{visibility:hidden!important}'});
let browser,page,passed=false;
try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(1442,'127.0.0.1',resolve);});
 browser=await chromium.launch(browserOptions());
 page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',message=>{if((message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))||/Hologram figures unavailable/.test(message.text()))errors.push(message.text());});
 let scanRequests=0;page.on('request',r=>{if(r.url().endsWith('/benchmark/ffs/scene.ply'))scanRequests++;});
 const segments=new Set();let figureRequests=0;page.on('response',r=>{
   const name=r.url().match(/\/benchmark\/ffs\/segments\/(marker-\d{2})\.u32$/)?.[1];if(name&&r.ok())segments.add(name);
   if(r.url().endsWith('/benchmark/ffs/figures/human.glb')&&r.ok())figureRequests++;
 });
 let depthRequests=0;page.on('response',r=>{if(/\/benchmark\/ffs\/depth\/depth-IMG_\d{8}_\d{6}\.png$/.test(r.url())&&r.ok())depthRequests++;});
 await page.goto('http://127.0.0.1:1440/?scene=crime-scene');
 await page.locator('.scene-caption').getByText('Opening measured scan').waitFor();
 await ready(page);
 if(process.env.EVA_REQUIRE_NVIDIA==='1'){
   const gpu=await page.locator('.scene-stage > canvas').evaluate(canvas=>{
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
 // Capture first and fail fast on shader/page errors, so a failure still leaves evidence.
 await page.screenshot({path:output+'desktop.png'});
 assert.deepEqual(errors,[],'No shader or page errors after loading');
 assert.ok(await page.locator('.scene-beacon-arrow').isVisible(),'The first beacon starts behind the viewer, so an edge arrow points to it');
 // Hold to scan with normal motion so the reconstruction is captured while it condenses.
 await inspect(page,'Inspect tag 18: Upside down chair');
 await page.getByText('Tag 18 in view · hold Space to scan',{exact:true}).waitFor();
 await page.locator('.scene-stage > canvas').focus();await page.keyboard.down(' ');await page.waitForTimeout(600);
 await page.screenshot({path:output+'scan-progress.png'});
 await page.waitForTimeout(800);await page.keyboard.up(' ');
 await page.getByText('Detected · tag 18',{exact:true}).waitFor();
 await page.locator('.scene-card canvas').waitFor();
 await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>/depth\/depth-IMG_20240306_133552\.png$/.test(e.name)));
 await page.waitForTimeout(900);await page.screenshot({path:output+'hologram.png'});
 // The first beacon (tag 13) starts behind the viewer, so motion is checked on the hologram in view.
 const live=await canvasPixels(page);await page.waitForTimeout(300);
 assert.ok(!(await canvasPixels(page)).equals(live),'Hologram sparkle and particles animate with normal motion');
 assert.equal(await page.locator('.scene-examined').innerText(),'Not yet examined','Scanning is not examination of source evidence');
 assert.ok(depthRequests>=1,'Evidence card loads the verified depth map');
 // Owner review approved markers 01, 02, 05, 07 and 08 (tags 17, 69, 13, 18, 21); rejected segments are never fetched.
 for(let i=0;i<100&&segments.size<5;i++)await page.waitForTimeout(100);
 assert.deepEqual([...segments].sort(),['marker-01','marker-02','marker-05','marker-07','marker-08'],'Only approved segments load');
 // A segment hologram has no note and a fitted model names its fit; only the sphere fallback reads "approximate region".
 await page.waitForFunction(()=>!document.querySelector('.scene-hologram-note')?.textContent.includes('approximate region'),undefined,{timeout:10000});
 // Freeze time-based effects so the remaining comparisons are exact.
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
 await page.getByRole('button',{name:'Return to room',exact:true}).click();
 await page.getByRole('button',{name:'Reset view',exact:true}).click();
 const detective=await canvasPixels(page),initialRequests=scanRequests;
 // Looking at the ceiling finds nothing; releasing early cancels.
 await page.locator('.scene-stage > canvas').focus();
 await page.keyboard.down('ArrowUp');await page.waitForTimeout(900);await page.keyboard.up('ArrowUp');
 assert.ok(!(await canvasPixels(page)).equals(detective),'Arrow keys look around');
 await page.keyboard.down(' ');await page.waitForTimeout(1400);await page.keyboard.up(' ');
 await page.getByText('No evidence',{exact:true}).waitFor();
 await page.keyboard.down(' ');await page.waitForTimeout(300);await page.keyboard.up(' ');
 await page.getByText('Scan cancelled',{exact:true}).waitFor();
 await page.keyboard.press('Home');assert.ok((await canvasPixels(page)).equals(detective),'Home returns to the scanner position');
 await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');
 assert.ok(!(await canvasPixels(page)).equals(detective),'W walks forward');
 await page.keyboard.press('Home');
 const box=await page.locator('.scene-stage > canvas').boundingBox();
 await page.mouse.move(box.x+60,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+180,box.y+box.height/2,{steps:4});await page.mouse.up();
 assert.ok(!(await canvasPixels(page)).equals(detective),'Dragging looks around');
 await page.keyboard.press('Home');assert.ok((await canvasPixels(page)).equals(detective),'Home restores the view after dragging');
 // Timeline is the photographer's capture order; E/Q step it and move the beacon.
 assert.match(await page.locator('.scene-timeline p').innerText(),/^Photographed 13:34:42 · tag 13/);
 // From the scanner position tags 13 and 22 both lie outside the view (GPU run v5), so the edge chevron shows the move.
 const arrowAt=()=>page.locator('.scene-beacon-arrow').evaluate(n=>n.hidden?'hidden':`${n.style.left},${n.style.top}`);
 const arrowMoved=(from,message)=>page.waitForFunction(from=>{const n=document.querySelector('.scene-beacon-arrow');return n&&!n.hidden&&`${n.style.left},${n.style.top}`!==from;},from,{timeout:5000}).catch(()=>assert.fail(message));
 const firstArrow=await arrowAt();assert.notEqual(firstArrow,'hidden','Off-screen beacon shows an edge chevron');
 await page.keyboard.press('e');
 assert.match(await page.locator('.scene-timeline p').innerText(),/^Photographed 13:34:54 · tag 22/);
 await arrowMoved(firstArrow,'Beacon moves to the next photographed clue');
 const nextArrow=await arrowAt();
 await page.screenshot({path:output+'timeline.png'});
 await page.keyboard.press('q');await arrowMoved(nextArrow,'Q steps the beacon back');
 assert.equal(await arrowAt(),firstArrow,'Q returns the beacon to the first clue');
 assert.ok((await canvasPixels(page)).equals(detective),'Q steps back');
 await view(page).click();await page.getByRole('checkbox',{name:'Source colours',exact:true}).check();await view(page).click();
 assert.ok(!(await canvasPixels(page)).equals(detective),'Source colours differ from the detective treatment');
 await page.screenshot({path:output+'source-colours.png'});
 await view(page).click();await page.getByRole('checkbox',{name:'Source colours',exact:true}).uncheck();await view(page).click();
 assert.ok((await canvasPixels(page)).equals(detective),'Presentation switch preserves camera and geometry');
 assert.equal(scanRequests,initialRequests,'Presentation switches, walking and scanning do not reload geometry');
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
   await page.locator('.scene-stage > canvas').focus();await page.keyboard.press(key);await page.waitForTimeout(2150);
   assert.equal(await page.locator('.scene-examined').innerText(),'Not yet examined',`${key} must cancel close-up dwell`);
   await page.keyboard.press('Escape');await page.getByRole('button',{name:'Reset view',exact:true}).click();
 }
 await page.locator('.scene-stage > canvas').focus();await page.keyboard.press('Tab');
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
 await page.locator('.scene-notebook').getByText("EVA's replies need an API key",{exact:true}).waitFor();
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
 assert.ok((await canvasPixels(page)).equals(overview),'Return after reopen must restore the standing position and view direction');
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
 // Ask EVA: browser-boundary fixtures for crime-scene/investigation and crime-scene/ask; the broker's provider is never reached.
 const research=(await workflow('eva-research.json')).slice(0,2).map(({id,citation,verification})=>({id,citation,verification}));
 const valid=new Ajv2020({strict:true}).compile(await workflow('eva-investigation.schema.json'));
 const chair=[0.18,-1.63,0];// tag 18 marker in display metres
 const investigation={answer:'Synthetic smoke fixture, not EVA output: one hypothesis is that the chair was tipped over during a scuffle. The scanned clues do not establish who moved it.',
   inconsistencies:[{claim:'The reddish traces are staged applications, so no physics is inferred from them.',basis:'research',source_ids:[research[0].id]}],
   look_for:[{kind:'contact marks',where:'chair back and the floor beside tag 18',why:'A fall would leave scuffs where the back met the floor.'}],
   reconstruction:{title:'Synthetic fixture: chair tipped over',hypothetical:true,actors:[{id:'A',label:'Person A'},{id:'B',label:'Person B'}],steps:[
     {t:0,actor:'A',pose:'stand',position:[0.75,-1.2],facing:-2.4,object_moves:[{tag:18,state:'upright',position:chair}],caption:'A stands beside the upright chair.'},
     {t:4,actor:'A',pose:'walk',position:[0.5,-1.4],facing:-2.4,object_moves:[],caption:'A steps toward the chair.'},
     {t:8,actor:'B',pose:'walk',position:[-0.3,-2],facing:0.8,object_moves:[],caption:'B approaches from the other side.'},
     {t:12,actor:'A',pose:'push',position:[0.4,-1.5],facing:-2.4,object_moves:[{tag:18,state:'current',position:chair}],caption:'The chair goes over into its scanned position.'}]},
   citations:research.map(r=>r.id)};
 assert.ok(valid(investigation),'Fixture follows eva-investigation.schema.json');
 let evaRemaining=20,revision='h0',invalid=false;const asked=[];
 await page.route('**/crime-scene/investigation',route=>route.fulfill({json:{available:true,remaining:evaRemaining,max_tokens:8192,history_revision:revision,research,turns:[]}}));
 await page.route('**/crime-scene/ask',route=>{
   asked.push(route.request().postDataJSON());evaRemaining--;
   if(invalid)return route.fulfill({status:502,json:{error:"EVA's reconstruction was invalid"}});
   revision='h1';return route.fulfill({json:{investigation,transcript_revision:revision,remaining:evaRemaining}});
 });
 await page.emulateMedia({reducedMotion:'no-preference'});await page.reload();await ready(page);
 const evaNav=page.getByRole('navigation',{name:'Investigation'}).getByRole('button',{name:/^Ask EVA/});
 assert.equal(await evaNav.innerText(),'Ask EVA (scan a clue first)');assert.ok(await evaNav.isDisabled(),'Ask EVA needs a scanned clue');
 await inspect(page,'Inspect tag 18: Upside down chair');
 await page.getByText('Tag 18 in view · hold Space to scan',{exact:true}).waitFor();
 await page.locator('.scene-stage > canvas').focus();await page.keyboard.down(' ');await page.waitForTimeout(1400);await page.keyboard.up(' ');
 await page.getByText('Detected · tag 18',{exact:true}).waitFor();
 assert.ok(await evaNav.isEnabled());assert.equal(await evaNav.innerText(),'Ask EVA');
 await page.waitForFunction(()=>!document.querySelector('.scene-hologram-note')?.textContent.includes('approximate region'),undefined,{timeout:10000});
 // Let the scan build finish so the capture shows the settled segment hologram.
 await page.waitForTimeout(1800);await page.screenshot({path:output+'segment-hologram.png'});
 await evaNav.click();
 const eva=page.locator('#scene-ask-eva'),consentEva=eva.getByRole('checkbox',{name:'Send this question, your scanned clues and their photos',exact:true});
 await eva.getByText('20 of 20 left',{exact:true}).waitFor();
 await eva.getByLabel('Question',{exact:true}).fill('How could the chair have been knocked over?');
 await consentEva.check();await eva.getByRole('button',{name:'Ask EVA',exact:true}).click();
 await eva.getByText(`${research[0].citation} (verification: ${research[0].verification})`,{exact:true}).waitFor();
 assert.deepEqual(asked[0],{question:'How could the chair have been knocked over?',scanned:[18],history_revision:'h0',consent:true},'EVA receives only the question, scanned tags and revision');
 await eva.getByText('19 of 20 left',{exact:true}).waitFor();
 await page.screenshot({path:output+'eva-answer.png'});
 await eva.getByRole('button',{name:'Play reconstruction',exact:true}).click();
 const bar=page.locator('.scene-playback'),clock=bar.getByRole('slider',{name:'Reconstruction time',exact:true});
 assert.equal(await bar.locator('.scene-hypothesis').innerText(),"EVA's hypothesis — not evidence");
 await page.waitForTimeout(1500);assert.ok(Number(await clock.inputValue())>0,'Play advances the reconstruction clock');
 await page.waitForTimeout(2500);await page.screenshot({path:output+'playback.png'});
 assert.ok(figureRequests>=1,'Playback loads the verified figure asset');
 await page.locator('.scene-stage > canvas').focus();await page.keyboard.press('Escape');
 await bar.getByRole('button',{name:'Play reconstruction',exact:true}).waitFor();
 const paused=await clock.inputValue();await page.waitForTimeout(300);assert.equal(await clock.inputValue(),paused,'First Escape pauses');
 // Sparkle animates with normal motion, so the playback-driven canvas change is checked with effects frozen.
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);
 await clock.fill('0');await page.waitForTimeout(300);const atStart=await canvasPixels(page);
 await clock.fill('8');await page.waitForTimeout(300);
 assert.ok(!(await canvasPixels(page)).equals(atStart),'Moving the reconstruction clock to the step with B moves the figures');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.scene-stage > canvas').focus();await page.keyboard.press('Escape');await bar.waitFor({state:'detached'});
 assert.equal(await evaNav.evaluate(e=>e===document.activeElement),true,'Second Escape clears the hypothesis and returns focus');
 // Reduced motion: no autoplay, a step holds still, and only stepping changes the canvas.
 await page.emulateMedia({reducedMotion:'reduce'});
 await eva.getByRole('button',{name:'Play reconstruction',exact:true}).click();
 const next=bar.getByRole('button',{name:'Next step',exact:true});await next.waitFor();
 await page.waitForTimeout(300);const held=await canvasPixels(page);await page.waitForTimeout(250);
 assert.ok((await canvasPixels(page)).equals(held),'Reduced motion holds a reconstruction step still');
 await next.click();assert.equal(await clock.inputValue(),'4','Next step moves to the second step');
 await bar.getByRole('button',{name:'Remove',exact:true}).click();await bar.waitFor({state:'detached'});
 invalid=true;await consentEva.check();await eva.getByRole('button',{name:'Ask EVA',exact:true}).click();
 await eva.getByText("EVA's reconstruction was invalid",{exact:true}).waitFor();
 await eva.getByText('18 of 20 left',{exact:true}).waitFor();
 assert.equal(await eva.locator('.scene-investigation').count(),0,'An invalid reply shows no reconstruction');
 assert.equal(asked[1].history_revision,'h1');assert.equal(asked.length,2);
 assert.deepEqual(errors,[]);passed=true;
 console.log('PASS: first-person measured scan with look/walk/Home, hold-to-scan reconstruction with detected/no-evidence/cancel, approved segments only, depth evidence card, capture-order timeline and beacon, source-colour-only examination, source/detective switch without reload; one panel with draft/selection continuity; scan, 11 clues, bounds, keyboard/focus/dwell, photos, Markdown/undo, loading/reply cancellation, text-only/stale replies, static reduced motion and emulated touch; Ask EVA gated on a scan, schema-valid fixture answer with verified sources, hypothesis badge, playback, Escape pause/clear, clock-driven figure change, reduced-motion stepping, invalid reply and remaining count. No provider call.');
}finally{
 if(!passed)await page?.screenshot({path:output+'failure.png'}).catch(()=>{});
 await browser?.close();
 if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
 await rm(directory,{recursive:true,force:true});
}
