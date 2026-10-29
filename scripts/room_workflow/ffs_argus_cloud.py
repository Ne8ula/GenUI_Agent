"""Offline plans for separately approved Modal panorama preflight or native-padding inspection; no inference."""
import argparse
import asyncio
import copy
import hashlib
import importlib.metadata
import io
import json
from pathlib import Path
import re
import sys

if __package__ in (None, ''):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from ffs_argus import SOURCE, SOURCE_SHA256, worker

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT.parents[1] / '.local/reconstruction/ffs-th0028-argus-preflight-v1'
REGIONS_OUTPUT = ROOT.parents[1] / '.local/reconstruction/ffs-th0028-argus-regions-v1'
RESOURCES = {'gpu': None, 'cpu': 2, 'memory_mib': 8192, 'timeout_seconds': 300,
    'startup_timeout_seconds': 300, 'client_timeout_seconds': 900, 'max_containers': 1,
    'retries': 0, 'operational_allowance_usd': 1, 'provider_enforced_dollar_cap': False}
CODE = ('ffs_argus.py', 'ffs_argus_cloud.py', 'ffs_fetch.py', 'pilot.py',
        'scan_correspondence_cloud.py', 'worldmirror_transfer_probe.py')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(*, regions=False):
    if type(regions) is not bool:
        raise ValueError('Invalid inspection mode')
    plan = {'kind': 'eva-ffs-argus-preflight-plan-v1', 'execution_authorized': False,
        'source': copy.deepcopy(SOURCE), 'resources': RESOURCES.copy(),
        'implementation_sha256': {name: sha((ROOT / name).read_bytes()) for name in CODE},
        'sdk': 'modal==1.6.1', 'python_version': '3.12.12', 'packages': ['pillow==11.2.1'],
        'license': 'FFS CC-BY-NC-SA-4.0',
        'scope': 'One CPU container acquires only the full panorama, checks CRC/header/decoding, '
                 'and returns a JPEG review preview plus hashes. No models, scan, inventory, app registration or persistent volume.',
        'limitations': ['Source bytes stay in temporary cloud storage; local outputs are a preview and receipt only.',
            '2:1 dimensions do not establish projection, valid pixels, registration or single-view quality.',
            'Inspect the full image preview and missing regions before preparing Argus inference.',
            'Fresh exact-plan spending approval required. Operational allowance is not a provider hard-dollar cap.',
            'One submission, no configured retries. Infrastructure restarts are not an exactly-once guarantee.']}
    if regions:
        plan.update(kind='eva-ffs-argus-regions-plan-v1', expected_input_sha256=SOURCE_SHA256,
            scope='One CPU container reacquires the exact panorama, verifies the prior SHA256 and CRC, '
                  'and inspects native-resolution exact-white bottom rows before preview resizing. '
                  'Returns only the bounded JPEG and diagnostic JSON. No models, scan upload, calibration claim, '
                  'geometry, app registration or persistent volume.')
        plan['limitations'].append('White padding is only a candidate; all other pixels remain unclassified. '
                                  'This stage cannot establish angular calibration or admit an inference source.')
    return plan


def create(*, regions=False):
    if importlib.metadata.version('modal') != '1.6.1':
        raise ValueError('Reviewed Modal SDK version changed')
    import modal
    image = (modal.Image.debian_slim(python_version='3.12.12').pip_install('pillow==11.2.1')
             .add_local_python_source('ffs_fetch', 'ffs_argus'))
    app = modal.App('eva-ffs-argus-regions' if regions else 'eva-ffs-argus-preflight')
    fn = app.function(image=image, cpu=(2, 2), memory=(8192, 8192), timeout=300, startup_timeout=300,
        max_containers=1, scaledown_window=2, restrict_modal_access=True,
        single_use_containers=True, secrets=[], name='preflight')(worker)
    return app, fn


