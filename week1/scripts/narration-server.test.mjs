import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { narrationServer } from "../apps/desktop/narration-server.ts";
import { readFileSync } from "node:fs";
import { groundedNarration, narrationPayload, validateNarrationPrompt } from "../packages/protocol/narration.ts";
const policy=JSON.parse(readFileSync(new URL('../fixtures/narration/prompt-policy.json',import.meta.url),'utf8'));
test('spoken weather is derived from the displayed fixture and fails closed on missing or changed provenance/dates',()=>{
  const weather=JSON.parse(readFileSync(new URL('../fixtures/connectors/weather-ithaca-week.json',import.meta.url),'utf8'));
  const template='{thursday} on Thursday and {friday} on Friday';
  assert.equal(groundedNarration('present',template,weather),'partly cloudy on Thursday and clear on Friday');
  const rain=structuredClone(weather);rain.days[0].condition='rain';assert.equal(groundedNarration('present',template,rain),'rainy on Thursday and clear on Friday');
  for(const bad of [null,{...weather,source:'live'},{...weather,location:'Elsewhere'},{...weather,days:[]},{...weather,days:[{date:'2026-09-17',condition:'__proto__'},weather.days[1]]}])assert.throws(()=>groundedNarration('present',template,bad));
});
test('prompt policy accepts tag stacks and longer prose, requiring review for short clips',()=>{
  assert.doesNotThrow(()=>validateNarrationPrompt('[excited] [laughs] This works!',policy,'Timed demo line'));
  assert.doesNotThrow(()=>validateNarrationPrompt('[warm] '+ 'This is a longer piece of narration with room for natural delivery. '.repeat(5),policy));
  for(const text of ['No tag.','[unknown] Hi.',"[warm] <break time='1s'/> Hi.",'[warm] [happy] [curious] [calm] Hi.','[whispers] Hello. [shouts] Goodbye!','[warm]','[warm] unmatched ]'])assert.throws(()=>validateNarrationPrompt(text,policy,'Timed demo line'));
  assert.throws(()=>validateNarrationPrompt('[warm] Short script.',policy));
  assert.throws(()=>validateNarrationPrompt('[warm] '+ 'x'.repeat(1200),policy));
  assert.throws(()=>narrationPayload('acknowledge',{acknowledge:'[warm] Hi.'},{model_id:'eleven_multilingual_v2',voice_settings:{stability:0.5}},policy));
});
const originalFetch = globalThis.fetch;
const request = { requestId: "synthetic", phase: "acknowledge" };
async function fixture(run, provider, configured = true) {
  const saved = [process.env.ELEVENLABS_API_KEY, process.env.ELEVENLABS_VOICE_ID];
  process.env.ELEVENLABS_API_KEY = configured ? "synthetic-test-key" : "";
  process.env.ELEVENLABS_VOICE_ID = "synthetic-voice";
  let handler, calls = 0;
  const server = createServer((req,res) => handler(req,res,() => { res.writeHead(404);res.end(); }));
  narrationServer().configureServer({middlewares:{use(v){handler=v;}},httpServer:server});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  globalThis.fetch = async (url, options) => {
    assert.equal(url,"https://api.elevenlabs.io/v1/text-to-speech/synthetic-voice?output_format=mp3_44100_128");
    assert.equal(options.headers["xi-api-key"],"synthetic-test-key"); assert.equal(options.redirect,"error");
    const data=JSON.parse(options.body); assert.equal(data.model_id,"eleven_v3"); assert.ok(data.text.length<240);
    assert.deepEqual(data.voice_settings,{stability:0.5}); calls++;
    return provider ? provider(options) : new Response(new Uint8Array([73,68,51,1]),{headers:{"content-type":"audio/mpeg"}});
  };
  const send=(path,value=request,headers={})=>new Promise((resolve,reject)=>{
    const req=httpRequest({hostname:"127.0.0.1",port:server.address().port,path:`/api/narration/${path}`,method:"POST",headers:{Host:"127.0.0.1:1420",Origin:"http://127.0.0.1:1420","Content-Type":"application/json",...headers}},res=>{
      const chunks=[];res.on("data",v=>chunks.push(v));res.on("end",()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode})));
    });req.on("error",reject);req.end(JSON.stringify(value));
  });
  try { await run(send,()=>calls); } finally {
    globalThis.fetch=originalFetch;
    ["ELEVENLABS_API_KEY","ELEVENLABS_VOICE_ID"].forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});
    await new Promise(resolve=>server.close(resolve));
  }
}
test("narration rejects origin, arbitrary text/routing/authority and unrecognized phases before networking",async()=>{
  await fixture(async(send,calls)=>{
    assert.equal((await send("speak",request,{Origin:"https://other.example"})).status,403);
    for(const field of ["text","voiceId","apiKey","endpoint","permission"]) assert.equal((await send("speak",{...request,[field]:"bad"})).status,400);
    for(const phase of ["__proto__","constructor","weather",null])assert.equal((await send("speak",{...request,phase})).status,400);
    assert.equal((await send("speak",{...request,requestId:"../private"})).status,400);
    assert.equal((await send("speak",{...request,text:"x".repeat(300)})).status,413);
    assert.equal(calls(),0);
  });
});
test("fixed speech is cached in memory and missing configuration makes no provider request",async()=>{
  await fixture(async(send,calls)=>{
    const result=await (await send("speak")).json();assert.deepEqual(result,{audioBase64:"SUQzAQ==",mime:"audio/mpeg"});
    assert.deepEqual(await(await send("speak")).json(),result);assert.equal(calls(),1);
  });
  await fixture(async(send,calls)=>{assert.equal((await send("speak")).status,503);assert.equal(calls(),0);},undefined,false);
});
test("v3 payload has delivery tags and omits unsupported stitching and v2 controls",async()=>{
  const bodies=[];
  await fixture(async send=>{
    for(const phase of ["acknowledge","building","present","wind-wait","wind-present"]){
      assert.equal((await send("speak",{requestId:phase,phase})).status,200);
      await new Promise(resolve=>setTimeout(resolve,260));
    }
  },options=>{bodies.push(JSON.parse(options.body));return new Response(new Uint8Array([73,68,51,1]),{headers:{"content-type":"audio/mpeg"}});});
  for(const body of bodies){assert.ok(body.text.startsWith("[speed: 1.25x] [calm] "));assert.ok(!body.text.includes("..."));assert.deepEqual(Object.keys(body).sort(),["model_id","text","voice_settings"]);}
  assert.match(bodies[2].text,/partly cloudy on Thursday and clear on Friday/);
  assert.match(bodies[3].text,/Give me a second/);
  assert.match(bodies[4].text,/wind speed in Ithaca/);

});
test("cancellation aborts synthesis and only one generation can run",async()=>{
  let start;const started=new Promise(resolve=>start=resolve);
  await fixture(async(send,calls)=>{
    const pending=send("speak");await started;
    assert.equal((await send("speak",{requestId:"other",phase:"present"})).status,429);
    await send("cancel",{requestId:request.requestId});
    assert.equal((await pending).status,502);assert.equal(calls(),1);
  },options=>new Promise((resolve,reject)=>{start();options.signal.addEventListener("abort",()=>reject(new Error("cancelled")),{once:true});}));
});
test("bad provider type, oversized audio, and sensitive errors are bounded",async()=>{
  for(const response of [new Response("private detail",{status:401}),new Response("not audio"),new Response(new Uint8Array(400001),{headers:{"content-type":"audio/mpeg"}})]){
    await fixture(async send=>{const result=await(await send("speak")).json();assert.deepEqual(Object.keys(result),["error"]);assert.ok(!JSON.stringify(result).includes("private"));},()=>response);
  }
});
