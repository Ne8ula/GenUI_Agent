import { EYE_FRAGMENT_SHADER } from "../eye/eye.shader";

// Development-authored translation of Weave, never runtime-generated shader code.
// Steady weather bypasses the more expensive archived eye anatomy entirely.
const WEATHER_FUNCTION = `
vec4 drawWeather(vec2 wp,float threshold){
  vec2 s=wp-vec2(0.,.10);
  float radius=length(s),angle=atan(s.y,s.x);
  float disk=1.-smoothstep(.34,.35,radius);
  float rays=step(.945,cos(angle*12.))*smoothstep(.40,.43,radius)*(1.-smoothstep(.57,.61,radius));
  float sun=max(disk,rays);
  vec2 c=wp-vec2(-.16,.22);
  float cloud=min(min(length((c-vec2(-.30,-.015))*vec2(1.,1.25))-.18,
    length(c-vec2(-.11,.10))-.23),min(length(c-vec2(.13,.035))-.21,
    length((c-vec2(.0,-.08))*vec2(.62,1.))-.18));
  cloud=max(cloud,-c.y-.17);
  vec2 c2=(wp-vec2(.49,-.04))*1.85;
  float small=min(min(length(c2-vec2(-.15,0.))-.19,length(c2-vec2(.02,.10))-.22),length(c2-vec2(.22,-.02))-.18);
  float clouds=1.-smoothstep(-.01,.008,min(cloud,small/1.85));
  float rainX=floor(wp.x*28.);
  float stream=step(.72,fract(wp.x*28.));
  float streamTop=mix(.08,-.15,step(.37,wp.x));
  float separate=1.-step(.27,wp.x)*step(wp.x,.34);
  float rainBounds=step(-.60,wp.x)*step(wp.x,.70)*step(wp.y,streamTop)*step(-.55-.2*noise(vec2(rainX,7.)),wp.y)*separate;
  float drops=step(.62,fract(wp.y*9.+clock*1.6+noise(vec2(rainX,4.))*5.));
  float falling=rainBounds*stream*drops*(.4+.6*noise(vec2(rainX,2.)));
  float density=mix(sun,clouds,rain);
  float texture=.64+.30*field(wp*12.);
  float ink=step(threshold,density*texture);
  float fringe=mix(exp(-abs(radius-.35)*25.),exp(-abs(min(cloud,small/1.85))*45.),rain);
  ink=max(ink,step(threshold,fringe*.28));
  ink=max(ink,falling*rain);
  // Broken screen-aligned cell streaks, not a rectangular weather card.
  float row=noise(vec2(floor(wp.y*140.),6.));
  float reach=.20+noise(vec2(floor(wp.y*140.),9.))*.62;
  float streak=step(.945,row)*step(abs(wp.x),reach)*step(abs(wp.y-.12),.43)*step(.5,fract(wp.x*100.));
  ink=max(ink,streak*.65);
  return vec4(vec3(1.,.23,.20)*ink,ink);
}`;

export const WEATHER_FRAGMENT_SHADER = EYE_FRAGMENT_SHADER
  .replace("uniform vec2 resolution;", `uniform vec2 resolution;
  uniform vec2 center; uniform float weather; uniform float rain; uniform float clock;
  uniform float eyeHeight;`)
  .replace("void main(){", WEATHER_FUNCTION + "\nvoid main(){")
  .replace("float pixelSize=max(2.,floor(resolution.y/140.));", "float pixelSize=max(2.,floor(eyeHeight/140.));")
  .replace("p*=1.65;", `vec2 screen=(pixel+.5)*pixelSize;
  vec2 wp=(screen-center)/eyeHeight;
  if(weather>.999){
    if(abs(wp.x)>1.05 || abs(wp.y)>.9){gl_FragColor=vec4(0.);return;}
    float wt=(4.*bayer2(mod(pixel,2.))+bayer2(floor(mod(pixel,4.)/2.))+.5)/16.;
    gl_FragColor=drawWeather(wp,wt);return;
  }
  p=(screen-mix(vec2(resolution.x*.5,resolution.y*.52),center,weather))/eyeHeight;
  p.x/=1.-weather*.42;
  p.y/=1.+sin(weather*3.14159)*.40;
  vec2 frameCoord=p;
  if(weather<.001 && (abs(p.x)>1.064 || abs(p.y)>.5)){gl_FragColor=vec4(0.);return;}`)
  .replace("gl_FragColor=vec4(color*silhouette,silhouette);", `
  // K0's original local eye frame remains; undrawn desktop pixels have alpha 0.
  float frame=step(abs(frameCoord.x),1.064)*step(abs(frameCoord.y),.5);
  vec2 corner=abs(frameCoord)-vec2(1.004,.44);
  if(frameCoord.x*frameCoord.y<0.) frame*=1.-step(.06,length(max(corner,0.)));
  vec4 eye=vec4(color*frame,frame);
  gl_FragColor=mix(eye,drawWeather(wp,threshold),smoothstep(.05,.90,weather));
  `);
