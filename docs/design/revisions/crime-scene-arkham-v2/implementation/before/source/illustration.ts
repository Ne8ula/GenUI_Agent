import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Point } from './state.ts';

// shortcut: authored th_0028 illustration; replace with registered surfaces before making geometric claims.
export function createSceneIllustration() {
  const group = new THREE.Group();
  group.name = 'photo-guided-approximation';
  const surfaces: { material: THREE.ShaderMaterial; edge: THREE.LineBasicMaterial; color: THREE.Color; tags: number[] }[] = [];
  const panorama = 'pano_th_0028_coul.jpg';
  function object(name: string, at: Point, tags: number[] = [], sources = [panorama]) {
    const result = new THREE.Group(); result.name = name; result.position.set(...at);
    result.userData = { provenance: 'photo-guided-approximation', tags, sources };
    group.add(result); return result;
  }
  function part(parent: THREE.Group, geometry: THREE.BufferGeometry, color: string) {
    const base = new THREE.Color(color);
    const material = new THREE.ShaderMaterial({
      uniforms: { base: { value: base }, detective: { value: false }, selected: { value: false } },
      vertexShader: `varying vec3 n; varying vec3 eye; varying vec3 world;
        void main(){ vec4 p=modelViewMatrix*vec4(position,1.0);
          n=normalize(normalMatrix*normal); eye=-p.xyz; world=(modelMatrix*vec4(position,1.0)).xyz;
          gl_Position=projectionMatrix*p; }`,
      fragmentShader: `uniform vec3 base; uniform bool detective; uniform bool selected;
        varying vec3 n; varying vec3 eye; varying vec3 world;
        void main(){ vec3 normal=normalize(n);
          float light=.48+.52*max(0.0,dot(normal,normalize(vec3(-.4,.7,.8))));
          float rim=pow(1.0-abs(dot(normal,normalize(eye))),3.0);
          float l=dot(base,vec3(.2126,.7152,.0722));
          vec3 cool=mix(vec3(.018,.035,.055),vec3(.12,.23,.29),sqrt(l));
          vec3 tint=detective ? cool*light+vec3(.12,.35,.42)*rim : base*light;
          if(selected) tint=mix(tint,vec3(.62,.31,.07),detective ? .42 : .18);
          gl_FragColor=vec4(tint,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    const mesh = new THREE.Mesh(geometry, material); mesh.userData = { ...parent.userData };
    parent.add(mesh);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: base.clone().multiplyScalar(.55), transparent: true, opacity: .55 });
    parent.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), edgeMaterial));
    surfaces.push({ material, edge: edgeMaterial, color: base, tags: parent.userData.tags });
  }
  function box(parent: THREE.Group, size: Point, at: Point, color: string, radius = 0) {
    const geometry = radius ? new RoundedBoxGeometry(...size, 3, radius) : new THREE.BoxGeometry(...size);
    part(parent, geometry.translate(...at), color);
  }
  function rod(parent: THREE.Group, a: Point, b: Point, radius: number, color: string) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 12);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    geometry.translate(...from.add(to).multiplyScalar(.5).toArray()); part(parent, geometry, color);
  }
  const floor = object('floor', [0, 0, 0]);
  box(floor, [3.35, 3.43, .1], [.175, -1.135, -.005], '#4b3730');
  for (let i = 0; i < 18; i++) {
    const x = -1.5 + (i + .5) * 3.35 / 18;
    box(floor, [3.35 / 18 - .004, 3.42, .012], [x, -1.135, .051], ['#86513b', '#935c43', '#7c4a35', '#9b6246'][i % 4]!);
    for (let j = 0; j < 3; j++) box(floor, [3.35 / 18 - .004, .004, .002], [x, -2.4 + j * .98 + (i % 2) * .32, .058], '#4b342b');
  }
  const rug = object('rug', [.05, -.95, .065], [], [panorama, 'IMG_20240306_133620.jpg']);
  box(rug, [2.1, 2.55, .016], [0, 0, 0], '#b6a584');
  box(rug, [1.94, 2.39, .018], [0, 0, .002], '#536550');
  box(rug, [1.65, 2.1, .02], [0, 0, .004], '#879279');
  // Decorative border only, not a reproduction of evidentiary marks in the photograph.
  for (const x of [-.92, .92]) for (let i = 0; i < 12; i++) {
    const detail = new THREE.BoxGeometry(.055, .055, .004).rotateZ(Math.PI / 4).translate(x, -1.07 + i * .195, .015);
    part(rug, detail, '#c1b391');
  }
  const sofa = object('sofa', [1.1, -.72, .06], [21], [panorama, 'IMG_20240306_133627.jpg']);
  sofa.rotation.z = 1.30;
  box(sofa, [1.96, .8, .12], [0, 0, .27], '#5f5c59', .04);
  for (const x of [-.5, .5]) {
    box(sofa, [.97, .73, .18], [x, .02, .39], '#918e8a', .065);
    const back = new RoundedBoxGeometry(.97, .17, .59, 3, .065).rotateX(-.15).translate(x, -.31, .68);
    part(sofa, back, '#827e7b');
  }
  for (const x of [-.77, .77]) for (const y of [-.27, .27]) rod(sofa, [x, y, .03], [x, y, .27], .025, '#454b4b');
  const cushion = object('cushion', [1.11, -.4, .59], [32], [panorama, 'IMG_20240306_133635.jpg']);
  cushion.rotation.set(.16, -.12, 1.3);
  box(cushion, [.46, .42, .14], [0, 0, 0], '#e2dfcf', .065);
  function chair(parent: THREE.Group, pale: boolean) {
    const seat = pale ? '#c2b594' : '#333737', frame = pale ? '#9ba19c' : '#7b888b';
    box(parent, [.47, .43, .045], [0, 0, .43], seat, .025);
    box(parent, [.45, .055, .28], [0, -.19, .75], seat, .025);
    for (const x of [-.19, .19]) {
      rod(parent, [x * 1.1, .2, 0], [x, .16, .43], .018, frame);
      rod(parent, [x * 1.1, -.22, 0], [x, -.19, .88], .018, frame);
      rod(parent, [x, -.19, .38], [x, .16, .38], .014, frame);
    }
  }
  const upright = object('upright-chair', [-1.04, -1.38, .06], [], [panorama, 'IMG_20240306_133620.jpg']);
  upright.rotation.z = -Math.PI / 2; chair(upright, true);
  for (const [tag, x, y, photo] of [[12, -.94, -1.26, 'IMG_20240306_133515.jpg'], [69, -.97, -1.5, 'IMG_20240306_133524.jpg']] as const) {
    const bottle = object(`bottle-${tag}`, [x, y, .515], [tag], [panorama, photo]);
    rod(bottle, [0, 0, .01], [0, 0, .17], .035, '#366b42');
    rod(bottle, [0, 0, .16], [0, 0, .25], .016, '#366b42');
    box(bottle, [.06, .065, .065], [0, 0, .1], '#c9c1a2', .005);
  }
  const overturned = object('overturned-chair', [.13, -1.36, 0], [18], [panorama, 'IMG_20240306_133552.jpg']);
  chair(overturned, false); overturned.rotation.set(2.05, 0, -.45);
  group.updateMatrixWorld(true);
  overturned.position.z = .08 - new THREE.Box3().setFromObject(overturned).min.z;
  const cabinet = object('cabinet', [.15, -2.36, .06], [], [panorama]);
  box(cabinet, [.4, .4, .61], [0, 0, .305], '#342e2b', .008);
  box(cabinet, [.43, .43, .025], [0, 0, .625], '#493c32', .008);
  for (const z of [.12, .31, .5]) {
    box(cabinet, [.36, .018, .165], [0, .208, z], '#423731', .006);
    rod(cabinet, [-.075, .237, z + .015], [.075, .237, z + .015], .008, '#a1a49b');
  }
  const table = object('side-table', [1.42, -1.97, .06], [], [panorama, 'IMG_20240306_133601.jpg']);
  part(table, new THREE.CylinderGeometry(.19, .19, .035, 32).rotateX(Math.PI / 2).translate(0, 0, .48), '#baac87');
  for (const angle of [0, 2.094, 4.189]) {
    const x = Math.cos(angle) * .13, y = Math.sin(angle) * .13;
    rod(table, [x, y, .02], [x, y, .47], .018, '#a99572');
  }
  // Low illustrative boundaries keep orientation readable; they are not fitted scan planes.
  const backWall = object('back-wall', [0, .55, .06]);
  box(backWall, [3.35, .06, 1.4], [.175, 0, .7], '#b7b7ac');
  box(backWall, [3.35, .08, .07], [.175, -.025, .035], '#d4cdbc');
  const sideWall = object('side-wall', [-1.47, 0, .06]);
  box(sideWall, [.06, 3.43, 1.4], [0, -1.135, .7], '#c3bfb3');
  // Blinds are authored visual context, not registered window/door geometry.
  for (let i = 0; i < 15; i++) box(sideWall, [.035, 1.12, .025], [.045, -1.45, .62 + i * .048], '#e1dccb');
  const nearWall = object('near-wall', [1.82, 0, .06]); nearWall.userData.enclosure = true;
  box(nearWall, [.06, 3.43, 1.4], [0, -1.135, .7], '#b7b7ac');
  // Leave the illustrated entrance open instead of manufacturing a sealed measured room.
  const frontWall = object('front-wall', [0, -2.82, .06]); frontWall.userData.enclosure = true;
  box(frontWall, [1.3, .06, 1.4], [-.85, 0, .7], '#c3bfb3');
  box(frontWall, [.7, .06, 1.4], [1.5, 0, .7], '#c3bfb3');
  const boundaryGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.5, -2.85, -.08), new THREE.Vector3(1.85, -2.85, -.08),
    new THREE.Vector3(1.85, -2.85, -.08), new THREE.Vector3(1.85, .58, -.08),
  ]);
  const boundary = new THREE.LineSegments(boundaryGeometry, new THREE.LineDashedMaterial({ color: '#b5aa8c', dashSize: .055, gapSize: .045 }));
  boundary.computeLineDistances(); group.add(boundary);
  let disposed = false;
  return {
    group,
    setStyle(detective: boolean, selected: number | null) {
      for (const surface of surfaces) {
        const active = selected !== null && surface.tags.includes(selected);
        surface.material.uniforms.detective!.value = detective;
        surface.material.uniforms.selected!.value = active;
        surface.edge.color.copy(active ? new THREE.Color('#f5b35e') : detective ? new THREE.Color('#7cb9cc') : surface.color.clone().multiplyScalar(.55));
        surface.edge.opacity = detective || active ? .85 : .55;
      }
    },
    setCutaway(enabled: boolean) { for (const child of group.children) if (child.userData.enclosure) child.visible = !enabled; },
    dispose() {
      if (disposed) return; disposed = true;
      group.traverse(node => {
        if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
          node.geometry.dispose();
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
        }
      });
    },
  };
}
