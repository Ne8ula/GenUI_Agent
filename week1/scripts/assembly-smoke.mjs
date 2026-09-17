import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseDemoMemory } from "../apps/desktop/src/memory-contract.ts";
const output=resolve(process.argv[2]); await mkdir(output,{recursive:false});
const browser=await chromium.launch({channel:"msedge",headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:join(output,"video"),size:{width:1440,height:960}}});
const page=await context.newPage(); const errors=[], checks=[];
page.on("pageerror",e=>errors.push(e.message));
const shot=name=>page.screenshot({path:join(output,`${name}.png`),fullPage:true});
const openWeather=()=>page.getByRole("button",{name:"Weather",exact:false}).first().click();
try {
  await page.goto("http://127.0.0.1:1420"); await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(600);
  const original=await page.locator("canvas").elementHandle();
  const start=await page.locator(".moving-eye").boundingBox(); await shot("eye-before");
  await openWeather(); await page.waitForTimeout(250);
  const middle=await page.locator(".moving-eye").boundingBox(); await shot("eye-moving");
  assert.ok(middle.width < start.width && middle.width > 270,"Eye visibly shrinks through an intermediate width");
  assert.equal(await original.evaluate(el=>el.isConnected && el===document.querySelector("canvas")),true,"The live canvas survives docking");
  assert.equal(await page.getByTestId("weather-card").count(),0,"No instant completed dashboard");
  await page.waitForTimeout(850); await shot("loading");
  await page.getByTestId("weather-loading").waitFor();
  const end=await page.locator(".moving-eye").boundingBox();
  assert.ok(end.width < middle.width && end.x < start.x,"Eye docks to make room");
  await page.getByTestId("weather-card").waitFor(); await page.locator('[data-assembly="ready"]').waitFor(); await shot("weather-ready");
  checks.push({continuity:true,start,middle,end});
  // Cancel while the preparation timer is pending; it must never reveal later.
  await page.getByRole("button",{name:"Dismiss"}).click(); await page.getByRole("button",{name:"Open EVA"}).click();
  await openWeather(); await page.keyboard.press("Escape"); await page.waitForTimeout(8000);
  assert.equal(await page.getByTestId("weather-card").count(),0);assert.equal(await page.locator("canvas").count(),0);
  checks.push("Dismissal cancels pending assembly and disposes the eye");
  for(const [width,height] of [[960,760],[1960,530],[600,760],[400,640]]){
    await page.setViewportSize({width,height}); await page.getByRole("button",{name:"Open EVA"}).click(); await openWeather();
    await page.waitForTimeout(1050); await shot(`loading-${width}x${height}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"Loading layout fits");
    await page.getByTestId("weather-card").waitFor(); await page.waitForTimeout(700);
    const eye=await page.locator(".moving-eye").boundingBox(), anchor=await page.locator(".eye-anchor").boundingBox();
    assert.ok(Math.abs(eye.x-anchor.x)<1 && Math.abs(eye.width-anchor.width)<1,"Eye lands on responsive anchor");
    await page.getByRole("button",{name:"Dismiss"}).click(); await page.getByRole("button",{name:"Open EVA"}).waitFor();
  }
  checks.push("Four responsive loading layouts and eye landing positions passed");
  // Injected Tauri seam exercises real pending/failure presentation, not native execution.
  const record=parseDemoMemory(await readFile("fixtures/vault/preferences/weather-units.md","utf8"));
  await page.addInitScript(record=>{window.isTauri=true;window.__memoryDelay=5800;window.__TAURI_INTERNALS__={invoke:cmd=>cmd==="get_demo_memory"?new Promise(resolve=>setTimeout(()=>resolve(record),window.__memoryDelay)):Promise.resolve({configured:false})};},record);
  await page.setViewportSize({width:1440,height:960}); await page.reload(); await openWeather();
  await page.waitForTimeout(5500); assert.equal(await page.getByTestId("weather-card").count(),0);await shot("slow-memory");
  await page.getByTestId("weather-card").waitFor();checks.push("Skeleton waits beyond choreography for delayed data (injected IPC)");
  await page.emulateMedia({reducedMotion:"reduce"}); await page.reload(); await openWeather();
  await page.waitForTimeout(100); assert.equal(await page.locator(".moving-eye").evaluate(el=>el.getAnimations().length),0);
  assert.equal(await page.getByTestId("weather-loading").evaluate(el=>getComputedStyle(el).animationName),"none");
  await page.getByTestId("weather-card").waitFor();checks.push("Reduced motion skips eye travel and skeleton animation while respecting actual pending data");
  await page.reload(); await page.evaluate(()=>{window.__memoryDelay=8000;});await openWeather();
  await page.getByText("Preference unavailable",{exact:true}).waitFor({timeout:8000});
  await page.waitForTimeout(2300);assert.equal(await page.getByRole("button",{name:"Preference used: Celsius"}).count(),0);
  checks.push("Data timeout exits loading with a visible fallback; late reply cannot replace it");
  assert.deepEqual(errors,[]); await writeFile(join(output,"results.json"),JSON.stringify({status:"passed",checks,errors},null,2));
  await page.close();await page.video().saveAs(join(output,"assembly-demo.webm"));console.log("Assembly, continuous eye, delay, dismissal and responsive checks passed.");
} catch(e){await writeFile(join(output,"failure.json"),JSON.stringify({error:e.message,checks,errors},null,2));throw e;}
finally{await context.close();await browser.close();}
