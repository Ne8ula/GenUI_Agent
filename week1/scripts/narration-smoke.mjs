import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve,join } from "node:path";
import { pcmWave } from "../packages/protocol/voice.ts";
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const samples=Float32Array.from({length:16000},(_,i)=>Math.sin(i*.08)*.015);
const audioBase64=Buffer.from(pcmWave(samples)).toString('base64');
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:join(output,'video'),size:{width:1440,height:960}}});
await context.addInitScript(()=>{
  window.__speech=[];window.__stops=0;
  const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start=function(...args){window.__speech.push({stage:document.querySelector('main')?.dataset.assembly,time:performance.now()});return start.apply(this,args);};
  AudioBufferSourceNode.prototype.stop=function(...args){window.__stops++;return stop.apply(this,args);};
});
const page=await context.newPage();const errors=[],requests=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
let mode='normal';
await page.route('**/api/narration/status',route=>route.fulfill({json:{configured:true}}));
await page.route('**/api/narration/cancel',route=>route.fulfill({json:{cancelled:true}}));
await page.route('**/api/narration/speak',async route=>{
  const request=route.request().postDataJSON();requests.push(request.phase);
  if(mode==='slow')await new Promise(r=>setTimeout(r,3000));
  await route.fulfill(mode==='failure'?{status:502,json:{error:'narration_unavailable'}}:{json:{mime:'audio/mpeg',audioBase64}}).catch(()=>{});
});
const open=()=>page.getByRole('button',{name:'Weather',exact:false}).first().click();
try{
  await page.goto('http://127.0.0.1:1420');await page.waitForTimeout(400);await open();
  await page.waitForFunction(()=>window.__speech.length===3,{},{timeout:15000});
  assert.deepEqual(requests,['acknowledge','building','present']);
  const spoken=await page.evaluate(()=>window.__speech);assert.equal(spoken[0].stage,'loading');assert.equal(spoken[1].stage,'loading');assert.equal(spoken[2].stage,'ready');
  assert.ok(spoken[1].time-spoken[0].time>=900,'Sentences cannot overlap');
  await page.screenshot({path:join(output,'presented.png')});
  await page.getByRole('button',{name:'Quiet mode'}).click();assert.ok(await page.evaluate(()=>window.__stops>0));
  checks.push({orderedSpeech:spoken,phases:requests.slice(),quietStopsPlayback:true});
  await page.getByRole('button',{name:'Quiet on'}).click();await page.getByRole('button',{name:'Dismiss'}).click();await page.getByRole('button',{name:'Open EVA'}).click();
  mode='slow';const count=await page.evaluate(()=>window.__speech.length);await open();await page.waitForTimeout(250);await page.getByRole('button',{name:'Dismiss'}).click();await page.waitForTimeout(3200);assert.equal(await page.evaluate(()=>window.__speech.length),count);checks.push('Dismiss rejects late synthesized audio');
  await page.getByRole('button',{name:'Open EVA'}).click();mode='failure';await open();await page.getByText('Speech unavailable.',{exact:true}).waitFor();await page.locator('[data-assembly="ready"]').waitFor();checks.push('Provider failure leaves dashboard usable');
  await page.screenshot({path:join(output,'speech-failure.png')});
  assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({status:'passed',fixture:'Injected provider with synthetic tone WAV decoded by real Web Audio; not ElevenLabs voice quality evidence',checks,errors},null,2));
  await page.close();await page.video().saveAs(join(output,'narration-flow.webm'));console.log('Narration ordering, readiness, playback cancellation and failure checks passed.');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:e.message,requests,checks,errors},null,2));throw e;}finally{await context.close();await browser.close();}
