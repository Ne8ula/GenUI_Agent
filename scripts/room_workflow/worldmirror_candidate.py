"""Offline WorldMirror-to-frozen-VGGT candidate conversion; never executes a model.

Raw geometry/cameras stay in analysis coordinates. Only fused/candidate geometry
uses the frozen completion rotation. Registration is not room accuracy.
"""
import argparse
import copy
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import sys
import tempfile
import zipfile

import numpy as np
from PIL import Image

# Support isolated CLI execution without adding the artifact directory to imports.
if __name__ == '__main__' and sys.flags.isolated:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from complete_candidate import arrays, bound_fused_mesh, fuse, geometry_hash
from geometry import add_room_shell, make_mesh, unproject, validate_boundary
from inference import SHA256, _alignment, fingerprint
from review_result import crop_bounds, make_scene, render, validate_files
from worldmirror_adapter import project, world_to_camera
from worldmirror_worker import CHECKPOINT_REVISION, WORLDMIRROR_SOURCE_REVISION, prepare

MAX_BYTES = 64*1024**2
MANIFEST_KEYS = {
    'version', 'kind', 'job_id', 'units', 'candidate_promoted', 'source_revision',
    'checkpoint_revision', 'original_input_hashes', 'original_inputs_sha256',
    'normalization', 'preprocessing', 'target_size', 'inference_seconds',
    'camera_convention', 'fields_file', 'fields_sha256', 'field_shapes',
    'implementation_sha256', 'limitations',
}


def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _read(path, limit):
    with Path(path).open('rb') as file:
        if not 0 < file.seek(0, 2) <= limit:
            raise ValueError('Artifact exceeds bounded file size')
        file.seek(0)
        data = file.read(limit+1)
    if not 0 < len(data) <= limit:
        raise ValueError('Artifact exceeds bounded file size')
    return data


def _json(data):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON field')
            result[key] = value
        return result

    def number(text):
        value = float(text)
        if not math.isfinite(value):
            raise ValueError('Nonfinite JSON value')
        return value

    try:
        value = json.loads(data.decode('utf-8-sig'), object_pairs_hook=pairs,
                           parse_float=number, parse_constant=number)
    except (UnicodeError, RecursionError) as error:
        raise ValueError('Invalid bounded JSON') from error
    if not isinstance(value, dict):
        raise ValueError('Expected a JSON object')
    return value


def _same(actual, expected, label):
    # Canonical JSON comparison also distinguishes booleans from integers.
    if fingerprint(actual) != fingerprint(expected):
        raise ValueError(label+' differs from the admitted contract')


def _unpack(data, shapes):
    """Check ZIP members and NPY allocation headers before any array loading."""
    # The bounded worker emits five members and no ZIP comment/ZIP64 directory.
    # Check this before ZipFile allocates one object per central-directory entry.
    if len(data) < 22:
        raise ValueError('Missing raw NPZ directory')
    signature, disk, start_disk, disk_count, count, size, offset, comment = struct.unpack('<4s4H2LH', data[-22:])
    if (signature != b'PK\x05\x06' or disk or start_disk or comment
            or disk_count != len(shapes) or count != len(shapes)
            or not 0 < size <= 4096 or offset+size != len(data)-22):
        raise ValueError('Raw NPZ directory exceeds the exact bounded contract')
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            members = archive.infolist()
            expected = {key+'.npy' for key in shapes}
            if len(members) != len(expected) or {m.filename for m in members} != expected:
                raise ValueError('Unexpected or duplicate raw NPZ members')
            if sum(m.file_size for m in members) > MAX_BYTES:
                raise ValueError('Raw NPZ expanded byte cap exceeded')
            for member in members:
                shape = tuple(shapes[member.filename[:-4]])
                size = math.prod(shape)*4
                if (member.flag_bits & 1 or member.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                        or not size < member.file_size <= size+512):
                    raise ValueError('Raw NPZ member size/compression rejected')
                with archive.open(member) as file:
                    version = np.lib.format.read_magic(file)
                    if version != (1, 0):
                        raise ValueError('Raw arrays require bounded NPY v1 headers')
                    actual, fortran, dtype = np.lib.format.read_array_header_1_0(file, max_header_size=512)
                    if (actual != shape or fortran or dtype.str != '<f4'
                            or file.tell()+size != member.file_size):
                        raise ValueError('Raw NPY shape/dtype/allocation rejected')
        with np.load(io.BytesIO(data), allow_pickle=False, max_header_size=512) as archive:
            arrays = {key: archive[key] for key in shapes}
    except (OSError, EOFError, zipfile.BadZipFile) as error:
        raise ValueError('Invalid raw NPZ archive') from error
    if any(not np.isfinite(value).all() for value in arrays.values()):
        raise ValueError('Nonfinite raw numerical fields')
    return arrays


