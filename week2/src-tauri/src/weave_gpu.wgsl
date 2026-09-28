// Authored WGSL port of the archived Week 1 SignalEye, plus a source-texture pass.
// No runtime code generation, remote textures, desktop content, or model input.
struct Uniforms {
  viewport: vec4f, // width, height, time, closure
  gaze: vec4f, // eyeball x/y, orbital tissue x/y
  placement: vec4f, // image offset x/y, source aspect, reduced motion
  mode: vec4f, // 0 eye, 1 source artwork, 2 clear
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var artwork: texture_2d<f32>;
@group(0) @binding(2) var ink_sampler: sampler;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
  let p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));
  return vec4f(p[i],0.,1.);
}
fn noise(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn band(d:f32,w:f32)->f32{return exp(-d*d/(w*w));}
fn field(p:vec2f)->f32{let i=floor(p);var f=fract(p);f=f*f*(3.-2.*f);return mix(mix(noise(i),noise(i+vec2f(1.,0.)),f.x),mix(noise(i+vec2f(0.,1.)),noise(i+1.),f.x),f.y);}
fn segment(p:vec2f,a:vec2f,b:vec2f)->f32{let v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
fn modulo(v:vec2f,n:f32)->vec2f{return v-floor(v/n)*n;}
fn bayer2(p:vec2f)->f32{let v=2.*p.x+3.*p.y;return v-floor(v/4.)*4.;}
@fragment fn fs(@builtin(position) position:vec4f)->@location(0) vec4f {
  let size=u.viewport.xy;
  if(u.mode.x>1.5){return vec4f(0.);}
  let aspect=select(2000./1126.,u.placement.z,u.mode.x>.5);
  let fit=vec2f(min(size.x,size.y*aspect),min(size.y,size.x/aspect));
  let origin=(size-fit)*.5;
  if(u.mode.x>.5){
    let scale=select(1.,u.mode.y,u.mode.y>0.);
    let pivot=vec2f(.5,537./1126.);
    let uv=((position.xy-origin-u.placement.xy)/fit-pivot)/scale+pivot;
    if(any(uv<vec2f(0.))||any(uv>vec2f(1.))){return vec4f(0.);}
    let tex=textureSampleLevel(artwork,ink_sampler,uv,0.);
    return vec4f(tex.rgb*tex.a,tex.a);
  }
  let eye_size=fit*vec2f(.5,470./1126.)*.6;
  let eye_center=origin+fit*vec2f(.5,537./1126.);
  let eye_origin=eye_center-eye_size*.5;
  let local=position.xy-eye_origin;
  if(any(local<vec2f(0.))||any(local>eye_size)){return vec4f(0.);}
  let corner_radius=eye_size.y*.06;
  var corner=vec2f(0.);
  if(local.x<corner_radius && local.y<corner_radius){corner=local-vec2f(corner_radius);}
  if(local.x>eye_size.x-corner_radius && local.y>eye_size.y-corner_radius){corner=local-(eye_size-vec2f(corner_radius));}
  if(length(corner)>corner_radius){return vec4f(0.);}
  let pixel_size=max(2.,floor(eye_size.y/140.));
  let pixel=floor(vec2f(local.x,eye_size.y-local.y)/pixel_size);
  var p=((pixel+.5)*pixel_size-.5*eye_size)/eye_size.y;
  let time=u.viewport.z;
  let reduced=u.placement.w>.5;
  let tissue=u.gaze.zw;
  let breath=select(sin(time*1.13)*.65+sin(time*.47)*.35,0.,reduced);
  let roll=tissue.x*.32+select(sin(time*.43)*.008,0.,reduced);
  p-=tissue*vec2f(.52,.58)+vec2f(0.,breath*.009);
  p=mat2x2f(cos(roll),-sin(roll),sin(roll),cos(roll))*p;
  p.x/=1.+abs(tissue.x)*.24;
  p.y/=1.+breath*.028;
  p.y-=tissue.y*.3*exp(-p.x*p.x*2.8);
  p.y+=p.x*.075;
  let aperture=select(1.-u.viewport.w,1.,reduced);
  let t=clamp((p.x+.77)/1.5,0.,1.);
  let arch=max(0.,sin(t*3.14159));
  let lid_lift=tissue.y*.8+breath*.014;
  let lower_lift=tissue.y*.38+breath*.007;
  let upper=.32*pow(arch,.88)*(1.19-.42*t)+(.007*sin(t*17.)+lid_lift)*arch;
  let lower=-.22*pow(arch,1.15)*(.72+.38*t)+lower_lift*arch;
  let top=mix(lower*.55,upper,aperture);
  let bottom=lower*(.55+.45*aperture);
  let edge=min(top-p.y,p.y-bottom);
  let span=smoothstep(-.78,-.745,p.x)*(1.-smoothstep(.71,.745,p.x));
  let inside=smoothstep(-.002,.007,edge)*span;
  let pores=field(p*135.)*.55+field(p*310.)*.45;
  var skin=.34+.14*field(p*5.)+.035*(pores-.5);
  skin+=.23*band(p.y-bottom+.11,.15)*arch;
  skin-=.35*band(p.y-top-.055,.09)*arch;
  skin-=.19*band(p.y-upper-.10-.035*sin(t*3.),.014+.006*field(p*30.))*arch;
  skin+=.11*band(p.y-upper-.175,.046)*arch;
  skin-=.075*band(p.y-lower+.08,.01)*arch;
  let brow=.44+.06*sin(t*3.3)-.05*t+tissue.y*.55+breath*.012;
  skin-=.24*band(p.y-brow,.065)*smoothstep(.05,.2,t)*(1.-smoothstep(.7,.99,t));
  skin-=.075*band(p.y-brow,.08)*pow(max(0.,sin(p.x*190.+p.y*48.)),7.);
  var sclera=.86-.28*pow(abs(p.x)/.8,2.);
  sclera-=.38*band(p.y-top,.08)+.1*band(p.y-bottom,.035);
  let g=u.gaze.xy;
  var q=p-g*.78-vec2f(-.055,.125);
  q.x*=1.+abs(g.x)*.4;
  let r=length(q);let a=atan2(q.y,q.x);
  let iris_radius=.278+.002*sin(a*37.)+.002*sin(a*59.);
  let iris_mask=1.-smoothstep(iris_radius-.003,iris_radius+.004,r);
  var fibers=field(vec2f(a*61.+sin(r*26.)*.7,r*70.));
  fibers+=.2*sin(a*197.-r*46.)+.15*field(vec2f(a*39.,r*120.));
  var iris=.16+.28*fibers+.12*band(r-.16,.055);
  iris-=.14*band(r-.265,.016);
  iris-=.12*band(r-.119-.012*sin(a*19.),.012);
  iris-=.33*band(p.y-top,.105);
  var value=mix(sclera,iris,iris_mask);
  let pupil_box=abs(q)-vec2f(.105,.103);
  let square=length(max(pupil_box,vec2f(0.)))+min(max(pupil_box.x,pupil_box.y),0.);
  value=mix(value,.014,1.-smoothstep(-.003,.003,square));
  var reflection=band(length((q-vec2f(-.072,.055))*vec2f(1.,1.8)),.029);
  reflection+=.4*band(length(q-vec2f(.058,-.068)),.012);
  value+=reflection*.85*iris_mask;
  let duct=exp(-pow((p.x+.705)/.06,2.)-pow((p.y+.015)/.037,2.));
  value=mix(value,.32,duct);
  value+=.21*band(p.y-bottom-.006,.007)*arch;
  var luminance=mix(skin,value,inside);
  luminance-=.34*band(p.y-top,.013)*span;
  luminance-=.09*band(p.y-bottom,.006)*span;
  for(var i=0;i<34;i++){
    let jitter=noise(vec2f(f32(i),7.));
    let v=(f32(i)+1.+jitter*.5)/36.;let x=-.77+v*1.5;
    var h=pow(sin(v*3.14159),.88)*.32*(1.19-.42*v)+(.007*sin(v*17.)+lid_lift)*sin(v*3.14159);
    let lo=-.22*pow(sin(v*3.14159),1.15)*(.72+.38*v)+lower_lift*sin(v*3.14159);
    h=mix(lo*.55,h,aperture);
    let root=vec2f(x,h);let mid=root+vec2f((v-.45)*.055,.018+jitter*.012);
    let tip=root+vec2f((v-.45)*(.07+jitter*.08),.032+jitter*.039);
    luminance-=.28*(1.-smoothstep(.0004,.0028,min(segment(p,root,mid),segment(p,mid,tip))));
  }
  luminance=clamp((luminance-.14)*1.48+(noise(pixel)-.5)*.08,0.,1.);
  let threshold=(4.*bayer2(modulo(pixel,2.))+bayer2(floor(modulo(pixel,4.)/2.))+.5)/16.;
  luminance=mix(luminance,step(threshold,luminance),.94);
  var color=mix(vec3f(.012,.014,.013),vec3f(1.,.23,.20),luminance);
  color*=1.-.33*smoothstep(.7,1.4,length(p*vec2f(.75,1.)));
  return vec4f(color,1.);
}
