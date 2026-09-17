// Opt-in live check: five approved scripts; no credentials or provider diagnostics are logged.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { narrationPayload } from '../packages/protocol/narration.ts';
const local=parseEnv(readFileSync(new URL('../.env.local',import.meta.url),'utf8'));
const key=process.env.ELEVENLABS_API_KEY??local.ELEVENLABS_API_KEY;
const voice=process.env.ELEVENLABS_VOICE_ID??local.ELEVENLABS_VOICE_ID;
if(!key||!/^[a-zA-Z0-9_-]{1,80}$/.test(voice??''))throw Error('Narration not configured');
const lines=JSON.parse(readFileSync(new URL('../fixtures/narration/weather-lines.json',import.meta.url),'utf8'));
const profile=JSON.parse(readFileSync(new URL('../fixtures/narration/voice-profile.json',import.meta.url),'utf8'));
const policy=JSON.parse(readFileSync(new URL('../fixtures/narration/prompt-policy.json',import.meta.url),'utf8'));
const weather=JSON.parse(readFileSync(new URL('../fixtures/connectors/weather-ithaca-week.json',import.meta.url),'utf8'));
const phases=['acknowledge','building','present','wind-wait','wind-present'];
const output=mkdtempSync(join(tmpdir(),'eva-speech-check-'));const results=[];
for(const phase of phases){
  const payload=narrationPayload(phase,lines,profile,policy,weather);
  const began=performance.now();
  try{
    const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,{
      method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json',Accept:'audio/mpeg'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(20000),
    });
    if(!response.ok||!response.headers.get('content-type')?.startsWith('audio/mpeg')){results.push({phase,status:response.status,ok:false});break;}
    const reader=response.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>400000){await reader.cancel();throw Error('Audio limit');}chunks.push(value);}
    if(!size)throw Error('Empty audio');
    writeFileSync(join(output,phase+'.mp3'),Buffer.concat(chunks));
    results.push({phase,status:response.status,bytes:size,elapsedMs:Math.round(performance.now()-began)});
  }catch{results.push({phase,ok:false,error:'Provider check unavailable'});break;}
}
writeFileSync(join(output,'results.json'),JSON.stringify({model:profile.model_id,results},null,2));
console.log(JSON.stringify({output,model:profile.model_id,results},null,2));
if(results.length!==phases.length||results.some(r=>r.ok===false))process.exitCode=1;
