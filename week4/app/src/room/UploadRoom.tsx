import { useEffect, useRef, useState } from 'react';
import './upload-room.css';
import { BoundaryReview } from './BoundaryReview.tsx';
import { CandidateView } from './CandidateView.tsx';
import type { CandidateGeometry,CandidateCamera } from './CandidateView.tsx';
import { OpeningReview } from './OpeningReview.tsx';
import type { Opening } from './OpeningReview.tsx';

type Photo = { name: string; mime: string; data_base64: string; preview: string };
type Boundary = { polygon: number[][]; floor: number; ceiling: number };
type Job = { id: string; status: string; message: string; expiresAt: number; retention: string;
  scale: { nominal_m2: number; statement: string } | null; hasResult: boolean; boundary: Boundary | null; shadoAuthorized?:boolean; shadoTaskId?:string;
  canCompleteLocally?:boolean;hasLocalCompletion?:boolean;localCompletionStatus?:string;
  cloudPending?:boolean;cloudRecoveryStatus?:'checking'|'pending'|'unavailable'|'settled';
  imagePreflightStatus?:string;
  shadoQuoteSummary?:{maximumCostUsd:number;currency:string;expiresAt:string}|null };
type Session = { csrf: string; cloudConfigured: boolean; shadoConfigured: boolean; storage: string;localCompletionConfigured?:boolean;imagePreflightConfigured?:boolean };
const base = '/api/room-workflow';

