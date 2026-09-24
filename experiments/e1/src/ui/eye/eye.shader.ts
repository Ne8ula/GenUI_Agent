// Provenance: procedural eye geometry copied from
// week1/apps/desktop/src/SignalEye.tsx (repository HEAD 23e0450e..., week1/
// archive left unchanged). Owner-authorized reuse inside E1; no external assets
// and no new license assertion.
//
// E1 changes versus the source shader:
// - The source fragment shader always wrote `gl_FragColor = vec4(color, 1.)`,
//   filling the whole quad opaquely (paired with a WebGL `alpha:false`
//   context and an opaque CSS background on the host element). That combination
//   is exactly the "rectangle/dark wallpaper" this bounded rewrite must avoid.
// - This version adds a procedural silhouette alpha mask built from the same
//   lid/brow/lash quantities the shader already computes (`arch`, `brow`,
//   `upper`, `lower`, `bottom`, `span`), so pixels outside the eye/brow/lash
//   silhouette are exactly alpha 0 and pixels inside keep the original
//   square-pupil/iris/red-dither contrast. The output is premultiplied
//   (`color * silhouette`) to composite correctly on an `alpha:true` /
//   `premultipliedAlpha:true` WebGL context without edge fringing.
// - A uniform framing scale leaves transparent breathing room around the
//   silhouette; the eye's internal geometry, color and dither math are retained.

export const EYE_VERTEX_SHADER = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`;

// Reviewed local shader: no assets, network, model-supplied code, or privileged input.
export const EYE_FRAGMENT_SHADER = `precision highp float;
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
  p*=1.65;
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
  // E1 transparency: a procedural silhouette mask built from the same lid/brow
  // quantities above (arch, brow, upper, lower, bottom, span) rather than a
  // fixed rectangle. Outside the eye/brow/lash silhouette alpha is exactly 0;
  // the horizontal falloff reuses 'span' so the mask always tapers to 0 at
  // the same soft edge the lid geometry already uses.
  float browTop=brow+.135+.05*arch;
  float lashLow=min(bottom,lower)-.135-.05*arch;
  float vMask=smoothstep(lashLow-.05,lashLow,p.y)*(1.-smoothstep(browTop,browTop+.05,p.y));
  float silhouette=clamp(vMask*span,0.,1.);
  gl_FragColor=vec4(color*silhouette,silhouette);
}`;
