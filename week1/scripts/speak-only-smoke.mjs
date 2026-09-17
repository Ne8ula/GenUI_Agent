import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pcmWave} from '../packages/protocol/voice.ts';
const output=process.argv[2] || await mkdtemp(join(tmpdir(),'eva-speak-only-'));
if(process.argv[2]) await mkdir(output,{recursive:false});
const wav=join(tmpdir(),'eva-synthetic-weather-request.wav');
await writeFile(wav,Buffer.from(pcmWave(Float32Array.from({length:16000*5},(_,i)=>Math.sin(i*.08)*.1))));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${wav}`]});
const context=await browser.newContext({viewport:{width:1440,height:960},permissions:['microphone']});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/voice/status',r=>r.fulfill({json:{configured:true}}));
await page.route('**/api/narration/status',r=>r.fulfill({json:{configured:false}}));
await page.route('**/api/voice/transcribe',r=>r.fulfill({json:{text:'Show me the weather in Ithaca.',model:'whisper-1'}}));
try {
 await page.goto('http://127.0.0.1:1420');await page.evaluate(()=>document.fonts.ready);
 const checks=[];
 for(const [width,height] of [[1440,960],[400,640]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(700);
  assert.equal(await page.locator('.welcome-command button').count(),1);
  assert.equal(await page.locator('.typed-request,.alternative-request').count(),0);
  const styles=await page.locator('.welcome-command').evaluate(el=>({background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderWidth,width:el.getBoundingClientRect().width}));
  assert.equal(styles.background,'rgba(0, 0, 0, 0)');assert.equal(styles.border,'0px');assert.ok(styles.width<250);
  await page.getByRole('button',{name:'Speak request',exact:true}).focus();assert.equal(await page.evaluate(()=>document.activeElement.textContent.includes('Speak request')),true);
  await page.screenshot({path:`${output}/${width}.png`,omitBackground:true});checks.push({width,height,...styles});
 }
 await page.setViewportSize({width:1440,height:960});
 await page.getByRole('button',{name:'Speak request',exact:true}).click();
 await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();await page.waitForTimeout(1500);
 await page.getByRole('button',{name:'Send recording',exact:true}).click();
 await page.locator('[data-assembly="ready"]').waitFor();
 const consoleBackground=await page.locator('.eye-station .voice-console').evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(consoleBackground,'rgba(0, 0, 0, 0)');
 await page.screenshot({path:`${output}/dashboard.png`,omitBackground:true});assert.deepEqual(errors,[]);
 await writeFile(`${output}/results.json`,JSON.stringify({status:'passed',browser:browser.version(),checks,microphoneWeather:true,dockedConsoleTransparent:true,errors,fixture:'Synthetic microphone and injected Whisper transcript; narration disabled; no paid API calls'},null,2));
 console.log('Speak-only layout, transparency, focus and microphone weather flow passed.');
}finally{await context.close();await browser.close();}
