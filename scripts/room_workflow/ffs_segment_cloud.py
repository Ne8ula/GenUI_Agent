"""One approved Modal CPU run: deterministic seed-guided segments of the catalogued th_0028 scan around its 9 markers.
Returns segments/summary.json and one little-endian uint32 index list per marker (original PLY order).
Approximate regions for owner review, not object identification."""
import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import importlib.metadata
from itertools import product
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent.parent
OUTPUT = ROOT / '.local/reconstruction/ffs-th0028-segments-v2'  # v1 holds the first run and its receipt
V1_RETURNED = '.local/reconstruction/ffs-th0028-segments-v1/returned/'
CORE = Path(__file__).with_name('ffs_segment.py')
PACKAGES = ('numpy==2.2.6',)
RESOURCES = {'cpu': 2, 'memory_mib': 4096, 'timeout': 600, 'startup_timeout': 600,
             'client_timeout': 1500, 'max_containers': 1, 'retries': 0,
             'operational_allowance_usd': 1, 'provider_enforced_dollar_cap': False}
MARKERS = tuple(f'marker-{i:02d}' for i in range(1, 10))
VERTICES = 712312
HEADER = ('ply\nformat binary_little_endian 1.0\nelement vertex {}\nproperty float x\nproperty float y\n'
          'property float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n')
MAX_BYTES = 4 * 1024**2
NAME = re.compile(r'(summary\.json|marker-\d\d\.u32)')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def inputs():
    catalog = json.loads((ROOT / 'scripts/room_workflow/ffs-resources.json').read_text())
    found = {}
    for key in ('scene.ply', 'tags.json'):
        path = ROOT / catalog[key]['path']
        if path.is_symlink() or sha(path.read_bytes()) != catalog[key]['sha256']:
            raise ValueError('Catalogued input changed')
        found[key] = path
    if tuple(marker['id'] for marker in json.loads(found['tags.json'].read_text())['markers']) != MARKERS:
        raise ValueError('Expected markers 01-09')
    return found


def prepare():
    OUTPUT.mkdir(exist_ok=False)
    folder = OUTPUT / 'inputs'
    folder.mkdir()
    for name, path in inputs().items():
        shutil.copyfile(path, folder / name)
    shutil.copyfile(CORE, folder / CORE.name)  # the pinned copy is what the image mounts
    plan = {'kind': 'eva-ffs-segments-v1', 'created_at': datetime.now(timezone.utc).isoformat(),
            'packages': list(PACKAGES), 'resources': RESOURCES, 'markers': list(MARKERS),
            'inputs': {p.name: sha(p.read_bytes()) for p in sorted(folder.iterdir())},
            'adapter_sha256': sha(Path(__file__).read_bytes()), 'core_sha256': sha(CORE.read_bytes()),
            'approval': 'Owner approved a second one-time CPU segmentation run after tightening ($1), no retries',
            'scope': 'Public CC BY-NC-SA FFS scan only; approximate regions for owner review, not identification'}
    (OUTPUT / 'plan.json').write_text(json.dumps(plan, indent=2), encoding='utf-8')
    return plan


