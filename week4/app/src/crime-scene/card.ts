import * as THREE from 'three';
// Evidence card: one source photo lifted by its estimated relative depth (Depth Anything V2 Small), slowly turning.
const vertexShader = `uniform sampler2D photo, depthMap; uniform float width, height, cell, halfHeight; uniform vec2 texel;
  attribute vec2 grid; varying vec3 tone;
  float lum(vec2 uv){ return dot(texture2D(photo,uv).rgb,vec3(.299,.587,.114)); }
  void main(){
    vec2 uv=vec2(grid.x,1.-grid.y); float d=texture2D(depthMap,uv).r;
    float edge=clamp(length(vec2(lum(uv+vec2(texel.x,0.))-lum(uv-vec2(texel.x,0.)),lum(uv+vec2(0.,texel.y))-lum(uv-vec2(0.,texel.y))))*4.,0.,1.);
    tone=mix(texture2D(photo,uv).rgb*vec3(.8,.9,1.),vec3(.55,.9,1.),edge*.6);
    vec4 view=modelViewMatrix*vec4((grid.x-.5)*width,(grid.y-.5)*height,d*.6,1.);
    gl_Position=projectionMatrix*view; gl_PointSize=cell*projectionMatrix[1][1]*halfHeight/-view.z*1.3; }`;
const fragmentShader = `varying vec3 tone; void main(){ gl_FragColor=vec4(tone,1.);
  #include <colorspace_fragment>
}`;
async function bitmap(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal }); if (!response.ok) throw Error('Depth card unavailable');
  return createImageBitmap(await response.blob());
}
export function createCard(canvas: HTMLCanvasElement, base: string, name: string, onFail: () => void) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 1, .1, 20); camera.position.set(0, 0, 4.6);
  const motion = matchMedia('(prefers-reduced-motion: reduce)'), clock = new THREE.Clock(), abort = new AbortController();
  let points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined, textures: THREE.Texture[] = [];
  const draw = () => {
    if (points) points.rotation.y = motion.matches ? -.35 : Math.sin(clock.getElapsedTime() * .5) * .45;
    renderer.render(scene, camera);
    renderer.setAnimationLoop(points && !motion.matches && !document.hidden ? draw : null);
  };
  const resize = () => {
    const rect = canvas.getBoundingClientRect(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix();
    if (points) points.material.uniforms.halfHeight!.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2;
    draw();
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  motion.addEventListener('change', draw); document.addEventListener('visibilitychange', draw);
  void Promise.all([bitmap(`${base}depth/photo-${name}`, abort.signal), bitmap(`${base}depth/depth-${name.replace('.jpg', '.png')}`, abort.signal)]).then(([photo, depth]) => {
    if (abort.signal.aborted) { photo.close(); depth.close(); return; }
    const cols = 120, rows = Math.round(cols * photo.height / photo.width), grid = new Float32Array(cols * rows * 2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) grid.set([x / (cols - 1), y / (rows - 1)], (y * cols + x) * 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(cols * rows * 3), 3));
    geometry.setAttribute('grid', new THREE.Float32BufferAttribute(grid, 2));
    textures = [photo, depth].map(image => { const texture = new THREE.Texture(image); texture.flipY = false; texture.needsUpdate = true; return texture; });
    textures[0]!.colorSpace = THREE.SRGBColorSpace;
    const height = 1.6 * Math.min(1, photo.height / photo.width * 1.4), width = height * photo.width / photo.height;
    points = new THREE.Points(geometry, new THREE.ShaderMaterial({ vertexShader, fragmentShader,
      uniforms: { photo: { value: textures[0] }, depthMap: { value: textures[1] }, width: { value: width }, height: { value: height },
        cell: { value: width / (cols - 1) }, halfHeight: { value: 1 }, texel: { value: new THREE.Vector2(1 / photo.width, 1 / photo.height) } } }));
    points.frustumCulled = false; scene.add(points); resize();
  }).catch(() => { if (!abort.signal.aborted) onFail(); });
  return () => {
    abort.abort(); observer.disconnect(); renderer.setAnimationLoop(null);
    motion.removeEventListener('change', draw); document.removeEventListener('visibilitychange', draw);
    points?.geometry.dispose(); points?.material.dispose();
    textures.forEach(texture => { (texture.image as ImageBitmap).close(); texture.dispose(); }); renderer.dispose();
  };
}
