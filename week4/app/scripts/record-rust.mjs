// Sequential, bounded PNG-to-FFmpeg capture. Fixed-time playback is not a performance measurement.
// node scripts/record-rust.mjs <new absolute output directory> [port]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(app, 'package.json'));
const { chromium } = require('playwright');
const output = process.argv[2];const port = Number(process.argv[3] || 1460);
const production = process.argv.includes('--production');
if (!output || !path.isAbsolute(output)) throw new Error('New absolute output directory required');
await mkdir(output, { recursive: false });
const report = { production, fps: 15, intendedFrames: 361, frames: 0, durationMs: 24000, viewport: { width: 1920, height: 1080 }, dpr: 1, errors: [], blocked: [], realtime: null, final: null, timing: 'Stepped 15fps (not realtime performance); separate unstepped browser recording retained', startedAt: new Date().toISOString() };
const server = spawn(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), ...(production ? ['preview'] : []), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let browser, encoder;
try {
  await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('Vite startup timeout')),60000);
    const onData=(data)=>{if(data.toString().includes('Local:')){clearTimeout(timer);resolve();}};
    server.stdout.on('data',onData);server.stderr.on('data',onData);
    server.once('error',(e)=>{clearTimeout(timer);reject(e);});server.once('exit',(c)=>{clearTimeout(timer);reject(new Error(`Vite exit ${c}`));});
  });
  browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
  const watch=async(context)=>{
    await context.route(/\.(png|jpe?g|webp|gif|mp4|webm|svg)(?:\?|$)/i,(route)=>{report.blocked.push(route.request().url());return route.abort('blockedbyclient');});
    const page=await context.newPage();page.on('pageerror',(e)=>report.errors.push(e.message));return page;
  };
  const context=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1});
  const page=await watch(context);
  await page.goto(`http://127.0.0.1:${port}/?fixture=1&capture=1&clock=manual&seed=33&build=12000&t=0`);
  await page.waitForSelector('canvas[data-ready="1"]');
  encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-n','-f','image2pipe','-framerate',String(report.fps),'-i','pipe:0','-an','-c:v','libx264','-threads','2','-preset','fast','-crf','18','-pix_fmt','yuv420p',path.join(output,'rust-construction-and-living-24s.mp4')],{stdio:['pipe','ignore','pipe'],windowsHide:true});
  let encoderErrors='';encoder.stderr.on('data',(d)=>{encoderErrors+=d;});
  const encoded=once(encoder,'exit');
  for(let i=0;i<report.intendedFrames;i++) {
    if(i) await page.evaluate((ms)=>window.__evaFixture.step(ms),1000/report.fps);
    const png=await page.screenshot();
    if(!encoder.stdin.write(png)) await once(encoder.stdin,'drain');
    if(i%15===0) await writeFile(path.join(output,`second-${String(i/15).padStart(2,'0')}.png`),png,{flag:'wx'});
    report.frames++;
    if(i%60===0) console.log(`Fixed-time frames: ${report.frames}/${report.intendedFrames}`);
  }
  report.final=await page.locator('canvas').evaluate((c)=>({...c.dataset}));
  encoder.stdin.end();const [code]=await encoded;encoder=null;
  if(code!==0) throw new Error(`FFmpeg ${code}: ${encoderErrors}`);
  if(Math.abs(Number(report.final.timeMs)-24000)>0.1) throw new Error('Manual clock does not match recording duration');
  await context.close();
  const real=await browser.newContext({viewport:report.viewport,deviceScaleFactor:1,recordVideo:{dir:path.join(output,'realtime'),size:{width:1280,height:720}}});
  const live=await watch(real);
  await live.goto(`http://127.0.0.1:${port}/?fixture=1&capture=1&seed=33&build=0&t=0`);
  await live.waitForSelector('canvas[data-ready="1"]');
  const start=await live.locator('canvas').evaluate((c)=>({...c.dataset}));
  const began=Date.now();await live.waitForTimeout(12000);
  const end=await live.locator('canvas').evaluate((c)=>({...c.dataset}));
  const video=live.video();await real.close();
  report.realtime={file:path.relative(output,await video.path()).replaceAll('\\','/'),wallDurationMs:Date.now()-began,start,end,notes:'Unstepped browser recording; includes navigation/startup before ready. No native WebView2 claim.'};
} catch(error) {report.errors.push(error.stack||String(error));}
finally {if(encoder) encoder.kill();await browser?.close();server.kill();}
report.finishedAt=new Date().toISOString();report.ok=report.errors.length===0&&report.frames===report.intendedFrames&&report.blocked.length===0;
await writeFile(path.join(output,'recording.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1;
