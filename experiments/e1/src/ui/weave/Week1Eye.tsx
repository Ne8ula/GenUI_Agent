// E1-only copy of the original Week 1 eye. Geometry, cursor easing, tissue and blink timings are unchanged.
import { useEffect, useRef, useState, type RefObject } from "react";
export type EyeState = "opening" | "ready" | "listening" | "transcribing" | "assembling" | "error" | "closing";

const vertex = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;
// Reviewed local shader: no assets, network, model-supplied code, or privileged input.
const fragment = `precision highp float;
uniform vec2 resolution; uniform float time; uniform float age; uniform float state; uniform float energy; uniform float reduced; uniform vec2 gaze; uniform vec2 tissue; uniform float closure;
float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float band(float distance,float width){return exp(-distance*distance/(width*width));}
float field(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(noise(i),noise(i+vec2(1.,0.)),f.x),mix(noise(i+vec2(0.,1.)),noise(i+1.),f.x),f.y);}
float segment(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
float bayer2(vec2 p){return mod(2.*p.x+3.*p.y,4.);}
void main(){
  float pixelSize=max(2.,floor(resolution.y/140.));
  vec2 pixel=floor(gl_FragCoord.xy/pixelSize);
  vec2 p=((pixel+.5)*pixelSize-.5*resolution)/resolution.y;
  // Orbital tissue follows the faster eyeball with weight, rotation and a soft stretch.
  float breath=reduced>.5?0.:sin(time*1.13)*.65+sin(time*.47)*.35;
  float roll=tissue.x*.32+(reduced>.5?0.:sin(time*.43)*.008);
  p-=tissue*vec2(.52,.58)+vec2(0.,breath*.009);
  p=mat2(cos(roll),-sin(roll),sin(roll),cos(roll))*p;
  p.x/=1.+abs(tissue.x)*.24;
  p.y/=1.+breath*.028;
  p.y-=tissue.y*.3*exp(-p.x*p.x*2.8);
  p.y+=p.x*.075;
  float blink=1.-closure;
  float open=state<.5?smoothstep(0.,.5,age):1.;
  if(reduced>.5){blink=1.;open=1.;}
  if(state>5.5)open=1.-smoothstep(0.,.19,age);
  float t=clamp((p.x+.77)/1.5,0.,1.);
  float arch=max(0.,sin(t*3.14159));
  float lidLift=tissue.y*.8+breath*.014+energy*.012;
  float lowerLift=tissue.y*.38+breath*.007;
  float upper=.32*pow(arch,.88)*(1.19-.42*t)+(.007*sin(t*17.)+lidLift)*arch;
  float lower=-.22*pow(arch,1.15)*(.72+.38*t)+lowerLift*arch;
  float aperture=blink*open;
  float top=mix(lower*.55,upper,aperture);
  float bottom=lower*(.55+.45*aperture);
  float edge=min(top-p.y,p.y-bottom);
  float span=smoothstep(-.78,-.745,p.x)*(1.-smoothstep(.71,.745,p.x));
  float inside=smoothstep(-.002,.007,edge)*span;
  float pores=field(p*135.)*.55+field(p*310.)*.45;
  float skin=.34+.14*field(p*5.)+.035*(pores-.5);
  skin+=.23*band(p.y-bottom+.11,.15)*arch;
  skin-=.35*band(p.y-top-.055,.09)*arch;
  skin-=.19*band(p.y-upper-.10-.035*sin(t*3.),.014+.006*field(p*30.))*arch;
  skin+=.11*band(p.y-upper-.175,.046)*arch;
  skin-=.075*band(p.y-lower+.08,.01)*arch;
  // Socket and eyebrow soften into the surrounding face, rather than a floating ring.
  float brow=.44+.06*sin(t*3.3)-.05*t+tissue.y*.55+breath*.012;
  skin-=.24*band(p.y-brow,.065)*smoothstep(.05,.2,t)*(1.-smoothstep(.7,.99,t));
  skin-=.075*band(p.y-brow,.08)*pow(max(0.,sin(p.x*190.+p.y*48.)),7.);
  float sclera=.86-.28*pow(abs(p.x)/.8,2.);
  sclera-=.38*band(p.y-top,.08)+.1*band(p.y-bottom,.035);
  vec2 g=gaze;
  vec2 q=p-g*.78-vec2(-.055,.125);
  q.x*=1.+abs(g.x)*.4;
  float r=length(q),a=atan(q.y,q.x);
  float irisRadius=.278+.002*sin(a*37.)+.002*sin(a*59.);
  float irisMask=1.-smoothstep(irisRadius-.003,irisRadius+.004,r);
  float fibers=field(vec2(a*61.+sin(r*26.)*.7,r*70.));
  fibers+=.2*sin(a*197.-r*46.)+.15*field(vec2(a*39.,r*120.));
  float iris=.16+.28*fibers+.12*band(r-.16,.055);
  iris-=.14*band(r-.265,.016);
  iris-=.12*band(r-.119-.012*sin(a*19.),.012);
  iris-=.33*band(p.y-top,.105);
  float value=mix(sclera,iris,irisMask);
  vec2 pupilBox=abs(q)-vec2(.105+energy*.016,.103+energy*.016);
  float square=length(max(pupilBox,0.))+min(max(pupilBox.x,pupilBox.y),0.);
  float pupil=1.-smoothstep(-.003,.003,square);
  value=mix(value,.014,pupil);
  float reflection=band(length((q-vec2(-.072,.055))*vec2(1.,1.8)),.029);
  reflection+=.4*band(length(q-vec2(.058,-.068)),.012);
  value+=reflection*.85*irisMask;
  // The medial corner and wet lower margin are deliberately asymmetric.
  float duct=exp(-pow((p.x+.705)/.06,2.)-pow((p.y+.015)/.037,2.));
  value=mix(value,.32,duct);
  value+=.21*band(p.y-bottom-.006,.007)*arch;
  float luminance=mix(skin,value,inside);
  luminance-=.34*band(p.y-top,.013)*span;
  luminance-=.09*band(p.y-bottom,.006)*span;
  // Curving, tapered lashes follow the upper lid. Lower lashes stay sparse.
  for(int i=0;i<34;i++){
    float jitter=noise(vec2(float(i),7.));
    float u=(float(i)+1.+jitter*.5)/36.;float x=-.77+u*1.5;
    float h=pow(sin(u*3.14159),.88)*.32*(1.19-.42*u)+(.007*sin(u*17.)+lidLift)*sin(u*3.14159);
    float lo=-.22*pow(sin(u*3.14159),1.15)*(.72+.38*u)+lowerLift*sin(u*3.14159);
    h=mix(lo*.55,h,aperture);
    vec2 root=vec2(x,h),mid=root+vec2((u-.45)*.055,.018+jitter*.012);
    vec2 tip=root+vec2((u-.45)*(.07+jitter*.08),.032+jitter*.039);
    float lash=min(segment(p,root,mid),segment(p,mid,tip));
    luminance-=.28*(1.-smoothstep(.0004,.0028,lash));
  }
  float grain=noise(pixel)-.5;
  luminance=clamp((luminance-.14)*1.48+grain*.08,0.,1.);
  // Coarse, stationary 4x4 ordered dithering: binary ink rather than smooth cartoon shading.
  float threshold=(4.*bayer2(mod(pixel,2.))+bayer2(floor(mod(pixel,4.)/2.))+.5)/16.;
  luminance=mix(luminance,step(threshold,luminance),.94);
  vec3 phosphor=vec3(1.,.23,.20);
  vec3 color=mix(vec3(.012,.014,.013),phosphor,luminance);
  color*=1.-.33*smoothstep(.7,1.4,length(p*vec2(.75,1.)));
  gl_FragColor=vec4(color,1.);
}`;
const states: Record<EyeState, number> = { opening: 0, ready: 1, listening: 2, transcribing: 3, assembling: 4, error: 5, closing: 6 };

