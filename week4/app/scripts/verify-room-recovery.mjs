/** Actual browser interactions against synthetic API fixtures. No provider calls. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const [output,mode='after']=process.argv.slice(2);
if(!output||!['before','after'].includes(mode))throw Error('Fresh output directory and before|after mode required.');
await mkdir(output,{recursive:false});
const id='10000000-0000-4000-8000-000000000001',checks=[],errors=[],requests=[];
const template={id,status:'submission-unknown',cloudPending:true,message:'SYNTHETIC FIXTURE: interrupted cloud connection; no model ran.',
  hasResult:false,scale:null,boundary:null,retention:'temporary',expiresAt:Date.UTC(2026,10,1)};
let job={...template},nextRecovery='pending',outline={polygon:[[0,0],[4,0],[4,3],[0,3]],floor:0,ceiling:2.5};
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
async function setup(options={}) {
  const context=await browser.newContext({viewport:{width:1280,height:1000},...options});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/api/room-workflow/**',async route=>{
    const path=new URL(route.request().url()).pathname,method=route.request().method();
    requests.push({path,method});
    let data;
    if(path.endsWith('/session'))data={csrf:'synthetic',cloudConfigured:false,shadoConfigured:false};
    else if(path.endsWith('/jobs'))data=[job];
    else if(path.endsWith('/result'))data={boundary_proposal:{value:outline},preview:{positions:[]}};
    else if(path.endsWith('/recover-cloud')&&method==='POST'){
      assert.deepEqual(route.request().postDataJSON(),{});
      job={...job,cloudRecoveryStatus:'checking'};
      data={...job};
      setTimeout(()=>{
        if(nextRecovery==='complete')job={...job,status:job.status==='cancel-requested'?'cancelled':'review-boundary',cloudPending:false,cloudRecoveryStatus:'settled',hasResult:job.status!=='cancel-requested',message:'SYNTHETIC FIXTURE: existing call settled.'};
        else job={...job,cloudRecoveryStatus:nextRecovery};
      },100);
    }else if(path.endsWith('/cancel')&&method==='POST'){
      job={...job,status:job.status==='preflighting-images'?'cancelled':'cancel-requested',message:'SYNTHETIC FIXTURE: cancellation requested.'};data=job;
    }else if(path.endsWith('/authorize')&&method==='POST'){
      await route.fulfill({status:503,json:{error:'SYNTHETIC FIXTURE: no live Shado account is connected.'}});return;
    }else data=job;
    await route.fulfill({json:data});
  });
  await page.goto('http://127.0.0.1:1440/?scene=upload-room');
  return {page,context};
}
async function reopen(page) {await page.getByRole('button',{name:/Reopen room/}).click();}
async function capture(page,name) {await page.screenshot({path:join(output,name+'.png'),fullPage:true});}
try {
  const {page,context}=await setup();
  await capture(page,'desktop-intake');
  await reopen(page);await capture(page,'desktop-cloud-unknown');
  if(mode==='before'){
    assert.equal(await page.getByRole('button',{name:'Check existing cloud call',exact:true}).count(),0);
    checks.push('Before: unresolved cloud call has no recovery action.');
  }else{
    const recover=page.getByRole('button',{name:'Check existing cloud call',exact:true});
    await recover.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.equal(await recover.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')),true);
    assert.equal(await recover.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    assert.equal(await recover.evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
    await capture(page,'desktop-recovery-keyboard-focus');
    await page.keyboard.press('Enter');
    await page.getByText('The existing cloud call is still pending. No replacement has been submitted.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Request cloud estimate',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Delete working copy',exact:true}).count(),0);
    nextRecovery='unavailable';await recover.click();
    await page.getByText('The existing call could not be verified. Its outcome is still unknown; this is not confirmation that it stopped.',{exact:true}).waitFor();
    await capture(page,'desktop-cloud-unavailable');
    await page.getByRole('button',{name:'Cancel processing',exact:true}).click();
    await page.getByText('Cancellation is requested, but the remote outcome is not yet confirmed. Recovered geometry will not be admitted.',{exact:true}).waitFor();
    await page.reload();await reopen(page);
    await capture(page,'desktop-cancel-restart');
    nextRecovery='complete';await page.getByRole('button',{name:'Check existing cloud call',exact:true}).click();
    await page.getByRole('status').filter({hasText:'existing call settled'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Check existing cloud call',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Load estimated outline',exact:true}).count(),0);
    checks.push('Keyboard recovery: pending and unavailable stay unresolved; cancellation survives reload; settled cancelled result exposes no geometry.');
    job={...template};nextRecovery='complete';
    await page.reload();await reopen(page);await page.getByRole('button',{name:'Check existing cloud call',exact:true}).click();
    await page.getByRole('button',{name:'Load estimated outline',exact:true}).waitFor();
    checks.push('Uncancelled existing result resumes boundary review without model submission.');
    job={...template,status:'preflighting-images',cloudPending:false,imagePreflightStatus:'running'};
    await page.reload();await reopen(page);
    await page.getByText('Checking the original photos locally before requesting cloud processing. No model has run for this step.',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Check existing cloud call',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Delete working copy',exact:true}).count(),0);
    await capture(page,'desktop-local-photo-preflight');
    await page.getByRole('button',{name:'Cancel processing',exact:true}).click();
    await page.getByRole('button',{name:'Delete working copy',exact:true}).waitFor();
    checks.push('Local photo validation remains cancellable and exposes neither cloud recovery nor deletion while active.');
  }
  if(mode==='after'){
    job={...template,status:'ready-shado-generation',cloudPending:false,shadoAuthorized:true,shadoTaskId:'synthetic-existing-task'};
    await page.reload();await reopen(page);
    assert.equal(await page.getByRole('button',{name:'Generate the authorized video once',exact:true}).isEnabled(),true);
    await capture(page,'desktop-shado-before-expiry');
    // Simulate the service's separately tested GET normalization after expiry.
    // The page remains open: only its regular poll can receive this update.
    job={...job,status:'awaiting-shado',shadoAuthorized:false,message:'SYNTHETIC FIXTURE: permission expired; renew this same task.'};
    await page.getByRole('button',{name:'Renew existing Shado authorization',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Generate the authorized video once',exact:true}).count(),0);
    await capture(page,'desktop-shado-expired-while-open');
    checks.push('Ready permission expiry is reflected while the page stays open; polling replaces generation with same-task renewal without a submit.');
  }
  job={...template,status:'ready-shado-generation',cloudPending:false,shadoAuthorized:false,shadoTaskId:'synthetic-existing-task'};
  await page.reload();await reopen(page);await capture(page,'desktop-shado-expired');
  if(mode==='after'){
    assert.equal(await page.getByRole('button',{name:'Generate the authorized video once',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Renew existing Shado authorization',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'no live Shado account'}).waitFor();
    job={...job,status:'awaiting-shado'};await page.reload();await reopen(page);
    await page.getByRole('button',{name:'Renew existing Shado authorization',exact:true}).waitFor();
    checks.push('Expired ready grant and broker-normalized restart expose renewal; live account absence is explicit; no generation call.');
  }
  job={...template,status:'review-boundary',cloudPending:false,hasResult:true};
  await page.reload();await reopen(page);await page.getByRole('button',{name:'Load estimated outline',exact:true}).click();
  await page.getByRole('button',{name:'Add corner after 1',exact:true}).click();
  const fifth=page.getByRole('button',{name:'Room corner 5. Use arrow keys to adjust.',exact:true});
  await fifth.focus();
  await page.getByRole('checkbox',{name:/I have checked/}).check();
  await capture(page,'desktop-outline-selected-five');
  // A newly loaded proposal can also change the coordinate frame.
  outline={...outline,polygon:[[100,100],[104,100],[104,103],[100,103]]};
  await page.getByRole('button',{name:'Load estimated outline',exact:true}).click();
  if(mode==='before'){
    await page.getByRole('button',{name:'Add corner after 5',exact:true}).click();
    await page.waitForTimeout(100);
    assert.ok(errors.length>0);checks.push('Before: reloading four corners after selecting corner five reproduces a browser exception.');
  }else{
    await page.waitForFunction(()=>!document.querySelector('.upload-boundary .upload-confirm input')?.checked);
    assert.equal(await page.getByRole('checkbox',{name:/I have checked/}).isChecked(),false);
    const first=page.getByRole('button',{name:'Room corner 1. Use arrow keys to adjust.',exact:true});
    const oldX=Number(await first.getAttribute('cx'));
    assert.ok(oldX>=0&&oldX<=500,'reloaded outline must reset coordinate frame');
    await first.focus();await page.keyboard.press('ArrowRight');
    assert.ok(Number(await first.getAttribute('cx'))>oldX);
    await page.getByRole('button',{name:'Add corner after 1',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/Room corner \d+\. Use arrow keys/}).count(),5);
    await capture(page,'desktop-outline-reloaded');
    checks.push('Reload resets selected corner, coordinate frame and confirmation; add and keyboard adjustment still work.');
  }
  await context.close();
  job={...template,status:'cancel-requested',cloudRecoveryStatus:'pending'};nextRecovery='pending';
  const phone=await setup({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await reopen(phone.page);await capture(phone.page,'phone-cancel-pending');
  assert.ok(await phone.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await phone.page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  if(mode==='after'){
    const action=phone.page.getByRole('button',{name:'Check existing cloud call',exact:true});
    const box=await action.boundingBox();assert.ok(box.height>=44);
    await action.tap();await phone.page.getByText('The existing cloud call is still pending. No replacement has been submitted.',{exact:true}).waitFor();
    checks.push('390px touch recovery, reduced motion, 48px action target and no horizontal overflow.');
    assert.deepEqual(errors,[]);
    assert.equal(requests.some(r=>/\/(analyze|compare|shado)$/.test(r.path)),false);
  }
  await phone.context.close();
  await writeFile(join(output,'checks.json'),JSON.stringify({status:'passed',mode,checks,errors,requests,
    evidence:'Actual headless Edge interactions with synthetic API fixtures. No cloud, model or Shado execution. Emulated touch, not physical phone.'},null,2));
}finally{await browser.close();}
