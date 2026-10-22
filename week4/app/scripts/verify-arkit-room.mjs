/** Real saved ML artifact; no mocked worker, no model calls. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const output=process.argv[2];if(!output)throw Error('Fresh evidence directory required.');
await mkdir(output,{recursive:false});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const checks=[],errors=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:1440/?scene=arkitscenes-room');
  await page.getByText('ML execution complete',{exact:true}).waitFor();
  const canvas=page.locator('canvas');
  const completion=await page.getByRole('button',{name:'Provisional completion',exact:true}).count();
  if(completion) {
    for(const [label,name] of [['Provisional completion','completed'],['Fused surfaces','fused']]) {
      await page.getByRole('button',{name:label,exact:true}).click();
      for(const source of [2,5]) {
        await page.getByRole('combobox',{name:'Viewpoint'}).selectOption(String(source));
        await page.getByRole('button',{name:'Points',exact:true}).click();
        await canvas.screenshot({path:join(output,`actual-${name}-points-view${source+1}.png`)});
      }
    }
    await page.getByRole('button',{name:'Provisional completion',exact:true}).click();
    await page.getByRole('combobox',{name:'Viewpoint'}).selectOption('0');
    await page.getByRole('button',{name:'Surfaces',exact:true}).click();
    await canvas.screenshot({path:join(output,'actual-completion-interior.png')});
    await page.getByRole('button',{name:'Points',exact:true}).click();
    await canvas.screenshot({path:join(output,'actual-completion-points.png')});
    await page.getByRole('button',{name:'Provenance',exact:true}).click();
    await canvas.screenshot({path:join(output,'actual-completion-provenance.png')});
    await page.getByRole('combobox',{name:'Viewpoint'}).selectOption('2');
    await canvas.screenshot({path:join(output,'actual-completion-view3.png')});
    await page.getByRole('button',{name:'Fused surfaces',exact:true}).click();
    await canvas.screenshot({path:join(output,'actual-fused-interior.png')});
    checks.push('source-bound CPU fusion and provisional enclosure render from transformed source cameras');
    await page.getByRole('button',{name:'Raw ML estimate',exact:true}).click();
    await page.getByRole('combobox',{name:'Viewpoint'}).selectOption('-1');
  }
  await canvas.waitFor();await canvas.screenshot({path:join(output,'actual-raw-surfaces.png')});
  assert.equal(await page.getByRole('img').count(),7);
  await page.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth>0));
  checks.push('real validated VGGT geometry and seven source images loaded');
  await page.getByRole('button',{name:'Points',exact:true}).click();
  await canvas.screenshot({path:join(output,'actual-raw-points.png')});
  await canvas.focus();await page.keyboard.press('Home');
  const homePixels=await canvas.screenshot();
  await page.keyboard.press('ArrowLeft');
  assert.notDeepEqual(await canvas.screenshot(),homePixels,'Orbit must visibly change the view');
  await page.keyboard.press('Home');
  assert.deepEqual(await canvas.screenshot(),homePixels,'Home must restore the selected camera');
  await page.keyboard.press('+');
  assert.notDeepEqual(await canvas.screenshot(),homePixels,'Zoom must visibly change the view');
  await page.keyboard.press('Home');
  await page.keyboard.press('w');
  assert.notDeepEqual(await canvas.screenshot(),homePixels,'Forward movement must visibly change the view');
  await page.keyboard.press('d');await page.keyboard.press('Home');
  assert.deepEqual(await canvas.screenshot(),homePixels,'Home must restore after translation');
  assert.equal(await canvas.evaluate(e=>e===document.activeElement),true);
  checks.push('keyboard focus, orbit, zoom and reset');
  let lastPixels=homePixels;
  for(const mode of ['Edges','Provenance','Surfaces']){
    await page.getByRole('button',{name:mode,exact:true}).click();
    const pixels=await canvas.screenshot();
    assert.notDeepEqual(pixels,lastPixels,`${mode} must visibly change representation`);
    lastPixels=pixels;
  }
  checks.push('four actual geometry representations switch');
  await page.screenshot({path:join(output,'desktop.png'),fullPage:true});
  await canvas.evaluate(e=>(e.getContext('webgl2')??e.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext());
  await page.getByRole('alert').filter({hasText:'Graphics interrupted'}).waitFor();
  await page.getByRole('button',{name:'Reopen viewer'}).click();
  await page.waitForFunction(()=>!document.querySelector('[role=alert]'));
  await page.locator('canvas').screenshot({path:join(output,'recovered.png')});
  checks.push('real WebGL context loss and explicit reopen recovery');
  const phone=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto('http://127.0.0.1:1440/?scene=arkitscenes-room');
  await phone.getByText('ML execution complete',{exact:true}).waitFor();
  await phone.getByRole('button',{name:'Points',exact:true}).tap();
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await phone.screenshot({path:join(output,'phone-points.png'),fullPage:true});
  checks.push('touch representation control, reduced-motion view and phone layout without overflow');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'passed',checks,errors,
    source:'Actual saved ARKitScenes 42445021 seven-photo VGGT analysis, validated against frozen request.',
    limits:'Headless Edge; touch emulation. This verifies rendering and interaction, not geometric accuracy or physical phone behavior.'},null,2));
} finally {await browser.close();}
