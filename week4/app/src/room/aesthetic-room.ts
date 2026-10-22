import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { CandidateCamera, CandidateGeometry } from './CandidateView.tsx';

export type AestheticObject = {
  id: string;
  label: string;
  sourceViews: number[];
  assumptions: string;
  /** Triangle ownership makes the authored object manifest inspectable. */
  firstTriangle: number;
  triangleCount: number;
};

export const AESTHETIC_ROOM_BOUNDS = {
  min: [-1.5, -2, 0],
  max: [1.5, 2, 2.6],
  units: 'authored-relative-units',
} as const;

/** Median encoded RGB of explicit crops in the original 480×640 source bytes.
 * Crops are [x,y,width,height], origin top left, views one-based. These colors
 * are source-supported appearance; assigning them to invented geometry is still
 * authored. The render's baked shading changes the final displayed RGB.
 */
export const AESTHETIC_PALETTE_SAMPLES = [
  { name: 'wall', sourceView: 3, imageSha256: 'd6e899e99b11dca8d05b10115e331a31b4b1cf0367ddeba816b764c74df2c525', crop: [230,45,100,90], medianRgb: [215,210,194], hex: '#d7d2c2' },
  { name: 'floor', sourceView: 1, imageSha256: '69343fa715b4bb1a507befe738d3c32c55fcb3177bb63437fa294bf657bf33d6', crop: [240,450,90,80], medianRgb: [82,86,84], hex: '#525654' },
  { name: 'sofa', sourceView: 3, imageSha256: 'd6e899e99b11dca8d05b10115e331a31b4b1cf0367ddeba816b764c74df2c525', crop: [140,555,100,65], medianRgb: [102,100,98], hex: '#666462' },
  { name: 'back', sourceView: 3, imageSha256: 'd6e899e99b11dca8d05b10115e331a31b4b1cf0367ddeba816b764c74df2c525', crop: [190,235,80,40], medianRgb: [101,95,91], hex: '#655f5b' },
  { name: 'cushion', sourceView: 3, imageSha256: 'd6e899e99b11dca8d05b10115e331a31b4b1cf0367ddeba816b764c74df2c525', crop: [20,280,40,40], medianRgb: [60,52,57], hex: '#3c3439' },
  { name: 'cream', sourceView: 3, imageSha256: 'd6e899e99b11dca8d05b10115e331a31b4b1cf0367ddeba816b764c74df2c525', crop: [67,410,12,40], medianRgb: [209,204,190], hex: '#d1ccbe' },
  { name: 'wood', sourceView: 5, imageSha256: '4ce7dd60877417c74457806137022246d721ae41a7b278cba978cb69d19114db', crop: [220,177,80,20], medianRgb: [172,148,105], hex: '#ac9469' },
  { name: 'cabinet', sourceView: 7, imageSha256: '7557d72ec3a3a668be2f22ecf470c96bb95229558872729d0de3e57605ba0a13', crop: [119,430,45,65], medianRgb: [194,192,177], hex: '#c2c0b1' },
  { name: 'screen', sourceView: 1, imageSha256: '69343fa715b4bb1a507befe738d3c32c55fcb3177bb63437fa294bf657bf33d6', crop: [146,146,24,82], medianRgb: [96,95,88], hex: '#605f58' },
  { name: 'dark', sourceView: 5, imageSha256: '4ce7dd60877417c74457806137022246d721ae41a7b278cba978cb69d19114db', crop: [90,124,65,15], medianRgb: [44,45,38], hex: '#2c2d26' },
  { name: 'chair', sourceView: 5, imageSha256: '4ce7dd60877417c74457806137022246d721ae41a7b278cba978cb69d19114db', crop: [98,236,40,40], medianRgb: [218,212,196], hex: '#dad4c4' },
  { name: 'metal', sourceView: 5, imageSha256: '4ce7dd60877417c74457806137022246d721ae41a7b278cba978cb69d19114db', crop: [161,310,7,26], medianRgb: [70,77,73], hex: '#464d49' },
  { name: 'lamp', sourceView: 7, imageSha256: '7557d72ec3a3a668be2f22ecf470c96bb95229558872729d0de3e57605ba0a13', crop: [178,222,36,30], medianRgb: [193,185,153], hex: '#c1b999' },
  { name: 'window', sourceView: 1, imageSha256: '69343fa715b4bb1a507befe738d3c32c55fcb3177bb63437fa294bf657bf33d6', crop: [363,14,30,30], medianRgb: [255,255,255], hex: '#ffffff' },
] as const;
type PaletteName = typeof AESTHETIC_PALETTE_SAMPLES[number]['name'];
const palette = Object.fromEntries(AESTHETIC_PALETTE_SAMPLES.map(sample => [sample.name, sample.hex])) as Record<PaletteName, string>;

