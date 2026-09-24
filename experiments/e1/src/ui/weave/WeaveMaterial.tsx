import { useEffect, useRef } from "react";
import type { E1Snapshot } from "../../core";
import { loadParticleEngine, readParticles, PARTICLE_STRIDE, type ParticleExports } from "./particleRuntime";

export function compositionCenter(snapshot: Readonly<E1Snapshot>) {
  const anchor=snapshot.anchors["12:00"];
  return anchor.userMoved?{x:anchor.x,y:anchor.y}:{x:.5,y:.38};
}
const modeOf=(s:Readonly<E1Snapshot>)=>s.status!=="ready"||!s.forecast?0:s.forecast.condition==="sunny"?1:2;
const MAX_WIDTH=1280, MAX_HEIGHT=720, FRAME_MS=1000/30;

/** Pure Rust/WASM particle state, bounded CPU-oriented Canvas2D drawing.
 * No source frames, image sampling, WebGL, WebGPU, native windows or shaders.
 */
export function WeaveMaterial({snapshot,onSettled,onFailure}: {
  snapshot:Readonly<E1Snapshot>;onSettled?:()=>void;onFailure?:(message:string)=>void;native?:boolean;
}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const live=useRef({snapshot,onSettled,onFailure});live.current={snapshot,onSettled,onFailure};
  const wake=useRef<()=>void>(()=>{});
  useEffect(()=>{
    const element=canvas.current;if(!element)return;
    const ctx=element.getContext("2d",{alpha:true,willReadFrequently:true});
    if(!ctx){live.current.onFailure?.("Canvas2D unavailable. Plain facts remain available.");return;}
    const abort=new AbortController();
    let engine:ParticleExports|null=null,disposed=false,failed=false,timer=0,raf=0;
    let generation=-1,draws=0,lastWall=performance.now(),clock=0,lastDraw=-Infinity,pointerUntil=0;
    let gazeX=0,gazeY=0,interval=FRAME_MS,slowFrames=0,lastCompletion=-1;
    const colors=new Map<number,string>();
    const halt=(message:string)=>{failed=true;clearTimeout(timer);cancelAnimationFrame(raf);live.current.onFailure?.(message);};
    const draw=(now:number)=>{
      raf=0;if(disposed||failed||!engine||document.hidden)return;
      const current=live.current.snapshot,mode=modeOf(current);
      const plain=current.plain&&mode!==0,paused=current.transition.status==="interrupted";
      const dt=Math.min(100,Math.max(0,now-lastWall));lastWall=now;
      if(!paused)clock+=dt;
      if(now-lastDraw<interval){schedule(interval-(now-lastDraw));return;}
      lastDraw=now;const started=performance.now();
      try{
        if(generation!==current.generation){
          generation=current.generation;
          engine.set_target(mode,generation,current.reducedMotion?1:0);
        }
        const width=Math.min(4096,Math.max(1,innerWidth)),height=Math.min(2160,Math.max(1,innerHeight));
        const scale=Math.min(1,MAX_WIDTH/width,MAX_HEIGHT/height);
        const w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
        if(element.width!==w||element.height!==h){element.width=w;element.height=h;}
        ctx.setTransform(scale,0,0,scale,0,0);
        const center=compositionCenter(current);
        engine.step(clock,width,height,center.x,center.y,gazeX,gazeY,paused?1:0);
        const points=readParticles(engine);
        const active=engine.transition_active()!==0;
        ctx.clearRect(0,0,width,height);
        let visible=0,droplets=0,ripples=0;
        if(!plain){
          if(mode===0&&!active){
            let left=width,top=height,right=0,bottom=0;
            for(let i=0;i<points.length;i+=PARTICLE_STRIDE){if(points[i+7]!==0||points[i+6]<.025)continue;const half=points[i+2]/2;
              left=Math.min(left,points[i]-half);top=Math.min(top,points[i+1]-half);right=Math.max(right,points[i]+half);bottom=Math.max(bottom,points[i+1]+half);}
            ctx.fillStyle="#030403";ctx.globalAlpha=1;if(right>left&&bottom>top)ctx.fillRect(left,top,right-left,bottom-top);
          }
          // The existing sunlight slot carries a simulation-timed envelope: Stop freezes it too.
          const sunlightSlot=7168*PARTICLE_STRIDE;
          if(mode===1&&!active&&points[sunlightSlot+6]>.001){
            const x=points[sunlightSlot],y=points[sunlightSlot+1],radius=190*Math.min(width/1088,height/608);
            const glow=ctx.createRadialGradient(x,y,radius*.2,x,y,radius);
            glow.addColorStop(0,"rgba(255,35,24,0.7)");glow.addColorStop(.55,"rgba(255,35,24,0.38)");glow.addColorStop(1,"rgba(255,35,24,0)");
            ctx.fillStyle=glow;ctx.globalAlpha=points[sunlightSlot+6];ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
          }
          for(let i=0;i<points.length;i+=PARTICLE_STRIDE){
            if(mode===1&&i===sunlightSlot)continue;
            const x=points[i],y=points[i+1],size=points[i+2],r=points[i+3],g=points[i+4],b=points[i+5],a=points[i+6],kind=points[i+7];
            if(!Number.isFinite(x+y+size+r+g+b+a+kind)||size<0||size>32||a<0||a>1)throw Error("Invalid particle state");
            if(a<.025||size===0||x+size<0||y+size<0||x>width||y>height)continue;
            const red=Math.round(Math.max(0,Math.min(1,r))*255),green=Math.round(Math.max(0,Math.min(1,g))*255),blue=Math.round(Math.max(0,Math.min(1,b))*255);
            const key=red*65536+green*256+blue;
            let color=colors.get(key);if(!color){color=`rgb(${red},${green},${blue})`;if(colors.size<256)colors.set(key,color);}
            ctx.fillStyle=color;ctx.globalAlpha=a;
            ctx.fillRect(Math.round(x-size/2),Math.round(y-size/2),size,size);
            visible++;if(kind===1)droplets++;if(kind===2)ripples++;
          }
        }
        ctx.globalAlpha=1;
        element.dataset.form=mode===0?"eye":mode===1?"sun":"rain";
        element.dataset.motion=paused||current.reducedMotion||plain?"settled":active?"transition":mode===2?"rain":mode===1?"rotation":"settled";
        element.dataset.drawCount=String(++draws);element.dataset.particleCount=String(points.length/PARTICLE_STRIDE);
        element.dataset.visibleCount=String(visible);element.dataset.droplets=String(droplets);element.dataset.ripples=String(ripples);
        element.dataset.memoryBytes=String(engine.memory.buffer.byteLength);element.dataset.frameMs=(performance.now()-started).toFixed(2);
        if(import.meta.env.DEV){
          (element as HTMLCanvasElement & {particleSnapshot?:()=>number[]}).particleSnapshot=()=>Array.from(readParticles(engine!));
        }
        if((!active||plain)&&current.transition.status==="active"&&lastCompletion!==generation){lastCompletion=generation;live.current.onSettled?.();}
        const duration=performance.now()-started;
        if(duration>24)interval=1000/15;
        slowFrames=duration>80?slowFrames+1:0;
        if(slowFrames>=3){halt("Particle animation stopped after exceeding its CPU frame budget. Facts remain available.");return;}
        if(!paused&&!plain&&!current.reducedMotion&&(active||mode===1||mode===2||now<pointerUntil))schedule(interval);
      }catch{halt("Particle renderer stopped: invalid state or resource budget. Facts remain available.");}
    };
    function schedule(delay=0){
      if(disposed||failed||!engine||document.hidden||raf||timer)return;
      timer=window.setTimeout(()=>{timer=0;raf=requestAnimationFrame(draw);},Math.max(0,delay));
    }
    wake.current=()=>schedule();
    const move=(event:PointerEvent)=>{
      gazeX=Math.max(-1,Math.min(1,(event.clientX-innerWidth*.5)/(innerWidth*.32)));
      gazeY=Math.max(-1,Math.min(1,(event.clientY-innerHeight*.4778)/(innerHeight*.28)));
      pointerUntil=performance.now()+700;schedule();
    };
    const visibility=()=>{clearTimeout(timer);timer=0;cancelAnimationFrame(raf);raf=0;lastWall=performance.now();if(!document.hidden)schedule();};
    const resize=()=>schedule();
    window.addEventListener("pointermove",move,{passive:true});window.addEventListener("resize",resize);document.addEventListener("visibilitychange",visibility);
    void loadParticleEngine(abort.signal).then(value=>{if(disposed)return;engine=value;schedule();})
      .catch(error=>{if(!disposed)halt(error instanceof Error?error.message:"Rust particle module unavailable.");});
    return()=>{disposed=true;abort.abort();clearTimeout(timer);cancelAnimationFrame(raf);wake.current=()=>{};engine=null;colors.clear();
      window.removeEventListener("pointermove",move);window.removeEventListener("resize",resize);document.removeEventListener("visibilitychange",visibility);};
  },[]);
  useEffect(()=>wake.current(),[snapshot]);
  return <canvas ref={canvas} className="weave-material" data-origin="rust-procedural-particles" aria-hidden="true" />;
}
