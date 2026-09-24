// Browser integration with explicitly mocked recognition. No microphone/provider call.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(process.env.E1_PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href : "playwright");
if (!process.argv[2]) throw Error("Supply a fresh evidence directory");
const out = resolve(process.argv[2]); await mkdir(out);
const browser = await chromium.launch({ channel:"chrome", headless:true });
const context = await browser.newContext({ viewport:{width:1440,height:900}, reducedMotion:"no-preference", recordVideo:{dir:out,size:{width:1440,height:900}} });
await context.addInitScript(() => {
  window.__recognizers = [];
  Object.defineProperty(window, "speechSynthesis", { value: { getVoices:()=>[], cancel(){}, speak(){} } });
  window.SpeechRecognition = class {
    constructor(){window.__recognizers.push(this);}
    start(){queueMicrotask(()=>this.onstart?.());}
    abort(){}
  };
});
const page = await context.newPage();
const result = {kind:"browser-only, mocked recognition; no live audio/provider",checks:[],errors:[]};
page.on("pageerror", e => result.errors.push(e.message));
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);};
const state=()=>page.evaluate(()=>window.__E1_WEAVE_TEST__.getSnapshot());
const capture=name=>page.screenshot({path:resolve(out,name+".png")});
const settle=()=>page.waitForFunction(()=>document.querySelector(".weave-material")?.dataset.motion!=="transition");
const say=async text=>{
  await page.waitForFunction(()=>window.__E1_WEAVE_TEST__.voice().getState().phase==="listening");
  await page.evaluate(text=>{const r=window.__recognizers.at(-1);r.onresult?.({resultIndex:0,results:[{isFinal:true,length:1,0:{transcript:text}}]});},text);
};
try {
  await page.goto("http://127.0.0.1:1431/"); await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(1200); await page.mouse.move(720,435); await page.waitForTimeout(800);
  const eyeBefore=await capture("idle");
  check("original procedural eye, not static replacement",await page.locator('canvas[data-origin="week1-eye-weave-morph"]').count()===1);
  check("microphone is opt-in",await page.evaluate(()=>!window.__E1_WEAVE_TEST__.voice().getState().enabled));
  await page.getByRole("button",{name:"Enable microphone",exact:true}).click();
  await say("What's the weather today in NYC?");
  check("facts available without waiting for transition",(await state()).forecast.temperatureC===22);
  await settle(); await capture("sunny");
  check("single material canvas, no second eye",await page.locator("canvas").count()===1);
  const move=page.getByRole("button",{name:"Move weather composition. Use arrow keys to move",exact:true});
  await move.focus(); await page.keyboard.press("ArrowLeft");
  check("keyboard move preserves focus",await move.evaluate(e=>e===document.activeElement));
  await page.getByRole("button",{name:"Pin",exact:true}).click();
  const pin=(await state()).anchors["12:00"];
  await say("What about tomorrow?");
  check("tomorrow is separately dated NYC fixture",(await state()).forecast.date==="2026-10-15" && (await state()).forecast.temperatureC===16);
  assert.deepEqual((await state()).anchors["12:00"],pin); result.checks.push("pin and geometry survive day revision");
  await settle(); await capture("rainy");
  await page.getByRole("button",{name:"Stop",exact:true}).click();
  await page.waitForTimeout(100);
  check("Stop arrests motion",(await state()).transition.status==="interrupted" && await page.locator("canvas").getAttribute("data-motion")==="settled");
  await page.getByRole("button",{name:"Controls +",exact:true}).click();
  await page.getByRole("button",{name:"Plain answer",exact:true}).click();
  check("plain answer retains exact facts",(await page.locator(".weave-detail").innerText()).includes("16 degrees Celsius"));
  await capture("plain");
  await page.getByRole("button",{name:"Plain answer",exact:true}).click();
  await page.getByRole("button",{name:"Less motion",exact:true}).click();
  await page.getByRole("button",{name:"Controls −",exact:true}).click();
  await say("Weather today in NYC");
  await page.waitForTimeout(100);
  check("reduced motion settles immediately",(await state()).reducedMotion && await page.locator("canvas").getAttribute("data-motion")==="settled");
  await capture("reduced");
  await page.evaluate(()=>window.__E1_WEAVE_TEST__.controller.setReducedMotion(false));
  await say("What about tomorrow?");
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  check("dismiss immediately clears facts but retains microphone",(await state()).forecast===null && await page.evaluate(()=>window.__E1_WEAVE_TEST__.voice().getState().enabled));
  await settle(); await page.mouse.move(720,435); await page.waitForTimeout(800); const eyeAfter=await capture("returned-eye");
  check("dismiss returns to original eye form",await page.locator("canvas").getAttribute("data-form")==="eye");
  const pixels = png => execFileSync("ffmpeg", ["-v","error","-f","image2pipe","-i","pipe:0","-vf","crop=720:335:360:264","-f","rawvideo","-pix_fmt","rgba","pipe:1"], {input:png,maxBuffer:4_000_000});
  check("returned eye matches original position scale and pixels",pixels(eyeBefore).equals(pixels(eyeAfter)));
  check("weather regions removed after dismiss",await page.locator(".weave-facts").count()===0);
  await say("Weather today in NYC");
  await page.evaluate(()=>{
    const old=window.__recognizers.at(-1).onresult;
    window.__E1_WEAVE_TEST__.command("Dismiss the weather");
    old?.({resultIndex:0,results:[{isFinal:true,length:1,0:{transcript:"What about tomorrow?"}}]});
  });
  check("late recognition cannot revive dismissed weather",(await state()).status==="dismissed");
  await page.getByRole("button",{name:"Mic off",exact:true}).click();
  check("microphone off distinct from weather dismissal",await page.evaluate(()=>!window.__E1_WEAVE_TEST__.voice().getState().enabled));
  await page.getByRole("button",{name:"Controls +",exact:true}).click();
  await page.getByRole("button",{name:"Today in NYC",exact:true}).click();
  await page.getByRole("button",{name:"Controls −",exact:true}).click();
  await page.setViewportSize({width:420,height:900}); await page.waitForTimeout(1200); await capture("narrow");
  check("narrow viewport no horizontal overflow",await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{const c=window.__E1_WEAVE_TEST__.controller;c.setPlain(true);c.dismiss();});
  await settle();
  check("plain dismissal still returns eye",await page.locator("canvas").getAttribute("data-form")==="eye");
  await page.evaluate(()=>{const c=window.__E1_WEAVE_TEST__.controller;c.setPlain(false);c.requestForecast("today");});
  await settle();
  check("transparent answer gap is not a native region",await page.evaluate(()=>{
    const box=document.querySelector('.weave-answer').getBoundingClientRect();
    return [...document.querySelectorAll('[data-e1-hit-region]')].every(e=>{const r=e.getBoundingClientRect();const x=box.right-5,y=box.top+58;return !(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom);});
  }));
  const fallback=await context.newPage();
  await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:original.call(this,type,...args);};window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});
  await fallback.goto("http://127.0.0.1:1431/");
  await fallback.getByRole('button',{name:'Enable microphone',exact:true}).click();
  check("unavailable microphone has honest fallback",await fallback.locator('.weave-status').first().innerText().then(t=>t.includes('unavailable')));
  await fallback.getByRole('button',{name:'Controls +',exact:true}).click();await fallback.getByRole('button',{name:'Today in NYC',exact:true}).click();
  await fallback.waitForTimeout(150);
  check("renderer failure settles every new transition",await fallback.evaluate(()=>window.__E1_WEAVE_TEST__.getSnapshot().transition.status==='settled'));
  check("renderer failure remains disclosed",await fallback.locator('.weave-notice').innerText().then(t=>t.includes('WebGL unavailable')));
  await fallback.screenshot({path:resolve(out,'unavailable.png')}); await fallback.close();
  const denied=await context.newPage();await denied.addInitScript(()=>{window.SpeechRecognition=class{start(){queueMicrotask(()=>this.onerror?.({error:'not-allowed'}));}abort(){}};});
  await denied.goto('http://127.0.0.1:1431/');await denied.getByRole('button',{name:'Enable microphone',exact:true}).click();
  check("denied microphone is off and explained",await denied.evaluate(()=>window.__E1_WEAVE_TEST__.voice().getState().phase==='denied'&&!window.__E1_WEAVE_TEST__.voice().getState().enabled));await denied.close();
  check("no uncaught errors",result.errors.length===0);
  result.completed=true;
} catch(error) { result.failure=String(error);process.exitCode=1;await capture("failure"); }
finally { await writeFile(resolve(out,"checks.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await context.close();await browser.close(); }
