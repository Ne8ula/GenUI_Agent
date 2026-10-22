import {useEffect,useMemo,useRef,useState} from 'react';
import {CandidateView} from './CandidateView.tsx';
import type {CandidateGeometry,CandidateCamera} from './CandidateView.tsx';
import {AESTHETIC_PALETTE_SAMPLES,buildAestheticRoom} from './aesthetic-room.ts';
import './upload-room.css';
import './benchmark-room.css';
type Benchmark={
  dataset:string;capture:string;boundary_status:string;shado_status:string;
  profile:{id:string;label:string;initial_source_view:number;outside_source_indices:number[];source_note:string;dense_note:string};
  photos:{id:string;sha256:string;url:string}[];
  completion?:{variants:{id:string;geometry:CandidateGeometry;sha256:string}[];cameras:CandidateCamera[];dense_fields:boolean;confidence_excluded_lower_percentile:number|null};
  completion_error?:string;
  material_error?:string;
  result:{elapsed_seconds:number;analysis_geometry_sha256:string;units:string;
    estimator:{model?:string;vggt_model?:string;device?:string;geometry_refinement?:string};
    arms:{A:{geometry:CandidateGeometry;cameras:{center:number[];world_to_camera:number[][]}[]}};limitations:string[]};
};
const PROFILES:Record<string,string>={original:'VGGT · matched photos','worldmirror-v1':'WorldMirror 2.0 · matched photos','vga-visual-v1':'Broader room views'};
const MATCHED=['original','worldmirror-v1'];
function supportsStudy(data:Benchmark){
  return data.capture==='42445021'&&data.profile.id==='vga-visual-v1'&&
    data.result.analysis_geometry_sha256==='f8393ff6f318f90857076367b9fb64c2962c8ca183a142e20fe293f1dcd4244a'&&
    AESTHETIC_PALETTE_SAMPLES.every(sample=>data.photos[sample.sourceView-1]?.sha256===sample.imageSha256);
}
// Ordered source identity: only results from the same photos share selection and camera.
const sources=(data:Benchmark)=>data.photos.map(photo=>`${photo.id}:${photo.sha256}`).join();
const defaultVariant=(data:Benchmark)=>supportsStudy(data)?'aesthetic':data.completion?'completed':'raw';
const hasVariant=(data:Benchmark,id:string)=>id==='raw'||(id==='aesthetic'?supportsStudy(data):!!data.completion?.variants.some(item=>item.id===id));
const readProfile=()=>new URLSearchParams(window.location.search).get('profile')??'original';
export function BenchmarkRoom() {
  const [profileId,setProfileId]=useState(readProfile);
  const [data,setData]=useState<Benchmark>(),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[pending,setPending]=useState(true);
  const loaded=useRef<Benchmark|undefined>(undefined);
  const [viewer,setViewer]=useState(0);
  const [variant,setVariant]=useState('raw'),[sourceView,setSourceView]=useState(-1);
  const [studyView,setStudyView]=useState(0);
  // This authored study belongs only to the inspected public capture. It must
  // never appear as an automatic result for other uploads or changed inputs.
  const aesthetic=useMemo(()=>data&&supportsStudy(data)?buildAestheticRoom():null,[data]);
  const hasStudy=!!aesthetic;
  useEffect(()=>{
    const sync=()=>setProfileId(readProfile());
    addEventListener('popstate',sync);return ()=>removeEventListener('popstate',sync);
  },[]);
  useEffect(()=>{
    const abort=new AbortController();setError('');setPending(true);
    async function load() {
      if(!(profileId in PROFILES))throw Error('Unknown saved room profile. Choose a saved reconstruction below.');
      const session=await fetch('/api/room-workflow/session',{signal:abort.signal});
      if(!session.ok)throw Error('Start the local room service to inspect this result.');
      const endpoint=profileId==='original'?'/api/room-workflow/benchmark/arkitscenes':`/api/room-workflow/benchmark/arkitscenes/profiles/${profileId}`;
      const response=await fetch(endpoint,{signal:abort.signal});
      const body:Benchmark&{error?:string}=await response.json();
      if(abort.signal.aborted)return;
      if(!response.ok)throw Error(body.error??'The saved result is unavailable.');
      if(body.profile?.id!==profileId)throw Error('Saved room profile does not match the requested reconstruction.');
      const previous=loaded.current,matched=!!previous&&sources(previous)===sources(body);
      loaded.current=body;setData(body);
      setVariant(current=>matched&&hasVariant(body,current)?current:defaultVariant(body));
      setSourceView(current=>matched?current:body.profile.initial_source_view);
    }
    void load().catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'The saved result is unavailable.');})
      .finally(()=>{if(!abort.signal.aborted)setPending(false);});
    return ()=>abort.abort();
  },[attempt,profileId]);
  function selectProfile(id:string) {
    if(id===profileId)return;
    const url=new URL(window.location.href);
    if(id==='original')url.searchParams.delete('profile');else url.searchParams.set('profile',id);
    history.pushState(null,'',url);setProfileId(id);
  }
  const shown=data?.profile.id,worldMirror=shown==='worldmirror-v1';
  const showingStudy=variant==='aesthetic'&&hasStudy;
  const selectedGeometry=showingStudy?aesthetic!.geometry:data?.completion?.variants.find(item=>item.id===variant)?.geometry??data?.result.arms.A.geometry;
  const initialCamera=useMemo(()=>{
    if(showingStudy)return aesthetic!.views[studyView]!.camera;
    const rawCamera=data?.result.arms.A.cameras[sourceView];
    if(variant==='raw')return rawCamera?{position:rawCamera.center,forward:rawCamera.world_to_camera[2]!.slice(0,3),up:rawCamera.world_to_camera[1]!.slice(0,3).map(v=>-v)}:undefined;
    return sourceView>=0?data?.completion?.cameras[sourceView]:undefined;
  },[data,aesthetic,showingStudy,studyView,variant,sourceView]);
  // Raw analysis, rotated candidate and authored study are different coordinate
  // frames; only a frame or explicit viewpoint change discards the saved pose.
  const cameraReset=`${showingStudy?'study':variant==='raw'?'analysis':'candidate'}:${showingStudy?studyView:sourceView}`;
  return <main className="room-upload benchmark-room">
    <header><a href="/?scene=upload-room">EVA <span>Room workspace</span></a><a href="/?scene=hypersim-room">Hypersim reference</a></header>
    <section className="upload-intro">
      <p className="upload-eyebrow">Seven photographs · ARKitScenes 42445021</p>
      <h1>{showingStudy?'A room in complete forms.':'A room, estimated from photos.'}</h1>
      <p>{showingStudy
        ?'A complete-object interpretation of this photographed room. Furniture keeps its recognizable form and color; hidden shapes are inferred. Compare it with the original photo estimate below.'
        :worldMirror?'This is the saved WorldMirror 2.0 run from the same seven RGB views, registered to the VGGT estimate. Explore the actual estimate and its original images. Missing surfaces and alignment errors remain visible.'
        :'This is the saved VGGT run from seven RGB views. Explore the actual estimate and its original images. Missing surfaces and alignment errors remain visible.'}</p>
    </section>
    <div className="upload-actions" role="group" aria-label="Estimation model">
      {MATCHED.map(id=><button key={id} className="secondary" aria-pressed={shown===id} onClick={()=>selectProfile(id)}>{PROFILES[id]}</button>)}
    </div>
    {shown&&MATCHED.includes(shown)&&<p className="upload-boundary-note">Same seven photos · Relative scale · Registration between models is not accuracy evidence.</p>}
    <nav className="upload-actions" aria-label="Saved reconstruction">
      <a href="/?scene=arkitscenes-room" aria-current={shown==='original'?'page':undefined}>Original photos</a>
      <a href="/?scene=arkitscenes-room&profile=vga-visual-v1" aria-current={shown==='vga-visual-v1'?'page':undefined}>Broader room views</a>
    </nav>
    {pending&&<p role="status">{data?`Loading ${PROFILES[profileId]??profileId}…`:'Checking the saved result and source hashes…'}</p>}
    {error&&<div className="upload-error" role="alert"><p>{error}{data&&` The loaded ${data.profile.label} result stays visible.`}</p><button onClick={()=>setAttempt(n=>n+1)}>Retry loading</button></div>}
    {data&&<>
      <p className="upload-boundary-note">{data.profile.label}{shown==='vga-visual-v1'?' · Exploratory capture selection; no claim of better accuracy.':worldMirror?' · Same seven photos as the VGGT pilot, registered to its frame.':' · Original seven-photo pilot.'}</p>
      <div className="benchmark-status"><span>ML execution complete</span>{showingStudy&&<span>Authored geometry study</span>}<span>Boundary unconfirmed</span><span>Scale relative</span><span>No SAM 3D completion</span><span>Shado comparison pending</span></div>
      <section aria-label="Actual photo reconstruction" className="benchmark-scene">
        <div className="upload-actions" aria-label="Reconstruction candidate">
          {[...(hasStudy?[['aesthetic','Complete-object study']]:[]),['raw','Raw ML estimate'],...(data.completion?[['fused','Fused surfaces'],['completed','Provisional completion']]:[]),
            ...(data.completion?.variants.some(item=>item.id==='material')?[['material','Inferred wall colors']]:[])].map(([id,label])=>
            <button key={id} className="secondary" aria-pressed={variant===id} onClick={()=>setVariant(id!)}>{label}</button>)}
        </div>
        <p className="upload-boundary-note">{showingStudy?'Continuous furniture replaces disconnected surface patches in this separate study. All shapes are authored approximations, including visible parts; this is not an automated completion result. Hollow dots mark inferred geometry. The original estimate remains unchanged.'
          :variant==='material'?'Inferred colors on two supported assumed walls. Geometry, photo-derived colors and provenance are unchanged; unsupported planes keep their original fallback. These flat colors do not recover window texture or unseen details.'
          :variant==='completed'?'Provisional enclosure: fused estimated surfaces with an authored, unconfirmed room shell. Orange provenance shows the closures. No SAM 3D object completion.'
          :variant==='fused'?'CPU fusion and clipping of photo-derived estimates. Missing geometry is still missing.'
          :worldMirror?'WorldMirror 2.0 camera-Z depth estimate, registered to the VGGT frame, before fusion or closure.'
          :'Original VGGT depth-grid estimate, before fusion or closure.'}</p>
        {!showingStudy&&variant!=='raw'&&data.completion?.dense_fields&&<p className="upload-privacy">{data.profile.dense_note}</p>}
        {showingStudy&&<label className="benchmark-camera">Study viewpoint <select value={studyView} onChange={e=>setStudyView(Number(e.target.value))}>
          {aesthetic!.views.map((view,index)=><option key={view.label} value={index}>{view.label}</option>)}
        </select></label>}
        {!showingStudy&&<label className="benchmark-camera">Viewpoint <select value={sourceView} onChange={e=>setSourceView(Number(e.target.value))}>
          <option value={-1}>Outside overview</option>{data.photos.map((photo,index)=><option key={photo.id} value={index}>{data.profile.outside_source_indices.includes(index)?'Outside boundary':'Inside'} · source view {index+1}</option>)}
        </select></label>}
        {!showingStudy&&data.profile.outside_source_indices.includes(sourceView)&&<p className="upload-boundary-note">This source camera is outside the provisional room boundary. The assumed closure can obscure the completed room from here. Choose an inside viewpoint, or inspect the raw estimate and original photo.</p>}
        {selectedGeometry&&<CandidateView key={sources(data)} geometry={selectedGeometry} initialCamera={initialCamera} initialMode={showingStudy?'points':'surfaces'} inferredStudy={showingStudy} cameraReset={cameraReset} reopen={viewer} samplingKey={`${shown}:${variant}`}/>}
        <button className="secondary" onClick={()=>setViewer(n=>n+1)}>Reopen viewer</button>
        <p className="upload-privacy">Focus the scene and use W A S D to move. Arrow keys orbit; Home resets. Interior viewpoints reveal a closed enclosure; its outside overview can obscure furniture. Reopen recovers an interrupted graphics context. This inspection does not start cloud work.</p>
        {data.completion_error&&<p role="alert">Completion unavailable: {data.completion_error}. The validated raw estimate remains available.</p>}
        {data.material_error&&<p role="alert">Inferred wall colors unavailable: {data.material_error}. The provisional completion remains available.</p>}
        {showingStudy&&<details><summary>Objects and inferred details</summary>
          <p>These object descriptions were authored after inspecting the seven public source photos. Placement and dimensions are approximate, in relative units. They are not detections produced by a model.</p>
          <ul>{aesthetic!.objects.map(object=><li key={object.id}><strong>{object.label}</strong> · source views {object.sourceViews.join(', ')}. {object.assumptions}</li>)}</ul>
        </details>}
      </section>
      <section aria-labelledby="source-title"><h2 id="source-title">The seven input views</h2>
        <p className="upload-boundary-note">{data.profile.source_note}</p>
        <div className="upload-photos">{data.photos.map((photo,index)=><figure key={photo.id}>
          <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`Open original view ${index+1}`}><img src={photo.url} alt={`ARKitScenes room, input view ${index+1}`} loading="lazy"/></a>
          <figcaption>View {index+1}</figcaption>
        </figure>)}</div>
      </section>
      <details><summary>Run details and limitations</summary>
        <dl className="benchmark-details">
          <dt>Model</dt><dd>{data.result.estimator.model??data.result.estimator.vggt_model}</dd>
          <dt>{worldMirror?'Inference time':'Worker elapsed time'}</dt><dd>{data.result.elapsed_seconds.toFixed(1)} seconds; {worldMirror?'model inference only; excludes model loading, transfer and admission':'excludes build and other overhead'}</dd>
          <dt>Estimated mesh</dt><dd>{(data.result.arms.A.geometry.positions.length/3).toLocaleString()} vertices · {(data.result.arms.A.geometry.indices.length/3).toLocaleString()} triangles</dd>
          <dt>Refinement</dt><dd>{worldMirror?'Raw camera-Z depth estimate registered to the frozen VGGT frame; no confidence filtering, multiview fusion or bundle adjustment in this saved run.':'Raw depth-grid estimate; multiview fusion and bundle adjustment are not part of this saved run.'}</dd>
          <dt>Geometry fingerprint</dt><dd><code>{data.result.analysis_geometry_sha256}</code></dd>
        </dl>
        <p>Source hashes, camera records and geometry fingerprints are validated against the frozen request before this result is served. Integrity checks do not establish physical accuracy.</p>
        <ul>{data.result.limitations.map(item=><li key={item}>{item}</li>)}</ul>
      </details>
      <footer>Single-room boundary review remains pending. No adjoining rooms should be inferred from this raw estimate. Apple ARKitScenes supplies the source imagery; generated completion and Shado are separate stages.</footer>
    </>}
  </main>;
}
