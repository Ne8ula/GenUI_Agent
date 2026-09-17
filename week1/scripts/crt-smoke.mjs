import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve,join } from "node:path";
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const browser=await chromium.launch({channel:"msedge",headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:join(output,"video"),size:{width:1440,height:960}}});
const page=await context.newPage();const errors=[],checks=[];page.on("pageerror",e=>errors.push(e.message));
const shot=name=>page.screenshot({path:join(output,`${name}.png`),fullPage:true});
const weather=()=>page.getByRole("button",{name:"Weather",exact:false}).first().click();
const gaze=()=>page.locator("canvas").evaluate(c=>{const gl=c.getContext("webgl"),p=gl.getParameter(gl.CURRENT_PROGRAM);return Array.from(gl.getUniform(p,gl.getUniformLocation(p,"gaze")));});
try{
  await page.goto("http://127.0.0.1:1420");await page.evaluate(()=>document.fonts.ready);await page.locator('canvas[data-renderer="webgl"]').waitFor();
  await page.mouse.move(1425,50);await page.waitForTimeout(180);const right=await gaze();
  await page.mouse.move(10,50);await page.waitForTimeout(180);const left=await gaze();
  assert.ok(right[0]>.135&&left[0]<-.135,"Global gaze reaches either side within the 180ms sample window");
  checks.push({cursorOutsideEye:{right,left,sampleWindowMs:180}});await shot("eye");
  await page.evaluate(()=>{window.__crt=[];const root=document.querySelector('main');new MutationObserver(()=>{const phase=root.dataset.assembly;if(window.__crt.at(-1)?.phase!==phase)window.__crt.push({phase,time:performance.now()});}).observe(root,{attributes:true,attributeFilter:['data-assembly']});});
  await weather();await page.waitForTimeout(1200);await shot("memory-folders");
  assert.equal(await page.locator('.folder.selected .folder-face > span').innerText(),"PREFERENCES");
  await page.waitForTimeout(1000);await shot("memory-record");
  assert.equal(await page.locator('.folder.selected .folder-face > span').innerText(),"WEATHER-UNITS.MD");
  await page.locator('[data-stage="raster"]').waitFor();await page.waitForTimeout(1300);await shot("raster-build");
  assert.equal(await page.getByTestId("weather-card").count(),0,"Completed weather withheld during retrieval/blueprint pass");
  await page.locator('[data-assembly="revealing"]').waitFor();await page.waitForTimeout(800);await shot("scan-reveal");
  assert.equal(await page.getByTestId("weather-card").getAttribute("inert"),"","Controls cannot activate while raster reveal obscures them");
  await page.locator('[data-assembly="ready"]').waitFor();await shot("ready");
  const timing=await page.evaluate(()=>window.__crt);const ms=timing.at(-1).time-timing[0].time;
  assert.ok(ms>=7000&&ms<10000,`Complete construction lasts 5–10 seconds (${ms})`);checks.push({presentationMs:ms,phases:timing});
  await page.mouse.move(1420,700);await page.waitForTimeout(180);assert.ok((await gaze())[0]>.135,"Docked pupil follows dashboard cursor");
  for(const [width,height] of [[960,760],[1960,530],[600,760],[400,640]]){
    await page.getByRole("button",{name:"Dismiss"}).click();await page.setViewportSize({width,height});await page.getByRole("button",{name:"Open EVA"}).click();await weather();
    await page.waitForTimeout(2100);await shot(`folders-${width}x${height}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Folder view fits");
    await page.locator('[data-stage="raster"]').waitFor();await page.waitForTimeout(1800);await shot(`raster-${width}x${height}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Raster fits");
    await page.locator('[data-assembly="ready"]').waitFor();await shot(`weather-${width}x${height}`);
    assert.ok(await page.locator('.day-cell').evaluateAll(cells=>cells.every(c=>c.scrollWidth<=c.clientWidth)),"Forecast cells fit");
  }
  checks.push("Four responsive folder/raster/final layouts passed");
  await page.getByRole("button",{name:"Dismiss"}).click();await page.getByRole("button",{name:"Open EVA"}).click();await weather();
  await page.waitForTimeout(1000);await page.getByRole("button",{name:"Quiet mode"}).click();
  await page.locator('[data-assembly="ready"]').waitFor({timeout:1000});
  assert.equal(await page.getByTestId("weather-card").evaluate(el=>getComputedStyle(el).animationName),"none");
  checks.push("Enabling Quiet during retrieval skips the remaining presentation hold/reveal");
  await page.getByRole("button",{name:"Quiet on"}).click();await page.getByRole("button",{name:"Dismiss"}).click();await page.getByRole("button",{name:"Open EVA"}).click();await weather();
  await page.waitForTimeout(1700);await page.keyboard.press("Escape");await page.waitForTimeout(6500);
  assert.equal(await page.getByTestId("weather-card").count(),0);assert.equal(await page.locator('canvas').count(),0);
  checks.push("Cancelled seven-second sequence cannot reveal late");
  assert.deepEqual(errors,[]);await writeFile(join(output,"results.json"),JSON.stringify({status:"passed",checks,errors},null,2));
  await page.close();await page.video().saveAs(join(output,"crt-demo.webm"));console.log("CRT timing, cursor tracking, folders, responsive layouts, quiet/cancel passed.");
}catch(e){await writeFile(join(output,"failure.json"),JSON.stringify({error:e.message,checks,errors},null,2));throw e;}
finally{await context.close();await browser.close();}