export function Week1Eye({ state, quiet, energy }: { state: EyeState; quiet: boolean; energy: RefObject<number> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ state, quiet, energy }); live.current = { state, quiet, energy };
  const pointer = useRef({ x: 0, y: 0 });
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const element = canvas.current!;
    const gl = element.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "high-performance" });
    if (!gl) { setFallback(true); return; }
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!; gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error("Eye shader unavailable"); }
      return shader;
    };
    let program: WebGLProgram, vs: WebGLShader, fs: WebGLShader;
    try {
      vs = compile(gl.VERTEX_SHADER, vertex); fs = compile(gl.FRAGMENT_SHADER, fragment);
      program = gl.createProgram()!; gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Eye program unavailable");
    } catch { setFallback(true); return; }
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const loc = Object.fromEntries(["resolution", "time", "age", "state", "energy", "reduced", "gaze", "tissue", "closure"].map(name => [name, gl.getUniformLocation(program, name)]));
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, visible = true, lost = false, lastFrame = -100, start = performance.now(), lastState = live.current.state, changed = start, x = 0, y = 0, renderedStatic = false, pointerActive = false;
    let tissueX = 0, tissueY = 0, blinkStart = -10000, nextBlink = start+2700, blinkIndex = 0;
    const ease = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t*t*(3-2*t); };
    const track = (event: globalThis.PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const clamp = (v: number) => Math.max(-1, Math.min(1, v));
      pointer.current = { x: clamp((event.clientX-rect.left-rect.width/2)/(innerWidth*.32))*.145, y: -clamp((event.clientY-rect.top-rect.height/2)/(innerHeight*.28))*.075 };
      pointerActive = true;
    };
    const rest = () => { pointerActive = false; pointer.current = { x: 0, y: 0 }; };
    const leave = (event: globalThis.PointerEvent) => { if (!event.relatedTarget) rest(); };
    window.addEventListener("pointermove", track, { passive: true }); window.addEventListener("pointerout", leave); window.addEventListener("blur", rest);
    const draw = (now: number) => {
      raf = 0;
      if (lost || document.hidden || !visible) return;
      const props = live.current;
      if (lastState !== props.state) { changed = now; lastState = props.state; renderedStatic = false; }
      const still = motion.matches || props.quiet;
      if (still && renderedStatic) return;
      if (now - lastFrame < 1000 / 45) { raf = requestAnimationFrame(draw); return; }
      const delta = Math.min(100, now-lastFrame); lastFrame = now;
      const width = Math.max(1, Math.round(element.clientWidth * Math.min(devicePixelRatio, 1.5)));
      const height = Math.max(1, Math.round(element.clientHeight * Math.min(devicePixelRatio, 1.5)));
      if (element.width !== width || element.height !== height) { element.width = width; element.height = height; gl.viewport(0, 0, width, height); }
      const t = (now - start) / 1000;
      const drift = Math.sin(t*.51)*Math.sin(t*.29);
      const follow = 1-Math.exp(-delta/40);
      x += (pointer.current.x + (pointerActive ? 0 : drift*.05) - x)*follow;
      y += (pointer.current.y + (pointerActive ? 0 : Math.sin(t*.37)*.022) - y)*follow;
      const weight = 1-Math.exp(-delta/145);
      tissueX += (x-tissueX)*weight; tissueY += (y-tissueY)*weight;
      if (now >= nextBlink) { blinkStart=now; nextBlink=now+4400+Math.sin(++blinkIndex*2.17)*1200; }
      const blinkAge=now-blinkStart;
      const lidClosure=blinkAge<90?ease(blinkAge/90):blinkAge<125?1:1-ease((blinkAge-125)/175);
      gl.uniform2f(loc.resolution, width, height); gl.uniform1f(loc.time, still ? 2 : t + 1.5);
      gl.uniform1f(loc.age, (now-changed)/1000); gl.uniform1f(loc.state, states[props.state]); gl.uniform1f(loc.energy, still ? 0 : props.energy.current);
      gl.uniform1f(loc.reduced, still ? 1 : 0); gl.uniform2f(loc.gaze, still ? 0 : x, still ? 0 : y);
      gl.uniform2f(loc.tissue, still ? 0 : tissueX, still ? 0 : tissueY); gl.uniform1f(loc.closure, still ? 0 : lidClosure);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      element.dataset.renderer = "webgl";
      renderedStatic = still;
      if (!still) raf = requestAnimationFrame(draw);
    };
    const wake = () => { renderedStatic = false; if (!raf) raf = requestAnimationFrame(draw); };
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) wake(); else cancelAnimationFrame(raf); raf = visible ? raf : 0; }); observer.observe(element);
    const resize = new ResizeObserver(wake); resize.observe(element);
    const loss = (event: Event) => { event.preventDefault(); lost = true; cancelAnimationFrame(raf); setFallback(true); };
    element.addEventListener("webglcontextlost", loss);
    document.addEventListener("visibilitychange", wake); motion.addEventListener("change", wake);
    // Props are small bounded state changes; this timer wakes static mode only when necessary.
    let previousQuiet = live.current.quiet;
    const updates = window.setInterval(() => { if (lastState !== live.current.state || previousQuiet !== live.current.quiet) { previousQuiet = live.current.quiet; wake(); } }, 80);
    wake();
    return () => { cancelAnimationFrame(raf); clearInterval(updates); observer.disconnect(); resize.disconnect(); window.removeEventListener("pointermove", track); window.removeEventListener("pointerout", leave); window.removeEventListener("blur", rest); element.removeEventListener("webglcontextlost", loss); document.removeEventListener("visibilitychange", wake); motion.removeEventListener("change", wake); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs); };
  }, []);
  return <div className={"signal-eye " + (fallback ? "static-eye" : "")} data-eye-state={state}>
    <canvas ref={canvas} aria-hidden="true" />
    {fallback && <svg viewBox="0 0 500 240" aria-hidden="true"><defs><radialGradient id="eye-iris"><stop stopColor="#ff7770"/><stop offset=".75" stopColor="#74211f"/><stop offset="1" stopColor="#1a0d0d"/></radialGradient><clipPath id="eye-aperture"><path d="M40 136C146 4 333 35 466 118C350 229 152 224 40 136"/></clipPath></defs><path d="M36 112C146 -8 350 15 473 97" fill="none" stroke="#782b26" strokeWidth="8"/><path d="M40 136C146 4 333 35 466 118C350 229 152 224 40 136" fill="#ff6259"/><g clipPath="url(#eye-aperture)"><circle cx="238" cy="112" r="75" fill="url(#eye-iris)"/><rect x="208" y="82" width="60" height="60" rx="2" fill="#090b0a"/><ellipse cx="216" cy="86" rx="9" ry="5" fill="#ffceca"/></g><path d="M40 136C146 4 333 35 466 118" stroke="#080909" strokeWidth="12" fill="none"/></svg>}
  </div>;
}
