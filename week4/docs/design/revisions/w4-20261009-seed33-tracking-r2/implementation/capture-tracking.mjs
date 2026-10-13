// Real browser evidence. Uses existing public fixture controls; never injects rendering code.
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import path from 'node:path';
const [app,out,port='1457',motion='0']=process.argv.slice(2);
const require=createRequire(path.join(app,'package.json'));
const {chromium}=require('playwright');
await mkdir(out,{recursive:false});
const vite=path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js');
const server=spawn(process.execPath,[vite,'--host','127.0.0.1','--port',port,'--strictPort'],{cwd:app,stdio:['ignore','pipe','pipe']});
let browser;
const report={viewport:{width:1920,height:1080},deviceScaleFactor:1,sourceApp:app,fixture:{seed:33,build:12000,look:'seed33'},captures:[],checks:[],errors:[],motion:null};
const base=`http://127.0.0.1:${port}`;
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function ready(page,opts={}){
 const p=new URLSearchParams({fixture:'1',look:'seed33',seed:'33',build:'12000',capture:'1',paused:'1',backend:'webgl2',t:'17000',...opts});
 await page.goto(`${base}/?${p}`,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('canvas[data-ready="1"]',{state:'attached',timeout:90000});
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.assetsReady!=='0');
 return page.locator('canvas').evaluate(c=>({...c.dataset}));
}
async function encode(args){const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});let err='';p.stderr.on('data',b=>err+=b);const [code]=await once(p,'exit');if(code)throw Error(err);}
try{
 await new Promise((resolve,reject)=>{let s='';const timer=setTimeout(()=>reject(Error('Vite timeout '+s)),60000);server.stdout.on('data',b=>{s+=b;if(s.includes('127.0.0.1:')){clearTimeout(timer);resolve();}});server.once('exit',c=>reject(Error('Vite exit '+c)));server.stderr.on('data',b=>s+=b);});
 browser=await chromium.launch({headless:true,channel:'chrome'});report.browser=browser.version();
 const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 for(const backend of ['webgl2','canvas2d']){
  for(const [name,t,extra] of [['build-6000',6000,{}],['formed-12000',12000,{}],['formed-12500',12500,{}],['formed-17000',17000,{}],['formed-17200',17200,{}],['formed-17500',17500,{}],['formed-17800',17800,{}],['formed-22000',22000,{}],['formed-25000',25000,{}],['reduced-17000',17000,{reduced:'1'}],['reduced-22000',22000,{reduced:'1'}],['hidden-17000',17000,{tiles:'0'}]]){
   const dataset=await ready(page,{backend,t:String(t),...extra});const file=`${backend}-${name}.png`;const pixels=await page.screenshot({path:path.join(out,file)});report.captures.push({file,dataset,sha256:sha(pixels)});report.checks.push({name:file+' backend/clock',ok:dataset.backend===backend&&Number(dataset.timeMs)===t});
  }
  const getHash=name=>report.captures.find(c=>c.file===`${backend}-${name}.png`).sha256;
  report.checks.push({name:`${backend} reduced motion pixel-static from 17s to22s`,ok:getHash('reduced-17000')===getHash('reduced-22000')});
  if(motion==='1') for(const name of ['build-6000','hidden-17000']){
   const original=await readFile(path.resolve(out,'../../before/matching',`${backend}-${name}.png`));
   report.checks.push({name:`${backend} ${name} preserved from before`,ok:sha(original)===getHash(name)});
  }
 }
 const pauseStart=await ready(page,{backend:'webgl2',t:'17000'});const pausePixels=sha(await page.screenshot());
 await page.waitForTimeout(600);const pauseEnd=await page.locator('canvas').evaluate(c=>({...c.dataset}));
 report.checks.push({name:'pause freezes clocks and rendered pixels',ok:pauseStart.timeMs===pauseEnd.timeMs&&pauseStart.lifeMs===pauseEnd.lifeMs&&pausePixels===sha(await page.screenshot())});
 if(motion==='1'){
  const dataset=await ready(page,{clock:'manual',t:'12000'});const fps=15,frames=166;const movie=path.join(out,'webgl2-post-formation-stepped-11s.mp4');
  const enc=spawn('ffmpeg',['-v','error','-f','image2pipe','-framerate',String(fps),'-i','pipe:0','-c:v','libx264','-pix_fmt','yuv420p','-crf','18',movie],{stdio:['pipe','ignore','pipe']});let err='';enc.stderr.on('data',b=>err+=b);enc.stdin.on('error',()=>{});const exited=once(enc,'exit');
  for(let i=0;i<frames;i++){
   if(i) await page.evaluate(dt=>window.__evaFixture.step(dt),1000/fps);
   const buf=await page.screenshot();if(!enc.stdin.write(buf))await once(enc.stdin,'drain');
   if(i%30===0) console.log('frame',i,'/',frames);
  }
  const final=await page.locator('canvas').evaluate(c=>({...c.dataset}));enc.stdin.end();const [code]=await exited;if(code)throw Error(err);
  report.motion={file:path.basename(movie),fps,frames,start:dataset,end:final,note:'Actual app screenshots at fixed fixture time, not a real-time performance claim'};
  await encode(['-v','error','-i',movie,'-vf','crop=960:960:700:100','-c:v','libx264','-pix_fmt','yuv420p','-crf','18',path.join(out,'webgl2-post-formation-closeup-11s.mp4')]);
  const rc=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,recordVideo:{dir:path.join(out,'realtime'),size:report.viewport}});const rp=await rc.newPage();rp.on('pageerror',e=>report.errors.push(e.message));await ready(rp,{paused:'0',t:'12000'});const wallStart=Date.now();const start=await rp.locator('canvas').evaluate(c=>({...c.dataset}));await rp.waitForTimeout(12000);const end=await rp.locator('canvas').evaluate(c=>({...c.dataset}));report.realtime={wallMs:Date.now()-wallStart,start,end,file:await rp.video().path()};await rc.close();
 }
 await context.close();
}catch(e){report.errors.push(String(e.stack??e));process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
report.ok=report.errors.length===0&&report.checks.every(c=>c.ok);await writeFile(path.join(out,'checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({ok:report.ok,captures:report.captures.length,errors:report.errors}));
