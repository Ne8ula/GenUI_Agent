import * as THREE from 'three';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { verifiedMesh } from '../room/verified-mesh.ts';
import { createTeddy, placeTeddy } from '../bedroom/memory.ts';
import { createRoomCompletion } from '../bedroom/completion.ts';
import { sampleSurfacePoints } from '../room/surface-points.ts';

const source = { bytes: 24837257, sha256: 'd3296808e9cb9deec138fa1fce02495d5f84a0e894f56008d7013aedc7721bdc' };
const EYE_Z = .25, PITCH = -.32;
export type DemoRenderer = ReturnType<typeof createDemoRenderer>;

// Every point flies from a shared origin to its place; `seed` staggers arrival, `shifted` is the recoloured target.
function formingMaterial(origin: THREE.Vector3, size: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uShift: { value: 0 }, uOrigin: { value: origin }, uSweep: { value: -99 }, uSize: { value: size }, uTime: { value: 0 } },
    vertexShader: `
      attribute vec3 tint; attribute vec3 shifted; attribute float seed; attribute vec3 scatter;
      uniform float uProgress, uShift, uSize, uSweep, uTime; uniform vec3 uOrigin;
      varying vec3 vColor;
      void main() {
        float t = clamp((uProgress - seed * .8) / .2, 0., 1.);
        float e = t * t * (3. - 2. * t);
        float s = clamp((uShift - seed * .7) / .3, 0., 1.);
        float pulse = sin(3.14159 * s);
        vec3 swirl = vec3(sin(uTime * 2. + seed * 60.), cos(uTime * 1.7 + seed * 40.), sin(uTime * 1.3 + seed * 90.)) * .06 * (1. - e);
        vec3 p = mix(uOrigin + scatter * .35 + swirl, position, e) + scatter * .025 * pulse;
        vec3 base = mix(tint, shifted, s);
        vColor = mix(vec3(1., .16, .12), base, smoothstep(.45, 1., e));
        vColor += vec3(.9, .22, .16) * (1. - smoothstep(0., .06, abs(position.z - uSweep))) * e;
        vColor += vec3(.35, .55, 1.) * pulse * .7;
        gl_PointSize = t <= 0. ? 0. : uSize * (1. + (1. - e) * 1.6 + pulse * .8);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.);
        #include <colorspace_fragment>
      }`,
  });
}

