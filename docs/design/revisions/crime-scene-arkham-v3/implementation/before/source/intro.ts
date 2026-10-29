import * as THREE from 'three';
import type { SceneData } from './state.ts';
// Loading sequence: each source photo is scanned, edge-traced, shown with its estimated depth,
// lifted into relief and dispersed while the measured scan is revealed floor-up behind it.
export const SLOT = 1.15, ASSEMBLE = 2.5;
export function introPhotos(data: SceneData) {
  return [...new Set(data.evidence.flatMap(item => item.photos))].filter(name => /^IMG_20240306_\d{6}\.jpg$/.test(name));
}
// Carousel position and per-photo stage (0-1 while analysed) at continuous photo index f.
export function introFrame(f: number, count: number) {
  const current = Math.floor(f), slide = THREE.MathUtils.smoothstep(f - current, .78, 1);
  const reveal = f < count ? Math.max(0, f) / count * .8 : .8 + .2 * Math.min(1, (f - count) * SLOT / ASSEMBLE);
  return { reveal, photos: Array.from({ length: count }, (_, i) => ({ offset: i - current - slide, stage: f - i })) };
}
const vertexShader = `uniform sampler2D photo, depthMap; uniform float stage, width, height, cell, halfHeight; uniform vec2 texel;
  attribute vec2 grid; varying vec3 tone; varying float alpha;
  float lum(vec2 uv){ return dot(texture2D(photo,uv).rgb,vec3(.299,.587,.114)); }
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  void main(){
    vec2 uv=vec2(grid.x,1.-grid.y); float d=texture2D(depthMap,uv).r; vec3 col=texture2D(photo,uv).rgb;
    float edge=clamp(length(vec2(lum(uv+vec2(texel.x,0.))-lum(uv-vec2(texel.x,0.)),lum(uv+vec2(0.,texel.y))-lum(uv-vec2(0.,texel.y))))*4.,0.,1.);
    float s=clamp(stage,0.,1.), line=1.-smoothstep(.08,.42,s), scanned=step(line,grid.y);
    float heat=smoothstep(.42,.58,s), lift=smoothstep(.55,.75,s), burst=smoothstep(.78,1.,s), r=hash(grid);
    vec3 cyan=vec3(.3,.85,1.);
    tone=mix(col,col*.3+cyan*edge*1.2,scanned*.85*step(0.,stage));
    tone=mix(tone,mix(vec3(.05,.2,.6),vec3(1.,.55,.12),d)*.8+cyan*edge*.6,heat);
    tone+=vec3(.6,.95,1.)*exp(-pow((grid.y-line)*60.,2.))*step(.02,s)*(1.-heat);
    vec3 p=vec3((grid.x-.5)*width,(grid.y-.5)*height,d*.9*lift);
    p=mix(p,vec3((r-.5)*.5,(fract(r*7.)-.5)*.5,-9.),burst*burst*(.6+.4*r));
    tone=mix(tone,vec3(.35,.9,1.),burst); alpha=1.-smoothstep(.75,1.,burst+r*.15);
    vec4 view=modelViewMatrix*vec4(p,1.);
    gl_Position=projectionMatrix*view; gl_PointSize=cell*projectionMatrix[1][1]*halfHeight/-view.z*(1.25+burst*1.5);
  }`;
const fragmentShader = `uniform float dim; varying vec3 tone; varying float alpha;
  void main(){ gl_FragColor=vec4(tone*dim,alpha);
    #include <colorspace_fragment>
  }`;
export function createIntro(data: SceneData, base: string) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .1, 50); camera.position.set(0, 0, 6);
  const names = introPhotos(data), slides: { points: THREE.Points; material: THREE.ShaderMaterial; textures: THREE.Texture[] }[] = [];
  let start = -1, done = () => {}, ended = Promise.resolve();
  async function bitmap(url: string, signal: AbortSignal) {
    const response = await fetch(url, { signal }); if (!response.ok) throw Error('Intro asset unavailable');
    return createImageBitmap(await response.blob());
  }
  function stop() { if (start < 0) return; start = -1; scene.visible = false; done(); }
  return {
    scene, camera, running: () => start >= 0, finished: () => ended, stop,
    // Resolves false when any photo or depth map is unavailable; the room then opens without the sequence.
    async load(signal: AbortSignal) {
      try {
        const loaded = await Promise.all(names.map(name => Promise.all([
          bitmap(`${base}depth/photo-${name}`, signal), bitmap(`${base}depth/depth-${name.replace('.jpg', '.png')}`, signal)])));
        loaded.forEach(([photo, depth]) => {
          const cols = 160, rows = Math.round(cols * photo.height / photo.width), grid = new Float32Array(cols * rows * 2);
          for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) grid.set([x / (cols - 1), y / (rows - 1)], (y * cols + x) * 2);
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(cols * rows * 3), 3));
          geometry.setAttribute('grid', new THREE.Float32BufferAttribute(grid, 2));
          const textures = [photo, depth].map(image => { const texture = new THREE.Texture(image); texture.flipY = false; texture.needsUpdate = true; return texture; });
          textures[0]!.colorSpace = THREE.SRGBColorSpace;
          const height = 2.2, width = height * photo.width / photo.height;
          const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false,
            uniforms: { photo: { value: textures[0] }, depthMap: { value: textures[1] }, stage: { value: -1 }, width: { value: width }, height: { value: height },
              cell: { value: width / (cols - 1) }, halfHeight: { value: 400 }, texel: { value: new THREE.Vector2(1 / photo.width, 1 / photo.height) }, dim: { value: 1 } } });
          const points = new THREE.Points(geometry, material); points.frustumCulled = false;
          scene.add(points); slides.push({ points, material, textures });
        });
        return slides.length > 0;
      } catch (error) { if (signal.aborted) throw error; return false; }
    },
    start(time: number) { start = time; scene.visible = true; ended = new Promise(resolve => { done = resolve; }); },
    update(time: number) {
      const f = (time - start) / SLOT, frame = introFrame(f, slides.length);
      frame.photos.forEach(({ offset, stage }, i) => {
        const { points, material } = slides[i]!, centred = stage >= 0;
        points.visible = stage < 1 && offset < 2.2;
        points.position.x = offset * 2.9; points.scale.setScalar(centred ? 1 : .72);
        points.rotation.y = -.5 * THREE.MathUtils.smoothstep(stage, .55, .75);
        material.uniforms.stage!.value = stage; material.uniforms.dim!.value = centred ? 1 : .45;
      });
      if (f >= slides.length + ASSEMBLE / SLOT) stop();
      return frame.reveal;
    },
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
      for (const { material } of slides) material.uniforms.halfHeight!.value = height / 2;
    },
    dispose() {
      stop();
      for (const { points, material, textures } of slides) { points.geometry.dispose(); material.dispose(); textures.forEach(texture => { (texture.image as ImageBitmap).close(); texture.dispose(); }); }
    },
  };
}