def _admit_raw(raw_directory, request):
    directory = Path(raw_directory)
    manifest_bytes = _read(directory/'manifest.json', 128*1024)
    manifest = _json(manifest_bytes)
    if set(manifest) != MANIFEST_KEYS:
        raise ValueError('Raw manifest requires exact supported fields')
    constants = {'version': 1, 'kind': 'eva-worldmirror-raw-v1', 'job_id': request.get('job_id'),
                 'units': 'unverified-scale', 'candidate_promoted': False,
                 'source_revision': WORLDMIRROR_SOURCE_REVISION, 'checkpoint_revision': CHECKPOINT_REVISION,
                 'fields_file': 'raw-fields.npz',
                 'camera_convention': 'OpenCV camera-to-world; depth is camera Z; pts3d is world-space'}
    for key, value in constants.items():
        _same(manifest[key], value, key)
    elapsed, limits = manifest['inference_seconds'], manifest['limitations']
    if (type(elapsed) not in (int, float) or not math.isfinite(elapsed) or elapsed < 0
            or not isinstance(limits, list) or not 1 <= len(limits) <= 32
            or any(not isinstance(item, str) or not 1 <= len(item) <= 2000 for item in limits)):
        raise ValueError('Invalid raw runtime/limitations metadata')
    implementation = {name: _sha(Path(__file__).with_name(name).read_bytes()) for name in
                      ('worldmirror_worker.py', 'worldmirror_adapter.py', 'inference.py', 'geometry.py')}
    _same(manifest['implementation_sha256'], implementation, 'Implementation hashes')
    with tempfile.TemporaryDirectory(prefix='eva-wm-admission-') as temp:
        prepared = prepare(request, Path(temp))
    originals = [{key: image[key] for key in ('id', 'sha256')} for image in request['images']]
    normalization = manifest['normalization']
    if type(normalization) is not list or len(normalization) != len(prepared['normalization']):
        raise ValueError('Invalid normalization records')
    for actual, expected in zip(normalization, prepared['normalization']):
        if (type(actual) is not dict or set(actual) != set(expected)
                or type(actual['normalized_sha256']) is not str or not SHA256.fullmatch(actual['normalized_sha256'])):
            raise ValueError('Invalid normalization record or encoded digest')
        # PNG encoding is platform-dependent; preserve its hash and require model RGB equivalence below.
        _same({**actual, 'normalized_sha256': expected['normalized_sha256']}, expected, 'normalization')
    for key, value in {'original_input_hashes': originals, 'original_inputs_sha256': fingerprint(originals),
                       'preprocessing': prepared['preprocessing'], 'target_size': prepared['target']}.items():
        _same(manifest[key], value, key)
    count = len(originals); width, height = prepared['preprocessing'][0]['model_size']
    shapes = {'depth': [1, count, height, width, 1], 'pts3d': [1, count, height, width, 3],
              'camera_poses': [1, count, 4, 4], 'camera_intrs': [1, count, 3, 3],
              'rgb': [1, count, 3, height, width]}
    _same(manifest['field_shapes'], shapes, 'Raw field shapes')
    fields_bytes = _read(directory/'raw-fields.npz', MAX_BYTES)
    _same(manifest['fields_sha256'], _sha(fields_bytes), 'Raw field hash')
    fields = _unpack(fields_bytes, shapes)
    if np.any(fields['depth'] <= 1e-6):
        raise ValueError('Raw depth must be positive OpenCV camera Z')
    for pose, k in zip(fields['camera_poses'][0], fields['camera_intrs'][0]):
        world_to_camera(np.zeros((1, 3)), pose)
        project(np.array([[0., 0., 1.]]), k)
        if not np.allclose(k[[0, 1], [1, 0]], 0, rtol=0, atol=1e-7):
            raise ValueError('Skewed intrinsics are unsupported by the fusion helper')
    if not np.allclose(fields['rgb'], prepared['rgb'], rtol=0, atol=1e-6):
        raise ValueError('Processed RGB differs from normalized source order/preprocessing')
    return manifest, fields, manifest_bytes, fields_bytes


