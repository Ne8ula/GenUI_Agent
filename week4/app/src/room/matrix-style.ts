import * as THREE from 'three';

export function createRoomMatrixGeometry(buffer:THREE.BufferGeometry,provenance:string[]) {
  const result=buffer.toNonIndexed();
  const count=result.getAttribute('position').count;
  if(provenance.length*3!==count) {result.dispose();throw Error('Missing face provenance.');}
  const shell=new Float32Array(count),inferred=new Float32Array(count);
  provenance.forEach((tag,face)=>{
    shell.fill(['authored-room-shell','authored-door-cap','authored-window-cap'].includes(tag)?1:0,face*3,face*3+3);
    inferred.fill(tag==='photo-estimated'?0:1,face*3,face*3+3);
  });
  result.setAttribute('roomShell',new THREE.BufferAttribute(shell,1));
  result.setAttribute('roomInferred',new THREE.BufferAttribute(inferred,1));
  return result;
}

/** Paris R18-inspired display treatment. Screen-cell thresholds follow the
 * retained render/patterns.ts Bayer order; geometry and source colors are inputs,
 * never rewritten. Static sampling means reduced motion needs no animation loop.
 */
export function createRoomMatrixMaterial(pixelRatio:number) {
  return new THREE.ShaderMaterial({
    side:THREE.DoubleSide,
    uniforms:{pixelRatio:{value:pixelRatio}},
    vertexShader:`
      attribute vec3 color;
      attribute float roomShell;
      attribute float roomInferred;
      varying vec3 ink;
      varying vec3 facingNormal;
      varying vec3 eyePosition;
      varying float shell;
      varying float inferred;
      void main(){
        vec4 eye=modelViewMatrix*vec4(position,1.0);
        eyePosition=eye.xyz;
        facingNormal=normalize(normalMatrix*normal);
        ink=color;
        shell=roomShell;
        inferred=roomInferred;
        gl_Position=projectionMatrix*eye;
      }`,
    fragmentShader:`
      uniform float pixelRatio;
      varying vec3 ink;
      varying vec3 facingNormal;
      varying vec3 eyePosition;
      varying float shell;
      varying float inferred;
      float bayer4(vec2 cell){
        vec2 p=mod(cell,4.0);
        vec2 low=mod(p,2.0);
        vec2 high=floor(p/2.0);
        return (mod(low.x+low.y,2.0)*8.0+low.y*4.0
          +mod(high.x+high.y,2.0)*2.0+high.y+0.5)/16.0;
      }
      void main(){
        vec2 pixel=gl_FragCoord.xy/pixelRatio;
        vec2 cell=floor(pixel/3.0);
        vec2 mark=fract(pixel/3.0)-0.5;
        float square=max(abs(mark.x),abs(mark.y));
        // Source estimates stay filled; inferred/generated faces are hollow.
        if(square>0.46||(inferred>0.5&&square<0.13))discard;
        vec3 n=normalize(facingNormal);
        float rim=pow(1.0-abs(dot(n,normalize(-eyePosition))),2.0);
        float luminance=dot(ink,vec3(0.2126,0.7152,0.0722));
        float coverage=mix(0.23+0.24*sqrt(luminance)+rim*0.24,
          0.012+0.025*luminance+rim*0.025,shell);
        float grain=fract(sin(dot(cell,vec2(12.9898,78.233)))*43758.5453);
        if(bayer4(cell)*0.8+grain*0.2>coverage)discard;
        // Keep photographed hue; contour lightness is display-only.
        vec3 tint=ink+vec3(max(0.0,0.16-luminance));
        tint=mix(tint,vec3(0.74,0.78,0.76),rim*0.48);
        tint*=mix(0.48,1.0,grain);
        gl_FragColor=vec4(tint,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
