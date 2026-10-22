"""Bounded scan-assisted source planning/inspection; no metric admission or models."""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
import shutil
from pathlib import Path
import struct
import sys
import urllib.request

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np

from arkit_fetch import BASE, REPO, REVISION, download
from idealized_contract import digest
from worldmirror_candidate import _json, _read

CAPTURE = '45261631'
SPLIT = 'Validation'
MIB = 1024**2
TRANSFER_LIMIT = 128*MIB
HEADER_LIMIT = 65536
ACQUISITION_PLAN_SHA256 = '367b183772cc894e2f6ba5f314ee9f111e379501327e7b539ceff2baf77ce4e0'


def _catalog():
    raw = f'{BASE}/raw/{SPLIT}/{CAPTURE}'
    return [
        {'role': role, 'path': path, 'url': url, 'limit': limit}
        for role, path, url, limit in [
            ('license', 'LICENSE.txt', f'{REPO}/LICENSE', 65536),
            ('metadata', 'metadata.csv', f'{BASE}/raw/metadata.csv', 2*MIB),
            ('mesh', f'{CAPTURE}_3dod_mesh.ply', f'{raw}/{CAPTURE}_3dod_mesh.ply', 32*MIB),
            ('annotation', f'{CAPTURE}_3dod_annotation.json', f'{raw}/{CAPTURE}_3dod_annotation.json', 2*MIB),
            ('trajectory', 'lowres_wide.traj', f'{raw}/lowres_wide.traj', 2*MIB),
            ('depth-intrinsics', 'lowres_wide_intrinsics.zip', f'{raw}/lowres_wide_intrinsics.zip', 2*MIB),
            ('rgb-intrinsics', 'vga_wide_intrinsics.zip', f'{raw}/vga_wide_intrinsics.zip', 2*MIB),
        ]]


def _validate_plan(plan):
    if (not isinstance(plan, dict) or set(plan) != {'kind', 'capture_id', 'split', 'repository_revision',
                                                  'transfer_limit', 'attempts', 'assets'}
            or plan['kind'] != 'eva-scan-acquisition-v1' or plan['capture_id'] != CAPTURE
            or plan['split'] != SPLIT or plan['repository_revision'] != REVISION
            or type(plan['transfer_limit']) is not int or plan['transfer_limit'] != TRANSFER_LIMIT
            or type(plan['attempts']) is not int or plan['attempts'] != 1
            or not isinstance(plan['assets'], list) or len(plan['assets']) != len(_catalog())):
        raise ValueError('Invalid fixed-source acquisition plan')
    for asset, entry in zip(plan['assets'], _catalog()):
        if (not isinstance(asset, dict) or set(asset) != set(entry) | {'bytes', 'etag'}
                or any(asset[k] != v for k, v in entry.items())
                or type(asset['limit']) is not int or type(asset['bytes']) is not int
                or not 0 < asset['bytes'] <= entry['limit']
                or not isinstance(asset['etag'], str) or not asset['etag'] or len(asset['etag']) > 256
                or any(ord(c) < 32 or ord(c) == 127 for c in asset['etag'])):
            raise ValueError('Changed catalog, unsafe path or invalid source bounds')
    if sum(a['bytes'] for a in plan['assets']) > TRANSFER_LIMIT:
        raise ValueError('Aggregate source transfer exceeds bound')
    return plan


def plan_source(video_id, split):
    if video_id != CAPTURE or split != SPLIT:
        raise ValueError('Only the approved teal-bedroom source is supported')
    assets = []
    for entry in _catalog():
        request = urllib.request.Request(entry['url'], method='HEAD')
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.geturl() != entry['url'] or response.status != 200:
                raise ValueError('Unexpected source redirect/status')
            assets.append({**entry, 'bytes': int(response.headers.get('Content-Length', '0')),
                           'etag': response.headers.get('ETag', '')})
    return _validate_plan({'kind': 'eva-scan-acquisition-v1', 'capture_id': video_id, 'split': split,
                           'repository_revision': REVISION, 'transfer_limit': TRANSFER_LIMIT,
                           'attempts': 1, 'assets': assets})


def _no_links(path):
    path = Path(path).absolute()
    if '..' in path.parts:
        raise ValueError('Parent traversal in scan source path')
    for part in (path, *path.parents):
        if part.is_symlink() or part.is_junction():
            raise ValueError('Linked scan source path')
    return path


