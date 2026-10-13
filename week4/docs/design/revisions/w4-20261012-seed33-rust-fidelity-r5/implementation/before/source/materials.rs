// Procedural material programs authored here in Rust's renderer source. No sampler,
// scene image, runtime-provided GLSL, or screen-space noise enters either program.
pub const VERTEX: &str = r#"#version 300 es
precision highp float;
layout(location=0) in vec3 position;
layout(location=1) in vec3 normal;
layout(location=2) in vec2 localCell;
layout(location=3) in vec4 material;
out vec3 vNormal;
out vec3 vPosition;
out vec2 vCell;
out vec4 vMaterial;
void main(){
  float nearZ=0.1, farZ=30.0;
  gl_Position=vec4(2.0*position.x,2.0*SCENE_ASPECT*position.y,
    (farZ+nearZ)/(farZ-nearZ)*position.z-2.0*farZ*nearZ/(farZ-nearZ),position.z);
  vNormal=normal;vPosition=position;vCell=localCell;vMaterial=material;
}
"#;
pub fn vertex_source() -> String {
    VERTEX.replace("SCENE_ASPECT", &crate::math::ASPECT.to_string())
}
pub const FRAGMENT: &str = r#"#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPosition;
in vec2 vCell;
in vec4 vMaterial;
out vec4 colour;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+vMaterial.w*0.113)*43758.5453);}
float dotPattern(vec2 uv,float radius){
  float dist=length(fract(uv)-0.5);
  float footprint=max(fwidth(uv.x),fwidth(uv.y));
  float aa=clamp(footprint*0.42,0.035,0.23);
  float dot=1.0-smoothstep(radius-aa,radius+aa,dist);
  // Integrate unresolved cells instead of turning distant beads into moire bands.
  return mix(dot,3.141593*radius*radius,smoothstep(0.8,1.8,footprint));
}
float field(vec2 p){
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),
    mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);
}
void main(){
  float m=vMaterial.x,detail=vMaterial.y,light=vMaterial.z;
  vec3 bone=vec3(1.0,0.875,0.715),voidTone=vec3(0.055,0.025,0.012);
  if(m<0.0){colour=vec4(bone*light*1.25,0.92);return;}
  if(m>5.5&&m<6.5){colour=vec4(vec3(0.988,0.89,0.826),1);return;}
  if(m>6.5&&m<10.5){
    vec3 pigment=m<7.5?vec3(0.80,0.46,0.34):m<8.5?vec3(0.80,0.60,0.37):vec3(0.97,0.85,0.68);
    float ink=1.0;
    if(m>8.5&&m<9.5) ink=mod(floor(vCell.x)+floor(vCell.y),2.0)<1.0?1.0:0.0;
    if(m>9.5) ink=dotPattern(vCell,0.26);
    colour=vec4(mix(voidTone,pigment,ink),1);return;
  }
  vec3 n=normalize(vNormal+vec3(0.00001));vec3 eye=normalize(-vPosition);
  float rim=pow(1.0-abs(dot(n,eye)),2.0);
  float soft=field(vCell*vec2(0.035,0.048));
  float illumination=0.25+0.45*abs(dot(n,normalize(vec3(-0.4,0.8,-0.6))))+0.7*rim;
  float bead=dotPattern(vCell,0.19+rim*0.10);
  float occupancy=0.62+0.38*hash(floor(vCell));
  float strand=1.0-smoothstep(0.035,0.10,abs(fract(vCell.x)-0.5));
  float pattern=bead*occupancy;
  vec3 base=bone*0.07*light;
  if(m<0.5){
    float columns=step(0.78,hash(vec2(floor(vCell.x),0)));
    pattern=max(dotPattern(vCell,0.23+rim*0.07)*occupancy*(0.38+0.50*soft),strand*columns*0.16);
    float key=exp(-pow((vPosition.z-7.4)/2.6,2.0));
    vec3 facing=dot(n,eye)<0.0?-n:n;
    float sun=max(dot(facing,normalize(vec3(0.65,0.75,-0.35))),0.0);
    illumination=(vPosition.x<0.0?0.20+4.2*key:0.09+0.50*key)*(0.24+0.76*sun);
    illumination*=0.76+0.36*soft;
    base=voidTone*(0.8+0.45*soft);
  }else if(m<1.5){
    pattern=dotPattern(vCell,0.28+rim*0.10)*occupancy;
    illumination=0.90+1.38*rim+0.16*soft;base=bone*(0.04+0.075*rim);
  }else if(m<2.5){
    pattern=dotPattern(vCell,0.24+rim*0.08)*occupancy;
    illumination=0.55+1.15*rim;base=vec3(0.085,0.042,0.019);
  }else if(m<3.5){
    pattern=max(pattern*(0.38+0.38*soft),strand*0.36);
    illumination=0.80;base=voidTone*1.7;
  }else if(m<4.5){
    float fold=0.74+0.26*soft;
    pattern=dotPattern(vCell,0.30+rim*0.035)*(0.84+0.16*hash(floor(vCell)))*fold;
    illumination=1.80+0.65*abs(dot(n,normalize(vec3(-0.4,0.8,-0.6))))+1.10*rim;
    base=bone*0.13*light;
  }else if(m<5.5){
    // Glass is a sparse opaque highlight lattice with actual holes, not sorted
    // translucent surfaces that would incorrectly write depth over later objects.
    float facet=pow(abs(sin(vCell.x*0.39)),12.0);
    float glass=dotPattern(vCell,0.20+rim*0.14)*(0.22+0.75*rim+facet*0.42);
    if(detail>0.1&&glass<0.16) discard;
    float gleam=0.60+rim*1.8+facet*0.34;
    colour=vec4(mix(voidTone,bone*gleam*light,detail),1);return;
  }else if(m>10.5){
    colour=vec4(voidTone+bone*pattern*light*detail*0.45,1);return;
  }
  float edgeLight=(m>0.5&&(m<2.5||m>3.5&&m<4.5))?pow(rim,1.6)*0.52:0.0;
  vec3 ink=voidTone+bone*(pattern*illumination*light*1.3+edgeLight*light);
  colour=vec4(mix(base,ink,detail),1);
}
"#;
