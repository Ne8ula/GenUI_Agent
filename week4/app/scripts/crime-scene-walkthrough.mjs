// Real canned-backend recording; no response fixtures, live provider or local GPU fallback.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdtemp,rm} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browserOptions} from './browser-options.mjs';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';

assert.equal(process.env.EVA_REQUIRE_NVIDIA,'1','Record only in the approved Modal GPU job');
const output=fileURLToPath(new URL('../../../docs/design/revisions/crime-scene-eva-v1/implementation/after/',import.meta.url));
const directory=await mkdtemp(join(tmpdir(),'eva-walkthrough-'));
const videos=await mkdtemp(join(tmpdir(),'eva-walkthrough-video-'));
const forbidden=async()=>{throw Error('Provider, credentials and investigator photo access disabled in canned walkthrough');};
const {server}=await createBroker({directory,
  sceneNotebookOptions:{key:async()=>'',fetcher:forbidden},
  sceneInvestigatorOptions:{demo:true,key:forbidden,fetcher:forbidden,resource:forbidden}});
let browser,context,page,video;
const report={status:'failed',mode:'real canned backend',provider_access:'disabled by throwing stubs',notes:'Disposable cloud storage, removed when the job ends',steps:[]};
const errors=[],started=Date.now();
function checkpoint(phase){
  report.phase=phase;report.elapsedSeconds=(Date.now()-started)/1000;
  // Persist before browser awaits: the worker's hard deadline can prevent finally from running.
  writeFileSync(output+'walkthrough.json',JSON.stringify({...report,errors},null,2));
  console.log(JSON.stringify({phase,elapsedSeconds:report.elapsedSeconds,errors}));
}
async function capture(name){
  checkpoint('capture-'+name);
  await page.screenshot({path:output+`walkthrough-${name}.png`});
  report.steps.push(name);checkpoint('captured-'+name);
  await page.waitForTimeout(2000); // Hold each recorded state long enough to read.
}
try{
  checkpoint('starting-browser');
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(1442,'127.0.0.1',resolve);});
  browser=await chromium.launch(browserOptions());
  context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1,recordVideo:{dir:videos,size:{width:1440,height:960}}});
  page=await context.newPage();video=page.video();page.setDefaultTimeout(10000);
  page.on('pageerror',e=>{errors.push(e.message);checkpoint(report.phase);});
  page.on('console',m=>{if((m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))||/Hologram figures unavailable/.test(m.text())){errors.push(m.text());checkpoint(report.phase);}});
  const replies=[];
  page.on('response',r=>{if(r.url().endsWith('/crime-scene/ask'))replies.push(r);});
  checkpoint('opening-scene');
  await page.goto('http://127.0.0.1:1440/?scene=crime-scene');
  await page.locator('.scene-markers:not([hidden])').waitFor({timeout:30000});
  const canvas=page.locator('.scene-stage > canvas');
  report.gpu=await canvas.evaluate(c=>{const gl=c.getContext('webgl2'),info=gl?.getExtension('WEBGL_debug_renderer_info');return info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):'';});
  assert.match(report.gpu,/NVIDIA/i);assert.doesNotMatch(report.gpu,/swiftshader|llvmpipe|software/i);
  await canvas.focus();await page.keyboard.down('ArrowRight');await page.waitForTimeout(350);await page.keyboard.up('ArrowRight');await page.keyboard.press('Home');
  await capture('room');
  await page.getByRole('button',{name:'Clues',exact:true}).click();
  await page.getByRole('button',{name:'Inspect tag 18: Upside down chair',exact:true}).click();
  await page.getByText('Tag 18 in view · hold Space to scan',{exact:true}).waitFor();
  await canvas.focus();await page.keyboard.down(' ');await page.waitForTimeout(1400);await page.keyboard.up(' ');
  await page.getByText('Detected · tag 18',{exact:true}).waitFor();
  await page.waitForTimeout(1800);await capture('chair');
  await page.getByRole('button',{name:'Open photo',exact:true}).click();
  await page.waitForFunction(()=>{const img=document.querySelector('dialog img');return img?.complete&&img.naturalWidth>0;});
  await capture('photo');
  await page.keyboard.press('Escape');
  assert.ok(await page.getByRole('button',{name:'Open photo',exact:true}).evaluate(e=>e===document.activeElement));
  await page.getByRole('button',{name:'Notes',exact:true}).click();
  await page.getByRole('button',{name:'Add note',exact:true}).click();
  const note='Demo note — temporary cloud storage, discarded after this run. Tag 18: compare the measured chair with its source photo. Cause and timing remain unknown.';
  await page.getByLabel('Note 1',{exact:true}).fill(note);
  await page.getByRole('button',{name:'Save notes',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Saved as private Markdown.'}).waitFor();
  await page.getByLabel('Note 1',{exact:true}).fill('Temporary unsaved edit');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  assert.equal(await page.getByLabel('Note 1',{exact:true}).inputValue(),note);
  await capture('notes');
  const nav=page.getByRole('navigation',{name:'Investigation'}).getByRole('button',{name:'Ask EVA',exact:true});
  await nav.click();
  const eva=page.locator('#scene-ask-eva');
  await eva.getByText(/Canned demo — replies and figure poses are written in advance/).waitFor();
  assert.doesNotMatch(await eva.innerText(),/Opus|Send this question, your scanned clues and their photos/);
  await eva.getByLabel('Question',{exact:true}).fill('How could the chair have been knocked over?');
  await capture('consent');
  await eva.getByRole('checkbox',{name:'Show a canned example using this question and the scanned tags',exact:true}).check();
  await eva.getByRole('button',{name:'Ask EVA',exact:true}).click();
  await eva.getByText('Canned example loaded. This is an authored hypothesis, not evidence.',{exact:true}).waitFor();
  assert.equal(replies.length,1);assert.equal(replies[0].status(),200);
  const reply=await replies[0].json();
  assert.match(reply.investigation.answer,/Canned demo reply — written in advance, not generated live/);
  assert.equal(reply.remaining,19);
  await capture('answer');
  checkpoint('opening-reconstruction');
  const figureResponse=page.waitForResponse(r=>r.url().endsWith('/benchmark/ffs/figures/human.glb')&&r.ok());
  await eva.getByRole('button',{name:'Play reconstruction',exact:true}).click();
  checkpoint('loading-figure');
  assert.equal(await (await figureResponse).finished(),null,'Figure body must finish loading before playback capture');
  checkpoint('rewinding-playback');
  const bar=page.locator('.scene-playback'),clock=bar.getByRole('slider',{name:'Reconstruction time',exact:true});
  // Restart after download so a slow transfer cannot consume the four-second example.
  await clock.fill('0');
  checkpoint('starting-playback');
  await bar.getByRole('button',{name:'Play reconstruction',exact:true}).click();
  checkpoint('advancing-playback');
  await page.waitForFunction(()=>Number(document.querySelector('.scene-playback input[type=range]')?.value)>=1.5);
  checkpoint('pausing-playback');
  await canvas.focus();await page.keyboard.press('Escape');
  await bar.getByRole('button',{name:'Play reconstruction',exact:true}).waitFor();
  const paused=await clock.inputValue();await page.waitForTimeout(300);assert.equal(await clock.inputValue(),paused);
  await capture('paused');
  checkpoint('clearing-playback');
  await canvas.focus();await page.keyboard.press('Escape');await bar.waitFor({state:'detached'});
  assert.ok(await nav.evaluate(e=>e===document.activeElement));
  checkpoint('reduced-motion');
  await page.emulateMedia({reducedMotion:'reduce'});
  await eva.getByRole('button',{name:'Play reconstruction',exact:true}).click();
  await bar.getByRole('button',{name:'Next step',exact:true}).click();assert.equal(await clock.inputValue(),'4');
  await bar.getByRole('button',{name:'Remove',exact:true}).click();await bar.waitFor({state:'detached'});
  await eva.getByRole('button',{name:'Close Ask EVA',exact:true}).click();
  await page.getByRole('button',{name:'Clues',exact:true}).click();
  await page.getByRole('button',{name:'Inspect tag 18: Upside down chair',exact:true}).click();
  await page.getByRole('button',{name:'Open photo',exact:true}).click();
  await page.waitForFunction(()=>{const img=document.querySelector('dialog img');return img?.complete&&img.naturalWidth>0;});
  await capture('evidence');
  assert.deepEqual(errors,[]);
  report.checksPassed=true;
}catch(error){
  report.error=String(error);report.failedPhase=report.phase;checkpoint('failure');
  await page?.screenshot({path:output+'walkthrough-failure.png',timeout:2000}).catch(()=>{});throw error;
}finally{
  try{
    checkpoint('closing-recording');
    await context?.close();
    checkpoint('saving-video');
    if(video)await video.saveAs(output+'walkthrough.webm');
  }finally{
    checkpoint('closing-browser');
    await browser?.close();
    checkpoint('cleaning-disposable-storage');
    if(server.listening)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    await rm(directory,{recursive:true,force:true});await rm(videos,{recursive:true,force:true});
  }
}
report.status='passed';checkpoint('complete');
