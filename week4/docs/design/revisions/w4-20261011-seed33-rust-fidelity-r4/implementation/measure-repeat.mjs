import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const app=path.resolve(process.argv[3] || 'week4/app');
const require=createRequire(path.join(app,'package.json'));
const {chromium}=require('playwright');
const output=process.argv[2],port=1474;
const server=spawn(process.execPath,[path.join(path.dirname(require.resolve('vite/package.json')),'bin/vite.js'),'preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:app,stdio:['ignore','pipe','pipe'],windowsHide:true});
let browser;
const report={label:'Three sequential fresh-context 6s candidate18 Windows Chrome RAF/CPU samples. No baseline rerun and no GPU/native causal performance claim.',runs:[],errors:[]};
try{
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout')),60000);const ready=d=>{if(d.toString().includes('Local:')){clearTimeout(timer);resolve()}};server.stdout.on('data',ready);server.stderr.on('data',ready);server.once('error',reject);server.once('exit',c=>reject(Error('server exit '+c)))});
 browser=await chromium.launch({headless:true,channel:'chrome'});
 for(let run=0;run<3;run++){
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?fixture=1&look=seed33&seed=33&build=12000&t=12000&paused=1`);await page.waitForSelector('canvas[data-ready="1"]');await page.waitForTimeout(300);await page.getByRole('button',{name:'Resume',exact:true}).click();
  const result=await page.evaluate(async()=>{const samples=[];let last='';const start=performance.now();return await new Promise(resolve=>{function collect(now){const d=document.querySelector('canvas')?.dataset;if(d?.ready==='1'&&d.gpuFrames!==last){last=d.gpuFrames;samples.push({frameMs:Number(d.frameMs),submitMs:Number(d.drawMs),timeMs:Number(d.timeMs),memory:Number(d.wasmBytes),buffer:Number(d.cpuBufferBytes),uploadedBytes:Number(d.uploadedBytes),gpuAllocatedBytes:Number(d.gpuAllocatedBytes),renderTargetBytes:Number(d.renderTargetBytes)})}if(now-start>=6000)resolve({elapsedMs:now-start,samples});else requestAnimationFrame(collect)}requestAnimationFrame(collect)})});
  const q=(key,p)=>{const a=result.samples.map(x=>x[key]).sort((a,b)=>a-b);return a[Math.floor((a.length-1)*p)]};
  report.runs.push({...result,frameMedianMs:q('frameMs',.5),frameP95Ms:q('frameMs',.95),submitMedianMs:q('submitMs',.5),submitP95Ms:q('submitMs',.95),maxWasmBytes:Math.max(...result.samples.map(x=>x.memory))});await context.close();
 }
} catch(e){report.errors.push(String(e))}finally{await browser?.close();server.kill()}
report.ok=report.errors.length===0&&report.runs.length===3&&report.runs.every(r=>r.samples.length>0);
await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({ok:report.ok,runs:report.runs.map(({samples,...r})=>({...r,samples:samples.length})),errors:report.errors},null,2));process.exitCode=report.ok?0:1;