async def receive(stream, output, *, regions=False):
    from PIL import Image
    from scan_correspondence_cloud import _object
    seen = set()
    for_name = {'preview.jpg': 1024**2, 'report.json': 16384}
    async for row in stream:
        if (type(row) not in (tuple, list) or len(row) != 2 or type(row[0]) is not str
                or row[0] not in for_name or row[0] in seen or type(row[1]) is not bytes
                or not 0 < len(row[1]) <= for_name[row[0]]):
            raise ValueError('Invalid or oversized preflight return')
        name, data = row
        with (output / name).open('xb') as file:
            file.write(data)
        seen.add(name)
    if seen != set(for_name):
        raise ValueError('Incomplete preflight results')
    report = json.loads((output / 'report.json').read_bytes(), object_pairs_hook=_object)
    if not isinstance(report, dict) or set(report) != {'kind', 'source', 'input', 'preview', 'source_admitted', 'inference_run'}:
        raise ValueError('Unknown preflight report fields')
    info, preview_meta = report['input'], report['preview']
    preview = (output / 'preview.jpg').read_bytes()
    kind = 'eva-ffs-argus-regions-result-v1' if regions else 'eva-ffs-argus-preflight-result-v1'
    fields = {'width', 'height', 'sha256', 'bytes', 'projection_verified', 'meaning'}
    if regions:
        fields.add('padding')
    if (report['kind'] != kind or report['source'] != SOURCE
            or report['source_admitted'] is not False or report['inference_run'] is not False
            or not isinstance(info, dict) or set(info) != fields
            or (info['width'], info['height'], info['bytes']) != (20288, 10144, SOURCE['bytes'])
            or info['projection_verified'] is not False or type(info['sha256']) is not str
            or not re.fullmatch('[a-f0-9]{64}', info['sha256'])
            or info['meaning'] != '2:1 raster only; spherical coverage and missing regions require review'
            or preview_meta != {'bytes': len(preview), 'sha256': sha(preview)}):
        raise ValueError('Preflight source, claims or integrity mismatch')
    if regions:
        padding = info['padding']
        if info['sha256'] != SOURCE_SHA256 or type(padding) is not dict:
            raise ValueError('Native inspection source hash or padding report mismatch')
        rows = padding.get('candidate_padding_rows')
        if rows is not None and (type(rows) is not list or len(rows) != 2
                or any(type(row) is not int for row in rows)
                or not 0 <= rows[0] < rows[1] or rows[1] != 10144):
            raise ValueError('Invalid native padding rows')
        first = 10144 if rows is None else rows[0]
        expected = {'width': 20288, 'height': 10144, 'row_convention': 'half-open native rows',
            'candidate_padding_rows': rows, 'unclassified_rows': [0, first] if first else None,
            'projection_verified': False, 'source_admitted': False,
            'unsupported_geometry': 'unknown; no geometry emitted'}
        unclassified = padding.get('unclassified_rows')
        if (padding != expected
                or any(type(padding[key]) is not int for key in ('width', 'height'))
                or (unclassified is not None and (type(unclassified) is not list
                    or any(type(row) is not int for row in unclassified)))
                or padding['projection_verified'] is not False
                or padding['source_admitted'] is not False):
            raise ValueError('Native padding fields or conservative claims mismatch')
    with Image.open(io.BytesIO(preview)) as image:
        if image.format != 'JPEG' or image.width != image.height * 2 or not 0 < image.width <= 2048:
            raise ValueError('Unbounded or distorted preview')
        image.load()
    return report


async def run(app, fn, output, receipt, save, *, regions=False):
    from worldmirror_transfer_probe import stop_app
    async with app.run.aio(detach=False):
        receipt.update(status='submitted', app_id=app.app_id)
        stream, failure = None, None
        try:
            save()
            stream = fn.remote_gen.aio(SOURCE.copy(), regions=True) if regions else fn.remote_gen.aio(SOURCE.copy())
            receipt['report'] = await receive(stream, output, regions=regions)
        except BaseException as error:
            failure = error
        finally:
            try:
                receipt['cleanup'] = stop_app(app.app_id)
            except Exception as error:
                receipt['cleanup'] = {'state': 'unconfirmed', 'error_type': type(error).__name__}
                if failure is None:
                    failure = error
            try:
                if stream is not None:
                    await asyncio.wait_for(stream.aclose(), 5)
            except Exception as error:
                receipt['stream_close_error_type'] = type(error).__name__
                if failure is None:
                    failure = error
            result = 'regions-returned-and-stopped-needs-review' if regions else 'preview-returned-and-stopped-needs-review'
            receipt['status'] = 'failed-or-uncertain' if failure else result
            save()
        if failure is not None:
            raise failure


def execute(plan_path, approved_sha256, approved_dollars, *, regions=False):
    from pilot import load_json, encoded
    from scan_correspondence_cloud import _no_links
    from worldmirror_transfer_probe import stop_app
    if type(approved_dollars) not in (int, float) or approved_dollars != 1:
        raise ValueError('Fresh exact $1 operational approval required')
    plan, raw = load_json(_no_links(plan_path), 65536)
    if sha(raw) != approved_sha256 or plan != prepare(regions=regions):
        raise ValueError('Approved plan or source code changed')
    output = _no_links(REGIONS_OUTPUT if regions else OUTPUT)
    output.mkdir(exist_ok=False)
    receipt = {'status': 'reserved-before-build', 'plan_sha256': sha(raw),
               'approved_dollars': approved_dollars, 'app_id': None, 'source_admitted': False}
    def save():
        (output / 'receipt.json').write_bytes(encoded(receipt))
    save()
    app = None
    try:
        with (output / 'plan.json').open('xb') as file:
            file.write(raw)
        app, fn = create(regions=regions)
        asyncio.run(asyncio.wait_for(run(app, fn, output, receipt, save, regions=regions), RESOURCES['client_timeout_seconds']))
    except BaseException as error:
        receipt.update(status='failed-or-uncertain', error_type=type(error).__name__)
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
    from pilot import encoded
    from scan_correspondence_cloud import _no_links
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--regions', action='store_true', help='Use the separately approved native-padding inspection stage')
    parser.add_argument('--approved-plan-sha256')
    parser.add_argument('--approved-dollars', type=float)
    parser.add_argument('--confirm-billable', action='store_true')
    args = parser.parse_args()
    if args.confirm_billable:
        if not args.approved_plan_sha256:
            parser.error('Exact reviewed plan hash required')
        print(json.dumps(execute(args.plan, args.approved_plan_sha256, args.approved_dollars, regions=args.regions)))
    else:
        if args.approved_plan_sha256 or args.approved_dollars is not None:
            parser.error('Offline planning takes only --plan')
        raw = encoded(prepare(regions=args.regions))
        with _no_links(args.plan).open('xb') as file:
            file.write(raw)
        print(json.dumps({'status': 'offline-plan-only', 'plan_sha256': sha(raw)}))
