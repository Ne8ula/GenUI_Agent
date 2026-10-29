import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { verifiedMesh } from '../room/verified-mesh.ts';
import { createIntro } from './intro.ts';
import { FFS, displayPoint, inCrop, inCutaway } from './state.ts';
import type { SceneData, Point, Marker } from './state.ts';
const source = { bytes: 10684860, sha256: 'f72bf4ff75ee242e4327d442e02ae9bb11ee779ba2b0c8684efe0ab571e984c0' };
type Pose = { position: Point; target: Point; zoom: number };
export type CameraView = Pose & { returnView?: Pose };
export type SceneRenderer = ReturnType<typeof createSceneRenderer>;
export function createSceneRenderer(canvas: HTMLCanvasElement, data: SceneData, labels: HTMLElement,
  onError: (text: string) => void, onMove: () => void, initial?: CameraView) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const ratio = Math.min(devicePixelRatio, 1.5); renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.autoClear = false;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#03070c');
  const bounds = new THREE.Box3(new THREE.Vector3(...data.crop.min), new THREE.Vector3(...data.crop.max));
  bounds.translate(new THREE.Vector3(0, 0, -349.2));
  const center = bounds.getCenter(new THREE.Vector3()), radius = bounds.getSize(new THREE.Vector3()).length() / 2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .025, 60); camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.minZoom = .6; controls.maxZoom = 8;
  controls.listenToKeyEvents(canvas);
  const abort = new AbortController(); let disposed = false, geometry: THREE.BufferGeometry | undefined;
  let returnView: CameraView | undefined = initial?.returnView;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const clock = new THREE.Clock();
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: ratio }, cutawayEnabled: { value: true }, detective: { value: true }, time: { value: 0 },
      reveal: { value: 1 }, zRange: { value: new THREE.Vector2(bounds.min.z, bounds.max.z) }, rotation: { value: data.crop.rotation_z },
      depthMid: { value: 0 }, depthSpan: { value: radius * 2 }, selected: { value: new THREE.Vector3() }, hasSelected: { value: false } },
    vertexShader: `uniform float pixelRatio, rotation, depthMid, depthSpan;
      attribute float inAperture; attribute vec3 color;
      varying float aperture, nearness; varying vec3 ink, display, scanner;
      void main(){ aperture=inAperture; ink=color; display=position;
        // Grid follows raw scanner axes so axis-aligned walls are not lit edge to edge.
        float c=cos(-rotation), s=sin(-rotation); scanner=vec3(c*position.x-s*position.y, s*position.x+c*position.y, position.z);
        vec4 view=modelViewMatrix*vec4(position,1.0); nearness=clamp(.55-(-view.z-depthMid)/depthSpan,.2,1.);
        gl_Position=projectionMatrix*view; gl_PointSize=2.0*pixelRatio; }`,
    fragmentShader: `uniform bool cutawayEnabled, detective, hasSelected; uniform float time, reveal; uniform vec2 zRange; uniform vec3 selected;
      varying float aperture, nearness; varying vec3 ink, display, scanner;
      float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      void main(){
        if(cutawayEnabled && aperture < .5) discard;
        float cut=mix(zRange.x-.05,zRange.y+.05,reveal); if(display.z>cut) discard;
        float front=1.-smoothstep(0.,.05,cut-display.z);
        float l=dot(ink,vec3(.2126,.7152,.0722));
        vec3 tint=ink;
        if(detective){
          vec2 g=abs(fract(scanner.xy*10.+.5)-.5)/10.;
          float line=1.-smoothstep(.003,.008,min(g.x,g.y));
          vec2 column=floor(scanner.xy*24.); float lane=hash(column);
          float rain=step(.88,lane)*(1.-smoothstep(0.,.05,fract(display.z*.7+time*(.25+lane*.3)+lane)));
          float band=exp(-pow((display.z-mix(zRange.y,zRange.x,fract(time*.09)))*9.,2.));
          tint=mix(vec3(.012,.035,.06),vec3(.09,.27,.36),sqrt(l))*nearness;
          tint+=vec3(.2,.62,.82)*line*nearness+vec3(.35,.9,1.)*(rain*.55+band*.35);
          if(hasSelected) tint=mix(tint,vec3(1.,.62,.18),(1.-smoothstep(.1,.16,distance(display,selected)))*.85);
        }
        tint=mix(tint,vec3(.6,.97,1.),front);
        gl_FragColor=vec4(tint,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // Depth-discontinuity outlines: crisp contours from measured geometry, not dithering.
  const target = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) });
  const post = new THREE.ShaderMaterial({
    uniforms: { color: { value: target.texture }, depth: { value: target.depthTexture }, texel: { value: new THREE.Vector2() },
      detective: { value: true }, span: { value: camera.far - camera.near } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `uniform sampler2D color, depth; uniform vec2 texel; uniform bool detective; uniform float span; varying vec2 vUv;
      void main(){
        vec4 c=texture2D(color,vUv);
        if(detective){
          float d=texture2D(depth,vUv).r, e=0.;
          if(d<1.) for(int i=0;i<4;i++){
            vec2 o=texel*(i<2 ? vec2(i==0 ? 1. : -1.,0.) : vec2(0.,i==2 ? 1. : -1.));
            float n=texture2D(depth,vUv+o).r; if(n<1.) e=max(e,abs(n-d)*span);
          }
          c.rgb=mix(c.rgb,vec3(.5,.93,1.),smoothstep(.05,.12,e)*.9);
          c.rgb*=1.-.45*smoothstep(.35,.8,length(vUv-.5));
        }
        gl_FragColor=c;
        #include <colorspace_fragment>
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post), postScene = new THREE.Scene(), postCamera = new THREE.Camera();
  postScene.add(quad);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...bounds.getSize(new THREE.Vector3()).toArray())),
    new THREE.LineBasicMaterial({ color: '#2a8fb0', transparent: true, opacity: .35 }));
  outline.position.copy(center); scene.add(outline);
  const intro = createIntro(data, FFS);
  const projected = data.markers.map(marker => ({ marker, p: new THREE.Vector3(...displayPoint(marker.centroid, data.crop)) }));
  const animated = () => intro.running() || (material.uniforms.detective!.value && !motion.matches && !document.hidden);
  function draw() {
    if (disposed) return;
    const t = clock.getElapsedTime();
    if (!motion.matches) material.uniforms.time!.value = t;
    if (intro.running()) material.uniforms.reveal!.value = intro.update(t);
    material.uniforms.depthMid!.value = camera.position.distanceTo(center);
    renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.clear(); renderer.render(postScene, postCamera);
    if (intro.running()) { renderer.clearDepth(); renderer.render(intro.scene, intro.camera); }
    renderer.setAnimationLoop(animated() ? draw : null);
    const rect = canvas.getBoundingClientRect();
    const placed: { x: number; y: number }[] = [];
    for (const { marker, p } of projected) {
      const node = labels.querySelector<HTMLElement>(`[data-marker="${marker.id}"]`); if (!node) continue;
      const q = p.clone().project(camera), visible = q.z > -1 && q.z < 1 && Math.abs(q.x) < .94 && Math.abs(q.y) < .90;
      const x = (q.x + 1) * rect.width / 2, anchorY = (1 - q.y) * rect.height / 2;
      let y = anchorY - 36;
      // Move only the labels; leader ends retain the detected scanner position.
      while (placed.some(other => Math.abs(other.x - x) < 46 && Math.abs(other.y - y) < 46)) y -= 46;
      node.hidden = !visible || y < 50;
      if (!node.hidden) placed.push({ x, y });
      node.style.left = `${x}px`; node.style.top = `${y}px`;
      node.style.setProperty('--leader', `${anchorY - y}px`);
    }
  }
  const snapshot = (): CameraView => ({ position: camera.position.toArray() as Point, target: controls.target.toArray() as Point, zoom: camera.zoom, ...(returnView ? { returnView } : {}) });
  function restore(view: Pose) { camera.position.fromArray(view.position); controls.target.fromArray(view.target); camera.zoom = view.zoom; camera.updateProjectionMatrix(); controls.update(); draw(); }
  function reset() {
    returnView = undefined;
    restore({ position: center.clone().add(new THREE.Vector3(1, -1, 1).normalize().multiplyScalar(radius * 3)).toArray() as Point, target: center.toArray() as Point, zoom: 1 });
  }
  function inspect(marker: Marker) {
    returnView ??= snapshot();
    const target = new THREE.Vector3(...displayPoint(marker.centroid, data.crop));
    const offset = camera.position.clone().sub(controls.target);
    controls.target.copy(target); camera.position.copy(target).add(offset); camera.zoom = 3;
    camera.updateProjectionMatrix(); controls.update(); draw();
  }
  function returnToRoom() { if (returnView) { restore(returnView); returnView = undefined; } }
  function zoom(closer: boolean) {
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * (closer ? 1.18 : .85), controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix(); controls.update(); draw();
  }
  function turn(direction: number) {
    camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 0, 1), direction * .15).add(controls.target);
    controls.update(); draw();
  }
  const key = (event: KeyboardEvent) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) onMove();
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (['home', '+', '-', 'w', 's'].includes(event.key.toLowerCase())) onMove();
    if (event.key === 'Home') { event.preventDefault(); reset(); }
    if (['+', '-', 'w', 's'].includes(event.key.toLowerCase())) { event.preventDefault(); zoom(['+', 'w'].includes(event.key.toLowerCase())); }
  };
  const focus = () => canvas.focus({ preventScroll: true });
  const lost = (event: Event) => { event.preventDefault(); onError('Graphics were interrupted. Reopen the scan; your notes remain here.'); };
  const resize = () => {
    const rect = canvas.getBoundingClientRect(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2()); target.setSize(size.x, size.y);
    post.uniforms.texel!.value.set(1 / size.x, 1 / size.y); intro.resize(size.x, size.y);
    const aspect = Math.max(1, rect.width) / Math.max(1, rect.height), half = radius * 1.06 / Math.min(1, aspect);
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix(); draw();
  };
  controls.addEventListener('change', draw); controls.addEventListener('start', onMove);
  canvas.addEventListener('keydown', key); canvas.addEventListener('pointerdown', focus); canvas.addEventListener('webglcontextlost', lost);
  motion.addEventListener('change', draw); document.addEventListener('visibilitychange', draw);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  if (initial) restore(initial); else reset();
  return {
    async load(progress: (value: number) => void) {
      // Replays only on first open; reopen and reduced motion go straight to the room.
      const play = !initial && !motion.matches;
      if (play) material.uniforms.reveal!.value = 0;
      const sequence = play ? intro.load(abort.signal).then(ready => {
        if (ready && !disposed) { intro.start(clock.getElapsedTime()); draw(); return intro.finished(); }
      }) : Promise.resolve();
      sequence.catch(() => {}); // Scan errors are reported first; an aborted intro alone is not.
      const buffer = await verifiedMesh(FFS + 'scene.ply', source, abort.signal, progress); if (disposed) return;
      const original = new PLYLoader().parse(buffer);
      try {
        const pos = original.getAttribute('position'), colors = original.getAttribute('color');
        if (pos?.count !== 712312 || colors?.count !== pos.count || original.index) throw Error('Unexpected scan geometry.');
        const xyz: number[] = [], rgb: number[] = [], aperture: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          const p: Point = [pos.getX(i), pos.getY(i), pos.getZ(i)];
          if (!inCrop(p, data.crop)) continue;
          xyz.push(...displayPoint(p, data.crop)); rgb.push(colors.getX(i), colors.getY(i), colors.getZ(i)); aperture.push(inCutaway(p, data.crop) ? 1 : 0);
        }
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
        geometry.setAttribute('inAperture', new THREE.Float32BufferAttribute(aperture, 1));
        scene.add(new THREE.Points(geometry, material)); resize();
      } finally { original.dispose(); }
      await sequence; if (disposed) return;
      material.uniforms.reveal!.value = 1; draw();
    },
    skipIntro() { intro.stop(); material.uniforms.reveal!.value = 1; draw(); },
    setCutaway(enabled: boolean) { material.uniforms.cutawayEnabled!.value = enabled; draw(); },
    setPresentation(original: boolean, selected: Marker | null) {
      material.uniforms.detective!.value = !original; post.uniforms.detective!.value = !original; outline.visible = !original;
      material.uniforms.hasSelected!.value = !!selected;
      if (selected) material.uniforms.selected!.value.set(...displayPoint(selected.centroid, data.crop));
      draw();
    },
    inspect, returnToRoom, zoom, turn, reset, snapshot, draw,
    dispose() {
      if (disposed) return; disposed = true; abort.abort(); observer.disconnect(); controls.dispose(); renderer.setAnimationLoop(null);
      canvas.removeEventListener('keydown', key); canvas.removeEventListener('pointerdown', focus); canvas.removeEventListener('webglcontextlost', lost);
      motion.removeEventListener('change', draw); document.removeEventListener('visibilitychange', draw);
      geometry?.dispose(); material.dispose(); post.dispose(); quad.geometry.dispose(); target.dispose();
      outline.geometry.dispose(); outline.material.dispose(); intro.dispose(); renderer.dispose();
    },
  };
}
