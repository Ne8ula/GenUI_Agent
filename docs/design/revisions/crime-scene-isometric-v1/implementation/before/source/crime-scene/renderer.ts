import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { verifiedMesh } from '../room/verified-mesh.ts';
import { createRoomMatrixMaterial } from '../room/matrix-style.ts';
import { FFS, displayPoint, inCrop } from './state.ts';
import type { SceneData, Point, Marker } from './state.ts';
const source = { bytes: 10684860, sha256: 'f72bf4ff75ee242e4327d442e02ae9bb11ee779ba2b0c8684efe0ab571e984c0' };
export type CameraView = { position: Point; target: Point; returnView?: { position: Point; target: Point } };
export type SceneRenderer = ReturnType<typeof createSceneRenderer>;
export function createSceneRenderer(canvas: HTMLCanvasElement, data: SceneData, labels: HTMLElement,
  onError: (text: string) => void, onMove: () => void, initial?: CameraView) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  const ratio = Math.min(devicePixelRatio, 1.5); renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#111615');
  const camera = new THREE.PerspectiveCamera(70, 1, .025, 40); camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false; controls.minDistance = .35; controls.maxDistance = 10;
  controls.listenToKeyEvents(canvas);
  const abort = new AbortController(); let disposed = false, geometry: THREE.BufferGeometry | undefined;
  let returnView: CameraView | undefined = initial?.returnView;
  const material = createRoomMatrixMaterial(ratio);
  // Reuse the static Bayer treatment on scan points, not invented triangle surfaces.
  material.vertexShader = `uniform float pixelRatio;
    attribute vec3 color; varying vec3 ink; varying vec3 facingNormal;
    varying vec3 eyePosition; varying float shell; varying float inferred;
    void main(){ vec4 eye=modelViewMatrix*vec4(position,1.0);
      eyePosition=eye.xyz; facingNormal=normalize(-eye.xyz);
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
  const snapshot = (): CameraView => ({ position: camera.position.toArray() as Point, target: controls.target.toArray() as Point, ...(returnView ? { returnView } : {}) });
  function restore(view: CameraView) { camera.position.fromArray(view.position); controls.target.fromArray(view.target); controls.update(); draw(); }
  function reset() { returnView = undefined; restore({ position: [.1, -.65, 2.8], target: [.1, -1.2, .2] }); }
  function inspect(marker: Marker) {
    returnView ??= snapshot();
    const target = new THREE.Vector3(...displayPoint(marker.centroid, data.crop));
    const offset = camera.position.clone().sub(controls.target).normalize().multiplyScalar(.95);
    controls.target.copy(target); camera.position.copy(target).add(offset); controls.update(); draw();
  }
  function returnToRoom() { if (returnView) { restore(returnView); returnView = undefined; } }
  function zoom(closer: boolean) {
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * (closer ? .85 : 1.18), .35, 10));
    camera.position.copy(controls.target).add(offset); controls.update(); draw();
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
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix(); draw();
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
        const xyz: number[] = [], rgb: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          const p: Point = [pos.getX(i), pos.getY(i), pos.getZ(i)];
          if (!inCrop(p, data.crop)) continue;
          xyz.push(...displayPoint(p, data.crop)); rgb.push(colors.getX(i), colors.getY(i), colors.getZ(i));
        }
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
        scene.add(new THREE.Points(geometry, material)); resize();
      } finally { original.dispose(); }
    },
    inspect, returnToRoom, zoom, turn, reset, snapshot, draw,
    dispose() {
      if (disposed) return; disposed = true; abort.abort(); observer.disconnect(); controls.dispose();
      canvas.removeEventListener('keydown', key); canvas.removeEventListener('pointerdown', focus); canvas.removeEventListener('webglcontextlost', lost);
      geometry?.dispose(); material.dispose(); renderer.dispose();
    },
  };
}
