import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
import {makeIdealizedFixture,expectedIdealizedBinding} from './idealized-fixtures.mjs';
import {sealIdealized,validateIdealizedResult} from './idealized-result.mjs';
import {terminateProcessTree} from './broker.mjs';
import {runIdealization,readIdealizedCandidate,deriveIdealizedCorrection} from './idealized-adapter.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const python=resolve('.local/reconstruction/venv/Scripts/python.exe');
const options={python,terminate:terminateProcessTree};
function packet(){
  const fixture=makeIdealizedFixture();
  return {...Object.fromEntries(['job_id','candidate_id','bindings','frame','boundary','openings','inventory','parent_revision'].map(k=>[k,fixture[k]])),
    shell_color_srgb:[.52,.50,.46]};
}
async function setup(t){
  const directory=await mkdtemp(join(tmpdir(),'eva-idealized-adapter-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return join(directory,'candidate');
}

test('host correction uses the existing Python semantics before assembly and retains rejected requests',async t=>{
  const outputPath=await setup(t),inventory=packet().inventory,before=structuredClone(inventory);
  const corrected=await deriveIdealizedCorrection(inventory,{action:'set',object_id:inventory[0].id,changes:{color_srgb:[0,0,0]}},
    {...options,outputPath});
  assert.deepEqual(inventory,before);
  assert.deepEqual(corrected[0].color_srgb,[0,0,0]);
  assert.equal(corrected[0].design_priors.color_origin,'owner');
  assert.deepEqual(corrected[0].observation_ids,before[0].observation_ids);
  assert.ok(corrected[0].review_reasons.includes('edited-inventory'));
  const saved=await readFile(outputPath);
  await assert.rejects(deriveIdealizedCorrection(inventory,{action:'omit',object_id:inventory[0].id},{...options,outputPath}));
  assert.deepEqual(await readFile(outputPath),saved);
  await assert.rejects(deriveIdealizedCorrection(inventory,{action:'set',object_id:inventory[0].id,changes:{ready:true}},
    {...options,outputPath:outputPath+'-invalid'}));
  assert.ok((await readFile(outputPath+'-invalid-request.json')).length>0);
  await assert.rejects(readFile(outputPath+'-invalid'),error=>error.code==='ENOENT');
});

test('actual CPU assembly and Python reopen preserve host inputs without readiness',async t=>{
  const outputDirectory=await setup(t),input=packet(),before=structuredClone(input);
  const value=await runIdealization(input,{...options,outputDirectory,inputSha256:hash(JSON.stringify(input))});
  assert.deepEqual(input,before);
  assert.deepEqual(value.inventory,input.inventory);
  assert.equal(value.mode,'idealized');
  assert.equal(value.ready,undefined);
  const reopened=await readIdealizedCandidate(outputDirectory,expectedIdealizedBinding(value),options);
  assert.deepEqual(reopened,value);
  assert.deepEqual((await readdir(outputDirectory)).sort(),['candidate.json','manifest.json']);
  await assert.rejects(runIdealization(input,{...options,outputDirectory,inputSha256:hash(JSON.stringify(input))}));
  assert.deepEqual(await readIdealizedCandidate(outputDirectory,expectedIdealizedBinding(value),options),value);
});

test('reopen with a trailing separator keeps verification requests outside frozen evidence',async t=>{
  const outputDirectory=await setup(t),input=packet();
  const value=await runIdealization(input,{...options,outputDirectory,inputSha256:hash(JSON.stringify(input))});
  let inspected=false;
  const launch=(python,args,opts)=>{
    const requestPath=args[args.indexOf('--input')+1];
    assert.equal(resolve(requestPath,'..'),resolve(outputDirectory,'..'));
    inspected=true;return spawn(python,args,opts);
  };
  assert.deepEqual(await readIdealizedCandidate(outputDirectory+'/',expectedIdealizedBinding(value),{...options,launch}),value);
  assert.equal(inspected,true);
  assert.deepEqual((await readdir(outputDirectory)).sort(),['candidate.json','manifest.json']);
});

test('Python admission waits for stdout close rather than process exit',async t=>{
  const outputDirectory=await setup(t),input=packet();
  const value=await runIdealization(input,{...options,outputDirectory,inputSha256:hash(JSON.stringify(input))});
  const launch=()=>{
    const child=new EventEmitter();child.stdout=new PassThrough();
    setImmediate(()=>{
      child.emit('exit',0);
      child.stdout.end(JSON.stringify({status:'needs-review',revision:value.revision,objects:1}));
      child.emit('close',0);
    });
    return child;
  };
  assert.deepEqual(await readIdealizedCandidate(outputDirectory,expectedIdealizedBinding(value),{...options,launch}),value);
});

test('deadline stops the owned process and keeps its request without admitting output',async t=>{
  const outputDirectory=await setup(t),input=packet();
  const launch=(_python,_args,opts)=>spawn(process.execPath,['-e','setInterval(()=>{},1000)'],opts);
  await assert.rejects(runIdealization(input,{...options,launch,timeoutMs:100,
    outputDirectory,inputSha256:hash(JSON.stringify(input))}),/failed, timed out or was cancelled/);
  assert.deepEqual(JSON.parse(await readFile(outputDirectory+'-request.json')),input);
  await assert.rejects(readFile(join(outputDirectory,'candidate.json')),error=>error.code==='ENOENT');
});

test('reopen rejects resealed template forgery even when Node structural admission passes',async t=>{
  const outputDirectory=await setup(t),input=packet();
  const value=await runIdealization(input,{...options,outputDirectory,inputSha256:hash(JSON.stringify(input))});
  value.geometry.positions[0]-=.1;
  sealIdealized(value);
  const expected=expectedIdealizedBinding(value);
  assert.equal(validateIdealizedResult(value,expected),value);
  const bytes=JSON.stringify(value);
  await writeFile(join(outputDirectory,'candidate.json'),bytes);
  await writeFile(join(outputDirectory,'manifest.json'),JSON.stringify({version:1,revision:value.revision,candidate_sha256:hash(bytes)}));
  await assert.rejects(readIdealizedCandidate(outputDirectory,expected,options));
  assert.equal(await readFile(join(outputDirectory,'candidate.json'),'utf8'),bytes);
});

test('stale expected bindings and pre-cancelled work reject without replacing evidence',async t=>{
  const outputDirectory=await setup(t),input=packet(),inputSha256=hash(JSON.stringify(input));
  await assert.rejects(runIdealization(input,{...options,outputDirectory,inputSha256:'0'.repeat(64)}));
  assert.deepEqual(await readdir(resolve(outputDirectory,'..')),[]);
  const abort=new AbortController();abort.abort();
  await assert.rejects(runIdealization(input,{...options,outputDirectory,inputSha256,signal:abort.signal}));
  assert.deepEqual(await readdir(resolve(outputDirectory,'..')),[]);
  const value=await runIdealization(input,{...options,outputDirectory,inputSha256});
  const before=await readFile(join(outputDirectory,'candidate.json'));
  const stale=expectedIdealizedBinding(value);stale.parent_revision='a'.repeat(64);
  await assert.rejects(readIdealizedCandidate(outputDirectory,stale,options));
  assert.deepEqual(await readFile(join(outputDirectory,'candidate.json')),before);
});
