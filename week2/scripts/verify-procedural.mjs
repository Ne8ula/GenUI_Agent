// CPU-only browser validation. Never launches E1 native or enables a microphone.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.E1_PLAYWRIGHT_MODULE?pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href:'playwright');
if(!process.argv[2])throw Error('Supply a fresh evidence directory');
const out=resolve(process.argv[2]);await mkdir(out);
const flags=['--disable-gpu','--disable-gpu-compositing','--disable-accelerated-2d-canvas','--disable-webgl','--disable-software-rasterizer'];
const browser=await chromium.launch({channel:'chrome',headless:true,args:flags});
const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});
await context.addInitScript(()=>{
 window.__graphicsRequests=[];const original=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(kind,...args){window.__graphicsRequests.push(kind);if(kind!=='2d')throw Error('Hardware graphics context prohibited in recovery test');return original.call(this,kind,...args);};
});
const page=await context.newPage();const requests=[];
page.on('request',r=>requests.push(r.url()));
const result={kind:'software-only browser procedural preview',flags,checks:[],errors:[]};
page.on('pageerror',e=>result.errors.push(e.message));
const check=(label,value)=>{assert.ok(value,label);result.checks.push(label);};
const stats=()=>page.locator('.weave-material').evaluate(e=>({...e.dataset,width:e.width,height:e.height}));
const state=()=>page.evaluate(()=>window.__E1_WEAVE_TEST__.getSnapshot());
const snapshot=()=>page.evaluate(()=>{window.__particlePrevious=document.querySelector('.weave-material').particleSnapshot();});
const changed=()=>page.evaluate(()=>{const p=document.querySelector('.weave-material').particleSnapshot();return p.some((v,i)=>v!==window.__particlePrevious[i]);});
const shot=name=>page.screenshot({path:resolve(out,name+'.png')});
const settle=()=>page.waitForFunction(()=>window.__E1_WEAVE_TEST__.getSnapshot().transition.status!=='active',null,{timeout:12000});
try{
 await page.goto('http://127.0.0.1:1431');await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>Number(document.querySelector('.weave-material')?.dataset.drawCount)>0);
 check('real Rust particle module loaded',(await stats()).origin==='rust-procedural-particles');
 const memory=(await stats()).memoryBytes;await snapshot();await page.mouse.move(1200,250);await page.waitForTimeout(350);check('procedural eye responds to local cursor',await changed());await shot('eye');
 await page.getByRole('button',{name:'Today in NYC',exact:true}).click();check('facts do not wait for particles',(await state()).forecast.temperatureC===22);
 await snapshot();await page.waitForTimeout(450);check('particle coordinates change during reveal',await changed());await shot('reveal');await settle();await shot('sunny');
 const handle=page.getByRole('button',{name:'Move weather composition. Use arrow keys to move',exact:true});await handle.focus();await page.keyboard.press('ArrowLeft');
 check('keyboard movement retains focus',await handle.evaluate(e=>e===document.activeElement));
 await page.getByRole('button',{name:'Controls +',exact:true}).click();await page.getByRole('button',{name:'Pin',exact:true}).click();await page.getByRole('button',{name:'Controls −',exact:true}).click();
 const pin=(await state()).anchors['12:00'];await page.getByRole('button',{name:'Tomorrow',exact:true}).click();
 check('tomorrow is distinct dated evidence',(await state()).forecast.date==='2026-10-15');assert.deepEqual((await state()).anchors['12:00'],pin);result.checks.push('day revision preserves pin and geometry');
 await page.waitForTimeout(3000);await shot('forming-clouds');await settle();await page.waitForTimeout(1000);await shot('rainy');
 check('rain contains actual droplets and ripples',Number((await stats()).droplets)>0&&Number((await stats()).ripples)>0);
 await snapshot();await page.waitForTimeout(400);check('droplets and ripple positions evolve',await changed());
 await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForTimeout(100);await snapshot();const stopped=(await stats()).drawCount;await page.waitForTimeout(300);
 check('Stop freezes state and drawing',!await changed()&&(await stats()).drawCount===stopped);
 await page.getByRole('button',{name:'Controls +',exact:true}).click();await page.getByRole('button',{name:'Plain answer',exact:true}).click();
 check('plain mode keeps fixture facts',(await page.locator('.weave-detail').innerText()).includes('16 degrees Celsius'));await shot('plain');
 await page.getByRole('button',{name:'Plain answer',exact:true}).click();await page.getByRole('button',{name:'Less motion',exact:true}).click();await page.getByRole('button',{name:'Controls −',exact:true}).click();
 await page.waitForTimeout(150);await snapshot();await page.waitForTimeout(250);check('reduced motion retains static particle state',!await changed());
 await page.getByRole('button',{name:'Dismiss weather',exact:true}).click();await page.waitForTimeout(150);check('dismiss removes facts and restores smaller eye',(await state()).forecast===null&&(await stats()).form==='eye');await shot('returned-eye');
 await page.evaluate(()=>{const c=window.__E1_WEAVE_TEST__.controller;c.setReducedMotion(false);c.requestForecast('today');});await page.waitForTimeout(300);
 await page.getByRole('button',{name:'Dismiss weather',exact:true}).click();await page.waitForTimeout(100);await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForTimeout(100);await snapshot();await page.waitForTimeout(250);
 check('Stop also freezes an interrupted return',!await changed()&&(await state()).status==='dismissed');
 await page.evaluate(()=>{const c=window.__E1_WEAVE_TEST__.controller;c.setReducedMotion(true);c.requestForecast('tomorrow');});await page.waitForTimeout(150);
 for(let i=0;i<40;i++){await page.evaluate(i=>window.__E1_WEAVE_TEST__.controller.requestForecast(i%2?'today':'tomorrow'),i);await page.waitForTimeout(35);}
 check('revisions retain fixed WASM memory',(await stats()).memoryBytes===memory);
 check('particle and raster budgets hold',Number((await stats()).particleCount)<=8192&&(await stats()).width*(await stats()).height<=1280*720);
 await page.setViewportSize({width:420,height:900});await page.waitForTimeout(100);await shot('narrow');check('narrow preview has no page overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 check('no graphics contexts requested except Canvas2D',await page.evaluate(()=>window.__graphicsRequests.every(k=>k==='2d')));
 check('no weather images or videos loaded',!requests.some(url=>/weave-derived|\/keyframes\/|\/animations\/|\.mp4|\.webm/.test(url)));
 check('no external provider calls',requests.every(url=>url.startsWith('http://127.0.0.1:1431')||url.startsWith('ws://127.0.0.1:1431')));
 check('microphone and audio stayed off',await page.evaluate(()=>{const s=window.__E1_WEAVE_TEST__.voice().getState();return !s.enabled&&!s.audioEnabled;}));
 check('no uncaught errors or renderer budget stops',result.errors.length===0&&await page.locator('.weave-notice').count()===0);
 result.finalStats=await stats();result.completed=true;
}catch(error){result.failure=String(error);process.exitCode=1;await shot('failure');}
finally{await writeFile(resolve(out,'checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await context.close();await browser.close();}