export function UploadRoom() {
  const [session,setSession] = useState<Session>();
  const [photos,setPhotos] = useState<Photo[]>([]);
  const [area,setArea] = useState('');
  const [job,setJob] = useState<Job>();
  const [savedJobs,setSavedJobs]=useState<Job[]>([]);
  const [retention,setRetention]=useState('temporary');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [boundary,setBoundary] = useState<Boundary>();
  const [boundaryRevision,setBoundaryRevision] = useState(0);
  const [openings,setOpenings]=useState<Opening[]>([]);
  const [previewPositions,setPreviewPositions]=useState<number[]>([]);
  const [arms,setArms]=useState<Record<string,{geometry?:CandidateGeometry;raw_geometry?:CandidateGeometry;status:string}>>({});
  const [showRaw,setShowRaw]=useState(false);
  const [selectedArm,setSelectedArm]=useState('A');
  const [localCamera,setLocalCamera]=useState<CandidateCamera>();
  const [localView,setLocalView]=useState(false);
  const [confirmed,setConfirmed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const current = useRef(0);
  const photoRef = useRef<Photo[]>([]);
  const controller = useRef<AbortController | null>(null);
  const popupCleanup=useRef<()=>void>(()=>{});
  const popupLink=useRef<{window:Window;origin:string;nonce:string;jobId:string;uploadNonce?:string|undefined;quoteId?:string|undefined}|null>(null);
  async function api(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    const response = await fetch(base+path,{method,credentials:'same-origin',signal:controller.current?.signal ?? null,
      headers:{'Content-Type':'application/json',...(session?{'X-EVA-CSRF':session.csrf}:{})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    const value = await response.json();
    if (!response.ok) throw Error(value.error ?? 'The room service could not complete that step.');
    return value;
  }
  useEffect(()=>{
    const abort = new AbortController();
    fetch(base+'/session',{signal:abort.signal}).then(async response=>{
      if (!response.ok) throw Error('Start the private room service to enable uploads.');
      return response.json();
    }).then(value=>{setSession(value);return fetch(base+'/jobs',{signal:abort.signal});})
      .then(r=>r.json()).then(value=>{if(Array.isArray(value))setSavedJobs(value);})
      .catch(e=>{if(e.name!=='AbortError')setError('The private room service is unavailable. Your photos stay on this device.');});
    return ()=>{abort.abort();controller.current?.abort();popupCleanup.current();current.current++;photoRef.current.forEach(p=>URL.revokeObjectURL(p.preview));};
  },[]);
  useEffect(()=>{
    if (!job || !(job.cloudRecoveryStatus==='checking'||['preflighting-images','analyzing','reconstructing','completing-room','shado-preparing','ready-shado-generation','cancel-requested'].includes(job.status))) return;
    let disposed=false;
    const timer = window.setInterval(()=>{
      api('/jobs/'+job.id).then(value=>{if(!disposed)setJob(value);}).catch(e=>{if(!disposed)setError(e.message);});
    },2000);
    return ()=>{disposed=true;clearInterval(timer);};
  },[job?.id,job?.status,job?.cloudRecoveryStatus,session]);
  useEffect(()=>{
    const link=popupLink.current;
    if(job?.status!=='awaiting-shado-generation'||!link||link.jobId!==job.id)return;
    let disposed=false;
    void api('/jobs/'+job.id+'/shado-quote').then(packet=>{
      if(disposed||popupLink.current!==link||link.window.closed||packet.nonce!==link.nonce||
        packet.uploadNonce!==link.uploadNonce||packet.quote.id===link.quoteId)return;
      link.quoteId=packet.quote.id;link.window.postMessage(packet,link.origin);
    }).catch(e=>{if(!disposed)setError(e.message);});
    return ()=>{disposed=true;};
  },[job?.id,job?.status,session]);
  async function select(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files), revision=++current.current;
    setError('');setBusy(true);
    try {
      if (selected.length<5 || selected.length>7) throw Error('Choose 5–7 photos of the same room.');
      if (selected.some(f=>!['image/jpeg','image/png'].includes(f.type)||f.size>10*1024**2)) throw Error('Use JPEG or PNG photos, each under 10 MB.');
      if (selected.reduce((n,f)=>n+f.size,0)>40*1024**2) throw Error('Keep this set under 40 MB.');
      const result: Photo[] = [];
      try {
        for (const file of selected) {
          const image = await createImageBitmap(file);
          const pixels=image.width*image.height,dimensions=[image.width,image.height];image.close();
          if (pixels>24_000_000||dimensions.some(n=>n<32||n>8192)) throw Error('Use photos up to 24 megapixels, with each side between 32 and 8192 pixels.');
          const data = await new Promise<string>((accept,reject)=>{
            const reader=new FileReader();reader.onload=()=>accept(String(reader.result).split(',')[1]!);
            reader.onerror=()=>reject(Error('A photo could not be read.'));reader.readAsDataURL(file);
          });
          result.push({name:file.name,mime:file.type,data_base64:data,preview:URL.createObjectURL(file)});
        }
        if (revision!==current.current) {result.forEach(p=>URL.revokeObjectURL(p.preview));return;}
        photoRef.current.forEach(p=>URL.revokeObjectURL(p.preview));photoRef.current=result;setPhotos(result);
      } catch(e) {result.forEach(p=>URL.revokeObjectURL(p.preview));throw e;}
    } catch(e) {setError((e as Error).message);} finally {if(revision===current.current)setBusy(false);}
  }
  function resetRoomView() {
    setBoundary(undefined);setConfirmed(false);setOpenings([]);setPreviewPositions([]);
    setArms({});setShowRaw(false);setSelectedArm('A');setLocalCamera(undefined);setLocalView(false);
  }
  async function perform(action: ()=>Promise<void>) {
    setError('');setBusy(true);controller.current=new AbortController();
    try {await action();} catch(e) {if((e as Error).name!=='AbortError')setError((e as Error).message);}
    finally {setBusy(false);controller.current=null;}
  }
  function authorizeShado() {
    // Open synchronously during the user gesture; never place a grant in a URL.
    const popup=window.open('about:blank','eva-shado-authorize','popup,width=620,height=780');
    if(!popup){setError('Allow the Shado authorization window to open, then try again.');return;}
    void perform(async()=>{
      try{
        const {origin,packet}=await api('/jobs/'+job!.id+'/authorize',{});
        popupCleanup.current();
        const link={window:popup,origin,nonce:packet.nonce,jobId:job!.id,uploadNonce:undefined as string|undefined,quoteId:undefined as string|undefined};
        popupLink.current=link;
        let delivering=false;
        const invalidate=()=>{
          if(popupLink.current!==link)return;
          popupCleanup.current();
          if(link.uploadNonce)void perform(async()=>setJob(await api('/jobs/'+link.jobId+'/shado-invalidate',
            {nonce:link.nonce,jobId:link.jobId,uploadNonce:link.uploadNonce})));
        };
        const receive=(event:MessageEvent)=>{
          if(event.origin!==origin||event.source!==popup)return;
          if(event.data?.type==='eva-room-ready'){popup.postMessage(packet,origin);return;}
          if(event.data?.type==='eva-room-invalidated'&&event.data.nonce===packet.nonce&&event.data.jobId===link.jobId&&event.data.uploadNonce===link.uploadNonce){invalidate();return;}
          if(event.data?.type==='eva-room-grant'&&event.data.nonce===packet.nonce&&event.data.jobId===link.jobId&&!delivering){
            delivering=true;
            void perform(async()=>{
              try {
                // Record the popup binding before the request so an account-change
                // message during delivery can revoke the same pending delegation.
                if(event.data.grant?.phase==='upload')link.uploadNonce=event.data.uploadNonce;
                const updated=await api('/jobs/'+link.jobId+'/grant',event.data);
                if(popupLink.current!==link)return;
                if(event.data.grant?.phase!=='upload'){popupCleanup.current();popup.close();}
                setJob(updated);
              } finally {delivering=false;}
            });
          }
        };
        window.addEventListener('message',receive);
        const timeout=window.setTimeout(()=>{invalidate();setError('Shado authorization expired. Reconnect to continue.');},15*60*1000);
        const closed=window.setInterval(()=>{if(popup.closed)invalidate();},1000);
        popupCleanup.current=()=>{window.removeEventListener('message',receive);clearTimeout(timeout);clearInterval(closed);if(popupLink.current===link)popupLink.current=null;};
        popup.location.href=origin+'/eva-room-authorize';
      }catch(e){popup.close();throw e;}
    });
  }
  const terminal=job && ['cancelled','complete','partial','failed'].includes(job.status);
  const canRecoverCloud=job && (job.status==='submission-unknown'||job.status==='cancel-requested'&&job.cloudPending===true);
  return <main className="room-upload">
    <header><a href="/">EVA <span>/ Places</span></a><a href="/?scene=hypersim-room&room=r03">Explore the original room demo ↗</a></header>
    <section className="upload-intro"><p className="upload-eyebrow">A place you remember</p>
      <h1>Bring one room back.</h1>
      <p>Start with 5–7 photographs from different angles. We’ll compare a reconstruction from your photos with one assisted by Shado.</p>
    </section>
    {!job ? <section className="upload-form" aria-label="Room photographs">
      {savedJobs.length>0&&<div className="upload-actions" aria-label="Private working copies">{savedJobs.map(saved=><button className="secondary" key={saved.id}
        onClick={()=>{resetRoomView();setJob(saved);}}>Reopen room · {new Date(saved.expiresAt).toLocaleDateString()} · {saved.status.replaceAll('-',' ')}</button>)}</div>}
      <label className="upload-picker">Choose room photos
        <input ref={input} type="file" multiple accept="image/jpeg,image/png" disabled={busy} onChange={e=>void select(e.target.files)} />
        <span>JPEG or PNG · 5–7 photos · up to 40 MB together</span>
      </label>
      <div className="upload-photos">{photos.map((photo,index)=><figure key={index}><img src={photo.preview} alt={`Selected room photo ${index+1}`}/><figcaption>{photo.name}</figcaption></figure>)}</div>
      <label className="upload-area">How big do you remember it being?
        <input value={area} onChange={e=>setArea(e.target.value)} maxLength={500} placeholder="Probably around 300 sqft" disabled={busy}/>
        <span>A rough recollection is fine. It will stay an estimate, not a measurement.</span>
      </label>
      <p className="upload-boundary-note">One room only. You’ll review its outline before completion. Empty doorways and windows will close at the room boundary.</p>
      <p className="upload-privacy">Stay inside the same room. Neighboring views should share furniture or wall corners; avoid seven isolated detail shots or a set dominated by blank walls. Five to seven photos alone does not guarantee enough coverage to reconstruct the room.</p>
      <label className="upload-confirm"><input type="checkbox" checked={retention==='saved'} onChange={e=>setRetention(e.target.checked?'saved':'temporary')}/>
        Keep this private project for 30 days so I can reopen it in this browser.</label>
      <button disabled={!session||photos.length<5||busy} onClick={()=>void perform(async()=>{
        const created=await api('/jobs',{images:photos.map(({preview,...p})=>p),areaStatement:area,retention});
        resetRoomView();setJob(created);
      })}>{busy?'Preparing photos…':'Prepare this room'}</button>
      <p className="upload-privacy">Selecting photos keeps them in this browser. Prepare saves a private local copy for {retention==='saved'?'30 days':'24 hours'}. Expired copies are removed while the service is running or on its next start. Unresolved remote tasks retain recovery records until settled. Cloud processing needs a separate job allowance.</p>
    </section> : <section className="upload-progress" aria-label="Room progress">
      <p className="upload-eyebrow">{job.status.replaceAll('-',' ')}</p>
      <h2>Your room, one step at a time.</h2>
      <p role="status">{job.message}</p>
      {job.status==='preflighting-images'&&<p>Checking the original photos locally before requesting cloud processing. No model has run for this step.</p>}
      {canRecoverCloud&&<div>
        <p>Check the existing cloud call without starting another generation.</p>
        {job.cloudRecoveryStatus==='checking'&&<p role="status">Checking the existing call. Cancellation remains available.</p>}
        {job.cloudRecoveryStatus==='pending'&&<p>The existing cloud call is still pending. No replacement has been submitted.</p>}
        {job.cloudRecoveryStatus==='unavailable'&&<p>The existing call could not be verified. Its outcome is still unknown; this is not confirmation that it stopped.</p>}
        {job.status==='cancel-requested'&&<p>Cancellation is requested, but the remote outcome is not yet confirmed. Recovered geometry will not be admitted.</p>}
        <button className="secondary" disabled={busy||job.cloudRecoveryStatus==='checking'} onClick={()=>void perform(async()=>setJob(await api('/jobs/'+job.id+'/recover-cloud',{})))}>Check existing cloud call</button>
      </div>}
      <ol><li>Original photos</li><li>Camera and depth estimate</li><li>Confirm one room</li><li>Shado comparison</li><li>Explore both scenes</li></ol>
      {job.scale && <p>Approximate area: {job.scale.nominal_m2.toFixed(1)} m², based on “{job.scale.statement}”.</p>}
      {['awaiting-analysis','awaiting-cloud-approval'].includes(job.status) && <>
        <button disabled={busy||session?.imagePreflightConfigured===false} onClick={()=>void perform(async()=>setJob(await api('/jobs/'+job.id+(job.boundary?'/compare':'/analyze'),{})))}>{job.boundary?'Request paired reconstruction':'Request cloud estimate'}</button>
        {session?.imagePreflightConfigured===false&&<p>The operator must configure local photo validation before cloud processing can begin.</p>}
      </>}
      {job.status==='review-boundary' && <div className="upload-boundary">
        <p>Review the estimated outline before either candidate is completed. Coordinates are relative reconstruction units.</p>
        <button disabled={busy} onClick={()=>void perform(async()=>{
          const result=await api('/jobs/'+job.id+'/result');
          const proposal=result.boundary_proposal?.value ?? result.boundary_proposal;
          if (!proposal) throw Error('The worker returned no reviewable boundary. Do not substitute a guessed box.');
          setBoundary(proposal);
          setBoundaryRevision(revision=>revision+1);
          setOpenings([]);
          setPreviewPositions(result.arms?.A?.geometry?.positions ?? result.preview?.positions ?? []);
          setArms(result.arms ?? {});
          setConfirmed(false);
        })}>Load estimated outline</button>
        {boundary && <><BoundaryReview key={`${job.id}-${boundaryRevision}`} value={boundary} positions={previewPositions} onChange={value=>{
          if(value.polygon.length!==boundary.polygon.length)setOpenings(openings.map(opening=>({...opening,
            // Corner insertion/removal keeps endpoint references for untouched walls.
            edge_index:value.polygon.findIndex((point,i)=>point===boundary.polygon[opening.edge_index]&&
              value.polygon[(i+1)%value.polygon.length]===boundary.polygon[(opening.edge_index+1)%boundary.polygon.length]),
          })));
          setBoundary(value);setConfirmed(false);
        }}/>
          <OpeningReview value={openings} boundary={boundary} onChange={value=>{setOpenings(value);setConfirmed(false);}}/>
          {openings.some(o=>o.edge_index<0)&&<p role="status">Room corners changed. Choose a wall again for the affected closures and check their positions. Your closure drafts are preserved.</p>}
          <label className="upload-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I have checked that this boundary contains only my selected room.</label>
          <button disabled={!confirmed||busy||openings.some(o=>o.edge_index<0)} onClick={()=>void perform(async()=>setJob(await api('/jobs/'+job.id+'/boundary',{boundary,openings,confirmed:true})))}>Confirm room boundary</button></>}
      </div>}
      {job.status==='awaiting-shado' && <><p>{job.shadoTaskId?'Reconnect to the same Shado task. Generation still requires a current quote and permission.':'First authorize the original-photo upload in Shado. That permission cannot generate video. After transfer, Shado shows the actual price for a separate generation decision.'}</p>
        <button disabled={busy} onClick={authorizeShado}>{job.shadoTaskId?'Renew existing Shado authorization':'Authorize upload in Shado'}</button></>}
      {job.status==='awaiting-shado'&&job.canCompleteLocally&&!job.hasLocalCompletion&&<>
        <p>You can close the confirmed room boundary around the existing predicted depth while the Shado comparison is pending. This does not complete missing furniture. It runs on this PC and makes no new model or cloud call.</p>
        <button className="secondary" disabled={busy||!session?.localCompletionConfigured} onClick={()=>void perform(async()=>setJob(await api('/jobs/'+job.id+'/complete-local',{})))}>Complete photo-based room locally</button>
        {!session?.localCompletionConfigured&&<p>The operator must configure the local CPU adapter first.</p>}
      </>}
      {job.hasLocalCompletion&&<button className="secondary" disabled={busy} onClick={()=>void perform(async()=>{
        const artifact=await api('/jobs/'+job.id+'/completion');
        if(artifact.artifact_type!=='eva-room-local-completion-v1')throw Error('No validated local completion is available.');
        setArms({A:{geometry:artifact.geometry,raw_geometry:artifact.raw_geometry,status:'complete'}});setSelectedArm('A');setShowRaw(false);setLocalView(true);
        const camera=artifact.cameras[0];
        setLocalCamera({position:camera.center,forward:camera.world_to_camera[2].slice(0,3),up:camera.world_to_camera[1].slice(0,3).map((v:number)=>-v)});
      })}>Inspect completed photo-based room</button>}
      {job.status==='awaiting-shado-generation'&&<><p>The originals are uploaded. Review the real quote and generation permission in the Shado window.</p>
        {job.shadoQuoteSummary&&<p>Quoted maximum: {job.shadoQuoteSummary.maximumCostUsd.toLocaleString(undefined,{style:'currency',currency:job.shadoQuoteSummary.currency})}. Expires {new Date(job.shadoQuoteSummary.expiresAt).toLocaleTimeString()}.</p>}
        <button className="secondary" disabled={busy} onClick={authorizeShado}>Reopen Shado authorization</button></>}
      {job.status==='ready-shado-generation'&&<>
        <button disabled={busy||!job.shadoAuthorized} onClick={()=>void perform(async()=>setJob(await api('/jobs/'+job.id+'/shado',{})))}>Generate the authorized video once</button>
        {!job.shadoAuthorized&&<><p>The previous Shado permission is no longer available. Reconnect to this existing task before continuing.</p>
          <button className="secondary" disabled={busy} onClick={authorizeShado}>Renew existing Shado authorization</button></>}
      </>}
      {job.shadoTaskId&&['shado-running','shado-submission-unknown','cancel-requested'].includes(job.status)&&<button disabled={busy} onClick={()=>void perform(async()=>setJob(await api('/jobs/'+job.id+'/shado-status',{})))}>Check existing Shado task</button>}
      {job.shadoTaskId&&['shado-running','shado-submission-unknown','cancel-requested'].includes(job.status)&&<button className="secondary" disabled={busy} onClick={authorizeShado}>Renew existing Shado authorization</button>}
      {job.status==='awaiting-comparison'&&<button disabled={busy} onClick={()=>void perform(async()=>setJob(await api('/jobs/'+job.id+'/compare',{})))}>Request paired reconstruction</button>}
      {job.hasResult && <button className="secondary" disabled={busy} onClick={()=>void perform(async()=>{
        const result=await api('/jobs/'+job.id+'/result');setArms(result.arms??{});setSelectedArm('A');setLocalView(false);setLocalCamera(undefined);
      })}>Inspect available geometry</button>}
      {Object.keys(arms).length>0 && <div className="upload-actions">{['A','B'].map(arm=><button key={arm} disabled={!arms[arm]?.geometry} aria-pressed={selectedArm===arm} className="secondary" onClick={()=>setSelectedArm(arm)}>
        {arm==='A'?'Original photos':'Shado-assisted'}{!arms[arm]?.geometry?' · not available':''}
      </button>)}</div>}
      {arms[selectedArm]?.geometry && <>{localView&&<p>Photo-based surfaces with assumed boundary closures. Furniture may remain incomplete. Orange surfaces are assumed closures; scale remains relative. This is not a Shado result.</p>}<label className="upload-confirm"><input type="checkbox" checked={showRaw} disabled={!arms[selectedArm]?.raw_geometry}
        onChange={e=>setShowRaw(e.target.checked)}/>Inspect raw estimate before room clipping and assumed closures</label>
        <CandidateView key={`${job.id}-${localView}`} geometry={(showRaw?arms[selectedArm]?.raw_geometry:undefined)??arms[selectedArm]!.geometry!} initialCamera={localCamera} initialMode="points"/></>}
      <div className="upload-actions">
        {!terminal && <button className="secondary" disabled={busy} onClick={()=>void perform(async()=>setJob(await api('/jobs/'+job.id+'/cancel',{})))}>Cancel processing</button>}
        {!['preflighting-images','analyzing','reconstructing','submission-unknown','completing-room','shado-preparing','shado-running','shado-submission-unknown','cancel-requested'].includes(job.status) && <button className="secondary" disabled={busy} onClick={()=>void perform(async()=>{
          await api('/jobs/'+job.id,undefined,'DELETE');resetRoomView();setJob(undefined);setSavedJobs(await api('/jobs'));
        })}>Delete working copy</button>}
      </div>
      <p className="upload-privacy">This working copy expires {new Date(job.expiresAt).toLocaleString()}. Provider retention is separate and must be established before cloud processing.</p>
    </section>}
    {error && <p className="upload-error" role="alert">{error}</p>}
    <footer>Original photos remain the primary evidence. Generated additions and assumed closures stay identifiable.</footer>
  </main>;
}