def acquire_source(plan, output_dir, *, plan_file_sha256=None):
    _validate_plan(plan)
    return _acquire_assets(plan, output_dir, plan_file_sha256=plan_file_sha256)


def _acquire_assets(plan, output_dir, *, plan_file_sha256=None,
                    receipt_kind='eva-scan-acquisition-receipt-v2', disk_limit=None):
    """Shared writer; callers must first validate their closed, source-bound plan."""
    root = _no_links(output_dir)
    root.mkdir(parents=True, exist_ok=False)
    records, current, target = [], None, None
    path = root/'manifest.json'
    with (root/'acquisition.jsonl').open('xb') as journal:
        def note(event, **fields):
            row = (json.dumps({'event': event, 'time_utc': datetime.now(timezone.utc).isoformat(),
                              **fields}, allow_nan=False)+'\n').encode('utf-8')
            if journal.tell()+len(row) > 65536:
                raise ValueError('Acquisition journal exceeds bound')
            journal.write(row)
            journal.flush()
            os.fsync(journal.fileno())
        note('started', plan=plan, plan_file_sha256=plan_file_sha256, model_execution='not-run')
        try:
            if disk_limit is not None:
                # Exact bounded payloads plus two capped receipts; renames do not copy payloads.
                if sum(a['bytes'] for a in plan['assets'])+2*65536 > disk_limit:
                    raise ValueError('Acquisition exceeds output disk bound')
                if shutil.disk_usage(root).free < disk_limit:
                    raise ValueError('Insufficient free disk for bounded acquisition')
            for asset in plan['assets']:
                current = asset['role']
                folder = root/current
                folder.mkdir()
                target = folder/Path(asset['path']).name
                note('asset-started', role=current, path=target.relative_to(root).as_posix())
                record = download(asset['url'], target, asset['bytes'],
                                  expected={key: asset[key] for key in ('bytes', 'etag')})
                records.append({**asset, 'sha256': record['sha256']})
                note('asset-complete', role=current, bytes=record['bytes'], sha256=record['sha256'])
            current, target = None, None
            note('assets-complete', bytes=sum(a['bytes'] for a in records))
            manifest = {'kind': receipt_kind, 'capture_id': CAPTURE,
                        'plan': plan, 'assets': records, 'model_execution': 'not-run'}
            encoded = json.dumps(manifest, indent=2, allow_nan=False).encode('utf-8')
            if len(encoded) > 65536:
                raise ValueError('Acquisition manifest exceeds bound')
            with path.open('xb') as handle:
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
        except BaseException as error:
            # A killed worker leaves the preceding durable event and any .part, never a resume grant.
            try:
                part = target.with_suffix(target.suffix+'.part') if target else None
                note('failed', role=current, error_type=type(error).__name__, message=str(error)[:512],
                     http_status=getattr(error, 'code', None),
                     partial_bytes=part.stat().st_size if part and part.exists() else 0)
            except OSError:
                pass
            raise
    return path


_TYPES = {'float': ('f', None), 'float32': ('f', None), 'double': ('d', None), 'float64': ('d', None),
          'uchar': ('B', (0, 255)), 'uint8': ('B', (0, 255)),
          'int': ('i', (-2**31, 2**31-1)), 'int32': ('i', (-2**31, 2**31-1))}


