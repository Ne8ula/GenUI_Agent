"""Audit frame 0037 without changing the frozen reconstruction or evaluation split.

The isolated self-fit control intentionally integrates frame 0037. It is a
diagnostic of coordinate/fusion correctness, NOT a held-out reconstruction result.
"""
import argparse
import csv
import json
from pathlib import Path
import subprocess
import zipfile

import numpy as np
import open3d as o3d
from PIL import Image, ImageDraw

import hypersim as h

CACHE = h.ROOT / '.local/reconstruction/frame37-audit'
BASELINE = h.ROOT / '.local/reconstruction/runs/ai_001_004-r02'
ENTRIES = [f'ai_001_004/images/scene_cam_00_{kind}/frame.0037.{name}' for kind, name in
           [('geometry_hdf5', 'position.hdf5'), ('final_preview', 'tonemap.jpg')]]


def fetch():
    CACHE.mkdir(parents=True, exist_ok=True)
    if (CACHE/'input-manifest.json').exists():
        verify_extra_inputs()
        return
    budget = h.Budget(64*1024**2)
    stream = h.RemoteZip(h.ARCHIVE, budget, 32*1024**2)
    records = []
    with zipfile.ZipFile(stream) as archive:
        for entry in ENTRIES:
            if archive.getinfo(entry).file_size > 32*1024**2:
                raise ValueError('Oversized diagnostic input')
            payload = archive.read(entry)
            dest = CACHE/Path(entry).name
            if dest.exists() and h.digest(dest.read_bytes()) != h.digest(payload):
                raise ValueError('Refusing changed diagnostic input')
            dest.write_bytes(payload)
            records.append({'entry': entry, 'sha256': h.digest(payload), 'bytes': len(payload)})
    h.save_json(CACHE/'input-manifest.json', {'archive': h.ARCHIVE, 'files': records,
                'network_bytes': budget.used, 'purpose': 'diagnostic only; never integrated into baseline'})


def verify_extra_inputs():
    manifest = json.loads((CACHE/'input-manifest.json').read_text())
    if manifest['archive'] != h.ARCHIVE or {r['entry'] for r in manifest['files']} != set(ENTRIES):
        raise ValueError('Unexpected diagnostic source')
    for record in manifest['files']:
        if h.digest((CACHE/Path(record['entry']).name).read_bytes()) != record['sha256']:
            raise ValueError('Diagnostic input hash mismatch')
    return manifest


def cast(mesh, unit, rotation, translation):
    scene = o3d.t.geometry.RaycastingScene()
    scene.add_triangles(o3d.t.geometry.TriangleMesh.from_legacy(mesh))
    directions = unit @ rotation.T
    origins = np.broadcast_to(translation, directions.shape)
    result = scene.cast_rays(o3d.core.Tensor(np.concatenate([origins, directions], -1).astype(np.float32)))
    distance = result['t_hit'].numpy()
    mask = np.isfinite(distance)
    ids = result['primitive_ids'].numpy()[mask].astype(np.int64)
    uv = result['primitive_uvs'].numpy()[mask]
    weights = np.column_stack([1-uv.sum(1), uv])
    rgb = np.full((*mask.shape, 3), 32, dtype=np.uint8)
    colors = np.asarray(mesh.vertex_colors)[np.asarray(mesh.triangles)[ids]]
    rgb[mask] = np.round(255*np.sum(colors*weights[..., None], 1)).clip(0, 255).astype(np.uint8)
    return distance, rgb