function formingGeometry(positions: ArrayLike<number>, tints: ArrayLike<number>, shifted: ArrayLike<number>, stride: number, height?: [number, number]) {
  const count = Math.floor(positions.length / 3 / stride);
  const pos = new Float32Array(count * 3), tint = new Float32Array(count * 3), shift = new Float32Array(count * 3);
  const seed = new Float32Array(count), scatter = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) { pos[i * 3 + k] = positions[i * stride * 3 + k]!; tint[i * 3 + k] = tints[i * stride * 3 + k]!; shift[i * 3 + k] = shifted[i * stride * 3 + k]!; }
    // Floor-up build order with noise, so the room reads as being assembled rather than faded in.
    seed[i] = height ? .55 * Math.random() + .45 * (pos[i * 3 + 2]! - height[0]) / (height[1] - height[0]) : Math.random();
    v.randomDirection().multiplyScalar(.4 + Math.random()).toArray(scatter, i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tint, 3));
  geometry.setAttribute('shifted', new THREE.BufferAttribute(shift, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute('scatter', new THREE.BufferAttribute(scatter, 3));
  return geometry;
}

export function createDemoRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#050606');
  const camera = new THREE.PerspectiveCamera(62, 2, .025, 40); camera.up.set(0, 0, 1);
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, stencilWrite: true, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp });
  const walker = { x: -.25, y: 2.35, yaw: Math.atan2(1.63, .67) };
  const bounds = new THREE.Box2(new THREE.Vector2(-9, -9), new THREE.Vector2(9, 9));
  const keys = new Set<string>();
  const tweens: { u: { value: number }; from: number; to: number; start: number; dur: number; done?: (() => void) | undefined }[] = [];
  let mesh: THREE.Mesh | undefined, room: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined, fill: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;
  let bear: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | undefined;
  let height: [number, number] = [-1.4, 1.2];
  let walking = false, disposed = false, last = performance.now();
  const teddy = createTeddy(); scene.add(teddy);

  function place() {
    camera.position.set(walker.x, walker.y, EYE_Z);
    const flat = Math.cos(PITCH);
    camera.lookAt(walker.x + Math.cos(walker.yaw) * flat, walker.y + Math.sin(walker.yaw) * flat, EYE_Z + Math.sin(PITCH));
  }
  function tween(u: { value: number }, to: number, dur: number, done?: () => void) {
    tweens.push({ u, from: u.value, to, start: performance.now(), dur, done });
  }
  const typing = () => document.activeElement instanceof HTMLInputElement;
  const down = (event: KeyboardEvent) => { if (!typing() && 'wasd'.includes(event.key.toLowerCase()) && event.key.length === 1) keys.add(event.key.toLowerCase()); };
  const up = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
  const blur = () => keys.clear();
  addEventListener('keydown', down); addEventListener('keyup', up); addEventListener('blur', blur);
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height); camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas);

  function frame(now: number) {
    if (disposed) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    for (const t of [...tweens]) {
      const k = Math.min(1, (now - t.start) / t.dur); t.u.value = t.from + (t.to - t.from) * k;
      if (k === 1) { tweens.splice(tweens.indexOf(t), 1); t.done?.(); }
    }
    if (walking && !typing()) {
      walker.yaw += ((keys.has('a') ? 1 : 0) - (keys.has('d') ? 1 : 0)) * 1.5 * dt;
      const step = ((keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0)) * 1.3 * dt;
      walker.x = THREE.MathUtils.clamp(walker.x + Math.cos(walker.yaw) * step, bounds.min.x, bounds.max.x);
      walker.y = THREE.MathUtils.clamp(walker.y + Math.sin(walker.yaw) * step, bounds.min.y, bounds.max.y);
    }
    place();
    for (const m of [room, fill, bear]) if (m) m.material.uniforms.uTime!.value = now / 1000;
    if (room) room.material.uniforms.uSweep!.value = room.material.uniforms.uProgress!.value < 1 ? height[0] + (height[1] - height[0]) * room.material.uniforms.uProgress!.value * 1.15 : -99;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  place(); requestAnimationFrame(frame);

  return {
    async load() {
      const buffer = await verifiedMesh('/assets/teal-bedroom/room.ply', source, new AbortController().signal, () => undefined);
      if (disposed) return;
      const geometry = new PLYLoader().parse(buffer);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      height = [box.min.z, box.max.z];
      bounds.set(new THREE.Vector2(box.min.x + .45, box.min.y + .45), new THREE.Vector2(box.max.x - .45, box.max.y - .45));
      mesh = new THREE.Mesh(geometry, depth); mesh.renderOrder = -1; mesh.visible = false; scene.add(mesh);
      placeTeddy(teddy, mesh);
      const origin = new THREE.Vector3(walker.x + Math.cos(walker.yaw) * .9, walker.y + Math.sin(walker.yaw) * .9, EYE_Z - .05);
      const colors = geometry.getAttribute('color').array;
      room = new THREE.Points(formingGeometry(geometry.getAttribute('position').array, colors, colors, 2, height), formingMaterial(origin, 2.2));
      room.renderOrder = 1; room.frustumCulled = false; scene.add(room);
      const shell = createRoomCompletion();
      const n = shell.getAttribute('position').count;
      const sampled = sampleSurfacePoints({ positions: shell.getAttribute('position').array, colors: shell.getAttribute('color').array, indices: Uint32Array.from({ length: n }, (_, i) => i) }, .024);
      const fillMaterial = formingMaterial(origin, 2.6);
      // Authored completion only fills where the scan wrote nothing (same rule as the bedroom view).
      fillMaterial.stencilWrite = true; fillMaterial.stencilRef = 1; fillMaterial.stencilFunc = THREE.NotEqualStencilFunc; fillMaterial.stencilWriteMask = 0;
      fill = new THREE.Points(formingGeometry(sampled.positions, sampled.colors, sampled.colors, 1, height), fillMaterial);
      fill.renderOrder = 1; fill.frustumCulled = false; scene.add(fill);
      shell.dispose();
      // Teddy: merge the authored matrix samples into one forming cloud; fur parts get a blue target.
      const pos: number[] = [], tint: number[] = [], blue: number[] = [];
      const blueColor = new THREE.Color('#5f9fe0'), c = new THREE.Color();
      for (const child of teddy.children) {
        if (child instanceof THREE.Points) {
          const p = child.geometry.getAttribute('position'), s = child.geometry.getAttribute('color');
          const fur = /^(body|head|ear-|arm-|foot-)/.test(child.name);
          for (let i = 0; i < p.count; i++) {
            pos.push(p.getX(i), p.getY(i), p.getZ(i));
            c.copy((child.material as THREE.PointsMaterial).color).multiplyScalar(s.getX(i)); tint.push(c.r, c.g, c.b);
            if (fur) c.copy(blueColor).multiplyScalar(s.getX(i)); blue.push(c.r, c.g, c.b);
          }
        }
        child.visible = false;
      }
      const bearOrigin = new THREE.Vector3(0, 0, .45);
      bear = new THREE.Points(formingGeometry(pos, tint, blue, 1), formingMaterial(bearOrigin, 2.8));
      bear.renderOrder = 2; bear.frustumCulled = false; teddy.add(bear); teddy.visible = true;
      resize();
    },
    build(seconds: number, done: () => void) {
      if (!room || !fill) return;
      tween(fill.material.uniforms.uProgress!, 1, seconds * 1000);
      tween(room.material.uniforms.uProgress!, 1, seconds * 1000, () => { mesh!.visible = true; walking = true; done(); });
    },
    materialize(seconds: number) { if (bear) tween(bear.material.uniforms.uProgress!, 1, seconds * 1000); },
    recolor(seconds: number) { if (bear) tween(bear.material.uniforms.uShift!, 1, seconds * 1000); },
    // Screen-space rectangle around the teddy, or null when it is behind the camera.
    teddyRect() {
      if (!bear) return null;
      bear.geometry.computeBoundingBox();
      const b = bear.geometry.boundingBox!, rect = canvas.getBoundingClientRect();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(teddy.matrixWorld);
        if (v.clone().applyMatrix4(camera.matrixWorldInverse).z > -.05) return null;
        v.project(camera);
        const x = (v.x + 1) / 2 * rect.width, y = (1 - v.y) / 2 * rect.height;
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    },
    dispose() {
      disposed = true; observer.disconnect();
      removeEventListener('keydown', down); removeEventListener('keyup', up); removeEventListener('blur', blur);
      for (const m of [room, fill, bear]) if (m) { m.geometry.dispose(); m.material.dispose(); }
      mesh?.geometry.dispose(); depth.dispose(); renderer.dispose();
    },
  };
}
