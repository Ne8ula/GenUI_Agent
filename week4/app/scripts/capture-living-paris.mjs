import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const out=path.resolve(process.argv[2]??'');if(!process.argv[2])throw new Error('Provide new empty output directory');
await fs.mkdir(out,{recursive:true});if((await fs.readdir(out)).length)throw new Error('Output must be empty');
const base=process.argv[3]??'http://127.0.0.1:1440';
const report={base,viewport:[2560,1440],dpr:1,checks:[],errors:[],requests:[],idleStates:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>report.requests.push(r.url()));
const check=(name,ok)=>{report.checks.push({name,passed:Boolean(ok)});assert.ok(ok,name)};
const ready=()=>page.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true');
const pixels=()=>page.evaluate(()=>document.querySelector('canvas').toDataURL());
const hash=s=>createHash('sha256').update(s).digest('hex');
const stats=()=>page.evaluate(()=>window.__evaArrival.stats());
const seek=t=>page.evaluate(s=>window.__evaArrival.seek(30,s),t);
async function shot(name){await page.evaluate(()=>document.querySelector('.arrival-app').classList.add('arrival-capture'));await page.screenshot({path:path.join(out,name+'.png')});await page.evaluate(()=>document.querySelector('.arrival-app').classList.remove('arrival-capture'))}
const clip=(u,v,w,h)=>({x:Math.round(51.2+u*2457.6),y:Math.round((1440-2457.6/(3392/1720))/2+v*2457.6/(3392/1720)),width:Math.round(w*2457.6),height:Math.round(h*2457.6/(3392/1720))});
try{
 await page.goto(`${base}/?scene=paris-scan&capture=1`);await ready();const baseline=hash(await pixels());
 await page.goto(`${base}/?scene=paris-arrival&fixture=1`);await ready();const eye=hash(await pixels());
 report.eye=await stats();check('formless eye is bounded and has no scene samples',report.eye.eyePoints>1000&&report.eye.eyePoints<12500&&report.eye.bornSamples===0);
 await shot('eye-qhd');await page.screenshot({path:path.join(out,'request-ui.png')});
 await page.getByRole('button',{name:'Imagine Paris'}).click();
 await page.evaluate(()=>window.__evaArrival.seek(29.9));
 await page.getByRole('button',{name:'Resume',exact:true}).click();
 await page.waitForFunction(()=>window.__evaArrival.stats().idleSeconds>.25);
 check('natural completion automatically continues idle motion',(await stats()).seconds===30&&(await stats()).playback==='settled');
 await page.keyboard.press('Escape');const stopped=await stats();const frozen=hash(await pixels());await page.waitForTimeout(250);
 check('Escape freezes both clocks and pixels',(await stats()).idleSeconds===stopped.idleSeconds&&hash(await pixels())===frozen);
 const hashes={};let people0,cafe0;
 for(const t of [0,1,5,15,61,120,121]){
  await seek(t);const s=await stats();report.idleStates.push(s);hashes[t]=hash(await pixels());
  if([0,5,15].includes(t))await shot(`idle-${t}s`);
  if(t===0){people0=hash(await page.screenshot({clip:clip(.45,.64,.16,.30)}));cafe0=hash(await page.screenshot({clip:clip(.245,.61,.12,.24)}))}
  if(t===15){
   check('foreground figures remain pixel-stable',people0===hash(await page.screenshot({clip:clip(.45,.64,.16,.30)})));
   check('rear figures remain pixel-stable',cafe0===hash(await page.screenshot({clip:clip(.245,.61,.12,.24)})));
  }
 }
 check('idle zero retains exact original Paris frame',hashes[0]===baseline);
 check('local samples move without rebuilding',new Set([hashes[0],hashes[1],hashes[5],hashes[15],hashes[61]]).size===5&&report.idleStates.every(s=>s.seconds===30&&s.bornSamples===109593));
 check('motion continues beyond the old sixty-second clamp',hashes[61]!==hashes[121]);
 check('harmonic wrap keeps fixed geometry and deterministic phase',hashes[0]===hashes[120]&&hashes[1]===hashes[121]);
 check('resource counts stay bounded over long idle seeks',report.idleStates.every(s=>s.points===109593&&s.geometries<=3&&s.calls===1&&s.textures===0&&s.bytes<8000000));
 await seek(61);await page.getByRole('button',{name:'Resume',exact:true}).click();await page.waitForFunction(()=>window.__evaArrival.stats().idleSeconds>61.3);
 await page.getByRole('button',{name:'Pause',exact:true}).click();
 check('post-settlement Resume does not restart construction',(await stats()).seconds===30&&(await stats()).idleSeconds>61.3);
 const prior=await stats();await page.waitForTimeout(200);check('Pause freezes the independent idle clock',(await stats()).idleSeconds===prior.idleSeconds);
 await page.getByLabel('Less motion').check();await page.waitForTimeout(100);
 check('less motion returns the exact static source frame',hash(await pixels())===baseline&&(await stats()).idleSeconds===0);
 check('less motion disables Resume',await page.getByRole('button',{name:'Resume',exact:true}).isDisabled());
 await page.evaluate(()=>window.__evaArrival.seek(30,90));check('reduced-motion seeking cannot enable drift',hash(await pixels())===baseline);
 await page.getByLabel('Less motion').uncheck();
 await seek(15);await page.getByRole('button',{name:'Resume',exact:true}).click();await page.waitForTimeout(150);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>window.__evaArrival.stats().idleSeconds===0);
 check('OS reduced motion stops a living scene',hash(await pixels())===baseline);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
 await page.getByRole('button',{name:'Return to eye'}).click();
 check('return clears both clocks and restores formless eye',hash(await pixels())===eye&&(await stats()).seconds===0&&(await stats()).idleSeconds===0);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(120);await page.screenshot({path:path.join(out,'eye-narrow.png')});
 check('mobile layout remains within viewport',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:2560,height:1440});await page.waitForTimeout(120);check('resize restores eye exactly',hash(await pixels())===eye);
 await seek(15);await page.getByRole('button',{name:'Resume',exact:true}).click();await page.waitForTimeout(100);
 await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await page.getByRole('alert').waitFor();
 check('context loss removes live fixture handle',await page.evaluate(()=>window.__evaArrival===undefined));
 await page.getByRole('button',{name:'Retry',exact:true}).click();await ready();const recovered=await stats();await page.waitForTimeout(200);
 check('Retry preserves paused idle state instead of restarting',recovered.playback==='paused'&&recovered.idleSeconds>15&&(await stats()).idleSeconds===recovered.idleSeconds);
 check('no runtime image/video or external requests',report.requests.every(u=>new URL(u).origin===new URL(base).origin&&!/\.(png|jpe?g|webp|mp4|webm)(\?|$)/i.test(u)));
 check('no uncaught errors',report.errors.length===0);
 if(process.argv.includes('--record')){
  await context.close();const rec=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1,recordVideo:{dir:path.join(out,'recording'),size:{width:2560,height:1440}}});
  const p=await rec.newPage();await p.goto(`${base}/?scene=paris-arrival`);await p.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true');
  await p.getByRole('button',{name:'Imagine Paris'}).click();await p.getByRole('button',{name:'Skip to Paris'}).click();
  await p.evaluate(()=>document.querySelector('.arrival-app').classList.add('arrival-capture'));await p.waitForTimeout(12000);await p.keyboard.press('Escape');
  report.recordingEnd=await p.evaluate(()=>window.__evaArrival.stats());const video=p.video();await rec.close();await video.saveAs(path.join(out,'living-paris-realtime.webm'));
 }
}catch(error){report.failure=error.stack;process.exitCode=1}
finally{await browser.close();await fs.writeFile(path.join(out,'checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,eye:report.eye,idleStates:report.idleStates,failure:report.failure},null,2))}
