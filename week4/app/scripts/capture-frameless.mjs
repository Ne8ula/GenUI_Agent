import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve(process.argv[2]??'');if(!process.argv[2])throw new Error('Provide a new empty evidence directory');
await fs.mkdir(out,{recursive:true});if((await fs.readdir(out)).length)throw new Error('Evidence directory must be empty');
const base=process.argv[3]??'http://127.0.0.1:1441';
const report={base,viewport:[2560,1440],dpr:1,checks:[],errors:[],requests:[],states:[]};
const browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1});const page=await context.newPage();
page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>report.requests.push(r.url()));
const check=(name,ok)=>{report.checks.push({name,passed:Boolean(ok)});assert.ok(ok,name)};
const ready=()=>page.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true');
const stats=()=>page.evaluate(()=>window.__evaArrival.stats());
const cmd=async text=>{await page.getByRole('textbox').fill(text);await page.getByRole('textbox').press('Enter')};
const poses=()=>page.locator('.item-overlay').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,style:n.getAttribute('style')})));
const regions=()=>page.evaluate(()=>{
 const c=document.querySelector('canvas'),gl=c.getContext('webgl2');return [[0,0,1,.84],[.425,0,.205,1],[0,.86,1,.14]].map(([x,y,w,h])=>{
  const xx=Math.floor(x*c.width),yy=Math.floor(y*c.height),ww=Math.floor(w*c.width),hh=Math.floor(h*c.height);const bytes=new Uint8Array(ww*hh*4);gl.readPixels(xx,c.height-yy-hh,ww,hh,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
  let hash=2166136261;for(const byte of bytes)hash=Math.imul(hash^byte,16777619);return hash>>>0;
 });
});
const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png')})};
try{
 await page.goto(`${base}/?scene=paris-scan&capture=1`);await ready();const baseline=await regions();
 await page.goto(`${base}/?scene=paris-arrival`);await ready();await shot('eye');
 check('item labels absent on eye; input-only host retained',await page.locator('.item-overlay').count()===0&&await page.getByRole('button').count()===0&&await page.getByRole('textbox').count()===1);
 await cmd('photos');await page.waitForFunction(()=>window.__evaArrival.stats().discovery.seconds>.5);await page.keyboard.press('Escape');
 check('archival discovery remains separate from item labels',await page.locator('.discovery-photo').count()===7&&await page.locator('.item-overlay').count()===0);
 for(const t of [7,14,21,27,29.99]){await page.evaluate(s=>window.__evaArrival.seek(s),t);check(`no settled labels at construction ${t}`,await page.locator('.item-overlay').count()===0);if([21,27].includes(t))await shot(`construction-${t}s`)}
 await page.evaluate(()=>window.__evaArrival.seek(30,0));await page.locator('.item-overlay').first().waitFor();const after=await regions();report.states.push(await stats());
 check('original architecture and upper scene are pixel-identical',after[0]===baseline[0]);
 check('foreground people remain pixel-identical across full-height protected band',after[1]===baseline[1]);
 check('lower ground genuinely extends beyond previous frame',after[2]!==baseline[2]);
 const s=await stats();check('separate ground geometry is bounded and source samples unchanged',s.sourcePoints===109593&&s.groundPoints>100&&s.groundPoints<=8000&&s.points===s.sourcePoints+s.groundPoints&&s.bytes<8000000);
 check('four titles and descriptions are readable at idle zero',await page.locator('.item-overlay').count()===4&&await page.locator('.item-overlay-title').allTextContents().then(a=>a.length===4&&a.every(Boolean))&&await page.locator('.item-overlay-desc').allTextContents().then(a=>a.every(Boolean)));
 check('all four descriptions remain in a stable accessible list',await page.locator('.item-overlays-sr-list li').count()===4);
 check('rectangles have no opaque backing and cannot intercept input',await page.locator('.item-overlay').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(n).pointerEvents==='none')));
 await shot('settled-qhd');await page.screenshot({path:path.join(out,'ground-detail.png'),clip:{x:350,y:950,width:1860,height:470}});
 const pose0=JSON.stringify(await poses());await cmd('resume');await page.waitForFunction(()=>window.__evaArrival.stats().idleSeconds>.5);await page.keyboard.press('Escape');const frozen=await stats(),frozenPoses=JSON.stringify(await poses()),frozenPixels=await regions();await page.waitForTimeout(240);
 check('settled overlay float follows the host idle clock',JSON.stringify(await poses())!==pose0);
 check('Escape freezes both ground and overlay poses',(await stats()).idleSeconds===frozen.idleSeconds&&JSON.stringify(await poses())===frozenPoses&&JSON.stringify(await regions())===JSON.stringify(frozenPixels));
 await page.evaluate(()=>window.__evaArrival.seek(30,5));const at5=JSON.stringify(await poses());await shot('idle-5s-qhd');await page.evaluate(()=>window.__evaArrival.seek(30,10));await page.evaluate(()=>window.__evaArrival.seek(30,5));check('seeking backward restores exact overlay poses',JSON.stringify(await poses())===at5);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>window.__evaArrival.stats().idleSeconds===0);const staticPoses=JSON.stringify(await poses());await page.waitForTimeout(200);check('OS reduced motion gives static ground and labels',(await stats()).playback==='paused'&&JSON.stringify(await poses())===staticPoses);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(120);await shot('narrow-reduced');check('narrow view shows two visual labels and all four accessible descriptions',await page.locator('.item-overlay').count()===2&&await page.locator('.item-overlays-sr-list li').count()===4);
 check('labels fit narrow viewport and avoid input',await page.locator('.item-overlay').evaluateAll(nodes=>nodes.every(n=>{const r=n.getBoundingClientRect(),input=document.querySelector('#paris-request').getBoundingClientRect();return r.left>=15&&r.right<=innerWidth-15&&r.bottom<input.top&&parseFloat(getComputedStyle(n.querySelector('.item-overlay-desc')).fontSize)>=12})));
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const mobileTitles=new Set();for(const t of [0,7]){await page.evaluate(s=>window.__evaArrival.seek(30,s),t);await page.waitForFunction(expected=>{const titles=[...document.querySelectorAll('.item-overlay-title')].map(n=>n.textContent);return expected.every(title=>titles.includes(title))},t===0?['Street lantern','Stone paving']:['Café terrace','Woven bistro chairs']);(await page.locator('.item-overlay-title').allTextContents()).forEach(title=>mobileTitles.add(title))}check('mobile rotation exposes all four labels',mobileTitles.size===4);
 await page.setViewportSize({width:2560,height:1440});await page.waitForTimeout(100);await cmd('return');check('return clears labels without late reappearance',await page.locator('.item-overlay').count()===0&&!(await stats()).submitted);
 await page.evaluate(()=>window.__evaArrival.seek(30,3));await page.evaluate(()=>document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());await page.getByRole('alert').waitFor();check('GPU failure clears annotations and live fixture handle',await page.locator('.item-overlay').count()===0&&await page.evaluate(()=>!window.__evaArrival));
 await cmd('retry');await ready();check('retry recovers bounded ground and paused labels',(await stats()).groundPoints===s.groundPoints&&(await stats()).playback==='paused'&&await page.locator('.item-overlay').count()===4);
 check('no new runtime media or external requests',report.requests.every(u=>new URL(u).origin===new URL(base).origin&&!/\.(mp4|webm)(\?|$)/i.test(u)));
 check('no uncaught errors',report.errors.length===0);
 if(process.argv.includes('--record')){
  const rec=await browser.newContext({viewport:{width:2560,height:1440},deviceScaleFactor:1,recordVideo:{dir:path.join(out,'recording'),size:{width:2560,height:1440}}});const p=await rec.newPage();await p.goto(`${base}/?scene=paris-arrival`);await p.waitForFunction(()=>document.querySelector('canvas')?.dataset.ready==='true');await p.evaluate(()=>window.__evaArrival.seek(20));await p.getByRole('textbox').fill('resume');await p.getByRole('textbox').press('Enter');await p.waitForFunction(()=>window.__evaArrival.stats().idleSeconds>10,null,{timeout:60000});await p.keyboard.press('Escape');report.recordingEnd=await p.evaluate(()=>window.__evaArrival.stats());const video=p.video();await rec.close();await video.saveAs(path.join(out,'ground-and-overlays-realtime.webm'));
 }
}catch(error){report.failure=error.stack;process.exitCode=1}
finally{await browser.close();await fs.writeFile(path.join(out,'checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,states:report.states,failure:report.failure},null,2))}