def _prediction(fields, manifest, baseline):
    """Resize camera-Z/RGB with pixel-center mapping, then pad to VGGT's canvas."""
    transforms = baseline['preprocessing']; cameras = baseline['arms']['A']['cameras']
    originals = manifest['original_input_hashes']
    if (baseline.get('original_input_hashes') != originals or len(transforms) != len(originals)
            or [c.get('image_id') for c in cameras] != [o['id'] for o in originals]):
        raise ValueError('Baseline source/camera ordering differs')
    depths, colors, masks, points, converted = [], [], [], [], []
    for i, (wm, transform) in enumerate(zip(manifest['preprocessing'], transforms)):
        source_width, source_height = wm['source_size']
        resized = ([518, round(source_height*518/source_width/14)*14] if source_width >= source_height
                   else [round(source_width*518/source_height/14)*14, 518])
        expected = {'source_size': wm['source_size'], 'resized_size': resized,
                    'padding_left_top': [(518-resized[0])//2, (518-resized[1])//2],
                    'model_size': [518, 518], 'pixel_center_convention': 'integer'}
        _same(transform, expected, 'VGGT preprocessing')
        if wm['crop_left_top'] != [0, 0] or wm['model_size'] != wm['resized_size']:
            raise ValueError('Only uncropped WorldMirror rasters are supported')
        left, top, right, bottom = crop_bounds(transform)
        sx, sy = np.asarray(resized)/np.asarray(wm['model_size'])
        pixel = np.array([[sx, 0, (sx-1)/2+left], [0, sy, (sy-1)/2+top], [0, 0, 1.]])
        k = pixel@fields['camera_intrs'][0, i].astype(float)
        pose = fields['camera_poses'][0, i].astype(float)
        rotation, center = pose[:3, :3].T, pose[:3, 3]
        extrinsic = np.column_stack((rotation, -rotation@center))
        camera = {'image_id': originals[i]['id'], 'intrinsics': k.tolist(), 'world_to_camera': extrinsic.tolist(),
                  'center': center.tolist(), 'units': 'relative', 'depth_kind': 'OpenCV-z'}
        depth = np.zeros((518, 518), np.float32)
        depth[top:bottom, left:right] = np.asarray(Image.fromarray(fields['depth'][0, i, ..., 0]).resize(
            tuple(resized), Image.Resampling.BILINEAR))
        rgb = np.zeros((518, 518, 3), np.float32)
        for channel in range(3):
            rgb[top:bottom, left:right, channel] = np.asarray(Image.fromarray(fields['rgb'][0, i, channel]).resize(
                tuple(resized), Image.Resampling.BILINEAR))
        valid = np.zeros((518, 518), bool); valid[top:bottom, left:right] = True
        depths.append(depth); colors.append(rgb); masks.append(valid)
        points.append(unproject(depth, k, extrinsic)); converted.append(camera)
    return {'depth': np.asarray(depths), 'rgb': np.asarray(colors), 'valid': np.asarray(masks),
            'image_valid': np.asarray(masks), 'confidence': np.ones((len(originals), 518, 518), np.float32),
            'points': np.asarray(points), 'cameras': converted}


def _register(baseline, prediction):
    """Own-view VGGT triangles supply same-pixel anchors, never reference poses."""
    vertices, colors, faces = arrays(baseline['arms']['A']['geometry'])
    sources = np.asarray(baseline['arms']['A']['geometry']['source_view_indices'])
    anchors, masks = [], []
    for i, (camera, transform) in enumerate(zip(baseline['arms']['A']['cameras'], baseline['preprocessing'])):
        selected = faces[sources == i]
        _, depth = render(make_scene(vertices, selected), vertices, colors, selected, camera, [518, 518])
        left, top, right, bottom = crop_bounds(transform)
        valid = np.zeros((518, 518), bool); valid[top:bottom, left:right] = True
        valid &= np.isfinite(depth) & (depth > 1e-6)
        anchors.append(unproject(np.where(valid, depth, 0), camera['intrinsics'], camera['world_to_camera']))
        masks.append(valid)
    return _alignment({'points': np.asarray(anchors), 'valid': np.asarray(masks)}, prediction, len(anchors))


def _frozen(report, baseline, result_hash, request_hash):
    for key, expected in {'version': 1, 'status': 'provisional-completion-candidate', 'units': 'relative',
                          'boundary_confirmed': False, 'voxel_relative': .009,
                          'input_result_sha256': result_hash, 'input_request_sha256': request_hash,
                          'source_analysis_binding': baseline['analysis_binding']}.items():
        _same(report.get(key), expected, 'Frozen '+key)
    scores = []
    if 'confidence_excluded_lower_percentile' in report:
        scores.append(report['confidence_excluded_lower_percentile'])
    numerical = report.get('numerical_ml_fields')
    if isinstance(numerical, dict):
        scores.append(numerical.get('confidence_excluded_lower_percentile'))
    if not scores or any(type(score) not in (int, float) or score != 0 for score in scores):
        raise ValueError('Frozen baseline requires original confidence=0')
    rotation = np.asarray(report.get('original_to_candidate_rotation'), dtype=float)
    if (rotation.shape != (3, 3) or not np.isfinite(rotation).all()
            or not np.allclose(rotation.T@rotation, np.eye(3), rtol=0, atol=1e-6)
            or not np.isclose(np.linalg.det(rotation), 1, rtol=0, atol=1e-6)):
        raise ValueError('Frozen rotation must be proper and rigid')
    boundary, openings = copy.deepcopy(report['boundary']), copy.deepcopy(report.get('openings', []))
    validate_boundary(boundary)
    add_room_shell({'positions': [], 'colors': [], 'indices': [], 'provenance': [], 'source_view_indices': []},
                   boundary, openings)
    return rotation, boundary, openings


def _fusion_budget(prediction):
    # Bound surface allocation before entering Open3D's native TSDF integrator.
    points, valid = prediction['points'], prediction['valid']
    if (not np.isfinite(points).all() or np.abs(points).max() > 1e5
            or not np.isfinite(prediction['depth']).all() or prediction['depth'].max() > 100):
        raise ValueError('Aligned fields exceed numerical fusion bounds')
    area = 0.
    for p, mask in zip(points, valid):
        if np.linalg.norm(np.ptp(p[mask], axis=0))/.009 > 4096:
            raise ValueError('Estimated span exceeds bounded CPU fusion allocation')
        cells = mask[:-1, :-1] & mask[1:, :-1] & mask[:-1, 1:] & mask[1:, 1:]
        cross = np.cross(p[1:, :-1]-p[:-1, :-1], p[:-1, 1:]-p[:-1, :-1])
        area += np.linalg.norm(cross[cells], axis=-1).sum()
    if not math.isfinite(area) or area/.009**2 > 2_000_000:
        raise ValueError('Estimated surface exceeds bounded CPU fusion allocation')


def run(result_path, request_path, raw_directory, frozen_report_path, output):
    """Admit existing artifacts and write a fresh six-file candidate, report last."""
    result_path, request_path, frozen_report_path, output = map(Path, (result_path, request_path, frozen_report_path, output))
    if output.exists() or output.is_symlink():
        raise ValueError('Output exists; choose a fresh directory and preserve prior evidence')
    result_bytes, request_bytes = _read(result_path, MAX_BYTES), _read(request_path, MAX_BYTES)
    _json(result_bytes); _json(request_bytes)
    baseline, request = validate_files(result_path, request_path)
    if result_bytes != _read(result_path, MAX_BYTES) or request_bytes != _read(request_path, MAX_BYTES):
        raise ValueError('Baseline inputs changed during validation')
    frozen_bytes = _read(frozen_report_path, 1024*1024)
    basis, boundary, openings = _frozen(_json(frozen_bytes), baseline, _sha(result_bytes), _sha(request_bytes))
    manifest, fields, manifest_bytes, fields_bytes = _admit_raw(raw_directory, request)
    prediction = _prediction(fields, manifest, baseline)
    registration = _register(baseline, prediction)
    _fusion_budget(prediction)
    raw = make_mesh(prediction['points'], prediction['rgb'], prediction['valid'])
    raw['coordinate_frame'] = 'analysis'
    raw['boundary_policy'] = 'unaltered aligned WorldMirror depth grid; no boundary clipping'
    analysis = {'arms': {'A': {'geometry': raw, 'cameras': prediction['cameras']}},
                'preprocessing': baseline['preprocessing']}
    fused, records = fuse(analysis, request, voxel=.009, fields=prediction, confidence_percentile=0)
    bounded, candidate, inside = bound_fused_mesh(np.asarray(fused.vertices)@basis.T,
        np.asarray(fused.vertex_colors), np.asarray(fused.triangles), boundary, openings)
    for geometry in (bounded, candidate):
        geometry['coordinate_frame'] = 'candidate'
        geometry['boundary_policy'] = 'whole-face containment in frozen VGGT boundary; unconfirmed; no expansion'
    candidate['completion'] = {'policy': 'provisional-single-room-enclosure',
                               'origin': 'frozen unconfirmed VGGT envelope; authored closure, not recovered geometry'}
    report = {'version': 1, 'status': 'provisional-completion-candidate', 'units': 'relative',
              'boundary_confirmed': False, 'boundary': boundary, 'openings': openings,
              'original_to_candidate_rotation': basis.tolist(), 'input_result_sha256': _sha(result_bytes),
              'input_request_sha256': _sha(request_bytes), 'source_analysis_binding': baseline['analysis_binding'],
              'raw_geometry_sha256': geometry_hash(raw), 'fused_geometry_sha256': geometry_hash(bounded),
              'candidate_geometry_sha256': geometry_hash(candidate), 'cameras': prediction['cameras'],
              'worldmirror': {'source_revision': manifest['source_revision'], 'checkpoint_revision': manifest['checkpoint_revision'],
                              'manifest_sha256': _sha(manifest_bytes), 'fields_sha256': _sha(fields_bytes)},
              'frozen_report_sha256': _sha(frozen_bytes), 'voxel_relative': .009,
              'confidence_excluded_lower_percentile': 0, 'registration': registration, 'source_inputs': records,
              'raw_triangles': len(raw['indices'])//3, 'bounded_triangles': int(inside.sum()),
              'discarded_outside_boundary_triangles': int((~inside).sum()),
              'authored_shell_triangles': len(candidate['indices'])//3-int(inside.sum()),
              'provenance': {'photo-estimated': 'Previously captured WorldMirror camera-Z depth/RGB; bilinear resize, '
                             'integer pixel-center calibration, pad, VGGT same-photo registration and CPU TSDF fusion; '
                             'all source IDs retained, fused faces have no unique source view',
                             'authored-room-shell': 'Frozen unconfirmed VGGT envelope; no new boundary fit or room expansion',
                             'authored-door-cap': 'Copied frozen opening; authored closure, not detected geometry',
                             'authored-window-cap': 'Copied frozen opening; authored closure, not detected geometry',
                             'execution': 'Offline CPU conversion only; no model execution, acquisition, GPU or network calls'},
              'limitations': ['Registration to VGGT estimates is not physical or held-out accuracy.',
                              'Raw geometry and cameras use analysis coordinates; fused/candidate geometry uses frozen candidate rotation.',
                              'Depth is resized bilinearly; no confidence head is captured, so no pixels are confidence-filtered.',
                              'The independent pts3d head is retained unchanged but is not used as camera-Z depth or geometry.',
                              'Manifest hashes bind bytes and implementation declarations, not independent proof of model execution.',
                              'Boundary remains unconfirmed; closures are authored assumptions, not recovered objects.',
                              'No model execution, SAM 3D completion, Shado comparison, metric scale or quality acceptance.']}
    output.mkdir(parents=True, exist_ok=False)
    for name, data in [('manifest.json', manifest_bytes), ('raw-fields.npz', fields_bytes)]:
        with (output/name).open('xb') as file:
            file.write(data)
    for name, value in [('raw.json', raw), ('fused-bounded.json', bounded), ('candidate.json', candidate), ('report.json', report)]:
        with (output/name).open('x', encoding='utf-8') as file:
            json.dump(value, file, separators=(',', ':'), allow_nan=False)
    return report


def load_idealization_inputs(result_path: Path, request_path: Path, raw_directory: Path,
                             candidate_directory: Path, suggestions_path: Path, review_path: Path,
                             *, with_fitting_views=False) -> dict:
    """Read retained RGB-only evidence in its saved frame; never fit or infer authority."""
    from idealized_contract import digest
    from object_proposals import associate, inside_bounds, lift_points
    from object_suggestions import decode_mask, validate_result

    result_path, request_path, directory = map(Path, (result_path, request_path, candidate_directory))
    result_bytes, request_bytes = _read(result_path, MAX_BYTES), _read(request_path, MAX_BYTES)
    _json(result_bytes); _json(request_bytes)
    baseline, request = validate_files(result_path, request_path)
    if result_bytes != _read(result_path, MAX_BYTES) or request_bytes != _read(request_path, MAX_BYTES):
        raise ValueError('Baseline changed during validation')
    report_bytes = _read(directory/'report.json', 1024*1024)
    report = _json(report_bytes)
    suggestions_bytes = _read(suggestions_path, 16*1024**2)
    suggestions = _json(suggestions_bytes)
    review = _json(_read(review_path, 65536))
    keys = {'version', 'coordinate_frame', 'analysis_binding', 'candidate_report_sha256',
            'suggestions_sha256', 'boundary', 'openings'}
    if set(review) != keys:
        raise ValueError('Unsupported idealization review fields')
    for key, expected in {'version': 1, 'coordinate_frame': 'worldmirror-candidate',
                          'analysis_binding': baseline['analysis_binding'],
                          'candidate_report_sha256': _sha(report_bytes),
                          'suggestions_sha256': _sha(suggestions_bytes)}.items():
        _same(review[key], expected, 'Review '+key)
    for key, expected in {'input_result_sha256': _sha(result_bytes), 'input_request_sha256': _sha(request_bytes),
                          'source_analysis_binding': baseline['analysis_binding']}.items():
        _same(report.get(key), expected, 'Saved candidate '+key)
    boundary, openings = copy.deepcopy(review['boundary']), copy.deepcopy(review['openings'])
    add_room_shell({'positions': [], 'colors': [], 'indices': [], 'provenance': [], 'source_view_indices': []},
                   boundary, openings)
    validate_result(suggestions, request)
    manifest, fields, manifest_bytes, _ = _admit_raw(raw_directory, request)
    for key, expected in {'manifest_sha256': _sha(manifest_bytes), 'fields_sha256': manifest['fields_sha256']}.items():
        _same(report.get('worldmirror', {}).get(key), expected, 'Saved WorldMirror '+key)
    prediction = _prediction(fields, manifest, baseline)
    registration = report.get('registration', {})
    scale = registration.get('scale')
    rotation, translation = np.asarray(registration.get('rotation'), float), np.asarray(registration.get('translation'), float)
    basis = np.asarray(report.get('original_to_candidate_rotation'), float)
    if (type(scale) not in (int, float) or not math.isfinite(scale) or not 1e-4 < scale < 1e4
            or translation.shape != (3,) or not np.isfinite(translation).all()):
        raise ValueError('Invalid saved similarity')
    for matrix in (rotation, basis):
        if (matrix.shape != (3, 3) or not np.isfinite(matrix).all()
                or not np.allclose(matrix.T@matrix, np.eye(3), atol=1e-6, rtol=0)
                or not np.isclose(np.linalg.det(matrix), 1, atol=1e-6, rtol=0)):
            raise ValueError('Invalid saved rotation')
    prediction['points'] = scale*prediction['points']@rotation.T+translation
    for camera in prediction['cameras']:
        center = scale*rotation@np.asarray(camera['center'])+translation
        r = np.asarray(camera['world_to_camera'])[:, :3]@rotation.T
        camera['center'] = center.tolist()
        camera['world_to_camera'] = np.column_stack((r, -r@center)).tolist()
    rebuilt = make_mesh(prediction['points'], prediction['rgb'], prediction['valid'])
    saved_raw = _json(_read(directory/'raw.json', MAX_BYTES))
    if geometry_hash(rebuilt) != report.get('raw_geometry_sha256') or geometry_hash(saved_raw) != geometry_hash(rebuilt):
        raise ValueError('Saved raw geometry differs from admitted camera-Z estimate')
    _same(prediction['cameras'], report.get('cameras'), 'Saved cameras')
    transform = np.eye(4)
    transform[:3, :3], transform[:3, 3] = scale*basis@rotation, basis@translation
    frame = {'id': 'worldmirror-candidate', 'up': 'Z', 'source_to_candidate': transform.tolist(),
             'candidate_to_source': np.linalg.inv(transform).tolist()}
    points = prediction['points']@basis.T
    cameras = copy.deepcopy(prediction['cameras'])
    for camera in cameras:
        center = basis@camera['center']
        r = np.asarray(camera['world_to_camera'])[:, :3]@basis.T
        camera['center'] = center.tolist()
        camera['world_to_camera'] = np.column_stack((r, -r@center)).tolist()
    observations, masks, references = [], [], []
    for i, view in enumerate(suggestions['views']):
        preprocessing = baseline['preprocessing'][i]
        if view['source_size'] != preprocessing['source_size']:
            raise ValueError('Mask/source normalization differs')
        left, top, right, bottom = crop_bounds(preprocessing)
        for detection in view['detections']:
            mask = decode_mask(detection['mask'], view['mask_size'])
            selected = np.zeros((518, 518), bool)
            selected[top:bottom, left:right] = np.asarray(Image.fromarray(mask).resize(
                (right-left, bottom-top), Image.Resampling.NEAREST), bool)
            support = lift_points(selected, points[i], prediction['valid'][i], prediction['rgb'][i])
            reasons = list(detection['review_reasons'])
            if support is None:
                reasons.append('insufficient-estimated-depth')
            elif not inside_bounds(support, boundary):
                reasons.append('outside-reviewed-room')
            observation = {'id': detection['id'], 'image_id': view['image_id'], 'source_sha256': view['source_sha256'],
                           'label': detection['label'], 'mask_sha256': detection['mask']['sha256'],
                           'review_reasons': reasons, 'support': support}
            if with_fitting_views:
                valid = prediction['image_valid'][i]
                depth = np.where(valid & ~selected, scale*prediction['depth'][i], np.inf)
                observation['view'] = {'camera': cameras[i], 'mask': selected,
                                       'valid_mask': valid, 'occluder_depth': depth}
            observations.append(observation)
            references.append({k: observation[k] for k in ('id', 'image_id', 'mask_sha256')})
            # Retain the bound compact PNG; fitting reapplies the recorded preprocessing.
            masks.append({'observation_id': detection['id'], 'mask': copy.deepcopy(detection['mask']),
                          'mask_size': view['mask_size'], 'preprocessing': copy.deepcopy(preprocessing)})
    bindings = {'originals': copy.deepcopy(manifest['original_input_hashes']), 'estimator_id': 'WorldMirror-2.0',
                'analysis_binding': copy.deepcopy(baseline['analysis_binding']),
                'estimator_artifact_sha256': _sha(manifest_bytes), 'registration_sha256': digest(registration),
                'frame_sha256': digest(frame), 'observations': references}
    palette = np.median(prediction['rgb'][prediction['valid']][::32], axis=0).tolist()
    return {'job_id': request['job_id'], 'candidate_id': 'idealized-'+digest(review)[:16],
            'bindings': bindings, 'frame': frame, 'boundary': boundary, 'openings': openings,
            'observations': observations, 'inventory_proposals': associate(copy.deepcopy([
                {key: value for key, value in o.items() if key != 'view'} for o in observations])),
            'cameras': cameras, 'masks': masks, 'shell_color_srgb': palette}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', type=Path, required=True)
    parser.add_argument('--request', type=Path, required=True)
    parser.add_argument('--raw-directory', type=Path, required=True)
    parser.add_argument('--frozen-report', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(run(args.result, args.request, args.raw_directory, args.frozen_report, args.output), indent=2))
