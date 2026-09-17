import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir,writeFile } from "node:fs/promises";
import { resolve,join } from "node:path";
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const browser=await chromium.launch({channel:"msedge",headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:join(output,"video"),size:{width:1440,height:960}}});
const page=await context.newPage();const errors=[],checks=[];page.on("pageerror",e=>errors.push(e.message));
const sample=()=>page.locator("canvas").evaluate(c=>{const gl=c.getContext("webgl"),p=gl.getParameter(gl.CURRENT_PROGRAM);return Object.fromEntries(["gaze","tissue","closure"].map(n=>{const v=gl.getUniform(p,gl.getUniformLocation(p,n));return [n,typeof v==="number"?v:Array.from(v)];}));});
const shot=name=>page.screenshot({path:join(output,`${name}.png`),fullPage:true});
try{
  await page.goto("http://127.0.0.1:1420");await page.evaluate(()=>document.fonts.ready);await page.locator('canvas[data-renderer="webgl"]').waitFor();
  const canvas=await page.locator("canvas").elementHandle();
  await page.mouse.move(10,50);await page.waitForTimeout(700);const left=await sample();await shot("look-left");
  await page.mouse.move(1420,50);await page.waitForTimeout(90);const response=await sample();await shot("tissue-following");
  assert.ok(response.gaze[0]>.10,"Iris keeps fast attention");
  assert.ok(response.tissue[0]<response.gaze[0]-.035,"Socket/lids follow with separate weight");
  await page.waitForTimeout(650);const right=await sample();assert.ok(right.tissue[0]>.135&&left.tissue[0]<-.135,"Whole socket traverses both directions");await shot("look-right");
  await page.mouse.move(720,920);await page.waitForTimeout(700);const down=await sample();assert.ok(down.tissue[1]<-.065,"Lids and surrounding tissue follow vertical gaze");await shot("look-down");
  await page.waitForFunction(()=>{const gl=document.querySelector('canvas').getContext('webgl'),p=gl.getParameter(gl.CURRENT_PROGRAM);return gl.getUniform(p,gl.getUniformLocation(p,'closure'))>.9;},{},{timeout:8000,polling:'raf'});
  await shot("blink");
  checks.push({coupledMotion:{left,response90ms:response,right,down},blinkObserved:true});
  await page.getByRole("button",{name:"Weather",exact:false}).first().click();await page.waitForTimeout(1300);await shot("retrieval");
  await page.locator('[data-assembly="ready"]').waitFor();await shot("weather");
  assert.equal(await canvas.evaluate(el=>el.isConnected&&el===document.querySelector('canvas')),true,"Same biological eye survives docking");
  await page.getByRole("button",{name:"Quiet mode"}).click();await page.waitForTimeout(300);
  const stillA=await page.locator('.moving-eye').screenshot({path:join(output,'quiet-a.png')});await page.mouse.move(20,20);await page.waitForTimeout(400);const stillB=await page.locator('.moving-eye').screenshot({path:join(output,'quiet-b.png')});
  await writeFile(join(output,'quiet-diagnostic.json'),JSON.stringify({uniforms:await sample(),animations:await page.locator('.moving-eye').evaluate(el=>el.getAnimations({subtree:true}).map(a=>({state:a.playState,time:a.currentTime})))},null,2));
  assert.ok(stillA.equals(stillB),"Quiet freezes both eye and anatomical frame");const quiet=await sample();assert.deepEqual(quiet.tissue,[0,0]);assert.equal(quiet.closure,0);
  await page.getByRole("button",{name:"Quiet on"}).click();
  for(const [width,height] of [[960,760],[1960,530],[600,760],[400,640]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(1100);await shot(`weather-${width}x${height}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"No panel/frame overflow");
    assert.ok(await page.locator('.day-cell').evaluateAll(cells=>cells.every(el=>el.scrollWidth<=el.clientWidth)),"Forecast text fits");
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(200);assert.deepEqual((await sample()).tissue,[0,0]);
  const motion=await page.locator('.moving-eye .tendon-contour').evaluate(el=>getComputedStyle(el).animationName);assert.equal(motion,'none');
  checks.push("Quiet/reduced motion freeze tissue, blink and frame; four responsive final layouts fit");
  await page.getByRole("button",{name:"Dismiss"}).click();await page.getByRole("button",{name:"Open EVA"}).waitFor();assert.equal(await page.locator('canvas').count(),0);
  assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({status:'passed',checks,errors},null,2));
  await page.close();await page.video().saveAs(join(output,'biomech-eye.webm'));console.log('Coordinated eye/tissue, blink, docking, quiet and responsive checks passed.');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({error:e.message,checks,errors},null,2));throw e;}
finally{await context.close();await browser.close();}
