import { displayPoint } from './state.ts';
import type { Crop, Marker, Point, SceneData } from './state.ts';
// Grounded first-person view in display coordinates (z up). Walk limits follow the display crop, not detected walls.
export const EYE = 1.6, MARGIN = .25, REACH = 5, CONE = .12;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
// The scan was captured from a single position at the scanner origin, where coverage is most complete.
export function standpoint(crop: Crop): Point { return [0, 0, crop.min[2]! - 349.2 + EYE]; }
export function walk([x, y, z]: Point, yaw: number, forward: number, right: number, crop: Crop): Point {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [clamp(x + c * forward + s * right, crop.min[0]! + MARGIN, crop.max[0]! - MARGIN),
    clamp(y + s * forward - c * right, crop.min[1]! + MARGIN, crop.max[1]! - MARGIN), z];
}
export function face([x, y, z]: Point, [tx, ty, tz]: Point) {
  return { yaw: Math.atan2(ty - y, tx - x), pitch: Math.atan2(tz - z, Math.hypot(tx - x, ty - y)) };
}
// Marker closest to the reticle direction, within a narrow cone and arm's reach of the scan.
export function aim(position: Point, yaw: number, pitch: number, markers: Marker[], crop: Crop) {
  const f = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
  let best: Marker | null = null, bestAngle = CONE;
  for (const marker of markers) {
    const v = displayPoint(marker.centroid, crop).map((n, i) => n - position[i]!), d = Math.hypot(...v);
    if (d > REACH || d === 0) continue;
    const angle = Math.acos(clamp((v[0]! * f[0]! + v[1]! * f[1]! + v[2]! * f[2]!) / d, -1, 1));
    if (angle < bestAngle) { best = marker; bestAngle = angle; }
  }
  return best;
}
// Sourced timeline: the photographer's capture order, read from the photo filenames.
export function captureTimeline(data: SceneData) {
  return data.evidence.flatMap(item => item.photos.map(name => ({ tag: item.tag, name })))
    .filter(({ name }) => /^IMG_20240306_\d{6}\.jpg$/.test(name)).sort((a, b) => a.name.localeCompare(b.name))
    .map(({ tag, name }) => ({ tag, time: name.slice(13, 19).replace(/(\d\d)(\d\d)(\d\d)/, '$1:$2:$3') }));
}