def worker(folder='/inputs'):
    import numpy as np
    import ffs_segment as core
    data = (Path(folder) / 'scene.ply').read_bytes()
    header = HEADER.format(VERTICES).encode()
    dtype = np.dtype([('x', '<f4'), ('y', '<f4'), ('z', '<f4'), ('red', 'u1'), ('green', 'u1'), ('blue', 'u1')])
    if not data.startswith(header) or len(data) != len(header) + VERTICES * dtype.itemsize:
        raise ValueError('Unexpected PLY layout')
    rows = np.frombuffer(data, dtype, offset=len(header))
    tags = json.loads((Path(folder) / 'tags.json').read_text())
    markers = {marker['id']: marker for marker in tags['markers']}
    if tuple(markers) != MARKERS:
        raise ValueError('Expected markers 01-09')
    rotation = float(tags['crop']['rotation_z'])
    points = core.display(np.column_stack((rows['x'], rows['y'], rows['z'])), rotation)
    seeds = {name: core.display(np.array([m['centroid']]), rotation)[0] for name, m in markers.items()}
    bounds = {}
    for name, m in markers.items():
        # display() rotates XY, so an axis-aligned box needs all 8 corners transformed.
        corners = core.display(np.array(list(product(*zip(m['bounds_min'], m['bounds_max'])))), rotation)
        bounds[name] = (corners.min(axis=0), corners.max(axis=0))
    segments = core.segment(points, seeds, bounds)
    # Same deterministic floor fit segment() uses internally (seed 0), recomputed because segment() does not return it.
    candidates = points[points[:, 2] < min(seed[2] for seed in seeds.values()) + core.FLOOR_SEED_MARGIN]
    normal, offset, _ = core._ransac(candidates, core.PLANE_BAND, core.RANSAC_ITERATIONS, 0, 'floor')
    summary = {'params': {'rotation_z': rotation, 'display_z_offset': core.DISPLAY_Z_OFFSET, 'plane_band': core.PLANE_BAND,
                          'voxel_size': core.VOXEL_SIZE, 'seed_radius': core.SEED_RADIUS, 'max_reach': core.MAX_REACH,
                          'max_height': core.MAX_HEIGHT, 'floor_contact': [core.FLOOR_CONTACT_MIN, core.FLOOR_CONTACT_MAX],
                          'vertices': VERTICES},
               'revision': {'adapter_sha256': sha(Path(__file__).read_bytes()), 'core_sha256': sha(Path(core.__file__).read_bytes())},
               'floor': {'normal': normal.tolist(), 'offset': offset}, 'markers': {}, 'files': {}}
    for name, result in segments.items():
        (lx, ly, lz), (ux, uy, _) = result['bbox']
        floor_z = -(normal[0] * (lx + ux) / 2 + normal[1] * (ly + uy) / 2 + offset) / normal[2]
        summary['markers'][name] = {'tag': markers[name].get('tag'), 'count': result['count'], 'bbox': result['bbox'],
                                    'height': result['height'], 'flags': result['flags'], 'seed_distance': result['seed_distance'],
                                    'base_above_floor': float(lz - floor_z) if result['count'] else 0.0}
        data = result['indices'].astype('<u4').tobytes()
        summary['files'][name + '.u32'] = sha(data)
        yield (name + '.u32', data)
    yield ('summary.json', json.dumps(summary, indent=2).encode())


async def receive(stream, output):
    import numpy as np
    seen = set()
    async for record in stream:
        if (type(record) not in (tuple, list) or len(record) != 2 or not isinstance(record[0], str)
                or not NAME.fullmatch(record[0]) or record[0] in seen or type(record[1]) is not bytes
                or not len(record[1]) <= MAX_BYTES or len(seen) >= len(MARKERS) + 1):
            raise ValueError('Invalid returned record')
        seen.add(record[0])
        with (output / record[0]).open('xb') as file:
            file.write(record[1])
    summary = json.loads((output / 'summary.json').read_text())
    if (seen != {'summary.json'} | {name + '.u32' for name in MARKERS} or set(summary['markers']) != set(MARKERS)
            or set(summary['files']) != seen - {'summary.json'}):
        raise ValueError('Incomplete segment results')
    for name, meta in summary['markers'].items():
        path = output / (name + '.u32')
        indices = np.fromfile(path, dtype='<u4')
        if (len(indices) * 4 != path.stat().st_size or len(indices) != meta['count']
                or (len(indices) and indices.max() >= VERTICES) or sha(path.read_bytes()) != summary['files'][path.name]):
            raise ValueError('Segment result integrity failure')
    return {'files': {name: {'sha256': sha((output / name).read_bytes()), 'bytes': (output / name).stat().st_size}
                      for name in sorted(seen)}}


