import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pcmWave } from '../packages/protocol/voice.ts';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const live=process.argv.includes('--live');
const clipDirectory=process.argv.includes('--clips')?process.argv[process.argv.indexOf('--clips')+1]:null;
const clips={};
if(clipDirectory)for(const phase of ['acknowledge','building','present'])clips[phase]=(await readFile(join(clipDirectory,phase+'.mp3'))).toString('base64');
const audioBase64=Buffer.from(pcmWave(Float32Array.from({length:16000},(_,i)=>Math.sin(i*.08)*.015))).toString('base64');
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:join(output,'video'),size:{width:1440,height:960}}});
await context.addInitScript(()=>{
  window.__speech=[];window.__states=[];
  new MutationObserver(changes=>{
    for(const change of changes)if(change.target instanceof HTMLElement && change.target.matches('main[data-assembly]'))window.__states.push({stage:change.target.dataset.assembly,time:performance.now()});
  }).observe(document,{subtree:true,attributes:true,attributeFilter:['data-assembly']});
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args){
    const entry={stage:document.querySelector('main')?.dataset.assembly,start:performance.now(),duration:this.buffer.duration};
    window.__speech.push(entry);this.addEventListener('ended',()=>entry.end=performance.now());return start.apply(this,args);
  };
});
const page=await context.newPage(),errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
let mode='normal';
if(!live){
  await page.route('**/api/narration/status',r=>r.fulfill({json:{configured:true}}));
  await page.route('**/api/narration/cancel',r=>r.fulfill({json:{cancelled:true}}));
  await page.route('**/api/narration/speak',async r=>{
    const phase=r.request().postDataJSON().phase;requests.push(phase);
    if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,3000));
    await r.fulfill(mode==='failure'?{status:502,json:{error:'narration_unavailable'}}:{json:{mime:'audio/mpeg',audioBase64:clips[phase]??audioBase64}}).catch(()=>{});
  });
}
const open=()=>page.getByRole('button',{name:'Weather',exact:false}).first().click();
const shot=name=>page.screenshot({path:join(output,name+'.png'),omitBackground:true});
const reopen=async()=>{await page.keyboard.press('Escape');await page.getByRole('button',{name:'Open EVA'}).click();};
try{
  await page.goto('http://127.0.0.1:1420');await page.waitForTimeout(500);
  for(let run=0;run<(live?1:2);run++){
    const count=await page.evaluate(()=>window.__speech.length),began=await page.evaluate(()=>performance.now());await open();
    if(run===0){await page.waitForTimeout(4000);await shot('memory');await page.waitForTimeout(4000);await shot('raster');await page.waitForTimeout(4500);await shot('reveal');}
    await page.locator('[data-assembly="ready"]').waitFor();const ready=await page.evaluate(()=>window.__states.findLast(s=>s.stage==='ready').time);
    await page.waitForFunction(n=>window.__speech.length>=n+3&&window.__speech[n+2].end,count,{timeout:60000});
    const speech=await page.evaluate(n=>window.__speech.slice(n),count);
    assert.deepEqual(speech.map(s=>s.stage),['loading','loading','ready']);
    assert.ok(ready-began>=14900&&ready-began<18000);
    assert.ok(speech[1].start-began>=4950);
    assert.ok(speech[1].start-speech[0].end>=1150);
    assert.ok(speech[2].start-speech[1].end>=1150);
    assert.ok(speech[2].start-ready>=550);
    assert.equal(await page.locator('.instrument-footer,dialog.memory-dossier').count(),0);
    checks.push({run,presentationMs:ready-began,speech});await shot('presented-'+run);
    if(!live&&run===0)await reopen();
  }
  if(!live){
    assert.deepEqual(requests.slice(0,6),['acknowledge','building','present','acknowledge','building','present']);
    await reopen();const count=await page.evaluate(()=>window.__speech.length);await open();
    await page.waitForFunction(n=>window.__speech.length===n+1&&window.__speech[n].end,count);
    await page.keyboard.press('Escape');await page.waitForTimeout(5200);assert.equal(await page.evaluate(()=>window.__speech.length),count+1);checks.push('Dismiss during inter-sentence pause cancels queued playback');
    await page.getByRole('button',{name:'Open EVA'}).click();mode='slow';await open();await page.waitForTimeout(250);await page.keyboard.press('Escape');await page.waitForTimeout(3200);assert.equal(await page.evaluate(()=>window.__speech.length),count+1);checks.push('Dismiss rejects late provider audio');
    await page.getByRole('button',{name:'Open EVA'}).click();mode='failure';await open();await page.getByText('Speech unavailable.',{exact:true}).waitFor();await page.locator('[data-assembly="ready"]').waitFor();checks.push('Provider failure leaves dashboard usable');
  }
  assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({status:'passed',fixture:live?'Live configured ElevenLabs, actual decoded playback; no subjective listening verdict':clipDirectory?'Actual ElevenLabs MP3 from the live provider check, injected through local responses; no subjective listening verdict':'Synthetic 1-second tone, immediate cached-equivalent provider replies, real Web Audio',checks,errors},null,2));
  await page.close();await page.video().saveAs(join(output,'narration-pacing.webm'));console.log('Speech pacing, presentation and applicable cancellation checks passed.');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:e.message,requests,checks,errors},null,2));throw e;}finally{await context.close();await browser.close();}
