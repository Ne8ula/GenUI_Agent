/** Inspect actual local saved-room UI. No provider or generation requests. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const [phase,output]=process.argv.slice(2);
if(!['before','after'].includes(phase)||!output)throw Error('Usage: before|after fresh-evidence-directory');
await mkdir(output,{recursive:false});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const errors=[],checks=[],requests=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1,reducedMotion:'reduce',hasTouch:true});
  await context.route('**/api/room-workflow/**',async route=>{
    assert.equal(route.request().method(),'GET','No generation or mutation permitted');
    requests.push(new URL(route.request().url()).pathname);await route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/THREE|WebGL|shader/i.test(message.text()))errors.push(message.text());});
  await page.goto('http://127.0.0.1:1440/?scene=arkitscenes-room&profile=vga-visual-v1');
  await page.getByText('ML execution complete',{exact:true}).waitFor({timeout:120000});
  const canvas=page.locator('canvas');
  await canvas.waitFor();
  await canvas.screenshot({path:join(output,'desktop-default.png')});
  if(phase==='after'){
    const aesthetic=page.getByRole('button',{name:'Complete-object study',exact:true});
    assert.equal(await aesthetic.getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByRole('button',{name:'Points',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByText('Hollow dots mark inferred geometry',{exact:false}).first().waitFor();
    checks.push('Complete-object study defaults to points with persistent inferred label');
    if(await page.getByRole('button',{name:'Paris matrix',exact:true}).count()){
      const frame=()=>canvas.evaluate(async element=>{
        element.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
        const gl=element.getContext('webgl2'),bytes=new Uint8Array(element.width*element.height*4);
        gl.readPixels(0,0,element.width,element.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',');
      });
      const matrix=page.getByRole('button',{name:'Paris matrix',exact:true});
      assert.equal(await matrix.getAttribute('aria-pressed'),'true');
      const matrixFrame=await frame();
      await page.getByRole('button',{name:'Surfaces',exact:true}).click();const surfaces=await frame();
      await page.getByRole('button',{name:'Points',exact:true}).click();
      await page.getByRole('button',{name:'Uniform dots',exact:true}).click();
      assert.notEqual(await frame(),matrixFrame,'Matrix must visibly differ from uniform dots');
      await canvas.screenshot({path:join(output,'desktop-uniform-comparison.png')});
      await page.getByRole('button',{name:'Surfaces',exact:true}).click();
      assert.equal(await frame(),surfaces,'Point style must not alter solid rendering');
      await page.getByRole('button',{name:'Points',exact:true}).click();await matrix.focus();await page.keyboard.press('Enter');
      assert.equal(await frame(),matrixFrame,'Matrix restores deterministically without time-based flicker');
      checks.push('Paris matrix default, keyboard toggle, distinct pixels, unchanged solid view and deterministic restoration');
    }
    const viewpoint=page.getByRole('combobox',{name:'Study viewpoint'});
    for(const [index,label] of [['2','desk'],['3','cabinet']]){
      await viewpoint.selectOption(index);
      await canvas.screenshot({path:join(output,`desktop-${label}-points.png`)});
      await page.getByRole('button',{name:'Surfaces',exact:true}).click();
      await canvas.screenshot({path:join(output,`desktop-${label}-surfaces.png`)});
      await page.getByRole('button',{name:'Points',exact:true}).click();
    }
    await viewpoint.selectOption('0');
    checks.push('Desk and cabinet complete-object viewpoints inspected');
    await canvas.focus();await page.keyboard.press('ArrowRight');
    await canvas.screenshot({path:join(output,'desktop-keyboard-orbit.png')});
    await page.keyboard.press('Home');
    await page.getByRole('button',{name:'Surfaces',exact:true}).click();
    await canvas.screenshot({path:join(output,'desktop-surfaces.png')});
    await page.getByRole('button',{name:'Edges',exact:true}).click();
    await canvas.screenshot({path:join(output,'desktop-edges.png')});
    await page.getByRole('button',{name:'Provenance',exact:true}).click();
    await canvas.screenshot({path:join(output,'desktop-provenance.png')});
    await page.getByRole('button',{name:'Points',exact:true}).click();
    checks.push('Keyboard orbit, reset and all four representations exercised');
    await page.getByRole('button',{name:'Provisional completion',exact:true}).click();
    await canvas.screenshot({path:join(output,'desktop-retained-fusion.png')});
    await aesthetic.click();
    assert.equal(await page.getByRole('button',{name:'Points',exact:true}).getAttribute('aria-pressed'),'true');
    checks.push('Original fusion retained; aesthetic returns to points');
    await canvas.evaluate(element=>element.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    await page.getByRole('alert').filter({hasText:'Graphics interrupted'}).waitFor();
    await page.getByRole('button',{name:'Reopen viewer',exact:true}).click();
    assert.equal(await page.getByRole('alert').filter({hasText:'Graphics interrupted'}).count(),0);
    checks.push('Graphics interruption reports and viewer reopens');
    const pixels=await canvas.evaluate(element=>{
      element.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
      const gl=element.getContext('webgl2'),bytes=new Uint8Array(element.width*element.height*4);
      gl.readPixels(0,0,element.width,element.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      const colors=new Set();for(let i=0;i<bytes.length;i+=4)colors.add(`${bytes[i]},${bytes[i+1]},${bytes[i+2]}`);
      return colors.size;
    });
    assert.ok(pixels>20,'Rendered geometry must produce varied pixels');
    checks.push(`Actual WebGL frame contains ${pixels} distinct colors`);
  }
  await page.screenshot({path:join(output,'desktop-page.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No phone horizontal overflow');
  await canvas.screenshot({path:join(output,'phone-default.png')});
  if(phase==='after'){
    await canvas.scrollIntoViewIfNeeded();
    const box=await canvas.boundingBox(),cdp=await context.newCDPSession(page);
    const start={x:box.x+box.width*.5,y:box.y+box.height*.5};
    const before=await canvas.screenshot();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+50,y:start.y+15}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const after=await canvas.screenshot({path:join(output,'phone-touch-orbit.png')});
    assert.notDeepEqual(after,before,'Touch must move the scene');
    await cdp.detach();checks.push('Emulated phone touch orbit changes actual rendered scene');
  }
  await page.screenshot({path:join(output,'phone-page.png'),fullPage:true});
  checks.push('Phone width and reduced-motion state inspected');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'checks.json'),JSON.stringify({phase,checks,errors,requests,limits:'Actual saved public capture; authored aesthetic study, no ML completion or Shado generation.'},null,2));
  console.log(JSON.stringify({phase,checks,errors}));
}finally{await browser.close();}