def inspect_ply(data):
    """Parse one immutable byte snapshot; never allocate from unchecked headers."""
    if not isinstance(data, bytes) or not 0 < len(data) <= 32*MIB:
        raise ValueError('PLY byte limit')
    with io.BytesIO(data) as handle:
        used = 0
        def line():
            nonlocal used
            value = handle.readline(HEADER_LIMIT+1)
            used += len(value)
            if not value or used > HEADER_LIMIT:
                raise ValueError('PLY header limit/truncation')
            try:
                return value.decode('ascii').strip()
            except UnicodeError as error:
                raise ValueError('Invalid PLY header') from error
        if line() != 'ply':
            raise ValueError('Missing PLY signature')
        fmt = line()
        if fmt not in ('format ascii 1.0', 'format binary_little_endian 1.0'):
            raise ValueError('Unsupported PLY format')
        counts, properties, section, face_property = {}, [], None, False
        while True:
            row = line()
            if row == 'end_header':
                break
            fields = row.split()
            if fields and fields[0] in ('comment', 'obj_info'):
                continue
            if len(fields) == 3 and fields[0] == 'element':
                _, section, number = fields
                if section not in ('vertex', 'face') or section in counts or not number.isdecimal():
                    raise ValueError('Unsupported PLY elements')
                if (section == 'vertex' and counts) or (section == 'face' and 'vertex' not in counts):
                    raise ValueError('PLY element order')
                counts[section] = int(number)
                if not 0 < counts[section] <= (1000000 if section == 'vertex' else 2000000):
                    raise ValueError('PLY allocation count limit')
            elif section == 'vertex' and len(fields) == 3 and fields[0] == 'property':
                _, kind, name = fields
                if kind not in _TYPES or name not in ('x', 'y', 'z', 'nx', 'ny', 'nz', 'red', 'green', 'blue', 'alpha'):
                    raise ValueError('Unsupported PLY vertex layout')
                if name in [p[1] for p in properties]:
                    raise ValueError('Duplicate PLY property')
                properties.append((kind, name))
            elif (section == 'face' and fields == ['property', 'list', 'uchar', 'int', 'vertex_indices']
                  and not face_property):
                face_property = True
            else:
                raise ValueError('Unsupported PLY layout')
        names = [p[1] for p in properties]
        if set(counts) != {'vertex', 'face'} or not {'x', 'y', 'z'} <= set(names) or not face_property:
            raise ValueError('Missing PLY geometry')
        binary = 'binary' in fmt
        vertex_struct = struct.Struct('<'+''.join(_TYPES[k][0] for k, _ in properties))
        low, high = [math.inf]*3, [-math.inf]*3
        for _ in range(counts['vertex']):
            if binary:
                data = handle.read(vertex_struct.size)
                if len(data) != vertex_struct.size:
                    raise ValueError('Truncated PLY vertices')
                values = vertex_struct.unpack(data)
            else:
                row = handle.readline(1025)
                if len(row) > 1024:
                    raise ValueError('Oversized PLY vertex row')
                try:
                    values = [float(x) for x in row.split()]
                except ValueError as error:
                    raise ValueError('Malformed PLY vertex') from error
            if len(values) != len(properties) or not all(math.isfinite(v) for v in values):
                raise ValueError('Invalid PLY vertex')
            for (kind, name), value in zip(properties, values):
                band = _TYPES[kind][1]
                if band and (value != int(value) or not band[0] <= value <= band[1]):
                    raise ValueError('Out-of-range PLY scalar')
                if name in ('red', 'green', 'blue', 'alpha') and not 0 <= value <= 255:
                    raise ValueError('Out-of-range PLY color')
            for axis, name in enumerate(('x', 'y', 'z')):
                value = values[names.index(name)]
                if abs(value) > 10000:
                    raise ValueError('PLY coordinate limit')
                low[axis], high[axis] = min(low[axis], value), max(high[axis], value)
        for _ in range(counts['face']):
            if binary:
                data = handle.read(13)
                if len(data) != 13:
                    raise ValueError('Truncated PLY faces')
                face = struct.unpack('<Biii', data)
            else:
                row = handle.readline(129)
                if len(row) > 128:
                    raise ValueError('Oversized PLY face row')
                try:
                    face = [int(x) for x in row.split()]
                except ValueError as error:
                    raise ValueError('Malformed PLY face') from error
            if (len(face) != 4 or face[0] != 3 or len(set(face[1:])) != 3
                    or any(i < 0 or i >= counts['vertex'] for i in face[1:])):
                raise ValueError('Invalid PLY triangle indices')
        if handle.read(1):
            raise ValueError('Trailing PLY data')
    return {'vertices': counts['vertex'], 'faces': counts['face'], 'bounds': [low, high],
            'has_vertex_colors': {'red', 'green', 'blue'} <= set(names), 'format': fmt}


