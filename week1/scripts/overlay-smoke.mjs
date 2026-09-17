import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
const output=resolve(process.argv[2]);await mkdir(output,{recursive:false});
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:join(output,'video'),size:{width:1440,height:960}}});
const page=await context.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/narration/status',route=>route.fulfill({json:{configured:false}}));
const shot=name=>page.screenshot({path:join(output,name+'.png'),omitBackground:true,fullPage:true});
try{
 await page.goto('http://127.0.0.1:1420');await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(1200);await shot('eye-alpha');
 assert.equal(await page.locator('.shell-header,.workspace-bar').count(),0);
 const surfaces=await page.locator('html,body,#root,.eva-shell').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor));assert.ok(surfaces.every(v=>v==='rgba(0, 0, 0, 0)'));
 await page.getByRole('button',{name:'Weather',exact:false}).first().click();await page.waitForTimeout(1600);await shot('loading-alpha');
 await page.locator('[data-assembly="ready"]').waitFor();await shot('weather-alpha');
 const before=await page.locator('.dither-link path').last().getAttribute('d');assert.ok(before.length>1000,'Connector contains dense matrix cells');
 await page.getByRole('button',{name:'Move weather card'}).focus();await page.keyboard.press('ArrowDown');await page.waitForTimeout(100);assert.notEqual(await page.locator('.dither-link path').last().getAttribute('d'),before);await shot('moved-alpha');
 await page.getByRole('button',{name:'Quiet mode'}).click();assert.equal(await page.locator('.dither-link').evaluate(e=>getComputedStyle(e).animationName),'none');
 for(const [width,height]of [[1960,530],[960,760],[600,760],[400,640]]){await page.setViewportSize({width,height});await page.waitForTimeout(400);await shot(`weather-${width}x${height}`);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok((await page.locator('.dither-link path').last().getAttribute('d')).length>100);}
 checks.push('Transparent root layers, no global header, dense attached matrix connectors, keyboard movement, quiet mode and four responsive widths passed');
 await page.getByRole('button',{name:'Dismiss'}).click();await page.getByRole('button',{name:'Open EVA'}).waitFor();assert.equal(await page.locator('.dither-link,canvas').count(),0);
 assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({status:'passed',surfaces,checks,errors},null,2));
 await page.close();await page.video().saveAs(join(output,'overlay-flow.webm'));console.log('Overlay transparency, connectors, motion and layout checks passed.');
}catch(e){await writeFile(join(output,'failure.json'),JSON.stringify({message:e.message,checks,errors},null,2));throw e;}finally{await context.close();await browser.close();}
