"""Bounded local RGB-D inspection; never admits a source or a calibrated candidate."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import struct
import sys

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
from PIL import Image

from scan_source import (_no_links, nearest_scan_pose, parse_scan_trajectory, project_scan_points,
                         rotate_scan_intrinsics, scan_depth_millimeters, unproject_scan_depth)
from vga_rgb_range import decode_payload
from worldmirror_candidate import _json, _read

DATA_ROOT = Path(__file__).resolve().parents[2]/'.local/reconstruction/arkitscenes/45261631'
MANIFESTS = {
    'pilot-rgb-six-v1': 'dc64fe061408e30bc81181471f4342d5fdf7d24521f6a36333e03a3e637e3426',
    'scan-source-v1': 'fb7ff713a6e0c9310ae20f32c7397377c7ac62a123214179dc2262091bd37a2f',
    'scan-rgbd-source-v1': '891220c930e61fe553e90ad3ec75eabdedf48b2b97fb423b5b4525cbbde20f73',
}
ARCHIVES = {
    'depth': ('lowres_depth', 'png'),
    'confidence': ('confidence', 'png'),
    'depth-intrinsics': ('lowres_wide_intrinsics', 'pincam'),
    'rgb-intrinsics': ('vga_wide_intrinsics', 'pincam'),
}

MIB = 1024**2
MEMBER_LIMIT = 4*MIB
DIRECTORY_SHA256 = 'bbbd8c288774abaca779967f3aef3c5cd49016a38a8122fd2900fea275370cdd'


def verify_file(path, binding):
    path = _no_links(path)
    if (type(binding.get('bytes')) is not int or not 0 < binding['bytes'] <= 160*MIB
            or not re.fullmatch('[0-9a-f]{64}', binding.get('sha256', ''))
            or not path.is_file() or path.stat().st_size != binding['bytes']):
        raise ValueError('Invalid source size or hash binding')
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        remaining = binding['bytes']
        while remaining:
            chunk = handle.read(min(MIB, remaining))
            if not chunk:
                raise ValueError('Truncated source')
            digest.update(chunk)
            remaining -= len(chunk)
        if handle.read(1) or digest.hexdigest() != binding['sha256']:
            raise ValueError('Source bytes changed')
    return path


def _extra(data):
    cursor = 0
    while cursor < len(data):
        if cursor+4 > len(data):
            raise ValueError('Truncated ZIP extra field')
        kind, size = struct.unpack_from('<HH', data, cursor)
        cursor += 4+size
        if kind == 1 or cursor > len(data):
            raise ValueError('ZIP64 or malformed ZIP extra field')


def _safe_name(raw):
    try:
        name = raw.decode('ascii')
    except UnicodeError as error:
        raise ValueError('Unsupported ZIP name encoding') from error
    parts = name.removesuffix('/').split('/')
    reserved = {'CON', 'PRN', 'AUX', 'NUL', *(f'COM{i}' for i in range(10)),
                *(f'LPT{i}' for i in range(10))}
    if (not name or len(name) > 255 or any(ord(c) < 32 or ord(c) == 127 for c in name)
            or any(c in name for c in '\\:<>"|?*')
            or any(not p or p in ('.', '..') or p.endswith((' ', '.'))
                   or p.split('.')[0].upper() in reserved for p in parts)):
        raise ValueError('Unsafe ZIP member name')
    return name


def archive_members(path, binding):
    path = verify_file(path, binding)
    with path.open('rb') as handle:
        tail_size = min(65557, binding['bytes'])
        handle.seek(binding['bytes']-tail_size)
        tail = handle.read(tail_size)
        pos = tail.rfind(b'PK\x05\x06')
        if pos < 0 or pos+22 > len(tail):
            raise ValueError('Missing ZIP end record')
        _, disk, cd_disk, local_count, count, size, offset, comment = struct.unpack_from('<4s4H2LH', tail, pos)
        if (disk or cd_disk or local_count != count or not 0 < count <= 20000
                or not 0 < size <= 8*MIB or pos+22+comment != len(tail)
                or offset+size != binding['bytes']-tail_size+pos):
            raise ValueError('Unsupported ZIP directory layout')
        handle.seek(offset)
        raw = handle.read(size)
    members, names, cursor = [], set(), 0
    for _ in range(count):
        if cursor+46 > len(raw):
            raise ValueError('Truncated ZIP central record')
        row = struct.unpack_from('<4s6H3L5H2L', raw, cursor)
        sig, made, needed, flags, method, _, _, crc, compressed, expanded, nl, el, cl, disk, _, external, start = row
        end = cursor+46+nl+el+cl
        if (sig != b'PK\x01\x02' or end > len(raw) or disk or needed > 20
                or flags not in (0, 2048) or method not in (0, 8)):
            raise ValueError('Unsupported ZIP member')
        name = _safe_name(raw[cursor+46:cursor+46+nl])
        mode = stat.S_IFMT(external >> 16)
        identity = name.rstrip('/').casefold()
        if identity in names or mode not in (0, stat.S_IFREG, stat.S_IFDIR):
            raise ValueError('Duplicate ZIP name or special file')
        if (name.endswith('/') and expanded != 0) or (mode == stat.S_IFDIR and not name.endswith('/')):
            raise ValueError('Invalid ZIP directory entry')
        names.add(identity)
        _extra(raw[cursor+46+nl:cursor+46+nl+el])
        if not 0 <= start < offset or max(compressed, expanded) > MEMBER_LIMIT:
            raise ValueError('ZIP member size or offset bound')
        members.append(dict(name=name, bytes=expanded, expanded_bytes=expanded,
                            compressed_bytes=compressed, flags=flags, method=method,
                            crc32=crc, header_offset=start))
        cursor = end
    if cursor != len(raw):
        raise ValueError('Unconsumed ZIP directory data')
    ordered = sorted(members, key=lambda entry: entry['header_offset'])
    for i, entry in enumerate(ordered):
        end = ordered[i+1]['header_offset'] if i+1 < len(ordered) else offset
        entry['next_header_offset'] = end
        if entry['header_offset']+30+len(entry['name'])+entry['compressed_bytes'] > end:
            raise ValueError('Overlapping ZIP member offsets')
    files = {entry['name'].casefold() for entry in members if not entry['name'].endswith('/')}
    for entry in members:
        parts = entry['name'].rstrip('/').casefold().split('/')
        if any('/'.join(parts[:i]) in files for i in range(1, len(parts))):
            raise ValueError('ZIP file used as directory')
    verify_file(path, binding)
    return members


def load_inputs():
    manifests = {}
    for folder, digest in MANIFESTS.items():
        data = _read(_no_links(DATA_ROOT/folder/'manifest.json'), 65536)
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError('Retained acquisition manifest changed')
        manifests[folder] = _json(data)
    assets = {}
    for folder in ('scan-source-v1', 'scan-rgbd-source-v1'):
        for record in manifests[folder]['assets']:
            if record['role'] in (*ARCHIVES, 'trajectory'):
                assets[record['role']] = {**record, 'file': DATA_ROOT/folder/record['role']/Path(record['path']).name}
    return {'assets': assets, 'rgb': manifests['pilot-rgb-six-v1'],
            'manifests': dict(MANIFESTS)}


def inspect_directories(inputs):
    inventories, summaries = {}, {}
    for role, (folder, suffix) in ARCHIVES.items():
        asset = inputs['assets'][role]
        entries = archive_members(asset['file'], asset)
        pattern = re.compile(re.escape(folder)+r'/45261631_(\d+\.\d{3})\.'+suffix)
        timed = []
        for entry in entries:
            if entry['name'] == folder+'/':
                continue
            match = pattern.fullmatch(entry['name'])
            if not match:
                raise ValueError('Unexpected capture or member in '+role)
            timed.append((int(match[1].replace('.', '')), entry))
        inventories[role] = timed
        summaries[role] = {'sha256': asset['sha256'], 'bytes': asset['bytes'],
                           'members': len(entries), 'frames': len(timed)}
    originals = inputs['rgb']['originals']
    if len(originals) != 6:
        raise ValueError('Exactly six retained conditioning views required')
    views, total, chosen = [], 0, {role: set() for role in ARCHIVES}
    for original in originals:
        match = re.fullmatch(r'45261631_(\d+\.\d{3})\.png', original['source_filename'])
        if not match:
            raise ValueError('Unexpected conditioning capture/timestamp')
        timestamp = int(match[1].replace('.', ''))
        view = {'rgb_id': original['id'], 'timestamp': timestamp/1000, 'members': {}, 'rejections': []}
        for role, entries in inventories.items():
            ranked = sorted(entries, key=lambda item: abs(item[0]-timestamp))
            if (not ranked or abs(ranked[0][0]-timestamp) > 5
                    or (len(ranked) > 1 and abs(ranked[1][0]-timestamp) == abs(ranked[0][0]-timestamp))):
                view['members'][role] = None
                view['rejections'].append(role+': missing or ambiguous member within 5 ms')
                continue
            time, entry = ranked[0]
            if entry['name'] in chosen[role]:
                raise ValueError('A member cannot condition two selected views')
            chosen[role].add(entry['name'])
            total += max(entry['bytes'], entry['compressed_bytes'])
            view['members'][role] = {**entry, 'timestamp': time/1000, 'delta_seconds': (time-timestamp)/1000}
        views.append(view)
    if total > 32*MIB:
        raise ValueError('Selected payload exceeds 32 MiB')
    return {'kind': 'eva-rgbd-directory-v1', 'capture_id': '45261631',
            'status': 'blocked' if any(v['rejections'] for v in views) else 'selected-not-decoded',
            'source_admitted': False, 'manifests': inputs['manifests'], 'archives': summaries,
            'selected_bytes': total, 'views': views}


def read_member(path, entry):
    if (not 0 < entry['expanded_bytes'] <= MEMBER_LIMIT
            or not 0 < entry['compressed_bytes'] <= MEMBER_LIMIT):
        raise ValueError('Selected member size bound')
    with _no_links(path).open('rb') as handle:
        handle.seek(entry['header_offset'])
        header = handle.read(30)
        if len(header) != 30:
            raise ValueError('Truncated local ZIP header')
        sig, needed, flags, method, _, _, crc, compressed, expanded, nl, el = struct.unpack('<4s5H3L2H', header)
        if (sig != b'PK\x03\x04' or needed > 20 or flags != entry['flags']
                or method != entry['method'] or crc != entry['crc32']
                or compressed != entry['compressed_bytes'] or expanded != entry['expanded_bytes']
                or nl != len(entry['name'].encode('ascii'))
                or entry['header_offset']+30+nl+el+compressed > entry['next_header_offset']):
            raise ValueError('Local ZIP header differs from admitted directory')
        if handle.read(nl) != entry['name'].encode('ascii'):
            raise ValueError('Local ZIP name differs from admitted directory')
        extra = handle.read(el)
        if len(extra) != el:
            raise ValueError('Truncated local ZIP extra')
        _extra(extra)
        return decode_payload(handle.read(compressed), entry)


def _png(data, size, bits, color):
    if (not 33 <= len(data) <= MEMBER_LIMIT or data[:16] != b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
            or struct.unpack('>IIBBBBB', data[16:29]) != (*size, bits, color, 0, 0, 0)):
        raise ValueError('Unsupported PNG type or dimensions')
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != 'PNG' or image.size != size or getattr(image, 'n_frames', 1) != 1:
                raise ValueError('Unsupported PNG format or animation')
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            if image.getexif().get(274, 1) != 1:
                raise ValueError('Unsupported PNG orientation')
            return np.array(image)
    except (OSError, SyntaxError) as error:
        raise ValueError('Invalid PNG content') from error


def decode_raster(data, role):
    if role not in ('depth', 'confidence'):
        raise ValueError('Unsupported raster role')
    pixels = _png(data, (256, 192), 16 if role == 'depth' else 8, 0)
    if (pixels.shape != (192, 256) or pixels.dtype.kind not in 'ui'
            or pixels.min() < 0 or pixels.max() > (65535 if role == 'depth' else 2)):
        raise ValueError('Invalid depth/confidence values')
    return pixels


def parse_intrinsics(data, size):
    if not 0 < len(data) <= 1024:
        raise ValueError('Intrinsics byte bound')
    try:
        values = np.asarray([float(v) for v in data.decode('ascii').split()])
    except (UnicodeError, ValueError) as error:
        raise ValueError('Invalid intrinsics encoding') from error
    if (values.shape != (6,) or not np.isfinite(values).all() or tuple(values[:2]) != size
            or not 0 < values[2] <= 10000 or not 0 < values[3] <= 10000
            or not 0 <= values[4] < size[0] or not 0 <= values[5] < size[1]):
        raise ValueError('Invalid intrinsics grid/focal length/principal point')
    _, _, fx, fy, cx, cy = values
    return np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1]])


def verify_rgb(record):
    if (record['source_path'] != 'source-originals/'+record['source_filename']
            or record['path'] != 'originals/'+record['id']+'.png'
            or not re.fullmatch(r'[A-Za-z0-9_]+', record['id'])
            or not re.fullmatch(r'45261631_\d+\.\d{3}\.png', record['source_filename'])
            or (record['source_width'], record['source_height'], record['width'], record['height']) != (640, 480, 480, 640)
            or record['normalization'] != {'exif_transpose': True, 'color_mode': 'RGB',
                                           'rotate_clockwise_degrees': 90, 'format': 'PNG'}):
        raise ValueError('Unsupported retained RGB normalization')
    arrays, bindings = [], []
    for prefix, key, size in [('source_', 'source_path', (640, 480)), ('', 'path', (480, 640))]:
        binding = {k: record[prefix+k] for k in ('bytes', 'sha256')}
        path = DATA_ROOT/'pilot-rgb-six-v1'/record[key]
        verify_file(path, binding)
        data = _read(path, MEMBER_LIMIT)
        if len(data) != binding['bytes'] or hashlib.sha256(data).hexdigest() != binding['sha256']:
            raise ValueError('RGB bytes changed during read')
        arrays.append(_png(data, size, 8, 2))
        bindings.append({**binding, 'file': path})
    if not np.array_equal(np.rot90(arrays[0], -1), arrays[1]):
        raise ValueError('Retained RGB normalization pixels differ')
    return bindings


def select_pose(timestamp, data):
    poses = parse_scan_trajectory(data)
    times = [row.split()[0] for row in data.decode('ascii').splitlines()]
    target = Decimal(timestamp)
    residuals = [abs(Decimal(time)-target) for time in times]
    best = min(residuals)
    if best > Decimal('.005') or residuals.count(best) != 1:
        raise ValueError(f'No unique pose within 5 ms; nearest residual {best}s')
    index = residuals.index(best)
    return times[index], nearest_scan_pose(poses[index][0], poses)


def prepare_selected(inputs, output, note):
    directory_path = DATA_ROOT/'scan-rgbd-directory-v1/manifest.json'
    raw = _read(_no_links(directory_path), 65536)
    if hashlib.sha256(raw).hexdigest() != DIRECTORY_SHA256:
        raise ValueError('Admitted directory manifest changed')
    directory = _json(raw)
    if (directory['status'] != 'selected-not-decoded' or directory['manifests'] != inputs['manifests']
            or len(directory['views']) != 6 or len(inputs['rgb']['originals']) != 6
            or directory['selected_bytes'] > 32*MIB):
        raise ValueError('Incomplete directory selection')
    for role in ARCHIVES:
        asset = inputs['assets'][role]
        if any(directory['archives'][role][k] != asset[k] for k in ('bytes', 'sha256')):
            raise ValueError('Archive differs from directory binding')
        verify_file(asset['file'], asset)
    trajectory = inputs['assets']['trajectory']
    verify_file(trajectory['file'], trajectory)
    trajectory_data = _read(trajectory['file'], 2*MIB)
    if hashlib.sha256(trajectory_data).hexdigest() != trajectory['sha256']:
        raise ValueError('Trajectory changed during read')
    pose_matches, rejected = [], []
    for original in inputs['rgb']['originals']:
        timestamp = original['source_filename'].removeprefix('45261631_').removesuffix('.png')
        try:
            pose_matches.append(select_pose(timestamp, trajectory_data))
        except ValueError as error:
            rejected.append(original['id'])
            note('pose-rejected', rgb_id=original['id'], reason=str(error)[:256])
    if rejected:
        raise ValueError('Pose checks failed: '+', '.join(rejected))
    views, rgb_bindings, outputs, total = [], [], [], 0
    for i, (view, original) in enumerate(zip(directory['views'], inputs['rgb']['originals'])):
        if view['rgb_id'] != original['id'] or view['rejections'] or set(view['members']) != set(ARCHIVES):
            raise ValueError('Selection differs from conditioning views')
        rgb_bindings.extend(verify_rgb(original))
        payloads, records = {}, {}
        for role, (_, suffix) in ARCHIVES.items():
            entry = view['members'][role]
            data = read_member(inputs['assets'][role]['file'], entry)
            total += max(len(data), entry['compressed_bytes'])
            if total > 32*MIB:
                raise ValueError('Selected payload exceeds 32 MiB')
            path = output/f'view{i:02d}-{role}.{suffix}'
            with path.open('xb') as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
            records[role] = {**entry, 'path': path.name, 'sha256': hashlib.sha256(data).hexdigest()}
            outputs.append({'file': path, 'bytes': len(data), 'sha256': records[role]['sha256']})
            payloads[role] = data
            note('member-written', view=i, role=role, sha256=records[role]['sha256'])
        depth = decode_raster(payloads['depth'], 'depth')
        confidence = decode_raster(payloads['confidence'], 'confidence')
        depth_K = parse_intrinsics(payloads['depth-intrinsics'], (256, 192))
        rgb_K = parse_intrinsics(payloads['rgb-intrinsics'], (640, 480))
        timestamp = original['source_filename'].removeprefix('45261631_').removesuffix('.png')
        pose_time, pose = pose_matches[i]
        rotated_K = rotate_scan_intrinsics(depth_K, 256, 192, 90)
        meters = scan_depth_millimeters(np.rot90(depth, -1))
        points, valid = unproject_scan_depth(meters, rotated_K, pose)
        raw_points, raw_valid = unproject_scan_depth(scan_depth_millimeters(depth), depth_K, pose)
        if (not np.array_equal(np.rot90(raw_valid, -1), valid)
                or not np.allclose(np.rot90(raw_points, -1), points, atol=1e-9, rtol=0, equal_nan=True)):
            raise ValueError('Raw-to-rotated depth rotation correspondence failed')
        if not valid.any():
            raise ValueError('No positive finite depth for calibration check')
        pixels, z, projected_valid = project_scan_points(points[valid], rotated_K, pose)
        yy, xx = np.nonzero(valid)
        pixel_error = float(np.max(np.abs(pixels-np.column_stack((xx, yy)))))
        depth_error = float(np.max(np.abs(z-meters[valid])))
        if (not projected_valid.all() or not np.isfinite(pixels).all() or not np.isfinite(z).all()
                or pixel_error > 1e-7 or depth_error > 1e-8):
            raise ValueError('Numerical calibration roundtrip failed')
        views.append({'rgb_id': original['id'], 'timestamp': timestamp, 'members': records,
            'rgb_source_sha256': original['source_sha256'], 'rgb_normalized_sha256': original['sha256'],
            'rgb_normalization_verified': True, 'pose_timestamp': pose_time,
            'pose_delta_seconds': float(Decimal(pose_time)-Decimal(timestamp)),
            'camera_to_world': pose.tolist(), 'depth_intrinsics_raw': depth_K.tolist(),
            'depth_intrinsics_rotated': rotated_K.tolist(), 'rgb_intrinsics_raw': rgb_K.tolist(),
            'rgb_intrinsics_rotated': rotate_scan_intrinsics(rgb_K, 640, 480, 90).tolist(),
            'valid_depth_pixels': int(valid.sum()), 'depth_range_m': [float(meters[valid].min()), float(meters[valid].max())],
            'confidence_counts': [int((confidence == n).sum()) for n in range(3)],
            'max_roundtrip_pixel_error': pixel_error, 'max_roundtrip_depth_error_m': depth_error})
        note('view-checked', view=i)
    load_inputs()
    for binding in [*inputs['assets'].values(), *rgb_bindings, *outputs]:
        verify_file(binding['file'], binding)
    if _read(_no_links(directory_path), 65536) != raw:
        raise ValueError('Admitted directory changed during preparation')
    # Raw outputs <=32 MiB; two capped JSON files keep the complete output below 64 MiB.
    return {'kind': 'eva-rgbd-preparation-v1', 'capture_id': '45261631',
        'status': 'prepared-not-registered', 'source_admitted': False,
        'directory_sha256': DIRECTORY_SHA256, 'manifests': inputs['manifests'],
        'archives': directory['archives'], 'trajectory': {k: trajectory[k] for k in ('bytes', 'sha256')},
        'selected_bytes': total, 'rotation_clockwise_degrees': 90,
        'depth_units': 'uint16 millimeters divided by 1000 to meters; zero invalid',
        'pose_convention': 'supplied axis-angle world-to-camera inverted exactly once',
        'pixel_convention': 'integer pixel centers; full left-multiplied 90-degree clockwise grid transform',
        'calibration_evidence': {
            'status': 'numerical-assumptions-not-physical-validation',
            'official_revision': '474aaa83d7b1c9080619d8485de2d7c885c01fc5',
            'official_files': ['DATA.md', 'raw/README.md', 'threedod/benchmark_scripts/utils/tenFpsDataLoader.py'],
            'loader_based_assumptions': ['depth is camera-Z, not ray distance',
                'lowres_wide intrinsics and trajectory are used for lowres_depth'],
            'numerical_conventions': ['integer pixel centers', 'camera x-right/y-down/z-forward'],
            'rgb_pose_correspondence': 'unverified; pose applies only to depth checks'},
        'physical_rgb_depth_registration': 'unverified; no resize-based alignment or texture projection',
        'limitations': ['Numerical self-consistency is not independent physical accuracy.',
                        'No candidate frame, room boundary, source admission or held-out evaluation.'],
        'views': views}


def _write_report(path, report):
    data = (json.dumps(report, indent=2, allow_nan=False)+'\n').encode('utf-8')
    if len(data) > 65536:
        raise ValueError('Preparation report exceeds bound')
    with path.open('xb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())


def run_stage(stage, input_path, output_dir):
    if stage not in ('directory', 'prepare'):
        raise ValueError('Unsupported local preparation stage')
    output = _no_links(output_dir)
    source_folder = 'scan-rgbd-source-v1' if stage == 'directory' else 'scan-rgbd-directory-v1'
    if (output != DATA_ROOT/f'scan-rgbd-{stage}-v1'
            or _no_links(input_path) != DATA_ROOT/source_folder/'manifest.json'):
        raise ValueError('Use the fixed input and one-attempt output paths')
    output.mkdir(exist_ok=False)
    with (output/'preparation.jsonl').open('xb') as journal:
        def note(event, **fields):
            data = (json.dumps({'event': event, 'time_utc': datetime.now(timezone.utc).isoformat(),
                                **fields}, allow_nan=False)+'\n').encode('utf-8')
            if journal.tell()+len(data) > 65536:
                raise ValueError('Preparation journal exceeds bound')
            journal.write(data)
            journal.flush()
            os.fsync(journal.fileno())
        note('started', stage=stage)
        try:
            inputs = load_inputs()
            if stage == 'directory':
                report = inspect_directories(inputs)
                load_inputs()
                for role in ARCHIVES:
                    asset = inputs['assets'][role]
                    verify_file(asset['file'], asset)
            else:
                report = prepare_selected(inputs, output, note)
            note('complete', status=report['status'])
            _write_report(output/'manifest.json', report)
        except BaseException as error:
            note('failed', error_type=type(error).__name__, message=str(error)[:512])
            raise
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=('directory', 'prepare'))
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        report = run_stage(args.stage, args.input, args.output_dir)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps({'status': report['status'], 'source_admitted': False}))


if __name__ == '__main__':
    main()
