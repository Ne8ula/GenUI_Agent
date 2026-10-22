/** Actual saved geometry, isolated read-only broker; no cloud or completion calls. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';
const output=process.argv[2];if(!output)throw Error('Fresh evidence directory required');
await mkdir(output,{recursive:false});
const parameters={luminanceFloor:.14,pointSizeCssPixels:1.8,viewport:{width:1440,height:1100},
  background:[23,27,24],profile:'vga-visual-v1',sourceCameraIndices:[1,6],
  regions:{sofa:[500,280,950,440],wall:[600,20,1000,160]},
  regionScope:'Frozen manually selected rectangles from prior material-v2 camera1 screenshot; top-left framebuffer coordinates. Not semantic masks. AA included.',
  transformation:'Linear RGB mixed toward white only below luminance .14; sampling, geometry, surface and provenance colors unchanged.',
  selection:'Compare all three existing completed/fused/material candidates at camera1; completed camera6 as second view.'};
// Freeze parameters before starting the browser or collecting experiment frames.
await writeFile(join(output,'frozen-parameters.json'),JSON.stringify(parameters,null,2));
const directory=await mkdtemp(join(tmpdir(),'eva-point-contrast-')),checks=[],errors=[],frames=[];
let broker,server,browser;
async function frame(canvas,reset=true) {
  return canvas.evaluate(async (element,{reset,regions})=>{
    element.dispatchEvent(new KeyboardEvent('keydown',{key:reset?'Home':'q',bubbles:true}));
    const gl=element.getContext('webgl2')??element.getContext('webgl'),pixels=new Uint8Array(element.width*element.height*4);
    gl.readPixels(0,0,element.width,element.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const distinct=new Set();for(let i=0;i<pixels.length&&distinct.size<32;i+=4)distinct.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    if(distinct.size<4)throw Error('Blank drawing buffer');
    const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
    const luminance=(r,g,b)=>.2126*linear(r)+.7152*linear(g)+.0722*linear(b),background=luminance(23,27,24);
    const statistics={};
    for(const [name,[x0,y0,x1,y1]]of Object.entries(regions)) {
      const ratios=[];
      for(let y=y0;y<Math.min(y1,element.height);y++)for(let x=x0;x<Math.min(x1,element.width);x++) {
        const i=((element.height-1-y)*element.width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];
        if(r===23&&g===27&&b===24)continue;
        const l=luminance(r,g,b);ratios.push((Math.max(l,background)+.05)/(Math.min(l,background)+.05));
      }
      ratios.sort((a,b)=>a-b);statistics[name]={nonBackgroundPixels:ratios.length,median:ratios[Math.floor(ratios.length/2)]??null,
        fractionBelow1_5:ratios.filter(v=>v<1.5).length/Math.max(1,ratios.length)};
    }
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels)),b=>b.toString(16).padStart(2,'0')).join('');
    return{hash,png:element.toDataURL('image/png').split(',')[1],width:element.width,height:element.height,statistics};
  },{reset,regions:parameters.regions});
}
async function capture(canvas,name) {
  const result=await frame(canvas);await writeFile(join(output,`${name}.png`),Buffer.from(result.png,'base64'));
  const {png,...metadata}=result;frames.push({name,...metadata});return result;
}
try {
  const hosts=new Set();broker=await createBroker({directory,allowedHosts:hosts,
    runner:async()=>{throw Error('No cloud calls');},completionRunner:async()=>{throw Error('No completion calls');},shadoFetch:async()=>{throw Error('No Shado calls');}});
  server=broker.server;await new Promise(r=>server.listen(0,'127.0.0.1',r));const host=`127.0.0.1:${server.address().port}`;hosts.add(host);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  async function context(options) {
    const value=await browser.newContext(options);await value.route('**/api/room-workflow/**',async route=>{
      assert.equal(route.request().method(),'GET');const url=new URL(route.request().url());
      assert.ok(url.pathname==='/api/room-workflow/session'||url.pathname.startsWith('/api/room-workflow/benchmark/'));
      await route.fulfill({response:await route.fetch({url:`http://${host}${url.pathname}${url.search}`,timeout:190000})});
    });return value;
  }
  const desktop=await context({viewport:parameters.viewport}),page=await desktop.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:1440/?scene=arkitscenes-room&profile=vga-visual-v1';
  await page.goto(url);await page.getByText('ML execution complete',{exact:true}).waitFor();
  const canvas=page.locator('canvas'),viewpoint=page.getByRole('combobox',{name:'Viewpoint'});
  const endpoint='/api/room-workflow/benchmark/arkitscenes/profiles/vga-visual-v1';
  const digest=()=>page.evaluate(async endpoint=>{
    const bytes=await(await fetch(endpoint)).arrayBuffer();
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  },endpoint);
  const dataBefore=await digest();
  for(const [variant,label]of [['completed','Provisional completion'],['fused','Fused surfaces'],['material','Inferred wall colors']]) {
    await page.getByRole('button',{name:label,exact:true}).click();await viewpoint.selectOption('1');
    const surfaceBefore=await frame(canvas);
    await page.getByRole('button',{name:'Provenance',exact:true}).click();const provenanceBefore=await frame(canvas);
    await page.getByRole('button',{name:'Points',exact:true}).click();await page.getByRole('button',{name:'Uniform dots',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Enhanced contrast',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'Source colors',exact:true}).click();
    const source=await capture(canvas,`${variant}-camera1-source`);
    await page.getByRole('button',{name:'Enhanced contrast',exact:true}).focus();await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button',{name:'Enhanced contrast',exact:true}).getAttribute('aria-pressed'),'true');
    const enhanced=await capture(canvas,`${variant}-camera1-enhanced`);
    assert.notEqual(source.hash,enhanced.hash);
    assert.ok(enhanced.statistics.sofa.median>source.statistics.sofa.median);
    await page.getByRole('button',{name:'Surfaces',exact:true}).click();assert.equal((await frame(canvas)).hash,surfaceBefore.hash);
    assert.equal(await page.getByRole('group',{name:'Point color display'}).count(),0);
    await page.getByRole('button',{name:'Provenance',exact:true}).click();assert.equal((await frame(canvas)).hash,provenanceBefore.hash);
    await page.getByRole('button',{name:'Points',exact:true}).click();await page.getByRole('button',{name:'Uniform dots',exact:true}).click();assert.equal((await frame(canvas)).hash,enhanced.hash);
    await page.getByRole('button',{name:'Source colors',exact:true}).click();assert.equal((await frame(canvas)).hash,source.hash);
    checks.push(`${variant}: points visibly change; source colors recover exactly; surfaces and provenance framebuffer hashes unchanged`);
  }
  await page.getByRole('button',{name:'Provisional completion',exact:true}).click();await viewpoint.selectOption('6');
  await page.getByRole('button',{name:'Points',exact:true}).click();await page.getByRole('button',{name:'Uniform dots',exact:true}).click();
  await page.getByRole('button',{name:'Source colors',exact:true}).click();const source6=await capture(canvas,'completed-camera6-source');
  await page.getByRole('button',{name:'Enhanced contrast',exact:true}).click();const enhanced6=await capture(canvas,'completed-camera6-enhanced');
  assert.notEqual(source6.hash,enhanced6.hash);
  const home=await canvas.screenshot();await canvas.focus();await page.keyboard.press('w');
  assert.equal((await canvas.screenshot()).equals(home),false);await page.keyboard.press('Home');
  assert.equal((await canvas.screenshot()).equals(home),true);
  await page.keyboard.press('ArrowLeft');assert.equal((await canvas.screenshot()).equals(home),false);
  await page.keyboard.press('Home');assert.equal((await canvas.screenshot()).equals(home),true);
  assert.equal(await canvas.evaluate(e=>e===document.activeElement),true);
  await page.screenshot({path:join(output,'desktop.png'),fullPage:true});
  assert.equal(await digest(),dataBefore,'Actual source/result/candidate API bytes unchanged');
  await canvas.evaluate(e=>(e.getContext('webgl2')??e.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('alert').filter({hasText:'Graphics interrupted'}).waitFor();await page.getByRole('button',{name:'Reopen viewer'}).click();
  await page.waitForFunction(()=>!document.querySelector('[role=alert]'));
  await page.getByRole('button',{name:'Points',exact:true}).click();await page.getByRole('button',{name:'Uniform dots',exact:true}).click();await page.getByRole('button',{name:'Enhanced contrast',exact:true}).click();
  assert.equal((await capture(canvas,'recovered-camera6-enhanced')).hash,enhanced6.hash);
  checks.push('Second view changes, actual W/orbit/Home pixels and keyboard focus, context interruption/reopen recover same enhanced view; source/candidate API bytes unchanged');
  const mobile=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),phone=await mobile.newPage();
  phone.on('pageerror',e=>errors.push(e.message));await phone.goto(url);await phone.getByText('ML execution complete',{exact:true}).waitFor();
  await phone.getByRole('button',{name:'Provisional completion',exact:true}).tap();
  await phone.getByRole('button',{name:'Points',exact:true}).tap();await phone.getByRole('button',{name:'Uniform dots',exact:true}).tap();
  await phone.getByRole('button',{name:'Source colors',exact:true}).tap();await phone.screenshot({path:join(output,'phone-source.png'),fullPage:true});
  await phone.getByRole('button',{name:'Enhanced contrast',exact:true}).tap();await phone.screenshot({path:join(output,'phone-enhanced.png'),fullPage:true});
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const phoneCanvas=phone.locator('canvas');const phoneHome=await phoneCanvas.screenshot();await phoneCanvas.focus();await phone.keyboard.press('w');
  assert.equal((await phoneCanvas.screenshot()).equals(phoneHome),false);await phone.keyboard.press('Home');assert.equal((await phoneCanvas.screenshot()).equals(phoneHome),true);
  await phone.getByRole('button',{name:'Source colors',exact:true}).focus();await phone.keyboard.press('Enter');
  assert.equal(await phone.getByRole('button',{name:'Source colors',exact:true}).getAttribute('aria-pressed'),'true');
  checks.push('390px reduced-motion touch layout, both toggle states, keyboard activation and movement/reset');
  await page.goto('http://127.0.0.1:1440/?scene=arkitscenes-room');
  await page.getByText('ML execution complete',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Points',exact:true}).click();await page.getByRole('button',{name:'Uniform dots',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Enhanced contrast',exact:true}).getAttribute('aria-pressed'),'true');
  await capture(canvas,'original-camera0-enhanced');
  await page.getByRole('button',{name:'Source colors',exact:true}).click();await capture(canvas,'original-camera0-source');
  checks.push('Original saved profile retains its default candidate/viewpoint and exposes both point display options');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'passed',checks,frames,errors,apiSha256:dataBefore,
    limits:'Saved real model results. No new model run. Headless Edge/touch emulation, not physical phone. Contrast statistics are frozen manual ROI diagnostics, not geometry accuracy or semantic segmentation.'},null,2));
} catch(error) {
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'failed',checks,frames,errors,error:String(error)},null,2));throw error;
} finally {
  await browser?.close();if(broker)await broker.wait();
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(directory,{recursive:true,force:true});
}
