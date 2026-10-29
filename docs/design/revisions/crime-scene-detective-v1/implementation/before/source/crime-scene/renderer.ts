import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { verifiedMesh } from '../room/verified-mesh.ts';
import { createRoomMatrixMaterial } from '../room/matrix-style.ts';
import { FFS, displayPoint, inCrop, inCutaway } from './state.ts';
import type { SceneData, Point, Marker } from './state.ts';
const source = { bytes: 10684860, sha256: 'f72bf4ff75ee242e4327d442e02ae9bb11ee779ba2b0c8684efe0ab571e984c0' };
type Pose = { position: Point; target: Point; zoom: number };
export type CameraView = Pose & { returnView?: Pose };
export type SceneRenderer = ReturnType<typeof createSceneRenderer>;
export function createSceneRenderer(canvas: HTMLCanvasElement, data: SceneData, labels: HTMLElement,
  onError: (text: string) => void, onMove: () => void, initial?: CameraView) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  const ratio = Math.min(devicePixelRatio, 1.5); renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#111615');
  const bounds = new THREE.Box3(new THREE.Vector3(...data.crop.min), new THREE.Vector3(...data.crop.max));
  bounds.translate(new THREE.Vector3(0, 0, -349.2));
  const center = bounds.getCenter(new THREE.Vector3()), radius = bounds.getSize(new THREE.Vector3()).length() / 2;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .025, 60); camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.minZoom = .6; controls.maxZoom = 8;
  controls.listenToKeyEvents(canvas);
  const abort = new AbortController(); let disposed = false, geometry: THREE.BufferGeometry | undefined;
  let returnView: CameraView | undefined = initial?.returnView;
  const material = createRoomMatrixMaterial(ratio);
  // Reuse the static Bayer treatment on scan points, not invented triangle surfaces.
  material.uniforms.cutawayEnabled = { value: true };
  material.fragmentShader = 'uniform bool cutawayEnabled; varying float aperture;\n' + material.fragmentShader.replace('void main(){', 'void main(){ if(cutawayEnabled && aperture < .5) discard;');
  material.vertexShader = `uniform float pixelRatio;
    attribute float inAperture; varying float aperture;
    attribute vec3 color; varying vec3 ink; varying vec3 facingNormal;
    varying vec3 eyePosition; varying float shell; varying float inferred;
    void main(){ vec4 eye=modelViewMatrix*vec4(position,1.0);
      aperture=inAperture; eyePosition=eye.xyz; facingNormal=normalize(-eye.xyz);
      float l=dot(color,vec3(.2126,.7152,.0722));
      ink=mix(color,vec3(l*.65,l,l*.9),.4); shell=0.0; inferred=0.0;
      gl_Position=projectionMatrix*eye; gl_PointSize=3.0*pixelRatio; }`;
  const projected = data.markers.map(marker => ({ marker, p: new THREE.Vector3(...displayPoint(marker.centroid, data.crop)) }));
  function draw() {
    if (disposed) return;
    renderer.render(scene, camera);
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
    const aspect = Math.max(1, rect.width) / Math.max(1, rect.height), half = radius * 1.06 / Math.min(1, aspect);
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix(); draw();
  };
  controls.addEventListener('change', draw); controls.addEventListener('start', onMove);
  canvas.addEventListener('keydown', key); canvas.addEventListener('pointerdown', focus); canvas.addEventListener('webglcontextlost', lost);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  if (initial) restore(initial); else reset();
  return {
    async load(progress: (value: number) => void) {
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
    },
    setCutaway(enabled: boolean) { material.uniforms.cutawayEnabled!.value = enabled; draw(); },
    inspect, returnToRoom, zoom, turn, reset, snapshot, draw,
    dispose() {
      if (disposed) return; disposed = true; abort.abort(); observer.disconnect(); controls.dispose();
      canvas.removeEventListener('keydown', key); canvas.removeEventListener('pointerdown', focus); canvas.removeEventListener('webglcontextlost', lost);
      geometry?.dispose(); material.dispose(); renderer.dispose();
    },
  };
}