def register(output, report, catalog_path=ROOT / 'scripts/room_workflow/ffs-resources.json'):
    """Adds verified results to the broker's hash-checked catalogue in one atomic write.
    A complete v1 `segments/` set is moved unchanged to `segments-v1/`; any other existing segment state is refused."""
    catalog = json.loads(catalog_path.read_text())
    existing = sorted(key for key in catalog if key.startswith('segments/'))
    if existing:
        names = {'summary.json'} | {marker + '.u32' for marker in MARKERS}
        if ({key.removeprefix('segments/') for key in existing} != names
                or any(catalog[key].get('path') != V1_RETURNED + key.removeprefix('segments/') for key in existing)
                or any(key.startswith('segments-v1/') for key in catalog)):
            raise ValueError('Unexpected existing segment catalogue state')
        for key in existing:
            catalog['segments-v1/' + key.removeprefix('segments/')] = catalog.pop(key)
    for name, meta in sorted(report['files'].items()):
        key = 'segments/' + name
        if key in catalog:
            raise ValueError('Segment catalogue entry already exists')
        catalog[key] = {'path': (output / name).relative_to(ROOT).as_posix(), 'sha256': meta['sha256'], 'bytes': meta['bytes'],
                        'type': 'application/json' if name.endswith('.json') else 'application/octet-stream'}
    staged = catalog_path.with_name(catalog_path.name + '.tmp')
    staged.write_text(json.dumps(catalog, indent=2) + '\n', encoding='utf-8')
    staged.replace(catalog_path)


def create(folder):
    import modal
    image = (modal.Image.debian_slim(python_version='3.12').pip_install(*PACKAGES)
        .add_local_file(folder / 'scene.ply', '/inputs/scene.ply', copy=False)
        .add_local_file(folder / 'tags.json', '/inputs/tags.json', copy=False)
        .add_local_file(folder / CORE.name, '/root/ffs_segment.py', copy=False))
    app = modal.App('eva-ffs-segment')
    # Generator functions reject even retries=0; omission means no configured retries.
    fn = app.function(image=image, cpu=(2, 2), memory=(4096, 4096), timeout=600, startup_timeout=600,
        max_containers=1, scaledown_window=2, block_network=True, restrict_modal_access=True,
        single_use_containers=True, secrets=[], name='segment')(worker)
    return app, fn


def execute(approved_hash):
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    raw = (OUTPUT / 'plan.json').read_bytes()
    plan = json.loads(raw)
    folder = OUTPUT / 'inputs'
    if (sha(raw) != approved_hash or plan['resources'] != RESOURCES or plan['adapter_sha256'] != sha(Path(__file__).read_bytes())
            or plan['core_sha256'] != sha(CORE.read_bytes())
            or {p.name: sha(p.read_bytes()) for p in sorted(folder.iterdir())} != plan['inputs']):
        raise ValueError('Plan or implementation changed')
    receipt_path = OUTPUT / 'receipt.json'
    receipt = {'status': 'reserved', 'plan_sha256': approved_hash, 'app_id': None, 'approved_dollars': 1}
    with receipt_path.open('x', encoding='utf-8') as file:
        json.dump(receipt, file)
    save = lambda: receipt_path.write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    app = None
    try:
        if str(Path(__file__).parent) not in sys.path:
            sys.path.insert(0, str(Path(__file__).parent))
        from worldmirror_transfer_probe import stop_app
        import modal
        app, fn = create(folder)
        async def run():
            async with app.run.aio(detach=False):
                receipt.update(status='submitted', app_id=app.app_id); save()
                output = OUTPUT / 'returned'; output.mkdir()
                try:
                    receipt['report'] = await receive(fn.remote_gen.aio(), output)
                    receipt['status'] = 'segments-returned'
                    revision = json.loads((output / 'summary.json').read_text())['revision']
                    if revision != {'adapter_sha256': plan['adapter_sha256'], 'core_sha256': plan['core_sha256']}:
                        raise ValueError('Returned revision does not match the approved plan')
                    register(output, receipt['report'])
                finally:
                    receipt['cleanup'] = stop_app(app.app_id); save()
        with modal.enable_output():
            asyncio.run(asyncio.wait_for(run(), timeout=RESOURCES['client_timeout']))
    except BaseException as error:
        receipt.update(status='failed-or-uncertain', error_type=type(error).__name__, error=str(error)[:1000])
        if app is not None and app.app_id and 'cleanup' not in receipt:
            try:
                receipt['cleanup'] = stop_app(app.app_id)
            except Exception as cleanup_error:
                receipt['cleanup'] = {'state': 'unconfirmed', 'error_type': type(cleanup_error).__name__}
        save()
        raise
    save()
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-approved-plan-sha256')
    args = parser.parse_args()
    result = execute(args.execute_approved_plan_sha256) if args.execute_approved_plan_sha256 else prepare()
    print(json.dumps(result, indent=2))
