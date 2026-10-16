import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const out=path.resolve(process.argv[2] ?? '');
if(!process.argv[2]) throw new Error('Provide new empty output directory');
await fs.mkdir(out,{recursive:true}); if((await fs.readdir(out)).length) throw new Error('Output must be empty');
const base=process.argv[3] ?? 'http://127.0.0.1:1440';
const report={base,viewport:[2560,1440],dpr:1,checks:[],errors:[],requests:[],frames:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1});
const page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message)); page.on('request',r=>report.requests.push(r.url()));
const check=(name,ok)=>{report.checks.push({name,passed:Boolean(ok)});assert.ok(ok,name)};
const ready=()=>page.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true');
const pixels=()=>page.evaluate(()=>document.querySelector('canvas').toDataURL());
const digest=s=>createHash('sha256').update(s).digest('hex');
async function shot(name) {
 await page.evaluate(()=>document.querySelector('.arrival-app').classList.add('arrival-capture'));
 await page.screenshot({path:path.join(out,name+'.png')});
 await page.evaluate(()=>document.querySelector('.arrival-app').classList.remove('arrival-capture'));
}
try {
 await page.goto(`${base}/?scene=paris-scan&capture=1`); await ready();
 const settledHash=digest(await pixels());
 await page.goto(`${base}/?scene=paris-arrival&fixture=1`); await ready();
 const initial=digest(await pixels());
 const stats=await page.evaluate(()=>window.__evaArrival.stats());
 check('only canonical eye at entry, no Paris samples',stats.seconds===0&&stats.bornSamples===0&&stats.eyePoints>1000);
 check('bounded texture-free QHD geometry',stats.width===2560&&stats.height===1440&&stats.textures===0&&stats.bytes<8000000&&stats.geometries<=3);
 await page.screenshot({path:path.join(out,'request-ui.png')}); await shot('eye-00s');
 await page.getByLabel('Where would you like to go?').fill('Take me to London');
 await page.getByRole('button',{name:'Imagine Paris'}).click();
 check('unsupported request leaves eye unchanged',(await page.evaluate(()=>window.__evaArrival.stats().submitted))===false&&digest(await pixels())===initial);
 await page.getByLabel('Where would you like to go?').fill("What's it like in 1980s Paris?");
 await page.getByLabel('Where would you like to go?').press('Enter');
 await page.waitForFunction(()=>window.__evaArrival.stats().seconds>.15);
 await page.keyboard.press('Escape');
 const paused=await page.evaluate(()=>window.__evaArrival.stats().seconds); await page.waitForTimeout(150);
 check('typed request starts and Escape pauses',paused>0&&(await page.evaluate(()=>window.__evaArrival.stats().seconds))===paused);
 for(const seconds of [1,2,3.5,5,7,10,14,17,21,25,30]) {
  await page.evaluate(t=>window.__evaArrival.seek(t),seconds);
  report.frames.push(await page.evaluate(()=>window.__evaArrival.stats()));
  await shot(`construction-${String(seconds).replace('.','p')}s`);
 }
 check('every sample is present at exact retained endpoint',digest(await pixels())===settledHash);
 check('sample birth counts accumulate rather than global opacity',report.frames.every((s,i)=>i===0||s.bornSamples>=report.frames[i-1].bornSamples)&&new Set(report.frames.map(s=>s.bornSamples)).size>=5);
 await page.evaluate(()=>window.__evaArrival.seek(17)); const at17=digest(await pixels());
 await page.evaluate(()=>window.__evaArrival.seek(4));
 await page.evaluate(()=>window.__evaArrival.seek(17));
 check('backward seek has exact deterministic state',digest(await pixels())===at17);
 await page.getByRole('button',{name:'Resume',exact:true}).click(); await page.waitForTimeout(180);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 check('resume advances the same clock',(await page.evaluate(()=>window.__evaArrival.stats().seconds))>17);
 await page.getByRole('button',{name:'Skip to Paris'}).click();
 check('skip is the identical settled scene',digest(await pixels())===settledHash);
 await page.getByRole('button',{name:'Return to eye'}).click();
 check('return restores canonical eye exactly',digest(await pixels())===initial&&(await page.evaluate(()=>window.__evaArrival.stats().submitted))===false);
 await page.getByLabel('Less motion').check();
 await page.getByRole('button',{name:'Imagine Paris'}).click();
 check('reduced motion directly settles without traveling particles',digest(await pixels())===settledHash&&(await page.evaluate(()=>window.__evaArrival.stats().seconds))===30);
 await page.evaluate(()=>window.__evaArrival.seek(4));
 check('reduced-motion seek cannot revive travel',digest(await pixels())===settledHash);
 await page.getByRole('button',{name:'Return to eye'}).click();
 await page.getByLabel('Less motion').uncheck();
 await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(150);
 await page.screenshot({path:path.join(out,'request-narrow.png')});
 check('mobile input remains in viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:2560,height:1440}); await page.waitForTimeout(150);
 check('resize returns exact eye framing',digest(await pixels())===initial);
 await page.getByRole('button',{name:'Imagine Paris'}).click();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>window.__evaArrival.stats().seconds===30);
 check('live OS reduced motion stops and settles',digest(await pixels())===settledHash);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
 await page.getByRole('alert').waitFor();
 check('context loss clears fixture and reports failure',await page.evaluate(()=>window.__evaArrival===undefined));
 await page.getByRole('button',{name:'Retry',exact:true}).click(); await ready();
 check('retry stays settled instead of replaying',digest(await pixels())===settledHash);
 check('runtime has no reference-image, video or external fetch',report.requests.every(u=>new URL(u).origin===new URL(base).origin&&!/\.(png|jpe?g|webp|mp4|webm)(\?|$)/i.test(u)));
 check('no uncaught page errors',report.errors.length===0);
 for(const failure of ['missing-data','no-webgl']) {
  const p=await context.newPage();
  if(failure==='missing-data') await p.route('**/assets/paris-scan-r12/points.bin',r=>r.fulfill({status:404,body:'missing'}));
  else await p.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t==='webgl2'?null:get.call(this,t,...a)}});
  await p.goto(`${base}/?scene=paris-arrival`);await p.getByRole('alert').waitFor();
  check(failure+' fails closed without allowing request',await p.getByRole('button',{name:'Imagine Paris'}).isDisabled());await p.close();
 }
 if(process.argv.includes('--record')) {
  await context.close();
  const rec=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1,recordVideo:{dir:path.join(out,'recording'),size:{width:2560,height:1440}}});
  const p=await rec.newPage();await p.goto(`${base}/?scene=paris-arrival`);
  await p.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true');
  await p.waitForTimeout(600);await p.getByRole('button',{name:'Imagine Paris'}).click();
  await p.evaluate(()=>document.querySelector('.arrival-app').classList.add('arrival-capture'));
  await p.waitForFunction(()=>window.__evaArrival.stats().playback==='settled',{},{timeout:60000});
  await p.waitForTimeout(1000);report.recordingEnd=await p.evaluate(()=>window.__evaArrival.stats());
  const video=p.video();await rec.close();await video.saveAs(path.join(out,'eye-to-paris-realtime.webm'));
 }
} catch(error) {report.failure=error.stack;process.exitCode=1}
finally {await browser.close();await fs.writeFile(path.join(out,'checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,frames:report.frames,failure:report.failure},null,2))}
