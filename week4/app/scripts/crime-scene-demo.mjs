// Interactive demo: disposable broker with explicitly canned investigator replies; no provider access.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createBroker} from '../../../scripts/room_workflow/broker.mjs';
const directory=await mkdtemp(join(tmpdir(),'eva-scene-demo-'));
const {server}=await createBroker({directory,sceneInvestigatorOptions:{demo:true},
  sceneNotebookOptions:{key:async()=>'',fetcher:async()=>{throw Error('Provider disabled in local demo');}}});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(1442,'127.0.0.1',resolve);});
const vite=spawn(process.execPath,[join(dirname(createRequire(import.meta.url).resolve('vite/package.json')),'bin/vite.js'),'--host','127.0.0.1','--port','1440','--strictPort'],
 {cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit'});
console.log('Open http://127.0.0.1:1440/?scene=crime-scene (notes are discarded on exit; Ctrl+C to stop)');
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;vite.kill();server.close();await rm(directory,{recursive:true,force:true});process.exit();};
process.on('SIGINT',stop);process.on('SIGTERM',stop);vite.on('exit',stop);
