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
  if(m>=20.0){
    bool figure=m>=100.0;
    if(figure) m-=100.0;
    vec2 px=vec2((vPosition.x/vPosition.z+0.5)*1672.0,(0.5-vPosition.y/vPosition.z*1.791667)*941.0);
    vec2 cell=floor(vCell), f=fract(vCell);
    float random=hash(cell), island=field(vCell*0.055);
    float density=clamp(detail-1.0,0.0,1.0), resolve=clamp(detail-3.0,0.0,1.0);
    float stipple=dotPattern(vCell,0.18+0.12*density);
    vec3 pigment=vec3(0.61,0.57,0.47);
    if(m<20.5) pigment=vec3(0.69,0.65,0.55);
    else if(m<21.5) pigment=vec3(0.18,0.205,0.14);
    else if(m<22.5) pigment=vec3(0.76,0.67,0.50);
    else if(m<23.5) pigment=vec3(0.95,0.66,0.32);
    else if(m<24.5) pigment=vec3(0.39,0.32,0.22);
    else if(m<25.5) pigment=vec3(0.045,0.048,0.039);
    else if(m<26.5) pigment=vec3(0.84,0.84,0.77);
    else if(m<27.5) pigment=vec3(0.59,0.48,0.36);
    else if(m<28.5) pigment=vec3(0.105,0.15,0.17);
    else if(m<29.5) pigment=vec3(0.20,0.30,0.68);
    else if(m<30.5) pigment=vec3(0.61,0.17,0.53);
    else pigment=vec3(0.80,0.81,0.77);
    if(detail>4.5){colour=vec4(pigment*light,1);return;}
    float keep=detail<1.0?detail*0.08:0.08+density*(0.27+0.62*island);
    if(detail<3.0){
      if(random>keep || island<0.25 || stipple<0.18) discard;
      colour=vec4(vec3(0.68+0.30*random)*stipple,1);return;
    }
    // Ghost fields are clusters of tiny symbols, not evenly filled rectangles.
    if(m>31.5&&m<32.5){
      float cluster=field(vCell*0.13+vec2(0,light*0.45));
      float glyph=max(step(abs(f.x-0.5),0.06)*step(abs(f.y-0.5),0.32),step(abs(f.y-0.5),0.05)*step(abs(f.x-0.5),0.28));
      if(light<=0.0 || random>0.84 || cluster<0.38 || max(stipple,glyph)<0.2) discard;
      vec3 fieldInk=cluster>0.72?vec3(0.18,0.31,0.72):cluster<0.41?vec3(0.61,0.18,0.54):vec3(0.80,0.82,0.77);
      colour=vec4(fieldInk*max(stipple,glyph)*0.85,1);return;
    }
    // Multi-scale material detail is analytically authored, without scene textures.
    float coarse=field(px*0.045), medium=field(px*0.19), fine=hash(floor(px*1.3));
    float wear=coarse*0.45+medium*0.35+fine*0.2;
    float surface=0.34+wear*0.88;
    vec3 n=normalize(vNormal+vec3(0.00001));
    vec3 facing=dot(n,normalize(-vPosition))<0.0?-n:n;
    float diffuse=max(dot(facing,normalize(vec3(-0.5,0.65,-0.6))),0.0);
    float shade=0.26+0.88*diffuse;
    float crevice=pow(1.0-field(px*vec2(0.6,0.09)),5.0);
    if(m<20.5){
      pigment*=0.66+0.4*coarse;
      surface=0.65+0.25*medium+0.1*fine;
    }else if((m>20.5&&m<21.5)||(m>23.5&&m<25.5)||(m>27.5&&m<28.5)){
      float grain=sin(vCell.x*5.4+field(vCell*vec2(0.35,0.08))*12.0);
      surface*=0.72+0.28*grain*grain;
      float scrape=step(0.91,fine)*step(0.52,medium)*step(0.58,coarse);
      pigment=mix(pigment,vec3(0.53,0.48,0.36),scrape*0.7);
      shade+=pow(max(dot(reflect(-normalize(vec3(-0.5,0.65,-0.6)),facing),normalize(-vPosition)),0.0),20.0)*0.35;
    }else if(m>25.5&&m<26.5){
      float fold=sin(vCell.x*0.8+field(vCell*0.07)*5.0+vCell.y*0.09);
      surface=0.68+0.25*fold+0.12*medium;
      surface*=0.91+0.09*fine;
    }else if(m>26.5&&m<27.5){ surface=0.88+0.1*medium; }
    if(m>22.5&&m<23.5){shade=0.65+0.5*medium;surface=0.55+0.45*coarse;}
    if(m>32.5){
      // Rounded, wet-sett stone fragments: edge relief, irregular grain and small highlights.
      pigment=mix(vec3(0.09,0.10,0.10),vec3(0.36,0.34,0.29),hash(vec2(vMaterial.w,0)));
      surface=0.62+0.30*medium+0.15*fine;
      shade=0.76+0.65*diffuse+0.35*step(0.975,fine)*step(0.5,medium);
    }
    vec3 ink=pigment*surface*shade*(1.0-crevice*0.3);
    float region=field(vCell*0.09+vec2(7,3));
    bool materialPatch=region<resolve*1.05;
    // All material islands persist; only a light overlay changes in idle.
    float glyph=max(step(abs(f.x-0.5),0.065)*step(abs(f.y-0.5),0.29),step(abs(f.y-0.5),0.055)*step(abs(f.x-0.5),0.26));
    float band=field(vCell*0.065+vec2(light*0.45,0));
    float overlay=light>0.0?step(0.72,band)*max(stipple*0.6,glyph*step(0.83,random)):0.0;
    vec3 accent=random>0.985?vec3(0.61,0.20,0.59):random>0.96?vec3(0.23,0.35,0.79):vec3(0.77,0.78,0.71);
    if(!materialPatch && (random>0.78 || stipple<0.22)) discard;
    if(figure){
      float garment=field(vCell*0.27);
      float cellInk=dotPattern(vCell*1.8,0.33);
      float broken=step(0.48,garment)*step(0.23,random);
      ink*=0.72+0.38*hash(floor(vCell*2.8));
      if(broken>0.5){
        if(cellInk<0.22) discard;
        ink=mix(ink,vec3(0.85,0.86,0.81)*cellInk,m>25.5&&m<26.5?0.75:0.33);
      }
    }
    if(m>30.5&&m<31.5) ink=vec3(0.87,0.88,0.83);
    colour=vec4(materialPatch?mix(ink,accent,overlay*0.75):accent*stipple*0.8,1);return;
  }
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
    float columns=step(0.88,hash(vec2(floor(vCell.x*0.35),0)));
    vec2 masonry=vCell*vec2(0.72,0.78)+vec2(0.22*sin(vCell.y*0.17),0.0);
    pattern=max(dotPattern(masonry,0.19+rim*0.045)*occupancy*(0.20+0.48*soft),strand*columns*0.09);
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
    float fold=0.56+0.44*soft;
    vec2 weave=vCell*vec2(0.85,0.70)+vec2(0.18*sin(vCell.y*0.35),0.0);
    pattern=dotPattern(weave,0.25+rim*0.045)*(0.76+0.24*hash(floor(weave)))*fold;
    illumination=1.65+0.65*abs(dot(n,normalize(vec3(-0.4,0.8,-0.6))))+1.10*rim;
    base=bone*0.13*light;
  }else if(m<5.5){
    // Glass is a sparse opaque highlight lattice with actual holes, not sorted
    // translucent surfaces that would incorrectly write depth over later objects.
    float facet=pow(abs(sin(vCell.x*0.39)),12.0);
    float glass=dotPattern(vCell,0.20+rim*0.14)*(0.22+0.75*rim+facet*0.42);
    if(detail>0.1&&glass<0.16) discard;
    float gleam=0.60+rim*1.8+facet*0.34;
    colour=vec4(mix(voidTone,bone*gleam*light,detail),1);return;
  }else if(m>12.5){
    // Authored dark glazing, not reflected scene pixels or transparency sorting.
    float band=pow(max(sin(vCell.x*0.37+soft*0.6),0.0),18.0);
    float reflection=band*(0.10+0.30*rim)*dotPattern(vCell,0.20);
    colour=vec4(voidTone*0.72+bone*reflection*light*detail,1);return;
  }else if(m>11.5){
    // Stone relief shares the facade key but not its all-over bead density.
    vec3 facing=dot(n,eye)<0.0?-n:n;
    float sun=max(dot(facing,normalize(vec3(0.65,0.75,-0.35))),0.0);
    float key=exp(-pow((vPosition.z-7.4)/2.6,2.0));
    illumination=(vPosition.x<0.0?0.24+3.8*key:0.15+0.68*key)*(0.24+0.76*sun);
    pattern=(0.045+dotPattern(vCell*vec2(0.74,0.81),0.18)*0.38)*(0.65+0.35*soft);
    base=voidTone*(1.0+0.35*soft);
  }else if(m>10.5){
    colour=vec4(voidTone+bone*pattern*light*detail*0.45,1);return;
  }
  float edgeLight=(m>0.5&&(m<2.5||m>3.5&&m<4.5))?pow(rim,1.6)*0.52:0.0;
  vec3 ink=voidTone+bone*(pattern*illumination*light*1.3+edgeLight*light);
  colour=vec4(mix(base,ink,detail),1);
}
"#;
