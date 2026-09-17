import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pcmWave } from '../packages/protocol/voice.ts';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const phases=['acknowledge','building','present','wind-wait','wind-present'];
const clips={};const clipDirectory=process.argv[3];
const tone=Buffer.from(pcmWave(Float32Array.from({length:16000},(_,i)=>Math.sin(i*.08)*.015))).toString('base64');
for(const phase of phases)clips[phase]=clipDirectory?(await readFile(join(clipDirectory,phase+'.mp3'))).toString('base64'):tone;
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${join(tmpdir(),'eva-synthetic-weather-request.wav')}`]});
const context=await browser.newContext({viewport:{width:1440,height:960},permissions:['microphone'],recordVideo:{dir:join(output,'video'),size:{width:1440,height:960}}});
await context.addInitScript(()=>{
  window.__speech=[];window.__windVisible=[];
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){const entry={phase:window.__nextPhase,start:performance.now(),duration:this.buffer.duration,windVisible:!!document.querySelector('[data-testid="wind-panel"]')};window.__speech.push(entry);this.addEventListener('ended',()=>entry.end=performance.now());return start.apply(this,args);};
  new MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes)if(node instanceof HTMLElement && node.matches('[data-testid="wind-panel"]'))window.__windVisible.push(performance.now());}).observe(document,{childList:true,subtree:true});
});
const page=await context.newPage(),errors=[],requests=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
let failWind=false;
let transcript="What about the wind speed?";
await page.route('**/api/narration/status',r=>r.fulfill({json:{configured:true}}));
await page.route('**/api/narration/cancel',r=>r.fulfill({json:{cancelled:true}}));
await page.route('**/api/narration/speak',async r=>{const phase=r.request().postDataJSON().phase;requests.push(phase);await page.evaluate(p=>window.__nextPhase=p,phase);await r.fulfill(failWind&&phase==='wind-wait'?{status:502,json:{error:'narration_unavailable'}}:{json:{mime:'audio/mpeg',audioBase64:clips[phase]}});});
await page.route('**/api/voice/status',r=>r.fulfill({json:{configured:true}}));
await page.route('**/api/voice/transcribe',r=>r.fulfill({json:{text:transcript,model:'whisper-1'}}));
const shot=name=>page.screenshot({path:join(output,name+'.png'),omitBackground:true});
async function say(text){transcript=text;await page.getByRole('button',{name:'Speak request',exact:true}).click();await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();await page.waitForTimeout(1500);await page.getByRole('button',{name:'Send recording',exact:true}).click();}
async function askWind(){await say('What about the wind speed?');}
async function open(){await say('Show me the weather in Ithaca.');await page.locator('[data-assembly="ready"]').waitFor();}
async function fresh(){await page.keyboard.press('Escape');await page.getByRole('button',{name:'Open EVA'}).click();await open();}
try{
  await page.goto('http://127.0.0.1:1420');await page.waitForTimeout(500);await open();await page.waitForFunction(()=>window.__speech.some(s=>s.phase==='present'&&s.end),null,{timeout:30000});
  const card=page.getByTestId('weather-card');await page.getByRole('button',{name:'Resize weather panel'}).focus();await page.keyboard.press('ArrowLeft');
  const geometry=await card.boundingBox(),id=await card.getAttribute('data-card-id');
  await askWind();await page.getByTestId('wind-loading').waitFor();await page.waitForFunction(()=>window.__speech.some(s=>s.phase==='wind-wait'&&s.end));
  await page.waitForTimeout(2200);assert.equal(await page.getByTestId('wind-panel').count(),0);await shot('wind-building');
  await page.getByTestId('wind-panel').waitFor();await page.waitForFunction(()=>window.__speech.some(s=>s.phase==='wind-present'&&s.end));await shot('wind-ready');
  const timing=await page.evaluate(()=>({speech:window.__speech,windAt:window.__windVisible[0]}));const ack=timing.speech.find(s=>s.phase==='wind-wait'),present=timing.speech.find(s=>s.phase==='wind-present');
  assert.ok(timing.windAt-ack.end>=4900&&timing.windAt-ack.end<6200);assert.ok(present.start>=timing.windAt+650);assert.equal(present.windVisible,true);
  assert.deepEqual(requests,phases);assert.deepEqual(await card.boundingBox(),geometry);assert.equal(await card.getAttribute('data-card-id'),id);
  const revision=await card.getAttribute('data-revision');await askWind();await page.waitForTimeout(500);assert.equal(await card.getAttribute('data-revision'),revision);assert.deepEqual(requests,phases);checks.push({flow:timing,geometry,repeatDoesNotDuplicate:true});
  await page.emulateMedia({reducedMotion:'reduce'});await fresh();await askWind();await page.getByTestId('wind-loading').waitFor();await page.keyboard.press('Escape');const count=await page.evaluate(()=>window.__speech.length);await page.waitForTimeout(6500);assert.equal(await page.getByTestId('wind-panel').count(),0);assert.equal(await page.evaluate(()=>window.__speech.length),count);checks.push('Dismiss cancels wind timer and queued presentation');
  await page.getByRole('button',{name:'Open EVA'}).click();await open();await askWind();await page.locator('[data-testid="wind-loading"][data-printing="true"]').waitFor();
  await page.getByRole('button',{name:'Speak request',exact:true}).click();await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();await page.waitForTimeout(5500);assert.equal(await page.getByTestId('wind-loading').count(),0);assert.equal(await page.getByTestId('wind-panel').count(),0);await page.getByRole('button',{name:'Cancel',exact:true}).click();checks.push('New microphone request cancels wind construction');
  await askWind();await page.locator('[data-testid="wind-loading"][data-printing="true"]').waitFor();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});await page.waitForTimeout(5500);assert.equal(await page.getByTestId('wind-loading').count(),0);assert.equal(await page.getByTestId('wind-panel').count(),0);checks.push('Visibility cancellation clears pending wind');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open EVA'}).click();await open();failWind=true;await askWind();await page.getByTestId('wind-loading').waitFor();await page.getByText('Speech unavailable.',{exact:true}).waitFor();await page.getByTestId('wind-panel').waitFor();checks.push('Failed acknowledgement still reveals wind; reduced motion has static loading');
  assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({status:'passed',fixture:clipDirectory?'Actual v3 MP3s injected into local responses; synthetic microphone input and bounded Whisper transcript':'Synthetic tone and microphone input; injected Whisper/provider responses',checks,errors},null,2));await page.close();await page.video().saveAs(join(output,'wind-dialogue.webm'));console.log('Wind dialogue, five-second construction, geometry, repeat, cancellation and failure checks passed.');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:e.message,requests,checks,errors},null,2));throw e;}finally{await context.close();await browser.close();}
