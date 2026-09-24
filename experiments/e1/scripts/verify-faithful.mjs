// Supplementary preview verification. No provider calls or real microphone use.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.E1_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href:'playwright');
const out=resolve(process.argv[2]);await mkdir(out);
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:810},recordVideo:{dir:out,size:{width:1440,height:810}}});
const page=await context.newPage();const result={kind:'browser source-frame preview, muted, no microphone',checks:[],errors:[]};
page.on('pageerror',error=>result.errors.push(error.message));
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);};
const shot=name=>page.screenshot({path:resolve(out,name+'.png')});
const command=text=>page.evaluate(text=>window.__E1_WEAVE_TEST__.command(text),text);
const state=()=>page.evaluate(()=>window.__E1_WEAVE_TEST__.getSnapshot());
const waitFrame=name=>page.waitForFunction(name=>document.querySelector('.weave-material')?.dataset.frame===name,name,{timeout:15000});
const gaze=()=>page.evaluate(()=>{const gl=document.querySelector('.weave-live-eye canvas').getContext('webgl');const program=gl.getParameter(gl.CURRENT_PROGRAM);return [...gl.getUniform(program,gl.getUniformLocation(program,'gaze'))];});
const matchesSource=path=>page.evaluate(async path=>{
 const image=await createImageBitmap(await (await fetch('/weave-derived/'+path)).blob());
 const actual=document.querySelector('.weave-material'),expected=document.createElement('canvas');expected.width=actual.width;expected.height=actual.height;
 const ctx=expected.getContext('2d');const dpr=Math.min(devicePixelRatio||1,2);ctx.scale(dpr,dpr);
 const w=Math.min(innerWidth,innerHeight*image.width/image.height),h=w*image.height/image.width;ctx.drawImage(image,(innerWidth-w)/2,(innerHeight-h)/2,w,h);
 const a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data,b=ctx.getImageData(0,0,expected.width,expected.height).data;
 image.close();let count=0,max=0;for(let i=0;i<a.length;i++){if(a[i]!==b[i])count++;max=Math.max(max,Math.abs(a[i]-b[i]));}return {count,max,frame:actual.dataset.frame,anchor:window.__E1_WEAVE_TEST__.getSnapshot().anchors['12:00']};
},path).then(metrics=>{result.pixelComparisons??={};result.pixelComparisons[path]=metrics;return metrics.max<=1;});
try{
 await page.goto('http://127.0.0.1:1431');await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('.weave-live-eye canvas');
 await page.evaluate(()=>window.__E1_WEAVE_TEST__.voice().setAudioEnabled(false));
 const original=await page.locator('.weave-live-eye').boundingBox();
 await page.mouse.move(120,180);await page.waitForTimeout(350);const left=await gaze();
 await page.mouse.move(1300,650);await page.waitForTimeout(350);const right=await gaze();
 check('actual Week1 pupil follows pointer',right[0]>left[0]&&right[1]<left[1]);await shot('idle');
 await command('Weather today in NYC');check('facts exposed before imported reveal completes',(await state()).forecast.temperatureC===22);
 await page.waitForTimeout(2000);const sample=await page.locator('.weave-material').getAttribute('data-frame');
 check('original24fps reveal timeline, not shortened effect',sample?.startsWith('v1/')&&Number(sample.slice(3,7))>=35&&Number(sample.slice(3,7))<=60);await shot('eye-to-sun');
 await waitFrame('sun.png');check('sun endpoint equals source-derived keyframe within one readback code value',await matchesSource('sun.png'));await shot('sunny');
 await command('What about tomorrow?');check('NYC context and separately dated tomorrow retained',(await state()).forecast.date==='2026-10-15');
 await page.waitForTimeout(4200);await shot('rain-and-ripples-in-motion');await waitFrame('rain.png');
 const rainMatch=await matchesSource('rain.png');if(rainMatch)check('rain endpoint equals source-derived keyframe within one readback code value',true);else result.pixelComparisonFailure=true;await shot('rainy');
 await command('Dismiss the weather');check('dismiss removes facts immediately',(await state()).forecast===null);
 await page.waitForTimeout(3500);await shot('return-transition');
 await page.waitForSelector('.weave-live-eye canvas',{timeout:12000});const returned=await page.locator('.weave-live-eye').boundingBox();
 assert.deepEqual(returned,original);result.checks.push('original eye position and scale restored');await shot('returned-eye');
 await page.evaluate(()=>{const c=window.__E1_WEAVE_TEST__.controller;c.setReducedMotion(true);c.requestForecast('tomorrow');});await waitFrame('rain.png');
 check('reduced motion skips source timeline',(await state()).transition.status==='settled');
 await page.evaluate(()=>window.__E1_WEAVE_TEST__.controller.setPlain(true));await shot('plain');
 check('plain answer retains verified fixture text',(await page.locator('.weave-detail').innerText()).includes('16 degrees Celsius'));
 await command('Dismiss the weather');await page.waitForSelector('.weave-live-eye canvas');check('plain dismissal also restores eye',true);
 await page.evaluate(()=>{const c=window.__E1_WEAVE_TEST__.controller;c.setPlain(false);c.setReducedMotion(false);});
 await command('Weather today in NYC');await page.waitForTimeout(450);await command('Dismiss the weather');await page.waitForSelector('.weave-live-eye canvas',{timeout:3000});
 check('mid-reveal dismissal reverses without reviving weather',(await state()).status==='dismissed');
 check('no uncaught errors',result.errors.length===0);check('all endpoint comparisons passed',!result.pixelComparisonFailure);result.completed=true;
}catch(error){result.failure=String(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(resolve(out,'checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await context.close();await browser.close();}