def audit(output):
    c = h.config()
    h.verify_manifest(h.DEFAULT_DATA, c)
    extra = verify_extra_inputs()
    if output.exists():
        raise ValueError('Use a new output directory; evidence is never overwritten')
    base_report = json.loads((BASELINE/'report.json').read_text())
    if h.digest((BASELINE/'room-mesh.ply').read_bytes()) != base_report['output_sha256']['room-mesh.ply']:
        raise ValueError('Baseline mesh changed')
    base = h.DEFAULT_DATA/'ai_001_004'
    row = next(r for r in csv.DictReader((h.DEFAULT_DATA/'camera_parameters.csv').open()) if r['scene_name'] == c['scene'])
    matrix = np.array([[float(row[f'M_cam_from_uv_{i}{j}']) for j in range(3)] for i in range(3)])
    unit = h.rays(matrix, 1024, 768)
    scale = float(row['settings_units_info_meters_scale'])
    detail = base/'_detail/cam_00'
    ids = h.read_h5(detail/'camera_keyframe_frame_indices.hdf5').reshape(-1)
    positions = h.read_h5(detail/'camera_keyframe_positions.hdf5')*scale
    rotations = h.read_h5(detail/'camera_keyframe_orientations.hdf5')
    poses = {int(f): (rotations[i], positions[i]) for i, f in enumerate(ids)}
    def load(frame, suffix='depth_meters', kind='geometry'):
        return h.read_h5(base/f'images/scene_cam_00_{kind}_hdf5/frame.{frame:04d}.{suffix}.hdf5')
    rotation, translation = poses[37]
    depth = load(37)
    points, finite = h.world_points(depth, unit, rotation, translation, 1)
    position_reference = h.read_h5(CACHE/'frame.0037.position.hdf5')*scale
    matched = finite & np.isfinite(position_reference).all(-1)
    consistency = np.linalg.norm(points[matched]-position_reference[matched], axis=-1)
    report = {'date': '2026-10-19', 'source_revision': subprocess.check_output(['git','rev-parse','HEAD'], text=True).strip(),
              'audit_script_sha256': h.digest(Path(__file__).read_bytes()),
              'baseline_mesh_sha256': base_report['output_sha256']['room-mesh.ply'],
              'baseline_input_manifest_sha256': h.digest((h.DEFAULT_DATA/'manifest.json').read_bytes()),
              'extra_inputs': extra,
              'frame37_position_check': {'samples': int(matched.sum()), 'median_m': float(np.median(consistency)),
                  'p95_m': float(np.percentile(consistency,95)), 'max_m': float(consistency.max())},
              'source_support_method': 'stride4, nearest-pixel radial-depth agreement <=5cm; positive-z frustum and planar depth <=12m',
              'source_support': []}
    fx, fy = 1024/(2*matrix[0,0]), 768/(2*matrix[1,1])
    support37 = None
    for frame in c['evaluation_frames']:
        ref = load(frame)[::4,::4]
        world, valid = h.world_points(ref, unit[::4,::4], *poses[frame], 1)
        valid &= ref * -unit[::4,::4,2] <= c['max_depth_m']
        p = world[valid]
        support = np.zeros(len(p), dtype=bool)
        per_input = []
        for training in c['train_frames']:
            rt, tt = poses[training]
            camera = (p-tt)@rt
            z = -camera[:,2]
            with np.errstate(divide='ignore', invalid='ignore'):
                u = fx*camera[:,0]/z+511.5
                v = -fy*camera[:,1]/z+383.5
            inside = (z>0)&(z<=12)&(u>=0)&(u<=1023)&(v>=0)&(v<=767)
            indexes = np.flatnonzero(inside)
            actual = load(training)[np.rint(v[indexes]).astype(int), np.rint(u[indexes]).astype(int)]
            agrees = np.isfinite(actual)&(np.abs(actual-np.linalg.norm(camera[indexes],axis=1))<=.05)
            support[indexes[agrees]] = True
            per_input.append({'frame':training, 'matching_pixels':int(agrees.sum())})
        report['source_support'].append({'frame':frame, 'valid_pixels':len(p), 'supported_pixels':int(support.sum()),
                                        'supported_fraction':float(support.mean()), 'per_input':per_input})
        if frame == 37:
            support37 = np.full((*valid.shape,3),32,dtype=np.uint8)
            support37[valid] = [180,65,65]
            support37[np.where(valid)[0][support],np.where(valid)[1][support]] = [40,200,80]
    original_mesh = o3d.io.read_triangle_mesh(str(BASELINE/'room-mesh.ply'))
    predicted, baseline_rgb = cast(original_mesh, unit[::4,::4], rotation, translation)
    reference = depth[::4,::4]
    valid = np.isfinite(reference)&(reference>0)&(reference*-unit[::4,::4,2]<=12)
    report['baseline_frame37'] = h.score_depth(37,reference,predicted,valid)
    hits = valid & np.isfinite(predicted)
    signed = predicted[hits]-reference[hits]
    report['baseline_hits_more_than_5cm_behind_reference_fraction'] = float(np.mean(signed>.05))
    # This is a SELF-FIT CONTROL only. Never adds frame37 to baseline inputs.
    stride = c['integration_pixel_stride']
    planar = depth * -unit[...,2]
    planar = np.where(np.isfinite(planar)&(planar>0)&(planar<=12),planar,0)
    color = h.tone_map(load(37,'color','final'))
    rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
        o3d.geometry.Image(np.ascontiguousarray(color[::stride,::stride])),
        o3d.geometry.Image(np.ascontiguousarray(planar[::stride,::stride].astype(np.float32))),
        depth_scale=1,depth_trunc=12,convert_rgb_to_intensity=False)
    volume = o3d.pipelines.integration.ScalableTSDFVolume(voxel_length=.02,sdf_trunc=.08,
        color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8)
    intrinsic = o3d.camera.PinholeCameraIntrinsic(512,384,fx/stride,fy/stride,511.5/stride,383.5/stride)
    volume.integrate(rgbd,intrinsic,h.camera_extrinsic(rotation,translation,1))
    control_mesh = volume.extract_triangle_mesh()
    control_depth, control_rgb = cast(control_mesh,unit[::4,::4],rotation,translation)
    report['self_fit_control_NOT_held_out'] = h.score_depth(37,reference,control_depth,valid)
    report['interpretation'] = 'Camera/depth consistency and source-support diagnosis only. Self-fit control is not a benchmark improvement.'
    report['license'] = 'CC-BY-SA-3.0; Apple Hypersim / Evermotion'
    output.mkdir(parents=True)
    sheet = Image.new('RGB',(1536,880),'#eeeeea');draw=ImageDraw.Draw(sheet)
    original = Image.open(CACHE/'frame.0037.tonemap.jpg').resize((512,384))
    panels=[(original,'Apple original preview: frame 0037'),
            (Image.fromarray(baseline_rgb).resize((512,384)),'Existing r02: missing foreground surfaces'),
            (Image.fromarray(control_rgb).resize((512,384)),'Self-fit control using 0037 depth (NOT held out)'),
            (Image.fromarray(support37).resize((512,384),Image.Resampling.NEAREST),'Input support: green <=5cm match; red unsupported')]
    for i,(im,label) in enumerate(panels):
        x=(i%3)*512;y=(i//3)*420
        sheet.paste(im,(x,y));draw.text((x+8,y+391),label,fill='black')
    draw.text((525,440),'Baseline is preserved. Frame 0037 remains withheld in r02.',fill='black')
    draw.text((525,465),'The self-fit control tests the coordinate/fusion path only.',fill='black')
    draw.text((525,490),'The 20 input views barely observe this side of the room.',fill='black')
    draw.text((8,852),'Apple Hypersim / Evermotion | CC BY-SA 3.0 | Technical diagnostic, 2026-10-19',fill='black')
    sheet.save(output/'comparison.png')
    report['comparison_sha256']=h.digest((output/'comparison.png').read_bytes())
    h.save_json(output/'report.json',report)
    print(json.dumps({k:v for k,v in report.items() if k not in ['extra_inputs','source_support']},indent=2))
    print('SUPPORT',[(r['frame'],r['supported_fraction']) for r in report['source_support']])


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch',action='store_true')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    if args.fetch:fetch()
    audit(args.output)
