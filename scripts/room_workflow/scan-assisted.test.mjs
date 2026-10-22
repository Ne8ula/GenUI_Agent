import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {terminateProcessTree} from './broker.mjs';

const python=resolve('.local/reconstruction/venv/Scripts/python.exe');
const host=await import('./scan-assisted.mjs').catch(error=>error.code==='ERR_MODULE_NOT_FOUND'?null:Promise.reject(error));
async function fixture(t){
  assert.ok(host,'scan host verification is not implemented');
  const rootDirectory=await mkdtemp(join(tmpdir(),'eva-scan-host-'));
  t.after(()=>rm(rootDirectory,{recursive:true,force:true}));
  const directory=join(rootDirectory,'candidate');
  const result=spawnSync(python,['-I','-c',
    'import sys,json;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from test_scan_persistence import prepared,expected;from scan_room import write_scan_candidate;c,r=prepared();write_scan_candidate(Path(sys.argv[2]),c,r);print(json.dumps(expected(c,r)))',
    resolve('scripts/room_workflow'),directory],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);
  return {directory,expected:JSON.parse(result.stdout),options:{rootDirectory,python,terminate:terminateProcessTree}};
}

test('actual isolated Python replay returns only needs-review with resource evidence',async t=>{
  const {directory,expected,options}=await fixture(t);
  const value=await host.readScanCandidate(directory,expected,options);
  assert.equal(value.mode,'scan-assisted');assert.equal(value.ready,undefined);assert.equal(value.revision,expected.revision);
  const receipts=(await readdir(options.rootDirectory)).filter(name=>name.endsWith('.resources.json'));
  assert.equal(receipts.length,1);
  const receipt=JSON.parse(await readFile(join(options.rootDirectory,receipts[0])));
  assert.equal(receipt.status,'settled');assert.equal(receipt.outcome,'passed');
  assert.ok(receipt.peak_rss_bytes>0&&receipt.peak_rss_bytes<=768*1024**2);
  assert.ok(receipt.min_available_bytes>=2*1024**3);
  assert.ok(!(await readdir(options.rootDirectory)).includes('.scan-worker.lock'));
});

test('exact host bindings, unknown authority and missing manifest reject',async t=>{
  const {directory,expected,options}=await fixture(t);
  for(const key of Object.keys(expected)){
    await assert.rejects(host.readScanCandidate(directory,{...expected,[key]:'f'.repeat(64)},options),
      /CPU idealization failed/);
    assert.ok(!(await readdir(options.rootDirectory)).includes('.scan-worker.lock'));
  }
  await assert.rejects(host.readScanCandidate(directory,{...expected,ready:true},options),/exact scan host binding/);
  assert.equal((await host.readScanCandidate(directory,expected,options)).revision,expected.revision);
  await rm(join(directory,'manifest.json'));
  await assert.rejects(host.readScanCandidate(directory,expected,options),/ENOENT/);
});

test('outside root and junction paths reject without launching',async t=>{
  const {directory,expected,options}=await fixture(t);
  let launched=false;
  const launch=()=>{launched=true;throw Error('unexpected launch');};
  await assert.rejects(host.readScanCandidate(directory,expected,{...options,rootDirectory:join(directory,'unrelated'),launch}),/outside private root/);
  const link=join(options.rootDirectory,'linked');
  await symlink(directory,link,process.platform==='win32'?'junction':'dir');
  await assert.rejects(host.readScanCandidate(link,expected,{...options,launch}),/Linked scan path/);
  assert.equal(launched,false);
});

test('configuration and failed spawn release the lock without claiming uncertain execution',async t=>{
  const {directory,expected,options}=await fixture(t);
  for(const override of [{python:''},{terminate:null},{python:join(options.rootDirectory,'missing-python')}]){
    await assert.rejects(host.readScanCandidate(directory,expected,{...options,...override}),
      error=>error.code!=='termination-unconfirmed'&&/Configure|ENOENT/.test(error.message));
    assert.ok(!(await readdir(options.rootDirectory)).includes('.scan-worker.lock'));
  }
  assert.equal((await host.readScanCandidate(directory,expected,options)).revision,expected.revision);
});

test('a settled receipt with a retained Python lock cannot release the host',async t=>{
  const {directory,expected,options}=await fixture(t);
  const launch=(_python,args,opts)=>{
    writeFileSync(join(options.rootDirectory,'.scan-cpu.lock'),'interrupted before lock release');
    writeFileSync(args[args.indexOf('--receipt')+1],JSON.stringify({status:'settled',outcome:'passed',
      peak_rss_bytes:100000000,min_available_bytes:3*1024**3,elapsed_seconds:1}));
    const report={status:'needs-review',revision:expected.revision,objects:1};
    return spawn(process.execPath,['-e',`console.log(${JSON.stringify(JSON.stringify(report))})`],opts);
  };
  await assert.rejects(host.readScanCandidate(directory,expected,{...options,launch}),
    error=>error.code==='termination-unconfirmed');
  assert.ok((await readdir(options.rootDirectory)).includes('.scan-worker.lock'));
});

test('unsettled cancellation keeps a persistent lock and never admits late output',async t=>{
  const {directory,expected,options}=await fixture(t);
  const launch=(_python,args,opts)=>{
    writeFileSync(join(options.rootDirectory,'.scan-cpu.lock'),'owned supervisor pending');
    writeFileSync(args[args.indexOf('--receipt')+1],JSON.stringify({status:'running'}));
    return spawn(process.execPath,['-e','setInterval(()=>{},1000)'],opts);
  };
  await assert.rejects(host.readScanCandidate(directory,expected,{...options,launch,timeoutMs:20}),
    error=>error.code==='termination-unconfirmed');
  assert.ok((await readdir(options.rootDirectory)).includes('.scan-worker.lock'));
  await assert.rejects(host.readScanCandidate(directory,expected,options),/lock|EEXIST/);
});