/** Hand-authored study of the seven public photos of ARKitScenes 42445021.
 * This is deliberately independent of the fragmentary VGGT mesh. It is neither
 * automatic object recognition nor measured reconstruction of hidden surfaces.
 * View numbers refer to the seven-photo VGA selection, starting at one.
 */
export function buildAestheticRoom(): {
  geometry: CandidateGeometry;
  camera: CandidateCamera;
  objects: AestheticObject[];
  views: { label: string; camera: CandidateCamera }[];
  paletteSamples: typeof AESTHETIC_PALETTE_SAMPLES;
} {
  const geometry: CandidateGeometry = { positions: [], colors: [], indices: [], provenance: [], samplingGroups: [] };
  const objects: AestheticObject[] = [];
  let category = 'authored-aesthetic-object';
  let primitive = 0;
  const light = new THREE.Vector3(-.35, .6, 1).normalize();

  function append(buffer: THREE.BufferGeometry, color: string) {
    const positions = buffer.getAttribute('position');
    const normals = buffer.getAttribute('normal');
    const offset = geometry.positions.length / 3;
    const rgb = [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16) / 255);
    const normal = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      geometry.positions.push(positions.getX(i), positions.getY(i), positions.getZ(i));
      normal.fromBufferAttribute(normals, i);
      // Display-only lighting baked into authored colors, never source pixels.
      const shade = .76 + .24 * Math.max(0, normal.dot(light));
      geometry.colors.push(rgb[0]! * shade, rgb[1]! * shade, rgb[2]! * shade);
    }
    const index = buffer.getIndex();
    const count = index ? index.count : positions.count;
    for (let i = 0; i < count; i++) geometry.indices.push(offset + (index ? index.getX(i) : i));
    // Nearby closed primitives need independent spacing: hidden carcass samples
    // must not consume visible cabinet-front samples. Opposite faces of a thin
    // primitive also need distinct groups, or a pane's back erases its front.
    for (let i = 0; i < count / 3; i++) {
      const facing = [0, 0, 0];
      for (let corner = 0; corner < 3; corner++) {
        const vertex = index ? index.getX(i * 3 + corner) : i * 3 + corner;
        facing[0]! += normals.getX(vertex);
        facing[1]! += normals.getY(vertex);
        facing[2]! += normals.getZ(vertex);
      }
      let axis = 0;
      for (let candidate = 1; candidate < 3; candidate++) {
        if (Math.abs(facing[candidate]!) > Math.abs(facing[axis]!)) axis = candidate;
      }
      geometry.provenance.push(category);
      geometry.samplingGroups!.push(primitive * 6 + axis * 2 + (facing[axis]! < 0 ? 1 : 0));
    }
    primitive++;
    buffer.dispose();
  }

  function box(
    size: [number, number, number], at: [number, number, number],
    color: string, radius = .035, rotation: [number, number, number] = [0, 0, 0],
  ) {
    const buffer = radius > 0
      ? new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(v => v * .45)))
      : new THREE.BoxGeometry(...size);
    buffer.rotateX(rotation[0]); buffer.rotateY(rotation[1]); buffer.rotateZ(rotation[2]);
    buffer.translate(...at); append(buffer, color);
  }

  function cylinder(top: number, bottom: number, height: number, at: [number, number, number], color: string) {
    const buffer = new THREE.CylinderGeometry(top, bottom, height, 20, 1, false);
    buffer.rotateX(Math.PI / 2); buffer.translate(...at); append(buffer, color);
  }

  function rod(from: [number, number, number], to: [number, number, number], radius: number, color: string) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const buffer = new THREE.CylinderGeometry(radius, radius, direction.length(), 12, 1, false);
    buffer.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    buffer.translate(...a.add(b).multiplyScalar(.5).toArray()); append(buffer, color);
  }

  function object(id: string, label: string, sourceViews: number[], assumptions: string, build: () => void, shell = false) {
    const firstTriangle = geometry.indices.length / 3;
    category = shell ? 'authored-room-shell' : 'authored-aesthetic-object';
    build();
    objects.push({ id, label, sourceViews, assumptions, firstTriangle, triangleCount: geometry.indices.length / 3 - firstTriangle });
  }

  object('room', 'Closed single-room shell', [1, 2, 3, 4, 5, 6, 7],
    'Rectangular footprint, height and all hidden wall extents are authored. Relative units are not measured dimensions.', () => {
      box([3.16, 4.16, .08], [0, 0, -.04], palette.floor, 0);
      box([3.16, 4.16, .08], [0, 0, 2.64], palette.wall, 0);
      box([.08, 4.16, 2.6], [-1.54, 0, 1.3], palette.wall, 0);
      box([.08, 4.16, 2.6], [1.54, 0, 1.3], palette.wall, 0);
      box([3, .08, 2.6], [0, -2.04, 1.3], palette.wall, 0);
      box([3, .08, 2.6], [0, 2.04, 1.3], palette.wall, 0);
      for (const x of [-1.48, 1.48]) box([.04, 4, .09], [x, 0, .045], palette.wall, .006);
      for (const y of [-1.98, 1.98]) box([2.96, .04, .09], [0, y, .045], palette.wall, .006);
    }, true);

  object('window', 'Closed window and radiator', [1, 2],
    'Window frame and opaque pale glass are simplified. No view or geometry beyond this room is generated.', () => {
      box([1.52, .08, 1.33], [-.1, 1.94, 1.7], palette.wall, .012);
      box([1.36, .025, 1.17], [-.1, 1.885, 1.7], palette.window, .008);
      box([.055, .035, 1.19], [-.1, 1.864, 1.7], palette.wall, .008);
      box([1.38, .035, .045], [-.1, 1.864, 1.52], palette.wall, .006);
      box([1.7, .25, .055], [-.1, 1.86, 1.02], palette.wall, .012);
      box([1.25, .11, .54], [-.1, 1.88, .48], palette.wall, .025);
      for (let i = 0; i < 15; i++) box([.025, .015, .44], [-.65 + i * .078, 1.817, .48], palette.wall, .006);
    });

  object('sofa', 'Complete soft sofa', [1, 2, 3, 4],
    'Complete back, underside and feet are inferred from a partly visible armless fabric sofa. Proportions, fabric folds and cushion patterns are simplified.', () => {
      for (const y of [-.48, 1.32]) for (const x of [.68, 1.32]) cylinder(.035, .03, .12, [x, y, .1], palette.dark);
      box([.96, 2.18, .3], [.99, .42, .29], palette.sofa, .10);
      box([.23, 2.15, .74], [1.34, .42, .66], palette.back, .11);
      for (const y of [-.08, .89]) {
        box([.72, .94, .19], [.88, y, .49], palette.sofa, .075);
        box([.20, .91, .58], [1.18, y, .84], palette.cushion, .085, [0, -.12, 0]);
      }
      box([.17, .44, .43], [1.04, .32, .82], palette.cream, .08, [.1, -.19, .12]);
      box([.18, .39, .38], [1.04, .87, .79], palette.cream, .075, [-.08, -.15, -.08]);
    });

  object('cabinet', 'TV cabinet', [1, 7],
    'Cabinet doors, complete side panels and supports are authored from visible light wood furniture.', () => {
      box([.44, 2.14, .65], [-1.25, .51, .4], palette.wood, .035);
      box([.49, 2.19, .055], [-1.23, .51, .75], palette.wood, .018);
      for (const y of [-.18, .48]) {
        box([.025, .63, .55], [-1.016, y, .41], palette.cabinet, .012);
        rod([-.99, y + .22, .58], [-.96, y + .22, .58], .017, palette.metal);
      }
      for (const z of [.19, .34, .49, .64]) {
        box([.025, .65, .135], [-1.016, 1.16, z], palette.cabinet, .012);
        rod([-.99, 1.16, z], [-.96, 1.16, z], .017, palette.metal);
      }
      for (const y of [-.46, 1.48]) for (const x of [-1.39, -1.09]) cylinder(.025, .023, .1, [x, y, .05], palette.wood);
    });

  object('television', 'Complete television', [1, 7],
    'The display is an opaque softened rectangle with inferred rear casing and stand; screen content is not reconstructed.', () => {
      box([.09, 1.06, .68], [-1.22, .7, 1.18], palette.dark, .025);
      box([.016, .99, .6], [-1.165, .7, 1.18], palette.screen, .012);
      box([.09, .08, .15], [-1.23, .7, .83], palette.dark, .018);
      box([.26, .39, .035], [-1.2, .7, .786], palette.dark, .015);
    });

  object('lamp', 'Cabinet lamp', [7],
    'Closed lampshade, stem and base are simplified from the visible lamp.', () => {
      cylinder(.09, .11, .045, [-1.21, -.13, .8], palette.lamp);
      cylinder(.045, .07, .21, [-1.21, -.13, .92], palette.lamp);
      cylinder(.095, .17, .23, [-1.21, -.13, 1.12], palette.lamp);
    });

  object('desk', 'Complete desk', [4, 5, 6],
    'A complete tabletop and four legs replace cutoff fragments. Hidden construction is authored, not recovered.', () => {
      box([1.56, .59, .065], [.61, -1.64, .79], palette.wood, .024);
      for (const x of [-.1, 1.32]) for (const y of [-1.88, -1.40]) cylinder(.025, .025, .73, [x, y, .39], palette.chair);
      rod([-.1, -1.87, .27], [1.32, -1.87, .27], .018, palette.metal);
    });

  object('printer', 'Printer', [4, 5],
    'Printer silhouette is recognized visually; tray, lid, back and underside are simplified and completed.', () => {
      box([.49, .34, .18], [.18, -1.66, .91], palette.chair, .04);
      box([.44, .31, .045], [.18, -1.66, 1.025], palette.chair, .018);
      box([.37, .025, .07], [.18, -1.479, .92], palette.dark, .012);
      box([.32, .16, .025], [.18, -1.43, .83], palette.metal, .008);
    });

  object('chair', 'Complete desk chair', [4, 5],
    'Seat, curved-looking back and pedestal are complete authored solids. A five-spoke base is an approximation of the visible chair.', () => {
      box([.47, .43, .09], [.64, -1.13, .49], palette.chair, .045);
      box([.46, .095, .44], [.64, -.93, .72], palette.chair, .045, [-.08, 0, 0]);
      cylinder(.035, .04, .35, [.64, -1.13, .275], palette.metal);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        const x = .64 + Math.cos(angle) * .29, y = -1.13 + Math.sin(angle) * .29;
        rod([.64, -1.13, .15], [x, y, .065], .021, palette.metal);
        cylinder(.033, .033, .055, [x, y, .04], palette.dark);
      }
    });

  object('door', 'Closed doorway', [5, 6],
    'The photographed open door is closed in this candidate to keep exactly one room. The adjoining hallway is excluded.', () => {
      box([.89, .055, 2.08], [-.83, -1.96, 1.04], palette.wall, .012);
      box([.73, .02, .81], [-.83, -1.92, 1.54], palette.wall, .008);
      box([.73, .02, .81], [-.83, -1.92, .56], palette.wall, .008);
      for (const x of [-1.31, -.35]) box([.065, .09, 2.15], [x, -1.93, 1.075], palette.wall, .01);
      box([1.025, .09, .065], [-.83, -1.93, 2.12], palette.wall, .01);
      box([.12, .055, .025], [-.55, -1.885, 1.02], palette.metal, .012);
    });

  const camera: CandidateCamera = { position: [-.55, -1.38, 1.5], forward: [.32, 1, -.13], up: [0, 0, 1] };
  return {
    geometry, camera, objects, paletteSamples: AESTHETIC_PALETTE_SAMPLES,
    views: [
      { label: 'From the doorway', camera },
      { label: 'Sofa and window', camera: { position: [-.75, -.6, 1.35], forward: [1.3, 1.2, -.16], up: [0, 0, 1] } },
      { label: 'Desk and chair', camera: { position: [.0, .55, 1.45], forward: [.3, -1, -.42], up: [0, 0, 1] } },
      { label: 'TV and lamp', camera: { position: [1.1, -.25, 1.25], forward: [-1, .32, -.28], up: [0, 0, 1] } },
    ],
  };
}
