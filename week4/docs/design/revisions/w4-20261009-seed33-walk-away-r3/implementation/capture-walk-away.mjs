// Actual browser evidence for walk-away-r3. Never injects render code or synthesizes app frames.
// Usage: node capture-walk-away.mjs <appDir> <newOutputDir> <port> [motion=1]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import path from 'node:path';
const [app,out,port='1457',motion='1']=process.argv.slice(2);
const require=createRequire(path.join(app,'package.json'));
const {chromium}=require('playwright');
await mkdir(out,{recursive:false});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const report={fixture:{look:'seed33',seed:33,buildMs:12000},viewport:{width:1920,height:1080},deviceScaleFactor:1,captures:[],checks:[],errors:[],resourceErrors:[],sourceFiles:{}};
async function fingerprint(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory())await fingerprint(file);else report.sourceFiles[path.relative(app,file).replaceAll('\\','/')]=hash(await readFile(file));}}
for(const dir of ['src','tests','public'])await fingerprint(path.join(app,dir));
const vite=path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js');
const server=spawn(process.execPath,[vite,'--host','127.0.0.1','--port',port,'--strictPort'],{cwd:app,stdio:['ignore','pipe','pipe']});
let browser;
const base=`http://127.0.0.1:${port}`;
const check=(name,ok,details)=>report.checks.push({name,ok:Boolean(ok),details});
const watch=page=>{page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))report.resourceErrors.push({url:r.url(),status:r.status()});});};
const dataset=page=>page.locator('canvas').evaluate(c=>({...c.dataset}));
async function ready(page,opts={}){
 const q=new URLSearchParams({fixture:'1',look:'seed33',seed:'33',build:'12000',capture:'1',paused:'1',backend:'webgl2',t:'12000',...opts});
 await page.goto(`${base}/?${q}`,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('canvas[data-ready="1"]',{state:'attached',timeout:90000});
 await page.evaluate(()=>document.fonts.ready);
 return dataset(page);
}
async function encode(args){const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});let err='';p.stderr.on('data',b=>err+=b);const [code]=await once(p,'exit');if(code)throw Error(err);}
try{
 await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Vite timeout '+s)),60000);server.stdout.on('data',b=>{s+=b;if(s.includes('127.0.0.1:')){clearTimeout(timer);resolve();}});server.once('exit',c=>{clearTimeout(timer);reject(Error('Vite exit '+c));});server.stderr.on('data',b=>s+=b);});
 browser=await chromium.launch({headless:true,channel:'chrome'});report.browser=browser.version();
 const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});const page=await context.newPage();watch(page);
 for(const backend of ['webgl2','canvas2d']){
  const states=[...[0,6000,11999,12000,12400,12800,13600,16000,22000,28000,30000].map(t=>[`normal-${t}`,t,{}]),['reduced-16000',16000,{reduced:'1'}],['reduced-30000',30000,{reduced:'1'}],['hidden-16000',16000,{tiles:'0'}]];
  for(const [name,t,extra] of states){
   const data=await ready(page,{backend,t:String(t),...extra});const file=`${backend}-${name}.png`;const pixels=await page.screenshot({path:path.join(out,file)});
   report.captures.push({file,dataset:data,sha256:hash(pixels)});
   check(file+' backend/clock/assets',data.backend===backend&&Number(data.timeMs)===t&&Number(data.lifeMs)===t&&data.assetsReady==='1',data);
   if(name.startsWith('hidden'))check(backend+' hides all tile/overlay groups',data.tiles==='0',data.tiles);
  }
  const a=report.captures.find(c=>c.file===`${backend}-reduced-16000.png`),b=report.captures.find(c=>c.file===`${backend}-reduced-30000.png`);
  check(backend+' reduced motion is pixel-static',a.sha256===b.sha256);
 }
 const paused=await ready(page,{t:'16000'}), pausedPixels=hash(await page.screenshot());await page.waitForTimeout(600);const held=await dataset(page);
 check('pause freezes clocks and pixels',paused.timeMs===held.timeMs&&paused.lifeMs===held.lifeMs&&pausedPixels===hash(await page.screenshot()));
 if(motion==='1'){
  const start=await ready(page,{clock:'manual',t:'12000'}),fps=15,frames=271;
  const movie=path.join(out,'webgl2-away-walk-18s.mp4');
  const enc=spawn('ffmpeg',['-v','error','-f','image2pipe','-framerate',String(fps),'-i','pipe:0','-c:v','libx264','-pix_fmt','yuv420p','-crf','18',movie],{stdio:['pipe','ignore','pipe']});let err='';enc.stderr.on('data',b=>err+=b);enc.stdin.on('error',()=>{});const exited=once(enc,'exit');
  for(let i=0;i<frames;i++){
   if(i)await page.evaluate(dt=>window.__evaFixture.step(dt),1000/fps);
   const pixels=await page.screenshot();if(!enc.stdin.write(pixels))await once(enc.stdin,'drain');
   if(i%60===0)console.log(`frame ${i}/${frames}`);
  }
  const end=await dataset(page);enc.stdin.end();const [code]=await exited;if(code)throw Error(err);
  check('manual recording reaches18 post-formation seconds',Number(end.timeMs)===30000&&Number(end.lifeMs)===30000,end);
  report.motion={file:path.basename(movie),fps,frames,start,end,note:'Fixed-time browser screenshots; not a real-time performance claim'};
  await encode(['-v','error','-i',movie,'-vf','crop=900:600:30:300','-c:v','libx264','-pix_fmt','yuv420p','-crf','18',path.join(out,'webgl2-away-walk-closeup-18s.mp4')]);
  await context.close();
  const real=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,recordVideo:{dir:path.join(out,'realtime'),size:report.viewport}});const rp=await real.newPage();watch(rp);
  const rstart=await ready(rp,{paused:'0',t:'12000'});const wall=Date.now();await rp.waitForTimeout(18000);const rend=await dataset(rp);
  report.realtime={file:await rp.video().path(),wallMs:Date.now()-wall,start:rstart,end:rend};await real.close();
 }else await context.close();
}catch(e){report.errors.push(String(e.stack??e));process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
check('no page exceptions',report.errors.length===0,report.errors);
check('no scene resource errors',report.resourceErrors.length===0,report.resourceErrors);
report.ok=report.checks.every(c=>c.ok);if(!report.ok)process.exitCode=1;
await writeFile(path.join(out,'checks.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({ok:report.ok,captures:report.captures.length,checks:report.checks.length,failures:report.checks.filter(c=>!c.ok)}));