def inspect_source(manifest_path):
    path = _no_links(manifest_path)
    original = _read(path, 2*MIB)
    manifest = _json(original)
    if (set(manifest) != {'kind', 'capture_id', 'plan', 'assets', 'model_execution'}
            or manifest['kind'] not in ('eva-scan-acquisition-receipt-v1', 'eva-scan-acquisition-receipt-v2')
            or manifest['capture_id'] != CAPTURE or manifest['model_execution'] != 'not-run'):
        raise ValueError('Invalid source acquisition receipt')
    plan = _validate_plan(manifest['plan'])
    if not isinstance(manifest['assets'], list) or len(manifest['assets']) != len(plan['assets']):
        raise ValueError('Missing acquired assets')
    def verify_assets():
        mesh_bytes = None
        for asset, expected in zip(manifest['assets'], plan['assets']):
            if not isinstance(asset, dict) or set(asset) != set(expected) | {'sha256'}:
                raise ValueError('Invalid source asset record')
            if any(asset[k] != v for k, v in expected.items()):
                raise ValueError('Acquired source differs from plan')
            folder = path.parent/asset['role'] if manifest['kind'] == 'eva-scan-acquisition-receipt-v2' else path.parent
            data = _read(_no_links(folder/asset['path']), asset['bytes'])
            if len(data) != asset['bytes'] or hashlib.sha256(data).hexdigest() != asset['sha256']:
                raise ValueError('Source bytes changed')
            if asset['role'] == 'mesh':
                mesh_bytes = data
        return mesh_bytes
    report = inspect_ply(verify_assets())
    verify_assets()
    if _read(path, 2*MIB) != original:
        raise ValueError('Source manifest changed during inspection')
    return {'capture_id': CAPTURE, 'status': 'inspection-only', 'units': 'unverified',
            'source_sha256': digest(manifest), 'mesh': report,
            'limitations': ['Supplied dataset reconstruction, not an EVA model result.',
                            'Axes, metric calibration, bedroom coverage and quality require review.']}


def trajectory_camera_to_world(rotation_vector, translation):
    """Invert supplied axis-angle world-to-camera exactly once; no dataset-axis guess."""
    import cv2
    from worldmirror_adapter import _pose
    rotation, offset = np.asarray(rotation_vector), np.asarray(translation)
    if any(v.shape != (3,) or v.dtype.kind not in 'iuf' or not np.isfinite(v).all()
           or np.abs(v).max() > 10000 for v in (rotation, offset)):
        raise ValueError('Invalid trajectory rotation/translation')
    matrix = cv2.Rodrigues(rotation.astype(float))[0]
    pose = np.eye(4)
    pose[:3, :3] = matrix.T
    pose[:3, 3] = -matrix.T @ offset
    return _pose(pose)


def parse_scan_trajectory(data):
    """Read timestamp, axis-angle and translation rows; no last-match fallback."""
    if not isinstance(data, bytes) or not 0 < len(data) <= 2*MIB:
        raise ValueError('Trajectory byte limit')
    try:
        rows = data.decode('ascii').splitlines()
    except UnicodeError as error:
        raise ValueError('Invalid trajectory encoding') from error
    if not 1 <= len(rows) <= 100000:
        raise ValueError('Trajectory row limit')
    poses, seen = [], set()
    for row in rows:
        fields = row.split()
        if len(fields) != 7:
            raise ValueError('Expected timestamp, rotation and translation')
        values = [float(field) for field in fields]
        timestamp = values[0]
        if not math.isfinite(timestamp) or timestamp in seen:
            raise ValueError('Invalid or ambiguous trajectory timestamp')
        poses.append((timestamp, trajectory_camera_to_world(values[1:4], values[4:7])))
        seen.add(timestamp)
    return poses


def nearest_scan_pose(timestamp, poses):
    from worldmirror_adapter import _pose
    if (type(timestamp) not in (int, float) or not math.isfinite(timestamp)
            or not isinstance(poses, list) or not 1 <= len(poses) <= 100000):
        raise ValueError('Missing or invalid timestamp/poses')
    times = np.asarray([p[0] for p in poses])
    if times.dtype.kind not in 'iuf' or times.ndim != 1 or not np.isfinite(times).all():
        raise ValueError('Invalid pose timestamps')
    residual = np.abs(times-timestamp)
    nearest = int(np.argmin(residual))
    if (residual[nearest] > .005+1e-12
            or np.count_nonzero(np.isclose(residual, residual[nearest], atol=1e-12, rtol=0)) != 1):
        raise ValueError('Missing or ambiguous pose within five milliseconds')
    return _pose(poses[nearest][1]).copy()


