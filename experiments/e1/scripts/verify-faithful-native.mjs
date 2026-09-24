import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const [fixturePid,stateFile,nativePid,output]=process.argv.slice(2),out=resolve(output);mkdirSync(out);
const {chromium}=await import(pathToFileURL(resolve(process.env.E1_PLAYWRIGHT_MODULE)).href);
const browser=await chromium.connectOverCDP('http://127.0.0.1:9223');
const main=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url()==='http://127.0.0.1:1431/');
if(!main)throw Error('Native main WebView missing');
const result={kind:'actual native Rust/wgpu over owned synthetic backdrop; no mic/provider calls',checks:[],errors:[]};
main.on('pageerror',e=>result.errors.push(e.message));
const probe=args=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-File',resolve('experiments/e1/scripts/desktop-probe.ps1'),'-FixtureProcessId',fixturePid,'-StatePath',stateFile,'-E1ProcessId',nativePid,...args],{encoding:'utf8',windowsHide:true}));
const fixture=()=>JSON.parse(readFileSync(stateFile,'utf8'));
const check=(name,value)=>{assert.ok(value,name);result.checks.push(name);};
const capture=(name,mode='light')=>probe(['-Action','Capture','-FixtureMode',mode,'-ScreenshotPath',resolve(out,name+'.png')]);
const click=async name=>{const r=await main.getByRole('button',{name,exact:true}).boundingBox();assert.ok(r);return probe(['-Action','Click','-X',String(Math.round(r.x+r.width/2)),'-Y',String(Math.round(r.y+r.height/2))]);};
const state=()=>main.evaluate(()=>window.__E1_WEAVE_TEST__.getSnapshot());
const stats=()=>main.evaluate(()=>window.__E1_WEAVE_TEST__.nativeStats());
const settle=()=>main.waitForFunction(()=>window.__E1_WEAVE_TEST__.getSnapshot().transition.status!=='active',null,{timeout:18000});
try{
 await main.waitForFunction(()=>window.__E1_WEAVE_TEST__?.nativeStats()?.renderer==='wgpu',null,{timeout:15000});
 result.geometry=await main.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,userAgent:navigator.userAgent}));
 check('actual native GPU reports wgpu',(await stats()).renderer==='wgpu');check('controlled physical coordinates',result.geometry.dpr===1&&result.geometry.width===fixture().client.width);
 probe(['-Action','Capture','-PrepareFixture']);await main.waitForTimeout(500);capture('idle');
 let clicks=fixture().clickCount;result.eyeProbe=probe(['-Action','Click','-X','1280','-Y','668']);check('GPU eye is OS click-through',fixture().clickCount===clicks+1);
 result.controlsProbe=await click('Controls +');await main.getByRole('button',{name:'Mute answer',exact:true}).waitFor({state:'visible',timeout:4000});
 await click('Mute answer');check('audio muted before all weather requests',await main.evaluate(()=>!window.__E1_WEAVE_TEST__.voice().getState().audioEnabled));
 await click('Today in NYC');await click('Controls −');check('facts arrive immediately',(await state()).forecast.temperatureC===22);await settle();capture('sunny');
 clicks=fixture().clickCount;probe(['-Action','Click','-X','1280','-Y','430']);check('GPU weather is OS click-through',fixture().clickCount===clicks+1);
 await click('Controls +');await click('Pin');const pin=(await state()).anchors['12:00'];await click('Tomorrow');await click('Controls −');await settle();assert.deepEqual((await state()).anchors['12:00'],pin);
 check('native tomorrow retains NYC and pin',(await state()).forecast.date==='2026-10-15');capture('rainy');capture('rainy-dark','dark');capture('rainy-busy','busy-neutral');
 await click('Controls +');await click('Plain answer');await main.waitForTimeout(150);capture('plain');await click('Dismiss weather');await click('Controls −');await main.waitForTimeout(10600);capture('returned-eye');
 check('weather dismissal retains native presence',(await state()).status==='dismissed'&&(await stats()).renderer==='wgpu');
 clicks=fixture().clickCount;probe(['-Action','Click','-X','1820','-Y','380']);check('former weather region is OS click-through',fixture().clickCount===clicks+1);
 check('microphone remained off',await main.evaluate(()=>!window.__E1_WEAVE_TEST__.voice().getState().enabled));check('no native page errors',result.errors.length===0);result.completed=true;
}catch(error){result.failure=String(error);process.exitCode=1;try{capture('failure');}catch{}}
finally{writeFileSync(resolve(out,'checks.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();}
