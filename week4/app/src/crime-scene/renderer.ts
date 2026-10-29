import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { verifiedMesh } from '../room/verified-mesh.ts';
import { aim, face, standpoint, walk } from './firstperson.ts';
import { FFS, displayPoint, inCrop } from './state.ts';
import type { SceneData, Point, Marker } from './state.ts';
import { NO_REVIEW, loadModels, loadSegments, segmentAttribute } from './models.ts';
import type { Hologram, LoadedModel, Review } from './models.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PLAYBACK_IDLE, createFigures, frameFor, ghostBlend, ghostMatrix, ghostState, landings, playbackReduce } from './figures.ts';
import type { Figures, Landing } from './figures.ts';
import type { Scenario } from './playback.ts';
const source = { bytes: 10684860, sha256: 'f72bf4ff75ee242e4327d442e02ae9bb11ee779ba2b0c8684efe0ab571e984c0' };
// figures/human.glb: CC0 Quaternius mannequin, see docs/design/revisions/crime-scene-eva-v1/FIGURE-LICENCE.md.
const figureSource = { bytes: 6671104, sha256: '1b7bf67866360665426bb99e4c71bd619f19b408453c24e30f0c3071601eee5c' };
const LANDING = 1.2;
type Look = { yaw: number; pitch: number };
export type CameraView = Look & { position: Point; returnView?: Look };
export type SceneRenderer = ReturnType<typeof createSceneRenderer>;
const SPEED = 1.4, TURN = 1.6, PITCH = 1.3, HOLOGRAM = .34;
export function createSceneRenderer(canvas: HTMLCanvasElement, data: SceneData, labels: HTMLElement,
  onError: (text: string) => void, onMove: () => void, initial?: CameraView, onAim: (marker: Marker | null) => void = () => {}, onReview: () => void = () => {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const ratio = Math.min(devicePixelRatio, 1.5); renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#03060d');
  const camera = new THREE.PerspectiveCamera(70, 1, .03, 40); camera.up.set(0, 0, 1);
  const abort = new AbortController(); let disposed = false, geometry: THREE.BufferGeometry | undefined;
  let review: Review = NO_REVIEW, reviewRun = 0, kept = new Uint32Array(), total = 0, models: (LoadedModel & { holo: THREE.ShaderMaterial })[] = [], members: number[][] = [];
  const motion = matchMedia('(prefers-reduced-motion: reduce)'), clock = new THREE.Clock();
  const home = standpoint(data.crop), centre = face(home, [(data.crop.min[0]! + data.crop.max[0]!) / 2, (data.crop.min[1]! + data.crop.max[1]!) / 2, home[2] - .6]);
  let position: Point = [...home], { yaw, pitch } = centre, returnView = initial?.returnView, aimed: Marker | null = null;
  const located = data.markers.map(marker => new THREE.Vector3(...displayPoint(marker.centroid, data.crop)));
  const count = Math.max(1, data.markers.length), amounts = new Float32Array(count), targets = new Float32Array(count);
  // marks: hologram centre (approved segment's bounds centre, else the marker) and reconstruction amount.
  // spans: radius (sphere, or an approved segment's floor footprint), bottom z, top z and mode (0 sphere of scan points, 1 approved segment, 2 fitted model replacing its segment).
  const marks = located.map(p => new THREE.Vector4(p.x, p.y, p.z, 0)), spans = located.map(p => new THREE.Vector4(HOLOGRAM, p.z - HOLOGRAM, p.z + HOLOGRAM, 0));
  while (marks.length < count) { marks.push(new THREE.Vector4()); spans.push(new THREE.Vector4()); }
  const shared = { time: { value: 0 }, still: { value: false }, halfHeight: { value: 1 }, marks: { value: marks }, spans: { value: spans } };
  const hash = 'float hash(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }';
  const material = new THREE.ShaderMaterial({
    defines: { MARKS: count, RADIUS: HOLOGRAM.toFixed(2) },
    uniforms: { ...shared, detective: { value: true }, beacon: { value: new THREE.Vector4() } },
    vertexShader: `uniform bool detective; uniform float halfHeight; uniform vec4 marks[MARKS], spans[MARKS]; attribute vec3 color; attribute float segment;
      varying vec3 ink, display; varying float dist, seg;
      void main(){ ink=color; display=position; seg=segment;
        if(segment>=0.){ vec4 s=spans[int(segment)]; float w=marks[int(segment)].w;
          // Measured points stay until the fitted model is drawn over them: under the scanline in detective view, once complete in Source colours.
          bool replaced=detective ? position.z<s.y+w*(s.z-s.y)+.05 : w>=1.;
          if(s.w>1.5 && w>0. && replaced){ gl_Position=vec4(2.,2.,2.,1.); gl_PointSize=0.; return; } }
        vec4 view=modelViewMatrix*vec4(position,1.); dist=-view.z;
        gl_Position=projectionMatrix*view; gl_PointSize=clamp(.016*projectionMatrix[1][1]*halfHeight/dist,1.,9.); }`,
    fragmentShader: `uniform bool detective, still; uniform float time; uniform vec4 marks[MARKS], spans[MARKS], beacon; varying vec3 ink, display; varying float dist, seg;
      ${hash}
      void main(){
        vec3 c=ink;
        if(detective){
          // Real room kept, graded dark, desaturated and cool; distance falls away to black.
          float l=dot(ink,vec3(.2126,.7152,.0722));
          c=mix(vec3(l),ink,.3)*vec3(.5,.58,.95)*.75*(1.-.65*smoothstep(1.5,6.,dist));
          for(int i=0;i<MARKS;i++){
            vec4 m=marks[i], s=spans[i]; if(m.w<=0.) continue;
            float d=distance(display,m.xyz), body=s.w<.5 ? 1.-smoothstep(s.x-.05,s.x,d) : step(abs(seg-float(i)),.5);
            // A bright scanline rises over the object's height as it reconstructs; points just under it keep crumbling.
            // The band sits 5 cm above the top once complete, so the finished (and reduced-motion) state shows no band.
            float line=s.y+m.w*(s.z-s.y)+.05, e=(display.z-line)*60., band=exp(-e*e);
            // Crumbling fades out with completion, so a finished hologram tints every segment point.
            float shown=step(display.z,line)*(1.-step(.7,hash(display*53.+floor(time*8.)))*smoothstep(line-.1,line,display.z)*(1.-m.w));
            vec3 icy=vec3(.5,.82,1.)*(.7+.6*l)+vec3(.8,.95,1.)*step(.985,hash(display*37.+floor(time*10.)))*(still?0.:1.)+vec3(.6,.9,1.)*band*1.5;
            c=mix(c,icy,body*shown);
            // Blue spill: around the sphere, or onto the floor points under an approved segment's footprint.
            float spill=s.w<.5 ? 1.-smoothstep(s.x,s.x+.7,d) : (1.-smoothstep(s.x,s.x+.4,length(display.xy-m.xy)))*(1.-smoothstep(s.y,s.y+.12,display.z));
            c+=vec3(.12,.3,.6)*spill*(1.-body)*m.w*.6;
          }
          // Timeline beacon: a column of light over the clue photographed at the current step.
          float r=length(display.xy-beacon.xy);
          c+=vec3(.3,.7,1.)*(1.-smoothstep(.04,.16,r))*beacon.w*(.55+.45*sin(display.z*18.-time*5.));
        }
        gl_FragColor=vec4(c,1.);
        #include <colorspace_fragment>
      }`,
  });
  // Drifting particles crumbling from reconstructed clues: display only. Seeds are offsets from the hologram centre,
  // sampled from the approved segment's own points once known, else from the sphere.
  const PARTICLES = 260, sphereSeed = () => new THREE.Vector3().randomDirection().multiplyScalar(HOLOGRAM * Math.cbrt(Math.random()));
  const seeds: number[] = [], phases: number[] = [];
  located.forEach((_, i) => { for (let k = 0; k < PARTICLES; k++) { const v = sphereSeed(); seeds.push(i, v.x, v.y, v.z); phases.push(Math.random()); } });
  const dust = new THREE.BufferGeometry();
  dust.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(phases.length * 3), 3));
  dust.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 4)); dust.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  const particles = new THREE.Points(dust, new THREE.ShaderMaterial({
    defines: { MARKS: count }, uniforms: shared, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform vec4 marks[MARKS]; uniform float time, halfHeight; attribute vec4 seed; attribute float phase; varying float alpha;
      void main(){ vec4 m=marks[int(seed.x)]; float t=fract(phase+time*.12);
        vec3 p=m.xyz+seed.yzw*(1.+(1.-m.w)*2.5)+vec3(0.,0.,t*.3); alpha=m.w*(1.-t)*.7;
        vec4 view=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*view;
        gl_PointSize=m.w>0. ? clamp(.012*projectionMatrix[1][1]*halfHeight/-view.z,1.,4.) : 0.; }`,
    fragmentShader: 'varying float alpha; void main(){ gl_FragColor=vec4(vec3(.7,.92,1.)*alpha,alpha); }',
  }));
  particles.frustumCulled = false; scene.add(particles);
  // Detective-view material for a fitted model: solid translucent icy body, fresnel rim, inner sparkle and the rising scanline.
  // The skinning chunks are no-ops on plain meshes and pose the rigged figures.
  const hologramMaterial = (zmin: number, zmax: number) => new THREE.ShaderMaterial({
    uniforms: { time: shared.time, still: shared.still, scan: { value: 0 }, zmin: { value: zmin }, zmax: { value: zmax } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `#include <skinning_pars_vertex>
      varying vec3 wpos, wnormal, eye;
      #ifdef MATRIX_FIGURE
      varying vec3 rest, restNormal;
      #endif
      void main(){
        #ifdef MATRIX_FIGURE
        rest=position; restNormal=normal;
        #endif
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        wpos=(modelMatrix*vec4(transformed,1.)).xyz; wnormal=normalize(normalMatrix*objectNormal);
        vec4 view=modelViewMatrix*vec4(transformed,1.); eye=-view.xyz; gl_Position=projectionMatrix*view; }`,
    fragmentShader: `uniform bool still; uniform float time, scan, zmin, zmax; varying vec3 wpos, wnormal, eye;
      #ifdef MATRIX_FIGURE
      varying vec3 rest, restNormal;
      #endif
      ${hash}
      void main(){
        float line=zmin+scan*(zmax-zmin)+.05; if(wpos.z>line) discard;
        vec3 n=wnormal/max(length(wnormal),1e-6);
        float rim=pow(max(0.,1.-abs(dot(n,normalize(eye)))),2.5), e=(wpos.z-line)*60., band=exp(-e*e);
        #ifdef MATRIX_FIGURE
        // Bind-space marks travel with the skin instead of swimming or flashing with wall-clock time.
        vec3 axis=abs(restNormal);
        vec2 grid=(axis.x>axis.y && axis.x>axis.z ? rest.yz : axis.y>axis.z ? rest.xz : rest.xy)*36.;
        vec2 cell=floor(grid), q=abs(fract(grid)-.5);
        float d=max(q.x,q.y), aa=max(fwidth(grid.x),fwidth(grid.y))*.6+.001;
        float outer=1.-smoothstep(.28-aa,.28+aa,d), inner=1.-smoothstep(.14-aa,.14+aa,d);
        float ink=max(0.,outer-inner)*step(.35,hash(vec3(cell,3.)));
        float contour=rim*(.08+.12*step(.8,hash(floor(rest*18.))));
        float alpha=.65*ink+contour;
        if(alpha<.015) discard;
        gl_FragColor=vec4(mix(vec3(.08,.48,.5),vec3(.2,.72,.82),rim),alpha);
        #else
        float sparkle=still?0.:step(.985,hash(floor(wpos*80.)+floor(time*10.)));
        vec3 c=vec3(.35,.7,1.)*(.3+.9*rim)+vec3(.8,.95,1.)*sparkle*.5+vec3(.6,.9,1.)*band*1.5;
        gl_FragColor=vec4(c,.45+.55*rim);
        #endif
        #include <colorspace_fragment>
      }`,
  });
  // Source-colours material per fitted-model mesh; a WeakMap, not userData, which Object3D.clone() deep-copies through JSON.
  const textured = new WeakMap<THREE.Object3D, THREE.MeshBasicMaterial>();
  const release = (object: THREE.Object3D) => object.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return; node.geometry.dispose();
    for (const m of [node.material, textured.get(node)].flat() as (THREE.MeshBasicMaterial | undefined)[]) { m?.map?.dispose(); m?.dispose(); }
  });
  // Approved segments drive membership and extents; approved models replace their segment's points.
  async function applyReview() {
    if (!geometry) return;
    const run = ++reviewRun;
    const [lists, loaded] = await Promise.all([loadSegments(data.markers, review, total, abort.signal), loadModels(data.markers, review, abort.signal)]);
    if (disposed || run !== reviewRun) { loaded.forEach(m => release(m.object)); return; }
    models.forEach(m => { scene.remove(m.object); release(m.object); m.holo.dispose(); }); models = [];
    const segment = segmentAttribute(kept, lists), attribute = geometry.getAttribute('segment') as THREE.BufferAttribute;
    (attribute.array as Float32Array).set(segment); attribute.needsUpdate = true;
    const pos = geometry.getAttribute('position'), boxes = data.markers.map(() => new THREE.Box3()), v = new THREE.Vector3();
    members = data.markers.map(() => [] as number[]);
    segment.forEach((i, j) => { if (i >= 0) { boxes[i]!.expandByPoint(v.fromBufferAttribute(pos, j)); members[i]!.push(j); } });
    const footprint = (b: THREE.Box3) => Math.hypot(b.max.x - b.min.x, b.max.y - b.min.y) / 2;
    data.markers.forEach((_, i) => {
      const p = located[i]!, b = boxes[i]!;
      if (b.isEmpty()) { marks[i]!.set(p.x, p.y, p.z, marks[i]!.w); spans[i]!.set(HOLOGRAM, p.z - HOLOGRAM, p.z + HOLOGRAM, 0); return; }
      const c = b.getCenter(v); marks[i]!.set(c.x, c.y, c.z, marks[i]!.w); spans[i]!.set(footprint(b), b.min.z, b.max.z, 1);
    });
    const seed = dust.getAttribute('seed') as THREE.BufferAttribute, centre = new THREE.Vector3();
    data.markers.forEach((_, i) => {
      const own = members[i]!; centre.set(marks[i]!.x, marks[i]!.y, marks[i]!.z);
      for (let k = 0; k < PARTICLES; k++) {
        const o = own.length ? v.fromBufferAttribute(pos, own[Math.floor(Math.random() * own.length)]!).sub(centre) : sphereSeed();
        seed.setXYZW(i * PARTICLES + k, i, o.x, o.y, o.z);
      }
    });
    seed.needsUpdate = true;
    for (const model of loaded) {
      const s = spans[model.index]!;
      if (s.w < 1) { release(model.object); continue; }
      const b = new THREE.Box3().setFromObject(model.object);
      s.set(Math.max(s.x, footprint(b)), Math.min(s.y, b.min.z), Math.max(s.z, b.max.z), 2);
      const holo = hologramMaterial(s.y, s.z);
      model.object.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const own = [node.material].flat() as THREE.Material[], map = (own[0] as THREE.MeshStandardMaterial | undefined)?.map;
        own.forEach(m => m.dispose());
        if (!node.geometry.getAttribute('normal')) node.geometry.computeVertexNormals();
        const plain = new THREE.MeshBasicMaterial(map ? { map } : { color: '#8a93a0' }); textured.set(node, plain);
        node.material = material.uniforms.detective!.value ? holo : plain;
      });
      scene.add(model.object); models.push({ ...model, holo });
    }
    buildGhosts();
    onReview(); applyPlayback(); // Labels re-read hologram() from the committed state before the models are drawn.
  }
  // Review assets are optional: a failure keeps the sphere holograms and is logged, never surfaced as a scene error.
  const reapply = () => { void applyReview().catch(e => { if (!disposed) { console.warn('Hologram review assets unavailable; keeping approximate regions.', e); onReview(); } }); };
  // EVA's hypothetical reconstruction: ghost copies of clue holograms move between states and mannequin figures act the steps.
  // The measured scan itself never moves; ghosts and figures are display only. The figure asset loads lazily and never gates readiness.
  let play = PLAYBACK_IDLE, landed: Landing[] = [], figures: Figures | null = null, asset: THREE.Object3D | null = null, figureLoad: Promise<void> | null = null, looping = false;
  type Ghost = { tag: number; index: number; object: THREE.Object3D; own: THREE.BufferGeometry | null; holo: THREE.Material | null; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; burst: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>; base: number; fix?: { key: string; dz: number } };
  let ghosts: Ghost[] = [];
  const sphereSubsets = new Map<number, number[]>();
  const ghostHologram = () => { const m = hologramMaterial(-1, 4); m.uniforms.scan!.value = 1; return m; };
  const ghostPoints = new THREE.ShaderMaterial({
    uniforms: { halfHeight: shared.halfHeight }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float halfHeight; void main(){ vec4 view=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*view; gl_PointSize=clamp(.016*projectionMatrix[1][1]*halfHeight/-view.z,1.,9.); }`,
    fragmentShader: 'void main(){ gl_FragColor=vec4(.35,.65,1.,.55); }',
  });
  // Landing effect: a floor ring spreading from where a ghost settles, and a burst of points thrown up from it.
  const ringGeometry = new THREE.RingGeometry(.7, 1, 48), burstGeometry = new THREE.BufferGeometry();
  burstGeometry.setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 160 }, () => { const v = new THREE.Vector3().randomDirection(); return [v.x, v.y, Math.abs(v.z)]; }).flat(), 3));
  const burstMaterial = () => new THREE.ShaderMaterial({
    uniforms: { halfHeight: shared.halfHeight, centre: { value: new THREE.Vector3() }, age: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform vec3 centre; uniform float age, halfHeight; varying float alpha;
      void main(){ vec3 p=centre+position*(.08+age*.9)-vec3(0.,0.,age*age*.4); alpha=max(0.,1.-age/${LANDING.toFixed(2)})*.8;
        vec4 view=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*view; gl_PointSize=clamp(.012*projectionMatrix[1][1]*halfHeight/-view.z,1.,5.); }`,
    fragmentShader: 'varying float alpha; void main(){ gl_FragColor=vec4(vec3(.7,.92,1.)*alpha,alpha); }',
  });
  // A ghost copies the clue's fitted model, else a thinned subset of its hologram points (approved segment, or the scan points within the sphere).
  function ghostSource(i: number): THREE.Object3D | null {
    const model = models.find(m => m.index === i);
    if (model) return model.object.clone();
    if (!geometry) return null;
    const pos = geometry.getAttribute('position'), v = new THREE.Vector3(), xyz: number[] = [];
    let picked = members[i] ?? [];
    if (!picked.length) {
      picked = sphereSubsets.get(i) ?? [];
      if (!picked.length) { for (let j = 0; j < pos.count; j++) if (v.fromBufferAttribute(pos, j).distanceTo(located[i]!) <= HOLOGRAM) picked.push(j); sphereSubsets.set(i, picked); }
    }
    const stride = Math.max(1, Math.ceil(picked.length / 3000));
    for (let k = 0; k < picked.length; k += stride) xyz.push(pos.getX(picked[k]!), pos.getY(picked[k]!), pos.getZ(picked[k]!));
    if (!xyz.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
    return new THREE.Points(g, ghostPoints);
  }
  const box = new THREE.Box3();
  function buildGhosts() {
    ghosts.forEach(g => { scene.remove(g.object, g.ring, g.burst); g.own?.dispose(); g.holo?.dispose(); g.ring.material.dispose(); g.burst.material.dispose(); }); ghosts = [];
    if (!play.scenario) return;
    for (const tag of new Set(play.scenario.steps.flatMap(step => step.object_moves.map(move => move.tag)))) {
      const index = data.markers.findIndex(marker => marker.tag === tag), source = index >= 0 ? ghostSource(index) : null;
      if (!source) continue;
      const holo = source instanceof THREE.Points ? null : ghostHologram();
      if (holo) source.traverse(node => { if (node instanceof THREE.Mesh) node.material = holo; });
      const object = new THREE.Object3D(); object.matrixAutoUpdate = false; object.add(source);
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#5ab4ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const burst = new THREE.Points(burstGeometry, burstMaterial()); burst.frustumCulled = false;
      object.visible = ring.visible = burst.visible = false; object.updateMatrixWorld(true);
      // base: the measured bottom height; a displaced ghost brings it to the given z, an uprighted one keeps it.
      const base = box.setFromObject(object, true).min.z;
      scene.add(object, ring, burst); ghosts.push({ tag, index, object, own: source instanceof THREE.Points ? source.geometry : null, holo, ring, burst, base });
    }
  }
  // An upright state needs an owner-recorded rotation (any model status); otherwise it is the measured pose (no ghost, no landing).
  const effective = (g: Ghost, state: 'upright' | 'current' | 'displaced') => ghostState(state, review.models[g.tag]?.upright);
  function stateMatrix(g: Ghost, state: 'upright' | 'current' | 'displaced', position: [number, number, number] | null, centre: THREE.Vector3) {
    const upright = review.models[g.tag]?.upright, m = ghostMatrix(effective(g, state), position, centre, upright, g.base);
    // An uprighted ghost keeps its measured bottom height instead of pivoting through the floor; the precise fix is cached per rotation.
    if (effective(g, state) === 'upright') {
      const key = upright!.join();
      if (g.fix?.key !== key) {
        const bottom = (matrix: THREE.Matrix4) => { g.object.matrix.copy(matrix); g.object.updateMatrixWorld(true); return box.setFromObject(g.object, true).min.z; };
        g.fix = { key, dz: g.base - bottom(m) };
      }
      m.elements[14] += g.fix.dz;
    }
    return m;
  }
  function hidePlayback() { figures?.clear(); ghosts.forEach(g => { g.object.visible = g.ring.visible = g.burst.visible = false; }); }
  function applyPlayback() {
    const { scenario, t, stopped } = play;
    if (!scenario || stopped) { hidePlayback(); if (!looping) draw(); return; }
    const frame = frameFor(scenario, t, motion.matches);
    figures?.apply(frame);
    for (const g of ghosts) {
      const o = frame.objects.find(x => x.tag === g.tag);
      if (!o) { g.object.visible = g.ring.visible = g.burst.visible = false; continue; }
      const centre = new THREE.Vector3(marks[g.index]!.x, marks[g.index]!.y, marks[g.index]!.z);
      ghostBlend(stateMatrix(g, o.from, o.fromPosition, centre), stateMatrix(g, o.to, o.toPosition, centre), o.blend, centre, g.object.matrix); g.object.updateMatrixWorld(true);
      g.object.visible = effective(g, o.from) !== 'current' || effective(g, o.to) !== 'current'; // at the measured pose the hologram itself already shows the object
      const land = landed.findLast(l => l.tag === g.tag && l.t <= t), age = land ? t - land.t : Infinity;
      g.ring.visible = g.burst.visible = !motion.matches && age < LANDING && !!land && effective(g, land.state) !== 'current';
      if (!g.ring.visible || !land) continue;
      centre.applyMatrix4(stateMatrix(g, land.state, land.position, centre)); // anchored to the landed state, whatever moves next
      g.ring.position.set(centre.x, centre.y, .01); g.ring.scale.setScalar(.15 + age * .6); g.ring.material.opacity = (1 - age / LANDING) * .8;
      g.burst.material.uniforms.centre!.value.copy(centre); g.burst.material.uniforms.age!.value = age;
    }
    if (!looping) draw(); // the renderer's own loop, when running, shows this state on its next frame
  }
  async function loadFigures() {
    try {
      const buffer = await verifiedMesh(FFS + 'figures/human.glb', figureSource, abort.signal, () => {});
      const gltf = await new GLTFLoader().parseAsync(buffer, '');
      if (disposed) { release(gltf.scene); return; }
      asset = gltf.scene;
      figures = createFigures(scene, gltf, () => {
        const m = ghostHologram(); m.defines.MATRIX_FIGURE = 1; return m;
      });
      applyPlayback();
    } catch (e) { if (!disposed) console.warn('Hologram figures unavailable; playing object ghosts only.', e); }
  }
  const keys = new Set<string>();
  let last = 0, holograms = false, beaconOn = false, beaconIndex = -1;
  const arrow = labels.querySelector<HTMLElement>('.scene-beacon-arrow');
  const animated = () => keys.size > 0 || amounts.some((a, i) => a !== targets[i])
    || ((holograms || beaconOn) && material.uniforms.detective!.value && !motion.matches && !document.hidden);
  function apply() {
    camera.position.set(...position);
    camera.lookAt(position[0] + Math.cos(pitch) * Math.cos(yaw), position[1] + Math.cos(pitch) * Math.sin(yaw), position[2] + Math.sin(pitch));
  }
  function draw() {
    if (disposed) return;
    const t = clock.getElapsedTime(), dt = Math.min(.1, t - last); last = t;
    if (keys.size) {
      const k = (...names: string[]) => names.some(name => keys.has(name)) ? 1 : 0;
      yaw += (k('arrowleft') - k('arrowright')) * TURN * dt;
      pitch = THREE.MathUtils.clamp(pitch + (k('arrowup') - k('arrowdown')) * TURN * dt, -PITCH, PITCH);
      position = walk(position, yaw, (k('w') - k('s')) * SPEED * dt, (k('d') - k('a')) * SPEED * dt, data.crop);
    }
    amounts.forEach((a, i) => { amounts[i] = motion.matches ? targets[i]! : a < targets[i]! ? Math.min(targets[i]!, a + dt / 1.6) : targets[i]!; marks[i]!.w = amounts[i]!; });
    // The hologram builds up under the scanline; the textured model appears only once its points are fully replaced.
    models.forEach(m => { const w = amounts[m.index]!; m.object.visible = material.uniforms.detective!.value ? w > 0 : w >= 1; m.holo.uniforms.scan!.value = w; });
    if (!motion.matches) shared.time.value = t;
    shared.still.value = motion.matches;
    apply(); renderer.render(scene, camera);
    looping = animated(); renderer.setAnimationLoop(looping ? draw : null);
    const next = aim(position, yaw, pitch, data.markers, data.crop);
    if (next !== aimed) { aimed = next; onAim(next); }
    const rect = canvas.getBoundingClientRect();
    const placed: { x: number; y: number }[] = [];
    data.markers.forEach((marker, i) => {
      const node = labels.querySelector<HTMLElement>(`[data-marker="${marker.id}"]`); if (!node) return;
      const q = located[i]!.clone().project(camera), visible = q.z > -1 && q.z < 1 && Math.abs(q.x) < .94 && Math.abs(q.y) < .9;
      const x = (q.x + 1) * rect.width / 2, anchorY = (1 - q.y) * rect.height / 2;
      let y = anchorY - 36;
      // Move only the labels; leader ends retain the detected scanner position.
      while (placed.some(other => Math.abs(other.x - x) < 46 && Math.abs(other.y - y) < 46)) y -= 46;
      node.hidden = !visible || y < 50;
      if (!node.hidden) placed.push({ x, y });
      node.style.left = `${x}px`; node.style.top = `${y}px`;
      node.style.setProperty('--leader', `${anchorY - y}px`);
    });
    // Off-screen beacon: a chevron on the screen edge points the way, including behind the viewer.
    if (arrow) {
      const v = beaconIndex >= 0 ? located[beaconIndex]!.clone().applyMatrix4(camera.matrixWorldInverse) : null, q = v && located[beaconIndex]!.clone().project(camera);
      arrow.hidden = !v || !q || (v.z < 0 && Math.abs(q.x) < .9 && Math.abs(q.y) < .9);
      if (v && !arrow.hidden) {
        const angle = Math.atan2(v.y, v.x);
        arrow.style.left = `${rect.width / 2 + Math.cos(angle) * rect.width * .44}px`; arrow.style.top = `${rect.height / 2 - Math.sin(angle) * rect.height * .42}px`;
        arrow.style.setProperty('--angle', `${-angle}rad`);
      }
    }
  }
  const kick = () => { last = clock.getElapsedTime(); draw(); };
  const snapshot = (): CameraView => ({ position: [...position], yaw, pitch, ...(returnView ? { returnView } : {}) });
  function restore(view: CameraView) { position = [...view.position]; yaw = view.yaw; pitch = view.pitch; draw(); }
  function reset() { returnView = undefined; restore({ position: home, ...centre }); }
  function inspect(marker: Marker) {
    returnView ??= { yaw, pitch };
    ({ yaw, pitch } = face(position, displayPoint(marker.centroid, data.crop))); draw();
  }
  function returnToRoom() { if (returnView) { ({ yaw, pitch } = returnView); returnView = undefined; draw(); } }
  function turn(direction: number) { yaw -= direction * .25; draw(); }
  function step(forward: number) { position = walk(position, yaw, forward * .4, 0, data.crop); draw(); }
  const moveKeys = ['w', 'a', 's', 'd', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'];
  const keydown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const name = event.key.toLowerCase();
    if (event.key === 'Home') { event.preventDefault(); onMove(); reset(); }
    if (moveKeys.includes(name)) { event.preventDefault(); onMove(); if (!keys.has(name)) { keys.add(name); kick(); } }
  };
  const keyup = (event: KeyboardEvent) => { keys.delete(event.key.toLowerCase()); };
  const blur = () => keys.clear();
  let drag: { x: number; y: number } | null = null;
  const down = (event: PointerEvent) => { canvas.focus({ preventScroll: true }); drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); };
  const move = (event: PointerEvent) => {
    if (!drag) return;
    yaw -= (event.clientX - drag.x) * .004; pitch = THREE.MathUtils.clamp(pitch - (event.clientY - drag.y) * .004, -PITCH, PITCH);
    drag = { x: event.clientX, y: event.clientY }; onMove(); draw();
  };
  const up = () => { drag = null; };
  const lost = (event: Event) => { event.preventDefault(); onError('Graphics were interrupted. Reopen the scan; your notes remain here.'); };
  const resize = () => {
    const rect = canvas.getBoundingClientRect(); renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    shared.halfHeight.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2;
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix(); draw();
  };
  canvas.addEventListener('keydown', keydown); canvas.addEventListener('keyup', keyup); canvas.addEventListener('blur', blur);
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('webglcontextlost', lost);
  const motionChange = () => applyPlayback(); // re-samples the stepped or interpolated frame, then draws
  motion.addEventListener('change', motionChange); document.addEventListener('visibilitychange', draw);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  if (initial) restore(initial); else reset();
  return {
    async load(progress: (value: number) => void) {
      const buffer = await verifiedMesh(FFS + 'scene.ply', source, abort.signal, progress); if (disposed) return;
      const original = new PLYLoader().parse(buffer);
      try {
        const pos = original.getAttribute('position'), colors = original.getAttribute('color');
        if (pos?.count !== 712312 || colors?.count !== pos.count || original.index) throw Error('Unexpected scan geometry.');
        const xyz: number[] = [], rgb: number[] = [], index: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          const p: Point = [pos.getX(i), pos.getY(i), pos.getZ(i)];
          if (!inCrop(p, data.crop)) continue;
          xyz.push(...displayPoint(p, data.crop)); rgb.push(colors.getX(i), colors.getY(i), colors.getZ(i)); index.push(i);
        }
        kept = Uint32Array.from(index); total = pos.count;
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
        geometry.setAttribute('segment', new THREE.Float32BufferAttribute(new Float32Array(index.length).fill(-1), 1));
        scene.add(new THREE.Points(geometry, material)); resize(); buildGhosts(); applyPlayback();
      } finally { original.dispose(); }
      reapply(); // Optional review assets never gate readiness; the measured scan is usable now.
    },
    setPresentation(original: boolean) {
      material.uniforms.detective!.value = !original; particles.visible = !original;
      models.forEach(m => m.object.traverse(node => { if (node instanceof THREE.Mesh) node.material = original ? textured.get(node)! : m.holo; }));
      draw();
    },
    setReview(next: Review) { review = next; reapply(); },
    // What the hologram for a tag is made of, for labelling: a fitted model, its approved segment, or the sphere fallback.
    hologram(tag: number): Hologram {
      const i = data.markers.findIndex(marker => marker.tag === tag), model = models.find(m => m.index === i);
      return model ? { kind: 'model', fit: model.fit } : i >= 0 && spans[i]!.w >= 1 ? { kind: 'segment' } : { kind: 'sphere' };
    },
    // Reconstructed clues become holograms: the owner-approved segment (or fitted model), else scan points within 34 cm of the marker.
    setScanned(tags: number[]) {
      data.markers.forEach((marker, i) => { targets[i] = marker.tag !== null && tags.includes(marker.tag) ? 1 : 0; });
      holograms = targets.some(Boolean); kick();
    },
    setBeacon(tag: number | null) {
      const i = data.markers.findIndex(marker => marker.tag === tag && tag !== null);
      beaconOn = i >= 0; beaconIndex = i; material.uniforms.beacon!.value.set(...(beaconOn ? [located[i]!.x, located[i]!.y, 0, 1] : [0, 0, 0, 0]) as [number, number, number, number]); draw();
    },
    // Hypothetical reconstruction playback. Time is the scenario's own clock in seconds; walking and scanning never touch it.
    setScenario(next: Scenario | null) {
      play = playbackReduce(play, { type: 'scenario', scenario: next }); landed = next ? landings(next) : [];
      buildGhosts();
      if (next && !figureLoad) figureLoad = loadFigures();
      applyPlayback();
    },
    setPlayback(t: number) { play = playbackReduce(play, { type: 'time', t }); applyPlayback(); },
    // Sticky: nothing is shown again until the next setPlayback or a new scenario.
    stopPlayback() { play = playbackReduce(play, { type: 'stop' }); applyPlayback(); },
    aimed: () => aimed,
    inspect, returnToRoom, turn, step, reset, snapshot, draw,
    dispose() {
      if (disposed) return; disposed = true; abort.abort(); observer.disconnect(); renderer.setAnimationLoop(null);
      play = PLAYBACK_IDLE; buildGhosts(); figures?.dispose(); if (asset) release(asset);
      ringGeometry.dispose(); burstGeometry.dispose(); ghostPoints.dispose();
      canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('keyup', keyup); canvas.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('webglcontextlost', lost);
      motion.removeEventListener('change', motionChange); document.removeEventListener('visibilitychange', draw);
      models.forEach(m => { release(m.object); m.holo.dispose(); });
      geometry?.dispose(); material.dispose(); dust.dispose(); particles.material.dispose(); renderer.dispose();
    },
  };
}