def _scan_intrinsics(value):
    K = np.asarray(value)
    if (K.shape != (3, 3) or K.dtype.kind not in 'iuf' or not np.isfinite(K).all()
            or np.abs(K).max() > 10000 or not np.allclose(K[2], [0, 0, 1], atol=1e-9, rtol=0)
            or np.linalg.det(K[:2, :2]) <= 1e-9):
        raise ValueError('Invalid scan pixel calibration')
    return K.astype(float)


def rotate_scan_intrinsics(intrinsics, width, height, clockwise):
    K = _scan_intrinsics(intrinsics)
    if (type(width) is not int or type(height) is not int or min(width, height) < 1
            or max(width, height) > 640 or width*height > 640*480
            or type(clockwise) is not int or clockwise not in (0, 90, 180, 270)):
        raise ValueError('Invalid scan grid rotation')
    transforms = {0: np.eye(3), 90: [[0, -1, height-1], [1, 0, 0], [0, 0, 1]],
                  180: [[-1, 0, width-1], [0, -1, height-1], [0, 0, 1]],
                  270: [[0, 1, 0], [-1, 0, width-1], [0, 0, 1]]}
    return np.asarray(transforms[clockwise]) @ K


def project_scan_points(points, intrinsics, camera_to_world):
    """Project world points through the full pixel-grid matrix, including rotations."""
    from worldmirror_adapter import world_to_camera
    points = np.asarray(points)
    if (points.ndim != 2 or points.shape[1] != 3 or not 0 < len(points) <= 1000000
            or points.dtype.kind not in 'iuf' or not np.isfinite(points).all()):
        raise ValueError('Expected bounded finite scan XYZ points')
    K = _scan_intrinsics(intrinsics)
    camera = world_to_camera(points, camera_to_world)
    depth = camera[:, 2]
    valid = depth > 1e-6
    projected = camera @ K.T
    pixels = np.full((len(points), 2), np.nan)
    np.divide(projected[:, :2], projected[:, 2, None], out=pixels, where=valid[:, None])
    return pixels, depth, valid


def scan_depth_millimeters(value):
    depth = np.asarray(value)
    if (depth.ndim != 2 or not 0 < depth.size <= 640*480 or max(depth.shape) > 640
            or depth.dtype.kind not in 'ui' or (depth < 0).any() or (depth > 65535).any()):
        raise ValueError('Expected bounded integer millimeter depth')
    return depth.astype(float)/1000


def unproject_scan_depth(depth_m, intrinsics, camera_to_world):
    from worldmirror_adapter import _pose, camera_to_world as transform
    depth = np.asarray(depth_m)
    if (depth.ndim != 2 or not 0 < depth.size <= 640*480 or max(depth.shape) > 640
            or depth.dtype.kind != 'f'):
        raise ValueError('Expected bounded floating-point meter depth')
    K, pose = _scan_intrinsics(intrinsics), _pose(camera_to_world)
    yy, xx = np.indices(depth.shape)
    rays = np.stack((xx, yy, np.ones_like(xx)), -1) @ np.linalg.inv(K).T
    valid = np.isfinite(depth) & (depth > 0) & (depth <= 65.535)
    points = np.full((*depth.shape, 3), np.nan)
    points[valid] = transform(rays[valid]*depth[valid, None], pose)
    return points, valid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('plan', 'fetch', 'inspect'))
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--manifest', type=Path)
    args = parser.parse_args()
    try:
        if args.action == 'plan':
            result = plan_source(CAPTURE, SPLIT)
        elif args.action == 'fetch':
            if args.plan is None or args.output_dir is None:
                raise ValueError('fetch requires --plan and --output-dir')
            private = Path(__file__).resolve().parents[2]/'.local'/'reconstruction'
            output = _no_links(args.output_dir)
            if output != private/'arkitscenes'/CAPTURE/'scan-source-v1':
                raise ValueError('Use the fixed scan-source-v1 directory; no alternate retry directory')
            data = _read(args.plan, 2*MIB)
            plan_sha256 = hashlib.sha256(data).hexdigest()
            if plan_sha256 != ACQUISITION_PLAN_SHA256:
                raise ValueError('Acquisition plan bytes differ from the approved packet')
            result = {'manifest': str(acquire_source(_json(data), output, plan_file_sha256=plan_sha256))}
        else:
            if args.manifest is None:
                raise ValueError('inspect requires --manifest')
            result = inspect_source(args.manifest)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
