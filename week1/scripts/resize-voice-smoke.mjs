import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { tmpdir } from 'node:os';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${join(tmpdir(),'eva-synthetic-weather-request.wav')}`]});
const context=await browser.newContext({viewport:{width:1440,height:960},permissions:['microphone'],recordVideo:{dir:join(output,'video'),size:{width:1440,height:960}}});
const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/narration/status',r=>r.fulfill({json:{configured:false}}));
await page.route('**/api/voice/status',r=>r.fulfill({json:{configured:true}}));
let transcript='What about the wind speed?';
await page.route('**/api/voice/transcribe',r=>r.fulfill({json:{text:transcript,model:'whisper-1'}}));
const shot=name=>page.screenshot({path:join(output,name+'.png'),omitBackground:true,fullPage:true});
async function say(text){transcript=text;await page.getByRole('button',{name:'Speak request',exact:true}).click();await page.getByRole('button',{name:'Send recording',exact:true}).waitFor();await page.waitForTimeout(1500);await page.getByRole('button',{name:'Send recording',exact:true}).click();await page.getByRole('button',{name:'Speak request',exact:true}).waitFor();}
try{
 await page.goto('http://127.0.0.1:1420');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);await shot('eye');
 await page.getByText('Type',{exact:true}).click();await page.getByRole('textbox',{name:'Weather request'}).fill('What about the wind speed?');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByText('Ask for wind speed using the microphone.',{exact:true}).waitFor();assert.equal(await page.getByTestId('wind-panel').count(),0);
 await page.getByRole('button',{name:'Weather',exact:false}).first().click();await page.waitForTimeout(1700);await shot('loading');await page.locator('[data-assembly="ready"]').waitFor();await shot('weather');
 for(const name of ['Quiet mode','Add wind','Undo','Reset']) assert.equal(await page.getByRole('button',{name,exact:false}).count(),0);
 for(const [name,color] of [['light','#e4e1d8'],['dark','#242630']]){await page.evaluate(value=>document.body.style.backgroundColor=value,color);await shot(`weather-${name}-surface`);}await page.evaluate(()=>document.body.style.backgroundColor='');
 assert.equal(await page.getByTestId('wind-panel').count(),0);
 const card=page.getByTestId('weather-card'),initial=await card.boundingBox();
 const grip=await page.getByRole('button',{name:'Resize weather panel'}).boundingBox();await page.mouse.move(grip.x+15,grip.y+15);await page.mouse.down();await page.mouse.move(grip.x-270,grip.y-145,{steps:15});await page.mouse.up();
 const smaller=await card.boundingBox();assert.ok(smaller.width<initial.width-200&&smaller.height<initial.height-90);await page.waitForTimeout(250);await shot('resized');
 await page.getByRole('button',{name:'Move weather card'}).focus();await page.keyboard.press('ArrowDown');
 const previous=await card.boundingBox(),id=await card.getAttribute('data-card-id'),revision=await card.getAttribute('data-revision');
 await say('What about the wind speed?');await page.getByTestId('wind-panel').waitFor();
 const after=await card.boundingBox();assert.deepEqual(after,previous);assert.equal(await card.getAttribute('data-card-id'),id);assert.equal(Number(await card.getAttribute('data-revision')),Number(revision)+1);
 assert.ok(await page.locator('.weather-content').evaluate(e=>e.scrollTop>0));await page.waitForTimeout(400);await shot('wind-voice');
 const once=await card.getAttribute('data-revision');await say('What about the wind speed?');assert.equal(await card.getAttribute('data-revision'),once);
 await page.getByRole('button',{name:'Resize weather panel'}).focus();await page.keyboard.press('ArrowRight');assert.ok((await card.boundingBox()).width>after.width);
 checks.push({pointerResize:{initial,smaller},voiceWindPreservesGeometry:after,repeatIsIdempotent:true,typedWindRejected:true,keyboardResize:true});
 for(const [width,height]of [[1960,530],[960,760],[600,760],[400,640]]){await page.setViewportSize({width,height});await page.waitForTimeout(450);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('.weather-content').evaluate(e=>e.scrollWidth<=e.clientWidth));await shot(`wind-${width}x${height}`);}
 await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Dismiss',exact:true}).click();await page.getByRole('button',{name:'Open EVA'}).click();
 await say('What about the wind speed?');await page.getByText('Open the weather dashboard first.',{exact:true}).waitFor();assert.equal(await page.getByTestId('weather-card').count(),0);
 await page.getByRole('button',{name:'Weather',exact:false}).first().click();await page.locator('[data-assembly="ready"]').waitFor();assert.equal(await page.getByTestId('wind-panel').count(),0);
 checks.push('Voice before dashboard rejected; responsive content fits; reduced-motion dismissal works');assert.deepEqual(errors,[]);
 await writeFile(join(output,'results.json'),JSON.stringify({status:'passed',fixture:'Real AudioWorklet with synthetic speech; injected Whisper response',checks,errors},null,2));await page.close();await page.video().saveAs(join(output,'resize-voice.webm'));console.log('Resize, voice-only wind, geometry, repeat, responsive and reduced-motion checks passed.');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:e.message,checks,errors},null,2));throw e;}finally{await context.close();await browser.close();}
