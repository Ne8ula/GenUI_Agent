/** Browser interaction test only. Invented contract fixture, no model execution. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {makeSyntheticAnalysis} from '../../../scripts/room_workflow/test-fixtures.mjs';
const output=process.argv[2];if(!output)throw Error('Fresh evidence directory required.');
await mkdir(output,{recursive:false});
const id='10000000-0000-4000-8000-000000000001',checks=[],errors=[];
const fixture=makeSyntheticAnalysis({job_id:id,images:Array.from({length:5},(_,i)=>({id:'photo-'+i,sha256:String(i).repeat(64)}))});
const geometry={positions:[0,0,0,2,0,0,2,2,0,0,2,0,0,0,2,2,0,2],colors:Array(18).fill(.6),
  indices:[0,1,2,0,2,3,0,4,5,0,5,1],provenance:Array(4).fill('photo-estimated')};
fixture.arms.A.geometry=geometry;fixture.arms.A.raw_geometry=geometry;
fixture.arms.B={...fixture.arms.A,geometry:{
  positions:[-3,-1,0,1,-1,0,1,2,0,-3,2,0,-3,2,3,1,2,3],
  colors:Array.from({length:18},(_,i)=>[.2,.5,.8][i%3]),
  indices:[0,1,2,0,2,3,3,2,5,3,5,4],
  provenance:['photo-estimated','generated-influenced','authored-room-shell','authored-window-cap'],
}};
let job={id,status:'review-boundary',message:'SYNTHETIC FIXTURE: no cloud or model ran.',hasResult:true,hasLocalCompletion:true,retention:'temporary',expiresAt:Date.now()+86400000,boundary:null};
const otherJob={...job,id:'10000000-0000-4000-8000-000000000002',hasLocalCompletion:false};
let deleted=false;
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
async function frame(canvas){
  return canvas.evaluate(async e=>{
    e.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
    const gl=e.getContext('webgl2'),bytes=new Uint8Array(e.width*e.height*4);
    gl.readPixels(0,0,e.width,e.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    const colors=new Set();for(let i=0;i<bytes.length&&colors.size<4;i+=4)colors.add(`${bytes[i]},${bytes[i+1]},${bytes[i+2]}`);
    if(colors.size<4)throw Error('Blank candidate framebuffer');
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',');
  });
}
try{
  const page=await browser.newPage({viewport:{width:1280,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
  await page.route('**/api/room-workflow/**',async route=>{
    const path=new URL(route.request().url()).pathname,method=route.request().method();
    assert.ok(method==='GET'||(method==='POST'&&path.endsWith('/boundary'))||
      (method==='DELETE'&&path.endsWith('/'+id)),'No model, upload or generation request allowed');
    let data;
    if(path.endsWith('/session'))data={csrf:'synthetic',cloudConfigured:false,shadoConfigured:false};
    else if(path.endsWith('/jobs'))data=deleted?[otherJob]:[job,otherJob];
    else if(method==='DELETE'){deleted=true;data={deleted:true};}
    else if(path.endsWith('/result'))data={...fixture,job_id:path.includes(otherJob.id)?otherJob.id:id};
    else if(path.endsWith('/completion'))data={artifact_type:'eva-room-local-completion-v1',geometry,raw_geometry:geometry,
      cameras:[{center:[1,-4,1],world_to_camera:[[1,0,0,-1],[0,0,-1,1],[0,1,0,4]]}]};
    else if(path.endsWith('/boundary')&&method==='POST'){
      const submitted=route.request().postDataJSON();
      assert.equal(submitted.confirmed,true);assert.equal(submitted.openings.length,1);
      assert.notEqual(submitted.boundary.polygon[0][0],0);checks.push('keyboard outline change and door closure reach submission');
      job={...job,boundary:submitted.boundary,status:'awaiting-shado',message:'SYNTHETIC FIXTURE: awaiting actual Shado authorization.'};data=job;
    }else data=path.includes(otherJob.id)?otherJob:job;
    await route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:1440/?scene=upload-room');
  await page.getByRole('button',{name:/Reopen room/}).first().click();
  await page.getByRole('button',{name:'Load estimated outline'}).click();
  const corner=page.getByRole('button',{name:'Room corner 1. Use arrow keys to adjust.'});
  await corner.focus();await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'Add door or window closure'}).click();
  const wall=page.getByRole('combobox',{name:/^Wall/});
  await wall.selectOption('2');
  await page.getByRole('button',{name:'Add corner after 1',exact:true}).click();
  await page.screenshot({path:join(output,'closure-after-insertion.png'),fullPage:true});
  assert.equal(await wall.inputValue(),'3','An untouched wall must keep its closure after insertion');
  await wall.selectOption('0');
  await page.getByRole('button',{name:'Add corner after 1',exact:true}).click();
  assert.equal(await wall.inputValue(),'-1','A split wall must require a new wall choice');
  assert.equal(await page.getByRole('button',{name:'Remove closure 1'}).count(),1,'Keep the closure draft');
  assert.equal(await page.getByLabel('Start (0–1)',{exact:true}).inputValue(),'0.35');
  await page.getByRole('checkbox',{name:/I have checked/}).check();
  assert.equal(await page.getByRole('button',{name:'Confirm room boundary'}).isDisabled(),true);
  await wall.selectOption('4');
  await page.getByRole('button',{name:'Remove selected corner',exact:true}).click();
  assert.equal(await wall.inputValue(),'3','An untouched wall must keep its closure after removal');
  await wall.selectOption('0');
  await page.getByRole('button',{name:'Remove selected corner',exact:true}).click();
  assert.equal(await wall.inputValue(),'-1','A merged wall must require a new wall choice');
  checks.push('corner insertion/removal remaps untouched walls and preserves affected closure drafts for review');
  await page.getByRole('button',{name:'Load estimated outline'}).click();
  await corner.focus();await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'Add door or window closure'}).click();
  await page.getByRole('checkbox',{name:/I have checked/}).check();
  await page.screenshot({path:join(output,'synthetic-boundary.png'),fullPage:true});
  await page.getByRole('button',{name:'Confirm room boundary'}).click();
  await page.getByRole('button',{name:'Authorize upload in Shado',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Request paired reconstruction',exact:true}).count(),0);
  checks.push('only upload authorization is offered; no generation request is submitted');
  await page.getByRole('button',{name:'Inspect available geometry'}).click();
  assert.equal(await page.getByRole('button',{name:'Points',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'Paris matrix',exact:true}).getAttribute('aria-pressed'),'true');
  const canvas=page.locator('.candidate-view canvas');await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('+');
  await page.screenshot({path:join(output,'synthetic-points.png'),fullPage:true});
  const matrix=await frame(canvas);
  await page.getByRole('button',{name:'Uniform dots',exact:true}).click();
  assert.notEqual(await frame(canvas),matrix);
  await page.getByRole('button',{name:'Paris matrix',exact:true}).focus();await page.keyboard.press('Enter');
  assert.equal(await frame(canvas),matrix);
  checks.push('arbitrary upload defaults to matrix; uniform toggle differs, keyboard toggle restores home framebuffer');
  for(const name of ['Edges','Provenance','Surfaces'])await page.getByRole('button',{name,exact:true}).click();
  await page.getByRole('button',{name:'Shado-assisted',exact:true}).click();
  await page.getByRole('button',{name:'Points',exact:true}).click();
  await page.screenshot({path:join(output,'synthetic-second-layout-matrix.png'),fullPage:true});
  assert.notEqual(await frame(canvas),matrix);
  await page.getByRole('button',{name:'Uniform dots',exact:true}).click();
  await page.screenshot({path:join(output,'synthetic-second-layout-uniform.png'),fullPage:true});
  checks.push('second unrelated layout, colors and mixed face provenance use same renderer without benchmark furniture');
  await page.getByRole('checkbox',{name:/Inspect raw estimate/}).check();
  checks.push('all representations, A/B and raw estimate toggles work with synthetic geometry');
  await page.getByRole('button',{name:'Inspect completed photo-based room',exact:true}).click();
  await page.getByRole('button',{name:'Surfaces',exact:true}).click();
  const initial=await canvas.screenshot();
  await canvas.press('w');await canvas.press('ArrowRight');
  const moved=await canvas.screenshot({path:join(output,'camera-before-toggle.png')});
  assert.notDeepEqual(moved,initial,'Navigation must change the view');
  await page.getByRole('checkbox',{name:/Inspect raw estimate/}).check();
  assert.deepEqual(await canvas.screenshot({path:join(output,'camera-after-toggle.png')}),moved,
    'Switching identical raw/completed geometry must preserve the navigated camera');
  await canvas.press('Home');assert.deepEqual(await canvas.screenshot(),initial,'Home must still reset the view');
  checks.push('raw/completed toggle preserves navigation, while Home resets explicitly');
  await page.getByRole('button',{name:'Delete working copy',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('[aria-label="Private working copies"] button').length===1);
  await page.getByRole('button',{name:/Reopen room/}).click();
  await page.getByRole('button',{name:'Load estimated outline'}).click();
  await page.screenshot({path:join(output,'reopened-room.png'),fullPage:true});
  assert.equal(await page.getByText(/Photo-based surfaces with assumed boundary closures/).count(),0,
    'A different room must not inherit the local-completion label');
  assert.equal(await page.getByRole('checkbox',{name:/Inspect raw estimate/}).isChecked(),false);
  assert.equal(await page.getByRole('button',{name:'Original photos',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByRole('button',{name:'Remove closure 1'}).count(),0);
  checks.push('delete/reopen clears the previous room’s local view, raw toggle, arm and closures');
  assert.deepEqual(errors,[]);
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'passed',checks,errors,
    input:'Invented API and triangle fixtures only. Screenshots are NOT room reconstruction or model evidence.',
    limitation:'Headless Edge; reduced motion. No Shado popup, GPU inference or actual A/B comparison.'},null,2));
}finally{await browser.close();}
