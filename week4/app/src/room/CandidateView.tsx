import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sampleSurfacePoints } from './surface-points.ts';
import { enhancePointColors } from './point-colors.ts';
import { createRoomMatrixGeometry, createRoomMatrixMaterial } from './matrix-style.ts';
export type CandidateGeometry = {positions:number[];colors:number[];indices:number[];provenance:string[];samplingGroups?:number[]};
export type CandidateCamera = {position:number[];forward:number[];up:number[]};
export function validateCandidate(g:CandidateGeometry) {
  if(!g||!Array.isArray(g.positions)||g.positions.length<9||g.positions.length>600000||g.positions.length%3||
    !Array.isArray(g.colors)||g.colors.length!==g.positions.length||!Array.isArray(g.indices)||g.indices.length>1200000||g.indices.length%3||
    g.positions.some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||g.colors.some(v=>!Number.isFinite(v)||v<0||v>1)||
    g.indices.some(v=>!Number.isInteger(v)||v<0||v>=g.positions.length/3)||!Array.isArray(g.provenance)||g.provenance.length!==g.indices.length/3) throw Error('Invalid candidate geometry.');
}
export function CandidateView({geometry,initialCamera,initialMode='surfaces',inferredStudy=false,cameraReset,reopen,samplingKey}:{
  geometry:CandidateGeometry;initialCamera?:CandidateCamera|undefined;
  initialMode?:'points'|'surfaces';inferredStudy?:boolean;
  // cameraReset: a changed value discards the saved pose (explicit viewpoint or
  // coordinate-frame change). reopen: a changed value replaces the canvas and
  // renderer while keeping display state and the saved pose. Callers that
  // remount by key keep their previous behavior.
  cameraReset?:string|number|undefined;reopen?:number|undefined;
  // Separate benchmark variants resample deterministically; uploads keep shared spacing.
  samplingKey?:string|undefined;
}) {
  const canvas=useRef<HTMLCanvasElement>(null), saved=useRef<{position:number[];target:number[];up:number[]}|undefined>(undefined);
  const lastReset=useRef(cameraReset);
  const [mode,setMode]=useState<string>(initialMode),[error,setError]=useState('');
  const [enhanced,setEnhanced]=useState(true);
  const [matrixStyle,setMatrixStyle]=useState(true);
  const matrixStyleRef=useRef(true),changeStyle=useRef<(value:boolean)=>void>(()=>{});
  const enhancedRef=useRef(true),changePointColors=useRef<(value:boolean)=>void>(()=>{});
  const change=useRef<(mode:string)=>void>(()=>{});
  const navigate=useRef<(key:string)=>void>(()=>{});
  const spacing=useRef<number|undefined>(undefined),lastSamplingKey=useRef(samplingKey);
  useEffect(()=>{
    let dispose=()=>{};
    if(lastSamplingKey.current!==samplingKey){lastSamplingKey.current=samplingKey;spacing.current=undefined;}
    if(lastReset.current!==cameraReset){lastReset.current=cameraReset;saved.current=undefined;}
    try {
      validateCandidate(geometry);setError('');
      const element=canvas.current!;let disposed=false;
      const renderer=new THREE.WebGLRenderer({canvas:element,antialias:true});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
      const scene=new THREE.Scene();scene.background=new THREE.Color('#171b18');
      const buffer=new THREE.BufferGeometry();
      buffer.setAttribute('position',new THREE.Float32BufferAttribute(geometry.positions,3));
      // Input colors are encoded sRGB.
      const color=new THREE.Color();const colors=Float32Array.from(geometry.colors);
      for(let i=0;i<colors.length;i+=3){color.setRGB(colors[i]!,colors[i+1]!,colors[i+2]!,THREE.SRGBColorSpace);colors.set([color.r,color.g,color.b],i);}
      buffer.setAttribute('color',new THREE.BufferAttribute(colors,3));buffer.setIndex(geometry.indices);buffer.computeVertexNormals();buffer.computeBoundingBox();
      const box=buffer.boundingBox!,size=box.getSize(new THREE.Vector3()).length(),center=box.getCenter(new THREE.Vector3());
      const camera=new THREE.PerspectiveCamera(55,1,Math.max(size/(inferredStudy?1000:10000),.0001),size*20);camera.up.set(0,0,1);
      camera.position.copy(center).add(new THREE.Vector3(size*.7,-size*.7,size*.6));
      const controls=new OrbitControls(camera,canvas.current!);controls.target.copy(center);controls.enableDamping=false;
      if(initialCamera){camera.position.fromArray(initialCamera.position);camera.up.fromArray(initialCamera.up);
        controls.target.copy(camera.position).add(new THREE.Vector3().fromArray(initialCamera.forward).multiplyScalar(size*.2));}
      if(saved.current){camera.position.fromArray(saved.current.position);controls.target.fromArray(saved.current.target);camera.up.fromArray(saved.current.up);}
      const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(buffer,material);scene.add(mesh);
      const samples=sampleSurfacePoints({positions:geometry.positions,indices:geometry.indices,colors,
        ...(geometry.samplingGroups?{samplingGroups:geometry.samplingGroups}:{})},spacing.current??(inferredStudy ? .035 : undefined));
      spacing.current=samples.spacing;
      const pointBuffer=new THREE.BufferGeometry();pointBuffer.setAttribute('position',new THREE.BufferAttribute(samples.positions,3));pointBuffer.setAttribute('color',new THREE.BufferAttribute(samples.colors.slice(),3));
      pointBuffer.setAttribute('roomInferred',new THREE.BufferAttribute(Float32Array.from(samples.faces,face=>geometry.provenance[face]==='photo-estimated'?0:1),1));
      const enhancedColors=enhancePointColors(samples.colors);
      // Screen-sized circular dots retain legibility across the room. The sampler
      // still determines geometric spacing; rendering size does not change evidence.
      const dotCanvas=document.createElement('canvas');dotCanvas.width=dotCanvas.height=32;
      const dotContext=dotCanvas.getContext('2d')!;dotContext.fillStyle='#fff';dotContext.beginPath();
      if(inferredStudy){
        // A persistent shape cue distinguishes the entirely authored study
        // from filled dots on the photo estimate, including in normal viewing.
        dotContext.strokeStyle='#fff';dotContext.lineWidth=8;
        dotContext.arc(16,16,11,0,Math.PI*2);dotContext.stroke();
      }else{dotContext.arc(16,16,15,0,Math.PI*2);dotContext.fill();}
      const dotMask=new THREE.CanvasTexture(dotCanvas);
      const pointMaterial=new THREE.PointsMaterial({vertexColors:true,size:inferredStudy?3.2:1.8,sizeAttenuation:false,map:dotMask,alphaTest:.5});
      // Keep the study's existing ring texture; mixed uploads carry the cue per
      // sampled face, so shared vertices cannot turn inferred dots into evidence.
      if(!inferredStudy)pointMaterial.onBeforeCompile=shader=>{
        shader.vertexShader='attribute float roomInferred;\nvarying float inferred;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('gl_PointSize = size;','inferred=roomInferred; gl_PointSize=size*mix(1.0,3.2/1.8,roomInferred);');
        shader.fragmentShader='varying float inferred;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_particle_fragment>',
          '#include <map_particle_fragment>\nif(inferred>0.5&&length(gl_PointCoord-vec2(0.5))<0.25)discard;');
      };
      const points=new THREE.Points(pointBuffer,pointMaterial);scene.add(points);
      // Depth-only surfaces prevent dots behind furniture bleeding through it.
      // This uses the same selected candidate, including only its known/assumed faces.
      const pointDepthMaterial=new THREE.MeshBasicMaterial({colorWrite:false,side:THREE.DoubleSide,
        polygonOffset:true,polygonOffsetFactor:inferredStudy?4:1,polygonOffsetUnits:inferredStudy?4:1});
      const pointDepth=new THREE.Mesh(buffer,pointDepthMaterial);pointDepth.renderOrder=-1;scene.add(pointDepth);
      const edgeBuffer=new THREE.EdgesGeometry(buffer,35),edgeMaterial=new THREE.LineBasicMaterial({color:'#ead8ad'});
      const edges=new THREE.LineSegments(edgeBuffer,edgeMaterial);scene.add(edges);
      // Face-local provenance must survive shared vertices between estimates
      // and closures. Do not let one inferred face relabel its neighbours.
      const matrixBuffer=createRoomMatrixGeometry(buffer,geometry.provenance);
      const matrixMaterial=createRoomMatrixMaterial(renderer.getPixelRatio());
      const matrixMesh=new THREE.Mesh(matrixBuffer,matrixMaterial);scene.add(matrixMesh);
      const matrixEdgeMaterial=new THREE.LineDashedMaterial({color:'#b8c2bd',transparent:true,opacity:.32,dashSize:.025,gapSize:.035});
      const matrixEdges=new THREE.LineSegments(edgeBuffer,matrixEdgeMaterial);matrixEdges.computeLineDistances();scene.add(matrixEdges);
      const provenance=buffer.toNonIndexed(),pColors=new Float32Array(provenance.getAttribute('position').count*3);
      const categories:Record<string,string>={'photo-estimated':'#9ba99f','generated-influenced':'#b9a2ed','authored-aesthetic-object':'#b9a2ed','authored-room-shell':'#ff922e','authored-door-cap':'#ff922e','authored-window-cap':'#ff922e'};
      geometry.provenance.forEach((tag,face)=>{const c=new THREE.Color(categories[tag]??'#b9a2ed');for(let j=0;j<3;j++)pColors.set([c.r,c.g,c.b],face*9+j*3);});
      provenance.setAttribute('color',new THREE.BufferAttribute(pColors,3));
      const evidence=new THREE.Mesh(provenance,material);scene.add(evidence);
      const render=()=>{if(!disposed)renderer.render(scene,camera);};
      changePointColors.current=value=>{
        const attribute=pointBuffer.getAttribute('color') as THREE.BufferAttribute;
        attribute.array.set(value?enhancedColors:samples.colors);attribute.needsUpdate=true;render();
      };
      changePointColors.current(enhancedRef.current);
      navigate.current=key=>{
        const offset=camera.position.clone().sub(controls.target),axis=new THREE.Vector3(0,0,1);
        if(key==='ArrowLeft'||key==='ArrowRight')offset.applyAxisAngle(axis,key==='ArrowLeft'?.12:-.12);
        else if(key==='ArrowUp'||key==='ArrowDown')offset.applyAxisAngle(new THREE.Vector3().crossVectors(offset,axis).normalize(),key==='ArrowUp'?.12:-.12);
        else if(key==='+'||key==='=')offset.multiplyScalar(.9);
        else if(key==='-')offset.multiplyScalar(1.1);
        else if(['w','a','s','d'].includes(key)){
          const direction=controls.target.clone().sub(camera.position).normalize();
          if(key==='a'||key==='d')direction.cross(camera.up).normalize().multiplyScalar(key==='a'?-1:1);
          else if(key==='s')direction.negate();
          direction.multiplyScalar(size*.025);camera.position.add(direction);controls.target.add(direction);
        }
        else if(key==='Home'){
          // Home restores the current candidate's default, including its up vector, after a preserved pose.
          if(initialCamera){camera.position.fromArray(initialCamera.position);camera.up.fromArray(initialCamera.up);controls.target.copy(camera.position).add(new THREE.Vector3().fromArray(initialCamera.forward).multiplyScalar(size*.2));offset.copy(camera.position).sub(controls.target);}
          else {camera.up.set(0,0,1);controls.target.copy(center);offset.set(size*.7,-size*.7,size*.6);}
        }
        camera.position.copy(controls.target).add(offset);controls.update();render();
      };
      const resize=()=>{if(disposed)return;const rect=element.getBoundingClientRect();renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/Math.max(1,rect.height);camera.updateProjectionMatrix();render();};
      let displayedMode=mode;
      change.current=value=>{
        displayedMode=value;
        const matrix=matrixStyleRef.current&&value==='points';
        mesh.visible=value==='surfaces';points.visible=value==='points'&&!matrix;
        // Full depth occlusion preserves complete object silhouettes behind the
        // sparse display marks; dithering never opens geometry to another room.
        pointDepth.visible=value==='points';
        matrixMesh.visible=matrix;matrixEdges.visible=matrix;
        edges.visible=value==='edges';evidence.visible=value==='provenance';
        scene.background=new THREE.Color(matrix?'#05080c':'#171b18');render();
      };
      changeStyle.current=()=>change.current(displayedMode);
      controls.addEventListener('change',render);controls.update();change.current(mode);
      const observer=new ResizeObserver(resize);observer.observe(element);resize();
      const lost=(e:Event)=>{e.preventDefault();if(!disposed)setError('Graphics interrupted. Reopen the candidate to recover.');};element.addEventListener('webglcontextlost',lost);
      dispose=()=>{disposed=true;saved.current={position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray()};observer.disconnect();controls.dispose();
        element.removeEventListener('webglcontextlost',lost);buffer.dispose();matrixBuffer.dispose();pointBuffer.dispose();provenance.dispose();edgeBuffer.dispose();material.dispose();pointMaterial.dispose();pointDepthMaterial.dispose();dotMask.dispose();edgeMaterial.dispose();matrixMaterial.dispose();matrixEdgeMaterial.dispose();renderer.dispose();change.current=()=>{};navigate.current=()=>{};changePointColors.current=()=>{};changeStyle.current=()=>{};};
    } catch(e){setError((e as Error).message);}
    return dispose;
  },[geometry,initialCamera,inferredStudy,cameraReset,reopen,samplingKey]);
  return <div className="candidate-view">
    {/* A lost WebGL context stays lost on its canvas; reopen replaces only the element. */}
    <canvas key={reopen} ref={canvas} tabIndex={0} aria-label="Reconstructed room candidate. Arrow keys orbit, W A S D move, plus and minus zoom, Home resets. Drag or pinch on touch."
      onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home','w','a','s','d'].includes(e.key)){e.preventDefault();navigate.current(e.key);}}}
      style={{width:'100%',height:450,display:'block',touchAction:'none'}}/>
    <div className="upload-actions" aria-label="Candidate representation">{['surfaces','points','edges','provenance'].map(value=><button key={value} aria-pressed={mode===value} className="secondary"
      onClick={()=>{setMode(value);change.current(value);}}>{value[0]!.toUpperCase()+value.slice(1)}</button>)}</div>
    {mode==='points'&&<><div className="upload-actions" role="group" aria-label="Point style">
      {[true,false].map(value=><button key={String(value)} className="secondary" aria-pressed={matrixStyle===value}
        onClick={()=>{setMatrixStyle(value);matrixStyleRef.current=value;changeStyle.current(value);}}>{value?'Paris matrix':'Uniform dots'}</button>)}
    </div>{matrixStyle&&<p className="upload-privacy">Paris-inspired ordered dithering, fine contours and black negative space. Filled marks show photo-derived estimates; hollow marks show inferred or generated geometry. This is a display treatment, not object completion.</p>}</>}
    {mode==='points'&&!matrixStyle&&<><div className="upload-actions" role="group" aria-label="Point color display">
      {[false,true].map(value=><button key={String(value)} className="secondary" aria-pressed={enhanced===value}
        onClick={()=>{setEnhanced(value);enhancedRef.current=value;changePointColors.current(value);}}>{value?'Enhanced contrast':inferredStudy?'Sampled palette':'Source colors'}</button>)}
    </div><p className="upload-privacy">{enhanced?'Point colors are brightened for visibility.':inferredStudy?'Points use the sampled photo palette with authored shading.':'Points use source colors.'} Surfaces and provenance are unchanged.</p></>}
    <p className="upload-privacy">{inferredStudy
      ?'Hollow dots mark inferred geometry throughout this authored study. In provenance view: lavender furniture, orange enclosure. No part is claimed as measured geometry.'
      :'Filled dots: photo-derived estimates. Hollow dots: inferred or generated geometry. Provenance colors: grey for estimates, lavender for generated contributions, orange for assumed closures.'} Drag to orbit, scroll or pinch to zoom.</p>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
