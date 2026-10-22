/**
 * Actual saved deployed-worker result, copied into an isolated TEST ownership
 * context. No GPU replay and no claim of original-session recovery.
 * The automated boundary confirmation below is a synthetic test decision.
 */
import {chromium} from 'playwright';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const output=process.argv[2];if(!output)throw Error('New evidence directory required.');
await mkdir(output,{recursive:false});
const source=resolve('.local/room-workflow/4f2d3dfb-59c5-4c66-9b13-0c21120ccb81.json');
const bytes=await readFile(source),original=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(original.status,'review-boundary');assert.equal(original.result.model_execution,'executed');
const resultHash=sha(JSON.stringify(original.result)),sourceHash=sha(bytes);
const directory=await mkdtemp(join(tmpdir(),'eva-live-upload-test-'));
const previous={cloud:process.env.EVA_ROOM_PYTHON,local:process.env.EVA_ROOM_COMPLETION_PYTHON,shado:process.env.EVA_SHADO_ORIGIN};
delete process.env.EVA_ROOM_PYTHON;delete process.env.EVA_SHADO_ORIGIN;
process.env.EVA_ROOM_COMPLETION_PYTHON=resolve('.local/reconstruction/venv/Scripts/python.exe');
let broker,server,browser;
const checks=[],errors=[],apiWrites=[];
try {
  const hosts=new Set();broker=await createBroker({directory,allowedHosts:hosts,
    runner:async()=>{throw Error('GPU calls forbidden in this evidence harness.');},
    shadoFetch:async()=>{throw Error('Shado calls forbidden in this evidence harness.');}});
  server=broker.server;await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const host=`127.0.0.1:${server.address().port}`;hosts.add(host);const origin=`http://${host}`;
  const sessionResponse=await fetch(origin+'/api/room-workflow/session');
  const cookie=sessionResponse.headers.get('set-cookie').split(';')[0];
  const sessions=JSON.parse(await readFile(join(directory,'sessions.json'),'utf8'));
  const record=structuredClone(original);record.owner=sessions[0][1].owner;
  record.message='ISOLATED TEST OWNER: actual saved VGGT result reused without another model run. Boundary confirmation in this exercise is an automation test, not owner acceptance.';
  const path=join(directory,record.id+'.json');await writeFile(path,JSON.stringify(record));
  assert.equal(sha(JSON.stringify(record.result)),resultHash);
  assert.equal(sha(JSON.stringify(record.images)),sha(JSON.stringify(original.images)));
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  await context.addCookies([{name:'eva_room',value:cookie.split('=')[1],domain:'127.0.0.1',path:'/api/room-workflow',httpOnly:true,sameSite:'Strict'}]);
  await context.route('**/api/room-workflow/**',async route=>{
    const request=route.request(),target=new URL(request.url());
    if(request.method()!=='GET')apiWrites.push(target.pathname);
    assert.ok(!/\/(?:analyze|compare|shado|grant|authorize)$/.test(target.pathname),'No model/generation request allowed');
    const result=await route.fetch({url:origin+target.pathname+target.search,timeout:190000});
    await route.fulfill({response:result});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:1440/?scene=upload-room');
  await page.getByRole('button',{name:/Reopen room/}).click();
  await page.getByRole('status').filter({hasText:'ISOLATED TEST OWNER'}).waitFor();
  await page.getByRole('button',{name:'Load estimated outline'}).click();
  await page.getByRole('group',{name:'Editable room outline'}).waitFor();
  await page.locator('canvas').waitFor();
  await page.screenshot({path:join(output,'test-owner-actual-boundary-review.png'),fullPage:true});
  await page.locator('canvas').screenshot({path:join(output,'actual-upload-raw-surfaces.png')});
  await page.getByRole('button',{name:'Points',exact:true}).click();
  await page.locator('canvas').screenshot({path:join(output,'actual-upload-raw-points.png')});
  checks.push('Actual saved deployed result and original inputs preserved byte-for-byte at JSON-value level in isolated ownership copy');
  checks.push('Boundary review plus actual raw surface and point representations render without another model run');
  const corner=page.getByRole('button',{name:'Room corner 1. Use arrow keys to adjust.'});
  await corner.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');
  assert.equal(await corner.evaluate(e=>e===document.activeElement),true);
  await page.getByRole('checkbox',{name:'I have checked that this boundary contains only my selected room.'}).check();
  await page.getByRole('button',{name:'Confirm room boundary'}).click();
  await page.getByRole('button',{name:'Complete photo-based room locally'}).waitFor();
  checks.push('Keyboard boundary adjustment and explicit test-only confirmation reach local completion eligibility');
  await page.getByRole('button',{name:'Complete photo-based room locally'}).click();
  // Wait for a positive terminal success control; a merely non-running or
  // unexpected response is never accepted as completion.
  await page.getByRole('button',{name:'Inspect completed photo-based room'}).waitFor({timeout:190000});
  await broker.wait();
  const completed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(completed.localCompletionStatus,'complete');assert.equal(completed.status,'awaiting-shado');
  assert.equal(completed.localCompletion.diagnostics.new_model_execution,false);
  assert.equal(sha(JSON.stringify(completed.result)),resultHash);
  await page.getByRole('button',{name:'Inspect completed photo-based room'}).click();
  await page.getByText('Local CPU completion of the photo-based estimate.',{exact:false}).waitFor();
  await page.locator('canvas').screenshot({path:join(output,'actual-upload-test-boundary-completed-surfaces.png')});
  await page.getByRole('button',{name:'Points',exact:true}).click();
  await page.locator('canvas').screenshot({path:join(output,'actual-upload-test-boundary-completed-points.png')});
  await page.getByRole('button',{name:'Provenance',exact:true}).click();
  await page.screenshot({path:join(output,'actual-upload-test-boundary-provenance.png'),fullPage:true});
  checks.push('Real broker and Python CPU completion finish and admit the matching artifact; Shado remains pending with no fabricated B');
  await page.locator('canvas').focus();await page.keyboard.press('w');await page.keyboard.press('Home');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Points',exact:true}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:join(output,'phone-actual-completion-test-owner.png'),fullPage:true});
  checks.push('Completed candidate keyboard navigation and reduced-motion phone layout remain usable');
  assert.equal(sha(await readFile(source)),sourceHash,'Original owner job file must remain untouched');
  assert.deepEqual(errors,[]);
  assert.deepEqual(apiWrites,[`/api/room-workflow/jobs/${record.id}/boundary`,`/api/room-workflow/jobs/${record.id}/complete-local`]);
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'passed',checks,errors,apiWrites,
    source_job_id:original.id,source_job_file_sha256:sourceHash,result_value_sha256:resultHash,
    actual_model_elapsed_seconds:original.result.elapsed_seconds,analysis_geometry_sha256:original.result.analysis_geometry_sha256,
    completion_geometry_sha256:completed.localCompletion.candidate_geometry_sha256,completion_triangles:completed.localCompletion.geometry.indices.length/3,
    cpu_elapsed_seconds:completed.localCompletion.diagnostics.elapsed_seconds,
    limits:'Fresh isolated TEST owner/session; this is not original-session recovery. Actual saved ML result reused unchanged. Boundary confirmation is a synthetic automation decision, not owner acceptance. CPU completion executed for real; no new GPU/model, Shado, or provider call. Main broker and original job unchanged.'},null,2));
} catch(error) {
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'failed',checks,errors,error:String(error.message),apiWrites,
    source_job_id:original.id,source_job_file_sha256:sourceHash,
    limits:'Isolated TEST ownership and synthetic boundary decision. Actual saved ML result and real CPU adapter; no GPU replay or Shado call. Captures are retained from the failed verification.'},null,2));
  throw error;
} finally {
  await browser?.close();if(broker)await broker.wait();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  await rm(directory,{recursive:true,force:true});
  for(const [key,value] of [['EVA_ROOM_PYTHON',previous.cloud],['EVA_ROOM_COMPLETION_PYTHON',previous.local],['EVA_SHADO_ORIGIN',previous.shado]])if(value===undefined)delete process.env[key];else process.env[key]=value;
}
